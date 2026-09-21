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

# Below this cosine similarity, the top match is treated as "not actually
# relevant" and the chat engine refuses to answer rather than grounding a
# response in a weak match. Calibrated against python_backend/eval's
# relevant-vs-irrelevant score distributions -- see EVALUATION.md.
MIN_RELEVANCE_SCORE = _float("AURA_MIN_RELEVANCE_SCORE", 0.30)

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
