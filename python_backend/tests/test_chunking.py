import re

from aura_core.chunking import chunk_transcript


def _sentences(text: str) -> set[str]:
  return {s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()}


def test_empty_transcript_returns_no_chunks():
  assert chunk_transcript("", "m1") == []
  assert chunk_transcript("   \n\n  ", "m1") == []


def test_short_transcript_is_a_single_chunk():
  text = "We agreed to ship on Friday. Dana owns the release notes."
  chunks = chunk_transcript(text, "m1")
  assert len(chunks) == 1
  assert chunks[0].meeting_id == "m1"
  assert chunks[0].chunk_index == 0
  assert "Friday" in chunks[0].text


def test_long_transcript_produces_multiple_overlapping_chunks():
  # ~30 short sentences, well past the 180-word default budget.
  sentence = "Person number {i} will follow up on item {i} before the deadline."
  text = " ".join(sentence.format(i=i) for i in range(60))
  chunks = chunk_transcript(text, "m2", chunk_size_words=40, overlap_sentences=2)

  assert len(chunks) > 1
  for i, chunk in enumerate(chunks):
    assert chunk.chunk_index == i
    assert chunk.meeting_id == "m2"
    assert chunk.word_count > 0
    assert chunk.chunk_id == f"m2::chunk-{i}"

  # Consecutive chunks should overlap: some of chunk 0's sentences should
  # reappear whole in chunk 1, so a fact near a boundary is never split
  # across chunks with no whole copy anywhere.
  overlap = _sentences(chunks[0].text) & _sentences(chunks[1].text)
  assert overlap, f"expected shared sentences between chunk 0 and 1, got none.\nchunk0={chunks[0].text!r}\nchunk1={chunks[1].text!r}"


def test_single_very_long_sentence_is_kept_whole_not_truncated():
  long_sentence = "This is one extremely long run-on sentence that just keeps going " * 20
  long_sentence = long_sentence.strip() + "."
  chunks = chunk_transcript(long_sentence, "m3", chunk_size_words=20, overlap_sentences=1)

  assert len(chunks) == 1
  assert chunks[0].text.strip() == long_sentence.strip()


def test_speaker_attribution_is_captured_when_present():
  text = "Dana: We should ship Friday.\nLeo: I can own the release notes."
  chunks = chunk_transcript(text, "m4")
  assert len(chunks) == 1
  assert set(chunks[0].speakers) == {"Dana", "Leo"}


def test_speaker_attribution_degrades_gracefully_without_speaker_lines():
  text = "We should ship Friday. It has been a smooth sprint overall."
  chunks = chunk_transcript(text, "m5")
  assert chunks[0].speakers == []


def test_char_offsets_are_within_transcript_bounds():
  text = "First sentence here. Second sentence follows. Third one too."
  chunks = chunk_transcript(text, "m6", chunk_size_words=5, overlap_sentences=1)
  for chunk in chunks:
    assert 0 <= chunk.char_start <= chunk.char_end <= len(text) + 1
