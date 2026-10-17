"""Decision extraction: rule-based detection + classifier-based typing.

Detecting *that* a sentence states a decision and classifying *what kind* of
decision it is are different problems. The 4-class classifier in
`models.py` is trained only on decision sentences (timeline/budget/
technical/general) -- it has no "not a decision" class, so its confidence
says nothing about whether a sentence is a decision at all. Thresholding it
for detection returned zero decisions on every transcript in this repo.

So detection uses decision language (the same signal the TypeScript
pipeline uses), and the classifier only picks the type for sentences that
passed detection. A sentence is also accepted without a keyword when the
classifier is very confident (`classifier_threshold`).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from .models import ModelRegistry
from .preprocessing import extract_names

# Past-tense / resolution verbs that state an outcome. Deliberately not
# "decide"/"agree" alone: "we need to decide" is an open question, not a
# decision.
_DECISION_PATTERNS = [
    re.compile(
        r"\b(decided|agreed|concluded|determined|approved|rejected|"
        r"greenlit|green-lit|chose|selected|settled on|signed off)\b", re.I),
    re.compile(r"\b(?:we|team|group|everyone)\s+(?:will|are going to|'ll)\s+(?:go with|keep|stick with|move forward with)\b", re.I),
    re.compile(r"\b(?:the )?decision (?:is|was) to\b", re.I),
]

# "Whether we decided ...?" / "Have we agreed ...?" are questions, and
# "Agreed." alone has no content to report.
_MIN_WORDS = 5

# A turn that *starts* with "Agreed" is an acknowledgement of someone else's
# proposal ("Agreed, I'll add that today."), not the statement of a decision.
_SPEAKER_PREFIX = re.compile(r"^\s*[A-Z][A-Za-z0-9 .'-]{0,40}:\s+")
_ACKNOWLEDGEMENT = re.compile(r"^(agreed|sounds good|good|great|ok|okay)\b", re.I)


@dataclass
class DecisionInsight:
  sentence: str
  decision: str
  type: str
  participants: list[str]
  confidence: float


def has_decision_language(sentence: str) -> bool:
  if sentence.rstrip().endswith("?") or len(sentence.split()) < _MIN_WORDS:
    return False
  if _ACKNOWLEDGEMENT.match(_SPEAKER_PREFIX.sub("", sentence)):
    return False
  return any(p.search(sentence) for p in _DECISION_PATTERNS)


def extract_decisions(sentences: Iterable[str], registry: ModelRegistry,
                      classifier_threshold: float = 0.6) -> list[DecisionInsight]:
  sentences = [s.strip() for s in sentences if s.strip()]
  if not sentences:
    return []
  registry.ensure_models()
  classifier = registry.decision_classifier
  class_list = [str(c) for c in classifier.classes]
  probas = classifier.predict_proba(sentences)

  decisions: list[DecisionInsight] = []
  for sentence, probs in zip(sentences, probas):
    best = max(range(len(class_list)), key=lambda i: probs[i])
    label, type_confidence = class_list[best], float(probs[best])
    detected = has_decision_language(sentence)
    if not detected and type_confidence < classifier_threshold:
      continue
    decisions.append(DecisionInsight(
        sentence=sentence,
        decision=sentence,
        type=label,
        participants=list(dict.fromkeys(extract_names(sentence)))[:3],
        # Not a calibrated probability: rule hits get a fixed 0.8 (the
        # patterns were reviewed by hand against this repo's transcripts,
        # not fit to data); classifier-only hits use its own probability.
        confidence=round(0.8 if detected else type_confidence, 2),
    ))
  return decisions
