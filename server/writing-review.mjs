export function reviewAIWriting(text) {
  const words = String(text).match(/[\p{L}\p{N}]+/gu) || [];
  if (words.length < 80)
    return {
      status: "More text needed",
      recommendation:
        "Add at least 80 readable words for a writing-pattern review.",
      signals: [],
      questions: [],
    };
  const signals = [],
    questions = [];
  const references =
    String(text).match(
      /\b(?:as an ai(?: language)? model|as a large language model|i am an ai assistant|i don't have personal experiences|i cannot browse the internet)\b/gi,
    ) || [];
  if (references.length) {
    signals.push({
      name: "AI-related wording",
      detail: [...new Set(references)].slice(0, 4).join("; "),
      count: references.length,
    });
    questions.push(
      "Explain the AI-related wording in this passage and how it was included in your work.",
    );
  }
  const transitions =
    String(text).match(
      /\b(?:in conclusion|it is important to note|furthermore|moreover|in today's digital age|in summary)\b/gi,
    ) || [];
  if (transitions.length >= 4) {
    signals.push({
      name: "Repeated stock transitions",
      detail: `${transitions.length} stock transition phrases found.`,
      count: transitions.length,
    });
    questions.push(
      "Talk through how you structured the response and show an earlier draft or planning notes.",
    );
  }
  const sentences = String(text)
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => (s.match(/[\p{L}\p{N}]+/gu) || []).length)
    .filter((n) => n >= 5);
  if (sentences.length >= 8) {
    const mean = sentences.reduce((a, b) => a + b, 0) / sentences.length;
    const variation =
      Math.sqrt(
        sentences.reduce((a, n) => a + (n - mean) ** 2, 0) / sentences.length,
      ) / mean;
    if (variation < 0.12) {
      signals.push({
        name: "Very uniform sentence lengths",
        detail: `${sentences.length} sentences have closely similar lengths.`,
        count: sentences.length,
      });
      questions.push(
        "Explain the main points using a specific example from your own workplace.",
      );
    }
  }
  const paragraphs = String(text)
      .split(/\n\s*\n/)
      .map((p) => p.trim().toLowerCase())
      .filter((p) => p.length > 100),
    repeated = paragraphs.length - new Set(paragraphs).size;
  if (repeated > 0) {
    signals.push({
      name: "Repeated paragraphs",
      detail: `${repeated} repeated paragraphs found.`,
      count: repeated,
    });
    questions.push(
      "Explain why these paragraphs repeat and show the sources or notes used.",
    );
  }
  return {
    status: "Reviewed",
    recommendation:
      references.length || signals.length >= 2
        ? "Follow up on possible AI assistance"
        : signals.length
          ? "Discuss the highlighted writing pattern"
          : "No AI-review triggers found",
    signals,
    questions: [...new Set(questions)],
    method: "Rule-based writing-pattern review",
  };
}
