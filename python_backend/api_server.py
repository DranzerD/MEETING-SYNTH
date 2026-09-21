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
"""

from __future__ import annotations

from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel

from aura_core import AuraPipeline
from aura_core.indexing import IndexLedger, index_meeting
from aura_core.query_engine import RAGChatEngine
from aura_core.vectorstore import ChunkVectorStore

app = FastAPI(title="Aura Core API")
pipeline = AuraPipeline()

# Shared singletons: one Chroma connection and one status ledger for the
# life of the process, reused across requests (and across /analyze's
# background indexing and /index's explicit indexing).
vector_store = ChunkVectorStore()
index_ledger = IndexLedger()
chat_engine = RAGChatEngine(store=vector_store)


class AnalyzePayload(BaseModel):
  transcript: str
  meeting_id: str | None = None
  thread: str | None = None
  use_llm: bool = False


@app.post("/analyze")
def analyze(payload: AnalyzePayload, background_tasks: BackgroundTasks):
  if not payload.transcript.strip():
    raise HTTPException(status_code=400, detail="Transcript text is required")

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
def thread_history(thread_key: str):
  return pipeline.history(thread_key)


class IndexPayload(BaseModel):
  meeting_id: str
  transcript: str


@app.post("/index")
def index(payload: IndexPayload, background_tasks: BackgroundTasks):
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


@app.get("/index/status/{meeting_id}")
def index_status(meeting_id: str):
  status = index_ledger.get(meeting_id)
  if status is None:
    raise HTTPException(status_code=404, detail="No index record for that meeting_id")
  return status


class QueryPayload(BaseModel):
  question: str
  meeting_ids: list[str] | None = None
  top_k: int = 5
  history: list[dict] | None = None


@app.post("/query")
def query(payload: QueryPayload):
  if not payload.question.strip():
    raise HTTPException(status_code=400, detail="question is required")

  try:
    result = chat_engine.answer(
        payload.question,
        meeting_ids=payload.meeting_ids,
        top_k=payload.top_k,
        history=payload.history,
    )
  except RuntimeError as exc:
    # No LLM provider configured/reachable -- a clear 503, not a 500.
    raise HTTPException(status_code=503, detail=str(exc))

  return {
      "answer": result.answer,
      "citations": [vars(c) for c in result.citations],
      "model": result.model,
      "retrieval_latency_ms": result.retrieval_latency_ms,
      "generation_latency_ms": result.generation_latency_ms,
      "total_latency_ms": result.total_latency_ms,
  }
