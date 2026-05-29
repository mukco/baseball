import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { api } from '../api'
import MlbWatchFrame from '../components/MlbWatchFrame'
import StatHelpTooltip from '../components/StatHelpTooltip'
import PlayerLink from '../components/PlayerLink'
import PlayerNameLink from '../components/PlayerNameLink'
import PlayerHoverCard from '../components/PlayerHoverCard'
import AutoLinkedText from '../components/AutoLinkedText'
import TeamLink from '../components/TeamLink'
import WinProbabilityChart from '../components/charts/WinProbabilityChart'
import FactoidsPanel from '../components/FactoidsPanel'
import { ballparkImageForVenue } from '../lib/ballparkImages'

function fmtPct(v) {
  return v == null ? '-' : `${(v * 100).toFixed(1)}%`
}

function fmtRate(v) {
  return v == null ? '-' : Number(v).toFixed(3)
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function linkPlayersInText(text, playerIndex) {
  const line = String(text || '')
  const names = Object.keys(playerIndex || {}).filter(Boolean)
  if (!names.length) return [<span key="txt">{line}</span>]

  const pattern = new RegExp(`\\b(${names.map(escapeRegExp).sort((a, b) => b.length - a.length).join('|')})\\b`, 'g')
  const parts = line.split(pattern)

  return parts.map((part, idx) => {
    const player = playerIndex[part]
    if (!player) return <span key={`txt-${idx}`}>{part}</span>

    return (
      <PlayerHoverCard key={`p-${player.id}-${idx}`} playerId={player.id}>
        <Link to={`/player/${player.id}`} className="text-brand-light hover:underline font-medium">
          {part}
        </Link>
      </PlayerHoverCard>
    )
  })
}

function extractMentionedPlayers(lines, playerIndex) {
  const seen = new Set()
  const players = []
  const names = Object.keys(playerIndex || {}).filter(Boolean)
  if (!names.length) return players

  const pattern = new RegExp(`\\b(${names.map(escapeRegExp).sort((a, b) => b.length - a.length).join('|')})\\b`, 'g')
  for (const line of (lines || [])) {
    for (const match of String(line).matchAll(pattern)) {
      const name = match[1]
      const player = playerIndex[name]
      if (player && !seen.has(player.id)) {
        seen.add(player.id)
        players.push({ name, ...player })
      }
    }
  }
  return players
}

function ConfidenceBadge({ level }) {
  const color = level === 'high' ? 'text-green-400 bg-green-400/10 border-green-400/20'
    : level === 'medium' ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
    : 'text-content-muted bg-bg-border border-bg-border'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${color}`}>
      {level || 'unknown'}
    </span>
  )
}

function PlayInningBadge({ halfInning, inning, away, home }) {
  const isTop = halfInning === 'top'
  const battingTeam = isTop ? away : home
  const arrow = isTop ? '▲' : '▼'

  return (
    <div className="shrink-0 flex flex-col items-center gap-1 w-10">
      <img
        src={`https://www.mlbstatic.com/team-logos/${battingTeam?.id}.svg`}
        alt={battingTeam?.abbreviation || ''}
        className="w-6 h-6 object-contain"
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
      <span className="text-[10px] text-content-muted font-medium leading-none">
        {arrow}{inning}
      </span>
    </div>
  )
}

function LineScore({ linescore, away, home, currentInning, isLive }) {
  const innings = linescore?.innings || []
  const totals  = linescore?.totals  || {}
  if (!innings.length) return null

  const awayName = away?.abbreviation || 'Away'
  const homeName = home?.abbreviation || 'Home'

  const cell = (val, inningNum) => {
    const scored  = val != null && val > 0
    const current = isLive && inningNum === currentInning
    return (
      <td
        key={inningNum}
        className={[
          'w-7 text-center font-mono text-xs py-1.5 px-0.5',
          scored  ? 'text-content-primary font-semibold' : 'text-content-muted',
          current ? 'bg-brand/10 rounded' : '',
        ].join(' ')}
      >
        {val ?? '·'}
      </td>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full min-w-max border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="w-10 text-left pr-3 py-2 text-content-muted font-semibold text-[11px] uppercase tracking-[0.08em]" />
            {innings.map(inn => (
              <th key={inn.num} className="w-7 text-center text-[11px] text-content-muted font-semibold py-2 px-0.5 uppercase tracking-[0.08em]">
                {inn.num}
              </th>
            ))}
            <th className="w-2 text-center text-[11px] text-content-muted font-semibold py-2 px-1" />
            {['R','H','E'].map(h => (
              <th key={h} className="w-7 text-center text-[11px] text-content-muted font-semibold py-2 px-0.5 uppercase tracking-[0.08em]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Away row */}
          <tr className="border-t border-bg-border">
            <td className="text-left pr-3 py-3 font-semibold text-content-primary text-[12px] whitespace-nowrap">{awayName}</td>
            {innings.map(inn => cell(inn.away, inn.num))}
            <td className="px-1 text-content-muted/30 text-center" />
            <td className="w-7 text-center font-mono text-xs py-3 px-0.5 text-content-primary font-bold">{totals.away?.r ?? '–'}</td>
            <td className="w-7 text-center font-mono text-xs py-3 px-0.5 text-content-muted">{totals.away?.h ?? '–'}</td>
            <td className="w-7 text-center font-mono text-xs py-3 px-0.5 text-content-muted">{totals.away?.e ?? '–'}</td>
          </tr>
          {/* Home row */}
          <tr className="border-t border-bg-border">
            <td className="text-left pr-3 py-3 font-semibold text-content-primary text-[12px] whitespace-nowrap">{homeName}</td>
            {innings.map(inn => cell(inn.home, inn.num))}
            <td className="px-1 text-content-muted/30 text-center" />
            <td className="w-7 text-center font-mono text-xs py-3 px-0.5 text-content-primary font-bold">{totals.home?.r ?? '–'}</td>
            <td className="w-7 text-center font-mono text-xs py-3 px-0.5 text-content-muted">{totals.home?.h ?? '–'}</td>
            <td className="w-7 text-center font-mono text-xs py-3 px-0.5 text-content-muted">{totals.home?.e ?? '–'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function PlayByPlay({ gamePk, isLive, away, home }) {
  const { data, isLoading } = useQuery({
    queryKey: ['game-plays', gamePk],
    queryFn: () => api.games.plays(gamePk),
    enabled: Boolean(gamePk),
    staleTime: 30_000,
    refetchInterval: isLive ? 30_000 : false,
  })

  const scoring = data?.scoringPlays ?? []
  const other = data?.otherPlays ?? []
  const [showAllPlays, setShowAllPlays] = useState(false)
  const allPlaysId = `all-plays-${gamePk}`

  if (isLoading) {
    return (
      <section className="card p-5 space-y-3">
        <h2 className="text-[18px] font-semibold text-content-primary">Play by Play</h2>
        <div className="text-sm text-content-muted">Loading plays...</div>
      </section>
    )
  }

  if (!scoring.length && !other.length) return null

  return (
    <section className="card p-5 space-y-5">
      <h2 className="text-[18px] font-semibold text-content-primary">Play by Play</h2>

      {scoring.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">Scoring Plays</h3>
          <div className="space-y-1.5">
            {scoring.map((play, idx) => (
              <div key={idx} className="flex items-start gap-3 rounded-lg bg-amber-400/5 border border-amber-400/20 px-3 py-2.5">
                <PlayInningBadge halfInning={play.halfInning} inning={play.inning} away={away} home={home} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <PlayerLink playerId={play.batter?.id} name={play.batter?.name} imageClassName="w-6 h-6" textClassName="text-xs font-semibold" />
                    {play.rbi > 0 && (
                      <span className="text-xs font-medium text-amber-400">{play.rbi} RBI</span>
                    )}
                    <span className="text-xs text-content-muted">{play.event}</span>
                    {play.awayScore != null && (
                      <span className="text-xs font-mono text-content-muted ml-auto shrink-0">
                        {play.awayScore}–{play.homeScore}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-content-secondary leading-relaxed">{play.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {other.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted">All Plays</h3>
            <button
              type="button"
              className="text-xs font-medium text-brand-light hover:underline"
              onClick={() => setShowAllPlays((current) => !current)}
              aria-expanded={showAllPlays}
              aria-controls={allPlaysId}
            >
              {showAllPlays ? 'Hide all plays' : `Show all plays (${other.length})`}
            </button>
          </div>

          {showAllPlays && (
            <div id={allPlaysId} className="divide-y divide-bg-border">
              {other.map((play, idx) => (
                <div key={idx} className="flex items-start gap-3 py-2.5">
                  <PlayInningBadge halfInning={play.halfInning} inning={play.inning} away={away} home={home} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <PlayerLink playerId={play.batter?.id} name={play.batter?.name} imageClassName="w-5 h-5" textClassName="text-xs font-medium" />
                    <p className="text-xs text-content-muted leading-relaxed">
                      <span className="text-content-secondary font-medium">{play.event}</span>
                      {' · '}
                      {play.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function MetricRow({ label, statKey, away, home, formatValue = fmtRate }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-bg-border last:border-b-0">
      <div className="text-sm text-content-secondary flex items-center gap-1.5">
        <span>{label}</span>
        <StatHelpTooltip stat={statKey || label} />
      </div>
      <div className="text-sm text-content-primary text-right font-medium">{formatValue(away)}</div>
      <div className="text-sm text-content-primary text-right font-medium">{formatValue(home)}</div>
    </div>
  )
}

function HeaderStat({ label, statKey }) {
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span>{label}</span>
      <StatHelpTooltip stat={statKey || label} />
    </span>
  )
}

function BasesIndicator({ bases = {} }) {
  function Base({ on }) {
    return (
      <span className={`w-2.5 h-2.5 rotate-45 border ${on ? 'bg-brand border-brand' : 'bg-bg-base border-bg-border'}`} />
    )
  }

  return (
    <span className="inline-grid grid-cols-3 grid-rows-3 gap-1 items-center">
      <span />
      <Base on={Boolean(bases.second)} />
      <span />
      <Base on={Boolean(bases.third)} />
      <span />
      <Base on={Boolean(bases.first)} />
      <span />
      <span />
      <span />
    </span>
  )
}

function HeaderMiniBoxscore({ away, home, totals }) {
  const awayTotals = totals?.away || {}
  const homeTotals = totals?.home || {}

  return (
    <div className="rounded-lg border border-bg-border bg-bg-elevated p-3 min-w-[240px]">
      <div className="text-[11px] uppercase tracking-wider text-content-muted mb-2">Box Score</div>
      <div className="grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] gap-2 text-[11px] text-content-muted border-b border-bg-border pb-1 mb-1">
        <div>Team</div>
        <div className="text-right">R</div>
        <div className="text-right">H</div>
        <div className="text-right">E</div>
        <div className="text-right">LOB</div>
      </div>

      <div className="space-y-1 text-sm">
        <div className="grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] gap-2 items-center">
          <div className="text-content-primary">
            <TeamLink teamId={away.id} label={away.abbreviation || away.name || 'Away'} iconClassName="w-4 h-4" />
          </div>
          <div className="text-right font-mono text-content-secondary">{awayTotals.runs ?? '-'}</div>
          <div className="text-right font-mono text-content-secondary">{awayTotals.hits ?? '-'}</div>
          <div className="text-right font-mono text-content-secondary">{awayTotals.errors ?? '-'}</div>
          <div className="text-right font-mono text-content-secondary">{awayTotals.leftOnBase ?? '-'}</div>
        </div>

        <div className="grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] gap-2 items-center">
          <div className="text-content-primary">
            <TeamLink teamId={home.id} label={home.abbreviation || home.name || 'Home'} iconClassName="w-4 h-4" />
          </div>
          <div className="text-right font-mono text-content-secondary">{homeTotals.runs ?? '-'}</div>
          <div className="text-right font-mono text-content-secondary">{homeTotals.hits ?? '-'}</div>
          <div className="text-right font-mono text-content-secondary">{homeTotals.errors ?? '-'}</div>
          <div className="text-right font-mono text-content-secondary">{homeTotals.leftOnBase ?? '-'}</div>
        </div>
      </div>
    </div>
  )
}

function TeamHitters({ label, teamId, hitters = [] }) {
  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-content-primary mb-3">
        <TeamLink teamId={teamId} label={label} iconClassName="w-5 h-5" />
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-content-muted border-b border-bg-border">
              <th className="text-left py-2">Player</th>
              <th className="text-right py-2">PA</th>
              <th className="text-right py-2"><HeaderStat label="wOBA" /></th>
              <th className="text-right py-2"><HeaderStat label="K-BB%" /></th>
              <th className="text-right py-2"><HeaderStat label="xwOBA" /></th>
              <th className="text-right py-2"><HeaderStat label="HardHit%" /></th>
            </tr>
          </thead>
          <tbody>
            {hitters.map((h) => (
              <tr key={h.playerId} className="border-b border-bg-border/70 last:border-b-0">
                <td className="py-2">
                  <PlayerLink playerId={h.playerId} name={h.playerName} imageClassName="w-5 h-5" />
                </td>
                <td className="py-2 text-right">{h.pa}</td>
                <td className="py-2 text-right">{fmtRate(h.woba)}</td>
                <td className="py-2 text-right">{fmtPct(h.kMinusBbPct)}</td>
                <td className="py-2 text-right">{fmtRate(h.xwoba)}</td>
                <td className="py-2 text-right">{fmtPct(h.hardHitPct)}</td>
              </tr>
            ))}
            {hitters.length === 0 && (
              <tr>
                <td className="py-3 text-content-muted" colSpan={6}>No hitter data yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TeamPitching({ label, teamId, pitchers = [] }) {
  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-content-primary mb-3">
        <TeamLink teamId={teamId} label={label} iconClassName="w-5 h-5" />
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-content-muted border-b border-bg-border">
              <th className="text-left py-2">Pitcher</th>
              <th className="text-right py-2">Role</th>
              <th className="text-right py-2">IP</th>
              <th className="text-right py-2"><HeaderStat label="FIP" /></th>
              <th className="text-right py-2"><HeaderStat label="K-BB%" /></th>
              <th className="text-right py-2"><HeaderStat label="CSW%" /></th>
              <th className="text-right py-2"><HeaderStat label="GB%" /></th>
            </tr>
          </thead>
          <tbody>
            {pitchers.map((p) => (
              <tr key={p.playerId} className="border-b border-bg-border/70 last:border-b-0">
                <td className="py-2">
                  <PlayerLink playerId={p.playerId} name={p.playerName} imageClassName="w-5 h-5" />
                </td>
                <td className="py-2 text-right">{p.role}</td>
                <td className="py-2 text-right">{p.inningsPitched}</td>
                <td className="py-2 text-right">{fmtRate(p.fip)}</td>
                <td className="py-2 text-right">{fmtPct(p.kMinusBbPct)}</td>
                <td className="py-2 text-right">{fmtPct(p.cswPct)}</td>
                <td className="py-2 text-right">{fmtPct(p.gbPct)}</td>
              </tr>
            ))}
            {pitchers.length === 0 && (
              <tr>
                <td className="py-3 text-content-muted" colSpan={7}>No pitching data yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TeamBattingBoxscore({ label, teamId, rows = [] }) {
  const topScore = rows.reduce((max, r) => {
    const score = Number(r.gameScore)
    return Number.isFinite(score) ? Math.max(max, score) : max
  }, -Infinity)

  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-content-primary mb-3">
        <TeamLink teamId={teamId} label={label} iconClassName="w-5 h-5" />
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-content-muted border-b border-bg-border">
              <th className="text-left py-2">Batter</th>
              <th className="text-right py-2">PA</th>
              <th className="text-right py-2">AB</th>
              <th className="text-right py-2">R</th>
              <th className="text-right py-2">H</th>
              <th className="text-right py-2">RBI</th>
              <th className="text-right py-2">BB</th>
              <th className="text-right py-2">K</th>
              <th className="text-right py-2">HR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.playerId} className="border-b border-bg-border/70 last:border-b-0">
                <td className="py-2">
                  <div className="inline-flex items-center gap-1.5">
                    <PlayerLink playerId={r.playerId} name={r.playerName} imageClassName="w-5 h-5" />
                    {Number.isFinite(topScore) && r.gameScore === topScore && (
                      <span className="text-amber-400" title="Top performer by game score">★</span>
                    )}
                  </div>
                </td>
                <td className="py-2 text-right font-mono">{r.pa ?? '-'}</td>
                <td className="py-2 text-right font-mono">{r.ab ?? '-'}</td>
                <td className="py-2 text-right font-mono">{r.runs ?? '-'}</td>
                <td className="py-2 text-right font-mono">{r.hits ?? '-'}</td>
                <td className="py-2 text-right font-mono">{r.rbi ?? '-'}</td>
                <td className="py-2 text-right font-mono">{r.walks ?? '-'}</td>
                <td className="py-2 text-right font-mono">{r.strikeOuts ?? '-'}</td>
                <td className="py-2 text-right font-mono">{r.homeRuns ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TeamPitchingBoxscore({ label, teamId, rows = [] }) {
  const topScore = rows.reduce((max, r) => {
    const score = Number(r.gameScore)
    return Number.isFinite(score) ? Math.max(max, score) : max
  }, -Infinity)

  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-content-primary mb-3">
        <TeamLink teamId={teamId} label={label} iconClassName="w-5 h-5" />
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-content-muted border-b border-bg-border">
              <th className="text-left py-2">Pitcher</th>
              <th className="text-right py-2">Role</th>
              <th className="text-right py-2">IP</th>
              <th className="text-right py-2">H</th>
              <th className="text-right py-2">ER</th>
              <th className="text-right py-2">BB</th>
              <th className="text-right py-2">K</th>
              <th className="text-right py-2">HR</th>
              <th className="text-right py-2">ERA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.playerId} className="border-b border-bg-border/70 last:border-b-0">
                <td className="py-2">
                  <div className="inline-flex items-center gap-1.5">
                    <PlayerLink playerId={r.playerId} name={r.playerName} imageClassName="w-5 h-5" />
                    {Number.isFinite(topScore) && r.gameScore === topScore && (
                      <span className="text-amber-400" title="Top performer by game score">★</span>
                    )}
                  </div>
                </td>
                <td className="py-2 text-right font-mono">{r.role ?? '-'}</td>
                <td className="py-2 text-right font-mono">{r.inningsPitched ?? '-'}</td>
                <td className="py-2 text-right font-mono">{r.hits ?? '-'}</td>
                <td className="py-2 text-right font-mono">{r.earnedRuns ?? '-'}</td>
                <td className="py-2 text-right font-mono">{r.walks ?? '-'}</td>
                <td className="py-2 text-right font-mono">{r.strikeOuts ?? '-'}</td>
                <td className="py-2 text-right font-mono">{r.homeRuns ?? '-'}</td>
                <td className="py-2 text-right font-mono">{fmtRate(r.era)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function GameDetails() {
  const { gamePk } = useParams()
  const { data, isLoading, error } = useQuery({
    queryKey: ['game-details', gamePk],
    queryFn: () => api.games.details(gamePk),
    enabled: Boolean(gamePk),
  })

  const {
    data: insightsData,
    isLoading: loadingInsights,
    error: insightsError,
  } = useQuery({
    queryKey: ['game-insights', gamePk],
    queryFn: () => api.games.insights(gamePk),
    enabled: Boolean(gamePk),
    staleTime: 10 * 60 * 1000,
  })

  const {
    data: picksData,
    isLoading: loadingPicks,
    error: picksError,
  } = useQuery({
    queryKey: ['game-picks', gamePk],
    queryFn: () => api.games.picks(gamePk),
    enabled: Boolean(gamePk) && data?.abstractState !== 'Final',
    staleTime: 60_000,
  })

  const { data: winProbData } = useQuery({
    queryKey: ['win-probability', gamePk],
    queryFn: () => api.games.winProbability(gamePk),
    enabled: Boolean(gamePk) && data?.abstractState !== 'Preview',
    staleTime: 60_000,
  })

  const gameDate = data?.gameDate ? data.gameDate.split('T')[0] : null
  const { data: oddsData } = useQuery({
    queryKey: ['game-odds', gameDate],
    queryFn: () => api.odds.today(gameDate),
    enabled: Boolean(gameDate) && data?.abstractState !== 'Final',
    staleTime: 5 * 60_000,
  })

  const gameOdds = useMemo(() => {
    const awayName = data?.teams?.away?.name
    const homeName = data?.teams?.home?.name
    if (!oddsData?.games || !awayName || !homeName) return null
    return oddsData.games.find(
      (o) => o.home_team === homeName && o.away_team === awayName
    )?.odds_data || null
  }, [oddsData, data?.teams?.away?.name, data?.teams?.home?.name])

  const adv = data?.advanced || {}
  const boxscore = data?.boxscore || {}

  const playerIndex = useMemo(() => {
    const byName = {}
    const awayTeam = data?.teams?.away || {}
    const homeTeam = data?.teams?.home || {}

    const addPlayers = (players, team) => {
      players.forEach((player) => {
        const name = player?.playerName
        const id = player?.playerId
        if (name && id) byName[name] = { id, teamId: team.id, teamAbbr: team.abbreviation }
      })
    }

    addPlayers(adv.hitters?.away || [], awayTeam)
    addPlayers(adv.hitters?.home || [], homeTeam)
    addPlayers(adv.pitching?.away || [], awayTeam)
    addPlayers(adv.pitching?.home || [], homeTeam)
    addPlayers(boxscore.batting?.away || [], awayTeam)
    addPlayers(boxscore.batting?.home || [], homeTeam)
    addPlayers(boxscore.pitching?.away || [], awayTeam)
    addPlayers(boxscore.pitching?.home || [], homeTeam)

    return byName
  }, [adv, boxscore, data?.teams?.away, data?.teams?.home])

  if (isLoading) {
    return <div className="card p-8 text-content-muted">Loading game details...</div>
  }

  if (error) {
    return (
      <div className="card p-8 text-content-muted">
        Failed to load game details. {error.message}
      </div>
    )
  }

  const away = data?.teams?.away || {}
  const home = data?.teams?.home || {}
  const teamBatting = adv.teamBatting || {}
  const edges = adv.edges || {}
  const insights = insightsData?.insights || {}
  const context = data?.gameContext || {}
  const isLive = data?.abstractState === 'Live' || data?.abstractState === 'Preview'
  const isPreview = data?.abstractState === 'Preview'
  const count = context.count || {}
  const ballparkImage = ballparkImageForVenue(data?.venue)

  let gameDateLabel = '-'
  try {
    gameDateLabel = format(parseISO(data.gameDate), 'MMM d, yyyy h:mm a')
  } catch {}

  return (
    <div className="space-y-10 py-10">
      <div className="flex items-center justify-between">
        <Link className="text-sm text-brand-light hover:underline" to="/">Back to schedule</Link>
        <span className="text-xs text-content-muted">Game #{data.gamePk}</span>
      </div>

      <MlbWatchFrame gamePk={data.gamePk} />

      <section className="card-raised overflow-hidden">
        <div className="relative overflow-hidden">
          {ballparkImage && (
            <div aria-hidden="true" className="absolute inset-0">
              <img
                src={ballparkImage}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover opacity-45 transition-all duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-bg-surface/82 via-bg-surface/38 to-bg-surface/86" />
              <div className="absolute inset-0 bg-gradient-to-r from-bg-surface/78 via-transparent to-bg-surface/78" />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-bg-surface" />
            </div>
          )}

          <div className="relative z-10 p-5 pb-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-content-primary">
                  <TeamLink teamId={away.id} label={away.abbreviation || away.name} iconClassName="w-6 h-6" />
                  <span className="mx-3">
                    {isPreview ? 'vs' : `${away.score ?? '-'} - ${home.score ?? '-'}`}
                  </span>
                  <TeamLink teamId={home.id} label={home.abbreviation || home.name} iconClassName="w-6 h-6" />
                </h1>
                <p className="text-sm text-content-primary mt-1">{data.status} - {gameDateLabel}</p>
                <p className="text-xs text-content-secondary mt-1">{data.venue || 'Venue TBD'}</p>

                {(isLive || isPreview) && (
                  <div className="mt-3 rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 space-y-1.5">
                    {isLive && (
                      <>
                        <div className="text-xs text-content-secondary inline-flex items-center gap-2 flex-wrap">
                          <span>{context.inningHalf || ''} {context.currentInning || '-'}</span>
                          <span>· {count.balls ?? '-'}-{count.strikes ?? '-'} · {count.outs ?? '-'} out{Number(count.outs) === 1 ? '' : 's'}</span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-content-muted">Bases</span>
                            <BasesIndicator bases={context.bases} />
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="text-content-muted">At bat:</span>
                          <PlayerLink playerId={context.matchup?.atBat?.id} name={context.matchup?.atBat?.name || 'Unknown'} imageClassName="w-4 h-4" textClassName="text-xs" />
                          <span className="text-content-muted">Pitching:</span>
                          <PlayerLink playerId={context.matchup?.pitcher?.id} name={context.matchup?.pitcher?.name || 'Unknown'} imageClassName="w-4 h-4" textClassName="text-xs" />
                        </div>
                      </>
                    )}

                    {isPreview && (
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className="text-content-muted">Probable:</span>
                        <PlayerLink playerId={context.probablePitchers?.away?.id} name={context.probablePitchers?.away?.name || 'TBD'} imageClassName="w-4 h-4" textClassName="text-xs" />
                        <span className="text-content-muted">vs</span>
                        <PlayerLink playerId={context.probablePitchers?.home?.id} name={context.probablePitchers?.home?.name || 'TBD'} imageClassName="w-4 h-4" textClassName="text-xs" />
            </div>
          )}

          {gameOdds && !gameOdds.moneyline && gameOdds.over_under == null && gameOdds.spread == null && (
            <div className="rounded-lg border border-dashed border-bg-border bg-bg-elevated/50 px-3 py-3 text-center text-xs text-content-muted italic">
              No betting lines available yet
            </div>
          )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {!isPreview && (
          <div className="px-5 pb-5 pt-4 border-t border-bg-border">
            <LineScore
              linescore={data?.linescore}
              away={away}
              home={home}
              currentInning={context.currentInning}
              isLive={isLive}
            />
          </div>
        )}
      </section>

      {!isPreview && (
        <FactoidsPanel
          queryKey={['game-factoids', data.gamePk]}
          queryFn={() => api.games.factoids(data.gamePk)}
          scrollable={false}
        />
      )}

      <PlayByPlay gamePk={data.gamePk} isLive={isLive} away={away} home={home} />

      <section className="card p-5">
        <h2 className="text-[18px] font-semibold text-content-primary mb-3">Team Snapshot</h2>
        <div className="grid grid-cols-3 gap-3 text-xs uppercase tracking-wider text-content-muted pb-2 border-b border-bg-border">
          <div>Metric</div>
          <div className="text-right inline-flex items-center justify-end gap-1.5">
            <TeamLink teamId={away.id} label={away.abbreviation || 'Away'} iconClassName="w-4 h-4" />
          </div>
          <div className="text-right inline-flex items-center justify-end gap-1.5">
            <TeamLink teamId={home.id} label={home.abbreviation || 'Home'} iconClassName="w-4 h-4" />
          </div>
        </div>
        <MetricRow label="wOBA" away={teamBatting.away?.woba} home={teamBatting.home?.woba} formatValue={fmtRate} />
        <MetricRow label="K%" away={teamBatting.away?.kPct} home={teamBatting.home?.kPct} formatValue={fmtPct} />
        <MetricRow label="BB%" away={teamBatting.away?.bbPct} home={teamBatting.home?.bbPct} formatValue={fmtPct} />
        <MetricRow label="K-BB%" away={teamBatting.away?.kMinusBbPct} home={teamBatting.home?.kMinusBbPct} formatValue={fmtPct} />
        <MetricRow label="BABIP" away={teamBatting.away?.babip} home={teamBatting.home?.babip} formatValue={fmtRate} />

        <div className="mt-4 pt-4 border-t border-bg-border grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg bg-bg-elevated p-3">
            <div className="text-xs uppercase tracking-wider text-content-muted inline-flex items-center gap-1.5">
              <span>Discipline Edge</span>
              <StatHelpTooltip stat="Discipline Edge" />
            </div>
            <div className="text-lg font-semibold text-content-primary mt-1">{fmtPct(edges.discipline?.home)}</div>
            <div className="text-xs text-content-muted">Positive favors {home.abbreviation || 'home'}</div>
          </div>
          <div className="rounded-lg bg-bg-elevated p-3">
            <div className="text-xs uppercase tracking-wider text-content-muted inline-flex items-center gap-1.5">
              <span>Run Prevention Edge</span>
              <StatHelpTooltip stat="Run Prevention Edge" />
            </div>
            <div className="text-lg font-semibold text-content-primary mt-1">{fmtRate(edges.runPrevention?.home)}</div>
            <div className="text-xs text-content-muted">Positive favors {home.abbreviation || 'home'}</div>
          </div>
          <div className="rounded-lg bg-bg-elevated p-3">
            <div className="text-xs uppercase tracking-wider text-content-muted inline-flex items-center gap-1.5">
              <span>Contact Quality Edge</span>
              <StatHelpTooltip stat="Contact Quality Edge" />
            </div>
            <div className="text-lg font-semibold text-content-primary mt-1">{fmtPct(edges.contactQuality?.home)}</div>
            <div className="text-xs text-content-muted">Statcast pending</div>
          </div>
        </div>
      </section>

      <section className="card p-5 space-y-4">
        <h2 className="text-[18px] font-semibold text-content-primary">General Boxscore</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-content-muted border-b border-bg-border">
                <th className="text-left py-2">Team</th>
                <th className="text-right py-2">R</th>
                <th className="text-right py-2">H</th>
                <th className="text-right py-2">E</th>
                <th className="text-right py-2">LOB</th>
              </tr>
            </thead>
            <tbody>
              {[
                { team: away, totals: boxscore.teamTotals?.away },
                { team: home, totals: boxscore.teamTotals?.home },
              ].map(({ team, totals }) => (
                <tr key={team.id} className="border-b border-bg-border/70 last:border-b-0">
                  <td className="py-2 text-content-primary font-medium">
                    <TeamLink teamId={team.id} label={team.abbreviation || team.name} iconClassName="w-4 h-4" />
                  </td>
                  <td className="py-2 text-right font-mono">{totals?.runs ?? '-'}</td>
                  <td className="py-2 text-right font-mono">{totals?.hits ?? '-'}</td>
                  <td className="py-2 text-right font-mono">{totals?.errors ?? '-'}</td>
                  <td className="py-2 text-right font-mono">{totals?.leftOnBase ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {Array.isArray(winProbData) && winProbData.length > 0 && (
        <section className="card p-5">
          <h2 className="text-[18px] font-semibold text-content-primary mb-4">Win Probability</h2>
          <div className="w-full overflow-hidden">
            <WinProbabilityChart
              data={winProbData}
              homeTeam={home.abbreviation || home.name}
              awayTeam={away.abbreviation || away.name}
              homeColor={home.color || '#6366F1'}
              awayColor={away.color || '#F59E0B'}
            />
          </div>
        </section>
      )}

      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-[18px] font-semibold text-content-primary shrink-0">AI Game Insights</h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <img src={`https://www.mlbstatic.com/team-logos/${away.id}.svg`} alt={away.abbreviation} className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                <span className="text-xs text-content-secondary font-medium">{away.abbreviation}</span>
              </div>
              <span className="text-xs text-content-muted">vs</span>
              <div className="flex items-center gap-1.5">
                <img src={`https://www.mlbstatic.com/team-logos/${home.id}.svg`} alt={home.abbreviation} className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                <span className="text-xs text-content-secondary font-medium">{home.abbreviation}</span>
              </div>
            </div>
          </div>
          {insightsData?.cached != null && (
            <span className="text-[11px] text-content-muted shrink-0">{insightsData.cached ? 'Cached' : 'Fresh'}</span>
          )}
        </div>

        {loadingInsights && (
          <div className="text-sm text-content-muted">Generating insights...</div>
        )}

        {insightsError && (
          <div className="text-sm text-content-muted">Insights unavailable right now. {insightsError.message}</div>
        )}

        {!loadingInsights && !insightsError && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {[
              { key: 'key_takeaways', title: 'Key Takeaways' },
              { key: 'matchup_edges', title: 'Matchup Edges' },
              { key: 'risk_flags', title: 'Risk Flags' },
              { key: 'watch_list', title: 'Watch List' },
            ].map((section) => {
              const lines = insights[section.key] || []
              const mentioned = extractMentionedPlayers(lines, playerIndex)
              return (
                <div key={section.key} className="rounded-lg bg-bg-elevated border border-bg-border p-3 flex flex-col gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted">{section.title}</h3>
                  <ul className="space-y-1.5 flex-1">
                    {lines.map((line, idx) => (
                      <li key={`${section.key}-${idx}`} className="text-sm text-content-secondary leading-relaxed">
                        <span className="font-mono text-content-muted mr-1.5">{idx + 1}.</span>
                        {linkPlayersInText(line, playerIndex)}
                      </li>
                    ))}
                  </ul>
                  {mentioned.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-bg-border">
                      {mentioned.map((player) => (
                        <PlayerLink
                          key={player.id}
                          playerId={player.id}
                          name={player.name}
                          imageClassName="w-6 h-6"
                          textClassName="text-xs"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {data?.abstractState !== 'Final' && (
      <section className="card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-semibold text-content-primary shrink-0">Picks</h2>
            {picksData?.cached != null && (
              <span className="text-[11px] text-content-muted shrink-0">{picksData.cached ? 'Cached' : 'Fresh'}</span>
            )}
          </div>

          {gameOdds && (gameOdds.moneyline || gameOdds.over_under != null || gameOdds.spread != null) && (
            <div className="grid grid-cols-3 gap-2">
              {gameOdds.moneyline && (
                <div className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2">
                  <div className="text-[9px] text-content-muted uppercase tracking-wider mb-1">Moneyline</div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="flex items-center gap-1">
                      <img src={`https://www.mlbstatic.com/team-logos/${home.id}.svg`} alt="" className="w-3 h-3 object-contain" />
                      {home?.abbreviation}
                    </span>
                    <span className="font-semibold text-content-primary">{gameOdds.home_moneyline}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="flex items-center gap-1">
                      <img src={`https://www.mlbstatic.com/team-logos/${away.id}.svg`} alt="" className="w-3 h-3 object-contain" />
                      {away?.abbreviation}
                    </span>
                    <span className="font-semibold text-content-primary">{gameOdds.away_moneyline}</span>
                  </div>
                  <div className="text-[9px] text-content-muted mt-1">{gameOdds.provider}</div>
                </div>
              )}
              {gameOdds.over_under != null && (
                <div className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2">
                  <div className="text-[9px] text-content-muted uppercase tracking-wider mb-1">Total</div>
                  <div className="text-lg font-bold font-mono text-content-primary text-center">{gameOdds.over_under}</div>
                  <div className="flex justify-between text-[10px] font-mono text-content-muted mt-1">
                    <span>O {gameOdds.over_odds ? (gameOdds.over_odds > 0 ? '+' : '') + gameOdds.over_odds.toFixed(0) : '-'}</span>
                    <span>U {gameOdds.under_odds ? (gameOdds.under_odds > 0 ? '+' : '') + gameOdds.under_odds.toFixed(0) : '-'}</span>
                  </div>
                  <div className="text-[9px] text-content-muted mt-1">{gameOdds.provider}</div>
                </div>
              )}
              {gameOdds.spread != null && (
                <div className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2">
                  <div className="text-[9px] text-content-muted uppercase tracking-wider mb-1">Spread</div>
                  <div className="flex flex-col text-xs font-mono">
                    <span className="flex items-center gap-1">
                      <img src={`https://www.mlbstatic.com/team-logos/${home.id}.svg`} alt="" className="w-3 h-3 object-contain" />
                      <span>{home?.abbreviation} {gameOdds.spread > 0 ? '+' : ''}{gameOdds.spread}</span>
                    </span>
                    <span className="flex items-center gap-1 mt-0.5">
                      <img src={`https://www.mlbstatic.com/team-logos/${away.id}.svg`} alt="" className="w-3 h-3 object-contain" />
                      <span>{away?.abbreviation} {(-gameOdds.spread) > 0 ? '+' : ''}{(-gameOdds.spread)}</span>
                    </span>
                  </div>
                  <div className="text-[9px] text-content-muted mt-1">{gameOdds.provider}</div>
                </div>
              )}
            </div>
          )}

          {loadingPicks && (
            <div className="text-sm text-content-muted">Analyzing matchup...</div>
          )}

          {picksError && (
            <div className="text-sm text-content-muted">Picks unavailable. {picksError.message}</div>
          )}

          {picksData?.picks?.moneyline && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-lg bg-bg-elevated border border-bg-border p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted">Moneyline</h3>
                  <ConfidenceBadge level={picksData.picks.moneyline.confidence} />
                </div>
                <div className="text-sm font-semibold text-content-primary">{picksData.picks.moneyline.pick}</div>
                <p className="text-xs text-content-secondary mt-1 leading-relaxed"><AutoLinkedText text={picksData.picks.moneyline.reasoning} /></p>
              </div>

              {picksData.picks.overUnder && (
                <div className="rounded-lg bg-bg-elevated border border-bg-border p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted">Over / Under</h3>
                    <ConfidenceBadge level={picksData.picks.overUnder.confidence} />
                  </div>
                  <div className="text-sm font-semibold text-content-primary">{picksData.picks.overUnder.pick}</div>
                  <p className="text-xs text-content-secondary mt-1 leading-relaxed"><AutoLinkedText text={picksData.picks.overUnder.reasoning} /></p>
                </div>
              )}

              {picksData.picks.playerProps?.length > 0 && (
                <div className="xl:col-span-2 rounded-lg bg-bg-elevated border border-bg-border p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted mb-2">Player Props</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {picksData.picks.playerProps.slice(0, 4).map((prop, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <PlayerNameLink name={prop.player} textClassName="text-sm font-medium" imageClassName="w-4 h-4" />
                          <ConfidenceBadge level={prop.confidence} />
                        </div>
                        <span className="text-xs text-brand-light font-medium">{prop.prop}</span>
                        <p className="text-xs text-content-secondary leading-relaxed"><AutoLinkedText text={prop.reasoning} /></p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {picksData?.picks?.summary && (
            <p className="text-sm text-content-secondary leading-relaxed italic"><AutoLinkedText text={picksData.picks.summary} /></p>
          )}
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold text-content-primary">Batting Boxscore</h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <TeamBattingBoxscore label={away.name || 'Away'} teamId={away.id} rows={boxscore.batting?.away || []} />
          <TeamBattingBoxscore label={home.name || 'Home'} teamId={home.id} rows={boxscore.batting?.home || []} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold text-content-primary">Pitching Boxscore</h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <TeamPitchingBoxscore label={away.name || 'Away'} teamId={away.id} rows={boxscore.pitching?.away || []} />
          <TeamPitchingBoxscore label={home.name || 'Home'} teamId={home.id} rows={boxscore.pitching?.home || []} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold text-content-primary">Hitter Impact</h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <TeamHitters label={away.name || 'Away'} teamId={away.id} hitters={adv.hitters?.away} />
          <TeamHitters label={home.name || 'Home'} teamId={home.id} hitters={adv.hitters?.home} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold text-content-primary">Pitching Quality</h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <TeamPitching label={away.name || 'Away'} teamId={away.id} pitchers={adv.pitching?.away} />
          <TeamPitching label={home.name || 'Home'} teamId={home.id} pitchers={adv.pitching?.home} />
        </div>
      </section>
    </div>
  )
}
