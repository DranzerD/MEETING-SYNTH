import { SentimentInsight, SentimentLabel } from "./types";
import { tokenize } from "./preprocessing";

const POSITIVE = [
  "great",
  "good",
  "excellent",
  "positive",
  "happy",
  "excited",
  "confident",
  "progress",
  "win",
  "success",
  "improved",
  "awesome",
  "thrilled",
  "optimistic",
];

const NEGATIVE = [
  "bad",
  "issue",
  "problem",
  "concern",
  "delay",
  "blocked",
  "risk",
  "frustrated",
  "angry",
  "worried",
  "stress",
  "fail",
  "negative",
  "urgent",
];

const EMOTION_KEYWORDS: Record<string, string> = {
  excited: "excitement",
  thrilled: "excitement",
  confident: "confidence",
  concern: "concern",
  worried: "concern",
  frustrated: "frustration",
  angry: "frustration",
  nervous: "anxiety",
};

function scoreWords(tokens: string[], lexicon: string[]): number {
  const set = new Set(lexicon);
  return tokens.reduce(
    (score, token) => (set.has(token) ? score + 1 : score),
    0
  );
}

function detectEmotion(tokens: string[]): string {
  for (const token of tokens) {
    if (EMOTION_KEYWORDS[token]) return EMOTION_KEYWORDS[token];
  }
  return "neutral";
}

function determineLabel(
  positiveScore: number,
  negativeScore: number
): SentimentLabel {
  if (positiveScore > negativeScore) return "positive";
  if (negativeScore > positiveScore) return "negative";
  return "neutral";
}

export function analyzeSentiment(text: string): SentimentInsight {
  const tokens = tokenize(text);
  const positiveScore = scoreWords(tokens, POSITIVE);
  const negativeScore = scoreWords(tokens, NEGATIVE);
  const total = Math.max(1, tokens.length);
  const dominant = Math.max(positiveScore, negativeScore);
  const confidence = Number(Math.min(0.9, (dominant / total) * 10).toFixed(2));

  return {
    label: determineLabel(positiveScore, negativeScore),
    confidence,
    emotion: detectEmotion(tokens),
    positiveScore,
    negativeScore,
  };
}
