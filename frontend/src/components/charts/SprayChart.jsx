import { useState } from 'react'

// Baseball Savant hc_x / hc_y coordinate space (0–250).
// Home plate ≈ (125, 205). CF ≈ (125, 20). Foul poles ≈ (0, 80) and (250, 80).
// y increases downward (toward home plate), same as SVG origin.

const RESULT_COLORS = {
  single:                    '#22C55E',
  double:                    '#3B82F6',
  triple:                    '#FBBF24',
  home_run:                  '#EF4444',
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
  if (filter === 'xbh')  return result === 'double' || result === 'triple'
  if (filter === 'out')  return !['single', 'double', 'triple', 'home_run'].includes(result)
  return result === filter
}

export default function SprayChart({ data = [] }) {
  const [filter, setFilter] = useState('all')

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-content-muted text-sm">
        No spray data available
      </div>
    )
  }

  const filtered = data.filter(d => matches(filter, d.result))

  return (
    <div className="space-y-3">
      {/* Filter tabs + legend */}
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
        <div className="flex gap-3 flex-wrap">
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
        className="w-full max-w-sm mx-auto block"
        style={{ borderRadius: 8 }}
      >
        {/* Foul territory / sky */}
        <rect x="0" y="0" width="250" height="250" fill="#0D1F10" />

        {/* Fair territory grass — fan from home plate through foul poles to arc */}
        <path d="M 125,205 L 0,80 Q 125,18 250,80 Z" fill="#1B5C28" />

        {/* Warning track */}
        <path
          d="M 8,82 Q 125,21 242,82"
          fill="none"
          stroke="#7A5C30"
          strokeWidth="10"
          strokeOpacity="0.5"
        />

        {/* Infield grass oval */}
        <ellipse cx="125" cy="153" rx="58" ry="53" fill="#236B2F" />

        {/* Infield dirt */}
        <polygon points="125,205 183,147 125,89 67,147" fill="#9B7540" />

        {/* Foul lines */}
        <line x1="125" y1="205" x2="0"   y2="78" stroke="white" strokeWidth="0.8" strokeOpacity="0.4" />
        <line x1="125" y1="205" x2="250" y2="78" stroke="white" strokeWidth="0.8" strokeOpacity="0.4" />

        {/* Outfield wall */}
        <path d="M 0,80 Q 125,18 250,80" fill="none" stroke="white" strokeWidth="1.2" strokeOpacity="0.5" />

        {/* Pitcher's mound */}
        <circle cx="125" cy="165" r="7" fill="#9B7540" stroke="#7A5C30" strokeWidth="0.8" />

        {/* Bases (rotated squares) */}
        <g transform="rotate(45 183 147)"><rect x="180" y="144" width="6" height="6" fill="white" /></g>
        <g transform="rotate(45 125 89)"><rect x="122" y="86"  width="6" height="6" fill="white" /></g>
        <g transform="rotate(45 67 147)"><rect x="64"  y="144" width="6" height="6" fill="white" /></g>

        {/* Home plate (pentagon) */}
        <polygon points="120,208 130,208 132,204 125,199 118,204" fill="white" />

        {/* Field labels */}
        <text x="17"  y="73" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="sans-serif">LF</text>
        <text x="119" y="22" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="sans-serif">CF</text>
        <text x="228" y="73" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="sans-serif">RF</text>

        {/* Batted-ball dots — rendered last so they sit on top */}
        {filtered.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.result === 'home_run' ? 4.5 : 3.5}
            fill={resultColor(d.result)}
            fillOpacity={0.85}
            stroke={d.result === 'home_run' ? 'rgba(255,255,255,0.45)' : 'none'}
            strokeWidth="0.8"
          >
            <title>{resultLabel(d.result)}{d.exitVelo ? ` · ${d.exitVelo} mph` : ''}</title>
          </circle>
        ))}
      </svg>

      <p className="text-[10px] text-content-muted text-center">{filtered.length} batted balls</p>
    </div>
  )
}
