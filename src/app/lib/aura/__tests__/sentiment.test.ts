import { describe, expect, it } from "vitest";
import { analyzeSentiment } from "../sentiment";

describe("analyzeSentiment", () => {
  it("labels a clearly positive transcript as positive", () => {
    const result = analyzeSentiment("Great progress! The team is excited and confident about the launch.");
    expect(result.label).toBe("positive");
  });

  it("labels a clearly negative transcript as negative", () => {
    const result = analyzeSentiment("We are frustrated and worried about the risk of failure and delays.");
    expect(result.label).toBe("negative");
  });

  it("labels neutral text with no sentiment words as neutral", () => {
    const result = analyzeSentiment("The meeting starts at 10am in room B.");
    expect(result.label).toBe("neutral");
    expect(result.emotion).toBe("neutral");
  });

  it("detects a specific emotion keyword", () => {
    const result = analyzeSentiment("Everyone is excited about the new feature.");
    expect(result.emotion).toBe("excitement");
  });

  it("confidence is bounded between 0 and 0.9", () => {
    const result = analyzeSentiment("great great great good good win win success");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(0.9);
  });
});
