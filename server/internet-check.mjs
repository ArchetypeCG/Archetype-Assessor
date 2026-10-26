const words = (text) =>
  String(text)
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || [];
const plain = (value) =>
  String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
function safeSource(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function internetPassages(text) {
  const cleaned = String(text)
    .replace(
      /\b(?:api[_ -]?key|password|access[_ -]?token|secret)\s*[:=]\s*\S+/gi,
      " ",
    )
    .replace(/\bbearer\s+\S+/gi, " ")
    .replace(/\S+@\S+\.\S+/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b\d[\d\s-]{7,}\d\b/g, " ");
  const tokens = words(cleaned).filter((w) => w.length < 35);
  if (tokens.length < 80) return [];
  const starts = [
    0,
    Math.floor(tokens.length / 3),
    Math.floor((tokens.length * 2) / 3),
    Math.max(0, tokens.length - 12),
  ];
  return [
    ...new Set(
      starts
        .map((n) => tokens.slice(n, n + 12).join(" "))
        .filter((s) => s.split(" ").length >= 8),
    ),
  ].slice(0, 4);
}
function rssResults(xml) {
  if (!/<rss\b/i.test(xml)) throw Error("Invalid search response");
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .map(([, item]) => {
      const field = (name) =>
        plain(
          item.match(
            new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"),
          )?.[1] || "",
        );
      return {
        title: field("title"),
        url: safeSource(field("link")),
        snippet: field("description"),
      };
    })
    .filter((r) => r.url);
}
async function readBounded(response) {
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw Object.assign(Error("Search unavailable"), {
      status: response.status,
    });
  }
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1000000) throw Error("Search response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
export async function checkInternet(
  text,
  { enabled = false, provider = "bing", apiKey = "", fetchImpl = fetch } = {},
) {
  const name = provider === "brave" ? "Brave Search" : "Bing";
  if (!enabled)
    return {
      status: "Not enabled",
      provider: name,
      matches: [],
      searchedPassages: 0,
      matchedPassages: 0,
      passageMatchPercent: null,
    };
  if (!["bing", "brave"].includes(provider))
    return {
      status: "Provider unavailable",
      matches: [],
      searchedPassages: 0,
      matchedPassages: 0,
      passageMatchPercent: null,
    };
  if (provider === "brave" && !apiKey)
    return {
      status: "Search key required",
      provider: name,
      matches: [],
      searchedPassages: 0,
      matchedPassages: 0,
      passageMatchPercent: null,
    };
  const passages = internetPassages(text);
  if (!passages.length)
    return {
      status: "More readable text needed",
      provider: name,
      matches: [],
      searchedPassages: 0,
      matchedPassages: 0,
      passageMatchPercent: null,
    };
  let searched = 0,
    matched = 0,
    failed = 0;
  const matches = [];
  for (const passage of passages) {
    try {
      const query = `"${passage}"`,
        url =
          provider === "brave"
            ? "https://api.search.brave.com/res/v1/web/search?q=" +
              encodeURIComponent(query) +
              "&count=5"
            : "https://www.bing.com/search?format=rss&q=" +
              encodeURIComponent(query);
      const response = await fetchImpl(url, {
        headers:
          provider === "brave"
            ? { Accept: "application/json", "X-Subscription-Token": apiKey }
            : { Accept: "application/rss+xml, application/xml, text/xml" },
        signal: AbortSignal.timeout(4500),
        redirect: "error",
      });
      const body = await readBounded(response);
      let results;
      if (provider === "brave") {
        const data = JSON.parse(body);
        if (!data.web || !Array.isArray(data.web.results))
          throw Error("Invalid search response");
        results = data.web.results
          .map((r) => ({
            title: plain(r.title),
            url: safeSource(r.url),
            snippet: plain(r.description),
          }))
          .filter((r) => r.url);
      } else results = rssResults(body);
      searched++;
      const phrase = words(passage).join(" ");
      const found = results.filter((r) =>
        words(r.snippet).join(" ").includes(phrase),
      );
      if (found.length) matched++;
      for (const result of found.slice(0, 3))
        matches.push({
          title: result.title.slice(0, 200),
          url: result.url,
          snippet: result.snippet.slice(0, 600),
          passage,
        });
    } catch (error) {
      failed++;
      if (
        [401, 403, 429].includes(error.status) ||
        error.message === "Invalid search response"
      )
        break;
    }
  }
  return {
    status:
      searched === 0
        ? "Search unavailable"
        : failed
          ? "Partly checked"
          : "Checked",
    provider: name,
    searchedPassages: searched,
    requestedPassages: passages.length,
    matchedPassages: matched,
    passageMatchPercent: searched
      ? Math.round((matched / searched) * 100)
      : null,
    matches,
    checkedAt: new Date().toISOString(),
    method: "Sampled exact-phrase matching against search-result passages",
  };
}
