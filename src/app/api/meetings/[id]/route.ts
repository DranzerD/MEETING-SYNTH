import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "meetings");

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
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
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
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
