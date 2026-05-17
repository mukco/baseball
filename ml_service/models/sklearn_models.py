import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression, LogisticRegression, Ridge, Lasso
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.metrics import (
    r2_score, mean_squared_error, mean_absolute_error,
    accuracy_score, f1_score, precision_score, recall_score, confusion_matrix,
)
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
import time


def _classification_metrics(y_true, y_pred, labels):
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    avg = "binary" if len(labels) == 2 else "weighted"
    return {
        "accuracy":  round(float(accuracy_score(y_true, y_pred)), 4),
        "f1":        round(float(f1_score(y_true, y_pred, average=avg, zero_division=0)), 4),
        "precision": round(float(precision_score(y_true, y_pred, average=avg, zero_division=0)), 4),
        "recall":    round(float(recall_score(y_true, y_pred, average=avg, zero_division=0)), 4),
    }, cm.tolist(), [str(l) for l in labels]


def _regression_metrics(y_true, y_pred):
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    return {
        "r2":   round(float(r2_score(y_true, y_pred)), 4),
        "rmse": round(rmse, 4),
        "mae":  round(float(mean_absolute_error(y_true, y_pred)), 4),
    }


def _feature_importance(model, feature_names):
    if hasattr(model, "feature_importances_"):
        imps = model.feature_importances_
    elif hasattr(model, "coef_"):
        coef = model.coef_
        imps = np.abs(coef[0] if coef.ndim > 1 else coef)
        total = imps.sum()
        imps = imps / total if total > 0 else imps
    else:
        return []
    pairs = sorted(zip(feature_names, imps.tolist()), key=lambda x: -x[1])
    return [{"feature": f, "importance": round(float(i), 4)} for f, i in pairs]


def train(
    X_train, X_test, y_train, y_test,
    feature_names: list[str],
    model_type: str,
    task: str,
    hyperparams: dict,
):
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s  = scaler.transform(X_test)

    label_encoder = None
    labels = None

    if task == "classification":
        label_encoder = LabelEncoder()
        y_train = label_encoder.fit_transform(y_train)
        y_test  = label_encoder.transform(y_test)
        labels  = label_encoder.classes_

    hp = hyperparams or {}
    t0 = time.time()

    if model_type == "linear_regression":
        reg = hp.get("regularization", "none")
        alpha = float(hp.get("alpha", 1.0))
        if reg == "l2":
            model = Ridge(alpha=alpha)
        elif reg == "l1":
            model = Lasso(alpha=alpha)
        else:
            model = LinearRegression()

    elif model_type == "logistic_regression":
        model = LogisticRegression(
            C=float(hp.get("C", 1.0)),
            penalty=hp.get("penalty", "l2"),
            max_iter=1000,
            solver="lbfgs",
            multi_class="auto",
        )

    elif model_type == "random_forest":
        cls = RandomForestClassifier if task == "classification" else RandomForestRegressor
        model = cls(
            n_estimators=int(hp.get("n_estimators", 100)),
            max_depth=hp.get("max_depth") and int(hp.get("max_depth")) or None,
            random_state=42,
        )

    elif model_type == "gradient_boosting":
        cls = GradientBoostingClassifier if task == "classification" else GradientBoostingRegressor
        model = cls(
            n_estimators=int(hp.get("n_estimators", 100)),
            learning_rate=float(hp.get("learning_rate", 0.1)),
            max_depth=int(hp.get("max_depth", 3)),
            random_state=42,
        )

    else:
        raise ValueError(f"Unknown sklearn model_type: {model_type}")

    model.fit(X_train_s, y_train)
    y_pred = model.predict(X_test_s)
    elapsed_ms = int((time.time() - t0) * 1000)

    if task == "classification":
        metrics, cm, cm_labels = _classification_metrics(y_test, y_pred, labels)
        return {
            "metrics":           metrics,
            "confusion_matrix":  cm,
            "confusion_labels":  cm_labels,
            "feature_importance": _feature_importance(model, feature_names),
            "training_time_ms":  elapsed_ms,
            "parameter_count":   None,
            "architecture":      None,
            "loss_history":      None,
        }
    else:
        return {
            "metrics":            _regression_metrics(y_test, y_pred),
            "confusion_matrix":   None,
            "confusion_labels":   None,
            "feature_importance": _feature_importance(model, feature_names),
            "training_time_ms":   elapsed_ms,
            "parameter_count":    None,
            "architecture":       None,
            "loss_history":       None,
        }
