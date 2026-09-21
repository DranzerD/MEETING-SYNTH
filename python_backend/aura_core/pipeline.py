"""Core orchestrator tying together the ML components."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable

from .models import ModelRegistry
from .preprocessing import Document
from .sentiment import analyze_sentiment
from .summarizer import build_summary
from .tasks import extract_tasks
from .decisions import extract_decisions
from .memory import ThreadMemory, ThreadEntry


@dataclass
class AnalysisResult:
  stats: Dict[str, Any]
  summary: Dict[str, Any]
  tasks: list[Dict[str, Any]]
  decisions: list[Dict[str, Any]]
  sentiment: Dict[str, Any]
  thread: Dict[str, Any] | None


class AuraPipeline:
  def __init__(self, base_dir: Path | None = None):
    self.base_dir = Path(base_dir or Path(__file__).resolve().parents[1])
    self.model_registry = ModelRegistry(self.base_dir / "models")
    self.memory = ThreadMemory(self.base_dir / "cache" / "threads.json")

  def analyze(self, transcript: str, *, meeting_id: str | None = None,
              thread_key: str | None = None, use_llm: bool = False) -> AnalysisResult:
    document = Document.from_text(transcript)
    tasks = [asdict(task) for task in extract_tasks(document.sentences, self.model_registry)]
    decisions = [asdict(decision) for decision in extract_decisions(document.sentences, self.model_registry)]

    # Optional, opt-in LLM extraction pass (see aura_core/llm_extraction.py).
    # Defaults to False so /analyze's existing behavior is unchanged unless
    # a caller explicitly asks for it; any failure (no API key, provider
    # error, bad JSON) falls back to the local ML results computed above
    # rather than breaking the request.
    extraction_source = "local_ml"
    if use_llm:
      try:
        from .llm_extraction import extract_tasks_and_decisions_llm
        llm_tasks, llm_decisions = extract_tasks_and_decisions_llm(transcript)
        if llm_tasks or llm_decisions:
          tasks, decisions = llm_tasks, llm_decisions
          extraction_source = "llm"
      except Exception:
        pass

    summary = build_summary(document.sentences)
    sentiment = analyze_sentiment(document.cleaned)

    stats = {
      "wordCount": len(document.cleaned.split()),
      "sentenceCount": len(document.sentences),
      "taskCount": len(tasks),
      "decisionCount": len(decisions),
      "generatedAt": datetime.utcnow().isoformat() + "Z",
      "extractionSource": extraction_source,
    }

    thread_payload = None
    if thread_key:
      entry = ThreadEntry(
          meeting_id=meeting_id or stats["generatedAt"],
          timestamp=stats["generatedAt"],
          summary=summary.summary_text,
          sentiment=sentiment.label,
          tasks_open=len(tasks),
          decisions_made=len(decisions),
      )
      history = self.memory.append(thread_key, entry)
      thread_payload = {"key": thread_key, "history": history}

    return AnalysisResult(
      stats=stats,
      summary={"sentences": summary.sentences, "summaryText": summary.summary_text},
        tasks=tasks,
        decisions=decisions,
        sentiment=asdict(sentiment),
        thread=thread_payload,
    )

  def history(self, thread_key: str) -> Dict[str, Any]:
    return self.memory.summarize_chain(thread_key)
