import { NextResponse } from "next/server";
import { analyzeTranscript } from "@/app/lib/aura/analyzer";
import { getSessionUser, unauthorized } from "@/app/lib/auth";
import type { Decision, Sentiment, Stats, Task } from "@/app/lib/types";
import type { TaskInsight } from "@/app/lib/aura/types";
import fs from "fs";
import path from "path";

const PY_API_URL = process.env.AURA_PY_API_URL;
const DATA_DIR = path.join(process.cwd(), "data", "meetings");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

type PythonPayload = {
  stats: Stats;
  summary: { summaryText?: string; sentences?: string[] };
  tasks: Task[];
  decisions: Decision[];
  sentiment: Sentiment;
  thread?: { key: string; history: unknown[] } | null;
};

function normalizePythonPayload(payload: PythonPayload, transcript: string) {
  return {
    stats: payload.stats,
    summary: {
      summaryText: payload.summary?.summaryText || "",
      sentences: payload.summary?.sentences || [],
    },
    tasks: payload.tasks || [],
    decisions: payload.decisions || [],
    sentiment: payload.sentiment,
    cleanedTranscript: transcript,
    sentences: payload.summary?.sentences || [],
    thread: payload.thread || null,
    exports: {
      jsonFilename: "",
      tasksCsv: "",
      decisionsCsv: "",
    },
  };
}

export const dynamic = "force-dynamic";

const MAX_TRANSCRIPT_LENGTH = 500000; // 500KB character limit
const MIN_TRANSCRIPT_LENGTH = 50;

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  try {
    const body = await request.json();
    const transcript =
      typeof body?.transcript === "string" ? body.transcript : "";
    const thread = typeof body?.thread === "string" ? body.thread : undefined;
    const meetingId =
      typeof body?.meetingId === "string" ? body.meetingId : undefined;
    const meetingTitle =
      typeof body?.title === "string" ? body.title : "Untitled Meeting";

    // Validation
    const trimmedTranscript = transcript.trim();

    if (!trimmedTranscript) {
      return NextResponse.json(
        { success: false, error: "Transcript text is required." },
        { status: 400 }
      );
    }

    if (trimmedTranscript.length < MIN_TRANSCRIPT_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `Transcript too short (minimum ${MIN_TRANSCRIPT_LENGTH} characters).`,
        },
        { status: 400 }
      );
    }

    if (trimmedTranscript.length > MAX_TRANSCRIPT_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `Transcript too long (maximum ${MAX_TRANSCRIPT_LENGTH} characters). Please split into multiple meetings.`,
        },
        { status: 400 }
      );
    }

    if (meetingTitle.trim().length === 0 || meetingTitle.trim().length > 200) {
      return NextResponse.json(
        {
          success: false,
          error: "Meeting title must be between 1 and 200 characters.",
        },
        { status: 400 }
      );
    }

    // Resolve the final meeting_id *before* calling the analysis backend
    // (Python or the TS fallback) so the same ID is what gets indexed for
    // retrieval and what the dashboard/detail pages later reference --
    // previously this was generated only after the Python call returned,
    // so the RAG layer had no stable ID to index chunks under.
    ensureDataDir();
    let meeting_id = meetingId || `aura_${Date.now()}`;
    meeting_id = meeting_id
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .substring(0, 100);

    let filename = `${meeting_id}.json`;
    let filepath = path.join(DATA_DIR, filename);
    let counter = 1;

    while (fs.existsSync(filepath)) {
      filename = `${meeting_id}_${counter}.json`;
      filepath = path.join(DATA_DIR, filename);
      counter++;
      if (counter > 100) {
        throw new Error(
          "Too many meetings with similar IDs. Please use a unique meeting ID."
        );
      }
    }
    const resolvedMeetingId = meeting_id + (counter > 1 ? `_${counter - 1}` : "");

    let analysis;

    if (PY_API_URL) {
      const endpoint = `${PY_API_URL.replace(/\/$/, "")}/analyze`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const pyResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: trimmedTranscript,
            thread,
            meeting_id: resolvedMeetingId,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const payload = await pyResponse.json();
        if (!pyResponse.ok) {
          throw new Error(
            payload?.detail || payload?.error || "Python API error"
          );
        }
        analysis = normalizePythonPayload(payload, trimmedTranscript);
      } catch (fetchError: unknown) {
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          return NextResponse.json(
            {
              success: false,
              error:
                "Analysis timed out. Please try with a shorter transcript.",
            },
            { status: 408 }
          );
        }
        console.error("Python API error:", fetchError);
        // Fallback to TypeScript analyzer. Note: this path has no RAG
        // indexing counterpart -- only the Python service chunks + embeds
        // + stores in Chroma, so a meeting analyzed via this fallback
        // won't be queryable in chat until the Python service is back up
        // and the meeting is re-indexed (POST /api/index).
        console.log("Falling back to TypeScript analyzer");
        analysis = analyzeTranscript(trimmedTranscript);
      }
    } else {
      analysis = analyzeTranscript(trimmedTranscript);
    }

    const timestamp = new Date().toISOString();

    const meetingData = {
      meeting_id: resolvedMeetingId,
      title: meetingTitle.trim(),
      timestamp,
      createdBy: user.sub,
      transcript: trimmedTranscript,
      ...analysis,
      tasks: (analysis.tasks || []).map((task: Task | TaskInsight, index: number) => ({
        ...task,
        completed: false,
        id: `${resolvedMeetingId}_task_${Date.now()}_${index}`,
      })),
      metadata: {
        fileSize: trimmedTranscript.length,
        wordCount: trimmedTranscript.split(/\s+/).length,
        createdAt: timestamp,
        version: "1.0",
      },
    };

    // Write file with error handling
    try {
      fs.writeFileSync(filepath, JSON.stringify(meetingData, null, 2), "utf-8");
    } catch (writeError: unknown) {
      console.error("File write error:", writeError);
      const message = writeError instanceof Error ? writeError.message : "Unknown error";
      return NextResponse.json(
        {
          success: false,
          error: `Failed to save meeting data: ${message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, analysis: meetingData });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("/api/analyze error", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
