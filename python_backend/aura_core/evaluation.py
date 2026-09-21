"""Model evaluation and metrics tracking for production ML monitoring."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence, Literal
from sklearn.metrics import precision_recall_fscore_support, confusion_matrix, classification_report
import numpy as np


@dataclass
class ModelMetrics:
    """Comprehensive metrics for binary or multi-class classification."""
    precision: float
    recall: float
    f1_score: float
    accuracy: float
    support: int
    confusion_matrix: list[list[int]]
    per_class_metrics: dict[str, dict[str, float]]


@dataclass
class ConfidenceCalibration:
    """Metrics for assessing prediction confidence calibration."""
    avg_confidence: float
    calibration_error: float  # Expected Calibration Error (ECE)
    confidence_buckets: dict[str, dict[str, float]]


def evaluate_classifier(
    y_true: Sequence[int | str],
    y_pred: Sequence[int | str],
    confidence_scores: Sequence[float] | None = None,
    class_names: Sequence[str] | None = None
) -> ModelMetrics:
    """
    Evaluate classification model with comprehensive metrics.
    
    Args:
        y_true: Ground truth labels
        y_pred: Predicted labels
        confidence_scores: Optional prediction probabilities
        class_names: Optional class names for reporting
        
    Returns:
        ModelMetrics with precision, recall, F1, confusion matrix
    """
    # Calculate precision, recall, F1 (macro average for multi-class)
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, average='macro', zero_division=0
    )
    
    # Overall accuracy
    accuracy = np.mean(np.array(y_true) == np.array(y_pred))
    
    # Confusion matrix
    cm = confusion_matrix(y_true, y_pred).tolist()
    
    # Per-class metrics
    per_class_p, per_class_r, per_class_f1, per_class_s = precision_recall_fscore_support(
        y_true, y_pred, average=None, zero_division=0
    )
    
    unique_labels = sorted(set(y_true))
    if class_names is None:
        class_names = [str(label) for label in unique_labels]
    
    per_class_metrics = {}
    for i, label in enumerate(unique_labels):
        class_name = class_names[i] if i < len(class_names) else str(label)
        per_class_metrics[class_name] = {
            "precision": round(float(per_class_p[i]), 3),
            "recall": round(float(per_class_r[i]), 3),
            "f1_score": round(float(per_class_f1[i]), 3),
            "support": int(per_class_s[i])
        }
    
    return ModelMetrics(
        precision=round(float(precision), 3),
        recall=round(float(recall), 3),
        f1_score=round(float(f1), 3),
        accuracy=round(float(accuracy), 3),
        support=len(y_true),
        confusion_matrix=cm,
        per_class_metrics=per_class_metrics
    )


def evaluate_confidence_calibration(
    y_true: Sequence[int],
    confidence_scores: Sequence[float],
    num_buckets: int = 10
) -> ConfidenceCalibration:
    """
    Evaluate how well-calibrated the model's confidence scores are.
    
    Expected Calibration Error (ECE): measures the difference between
    predicted confidence and actual accuracy within confidence buckets.
    
    Args:
        y_true: Binary ground truth (1 for positive class)
        confidence_scores: Model's confidence for positive class
        num_buckets: Number of confidence bins (default 10)
        
    Returns:
        ConfidenceCalibration with ECE and bucket statistics
    """
    y_true = np.array(y_true)
    confidence_scores = np.array(confidence_scores)
    
    # Create confidence buckets
    bucket_boundaries = np.linspace(0, 1, num_buckets + 1)
    bucket_stats = {}
    calibration_errors = []
    
    for i in range(num_buckets):
        lower, upper = bucket_boundaries[i], bucket_boundaries[i + 1]
        in_bucket = (confidence_scores >= lower) & (confidence_scores < upper)
        
        if i == num_buckets - 1:  # Include upper boundary for last bucket
            in_bucket = (confidence_scores >= lower) & (confidence_scores <= upper)
        
        if np.sum(in_bucket) == 0:
            continue
            
        bucket_accuracy = np.mean(y_true[in_bucket])
        bucket_confidence = np.mean(confidence_scores[in_bucket])
        bucket_size = np.sum(in_bucket)
        
        # Weighted calibration error
        bucket_error = abs(bucket_accuracy - bucket_confidence) * bucket_size / len(y_true)
        calibration_errors.append(bucket_error)
        
        bucket_stats[f"{lower:.1f}-{upper:.1f}"] = {
            "accuracy": round(float(bucket_accuracy), 3),
            "avg_confidence": round(float(bucket_confidence), 3),
            "count": int(bucket_size),
            "error": round(float(abs(bucket_accuracy - bucket_confidence)), 3)
        }
    
    expected_calibration_error = sum(calibration_errors)
    
    return ConfidenceCalibration(
        avg_confidence=round(float(np.mean(confidence_scores)), 3),
        calibration_error=round(float(expected_calibration_error), 3),
        confidence_buckets=bucket_stats
    )


def cross_validate_model(
    model,
    data: Sequence[tuple[str, int | str]],
    n_folds: int = 5
) -> dict[str, float]:
    """
    Perform k-fold cross-validation on a classifier.
    
    Args:
        model: Classifier with fit() and predict() methods
        data: List of (text, label) tuples
        n_folds: Number of folds for cross-validation
        
    Returns:
        Dictionary with mean and std of metrics across folds
    """
    from sklearn.model_selection import StratifiedKFold
    
    texts, labels = zip(*data)
    texts = np.array(texts)
    labels = np.array(labels)
    
    skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)
    
    fold_scores = {
        "precision": [],
        "recall": [],
        "f1_score": [],
        "accuracy": []
    }
    
    for train_idx, test_idx in skf.split(texts, labels):
        X_train, X_test = texts[train_idx], texts[test_idx]
        y_train, y_test = labels[train_idx], labels[test_idx]
        
        # Train on fold
        model.fit(X_train, y_train)
        
        # Predict on test fold
        y_pred = model.predict(X_test)
        
        # Calculate metrics
        metrics = evaluate_classifier(y_test, y_pred)
        fold_scores["precision"].append(metrics.precision)
        fold_scores["recall"].append(metrics.recall)
        fold_scores["f1_score"].append(metrics.f1_score)
        fold_scores["accuracy"].append(metrics.accuracy)
    
    # Aggregate results
    return {
        "precision_mean": round(np.mean(fold_scores["precision"]), 3),
        "precision_std": round(np.std(fold_scores["precision"]), 3),
        "recall_mean": round(np.mean(fold_scores["recall"]), 3),
        "recall_std": round(np.std(fold_scores["recall"]), 3),
        "f1_mean": round(np.mean(fold_scores["f1_score"]), 3),
        "f1_std": round(np.std(fold_scores["f1_score"]), 3),
        "accuracy_mean": round(np.mean(fold_scores["accuracy"]), 3),
        "accuracy_std": round(np.std(fold_scores["accuracy"]), 3),
    }


def generate_classification_report(
    y_true: Sequence[int | str],
    y_pred: Sequence[int | str],
    class_names: Sequence[str] | None = None
) -> str:
    """
    Generate a detailed classification report string.
    
    Wrapper around sklearn's classification_report for pretty printing.
    """
    return classification_report(
        y_true, 
        y_pred, 
        target_names=class_names,
        zero_division=0
    )


__all__ = [
    "ModelMetrics",
    "ConfidenceCalibration", 
    "evaluate_classifier",
    "evaluate_confidence_calibration",
    "cross_validate_model",
    "generate_classification_report"
]
