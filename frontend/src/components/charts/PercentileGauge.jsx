// Baseball Savant-style percentile gauge bars — pure CSS, fully responsive.

function pctColor(p) {
  if (p >= 85) return 'var(--color-stat-elite)'
  if (p >= 65) return 'var(--color-stat-great)'
  if (p >= 40) return 'var(--color-stat-avg)'
  if (p >= 20) return 'var(--color-stat-below)'
  return 'var(--color-stat-poor)'
}

const ZONES = [
  { from: 0,   to: 20,  fill: 'var(--color-stat-poor)'  },
  { from: 20,  to: 40,  fill: 'var(--color-stat-below)' },
  { from: 40,  to: 65,  fill: 'var(--color-stat-avg)'   },
  { from: 65,  to: 85,  fill: 'var(--color-stat-great)' },
  { from: 85,  to: 100, fill: 'var(--color-stat-elite)' },
]

const TICKS = [10, 25, 50, 75, 90]

function GaugeRow({ label, value, percentile }) {
  if (percentile == null) return null
  const markerPos = percentile
  const numColor  = pctColor(percentile)

  return (
    <div className="grid items-center gap-3 w-full" style={{ gridTemplateColumns: '7rem 1fr 2.5rem 4rem' }}>
      <span className="text-[11px] text-content-muted truncate">{label}</span>

      {/* Bar — uses CSS so it always fills the 1fr column */}
      <div className="relative" style={{ height: 20 }}>
        {/* Zone bands */}
        <div className="absolute rounded-full overflow-hidden" style={{ left: 0, right: 0, top: 5, height: 10 }}>
          {ZONES.map(z => (
            <div
              key={z.from}
              style={{
                position: 'absolute',
                left: `${z.from}%`,
                width: `${z.to - z.from}%`,
                top: 0, bottom: 0,
                backgroundColor: z.fill,
                opacity: 0.6,
              }}
            />
          ))}
        </div>

        {/* Border overlay */}
        <div
          className="absolute rounded-full pointer-events-none border border-bg-border/40"
          style={{ left: 0, right: 0, top: 5, height: 10 }}
        />

        {/* Tick marks */}
        {TICKS.map(t => (
          <div
            key={t}
            style={{
              position: 'absolute',
              left: `${t}%`,
              top: 3,
              bottom: 3,
              width: 1,
              backgroundColor: 'rgb(var(--color-bg-border-strong))',
            }}
          />
        ))}

        {/* Marker dot */}
        <div
          style={{
            position: 'absolute',
            left: `${markerPos}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 14,
            height: 14,
            borderRadius: '50%',
            backgroundColor: numColor,
            border: '2px solid rgb(var(--color-bg-surface))',
          }}
        />
      </div>

      <span className="text-[11px] font-bold text-right" style={{ color: numColor }}>
        {percentile}th
      </span>
      <span className="text-[11px] font-mono text-content-secondary text-right truncate">
        {value ?? '—'}
      </span>
    </div>
  )
}

export default function PercentileGauge({ stats = [] }) {
  const visible = stats.filter(s => s.percentile != null)
  if (!visible.length) return null

  return (
    <div className="space-y-1 w-full">
      {visible.map(s => <GaugeRow key={s.label} {...s} />)}
    </div>
  )
}
