import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "meetings");

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export async function GET() {
  try {
    ensureDataDir();

    const files = fs.readdirSync(DATA_DIR);
    const meetings = files
      .filter((f) => f.endsWith(".json"))
      .map((file) => {
        const content = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
        return JSON.parse(content);
      })
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
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
  try {
    ensureDataDir();

    const body = await request.json();
    const { meetingData } = body;

    if (!meetingData || !meetingData.meeting_id) {
      return NextResponse.json(
        { success: false, error: "Invalid meeting data" },
        { status: 400 }
      );
    }

    const filename = `${meetingData.meeting_id}.json`;
    const filepath = path.join(DATA_DIR, filename);

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
