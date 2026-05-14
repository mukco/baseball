import { useQuery } from '@tanstack/react-query'

const POSITIVE = /\b(leads?|leading|best|elite|top|highest|above|strong|dominant|impressive|on pace|streak|most|record|career-high|career best|first|ranks? (1st|first|second|2nd)|historic|outstanding|excellent|efficient)\b/i
const NEGATIVE = /\b(worst|lowest|slump|slumping|struggling|below|poor|concerning|dropped?|fallen|last|fewest|bottom|weak|highest era|bloated|inflated|regress)\b/i

function bulletColor(text) {
  if (POSITIVE.test(text)) return 'text-green-500'
  if (NEGATIVE.test(text)) return 'text-red-400'
  return 'text-content-muted'
}

// Bolds numbers inline without splitting the text into React nodes
function FactoidText({ text }) {
  const html = text.replace(
    /(\b\d+\.?\d*%?|\.\d+\b)/g,
    '<strong>$1</strong>'
  )
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

function Skeleton() {
  return (
    <div className="space-y-1.5 animate-pulse">
      {[80, 95, 70].map((w) => (
        <div key={w} className="h-3 bg-bg-elevated rounded" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}

export default function FactoidsPanel({ queryKey, queryFn, className = '' }) {
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })

  const factoids = data?.factoids ?? []

  return (
    <div className={`card p-4 flex flex-col h-44 ${className}`} style={{ '--fade-to': 'rgb(var(--color-bg-surface))' }}>
      <div className="flex items-center gap-1.5 mb-2 shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-content-muted">Insights</span>
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-brand/10 text-brand-light uppercase tracking-wider">AI</span>
      </div>

      <div className="relative flex-1 min-h-0">
        <div className="h-full overflow-y-auto pr-1">
          {isLoading && <Skeleton />}

          {isError && (
            <p className="text-xs text-content-muted italic">Insights unavailable.</p>
          )}

          {!isLoading && !isError && factoids.length === 0 && (
            <p className="text-xs text-content-muted italic">No insights available yet.</p>
          )}

          {!isLoading && factoids.length > 0 && (
            <ul className="space-y-1.5 pb-4">
              {factoids.map((f, i) => (
                <li key={i} className="flex gap-2 text-xs text-content-secondary leading-relaxed">
                  <span className={`shrink-0 mt-0.5 font-bold ${bulletColor(f)}`}>·</span>
                  <FactoidText text={f} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Fade mask — signals scrollable content below */}
        <div
          className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none rounded-b-xl"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--fade-to))' }}
        />
      </div>
    </div>
  )
}
