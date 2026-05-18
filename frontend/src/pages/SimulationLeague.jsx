import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { ballparkImageForTeam } from '../lib/ballparkImages'
import SimInsightPanel from '../components/SimInsightPanel'
import { TeamLogo, SimPlayerAvatar } from '../components/sim/SimUI'
import { newsSeenKey } from './SimulationNews'

// ─────────────────────────────────────────────────────────────────
// Win-probability panel (Monte Carlo)
// ─────────────────────────────────────────────────────────────────

function ProbabilityPanel({ leagueId, game, onClose }) {
  const [runs, setRuns] = useState(100)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey:  ['sim-probs', leagueId, game.id, runs],
    queryFn:   () => api.simulations.probabilities(leagueId, game.id, runs),
    staleTime: 0,
    enabled:   true,
  })

  const busy = isLoading || isFetching

  if (data?.error) {
    return (
      <div className="card p-4 text-xs text-red-400">{data.error}</div>
    )
  }

  const awayPct = data?.away_win_pct ?? 50
  const homePct = data?.home_win_pct ?? 50
  const awayFav = awayPct > homePct

  return (
    <div className="card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TeamLogo teamId={game.away_team_id} abbr={game.away_team_abbr} color={game.away_team_color} size={22} />
          <span className="font-bold text-sm text-content-primary">{game.away_team_abbr}</span>
          <span className="text-content-muted text-xs">@</span>
          <TeamLogo teamId={game.home_team_id} abbr={game.home_team_abbr} color={game.home_team_color} size={22} />
          <span className="font-bold text-sm text-content-primary">{game.home_team_abbr}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand/70 bg-brand/10 border border-brand/20 px-1.5 py-0.5 rounded ml-1">
            Win Probability
          </span>
        </div>
        <button type="button" onClick={onClose} className="text-content-muted hover:text-content-primary text-lg leading-none">×</button>
      </div>

      {busy ? (
        <div className="flex items-center justify-center gap-2 py-6 text-content-muted text-sm">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          Running {runs} simulations…
        </div>
      ) : data ? (
        <>
          {/* Big probability bar */}
          <div className="space-y-2">
            <div className="flex h-8 rounded-lg overflow-hidden">
              <div
                className="flex items-center justify-center text-xs font-bold text-white transition-all"
                style={{ width: `${awayPct}%`, background: game.away_team_color || '#555' }}
              >
                {awayPct >= 20 && `${awayPct}%`}
              </div>
              <div
                className="flex items-center justify-center text-xs font-bold text-white transition-all"
                style={{ width: `${homePct}%`, background: game.home_team_color || '#555' }}
              >
                {homePct >= 20 && `${homePct}%`}
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <div className={`font-semibold ${awayFav ? 'text-content-primary' : 'text-content-muted'}`}>
                {game.away_team_abbr} <span className="font-mono">{awayPct}%</span>
                {awayFav && <span className="ml-1 text-[10px] text-brand">Favored</span>}
              </div>
              <div className={`font-semibold ${!awayFav ? 'text-content-primary' : 'text-content-muted'}`}>
                {!awayFav && <span className="mr-1 text-[10px] text-brand">Favored</span>}
                <span className="font-mono">{homePct}%</span> {game.home_team_abbr}
              </div>
            </div>
          </div>

          {/* Avg score */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg-elevated rounded-lg p-3 text-center border border-bg-border">
              <div className="text-2xl font-black font-mono tabular-nums text-content-primary">{data.avg_away_score}</div>
              <div className="text-[10px] font-semibold text-content-muted uppercase tracking-wide mt-0.5">{game.away_team_abbr} avg</div>
            </div>
            <div className="bg-bg-elevated rounded-lg p-3 text-center border border-bg-border">
              <div className="text-2xl font-black font-mono tabular-nums text-content-primary">{data.avg_home_score}</div>
              <div className="text-[10px] font-semibold text-content-muted uppercase tracking-wide mt-0.5">{game.home_team_abbr} avg</div>
            </div>
          </div>

          {/* Score distribution heatmap */}
          {data.distribution?.length > 0 && (
            <ScoreHeatmap dist={data.distribution} awayAbbr={game.away_team_abbr} homeAbbr={game.home_team_abbr} />
          )}
        </>
      ) : null}

      {/* Run count selector + re-run */}
      <div className="flex items-center gap-2 pt-1 border-t border-bg-border">
        <span className="text-xs text-content-muted shrink-0">Sims:</span>
        {[100, 250, 500].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setRuns(n)}
            className={`px-2 py-1 rounded text-xs font-mono font-semibold border transition-colors ${
              runs === n
                ? 'bg-brand/10 text-brand border-brand/30'
                : 'border-bg-border text-content-muted hover:border-brand/30'
            }`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => refetch()}
          disabled={busy}
          className="ml-auto text-xs text-brand hover:text-brand-light disabled:opacity-40 font-medium whitespace-nowrap shrink-0"
        >
          Re-run
        </button>
      </div>
    </div>
  )
}

function ScoreHeatmap({ dist, awayAbbr, homeAbbr }) {
  const counts = {}
  dist.forEach(({ h, a }) => {
    const key = `${a}-${h}`
    counts[key] = (counts[key] || 0) + 1
  })
  const top = Object.entries(counts)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 8)
  const max = top[0]?.[1] || 1

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-content-muted uppercase tracking-wide">Most common scores</p>
      <div className="grid grid-cols-4 gap-1.5">
        {top.map(([key, count]) => {
          const [a, h] = key.split('-')
          const pct = Math.round(count / dist.length * 100)
          const intensity = count / max
          return (
            <div
              key={key}
              className="rounded-md p-2 text-center border border-bg-border relative overflow-hidden"
              style={{ background: `rgba(var(--color-brand) / ${0.05 + intensity * 0.2})` }}
            >
              <div className="text-xs font-mono font-bold text-content-primary">{a}–{h}</div>
              <div className="text-[10px] text-content-muted">{pct}%</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Accuracy / backtesting panel
// ─────────────────────────────────────────────────────────────────

function AccuracyPanel({ leagueId }) {
  const { data, isLoading } = useQuery({
    queryKey:  ['sim-analysis', leagueId],
    queryFn:   () => api.simulations.analysis(leagueId),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3 text-content-muted">
        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Calculating accuracy…</span>
      </div>
    )
  }

  if (data?.error) {
    return <div className="card p-6 text-center text-red-400 text-sm">{data.error}</div>
  }

  if (!data || data.total === 0) {
    return (
      <div className="card p-10 text-center space-y-3">
        <div className="text-3xl">📊</div>
        <p className="text-content-secondary text-sm font-semibold">No replayed games yet</p>
        <p className="text-content-muted text-xs max-w-64 mx-auto">
          Use the <span className="text-emerald-400 font-medium">Replay</span> button on any real game to run our projections and compare vs the actual result.
        </p>
      </div>
    )
  }

  const { total, correct_winners, win_accuracy, avg_run_error, games } = data

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <div className="text-3xl font-black font-mono tabular-nums text-content-primary">{win_accuracy}%</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-content-muted mt-1">Win Accuracy</div>
          <div className="text-[10px] text-content-muted mt-0.5">{correct_winners} / {total}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl font-black font-mono tabular-nums text-content-primary">{avg_run_error}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-content-muted mt-1">Avg Run Error</div>
          <div className="text-[10px] text-content-muted mt-0.5">runs per game</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl font-black font-mono tabular-nums text-content-primary">{total}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-content-muted mt-1">Replayed</div>
          <div className="text-[10px] text-content-muted mt-0.5">games</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-bg-border">
          <h3 className="text-xs font-bold uppercase tracking-wide text-content-secondary">Game-by-Game Results</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-bg-border bg-bg-elevated">
                <th className="px-4 py-2 text-left font-semibold text-content-muted">Date</th>
                <th className="px-4 py-2 text-left font-semibold text-content-muted">Matchup</th>
                <th className="px-4 py-2 text-center font-semibold text-content-muted">Predicted</th>
                <th className="px-4 py-2 text-center font-semibold text-content-muted">Actual</th>
                <th className="px-4 py-2 text-center font-semibold text-content-muted">Run Err</th>
                <th className="px-4 py-2 text-center font-semibold text-content-muted">Winner</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g, i) => (
                <tr key={g.id ?? i} className="border-b border-bg-border/40 hover:bg-bg-surface transition-colors">
                  <td className="px-4 py-2.5 text-content-muted font-mono whitespace-nowrap">
                    {g.game_date
                      ? new Date(g.game_date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Link to={`/simulation/${leagueId}/team/${g.away_team_id}`} className="flex items-center gap-1 hover:opacity-75 transition-opacity">
                        <TeamLogo teamId={g.away_team_id} abbr={g.away_team_abbr} color={g.away_team_color} size={16} />
                        <span className="font-mono font-bold text-content-primary text-[11px]">{g.away_team_abbr}</span>
                      </Link>
                      <span className="text-content-muted text-[10px]">@</span>
                      <Link to={`/simulation/${leagueId}/team/${g.home_team_id}`} className="flex items-center gap-1 hover:opacity-75 transition-opacity">
                        <TeamLogo teamId={g.home_team_id} abbr={g.home_team_abbr} color={g.home_team_color} size={16} />
                        <span className="font-mono font-bold text-content-primary text-[11px]">{g.home_team_abbr}</span>
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono font-bold text-content-primary tabular-nums">
                    {g.sim_away}–{g.sim_home}
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono font-bold text-emerald-400 tabular-nums">
                    {g.act_away}–{g.act_home}
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-content-muted">
                    {g.run_error}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                      g.correct_winner
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {g.correct_winner ? 'Correct' : 'Wrong'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtPct(pct) {
  return pct != null ? pct.toFixed(3).replace(/^0/, '') : '.000'
}

function stepDate(iso, delta) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────
// Standings panel
// ─────────────────────────────────────────────────────────────────

const DIVISION_ORDER = ['East', 'Central', 'West']

function StandingsTable({ division, teams, leagueId }) {
  if (!teams?.length) return null
  return (
    <div>
      <div className="px-3 py-1.5 bg-bg-elevated border-b border-bg-border">
        <span className="text-[10px] font-bold uppercase tracking-widest text-content-muted">{division}</span>
      </div>
      <table className="w-full text-xs">
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.team_id} className={`border-b border-bg-border/40 hover:bg-bg-surface transition-colors ${i === 0 ? 'bg-bg-surface/50' : ''}`}>
              <td className="pl-3 pr-1 py-2 w-5 text-content-muted font-mono text-[10px]">{i + 1}</td>
              <td className="py-1.5 pr-2 font-medium text-content-primary">
                <Link
                  to={`/simulation/${leagueId}/team/${t.team_id}`}
                  className="flex items-center gap-1.5 hover:text-brand transition-colors"
                >
                  <TeamLogo teamId={t.team_id} abbr={t.abbr} color={t.color} size={20} />
                  <span className="font-mono font-bold text-[11px]">{t.abbr || t.name?.slice(0, 3).toUpperCase()}</span>
                </Link>
              </td>
              <td className="py-2 px-1 text-right font-mono text-content-primary">{t.w}</td>
              <td className="py-2 px-1 text-right font-mono text-content-muted">-</td>
              <td className="py-2 px-1 text-right font-mono text-content-primary">{t.l}</td>
              <td className="py-2 px-2 text-right font-mono font-medium text-content-secondary">{fmtPct(t.pct)}</td>
              <td className="py-2 pl-1 pr-3 text-right font-mono text-content-muted text-[10px]">{t.gb}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const STANDINGS_MODES = [
  { key: 'all',  label: 'All'  },
  { key: 'real', label: 'Real' },
  { key: 'sim',  label: 'Sim'  },
]

function StandingsPanel({ allStandings, realStandings, simStandings, activeLeague, onSetLeague, isLive, leagueId }) {
  const leagues = ['AL', 'NL']
  const [tab, setTab]   = useState(activeLeague || 'AL')
  const [mode, setMode] = useState('all')

  const standingsMap = { all: allStandings, real: realStandings, sim: simStandings }
  const standings = standingsMap[mode] || allStandings

  const divs = useMemo(() => {
    const data = standings?.[tab] || {}
    return DIVISION_ORDER.map(d => ({ division: d, teams: data[d] || [] }))
  }, [standings, tab])

  const modeLabel = mode === 'real' ? 'Real results only' : mode === 'sim' ? 'Simulated results only' : 'All results'

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="px-3 py-2.5 border-b border-bg-border space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-content-primary uppercase tracking-wide">Standings</h2>
          <div className="flex items-center rounded border border-bg-border overflow-hidden">
            {leagues.map(lg => (
              <button
                key={lg}
                type="button"
                onClick={() => { setTab(lg); onSetLeague?.(lg) }}
                className={`px-3 py-1 text-xs font-bold transition-colors ${tab === lg ? 'tab-active' : 'tab-inactive'}`}
              >
                {lg}
              </button>
            ))}
          </div>
        </div>

        {/* Real / Sim / All toggle — live mode only */}
        {isLive && (
          <>
            <div className="flex items-center gap-1">
              {STANDINGS_MODES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={`flex-1 py-0.5 rounded text-[10px] font-bold transition-colors border ${
                    mode === key
                      ? key === 'real'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : key === 'sim'
                        ? 'bg-brand/10 text-brand border-brand/30'
                        : 'bg-bg-elevated text-content-primary border-bg-border'
                      : 'text-content-muted border-transparent hover:border-bg-border'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-content-muted italic">{modeLabel}</p>
          </>
        )}
      </div>

      <div className="overflow-y-auto flex-1">
        {divs.every(d => !d.teams?.length) ? (
          <div className="py-10 text-center text-content-muted text-xs">
            No standings yet — simulate some games to populate.
          </div>
        ) : (
          divs.map(({ division, teams }) => (
            <StandingsTable key={division} division={division} teams={teams} leagueId={leagueId} />
          ))
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-bg-border bg-bg-elevated">
        <div className="flex gap-3 text-[10px] text-content-muted font-mono">
          <span className="flex-1">TEAM</span>
          <span className="w-4 text-right">W</span>
          <span className="w-3" />
          <span className="w-4 text-right">L</span>
          <span className="w-8 text-right">PCT</span>
          <span className="w-7 text-right pr-3">GB</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Game card (scoreboard style)
// ─────────────────────────────────────────────────────────────────

function GameCard({ game, leagueId, onSimulate, simulating, isQueued, bulkSimming, isLive, canSim }) {
  const [showProbs, setShowProbs] = useState(false)
  const [showReal, setShowReal]   = useState(false)

  const isFinal   = game.status === 'final'
  const hasActual = game.actual_away_score != null && game.actual_home_score != null
  const isSimming = simulating?.has?.(game.id) || (!isFinal && bulkSimming)
  const simLabel  = isFinal ? 'Re-sim' : 'Sim'

  const awayScore = isFinal ? (hasActual && showReal ? game.actual_away_score : game.away_score) : null
  const homeScore = isFinal ? (hasActual && showReal ? game.actual_home_score : game.home_score) : null
  const awayWon   = isFinal && awayScore > homeScore
  const homeWon   = isFinal && homeScore > awayScore

  const ballparkImage = ballparkImageForTeam(game.home_team_id)

  const awayPitcherLast = game.away_pitcher_name?.split(' ').pop()
  const homePitcherLast = game.home_pitcher_name?.split(' ').pop()

  return (
    <div className="space-y-2 h-full flex flex-col">
      <div className={`card relative overflow-hidden transition-all duration-200 flex flex-col flex-1 ${isQueued ? 'border-brand/40 animate-pulse' : 'hover:shadow-md'}`}>

        {/* Ballpark background */}
        {ballparkImage && (
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none"
            style={{ backgroundImage: `url(${ballparkImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            <div className="absolute inset-0 bg-gradient-to-b from-bg-base/60 via-bg-base/75 to-bg-base/95" />
          </div>
        )}

        {/* Header: SIM badge + status + toggle + Odds + Box Score */}
        <div className="relative z-10 flex items-center justify-between px-4 pt-3 pb-2 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest bg-brand/15 text-brand border border-brand/25 px-1.5 py-0.5 rounded-full shrink-0">
              SIM
            </span>
            <span className={`text-[10px] font-semibold uppercase tracking-wider shrink-0 ${
              isFinal ? (game.is_real ? 'text-emerald-400' : 'text-content-muted') : 'text-content-muted'
            }`}>
              {isFinal ? (game.is_real ? 'Real' : 'Final') : 'Upcoming'}
            </span>
            {hasActual && isFinal && (
              <div className="flex items-center rounded border border-bg-border overflow-hidden shrink-0">
                <button type="button" onClick={(e) => { e.stopPropagation(); setShowReal(false) }}
                  className={`px-1.5 py-0.5 text-[9px] font-bold transition-colors ${!showReal ? 'tab-active' : 'tab-inactive'}`}>
                  Sim
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); setShowReal(true) }}
                  className={`px-1.5 py-0.5 text-[9px] font-bold transition-colors ${showReal ? 'bg-emerald-500/10 text-emerald-400' : 'tab-inactive'}`}>
                  Real
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isFinal && (
              <button type="button"
                onClick={(e) => { e.stopPropagation(); setShowProbs(v => !v) }}
                className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full transition-colors ${
                  showProbs ? 'bg-brand/15 text-brand' : 'bg-bg-elevated text-content-secondary hover:text-content-primary'
                }`}>
                Odds
              </button>
            )}
            {isFinal && (
              <Link to={`/simulation/${leagueId}/game/${game.id}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-bg-elevated text-content-secondary hover:text-brand transition-colors">
                Box Score →
              </Link>
            )}
          </div>
        </div>

        {/* Matchup body */}
        <div className="relative z-10 px-4 pt-3 pb-5 flex-1">
          <div className="flex items-center justify-between gap-3">

            {/* Away team */}
            <Link
              to={`/simulation/${leagueId}/team/${game.away_team_id}`}
              onClick={e => e.stopPropagation()}
              className={`flex flex-col items-center gap-1 min-w-0 flex-1 hover:opacity-75 transition-opacity ${isFinal && !awayWon ? 'opacity-50' : ''}`}
            >
              <TeamLogo teamId={game.away_team_id} abbr={game.away_team_abbr} color={game.away_team_color} size={40} />
              <span className="text-sm font-semibold text-content-primary truncate">{game.away_team_abbr}</span>
            </Link>

            {/* Center: score or vs */}
            <div className="flex flex-col items-center gap-1 shrink-0 px-2">
              {isFinal ? (
                <>
                  <div className="flex items-center gap-3 font-mono tabular-nums text-[30px] leading-none">
                    <span className={awayWon ? 'text-content-primary font-bold' : 'text-content-muted font-semibold'}>{awayScore}</span>
                    <span className="text-content-muted text-base">–</span>
                    <span className={homeWon ? 'text-content-primary font-bold' : 'text-content-muted font-semibold'}>{homeScore}</span>
                  </div>
                  {hasActual && (
                    <div className="text-[9px] text-content-muted font-mono mt-0.5">
                      {showReal
                        ? `Sim: ${game.away_score}–${game.home_score}`
                        : `Actual: ${game.actual_away_score}–${game.actual_home_score}`}
                    </div>
                  )}
                </>
              ) : (
                <span className="text-content-muted text-sm font-medium">vs</span>
              )}
            </div>

            {/* Home team */}
            <Link
              to={`/simulation/${leagueId}/team/${game.home_team_id}`}
              onClick={e => e.stopPropagation()}
              className={`flex flex-col items-center gap-1 min-w-0 flex-1 hover:opacity-75 transition-opacity ${isFinal && !homeWon ? 'opacity-50' : ''}`}
            >
              <TeamLogo teamId={game.home_team_id} abbr={game.home_team_abbr} color={game.home_team_color} size={40} />
              <span className="text-sm font-semibold text-content-primary truncate">{game.home_team_abbr}</span>
            </Link>

          </div>
        </div>

        {/* Footer: pitchers + Sim button */}
        <div className="relative z-10 border-t border-bg-border/50 px-4 pt-3 pb-4 flex items-center justify-between gap-2">
          {/* Away SP */}
          <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
            <span className="text-[10px] text-content-muted uppercase tracking-[0.08em] font-semibold">Away SP</span>
            {isFinal ? (
              <Link
                to={`/simulation/${leagueId}/player/${game.away_pitcher_id}`}
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1.5 min-w-0 hover:opacity-75 transition-opacity"
              >
                <SimPlayerAvatar playerId={game.away_pitcher_id} name={game.away_pitcher_name} size={20} />
                <span className="text-xs text-content-secondary truncate">{awayPitcherLast || '—'}</span>
              </Link>
            ) : (
              <Link to={`/simulation/${leagueId}/roster/${game.away_team_id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-content-secondary hover:text-brand transition-colors truncate">
                {game.away_team_abbr} roster
              </Link>
            )}
          </div>

          {/* Sim button — hide re-sim for non-live final games; block out-of-order in non-live */}
          {(!isFinal || isLive) && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (canSim !== false) onSimulate(game.id) }}
              disabled={isSimming || canSim === false}
              title={canSim === false ? 'Sim earlier dates first' : isFinal ? 'Re-run simulation' : 'Simulate this game'}
              className={`h-7 px-3 rounded-full text-[10px] font-bold border disabled:opacity-40 transition-colors flex items-center gap-1.5 shrink-0 ${
                isFinal && game.is_real
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-brand/10 text-brand border-brand/30 hover:bg-brand/20'
              }`}
            >
              {isSimming ? (
                <div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
              {isSimming ? 'Simming…' : simLabel}
            </button>
          )}

          {/* Home SP */}
          <div className="flex flex-col items-end gap-0.5 min-w-0 flex-1">
            <span className="text-[10px] text-content-muted uppercase tracking-[0.08em] font-semibold">Home SP</span>
            {isFinal ? (
              <Link
                to={`/simulation/${leagueId}/player/${game.home_pitcher_id}`}
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1.5 min-w-0 flex-row-reverse hover:opacity-75 transition-opacity"
              >
                <SimPlayerAvatar playerId={game.home_pitcher_id} name={game.home_pitcher_name} size={20} />
                <span className="text-xs text-content-secondary truncate">{homePitcherLast || '—'}</span>
              </Link>
            ) : (
              <Link to={`/simulation/${leagueId}/roster/${game.home_team_id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-content-secondary hover:text-brand transition-colors truncate">
                {game.home_team_abbr} roster
              </Link>
            )}
          </div>
        </div>

      </div>

      {showProbs && !isFinal && (
        <ProbabilityPanel leagueId={leagueId} game={game} onClose={() => setShowProbs(false)} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Schedule panel
// ─────────────────────────────────────────────────────────────────

function SchedulePanel({ leagueId, currentDate, games, isLoading, onDateChange, onSimulateGame, onSimulateAll, onSimulateThrough, isSimThrough, onSync, onSimulateSeason, simulatingId, isSyncing, isSimSeason, isLive, bulkSimming, firstUnplayedDate, seasonComplete }) {
  const upcoming = games.filter(g => g.status !== 'final')
  const finished = games.filter(g => g.status === 'final')

  // In non-live mode, only allow simming the first unplayed date to prevent gaps
  const isOnFirstUnplayed = !firstUnplayedDate || currentDate === firstUnplayedDate || currentDate < firstUnplayedDate
  const canSimDay = isLive || isOnFirstUnplayed

  const noGamesLeft = seasonComplete

  return (
    <div className="flex flex-col gap-4">
      {/* Date navigator + actions */}
      <div className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Date nav */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => onDateChange(stepDate(currentDate, -1))}
              className="w-7 h-7 flex items-center justify-center rounded border border-bg-border text-content-muted hover:text-content-primary hover:border-brand/40 transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 text-center min-w-0">
              <input
                type="date"
                value={currentDate || ''}
                onChange={e => e.target.value && onDateChange(e.target.value)}
                className="w-full bg-transparent border-none text-sm font-bold text-content-primary text-center focus:outline-none cursor-pointer [color-scheme:dark]"
              />
              <div className="text-[10px] text-content-muted -mt-0.5">
                {isLoading ? 'Loading…' : `${finished.length} final · ${upcoming.length} upcoming`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDateChange(stepDate(currentDate, 1))}
              className="w-7 h-7 flex items-center justify-center rounded border border-bg-border text-content-muted hover:text-content-primary hover:border-brand/40 transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {isLive && (
              <button
                type="button"
                onClick={onSync}
                disabled={isSyncing}
                className="px-3 py-1.5 rounded border border-bg-border text-xs font-medium text-content-secondary hover:text-content-primary hover:border-brand/30 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {isSyncing ? (
                  <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                Sync Real
              </button>
            )}

            {upcoming.length > 0 && (
              <button
                type="button"
                onClick={() => canSimDay && onSimulateAll(upcoming.map(g => g.id))}
                disabled={!canSimDay || upcoming.every(g => simulatingId?.has?.(g.id)) || isSimSeason}
                title={!canSimDay ? `Sim ${fmtDate(firstUnplayedDate)} first` : undefined}
                className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
              >
                {upcoming.some(g => simulatingId?.has?.(g.id)) ? (
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
                {upcoming.some(g => simulatingId?.has?.(g.id))
                  ? `Simming (${upcoming.filter(g => simulatingId?.has?.(g.id)).length}/${upcoming.length})…`
                  : `Sim Day (${upcoming.length})`}
              </button>
            )}
            {onSimulateThrough && currentDate && (
              <button
                type="button"
                onClick={() => onSimulateThrough(currentDate)}
                disabled={isSimThrough || isSimSeason || noGamesLeft || (isOnFirstUnplayed && upcoming.length === 0)}
                title={noGamesLeft ? 'Season complete' : `Simulate all unplayed games from ${fmtDate(firstUnplayedDate || currentDate)} through ${fmtDate(currentDate)}`}
                className="px-3 py-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-bold disabled:opacity-40 hover:bg-emerald-500/20 transition-colors flex items-center gap-1.5"
              >
                {isSimThrough ? (
                  <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18L14.5 12 6 6v12zm2-8.14L11.97 12 8 14.14V9.86zM16 6h2v12h-2z"/>
                  </svg>
                )}
                Sim to Here
              </button>
            )}
            {onSimulateSeason && (
              <button
                type="button"
                onClick={onSimulateSeason}
                disabled={isSimSeason || isSimThrough || noGamesLeft}
                title={noGamesLeft ? 'Season complete — all games have been simulated' : 'Simulate all remaining games this season'}
                className="px-3 py-1.5 rounded border border-brand/30 bg-brand/10 text-brand text-xs font-bold disabled:opacity-40 hover:bg-brand/20 transition-colors flex items-center gap-1.5"
              >
                {isSimSeason ? (
                  <div className="w-3 h-3 border border-brand border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6zM16 6h2v12h-2z"/>
                  </svg>
                )}
                Sim Season
              </button>
            )}
          </div>
        </div>
      </div>

      {/* In-progress banner — shown while any game on this date is simulating */}
      {upcoming.some(g => simulatingId?.has?.(g.id)) && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-brand/30 bg-brand/5 text-sm">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="font-medium text-brand">
            Simulating {upcoming.filter(g => simulatingId?.has?.(g.id)).length} of {upcoming.length} game{upcoming.length !== 1 ? 's' : ''}…
          </span>
        </div>
      )}

      {/* Out-of-order warning — non-live only */}
      {!isLive && !isOnFirstUnplayed && firstUnplayedDate && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
          <svg className="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19H3.5L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
          </svg>
          <span className="text-amber-300">
            Unplayed games exist on <strong>{fmtDate(firstUnplayedDate)}</strong> — use <strong>Sim to Here</strong> to sim in order, or go back to that date.
          </span>
        </div>
      )}

      {/* Game grid */}
      {isLoading ? (
        <div className="card p-8 text-center text-content-muted text-sm flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
          Loading schedule…
        </div>
      ) : games.length === 0 ? (
        <div className="card p-8 text-center text-content-muted text-sm">
          No games scheduled for this date.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {games.map(game => (
            <GameCard
              key={game.id}
              game={game}
              leagueId={leagueId}
              onSimulate={onSimulateGame}
              simulating={simulatingId}
              isQueued={simulatingId?.has?.(game.id) || (game.status !== 'final' && bulkSimming)}
              bulkSimming={bulkSimming}
              isLive={isLive}
              canSim={isLive || isOnFirstUnplayed ? undefined : false}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Module-level simulating-IDs cache — survives navigation
// ─────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────
// Season AI Insights sections config
// ─────────────────────────────────────────────────────────────────

const SEASON_INSIGHT_SECTIONS = {
  standout_performers: 'Standout Performers',
  team_narratives:     'Team Narratives',
  notable_storylines:  'Notable Storylines',
}

// ─────────────────────────────────────────────────────────────────
// Main Command Center page
// ─────────────────────────────────────────────────────────────────

export default function SimulationLeague() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const [activeDate, setActiveDate]       = useState(null)
  const [simulatingIds, setSimulatingIds] = useState(() => new Set())
  const [leagueTab, setLeagueTab]         = useState('AL')
  const [rightTab, setRightTab]           = useState('schedule')
  const [seasonJobId, setSeasonJobId]       = useState(null)
  const [seasonProgress, setSeasonProgress] = useState(null)
  const [seasonJobLabel, setSeasonJobLabel] = useState('season')
  const seasonJobRef = useRef(null)


  // Primary league state (standings + today)
  const { data: state, isLoading, error } = useQuery({
    queryKey:  ['sim-state', id],
    queryFn:   () => api.simulations.show(id),
    staleTime: 30_000,
  })

  const league        = state?.league
  const isLive        = !!league?.live_mode

  const hasUnseenNews = (() => {
    const count = league?.news_story_count ?? 0
    if (count === 0) return false
    try { return count > parseInt(localStorage.getItem(newsSeenKey(id)) || '0', 10) } catch { return false }
  })()
  // first_unplayed_date: first day with any unplayed games (advances as you simulate)
  const defaultDate   = league?.first_unplayed_date || league?.current_sim_date || state?.today?.date

  const currentDate = activeDate || defaultDate

  // Schedule for the currently viewed date (also carries date-filtered standings)
  const { data: scheduleData, isLoading: schedLoading } = useQuery({
    queryKey: ['sim-schedule', id, currentDate],
    queryFn:  () => api.simulations.schedule(id, currentDate),
    enabled:  !!currentDate,
    staleTime: 10_000,
  })

  const games         = scheduleData?.games         || state?.today?.games || []
  // Standings come from the schedule response (date-filtered), with state as fallback on initial load
  const standings     = scheduleData?.standings      || state?.standings      || {}
  const realStandings = scheduleData?.real_standings || state?.real_standings || {}
  const simStandings  = scheduleData?.sim_standings  || state?.sim_standings  || {}

  // ── Mutations ──────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['sim-state', id] })
    qc.invalidateQueries({ queryKey: ['sim-schedule', id] })
  }

  const simGameMutation = useMutation({
    mutationFn: ({ gameId }) => api.simulations.simulateGame(id, gameId),
    onMutate:   ({ gameId }) => {
      setSimulatingIds(prev => new Set([...prev, gameId]))
    },
    onSuccess:  (data) => {
      if (data?.game) {
        // Patch the game card immediately — no schedule spinner needed
        qc.setQueryData(['sim-schedule', id, currentDate], (old) =>
          old ? { ...old, games: old.games.map(g => g.id === data.game.id ? data.game : g) } : old
        )
      }
      // Standings live in the schedule response — invalidate to get date-filtered standings
      // Invalidate state for progress bar / game counts
      qc.invalidateQueries({ queryKey: ['sim-schedule', id] })
      qc.invalidateQueries({ queryKey: ['sim-state', id] })
    },
    onSettled:  (_, __, { gameId }) => {
      setSimulatingIds(prev => { const s = new Set(prev); s.delete(gameId); return s })
    },
  })

  function handleSimulateAll(gameIds) {
    gameIds.forEach(gameId => simGameMutation.mutate({ gameId }))
  }

  const syncMutation = useMutation({
    mutationFn: () => api.simulations.sync(id),
    onSuccess:  invalidate,
  })

  const simThroughMutation = useMutation({
    mutationFn: (throughDate) => api.simulations.simulateThrough(id, throughDate),
    onSuccess: (data, throughDate) => {
      if (data?.job_id) {
        setSeasonJobId(data.job_id)
        setSeasonJobLabel(throughDate)
      }
    },
  })

  const simulateSeasonMutation = useMutation({
    mutationFn: () => api.simulations.simulateSeason(id),
    onSuccess: (data) => {
      if (data?.job_id) {
        setSeasonJobId(data.job_id)
        setSeasonJobLabel('season')
      }
    },
  })

  // Poll season job progress
  useEffect(() => {
    if (!seasonJobId) return
    clearInterval(seasonJobRef.current)
    seasonJobRef.current = setInterval(async () => {
      const job = await api.simulations.jobStatus(id, seasonJobId)
      if (job?.result_json) {
        const prog = JSON.parse(job.result_json)
        setSeasonProgress(prog)
      }
      if (job?.status === 'done' || job?.status === 'error') {
        clearInterval(seasonJobRef.current)
        setSeasonJobId(null)
        setSeasonProgress(null)
        invalidate()
      }
    }, 1500)
    return () => clearInterval(seasonJobRef.current)
  }, [seasonJobId]) // eslint-disable-line react-hooks/exhaustive-deps

  const deleteMutation = useMutation({
    mutationFn: () => api.simulations.destroy(id),
    onSuccess:  () => navigate('/simulation'),
  })

  const played = league?.games_played || 0
  const total  = league?.games_total  || 0
  const franchiseId       = league?.simulation_franchise_id
  const seasonComplete    = total > 0 && played === total
  const franchiseCanAdvance = league?.franchise_can_advance ?? false

  const advanceMutation = useMutation({
    mutationFn: () => api.franchises.advance(franchiseId),
    onSuccess:  (data) => {
      if (!data.error) navigate(`/franchise/${franchiseId}`)
    },
  })

  function handleDelete() {
    if (!window.confirm(`Delete "${league?.name}"? All data will be lost.`)) return
    deleteMutation.mutate()
  }

  function handleDateChange(date) {
    setActiveDate(date)
    qc.invalidateQueries({ queryKey: ['sim-schedule', id, date] })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-content-muted">
        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span>Loading simulation…</span>
      </div>
    )
  }

  if (error || state?.error) {
    return (
      <div className="card p-8 text-center text-red-400">
        {error?.message || state?.error || 'Failed to load simulation.'}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="card p-4">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 text-xs text-content-muted">
              <Link to="/simulation" className="hover:text-brand transition-colors">← All Leagues</Link>
              {franchiseId && (
                <>
                  <span>/</span>
                  <Link to={`/franchise/${franchiseId}`} className="hover:text-brand transition-colors">Franchise</Link>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                {league?.season}
              </span>
              {league?.scenario_name && (
                <span className="text-xs text-content-muted">{league.scenario_name} scenario</span>
              )}
              <span className="text-xs text-content-muted">
                · {Math.round(league?.batter_pitcher_blend * 100)}% batter blend
              </span>
            </div>
            <h1 className="text-xl font-bold text-content-primary truncate">{league?.name}</h1>

            {/* Progress bar */}
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 h-1.5 bg-bg-border rounded-full overflow-hidden max-w-48">
                <div
                  className="h-full bg-brand rounded-full transition-all"
                  style={{ width: total > 0 ? `${(played / total) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-xs font-mono text-content-muted">{played} / {total} games</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="px-3 py-1.5 rounded border border-bg-border text-xs text-content-muted hover:text-red-400 hover:border-red-400/40 disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              {deleteMutation.isPending && (
                <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              )}
              {deleteMutation.isPending ? 'Deleting…' : 'Delete League'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Season complete / franchise advance ── */}
      {seasonComplete && franchiseId && (
        franchiseCanAdvance ? (
          <div className="card p-4 flex items-center justify-between gap-4 flex-wrap border-green-500/20 bg-green-500/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-content-primary">Season complete</p>
                <p className="text-xs text-content-muted">All {total} games simulated. Ready to advance to {(league.season || 0) + 1}.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => advanceMutation.mutate()}
              disabled={advanceMutation.isPending}
              className="btn-primary flex items-center gap-1.5 shrink-0"
            >
              {advanceMutation.isPending ? (
                <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              )}
              {advanceMutation.isPending ? 'Advancing…' : `Advance to ${(league.season || 0) + 1}`}
            </button>
          </div>
        ) : (
          <div className="card p-4 flex items-center gap-3 border-amber-500/20 bg-amber-500/5">
            <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-content-primary">Playoffs must conclude first</p>
              <p className="text-xs text-content-muted">Simulate the World Series before advancing to the next season.</p>
            </div>
          </div>
        )
      )}

      {/* ── Season AI Insights ── */}
      <SimInsightPanel
        queryKey={['sim-season-insight', id]}
        queryFn={() => api.simulations.seasonInsights(id)}
        regenerateFn={async () => {
          await api.simulations.seasonInsights(id, { refresh: true })
          qc.invalidateQueries({ queryKey: ['sim-season-insight', id] })
        }}
        sections={SEASON_INSIGHT_SECTIONS}
        title="AI Season Insights"
      />

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">

        {/* Left: Standings */}
        <StandingsPanel
          allStandings={standings}
          realStandings={realStandings}
          simStandings={simStandings}
          activeLeague={leagueTab}
          onSetLeague={setLeagueTab}
          isLive={isLive}
          leagueId={id}
        />

        {/* Right: Schedule / Analysis */}
        <div className="flex flex-col gap-4">
          {/* Tab switcher */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded border border-bg-border overflow-hidden bg-bg-elevated">
              <button
                type="button"
                onClick={() => setRightTab('schedule')}
                className={`px-4 py-1.5 text-xs font-bold transition-colors ${rightTab === 'schedule' ? 'tab-active' : 'tab-inactive'}`}
              >
                Schedule
              </button>
              {isLive && (
                <button
                  type="button"
                  onClick={() => setRightTab('analysis')}
                  className={`px-4 py-1.5 text-xs font-bold transition-colors ${rightTab === 'analysis' ? 'tab-active' : 'tab-inactive'}`}
                >
                  Analysis
                </button>
              )}
            </div>
            <Link
              to={`/simulation/${id}/teams`}
              className="px-3 py-1.5 text-xs font-bold border border-bg-border bg-bg-elevated text-content-muted hover:text-brand hover:border-brand/40 rounded transition-colors"
            >
              Teams →
            </Link>
            <Link
              to={`/simulation/${id}/config`}
              className="px-3 py-1.5 text-xs font-bold border border-bg-border bg-bg-elevated text-content-muted hover:text-brand hover:border-brand/40 rounded transition-colors"
            >
              Config →
            </Link>
            <Link
              to={`/simulation/${id}/leaders`}
              className="px-3 py-1.5 text-xs font-bold border border-bg-border bg-bg-elevated text-content-muted hover:text-brand hover:border-brand/40 rounded transition-colors"
            >
              Leaders →
            </Link>
            <Link
              to={`/simulation/${id}/playoffs`}
              className="px-3 py-1.5 text-xs font-bold border border-bg-border bg-bg-elevated text-content-muted hover:text-brand hover:border-brand/40 rounded transition-colors"
            >
              Playoffs →
            </Link>
            <Link
              to={`/simulation/${id}/awards`}
              className="px-3 py-1.5 text-xs font-bold border border-bg-border bg-bg-elevated text-content-muted hover:text-brand hover:border-brand/40 rounded transition-colors"
            >
              Awards →
            </Link>
            <Link
              to={`/simulation/${id}/news`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-bg-border bg-bg-elevated text-content-muted hover:text-brand hover:border-brand/40 rounded transition-colors"
            >
              News →
              {hasUnseenNews && (
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              )}
            </Link>
            <Link
              to={`/simulation/${id}/injuries`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-bg-border bg-bg-elevated text-content-muted hover:text-brand hover:border-brand/40 rounded transition-colors"
            >
              IL →
              {(league?.active_il_count ?? 0) > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">
                  {league.active_il_count}
                </span>
              )}
            </Link>
          </div>

          {/* Season sim progress bar */}
          {(seasonJobId || seasonProgress) && (
            <div className="card p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-brand font-medium">
                  <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  {seasonJobLabel === 'season' ? 'Simulating season…' : `Simulating to ${seasonJobLabel}…`}
                </div>
                {seasonProgress && (
                  <span className="font-mono text-content-muted">
                    {seasonProgress.done} / {seasonProgress.total} dates
                    {seasonProgress.current_date && ` · ${seasonProgress.current_date}`}
                  </span>
                )}
              </div>
              <div className="h-1.5 bg-bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all"
                  style={{ width: seasonProgress ? `${(seasonProgress.done / seasonProgress.total) * 100}%` : '5%' }}
                />
              </div>
            </div>
          )}

          {rightTab === 'schedule' || !isLive ? (
            <SchedulePanel
              leagueId={id}
              currentDate={currentDate}
              games={games}
              isLoading={schedLoading}
              onDateChange={handleDateChange}
              onSimulateGame={(gameId) => simGameMutation.mutate({ gameId })}
              onSimulateAll={handleSimulateAll}
              onSimulateThrough={(date) => simThroughMutation.mutate(date)}
              isSimThrough={simThroughMutation.isPending || !!seasonJobId}
              bulkSimming={!!seasonJobId}
              onSync={() => syncMutation.mutate()}
              onSimulateSeason={() => simulateSeasonMutation.mutate()}
              simulatingId={simulatingIds}
              isSyncing={syncMutation.isPending}
              isSimSeason={!!seasonJobId || simulateSeasonMutation.isPending}
              isLive={isLive}
              firstUnplayedDate={league?.first_unplayed_date}
              seasonComplete={seasonComplete}
            />
          ) : (
            <AccuracyPanel leagueId={id} />
          )}
        </div>
      </div>
    </div>
  )
}
