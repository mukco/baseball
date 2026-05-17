import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { api } from '../api'
import PlayerLink from '../components/PlayerLink'
import DynamicChart from '../components/charts/DynamicChart'

const CATEGORY_META = {
  game:        { label: 'Game',        color: 'text-blue-500',   bg: 'bg-blue-500/10'   },
  transaction: { label: 'Transaction', color: 'text-orange-500', bg: 'bg-orange-500/10' },
  milestone:   { label: 'Milestone',   color: 'text-amber-500',  bg: 'bg-amber-500/10'  },
  storyline:   { label: 'Storyline',   color: 'text-violet-500', bg: 'bg-violet-500/10' },
}

function CategoryBadge({ category }) {
  const meta = CATEGORY_META[category] || { label: category, color: 'text-content-muted', bg: 'bg-bg-elevated' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-widest ${meta.color} ${meta.bg}`}>
      {meta.label}
    </span>
  )
}

function PlayerChips({ players = [], names = [] }) {
  const resolved = players.filter((p) => p.id)
  const fallback = resolved.length === 0 ? names : []
  if (!resolved.length && !fallback.length) return null

  return (
    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-bg-border">
      {resolved.slice(0, 4).map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center h-6 px-2 rounded-full bg-bg-elevated border border-bg-border text-xs hover:border-brand transition-colors"
        >
          <PlayerLink playerId={p.id} name={p.name} imageClassName="w-4 h-4" textClassName="text-xs" />
        </span>
      ))}
      {fallback.slice(0, 4).map((name) => (
        <span
          key={name}
          className="inline-flex items-center h-6 px-2 rounded-full bg-bg-elevated border border-bg-border text-xs text-content-secondary"
        >
          {name}
        </span>
      ))}
    </div>
  )
}

function StoryCard({ story }) {
  return (
    <article className="card p-5 flex flex-col gap-3 h-full">
      <CategoryBadge category={story.category} />
      <h3 className="news-headline line-clamp-3">{story.headline}</h3>
      <p className="news-summary line-clamp-4 flex-1">{story.body}</p>
      <PlayerChips players={story.players} names={story.player_names} />
    </article>
  )
}

function TrendCard({ trend }) {
  const chart = trend.chart
  return (
    <article className="card p-5 flex flex-col gap-3 h-full">
      <h3 className="text-base font-bold text-content-primary leading-snug">{trend.headline}</h3>
      <p className="text-sm text-content-secondary leading-relaxed flex-1">{trend.body}</p>
      {trend.stat_hook && (
        <div className="rounded-lg bg-brand/5 border border-brand/20 px-3 py-2">
          <p className="text-xs font-semibold text-content-muted uppercase tracking-widest mb-0.5">The number</p>
          <p className="text-sm font-mono text-brand-light leading-snug">{trend.stat_hook}</p>
        </div>
      )}
      {chart?.data?.length > 0 && (
        <div className="pt-1">
          <DynamicChart
            type={chart.type}
            title={chart.title}
            data={chart.data}
            xKey={chart.xKey}
            yKey={chart.yKey}
            height={160}
          />
        </div>
      )}
      <PlayerChips players={trend.players} names={trend.player_names} />
    </article>
  )
}

function StoriesSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card p-5 animate-pulse space-y-3">
          <div className="h-4 w-20 bg-bg-elevated rounded" />
          <div className="space-y-2">
            <div className="h-5 bg-bg-elevated rounded w-full" />
            <div className="h-5 bg-bg-elevated rounded w-3/4" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 bg-bg-elevated rounded w-full" />
            <div className="h-3 bg-bg-elevated rounded w-5/6" />
            <div className="h-3 bg-bg-elevated rounded w-4/6" />
          </div>
        </div>
      ))}
    </div>
  )
}

function TrendsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="card p-5 animate-pulse space-y-3">
          <div className="space-y-2">
            <div className="h-4 bg-bg-elevated rounded w-full" />
            <div className="h-4 bg-bg-elevated rounded w-2/3" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 bg-bg-elevated rounded w-full" />
            <div className="h-3 bg-bg-elevated rounded w-5/6" />
            <div className="h-3 bg-bg-elevated rounded w-4/6" />
          </div>
          <div className="h-14 bg-bg-elevated rounded-lg" />
        </div>
      ))}
    </div>
  )
}

function GeneratedAt({ ts }) {
  if (!ts) return null
  try {
    return (
      <span className="text-xs text-content-muted">
        Generated {format(parseISO(ts), 'MMM d · h:mm a')}
      </span>
    )
  } catch {
    return null
  }
}

function SectionHeader({ label, count }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="text-xs font-semibold text-content-muted uppercase tracking-widest">{label}</h2>
      {count > 0 && (
        <span className="text-xs text-content-muted tabular-nums">{count}</span>
      )}
    </div>
  )
}

export default function DailySummary() {
  const today = format(new Date(), 'yyyy-MM-dd')

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['daily-summary', today],
    queryFn: ({ meta }) => api.digest.get(null, { refresh: meta?.refresh }),
    staleTime: 30 * 60 * 1000,
  })

  function forceRefresh() {
    refetch({ meta: { refresh: true } })
  }

  const stories = data?.stories ?? []
  const trends  = data?.trends  ?? []

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Daily Digest</h1>
          <p className="text-sm text-content-muted mt-0.5">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <GeneratedAt ts={data?.generated_at} />
          <button
            onClick={forceRefresh}
            disabled={isFetching}
            className="btn-ghost flex items-center gap-1.5 text-xs"
          >
            <svg
              className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card p-8 text-center text-content-muted text-sm">
          Failed to load digest: {error.message}
        </div>
      )}

      {/* Stories */}
      <section className="space-y-4">
        <SectionHeader label="Today's Stories" count={stories.length} />
        {isLoading ? (
          <StoriesSkeleton />
        ) : stories.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {stories.map((s, i) => (
              <StoryCard key={i} story={s} />
            ))}
          </div>
        ) : !error ? (
          <div className="card p-8 text-center text-content-muted text-sm">No stories available yet.</div>
        ) : null}
      </section>

      {/* Trends */}
      <section className="space-y-4">
        <SectionHeader label="Statistical Trends" count={trends.length} />
        {isLoading ? (
          <TrendsSkeleton />
        ) : trends.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {trends.map((t, i) => (
              <TrendCard key={i} trend={t} />
            ))}
          </div>
        ) : !error ? (
          <div className="card p-8 text-center text-content-muted text-sm">No trends available yet.</div>
        ) : null}
      </section>
    </div>
  )
}
