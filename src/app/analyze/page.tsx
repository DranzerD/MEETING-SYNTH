"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { AuraAnalysis } from "@/app/lib/aura/types";
import {
  validateTranscript,
  validateMeetingTitle,
  formatFileSize,
} from "../lib/validation";

const SAMPLE_FILES = [
  { label: "Project planning", path: "/examples/meeting_1.txt" },
  { label: "Budget review", path: "/examples/meeting_2.txt" },
];

function downloadFile(filename: string, contents: string, mime = "text/plain") {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AnalyzePage() {
  const [transcript, setTranscript] = useState("");
  const [analysis, setAnalysis] = useState<AuraAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [threadKey, setThreadKey] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [savedMeetingId, setSavedMeetingId] = useState<string | null>(null);
  const [charCount, setCharCount] = useState(0);
  const [fileSize, setFileSize] = useState(0);
  const insightHighlights = useMemo(() => {
    if (!analysis) return [];
    const firstTask = analysis.tasks?.[0];
    const firstDecision = analysis.decisions?.[0];
    const tone = analysis.sentiment?.label;
    return [
      firstTask
        ? {
            label: "Next owner",
            value: firstTask.assignee || "Unassigned",
            detail: firstTask.task,
          }
        : null,
      firstDecision
        ? {
            label: "Latest commitment",
            value: firstDecision.type,
            detail: firstDecision.decision,
          }
        : null,
      tone
        ? {
            label: "Room temperature",
            value: tone,
            detail: `${Math.round(
              analysis.sentiment.confidence * 100
            )}% confidence`,
          }
        : null,
    ].filter(Boolean) as { label: string; value: string; detail?: string }[];
  }, [analysis]);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setTranscript(text);
    setCharCount(text.length);
    setFileSize(new Blob([text]).size);
  };

  const loadSample = useCallback(async (path: string) => {
    const response = await fetch(path);
    const text = await response.text();
    setTranscript(text);
  }, []);

  const submitAnalysis = async () => {
    if (!transcript.trim()) {
      setError("Please paste or upload a transcript first.");
      return;
    }

    // Client-side validation
    const transcriptValidation = validateTranscript(transcript);
    if (!transcriptValidation.valid) {
      setError(transcriptValidation.error || "Invalid transcript");
      return;
    }

    const titleValidation = validateMeetingTitle(
      meetingTitle || meetingId || "Untitled Meeting"
    );
    if (!titleValidation.valid) {
      setError(titleValidation.error || "Invalid meeting title");
      return;
    }

    setError(null);
    setLoading(true);
    setAnalysis(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          meetingId: meetingId || undefined,
          thread: threadKey || undefined,
          title: meetingTitle || meetingId || "Untitled Meeting",
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Unable to analyze transcript");
      }
      setAnalysis(data.analysis);
      setSavedMeetingId(data.analysis.meeting_id);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Unexpected error. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadJson = () => {
    if (!analysis) return;
    downloadFile(
      analysis.exports.jsonFilename,
      JSON.stringify(analysis, null, 2),
      "application/json"
    );
  };

  const handleDownloadCsv = (type: "tasks" | "decisions") => {
    if (!analysis) return;
    const filename = `${type}_${analysis.exports.jsonFilename.replace(
      ".json",
      ".csv"
    )}`;
    const payload =
      type === "tasks"
        ? analysis.exports.tasksCsv
        : analysis.exports.decisionsCsv;
    downloadFile(filename, payload, "text/csv");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-indigo-300">
            Aura Analyzer Workspace
          </p>
          <h1 className="text-4xl font-semibold md:text-5xl">
            Sellable insights, generated in seconds.
          </h1>
          <p className="mx-auto max-w-3xl text-lg text-slate-300">
            Operate the polished workspace your customers will live in. Aura
            Core stitches logistic classifiers, TextRank summaries, and
            sentiment analysis into a single export-ready report.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-slate-400">
            <span className="rounded-full border border-white/10 px-3 py-1">
              POST /api/analyze
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1">
              FastAPI bridge via AURA_PY_API_URL
            </span>
            <Link
              href="/dashboard"
              className="rounded-full border border-white/10 px-3 py-1 transition hover:text-white"
            >
              View Dashboard
            </Link>
            <Link
              href="/chat"
              className="rounded-full border border-white/10 px-3 py-1 transition hover:text-white"
            >
              Chat with meetings
            </Link>
            <Link
              href="/"
              className="rounded-full border border-white/10 px-3 py-1 transition hover:text-white"
            >
              Back to landing
            </Link>
          </div>
        </header>

        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-200">
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4 md:flex-row md:items-center md:justify-between">
            <p>
              <span className="font-semibold text-white">Pro tip:</span> Run the
              FastAPI server in `python_backend` and set `AURA_PY_API_URL` so
              this UI proxies into the ML classifiers. Without it we fall back
              to the TypeScript heuristics.
            </p>
            <Link
              href="https://github.com/rupaoruganti/meeting-synth/blob/main/README.md#python-backend-highlights"
              target="_blank"
              className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.3em] text-indigo-200"
            >
              View setup guide
            </Link>
          </div>
        </div>

        <section className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-200 mb-2 block">
                Meeting Title *
              </label>
              <input
                type="text"
                value={meetingTitle}
                onChange={(event) => setMeetingTitle(event.target.value)}
                placeholder="e.g., Sprint Planning - Dec 22"
                className="w-full px-4 py-2 rounded-xl border border-slate-800 bg-slate-900/60 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-200 mb-2 block">
                Transcript *
              </label>
              <textarea
                className="w-full h-64 rounded-2xl bg-slate-900/80 border border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 px-4 py-3 text-sm"
                placeholder="Paste meeting notes, retro minutes, project debriefs..."
                value={transcript}
                onChange={(event) => {
                  const value = event.target.value;
                  setTranscript(value);
                  setCharCount(value.length);
                  setFileSize(new Blob([value]).size);
                  setError(null); // Clear errors on input
                }}
              />
              <div className="flex justify-between items-center mt-2 text-xs text-slate-400">
                <span
                  className={
                    charCount < 50
                      ? "text-red-400"
                      : charCount > 500000
                      ? "text-red-400"
                      : "text-slate-400"
                  }
                >
                  {charCount.toLocaleString()} / 500,000 characters
                  {charCount < 50 && " (minimum 50)"}
                  {charCount > 500000 && " (exceeds maximum!)"}
                </span>
                <span>{formatFileSize(fileSize)}</span>
              </div>
              <div className="flex flex-wrap gap-3 mt-3 text-sm">
                <label className="px-4 py-2 rounded-xl border border-slate-800 text-slate-200 hover:border-indigo-500 cursor-pointer transition">
                  📎 Upload .txt file
                  <input
                    type="file"
                    accept=".txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                {SAMPLE_FILES.map((sample) => (
                  <button
                    key={sample.path}
                    onClick={() => loadSample(sample.path)}
                    className="px-4 py-2 rounded-xl border border-slate-800 text-slate-200 hover:border-indigo-500 hover:text-white transition"
                  >
                    📄 {sample.label}
                  </button>
                ))}
              </div>
            </div>

            <details className="rounded-2xl border border-slate-800 bg-slate-900/60">
              <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-slate-200 hover:text-white">
                ⚙️ Advanced Options (Optional)
              </summary>
              <div className="px-4 pb-4 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Meeting ID
                  </label>
                  <input
                    type="text"
                    value={meetingId}
                    onChange={(event) => setMeetingId(event.target.value)}
                    placeholder="Q1-kickoff-01"
                    className="w-full px-4 py-2 rounded-xl border border-slate-800 bg-slate-900/60"
                  />
                  <p className="text-xs text-slate-500">
                    Custom ID for exports and tracking
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Thread key
                  </label>
                  <input
                    type="text"
                    value={threadKey}
                    onChange={(event) => setThreadKey(event.target.value)}
                    placeholder="sprint-42"
                    className="w-full px-4 py-2 rounded-xl border border-slate-800 bg-slate-900/60"
                  />
                  <p className="text-xs text-slate-500">
                    Group related meetings together
                  </p>
                </div>
              </div>
            </details>

            <button
              onClick={submitAnalysis}
              disabled={loading || !transcript.trim() || !meetingTitle.trim()}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 font-semibold shadow-lg shadow-indigo-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "🔄 Analyzing…" : "✨ Analyze Meeting"}
            </button>

            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-red-400 font-semibold">⚠️ Error</p>
                    <p className="text-red-300 text-sm mt-1">{error}</p>
                  </div>
                  {(error.includes("timeout") ||
                    error.includes("failed") ||
                    error.includes("Unable")) && (
                    <button
                      onClick={submitAnalysis}
                      className="px-3 py-1 text-sm bg-red-500/30 hover:bg-red-500/40 rounded-lg transition-colors"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            )}

            {savedMeetingId && !loading && (
              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 space-y-3">
                <p className="text-green-400 font-semibold flex items-center gap-2">
                  ✅ Meeting analyzed and saved!
                </p>
                <div className="flex gap-2">
                  <Link
                    href={`/meetings/${savedMeetingId}`}
                    className="flex-1 px-4 py-2 rounded-xl bg-white text-slate-900 font-semibold text-center hover:bg-slate-100 transition"
                  >
                    View Details
                  </Link>
                  <Link
                    href="/dashboard"
                    className="flex-1 px-4 py-2 rounded-xl border border-white/20 text-white font-semibold text-center hover:bg-white/10 transition"
                  >
                    Go to Dashboard
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
            <div>
              <h2 className="text-xl font-semibold">What you get</h2>
              <p className="text-sm text-slate-400">
                This UI is the exact experience prospects will see. Use it
                during sales calls or ship it as a customer-facing workspace.
              </p>
            </div>
            <ul className="space-y-3 text-sm text-slate-300">
              <li>
                • ML-powered action items, decisions, sentiment, and summaries.
              </li>
              <li>• Thread timeline that proves history during QBRs.</li>
              <li>
                • JSON/CSV exports for CRMs, PM tools, or investor briefs.
              </li>
            </ul>
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm">
              <p className="font-semibold text-white">Deployment-ready</p>
              <p className="text-slate-400">
                Host the Next.js front-end anywhere (Vercel, Azure, Fly) and
                point it at a FastAPI instance (Render, ECS, customer VPC). Zero
                vendor lock-in.
              </p>
            </div>
          </div>
        </section>

        {analysis && (
          <section className="space-y-10">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleDownloadJson}
                className="px-5 py-2 rounded-xl border border-slate-800 hover:border-indigo-500 transition text-sm"
              >
                Download JSON
              </button>
              <button
                onClick={() => handleDownloadCsv("tasks")}
                className="px-5 py-2 rounded-xl border border-slate-800 hover:border-indigo-500 transition text-sm"
              >
                Export tasks CSV
              </button>
              <button
                onClick={() => handleDownloadCsv("decisions")}
                className="px-5 py-2 rounded-xl border border-slate-800 hover:border-indigo-500 transition text-sm"
              >
                Export decisions CSV
              </button>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <StatsCard label="Words" value={analysis.stats.wordCount} />
              <StatsCard
                label="Sentences"
                value={analysis.stats.sentenceCount}
              />
              <StatsCard label="Tasks" value={analysis.stats.taskCount} />
              <StatsCard
                label="Decisions"
                value={analysis.stats.decisionCount}
              />
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-center">
                <p className="text-sm text-slate-500">Generated at</p>
                <p className="text-lg font-semibold text-white">
                  {analysis.stats.generatedAt || "--"}
                </p>
              </div>
            </div>

            {insightHighlights.length > 0 && (
              <section className="grid gap-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 md:grid-cols-3">
                {insightHighlights.map((highlight) => (
                  <div
                    key={highlight.label}
                    className="space-y-1 rounded-2xl border border-white/5 bg-white/5 p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
                      {highlight.label}
                    </p>
                    <p className="text-2xl font-semibold capitalize text-white">
                      {highlight.value}
                    </p>
                    {highlight.detail && (
                      <p className="text-sm text-slate-300">
                        {highlight.detail}
                      </p>
                    )}
                  </div>
                ))}
              </section>
            )}

            <div className="grid lg:grid-cols-2 gap-8">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
                <h3 className="text-xl font-semibold">Summary</h3>
                <p className="text-slate-300 leading-relaxed">
                  {analysis.summary.summaryText || "No summary available."}
                </p>
                <ul className="text-sm text-slate-500 list-disc pl-4">
                  {analysis.summary.sentences.map((sentence, index) => (
                    <li key={index}>{sentence}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
                <h3 className="text-xl font-semibold">Sentiment</h3>
                <p className="text-3xl font-bold capitalize text-indigo-400">
                  {analysis.sentiment.label}
                </p>
                <p className="text-sm text-slate-400">
                  Confidence {analysis.sentiment.confidence} • Emotion{" "}
                  {analysis.sentiment.emotion}
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                    <p className="text-slate-500">Positive hits</p>
                    <p className="text-xl font-semibold text-emerald-400">
                      {analysis.sentiment.positiveScore}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                    <p className="text-slate-500">Negative hits</p>
                    <p className="text-xl font-semibold text-rose-400">
                      {analysis.sentiment.negativeScore}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {analysis.thread && analysis.thread.history?.length ? (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
                <header className="flex flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">Chain of thought</h3>
                    <p className="text-sm text-slate-400">
                      {analysis.thread.history.length} linked meetings
                    </p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    {analysis.thread.key}
                  </span>
                </header>
                <div className="space-y-3">
                  {analysis.thread.history.map((entry, index) => (
                    <div
                      key={`${entry.meeting_id}-${entry.timestamp}-${index}`}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-slate-100 font-semibold">
                          {entry.meeting_id}
                        </p>
                        <p className="text-slate-500">{entry.timestamp}</p>
                      </div>
                      <p className="mt-2 text-slate-300">{entry.summary}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                        <span className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1">
                          sentiment {entry.sentiment}
                        </span>
                        <span className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1">
                          tasks {entry.tasks_open}
                        </span>
                        <span className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1">
                          decisions {entry.decisions_made}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="space-y-6">
              <header className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-semibold">Action items</h3>
                  <p className="text-sm text-slate-500">
                    Confidence from ML classifier scores
                  </p>
                </div>
                <span className="text-xs uppercase tracking-[0.4em] text-slate-500">
                  TF-IDF + LogisticRegression
                </span>
              </header>
              <div className="grid lg:grid-cols-2 gap-4">
                {analysis.tasks.length === 0 && (
                  <p className="text-slate-500">No task language detected.</p>
                )}
                {analysis.tasks.map((task) => (
                  <div
                    key={task.sentence}
                    className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-2"
                  >
                    <p className="font-semibold text-slate-100">{task.task}</p>
                    <p className="text-sm text-slate-400">{task.sentence}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                      <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {task.assignee}
                      </span>
                      <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        Priority {task.priority}
                      </span>
                      {task.deadline && (
                        <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                          {task.deadline}
                        </span>
                      )}
                      <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700">
                        {Math.round(task.confidence * 100)}% confidence
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-6">
              <header className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-semibold">Decision log</h3>
                  <span className="text-sm text-slate-500">
                    Tagged by type + impact
                  </span>
                </div>
                <span className="text-xs uppercase tracking-[0.4em] text-slate-500">
                  Narrative evidence
                </span>
              </header>
              <div className="space-y-4">
                {analysis.decisions.length === 0 && (
                  <p className="text-slate-500">
                    No decision language detected.
                  </p>
                )}
                {analysis.decisions.map((decision) => (
                  <div
                    key={decision.sentence}
                    className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-2"
                  >
                    <p className="font-semibold text-slate-100">
                      {decision.decision}
                    </p>
                    <p className="text-sm text-slate-400">
                      {decision.sentence}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                      <span className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-200 border border-purple-500/20 capitalize">
                        {decision.type}
                      </span>
                      <span className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-200 border border-rose-500/20 capitalize">
                        impact {decision.impact}
                      </span>
                      {decision.participants.length > 0 && (
                        <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700">
                          {decision.participants.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-center">
              <p className="text-xs uppercase tracking-[0.4em] text-indigo-200">
                Need client-ready PDFs?
              </p>
              <h4 className="mt-3 text-2xl font-semibold text-white">
                Pipe these exports into your quoting or success stack.
              </h4>
              <p className="mt-2 text-sm text-slate-400">
                JSON + CSV outputs live under `analysis.exports`. Hook them to
                HubSpot, Salesforce, Notion—whatever your go-to-market motion
                needs.
              </p>
            </section>
          </section>
        )}
      </div>
    </div>
  );
}

function StatsCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-center">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}
