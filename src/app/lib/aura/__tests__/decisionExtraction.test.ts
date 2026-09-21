import { describe, expect, it } from "vitest";
import { extractDecisions } from "../decisionExtraction";

describe("extractDecisions", () => {
  it("detects a budget decision by keyword + type pattern", () => {
    const decisions = extractDecisions(["We agreed to increase the budget to cover the extra cloud spend."]);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].type).toBe("budget");
  });

  it("detects a timeline decision", () => {
    const decisions = extractDecisions(["We decided to extend the beta window by one week."]);
    expect(decisions[0]?.type).toBe("timeline");
  });

  it("does not flag a sentence with no decision keyword", () => {
    const decisions = extractDecisions(["The weather was nice today."]);
    expect(decisions).toHaveLength(0);
  });

  it("returns an empty array for an empty transcript", () => {
    expect(extractDecisions([])).toEqual([]);
  });

  it("extracts up to 3 unique participants", () => {
    const decisions = extractDecisions([
      "Dana, Leo, Marcus, and Priya agreed to ship the release on Friday.",
    ]);
    expect(decisions[0]?.participants.length).toBeLessThanOrEqual(3);
  });
});
