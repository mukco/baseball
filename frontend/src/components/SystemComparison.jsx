import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import ProjectionAccuracyChart from './charts/ProjectionAccuracyChart'

const CURRENT_SEASON = new Date().getFullYear()

// Stats to compare across all three systems (overlapping keys only)
// rate: true  → current value IS the pace (no proration)
// rate: false → counting stat, prorate to projected PA/IP
const BATTER_COMPARE_COLS = [
  { label: 'AVG',  ourKey: 'avg',   theirKey: 'avg',              mlbKey: 'avg',              rate: true,  fmt: (v) => v?.toFixed(3) ?? '—' },
  { label: 'OBP',  ourKey: 'obp',   theirKey: 'obp',              mlbKey: 'obp',              rate: true,  fmt: (v) => v?.toFixed(3) ?? '—' },
  { label: 'SLG',  ourKey: 'slg',   theirKey: 'slg',              mlbKey: 'slg',              rate: true,  fmt: (v) => v?.toFixed(3) ?? '—' },
  { label: 'OPS',  ourKey: 'ops',   theirKey: 'ops',              mlbKey: 'ops',              rate: true,  fmt: (v) => v?.toFixed(3) ?? '—' },
  { label: 'HR',   ourKey: 'hr',    theirKey: 'homeRuns',         mlbKey: 'homeRuns',         rate: false, fmt: (v) => v ?? '—' },
  { label: 'RBI',  ourKey: 'rbi',   theirKey: 'rbi',              mlbKey: 'rbi',              rate: false, fmt: (v) => v ?? '—' },
  { label: 'PA',   ourKey: 'pa',    theirKey: 'plateAppearances', mlbKey: 'plateAppearances', rate: true,  fmt: (v) => v ?? '—' },
]

const PITCHER_COMPARE_COLS = [
  { label: 'ERA',  ourKey: 'era',  theirKey: 'era',            mlbKey: 'era',            rate: true,  fmt: (v) => v?.toFixed(2) ?? '—' },
  { label: 'WHIP', ourKey: 'whip', theirKey: 'whip',           mlbKey: 'whip',           rate: true,  fmt: (v) => v?.toFixed(2) ?? '—' },
  { label: 'IP',   ourKey: 'ip',   theirKey: 'inningsPitched', mlbKey: 'inningsPitched', rate: true,  fmt: (v) => v != null ? Number(v).toFixed(0) : '—' },
  { label: 'K',    ourKey: 'ks',   theirKey: 'strikeOuts',     mlbKey: 'strikeOuts',     rate: false, fmt: (v) => v ?? '—' },
  { label: 'BB',   ourKey: 'bbs',  theirKey: 'baseOnBalls',    mlbKey: 'baseOnBalls',    rate: false, fmt: (v) => v ?? '—' },
]

function parseIp(str) {
  if (str == null) return 0
  const parts = String(str).split('.')
  return parseInt(parts[0]) + (parseInt(parts[1]) || 0) / 3
}

function buildPace(seasonData, group, ourStats) {
  const raw = group === 'pitching' ? seasonData?.pitching : seasonData?.hitting
  if (!raw) return null

  if (group === 'pitching') {
    const ip    = parseIp(raw.inningsPitched)
    const projIp = Number(ourStats?.ip) || 0
    const mult  = ip > 5 && projIp > 0 ? projIp / ip : null
    return {
      era:  raw.era  != null ? parseFloat(raw.era)  : null,
      whip: raw.whip != null ? parseFloat(raw.whip) : null,
      ip:   ip,
      ks:   mult != null ? Math.round(parseInt(raw.strikeOuts || 0) * mult) : null,
      bbs:  mult != null ? Math.round(parseInt(raw.baseOnBalls || 0) * mult) : null,
    }
  } else {
    const pa     = parseInt(raw.plateAppearances || 0)
    const projPa = Number(ourStats?.pa) || 0
    const mult   = pa > 20 && projPa > 0 ? projPa / pa : null
    return {
      avg: raw.avg != null ? parseFloat(raw.avg) : null,
      obp: raw.obp != null ? parseFloat(raw.obp) : null,
      slg: raw.slg != null ? parseFloat(raw.slg) : null,
      ops: raw.ops != null ? parseFloat(raw.ops) : null,
      hr:  mult != null ? Math.round(parseInt(raw.homeRuns || 0) * mult) : null,
      rbi: mult != null ? Math.round(parseInt(raw.rbi || 0)       * mult) : null,
      pa,
    }
  }
}

// Our exclusive stats — shown separately since Steamer/ZiPS don't have them
const BATTER_EXCLUSIVE = [
  { label: 'wRC+', key: 'wrc_plus', fmt: (v) => v?.toFixed(0)                      },
  { label: 'wOBA', key: 'woba',     fmt: (v) => v?.toFixed(3)                      },
  { label: 'K%',   key: 'k_pct',   fmt: (v) => v ? `${(v * 100).toFixed(1)}%` : null },
  { label: 'BB%',  key: 'bb_pct',  fmt: (v) => v ? `${(v * 100).toFixed(1)}%` : null },
  { label: 'BABIP',key: 'babip',   fmt: (v) => v?.toFixed(3)                      },
  { label: 'ISO',  key: 'iso',     fmt: (v) => v?.toFixed(3)                      },
]

const PITCHER_EXCLUSIVE = [
  { label: 'FIP',  key: 'fip',    fmt: (v) => v?.toFixed(2) },
  { label: 'xFIP', key: 'xfip',   fmt: (v) => v?.toFixed(2) },
  { label: 'K%',   key: 'k_pct',  fmt: (v) => v ? `${(v * 100).toFixed(1)}%` : null },
  { label: 'BB%',  key: 'bb_pct', fmt: (v) => v ? `${(v * 100).toFixed(1)}%` : null },
]

function DeltaBadge({ ours, theirs, lower_is_better = false }) {
  if (ours == null || theirs == null || typeof ours !== 'number' || typeof theirs !== 'number') return null
  const diff = ours - theirs
  if (Math.abs(diff) < 0.001) return null
  const better = lower_is_better ? diff < 0 : diff > 0
  const sign = diff > 0 ? '+' : ''
  const abs = Math.abs(diff)
  const display = abs < 0.01 ? `${sign}${diff.toFixed(3)}` : abs < 1 ? `${sign}${diff.toFixed(2)}` : `${sign}${Math.round(diff)}`
  return (
    <span
      className="ml-1 text-[10px] font-mono font-semibold"
      style={{ color: better ? 'var(--color-stat-great)' : 'var(--color-stat-below)' }}
    >
      {display}
    </span>
  )
}

function CompareTable({ cols, ourStats, steamer, zips, pace, lowerIsBetter = [] }) {
  const hasPace = pace != null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bg-border">
            <th className="pb-2 text-left text-[11px] font-semibold text-content-muted uppercase tracking-wide w-16">Stat</th>
            <th className="pb-2 text-right text-[11px] font-semibold text-brand uppercase tracking-wide">Ours</th>
            <th className="pb-2 text-right text-[11px] font-semibold text-content-muted uppercase tracking-wide">Steamer</th>
            <th className="pb-2 text-right text-[11px] font-semibold text-content-muted uppercase tracking-wide">ZiPS</th>
            {hasPace && (
              <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-stat-great)' }}>
                Pace
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {cols.map(({ label, ourKey, theirKey, fmt }) => {
            const ourVal   = ourStats?.[ourKey]
            const stVal    = steamer?.projections?.[theirKey]
            const zpVal    = zips?.projections?.[theirKey]
            const paceVal  = pace?.[ourKey]
            const lib      = lowerIsBetter.includes(ourKey)
            return (
              <tr key={label} className="border-b border-bg-border/50 last:border-0">
                <td className="py-2 text-xs font-semibold text-content-muted uppercase tracking-wide">{label}</td>
                <td className="py-2 text-right font-mono font-semibold text-content-primary">
                  {fmt(ourVal)}
                </td>
                <td className="py-2 text-right font-mono text-content-secondary">
                  {stVal != null ? fmt(stVal) : <span className="text-content-muted">—</span>}
                  {stVal != null && <DeltaBadge ours={ourVal} theirs={stVal} lower_is_better={lib} />}
                </td>
                <td className="py-2 text-right font-mono text-content-secondary">
                  {zpVal != null ? fmt(zpVal) : <span className="text-content-muted">—</span>}
                  {zpVal != null && <DeltaBadge ours={ourVal} theirs={zpVal} lower_is_better={lib} />}
                </td>
                {hasPace && (
                  <td className="py-2 text-right font-mono font-medium" style={{ color: paceVal != null ? 'var(--color-stat-great)' : undefined }}>
                    {paceVal != null ? fmt(paceVal) : <span className="text-content-muted">—</span>}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {hasPace && (
        <p className="text-[10px] text-content-muted mt-1.5">
          Pace: rate stats are current season values; HR/RBI/K/BB extrapolated to projected PA/IP.
        </p>
      )}
    </div>
  )
}

export default function SystemComparison({ playerId, playerType, ourStats }) {
  const group = playerType === 'pitcher' ? 'pitching' : 'hitting'
  const [showAccuracy, setShowAccuracy] = useState(false)

  const { data: steamer, isLoading: loadingSt } = useQuery({
    queryKey: ['comparison-steamer', playerId, CURRENT_SEASON, group],
    queryFn: () => api.stats.projections(playerId, CURRENT_SEASON, group, 'steamer'),
    staleTime: 30 * 60_000,
    retry: false,
  })

  const { data: zips, isLoading: loadingZp } = useQuery({
    queryKey: ['comparison-zips', playerId, CURRENT_SEASON, group],
    queryFn: () => api.stats.projections(playerId, CURRENT_SEASON, group, 'zips'),
    staleTime: 30 * 60_000,
    retry: false,
  })

  const { data: seasonData } = useQuery({
    queryKey: ['season-stats', playerId, CURRENT_SEASON],
    queryFn: () => api.stats.season(playerId, CURRENT_SEASON),
    staleTime: 5 * 60_000,
    retry: false,
  })

  const { data: accuracy, isLoading: loadingAcc } = useQuery({
    queryKey: ['league-accuracy', playerType],
    queryFn: () => api.projections.leagueAccuracy(playerType),
    staleTime: 60 * 60_000,
    retry: false,
    enabled: showAccuracy,
  })

  const loading = loadingSt || loadingZp
  const cols    = playerType === 'pitcher' ? PITCHER_COMPARE_COLS : BATTER_COMPARE_COLS
  const excl    = playerType === 'pitcher' ? PITCHER_EXCLUSIVE    : BATTER_EXCLUSIVE
  const lib     = playerType === 'pitcher' ? ['era', 'whip', 'bbs', 'bb9'] : []
  const pace    = buildPace(seasonData, group, ourStats)

  const hasAny = steamer?.projections || zips?.projections

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold text-content-muted uppercase tracking-wide">System Comparison</h4>
        {loading && (
          <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {!loading && !hasAny && (
        <p className="text-xs text-content-muted italic">
          No Steamer/ZiPS data available for this player from the MLB Stats API.
        </p>
      )}

      {hasAny && (
        <>
          <CompareTable
            cols={cols}
            ourStats={ourStats}
            steamer={steamer}
            zips={zips}
            pace={pace}
            lowerIsBetter={lib}
          />

          {/* Our exclusive stats */}
          <div className="pt-2 border-t border-bg-border">
            <p className="text-[10px] text-content-muted uppercase tracking-wide font-semibold mb-2">
              Our model only (Steamer/ZiPS don't publish these)
            </p>
            <div className="flex flex-wrap gap-3">
              {excl.map(({ label, key, fmt }) => {
                const val = fmt(ourStats?.[key])
                if (!val) return null
                return (
                  <div key={key} className="text-center">
                    <div className="text-[10px] text-content-muted uppercase tracking-wide">{label}</div>
                    <div className="font-mono text-sm font-semibold text-brand mt-0.5">{val}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="pt-1">
            <p className="text-[11px] text-content-muted leading-relaxed">
              <span className="font-semibold text-content-secondary">How to read the deltas:</span>{' '}
              Numbers in <span style={{ color: 'var(--color-stat-great)' }}>green</span> mean our model projects higher performance than that system
              (better for rate stats like AVG, worse for ERA — context matters).{' '}
              <span style={{ color: 'var(--color-stat-below)' }}>Orange</span> means we project lower.
              Large disagreements usually trace back to regression assumptions or Statcast weighting — tune those levers
              in <a href="/projections/scenarios" className="underline">Scenarios</a> to see them shift.
            </p>
          </div>

          {/* Historical accuracy — opt-in */}
          <div className="pt-3 border-t border-bg-border">
            {!showAccuracy ? (
              <button
                onClick={() => setShowAccuracy(true)}
                className="text-xs text-brand hover:text-brand-light underline underline-offset-2 transition-colors"
              >
                Show historical accuracy →
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-content-muted uppercase tracking-wide">
                    Historical Accuracy
                  </span>
                  {accuracy?.seasons_range && (
                    <span className="text-[10px] text-content-muted">
                      {accuracy.seasons_range[0]}–{accuracy.seasons_range.at(-1)}
                    </span>
                  )}
                  {loadingAcc && (
                    <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                {accuracy && !accuracy.error && (
                  accuracy.sample_size === 0
                    ? <p className="text-xs text-content-muted italic">Run projections for some players first to see accuracy data.</p>
                    : <ProjectionAccuracyChart
                        aggregate={accuracy.aggregate}
                        playerType={playerType}
                        sampleSize={accuracy.sample_size}
                      />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
