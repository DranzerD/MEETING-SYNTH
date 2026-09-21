from aura_core.evaluation import (
    cross_validate_model,
    evaluate_classifier,
    evaluate_confidence_calibration,
)


def test_evaluate_classifier_perfect_predictions_scores_1():
  y_true = [1, 0, 1, 0, 1, 0]
  y_pred = [1, 0, 1, 0, 1, 0]
  metrics = evaluate_classifier(y_true, y_pred, class_names=["neg", "pos"])
  assert metrics.f1_score == 1.0
  assert metrics.precision == 1.0
  assert metrics.recall == 1.0
  assert metrics.accuracy == 1.0
  assert metrics.support == 6


def test_evaluate_classifier_all_wrong_scores_0():
  y_true = [1, 1, 1, 0, 0, 0]
  y_pred = [0, 0, 0, 1, 1, 1]
  metrics = evaluate_classifier(y_true, y_pred)
  assert metrics.f1_score == 0.0
  assert metrics.accuracy == 0.0


def test_confusion_matrix_shape_matches_class_count():
  y_true = ["a", "b", "c", "a", "b", "c"]
  y_pred = ["a", "b", "c", "a", "b", "c"]
  metrics = evaluate_classifier(y_true, y_pred)
  assert len(metrics.confusion_matrix) == 3
  assert all(len(row) == 3 for row in metrics.confusion_matrix)


def test_confidence_calibration_perfectly_calibrated():
  # Confidence exactly matches whether the prediction was right: perfectly
  # calibrated should have ECE close to 0.
  y_true = [1, 1, 1, 1, 0, 0, 0, 0]
  confidence = [0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1]
  calibration = evaluate_confidence_calibration(y_true, confidence, num_buckets=10)
  assert calibration.calibration_error < 0.15


def test_confidence_calibration_badly_miscalibrated():
  # High confidence but wrong half the time -- should show real error.
  y_true = [1, 0, 1, 0]
  confidence = [0.95, 0.95, 0.95, 0.95]
  calibration = evaluate_confidence_calibration(y_true, confidence, num_buckets=10)
  assert calibration.calibration_error > 0.3


def test_cross_validate_model_on_separable_data_scores_reasonably_well():
  from sklearn.linear_model import LogisticRegression
  from sklearn.feature_extraction.text import TfidfVectorizer
  from sklearn.pipeline import Pipeline

  data = [
      ("I will finish the report by Friday", 1),
      ("Please review the pull request today", 1),
      ("He must submit the invoice this week", 1),
      ("She will schedule the meeting tomorrow", 1),
      ("The weather was nice yesterday", 0),
      ("Everyone enjoyed the presentation", 0),
      ("The project launched successfully last week", 0),
      ("Performance metrics look healthy", 0),
      ("They will deliver the report by Monday", 1),
      ("We must escalate this urgently", 1),
      ("The team celebrated the launch", 0),
      ("Feedback from the client was positive", 0),
  ]
  pipeline = Pipeline([("tfidf", TfidfVectorizer()), ("clf", LogisticRegression(max_iter=1000))])
  results = cross_validate_model(pipeline, data, n_folds=3)
  assert 0.0 <= results["f1_mean"] <= 1.0
  assert "f1_std" in results
  assert results["accuracy_mean"] > 0.4  # not literally testing a specific value, just sanity
