import { useQuery } from '@tanstack/react-query'
import AutoLinkedText from './AutoLinkedText'

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[80, 95, 70].map((w) => (
        <div key={w} className="h-3 bg-bg-elevated rounded" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}

export default function FactoidsPanel({
  queryKey,
  queryFn,
  className = '',
  scrollable = true,
  title = 'Insights',
  badge = 'AI',
  description = '',
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })

  const factoids = data?.factoids ?? []

  const content = (
    <>
      {isLoading && <Skeleton />}
      {isError && <p className="text-xs text-content-muted italic">Insights unavailable.</p>}
      {!isLoading && !isError && factoids.length === 0 && (
        <p className="text-xs text-content-muted italic">No insights available yet.</p>
      )}
      {!isLoading && factoids.length > 0 && (
        <ul className={scrollable ? 'pb-2' : ''}>
          {factoids.map((f, i) => (
            <li key={i} className="flex gap-3 items-start py-2 border-b border-bg-border last:border-0">
              <div className="w-5 h-5 rounded-md bg-brand/10 text-brand text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </div>
              <p className="text-[13px] text-content-secondary leading-snug">
                <AutoLinkedText text={f} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  )

  return (
    <div
      className={`card p-4 flex flex-col ${scrollable ? 'h-64' : ''} ${className}`}
      style={scrollable ? { '--fade-to': 'rgb(var(--color-bg-surface))' } : undefined}
    >
      <div className="mb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted">{title}</span>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-brand/10 text-brand uppercase tracking-wider">{badge}</span>
        </div>
        {description && <p className="text-xs text-content-muted mt-1">{description}</p>}
      </div>

      {scrollable ? (
        <div className="relative flex-1 min-h-0">
          <div className="h-full overflow-y-auto pr-1">{content}</div>
          <div
            className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none rounded-b-xl"
            style={{ background: 'linear-gradient(to bottom, transparent, var(--fade-to))' }}
          />
        </div>
      ) : (
        <div>{content}</div>
      )}
    </div>
  )
}
