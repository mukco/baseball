class SimulationPlayerStat < ApplicationRecord
  belongs_to :simulation_league

  # ── Batter derived ──────────────────────────────────────────────

  def pa
    ab + bb + hbp.to_i + sf.to_i
  end

  def tb
    singles = h - hr - doubles.to_i - triples.to_i
    singles.clamp(0, Float::INFINITY) + 2 * doubles.to_i + 3 * triples.to_i + 4 * hr
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

  def iso
    (slg - avg).round(3)
  end

  # Simplified wOBA using standard linear weights (no park adjustment)
  WOBA_WEIGHTS = { bb: 0.690, hbp: 0.722, single: 0.881, double: 1.243, triple: 1.569, hr: 2.082 }.freeze

  def woba
    return 0.0 if pa.zero?
    singles = (h - hr - doubles.to_i - triples.to_i).clamp(0, Float::INFINITY)
    numerator = WOBA_WEIGHTS[:bb]     * bb +
                WOBA_WEIGHTS[:hbp]    * hbp.to_i +
                WOBA_WEIGHTS[:single] * singles +
                WOBA_WEIGHTS[:double] * doubles.to_i +
                WOBA_WEIGHTS[:triple] * triples.to_i +
                WOBA_WEIGHTS[:hr]     * hr
    (numerator / pa).round(3)
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

  def bb9
    return 0.0 if outs_pitched.zero?
    (bb_allowed * 27.0 / outs_pitched).round(2)
  end

  def hr9
    return 0.0 if outs_pitched.zero?
    (hr_allowed.to_i * 27.0 / outs_pitched).round(2)
  end

  def k_bb
    return 0.0 if bb_allowed.zero?
    (k_pitched.to_f / bb_allowed).round(2)
  end
end
