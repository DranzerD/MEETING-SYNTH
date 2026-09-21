"""Output helpers for Aura analysis results."""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable


def export_json(payload: Dict[str, Any], output_dir: Path) -> Path:
  output_dir.mkdir(parents=True, exist_ok=True)
  filename = f"aura_output_{datetime.utcnow().isoformat().replace(':', '-')}.json"
  file_path = output_dir / filename
  file_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
  return file_path


def _to_csv(rows: Iterable[Dict[str, Any]], columns: list[str]) -> str:
  buf = io.StringIO()
  writer = csv.DictWriter(buf, fieldnames=columns)
  writer.writeheader()
  for row in rows:
    writer.writerow({col: row.get(col, "") for col in columns})
  return buf.getvalue()


def export_tasks_csv(tasks: list[Dict[str, Any]], output_dir: Path) -> Path:
  csv_text = _to_csv(tasks, ["task", "assignee", "priority", "deadline", "confidence", "sentence"])
  output_dir.mkdir(parents=True, exist_ok=True)
  path = output_dir / "tasks.csv"
  path.write_text(csv_text)
  return path


def export_decisions_csv(decisions: list[Dict[str, Any]], output_dir: Path) -> Path:
  csv_text = _to_csv(decisions, ["decision", "type", "participants", "confidence", "sentence"])
  output_dir.mkdir(parents=True, exist_ok=True)
  path = output_dir / "decisions.csv"
  path.write_text(csv_text)
  return path
