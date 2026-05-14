import { Link } from 'react-router-dom'
import clsx from 'clsx'

function headshotUrl(id, size = 60) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_${size},q_auto:best/v1/people/${id}/headshot/67/current`
}

export default function PlayerLink({
  playerId,
  name,
  className,
  imageClassName = 'w-5 h-5',
  textClassName = '',
  stopPropagation = false,
}) {
  const content = (
    <span className={clsx('inline-flex items-center gap-2 min-w-0', className)}>
      {playerId && (
        <img
          src={headshotUrl(playerId, 60)}
          alt=""
          className={clsx('rounded-full object-cover bg-bg-border shrink-0', imageClassName)}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}
      <span className={clsx('truncate', textClassName)}>{name}</span>
    </span>
  )

  if (!playerId) return content

  return (
    <Link
      to={`/player/${playerId}`}
      className="text-brand-light hover:text-content-primary transition-colors"
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {content}
    </Link>
  )
}
