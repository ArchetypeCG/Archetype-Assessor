import JSZip from "jszip";
const normalise = (text) =>
  String(text)
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || [];
function shingles(words) {
  const out = new Set();
  for (let n = 0; n <= words.length - 7; n++)
    out.add(words.slice(n, n + 7).join(" "));
  return out;
}
export function compareText(text, corpus = []) {
  const words = normalise(text),
    source = shingles(words);
  let highest = 0,
    compared = 0;
  for (const document of corpus) {
    const other = shingles(normalise(document.text));
    if (!other.size) continue;
    compared++;
    let matches = 0;
    for (const phrase of source) if (other.has(phrase)) matches++;
    highest = Math.max(highest, source.size ? matches / source.size : 0);
  }
  const paragraphs = String(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 100);
  return {
    status:
      words.length < 50
        ? "Insufficient readable text"
        : compared
          ? "Checked"
          : "No comparison sources",
    similarity:
      words.length >= 50 && compared ? Math.round(highest * 100) : null,
    wordCount: words.length,
    comparedDocuments: compared,
    scope:
      "Internal comparison with up to 2,000 recent stored evidence texts; no internet or external database search.",
    repeatedParagraphs: paragraphs.length - new Set(paragraphs).size,
    aiStatus: "Not scored",
    aiExplanation:
      "Writing style cannot reliably establish AI authorship. Review the learner's understanding and drafting process; this is not an AI probability score.",
  };
}
const xmlText = (xml) =>
  xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
export async function extractEvidenceText(description, files) {
  const parts = [description || ""],
    unsupported = [];
  let truncated = false;
  for (const file of files) {
    const bytes = Buffer.from(file.body),
      extension = file.name.split(".").pop().toLowerCase();
    try {
      if (["txt", "md", "csv"].includes(extension))
        parts.push(bytes.toString("utf8"));
      else if (extension === "docx") {
        const zip = await JSZip.loadAsync(bytes);
        const entry = zip.file("word/document.xml");
        if (!entry) throw Error("No document text");
        if (entry._data?.uncompressedSize > 2 * 1024 * 1024)
          throw Error("Document text too large");
        parts.push(xmlText(await entry.async("string")));
      } else if (extension === "pdf") {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const document = await getDocumentProxy(new Uint8Array(bytes), {
          isEvalSupported: false,
          disableFontFace: true,
        });
        try {
          if (document.numPages > 100)
            throw Error("PDF exceeds text-check page limit");
          const result = await extractText(document, { mergePages: true });
          if (result.text.trim()) parts.push(result.text);
          else unsupported.push(file.name);
        } finally {
          await document.loadingTask.destroy();
        }
      } else unsupported.push(file.name);
    } catch {
      unsupported.push(file.name);
    }
  }
  let text = parts.join("\n\n");
  if (text.length > 100000) {
    text = text.slice(0, 100000);
    truncated = true;
  }
  return { text, unsupported, truncated };
}
