import { useState, useMemo } from 'react'

// Baseball Savant pitch colors
const PITCH_COLORS = {
  FF: '#D22D49', SI: '#FE9D00', FC: '#933F2C',
  SL: '#EEE716', ST: '#D2E338', CU: '#00D1ED',
  KC: '#01C8E3', CH: '#1DBE3A', FS: '#3BACAC',
  KN: '#9C9C9C', EP: '#5A5A5A',
}
function pitchColor(type) { return PITCH_COLORS[type] || '#9CA3AF' }

// 5×5 zone grid boundaries (feet, catcher's perspective)
// plate_x: negative = catcher's left = inside to RHB
// plate_z: height from ground
const X_BOUNDS = [-1.5, -0.71, -0.24, 0.24, 0.71, 1.5]
const Z_BOUNDS = [4.2,   3.5,  2.83, 2.17,  1.5, 0.8]

// Inner 3×3 (rows 1–3, cols 1–3) = strike zone
function inSZ(row, col) { return row >= 1 && row <= 3 && col >= 1 && col <= 3 }

const SWING_SET = new Set([
  'swinging_strike', 'swinging_strike_blocked',
  'foul', 'foul_tip',
  'hit_into_play', 'hit_into_play_no_out', 'hit_into_play_score',
])
const WHIFF_SET = new Set(['swinging_strike', 'swinging_strike_blocked'])

// SVG coordinate space
const VB_W = 200
const VB_H = 248

function mapX(px) {
  return ((px - X_BOUNDS[0]) / (X_BOUNDS.at(-1) - X_BOUNDS[0])) * VB_W
}
function mapZ(pz) {
  return 10 + ((Z_BOUNDS[0] - pz) / (Z_BOUNDS[0] - Z_BOUNDS.at(-1))) * 205
}

// Pre-compute zone boundary positions in SVG space
const SX = X_BOUNDS.map(mapX)  // col dividers
const SZ = Z_BOUNDS.map(mapZ)  // row dividers

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

function zoneFill(ratio, hex) {
  if (ratio <= 0.005) return null
  if (hex) {
    const a = Math.round(Math.min(0.12 + ratio * 0.78, 0.9) * 255)
    return hex + a.toString(16).padStart(2, '0')
  }
  // All-pitches heat: blue → red via HSL
  const hue = Math.round(220 - ratio * 220)
  return `hsla(${hue},80%,55%,${(0.12 + ratio * 0.73).toFixed(2)})`
}

export default function PitchLocationChart({ locationData = [], pitchTypes = [] }) {
  const [sel, setSel] = useState('all')

  const pitches = useMemo(
    () => (sel === 'all' ? locationData : locationData.filter(p => p.type === sel)),
    [locationData, sel]
  )

  const grid = useMemo(() => buildGrid(pitches), [pitches])

  const maxN = useMemo(() => {
    let m = 0
    grid.forEach(row => row.forEach(z => { if (z.n > m) m = z.n }))
    return m
  }, [grid])

  const hex = sel !== 'all' ? pitchColor(sel) : null

  const stats = useMemo(() => {
    let inZ = 0, total = 0, sw = 0, wh = 0
    grid.forEach((row, ri) => row.forEach((cell, ci) => {
      total += cell.n
      sw += cell.sw
      wh += cell.wh
      if (inSZ(ri, ci)) inZ += cell.n
    }))
    return {
      total,
      inZonePct: total > 0 ? Math.round(inZ / total * 100) : null,
      whiffPct:  sw > 0    ? Math.round(wh / sw * 100) : null,
    }
  }, [grid])

  const avgPt = useMemo(() => {
    if (!pitches.length) return null
    return {
      px: pitches.reduce((s, p) => s + p.px, 0) / pitches.length,
      pz: pitches.reduce((s, p) => s + p.pz, 0) / pitches.length,
    }
  }, [pitches])

  if (!locationData.length) {
    return (
      <div className="flex items-center justify-center h-40 text-content-muted text-sm">
        No location data available
      </div>
    )
  }

  const szLeft = SX[1], szRight = SX[4], szTop = SZ[1], szBottom = SZ[4]
  const szW = szRight - szLeft, szH = szBottom - szTop

  const selPitchType = pitchTypes.find(p => p.type === sel)

  return (
    <div className="space-y-3">
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
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium transition-all"
            style={{
              backgroundColor: sel === pt.type ? pitchColor(pt.type) + '28' : 'transparent',
              color:            sel === pt.type ? pitchColor(pt.type) : '#6B7280',
              outline:          sel === pt.type ? `1px solid ${pitchColor(pt.type)}55` : 'none',
            }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0 inline-block"
              style={{ backgroundColor: pitchColor(pt.type) }}
            />
            {pt.name || pt.type}
          </button>
        ))}
      </div>

      <div className="flex gap-5 items-start">
        {/* Zone heatmap */}
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-44 shrink-0 block"
        >
          <rect width={VB_W} height={VB_H} rx="4" fill="#0A0E14" />

          {/* Zone cells — render before strike zone border so it sits on top */}
          {grid.map((row, ri) =>
            row.map((cell, ci) => {
              const fill = zoneFill(maxN > 0 ? cell.n / maxN : 0, hex)
              if (!fill) return null
              return (
                <rect
                  key={`z${ri}${ci}`}
                  x={SX[ci]} y={SZ[ri]}
                  width={SX[ci + 1] - SX[ci]}
                  height={SZ[ri + 1] - SZ[ri]}
                  fill={fill}
                  rx="1"
                >
                  <title>
                    {cell.n} pitches
                    {cell.sw > 0 ? ` · ${Math.round(cell.wh / cell.sw * 100)}% whiff` : ''}
                  </title>
                </rect>
              )
            })
          )}

          {/* Faint outer zone border */}
          <rect
            x={SX[0]} y={SZ[0]}
            width={SX[5] - SX[0]} height={SZ[5] - SZ[0]}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.7"
          />

          {/* Strike zone border */}
          <rect
            x={szLeft} y={szTop} width={szW} height={szH}
            fill="none"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="1.5"
          />

          {/* Inner 3×3 grid lines */}
          {[2, 3].map(i => (
            <line
              key={`v${i}`}
              x1={SX[i]} y1={szTop} x2={SX[i]} y2={szBottom}
              stroke="rgba(255,255,255,0.22)" strokeWidth="0.7"
            />
          ))}
          {[2, 3].map(i => (
            <line
              key={`h${i}`}
              x1={szLeft} y1={SZ[i]} x2={szRight} y2={SZ[i]}
              stroke="rgba(255,255,255,0.22)" strokeWidth="0.7"
            />
          ))}

          {/* Pitch counts inside strike zone cells */}
          {grid.map((row, ri) =>
            row.map((cell, ci) => {
              if (!inSZ(ri, ci) || cell.n === 0) return null
              return (
                <text
                  key={`t${ri}${ci}`}
                  x={(SX[ci] + SX[ci + 1]) / 2}
                  y={(SZ[ri] + SZ[ri + 1]) / 2 + 4}
                  textAnchor="middle"
                  fontSize="10"
                  fontFamily="monospace"
                  fill="rgba(255,255,255,0.75)"
                >
                  {cell.n}
                </text>
              )
            })
          )}

          {/* Average location marker */}
          {avgPt && (
            <circle
              cx={mapX(avgPt.px)}
              cy={mapZ(avgPt.pz)}
              r="5"
              fill={hex || 'white'}
              fillOpacity="0.92"
              stroke="#000"
              strokeWidth="1.2"
            />
          )}

          {/* Home plate indicator */}
          <polygon
            points={`${VB_W / 2 - 11},${VB_H - 7} ${VB_W / 2 + 11},${VB_H - 7} ${VB_W / 2 + 14},${VB_H - 17} ${VB_W / 2},${VB_H - 25} ${VB_W / 2 - 14},${VB_H - 17}`}
            fill="rgba(255,255,255,0.55)"
          />

          {/* Perspective labels */}
          <text x="2" y={VB_H - 3} fontSize="7.5" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">LHB side</text>
          <text x={VB_W - 2} y={VB_H - 3} fontSize="7.5" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" textAnchor="end">RHB side</text>
        </svg>

        {/* Stats panel */}
        <div className="flex-1 space-y-4 text-sm pt-1 min-w-0">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-content-muted font-semibold mb-0.5">
              {sel === 'all' ? 'All Pitches' : (selPitchType?.name || sel)}
            </div>
            <div className="text-3xl font-bold font-mono text-content-primary leading-none">{stats.total}</div>
            <div className="text-[11px] text-content-muted mt-0.5">pitches</div>
          </div>

          {stats.inZonePct != null && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-content-muted font-semibold">Zone%</div>
              <div className="text-xl font-bold font-mono text-content-primary">{stats.inZonePct}%</div>
            </div>
          )}

          {stats.whiffPct != null && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-content-muted font-semibold">Whiff%</div>
              <div className="text-xl font-bold font-mono text-content-primary">{stats.whiffPct}%</div>
            </div>
          )}

          {selPitchType && (
            <div className="space-y-1 pt-2 border-t border-bg-border/40 text-[11px] text-content-muted">
              {selPitchType.avgVelo  && <div>{selPitchType.avgVelo} mph avg velo</div>}
              {selPitchType.avgSpin  && <div>{selPitchType.avgSpin} rpm spin</div>}
              {selPitchType.usage    && <div>{selPitchType.usage}% usage</div>}
            </div>
          )}

          {/* Color scale */}
          <div>
            <div className="text-[9px] text-content-muted mb-1">Density</div>
            <div className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-16 rounded-sm shrink-0"
                style={{
                  background: hex
                    ? `linear-gradient(to right, transparent, ${hex})`
                    : 'linear-gradient(to right, hsla(220,80%,55%,0.15), hsla(0,80%,55%,0.85))',
                }}
              />
              <span className="text-[9px] text-content-muted">Low → High</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
