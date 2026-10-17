import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser, unauthorized } from "@/app/lib/auth";
import { isSafeMeetingId } from "@/app/lib/validation";
import { badRequest, readJsonBody, validateTasks } from "@/app/lib/http";
import { DATA_DIR, ensureDataDir, readAllMeetings } from "@/app/lib/meetingStore";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  try {
    ensureDataDir();

    const meetings = readAllMeetings().sort(
      (a, b) => new Date(String(b.timestamp)).getTime() - new Date(String(a.timestamp)).getTime()
    );

    return NextResponse.json({ success: true, meetings });
  } catch (error) {
    console.error("Error fetching meetings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch meetings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  try {
    ensureDataDir();

    const body = (await readJsonBody(request)) as { meetingData?: Record<string, unknown> } | undefined;
    if (body === undefined) return badRequest("Request body must be valid JSON.");
    const meetingData = body?.meetingData;

    if (
      !meetingData ||
      typeof meetingData.meeting_id !== "string" ||
      !isSafeMeetingId(meetingData.meeting_id)
    ) {
      return badRequest("Invalid meeting data");
    }
    if (meetingData.tasks !== undefined) {
      const problem = validateTasks(meetingData.tasks);
      if (problem) return badRequest(problem);
    }

    const filepath = path.join(DATA_DIR, `${meetingData.meeting_id}.json`);

    // Saving must not silently replace an existing meeting (it used to).
    if (fs.existsSync(filepath)) {
      return NextResponse.json(
        { success: false, error: "A meeting with that id already exists." },
        { status: 409 }
      );
    }

    fs.writeFileSync(filepath, JSON.stringify(meetingData, null, 2));

    return NextResponse.json({ success: true, meeting: meetingData });
  } catch (error) {
    console.error("Error saving meeting:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save meeting" },
      { status: 500 }
    );
  }
}
