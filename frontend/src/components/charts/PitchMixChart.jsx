import { pitchColor } from '../../lib/pitchColors'

export default function PitchMixChart({ pitchTypes = [] }) {
  const total = pitchTypes.reduce((s, p) => s + (p.usage || 0), 0)
  if (!total) {
    return <div className="flex items-center justify-center flex-1 text-content-muted text-sm">No pitch data</div>
  }

  const sorted = [...pitchTypes].sort((a, b) => (b.usage || 0) - (a.usage || 0))
  const hasVelo  = sorted.some(p => p.avgVelo  != null)
  const hasWhiff = sorted.some(p => p.whiffRate != null)

  const cols = `1fr 2.5rem${hasVelo ? ' 3.5rem' : ''}${hasWhiff ? ' 3rem' : ''}`

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Usage palette strip */}
      <div className="flex h-2 rounded-full overflow-hidden shrink-0" style={{ gap: 1 }}>
        {sorted.map(pt => (
          <div
            key={pt.type}
            title={`${pt.name || pt.type}: ${(pt.usage || 0).toFixed(1)}%`}
            style={{ flex: `${pt.usage || 0} 1 0%`, backgroundColor: pitchColor(pt.type), minWidth: 2 }}
          />
        ))}
      </div>

      {/* Column headers */}
      <div className="grid gap-x-3 mt-4 shrink-0 text-[9px] font-medium text-content-muted uppercase tracking-wider" style={{ gridTemplateColumns: cols }}>
        <span>Pitch</span>
        <span className="text-right">Usage</span>
        {hasVelo  && <span className="text-right">Velo</span>}
        {hasWhiff && <span className="text-right">Whiff</span>}
      </div>

      {/* Pitch rows — flex-1 so they fill remaining card height */}
      <div className="flex-1 flex flex-col justify-evenly mt-1">
        {sorted.map(pt => {
          const color = pitchColor(pt.type)
          return (
            <div key={pt.type} className="grid items-center gap-x-3" style={{ gridTemplateColumns: cols }}>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[12px] font-medium text-content-secondary truncate">{pt.name || pt.type}</span>
              </div>
              <span className="text-[13px] font-bold font-mono text-right tabular-nums" style={{ color }}>
                {(pt.usage || 0).toFixed(0)}%
              </span>
              {hasVelo && (
                <span className="text-[11px] font-mono text-content-muted text-right tabular-nums">
                  {pt.avgVelo != null ? Number(pt.avgVelo).toFixed(1) : '—'}
                </span>
              )}
              {hasWhiff && (
                <span className="text-[11px] font-mono text-content-muted text-right tabular-nums">
                  {pt.whiffRate != null ? `${Number(pt.whiffRate).toFixed(1)}%` : '—'}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {hasVelo && (
        <div className="flex justify-end shrink-0 mt-1">
          <span className="text-[9px] text-content-muted uppercase tracking-wider">mph</span>
        </div>
      )}
    </div>
  )
}
