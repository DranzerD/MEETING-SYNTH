"""Retrieval-augmented chat: embed question -> retrieve chunks -> ground an
LLM answer in them, with citations back to the source meeting/chunk.

This is the module `POST /query` in `api_server.py` calls into. It stays
thin on purpose: `retrieval.retrieve` owns search, `hybrid_ml.LLMFallback`
owns talking to an LLM provider, and this module's only job is gluing the
two together into one grounded answer.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Sequence

from .hybrid_ml import LLMFallback
from .retrieval import RetrievalResult, RetrievedChunk, retrieve
from .vectorstore import ChunkVectorStore

GROUNDED_SYSTEM_PROMPT = (
    "You are Aura, a meeting-intelligence assistant. Answer the question "
    "using ONLY the numbered excerpts below. Cite every claim with its "
    "excerpt number in square brackets, e.g. [2]. If the excerpts don't "
    "contain enough information to answer, say so plainly instead of "
    "guessing -- never invent facts, names, or dates that aren't in the "
    "excerpts."
)


@dataclass
class Citation:
  index: int
  chunk_id: str
  meeting_id: str
  chunk_index: int
  snippet: str
  score: float


@dataclass
class ChatAnswer:
  answer: str
  citations: list[Citation]
  model: str | None
  retrieval_latency_ms: float
  generation_latency_ms: float
  total_latency_ms: float


def _build_prompt(question: str, matches: Sequence[RetrievedChunk], history: Sequence[dict] | None) -> str:
  context = "\n\n".join(
      f"[{i + 1}] (meeting: {m.meeting_id}, chunk #{m.chunk_index}"
      + (f", speakers: {', '.join(m.speakers)}" if m.speakers else "")
      + f")\n{m.text}"
      for i, m in enumerate(matches)
  )

  history_block = ""
  if history:
    turns = "\n".join(f"{turn.get('role', 'user')}: {turn.get('content', '')}" for turn in list(history)[-6:])
    history_block = f"Recent conversation:\n{turns}\n\n"

  return (
      f"{history_block}Meeting excerpts:\n{context}\n\n"
      f"Question: {question}\n\n"
      "Answer, citing excerpt numbers in brackets:"
  )


class RAGChatEngine:
  """Ties the vector store, retrieval, and grounded generation together
  behind one call, so the FastAPI layer stays a thin wrapper."""

  def __init__(self, store: ChunkVectorStore | None = None, llm: LLMFallback | None = None):
    self.store = store or ChunkVectorStore()
    self.llm = llm or LLMFallback()

  def answer(self, question: str, *, meeting_ids: Sequence[str] | None = None,
             top_k: int = 5, history: Sequence[dict] | None = None) -> ChatAnswer:
    retrieval: RetrievalResult = retrieve(question, top_k=top_k, meeting_ids=meeting_ids, store=self.store)

    if not retrieval.matches:
      return ChatAnswer(
          answer=(
              "I don't have any indexed meeting content to answer that "
              "from yet. Analyze or index a meeting first, or widen the "
              "meeting scope."
          ),
          citations=[],
          model=None,
          retrieval_latency_ms=retrieval.latency_ms,
          generation_latency_ms=0.0,
          total_latency_ms=retrieval.latency_ms,
      )

    prompt = _build_prompt(question, retrieval.matches, history)
    started = time.perf_counter()
    answer_text, provider = self.llm.chat_complete(prompt, system=GROUNDED_SYSTEM_PROMPT, max_tokens=700)
    generation_latency_ms = (time.perf_counter() - started) * 1000

    citations = [
        Citation(
            index=i + 1,
            chunk_id=m.chunk_id,
            meeting_id=m.meeting_id,
            chunk_index=m.chunk_index,
            snippet=(m.text[:240] + "…") if len(m.text) > 240 else m.text,
            score=m.score,
        )
        for i, m in enumerate(retrieval.matches)
    ]

    return ChatAnswer(
        answer=answer_text,
        citations=citations,
        model=provider,
        retrieval_latency_ms=retrieval.latency_ms,
        generation_latency_ms=round(generation_latency_ms, 2),
        total_latency_ms=round(retrieval.latency_ms + generation_latency_ms, 2),
    )
