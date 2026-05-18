import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function SeasonProgress({ pct, gamesPlayed, gamesTotal }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width:      `${pct}%`,
            background: pct >= 100 ? 'var(--color-green-400, #4ade80)' : 'var(--color-brand)',
          }}
        />
      </div>
      <span className="text-[10px] font-mono text-content-muted shrink-0">{gamesPlayed}/{gamesTotal}</span>
    </div>
  )
}

const ROUND_DISPLAY_ORDER = ['wc', 'ds', 'cs', 'ws']
const ROUND_SHORT = { wc: 'WC', ds: 'DS', cs: 'CS', ws: 'WS' }

const CATEGORY_CFG = {
  postseason: { label: 'Postseason Awards', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/40' },
  league:     { label: 'League Awards',     cls: 'bg-brand/15 text-brand border-brand/30'            },
  stats:      { label: 'Statistical Titles', cls: 'bg-bg-elevated text-content-secondary border-bg-border' },
}

function shortName(full) {
  if (!full) return '—'
  const parts = full.trim().split(' ')
  if (parts.length < 2) return full
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

// ── Season breakdown sections ─────────────────────────────────────────────────

function StatLeaders({ leaders, leagueId }) {
  if (!leaders || !Object.keys(leaders).length) return null
  const DEFS = [
    { key: 'hr',  label: 'HR',  fmt: v => v },
    { key: 'avg', label: 'AVG', fmt: v => Number(v).toFixed(3) },
    { key: 'era', label: 'ERA', fmt: v => Number(v).toFixed(2) },
    { key: 'k',   label: 'K',   fmt: v => v },
  ]
  const visible = DEFS.filter(d => leaders[d.key])
  if (!visible.length) return null

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-2">Stat Leaders</p>
      <div className="grid grid-cols-2 gap-2">
        {visible.map(({ key, label, fmt }) => {
          const l = leaders[key]
          return (
            <Link
              key={key}
              to={`/simulation/${leagueId}/player/${l.player_id}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-bg-border bg-bg-surface hover:border-brand/40 hover:bg-bg-elevated transition-colors"
            >
              <span className="text-[10px] font-black uppercase font-mono text-content-muted w-7 shrink-0">{label}</span>
              <span className="text-sm font-black font-mono tabular-nums text-content-primary">{fmt(l.value)}</span>
              <span className="text-[11px] text-content-secondary truncate">{shortName(l.player_name)}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function AwardChip({ a, leagueId }) {
  const cfg = CATEGORY_CFG[a.category] || CATEGORY_CFG.stats
  return (
    <Link
      to={a.player_id ? `/simulation/${leagueId}/player/${a.player_id}` : '#'}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-bg-border bg-bg-surface hover:border-brand/40 hover:bg-bg-elevated transition-colors"
    >
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap shrink-0 ${cfg.cls}`}>
        {a.label}
      </span>
      <span className="text-[11px] text-content-secondary truncate">
        {shortName(a.player_name)}
        {a.team_abbr && <span className="text-content-muted font-mono"> · {a.team_abbr}</span>}
      </span>
    </Link>
  )
}

function AwardsPanel({ awards, leagueId }) {
  if (!awards?.length) return null

  const grouped = {}
  for (const a of awards) {
    if (!grouped[a.category]) grouped[a.category] = []
    grouped[a.category].push(a)
  }

  const sections = ['postseason', 'league', 'stats'].filter(c => grouped[c])

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted">Awards</p>
      {sections.map(cat => (
        <div key={cat}>
          <p className="text-[9px] font-bold uppercase tracking-wider text-content-muted/70 mb-1.5">
            {CATEGORY_CFG[cat].label}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {grouped[cat].map(a => <AwardChip key={a.label} a={a} leagueId={leagueId} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function PlayoffBracket({ results }) {
  if (!results?.length) return null

  const byRound = {}
  for (const r of results) {
    if (!byRound[r.round]) byRound[r.round] = []
    byRound[r.round].push(r)
  }

  const rounds = ROUND_DISPLAY_ORDER.filter(r => byRound[r])

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-2">Playoffs</p>
      <div className="space-y-1.5">
        {rounds.map(round => (
          <div key={round} className="flex items-start gap-3">
            <span className="text-[9px] font-black font-mono text-content-muted uppercase w-7 shrink-0 pt-0.5">
              {ROUND_SHORT[round]}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {byRound[round].map((s, i) => (
                <div
                  key={i}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono ${
                    round === 'ws'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-bg-border bg-bg-surface text-content-secondary'
                  }`}
                >
                  <span className="font-bold text-content-primary">{s.winner}</span>
                  <span className="text-content-muted">def.</span>
                  <span>{s.loser}</span>
                  <span className="text-content-muted ml-0.5">{s.wins}-{s.losses}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Season card ───────────────────────────────────────────────────────────────

function SeasonCard({ season, isLatest }) {
  const [expanded, setExpanded] = useState(isLatest)

  const isComplete  = season.complete
  const champion    = season.champion
  const hasBreakdown = season.awards?.length || Object.keys(season.stat_leaders || {}).length || season.playoff_results?.length

  return (
    <div className={`card overflow-hidden transition-colors ${isLatest ? 'border-brand/20' : ''}`}>
      {/* Accent bar for active season */}
      {isLatest && !isComplete && (
        <div className="h-0.5 bg-gradient-to-r from-brand to-brand/20" />
      )}
      {isComplete && champion && (
        <div className="h-0.5 bg-gradient-to-r from-amber-500 to-amber-500/20" />
      )}

      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Year + badges */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-2xl font-black text-content-primary font-mono">{season.season}</span>
              {isLatest && !isComplete && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand/15 text-brand border border-brand/25">ACTIVE</span>
              )}
              {isComplete && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25">FINAL</span>
              )}
            </div>

            {/* Champion or status line */}
            {champion ? (
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-sm font-bold text-amber-400">{champion.team_abbr}</span>
                <span className="text-sm text-content-muted">World Series Champion</span>
              </div>
            ) : isComplete ? (
              <p className="text-xs text-content-muted">No playoffs recorded</p>
            ) : (
              <p className="text-xs text-content-muted">
                {season.current_sim_date ? `Sim date: ${season.current_sim_date}` : 'Not started'}
              </p>
            )}
          </div>

          {/* Actions: expand toggle + league link */}
          <div className="flex items-center gap-2 shrink-0">
            {hasBreakdown && (
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="p-1.5 rounded border border-bg-border text-content-muted hover:border-brand/40 hover:text-brand transition-colors"
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            <Link
              to={`/simulation/${season.id}`}
              className="p-1.5 rounded border border-bg-border text-content-muted hover:border-brand/40 hover:text-brand transition-colors"
              aria-label="Open season"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="mt-3">
          <SeasonProgress pct={season.pct_complete} gamesPlayed={season.games_played} gamesTotal={season.games_total} />
        </div>
      </div>

      {/* Breakdown (collapsible) */}
      {expanded && hasBreakdown && (
        <div className="px-5 pb-5 border-t border-bg-border/50 pt-4 space-y-5">
          <StatLeaders leaders={season.stat_leaders} leagueId={season.id} />
          <AwardsPanel awards={season.awards} leagueId={season.id} />
          <PlayoffBracket results={season.playoff_results} />
        </div>
      )}
    </div>
  )
}

// ── Franchise page ────────────────────────────────────────────────────────────

export default function SimulationFranchise() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const { data: franchise, isLoading } = useQuery({
    queryKey: ['franchise', id],
    queryFn:  () => api.franchises.show(id),
    staleTime: 30_000,
  })

  const [advanceError, setAdvanceError] = useState(null)

  const advanceMutation = useMutation({
    mutationFn: () => api.franchises.advance(id),
    onSuccess:  (data) => {
      if (data.error) {
        setAdvanceError(data.error)
      } else {
        setAdvanceError(null)
        qc.setQueryData(['franchise', id], data)
      }
    },
    onError: (err) => setAdvanceError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.franchises.destroy(id),
    onSuccess:  () => navigate('/simulation'),
  })

  function handleDelete() {
    if (!window.confirm(`Delete franchise "${franchise?.name}"? All season data will be detached but not deleted.`)) return
    deleteMutation.mutate()
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-content-muted py-12 justify-center">
        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        Loading franchise…
      </div>
    )
  }

  if (!franchise) return null

  const seasons = [...(franchise.seasons || [])].reverse()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/simulation" className="text-xs text-content-muted hover:text-brand transition-colors">
              ← Simulations
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-content-primary">{franchise.name}</h1>
              <p className="text-content-muted text-sm">
                {franchise.seasons_count} {franchise.seasons_count === 1 ? 'season' : 'seasons'} · started {franchise.start_season}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {advanceError && (
            <span className="text-xs text-red-400 max-w-xs">{advanceError}</span>
          )}
          {franchise.can_advance && (
            <button
              type="button"
              onClick={() => advanceMutation.mutate()}
              disabled={advanceMutation.isPending}
              className="btn-primary flex items-center gap-1.5"
            >
              {advanceMutation.isPending ? (
                <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              )}
              Advance to {(franchise.current_season || franchise.start_season) + 1}
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className="px-3 py-1.5 rounded-lg border border-bg-border text-xs text-content-muted hover:border-red-500/30 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Seasons */}
      {seasons.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-content-muted text-sm">No seasons yet. The first season is being set up.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-content-muted">Seasons</h2>
          <div className="space-y-3">
            {seasons.map((season, i) => (
              <SeasonCard key={season.id} season={season} isLatest={i === 0} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
