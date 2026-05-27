import { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext, Fragment } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../api'
import PlayerLink from '../components/PlayerLink'
import StatHelpTooltip from '../components/StatHelpTooltip'
import FactoidsPanel from '../components/FactoidsPanel'
import RosterSandbox from '../components/RosterSandbox'
import RollingAverageChart from '../components/charts/RollingAverageChart'
import { PlayerListsContext, listKey } from '../hooks/usePlayerLists.jsx'

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

function gameTime(isoDate) {
  if (!isoDate) return null
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function matchupText(player) {
  if (!player.game_today || !player.matchup) {
    return 'No game today'
  }

  const { matchup } = player
  const side = matchup.is_home ? 'vs' : '@'
  const opponent = matchup.opponent?.abbreviation || matchup.opponent?.name || 'TBD'
  const teamScore = matchup.score?.team
  const opponentScore = matchup.score?.opponent
  const hasScore = teamScore != null && opponentScore != null
  const abstract = matchup.abstract_state || ''
  const status = matchup.status || ''

  if (abstract === 'Final' || status.includes('Final') || status.includes('Game Over')) {
    return hasScore
      ? `Final · ${side} ${opponent} ${teamScore}-${opponentScore}`
      : `Final · ${side} ${opponent}`
  }

  if (abstract === 'Live' || status.includes('Progress') || status.includes('Warmup')) {
    return hasScore
      ? `Live · ${side} ${opponent} ${teamScore}-${opponentScore}`
      : `Live · ${side} ${opponent}`
  }

  const time = gameTime(matchup.game_date)
  return time ? `Upcoming · ${side} ${opponent} ${time}` : `Upcoming · ${side} ${opponent}`
}

function matchupColorClass(player) {
  if (!player.game_today || !player.matchup) return 'text-content-muted'
  const abstract = player.matchup.abstract_state || ''
  const status = player.matchup.status || ''
  if (abstract === 'Live' || status.includes('Progress') || status.includes('Warmup')) return 'text-green-400'
  if (abstract === 'Final' || status.includes('Final') || status.includes('Game Over')) return 'text-content-muted'
  return 'text-content-secondary'
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
          <div className={`text-[11px] mt-0.5 ${matchupColorClass(player)}`}>
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

// ── Ottoneu ───────────────────────────────────────────────────────────────────

const FA_POSITIONS = ['All', 'C', '1B', '2B', '3B', 'SS', 'OF', 'SP', 'RP']

const FG_POINTS_HITTING = [
  ['AB', -1.0], ['H', +5.6], ['2B', +2.9], ['3B', +5.7], ['HR', +9.4],
  ['BB', +3.0], ['HBP', +3.0], ['SB', +1.9], ['CS', -2.8],
]
const FG_POINTS_PITCHING = [
  ['IP', +7.4], ['K', +2.0], ['H', -2.6], ['BB', -3.0],
  ['HBP', -3.0], ['HR', -12.3], ['SV', +5.0], ['HLD', +4.0],
]

function ScoringReference() {
  const [open, setOpen] = useState(true)
  return (
    <div className="card p-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-content-muted"
      >
        <span>FanGraphs Points Scoring</span>
        <span className="text-[9px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-6 text-[11px]">
          {[['Hitting', FG_POINTS_HITTING], ['Pitching', FG_POINTS_PITCHING]].map(([label, rows]) => (
            <div key={label}>
              <div className="font-semibold text-content-secondary mb-2">{label}</div>
              <div className="space-y-0.5">
                {rows.map(([stat, pts]) => (
                  <div key={stat} className="flex justify-between">
                    <span className="text-content-muted font-mono">{stat}</span>
                    <span className={`font-bold font-mono ${pts > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {pts > 0 ? '+' : ''}{pts.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatWarehouseStat(stats) {
  if (!stats) return null
  if (stats.group === 'batter')  return stats.woba  != null ? `wOBA ${Number(stats.woba).toFixed(3)}`  : `${stats.hr ?? 0} HR`
  if (stats.group === 'pitcher') return stats.fip   != null ? `FIP ${Number(stats.fip).toFixed(2)}`   : null
  return null
}


function SortTh({ label, col, sort, onSort, align = 'right', statKey, stickyHeader = false, dragHandlers }) {
  const active = sort.key === col
  const base = `font-semibold select-none hover:text-content-primary transition-colors whitespace-nowrap text-${align} ${dragHandlers ? 'cursor-grab' : 'cursor-pointer'}`
  const cls  = stickyHeader
    ? `${base} sticky top-0 bg-bg-elevated border-b border-bg-border py-2 px-2`
    : `${base} pb-2`
  return (
    <th onClick={() => onSort(col)} className={cls} {...dragHandlers}>
      <span className="inline-flex items-center gap-0.5 justify-end">
        {label}
        {statKey && <StatHelpTooltip stat={statKey} />}
        {active
          ? <span className="text-brand">{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span>
          : <span className="opacity-25 text-[9px]"> ↕</span>}
      </span>
    </th>
  )
}

// ─── Column system ────────────────────────────────────────────────────────────

const _TD = 'py-1 px-2 border-b border-bg-border/20 text-right font-mono'

const BATTER_STAT_COLS = [
  { key: 'avg',      label: 'AVG',  col: 'avg',      render: r => r.avg      != null ? Number(r.avg).toFixed(3)      : '—', tdClass: `${_TD} text-content-muted` },
  { key: 'obp',      label: 'OBP',  col: 'obp',      render: r => r.obp      != null ? Number(r.obp).toFixed(3)      : '—', tdClass: `${_TD} text-content-muted` },
  { key: 'woba',     label: 'wOBA', col: 'woba',     render: r => r.woba     != null ? Number(r.woba).toFixed(3)     : '—', tdClass: `${_TD} font-semibold text-content-primary` },
  { key: 'wrc_plus', label: 'wRC+', col: 'wrc_plus', render: r => r.wrc_plus ?? '—',                                        tdClass: `${_TD} text-content-muted` },
  { key: 'ab',       label: 'AB',   col: 'ab',       render: r => r.ab       ?? '—',                                        tdClass: `${_TD} text-content-muted` },
  { key: 'h',        label: 'H',    col: 'h',        render: r => r.h        ?? '—',                                        tdClass: `${_TD} text-content-muted` },
  { key: 'hr',       label: 'HR',   col: 'hr',       render: r => r.hr       ?? '—',                                        tdClass: `${_TD} text-content-muted` },
  { key: 'bb',       label: 'BB',   col: 'bb',       render: r => r.bb       ?? '—',                                        tdClass: `${_TD} text-content-muted` },
  { key: 'sb',       label: 'SB',   col: 'sb',       render: r => r.sb       ?? '—',                                        tdClass: `${_TD} text-content-muted` },
]

const PITCHER_STAT_COLS = [
  { key: 'era',     label: 'ERA',  col: 'era',     render: r => r.era     != null ? Number(r.era).toFixed(2)      : '—', tdClass: `${_TD} text-content-muted` },
  { key: 'fip',     label: 'FIP',  col: 'fip',     render: r => r.fip     != null ? Number(r.fip).toFixed(2)      : '—', tdClass: `${_TD} font-semibold text-content-primary` },
  { key: 'whip',    label: 'WHIP', col: 'whip',    render: r => r.whip    != null ? Number(r.whip).toFixed(2)     : '—', tdClass: `${_TD} text-content-muted` },
  { key: 'k_per_9', label: 'K/9',  col: 'k_per_9', render: r => r.k_per_9 != null ? Number(r.k_per_9).toFixed(1) : '—', tdClass: `${_TD} text-content-muted` },
  { key: 'k_pct',   label: 'K%',   col: 'k_pct',   render: r => r.k_pct   != null ? `${Number(r.k_pct).toFixed(1)}%` : '—', tdClass: `${_TD} text-content-muted` },
  { key: 'ip',      label: 'IP',   col: 'ip',      render: r => r.ip      != null ? Number(r.ip).toFixed(1)       : '—', tdClass: `${_TD} text-content-muted` },
  { key: 'k',       label: 'K',    col: 'k',       render: r => r.k       ?? '—',                                         tdClass: `${_TD} text-content-muted` },
  { key: 'h',       label: 'H',    col: 'h',       render: r => r.h       ?? '—',                                         tdClass: `${_TD} text-content-muted` },
  { key: 'sv',      label: 'SV',   col: 'sv',      render: r => r.sv      ?? '—',                                         tdClass: `${_TD} text-content-muted` },
]

const LS_FANTASY_COLS = [
  { key: 'approx_fg_pts', label: 'Pts',      col: 'approx_fg_pts', statKey: 'approxFgPts',
    render: r => r.approx_fg_pts != null ? r.approx_fg_pts : '—',
    tdClass: `${_TD} font-semibold text-content-primary` },
  { key: 'ppd', label: 'PPD', col: 'ppd', statKey: 'ppd',
    render: r => r.ppd != null ? r.ppd.toFixed(1) : '—',
    tdClass: r => `${_TD} font-semibold ${ppdColor(r.ppd)}` },
  { key: 'surplus', label: 'Surplus$', col: 'surplus', statKey: 'surplus',
    render: r => r.surplus != null ? (r.surplus >= 0 ? `+${r.surplus}` : `${r.surplus}`) : '—',
    tdClass: r => {
      const c = r.surplus == null ? 'text-content-muted' : r.surplus >= 50 ? 'text-green-400' : r.surplus >= 0 ? 'text-content-primary' : r.surplus >= -30 ? 'text-amber-400' : 'text-red-400'
      return `${_TD} font-semibold ${c}`
    } },
]

const FA_FANTASY_COLS = [
  { key: 'approx_fg_pts', label: 'Pts',      col: 'approx_fg_pts',    statKey: 'approxFgPts',
    render: r => r.approx_fg_pts != null ? r.approx_fg_pts : '—',
    tdClass: `${_TD} font-semibold text-content-primary` },
  { key: 'projected_pts', label: 'Proj Pts', col: 'projected_pts',    statKey: 'projectedPts',
    render: r => r.projected_pts != null ? Number(r.projected_pts).toFixed(0) : '—',
    tdClass: `${_TD} text-content-muted` },
  { key: 'vs_projection', label: 'vs Proj',  col: 'vs_projection',    statKey: 'vsProjection',
    render: r => { const v = r.vs_projection; return v != null ? `${v > 0 ? '+' : ''}${Number(v).toFixed(0)}` : '—' },
    tdClass: r => { const v = r.vs_projection; const c = v == null ? 'text-content-muted' : v >= 10 ? 'text-green-400' : v >= 0 ? 'text-content-primary' : v >= -10 ? 'text-amber-400' : 'text-red-400'; return `${_TD} font-semibold ${c}` } },
  { key: 'fair_value_salary', label: 'Fair $', col: 'fair_value_salary', statKey: 'fairValueSalary',
    render: r => r.fair_value_salary != null ? `$${Number(r.fair_value_salary).toFixed(0)}` : '—',
    tdClass: `${_TD} text-content-secondary` },
]

const ALL_COL_MAP = [...BATTER_STAT_COLS, ...PITCHER_STAT_COLS, ...LS_FANTASY_COLS, ...FA_FANTASY_COLS]
  .reduce((m, c) => { m[c.key] = c; return m }, {})

function useColumnOrder(allKeys) {
  const [order, setOrder] = useState(allKeys)
  const [hidden, setHidden] = useState(new Set())
  const dragSrc = useRef(null)

  const visibleFrom = useCallback((keys) =>
    order.filter(k => keys.includes(k) && !hidden.has(k)),
    [order, hidden]
  )

  const dragProps = useCallback((key) => ({
    draggable: true,
    onDragStart: () => { dragSrc.current = key },
    onDragOver:  (e) => e.preventDefault(),
    onDrop:      (e) => {
      e.preventDefault()
      if (!dragSrc.current || dragSrc.current === key) return
      setOrder(prev => {
        const next = [...prev]
        const fi = next.indexOf(dragSrc.current)
        const ti = next.indexOf(key)
        if (fi < 0 || ti < 0) return prev
        next.splice(fi, 1)
        next.splice(ti, 0, dragSrc.current)
        return next
      })
      dragSrc.current = null
    },
  }), [])

  const toggle = useCallback((key) => setHidden(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  }), [])

  return { hidden, visibleFrom, dragProps, toggle }
}

function ColumnPicker({ groups, hidden, onToggle }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const allCols = groups.flatMap(g => g.cols)
  const hiddenCount = allCols.filter(c => hidden.has(c.key)).length

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`text-[11px] font-medium px-2.5 py-1 rounded border transition-colors ${
          hiddenCount > 0 || open ? 'border-brand bg-brand/10 text-brand' : 'border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary'
        }`}
      >
        {hiddenCount > 0 ? `Cols (−${hiddenCount})` : 'Cols'}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-bg-elevated border border-bg-border rounded-lg p-2 z-50 shadow-lg min-w-[140px]">
          {groups.map((g, gi) => (
            <div key={g.label}>
              {gi > 0 && <div className="border-t border-bg-border/50 mt-1.5 mb-1" />}
              <div className="text-[9px] font-semibold uppercase tracking-wider text-content-muted mb-1 px-1">{g.label}</div>
              {g.cols.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-[11px] py-0.5 px-1 cursor-pointer rounded hover:bg-bg-border/30">
                  <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => onToggle(c.key)} className="accent-brand w-3 h-3" />
                  <span className="text-content-secondary">{c.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Drag-to-scroll ───────────────────────────────────────────────────────────

function useDragScroll() {
  const ref  = useRef(null)
  const drag = useRef({ down: false, moved: false, x: 0, y: 0, sl: 0, st: 0 })

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    if (e.target.closest('button, a, input, select, th')) return
    const el = ref.current
    if (!el) return
    drag.current = { down: true, moved: false, x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
    el.style.userSelect = 'none'
  }, [])

  const onMouseMove = useCallback((e) => {
    const d = drag.current
    if (!d.down) return
    const el = ref.current
    if (!el) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return
    d.moved = true
    el.scrollLeft = d.sl - dx
    el.scrollTop  = d.st - dy
  }, [])

  const onEnd = useCallback(() => {
    const el = ref.current
    if (el) el.style.userSelect = ''
    drag.current.down = false
  }, [])

  // capture phase — fires before row onClick so we can swallow the click after a drag
  const onClickCapture = useCallback((e) => {
    if (drag.current.moved) {
      e.stopPropagation()
      drag.current.moved = false
    }
  }, [])

  return { ref, onMouseDown, onMouseMove, onMouseUp: onEnd, onMouseLeave: onEnd, onClickCapture }
}

// ─── Player Lists (Watch / Cut / Trade) ──────────────────────────────────────

const LIST_META = {
  watch: { label: 'Watchlist', accent: 'text-sky-400',   activeBg: 'bg-sky-400/10',   hoverClass: 'hover:text-sky-400',   icon: '◎' },
  cut:   { label: 'Cut List',  accent: 'text-red-400',   activeBg: 'bg-red-400/10',   hoverClass: 'hover:text-red-400',   icon: '✂' },
  trade: { label: 'Trade',     accent: 'text-amber-400', activeBg: 'bg-amber-400/10', hoverClass: 'hover:text-amber-400', icon: '⇄' },
}

// player: { player_id, fg_id, name, mlb_team/team, roster_team, salary, approx_fg_pts, on_my_team }
// isMyTeam: overrides player.on_my_team when calling from a context that knows
function PlayerListButtons({ player, isMyTeam, className = '', size = 'sm' }) {
  const { toggle, isOn } = useContext(PlayerListsContext) ?? {}
  if (!toggle) return null

  const myTeam      = isMyTeam ?? player.on_my_team ?? false
  const isFreeAgent = !player.roster_team
  const lists       = myTeam
    ? ['cut', 'trade']
    : isFreeAgent
      ? ['watch']
      : ['watch', 'trade']

  const btnCls    = size === 'md'
    ? 'text-sm w-7 h-7 flex items-center justify-center rounded transition-colors'
    : 'text-[11px] w-5 h-5 flex items-center justify-center rounded transition-colors'
  const idleCls   = size === 'md' ? 'text-content-secondary' : 'text-content-muted/60'

  return (
    <span className={`inline-flex gap-0.5 ${className}`} onClick={e => e.stopPropagation()}>
      {lists.map(list => {
        const { icon, accent, activeBg, hoverClass } = LIST_META[list]
        const active = isOn(player, list)
        return (
          <button
            key={list}
            onClick={() => toggle(player, list)}
            title={active ? `Remove from ${LIST_META[list].label}` : `Add to ${LIST_META[list].label}`}
            className={`${btnCls} ${active ? `${accent} ${activeBg}` : `${idleCls} ${hoverClass}`}`}
          >
            {icon}
          </button>
        )
      })}
    </span>
  )
}

function PlayerListPanel() {
  const ctx = useContext(PlayerListsContext)
  if (!ctx) return null
  const { lists, remove, clear } = ctx

  const total = Object.values(lists).reduce((n, arr) => n + arr.length, 0)

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-content-muted">Player Lists</span>
        {total > 0 && <span className="text-[9px] text-content-muted">{total} total</span>}
      </div>

      <div className="space-y-4">
        {Object.entries(LIST_META).map(([listKey_, { label, accent }]) => {
          const players = lists[listKey_]
          return (
            <div key={listKey_}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[9px] font-bold uppercase tracking-widest ${accent}`}>{label}</span>
                {players.length > 0 && (
                  <button onClick={() => clear(listKey_)} className="text-[9px] text-content-muted hover:text-red-400 transition-colors">Clear</button>
                )}
              </div>

              {players.length === 0 ? (
                <p className="text-[10px] text-content-muted/60 italic">Empty</p>
              ) : (
                <div className="space-y-1.5">
                  {players.map(p => (
                    <div key={p._key} className="flex items-center gap-1.5 group/item min-w-0">
                      {p.player_id ? (
                        <img
                          src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_32,q_auto:best/v1/people/${p.player_id}/headshot/67/current`}
                          alt="" className="w-6 h-6 rounded-full object-cover bg-bg-border shrink-0"
                          onError={e => { e.currentTarget.style.display = 'none' }}
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-bg-border shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        {p.player_id ? (
                          <Link to={`/player/${p.player_id}`} className="text-[11px] font-medium text-brand-light hover:underline truncate block leading-tight">{p.name}</Link>
                        ) : (
                          <span className="text-[11px] font-medium text-content-primary truncate block leading-tight">{p.name}</span>
                        )}
                        <div className="flex gap-1.5 text-[9px] text-content-muted leading-tight mt-px">
                          {p.mlb_team && <span>{p.mlb_team}</span>}
                          {p.approx_fg_pts != null && <span className="font-mono">{p.approx_fg_pts}pt</span>}
                          {p.salary != null && <span className="font-mono">${p.salary}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => remove(p, listKey_)}
                        className="opacity-0 group-hover/item:opacity-100 text-[10px] text-content-muted hover:text-red-400 transition-all shrink-0 leading-none px-0.5"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function sortRows(rows, sort) {
  return [...rows].sort((a, b) => {
    const va  = a[sort.key]
    const vb  = b[sort.key]
    const dir = sort.dir === 'asc' ? 1 : -1
    if (va == null && vb == null) return 0
    if (va == null) return 1   // nulls always last regardless of direction
    if (vb == null) return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va).localeCompare(String(vb)) * dir
  })
}

function salaryBadge(salary) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-brand/10 text-brand border border-brand/20">
      ${salary}
    </span>
  )
}

// Ottoneu value constants
const FAIR_PPD        = 10   // pts per dollar = "fair value" baseline
const PPD_EXCELLENT   = 15
const PPD_GOOD        = 10
const PPD_BELOW       = 5

function calcPPD(pts, salary) {
  if (!salary || salary <= 0 || pts == null) return null
  return pts / salary
}

function ppdColor(ppd) {
  if (ppd == null) return 'text-content-muted'
  if (ppd >= PPD_EXCELLENT) return 'text-green-400'
  if (ppd >= PPD_GOOD)      return 'text-brand'
  if (ppd >= PPD_BELOW)     return 'text-amber-400'
  return 'text-red-400'
}

function ppdBadge(pts, salary) {
  const ppd = calcPPD(pts, salary)
  if (ppd == null) return null
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className={`text-[10px] font-mono font-semibold ${ppdColor(ppd)}`}>
        {ppd.toFixed(1)}<span className="text-[9px] opacity-70"> PPD</span>
      </span>
      <StatHelpTooltip stat="ppd" />
    </span>
  )
}

function OttoneuRowMetrics({ pts, cost, endTime, expanded }) {
  const { leaguePtsDist, leaguePpdDist, leagueSurplusDist } = useContext(OttoneuLeagueContext)
  const ppd            = calcPPD(pts, cost)
  const surplus        = pts != null && cost > 0 ? Math.round(pts / FAIR_PPD) - cost : null
  const ptsPctile      = ptsPct(pts,     leaguePtsDist)
  const ppdPctile      = ptsPct(ppd,     leaguePpdDist)
  const surplusPctile  = ptsPct(surplus, leagueSurplusDist)

  return (
    <div className="shrink-0 flex items-stretch divide-x divide-bg-border/50">
      {cost > 0 && (
        <div className="pr-3 flex items-center">
          {salaryBadge(cost)}
        </div>
      )}
      {pts != null && (
        <div className="px-3 text-right min-w-[56px]">
          <div className={`text-[15px] font-bold font-mono tabular-nums leading-none ${Number(pts) < 0 ? 'text-red-400' : 'text-brand'}`}>
            {Number(pts).toFixed(1)}
          </div>
          <div className="text-[9px] text-content-muted leading-none mt-0.5">~FG pts</div>
          {ptsPctile != null && (
            <div className="mt-1 h-0.5 w-8 ml-auto rounded-full bg-bg-border overflow-hidden">
              <div className={`h-full rounded-full ${pctBarColor(ptsPctile)}`} style={{ width: `${ptsPctile}%` }} />
            </div>
          )}
        </div>
      )}
      {ppd != null && (
        <div className="px-3 text-right min-w-[56px]">
          <div className={`text-[15px] font-bold font-mono tabular-nums leading-none ${ppdColor(ppd)}`}>
            {ppd.toFixed(1)}
          </div>
          <div className="flex items-center justify-end gap-0.5 text-[9px] text-content-muted leading-none mt-0.5">
            PPD <StatHelpTooltip stat="ppd" />
          </div>
          {ppdPctile != null && (
            <div className="mt-1 h-0.5 w-8 ml-auto rounded-full bg-bg-border overflow-hidden">
              <div className={`h-full rounded-full ${pctBarColor(ppdPctile)}`} style={{ width: `${ppdPctile}%` }} />
            </div>
          )}
        </div>
      )}
      {surplus != null && (
        <div className="px-3 text-right min-w-[56px]">
          <div className={`text-[15px] font-bold font-mono tabular-nums leading-none ${
            surplus >= 10  ? 'text-green-400'
              : surplus >= 0  ? 'text-content-primary'
              : surplus >= -10 ? 'text-amber-400'
              : 'text-red-400'
          }`}>
            {surplus >= 0 ? `+$${surplus}` : `-$${Math.abs(surplus)}`}
          </div>
          <div className="flex items-center justify-end gap-0.5 text-[9px] text-content-muted leading-none mt-0.5">
            surplus <StatHelpTooltip stat="surplus" />
          </div>
          {surplusPctile != null && (
            <div className="mt-1 h-0.5 w-8 ml-auto rounded-full bg-bg-border overflow-hidden">
              <div className={`h-full rounded-full ${pctBarColor(surplusPctile)}`} style={{ width: `${surplusPctile}%` }} />
            </div>
          )}
        </div>
      )}
      {endTime && (
        <div className="px-3 hidden sm:flex flex-col items-end justify-center">
          <div className="text-[10px] text-content-muted">Ends</div>
          <div className={`text-[11px] font-medium ${auctionEndColor(endTime)}`}>{endTime}</div>
        </div>
      )}
      <div className="pl-2 flex items-center">
        <span className="text-[9px] text-content-muted">{expanded ? '▲' : '▼'}</span>
      </div>
    </div>
  )
}

// ── League-wide percentile context ─────────────────────────────────────────
// leaguePtsDist: sorted number[] of all rostered players' season pts — set at OttoneuView level
const OttoneuLeagueContext = createContext({ leaguePtsDist: [], leaguePpdDist: [], leagueSurplusDist: [] })

function ptsPct(val, dist) {
  if (val == null || !dist?.length) return null
  const below = dist.filter(v => v < val).length
  return Math.round((below / dist.length) * 100)
}

function pctBarColor(pct) {
  if (pct >= 75) return 'bg-green-400'
  if (pct >= 50) return 'bg-brand'
  if (pct >= 25) return 'bg-amber-400'
  return 'bg-red-400'
}

function pctTextColor(pct) {
  if (pct == null) return 'text-content-secondary'
  if (pct >= 75) return 'text-green-400'
  if (pct >= 50) return 'text-blue-400'
  if (pct >= 25) return 'text-amber-400'
  return 'text-red-400'
}

function auctionEndColor(endTime) {
  if (!endTime) return 'text-content-secondary'
  const parsed = new Date(`${endTime} ${new Date().getFullYear()}`)
  if (isNaN(parsed.getTime())) return 'text-content-secondary'
  const hours = (parsed.getTime() - Date.now()) / 3_600_000
  if (hours < 0)  return 'text-content-muted'
  if (hours < 12) return 'text-red-400'
  if (hours < 48) return 'text-amber-400'
  return 'text-green-400'
}

function isMinorLeaguer(player) {
  return /aaa|aa\b|a\+|a-/i.test(player.mlb_team || '')
}

function isPitcherOttoneu(player) {
  return /\bSP\b|\bRP\b/i.test(player.positions || '')
}

function OttoneuRosterView() {
  const { data: rosterData, isLoading, error } = useQuery({
    queryKey: ['ottoneu-roster'],
    queryFn: () => api.ottoneu.roster(),
    staleTime: 30 * 60_000,
  })

  const { data: capData } = useQuery({
    queryKey: ['ottoneu-cap'],
    queryFn: () => api.ottoneu.capOverview(),
    staleTime: 30 * 60_000,
  })

  const { data: insightsData } = useQuery({
    queryKey: ['ottoneu-insights'],
    queryFn: () => api.ottoneu.insights(),
    staleTime: 15 * 60_000,
  })

  const players = rosterData?.players ?? []
  const rosterFgIds = useMemo(() => players.filter(p => p.fg_id).map(p => p.fg_id), [players])

  const { data: rosterStats = [] } = useQuery({
    queryKey: ['ottoneu-roster-stats', rosterFgIds.slice().sort().join(',')],
    queryFn: () => api.ottoneu.playerStats({ fgIds: rosterFgIds }),
    enabled: rosterFgIds.length > 0,
    staleTime: 30 * 60_000,
  })

  const rosterStatsMap = useMemo(
    () => Object.fromEntries(rosterStats.map(s => [String(s.fg_id), s])),
    [rosterStats]
  )

  // Resolve MLB player IDs for PlayerLink
  const { data: playerIdMap = {} } = useQuery({
    queryKey: ['ottoneu-roster-player-ids', players.map(p => p.name).join(',')],
    enabled: players.length > 0,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const entries = await Promise.all(
        players.filter(p => p.fg_id).map(async (player) => {
          const results = await api.players.search(player.name)
          const match = results?.find(r =>
            normalize(r.name) === normalize(player.name)
          )
          return [player.name, match?.id ?? null]
        })
      )
      return Object.fromEntries(entries)
    },
  })

  const myCap = useMemo(() => {
    return Array.isArray(capData) ? capData.find(t => t.team_name?.includes('Dingers')) : null
  }, [capData])

  // Build map from player name → { recent_games, season_points } from insights featured players
  const playerInsightsMap = useMemo(() => {
    const featured = insightsData?.featured_players ?? []
    return Object.fromEntries(featured.map(p => [p.name, { recent_games: p.recent_games ?? [], season_points: p.season_points }]))
  }, [insightsData])

  const [rosterSort, setRosterSort]         = useState('ppd')
  const [rosterSearch, setRosterSearch]     = useState('')
  const [rosterPosition, setRosterPosition] = useState('All')

  const ilPlayers = players.filter(p => p.mlb_il)
  const batters   = players.filter(p => !isPitcherOttoneu(p) && !isMinorLeaguer(p) && !p.mlb_il)
  const pitchers  = players.filter(p =>  isPitcherOttoneu(p) && !isMinorLeaguer(p) && !p.mlb_il)
  const minors    = players.filter(p => isMinorLeaguer(p) && !p.mlb_il)

  function getPlayerPts(p) {
    if (p.season_points > 0) return p.season_points
    const ws = p.fg_id ? rosterStatsMap[String(p.fg_id)] ?? null : null
    return ws?.approx_fg_pts ?? 0
  }

  function filterAndSortGroup(group) {
    const q = rosterSearch.toLowerCase()
    return [...group]
      .filter(p => {
        if (rosterPosition !== 'All' && !p.positions?.includes(rosterPosition)) return false
        if (q && !p.name?.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        const ptsA = getPlayerPts(a), ptsB = getPlayerPts(b)
        const salA = a.salary || 0,   salB = b.salary || 0
        if (rosterSort === 'ppd')     return (salB > 0 ? ptsB / salB : 0) - (salA > 0 ? ptsA / salA : 0)
        if (rosterSort === 'surplus') return (Math.round(ptsB / FAIR_PPD) - salB) - (Math.round(ptsA / FAIR_PPD) - salA)
        if (rosterSort === 'points')  return ptsB - ptsA
        if (rosterSort === 'salary')  return salB - salA
        return 0
      })
  }

  const capSpace   = insightsData?.cap_space ?? myCap?.cap_space
  const salaryUsed = insightsData?.salary_used ?? myCap?.base_salary

  if (isLoading) return <div className="text-sm text-content-muted">Loading roster…</div>
  if (error || rosterData?.error) return (
    <div className="card p-4 text-sm text-red-400">{rosterData?.error || 'Failed to load roster.'}</div>
  )

  return (
    <div className="space-y-4">
      <FactoidsPanel
        queryKey={['ottoneu-insights']}
        queryFn={() => api.ottoneu.insights()}
        scrollable={false}
        title="Roster Digest"
        description="AI notes about your Ottoneu starters, matchup context, and salary efficiency."
      />

      <div className="card p-4 flex flex-wrap items-center gap-4 text-sm">
        <span className="text-content-primary font-medium">{rosterData?.team_name ?? 'Dingers and Dugouts'}</span>
        <span className="text-content-muted">{players.length} rostered</span>
        {ilPlayers.length > 0 && <span className="text-red-400 font-semibold">{ilPlayers.length} on IL</span>}
        {salaryUsed != null && <span className="text-content-muted">Salary: <span className="font-semibold text-content-secondary">${salaryUsed}</span> / $400</span>}
        {myCap?.penalties > 0 && <span className="text-red-400">Penalties: ${myCap.penalties}</span>}
        {capSpace != null && <span className={`font-semibold ${capSpace >= 50 ? 'text-green-400' : capSpace >= 10 ? 'text-content-primary' : 'text-amber-400'}`}>${capSpace} available</span>}
        <span className="text-[11px] text-content-muted ml-auto">Full roster · IL players cannot score</span>
      </div>

      <div className="card p-3 space-y-2.5">
        {/* Name search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted/50 text-sm pointer-events-none">⌕</span>
          <input
            type="text"
            value={rosterSearch}
            onChange={e => setRosterSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-bg-border bg-bg-elevated text-sm text-content-primary placeholder:text-content-muted/50 focus:outline-none focus:border-brand/50 transition-colors"
          />
          {rosterSearch && (
            <button onClick={() => setRosterSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted/50 hover:text-content-muted transition-colors text-xs">✕</button>
          )}
        </div>

        {/* Position filter */}
        <div className="flex flex-wrap gap-1.5">
          {FA_POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => setRosterPosition(pos)}
              className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                rosterPosition === pos
                  ? 'bg-brand/20 text-brand border border-brand/30'
                  : 'bg-bg-elevated border border-bg-border text-content-secondary hover:text-content-primary'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-content-muted">Sort:</span>
          {[['ppd', 'PPD'], ['surplus', 'Surplus'], ['points', 'Points'], ['salary', 'Salary']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setRosterSort(key)}
              className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                rosterSort === key
                  ? 'bg-brand/20 text-brand border border-brand/30'
                  : 'bg-bg-elevated border border-bg-border text-content-secondary hover:text-content-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {[['Batters', batters], ['Pitchers', pitchers], ['Injured List', ilPlayers], ['Minor Leaguers', minors]].map(([group, groupPlayers]) =>
        groupPlayers.length > 0 ? (
          <div key={group} className="card p-4">
            <h3 className={`text-[11px] font-semibold uppercase tracking-widest mb-3 ${group === 'Injured List' ? 'text-red-400' : 'text-content-muted'}`}>{group}</h3>
            <div className="space-y-0">
              {filterAndSortGroup(groupPlayers).map(player => {
                const insights = playerInsightsMap[player.name]
                const enriched = insights ? { ...player, season_points: insights.season_points ?? player.season_points } : player
                const ws = player.fg_id ? rosterStatsMap[String(player.fg_id)] ?? null : null
                return (
                  <OttoneuPlayerRow
                    key={player.ottoneu_id || player.name}
                    player={enriched}
                    mlbId={playerIdMap[player.name]}
                    recentGames={insights?.recent_games ?? []}
                    warehouseStats={ws}
                    isMyTeam={true}
                  />
                )
              })}
            </div>
          </div>
        ) : null
      )}

    </div>
  )
}

const BATTER_TREND_CHARTS = [
  { key: 'ops',   label: 'OPS',   color: '#6366F1' },
  { key: 'avg',   label: 'AVG',   color: '#22C55E' },
  { key: 'slg',   label: 'SLG',   color: '#F97316' },
  { key: 'babip', label: 'BABIP', color: '#14B8A6' },
]
const PITCHER_TREND_CHARTS = [
  { key: 'era',  label: 'ERA',  color: '#EF4444' },
  { key: 'whip', label: 'WHIP', color: '#F97316' },
]

// Same FG Points formula used by the backend insights service
function computeFgPts(g, isPitcher) {
  if (isPitcher) {
    const ip = parseFloat(g.ip) || 0
    const k  = parseInt(g.k ?? g.so) || 0
    const h  = parseInt(g.h)  || 0
    const bb = parseInt(g.bb) || 0
    const hr = parseInt(g.hr) || 0
    const sv = parseInt(g.sv) || 0
    return parseFloat((ip * 7.4 + k * 2.0 + h * -2.6 + bb * -3.0 + hr * -12.3 + sv * 5.0).toFixed(1))
  }
  const ab = parseInt(g.ab) || 0
  const h  = parseInt(g.h)  || 0
  const hr = parseInt(g.hr) || 0
  const bb = parseInt(g.bb) || 0
  const sb = parseInt(g.sb) || 0
  return parseFloat((ab * -1.0 + h * 5.6 + hr * 9.4 + bb * 3.0 + sb * 1.9).toFixed(1))
}

function OttoneuPlayerRow({ player, mlbId, recentGames = [], warehouseStats = null, isMyTeam = false }) {
  const [expanded, setExpanded] = useState(true)
  const isPitcher = isPitcherOttoneu(player) || warehouseStats?.group === 'pitcher'
  const season = new Date().getFullYear()

  const displayPts = player.season_points > 0 ? player.season_points : (warehouseStats?.approx_fg_pts ?? null)
  const ptsExact   = player.season_points > 0

  const { data: analysisData, isLoading: analysisLoading } = useQuery({
    queryKey: ['ottoneu-player-analysis', player.fg_id || player.name],
    queryFn: () => api.ottoneu.playerAnalysis({ fgId: player.fg_id, name: player.name }),
    enabled: expanded,
    staleTime: 30 * 60_000,
    retry: false,
  })

  const { data: gameLogData, isLoading: logLoading } = useQuery({
    queryKey: ['ottoneu-gamelog', mlbId, season, isPitcher ? 'pitching' : 'hitting'],
    queryFn: () => api.stats.gameLog(mlbId, season, isPitcher ? 'pitching' : 'hitting', 30),
    enabled: expanded && !!mlbId,
    staleTime: 30 * 60_000,
  })

  const chartGames = useMemo(() => {
    const games = gameLogData?.games ?? []
    const chrono = [...games].reverse()
    if (isPitcher) return chrono
    return chrono.map(g => {
      const ab = Number(g.ab) || 0
      const h  = Number(g.h)  || 0
      const hr = Number(g.hr) || 0
      const so = Number(g.so) || 0
      const denom = ab - so - hr
      return { ...g, babip: denom > 0 ? (h - hr) / denom : null }
    })
  }, [gameLogData, isPitcher])

  // Derive recent-game FG pts strip from chart data so every player gets it,
  // not just the handful covered by the insights featured_players fetch.
  const recentGamesStrip = useMemo(() => {
    if (chartGames.length > 0) {
      return chartGames.slice(-7).map(g => ({
        ...g,
        fg_pts: g.fg_pts ?? computeFgPts(g, isPitcher),
      }))
    }
    return recentGames
  }, [chartGames, recentGames, isPitcher])

  const trendCharts = isPitcher ? PITCHER_TREND_CHARTS : BATTER_TREND_CHARTS

  const { leaguePtsDist, leaguePpdDist, leagueSurplusDist } = useContext(OttoneuLeagueContext)
  const headerPpd           = displayPts != null && player.salary > 0 ? calcPPD(displayPts, player.salary) : null
  const headerSurplusDollar = displayPts != null && player.salary > 0
    ? Math.round(displayPts / FAIR_PPD) - player.salary
    : null
  const headerPtsPctile      = ptsPct(displayPts,        leaguePtsDist)
  const headerPpdPctile      = ptsPct(headerPpd,         leaguePpdDist)
  const headerSurplusPctile  = ptsPct(headerSurplusDollar, leagueSurplusDist)

  return (
    <div className={`border-b border-bg-border/50 last:border-0 ${expanded ? 'bg-bg-elevated/20' : ''}`}>

      {/* ── Header row ─────────────────────────────────── */}
      <div
        className="group py-3 flex items-center gap-3 cursor-pointer hover:bg-bg-elevated/30 transition-colors rounded px-1"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Avatar + link — click stops row toggle */}
        <div className="shrink-0" onClick={e => e.stopPropagation()}>
          <PlayerLink
            playerId={mlbId}
            name={player.name}
            imageClassName="w-9 h-9"
            textClassName="hidden"
          />
        </div>

        {/* Name + position */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-content-primary">{player.name}</span>
            <span className="text-[11px] text-content-muted">{player.mlb_team} · {player.positions}</span>
            {player.mlb_il && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border bg-red-500/15 text-red-400 border-red-500/30">
                IL
              </span>
            )}
          </div>

          {/* Inline stat chips — always visible */}
          {warehouseStats && (
            <div className="flex gap-2.5 mt-0.5 text-[11px] font-mono text-content-muted">
              {!isPitcher ? (
                <>
                  {warehouseStats.avg   != null && <span>AVG {Number(warehouseStats.avg).toFixed(3)}</span>}
                  {warehouseStats.ops   != null && <span>OPS {Number(warehouseStats.ops).toFixed(3)}</span>}
                  {warehouseStats.babip != null && <span>BABIP {Number(warehouseStats.babip).toFixed(3)}</span>}
                </>
              ) : (
                <>
                  {warehouseStats.era    != null && <span>ERA {Number(warehouseStats.era).toFixed(2)}</span>}
                  {warehouseStats.fip    != null && <span>FIP {Number(warehouseStats.fip).toFixed(2)}</span>}
                  {warehouseStats.k_per_9 != null && <span>K/9 {Number(warehouseStats.k_per_9).toFixed(1)}</span>}
                </>
              )}
            </div>
          )}
        </div>

        <PlayerListButtons
          player={{ player_id: mlbId, fg_id: player.fg_id, name: player.name, mlb_team: player.mlb_team, roster_team: player.roster_team ?? null, salary: player.salary, approx_fg_pts: displayPts }}
          isMyTeam={isMyTeam}
          size="md"
          className="shrink-0"
        />

        {/* Right side: salary | pts | PPD | surplus | caret */}
        <div className="shrink-0 flex items-stretch divide-x divide-bg-border/50">

          {/* Salary */}
          {player.salary > 0 && (
            <div className="pr-3 flex items-center">
              {salaryBadge(player.salary)}
            </div>
          )}

          {/* FG Pts */}
          {displayPts != null && (
            <div className="px-3 text-right min-w-[56px]">
              <div className={`text-[15px] font-bold font-mono tabular-nums leading-none ${Number(displayPts) < 0 ? 'text-red-400' : 'text-brand'}`}>
                {Number(displayPts).toFixed(1)}
              </div>
              <div className="text-[9px] text-content-muted leading-none mt-0.5">
                {ptsExact ? 'FG pts' : '~FG pts'}
              </div>
              {headerPtsPctile != null && (
                <div className="mt-1 h-0.5 w-8 ml-auto rounded-full bg-bg-border overflow-hidden">
                  <div className={`h-full rounded-full ${pctBarColor(headerPtsPctile)}`} style={{ width: `${headerPtsPctile}%` }} />
                </div>
              )}
            </div>
          )}

          {/* PPD */}
          {headerPpd != null && (
            <div className="px-3 text-right min-w-[56px]">
              <div className={`text-[15px] font-bold font-mono tabular-nums leading-none ${ppdColor(headerPpd)}`}>
                {headerPpd.toFixed(1)}
              </div>
              <div className="flex items-center justify-end gap-0.5 text-[9px] text-content-muted leading-none mt-0.5">
                PPD <StatHelpTooltip stat="ppd" />
              </div>
              {headerPpdPctile != null && (
                <div className="mt-1 h-0.5 w-8 ml-auto rounded-full bg-bg-border overflow-hidden">
                  <div className={`h-full rounded-full ${pctBarColor(headerPpdPctile)}`} style={{ width: `${headerPpdPctile}%` }} />
                </div>
              )}
            </div>
          )}

          {/* Surplus */}
          {headerSurplusDollar != null && (
            <div className="px-3 text-right min-w-[56px]">
              <div className={`text-[15px] font-bold font-mono tabular-nums leading-none ${
                headerSurplusDollar >= 10 ? 'text-green-400'
                  : headerSurplusDollar >= 0  ? 'text-content-primary'
                  : headerSurplusDollar >= -10 ? 'text-amber-400'
                  : 'text-red-400'
              }`}>
                {headerSurplusDollar >= 0 ? `+$${headerSurplusDollar}` : `-$${Math.abs(headerSurplusDollar)}`}
              </div>
              <div className="flex items-center justify-end gap-0.5 text-[9px] text-content-muted leading-none mt-0.5">
                surplus <StatHelpTooltip stat="surplus" />
              </div>
              {headerSurplusPctile != null && (
                <div className="mt-1 h-0.5 w-8 ml-auto rounded-full bg-bg-border overflow-hidden">
                  <div className={`h-full rounded-full ${pctBarColor(headerSurplusPctile)}`} style={{ width: `${headerSurplusPctile}%` }} />
                </div>
              )}
            </div>
          )}

          {/* Caret */}
          <div className="pl-2 flex items-center">
            <span className="text-[9px] text-content-muted">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
      </div>

      {/* ── Expanded panel ─────────────────────────────── */}
      {expanded && (
        <div className="px-3 pb-4 border-t border-bg-border/40 pt-3 space-y-3">

          {/* Recent FG pts game strip */}
          {recentGamesStrip.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-1.5">Recent Games</div>
              <div className="flex gap-2">
                {recentGamesStrip.map((g, i) => {
                  const pts = g.fg_pts ?? 0
                  return (
                    <div key={i} className="text-center min-w-[36px] rounded bg-bg-elevated border border-bg-border px-1.5 py-1">
                      <div className="text-[9px] text-content-muted">{shortDateLabel(g.date)}</div>
                      <div className={`text-[11px] font-bold font-mono mt-0.5 ${pts >= 10 ? 'text-green-400' : pts >= 0 ? 'text-content-secondary' : 'text-red-400'}`}>
                        {pts > 0 ? '+' : ''}{pts.toFixed(1)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Trend charts */}
          {mlbId && logLoading && (
            <div className="text-[11px] text-content-muted flex items-center gap-1.5">
              <span className="w-3 h-3 border border-brand border-t-transparent rounded-full animate-spin inline-block" />
              Loading trend charts…
            </div>
          )}
          {mlbId && !logLoading && chartGames.length > 3 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-2">
                Trends <span className="font-normal normal-case">(10-game rolling avg)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {trendCharts.map(({ key, label, color }) => (
                  <div key={key} className="rounded-lg border border-bg-border bg-bg-surface p-2">
                    <div className="text-[10px] font-semibold text-content-muted uppercase tracking-[0.06em] mb-1">{label}</div>
                    <RollingAverageChart
                      data={chartGames}
                      valueKey={key}
                      valueLabel={label}
                      color={color}
                      windowSize={10}
                      height={110}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {mlbId && !logLoading && chartGames.length <= 3 && (
            <div className="text-[11px] text-content-muted">Not enough game data yet.</div>
          )}

          {/* ── AI Analysis ──────────────────────────────── */}
          <div className="border-t border-bg-border/40 pt-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-2">
              Analysis
            </div>
            {analysisLoading && (
              <div className="text-[11px] text-content-muted flex items-center gap-1.5">
                <span className="w-3 h-3 border border-brand border-t-transparent rounded-full animate-spin inline-block" />
                Generating analysis…
              </div>
            )}
            {analysisData?.analysis && (
              <p className="text-sm text-content-secondary leading-relaxed">{analysisData.analysis}</p>
            )}
            {analysisData?.error && (
              <div className="text-[11px] text-red-400">{analysisData.error}</div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ── Reusable trend charts panel (game log fetch + chart grid) ──────────────

function TrendChartsSection({ mlbId, isPitcher, compact = false }) {
  const season = new Date().getFullYear()

  const { data: gameLogData, isLoading: logLoading } = useQuery({
    queryKey: ['ottoneu-gamelog', mlbId, season, isPitcher ? 'pitching' : 'hitting'],
    queryFn: () => api.stats.gameLog(mlbId, season, isPitcher ? 'pitching' : 'hitting', 30),
    enabled: !!mlbId,
    staleTime: 30 * 60_000,
  })

  const chartGames = useMemo(() => {
    const games = gameLogData?.games ?? []
    const chrono = [...games].reverse()
    if (isPitcher) return chrono
    return chrono.map(g => {
      const ab = Number(g.ab) || 0
      const h  = Number(g.h)  || 0
      const hr = Number(g.hr) || 0
      const so = Number(g.so) || 0
      const denom = ab - so - hr
      return { ...g, babip: denom > 0 ? (h - hr) / denom : null }
    })
  }, [gameLogData, isPitcher])

  const trendCharts = isPitcher ? PITCHER_TREND_CHARTS : BATTER_TREND_CHARTS

  if (!mlbId) return <div className="text-[11px] text-content-muted/60 italic">MLB ID unavailable — chart cannot load.</div>
  if (logLoading) return (
    <div className="text-[11px] text-content-muted flex items-center gap-1.5">
      <span className="w-3 h-3 border border-brand border-t-transparent rounded-full animate-spin inline-block" />
      Loading trend charts…
    </div>
  )
  if (chartGames.length <= 3) return <div className="text-[11px] text-content-muted/60 italic">Not enough game data yet.</div>

  const chartHeight = compact ? 90 : 110

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-2">
        Trends <span className="font-normal normal-case">(10-game rolling avg)</span>
      </div>
      <div className="grid grid-cols-2 gap-2" style={{ maxWidth: compact ? '36rem' : undefined }}>
        {trendCharts.map(({ key, label, color }) => (
          <div key={key} className="rounded-lg border border-bg-border bg-bg-surface p-2">
            <div className="text-[10px] font-semibold text-content-muted uppercase tracking-[0.06em] mb-1">{label}</div>
            <RollingAverageChart data={chartGames} valueKey={key} valueLabel={label} color={color} windowSize={10} height={chartHeight} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Expandable transaction rows ───────────────────────────────────────────────

function TxAnalysisSection({ name, fgId }) {
  const { data: analysisData, isLoading } = useQuery({
    queryKey: ['ottoneu-player-analysis', fgId || name],
    queryFn: () => api.ottoneu.playerAnalysis({ fgId, name }),
    staleTime: 30 * 60_000,
    retry: false,
  })

  return (
    <div className="border-t border-bg-border/40 pt-3 mt-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-2">Analysis</div>
      {isLoading && (
        <div className="text-[11px] text-content-muted flex items-center gap-1.5">
          <span className="w-3 h-3 border border-brand border-t-transparent rounded-full animate-spin inline-block" />
          Generating analysis…
        </div>
      )}
      {analysisData?.analysis && (
        <p className="text-sm text-content-secondary leading-relaxed max-w-2xl">{analysisData.analysis}</p>
      )}
      {analysisData?.error && (
        <div className="text-[11px] text-red-400/80">{analysisData.error}</div>
      )}
    </div>
  )
}

function TxStatChips({ warehouseStats, isPitcher }) {
  if (!warehouseStats) return null
  return (
    <div className="flex gap-2.5 mt-0.5 text-[11px] font-mono text-content-muted">
      {!isPitcher ? (
        <>
          {warehouseStats.avg   != null && <span>AVG {Number(warehouseStats.avg).toFixed(3)}</span>}
          {warehouseStats.ops   != null && <span>OPS {Number(warehouseStats.ops).toFixed(3)}</span>}
          {warehouseStats.woba  != null && <span>wOBA {Number(warehouseStats.woba).toFixed(3)}</span>}
        </>
      ) : (
        <>
          {warehouseStats.era    != null && <span>ERA {Number(warehouseStats.era).toFixed(2)}</span>}
          {warehouseStats.fip    != null && <span>FIP {Number(warehouseStats.fip).toFixed(2)}</span>}
          {warehouseStats.k_per_9 != null && <span>K/9 {Number(warehouseStats.k_per_9).toFixed(1)}</span>}
        </>
      )}
    </div>
  )
}

function AuctionRow({ a, mlbId, warehouseStats }) {
  const [expanded, setExpanded] = useState(true)
  const isPitcher = warehouseStats?.group === 'pitcher' || isPitcherOttoneu(a)

  return (
    <div className={`border-b border-bg-border/50 last:border-0 ${expanded ? 'bg-bg-elevated/20' : ''}`}>
      <div
        className="group py-3 flex items-center gap-3 cursor-pointer hover:bg-bg-elevated/30 transition-colors rounded px-1"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="shrink-0" onClick={e => e.stopPropagation()}>
          <PlayerLink playerId={mlbId} name={a.name} imageClassName="w-9 h-9" textClassName="hidden" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-content-primary">{a.name}</span>
            <span className="text-[11px] text-content-muted">{[a.mlb_team, a.position].filter(Boolean).join(' · ')}</span>
          </div>
          <TxStatChips warehouseStats={warehouseStats} isPitcher={isPitcher} />
        </div>
        <PlayerListButtons
          player={{ player_id: mlbId, fg_id: warehouseStats?.fg_id, name: a.name, mlb_team: a.mlb_team, salary: a.bid, approx_fg_pts: warehouseStats?.approx_fg_pts }}
          isMyTeam={false}
          size="md"
          className="shrink-0"
        />
        <OttoneuRowMetrics pts={warehouseStats?.approx_fg_pts} cost={a.bid ?? 0} endTime={a.end_time} expanded={expanded} />
      </div>
      {expanded && (
        <div className="px-3 pb-4 border-t border-bg-border/40 pt-3 space-y-3">
          <TrendChartsSection mlbId={mlbId} isPitcher={isPitcher} />
          <TxAnalysisSection name={a.name} fgId={warehouseStats?.fg_id} />
        </div>
      )}
    </div>
  )
}

function WaiverRow({ w, mlbId, warehouseStats }) {
  const [expanded, setExpanded] = useState(true)
  const isPitcher = warehouseStats?.group === 'pitcher' || isPitcherOttoneu(w)

  return (
    <div className={`border-b border-bg-border/50 last:border-0 ${expanded ? 'bg-bg-elevated/20' : ''}`}>
      <div
        className="group py-3 flex items-center gap-3 cursor-pointer hover:bg-bg-elevated/30 transition-colors rounded px-1"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="shrink-0" onClick={e => e.stopPropagation()}>
          <PlayerLink playerId={mlbId} name={w.name} imageClassName="w-9 h-9" textClassName="hidden" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-content-primary">{w.name}</span>
          </div>
          <div className="text-[11px] text-content-muted mt-0.5">
            Cut by {w.cut_by}{w.deadline ? ` · Claim by ${w.deadline}` : ''}
          </div>
          <TxStatChips warehouseStats={warehouseStats} isPitcher={isPitcher} />
        </div>
        <PlayerListButtons
          player={{ player_id: mlbId, fg_id: warehouseStats?.fg_id, name: w.name, mlb_team: null, salary: w.salary, approx_fg_pts: warehouseStats?.approx_fg_pts }}
          isMyTeam={false}
          size="md"
          className="shrink-0"
        />
        <OttoneuRowMetrics pts={warehouseStats?.approx_fg_pts} cost={w.salary} expanded={expanded} />
      </div>
      {expanded && (
        <div className="px-3 pb-4 border-t border-bg-border/40 pt-3 space-y-3">
          <TrendChartsSection mlbId={mlbId} isPitcher={isPitcher} />
          <TxAnalysisSection name={w.name} fgId={warehouseStats?.fg_id} />
        </div>
      )}
    </div>
  )
}

function FreeAgentTableRow({ p, mlbId, expanded, onToggle }) {
  const isPitcher    = p.fip != null || /\bSP\b|\bRP\b/i.test(p.position || '')
  const vsProj       = p.vs_projection
  const vsColor      = vsProj != null
    ? (vsProj > 5  ? 'text-green-400 font-semibold'
      : vsProj < -5 ? 'text-red-400'
      : 'text-content-muted')
    : 'text-content-muted'
  const keystat      = isPitcher
    ? (p.fip  != null ? Number(p.fip).toFixed(2)  : null)
    : (p.woba != null ? Number(p.woba).toFixed(3) : null)
  const keystatlabel = isPitcher ? 'FIP' : 'wOBA'

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors ${expanded ? 'bg-bg-elevated/30' : 'hover:bg-bg-elevated/20'}`}
        onClick={onToggle}
      >
        <td className="py-2 px-2 border-b border-bg-border/30">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="shrink-0" onClick={e => e.stopPropagation()}>
              <PlayerLink playerId={mlbId} name={p.name} imageClassName="w-6 h-6" textClassName="hidden" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-content-primary leading-tight truncate">{p.name}</div>
              <div className="text-[9px] text-content-muted truncate">{[p.team, p.position].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
        </td>
        <td className="py-2 px-2 text-right font-mono font-bold text-brand border-b border-bg-border/30">
          {p.approx_fg_pts != null ? Number(p.approx_fg_pts).toFixed(1) : '—'}
        </td>
        <td className="py-2 px-2 text-right font-mono text-content-secondary border-b border-bg-border/30">
          {p.fair_value_salary != null ? `$${Number(p.fair_value_salary).toFixed(0)}` : '—'}
        </td>
        <td className="py-2 px-2 text-right font-mono text-content-muted border-b border-bg-border/30">
          {p.projected_pts != null ? Number(p.projected_pts).toFixed(0) : '—'}
        </td>
        <td className={`py-2 px-2 text-right font-mono border-b border-bg-border/30 ${vsColor}`}>
          {vsProj != null ? `${vsProj > 0 ? '+' : ''}${Number(vsProj).toFixed(0)}` : '—'}
        </td>
        <td className="py-2 px-2 text-right border-b border-bg-border/30">
          {keystat
            ? <span className="font-mono text-content-secondary">{keystat}<span className="text-[9px] text-content-muted ml-0.5">{keystatlabel}</span></span>
            : <span className="text-content-muted">—</span>}
        </td>
        <td className="py-2 px-1.5 text-center text-[9px] text-content-muted w-4 border-b border-bg-border/30">{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-bg-elevated/20 border-b border-bg-border/50 px-4 py-4">
            <div className="space-y-3">
              <TrendChartsSection mlbId={mlbId} isPitcher={isPitcher} />
              <TxAnalysisSection name={p.name} fgId={p.fg_id} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const POSITIONS_BATTER  = ['C', '1B', '2B', '3B', 'SS', 'OF', 'Util', 'MI', 'CI']
const POSITIONS_PITCHER = ['SP', 'RP']

const STAT_OPS = [
  { value: '>',  label: '>'  },
  { value: '>=', label: '≥'  },
  { value: '<',  label: '<'  },
  { value: '<=', label: '≤'  },
  { value: '=',  label: '='  },
  { value: '!=', label: '≠'  },
]

const BATTER_FILTER_COLS = [
  { key: 'approx_fg_pts', label: 'FG Pts'  },
  { key: 'ppd',           label: 'PPD'     },
  { key: 'surplus',       label: 'Surplus' },
  { key: 'salary',        label: 'Salary'  },
  { key: 'woba',          label: 'wOBA'    },
  { key: 'obp',           label: 'OBP'     },
  { key: 'avg',           label: 'AVG'     },
  { key: 'wrc_plus',      label: 'wRC+'    },
  { key: 'ab',            label: 'AB'      },
  { key: 'h',             label: 'H'       },
  { key: 'hr',            label: 'HR'      },
  { key: 'bb',            label: 'BB'      },
  { key: 'sb',            label: 'SB'      },
]

const PITCHER_FILTER_COLS = [
  { key: 'approx_fg_pts', label: 'FG Pts'  },
  { key: 'ppd',           label: 'PPD'     },
  { key: 'surplus',       label: 'Surplus' },
  { key: 'salary',        label: 'Salary'  },
  { key: 'era',           label: 'ERA'     },
  { key: 'fip',           label: 'FIP'     },
  { key: 'whip',          label: 'WHIP'    },
  { key: 'k_per_9',       label: 'K/9'     },
  { key: 'k_pct',         label: 'K%'      },
  { key: 'ip',            label: 'IP'      },
  { key: 'k',             label: 'K'       },
  { key: 'h',             label: 'H'       },
  { key: 'bb',            label: 'BB'      },
  { key: 'hr',            label: 'HR'      },
  { key: 'sv',            label: 'SV'      },
]

const ALL_FILTER_COLS = [
  ...BATTER_FILTER_COLS,
  ...PITCHER_FILTER_COLS.filter(c => !BATTER_FILTER_COLS.find(b => b.key === c.key)),
]

const FA_BATTER_FILTER_COLS = [
  { key: 'approx_fg_pts',     label: 'Pts'     },
  { key: 'projected_pts',     label: 'Proj Pts'},
  { key: 'vs_projection',     label: 'vs Proj' },
  { key: 'fair_value_salary', label: 'Fair $'  },
  { key: 'woba',              label: 'wOBA'    },
  { key: 'obp',               label: 'OBP'     },
  { key: 'avg',               label: 'AVG'     },
  { key: 'wrc_plus',          label: 'wRC+'    },
  { key: 'ab',                label: 'AB'      },
  { key: 'hr',                label: 'HR'      },
  { key: 'bb',                label: 'BB'      },
  { key: 'sb',                label: 'SB'      },
]

const FA_PITCHER_FILTER_COLS = [
  { key: 'approx_fg_pts',     label: 'Pts'     },
  { key: 'projected_pts',     label: 'Proj Pts'},
  { key: 'vs_projection',     label: 'vs Proj' },
  { key: 'fair_value_salary', label: 'Fair $'  },
  { key: 'era',               label: 'ERA'     },
  { key: 'fip',               label: 'FIP'     },
  { key: 'whip',              label: 'WHIP'    },
  { key: 'k_per_9',           label: 'K/9'     },
  { key: 'ip',                label: 'IP'      },
  { key: 'k',                 label: 'K'       },
  { key: 'sv',                label: 'SV'      },
]

const FA_ALL_FILTER_COLS = [
  ...FA_BATTER_FILTER_COLS,
  ...FA_PITCHER_FILTER_COLS.filter(c => !FA_BATTER_FILTER_COLS.find(b => b.key === c.key)),
]

function applyLeagueStatFilters(rows, filters) {
  if (!filters.length) return rows
  return rows.filter(row => filters.every(f => {
    const raw = row[f.key]
    if (raw == null) return false
    const num = Number(raw)
    const val = Number(f.value)
    if (!Number.isFinite(num) || !Number.isFinite(val)) return false
    switch (f.op) {
      case '>':  return num >  val
      case '>=': return num >= val
      case '<':  return num <  val
      case '<=': return num <= val
      case '=':  return Math.abs(num - val) < 0.00005
      case '!=': return Math.abs(num - val) >= 0.00005
      default:   return false
    }
  }))
}

function OttoneuLeagueStatsTable() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['ottoneu-league-stats'],
    queryFn: () => api.ottoneu.leagueStats(),
    staleTime: 30 * 60_000,
  })

  const [sort,        setSort]        = useState({ key: 'approx_fg_pts', dir: 'desc' })
  const [group,       setGroup]       = useState('all')
  const [posFilter,   setPosFilter]   = useState('all')
  const [teamFilter,  setTeamFilter]  = useState('all')
  const [minSalary,   setMinSalary]   = useState(0)
  const [minQual,     setMinQual]     = useState(0)
  const [search,      setSearch]      = useState('')
  const [statFilters, setStatFilters] = useState([])
  const [filterOpen,  setFilterOpen]  = useState(false)
  const scroll = useDragScroll()

  const LS_ALL_KEYS = useMemo(() => [...new Set([
    ...BATTER_STAT_COLS.map(c => c.key),
    ...PITCHER_STAT_COLS.map(c => c.key),
    ...LS_FANTASY_COLS.map(c => c.key),
  ])], [])
  const { hidden, visibleFrom, dragProps, toggle } = useColumnOrder(LS_ALL_KEYS)

  const onSort = (col) => setSort(s => ({ key: col, dir: s.key === col && s.dir === 'desc' ? 'asc' : 'desc' }))

  const isPitcherView   = group === 'pitcher' || posFilter === 'SP' || posFilter === 'RP'
  const showBatterCols  = !isPitcherView
  const showPitcherCols = isPitcherView
  const isPitcherContext = isPitcherView

  const addFilter    = () => setStatFilters(f => [...f, { key: isPitcherContext ? 'era' : 'approx_fg_pts', op: '>', value: '' }])
  const updateFilter = (i, field, val) => setStatFilters(f => f.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  const removeFilter = (i) => setStatFilters(f => f.filter((_, idx) => idx !== i))

  const allTeams = useMemo(() => [...new Set(rows.map(r => r.roster_team).filter(Boolean))].sort(), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = rows.filter(r => {
      if (group !== 'all' && r.group !== group) return false
      if (posFilter !== 'all' && r.roster_team != null && !r.positions?.includes(posFilter)) return false
      if (teamFilter === '__fa__' && r.roster_team != null) return false
      if (teamFilter !== 'all' && teamFilter !== '__fa__' && r.roster_team !== teamFilter) return false
      if (r.salary != null && r.salary < minSalary) return false
      if (minQual > 0) {
        if (r.group === 'batter'  && (r.ab ?? 0) < minQual) return false
        if (r.group === 'pitcher' && (r.ip ?? 0) < minQual) return false
      }
      if (q && !r.name?.toLowerCase().includes(q)) return false
      return true
    })
    return applyLeagueStatFilters(base, statFilters)
  }, [rows, group, posFilter, teamFilter, minSalary, minQual, search, statFilters])

  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort])

  const statColKeys    = showPitcherCols ? PITCHER_STAT_COLS.map(c => c.key) : BATTER_STAT_COLS.map(c => c.key)
  const fantasyColKeys = LS_FANTASY_COLS.map(c => c.key)
  const visStatCols    = useMemo(() => visibleFrom(statColKeys).map(k => ALL_COL_MAP[k]).filter(Boolean),    [visibleFrom, statColKeys])
  const visFantasyCols = useMemo(() => visibleFrom(fantasyColKeys).map(k => ALL_COL_MAP[k]).filter(Boolean), [visibleFrom, fantasyColKeys])

  const colPickerGroups = [
    { label: 'Batter',  cols: BATTER_STAT_COLS },
    { label: 'Pitcher', cols: PITCHER_STAT_COLS },
    { label: 'Fantasy', cols: LS_FANTASY_COLS },
  ]

  if (isLoading) return <div className="text-sm text-content-muted p-4">Loading league stats…</div>
  if (!rows.length) return <div className="text-sm text-content-muted p-4 italic">No stats available — warehouse may need a refresh.</div>

  const td = 'py-1 px-2 border-b border-bg-border/20'

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mr-1">League Stats</h3>

        <div className="flex rounded overflow-hidden border border-bg-border text-[11px]">
          {[['all', 'All'], ['batter', 'Batters'], ['pitcher', 'Pitchers']].map(([v, l]) => (
            <button key={v} onClick={() => { setGroup(v); setPosFilter('all') }}
              className={`px-2.5 py-1 ${group === v ? 'bg-brand text-white' : 'bg-bg-elevated text-content-muted hover:text-content-primary'}`}
            >{l}</button>
          ))}
        </div>

        <select value={posFilter} onChange={e => setPosFilter(e.target.value)}
          className="text-[11px] bg-bg-elevated border border-bg-border rounded px-2 py-1 text-content-secondary">
          <option value="all">All positions</option>
          {(group === 'pitcher' ? POSITIONS_PITCHER : group === 'batter' ? POSITIONS_BATTER : [...POSITIONS_BATTER, ...POSITIONS_PITCHER]).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
          className="text-[11px] bg-bg-elevated border border-bg-border rounded px-2 py-1 text-content-secondary">
          <option value="all">All teams</option>
          <option value="__fa__">Free Agents</option>
          {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <div className="flex items-center gap-1 text-[11px] text-content-muted">
          <span>Min $</span>
          <input type="number" min={0} max={60} value={minSalary} onChange={e => setMinSalary(Number(e.target.value))}
            className="w-12 bg-bg-elevated border border-bg-border rounded px-1.5 py-1 text-content-secondary text-center" />
        </div>

        <div className="flex items-center gap-1 text-[11px] text-content-muted">
          <span>{showPitcherCols ? 'Min IP' : 'Min AB'}</span>
          <input type="number" min={0} value={minQual} onChange={e => setMinQual(Number(e.target.value))}
            className="w-14 bg-bg-elevated border border-bg-border rounded px-1.5 py-1 text-content-secondary text-center" />
        </div>

        <button onClick={() => setFilterOpen(o => !o)}
          className={`text-[11px] font-medium px-2.5 py-1 rounded border transition-colors ${filterOpen || statFilters.length > 0 ? 'border-brand bg-brand/10 text-brand' : 'border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary'}`}>
          {statFilters.length > 0 ? `Filter (${statFilters.length})` : '+ Filter'}
        </button>

        <ColumnPicker groups={colPickerGroups} hidden={hidden} onToggle={toggle} />

        <input type="text" placeholder="Search player…" value={search} onChange={e => setSearch(e.target.value)}
          className="ml-auto text-[11px] bg-bg-elevated border border-bg-border rounded px-2.5 py-1 text-content-secondary placeholder:text-content-muted/50 w-36" />
      </div>

      {filterOpen && (
        <div className="bg-bg-elevated border border-bg-border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">Stat filters</span>
            <button onClick={addFilter} className="text-[11px] text-brand-light hover:underline font-medium">+ Add rule</button>
            {statFilters.length > 0 && <button onClick={() => setStatFilters([])} className="text-[11px] text-content-muted hover:text-red-400 ml-auto">Clear all</button>}
          </div>
          {statFilters.length === 0 && <p className="text-[10px] text-content-muted italic">No filters yet. Click "+ Add rule" to filter by any stat.</p>}
          <div className="space-y-1.5">
            {statFilters.map((f, i) => {
              const cols = showPitcherCols ? PITCHER_FILTER_COLS : showBatterCols ? BATTER_FILTER_COLS : ALL_FILTER_COLS
              return (
                <div key={i} className="flex items-center gap-2">
                  <select value={f.key} onChange={e => updateFilter(i, 'key', e.target.value)}
                    className="text-[11px] bg-bg-surface border border-bg-border rounded px-2 py-1 text-content-secondary outline-none focus:border-brand w-[90px]">
                    {cols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <select value={f.op} onChange={e => updateFilter(i, 'op', e.target.value)}
                    className="text-[11px] bg-bg-surface border border-bg-border rounded px-2 py-1 text-content-secondary outline-none focus:border-brand w-[52px]">
                    {STAT_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input type="text" value={f.value} onChange={e => updateFilter(i, 'value', e.target.value)} placeholder="value"
                    className="text-[11px] bg-bg-surface border border-bg-border rounded px-2 py-1 text-content-secondary outline-none focus:border-brand w-[80px]" />
                  <button onClick={() => removeFilter(i)} className="text-[11px] text-content-muted hover:text-red-400 px-1">✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="text-[10px] text-content-muted">{sorted.length} players</div>

      <div ref={scroll.ref} onMouseDown={scroll.onMouseDown} onMouseMove={scroll.onMouseMove} onMouseUp={scroll.onMouseUp} onMouseLeave={scroll.onMouseLeave} onClickCapture={scroll.onClickCapture} className="overflow-auto max-h-[620px] rounded-lg border border-bg-border/50 cursor-grab active:cursor-grabbing">
        <table className="w-full text-[11px] border-separate border-spacing-0">
          <thead>
            <tr className="text-content-muted text-[10px] uppercase tracking-wide">
              <SortTh stickyHeader label="Player" col="name"        sort={sort} onSort={onSort} align="left" />
              <SortTh stickyHeader label="Team"   col="roster_team" sort={sort} onSort={onSort} align="left" />
              <SortTh stickyHeader label="Pos"    col="positions"   sort={sort} onSort={onSort} />
              <SortTh stickyHeader label="Salary" col="salary"      sort={sort} onSort={onSort} />
              {visStatCols.map(c => (
                <SortTh key={c.key} stickyHeader label={c.label} col={c.col} sort={sort} onSort={onSort} statKey={c.statKey} dragHandlers={dragProps(c.key)} />
              ))}
              {visFantasyCols.map(c => (
                <SortTh key={c.key} stickyHeader label={c.label} col={c.col} sort={sort} onSort={onSort} statKey={c.statKey} dragHandlers={dragProps(c.key)} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const isMyTeam = r.roster_team?.includes('Dingers')
              const rowBg = isMyTeam ? 'bg-brand/5' : i % 2 !== 0 ? 'bg-bg-elevated/20' : ''
              return (
                <tr key={`${r.fg_id || r.name}_${r.group}`} className={`group hover:bg-bg-elevated/50 transition-colors ${rowBg}`}>
                  <td className={`${td} pl-2 pr-3 whitespace-nowrap`}>
                    <div className="flex items-center gap-1.5">
                      <PlayerLink playerId={r.player_id ?? null} name={r.name} imageClassName="w-6 h-6 shrink-0"
                        textClassName={`text-[11px] font-medium ${isMyTeam ? 'text-brand' : ''}`} />
                      <span className="text-[9px] text-content-muted shrink-0">{r.mlb_team}</span>
                      <PlayerListButtons
                        player={{ player_id: r.player_id, fg_id: r.fg_id, name: r.name, mlb_team: r.mlb_team, roster_team: r.roster_team, salary: r.salary, approx_fg_pts: r.approx_fg_pts }}
                        isMyTeam={isMyTeam}
                        className="opacity-70 group-hover:opacity-100 transition-opacity ml-auto"
                      />
                    </div>
                  </td>
                  <td className={`${td} pr-3 max-w-[120px] truncate`}>
                    {r.roster_team == null
                      ? <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">FA</span>
                      : <span className="text-content-secondary">{r.roster_team}</span>}
                    {isMyTeam && <span className="ml-1 text-[9px] text-brand/70 font-semibold uppercase">You</span>}
                  </td>
                  <td className={`${td} text-right font-mono text-content-muted`}>{r.positions?.split(',')[0] ?? '—'}</td>
                  <td className={`${td} text-right font-mono font-semibold text-content-secondary`}>{r.salary != null ? `$${r.salary}` : '—'}</td>
                  {visStatCols.map(c => (
                    <td key={c.key} className={typeof c.tdClass === 'function' ? c.tdClass(r) : c.tdClass}>{c.render(r)}</td>
                  ))}
                  {visFantasyCols.map(c => (
                    <td key={c.key} className={typeof c.tdClass === 'function' ? c.tdClass(r) : c.tdClass}>{c.render(r)}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OttoneuLeagueView({ onSelectTeam }) {
  const { data: standingsData, isLoading: standingsLoading } = useQuery({
    queryKey: ['ottoneu-standings'],
    queryFn: () => api.ottoneu.standings(),
    staleTime: 30 * 60_000,
  })

  const { data: capData, isLoading: capLoading } = useQuery({
    queryKey: ['ottoneu-cap'],
    queryFn: () => api.ottoneu.capOverview(),
    staleTime: 30 * 60_000,
  })

  const [leagueTab,  setLeagueTab]  = useState('standings')
  const [standSort,  setStandSort]  = useState({ key: 'points', dir: 'desc' })
  const [capSort,    setCapSort]    = useState({ key: 'cap_space', dir: 'desc' })
  const [teamSearch, setTeamSearch] = useState('')
  const [showDrop,   setShowDrop]   = useState(false)

  const onStandSort = (col) => setStandSort(s => ({ key: col, dir: s.key === col && s.dir === 'desc' ? 'asc' : 'desc' }))
  const onCapSort   = (col) => setCapSort(s =>   ({ key: col, dir: s.key === col && s.dir === 'desc' ? 'asc' : 'desc' }))

  const divisions = standingsData?.divisions ?? []
  const capRows   = Array.isArray(capData) ? capData : []

  const allTeams = useMemo(
    () => capRows.filter(t => !t.team_name?.includes('Dingers')),
    [capRows]
  )

  const filteredTeams = useMemo(() => {
    const q = teamSearch.toLowerCase()
    return q ? allTeams.filter(t => t.team_name?.toLowerCase().includes(q)) : allTeams
  }, [allTeams, teamSearch])

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex border-b border-bg-border">
        {[['standings', 'Standings'], ['cap', 'Cap Overview'], ['teams', 'Teams']].map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setLeagueTab(tab)}
            className={leagueTab === tab ? 'tab-active' : 'tab-inactive'}
          >
            {label}
          </button>
        ))}
      </div>

      {standingsLoading && leagueTab === 'standings' && <div className="text-sm text-content-muted">Loading standings…</div>}
      {standingsData?.error && <div className="card p-4 text-sm text-red-400">{standingsData.error}</div>}

      {leagueTab === 'standings' && divisions.map(div => (
        <div key={div.name} className="card p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-3">{div.name}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-content-muted border-b border-bg-border">
                  <SortTh label="Team"      col="name"            sort={standSort} onSort={onStandSort} align="left" />
                  <SortTh label="Record"    col="record"          sort={standSort} onSort={onStandSort} />
                  <SortTh label="Points"    col="points"          sort={standSort} onSort={onStandSort} />
                  <SortTh label="Avg Pts"   col="avg_pts"         sort={standSort} onSort={onStandSort} />
                  <SortTh label="Avg Agnst" col="avg_pts_against" sort={standSort} onSort={onStandSort} />
                </tr>
              </thead>
              <tbody>
                {sortRows(div.teams ?? [], standSort).map(team => {
                  const isMyTeam = team.name?.includes('Dingers')
                  return (
                    <tr key={team.name} className={`border-b border-bg-border/30 last:border-0 ${isMyTeam ? 'bg-brand/5' : ''}`}>
                      <td className={`py-2 font-medium ${isMyTeam ? 'text-brand' : 'text-content-primary'}`}>
                        {isMyTeam ? (
                          <span>{team.name} <span className="ml-1.5 text-[9px] text-brand/70 font-semibold uppercase">You</span></span>
                        ) : (
                          <button onClick={() => onSelectTeam(team.name)} className="hover:text-brand transition-colors text-left">
                            {team.name}
                          </button>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-content-secondary text-[12px]">{team.record}</td>
                      <td className="py-2 text-right font-mono text-content-primary font-semibold text-[12px]">{team.points?.toFixed(1)}</td>
                      <td className="py-2 text-right font-mono text-content-muted text-[12px]">{team.avg_pts?.toFixed(1)}</td>
                      <td className="py-2 text-right font-mono text-content-muted text-[12px]">{team.avg_pts_against?.toFixed(1)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {leagueTab === 'cap' && !capLoading && capRows.length > 0 && (
        <div className="card p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-3">Cap Overview</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-content-muted border-b border-bg-border">
                  <SortTh label="Team"      col="team_name"    sort={capSort} onSort={onCapSort} align="left" />
                  <SortTh label="Players"   col="player_count" sort={capSort} onSort={onCapSort} />
                  <SortTh label="Base $"    col="base_salary"  sort={capSort} onSort={onCapSort} />
                  <SortTh label="Penalties" col="penalties"    sort={capSort} onSort={onCapSort} />
                  <SortTh label="Available" col="cap_space"    sort={capSort} onSort={onCapSort} />
                </tr>
              </thead>
              <tbody>
                {sortRows(capRows, capSort).map(team => {
                  const isMyTeam = team.team_name?.includes('Dingers')
                  return (
                    <tr key={team.team_name} className={`border-b border-bg-border/30 last:border-0 ${isMyTeam ? 'bg-brand/5' : ''}`}>
                      <td className={`py-2 font-medium ${isMyTeam ? 'text-brand' : 'text-content-primary'}`}>
                        {isMyTeam ? (
                          <span>{team.team_name} <span className="ml-1.5 text-[9px] text-brand/70 font-semibold uppercase">You</span></span>
                        ) : (
                          <button onClick={() => onSelectTeam(team.team_name)} className="hover:text-brand transition-colors text-left">
                            {team.team_name}
                          </button>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-content-muted text-[12px]">{team.player_count}</td>
                      <td className="py-2 text-right font-mono text-content-secondary text-[12px]">${team.base_salary}</td>
                      <td className={`py-2 text-right font-mono text-[12px] ${team.penalties > 0 ? 'text-red-400' : 'text-content-muted'}`}>
                        {team.penalties > 0 ? `$${team.penalties}` : '—'}
                      </td>
                      <td className={`py-2 text-right font-mono font-semibold text-[12px] ${team.cap_space >= 50 ? 'text-green-400' : team.cap_space >= 10 ? 'text-content-primary' : 'text-red-400/80'}`}>
                        ${team.cap_space}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {leagueTab === 'teams' && (
        <div className="space-y-3">
          <div className="relative">
            <input
              value={teamSearch}
              onChange={e => { setTeamSearch(e.target.value); setShowDrop(true) }}
              onFocus={() => setShowDrop(true)}
              onBlur={() => setTimeout(() => setShowDrop(false), 150)}
              placeholder="Search teams…"
              className="w-full px-3 py-2 text-sm bg-bg-elevated border border-bg-border rounded-lg text-content-primary placeholder-content-muted focus:outline-none focus:border-brand/50"
            />
            {showDrop && filteredTeams.length > 0 && teamSearch && (
              <div className="absolute z-20 top-full mt-1 w-full bg-bg-elevated border border-bg-border rounded-lg shadow-xl overflow-hidden">
                {filteredTeams.map(t => (
                  <button
                    key={t.team_name}
                    onMouseDown={() => { onSelectTeam(t.team_name); setShowDrop(false); setTeamSearch('') }}
                    className="w-full text-left px-3 py-2 text-sm text-content-primary hover:bg-bg-border/40 transition-colors"
                  >
                    {t.team_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {(teamSearch ? filteredTeams : allTeams).map(t => {
            const capSpace = t.cap_space ?? 0
            return (
              <button
                key={t.team_name}
                onClick={() => onSelectTeam(t.team_name)}
                className="card w-full p-4 text-left hover:border-brand/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-content-primary">{t.team_name}</span>
                  <span className={`text-sm font-mono font-semibold ${capSpace >= 50 ? 'text-green-400' : capSpace >= 10 ? 'text-content-primary' : 'text-red-400/80'}`}>
                    ${capSpace} avail
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-content-muted">
                  {t.player_count} players · ${t.base_salary} salary{t.penalties > 0 ? ` · $${t.penalties} penalties` : ''}
                </div>
              </button>
            )
          })}
        </div>
      )}

    </div>
  )
}

function OttoneuTransactionsView() {
  const [search, setSearch] = useState('')

  const { data: auctionsData, isLoading: auctionsLoading } = useQuery({
    queryKey: ['ottoneu-auctions'],
    queryFn: () => api.ottoneu.auctions(),
    staleTime: 5 * 60_000,
  })

  const { data: waiversData, isLoading: waiversLoading } = useQuery({
    queryKey: ['ottoneu-waivers'],
    queryFn: () => api.ottoneu.waivers(),
    staleTime: 5 * 60_000,
  })

  // Batch warehouse stat lookup for all auction + waiver players
  const allTxNames = useMemo(() => {
    const aNames = (auctionsData?.active ?? []).map(a => a.name).filter(Boolean)
    const wNames = (waiversData?.active  ?? []).map(w => w.name).filter(Boolean)
    return [...new Set([...aNames, ...wNames])]
  }, [auctionsData, waiversData])

  const { data: txStats = [] } = useQuery({
    queryKey: ['ottoneu-tx-stats', allTxNames.slice().sort().join(',')],
    queryFn: () => api.ottoneu.playerStats({ names: allTxNames }),
    enabled: allTxNames.length > 0,
    staleTime: 5 * 60_000,
  })

  const txStatsMap = useMemo(
    () => Object.fromEntries(txStats.map(s => [s.name, s])),
    [txStats]
  )

  const { data: txPlayerIdMap = {} } = useQuery({
    queryKey: ['ottoneu-tx-player-ids', allTxNames.slice().sort().join(',')],
    queryFn: async () => {
      const entries = await Promise.all(
        allTxNames.map(async (name) => {
          const results = await api.players.search(name)
          const match = results?.find(r => normalize(r.name) === normalize(name))
          return [name, match?.id ?? null]
        })
      )
      return Object.fromEntries(entries)
    },
    enabled: allTxNames.length > 0,
    staleTime: 60 * 60_000,
  })

  const q = search.toLowerCase()
  const activeAuctions = (auctionsData?.active ?? []).filter(a => !q || a.name?.toLowerCase().includes(q) || a.mlb_team?.toLowerCase().includes(q))
  const activeWaivers  = (waiversData?.active  ?? []).filter(w => !q || w.name?.toLowerCase().includes(q))

  return (
    <div className="space-y-4">
      <FactoidsPanel
        queryKey={['ottoneu-free-agents-v2']}
        queryFn={() => api.ottoneu.freeAgents()}
        scrollable={false}
        title="Pickup Ideas"
        description="AI pickup recommendations — salary costs, cap context, and value analysis."
      />

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search auctions & waivers…"
        className="w-full px-3 py-2 text-sm bg-bg-elevated border border-bg-border rounded-lg text-content-primary placeholder:text-content-muted focus:outline-none focus:border-brand/50"
      />

      <div className="card p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-content-muted">Active Auctions</span>
          {activeAuctions.length > 0 && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-brand/10 text-brand uppercase tracking-wider">{activeAuctions.length}</span>
          )}
        </div>
        {auctionsLoading && <div className="text-sm text-content-muted">Loading…</div>}
        {!auctionsLoading && activeAuctions.length === 0 && <div className="text-sm text-content-muted">{search ? 'No matches.' : 'No active auctions.'}</div>}
        {activeAuctions.map((a, i) => (
          <AuctionRow
            key={i}
            a={a}
            mlbId={txPlayerIdMap[a.name] ?? null}
            warehouseStats={txStatsMap[a.name] ?? null}
          />
        ))}
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-content-muted">Waiver Wire</span>
          {activeWaivers.length > 0 && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-green-400/20 text-green-400 uppercase tracking-wider">{activeWaivers.length}</span>
          )}
          <span className="text-[9px] text-content-muted ml-1">claimable at listed salary</span>
        </div>
        {waiversLoading && <div className="text-sm text-content-muted">Loading…</div>}
        {!waiversLoading && activeWaivers.length === 0 && <div className="text-sm text-content-muted">{search ? 'No matches.' : 'No players on waivers.'}</div>}
        {activeWaivers.map((w, i) => (
          <WaiverRow
            key={i}
            w={w}
            mlbId={txPlayerIdMap[w.name] ?? null}
            warehouseStats={txStatsMap[w.name] ?? null}
          />
        ))}
      </div>

    </div>
  )
}

function OttoneuFreeAgentList() {
  const [group,        setGroup]      = useState('all')
  const [posFilter,    setPosFilter]  = useState('all')
  const [showMinors,   setShowMinors] = useState(false)
  const [minQual,      setMinQual]    = useState(0)
  const [search,       setSearch]     = useState('')
  const [sort,         setSort]       = useState({ key: 'approx_fg_pts', dir: 'desc' })
  const [expandedKey,  setExpanded]   = useState(null)
  const [refreshing,   setRefreshing] = useState(false)
  const scroll = useDragScroll()
  const [statFilters,  setStatFilters] = useState([])
  const [filterOpen,   setFilterOpen]  = useState(false)

  const { leaguePtsDist } = useContext(OttoneuLeagueContext)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['ottoneu-free-agents-v2', showMinors],
    queryFn:  () => api.ottoneu.freeAgents({ minors: showMinors }),
    staleTime: 30 * 60_000,
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await api.ottoneu.freeAgents({ refresh: true, minors: showMinors })
      await queryClient.invalidateQueries({ queryKey: ['ottoneu-free-agents-v2', showMinors] })
    } finally {
      setRefreshing(false)
    }
  }

  const allPlayers = data?.players ?? []

  const onSort = col => setSort(s => ({ key: col, dir: s.key === col && s.dir === 'desc' ? 'asc' : 'desc' }))

  const isPitcherContext = group === 'pitcher' || posFilter === 'SP' || posFilter === 'RP'
  const showBatterCols   = group !== 'pitcher' && posFilter !== 'SP' && posFilter !== 'RP'
  const showPitcherCols  = group !== 'batter'

  const addFilter    = () => setStatFilters(f => [...f, { key: isPitcherContext ? 'era' : 'approx_fg_pts', op: '>', value: '' }])
  const updateFilter = (i, field, val) => setStatFilters(f => f.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  const removeFilter = (i) => setStatFilters(f => f.filter((_, idx) => idx !== i))

  const FA_ALL_KEYS = useMemo(() => [...new Set([
    ...BATTER_STAT_COLS.map(c => c.key),
    ...PITCHER_STAT_COLS.map(c => c.key),
    ...FA_FANTASY_COLS.map(c => c.key),
  ])], [])
  const { hidden, visibleFrom, dragProps, toggle } = useColumnOrder(FA_ALL_KEYS)

  const statColKeys = useMemo(() => [
    ...(showBatterCols  ? BATTER_STAT_COLS.map(c => c.key)  : []),
    ...(showPitcherCols ? PITCHER_STAT_COLS.map(c => c.key) : []),
  ], [showBatterCols, showPitcherCols])
  const fantasyColKeys = FA_FANTASY_COLS.map(c => c.key)
  const visStatCols    = useMemo(() => visibleFrom(statColKeys).map(k => ALL_COL_MAP[k]).filter(Boolean),    [visibleFrom, statColKeys])
  const visFantasyCols = useMemo(() => visibleFrom(fantasyColKeys).map(k => ALL_COL_MAP[k]).filter(Boolean), [visibleFrom, fantasyColKeys])

  const colPickerGroups = [
    { label: 'Batter',  cols: BATTER_STAT_COLS },
    { label: 'Pitcher', cols: PITCHER_STAT_COLS },
    { label: 'Fantasy', cols: FA_FANTASY_COLS },
  ]

  const filtered = useMemo(() => {
    const isPitcherRow = p => p.group === 'pitcher' || p.fip != null || /\bSP\b|\bRP\b/i.test(p.position || '')
    const q = search.trim().toLowerCase()
    const base = allPlayers.filter(p => {
      if (group === 'batter'  && isPitcherRow(p))  return false
      if (group === 'pitcher' && !isPitcherRow(p)) return false
      if (posFilter !== 'all' && !p.position?.includes(posFilter)) return false
      if (minQual > 0) {
        if (!isPitcherRow(p) && (p.ab ?? 0) < minQual) return false
        if (isPitcherRow(p)  && (p.ip ?? 0) < minQual) return false
      }
      if (q && !p.name?.toLowerCase().includes(q) && !p.team?.toLowerCase().includes(q)) return false
      return true
    })
    return applyLeagueStatFilters(base, statFilters)
  }, [allPlayers, group, posFilter, minQual, search, statFilters])

  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort])

  if (isLoading) return <div className="text-sm text-content-muted p-4">Loading free agents…</div>
  if (!allPlayers.length) return <div className="text-sm text-content-muted p-4 italic">No candidates available — warehouse may need a refresh.</div>

  const td = 'py-1 px-2 border-b border-bg-border/20'

  return (
    <div className="space-y-4">
    <FactoidsPanel
      queryKey={['ottoneu-free-agents-v2', showMinors]}
      queryFn={() => api.ottoneu.freeAgents({ minors: showMinors })}
      scrollable={false}
      title="Free Agent Pickups"
      description="AI pickup recommendations based on salary efficiency, projection pace, and available cap space."
    />
    <div className="card p-4 space-y-3">

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mr-1">Free Agents</h3>

        <div className="flex rounded overflow-hidden border border-bg-border text-[11px]">
          {[['all', 'All'], ['batter', 'Batters'], ['pitcher', 'Pitchers']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => { setGroup(v); setPosFilter('all') }}
              className={`px-2.5 py-1 ${group === v ? 'bg-brand text-white' : 'bg-bg-elevated text-content-muted hover:text-content-primary'}`}
            >{l}</button>
          ))}
        </div>

        <select
          value={posFilter}
          onChange={e => setPosFilter(e.target.value)}
          className="text-[11px] bg-bg-elevated border border-bg-border rounded px-2 py-1 text-content-secondary"
        >
          <option value="all">All positions</option>
          {(group === 'pitcher' ? POSITIONS_PITCHER : group === 'batter' ? POSITIONS_BATTER : [...POSITIONS_BATTER, ...POSITIONS_PITCHER]).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <button
          onClick={() => setShowMinors(m => !m)}
          className={`text-[11px] font-medium px-2.5 py-1 rounded border transition-colors ${
            showMinors
              ? 'border-amber-400/50 bg-amber-400/10 text-amber-300'
              : 'border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary'
          }`}
        >
          {showMinors ? 'All Levels' : 'MLB Only'}
        </button>

        <div className="flex items-center gap-1 text-[11px] text-content-muted">
          <span>{showPitcherCols && !showBatterCols ? 'Min IP' : 'Min AB'}</span>
          <input
            type="number"
            min={0}
            value={minQual}
            onChange={e => setMinQual(Number(e.target.value))}
            className="w-14 bg-bg-elevated border border-bg-border rounded px-1.5 py-1 text-content-secondary text-center"
          />
        </div>

        <button onClick={() => setFilterOpen(o => !o)}
          className={`text-[11px] font-medium px-2.5 py-1 rounded border transition-colors ${filterOpen || statFilters.length > 0 ? 'border-brand bg-brand/10 text-brand' : 'border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary'}`}>
          {statFilters.length > 0 ? `Filter (${statFilters.length})` : '+ Filter'}
        </button>

        <ColumnPicker groups={colPickerGroups} hidden={hidden} onToggle={toggle} />

        <input
          type="text"
          placeholder="Search player…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ml-auto text-[11px] bg-bg-elevated border border-bg-border rounded px-2.5 py-1 text-content-secondary placeholder:text-content-muted/50 w-36"
        />

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-[11px] font-medium px-2.5 py-1 rounded border border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary transition-colors disabled:opacity-50"
          title="Refresh free agent data and regenerate AI analysis"
        >
          {refreshing ? '…' : '↻'}
        </button>
      </div>

      {filterOpen && (
        <div className="bg-bg-elevated border border-bg-border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">Stat filters</span>
            <button onClick={addFilter} className="text-[11px] text-brand-light hover:underline font-medium">+ Add rule</button>
            {statFilters.length > 0 && <button onClick={() => setStatFilters([])} className="text-[11px] text-content-muted hover:text-red-400 ml-auto">Clear all</button>}
          </div>
          {statFilters.length === 0 && <p className="text-[10px] text-content-muted italic">No filters yet. Click "+ Add rule" to filter by any stat.</p>}
          <div className="space-y-1.5">
            {statFilters.map((f, i) => {
              const cols = isPitcherContext ? FA_PITCHER_FILTER_COLS : showBatterCols && !showPitcherCols ? FA_BATTER_FILTER_COLS : FA_ALL_FILTER_COLS
              return (
                <div key={i} className="flex items-center gap-2">
                  <select value={f.key} onChange={e => updateFilter(i, 'key', e.target.value)}
                    className="text-[11px] bg-bg-surface border border-bg-border rounded px-2 py-1 text-content-secondary outline-none focus:border-brand w-[90px]">
                    {cols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <select value={f.op} onChange={e => updateFilter(i, 'op', e.target.value)}
                    className="text-[11px] bg-bg-surface border border-bg-border rounded px-2 py-1 text-content-secondary outline-none focus:border-brand w-[52px]">
                    {STAT_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input type="text" value={f.value} onChange={e => updateFilter(i, 'value', e.target.value)} placeholder="value"
                    className="text-[11px] bg-bg-surface border border-bg-border rounded px-2 py-1 text-content-secondary outline-none focus:border-brand w-[80px]" />
                  <button onClick={() => removeFilter(i)} className="text-[11px] text-content-muted hover:text-red-400 px-1">✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="text-[10px] text-content-muted">{sorted.length} players · {data?.generated_at ? `updated ${new Date(data.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</div>

      <div ref={scroll.ref} onMouseDown={scroll.onMouseDown} onMouseMove={scroll.onMouseMove} onMouseUp={scroll.onMouseUp} onMouseLeave={scroll.onMouseLeave} onClickCapture={scroll.onClickCapture} className="overflow-auto max-h-[620px] rounded-lg border border-bg-border/50 cursor-grab active:cursor-grabbing">
        <table className="w-full text-[11px] border-separate border-spacing-0">
          <thead>
            <tr className="text-content-muted text-[10px] uppercase tracking-wide">
              <SortTh stickyHeader label="Player" col="name"     sort={sort} onSort={onSort} align="left" />
              <SortTh stickyHeader label="Pos"    col="position" sort={sort} onSort={onSort} />
              {visStatCols.map(c => (
                <SortTh key={c.key} stickyHeader label={c.label} col={c.col} sort={sort} onSort={onSort} statKey={c.statKey} dragHandlers={dragProps(c.key)} />
              ))}
              {visFantasyCols.map(c => (
                <SortTh key={c.key} stickyHeader label={c.label} col={c.col} sort={sort} onSort={onSort} statKey={c.statKey} dragHandlers={dragProps(c.key)} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const pkey         = p.fg_id ?? p.name ?? i
              const isPitcher    = p.group === 'pitcher' || p.fip != null || /\bSP\b|\bRP\b/i.test(p.position || '')
              const rowBg        = i % 2 !== 0 ? 'bg-bg-elevated/20' : ''
              const isExpanded   = expandedKey === pkey
              const colSpanCount = 2 + visStatCols.length + visFantasyCols.length
              return (
                <Fragment key={pkey}>
                  <tr
                    className={`group hover:bg-bg-elevated/50 cursor-pointer transition-colors ${rowBg}`}
                    onClick={() => setExpanded(k => k === pkey ? null : pkey)}
                  >
                    <td className={`${td} pl-2 pr-3 whitespace-nowrap`}>
                      <div className="flex items-center gap-1.5">
                        <div onClick={e => e.stopPropagation()}>
                          <PlayerLink
                            playerId={p.player_id ?? null}
                            name={p.name}
                            imageClassName="w-6 h-6 shrink-0"
                            textClassName="text-[11px] font-medium"
                          />
                        </div>
                        <span className="text-[9px] text-content-muted shrink-0">{p.team}</span>
                        {p.level === 'MiLB' && (
                          <span className="text-[8px] font-semibold uppercase tracking-wide text-amber-400/70 bg-amber-400/10 px-1 py-0.5 rounded">MiLB</span>
                        )}
                        <PlayerListButtons
                          player={{ player_id: p.player_id, fg_id: p.fg_id, name: p.name, mlb_team: p.team, roster_team: null, salary: null, approx_fg_pts: p.approx_fg_pts }}
                          isMyTeam={false}
                          className="opacity-70 group-hover:opacity-100 transition-opacity ml-auto"
                        />
                      </div>
                    </td>
                    <td className={`${td} text-right font-mono text-content-muted`}>{p.position ?? '—'}</td>
                    {visStatCols.map(c => (
                      <td key={c.key} className={typeof c.tdClass === 'function' ? c.tdClass(p) : c.tdClass}>{c.render(p)}</td>
                    ))}
                    {visFantasyCols.map(c => (
                      <td key={c.key} className={typeof c.tdClass === 'function' ? c.tdClass(p) : c.tdClass}>{c.render(p)}</td>
                    ))}
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={colSpanCount} className="bg-bg-elevated/20 border-b border-bg-border/50 px-4 py-4">
                        <div className="space-y-3">
                          <TrendChartsSection mlbId={p.player_id ?? null} isPitcher={isPitcher} compact />
                          <TxAnalysisSection name={p.name} fgId={p.fg_id} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  )
}

function OttoneuTeamRoster({ team }) {
  const players = team.players ?? []
  const fgIds   = useMemo(() => players.map(p => p.fg_id).filter(Boolean), [players])
  const names   = useMemo(() => players.map(p => p.name).filter(Boolean),  [players])

  const { data: teamStats = [] } = useQuery({
    queryKey: ['ottoneu-team-stats', team.team_id],
    queryFn: () => api.ottoneu.playerStats({ fgIds }),
    enabled: fgIds.length > 0,
    staleTime: 30 * 60_000,
  })

  const statsMap = useMemo(
    () => Object.fromEntries(teamStats.map(s => [String(s.fg_id), s])),
    [teamStats]
  )

  const { data: playerIdMap = {} } = useQuery({
    queryKey: ['ottoneu-team-player-ids', team.team_id],
    enabled: names.length > 0,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const entries = await Promise.all(
        players.filter(p => p.name).map(async (p) => {
          const results = await api.players.search(p.name)
          const match = results?.find(r => normalize(r.name) === normalize(p.name))
          return [p.name, match?.id ?? null]
        })
      )
      return Object.fromEntries(entries)
    },
  })

  const batters  = players.filter(p => !isPitcherOttoneu(p) && !isMinorLeaguer(p))
  const pitchers = players.filter(p =>  isPitcherOttoneu(p) && !isMinorLeaguer(p))
  const minors   = players.filter(p => isMinorLeaguer(p))

  return (
    <div className="border-t border-bg-border/50 px-4 pb-2">
      {[['Batters', batters], ['Pitchers', pitchers], ['Minor Leaguers', minors]].map(([group, groupPlayers]) =>
        groupPlayers.length > 0 ? (
          <div key={group} className="mb-1">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-content-muted pt-3 pb-1">{group}</div>
            {groupPlayers.map((p, i) => (
              <OttoneuPlayerRow
                key={i}
                player={p}
                mlbId={playerIdMap[p.name] ?? null}
                warehouseStats={statsMap[String(p.fg_id)] ?? null}
              />
            ))}
          </div>
        ) : null
      )}
    </div>
  )
}

function OttoneuTeamsView() {
  const { data: allRosters, isLoading } = useQuery({
    queryKey: ['ottoneu-all-rosters'],
    queryFn: () => api.ottoneu.allRosters(),
    staleTime: 30 * 60_000,
  })
  const [expanded, setExpanded] = useState({})
  const [search, setSearch] = useState('')

  const q = search.toLowerCase()

  const teams = useMemo(() => {
    const all = Array.isArray(allRosters) ? allRosters.filter(t => !t.team_name?.includes('Dingers')) : []
    if (!q) return all
    return all
      .map(t => ({ ...t, players: (t.players ?? []).filter(p => p.name?.toLowerCase().includes(q) || p.mlb_team?.toLowerCase().includes(q) || p.positions?.toLowerCase().includes(q)) }))
      .filter(t => t.players.length > 0 || t.team_name?.toLowerCase().includes(q))
  }, [allRosters, q])

  const effectiveExpanded = useMemo(() => {
    if (!q) return expanded
    return Object.fromEntries(teams.map(t => [t.team_id, true]))
  }, [q, teams, expanded])

  if (isLoading) return <div className="text-sm text-content-muted">Loading rosters…</div>
  if (!Array.isArray(allRosters)) return <div className="text-sm text-content-muted">No roster data available.</div>

  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search players across all teams…"
        className="w-full px-3 py-2 text-sm bg-bg-elevated border border-bg-border rounded-lg text-content-primary placeholder:text-content-muted focus:outline-none focus:border-brand/50"
      />
      {!q && <p className="text-[11px] text-content-muted">Browse all teams to identify trade targets. Click a team to expand their roster.</p>}
      {q && teams.length === 0 && <div className="text-sm text-content-muted">No players found matching "{search}".</div>}
      {teams.map(team => {
        const open = effectiveExpanded[team.team_id]
        return (
          <div key={team.team_id} className="card overflow-hidden">
            <button
              onClick={() => !q && setExpanded(e => ({ ...e, [team.team_id]: !e[team.team_id] }))}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-bg-elevated/50 transition-colors"
            >
              <span className="text-sm font-semibold text-content-primary">{team.team_name}</span>
              <span className="flex items-center gap-2">
                <span className="text-[11px] text-content-muted">{team.players?.length ?? 0} players</span>
                {!q && <span className="text-[9px] text-content-muted">{open ? '▲' : '▼'}</span>}
              </span>
            </button>
            {open && <OttoneuTeamRoster team={team} />}
          </div>
        )
      })}
    </div>
  )
}

function OttoneuTeamPage({ team, onBack }) {
  const players = team.players ?? []
  const fgIds   = useMemo(() => players.map(p => p.fg_id).filter(Boolean), [players])

  const { data: teamStats = [] } = useQuery({
    queryKey: ['ottoneu-team-stats', team.team_id],
    queryFn: () => api.ottoneu.playerStats({ fgIds }),
    enabled: fgIds.length > 0,
    staleTime: 30 * 60_000,
  })

  const statsMap = useMemo(
    () => Object.fromEntries(teamStats.map(s => [String(s.fg_id), s])),
    [teamStats]
  )

  const { data: playerIdMap = {} } = useQuery({
    queryKey: ['ottoneu-team-player-ids', team.team_id],
    enabled: players.length > 0,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const entries = await Promise.all(
        players.filter(p => p.name).map(async (p) => {
          const results = await api.players.search(p.name)
          const match = results?.find(r => normalize(r.name) === normalize(p.name))
          return [p.name, match?.id ?? null]
        })
      )
      return Object.fromEntries(entries)
    },
  })

  const { data: capData } = useQuery({
    queryKey: ['ottoneu-cap'],
    queryFn: () => api.ottoneu.capOverview(),
    staleTime: 30 * 60_000,
  })

  const teamCap = useMemo(
    () => Array.isArray(capData) ? capData.find(t => t.team_name === team.team_name) : null,
    [capData, team.team_name]
  )

  const [sort, setSort]         = useState('ppd')
  const [search, setSearch]     = useState('')
  const [position, setPosition] = useState('All')

  const batters  = players.filter(p => !isPitcherOttoneu(p) && !isMinorLeaguer(p))
  const pitchers = players.filter(p =>  isPitcherOttoneu(p) && !isMinorLeaguer(p))
  const minors   = players.filter(p => isMinorLeaguer(p))

  function getPlayerPts(p) {
    return statsMap[String(p.fg_id)]?.approx_fg_pts ?? 0
  }

  function filterAndSortGroup(group) {
    const q = search.toLowerCase()
    return [...group]
      .filter(p => {
        if (position !== 'All' && !p.positions?.includes(position)) return false
        if (q && !p.name?.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        const ptsA = getPlayerPts(a), ptsB = getPlayerPts(b)
        const salA = a.salary || 0,   salB = b.salary || 0
        if (sort === 'ppd')     return (salB > 0 ? ptsB / salB : 0) - (salA > 0 ? ptsA / salA : 0)
        if (sort === 'surplus') return (Math.round(ptsB / FAIR_PPD) - salB) - (Math.round(ptsA / FAIR_PPD) - salA)
        if (sort === 'points')  return ptsB - ptsA
        if (sort === 'salary')  return salB - salA
        return 0
      })
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-content-muted hover:text-content-primary transition-colors">
        ← League
      </button>

      <div className="card p-4 flex flex-wrap items-center gap-4 text-sm">
        <span className="text-content-primary font-medium">{team.team_name}</span>
        <span className="text-content-muted">{players.length} rostered</span>
        {teamCap?.base_salary != null && (
          <span className="text-content-muted">Salary: <span className="font-semibold text-content-secondary">${teamCap.base_salary}</span> / $400</span>
        )}
        {teamCap?.penalties > 0 && <span className="text-red-400">Penalties: ${teamCap.penalties}</span>}
        {teamCap?.cap_space != null && (
          <span className={`font-semibold ${teamCap.cap_space >= 50 ? 'text-green-400' : teamCap.cap_space >= 10 ? 'text-content-primary' : 'text-amber-400'}`}>
            ${teamCap.cap_space} available
          </span>
        )}
        <span className="text-[11px] text-content-muted ml-auto">IL data not available for league teams</span>
      </div>

      <div className="card p-3 space-y-2.5">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted/50 text-sm pointer-events-none">⌕</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-bg-border bg-bg-elevated text-sm text-content-primary placeholder:text-content-muted/50 focus:outline-none focus:border-brand/50 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted/50 hover:text-content-muted transition-colors text-xs">✕</button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FA_POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => setPosition(pos)}
              className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                position === pos
                  ? 'bg-brand/20 text-brand border border-brand/30'
                  : 'bg-bg-elevated border border-bg-border text-content-secondary hover:text-content-primary'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-content-muted">Sort:</span>
          {[['ppd', 'PPD'], ['surplus', 'Surplus'], ['points', 'Points'], ['salary', 'Salary']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                sort === key
                  ? 'bg-brand/20 text-brand border border-brand/30'
                  : 'bg-bg-elevated border border-bg-border text-content-secondary hover:text-content-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {[['Batters', batters], ['Pitchers', pitchers], ['Minor Leaguers', minors]].map(([group, groupPlayers]) =>
        groupPlayers.length > 0 ? (
          <div key={group} className="card p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-3">{group}</h3>
            <div className="space-y-0">
              {filterAndSortGroup(groupPlayers).map(p => (
                <OttoneuPlayerRow
                  key={p.ottoneu_id || p.name}
                  player={p}
                  mlbId={playerIdMap[p.name] ?? null}
                  warehouseStats={statsMap[String(p.fg_id)] ?? null}
                />
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  )
}

// ── Surplus / Value Calculator ────────────────────────────────────────────────

function SurplusBar({ current, target }) {
  const pct = target > 0 ? Math.min((current / target) * 100, 120) : 0
  const over = pct > 100
  return (
    <div className="relative h-3 rounded-full bg-bg-elevated border border-bg-border overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${over ? 'bg-green-500' : pct >= 70 ? 'bg-brand' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
      {/* Fair-value marker at 100% */}
      <div className="absolute top-0 bottom-0 w-px bg-white/40" style={{ left: '100%', transform: 'translateX(-1px)' }} />
    </div>
  )
}

function OttoneuValueView() {
  const [query, setQuery]               = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [salary, setSalary]             = useState(10)

  const { data: searchResults = [] } = useQuery({
    queryKey: ['player-search-surplus', query],
    queryFn: () => api.players.search(query),
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
  })

  const { data: statsArr = [] } = useQuery({
    queryKey: ['ottoneu-surplus-stats', selectedName],
    queryFn: () => api.ottoneu.playerStats({ names: [selectedName] }),
    enabled: !!selectedName,
    staleTime: 30 * 60_000,
  })

  const { data: rosterData } = useQuery({
    queryKey: ['ottoneu-roster'],
    queryFn: () => api.ottoneu.roster(),
    staleTime: 30 * 60_000,
  })

  const stats = statsArr[0] ?? null
  const isPitcher = stats?.group === 'pitcher'

  // Pre-fill salary from roster when player is found
  useEffect(() => {
    if (!selectedName || !rosterData?.players) return
    const match = rosterData.players.find(p => normalize(p.name) === normalize(selectedName))
    if (match?.salary > 0) setSalary(match.salary)
  }, [selectedName, rosterData])

  const currentPts    = stats?.approx_fg_pts ?? 0
  const ppd           = calcPPD(currentPts, salary)
  const fairValuePts  = salary * FAIR_PPD          // pts needed to be "fair value"
  const surplusPts    = currentPts - fairValuePts
  const impliedSalary = currentPts > 0 ? (currentPts / FAIR_PPD) : 0
  const surplusDollar = impliedSalary - salary

  // Pace projection: use games played (batters) or IP (pitchers)
  const gamesPlayed = stats?.g ?? 0
  const ipPitched   = stats?.ip ?? 0
  const fullSeasonG  = 162
  const fullSeasonIP = 180
  const paceBase     = isPitcher ? (ipPitched > 0 ? ipPitched / fullSeasonIP : null)
                                 : (gamesPlayed > 0 ? gamesPlayed / fullSeasonG : null)
  const projectedPts = paceBase && currentPts > 0 ? Math.round(currentPts / paceBase) : null
  const projPPD      = calcPPD(projectedPts, salary)
  const projSurplus  = projectedPts != null ? projectedPts - fairValuePts : null

  function selectPlayer(name) {
    setSelectedName(name)
    setQuery(name)
  }

  const showDropdown = query.length >= 2 && searchResults.length > 0 && query !== selectedName

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-content-primary mb-0.5">Surplus Value Calculator</h3>
        <p className="text-[11px] text-content-muted">
          Fair value = <span className="font-semibold text-content-secondary">{FAIR_PPD} pts per dollar</span>.
          A player at {FAIR_PPD} PPD produces exactly what their salary "costs" the team.
          Positive surplus = underpaid. Negative = overpaid.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); if (e.target.value !== selectedName) setSelectedName('') }}
          placeholder="Search player by name…"
          className="w-full bg-bg-surface border border-bg-border rounded-lg px-4 py-2.5 text-sm text-content-primary placeholder:text-content-muted focus:outline-none focus:border-brand/50"
        />
        {showDropdown && (
          <div className="absolute z-20 top-full mt-1 w-full bg-bg-elevated border border-bg-border rounded-lg shadow-xl overflow-hidden">
            {searchResults.slice(0, 8).map(r => (
              <button
                key={r.id}
                className="w-full text-left px-4 py-2 text-sm text-content-primary hover:bg-bg-surface transition-colors flex items-center gap-3"
                onClick={() => selectPlayer(r.name)}
              >
                <img
                  src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_60,q_auto:best/v1/people/${r.id}/headshot/67/current`}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover bg-bg-border shrink-0"
                  onError={e => { e.currentTarget.style.display = 'none' }}
                />
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-content-muted text-[11px]">{r.team} · {r.position}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedName && !stats && (
        <div className="text-sm text-content-muted card p-4">No warehouse stats found for {selectedName} this season.</div>
      )}

      {stats && (
        <div className="space-y-3">
          {/* Salary input */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm font-semibold text-content-primary">{selectedName}</span>
                <span className="text-[11px] text-content-muted ml-2">{stats.name !== selectedName ? stats.name : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-content-muted">Salary</label>
                <div className="flex items-center gap-1">
                  <span className="text-content-muted text-sm">$</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={salary}
                    onChange={e => setSalary(Math.max(1, Number(e.target.value)))}
                    className="w-16 bg-bg-elevated border border-bg-border rounded px-2 py-1 text-sm font-mono text-content-primary text-center focus:outline-none focus:border-brand/50"
                  />
                </div>
              </div>
            </div>

            {/* Current stats row */}
            <div className="flex gap-2 flex-wrap mb-3">
              {!isPitcher ? (
                <>
                  {stats.avg   != null && <span className="text-[11px] font-mono text-content-muted">AVG {Number(stats.avg).toFixed(3)}</span>}
                  {stats.ops   != null && <span className="text-[11px] font-mono text-content-muted">OPS {Number(stats.ops).toFixed(3)}</span>}
                  {stats.woba  != null && <span className="text-[11px] font-mono text-content-muted">wOBA {Number(stats.woba).toFixed(3)}</span>}
                  {stats.hr    != null && <span className="text-[11px] font-mono text-content-muted">{stats.hr} HR</span>}
                </>
              ) : (
                <>
                  {stats.era   != null && <span className="text-[11px] font-mono text-content-muted">ERA {Number(stats.era).toFixed(2)}</span>}
                  {stats.fip   != null && <span className="text-[11px] font-mono text-content-muted">FIP {Number(stats.fip).toFixed(2)}</span>}
                  {stats.ip    != null && <span className="text-[11px] font-mono text-content-muted">{Number(stats.ip).toFixed(1)} IP</span>}
                  {stats.k     != null && <span className="text-[11px] font-mono text-content-muted">{stats.k} K</span>}
                </>
              )}
              {gamesPlayed > 0 && !isPitcher && <span className="text-[11px] font-mono text-content-muted">{gamesPlayed} G</span>}
            </div>

            {/* Value metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-bg-elevated rounded-lg p-3 border border-bg-border">
                <div className="text-[10px] uppercase tracking-widest text-content-muted mb-1">~FG Pts</div>
                <div className={`text-lg font-bold font-mono ${currentPts < 0 ? 'text-red-400' : 'text-brand'}`}>
                  {Number(currentPts).toFixed(0)}
                </div>
                <div className="text-[10px] text-content-muted">season to date</div>
              </div>
              <div className="bg-bg-elevated rounded-lg p-3 border border-bg-border">
                <div className="flex items-center gap-0.5 text-[10px] uppercase tracking-widest text-content-muted mb-1">
                  PPD <StatHelpTooltip stat="ppd" />
                </div>
                <div className={`text-lg font-bold font-mono ${ppdColor(ppd)}`}>
                  {ppd != null ? ppd.toFixed(1) : '—'}
                </div>
                <div className="text-[10px] text-content-muted">pts per dollar</div>
              </div>
              <div className="bg-bg-elevated rounded-lg p-3 border border-bg-border">
                <div className="text-[10px] uppercase tracking-widest text-content-muted mb-1">Fair Value</div>
                <div className="text-lg font-bold font-mono text-content-primary">{fairValuePts}</div>
                <div className="text-[10px] text-content-muted">pts needed @ ${salary}</div>
              </div>
              <div className={`rounded-lg p-3 border ${surplusDollar >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                <div className="flex items-center gap-0.5 text-[10px] uppercase tracking-widest text-content-muted mb-1">
                  Surplus $ <StatHelpTooltip stat="surplus" />
                </div>
                <div className={`text-lg font-bold font-mono ${surplusDollar >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {surplusDollar >= 0 ? '+' : ''}{Math.round(surplusDollar)}
                </div>
                <div className="text-[10px] text-content-muted">implied ${Math.round(impliedSalary)}</div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3">
              <div className="flex justify-between text-[10px] text-content-muted mb-1">
                <span>0 pts</span>
                <span className={surplusPts >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                  {surplusPts >= 0 ? '+' : ''}{Math.round(surplusPts)} pts surplus
                </span>
                <span>fair value: {fairValuePts} pts</span>
              </div>
              <SurplusBar current={currentPts} target={fairValuePts} />
            </div>
          </div>

          {/* Full-season projection */}
          {projectedPts != null && (
            <div className="card p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-3">
                Full-Season Projection <span className="font-normal normal-case">
                  ({isPitcher ? `${Number(stats.ip ?? 0).toFixed(0)} IP of ~${fullSeasonIP}` : `${gamesPlayed} G of ~${fullSeasonG}`} played)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-bg-elevated rounded-lg p-3 border border-bg-border">
                  <div className="text-[10px] uppercase tracking-widest text-content-muted mb-1">Proj Pts</div>
                  <div className={`text-lg font-bold font-mono ${projectedPts < 0 ? 'text-red-400' : 'text-brand'}`}>{projectedPts}</div>
                  <div className="text-[10px] text-content-muted">at current pace</div>
                </div>
                <div className="bg-bg-elevated rounded-lg p-3 border border-bg-border">
                  <div className="flex items-center gap-0.5 text-[10px] uppercase tracking-widest text-content-muted mb-1">
                    Proj PPD <StatHelpTooltip stat="ppd" />
                  </div>
                  <div className={`text-lg font-bold font-mono ${ppdColor(projPPD)}`}>{projPPD != null ? projPPD.toFixed(1) : '—'}</div>
                  <div className="text-[10px] text-content-muted">full season</div>
                </div>
                <div className={`rounded-lg p-3 border ${projSurplus >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                  <div className="flex items-center gap-0.5 text-[10px] uppercase tracking-widest text-content-muted mb-1">
                    Proj Surplus <StatHelpTooltip stat="surplus" />
                  </div>
                  <div className={`text-lg font-bold font-mono ${projSurplus >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {projSurplus >= 0 ? '+' : ''}{Math.round(projSurplus)} pts
                  </div>
                  <div className="text-[10px] text-content-muted">vs fair value</div>
                </div>
              </div>
              <div className="mt-3">
                <SurplusBar current={projectedPts} target={fairValuePts} />
              </div>

              {/* Salary slider for auction bidding */}
              <div className="mt-4 border-t border-bg-border/40 pt-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-2">
                  Auction Bid Simulator
                </div>
                <input
                  type="range"
                  min={1}
                  max={60}
                  value={salary}
                  onChange={e => setSalary(Number(e.target.value))}
                  className="w-full accent-brand"
                />
                <div className="flex justify-between text-[10px] text-content-muted mt-1">
                  <span>$1</span>
                  <span className={`font-semibold ${(projectedPts / salary) >= FAIR_PPD ? 'text-green-400' : 'text-red-400'}`}>
                    ${salary} → {(projectedPts / salary).toFixed(1)} PPD
                    {(projectedPts / salary) >= FAIR_PPD ? ' ✓ good value' : ' ✗ overpay'}
                  </span>
                  <span>$60</span>
                </div>
                <div className="text-[11px] text-content-muted text-center mt-1">
                  Max fair-value bid: <span className="font-semibold text-content-primary">${Math.max(1, Math.round(projectedPts / FAIR_PPD))}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Rules / League Info ───────────────────────────────────────────────────────

function RulesSection({ title, children }) {
  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
      {children}
    </div>
  )
}

function RuleRow({ label, value, muted }) {
  return (
    <div className="flex justify-between items-baseline text-[12px]">
      <span className="text-content-muted">{label}</span>
      <span className={`font-mono ${muted ? 'text-content-muted' : 'text-content-primary'}`}>{value}</span>
    </div>
  )
}

function OttoneuRulesView() {
  const { data: capData = [], isLoading: capLoading } = useQuery({
    queryKey: ['ottoneu-cap'],
    queryFn: () => api.ottoneu.capOverview(),
    staleTime: 30 * 60_000,
  })
  const { data: loansData = [], isLoading: loansLoading } = useQuery({
    queryKey: ['ottoneu-loans'],
    queryFn: () => api.ottoneu.loans(),
    staleTime: 30 * 60_000,
  })

  const capRows = Array.isArray(capData) ? capData : []
  const loanRows = Array.isArray(loansData) ? loansData : []

  return (
    <div className="space-y-4">

      {/* Scoring Rules */}
      <RulesSection title="FanGraphs Points Scoring">
        <div className="grid grid-cols-2 gap-6">
          {[['Hitting', FG_POINTS_HITTING], ['Pitching', FG_POINTS_PITCHING]].map(([label, rows]) => (
            <div key={label}>
              <div className="text-[11px] font-semibold text-content-secondary mb-2">{label}</div>
              <div className="space-y-1">
                {rows.map(([stat, pts]) => (
                  <div key={stat} className="flex justify-between text-[12px]">
                    <span className="text-content-muted font-mono">{stat}</span>
                    <span className={`font-bold font-mono ${pts > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {pts > 0 ? '+' : ''}{pts.toFixed(1)} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-bg-border text-[11px] text-content-muted space-y-1">
          <p>Format: H2H Points — weekly head-to-head matchups using FanGraphs point values above.</p>
          <p>Roster: up to 40 players. Starting lineup: up to 28 active spots. IL players do not score.</p>
        </div>
      </RulesSection>

      {/* Salary Cap */}
      <RulesSection title="Salary Cap">
        <div className="space-y-2 text-[12px]">
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="bg-bg-elevated rounded p-3 text-center">
              <div className="text-[22px] font-bold font-mono text-brand">$400</div>
              <div className="text-[11px] text-content-muted mt-0.5">Total cap per team</div>
            </div>
            <div className="bg-bg-elevated rounded p-3 text-center">
              <div className="text-[22px] font-bold font-mono text-content-primary">40</div>
              <div className="text-[11px] text-content-muted mt-0.5">Max roster size</div>
            </div>
          </div>
          <RuleRow label="Cap penalty for cuts" value="Kept for season" />
          <RuleRow label="Arbitration raises" value="Applied each winter" />
          <RuleRow label="Loans allowed" value="Yes — teams can trade cap space" />
          <RuleRow label="Cap floor" value="None" muted />
        </div>

        {/* Live cap table */}
        {!capLoading && capRows.length > 0 && (
          <div className="mt-3 pt-3 border-t border-bg-border">
            <div className="text-[11px] text-content-muted mb-2">Current cap standings</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-content-muted border-b border-bg-border">
                    <th className="pb-1.5 text-left font-medium">Team</th>
                    <th className="pb-1.5 text-right font-medium">Base $</th>
                    <th className="pb-1.5 text-right font-medium">Penalties</th>
                    <th className="pb-1.5 text-right font-medium">Loans In</th>
                    <th className="pb-1.5 text-right font-medium">Loans Out</th>
                    <th className="pb-1.5 text-right font-medium">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg-border/50">
                  {[...capRows].sort((a, b) => b.cap_space - a.cap_space).map(team => (
                    <tr key={team.team_name} className="hover:bg-bg-elevated/50 transition-colors">
                      <td className="py-1.5 text-content-secondary">{team.team_name}</td>
                      <td className="py-1.5 text-right font-mono text-content-muted">${team.base_salary ?? '—'}</td>
                      <td className="py-1.5 text-right font-mono text-content-muted">
                        {team.penalties > 0 ? <span className="text-amber-400">${team.penalties}</span> : '—'}
                      </td>
                      <td className="py-1.5 text-right font-mono text-content-muted">
                        {team.loans_in > 0 ? <span className="text-green-400">+${team.loans_in}</span> : '—'}
                      </td>
                      <td className="py-1.5 text-right font-mono text-content-muted">
                        {team.loans_out > 0 ? <span className="text-red-400/70">-${team.loans_out}</span> : '—'}
                      </td>
                      <td className={`py-1.5 text-right font-mono font-semibold ${team.cap_space >= 50 ? 'text-green-400' : team.cap_space >= 10 ? 'text-content-primary' : 'text-red-400'}`}>
                        ${team.cap_space}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </RulesSection>

      {/* Loans */}
      <RulesSection title="Loans">
        <p className="text-[12px] text-content-muted">
          Teams can loan cap space to each other. Loans reduce the lender's available cap and increase the borrower's.
          Loans must be agreed to by both sides and are tracked by the commissioner.
        </p>
        {loansLoading && <div className="text-[12px] text-content-muted">Loading…</div>}
        {!loansLoading && loanRows.length === 0 && (
          <div className="text-[12px] text-content-muted italic">No active loans this season.</div>
        )}
        {!loansLoading && loanRows.length > 0 && (
          <div className="overflow-x-auto mt-1">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-content-muted border-b border-bg-border">
                  <th className="pb-1.5 text-left font-medium">From</th>
                  <th className="pb-1.5 text-left font-medium">To</th>
                  <th className="pb-1.5 text-right font-medium">Amount</th>
                  <th className="pb-1.5 text-right font-medium">Season</th>
                  <th className="pb-1.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg-border/50">
                {loanRows.map((loan, i) => (
                  <tr key={i} className="hover:bg-bg-elevated/50">
                    <td className="py-1.5 text-content-secondary">{loan.from_team}</td>
                    <td className="py-1.5 text-content-secondary">{loan.to_team}</td>
                    <td className="py-1.5 text-right font-mono text-brand">${loan.amount}</td>
                    <td className="py-1.5 text-right font-mono text-content-muted">{loan.season}</td>
                    <td className="py-1.5 text-right text-content-muted">{loan.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RulesSection>

      {/* Transaction Rules */}
      <RulesSection title="Transactions">
        <div className="space-y-3 text-[12px]">
          <div>
            <div className="font-semibold text-content-secondary mb-1.5">Auctions</div>
            <div className="space-y-1 text-content-muted">
              <RuleRow label="Nomination bid" value="$1 minimum" />
              <RuleRow label="Auction window" value="72 hours" />
              <RuleRow label="Salary set by" value="Winning bid" />
              <RuleRow label="Requires" value="Available cap space" />
            </div>
          </div>
          <div className="pt-2 border-t border-bg-border">
            <div className="font-semibold text-content-secondary mb-1.5">Waivers</div>
            <div className="space-y-1 text-content-muted">
              <RuleRow label="Claim window" value="24 hours" />
              <RuleRow label="Salary" value="Set by team on cut" />
              <RuleRow label="Waiver order" value="Reverse standings" />
            </div>
          </div>
          <div className="pt-2 border-t border-bg-border">
            <div className="font-semibold text-content-secondary mb-1.5">Cuts</div>
            <div className="space-y-1 text-content-muted">
              <RuleRow label="Cut timing" value="Any time" />
              <RuleRow label="Cap impact" value="Salary stays on books for season" />
              <RuleRow label="Player status" value="Goes to waivers (24 hrs), then free agent" />
            </div>
          </div>
        </div>
      </RulesSection>

      {/* Roster Rules */}
      <RulesSection title="Roster Rules">
        <div className="space-y-1 text-[12px]">
          <RuleRow label="Max roster size" value="40 players" />
          <RuleRow label="Active lineup spots" value="Up to 28" />
          <RuleRow label="IL slots" value="Unlimited (but IL players can't score)" />
          <RuleRow label="Position eligibility" value="Based on FanGraphs designation" />
          <RuleRow label="Arbitration" value="3 years service time → arb raise each winter" />
          <RuleRow label="Minor leaguers" value="Can be rostered at $1 salary" />
          <div className="pt-2 mt-1 border-t border-bg-border text-[11px] text-content-muted space-y-1">
            <p>Players are eligible at any position they qualify at on FanGraphs (200+ PA or 5 starts at position).</p>
            <p>Pitchers qualify as SP after 5 starts; RP otherwise. Multi-position eligibility is common.</p>
          </div>
        </div>
      </RulesSection>

    </div>
  )
}

function OttoneuView() {
  const [activeTab, setActiveTab]     = useState('roster')
  const [selectedTeam, setSelectedTeam] = useState(null)

  const { data: allRosters } = useQuery({
    queryKey: ['ottoneu-all-rosters'],
    queryFn: () => api.ottoneu.allRosters(),
    staleTime: 30 * 60_000,
  })

  const rosterFgIds = useMemo(() => {
    if (!Array.isArray(allRosters)) return []
    return allRosters
      .flatMap(t => t.players ?? [])
      .map(p => p.fg_id)
      .filter(Boolean)
  }, [allRosters])

  const salaryByFgId = useMemo(() => {
    if (!Array.isArray(allRosters)) return {}
    const map = {}
    allRosters.flatMap(t => t.players ?? []).forEach(p => {
      if (p.fg_id && p.salary > 0) map[String(p.fg_id)] = p.salary
    })
    return map
  }, [allRosters])

  const { data: leagueWarehouseStats = [] } = useQuery({
    queryKey: ['ottoneu-league-pts-dist', rosterFgIds.slice().sort().join(',')],
    queryFn: () => api.ottoneu.playerStats({ fgIds: rosterFgIds }),
    enabled: rosterFgIds.length > 0,
    staleTime: 30 * 60_000,
  })

  const { leaguePtsDist, leaguePpdDist, leagueSurplusDist } = useMemo(() => {
    const pts = [], ppd = [], surplus = []
    leagueWarehouseStats.forEach(p => {
      const ap  = p.approx_fg_pts
      const sal = salaryByFgId[String(p.fg_id)]
      if (ap != null && ap > 0) pts.push(ap)
      if (ap != null && sal > 0) {
        ppd.push(ap / sal)
        surplus.push(Math.round(ap / FAIR_PPD) - sal)
      }
    })
    return {
      leaguePtsDist:     pts.sort((a, b) => a - b),
      leaguePpdDist:     ppd.sort((a, b) => a - b),
      leagueSurplusDist: surplus.sort((a, b) => a - b),
    }
  }, [leagueWarehouseStats, salaryByFgId])

  const handleSelectTeam = (name) => {
    if (!Array.isArray(allRosters)) return
    const team = allRosters.find(t =>
      t.team_name === name ||
      t.team_name?.toLowerCase().includes(name?.toLowerCase()) ||
      name?.toLowerCase().includes(t.team_name?.toLowerCase())
    )
    if (team) setSelectedTeam(team)
  }

  return (
    <OttoneuLeagueContext.Provider value={{ leaguePtsDist, leaguePpdDist, leagueSurplusDist }}>
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          {selectedTeam ? (
            <OttoneuTeamPage team={selectedTeam} onBack={() => setSelectedTeam(null)} />
          ) : (
            <>
              <div className="flex border-b border-bg-border">
                {[['roster', 'My Roster'], ['league', 'League'], ['transactions', 'Auctions & Waivers'], ['freeagents', 'Free Agents'], ['stats', 'Stats'], ['value', 'Value Calc'], ['rules', 'Rules']].map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={activeTab === tab ? 'tab-active' : 'tab-inactive'}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === 'roster'       && <OttoneuRosterView />}
              {activeTab === 'league'       && <OttoneuLeagueView onSelectTeam={handleSelectTeam} />}
              {activeTab === 'transactions' && <OttoneuTransactionsView />}
              {activeTab === 'freeagents'   && <OttoneuFreeAgentList />}
              {activeTab === 'stats'        && <OttoneuLeagueStatsTable />}
              {activeTab === 'value'        && <OttoneuValueView />}
              {activeTab === 'rules'        && <OttoneuRulesView />}
            </>
          )}
        </div>

        <div className="shrink-0 w-52 hidden lg:block sticky top-4 space-y-3">
          <ScoringReference />
          <PlayerListPanel />
        </div>
      </div>
    </OttoneuLeagueContext.Provider>
  )
}

// ── Yahoo helpers (unchanged) ─────────────────────────────────────────────────

function YahooView({ urlError }) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('roster')

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
      <div className="flex items-center justify-center h-32 text-content-muted text-sm gap-2">
        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        Loading…
      </div>
    )
  }

  if (!statusData?.authenticated) {
    return <ConnectFlow urlError={urlError} />
  }

  return (
    <div className="space-y-4">
      <div className="flex border-b border-bg-border">
        <button onClick={() => setActiveTab('roster')} className={activeTab === 'roster' ? 'tab-active' : 'tab-inactive'}>
          My Roster
        </button>
        <button onClick={() => setActiveTab('sandbox')} className={activeTab === 'sandbox' ? 'tab-active' : 'tab-inactive'}>
          Edit Sandbox
        </button>
      </div>

      {rosterLoading && (
        <div className="flex items-center gap-2 text-content-muted text-sm">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          Loading roster…
        </div>
      )}

      {rosterError && <div className="card p-4 text-sm text-red-400">Failed to load roster. Try refreshing.</div>}
      {dashboardData?.error && <div className="card p-4 text-sm text-red-400">{dashboardData.error}</div>}

      {activeTab === 'roster' && dashboardData && !dashboardData.error && (
        <RosterView data={dashboardData} />
      )}

      {activeTab === 'sandbox' && (
        <RosterSandbox
          roster={dashboardData?.roster}
          weekNumber={dashboardData?.current_matchup?.week ?? 1}
        />
      )}
    </div>
  )
}

export default function YahooFantasy() {
  const [searchParams, setSearchParams] = useSearchParams()
  const connected = searchParams.get('connected')
  const urlError  = searchParams.get('error')
  const queryClient = useQueryClient()
  const [platform, setPlatform] = useState(() => {
    try { return localStorage.getItem('fantasy-platform') || 'ottoneu' } catch { return 'ottoneu' }
  })

  useEffect(() => {
    if (connected) {
      queryClient.invalidateQueries({ queryKey: ['yahoo-status'] })
      queryClient.invalidateQueries({ queryKey: ['yahoo-dashboard'] })
      setSearchParams({}, { replace: true })
    }
  }, [connected, queryClient, setSearchParams])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-content-primary">Fantasy Baseball</h1>
        <div className="flex gap-1 bg-bg-elevated border border-bg-border rounded-lg p-0.5">
          {[['yahoo', 'Yahoo'], ['ottoneu', 'Ottoneu']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setPlatform(key); try { localStorage.setItem('fantasy-platform', key) } catch {} }}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                platform === key
                  ? 'bg-brand text-white'
                  : 'text-content-muted hover:text-content-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {platform === 'yahoo'   && <YahooView urlError={urlError} />}
      {platform === 'ottoneu' && <OttoneuView />}
    </div>
  )
}
