// app/page.tsx
import Link from "next/link";

const featureHighlights = [
  {
    title: "ML-grade insights",
    body: "Logistic regression classifiers, TextRank summaries, and sentiment tagging run locally inside Aura Core.",
  },
  {
    title: "Thread memory",
    body: "Every meeting snapshot is chained so reps can replay context and prove decisions across cycles.",
  },
  {
    title: "One-click exports",
    body: "Ship JSON + CSV artifacts to CRMs, PM tools, or investor updates without custom scripts.",
  },
  {
    title: "No vendor lock-in",
    body: "Next.js frontend + FastAPI backend means you can self-host, white-label, or extend via SDKs.",
  },
];

const proofPoints = [
  { label: "Avg. prep time saved", value: "37 min" },
  { label: "Decisions captured", value: "12k+" },
  { label: "Enterprise pilots", value: "5" },
];

const pipeline = [
  {
    label: "Next.js App",
    detail:
      "Secure workspace experience with auth, reviewer views, and download surfaces.",
  },
  {
    label: "API Bridge",
    detail:
      "`/api/analyze` routes traffic to Aura Core (Python) or falls back to TS heuristics for offline demos.",
  },
  {
    label: "Aura Core (Python)",
    detail:
      "Scikit-learn classifiers, VADER sentiment, TextRank summarizer, thread memory persistence.",
  },
  {
    label: "Exports",
    detail:
      "JSON + CSV packages feed CRM, BI, or revops automations. Ready for SOC2-friendly hosting.",
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
            Production ready
          </span>
          <div className="space-y-4">
            <h1 className="text-4xl font-bold leading-tight text-white md:text-6xl">
              Meeting intelligence teams actually open after the call.
            </h1>
            <p className="text-lg text-slate-300 md:text-xl">
              Aura Synth ingests raw transcripts, distills decisions, and
              packages everything your revenue operations stack needs.
              Local-first today, cloud when you are.
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
          <div className="grid gap-4 py-4 sm:grid-cols-3">
            {proofPoints.map((point) => (
              <div
                key={point.label}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left"
              >
                <p className="text-2xl font-bold text-white">{point.value}</p>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  {point.label}
                </p>
              </div>
            ))}
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
              How it ships
            </p>
            <h2 className="text-3xl font-semibold text-white">
              Local first, cloud when you need it.
            </h2>
            <p className="text-slate-300">
              Offline-first TypeScript fallbacks for demos, or route to Aura
              Core (FastAPI) for production-grade ML.
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
            Ready?
          </p>
          <h3 className="mt-4 text-3xl font-semibold text-white">
            Turn meeting notes into auditable intelligence.
          </h3>
          <p className="mt-2 text-slate-200">
            Local dev today. Enterprise cloud tomorrow.
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
              Create workspace login
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
