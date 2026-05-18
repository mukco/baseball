import { useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'

const BORDER = 'rgb(var(--color-bg-border-strong))'
const MUTED  = 'rgb(var(--color-content-muted))'

function CustomTooltip({ active, payload, homeTeam, awayTeam }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload || {}
  if (d.homeWinProbability == null) return null
  const homeProb = d.homeWinProbability
  const inningLabel = d.inning
    ? `${d.halfInning === 'top' ? '▲' : '▼'}${d.inning}`
    : ''

  return (
    <div className="bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-xs shadow-xl max-w-[220px] space-y-1.5">
      {inningLabel && <div className="font-semibold text-content-primary">{inningLabel}</div>}
      <div className="flex gap-4">
        <span className="text-content-secondary">
          {homeTeam}: <span className="font-mono text-content-primary">{(homeProb * 100).toFixed(1)}%</span>
        </span>
        <span className="text-content-secondary">
          {awayTeam}: <span className="font-mono text-content-primary">{((1 - homeProb) * 100).toFixed(1)}%</span>
        </span>
      </div>
      {d.description && (
        <p className="text-content-muted leading-snug border-t border-bg-border/40 pt-1">{d.description}</p>
      )}
    </div>
  )
}

export default function WinProbabilityChart({
  data = [],
  homeTeam  = 'Home',
  awayTeam  = 'Away',
  homeColor = '#6366F1',
  awayColor = '#F59E0B',
  height    = 240,
}) {
  // Center at 0: lead > 0 means home favored, lead < 0 means away favored.
  // leadPos/leadNeg split the fill area above/below the 50/50 baseline.
  const enriched = useMemo(
    () => data.map(d => {
      const lead = (d.homeWinProbability ?? 0.5) - 0.5
      return { ...d, lead, leadPos: Math.max(0, lead), leadNeg: Math.min(0, lead) }
    }),
    [data]
  )

  const inningTicks = useMemo(() => {
    const seen = new Set()
    return enriched.filter(d => {
      const key = `${d.halfInning}-${d.inning}`
      if (seen.has(key)) return false
      seen.add(key)
      return d.halfInning === 'top'
    })
  }, [enriched])

  if (!enriched.length) {
    return (
      <div className="flex items-center justify-center h-40 text-content-muted text-sm">
        Win probability not available
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1 px-1" style={{ paddingLeft: 36 }}>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: awayColor }} />
          <span style={{ color: awayColor }} className="font-medium">{awayTeam}</span>
          <span className="text-content-muted opacity-60">favored ↓</span>
        </div>
        <span className="text-[10px] text-content-muted tracking-wide uppercase">Win Probability</span>
        <div className="flex items-center gap-1.5">
          <span className="text-content-muted opacity-60">↑ favored</span>
          <span style={{ color: homeColor }} className="font-medium">{homeTeam}</span>
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: homeColor }} />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={enriched} margin={{ top: 18, right: 12, bottom: 16, left: 0 }}>
          <defs>
            <linearGradient id="wp-home" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={homeColor} stopOpacity={0.45} />
              <stop offset="95%" stopColor={homeColor} stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="wp-away" x1="0" y1="1" x2="0" y2="0">
              <stop offset="5%"  stopColor={awayColor} stopOpacity={0.45} />
              <stop offset="95%" stopColor={awayColor} stopOpacity={0.04} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={BORDER} strokeDasharray="3 3" strokeOpacity={0.6} vertical={false} />

          {inningTicks.map(d => (
            <ReferenceLine
              key={d.inning}
              x={d.index}
              stroke={BORDER}
              strokeOpacity={0.4}
              strokeWidth={1}
              label={{ value: String(d.inning), position: 'insideTopLeft', fill: MUTED, fontSize: 8, dy: -14 }}
            />
          ))}

          {/* 50/50 baseline — now at y=0, the true center of the chart */}
          <ReferenceLine
            y={0}
            stroke={MUTED}
            strokeDasharray="4 4"
            strokeWidth={1}
            strokeOpacity={0.7}
            label={{ value: '50 / 50', position: 'insideTopRight', fill: MUTED, fontSize: 8, dy: -2 }}
          />

          <XAxis dataKey="index" hide />
          <YAxis
            domain={[-0.5, 0.5]}
            tickFormatter={v => `${((v + 0.5) * 100).toFixed(0)}%`}
            ticks={[-0.5, -0.25, 0, 0.25, 0.5]}
            tick={{ fill: MUTED, fontSize: 9 }}
            axisLine={{ stroke: BORDER }}
            tickLine={false}
            width={38}
            label={{ value: 'Win %', angle: -90, position: 'insideLeft', offset: 14, fill: MUTED, fontSize: 9 }}
          />
          <Tooltip content={<CustomTooltip homeTeam={homeTeam} awayTeam={awayTeam} />} cursor={{ stroke: BORDER }} />

          {/* Home fill: above the 50/50 line */}
          <Area
            dataKey="leadPos"
            type="monotone"
            baseValue={0}
            stroke="none"
            fill="url(#wp-home)"
            dot={false}
            activeDot={false}
          />

          {/* Away fill: below the 50/50 line */}
          <Area
            dataKey="leadNeg"
            type="monotone"
            baseValue={0}
            stroke="none"
            fill="url(#wp-away)"
            dot={false}
            activeDot={false}
          />

          {/* Win probability line */}
          <Line
            dataKey="lead"
            type="monotone"
            stroke={homeColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: homeColor, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
