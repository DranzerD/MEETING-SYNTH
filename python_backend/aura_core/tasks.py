"""Task extraction built on logistic classifier + heuristics."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

import numpy as np

from .models import ModelRegistry
from .preprocessing import extract_names

DEADLINE_PATTERNS = [
    re.compile(r"by\s+(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)", re.I),
    re.compile(r"by\s+(today|tomorrow|tonight|next week|next sprint)", re.I),
    re.compile(r"by\s+([A-Z][a-z]+\s+\d{1,2})"),
    re.compile(r"by\s+(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2})"),
]

PRIORITY_RULES = {
    "high": re.compile(r"critical|urgent|asap|blocker|immediately", re.I),
    "medium": re.compile(r"should|needs? to|important|follow up", re.I),
}


@dataclass
class TaskInsight:
  sentence: str
  task: str
  assignee: str
  deadline: str | None
  priority: str
  confidence: float


def _detect_deadline(sentence: str) -> str | None:
  for pattern in DEADLINE_PATTERNS:
    match = pattern.search(sentence)
    if match:
      return match.group(0)
  return None


def _detect_priority(sentence: str) -> str:
  if PRIORITY_RULES['high'].search(sentence):
    return 'high'
  if PRIORITY_RULES['medium'].search(sentence):
    return 'medium'
  return 'low'


# "Dana: I'll own the runbook" -> the speaker is the assignee. In every other
# case the speaker label is only who is talking ("Dana: Can you bump the pool
# size?"), so it must not be treated as the assignee.
_SPEAKER_PREFIX = re.compile(r"^\s*([A-Z][A-Za-z0-9 .'-]{0,40}):\s+(.*)$")
_FIRST_PERSON_COMMITMENT = re.compile(
    r"^(?:i\s+will|i'll|i\s+can|i\s+am going to|i'm going to|let me|i\s+need to|i\s+should)\b", re.I)


_LEADING_ACK = re.compile(r"^(?:agreed|ok|okay|sure|yes|yeah|sounds good|great|good)\b[,.!]?\s*", re.I)


def _detect_assignee(raw_sentence: str) -> str:
  speaker_match = _SPEAKER_PREFIX.match(raw_sentence)
  speaker = speaker_match.group(1).strip() if speaker_match else None
  sentence = speaker_match.group(2) if speaker_match else raw_sentence
  sentence = _LEADING_ACK.sub("", sentence)  # "Agreed, I'll check X" -> "I'll check X"
  if speaker and _FIRST_PERSON_COMMITMENT.match(sentence):
    return speaker

  names = extract_names(sentence)
  if names:
    return names[0]
  if "team" in sentence.lower():
    return "Team"
  return "Not specified"


def extract_tasks(sentences: Iterable[str], registry: ModelRegistry,
                  threshold: float = 0.55) -> list[TaskInsight]:
  sentences = list(sentences)
  if not sentences:
    return []
  registry.ensure_models()
  probas = registry.task_classifier.predict_proba(sentences)
  task_index = list(registry.task_classifier.classes).index(1) if 1 in registry.task_classifier.classes else -1
  outputs: list[TaskInsight] = []
  for sentence, probs in zip(sentences, probas):
    confidence = float(probs[task_index]) if task_index >= 0 else float(probs[-1])
    if confidence < threshold:
      continue
    outputs.append(TaskInsight(
        sentence=sentence.strip(),
        task=sentence.strip(),
        assignee=_detect_assignee(sentence),
        deadline=_detect_deadline(sentence),
        priority=_detect_priority(sentence),
        confidence=round(confidence, 2),
    ))
  return outputs
