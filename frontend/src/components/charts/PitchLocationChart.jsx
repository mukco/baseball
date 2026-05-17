import { useEffect, useState, useMemo } from 'react'
import { pitchColor } from '../../lib/pitchColors'

const X_BOUNDS = [-1.5, -0.71, -0.24, 0.24, 0.71, 1.5]
const Z_BOUNDS = [4.2, 3.5, 2.83, 2.17, 1.5, 0.8]

function inSZ(row, col) { return row >= 1 && row <= 3 && col >= 1 && col <= 3 }

const SWING_SET = new Set([
  'swinging_strike', 'swinging_strike_blocked',
  'foul', 'foul_tip',
  'hit_into_play', 'hit_into_play_no_out', 'hit_into_play_score',
])
const WHIFF_SET = new Set(['swinging_strike', 'swinging_strike_blocked'])

function buildGrid(pitches) {
  const g = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => ({ n: 0, sw: 0, wh: 0 }))
  )
  for (const p of pitches) {
    let col = 4
    for (let i = 1; i < X_BOUNDS.length; i++) {
      if (p.px < X_BOUNDS[i]) { col = i - 1; break }
    }
    let row = 4
    for (let i = 1; i < Z_BOUNDS.length; i++) {
      if (p.pz >= Z_BOUNDS[i]) { row = i - 1; break }
    }
    if (row < 5 && col < 5) {
      g[row][col].n++
      if (SWING_SET.has(p.desc)) g[row][col].sw++
      if (WHIFF_SET.has(p.desc)) g[row][col].wh++
    }
  }
  return g
}

const CELL = 46

// Catcher's perspective: negative px = left = RHP arm side / LHP glove side
const HAND_LABELS = {
  R: { left: 'Arm', right: 'Glove' },
  L: { left: 'Glove', right: 'Arm' },
}

// swing/whiff use fixed semantic colors; density uses the selected pitch color
const METRIC_COLORS = {
  swing: [251, 191, 36],
  whiff: [239, 68, 68],
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function cellColor(cell, metric, maxDensity, densityRgb) {
  if (cell.n === 0) return 'transparent'

  let intensity
  if (metric === 'density') {
    intensity = maxDensity > 0 ? cell.n / maxDensity : 0
  } else if (metric === 'swing') {
    intensity = cell.sw / cell.n
  } else {
    intensity = cell.sw > 0 ? cell.wh / cell.sw : 0
  }

  const [r, g, b] = metric === 'density' ? densityRgb : METRIC_COLORS[metric]
  const alpha = intensity === 0 ? 0.06 : 0.12 + intensity * 0.8
  return `rgba(${r}, ${g}, ${b}, ${Math.min(0.92, alpha)})`
}

function cellLabel(cell, metric) {
  if (cell.n === 0) return ''
  if (metric === 'density') return ''
  if (metric === 'swing')   return cell.n > 0 ? `${Math.round(cell.sw / cell.n * 100)}%` : ''
  return cell.sw > 0 ? `${Math.round(cell.wh / cell.sw * 100)}%` : ''
}

export default function PitchLocationChart({ locationData = [], pitchTypes = [], pitchHand }) {
  const [sel, setSel]       = useState('all')
  const [metric, setMetric] = useState('density')

  useEffect(() => {
    if (sel !== 'all' && !pitchTypes.some(pt => pt.type === sel)) setSel('all')
  }, [pitchTypes, sel])

  const pitches = useMemo(
    () => (sel === 'all' ? locationData : locationData.filter(p => p.type === sel)),
    [locationData, sel]
  )

  const grid = useMemo(() => buildGrid(pitches), [pitches])

  const maxDensity = useMemo(() => {
    let m = 0
    grid.forEach(row => row.forEach(c => { if (c.n > m) m = c.n }))
    return m
  }, [grid])

  const stats = useMemo(() => {
    let inZ = 0, total = 0, sw = 0, wh = 0
    grid.forEach((row, ri) => row.forEach((cell, ci) => {
      total += cell.n
      sw    += cell.sw
      wh    += cell.wh
      if (inSZ(ri, ci)) inZ += cell.n
    }))
    return {
      total,
      inZonePct: total > 0 ? Math.round(inZ / total * 100) : null,
      swingPct:  total > 0 ? Math.round(sw   / total * 100) : null,
      whiffPct:  sw   > 0 ? Math.round(wh   / sw    * 100) : null,
    }
  }, [grid])

  const handLabels  = HAND_LABELS[pitchHand] ?? null
  const gridPx      = CELL * 5
  // Use the selected pitch's color for density; fall back to neutral slate
  const densityRgb  = useMemo(() => {
    if (sel === 'all') return [100, 116, 139]  // slate-500 — neutral, fits both themes
    return hexToRgb(pitchColor(sel))
  }, [sel])

  if (!locationData.length) {
    return (
      <div className="flex items-center justify-center h-40 text-content-muted text-sm">
        No location data available
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Pitch type filter */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setSel('all')}
          className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
            sel === 'all'
              ? 'bg-bg-border text-content-primary'
              : 'text-content-muted hover:text-content-secondary'
          }`}
        >
          All
        </button>
        {pitchTypes.map(pt => (
          <button
            key={pt.type}
            onClick={() => setSel(sel === pt.type ? 'all' : pt.type)}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium transition-all ${
              sel !== pt.type ? 'text-content-muted hover:text-content-secondary' : ''
            }`}
            style={sel === pt.type ? {
              backgroundColor: pitchColor(pt.type) + '28',
              color:           pitchColor(pt.type),
              outline:         `1px solid ${pitchColor(pt.type)}55`,
            } : undefined}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0 inline-block"
              style={{ backgroundColor: pitchColor(pt.type) }}
            />
            {pt.name || pt.type}
          </button>
        ))}
      </div>

      {/* Chart area */}
      <div className="flex flex-col items-center gap-2">

        {/* Header row: side labels + handedness badge */}
        <div
          className="flex items-center justify-between w-full"
          style={{ maxWidth: gridPx + 88 }}
        >
          <div className="w-10 text-center">
            {handLabels && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-content-muted leading-tight block">
                {handLabels.left}<br />Side
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-0.5">
            {pitchHand && (
              <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                pitchHand === 'L'
                  ? 'text-blue-400 bg-blue-400/10'
                  : 'text-red-400  bg-red-400/10'
              }`}>
                {pitchHand === 'L' ? 'LHP' : 'RHP'}
              </span>
            )}
            <span className="text-[10px] text-content-muted uppercase tracking-wider">
              Catcher's view
            </span>
          </div>

          <div className="w-10 text-center">
            {handLabels && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-content-muted leading-tight block">
                {handLabels.right}<br />Side
              </span>
            )}
          </div>
        </div>

        {/* Grid */}
        <div className="relative" style={{ width: gridPx, height: gridPx }}>
          {/* Strike zone outline */}
          <div
            className="absolute border-2 border-content-muted/30 pointer-events-none z-10"
            style={{
              left:   CELL,
              top:    CELL,
              width:  CELL * 3,
              height: CELL * 3,
            }}
          />

          {/* Cells */}
          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(5, ${CELL}px)`,
              gridTemplateRows:    `repeat(5, ${CELL}px)`,
            }}
          >
            {grid.map((row, ri) =>
              row.map((cell, ci) => {
                const bg    = cellColor(cell, metric, maxDensity, densityRgb)
                const label = cellLabel(cell, metric)
                const sz    = inSZ(ri, ci)
                return (
                  <div
                    key={`${ri}-${ci}`}
                    title={`${cell.n} pitches · ${cell.sw} swings · ${cell.wh} whiffs`}
                    className={`flex items-center justify-center ${sz ? '' : 'opacity-75'}`}
                    style={{ backgroundColor: bg }}
                  >
                    {label !== '' && (
                      <span className="text-[10px] font-mono font-semibold select-none text-content-primary">
                        {label}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Metric toggle */}
        <div className="flex gap-1">
          {[
            { key: 'density', label: 'Density' },
            { key: 'swing',   label: 'Swing%'  },
            { key: 'whiff',   label: 'Whiff%'  },
          ].map(m => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`text-[11px] px-2.5 py-1 rounded font-medium transition-colors ${
                metric === m.key
                  ? 'bg-bg-border text-content-primary'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex items-center justify-center gap-5 text-center">
        <div>
          <div className="text-[10px] text-content-muted uppercase tracking-wider mb-0.5">Total</div>
          <div className="text-base font-semibold font-mono text-content-primary">{stats.total}<span className="text-[11px] font-normal text-content-muted ml-1">pitches</span></div>
        </div>
        {stats.inZonePct != null && (
          <div>
            <div className="text-[10px] text-content-muted uppercase tracking-wider mb-0.5">Zone%</div>
            <div className="text-base font-semibold font-mono text-content-primary">{stats.inZonePct}%</div>
          </div>
        )}
        {stats.swingPct != null && (
          <div>
            <div className="text-[10px] text-content-muted uppercase tracking-wider mb-0.5">Swing%</div>
            <div className="text-base font-semibold font-mono text-content-primary">{stats.swingPct}%</div>
          </div>
        )}
        {stats.whiffPct != null && (
          <div>
            <div className="text-[10px] text-content-muted uppercase tracking-wider mb-0.5">Whiff%</div>
            <div className="text-base font-semibold font-mono text-content-primary">{stats.whiffPct}%</div>
          </div>
        )}
      </div>
    </div>
  )
}
