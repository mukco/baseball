import numpy as np
import pytest
from models.neural_network import MLP, train


def make_regression_data(n=80, features=3):
    rng = np.random.default_rng(0)
    X = rng.standard_normal((n, features)).astype(np.float64)
    y = (X[:, 0] * 2 + rng.standard_normal(n) * 0.1).astype(np.float64)
    split = int(n * 0.8)
    return X[:split], X[split:], y[:split], y[split:]


def make_classification_data(n=80, features=3, classes=3):
    rng = np.random.default_rng(0)
    X = rng.standard_normal((n, features)).astype(np.float64)
    y = np.array([f"class_{i % classes}" for i in range(n)])
    split = int(n * 0.8)
    return X[:split], X[split:], y[:split], y[split:]


# ── MLP architecture ───────────────────────────────────────────────────────────

def test_parameter_count_matches_formula():
    model = MLP(input_size=5, layers=[64, 32], output_size=1)
    # (5+1)*64 + (64+1)*32 + (32+1)*1
    expected = (5 + 1) * 64 + (64 + 1) * 32 + (32 + 1) * 1
    assert model.parameter_count() == expected


def test_parameter_count_single_layer():
    model = MLP(input_size=10, layers=[16], output_size=1)
    expected = (10 + 1) * 16 + (16 + 1) * 1
    assert model.parameter_count() == expected


def test_parameter_count_multiclass_output():
    model = MLP(input_size=4, layers=[8], output_size=3)
    expected = (4 + 1) * 8 + (8 + 1) * 3
    assert model.parameter_count() == expected


def test_architecture_summary_format():
    model = MLP(input_size=3, layers=[8, 4], output_size=1)
    summary = model.architecture_summary(3, [8, 4], 1, "relu")
    assert summary.startswith("Input(3)")
    assert "Dense(8, relu)" in summary
    assert "Dense(4, relu)" in summary
    assert summary.endswith("Output(1)")


def test_architecture_summary_single_layer():
    model = MLP(input_size=2, layers=[16], output_size=2)
    summary = model.architecture_summary(2, [16], 2, "tanh")
    assert "Dense(16, tanh)" in summary


# ── train function ─────────────────────────────────────────────────────────────

def test_train_regression_returns_r2():
    X_tr, X_te, y_tr, y_te = make_regression_data()
    result = train(X_tr, X_te, y_tr, y_te,
                   feature_names=["f1", "f2", "f3"],
                   task="regression",
                   hyperparams={"layers": [16, 8], "epochs": 5})
    assert "r2" in result["metrics"]
    assert "rmse" in result["metrics"]
    assert isinstance(result["loss_history"], list)
    assert len(result["loss_history"]) == 5
    assert result["confusion_matrix"] is None


def test_train_classification_returns_accuracy():
    X_tr, X_te, y_tr, y_te = make_classification_data()
    result = train(X_tr, X_te, y_tr, y_te,
                   feature_names=["f1", "f2", "f3"],
                   task="classification",
                   hyperparams={"layers": [16], "epochs": 5})
    assert "accuracy" in result["metrics"]
    assert result["confusion_matrix"] is not None
    assert result["confusion_labels"] is not None


def test_train_parameter_count_matches_architecture():
    X_tr, X_te, y_tr, y_te = make_regression_data(features=4)
    hyperparams = {"layers": [32, 16], "epochs": 3}
    result = train(X_tr, X_te, y_tr, y_te,
                   feature_names=["a", "b", "c", "d"],
                   task="regression",
                   hyperparams=hyperparams)
    assert result["parameter_count"] > 0
    assert "→" in result["architecture"]


def test_train_loss_decreases_generally():
    """Loss should generally trend down over enough epochs on an easy problem."""
    X_tr, X_te, y_tr, y_te = make_regression_data(n=200, features=2)
    result = train(X_tr, X_te, y_tr, y_te,
                   feature_names=["f1", "f2"],
                   task="regression",
                   hyperparams={"layers": [32], "epochs": 20, "learning_rate": 0.01})
    loss = result["loss_history"]
    assert loss[0] > loss[-1], "Loss should decrease over 20 epochs"
