import { describe, expect, it } from "vitest";
import { buildSummary } from "../summarizer";

describe("buildSummary", () => {
  it("returns an empty summary for no sentences", () => {
    const summary = buildSummary([]);
    expect(summary.sentences).toEqual([]);
    expect(summary.summaryText).toBe("");
  });

  it("returns all sentences when fewer than maxSentences", () => {
    const sentences = ["First sentence.", "Second sentence."];
    const summary = buildSummary(sentences, 5);
    expect(summary.sentences).toHaveLength(2);
  });

  it("caps the summary at maxSentences", () => {
    const sentences = Array.from({ length: 10 }, (_, i) => `This is sentence number ${i} with some content.`);
    const summary = buildSummary(sentences, 3);
    expect(summary.sentences).toHaveLength(3);
  });

  it("preserves original sentence order in the summary", () => {
    const sentences = [
      "We decided to ship on Friday with the team.",
      "Random filler sentence with no particular keywords in it at all here.",
      "The deadline was agreed and the plan is set for delivery.",
    ];
    const summary = buildSummary(sentences, 2);
    const indices = summary.sentences.map((s) => sentences.indexOf(s));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});
