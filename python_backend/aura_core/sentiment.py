"""Sentiment + vibe detection using VADER."""

from __future__ import annotations

from dataclasses import dataclass

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

_ANALYZER = SentimentIntensityAnalyzer()


@dataclass
class SentimentResult:
  label: str
  confidence: float
  emotion: str
  positiveScore: float
  negativeScore: float
  compound: float


EMOTION_RULES = {
    "confidence": ["confident", "certain", "assured"],
    "concern": ["concern", "worried", "anxious"],
    "frustration": ["frustrated", "annoyed", "angry", "mad"],
    "excitement": ["excited", "thrilled", "energized"],
}


def _guess_emotion(text: str) -> str:
  lowered = text.lower()
  for emotion, keywords in EMOTION_RULES.items():
    if any(keyword in lowered for keyword in keywords):
      return emotion
  return "neutral"


def analyze_sentiment(text: str) -> SentimentResult:
  scores = _ANALYZER.polarity_scores(text)
  compound = scores["compound"]
  if compound >= 0.15:
    label = "positive"
  elif compound <= -0.15:
    label = "negative"
  else:
    label = "neutral"
  confidence = min(0.95, abs(compound))
  return SentimentResult(
      label=label,
      confidence=round(confidence, 2),
      emotion=_guess_emotion(text),
      positiveScore=scores["pos"],
      negativeScore=scores["neg"],
      compound=compound,
  )
