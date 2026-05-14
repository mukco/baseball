import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { api } from '../api'
import GameCard from '../components/GameCard'
import FactoidsPanel from '../components/FactoidsPanel'
import MlbWatchFrame from '../components/MlbWatchFrame'
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

  const { data, isLoading, error } = useQuery({
    queryKey: ['schedule', date],
    queryFn: () => api.schedule.byDate(date),
  })

  const games = data?.games ?? []
  const live = games.filter((g) => g.abstractState === 'Live' || g.status === 'In Progress')
  const preview = games.filter((g) => g.abstractState === 'Preview')
  const final = games.filter((g) => g.abstractState === 'Final')

  function GameSection({ title, games: sectionGames, showEmbeds = false }) {
    if (!sectionGames.length) return null
    return (
      <section>
        <h2 className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-3">{title}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sectionGames.map((g) => (
            <div key={g.gamePk} className="space-y-2">
              <GameCard game={g} />
              {showEmbeds && <MlbWatchFrame gamePk={g.gamePk} />}
              <FactoidsPanel
                queryKey={['game-factoids', g.gamePk]}
                queryFn={() => api.factoids.game(g.gamePk)}
              />
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-8">
      {/* Date nav */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-content-primary">Schedule</h1>
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
          <div className="text-4xl mb-3">⚾</div>
          <div className="text-content-secondary font-medium">No games scheduled for this date.</div>
        </div>
      )}

      {!isLoading && !error && games.length > 0 && (
        <div className="space-y-8">
          <HotGameBanner date={date} hasFinalGames={final.length > 0} />
          <GameSection title={`Live · ${live.length}`} games={live} showEmbeds />
          <GameSection title={`Upcoming · ${preview.length}`} games={preview} showEmbeds />
          <GameSection title={`Final · ${final.length}`} games={final} />
        </div>
      )}

      <Standings />
    </div>
  )
}
