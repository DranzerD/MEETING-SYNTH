"""Extractive summarization using a lightweight TextRank implementation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


@dataclass
class Summary:
  sentences: list[str]
  summary_text: str


def build_summary(sentences: Iterable[str], max_sentences: int = 5) -> Summary:
  sentences = [s.strip() for s in sentences if s.strip()]
  if not sentences:
    return Summary(sentences=[], summary_text="")

  vectorizer = TfidfVectorizer(min_df=1, ngram_range=(1, 2))
  matrix = vectorizer.fit_transform(sentences)
  similarity = cosine_similarity(matrix)

  # TextRank via power iteration on the similarity graph
  scores = np.ones(len(sentences)) / len(sentences)
  damping = 0.85
  for _ in range(40):
    scores = (1 - damping) + damping * similarity.dot(scores)
    scores = scores / scores.sum()

  ranked_indices = np.argsort(scores)[::-1][:max_sentences]
  ranked_sentences = [sentences[idx] for idx in sorted(ranked_indices)]
  return Summary(sentences=ranked_sentences,
                 summary_text=" ".join(ranked_sentences))
