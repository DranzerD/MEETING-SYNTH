# Aura Core (Python backend)

The ML/RAG engine behind Meeting Synth. See the [repo-root README](../README.md) for full
architecture, environment variables, and measured results -- this file is a quick reference for
working in this directory specifically.

## Setup

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set at least one LLM provider key
```

Classifiers train automatically on first run from `aura_core/bootstrap_data.py` and persist to
`models/*.joblib` (already checked in, so this only happens if you delete them).

## Run

```bash
uvicorn api_server:app --reload   # http://localhost:8000, docs at /docs
```

## CLI

```bash
python aura_cli.py analyze examples/meeting_1.txt --thread sprint-42 --pretty --index
python aura_cli.py index examples/meeting_1.txt --meeting-id demo-1
python aura_cli.py query "What did we decide about the budget?" --top-k 5
```

## Tests, evaluation, benchmarks

```bash
pip install -r requirements-dev.txt
pytest tests/ -v                                        # 72 tests
python benchmark.py                                      # ML classifier CV metrics
python -m rag_eval.run_retrieval_eval --top-k 3 5        # retrieval quality (Recall/Precision/MRR)
python benchmark_retrieval.py --corpus-size 50 --queries 30   # retrieval latency
```
