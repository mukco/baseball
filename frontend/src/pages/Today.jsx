import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { api } from '../api'
import GameCard from '../components/GameCard'
import FactoidsPanel from '../components/FactoidsPanel'
import Standings from '../components/Standings'
import HotGameBanner from '../components/HotGameBanner'

function DateNav({ date, onChange }) {
  const prev = () => onChange(format(subDays(parseISO(date), 1), 'yyyy-MM-dd'))
  const next = () => onChange(format(addDays(parseISO(date), 1), 'yyyy-MM-dd'))
  const today = () => onChange(format(new Date(), 'yyyy-MM-dd'))
  const isToday = date === format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="flex items-center gap-3">
      <button onClick={prev} className="btn-ghost p-2 rounded-lg">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div className="flex flex-col items-center min-w-[120px]">
        <span className="text-lg font-bold text-content-primary">
          {format(parseISO(date), 'MMM d, yyyy')}
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 bg-bg-elevated border border-bg-border text-content-secondary text-xs rounded px-2 py-1 outline-none focus:border-brand"
        />
        {!isToday && (
          <button onClick={today} className="text-xs text-brand-light hover:underline">
            Back to today
          </button>
        )}
      </div>
      <button onClick={next} className="btn-ghost p-2 rounded-lg">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card animate-pulse">
          <div className="h-10 bg-bg-elevated border-b border-bg-border rounded-t-xl" />
          <div className="p-4 space-y-4">
            <div className="flex justify-between">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 bg-bg-elevated rounded-full" />
                <div className="w-12 h-3 bg-bg-elevated rounded" />
              </div>
              <div className="w-8 h-6 bg-bg-elevated rounded self-center" />
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 bg-bg-elevated rounded-full" />
                <div className="w-12 h-3 bg-bg-elevated rounded" />
              </div>
            </div>
            <div className="h-8 bg-bg-elevated rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Today() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [insightsHidden, setInsightsHidden] = useState(false)

  const isToday = date === format(new Date(), 'yyyy-MM-dd')

  const { data, isLoading, error } = useQuery({
    queryKey: ['schedule', date],
    queryFn: () => api.schedule.byDate(date),
    staleTime: isToday ? 0 : Infinity,
    refetchInterval: (query) => {
      if (!isToday) return false
      const games = query.state.data?.games ?? []
      if (games.some(g => g.abstractState === 'Live')) return 30_000
      if (games.some(g => g.abstractState === 'Preview')) return 60_000
      return false
    },
  })

  const games = data?.games ?? []
  const sorted = [...games].sort((a, b) => {
    const aLive = a.abstractState === 'Live'
    const bLive = b.abstractState === 'Live'
    if (aLive && !bLive) return -1
    if (!aLive && bLive) return 1

    if (aLive && bLive) {
      const aInn = a.currentInning || 0
      const bInn = b.currentInning || 0
      if (aInn !== bInn) return bInn - aInn
      return a.inningHalf === 'Bottom' ? -1 : 1
    }

    const aPrev = a.abstractState === 'Preview'
    const bPrev = b.abstractState === 'Preview'
    if (aPrev && !bPrev) return -1
    if (!aPrev && bPrev) return 1

    return (a.gameDate || '').localeCompare(b.gameDate || '')
  })
  const liveCount = games.filter((g) => g.abstractState === 'Live').length

  return (
    <div className="space-y-10 py-10">
      {/* Date nav */}
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-content-primary">Schedule</h1>
        <DateNav date={date} onChange={setDate} />
      </div>

      {isLoading && <Skeleton />}

      {error && (
        <div className="card p-8 text-center text-content-muted">
          Failed to load schedule. {error.message}
        </div>
      )}

      {!isLoading && !error && games.length === 0 && (
        <div className="card p-16 text-center">
          <div className="flex justify-center mb-3">
            <svg className="w-8 h-8 text-content-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" strokeWidth="1.5"/>
              <path d="M5.5 8.5c2 1 5 1 7 0" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M5.5 15.5c2-1 5-1 7 0" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="text-content-secondary font-medium">No games scheduled for this date.</div>
        </div>
      )}

      {!isLoading && !error && games.length > 0 && (
        <div className="space-y-10">
          <HotGameBanner date={date} hasFinalGames={games.some((g) => g.abstractState === 'Final')} />

          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em]">
              Games{liveCount > 0 ? ` · ${liveCount} live` : ''}
            </h2>
            <button
              type="button"
              onClick={() => setInsightsHidden((o) => !o)}
              className="text-xs px-2.5 py-1 rounded-md border border-bg-border bg-bg-elevated text-content-secondary hover:text-content-primary transition-colors"
            >
              {insightsHidden ? 'Show insights' : 'Hide insights'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sorted.map((g) => (
              <div key={g.gamePk} className="space-y-2">
                <GameCard game={g} />
                {!insightsHidden && (
                  <FactoidsPanel
                    queryKey={['game-factoids', g.gamePk]}
                    queryFn={() => api.factoids.game(g.gamePk)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Standings />
    </div>
  )
}
