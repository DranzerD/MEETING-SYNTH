from aura_core.hybrid_ml import LLMFallback


def test_llm_fallback_disabled_with_no_api_key():
  fallback = LLMFallback(provider="groq")
  assert fallback.enabled is False


def test_llm_fallback_enabled_with_explicit_api_key():
  fallback = LLMFallback(api_key="fake-key-for-test", provider="groq")
  assert fallback.enabled is True


def test_chat_complete_raises_clear_error_when_no_provider_available(monkeypatch):
  for var in ("GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
    monkeypatch.delenv(var, raising=False)

  fallback = LLMFallback()
  try:
    fallback.chat_complete("hello")
    assert False, "expected RuntimeError"
  except RuntimeError as exc:
    message = str(exc)
    assert "GROQ_API_KEY" in message
    assert "OPENAI_API_KEY" in message
    assert "ANTHROPIC_API_KEY" in message


def test_chat_complete_falls_back_to_second_provider_on_first_failure(monkeypatch):
  monkeypatch.setenv("OPENAI_API_KEY", "fake-openai-key")
  monkeypatch.delenv("GROQ_API_KEY", raising=False)
  monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

  fallback = LLMFallback(provider="groq")  # preferred provider has no key

  def fake_call_openai(self, prompt, max_tokens=500, *, system=None, api_key=None):
    return "answer from openai"

  monkeypatch.setattr(LLMFallback, "_call_openai", fake_call_openai)

  text, provider = fallback.chat_complete("question")
  assert text == "answer from openai"
  assert provider == "openai"


def test_chat_complete_tries_next_provider_after_an_exception(monkeypatch):
  monkeypatch.setenv("GROQ_API_KEY", "fake-groq-key")
  monkeypatch.setenv("OPENAI_API_KEY", "fake-openai-key")
  monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

  def broken_groq(self, prompt, max_tokens=500, *, system=None, api_key=None):
    raise RuntimeError("groq is down")

  def working_openai(self, prompt, max_tokens=500, *, system=None, api_key=None):
    return "openai saved the day"

  monkeypatch.setattr(LLMFallback, "_call_groq", broken_groq)
  monkeypatch.setattr(LLMFallback, "_call_openai", working_openai)

  fallback = LLMFallback(provider="groq")
  text, provider = fallback.chat_complete("question")
  assert text == "openai saved the day"
  assert provider == "openai"


def test_extract_tasks_llm_returns_empty_list_when_disabled():
  fallback = LLMFallback()  # no key -> disabled
  assert fallback.extract_tasks_llm(["Some sentence."]) == []


def test_classify_sentence_llm_returns_zero_confidence_when_disabled():
  fallback = LLMFallback()
  result = fallback.classify_sentence_llm("Some sentence.", "task")
  assert result.confidence == 0.0
  assert result.source == "llm_fallback"
