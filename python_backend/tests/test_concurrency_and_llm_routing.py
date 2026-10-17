"""Thread-safety of the JSON-file stores, and provider routing for the
classification helpers in hybrid_ml."""

from __future__ import annotations

import json
import threading

from aura_core.hybrid_ml import LLMFallback
from aura_core.indexing import IndexLedger, IndexStatus
from aura_core.memory import ThreadEntry, ThreadMemory


def test_ledger_keeps_every_concurrent_update(tmp_path):
  ledger = IndexLedger(storage_path=tmp_path / "ledger.json")
  barrier = threading.Barrier(16)

  def worker(i: int):
    barrier.wait()
    for round_ in range(5):
      ledger.set(IndexStatus(meeting_id=f"m{i}", status="indexing", chunk_count=round_))

  threads = [threading.Thread(target=worker, args=(i,)) for i in range(16)]
  [t.start() for t in threads]
  [t.join() for t in threads]

  data = json.loads((tmp_path / "ledger.json").read_text())
  assert sorted(data) == sorted(f"m{i}" for i in range(16))  # none lost to a racing write
  assert all(v["chunk_count"] == 4 for v in data.values())


def test_thread_memory_keeps_every_concurrent_append(tmp_path):
  memory = ThreadMemory(tmp_path / "threads.json")
  barrier = threading.Barrier(12)

  def worker(i: int):
    barrier.wait()
    memory.append("t", ThreadEntry(meeting_id=f"m{i}", timestamp="x", summary="s",
                                   sentiment="neutral", tasks_open=0, decisions_made=0))

  threads = [threading.Thread(target=worker, args=(i,)) for i in range(12)]
  [t.start() for t in threads]
  [t.join() for t in threads]

  assert len(memory.history("t")) == 12


def test_no_temp_file_left_behind(tmp_path):
  ledger = IndexLedger(storage_path=tmp_path / "ledger.json")
  ledger.mark_queued("a")
  assert [p.name for p in tmp_path.iterdir()] == ["ledger.json"]


def test_classification_helpers_use_the_configured_provider_not_anthropic(monkeypatch):
  """Regression: with the default provider ('groq'), classify_sentence_llm and
  extract_tasks_llm fell into an `else` that called the Anthropic client with
  the Groq key."""
  llm = LLMFallback(api_key="k", provider="groq")
  calls = []

  def fake_groq(prompt, max_tokens=500, *, system=None, api_key=None):
    calls.append(("groq", api_key))
    return '{"is_task": true, "confidence": 0.9, "reasoning": "x"}'

  def fail_anthropic(*a, **k):
    raise AssertionError("anthropic must not be called for a groq-configured instance")

  monkeypatch.setattr(llm, "_call_groq", fake_groq)
  monkeypatch.setattr(llm, "_call_anthropic", fail_anthropic)

  result = llm.classify_sentence_llm("Raj will fix the bug by Friday.", "task")
  assert calls == [("groq", "k")]
  assert result.prediction == 1 and result.confidence == 0.9
