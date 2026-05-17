import { useState, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, subDays } from 'date-fns'
import { api } from '../api'
import { StatCard } from '../components/StatCard'
import PlayerLink from '../components/PlayerLink'
import FactoidsPanel from '../components/FactoidsPanel'
import TransactionsList, { TYPE_FILTERS, RANGES } from '../components/TransactionsList'
import RollingAverageChart from '../components/charts/RollingAverageChart'
import { ballparkImageForVenue } from '../lib/ballparkImages'

const CURRENT_SEASON = new Date().getFullYear()
const SEASONS = Array.from({ length: CURRENT_SEASON - 2009 }, (_, i) => CURRENT_SEASON - i)
const TABS = ['batting', 'pitching', 'roster', 'schedule', 'transactions']

// ─── helpers ───────────────────────────────────────────────────────────────

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function fmtDate(date) {
  if (!date) return '-'
  try { return format(parseISO(date), 'MMM d, yyyy') } catch { return date }
}

function fmtRate(v, digits = 3) {
  if (v == null) return '-'
  const n = Number(v).toFixed(digits)
  return digits === 3 ? n.replace(/^0/, '') : n
}

function fmtPct(v) {
  if (v == null) return '-'
  return `${(Number(v) * 100).toFixed(1)}%`
}

function fmtMoney(v) {
  if (v == null) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(v)
}

function isPitcherPos(pos) {
  return pos === 'P' || pos === 'SP' || pos === 'RP'
}

// Convert MLB rank (1–30) to 0–100 percentile. Rank 1 = best = ~100%.
function rankToPercentile(rank, total = 30) {
  if (rank == null) return null
  return Math.round(((total - rank) / (total - 1)) * 100)
}

// ─── Baseball Diamond ──────────────────────────────────────────────────────

const DIAMOND_POSITIONS = [
  { key: 'CF', label: 'CF', x: 50, y: 4  },
  { key: 'LF', label: 'LF', x: 10, y: 22 },
  { key: 'RF', label: 'RF', x: 90, y: 22 },
  { key: 'SS', label: 'SS', x: 36, y: 50 },
  { key: '2B', label: '2B', x: 64, y: 50 },
  { key: '3B', label: '3B', x: 20, y: 63 },
  { key: '1B', label: '1B', x: 80, y: 63 },
  { key: 'P',  label: 'P',  x: 50, y: 63 },
  { key: 'C',  label: 'C',  x: 50, y: 93 },
]

function DiamondBadge({ player, label }) {
  const content = (
    <div className="flex flex-col items-center gap-0.5">
      {player ? (
        <img
          src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${player.id}/headshot/67/current`}
          alt={player.name}
          title={player.name}
          className="w-6 h-6 rounded-full object-cover bg-bg-elevated border border-bg-border"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-bg-elevated border border-bg-border/40 flex items-center justify-center">
          <span className="text-[7px] text-content-muted">{label}</span>
        </div>
      )}
      <span className="text-[8px] font-semibold text-content-muted leading-none">{label}</span>
    </div>
  )
  if (!player) return <div>{content}</div>
  return (
    <Link to={`/player/${player.id}`} className="hover:opacity-80 transition-opacity">
      {content}
    </Link>
  )
}

function DiamondLineup({ roster }) {
  const byPos = {}
  roster.forEach(p => {
    if (p.position === 'TWP') {
      const games = p.statSummary?.pitching?.games ?? 0
      if (!byPos['P'] || games > (byPos['P'].statSummary?.pitching?.games ?? 0)) byPos['P'] = p
      return
    }
    if (!DIAMOND_POSITIONS.find(d => d.key === p.position)) return
    const games = p.statSummary?.hitting?.games ?? p.statSummary?.pitching?.games ?? 0
    const cur = byPos[p.position]
    const curGames = cur ? (cur.statSummary?.hitting?.games ?? cur.statSummary?.pitching?.games ?? 0) : -1
    if (games > curGames) byPos[p.position] = p
  })

  return (
    <div className="relative w-full select-none" style={{ paddingBottom: '100%' }}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 0,34 Q 50,2 100,34" stroke="#2D3748" strokeWidth="0.6" />
        <line x1="50" y1="84" x2="0"   y2="34" stroke="#2D3748" strokeWidth="0.4" strokeDasharray="2 1.5" />
        <line x1="50" y1="84" x2="100" y2="34" stroke="#2D3748" strokeWidth="0.4" strokeDasharray="2 1.5" />
        <polygon points="50,84 72,62 50,40 28,62" stroke="#374151" strokeWidth="0.7" />
        <circle cx="50" cy="62" r="2" fill="#374151" />
      </svg>
      {DIAMOND_POSITIONS.map(({ key, label, x, y }) => (
        <div key={key} className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
          <DiamondBadge player={byPos[key] || null} label={label} />
        </div>
      ))}
    </div>
  )
}

// ─── Roster rows ────────────────────────────────────────────────────────────

function PitcherRow({ player }) {
  const s = player.statSummary?.pitching || {}
  return (
    <tr className="border-b border-bg-border/50 last:border-0 hover:bg-bg-elevated/40 transition-colors">
      <td className="py-2 pr-3"><PlayerLink playerId={player.id} name={player.name} imageClassName="w-6 h-6" /></td>
      <td className="py-2 text-xs text-content-muted">{player.jerseyNumber ? `#${player.jerseyNumber}` : ''}</td>
      <td className="py-2 text-right font-mono text-sm">{s.games ?? '-'}</td>
      <td className="py-2 text-right font-mono text-sm">{s.inningsPitched ?? '-'}</td>
      <td className="py-2 text-right font-mono text-sm">{fmtRate(s.era, 2)}</td>
      <td className="py-2 text-right font-mono text-sm">{fmtRate(s.whip, 2)}</td>
      <td className="py-2 text-right font-mono text-sm">{s.strikeOuts ?? '-'}</td>
    </tr>
  )
}

function HitterRow({ player }) {
  const s = player.statSummary?.hitting || {}
  return (
    <tr className="border-b border-bg-border/50 last:border-0 hover:bg-bg-elevated/40 transition-colors">
      <td className="py-2 pr-3"><PlayerLink playerId={player.id} name={player.name} imageClassName="w-6 h-6" /></td>
      <td className="py-2 text-xs text-content-muted">{player.position}</td>
      <td className="py-2 text-xs text-content-muted">{player.jerseyNumber ? `#${player.jerseyNumber}` : ''}</td>
      <td className="py-2 text-right font-mono text-sm">{s.games ?? '-'}</td>
      <td className="py-2 text-right font-mono text-sm">{s.plateAppearances ?? '-'}</td>
      <td className="py-2 text-right font-mono text-sm">{fmtRate(s.avg)}</td>
      <td className="py-2 text-right font-mono text-sm">{fmtRate(s.ops)}</td>
      <td className="py-2 text-right font-mono text-sm">{s.homeRuns ?? '-'}</td>
      <td className="py-2 text-right font-mono text-sm">{s.rbi ?? '-'}</td>
    </tr>
  )
}

function SortTh({ label, sortKey, sort, onSort, className = '' }) {
  const active = sort.key === sortKey
  return (
    <th
      className={`cursor-pointer select-none text-[10px] uppercase tracking-wider text-content-muted hover:text-content-primary transition-colors ${active ? 'text-content-primary' : ''} ${className}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span className="ml-0.5 opacity-50 text-[8px]">{active ? (sort.dir === 'desc' ? '▼' : '▲') : '⇅'}</span>
    </th>
  )
}

function RosterCard({ player }) {
  const lastName = player.name?.split(' ').slice(1).join(' ') || player.name
  return (
    <Link
      to={`/player/${player.id}`}
      className="flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-bg-elevated transition-colors text-center min-w-0"
    >
      <img
        src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${player.id}/headshot/67/current`}
        alt={player.name}
        className="w-10 h-10 rounded-full object-cover bg-bg-elevated border border-bg-border shrink-0"
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
      <div className="min-w-0 w-full">
        <div className="text-[10px] font-medium text-content-primary truncate leading-tight">{lastName}</div>
        <div className="text-[9px] text-content-muted leading-tight">
          {player.jerseyNumber ? `#${player.jerseyNumber}` : player.position}
        </div>
      </div>
    </Link>
  )
}

function BasesIndicator({ bases = {} }) {
  function Base({ on }) {
    return <span className={`w-3 h-3 rotate-45 border ${on ? 'bg-brand border-brand' : 'bg-bg-base border-bg-border'}`} />
  }
  return (
    <span className="inline-grid grid-cols-3 grid-rows-3 gap-1 items-center">
      <span /><Base on={Boolean(bases.second)} /><span />
      <Base on={Boolean(bases.third)} /><span /><Base on={Boolean(bases.first)} />
      <span /><span /><span />
    </span>
  )
}

// ─── Transactions widget ────────────────────────────────────────────────────

function TeamTransactions({ teamId }) {
  const startDate = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
  const endDate   = new Date().toISOString().slice(0, 10)
  const [rangeDays, setRangeDays]   = useState(30)
  const [typeFilter, setTypeFilter] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['team-transactions', teamId],
    queryFn: () => api.transactions.list({ teamId, startDate, endDate, limit: 500 }),
    enabled: !!teamId,
    staleTime: 10 * 60 * 1000,
  })

  const activeCodes = TYPE_FILTERS.find(f => f.key === typeFilter)?.codes
  const cutoff = subDays(new Date(), rangeDays)

  const transactions = useMemo(() => {
    const all = data?.transactions || []
    return all.filter(tx => {
      if (tx.date && new Date(tx.date) < cutoff) return false
      if (activeCodes && !activeCodes.includes(tx.type_code)) return false
      return true
    })
  }, [data, cutoff, activeCodes])

  if (!isLoading && !(data?.transactions?.length)) return null

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted">Transactions</h2>
        <span className="text-[10px] text-content-muted">{transactions.length} moves</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {RANGES.map(r => (
          <button key={r.days} onClick={() => setRangeDays(r.days)}
            className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition-colors ${
              rangeDays === r.days ? 'bg-bg-border text-content-primary' : 'text-content-muted hover:text-content-secondary'
            }`}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {TYPE_FILTERS.map(f => (
          <button key={f.key} onClick={() => setTypeFilter(f.key)}
            className={`text-[11px] px-2.5 py-1 rounded font-medium transition-colors ${
              typeFilter === f.key ? 'bg-bg-border text-content-primary' : 'text-content-muted hover:text-content-secondary'
            }`}>
            {f.label}
          </button>
        ))}
      </div>
      <TransactionsList transactions={transactions} loading={isLoading} showPlayer emptyLabel="No transactions in this range." />
    </section>
  )
}

// ─── Game Log Table ─────────────────────────────────────────────────────────

function GameLogTable({ games, group = 'batting' }) {
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' })

  function toggleSort(key) {
    setSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }))
  }

  const sorted = useMemo(() => {
    if (!games?.length) return []
    return [...games].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key]
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = typeof av === 'string' ? String(av).localeCompare(String(bv)) : Number(av) - Number(bv)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [games, sort])

  if (!sorted.length) return null

  const isBatting = group === 'batting'

  return (
    <section className="card p-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted mb-3">
        Game Log — {isBatting ? 'Batting' : 'Pitching'}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bg-border">
              <SortTh label="Date"     sortKey="date"       sort={sort} onSort={toggleSort} className="text-left py-2 pr-3" />
              <SortTh label="Opp"      sortKey="opponent"   sort={sort} onSort={toggleSort} className="text-left py-2" />
              <th className="py-2 text-left text-[10px] uppercase tracking-wider text-content-muted">H/A</th>
              {isBatting ? (
                <>
                  <SortTh label="R"  sortKey="runsScored"  sort={sort} onSort={toggleSort} className="text-right py-2" />
                  <SortTh label="H"  sortKey="hits"        sort={sort} onSort={toggleSort} className="text-right py-2" />
                </>
              ) : (
                <SortTh label="RA" sortKey="runsAllowed"   sort={sort} onSort={toggleSort} className="text-right py-2" />
              )}
              <SortTh label="W/L" sortKey="won" sort={sort} onSort={toggleSort} className="text-right py-2" />
              <th className="py-2 text-right text-[10px] uppercase tracking-wider text-content-muted"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(g => {
              const won = g.won
              return (
                <tr key={g.gamePk} className="border-b border-bg-border/50 last:border-0 hover:bg-bg-elevated/40 transition-colors">
                  <td className="py-2 pr-3 text-content-secondary font-mono text-xs">
                    {g.date ? (() => { try { return format(parseISO(g.date), 'MMM d') } catch { return g.date } })() : '-'}
                  </td>
                  <td className="py-2 text-content-primary">{g.opponent ?? '-'}</td>
                  <td className="py-2 text-content-muted text-xs">{g.isHome ? 'vs' : '@'}</td>
                  {isBatting ? (
                    <>
                      <td className="py-2 text-right font-mono">{g.runsScored ?? '-'}</td>
                      <td className="py-2 text-right font-mono">{g.hits ?? '-'}</td>
                    </>
                  ) : (
                    <td className="py-2 text-right font-mono">{g.runsAllowed ?? '-'}</td>
                  )}
                  <td className={`py-2 text-right font-mono font-semibold text-xs ${won ? 'text-green-400' : 'text-red-400'}`}>
                    {won ? 'W' : 'L'} {g.runsScored}-{g.runsAllowed}
                  </td>
                  <td className="py-2 text-right">
                    {g.gamePk && (
                      <Link className="text-brand-light hover:underline text-xs" to={`/game/${g.gamePk}`}>Box</Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Season History Table ───────────────────────────────────────────────────

function BattingHistoryTable({ rows }) {
  const [sort, setSort] = useState({ key: 'season', dir: 'desc' })

  function toggleSort(key) {
    setSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }))
  }

  const sorted = useMemo(() => {
    if (!rows?.length) return []
    return [...rows].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key]
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : Number(av) - Number(bv)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort])

  if (!sorted.length) return null

  const cols = [
    { key: 'season', label: 'Season', fmt: v => v, right: false },
    { key: 'g',      label: 'G',   fmt: v => v ?? '-' },
    { key: 'avg',    label: 'AVG', fmt: v => fmtRate(v) },
    { key: 'obp',    label: 'OBP', fmt: v => fmtRate(v) },
    { key: 'slg',    label: 'SLG', fmt: v => fmtRate(v) },
    { key: 'ops',    label: 'OPS', fmt: v => fmtRate(v) },
    { key: 'woba',   label: 'wOBA', fmt: v => fmtRate(v) },
    { key: 'hr',     label: 'HR',  fmt: v => v ?? '-' },
    { key: 'r',      label: 'R',   fmt: v => v ?? '-' },
    { key: 'rbi',    label: 'RBI', fmt: v => v ?? '-' },
    { key: 'sb',     label: 'SB',  fmt: v => v ?? '-' },
    { key: 'so',     label: 'SO',  fmt: v => v ?? '-' },
    { key: 'bb',     label: 'BB',  fmt: v => v ?? '-' },
  ]

  return (
    <section className="card p-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted mb-3">Season History — Batting</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bg-border">
              {cols.map(c => (
                <SortTh key={c.key} label={c.label} sortKey={c.key} sort={sort} onSort={toggleSort}
                  className={c.right === false ? 'text-left py-2 pr-3' : 'text-right py-2'} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.season} className="border-b border-bg-border/50 last:border-0 hover:bg-bg-elevated/40 transition-colors">
                {cols.map((c, i) => (
                  <td key={c.key} className={`py-2 font-mono text-sm ${i === 0 ? 'text-content-primary pr-3' : 'text-right text-content-secondary'}`}>
                    {c.fmt(row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PitchingHistoryTable({ rows }) {
  const [sort, setSort] = useState({ key: 'season', dir: 'desc' })

  function toggleSort(key) {
    setSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }))
  }

  const sorted = useMemo(() => {
    if (!rows?.length) return []
    return [...rows].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key]
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : Number(av) - Number(bv)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort])

  if (!sorted.length) return null

  const cols = [
    { key: 'season', label: 'Season', fmt: v => v, right: false },
    { key: 'era',    label: 'ERA',   fmt: v => fmtRate(v, 2) },
    { key: 'fip',    label: 'FIP',   fmt: v => v != null ? Number(v).toFixed(2) : '-' },
    { key: 'whip',   label: 'WHIP',  fmt: v => fmtRate(v, 2) },
    { key: 'ip',     label: 'IP',    fmt: v => v ?? '-' },
    { key: 'pSo',    label: 'SO',    fmt: v => v ?? '-' },
    { key: 'pBb',    label: 'BB',    fmt: v => v ?? '-' },
    { key: 'pHr',    label: 'HR',    fmt: v => v ?? '-' },
    { key: 'kPer9',  label: 'K/9',   fmt: v => v != null ? Number(v).toFixed(2) : '-' },
    { key: 'bbPer9', label: 'BB/9',  fmt: v => v != null ? Number(v).toFixed(2) : '-' },
    { key: 'sv',     label: 'SV',    fmt: v => v ?? '-' },
  ]

  return (
    <section className="card p-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted mb-3">Season History — Pitching</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bg-border">
              {cols.map(c => (
                <SortTh key={c.key} label={c.label} sortKey={c.key} sort={sort} onSort={toggleSort}
                  className={c.right === false ? 'text-left py-2 pr-3' : 'text-right py-2'} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.season} className="border-b border-bg-border/50 last:border-0 hover:bg-bg-elevated/40 transition-colors">
                {cols.map((c, i) => (
                  <td key={c.key} className={`py-2 font-mono text-sm ${i === 0 ? 'text-content-primary pr-3' : 'text-right text-content-secondary'}`}>
                    {c.fmt(row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function TeamProfile() {
  const { id } = useParams()
  const [tab, setTab]       = useState('batting')
  const [season, setSeason] = useState(CURRENT_SEASON)
  const [pitSort, setPitSort] = useState({ key: 'era', dir: 'asc' })
  const [hitSort, setHitSort] = useState({ key: 'ops', dir: 'desc' })

  const infoQ = useQuery({
    queryKey: ['team-info', id],
    queryFn:  () => api.teams.info(id),
    enabled:  Boolean(id),
    staleTime: 10 * 60 * 1000,
  })
  const statsQ = useQuery({
    queryKey: ['team-stats', id, season],
    queryFn:  () => api.teams.stats(id, season),
    enabled:  Boolean(id),
    staleTime: season === CURRENT_SEASON ? 15 * 60 * 1000 : Infinity,
  })
  const gameLogQ = useQuery({
    queryKey: ['team-game-log', id, season],
    queryFn:  () => api.teams.gameLog(id, season),
    enabled:  Boolean(id),
    staleTime: season === CURRENT_SEASON ? 5 * 60 * 1000 : Infinity,
  })
  const historyQ = useQuery({
    queryKey: ['team-history', id],
    queryFn:  () => api.teams.history(id),
    enabled:  Boolean(id),
    staleTime: 60 * 60 * 1000,
  })

  function toggleSort(setFn, key) {
    setFn(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }))
  }

  if (infoQ.isLoading) return <div className="card p-8 text-content-muted">Loading team profile...</div>
  if (infoQ.error)     return <div className="card p-8 text-content-muted">Failed to load. {infoQ.error.message}</div>

  const team  = infoQ.data || {}
  const stats = statsQ.data || {}
  const gameLog = Array.isArray(gameLogQ.data) ? gameLogQ.data : []
  const history = Array.isArray(historyQ.data) ? historyQ.data : []

  const roster  = team.roster || []
  const games   = team.recentGames || []
  const featuredGame = games.find(g => g.abstractState === 'Live' || g.abstractState === 'Preview') || games[0]
  const isLive    = featuredGame?.abstractState === 'Live'
  const isPreview = featuredGame?.abstractState === 'Preview'
  const count = featuredGame?.count || {}

  const pitchers = roster.filter(p => isPitcherPos(p.position) || p.position === 'TWP')
  const hitters  = roster.filter(p => !isPitcherPos(p.position))
  const ballparkImage = ballparkImageForVenue(team.venue)

  function sortRoster(list, sort, statFn) {
    if (!sort.key) return list
    return [...list].sort((a, b) => {
      const av = statFn(a, sort.key), bv = statFn(b, sort.key)
      if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sort.dir === 'asc' ? av - bv : bv - av
    })
  }
  function pitcherVal(p, key) {
    const s = p.statSummary?.pitching || {}
    return { era: parseFloat(s.era)||0, whip: parseFloat(s.whip)||0, k: parseInt(s.strikeOuts)||0, g: parseInt(s.games)||0, ip: parseFloat(s.inningsPitched)||0, name: p.name||'' }[key] ?? 0
  }
  function hitterVal(p, key) {
    const s = p.statSummary?.hitting || {}
    return { avg: parseFloat(s.avg)||0, ops: parseFloat(s.ops)||0, hr: parseInt(s.homeRuns)||0, rbi: parseInt(s.rbi)||0, pa: parseInt(s.plateAppearances)||0, g: parseInt(s.games)||0, name: p.name||'', pos: p.position||'' }[key] ?? 0
  }

  const sortedPitchers = sortRoster(pitchers, pitSort, pitcherVal)
  const sortedHitters  = sortRoster(hitters,  hitSort, hitterVal)

  const b = stats.batting  || {}
  const p = stats.pitching || {}
  const br = b.ranks || {}
  const pr = p.ranks || {}

  return (
    <div className="space-y-10 py-10">
      <div className="flex items-center justify-between">
        <Link className="text-sm text-brand-light hover:underline" to="/">← Schedule</Link>
      </div>

      {/* ── Header card ── */}
      <section className="card-raised overflow-hidden">
        <div className="h-1.5" style={{ background: team.color || '#333333' }} />
        <div className="relative overflow-hidden">
          {ballparkImage && (
            <div aria-hidden="true" className="absolute inset-0">
              <img src={ballparkImage} alt="" loading="lazy" className="h-full w-full object-cover opacity-45 transition-all duration-500" />
              <div className="absolute inset-0 bg-gradient-to-b from-bg-surface/82 via-bg-surface/38 to-bg-surface/86" />
              <div className="absolute inset-0 bg-gradient-to-r from-bg-surface/78 via-transparent to-bg-surface/78" />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-bg-surface" />
            </div>
          )}
          <div className="relative z-10 p-6 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
            <div className="space-y-3 min-w-0">
              <div className="flex items-center gap-4">
                {team.id && (
                  <img
                    src={`https://www.mlbstatic.com/team-logos/${team.id}.svg`}
                    alt={team.name}
                    className="w-16 h-16 object-contain shrink-0"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                )}
                <div>
                  <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-content-primary">{team.name}</h1>
                  <div className="flex items-center gap-2 mt-1 text-sm text-content-primary flex-wrap">
                    {team.league && <span>{team.league}</span>}
                    {team.division && <span>· {team.division}</span>}
                    {team.venue && <span>· {team.venue}</span>}
                  </div>
                </div>
              </div>

              {team.standing?.wins != null && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-2xl font-bold font-mono text-content-primary">
                    {team.standing.wins}–{team.standing.losses}
                    {team.standing.pct && (
                      <span className="text-base font-normal text-content-secondary ml-2">({team.standing.pct})</span>
                    )}
                  </span>
                  {team.standing.divisionRank > 0 && (
                    <span className="text-sm text-content-secondary">
                      {ordinal(team.standing.divisionRank)} in {team.division}
                      {team.standing.gamesBack && team.standing.gamesBack !== '-' && (
                        <span className="text-content-secondary"> · {team.standing.gamesBack} GB</span>
                      )}
                    </span>
                  )}
                  {team.standing.wildCardRank > 0 && (
                    <span className="text-sm text-content-secondary">
                      {ordinal(team.standing.wildCardRank)} WC
                      {team.standing.wildCardGamesBack && team.standing.wildCardGamesBack !== '-' && (
                        <span className="text-content-secondary"> · {team.standing.wildCardGamesBack}</span>
                      )}
                    </span>
                  )}
                  {team.standing.streak && (
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-bg-elevated border border-bg-border text-content-muted">
                      {team.standing.streak}
                    </span>
                  )}
                  {team.standing.lastTen && (
                    <span className="text-xs text-content-secondary">L10: {team.standing.lastTen}</span>
                  )}
                </div>
              )}

              {featuredGame && (
                <div className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 space-y-1.5">
                  <div className="text-xs text-content-muted uppercase tracking-wider inline-flex items-center gap-2">
                    <span className={isLive ? 'text-green-400' : 'text-content-muted'}>
                      {isLive ? 'Live Game' : isPreview ? 'Upcoming' : 'Most Recent'}
                    </span>
                    <span>{featuredGame.isHome ? 'vs' : '@'} {featuredGame.opponent?.abbreviation || featuredGame.opponent?.name}</span>
                  </div>
                  {!isPreview && (
                    <div className="text-sm font-medium text-content-primary">
                      {team.abbreviation} {featuredGame.teamScore ?? '-'} – {featuredGame.oppScore ?? '-'} {featuredGame.opponent?.abbreviation}
                    </div>
                  )}
                  {isLive && (
                    <div className="text-xs text-content-secondary flex items-center gap-2 flex-wrap">
                      {featuredGame.inningHalf} {featuredGame.currentInning} · {count.balls}-{count.strikes} · {count.outs} out{Number(count.outs) === 1 ? '' : 's'}
                      <BasesIndicator bases={featuredGame.bases} />
                    </div>
                  )}
                  {!isLive && !isPreview && (
                    <div className="text-xs text-content-secondary">{fmtDate(featuredGame.gameDate)}</div>
                  )}
                </div>
              )}
            </div>

            {roster.length > 0 && (
              <div className="w-48 shrink-0 self-start">
                <p className="text-[10px] font-semibold text-content-muted uppercase tracking-widest mb-1 text-center">Lineup</p>
                <DiamondLineup roster={roster} />
              </div>
            )}
          </div>
        </div>
      </section>

      <FactoidsPanel
        queryKey={['team-factoids', team.id]}
        queryFn={() => api.factoids.team(team.id)}
      />

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-bg-border">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'tab-active' : 'tab-inactive'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Season picker (batting + pitching tabs) ── */}
      {(tab === 'batting' || tab === 'pitching') && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-content-muted uppercase tracking-wider">Season</span>
          <select
            value={season}
            onChange={e => setSeason(Number(e.target.value))}
            className="text-sm bg-bg-elevated border border-bg-border rounded-lg px-3 py-1.5 text-content-primary focus:outline-none focus:ring-1 focus:ring-brand/50"
          >
            {SEASONS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {statsQ.isLoading && <span className="text-xs text-content-muted animate-pulse">Loading…</span>}
        </div>
      )}

      {/* ── Batting tab ── */}
      {tab === 'batting' && (
        <div className="space-y-6">
          {/* StatCards */}
          {b.avg != null && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="AVG" value={fmtRate(b.avg)} percentile={rankToPercentile(br.avg)} subtitle={br.avg ? `#${br.avg} MLB` : null} />
              <StatCard label="OBP" value={fmtRate(b.obp)} percentile={rankToPercentile(br.obp)} subtitle={br.obp ? `#${br.obp} MLB` : null} />
              <StatCard label="SLG" value={fmtRate(b.slg)} percentile={rankToPercentile(br.slg)} subtitle={br.slg ? `#${br.slg} MLB` : null} />
              <StatCard label="OPS" value={fmtRate(b.ops)} percentile={rankToPercentile(br.ops)} subtitle={br.ops ? `#${br.ops} MLB` : null} />
            </div>
          )}
          {b.woba != null && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="wOBA" value={fmtRate(b.woba)} />
              <StatCard label="ISO"  value={fmtRate(b.iso)} />
              <StatCard label="K%"   value={fmtPct(b.kPct)} percentile={rankToPercentile(br.so)} subtitle={br.so ? `#${br.so} MLB` : null} />
              <StatCard label="BB%"  value={fmtPct(b.bbPct)} percentile={rankToPercentile(br.bb)} subtitle={br.bb ? `#${br.bb} MLB` : null} />
            </div>
          )}

          {/* Counting stats row */}
          {b.hr != null && (
            <div className="grid grid-cols-4 sm:grid-cols-4 gap-3">
              <StatCard label="HR"  value={b.hr}  percentile={rankToPercentile(br.hr)}  subtitle={br.hr  ? `#${br.hr} MLB`  : null} />
              <StatCard label="R"   value={b.r}   percentile={rankToPercentile(br.r)}   subtitle={br.r   ? `#${br.r} MLB`   : null} />
              <StatCard label="RBI" value={b.rbi} percentile={rankToPercentile(br.rbi)} subtitle={br.rbi ? `#${br.rbi} MLB` : null} />
              <StatCard label="SB"  value={b.sb}  percentile={rankToPercentile(br.sb)}  subtitle={br.sb  ? `#${br.sb} MLB`  : null} />
            </div>
          )}

          {/* Rolling chart */}
          {gameLog.length > 0 && (
            <section className="card p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted mb-3">
                Runs Scored per Game — 10-Game Rolling Avg
              </h2>
              <RollingAverageChart
                data={gameLog}
                valueKey="runsScored"
                valueLabel="Runs Scored"
                color="#6366F1"
                windowSize={10}
                height={200}
                formatValue={v => Math.round(v)}
              />
            </section>
          )}

          {/* Sortable game log */}
          {gameLog.length > 0 && <GameLogTable games={gameLog} group="batting" />}

          {/* History table */}
          <BattingHistoryTable rows={history} />
        </div>
      )}

      {/* ── Pitching tab ── */}
      {tab === 'pitching' && (
        <div className="space-y-6">
          {/* StatCards */}
          {p.era != null && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="ERA"  value={fmtRate(p.era, 2)}  percentile={rankToPercentile(pr.era)}  subtitle={pr.era  ? `#${pr.era} MLB`  : null} />
              <StatCard label="WHIP" value={fmtRate(p.whip, 2)} percentile={rankToPercentile(pr.whip)} subtitle={pr.whip ? `#${pr.whip} MLB` : null} />
              <StatCard label="FIP"  value={p.fip != null ? Number(p.fip).toFixed(2) : '-'} />
              <StatCard label="K/9"  value={p.kPer9 != null ? Number(p.kPer9).toFixed(2) : '-'} />
            </div>
          )}
          {p.bbPer9 != null && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="BB/9"    value={Number(p.bbPer9).toFixed(2)} />
              <StatCard label="K-BB%"   value={p.kMinusBbPct != null ? fmtPct(p.kMinusBbPct) : '-'} />
              <StatCard label="SO"      value={p.so} percentile={rankToPercentile(pr.so)}  subtitle={pr.so  ? `#${pr.so} MLB`  : null} />
              <StatCard label="SV"      value={p.sv} />
            </div>
          )}

          {/* Counting stats row */}
          {p.bb != null && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="BB"   value={p.bb} percentile={rankToPercentile(pr.bb)} subtitle={pr.bb ? `#${pr.bb} MLB` : null} />
              <StatCard label="HR"   value={p.hr} percentile={rankToPercentile(pr.hr)} subtitle={pr.hr ? `#${pr.hr} MLB` : null} />
              <StatCard label="Hits" value={p.hits} />
              <StatCard label="SVO"  value={p.svo} />
            </div>
          )}

          {/* Rolling chart */}
          {gameLog.length > 0 && (
            <section className="card p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted mb-3">
                Runs Allowed per Game — 10-Game Rolling Avg
              </h2>
              <RollingAverageChart
                data={gameLog}
                valueKey="runsAllowed"
                valueLabel="Runs Allowed"
                color="#EF4444"
                windowSize={10}
                height={200}
                formatValue={v => Math.round(v)}
              />
            </section>
          )}

          {/* Sortable game log */}
          {gameLog.length > 0 && <GameLogTable games={gameLog} group="pitching" />}

          {/* History table */}
          <PitchingHistoryTable rows={history} />
        </div>
      )}

      {/* ── Roster tab ── */}
      {tab === 'roster' && (
        <div className="space-y-6">
          {team.finance && (
            <section className="card p-5 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted">Payroll & CBT</h2>
                <span className="text-[10px] text-content-muted">Source: {team.finance.source}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ['Payroll', fmtMoney(team.finance.estimatedPayroll)],
                  ['CBT Payroll', fmtMoney(team.finance.cbtPayroll)],
                  ['CBT Threshold', fmtMoney(team.finance.cbtThreshold)],
                  ['CBT Space', fmtMoney(team.finance.cbtSpaceRemaining)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-bg-elevated border border-bg-border px-3 py-3">
                    <div className="text-lg font-bold font-mono text-content-primary">{value}</div>
                    <div className="text-[10px] text-content-muted uppercase tracking-widest">{label}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-content-secondary leading-relaxed">{team.finance.terminologyNote}</p>
            </section>
          )}

          {team.frontOffice && (
            <section className="card p-5 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted">Leadership</h2>
                <span className="text-[10px] text-content-muted">Source: {team.frontOffice.source}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  ['Manager', team.frontOffice.manager],
                  ['Baseball Ops', team.frontOffice.frontOffice?.presidentBaseballOps],
                  ['Business', team.frontOffice.frontOffice?.presidentBusiness],
                ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-bg-elevated border border-bg-border px-3 py-3">
                    <div className="text-base font-semibold text-content-primary">{value}</div>
                    <div className="text-[10px] text-content-muted uppercase tracking-widest">{label}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {roster.length > 0 && (
            <section className="card p-5 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-6">
                <div className="space-y-4">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted">Active Roster</h2>
                  {pitchers.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-2 pb-1 border-b border-bg-border/40">Pitchers</h3>
                      <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-12 gap-0.5">
                        {pitchers.map(p => <RosterCard key={p.id} player={p} />)}
                      </div>
                    </div>
                  )}
                  {hitters.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-2 pb-1 border-b border-bg-border/40">Position Players</h3>
                      <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-12 gap-0.5">
                        {hitters.map(p => <RosterCard key={p.id} player={p} />)}
                      </div>
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  <p className="text-[10px] font-semibold text-content-muted uppercase tracking-widest mb-2 text-center">Lineup</p>
                  <DiamondLineup roster={roster} />
                </div>
              </div>
            </section>
          )}

          <section className="card p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted mb-3">Pitchers</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bg-border">
                    <SortTh label="Name"  sortKey="name" sort={pitSort} onSort={k => toggleSort(setPitSort, k)} className="text-left py-2 pr-3" />
                    <th className="text-right py-2 text-[10px] uppercase tracking-wider text-content-muted">#</th>
                    <SortTh label="G"    sortKey="g"    sort={pitSort} onSort={k => toggleSort(setPitSort, k)} className="text-right py-2" />
                    <SortTh label="IP"   sortKey="ip"   sort={pitSort} onSort={k => toggleSort(setPitSort, k)} className="text-right py-2" />
                    <SortTh label="ERA"  sortKey="era"  sort={pitSort} onSort={k => toggleSort(setPitSort, k)} className="text-right py-2" />
                    <SortTh label="WHIP" sortKey="whip" sort={pitSort} onSort={k => toggleSort(setPitSort, k)} className="text-right py-2" />
                    <SortTh label="K"    sortKey="k"    sort={pitSort} onSort={k => toggleSort(setPitSort, k)} className="text-right py-2" />
                  </tr>
                </thead>
                <tbody>
                  {sortedPitchers.map(p => <PitcherRow key={p.id} player={p} />)}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted mb-3">Position Players</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bg-border">
                    <SortTh label="Name" sortKey="name" sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-left py-2 pr-3" />
                    <SortTh label="Pos"  sortKey="pos"  sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-left py-2" />
                    <th className="text-right py-2 text-[10px] uppercase tracking-wider text-content-muted">#</th>
                    <SortTh label="G"   sortKey="g"   sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-right py-2" />
                    <SortTh label="PA"  sortKey="pa"  sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-right py-2" />
                    <SortTh label="AVG" sortKey="avg" sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-right py-2" />
                    <SortTh label="OPS" sortKey="ops" sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-right py-2" />
                    <SortTh label="HR"  sortKey="hr"  sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-right py-2" />
                    <SortTh label="RBI" sortKey="rbi" sort={hitSort} onSort={k => toggleSort(setHitSort, k)} className="text-right py-2" />
                  </tr>
                </thead>
                <tbody>
                  {sortedHitters.map(p => <HitterRow key={p.id} player={p} />)}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ── Schedule tab ── */}
      {tab === 'schedule' && (
        <section className="card p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted mb-3">Recent Games</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bg-border text-content-muted text-xs">
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Opponent</th>
                  <th className="text-right py-2">Result</th>
                  <th className="text-right py-2"></th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => {
                  const hasScore = game.teamScore != null && game.oppScore != null
                  const won = hasScore && Number(game.teamScore) > Number(game.oppScore)
                  const result = hasScore ? `${won ? 'W' : 'L'} ${game.teamScore}–${game.oppScore}` : game.status || '-'
                  return (
                    <tr key={game.gamePk} className="border-b border-bg-border/60 last:border-b-0">
                      <td className="py-2 text-content-secondary">{fmtDate(game.gameDate)}</td>
                      <td className="py-2 text-content-primary">{game.isHome ? 'vs' : '@'} {game.opponent?.abbreviation}</td>
                      <td className={`py-2 text-right font-mono font-semibold ${hasScore ? (won ? 'text-green-400' : 'text-red-400') : 'text-content-muted'}`}>{result}</td>
                      <td className="py-2 text-right"><Link className="text-brand-light hover:underline text-xs" to={`/game/${game.gamePk}`}>Box</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Transactions tab ── */}
      {tab === 'transactions' && (
        <TeamTransactions teamId={id} />
      )}
    </div>
  )
}
