import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/app/lib/auth";
import { badRequest, isConnectionFailure, pythonUnavailable, readJsonBody } from "@/app/lib/http";

const PY_API_URL = process.env.AURA_PY_API_URL;

export const dynamic = "force-dynamic";

// Unlike /api/analyze, there is no TypeScript fallback here: grounded chat
// needs both the vector index and an LLM call, neither of which the
// TS heuristic pipeline can do locally. If the Python service or an LLM
// provider key isn't configured, we surface that plainly instead of
// silently degrading.
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  if (!PY_API_URL) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Chat requires the Python RAG service. Set AURA_PY_API_URL and run python_backend (see README).",
      },
      { status: 503 }
    );
  }

  try {
    const body = (await readJsonBody(request)) as Record<string, unknown> | undefined | null;
    if (body === undefined || body === null || typeof body !== "object") {
      return badRequest("Request body must be a JSON object.");
    }
    const question = typeof body.question === "string" ? body.question.trim() : "";
    // Only well-formed values are forwarded; anything else is dropped rather
    // than reaching the Python service's validator and coming back as a 422.
    type Turn = { role?: unknown; content?: unknown };
    const meetingIds = Array.isArray(body.meetingIds)
      ? body.meetingIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 100)
      : undefined;
    const topK =
      typeof body.topK === "number" && Number.isInteger(body.topK)
        ? Math.min(20, Math.max(1, body.topK))
        : undefined;
    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (turn: Turn): turn is { role: "user" | "assistant"; content: string } =>
              !!turn && typeof turn.content === "string" && (turn.role === "user" || turn.role === "assistant")
          )
          .slice(-6)
          .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 4000) }))
      : undefined;

    if (!question) {
      return NextResponse.json(
        { success: false, error: "A question is required." },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const endpoint = `${PY_API_URL.replace(/\/$/, "")}/query`;
    const pyResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        meeting_ids: meetingIds,
        top_k: topK,
        history,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const payload = await pyResponse.json();
    if (!pyResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: payload?.detail || "Query failed",
        },
        { status: pyResponse.status }
      );
    }

    return NextResponse.json({ success: true, ...payload });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { success: false, error: "Query timed out. Try a narrower question or fewer meetings." },
        { status: 408 }
      );
    }
    if (isConnectionFailure(error)) return pythonUnavailable();
    console.error("/api/query error", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
