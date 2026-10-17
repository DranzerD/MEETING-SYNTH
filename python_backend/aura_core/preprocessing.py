"""Text normalization and NLP utilities for Aura Core."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, List

import nltk
from nltk import sent_tokenize

_CONTROL_PATTERN = re.compile(r"[\u0000-\u001F]+")
_MULTI_SPACE = re.compile(r"\s+")
_CAPITALIZED = re.compile(r"\b[A-Z][a-z]+\b")

# Sentence-initial pronouns/articles are capitalized purely by position,
# not because they're names -- without filtering these, "We should ship
# Friday." extracts "We" as a candidate assignee/participant name. Mirrors
# the same fix in src/app/lib/aura/preprocessing.ts's extractCapitalizedTokens.
_COMMON_WORDS = {
    "The", "This", "That", "These", "Those", "We", "They", "It", "He", "She",
    "You", "Our", "Their", "His", "Her", "Someone", "Everyone", "Everybody",
    "Anyone", "Nobody", "All", "Team",
    # Days and months are capitalized too but are dates, not people -- "I'll
    # have it ready by Wednesday" must not make "Wednesday" the assignee.
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    "January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December",
    # Capitalized only because they open a sentence ("Can you bump the pool
    # size?"), never names.
    "Can", "Could", "Would", "Should", "Will", "Shall", "May", "Might", "Must",
    "Please", "Let", "Lets", "Maybe", "Also", "Then", "So", "But", "And", "Or",
    "Yes", "No", "Okay", "Ok", "Thanks", "Thank", "Agreed", "Sure", "Good",
    "Great", "Sounds", "What", "When", "Where", "Why", "How", "Who", "Which",
    "If", "After", "Before", "Once", "Until", "While", "Next", "Last", "Do",
    "Does", "Did", "Is", "Are", "Was", "Were", "Have", "Has", "Not",
}

# NLTK 3.9+ split the classic "punkt" sentence tokenizer data into two
# resources: "punkt" and "punkt_tab" (the tables PunktTokenizer actually
# loads at runtime). Downloading only "punkt" leaves sent_tokenize()
# raising LookupError on every call -- silently caught below and replaced
# with a naive text.split(".") fallback that mis-splits on abbreviations
# ("Inc.", "Dr.", "e.g.") and can't handle a sentence with no period at
# all. Both must be present for real sentence tokenization to actually run.
_NLTK_RESOURCES = ["punkt", "punkt_tab"]


def ensure_nltk() -> None:
  """Download required NLTK models exactly once."""
  for resource in _NLTK_RESOURCES:
    try:
      nltk.data.find(f"tokenizers/{resource}")
    except LookupError:
      nltk.download(resource)


def clean_text(text: str) -> str:
  cleaned = _CONTROL_PATTERN.sub(" ", text or "")
  cleaned = cleaned.replace("“", '"').replace("”", '"').replace("’", "'")
  cleaned = _MULTI_SPACE.sub(" ", cleaned)
  return cleaned.strip()


def sentence_split(text: str) -> List[str]:
  ensure_nltk()
  try:
    sentences = [s.strip() for s in sent_tokenize(text) if s.strip()]
  except LookupError:
    sentences = [s.strip() for s in text.split(".") if s.strip()]
  return sentences


_SPEAKER_LINE = re.compile(r"^\s*[A-Z][A-Za-z0-9 .'-]{0,40}:\s+")
_ENDS_SENTENCE = re.compile(r"""[.!?]["')\]]*$""")


def split_turns(text: str) -> list[str]:
  """Splits a raw transcript into segments that each hold whole sentences,
  respecting line structure.

  `clean_text` collapses newlines, so cleaning the whole transcript before
  sentence splitting turned "Name: ..." lines with no trailing period into
  one giant sentence (at most one task was ever found). A line break is a
  boundary when the previous line ended a sentence, the next line starts a
  new speaker turn, or there's a blank line; otherwise it's a hard wrap
  and the lines are joined."""
  segments: list[str] = []
  current = ""
  after_blank = False
  for raw_line in (text or "").splitlines():
    line = raw_line.strip()
    if not line:
      after_blank = True
      continue
    if current and (after_blank or _SPEAKER_LINE.match(line) or _ENDS_SENTENCE.search(current)):
      segments.append(current)
      current = line
    else:
      current = f"{current} {line}" if current else line
    after_blank = False
  if current:
    segments.append(current)
  return segments


def extract_names(sentence: str) -> list[str]:
  return [
      match.group(0) for match in _CAPITALIZED.finditer(sentence)
      if match.group(0) not in _COMMON_WORDS
  ]


@dataclass
class Document:
  raw: str
  cleaned: str
  sentences: list[str]

  @classmethod
  def from_text(cls, text: str) -> "Document":
    cleaned = clean_text(text)
    sentences = [s for segment in split_turns(text) for s in sentence_split(clean_text(segment))]
    return cls(raw=text, cleaned=cleaned, sentences=sentences)

  def iter_sentences(self) -> Iterable[str]:
    yield from self.sentences
