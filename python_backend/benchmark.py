"""Benchmarking suite for the local task/decision classifiers.

The only performance numbers reported here are cross-validated: each fold
trains on 4/5 (or 3/4) of the data and scores on the held-out 1/5, so the
score reflects how the model does on sentences it didn't train on. A
same-data train-then-score pass is included separately, labeled explicitly
as a *training-fit* sanity check (it answers "did the model learn the
training data at all", not "how good is it") -- an earlier version of this
script reported that number as if it were a real F1 score, which is a
textbook train/test leakage mistake for a model this small (TF-IDF +
LogisticRegression can trivially separate ~100 short sentences it was
fit on). See README.md's "Measured results" section for the current
numbers and aura_core/bootstrap_data.py's module docstring for why the
decision classifier's CV score in particular is materially lower.

Usage:
    python benchmark.py --output results/benchmark.json
"""

from __future__ import annotations

import json
import argparse
from pathlib import Path
from datetime import datetime, timezone
from dataclasses import asdict

from aura_core.models import ModelRegistry
from aura_core.bootstrap_data import TASK_EXAMPLES, DECISION_EXAMPLES
from aura_core.evaluation import (
    evaluate_classifier,
    cross_validate_model,
    evaluate_confidence_calibration,
)
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression


def _fresh_pipeline() -> Pipeline:
    return Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
        ("clf", LogisticRegression(max_iter=1000, random_state=42)),
    ])


def benchmark_task_classifier(registry: ModelRegistry) -> dict:
    """Cross-validate the task classifier, then separately report its
    training-set fit as a sanity check (not a performance claim)."""
    print("Benchmarking task classifier (5-fold CV)...")

    texts, labels = zip(*TASK_EXAMPLES)
    cv_results = cross_validate_model(_fresh_pipeline(), TASK_EXAMPLES, n_folds=5)

    registry.task_classifier.load_or_train(TASK_EXAMPLES)
    y_pred_train = registry.task_classifier.predict(texts)
    probas = registry.task_classifier.predict_proba(texts)
    task_idx = list(registry.task_classifier.classes).index(1)
    confidences = [float(p[task_idx]) for p in probas]
    binary_labels = [1 if label == 1 else 0 for label in labels]

    training_fit = evaluate_classifier(labels, y_pred_train, class_names=["Not Task", "Task"])
    calibration = evaluate_confidence_calibration(binary_labels, confidences)

    print(f"  CV F1:  {cv_results['f1_mean']:.3f} +/- {cv_results['f1_std']:.3f}  (this is the real number)")
    print(f"  Training-set fit F1: {training_fit.f1_score:.3f}  (sanity check only -- NOT a generalization estimate)")
    print(f"  Confidence calibration error (ECE): {calibration.calibration_error:.3f}")

    return {
        "model": "task_classifier",
        "dataset_size": len(TASK_EXAMPLES),
        "cross_validation": cv_results,
        "training_set_fit": asdict(training_fit),
        "confidence_calibration": asdict(calibration),
    }


def benchmark_decision_classifier(registry: ModelRegistry) -> dict:
    print("\nBenchmarking decision classifier (4-fold CV)...")

    texts, labels = zip(*DECISION_EXAMPLES)
    cv_results = cross_validate_model(_fresh_pipeline(), DECISION_EXAMPLES, n_folds=4)

    registry.decision_classifier.load_or_train(DECISION_EXAMPLES)
    y_pred_train = registry.decision_classifier.predict(texts)

    class_names = ["timeline", "budget", "technical", "general"]
    training_fit = evaluate_classifier(labels, y_pred_train, class_names=class_names)

    print(f"  CV F1:  {cv_results['f1_mean']:.3f} +/- {cv_results['f1_std']:.3f}  (this is the real number)")
    print(f"  Training-set fit F1: {training_fit.f1_score:.3f}  (sanity check only -- NOT a generalization estimate)")

    return {
        "model": "decision_classifier",
        "dataset_size": len(DECISION_EXAMPLES),
        "cross_validation": cv_results,
        "training_set_fit": asdict(training_fit),
        "class_distribution": {label: labels.count(label) for label in class_names},
    }


def generate_benchmark_report(results: dict, output_path: Path) -> None:
    results["metadata"] = {
        "benchmark_timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "total_training_examples": sum(r["dataset_size"] for r in results["benchmarks"]),
        "models_evaluated": len(results["benchmarks"]),
        "methodology": (
            "cross_validation fields are the generalization estimate (score on "
            "held-out folds). training_set_fit fields are evaluated on the same "
            "data the model was fit on and are a sanity check only -- do not "
            "cite them as accuracy/F1 claims."
        ),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    task_cv = results["benchmarks"][0]["cross_validation"]
    decision_cv = results["benchmarks"][1]["cross_validation"]

    print(f"\nSaved: {output_path}")
    print("\n" + "=" * 60)
    print("CROSS-VALIDATED PERFORMANCE (the numbers that matter)")
    print("=" * 60)
    print(f"""
Task extraction classifier:
  Dataset: {results["benchmarks"][0]["dataset_size"]} labeled sentences, 5-fold CV
  F1: {task_cv["f1_mean"]:.1%} +/- {task_cv["f1_std"]:.1%}   Precision: {task_cv["precision_mean"]:.1%}   Recall: {task_cv["recall_mean"]:.1%}

Decision classifier (4 classes: timeline/budget/technical/general):
  Dataset: {results["benchmarks"][1]["dataset_size"]} labeled sentences, 4-fold CV
  F1: {decision_cv["f1_mean"]:.1%} +/- {decision_cv["f1_std"]:.1%}   Precision: {decision_cv["precision_mean"]:.1%}   Recall: {decision_cv["recall_mean"]:.1%}

The decision classifier's CV score is meaningfully lower -- a small,
4-way dataset with real semantic overlap between classes (e.g. "we're
migrating to Kubernetes" reads as both "technical" and "general" strategy)
is a harder generalization problem than the task classifier's binary
split, not a bug. This is exactly the gap the hybrid LLM-fallback path in
hybrid_ml.py exists to cover for low-confidence predictions.
""")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Benchmark the local classifiers")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("results/benchmark.json"),
        help="Output path for benchmark results",
    )
    args = parser.parse_args()

    base_dir = Path(__file__).parent
    registry = ModelRegistry(base_dir / "models")

    results = {
        "benchmarks": [
            benchmark_task_classifier(registry),
            benchmark_decision_classifier(registry),
        ]
    }

    generate_benchmark_report(results, args.output)


if __name__ == "__main__":
    main()
