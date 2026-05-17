import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { api } from '../api'
import PlayerLink from '../components/PlayerLink'
import FactoidsPanel from '../components/FactoidsPanel'

// ─── helpers ───────────────────────────────────────────────────────────────

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function fmtDate(date) {
  if (!date) return '-'
  try { return format(parseISO(date), 'MMM d, yyyy') } catch { return date }
}

function fmtRate(v, digits = 3) {
  if (v == null) return '-'
  const n = Number(v).toFixed(digits)
  return digits === 3 ? n.replace(/^0/, '') : n
}

function isPitcherPos(pos) {
  return pos === 'P' || pos === 'SP' || pos === 'RP'
}

// ─── Baseball Diamond ──────────────────────────────────────────────────────

// Square viewBox (100×100). Bases: home=(50,84) 1B=(72,62) 2B=(50,40) 3B=(28,62).
// Foul lines extend at 45° from home to (0,34) and (100,34).
const DIAMOND_POSITIONS = [
  { key: 'CF', label: 'CF', x: 50, y: 4  },
  { key: 'LF', label: 'LF', x: 10, y: 22 },
  { key: 'RF', label: 'RF', x: 90, y: 22 },
  { key: 'SS', label: 'SS', x: 36, y: 50 },
  { key: '2B', label: '2B', x: 64, y: 50 },
  { key: '3B', label: '3B', x: 20, y: 63 },
  { key: '1B', label: '1B', x: 80, y: 63 },
  { key: 'P',  label: 'P',  x: 50, y: 63 },
  { key: 'C',  label: 'C',  x: 50, y: 93 },
]

function DiamondBadge({ player, label }) {
  const content = (
    <div className="flex flex-col items-center gap-0.5">
      {player ? (
        <img
          src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${player.id}/headshot/67/current`}
          alt={player.name}
          title={player.name}
          className="w-6 h-6 rounded-full object-cover bg-bg-elevated border border-bg-border"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-bg-elevated border border-bg-border/40 flex items-center justify-center">
          <span className="text-[7px] text-content-muted">{label}</span>
        </div>
      )}
      <span className="text-[8px] font-semibold text-content-muted leading-none">{label}</span>
    </div>
  )

  if (!player) return <div>{content}</div>

  return (
    <Link to={`/player/${player.id}`} className="hover:opacity-80 transition-opacity">
      {content}
    </Link>
  )
}

function DiamondLineup({ roster }) {
  const byPos = {}

  roster.forEach(p => {
    if (p.position === 'TWP') {
      const games = p.statSummary?.pitching?.games ?? 0
      if (!byPos['P'] || games > (byPos['P'].statSummary?.pitching?.games ?? 0)) byPos['P'] = p
      return
    }
    if (!DIAMOND_POSITIONS.find(d => d.key === p.position)) return
    const games = p.statSummary?.hitting?.games ?? p.statSummary?.pitching?.games ?? 0
    const cur = byPos[p.position]
    const curGames = cur ? (cur.statSummary?.hitting?.games ?? cur.statSummary?.pitching?.games ?? 0) : -1
    if (games > curGames) byPos[p.position] = p
  })

  return (
    <div className="relative w-full select-none" style={{ paddingBottom: '100%' }}>
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outfield arc */}
        <path d="M 0,34 Q 50,2 100,34" stroke="#2D3748" strokeWidth="0.6" />
        {/* Foul lines from home at 45° */}
        <line x1="50" y1="84" x2="0"   y2="34" stroke="#2D3748" strokeWidth="0.4" strokeDasharray="2 1.5" />
        <line x1="50" y1="84" x2="100" y2="34" stroke="#2D3748" strokeWidth="0.4" strokeDasharray="2 1.5" />
        {/* Infield diamond: home→1B→2B→3B */}
        <polygon points="50,84 72,62 50,40 28,62" stroke="#374151" strokeWidth="0.7" />
        {/* Pitcher's mound */}
        <circle cx="50" cy="62" r="2" fill="#374151" />
      </svg>

      {DIAMOND_POSITIONS.map(({ key, label, x, y }) => (
        <div
          key={key}
          className="absolute"
          style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
        >
          <DiamondBadge player={byPos[key] || null} label={label} />
        </div>
      ))}
    </div>
  )
}

// ─── Roster stat rows ───────────────────────────────────────────────────────

function PitcherRow({ player }) {
  const s = player.statSummary?.pitching || {}
  return (
    <tr className="border-b border-bg-border/50 last:border-0 hover:bg-bg-elevated/40 transition-colors">
      <td className="py-2 pr-3">
        <PlayerLink playerId={player.id} name={player.name} imageClassName="w-6 h-6" />
      </td>
      <td className="py-2 text-xs text-content-muted">{player.jerseyNumber ? `#${player.jerseyNumber}` : ''}</td>
      <td className="py-2 text-right font-mono text-sm">{s.games ?? '-'}</td>
      <td className="py-2 text-right font-mono text-sm">{s.inningsPitched ?? '-'}</td>
      <td className="py-2 text-right font-mono text-sm">{fmtRate(s.era, 2)}</td>
      <td className="py-2 text-right font-mono text-sm">{fmtRate(s.whip, 2)}</td>
      <td className="py-2 text-right font-mono text-sm">{s.strikeOuts ?? '-'}</td>
    </tr>
  )
}

function HitterRow({ player }) {
  const s = player.statSummary?.hitting || {}
  return (
    <tr className="border-b border-bg-border/50 last:border-0 hover:bg-bg-elevated/40 transition-colors">
      <td className="py-2 pr-3">
        <PlayerLink playerId={player.id} name={player.name} imageClassName="w-6 h-6" />
      </td>
      <td className="py-2 text-xs text-content-muted">{player.position}</td>
      <td className="py-2 text-xs text-content-muted">{player.jerseyNumber ? `#${player.jerseyNumber}` : ''}</td>
      <td className="py-2 text-right font-mono text-sm">{s.games ?? '-'}</td>
      <td className="py-2 text-right font-mono text-sm">{s.plateAppearances ?? '-'}</td>
      <td className="py-2 text-right font-mono text-sm">{fmtRate(s.avg)}</td>
      <td className="py-2 text-right font-mono text-sm">{fmtRate(s.ops)}</td>
      <td className="py-2 text-right font-mono text-sm">{s.homeRuns ?? '-'}</td>
      <td className="py-2 text-right font-mono text-sm">{s.rbi ?? '-'}</td>
    </tr>
  )
}

function SortTh({ label, sortKey, sort, onSort, className = '' }) {
  const active = sort.key === sortKey
  return (
    <th
      className={`cursor-pointer select-none text-[10px] uppercase tracking-wider text-content-muted hover:text-content-primary transition-colors ${active ? 'text-content-primary' : ''} ${className}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span className="ml-0.5 opacity-50 text-[8px]">{active ? (sort.dir === 'desc' ? '▼' : '▲') : '⇅'}</span>
    </th>
  )
}

// ─── Roster card (compact headshot) ────────────────────────────────────────

function RosterCard({ player }) {
  const lastName = player.name?.split(' ').slice(1).join(' ') || player.name
  return (
    <Link
      to={`/player/${player.id}`}
      className="flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-bg-elevated transition-colors text-center min-w-0"
    >
      <img
        src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${player.id}/headshot/67/current`}
        alt={player.name}
        className="w-10 h-10 rounded-full object-cover bg-bg-elevated border border-bg-border shrink-0"
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
      <div className="min-w-0 w-full">
        <div className="text-[10px] font-medium text-content-primary truncate leading-tight">{lastName}</div>
        <div className="text-[9px] text-content-muted leading-tight">
          {player.jerseyNumber ? `#${player.jerseyNumber}` : player.position}
        </div>
      </div>
    </Link>
  )
}

// ─── Current game widget ────────────────────────────────────────────────────

function BasesIndicator({ bases = {} }) {
  function Base({ on }) {
    return <span className={`w-3 h-3 rotate-45 border ${on ? 'bg-brand border-brand' : 'bg-bg-base border-bg-border'}`} />
  }
  return (
    <span className="inline-grid grid-cols-3 grid-rows-3 gap-1 items-center">
      <span /><Base on={Boolean(bases.second)} /><span />
      <Base on={Boolean(bases.third)} /><span /><Base on={Boolean(bases.first)} />
      <span /><span /><span />
    </span>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function TeamProfile() {
  const { id } = useParams()
  const { data, isLoading, error } = useQuery({
    queryKey: ['team-info', id],
    queryFn: () => api.teams.info(id),
    enabled: Boolean(id),
    staleTime: 10 * 60 * 1000,
  })

  const [pitSort, setPitSort] = useState({ key: 'era', dir: 'asc' })
  const [hitSort, setHitSort] = useState({ key: 'ops', dir: 'desc' })

  function toggleSort(setFn, key) {
    setFn(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }))
  }

  if (isLoading) return <div className="card p-8 text-content-muted">Loading team profile...</div>
  if (error)     return <div className="card p-8 text-content-muted">Failed to load. {error.message}</div>

  const team = data || {}
  const roster = team.roster || []
  const games  = team.recentGames || []
  const featuredGame = games.find(g => g.abstractState === 'Live' || g.abstractState === 'Preview') || games[0]
  const isLive    = featuredGame?.abstractState === 'Live'
  const isPreview = featuredGame?.abstractState === 'Preview'
  const count = featuredGame?.count || {}

  // Split roster — TWP appear in both lists
  const pitchers = roster.filter(p => isPitcherPos(p.position) || p.position === 'TWP')
  const hitters  = roster.filter(p => !isPitcherPos(p.position))  // TWP included (has hitting stats)

  function sortRoster(list, sort, statFn) {
    if (!sort.key) return list
    return [...list].sort((a, b) => {
      const av = statFn(a, sort.key)
      const bv = statFn(b, sort.key)
      if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sort.dir === 'asc' ? av - bv : bv - av
    })
  }

  function pitcherVal(p, key) {
    const s = p.statSummary?.pitching || {}
    return { era: parseFloat(s.era) || 0, whip: parseFloat(s.whip) || 0, k: parseInt(s.strikeOuts) || 0, g: parseInt(s.games) || 0, ip: parseFloat(s.inningsPitched) || 0, name: p.name || '' }[key] ?? 0
  }
  function hitterVal(p, key) {
    const s = p.statSummary?.hitting || {}
    return { avg: parseFloat(s.avg) || 0, ops: parseFloat(s.ops) || 0, hr: parseInt(s.homeRuns) || 0, rbi: parseInt(s.rbi) || 0, pa: parseInt(s.plateAppearances) || 0, g: parseInt(s.games) || 0, name: p.name || '', pos: p.position || '' }[key] ?? 0
  }

  const sortedPitchers = sortRoster(pitchers, pitSort, pitcherVal)
  const sortedHitters  = sortRoster(hitters,  hitSort, hitterVal)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link className="text-sm text-brand-light hover:underline" to="/">← Schedule</Link>
      </div>

      {/* ── Header card ── */}
      <section className="card overflow-hidden">
        <div className="h-1.5" style={{ background: team.color || '#333333' }} />

        <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
          {/* Left: name + standings + game widget */}
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-4">
              {team.id && (
                <img
                  src={`https://www.mlbstatic.com/team-logos/${team.id}.svg`}
                  alt={team.name}
                  className="w-16 h-16 object-contain shrink-0"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              )}
              <div>
                <h1 className="text-3xl font-bold text-content-primary">{team.name}</h1>
                <div className="flex items-center gap-2 mt-1 text-sm text-content-secondary flex-wrap">
                  {team.league && <span>{team.league}</span>}
                  {team.division && <span>· {team.division}</span>}
                  {team.venue && <span>· {team.venue}</span>}
                </div>
              </div>
            </div>

            {team.standing?.wins != null && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-2xl font-bold font-mono text-content-primary">
                  {team.standing.wins}–{team.standing.losses}
                  {team.standing.pct && (
                    <span className="text-base font-normal text-content-muted ml-2">({team.standing.pct})</span>
                  )}
                </span>
                {team.standing.divisionRank > 0 && (
                  <span className="text-sm text-content-secondary">
                    {ordinal(team.standing.divisionRank)} in {team.division}
                    {team.standing.gamesBack && team.standing.gamesBack !== '-' && (
                      <span className="text-content-muted"> · {team.standing.gamesBack} GB</span>
                    )}
                  </span>
                )}
                {team.standing.wildCardRank > 0 && (
                  <span className="text-sm text-content-secondary">
                    {ordinal(team.standing.wildCardRank)} WC
                    {team.standing.wildCardGamesBack && team.standing.wildCardGamesBack !== '-' && (
                      <span className="text-content-muted"> · {team.standing.wildCardGamesBack}</span>
                    )}
                  </span>
                )}
                {team.standing.streak && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-bg-elevated border border-bg-border text-content-muted">
                    {team.standing.streak}
                  </span>
                )}
                {team.standing.lastTen && (
                  <span className="text-xs text-content-muted">L10: {team.standing.lastTen}</span>
                )}
              </div>
            )}

            {featuredGame && (
              <div className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 space-y-1.5">
                <div className="text-xs text-content-muted uppercase tracking-wider inline-flex items-center gap-2">
                  <span className={isLive ? 'text-green-400' : 'text-content-muted'}>
                    {isLive ? 'Live Game' : isPreview ? 'Upcoming' : 'Most Recent'}
                  </span>
                  <span>{featuredGame.isHome ? 'vs' : '@'} {featuredGame.opponent?.abbreviation || featuredGame.opponent?.name}</span>
                </div>
                {!isPreview && (
                  <div className="text-sm font-medium text-content-primary">
                    {team.abbreviation} {featuredGame.teamScore ?? '-'} – {featuredGame.oppScore ?? '-'} {featuredGame.opponent?.abbreviation}
                  </div>
                )}
                {isLive && (
                  <div className="text-xs text-content-secondary flex items-center gap-2 flex-wrap">
                    {featuredGame.inningHalf} {featuredGame.currentInning} · {count.balls}-{count.strikes} · {count.outs} out{Number(count.outs) === 1 ? '' : 's'}
                    <BasesIndicator bases={featuredGame.bases} />
                  </div>
                )}
                {!isLive && !isPreview && (
                  <div className="text-xs text-content-secondary">{fmtDate(featuredGame.gameDate)}</div>
                )}
              </div>
            )}
          </div>

          {/* Right: baseball diamond */}
          {roster.length > 0 && (
            <div className="w-48 shrink-0 self-start">
              <p className="text-[10px] font-semibold text-content-muted uppercase tracking-widest mb-1 text-center">Lineup</p>
              <DiamondLineup roster={roster} />
            </div>
          )}
        </div>
      </section>

      <FactoidsPanel
        queryKey={['team-factoids', team.id]}
        queryFn={() => api.factoids.team(team.id)}
      />

      {/* ── Team season stats ── */}
      {team.seasonStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {team.seasonStats.batting && (
            <section className="card p-5 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-content-muted">Team Batting</h2>
              <div className="grid grid-cols-4 gap-3">
                {[
                  ['AVG', team.seasonStats.batting.avg, 3, 'avg'],
                  ['OBP', team.seasonStats.batting.obp, 3, 'obp'],
                  ['SLG', team.seasonStats.batting.slg, 3, null],
                  ['OPS', team.seasonStats.batting.ops, 3, 'ops'],
                  ['HR',  team.seasonStats.batting.hr,  0, 'hr'],
                  ['R',   team.seasonStats.batting.r,   0, 'r'],
                  ['RBI', team.seasonStats.batting.rbi, 0, null],
                  ['SB',  team.seasonStats.batting.sb,  0, null],
                ].map(([label, val, dec, rkey]) => val != null && (
                  <div key={label} className="text-center">
                    <div className="text-lg font-bold font-mono text-content-primary">
                      {dec > 0 ? Number(val).toFixed(dec).replace(/^0/, '') : val}
                    </div>
                    <div className="text-[10px] text-content-muted uppercase tracking-widest">{label}</div>
                    {rkey && team.seasonStats.batting.ranks?.[rkey] != null && (
                      <div className="text-[9px] text-content-muted">#{team.seasonStats.batting.ranks[rkey]}</div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          {team.seasonStats.pitching && (
            <section className="card p-5 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-content-muted">Team Pitching</h2>
              <div className="grid grid-cols-4 gap-3">
                {[
                  ['ERA',  team.seasonStats.pitching.era,  2, 'era'],
                  ['WHIP', team.seasonStats.pitching.whip, 2, 'whip'],
                  ['K',    team.seasonStats.pitching.so,   0, 'so'],
                  ['BB',   team.seasonStats.pitching.bb,   0, null],
                  ['HR',   team.seasonStats.pitching.hr,   0, null],
                  ['SV',   team.seasonStats.pitching.sv,   0, null],
                ].map(([label, val, dec, rkey]) => val != null && (
                  <div key={label} className="text-center">
                    <div className="text-lg font-bold font-mono text-content-primary">
                      {dec > 0 ? Number(val).toFixed(dec) : val}
                    </div>
                    <div className="text-[10px] text-content-muted uppercase tracking-widest">{label}</div>
                    {rkey && team.seasonStats.pitching.ranks?.[rkey] != null && (
                      <div className="text-[9px] text-content-muted">#{team.seasonStats.pitching.ranks[rkey]}</div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Active roster cards ── */}
      {roster.length > 0 && (
        <section className="card p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-content-muted">Active Roster</h2>
          {pitchers.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-2 pb-1 border-b border-bg-border/40">Pitchers</h3>
              <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-12 gap-0.5">
                {pitchers.map(p => <RosterCard key={p.id} player={p} />)}
              </div>
            </div>
          )}
          {hitters.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-2 pb-1 border-b border-bg-border/40">Position Players</h3>
              <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-12 gap-0.5">
                {hitters.map(p => <RosterCard key={p.id} player={p} />)}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Recent games ── */}
      <section className="card p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-content-muted mb-3">Recent Games</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-border text-content-muted text-xs">
                <th className="text-left py-2">Date</th>
                <th className="text-left py-2">Opponent</th>
                <th className="text-right py-2">Result</th>
                <th className="text-right py-2"></th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => {
                const hasScore = game.teamScore != null && game.oppScore != null
                const won = hasScore && Number(game.teamScore) > Number(game.oppScore)
                const result = hasScore ? `${won ? 'W' : 'L'} ${game.teamScore}–${game.oppScore}` : game.status || '-'
                return (
                  <tr key={game.gamePk} className="border-b border-bg-border/60 last:border-b-0">
                    <td className="py-2 text-content-secondary">{fmtDate(game.gameDate)}</td>
                    <td className="py-2 text-content-primary">{game.isHome ? 'vs' : '@'} {game.opponent?.abbreviation}</td>
                    <td className={`py-2 text-right font-mono font-semibold ${hasScore ? (won ? 'text-green-400' : 'text-red-400') : 'text-content-muted'}`}>{result}</td>
                    <td className="py-2 text-right"><Link className="text-brand-light hover:underline text-xs" to={`/game/${game.gamePk}`}>Box</Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Pitchers ── */}
      <section className="card p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-content-muted mb-3">Pitchers</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-border">
                <SortTh label="Name"  sortKey="name" sort={pitSort} onSort={k => toggleSort(setPitSort, k)} className="text-left py-2 pr-3" />
                <th className="text-right py-2 text-[10px] uppercase tracking-wider text-content-muted">#</th>
                <SortTh label="G"    sortKey="g"    sort={pitSort} onSort={k => toggleSort(setPitSort, k)} className="text-right py-2" />
                <SortTh label="IP"   sortKey="ip"   sort={pitSort} onSort={k => toggleSort(setPitSort, k)} className="text-right py-2" />
                <SortTh label="ERA"  sortKey="era"  sort={pitSort} onSort={k => toggleSort(setPitSort, k)} className="text-right py-2" />
                <SortTh label="WHIP" sortKey="whip" sort={pitSort} onSort={k => toggleSort(setPitSort, k)} className="text-right py-2" />
                <SortTh label="K"    sortKey="k"    sort={pitSort} onSort={k => toggleSort(setPitSort, k)} className="text-right py-2" />
              </tr>
            </thead>
            <tbody>
              {sortedPitchers.map(p => <PitcherRow key={p.id} player={p} />)}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Position Players ── */}
      <section className="card p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-content-muted mb-3">Position Players</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-border">
                <SortTh label="Name" sortKey="name" sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-left py-2 pr-3" />
                <SortTh label="Pos"  sortKey="pos"  sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-left py-2" />
                <th className="text-right py-2 text-[10px] uppercase tracking-wider text-content-muted">#</th>
                <SortTh label="G"   sortKey="g"   sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-right py-2" />
                <SortTh label="PA"  sortKey="pa"  sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-right py-2" />
                <SortTh label="AVG" sortKey="avg" sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-right py-2" />
                <SortTh label="OPS" sortKey="ops" sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-right py-2" />
                <SortTh label="HR"  sortKey="hr"  sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-right py-2" />
                <SortTh label="RBI" sortKey="rbi" sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-right py-2" />
              </tr>
            </thead>
            <tbody>
              {sortedHitters.map(p => <HitterRow key={p.id} player={p} />)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
