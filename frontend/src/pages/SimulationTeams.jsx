import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { TeamLogo, SimBadge, SimSpinner } from '../components/sim/SimUI'

const LEAGUE_DIV_ORDER = {
  AL: ['AL East', 'AL Central', 'AL West'],
  NL: ['NL East', 'NL Central', 'NL West'],
}

const ASC_COLS = new Set(['l', 'ra', 'era'])

const COLS = [
  { key: 'rank',     label: '#',    numeric: true  },
  { key: 'gp',       label: 'GP',   numeric: true  },
  { key: 'w',        label: 'W',    numeric: true  },
  { key: 'l',        label: 'L',    numeric: true  },
  { key: 'pct',      label: 'PCT',  numeric: true,  fmt: v => v != null ? Number(v).toFixed(3) : '—' },
  { key: 'gb',       label: 'GB',   numeric: false, sortable: false },
  { key: 'rs',       label: 'RS',   numeric: true  },
  { key: 'ra',       label: 'RA',   numeric: true  },
  { key: 'run_diff', label: 'DIFF', numeric: true  },
  { key: 'ops',      label: 'OPS',  numeric: true,  fmt: v => v != null ? Number(v).toFixed(3) : '—' },
  { key: 'era',      label: 'ERA',  numeric: true,  fmt: v => v != null ? Number(v).toFixed(2) : '—' },
]

function fmtDiff(v) {
  if (v == null) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n > 0 ? `+${n}` : String(n)
}

// Flatten standings nested structure into [{team, division}] array
function flattenStandings(standings) {
  const rows = []
  const divRanks = {}

  for (const [lg, divs] of Object.entries(standings || {})) {
    for (const [div, teams] of Object.entries(divs)) {
      const divLabel = `${lg} ${div}`
      teams.forEach((t, i) => {
        rows.push({ ...t, division: divLabel, div_rank: i + 1 })
        divRanks[t.team_id] = i + 1
      })
    }
  }

  return rows
}

function diffColor(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n === 0) return 'text-content-secondary'
  return n > 0 ? 'text-emerald-400' : 'text-red-400'
}

function StreakBadge({ type }) {
  if (!type) return null
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full ${type === 'W' ? 'bg-emerald-400' : 'bg-red-400'}`} />
  )
}

function DivisionCard({ divLabel, teams, opsMap, eraMap, leagueId }) {
  const [lg] = divLabel.split(' ')
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-bg-border bg-bg-elevated flex items-center gap-2">
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${
          lg === 'AL'
            ? 'text-blue-400 border-blue-500/30 bg-blue-500/10'
            : 'text-red-400 border-red-500/30 bg-red-500/10'
        }`}>
          {lg}
        </span>
        <h3 className="text-xs font-bold uppercase tracking-wide text-content-secondary">
          {divLabel.replace(/^(AL|NL) /, '')}
        </h3>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-bg-border">
            <th className="px-4 py-2 text-left font-semibold text-content-muted w-[42%]">Team</th>
            <th className="px-2 py-2 text-right font-semibold text-content-muted">W</th>
            <th className="px-2 py-2 text-right font-semibold text-content-muted">L</th>
            <th className="px-2 py-2 text-right font-semibold text-content-muted">PCT</th>
            <th className="px-2 py-2 text-right font-semibold text-content-muted">GB</th>
            <th className="px-2 py-2 text-right font-semibold text-content-muted">RS</th>
            <th className="px-2 py-2 text-right font-semibold text-content-muted">OPS</th>
            <th className="px-2 py-2 text-right font-semibold text-content-muted">ERA</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => {
            const ops = opsMap[t.team_id]
            const era = eraMap[t.team_id]
            return (
              <tr key={t.team_id} className="border-b border-bg-border/40 last:border-0 hover:bg-bg-elevated transition-colors">
                <td className="px-4 py-2.5">
                  <Link
                    to={`/simulation/${leagueId}/team/${t.team_id}`}
                    className="flex items-center gap-2 hover:text-brand transition-colors group"
                  >
                    <span className="w-4 text-right text-[10px] font-mono text-content-muted shrink-0">{i + 1}</span>
                    <TeamLogo teamId={t.team_id} abbr={t.abbr} color={t.color} size={20} />
                    <div className="min-w-0">
                      <span className="font-bold text-content-primary group-hover:text-brand transition-colors truncate block">
                        {t.name || t.abbr}
                      </span>
                    </div>
                    <StreakBadge type={t.streak_type} />
                  </Link>
                </td>
                <td className="px-2 py-2.5 text-right font-mono font-bold text-content-primary tabular-nums">{t.w}</td>
                <td className="px-2 py-2.5 text-right font-mono text-content-secondary tabular-nums">{t.l}</td>
                <td className="px-2 py-2.5 text-right font-mono text-content-secondary tabular-nums">{t.pct?.toFixed(3) ?? '—'}</td>
                <td className="px-2 py-2.5 text-right font-mono text-content-muted tabular-nums">{t.gb ?? '—'}</td>
                <td className="px-2 py-2.5 text-right font-mono text-content-secondary tabular-nums">{t.rs ?? '—'}</td>
                <td className="px-2 py-2.5 text-right font-mono text-content-secondary tabular-nums">{ops?.toFixed(3) ?? '—'}</td>
                <td className="px-2 py-2.5 text-right font-mono text-content-secondary tabular-nums">{era?.toFixed(2) ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Division-grouped view ─────────────────────────────────────────
function DivisionView({ rows, opsMap, eraMap, leagueId }) {
  const grouped = useMemo(() => {
    const map = {}
    for (const r of rows) {
      const d = r.division
      if (!map[d]) map[d] = []
      map[d].push(r)
    }
    return map
  }, [rows])

  return (
    <div className="space-y-6">
      {Object.entries(LEAGUE_DIV_ORDER).map(([lg, divLabels]) => {
        const lgDivs = divLabels.filter(d => grouped[d]?.length)
        if (!lgDivs.length) return null
        return (
          <div key={lg}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-content-muted mb-3 px-1">
              {lg === 'AL' ? 'American League' : 'National League'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {lgDivs.map(divLabel => (
                <DivisionCard
                  key={divLabel}
                  divLabel={divLabel}
                  teams={grouped[divLabel] || []}
                  opsMap={opsMap}
                  eraMap={eraMap}
                  leagueId={leagueId}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Flat sortable table ───────────────────────────────────────────
function FlatView({ rows, opsMap, eraMap, leagueId, sortKey, sortDir, onSort }) {
  const enriched = useMemo(() =>
    rows.map(t => ({
      ...t,
      ops: opsMap[t.team_id] ?? null,
      era: eraMap[t.team_id] ?? null,
    })),
  [rows, opsMap, eraMap])

  const sorted = useMemo(() => {
    if (!sortKey) return enriched
    return [...enriched].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey]
      if (sortKey === 'pct' || sortKey === 'ops' || sortKey === 'era') {
        av = av ?? (sortDir === 'asc' ? Infinity : -Infinity)
        bv = bv ?? (sortDir === 'asc' ? Infinity : -Infinity)
        return sortDir === 'asc' ? av - bv : bv - av
      }
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      return 0
    })
  }, [enriched, sortKey, sortDir])

  function handleSort(key) {
    if (sortKey === key) {
      onSort(key, sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      onSort(key, ASC_COLS.has(key) ? 'asc' : 'desc')
    }
  }

  const sortableCols = COLS.filter(c => c.key !== 'rank' && c.sortable !== false)

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-bg-border bg-bg-elevated">
              <th className="px-4 py-2.5 text-left font-semibold text-content-muted w-8">#</th>
              <th className="px-4 py-2.5 text-left font-semibold text-content-muted">Team</th>
              {sortableCols.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-3 py-2.5 text-right font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors whitespace-nowrap ${
                    sortKey === col.key ? 'text-brand-light' : 'text-content-muted hover:text-content-primary'
                  }`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-0.5 text-brand">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <tr key={t.team_id} className="border-b border-bg-border/40 last:border-0 hover:bg-bg-elevated transition-colors">
                <td className="px-4 py-2.5 text-content-muted font-mono tabular-nums">{i + 1}</td>
                <td className="px-4 py-2.5">
                  <Link
                    to={`/simulation/${leagueId}/team/${t.team_id}`}
                    className="flex items-center gap-2 group"
                  >
                    <TeamLogo teamId={t.team_id} abbr={t.abbr} color={t.color} size={20} />
                    <div>
                      <div className="font-bold text-content-primary group-hover:text-brand transition-colors">{t.name || t.abbr}</div>
                      <div className="text-[10px] text-content-muted">{t.division}</div>
                    </div>
                    <StreakBadge type={t.streak_type} />
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-content-secondary tabular-nums">{t.gp ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono font-bold text-content-primary tabular-nums">{t.w}</td>
                <td className="px-3 py-2.5 text-right font-mono text-content-secondary tabular-nums">{t.l}</td>
                <td className="px-3 py-2.5 text-right font-mono text-content-secondary tabular-nums">{t.pct?.toFixed(3) ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-content-secondary tabular-nums">{t.rs ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-content-secondary tabular-nums">{t.ra ?? '—'}</td>
                <td className={`px-3 py-2.5 text-right font-mono font-semibold tabular-nums ${diffColor(t.run_diff)}`}>
                  {fmtDiff(t.run_diff)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-content-secondary tabular-nums">{t.ops?.toFixed(3) ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-content-secondary tabular-nums">{t.era?.toFixed(2) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────
export default function SimulationTeams() {
  const { id } = useParams()
  const [view, setView]       = useState('division')
  const [sortKey, setSortKey] = useState('pct')
  const [sortDir, setSortDir] = useState('desc')

  const { data: stateData, isLoading: stateLoading } = useQuery({
    queryKey:  ['sim-state', id],
    queryFn:   () => api.simulations.show(id),
    staleTime: 30_000,
  })

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey:  ['sim-stats', id],
    queryFn:   () => api.simulations.stats(id),
    staleTime: 60_000,
  })

  const isLoading = stateLoading || statsLoading

  const standings = stateData?.standings || {}
  const leagueName = stateData?.league?.name || stateData?.name || 'Simulation'

  // Flatten all teams from standings
  const allTeams = useMemo(() => flattenStandings(standings), [standings])

  // Build lookup maps for OPS and ERA from team_stats
  const opsMap = useMemo(() => {
    const m = {}
    for (const t of statsData?.team_stats || []) m[t.team_id] = t.ops
    return m
  }, [statsData])

  const eraMap = useMemo(() => {
    const m = {}
    for (const t of statsData?.team_stats || []) m[t.team_id] = t.era
    return m
  }, [statsData])

  const totalTeams = allTeams.length

  return (
    <div className="space-y-5 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link to={`/simulation/${id}`} className="text-content-muted hover:text-brand transition-colors text-sm">
          ← League
        </Link>
        <SimBadge />
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-content-primary">All Teams</h1>
        {totalTeams > 0 && (
          <span className="text-xs text-content-muted">{totalTeams} teams</span>
        )}
      </div>

      {/* View toggle */}
      <div className="flex items-center rounded border border-bg-border overflow-hidden w-fit bg-bg-elevated">
        {[['division', 'By Division'], ['flat', 'Sortable Table']].map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`px-4 py-1.5 text-sm font-bold transition-colors ${view === v ? 'tab-active' : 'tab-inactive'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <SimSpinner className="py-16" />
      ) : allTeams.length === 0 ? (
        <div className="card p-12 text-center text-content-muted">
          No teams yet — simulate some games first.
        </div>
      ) : view === 'division' ? (
        <DivisionView
          rows={allTeams}
          opsMap={opsMap}
          eraMap={eraMap}
          leagueId={id}
        />
      ) : (
        <FlatView
          rows={allTeams}
          opsMap={opsMap}
          eraMap={eraMap}
          leagueId={id}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(key, dir) => { setSortKey(key); setSortDir(dir) }}
        />
      )}
    </div>
  )
}
