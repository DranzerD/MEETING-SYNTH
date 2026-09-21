# Meeting Synth x Aura Core

Meeting Synth is a product-ready **meeting intelligence workspace**: a polished Next.js front door backed by a FastAPI/ML engine you can deploy, white-label, and sell to RevOps or Success teams. Paste a transcript or upload a `.txt` file and Aura Core returns summaries, actions, decisions, sentiment, and exports that plug straight into CRM/PM stacks.

## Product value snapshot

- 🔒 **Local-first or hosted** – demo with the built-in TypeScript heuristics or point the UI at the Python FastAPI service for ML-grade outputs.
- 🧠 **ML classifiers** – TF-IDF + Logistic Regression models auto-train on bundled corpora and persist to `python_backend/models/`.
- 🧵 **Thread memory** – Every analysis appends to a JSON chain so QBRs can replay "chain of thought" evidence.
- 📦 **Downloadable artifacts** – JSON + CSV exports for instant handoff to Salesforce, Notion, Jira, etc.
- 🪄 **Sales-ready experience** – Hero landing page, analyzer workspace, login/register flows, and CTA surfaces are already styled for demos.

## Repository tour

| Area                                          | Purpose                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/app`                                     | Next.js App Router workspace (landing, auth pages, analyzer UI, API route).                 |
| `src/app/lib/aura/*`                          | TypeScript heuristics (fallback pipeline when Python service is offline).                   |
| `python_backend/aura_core/*`                  | Aura Core ML modules: preprocessing, classifiers, sentiment, summarizer, memory, exporters. |
| `python_backend/api_server.py`                | FastAPI surface exposing `POST /analyze` and thread retrieval.                              |
| `python_backend/aura_cli.py`                  | CLI for offline analysis + export to JSON/CSV.                                              |
| `public/examples` + `python_backend/examples` | Sample transcripts for instant demos.                                                       |

## Quickstart

```bash
# 1) Frontend workspace
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) for the marketing page or go straight to [http://localhost:3000/analyze](http://localhost:3000/analyze) for the live workspace.

```bash
# 2) Aura Core ML backend
cd python_backend
python -m venv .venv && .venv/Scripts/activate  # or reuse your preferred env
python -m pip install -r requirements.txt
python -m uvicorn api_server:app --reload  # serves http://localhost:8000/analyze
```

Once the FastAPI service is running, create a `.env.local` at the repo root (or copy `.env.example`) and point the Next.js app to it:

```bash
AURA_PY_API_URL=http://localhost:8000
```

Restart `npm run dev`. The `/api/analyze` route will now proxy transcripts to FastAPI and return the ML payload (tasks, decisions, sentiment, thread timeline). If the env var is missing, the UI automatically falls back to the TypeScript heuristics, making demos possible even without Python running.

## Demo workflow

1. Navigate to `/analyze`.
2. Load a sample transcript or upload a `.txt` file.
3. (Optional) Provide a Meeting ID + Thread key so the FastAPI memory store links multiple sessions.
4. Click **Analyze transcript**.
5. Scroll through stats, summaries, action items, decision logs, sentiment, and the chain-of-thought timeline.
6. Download JSON or CSV exports and drop them into your CRM/BI tooling.

## Python backend highlights

- `aura_core/models.py` seeds TF-IDF + LogisticRegression classifiers and caches them under `python_backend/models/`.
- `sentiment.py` wraps VADER and enriches it with quick emotion heuristics.
- `summarizer.py` implements a TextRank-inspired extractive summary.
- `memory.py` appends every run into a JSON file for thread reconstruction.
- `pipeline.py` orchestrates preprocessing → models → exporters so both CLI and FastAPI stay in sync.

Run the CLI without the UI at any time:

```bash
python aura_cli.py examples/meeting_1.txt --thread sprint-42 --pretty
```

## Go-to-market blueprint

- **Self-serve**: Deploy the Next.js workspace to Vercel/Fly/Netlify. Bundle the FastAPI backend onto Render, Railway, Azure, or an internal VM. Configure `AURA_PY_API_URL` per environment.
- **Managed enterprise**: Host Aura Core inside the customer’s VPC for compliance while keeping the React UI in your cloud. The API proxy keeps the UX identical.
- **Professional services upsell**: Extend `exporters.py` to push summaries straight into Salesforce, HubSpot, or Snowflake for premium tiers.

## Need to customize?

- Swap in your own training data inside `python_backend/aura_core/bootstrap_data.py`.
- Drop additional pipelines into `src/app/lib/aura` for on-device heuristics or multilingual handling.
- Update `src/app/analyze/page.tsx` to surface extra KPIs, or build PDF exports from the JSON payload.

Everything in this repo is wired for local demos today and production deploys tomorrow—so you can confidently pitch it as a sellable product.
