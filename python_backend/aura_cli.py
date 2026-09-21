"""Command-line interface for Aura Core."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from aura_core import AuraPipeline
from aura_core.exporters import export_decisions_csv, export_json, export_tasks_csv


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Aura meeting intelligence CLI")
  parser.add_argument("transcript", type=Path, help="Path to .txt transcript")
  parser.add_argument("--thread", type=str, default=None, help="Thread key to link related meetings")
  parser.add_argument("--meeting-id", type=str, default=None, help="Optional meeting identifier")
  parser.add_argument("--output", type=Path, default=Path("output"), help="Directory for exports")
  parser.add_argument("--pretty", action="store_true", help="Print pretty JSON to stdout")
  return parser.parse_args()


def main() -> None:
  args = parse_args()
  transcript_text = args.transcript.read_text(encoding="utf-8")
  pipeline = AuraPipeline()
  result = pipeline.analyze(transcript_text, meeting_id=args.meeting_id, thread_key=args.thread)

  output_dir = args.output
  payload = {
      "stats": result.stats,
      "summary": result.summary,
      "tasks": result.tasks,
      "decisions": result.decisions,
      "sentiment": result.sentiment,
      "thread": result.thread,
  }
  export_json(payload, output_dir)
  export_tasks_csv(result.tasks, output_dir)
  export_decisions_csv(result.decisions, output_dir)

  if args.pretty:
    print(json.dumps(payload, indent=2, ensure_ascii=False))
  else:
    print(f"Saved outputs to {output_dir.resolve()}")


if __name__ == "__main__":
  main()
