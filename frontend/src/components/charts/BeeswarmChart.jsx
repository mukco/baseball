import { useMemo } from 'react'

// Seeded LCG — stable across renders for same thresholds
function seededRand(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff }
}
function seededRandn(rand) {
  const u = Math.max(rand(), 1e-10), v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function syntheticLeague(thresholds, n = 150) {
  const { p25, p50, p75 } = thresholds
  const sigma = (p75 - p25) / 1.35 || 1
  const rand = seededRand(7919)
  return Array.from({ length: n }, () => p50 + seededRandn(rand) * sigma)
}

// Column-bucketing beeswarm: stack dots per x-bucket
function layoutBeeswarm(values, mapX, r, totalH) {
  const buckets = {}
  return values.map(v => {
    const x = mapX(v)
    const col = Math.round(x / (r * 2.3))
    if (!buckets[col]) buckets[col] = 0
    const idx = buckets[col]++
    const dir = idx % 2 === 0 ? 1 : -1
    const offset = Math.ceil(idx / 2) * r * 2.3 * dir
    return { v, x, y: totalH / 2 + offset }
  })
}

// Color a league dot by its percentile zone
function dotColor(v, thresholds, invert) {
  const { p10, p25, p75, p90 } = thresholds
  const above = (threshold) => invert ? v <= threshold : v >= threshold
  if (above(p90)) return '#DC2626'
  if (above(p75)) return '#F97316'
  if (!invert ? v < p10 : v > p90) return '#1D4ED8'
  if (!invert ? v < p25 : v > p75) return '#3B82F6'
  return '#6B7280'
}

const VB_W = 300
const LANE_H = 60
const LABEL_H = 20
const VB_H = LANE_H + LABEL_H
const PAD_X = 14
const DOT_R = 2.8
const PLAYER_R = 7

// Percentile zone background regions
const ZONE_BANDS = [
  { fromKey: 'domainMin', toKey: 'p10',  color: '#1D4ED8', opacity: 0.10 },
  { fromKey: 'p10',       toKey: 'p25',  color: '#3B82F6', opacity: 0.08 },
  { fromKey: 'p25',       toKey: 'p75',  color: '#4B5563', opacity: 0.06 },
  { fromKey: 'p75',       toKey: 'p90',  color: '#F97316', opacity: 0.08 },
  { fromKey: 'p90',       toKey: 'domainMax', color: '#DC2626', opacity: 0.10 },
]

const TICKS = [
  { key: 'p10', label: '10th' },
  { key: 'p25', label: '25th' },
  { key: 'p50', label: '50th' },
  { key: 'p75', label: '75th' },
  { key: 'p90', label: '90th' },
]

export default function BeeswarmChart({ value, label, thresholds, invert = false, format }) {
  if (value == null || !thresholds) return null

  const { p10, p25, p50, p75, p90 } = thresholds
  const domainMin = p10 - (p50 - p10) * 0.3
  const domainMax = p90 + (p90 - p50) * 0.3
  const domainKeys = { domainMin, p10, p25, p50, p75, p90, domainMax }

  function mapX(v) {
    return PAD_X + ((v - domainMin) / (domainMax - domainMin)) * (VB_W - PAD_X * 2)
  }

  const leagueVals = useMemo(() => syntheticLeague(thresholds), [p25, p50, p75])
  const dots = useMemo(
    () => layoutBeeswarm(leagueVals, mapX, DOT_R, LANE_H),
    [leagueVals, domainMin, domainMax]
  )

  const playerX = mapX(value)
  const fmt = format ?? (v => (typeof v === 'number' ? v.toFixed(1) : v))
  const playerColor = dotColor(value, thresholds, invert)

  return (
    <div>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full overflow-visible">
        <defs>
          <filter id="player-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <radialGradient id="player-fill" cx="40%" cy="35%" r="60%">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor={playerColor} stopOpacity="1" />
          </radialGradient>
        </defs>

        {/* Zone background bands */}
        {ZONE_BANDS.map((z, i) => {
          const x1 = mapX(domainKeys[z.fromKey])
          const x2 = mapX(domainKeys[z.toKey])
          return (
            <rect
              key={i}
              x={x1} y={0}
              width={Math.max(0, x2 - x1)} height={LANE_H}
              fill={z.color} fillOpacity={z.opacity}
            />
          )
        })}

        {/* League dots — colored by zone */}
        {dots.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={Math.max(DOT_R + 1, Math.min(LANE_H - DOT_R - 1, pt.y))}
            r={DOT_R}
            fill={dotColor(pt.v, thresholds, invert)}
            fillOpacity={0.45}
          />
        ))}

        {/* Percentile tick lines */}
        {TICKS.map(({ key, label: tlabel }) => (
          <g key={key}>
            <line
              x1={mapX(domainKeys[key])} y1={0}
              x2={mapX(domainKeys[key])} y2={LANE_H}
              stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" strokeDasharray="2 2"
            />
            <text
              x={mapX(domainKeys[key])} y={LANE_H + 13}
              textAnchor="middle" fontSize={6.5}
              fill="rgba(255,255,255,0.3)" fontFamily="sans-serif"
            >
              {tlabel}
            </text>
          </g>
        ))}

        {/* Player dot glow layer */}
        <circle
          cx={playerX} cy={LANE_H / 2}
          r={PLAYER_R + 4}
          fill={playerColor} fillOpacity={0.25}
          filter="url(#player-glow)"
        />
        {/* Player dot */}
        <circle
          cx={playerX} cy={LANE_H / 2}
          r={PLAYER_R}
          fill="url(#player-fill)"
          stroke="rgba(255,255,255,0.8)" strokeWidth="1.2"
        />

        {/* Player value label */}
        <text
          x={Math.max(22, Math.min(VB_W - 22, playerX))}
          y={LANE_H + 13}
          textAnchor="middle" fontSize={9.5}
          fill={playerColor}
          fontFamily="monospace" fontWeight="bold"
        >
          {fmt(value)}
        </text>
      </svg>

      <p className="text-[10px] text-content-muted text-center -mt-0.5 pb-1">
        {label}
      </p>
    </div>
  )
}
