import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { TeamLogo, SimBadge, SimSpinner } from '../components/sim/SimUI'

const SEVERITY_STYLE = {
  minor:    'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  moderate: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  major:    'text-red-400   bg-red-400/10   border-red-400/30',
}

const EVENT_STYLE = {
  injury_start:  { label: 'Placed on IL',  cls: 'text-red-400' },
  injury_return: { label: 'Activated',     cls: 'text-emerald-400' },
  award:         { label: 'Award',         cls: 'text-amber-400' },
}

function SeverityBadge({ severity }) {
  const cls = SEVERITY_STYLE[severity] || 'text-content-muted bg-bg-elevated border-bg-border'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {severity}
    </span>
  )
}

function PlayerLink({ leagueId, playerId, name }) {
  return (
    <Link
      to={`/simulation/${leagueId}/player/${playerId}`}
      className="font-semibold text-content-primary hover:text-brand transition-colors"
    >
      {name || `Player #${playerId}`}
    </Link>
  )
}

function ILTable({ rows, leagueId, showReturned }) {
  if (!rows.length) {
    return (
      <div className="px-5 py-8 text-center text-sm text-content-muted">
        {showReturned ? 'No returned players yet.' : 'No players currently on IL.'}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bg-border bg-bg-elevated">
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-content-muted">Player</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-content-muted">Team</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-content-muted">Severity</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-content-muted">IL Date</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-content-muted">Return</th>
            {!showReturned && (
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-content-muted">Days Left</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.id} className="border-b border-bg-border/40 last:border-0 hover:bg-bg-elevated transition-colors">
              <td className="px-4 py-3">
                <Link to={`/simulation/${leagueId}/player/${p.player_id}`} className="flex items-center gap-2 hover:opacity-75 transition-opacity">
                  <img
                    src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_40,q_auto:best/v1/people/${p.player_id}/headshot/67/current`}
                    alt="" className="w-6 h-6 rounded-full object-cover bg-bg-border shrink-0"
                    onError={e => { e.target.style.display = 'none' }}
                  />
                  <span className="text-sm font-medium text-content-primary hover:text-brand transition-colors">{p.player_name}</span>
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link to={`/simulation/${leagueId}/team/${p.team_id}`} className="flex items-center gap-1.5 hover:opacity-75 transition-opacity">
                  <TeamLogo teamId={p.team_id} abbr={p.team_abbr} color={p.team_color} size={16} />
                  <span className="font-mono text-xs text-content-secondary">{p.team_abbr}</span>
                </Link>
              </td>
              <td className="px-4 py-3"><SeverityBadge severity={p.severity} /></td>
              <td className="px-4 py-3 font-mono text-xs text-content-secondary">{p.il_start_date}</td>
              <td className="px-4 py-3 font-mono text-xs text-content-secondary">{p.il_end_date}</td>
              {!showReturned && (
                <td className="px-4 py-3 text-right font-mono font-bold text-content-primary">
                  {p.days_remaining > 0 ? `${p.days_remaining}d` : 'Today'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TransactionLog({ rows, leagueId }) {
  if (!rows.length) {
    return <div className="px-5 py-8 text-center text-sm text-content-muted">No transactions yet.</div>
  }

  return (
    <div className="divide-y divide-bg-border/40">
      {rows.map(tx => {
        const evStyle = EVENT_STYLE[tx.event_type] || { label: tx.event_type, cls: 'text-content-muted' }
        return (
          <div key={tx.id} className="flex items-center gap-3 px-4 py-3 hover:bg-bg-elevated transition-colors">
            <span className="text-[11px] font-mono text-content-muted w-20 shrink-0">{tx.game_date}</span>
            <span className={`text-[11px] font-bold uppercase tracking-wide w-24 shrink-0 ${evStyle.cls}`}>
              {evStyle.label}
            </span>
            <div className="flex items-center gap-2 min-w-0">
              {tx.player_id && (
                <PlayerLink leagueId={leagueId} playerId={tx.player_id} name={tx.player_name} />
              )}
              {tx.team_abbr && (
                <Link to={`/simulation/${leagueId}/team/${tx.team_id}`} className="flex items-center gap-1 hover:opacity-75">
                  <TeamLogo teamId={tx.team_id} abbr={tx.team_abbr} color={tx.team_color} size={14} />
                  <span className="text-[11px] font-mono text-content-muted">{tx.team_abbr}</span>
                </Link>
              )}
            </div>
            {tx.metadata?.severity && (
              <SeverityBadge severity={tx.metadata.severity} />
            )}
            {tx.metadata?.il_end_date && (
              <span className="text-[11px] text-content-muted ml-auto shrink-0">
                est. return {tx.metadata.il_end_date}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function SimulationInjuries() {
  const { id } = useParams()
  const [tab, setTab] = useState('active')

  const { data, isLoading } = useQuery({
    queryKey:  ['sim-injuries', id],
    queryFn:   () => api.simulations.injuries(id),
    staleTime: 30_000,
  })

  const activeIl   = data?.active_il   || []
  const ilHistory  = data?.il_history  || []
  const txLog      = data?.transactions || []
  const totalOnIl  = data?.summary?.total_on_il ?? activeIl.length

  return (
    <div className="space-y-5 py-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to={`/simulation/${id}`} className="text-content-muted hover:text-brand transition-colors text-sm">
          ← League
        </Link>
        <SimBadge />
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-content-primary">IL & Transactions</h1>
        {totalOnIl > 0 && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
            {totalOnIl} on IL
          </span>
        )}
      </div>

      <div className="flex items-center rounded border border-bg-border overflow-hidden w-fit bg-bg-elevated">
        {[['active', 'Active IL'], ['history', 'Returned'], ['log', 'Transaction Log']].map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-bold transition-colors ${tab === t ? 'tab-active' : 'tab-inactive'}`}
          >
            {label}
            {t === 'active' && totalOnIl > 0 && (
              <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">{totalOnIl}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <SimSpinner className="py-16" />
      ) : (
        <div className="card overflow-hidden">
          {tab === 'active'  && <ILTable rows={activeIl}  leagueId={id} showReturned={false} />}
          {tab === 'history' && <ILTable rows={ilHistory} leagueId={id} showReturned={true} />}
          {tab === 'log'     && <TransactionLog rows={txLog} leagueId={id} />}
        </div>
      )}
    </div>
  )
}
