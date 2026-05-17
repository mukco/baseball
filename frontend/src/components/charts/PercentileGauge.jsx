// Baseball Savant-style percentile gauge bars — pure CSS, fully responsive.

function pctColor(p) {
  if (p >= 90) return '#DC2626'
  if (p >= 70) return '#F97316'
  if (p >= 30) return '#9CA3AF'
  if (p >= 10) return '#60A5FA'
  return '#1D4ED8'
}

const ZONES = [
  { from: 0,  to: 10, fill: '#1D4ED8' },
  { from: 10, to: 30, fill: '#3B82F6' },
  { from: 30, to: 70, fill: '#4B5563' },
  { from: 70, to: 90, fill: '#F97316' },
  { from: 90, to: 100, fill: '#DC2626' },
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
          className="absolute rounded-full pointer-events-none"
          style={{ left: 0, right: 0, top: 5, height: 10, border: '0.5px solid rgba(255,255,255,0.1)' }}
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
              backgroundColor: 'rgba(0,0,0,0.3)',
            }}
          />
        ))}

        {/* Glow halo */}
        <div
          style={{
            position: 'absolute',
            left: `${markerPos}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: numColor,
            opacity: 0.25,
            filter: 'blur(4px)',
          }}
        />

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
            backgroundColor: 'white',
            border: '1.5px solid rgba(0,0,0,0.4)',
            boxShadow: `0 0 5px ${numColor}99, 0 1px 3px rgba(0,0,0,0.5)`,
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
