import test from "node:test";
import assert from "node:assert/strict";
import { checkInternet, internetPassages } from "../server/internet-check.mjs";
import { reviewAIWriting } from "../server/writing-review.mjs";
const text = Array.from({ length: 160 }, (_, i) => `sample${i}`).join(" ");
const xml = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
test("internet checks search real passages and report source URLs and verified snippet matches", async () => {
  const calls = [];
  const report = await checkInternet(text, {
    enabled: true,
    fetchImpl: async (url) => {
      calls.push(url);
      const phrase = new URL(url).searchParams.get("q").replaceAll('"', "");
      return new Response(
        `<rss><channel><item><title>Source document</title><link>https://example.org/source</link><description>${xml(phrase)} and further source text</description></item></channel></rss>`,
      );
    },
  });
  assert.equal(calls.length, 4);
  assert.ok(
    calls.every((url) => url.startsWith("https://www.bing.com/search?")),
  );
  assert.equal(report.status, "Checked");
  assert.equal(report.searchedPassages, 4);
  assert.equal(report.matchedPassages, 4);
  assert.equal(report.passageMatchPercent, 100);
  assert.equal(report.matches.length, 4);
  assert.ok(
    report.matches.every(
      (m) => m.url === "https://example.org/source" && m.passage,
    ),
  );
});
test("no matches, inaccessible providers and partial searches produce distinct outcomes rather than fabricated clean scores", async () => {
  const empty = await checkInternet(text, {
    enabled: true,
    fetchImpl: async () => new Response("<rss><channel></channel></rss>"),
  });
  assert.equal(empty.status, "Checked");
  assert.equal(empty.passageMatchPercent, 0);
  const blocked = await checkInternet(text, {
    enabled: true,
    fetchImpl: async () => new Response("blocked", { status: 403 }),
  });
  assert.equal(blocked.status, "Search unavailable");
  assert.equal(blocked.passageMatchPercent, null);
  let count = 0;
  const partial = await checkInternet(text, {
    enabled: true,
    fetchImpl: async () =>
      ++count === 1
        ? new Response("<rss><channel></channel></rss>")
        : new Response("blocked", { status: 429 }),
  });
  assert.equal(partial.status, "Partly checked");
  assert.equal(partial.searchedPassages, 1);
  const captcha = await checkInternet(text, {
    enabled: true,
    fetchImpl: async () => new Response("<html>Challenge</html>"),
  });
  assert.equal(captcha.status, "Search unavailable");
});
test("Brave search is configurable, unsafe result links are excluded and direct email details are omitted from queries", async () => {
  assert.equal(
    (await checkInternet(text, { enabled: true, provider: "brave" })).status,
    "Search key required",
  );
  const report = await checkInternet(text, {
    enabled: true,
    provider: "brave",
    apiKey: "synthetic-test-key",
    fetchImpl: async (url, options) => {
      assert.equal(
        options.headers["X-Subscription-Token"],
        "synthetic-test-key",
      );
      const phrase = new URL(url).searchParams.get("q").replaceAll('"', "");
      return Response.json({
        web: {
          results: [
            {
              title: "Matched source",
              url: "https://example.org/reference",
              description: phrase,
            },
            {
              title: "Invalid",
              url: "javascript:alert(1)",
              description: phrase,
            },
          ],
        },
      });
    },
  });
  assert.equal(report.status, "Checked");
  assert.ok(report.matches.every((m) => m.url.startsWith("https://")));
  assert.ok(!JSON.stringify(report).includes("synthetic-test-key"));
  assert.ok(
    !internetPassages("private@example.test " + text).some((p) =>
      p.includes("private"),
    ),
  );
  assert.ok(
    !internetPassages("password=privatecredentialvalue " + text).some((p) =>
      p.includes("privatecredentialvalue"),
    ),
  );
});
test("AI writing review reports observed signals and questions without claiming a probability or changing assessment outcomes", () => {
  const result = reviewAIWriting("As an AI language model, " + text);
  assert.equal(result.recommendation, "Follow up on possible AI assistance");
  assert.ok(result.signals.some((s) => s.name === "AI-related wording"));
  assert.ok(result.questions.length);
  assert.equal(result.probability, undefined);
  assert.equal(result.score, undefined);
  assert.equal(
    reviewAIWriting(text).recommendation,
    "No AI-review triggers found",
  );
  assert.equal(reviewAIWriting("A short paragraph").status, "More text needed");
});
