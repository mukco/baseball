class BullpenManager
  REST_DAYS = {
    "sp" => 5, "cl" => 1, "su" => 1, "mr" => 1, "lr" => 2,
  }.freeze

  MAX_CONSECUTIVE = {
    "cl" => 2, "su" => 2, "mr" => 3, "lr" => 2,
  }.freeze

  MAX_SEASON_OUTS = {
    "sp" => 810, "cl" => 210, "su" => 195, "mr" => 180, "lr" => 165,
  }.freeze

  # Ordered priority for bullpen selection within a game
  BULLPEN_ROLE_ORDER = %w[cl su mr lr].freeze

  def initialize(roster, game_date)
    @roster    = roster
    @game_date = game_date
    @state     = roster.pitcher_state.tap { |s| s["pitchers"] ||= {} }
    @dirty     = false
  end

  # Ordered list of pitcher IDs for this game: SP first, then available bullpen.
  # skip_ids: Set of player IDs to exclude (e.g. injured players).
  def game_pitcher_list(skip_ids: Set.new)
    sp = next_starter(skip_ids: skip_ids)
    bp = available_relievers(skip_ids: Set.new(skip_ids) | [sp].compact)
    ([sp] + bp).compact
  end

  # Call after the game completes. Updates in-memory state only — call flush! to persist.
  # relievers: Array of { id:, outs: } for each reliever who appeared.
  def record_game(sp_id, relievers: [])
    @state["rotation_slot"] = ((@state["rotation_slot"] || 0).to_i + 1) % 5
    record_appearance(sp_id)
    relievers.each { |r| record_appearance(r[:id], outs: r[:outs].to_i) }
    @dirty = true
  end

  # Persist state back to the database in one write.
  def flush!
    return unless @dirty
    @roster.update_columns(pitcher_state_json: @state.to_json)
    @dirty = false
  end

  # Build the initial pitcher_state_json hash for a newly imported roster.
  #
  # pitchers_with_ip: Array of { id:, projected_ip: } — all pitchers on the 40-man
  # bullpen_roles:    Hash with keys :closer_id, :setup_ids, :long_ids (may be nil/empty)
  def self.build_initial_state(pitchers_with_ip, bullpen_roles = {})
    roles       = bullpen_roles || {}
    closer_id   = roles[:closer_id]&.to_i
    setup_ids   = Array(roles[:setup_ids]).map(&:to_i).to_set
    long_ids    = Array(roles[:long_ids]).map(&:to_i).to_set

    sorted = pitchers_with_ip.sort_by { |p| -p[:projected_ip].to_f }
    starters    = sorted.select { |p| p[:projected_ip].to_f >= 80 }.first(5)
    starter_ids = starters.map { |p| p[:id].to_i }.to_set

    pitchers_hash = {}
    slot = 0

    sorted.each do |pitcher|
      id   = pitcher[:id].to_i
      role = if starter_ids.include?(id)
               current_slot = slot
               slot += 1
               { "role" => "sp", "slot" => current_slot }
             elsif id == closer_id
               { "role" => "cl" }
             elsif setup_ids.include?(id)
               { "role" => "su" }
             elsif long_ids.include?(id)
               { "role" => "lr" }
             else
               { "role" => "mr" }
             end

      pitchers_hash[id.to_s] = role.merge(
        "last_pitched"    => nil,
        "consecutive_days" => 0,
        "season_g"        => 0,
        "season_outs"     => 0,
      )
    end

    { "rotation_slot" => 0, "pitchers" => pitchers_hash }
  end

  # Re-derive CL/SU/LR roles from updated bullpen_roles without resetting rest/workload state.
  def self.sync_roles(current_state, bullpen_roles)
    state     = current_state.dup
    pitchers  = (state["pitchers"] || {}).dup
    roles     = bullpen_roles || {}
    closer_id = roles[:closer_id]&.to_i
    setup_ids = Array(roles[:setup_ids]).map(&:to_i).to_set
    long_ids  = Array(roles[:long_ids]).map(&:to_i).to_set

    pitchers.each do |id_str, pitcher_entry|
      id = id_str.to_i
      next if pitcher_entry["role"] == "sp"
      pitcher_entry["role"] = if id == closer_id          then "cl"
                               elsif setup_ids.include?(id) then "su"
                               elsif long_ids.include?(id)  then "lr"
                               else                              "mr"
                               end
    end

    state["pitchers"] = pitchers
    state
  end

  private

  def next_starter(skip_ids: Set.new)
    slot = @state["rotation_slot"].to_i
    5.times do |offset|
      target                   = (slot + offset) % 5
      pitcher_id, pitcher_state = find_by_slot(target)
      next unless pitcher_id
      next if skip_ids.include?(pitcher_id.to_i)
      return pitcher_id.to_i if sp_available?(pitcher_id, pitcher_state)
    end
    # Fallback: any SP not injured, starting with the earliest slot
    sps.reject { |id, _| skip_ids.include?(id.to_i) }
       .min_by { |_, pitcher_state| pitcher_state["slot"].to_i }
       &.then  { |id, _| id.to_i }
  end

  def available_relievers(skip_ids: Set.new)
    BULLPEN_ROLE_ORDER.flat_map do |role|
      pitchers_by_role(role)
        .reject { |id, _|             skip_ids.include?(id.to_i) }
        .select { |id, pitcher_state| reliever_available?(id, pitcher_state) }
        .sort_by { |_, pitcher_state| pitcher_state["season_g"].to_i }
        .map    { |id, _|             id.to_i }
    end
  end

  def sp_available?(id, pitcher)
    last = pitcher["last_pitched"]
    return true unless last
    (@game_date - Date.parse(last)).to_i >= REST_DAYS["sp"]
  end

  def reliever_available?(id, pitcher)
    role = pitcher["role"]
    last = pitcher["last_pitched"]

    if last
      days_rest = (@game_date - Date.parse(last)).to_i
      return false if days_rest < REST_DAYS.fetch(role, 1)
    end

    max_c = MAX_CONSECUTIVE[role]
    return false if max_c && pitcher["consecutive_days"].to_i >= max_c

    cap = MAX_SEASON_OUTS[role]
    return false if cap && pitcher["season_outs"].to_i >= cap

    true
  end

  def record_appearance(id, outs: nil)
    return unless id
    id_str        = id.to_s
    pitcher_entry = @state.dig("pitchers", id_str) || {}

    last        = pitcher_entry["last_pitched"]
    yesterday   = (@game_date - 1).to_s
    consecutive = (last == yesterday) ? pitcher_entry["consecutive_days"].to_i + 1 : 0

    pitcher_entry["last_pitched"]     = @game_date.to_s
    pitcher_entry["consecutive_days"] = consecutive
    pitcher_entry["season_g"]         = pitcher_entry["season_g"].to_i + 1
    pitcher_entry["season_outs"]      = pitcher_entry["season_outs"].to_i + outs.to_i

    @state["pitchers"][id_str] = pitcher_entry
  end

  def pitchers_by_role(role)
    @state["pitchers"].select { |_, p| p["role"] == role }
  end

  def sps
    pitchers_by_role("sp").transform_keys(&:to_i)
  end

  def find_by_slot(slot)
    pair = @state["pitchers"].find { |_, p| p["role"] == "sp" && p["slot"].to_i == slot }
    pair ? [pair[0].to_i, pair[1]] : nil
  end
end
