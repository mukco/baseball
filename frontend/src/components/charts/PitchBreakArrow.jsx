// Arrow compass for a single pitch's break profile.
// White arrow + colored glow so it's legible across all pitch colors and sizes.
// Outer ring = total movement percentile zone.

const PITCH_COLORS = {
  FF: '#D22D49', SI: '#FE9D00', FC: '#933F2C',
  SL: '#EEE716', ST: '#D2E338', CU: '#00D1ED',
  KC: '#01C8E3', CH: '#1DBE3A', FS: '#3BACAC',
  KN: '#9C9C9C', EP: '#5A5A5A',
}
function pitchColor(type) { return PITCH_COLORS[type] || '#9CA3AF' }

function movementZoneColor(totalIn) {
  if (totalIn >= 28) return '#DC2626'
  if (totalIn >= 20) return '#F97316'
  if (totalIn >= 12) return '#6B7280'
  if (totalIn >= 6)  return '#3B82F6'
  return '#1D4ED8'
}

export default function PitchBreakArrow({ type, hBreak, vBreak, size = 52 }) {
  if (hBreak == null || vBreak == null) {
    return <span className="text-content-muted text-xs">—</span>
  }

  const color  = pitchColor(type)
  const filterId = `aglow-${type}`

  const cx    = size / 2
  const cy    = size / 2
  const maxR  = size / 2 - 10   // usable arrow radius
  const ref   = 28              // total inches at which arrow reaches maxR

  const total = Math.sqrt(hBreak * hBreak + vBreak * vBreak)
  const scale = Math.min(total / ref, 1.0)

  // Arrow tip (SVG y inverted: positive vBreak → upward → negative dy)
  const tipX = cx + (hBreak / ref) * maxR
  const tipY = cy - (vBreak / ref) * maxR

  // Arrowhead — standard atan2 geometry
  const angle   = Math.atan2(tipY - cy, tipX - cx)
  const headLen = 7
  const spread  = Math.PI / 5
  const h1x = tipX - headLen * Math.cos(angle - spread)
  const h1y = tipY - headLen * Math.sin(angle - spread)
  const h2x = tipX - headLen * Math.cos(angle + spread)
  const h2y = tipY - headLen * Math.sin(angle + spread)

  const zoneColor = movementZoneColor(total)

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          {/* Colored glow behind the white arrow — preserves pitch identity */}
          <filter id={filterId} x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.8"
              floodColor={color} floodOpacity="1" />
          </filter>
        </defs>

        {/* Percentile zone ring */}
        <circle cx={cx} cy={cy} r={size / 2 - 1}
          fill="none" stroke={zoneColor} strokeWidth={3} opacity={0.6} />

        {/* Dark face */}
        <circle cx={cx} cy={cy} r={size / 2 - 4} fill="#0C1017" />

        {/* Crosshair — slightly brighter so direction context is readable */}
        <line x1={cx} y1={cy - maxR} x2={cx} y2={cy + maxR}
          stroke="rgba(255,255,255,0.12)" strokeWidth={0.7} />
        <line x1={cx - maxR} y1={cy} x2={cx + maxR} y2={cy}
          stroke="rgba(255,255,255,0.12)" strokeWidth={0.7} />

        {/* Cardinal tick marks */}
        {[0, 90, 180, 270].map(deg => {
          const rad = (deg * Math.PI) / 180
          const x1 = cx + (maxR - 1) * Math.cos(rad)
          const y1 = cy + (maxR - 1) * Math.sin(rad)
          const x2 = cx + (maxR + 2.5) * Math.cos(rad)
          const y2 = cy + (maxR + 2.5) * Math.sin(rad)
          return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="rgba(255,255,255,0.2)" strokeWidth={0.8} />
        })}

        {/* Arrow rendered with glow filter — white for contrast */}
        <g filter={`url(#${filterId})`}>
          <line x1={cx} y1={cy} x2={tipX} y2={tipY}
            stroke="white" strokeWidth={2.2} strokeLinecap="round" />
          <polygon points={`${tipX},${tipY} ${h1x},${h1y} ${h2x},${h2y}`}
            fill="white" />
        </g>

        {/* Origin dot */}
        <circle cx={cx} cy={cy} r={2.2} fill="rgba(255,255,255,0.5)" />
      </svg>

      <div className="flex gap-1.5 text-[9px] font-mono leading-none text-content-muted">
        <span>{hBreak > 0 ? '+' : ''}{hBreak}"</span>
        <span className="opacity-30">/</span>
        <span>{vBreak > 0 ? '+' : ''}{vBreak}"</span>
      </div>
    </div>
  )
}
