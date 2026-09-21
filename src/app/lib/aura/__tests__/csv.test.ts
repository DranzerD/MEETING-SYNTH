import { describe, expect, it } from "vitest";
import { tasksToCsv, decisionsToCsv } from "../csv";
import type { TaskInsight, DecisionInsight } from "../types";

describe("tasksToCsv", () => {
  it("includes a header row and one row per task", () => {
    const tasks: TaskInsight[] = [
      { sentence: "Dana will ship it.", task: "ship it", assignee: "Dana", priority: "high", confidence: 0.9, keywords: ["will"] },
    ];
    const csv = tasksToCsv(tasks);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("task,assignee,priority,deadline,confidence,sentence");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Dana");
  });

  it("escapes commas and quotes in field values", () => {
    const tasks: TaskInsight[] = [
      { sentence: 'He said, "ship it, now".', task: 'ship it, "now"', assignee: "Dana", priority: "high", confidence: 0.9, keywords: [] },
    ];
    const csv = tasksToCsv(tasks);
    expect(csv).toContain('"ship it, ""now"""');
  });

  it("produces just a header row for an empty task list", () => {
    expect(tasksToCsv([])).toBe("task,assignee,priority,deadline,confidence,sentence");
  });
});

describe("decisionsToCsv", () => {
  it("joins multiple participants with a semicolon", () => {
    const decisions: DecisionInsight[] = [
      { sentence: "s", decision: "d", type: "general", impact: "low", participants: ["Dana", "Leo"], keywords: [] },
    ];
    const csv = decisionsToCsv(decisions);
    expect(csv).toContain("Dana; Leo");
  });
});
