"""Sentence embedding generation for Aura's retrieval layer.

Uses a small, free, locally-run sentence-transformers model
(all-MiniLM-L6-v2 by default) so embedding a transcript costs nothing,
never leaves the machine, and needs no embedding-provider API key -- only
the conversational answer at query time calls out to an LLM.
"""

from __future__ import annotations

import os
import threading
from typing import Sequence

DEFAULT_MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384  # fixed output size of all-MiniLM-L6-v2

_model = None
_model_lock = threading.Lock()


def _get_model():
  """Lazily load (and cache) the sentence-transformers model. Loading is
  deferred to first use so importing this module -- e.g. from the FastAPI
  app at startup -- doesn't pay the model-load cost before it's needed."""
  global _model
  if _model is not None:
    return _model
  with _model_lock:
    if _model is None:
      from sentence_transformers import SentenceTransformer
      model_name = os.getenv("AURA_EMBEDDING_MODEL", DEFAULT_MODEL_NAME)
      _model = SentenceTransformer(model_name)
  return _model


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
  """Embed a batch of chunk texts. Returns one L2-normalized vector per
  text, so cosine similarity reduces to a dot product (what Chroma's
  "cosine" space uses under the hood)."""
  if not texts:
    return []
  model = _get_model()
  vectors = model.encode(list(texts), normalize_embeddings=True, show_progress_bar=False)
  return vectors.tolist()


def embed_query(text: str) -> list[float]:
  return embed_texts([text])[0]
