import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'

const SYSTEMS = [
  { key: 'steamer', label: 'Steamer', color: '#60a5fa' },
  { key: 'zips',    label: 'ZiPS',    color: '#f59e0b' },
  { key: 'ours',    label: 'Ours',    color: '#22c55e' },
]

const STAT_LABELS = {
  avg: 'AVG', obp: 'OBP', slg: 'SLG', hr: 'HR', rbi: 'RBI',
  era: 'ERA', whip: 'WHIP', k9: 'K/9', bb9: 'BB/9',
}

// Split batter stats so rate and counting use independent Y-axis scales
const BATTER_RATE_STATS  = ['avg', 'obp', 'slg']
const BATTER_COUNT_STATS = ['hr', 'rbi']
const PITCHER_STATS      = ['era', 'whip', 'k9', 'bb9']

const MUTED = 'rgb(var(--color-content-muted))'

function tickFmt(v) {
  const abs = Math.abs(v)
  if (abs >= 10) return v.toFixed(0)
  if (abs >= 1)  return v.toFixed(1)
  return v.toFixed(3)
}

function CustomTooltip({ active, payload, label, mode }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-xs shadow-xl min-w-[140px]">
      <p className="font-semibold text-content-primary mb-1">{STAT_LABELS[label] || label}</p>
      {payload.map(({ name, value, color }) =>
        value != null && (
          <div key={name} className="flex items-center justify-between gap-3">
            <span style={{ color }} className="font-medium">{name}</span>
            <span className="font-mono text-content-primary">
              {value > 0 ? '+' : ''}{tickFmt(value)}
            </span>
          </div>
        )
      )}
      <p className="text-content-muted mt-1 leading-tight">
        {mode === 'bias' ? 'Projected − actual (+ = over-projected)' : 'Mean absolute error'}
      </p>
    </div>
  )
}

function SubChart({ data, systems, mode, showLegend }) {
  if (!data.length) return null

  const maxAbs = Math.max(
    ...data.flatMap(row => systems.map(({ key }) => Math.abs(row[key] ?? 0))),
    0.001
  )
  const domain = mode === 'bias' ? [-maxAbs * 1.35, maxAbs * 1.35] : [0, maxAbs * 1.35]

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: MUTED, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={domain}
          tick={{ fontSize: 10, fill: MUTED }}
          axisLine={false}
          tickLine={false}
          tickFormatter={tickFmt}
          tickCount={5}
          width={44}
        />
        {mode === 'bias' && (
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
        )}
        <Tooltip content={<CustomTooltip mode={mode} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        {showLegend && (
          <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        )}
        {systems.map(({ key, label, color }) => (
          <Bar key={key} dataKey={key} name={label} fill={color} fillOpacity={0.85} maxBarSize={24} radius={2} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function ProjectionAccuracyChart({ aggregate, playerType, sampleSize }) {
  const [mode, setMode] = useState('bias')

  const activeSystems = SYSTEMS.filter(s => aggregate?.[s.key] && Object.keys(aggregate[s.key]).length > 0)
  if (!activeSystems.length) return null

  const isPitcher = playerType === 'pitcher'

  function buildData(statKeys) {
    return statKeys.map(stat => {
      const row = { stat, label: STAT_LABELS[stat] || stat }
      activeSystems.forEach(({ key }) => {
        const entry = aggregate[key]?.[stat]
        if (entry) row[key] = mode === 'bias' ? entry.mean : entry.mae
      })
      return row
    }).filter(row => activeSystems.some(({ key }) => row[key] != null))
  }

  const rateStats  = isPitcher ? PITCHER_STATS : BATTER_RATE_STATS
  const countStats = isPitcher ? [] : BATTER_COUNT_STATS

  const rateData  = buildData(rateStats)
  const countData = buildData(countStats)

  if (!rateData.length && !countData.length) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-content-muted leading-relaxed">
          Projection error vs end-of-season actuals
          {sampleSize > 0 && <span> · {sampleSize} player{sampleSize !== 1 ? 's' : ''}</span>}
        </p>
        <div className="flex rounded border border-bg-border overflow-hidden">
          {['bias', 'mae'].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                mode === m ? 'bg-brand/10 text-brand' : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              {m === 'bias' ? 'Bias' : 'MAE'}
            </button>
          ))}
        </div>
      </div>

      {rateData.length > 0 && (
        <div>
          {!isPitcher && countData.length > 0 && (
            <p className="text-[10px] text-content-muted mb-0.5 uppercase tracking-wide font-medium">Rate</p>
          )}
          <SubChart data={rateData} systems={activeSystems} mode={mode} showLegend={countData.length === 0} />
        </div>
      )}

      {countData.length > 0 && (
        <div>
          <p className="text-[10px] text-content-muted mb-0.5 uppercase tracking-wide font-medium">Counting</p>
          <SubChart data={countData} systems={activeSystems} mode={mode} showLegend />
        </div>
      )}
    </div>
  )
}
