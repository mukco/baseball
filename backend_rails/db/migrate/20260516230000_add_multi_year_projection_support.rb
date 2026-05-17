class AddMultiYearProjectionSupport < ActiveRecord::Migration[8.1]
  def change
    # Allow multiple rows per player per run (one per season for multi-year runs)
    remove_index :player_projections, name: "idx_player_projections_per_run"
    add_index :player_projections, %i[player_id projection_run_id season],
      unique: true, name: "idx_player_projections_per_run"

    # Store actual end-of-season stats (populated for backtest seasons)
    add_column :player_projections, :actual_stats,   :text
    add_column :player_projections, :accuracy_delta, :text

    # Runs may span multiple seasons
    add_column :projection_runs, :seasons_json, :text
  end
end
