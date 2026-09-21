"""
Retrieval latency benchmark for Aura's RAG layer.

Indexes the bundled sample transcripts (repeated under synthetic meeting
IDs to build up a corpus of a realistic size) into a throwaway Chroma
collection, then runs a batch of queries and reports p50/p95/mean
end-to-end retrieval latency (embed query + Chroma ANN search) -- a
measured number for your resume/portfolio, not a guess.

Usage:
    python benchmark_retrieval.py --corpus-size 50 --queries 30 \
        --output results/retrieval_benchmark.json

Requires network access on first run (to download the sentence-transformers
model from huggingface.co, cached after that) and the RAG dependencies
installed (`pip install -r requirements.txt`).
"""

from __future__ import annotations

import argparse
import json
import shutil
import statistics
import tempfile
from datetime import datetime
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


def run_benchmark(corpus_size: int, num_queries: int, top_k: int) -> dict:
    persist_dir = Path(tempfile.mkdtemp(prefix="aura_retrieval_benchmark_"))
    try:
        store = ChunkVectorStore(persist_dir=persist_dir)
        print(f"🔄 Building a {corpus_size}-chunk benchmark corpus...")
        actual_chunks = build_corpus(store, corpus_size)
        print(f"✅ Indexed {actual_chunks} chunks across {store.count()} total vectors")

        queries = [SAMPLE_QUERIES[i % len(SAMPLE_QUERIES)] for i in range(num_queries)]
        latencies = []
        print(f"🔄 Running {num_queries} retrieval queries (top_k={top_k})...")
        for query in queries:
            result = retrieve(query, top_k=top_k, store=store)
            latencies.append(result.latency_ms)

        latencies.sort()
        p50 = statistics.median(latencies)
        p95 = latencies[min(int(len(latencies) * 0.95), len(latencies) - 1)]
        mean = statistics.mean(latencies)

        print("✅ Retrieval Latency Results:")
        print(f"   Corpus size: {actual_chunks} chunks")
        print(f"   Queries run: {num_queries}")
        print(f"   Mean: {mean:.2f}ms")
        print(f"   p50:  {p50:.2f}ms")
        print(f"   p95:  {p95:.2f}ms")
        print(f"   Min/Max: {latencies[0]:.2f}ms / {latencies[-1]:.2f}ms")

        return {
            "corpus_chunks": actual_chunks,
            "num_queries": num_queries,
            "top_k": top_k,
            "latency_ms": {
                "mean": round(mean, 2),
                "p50": round(p50, 2),
                "p95": round(p95, 2),
                "min": round(latencies[0], 2),
                "max": round(latencies[-1], 2),
            },
            "raw_latencies_ms": latencies,
            "benchmark_timestamp": datetime.utcnow().isoformat() + "Z",
        }
    finally:
        shutil.rmtree(persist_dir, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark Aura retrieval latency")
    parser.add_argument("--corpus-size", type=int, default=50, help="Target number of chunks to index")
    parser.add_argument("--queries", type=int, default=30, help="Number of queries to run")
    parser.add_argument("--top-k", type=int, default=5, help="top_k for each retrieval call")
    parser.add_argument("--output", type=Path, default=Path("results/retrieval_benchmark.json"))
    args = parser.parse_args()

    results = run_benchmark(args.corpus_size, args.queries, args.top_k)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2))
    print(f"\n📊 Benchmark report saved to: {args.output}")


if __name__ == "__main__":
    main()
