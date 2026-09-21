"""Decision extraction using multi-class logistic model."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from .models import ModelRegistry
from .preprocessing import extract_names


@dataclass
class DecisionInsight:
  sentence: str
  decision: str
  type: str
  participants: list[str]
  confidence: float


def extract_decisions(sentences: Iterable[str], registry: ModelRegistry,
                      threshold: float = 0.45) -> list[DecisionInsight]:
  sentences = [s.strip() for s in sentences if s.strip()]
  if not sentences:
    return []
  registry.ensure_models()
  predictions = registry.decision_classifier.predict(sentences)
  probas = registry.decision_classifier.predict_proba(sentences)

  decisions: list[DecisionInsight] = []
  class_list = list(registry.decision_classifier.classes)
  for sentence, label, probs in zip(sentences, predictions, probas):
    label = str(label)
    confidence = float(probs[class_list.index(label)])
    if confidence < threshold:
      continue
    decisions.append(DecisionInsight(
        sentence=sentence,
        decision=sentence,
        type=label,
        participants=list(dict.fromkeys(extract_names(sentence)))[:3],
        confidence=round(confidence, 2),
    ))
  return decisions
