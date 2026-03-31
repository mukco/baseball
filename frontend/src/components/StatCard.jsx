import clsx from 'clsx'

/**
 * Percentile → color mapping (like Baseball Savant)
 * High percentile = elite (red-orange), Low = blue
 * Some stats are "lower is better" — pass invert=true for those.
 */
function percentileColor(pct, invert = false) {
  const p = invert ? 100 - pct : pct
  if (p >= 90) return 'text-stat-elite'
  if (p >= 70) return 'text-stat-great'
  if (p >= 30) return 'text-stat-avg'
  if (p >= 10) return 'text-stat-below'
  return 'text-stat-poor'
}

function percentileBg(pct, invert = false) {
  const p = invert ? 100 - pct : pct
  if (p >= 90) return 'bg-stat-elite'
  if (p >= 70) return 'bg-stat-great'
  if (p >= 30) return 'bg-stat-avg'
  if (p >= 10) return 'bg-stat-below'
  return 'bg-stat-poor'
}

export function PercentileBar({ percentile, invert = false, className }) {
  if (percentile == null) return null
  const pct = invert ? 100 - percentile : percentile
  return (
    <div className={clsx('h-1 w-full bg-bg-border rounded-full overflow-hidden', className)}>
      <div
        className={clsx('h-full rounded-full transition-all duration-500', percentileBg(percentile, invert))}
        style={{ width: `${Math.max(2, pct)}%` }}
      />
    </div>
  )
}

/**
 * StatCard — shows a single stat value with optional percentile indicator.
 */
export function StatCard({ label, value, percentile, invert = false, subtitle, className }) {
  const hasPercentile = percentile != null
  const colorClass = hasPercentile ? percentileColor(percentile, invert) : 'text-content-primary'

  return (
    <div className={clsx('card p-4 flex flex-col gap-2', className)}>
      <span className="stat-label">{label}</span>
      <div className="flex items-end justify-between gap-2">
        <span className={clsx('text-2xl font-bold font-mono leading-none', colorClass)}>
          {value ?? '—'}
        </span>
        {hasPercentile && (
          <span className={clsx('text-xs font-medium', percentileColor(percentile, invert))}>
            {percentile}th
          </span>
        )}
      </div>
      {hasPercentile && <PercentileBar percentile={percentile} invert={invert} />}
      {subtitle && <span className="text-xs text-content-muted">{subtitle}</span>}
    </div>
  )
}

/**
 * InlineStatRow — compact horizontal stat display for tables/lists.
 */
export function InlineStatRow({ stats }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {stats.map(({ label, value }) => (
        <div key={label} className="flex flex-col">
          <span className="text-[10px] text-content-muted uppercase tracking-wider">{label}</span>
          <span className="text-sm font-semibold font-mono text-content-primary">{value ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}
