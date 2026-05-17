import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api'

const WILD_CARD_SPOTS = 3

function teamSortVal(team, key) {
  switch (key) {
    case 'team': return team.teamAbbr || ''
    case 'wins': return team.wins ?? 0
    case 'losses': return team.losses ?? 0
    case 'pct': return parseFloat(team.pct) || 0
    case 'gb': {
      const v = team.gamesBack
      return !v || v === '-' || v === '0' || v === 0 ? 0 : parseFloat(v) || 0
    }
    case 'wcGb': {
      const v = team.wildCardGamesBack
      return !v || v === '-' || v === '0' || v === 0 ? 0 : parseFloat(v) || 0
    }
    case 'streak': {
      const s = team.streak || ''
      const n = parseInt(s.slice(1)) || 0
      return s.startsWith('W') ? n : -n
    }
    case 'lastTen': {
      const m = (team.lastTen || '').match(/^(\d+)-\d+$/)
      return m ? parseInt(m[1]) : 0
    }
    default: return 0
  }
}

function sortTeams(teams, sort) {
  if (!sort.key) return teams
  return [...teams].sort((a, b) => {
    const av = teamSortVal(a, sort.key)
    const bv = teamSortVal(b, sort.key)
    if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sort.dir === 'asc' ? av - bv : bv - av
  })
}

function SortHeader({ label, sortKey, sort, onSort, className }) {
  const active = sort.key === sortKey
  return (
    <th
      className={`cursor-pointer select-none hover:text-content-primary transition-colors ${active ? 'text-content-primary' : ''} ${className}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span className="ml-0.5 opacity-50 text-[9px]">
        {active ? (sort.dir === 'desc' ? '▼' : '▲') : '⇅'}
      </span>
    </th>
  )
}

function useSort() {
  const [sort, setSort] = useState({ key: null, dir: 'desc' })
  function toggle(key) {
    setSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }))
  }
  return { sort, toggle }
}

function TeamRow({ team, showWcGb = false }) {
  const gb = showWcGb ? team.wildCardGamesBack : team.gamesBack
  const gbDisplay = !gb || gb === '-' || gb === '0' || gb === 0 ? '—' : gb

  const streakCode = team.streak || ''
  const isWinStreak = streakCode.startsWith('W')
  const isLossStreak = streakCode.startsWith('L')

  return (
    <tr className="border-b border-bg-border last:border-0 hover:bg-bg-elevated transition-colors duration-100">
      <td className="py-3 pl-3 pr-2">
        <Link to={`/team/${team.teamId}`} className="flex items-center gap-2 min-w-0">
          <img
            src={`https://www.mlbstatic.com/team-logos/${team.teamId}.svg`}
            alt={team.teamAbbr}
            className="w-5 h-5 object-contain shrink-0"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
          <span className="text-[14px] font-medium text-content-primary truncate">
            {team.teamAbbr}
            {team.clinched && <span className="ml-1 text-[10px] text-green-400 font-semibold">x</span>}
          </span>
        </Link>
      </td>
      <td className="py-3 px-1 text-right text-[14px] font-mono text-content-primary">{team.wins}</td>
      <td className="py-3 px-1 text-right text-[14px] font-mono text-content-muted">{team.losses}</td>
      <td className="py-3 px-1 text-right text-[14px] font-mono text-content-muted hidden sm:table-cell">{team.pct}</td>
      <td className="py-3 px-1 text-right text-[14px] font-mono text-content-muted">{gbDisplay}</td>
      <td className="py-3 px-1 text-right text-[14px] font-mono hidden md:table-cell">
        {streakCode ? (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-semibold ${
              isWinStreak ? 'text-green-400 bg-green-400/10' : isLossStreak ? 'text-red-400 bg-red-400/10' : 'text-content-muted'
            }`}
          >
            {streakCode}
          </span>
        ) : (
          <span className="text-content-muted">—</span>
        )}
      </td>
      <td className="py-3 pl-1 pr-3 text-right text-[14px] font-mono text-content-muted hidden lg:table-cell">
        {team.lastTen || '—'}
      </td>
    </tr>
  )
}

function DivisionTable({ division }) {
  const { sort, toggle } = useSort()
  const teams = sortTeams(division.teams, sort)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-bg-border bg-bg-elevated">
        <span className="text-xs font-semibold text-content-secondary uppercase tracking-wider">
          {division.divisionName}
        </span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.08em] text-content-muted border-b border-bg-border">
            <SortHeader label="Team" sortKey="team" sort={sort} onSort={toggle} className="text-left py-3 pl-3 pr-2 font-semibold" />
            <SortHeader label="W" sortKey="wins" sort={sort} onSort={toggle} className="text-right py-3 px-1 font-semibold" />
            <SortHeader label="L" sortKey="losses" sort={sort} onSort={toggle} className="text-right py-3 px-1 font-semibold" />
            <SortHeader label="PCT" sortKey="pct" sort={sort} onSort={toggle} className="text-right py-3 px-1 font-semibold hidden sm:table-cell" />
            <SortHeader label="GB" sortKey="gb" sort={sort} onSort={toggle} className="text-right py-3 px-1 font-semibold" />
            <SortHeader label="STK" sortKey="streak" sort={sort} onSort={toggle} className="text-right py-3 px-1 font-semibold hidden md:table-cell" />
            <SortHeader label="L10" sortKey="lastTen" sort={sort} onSort={toggle} className="text-right py-3 pl-1 pr-3 font-semibold hidden lg:table-cell" />
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <TeamRow key={team.teamId} team={team} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WildCardTable({ leagueName, teams }) {
  const { sort, toggle } = useSort()
  const sorted = sortTeams(teams, { ...sort, key: sort.key === 'gb' ? 'wcGb' : sort.key })

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-bg-border bg-bg-elevated">
        <span className="text-xs font-semibold text-content-secondary uppercase tracking-wider">
          {leagueName} Wild Card
        </span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.08em] text-content-muted border-b border-bg-border">
            <SortHeader label="Team" sortKey="team" sort={sort} onSort={toggle} className="text-left py-3 pl-3 pr-2 font-semibold" />
            <SortHeader label="W" sortKey="wins" sort={sort} onSort={toggle} className="text-right py-3 px-1 font-semibold" />
            <SortHeader label="L" sortKey="losses" sort={sort} onSort={toggle} className="text-right py-3 px-1 font-semibold" />
            <SortHeader label="PCT" sortKey="pct" sort={sort} onSort={toggle} className="text-right py-3 px-1 font-semibold hidden sm:table-cell" />
            <SortHeader label="GB" sortKey="gb" sort={sort} onSort={toggle} className="text-right py-3 px-1 font-semibold" />
            <SortHeader label="STK" sortKey="streak" sort={sort} onSort={toggle} className="text-right py-3 px-1 font-semibold hidden md:table-cell" />
            <SortHeader label="L10" sortKey="lastTen" sort={sort} onSort={toggle} className="text-right py-3 pl-1 pr-3 font-semibold hidden lg:table-cell" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((team, idx) => (
            <>
              {!sort.key && idx === WILD_CARD_SPOTS && (
                <tr key={`cut-${team.teamId}`}>
                  <td colSpan={7} className="py-0">
                    <div className="border-t-2 border-dashed border-bg-border" />
                  </td>
                </tr>
              )}
              <TeamRow key={team.teamId} team={team} showWcGb />
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Standings() {
  const [view, setView] = useState('division')
  const [league, setLeague] = useState('AL')

  const { data: divisions = [], isLoading } = useQuery({
    queryKey: ['standings'],
    queryFn: api.standings.current,
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  })

  const alDivisions = divisions.filter((d) => d.leagueName?.includes('American') || d.leagueId === 103)
  const nlDivisions = divisions.filter((d) => d.leagueName?.includes('National') || d.leagueId === 104)
  const shownDivisions = league === 'AL' ? alDivisions : nlDivisions

  const wildcardTeams = (league === 'AL' ? alDivisions : nlDivisions)
    .flatMap((d) => d.teams)
    .filter((t) => t.divisionRank !== 1)
    .sort((a, b) => (a.wildCardRank || 99) - (b.wildCardRank || 99))

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card h-40 animate-pulse bg-bg-elevated" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xs font-semibold text-content-muted uppercase tracking-widest">Standings</h2>
        <div className="flex items-center gap-2">
          {/* League toggle */}
          <div className="flex rounded-lg border border-bg-border overflow-hidden text-xs font-medium">
            {['AL', 'NL'].map((lg) => (
              <button
                key={lg}
                onClick={() => setLeague(lg)}
                className={`px-3 py-1.5 transition-colors ${league === lg ? 'bg-brand text-white' : 'text-content-secondary hover:bg-bg-elevated'}`}
              >
                {lg}
              </button>
            ))}
          </div>
          {/* View toggle */}
          <div className="flex rounded-lg border border-bg-border overflow-hidden text-xs font-medium">
            {[['division', 'Division'], ['wildcard', 'Wild Card']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setView(val)}
                className={`px-3 py-1.5 transition-colors ${view === val ? 'bg-brand text-white' : 'text-content-secondary hover:bg-bg-elevated'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Division view */}
      {view === 'division' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {shownDivisions.map((division) => (
            <DivisionTable key={division.divisionId} division={division} />
          ))}
        </div>
      )}

      {/* Wild Card view */}
      {view === 'wildcard' && (
        <WildCardTable
          leagueName={league === 'AL' ? 'American League' : 'National League'}
          teams={wildcardTeams}
        />
      )}
    </div>
  )
}
