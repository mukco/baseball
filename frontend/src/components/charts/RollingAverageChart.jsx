import { useMemo } from 'react'
import {
  ComposedChart, Area, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'

function rollingAvg(data, key, window) {
  return data.map((d, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1)
    const vals  = slice.map(x => Number(x[key])).filter(Number.isFinite)
    return { ...d, _avg: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null }
  })
}

const BORDER = 'rgb(var(--color-bg-border-strong))'
const MUTED  = 'rgb(var(--color-content-muted))'

function CustomTooltip({ active, payload, valueKey, valueLabel, formatValue }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload || {}
  let dateLabel = ''
  if (d.date) {
    try { dateLabel = format(parseISO(d.date), 'MMM d') } catch {}
  }
  return (
    <div className="bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-xs shadow-xl space-y-1">
      <div className="font-semibold text-content-primary">{dateLabel}</div>
      {d.opponent && (
        <div className="text-content-muted">{d.isHome ? 'vs' : '@'} {d.opponent}</div>
      )}
      {d[valueKey] != null && (
        <div className="text-content-secondary">
          {valueLabel}: <span className="text-content-primary font-mono">{formatValue(Number(d[valueKey]))}</span>
        </div>
      )}
      {d._avg != null && (
        <div className="text-content-muted">
          Rolling: <span className="text-content-primary font-mono">{d._avg.toFixed(1)}</span>
        </div>
      )}
    </div>
  )
}

export default function RollingAverageChart({
  data = [],
  valueKey    = 'ops',
  valueLabel  = 'OPS',
  color       = '#6366F1',
  windowSize  = 10,
  reference   = null,
  height      = 200,
  formatValue = (v) => Number(v).toFixed(3),
}) {
  const processed = useMemo(() => rollingAvg(data, valueKey, windowSize), [data, valueKey, windowSize])

  const vals = processed.map(d => Number(d[valueKey])).filter(Number.isFinite)
  if (!vals.length) return (
    <div className="flex items-center justify-center h-40 text-content-muted text-sm">No data</div>
  )

  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const pad = Math.max((max - min) * 0.12, 0.05)

  const tickData = processed.map((d, i) => {
    let label = String(i + 1)
    if (d.date) {
      try { label = format(parseISO(d.date), 'M/d') } catch {}
    }
    return { ...d, _idx: i, _label: label }
  })

  const step   = Math.max(1, Math.floor(tickData.length / 6))
  const ticks  = tickData.filter((_, i) => i % step === 0).map(d => d._idx)
  const gradId = `ra-${valueKey}`

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={tickData} margin={{ top: 8, right: 12, bottom: 16, left: -8 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke={BORDER} strokeDasharray="3 3" strokeOpacity={0.6} vertical={false} />

        <XAxis
          dataKey="_idx"
          type="number"
          domain={[0, tickData.length - 1]}
          ticks={ticks}
          tickFormatter={i => tickData[i]?._label || ''}
          tick={{ fill: MUTED, fontSize: 11 }}
          axisLine={{ stroke: BORDER }}
          tickLine={false}
        />
        <YAxis
          domain={[Math.max(0, min - pad), max + pad]}
          tickFormatter={(v) => {
            const n = Number(v)
            if (!Number.isFinite(n)) return v
            if (Number.isInteger(n)) return String(n)
            if (Math.abs(n) >= 1) return n.toFixed(1)
            return n.toFixed(2)
          }}
          tick={{ fill: MUTED, fontSize: 11 }}
          axisLine={{ stroke: BORDER }}
          tickLine={false}
          width={40}
        />
        <Tooltip content={<CustomTooltip valueKey={valueKey} valueLabel={valueLabel} formatValue={formatValue} />} cursor={{ stroke: BORDER }} />

        {reference != null && (
          <ReferenceLine y={reference} stroke={MUTED} strokeDasharray="4 4" strokeWidth={1} />
        )}

        {/* Individual game dots — faint */}
        <Scatter
          dataKey={valueKey}
          fill={color}
          fillOpacity={0.3}
          r={2.5}
          line={false}
        />

        {/* Rolling average — gradient area fill */}
        <Area
          dataKey="_avg"
          type="monotone"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          dot={false}
          activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
