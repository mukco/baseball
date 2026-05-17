import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import SystemComparison from '../components/SystemComparison'
import PlayerHoverCard from '../components/PlayerHoverCard'

const CURRENT_YEAR    = new Date().getFullYear()
const AVAILABLE_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3]

// ---------------------------------------------------------------------------
// NewRunPanel — select scenario, projection type, years, queue players, then run.
// ---------------------------------------------------------------------------
function NewRunPanel({ scenarios, onClose, onRunCreated }) {
  const [scenarioId, setScenarioId]         = useState(null)
  const [projType, setProjType]             = useState('rest_of_season')
  const [selectedSeasons, setSelectedSeasons] = useState([CURRENT_YEAR])
  const [name, setName]                     = useState('')
  const [queue, setQueue]                   = useState([])
  const [query, setQuery]                   = useState('')
  const [dropOpen, setDropOpen]             = useState(false)
  const inputRef   = useRef(null)
  const dropRef    = useRef(null)

  function toggleSeason(year) {
    if (year === CURRENT_YEAR) return  // current year always included
    setSelectedSeasons((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year].sort((a, b) => b - a)
    )
  }

  const defaultScenario = scenarios.find((s) => s.is_default) || scenarios[0]
  const activeScenarioId = scenarioId ?? defaultScenario?.id

  const { data: results = [], isFetching, isError: searchError } = useQuery({
    queryKey: ['player-search-proj', query],
    queryFn: () => api.players.search(query),
    enabled: query.length >= 2,
    staleTime: 30_000,
    retry: false,
  })

  const isBacktestRun = selectedSeasons.some((y) => y < CURRENT_YEAR)

  const createMutation = useMutation({
    mutationFn: () => api.projectionRuns.create({
      scenarioId:     activeScenarioId,
      playerIds:      queue.map((p) => p.id),
      projectionType: projType,
      seasons:        selectedSeasons,
      name:           name.trim() || undefined,
    }),
    onSuccess: (data) => {
      onRunCreated(data)
      onClose()
    },
  })

  useEffect(() => {
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function addPlayer(player) {
    if (!queue.find((p) => p.id === player.id)) setQueue((q) => [...q, player])
    setQuery('')
    setDropOpen(false)
    inputRef.current?.focus()
  }

  const filtered = results.filter((r) => !queue.find((q) => q.id === r.id)).slice(0, 7)

  return (
    <div className="card p-5 space-y-5 border-brand/40">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-content-primary">New Projection Run</h3>
        <button type="button" onClick={onClose} className="text-content-muted hover:text-content-primary text-lg leading-none">×</button>
      </div>

      {/* Scenario + type */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">Scenario</label>
          <select
            value={activeScenarioId ?? ''}
            onChange={(e) => setScenarioId(Number(e.target.value))}
            className="bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.is_default ? ' (default)' : ''}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center rounded-md border border-bg-border overflow-hidden">
          {[['rest_of_season', 'Rest of Season'], ['full_season', 'Full Season']].map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setProjType(val)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${projType === val ? 'tab-active' : 'tab-inactive'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Season selector */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">Seasons</label>
          <div className="flex items-center gap-1.5">
            {AVAILABLE_YEARS.map((year) => {
              const isCurrentYear = year === CURRENT_YEAR
              const checked = selectedSeasons.includes(year)
              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => toggleSeason(year)}
                  disabled={isCurrentYear}
                  title={isCurrentYear ? 'Current season is always included' : year < CURRENT_YEAR ? 'Backtest — compares projected vs actual' : ''}
                  className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                    checked
                      ? isCurrentYear
                        ? 'bg-brand/20 border-brand/40 text-brand cursor-default'
                        : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                      : 'border-bg-border text-content-muted hover:text-content-secondary hover:border-bg-border/80'
                  }`}
                >
                  {year}{!isCurrentYear && checked && ' ↩'}
                </button>
              )
            })}
            {isBacktestRun && (
              <span className="text-[10px] text-amber-400/80 ml-1">past seasons will compare vs actuals</span>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-40">
          <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">Run Name <span className="font-normal normal-case">(optional)</span></label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pre-trade-deadline"
            className="mt-1 w-full bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand"
          />
        </div>
      </div>

      {/* Player queue */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">Players</label>
        {queue.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {queue.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-brand/10 border border-brand/20 text-xs font-medium text-brand">
                {p.name}
                <button type="button" onClick={() => setQueue((q) => q.filter((x) => x.id !== p.id))} className="hover:opacity-60 leading-none">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="relative max-w-xs">
          <div className="flex items-center gap-2 bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 focus-within:border-brand transition-colors">
            <svg className="w-3.5 h-3.5 text-content-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setDropOpen(true) }}
              onFocus={() => query.length >= 2 && setDropOpen(true)}
              placeholder="Search players…"
              className="bg-transparent text-sm text-content-primary placeholder-content-muted outline-none w-full"
            />
            {isFetching && <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />}
          </div>
          {dropOpen && (searchError || filtered.length > 0) && (
            <div ref={dropRef} className="absolute top-full mt-1 left-0 z-50 w-64 bg-bg-elevated border border-bg-border rounded-xl shadow-2xl overflow-hidden">
              {searchError ? (
                <div className="px-4 py-3 text-xs text-content-muted italic">Search temporarily unavailable — check connection.</div>
              ) : filtered.map((p) => (
                <button key={p.id} onClick={() => addPlayer(p)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-bg-border/40 transition-colors text-left">
                  <img
                    src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_60,q_auto:best/v1/people/${p.id}/headshot/67/current`}
                    alt="" className="w-7 h-7 rounded-full object-cover bg-bg-border shrink-0"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-content-primary truncate">{p.name}</div>
                    <div className="text-xs text-content-muted truncate">{[p.position, p.team].filter(Boolean).join(' · ')}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {createMutation.error && (
        <p className="text-xs text-red-500">{createMutation.error.message}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || queue.length === 0}
          className="btn-primary disabled:opacity-40"
        >
          {createMutation.isPending
            ? (isBacktestRun ? 'Running backtests…' : 'Computing…')
            : `Run${isBacktestRun ? ' backtest' : ''} ${queue.length > 0 ? `(${queue.length} player${queue.length > 1 ? 's' : ''}, ${selectedSeasons.length} season${selectedSeasons.length > 1 ? 's' : ''})` : '— add players above'}`
          }
        </button>
        <button type="button" onClick={onClose} className="text-sm text-content-secondary hover:text-content-primary">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RunParamsBadge — compact display of the scenario params used in a run.
// ---------------------------------------------------------------------------
function RunParamsBadge({ run }) {
  if (!run) return null
  const p = run.scenario_params || {}
  const badges = [
    `${p.year1_weight ?? '?'}/${p.year2_weight ?? '?'}/${p.year3_weight ?? '?'} yr weights`,
    `${p.regression_factor ?? '?'}× regression`,
    p.age_curve_enabled ? `age ${p.age_curve_factor ?? 1}×` : 'age off',
    `${Math.round((p.statcast_weight ?? 0.5) * 100)}% Statcast`,
    p.player_type === 'pitcher'
      ? `${p.default_ip ?? 160} IP`
      : `${p.default_pa ?? 550} PA cap`,
  ]

  const ranAt = run.ran_at ? new Date(run.ran_at) : null
  const fmt = ranAt
    ? ranAt.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
      {fmt && <span className="text-content-secondary font-medium">{fmt}</span>}
      <span className="text-content-muted">·</span>
      <span className="font-medium text-content-secondary">{run.scenario_name}</span>
      {badges.map((b) => (
        <span key={b} className="px-1.5 py-0.5 rounded bg-bg-elevated border border-bg-border font-mono text-[10px] text-content-muted">
          {b}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat table helpers
// ---------------------------------------------------------------------------
const STAT_COLORS = [
  { min: 85, color: 'var(--color-stat-elite)' },
  { min: 65, color: 'var(--color-stat-great)' },
  { min: 40, color: 'var(--color-stat-avg)'   },
  { min: 20, color: 'var(--color-stat-below)' },
  { min: 0,  color: 'var(--color-stat-poor)'  },
]

function statColor(pct) {
  for (const { min, color } of STAT_COLORS) if (pct >= min) return color
  return 'var(--color-stat-poor)'
}

function percentileInRange(val, min, max) {
  if (max === min) return 50
  return Math.round(((val - min) / (max - min)) * 100)
}

const BATTER_COLS = [
  { key: 'pa',       label: 'PA',    fmt: (v) => v,                heat: false },
  { key: 'avg',      label: 'AVG',   fmt: (v) => v?.toFixed(3),    heat: true  },
  { key: 'obp',      label: 'OBP',   fmt: (v) => v?.toFixed(3),    heat: true  },
  { key: 'slg',      label: 'SLG',   fmt: (v) => v?.toFixed(3),    heat: true  },
  { key: 'ops',      label: 'OPS',   fmt: (v) => v?.toFixed(3),    heat: true  },
  { key: 'wrc_plus', label: 'wRC+',  fmt: (v) => v?.toFixed(0),    heat: true  },
  { key: 'hr',       label: 'HR',    fmt: (v) => v,                heat: true  },
  { key: 'rbi',      label: 'RBI',   fmt: (v) => v,                heat: true  },
  { key: 'r',        label: 'R',     fmt: (v) => v,                heat: true  },
  { key: 'bb_pct',   label: 'BB%',   fmt: (v) => v ? `${(v * 100).toFixed(1)}%` : '—', heat: true },
  { key: 'k_pct',    label: 'K%',    fmt: (v) => v ? `${(v * 100).toFixed(1)}%` : '—', heat: true, invert: true },
  { key: 'babip',    label: 'BABIP', fmt: (v) => v?.toFixed(3),    heat: false },
  { key: 'iso',      label: 'ISO',   fmt: (v) => v?.toFixed(3),    heat: true  },
]

const PITCHER_COLS = [
  { key: 'ip',     label: 'IP',    fmt: (v) => v,              heat: false },
  { key: 'era',    label: 'ERA',   fmt: (v) => v?.toFixed(2),  heat: true, invert: true },
  { key: 'fip',    label: 'FIP',   fmt: (v) => v?.toFixed(2),  heat: true, invert: true },
  { key: 'xfip',   label: 'xFIP',  fmt: (v) => v?.toFixed(2),  heat: true, invert: true },
  { key: 'whip',   label: 'WHIP',  fmt: (v) => v?.toFixed(2),  heat: true, invert: true },
  { key: 'k9',     label: 'K/9',   fmt: (v) => v?.toFixed(1),  heat: true  },
  { key: 'bb9',    label: 'BB/9',  fmt: (v) => v?.toFixed(1),  heat: true, invert: true },
  { key: 'k_pct',  label: 'K%',    fmt: (v) => v ? `${(v * 100).toFixed(1)}%` : '—', heat: true },
  { key: 'bb_pct', label: 'BB%',   fmt: (v) => v ? `${(v * 100).toFixed(1)}%` : '—', heat: true, invert: true },
  { key: 'ks',     label: 'K',     fmt: (v) => v,              heat: true  },
  { key: 'babip',  label: 'BABIP', fmt: (v) => v?.toFixed(3),  heat: false },
]

const COMPONENT_LABELS = {
  bb_pct: 'Walk %', k_pct: 'Strikeout %', babip: 'BABIP', iso: 'ISO',
  hr_fb_pct: 'HR/FB%', fb_pct: 'Fly Ball %', hbp_pct: 'HBP %',
  gb_pct: 'Ground Ball %', pa: 'PA', ip: 'IP',
}

// Per-key formatters — rate stats use .XXX, percentage stats use XX.X%
const COMPONENT_FMTS = {
  babip:    (v) => v.toFixed(3),
  iso:      (v) => v.toFixed(3),
  bb_pct:   (v) => `${(v * 100).toFixed(1)}%`,
  k_pct:    (v) => `${(v * 100).toFixed(1)}%`,
  hbp_pct:  (v) => `${(v * 100).toFixed(1)}%`,
  fb_pct:   (v) => `${(v * 100).toFixed(1)}%`,
  gb_pct:   (v) => `${(v * 100).toFixed(1)}%`,
  hr_fb_pct:(v) => `${(v * 100).toFixed(1)}%`,
}

function HeatCell({ value, allValues, col }) {
  if (!col.heat || value == null) {
    return <td className="px-3 py-2 text-right font-mono text-sm text-content-primary">{col.fmt(value) ?? '—'}</td>
  }
  const nums = allValues.filter((v) => v != null)
  if (nums.length < 2) return <td className="px-3 py-2 text-right font-mono text-sm text-content-primary">{col.fmt(value) ?? '—'}</td>
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  let pct = percentileInRange(value, min, max)
  if (col.invert) pct = 100 - pct
  const color = statColor(pct)
  return (
    <td className="px-3 py-2 text-right">
      <span
        className="inline-block px-2 py-0.5 rounded text-sm font-mono font-medium"
        style={{ color, background: `color-mix(in oklch, ${color} 12%, transparent)` }}
      >
        {col.fmt(value)}
      </span>
    </td>
  )
}

function ComponentBreakdown({ components }) {
  if (!components || Object.keys(components).length === 0) return null
  const entries = Object.entries(components).filter(([k]) => k !== 'pa' && k !== 'ip' && COMPONENT_LABELS[k])
  return (
    <div className="flex flex-wrap gap-4 py-3 px-4 bg-bg-elevated border-t border-bg-border">
      <span className="text-[11px] font-semibold text-content-muted uppercase tracking-wide self-center">Components</span>
      {entries.map(([key, val]) => (
        <div key={key} className="text-center">
          <div className="text-[10px] text-content-muted uppercase tracking-wide">{COMPONENT_LABELS[key] || key}</div>
          <div className="font-mono text-sm font-medium text-content-primary">
            {typeof val === 'number' ? (COMPONENT_FMTS[key]?.(val) ?? val.toFixed(2)) : '—'}
          </div>
        </div>
      ))}
    </div>
  )
}

function ProjectionRow({ row, cols, allColValues, playerType, expandedId, onToggle }) {
  const isExpanded = expandedId === row.player_id
  const stats = row.projected_stats || {}
  const displayName = row.player_name || `Player #${row.player_id}`

  return (
    <>
      <tr
        className="border-b border-bg-border hover:bg-bg-surface cursor-pointer transition-colors"
        onClick={() => onToggle(row.player_id)}
      >
        <td className="px-4 py-2 w-8 text-center text-content-muted">
          <svg
            className={`w-3.5 h-3.5 mx-auto transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </td>
        <td className="px-4 py-2 font-medium text-content-primary text-sm whitespace-nowrap">
          <PlayerHoverCard playerId={row.player_id}>
            <Link
              to={`/player/${row.player_id}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-brand transition-colors"
            >
              {displayName}
            </Link>
          </PlayerHoverCard>
        </td>
        {cols.map((col) => (
          <HeatCell
            key={col.key}
            value={stats[col.key]}
            allValues={allColValues[col.key] || []}
            col={col}
          />
        ))}
      </tr>
      {isExpanded && (
        <tr className="bg-bg-base">
          <td colSpan={cols.length + 2} className="p-0">
            <ComponentBreakdown components={row.component_stats} />
            <div className="px-6 py-4 border-t border-bg-border">
              <SystemComparison playerId={row.player_id} playerType={playerType} ourStats={stats} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Accuracy summary — projected vs actual for backtest runs
// ---------------------------------------------------------------------------
const ACCURACY_STAT_ORDER = {
  batter:  ['avg', 'obp', 'slg', 'ops', 'wrc_plus', 'hr', 'rbi', 'r', 'bb_pct', 'k_pct', 'babip', 'iso'],
  pitcher: ['era', 'fip', 'xfip', 'whip', 'k9', 'bb9', 'k_pct', 'bb_pct', 'babip'],
}

const ACCURACY_STAT_LABELS = {
  avg: 'AVG', obp: 'OBP', slg: 'SLG', ops: 'OPS', wrc_plus: 'wRC+',
  hr: 'HR', rbi: 'RBI', r: 'R', bb_pct: 'BB%', k_pct: 'K%', babip: 'BABIP', iso: 'ISO',
  era: 'ERA', fip: 'FIP', xfip: 'xFIP', whip: 'WHIP', k9: 'K/9', bb9: 'BB/9',
}

function fmtAccStat(stat, val) {
  if (val == null || !Number.isFinite(val)) return '—'
  if (['hr', 'rbi', 'r', 'ks'].includes(stat)) return Math.round(val).toString()
  if (['k_pct', 'bb_pct', 'hr_fb_pct'].includes(stat)) return `${(val * 100).toFixed(1)}%`
  const abs = Math.abs(val)
  if (abs >= 10) return val.toFixed(1)
  if (abs >= 1)  return val.toFixed(2)
  return val.toFixed(3)
}

function fmtDelta(stat, delta) {
  if (delta == null || !Number.isFinite(delta)) return null
  const abs = Math.abs(delta)
  let str
  if (['hr', 'rbi', 'r', 'ks'].includes(stat))         str = Math.round(abs).toString()
  else if (['k_pct', 'bb_pct', 'hr_fb_pct'].includes(stat)) str = `${(abs * 100).toFixed(1)}%`
  else if (abs >= 10) str = abs.toFixed(1)
  else if (abs >= 1)  str = abs.toFixed(2)
  else                str = abs.toFixed(3)
  return { str, sign: delta > 0 ? '+' : delta < 0 ? '−' : '' }
}

// Lower-is-better stats — delta sign is inverted for coloring
const INVERT_STATS = new Set(['era', 'fip', 'xfip', 'whip', 'bb9', 'k_pct_pitcher', 'bb_pct'])

function AccuracySummary({ projections, playerType, loading, runSeasons }) {
  const backtestRows = projections.filter(
    (r) => r.accuracy_delta && Object.keys(r.accuracy_delta).length > 0
  )

  // Aggregate projected and actual per stat across all player-seasons
  const statSummary = useMemo(() => {
    const byProj   = {}  // stat => projected values
    const byActual = {}  // stat => actual values

    backtestRows.forEach((row) => {
      const projStats   = row.projected_stats || {}
      const actualStats = row.actual_stats    || {}
      Object.keys(row.accuracy_delta)
        .filter((s) => s !== 'pa' && s !== 'ip')
        .forEach((stat) => {
          const proj   = projStats[stat]
          const actual = actualStats[stat]
          if (proj == null || actual == null) return
          ;(byProj[stat]   ??= []).push(Number(proj))
          ;(byActual[stat] ??= []).push(Number(actual))
        })
    })

    const result = {}
    Object.keys(byProj).forEach((stat) => {
      const ps = byProj[stat]
      const as = byActual[stat]
      const n  = ps.length
      const avgProj   = ps.reduce((a, b) => a + b, 0) / n
      const avgActual = as.reduce((a, b) => a + b, 0) / n
      const deltas    = ps.map((p, i) => p - as[i])
      result[stat] = {
        avgProj,
        avgActual,
        avgDelta: deltas.reduce((a, b) => a + b, 0) / n,
        mae:      deltas.map(Math.abs).reduce((a, b) => a + b, 0) / n,
        n,
      }
    })
    return result
  }, [backtestRows])

  const pastSeasons = runSeasons.filter((y) => y < CURRENT_YEAR).sort((a, b) => a - b)

  const orderedStats = useMemo(() => {
    const preferred = ACCURACY_STAT_ORDER[playerType] || []
    const present   = preferred.filter((s) => statSummary[s])
    const rest      = Object.keys(statSummary).filter((s) => !preferred.includes(s))
    return [...present, ...rest]
  }, [statSummary, playerType])

  if (loading) {
    return (
      <div className="card p-8 text-center text-content-muted text-sm flex items-center justify-center gap-2">
        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        Computing accuracy…
      </div>
    )
  }

  if (!backtestRows.length) {
    return (
      <div className="card p-8 text-center text-content-muted text-sm">
        No backtest data — select a past season when creating a run to compare projections vs actuals.
      </div>
    )
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-content-primary text-sm">Projection Accuracy</h3>
        <p className="text-xs text-content-muted mt-0.5">
          Averaged across {backtestRows.length} player-season{backtestRows.length !== 1 ? 's' : ''}
          {pastSeasons.length > 0 && ` · ${pastSeasons.join(', ')}`}
          {' '}· + = over-projected, − = under-projected
        </p>
      </div>

      {/* Stat grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bg-border">
              <th className="py-1.5 pr-4 text-left text-[10px] font-semibold text-content-muted uppercase tracking-wide">Stat</th>
              <th className="py-1.5 px-3 text-right text-[10px] font-semibold text-content-muted uppercase tracking-wide">Projected</th>
              <th className="py-1.5 px-3 text-right text-[10px] font-semibold text-content-muted uppercase tracking-wide">Actual</th>
              <th className="py-1.5 px-3 text-right text-[10px] font-semibold text-content-muted uppercase tracking-wide">Error</th>
              <th className="py-1.5 pl-3 text-right text-[10px] font-semibold text-content-muted uppercase tracking-wide">MAE</th>
            </tr>
          </thead>
          <tbody>
            {orderedStats.map((stat) => {
              const { avgProj, avgActual, avgDelta, mae } = statSummary[stat]
              const delta = fmtDelta(stat, avgDelta)
              const isInvert  = INVERT_STATS.has(stat)
              // Good = our delta is small (MAE-based color)
              const maeColor = mae === 0
                ? 'text-content-muted'
                : mae < Math.abs(avgActual) * 0.05
                  ? 'text-emerald-400'
                  : mae < Math.abs(avgActual) * 0.12
                    ? 'text-amber-400'
                    : 'text-orange-400'
              // Sign color: green if we're in the better direction, red if worse
              const signGood = delta
                ? (delta.sign === '+' && !isInvert) || (delta.sign === '−' && isInvert) || delta.sign === ''
                : true
              const deltaColor = delta?.sign === '' ? 'text-content-muted' : signGood ? 'text-emerald-400' : 'text-orange-400'

              return (
                <tr key={stat} className="border-b border-bg-border/50 last:border-0 hover:bg-bg-surface transition-colors">
                  <td className="py-2 pr-4 font-semibold text-xs text-content-secondary uppercase tracking-wide">
                    {ACCURACY_STAT_LABELS[stat] || stat}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-content-primary">
                    {fmtAccStat(stat, avgProj)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-content-secondary">
                    {fmtAccStat(stat, avgActual)}
                  </td>
                  <td className={`py-2 px-3 text-right font-mono font-medium ${deltaColor}`}>
                    {delta ? `${delta.sign}${delta.str}` : '—'}
                  </td>
                  <td className={`py-2 pl-3 text-right font-mono text-xs ${maeColor}`}>
                    {fmtAccStat(stat, mae)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Per-player breakdown */}
      {backtestRows.length > 1 && (
        <details className="pt-2 border-t border-bg-border">
          <summary className="text-[10px] font-semibold text-content-muted uppercase tracking-wide cursor-pointer select-none">
            Per-player breakdown
          </summary>
          <div className="mt-2 space-y-1">
            {Object.values(
              backtestRows.reduce((acc, row) => {
                const key = row.player_id
                if (!acc[key]) acc[key] = { name: row.player_name || `#${row.player_id}`, seasons: [] }
                acc[key].seasons.push({ season: row.season, proj: row.projected_stats, actual: row.actual_stats })
                return acc
              }, {})
            ).map(({ name, seasons }) => (
              <div key={name} className="text-xs py-1.5 border-b border-bg-border/40 last:border-0">
                <span className="font-medium text-content-primary">{name}</span>
                {seasons.sort((a, b) => a.season - b.season).map(({ season, proj, actual }) => (
                  <span key={season} className="ml-4 text-content-muted">
                    <span className="font-mono text-[10px] text-content-secondary">{season} </span>
                    {orderedStats.slice(0, 6).map((stat) => {
                      const p = proj?.[stat]
                      const a = actual?.[stat]
                      if (p == null || a == null) return null
                      const d = p - a
                      const df = fmtDelta(stat, d)
                      const isInvert = INVERT_STATS.has(stat)
                      const good = df?.sign === '' || (df?.sign === '+' && !isInvert) || (df?.sign === '−' && isInvert)
                      return (
                        <span key={stat} className="mr-2">
                          <span className="text-content-muted">{ACCURACY_STAT_LABELS[stat] || stat} </span>
                          <span className={`font-mono ${good ? 'text-emerald-400' : 'text-orange-400'}`}>
                            {df ? `${df.sign}${df.str}` : '—'}
                          </span>
                        </span>
                      )
                    })}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Projections() {
  const qc = useQueryClient()
  const [playerType, setPlayerType]   = useState('batter')
  const [selectedRunId, setSelectedRunId] = useState(null)
  const [showNewRun, setShowNewRun]   = useState(false)
  const [activeSeason, setActiveSeason] = useState(null) // null = most recent; 'accuracy' = accuracy tab
  const [sortKey, setSortKey]         = useState(null)
  const [sortDir, setSortDir]         = useState('desc')
  const [expandedId, setExpandedId]   = useState(null)

  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: api.scenarios.list,
    staleTime: 60_000,
  })

  const { data: runsData = { runs: [] }, isLoading: loadingRuns } = useQuery({
    queryKey: ['projection-runs'],
    queryFn: () => api.projectionRuns.list(),
    staleTime: 30_000,
  })

  const runs = runsData.runs || []

  // Auto-select the most recent run when runs first load
  useEffect(() => {
    if (!selectedRunId && runs.length > 0) {
      setSelectedRunId(runs[0].id)
    }
  }, [runs, selectedRunId])

  const effectiveRunId = selectedRunId ?? runs[0]?.id ?? null
  const selectedRun = runs.find((r) => r.id === effectiveRunId) || null

  // Reset season tab when switching runs
  useEffect(() => { setActiveSeason(null) }, [effectiveRunId])

  const runSeasons = selectedRun?.seasons ?? (selectedRun ? [selectedRun.season] : [])
  const isMultiSeason = selectedRun?.is_multi_season ?? false

  // Season to show in the table (null = let backend default to most recent / all)
  const seasonForQuery = activeSeason === 'accuracy' ? null : (activeSeason ?? selectedRun?.season)

  const { data: leaderboard = { projections: [] }, isFetching: loadingLeaderboard } = useQuery({
    queryKey: ['projections-leaderboard', effectiveRunId, playerType, seasonForQuery],
    queryFn: () => api.projections.leaderboard({ runId: effectiveRunId, playerType, season: seasonForQuery }),
    enabled: !!effectiveRunId,
    staleTime: 5 * 60_000,
  })

  const cols = playerType === 'batter' ? BATTER_COLS : PITCHER_COLS
  const defaultSortKey = playerType === 'batter' ? 'wrc_plus' : 'fip'

  const rows = useMemo(() => {
    const data = leaderboard.projections || []
    const key = sortKey || defaultSortKey
    return [...data].sort((a, b) => {
      const av = a.projected_stats?.[key] ?? (sortDir === 'desc' ? -Infinity : Infinity)
      const bv = b.projected_stats?.[key] ?? (sortDir === 'desc' ? -Infinity : Infinity)
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [leaderboard, sortKey, sortDir, defaultSortKey])

  // Pre-compute per-column value arrays for HeatCell
  const allColValues = useMemo(() => {
    const result = {}
    cols.forEach((col) => {
      result[col.key] = rows.map((r) => r.projected_stats?.[col.key]).filter((v) => v != null)
    })
    return result
  }, [rows, cols])

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      const col = cols.find((c) => c.key === key)
      setSortDir(col?.invert ? 'asc' : 'desc')
    }
  }

  function handleRunCreated(data) {
    const newRun = data.run
    qc.invalidateQueries({ queryKey: ['projection-runs'] })
    qc.invalidateQueries({ queryKey: ['projections-leaderboard'] })
    setSelectedRunId(newRun.id)
    setShowNewRun(false)
  }

  const deleteMutation = useMutation({
    mutationFn: (id) => api.projectionRuns.destroy(id),
    onSuccess: (_, deletedId) => {
      const remaining = runs.filter((r) => r.id !== deletedId)
      setSelectedRunId(remaining[0]?.id ?? null)
      qc.invalidateQueries({ queryKey: ['projection-runs'] })
      qc.invalidateQueries({ queryKey: ['projections-leaderboard'] })
    },
  })

  function handleDeleteRun() {
    if (!effectiveRunId) return
    const run = runs.find((r) => r.id === effectiveRunId)
    if (!window.confirm(`Delete "${run?.label}"? This cannot be undone.`)) return
    deleteMutation.mutate(effectiveRunId)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Projections</h1>
          <p className="text-content-muted text-sm mt-1">
            Component-based player projections using weighted historical stats, regression to mean, and age curves.
          </p>
        </div>
        <Link to="/projections/scenarios" className="btn-primary inline-flex items-center gap-1.5 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Manage Scenarios
        </Link>
      </div>

      {/* New Run panel */}
      {showNewRun && (
        <NewRunPanel
          scenarios={scenarios}
          onClose={() => setShowNewRun(false)}
          onRunCreated={handleRunCreated}
        />
      )}

      {/* Controls bar */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Run selector */}
          <div className="flex items-center gap-2 flex-1 min-w-48">
            <label className="text-xs font-semibold text-content-muted uppercase tracking-wide shrink-0">Run</label>
            {loadingRuns ? (
              <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            ) : runs.length === 0 ? (
              <span className="text-sm text-content-muted italic">No runs yet</span>
            ) : (
              <>
                <select
                  value={effectiveRunId ?? ''}
                  onChange={(e) => setSelectedRunId(Number(e.target.value))}
                  className="flex-1 bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand"
                >
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleDeleteRun}
                  disabled={!effectiveRunId || deleteMutation.isPending}
                  title="Delete this run"
                  className="shrink-0 flex items-center justify-center w-8 h-8 rounded border border-bg-border text-content-muted hover:text-red-400 hover:border-red-400/40 hover:bg-red-400/5 transition-colors disabled:opacity-30"
                >
                  {deleteMutation.isPending ? (
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </>
            )}
          </div>

          {/* Player type tabs */}
          <div className="flex items-center rounded-md border border-bg-border overflow-hidden">
            {[['batter', 'Batters'], ['pitcher', 'Pitchers']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => { setPlayerType(val); setSortKey(null) }}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${playerType === val ? 'tab-active' : 'tab-inactive'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowNewRun((o) => !o)}
            className="btn-primary text-sm inline-flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Run
          </button>

          {loadingLeaderboard && (
            <div className="ml-auto flex items-center gap-1.5 text-sm text-content-muted">
              <div className="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          )}
        </div>

        {/* Run metadata */}
        {selectedRun && <RunParamsBadge run={selectedRun} />}

        {/* Year tabs for multi-season runs */}
        {isMultiSeason && (
          <div className="flex items-center gap-1 border-t border-bg-border pt-3">
            <span className="text-[10px] font-semibold text-content-muted uppercase tracking-wide mr-2">Season</span>
            {[...runSeasons].sort((a, b) => b - a).map((yr) => {
              const isCurrentYr = yr === CURRENT_YEAR
              return (
                <button
                  key={yr}
                  onClick={() => setActiveSeason(yr)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    activeSeason === yr
                      ? 'bg-brand/15 text-brand'
                      : 'text-content-muted hover:text-content-secondary'
                  }`}
                >
                  {yr}{isCurrentYr ? '' : ' ↩'}
                </button>
              )
            })}
            <button
              onClick={() => setActiveSeason('accuracy')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ml-2 ${
                activeSeason === 'accuracy'
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              Accuracy summary
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {!effectiveRunId && !loadingRuns && (
        <div className="card p-10 text-center text-content-muted">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm font-medium mb-1">No projection runs yet.</p>
          <p className="text-xs">Click <strong>New Run</strong> above, add players, and run your first projection.</p>
        </div>
      )}

      {/* Accuracy summary tab */}
      {activeSeason === 'accuracy' && effectiveRunId && (
        <AccuracySummary
          projections={leaderboard.projections || []}
          playerType={playerType}
          loading={loadingLeaderboard}
          runSeasons={runSeasons}
        />
      )}

      {/* Table */}
      {activeSeason !== 'accuracy' && effectiveRunId && rows.length === 0 && !loadingLeaderboard && (
        <div className="card p-8 text-center text-content-muted text-sm">
          No {playerType} projections in this run — try switching to {playerType === 'batter' ? 'Pitchers' : 'Batters'} or create a new run.
        </div>
      )}

      {activeSeason !== 'accuracy' && rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-bg-border bg-bg-elevated">
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3 font-semibold text-content-secondary text-xs uppercase tracking-wide">Player</th>
                {cols.map((col) => {
                  const active = (sortKey || defaultSortKey) === col.key
                  return (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="px-3 py-3 text-right cursor-pointer select-none font-semibold text-xs uppercase tracking-wide transition-colors hover:text-content-primary"
                      style={{ color: active ? 'rgb(var(--color-content-primary))' : undefined }}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        {col.label}
                        {active && (
                          <svg className={`w-3 h-3 ${sortDir === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <ProjectionRow
                  key={row.player_id ?? i}
                  row={row}
                  cols={cols}
                  allColValues={allColValues}
                  playerType={playerType}
                  expandedId={expandedId}
                  onToggle={(id) => setExpandedId((cur) => cur === id ? null : id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
