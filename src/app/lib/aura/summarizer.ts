import { SummaryInsight } from "./types";

const SUMMARY_KEYWORDS = [
  "decision",
  "decided",
  "action",
  "deadline",
  "will",
  "agreed",
  "plan",
  "update",
  "deliver",
];

function sentenceScore(sentence: string): number {
  const words = sentence.split(/\s+/).length;
  const keywordBonus = SUMMARY_KEYWORDS.reduce(
    (score, keyword) =>
      sentence.toLowerCase().includes(keyword) ? score + 5 : score,
    0
  );
  return words + keywordBonus;
}

export function buildSummary(
  sentences: string[],
  maxSentences = 5
): SummaryInsight {
  // Pick the top-scoring sentences, then restore original document order
  // (not score order) so the summary reads as a coherent excerpt rather
  // than a shuffled list of "most important" fragments -- matching what
  // the Python summarizer (aura_core/summarizer.py) already does.
  const topByScore = sentences
    .map((sentence, index) => ({ sentence, index, score: sentenceScore(sentence) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence.trim());

  return {
    sentences: topByScore,
    summaryText: topByScore.join(" "),
  };
}
