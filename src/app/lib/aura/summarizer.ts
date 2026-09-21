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
  const ranked = sentences
    .map((sentence) => ({ sentence, score: sentenceScore(sentence) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .map((item) => item.sentence.trim());

  const summaryText = ranked.join(" ");

  return {
    sentences: ranked,
    summaryText,
  };
}
