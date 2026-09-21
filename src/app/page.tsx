// app/page.tsx
import Link from "next/link";

const featureHighlights = [
  {
    title: "ML-grade extraction",
    body: "TF-IDF + logistic regression classifiers (with an optional LLM pass) pull out tasks and decisions; VADER sentiment and a TextRank-style summary run alongside them.",
  },
  {
    title: "Grounded meeting chat",
    body: "Ask questions across every indexed meeting. Answers are retrieved from transcript chunks in a vector store and cited back to the meeting and chunk they came from -- never answered from the model's own memory.",
  },
  {
    title: "Thread memory",
    body: "Every analysis appends to a JSON chain per thread key, so a recurring meeting (e.g. a weekly standup) can be replayed as a timeline.",
  },
  {
    title: "One-click exports",
    body: "JSON and CSV exports of tasks and decisions, ready to hand off to another tool.",
  },
];

const pipeline = [
  {
    label: "Next.js App",
    detail: "Auth-gated workspace: analyzer, dashboard, meeting detail, and chat.",
  },
  {
    label: "API Bridge",
    detail:
      "`/api/analyze` routes traffic to the Python service, or falls back to TypeScript heuristics if it's unreachable.",
  },
  {
    label: "Aura Core (Python)",
    detail:
      "scikit-learn classifiers, VADER sentiment, TextRank summarizer, and the RAG layer: chunking, local embeddings, Chroma, retrieval, and grounded generation.",
  },
  {
    label: "Chat + Exports",
    detail: "Retrieval-augmented Q&A with citations, plus JSON/CSV exports of tasks and decisions.",
  },
];

export default function HomePage() {
  return (
    <div className="relative isolate overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.25),_transparent_55%)]" />
      </div>

      <section className="mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-24 pt-16 md:flex-row md:items-center">
        <div className="space-y-8 text-center md:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.4em] text-slate-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Local-first ML + RAG
          </span>
          <div className="space-y-4">
            <h1 className="text-4xl font-bold leading-tight text-white md:text-6xl">
              Turn meeting transcripts into searchable, cited meeting memory.
            </h1>
            <p className="text-lg text-slate-300 md:text-xl">
              Meeting Synth extracts tasks, decisions, and sentiment from a
              transcript, then indexes it so you can ask questions across
              every meeting you&apos;ve analyzed and get answers grounded in
              the actual transcript text.
            </p>
          </div>
          <div className="flex flex-col gap-4 text-sm font-semibold md:flex-row">
            <Link
              href="/dashboard"
              className="flex-1 rounded-2xl bg-white px-6 py-4 text-center text-slate-900 shadow-xl shadow-indigo-900/30"
            >
              View Dashboard
            </Link>
            <Link
              href="/analyze"
              className="flex-1 rounded-2xl border border-white/20 px-6 py-4 text-center text-white hover:border-white/40"
            >
              Analyze New Meeting
            </Link>
            <Link
              href="/chat"
              className="flex-1 rounded-2xl border border-white/20 px-6 py-4 text-center text-white hover:border-white/40"
            >
              Ask Your Meetings
            </Link>
          </div>
        </div>
      </section>

      <section
        id="pipeline"
        className="bg-gradient-to-b from-slate-950 to-slate-900 py-16"
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 lg:flex-row">
          <div className="space-y-4 lg:w-1/3">
            <p className="text-xs uppercase tracking-[0.4em] text-indigo-300">
              How it works
            </p>
            <h2 className="text-3xl font-semibold text-white">
              Extraction pipeline, then a retrieval layer on top.
            </h2>
            <p className="text-slate-300">
              A TypeScript fallback keeps the analyzer working even if the
              Python service is offline; retrieval-augmented chat always
              needs the Python service, since that&apos;s where the vector
              store and embeddings live.
            </p>
          </div>
          <div className="flex-1 space-y-4">
            {pipeline.map((stage, index) => (
              <div
                key={stage.label}
                className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-300">
                  {index + 1}
                </div>
                <div>
                  <p className="font-semibold text-white">{stage.label}</p>
                  <p className="text-sm text-slate-300">{stage.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 rounded-3xl border border-white/10 bg-slate-950/80 p-8 md:grid-cols-2">
          {featureHighlights.map((feature) => (
            <article
              key={feature.title}
              className="space-y-3 rounded-2xl border border-white/5 bg-white/5 p-6"
            >
              <h3 className="text-lg font-semibold text-white">
                {feature.title}
              </h3>
              <p className="text-sm text-slate-300">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-[32px] border border-indigo-500/30 bg-indigo-500/10 p-10 text-center">
          <p className="text-sm uppercase tracking-[0.5em] text-indigo-200">
            Try it
          </p>
          <h3 className="mt-4 text-3xl font-semibold text-white">
            Analyze a transcript, then ask it questions.
          </h3>
          <p className="mt-2 text-slate-200">
            Local dev today. See the README for setup and architecture.
          </p>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/analyze"
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg"
            >
              Try the analyzer
            </Link>
            <Link
              href="/register"
              className="rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white"
            >
              Create an account
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
