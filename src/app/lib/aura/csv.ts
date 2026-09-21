import { DecisionInsight, TaskInsight } from "./types";

function escapeCsv(value: string | number | undefined): string {
  if (value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes('"') || /\n/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function tasksToCsv(tasks: TaskInsight[]): string {
  const header = "task,assignee,priority,deadline,confidence,sentence";
  const lines = tasks.map((task) =>
    [
      escapeCsv(task.task),
      escapeCsv(task.assignee),
      escapeCsv(task.priority),
      escapeCsv(task.deadline || ""),
      escapeCsv(task.confidence),
      escapeCsv(task.sentence),
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

export function decisionsToCsv(decisions: DecisionInsight[]): string {
  const header = "decision,type,impact,participants,sentence";
  const lines = decisions.map((decision) =>
    [
      escapeCsv(decision.decision),
      escapeCsv(decision.type),
      escapeCsv(decision.impact),
      escapeCsv(decision.participants.join("; ")),
      escapeCsv(decision.sentence),
    ].join(",")
  );
  return [header, ...lines].join("\n");
}
