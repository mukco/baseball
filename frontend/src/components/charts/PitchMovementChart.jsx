import { useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { pitchColor } from '../../lib/pitchColors'

const BORDER = 'rgb(var(--color-bg-border-strong))'
const MUTED = 'rgb(var(--color-content-muted))'

const HAND_LABELS = {
  R: { left: 'Glove Side', right: 'Arm Side' },
  L: { left: 'Arm Side',   right: 'Glove Side' },
}

function AverageMarker({ cx, cy, payload }) {
  if (cx == null || cy == null) return null
  const color = pitchColor(payload.type)
  return (
    <g>
      <circle cx={cx} cy={cy} r={12} fill={color} stroke="rgb(var(--color-bg-surface))" strokeWidth={1.5} />
      <text
        x={cx} y={cy + 4}
        textAnchor="middle"
        fontSize={7}
        fontWeight="700"
        fill="#fff"
        fontFamily="monospace"
      >
        {payload.type}
      </text>
    </g>
  )
}

function CustomDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null
  return (
    <circle
      cx={cx} cy={cy}
      r={2.5}
      fill={pitchColor(payload.type)}
      fillOpacity={0.45}
    />
  )
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload || {}
  if (d._isAvg) return null
  return (
    <div className="bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-xs shadow-xl space-y-0.5">
      <p className="font-semibold text-content-primary">{d.name || d.type}</p>
      <p className="text-content-secondary">
        H Break: <span className="font-mono text-content-primary">{d.hBreak != null ? `${d.hBreak >= 0 ? '+' : ''}${d.hBreak.toFixed(1)}"` : '—'}</span>
      </p>
      <p className="text-content-secondary">
        V Break: <span className="font-mono text-content-primary">{d.vBreak != null ? `${d.vBreak >= 0 ? '+' : ''}${d.vBreak.toFixed(1)}"` : '—'}</span>
      </p>
    </div>
  )
}

export default function PitchMovementChart({ data = [], pitchHand }) {
  const { byType, averages } = useMemo(() => {
    const groups = {}
    const sums = {}

    for (const d of data) {
      if (d.hBreak == null || d.vBreak == null) continue
      if (!groups[d.type]) {
        groups[d.type] = []
        sums[d.type] = { type: d.type, name: d.name, hSum: 0, vSum: 0, n: 0 }
      }
      groups[d.type].push({ type: d.type, name: d.name, hBreak: d.hBreak, vBreak: d.vBreak })
      sums[d.type].hSum += d.hBreak
      sums[d.type].vSum += d.vBreak
      sums[d.type].n++
    }

    const averages = Object.values(sums).map(s => ({
      type: s.type,
      name: s.name,
      hBreak: s.hSum / s.n,
      vBreak: s.vSum / s.n,
      _isAvg: true,
    }))

    return { byType: groups, averages }
  }, [data])

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-content-muted text-sm">
        No movement data available
      </div>
    )
  }

  const handLabels = HAND_LABELS[pitchHand] ?? null

  return (
    <div>
      {/* Legend + handedness badge */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {averages.map(({ type, name }) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pitchColor(type) }} />
              <span className="text-[11px] text-content-secondary">{name}</span>
            </div>
          ))}
        </div>
        {pitchHand && (
          <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${
            pitchHand === 'L' ? 'text-blue-400 bg-blue-400/10' : 'text-red-400 bg-red-400/10'
          }`}>
            {pitchHand === 'L' ? 'LHP' : 'RHP'}
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 8, right: 24, bottom: 40, left: 24 }}>
          <CartesianGrid stroke={BORDER} strokeDasharray="3 3" strokeOpacity={0.5} />
          <XAxis
            type="number"
            dataKey="hBreak"
            domain={[-25, 25]}
            ticks={[-20, -10, 0, 10, 20]}
            tick={{ fill: MUTED, fontSize: 10 }}
            axisLine={{ stroke: BORDER }}
            tickLine={false}
            label={{ value: 'Horizontal Break (in)', position: 'insideBottom', offset: -24, fill: MUTED, fontSize: 10 }}
          />
          <YAxis
            type="number"
            dataKey="vBreak"
            domain={[-30, 30]}
            ticks={[-20, -10, 0, 10, 20]}
            tick={{ fill: MUTED, fontSize: 10 }}
            axisLine={{ stroke: BORDER }}
            tickLine={false}
            label={{ value: 'Vertical Break (in)', angle: -90, position: 'insideLeft', offset: 16, fill: MUTED, fontSize: 10 }}
          />
          <ZAxis range={[22, 22]} />
          <ReferenceLine x={0} stroke={BORDER} strokeWidth={1.5} />
          <ReferenceLine y={0} stroke={BORDER} strokeWidth={1.5} />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: BORDER }} />

          {/* Individual pitch dots — one Scatter per pitch type */}
          {Object.entries(byType).map(([type, points]) => (
            <Scatter
              key={type}
              data={points}
              shape={<CustomDot />}
              isAnimationActive={false}
            />
          ))}

          {/* Average markers */}
          <Scatter
            data={averages}
            shape={<AverageMarker />}
            isAnimationActive={false}
          />
        </ScatterChart>
      </ResponsiveContainer>

      {handLabels && (
        <div className="flex justify-between text-[10px] text-content-muted px-8 -mt-1">
          <span>← {handLabels.left}</span>
          <span>{handLabels.right} →</span>
        </div>
      )}
    </div>
  )
}
