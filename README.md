# Meeting Synth

Paste a meeting transcript, get structured tasks/decisions/sentiment from a local ML pipeline,
then ask grounded questions across every meeting you've analyzed via a retrieval-augmented chat
layer with citations back to the source transcript.

```
Transcript -> extraction (TF-IDF classifiers, VADER, TextRank) -> tasks/decisions/sentiment
           -> chunk -> embed -> Chroma                          -> background index

Question -> embed -> ANN search -> rerank -> relevance gate -> LLM -> cited answer
```

## Features

- **Extraction pipeline** -- TF-IDF + logistic regression classifiers (trained locally), VADER
  sentiment, TextRank summarization. Falls back to a TypeScript heuristic pipeline if the Python
  service is down.
- **RAG chat** -- every meeting is chunked, embedded, and indexed in Chroma. `/chat` retrieves,
  reranks with a cross-encoder, and answers only when there's enough evidence -- otherwise it
  says so instead of guessing. Every answer is cited back to a meeting/chunk/speaker.
- **Real auth** -- bcrypt password hashing, HMAC-signed sessions, middleware-gated pages.
- **Measured, not assumed** -- a retrieval evaluation harness (Recall@K/Precision@K/MRR/refusal
  accuracy) and cross-validated ML benchmarks back every number below.

## Tech stack

Next.js 15 (App Router) + TypeScript · FastAPI · scikit-learn · sentence-transformers · Chroma ·
MongoDB (auth) · Groq/OpenAI/Anthropic (chat, provider-agnostic fallback)

## Setup

```bash
# Backend
cd python_backend
python -m venv .venv && .venv\Scripts\activate   # or: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # set GROQ_API_KEY (or OpenAI/Anthropic)
uvicorn api_server:app --reload

# Frontend (new terminal)
cp .env.example .env.local  # set MONGODB_URI, AURA_PY_API_URL, SESSION_SECRET
npm install && npm run dev
```

Open `http://localhost:3000`, register, analyze a sample transcript, then ask about it in `/chat`.

## Tests & evaluation

```bash
cd python_backend && pip install -r requirements-dev.txt && pytest tests/ -v   # 72 tests
npm test                                                                       # 56 tests

python -m rag_eval.run_retrieval_eval --top-k 3 5     # retrieval quality
python benchmark.py                                     # ML classifier CV metrics
python benchmark_retrieval.py --corpus-size 50 --queries 30   # retrieval latency
```

## Measured results

All numbers below are from `python_backend/results/*.json` -- real, reproducible runs against
this code, not estimates. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#measured-results) for
the full breakdown and methodology.

| | Result |
| --- | --- |
| Task classifier (5-fold CV) | 73.2% ± 6.5% F1 |
| Decision classifier (4-fold CV) | 35.7% ± 8.0% F1 |
| Retrieval Recall@5 / MRR (with reranking) | 1.00 / 0.967 |
| Retrieval latency, with / without reranking | 140.6ms / 12.3ms mean |
| Automated tests | 128 (72 pytest + 56 Vitest), all passing |

## Known limitations

Single shared workspace (no multi-tenancy), JSON-file meeting storage (fine at this scale, not
past a few hundred meetings), no claim-level faithfulness checking, no streaming. Full list and
reasoning in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#known-limitations).

## More detail

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the full architecture diagram, the RAG pipeline
stage-by-stage, why each technology was chosen (with tradeoffs), the complete measured-results
breakdown, security notes, and remaining work.
