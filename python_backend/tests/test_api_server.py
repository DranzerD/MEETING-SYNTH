"""API-level tests against the real FastAPI app via TestClient. Storage
(Chroma + cache) is redirected to a session-temp directory by conftest.py,
so these tests never touch the real project's data.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import api_server


@pytest.fixture
def client():
  # raise_server_exceptions=False so an unhandled exception comes back as
  # the actual HTTP response our exception_handler produces, instead of
  # propagating as a raised Python exception in the test itself -- we
  # specifically want to assert on the response in
  # test_unhandled_exception_returns_generic_500_not_a_stack_trace.
  return TestClient(api_server.app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _fake_embedder_for_api_tests(fake_embeddings, monkeypatch):
  """Every test in this file gets the deterministic fake embedder wired in
  (api_server's singletons were already constructed at import time, but
  fake_embeddings patches the shared aura_core.embeddings functions those
  singletons call into, not a per-instance reference). Storage itself is
  isolated at the whole-session level by AURA_CHROMA_DIR/AURA_CACHE_DIR in
  conftest.py, and every test below uses a distinct meeting_id, so tests
  in this file don't need per-test collection resets to stay correct.

  Also skips the real cross-encoder reranker: it's a real (slow-ish to
  load) model and its actual reranking behavior is already covered by
  test_retrieval.py's dedicated tests. Returning None here exercises the
  documented "reranker unavailable -> fall back to ANN order" path
  instead of paying a real model load in every API test."""
  import aura_core.reranking as reranking_module
  monkeypatch.setattr(reranking_module, "rerank_scores", lambda query, documents: None)
  yield


def test_health(client):
  response = client.get("/health")
  assert response.status_code == 200
  assert response.json()["status"] == "ok"


def test_analyze_rejects_empty_transcript(client):
  response = client.post("/analyze", json={"transcript": "   "})
  assert response.status_code == 400


def test_analyze_rejects_malformed_body(client):
  response = client.post("/analyze", json={"transcript": 12345})
  assert response.status_code == 422  # Pydantic type validation


def test_analyze_happy_path_returns_expected_shape(client):
  response = client.post("/analyze", json={
      "transcript": "Dana will finalize the release notes by Friday. We decided to ship then too.",
      "meeting_id": "test-meeting-1",
  })
  assert response.status_code == 200
  body = response.json()
  assert body["meeting_id"] == "test-meeting-1"
  assert body["index_status"] == "queued"
  assert body["stats"]["extractionSource"] in {"local_ml", "llm"}
  assert "tasks" in body and "decisions" in body and "sentiment" in body


def test_index_status_unknown_meeting_is_404(client):
  response = client.get("/index/status/does-not-exist")
  assert response.status_code == 404


def test_index_then_status_reports_completed(client):
  post_response = client.post("/index", json={
      "meeting_id": "test-meeting-2",
      "transcript": "We decided to ship Friday. Dana owns the release notes.",
  })
  assert post_response.status_code == 200
  assert post_response.json()["status"] == "queued"

  # BackgroundTasks run synchronously within the TestClient's request
  # lifecycle (no real background thread), so status is already final by
  # the time this request returns.
  status_response = client.get("/index/status/test-meeting-2")
  assert status_response.status_code == 200
  body = status_response.json()
  assert body["status"] == "completed"
  assert body["chunk_count"] >= 1


def test_reindexing_shrunk_transcript_does_not_accumulate_chunks(client):
  long_transcript = " ".join(f"Sentence {i} about item {i} here." for i in range(60))
  client.post("/index", json={"meeting_id": "test-meeting-3", "transcript": long_transcript})
  first_status = client.get("/index/status/test-meeting-3").json()
  assert first_status["chunk_count"] > 1

  client.post("/index", json={"meeting_id": "test-meeting-3", "transcript": "Just one short sentence now."})
  second_status = client.get("/index/status/test-meeting-3").json()
  assert second_status["chunk_count"] == 1
  assert api_server.vector_store.count(meeting_id="test-meeting-3") == 1


def test_index_meetings_lists_recorded_statuses(client):
  client.post("/index", json={"meeting_id": "test-meeting-4", "transcript": "Some content here to index."})
  response = client.get("/index/meetings")
  assert response.status_code == 200
  assert "test-meeting-4" in response.json()


def test_query_rejects_empty_question(client):
  response = client.post("/query", json={"question": "   "})
  assert response.status_code == 400


def test_query_with_no_llm_provider_configured_is_503_not_500(client, monkeypatch):
  # conftest.py's _no_llm_env fixture already clears GROQ/OPENAI/ANTHROPIC
  # API keys for every test, so with content indexed but no provider
  # available, this should fail cleanly, not with a raw 500. Force the
  # relevance gate open (see test_query_meeting_scoped_vs_cross_meeting's
  # comment) so the request actually reaches the LLM call this test cares
  # about, instead of short-circuiting into the (also valid, but
  # different) no-evidence path on the fake embedder's low random score.
  import aura_core.query_engine as qe_module
  monkeypatch.setattr(qe_module, "MIN_RELEVANCE_SCORE", -1.0)

  client.post("/index", json={"meeting_id": "test-meeting-5", "transcript": "Dana owns the release notes."})
  response = client.post("/query", json={"question": "Who owns the release notes?"})
  assert response.status_code == 503
  assert "provider" in response.json()["detail"].lower() or "api" in response.json()["detail"].lower()


def test_query_with_irrelevant_question_returns_no_evidence_without_calling_llm(client, monkeypatch):
  client.post("/index", json={"meeting_id": "test-meeting-6", "transcript": "Dana owns the release notes."})

  calls = {"count": 0}

  def fail_if_called(prompt, *, system=None, max_tokens=700):
    calls["count"] += 1
    raise AssertionError("chat_complete should not be called when evidence is insufficient")

  monkeypatch.setattr(api_server.chat_engine.llm, "chat_complete", fail_if_called)

  response = client.post("/query", json={"question": "What is the capital of France?"})
  assert response.status_code == 200
  body = response.json()
  assert body["citations"] == []
  assert body["grounded"] is False
  assert calls["count"] == 0


def test_query_meeting_scoped_vs_cross_meeting(client, monkeypatch):
  # The fake hash-based embedder (see conftest.py) has no real semantic
  # meaning, so its cosine similarities are effectively random -- fine for
  # testing scoping/filtering logic, but it can't be relied on to clear
  # the relevance gate the way a real embedding of matching topical
  # content would. Force the gate open here since this test is about
  # meeting-id scoping, not the relevance gate (that's covered by
  # test_query_with_irrelevant_question_... below, using the same fake
  # embedder, where a low random score is exactly what's being tested).
  import aura_core.query_engine as qe_module
  monkeypatch.setattr(qe_module, "MIN_RELEVANCE_SCORE", -1.0)

  client.post("/index", json={"meeting_id": "scope-a", "transcript": "The budget was cut by 20 percent this quarter."})
  client.post("/index", json={"meeting_id": "scope-b", "transcript": "We are migrating to Kubernetes next quarter."})

  monkeypatch.setattr(
      api_server.chat_engine.llm, "chat_complete",
      lambda prompt, **kw: ("The budget was cut by 20 percent [1].", "stub-provider"),
  )

  scoped = client.post("/query", json={
      "question": "What happened to the budget?", "meeting_ids": ["scope-a"],
  })
  assert scoped.status_code == 200
  scoped_meetings = {c["meeting_id"] for c in scoped.json()["citations"]}
  assert scoped_meetings <= {"scope-a"}

  unscoped = client.post("/query", json={"question": "What happened to the budget?"})
  assert unscoped.status_code == 200
  assert len(unscoped.json()["citations"]) >= 1


def test_query_top_k_is_bounded_by_validation(client):
  response = client.post("/query", json={"question": "anything", "top_k": 999})
  assert response.status_code == 422  # exceeds the le=20 bound


def test_unhandled_exception_returns_generic_500_not_a_stack_trace(client, monkeypatch):
  def boom(*args, **kwargs):
    raise RuntimeError("simulated internal failure with sensitive details")

  monkeypatch.setattr(api_server.pipeline, "analyze", boom)
  response = client.post("/analyze", json={"transcript": "Some transcript text here that is long enough."})
  assert response.status_code == 500
  assert "sensitive details" not in response.text
  assert "request_id" in response.json()
