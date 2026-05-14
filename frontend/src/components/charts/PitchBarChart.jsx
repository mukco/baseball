const PITCH_COLORS = {
  FF: '#D22D49', SI: '#FE9D00', FC: '#933F2C',
  SL: '#EEE716', ST: '#D2E338', CU: '#00D1ED',
  KC: '#01C8E3', CH: '#1DBE3A', FS: '#3BACAC',
  KN: '#9C9C9C', EP: '#5A5A5A',
}
function pitchColor(type) { return PITCH_COLORS[type] || '#9CA3AF' }

export default function PitchBarChart({ pitchTypes = [], metric = 'whiffRate', format, maxValue }) {
  const rows = pitchTypes
    .filter(pt => pt[metric] != null)
    .sort((a, b) => (b[metric] || 0) - (a[metric] || 0))

  if (!rows.length) return null

  const max    = maxValue ?? Math.max(...rows.map(p => p[metric] || 0))
  const fmt    = format ?? (v => typeof v === 'number' ? v.toFixed(1) : v)
  const topVal = rows[0][metric]

  return (
    <div className="space-y-2.5">
      {rows.map((pt, i) => {
        const val   = pt[metric]
        const pct   = max > 0 ? (val / max) * 100 : 0
        const color = pitchColor(pt.type)
        const isTop = val === topVal

        return (
          <div key={pt.type} className="flex items-center gap-2.5">
            {/* Color swatch */}
            <div
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: color, boxShadow: isTop ? `0 0 6px ${color}99` : 'none' }}
            />
            {/* Pitch name */}
            <div className="w-24 shrink-0 text-[11px] text-content-secondary truncate">
              {pt.name || pt.type}
            </div>
            {/* Bar track */}
            <div className="flex-1 h-3.5 rounded-sm overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-sm transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(to right, ${color}EE, ${color}88)`,
                  boxShadow: isTop ? `0 0 8px ${color}66` : 'none',
                }}
              />
            </div>
            {/* Value */}
            <div
              className="w-10 text-right text-[11px] font-mono shrink-0"
              style={{ color: isTop ? color : 'rgba(255,255,255,0.5)' }}
            >
              {fmt(val)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
