import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import clsx from 'clsx'

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
    <Link
      to={`/player/${pitcher.id}`}
      className="text-xs text-content-secondary hover:text-brand-light transition-colors truncate max-w-[100px]"
      onClick={(e) => e.stopPropagation()}
    >
      {pitcher.name}
    </Link>
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
  const {
    gamePk, gameDate, status, abstractState,
    away, home, awayProbable, homeProbable,
    venue, currentInning, inningHalf,
  } = game

  let timeLabel = 'TBD'
  try {
    const dt = parseISO(gameDate)
    timeLabel = format(dt, 'h:mm a')
  } catch {}

  const statusColor = STATUS_COLORS[status] || 'text-content-secondary'
  const isPreview = abstractState === 'Preview'
  const isLive = status === 'In Progress'

  return (
    <div className="card hover:border-bg-border/80 hover:bg-bg-elevated transition-all duration-200 cursor-default group">
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
          <div className="flex flex-col items-center gap-2 min-w-0 flex-1">
            <TeamLogo teamId={away.id} name={away.name} />
            <span className="text-sm font-semibold text-content-primary truncate">{away.abbreviation || away.name}</span>
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
          <div className="flex flex-col items-center gap-2 min-w-0 flex-1">
            <TeamLogo teamId={home.id} name={home.name} />
            <span className="text-sm font-semibold text-content-primary truncate">{home.abbreviation || home.name}</span>
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
