import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser, unauthorized } from "@/app/lib/auth";
import { isSafeMeetingId } from "@/app/lib/validation";

const DATA_DIR = path.join(process.cwd(), "data", "meetings");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  try {
    const { id } = await params;
    if (!isSafeMeetingId(id)) {
      return NextResponse.json({ success: false, error: "Invalid meeting id" }, { status: 400 });
    }
    const filepath = path.join(DATA_DIR, `${id}.json`);

    if (!fs.existsSync(filepath)) {
      return NextResponse.json(
        { success: false, error: "Meeting not found" },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(filepath, "utf-8");
    const meeting = JSON.parse(content);

    return NextResponse.json({ success: true, meeting });
  } catch (error) {
    console.error("Error fetching meeting:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch meeting" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  try {
    const { id } = await params;
    if (!isSafeMeetingId(id)) {
      return NextResponse.json({ success: false, error: "Invalid meeting id" }, { status: 400 });
    }
    const filepath = path.join(DATA_DIR, `${id}.json`);

    if (!fs.existsSync(filepath)) {
      return NextResponse.json(
        { success: false, error: "Meeting not found" },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(filepath, "utf-8");
    const meeting = JSON.parse(content);

    const body = await request.json();
    const { tasks } = body;

    if (tasks) {
      meeting.tasks = tasks;
    }

    fs.writeFileSync(filepath, JSON.stringify(meeting, null, 2));

    return NextResponse.json({ success: true, meeting });
  } catch (error) {
    console.error("Error updating meeting:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update meeting" },
      { status: 500 }
    );
  }
}
