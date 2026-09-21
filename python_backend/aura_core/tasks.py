"""Task extraction built on logistic classifier + heuristics."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

import numpy as np

from .models import ModelRegistry
from .preprocessing import extract_names

DEADLINE_PATTERNS = [
    re.compile(r"by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)", re.I),
    re.compile(r"by\s+(today|tomorrow|tonight|next week|next monday|next sprint)", re.I),
    re.compile(r"by\s+([A-Z][a-z]+\s+\d{1,2})"),
    re.compile(r"by\s+(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2})"),
]

PRIORITY_RULES = {
    "high": re.compile(r"critical|urgent|asap|blocker|immediately", re.I),
    "medium": re.compile(r"should|need to|important|follow up", re.I),
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


def _detect_assignee(sentence: str) -> str:
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
