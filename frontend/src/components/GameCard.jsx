import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import clsx from 'clsx'
import PlayerLink from './PlayerLink'
import { ballparkImageForVenue } from '../lib/ballparkImages'

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

function ProbablePitcher({ pitcher }) {
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
        <div className="flex items-center gap-3 font-mono tabular-nums text-[30px] leading-none">
          <span className={awayWin ? 'text-content-primary font-bold' : 'text-content-muted font-semibold'}>{away.score ?? '–'}</span>
          <span className="text-content-muted text-base">–</span>
          <span className={homeWin ? 'text-content-primary font-bold' : 'text-content-muted font-semibold'}>{home.score ?? '–'}</span>
        </div>
      </div>
    )
  }
  return null
}

function StatusPill({ status, isLive, isPreview, currentInning, inningHalf, timeLabel }) {
  if (isLive) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[10px] font-semibold uppercase tracking-wider">
        <span className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" />
        {inningHalf === 'Top' ? '▲' : '▼'} {currentInning}
      </span>
    )
  }
  if (isPreview) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-bg-elevated text-content-secondary text-[10px] font-semibold uppercase tracking-wider">
        {timeLabel}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-bg-elevated text-content-muted text-[10px] font-semibold uppercase tracking-wider">
      {status}
    </span>
  )
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

  const isPreview = abstractState === 'Preview'
  const isLive = status === 'In Progress'

  const ballparkImage = venue ? ballparkImageForVenue(venue) : null

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
        'card relative overflow-hidden transition-all duration-200 group',
        gameUrl && 'cursor-pointer hover:shadow-md'
      )}
      onClick={openGame}
      onKeyDown={handleKeyDown}
      role={gameUrl ? 'button' : undefined}
      tabIndex={gameUrl ? 0 : undefined}
    >
      {/* Ballpark background */}
      {ballparkImage && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${ballparkImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Full-card scrim keeps the image continuous while preserving legibility. */}
          <div className="absolute inset-0 bg-gradient-to-b from-bg-base/60 via-bg-base/75 to-bg-base/95" />
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-3 pb-2">
        <StatusPill
          status={status}
          isLive={isLive}
          isPreview={isPreview}
          currentInning={currentInning}
          inningHalf={inningHalf}
          timeLabel={timeLabel}
        />
        {isLive && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); window.open(`https://www.mlb.com/tv/g${gamePk}`, '_blank') }}
            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
          >
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
            Watch
          </button>
        )}
        <div className="flex-1" />
        {venue && <span className="text-[11px] text-content-muted truncate max-w-[140px]">{venue}</span>}
      </div>

      {/* Matchup body */}
      <div className="relative z-10 px-4 pt-3 pb-5">
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
      </div>

      <div className="relative z-10 px-4 pb-4">
        {/* Probable pitchers */}
        <div className="mt-1 flex justify-between items-center border-t border-bg-border pt-3">
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-[10px] text-content-muted uppercase tracking-[0.08em] font-semibold">Away SP</span>
            <ProbablePitcher pitcher={awayProbable} />
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[10px] text-content-muted uppercase tracking-[0.08em] font-semibold">Home SP</span>
            <ProbablePitcher pitcher={homeProbable} />
          </div>
        </div>
      </div>
    </div>
  )
}
