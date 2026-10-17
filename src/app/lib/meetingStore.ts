import fs from "fs";
import path from "path";
import type { Task } from "@/app/lib/types";

/** Shape guaranteed by readAllMeetings(); other saved fields pass through. */
export type StoredMeeting = {
  meeting_id?: string;
  title?: string;
  timestamp?: string;
  tasks: Task[];
  [key: string]: unknown;
};

export const DATA_DIR = path.join(process.cwd(), "data", "meetings");

export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** Reads every saved meeting. A file that is unreadable, not valid JSON, or
 * not an object is skipped (and logged) instead of failing the whole listing
 * -- one corrupt file used to make /api/meetings and /api/people return 500
 * for everyone. `tasks` is normalized to an array for the same reason. */
export function readAllMeetings(): StoredMeeting[] {
  if (!fs.existsSync(DATA_DIR)) return [];

  const meetings: StoredMeeting[] = [];
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("not a meeting object");
      }
      if (!Array.isArray(parsed.tasks)) parsed.tasks = [];
      meetings.push(parsed);
    } catch (error) {
      console.warn(`Skipping unreadable meeting file ${file}:`, error instanceof Error ? error.message : error);
    }
  }
  return meetings;
}
