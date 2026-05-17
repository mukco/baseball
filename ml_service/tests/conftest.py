import os
import sys
import pytest
import duckdb
import numpy as np
import pandas as pd

# Put ml_service root on path so imports work without packaging
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def tmp_duckdb(tmp_path):
    """In-memory DuckDB backed by a tmp file with known test data."""
    db_path = str(tmp_path / "test.duckdb")
    con = duckdb.connect(db_path)

    con.execute("""
        CREATE TABLE batters (
            player_id INTEGER,
            name      VARCHAR,
            season    INTEGER,
            pa        INTEGER,
            hr        INTEGER,
            bb_pct    DOUBLE,
            woba      DOUBLE,
            war       DOUBLE
        )
    """)

    rows = [(i, f"Player {i}", 2023, 400 + i * 10, i % 30, round(0.08 + i * 0.001, 4), round(0.320 + i * 0.001, 4), round(1.0 + i * 0.1, 2))
            for i in range(1, 101)]
    con.executemany("INSERT INTO batters VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows)

    con.execute("""
        CREATE TABLE pitchers (
            player_id INTEGER,
            name      VARCHAR,
            season    INTEGER,
            ip        DOUBLE,
            era       DOUBLE,
            k_pct     DOUBLE,
            fip       DOUBLE
        )
    """)

    pitcher_rows = [(i, f"Pitcher {i}", 2023, 100.0 + i * 2, round(3.0 + i * 0.05, 2), round(0.22 + i * 0.002, 4), round(3.2 + i * 0.04, 2))
                    for i in range(1, 51)]
    con.executemany("INSERT INTO pitchers VALUES (?, ?, ?, ?, ?, ?, ?)", pitcher_rows)

    con.close()
    return db_path


@pytest.fixture
def batter_df():
    """Small DataFrame that mirrors the batters table schema."""
    rng = np.random.default_rng(42)
    n = 80
    return pd.DataFrame({
        "hr":     rng.integers(0, 40, n).astype(float),
        "bb_pct": rng.uniform(0.05, 0.20, n),
        "woba":   rng.uniform(0.28, 0.42, n),
    })
