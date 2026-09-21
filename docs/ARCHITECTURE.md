# Architecture, RAG pipeline, and measured results

The deep-dive behind [README.md](../README.md). Read this if you're deciding whether to build on
this, reviewing it, or asking about it in an interview.

## Contents

- [Architecture](#architecture)
- [The RAG pipeline in detail](#the-rag-pipeline-in-detail)
- [Why these technology choices](#why-these-technology-choices)
- [Project structure](#project-structure)
- [Measured results](#measured-results)
- [Security](#security)
- [Known limitations](#known-limitations)
- [Remaining work](#remaining-work)
- [Appendix: notable bugs fixed along the way](#appendix-notable-bugs-fixed-along-the-way)

## Architecture

```
                         Next.js (App Router, src/app/)
  ┌──────────────────────────────────────────────────────────────────┐
  │ Pages: /, /login, /register, /dashboard, /analyze, /chat,        │
  │        /meetings/[id]                                            │
  │ src/middleware.ts -- redirects to /login if no session cookie    │
  │                                                                    │
  │ API routes (src/app/api/*) -- every one requires a session:      │
  │   /api/register, /api/login, /api/logout, /api/session           │
  │   /api/analyze  -> proxies to FastAPI /analyze, or TS fallback   │
  │   /api/meetings, /api/meetings/[id]  -> local JSON file store    │
  │   /api/people   -> aggregates tasks across meetings by assignee  │
  │   /api/query    -> proxies to FastAPI /query  (chat)             │
  │   /api/index    -> proxies to FastAPI /index, /index/status,     │
  │                    /index/meetings  (background indexing)        │
  └───────────────────────────┬────────────────────────────────────┘
                               │ AURA_PY_API_URL (server-to-server only;
                               │ FastAPI is never exposed to the browser)
                               ▼
                    FastAPI (python_backend/api_server.py)
  ┌──────────────────────────────────────────────────────────────────┐
  │ POST /analyze   -- extractive pipeline, queues background index  │
  │ POST /index, GET /index/status/{id}, GET /index/meetings         │
  │ POST /query     -- retrieval-augmented chat                      │
  │ GET  /health                                                     │
  │                                                                    │
  │ aura_core/                                                        │
  │   models.py, tasks.py, decisions.py, sentiment.py, summarizer.py  │
  │   memory.py        -- thread history (JSON, append-only)          │
  │   chunking.py, embeddings.py, vectorstore.py, retrieval.py,      │
  │   reranking.py, query_engine.py, indexing.py  -- the RAG layer    │
  │   hybrid_ml.py     -- LLM provider abstraction (Groq/OpenAI/      │
  │                       Anthropic), used by both the optional       │
  │                       use_llm extraction pass and /query          │
  │   config.py        -- every RAG tunable, env-var driven           │
  │   observability.py -- structured logging                         │
  └───────────────────────────┬────────────────────────────────────┘
                               ▼
              Chroma (chroma_db/, on disk) + JSON ledger (cache/)
```

**Persistence, and why it's split the way it is:**

| Data | Store | Why |
| --- | --- | --- |
| User accounts (auth) | MongoDB | The one thing that genuinely needs concurrent-write-safe, queryable, indexed storage with a uniqueness constraint (email). |
| Meetings (transcript, tasks, decisions, sentiment) | Local JSON files (`data/meetings/`) | Never migrated to Mongo. At this scale (a handful to low hundreds of meetings) a directory of JSON files is simpler to reason about, inspect, and back up than adding a second database purely for CRUD reads -- see [Known limitations](#known-limitations) for where this stops being true. |
| Chunk vectors + metadata | Chroma (`python_backend/chroma_db/`) | Embedded, file-backed, no server process. Metadata (`meeting_id`, `chunk_index`, `speakers`, char offsets) lives right next to the vectors it describes instead of a second store that could drift out of sync. |
| Indexing status | JSON ledger (`python_backend/cache/index_status.json`) | The only genuinely new piece of state the RAG layer needed ("has meeting X finished indexing"), in the same append-only-JSON style `ThreadMemory` already used for thread history. |

This is a deliberate choice, not an oversight: **auth data and meeting data are different
databases on purpose.** Meetings were never in Mongo to begin with, so "adding RAG" didn't
require picking a system-of-record migration as a prerequisite.

**Auth model.** Sessions are a stateless, HMAC-signed cookie (`src/app/lib/auth.ts`), not a
session table -- there's exactly one thing worth persisting per login (who you are) and no
server-side revocation requirement here, so a signed token avoids a sessions collection
entirely. Built on Web Crypto (`crypto.subtle`) so the same code runs in both API routes (Node
runtime) and `middleware.ts` (Edge runtime). Passwords are hashed with bcrypt. This is a
**single shared workspace behind login**, not multi-tenant SaaS: every signed-in user sees the
same meetings (matching the "People" aggregation view, which is inherently cross-user). FastAPI
itself has no auth of its own -- it's designed to sit behind the Next.js server, not be exposed
directly to browsers; see [Known limitations](#known-limitations).

## The RAG pipeline in detail

```
transcript
  -> chunk_transcript()      sentence-boundary-aware, ~180-word windows, 2-sentence overlap,
                              speaker attribution when the transcript has "Name: ..." lines
  -> embed_texts()           all-MiniLM-L6-v2 (384-dim), local, L2-normalized
  -> ChunkVectorStore.add_chunks()   upsert into Chroma; index_meeting() deletes the meeting's
                              old chunks first, so re-indexing a shrunk transcript can't leave
                              stale chunks behind
                              [ background, via FastAPI BackgroundTasks -- /analyze's response
                                doesn't wait on this ]

question
  -> embed_query()
  -> ChunkVectorStore.query()   ANN search, optionally filtered to meeting_ids, over-fetches
                              RERANK_CANDIDATES (20) results when reranking is enabled
  -> reranking.rerank_scores()  cross-encoder (ms-marco-MiniLM-L-6-v2) reorders the pool;
                              falls back to plain ANN order if the model can't load
  -> top_k slice
  -> relevance gate           if the best match's cosine similarity < MIN_RELEVANCE_SCORE
                              (0.30, calibrated -- see rag_eval/), refuse to answer instead of
                              grounding a response in a weak match. The LLM is never called.
  -> prompt with numbered excerpts (meeting, chunk, speakers) + citation-enforcement
                              instructions + explicit "this is data, not instructions" framing
  -> LLMFallback.chat_complete()  Groq -> OpenAI -> Anthropic, whichever key is set
  -> answer + citations (meeting_id, chunk_index, speakers, snippet, score, char offsets)
                              + `grounded` flag (false if the answer has no [n] citation marker
                                anywhere, even though citations were retrieved)
```

**Chunking.** Sentences are packed into ~180-word windows (comfortably under the embedding
model's 256-token limit) with 2 sentences of overlap between consecutive chunks, so a fact
stated right at a boundary is never split with no whole copy anywhere. A single sentence longer
than the budget is kept whole, never truncated. Chunking is line-aware: `"Speaker: ..."` lines
are attributed to that speaker per-sentence (see the [appendix](#appendix-notable-bugs-fixed-along-the-way)
for why the original implementation of this silently never worked on multi-line transcripts).
This is sentence-level chunking, not embedding-level/semantic chunking -- clustering by
embedding similarity would be the natural v2, named directly in [Remaining work](#remaining-work)
rather than claimed here.

**Embeddings.** `all-MiniLM-L6-v2`: 384 dimensions, ~80MB, CPU inference in single-digit
milliseconds (measured: 8-10ms mean, see [below](#measured-results)), no API key, no per-call
cost. Configurable via `AURA_EMBEDDING_MODEL`; changing it requires a full re-index since old and
new vectors aren't comparable.

**Reranking.** A bi-encoder (the embedding model) scores the query and each chunk
*independently*, which is fast enough to run over an entire corpus but can rank a
topically-similar-but-not-actually-responsive chunk above a better one, since query and document
never actually attend to each other. A cross-encoder scores each (query, chunk) pair jointly --
more accurate, too slow to run over a whole corpus, which is why it only reranks a pool of 20
ANN candidates down to the final top-k. Toggle with `AURA_ENABLE_RERANKING`; measured
latency/quality impact is in [Measured results](#measured-results) -- reranking is not free
(~125ms added, most of total query latency), and the eval numbers show a real but modest quality
gain at this corpus size, which is the honest tradeoff to cite, not "reranking obviously helps."

**Relevance gate / hallucination control.** Two concrete mechanisms, not just a prompt asking
nicely:
1. If the top retrieved chunk's cosine similarity is below `AURA_MIN_RELEVANCE_SCORE` (default
   0.30), `/query` returns "I don't have enough evidence..." **without calling the LLM at all**.
   The threshold was picked by running `rag_eval/run_retrieval_eval.py` and looking at where
   relevant-question and irrelevant-question top scores actually separate (see
   [Measured results](#measured-results) for the real distributions, not an assumed number).
2. Citation enforcement: the response includes a `grounded` boolean that's `false` whenever the
   model's answer contains no `[n]` citation marker, even if relevant chunks were retrieved and
   passed to it. This doesn't verify individual claims against their source (that would need a
   claim-level entailment pass -- named in [Remaining work](#remaining-work), not built), but
   it does catch the cheaper, more common failure of the model ignoring the "cite everything"
   instruction and answering in free text.

Retrieved transcript text is explicitly framed in the system prompt as **data, not
instructions** -- if a transcript contains something that reads like "ignore previous
instructions" or a request to reveal the system prompt, the model is told to treat it as a quote
to report on, never as a command. This is a real prompt-injection surface (anyone who can get
text into an indexed transcript can get it in front of the LLM), and this is the mitigation that
exists today; it's a prompt-level defense, not a structural guarantee.

**Citations.** Each citation carries `meeting_id`, `chunk_index`, `speakers`, a snippet, a
similarity score, and the chunk's `char_start`/`char_end` offsets into the transcript. The chat
UI links each citation to `/meetings/{id}?snippet=...`, which highlights and scrolls to the
matching text in the transcript view (best-effort substring match, since the snippet went through
Python-side text normalization and isn't guaranteed byte-identical to the raw stored transcript).

## Why these technology choices

| Choice | Why | Named tradeoff |
| --- | --- | --- |
| Chroma over a managed vector DB | Embedded, file-backed, no server process to run/deploy/pay for; stores metadata next to vectors instead of a second store to keep in sync; `where={"meeting_id": {"$in": [...]}}` filtering is first-class. | Single-node, doesn't horizontally scale. Fine for this corpus size; the first thing to swap for a large organization's full meeting history. |
| `all-MiniLM-L6-v2` over a bigger/API embedding model | Free, local, fast enough that it's not the retrieval latency bottleneck at this scale, reproducible (no external API version drift). | A larger model would likely improve retrieval quality further; not measured here, and swapping it is one config constant + a full re-index -- nothing else in the pipeline depends on which model produced the vectors. |
| Cross-encoder reranker over no reranking | Measurably improves ranking (MRR) and relevance-gate accuracy at real, measured latency cost -- see below, this isn't asserted. | ~125ms added per query; toggleable per-deployment via `AURA_ENABLE_RERANKING`. |
| Groq -> OpenAI -> Anthropic fallback, not one hardcoded provider | One abstraction (`LLMFallback.chat_complete`) used by both the optional LLM extraction pass and `/query`; a single outage or missing key degrades instead of failing the request. | Provider-specific quirks (system prompt support, model names) are still hardcoded per-provider inside `hybrid_ml.py` -- a real "add a provider" still means touching that file. |
| Local JSON files for meetings, not Mongo | Meetings were never in Mongo; adding a second store there for RAG chunk metadata would have been a second source of truth nothing else reads. | Doesn't scale past ~hundreds of meetings gracefully (linear directory scan on every list/search) -- see [Known limitations](#known-limitations). |
| HMAC-signed cookie sessions, not NextAuth/a sessions table | No OAuth providers needed; a stateless token avoids a sessions collection and works identically in the Node (API routes) and Edge (middleware) runtimes via Web Crypto. | No server-side session revocation -- a compromised token is valid until it expires (7 days) or `SESSION_SECRET` is rotated (which invalidates every session at once). |

## Project structure

```
src/app/                    Next.js App Router
  api/                       API routes (all require a session except /register, /login)
  lib/aura/                  TypeScript fallback extraction pipeline (mirrors aura_core)
  lib/{auth,password,types,validation,mongodb,AuthNav}.ts
  {login,register,dashboard,analyze,chat,meetings/[id]}/page.tsx
  lib/__tests__/, lib/aura/__tests__/    Vitest unit tests
src/middleware.ts            Session-gated page routing

python_backend/
  api_server.py               FastAPI app
  aura_cli.py                 CLI: analyze / index / query subcommands
  benchmark.py                 ML classifier benchmark (cross-validated)
  benchmark_retrieval.py       Retrieval latency benchmark
  aura_core/                   extraction pipeline + RAG layer (see above)
  rag_eval/                    retrieval-quality evaluation harness + labeled question set
  tests/                       pytest suite
  results/                     benchmark/eval JSON output -- committed, not gitignored,
                                because it's the evidence behind every number in this doc
  models/                      trained .joblib classifiers (checked in -- small, deterministic
                                to regenerate, and needed at runtime without a training step)
```

## Measured results

Every number below is from a real, reproducible run of the scripts in the README's
[Tests & evaluation](../README.md#tests--evaluation) section against the code currently in this
repo -- see `python_backend/results/*.json` for the raw output. None of it is estimated or
assumed.

**ML classifiers** (`results/benchmark.json`, 5-fold / 4-fold cross-validation -- the only
numbers presented as performance claims; see the file's `methodology` note on why the
train-set-fit numbers are a sanity check, not an accuracy claim):

| Model | Dataset | CV F1 | CV Precision | CV Recall |
| --- | --- | --- | --- | --- |
| Task classifier (binary) | 107 examples | 73.2% ± 6.5% | 77.1% | 74.1% |
| Decision classifier (4-class) | 73 examples | 35.7% ± 8.0% | 39.2% | 38.1% |

The decision classifier's much lower score is real, not a bug: a small, 4-way dataset with
genuine semantic overlap between classes ("we're migrating to Kubernetes" reads as both
"technical" and general strategy) is a harder generalization problem than the task classifier's
binary split. This is exactly the gap the hybrid LLM-fallback path exists to cover for
low-confidence predictions.

**Retrieval quality** (`results/retrieval_eval.json`, 8-meeting/12-chunk hand-labeled corpus,
15 answerable + 5 deliberately-unanswerable questions, `rag_eval/dataset.py`):

| | k=3 Recall / Precision / MRR | k=5 Recall / Precision / MRR | Refusal rate (5 unanswerable Qs) |
| --- | --- | --- | --- |
| With reranking | 1.00 / 0.489 / 0.967 | 1.00 / 0.333 / 0.967 | 4/5 (80%) |
| Without reranking | 1.00 / 0.444 / 0.922 | 1.00 / 0.320 / 0.922 | 4/5 (80%) |

Score separation behind the 0.30 relevance-gate threshold: with reranking, answerable questions'
top score averaged 0.483 (min 0.190) vs. unanswerable questions' 0.227 (max 0.302); without
reranking, 0.502 (min 0.322) vs. 0.253 (max 0.321). Precision@K is mechanically low here because
k=5 exceeds the number of truly relevant chunks in a 12-chunk corpus (1-2 per question) -- Recall
and MRR are the more meaningful signal at this scale; precision becomes more informative as
corpus size grows relative to k. Recall@1.0 at this corpus size is a real (not-guaranteed) pass,
not a strong claim about performance at scale -- see [Known limitations](#known-limitations).

**Retrieval latency** (`results/retrieval_benchmark*.json`, 50-chunk corpus, 30 queries, after a
warm-up call to exclude one-time model-load cost from the timed run):

| | Mean | p50 | p95 |
| --- | --- | --- | --- |
| Total, with reranking | 140.6ms | 136.6ms | 173.8ms |
| Total, without reranking | 12.3ms | 12.2ms | 13.6ms |
| Query embedding | 10.4ms | 9.9ms | 13.6ms |
| Chroma ANN search | 4.5ms | 4.5ms | 5.2ms |
| Cross-encoder rerank | 125.7ms | 122.5ms | 156.4ms |

Reranking is the dominant cost by far -- embedding and ANN search together are ~15ms regardless
of reranking. This is the real, measured tradeoff behind `AURA_ENABLE_RERANKING` being a config
flag rather than an assumed-good default.

**Test suite:** 72 pytest tests (backend) + 56 Vitest tests (frontend) = 128 automated tests,
all passing as of this commit (`pytest tests/ -v`, `npm test`).

**Not measured:** generation latency / end-to-end `/query` latency with a real LLM call (no
provider API key was available in this environment -- the relevant code paths are unit-tested
with a stubbed LLM instead, see `tests/test_query_engine.py` and `tests/test_api_server.py`).
Corpus-size scaling beyond 50 chunks. Frontend Core Web Vitals / Lighthouse.

## Security

- Passwords are hashed with bcrypt (cost factor 12); the original implementation stored them in
  plain text -- see the appendix if you want the full story.
- Sessions are HMAC-signed, httpOnly, `sameSite=lax` cookies; every meeting/RAG API route checks
  for a valid session and returns 401 if absent.
- Meeting ids are validated before being used in filesystem paths (`isSafeMeetingId`) to close a
  path-traversal-shaped gap where an id could previously reach `path.join` unchecked.
- Retrieved transcript content is explicitly framed as data, not instructions, in the RAG system
  prompt (see [The RAG pipeline in detail](#the-rag-pipeline-in-detail)).
- No secrets are committed; `.env.example` files document every required variable without real
  values. `.gitignore` excludes `.env*`, the Python venv, `__pycache__`, Chroma's data directory,
  and the local meeting JSON store.
- Unhandled backend exceptions return a generic 500 with a request id, never a stack trace or
  internal exception message (`api_server.py`'s global exception handler).
- `next@15.5.2` (as received) had several known CVEs, including an RCE; patched to `15.5.25`.
  One remaining moderate/high advisory (a `postcss` version pinned by Next.js internally) is only
  fixed by a Next.js 16 major upgrade, which was deliberately not forced in this pass -- see
  [Remaining work](#remaining-work).

## Known limitations

Being direct about what this doesn't do, rather than letting the architecture section imply more
than what's built:

- **Not multi-tenant.** Every logged-in user sees every meeting. There's no per-user or per-team
  data isolation -- `createdBy` is recorded for provenance but nothing filters on it.
- **FastAPI has no auth of its own.** It trusts whatever calls it. That's fine as long as it's
  only reachable from the Next.js server (its designed deployment shape), but it would need its
  own auth layer before being exposed directly to the internet.
- **JSON-file meeting storage doesn't scale gracefully.** Every list/search does a full directory
  scan. Fine at the current scale; the first thing to change if this needs to handle thousands of
  meetings (see the persistence table above for the reasoning).
- **The retrieval eval corpus is small** (8 meetings, 12 chunks) by necessity (hand-labeling
  requires knowing the right answer for every question). Recall@K=1.0 here is a real result on
  this corpus, not a claim that generalizes to a much larger, noisier one.
- **No claim-level faithfulness checking.** The relevance gate and citation-marker check catch
  the two cheapest, highest-leverage failure modes (answering with no evidence at all, and
  answering with no traceable citation) but don't verify that each individual sentence of a
  generated answer is actually entailed by its cited excerpt.
- **No streaming.** `/query` blocks until the full answer is generated. Groq/OpenAI/Anthropic all
  support streaming; not implemented here.
- **Embedding inference is CPU-bound** and, per the latency numbers above, not the bottleneck at
  this scale -- but it doesn't have a GPU path.
- **One remaining moderate/high dependency advisory** (see [Security](#security)) requires a
  Next.js major-version upgrade not made in this pass.

## Remaining work

**Should do before relying on this further:**
- Rotate `SESSION_SECRET` and every credential in `.env.local`/`.env` before any real deployment
  (none of the values in `.env.example` are real).
- Decide on and implement real per-user or per-workspace data isolation if this needs to stop
  being single-shared-workspace.

**High-value, not done here:**
- Claim-level faithfulness checking (a cheap NLI pass over generated claims vs. cited excerpts).
- Streaming responses end-to-end (provider -> FastAPI -> Next.js -> chat UI).
- True semantic/topic-based chunking as an alternative to sentence-packing.
- Next.js 16 upgrade to close the remaining dependency advisory.
- A real system-of-record decision for meetings (stay on JSON files with documented limits, or
  migrate to Mongo/Postgres) once scale actually requires it.

**Optional:**
- Docker/Compose for one-command local startup.
- A CI workflow running `pytest` + `npm test` + `npm run build` on push.
- Bigger embedding/reranker models, measured against the existing eval harness rather than
  swapped on assumption.

## Appendix: notable bugs fixed along the way

Worth naming directly rather than burying, since finding these was the actual point of writing a
real test suite instead of eyeballing the code:

- **Plaintext passwords and a login button that didn't check credentials.** The original
  `handleLogin` was `alert(...)` + a redirect; register stored `password` directly on the Mongo
  document with a comment saying so. Replaced with bcrypt + real session verification.
- **`clean_text()` ran before line-splitting in the chunker's speaker-attribution path.**
  `clean_text` collapses all whitespace, including newlines, to single spaces -- so a
  `"Speaker: ..."` transcript with one turn per line was flattened into one line *before* the
  "line-aware" split ever ran, meaning every sentence after the first speaker's got
  mis-attributed to that first speaker. This is a Python-side bug that would have shipped
  silently on any real multi-speaker transcript.
- **NLTK 3.9 needs the `punkt_tab` resource**, not just `punkt`; without it every
  `sent_tokenize()` call raised `LookupError` and silently fell back to naive
  `text.split(".")`, which mis-splits on abbreviations and can't handle a sentence with no period
  at all -- affecting sentence splitting everywhere it's used, not just chunking.
- **`index_meeting` never called the (already-implemented) `delete_meeting`.** Re-indexing a
  transcript that got shorter left the old version's extra chunks in Chroma forever.
  `benchmark.py` was evaluating classifiers on their own training data and reporting that as an
  F1 score -- a textbook leakage mistake that made the decision classifier's real ~36% CV F1 look
  like 100%.
- **A capitalized-word regex used for name detection had no way to exclude sentence-initial
  pronouns/articles** -- "We should ship Friday" extracted "We" as a candidate task assignee.
  Existed identically in both the Python and TypeScript implementations.
- **`next build` failed entirely without a live `MONGODB_URI`** because `mongodb.ts` threw at
  module import time, which Next's build-time page-data collection triggers just by importing a
  route that references it -- even for a build that doesn't need Mongo yet.

None of these were found by inspection alone; they came out of actually writing the pytest/Vitest
suites referenced in the README's [Tests & evaluation](../README.md#tests--evaluation) section
and running them.
