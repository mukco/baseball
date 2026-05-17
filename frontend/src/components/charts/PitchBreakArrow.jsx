function movementColor(percentile) {
  if (percentile == null) return '#CBD5E1'
  const pct   = Math.max(0, Math.min(100, percentile)) / 100
  const start = { r: 37, g: 99, b: 235 }
  const end   = { r: 220, g: 38, b: 38 }
  const r = Math.round(start.r + (end.r - start.r) * pct)
  const g = Math.round(start.g + (end.g - start.g) * pct)
  const b = Math.round(start.b + (end.b - start.b) * pct)
  return `rgb(${r}, ${g}, ${b})`
}

function fmt1(v) {
  if (v == null) return null
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(1)}"`
}

export default function PitchBreakArrow({ name, hBreak, vBreak, movementPercentile, size = 56 }) {
  if (hBreak == null || vBreak == null) {
    return <span className="text-content-muted text-xs">—</span>
  }

  const color = movementColor(movementPercentile)
  const cx    = size / 2
  const cy    = size / 2
  const pad   = 8
  const radius    = size / 2 - pad
  const magnitude = Math.hypot(hBreak, vBreak) || 1
  const dirX      = hBreak / magnitude
  const dirY      = -vBreak / magnitude

  const tipX = cx + dirX * (radius - 1)
  const tipY = cy + dirY * (radius - 1)

  const angle  = Math.atan2(tipY - cy, tipX - cx)
  const head   = 7
  const spread = Math.PI / 6
  const h1x = tipX - head * Math.cos(angle - spread)
  const h1y = tipY - head * Math.sin(angle - spread)
  const h2x = tipX - head * Math.cos(angle + spread)
  const h2y = tipY - head * Math.sin(angle + spread)

  const title = movementPercentile != null
    ? `${name || 'Pitch'}: ${movementPercentile}th pct break — H ${fmt1(hBreak)}, V ${fmt1(vBreak)}`
    : `${name || 'Pitch'}: H ${fmt1(hBreak)}, V ${fmt1(vBreak)}`

  return (
    <div className="flex flex-col items-center gap-0.5" title={title}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <rect x="2" y="2" width={size - 4} height={size - 4} rx="9" fill="rgb(var(--color-bg-elevated))" stroke="rgb(var(--color-bg-border))" strokeWidth="1" />
        {/* Axis crosshairs */}
        <line x1={cx} y1={pad - 1} x2={cx} y2={size - pad + 1} stroke="rgb(var(--color-bg-border-strong))" strokeWidth="0.8" />
        <line x1={pad - 1} y1={cy} x2={size - pad + 1} y2={cy} stroke="rgb(var(--color-bg-border-strong))" strokeWidth="0.8" />
        {/* Arrow */}
        <line x1={cx} y1={cy} x2={tipX} y2={tipY} stroke={color} strokeWidth="3" strokeLinecap="round" />
        <polygon points={`${tipX},${tipY} ${h1x},${h1y} ${h2x},${h2y}`} fill={color} />
      </svg>

      {/* H / V values */}
      <div className="flex gap-1.5 text-[10px] font-mono leading-none">
        <span className="text-content-muted">H <span style={{ color }}>{fmt1(hBreak)}</span></span>
        <span className="text-content-muted">V <span style={{ color }}>{fmt1(vBreak)}</span></span>
      </div>

      {movementPercentile != null && (
        <span className="text-[10px] font-semibold leading-none" style={{ color }}>
          {movementPercentile}th
        </span>
      )}
    </div>
  )
}
