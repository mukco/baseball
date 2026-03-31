import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const PITCH_COLORS = {
  FF: '#EF4444',
  SI: '#F97316',
  FC: '#F59E0B',
  SL: '#22C55E',
  SW: '#10B981',
  CU: '#3B82F6',
  KC: '#6366F1',
  CH: '#A855F7',
  FS: '#EC4899',
  ST: '#14B8A6',
  OTHER: '#9CA3AF',
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-content-primary mb-2">{d.name}</div>
      <div className="space-y-1">
        <div className="text-content-secondary">Usage: <span className="text-content-primary font-mono">{d.usage?.toFixed(1)}%</span></div>
        {d.avgVelo != null && <div className="text-content-secondary">Velo: <span className="text-content-primary font-mono">{d.avgVelo} mph</span></div>}
        {d.avgSpin != null && <div className="text-content-secondary">Spin: <span className="text-content-primary font-mono">{d.avgSpin} rpm</span></div>}
        {d.whiffRate != null && <div className="text-content-secondary">Whiff%: <span className="text-content-primary font-mono">{d.whiffRate}%</span></div>}
      </div>
    </div>
  )
}

export default function PitchMixChart({ pitchTypes = [] }) {
  if (!pitchTypes.length) {
    return <div className="flex items-center justify-center h-48 text-content-muted text-sm">No pitch data available</div>
  }

  const data = pitchTypes.map((p) => ({
    ...p,
    color: PITCH_COLORS[p.type] || PITCH_COLORS.OTHER,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 10 }}>
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fill: '#4A5A7A', fontSize: 11 }}
          tickFormatter={(v) => `${v}%`}
        />
        <YAxis
          dataKey="name"
          type="category"
          width={90}
          tick={{ fill: '#7A90AF', fontSize: 12 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="usage" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={entry.type} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
