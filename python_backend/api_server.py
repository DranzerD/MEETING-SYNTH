"""FastAPI server that exposes the Aura pipeline and its RAG layer.

Endpoints:
  POST /analyze              existing extractive pipeline (tasks, decisions,
                              summary, sentiment, thread memory) -- now also
                              queues background indexing for the RAG layer
  GET  /threads/{thread_key} existing thread memory lookup
  POST /index                (re-)index a meeting for retrieval without
                              re-running /analyze
  GET  /index/status/{id}    poll background-indexing progress
  POST /query                conversational, retrieval-grounded Q&A across
                              one or more indexed meetings
  GET  /health                liveness/readiness probe

This service is designed to sit behind the Next.js server (which proxies to
it over a private network / localhost) rather than be exposed directly to
browsers, so it does not itself enforce user authentication -- that's the
Next.js layer's job (see src/app/lib/auth.ts). Deploying this service
somewhere it's directly internet-reachable would need its own auth.
"""

from __future__ import annotations

from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from aura_core import AuraPipeline
from aura_core.config import DEFAULT_TOP_K
from aura_core.indexing import IndexLedger, IndexStatus, index_meeting
from aura_core.observability import get_logger, new_request_id
from aura_core.query_engine import RAGChatEngine
from aura_core.vectorstore import ChunkVectorStore

logger = get_logger("api")

app = FastAPI(title="Aura Core API", version="2.0.0")
pipeline = AuraPipeline()

# Shared singletons: one Chroma connection and one status ledger for the
# life of the process, reused across requests (and across /analyze's
# background indexing and /index's explicit indexing).
vector_store = ChunkVectorStore()
index_ledger = IndexLedger()
chat_engine = RAGChatEngine(store=vector_store)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception) -> JSONResponse:
  # Never let a raw exception (with its stack trace / internals) reach the
  # client -- log it server-side with a request-correlatable id and return
  # a generic 500 instead.
  request_id = new_request_id()
  logger.exception("unhandled_error request_id=%s path=%s error=%s", request_id, request.url.path, exc)
  return JSONResponse(status_code=500, content={"detail": "Internal server error", "request_id": request_id})


@app.get("/health")
def health() -> dict[str, Any]:
  return {"status": "ok", "indexed_chunks": vector_store.count()}


class AnalyzePayload(BaseModel):
  transcript: str = Field(..., min_length=1)
  meeting_id: str | None = None
  thread: str | None = None
  use_llm: bool = False


class AnalyzeResponse(BaseModel):
  stats: dict[str, Any]
  summary: dict[str, Any]
  tasks: list[dict[str, Any]]
  decisions: list[dict[str, Any]]
  sentiment: dict[str, Any]
  thread: dict[str, Any] | None
  meeting_id: str
  index_status: str


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(payload: AnalyzePayload, background_tasks: BackgroundTasks):
  if not payload.transcript.strip():
    raise HTTPException(status_code=400, detail="Transcript text is required")

  request_id = new_request_id()
  result = pipeline.analyze(
      payload.transcript,
      meeting_id=payload.meeting_id,
      thread_key=payload.thread,
      use_llm=payload.use_llm,
  )

  # Concurrent multi-meeting indexing: chunk + embed + store this meeting
  # in the background so /analyze's response time is unaffected, and the
  # meeting becomes queryable via /query once indexing completes. Every
  # meeting analyzed through this endpoint is queued this way, so multiple
  # meetings can be mid-index at once without blocking each other or the
  # request thread.
  meeting_id = payload.meeting_id or payload.thread or result.stats["generatedAt"]
  index_ledger.mark_queued(meeting_id)
  background_tasks.add_task(
      index_meeting, meeting_id, payload.transcript, store=vector_store, ledger=index_ledger,
  )

  logger.info(
      "analyze_complete request_id=%s meeting_id=%s tasks=%d decisions=%d source=%s",
      request_id, meeting_id, len(result.tasks), len(result.decisions), result.stats["extractionSource"],
  )

  return {
      "stats": result.stats,
      "summary": result.summary,
      "tasks": result.tasks,
      "decisions": result.decisions,
      "sentiment": result.sentiment,
      "thread": result.thread,
      "meeting_id": meeting_id,
      "index_status": "queued",
  }


@app.get("/threads/{thread_key}")
def thread_history(thread_key: str) -> dict[str, Any]:
  return pipeline.history(thread_key)


class IndexPayload(BaseModel):
  meeting_id: str = Field(..., min_length=1)
  transcript: str = Field(..., min_length=1)


@app.post("/index")
def index(payload: IndexPayload, background_tasks: BackgroundTasks) -> dict[str, str]:
  """(Re-)index a meeting for retrieval without re-running /analyze --
  useful for backfilling meetings that were analyzed before the RAG layer
  existed, or for re-indexing after a transcript edit."""
  if not payload.transcript.strip():
    raise HTTPException(status_code=400, detail="Transcript text is required")

  index_ledger.mark_queued(payload.meeting_id)
  background_tasks.add_task(
      index_meeting, payload.meeting_id, payload.transcript, store=vector_store, ledger=index_ledger,
  )
  return {"meeting_id": payload.meeting_id, "status": "queued"}


@app.get("/index/status/{meeting_id}", response_model=IndexStatus)
def index_status(meeting_id: str) -> IndexStatus:
  status = index_ledger.get(meeting_id)
  if status is None:
    raise HTTPException(status_code=404, detail="No index record for that meeting_id")
  return IndexStatus(**status)


@app.get("/index/meetings")
def indexed_meetings() -> dict[str, Any]:
  """All meeting ids the ledger has ever recorded a status for, keyed by
  current status. Lets the frontend show a 'searchable in chat?' badge
  without polling per-meeting."""
  return index_ledger.all_statuses()


class QueryPayload(BaseModel):
  question: str = Field(..., min_length=1)
  meeting_ids: list[str] | None = None
  top_k: int = Field(default=DEFAULT_TOP_K, ge=1, le=20)
  history: list[dict] | None = None


class CitationResponse(BaseModel):
  index: int
  chunk_id: str
  meeting_id: str
  chunk_index: int
  speakers: list[str]
  snippet: str
  score: float
  char_start: int
  char_end: int


class QueryResponse(BaseModel):
  answer: str
  citations: list[CitationResponse]
  model: str | None
  grounded: bool
  retrieval_latency_ms: float
  rerank_latency_ms: float
  generation_latency_ms: float
  total_latency_ms: float


@app.post("/query", response_model=QueryResponse)
def query(payload: QueryPayload):
  if not payload.question.strip():
    raise HTTPException(status_code=400, detail="question is required")

  request_id = new_request_id()
  try:
    result = chat_engine.answer(
        payload.question,
        meeting_ids=payload.meeting_ids,
        top_k=payload.top_k,
        history=payload.history,
    )
  except RuntimeError as exc:
    # No LLM provider configured/reachable -- a clear 503, not a 500.
    logger.warning("query_no_provider request_id=%s error=%s", request_id, exc)
    raise HTTPException(status_code=503, detail=str(exc))

  logger.info(
      "query_complete request_id=%s meeting_ids=%s top_k=%d citations=%d grounded=%s "
      "retrieval_ms=%.1f rerank_ms=%.1f generation_ms=%.1f provider=%s",
      request_id, payload.meeting_ids, payload.top_k, len(result.citations), result.grounded,
      result.retrieval_latency_ms, result.rerank_latency_ms, result.generation_latency_ms, result.model,
  )

  return {
      "answer": result.answer,
      "citations": [vars(c) for c in result.citations],
      "model": result.model,
      "grounded": result.grounded,
      "retrieval_latency_ms": result.retrieval_latency_ms,
      "rerank_latency_ms": result.rerank_latency_ms,
      "generation_latency_ms": result.generation_latency_ms,
      "total_latency_ms": result.total_latency_ms,
  }
