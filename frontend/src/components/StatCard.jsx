import clsx from 'clsx'
import StatHelpTooltip from './StatHelpTooltip'

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
export function StatCard({ label, statKey, value, percentile, invert = false, subtitle, className, comparison, progress }) {
  const hasPercentile = percentile != null
  const showPercentile = hasPercentile && !comparison && !progress
  const colorClass = showPercentile ? percentileColor(percentile, invert) : 'text-content-primary'
  const progressPct = progress && Number(progress.target) > 0
    ? Math.max(0, Math.min(100, (Number(progress.current) / Number(progress.target)) * 100))
    : null

  return (
    <div className={clsx('card p-4 flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="stat-label">{label}</span>
          <StatHelpTooltip stat={statKey || label} />
        </span>
        {comparison && (
          <span className="flex items-center gap-1" title={comparison.status}>
            <span className="text-[10px] text-content-muted font-medium">{comparison.projectedLabel}</span>
            <span className={clsx('text-[10px] font-semibold', comparison.color)}>{comparison.status}</span>
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className={clsx('text-2xl font-bold font-mono leading-none', colorClass)}>
          {value ?? '—'}
        </span>
        {showPercentile && (
          <span className={clsx('text-xs font-medium', percentileColor(percentile, invert))} title="Approximate MLB percentile">
            {percentile}th
          </span>
        )}
      </div>
      {showPercentile && <PercentileBar percentile={percentile} invert={invert} />}
      {progressPct != null && (
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-bg-border rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="flex items-center gap-3 text-[10px] text-content-muted">
            <span className="inline-flex items-center gap-1" title="Current value">
              <span className="text-brand">◉</span>
              <span>{progress.current}</span>
            </span>
            <span className="inline-flex items-center gap-1" title="Projected target">
              <span>◎</span>
              <span>{progress.target}</span>
            </span>
          </div>
        </div>
      )}
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
