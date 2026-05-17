import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

function CreateLeagueModal({ scenarios, onClose, onCreate }) {
  const [name,    setName]    = useState(`${CURRENT_YEAR} Season`)
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
      const result = await api.simulations.create({
        name:                  name.trim(),
        season:                Number(season),
        scenario_id:           scenId ? Number(scenId) : undefined,
        batter_pitcher_blend:  Number(blend),
      })
      if (result.error) throw new Error(result.error)
      onCreate(result)
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-lg p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-content-primary">New Simulation League</h2>
            <p className="text-xs text-content-muted mt-0.5">Imports all 30 team rosters and the full season schedule.</p>
          </div>
          <button type="button" onClick={onClose} className="text-content-muted hover:text-content-primary text-xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">League Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. 2026 Season"
              className="w-full bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-content-muted uppercase tracking-wide">Season</label>
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
                <option key={s.id} value={s.id}>{s.name}{s.is_default ? ' (default)' : ''}</option>
              ))}
            </select>
          </div>

          <div className="col-span-2 space-y-2">
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
        </div>

        {error && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{error}</p>}

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-content-primary">Setting up your league…</p>
              <p className="text-xs text-content-muted mt-1">Importing 30 team rosters and full season schedule. This takes 10–20 seconds.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={handleCreate} className="btn-primary flex-1">
              Create League
            </button>
            <button type="button" onClick={onClose} className="text-sm text-content-secondary hover:text-content-primary">
              Cancel
            </button>
          </div>
        )}
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
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
              {league.season}
            </span>
            {league.scenario_name && (
              <span className="text-xs text-content-muted">{league.scenario_name}</span>
            )}
          </div>
          <h3 className="font-bold text-content-primary text-base truncate">{league.name}</h3>
          {date && (
            <p className="text-xs text-content-muted mt-0.5">
              Simulated through <span className="text-content-secondary">{date}</span>
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
  const [showCreate, setShowCreate] = useState(false)

  const { data: leaguesData = { leagues: [] }, isLoading } = useQuery({
    queryKey: ['simulations'],
    queryFn:  api.simulations.list,
    staleTime: 30_000,
  })

  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn:  api.scenarios.list,
    staleTime: 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.simulations.destroy(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['simulations'] }),
  })

  const leagues = leaguesData.leagues || []

  function handleDelete(league) {
    if (!window.confirm(`Delete "${league.name}"? All simulation data will be lost.`)) return
    deleteMutation.mutate(league.id)
  }

  function handleCreated(newLeague) {
    qc.invalidateQueries({ queryKey: ['simulations'] })
    setShowCreate(false)
    navigate(`/simulation/${newLeague.id}`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Simulation</h1>
          <p className="text-content-muted text-sm mt-1">
            Full-league baseball simulation. Import real rosters, sync past results, simulate games.
          </p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New League
        </button>
      </div>

      {/* League list */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-content-muted text-sm py-8 justify-center">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          Loading leagues…
        </div>
      ) : leagues.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-bold text-content-primary mb-1">No simulation leagues yet</h3>
          <p className="text-sm text-content-muted mb-5 max-w-sm mx-auto">
            Create a league to import all 30 team rosters, sync real game results, and simulate the season.
          </p>
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary mx-auto">
            Create your first league
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map(league => (
            <LeagueCard
              key={league.id}
              league={league}
              onOpen={l => navigate(`/simulation/${l.id}`)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateLeagueModal
          scenarios={scenarios}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreated}
        />
      )}
    </div>
  )
}
