"""Background indexing: chunk -> embed -> store, with a status ledger.

Indexing a meeting is kicked off from a request handler but must never
block the response, so `index_meeting` is designed to be handed to
FastAPI's `BackgroundTasks` and to report progress through `IndexLedger` --
a small JSON-backed store in the same style as `memory.ThreadMemory`. No
separate database is needed for MVP status tracking, and the frontend can
poll `GET /index/status/{meeting_id}` to know when a just-analyzed meeting
becomes queryable.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from .chunking import chunk_transcript
from .config import CACHE_DIR
from .embeddings import embed_texts
from .vectorstore import ChunkVectorStore

DEFAULT_LEDGER_PATH = CACHE_DIR / "index_status.json"


@dataclass
class IndexStatus:
  meeting_id: str
  status: str  # queued | indexing | completed | failed
  chunk_count: int = 0
  started_at: str | None = None
  completed_at: str | None = None
  error: str | None = None


class IndexLedger:
  def __init__(self, storage_path: Path | None = None):
    self.storage_path = storage_path or DEFAULT_LEDGER_PATH
    self.storage_path.parent.mkdir(parents=True, exist_ok=True)

  def _read(self) -> Dict[str, Any]:
    if not self.storage_path.exists():
      return {}
    return json.loads(self.storage_path.read_text())

  def _write(self, data: Dict[str, Any]) -> None:
    self.storage_path.write_text(json.dumps(data, indent=2))

  def set(self, status: IndexStatus) -> None:
    data = self._read()
    data[status.meeting_id] = asdict(status)
    self._write(data)

  def get(self, meeting_id: str) -> Dict[str, Any] | None:
    return self._read().get(meeting_id)

  def all_statuses(self) -> Dict[str, Any]:
    """Every meeting the ledger has ever recorded a status for. Used by the
    dashboard to show a "searchable in chat?" badge per meeting without a
    round trip per meeting."""
    return self._read()

  def mark_queued(self, meeting_id: str) -> None:
    self.set(IndexStatus(meeting_id=meeting_id, status="queued"))


def index_meeting(meeting_id: str, transcript: str, *, store: ChunkVectorStore, ledger: IndexLedger) -> IndexStatus:
  """Chunk, embed, and store one meeting's transcript.

  Safe to call from a FastAPI BackgroundTask: it never raises out of this
  function -- any failure is recorded in the ledger instead, since the
  HTTP response that triggered indexing has already been sent by the time
  this runs.
  """
  started_at = datetime.utcnow().isoformat() + "Z"
  ledger.set(IndexStatus(meeting_id=meeting_id, status="indexing", started_at=started_at))

  try:
    chunks = chunk_transcript(transcript, meeting_id)
    # Upsert alone only overwrites chunk ids that still exist in the new
    # version -- if an edited transcript now produces fewer chunks than
    # before, the extra old ones (e.g. chunk-7..9 from a longer prior
    # version) would otherwise never be removed and would keep showing up
    # in retrieval. Deleting the meeting's chunks first makes re-indexing
    # idempotent regardless of how the chunk count changes between runs.
    store.delete_meeting(meeting_id)
    if chunks:
      embeddings = embed_texts([c.text for c in chunks])
      store.add_chunks(chunks, embeddings)
    status = IndexStatus(
        meeting_id=meeting_id,
        status="completed",
        chunk_count=len(chunks),
        started_at=started_at,
        completed_at=datetime.utcnow().isoformat() + "Z",
    )
  except Exception as exc:  # noqa: BLE001 - surfaced via the ledger, not raised
    status = IndexStatus(
        meeting_id=meeting_id,
        status="failed",
        started_at=started_at,
        completed_at=datetime.utcnow().isoformat() + "Z",
        error=str(exc),
    )

  ledger.set(status)
  return status
