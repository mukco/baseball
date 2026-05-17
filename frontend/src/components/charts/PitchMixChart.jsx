import { useMemo } from 'react'

// Baseball Savant official pitch colors
const PITCH_COLORS = {
  FF: '#D22D49', SI: '#FE9D00', FC: '#933F2C',
  SL: '#EEE716', ST: '#D2E338', CU: '#00D1ED',
  KC: '#01C8E3', CH: '#1DBE3A', FS: '#3BACAC',
  KN: '#9C9C9C', EP: '#5A5A5A',
}
function pitchColor(type) { return PITCH_COLORS[type] || '#9CA3AF' }

const CX = 100, CY = 100, OUTER_R = 82, INNER_R = 54, GAP_DEG = 2

function toRad(deg) { return (deg - 90) * Math.PI / 180 }

function donutArc(startDeg, endDeg) {
  if (endDeg - startDeg <= 0) return ''
  const s = toRad(startDeg), e = toRad(endDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  const ox1 = CX + OUTER_R * Math.cos(s), oy1 = CY + OUTER_R * Math.sin(s)
  const ox2 = CX + OUTER_R * Math.cos(e), oy2 = CY + OUTER_R * Math.sin(e)
  const ix2 = CX + INNER_R * Math.cos(e), iy2 = CY + INNER_R * Math.sin(e)
  const ix1 = CX + INNER_R * Math.cos(s), iy1 = CY + INNER_R * Math.sin(s)
  return `M${ox1},${oy1} A${OUTER_R},${OUTER_R} 0 ${large} 1 ${ox2},${oy2} L${ix2},${iy2} A${INNER_R},${INNER_R} 0 ${large} 0 ${ix1},${iy1} Z`
}

export default function PitchMixChart({ pitchTypes = [] }) {
  const slices = useMemo(() => {
    const total = pitchTypes.reduce((s, p) => s + (p.usage || 0), 0)
    if (!total) return []
    let cursor = 0
    return pitchTypes.map(p => {
      const sweep = (p.usage / total) * 360
      const start = cursor + GAP_DEG / 2
      const end   = cursor + sweep - GAP_DEG / 2
      cursor += sweep
      return { ...p, path: donutArc(start, end), sweep }
    })
  }, [pitchTypes])

  if (!slices.length) {
    return <div className="flex items-center justify-center h-48 text-content-muted text-sm">No pitch data</div>
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 200 200" className="w-44 shrink-0">
        <defs>
          {slices.map(s => (
            <radialGradient key={`rg-${s.type}`} id={`rg-${s.type}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={pitchColor(s.type)} stopOpacity="0.7" />
              <stop offset="100%" stopColor={pitchColor(s.type)} stopOpacity="1"   />
            </radialGradient>
          ))}
          <filter id="slice-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.4" />
          </filter>
        </defs>

        {slices.map(s => (
          <path
            key={s.type}
            d={s.path}
            fill={`url(#rg-${s.type})`}
            stroke="#0A0E14"
            strokeWidth="1"
          >
            <title>{s.name}: {s.usage.toFixed(1)}%</title>
          </path>
        ))}

        {/* Center label */}
        <circle cx={CX} cy={CY} r={INNER_R - 2} fill="rgba(10,14,20,0.85)" />
        <text x={CX} y={CY - 7}  textAnchor="middle" fontSize="9"  fill="rgba(255,255,255,0.45)" fontFamily="sans-serif" letterSpacing="1">MIX</text>
        <text x={CX} y={CY + 10} textAnchor="middle" fontSize="16" fill="rgba(255,255,255,0.9)"  fontFamily="monospace" fontWeight="bold">
          {slices.length}
        </text>
        <text x={CX} y={CY + 22} textAnchor="middle" fontSize="8"  fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">pitches</text>
      </svg>

      {/* Legend */}
      <div className="w-full grid grid-cols-2 gap-x-4 gap-y-1.5">
        {slices.map(s => (
          <div key={s.type} className="flex items-center gap-2 min-w-0">
            <div
              className="w-2 h-2 rounded-sm shrink-0"
              style={{ backgroundColor: pitchColor(s.type) }}
            />
            <span className="text-[10px] text-content-secondary truncate flex-1">{s.name || s.type}</span>
            <span className="text-[10px] font-mono text-content-muted shrink-0">{s.usage.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
