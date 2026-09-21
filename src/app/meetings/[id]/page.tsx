"use client";

import React, { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import type { Meeting, IndexStatus } from "@/app/lib/types";

function MeetingDetailInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const highlightSnippet = searchParams.get("snippet");
  const highlightRef = useRef<HTMLElement | null>(null);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "completed">("all");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [indexing, setIndexing] = useState(false);

  useEffect(() => {
    fetchMeeting();
  }, [params.id]);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [meeting, highlightSnippet]);

  const fetchIndexStatus = async (meetingId: string) => {
    try {
      const response = await fetch(`/api/index?meetingId=${encodeURIComponent(meetingId)}`);
      const data = await response.json();
      if (data.success) setIndexStatus(data as IndexStatus);
    } catch {
      // Non-fatal: the badge just stays hidden if the Python service is down.
    }
  };

  const fetchMeeting = async () => {
    try {
      const response = await fetch(`/api/meetings/${params.id}`);
      const data = await response.json();
      if (data.success) {
        setMeeting(data.meeting);
        fetchIndexStatus(data.meeting.meeting_id);
      }
    } catch (error) {
      console.error("Error fetching meeting:", error);
    } finally {
      setLoading(false);
    }
  };

  const makeSearchable = async () => {
    if (!meeting) return;
    setIndexing(true);
    try {
      const response = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: meeting.meeting_id, transcript: meeting.transcript }),
      });
      const data = await response.json();
      if (data.success) {
        // Indexing runs in the background; poll once after a beat rather
        // than assuming it's instant.
        setTimeout(() => fetchIndexStatus(meeting.meeting_id), 1500);
      }
    } catch (error) {
      console.error("Error indexing meeting:", error);
    } finally {
      setIndexing(false);
    }
  };

  const toggleTaskComplete = async (taskId: string) => {
    if (!meeting) return;

    // Store original state for rollback
    const originalTasks = meeting.tasks;

    // Optimistic update
    const updatedTasks = meeting.tasks.map((task) =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    );

    setMeeting({ ...meeting, tasks: updatedTasks });
    setSaveStatus("saving");

    try {
      const response = await fetch(`/api/meetings/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: updatedTasks }),
      });

      if (!response.ok) {
        throw new Error("Failed to save");
      }

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("Error updating task:", error);
      // Rollback on error
      setMeeting({ ...meeting, tasks: originalTasks });
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-white text-xl">Loading meeting...</div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Meeting not found</div>
          <Link href="/dashboard" className="text-blue-400 hover:underline">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const filteredTasks = meeting.tasks.filter((task) => {
    if (filter === "open") return !task.completed;
    if (filter === "completed") return task.completed;
    return true;
  });

  const sentiment = meeting.sentiment?.overall || meeting.sentiment?.label;
  const sentimentColor =
    sentiment === "positive"
      ? "from-green-500/20 to-green-500/5 border-green-500/30"
      : sentiment === "negative"
      ? "from-red-500/20 to-red-500/5 border-red-500/30"
      : "from-slate-500/20 to-slate-500/5 border-slate-500/30";

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center text-slate-400 hover:text-white gap-2"
            >
              ← Back to dashboard
            </Link>
            {saveStatus !== "idle" && (
              <div
                className={`text-sm px-3 py-1 rounded-full ${
                  saveStatus === "saving"
                    ? "bg-blue-500/20 text-blue-400"
                    : saveStatus === "saved"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {saveStatus === "saving" && "💾 Saving..."}
                {saveStatus === "saved" && "✓ Saved"}
                {saveStatus === "error" && "⚠️ Save failed"}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                const data = JSON.stringify(meeting, null, 2);
                const blob = new Blob([data], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${meeting.meeting_id}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-4 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5 transition"
            >
              ⬇️ Download JSON
            </button>
            <Link
              href="/analyze"
              className="px-4 py-2 rounded-xl bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100 transition"
            >
              + New Analysis
            </Link>
          </div>
        </div>

        <div className="bg-white/5 rounded-2xl p-8 border border-white/10 mb-6">
          <div className="flex items-start justify-between mb-4 gap-4">
            <div className="flex-1">
              <h1 className="text-4xl font-bold mb-2">{meeting.title}</h1>
              <p className="text-slate-400">{formatDate(meeting.timestamp)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {indexStatus?.status === "completed" && (
                  <Link
                    href={`/chat?meeting=${encodeURIComponent(meeting.meeting_id)}`}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition"
                  >
                    💬 Searchable in chat -- ask about this meeting →
                  </Link>
                )}
                {indexStatus?.status === "failed" && (
                  <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300">
                    ⚠ Indexing failed
                  </span>
                )}
                {(indexStatus?.status === "queued" || indexStatus?.status === "indexing") && (
                  <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
                    ⏳ Indexing for chat…
                  </span>
                )}
                {(!indexStatus || indexStatus.status === "failed") && (
                  <button
                    onClick={makeSearchable}
                    disabled={indexing}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-white/5 transition disabled:opacity-50"
                  >
                    {indexing ? "Requesting…" : "Make searchable in chat"}
                  </button>
                )}
              </div>
            </div>
            {sentiment && (
              <div
                className={`px-4 py-2 rounded-full bg-gradient-to-r ${sentimentColor} border`}
              >
                <span className="font-semibold capitalize">{sentiment}</span>
              </div>
            )}
          </div>

          {meeting.summary?.summaryText && (
            <div className="mt-6 p-4 bg-white/5 rounded-xl">
              <h3 className="text-sm font-semibold text-slate-400 mb-2">
                SUMMARY
              </h3>
              <p className="text-slate-200">{meeting.summary.summaryText}</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-white/5 rounded-xl p-4">
              <div className="text-2xl font-bold">
                {meeting.tasks?.length || 0}
              </div>
              <div className="text-sm text-slate-400">Total Tasks</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4">
              <div className="text-2xl font-bold text-green-400">
                {meeting.tasks?.filter((t) => t.completed).length || 0}
              </div>
              <div className="text-sm text-slate-400">Completed</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4">
              <div className="text-2xl font-bold">
                {meeting.decisions?.length || 0}
              </div>
              <div className="text-sm text-slate-400">Decisions</div>
            </div>
          </div>

          {meeting.tasks?.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-slate-400">Progress</span>
                <span className="font-semibold">
                  {Math.round(
                    (meeting.tasks.filter((t) => t.completed).length /
                      meeting.tasks.length) *
                      100
                  )}
                  %
                </span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
                  style={{
                    width: `${
                      (meeting.tasks.filter((t) => t.completed).length /
                        meeting.tasks.length) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Tasks</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter("all")}
                  className={`px-3 py-1 rounded-full text-sm ${
                    filter === "all" ? "bg-white text-slate-900" : "bg-white/10"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter("open")}
                  className={`px-3 py-1 rounded-full text-sm ${
                    filter === "open"
                      ? "bg-white text-slate-900"
                      : "bg-white/10"
                  }`}
                >
                  Open
                </button>
                <button
                  onClick={() => setFilter("completed")}
                  className={`px-3 py-1 rounded-full text-sm ${
                    filter === "completed"
                      ? "bg-white text-slate-900"
                      : "bg-white/10"
                  }`}
                >
                  Done
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {filteredTasks.length === 0 ? (
                <div className="bg-white/5 rounded-xl p-8 text-center text-slate-400">
                  No tasks found
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const isOverdue =
                    task.deadline &&
                    new Date(task.deadline) < new Date() &&
                    !task.completed;

                  return (
                    <div
                      key={task.id}
                      className={`p-4 rounded-xl border ${
                        task.completed
                          ? "bg-white/5 border-white/5"
                          : isOverdue
                          ? "bg-red-500/10 border-red-500/30"
                          : task.priority === "high"
                          ? "bg-orange-500/10 border-orange-500/30"
                          : "bg-white/10 border-white/10"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => toggleTaskComplete(task.id)}
                          className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            task.completed
                              ? "bg-green-500 border-green-500"
                              : "border-slate-400 hover:border-white"
                          }`}
                        >
                          {task.completed && (
                            <span className="text-white text-xs">✓</span>
                          )}
                        </button>

                        <div className="flex-1">
                          <div
                            className={
                              task.completed
                                ? "line-through text-slate-500"
                                : ""
                            }
                          >
                            {task.task}
                          </div>
                          <div className="flex gap-3 mt-2 text-sm text-slate-400">
                            <span>👤 {task.assignee}</span>
                            {task.deadline && (
                              <span className={isOverdue ? "text-red-400" : ""}>
                                📅{" "}
                                {new Date(task.deadline).toLocaleDateString()}
                              </span>
                            )}
                            {task.priority && (
                              <span
                                className={
                                  task.priority === "high"
                                    ? "text-red-400"
                                    : task.priority === "medium"
                                    ? "text-yellow-400"
                                    : "text-slate-400"
                                }
                              >
                                {task.priority.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-4">Decisions</h2>
            <div className="space-y-3">
              {meeting.decisions?.length === 0 ? (
                <div className="bg-white/5 rounded-xl p-8 text-center text-slate-400">
                  No decisions found
                </div>
              ) : (
                meeting.decisions?.map((decision, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30"
                  >
                    <div className="font-semibold mb-2">
                      {decision.decision}
                    </div>
                    <div className="flex gap-3 text-sm text-slate-400">
                      {decision.type && <span>Type: {decision.type}</span>}
                      {decision.impact && (
                        <span>Impact: {decision.impact}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {meeting.transcript && (
              <div className="mt-8">
                <h2 className="text-2xl font-bold mb-4">
                  Transcript
                  {highlightSnippet && (
                    <span className="ml-2 text-xs font-normal text-indigo-300">
                      (jumped here from a chat citation)
                    </span>
                  )}
                </h2>
                <div className="bg-white/5 rounded-xl p-6 max-h-96 overflow-y-auto">
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans">
                    <TranscriptWithHighlight
                      transcript={meeting.transcript}
                      snippet={highlightSnippet}
                      highlightRef={highlightRef}
                    />
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Splits the transcript around `snippet` (as returned in a chat
 * citation) and wraps the match in a highlighted <mark>, so a citation
 * link can jump straight to the evidence instead of leaving the reader to
 * scan the whole transcript. Falls back to trying just the first ~60
 * characters of the snippet, since a citation snippet is chunk text
 * that's been through Python-side whitespace normalization and may not
 * match the raw transcript byte-for-byte; if neither matches, the
 * transcript still renders, just without a highlight. */
function TranscriptWithHighlight({
  transcript,
  snippet,
  highlightRef,
}: {
  transcript: string;
  snippet: string | null;
  highlightRef: React.MutableRefObject<HTMLElement | null>;
}) {
  if (!snippet) return <>{transcript}</>;

  let index = transcript.indexOf(snippet);
  let matched = snippet;
  if (index === -1 && snippet.length > 60) {
    matched = snippet.slice(0, 60);
    index = transcript.indexOf(matched);
  }
  if (index === -1) return <>{transcript}</>;

  return (
    <>
      {transcript.slice(0, index)}
      <mark ref={highlightRef as React.RefObject<HTMLElement>} className="rounded bg-indigo-500/40 px-0.5 text-white">
        {transcript.slice(index, index + matched.length)}
      </mark>
      {transcript.slice(index + matched.length)}
    </>
  );
}

export default function MeetingDetailPage() {
  return (
    <Suspense fallback={null}>
      <MeetingDetailInner />
    </Suspense>
  );
}
