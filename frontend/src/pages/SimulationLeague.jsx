import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

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

function StandingsTable({ division, teams }) {
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
              <td className="pl-3 pr-2 py-2 w-5 text-content-muted font-mono">{i + 1}</td>
              <td className="py-2 pr-3 font-medium text-content-primary">
                <div className="flex items-center gap-2">
                  <span
                    className="w-1 h-4 rounded-full shrink-0"
                    style={{ background: t.color || '#666' }}
                  />
                  <span className="font-mono font-bold text-[11px]">{t.abbr || t.name?.slice(0, 3).toUpperCase()}</span>
                </div>
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

function StandingsPanel({ standings, activeLeague, onSetLeague }) {
  const leagues = ['AL', 'NL']
  const [tab, setTab] = useState(activeLeague || 'AL')

  const divs = useMemo(() => {
    const data = standings?.[tab] || {}
    return DIVISION_ORDER.map(d => ({ division: d, teams: data[d] || [] }))
  }, [standings, tab])

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
        <h2 className="text-sm font-bold text-content-primary uppercase tracking-wide">Standings</h2>
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

      <div className="overflow-y-auto flex-1">
        {divs.map(({ division, teams }) => (
          <StandingsTable key={division} division={division} teams={teams} />
        ))}
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

function GameCard({ game, leagueId, onSimulate, simulating }) {
  const isFinal    = game.status === 'final'
  const awayWon    = isFinal && game.away_score > game.home_score
  const homeWon    = isFinal && game.home_score > game.away_score
  const isSimming  = simulating === game.id

  return (
    <div className={`
      card p-0 overflow-hidden transition-all
      ${isFinal ? '' : 'hover:border-brand/30'}
    `}>
      {/* Team color accent bar */}
      <div className="h-0.5 w-full flex">
        <div className="flex-1" style={{ background: game.away_team_color || '#444' }} />
        <div className="flex-1" style={{ background: game.home_team_color || '#444' }} />
      </div>

      <div className="p-3">
        {/* Status badge */}
        <div className="flex items-center justify-between mb-2.5">
          <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
            isFinal
              ? game.is_real
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-brand/10 text-brand border border-brand/20'
              : 'bg-bg-elevated text-content-muted border border-bg-border'
          }`}>
            {isFinal ? (game.is_real ? 'Real' : 'Sim') : 'Upcoming'}
          </span>
          {isFinal && (
            <Link
              to={`/simulation/${leagueId}/game/${game.id}`}
              className="text-[10px] text-brand hover:text-brand-light font-medium"
            >
              Box Score →
            </Link>
          )}
        </div>

        {/* Matchup rows */}
        <div className="space-y-1.5">
          {/* Away team */}
          <div className={`flex items-center justify-between ${awayWon ? 'opacity-100' : homeWon ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-4 rounded-full shrink-0"
                style={{ background: game.away_team_color || '#555' }}
              />
              <span className={`font-mono font-bold text-sm ${awayWon ? 'text-content-primary' : 'text-content-secondary'}`}>
                {game.away_team_abbr}
              </span>
              <span className="text-[10px] text-content-muted truncate max-w-16 hidden sm:block">
                {game.away_pitcher_name?.split(' ').pop() || ''}
              </span>
            </div>
            {isFinal && (
              <span className={`font-mono font-bold text-lg tabular-nums ${awayWon ? 'text-content-primary' : 'text-content-muted'}`}>
                {game.away_score}
              </span>
            )}
          </div>

          {/* Home team */}
          <div className={`flex items-center justify-between ${homeWon ? 'opacity-100' : awayWon ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-4 rounded-full shrink-0"
                style={{ background: game.home_team_color || '#555' }}
              />
              <span className={`font-mono font-bold text-sm ${homeWon ? 'text-content-primary' : 'text-content-secondary'}`}>
                {game.home_team_abbr}
              </span>
              <span className="text-[10px] text-content-muted truncate max-w-16 hidden sm:block">
                {game.home_pitcher_name?.split(' ').pop() || ''}
              </span>
            </div>
            {isFinal && (
              <span className={`font-mono font-bold text-lg tabular-nums ${homeWon ? 'text-content-primary' : 'text-content-muted'}`}>
                {game.home_score}
              </span>
            )}
          </div>
        </div>

        {/* Roster links */}
        {!isFinal && (
          <div className="mt-2.5 pt-2 border-t border-bg-border/50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] text-content-muted">
              <Link to={`/simulation/${leagueId}/roster/${game.away_team_id}`} className="hover:text-brand transition-colors">
                {game.away_team_abbr} Roster
              </Link>
              <span>·</span>
              <Link to={`/simulation/${leagueId}/roster/${game.home_team_id}`} className="hover:text-brand transition-colors">
                {game.home_team_abbr} Roster
              </Link>
            </div>
            <button
              type="button"
              onClick={() => onSimulate(game.id)}
              disabled={isSimming}
              className="shrink-0 px-2.5 py-1 rounded text-xs font-semibold bg-brand/10 text-brand border border-brand/30 hover:bg-brand/20 disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              {isSimming ? (
                <><div className="w-3 h-3 border border-brand border-t-transparent rounded-full animate-spin" /> Simming…</>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  Sim
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Schedule panel
// ─────────────────────────────────────────────────────────────────

function SchedulePanel({ leagueId, currentDate, games, onDateChange, onSimulateGame, onSimulateAll, onSync, simulatingId, isSimDay, isSyncing }) {
  const upcoming = games.filter(g => g.status !== 'final')
  const finished = games.filter(g => g.status === 'final')
  const allDone  = games.length > 0 && upcoming.length === 0

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
              className="w-7 h-7 flex items-center justify-center rounded border border-bg-border text-content-muted hover:text-content-primary hover:border-brand/40 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 text-center">
              <div className="text-sm font-bold text-content-primary">{fmtDate(currentDate)}</div>
              <div className="text-[10px] text-content-muted">
                {finished.length} final · {upcoming.length} upcoming
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDateChange(stepDate(currentDate, 1))}
              className="w-7 h-7 flex items-center justify-center rounded border border-bg-border text-content-muted hover:text-content-primary hover:border-brand/40 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
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

            {upcoming.length > 0 && (
              <button
                type="button"
                onClick={onSimulateAll}
                disabled={isSimDay}
                className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
              >
                {isSimDay ? (
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
                {isSimDay ? 'Simulating…' : `Sim All (${upcoming.length})`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Game grid */}
      {games.length === 0 ? (
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
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main Command Center page
// ─────────────────────────────────────────────────────────────────

export default function SimulationLeague() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const [activeDate, setActiveDate]   = useState(null)
  const [simulatingId, setSimulating] = useState(null)
  const [leagueTab, setLeagueTab]     = useState('AL')

  // Primary league state (standings + today)
  const { data: state, isLoading, error } = useQuery({
    queryKey:  ['sim-state', id],
    queryFn:   () => api.simulations.show(id),
    staleTime: 30_000,
  })

  const league     = state?.league
  const standings  = state?.standings || {}
  const defaultDate = league?.current_sim_date || state?.today?.date

  const currentDate = activeDate || defaultDate

  // Schedule for the currently viewed date
  const { data: scheduleData, isFetching: schedLoading } = useQuery({
    queryKey: ['sim-schedule', id, currentDate],
    queryFn:  () => api.simulations.schedule(id, currentDate),
    enabled:  !!currentDate,
    staleTime: 10_000,
  })

  const games = scheduleData?.games || state?.today?.games || []

  // ── Mutations ──────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['sim-state', id] })
    qc.invalidateQueries({ queryKey: ['sim-schedule', id] })
  }

  const simGameMutation = useMutation({
    mutationFn: ({ gameId }) => api.simulations.simulateGame(id, gameId),
    onMutate:   ({ gameId }) => setSimulating(gameId),
    onSettled:  () => { setSimulating(null); invalidate() },
  })

  const simDayMutation = useMutation({
    mutationFn: () => api.simulations.simulateDay(id, currentDate),
    onSuccess:  invalidate,
  })

  const syncMutation = useMutation({
    mutationFn: () => api.simulations.sync(id),
    onSuccess:  invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.simulations.destroy(id),
    onSuccess:  () => navigate('/simulation'),
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

  const played = league?.games_played || 0
  const total  = league?.games_total  || 0

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="card p-4">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
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
              className="px-3 py-1.5 rounded border border-bg-border text-xs text-content-muted hover:text-red-400 hover:border-red-400/40 transition-colors"
            >
              Delete League
            </button>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">

        {/* Left: Standings */}
        <StandingsPanel
          standings={standings}
          activeLeague={leagueTab}
          onSetLeague={setLeagueTab}
        />

        {/* Right: Schedule */}
        <SchedulePanel
          leagueId={id}
          currentDate={currentDate}
          games={schedLoading ? [] : games}
          onDateChange={handleDateChange}
          onSimulateGame={(gameId) => simGameMutation.mutate({ gameId })}
          onSimulateAll={() => simDayMutation.mutate()}
          onSync={() => syncMutation.mutate()}
          simulatingId={simulatingId}
          isSimDay={simDayMutation.isPending}
          isSyncing={syncMutation.isPending}
        />
      </div>

      {schedLoading && (
        <div className="flex items-center gap-2 text-xs text-content-muted justify-end">
          <div className="w-3 h-3 border border-brand border-t-transparent rounded-full animate-spin" />
          Loading schedule…
        </div>
      )}
    </div>
  )
}
