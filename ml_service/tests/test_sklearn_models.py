import numpy as np
import pytest
from models.sklearn_models import train, _regression_metrics, _classification_metrics, _feature_importance
from sklearn.linear_model import LinearRegression


def make_regression_data(n=80, features=3, seed=42):
    rng = np.random.default_rng(seed)
    X = rng.standard_normal((n, features))
    y = X[:, 0] * 3 + rng.standard_normal(n) * 0.5
    split = int(n * 0.8)
    return X[:split], X[split:], y[:split], y[split:]


def make_classification_data(n=80, features=3, seed=42):
    rng = np.random.default_rng(seed)
    X = rng.standard_normal((n, features))
    y = np.array(["low" if v < -0.5 else "mid" if v < 0.5 else "high" for v in X[:, 0]])
    split = int(n * 0.8)
    return X[:split], X[split:], y[:split], y[split:]


# ── helper functions ───────────────────────────────────────────────────────────

def test_regression_metrics_perfect_predictions():
    y = np.array([1.0, 2.0, 3.0])
    m = _regression_metrics(y, y)
    assert m["r2"] == 1.0
    assert m["rmse"] == 0.0
    assert m["mae"] == 0.0


def test_classification_metrics_shape(capsys):
    y_true = np.array([0, 1, 2, 0, 1, 2])
    y_pred = np.array([0, 1, 1, 0, 2, 2])
    labels = np.array([0, 1, 2])
    m, cm, cm_labels = _classification_metrics(y_true, y_pred, labels)
    assert "accuracy" in m
    assert len(cm) == 3
    assert len(cm_labels) == 3


def test_feature_importance_random_forest():
    X_tr, X_te, y_tr, y_te = make_regression_data()
    result = train(X_tr, X_te, y_tr, y_te,
                   feature_names=["a", "b", "c"],
                   model_type="random_forest",
                   task="regression",
                   hyperparams={"n_estimators": 10})
    fi = result["feature_importance"]
    assert len(fi) == 3
    assert all(isinstance(x["importance"], float) for x in fi)
    # sorted descending
    importances = [x["importance"] for x in fi]
    assert importances == sorted(importances, reverse=True)


def test_feature_importance_linear_regression_uses_coef():
    X_tr, X_te, y_tr, y_te = make_regression_data()
    model = LinearRegression().fit(X_tr, y_tr)
    fi = _feature_importance(model, ["a", "b", "c"])
    assert len(fi) == 3
    total = sum(x["importance"] for x in fi)
    assert abs(total - 1.0) < 1e-6


# ── model types ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("model_type,task,extra_hp", [
    ("linear_regression",  "regression",     {}),
    ("random_forest",      "regression",     {"n_estimators": 10}),
    ("random_forest",      "classification", {"n_estimators": 10}),
    ("gradient_boosting",  "regression",     {"n_estimators": 10}),
    ("gradient_boosting",  "classification", {"n_estimators": 10}),
    ("logistic_regression","classification", {}),
])
def test_train_model_type(model_type, task, extra_hp):
    if task == "regression":
        X_tr, X_te, y_tr, y_te = make_regression_data()
    else:
        X_tr, X_te, y_tr, y_te = make_classification_data()

    result = train(X_tr, X_te, y_tr, y_te,
                   feature_names=["a", "b", "c"],
                   model_type=model_type,
                   task=task,
                   hyperparams=extra_hp)

    assert result["parameter_count"] is None
    assert result["architecture"] is None
    assert result["loss_history"] is None

    if task == "regression":
        assert "r2" in result["metrics"]
    else:
        assert "accuracy" in result["metrics"]
        assert result["confusion_matrix"] is not None


def test_linear_regression_ridge():
    X_tr, X_te, y_tr, y_te = make_regression_data()
    result = train(X_tr, X_te, y_tr, y_te,
                   feature_names=["a", "b", "c"],
                   model_type="linear_regression",
                   task="regression",
                   hyperparams={"regularization": "l2", "alpha": 0.5})
    assert "r2" in result["metrics"]


def test_linear_regression_lasso():
    X_tr, X_te, y_tr, y_te = make_regression_data()
    result = train(X_tr, X_te, y_tr, y_te,
                   feature_names=["a", "b", "c"],
                   model_type="linear_regression",
                   task="regression",
                   hyperparams={"regularization": "l1", "alpha": 0.01})
    assert "r2" in result["metrics"]


def test_unknown_model_type_raises():
    X_tr, X_te, y_tr, y_te = make_regression_data()
    with pytest.raises(ValueError, match="Unknown sklearn model_type"):
        train(X_tr, X_te, y_tr, y_te,
              feature_names=["a", "b", "c"],
              model_type="xgboost",
              task="regression",
              hyperparams={})
