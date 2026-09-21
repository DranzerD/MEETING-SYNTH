"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Meeting = {
  meeting_id: string;
  title: string;
  timestamp: string;
};

type Citation = {
  index: number;
  chunk_id: string;
  meeting_id: string;
  chunk_index: number;
  snippet: string;
  score: number;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  model?: string | null;
  retrievalLatencyMs?: number;
  generationLatencyMs?: number;
  isError?: boolean;
};

export default function ChatPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [selectedMeetingIds, setSelectedMeetingIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/meetings")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setMeetings(data.meetings || []);
      })
      .catch(() => {
        // Non-fatal: the meeting picker just stays empty and queries run
        // unscoped (search everything indexed).
      })
      .finally(() => setMeetingsLoading(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const toggleMeeting = (id: string) => {
    setSelectedMeetingIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const sendQuestion = useCallback(async () => {
    const question = input.trim();
    if (!question || loading) return;

    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          meetingIds: selectedMeetingIds.length ? selectedMeetingIds : undefined,
          topK: 5,
          history,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data?.error || "Something went wrong answering that.", isError: true },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          citations: data.citations || [],
          model: data.model,
          retrievalLatencyMs: data.retrieval_latency_ms,
          generationLatencyMs: data.generation_latency_ms,
        },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: message, isError: true }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, selectedMeetingIds]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendQuestion();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-16 space-y-8">
        <header className="space-y-4 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-indigo-300">
            Aura Chat
          </p>
          <h1 className="text-4xl font-semibold md:text-5xl">
            Ask your meetings anything.
          </h1>
          <p className="mx-auto max-w-3xl text-lg text-slate-300">
            Retrieval-augmented Q&amp;A across every indexed meeting. Every
            answer is grounded in retrieved transcript chunks and cited back
            to the meeting and chunk it came from.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-slate-400">
            <span className="rounded-full border border-white/10 px-3 py-1">
              POST /api/query
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1">
              Chroma + sentence-transformers + Groq
            </span>
            <Link
              href="/analyze"
              className="rounded-full border border-white/10 px-3 py-1 transition hover:text-white"
            >
              Analyze a meeting
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-white/10 px-3 py-1 transition hover:text-white"
            >
              Dashboard
            </Link>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 lg:h-fit lg:sticky lg:top-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Scope</h2>
              {selectedMeetingIds.length > 0 && (
                <button
                  onClick={() => setSelectedMeetingIds([])}
                  className="text-xs text-indigo-300 hover:text-indigo-200"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {selectedMeetingIds.length === 0
                ? "Searching every indexed meeting."
                : `Scoped to ${selectedMeetingIds.length} meeting${selectedMeetingIds.length > 1 ? "s" : ""}.`}
            </p>

            {meetingsLoading && (
              <p className="text-xs text-slate-500">Loading meetings…</p>
            )}
            {!meetingsLoading && meetings.length === 0 && (
              <p className="text-xs text-slate-500">
                No meetings yet.{" "}
                <Link href="/analyze" className="text-indigo-300 hover:text-indigo-200">
                  Analyze one
                </Link>{" "}
                to start indexing.
              </p>
            )}

            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {meetings.map((meeting) => (
                <label
                  key={meeting.meeting_id}
                  className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs transition hover:border-indigo-500"
                >
                  <input
                    type="checkbox"
                    checked={selectedMeetingIds.includes(meeting.meeting_id)}
                    onChange={() => toggleMeeting(meeting.meeting_id)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-semibold text-slate-100">
                      {meeting.title || meeting.meeting_id}
                    </span>
                    <span className="block text-slate-500">{meeting.meeting_id}</span>
                  </span>
                </label>
              ))}
            </div>
          </aside>

          <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60">
            <div
              ref={scrollRef}
              className="flex h-[520px] flex-col gap-4 overflow-y-auto p-6"
            >
              {messages.length === 0 && (
                <div className="m-auto max-w-md text-center text-sm text-slate-500">
                  Ask something like &ldquo;What did we decide about the
                  budget?&rdquo; or &ldquo;What is Miguel supposed to
                  deliver?&rdquo; Answers are grounded only in what&apos;s
                  been indexed -- analyze a meeting first if the answer
                  should exist but isn&apos;t found.
                </div>
              )}

              {messages.map((message, index) => (
                <MessageBubble key={index} message={message} />
              ))}

              {loading && (
                <div className="flex items-center gap-2 self-start rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
                  Retrieving relevant chunks and generating an answer…
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 p-4">
              <div className="flex items-end gap-3">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question about your indexed meetings…"
                  rows={2}
                  className="flex-1 resize-none rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={sendQuestion}
                  disabled={loading || !input.trim()}
                  className="rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 font-semibold shadow-lg shadow-indigo-900/40 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "…" : "Ask"}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Enter to send · Shift+Enter for a new line
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex flex-col ${isUser ? "items-end self-end" : "items-start self-start"} max-w-[85%]`}>
      <div
        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white"
            : message.isError
            ? "border border-red-500/30 bg-red-500/10 text-red-300"
            : "border border-slate-800 bg-slate-950 text-slate-100"
        }`}
      >
        {message.content}
      </div>

      {!isUser && !message.isError && (message.citations?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {message.citations!.map((citation) => (
            <div
              key={citation.chunk_id}
              title={citation.snippet}
              className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-200"
            >
              [{citation.index}] {citation.meeting_id} · chunk {citation.chunk_index} ·{" "}
              {Math.round(citation.score * 100)}% match
            </div>
          ))}
        </div>
      )}

      {!isUser && !message.isError && message.retrievalLatencyMs !== undefined && (
        <p className="mt-1 text-[11px] text-slate-600">
          {message.model ? `${message.model} · ` : ""}
          retrieval {message.retrievalLatencyMs}ms · generation{" "}
          {message.generationLatencyMs}ms
        </p>
      )}
    </div>
  );
}
