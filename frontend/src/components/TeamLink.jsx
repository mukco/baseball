import clsx from 'clsx'
import { Link } from 'react-router-dom'
import TeamIcon from './TeamIcon'

export default function TeamLink({
  teamId,
  label,
  className,
  iconClassName = 'w-5 h-5',
  textClassName = '',
}) {
  const content = (
    <span className={clsx('inline-flex items-center gap-1.5', className)}>
      <TeamIcon teamId={teamId} alt={label} className={iconClassName} />
      <span className={textClassName}>{label}</span>
    </span>
  )

  if (!teamId) return content

  return (
    <Link
      to={`/team/${teamId}`}
      className="hover:text-content-primary transition-colors"
    >
      {content}
    </Link>
  )
}
