import { NextResponse } from "next/server";

/** Reads a JSON request body. Returns `undefined` for a missing or malformed
 * body so routes can answer 400 instead of letting the parser's exception
 * surface as a 500 with an internal error message. */
export async function readJsonBody(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

/** True when `fetch` itself failed (service down, connection refused, DNS)
 * as opposed to the service answering with an error status. */
export function isConnectionFailure(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === "AbortError") return false;
  return error instanceof TypeError; // undici throws TypeError("fetch failed")
}

export function pythonUnavailable(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error:
        "The Python RAG service is not reachable. Start python_backend (see README) and check AURA_PY_API_URL.",
    },
    { status: 503 }
  );
}

const MAX_TASKS = 1000;

/** Validates the `tasks` array accepted by PATCH/POST meeting endpoints. A
 * non-array here used to be written to disk and then crashed every endpoint
 * that lists meetings. */
export function validateTasks(value: unknown): string | null {
  if (!Array.isArray(value)) return "tasks must be an array.";
  if (value.length > MAX_TASKS) return `tasks may contain at most ${MAX_TASKS} items.`;
  for (const task of value) {
    if (typeof task !== "object" || task === null || Array.isArray(task)) {
      return "every task must be an object.";
    }
    const t = task as Record<string, unknown>;
    if (typeof t.task !== "string") return "every task needs a text `task` field.";
    if ("completed" in t && typeof t.completed !== "boolean") return "task.completed must be a boolean.";
    if ("assignee" in t && typeof t.assignee !== "string") return "task.assignee must be a string.";
    if ("deadline" in t && t.deadline !== null && typeof t.deadline !== "string") {
      return "task.deadline must be a string or null.";
    }
  }
  return null;
}
