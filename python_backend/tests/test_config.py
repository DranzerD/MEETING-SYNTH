import importlib


def _reload_config(monkeypatch, **env):
  import aura_core.config as config_module
  for key, value in env.items():
    if value is None:
      monkeypatch.delenv(key, raising=False)
    else:
      monkeypatch.setenv(key, value)
  return importlib.reload(config_module)


def test_int_env_override(monkeypatch):
  config = _reload_config(monkeypatch, AURA_CHUNK_SIZE_WORDS="42")
  assert config.CHUNK_SIZE_WORDS == 42


def test_int_env_falls_back_to_default_on_garbage(monkeypatch):
  config = _reload_config(monkeypatch, AURA_CHUNK_SIZE_WORDS="not-a-number")
  assert config.CHUNK_SIZE_WORDS == 180


def test_float_env_override(monkeypatch):
  config = _reload_config(monkeypatch, AURA_MIN_RELEVANCE_SCORE="0.5")
  assert config.MIN_RELEVANCE_SCORE == 0.5


def test_bool_env_override_true_variants(monkeypatch):
  for value in ("1", "true", "True", "yes", "on"):
    config = _reload_config(monkeypatch, AURA_ENABLE_RERANKING=value)
    assert config.RERANK_ENABLED is True, f"expected True for {value!r}"


def test_bool_env_override_false_variants(monkeypatch):
  for value in ("0", "false", "no", "off"):
    config = _reload_config(monkeypatch, AURA_ENABLE_RERANKING=value)
    assert config.RERANK_ENABLED is False, f"expected False for {value!r}"


def test_bool_env_default_when_unset(monkeypatch):
  config = _reload_config(monkeypatch, AURA_ENABLE_RERANKING=None)
  assert config.RERANK_ENABLED is True
