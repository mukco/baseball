import pytest
from fastapi.testclient import TestClient

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert resp.json()["service"] == "statline-ml"


def test_columns_unknown_table(tmp_duckdb):
    resp = client.get(f"/columns/bad_table?duckdb_path={tmp_duckdb}")
    assert resp.status_code == 400
    assert "Unknown table" in resp.json()["detail"]


def test_columns_warehouse_missing():
    resp = client.get("/columns/batters?duckdb_path=/nonexistent/baseball.duckdb")
    assert resp.status_code == 503


def test_columns_valid_table(tmp_duckdb):
    resp = client.get(f"/columns/batters?duckdb_path={tmp_duckdb}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["table"] == "batters"
    assert any(c["name"] == "hr" for c in data["columns"])


def test_train_unknown_table(tmp_duckdb):
    payload = {
        "duckdb_path": tmp_duckdb,
        "table": "not_a_table",
        "features": ["hr"],
        "target": "woba",
    }
    resp = client.post("/train", json=payload)
    assert resp.status_code == 400


def test_train_empty_features(tmp_duckdb):
    payload = {
        "duckdb_path": tmp_duckdb,
        "table": "batters",
        "features": [],
        "target": "woba",
    }
    resp = client.post("/train", json=payload)
    assert resp.status_code == 400


def test_train_warehouse_missing():
    payload = {
        "duckdb_path": "/nonexistent/baseball.duckdb",
        "table": "batters",
        "features": ["hr"],
        "target": "woba",
    }
    resp = client.post("/train", json=payload)
    assert resp.status_code == 503


def test_train_invalid_task(tmp_duckdb):
    payload = {
        "duckdb_path": tmp_duckdb,
        "table": "batters",
        "features": ["hr"],
        "target": "woba",
        "task": "clustering",
    }
    resp = client.post("/train", json=payload)
    assert resp.status_code == 400


def test_train_regression_succeeds(tmp_duckdb):
    payload = {
        "duckdb_path": tmp_duckdb,
        "table": "batters",
        "features": ["hr", "bb_pct"],
        "target": "woba",
        "task": "regression",
        "model_type": "random_forest",
        "hyperparams": {"n_estimators": 5},
        "filters": {},
    }
    resp = client.post("/train", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["task"] == "regression"
    assert "r2" in data["metrics"]
    assert data["total_samples"] > 0
