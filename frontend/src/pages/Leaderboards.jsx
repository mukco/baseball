import { useState, useMemo } from 'react'
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

const TEAM_OPTIONS = [
  { abbr: 'ARI', name: 'Arizona' },
  { abbr: 'ATL', name: 'Atlanta' },
  { abbr: 'BAL', name: 'Baltimore' },
  { abbr: 'BOS', name: 'Boston' },
  { abbr: 'CHC', name: 'Chi Cubs' },
  { abbr: 'CWS', name: 'Chi Sox' },
  { abbr: 'CIN', name: 'Cincinnati' },
  { abbr: 'CLE', name: 'Cleveland' },
  { abbr: 'COL', name: 'Colorado' },
  { abbr: 'DET', name: 'Detroit' },
  { abbr: 'HOU', name: 'Houston' },
  { abbr: 'KC', name: 'Kansas City' },
  { abbr: 'LAA', name: 'LA Angels' },
  { abbr: 'LAD', name: 'LA Dodgers' },
  { abbr: 'MIA', name: 'Miami' },
  { abbr: 'MIL', name: 'Milwaukee' },
  { abbr: 'MIN', name: 'Minnesota' },
  { abbr: 'NYM', name: 'NY Mets' },
  { abbr: 'NYY', name: 'NY Yankees' },
  { abbr: 'OAK', name: 'Oakland' },
  { abbr: 'PHI', name: 'Philadelphia' },
  { abbr: 'PIT', name: 'Pittsburgh' },
  { abbr: 'SD', name: 'San Diego' },
  { abbr: 'SF', name: 'San Francisco' },
  { abbr: 'SEA', name: 'Seattle' },
  { abbr: 'STL', name: 'St. Louis' },
  { abbr: 'TB', name: 'Tampa Bay' },
  { abbr: 'TEX', name: 'Texas' },
  { abbr: 'TOR', name: 'Toronto' },
  { abbr: 'WSH', name: 'Washington' },
]
const QUAL_PRESETS = { batting: [50, 100, 200, 500], pitching: [10, 30, 50, 100] }

const OPERATORS = [
  { value: '>', label: '>' },
  { value: '>=', label: '≥' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' },
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
]

const FILTERABLE_COLS = [
  'G', 'PA', 'HR', 'RBI', 'SB', 'AVG', 'OBP', 'SLG', 'OPS', 'wRC+', 'WAR', 'BB%', 'K%',
  'GS', 'IP', 'W', 'L', 'SV', 'ERA', 'WHIP', 'K/9', 'BB/9', 'FIP', 'xFIP',
]

const TEAM_FILTERABLE_COLS = {
  batting: ['G', 'PA', 'AB', 'H', '2B', '3B', 'AVG', 'OBP', 'SLG', 'OPS', 'HR', 'R', 'RBI', 'SB', 'SO', 'BB', 'ISO', 'BABIP', 'K%', 'BB%', 'wOBA'],
  pitching: ['ERA', 'WHIP', 'FIP', 'K/9', 'BB/9', 'K-BB%', 'SO', 'BB', 'HR', 'SV', 'IP', 'K%', 'BB%'],
}

const TEAM_IDENTITY_KEYS = new Set(['Name', 'Abbr', 'League', 'Division'])

function applyStatFilters(rows, filters, logic) {
  if (!filters.length) return rows
  return rows.filter((row) => {
    const results = filters.map((f) => {
      const raw = row[f.column]
      if (raw == null || raw === '—') return false
      const num = Number(raw)
      const val = Number(f.value)
      if (!Number.isFinite(num) || !Number.isFinite(val)) {
        const sRow = String(raw).trim().toLowerCase()
        const sVal = String(f.value).trim().toLowerCase()
        switch (f.operator) {
          case '=': return sRow === sVal
          case '!=': return sRow !== sVal
          default: return false
        }
      }
      // Round both to 3 decimals for stat-line comparisons (AVG, OBP, SLG, etc.)
      // so .200 matches players batting exactly .200 even if stored as 0.200000001
      const roundedNum = Math.round(num * 10000) / 10000
      const roundedVal = Math.round(val * 10000) / 10000
      switch (f.operator) {
        case '>': return roundedNum > roundedVal
        case '>=': return roundedNum >= roundedVal
        case '<': return roundedNum < roundedVal
        case '<=': return roundedNum <= roundedVal
        case '=': return Math.abs(roundedNum - roundedVal) < 0.00005
        case '!=': return Math.abs(roundedNum - roundedVal) >= 0.00005
        default: return false
      }
    })
    return logic === 'and' ? results.every(Boolean) : results.some(Boolean)
  })
}

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

const ALL_COLUMN_DEFS = {
  // Core (both)
  Name:     { label: 'Player', fmt: null },
  Abbr:     { label: 'Abbr', fmt: null },
  League:   { label: 'Lg', fmt: null },
  Division: { label: 'Division', fmt: null },
  Team: { label: 'Team', fmt: null },
  G:    { label: 'G', fmt: fmtInt },
  PA:   { label: 'PA', fmt: fmtInt },
  AB:   { label: 'AB', fmt: fmtInt },
  H:    { label: 'H', fmt: fmtInt },
  '2B': { label: '2B', fmt: fmtInt },
  '3B': { label: '3B', fmt: fmtInt },
  HR:   { label: 'HR', fmt: fmtInt },
  R:    { label: 'R', fmt: fmtInt },
  RBI:  { label: 'RBI', fmt: fmtInt },
  BB:   { label: 'BB', fmt: fmtInt },
  SO:   { label: 'SO', fmt: fmtInt },
  SB:   { label: 'SB', fmt: fmtInt },
  AVG:  { label: 'AVG', fmt: fmtDec(3) },
  OBP:  { label: 'OBP', fmt: fmtDec(3) },
  SLG:  { label: 'SLG', fmt: fmtDec(3) },
  OPS:  { label: 'OPS', fmt: fmtDec(3) },
  ISO:  { label: 'ISO', fmt: fmtDec(3) },
  wOBA:  { label: 'wOBA', fmt: fmtDec(3) },
  xwOBA: { label: 'xwOBA', fmt: fmtDec(3) },
  'wRC+': { label: 'wRC+', fmt: fmtInt },
  WPA:  { label: 'WPA', fmt: fmtDec(1) },
  WAR:  { label: 'WAR', fmt: fmtDec(1) },
  'BB%':  { label: 'BB%', fmt: fmtPct },
  'K%':   { label: 'K%', fmt: fmtPct },
  BABIP: { label: 'BABIP', fmt: fmtDec(3) },

  // Batting quality of contact
  EV:    { label: 'EV', fmt: fmtDec(1) },
  maxEV: { label: 'Max EV', fmt: fmtInt },
  LA:    { label: 'LA', fmt: fmtDec(1) },
  'Barrel%': { label: 'Barrel%', fmt: fmtPct },
  'Hard%':  { label: 'Hard%', fmt: fmtPct },
  'Med%':   { label: 'Med%', fmt: fmtPct },
  'Soft%':  { label: 'Soft%', fmt: fmtPct },
  'LD%':  { label: 'LD%', fmt: fmtPct },
  'GB%':  { label: 'GB%', fmt: fmtPct },
  'FB%':  { label: 'FB%', fmt: fmtPct },
  'Pull%':  { label: 'Pull%', fmt: fmtPct },
  'Cent%':  { label: 'Cent%', fmt: fmtPct },
  'Oppo%':  { label: 'Oppo%', fmt: fmtPct },
  'SwStr%': { label: 'SwStr%', fmt: fmtPct },
  'Contact%': { label: 'Contact%', fmt: fmtPct },
  'Swing%': { label: 'Swing%', fmt: fmtPct },
  'Z-Swing%': { label: 'Z-Swing%', fmt: fmtPct },
  'O-Swing%': { label: 'O-Swing%', fmt: fmtPct },
  'Z-Contact%': { label: 'Z-Contact%', fmt: fmtPct },
  'O-Contact%': { label: 'O-Contact%', fmt: fmtPct },

  // Pitching
  GS:   { label: 'GS', fmt: fmtInt },
  IP:   { label: 'IP', fmt: fmtDec(1) },
  W:    { label: 'W', fmt: fmtInt },
  L:    { label: 'L', fmt: fmtInt },
  SV:   { label: 'SV', fmt: fmtInt },
  ERA:  { label: 'ERA', fmt: fmtDec(2) },
  WHIP: { label: 'WHIP', fmt: fmtDec(2) },
  'K/9': { label: 'K/9', fmt: fmtDec(1) },
  'BB/9': { label: 'BB/9', fmt: fmtDec(1) },
  'HR/9': { label: 'HR/9', fmt: fmtDec(2) },
  FIP:  { label: 'FIP', fmt: fmtDec(2) },
  xFIP: { label: 'xFIP', fmt: fmtDec(2) },
  'K-BB%': { label: 'K-BB%', fmt: fmtPct },
  'Lob%': { label: 'LOB%', fmt: fmtPct },
  'CStr%': { label: 'CStr%', fmt: fmtPct },
  'F-Strike%': { label: 'F-Strike%', fmt: fmtPct },
  FBv:  { label: 'FB Velo', fmt: fmtDec(1) },
  CBv:  { label: 'CB Velo', fmt: fmtDec(1) },
  SLv:  { label: 'SL Velo', fmt: fmtDec(1) },
  CHv:  { label: 'CH Velo', fmt: fmtDec(1) },
}

const DEFAULT_BATTING_KEYS = ['Name', 'Team', 'G', 'PA', 'HR', 'RBI', 'SB', 'AVG', 'OBP', 'SLG', 'OPS', 'wRC+', 'WAR', 'BB%', 'K%']
const DEFAULT_PITCHING_KEYS = ['Name', 'Team', 'G', 'GS', 'IP', 'W', 'L', 'SV', 'ERA', 'WHIP', 'K/9', 'BB/9', 'FIP', 'xFIP', 'WAR', 'K%', 'BB%']
const TEAM_BATTING_KEYS  = ['Name', 'Abbr', 'League', 'Division', 'G', 'PA', 'AB', 'H', '2B', '3B', 'AVG', 'OBP', 'SLG', 'OPS', 'HR', 'R', 'RBI', 'SB', 'SO', 'BB', 'ISO', 'BABIP', 'K%', 'BB%', 'wOBA']
const TEAM_PITCHING_KEYS = ['Name', 'Abbr', 'League', 'Division', 'ERA', 'WHIP', 'FIP', 'K/9', 'BB/9', 'K-BB%', 'SO', 'BB', 'HR', 'SV', 'IP', 'K%', 'BB%']
const DIVISION_OPTIONS   = ['AL East', 'AL Central', 'AL West', 'NL East', 'NL Central', 'NL West']

// Columns that only make sense for one tab — hidden in the other
const PITCHING_ONLY_KEYS = new Set(['GS', 'IP', 'W', 'L', 'SV', 'ERA', 'WHIP', 'K/9', 'BB/9', 'HR/9', 'FIP', 'xFIP', 'K-BB%', 'Lob%', 'CStr%', 'F-Strike%', 'FBv', 'CBv', 'SLv', 'CHv'])
const BATTING_ONLY_KEYS = new Set(['PA', 'AB', 'RBI', 'SB', 'AVG', 'OBP', 'SLG', 'OPS', 'ISO', 'wOBA', 'xwOBA', 'wRC+', 'BABIP', 'EV', 'maxEV', 'LA', 'Barrel%', 'Hard%', 'Med%', 'Soft%', 'LD%', 'GB%', 'FB%', 'Pull%', 'Cent%', 'Oppo%', 'SwStr%', 'Contact%', 'Swing%', 'Z-Swing%', 'O-Swing%', 'Z-Contact%', 'O-Contact%'])

function colDefsFromKeys(keys) {
  return keys.filter((k) => ALL_COLUMN_DEFS[k]).map((k) => ({ key: k, ...ALL_COLUMN_DEFS[k] }))
}

function toggleArr(arr, item) {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]
}

function ColumnSelector({ tab, visibleKeys, onToggle, allowedKeys }) {
  const [open, setOpen] = useState(false)

  let sortedKeys
  if (allowedKeys) {
    sortedKeys = [...allowedKeys].sort((a, b) => (ALL_COLUMN_DEFS[a]?.label ?? a).localeCompare(ALL_COLUMN_DEFS[b]?.label ?? b))
  } else {
    const excludeSet = tab === 'batting' ? PITCHING_ONLY_KEYS : BATTING_ONLY_KEYS
    const allKeys = Object.keys(ALL_COLUMN_DEFS).filter((k) => k !== 'Name' && k !== 'Team' && !excludeSet.has(k))
    sortedKeys = [...allKeys].sort((a, b) => ALL_COLUMN_DEFS[a].label.localeCompare(ALL_COLUMN_DEFS[b].label))
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary transition-colors"
      >
        Columns
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-bg-elevated border border-bg-border rounded-xl shadow-2xl p-3 w-[280px] max-h-[360px] overflow-y-auto">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-2">Toggle columns</div>
            <div className="space-y-1">
              {sortedKeys.map((key) => {
                const def = ALL_COLUMN_DEFS[key]
                const on = visibleKeys.includes(key)
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 cursor-pointer px-1 py-1 rounded hover:bg-bg-border/40 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggle(key)}
                      className="accent-brand"
                    />
                    <span className="text-xs text-content-primary">{def.label}</span>
                    <span className="text-[9px] text-content-muted ml-auto">{key}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const SAVED_FILTERS_KEY = 'leaderboard-saved-filters'

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_FILTERS_KEY)) || [] } catch { return [] }
}

function saveSaved(list) {
  localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(list))
}

function exportCsv(rows, columns) {
  const headers = columns.map((c) => c.label)
  const lines = rows.map((row) =>
    columns.map((c) => {
      const raw = row[c.key]
      const formatted = raw != null ? (c.fmt ? c.fmt(raw) : raw) : '—'
      const str = String(formatted).replace(/"/g, '""')
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str
    }).join(',')
  )
  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'leaderboard.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function SavedFilters({ filterState, columns, data }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(loadSaved)
  const [saveName, setSaveName] = useState('')

  function handleSave() {
    if (!saveName.trim()) return
    const entry = { name: saveName.trim(), ...filterState }
    const updated = [...saved, entry]
    setSaved(updated)
    saveSaved(updated)
    setSaveName('')
  }

  function handleLoad(idx) {
    const entry = saved[idx]
    if (!entry) return
    filterState.onLoad(entry)
    setOpen(false)
  }

  function handleDelete(idx) {
    const updated = saved.filter((_, i) => i !== idx)
    setSaved(updated)
    saveSaved(updated)
  }

  function handleExport() {
    exportCsv(data, columns)
    setOpen(false)
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary transition-colors"
      >
        Saved
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-bg-elevated border border-bg-border rounded-xl shadow-2xl p-3 w-[280px] max-h-[400px] overflow-y-auto">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-2">Saved Filters</div>

            {saved.length > 0 && (
              <div className="space-y-1 mb-3 pb-3 border-b border-bg-border">
                {saved.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-1 group">
                    <button
                      type="button"
                      onClick={() => handleLoad(idx)}
                      className="flex-1 text-left text-xs text-content-primary px-2 py-1.5 rounded hover:bg-bg-border/40 transition-colors truncate"
                    >
                      {entry.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(idx)}
                      className="text-xs text-content-muted hover:text-red-400 px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Filter name..."
                  className="flex-1 bg-bg-base border border-bg-border text-content-primary text-xs rounded px-2 py-1.5 outline-none focus:border-brand"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!saveName.trim()}
                  className="text-xs font-medium px-2 py-1.5 rounded-md bg-brand text-white disabled:opacity-40"
                >
                  Save
                </button>
              </div>
              <button
                type="button"
                onClick={handleExport}
                className="w-full text-xs font-medium px-2 py-1.5 rounded-md border border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary transition-colors"
              >
                Export to CSV ({data.length} rows)
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Heat pill columns by stat name. Each entry is the field key and an
// (lowIsBetter) flag that flips the heat ramp.
const HEAT_COLUMNS = {
  OPS:   { lowIsBetter: false },
  AVG:   { lowIsBetter: false },
  HR:    { lowIsBetter: false },
  WAR:   { lowIsBetter: false },
  'wRC+': { lowIsBetter: false },
  ERA:   { lowIsBetter: true },
  WHIP:  { lowIsBetter: true },
  FIP:   { lowIsBetter: true },
}

// Compute a heat color for a value vs. the column distribution.
function heatColorFor(value, allValues, lowIsBetter) {
  const nums = allValues.map((v) => Number(v)).filter((n) => Number.isFinite(n))
  if (!nums.length || !Number.isFinite(Number(value))) return null
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  if (max === min) return null
  let pct = (Number(value) - min) / (max - min)
  if (lowIsBetter) pct = 1 - pct
  if (pct >= 0.85) return 'var(--color-stat-elite)'
  if (pct >= 0.65) return 'var(--color-stat-great)'
  if (pct >= 0.40) return 'var(--color-stat-avg)'
  if (pct >= 0.20) return 'var(--color-stat-below)'
  return 'var(--color-stat-poor)'
}

function HeatPill({ children, color }) {
  if (!color) {
    return <span className="font-mono text-content-secondary">{children}</span>
  }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[13px] font-mono font-semibold"
      style={{ color, background: `color-mix(in oklch, ${color} 12%, transparent)` }}
    >
      {children}
    </span>
  )
}

function Table({ data, columns, sortKey, sortDir, onSort }) {
  function playerIdFromRow(row) {
    return row.xMLBAMID || row.MLBAMID || row.MLBID || row.mlbamid || row.player_id || row.PlayerId || null
  }

  if (!data?.length) {
    return (
      <div className="card p-12 text-center">
        <div className="flex justify-center mb-3">
          <svg className="w-8 h-8 text-content-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="13" width="4" height="8" rx="1" strokeWidth="1.5"/>
            <rect x="10" y="9" width="4" height="12" rx="1" strokeWidth="1.5"/>
            <rect x="17" y="5" width="4" height="16" rx="1" strokeWidth="1.5"/>
          </svg>
        </div>
        <div className="text-content-muted">No data available. FanGraphs data may take a moment to load.</div>
      </div>
    )
  }

  // Pre-extract values for heat columns
  const heatColumnValues = {}
  for (const colKey of Object.keys(HEAT_COLUMNS)) {
    heatColumnValues[colKey] = data.map((row) => row[colKey])
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-bg-border">
              <th className="text-left px-4 py-3 text-[11px] text-content-muted font-semibold uppercase tracking-[0.08em] w-8">#</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => onSort(col.key)}
                  className="text-left px-3 py-3 text-[11px] text-content-muted font-semibold uppercase tracking-[0.08em] cursor-pointer hover:text-content-primary transition-colors whitespace-nowrap select-none"
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
              <tr key={i} className="border-b border-bg-border last:border-0 hover:bg-bg-elevated transition-colors duration-100">
                <td className="px-4 py-3 text-content-muted font-mono text-xs">{i + 1}</td>
                {columns.map((col) => {
                  const raw = row[col.key]
                  const formatted = raw != null ? (col.fmt ? col.fmt(raw) : raw) : '—'
                  if (col.key === 'Name') {
                    if (row.team_id != null) {
                      return (
                        <td key={col.key} className="px-3 py-3 font-medium text-content-primary whitespace-nowrap">
                          <TeamLink teamId={row.team_id} label={formatted} iconClassName="w-6 h-6" />
                        </td>
                      )
                    }
                    const playerId = playerIdFromRow(row)
                    return (
                      <td key={col.key} className="px-3 py-3 font-medium text-content-primary whitespace-nowrap">
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
                      <td key={col.key} className="px-3 py-3 font-mono text-content-secondary whitespace-nowrap">
                        <TeamLink teamId={teamId} label={teamAbbr || '—'} iconClassName="w-5 h-5" />
                      </td>
                    )
                  }
                  if (HEAT_COLUMNS[col.key] && raw != null) {
                    const color = heatColorFor(raw, heatColumnValues[col.key], HEAT_COLUMNS[col.key].lowIsBetter)
                    return (
                      <td key={col.key} className="px-3 py-3 whitespace-nowrap">
                        <HeatPill color={color}>{formatted}</HeatPill>
                      </td>
                    )
                  }
                  return (
                    <td key={col.key} className="px-3 py-3 font-mono text-content-secondary whitespace-nowrap">
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
  const [teamFilter, setTeamFilter] = useState('')
  const [nameQuery, setNameQuery] = useState('')
  const [minQual, setMinQual] = useState(100)
  const [statFilters, setStatFilters] = useState([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortKey, setSortKey] = useState(tab === 'batting' ? 'WAR' : 'ERA')
  const [sortDir, setSortDir] = useState('desc')
  const [visibleKeys, setVisibleKeys] = useState(() => [...DEFAULT_BATTING_KEYS])

  const [teamSubTab, setTeamSubTab] = useState('batting')
  const [teamSortKey, setTeamSortKey] = useState('OPS')
  const [teamSortDir, setTeamSortDir] = useState('desc')
  const [teamDivisionFilter, setTeamDivisionFilter] = useState('')
  const [teamNameQuery, setTeamNameQuery] = useState('')
  const [teamStatFilters, setTeamStatFilters] = useState([])
  const [teamFilterOpen, setTeamFilterOpen] = useState(false)
  const [teamVisibleBattingKeys, setTeamVisibleBattingKeys] = useState([...TEAM_BATTING_KEYS])
  const [teamVisiblePitchingKeys, setTeamVisiblePitchingKeys] = useState([...TEAM_PITCHING_KEYS])

  const { data: battingData = [], isLoading: loadingBat } = useQuery({
    queryKey: ['leaderboards-batting', season, minQual],
    queryFn: () => api.leaderboards.batting(season, minQual),
    enabled: tab === 'batting',
    staleTime: 10 * 60 * 1000,
  })

  const { data: pitchingData = [], isLoading: loadingPitch } = useQuery({
    queryKey: ['leaderboards-pitching', season, minQual],
    queryFn: () => api.leaderboards.pitching(season, minQual),
    enabled: tab === 'pitching',
    staleTime: 10 * 60 * 1000,
  })

  const { data: teamBattingData = [], isLoading: loadingTeamBat } = useQuery({
    queryKey: ['leaderboards-teams-batting', season],
    queryFn: () => api.leaderboards.teams(season, 'batting'),
    enabled: tab === 'teams' && teamSubTab === 'batting',
    staleTime: 30 * 60 * 1000,
  })

  const { data: teamPitchingData = [], isLoading: loadingTeamPitch } = useQuery({
    queryKey: ['leaderboards-teams-pitching', season],
    queryFn: () => api.leaderboards.teams(season, 'pitching'),
    enabled: tab === 'teams' && teamSubTab === 'pitching',
    staleTime: 30 * 60 * 1000,
  })

  function handleTabSwitch(t) {
    setTab(t)
    if (t === 'teams') return
    setSortKey(t === 'batting' ? 'WAR' : 'ERA')
    setSortDir(t === 'batting' ? 'desc' : 'asc')
    setMinQual(t === 'batting' ? 100 : 30)
    setVisibleKeys(t === 'batting' ? [...DEFAULT_BATTING_KEYS] : [...DEFAULT_PITCHING_KEYS])
  }

  function handleTeamSubTabSwitch(sub) {
    setTeamSubTab(sub)
    setTeamSortKey(sub === 'batting' ? 'OPS' : 'ERA')
    setTeamSortDir(sub === 'batting' ? 'desc' : 'asc')
    setTeamStatFilters([])
  }

  function addTeamFilter() {
    setTeamStatFilters((prev) => [...prev, { column: teamSubTab === 'batting' ? 'OPS' : 'ERA', operator: '>', value: '' }])
  }

  function updateTeamFilter(idx, field, val) {
    setTeamStatFilters((prev) => prev.map((f, i) => (i === idx ? { ...f, [field]: val } : f)))
  }

  function removeTeamFilter(idx) {
    setTeamStatFilters((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleTeamSort(key) {
    if (teamSortKey === key) {
      setTeamSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setTeamSortKey(key)
      setTeamSortDir('desc')
    }
  }

  function addFilter() {
    setStatFilters((prev) => [...prev, { column: tab === 'batting' ? 'AVG' : 'ERA', operator: '>', value: '' }])
  }

  function updateFilter(idx, field, val) {
    setStatFilters((prev) => prev.map((f, i) => (i === idx ? { ...f, [field]: val } : f)))
  }

  function removeFilter(idx) {
    setStatFilters((prev) => prev.filter((_, i) => i !== idx))
  }

  function loadFilterState(entry) {
    setTab(entry.tab || 'batting')
    setSeason(entry.season ?? CURRENT_SEASON)
    if (entry.tab === 'teams') {
      setTeamSubTab(entry.teamSubTab || 'batting')
      setTeamDivisionFilter(entry.teamDivisionFilter || '')
      setTeamNameQuery(entry.teamNameQuery || '')
      setTeamStatFilters(entry.teamStatFilters || [])
      if (entry.teamVisibleBattingKeys) setTeamVisibleBattingKeys([...entry.teamVisibleBattingKeys])
      if (entry.teamVisiblePitchingKeys) setTeamVisiblePitchingKeys([...entry.teamVisiblePitchingKeys])
    } else {
      setTeamFilter(entry.teamFilter || '')
      setNameQuery(entry.nameQuery || '')
      setMinQual(entry.minQual ?? (entry.tab === 'batting' ? 100 : 30))
      setStatFilters(entry.statFilters || [])
      setVisibleKeys(entry.visibleKeys ? [...entry.visibleKeys] : (entry.tab === 'batting' ? [...DEFAULT_BATTING_KEYS] : [...DEFAULT_PITCHING_KEYS]))
    }
  }

  const currentFilterState = {
    tab,
    season,
    teamFilter,
    nameQuery,
    minQual,
    statFilters,
    visibleKeys,
  }

  const currentTeamFilterState = {
    tab: 'teams',
    season,
    teamSubTab,
    teamDivisionFilter,
    teamNameQuery,
    teamStatFilters,
    teamVisibleBattingKeys,
    teamVisiblePitchingKeys,
  }

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

  const rawTeamData = teamSubTab === 'batting' ? teamBattingData : teamPitchingData
  const teamNameLower = teamNameQuery.trim().toLowerCase()
  const teamDivFiltered = teamDivisionFilter ? rawTeamData.filter((r) => r.Division === teamDivisionFilter) : rawTeamData
  const teamNameFiltered = teamNameLower ? teamDivFiltered.filter((r) => String(r.Name).toLowerCase().includes(teamNameLower)) : teamDivFiltered
  const teamStatFiltered = applyStatFilters(teamNameFiltered, teamStatFilters, 'and')
  const teamSorted = [...teamStatFiltered].sort((a, b) => {
    const av = a[teamSortKey] ?? (teamSortDir === 'asc' ? Infinity : -Infinity)
    const bv = b[teamSortKey] ?? (teamSortDir === 'asc' ? Infinity : -Infinity)
    return teamSortDir === 'asc' ? av - bv : bv - av
  })
  const teamVisibleKeys = teamSubTab === 'batting' ? teamVisibleBattingKeys : teamVisiblePitchingKeys
  const teamToggleableKeys = (teamSubTab === 'batting' ? TEAM_BATTING_KEYS : TEAM_PITCHING_KEYS).filter((k) => !TEAM_IDENTITY_KEYS.has(k))
  const teamCols = colDefsFromKeys(teamVisibleKeys)
  const loadingTeamData = teamSubTab === 'batting' ? loadingTeamBat : loadingTeamPitch

  const rawData = tab === 'batting' ? battingData : pitchingData
  const nameLower = nameQuery.trim().toLowerCase()
  const teamFiltered = teamFilter ? rawData.filter((row) => String(row.Team).trim().toUpperCase() === teamFilter) : rawData
  const nameFiltered = nameLower ? teamFiltered.filter((row) => String(row.Name).toLowerCase().includes(nameLower)) : teamFiltered
  const statFiltered = applyStatFilters(nameFiltered, statFilters, 'and')
  const sorted = sortData(statFiltered)
  const cols = colDefsFromKeys(visibleKeys)
  const loading = tab === 'batting' ? loadingBat : loadingPitch

  return (
    <div className="space-y-10 py-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-content-primary">Stats</h1>
          <p className="text-sm text-content-muted mt-1">Via FanGraphs</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
            className="bg-bg-elevated border border-bg-border text-content-primary text-sm rounded-md px-3 py-1.5 outline-none focus:border-brand"
          >
            {SEASON_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {tab !== 'teams' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-content-muted">Team</span>
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded-md px-2 py-1.5 outline-none focus:border-brand"
              >
                <option value="">All</option>
                {TEAM_OPTIONS.map((t) => (
                  <option key={t.abbr} value={t.abbr}>{t.abbr} — {t.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-content-muted">{tab === 'batting' ? 'Min PA' : 'Min IP'}</span>
              <div className="flex rounded-lg border border-bg-border overflow-hidden">
                {QUAL_PRESETS[tab].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMinQual(val)}
                    className={`text-xs px-2.5 py-1.5 font-medium transition-colors ${
                      minQual === val
                        ? 'bg-brand text-white'
                        : 'bg-bg-elevated text-content-secondary hover:text-content-primary'
                    } ${val !== QUAL_PRESETS[tab][0] ? 'border-l border-bg-border' : ''}`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-content-muted">Name</span>
              <input
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="Search..."
                className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded-md px-2 py-1.5 outline-none focus:border-brand w-[120px]"
              />
            </div>

            <button
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
                filterOpen || statFilters.length > 0
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary'
              }`}
            >
              {filterOpen ? 'Close' : '+ Filter'}
            </button>

            <div className="relative">
              <ColumnSelector
                tab={tab}
                visibleKeys={visibleKeys}
                onToggle={(key) => setVisibleKeys((prev) => toggleArr(prev, key))}
              />
            </div>

            <div className="relative">
              <SavedFilters
                filterState={{ ...currentFilterState, onLoad: loadFilterState }}
                columns={cols}
                data={sorted}
              />
            </div>
          </>
        )}

        {tab === 'teams' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-content-muted">Division</span>
              <select
                value={teamDivisionFilter}
                onChange={(e) => setTeamDivisionFilter(e.target.value)}
                className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded-md px-2 py-1.5 outline-none focus:border-brand"
              >
                <option value="">All</option>
                {DIVISION_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-content-muted">Name</span>
              <input
                value={teamNameQuery}
                onChange={(e) => setTeamNameQuery(e.target.value)}
                placeholder="Search..."
                className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded-md px-2 py-1.5 outline-none focus:border-brand w-[120px]"
              />
            </div>

            <button
              type="button"
              onClick={() => setTeamFilterOpen((o) => !o)}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
                teamFilterOpen || teamStatFilters.length > 0
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary'
              }`}
            >
              {teamFilterOpen ? 'Close' : '+ Filter'}
            </button>

            <div className="relative">
              <ColumnSelector
                allowedKeys={teamToggleableKeys}
                visibleKeys={teamVisibleKeys}
                onToggle={(key) => {
                  if (teamSubTab === 'batting') {
                    setTeamVisibleBattingKeys((prev) => toggleArr(prev, key))
                  } else {
                    setTeamVisiblePitchingKeys((prev) => toggleArr(prev, key))
                  }
                }}
              />
            </div>

            <div className="relative">
              <SavedFilters
                filterState={{ ...currentTeamFilterState, onLoad: loadFilterState }}
                columns={teamCols}
                data={teamSorted}
              />
            </div>
          </>
        )}

        <div className="flex-1" />

        <div className="flex items-center border-b border-bg-border">
          {['batting', 'pitching', 'teams'].map((t) => (
            <button
              key={t}
              onClick={() => handleTabSwitch(t)}
              className={tab === t ? 'tab-active' : 'tab-inactive'}
            >
              {t === 'teams' ? 'Teams' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {tab !== 'teams' && filterOpen && (
        <div className="card p-3 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-content-muted uppercase tracking-wider font-semibold">Stat filters</span>
            <button
              type="button"
              onClick={addFilter}
              className="text-xs text-brand-light hover:underline font-medium"
            >
              + Add rule
            </button>
          </div>
          {statFilters.length > 0 && (
            <div className="space-y-1.5">
              {statFilters.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={f.column}
                    onChange={(e) => updateFilter(idx, 'column', e.target.value)}
                    className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded px-2 py-1.5 outline-none focus:border-brand w-[80px]"
                  >
                    {FILTERABLE_COLS.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  <select
                    value={f.operator}
                    onChange={(e) => updateFilter(idx, 'operator', e.target.value)}
                    className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded px-2 py-1.5 outline-none focus:border-brand w-[60px]"
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={f.value}
                    onChange={(e) => updateFilter(idx, 'value', e.target.value)}
                    placeholder="value"
                    className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded px-2 py-1.5 outline-none focus:border-brand w-[90px]"
                  />
                  <button
                    type="button"
                    onClick={() => removeFilter(idx)}
                    className="text-xs text-content-muted hover:text-red-400 px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'teams' && teamFilterOpen && (
        <div className="card p-3 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-content-muted uppercase tracking-wider font-semibold">Stat filters</span>
            <button
              type="button"
              onClick={addTeamFilter}
              className="text-xs text-brand-light hover:underline font-medium"
            >
              + Add rule
            </button>
          </div>
          {teamStatFilters.length > 0 && (
            <div className="space-y-1.5">
              {teamStatFilters.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={f.column}
                    onChange={(e) => updateTeamFilter(idx, 'column', e.target.value)}
                    className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded px-2 py-1.5 outline-none focus:border-brand w-[80px]"
                  >
                    {TEAM_FILTERABLE_COLS[teamSubTab].map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  <select
                    value={f.operator}
                    onChange={(e) => updateTeamFilter(idx, 'operator', e.target.value)}
                    className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded px-2 py-1.5 outline-none focus:border-brand w-[60px]"
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={f.value}
                    onChange={(e) => updateTeamFilter(idx, 'value', e.target.value)}
                    placeholder="value"
                    className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded px-2 py-1.5 outline-none focus:border-brand w-[90px]"
                  />
                  <button
                    type="button"
                    onClick={() => removeTeamFilter(idx)}
                    className="text-xs text-content-muted hover:text-red-400 px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'teams' ? (
        <>
          <div className="flex items-center border-b border-bg-border">
            {['batting', 'pitching'].map((sub) => (
              <button
                key={sub}
                onClick={() => handleTeamSubTabSwitch(sub)}
                className={teamSubTab === sub ? 'tab-active' : 'tab-inactive'}
              >
                {sub.charAt(0).toUpperCase() + sub.slice(1)}
              </button>
            ))}
          </div>
          {loadingTeamData ? (
            <div className="flex items-center gap-2 text-content-muted text-sm p-4">
              <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              Loading team stats…
            </div>
          ) : (
            <Table data={teamSorted} columns={teamCols} sortKey={teamSortKey} sortDir={teamSortDir} onSort={handleTeamSort} />
          )}
        </>
      ) : loading ? (
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
