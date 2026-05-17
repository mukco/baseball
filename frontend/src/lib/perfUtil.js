export function approxPercentile(value, thresholds) {
  if (value == null || thresholds == null) return null

  const { p10, p25, p50, p75, p90, invert } = thresholds

  if (p10 <= p25 && p25 <= p50 && p50 <= p75 && p75 <= p90) {
    let pct
    if (value <= p10) pct = 10
    else if (value <= p25) pct = Math.round(10 + ((value - p10) / (p25 - p10)) * 15)
    else if (value <= p50) pct = Math.round(25 + ((value - p25) / (p50 - p25)) * 25)
    else if (value <= p75) pct = Math.round(50 + ((value - p50) / (p75 - p50)) * 25)
    else if (value <= p90) pct = Math.round(75 + ((value - p75) / (p90 - p75)) * 15)
    else pct = 90
    return invert ? 100 - pct : pct
  }

  if (p10 >= p25 && p25 >= p50 && p50 >= p75 && p75 >= p90) {
    let pct
    if (value >= p10) pct = 10
    else if (value >= p25) pct = Math.round(10 + ((p10 - value) / (p10 - p25)) * 15)
    else if (value >= p50) pct = Math.round(25 + ((p25 - value) / (p25 - p50)) * 25)
    else if (value >= p75) pct = Math.round(50 + ((p50 - value) / (p50 - p75)) * 25)
    else if (value >= p90) pct = Math.round(75 + ((p75 - value) / (p75 - p90)) * 15)
    else pct = 90
    return pct
  }

  return null
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}
