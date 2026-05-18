import { useState } from 'react'

// Statcast hc_x / hc_y coordinate space (0–250).
// Home plate ≈ (125, 205). CF ≈ (125, 20). Foul poles ≈ (0, 80) and (250, 80).
// y increases downward (toward home plate), same as SVG origin.
// Scale: ~1 px ≈ 2.14 ft based on CF depth ~400ft mapping to ~187px from plate.

const HP_X = 125, HP_Y = 205
const PX_PER_FT = 187 / 400

// Colorblind-safe: avoids red/green pair (deuteranopia affects ~8% of males).
// HR = orange (unmistakable), 1B = sky blue, 2B = indigo, 3B = amber, Out = gray.
const RESULT_COLORS = {
  single:                    '#0EA5E9',
  double:                    '#6366F1',
  triple:                    '#FBBF24',
  home_run:                  '#F97316',
  field_out:                 '#4B5563',
  force_out:                 '#4B5563',
  grounded_into_double_play: '#4B5563',
  double_play:               '#4B5563',
  sac_fly:                   '#6B7280',
  field_error:               '#A78BFA',
  OTHER:                     '#374151',
}

function resultColor(r) { return RESULT_COLORS[r] || RESULT_COLORS.OTHER }

function resultLabel(r) {
  const MAP = {
    single: '1B', double: '2B', triple: '3B', home_run: 'HR',
    field_out: 'Out', force_out: 'Out', sac_fly: 'SF',
    grounded_into_double_play: 'GDP', double_play: 'DP', field_error: 'E',
  }
  return MAP[r] || r?.replace(/_/g, ' ') || '?'
}

const LEGEND = [
  { key: 'home_run', label: 'HR' },
  { key: 'triple',   label: '3B' },
  { key: 'double',   label: '2B' },
  { key: 'single',   label: '1B' },
  { key: 'field_out', label: 'Out' },
]

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'home_run', label: 'HR' },
  { key: 'xbh',      label: '2B/3B' },
  { key: 'single',   label: '1B' },
  { key: 'out',      label: 'Out' },
]

function matches(filter, result) {
  if (filter === 'all') return true
  if (filter === 'xbh') return result === 'double' || result === 'triple'
  if (filter === 'out') return !['single', 'double', 'triple', 'home_run'].includes(result)
  return result === filter
}

function distanceArc(ft) {
  const r = ft * PX_PER_FT
  // Arc from left foul line angle to right foul line angle (approx ±45° from center)
  // Foul lines in SVG: left goes to (0,80), right to (250,80)
  // Angle from home plate to left foul pole: atan2(80-205, 0-125) ≈ -134°...
  // Let's just use 225° sweep centered on "up" (270° in SVG math)
  const startAngle = 225 * Math.PI / 180
  const endAngle   = 315 * Math.PI / 180
  const x1 = HP_X + r * Math.cos(startAngle)
  const y1 = HP_Y + r * Math.sin(startAngle)
  const x2 = HP_X + r * Math.cos(endAngle)
  const y2 = HP_Y + r * Math.sin(endAngle)
  return `M ${x1.toFixed(1)},${y1.toFixed(1)} A ${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}`
}

// Pull/center/oppo labels based on batter hand
// RHB: pull = left field (low x), oppo = right field (high x)
// LHB: pull = right field (high x), oppo = left field (low x)
function fieldLabels(batSide) {
  if (batSide === 'R') return { left: 'Pull', center: 'Center', right: 'Oppo' }
  if (batSide === 'L') return { left: 'Oppo', center: 'Center', right: 'Pull' }
  return null
}

export default function SprayChart({ data = [], batSide }) {
  const [filter, setFilter] = useState('all')

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-content-muted text-sm">
        No spray data available
      </div>
    )
  }

  const filtered  = data.filter(d => matches(filter, d.result))
  const zoneNames = fieldLabels(batSide)

  return (
    <div className="space-y-3">
      {/* Filter tabs + legend + batter hand badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-0.5">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-[11px] px-2.5 py-1 rounded font-medium transition-colors ${
                filter === key
                  ? 'bg-bg-border text-content-primary'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {batSide && (
            <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              batSide === 'L'
                ? 'text-blue-400 bg-blue-400/10'
                : 'text-red-400  bg-red-400/10'
            }`}>
              Bats {batSide}
            </span>
          )}
          {LEGEND.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: resultColor(key) }} />
              <span className="text-[10px] text-content-muted">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ballpark SVG */}
      <svg
        viewBox="0 0 250 250"
        className="w-full max-w-sm mx-auto block rounded-lg"
        role="img"
        aria-label="Spray chart showing batted ball locations"
      >
        <defs>
          <radialGradient id="spray-field" cx="50%" cy="80%" r="80%">
            <stop offset="0%"   stopColor="rgb(var(--color-bg-elevated))" />
            <stop offset="100%" stopColor="rgb(var(--color-bg-base))" />
          </radialGradient>
          <radialGradient id="spray-fair" cx="50%" cy="82%" r="65%">
            <stop offset="0%"   stopColor="rgb(var(--color-bg-raised))" />
            <stop offset="100%" stopColor="rgb(var(--color-bg-elevated))" />
          </radialGradient>
          <clipPath id="spray-fair-clip">
            <path d="M 125,205 L 0,80 Q 125,18 250,80 Z" />
          </clipPath>
        </defs>

        {/* Foul territory background */}
        <rect x="0" y="0" width="250" height="250" fill="url(#spray-field)" />

        {/* Fair territory wedge */}
        <path d="M 125,205 L 0,80 Q 125,18 250,80 Z" fill="url(#spray-fair)" />
        {/* Subtle grass tint */}
        <path d="M 125,205 L 0,80 Q 125,18 250,80 Z" fill="rgba(34,197,94,0.05)" />

        {/* Distance arcs clipped to fair territory */}
        <g clipPath="url(#spray-fair-clip)">
          <path d={distanceArc(330)} fill="none" stroke="rgb(var(--color-bg-border-strong))" strokeWidth="0.9" strokeDasharray="3 3" strokeOpacity="0.6" />
          <path d={distanceArc(400)} fill="none" stroke="rgb(var(--color-bg-border-strong))" strokeWidth="0.9" strokeDasharray="3 3" strokeOpacity="0.6" />
        </g>

        {/* Distance labels */}
        <text x="125" y={HP_Y - 330 * PX_PER_FT - 3}
          textAnchor="middle" fontSize="7" fill="rgb(var(--color-content-muted))" fillOpacity="0.5" fontFamily="sans-serif">
          330
        </text>
        <text x="125" y={HP_Y - 400 * PX_PER_FT - 3}
          textAnchor="middle" fontSize="7" fill="rgb(var(--color-content-muted))" fillOpacity="0.5" fontFamily="sans-serif">
          400
        </text>

        {/* Subtle infield indicator */}
        <ellipse cx="125" cy="153" rx="58" ry="53" fill="rgb(var(--color-bg-elevated))" fillOpacity="0.5" />

        {/* Infield diamond */}
        <polygon points="125,205 183,147 125,89 67,147" fill="rgb(var(--color-bg-raised))" fillOpacity="0.6" />

        {/* Foul lines */}
        <line x1="125" y1="205" x2="0"   y2="78" stroke="rgb(var(--color-bg-border-strong))" strokeWidth="0.8" strokeOpacity="0.7" />
        <line x1="125" y1="205" x2="250" y2="78" stroke="rgb(var(--color-bg-border-strong))" strokeWidth="0.8" strokeOpacity="0.7" />

        {/* Outfield wall */}
        <path d="M 0,80 Q 125,18 250,80" fill="none" stroke="rgb(var(--color-bg-border-strong))" strokeWidth="1.2" strokeOpacity="0.8" />

        {/* Pitcher's mound */}
        <circle cx="125" cy="165" r="6" fill="rgb(var(--color-bg-border))" />

        {/* Bases */}
        <g transform="rotate(45 183 147)"><rect x="180" y="144" width="6" height="6" fill="rgb(var(--color-content-muted))" /></g>
        <g transform="rotate(45 125 89)"><rect x="122" y="86"  width="6" height="6" fill="rgb(var(--color-content-muted))" /></g>
        <g transform="rotate(45 67 147)"><rect x="64"  y="144" width="6" height="6" fill="rgb(var(--color-content-muted))" /></g>

        {/* Home plate */}
        <polygon points="120,208 130,208 132,204 125,199 118,204" fill="rgb(var(--color-content-muted))" />

        {/* Field zone labels — pull/oppo or LF/CF/RF */}
        {zoneNames ? (
          <>
            <text x="17"  y="73" fill="rgb(var(--color-content-muted))" fillOpacity="0.55" fontSize="8" fontFamily="sans-serif">{zoneNames.left}</text>
            <text x="125" y="22" fill="rgb(var(--color-content-muted))" fillOpacity="0.55" fontSize="8" fontFamily="sans-serif" textAnchor="middle">{zoneNames.center}</text>
            <text x="233" y="73" fill="rgb(var(--color-content-muted))" fillOpacity="0.55" fontSize="8" fontFamily="sans-serif" textAnchor="end">{zoneNames.right}</text>
          </>
        ) : (
          <>
            <text x="17"  y="73" fill="rgb(var(--color-content-muted))" fillOpacity="0.6" fontSize="9" fontFamily="sans-serif">LF</text>
            <text x="119" y="22" fill="rgb(var(--color-content-muted))" fillOpacity="0.6" fontSize="9" fontFamily="sans-serif">CF</text>
            <text x="228" y="73" fill="rgb(var(--color-content-muted))" fillOpacity="0.6" fontSize="9" fontFamily="sans-serif" textAnchor="end">RF</text>
          </>
        )}

        {/* Batted-ball dots */}
        {filtered.map((d, i) => (
          <circle
            key={`${d.x}-${d.y}-${d.result}-${i}`}
            cx={d.x}
            cy={d.y}
            r={d.result === 'home_run' ? 5 : 3.5}
            fill={resultColor(d.result)}
            fillOpacity={0.88}
            stroke={d.result === 'home_run' ? 'rgb(var(--color-bg-surface))' : 'none'}
            strokeWidth="1.5"
          >
            <title>{resultLabel(d.result)}{d.exitVelo ? ` · ${d.exitVelo} mph` : ''}</title>
          </circle>
        ))}
      </svg>

      <p className="text-[10px] text-content-muted text-center">{filtered.length} batted balls</p>
    </div>
  )
}
