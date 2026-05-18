import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TeamLogo, SimPlayerAvatar } from './SimUI'
import RatingDots from '../RatingDots'

export const BATTER_COLS = [
  { key: 'g',      label: 'G',    title: 'Games' },
  { key: 'ab',     label: 'AB',   title: 'At Bats' },
  { key: 'avg',    label: 'AVG',  title: 'Batting Average',          fmt: v => v?.toFixed(3) ?? '—' },
  { key: 'obp',    label: 'OBP',  title: 'On-Base Percentage',       fmt: v => v?.toFixed(3) ?? '—' },
  { key: 'slg',    label: 'SLG',  title: 'Slugging Percentage',      fmt: v => v?.toFixed(3) ?? '—' },
  { key: 'ops',    label: 'OPS',  title: 'OPS',                      fmt: v => v?.toFixed(3) ?? '—' },
  { key: 'woba',   label: 'wOBA', title: 'Weighted On-Base Average', fmt: v => v?.toFixed(3) ?? '—' },
  { key: 'iso',    label: 'ISO',  title: 'Isolated Power',           fmt: v => v?.toFixed(3) ?? '—' },
  { key: 'hr',     label: 'HR',   title: 'Home Runs' },
  { key: 'double', label: '2B',   title: 'Doubles' },
  { key: 'rbi',    label: 'RBI',  title: 'RBI' },
  { key: 'r',      label: 'R',    title: 'Runs' },
  { key: 'bb',     label: 'BB',   title: 'Walks' },
  { key: 'k',      label: 'K',    title: 'Strikeouts' },
]

export const PITCHER_COLS = [
  { key: 'gs',   label: 'GS',   title: 'Games Started' },
  { key: 'g',    label: 'G',    title: 'Games' },
  { key: 'w',    label: 'W',    title: 'Wins' },
  { key: 'l',    label: 'L',    title: 'Losses' },
  { key: 'sv',   label: 'SV',   title: 'Saves' },
  { key: 'ip',   label: 'IP',   title: 'Innings Pitched' },
  { key: 'era',  label: 'ERA',  title: 'Earned Run Average', fmt: v => v?.toFixed(2) ?? '—' },
  { key: 'whip', label: 'WHIP', title: 'WHIP',               fmt: v => v?.toFixed(2) ?? '—' },
  { key: 'k',    label: 'K',    title: 'Strikeouts' },
  { key: 'k9',   label: 'K/9',  title: 'Strikeouts per 9 IP', fmt: v => v?.toFixed(2) ?? '—' },
  { key: 'bb9',  label: 'BB/9', title: 'Walks per 9 IP',      fmt: v => v?.toFixed(2) ?? '—' },
  { key: 'hr9',  label: 'HR/9', title: 'HR per 9 IP',         fmt: v => v?.toFixed(2) ?? '—' },
]

export function SortableTable({ rows, cols, sortKey: defaultSort, sortAsc = false, showTeam = true }) {
  const [sort, setSort] = useState(defaultSort)
  const [asc, setAsc]   = useState(sortAsc)

  const sorted = [...rows].sort((a, b) => {
    const va = a[sort]
    const vb = b[sort]
    if (va == null) return 1
    if (vb == null) return -1
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb
    return asc ? cmp : -cmp
  })

  function handleSort(k) {
    if (sort === k) setAsc(a => !a)
    else { setSort(k); setAsc(false) }
  }

  const emptyCols = cols.length + (showTeam ? 3 : 2)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-bg-border bg-bg-elevated">
            <th className="px-4 py-2 text-left font-semibold text-content-muted w-8">#</th>
            <th className="px-4 py-2 text-left font-semibold text-content-muted">Player</th>
            {showTeam && (
              <th className="px-3 py-2 text-left font-semibold text-content-muted">Team</th>
            )}
            {cols.map(c => (
              <th
                key={c.key}
                title={c.title}
                onClick={() => handleSort(c.key)}
                className={`px-3 py-2 text-right font-semibold cursor-pointer select-none transition-colors ${
                  sort === c.key ? 'text-brand' : 'text-content-muted hover:text-content-secondary'
                }`}
              >
                {c.label}
                {sort === c.key && <span className="ml-0.5 text-[9px]">{asc ? '↑' : '↓'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.player_id} className="border-b border-bg-border/40 hover:bg-bg-surface transition-colors">
              <td className="px-4 py-2 text-content-muted font-mono tabular-nums">{i + 1}</td>
              <td className="px-4 py-2">
                <div className="flex flex-col gap-0.5">
                  <Link
                    to={`/simulation/${row.league_id}/player/${row.player_id}`}
                    className="flex items-center gap-2 hover:text-brand transition-colors group"
                  >
                    <SimPlayerAvatar playerId={row.player_id} name={row.player_name} size={24} />
                    <span className="font-semibold text-content-primary group-hover:text-brand transition-colors">{row.player_name}</span>
                  </Link>
                  {row.ratings && (
                    <RatingDots ratings={row.ratings} isPitcher={!!row.era || !!row.ip} />
                  )}
                </div>
              </td>
              {showTeam && (
                <td className="px-3 py-2">
                  <Link to={`/simulation/${row.league_id}/team/${row.team_id}`} className="flex items-center gap-1.5 hover:opacity-75 transition-opacity">
                    <TeamLogo teamId={row.team_id} abbr={row.team_abbr} color={row.team_color} size={16} />
                    <span className="text-content-muted font-mono text-[10px]">{row.team_abbr}</span>
                  </Link>
                </td>
              )}
              {cols.map(c => {
                const val = row[c.key]
                const display = c.fmt ? c.fmt(val) : (val ?? '—')
                return (
                  <td
                    key={c.key}
                    className={`px-3 py-2 text-right font-mono tabular-nums ${
                      sort === c.key ? 'text-content-primary font-bold' : 'text-content-secondary'
                    }`}
                  >
                    {display}
                  </td>
                )
              })}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={emptyCols} className="px-4 py-8 text-center text-content-muted">
                No stats yet — simulate some games first.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
