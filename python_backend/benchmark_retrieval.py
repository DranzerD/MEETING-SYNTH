"""
Retrieval latency benchmark for Aura's RAG layer.

Indexes the bundled sample transcripts (repeated under synthetic meeting
IDs to build up a corpus of a realistic size) into a throwaway Chroma
collection, then runs a batch of queries and reports p50/p95/mean
end-to-end retrieval latency, broken down by stage (query embedding,
Chroma ANN search, and cross-encoder reranking if enabled) -- a measured
number, not a guess.

Usage:
    python benchmark_retrieval.py --corpus-size 50 --queries 30 \
        --output results/retrieval_benchmark.json

    # Compare with/without reranking:
    python benchmark_retrieval.py --no-rerank --output results/retrieval_benchmark_norerank.json

Requires network access on first run (to download the sentence-transformers
and cross-encoder models from huggingface.co, cached after that) and the
RAG dependencies installed (`pip install -r requirements.txt`).
"""

from __future__ import annotations

import argparse
import json
import shutil
import statistics
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from aura_core.chunking import chunk_transcript
from aura_core.embeddings import embed_texts
from aura_core.retrieval import retrieve
from aura_core.vectorstore import ChunkVectorStore

SAMPLE_QUERIES = [
    "What did the team decide about the budget?",
    "Who is responsible for the onboarding deck?",
    "What is the revised launch timeline?",
    "Were there any vendor negotiations?",
    "What did QA agree to do?",
    "Summarize the action items from the meeting.",
    "Was anything escalated as urgent?",
    "What happens with marketing spend?",
]


def build_corpus(store: ChunkVectorStore, corpus_size: int) -> int:
    examples_dir = Path(__file__).parent / "examples"
    transcripts = [p.read_text(encoding="utf-8") for p in sorted(examples_dir.glob("*.txt"))]
    if not transcripts:
        raise SystemExit("No sample transcripts found under python_backend/examples/")

    total_chunks = 0
    meeting_index = 0
    while total_chunks < corpus_size:
        for transcript in transcripts:
            meeting_id = f"benchmark-meeting-{meeting_index}"
            chunks = chunk_transcript(transcript, meeting_id)
            embeddings = embed_texts([c.text for c in chunks])
            store.add_chunks(chunks, embeddings)
            total_chunks += len(chunks)
            meeting_index += 1
            if total_chunks >= corpus_size:
                break
    return total_chunks


def _percentile(sorted_values: list[float], pct: float) -> float:
    if not sorted_values:
        return 0.0
    idx = min(int(len(sorted_values) * pct), len(sorted_values) - 1)
    return sorted_values[idx]


def _summarize(values: list[float]) -> dict:
    values = sorted(values)
    return {
        "mean": round(statistics.mean(values), 2) if values else 0.0,
        "p50": round(statistics.median(values), 2) if values else 0.0,
        "p95": round(_percentile(values, 0.95), 2),
        "min": round(values[0], 2) if values else 0.0,
        "max": round(values[-1], 2) if values else 0.0,
    }


def run_benchmark(corpus_size: int, num_queries: int, top_k: int, rerank: bool) -> dict:
    persist_dir = Path(tempfile.mkdtemp(prefix="aura_retrieval_benchmark_"))
    try:
        store = ChunkVectorStore(persist_dir=persist_dir)
        print(f"Building a {corpus_size}-chunk benchmark corpus...")
        actual_chunks = build_corpus(store, corpus_size)
        print(f"Indexed {actual_chunks} chunks across {store.count()} total vectors")

        # Warm up the embedding model (and the cross-encoder, if reranking)
        # with a throwaway call before timing anything. Both models are
        # lazy-loaded on first use, so without this the first *timed* query
        # would eat a one-time multi-second model-load cost that has
        # nothing to do with steady-state retrieval latency and badly
        # skews the mean (though not p50/p95, which is part of why we
        # report percentiles rather than only a mean).
        print("Warming up embedding/reranker models...")
        retrieve(SAMPLE_QUERIES[0], top_k=top_k, store=store, rerank=rerank)

        queries = [SAMPLE_QUERIES[i % len(SAMPLE_QUERIES)] for i in range(num_queries)]
        total_latencies, embed_latencies, search_latencies, rerank_latencies = [], [], [], []
        print(f"Running {num_queries} retrieval queries (top_k={top_k}, rerank={rerank})...")
        reranker_available = True
        for query in queries:
            result = retrieve(query, top_k=top_k, store=store, rerank=rerank)
            total_latencies.append(result.latency_ms)
            embed_latencies.append(result.embed_latency_ms)
            search_latencies.append(result.search_latency_ms)
            rerank_latencies.append(result.rerank_latency_ms)
            reranker_available = reranker_available and (result.reranked or not rerank)

        summary = {
            "corpus_chunks": actual_chunks,
            "num_queries": num_queries,
            "top_k": top_k,
            "rerank_requested": rerank,
            "reranker_available": reranker_available if rerank else None,
            "latency_ms": {
                "total": _summarize(total_latencies),
                "embed": _summarize(embed_latencies),
                "search": _summarize(search_latencies),
                "rerank": _summarize(rerank_latencies),
            },
            "raw_total_latencies_ms": total_latencies,
            "benchmark_timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }

        print("Retrieval latency results:")
        print(f"   Corpus size: {actual_chunks} chunks")
        print(f"   Total   mean={summary['latency_ms']['total']['mean']}ms  p50={summary['latency_ms']['total']['p50']}ms  p95={summary['latency_ms']['total']['p95']}ms")
        print(f"   Embed   mean={summary['latency_ms']['embed']['mean']}ms")
        print(f"   Search  mean={summary['latency_ms']['search']['mean']}ms")
        print(f"   Rerank  mean={summary['latency_ms']['rerank']['mean']}ms")

        return summary
    finally:
        shutil.rmtree(persist_dir, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark Aura retrieval latency")
    parser.add_argument("--corpus-size", type=int, default=50, help="Target number of chunks to index")
    parser.add_argument("--queries", type=int, default=30, help="Number of queries to run")
    parser.add_argument("--top-k", type=int, default=5, help="top_k for each retrieval call")
    parser.add_argument("--no-rerank", action="store_true", help="Disable cross-encoder reranking")
    parser.add_argument("--output", type=Path, default=Path("results/retrieval_benchmark.json"))
    args = parser.parse_args()

    results = run_benchmark(args.corpus_size, args.queries, args.top_k, rerank=not args.no_rerank)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2))
    print(f"\nBenchmark report saved to: {args.output}")


if __name__ == "__main__":
    main()
