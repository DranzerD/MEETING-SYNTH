"""Query-time semantic search over indexed transcript chunks.

Embeds the query, runs ANN search in Chroma over a candidate pool
(optionally scoped to one or more meeting_ids), optionally reranks that
pool with a cross-encoder, and logs latency for each stage to
`cache/retrieval_latency.jsonl` in the same append-only-JSON style
`memory.ThreadMemory` already uses -- so retrieval latency is a measured,
reproducible number (see `benchmark_retrieval.py`) instead of a guess.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from . import reranking
from .config import CACHE_DIR, DEFAULT_TOP_K, RERANK_CANDIDATES, RERANK_ENABLED
from .embeddings import embed_query
from .vectorstore import ChunkVectorStore

LATENCY_LOG_PATH = CACHE_DIR / "retrieval_latency.jsonl"


@dataclass
class RetrievedChunk:
  chunk_id: str
  meeting_id: str
  chunk_index: int
  text: str
  speakers: list[str]
  char_start: int
  char_end: int
  score: float  # cosine similarity in [-1, 1]; 1.0 = identical direction
  rerank_score: float | None = None  # cross-encoder score, if reranking ran


@dataclass
class RetrievalResult:
  query: str
  matches: list[RetrievedChunk]
  latency_ms: float
  embed_latency_ms: float
  search_latency_ms: float
  rerank_latency_ms: float
  reranked: bool
  meeting_ids: list[str] | None


def _log_latency(result: RetrievalResult, top_k: int) -> None:
  LATENCY_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
  entry = {
      "timestamp": time.time(),
      "latency_ms": round(result.latency_ms, 2),
      "embed_latency_ms": result.embed_latency_ms,
      "search_latency_ms": result.search_latency_ms,
      "rerank_latency_ms": result.rerank_latency_ms,
      "reranked": result.reranked,
      "top_k": top_k,
      "matches": len(result.matches),
      "scoped_meetings": len(result.meeting_ids) if result.meeting_ids else None,
  }
  with LATENCY_LOG_PATH.open("a") as f:
    f.write(json.dumps(entry) + "\n")


def _chroma_to_chunks(raw: dict) -> list[RetrievedChunk]:
  matches: list[RetrievedChunk] = []
  ids = raw.get("ids", [[]])[0]
  documents = raw.get("documents", [[]])[0]
  metadatas = raw.get("metadatas", [[]])[0]
  distances = raw.get("distances", [[]])[0]

  for chunk_id, text, meta, distance in zip(ids, documents, metadatas, distances):
    meta = meta or {}
    speakers = [s for s in (meta.get("speakers") or "").split(", ") if s]
    matches.append(RetrievedChunk(
        chunk_id=chunk_id,
        meeting_id=meta.get("meeting_id", ""),
        chunk_index=int(meta.get("chunk_index", 0)),
        text=text,
        speakers=speakers,
        char_start=int(meta.get("char_start", 0)),
        char_end=int(meta.get("char_end", 0)),
        score=round(1 - distance, 4),  # Chroma returns cosine *distance*
    ))
  return matches


def retrieve(query: str, *, top_k: int = DEFAULT_TOP_K, meeting_ids: Sequence[str] | None = None,
             store: ChunkVectorStore | None = None, rerank: bool = RERANK_ENABLED) -> RetrievalResult:
  """Embed `query`, run ANN search in Chroma (optionally filtered to
  `meeting_ids`), optionally rerank with a cross-encoder, and record
  latency for every call.

  When `rerank` is True, the ANN search over-fetches `RERANK_CANDIDATES`
  results so the cross-encoder has a real pool to reorder instead of just
  re-scoring the same `top_k` the bi-encoder already picked -- reranking a
  set that's already been cut down to `top_k` can only ever reorder it,
  never surface a candidate the bi-encoder ranked #8 that's actually the
  best answer.
  """
  store = store or ChunkVectorStore()
  candidate_k = max(top_k, RERANK_CANDIDATES) if rerank else top_k

  embed_started = time.perf_counter()
  query_vector = embed_query(query)
  embed_latency_ms = (time.perf_counter() - embed_started) * 1000

  search_started = time.perf_counter()
  raw = store.query(query_vector, top_k=candidate_k, meeting_ids=meeting_ids)
  search_latency_ms = (time.perf_counter() - search_started) * 1000

  candidates = _chroma_to_chunks(raw)

  rerank_latency_ms = 0.0
  reranked = False
  if rerank and candidates:
    rerank_started = time.perf_counter()
    scores = reranking.rerank_scores(query, [c.text for c in candidates])
    rerank_latency_ms = (time.perf_counter() - rerank_started) * 1000
    if scores is not None:
      for candidate, score in zip(candidates, scores):
        candidate.rerank_score = round(score, 4)
      candidates.sort(key=lambda c: c.rerank_score, reverse=True)
      reranked = True

  matches = candidates[:top_k]
  total_latency_ms = embed_latency_ms + search_latency_ms + rerank_latency_ms

  result = RetrievalResult(
      query=query,
      matches=matches,
      latency_ms=round(total_latency_ms, 2),
      embed_latency_ms=round(embed_latency_ms, 2),
      search_latency_ms=round(search_latency_ms, 2),
      rerank_latency_ms=round(rerank_latency_ms, 2),
      reranked=reranked,
      meeting_ids=list(meeting_ids) if meeting_ids else None,
  )
  _log_latency(result, top_k)
  return result
