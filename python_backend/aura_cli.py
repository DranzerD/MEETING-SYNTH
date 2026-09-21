"""Command-line interface for Aura Core: analyze, (re-)index, and query --
the same three operations api_server.py exposes over HTTP, run directly
against the local pipeline/vector store with no server needed.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from aura_core import AuraPipeline
from aura_core.exporters import export_decisions_csv, export_json, export_tasks_csv
from aura_core.indexing import IndexLedger, index_meeting
from aura_core.query_engine import RAGChatEngine
from aura_core.vectorstore import ChunkVectorStore


def cmd_analyze(args: argparse.Namespace) -> None:
  transcript_text = args.transcript.read_text(encoding="utf-8")
  pipeline = AuraPipeline()
  result = pipeline.analyze(
      transcript_text, meeting_id=args.meeting_id, thread_key=args.thread, use_llm=args.use_llm,
  )

  output_dir = args.output
  payload = {
      "stats": result.stats,
      "summary": result.summary,
      "tasks": result.tasks,
      "decisions": result.decisions,
      "sentiment": result.sentiment,
      "thread": result.thread,
  }
  export_json(payload, output_dir)
  export_tasks_csv(result.tasks, output_dir)
  export_decisions_csv(result.decisions, output_dir)

  if args.pretty:
    print(json.dumps(payload, indent=2, ensure_ascii=False))
  else:
    print(f"Saved outputs to {output_dir.resolve()}")

  if args.index:
    meeting_id = args.meeting_id or args.thread
    if not meeting_id:
      raise SystemExit("--index requires --meeting-id (or --thread) so the chunks have a stable id")
    store = ChunkVectorStore()
    ledger = IndexLedger()
    status = index_meeting(meeting_id, transcript_text, store=store, ledger=ledger)
    print(f"Indexed meeting '{meeting_id}': {status.status} ({status.chunk_count} chunks)")


def cmd_index(args: argparse.Namespace) -> None:
  transcript_text = args.transcript.read_text(encoding="utf-8")
  store = ChunkVectorStore()
  ledger = IndexLedger()
  status = index_meeting(args.meeting_id, transcript_text, store=store, ledger=ledger)
  print(json.dumps(status.__dict__, indent=2))


def cmd_query(args: argparse.Namespace) -> None:
  engine = RAGChatEngine(store=ChunkVectorStore())
  meeting_ids = args.meeting_ids.split(",") if args.meeting_ids else None
  answer = engine.answer(args.question, meeting_ids=meeting_ids, top_k=args.top_k)

  print(f"\n{answer.answer}\n")
  if answer.citations:
    print("Citations:")
    for c in answer.citations:
      speakers = f", speakers: {', '.join(c.speakers)}" if c.speakers else ""
      print(f"  [{c.index}] meeting={c.meeting_id} chunk={c.chunk_index} score={c.score}{speakers}")
      print(f"       {c.snippet}")
  print(
      f"\ngrounded={answer.grounded}  model={answer.model}  "
      f"retrieval={answer.retrieval_latency_ms}ms  rerank={answer.rerank_latency_ms}ms  "
      f"generation={answer.generation_latency_ms}ms"
  )


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Aura meeting intelligence CLI")
  subparsers = parser.add_subparsers(dest="command", required=True)

  analyze_parser = subparsers.add_parser("analyze", help="Run the extractive pipeline on a transcript")
  analyze_parser.add_argument("transcript", type=Path, help="Path to .txt transcript")
  analyze_parser.add_argument("--thread", type=str, default=None, help="Thread key to link related meetings")
  analyze_parser.add_argument("--meeting-id", type=str, default=None, help="Optional meeting identifier")
  analyze_parser.add_argument("--output", type=Path, default=Path("output"), help="Directory for exports")
  analyze_parser.add_argument("--pretty", action="store_true", help="Print pretty JSON to stdout")
  analyze_parser.add_argument("--use-llm", action="store_true", help="Use the optional LLM extraction pass")
  analyze_parser.add_argument("--index", action="store_true", help="Also chunk/embed/index for retrieval")
  analyze_parser.set_defaults(func=cmd_analyze)

  index_parser = subparsers.add_parser("index", help="(Re-)index a transcript for retrieval without analyzing it")
  index_parser.add_argument("transcript", type=Path, help="Path to .txt transcript")
  index_parser.add_argument("--meeting-id", type=str, required=True, help="Meeting identifier to index under")
  index_parser.set_defaults(func=cmd_index)

  query_parser = subparsers.add_parser("query", help="Ask a grounded question over indexed meetings")
  query_parser.add_argument("question", type=str, help="Question to ask")
  query_parser.add_argument("--meeting-ids", type=str, default=None, help="Comma-separated meeting ids to scope to")
  query_parser.add_argument("--top-k", type=int, default=5, help="Number of chunks to retrieve")
  query_parser.set_defaults(func=cmd_query)

  return parser.parse_args()


def main() -> None:
  args = parse_args()
  args.func(args)


if __name__ == "__main__":
  main()
