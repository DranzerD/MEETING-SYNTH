"""Optional LLM pass over transcript text for higher-quality action-item
and decision extraction, layered on top of -- not replacing -- the fast
local TF-IDF/LogisticRegression classifiers in `tasks.py` / `decisions.py`.

Off by default: `AuraPipeline.analyze` only calls this when the caller
opts in (`use_llm=True`), and `pipeline.py` falls back to the local ML
results if no LLM provider is configured or the call errors -- the same
graceful-degradation philosophy the Next.js layer already applies to the
Python service itself.
"""

from __future__ import annotations

import json
from typing import Any

from .hybrid_ml import LLMFallback

_EXTRACTION_SYSTEM_PROMPT = (
    "You extract action items and decisions from meeting transcripts. "
    "Respond with strict JSON only, matching the schema in the prompt -- "
    "no prose, no markdown code fences."
)

_EXTRACTION_PROMPT_TEMPLATE = """Transcript:
{transcript}

Return a JSON object with two arrays, "tasks" and "decisions".

Each task: {{"sentence": <verbatim source sentence>, "task": <action, restated concisely>, "assignee": <name or "Not specified">, "deadline": <string or null>, "priority": "high"|"medium"|"low", "confidence": <0.0-1.0>}}

Each decision: {{"sentence": <verbatim source sentence>, "decision": <restated concisely>, "type": "timeline"|"budget"|"technical"|"general", "participants": [<names>], "confidence": <0.0-1.0>}}

If none found, return an empty array for that field. JSON only, no other text:"""

# Keeps the prompt (and cost) bounded for very long transcripts; retrieval
# already handles "search across a huge corpus" -- this pass is meant to
# run over one meeting's transcript at a time.
_MAX_TRANSCRIPT_CHARS = 12000


def extract_tasks_and_decisions_llm(
    transcript: str, llm: LLMFallback | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
  """Run one LLM pass over the transcript and return (tasks, decisions) in
  the exact shape `AuraPipeline.analyze` already returns from the local
  classifiers, so the frontend needs no changes to consume either."""
  llm = llm or LLMFallback()
  prompt = _EXTRACTION_PROMPT_TEMPLATE.format(transcript=transcript[:_MAX_TRANSCRIPT_CHARS])
  raw, _provider = llm.chat_complete(prompt, system=_EXTRACTION_SYSTEM_PROMPT, max_tokens=1200)

  payload = _parse_json_object(raw)
  if not payload:
    return [], []

  return payload.get("tasks", []) or [], payload.get("decisions", []) or []


def _parse_json_object(raw: str) -> dict[str, Any] | None:
  text = raw.strip()
  if text.startswith("```"):
    text = text.strip("`")
    if text.lower().startswith("json"):
      text = text[4:]

  start, end = text.find("{"), text.rfind("}")
  if start == -1 or end == -1 or end < start:
    return None

  try:
    return json.loads(text[start:end + 1])
  except json.JSONDecodeError:
    return None
