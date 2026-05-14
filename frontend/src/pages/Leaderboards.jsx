import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import StatHelpTooltip from '../components/StatHelpTooltip'
import PlayerLink from '../components/PlayerLink'
import TeamLink from '../components/TeamLink'
import { teamIdFromAbbr } from '../lib/teamMeta'

const CURRENT_SEASON = new Date().getFullYear()
const MIN_SEASON = 2018
const SEASON_OPTIONS = Array.from(
  { length: Math.max(1, CURRENT_SEASON - MIN_SEASON + 1) },
  (_, i) => CURRENT_SEASON - i
)

const toNumber = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const fmtInt = (v) => {
  const n = toNumber(v)
  return n == null ? '—' : Math.round(n)
}

const fmtDec = (digits) => (v) => {
  const n = toNumber(v)
  return n == null ? '—' : n.toFixed(digits)
}

const fmtPct = (v) => {
  const n = toNumber(v)
  return n == null ? '—' : `${n.toFixed(1)}%`
}

const BATTING_COLS = [
  { key: 'Name', label: 'Player' },
  { key: 'Team', label: 'Team' },
  { key: 'G', label: 'G', fmt: fmtInt },
  { key: 'PA', label: 'PA', fmt: fmtInt },
  { key: 'HR', label: 'HR', fmt: fmtInt },
  { key: 'RBI', label: 'RBI', fmt: fmtInt },
  { key: 'SB', label: 'SB', fmt: fmtInt },
  { key: 'AVG', label: 'AVG', fmt: fmtDec(3) },
  { key: 'OBP', label: 'OBP', fmt: fmtDec(3) },
  { key: 'SLG', label: 'SLG', fmt: fmtDec(3) },
  { key: 'OPS', label: 'OPS', fmt: fmtDec(3) },
  { key: 'wRC+', label: 'wRC+', fmt: fmtInt },
  { key: 'WAR', label: 'WAR', fmt: fmtDec(1) },
  { key: 'BB%', label: 'BB%', fmt: fmtPct },
  { key: 'K%', label: 'K%', fmt: fmtPct },
]

const PITCHING_COLS = [
  { key: 'Name', label: 'Player' },
  { key: 'Team', label: 'Team' },
  { key: 'G', label: 'G', fmt: fmtInt },
  { key: 'GS', label: 'GS', fmt: fmtInt },
  { key: 'IP', label: 'IP', fmt: fmtDec(1) },
  { key: 'W', label: 'W', fmt: fmtInt },
  { key: 'L', label: 'L', fmt: fmtInt },
  { key: 'SV', label: 'SV', fmt: fmtInt },
  { key: 'ERA', label: 'ERA', fmt: fmtDec(2) },
  { key: 'WHIP', label: 'WHIP', fmt: fmtDec(2) },
  { key: 'K/9', label: 'K/9', fmt: fmtDec(1) },
  { key: 'BB/9', label: 'BB/9', fmt: fmtDec(1) },
  { key: 'FIP', label: 'FIP', fmt: fmtDec(2) },
  { key: 'xFIP', label: 'xFIP', fmt: fmtDec(2) },
  { key: 'WAR', label: 'WAR', fmt: fmtDec(1) },
  { key: 'K%', label: 'K%', fmt: fmtPct },
  { key: 'BB%', label: 'BB%', fmt: fmtPct },
]

function Table({ data, columns, sortKey, sortDir, onSort }) {
  function playerIdFromRow(row) {
    return row.xMLBAMID || row.MLBAMID || row.MLBID || row.mlbamid || row.player_id || row.PlayerId || null
  }

  if (!data?.length) {
    return (
      <div className="card p-12 text-center">
        <div className="text-3xl mb-3">📊</div>
        <div className="text-content-muted">No data available. FanGraphs data may take a moment to load.</div>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bg-border">
              <th className="text-left px-4 py-3 text-xs text-content-muted font-medium uppercase tracking-wider w-8">#</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => onSort(col.key)}
                  className="text-left px-3 py-3 text-xs text-content-muted font-medium uppercase tracking-wider cursor-pointer hover:text-content-primary transition-colors whitespace-nowrap select-none"
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    <StatHelpTooltip stat={col.key} />
                    {sortKey === col.key && (
                      <span className="text-brand-light">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-bg-border/40 hover:bg-bg-elevated transition-colors">
                <td className="px-4 py-2.5 text-content-muted font-mono text-xs">{i + 1}</td>
                {columns.map((col) => {
                  const raw = row[col.key]
                  const formatted = raw != null ? (col.fmt ? col.fmt(raw) : raw) : '—'
                  if (col.key === 'Name') {
                    const playerId = playerIdFromRow(row)
                    return (
                      <td key={col.key} className="px-3 py-2.5 font-medium text-content-primary whitespace-nowrap">
                        <PlayerLink
                          playerId={playerId}
                          name={formatted}
                          imageClassName="w-6 h-6"
                          textClassName="font-medium"
                        />
                      </td>
                    )
                  }
                  if (col.key === 'Team') {
                    const teamAbbr = String(formatted || '')
                    const teamId = teamIdFromAbbr(teamAbbr)
                    return (
                      <td key={col.key} className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">
                        <TeamLink teamId={teamId} label={teamAbbr || '—'} iconClassName="w-5 h-5" />
                      </td>
                    )
                  }
                  return (
                    <td key={col.key} className="px-3 py-2.5 font-mono text-content-secondary whitespace-nowrap">
                      {formatted}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Leaderboards() {
  const [tab, setTab] = useState('batting')
  const [season, setSeason] = useState(CURRENT_SEASON)
  const [sortKey, setSortKey] = useState(tab === 'batting' ? 'WAR' : 'ERA')
  const [sortDir, setSortDir] = useState('desc')

  const { data: battingData = [], isLoading: loadingBat } = useQuery({
    queryKey: ['leaderboards-batting', season],
    queryFn: () => api.leaderboards.batting(season),
    enabled: tab === 'batting',
    staleTime: 10 * 60 * 1000,
  })

  const { data: pitchingData = [], isLoading: loadingPitch } = useQuery({
    queryKey: ['leaderboards-pitching', season],
    queryFn: () => api.leaderboards.pitching(season),
    enabled: tab === 'pitching',
    staleTime: 10 * 60 * 1000,
  })

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function sortData(rows) {
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      const bv = b[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }

  const rawData = tab === 'batting' ? battingData : pitchingData
  const sorted = sortData(rawData)
  const cols = tab === 'batting' ? BATTING_COLS : PITCHING_COLS
  const loading = tab === 'batting' ? loadingBat : loadingPitch

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Leaderboards</h1>
          <p className="text-sm text-content-muted mt-0.5">Via FanGraphs · min. 100 PA / 30 IP</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
            className="bg-bg-elevated border border-bg-border text-content-primary text-sm rounded-lg px-3 py-1.5 outline-none focus:border-brand"
          >
            {SEASON_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex items-center gap-1 bg-bg-surface border border-bg-border rounded-xl p-1">
            {['batting', 'pitching'].map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setSortKey(t === 'batting' ? 'WAR' : 'ERA'); setSortDir(t === 'batting' ? 'desc' : 'asc') }}
                className={tab === t ? 'tab-active' : 'tab-inactive'}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-content-muted text-sm p-4">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          Loading FanGraphs data… (this may take 10-20 seconds)
        </div>
      ) : (
        <Table data={sorted} columns={cols} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
      )}
    </div>
  )
}
