import { describe, expect, it } from "vitest";
import { splitTranscriptSentences } from "../preprocessing";
import { analyzeTranscript } from "../analyzer";

describe("splitTranscriptSentences", () => {
  it("keeps one sentence per speaker line even without terminal punctuation", () => {
    const raw = "Dana: Let's talk about the migration\nLeo: I will stabilize the tests by Wednesday\nMarcus: Sounds good";
    expect(splitTranscriptSentences(raw)).toEqual([
      "Dana: Let's talk about the migration",
      "Leo: I will stabilize the tests by Wednesday",
      "Marcus: Sounds good",
    ]);
  });

  it("joins hard-wrapped lines inside one sentence", () => {
    const raw = "We will ship the build\nby Friday and share notes.\nPriya will review it.";
    expect(splitTranscriptSentences(raw)).toEqual([
      "We will ship the build by Friday and share notes.",
      "Priya will review it.",
    ]);
  });

  it("treats a blank line as a boundary (heading vs body)", () => {
    expect(splitTranscriptSentences("Budget review - Nov 3\n\nFinance approved the plan.")).toEqual([
      "Budget review - Nov 3",
      "Finance approved the plan.",
    ]);
  });

  it("handles Windows line endings", () => {
    expect(splitTranscriptSentences("Dana: one thing\r\nLeo: another thing")).toEqual([
      "Dana: one thing",
      "Leo: another thing",
    ]);
  });
});

describe("analyzeTranscript on a speaker-labelled transcript with no periods", () => {
  // Regression: the whole transcript used to collapse into a single sentence,
  // so at most one task was ever found.
  const transcript = [
    "Dana: Let's talk about the Kubernetes migration",
    "Leo: I will stabilize the flaky test suite by Wednesday",
    "Dana: I will own the migration runbook and draft it this week",
    "Marcus: We decided to postpone the design system refresh until after the migration ships",
  ].join("\n");

  it("finds every turn as its own sentence, tasks and decisions", () => {
    const result = analyzeTranscript(transcript);
    expect(result.stats.sentenceCount).toBe(4);
    expect(result.tasks.map((t) => t.assignee)).toEqual(["Leo", "Dana"]);
    expect(result.decisions).toHaveLength(1);
  });
});
