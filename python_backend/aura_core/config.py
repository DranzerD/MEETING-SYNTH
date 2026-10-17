"""Central, environment-driven configuration for the RAG layer.

Every tunable here can be overridden by an environment variable so
chunking, retrieval, reranking, and the relevance gate can be adjusted per
deployment without code changes -- and so the eval/benchmark scripts can
record which configuration produced a given number.
"""

from __future__ import annotations

import os
from pathlib import Path

_PACKAGE_ROOT = Path(__file__).resolve().parents[1]  # python_backend/


def _int(name: str, default: int) -> int:
  try:
    return int(os.environ[name])
  except (KeyError, ValueError):
    return default


def _float(name: str, default: float) -> float:
  try:
    return float(os.environ[name])
  except (KeyError, ValueError):
    return default


def _bool(name: str, default: bool) -> bool:
  value = os.getenv(name)
  if value is None:
    return default
  return value.strip().lower() in {"1", "true", "yes", "on"}


# --- Chunking ---
CHUNK_SIZE_WORDS = _int("AURA_CHUNK_SIZE_WORDS", 180)
CHUNK_OVERLAP_SENTENCES = _int("AURA_CHUNK_OVERLAP_SENTENCES", 2)

# --- Embeddings ---
EMBEDDING_MODEL = os.getenv("AURA_EMBEDDING_MODEL", "all-MiniLM-L6-v2")

# --- Retrieval ---
DEFAULT_TOP_K = _int("AURA_TOP_K", 5)

# Relevance gate. The chat engine refuses to answer rather than grounding a
# response in a weak match. Two thresholds, because the two scores differ in
# how well they separate answerable from unanswerable questions:
#
#  - MIN_RERANK_SCORE: used when the cross-encoder reranked the candidates
#    (the default). Its scores separate the classes cleanly: on the eval set
#    plus extra sample-meeting questions, unanswerable questions topped out
#    at -8.1 while answerable ones were almost all above -1.9 (one vague
#    outlier at -7.9). -5.0 sits in that gap.
#  - MIN_RELEVANCE_SCORE: bi-encoder cosine, used only when reranking is
#    off/unavailable. It separates poorly -- a specific question against a
#    ~180-word chunk often scores 0.1-0.3 even when the chunk answers it --
#    so it is the fallback, not the primary signal.
#
# Re-derive with rag_eval/run_retrieval_eval.py (reports false refusals).
MIN_RELEVANCE_SCORE = _float("AURA_MIN_RELEVANCE_SCORE", 0.30)
MIN_RERANK_SCORE = _float("AURA_MIN_RERANK_SCORE", -5.0)

# --- Reranking ---
RERANK_ENABLED = _bool("AURA_ENABLE_RERANKING", True)
RERANK_MODEL = os.getenv("AURA_RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
# How many bi-encoder ANN candidates to pull before reranking down to top_k.
RERANK_CANDIDATES = _int("AURA_RERANK_CANDIDATES", 20)

# --- Storage locations ---
# Overridable so tests/Docker/multiple local checkouts don't have to share
# one on-disk Chroma collection and cache directory.
CHROMA_DIR = Path(os.getenv("AURA_CHROMA_DIR", str(_PACKAGE_ROOT / "chroma_db")))
CACHE_DIR = Path(os.getenv("AURA_CACHE_DIR", str(_PACKAGE_ROOT / "cache")))
