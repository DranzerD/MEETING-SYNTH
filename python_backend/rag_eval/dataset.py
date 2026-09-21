"""A small, hand-labeled retrieval evaluation set built from the
transcripts in rag_eval/transcripts/.

Relevance is labeled at the *meeting* level (which meeting(s) a question's
answer should come from), not at the exact chunk level. That's a
deliberate simplification: chunk boundaries shift whenever chunk size or
overlap changes (see aura_core/config.py), so chunk-level gold labels
would silently go stale every time those constants are tuned, while
meeting-level labels stay valid and still directly test whether retrieval
surfaces the right *source* -- which is what actually matters for citation
correctness in the chat UI (the user sees "meeting: X", not a raw chunk
id). A few questions are deliberately answerable from more than one
meeting (e.g. the Kubernetes migration timeline comes up in both sprint
planning transcripts) to exercise cross-meeting retrieval, not just
single-source lookup.

`category` is either:
  - "answerable": at least one indexed meeting should be retrieved in the
    top-k; used for Recall@K / Precision@K / MRR / Hit Rate.
  - "unanswerable": no meeting in the corpus actually answers this; used
    to measure how often the relevance-gate in query_engine.py correctly
    refuses instead of grounding an answer in a merely-closest-available
    but not-actually-relevant chunk.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

TRANSCRIPTS_DIR = Path(__file__).parent / "transcripts"

MEETING_IDS = {
    "sprint_planning_w1": "eval-sprint-planning-w1",
    "sprint_planning_w2": "eval-sprint-planning-w2",
    "budget_review": "eval-budget-review",
    "incident_postmortem": "eval-incident-postmortem",
    "hiring_sync": "eval-hiring-sync",
    "customer_escalation": "eval-customer-escalation",
    "architecture_review": "eval-architecture-review",
    "onboarding_standup": "eval-onboarding-standup",
}


@dataclass
class EvalQuestion:
  qid: str
  question: str
  category: str  # "answerable" | "unanswerable"
  relevant_meeting_ids: list[str]
  notes: str = ""


QUESTIONS: list[EvalQuestion] = [
    EvalQuestion(
        "q01", "What is the current timeline for the Kubernetes migration?",
        "answerable", [MEETING_IDS["sprint_planning_w1"], MEETING_IDS["sprint_planning_w2"]],
        "Cross-meeting: discussed in both sprint planning sessions.",
    ),
    EvalQuestion(
        "q02", "Who owns the migration runbook?",
        "answerable", [MEETING_IDS["sprint_planning_w1"], MEETING_IDS["sprint_planning_w2"]],
        "Cross-meeting: Dana owns it, mentioned in both sessions.",
    ),
    EvalQuestion(
        "q03", "What caused the checkout outage?",
        "answerable", [MEETING_IDS["incident_postmortem"]],
    ),
    EvalQuestion(
        "q04", "What safeguard was added to prevent the checkout database failure from cascading?",
        "answerable", [MEETING_IDS["incident_postmortem"]],
    ),
    EvalQuestion(
        "q05", "By how much was the travel budget cut?",
        "answerable", [MEETING_IDS["budget_review"]],
    ),
    EvalQuestion(
        "q06", "How much was approved for additional GPU credits?",
        "answerable", [MEETING_IDS["budget_review"]],
    ),
    EvalQuestion(
        "q07", "How many backend engineering positions were opened for next quarter?",
        "answerable", [MEETING_IDS["hiring_sync"]],
    ),
    EvalQuestion(
        "q08", "What did the team decide about the open design requisition?",
        "answerable", [MEETING_IDS["hiring_sync"]],
    ),
    EvalQuestion(
        "q09", "What did the Northwind account threaten to do over API rate limits?",
        "answerable", [MEETING_IDS["customer_escalation"]],
    ),
    EvalQuestion(
        "q10", "Who is putting together the permanent pricing tier proposal for Northwind?",
        "answerable", [MEETING_IDS["customer_escalation"]],
    ),
    EvalQuestion(
        "q11", "What messaging technology was chosen for the notifications service?",
        "answerable", [MEETING_IDS["architecture_review"]],
    ),
    EvalQuestion(
        "q12", "Why was gRPC rejected for the notifications service?",
        "answerable", [MEETING_IDS["architecture_review"]],
    ),
    EvalQuestion(
        "q13", "What is the policy for new hires in their first days at the company?",
        "answerable", [MEETING_IDS["hiring_sync"], MEETING_IDS["onboarding_standup"]],
        "Cross-meeting: the 30-60-90 day plan is decided in hiring_sync and followed up on in onboarding_standup.",
    ),
    EvalQuestion(
        "q14", "What did the team decide about onboarding buddies for new hires?",
        "answerable", [MEETING_IDS["onboarding_standup"]],
    ),
    EvalQuestion(
        "q15", "What was decided about the design system refresh?",
        "answerable", [MEETING_IDS["sprint_planning_w1"], MEETING_IDS["sprint_planning_w2"]],
        "Cross-meeting: postponed in week 1, reaffirmed in week 3.",
    ),
    # Unanswerable -- nothing in the corpus discusses these.
    EvalQuestion("q16", "What did the team decide about the company holiday party?", "unanswerable", []),
    EvalQuestion("q17", "What is the marketing budget for next year's Super Bowl ad?", "unanswerable", []),
    EvalQuestion("q18", "Who won the office ping pong tournament?", "unanswerable", []),
    EvalQuestion("q19", "What did we decide about switching the company's payroll provider?", "unanswerable", []),
    EvalQuestion("q20", "What's the plan for the office relocation to a new building?", "unanswerable", []),
]


def load_transcripts() -> dict[str, str]:
  """meeting_id -> transcript text, for every file in transcripts/."""
  out: dict[str, str] = {}
  for stem, meeting_id in MEETING_IDS.items():
    path = TRANSCRIPTS_DIR / f"{stem}.txt"
    out[meeting_id] = path.read_text(encoding="utf-8")
  return out
