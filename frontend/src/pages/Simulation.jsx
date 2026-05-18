import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

const CURRENT_YEAR = new Date().getFullYear()

function LeagueStatusBadge({ league }) {
  const played = league.games_played || 0
  const total  = league.games_total  || 0
  const pct    = total > 0 ? Math.round((played / total) * 100) : 0

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-bg-border rounded-full overflow-hidden max-w-24">
        <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-content-muted">{played}/{total}</span>
    </div>
  )
}

const MODES = {
  live: {
    label:    'Live Season',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 2v2m0 16v2M2 12h2m16 0h2m-3.05-6.95-1.41 1.41M6.46 17.54l-1.41 1.41M17.54 17.54l1.41 1.41M6.46 6.46 5.05 5.05" />
      </svg>
    ),
    tagline:  'Pick up where the real season left off',
    blurb:    'Syncs all real results through yesterday. You simulate from today forward using our projections.',
    yearLock: true,
  },
  full: {
    label:    'Full Season Sim',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 5v14l11-7z" />
      </svg>
    ),
    tagline:  'Simulate an entire season from Game 1',
    blurb:    'No real results imported. Simulate every game with projections — great for what-if or historical replay.',
    yearLock: false,
  },
}

function CreateLeagueModal({ scenarios, onClose, onCreate }) {
  const [mode,    setMode]    = useState('live')
  const [season,  setSeason]  = useState(CURRENT_YEAR)
  const [scenId,  setScenId]  = useState('')
  const [blend,   setBlend]   = useState(0.45)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const cfg = MODES[mode]

  // Auto-name stays in sync with mode + year
  const defaultName = mode === 'live'
    ? `${CURRENT_YEAR} Live Season`
    : `${season} Full Season Sim`
  const [name, setName] = useState(defaultName)
  const [nameTouched, setNameTouched] = useState(false)

  function handleModeChange(m) {
    setMode(m)
    if (!nameTouched) {
      setName(m === 'live' ? `${CURRENT_YEAR} Live Season` : `${season} Full Season Sim`)
    }
    if (m === 'live') setSeason(CURRENT_YEAR)
  }

  function handleSeasonChange(y) {
    setSeason(y)
    if (!nameTouched) setName(`${y} Full Season Sim`)
  }

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.simulations.create({
        name:                  name.trim(),
        season:                Number(mode === 'live' ? CURRENT_YEAR : season),
        scenario_id:           scenId ? Number(scenId) : undefined,
        batter_pitcher_blend:  Number(blend),
        mode,
      })
      if (result.error) throw new Error(result.error)
      onCreate(result)
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  const loadingMsg = mode === 'live'
    ? 'Importing 30 team rosters, full schedule, and syncing real results. This takes 20–40 seconds.'
    : 'Importing 30 team rosters and full season schedule. This takes 10–20 seconds.'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-lg shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-content-primary">New Simulation League</h2>
            <p className="text-xs text-content-muted mt-0.5">Choose how you want to run this season.</p>
          </div>
          <button type="button" onClick={onClose} className="text-content-muted hover:text-content-primary text-xl leading-none mt-0.5">×</button>
        </div>

        {/* Mode selector */}
        <div className="px-6 pb-5">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(MODES).map(([key, m]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleModeChange(key)}
                className={`relative rounded-lg border p-3.5 text-left transition-all ${
                  mode === key
                    ? 'border-brand bg-brand/8 ring-1 ring-brand/40'
                    : 'border-bg-border hover:border-brand/30 hover:bg-bg-elevated'
                }`}
              >
                <div className={`flex items-center gap-2 mb-1.5 ${mode === key ? 'text-brand' : 'text-content-secondary'}`}>
                  {m.icon}
                  <span className="text-xs font-bold uppercase tracking-wider">{m.label}</span>
                </div>
                <p className={`text-[11px] leading-snug ${mode === key ? 'text-content-secondary' : 'text-content-muted'}`}>
                  {m.tagline}
                </p>
                {mode === key && (
                  <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-brand flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Mode description */}
          <div className={`mt-2 px-3 py-2 rounded-md text-[11px] leading-relaxed ${
            mode === 'live'
              ? 'bg-emerald-500/8 border border-emerald-500/20 text-emerald-400/80'
              : 'bg-brand/8 border border-brand/20 text-brand/70'
          }`}>
            {cfg.blurb}
          </div>
        </div>

        <div className="px-6 pb-6 space-y-4 border-t border-bg-border pt-5">
          {/* Name + Season */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">League Name</label>
              <input
                value={name}
                onChange={e => { setName(e.target.value); setNameTouched(true) }}
                placeholder="e.g. 2026 Live Season"
                className="w-full bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">Season</label>
              {cfg.yearLock ? (
                <div className="flex items-center h-9 px-3 bg-bg-elevated border border-bg-border/60 rounded-md">
                  <span className="text-sm text-content-secondary font-mono">{CURRENT_YEAR}</span>
                  <span className="ml-auto text-[10px] text-content-muted">Current</span>
                </div>
              ) : (
                <select
                  value={season}
                  onChange={e => handleSeasonChange(e.target.value)}
                  className="w-full bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand"
                >
                  {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">Projection Scenario</label>
              <select
                value={scenId}
                onChange={e => setScenId(e.target.value)}
                className="w-full bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand"
              >
                <option value="">Default</option>
                {scenarios.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.is_default ? ' (default)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Blend */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">Batter / Pitcher Blend</label>
              <span className="text-xs font-mono text-brand">
                {Math.round(blend * 100)}% batter · {Math.round((1 - blend) * 100)}% pitcher
              </span>
            </div>
            <input
              type="range" min={0.1} max={0.9} step={0.05}
              value={blend}
              onChange={e => setBlend(Number(e.target.value))}
              className="w-full accent-[rgb(var(--color-brand))]"
            />
            <div className="flex justify-between text-[10px] text-content-muted">
              <span>Pitcher-dominant</span>
              <span>Balanced</span>
              <span>Batter-dominant</span>
            </div>
          </div>

          {error && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{error}</p>}

          {loading ? (
            <div className="flex flex-col items-center gap-3 py-3">
              <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium text-content-primary">Setting up your league…</p>
                <p className="text-xs text-content-muted mt-1">{loadingMsg}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleCreate} className="btn-primary flex-1">
                {mode === 'live' ? 'Start Live Season' : 'Create Full Season Sim'}
              </button>
              <button type="button" onClick={onClose} className="text-sm text-content-secondary hover:text-content-primary">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Create Franchise Modal
// ─────────────────────────────────────────────────────────────────

function CreateFranchiseModal({ scenarios, onClose, onCreate }) {
  const [name,    setName]    = useState(`${CURRENT_YEAR} Franchise`)
  const [season,  setSeason]  = useState(CURRENT_YEAR)
  const [scenId,  setScenId]  = useState('')
  const [blend,   setBlend]   = useState(0.45)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.franchises.create({
        name:                 name.trim(),
        season:               Number(season),
        scenario_id:          scenId || null,
        batter_pitcher_blend: blend,
      })
      if (result.error) { setError(result.error); return }
      onCreate(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-surface border border-bg-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-5 border-b border-bg-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-content-primary">New Franchise</h2>
            <p className="text-xs text-content-muted mt-0.5">Multi-season simulation — advance each year when the season is complete</p>
          </div>
          <button onClick={onClose} className="text-content-muted hover:text-content-primary transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">Franchise Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Dynasty Mode"
              className="w-full bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">Start Season</label>
              <select
                value={season}
                onChange={e => setSeason(e.target.value)}
                className="w-full bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand"
              >
                {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">Projection Scenario</label>
              <select
                value={scenId}
                onChange={e => setScenId(e.target.value)}
                className="w-full bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand"
              >
                <option value="">Default</option>
                {scenarios.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">Batter / Pitcher Blend</label>
              <span className="text-xs font-mono text-brand">
                {Math.round(blend * 100)}% batter · {Math.round((1 - blend) * 100)}% pitcher
              </span>
            </div>
            <input
              type="range" min={0.1} max={0.9} step={0.05}
              value={blend}
              onChange={e => setBlend(Number(e.target.value))}
              className="w-full accent-[rgb(var(--color-brand))]"
            />
          </div>

          {error && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-content-muted">
                <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                Setting up franchise…
              </div>
            ) : (
              <>
                <button type="button" onClick={handleCreate} className="btn-primary">
                  Create Franchise
                </button>
                <button type="button" onClick={onClose} className="text-sm text-content-secondary hover:text-content-primary">
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Franchise card (index)
// ─────────────────────────────────────────────────────────────────

function FranchiseCard({ franchise, onDelete }) {
  const currentSeason = franchise.current_season
  const seasonsCount  = franchise.seasons_count

  return (
    <div className="card p-5 hover:border-brand/30 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
              Franchise
            </span>
            {currentSeason && (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                {currentSeason}
              </span>
            )}
            {franchise.can_advance && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                Ready to Advance
              </span>
            )}
          </div>
          <h3 className="font-bold text-content-primary text-base truncate">{franchise.name}</h3>
          <p className="text-xs text-content-muted mt-0.5">
            {seasonsCount} {seasonsCount === 1 ? 'season' : 'seasons'} · started {franchise.start_season}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onDelete(franchise)}
            className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-7 h-7 rounded border border-bg-border text-content-muted hover:text-red-400 hover:border-red-400/40 transition-all"
            title="Delete franchise"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <Link to={`/franchise/${franchise.id}`} className="btn-primary text-sm px-4">
            Open
          </Link>
        </div>
      </div>
    </div>
  )
}

function LeagueCard({ league, onOpen, onDelete }) {
  const date = league.current_sim_date
    ? new Date(league.current_sim_date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="card p-5 hover:border-brand/30 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
              {league.season}
            </span>
            {league.mode === 'live' ? (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Live
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg-elevated text-content-muted border border-bg-border">
                Full Sim
              </span>
            )}
            {league.scenario_name && (
              <span className="text-xs text-content-muted">{league.scenario_name}</span>
            )}
          </div>
          <h3 className="font-bold text-content-primary text-base truncate">{league.name}</h3>
          {date && (
            <p className="text-xs text-content-muted mt-0.5">
              {league.mode === 'live' ? 'Sim date: ' : 'Through: '}
              <span className="text-content-secondary">{date}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onDelete(league)}
            className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-7 h-7 rounded border border-bg-border text-content-muted hover:text-red-400 hover:border-red-400/40 transition-all"
            title="Delete league"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button type="button" onClick={() => onOpen(league)} className="btn-primary text-sm px-4">
            Open
          </button>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-bg-border">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs text-content-muted">Season progress</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-content-muted">
              {league.games_played || 0} of {league.games_total || 0} games
            </span>
          </div>
        </div>
        <LeagueStatusBadge league={league} />
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-content-muted">
        <span>
          Blend: <span className="text-content-secondary font-mono">
            {Math.round(league.batter_pitcher_blend * 100)}% batter
          </span>
        </span>
      </div>
    </div>
  )
}

export default function Simulation() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showCreate,          setShowCreate]          = useState(false)
  const [showCreateFranchise, setShowCreateFranchise] = useState(false)

  const { data: leaguesData = { leagues: [] }, isLoading: leaguesLoading } = useQuery({
    queryKey: ['simulations'],
    queryFn:  api.simulations.list,
    staleTime: 30_000,
  })

  const { data: franchisesData = { franchises: [] }, isLoading: franchisesLoading } = useQuery({
    queryKey: ['franchises'],
    queryFn:  api.franchises.list,
    staleTime: 30_000,
  })

  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn:  api.scenarios.list,
    staleTime: 60_000,
  })

  const deleteLeagueMutation = useMutation({
    mutationFn: (id) => api.simulations.destroy(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['simulations'] }),
  })

  const deleteFranchiseMutation = useMutation({
    mutationFn: (id) => api.franchises.destroy(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['franchises'] }),
  })

  const leagues    = leaguesData.leagues    || []
  const franchises = franchisesData.franchises || []

  // Standalone leagues only (not part of a franchise)
  const standaloneLeagues = leagues.filter(l => !l.simulation_franchise_id)

  function handleDeleteLeague(league) {
    if (!window.confirm(`Delete "${league.name}"? All simulation data will be lost.`)) return
    deleteLeagueMutation.mutate(league.id)
  }

  function handleDeleteFranchise(franchise) {
    if (!window.confirm(`Delete franchise "${franchise.name}"? Season leagues will be detached but not deleted.`)) return
    deleteFranchiseMutation.mutate(franchise.id)
  }

  function handleLeagueCreated(newLeague) {
    qc.invalidateQueries({ queryKey: ['simulations'] })
    setShowCreate(false)
    navigate(`/simulation/${newLeague.id}`)
  }

  function handleFranchiseCreated(franchise) {
    qc.invalidateQueries({ queryKey: ['franchises'] })
    setShowCreateFranchise(false)
    navigate(`/franchise/${franchise.id}`)
  }

  const isLoading = leaguesLoading || franchisesLoading

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Simulation</h1>
          <p className="text-content-muted text-sm mt-1">
            Single-season leagues and multi-season franchises.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowCreateFranchise(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-bg-border text-sm text-content-secondary hover:border-brand/30 hover:text-brand transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Franchise
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New League
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-content-muted text-sm py-8 justify-center">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      ) : (
        <>
          {/* Franchises */}
          {franchises.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-content-muted">Franchises</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {franchises.map(f => (
                  <FranchiseCard
                    key={f.id}
                    franchise={f}
                    onDelete={handleDeleteFranchise}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Standalone Leagues */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-content-muted">
              {franchises.length > 0 ? 'Standalone Leagues' : 'Leagues'}
            </h2>
            {standaloneLeagues.length === 0 && franchises.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="font-bold text-content-primary mb-1">No simulations yet</h3>
                <p className="text-sm text-content-muted mb-5 max-w-sm mx-auto">
                  Create a league for a single season, or a franchise to simulate multiple seasons back-to-back.
                </p>
                <div className="flex items-center gap-3 justify-center">
                  <button type="button" onClick={() => setShowCreateFranchise(true)} className="btn-primary mx-auto">
                    Start a Franchise
                  </button>
                  <button type="button" onClick={() => setShowCreate(true)} className="text-sm text-content-secondary hover:text-content-primary">
                    or create a league
                  </button>
                </div>
              </div>
            ) : standaloneLeagues.length === 0 ? (
              <p className="text-sm text-content-muted">No standalone leagues.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {standaloneLeagues.map(league => (
                  <LeagueCard
                    key={league.id}
                    league={league}
                    onOpen={l => navigate(`/simulation/${l.id}`)}
                    onDelete={handleDeleteLeague}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {showCreate && (
        <CreateLeagueModal
          scenarios={scenarios}
          onClose={() => setShowCreate(false)}
          onCreate={handleLeagueCreated}
        />
      )}

      {showCreateFranchise && (
        <CreateFranchiseModal
          scenarios={scenarios}
          onClose={() => setShowCreateFranchise(false)}
          onCreate={handleFranchiseCreated}
        />
      )}
    </div>
  )
}
