class AddPlayerNameToPlayerProjections < ActiveRecord::Migration[8.0]
  def change
    add_column :player_projections, :player_name, :string
  end
end
