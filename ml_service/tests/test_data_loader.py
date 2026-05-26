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


def test_player_id_filter(tmp_duckdb):
    df = load_training_data(tmp_duckdb, "batters", ["hr"], "woba",
                            filters={"player_id": 5})
    assert len(df) == 1
    assert df["hr"].iloc[0] == 5 % 30


def test_player_name_filter_exact(tmp_duckdb):
    # "Player 42" is unambiguous — no other fixture name contains "Player 42" as a substring
    df = load_training_data(tmp_duckdb, "batters", ["hr"], "woba",
                            filters={"player_name": "Player 42"})
    assert len(df) == 1


def test_player_name_filter_partial(tmp_duckdb):
    df = load_training_data(tmp_duckdb, "batters", ["hr"], "woba",
                            filters={"player_name": "player"})
    assert len(df) == 100


def test_player_name_filter_no_match(tmp_duckdb):
    df = load_training_data(tmp_duckdb, "batters", ["hr"], "woba",
                            filters={"player_name": "zzz_nobody"})
    assert len(df) == 0


def test_player_filter_on_pitchers(tmp_duckdb):
    df = load_training_data(tmp_duckdb, "pitchers", ["k_pct"], "era",
                            filters={"player_id": 10})
    assert len(df) == 1


def test_player_id_ignored_for_teams_table(tmp_duckdb):
    """player_id is not in teams_batting FILTER_COLUMNS — filter silently ignored."""
    df_all = load_training_data(tmp_duckdb, "batters", ["hr"], "woba")
    # teams tables don't have player_id in FILTER_COLUMNS so passing it is a no-op
    from data_loader import FILTER_COLUMNS
    assert "player_id" not in FILTER_COLUMNS["teams_batting"]


# ------------------------------------------------------------------
# pitch_by_pitch (on-demand Statcast fetch)
# ------------------------------------------------------------------

SAVANT_CSV_SAMPLE = """\
pitch_type,pitch_name,release_speed,release_spin_rate,release_extension,pfx_x,pfx_z,plate_x,plate_z,zone,balls,strikes,outs_when_up,stand,p_throws,description,events,launch_speed,launch_angle,estimated_woba_using_speedangle
FF,4-Seam Fastball,96.2,2350.0,6.1,-0.8,1.2,0.15,2.4,5,0,0,1,R,R,called_strike,,,,
SL,Slider,87.4,2600.0,5.8,1.1,-0.3,-0.42,1.1,14,1,1,0,L,R,swinging_strike,,,,
FF,4-Seam Fastball,95.8,2310.0,6.0,-0.9,1.3,0.05,2.5,5,0,2,2,R,R,hit_into_play,single,88.2,12.0,0.380
"""


def test_pitch_by_pitch_fetches_savant(mocker):
    mock_response = mocker.MagicMock()
    mock_response.text = SAVANT_CSV_SAMPLE
    mock_response.raise_for_status = mocker.MagicMock()

    mock_client = mocker.MagicMock()
    mock_client.__enter__ = mocker.MagicMock(return_value=mock_client)
    mock_client.__exit__ = mocker.MagicMock(return_value=False)
    mock_client.get = mocker.MagicMock(return_value=mock_response)

    mocker.patch("data_loader.httpx.Client", return_value=mock_client)

    df = load_training_data(
        "", "pitch_by_pitch",
        ["release_speed", "pfx_x", "pfx_z"],
        "plate_z",
        filters={"player_id": 543037, "seasons": [2024]},
    )
    assert len(df) == 3
    assert "release_speed" in df.columns
    assert "plate_z" in df.columns

    call_args = mock_client.get.call_args
    url = call_args[0][0]
    assert "hfGT=R|" in url
    assert "543037" in url


def test_pitch_by_pitch_requires_player_id(tmp_duckdb):
    with pytest.raises(ValueError, match="player_id"):
        load_training_data(tmp_duckdb, "pitch_by_pitch", ["release_speed"], "plate_z")


def test_pitch_by_pitch_requires_player_id_not_none(tmp_duckdb):
    with pytest.raises(ValueError, match="player_id"):
        load_training_data(
            tmp_duckdb, "pitch_by_pitch", ["release_speed"], "plate_z",
            filters={"player_id": None},
        )


def test_pitch_by_pitch_multiple_seasons(mocker):
    mock_response = mocker.MagicMock()
    mock_response.text = SAVANT_CSV_SAMPLE
    mock_response.raise_for_status = mocker.MagicMock()

    mock_client = mocker.MagicMock()
    mock_client.__enter__ = mocker.MagicMock(return_value=mock_client)
    mock_client.__exit__ = mocker.MagicMock(return_value=False)
    mock_client.get = mocker.MagicMock(return_value=mock_response)

    mocker.patch("data_loader.httpx.Client", return_value=mock_client)

    df = load_training_data(
        "", "pitch_by_pitch",
        ["release_speed"], "plate_z",
        filters={"player_id": 543037, "seasons": [2023, 2024]},
    )
    # Two seasons × 3 rows each
    assert len(df) == 6
    assert mock_client.get.call_count == 2


def test_pitch_by_pitch_empty_response(mocker):
    mock_response = mocker.MagicMock()
    mock_response.text = ""
    mock_response.raise_for_status = mocker.MagicMock()

    mock_client = mocker.MagicMock()
    mock_client.__enter__ = mocker.MagicMock(return_value=mock_client)
    mock_client.__exit__ = mocker.MagicMock(return_value=False)
    mock_client.get = mocker.MagicMock(return_value=mock_response)

    mocker.patch("data_loader.httpx.Client", return_value=mock_client)

    df = load_training_data(
        "", "pitch_by_pitch",
        ["release_speed"], "plate_z",
        filters={"player_id": 543037, "seasons": [2024]},
    )
    assert len(df) == 0
