import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

function CardSkeleton() {
  return (
    <div className="card border-l-4 border-orange-500 p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-16 h-3 rounded bg-bg-elevated" />
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-bg-elevated shrink-0" />
        <div className="w-6 h-5 rounded bg-bg-elevated" />
        <div className="w-6 h-4 rounded bg-bg-elevated" />
        <div className="w-6 h-5 rounded bg-bg-elevated" />
        <div className="w-8 h-8 rounded-full bg-bg-elevated shrink-0" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3.5 w-3/4 rounded bg-bg-elevated" />
        <div className="h-3 w-full rounded bg-bg-elevated" />
        <div className="h-3 w-2/3 rounded bg-bg-elevated" />
      </div>
    </div>
  )
}

function HotGameCard({ entry, rank }) {
  const navigate = useNavigate()
  const { game, summary } = entry
  const { away, home } = game

  const rankLabel = rank === 0 ? '🔥 Hot Game' : rank === 1 ? '🌶 Also Hot' : '⚡ Worth Watching'

  return (
    <div
      className="card border-l-4 border-orange-500 p-4 cursor-pointer hover:bg-bg-elevated transition-colors group"
      onClick={() => navigate(`/game/${game.gamePk}`)}
    >
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400">{rankLabel}</span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <img
          src={`https://www.mlbstatic.com/team-logos/${away.id}.svg`}
          alt={away.abbreviation}
          className="w-8 h-8 object-contain shrink-0"
          onError={(e) => { e.target.style.display = 'none' }}
        />
        <span className="text-sm font-semibold text-content-primary">{away.abbreviation}</span>
        <span className="text-xl font-black font-mono text-content-primary">{away.score}</span>
        <span className="text-content-muted font-mono">–</span>
        <span className="text-xl font-black font-mono text-content-primary">{home.score}</span>
        <span className="text-sm font-semibold text-content-primary">{home.abbreviation}</span>
        <img
          src={`https://www.mlbstatic.com/team-logos/${home.id}.svg`}
          alt={home.abbreviation}
          className="w-8 h-8 object-contain shrink-0"
          onError={(e) => { e.target.style.display = 'none' }}
        />
        {away.wins != null && (
          <span className="hidden sm:inline text-[11px] text-content-muted font-mono ml-1">
            ({away.wins}–{away.losses}) vs ({home.wins}–{home.losses})
          </span>
        )}
      </div>

      {summary && (
        <div>
          {summary.headline && (
            <p className="text-sm font-semibold text-content-primary mb-0.5">{summary.headline}</p>
          )}
          {summary.summary && (
            <p className="text-xs text-content-secondary leading-relaxed">{summary.summary}</p>
          )}
        </div>
      )}

      <div className="mt-3 text-[10px] font-medium text-orange-400 group-hover:underline">
        View full game →
      </div>
    </div>
  )
}

export default function HotGameBanner({ date, hasFinalGames = false }) {
  const { data, isLoading } = useQuery({
    queryKey: ['hot-games', date],
    queryFn: () => api.schedule.hotGames(date),
    staleTime: 30 * 60 * 1000,
    enabled: hasFinalGames,
    retry: 1,
  })

  if (!hasFinalGames) return null
  if (isLoading) return (
    <div className="space-y-3">
      <CardSkeleton />
      <CardSkeleton />
    </div>
  )

  const hotGames = data?.hotGames
  if (!hotGames?.length) return null

  return (
    <div className="space-y-3">
      {hotGames.map((entry, i) => (
        <HotGameCard key={entry.game?.gamePk ?? i} entry={entry} rank={i} />
      ))}
    </div>
  )
}
