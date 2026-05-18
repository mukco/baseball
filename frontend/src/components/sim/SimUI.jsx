import { useState } from 'react'

export function teamLogoUrl(teamId) {
  return teamId ? `https://www.mlbstatic.com/team-logos/${teamId}.svg` : null
}

export function playerHeadshotUrl(playerId) {
  return playerId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_100,q_auto:best/v1/people/${playerId}/headshot/67/current`
    : null
}

export function TeamLogo({ teamId, abbr, color, size = 24, className = '' }) {
  const [err, setErr] = useState(false)
  if (err || !teamId) {
    return (
      <span
        className={`flex items-center justify-center rounded-full font-black text-white shrink-0 ${className}`}
        style={{ width: size, height: size, background: color || '#555', fontSize: size * 0.35 }}
      >
        {(abbr || '?').slice(0, 2)}
      </span>
    )
  }
  return (
    <img
      src={teamLogoUrl(teamId)}
      alt={abbr}
      onError={() => setErr(true)}
      className={`object-contain shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

// Merges PlayerChip (showName=true), PlayerAvatar, and PlayerHeadshot into one component.
export function SimPlayerAvatar({ playerId, name, size = 28, showName = false, className = '' }) {
  const [err, setErr] = useState(false)
  const initials = name ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'

  const avatar = (!err && playerId) ? (
    <img
      src={playerHeadshotUrl(playerId)}
      alt={name}
      onError={() => setErr(true)}
      className={`object-cover rounded-full shrink-0 border border-bg-border ${className}`}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className={`flex items-center justify-center rounded-full bg-bg-elevated border border-bg-border font-bold text-content-muted shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  )

  if (!showName) return avatar
  return (
    <div className="flex items-center gap-1.5">
      {avatar}
      {name && <span className="text-xs text-content-secondary">{name}</span>}
    </div>
  )
}

export function SimBadge() {
  return (
    <span className="text-[9px] font-black uppercase tracking-widest bg-brand/15 text-brand border border-brand/25 px-2 py-0.5 rounded-full shrink-0">
      SIM
    </span>
  )
}

export function SimSpinner({ className = 'py-16', message }) {
  return (
    <div className={`flex items-center justify-center gap-3 text-content-muted ${className}`}>
      <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      {message && <span>{message}</span>}
    </div>
  )
}

export function StatGrid({ stats, valueClass = 'text-content-primary', className = '' }) {
  return (
    <div className={`grid grid-cols-5 sm:grid-cols-9 gap-3 ${className}`}>
      {stats.map(({ label, val }) => (
        <div key={label} className="text-center">
          <div className={`text-xl font-black font-mono tabular-nums ${valueClass}`}>{val ?? '—'}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-content-muted mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  )
}
