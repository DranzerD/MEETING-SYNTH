import { extractCapitalizedTokens } from "./preprocessing";
import { Priority, TaskInsight } from "./types";

const TASK_KEYWORDS = [
  "will",
  "should",
  "must",
  "need to",
  "needs to",
  "responsible for",
  "assign",
  "follow up",
  "due",
  "deadline",
  "complete",
  "finish",
  "deliver",
  "prepare",
  "schedule",
];

const HIGH_PRIORITY = /(critical|urgent|asap|immediately|blocker)/i;
const MEDIUM_PRIORITY = /(important|needs? to|should|follow up)/i;

const DEADLINE_PATTERNS: RegExp[] = [
  /by\s+(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  /by\s+(today|tomorrow|tonight|next week|end of week|eow|eod)/i,
  /by\s+([A-Z][a-z]+\s+\d{1,2})/i,
  /by\s+((?:Q[1-4]|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}))/i,
];

function detectPriority(sentence: string): Priority {
  if (HIGH_PRIORITY.test(sentence)) return "high";
  if (MEDIUM_PRIORITY.test(sentence)) return "medium";
  return "low";
}

function detectDeadline(sentence: string): string | undefined {
  for (const pattern of DEADLINE_PATTERNS) {
    const match = sentence.match(pattern);
    if (match) return match[0];
  }
  return undefined;
}

// "Dana: I'll own the runbook" -> the speaker is the assignee. In every other
// case the speaker label is just who is talking ("Dana: Can you bump the pool
// size?"), so it must not be treated as the assignee.
const SPEAKER_PREFIX = /^\s*([A-Z][A-Za-z0-9 .'-]{0,40}):\s+(.*)$/;
const FIRST_PERSON_COMMITMENT = /^(?:i\s+will|i'll|i\s+can|i\s+am going to|i'm going to|let me|i\s+need to|i\s+should)\b/i;

const LEADING_ACK = /^(?:agreed|ok|okay|sure|yes|yeah|sounds good|great|good)\b[,.!]?\s*/i;

function detectAssignee(rawSentence: string): string {
  const speakerMatch = rawSentence.match(SPEAKER_PREFIX);
  const speaker = speakerMatch ? speakerMatch[1].trim() : null;
  const sentence = (speakerMatch ? speakerMatch[2] : rawSentence).replace(LEADING_ACK, ""); // "Agreed, I'll check X" -> "I'll check X"
  if (speaker && FIRST_PERSON_COMMITMENT.test(sentence)) return speaker;

  const capitalized = extractCapitalizedTokens(sentence);
  if (capitalized.length > 0) {
    return capitalized[0];
  }
  if (/\bteam\b/i.test(sentence)) return "Team";
  if (/\ball hands\b/i.test(sentence)) return "All Hands";
  return "Not specified";
}

function extractActionPhrase(sentence: string): string {
  const match = sentence.match(
    /(will|should|must|need to|needs to|responsible for|assign(?:ed)? to)\s+(.+)/i
  );
  if (match) return match[0].trim();
  return sentence.trim();
}

function estimateConfidence(keywords: string[]): number {
  const base = 0.55;
  const bonus = Math.min(0.4, keywords.length * 0.08);
  return Number((base + bonus).toFixed(2));
}

export function extractTasks(sentences: string[]): TaskInsight[] {
  const tasks: TaskInsight[] = [];

  sentences.forEach((sentence) => {
    const lowered = sentence.toLowerCase();
    const keywords = TASK_KEYWORDS.filter((keyword) =>
      lowered.includes(keyword)
    );
    if (keywords.length === 0) return;

    const task: TaskInsight = {
      sentence,
      task: extractActionPhrase(sentence),
      assignee: detectAssignee(sentence),
      priority: detectPriority(sentence),
      deadline: detectDeadline(sentence),
      confidence: estimateConfidence(keywords),
      keywords,
    };

    tasks.push(task);
  });

  return tasks;
}
