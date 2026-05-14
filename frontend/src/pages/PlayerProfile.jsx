import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { api } from '../api'
import FactoidsPanel from '../components/FactoidsPanel'
import { StatCard } from '../components/StatCard'
import PitchMixChart from '../components/charts/PitchMixChart'
import PitchBreakArrow from '../components/charts/PitchBreakArrow'
import PitchLocationChart from '../components/charts/PitchLocationChart'
import SprayChart from '../components/charts/SprayChart'
import PercentileGauge from '../components/charts/PercentileGauge'
import SparklineChart from '../components/charts/SparklineChart'
import PitchBarChart from '../components/charts/PitchBarChart'
import RollingAverageChart from '../components/charts/RollingAverageChart'
import BeeswarmChart from '../components/charts/BeeswarmChart'
import SankeyChart from '../components/charts/SankeyChart'

const CURRENT_SEASON = new Date().getFullYear()
const MIN_SEASON = 2018
const SEASON_OPTIONS = Array.from(
  { length: Math.max(1, CURRENT_SEASON - MIN_SEASON + 1) },
  (_, i) => CURRENT_SEASON - i
)

const PROJECTION_SOURCES = [
  { id: 'steamer', label: 'Steamer' },
  { id: 'zips', label: 'ZiPS' },
]

// -------------------------------------------------------------------
// Percentile calculation helpers (approximate 2024 MLB averages)
// -------------------------------------------------------------------
const BATTING_THRESHOLDS = {
  avg: { p10: 0.218, p25: 0.238, p50: 0.258, p75: 0.280, p90: 0.305 },
  obp: { p10: 0.288, p25: 0.308, p50: 0.328, p75: 0.355, p90: 0.385 },
  slg: { p10: 0.345, p25: 0.378, p50: 0.420, p75: 0.465, p90: 0.520 },
  ops: { p10: 0.635, p25: 0.688, p50: 0.745, p75: 0.820, p90: 0.900 },
  homeRuns: { p10: 2, p25: 6, p50: 12, p75: 22, p90: 35 },
  rbi: { p10: 15, p25: 28, p50: 45, p75: 62, p90: 85 },
  stolenBases: { p10: 0, p25: 2, p50: 6, p75: 14, p90: 28 },
  strikeOuts: { p10: 60, p25: 80, p50: 100, p75: 125, p90: 155, invert: true },
  avgExitVelo: { p10: 86.5, p25: 88.0, p50: 89.5, p75: 91.5, p90: 93.5 },
  hardHitPct: { p10: 28, p25: 33, p50: 38, p75: 44, p90: 50 },
  barrelPct: { p10: 3, p25: 5, p50: 7, p75: 11, p90: 17 },
  xwOBA: { p10: 0.270, p25: 0.300, p50: 0.325, p75: 0.360, p90: 0.400 },
  sprintSpeed: { p10: 25.5, p25: 26.5, p50: 27.5, p75: 28.5, p90: 29.5 },
}

const PITCHING_THRESHOLDS = {
  era: { p10: 5.20, p25: 4.50, p50: 3.80, p75: 3.10, p90: 2.40, invert: true },
  whip: { p10: 1.45, p25: 1.32, p50: 1.20, p75: 1.08, p90: 0.95, invert: true },
  strikeOuts: { p10: 20, p25: 40, p50: 70, p75: 110, p90: 160 },
  wins: { p10: 2, p25: 5, p50: 9, p75: 13, p90: 17 },
  strikeoutsPer9Inn: { p10: 6.0, p25: 7.0, p50: 8.5, p75: 10.0, p90: 12.0 },
  walksPer9Inn: { p10: 4.5, p25: 3.5, p50: 2.8, p75: 2.2, p90: 1.5, invert: true },
}

function approxPercentile(value, thresholds) {
  if (value == null || thresholds == null) return null
  const { p10, p25, p50, p75, p90, invert } = thresholds
  let pct
  if (value <= p10) pct = 10
  else if (value <= p25) pct = Math.round(10 + ((value - p10) / (p25 - p10)) * 15)
  else if (value <= p50) pct = Math.round(25 + ((value - p25) / (p50 - p25)) * 25)
  else if (value <= p75) pct = Math.round(50 + ((value - p50) / (p75 - p50)) * 25)
  else if (value <= p90) pct = Math.round(75 + ((value - p75) / (p90 - p75)) * 15)
  else pct = 90
  return invert ? 100 - pct : pct
}

function projectionProgress({ current, projectedTotal }) {
  const currentNum = Number(current)
  const projectedNum = Number(projectedTotal)
  if (!Number.isFinite(currentNum) || !Number.isFinite(projectedNum) || projectedNum <= 0) return null
  return {
    current: Number.isInteger(currentNum) ? currentNum : currentNum.toFixed(1),
    target: Number.isInteger(projectedNum) ? projectedNum : projectedNum.toFixed(1),
  }
}

function projectionComparison({ current, projected, inverse = false, decimals = 3 }) {
  const currentNum = Number(current)
  const projectedNum = Number(projected)
  if (!Number.isFinite(currentNum) || !Number.isFinite(projectedNum)) return null

  const tolerance = Math.max(Math.abs(projectedNum) * 0.03, 0.001)
  let status = 'Neutral'
  let color = 'text-content-muted'

  if (Math.abs(currentNum - projectedNum) > tolerance) {
    const above = currentNum > projectedNum
    const better = inverse ? !above : above
    status = better ? 'Above' : 'Below'
    color = better ? 'text-green-400' : 'text-red-400'
  }

  return {
    projectedLabel: `Proj ${projectedNum.toFixed(decimals)}`,
    status,
    color,
  }
}

function formatDateShort(date) {
  if (!date) return '-'
  try {
    return format(parseISO(date), 'MMM d')
  } catch {
    return date
  }
}

// -------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------

function PlayerHeader({ info, season, onSeasonChange, projectionSource, onProjectionSourceChange }) {
  const isPitcher = ['SP', 'RP', 'P'].includes(info.position)
  return (
    <div className="card overflow-hidden">
      <div className="relative h-1 bg-gradient-to-r from-brand via-brand-light to-transparent" />
      <div className="p-6 flex items-start gap-6">
        {/* Headshot */}
        <div className="shrink-0">
          <img
            src={info.headshotUrl}
            alt={info.name}
            className="w-24 h-24 rounded-2xl object-cover bg-bg-elevated border border-bg-border"
            onError={(e) => {
              e.target.src = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/000000/headshot/67/current`
            }}
          />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-content-primary leading-tight">{info.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {info.number && (
                  <span className="text-content-muted font-mono">#{info.number}</span>
                )}
                <span className="text-brand-light font-semibold">{info.positionName || info.position}</span>
                {info.team && (
                  <>
                    <span className="text-bg-border">·</span>
                    {info.teamId ? (
                      <Link to={`/team/${info.teamId}`} className="flex items-center gap-1.5 hover:underline">
                        <img
                          src={`https://www.mlbstatic.com/team-logos/${info.teamId}.svg`}
                          className="w-4 h-4 object-contain"
                          alt=""
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                        <span className="text-content-secondary">{info.team}</span>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-content-secondary">{info.team}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {/* Season selector */}
            <div className="flex items-center gap-2">
              <select
                value={projectionSource}
                onChange={(e) => onProjectionSourceChange(e.target.value)}
                className="bg-bg-elevated border border-bg-border text-content-primary text-sm rounded-lg px-3 py-1.5 outline-none focus:border-brand"
              >
                {PROJECTION_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <select
                value={season}
                onChange={(e) => onSeasonChange(Number(e.target.value))}
                className="bg-bg-elevated border border-bg-border text-content-primary text-sm rounded-lg px-3 py-1.5 outline-none focus:border-brand"
              >
                {SEASON_OPTIONS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-3 text-sm text-content-muted">
            {info.height && <span>{info.height}</span>}
            {info.weight && <span>{info.weight} lbs</span>}
            {info.batSide && <span>Bats {info.batSide}</span>}
            {info.pitchHand && <span>Throws {info.pitchHand}</span>}
            {info.birthDate && <span>Born {info.birthDate}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function RecentGameLog({ group, rows = [] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? rows.slice(0, 30) : rows.slice(0, 10)

  const battingCols  = ['Date', 'Opp', 'Res', 'AB', 'H', 'HR', 'RBI', 'BB', 'K', 'SB', 'OPS']
  const pitchingCols = ['Date', 'Opp', 'Res', 'IP', 'ER', 'H', 'HR', 'BB', 'K', 'ERA', 'WHIP']
  const cols = group === 'pitching' ? pitchingCols : battingCols

  const trendKey = group === 'pitching' ? 'era' : 'ops'
  const trendColor = group === 'pitching' ? '#EF4444' : '#6366F1'

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest">Recent Game Log</h3>
          {rows.length > 2 && (
            <SparklineChart data={[...rows].reverse()} valueKey={trendKey} color={trendColor} width={64} height={22} />
          )}
        </div>
        {rows.length > 10 && (
          <button
            type="button"
            className="text-xs text-brand-light hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show 10' : 'Show 30'}
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-border">
                {cols.map((h) => (
                  <th key={h} className="text-left px-3 py-3 text-xs text-content-muted font-medium uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td className="px-3 py-5 text-content-muted" colSpan={cols.length}>No game log available for this season.</td>
                </tr>
              )}
              {visible.map((g) => (
                <tr key={`${g.gamePk}-${g.date}`} className="border-b border-bg-border/40 hover:bg-bg-elevated transition-colors">
                  <td className="px-3 py-2.5 text-content-secondary whitespace-nowrap">{formatDateShort(g.date)}</td>
                  <td className="px-3 py-2.5 text-content-secondary whitespace-nowrap">{g.isHome ? 'vs' : '@'} {g.opponent || '-'}</td>
                  <td className="px-3 py-2.5 text-content-secondary whitespace-nowrap">{g.isWin ? 'W' : 'L'}</td>
                  {group === 'pitching' ? (
                    <>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.ip ?? '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.er ?? '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.h ?? '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.hr ?? '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.bb ?? '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.so ?? '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.era ?? '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.whip ?? '-'}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.ab ?? '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.h ?? '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.hr ?? '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.rbi ?? '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.bb ?? '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.so ?? '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">{g.ops ?? '-'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function BattingTab({ mlbStats, statcast, projection, gameLog }) {
  const s = mlbStats || {}
  const sc = statcast?.summary || {}
  const p = projection?.projections || {}
  const games = gameLog?.games || []

  const fmt = (v, d = 3) => v != null ? Number(v).toFixed(d) : null

  const gaugeStats = [
    { label: 'Exit Velocity', value: sc.avgExitVelo != null ? `${sc.avgExitVelo} mph` : null, percentile: approxPercentile(sc.avgExitVelo, BATTING_THRESHOLDS.avgExitVelo) },
    { label: 'Hard Hit%',     value: sc.hardHitPct  != null ? `${sc.hardHitPct}%`  : null, percentile: approxPercentile(sc.hardHitPct,  BATTING_THRESHOLDS.hardHitPct) },
    { label: 'Barrel%',       value: sc.barrelPct   != null ? `${sc.barrelPct}%`   : null, percentile: approxPercentile(sc.barrelPct,   BATTING_THRESHOLDS.barrelPct) },
    { label: 'xwOBA',         value: fmt(sc.xwOBA),                                         percentile: approxPercentile(sc.xwOBA,       BATTING_THRESHOLDS.xwOBA) },
    { label: 'Sprint Speed',  value: sc.sprintSpeed != null ? `${sc.sprintSpeed} ft/s` : null, percentile: approxPercentile(sc.sprintSpeed, BATTING_THRESHOLDS.sprintSpeed) },
  ]

  return (
    <div className="space-y-6">
      {/* Traditional stats */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest">Traditional</h3>
          <span className="text-[11px] text-content-muted">Pace vs {projection?.source?.toUpperCase?.() || 'STEAMER'}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <StatCard label="AVG" value={fmt(s.avg)} percentile={approxPercentile(s.avg, BATTING_THRESHOLDS.avg)} comparison={projectionComparison({ current: s.avg, projected: p.avg, decimals: 3 })} />
          <StatCard label="OBP" value={fmt(s.obp)} percentile={approxPercentile(s.obp, BATTING_THRESHOLDS.obp)} comparison={projectionComparison({ current: s.obp, projected: p.obp, decimals: 3 })} />
          <StatCard label="SLG" value={fmt(s.slg)} percentile={approxPercentile(s.slg, BATTING_THRESHOLDS.slg)} comparison={projectionComparison({ current: s.slg, projected: p.slg, decimals: 3 })} />
          <StatCard label="OPS" value={fmt(s.ops)} percentile={approxPercentile(s.ops, BATTING_THRESHOLDS.ops)} comparison={projectionComparison({ current: s.ops, projected: p.ops, decimals: 3 })} />
          <StatCard
            label="HR"
            value={s.homeRuns}
            percentile={approxPercentile(s.homeRuns, BATTING_THRESHOLDS.homeRuns)}
            progress={projectionProgress({ current: s.homeRuns, projectedTotal: p.homeRuns })}
          />
          <StatCard
            label="RBI"
            value={s.rbi}
            percentile={approxPercentile(s.rbi, BATTING_THRESHOLDS.rbi)}
            progress={projectionProgress({ current: s.rbi, projectedTotal: p.rbi })}
          />
          <StatCard
            label="SB"
            value={s.stolenBases}
            percentile={approxPercentile(s.stolenBases, BATTING_THRESHOLDS.stolenBases)}
            progress={projectionProgress({ current: s.stolenBases, projectedTotal: p.stolenBases })}
          />
          <StatCard
            label="K"
            value={s.strikeOuts}
            percentile={approxPercentile(s.strikeOuts, BATTING_THRESHOLDS.strikeOuts)}
            invert
            progress={projectionProgress({ current: s.strikeOuts, projectedTotal: p.strikeOuts })}
          />
          <StatCard
            label="BB"
            value={s.baseOnBalls}
            progress={projectionProgress({ current: s.baseOnBalls, projectedTotal: p.baseOnBalls })}
          />
          <StatCard label="G" value={s.gamesPlayed} />
        </div>
      </section>

      {/* Statcast */}
      <section>
        <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">Statcast</h3>
        {statcast?.error ? (
          <div className="card p-4 text-content-muted text-sm">Statcast data unavailable: {statcast.error}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <StatCard label="Exit Velo" value={sc.avgExitVelo} subtitle="avg mph" percentile={approxPercentile(sc.avgExitVelo, BATTING_THRESHOLDS.avgExitVelo)} />
            <StatCard label="Max EV" value={sc.maxExitVelo} subtitle="mph" />
            <StatCard label="Hard Hit%" value={sc.hardHitPct != null ? `${sc.hardHitPct}%` : null} percentile={approxPercentile(sc.hardHitPct, BATTING_THRESHOLDS.hardHitPct)} />
            <StatCard label="Barrel%" value={sc.barrelPct != null ? `${sc.barrelPct}%` : null} percentile={approxPercentile(sc.barrelPct, BATTING_THRESHOLDS.barrelPct)} />
            <StatCard label="xwOBA" value={fmt(sc.xwOBA)} percentile={approxPercentile(sc.xwOBA, BATTING_THRESHOLDS.xwOBA)} />
            <StatCard label="xBA" value={fmt(sc.xBA)} />
            <StatCard label="Launch Angle" value={sc.avgLaunchAngle != null ? `${sc.avgLaunchAngle}°` : null} />
            <StatCard label="Sweet Spot%" value={sc.sweetSpotPct != null ? `${sc.sweetSpotPct}%` : null} />
            <StatCard label="Sprint Speed" value={sc.sprintSpeed != null ? `${sc.sprintSpeed} ft/s` : null} percentile={approxPercentile(sc.sprintSpeed, BATTING_THRESHOLDS.sprintSpeed)} />
          </div>
        )}
      </section>

      {/* Statcast percentile gauges */}
      {gaugeStats.some(g => g.percentile != null) && (
        <section>
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">Statcast Percentiles</h3>
          <div className="card p-4">
            <PercentileGauge stats={gaugeStats} />
          </div>
        </section>
      )}

      {/* Exit velocity beeswarm */}
      {sc.avgExitVelo != null && (
        <section>
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">Exit Velocity vs League</h3>
          <div className="card p-4">
            <BeeswarmChart
              value={sc.avgExitVelo}
              label="Avg Exit Velocity (mph)"
              thresholds={BATTING_THRESHOLDS.avgExitVelo}
              format={v => `${v.toFixed(1)} mph`}
            />
          </div>
        </section>
      )}

      {/* Spray chart + OPS trend side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {statcast?.sprayData?.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">Spray Chart</h3>
            <div className="card p-4">
              <SprayChart data={statcast.sprayData} />
            </div>
          </section>
        )}

        {games.length > 3 && (
          <section>
            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">
              OPS Trend
              <span className="ml-2 font-normal normal-case text-[10px]">({games.length}-game rolling avg)</span>
            </h3>
            <div className="card p-4">
              <RollingAverageChart
                data={[...games].reverse()}
                valueKey="ops"
                valueLabel="OPS"
                windowSize={10}
              />
            </div>
          </section>
        )}
      </div>

      <RecentGameLog group="hitting" rows={games} />
    </div>
  )
}

function PitchingTab({ mlbStats, statcast, projection, gameLog }) {
  const s = mlbStats || {}
  const p = projection?.projections || {}
  const games = gameLog?.games || []
  const sc = statcast?.summary || {}

  const fmt = (v, d = 2) => v != null ? Number(v).toFixed(d) : null

  const pitchGaugeStats = [
    { label: 'ERA',       value: fmt(s.era),   percentile: approxPercentile(s.era,   PITCHING_THRESHOLDS.era),   invert: true },
    { label: 'WHIP',      value: fmt(s.whip),  percentile: approxPercentile(s.whip,  PITCHING_THRESHOLDS.whip),  invert: true },
    { label: 'K/9',       value: fmt(s.strikeoutsPer9Inn), percentile: approxPercentile(s.strikeoutsPer9Inn, PITCHING_THRESHOLDS.strikeoutsPer9Inn) },
    { label: 'BB/9',      value: fmt(s.walksPer9Inn),      percentile: approxPercentile(s.walksPer9Inn, PITCHING_THRESHOLDS.walksPer9Inn), invert: true },
  ]

  return (
    <div className="space-y-6">
      {/* Traditional */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest">Traditional</h3>
          <span className="text-[11px] text-content-muted">Pace vs {projection?.source?.toUpperCase?.() || 'STEAMER'}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <StatCard label="ERA" value={fmt(s.era)} percentile={approxPercentile(s.era, PITCHING_THRESHOLDS.era)} invert comparison={projectionComparison({ current: s.era, projected: p.era, inverse: true, decimals: 2 })} />
          <StatCard label="WHIP" value={fmt(s.whip)} percentile={approxPercentile(s.whip, PITCHING_THRESHOLDS.whip)} invert comparison={projectionComparison({ current: s.whip, projected: p.whip, inverse: true, decimals: 2 })} />
          <StatCard
            label="K"
            value={s.strikeOuts}
            percentile={approxPercentile(s.strikeOuts, PITCHING_THRESHOLDS.strikeOuts)}
            progress={projectionProgress({ current: s.strikeOuts, projectedTotal: p.strikeOuts })}
          />
          <StatCard
            label="BB"
            value={s.baseOnBalls}
            progress={projectionProgress({ current: s.baseOnBalls, projectedTotal: p.baseOnBalls })}
          />
          <StatCard
            label="W"
            value={s.wins}
            percentile={approxPercentile(s.wins, PITCHING_THRESHOLDS.wins)}
            progress={projectionProgress({ current: s.wins, projectedTotal: p.wins })}
          />
          <StatCard label="L" value={s.losses} />
          <StatCard
            label="SV"
            value={s.saves}
            progress={projectionProgress({ current: s.saves, projectedTotal: p.saves })}
          />
          <StatCard
            label="IP"
            value={fmt(s.inningsPitched, 1)}
            progress={projectionProgress({ current: Number(s.inningsPitched), projectedTotal: p.inningsPitched })}
          />
          <StatCard label="K/9" value={fmt(s.strikeoutsPer9Inn)} percentile={approxPercentile(s.strikeoutsPer9Inn, PITCHING_THRESHOLDS.strikeoutsPer9Inn)} />
          <StatCard label="BB/9" value={fmt(s.walksPer9Inn)} percentile={approxPercentile(s.walksPer9Inn, PITCHING_THRESHOLDS.walksPer9Inn)} invert />
        </div>
      </section>

      {/* Season percentile gauges */}
      {pitchGaugeStats.some(g => g.percentile != null) && (
        <section>
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">Season Percentiles</h3>
          <div className="card p-4">
            <PercentileGauge stats={pitchGaugeStats} />
          </div>
        </section>
      )}

      {/* Statcast arsenal */}
      {statcast?.error ? (
        <div className="card p-4 text-content-muted text-sm">Statcast data unavailable: {statcast.error}</div>
      ) : statcast?.pitchTypes?.length > 0 ? (
        <>
          <section>
            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">
              Pitch Arsenal · {statcast.totalPitches?.toLocaleString()} pitches
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="card p-4">
                <div className="text-xs text-content-muted mb-3">Usage</div>
                <PitchMixChart pitchTypes={statcast.pitchTypes} />
              </div>
              <div className="card p-4">
                <div className="text-xs text-content-muted mb-3">Pitch Location</div>
                <PitchLocationChart
                  locationData={statcast.locationData || []}
                  pitchTypes={statcast.pitchTypes}
                />
              </div>
            </div>
          </section>

          {/* Pitch metric bars + Sankey outcome flow */}
          <section>
            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">Pitch Metrics</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card p-4">
                <div className="text-xs text-content-muted mb-3">Whiff%</div>
                <PitchBarChart pitchTypes={statcast.pitchTypes} metric="whiffRate" format={v => `${v.toFixed(1)}%`} />
              </div>
              <div className="card p-4">
                <div className="text-xs text-content-muted mb-3">Avg Velocity</div>
                <PitchBarChart pitchTypes={statcast.pitchTypes} metric="avgVelo" format={v => `${v.toFixed(1)}`} />
              </div>
            </div>
          </section>

          {/* Pitch outcome Sankey */}
          {statcast.pitchOutcomes && Object.keys(statcast.pitchOutcomes).length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">Pitch Outcome Flow</h3>
              <div className="card p-4">
                <SankeyChart pitchOutcomes={statcast.pitchOutcomes} />
              </div>
            </section>
          )}

          {/* Pitch-by-pitch table */}
          <section>
            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">Pitch Breakdown</h3>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bg-border">
                      {['Pitch', 'Usage', 'Velo', 'Spin', 'Break', 'Whiff%'].map((h) => (
                        <th key={h} className="text-left text-xs text-content-muted font-medium uppercase tracking-wider px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {statcast.pitchTypes.map((p) => (
                      <tr key={p.type} className="border-b border-bg-border/50 hover:bg-bg-elevated transition-colors">
                        <td className="px-4 py-3 font-medium text-content-primary">{p.name}</td>
                        <td className="px-4 py-3 font-mono text-content-secondary">{p.usage?.toFixed(1)}%</td>
                        <td className="px-4 py-3 font-mono text-content-secondary">{p.avgVelo ?? '—'}</td>
                        <td className="px-4 py-3 font-mono text-content-secondary">{p.avgSpin ? Math.round(p.avgSpin) : '—'}</td>
                        <td className="px-4 py-2">
                          <PitchBreakArrow type={p.type} hBreak={p.hBreak} vBreak={p.vBreak} />
                        </td>
                        <td className="px-4 py-3 font-mono text-content-secondary">{p.whiffRate != null ? `${p.whiffRate}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="card p-6 text-content-muted text-sm text-center">
          No Statcast data found for this season. Try selecting a different season.
        </div>
      )}

      {games.length > 3 && (
        <section>
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">
            ERA Trend
            <span className="ml-2 font-normal normal-case text-[10px]">(rolling {Math.min(games.length, 10)}-start avg)</span>
          </h3>
          <div className="card p-4">
            <RollingAverageChart
              data={[...games].reverse()}
              valueKey="era"
              valueLabel="ERA"
              color="#EF4444"
              windowSize={5}
            />
          </div>
        </section>
      )}

      <RecentGameLog group="pitching" rows={games} />
    </div>
  )
}

function FieldingTab({ mlbStats }) {
  const s = mlbStats || {}
  const fmt = (v, d = 3) => v != null ? Number(v).toFixed(d) : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Fielding%" value={fmt(s.fielding)} />
        <StatCard label="Errors" value={s.errors} />
        <StatCard label="Putouts" value={s.putOuts} />
        <StatCard label="Assists" value={s.assists} />
        <StatCard label="Double Plays" value={s.doublePlays} />
        <StatCard label="Innings" value={s.innings ? Number(s.innings).toFixed(1) : null} />
      </div>
      <div className="card p-4 text-sm text-content-muted text-center">
        Advanced fielding metrics (OAA, DRS) require Baseball Savant / Baseball Reference integration.
      </div>
    </div>
  )
}

// -------------------------------------------------------------------
// Main profile component
// -------------------------------------------------------------------

export default function PlayerProfile() {
  const { id } = useParams()
  const playerId = Number(id)
  const [season, setSeason] = useState(CURRENT_SEASON)
  const [activeTab, setActiveTab] = useState('batting')
  const [projectionSource, setProjectionSource] = useState('steamer')

  const { data: info, isLoading: loadingInfo } = useQuery({
    queryKey: ['player-info', playerId],
    queryFn: () => api.players.info(playerId),
    enabled: !!playerId,
  })

  useEffect(() => {
    if (!info) return

    const pos = info.position
    const isTwoWay = pos === 'TWP'
    const isPrimaryPitcher = ['SP', 'RP', 'P'].includes(pos)

    if (isPrimaryPitcher && !isTwoWay) {
      setActiveTab('pitching')
    } else {
      setActiveTab('batting')
    }
  }, [info?.id, info?.position])

  const { data: mlbStats, isLoading: loadingStats } = useQuery({
    queryKey: ['player-stats', playerId, season],
    queryFn: () => api.stats.season(playerId, season),
    enabled: !!playerId,
  })

  const isPitcher = info && ['SP', 'RP', 'P'].includes(info.position)

  const { data: statcastPitching, isLoading: loadingSCPitching } = useQuery({
    queryKey: ['statcast-pitching', playerId, season],
    queryFn: () => api.stats.statcastPitching(playerId, season),
    enabled: !!playerId && activeTab === 'pitching',
    staleTime: 15 * 60 * 1000,
  })

  const { data: statcastBatting, isLoading: loadingSCBatting } = useQuery({
    queryKey: ['statcast-batting', playerId, season],
    queryFn: () => api.stats.statcastBatting(playerId, season),
    enabled: !!playerId && activeTab === 'batting',
    staleTime: 15 * 60 * 1000,
  })

  const { data: battingLog, isLoading: loadingBattingLog } = useQuery({
    queryKey: ['player-game-log', playerId, season, 'hitting'],
    queryFn: () => api.stats.gameLog(playerId, season, 'hitting', 30),
    enabled: !!playerId && activeTab === 'batting',
    staleTime: 5 * 60 * 1000,
  })

  const { data: pitchingLog, isLoading: loadingPitchingLog } = useQuery({
    queryKey: ['player-game-log', playerId, season, 'pitching'],
    queryFn: () => api.stats.gameLog(playerId, season, 'pitching', 30),
    enabled: !!playerId && activeTab === 'pitching',
    staleTime: 5 * 60 * 1000,
  })

  const { data: battingProjection, isLoading: loadingBattingProjection } = useQuery({
    queryKey: ['player-projection', playerId, season, 'hitting', projectionSource],
    queryFn: () => api.stats.projections(playerId, season, 'hitting', projectionSource),
    enabled: !!playerId && activeTab === 'batting',
    staleTime: 10 * 60 * 1000,
  })

  const { data: pitchingProjection, isLoading: loadingPitchingProjection } = useQuery({
    queryKey: ['player-projection', playerId, season, 'pitching', projectionSource],
    queryFn: () => api.stats.projections(playerId, season, 'pitching', projectionSource),
    enabled: !!playerId && activeTab === 'pitching',
    staleTime: 10 * 60 * 1000,
  })

  if (loadingInfo) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="card h-36" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <div key={i} className="card h-20" />)}
        </div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="card p-16 text-center">
        <div className="text-4xl mb-3">🤷</div>
        <div className="text-content-secondary">Player not found.</div>
        <Link to="/" className="btn-primary mt-4 inline-block">Back to today</Link>
      </div>
    )
  }

  const tabs = [
    { id: 'batting', label: 'Batting' },
    { id: 'pitching', label: 'Pitching' },
    { id: 'fielding', label: 'Fielding' },
  ]

  const loading = loadingStats || loadingSCPitching || loadingSCBatting || loadingBattingLog || loadingPitchingLog || loadingBattingProjection || loadingPitchingProjection

  return (
    <div className="space-y-6">
      <PlayerHeader
        info={info}
        season={season}
        onSeasonChange={setSeason}
        projectionSource={projectionSource}
        onProjectionSourceChange={setProjectionSource}
      />

      <FactoidsPanel
        queryKey={['player-factoids', playerId, season]}
        queryFn={() => api.factoids.player(playerId, season)}
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-bg-surface border border-bg-border rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={activeTab === t.id ? 'tab-active' : 'tab-inactive'}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && activeTab !== 'fielding' && (
        <div className="flex items-center gap-2 text-content-muted text-sm">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          Loading stats…
        </div>
      )}

      {activeTab === 'batting' && (
        <BattingTab
          mlbStats={mlbStats?.hitting}
          statcast={statcastBatting}
          projection={battingProjection}
          gameLog={battingLog}
        />
      )}
      {activeTab === 'pitching' && (
        <PitchingTab
          mlbStats={mlbStats?.pitching}
          statcast={statcastPitching}
          projection={pitchingProjection}
          gameLog={pitchingLog}
        />
      )}
      {activeTab === 'fielding' && (
        <FieldingTab mlbStats={mlbStats?.fielding} />
      )}
    </div>
  )
}
