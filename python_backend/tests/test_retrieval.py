from aura_core.chunking import chunk_transcript
from aura_core.retrieval import retrieve


def _index(store, embed_texts, meeting_id: str, text: str):
  chunks = chunk_transcript(text, meeting_id)
  store.add_chunks(chunks, embed_texts([c.text for c in chunks]))
  return chunks


def test_retrieve_without_rerank_returns_top_k(temp_vectorstore, fake_embeddings):
  embed_texts, _ = fake_embeddings
  for i in range(8):
    _index(temp_vectorstore, embed_texts, f"m{i}", f"Meeting {i} content about topic number {i}.")

  result = retrieve("topic", top_k=3, store=temp_vectorstore, rerank=False)
  assert len(result.matches) == 3
  assert result.reranked is False
  assert result.rerank_latency_ms == 0.0
  assert result.embed_latency_ms >= 0
  assert result.search_latency_ms >= 0


def test_retrieve_meeting_scoped_filters_results(temp_vectorstore, fake_embeddings):
  embed_texts, _ = fake_embeddings
  _index(temp_vectorstore, embed_texts, "meeting-a", "Discussion of the Q3 budget and travel cuts.")
  _index(temp_vectorstore, embed_texts, "meeting-b", "Discussion of the Kubernetes migration plan.")

  result = retrieve("budget", top_k=5, store=temp_vectorstore, meeting_ids=["meeting-a"], rerank=False)
  assert all(m.meeting_id == "meeting-a" for m in result.matches)


def test_retrieve_on_empty_store_returns_no_matches(temp_vectorstore, fake_embeddings):
  result = retrieve("anything", top_k=5, store=temp_vectorstore, rerank=False)
  assert result.matches == []


def test_rerank_uses_larger_candidate_pool_than_top_k(temp_vectorstore, fake_embeddings, monkeypatch):
  embed_texts, _ = fake_embeddings
  for i in range(15):
    _index(temp_vectorstore, embed_texts, f"m{i}", f"Meeting {i} unique content about subject {i}.")

  seen_candidate_counts = []
  original_query = temp_vectorstore.query

  def spy_query(query_embedding, *, top_k, meeting_ids=None):
    seen_candidate_counts.append(top_k)
    return original_query(query_embedding, top_k=top_k, meeting_ids=meeting_ids)

  monkeypatch.setattr(temp_vectorstore, "query", spy_query)

  import aura_core.reranking as reranking_module
  # Reverse the candidate order deterministically so we can prove the
  # final result actually reflects the (fake) rerank scores, not just the
  # original ANN order.
  monkeypatch.setattr(
      reranking_module, "rerank_scores",
      lambda query, documents: list(range(len(documents))),
  )

  result = retrieve("subject", top_k=3, store=temp_vectorstore, rerank=True)

  assert seen_candidate_counts[0] > 3  # over-fetched a real candidate pool
  assert result.reranked is True
  assert len(result.matches) == 3
  # rerank_scores returned ascending scores in candidate order, so the
  # *last* candidate (highest fake score) should now be ranked first.
  assert result.matches[0].rerank_score == max(m.rerank_score for m in result.matches)


def test_rerank_falls_back_to_ann_order_when_reranker_unavailable(temp_vectorstore, fake_embeddings, monkeypatch):
  embed_texts, _ = fake_embeddings
  for i in range(5):
    _index(temp_vectorstore, embed_texts, f"m{i}", f"Meeting {i} content about item {i}.")

  import aura_core.reranking as reranking_module
  monkeypatch.setattr(reranking_module, "rerank_scores", lambda query, documents: None)

  result = retrieve("item", top_k=3, store=temp_vectorstore, rerank=True)
  assert result.reranked is False  # gracefully degraded, not crashed
  assert len(result.matches) == 3
  assert all(m.rerank_score is None for m in result.matches)


def test_retrieval_logs_latency_jsonl(temp_vectorstore, fake_embeddings, tmp_path, monkeypatch):
  import aura_core.retrieval as retrieval_module
  log_path = tmp_path / "retrieval_latency.jsonl"
  monkeypatch.setattr(retrieval_module, "LATENCY_LOG_PATH", log_path)

  embed_texts, _ = fake_embeddings
  _index(temp_vectorstore, embed_texts, "m1", "Some content to retrieve.")
  retrieve("content", top_k=3, store=temp_vectorstore, rerank=False)

  assert log_path.exists()
  lines = log_path.read_text().strip().splitlines()
  assert len(lines) == 1
