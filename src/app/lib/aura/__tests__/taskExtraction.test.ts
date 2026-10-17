import { describe, expect, it } from "vitest";
import { extractTasks } from "../taskExtraction";

describe("extractTasks", () => {
  it("detects an explicit action item with an assignee and deadline", () => {
    const tasks = extractTasks(["Dana will finalize the onboarding deck by Friday."]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].assignee).toBe("Dana");
    expect(tasks[0].deadline).toMatch(/friday/i);
  });

  it("does not flag a purely informational sentence as a task", () => {
    const tasks = extractTasks(["The meeting went really well today."]);
    expect(tasks).toHaveLength(0);
  });

  it("returns an empty array for an empty transcript", () => {
    expect(extractTasks([])).toEqual([]);
  });

  it("assigns high priority for urgent language", () => {
    const tasks = extractTasks(["URGENT: Alex must escalate the production incident immediately."]);
    expect(tasks[0]?.priority).toBe("high");
  });

  it("falls back to 'Not specified' when no assignee can be detected", () => {
    const tasks = extractTasks(["We should schedule a dry run with the support team."]);
    expect(tasks[0]?.assignee).toBe("Team");
  });

  it("confidence score stays within [0, 1]", () => {
    const tasks = extractTasks([
      "URGENT: critical blocker, Dana must fix this immediately, follow up ASAP, due today.",
    ]);
    expect(tasks[0]?.confidence).toBeGreaterThanOrEqual(0);
    expect(tasks[0]?.confidence).toBeLessThanOrEqual(1);
  });
});

describe("assignee detection with speaker-labelled transcripts", () => {
  it("assigns a first-person commitment to the speaker", () => {
    const [task] = extractTasks(["Leo: I will stabilize the flaky test suite by Wednesday."]);
    expect(task.assignee).toBe("Leo");
    expect(task.deadline).toBe("by Wednesday");
  });

  it("does not make the speaker the assignee of a request addressed to someone else", () => {
    const [task] = extractTasks(["Dana: Can you bump the pool size, we need to fix staging."]);
    expect(task.assignee).not.toBe("Dana");
  });

  it("sees through a leading acknowledgement", () => {
    const [task] = extractTasks(["Dana: Agreed, I will check the alerting setup by October 30."]);
    expect(task.assignee).toBe("Dana");
  });

  it("never reports a weekday or month as the assignee", () => {
    const [task] = extractTasks(["We should finalize the deck before October 28."]);
    expect(task.assignee).toBe("Not specified");
  });
});
