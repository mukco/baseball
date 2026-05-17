import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

from data_loader import load_training_data
from models import neural_network, sklearn_models


SKLEARN_TYPES = {"linear_regression", "logistic_regression", "random_forest", "gradient_boosting"}
NN_TYPES      = {"neural_network"}


def train_model(config: dict) -> dict:
    duckdb_path = config["duckdb_path"]
    table       = config["table"]
    features    = config["features"]
    target      = config["target"]
    task        = config.get("task", "regression")
    model_type  = config.get("model_type", "random_forest")
    hyperparams = config.get("hyperparams", {})
    filters     = config.get("filters", {})
    one_hot     = config.get("one_hot_target", False)
    test_size   = float(config.get("test_size", 0.2))

    df = load_training_data(duckdb_path, table, features, target, filters)

    if len(df) < 20:
        raise ValueError(f"Too few rows after filtering ({len(df)}). Relax your filters or choose a different target.")

    X = df[features].to_numpy(dtype=np.float64)
    y_raw = df[target].to_numpy()

    if one_hot and task == "classification":
        bins = int(config.get("target_bins", 4))
        y_raw = _bin_continuous(y_raw, bins)

    if task == "classification":
        y = y_raw.astype(str)
    else:
        y = y_raw.astype(np.float64)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42
    )

    if model_type in NN_TYPES:
        result = neural_network.train(
            X_train, X_test, y_train, y_test,
            feature_names=features,
            task=task,
            hyperparams=hyperparams,
        )
    elif model_type in SKLEARN_TYPES:
        result = sklearn_models.train(
            X_train, X_test, y_train, y_test,
            feature_names=features,
            model_type=model_type,
            task=task,
            hyperparams=hyperparams,
        )
    else:
        raise ValueError(f"Unknown model_type: {model_type}")

    result.update({
        "model_type":    model_type,
        "task":          task,
        "table":         table,
        "features":      features,
        "target":        target,
        "train_samples": len(X_train),
        "test_samples":  len(X_test),
        "total_samples": len(df),
    })
    return result


def _bin_continuous(y: np.ndarray, bins: int) -> np.ndarray:
    percentiles = np.linspace(0, 100, bins + 1)
    edges = np.percentile(y, percentiles)
    edges = np.unique(edges)
    labels = [f"tier_{i+1}" for i in range(len(edges) - 1)]
    return np.array(labels)[np.digitize(y, edges[1:-1])]
