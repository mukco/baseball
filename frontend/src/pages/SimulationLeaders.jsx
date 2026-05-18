import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { SimBadge, TeamLogo } from '../components/sim/SimUI'
import RatingDots from '../components/RatingDots'

// ── Formatting helpers ────────────────────────────────────────────
const fmtInt = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : '—' }
const fmtDec = d => v => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(d) : '—' }

// ── Column definitions ────────────────────────────────────────────
const ALL_BATTER_COLS = {
  player_name: { label: 'Player' },
  team_abbr:   { label: 'Team' },
  g:      { label: 'G',    fmt: fmtInt },
  ab:     { label: 'AB',   fmt: fmtInt },
  avg:    { label: 'AVG',  fmt: fmtDec(3) },
  obp:    { label: 'OBP',  fmt: fmtDec(3) },
  slg:    { label: 'SLG',  fmt: fmtDec(3) },
  ops:    { label: 'OPS',  fmt: fmtDec(3) },
  woba:   { label: 'wOBA', fmt: fmtDec(3) },
  iso:    { label: 'ISO',  fmt: fmtDec(3) },
  tb:     { label: 'TB',   fmt: fmtInt },
  hr:     { label: 'HR',   fmt: fmtInt },
  double: { label: '2B',   fmt: fmtInt },
  triple: { label: '3B',   fmt: fmtInt },
  rbi:    { label: 'RBI',  fmt: fmtInt },
  r:      { label: 'R',    fmt: fmtInt },
  bb:     { label: 'BB',   fmt: fmtInt },
  k:      { label: 'K',    fmt: fmtInt },
  hbp:    { label: 'HBP',  fmt: fmtInt },
  sf:     { label: 'SF',   fmt: fmtInt },
}

const ALL_PITCHER_COLS = {
  player_name: { label: 'Player' },
  team_abbr:   { label: 'Team' },
  gs:   { label: 'GS',   fmt: fmtInt },
  g:    { label: 'G',    fmt: fmtInt },
  w:    { label: 'W',    fmt: fmtInt },
  l:    { label: 'L',    fmt: fmtInt },
  sv:   { label: 'SV',   fmt: fmtInt },
  ip:   { label: 'IP' },
  era:  { label: 'ERA',  fmt: fmtDec(2) },
  whip: { label: 'WHIP', fmt: fmtDec(2) },
  k:    { label: 'K',    fmt: fmtInt },
  bb:   { label: 'BB',   fmt: fmtInt },
  h:    { label: 'H',    fmt: fmtInt },
  hr:   { label: 'HR',   fmt: fmtInt },
  bf:   { label: 'BF',   fmt: fmtInt },
  k9:   { label: 'K/9',  fmt: fmtDec(2) },
  bb9:  { label: 'BB/9', fmt: fmtDec(2) },
  hr9:  { label: 'HR/9', fmt: fmtDec(2) },
  k_bb: { label: 'K/BB', fmt: fmtDec(2) },
}

const DEFAULT_BATTER_KEYS  = ['player_name', 'team_abbr', 'g', 'ab', 'avg', 'obp', 'slg', 'ops', 'woba', 'hr', 'rbi', 'r', 'bb', 'k']
const DEFAULT_PITCHER_KEYS = ['player_name', 'team_abbr', 'gs', 'g', 'ip', 'era', 'whip', 'k', 'bb', 'w', 'l', 'sv', 'k9', 'bb9']

const BATTER_FILTERABLE  = ['ab', 'g', 'avg', 'obp', 'slg', 'ops', 'woba', 'iso', 'hr', 'double', 'triple', 'rbi', 'r', 'bb', 'k', 'tb']
const PITCHER_FILTERABLE = ['gs', 'g', 'era', 'whip', 'k', 'bb', 'w', 'l', 'sv', 'k9', 'bb9', 'hr9', 'k_bb']

const OPERATORS = [
  { value: '>', label: '>' },
  { value: '>=', label: '≥' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' },
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
]

const BATTER_MIN_PRESETS  = [30, 50, 100, 200]   // Min AB
const PITCHER_MIN_PRESETS = [5, 10, 30, 50]       // Min IP (numeric)

// Columns that get heat-colored pills
const HEAT_COLS = {
  ops:  { lowIsBetter: false },
  avg:  { lowIsBetter: false },
  obp:  { lowIsBetter: false },
  woba: { lowIsBetter: false },
  hr:   { lowIsBetter: false },
  era:  { lowIsBetter: true },
  whip: { lowIsBetter: true },
}

// ── Helpers ───────────────────────────────────────────────────────

function parseIp(ip) {
  // "X.Y" where Y is 0/1/2 (thirds of an inning)
  if (!ip) return 0
  const [whole, frac = '0'] = String(ip).split('.')
  return parseInt(whole, 10) + parseInt(frac, 10) / 3
}

function applyFilters(rows, filters) {
  if (!filters.length) return rows
  return rows.filter(row => filters.every(f => {
    const raw = row[f.column]
    if (raw == null) return false
    const num = f.column === 'ip' ? parseIp(raw) : Number(raw)
    const val = Number(f.value)
    if (!Number.isFinite(num) || !Number.isFinite(val)) return false
    const r = Math.round(num * 10000) / 10000
    const v = Math.round(val * 10000) / 10000
    switch (f.operator) {
      case '>':  return r > v
      case '>=': return r >= v
      case '<':  return r < v
      case '<=': return r <= v
      case '=':  return Math.abs(r - v) < 0.00005
      case '!=': return Math.abs(r - v) >= 0.00005
      default:   return false
    }
  }))
}

function heatColor(value, allValues, lowIsBetter) {
  const nums = allValues.map(Number).filter(Number.isFinite)
  if (!nums.length || !Number.isFinite(Number(value))) return null
  const min = Math.min(...nums), max = Math.max(...nums)
  if (max === min) return null
  let pct = (Number(value) - min) / (max - min)
  if (lowIsBetter) pct = 1 - pct
  if (pct >= 0.85) return 'var(--color-stat-elite)'
  if (pct >= 0.65) return 'var(--color-stat-great)'
  if (pct >= 0.40) return 'var(--color-stat-avg)'
  if (pct >= 0.20) return 'var(--color-stat-below)'
  return 'var(--color-stat-poor)'
}

function toggleArr(arr, item) {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]
}

function exportCsv(rows, colDefs, visibleKeys, leagueId) {
  const headers = visibleKeys.map(k => colDefs[k]?.label || k)
  const lines = rows.map(row =>
    visibleKeys.map(k => {
      const raw = row[k]
      const formatted = raw != null ? (colDefs[k]?.fmt ? colDefs[k].fmt(raw) : raw) : '—'
      const str = String(formatted).replace(/"/g, '""')
      return str.includes(',') || str.includes('"') ? `"${str}"` : str
    }).join(',')
  )
  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sim-${leagueId}-leaders.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Column toggle dropdown ────────────────────────────────────────
function ColumnSelector({ colDefs, visibleKeys, onToggle }) {
  const [open, setOpen] = useState(false)
  const toggleableKeys = Object.keys(colDefs)
    .filter(k => k !== 'player_name' && k !== 'team_abbr')
    .sort((a, b) => colDefs[a].label.localeCompare(colDefs[b].label))

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary transition-colors"
      >
        Columns
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 z-50 bg-bg-elevated border border-bg-border rounded-xl shadow-2xl p-3 w-[240px] max-h-[360px] overflow-y-auto">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-2">Toggle columns</div>
            <div className="space-y-1">
              {toggleableKeys.map(key => (
                <label key={key} className="flex items-center gap-2 cursor-pointer px-1 py-1 rounded hover:bg-bg-border/40 transition-colors">
                  <input type="checkbox" checked={visibleKeys.includes(key)} onChange={() => onToggle(key)} className="accent-brand" />
                  <span className="text-xs text-content-primary">{colDefs[key].label}</span>
                  <span className="text-[9px] text-content-muted ml-auto font-mono">{key}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main stats table ──────────────────────────────────────────────
function SimTable({ rows, colDefs, visibleKeys, sortKey, sortDir, onSort, leagueId, ilPlayerIds }) {
  const heatValues = useMemo(() => {
    const out = {}
    for (const k of Object.keys(HEAT_COLS)) out[k] = rows.map(r => r[k])
    return out
  }, [rows])

  if (!rows.length) {
    return (
      <div className="card p-12 text-center">
        <div className="text-content-muted">No stats yet — simulate some games first.</div>
      </div>
    )
  }

  const IDENTITY = new Set(['player_name', 'team_abbr'])

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-bg-border">
              <th className="px-4 py-3 text-left text-[11px] text-content-muted font-semibold uppercase tracking-[0.08em] w-8">#</th>
              {visibleKeys.map(k => {
                const col = colDefs[k]
                const sortable = !IDENTITY.has(k)
                return (
                  <th
                    key={k}
                    onClick={() => sortable && onSort(k)}
                    className={`px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap select-none transition-colors ${
                      sortable ? 'cursor-pointer hover:text-content-primary' : ''
                    } ${sortKey === k ? 'text-brand-light' : 'text-content-muted'}`}
                  >
                    {col.label}
                    {sortKey === k && <span className="ml-0.5 text-brand">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.player_id ?? i} className="border-b border-bg-border last:border-0 hover:bg-bg-elevated transition-colors duration-100">
                <td className="px-4 py-3 text-content-muted font-mono text-xs">{i + 1}</td>
                {visibleKeys.map(k => {
                  const col = colDefs[k]
                  const raw = row[k]
                  const formatted = raw != null ? (col.fmt ? col.fmt(raw) : raw) : '—'

                  if (k === 'player_name') {
                    const onIl = ilPlayerIds?.has(row.player_id)
                    const isPitcher = !!row.era || !!row.ip
                    return (
                      <td key={k} className="px-3 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <Link
                            to={`/simulation/${leagueId}/player/${row.player_id}`}
                            className="flex items-center gap-2 font-medium text-content-primary hover:text-brand transition-colors"
                          >
                            <img
                              src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_40,q_auto:best/v1/people/${row.player_id}/headshot/67/current`}
                              alt=""
                              className="w-6 h-6 rounded-full object-cover bg-bg-border shrink-0"
                              onError={e => { e.target.style.display = 'none' }}
                            />
                            {formatted}
                            {onIl && (
                              <span className="text-[9px] font-bold px-1 rounded border text-red-400 border-red-400/40 bg-red-400/10">IL</span>
                            )}
                          </Link>
                          {row.ratings && (
                            <RatingDots ratings={row.ratings} isPitcher={isPitcher} />
                          )}
                        </div>
                      </td>
                    )
                  }

                  if (k === 'team_abbr') {
                    return (
                      <td key={k} className="px-3 py-3 whitespace-nowrap">
                        <Link to={`/simulation/${leagueId}/team/${row.team_id}`} className="flex items-center gap-1.5 hover:opacity-75 transition-opacity">
                          <TeamLogo teamId={row.team_id} abbr={row.team_abbr} color={row.team_color} size={16} />
                          <span className="font-mono text-content-secondary text-xs">{row.team_abbr || '—'}</span>
                        </Link>
                      </td>
                    )
                  }

                  if (HEAT_COLS[k] && raw != null) {
                    const color = heatColor(raw, heatValues[k], HEAT_COLS[k].lowIsBetter)
                    return (
                      <td key={k} className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[13px] font-mono font-semibold ${color ? '' : 'text-content-secondary'}`}
                          style={color ? { color, background: `color-mix(in oklch, ${color} 12%, transparent)` } : {}}
                        >
                          {formatted}
                        </span>
                      </td>
                    )
                  }

                  return (
                    <td key={k} className="px-3 py-3 font-mono text-content-secondary whitespace-nowrap">{formatted}</td>
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

// ── Page ──────────────────────────────────────────────────────────
export default function SimulationLeaders() {
  const { id } = useParams()
  const [tab, setTab]               = useState('batting')
  const [sortKey, setSortKey]       = useState('ops')
  const [sortDir, setSortDir]       = useState('desc')
  const [nameQuery, setNameQuery]   = useState('')
  const [minQual, setMinQual]       = useState(50)
  const [statFilters, setStatFilters] = useState([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [visibleKeys, setVisibleKeys] = useState([...DEFAULT_BATTER_KEYS])

  const { data, isLoading } = useQuery({
    queryKey:  ['sim-stats', id],
    queryFn:   () => api.simulations.stats(id),
    staleTime: 60_000,
  })

  const { data: injuryData } = useQuery({
    queryKey:  ['sim-injuries', id],
    queryFn:   () => api.simulations.injuries(id),
    staleTime: 60_000,
  })

  const ilPlayerIds = useMemo(() => {
    const ids = new Set()
    ;(injuryData?.active_il || []).forEach(inj => ids.add(inj.player_id))
    return ids
  }, [injuryData])

  // Merge all leaderboard category lists → unique players
  const allBatters = useMemo(() => {
    const byId = new Map()
    for (const players of Object.values(data?.batting_leaders || {})) {
      for (const p of players) {
        if (!byId.has(p.player_id)) byId.set(p.player_id, p)
      }
    }
    return [...byId.values()]
  }, [data])

  const allPitchers = useMemo(() => {
    const byId = new Map()
    for (const players of Object.values(data?.pitching_leaders || {})) {
      for (const p of players) {
        if (!byId.has(p.player_id)) byId.set(p.player_id, p)
      }
    }
    return [...byId.values()]
  }, [data])

  function handleTabSwitch(t) {
    setTab(t)
    setSortKey(t === 'batting' ? 'ops' : 'era')
    setSortDir(t === 'batting' ? 'desc' : 'asc')
    setMinQual(t === 'batting' ? 50 : 10)
    setVisibleKeys(t === 'batting' ? [...DEFAULT_BATTER_KEYS] : [...DEFAULT_PITCHER_KEYS])
    setStatFilters([])
    setNameQuery('')
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(['era', 'whip', 'bb9', 'hr9', 'l'].includes(key) ? 'asc' : 'desc')
    }
  }

  const colDefs        = tab === 'batting' ? ALL_BATTER_COLS : ALL_PITCHER_COLS
  const minPresets     = tab === 'batting' ? BATTER_MIN_PRESETS : PITCHER_MIN_PRESETS
  const filterableCols = tab === 'batting' ? BATTER_FILTERABLE  : PITCHER_FILTERABLE
  const rawRows        = tab === 'batting' ? allBatters : allPitchers

  const qualified = useMemo(() => {
    if (tab === 'batting') return rawRows.filter(r => (r.ab ?? 0) >= minQual)
    return rawRows.filter(r => parseIp(r.ip) >= minQual)
  }, [rawRows, tab, minQual])

  const nameFiltered = useMemo(() => {
    const q = nameQuery.trim().toLowerCase()
    return q ? qualified.filter(r => String(r.player_name).toLowerCase().includes(q)) : qualified
  }, [qualified, nameQuery])

  const statFiltered = useMemo(() => applyFilters(nameFiltered, statFilters), [nameFiltered, statFilters])

  const sorted = useMemo(() => {
    return [...statFiltered].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey]
      if (sortKey === 'ip') { av = parseIp(av); bv = parseIp(bv) }
      av = av ?? (sortDir === 'asc' ? Infinity : -Infinity)
      bv = bv ?? (sortDir === 'asc' ? Infinity : -Infinity)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [statFiltered, sortKey, sortDir])

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to={`/simulation/${id}`} className="text-content-muted hover:text-brand transition-colors text-sm">
          ← League
        </Link>
        <SimBadge />
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-content-primary">Season Leaders</h1>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Min qualifier */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-content-muted">{tab === 'batting' ? 'Min AB' : 'Min IP'}</span>
          <div className="flex rounded-lg border border-bg-border overflow-hidden">
            {minPresets.map((val, i) => (
              <button
                key={val}
                type="button"
                onClick={() => setMinQual(val)}
                className={`text-xs px-2.5 py-1.5 font-medium transition-colors ${
                  minQual === val ? 'bg-brand text-white' : 'bg-bg-elevated text-content-secondary hover:text-content-primary'
                } ${i > 0 ? 'border-l border-bg-border' : ''}`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* Name search */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-content-muted">Name</span>
          <input
            value={nameQuery}
            onChange={e => setNameQuery(e.target.value)}
            placeholder="Search..."
            className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded-md px-2 py-1.5 outline-none focus:border-brand w-[120px]"
          />
        </div>

        {/* Stat filter toggle */}
        <button
          type="button"
          onClick={() => setFilterOpen(o => !o)}
          className={`text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
            filterOpen || statFilters.length > 0
              ? 'border-brand bg-brand/10 text-brand'
              : 'border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary'
          }`}
        >
          {filterOpen ? 'Close' : '+ Filter'}{statFilters.length > 0 ? ` (${statFilters.length})` : ''}
        </button>

        {/* Column selector */}
        <ColumnSelector
          colDefs={colDefs}
          visibleKeys={visibleKeys}
          onToggle={key => setVisibleKeys(prev => toggleArr(prev, key))}
        />

        {/* CSV export */}
        <button
          type="button"
          onClick={() => exportCsv(sorted, colDefs, visibleKeys, id)}
          className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary transition-colors"
        >
          Export CSV
        </button>

        <span className="text-xs text-content-muted">{sorted.length} players</span>

        <div className="flex-1" />

        {/* Batting / Pitching tab */}
        <div className="flex items-center border-b border-bg-border">
          {['batting', 'pitching'].map(t => (
            <button
              key={t}
              onClick={() => handleTabSwitch(t)}
              className={tab === t ? 'tab-active' : 'tab-inactive'}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <div className="card p-3 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-content-muted uppercase tracking-wider font-semibold">Stat filters</span>
            <button
              type="button"
              onClick={() => setStatFilters(prev => [...prev, { column: filterableCols[0], operator: '>', value: '' }])}
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
                    onChange={e => setStatFilters(prev => prev.map((x, i) => i === idx ? { ...x, column: e.target.value } : x))}
                    className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded px-2 py-1.5 outline-none focus:border-brand"
                  >
                    {filterableCols.map(col => (
                      <option key={col} value={col}>{colDefs[col]?.label || col}</option>
                    ))}
                  </select>
                  <select
                    value={f.operator}
                    onChange={e => setStatFilters(prev => prev.map((x, i) => i === idx ? { ...x, operator: e.target.value } : x))}
                    className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded px-2 py-1.5 outline-none focus:border-brand w-[60px]"
                  >
                    {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                  </select>
                  <input
                    type="text"
                    value={f.value}
                    onChange={e => setStatFilters(prev => prev.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))}
                    placeholder="value"
                    className="bg-bg-elevated border border-bg-border text-content-primary text-xs rounded px-2 py-1.5 outline-none focus:border-brand w-[90px]"
                  />
                  <button
                    type="button"
                    onClick={() => setStatFilters(prev => prev.filter((_, i) => i !== idx))}
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

      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-content-muted">
          <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <span>Loading stats…</span>
        </div>
      ) : data?.error ? (
        <div className="card p-8 text-center text-red-400">{data.error}</div>
      ) : (
        <>
          <SimTable
            rows={sorted}
            colDefs={colDefs}
            visibleKeys={visibleKeys}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            leagueId={id}
            ilPlayerIds={ilPlayerIds}
          />

          {/* Team stats summary */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-bg-border">
              <h3 className="text-xs font-bold uppercase tracking-wide text-content-secondary">Team Stats</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-bg-border bg-bg-elevated">
                    <th className="px-4 py-2 text-left font-semibold text-content-muted">Team</th>
                    <th className="px-4 py-2 text-right font-semibold text-content-muted">RS</th>
                    <th className="px-4 py-2 text-right font-semibold text-content-muted">OPS</th>
                    <th className="px-4 py-2 text-right font-semibold text-content-muted">ERA</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.team_stats || [])
                    .filter(t => t.rs > 0 || t.ops || t.era)
                    .sort((a, b) => (b.rs || 0) - (a.rs || 0))
                    .map(t => (
                      <tr key={t.team_id} className="border-b border-bg-border/40 hover:bg-bg-surface transition-colors">
                        <td className="px-4 py-2.5">
                          <Link to={`/simulation/${id}/team/${t.team_id}`} className="flex items-center gap-2 hover:text-brand transition-colors">
                            <TeamLogo teamId={t.team_id} abbr={t.abbr} color={t.color} size={18} />
                            <span className="font-bold text-content-primary font-mono">{t.abbr}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-content-secondary tabular-nums">{t.rs ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-content-secondary tabular-nums">{t.ops?.toFixed(3) ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-content-secondary tabular-nums">{t.era?.toFixed(2) ?? '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
