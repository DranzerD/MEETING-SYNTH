from aura_core.chunking import chunk_transcript


def test_add_and_count(temp_vectorstore, fake_embeddings):
  embed_texts, _ = fake_embeddings
  chunks = chunk_transcript("We decided to ship Friday. Dana owns the release notes.", "m1")
  temp_vectorstore.add_chunks(chunks, embed_texts([c.text for c in chunks]))

  assert temp_vectorstore.count() == len(chunks)
  assert temp_vectorstore.count(meeting_id="m1") == len(chunks)
  assert temp_vectorstore.count(meeting_id="does-not-exist") == 0


def test_meeting_scoped_query_never_leaks_other_meetings(temp_vectorstore, fake_embeddings):
  embed_texts, embed_query = fake_embeddings
  chunks_a = chunk_transcript("Meeting A discusses the budget cut and GPU spend.", "meeting-a")
  chunks_b = chunk_transcript("Meeting B discusses the Kubernetes migration timeline.", "meeting-b")
  temp_vectorstore.add_chunks(chunks_a, embed_texts([c.text for c in chunks_a]))
  temp_vectorstore.add_chunks(chunks_b, embed_texts([c.text for c in chunks_b]))

  result = temp_vectorstore.query(embed_query("budget"), top_k=10, meeting_ids=["meeting-a"])
  meeting_ids = {m.get("meeting_id") for m in result["metadatas"][0]}
  assert meeting_ids == {"meeting-a"}


def test_multi_meeting_scoping_includes_all_requested(temp_vectorstore, fake_embeddings):
  embed_texts, embed_query = fake_embeddings
  for mid in ("m1", "m2", "m3"):
    chunks = chunk_transcript(f"Content unique to {mid} about quarterly planning.", mid)
    temp_vectorstore.add_chunks(chunks, embed_texts([c.text for c in chunks]))

  result = temp_vectorstore.query(embed_query("planning"), top_k=10, meeting_ids=["m1", "m3"])
  meeting_ids = {m.get("meeting_id") for m in result["metadatas"][0]}
  assert meeting_ids <= {"m1", "m3"}
  assert "m2" not in meeting_ids


def test_upsert_overwrites_same_chunk_id_without_duplicating(temp_vectorstore, fake_embeddings):
  embed_texts, _ = fake_embeddings
  chunks = chunk_transcript("Original short transcript text here.", "m1")
  temp_vectorstore.add_chunks(chunks, embed_texts([c.text for c in chunks]))
  before = temp_vectorstore.count(meeting_id="m1")

  # Re-adding chunks with the exact same ids should overwrite, not duplicate.
  temp_vectorstore.add_chunks(chunks, embed_texts([c.text for c in chunks]))
  after = temp_vectorstore.count(meeting_id="m1")
  assert before == after


def test_delete_meeting_removes_only_that_meeting(temp_vectorstore, fake_embeddings):
  embed_texts, _ = fake_embeddings
  chunks_a = chunk_transcript("Meeting A transcript content about launch planning.", "meeting-a")
  chunks_b = chunk_transcript("Meeting B transcript content about hiring plans.", "meeting-b")
  temp_vectorstore.add_chunks(chunks_a, embed_texts([c.text for c in chunks_a]))
  temp_vectorstore.add_chunks(chunks_b, embed_texts([c.text for c in chunks_b]))

  temp_vectorstore.delete_meeting("meeting-a")

  assert temp_vectorstore.count(meeting_id="meeting-a") == 0
  assert temp_vectorstore.count(meeting_id="meeting-b") == len(chunks_b)


def test_add_chunks_rejects_mismatched_lengths(temp_vectorstore, fake_embeddings):
  embed_texts, _ = fake_embeddings
  chunks = chunk_transcript("Some transcript text that becomes at least one chunk.", "m1")
  try:
    temp_vectorstore.add_chunks(chunks, embed_texts([c.text for c in chunks])[:0])
    assert False, "expected ValueError for mismatched chunks/embeddings length"
  except ValueError:
    pass


def test_empty_chunks_is_a_noop(temp_vectorstore):
  temp_vectorstore.add_chunks([], [])
  assert temp_vectorstore.count() == 0
