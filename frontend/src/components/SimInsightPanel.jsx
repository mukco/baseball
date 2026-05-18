import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

export default function SimInsightPanel({
  queryKey,
  queryFn,
  regenerateFn,
  sections,
  title = 'AI Insights',
  bulletsLayout = 'stack',
}) {
  const [isRegenerating, setIsRegenerating] = useState(false)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey,
    queryFn,
    staleTime: Infinity,
    retry: false,
  })

  async function handleRegenerate() {
    if (regenerateFn) {
      setIsRegenerating(true)
      try { await regenerateFn() } finally { setIsRegenerating(false) }
    } else {
      refetch()
    }
  }

  const busy = isFetching || isRegenerating

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-content-muted">{title}</h2>
        <div className="flex items-center gap-2">
          {data?.cached && <span className="text-[10px] text-content-muted">Cached</span>}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={busy}
            className="text-[11px] text-brand-light hover:underline disabled:opacity-40"
          >
            {busy ? 'Generating…' : 'Regenerate'}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-content-muted text-xs py-2">
          <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
          Generating insights…
        </div>
      )}

      {data?.error && <p className="text-xs text-red-400">{data.error}</p>}

      {data?.narrative && (
        <p className="text-sm text-content-secondary leading-relaxed">{data.narrative}</p>
      )}

      {data?.bullets && sections && (
        <div className={bulletsLayout === 'grid' ? 'grid grid-cols-1 md:grid-cols-3 gap-4 pt-1' : 'space-y-2 pt-1'}>
          {Object.entries(sections).map(([key, label]) => {
            const lines = data.bullets[key] || []
            if (!lines.length) return null
            return (
              <div key={key}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-1">{label}</p>
                <ul className="space-y-0.5">
                  {lines.map((line, i) => (
                    <li key={i} className="text-xs text-content-secondary flex gap-1.5">
                      <span className="text-brand shrink-0 mt-0.5">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
