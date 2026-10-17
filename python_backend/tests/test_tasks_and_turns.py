"""Regression tests for assignee detection and line-aware sentence splitting
on speaker-labelled transcripts."""

from __future__ import annotations

import pytest

from aura_core.preprocessing import Document, extract_names, split_turns
from aura_core.tasks import _detect_assignee, _detect_deadline, _detect_priority


class TestNamesAreNotDates:
  def test_weekdays_and_months_are_not_people(self):
    assert extract_names("I'll have it ready by Wednesday") == []
    assert extract_names("Dana will launch on October 28") == ["Dana"]


class TestAssignee:
  def test_first_person_commitment_goes_to_the_speaker(self):
    assert _detect_assignee("Leo: I will stabilize the flaky test suite by Wednesday.") == "Leo"
    assert _detect_assignee("Dana: I'll own the migration runbook.") == "Dana"

  def test_speaker_is_not_the_assignee_of_a_request_to_someone_else(self):
    assert _detect_assignee("Dana: Can you bump the pool size before we rely on staging?") == "Not specified"

  def test_leading_acknowledgement_does_not_hide_a_commitment(self):
    assert _detect_assignee("Dana: Agreed, I'll check the alerting setup by October 30.") == "Dana"

  def test_named_person_in_third_person_sentence_still_wins(self):
    assert _detect_assignee("Leo: Priya will update the dashboard copy.") == "Priya"

  def test_unlabelled_sentence_unchanged(self):
    assert _detect_assignee("John will fix the deadlocks by Friday.") == "John"
    assert _detect_assignee("The team should review this.") == "Team"


class TestDeadlineAndPriority:
  @pytest.mark.parametrize("sentence,expected", [
      ("Priya needs to finalize the copy by next Tuesday.", "by next Tuesday"),
      ("Raj will fix it by Friday.", "by Friday"),
      ("Carlos must renew by October 30.", "by October 30"),
  ])
  def test_deadline_detection(self, sentence, expected):
    assert _detect_deadline(sentence) == expected

  def test_needs_to_is_medium_priority(self):
    assert _detect_priority("Priya needs to finalize the copy.") == "medium"


class TestSplitTurns:
  def test_speaker_lines_without_periods_stay_separate(self):
    raw = "Dana: Let's talk about the migration\nLeo: I will stabilize the tests by Wednesday\nMarcus: Sounds good"
    assert split_turns(raw) == [
        "Dana: Let's talk about the migration",
        "Leo: I will stabilize the tests by Wednesday",
        "Marcus: Sounds good",
    ]

  def test_hard_wrapped_lines_are_joined(self):
    raw = "We will ship the build\nby Friday and share notes.\nPriya will review it."
    assert split_turns(raw) == ["We will ship the build by Friday and share notes.", "Priya will review it."]

  def test_blank_line_separates_heading_from_body(self):
    assert split_turns("Budget review - Nov 3\n\nFinance approved the plan.") == [
        "Budget review - Nov 3", "Finance approved the plan."]

  def test_document_sentence_count_on_unpunctuated_labelled_transcript(self):
    raw = "\n".join([
        "Dana: Let's talk about the Kubernetes migration",
        "Leo: I will stabilize the flaky test suite by Wednesday",
        "Dana: I will own the migration runbook and draft it this week",
        "Marcus: We decided to postpone the design system refresh until after the migration ships",
    ])
    # Used to collapse into a single sentence.
    assert len(Document.from_text(raw).sentences) == 4
