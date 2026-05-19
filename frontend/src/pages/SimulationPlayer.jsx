import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import SimInsightPanel from '../components/SimInsightPanel'
import { TeamLogo, SimPlayerAvatar, SimBadge, SimSpinner } from '../components/sim/SimUI'
import { StatCard } from '../components/StatCard'
import PercentileGauge from '../components/charts/PercentileGauge'
import RollingAverageChart from '../components/charts/RollingAverageChart'
import SparklineChart from '../components/charts/SparklineChart'
import { approxPercentile } from '../lib/perfUtil'
import RatingDots from '../components/RatingDots'

// ─── Percentile thresholds (MLB 2024 averages) ───────────────────────────────

const BATTING_THRESHOLDS = {
  avg:         { p10: 0.218, p25: 0.238, p50: 0.258, p75: 0.280, p90: 0.305 },
  obp:         { p10: 0.288, p25: 0.308, p50: 0.328, p75: 0.355, p90: 0.385 },
  slg:         { p10: 0.345, p25: 0.378, p50: 0.420, p75: 0.465, p90: 0.520 },
  ops:         { p10: 0.635, p25: 0.688, p50: 0.745, p75: 0.820, p90: 0.900 },
  hr:          { p10: 2,   p25: 6,   p50: 12,  p75: 22,  p90: 35 },
  rbi:         { p10: 15,  p25: 28,  p50: 45,  p75: 62,  p90: 85 },
  kPct:        { p10: 13,  p25: 17,  p50: 22,  p75: 27,  p90: 32, invert: true },
  bbPct:       { p10: 5,   p25: 7,   p50: 9,   p75: 11,  p90: 14 },
  iso:         { p10: 0.095, p25: 0.130, p50: 0.165, p75: 0.210, p90: 0.250 },
  babip:       { p10: 0.255, p25: 0.273, p50: 0.295, p75: 0.318, p90: 0.340 },
  kBbPct:      { p10: 3,   p25: 8,   p50: 13,  p75: 19,  p90: 26, invert: true },
  pullPct:     { p10: 32,  p25: 36,  p50: 40,  p75: 44,  p90: 50 },
  centPct:     { p10: 26,  p25: 30,  p50: 33,  p75: 37,  p90: 41 },
  oppoPct:     { p10: 18,  p25: 22,  p50: 27,  p75: 32,  p90: 37 },
}

const PITCHING_THRESHOLDS = {
  era:         { p10: 5.20, p25: 4.50, p50: 3.80, p75: 3.10, p90: 2.40, invert: true },
  fip:         { p10: 5.00, p25: 4.20, p50: 3.60, p75: 3.00, p90: 2.40, invert: true },
  whip:        { p10: 1.45, p25: 1.32, p50: 1.20, p75: 1.08, p90: 0.95, invert: true },
  k:           { p10: 20,  p25: 40,  p50: 70,  p75: 110, p90: 160 },
  w:           { p10: 2,   p25: 5,   p50: 9,   p75: 13,  p90: 17 },
  k9:          { p10: 6.0, p25: 7.0, p50: 8.5, p75: 10.0, p90: 12.0 },
  bb9:         { p10: 4.5, p25: 3.5, p50: 2.8, p75: 2.2,  p90: 1.5,  invert: true },
  kPct:        { p10: 14,  p25: 18,  p50: 22,  p75: 27,  p90: 32 },
  bbPct:       { p10: 11,  p25: 9,   p50: 7.5, p75: 6.0,  p90: 4.5,  invert: true },
  kBbPct:      { p10: 4,   p25: 9,   p50: 14,  p75: 19,  p90: 24 },
  h9:          { p10: 10.5, p25: 9.2, p50: 8.3, p75: 7.4, p90: 6.5, invert: true },
  hr9:         { p10: 1.8, p25: 1.4, p50: 1.1, p75: 0.8, p90: 0.5, invert: true },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v, d = 3) => v != null ? Number(v).toFixed(d) : null
const fmt2 = v => fmt(v, 2)
const fmtPct = v => v != null ? `${Number(v).toFixed(1)}%` : null

function ordinal(n) {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ─── Award badges ─────────────────────────────────────────────────────────────

const AL_NL_AWARD_KEYS = ['mvp', 'cy_young', 'batting_title', 'hr_leader', 'rbi_leader', 'era_title', 'reliever']
const OVERALL_AWARD_KEYS = ['k_leader', 'saves_leader']

const AWARD_CONFIG = {
  'mvp.al':            { label: 'AL MVP',         color: 'amber' },
  'mvp.nl':            { label: 'NL MVP',         color: 'amber' },
  'cy_young.al':       { label: 'AL Cy Young',    color: 'sky'   },
  'cy_young.nl':       { label: 'NL Cy Young',    color: 'sky'   },
  'batting_title.al':  { label: 'AL Batting Champ', color: 'green' },
  'batting_title.nl':  { label: 'NL Batting Champ', color: 'green' },
  'hr_leader.al':      { label: 'AL HR Leader',   color: 'orange' },
  'hr_leader.nl':      { label: 'NL HR Leader',   color: 'orange' },
  'rbi_leader.al':     { label: 'AL RBI Leader',  color: 'orange' },
  'rbi_leader.nl':     { label: 'NL RBI Leader',  color: 'orange' },
  'era_title.al':      { label: 'AL ERA Title',   color: 'sky'   },
  'era_title.nl':      { label: 'NL ERA Title',   color: 'sky'   },
  'reliever.al':       { label: 'AL Reliever',    color: 'sky'   },
  'reliever.nl':       { label: 'NL Reliever',    color: 'sky'   },
  'k_leader.overall':  { label: 'K Leader',       color: 'purple' },
  'saves_leader.overall': { label: 'Saves Leader', color: 'purple' },
  'ws_mvp':            { label: 'WS MVP',         color: 'amber' },
  'alcs_mvp':          { label: 'ALCS MVP',       color: 'sky'   },
  'nlcs_mvp':          { label: 'NLCS MVP',       color: 'sky'   },
}

const BADGE_COLORS = {
  amber:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  sky:    'bg-sky-500/15 text-sky-400 border-sky-500/30',
  orange: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  green:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
}

function AwardBadge({ label, color }) {
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${BADGE_COLORS[color] || BADGE_COLORS.amber}`}>
      {label}
    </span>
  )
}

function extractPlayerAwards(awardsData, playoffAwardsData, playerId) {
  const pid = parseInt(playerId)
  const won = []

  if (awardsData?.awards) {
    const a = awardsData.awards
    AL_NL_AWARD_KEYS.forEach(key => {
      if (!a[key]) return
      ;['al', 'nl'].forEach(league => {
        if (a[key][league]?.winner?.player_id === pid) {
          const cfg = AWARD_CONFIG[`${key}.${league}`]
          if (cfg) won.push(cfg)
        }
      })
    })
    OVERALL_AWARD_KEYS.forEach(key => {
      if (a[key]?.overall?.winner?.player_id === pid) {
        const cfg = AWARD_CONFIG[`${key}.overall`]
        if (cfg) won.push(cfg)
      }
    })
  }

  if (playoffAwardsData?.awards) {
    const pa = playoffAwardsData.awards
    ;['ws_mvp', 'alcs_mvp', 'nlcs_mvp'].forEach(key => {
      if (pa[key]?.winner?.player_id === pid) {
        const cfg = AWARD_CONFIG[key]
        if (cfg) won.push(cfg)
      }
    })
  }

  return won
}

// ─── League Rankings panel ────────────────────────────────────────────────────

const BATTER_RANK_STATS  = ['hr','avg','rbi','ops','obp','slg']
const PITCHER_RANK_STATS = ['era','k','w','whip']

function LeagueRankings({ leagueId, playerId, isBatter }) {
  const { data } = useQuery({
    queryKey:  ['sim-stats', leagueId],
    queryFn:   () => api.simulations.stats(leagueId),
    staleTime: 60_000,
  })

  const rankings = useMemo(() => {
    if (!data) return []
    const pidInt = parseInt(playerId)
    const leadersKey = isBatter ? 'batting_leaders' : 'pitching_leaders'
    const leaders = data[leadersKey] || {}
    const statKeys = isBatter ? BATTER_RANK_STATS : PITCHER_RANK_STATS

    return statKeys.flatMap(stat => {
      const arr = leaders[stat] || []
      const idx = arr.findIndex(p => p.player_id === pidInt)
      if (idx < 0) return []
      return [{ stat, rank: idx + 1, total: arr.length }]
    })
  }, [data, playerId, isBatter])

  if (!rankings.length) return null

  const STAT_LABELS = {
    hr: 'HR', avg: 'AVG', rbi: 'RBI', ops: 'OPS', obp: 'OBP', slg: 'SLG',
    era: 'ERA', k: 'K', w: 'W', whip: 'WHIP',
  }
  const isGoodLow = new Set(['era', 'whip'])

  return (
    <section>
      <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">League Rankings</h3>
      <div className="flex flex-wrap gap-2">
        {rankings.map(({ stat, rank }) => {
          const isTop3 = rank <= 3
          const color = isGoodLow.has(stat) ? null : null
          return (
            <div
              key={stat}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                rank === 1
                  ? 'border-amber-500/40 bg-amber-500/10'
                  : rank <= 3
                  ? 'border-brand/40 bg-brand/10'
                  : 'border-bg-border bg-bg-elevated'
              }`}
            >
              <span className={`text-xs font-bold uppercase tracking-wide ${
                rank === 1 ? 'text-amber-400' : rank <= 3 ? 'text-brand' : 'text-content-muted'
              }`}>
                {STAT_LABELS[stat]}
              </span>
              <span className={`text-sm font-black font-mono ${
                rank === 1 ? 'text-amber-400' : rank <= 3 ? 'text-brand' : 'text-content-primary'
              }`}>
                {ordinal(rank)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Batter stats section ─────────────────────────────────────────────────────

function BatterStats({ sl, games, leagueId, playerId }) {
  const ab    = sl.ab  || 0
  const h     = sl.h   || 0
  const hr    = sl.hr  || 0
  const k     = sl.k   || 0
  const bb    = sl.bb  || 0
  const hbp   = sl.hbp || 0
  const sf    = sl.sf  || 0
  const pa    = ab + bb + hbp + sf

  const kPct   = pa > 0 ? (k  / pa * 100) : null
  const bbPct  = pa > 0 ? (bb / pa * 100) : null
  const kBbPct = kPct != null && bbPct != null ? kPct - bbPct : null
  const babipDenom = ab - k - hr
  const babip = babipDenom > 0 ? (h - hr) / babipDenom : null

  const gamesChronological = useMemo(() => [...games].reverse().map(g => {
    const gab = Number(g.ab) || 0
    const gh  = Number(g.h)  || 0
    const ghr = Number(g.hr) || 0
    const gk  = Number(g.k)  || 0
    const gbb = Number(g.bb) || 0
    const g2b = Number(g.double) || 0
    const g3b = Number(g.triple) || 0
    const tb  = gh + g2b + 2 * g3b + 3 * ghr
    const obp = (gab + gbb) > 0 ? (gh + gbb) / (gab + gbb) : 0
    const slg = gab > 0 ? tb / gab : 0
    const ops = obp + slg
    const babipD = gab - gk - ghr
    const babip  = babipD > 0 ? (gh - ghr) / babipD : null
    return { ...g, ops, avg: gab > 0 ? gh / gab : 0, slg, babip }
  }), [games])

  const gaugeStats = [
    { label: 'AVG',   value: fmt(sl.avg), percentile: approxPercentile(sl.avg, BATTING_THRESHOLDS.avg) },
    { label: 'OBP',   value: fmt(sl.obp), percentile: approxPercentile(sl.obp, BATTING_THRESHOLDS.obp) },
    { label: 'SLG',   value: fmt(sl.slg), percentile: approxPercentile(sl.slg, BATTING_THRESHOLDS.slg) },
    { label: 'OPS',   value: fmt(sl.ops), percentile: approxPercentile(sl.ops, BATTING_THRESHOLDS.ops) },
    { label: 'ISO',   value: fmt(sl.iso), percentile: approxPercentile(sl.iso, BATTING_THRESHOLDS.iso) },
  ]

  return (
    <div className="space-y-6">
      {/* Slash line */}
      <section>
        <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">Traditional</h3>
        <div className="space-y-4">
          <div>
            <p className="text-[10px] text-content-muted/60 uppercase tracking-wider mb-2">Slash line</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard label="AVG"   value={fmt(sl.avg)}  percentile={approxPercentile(sl.avg,  BATTING_THRESHOLDS.avg)} />
              <StatCard label="OBP"   value={fmt(sl.obp)}  percentile={approxPercentile(sl.obp,  BATTING_THRESHOLDS.obp)} />
              <StatCard label="SLG"   value={fmt(sl.slg)}  percentile={approxPercentile(sl.slg,  BATTING_THRESHOLDS.slg)} />
              <StatCard label="OPS"   value={fmt(sl.ops)}  percentile={approxPercentile(sl.ops,  BATTING_THRESHOLDS.ops)} />
              <StatCard label="ISO"   value={fmt(sl.iso)}  percentile={approxPercentile(sl.iso,  BATTING_THRESHOLDS.iso)} />
              <StatCard label="BABIP" value={babip != null ? babip.toFixed(3) : null} percentile={approxPercentile(babip, BATTING_THRESHOLDS.babip)} />
              <StatCard label="wOBA"  value={fmt(sl.woba)} />
            </div>
          </div>

          <div>
            <p className="text-[10px] text-content-muted/60 uppercase tracking-wider mb-2">Production</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard label="HR"  value={sl.hr}  percentile={approxPercentile(sl.hr,  BATTING_THRESHOLDS.hr)} />
              <StatCard label="RBI" value={sl.rbi} percentile={approxPercentile(sl.rbi, BATTING_THRESHOLDS.rbi)} />
              <StatCard label="R"   value={sl.r} />
              <StatCard label="2B"  value={sl.double} />
              <StatCard label="3B"  value={sl.triple} />
              <StatCard label="TB"  value={sl.tb} />
              <StatCard label="G"   value={sl.g} />
              <StatCard label="AB"  value={sl.ab} />
            </div>
          </div>

          <div>
            <p className="text-[10px] text-content-muted/60 uppercase tracking-wider mb-2">Plate discipline</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard label="K%"    value={fmtPct(kPct)}   percentile={approxPercentile(kPct,   BATTING_THRESHOLDS.kPct)} />
              <StatCard label="BB%"   value={fmtPct(bbPct)}  percentile={approxPercentile(bbPct,  BATTING_THRESHOLDS.bbPct)} />
              <StatCard label="K-BB%" value={fmtPct(kBbPct)} percentile={approxPercentile(kBbPct, BATTING_THRESHOLDS.kBbPct)} />
              <StatCard label="K"     value={sl.k} />
              <StatCard label="BB"    value={sl.bb} />
              <StatCard label="HBP"   value={sl.hbp} />
            </div>
          </div>

          {(spray.pull_pct != null || spray.cent_pct != null || spray.oppo_pct != null) && (
          <div>
            <p className="text-[10px] text-content-muted/60 uppercase tracking-wider mb-2">Spray tendencies</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {spray.pull_pct != null && <StatCard label="Pull%" value={`${(spray.pull_pct * 100).toFixed(1)}%`} percentile={approxPercentile(spray.pull_pct * 100, BATTING_THRESHOLDS.pullPct)} />}
              {spray.cent_pct != null && <StatCard label="Cent%" value={`${(spray.cent_pct * 100).toFixed(1)}%`} percentile={approxPercentile(spray.cent_pct * 100, BATTING_THRESHOLDS.centPct)} />}
              {spray.oppo_pct != null && <StatCard label="Oppo%" value={`${(spray.oppo_pct * 100).toFixed(1)}%`} percentile={approxPercentile(spray.oppo_pct * 100, BATTING_THRESHOLDS.oppoPct)} />}
            </div>
          </div>
          )}

        </div>
      </section>

      {/* Percentile gauge */}
      {gaugeStats.some(g => g.percentile != null) && (
        <section>
          <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">Percentiles vs MLB Average</h3>
          <div className="card p-4">
            <PercentileGauge stats={gaugeStats} />
          </div>
        </section>
      )}

      {/* Batting trends */}
      {gamesChronological.length > 3 && (
        <section>
          <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">
            Batting Trends
            <span className="ml-2 font-normal normal-case text-[10px]">(10-game rolling avg)</span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'ops',   label: 'OPS',   color: '#6366F1' },
              { key: 'avg',   label: 'AVG',   color: '#22C55E' },
              { key: 'slg',   label: 'SLG',   color: '#F97316' },
              { key: 'babip', label: 'BABIP', color: '#14B8A6' },
            ].map(({ key, label, color }) => (
              <div key={key} className="card p-3">
                <div className="text-[10px] font-semibold text-content-muted uppercase tracking-[0.06em] mb-1">{label}</div>
                <RollingAverageChart
                  data={gamesChronological}
                  valueKey={key}
                  valueLabel={label}
                  color={color}
                  windowSize={10}
                  height={120}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Pitcher stats section ────────────────────────────────────────────────────

function PitcherStats({ sl, games }) {
  const ip  = Number(sl.ip)  || 0
  const k   = Number(sl.k)   || 0
  const bb  = Number(sl.bb)  || 0
  const hr  = Number(sl.hr)  || 0
  const er  = Number(sl.er)  || 0
  const bf  = Number(sl.bf)  || 0
  const h   = Number(sl.h)   || 0

  const kPct   = bf > 0 ? (k  / bf * 100) : null
  const bbPct  = bf > 0 ? (bb / bf * 100) : null
  const kBbPct = kPct != null && bbPct != null ? kPct - bbPct : null
  const fip    = ip > 0 ? ((13 * hr + 3 * bb - 2 * k) / ip + 3.10) : null
  const h9     = ip > 0 ? (h  * 9 / ip) : null
  const hr9    = ip > 0 ? (hr * 9 / ip) : null

  const gamesChronological = useMemo(() => [...games].reverse().map(g => {
    const gip = Number(g.ip) || 0
    const ger = Number(g.er) || 0
    const era = gip > 0 ? ger * 9 / gip : (ger === 0 ? 0 : null)
    return { ...g, era }
  }), [games])

  const gaugeStats = [
    { label: 'ERA',  value: fmt2(sl.era),  percentile: approxPercentile(sl.era,  PITCHING_THRESHOLDS.era) },
    { label: 'WHIP', value: fmt2(sl.whip), percentile: approxPercentile(sl.whip, PITCHING_THRESHOLDS.whip) },
    { label: 'K/9',  value: fmt2(sl.k9),   percentile: approxPercentile(sl.k9,   PITCHING_THRESHOLDS.k9) },
    { label: 'BB/9', value: fmt2(sl.bb9),  percentile: approxPercentile(sl.bb9,  PITCHING_THRESHOLDS.bb9) },
  ]

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">Traditional</h3>
        <div className="space-y-4">
          <div>
            <p className="text-[10px] text-content-muted/60 uppercase tracking-wider mb-2">Quality</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard label="ERA"  value={fmt2(sl.era)}  percentile={approxPercentile(sl.era,  PITCHING_THRESHOLDS.era)} />
              <StatCard label="FIP"  value={fip != null ? fip.toFixed(2) : null} percentile={approxPercentile(fip, PITCHING_THRESHOLDS.fip)} />
              <StatCard label="WHIP" value={fmt2(sl.whip)} percentile={approxPercentile(sl.whip, PITCHING_THRESHOLDS.whip)} />
              <StatCard label="H/9"  value={h9  != null ? h9.toFixed(2)  : null} percentile={approxPercentile(h9,  PITCHING_THRESHOLDS.h9)} />
              <StatCard label="HR/9" value={fmt2(sl.hr9)} percentile={approxPercentile(sl.hr9,  PITCHING_THRESHOLDS.hr9)} />
            </div>
          </div>

          <div>
            <p className="text-[10px] text-content-muted/60 uppercase tracking-wider mb-2">Volume</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard label="IP" value={fmt2(sl.ip)} />
              <StatCard label="GS" value={sl.gs} />
              <StatCard label="W"  value={sl.w}  percentile={approxPercentile(sl.w, PITCHING_THRESHOLDS.w)} />
              <StatCard label="L"  value={sl.l} />
              <StatCard label="SV" value={sl.sv} />
            </div>
          </div>

          <div>
            <p className="text-[10px] text-content-muted/60 uppercase tracking-wider mb-2">Stuff &amp; command</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard label="K%"    value={fmtPct(kPct)}   percentile={approxPercentile(kPct,   PITCHING_THRESHOLDS.kPct)} />
              <StatCard label="BB%"   value={fmtPct(bbPct)}  percentile={approxPercentile(bbPct,  PITCHING_THRESHOLDS.bbPct)} />
              <StatCard label="K-BB%" value={fmtPct(kBbPct)} percentile={approxPercentile(kBbPct, PITCHING_THRESHOLDS.kBbPct)} />
              <StatCard label="K/9"   value={fmt2(sl.k9)}  percentile={approxPercentile(sl.k9,  PITCHING_THRESHOLDS.k9)} />
              <StatCard label="BB/9"  value={fmt2(sl.bb9)} percentile={approxPercentile(sl.bb9, PITCHING_THRESHOLDS.bb9)} />
              <StatCard label="K/BB"  value={fmt2(sl.k_bb)} />
              <StatCard label="K"     value={sl.k} percentile={approxPercentile(sl.k, PITCHING_THRESHOLDS.k)} />
              <StatCard label="BB"    value={sl.bb} />
            </div>
          </div>
        </div>
      </section>

      {/* Percentile gauge */}
      {gaugeStats.some(g => g.percentile != null) && (
        <section>
          <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">Percentiles vs MLB Average</h3>
          <div className="card p-4">
            <PercentileGauge stats={gaugeStats} />
          </div>
        </section>
      )}

      {/* ERA trend */}
      {gamesChronological.length > 3 && (
        <section>
          <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">
            ERA Trend
            <span className="ml-2 font-normal normal-case text-[10px]">
              (rolling {Math.min(gamesChronological.length, 5)}-start avg)
            </span>
          </h3>
          <div className="card p-4">
            <RollingAverageChart
              data={gamesChronological}
              valueKey="era"
              valueLabel="ERA"
              color="#EF4444"
              windowSize={5}
            />
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Rich game log ────────────────────────────────────────────────────────────

function SimGameLog({ isBatter, games }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? games.slice(0, 30) : games.slice(0, 10)

  const trendKey   = isBatter ? 'ops_game' : 'era_game'
  const trendColor = isBatter ? '#6366F1' : '#EF4444'

  const enriched = useMemo(() => games.map(g => {
    if (isBatter) {
      const ab = Number(g.ab) || 0
      const h  = Number(g.h)  || 0
      const hr = Number(g.hr) || 0
      const bb = Number(g.bb) || 0
      const g2b = Number(g.double) || 0
      const g3b = Number(g.triple) || 0
      const tb  = h + g2b + 2 * g3b + 3 * hr
      const obp = (ab + bb) > 0 ? (h + bb) / (ab + bb) : 0
      const slg = ab > 0 ? tb / ab : 0
      return { ...g, ops_game: obp + slg }
    } else {
      const ip = Number(g.ip) || 0
      const er = Number(g.er) || 0
      const era = ip > 0 ? er * 9 / ip : (er === 0 ? 0 : null)
      return { ...g, era_game: era }
    }
  }), [games, isBatter])

  const fmtDate = iso => iso
    ? new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '—'

  const battingCols  = ['Date', 'Opp', 'AB', 'H', '2B', '3B', 'HR', 'RBI', 'R', 'BB', 'K', 'OPS']
  const pitchingCols = ['Date', 'Opp', 'IP', 'BF', 'H', 'HR', 'ER', 'BB', 'K', 'ERA']
  const cols = isBatter ? battingCols : pitchingCols

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em]">Game Log</h3>
          {enriched.length > 2 && (
            <SparklineChart data={[...enriched].reverse()} valueKey={trendKey} color={trendColor} width={64} height={22} />
          )}
        </div>
        {games.length > 10 && (
          <button
            type="button"
            className="text-xs text-brand-light hover:underline"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? 'Show 10' : 'Show 30'}
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-bg-border">
                {cols.map(h => (
                  <th
                    key={h}
                    className={`px-3 py-3 text-[11px] text-content-muted font-semibold uppercase tracking-[0.08em] whitespace-nowrap ${
                      h === 'Date' || h === 'Opp' ? 'text-left' : 'text-right'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={cols.length} className="px-3 py-5 text-content-muted text-center">
                    No game log yet — simulate some games first.
                  </td>
                </tr>
              )}
              {visible.map((g, i) => {
                const eg = enriched[i] ?? g
                return (
                  <tr key={i} className="border-b border-bg-border/50 last:border-0 hover:bg-bg-elevated transition-colors">
                    <td className="px-3 py-2.5 text-content-secondary whitespace-nowrap">{fmtDate(g.date)}</td>
                    <td className="px-3 py-2.5 text-content-secondary whitespace-nowrap font-mono">{g.opp || '—'}</td>
                    {isBatter ? (
                      <>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.ab ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.h  ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.double ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.triple ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.hr  ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.rbi ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.r   ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.bb  ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.k   ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary whitespace-nowrap">
                          {eg.ops_game != null ? eg.ops_game.toFixed(3) : '—'}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.ip  ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.bf  ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.h   ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.hr  ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.er  ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.bb  ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{g.k   ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary whitespace-nowrap">
                          {eg.era_game != null ? eg.era_game.toFixed(2) : '—'}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

// ─── Actual MLB season stats (live leagues) ───────────────────────────────────

function ActualSeasonStats({ mlb, isBatter }) {
  if (!mlb) return null

  const battingStats = [
    { label: 'G',    val: mlb.g },
    { label: 'AB',   val: mlb.ab },
    { label: 'AVG',  val: fmt(mlb.avg) },
    { label: 'OBP',  val: fmt(mlb.obp) },
    { label: 'SLG',  val: fmt(mlb.slg) },
    { label: 'OPS',  val: fmt(mlb.ops) },
    { label: 'HR',   val: mlb.hr },
    { label: 'RBI',  val: mlb.rbi },
    { label: 'BB',   val: mlb.bb },
    { label: 'K',    val: mlb.k },
  ]
  const pitchingStats = [
    { label: 'GS',   val: mlb.gs },
    { label: 'W',    val: mlb.w },
    { label: 'L',    val: mlb.l },
    { label: 'IP',   val: fmt2(mlb.ip) },
    { label: 'ERA',  val: fmt2(mlb.era) },
    { label: 'WHIP', val: fmt2(mlb.whip) },
    { label: 'K',    val: mlb.k },
    { label: 'BB',   val: mlb.bb },
    { label: 'H',    val: mlb.h },
  ]
  const stats = isBatter ? battingStats : pitchingStats

  return (
    <div className="card p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-content-muted mb-1">Actual Season Stats</h2>
      <p className="text-[10px] text-content-muted mb-3">Real MLB stats for this season</p>
      <div className="grid grid-cols-5 sm:grid-cols-9 gap-3">
        {stats.map(({ label, val }) => (
          <div key={label} className="text-center">
            <div className="text-xl font-black font-mono tabular-nums text-brand">{val ?? '—'}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-content-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const INSIGHT_SECTIONS = {
  season_summary:  'Season Summary',
  vs_projection:   'vs. Projection',
  notable_moments: 'Notable Moments',
}

export default function SimulationPlayer() {
  const { id, playerId } = useParams()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey:  ['sim-player', id, playerId],
    queryFn:   () => api.simulations.playerStats(id, playerId),
    staleTime: 60_000,
  })

  const { data: awardsData } = useQuery({
    queryKey:  ['sim-awards', id],
    queryFn:   () => api.simulations.awards(id),
    staleTime: 5 * 60_000,
  })

  const { data: playoffAwardsData } = useQuery({
    queryKey:  ['sim-playoff-awards', id],
    queryFn:   () => api.simulations.playoffAwards(id),
    staleTime: 5 * 60_000,
  })

  const playerAwards = useMemo(
    () => extractPlayerAwards(awardsData, playoffAwardsData, playerId),
    [awardsData, playoffAwardsData, playerId]
  )

  if (isLoading) return <SimSpinner className="py-20" />

  if (!data || data.error) {
    return <div className="card p-8 text-center text-red-400">{data?.error || 'Player not found.'}</div>
  }

  const { player_name, player_type, team_id, team_abbr, team_color, position, ratings, season_line, mlb_season_line, game_log, injury_status, spray = {} } = data
  const isBatter = player_type === 'batter'
  const sl       = season_line    || {}
  const games    = game_log       || []

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="card-raised overflow-hidden">
        <div className="relative h-1 bg-gradient-to-r from-brand via-brand-light to-transparent" />
        <div className="p-6 flex items-start gap-6">
          <div className="shrink-0">
            <SimPlayerAvatar
              playerId={parseInt(playerId)}
              name={player_name}
              size={96}
              className="rounded-2xl border border-bg-border"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Link to={`/simulation/${id}`} className="text-xs text-content-muted hover:text-brand transition-colors">
                    ← League
                  </Link>
                  <SimBadge />
                  <Link
                    to={`/player/${playerId}`}
                    className="text-[10px] font-semibold text-content-muted hover:text-brand transition-colors border border-bg-border hover:border-brand/40 rounded px-2 py-0.5"
                  >
                    Real Profile →
                  </Link>
                </div>
                <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-content-primary leading-tight">
                  {player_name}
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {position && (
                    <span className="text-brand-light font-semibold text-sm">{position}</span>
                  )}
                  {team_id && (
                    <>
                      <span className="text-bg-border">·</span>
                      <Link
                        to={`/simulation/${id}/team/${team_id}`}
                        className="flex items-center gap-1.5 hover:underline"
                      >
                        <TeamLogo teamId={team_id} abbr={team_abbr} color={team_color} size={16} />
                        <span className="text-content-secondary text-sm">{team_abbr}</span>
                      </Link>
                    </>
                  )}
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                    isBatter
                      ? 'bg-brand/10 text-brand border-brand/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {isBatter ? 'Batter' : 'Pitcher'}
                  </span>
                  {injury_status?.on_il && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                      injury_status.severity === 'major'    ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                      injury_status.severity === 'moderate' ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' :
                                                              'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                    }`}>
                      IL · {injury_status.severity}
                      {injury_status.days_remaining > 0 && ` · ${injury_status.days_remaining}d`}
                    </span>
                  )}
                  {playerAwards.map(({ label, color }) => (
                    <AwardBadge key={label} label={label} color={color} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Player Ratings ── */}
      {ratings && Object.keys(ratings).length > 0 && (
        <div className="card p-5 space-y-3">
          <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em]">
            Player Ratings
          </h3>
          <RatingDots ratings={ratings} isPitcher={!isBatter} size="lg" />
        </div>
      )}

      {/* ── AI Insights ── */}
      <SimInsightPanel
        queryKey={['sim-player-insight', id, playerId]}
        queryFn={() => api.simulations.playerInsights(id, playerId)}
        regenerateFn={async () => {
          await api.simulations.playerInsights(id, playerId, { refresh: true })
          qc.invalidateQueries({ queryKey: ['sim-player-insight', id, playerId] })
        }}
        sections={INSIGHT_SECTIONS}
      />

      {/* ── Actual MLB stats (live leagues only) ── */}
      <ActualSeasonStats mlb={mlb_season_line} isBatter={isBatter} />

      {/* ── Stat cards + percentiles + trends ── */}
      {sl && Object.keys(sl).length > 0 ? (
        isBatter
          ? <BatterStats sl={sl} games={games} leagueId={id} playerId={playerId} />
          : <PitcherStats sl={sl} games={games} />
      ) : (
        <div className="card p-6 text-center text-content-muted text-sm">
          No stats yet — simulate some games first.
        </div>
      )}

      {/* ── League rankings ── */}
      {sl && Object.keys(sl).length > 0 && (
        <LeagueRankings leagueId={id} playerId={playerId} isBatter={isBatter} />
      )}

      {/* ── Game log ── */}
      {games.length > 0 && <SimGameLog isBatter={isBatter} games={games} />}
    </div>
  )
}
