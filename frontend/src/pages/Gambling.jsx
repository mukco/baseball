import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api'
import TeamIcon from '../components/TeamIcon'
import PlayerNameLink from '../components/PlayerNameLink'
import AutoLinkedText from '../components/AutoLinkedText'

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function shortDateLabel(value) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function ConfidenceBadge({ level }) {
  const color = level === 'high' ? 'bg-green-500/10 text-green-400 border-green-500/20'
    : level === 'medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    : 'bg-gray-500/10 text-gray-400 border-gray-500/20'

  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider ${color}`}>
      {level || 'unknown'}
    </span>
  )
}

function PickSection({ label, pick }) {
  return (
    <div className="rounded-lg border border-bg-border bg-bg-elevated p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">{label}</span>
        <ConfidenceBadge level={pick.confidence} />
      </div>
      <div className="text-sm font-semibold text-content-primary">{pick.pick}</div>
      {pick.key_factors?.length > 0 && (
        <ul className="space-y-0.5">
          {pick.key_factors.map((f, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] text-content-muted">
              <span className="text-brand shrink-0 mt-px">·</span>
              <AutoLinkedText text={f} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-content-secondary leading-relaxed"><AutoLinkedText text={pick.reasoning} /></p>
    </div>
  )
}

function GamePickCard({ game, oddsData }) {
  const { data: picksData, isLoading, isError } = useQuery({
    queryKey: ['game-picks', game.gamePk],
    queryFn: () => api.games.picks(game.gamePk),
    enabled: game.abstractState !== 'Final',
    staleTime: 5 * 60_000,
  })

  const away = game.away
  const home = game.home
  const isFinal = game.abstractState === 'Final'
  const isLive = game.abstractState === 'Live'
  const isPreview = game.abstractState === 'Preview'
  const odds = oddsData?.odds_data

  const finalClass = isFinal ? 'opacity-50' : ''

  return (
    <div className={`card p-4 space-y-3 ${finalClass}`}>
      {/* Matchup header with team logos */}
      <Link to={`/game/${game.gamePk}`} className="flex items-center justify-between gap-3 hover:opacity-80 transition-opacity">
        <div className="flex items-center gap-3 min-w-0">
          <TeamIcon teamId={away?.id} alt={away?.abbreviation} className="w-8 h-8" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-content-primary truncate">{away?.abbreviation || 'Away'}</div>
            <div className="text-[10px] text-content-muted truncate leading-tight">{away?.name || ''}</div>
          </div>
        </div>

        <div className="text-center shrink-0">
          {isLive && <div className="text-[11px] text-green-400 font-semibold">LIVE</div>}
          {isPreview && <div className="text-[11px] text-content-muted">{game.gameDate ? new Date(game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</div>}
          {isFinal && <div className="text-lg font-bold font-mono text-content-primary">{away?.score ?? '-'}</div>}
          {!isFinal && !isLive && <div className="text-[10px] text-content-muted">vs</div>}
          {!isFinal && !isPreview && !isLive && <div />}
        </div>

        <div className="flex items-center gap-3 min-w-0 text-right">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-content-primary truncate">{home?.abbreviation || 'Home'}</div>
            <div className="text-[10px] text-content-muted truncate leading-tight">{home?.name || ''}</div>
          </div>
          <TeamIcon teamId={home?.id} alt={home?.abbreviation} className="w-8 h-8" />
        </div>

        {isFinal && (
          <div className="text-center shrink-0">
            <div className="text-lg font-bold font-mono text-content-primary">{home?.score ?? '-'}</div>
          </div>
        )}
      </Link>

      {/* Odds for non-final games */}
      {!isFinal && odds && (odds.moneyline || odds.over_under != null || odds.spread != null) && (
        <div className="grid grid-cols-3 gap-2">
          {odds.moneyline && (
            <div className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2">
              <div className="text-[9px] text-content-muted uppercase tracking-wider mb-1">Moneyline</div>
              <div className="flex justify-between text-xs font-mono">
                <span className="flex items-center gap-1">
                  <TeamIcon teamId={home?.id} className="w-3 h-3" />
                  {home?.abbreviation}
                </span>
                <span className="font-semibold text-content-primary">{odds.home_moneyline}</span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="flex items-center gap-1">
                  <TeamIcon teamId={away?.id} className="w-3 h-3" />
                  {away?.abbreviation}
                </span>
                <span className="font-semibold text-content-primary">{odds.away_moneyline}</span>
              </div>
              <div className="text-[9px] text-content-muted mt-1">{odds.provider}</div>
            </div>
          )}
          {odds.over_under != null && (
            <div className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2">
              <div className="text-[9px] text-content-muted uppercase tracking-wider mb-1">Total</div>
              <div className="text-lg font-bold font-mono text-content-primary text-center">{odds.over_under}</div>
              <div className="flex justify-between text-[10px] font-mono text-content-muted mt-1">
                <span>O {odds.over_odds ? (odds.over_odds > 0 ? '+' : '') + odds.over_odds.toFixed(0) : '-'}</span>
                <span>U {odds.under_odds ? (odds.under_odds > 0 ? '+' : '') + odds.under_odds.toFixed(0) : '-'}</span>
              </div>
              <div className="text-[9px] text-content-muted mt-1">{odds.provider}</div>
            </div>
          )}
          {odds.spread != null && (
            <div className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2">
              <div className="text-[9px] text-content-muted uppercase tracking-wider mb-1">Spread</div>
              <div className="flex flex-col text-xs font-mono">
                <span className="flex items-center gap-1">
                  <TeamIcon teamId={home?.id} className="w-3 h-3" />
                  <span>{home?.abbreviation} {odds.spread > 0 ? '+' : ''}{odds.spread}</span>
                </span>
                <span className="flex items-center gap-1 mt-0.5">
                  <TeamIcon teamId={away?.id} className="w-3 h-3" />
                  <span>{away?.abbreviation} {(-odds.spread) > 0 ? '+' : ''}{(-odds.spread)}</span>
                </span>
              </div>
              <div className="text-[9px] text-content-muted mt-1">{odds.provider}</div>
            </div>
          )}
        </div>
      )}

      {!isFinal && odds && !odds.moneyline && odds.over_under == null && odds.spread == null && (
        <div className="rounded-lg border border-dashed border-bg-border bg-bg-elevated/50 px-3 py-3 text-center text-xs text-content-muted italic">
          No betting lines available yet
        </div>
      )}

      {/* AI Picks (only if available, otherwise card stands on odds alone) */}
      {!isFinal && isLoading && (
        <div className="space-y-2 animate-pulse">
          <div className="h-16 bg-bg-elevated rounded-lg" />
          <div className="h-10 bg-bg-elevated rounded-lg" />
        </div>
      )}

      {!isFinal && isError && (
        <div className="text-xs text-content-muted italic">AI analysis unavailable.</div>
      )}

      {!isFinal && !isLoading && !isError && picksData?.picks?.moneyline && (
        <PickSection label="Moneyline" pick={picksData.picks.moneyline} />
      )}

      {!isFinal && !isLoading && picksData?.picks?.overUnder && (
        <PickSection label="Over / Under" pick={picksData.picks.overUnder} />
      )}

      {!isFinal && !isLoading && picksData?.picks?.playerProps?.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">Player Props</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {picksData.picks.playerProps.slice(0, 4).map((prop, idx) => (
              <div key={idx} className="rounded-lg border border-bg-border bg-bg-elevated p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <PlayerNameLink name={prop.player} textClassName="text-xs font-semibold" imageClassName="w-3.5 h-3.5" />
                  <ConfidenceBadge level={prop.confidence} />
                </div>
                <div className="text-[11px] text-brand font-medium">{prop.prop}</div>
                <p className="text-[11px] text-content-secondary leading-relaxed"><AutoLinkedText text={prop.reasoning} /></p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isFinal && !isLoading && picksData?.picks?.valueSide && (
        <div className="flex gap-2 items-start rounded-lg border border-brand/20 bg-brand/5 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand shrink-0 mt-0.5">Value</span>
          <p className="text-[11px] text-content-secondary leading-relaxed"><AutoLinkedText text={picksData.picks.valueSide} /></p>
        </div>
      )}

      {!isFinal && !isLoading && picksData?.picks?.summary && (
        <p className="text-[11px] text-content-secondary leading-relaxed italic border-t border-bg-border/50 pt-2"><AutoLinkedText text={picksData.picks.summary} /></p>
      )}

      {isFinal && <p className="text-[11px] text-content-muted italic text-center">Game completed</p>}
    </div>
  )
}

export default function Gambling() {
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ['schedule', selectedDate],
    queryFn: () => api.schedule.byDate(selectedDate),
    staleTime: 2 * 60_000,
  })

  const games = scheduleData?.games || []

  const { data: oddsData } = useQuery({
    queryKey: ['odds', selectedDate],
    queryFn: () => api.odds.today(selectedDate),
    staleTime: 5 * 60_000,
  })

  const oddsByTeam = useMemo(() => {
    const map = {}
    const oddsGames = oddsData?.games
    if (!Array.isArray(oddsGames)) return map
    for (const game of games) {
      const homeName = game.home?.name
      const awayName = game.away?.name
      if (!homeName || !awayName) continue

      const match = oddsGames.find(
        (o) => o.home_team === homeName && o.away_team === awayName
      )
      if (match) map[game.gamePk] = match
    }
    return map
  }, [games, oddsData])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-content-primary">Gambling Picks</h1>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="bg-bg-surface border border-bg-border rounded-md px-3 py-1.5 text-sm text-content-primary"
        />
      </div>

      <p className="text-sm text-content-secondary">
        Real betting lines from ESPN + AI-generated analysis for {fmtDate(selectedDate)}.
      </p>

      {scheduleLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card p-4 space-y-3 animate-pulse">
              <div className="h-5 w-32 bg-bg-elevated rounded" />
              <div className="h-20 bg-bg-elevated rounded-lg" />
              <div className="h-12 bg-bg-elevated rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {!scheduleLoading && games.length === 0 && (
        <div className="card p-8 text-center text-content-muted text-sm">
          No games scheduled for {shortDateLabel(selectedDate)}.
        </div>
      )}

      {!scheduleLoading && games.length > 0 && (
        <div className="space-y-4">
          <div className="text-xs text-content-muted">
            {games.length} game{games.length !== 1 ? 's' : ''}
            {' '}·{' '}{games.filter((g) => g.abstractState === 'Preview').length} upcoming
            {' '}·{' '}{games.filter((g) => g.abstractState === 'Live').length} live
            {' '}·{' '}{games.filter((g) => g.abstractState === 'Final').length} final
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {games.map((game) => (
              <GamePickCard key={game.gamePk} game={game} oddsData={oddsByTeam[game.gamePk]} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
