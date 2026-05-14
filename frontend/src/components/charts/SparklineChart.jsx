// Inline micro line chart — no axes, just the trend shape with gradient fill.
export default function SparklineChart({ data = [], valueKey = 'value', color = '#6366F1', width = 80, height = 28 }) {
  const vals = data.map(d => Number(d[valueKey])).filter(Number.isFinite)
  if (vals.length < 2) return null

  const min   = Math.min(...vals)
  const max   = Math.max(...vals)
  const range = max - min || 1
  const id    = `spark-${valueKey}-${width}`

  function mapY(v) { return 2 + (1 - (v - min) / range) * (height - 4) }

  const pts = vals.map((v, i) => ({
    x: (i / (vals.length - 1)) * (width - 4) + 2,
    y: mapY(v),
  }))

  const linePts  = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const fillPts  = [`2,${height}`, ...pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`), `${(width - 2).toFixed(1)},${height}`].join(' ')
  const lastX    = pts.at(-1).x
  const lastY    = pts.at(-1).y

  // Determine trend direction for glow color
  const trend      = vals.at(-1) - vals.at(-3 > -vals.length ? -3 : 0)
  const dotColor   = trend >= 0 ? color : '#EF4444'

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Fill area */}
      <polygon points={fillPts} fill={`url(#${id})`} />

      {/* Line */}
      <polyline
        points={linePts}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Last-value dot */}
      <circle cx={lastX} cy={lastY} r="2.5" fill={dotColor} />
    </svg>
  )
}
