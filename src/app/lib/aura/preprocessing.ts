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
  // Days and months are capitalized too but are dates, not people -- "I'll
  // have it ready by Wednesday" must not make "Wednesday" the assignee.
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
  // Capitalized only because they open a sentence ("Can you bump the pool
  // size?"), never names.
  "Can", "Could", "Would", "Should", "Will", "Shall", "May", "Might", "Must",
  "Please", "Let", "Lets", "Maybe", "Also", "Then", "So", "But", "And", "Or",
  "Yes", "No", "Okay", "Ok", "Thanks", "Thank", "Agreed", "Sure", "Good",
  "Great", "Sounds", "What", "When", "Where", "Why", "How", "Who", "Which",
  "If", "After", "Before", "Once", "Until", "While", "Next", "Last", "Do",
  "Does", "Did", "Is", "Are", "Was", "Were", "Have", "Has", "Not",
]);

export function extractCapitalizedTokens(sentence: string): string[] {
  const matches = sentence.match(/\b[A-Z][a-z]+\b/g) || [];
  return matches.filter((word) => !COMMON_WORDS.has(word));
}

const SPEAKER_LINE = /^\s*([A-Z][A-Za-z0-9 .'-]{0,40}):\s+/;

/** Splits a raw transcript into sentences while respecting its line
 * structure. `cleanText` collapses newlines, so running it before sentence
 * splitting turned "Name: ..." lines with no trailing period into one giant
 * sentence. A line break is a sentence boundary when the previous line ended
 * a sentence, the next line starts a new speaker turn, or there is a blank
 * line; otherwise it's treated as a hard wrap and the lines are joined. */
export function splitTranscriptSentences(raw: string): string[] {
  const lines = (raw || "").split(/\r?\n/);
  const segments: string[] = [];
  let current = "";
  let afterBlank = false;

  for (const line of lines) {
    const text = line.trim();
    if (!text) {
      afterBlank = true;
      continue;
    }
    const startsTurn = SPEAKER_LINE.test(text);
    const prevEndedSentence = /[.!?]["')\]]*$/.test(current);
    if (current && (afterBlank || startsTurn || prevEndedSentence)) {
      segments.push(current);
      current = text;
    } else {
      current = current ? `${current} ${text}` : text;
    }
    afterBlank = false;
  }
  if (current) segments.push(current);

  return segments.flatMap((segment) => splitSentences(cleanText(segment)));
}
