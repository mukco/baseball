import { useMemo } from 'react'
import { BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const MUTED = 'rgb(var(--color-content-muted))'
const BORDER = 'rgb(var(--color-bg-border))'

function ResidualsHistogram({ yTrue, yPred }) {
  const bins = useMemo(() => {
    const residuals = yPred.map((p, i) => p - yTrue[i])
    const min = Math.min(...residuals)
    const max = Math.max(...residuals)
    const range = max - min || 1
    const buckets = 20
    const width = range / buckets
    const counts = Array(buckets).fill(0)
    for (const r of residuals) {
      const idx = Math.min(Math.floor((r - min) / width), buckets - 1)
      counts[idx]++
    }
    return counts.map((count, i) => ({
      bin: (min + i * width).toFixed(3),
      count,
      mid: +(min + (i + 0.5) * width).toFixed(3),
    }))
  }, [yTrue, yPred])

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-1">
        Residuals distribution
        <span className="normal-case font-normal ml-1 text-content-muted">(predicted − actual)</span>
      </p>
      <p className="text-xs text-content-muted mb-3">A symmetric bell centred near 0 means errors are unbiased.</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={bins} margin={{ left: 4, right: 8, bottom: 20 }}>
          <XAxis
            dataKey="mid"
            type="number"
            scale="linear"
            domain={['dataMin', 'dataMax']}
            tick={{ fill: MUTED, fontSize: 10 }}
            tickFormatter={v => v.toFixed(2)}
            label={{ value: 'Residual (predicted − actual)', position: 'insideBottom', offset: -10, fill: MUTED, fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: MUTED, fontSize: 10 }}
            width={32}
            label={{ value: 'Count', angle: -90, position: 'insideLeft', offset: 14, fill: MUTED, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{ background: 'rgb(var(--color-bg-elevated))', border: `1px solid ${BORDER}`, borderRadius: 6 }}
            itemStyle={{ color: 'rgb(var(--color-content-primary))', fontSize: 12 }}
            formatter={(val, name) => [val, 'rows']}
            labelFormatter={v => `Residual ≈ ${Number(v).toFixed(3)}`}
          />
          <ReferenceLine x={0} stroke={MUTED} strokeDasharray="3 3" strokeOpacity={0.7} />
          <Bar dataKey="count" fill="rgb(var(--color-brand))" fillOpacity={0.75} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const CustomDot = (props) => {
  const { cx, cy } = props
  return <circle cx={cx} cy={cy} r={3} fill="#2563EB" fillOpacity={0.55} stroke="none" />
}

export default function PredActualChart({ testPredictions, target }) {
  const { y_true, y_pred, sampled } = testPredictions
  const points = y_true.map((t, i) => ({ true: t, pred: y_pred[i] }))
  const allVals = [...y_true, ...y_pred]
  const lo = Math.min(...allVals)
  const hi = Math.max(...allVals)

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-1">
          Predicted vs Actual — {target}
          {sampled && <span className="normal-case font-normal ml-1">(500-point sample)</span>}
        </p>
        <p className="text-xs text-content-muted mb-3">Points on the diagonal = perfect predictions. Spread = error magnitude.</p>
        <ResponsiveContainer width="100%" height={240}>
          <ScatterChart margin={{ left: 4, right: 8, bottom: 20 }}>
            <XAxis dataKey="true" type="number" name="Actual" domain={[lo, hi]}
              tick={{ fill: MUTED, fontSize: 10 }}
              label={{ value: 'Actual', position: 'insideBottom', offset: -10, fill: MUTED, fontSize: 11 }} />
            <YAxis dataKey="pred" type="number" name="Predicted" domain={[lo, hi]}
              tick={{ fill: MUTED, fontSize: 10 }} width={50}
              label={{ value: 'Predicted', angle: -90, position: 'insideLeft', offset: 10, fill: MUTED, fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: 'rgb(var(--color-bg-elevated))', border: `1px solid ${BORDER}`, borderRadius: 6 }}
              itemStyle={{ color: 'rgb(var(--color-content-primary))', fontSize: 12 }}
              formatter={(val) => [val.toFixed(4)]}
            />
            <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]}
              stroke="#475569" strokeDasharray="4 3" />
            <Scatter data={points} shape={<CustomDot />} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <ResidualsHistogram yTrue={y_true} yPred={y_pred} />
    </div>
  )
}
