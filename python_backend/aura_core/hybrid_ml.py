"""
Hybrid ML approach: Local models + LLM fallback for low-confidence predictions.

This demonstrates production ML engineering: cost-effective local models
with high-quality LLM fallback for edge cases.

Architecture:
  1. Local TF-IDF classifier (fast, free) - handles 80% of cases
  2. Confidence threshold check (< 65% confidence)
  3. LLM fallback (OpenAI/Anthropic) for low-confidence items
  
Resume highlight: Hybrid ML architecture, cost optimization, fallback strategies
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Sequence, Literal
import json


@dataclass
class HybridResult:
    """Result from hybrid prediction with provenance tracking."""
    prediction: str | int
    confidence: float
    source: Literal["local_ml", "llm_fallback", "llm_only"]
    reasoning: str | None = None
    cost_estimate: float = 0.0  # USD


_PROVIDER_ENV_VARS = {
    "groq": "GROQ_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}


class LLMFallback:
    """Fallback to LLM API for low-confidence predictions, and -- via
    `chat_complete` -- the generic chat call the RAG query engine uses.

    Originally built for classification fallback only; `chat_complete` is
    a newer, general-purpose addition so the same provider plumbing (key
    resolution, per-provider request shaping) backs both use cases instead
    of duplicating it in a second client.
    """

    def __init__(self, api_key: str | None = None, provider: str = "groq"):
        """
        Initialize LLM fallback.

        Args:
            api_key: API key for LLM provider (or use env var)
            provider: "groq" (default -- fastest for interactive chat),
                "openai", or "anthropic"
        """
        self.provider = provider
        self.api_key = api_key or os.getenv(_PROVIDER_ENV_VARS.get(provider, "GROQ_API_KEY"))
        self.enabled = bool(self.api_key)

        if not self.enabled:
            print(f"⚠️  LLM fallback disabled: no {provider.upper()}_API_KEY found")
    
    def extract_tasks_llm(self, sentences: Sequence[str]) -> list[HybridResult]:
        """
        Use LLM to extract tasks from sentences.
        
        Prompt engineering for task extraction with structured output.
        """
        if not self.enabled:
            return []
        
        prompt = f"""Analyze these sentences and identify action items/tasks.
For each task found, extract:
- task: the action description
- assignee: who is responsible (or "Not specified")
- deadline: when it's due (or null)
- priority: "high", "medium", or "low"
- confidence: your confidence 0.0-1.0

Sentences:
{chr(10).join(f"{i+1}. {s}" for i, s in enumerate(sentences))}

Respond with JSON array of tasks. If no tasks, return empty array []."""

        try:
            if self.provider == "openai":
                result = self._call_openai(prompt, max_tokens=500)
            else:
                result = self._call_anthropic(prompt, max_tokens=500)
            
            tasks = json.loads(result)
            return [
                HybridResult(
                    prediction=1,  # Is a task
                    confidence=task.get("confidence", 0.8),
                    source="llm_fallback",
                    reasoning=task.get("task"),
                    cost_estimate=0.001  # Rough estimate per sentence
                )
                for task in tasks
            ]
        except Exception as e:
            print(f"⚠️  LLM fallback failed: {e}")
            return []
    
    def classify_sentence_llm(
        self, 
        sentence: str, 
        task_type: Literal["task", "decision"]
    ) -> HybridResult:
        """
        Use LLM to classify a single sentence.
        
        More accurate but slower/costlier than local ML.
        """
        if not self.enabled:
            return HybridResult(
                prediction=0,
                confidence=0.0,
                source="llm_fallback",
                reasoning="LLM disabled"
            )
        
        if task_type == "task":
            prompt = f"""Is this sentence an action item or task?

Sentence: "{sentence}"

Respond with JSON:
{{
  "is_task": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}}"""
        else:  # decision
            prompt = f"""Classify this decision statement into one category:
- timeline: scheduling, deadlines, timeline changes
- budget: spending, costs, financial decisions
- technical: technology, architecture, tools
- general: strategy, policy, other decisions

Sentence: "{sentence}"

Respond with JSON:
{{
  "category": "timeline|budget|technical|general",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}}"""
        
        try:
            if self.provider == "openai":
                result = self._call_openai(prompt, max_tokens=150)
            else:
                result = self._call_anthropic(prompt, max_tokens=150)
            
            data = json.loads(result)
            
            if task_type == "task":
                return HybridResult(
                    prediction=1 if data.get("is_task") else 0,
                    confidence=data.get("confidence", 0.8),
                    source="llm_fallback",
                    reasoning=data.get("reasoning"),
                    cost_estimate=0.0005
                )
            else:
                return HybridResult(
                    prediction=data.get("category", "general"),
                    confidence=data.get("confidence", 0.8),
                    source="llm_fallback",
                    reasoning=data.get("reasoning"),
                    cost_estimate=0.0005
                )
        except Exception as e:
            print(f"⚠️  LLM classification failed: {e}")
            return HybridResult(
                prediction=0,
                confidence=0.0,
                source="llm_fallback",
                reasoning=f"Error: {str(e)}"
            )
    
    def _call_openai(self, prompt: str, max_tokens: int = 500, *,
                      system: str | None = None, api_key: str | None = None) -> str:
        """Call OpenAI API (requires openai package)."""
        try:
            import openai
            client = openai.OpenAI(api_key=api_key or self.api_key)

            response = client.chat.completions.create(
                model="gpt-4o-mini",  # Cost-effective model
                messages=[
                    {"role": "system", "content": system or "You are a precise meeting analysis assistant. Always respond with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=max_tokens,
                temperature=0.3  # Lower temperature for consistency
            )

            return response.choices[0].message.content.strip()
        except ImportError:
            raise ImportError("OpenAI package not installed. Run: pip install openai")

    def _call_anthropic(self, prompt: str, max_tokens: int = 500, *,
                         system: str | None = None, api_key: str | None = None) -> str:
        """Call Anthropic Claude API (requires anthropic package)."""
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key or self.api_key)

            request_kwargs = {
                "model": "claude-3-haiku-20240307",  # Cost-effective model
                "max_tokens": max_tokens,
                "temperature": 0.3,
                "messages": [{"role": "user", "content": prompt}],
            }
            if system:
                request_kwargs["system"] = system

            response = client.messages.create(**request_kwargs)

            return response.content[0].text.strip()
        except ImportError:
            raise ImportError("Anthropic package not installed. Run: pip install anthropic")

    def _call_groq(self, prompt: str, max_tokens: int = 500, *,
                    system: str | None = None, api_key: str | None = None) -> str:
        """Call Groq's OpenAI-compatible chat API (requires groq package).

        Groq runs open models (Llama 3.1 here) on its own LPU inference
        hardware, which is why it's the primary provider for the
        conversational /query endpoint: interactive chat latency matters
        more there than for the offline extraction fallback above, and
        Groq is consistently the fastest widely-available option for it.
        """
        try:
            from groq import Groq
        except ImportError:
            raise ImportError("Groq package not installed. Run: pip install groq")

        client = Groq(api_key=api_key or self.api_key)
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        response = client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.2,
        )
        return response.choices[0].message.content.strip()

    def chat_complete(self, prompt: str, *, system: str | None = None,
                       max_tokens: int = 700) -> tuple[str, str]:
        """Provider-agnostic chat completion with automatic fallback.

        Tries providers in order -- this instance's configured `provider`
        first, then whichever of groq/openai/anthropic have an API key set
        in the environment -- so a Groq outage or missing key degrades to
        OpenAI or Anthropic instead of failing the request outright.
        Returns (answer_text, provider_used).

        Threads the API key through as an explicit call argument (rather
        than mutating `self.api_key`) so one shared LLMFallback instance
        stays safe to call concurrently, e.g. from multiple FastAPI request
        handlers.
        """
        order = [self.provider] + [p for p in ("groq", "openai", "anthropic") if p != self.provider]
        tried: set[str] = set()
        last_error: Exception | None = None

        for provider in order:
            if provider in tried:
                continue
            tried.add(provider)

            key = self.api_key if provider == self.provider else None
            key = key or os.getenv(_PROVIDER_ENV_VARS[provider])
            if not key:
                continue

            try:
                if provider == "groq":
                    return self._call_groq(prompt, max_tokens=max_tokens, system=system, api_key=key), provider
                if provider == "openai":
                    return self._call_openai(prompt, max_tokens=max_tokens, system=system, api_key=key), provider
                return self._call_anthropic(prompt, max_tokens=max_tokens, system=system, api_key=key), provider
            except Exception as exc:  # noqa: BLE001 - try the next provider
                last_error = exc
                continue

        raise RuntimeError(
            "No LLM provider available for chat_complete. Set GROQ_API_KEY "
            "(preferred), OPENAI_API_KEY, or ANTHROPIC_API_KEY. "
            f"Last error: {last_error}"
        )


class HybridClassifier:
    """
    Hybrid classifier combining local ML with LLM fallback.
    
    Strategy:
      1. Use local classifier first (fast, free)
      2. If confidence < threshold, fallback to LLM (accurate, costly)
      3. Track costs and performance
    """
    
    def __init__(
        self,
        local_classifier,
        llm_fallback: LLMFallback | None = None,
        confidence_threshold: float = 0.65
    ):
        """
        Initialize hybrid classifier.
        
        Args:
            local_classifier: Local ML model (scikit-learn pipeline)
            llm_fallback: Optional LLM fallback client
            confidence_threshold: Below this, use LLM (default 0.65)
        """
        self.local_classifier = local_classifier
        self.llm_fallback = llm_fallback
        self.confidence_threshold = confidence_threshold
        self.stats = {
            "total_predictions": 0,
            "local_ml_used": 0,
            "llm_fallback_used": 0,
            "total_cost_usd": 0.0
        }
    
    def predict_with_fallback(
        self,
        sentences: Sequence[str],
        task_type: Literal["task", "decision"] = "task"
    ) -> list[HybridResult]:
        """
        Predict using hybrid approach: local ML with LLM fallback.
        
        Returns list of HybridResult with provenance and confidence.
        """
        results = []
        
        # Get local predictions
        local_preds = self.local_classifier.predict(sentences)
        local_probas = self.local_classifier.predict_proba(sentences)
        
        for i, sentence in enumerate(sentences):
            pred = local_preds[i]
            proba = local_probas[i]
            
            # Get confidence for predicted class
            if hasattr(self.local_classifier, 'classes_'):
                pred_idx = list(self.local_classifier.classes_).index(pred)
                confidence = float(proba[pred_idx])
            else:
                confidence = float(max(proba))
            
            self.stats["total_predictions"] += 1
            
            # High confidence: use local prediction
            if confidence >= self.confidence_threshold or not self.llm_fallback:
                self.stats["local_ml_used"] += 1
                results.append(HybridResult(
                    prediction=pred,
                    confidence=confidence,
                    source="local_ml",
                    reasoning=None,
                    cost_estimate=0.0
                ))
            else:
                # Low confidence: fallback to LLM
                self.stats["llm_fallback_used"] += 1
                llm_result = self.llm_fallback.classify_sentence_llm(sentence, task_type)
                self.stats["total_cost_usd"] += llm_result.cost_estimate
                results.append(llm_result)
        
        return results
    
    def get_stats(self) -> dict:
        """Get performance statistics for monitoring."""
        if self.stats["total_predictions"] == 0:
            return self.stats
        
        return {
            **self.stats,
            "local_ml_percentage": round(
                self.stats["local_ml_used"] / self.stats["total_predictions"] * 100, 1
            ),
            "llm_fallback_percentage": round(
                self.stats["llm_fallback_used"] / self.stats["total_predictions"] * 100, 1
            ),
            "avg_cost_per_prediction": round(
                self.stats["total_cost_usd"] / self.stats["total_predictions"], 6
            )
        }


# Resume-worthy exports
__all__ = [
    "HybridResult",
    "LLMFallback", 
    "HybridClassifier"
]
