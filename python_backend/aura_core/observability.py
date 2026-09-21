"""Minimal structured logging: no new dependency, but every log line is
`event key=value key=value ...` instead of free-text prose, so it's
greppable and parseable without pulling in a JSON logging library for a
service this size. Never pass API keys, passwords, or full transcripts as
field values -- see the explicit exclusion in each call site.
"""

from __future__ import annotations

import logging
import sys
import uuid

_CONFIGURED = False


def configure_logging(level: int = logging.INFO) -> None:
  global _CONFIGURED
  if _CONFIGURED:
    return
  handler = logging.StreamHandler(sys.stdout)
  handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
  root = logging.getLogger("aura")
  root.setLevel(level)
  root.addHandler(handler)
  root.propagate = False
  _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
  configure_logging()
  return logging.getLogger(f"aura.{name}")


def new_request_id() -> str:
  return uuid.uuid4().hex[:12]


def format_event(event: str, **fields: object) -> str:
  parts = [event]
  for key, value in fields.items():
    parts.append(f"{key}={value!r}")
  return " ".join(parts)
