import { useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'

const BORDER = '#2D2D3A'
const MUTED  = '#6B7280'

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
  height    = 200,
}) {
  const enriched = useMemo(
    () => data.map(d => ({ ...d, awayWinProbability: 1 - (d.homeWinProbability ?? 0.5) })),
    [data]
  )

  // First inning of each half-inning for tick labels
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
      {/* Team labels */}
      <div className="flex justify-between text-[11px] mb-2 px-12">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: awayColor }} />
          <span style={{ color: awayColor }}>{awayTeam}</span>
        </div>
        <span className="text-content-muted text-[10px]">Win Probability</span>
        <div className="flex items-center gap-1.5">
          <span style={{ color: homeColor }}>{homeTeam}</span>
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: homeColor }} />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={enriched} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
          <defs>
            <linearGradient id="wp-home" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={homeColor} stopOpacity={0.4} />
              <stop offset="95%" stopColor={homeColor} stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="wp-away" x1="0" y1="1" x2="0" y2="0">
              <stop offset="5%"  stopColor={awayColor} stopOpacity={0.4} />
              <stop offset="95%" stopColor={awayColor} stopOpacity={0.03} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={BORDER} strokeDasharray="3 3" vertical={false} />

          {/* Inning tick reference lines */}
          {inningTicks.map(d => (
            <ReferenceLine
              key={`${d.inning}`}
              x={d.index}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth={1}
              label={{ value: String(d.inning), position: 'top', fill: MUTED, fontSize: 8 }}
            />
          ))}

          <ReferenceLine
            y={0.5}
            stroke="rgba(255,255,255,0.25)"
            strokeDasharray="5 3"
            strokeWidth={1}
            label={{ value: 'Even', position: 'right', fill: MUTED, fontSize: 8 }}
          />

          <XAxis dataKey="index" hide />
          <YAxis
            domain={[0, 1]}
            tickFormatter={v => `${Math.round(v * 100)}%`}
            tick={{ fill: MUTED, fontSize: 9 }}
            axisLine={{ stroke: BORDER }}
            tickLine={false}
            width={34}
          />
          <Tooltip content={<CustomTooltip homeTeam={homeTeam} awayTeam={awayTeam} />} cursor={{ stroke: BORDER }} />

          {/* Away fill (below 0.5) */}
          <Area
            dataKey="awayWinProbability"
            type="monotone"
            stroke="none"
            fill="url(#wp-away)"
            dot={false}
            activeDot={false}
          />

          {/* Home fill (above 0.5, drawn on top) */}
          <Area
            dataKey="homeWinProbability"
            type="monotone"
            stroke={homeColor}
            strokeWidth={2}
            fill="url(#wp-home)"
            dot={false}
            activeDot={{ r: 4, fill: homeColor, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
