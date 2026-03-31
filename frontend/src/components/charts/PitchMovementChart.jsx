import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const PITCH_COLORS = {
  FF: '#EF4444', // 4-seam fastball — red
  SI: '#F97316', // sinker — orange
  FC: '#F59E0B', // cutter — amber
  SL: '#22C55E', // slider — green
  SW: '#10B981', // sweeper — emerald
  CU: '#3B82F6', // curveball — blue
  KC: '#6366F1', // knuckle-curve — indigo
  CH: '#A855F7', // changeup — purple
  FS: '#EC4899', // split — pink
  ST: '#14B8A6', // sweeper variant
  OTHER: '#9CA3AF',
}

function pitchColor(type) {
  return PITCH_COLORS[type] || PITCH_COLORS.OTHER
}

const CustomDot = (props) => {
  const { cx, cy, payload } = props
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill={pitchColor(payload.type)}
      fillOpacity={0.7}
      stroke="none"
    />
  )
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-content-primary mb-1">{d.name}</div>
      <div className="text-content-secondary">H-Break: <span className="text-content-primary font-mono">{d.hBreak?.toFixed(1)}"</span></div>
      <div className="text-content-secondary">V-Break: <span className="text-content-primary font-mono">{d.vBreak?.toFixed(1)}"</span></div>
    </div>
  )
}

export default function PitchMovementChart({ data = [], pitchTypes = [] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-content-muted text-sm">
        No movement data available
      </div>
    )
  }

  // Build one Scatter series per pitch type for correct legend colors
  const types = [...new Set(data.map((d) => d.type))]

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {types.map((t) => {
          const name = data.find((d) => d.type === t)?.name || t
          return (
            <div key={t} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pitchColor(t) }} />
              <span className="text-xs text-content-secondary">{name}</span>
            </div>
          )
        })}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
          <CartesianGrid stroke="#1C3050" strokeDasharray="3 3" />
          <XAxis
            dataKey="hBreak"
            type="number"
            domain={[-25, 25]}
            tickCount={7}
            tick={{ fill: '#4A5A7A', fontSize: 11 }}
            label={{ value: 'Horizontal Break (in)', position: 'insideBottom', offset: -10, fill: '#4A5A7A', fontSize: 11 }}
          />
          <YAxis
            dataKey="vBreak"
            type="number"
            domain={[-30, 30]}
            tickCount={7}
            tick={{ fill: '#4A5A7A', fontSize: 11 }}
            label={{ value: 'Vertical Break (in)', angle: -90, position: 'insideLeft', fill: '#4A5A7A', fontSize: 11 }}
          />
          <ReferenceLine x={0} stroke="#1C3050" strokeWidth={1.5} />
          <ReferenceLine y={0} stroke="#1C3050" strokeWidth={1.5} />
          <Tooltip content={<CustomTooltip />} />
          {types.map((t) => (
            <Scatter
              key={t}
              data={data.filter((d) => d.type === t)}
              fill={pitchColor(t)}
              shape={<CustomDot />}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
