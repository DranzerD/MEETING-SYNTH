# Aura Core Python Backend

This folder contains the real ML/AI engine for Meeting Synth. It is fully offline,
implemented with scikit-learn + spaCy/NLTK level tooling, and exposes both a CLI and a FastAPI service.

## Features

- TF-IDF + LogisticRegression classifiers for action items and decisions, trained on curated corpora.
- VADER-based sentiment with emotion tags.
- TextRank-style extractive summarization.
- Thread memory: persist each meeting into a JSON chain so you can reconstruct "chain of thought" across sessions.
- CLI + FastAPI interface, both sharing the same `AuraPipeline`.

## Setup

```bash
cd python_backend
"C:/Users/Sarana Gnanojval/Desktop/Infer/FINAL_INFERENTIA/.venv/Scripts/python.exe" -m pip install -r requirements.txt
```

A small training dataset lives in `aura_core/bootstrap_data.py`. On first run the
task/decision classifiers train automatically and persist into `python_backend/models/`.

## CLI usage

```bash
"C:/Users/Sarana Gnanojval/Desktop/Infer/FINAL_INFERENTIA/.venv/Scripts/python.exe" aura_cli.py examples/meeting_1.txt --thread sprint-42 --pretty
```

Outputs land in `python_backend/output/` (configurable via `--output`).

## FastAPI server

```bash
"C:/Users/Sarana Gnanojval/Desktop/Infer/FINAL_INFERENTIA/.venv/Scripts/python.exe" -m uvicorn api_server:app --reload
```

POST `http://localhost:8000/analyze` with `{"transcript": "...", "thread": "retro"}` to integrate with the Next.js UI.
