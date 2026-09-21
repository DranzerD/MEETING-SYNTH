import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/app/lib/auth";

const PY_API_URL = process.env.AURA_PY_API_URL;

export const dynamic = "force-dynamic";

// Manual (re-)indexing for retrieval, separate from /api/analyze. Useful
// for backfilling meetings that were analyzed before the RAG layer
// existed -- /api/meetings already returns saved transcripts, so the
// meeting list page can call this per-meeting to make older meetings
// queryable in chat.
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  if (!PY_API_URL) {
    return NextResponse.json(
      { success: false, error: "AURA_PY_API_URL is not configured." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const meetingId = typeof body?.meetingId === "string" ? body.meetingId : "";
    const transcript = typeof body?.transcript === "string" ? body.transcript : "";

    if (!meetingId || !transcript.trim()) {
      return NextResponse.json(
        { success: false, error: "meetingId and transcript are required." },
        { status: 400 }
      );
    }

    const endpoint = `${PY_API_URL.replace(/\/$/, "")}/index`;
    const pyResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meeting_id: meetingId, transcript }),
    });

    const payload = await pyResponse.json();
    if (!pyResponse.ok) {
      return NextResponse.json(
        { success: false, error: payload?.detail || "Indexing failed" },
        { status: pyResponse.status }
      );
    }

    return NextResponse.json({ success: true, ...payload });
  } catch (error: unknown) {
    console.error("/api/index error", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  if (!PY_API_URL) {
    return NextResponse.json(
      { success: false, error: "AURA_PY_API_URL is not configured." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const meetingId = searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json(
      { success: false, error: "meetingId query param is required." },
      { status: 400 }
    );
  }

  try {
    const endpoint = `${PY_API_URL.replace(/\/$/, "")}/index/status/${encodeURIComponent(meetingId)}`;
    const pyResponse = await fetch(endpoint);
    const payload = await pyResponse.json();
    if (!pyResponse.ok) {
      return NextResponse.json(
        { success: false, error: payload?.detail || "Status lookup failed" },
        { status: pyResponse.status }
      );
    }
    return NextResponse.json({ success: true, ...payload });
  } catch (error: unknown) {
    console.error("/api/index status error", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
