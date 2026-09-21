import pytest

from aura_core.indexing import index_meeting


def test_index_meeting_success_path_updates_ledger(temp_vectorstore, temp_ledger, fake_embeddings):
  status = index_meeting(
      "m1", "We decided to ship Friday. Dana owns the release notes.",
      store=temp_vectorstore, ledger=temp_ledger,
  )
  assert status.status == "completed"
  assert status.chunk_count > 0
  assert status.started_at is not None
  assert status.completed_at is not None
  assert status.error is None

  recorded = temp_ledger.get("m1")
  assert recorded["status"] == "completed"
  assert recorded["chunk_count"] == status.chunk_count


def test_index_meeting_empty_transcript_completes_with_zero_chunks(temp_vectorstore, temp_ledger, fake_embeddings):
  status = index_meeting("m1", "", store=temp_vectorstore, ledger=temp_ledger)
  assert status.status == "completed"
  assert status.chunk_count == 0


def test_index_meeting_failure_is_recorded_not_raised(temp_vectorstore, temp_ledger, monkeypatch):
  """If embedding fails (e.g. no network for the model download, or any
  other exception), index_meeting must never raise -- it's meant to run as
  a FastAPI BackgroundTask after the HTTP response has already been sent,
  so an uncaught exception here would just vanish into the ether instead
  of being visible anywhere. It has to be recorded in the ledger."""
  import aura_core.indexing as indexing_module

  def boom(texts):
    raise RuntimeError("simulated embedding failure (e.g. no model access)")

  monkeypatch.setattr(indexing_module, "embed_texts", boom)

  status = index_meeting(
      "m1", "We decided to ship Friday. Dana owns the release notes.",
      store=temp_vectorstore, ledger=temp_ledger,
  )
  assert status.status == "failed"
  assert "simulated embedding failure" in status.error

  recorded = temp_ledger.get("m1")
  assert recorded["status"] == "failed"


def test_reindexing_a_shrunk_transcript_does_not_leave_orphaned_chunks(temp_vectorstore, temp_ledger, fake_embeddings):
  """Regression test for a real bug: vectorstore.delete_meeting existed but
  was never called from index_meeting, so upsert alone only overwrote
  chunk ids that still existed in the new version. Re-indexing a shorter
  transcript left the old, longer version's extra chunks behind forever."""
  long_transcript = " ".join(
      f"Sentence number {i} talks about topic {i} in some detail here." for i in range(40)
  )
  short_transcript = "Just one short sentence now after the edit."

  status_long = index_meeting("m1", long_transcript, store=temp_vectorstore, ledger=temp_ledger)
  assert status_long.chunk_count > 1

  status_short = index_meeting("m1", short_transcript, store=temp_vectorstore, ledger=temp_ledger)
  assert status_short.chunk_count == 1

  # The store should reflect only the current (short) version's chunk
  # count, not long_count + short_count.
  assert temp_vectorstore.count(meeting_id="m1") == status_short.chunk_count


def test_reindexing_same_meeting_id_twice_is_idempotent(temp_vectorstore, temp_ledger, fake_embeddings):
  transcript = "We decided to ship Friday. Dana owns the release notes."
  status1 = index_meeting("m1", transcript, store=temp_vectorstore, ledger=temp_ledger)
  status2 = index_meeting("m1", transcript, store=temp_vectorstore, ledger=temp_ledger)
  assert status1.chunk_count == status2.chunk_count
  assert temp_vectorstore.count(meeting_id="m1") == status2.chunk_count


def test_ledger_mark_queued_then_get(temp_ledger):
  temp_ledger.mark_queued("m1")
  status = temp_ledger.get("m1")
  assert status["status"] == "queued"
  assert status["chunk_count"] == 0


def test_ledger_get_unknown_meeting_returns_none(temp_ledger):
  assert temp_ledger.get("does-not-exist") is None


def test_ledger_all_statuses_returns_every_recorded_meeting(temp_ledger):
  temp_ledger.mark_queued("m1")
  temp_ledger.mark_queued("m2")
  statuses = temp_ledger.all_statuses()
  assert set(statuses.keys()) == {"m1", "m2"}
