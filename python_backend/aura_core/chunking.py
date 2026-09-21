"""Transcript chunking for retrieval-augmented generation.

Meeting transcripts are split at sentence boundaries into overlapping,
size-bounded windows -- not naive fixed-character slices -- so each chunk
stays a coherent unit of meaning and consecutive chunks share enough
context that an answer sitting near a chunk boundary is never lost between
two searchable pieces.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .config import CHUNK_OVERLAP_SENTENCES, CHUNK_SIZE_WORDS
from .preprocessing import clean_text, sentence_split

# Matches a leading "Speaker Name: ..." attribution, when the transcript
# has one. Our bundled sample transcripts don't (plain prose), so this is
# best-effort: it degrades to `speaker=None` rather than mis-tagging text.
_SPEAKER_LINE = re.compile(r"^\s*([A-Z][A-Za-z0-9 .'-]{1,40}):\s+(.+)$")

# ~180 words (AURA_CHUNK_SIZE_WORDS) keeps a chunk well under
# all-MiniLM-L6-v2's 256 token window (a token is usually < 1 word) while
# still holding a few sentences of real context. 2 sentences of overlap
# (AURA_CHUNK_OVERLAP_SENTENCES) means a fact stated right at a chunk
# boundary still appears whole in at least one chunk.
DEFAULT_CHUNK_SIZE_WORDS = CHUNK_SIZE_WORDS
DEFAULT_CHUNK_OVERLAP_SENTENCES = CHUNK_OVERLAP_SENTENCES


@dataclass
class TranscriptSentence:
  text: str
  speaker: str | None
  char_start: int
  char_end: int


@dataclass
class TranscriptChunk:
  chunk_id: str
  meeting_id: str
  chunk_index: int
  text: str
  speakers: list[str]
  sentence_count: int
  word_count: int
  char_start: int
  char_end: int


def _split_into_sentences_with_speakers(transcript: str) -> list[TranscriptSentence]:
  """Line-aware sentence split that keeps "Speaker: ..." attribution per
  sentence when present, and falls back to plain sentence splitting over
  the whole transcript when it isn't."""
  cleaned = clean_text(transcript)
  sentences: list[TranscriptSentence] = []
  cursor = 0

  for raw_line in cleaned.splitlines():
    line = raw_line.strip()
    if not line:
      cursor += len(raw_line) + 1
      continue

    speaker_match = _SPEAKER_LINE.match(line)
    speaker = speaker_match.group(1).strip() if speaker_match else None
    body = speaker_match.group(2) if speaker_match else line

    search_from = cursor
    line_pos = cleaned.find(body, search_from)
    if line_pos == -1:
      line_pos = search_from

    for sentence in sentence_split(body):
      start = cleaned.find(sentence, line_pos)
      if start == -1:
        start = line_pos
      end = start + len(sentence)
      sentences.append(TranscriptSentence(
          text=sentence, speaker=speaker, char_start=start, char_end=end))
      line_pos = end

    cursor = line_pos

  if not sentences:
    # Whole-document fallback (e.g. one giant line with no newlines).
    pos = 0
    for sentence in sentence_split(cleaned):
      start = cleaned.find(sentence, pos)
      if start == -1:
        start = pos
      end = start + len(sentence)
      sentences.append(TranscriptSentence(text=sentence, speaker=None, char_start=start, char_end=end))
      pos = end

  return sentences


def chunk_transcript(
    transcript: str,
    meeting_id: str,
    *,
    chunk_size_words: int = DEFAULT_CHUNK_SIZE_WORDS,
    overlap_sentences: int = DEFAULT_CHUNK_OVERLAP_SENTENCES,
) -> list[TranscriptChunk]:
  """Greedy sentence-packing chunker with sentence-level overlap.

  Sentences are appended to the current chunk until adding the next one
  would exceed `chunk_size_words` (a single very long sentence is still
  kept whole rather than dropped or cut mid-sentence). The next chunk then
  starts `overlap_sentences` sentences before that boundary, so retrieval
  near a chunk edge still sees the sentences on the other side of it.
  """
  sentences = _split_into_sentences_with_speakers(transcript)
  if not sentences:
    return []

  chunks: list[TranscriptChunk] = []
  start_idx = 0
  chunk_index = 0
  total = len(sentences)

  while start_idx < total:
    word_count = 0
    end_idx = start_idx
    while end_idx < total:
      next_words = len(sentences[end_idx].text.split())
      if word_count and word_count + next_words > chunk_size_words:
        break
      word_count += next_words
      end_idx += 1

    window = sentences[start_idx:end_idx]
    speakers = list(dict.fromkeys(s.speaker for s in window if s.speaker))
    chunk_text = " ".join(s.text for s in window)

    chunks.append(TranscriptChunk(
        chunk_id=f"{meeting_id}::chunk-{chunk_index}",
        meeting_id=meeting_id,
        chunk_index=chunk_index,
        text=chunk_text,
        speakers=speakers,
        sentence_count=len(window),
        word_count=word_count,
        char_start=window[0].char_start,
        char_end=window[-1].char_end,
    ))
    chunk_index += 1

    if end_idx >= total:
      break
    start_idx = max(end_idx - overlap_sentences, start_idx + 1)

  return chunks
