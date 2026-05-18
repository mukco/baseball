class SimulationPlayoffPlayerStat < ApplicationRecord
  belongs_to :simulation_league
  belongs_to :simulation_playoff_series

  # ── Batter derived ──────────────────────────────────────────────

  def pa
    ab + bb + hbp.to_i + sf.to_i
  end

  def tb
    singles = (h - hr - doubles.to_i - triples.to_i).clamp(0, Float::INFINITY)
    singles + 2 * doubles.to_i + 3 * triples.to_i + 4 * hr
  end

  def avg
    return 0.0 if ab.zero?
    (h.to_f / ab).round(3)
  end

  def obp
    denom = pa
    return 0.0 if denom.zero?
    ((h + bb + hbp.to_i).to_f / denom).round(3)
  end

  def slg
    return 0.0 if ab.zero?
    (tb.to_f / ab).round(3)
  end

  def ops
    (obp + slg).round(3)
  end

  # ── Pitcher derived ─────────────────────────────────────────────

  def ip_display
    "#{outs_pitched / 3}.#{outs_pitched % 3}"
  end

  def era
    return 0.0 if outs_pitched.zero?
    (er * 27.0 / outs_pitched).round(2)
  end

  def whip
    return 0.0 if outs_pitched.zero?
    ((bb_allowed + h_allowed) / (outs_pitched / 3.0)).round(2)
  end

  def k9
    return 0.0 if outs_pitched.zero?
    (k_pitched * 27.0 / outs_pitched).round(2)
  end
end
