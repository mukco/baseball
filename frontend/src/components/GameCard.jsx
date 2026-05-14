import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import clsx from 'clsx'
import PlayerLink from './PlayerLink'

const STATUS_COLORS = {
  Final: 'text-content-muted',
  'In Progress': 'text-green-400',
  Scheduled: 'text-content-secondary',
  Postponed: 'text-yellow-500',
  Cancelled: 'text-red-500',
}

function TeamLogo({ teamId, name, size = 10 }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <img
        src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`}
        alt={name}
        className={`w-${size} h-${size} object-contain`}
        onError={(e) => {
          e.target.onerror = null
          e.target.style.display = 'none'
          e.target.nextSibling.style.display = 'flex'
        }}
      />
      <div
        className={`w-${size} h-${size} rounded-full bg-bg-border items-center justify-center text-xs font-bold text-content-secondary hidden`}
      >
        {name?.substring(0, 2).toUpperCase()}
      </div>
    </div>
  )
}

function ProbablePitcher({ pitcher, side }) {
  if (!pitcher) {
    return <span className="text-xs text-content-muted italic">TBD</span>
  }
  return (
    <PlayerLink
      playerId={pitcher.id}
      name={pitcher.name}
      imageClassName="w-4 h-4"
      className="max-w-[120px]"
      textClassName="text-xs"
      stopPropagation
    />
  )
}

function Score({ away, home, status }) {
  const isLive = status === 'In Progress'
  const isFinal = status === 'Final'

  if (isFinal || isLive) {
    const awayWin = (away.score ?? 0) > (home.score ?? 0)
    const homeWin = (home.score ?? 0) > (away.score ?? 0)
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-4 font-mono font-bold text-3xl">
          <span className={awayWin ? 'text-content-primary' : 'text-content-muted'}>{away.score ?? '-'}</span>
          <span className="text-content-muted text-lg">—</span>
          <span className={homeWin ? 'text-content-primary' : 'text-content-muted'}>{home.score ?? '-'}</span>
        </div>
        {isLive && (
          <div className="flex items-center gap-1 text-xs text-green-400 font-medium">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span>LIVE</span>
          </div>
        )}
        {isFinal && <span className="text-xs text-content-muted">Final</span>}
      </div>
    )
  }
  return null
}

export default function GameCard({ game }) {
  const navigate = useNavigate()
  const {
    gamePk, gameDate, status, abstractState,
    away, home, awayProbable, homeProbable,
    venue, currentInning, inningHalf,
  } = game
  const gameUrl = gamePk ? `/game/${gamePk}` : null

  let timeLabel = 'TBD'
  try {
    const dt = parseISO(gameDate)
    timeLabel = format(dt, 'h:mm a')
  } catch {}

  const statusColor = STATUS_COLORS[status] || 'text-content-secondary'
  const isPreview = abstractState === 'Preview'
  const isLive = status === 'In Progress'

  function openGame() {
    if (!gameUrl) return
    navigate(gameUrl)
  }

  function handleKeyDown(e) {
    if (!gameUrl) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openGame()
    }
  }

  return (
    <div
      className={clsx(
        'card hover:border-bg-border/80 hover:bg-bg-elevated transition-all duration-200 group',
        gameUrl && 'cursor-pointer'
      )}
      onClick={openGame}
      onKeyDown={handleKeyDown}
      role={gameUrl ? 'button' : undefined}
      tabIndex={gameUrl ? 0 : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border">
        <span className={clsx('text-xs font-semibold uppercase tracking-wider', statusColor)}>
          {isLive
            ? `${inningHalf === 'Top' ? '▲' : '▼'} ${currentInning}`
            : isPreview
              ? timeLabel
              : status}
        </span>
        {venue && <span className="text-xs text-content-muted truncate max-w-[140px]">{venue}</span>}
      </div>

      {/* Matchup body */}
      <div className="px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          {/* Away team */}
          <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
            <TeamLogo teamId={away.id} name={away.name} />
            <span className="text-sm font-semibold text-content-primary truncate">{away.abbreviation || away.name}</span>
            {away.wins != null && (
              <span className="text-[11px] text-content-muted font-mono">{away.wins}-{away.losses}</span>
            )}
          </div>

          {/* Center: score or "vs" */}
          <div className="flex flex-col items-center gap-1 shrink-0 px-2">
            {isPreview ? (
              <span className="text-content-muted text-sm font-medium">vs</span>
            ) : (
              <Score away={away} home={home} status={status} />
            )}
          </div>

          {/* Home team */}
          <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
            <TeamLogo teamId={home.id} name={home.name} />
            <span className="text-sm font-semibold text-content-primary truncate">{home.abbreviation || home.name}</span>
            {home.wins != null && (
              <span className="text-[11px] text-content-muted font-mono">{home.wins}-{home.losses}</span>
            )}
          </div>
        </div>

        {/* Probable pitchers */}
        <div className="mt-4 flex justify-between items-center border-t border-bg-border pt-3">
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-[10px] text-content-muted uppercase tracking-wider">Away SP</span>
            <ProbablePitcher pitcher={awayProbable} side="away" />
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[10px] text-content-muted uppercase tracking-wider">Home SP</span>
            <ProbablePitcher pitcher={homeProbable} side="home" />
          </div>
        </div>
      </div>
    </div>
  )
}
