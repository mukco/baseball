import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

// ─────────────────────────────────────────────────────────────────
// Linescore
// ─────────────────────────────────────────────────────────────────

function Linescore({ game, linescore }) {
  if (!linescore?.length) return null

  const awayRuns = linescore.map(inn => inn[0])
  const homeRuns = linescore.map(inn => inn[1])
  const awayTotal = game.away_score ?? awayRuns.reduce((a, b) => a + b, 0)
  const homeTotal = game.home_score ?? homeRuns.reduce((a, b) => a + b, 0)
  const awayWon   = awayTotal > homeTotal
  const homeWon   = homeTotal > awayTotal

  const innings = linescore.length

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-bg-border bg-bg-elevated">
            <th className="px-4 py-2 text-left text-content-muted w-28">Team</th>
            {Array.from({ length: innings }, (_, i) => (
              <th key={i} className="px-2 py-2 text-center text-content-muted w-8">{i + 1}</th>
            ))}
            <th className="px-3 py-2 text-center font-bold text-content-secondary border-l border-bg-border w-10">R</th>
          </tr>
        </thead>
        <tbody>
          {/* Away */}
          <tr className="border-b border-bg-border">
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: game.away_team_color || '#555' }}
                />
                <span className={`font-bold text-[11px] ${awayWon ? 'text-content-primary' : 'text-content-secondary'}`}>
                  {game.away_team_abbr}
                </span>
                <span className="text-content-muted text-[10px] truncate hidden sm:block">
                  {game.away_team_name}
                </span>
              </div>
            </td>
            {awayRuns.map((r, i) => (
              <td key={i} className={`px-2 py-2.5 text-center ${r > 0 ? 'text-content-primary' : 'text-content-muted'}`}>{r}</td>
            ))}
            <td className={`px-3 py-2.5 text-center font-bold text-base border-l border-bg-border ${awayWon ? 'text-content-primary' : 'text-content-secondary'}`}>
              {awayTotal}
            </td>
          </tr>
          {/* Home */}
          <tr>
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: game.home_team_color || '#555' }}
                />
                <span className={`font-bold text-[11px] ${homeWon ? 'text-content-primary' : 'text-content-secondary'}`}>
                  {game.home_team_abbr}
                </span>
                <span className="text-content-muted text-[10px] truncate hidden sm:block">
                  {game.home_team_name}
                </span>
              </div>
            </td>
            {homeRuns.map((r, i) => (
              <td key={i} className={`px-2 py-2.5 text-center ${r > 0 ? 'text-content-primary' : 'text-content-muted'}`}>{r}</td>
            ))}
            <td className={`px-3 py-2.5 text-center font-bold text-base border-l border-bg-border ${homeWon ? 'text-content-primary' : 'text-content-secondary'}`}>
              {homeTotal}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Batting table
// ─────────────────────────────────────────────────────────────────

function BattingTable({ batters, label, color }) {
  if (!batters?.length) return null

  const totals = batters.reduce((acc, b) => ({
    ab:  acc.ab  + b.ab,
    h:   acc.h   + b.h,
    hr:  acc.hr  + b.hr,
    rbi: acc.rbi + b.rbi,
    bb:  acc.bb  + b.bb,
    k:   acc.k   + b.k,
    r:   acc.r   + b.r,
  }), { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, r: 0 })

  const avg = totals.ab > 0 ? (totals.h / totals.ab).toFixed(3).replace(/^0/, '') : '.000'

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-bg-border flex items-center gap-2 bg-bg-elevated">
        <span className="w-1 h-4 rounded-full shrink-0" style={{ background: color || '#555' }} />
        <h3 className="text-xs font-bold text-content-primary uppercase tracking-wide">{label} Batting</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-bg-border/50">
              <th className="px-4 py-2 text-left text-content-muted font-semibold">Player</th>
              {['AB', 'H', 'HR', 'RBI', 'BB', 'K', 'R'].map(col => (
                <th key={col} className="px-3 py-2 text-right text-content-muted font-semibold w-10">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batters.map((b, i) => {
              const bavg = b.ab > 0 ? (b.h / b.ab).toFixed(3).replace(/^0/, '') : '.000'
              return (
                <tr key={i} className="border-b border-bg-border/30 last:border-0 hover:bg-bg-surface transition-colors">
                  <td className="px-4 py-2 font-medium text-content-primary whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="text-content-muted font-mono text-[10px] w-4 text-right">{i + 1}</span>
                      {b.name}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-content-secondary">{b.ab}</td>
                  <td className="px-3 py-2 text-right font-mono font-medium text-content-primary">{b.h}</td>
                  <td className="px-3 py-2 text-right font-mono text-content-primary">{b.hr > 0 ? b.hr : <span className="text-content-muted">-</span>}</td>
                  <td className="px-3 py-2 text-right font-mono text-content-primary">{b.rbi > 0 ? b.rbi : <span className="text-content-muted">-</span>}</td>
                  <td className="px-3 py-2 text-right font-mono text-content-muted">{b.bb > 0 ? b.bb : '-'}</td>
                  <td className="px-3 py-2 text-right font-mono text-content-muted">{b.k > 0 ? b.k : '-'}</td>
                  <td className="px-3 py-2 text-right font-mono text-content-secondary">{b.r > 0 ? b.r : '-'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-bg-border bg-bg-elevated">
              <td className="px-4 py-2 text-xs font-bold text-content-secondary">
                Totals <span className="text-content-muted font-normal">({avg})</span>
              </td>
              {[totals.ab, totals.h, totals.hr, totals.rbi, totals.bb, totals.k, totals.r].map((v, i) => (
                <td key={i} className="px-3 py-2 text-right font-mono font-bold text-content-secondary">{v}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Pitching table
// ─────────────────────────────────────────────────────────────────

const DECISION_STYLES = {
  W: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  L: 'text-red-400 border-red-500/30 bg-red-500/10',
  S: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
}

function PitchingTable({ pitchers, label, color }) {
  if (!pitchers?.length) return null

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-bg-border flex items-center gap-2 bg-bg-elevated">
        <span className="w-1 h-4 rounded-full shrink-0" style={{ background: color || '#555' }} />
        <h3 className="text-xs font-bold text-content-primary uppercase tracking-wide">{label} Pitching</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-bg-border/50">
              <th className="px-4 py-2 text-left text-content-muted font-semibold">Pitcher</th>
              {['IP', 'H', 'ER', 'BB', 'K'].map(col => (
                <th key={col} className="px-3 py-2 text-right text-content-muted font-semibold w-10">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pitchers.map((p, i) => {
              const decStyle = p.decision ? DECISION_STYLES[p.decision] : null
              return (
                <tr key={i} className="border-b border-bg-border/30 last:border-0 hover:bg-bg-surface transition-colors">
                  <td className="px-4 py-2 font-medium text-content-primary whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {p.name}
                      {decStyle && (
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${decStyle}`}>
                          {p.decision}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium text-content-primary">{p.ip}</td>
                  <td className="px-3 py-2 text-right font-mono text-content-secondary">{p.h}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className={p.er > 3 ? 'text-red-400' : 'text-content-secondary'}>{p.er}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-content-muted">{p.bb}</td>
                  <td className="px-3 py-2 text-right font-mono text-content-primary">{p.k}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Box Score page
// ─────────────────────────────────────────────────────────────────

export default function SimulationBoxScore() {
  const { id, gameId } = useParams()

  const { data, isLoading, error } = useQuery({
    queryKey: ['sim-game', id, gameId],
    queryFn:  () => api.simulations.gameShow(id, gameId),
    staleTime: 300_000,
  })

  const game     = data?.game
  const boxScore = data?.box_score || {}

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-content-muted py-12 justify-center">
        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        Loading box score…
      </div>
    )
  }

  if (error || !game) {
    return (
      <div className="card p-8 text-center text-red-400">
        {error?.message || 'Game not found.'}
      </div>
    )
  }

  const awayWon = game.away_score > game.home_score
  const homeWon = game.home_score > game.away_score
  const gameDate = game.game_date
    ? new Date(game.game_date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link to={`/simulation/${id}`} className="text-xs text-content-muted hover:text-brand transition-colors">
          ← Back to Command Center
        </Link>

        {/* Score hero */}
        <div className="card p-6 mt-3">
          <div className="flex items-center justify-center gap-0 relative">
            {/* Away team */}
            <div className={`flex-1 text-center pr-6 ${awayWon ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-end gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ background: game.away_team_color || '#555' }}
                />
                <span className="text-sm font-bold text-content-primary uppercase tracking-wide">{game.away_team_abbr}</span>
              </div>
              <div className={`text-5xl font-black font-mono tabular-nums ${awayWon ? 'text-content-primary' : 'text-content-secondary'}`}>
                {game.away_score}
              </div>
              <div className="text-xs text-content-muted mt-1 truncate max-w-32 mx-auto">{game.away_team_name}</div>
            </div>

            {/* Divider */}
            <div className="flex flex-col items-center gap-1.5 shrink-0 px-4">
              <span className="text-xs font-bold text-content-muted uppercase tracking-widest">Final</span>
              <div className="w-px h-12 bg-bg-border" />
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                game.is_real
                  ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                  : 'text-brand border-brand/30 bg-brand/10'
              }`}>
                {game.is_real ? 'Real' : 'Simulated'}
              </span>
            </div>

            {/* Home team */}
            <div className={`flex-1 text-center pl-6 ${homeWon ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-start gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ background: game.home_team_color || '#555' }}
                />
                <span className="text-sm font-bold text-content-primary uppercase tracking-wide">{game.home_team_abbr}</span>
              </div>
              <div className={`text-5xl font-black font-mono tabular-nums ${homeWon ? 'text-content-primary' : 'text-content-secondary'}`}>
                {game.home_score}
              </div>
              <div className="text-xs text-content-muted mt-1 truncate max-w-32 mx-auto">{game.home_team_name}</div>
            </div>
          </div>

          {gameDate && (
            <p className="text-center text-xs text-content-muted mt-4">{gameDate}</p>
          )}
        </div>
      </div>

      {/* Linescore */}
      <Linescore game={game} linescore={boxScore.linescore} />

      {/* Batting — away first, then home */}
      <BattingTable
        batters={boxScore.away?.batters}
        label={game.away_team_abbr}
        color={game.away_team_color}
      />
      <BattingTable
        batters={boxScore.home?.batters}
        label={game.home_team_abbr}
        color={game.home_team_color}
      />

      {/* Pitching */}
      <div className="grid gap-5 lg:grid-cols-2">
        <PitchingTable
          pitchers={boxScore.away?.pitchers}
          label={game.away_team_abbr}
          color={game.away_team_color}
        />
        <PitchingTable
          pitchers={boxScore.home?.pitchers}
          label={game.home_team_abbr}
          color={game.home_team_color}
        />
      </div>
    </div>
  )
}
