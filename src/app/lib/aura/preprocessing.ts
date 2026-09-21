const CONTROL_CHARS = /[\u0000-\u001F]+/g;
const MULTI_SPACES = /\s+/g;

export function cleanText(input: string): string {
  return input
    .replace(CONTROL_CHARS, " ")
    .replace(/[“”]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/\s+-\s+/g, " - ")
    .replace(MULTI_SPACES, " ")
    .trim();
}

export function splitSentences(text: string): string[] {
  if (!text) return [];
  const fragments = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((fragment) => fragment.trim())
    .filter(Boolean);

  if (fragments.length > 0) return fragments;
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(MULTI_SPACES)
    .filter(Boolean);
}

export function countWords(text: string): number {
  return tokenize(text).length;
}

export function extractCapitalizedTokens(sentence: string): string[] {
  return (sentence.match(/\b[A-Z][a-z]+\b/g) || []).filter(Boolean);
}
