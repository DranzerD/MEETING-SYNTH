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
  sentence when present, and falls back to plain sentence splitting when
  it isn't.

  Splits the ORIGINAL transcript's lines first, then cleans each line
  individually -- not the other way around. `clean_text` collapses all
  whitespace runs (including newlines) into single spaces, so cleaning
  the whole transcript before splitting into lines would silently merge
  every "Speaker: ..." line into one before this function ever saw more
  than one line, and every sentence after the first speaker's would be
  mis-attributed to that first speaker. This previously meant speaker
  attribution only ever worked by accident, on transcripts with no
  newlines at all.

  Character offsets are computed directly from the sentence text and a
  running cursor (rather than re-locating each sentence with `.find` in a
  separately-built string), since building the offsets while assembling
  the sentence list is both simpler and immune to a short, repeated
  sentence being found at the wrong occurrence.
  """
  sentences: list[TranscriptSentence] = []
  cursor = 0

  for raw_line in transcript.splitlines():
    line = clean_text(raw_line)
    if not line:
      continue

    speaker_match = _SPEAKER_LINE.match(line)
    speaker = speaker_match.group(1).strip() if speaker_match else None
    body = speaker_match.group(2) if speaker_match else line

    for sentence in sentence_split(body):
      start = cursor
      end = start + len(sentence)
      sentences.append(TranscriptSentence(
          text=sentence, speaker=speaker, char_start=start, char_end=end))
      cursor = end + 1  # +1 for the space this sentence will be joined with

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
