import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api'

function TeamCard({ team }) {
  const record = team.wins != null ? `${team.wins}–${team.losses}` : null

  return (
    <Link
      to={`/team/${team.id}`}
      className="card p-4 flex items-center gap-3 hover:border-brand transition-colors group"
    >
      <img
        src={`https://www.mlbstatic.com/team-logos/${team.id}.svg`}
        alt={team.name}
        className="w-10 h-10 object-contain shrink-0"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
          e.currentTarget.nextSibling.style.display = 'flex'
        }}
      />
      <div
        className="w-10 h-10 rounded-full items-center justify-center shrink-0 font-bold text-white text-[10px] hidden"
        style={{ backgroundColor: team.color }}
      >
        {team.abbreviation}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-content-primary group-hover:text-brand transition-colors truncate">
          {team.name}
        </div>
        {record && (
          <div className="text-xs text-content-muted tabular-nums">{record}</div>
        )}
      </div>
      <svg className="w-4 h-4 text-content-muted group-hover:text-brand transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

function DivisionGroup({ division, teams }) {
  const sorted = [...teams].sort((a, b) => {
    if (a.wins == null) return 1
    if (b.wins == null) return -1
    return b.wins !== a.wins ? b.wins - a.wins : a.losses - b.losses
  })

  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em]">{division}</h3>
      <div className="space-y-1.5">
        {sorted.map((t) => <TeamCard key={t.id} team={t} />)}
      </div>
    </div>
  )
}

function LeagueSection({ league, teams }) {
  const byDivision = teams.reduce((acc, t) => {
    const div = t.division || 'Other'
    ;(acc[div] = acc[div] || []).push(t)
    return acc
  }, {})

  const divisionOrder = ['East', 'Central', 'West']
  const sorted = divisionOrder
    .map(d => ({ key: d, full: `${league.split(' ')[0]} League ${d}`, teams: byDivision[`${league.split(' ')[0]} League ${d}`] || [] }))
    .filter(d => d.teams.length > 0)

  return (
    <div className="space-y-6">
      <h2 className="text-[18px] font-semibold text-content-primary border-b border-bg-border pb-2">{league}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {sorted.map(({ key, full, teams: divTeams }) => (
          <DivisionGroup key={key} division={full} teams={divTeams} />
        ))}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-10">
      {[0, 1].map(l => (
        <div key={l} className="space-y-6">
          <div className="h-6 w-40 bg-bg-elevated rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[0, 1, 2].map(d => (
              <div key={d} className="space-y-2">
                <div className="h-4 w-24 bg-bg-elevated rounded animate-pulse" />
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} className="card p-4 flex items-center gap-3 animate-pulse">
                    <div className="w-11 h-11 rounded-full bg-bg-elevated shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3.5 bg-bg-elevated rounded w-3/4" />
                      <div className="h-3 bg-bg-elevated rounded w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Teams() {
  const { data: teams = [], isLoading, error } = useQuery({
    queryKey: ['teams-all'],
    queryFn: () => api.teams.all(),
    staleTime: 60 * 60 * 1000,
  })

  const al = teams.filter(t => t.league === 'American League')
  const nl = teams.filter(t => t.league === 'National League')

  return (
    <div className="space-y-10 py-10">
      <div>
        <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-content-primary">Teams</h1>
        <p className="text-sm text-content-muted mt-1">All 30 MLB clubs by division</p>
      </div>

      {error && (
        <div className="card p-8 text-center text-content-muted text-sm">
          Failed to load teams: {error.message}
        </div>
      )}

      {isLoading ? <Skeleton /> : (
        <div className="space-y-12">
          {al.length > 0 && <LeagueSection league="American League" teams={al} />}
          {nl.length > 0 && <LeagueSection league="National League" teams={nl} />}
        </div>
      )}
    </div>
  )
}
