import { DecisionInsight, DecisionType, Priority } from "./types";
import { extractCapitalizedTokens } from "./preprocessing";

const DECISION_KEYWORDS = [
  "decided",
  "agreed",
  "concluded",
  "approved",
  "rejected",
  "determined",
  "chose",
  "selected",
  "greenlit",
  "signed off",
];

const DECISION_TYPE_MAP: Record<DecisionType, RegExp> = {
  timeline: /(timeline|deadline|extend|postpone|delay|schedule)/i,
  budget: /(budget|cost|funding|spend|expense)/i,
  technical: /(architecture|tech stack|framework|database|infra|technical)/i,
  general: /.*/i,
};

const IMPACT_HIGH = /(critical|strategic|company-wide|major)/i;
const IMPACT_MED = /(important|notable|significant)/i;

function detectDecisionType(sentence: string): DecisionType {
  if (DECISION_TYPE_MAP.timeline.test(sentence)) return "timeline";
  if (DECISION_TYPE_MAP.budget.test(sentence)) return "budget";
  if (DECISION_TYPE_MAP.technical.test(sentence)) return "technical";
  return "general";
}

function detectImpact(sentence: string): Priority {
  if (IMPACT_HIGH.test(sentence)) return "high";
  if (IMPACT_MED.test(sentence)) return "medium";
  return "low";
}

function detectParticipants(sentence: string): string[] {
  const tokens = extractCapitalizedTokens(sentence);
  return Array.from(new Set(tokens)).slice(0, 3);
}

export function extractDecisions(sentences: string[]): DecisionInsight[] {
  const decisions: DecisionInsight[] = [];

  sentences.forEach((sentence) => {
    const lowered = sentence.toLowerCase();
    const keywords = DECISION_KEYWORDS.filter((keyword) =>
      lowered.includes(keyword)
    );
    if (keywords.length === 0) return;

    decisions.push({
      sentence,
      decision: sentence.trim(),
      type: detectDecisionType(sentence),
      impact: detectImpact(sentence),
      participants: detectParticipants(sentence),
      keywords,
    });
  });

  return decisions;
}
