import pytest
from data_loader import load_training_data


def test_loads_basic_features(tmp_duckdb):
    df = load_training_data(tmp_duckdb, "batters", ["hr", "bb_pct"], "woba")
    assert len(df) == 100
    assert set(["hr", "bb_pct", "woba"]).issubset(df.columns)


def test_deduplicates_columns_when_target_in_features(tmp_duckdb):
    df = load_training_data(tmp_duckdb, "batters", ["hr", "woba"], "woba")
    # woba should appear only once
    assert list(df.columns).count("woba") == 1


def test_min_pa_filter(tmp_duckdb):
    df_all = load_training_data(tmp_duckdb, "batters", ["hr"], "woba")
    df_filtered = load_training_data(tmp_duckdb, "batters", ["hr"], "woba",
                                     filters={"min_pa": 450})
    assert len(df_filtered) < len(df_all)
    assert (df_filtered["hr"].notna()).all()


def test_seasons_filter(tmp_duckdb):
    df = load_training_data(tmp_duckdb, "batters", ["hr"], "woba",
                            filters={"seasons": [2023]})
    assert len(df) == 100  # all rows are season 2023

    df_empty = load_training_data(tmp_duckdb, "batters", ["hr"], "woba",
                                  filters={"seasons": [2020]})
    assert len(df_empty) == 0


def test_unknown_table_raises(tmp_duckdb):
    with pytest.raises(ValueError, match="Unknown table"):
        load_training_data(tmp_duckdb, "bad_table", ["hr"], "woba")


def test_drops_rows_with_null_target(tmp_duckdb, mocker):
    """Rows where the target is null should be dropped."""
    import duckdb
    con = duckdb.connect(tmp_duckdb)
    con.execute("INSERT INTO batters VALUES (999, 'NullTarget', 2023, 400, 10, 0.10, NULL, 1.5)")
    con.close()

    df = load_training_data(tmp_duckdb, "batters", ["hr"], "woba")
    assert df["woba"].isna().sum() == 0


def test_pitchers_min_ip_filter(tmp_duckdb):
    df_all = load_training_data(tmp_duckdb, "pitchers", ["k_pct"], "era")
    df_filtered = load_training_data(tmp_duckdb, "pitchers", ["k_pct"], "era",
                                     filters={"min_ip": 150.0})
    assert len(df_filtered) < len(df_all)
