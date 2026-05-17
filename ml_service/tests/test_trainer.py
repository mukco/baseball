import numpy as np
import pytest
from trainer import _bin_continuous, train_model


# ── _bin_continuous ────────────────────────────────────────────────────────────

def test_bin_continuous_produces_correct_label_count():
    y = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0])
    result = _bin_continuous(y, bins=4)
    unique_labels = set(result)
    assert len(unique_labels) <= 4
    assert all(l.startswith("tier_") for l in unique_labels)


def test_bin_continuous_all_same_value():
    y = np.ones(20)
    result = _bin_continuous(y, bins=4)
    # All same → digitize puts everything in one bin
    assert len(set(result)) == 1


def test_bin_continuous_returns_array_of_same_length():
    y = np.linspace(0, 100, 50)
    result = _bin_continuous(y, bins=3)
    assert len(result) == 50


# ── train_model ────────────────────────────────────────────────────────────────

def test_train_model_regression_random_forest(tmp_duckdb):
    config = {
        "duckdb_path": tmp_duckdb,
        "table": "batters",
        "features": ["hr", "bb_pct"],
        "target": "woba",
        "task": "regression",
        "model_type": "random_forest",
        "hyperparams": {"n_estimators": 10},
        "filters": {},
        "one_hot_target": False,
        "test_size": 0.2,
    }
    result = train_model(config)
    assert result["task"] == "regression"
    assert "r2" in result["metrics"]
    assert result["train_samples"] > 0
    assert result["test_samples"] > 0
    assert result["feature_importance"] != []


def test_train_model_classification_with_one_hot(tmp_duckdb):
    config = {
        "duckdb_path": tmp_duckdb,
        "table": "batters",
        "features": ["hr", "bb_pct"],
        "target": "woba",
        "task": "classification",
        "model_type": "random_forest",
        "hyperparams": {"n_estimators": 10},
        "filters": {},
        "one_hot_target": True,
        "target_bins": 4,
        "test_size": 0.2,
    }
    result = train_model(config)
    assert result["task"] == "classification"
    assert "accuracy" in result["metrics"]
    assert result["confusion_matrix"] is not None


def test_train_model_unknown_model_type_raises(tmp_duckdb):
    config = {
        "duckdb_path": tmp_duckdb,
        "table": "batters",
        "features": ["hr"],
        "target": "woba",
        "task": "regression",
        "model_type": "unknown_algo",
        "hyperparams": {},
        "filters": {},
    }
    with pytest.raises(ValueError, match="Unknown model_type"):
        train_model(config)


def test_train_model_too_few_rows_raises(tmp_duckdb):
    config = {
        "duckdb_path": tmp_duckdb,
        "table": "batters",
        "features": ["hr"],
        "target": "woba",
        "task": "regression",
        "model_type": "random_forest",
        "hyperparams": {},
        "filters": {"min_pa": 99999},  # no rows pass
    }
    with pytest.raises(ValueError, match="Too few rows"):
        train_model(config)


def test_train_model_result_has_required_keys(tmp_duckdb):
    config = {
        "duckdb_path": tmp_duckdb,
        "table": "batters",
        "features": ["hr", "bb_pct"],
        "target": "woba",
        "task": "regression",
        "model_type": "gradient_boosting",
        "hyperparams": {"n_estimators": 5},
        "filters": {},
    }
    result = train_model(config)
    expected_keys = {"model_type", "task", "table", "features", "target",
                     "train_samples", "test_samples", "total_samples",
                     "metrics", "feature_importance", "training_time_ms",
                     "parameter_count", "architecture", "loss_history"}
    assert expected_keys.issubset(result.keys())
