import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import PlayerLink from '../components/PlayerLink'
import FactoidsPanel from '../components/FactoidsPanel'

const POSITION_ORDER = ['C', '1B', '2B', '3B', 'SS', 'OF', 'Util', 'SP', 'RP', 'P', 'BN', 'IL', 'NA']

const POSITION_GROUP = {
  C: 'Batters', '1B': 'Batters', '2B': 'Batters', '3B': 'Batters',
  SS: 'Batters', OF: 'Batters', Util: 'Batters',
  SP: 'Pitchers', RP: 'Pitchers', P: 'Pitchers',
  BN: 'Bench', IL: 'Injured', NA: 'Not Active',
}

function normalize(value) {
  return value?.toString().trim().toLowerCase() || ''
}

function resolveMlbPlayerId(player, results) {
  const name = normalize(player.name)
  const teamAbbr = normalize(player.team_abbr)
  const teamName = normalize(player.team)

  const exactNameMatches = results.filter((result) => normalize(result.name) === name)
  const teamMatch = exactNameMatches.find((result) => {
    const resultTeam = normalize(result.team)
    return resultTeam === teamName || resultTeam.includes(teamAbbr)
  })

  return teamMatch?.id || exactNameMatches[0]?.id || null
}

function statusBadge(status) {
  if (!status) return null
  const color = status.startsWith('IL') ? 'text-red-400 bg-red-400/10 border-red-400/20'
    : status === 'DTD' ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
    : 'text-content-muted bg-bg-border border-bg-border'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${color}`}>
      {status}
    </span>
  )
}

function positionBadge(pos) {
  return (
    <span className="inline-flex items-center justify-center w-8 h-6 rounded text-[10px] font-bold bg-bg-elevated border border-bg-border text-content-muted">
      {pos}
    </span>
  )
}

function shortDateLabel(value) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : `${date.getMonth() + 1}/${date.getDate()}`
}

function matchupText(player) {
  if (!player.game_today || !player.matchup) {
    return Number(player.daily_points || 0) > 0 ? 'Game already played' : 'No game today'
  }

  const side = player.matchup.is_home ? 'vs' : '@'
  const opponent = player.matchup.opponent?.abbreviation || player.matchup.opponent?.name || 'TBD'
  const teamScore = player.matchup.score?.team
  const opponentScore = player.matchup.score?.opponent

  if (teamScore != null && opponentScore != null) {
    return `${side} ${opponent} · ${player.matchup.status} ${teamScore}-${opponentScore}`
  }

  return `${side} ${opponent} · ${player.matchup.status}`
}

function formatDailyPoints(points) {
  const value = Number(points || 0)
  return value.toFixed(1)
}

function WeeklyPointsStrip({ player }) {
  const breakdown = Array.isArray(player.week_points_breakdown) ? player.week_points_breakdown : []
  if (breakdown.length === 0) return null

  const currentDate = player.scoring_date

  return (
    <div className="mt-3 border-t border-bg-border/50 pt-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-content-muted">This Week</div>

      <div className="flex rounded-lg border border-bg-border overflow-hidden">
        {breakdown.map((entry, idx) => {
          const isCurrentDate = entry.date === currentDate

          return (
            <div
              key={entry.date}
              className={`flex-1 text-center py-2 px-1 relative
                ${isCurrentDate ? 'bg-brand/15 border-t-2 border-t-brand' : 'bg-bg-elevated border-t-2 border-t-transparent'}
                ${idx < breakdown.length - 1 ? 'border-r border-bg-border' : ''}
              `}
            >
              <div className={`text-[9px] font-semibold ${isCurrentDate ? 'text-brand' : 'text-content-muted'}`}>
                {isCurrentDate ? 'Today' : shortDateLabel(entry.date)}
              </div>
              <div className={`text-xs font-semibold mt-0.5 ${isCurrentDate ? 'text-brand' : 'text-content-primary'}`}>
                {formatDailyPoints(entry.points)}
              </div>
            </div>
          )
        })}

        <div className="flex-none w-16 text-center py-2 px-1 bg-bg-elevated border-l border-bg-border">
          <div className="text-[9px] text-content-muted">Total</div>
          <div className="text-xs font-semibold text-brand mt-0.5">{formatDailyPoints(player.week_total)}</div>
        </div>
      </div>
    </div>
  )
}

function DailyStatBreakdown({ stats = [] }) {
  if (!stats?.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {stats.map(s => (
        <div key={s.stat_id} className="flex items-baseline gap-1">
          <span className="text-[10px] font-semibold text-content-muted">{s.label}</span>
          <span className="text-[11px] font-bold font-mono text-content-primary">{s.value % 1 === 0 ? s.value : Number(s.value).toFixed(1)}</span>
          <span className="text-[9px] font-mono text-brand">{Number(s.points) >= 0 ? '+' : ''}{Number(s.points).toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}

function matchupStatusText(status) {
  if (status === 'midevent') return 'In progress'
  if (status === 'preevent') return 'Upcoming'
  if (status === 'postevent') return 'Final'
  return status || 'Current matchup'
}

function MatchupSummary({ matchup }) {
  if (!matchup?.my_team || !matchup?.opponent) return null

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-content-muted">Current Matchup</div>
          <div className="text-sm text-content-secondary mt-1">
            Week {matchup.week} · {matchupStatusText(matchup.status)}
          </div>
        </div>
        <div className="text-right text-xs text-content-muted">
          <div>{matchup.week_start} to {matchup.week_end}</div>
          {matchup.is_tied && <div>Tied</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[matchup.my_team, matchup.opponent].map((team) => (
          <div key={team.team_key} className="rounded-lg border border-bg-border bg-bg-elevated p-3">
            <div className="flex items-center gap-3">
              {team.logo_url ? (
                <img src={team.logo_url} alt={team.name} className="w-10 h-10 rounded-md object-cover bg-bg-border shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-md bg-bg-border shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium text-content-primary truncate">{team.name}</div>
                {team.manager_nickname && <div className="text-[11px] text-content-muted">{team.manager_nickname}</div>}
              </div>
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] text-content-muted">Current score</div>
                <div className="text-2xl font-bold text-content-primary">{team.points ?? '0.00'}</div>
              </div>
              <div className="text-right text-[11px] text-content-muted">
                <div>Live proj: {team.live_projected_points ?? '-'}</div>
                <div>Proj: {team.projected_points ?? '-'}</div>
                <div>{team.remaining_games ?? 0} left, {team.live_games ?? 0} live</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FreeAgentCandidates() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['yahoo-free-agents'],
    queryFn: () => api.yahoo.freeAgents(),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  })

  const players = data?.players ?? []
  const { data: playerIdMap = {} } = useQuery({
    queryKey: ['yahoo-free-agents-player-ids', players.map((player) => player.player_key).join(',')],
    enabled: players.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const entries = await Promise.all(players.map(async (player) => {
        const results = await api.players.search(player.name)
        return [player.player_key, resolveMlbPlayerId(player, results)]
      }))

      return Object.fromEntries(entries)
    },
  })

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted">Free Agents</span>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-brand/10 text-brand uppercase tracking-wider">League-Aware</span>
      </div>

      {isLoading && <div className="text-sm text-content-muted">Loading candidates...</div>}
      {isError && <div className="text-sm text-content-muted">Free-agent candidates unavailable.</div>}

      {!isLoading && !isError && players.length === 0 && (
        <div className="text-sm text-content-muted">No free-agent candidates available right now.</div>
      )}

      {!isLoading && players.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {players.slice(0, 6).map((player) => (
            <div key={player.player_key} className="rounded-lg border border-bg-border bg-bg-elevated p-3">
              <div className="flex items-center gap-3">
                {player.image_url ? (
                  <img src={player.image_url} alt={player.name} className="w-10 h-10 rounded-full object-cover bg-bg-border shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-bg-border shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <PlayerLink
                    playerId={playerIdMap[player.player_key]}
                    name={player.name}
                    className="max-w-full"
                    imageClassName="hidden"
                    textClassName="text-sm font-medium text-content-primary truncate"
                  />
                  <div className="text-[11px] text-content-muted truncate">{player.team_abbr} · {player.position}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-content-muted">Season pts</div>
                  <div className="text-sm font-semibold text-content-primary">{Number(player.season_points || 0).toFixed(1)}</div>
                </div>
              </div>

              <div className="mt-2 text-[11px] text-content-secondary">
                {player.is_starting_today ? 'Starting today' : 'Not confirmed in lineup'}
                {player.batting_order ? ` · Batting ${player.batting_order}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PlayerRow({ player }) {
  const dailyPts = Number(player.daily_points || 0)
  return (
    <div className="py-3 border-b border-bg-border/50 last:border-0">
      <div className="flex items-start gap-3">
        {player.image_url ? (
          <img
            src={player.image_url}
            alt={player.name}
            className="w-8 h-8 rounded-full object-cover bg-bg-border shrink-0"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-bg-elevated border border-bg-border shrink-0 flex items-center justify-center text-[10px] text-content-muted font-bold">
            {player.name?.charAt(0)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <PlayerLink
              playerId={player.mlbPlayerId}
              name={player.name}
              className="max-w-full"
              imageClassName="hidden"
              textClassName="text-sm font-medium text-content-primary"
            />
            {statusBadge(player.status)}
          </div>
          <div className="text-[11px] text-content-muted">
            {player.team_abbr || player.team} · {player.position}
          </div>
          <div className="text-[11px] text-content-secondary mt-0.5">
            {matchupText(player)}
          </div>
          <DailyStatBreakdown stats={player.daily_stats} />
        </div>

        <div className="shrink-0 pt-0.5 flex flex-col items-end gap-1">
          {positionBadge(player.selected_position || player.position?.split(',')[0])}
          {dailyPts > 0 && (
            <div className="text-sm font-bold font-mono text-brand tabular-nums leading-none">
              {dailyPts.toFixed(1)}
              <span className="text-[9px] font-normal text-content-muted ml-0.5">pts</span>
            </div>
          )}
        </div>
      </div>

      <WeeklyPointsStrip player={player} />
    </div>
  )
}

function RosterGroup({ title, players }) {
  if (!players.length) return null
  return (
    <div className="card p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-3">{title}</h3>
      {players.map((p) => (
        <PlayerRow key={p.player_key || p.player_id} player={p} />
      ))}
    </div>
  )
}

function ConnectFlow({ urlError }) {
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(null)

  async function handleConnect() {
    setLoading(true)
    setFetchError(null)
    try {
      const { url } = await api.yahoo.authUrl()
      window.location.href = url
    } catch {
      setFetchError('Failed to get auth URL. Make sure Yahoo is configured in backend_rails/.env and restart ./start.sh if you just changed it.')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="card p-8 space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-[#6001D2]/10 border border-[#6001D2]/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[#6001D2]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 3l2.5 5h-5L12 5zm-5 7h3l-1.5 7L5 12zm10 0l-4.5 7L18 12h-1z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-content-primary">Connect Yahoo Fantasy</h2>
          <p className="text-sm text-content-secondary mt-1">
            Link your Yahoo account to view your roster and league data.
          </p>
        </div>

        {urlError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
            {urlError === 'missing_code' ? 'Authorization was cancelled.' : decodeURIComponent(urlError)}
          </div>
        )}

        {fetchError && (
          <p className="text-sm text-red-400">{fetchError}</p>
        )}

        <button onClick={handleConnect} disabled={loading} className="btn-primary w-full disabled:opacity-50">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Redirecting to Yahoo…
            </span>
          ) : 'Connect Yahoo Fantasy'}
        </button>

        <p className="text-[11px] text-content-muted text-center">
          You'll be redirected to Yahoo to authorize, then returned here automatically.
        </p>
      </div>
    </div>
  )
}

function RosterView({ data }) {
  const roster = data?.roster || []
  const sorted = [...roster].sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a.selected_position) ?? 99
    const bi = POSITION_ORDER.indexOf(b.selected_position) ?? 99
    return ai - bi
  })

  const groups = sorted.reduce((acc, player) => {
    const group = POSITION_GROUP[player.selected_position] || 'Bench'
    if (!acc[group]) acc[group] = []
    acc[group].push(player)
    return acc
  }, {})

  const groupOrder = ['Batters', 'Pitchers', 'Bench', 'Injured', 'Not Active']

  return (
    <div className="space-y-4">
      <FactoidsPanel
        queryKey={['yahoo-insights']}
        queryFn={() => api.yahoo.insights()}
        scrollable={false}
        title="Roster Digest"
        description="AI notes about your current starters, matchup context, and today’s box-score impact."
      />

      <FreeAgentCandidates />

      <FactoidsPanel
        queryKey={['yahoo-free-agent-insights']}
        queryFn={() => api.yahoo.freeAgents()}
        scrollable={false}
        title="Pickup Ideas"
        description="AI recommendations based on players who are actually free agents in your Yahoo league."
      />

      <MatchupSummary matchup={data?.current_matchup} />

      <div className="card p-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-content-primary font-medium">{data?.games_today || 0} players active today</span>
        <span className="text-content-muted">{data?.live_games || 0} games live</span>
      </div>

      {groupOrder.map((group) =>
        groups[group]?.length ? (
          <RosterGroup key={group} title={group} players={groups[group]} />
        ) : null
      )}
    </div>
  )
}

export default function YahooFantasy() {
  const [searchParams, setSearchParams] = useSearchParams()
  const connected = searchParams.get('connected')
  const urlError = searchParams.get('error')
  const queryClient = useQueryClient()

  useEffect(() => {
    if (connected) {
      queryClient.invalidateQueries({ queryKey: ['yahoo-status'] })
      queryClient.invalidateQueries({ queryKey: ['yahoo-dashboard'] })
      setSearchParams({}, { replace: true })
    }
  }, [connected, queryClient, setSearchParams])

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['yahoo-status'],
    queryFn: () => api.yahoo.status(),
    staleTime: 60_000,
  })

  const { data: dashboardData, isLoading: rosterLoading, error: rosterError } = useQuery({
    queryKey: ['yahoo-dashboard'],
    queryFn: () => api.yahoo.dashboard(),
    enabled: statusData?.authenticated === true,
    staleTime: 2 * 60_000,
  })

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-content-muted text-sm gap-2">
        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        Loading…
      </div>
    )
  }

  if (!statusData?.authenticated) {
    return (
      <div className="py-8">
        <h1 className="text-2xl font-bold text-content-primary mb-8 text-center">Fantasy Baseball</h1>
        <ConnectFlow urlError={urlError} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-content-primary">My Roster</h1>
        <span className="text-xs text-content-muted">Yahoo Fantasy Baseball</span>
      </div>

      {rosterLoading && (
        <div className="flex items-center gap-2 text-content-muted text-sm">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          Loading roster…
        </div>
      )}

      {rosterError && (
        <div className="card p-4 text-sm text-red-400">Failed to load roster. Try refreshing.</div>
      )}

      {dashboardData?.error && (
        <div className="card p-4 text-sm text-red-400">{dashboardData.error}</div>
      )}

      {dashboardData && !dashboardData.error && <RosterView data={dashboardData} />}
    </div>
  )
}
