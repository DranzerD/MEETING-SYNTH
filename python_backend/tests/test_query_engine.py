"""Unit tests for the two hallucination safeguards in query_engine.py:
the relevance-score gate (refuse instead of answering from weak matches)
and citation-marker enforcement (flag answers with no traceable [n] cite).

These monkeypatch retrieval.retrieve and LLMFallback.chat_complete
directly so the tests isolate query_engine's own control flow from the
embedding model, Chroma, and any real LLM provider.
"""

from __future__ import annotations

from aura_core.query_engine import RAGChatEngine
from aura_core.retrieval import RetrievalResult, RetrievedChunk


def _fake_match(meeting_id="m1", chunk_index=0, score=0.6, text="Dana owns the release notes."):
  return RetrievedChunk(
      chunk_id=f"{meeting_id}::chunk-{chunk_index}",
      meeting_id=meeting_id,
      chunk_index=chunk_index,
      text=text,
      speakers=["Dana"],
      char_start=0,
      char_end=len(text),
      score=score,
  )


def _fake_retrieval_result(matches, query="question"):
  return RetrievalResult(
      query=query, matches=matches, latency_ms=5.0, embed_latency_ms=2.0,
      search_latency_ms=3.0, rerank_latency_ms=0.0, reranked=False, meeting_ids=None,
  )


class _StubLLM:
  def __init__(self, response_text: str, provider: str = "groq"):
    self.response_text = response_text
    self.provider = provider
    self.calls = 0

  def chat_complete(self, prompt, *, system=None, max_tokens=700):
    self.calls += 1
    return self.response_text, self.provider


def test_refuses_when_top_match_below_relevance_threshold(monkeypatch):
  import aura_core.query_engine as qe_module
  low_score_match = _fake_match(score=0.05)  # well below MIN_RELEVANCE_SCORE
  monkeypatch.setattr(qe_module, "retrieve", lambda *a, **k: _fake_retrieval_result([low_score_match]))

  llm = _StubLLM("this should never be returned")
  engine = RAGChatEngine(store=object(), llm=llm)
  answer = engine.answer("What did we decide about the office plants?")

  assert llm.calls == 0  # the LLM must not even be called
  assert answer.citations == []
  assert answer.grounded is False
  assert "don't have enough evidence" in answer.answer.lower()


def test_answers_when_top_match_above_relevance_threshold(monkeypatch):
  import aura_core.query_engine as qe_module
  good_match = _fake_match(score=0.75)
  monkeypatch.setattr(qe_module, "retrieve", lambda *a, **k: _fake_retrieval_result([good_match]))

  llm = _StubLLM("Dana owns the release notes [1].")
  engine = RAGChatEngine(store=object(), llm=llm)
  answer = engine.answer("Who owns the release notes?")

  assert llm.calls == 1
  assert len(answer.citations) == 1
  assert answer.citations[0].meeting_id == "m1"
  assert answer.citations[0].speakers == ["Dana"]
  assert answer.grounded is True


def test_answer_without_citation_marker_is_flagged_ungrounded(monkeypatch):
  import aura_core.query_engine as qe_module
  good_match = _fake_match(score=0.75)
  monkeypatch.setattr(qe_module, "retrieve", lambda *a, **k: _fake_retrieval_result([good_match]))

  llm = _StubLLM("Dana owns the release notes.")  # no [1] marker
  engine = RAGChatEngine(store=object(), llm=llm)
  answer = engine.answer("Who owns the release notes?")

  assert answer.grounded is False
  # Still returns citations for what was retrieved -- grounded=False is a
  # signal about the *answer text*, not a reason to hide the evidence.
  assert len(answer.citations) == 1


def test_no_indexed_content_at_all_short_circuits_before_llm(monkeypatch):
  import aura_core.query_engine as qe_module
  monkeypatch.setattr(qe_module, "retrieve", lambda *a, **k: _fake_retrieval_result([]))

  llm = _StubLLM("should not be called")
  engine = RAGChatEngine(store=object(), llm=llm)
  answer = engine.answer("Anything?")

  assert llm.calls == 0
  assert answer.citations == []


def test_citation_snippet_is_truncated_for_long_chunks(monkeypatch):
  import aura_core.query_engine as qe_module
  long_text = "A" * 500
  match = _fake_match(score=0.9, text=long_text)
  monkeypatch.setattr(qe_module, "retrieve", lambda *a, **k: _fake_retrieval_result([match]))

  llm = _StubLLM("Answer [1].")
  engine = RAGChatEngine(store=object(), llm=llm)
  answer = engine.answer("question")

  assert len(answer.citations[0].snippet) <= 241  # 240 chars + ellipsis
