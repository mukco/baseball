import clsx from 'clsx'
import StatHelpTooltip from './StatHelpTooltip'

/**
 * Map a 0–100 percentile to a CSS color (the stat ramp tokens).
 */
function getPercentileColor(pct) {
  if (pct == null) return null
  if (pct >= 85) return 'var(--color-stat-elite)'
  if (pct >= 65) return 'var(--color-stat-great)'
  if (pct >= 40) return 'var(--color-stat-avg)'
  if (pct >= 20) return 'var(--color-stat-below)'
  return 'var(--color-stat-poor)'
}

export function PercentileBar({ percentile, className }) {
  if (percentile == null) return null
  const color = getPercentileColor(percentile)
  return (
    <div className={clsx('h-1.5 w-full bg-bg-elevated rounded-full overflow-hidden', className)}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(2, percentile)}%`, background: color }}
      />
    </div>
  )
}

/**
 * StatCard — single stat value with optional percentile pill, percentile bar,
 * and either pace-against-projection bar or comparison strip.
 */
export function StatCard({ label, statKey, value, percentile, subtitle, className, comparison, progress, invert = false }) {
  const displayValue = value ?? '—'
  const displayPct = invert && percentile != null ? 100 - percentile : percentile
  const pctColor = getPercentileColor(displayPct)
  const showPercentile = displayPct != null && pctColor != null
  const progressPct = progress && Number(progress.target) > 0
    ? Math.max(0, Math.min(100, (Number(progress.current) / Number(progress.target)) * 100))
    : null

  return (
    <div className={clsx('card p-5 flex flex-col gap-2 min-w-0', className)}>
      {/* Header row: label (with optional help tooltip) + percentile pill */}
      <div className="flex items-start justify-between gap-1">
        <span className="flex items-center gap-1 min-w-0 leading-none">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted">
            {label}
          </span>
          <StatHelpTooltip stat={statKey || label} />
        </span>
        {showPercentile && (
          <span
            className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 leading-none shrink-0"
            style={{
              color: pctColor,
              background: `color-mix(in oklch, ${pctColor} 14%, transparent)`,
            }}
            title="Approximate MLB percentile"
          >
            {displayPct}%
          </span>
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-[28px] font-bold tracking-tight text-content-primary leading-none truncate">
          {displayValue}
        </span>
        {subtitle && (
          <span className="text-[11px] text-content-muted shrink-0">{subtitle}</span>
        )}
      </div>

      {/* Percentile bar */}
      {showPercentile && (
        <div className="h-1.5 rounded-full bg-bg-elevated overflow-hidden mt-0.5">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(2, displayPct)}%`, background: pctColor }}
          />
        </div>
      )}

      {/* Pace toward projection total */}
      {progressPct != null && (
        <div className="mt-auto pt-2 border-t border-bg-border">
          <div className="flex justify-between text-[11px] text-content-muted mb-1">
            <span>Season pace</span>
            <span className="font-mono">{progress.current} / {progress.target}</span>
          </div>
          <div className="h-1.5 rounded-full bg-bg-elevated overflow-hidden">
            <div
              className="h-full rounded-full bg-brand/60 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Comparison vs projection */}
      {comparison && (
        <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-bg-border mt-auto">
          <span className="text-content-muted">{comparison.projectedLabel}</span>
          <span className={clsx('font-semibold', comparison.color)}>{comparison.status}</span>
        </div>
      )}
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
