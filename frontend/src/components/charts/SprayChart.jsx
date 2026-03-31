import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const RESULT_COLORS = {
  single: '#22C55E',
  double: '#3B82F6',
  triple: '#F59E0B',
  home_run: '#EF4444',
  field_out: '#4A5A7A',
  sac_fly: '#7A90AF',
  force_out: '#4A5A7A',
  grounded_into_double_play: '#4A5A7A',
  OTHER: '#374151',
}

function resultColor(r) {
  return RESULT_COLORS[r] || RESULT_COLORS.OTHER
}

function resultLabel(r) {
  const map = { single: '1B', double: '2B', triple: '3B', home_run: 'HR', field_out: 'Out', sac_fly: 'SF', force_out: 'Out', grounded_into_double_play: 'GDP' }
  return map[r] || r?.replace(/_/g, ' ') || '?'
}

const CustomDot = ({ cx, cy, payload }) => (
  <circle
    cx={cx}
    cy={cy}
    r={4}
    fill={resultColor(payload.result)}
    fillOpacity={0.75}
    stroke="none"
  />
)

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-content-primary mb-1" style={{ color: resultColor(d.result) }}>
        {resultLabel(d.result)}
      </div>
      {d.exitVelo != null && (
        <div className="text-content-secondary">Exit Velo: <span className="text-content-primary font-mono">{d.exitVelo} mph</span></div>
      )}
    </div>
  )
}

export default function SprayChart({ data = [] }) {
  if (!data.length) {
    return <div className="flex items-center justify-center h-64 text-content-muted text-sm">No spray data available</div>
  }

  const legend = Object.entries({ single: '1B', double: '2B', triple: '3B', home_run: 'HR', field_out: 'Out' })

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        {legend.map(([k, label]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: resultColor(k) }} />
            <span className="text-xs text-content-secondary">{label}</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          {/* No axes shown — raw field coordinates */}
          <XAxis dataKey="x" type="number" domain={[0, 250]} hide />
          <YAxis dataKey="y" type="number" domain={[0, 250]} hide reversed />
          <Tooltip content={<CustomTooltip />} />
          <Scatter data={data} shape={<CustomDot />} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
