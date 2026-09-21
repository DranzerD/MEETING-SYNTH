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

  // String.split() on a pattern that matches nowhere in the text still
  // returns a single-element array (the whole string), never an empty
  // one -- so `fragments.length > 0` was always true for any non-empty
  // input, and the newline fallback below could never actually run. Only
  // fall back to it when the primary split genuinely found no sentence
  // boundaries (fragments has 0 or 1 pieces) AND splitting on newlines
  // finds more than one line to work with.
  if (fragments.length > 1) return fragments;

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length > 1 ? lines : fragments;
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

// Sentence-initial pronouns and articles are always capitalized because
// of their position, not because they're names -- without filtering
// these, "We should ship Friday." extracts "We" as if it were an
// assignee's name. Kept intentionally small (common function words only)
// rather than a full stopword list, since this feeds name/assignee
// detection, not general NLP filtering.
const COMMON_WORDS = new Set([
  "The", "This", "That", "These", "Those", "We", "They", "It", "He", "She",
  "You", "Our", "Their", "His", "Her", "Someone", "Everyone", "Everybody",
  "Anyone", "Nobody", "All", "Team",
]);

export function extractCapitalizedTokens(sentence: string): string[] {
  const matches = sentence.match(/\b[A-Z][a-z]+\b/g) || [];
  return matches.filter((word) => !COMMON_WORDS.has(word));
}
