import { useState, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { TeamLogo, SimPlayerAvatar } from '../components/sim/SimUI'

// ─────────────────────────────────────────────────────────────────
// Player-linking helpers for insights (sim routes)
// ─────────────────────────────────────────────────────────────────

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function buildSimPlayerIndex(boxScore, game) {
  const idx = {}
  const add = (players, teamId, teamAbbr) => {
    ;(players || []).forEach(p => {
      if (p.name && p.player_id) idx[p.name] = { id: p.player_id, teamId, teamAbbr }
    })
  }
  add(boxScore?.away?.batters,  game?.away_team_id, game?.away_team_abbr)
  add(boxScore?.away?.pitchers, game?.away_team_id, game?.away_team_abbr)
  add(boxScore?.home?.batters,  game?.home_team_id, game?.home_team_abbr)
  add(boxScore?.home?.pitchers, game?.home_team_id, game?.home_team_abbr)
  return idx
}

function linkSimPlayersInText(text, playerIndex, leagueId) {
  const line = String(text || '')
  const names = Object.keys(playerIndex || {}).filter(Boolean)
  if (!names.length) return <span>{line}</span>
  const pattern = new RegExp(`\\b(${names.map(escapeRegExp).sort((a, b) => b.length - a.length).join('|')})\\b`, 'g')
  const parts = line.split(pattern)
  return parts.map((part, idx) => {
    const player = playerIndex[part]
    if (!player) return <span key={`t-${idx}`}>{part}</span>
    return (
      <Link key={`p-${player.id}-${idx}`} to={`/simulation/${leagueId}/player/${player.id}`}
        className="text-brand-light hover:underline font-medium">
        {part}
      </Link>
    )
  })
}

function extractMentionedPlayers(lines, playerIndex) {
  const seen = new Set()
  const players = []
  const names = Object.keys(playerIndex || {}).filter(Boolean)
  if (!names.length) return players
  const pattern = new RegExp(`\\b(${names.map(escapeRegExp).sort((a, b) => b.length - a.length).join('|')})\\b`, 'g')
  for (const line of (lines || [])) {
    for (const match of String(line).matchAll(pattern)) {
      const player = playerIndex[match[1]]
      if (player && !seen.has(player.id)) { seen.add(player.id); players.push({ name: match[1], ...player }) }
    }
  }
  return players
}

// ─────────────────────────────────────────────────────────────────
// Normalizers — map real API shape → our sim shape
// ─────────────────────────────────────────────────────────────────

function normalizeRealBatter(p) {
  return {
    player_id: p.playerId,
    name:      p.playerName,
    ab:        p.ab         ?? 0,
    h:         p.hits       ?? 0,
    double:    p.doubles    ?? 0,
    triple:    p.triples    ?? 0,
    hr:        p.homeRuns   ?? 0,
    rbi:       p.rbi        ?? 0,
    bb:        p.walks      ?? 0,
    k:         p.strikeOuts ?? 0,
    r:         p.runs       ?? 0,
  }
}

function normalizeRealPitcher(p) {
  return {
    player_id: p.playerId,
    name:      p.playerName,
    ip:        p.inningsPitched ?? '0.0',
    h:         p.hits           ?? 0,
    er:        p.earnedRuns     ?? 0,
    bb:        p.walks          ?? 0,
    k:         p.strikeOuts     ?? 0,
    bf:        p.battersFaced   ?? 0,
    hr:        p.homeRuns       ?? 0,
    decision:  null,
  }
}

// ─────────────────────────────────────────────────────────────────
// Comparison hero — side-by-side Sim vs Actual
// ─────────────────────────────────────────────────────────────────

function ComparisonHero({ game, actual, leagueId }) {
  const simAwayWon = game.away_score > game.home_score
  const actAwayWon = actual.away_score > actual.home_score
  const correctWinner =
    (simAwayWon && actAwayWon) || (!simAwayWon && !actAwayWon)
  const runError =
    Math.abs(game.away_score - actual.away_score) +
    Math.abs(game.home_score - actual.home_score)

  return (
    <div className="card p-0 overflow-hidden">
      {/* Title bar */}
      <div className="px-5 py-3 border-b border-bg-border bg-bg-elevated flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-content-muted">
          Sim vs. Actual
        </span>
        <div className="flex items-center gap-3 text-xs">
          <span className={`flex items-center gap-1 font-bold ${correctWinner ? 'text-emerald-400' : 'text-red-400'}`}>
            {correctWinner ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {correctWinner ? 'Correct pick' : 'Wrong pick'}
          </span>
          <span className="text-content-muted">·</span>
          <span className="text-content-muted">
            Run error: <span className="font-mono font-bold text-content-secondary">{runError}</span>
          </span>
        </div>
      </div>

      {/* Scores */}
      <div className="grid grid-cols-2 divide-x divide-bg-border">
        {/* Simulated */}
        <div className="p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-brand mb-3">Simulated</div>
          {[
            { id: game.away_team_id, abbr: game.away_team_abbr, name: game.away_team_name, color: game.away_team_color, score: game.away_score, won: simAwayWon },
            { id: game.home_team_id, abbr: game.home_team_abbr, name: game.home_team_name, color: game.home_team_color, score: game.home_score, won: !simAwayWon },
          ].map(team => (
            <div key={team.id} className={`flex items-center justify-between py-2 ${team.won ? '' : 'opacity-50'}`}>
              <Link to={`/simulation/${leagueId}/team/${team.id}`} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
                <TeamLogo teamId={team.id} abbr={team.abbr} color={team.color} size={28} />
                <div>
                  <div className="font-mono font-black text-sm text-content-primary">{team.abbr}</div>
                  <div className="text-[10px] text-content-muted">{team.name}</div>
                </div>
              </Link>
              <span className={`font-mono font-black text-3xl tabular-nums ${team.won ? 'text-content-primary' : 'text-content-secondary'}`}>
                {team.score}
              </span>
            </div>
          ))}
        </div>

        {/* Actual */}
        <div className="p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-3">Actual</div>
          {[
            { id: game.away_team_id, abbr: game.away_team_abbr, name: game.away_team_name, color: game.away_team_color, score: actual.away_score, won: actAwayWon },
            { id: game.home_team_id, abbr: game.home_team_abbr, name: game.home_team_name, color: game.home_team_color, score: actual.home_score, won: !actAwayWon },
          ].map(team => (
            <div key={team.id} className={`flex items-center justify-between py-2 ${team.won ? '' : 'opacity-50'}`}>
              <Link to={`/simulation/${leagueId}/team/${team.id}`} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
                <TeamLogo teamId={team.id} abbr={team.abbr} color={team.color} size={28} />
                <div>
                  <div className="font-mono font-black text-sm text-content-primary">{team.abbr}</div>
                  <div className="text-[10px] text-content-muted">{team.name}</div>
                </div>
              </Link>
              <span className={`font-mono font-black text-3xl tabular-nums ${team.won ? 'text-emerald-400' : 'text-content-secondary'}`}>
                {team.score}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Plain score hero (no actual comparison)
// ─────────────────────────────────────────────────────────────────

function ScoreHero({ game, leagueId }) {
  const awayWon = game.away_score > game.home_score
  const homeWon = game.home_score > game.away_score
  return (
    <div className="card p-6">
      <div className="flex items-center justify-center gap-0">
        <Link to={`/simulation/${leagueId}/team/${game.away_team_id}`} className={`flex-1 flex flex-col items-center gap-2 pr-6 hover:opacity-80 transition-opacity ${awayWon ? '' : 'opacity-55'}`}>
          <TeamLogo teamId={game.away_team_id} abbr={game.away_team_abbr} color={game.away_team_color} size={44} />
          <div className="font-mono font-black text-sm text-content-primary tracking-wide">{game.away_team_abbr}</div>
          <div className={`text-5xl font-black font-mono tabular-nums ${awayWon ? 'text-content-primary' : 'text-content-secondary'}`}>
            {game.away_score}
          </div>
          <div className="text-[11px] text-content-muted text-center max-w-28 leading-tight">{game.away_team_name}</div>
        </Link>

        <div className="flex flex-col items-center gap-2 shrink-0 px-4">
          <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest">Final</span>
          <div className="w-px h-10 bg-bg-border" />
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
            game.is_real
              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
              : 'text-brand border-brand/30 bg-brand/10'
          }`}>
            {game.is_real ? 'Real' : 'Sim'}
          </span>
        </div>

        <Link to={`/simulation/${leagueId}/team/${game.home_team_id}`} className={`flex-1 flex flex-col items-center gap-2 pl-6 hover:opacity-80 transition-opacity ${homeWon ? '' : 'opacity-55'}`}>
          <TeamLogo teamId={game.home_team_id} abbr={game.home_team_abbr} color={game.home_team_color} size={44} />
          <div className="font-mono font-black text-sm text-content-primary tracking-wide">{game.home_team_abbr}</div>
          <div className={`text-5xl font-black font-mono tabular-nums ${homeWon ? 'text-content-primary' : 'text-content-secondary'}`}>
            {game.home_score}
          </div>
          <div className="text-[11px] text-content-muted text-center max-w-28 leading-tight">{game.home_team_name}</div>
        </Link>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Linescore — supports dual (sim + actual) or single mode
// ─────────────────────────────────────────────────────────────────

function LinescoreRow({ game, runs, total, side, label, labelStyle, leagueId }) {
  const teamId    = side === 'away' ? game.away_team_id    : game.home_team_id
  const abbr      = side === 'away' ? game.away_team_abbr  : game.home_team_abbr
  const name      = side === 'away' ? game.away_team_name  : game.home_team_name
  const color     = side === 'away' ? game.away_team_color : game.home_team_color
  const otherTotal = side === 'away' ? game.home_score : game.away_score
  const won = total > otherTotal

  return (
    <tr className="border-b border-bg-border/40 last:border-0">
      <td className="pl-3 pr-2 py-2.5 w-28">
        <Link to={`/simulation/${leagueId}/team/${teamId}`} className="flex items-center gap-2 hover:opacity-75 transition-opacity">
          <TeamLogo teamId={teamId} abbr={abbr} color={color} size={16} />
          <span className={`font-mono font-bold text-[11px] ${won ? 'text-content-primary' : 'text-content-secondary'}`}>{abbr}</span>
          {label && (
            <span className={`text-[9px] font-bold uppercase px-1 py-px rounded border ${labelStyle}`}>{label}</span>
          )}
        </Link>
      </td>
      {runs.map((r, i) => (
        <td key={i} className={`px-2 py-2.5 text-center font-mono text-xs ${r > 0 ? 'text-content-primary' : 'text-content-muted'}`}>
          {r ?? '—'}
        </td>
      ))}
      <td className={`px-3 py-2.5 text-center font-mono font-bold text-sm border-l border-bg-border ${won ? 'text-content-primary' : 'text-content-secondary'}`}>
        {total}
      </td>
    </tr>
  )
}

function Linescore({ game, simLinescore, realInnings, leagueId }) {
  const hasReal = realInnings?.length > 0
  const innings = simLinescore?.length || realInnings?.length || 0

  if (!simLinescore?.length && !hasReal) return null

  const simAway = simLinescore?.map(inn => inn[0]) ?? []
  const simHome = simLinescore?.map(inn => inn[1]) ?? []
  const realAway = realInnings?.map(inn => inn.away ?? 0) ?? []
  const realHome = realInnings?.map(inn => inn.home ?? 0) ?? []

  const simAwayTotal = game.away_score
  const simHomeTotal = game.home_score
  const realAwayTotal = realInnings ? realAway.reduce((a, b) => a + b, 0) : null
  const realHomeTotal = realInnings ? realHome.reduce((a, b) => a + b, 0) : null

  const simStyle  = 'text-brand border-brand/30 bg-brand/10'
  const realStyle = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-bg-border bg-bg-elevated">
            <th className="px-3 py-2 text-left text-content-muted w-28 font-semibold">Team</th>
            {Array.from({ length: innings }, (_, i) => (
              <th key={i} className="px-2 py-2 text-center text-content-muted w-7">{i + 1}</th>
            ))}
            <th className="px-3 py-2 text-center font-bold text-content-secondary border-l border-bg-border w-9">R</th>
          </tr>
        </thead>
        <tbody>
          {/* Simulated rows */}
          <LinescoreRow game={game} runs={simAway} total={simAwayTotal} side="away"
            label={hasReal ? 'SIM' : null} labelStyle={simStyle} leagueId={leagueId} />
          <LinescoreRow game={game} runs={simHome} total={simHomeTotal} side="home"
            label={hasReal ? 'SIM' : null} labelStyle={simStyle} leagueId={leagueId} />

          {/* Actual rows */}
          {hasReal && (
            <>
              <tr><td colSpan={innings + 2} className="py-0"><div className="border-t border-brand/20" /></td></tr>
              <LinescoreRow game={game} runs={realAway} total={realAwayTotal} side="away"
                label="ACT" labelStyle={realStyle} leagueId={leagueId} />
              <LinescoreRow game={game} runs={realHome} total={realHomeTotal} side="home"
                label="ACT" labelStyle={realStyle} leagueId={leagueId} />
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Shared: merge sim + real player lists by player_id
// ─────────────────────────────────────────────────────────────────

function mergeByPlayerId(sim, real) {
  const simMap  = new Map(sim.map(p  => [p.player_id,  p]))
  const realMap = new Map(real.map(p => [p.player_id, p]))
  // sim order first, then any real-only players
  const ids = [
    ...sim.map(p => p.player_id),
    ...real.filter(p => !simMap.has(p.player_id)).map(p => p.player_id),
  ]
  return ids.map(id => ({ id, sim: simMap.get(id) ?? null, real: realMap.get(id) ?? null }))
}

// ─────────────────────────────────────────────────────────────────
// Batting table — single or side-by-side comparison
// ─────────────────────────────────────────────────────────────────

const BATTER_COLS = ['AB', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'R']

function batterVal(b, col) {
  if (!b) return null
  switch (col) {
    case '2B': return b.double ?? 0
    case '3B': return b.triple ?? 0
    default:   return b[col.toLowerCase()] ?? 0
  }
}

function batTotals(batters) {
  return batters.reduce(
    (acc, b) => ({
      ab: acc.ab+b.ab, h: acc.h+b.h, double: acc.double+(b.double||0), triple: acc.triple+(b.triple||0),
      hr: acc.hr+b.hr, rbi: acc.rbi+b.rbi, bb: acc.bb+b.bb, k: acc.k+b.k, r: acc.r+b.r,
    }),
    { ab:0, h:0, double:0, triple:0, hr:0, rbi:0, bb:0, k:0, r:0 }
  )
}

function BatCell({ val, highlight }) {
  if (val === null) return <td className="px-2 py-2 text-center font-mono text-content-muted/30 text-xs">–</td>
  const dim = val === 0
  return (
    <td className={`px-2 py-2 text-center font-mono text-xs tabular-nums ${
      dim    ? 'text-content-muted/50' :
      highlight && val > 0 ? 'text-content-primary font-semibold' :
      'text-content-secondary'
    }`}>
      {val}
    </td>
  )
}

function BattingTable({ simBatters = [], realBatters = [], label, color, teamId, leagueId }) {
  const hasReal    = realBatters.length > 0
  const comparison = hasReal && simBatters.length > 0
  const rows       = comparison ? mergeByPlayerId(simBatters, realBatters)
                   : simBatters.length  ? simBatters.map(p  => ({ id: p.player_id,  sim: p,  real: null }))
                   : realBatters.map(p => ({ id: p.player_id, sim: null, real: p }))

  if (!rows.length) return null

  const activeBatters = comparison ? simBatters : (simBatters.length ? simBatters : realBatters)
  const tot = batTotals(activeBatters)
  const avg = tot.ab > 0 ? (tot.h / tot.ab).toFixed(3).replace(/^0/, '') : '.000'

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-bg-border flex items-center gap-2 bg-bg-elevated">
        <Link to={`/simulation/${leagueId}/team/${teamId}`} className="flex items-center gap-2 hover:text-brand transition-colors">
          <TeamLogo teamId={teamId} abbr={label} color={color} size={18} />
          <h3 className="text-xs font-bold text-content-primary uppercase tracking-wide">{label} Batting</h3>
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            {comparison && (
              <tr className="border-b border-bg-border/30">
                <th className="px-3 py-1 text-left" />
                <th colSpan={9} className="py-1 text-center text-[10px] font-bold text-brand/80 uppercase tracking-widest border-r border-bg-border/60">
                  Simulated
                </th>
                <th colSpan={9} className="py-1 text-center text-[10px] font-bold text-emerald-400/80 uppercase tracking-widest">
                  Actual
                </th>
              </tr>
            )}
            <tr className="border-b border-bg-border/50 bg-bg-elevated/40">
              <th className="px-3 py-1.5 text-left text-content-muted font-semibold min-w-36">Player</th>
              {(comparison ? BATTER_COLS : BATTER_COLS).map(col => (
                <th key={`s-${col}`} className="px-2 py-1.5 text-center text-content-muted font-semibold w-8">{col}</th>
              ))}
              {comparison && (
                <>
                  <th className="w-px border-r border-bg-border/60 p-0" />
                  {BATTER_COLS.map(col => (
                    <th key={`r-${col}`} className="px-2 py-1.5 text-center text-content-muted font-semibold w-8">{col}</th>
                  ))}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, sim, real }, i) => {
              const name = sim?.name ?? real?.name ?? `Player #${id}`
              const pid  = sim?.player_id ?? real?.player_id
              return (
                <tr key={id ?? i} className="border-b border-bg-border/20 last:border-0 hover:bg-bg-surface/60 transition-colors">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="text-content-muted font-mono text-[10px] w-3 text-right shrink-0">{i + 1}</span>
                      <Link to={`/simulation/${leagueId}/player/${pid}`} className="hover:opacity-80 transition-opacity">
                        <SimPlayerAvatar playerId={pid} name={name} size={20} showName />
                      </Link>
                    </div>
                  </td>
                  {BATTER_COLS.map(col => (
                    <BatCell key={`s-${col}`} val={batterVal(sim, col)} highlight={col === 'H' || col === 'HR' || col === 'RBI'} />
                  ))}
                  {comparison && (
                    <>
                      <td className="w-px border-r border-bg-border/60 p-0" />
                      {BATTER_COLS.map(col => (
                        <BatCell key={`r-${col}`} val={batterVal(real, col)} highlight={col === 'H' || col === 'HR' || col === 'RBI'} />
                      ))}
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-bg-border bg-bg-elevated">
              <td className="px-3 py-2 text-xs font-bold text-content-secondary pl-8">
                Totals <span className="font-normal text-content-muted">({avg})</span>
              </td>
              {[tot.ab, tot.h, tot.double, tot.triple, tot.hr, tot.rbi, tot.bb, tot.k, tot.r].map((v, i) => (
                <td key={i} className="px-2 py-2 text-center font-mono font-bold text-content-secondary">{v}</td>
              ))}
              {comparison && (
                <>
                  <td className="w-px border-r border-bg-border/60 p-0" />
                  {(() => { const rt = batTotals(realBatters); return [rt.ab, rt.h, rt.double, rt.triple, rt.hr, rt.rbi, rt.bb, rt.k, rt.r] })()
                    .map((v, i) => (
                      <td key={i} className="px-2 py-2 text-center font-mono font-bold text-emerald-400/80">{v}</td>
                    ))}
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Pitching table — single or side-by-side comparison
// ─────────────────────────────────────────────────────────────────

const DECISION_STYLES = {
  W: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  L: 'text-red-400 border-red-500/30 bg-red-500/10',
  S: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
}

const PITCHER_COLS = ['IP', 'H', 'ER', 'BB', 'K', 'BF', 'HR']

function pitcherVal(p, col) {
  if (!p) return null
  switch (col) {
    case 'IP':  return p.ip  ?? '—'
    case 'H':   return p.h   ?? 0
    case 'ER':  return p.er  ?? 0
    case 'BB':  return p.bb  ?? 0
    case 'K':   return p.k   ?? 0
    case 'BF':  return p.bf  ?? 0
    case 'HR':  return p.hr  ?? 0
    default:    return null
  }
}

function PitCell({ val, col }) {
  if (val === null) return <td className="px-2 py-2 text-center font-mono text-xs text-content-muted/30">–</td>
  const isIP  = col === 'IP'
  const isER  = col === 'ER'
  const isK   = col === 'K'
  const erVal = typeof val === 'number' ? val : 0
  return (
    <td className={`px-2 py-2 text-center font-mono text-xs tabular-nums ${
      isIP ? 'text-content-primary font-semibold' :
      isER && erVal > 3 ? 'text-red-400' :
      isK  ? 'text-content-primary' :
      'text-content-secondary'
    }`}>
      {val === 0 && !isIP ? <span className="text-content-muted/50">0</span> : val}
    </td>
  )
}

function PitchingTable({ simPitchers = [], realPitchers = [], label, color, teamId, leagueId }) {
  const hasReal    = realPitchers.length > 0
  const comparison = hasReal && simPitchers.length > 0
  const rows       = comparison ? mergeByPlayerId(simPitchers, realPitchers)
                   : simPitchers.length ? simPitchers.map(p  => ({ id: p.player_id,  sim: p,  real: null }))
                   : realPitchers.map(p => ({ id: p.player_id, sim: null, real: p }))

  if (!rows.length) return null

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-bg-border flex items-center gap-2 bg-bg-elevated">
        <Link to={`/simulation/${leagueId}/team/${teamId}`} className="flex items-center gap-2 hover:text-brand transition-colors">
          <TeamLogo teamId={teamId} abbr={label} color={color} size={18} />
          <h3 className="text-xs font-bold text-content-primary uppercase tracking-wide">{label} Pitching</h3>
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            {comparison && (
              <tr className="border-b border-bg-border/30">
                <th className="px-3 py-1 text-left" />
                <th colSpan={7} className="py-1 text-center text-[10px] font-bold text-brand/80 uppercase tracking-widest border-r border-bg-border/60">
                  Simulated
                </th>
                <th colSpan={7} className="py-1 text-center text-[10px] font-bold text-emerald-400/80 uppercase tracking-widest">
                  Actual
                </th>
              </tr>
            )}
            <tr className="border-b border-bg-border/50 bg-bg-elevated/40">
              <th className="px-3 py-1.5 text-left text-content-muted font-semibold min-w-36">Pitcher</th>
              {PITCHER_COLS.map(col => (
                <th key={`s-${col}`} className="px-2 py-1.5 text-center text-content-muted font-semibold w-8">{col}</th>
              ))}
              {comparison && (
                <>
                  <th className="w-px border-r border-bg-border/60 p-0" />
                  {PITCHER_COLS.map(col => (
                    <th key={`r-${col}`} className="px-2 py-1.5 text-center text-content-muted font-semibold w-8">{col}</th>
                  ))}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, sim, real }, i) => {
              const name     = sim?.name ?? real?.name ?? `Player #${id}`
              const pid      = sim?.player_id ?? real?.player_id
              const decStyle = sim?.decision ? DECISION_STYLES[sim.decision] : null
              return (
                <tr key={id ?? i} className="border-b border-bg-border/20 last:border-0 hover:bg-bg-surface/60 transition-colors">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Link to={`/simulation/${leagueId}/player/${pid}`} className="hover:opacity-80 transition-opacity">
                        <SimPlayerAvatar playerId={pid} name={name} size={20} showName />
                      </Link>
                      {decStyle && (
                        <span className={`px-1 py-px rounded border text-[10px] font-bold ${decStyle}`}>
                          {sim.decision}
                        </span>
                      )}
                    </div>
                  </td>
                  {PITCHER_COLS.map(col => (
                    <PitCell key={`s-${col}`} val={pitcherVal(sim, col)} col={col} />
                  ))}
                  {comparison && (
                    <>
                      <td className="w-px border-r border-bg-border/60 p-0" />
                      {PITCHER_COLS.map(col => (
                        <PitCell key={`r-${col}`} val={pitcherVal(real, col)} col={col} />
                      ))}
                    </>
                  )}
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
// Stats section
// ─────────────────────────────────────────────────────────────────

function StatsSection({ game, boxScore, realBoxScore, leagueId }) {
  const hasReal = !!realBoxScore

  const simBattersAway  = boxScore.away?.batters  ?? []
  const simBattersHome  = boxScore.home?.batters  ?? []
  const simPitchersAway = boxScore.away?.pitchers ?? []
  const simPitchersHome = boxScore.home?.pitchers ?? []

  const realBattersAway  = (realBoxScore?.batting?.away  ?? []).map(normalizeRealBatter)
  const realBattersHome  = (realBoxScore?.batting?.home  ?? []).map(normalizeRealBatter)
  const realPitchersAway = (realBoxScore?.pitching?.away ?? []).map(normalizeRealPitcher)
  const realPitchersHome = (realBoxScore?.pitching?.home ?? []).map(normalizeRealPitcher)

  return (
    <div className="space-y-4">
      <BattingTable
        simBatters={simBattersAway}
        realBatters={hasReal ? realBattersAway : []}
        label={game.away_team_abbr}
        color={game.away_team_color}
        teamId={game.away_team_id}
        leagueId={leagueId}
      />
      <BattingTable
        simBatters={simBattersHome}
        realBatters={hasReal ? realBattersHome : []}
        label={game.home_team_abbr}
        color={game.home_team_color}
        teamId={game.home_team_id}
        leagueId={leagueId}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <PitchingTable
          simPitchers={simPitchersAway}
          realPitchers={hasReal ? realPitchersAway : []}
          label={game.away_team_abbr}
          color={game.away_team_color}
          teamId={game.away_team_id}
          leagueId={leagueId}
        />
        <PitchingTable
          simPitchers={simPitchersHome}
          realPitchers={hasReal ? realPitchersHome : []}
          label={game.home_team_abbr}
          color={game.home_team_color}
          teamId={game.home_team_id}
          leagueId={leagueId}
        />
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
    queryKey:  ['sim-game', id, gameId],
    queryFn:   () => api.simulations.gameShow(id, gameId),
    staleTime: 300_000,
  })

  const game     = data?.game
  const boxScore = data?.box_score || {}
  const hasActual = boxScore.actual?.away_score != null
  const gamePk   = game?.game_pk

  const playerIndex = useMemo(() => buildSimPlayerIndex(boxScore, game), [boxScore, game])

  // Fetch real game data when this was a re-simulated real game
  const { data: realData, isLoading: realLoading } = useQuery({
    queryKey:  ['real-game', gamePk],
    queryFn:   () => api.games.details(gamePk),
    enabled:   hasActual && !!gamePk,
    staleTime: 3_600_000,
  })

  const realBoxScore = realData?.boxscore ?? null
  const realInnings  = realData?.linescore?.innings ?? null

  const { data: insightsData, isLoading: insightsLoading, refetch: refetchInsights } = useQuery({
    queryKey:  ['sim-game-insights', id, gameId],
    queryFn:   () => api.simulations.gameInsights(id, gameId),
    enabled:   !!game?.id,
    staleTime: 3_600_000,
  })

  const gameDate = game?.game_date
    ? new Date(game.game_date + 'T12:00:00').toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : ''

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-content-muted py-16 justify-center">
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Link to={`/simulation/${id}`} className="text-xs text-content-muted hover:text-brand transition-colors flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Command Center
          </Link>
          <span className="text-[9px] font-black uppercase tracking-widest bg-brand/15 text-brand border border-brand/25 px-2 py-0.5 rounded-full">
            SIM
          </span>
        </div>
        {gameDate && <span className="text-xs text-content-muted">{gameDate}</span>}
      </div>

      {/* AI Game Insights */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-[18px] font-semibold text-content-primary shrink-0">AI Game Insights</h2>
            <div className="flex items-center gap-2">
              <Link to={`/simulation/${id}/team/${game.away_team_id}`} className="flex items-center gap-1 hover:opacity-75 transition-opacity">
                <TeamLogo teamId={game.away_team_id} abbr={game.away_team_abbr} color={game.away_team_color} size={18} />
                <span className="text-xs text-content-secondary font-medium">{game.away_team_abbr}</span>
              </Link>
              <span className="text-xs text-content-muted">vs</span>
              <Link to={`/simulation/${id}/team/${game.home_team_id}`} className="flex items-center gap-1 hover:opacity-75 transition-opacity">
                <TeamLogo teamId={game.home_team_id} abbr={game.home_team_abbr} color={game.home_team_color} size={18} />
                <span className="text-xs text-content-secondary font-medium">{game.home_team_abbr}</span>
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {insightsData?.cached != null && (
              <span className="text-[11px] text-content-muted">{insightsData.cached ? 'Cached' : 'Fresh'}</span>
            )}
            {insightsData && !insightsLoading && (
              <button
                type="button"
                onClick={() => refetchInsights()}
                className="text-[10px] text-content-muted hover:text-brand transition-colors border border-bg-border px-2 py-0.5 rounded"
              >
                Refresh
              </button>
            )}
          </div>
        </div>

        {insightsLoading && (
          <div className="flex items-center gap-2 text-sm text-content-muted">
            <div className="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
            Generating insights…
          </div>
        )}

        {insightsData?.error && (
          <div className="text-sm text-content-muted">{insightsData.error}</div>
        )}

        {!insightsLoading && !insightsData?.error && insightsData?.insights && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {[
              { key: 'key_takeaways',         title: 'Key Takeaways' },
              { key: 'standout_performances', title: 'Standout Performances' },
              { key: 'pitching_story',        title: 'Pitching Story' },
              { key: 'game_notes',            title: 'Game Notes' },
            ].map(section => {
              const lines = insightsData.insights[section.key] || []
              const mentioned = extractMentionedPlayers(lines, playerIndex)
              return (
                <div key={section.key} className="rounded-lg bg-bg-elevated border border-bg-border p-3 flex flex-col gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted">{section.title}</h3>
                  <ul className="space-y-1.5 flex-1">
                    {lines.map((line, idx) => (
                      <li key={idx} className="text-sm text-content-secondary leading-relaxed">
                        <span className="font-mono text-content-muted mr-1.5">{idx + 1}.</span>
                        {linkSimPlayersInText(line, playerIndex, id)}
                      </li>
                    ))}
                  </ul>
                  {mentioned.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-bg-border">
                      {mentioned.map(player => (
                        <Link
                          key={player.id}
                          to={`/simulation/${id}/player/${player.id}`}
                          className="inline-flex items-center gap-1.5 text-brand-light hover:text-content-primary transition-colors"
                        >
                          <SimPlayerAvatar playerId={player.id} name={player.name} size={24} />
                          <span className="text-xs">{player.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Score section */}
      {hasActual ? (
        <ComparisonHero game={game} actual={boxScore.actual} leagueId={id} />
      ) : (
        <ScoreHero game={game} leagueId={id} />
      )}

      {/* Linescore */}
      <Linescore
        game={game}
        simLinescore={boxScore.linescore}
        realInnings={hasActual ? realInnings : null}
        leagueId={id}
      />

      {/* Stats */}
      {hasActual && realLoading ? (
        <div className="card p-8 text-center text-content-muted text-sm flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
          Loading actual game stats for comparison…
        </div>
      ) : (
        <StatsSection
          game={game}
          boxScore={boxScore}
          realBoxScore={hasActual ? realBoxScore : null}
          leagueId={id}
        />
      )}
    </div>
  )
}
