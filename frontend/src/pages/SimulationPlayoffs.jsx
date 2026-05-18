import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { TeamLogo, SimPlayerAvatar } from '../components/sim/SimUI'

function SeriesCard({ series, leagueId }) {
  const homeWon = series.winner_team_id === series.home_team_id
  const awayWon = series.winner_team_id === series.away_team_id
  const isComplete = series.status === 'complete'

  return (
    <div className={`card p-3 space-y-2 ${isComplete ? '' : 'border-brand/20'}`}>
      {/* Team rows */}
      {[
        { abbr: series.away_team_abbr, color: series.away_team_color, teamId: series.away_team_id, wins: series.away_wins, won: awayWon },
        { abbr: series.home_team_abbr, color: series.home_team_color, teamId: series.home_team_id, wins: series.home_wins, won: homeWon },
      ].map(({ abbr, color, teamId, wins, won }) => (
        <div key={abbr} className={`flex items-center justify-between gap-2 ${isComplete && !won ? 'opacity-40' : ''}`}>
          <Link to={`/simulation/${leagueId}/team/${teamId}`} className="flex items-center gap-2 hover:opacity-75 transition-opacity">
            <TeamLogo teamId={teamId} abbr={abbr} color={color} size={22} />
            <span className={`font-mono font-bold text-sm ${won ? 'text-content-primary' : 'text-content-secondary'}`}>{abbr}</span>
            {won && <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Win</span>}
          </Link>
          <span className={`font-mono font-black text-lg tabular-nums ${won ? 'text-content-primary' : 'text-content-muted'}`}>
            {wins}
          </span>
        </div>
      ))}

      {/* Game dots */}
      {(series.games || []).length > 0 && (
        <div className="flex items-center gap-1 pt-1 border-t border-bg-border/40">
          {series.games.map((g, i) => {
            const homeW = g.home_score > g.away_score
            return (
              <div
                key={i}
                title={`Game ${i + 1}: ${series.away_team_abbr} ${g.away_score} – ${series.home_team_abbr} ${g.home_score}`}
                className="w-2 h-2 rounded-full"
                style={{ background: homeW ? series.home_team_color : series.away_team_color }}
              />
            )
          })}
          <span className="text-[10px] text-content-muted ml-1">
            {isComplete ? `${series.winner_team_id === series.home_team_id ? series.home_team_abbr : series.away_team_abbr} wins series` : 'in progress'}
          </span>
        </div>
      )}

      {/* Series format */}
      <div className="text-[10px] text-content-muted">
        Best of {series.series_length}
      </div>
    </div>
  )
}

function RoundColumn({ roundData, leagueId }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-bold uppercase tracking-widest text-content-muted text-center">
        {roundData.label}
      </h3>
      {roundData.series.map(s => (
        <SeriesCard key={s.id} series={s} leagueId={leagueId} />
      ))}
    </div>
  )
}

function ChampionBanner({ ws, leagueId }) {
  const champ = ws.winner_team_id === ws.home_team_id
    ? { abbr: ws.home_team_abbr, teamId: ws.home_team_id, color: ws.home_team_color }
    : { abbr: ws.away_team_abbr, teamId: ws.away_team_id, color: ws.away_team_color }

  const { data: awardsData } = useQuery({
    queryKey:  ['sim-playoff-awards', leagueId],
    queryFn:   () => api.simulations.playoffAwards(leagueId),
    staleTime: 60_000,
  })

  const awards     = awardsData?.awards
  const narrative  = awards?.championship_narrative
  const mvpKeys    = [
    { key: 'ws_mvp',   label: 'WS MVP'   },
    { key: 'alcs_mvp', label: 'ALCS MVP' },
    { key: 'nlcs_mvp', label: 'NLCS MVP' },
  ]

  return (
    <div className="card border border-yellow-500/30 bg-yellow-500/5 overflow-hidden">
      <div className="h-0.5 w-full bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600" />
      <div className="p-6 space-y-5">
        {/* Team identity row */}
        <div className="flex items-center gap-4">
          <div className="text-3xl shrink-0">🏆</div>
          <Link to={`/simulation/${leagueId}/team/${champ.teamId}`} className="hover:opacity-80 transition-opacity shrink-0">
            <TeamLogo teamId={champ.teamId} abbr={champ.abbr} color={champ.color} size={52} />
          </Link>
          <div>
            <p className="text-2xl font-black text-content-primary leading-tight">{champ.abbr}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-yellow-400">World Series Champions</p>
          </div>
        </div>

        {/* AI narrative */}
        {narrative ? (
          <div className="space-y-1.5">
            <p className="text-base font-bold text-content-primary leading-snug">{narrative.headline}</p>
            <p className="text-sm text-content-secondary leading-relaxed">{narrative.body}</p>
          </div>
        ) : (
          <p className="text-xs text-content-muted italic">
            Generate Playoff Awards below to unlock the championship narrative.
          </p>
        )}

        {/* MVP chips */}
        {awards && (
          <div className="flex flex-wrap gap-2 pt-1 border-t border-yellow-500/20">
            {mvpKeys.map(({ key, label }) => {
              const w = awards[key]?.winner
              if (!w) return null
              return (
                <Link
                  key={key}
                  to={`/simulation/${leagueId}/player/${w.player_id}`}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-elevated border border-bg-border hover:border-brand/40 hover:text-brand transition-colors"
                >
                  <SimPlayerAvatar playerId={w.player_id} name={w.player_name} size={18} />
                  <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">{label}:</span>
                  <span className="text-xs font-semibold text-content-primary">{w.player_name}</span>
                  <span className="text-[10px] text-content-muted font-mono">{w.team_abbr}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const PLAYOFF_AWARD_META = [
  { key: 'ws_mvp',   label: 'World Series MVP', icon: '🏆', accent: 'yellow' },
  { key: 'alcs_mvp', label: 'ALCS MVP',          icon: '⚾', accent: 'sky'    },
  { key: 'nlcs_mvp', label: 'NLCS MVP',          icon: '⚾', accent: 'red'    },
]

const ACCENT = {
  yellow: { bar: 'bg-yellow-500', badge: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30', ring: 'ring-yellow-500/40' },
  sky:    { bar: 'bg-sky-500',    badge: 'text-sky-400 bg-sky-400/10 border-sky-400/30',           ring: 'ring-sky-500/40'    },
  red:    { bar: 'bg-red-500',    badge: 'text-red-400 bg-red-400/10 border-red-400/30',           ring: 'ring-red-500/40'    },
}

function PlayoffAwardCard({ meta, data, leagueId }) {
  const ac = ACCENT[meta.accent]
  const statKeys = data?.winner?.stats?.era != null
    ? ['era', 'whip', 'ip', 'k', 'w', 'sv']
    : ['avg', 'hr', 'rbi', 'ops', 'ab', 'g']
  const statLabels = { avg: 'AVG', hr: 'HR', rbi: 'RBI', ops: 'OPS', ab: 'AB', g: 'G', era: 'ERA', whip: 'WHIP', ip: 'IP', k: 'K', w: 'W', sv: 'SV' }

  return (
    <div className="card overflow-hidden">
      <div className={`h-0.5 w-full ${ac.bar}`} />
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta.icon}</span>
          <span className="text-sm font-bold text-content-primary">{meta.label}</span>
        </div>

        {!data ? (
          <p className="text-xs text-content-muted text-center py-4">No eligible candidates</p>
        ) : (() => {
          const { winner, finalists = [], rationale } = data
          return (
            <>
              {winner && (
                <div className="flex items-center gap-3">
                  <div className={`rounded-full ring-2 ring-offset-1 ring-offset-bg-surface ${ac.ring} shrink-0`}>
                    <SimPlayerAvatar playerId={winner.player_id} name={winner.player_name} size={44} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/simulation/${leagueId}/player/${winner.player_id}`}
                        className="text-sm font-bold text-content-primary hover:text-brand transition-colors"
                      >
                        {winner.player_name}
                      </Link>
                      <span className="text-[10px] font-mono text-content-muted bg-bg-elevated border border-bg-border px-1.5 py-0.5 rounded">
                        {winner.team_abbr}
                      </span>
                      <span className="text-yellow-400 text-base">★</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {statKeys.filter(k => winner.stats?.[k] != null).slice(0, 4).map(k => (
                        <span key={k} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-elevated border border-bg-border text-[10px] font-mono">
                          <span className="text-content-muted">{statLabels[k]}</span>
                          <span className="text-content-primary font-bold">
                            {typeof winner.stats[k] === 'number'
                              ? (Number.isInteger(winner.stats[k]) ? winner.stats[k] : Number(winner.stats[k]).toFixed(3))
                              : winner.stats[k]}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {finalists.length > 0 && (
                <div className="border-t border-bg-border/40 pt-2 space-y-1">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-content-muted mb-1">Finalists</p>
                  {finalists.map((p, i) => p && (
                    <div key={p.player_id ?? i} className="flex items-center gap-2 py-0.5 opacity-60 hover:opacity-100 transition-opacity">
                      <SimPlayerAvatar playerId={p.player_id} name={p.player_name} size={20} />
                      <Link
                        to={`/simulation/${leagueId}/player/${p.player_id}`}
                        className="text-xs font-medium text-content-secondary hover:text-brand transition-colors truncate"
                      >
                        {p.player_name}
                      </Link>
                      <span className="text-[10px] text-content-muted font-mono shrink-0">{p.team_abbr}</span>
                    </div>
                  ))}
                </div>
              )}

              {rationale && (
                <p className="text-xs text-content-secondary leading-relaxed border-t border-bg-border/40 pt-2 italic">
                  "{rationale}"
                </p>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}

function PlayoffAwardsSection({ leagueId }) {
  const qc = useQueryClient()
  const [error, setError] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey:  ['sim-playoff-awards', leagueId],
    queryFn:   () => api.simulations.playoffAwards(leagueId),
    staleTime: 60_000,
  })

  const generateMutation = useMutation({
    mutationFn: () => api.simulations.generatePlayoffAwards(leagueId),
    onSuccess:  () => {
      setError(null)
      qc.invalidateQueries({ queryKey: ['sim-playoff-awards', leagueId] })
    },
    onError: (e) => setError(e.message),
  })

  const awards = data?.awards

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">🏆</span>
          <h2 className="text-sm font-bold text-content-primary uppercase tracking-wide">Playoff Awards</h2>
          <div className="flex-1 h-px bg-bg-border" />
        </div>
        <button
          type="button"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className={`text-xs px-3 py-1.5 rounded font-bold border transition-colors disabled:opacity-40 ${
            data?.generated
              ? 'border-bg-border bg-bg-elevated text-content-muted hover:text-brand hover:border-brand/40'
              : 'btn-primary'
          }`}
        >
          {generateMutation.isPending ? 'Generating…' : data?.generated ? 'Regenerate' : 'Generate Awards'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {isLoading && (
        <div className="flex items-center gap-2 text-content-muted text-xs py-4">
          <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      )}

      {!isLoading && !data?.generated && !generateMutation.isPending && (
        <p className="text-xs text-content-muted">
          Click <strong className="text-content-primary">Generate Awards</strong> to have the AI committee select the WS MVP, ALCS MVP, and NLCS MVP.
        </p>
      )}

      {generateMutation.isPending && (
        <div className="flex items-center gap-2 text-content-muted text-xs py-4">
          <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          The committee is deliberating…
        </div>
      )}

      {awards && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLAYOFF_AWARD_META.map(meta => (
            <PlayoffAwardCard
              key={meta.key}
              meta={meta}
              data={awards[meta.key]}
              leagueId={leagueId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function SimulationPlayoffs() {
  const { id }  = useParams()
  const qc      = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey:  ['sim-playoffs', id],
    queryFn:   () => api.simulations.playoffs(id),
    staleTime: 30_000,
  })

  const { data: stateData } = useQuery({
    queryKey:  ['sim-state', id],
    queryFn:   () => api.simulations.show(id),
    staleTime: 60_000,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['sim-playoffs', id] })

  const seedMutation = useMutation({
    mutationFn: () => api.simulations.seedPlayoffs(id),
    onSuccess:  invalidate,
  })

  const simRoundMutation = useMutation({
    mutationFn: (round) => api.simulations.simulatePlayoffRound(id, round),
    onSuccess:  invalidate,
  })

  const rounds       = data?.rounds || []
  const hasPlayoffs  = rounds.length > 0
  const league       = stateData?.league
  const allGamesDone = league?.games_played === league?.games_total && league?.games_total > 0

  // Determine which round to sim next (first with incomplete series)
  const nextRound = rounds.find(r => r.series.some(s => s.status !== 'complete'))
  const allComplete = hasPlayoffs && rounds.every(r => r.series.every(s => s.status === 'complete'))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="card p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link to={`/simulation/${id}`} className="text-content-muted hover:text-brand transition-colors text-sm">
            ← League
          </Link>
          <h1 className="text-lg font-bold text-content-primary">Playoffs</h1>
          {league?.season && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
              {league.season}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!hasPlayoffs && (
            <button
              type="button"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending || !allGamesDone}
              title={!allGamesDone ? 'Simulate the full season before seeding playoffs' : 'Seed playoff bracket'}
              className="btn-primary text-xs px-4 py-1.5 disabled:opacity-40 flex items-center gap-1.5"
            >
              {seedMutation.isPending ? (
                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
                </svg>
              )}
              Seed Playoffs
            </button>
          )}

          {hasPlayoffs && nextRound && !allComplete && (
            <button
              type="button"
              onClick={() => simRoundMutation.mutate(nextRound.round)}
              disabled={simRoundMutation.isPending}
              className="btn-primary text-xs px-4 py-1.5 disabled:opacity-40 flex items-center gap-1.5"
            >
              {simRoundMutation.isPending ? (
                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
              Sim {nextRound.label}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-content-muted">
          <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data?.error ? (
        <div className="card p-8 text-center text-red-400">{data.error}</div>
      ) : !hasPlayoffs ? (
        <div className="card p-12 text-center space-y-3">
          <div className="text-4xl">🏆</div>
          <p className="text-content-secondary font-semibold">No playoff bracket yet</p>
          <p className="text-content-muted text-sm max-w-64 mx-auto">
            {allGamesDone
              ? 'Click "Seed Playoffs" to generate the bracket from final standings.'
              : 'Simulate the full regular season first, then seed the playoffs.'}
          </p>
        </div>
      ) : allComplete ? (
        <>
          {/* Champion banner */}
          {rounds.find(r => r.round === 'ws')?.series?.[0]?.winner_team_id && (
            <ChampionBanner ws={rounds.find(r => r.round === 'ws').series[0]} leagueId={id} />
          )}

          <PlayoffAwardsSection leagueId={id} />

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {rounds.map(r => <RoundColumn key={r.round} roundData={r} leagueId={id} />)}
          </div>
        </>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {rounds.map(r => <RoundColumn key={r.round} roundData={r} />)}
        </div>
      )}
    </div>
  )
}
