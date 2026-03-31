import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { api } from '../api'
import { StatCard, InlineStatRow } from '../components/StatCard'
import PitchMovementChart from '../components/charts/PitchMovementChart'
import PitchMixChart from '../components/charts/PitchMixChart'
import SprayChart from '../components/charts/SprayChart'

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

// -------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------

function PlayerHeader({ info, season, onSeasonChange }) {
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
                    <div className="flex items-center gap-1.5">
                      {info.teamId && (
                        <img
                          src={`https://www.mlbstatic.com/team-logos/${info.teamId}.svg`}
                          className="w-4 h-4 object-contain"
                          alt=""
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      )}
                      <span className="text-content-secondary">{info.team}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
            {/* Season selector */}
            <select
              value={season}
              onChange={(e) => onSeasonChange(Number(e.target.value))}
              className="bg-bg-elevated border border-bg-border text-content-primary text-sm rounded-lg px-3 py-1.5 outline-none focus:border-brand"
            >
              {[2024, 2023, 2022, 2021, 2020].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
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

function BattingTab({ mlbStats, statcast }) {
  const s = mlbStats || {}
  const sc = statcast?.summary || {}

  const fmt = (v, d = 3) => v != null ? Number(v).toFixed(d) : null

  return (
    <div className="space-y-6">
      {/* Traditional stats */}
      <section>
        <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">Traditional</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <StatCard label="AVG" value={fmt(s.avg)} percentile={approxPercentile(s.avg, BATTING_THRESHOLDS.avg)} />
          <StatCard label="OBP" value={fmt(s.obp)} percentile={approxPercentile(s.obp, BATTING_THRESHOLDS.obp)} />
          <StatCard label="SLG" value={fmt(s.slg)} percentile={approxPercentile(s.slg, BATTING_THRESHOLDS.slg)} />
          <StatCard label="OPS" value={fmt(s.ops)} percentile={approxPercentile(s.ops, BATTING_THRESHOLDS.ops)} />
          <StatCard label="HR" value={s.homeRuns} percentile={approxPercentile(s.homeRuns, BATTING_THRESHOLDS.homeRuns)} />
          <StatCard label="RBI" value={s.rbi} percentile={approxPercentile(s.rbi, BATTING_THRESHOLDS.rbi)} />
          <StatCard label="SB" value={s.stolenBases} percentile={approxPercentile(s.stolenBases, BATTING_THRESHOLDS.stolenBases)} />
          <StatCard label="K" value={s.strikeOuts} percentile={approxPercentile(s.strikeOuts, BATTING_THRESHOLDS.strikeOuts)} invert />
          <StatCard label="BB" value={s.baseOnBalls} />
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

      {/* Spray chart */}
      {statcast?.sprayData?.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">Spray Chart</h3>
          <div className="card p-4">
            <SprayChart data={statcast.sprayData} />
          </div>
        </section>
      )}
    </div>
  )
}

function PitchingTab({ mlbStats, statcast }) {
  const s = mlbStats || {}
  const sc = statcast?.summary || {}

  const fmt = (v, d = 2) => v != null ? Number(v).toFixed(d) : null

  return (
    <div className="space-y-6">
      {/* Traditional */}
      <section>
        <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">Traditional</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <StatCard label="ERA" value={fmt(s.era)} percentile={approxPercentile(s.era, PITCHING_THRESHOLDS.era)} invert />
          <StatCard label="WHIP" value={fmt(s.whip)} percentile={approxPercentile(s.whip, PITCHING_THRESHOLDS.whip)} invert />
          <StatCard label="K" value={s.strikeOuts} percentile={approxPercentile(s.strikeOuts, PITCHING_THRESHOLDS.strikeOuts)} />
          <StatCard label="BB" value={s.baseOnBalls} />
          <StatCard label="W" value={s.wins} percentile={approxPercentile(s.wins, PITCHING_THRESHOLDS.wins)} />
          <StatCard label="L" value={s.losses} />
          <StatCard label="SV" value={s.saves} />
          <StatCard label="IP" value={fmt(s.inningsPitched, 1)} />
          <StatCard label="K/9" value={fmt(s.strikeoutsPer9Inn)} percentile={approxPercentile(s.strikeoutsPer9Inn, PITCHING_THRESHOLDS.strikeoutsPer9Inn)} />
          <StatCard label="BB/9" value={fmt(s.walksPer9Inn)} percentile={approxPercentile(s.walksPer9Inn, PITCHING_THRESHOLDS.walksPer9Inn)} invert />
        </div>
      </section>

      {/* Statcast arsenal */}
      {statcast?.error ? (
        <div className="card p-4 text-content-muted text-sm">Statcast data unavailable: {statcast.error}</div>
      ) : statcast?.pitchTypes?.length > 0 ? (
        <>
          <section>
            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">
              Pitch Arsenal · {statcast.totalPitches?.toLocaleString()} pitches
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card p-4">
                <div className="text-xs text-content-muted mb-3">Usage</div>
                <PitchMixChart pitchTypes={statcast.pitchTypes} />
              </div>
              <div className="card p-4">
                <div className="text-xs text-content-muted mb-3">Movement Profile</div>
                <PitchMovementChart data={statcast.movementData} />
              </div>
            </div>
          </section>

          {/* Pitch-by-pitch table */}
          <section>
            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">Pitch Breakdown</h3>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bg-border">
                      {['Pitch', 'Usage', 'Velo', 'Spin', 'H-Break', 'V-Break', 'Whiff%'].map((h) => (
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
                        <td className="px-4 py-3 font-mono text-content-secondary">{p.hBreak != null ? `${p.hBreak}"` : '—'}</td>
                        <td className="px-4 py-3 font-mono text-content-secondary">{p.vBreak != null ? `${p.vBreak}"` : '—'}</td>
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
  const [season, setSeason] = useState(2024)
  const [activeTab, setActiveTab] = useState('batting')

  const { data: info, isLoading: loadingInfo } = useQuery({
    queryKey: ['player-info', playerId],
    queryFn: () => api.players.info(playerId),
    enabled: !!playerId,
  })

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

  const loading = loadingStats || loadingSCPitching || loadingSCBatting

  return (
    <div className="space-y-6">
      <PlayerHeader info={info} season={season} onSeasonChange={setSeason} />

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
        <BattingTab mlbStats={mlbStats?.hitting} statcast={statcastBatting} />
      )}
      {activeTab === 'pitching' && (
        <PitchingTab mlbStats={mlbStats?.pitching} statcast={statcastPitching} />
      )}
      {activeTab === 'fielding' && (
        <FieldingTab mlbStats={mlbStats?.fielding} />
      )}
    </div>
  )
}
