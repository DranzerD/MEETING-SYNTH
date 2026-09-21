"""Retrieval quality evaluation for the RAG layer.

Builds a throwaway Chroma collection from rag_eval/transcripts/, indexes
it for real (real embeddings, real ANN search, real optional reranking),
then runs every question in rag_eval/dataset.py through aura_core.retrieval
and scores the results against the hand-labeled relevant_meeting_ids.

Metrics (computed over the "answerable" questions, meeting-level
relevance -- see dataset.py's docstring for why):
  - Recall@K:    fraction of questions with >=1 relevant meeting in top-K
  - Precision@K: mean fraction of the top-K results that are relevant
  - MRR:         mean reciprocal rank of the first relevant result
  - Hit Rate@K:  fraction of questions with >=1 relevant meeting in top-K
                 (identical to Recall@K under single-relevant-set-per-query
                 labeling used here; reported separately anyway since the
                 assignment prompt asks for it by name, and the two only
                 diverge under multi-grade relevance judgments, which this
                 dataset doesn't have)

For the "unanswerable" questions, reports the refusal rate: how often the
top result's cosine similarity falls below MIN_RELEVANCE_SCORE (the
threshold query_engine.py uses to refuse to answer) -- this is also how
MIN_RELEVANCE_SCORE was picked in the first place: run this script, look
at where relevant and irrelevant top-scores separate, pick a threshold in
the gap.

Runs retrieval twice per question (reranking on and off) so the report
shows reranking's actual effect on these metrics, not just its latency
cost (see benchmark_retrieval.py for the latency side).

Usage:
    python -m rag_eval.run_retrieval_eval --top-k 3 5 --output results/retrieval_eval.json
"""

from __future__ import annotations

import argparse
import json
import shutil
import statistics
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aura_core.chunking import chunk_transcript
from aura_core.config import MIN_RELEVANCE_SCORE
from aura_core.embeddings import embed_texts
from aura_core.retrieval import retrieve
from aura_core.vectorstore import ChunkVectorStore
from rag_eval.dataset import QUESTIONS, load_transcripts


def build_index(store: ChunkVectorStore) -> int:
  total = 0
  for meeting_id, transcript in load_transcripts().items():
    chunks = chunk_transcript(transcript, meeting_id)
    embeddings = embed_texts([c.text for c in chunks])
    store.add_chunks(chunks, embeddings)
    total += len(chunks)
  return total


def _reciprocal_rank(matches, relevant_ids: set[str]) -> float:
  for rank, m in enumerate(matches, start=1):
    if m.meeting_id in relevant_ids:
      return 1.0 / rank
  return 0.0


def evaluate(store: ChunkVectorStore, top_k_values: list[int], rerank: bool) -> dict:
  answerable = [q for q in QUESTIONS if q.category == "answerable"]
  unanswerable = [q for q in QUESTIONS if q.category == "unanswerable"]

  per_k: dict[int, dict] = {}
  per_question_detail: list[dict] = []

  for k in top_k_values:
    recalls, precisions, rr_values, hits = [], [], [], []
    for q in answerable:
      result = retrieve(q.question, top_k=k, store=store, rerank=rerank)
      relevant_ids = set(q.relevant_meeting_ids)
      retrieved_meeting_ids = [m.meeting_id for m in result.matches]

      hit = any(mid in relevant_ids for mid in retrieved_meeting_ids)
      recalls.append(1.0 if hit else 0.0)
      hits.append(1.0 if hit else 0.0)
      relevant_in_topk = sum(1 for mid in retrieved_meeting_ids if mid in relevant_ids)
      precisions.append(relevant_in_topk / k if k else 0.0)
      rr_values.append(_reciprocal_rank(result.matches, relevant_ids))

      if k == top_k_values[0]:
        per_question_detail.append({
            "qid": q.qid,
            "question": q.question,
            "expected_meetings": sorted(relevant_ids),
            "retrieved_meetings": retrieved_meeting_ids,
            "top_score": result.matches[0].score if result.matches else None,
            "hit": hit,
        })

    per_k[k] = {
        "recall_at_k": round(statistics.mean(recalls), 3) if recalls else 0.0,
        "precision_at_k": round(statistics.mean(precisions), 3) if precisions else 0.0,
        "hit_rate_at_k": round(statistics.mean(hits), 3) if hits else 0.0,
        "mrr": round(statistics.mean(rr_values), 3) if rr_values else 0.0,
        "num_questions": len(answerable),
    }

  # Unanswerable-question refusal analysis, always at k=5 (retrieval's
  # default top_k) regardless of which --top-k values were requested.
  relevant_top_scores: list[float] = []
  irrelevant_top_scores: list[float] = []
  refusals = 0
  for q in answerable:
    result = retrieve(q.question, top_k=5, store=store, rerank=rerank)
    if result.matches:
      relevant_top_scores.append(result.matches[0].score)
  for q in unanswerable:
    result = retrieve(q.question, top_k=5, store=store, rerank=rerank)
    top_score = result.matches[0].score if result.matches else -1.0
    irrelevant_top_scores.append(top_score)
    if top_score < MIN_RELEVANCE_SCORE:
      refusals += 1

  return {
      "reranked": rerank,
      "retrieval_quality_by_k": per_k,
      "refusal_gate": {
          "min_relevance_score_threshold": MIN_RELEVANCE_SCORE,
          "unanswerable_questions": len(unanswerable),
          "correctly_refused": refusals,
          "refusal_rate": round(refusals / len(unanswerable), 3) if unanswerable else None,
          "answerable_top_score_mean": round(statistics.mean(relevant_top_scores), 4) if relevant_top_scores else None,
          "answerable_top_score_min": round(min(relevant_top_scores), 4) if relevant_top_scores else None,
          "unanswerable_top_score_mean": round(statistics.mean(irrelevant_top_scores), 4) if irrelevant_top_scores else None,
          "unanswerable_top_score_max": round(max(irrelevant_top_scores), 4) if irrelevant_top_scores else None,
      },
      "per_question_detail_at_k0": per_question_detail,
  }


def main() -> None:
  parser = argparse.ArgumentParser(description="Evaluate RAG retrieval quality")
  parser.add_argument("--top-k", type=int, nargs="+", default=[3, 5])
  parser.add_argument("--output", type=Path, default=Path("results/retrieval_eval.json"))
  args = parser.parse_args()

  persist_dir = Path(tempfile.mkdtemp(prefix="aura_rag_eval_"))
  try:
    store = ChunkVectorStore(persist_dir=persist_dir)
    print(f"Indexing {len(load_transcripts())} eval transcripts...")
    chunk_count = build_index(store)
    print(f"Indexed {chunk_count} chunks total.\n")

    report = {
        "corpus_meetings": len(load_transcripts()),
        "corpus_chunks": chunk_count,
        "num_answerable_questions": sum(1 for q in QUESTIONS if q.category == "answerable"),
        "num_unanswerable_questions": sum(1 for q in QUESTIONS if q.category == "unanswerable"),
        "with_reranking": evaluate(store, args.top_k, rerank=True),
        "without_reranking": evaluate(store, args.top_k, rerank=False),
        "benchmark_timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    for label, key in (("WITH reranking", "with_reranking"), ("WITHOUT reranking", "without_reranking")):
      print(f"=== {label} ===")
      for k, metrics in report[key]["retrieval_quality_by_k"].items():
        print(f"  k={k}: Recall@K={metrics['recall_at_k']:.3f}  Precision@K={metrics['precision_at_k']:.3f}  "
              f"HitRate@K={metrics['hit_rate_at_k']:.3f}  MRR={metrics['mrr']:.3f}")
      gate = report[key]["refusal_gate"]
      print(f"  Refusal gate: {gate['correctly_refused']}/{gate['unanswerable_questions']} unanswerable "
            f"questions correctly refused (threshold={gate['min_relevance_score_threshold']})")
      print(f"  Top-score separation: answerable mean={gate['answerable_top_score_mean']} "
            f"(min={gate['answerable_top_score_min']})  vs  unanswerable mean={gate['unanswerable_top_score_mean']} "
            f"(max={gate['unanswerable_top_score_max']})")
      print()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2))
    print(f"Full report saved to: {args.output}")
  finally:
    shutil.rmtree(persist_dir, ignore_errors=True)


if __name__ == "__main__":
  main()
