"""Decision extraction: detection is rule-based, the classifier only types.

Regression: the extractor used to threshold the type classifier's
confidence for *detection*, which returned zero decisions on every sample
transcript because that classifier has no "not a decision" class.
"""

from __future__ import annotations

import pytest

from aura_core.decisions import extract_decisions, has_decision_language
from aura_core.models import ModelRegistry


@pytest.fixture(scope="module")
def registry(tmp_path_factory):
  from pathlib import Path
  models_dir = Path(__file__).resolve().parents[1] / "models"
  reg = ModelRegistry(models_dir)
  reg.ensure_models()
  return reg


@pytest.mark.parametrize("sentence", [
    "The team agreed we should extend the beta window by one week.",
    "We decided to postpone the customer webinar until October 28.",
    "Lisa concluded we will keep the existing AWS footprint this sprint.",
    "Finance approved a $40k allocation for additional GPU credits.",
    "The group rejected a proposal to move the service to gRPC for now.",
])
def test_detects_decision_language(sentence):
  assert has_decision_language(sentence)


@pytest.mark.parametrize("sentence", [
    "John will fix the database deadlocks by Friday.",      # a task, not a decision
    "Did we decide anything about the budget?",             # a question
    "Agreed.",                                              # no content
    "Omar: Agreed, I'll add that today.",                   # acknowledgement
    "Leo: Good, glad that's resolved.",
    "Everyone felt confident about the revised scope.",
])
def test_ignores_non_decisions(sentence):
  assert not has_decision_language(sentence)


def test_extract_decisions_finds_decisions_in_realistic_prose(registry):
  sentences = [
      "Sarah opened by celebrating that onboarding tickets dropped by 38%.",
      "The team agreed we should extend the beta window by one week.",
      "John will fix the lingering database deadlocks by Friday.",
      "We decided to postpone the customer webinar until October 28.",
  ]
  found = extract_decisions(sentences, registry)
  assert [d.sentence for d in found] == [sentences[1], sentences[3]]
  assert all(d.type in {"timeline", "budget", "technical", "general"} for d in found)


def test_extract_decisions_empty_input(registry):
  assert extract_decisions([], registry) == []
