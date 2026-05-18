import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { SimBadge, SimPlayerAvatar, SimSpinner } from '../components/sim/SimUI'

function jobStorageKey(leagueId) { return `sim-awards-job-${leagueId}` }

const LEAGUE_STYLE = {
  al:  { badge: 'text-sky-400 bg-sky-400/10 border-sky-400/30', topBar: 'bg-sky-500',  ring: 'ring-sky-500/40',  label: 'American League' },
  nl:  { badge: 'text-red-400 bg-red-400/10 border-red-400/30', topBar: 'bg-red-500',  ring: 'ring-red-500/40',  label: 'National League' },
  mlb: { badge: 'text-brand  bg-brand/10    border-brand/30',   topBar: 'bg-brand',    ring: 'ring-brand/40',    label: 'MLB' },
}

const AWARD_META = [
  { key: 'mvp',           label: 'Most Valuable Player',   icon: '🏆', split: 'al_nl' },
  { key: 'cy_young',      label: 'Cy Young Award',         icon: '🎯', split: 'al_nl' },
  { key: 'batting_title', label: 'Batting Title',          icon: '🔥', split: 'al_nl' },
  { key: 'hr_leader',     label: 'Home Run Title',         icon: '💪', split: 'al_nl' },
  { key: 'rbi_leader',    label: 'RBI Leader',             icon: '🎯', split: 'al_nl' },
  { key: 'era_title',     label: 'ERA Title',              icon: '💎', split: 'al_nl' },
  { key: 'k_leader',      label: 'Strikeout Leader',       icon: '⚡', split: 'overall' },
  { key: 'saves_leader',  label: 'Saves Leader',           icon: '🔒', split: 'overall' },
  { key: 'reliever',      label: 'Reliever of the Year',   icon: '💪', split: 'overall' },
]

const SS_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'DH']
const BATTER_STAT_KEYS  = ['avg', 'hr', 'rbi', 'ops']
const PITCHER_STAT_KEYS = ['era', 'whip', 'ip', 'w', 'k']

function StatChips({ stats, keys }) {
  if (!stats) return null
  const labels = { avg: 'AVG', hr: 'HR', rbi: 'RBI', ops: 'OPS', era: 'ERA', whip: 'WHIP', ip: 'IP', w: 'W', k: 'K' }
  return (
    <div className="flex flex-wrap gap-1">
      {keys.filter(k => stats[k] != null).slice(0, 4).map(k => (
        <span key={k} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-elevated border border-bg-border text-[10px] font-mono">
          <span className="text-content-muted">{labels[k]}</span>
          <span className="text-content-primary font-bold">
            {typeof stats[k] === 'number' ? (Number.isInteger(stats[k]) ? stats[k] : Number(stats[k]).toFixed(3)) : stats[k]}
          </span>
        </span>
      ))}
    </div>
  )
}

function AwardCard({ data, leagueKey, leagueId }) {
  const style = LEAGUE_STYLE[leagueKey]

  return (
    <div className="card overflow-hidden">
      <div className={`h-0.5 w-full ${style.topBar}`} />
      <div className="p-4">
        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${style.badge}`}>
          {style.label}
        </span>

        {!data ? (
          <p className="text-xs text-content-muted text-center py-6">No eligible candidates</p>
        ) : (() => {
          const { winner, finalists = [], rationale } = data
          const statKeys = winner?.stats?.era != null ? PITCHER_STAT_KEYS : BATTER_STAT_KEYS
          return (
            <div className="mt-3 space-y-3">
              {winner && (
                <div className="flex items-center gap-3">
                  <div className={`rounded-full ring-2 ring-offset-1 ring-offset-bg-surface ${style.ring} shrink-0`}>
                    <SimPlayerAvatar playerId={winner.player_id} name={winner.player_name} size={46} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/simulation/${leagueId}/player/${winner.player_id}`}
                        className="text-sm font-bold text-content-primary hover:text-brand transition-colors"
                      >
                        {winner.player_name}
                      </Link>
                      <span className="text-[10px] font-mono text-content-muted bg-bg-elevated border border-bg-border px-1.5 py-0.5 rounded">
                        {winner.team_abbr}
                      </span>
                    </div>
                    <StatChips stats={winner.stats} keys={statKeys} />
                  </div>
                  <span className="text-yellow-400 text-lg shrink-0">★</span>
                </div>
              )}

              {finalists.length > 0 && (
                <div className="border-t border-bg-border/40 pt-2 space-y-1">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-content-muted mb-1">Finalists</p>
                  {finalists.map((p, i) => p && (
                    <div key={p.player_id ?? i} className="flex items-center gap-2 py-0.5 opacity-60 hover:opacity-100 transition-opacity">
                      <span className="text-[10px] text-content-muted font-mono w-3 shrink-0">{i + 2}</span>
                      <SimPlayerAvatar playerId={p.player_id} name={p.player_name} size={22} />
                      <Link
                        to={`/simulation/${leagueId}/player/${p.player_id}`}
                        className="text-xs font-medium text-content-secondary hover:text-brand transition-colors truncate"
                      >
                        {p.player_name}
                      </Link>
                      <span className="text-[10px] text-content-muted font-mono shrink-0">{p.team_abbr}</span>
                    </div>
                  ))}
                </div>
              )}

              {rationale && (
                <p className="text-xs text-content-secondary leading-relaxed border-t border-bg-border/40 pt-2 italic">
                  "{rationale}"
                </p>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function AwardSection({ meta, awardData, leagueId }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xl">{meta.icon}</span>
        <h3 className="text-sm font-bold text-content-primary">{meta.label}</h3>
        <div className="flex-1 h-px bg-bg-border" />
      </div>
      {meta.split === 'al_nl' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AwardCard data={awardData?.al}      leagueKey="al"  leagueId={leagueId} />
          <AwardCard data={awardData?.nl}      leagueKey="nl"  leagueId={leagueId} />
        </div>
      ) : (
        <div className="max-w-lg">
          <AwardCard data={awardData?.overall} leagueKey="mlb" leagueId={leagueId} />
        </div>
      )}
    </div>
  )
}

function SilverSluggerSection({ data, leagueId }) {
  if (!data) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xl">🥈</span>
        <h3 className="text-sm font-bold text-content-primary">Silver Slugger Award</h3>
        <div className="flex-1 h-px bg-bg-border" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(['al', 'nl']).map(lg => {
          const style = LEAGUE_STYLE[lg]
          return (
            <div key={lg} className="card overflow-hidden">
              <div className={`h-0.5 w-full ${style.topBar}`} />
              <div className="p-4">
                <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${style.badge}`}>
                  {style.label}
                </span>
                <div className="mt-3 space-y-0.5">
                  {SS_POSITIONS.map(pos => {
                    const winner = data[pos]?.[lg]?.winner
                    return (
                      <div key={pos} className="flex items-center gap-2.5 py-1.5 border-b border-bg-border/20 last:border-0">
                        <span className="text-[10px] font-bold font-mono text-content-muted w-6 shrink-0 text-right">{pos}</span>
                        {winner ? (
                          <Link
                            to={`/simulation/${leagueId}/player/${winner.player_id}`}
                            className="flex items-center gap-2 hover:text-brand transition-colors min-w-0 flex-1"
                          >
                            <SimPlayerAvatar playerId={winner.player_id} name={winner.player_name} size={22} />
                            <span className="text-xs font-semibold text-content-primary truncate">{winner.player_name}</span>
                            <span className="text-[10px] text-content-muted font-mono shrink-0">{winner.team_abbr}</span>
                            {winner.stats?.ops != null && (
                              <span className="text-[10px] font-mono text-brand shrink-0 ml-auto">{Number(winner.stats.ops).toFixed(3)} OPS</span>
                            )}
                          </Link>
                        ) : (
                          <span className="text-xs text-content-muted italic">No eligible player</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function SimulationAwards() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [error, setError] = useState(null)

  // Persist job_id in localStorage so navigation doesn't lose progress
  const [jobId, setJobId] = useState(() => {
    try { return localStorage.getItem(jobStorageKey(id)) || null } catch { return null }
  })

  function storeJob(jid) {
    setJobId(jid)
    try { if (jid) localStorage.setItem(jobStorageKey(id), jid); else localStorage.removeItem(jobStorageKey(id)) } catch {}
  }

  // Poll job status while a job is in flight
  const { data: jobData } = useQuery({
    queryKey:     ['sim-awards-job', id, jobId],
    queryFn:      () => api.simulations.jobStatus(id, jobId),
    enabled:      !!jobId,
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'done' || s === 'error' ? false : 2000
    },
  })

  // When job finishes, refresh awards and clear job id
  useEffect(() => {
    if (!jobData) return
    if (jobData.status === 'done') {
      queryClient.invalidateQueries({ queryKey: ['sim-awards', id] })
      storeJob(null)
    } else if (jobData.status === 'error') {
      setError(jobData.error || 'Award generation failed')
      storeJob(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobData?.status, id])

  const { data, isLoading } = useQuery({
    queryKey:  ['sim-awards', id],
    queryFn:   () => api.simulations.awards(id),
    staleTime: 30_000,
  })

  async function handleGenerate() {
    setError(null)
    try {
      const res = await api.simulations.generateAwards(id)
      if (res.job_id) storeJob(String(res.job_id))
    } catch (e) {
      setError(e.message)
    }
  }

  const generating = !!jobId && jobData?.status !== 'done' && jobData?.status !== 'error'
  const awards = data?.awards

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="card-raised p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-4xl">🏆</span>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link to={`/simulation/${id}`} className="text-xs text-content-muted hover:text-brand transition-colors">
                  ← League
                </Link>
                <SimBadge />
              </div>
              <h1 className="text-xl font-bold text-content-primary">Season Awards</h1>
              <p className="text-xs text-content-secondary mt-0.5">
                AI-selected based on simulated season statistics
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {!data?.generated && !isLoading && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="btn-primary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? 'Generating…' : 'Generate Awards'}
              </button>
            )}
            {data?.generated && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-3 py-1.5 text-xs font-bold border border-bg-border bg-bg-elevated text-content-muted hover:text-brand hover:border-brand/40 rounded transition-colors disabled:opacity-50"
              >
                {generating ? 'Regenerating…' : 'Regenerate'}
              </button>
            )}
            {generating && (
              <div className="flex items-center gap-2 text-xs text-content-muted">
                <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                Consulting the AI committee…
              </div>
            )}
            {error && <p className="text-xs text-red-400 max-w-xs text-right">{error}</p>}
          </div>
        </div>
      </div>

      {isLoading && <SimSpinner message="Loading awards…" />}

      {!isLoading && !data?.generated && !generating && (
        <div className="card p-16 text-center space-y-4">
          <div className="text-5xl">🏆</div>
          <div>
            <p className="text-sm font-semibold text-content-primary">No awards generated yet</p>
            <p className="text-xs text-content-muted mt-1 max-w-sm mx-auto">
              Simulate a full season, then click <strong className="text-content-primary">Generate Awards</strong> to have the AI committee evaluate this season's standout performers.
            </p>
          </div>
        </div>
      )}

      {!isLoading && !data?.generated && generating && (
        <div className="card p-16 text-center space-y-4">
          <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto" />
          <div>
            <p className="text-sm font-semibold text-content-primary">The AI committee is deliberating…</p>
            <p className="text-xs text-content-muted mt-1">You can navigate away — this will finish in the background.</p>
          </div>
        </div>
      )}

      {awards && (
        <div className="space-y-10">
          {AWARD_META.map(meta => (
            <AwardSection
              key={meta.key}
              meta={meta}
              awardData={awards[meta.key]}
              leagueId={id}
            />
          ))}

          {awards.silver_slugger ? (
            <SilverSluggerSection data={awards.silver_slugger} leagueId={id} />
          ) : (
            <div className="card p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🥈</span>
                <div>
                  <div className="text-sm font-bold text-content-primary">Silver Slugger Award</div>
                  <div className="text-xs text-content-muted">Not included in this award set — click Regenerate to add it.</div>
                </div>
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50 shrink-0"
              >
                {generating ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
