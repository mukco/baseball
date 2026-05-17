import { approxPercentile, clamp } from '../../lib/perfUtil'

function zoneColor(percentile) {
  if (percentile >= 90) return { fill: '#DC2626', opacity: 0.22 }
  if (percentile >= 75) return { fill: '#F97316', opacity: 0.20 }
  if (percentile <= 10) return { fill: '#1D4ED8', opacity: 0.22 }
  if (percentile <= 25) return { fill: '#3B82F6', opacity: 0.20 }
  return { fill: '#6B7280', opacity: 0.12 }
}

function pctColor(p) {
  if (p == null) return 'rgb(var(--color-content-muted))'
  if (p >= 85) return 'var(--color-stat-elite)'
  if (p >= 65) return 'var(--color-stat-great)'
  if (p >= 40) return 'var(--color-stat-avg)'
  if (p >= 20) return 'var(--color-stat-below)'
  return 'var(--color-stat-poor)'
}

const VB_W = 320
const VB_H = 68
const PAD_X = 14
const TRACK_Y = 8
const TRACK_H = 26
const TRACK_R = 13
const MARKER_R = 7

const TICKS = [
  { key: 'p10', label: '10' },
  { key: 'p25', label: '25' },
  { key: 'p50', label: '50' },
  { key: 'p75', label: '75' },
  { key: 'p90', label: '90' },
]

export default function BeeswarmChart({ value, label, thresholds, invert = false, format }) {
  if (value == null || !thresholds) {
    return (
      <div className="flex items-center justify-center h-16 text-content-muted text-xs">No percentile data</div>
    )
  }

  const { p50 } = thresholds
  const fmt = format ?? ((v) => (typeof v === 'number' ? v.toFixed(1) : v))
  const percentile = approxPercentile(value, { ...thresholds, invert })
  const numColor = pctColor(percentile)

  const thresholdPoints = TICKS.map(({ key, label: tickLabel }) => ({
    key,
    label: tickLabel,
    value: thresholds[key],
  }))
  const sortedPoints = [...thresholdPoints].sort((a, b) => a.value - b.value)
  const lowerGap = Math.max(Math.abs(sortedPoints[1].value - sortedPoints[0].value), 0.5)
  const upperGap = Math.max(Math.abs(sortedPoints[sortedPoints.length - 1].value - sortedPoints[sortedPoints.length - 2].value), 0.5)
  const domainMin = sortedPoints[0].value - lowerGap * 0.8
  const domainMax = sortedPoints[sortedPoints.length - 1].value + upperGap * 0.8
  const domainRange = domainMax - domainMin || 1
  const markerValue = clamp(value, domainMin, domainMax)

  function mapX(rawValue) {
    return PAD_X + ((rawValue - domainMin) / domainRange) * (VB_W - PAD_X * 2)
  }

  const markerX = mapX(markerValue)
  const bandEdges = [domainMin, ...thresholdPoints.map((point) => point.value), domainMax].sort((a, b) => a - b)
  const bands = bandEdges.slice(0, -1).map((start, index) => {
    const end = bandEdges[index + 1]
    const mid = start + ((end - start) / 2)
    const color = zoneColor(approxPercentile(mid, { ...thresholds, invert }) ?? 50)
    return { start, end, ...color }
  })

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold font-mono" style={{ color: numColor }}>{fmt(value)}</span>
          <span className="text-[11px] text-content-muted uppercase tracking-wider">{label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-content-muted">Median {fmt(p50)}</span>
          {percentile != null && (
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ color: numColor, background: `color-mix(in oklch, ${numColor} 14%, transparent)` }}
            >
              {percentile}th
            </span>
          )}
        </div>
      </div>

      {/* Track */}
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full" role="img" aria-label={`${label} percentile distribution`}>
        {/* Track background */}
        <rect
          x={PAD_X}
          y={TRACK_Y}
          width={VB_W - PAD_X * 2}
          height={TRACK_H}
          rx={TRACK_R}
          fill="rgb(var(--color-bg-elevated))"
          stroke="rgb(var(--color-bg-border))"
          strokeWidth="0.5"
        />

        {/* Zone color bands */}
        {bands.map((band, index) => (
          <rect
            key={`${band.start}-${band.end}-${index}`}
            x={mapX(band.start)}
            y={TRACK_Y}
            width={Math.max(mapX(band.end) - mapX(band.start), 0)}
            height={TRACK_H}
            fill={band.fill}
            fillOpacity={band.opacity}
          />
        ))}

        {/* Threshold tick marks + labels */}
        {thresholdPoints.map((point) => {
          const x = mapX(point.value)
          return (
            <g key={point.key}>
              <line
                x1={x} y1={TRACK_Y + 4}
                x2={x} y2={TRACK_Y + TRACK_H - 4}
                stroke="rgb(var(--color-bg-border-strong))"
                strokeWidth="0.75"
              />
              <text
                x={x}
                y={TRACK_Y + TRACK_H + 13}
                textAnchor="middle"
                fontSize="8"
                fill="rgb(var(--color-content-muted))"
                fontFamily="sans-serif"
              >
                {point.label}
              </text>
            </g>
          )
        })}

        {/* Marker — colored circle, no extending line */}
        <circle
          cx={markerX}
          cy={TRACK_Y + TRACK_H / 2}
          r={MARKER_R}
          fill={numColor}
          stroke="rgb(var(--color-bg-surface))"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  )
}
