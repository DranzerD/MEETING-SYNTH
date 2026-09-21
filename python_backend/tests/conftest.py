"""Shared pytest fixtures.

Most tests use a deterministic, hash-based fake embedder instead of the
real sentence-transformers model: it's not semantically meaningful, but
it's fast, needs no network/model download, and is exactly as good as the
real model for testing everything that ISN'T about embedding quality --
chunking, Chroma storage/filtering, the indexing ledger, the relevance
gate's control flow, citation building. Tests that care about actual
semantic retrieval quality live in rag_eval/ and intentionally use the
real model instead.
"""

from __future__ import annotations

import hashlib
import math
import os
import random
import tempfile

# Must run before ANY aura_core submodule is imported anywhere in the test
# session: aura_core.config reads these env vars at import time to build
# the default Chroma/cache paths, and api_server.py instantiates
# module-level singletons (ChunkVectorStore(), IndexLedger(), a real
# AuraPipeline()) using those defaults. Without this, importing
# api_server in tests would read/write the real project's
# python_backend/chroma_db and python_backend/cache on disk.
_TEST_DATA_ROOT = tempfile.mkdtemp(prefix="aura_test_session_")
os.environ.setdefault("AURA_CHROMA_DIR", os.path.join(_TEST_DATA_ROOT, "chroma_db"))
os.environ.setdefault("AURA_CACHE_DIR", os.path.join(_TEST_DATA_ROOT, "cache"))

import pytest  # noqa: E402

from aura_core.embeddings import EMBEDDING_DIM  # noqa: E402


def _fake_vector(text: str) -> list[float]:
  """A deterministic, L2-normalized pseudo-embedding: same text always
  maps to the same vector, different text maps to a (pseudo-)independent
  random one, with no real semantic meaning -- good enough for testing
  storage/filtering/ranking plumbing without a model.

  Uses the text's hash only to *seed* a PRNG that then draws all
  EMBEDDING_DIM (384) components -- not, as an earlier version of this
  fixture did, by tiling a 32-byte SHA-256 digest to fill 384 dimensions.
  Tiling repeats the same 32 values 12 times, which collapses the
  effective dimensionality back down to 32 and inflates the variance of
  cosine similarity between two "random" fake vectors by roughly
  sqrt(384/32) ~= 3.5x (std ~= 1/sqrt(32) instead of 1/sqrt(384)) -- large
  enough that two unrelated texts would occasionally, by pure chance,
  score above query_engine's relevance threshold and make
  threshold-dependent tests flaky. A properly high-dimensional random
  vector keeps that chance astronomically small instead.
  """
  seed = int.from_bytes(hashlib.sha256(text.encode("utf-8")).digest()[:8], "big")
  rng = random.Random(seed)
  raw = [rng.gauss(0.0, 1.0) for _ in range(EMBEDDING_DIM)]
  norm = math.sqrt(sum(v * v for v in raw)) or 1.0
  return [v / norm for v in raw]


@pytest.fixture
def fake_embeddings(monkeypatch):
  """Patches embed_texts/embed_query everywhere they've already been
  imported (chunking/indexing/retrieval/benchmark modules import the
  function directly, so we patch each call site's reference)."""
  def fake_embed_texts(texts):
    return [_fake_vector(t) for t in texts]

  def fake_embed_query(text):
    return _fake_vector(text)

  import aura_core.embeddings as embeddings_module
  monkeypatch.setattr(embeddings_module, "embed_texts", fake_embed_texts)
  monkeypatch.setattr(embeddings_module, "embed_query", fake_embed_query)

  for module_name in ("aura_core.indexing", "aura_core.retrieval", "aura_core.vectorstore"):
    try:
      module = __import__(module_name, fromlist=["*"])
    except ImportError:
      continue
    if hasattr(module, "embed_texts"):
      monkeypatch.setattr(module, "embed_texts", fake_embed_texts)
    if hasattr(module, "embed_query"):
      monkeypatch.setattr(module, "embed_query", fake_embed_query)

  return fake_embed_texts, fake_embed_query


@pytest.fixture
def temp_vectorstore(tmp_path):
  from aura_core.vectorstore import ChunkVectorStore
  return ChunkVectorStore(persist_dir=tmp_path / "chroma_db")


@pytest.fixture
def temp_ledger(tmp_path):
  from aura_core.indexing import IndexLedger
  return IndexLedger(storage_path=tmp_path / "index_status.json")


@pytest.fixture(autouse=True)
def _no_llm_env(monkeypatch):
  """Every test starts with no LLM provider keys set, so `LLMFallback`
  defaults to disabled unless a test explicitly sets one -- keeps tests
  from accidentally depending on (or leaking) real credentials."""
  for var in ("GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
    monkeypatch.delenv(var, raising=False)
