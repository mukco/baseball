import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import SimInsightPanel from '../components/SimInsightPanel'
import { TeamLogo, SimBadge, SimSpinner } from '../components/sim/SimUI'
import { BATTER_COLS, PITCHER_COLS, SortableTable } from '../components/sim/SimStatsTable'
import RatingDots from '../components/RatingDots'

const SEVERITY_STYLE = {
  minor:    'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  moderate: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  major:    'text-red-400   bg-red-400/10   border-red-400/30',
}

function TeamILPanel({ leagueId, teamId }) {
  const { data, isLoading } = useQuery({
    queryKey:  ['sim-injuries', leagueId, teamId],
    queryFn:   () => api.simulations.injuries(leagueId, { teamId }),
    staleTime: 30_000,
  })

  const activeIl  = data?.active_il  || []
  const ilHistory = data?.il_history || []
  const [tab, setTab] = useState('active')

  if (isLoading) return <SimSpinner className="py-10" />

  const rows = tab === 'active' ? activeIl : ilHistory

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {[['active', `Active (${activeIl.length})`], ['history', 'Returned']].map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-xs font-bold rounded border transition-colors ${
              tab === t ? 'bg-brand/10 text-brand border-brand/30' : 'border-bg-border text-content-muted hover:border-brand/30'
            }`}
          >
            {label}
          </button>
        ))}
        {activeIl.length > 0 && (
          <Link
            to={`/simulation/${leagueId}/injuries`}
            className="ml-auto text-xs text-content-muted hover:text-brand transition-colors"
          >
            View all IL →
          </Link>
        )}
      </div>

      <div className="card overflow-hidden">
        {!rows.length ? (
          <div className="px-5 py-8 text-center text-sm text-content-muted">
            {tab === 'active' ? 'No players currently on IL.' : 'No returned players yet.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-border bg-bg-elevated">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-content-muted">Player</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-content-muted">Severity</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-content-muted">IL Date</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-content-muted">Return</th>
                {tab === 'active' && (
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-content-muted">Days Left</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} className="border-b border-bg-border/40 last:border-0 hover:bg-bg-elevated transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to={`/simulation/${leagueId}/player/${p.player_id}`}
                      className="font-semibold text-content-primary hover:text-brand transition-colors"
                    >
                      {p.player_name || `#${p.player_id}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${SEVERITY_STYLE[p.severity] || ''}`}>
                      {p.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-content-secondary">{p.il_start_date}</td>
                  <td className="px-4 py-3 font-mono text-xs text-content-secondary">{p.il_end_date}</td>
                  {tab === 'active' && (
                    <td className="px-4 py-3 text-right font-mono font-bold text-content-primary">
                      {p.days_remaining > 0 ? `${p.days_remaining}d` : 'Today'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const TEAM_INSIGHT_SECTIONS = {
  season_summary:      'Season Summary',
  batting_highlights:  'Batting Highlights',
  pitching_highlights: 'Pitching Highlights',
}

const POS_COLORS = {
  SP: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  RP: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  C:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  '1B': 'bg-green-500/15 text-green-400 border-green-500/30',
  '2B': 'bg-green-500/15 text-green-400 border-green-500/30',
  '3B': 'bg-green-500/15 text-green-400 border-green-500/30',
  SS: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  LF: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  CF: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  RF: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  DH: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
}

const ROLE_COLORS = {
  sp: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  cl: 'bg-red-500/15 text-red-400 border-red-500/30',
  su: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  mr: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  lr: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
}

function PosBadge({ pos }) {
  const cls = POS_COLORS[pos] || 'bg-bg-elevated text-content-muted border-bg-border'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold font-mono uppercase ${cls}`}>
      {pos}
    </span>
  )
}

function RoleBadge({ role }) {
  const cls = ROLE_COLORS[role] || 'bg-bg-elevated text-content-muted border-bg-border'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold font-mono uppercase ${cls}`}>
      {role}
    </span>
  )
}

function pitcherWorkload(state) {
  if (!state) return null
  const g  = state.season_g || 0
  const ip = ((state.season_outs || 0) / 3).toFixed(1)
  return `${g}G · ${ip}IP`
}

function pitcherRestLabel(state) {
  if (!state?.last_pitched) return null
  const last = new Date(state.last_pitched)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffMs   = today - last
  const diffDays = Math.round(diffMs / 86_400_000)
  if (diffDays === 0) return { label: 'Pitched today', color: 'text-red-400' }
  if (diffDays === 1) return { label: 'Pitched yesterday', color: 'text-orange-400' }
  return { label: `${diffDays}d rest`, color: 'text-content-muted' }
}

function RosterRow({ slot, player, leagueId, pitcherSt, ratings }) {
  const restInfo  = pitcherRestLabel(pitcherSt)
  const workload  = pitcherWorkload(pitcherSt)
  const isPitcher = pitcherSt != null || player.position === 'SP' || player.position === 'RP'

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-bg-border/40 last:border-0">
      {slot != null && (
        <span className="w-8 text-right text-[11px] font-mono font-bold text-content-muted shrink-0">{slot}</span>
      )}
      <Link
        to={`/simulation/${leagueId}/player/${player.id}`}
        className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
      >
        <img
          src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_40,q_auto:best/v1/people/${player.id}/headshot/67/current`}
          alt=""
          className="w-7 h-7 rounded-full object-cover bg-bg-border shrink-0"
          onError={e => { e.target.style.display = 'none' }}
        />
        <div className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-content-primary truncate">{player.name}</span>
          {ratings && (
            <div className="mt-0.5">
              <RatingDots ratings={ratings} isPitcher={isPitcher} />
            </div>
          )}
          {(restInfo || workload) && (
            <div className="flex items-center gap-2 mt-0.5">
              {restInfo && <span className={`text-[10px] font-mono ${restInfo.color}`}>{restInfo.label}</span>}
              {restInfo && workload && <span className="text-[10px] text-content-muted">·</span>}
              {workload && <span className="text-[10px] font-mono text-content-muted">{workload}</span>}
            </div>
          )}
        </div>
      </Link>
      {pitcherSt ? <RoleBadge role={pitcherSt.role} /> : <PosBadge pos={player.position} />}
    </div>
  )
}

const BULLPEN_ORDER = ['cl', 'su', 'mr', 'lr']
const BULLPEN_LABELS = { cl: 'Closer', su: 'Setup', mr: 'Middle Relief', lr: 'Long Relief' }

function RosterPanel({ rosterData, leagueId, teamId, id }) {
  const roster    = rosterData?.roster || []
  const byId      = Object.fromEntries(roster.map(p => [p.id, p]))
  const ratingsMap = rosterData?.ratings || {}
  const lineup   = (rosterData?.lineup_order || []).map(pid => byId[pid]).filter(Boolean)

  const psMap    = rosterData?.pitcher_state?.pitchers || {}
  const hasPsMap = Object.keys(psMap).length > 0

  // Build rotation from pitcher_state slots, or fall back to legacy rotation array
  const rotationEntries = hasPsMap
    ? Object.entries(psMap)
        .filter(([, p]) => p.role === 'sp')
        .sort(([, a], [, b]) => (a.slot ?? 99) - (b.slot ?? 99))
        .map(([idStr, state]) => ({ player: byId[parseInt(idStr)], state }))
        .filter(e => e.player)
    : (rosterData?.rotation || []).map(pid => ({ player: byId[pid], state: null })).filter(e => e.player)

  // Build bullpen groups from pitcher_state, or fall back to bullpen_roles
  let bullpenGroups = { cl: [], su: [], mr: [], lr: [] }
  if (hasPsMap) {
    Object.entries(psMap)
      .filter(([, p]) => p.role !== 'sp')
      .forEach(([idStr, state]) => {
        const player = byId[parseInt(idStr)]
        if (player && bullpenGroups[state.role]) {
          bullpenGroups[state.role].push({ player, state })
        }
      })
  } else {
    const roles  = rosterData?.bullpen_roles || {}
    if (roles.closer_id && byId[roles.closer_id]) bullpenGroups.cl = [{ player: byId[roles.closer_id], state: null }]
    bullpenGroups.su = (roles.setup_ids || []).map(pid => byId[pid]).filter(Boolean).map(p => ({ player: p, state: null }))
    bullpenGroups.lr = (roles.long_ids  || []).map(pid => byId[pid]).filter(Boolean).map(p => ({ player: p, state: null }))
  }

  const pitcherIds = new Set([
    ...rotationEntries.map(e => e.player.id),
    ...Object.values(bullpenGroups).flat().map(e => e.player.id),
  ])
  const bench = roster.filter(p => !lineup.find(l => l.id === p.id) && !pitcherIds.has(p.id))

  const hasBullpen = BULLPEN_ORDER.some(r => bullpenGroups[r].length > 0)

  const Section = ({ title, children }) => (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-bg-border bg-bg-elevated">
        <h3 className="text-xs font-bold uppercase tracking-wide text-content-secondary">{title}</h3>
      </div>
      <div className="px-4">{children}</div>
    </div>
  )

  return (
    <div className="space-y-4">
      <Link
        to={`/simulation/${id}/roster/${teamId}`}
        className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-bold text-brand border border-brand/30 rounded hover:bg-brand/5 transition-colors"
      >
        Edit Roster &amp; Assignments →
      </Link>

      {lineup.length > 0 && (
        <Section title="Batting Order">
          {lineup.map((p, i) => (
            <RosterRow key={p.id} slot={i + 1} player={p} leagueId={leagueId} ratings={ratingsMap[p.id]} />
          ))}
        </Section>
      )}

      {rotationEntries.length > 0 && (
        <Section title="Starting Rotation">
          {rotationEntries.map((e, i) => (
            <RosterRow key={e.player.id} slot={`SP${i + 1}`} player={e.player} leagueId={leagueId} pitcherSt={e.state} ratings={ratingsMap[e.player.id]} />
          ))}
        </Section>
      )}

      {hasBullpen && (
        <Section title="Bullpen">
          {BULLPEN_ORDER.map(role =>
            bullpenGroups[role].length === 0 ? null : (
              <div key={role}>
                {hasPsMap && bullpenGroups[role].length > 0 && (
                  <div className="pt-2 pb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-content-muted">{BULLPEN_LABELS[role]}</span>
                  </div>
                )}
                {bullpenGroups[role].map(e => (
                  <RosterRow
                    key={e.player.id}
                    slot={!hasPsMap ? role.toUpperCase() : null}
                    player={e.player}
                    leagueId={leagueId}
                    pitcherSt={e.state}
                    ratings={ratingsMap[e.player.id]}
                  />
                ))}
              </div>
            )
          )}
        </Section>
      )}

      {bench.length > 0 && (
        <Section title="Rest of Roster">
          {bench.map(p => <RosterRow key={p.id} slot={null} player={p} leagueId={leagueId} ratings={ratingsMap[p.id]} />)}
        </Section>
      )}

    </div>
  )
}

function FranchiseTeamLog({ franchiseId, teamId, currentLeagueId }) {
  const { data, isLoading } = useQuery({
    queryKey:  ['franchise-team-history', franchiseId, teamId],
    queryFn:   () => api.franchises.teamHistory(franchiseId, teamId),
    staleTime: 5 * 60_000,
    enabled:   !!franchiseId,
  })

  const seasons = useMemo(
    () => [...(data?.seasons || [])].sort((a, b) => b.season - a.season),
    [data]
  )

  if (isLoading || !seasons.length) return null

  const fmt3 = v => v != null ? Number(v).toFixed(3) : '—'
  const fmt2 = v => v != null ? Number(v).toFixed(2) : '—'
  const fmtPct = v => v != null ? `.${String(Math.round(Number(v) * 1000)).padStart(3, '0')}` : '—'

  return (
    <section className="card overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-bg-border flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em]">Franchise History</h3>
        <span className="text-[10px] text-content-muted">{seasons.length} season{seasons.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-bg-border text-content-muted text-[10px] uppercase tracking-wider">
              <th className="px-4 py-2 text-left font-medium">Season</th>
              <th className="px-3 py-2 text-center font-medium">W</th>
              <th className="px-3 py-2 text-center font-medium">L</th>
              <th className="px-3 py-2 text-center font-medium">PCT</th>
              <th className="px-3 py-2 text-right font-medium">AVG</th>
              <th className="px-3 py-2 text-right font-medium">HR</th>
              <th className="px-3 py-2 text-right font-medium">ERA</th>
              <th className="px-4 py-2 text-left font-medium">Notable</th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((s) => {
              const isCurrent = s.league_id === Number(currentLeagueId)
              const playerAwards = (s.awards || []).filter(a => a.category !== 'postseason').slice(0, 4)
              return (
                <tr
                  key={s.season}
                  className={`border-b border-bg-border/60 last:border-b-0 transition-colors hover:bg-bg-elevated/40 ${isCurrent ? 'bg-brand/5' : ''}`}
                >
                  <td className="px-4 py-2.5 font-medium text-content-primary whitespace-nowrap">
                    {s.season}
                    {isCurrent && <span className="ml-1.5 text-[9px] text-brand font-semibold uppercase">Current</span>}
                    {s.champion && <span className="ml-1.5 text-[9px] font-bold text-amber-400">🏆 Champs</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center font-bold text-emerald-400">{s.w ?? '—'}</td>
                  <td className="px-3 py-2.5 text-center text-red-400">{s.l ?? '—'}</td>
                  <td className="px-3 py-2.5 text-center font-mono text-content-secondary">{fmtPct(s.pct)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmt3(s.avg)}</td>
                  <td className="px-3 py-2.5 text-right text-content-primary">{s.hr ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-content-primary">{fmt2(s.era)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {playerAwards.map((a, i) => (
                        <span key={i} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap">
                          {a.player_name} · {a.label}
                        </span>
                      ))}
                    </div>
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

export default function SimulationTeam() {
  const { id, teamId } = useParams()
  const qc = useQueryClient()
  const [tab, setTab] = useState('batting')

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey:  ['sim-team-player-stats', id, teamId],
    queryFn:   () => api.simulations.teamPlayerStats(id, teamId),
    staleTime: 60_000,
  })

  const { data: rosterData } = useQuery({
    queryKey:  ['sim-roster', id, teamId],
    queryFn:   () => api.simulations.roster(id, teamId),
    staleTime: 120_000,
  })

  const { data: stateData } = useQuery({
    queryKey:  ['sim-state', id],
    queryFn:   () => api.simulations.show(id),
    staleTime: 30_000,
  })

  const teamIdInt = parseInt(teamId)
  const franchiseId = stateData?.simulation_franchise_id

  const { data: franchiseTeamHistory } = useQuery({
    queryKey:  ['franchise-team-history', franchiseId, teamId],
    queryFn:   () => api.franchises.teamHistory(franchiseId, teamId),
    staleTime: 5 * 60_000,
    enabled:   !!franchiseId,
  })

  const teamMeta = rosterData ?? {}
  const teamName = teamMeta.team_name || `Team ${teamId}`
  const teamAbbr = teamMeta.team_abbr
  const teamColor = teamMeta.team_color

  const championshipSeasons = useMemo(
    () => (franchiseTeamHistory?.seasons || []).filter(s => s.champion).map(s => s.season).sort((a, b) => a - b),
    [franchiseTeamHistory]
  )

  // Team record from standings
  const standings = stateData?.standings || {}
  let record = null
  for (const lg of Object.values(standings)) {
    for (const div of Object.values(lg)) {
      const t = div.find(t => t.team_id === teamIdInt)
      if (t) { record = t; break }
    }
    if (record) break
  }

  const teamBatters  = (statsData?.batters  || []).map(r => ({ ...r, league_id: id }))
  const teamPitchers = (statsData?.pitchers || []).map(r => ({ ...r, league_id: id }))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center gap-4">
          <TeamLogo teamId={teamIdInt} abbr={teamAbbr} color={teamColor} size={56} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Link to={`/simulation/${id}`} className="text-xs text-content-muted hover:text-brand transition-colors">
                ← League
              </Link>
              <SimBadge />
            </div>
            <h1 className="text-xl font-bold text-content-primary">{teamName}</h1>
            {record && (
              <div className="flex items-center gap-3 mt-1 text-sm text-content-secondary">
                <span className="font-mono font-bold">{record.w}–{record.l}</span>
                <span className="text-content-muted font-mono">.{String(Math.round(record.pct * 1000)).padStart(3, '0')}</span>
                {record.gb !== '—' && <span className="text-content-muted text-xs">{record.gb} GB</span>}
                <span className={`text-xs font-bold ${record.streak_type === 'W' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {record.streak_type}
                </span>
              </div>
            )}
            {championshipSeasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30">
                  🏆 {championshipSeasons.length > 1 ? `×${championshipSeasons.length}` : `'${String(championshipSeasons[0]).slice(2)}`}
                  {championshipSeasons.length > 1 && (
                    <span className="font-normal opacity-60 ml-0.5">({championshipSeasons.map(y => `'${String(y).slice(2)}`).join(', ')})</span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Insights */}
      <SimInsightPanel
        queryKey={['sim-team-insight', id, teamId]}
        queryFn={() => api.simulations.teamInsights(id, teamId)}
        regenerateFn={async () => {
          await api.simulations.teamInsights(id, teamId, { refresh: true })
          qc.invalidateQueries({ queryKey: ['sim-team-insight', id, teamId] })
        }}
        sections={TEAM_INSIGHT_SECTIONS}
      />

      {/* Stats / Roster / IL tabs */}
      <div className="flex items-center rounded border border-bg-border overflow-hidden w-fit bg-bg-elevated">
        {[['batting', 'Batting'], ['pitching', 'Pitching'], ['roster', 'Roster'], ['il', 'IL']].map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-5 py-1.5 text-sm font-bold transition-colors ${tab === t ? 'tab-active' : 'tab-inactive'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'roster' ? (
        <RosterPanel rosterData={rosterData} leagueId={id} teamId={teamId} id={id} />
      ) : tab === 'il' ? (
        <TeamILPanel leagueId={id} teamId={teamId} />
      ) : statsLoading ? (
        <SimSpinner className="py-16" />
      ) : (
        <div className="card overflow-hidden">
          {tab === 'batting' ? (
            <SortableTable rows={teamBatters} cols={BATTER_COLS} sortKey="ab" showTeam={false} />
          ) : (
            <SortableTable rows={teamPitchers} cols={PITCHER_COLS} sortKey="gs" showTeam={false} />
          )}
        </div>
      )}

      {/* ── Franchise season history ── */}
      <FranchiseTeamLog franchiseId={stateData?.simulation_franchise_id} teamId={teamId} currentLeagueId={id} />
    </div>
  )
}
