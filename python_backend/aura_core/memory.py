"""Thread-aware conversation memory."""

from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


@dataclass
class ThreadEntry:
  meeting_id: str
  timestamp: str
  summary: str
  sentiment: str
  tasks_open: int
  decisions_made: int


class ThreadMemory:
  def __init__(self, storage_path: Path):
    self.storage_path = storage_path
    self.storage_path.parent.mkdir(parents=True, exist_ok=True)
    self._lock = threading.Lock()

  def _read_store(self) -> Dict[str, List[Dict[str, Any]]]:
    if not self.storage_path.exists():
      return {}
    return json.loads(self.storage_path.read_text())

  def _write_store(self, data: Dict[str, List[Dict[str, Any]]]) -> None:
    # Temp file + rename so readers never see half-written JSON.
    tmp = self.storage_path.with_suffix(self.storage_path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, self.storage_path)

  def append(self, thread_key: str, entry: ThreadEntry) -> List[Dict[str, Any]]:
    # /analyze is a sync endpoint, so FastAPI runs requests in a thread
    # pool; the lock keeps two simultaneous appends from losing one.
    with self._lock:
      store = self._read_store()
      thread = store.setdefault(thread_key, [])
      thread.append(asdict(entry))
      self._write_store(store)
      return thread

  def history(self, thread_key: str) -> List[Dict[str, Any]]:
    with self._lock:
      store = self._read_store()
    return store.get(thread_key, [])

  def summarize_chain(self, thread_key: str) -> Dict[str, Any]:
    entries = self.history(thread_key)
    if not entries:
      return {"thread": thread_key, "meetings": []}
    return {
        "thread": thread_key,
        "meetings": entries,
        "span": {
            "from": entries[0]["timestamp"],
            "to": entries[-1]["timestamp"]
        },
    }
