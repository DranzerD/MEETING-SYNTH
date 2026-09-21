import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "meetings");

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

export async function GET() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      return NextResponse.json({ success: true, people: [] });
    }

    const files = fs.readdirSync(DATA_DIR);
    const peopleMap = new Map<
      string,
      {
        name: string;
        tasks: any[];
        meetings: Set<string>;
      }
    >();

    files
      .filter((f) => f.endsWith(".json"))
      .forEach((file) => {
        const content = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
        const meeting = JSON.parse(content);

        meeting.tasks?.forEach((task: any) => {
          const assignee = task.assignee || "Unassigned";
          const normalizedName = normalizeName(assignee);

          if (!peopleMap.has(normalizedName)) {
            peopleMap.set(normalizedName, {
              name: assignee,
              tasks: [],
              meetings: new Set(),
            });
          }

          const person = peopleMap.get(normalizedName)!;
          person.tasks.push({
            ...task,
            meetingId: meeting.meeting_id,
            meetingTitle: meeting.title || "Untitled Meeting",
            meetingDate: meeting.timestamp,
          });
          person.meetings.add(meeting.meeting_id);
        });
      });

    const people = Array.from(peopleMap.values()).map((person) => ({
      name: person.name,
      tasks: person.tasks,
      meetingCount: person.meetings.size,
      taskCount: person.tasks.length,
      openTasks: person.tasks.filter((t) => !t.completed).length,
      overdueTasks: person.tasks.filter(
        (t) => !t.completed && t.deadline && new Date(t.deadline) < new Date()
      ).length,
    }));

    return NextResponse.json({ success: true, people });
  } catch (error) {
    console.error("Error fetching people:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch people" },
      { status: 500 }
    );
  }
}
