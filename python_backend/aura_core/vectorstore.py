"""Chroma-backed vector store for meeting transcript chunks.

Chunks from every meeting live in a single persistent Chroma collection --
not one collection per meeting -- with `meeting_id` stored as filterable
metadata. That lets a query stay unscoped (search everything indexed so
far), scoped to a handful of meetings (a project or workspace), or scoped
to exactly one, without paying Chroma's per-collection overhead for every
meeting a user analyzes.

Chunk metadata (meeting_id, chunk_index, speakers, word/char offsets) is
stored directly as Chroma metadata rather than in a separate database: it's
the only place that metadata is *needed* (to filter and to render
citations), and a second store would just be a second source of truth that
can drift from the vectors themselves.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

from .chunking import TranscriptChunk

COLLECTION_NAME = "meeting_chunks"
DEFAULT_PERSIST_DIR = Path(__file__).resolve().parents[1] / "chroma_db"


class ChunkVectorStore:
  def __init__(self, persist_dir: Path | None = None):
    import chromadb

    self.persist_dir = Path(persist_dir or DEFAULT_PERSIST_DIR)
    self.persist_dir.mkdir(parents=True, exist_ok=True)
    self.client = chromadb.PersistentClient(path=str(self.persist_dir))
    self.collection = self.client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )

  def add_chunks(self, chunks: Sequence[TranscriptChunk], embeddings: Sequence[Sequence[float]]) -> None:
    """Upsert (not just add) so re-indexing a meeting after an edited
    transcript overwrites its old chunks instead of duplicating them."""
    if not chunks:
      return
    if len(chunks) != len(embeddings):
      raise ValueError("chunks and embeddings must be the same length")

    self.collection.upsert(
        ids=[c.chunk_id for c in chunks],
        embeddings=[list(e) for e in embeddings],
        documents=[c.text for c in chunks],
        metadatas=[{
            "meeting_id": c.meeting_id,
            "chunk_index": c.chunk_index,
            "speakers": ", ".join(c.speakers) if c.speakers else "",
            "word_count": c.word_count,
            "char_start": c.char_start,
            "char_end": c.char_end,
        } for c in chunks],
    )

  def query(self, query_embedding: Sequence[float], *, top_k: int = 5,
            meeting_ids: Sequence[str] | None = None) -> dict[str, Any]:
    where = {"meeting_id": {"$in": list(meeting_ids)}} if meeting_ids else None
    return self.collection.query(
        query_embeddings=[list(query_embedding)],
        n_results=top_k,
        where=where,
    )

  def count(self, meeting_id: str | None = None) -> int:
    if meeting_id is None:
      return self.collection.count()
    result = self.collection.get(where={"meeting_id": meeting_id})
    return len(result.get("ids", []))

  def delete_meeting(self, meeting_id: str) -> None:
    self.collection.delete(where={"meeting_id": meeting_id})
