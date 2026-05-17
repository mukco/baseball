import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

export default function MlbWatchFrame({ gamePk }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['mlb-watch', gamePk],
    queryFn: () => api.mlb.watch(gamePk),
    enabled: Boolean(gamePk),
    staleTime: 30_000,
  })

  if (isLoading) {
    return <div className="card p-4 text-sm text-content-muted">Loading MLB.TV availability...</div>
  }

  if (error) {
    return <div className="card p-4 text-sm text-content-muted">Unable to load MLB.TV details: {error.message}</div>
  }

  if (!data?.hasVideo || data?.unavailableReason) {
    return (
      <div className="card p-4 space-y-2">
        <div className="text-sm font-medium text-content-primary">MLB.TV unavailable</div>
        <div className="text-sm text-content-muted">{data?.unavailableReason || 'No stream is listed for this matchup yet.'}</div>
        {data?.defaultFeedLabel && (
          <div className="text-xs text-content-muted uppercase tracking-[0.12em]">Preferred feed: {data.defaultFeedLabel}</div>
        )}
      </div>
    )
  }

  return (
    <section className="card p-4 flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-content-secondary">MLB.TV</div>
        <div className="text-sm text-content-muted">{data.defaultFeedLabel || 'Game stream'}</div>
      </div>
      <a
        href={data.watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary shrink-0"
      >
        Watch
      </a>
    </section>
  )
}
