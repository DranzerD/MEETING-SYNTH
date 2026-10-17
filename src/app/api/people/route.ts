import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/app/lib/auth";
import type { PersonTask } from "@/app/lib/types";
import { isOverdue } from "@/app/lib/deadlines";
import { readAllMeetings } from "@/app/lib/meetingStore";

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  try {
    const peopleMap = new Map<
      string,
      {
        name: string;
        tasks: PersonTask[];
        meetings: Set<string>;
      }
    >();

    for (const meeting of readAllMeetings()) {
      for (const task of meeting.tasks) {
        if (typeof task !== "object" || task === null) continue;
        // "Not specified" is the extractors' placeholder, not a person.
        const assignee =
          typeof task.assignee === "string" && task.assignee && task.assignee !== "Not specified"
            ? task.assignee
            : "Unassigned";
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
          meetingId: String(meeting.meeting_id),
          meetingTitle: meeting.title || "Untitled Meeting",
          meetingDate: String(meeting.timestamp),
        });
        person.meetings.add(String(meeting.meeting_id));
      }
    }

    const people = Array.from(peopleMap.values()).map((person) => ({
      name: person.name,
      tasks: person.tasks,
      meetingCount: person.meetings.size,
      taskCount: person.tasks.length,
      openTasks: person.tasks.filter((t) => !t.completed).length,
      overdueTasks: person.tasks.filter((t) =>
        isOverdue(t.deadline, new Date(t.meetingDate), !!t.completed)
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
