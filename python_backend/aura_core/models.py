"""Lightweight scikit-learn pipelines for Aura."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, Sequence

import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer

from .bootstrap_data import DECISION_EXAMPLES, TASK_EXAMPLES

ModelLabel = str | int


class TextClassifier:
  """Wrapper around a TF-IDF + LogisticRegression pipeline."""

  def __init__(self, model_path: Path, classes: Sequence[ModelLabel]):
    self.model_path = model_path
    self.classes = classes
    self.pipeline: Pipeline | None = None

  def load_or_train(self, data: Iterable[tuple[str, ModelLabel]]) -> None:
    if self.model_path.exists():
      self.pipeline = joblib.load(self.model_path)
      return

    texts, labels = zip(*data)
    self.pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
        ("clf", LogisticRegression(max_iter=1000)),
    ])
    self.pipeline.fit(texts, labels)
    joblib.dump(self.pipeline, self.model_path)

  def predict_proba(self, sentences: Sequence[str]):
    if not self.pipeline:
      raise RuntimeError("Model not initialized")
    if hasattr(self.pipeline[-1], "predict_proba"):
      return self.pipeline.predict_proba(sentences)
    raise RuntimeError("Classifier does not support predict_proba")

  def predict(self, sentences: Sequence[str]):
    if not self.pipeline:
      raise RuntimeError("Model not initialized")
    return self.pipeline.predict(sentences)


class ModelRegistry:
  def __init__(self, base_dir: Path):
    self.base_dir = base_dir
    self.base_dir.mkdir(parents=True, exist_ok=True)
    self.task_classifier = TextClassifier(
        base_dir / "task_classifier.joblib", classes=(0, 1))
    self.decision_classifier = TextClassifier(
        base_dir / "decision_classifier.joblib",
        classes=tuple(sorted({label for _, label in DECISION_EXAMPLES})),
    )

  def ensure_models(self) -> None:
    self.task_classifier.load_or_train(TASK_EXAMPLES)
    self.decision_classifier.load_or_train(DECISION_EXAMPLES)
