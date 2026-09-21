"""Query-time semantic search over indexed transcript chunks.

Embeds the query, runs top-k ANN search in Chroma (optionally scoped to
one or more meeting_ids), and logs latency to `cache/retrieval_latency.jsonl`
in the same append-only-JSON style `memory.ThreadMemory` already uses --
so retrieval latency is a measured, reproducible number (see
`benchmark_retrieval.py`) instead of a guess.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from .embeddings import embed_query
from .vectorstore import ChunkVectorStore

LATENCY_LOG_PATH = Path(__file__).resolve().parents[1] / "cache" / "retrieval_latency.jsonl"


@dataclass
class RetrievedChunk:
  chunk_id: str
  meeting_id: str
  chunk_index: int
  text: str
  speakers: list[str]
  score: float  # cosine similarity in [-1, 1]; 1.0 = identical direction


@dataclass
class RetrievalResult:
  query: str
  matches: list[RetrievedChunk]
  latency_ms: float
  meeting_ids: list[str] | None


def _log_latency(result: RetrievalResult, top_k: int) -> None:
  LATENCY_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
  entry = {
      "timestamp": time.time(),
      "latency_ms": round(result.latency_ms, 2),
      "top_k": top_k,
      "matches": len(result.matches),
      "scoped_meetings": len(result.meeting_ids) if result.meeting_ids else None,
  }
  with LATENCY_LOG_PATH.open("a") as f:
    f.write(json.dumps(entry) + "\n")


def retrieve(query: str, *, top_k: int = 5, meeting_ids: Sequence[str] | None = None,
             store: ChunkVectorStore | None = None) -> RetrievalResult:
  """Embed `query`, run top-k ANN search in Chroma, optionally filtered to
  `meeting_ids`, and record latency for every call."""
  store = store or ChunkVectorStore()

  started = time.perf_counter()
  query_vector = embed_query(query)
  raw = store.query(query_vector, top_k=top_k, meeting_ids=meeting_ids)
  latency_ms = (time.perf_counter() - started) * 1000

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
        score=round(1 - distance, 4),  # Chroma returns cosine *distance*
    ))

  result = RetrievalResult(
      query=query,
      matches=matches,
      latency_ms=round(latency_ms, 2),
      meeting_ids=list(meeting_ids) if meeting_ids else None,
  )
  _log_latency(result, top_k)
  return result
