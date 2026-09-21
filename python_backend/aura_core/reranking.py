"""Cross-encoder reranking over a small candidate pool.

Bi-encoder ANN search (`vectorstore.query`) embeds the query and each chunk
*independently*, so it's fast enough to run over an entire corpus but can
rank a topically-similar-but-not-actually-responsive chunk above a less
similar-but-correct one -- it never lets the query and the document
attend to each other. A cross-encoder scores each (query, document) pair
jointly, which is more accurate but can't be precomputed or indexed, so it
only runs over the top-N candidates the bi-encoder already narrowed down,
not the whole collection.
"""

from __future__ import annotations

import threading
from typing import Sequence

from .config import RERANK_MODEL

_model = None
_model_lock = threading.Lock()
_load_failed = False


def _get_model():
  """Lazily load (and cache) the cross-encoder. If it can't be loaded (no
  network on first run, unsupported platform, etc.) we remember that and
  stop retrying for the life of the process, rather than eating the load
  cost on every query."""
  global _model, _load_failed
  if _model is not None or _load_failed:
    return _model
  with _model_lock:
    if _model is None and not _load_failed:
      try:
        from sentence_transformers import CrossEncoder
        _model = CrossEncoder(RERANK_MODEL)
      except Exception:
        _load_failed = True
  return _model


def is_available() -> bool:
  return _get_model() is not None


def rerank_scores(query: str, documents: Sequence[str]) -> list[float] | None:
  """Scores each document against the query (higher = more relevant).

  Returns None -- not a list of zeros -- if the reranker model isn't
  available, so callers can distinguish "couldn't rerank" from "reranked,
  and these all scored low" and fall back to the original ANN order
  instead of misreading a missing score as a bad one.
  """
  if not documents:
    return []
  model = _get_model()
  if model is None:
    return None
  pairs = [[query, doc] for doc in documents]
  scores = model.predict(pairs)
  return [float(s) for s in scores]
