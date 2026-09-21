"""
Benchmarking suite for Aura ML models.

Run this to evaluate model performance and generate metrics for your resume/portfolio.

Usage:
    python benchmark.py --output results/benchmark_2025_12_22.json
"""

from __future__ import annotations

import json
import argparse
from pathlib import Path
from datetime import datetime
from dataclasses import asdict

from aura_core.models import ModelRegistry
from aura_core.bootstrap_data import TASK_EXAMPLES, DECISION_EXAMPLES
from aura_core.evaluation import (
    evaluate_classifier,
    cross_validate_model,
    evaluate_confidence_calibration,
    generate_classification_report
)
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression


def benchmark_task_classifier(registry: ModelRegistry) -> dict:
    """Benchmark the task classifier with cross-validation."""
    print("🔄 Benchmarking Task Classifier...")
    
    # Ensure model is trained
    registry.ensure_models()
    
    # Prepare data
    texts, labels = zip(*TASK_EXAMPLES)
    
    # Cross-validation
    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
        ("clf", LogisticRegression(max_iter=1000, random_state=42)),
    ])
    
    cv_results = cross_validate_model(pipeline, TASK_EXAMPLES, n_folds=5)
    
    # Full dataset performance
    registry.task_classifier.load_or_train(TASK_EXAMPLES)
    y_pred = registry.task_classifier.predict(texts)
    
    # Get confidence scores
    probas = registry.task_classifier.predict_proba(texts)
    task_idx = list(registry.task_classifier.classes).index(1)
    confidences = [float(p[task_idx]) for p in probas]
    
    # Binary labels for calibration
    binary_labels = [1 if label == 1 else 0 for label in labels]
    
    full_metrics = evaluate_classifier(labels, y_pred, class_names=["Not Task", "Task"])
    calibration = evaluate_confidence_calibration(binary_labels, confidences)
    report = generate_classification_report(labels, y_pred, class_names=["Not Task", "Task"])
    
    print("✅ Task Classifier Results:")
    print(f"   Precision: {full_metrics.precision:.3f}")
    print(f"   Recall: {full_metrics.recall:.3f}")
    print(f"   F1 Score: {full_metrics.f1_score:.3f}")
    print(f"   Accuracy: {full_metrics.accuracy:.3f}")
    print(f"   Calibration Error: {calibration.calibration_error:.3f}")
    print(f"   5-Fold CV F1: {cv_results['f1_mean']:.3f} ± {cv_results['f1_std']:.3f}")
    print(f"\n{report}")
    
    return {
        "model": "task_classifier",
        "dataset_size": len(TASK_EXAMPLES),
        "cross_validation": cv_results,
        "full_dataset_metrics": asdict(full_metrics),
        "confidence_calibration": asdict(calibration),
    }


def benchmark_decision_classifier(registry: ModelRegistry) -> dict:
    """Benchmark the decision classifier with cross-validation."""
    print("\n🔄 Benchmarking Decision Classifier...")
    
    # Ensure model is trained
    registry.ensure_models()
    
    # Prepare data
    texts, labels = zip(*DECISION_EXAMPLES)
    
    # Cross-validation
    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
        ("clf", LogisticRegression(max_iter=1000, random_state=42)),
    ])
    
    cv_results = cross_validate_model(pipeline, DECISION_EXAMPLES, n_folds=4)  # 4 folds due to smaller dataset
    
    # Full dataset performance
    registry.decision_classifier.load_or_train(DECISION_EXAMPLES)
    y_pred = registry.decision_classifier.predict(texts)
    
    class_names = ["timeline", "budget", "technical", "general"]
    full_metrics = evaluate_classifier(labels, y_pred, class_names=class_names)
    report = generate_classification_report(labels, y_pred, class_names=class_names)
    
    print("✅ Decision Classifier Results:")
    print(f"   Precision: {full_metrics.precision:.3f}")
    print(f"   Recall: {full_metrics.recall:.3f}")
    print(f"   F1 Score: {full_metrics.f1_score:.3f}")
    print(f"   Accuracy: {full_metrics.accuracy:.3f}")
    print(f"   4-Fold CV F1: {cv_results['f1_mean']:.3f} ± {cv_results['f1_std']:.3f}")
    print(f"\n{report}")
    
    return {
        "model": "decision_classifier",
        "dataset_size": len(DECISION_EXAMPLES),
        "cross_validation": cv_results,
        "full_dataset_metrics": asdict(full_metrics),
        "class_distribution": {
            label: labels.count(label) for label in class_names
        }
    }


def generate_benchmark_report(results: dict, output_path: Path) -> None:
    """Save benchmark results to JSON and print summary."""
    
    # Add metadata
    results["metadata"] = {
        "benchmark_timestamp": datetime.utcnow().isoformat() + "Z",
        "total_training_examples": sum(r["dataset_size"] for r in results["benchmarks"]),
        "models_evaluated": len(results["benchmarks"])
    }
    
    # Save to file
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n📊 Benchmark Report saved to: {output_path}")
    print("\n" + "="*60)
    print("SUMMARY FOR RESUME/PORTFOLIO")
    print("="*60)
    
    task_metrics = results["benchmarks"][0]["full_dataset_metrics"]
    task_cv = results["benchmarks"][0]["cross_validation"]
    decision_metrics = results["benchmarks"][1]["full_dataset_metrics"]
    decision_cv = results["benchmarks"][1]["cross_validation"]
    
    print(f"""
🎯 Machine Learning Performance Metrics:

Task Extraction Model:
  • Dataset: {results["benchmarks"][0]["dataset_size"]} labeled examples
  • F1 Score: {task_metrics["f1_score"]:.1%} (5-fold CV: {task_cv["f1_mean"]:.1%} ± {task_cv["f1_std"]:.1%})
  • Precision: {task_metrics["precision"]:.1%}
  • Recall: {task_metrics["recall"]:.1%}
  • Accuracy: {task_metrics["accuracy"]:.1%}

Decision Classification Model:
  • Dataset: {results["benchmarks"][1]["dataset_size"]} labeled examples (4 classes)
  • F1 Score: {decision_metrics["f1_score"]:.1%} (4-fold CV: {decision_cv["f1_mean"]:.1%} ± {decision_cv["f1_std"]:.1%})
  • Precision: {decision_metrics["precision"]:.1%}
  • Recall: {decision_metrics["recall"]:.1%}
  • Accuracy: {decision_metrics["accuracy"]:.1%}

📝 Resume-Worthy Achievements:
  ✓ Curated and labeled 130+ training examples
  ✓ Implemented TF-IDF + Logistic Regression classifiers
  ✓ Achieved {task_metrics["f1_score"]:.1%} F1 on task extraction
  ✓ Built multi-class classifier with {decision_metrics["accuracy"]:.1%} accuracy
  ✓ Evaluated with k-fold cross-validation
  ✓ Implemented confidence calibration metrics (ECE)
  ✓ Production-ready model versioning and evaluation pipeline
""")
    
    print("="*60)


def main():
    parser = argparse.ArgumentParser(description="Benchmark Aura ML models")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("results/benchmark.json"),
        help="Output path for benchmark results"
    )
    args = parser.parse_args()
    
    # Initialize registry
    base_dir = Path(__file__).parent
    registry = ModelRegistry(base_dir / "models")
    
    # Run benchmarks
    results = {
        "benchmarks": [
            benchmark_task_classifier(registry),
            benchmark_decision_classifier(registry),
        ]
    }
    
    # Generate report
    generate_benchmark_report(results, args.output)


if __name__ == "__main__":
    main()
