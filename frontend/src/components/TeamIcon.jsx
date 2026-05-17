import clsx from 'clsx'

export default function TeamIcon({ teamId, alt = '', className = 'w-5 h-5' }) {
  if (!teamId) return null

  return (
    <img
      src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`}
      alt={alt}
      className={clsx('object-contain shrink-0', className)}
      onError={(e) => { e.currentTarget.style.display = 'none' }}
    />
  )
}
