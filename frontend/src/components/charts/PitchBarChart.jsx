import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { pitchColor } from '../../lib/pitchColors'

const MUTED = 'rgb(var(--color-content-muted))'
const SECONDARY = 'rgb(var(--color-content-secondary))'

function PitchYAxisTick({ x, y, payload, dataMap }) {
  const pt = dataMap[payload.value]
  const color = pt ? pitchColor(pt.pitchType) : MUTED
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-88} y={-5} width={8} height={10} rx={2} fill={color} />
      <text x={-76} y={4} textAnchor="start" fontSize={11} fill={SECONDARY} fontFamily="sans-serif">
        {payload.value}
      </text>
    </g>
  )
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-content-primary mb-0.5">{d.label}</p>
      <p className="font-mono text-content-primary">{d._display}</p>
    </div>
  )
}

export default function PitchBarChart({ pitchTypes = [], metric = 'whiffRate', metricLabel, format, maxValue }) {
  const rows = [...pitchTypes]
    .filter(pt => pt[metric] != null)
    .sort((a, b) => (b[metric] || 0) - (a[metric] || 0))

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center h-24 text-content-muted text-xs">No data for this metric</div>
    )
  }

  const fmt = format ?? (v => typeof v === 'number' ? v.toFixed(1) : v)
  const max = maxValue ?? Math.max(...rows.map(p => p[metric] || 0))
  const height = Math.max(64, rows.length * 40 + 44)
  const xLabel = metricLabel ?? metric.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())

  const data = rows.map(pt => ({
    label: pt.name || pt.type,
    pitchType: pt.type,
    _value: pt[metric],
    _display: fmt(pt[metric]),
  }))

  const dataMap = Object.fromEntries(data.map(d => [d.label, d]))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 44, left: 92, bottom: 16 }}
      >
        <XAxis
          type="number"
          domain={[0, max]}
          tick={{ fill: MUTED, fontSize: 10 }}
          axisLine={{ stroke: MUTED, strokeOpacity: 0.3 }}
          tickLine={false}
          tickFormatter={v => fmt(v)}
          label={{ value: xLabel, position: 'insideBottomRight', offset: -4, fill: MUTED, fontSize: 10 }}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={92}
          tick={<PitchYAxisTick dataMap={dataMap} />}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--color-bg-elevated))' }} />
        <Bar
          dataKey="_value"
          radius={[0, 4, 4, 0]}
          maxBarSize={18}
        >
          {data.map((d) => (
            <Cell key={d.pitchType} fill={pitchColor(d.pitchType)} fillOpacity={0.9} />
          ))}
          <LabelList
            dataKey="_display"
            position="right"
            style={{ fill: SECONDARY, fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
