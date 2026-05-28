module SimulationSeasonContext
  PHASES = [
    { threshold: 0.00, name: :pre_season,  label: "before the season has started (no games played)" },
    { threshold: 0.01, name: :early,       label: "in the early weeks of the season" },
    { threshold: 0.20, name: :first_half,  label: "in the first half of the season" },
    { threshold: 0.48, name: :midseason,   label: "at or near the All-Star break / midseason" },
    { threshold: 0.55, name: :second_half, label: "in the second half, just past the trade deadline" },
    { threshold: 0.80, name: :stretch_run, label: "in the stretch run with the playoff race underway" },
    { threshold: 0.97, name: :final_weeks, label: "in the final weeks of the season" },
    { threshold: 1.00, name: :complete,    label: "at the conclusion of the completed season" },
  ].freeze

  def self.for_league(league)
    total  = league.simulation_games.count.to_f
    played = league.simulation_games.where.not(simulated_at: nil).count
    pct    = total > 0 ? played / total : 0.0
    phase  = resolve_phase(pct, played)

    {
      games_played:    played,
      total_games:     total.to_i,
      pct_complete:    pct.round(3),
      phase:           phase[:name],
      phase_label:     phase[:label],
      milestone_notes: milestone_notes(pct, phase[:name])
    }
  end

  def self.resolve_phase(pct, played)
    return PHASES[0] if played == 0
    PHASES.reverse.find { |p| pct >= p[:threshold] } || PHASES[0]
  end
  private_class_method :resolve_phase

  def self.milestone_notes(pct, phase)
    notes = []
    notes << "The All-Star break is approaching — first-half performances are under the microscope." if phase == :midseason
    notes << "The trade deadline is imminent — teams are deciding whether to buy or sell." if phase == :second_half && pct < 0.60
    notes << "The trade deadline has passed — rosters are locked in for the stretch run." if pct.between?(0.61, 0.72)
    notes << "The playoff race is heating up — every game matters." if phase == :stretch_run
    notes << "Award races (MVP, Cy Young, ROY) are entering their final stretch." if pct > 0.88
    notes << "Several playoff spots remain undecided with the season nearly over." if phase == :final_weeks
    notes
  end
  private_class_method :milestone_notes
end
