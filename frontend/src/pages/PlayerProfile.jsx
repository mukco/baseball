import { useEffect, useState, useMemo, useContext } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { api } from '../api'
import FactoidsPanel from '../components/FactoidsPanel'
import { StatCard } from '../components/StatCard'
import PitchMixChart from '../components/charts/PitchMixChart'
import PitchBreakArrow from '../components/charts/PitchBreakArrow'
import PitchLocationChart from '../components/charts/PitchLocationChart'
import SprayChart from '../components/charts/SprayChart'
import PercentileGauge from '../components/charts/PercentileGauge'
import SparklineChart from '../components/charts/SparklineChart'
import PitchBarChart from '../components/charts/PitchBarChart'
import RollingAverageChart from '../components/charts/RollingAverageChart'
import SankeyChart from '../components/charts/SankeyChart'
import TransactionsList from '../components/TransactionsList'
import SystemComparison from '../components/SystemComparison'
import StatHelpTooltip from '../components/StatHelpTooltip'
import { PlayerListsContext } from '../hooks/usePlayerLists.jsx'

const CURRENT_SEASON = new Date().getFullYear()
const MIN_SEASON = 2018
const SEASON_OPTIONS = Array.from(
  { length: Math.max(1, CURRENT_SEASON - MIN_SEASON + 1) },
  (_, i) => CURRENT_SEASON - i
)

// Normalize our custom projection into the shape BattingTab/PitchingTab expect
function normalizeCustomProj(customProj) {
  if (!customProj?.projected_stats) return null
  const ps = customProj.projected_stats
  const type = customProj.player_type
  if (type === 'batter') {
    return {
      source: 'ours',
      projections: {
        avg: ps.avg, obp: ps.obp, slg: ps.slg, ops: ps.ops,
        homeRuns: ps.hr, rbi: ps.rbi, stolenBases: ps.sb ?? null,
        strikeOuts: ps.ks ?? null, baseOnBalls: ps.bb,
      },
    }
  }
  if (type === 'pitcher') {
    return {
      source: 'ours',
      projections: {
        era: ps.era, whip: ps.whip,
        strikeOuts: ps.ks, baseOnBalls: ps.bbs,
        inningsPitched: ps.ip,
        wins: ps.wins ?? null, saves: ps.saves ?? null,
      },
    }
  }
  return null
}

// Normalize Steamer / ZiPS (MLB Stats API format) for BattingTab
function normalizeMlbBattingProj(data, source) {
  if (!data?.projections) return null
  const p = data.projections
  return {
    source,
    projections: {
      avg: p.avg, obp: p.obp, slg: p.slg, ops: p.ops,
      homeRuns: p.homeRuns, rbi: p.rbi,
      stolenBases: p.stolenBases ?? null,
      strikeOuts: p.strikeOuts, baseOnBalls: p.baseOnBalls,
    },
  }
}

// Normalize Steamer / ZiPS for PitchingTab
function normalizeMlbPitchingProj(data, source) {
  if (!data?.projections) return null
  const p = data.projections
  return {
    source,
    projections: {
      era: p.era, whip: p.whip,
      strikeOuts: p.strikeOuts, baseOnBalls: p.baseOnBalls,
      inningsPitched: p.inningsPitched,
      wins: p.wins ?? null, saves: p.saves ?? null,
    },
  }
}

const PROJ_SOURCES = [
  { value: 'ours',    label: 'Ours'    },
  { value: 'steamer', label: 'Steamer' },
  { value: 'zips',    label: 'ZiPS'   },
]

function ProjSourcePicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-content-muted">Pace vs</span>
      <div className="flex rounded border border-bg-border overflow-hidden">
        {PROJ_SOURCES.map(({ value: v, label }) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${
              value === v
                ? 'bg-brand/10 text-brand'
                : 'text-content-muted hover:text-content-secondary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

const COMPONENT_LABELS_PP = {
  bb_pct: 'BB%', k_pct: 'K%', babip: 'BABIP', iso: 'ISO',
  hr_fb_pct: 'HR/FB%', fb_pct: 'FB%', gb_pct: 'GB%',
  hbp_pct: 'HBP%',
}
const COMPONENT_FMTS_PP = {
  babip:     (v) => v.toFixed(3),
  iso:       (v) => v.toFixed(3),
  bb_pct:    (v) => `${(v * 100).toFixed(1)}%`,
  k_pct:     (v) => `${(v * 100).toFixed(1)}%`,
  hbp_pct:   (v) => `${(v * 100).toFixed(1)}%`,
  fb_pct:    (v) => `${(v * 100).toFixed(1)}%`,
  gb_pct:    (v) => `${(v * 100).toFixed(1)}%`,
  hr_fb_pct: (v) => `${(v * 100).toFixed(1)}%`,
}

// -------------------------------------------------------------------
// Percentile calculation helpers (approximate 2024 MLB averages)
// -------------------------------------------------------------------
const BATTING_THRESHOLDS = {
  avg: { p10: 0.218, p25: 0.238, p50: 0.258, p75: 0.280, p90: 0.305 },
  obp: { p10: 0.288, p25: 0.308, p50: 0.328, p75: 0.355, p90: 0.385 },
  slg: { p10: 0.345, p25: 0.378, p50: 0.420, p75: 0.465, p90: 0.520 },
  ops: { p10: 0.635, p25: 0.688, p50: 0.745, p75: 0.820, p90: 0.900 },
  homeRuns: { p10: 2, p25: 6, p50: 12, p75: 22, p90: 35 },
  rbi: { p10: 15, p25: 28, p50: 45, p75: 62, p90: 85 },
  stolenBases: { p10: 0, p25: 2, p50: 6, p75: 14, p90: 28 },
  strikeOuts: { p10: 60, p25: 80, p50: 100, p75: 125, p90: 155, invert: true },
  kPct:  { p10: 13, p25: 17, p50: 22, p75: 27, p90: 32, invert: true },
  bbPct: { p10: 5,  p25: 7,  p50: 9,  p75: 11, p90: 14 },
  iso:   { p10: 0.095, p25: 0.130, p50: 0.165, p75: 0.210, p90: 0.250 },
  babip: { p10: 0.255, p25: 0.273, p50: 0.295, p75: 0.318, p90: 0.340 },
  kBbPct: { p10: 3, p25: 8, p50: 13, p75: 19, p90: 26, invert: true },
  avgExitVelo: { p10: 86.5, p25: 88.0, p50: 89.5, p75: 91.5, p90: 93.5 },
  hardHitPct: { p10: 28, p25: 33, p50: 38, p75: 44, p90: 50 },
  barrelPct: { p10: 3, p25: 5, p50: 7, p75: 11, p90: 17 },
  xwOBA: { p10: 0.270, p25: 0.300, p50: 0.325, p75: 0.360, p90: 0.400 },
  sprintSpeed: { p10: 25.5, p25: 26.5, p50: 27.5, p75: 28.5, p90: 29.5 },
  batSpeed:         { p10: 66,  p25: 68.5, p50: 71,   p75: 73.5, p90: 76 },
  swingLength:      { p10: 8.5, p25: 8.2,  p50: 7.8,  p75: 7.5,  p90: 7.1, invert: true },
  hardSwingRate:    { p10: 50,  p25: 57,   p50: 64,   p75: 72,   p90: 80 },
  squaredUpPerSwing:{ p10: 13,  p25: 17,   p50: 21,   p75: 25,   p90: 30 },
  blastPerSwing:    { p10: 9,   p25: 12,   p50: 16,   p75: 20,   p90: 25 },
  oSwingPct:        { p10: 38,  p25: 34,   p50: 30,   p75: 26,   p90: 22, invert: true },
  zSwingPct:        { p10: 60,  p25: 64,   p50: 68,   p75: 72,   p90: 77 },
  pullPct:          { p10: 32,  p25: 36,   p50: 40,   p75: 44,   p90: 50 },
  centPct:          { p10: 26,  p25: 30,   p50: 33,   p75: 37,   p90: 41 },
  oppoPct:          { p10: 18,  p25: 22,   p50: 27,   p75: 32,   p90: 37 },
}

const PITCHING_THRESHOLDS = {
  era:               { p10: 5.20, p25: 4.50, p50: 3.80, p75: 3.10, p90: 2.40, invert: true },
  fip:               { p10: 5.00, p25: 4.20, p50: 3.60, p75: 3.00, p90: 2.40, invert: true },
  whip:              { p10: 1.45, p25: 1.32, p50: 1.20, p75: 1.08, p90: 0.95, invert: true },
  strikeOuts:        { p10: 20,  p25: 40,  p50: 70,  p75: 110, p90: 160 },
  wins:              { p10: 2,   p25: 5,   p50: 9,   p75: 13,  p90: 17 },
  strikeoutsPer9Inn: { p10: 6.0, p25: 7.0, p50: 8.5, p75: 10.0, p90: 12.0 },
  walksPer9Inn:      { p10: 4.5, p25: 3.5, p50: 2.8, p75: 2.2,  p90: 1.5,  invert: true },
  kPct:              { p10: 14,  p25: 18,  p50: 22,  p75: 27,   p90: 32 },
  bbPct:             { p10: 11,  p25: 9,   p50: 7.5, p75: 6.0,  p90: 4.5,  invert: true },
  kBbPct:            { p10: 4,   p25: 9,   p50: 14,  p75: 19,   p90: 24 },
  hitsPer9Inn:       { p10: 10.5, p25: 9.2, p50: 8.3, p75: 7.4, p90: 6.5,  invert: true },
  homeRunsPer9Inn:   { p10: 1.8,  p25: 1.4, p50: 1.1, p75: 0.8, p90: 0.5,  invert: true },
}

import { approxPercentile } from '../lib/perfUtil'

function projectionProgress({ current, projectedTotal }) {
  const currentNum = Number(current)
  const projectedNum = Number(projectedTotal)
  if (!Number.isFinite(currentNum) || !Number.isFinite(projectedNum) || projectedNum <= 0) return null
  return {
    current: Number.isInteger(currentNum) ? currentNum : currentNum.toFixed(1),
    target: Number.isInteger(projectedNum) ? projectedNum : projectedNum.toFixed(1),
  }
}

function projectionComparison({ current, projected, inverse = false, decimals = 3 }) {
  const currentNum = Number(current)
  const projectedNum = Number(projected)
  if (!Number.isFinite(currentNum) || !Number.isFinite(projectedNum)) return null

  const tolerance = Math.max(Math.abs(projectedNum) * 0.03, 0.001)
  let status = 'Neutral'
  let color = 'text-content-muted'

  if (Math.abs(currentNum - projectedNum) > tolerance) {
    const above = currentNum > projectedNum
    const better = inverse ? !above : above
    status = better ? 'Above' : 'Below'
    color = better ? 'text-green-400' : 'text-red-400'
  }

  return {
    projectedLabel: `Proj ${projectedNum.toFixed(decimals)}`,
    status,
    color,
  }
}

function formatDateShort(date) {
  if (!date) return '-'
  try {
    return format(parseISO(date), 'MMM d')
  } catch {
    return date
  }
}

function fmtMoney(v) {
  if (v == null) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v)
}

// -------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------

const FV_COLOR = fv => {
  if (fv >= 60) return { text: '#34D399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.25)' }
  if (fv >= 50) return { text: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)' }
  return           { text: '#8B95A3', bg: 'rgba(139,149,163,0.08)',  border: 'rgba(139,149,163,0.2)' }
}

const GRADE_LABEL = fv => {
  if (fv >= 70) return 'Star'
  if (fv >= 60) return 'Solid starter'
  if (fv >= 55) return 'Above avg'
  if (fv >= 50) return 'Average MLB'
  if (fv >= 45) return 'Fringe'
  return 'Org depth'
}

function ToolGrade({ label, value }) {
  if (!value) return null
  const n = typeof value === 'string' ? parseInt(value, 10) : value
  const color = Number.isFinite(n)
    ? n >= 60 ? '#34D399' : n >= 50 ? '#FBBF24' : '#8B95A3'
    : '#8B95A3'
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] text-content-muted uppercase tracking-wider">{label}</span>
      <span className="text-sm font-bold font-mono" style={{ color }}>{value}</span>
    </div>
  )
}

const OTTONEU_FAIR_PPD = 10

function ottPtsPct(val, dist) {
  if (val == null || !dist?.length) return null
  const below = dist.filter(v => v < val).length
  return Math.round((below / dist.length) * 100)
}

function ottPctBarColor(pct) {
  if (pct >= 75) return 'bg-green-400'
  if (pct >= 50) return 'bg-blue-400'
  if (pct >= 25) return 'bg-amber-400'
  return 'bg-red-400'
}

function useLeagueDist() {
  const { data: allRosters } = useQuery({
    queryKey: ['ottoneu-all-rosters'],
    queryFn: () => api.ottoneu.allRosters(),
    staleTime: 30 * 60_000,
  })

  const rosterFgIds = useMemo(() => {
    if (!Array.isArray(allRosters)) return []
    return allRosters.flatMap(t => t.players ?? []).map(p => p.fg_id).filter(Boolean)
  }, [allRosters])

  const salaryByFgId = useMemo(() => {
    if (!Array.isArray(allRosters)) return {}
    const map = {}
    allRosters.flatMap(t => t.players ?? []).forEach(p => {
      if (p.fg_id && p.salary > 0) map[String(p.fg_id)] = p.salary
    })
    return map
  }, [allRosters])

  const { data: leagueStats = [] } = useQuery({
    queryKey: ['ottoneu-league-pts-dist', rosterFgIds.slice().sort().join(',')],
    queryFn: () => api.ottoneu.playerStats({ fgIds: rosterFgIds }),
    enabled: rosterFgIds.length > 0,
    staleTime: 30 * 60_000,
  })

  return useMemo(() => {
    const pts = [], ppd = [], surplus = []
    leagueStats.forEach(p => {
      const ap  = p.approx_fg_pts
      const sal = salaryByFgId[String(p.fg_id)]
      if (ap != null && ap > 0) pts.push(ap)
      if (ap != null && sal > 0) {
        ppd.push(ap / sal)
        surplus.push(Math.round(ap / OTTONEU_FAIR_PPD) - sal)
      }
    })
    return {
      leaguePtsDist:     pts.sort((a, b) => a - b),
      leaguePpdDist:     ppd.sort((a, b) => a - b),
      leagueSurplusDist: surplus.sort((a, b) => a - b),
    }
  }, [leagueStats, salaryByFgId])
}

const LIST_META_PP = {
  watch: { label: 'Watch', accent: 'text-sky-400',   activeBg: 'bg-sky-400/10',   icon: '◎' },
  cut:   { label: 'Cut',   accent: 'text-red-400',   activeBg: 'bg-red-400/10',   icon: '✂' },
  trade: { label: 'Trade', accent: 'text-amber-400', activeBg: 'bg-amber-400/10', icon: '⇄' },
}

function OttoneuPlayerPanel({ playerName, playerId }) {
  const { data, isLoading } = useQuery({
    queryKey:  ['ottoneu-player-analysis', playerName],
    queryFn:   () => api.ottoneu.playerAnalysis({ name: playerName }),
    staleTime: 30 * 60_000,
    enabled:   !!playerName,
  })

  const { leaguePtsDist, leaguePpdDist, leagueSurplusDist } = useLeagueDist()
  const listsCtx = useContext(PlayerListsContext)

  if (isLoading || !data || data.error) return null

  const ptsPctile     = ottPtsPct(data.approx_fg_pts, leaguePtsDist)
  const ppdPctile     = ottPtsPct(data.ppd,           leaguePpdDist)
  const surplusPctile = ottPtsPct(data.surplus,       leagueSurplusDist)

  const playerObj = {
    player_id:     playerId ?? null,
    fg_id:         data.fg_id ?? null,
    name:          playerName,
    mlb_team:      data.mlb_team ?? '',
    roster_team:   data.roster_team ?? null,
    salary:        data.salary ?? null,
    approx_fg_pts: data.approx_fg_pts ?? null,
    on_my_team:    data.on_my_team ?? false,
  }

  const visibleLists = data.on_my_team
    ? ['cut', 'trade']
    : ['watch', 'trade']

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
          Ottoneu
        </span>
        <div className="flex items-center gap-2">
          {listsCtx && (
            <div className="flex gap-1">
              {visibleLists.map(list => {
                const { label, accent, activeBg, icon } = LIST_META_PP[list]
                const active = listsCtx.isOn(playerObj, list)
                return (
                  <button
                    key={list}
                    onClick={() => listsCtx.toggle(playerObj, list)}
                    title={active ? `Remove from ${label}` : `Add to ${label}`}
                    className={`text-[11px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1
                      ${active
                        ? `${accent} ${activeBg} border-current/30`
                        : `text-content-muted border-bg-border hover:${accent} hover:bg-bg-elevated`}`}
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          )}
          {data.roster_team ? (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              data.on_my_team
                ? 'bg-brand/15 text-brand'
                : 'bg-bg-elevated text-content-secondary'
            }`}>
              {data.roster_team}
            </span>
          ) : (
            <span className="text-xs text-content-muted">Free Agent</span>
          )}
        </div>
      </div>

      {data.salary != null && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex flex-col items-center">
            <span className="text-[15px] font-semibold text-content-primary">${data.salary}</span>
            <span className="text-[9px] text-content-muted uppercase">Salary</span>
          </div>
          {data.approx_fg_pts != null && (
            <div className="flex flex-col items-center min-w-[48px]">
              <span className="text-[15px] font-semibold text-content-primary">
                {Number(data.approx_fg_pts).toFixed(0)}
              </span>
              <span className="text-[9px] text-content-muted uppercase">FG Pts</span>
              {ptsPctile != null && (
                <div className="mt-1 h-0.5 rounded-full bg-bg-border overflow-hidden w-full">
                  <div className={`h-full rounded-full ${ottPctBarColor(ptsPctile)}`} style={{ width: `${ptsPctile}%` }} />
                </div>
              )}
            </div>
          )}
          {data.ppd != null && (
            <div className="flex flex-col items-center min-w-[48px]">
              <span className={`text-[15px] font-semibold ${
                data.ppd >= 20 ? 'text-green-400'
                : data.ppd >= 15 ? 'text-green-300'
                : data.ppd >= OTTONEU_FAIR_PPD ? 'text-content-primary'
                : 'text-red-400'
              }`}>
                {Number(data.ppd).toFixed(1)}
              </span>
              <span className="text-[9px] text-content-muted uppercase flex items-center gap-0.5">
                PPD <StatHelpTooltip stat="ppd" />
              </span>
              {ppdPctile != null && (
                <div className="mt-1 h-0.5 rounded-full bg-bg-border overflow-hidden w-full">
                  <div className={`h-full rounded-full ${ottPctBarColor(ppdPctile)}`} style={{ width: `${ppdPctile}%` }} />
                </div>
              )}
            </div>
          )}
          {data.surplus != null && (
            <div className="flex flex-col items-center min-w-[48px]">
              <span className={`text-[15px] font-semibold ${
                data.surplus > 50 ? 'text-green-400'
                : data.surplus > 0 ? 'text-green-300'
                : data.surplus > -30 ? 'text-content-primary'
                : 'text-red-400'
              }`}>
                {data.surplus > 0 ? '+' : ''}{Number(data.surplus).toFixed(0)}
              </span>
              <span className="text-[9px] text-content-muted uppercase flex items-center gap-0.5">
                Surplus <StatHelpTooltip stat="surplus" />
              </span>
              {surplusPctile != null && (
                <div className="mt-1 h-0.5 rounded-full bg-bg-border overflow-hidden w-full">
                  <div className={`h-full rounded-full ${ottPctBarColor(surplusPctile)}`} style={{ width: `${surplusPctile}%` }} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {data.analysis && (
        <p className="text-[13px] text-content-secondary leading-relaxed">
          {data.analysis}
        </p>
      )}
    </div>
  )
}

function ProspectCard({ playerId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['prospect-player', playerId],
    queryFn: () => api.prospects.player(playerId),
    enabled: !!playerId,
    staleTime: 60 * 60 * 1000,
  })

  if (isLoading || !data?.prospect) return null
  const p = data.prospect
  const fv = p.fv || 0
  const colors = FV_COLOR(fv)
  const isPitcher = ['SP', 'RP', 'P'].includes(p.position) || p.position?.endsWith('HP')

  return (
    <div className="card p-5">
      <div className="flex items-start gap-4 flex-wrap">
        {/* FV badge */}
        <div className="flex flex-col items-center shrink-0">
          <div
            className="w-16 h-16 rounded-xl flex flex-col items-center justify-center border"
            style={{ background: colors.bg, borderColor: colors.border }}
          >
            <span className="text-2xl font-black font-mono leading-none" style={{ color: colors.text }}>{fv || '—'}</span>
            <span className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: colors.text }}>FV</span>
          </div>
          <span className="text-[10px] text-content-muted mt-1 text-center">{GRADE_LABEL(fv)}</span>
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted">Prospect</span>
            {p.rank > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/15 text-brand-light border border-brand/25">
                #{p.rank} overall
              </span>
            )}
            {p.orgRank > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-bg-elevated border border-bg-border text-content-secondary">
                #{p.orgRank} in org
              </span>
            )}
            {p.eta > 0 && (
              <span className="text-[10px] text-content-muted">ETA {p.eta}</span>
            )}
            {p.risk && (
              <span className="text-[10px] text-content-muted">· {p.risk} risk</span>
            )}
          </div>

          {p.tldr && (
            <p className="text-sm text-content-secondary leading-relaxed">{p.tldr}</p>
          )}

          {/* Tool grades */}
          {p.tools && Object.keys(p.tools).length > 0 && (
            <div className="flex items-end gap-4 pt-1 flex-wrap">
              {isPitcher ? (
                <>
                  <ToolGrade label="FB"  value={p.tools.fb} />
                  <ToolGrade label="SL"  value={p.tools.sl} />
                  <ToolGrade label="CB"  value={p.tools.cb} />
                  <ToolGrade label="CH"  value={p.tools.ch} />
                  <ToolGrade label="CMD" value={p.tools.cmd} />
                </>
              ) : (
                <>
                  <ToolGrade label="Hit"   value={p.tools.hit} />
                  <ToolGrade label="Power" value={p.tools.power} />
                  <ToolGrade label="Run"   value={p.tools.run} />
                  <ToolGrade label="Field" value={p.tools.field} />
                  <ToolGrade label="Arm"   value={p.tools.arm} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Launch angle zones per Statcast definitions — sectors start at 0° so arcs stay above ground line
const LA_ZONES = [
  { min:  0, max: 10,  color: '#ef4444', label: 'GB' },
  { min: 10, max: 25,  color: '#eab308', label: 'LD' },
  { min: 25, max: 50,  color: '#3b82f6', label: 'FB' },
  { min: 50, max: 75,  color: '#a855f7', label: 'PU' },
]

function laAngleToXY(deg, r, cx, cy) {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
}

function laArcPath(startDeg, endDeg, r, cx, cy) {
  const s = laAngleToXY(startDeg, r, cx, cy)
  const e = laAngleToXY(endDeg, r, cx, cy)
  return `M ${cx} ${cy} L ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 0 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z`
}

function LaunchAngleCard({ angle }) {
  // W=148, H=70, R=54 chosen so the 75° arc top lands ~10px from top edge
  // and the rightmost point (0°) lands 18px from right edge — no overflow needed
  const W = 148, H = 70, cx = 74, cy = 64, R = 54

  // Clamp needle to [-20, 75]; negative angles point below ground line (clipped by viewport)
  const clampedAngle = angle != null ? Math.max(-20, Math.min(75, angle)) : null
  const zone = clampedAngle != null
    ? LA_ZONES.find(z => clampedAngle >= z.min && clampedAngle < z.max) ?? (clampedAngle < 0 ? LA_ZONES[0] : LA_ZONES[LA_ZONES.length - 1])
    : null

  const needleEnd = clampedAngle != null ? laAngleToXY(clampedAngle, R - 8, cx, cy) : null

  return (
    <div className="card p-5 flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em]">Launch Angle</span>
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-bold text-content-primary leading-none">
          {angle != null ? `${angle}°` : '—'}
        </span>
        {zone && (
          <span className="text-[11px] font-semibold" style={{ color: zone.color }}>{zone.label}</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="w-full mt-1">
        {LA_ZONES.map(z => (
          <path key={z.label} d={laArcPath(z.min, z.max, R, cx, cy)} fill={z.color} opacity={0.22} />
        ))}
        {/* Ground line */}
        <line x1={cx - R - 6} y1={cy} x2={cx + R + 6} y2={cy} stroke="#475569" strokeWidth={1.5} />
        {/* Zone boundary ticks */}
        {[10, 25, 50].map(deg => {
          const p = laAngleToXY(deg, R, cx, cy)
          const p2 = laAngleToXY(deg, R - 5, cx, cy)
          return <line key={deg} x1={p.x} y1={p.y} x2={p2.x} y2={p2.y} stroke="#475569" strokeWidth={1} />
        })}
        {/* Needle */}
        {needleEnd && (
          <line
            x1={cx} y1={cy}
            x2={needleEnd.x} y2={needleEnd.y}
            stroke={zone?.color ?? '#94a3b8'} strokeWidth={2.5} strokeLinecap="round"
          />
        )}
        {/* Origin dot */}
        <circle cx={cx} cy={cy} r={3} fill="#94a3b8" />
      </svg>
    </div>
  )
}

function PlayerHeader({ info, season, onSeasonChange }) {
  return (
    <div className="card-raised overflow-hidden">
      <div className="relative h-1 bg-gradient-to-r from-brand via-brand-light to-transparent" />
      <div className="p-6 flex items-start gap-6">
        {/* Headshot */}
        <div className="shrink-0">
          <img
            src={info.headshotUrl}
            alt={info.name}
            className="w-24 h-24 rounded-2xl object-cover bg-bg-elevated border border-bg-border"
            onError={(e) => {
              e.target.src = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/000000/headshot/67/current`
            }}
          />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-content-primary leading-tight">{info.name}</h1>
                {info.rosterStatus?.toLowerCase().includes('injured list') && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/25 uppercase tracking-wider self-center">
                    {info.rosterStatus.match(/(\d+)-day/i)?.[0] ?? 'IL'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {info.number && (
                  <span className="text-content-muted font-mono">#{info.number}</span>
                )}
                <span className="text-brand-light font-semibold">{info.positionName || info.position}</span>
                {info.team && (
                  <>
                    <span className="text-bg-border">·</span>
                    {info.teamId ? (
                      <Link to={`/team/${info.teamId}`} className="flex items-center gap-1.5 hover:underline">
                        <img
                          src={`https://www.mlbstatic.com/team-logos/${info.teamId}.svg`}
                          className="w-4 h-4 object-contain"
                          alt=""
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                        <span className="text-content-secondary">{info.team}</span>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-content-secondary">{info.team}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {/* Season selector */}
            <div className="flex items-center gap-2">
              <select
                value={season}
                onChange={(e) => onSeasonChange(Number(e.target.value))}
                className="bg-bg-elevated border border-bg-border text-content-primary text-sm rounded-lg px-3 py-1.5 outline-none focus:border-brand"
              >
                {SEASON_OPTIONS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-3 text-sm text-content-muted">
            {info.height && <span>{info.height}</span>}
            {info.weight && <span>{info.weight} lbs</span>}
            {info.batSide && <span>Bats {info.batSide}</span>}
            {info.pitchHand && <span>Throws {info.pitchHand}</span>}
            {info.currentAge && <span>{info.currentAge} years old</span>}
            {info.birthDate && <span>Born {info.birthDate}</span>}
            {info.mlbDebutDate && (
              <span>
                {(() => {
                  const debut = new Date(info.mlbDebutDate)
                  const now = new Date()
                  const years = now.getFullYear() - debut.getFullYear()
                  const m = now.getMonth() - debut.getMonth()
                  const y = m < 0 || (m === 0 && now.getDate() < debut.getDate()) ? years - 1 : years
                  return `${y} year${y !== 1 ? 's' : ''} MLB`
                })()}
              </span>
            )}
          </div>

          {info.awards?.length > 0 && (() => {
            const grouped = {}
            for (const award of info.awards) {
              if (!grouped[award.name]) grouped[award.name] = { name: award.name, seasons: [] }
              grouped[award.name].seasons.push(award.season)
            }
            return (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {Object.values(grouped).map(({ name, seasons }) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/25"
                    title={seasons.join(', ')}
                  >
                    {name}
                    {seasons.length > 1
                      ? <span className="text-amber-500/60 font-normal">×{seasons.length}</span>
                      : <span className="text-amber-500/60 font-normal">'{String(seasons[0]).slice(2)}</span>
                    }
                  </span>
                ))}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

function opsHeatColor(value) {
  const v = Number(value)
  if (!Number.isFinite(v)) return null
  if (v >= 0.900) return 'var(--color-stat-elite)'
  if (v >= 0.800) return 'var(--color-stat-great)'
  if (v >= 0.700) return 'var(--color-stat-avg)'
  if (v >= 0.600) return 'var(--color-stat-below)'
  return 'var(--color-stat-poor)'
}

function OpsHeatPill({ value }) {
  if (value == null) return <span className="font-mono text-content-secondary">-</span>
  const color = opsHeatColor(value)
  if (!color) return <span className="font-mono text-content-secondary">{value}</span>
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[13px] font-mono font-semibold"
      style={{ color, background: `color-mix(in oklch, ${color} 12%, transparent)` }}
    >
      {value}
    </span>
  )
}

function eraColor(value) {
  const v = Number(value)
  if (!Number.isFinite(v)) return null
  if (v <= 2.40) return 'var(--color-stat-elite)'
  if (v <= 3.10) return 'var(--color-stat-great)'
  if (v <= 3.80) return 'var(--color-stat-avg)'
  if (v <= 4.50) return 'var(--color-stat-below)'
  return 'var(--color-stat-poor)'
}

function EraHeatPill({ value }) {
  if (value == null) return <span className="font-mono text-content-secondary">-</span>
  const color = eraColor(value)
  if (!color) return <span className="font-mono text-content-secondary">{value}</span>
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[13px] font-mono font-semibold"
      style={{ color, background: `color-mix(in oklch, ${color} 12%, transparent)` }}
    >
      {value}
    </span>
  )
}

function CareerStatsTable({ playerId, group }) {
  const [showAll, setShowAll] = useState(false)
  const currentYear = String(new Date().getFullYear())

  const { data: career, isLoading } = useQuery({
    queryKey: ['player-career', playerId, group],
    queryFn: () => api.stats.career(playerId, group),
    enabled: !!playerId,
    staleTime: 60 * 60 * 1000,
  })

  if (isLoading || !career?.length) return null

  const sorted = [...career].sort((a, b) => Number(b.season) - Number(a.season))
  const rows = showAll ? sorted : sorted.slice(0, 10)

  const fmtAvg = (v) => v != null ? String(v).replace(/^0\./, '.') : '-'
  const fmtDec = (v, d = 2) => v != null ? Number(v).toFixed(d) : '-'
  const fmtInt = (v) => v != null ? v : '-'

  const isHitting = group === 'hitting'

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em]">Year-by-Year</h3>
        {career.length > 10 && (
          <button className="text-xs text-brand-light hover:underline" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Show recent' : `Show all ${career.length} seasons`}
          </button>
        )}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-bg-border">
                {isHitting
                  ? ['Season', 'Age', 'G', 'PA', 'AVG', 'OBP', 'SLG', 'OPS', 'HR', 'RBI', 'SB', 'BB', 'K'].map(h => (
                      <th key={h} className={`px-3 py-2.5 text-[11px] text-content-muted font-semibold uppercase tracking-[0.08em] whitespace-nowrap ${h === 'Season' || h === 'Age' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))
                  : ['Season', 'Age', 'G', 'GS', 'IP', 'W', 'L', 'SV', 'ERA', 'WHIP', 'K', 'BB', 'K/9'].map(h => (
                      <th key={h} className={`px-3 py-2.5 text-[11px] text-content-muted font-semibold uppercase tracking-[0.08em] whitespace-nowrap ${h === 'Season' || h === 'Age' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))
                }
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isCurrent = r.season === currentYear
                return (
                  <tr
                    key={r.season}
                    className={`border-b border-bg-border/50 last:border-0 transition-colors ${isCurrent ? 'bg-brand/5' : 'hover:bg-bg-elevated'}`}
                  >
                    <td className={`px-3 py-2.5 whitespace-nowrap font-mono ${isCurrent ? 'text-brand font-semibold' : 'text-content-secondary'}`}>{r.season}</td>
                    <td className="px-3 py-2.5 text-content-muted">{fmtInt(r.age)}</td>
                    {isHitting ? (
                      <>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.gamesPlayed)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.plateAppearances)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtAvg(r.avg)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtAvg(r.obp)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtAvg(r.slg)}</td>
                        <td className="px-3 py-2.5 text-right"><OpsHeatPill value={r.ops} /></td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.homeRuns)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.rbi)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.stolenBases)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.baseOnBalls)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.strikeOuts)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.gamesPlayed)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.gamesStarted)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{r.inningsPitched ?? '-'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.wins)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.losses)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.saves)}</td>
                        <td className="px-3 py-2.5 text-right"><EraHeatPill value={r.era} /></td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtDec(r.whip)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.strikeOuts)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtInt(r.baseOnBalls)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-content-secondary">{fmtDec(r.strikeoutsPer9Inn)}</td>
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

function RecentGameLog({ group, rows = [] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? rows.slice(0, 30) : rows.slice(0, 10)

  const battingCols  = ['Date', 'Opp', 'Res', 'AB', 'H', 'HR', 'RBI', 'BB', 'K', 'SB', 'OPS']
  const pitchingCols = ['Date', 'Opp', 'Res', 'IP', 'ER', 'H', 'HR', 'BB', 'K', 'ERA', 'WHIP']
  const cols = group === 'pitching' ? pitchingCols : battingCols
  const numericCols = new Set(group === 'pitching'
    ? ['IP', 'ER', 'H', 'HR', 'BB', 'K', 'ERA', 'WHIP']
    : ['AB', 'H', 'HR', 'RBI', 'BB', 'K', 'SB', 'OPS'])

  const trendKey = group === 'pitching' ? 'era' : 'ops'
  const trendColor = group === 'pitching' ? '#EF4444' : '#6366F1'

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em]">Recent Game Log</h3>
          {rows.length > 2 && (
            <SparklineChart data={[...rows].reverse()} valueKey={trendKey} color={trendColor} width={64} height={22} />
          )}
        </div>
        {rows.length > 10 && (
          <button
            type="button"
            className="text-xs text-brand-light hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show 10' : 'Show 30'}
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-bg-border">
                {cols.map((h) => (
                  <th
                    key={h}
                    className={`px-3 py-3 text-[11px] text-content-muted font-semibold uppercase tracking-[0.08em] whitespace-nowrap ${numericCols.has(h) ? 'text-right' : 'text-left'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td className="px-3 py-5 text-content-muted" colSpan={cols.length}>No game log available for this season.</td>
                </tr>
              )}
              {visible.map((g) => (
                <tr key={`${g.gamePk}-${g.date}`} className="border-b border-bg-border last:border-0 hover:bg-bg-elevated transition-colors duration-100">
                  <td className="px-3 py-3 text-content-secondary whitespace-nowrap">{formatDateShort(g.date)}</td>
                  <td className="px-3 py-3 text-content-secondary whitespace-nowrap">{g.isHome ? 'vs' : '@'} {g.opponent || '-'}</td>
                  <td className="px-3 py-3 text-content-secondary whitespace-nowrap">{g.isWin ? 'W' : 'L'}</td>
                  {group === 'pitching' ? (
                    <>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.ip ?? '-'}</td>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.er ?? '-'}</td>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.h ?? '-'}</td>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.hr ?? '-'}</td>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.bb ?? '-'}</td>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.so ?? '-'}</td>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.era ?? '-'}</td>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.whip ?? '-'}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.ab ?? '-'}</td>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.h ?? '-'}</td>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.hr ?? '-'}</td>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.rbi ?? '-'}</td>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.bb ?? '-'}</td>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.so ?? '-'}</td>
                      <td className="px-3 py-3 text-right font-mono text-content-secondary whitespace-nowrap">{g.sb ?? '-'}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap"><OpsHeatPill value={g.ops} /></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function PlayerMetaCards({ info }) {
  const contract = info.contract

  if (!contract) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {contract && (
        <section className="card p-5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted">Contract</h2>
            <span className="text-[10px] text-content-muted">Source: {contract.source}</span>
          </div>
          <div className="space-y-2">
            {contract.summary && <p className="text-sm text-content-primary leading-relaxed">{contract.summary}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-bg-elevated border border-bg-border px-3 py-3">
                <div className="text-lg font-bold font-mono text-content-primary">{fmtMoney(contract.currentSeasonSalary)}</div>
                <div className="text-[10px] text-content-muted uppercase tracking-widest">Current Salary</div>
              </div>
              <div className="rounded-lg bg-bg-elevated border border-bg-border px-3 py-3">
                <div className="text-lg font-bold font-mono text-content-primary">{fmtMoney(contract.averageAnnualValue)}</div>
                <div className="text-[10px] text-content-muted uppercase tracking-widest">AAV</div>
              </div>
            </div>
            {contract.salariesBySeason?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bg-border text-content-muted text-xs">
                      <th className="text-left py-2">Season</th>
                      <th className="text-right py-2">Salary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contract.salariesBySeason.slice(0, 5).map((entry) => (
                      <tr key={entry.season} className="border-b border-bg-border/60 last:border-b-0">
                        <td className="py-2 text-content-secondary">{entry.season}</td>
                        <td className="py-2 text-right font-mono text-content-primary">{entry.value != null ? fmtMoney(entry.value) : (entry.label || '-')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

    </div>
  )
}

function BattingTab({ playerId, mlbStats, statcast, projection, gameLog, batSide }) {
  const [projSource, setProjSource] = useState('steamer')
  const season = new Date().getFullYear()

  const { data: steamerData } = useQuery({
    queryKey: ['proj-steamer-batting', playerId, season],
    queryFn: () => api.stats.projections(playerId, season, 'hitting', 'steamer'),
    enabled: projSource === 'steamer',
    staleTime: 30 * 60_000,
    retry: false,
  })
  const { data: zipsData } = useQuery({
    queryKey: ['proj-zips-batting', playerId, season],
    queryFn: () => api.stats.projections(playerId, season, 'hitting', 'zips'),
    enabled: projSource === 'zips',
    staleTime: 30 * 60_000,
    retry: false,
  })

  const activeProjection =
    projSource === 'steamer' ? normalizeMlbBattingProj(steamerData, 'steamer') :
    projSource === 'zips'    ? normalizeMlbBattingProj(zipsData,    'zips')    :
    projection

  const s = mlbStats || {}
  const sc = statcast?.summary || {}
  const p = activeProjection?.projections || {}
  const games = gameLog?.games || []

  const pa    = Number(s.plateAppearances) || 0
  const kPct  = pa > 0 ? (Number(s.strikeOuts)  / pa * 100) : null
  const bbPct = pa > 0 ? (Number(s.baseOnBalls) / pa * 100) : null
  const iso   = s.slg != null && s.avg != null ? (Number(s.slg) - Number(s.avg)) : null
  const kBbPct = kPct != null && bbPct != null ? (kPct - bbPct) : null
  const babipDenom = Number(s.atBats) - Number(s.strikeOuts) - Number(s.homeRuns) + Number(s.sacFlies || 0)
  const babip = babipDenom > 0 ? (Number(s.hits) - Number(s.homeRuns)) / babipDenom : null

  const fmtPct = v => v != null ? `${v.toFixed(1)}%` : null
  const gamesChronological = [...games].reverse().map(g => {
    const ab = Number(g.ab) || 0
    const h  = Number(g.h)  || 0
    const hr = Number(g.hr) || 0
    const so = Number(g.so) || 0
    const denom = ab - so - hr
    return { ...g, babip: denom > 0 ? (h - hr) / denom : null }
  })

  const fmt = (v, d = 3) => v != null ? Number(v).toFixed(d) : null

  const gaugeStats = [
    { label: 'Exit Velocity', value: sc.avgExitVelo != null ? `${sc.avgExitVelo} mph` : null, percentile: approxPercentile(sc.avgExitVelo, BATTING_THRESHOLDS.avgExitVelo) },
    { label: 'Hard Hit%',     value: sc.hardHitPct  != null ? `${sc.hardHitPct}%`  : null, percentile: approxPercentile(sc.hardHitPct,  BATTING_THRESHOLDS.hardHitPct) },
    { label: 'Barrel%',       value: sc.barrelPct   != null ? `${sc.barrelPct}%`   : null, percentile: approxPercentile(sc.barrelPct,   BATTING_THRESHOLDS.barrelPct) },
    { label: 'xwOBA',         value: fmt(sc.xwOBA),                                         percentile: approxPercentile(sc.xwOBA,       BATTING_THRESHOLDS.xwOBA) },
    { label: 'Sprint Speed',  value: sc.sprintSpeed != null ? `${sc.sprintSpeed} ft/s` : null, percentile: approxPercentile(sc.sprintSpeed, BATTING_THRESHOLDS.sprintSpeed) },
    { label: 'Pull%',         value: sc.pullPct != null ? `${sc.pullPct}%` : null,          percentile: approxPercentile(sc.pullPct, BATTING_THRESHOLDS.pullPct) },
    { label: 'Cent%',         value: sc.centPct != null ? `${sc.centPct}%` : null,          percentile: approxPercentile(sc.centPct, BATTING_THRESHOLDS.centPct) },
    { label: 'Oppo%',         value: sc.oppoPct != null ? `${sc.oppoPct}%` : null,          percentile: approxPercentile(sc.oppoPct, BATTING_THRESHOLDS.oppoPct) },
  ]

  return (
    <div className="space-y-6">
      {/* Traditional stats */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em]">Traditional</h3>
          <ProjSourcePicker value={projSource} onChange={setProjSource} />
        </div>
        <div className="space-y-4">
          {/* Slash line */}
          <div>
            <p className="text-[10px] text-content-muted/60 uppercase tracking-wider mb-2">Slash line</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard label="AVG" value={fmt(s.avg)} percentile={approxPercentile(s.avg, BATTING_THRESHOLDS.avg)} comparison={projectionComparison({ current: s.avg, projected: p.avg, decimals: 3 })} />
              <StatCard label="OBP" value={fmt(s.obp)} percentile={approxPercentile(s.obp, BATTING_THRESHOLDS.obp)} comparison={projectionComparison({ current: s.obp, projected: p.obp, decimals: 3 })} />
              <StatCard label="SLG" value={fmt(s.slg)} percentile={approxPercentile(s.slg, BATTING_THRESHOLDS.slg)} comparison={projectionComparison({ current: s.slg, projected: p.slg, decimals: 3 })} />
              <StatCard label="OPS" value={fmt(s.ops)} percentile={approxPercentile(s.ops, BATTING_THRESHOLDS.ops)} comparison={projectionComparison({ current: s.ops, projected: p.ops, decimals: 3 })} />
              <StatCard label="ISO" value={iso != null ? iso.toFixed(3) : null} percentile={approxPercentile(iso, BATTING_THRESHOLDS.iso)} />
              <StatCard label="BABIP" value={babip != null ? babip.toFixed(3) : null} percentile={approxPercentile(babip, BATTING_THRESHOLDS.babip)} />
            </div>
          </div>

          {/* Production */}
          <div>
            <p className="text-[10px] text-content-muted/60 uppercase tracking-wider mb-2">Production</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard label="HR" value={s.homeRuns} percentile={approxPercentile(s.homeRuns, BATTING_THRESHOLDS.homeRuns)} progress={projectionProgress({ current: s.homeRuns, projectedTotal: p.homeRuns })} />
              <StatCard label="RBI" value={s.rbi} percentile={approxPercentile(s.rbi, BATTING_THRESHOLDS.rbi)} progress={projectionProgress({ current: s.rbi, projectedTotal: p.rbi })} />
              <StatCard label="SB" value={s.stolenBases} percentile={approxPercentile(s.stolenBases, BATTING_THRESHOLDS.stolenBases)} progress={projectionProgress({ current: s.stolenBases, projectedTotal: p.stolenBases })} />
              <StatCard label="G" value={s.gamesPlayed} />
            </div>
          </div>

          {/* Plate discipline */}
          <div>
            <p className="text-[10px] text-content-muted/60 uppercase tracking-wider mb-2">Plate discipline</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard label="K%" value={fmtPct(kPct)} percentile={approxPercentile(kPct, BATTING_THRESHOLDS.kPct)} />
              <StatCard label="BB%" value={fmtPct(bbPct)} percentile={approxPercentile(bbPct, BATTING_THRESHOLDS.bbPct)} />
              <StatCard label="K-BB%" value={fmtPct(kBbPct)} percentile={approxPercentile(kBbPct, BATTING_THRESHOLDS.kBbPct)} />
              <StatCard label="K" value={s.strikeOuts} percentile={approxPercentile(s.strikeOuts, BATTING_THRESHOLDS.strikeOuts)} progress={projectionProgress({ current: s.strikeOuts, projectedTotal: p.strikeOuts })} />
              <StatCard label="BB" value={s.baseOnBalls} progress={projectionProgress({ current: s.baseOnBalls, projectedTotal: p.baseOnBalls })} />
            </div>
          </div>
        </div>
      </section>

      {/* Statcast */}
      <section>
        <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">Statcast</h3>
        {statcast?.error ? (
          <div className="card p-4 text-content-muted text-sm">Statcast data unavailable: {statcast.error}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <StatCard label="Exit Velo" value={sc.avgExitVelo} subtitle="avg mph" percentile={approxPercentile(sc.avgExitVelo, BATTING_THRESHOLDS.avgExitVelo)} />
            <StatCard label="Max EV" value={sc.maxExitVelo} subtitle="mph" />
            <StatCard label="Hard Hit%" value={sc.hardHitPct != null ? `${sc.hardHitPct}%` : null} percentile={approxPercentile(sc.hardHitPct, BATTING_THRESHOLDS.hardHitPct)} />
            <StatCard label="Barrel%" value={sc.barrelPct != null ? `${sc.barrelPct}%` : null} percentile={approxPercentile(sc.barrelPct, BATTING_THRESHOLDS.barrelPct)} />
            <StatCard label="xwOBA" value={fmt(sc.xwOBA)} percentile={approxPercentile(sc.xwOBA, BATTING_THRESHOLDS.xwOBA)} />
            <StatCard label="xBA" value={fmt(sc.xBA)} />
            <LaunchAngleCard angle={sc.avgLaunchAngle} />
            <StatCard label="Sweet Spot%" value={sc.sweetSpotPct != null ? `${sc.sweetSpotPct}%` : null} />
            <StatCard label="Sprint Speed" value={sc.sprintSpeed != null ? `${sc.sprintSpeed} ft/s` : null} percentile={approxPercentile(sc.sprintSpeed, BATTING_THRESHOLDS.sprintSpeed)} />
            <StatCard label="Bat Speed" value={sc.batSpeed != null ? `${sc.batSpeed} mph` : null} percentile={approxPercentile(sc.batSpeed, BATTING_THRESHOLDS.batSpeed)} />
            <StatCard label="Swing Length" value={sc.swingLength != null ? `${sc.swingLength} ft` : null} percentile={approxPercentile(sc.swingLength, BATTING_THRESHOLDS.swingLength)} />
            <StatCard label="Hard Swing%" value={sc.hardSwingRate != null ? `${sc.hardSwingRate}%` : null} subtitle="max effort" percentile={approxPercentile(sc.hardSwingRate, BATTING_THRESHOLDS.hardSwingRate)} />
            <StatCard label="Squared Up%" value={sc.squaredUpPerSwing != null ? `${sc.squaredUpPerSwing}%` : null} subtitle="per swing" percentile={approxPercentile(sc.squaredUpPerSwing, BATTING_THRESHOLDS.squaredUpPerSwing)} />
            <StatCard label="Blast%" value={sc.blastPerSwing != null ? `${sc.blastPerSwing}%` : null} subtitle="hard + pure contact" percentile={approxPercentile(sc.blastPerSwing, BATTING_THRESHOLDS.blastPerSwing)} />
            <StatCard label="O-Swing%" value={sc.oSwingPct != null ? `${sc.oSwingPct}%` : null} subtitle="chase rate" percentile={approxPercentile(sc.oSwingPct, BATTING_THRESHOLDS.oSwingPct)} />
            <StatCard label="Z-Swing%" value={sc.zSwingPct != null ? `${sc.zSwingPct}%` : null} subtitle="in-zone rate" percentile={approxPercentile(sc.zSwingPct, BATTING_THRESHOLDS.zSwingPct)} />
            <StatCard label="Pull%" value={sc.pullPct != null ? `${sc.pullPct}%` : null} percentile={approxPercentile(sc.pullPct, BATTING_THRESHOLDS.pullPct)} />
            <StatCard label="Cent%" value={sc.centPct != null ? `${sc.centPct}%` : null} percentile={approxPercentile(sc.centPct, BATTING_THRESHOLDS.centPct)} />
            <StatCard label="Oppo%" value={sc.oppoPct != null ? `${sc.oppoPct}%` : null} percentile={approxPercentile(sc.oppoPct, BATTING_THRESHOLDS.oppoPct)} />
          </div>
        )}
      </section>

      {/* Statcast percentile gauges */}
      {gaugeStats.some(g => g.percentile != null) && (
        <section>
          <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">Statcast Percentiles</h3>
          <div className="card p-4">
            <PercentileGauge stats={gaugeStats} />
          </div>
        </section>
      )}

      {/* Spray chart + batting trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {statcast?.sprayData?.length > 0 && (
          <section>
            <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">Spray Chart</h3>
            <div className="card p-4">
              <SprayChart data={statcast.sprayData} batSide={batSide} />
            </div>
          </section>
        )}

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

      <RecentGameLog group="hitting" rows={games} />
      <CareerStatsTable playerId={playerId} group="hitting" />
      <PlayerTransactions playerId={playerId} />
    </div>
  )
}

function PitchingTab({ playerId, mlbStats, statcast, projection, gameLog, pitchHand }) {
  const [projSource, setProjSource] = useState('steamer')
  const season = new Date().getFullYear()

  const { data: steamerData } = useQuery({
    queryKey: ['proj-steamer-pitching', playerId, season],
    queryFn: () => api.stats.projections(playerId, season, 'pitching', 'steamer'),
    enabled: projSource === 'steamer',
    staleTime: 30 * 60_000,
    retry: false,
  })
  const { data: zipsData } = useQuery({
    queryKey: ['proj-zips-pitching', playerId, season],
    queryFn: () => api.stats.projections(playerId, season, 'pitching', 'zips'),
    enabled: projSource === 'zips',
    staleTime: 30 * 60_000,
    retry: false,
  })

  const activeProjection =
    projSource === 'steamer' ? normalizeMlbPitchingProj(steamerData, 'steamer') :
    projSource === 'zips'    ? normalizeMlbPitchingProj(zipsData,    'zips')    :
    projection

  const s = mlbStats || {}
  const p = activeProjection?.projections || {}
  const games = gameLog?.games || []
  const sc = statcast?.summary || {}
  const pitchTypes = (statcast?.pitchTypes || [])
    .filter(pitch => (Number(pitch?.count) || 0) > 0 || (Number(pitch?.usage) || 0) > 0)
    .sort((a, b) => ((Number(b?.count) || 0) - (Number(a?.count) || 0)) || ((Number(b?.usage) || 0) - (Number(a?.usage) || 0)))
    .slice(0, 4)
  const visiblePitchTypes = new Set(pitchTypes.map(pitch => pitch.type))
  const locationData = (statcast?.locationData || []).filter(pitch => visiblePitchTypes.has(pitch.type))
  const pitchOutcomes = Object.fromEntries(
    Object.entries(statcast?.pitchOutcomes || {}).filter(([type]) => visiblePitchTypes.has(type))
  )

  const fmt = (v, d = 2) => v != null ? Number(v).toFixed(d) : null
  const fmtPct = v => v != null ? `${v.toFixed(1)}%` : null

  const tbf    = Number(s.battersFaced) || 0
  const kPct   = tbf > 0 ? (Number(s.strikeOuts)  / tbf * 100) : null
  const bbPct  = tbf > 0 ? (Number(s.baseOnBalls) / tbf * 100) : null
  const kBbPct = kPct != null && bbPct != null ? (kPct - bbPct) : null

  const ip = Number(s.inningsPitched) || 0
  // FIP = (13*HR + 3*BB - 2*K) / IP + 3.10  (simplified, no HBP)
  const fip = ip > 0 && s.homeRuns != null
    ? ((13 * Number(s.homeRuns) + 3 * Number(s.baseOnBalls) - 2 * Number(s.strikeOuts)) / ip + 3.10)
    : null

  const pitchGaugeStats = [
    { label: 'ERA',       value: fmt(s.era),   percentile: approxPercentile(s.era,   PITCHING_THRESHOLDS.era) },
    { label: 'WHIP',      value: fmt(s.whip),  percentile: approxPercentile(s.whip,  PITCHING_THRESHOLDS.whip) },
    { label: 'K/9',       value: fmt(s.strikeoutsPer9Inn), percentile: approxPercentile(s.strikeoutsPer9Inn, PITCHING_THRESHOLDS.strikeoutsPer9Inn) },
    { label: 'BB/9',      value: fmt(s.walksPer9Inn),      percentile: approxPercentile(s.walksPer9Inn, PITCHING_THRESHOLDS.walksPer9Inn) },
  ]

  return (
    <div className="space-y-6">
      {/* Traditional */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em]">Traditional</h3>
          <ProjSourcePicker value={projSource} onChange={setProjSource} />
        </div>
        <div className="space-y-4">
          {/* ERA-scale quality */}
          <div>
            <p className="text-[10px] text-content-muted/60 uppercase tracking-wider mb-2">Quality</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard label="ERA"  value={fmt(s.era)}  percentile={approxPercentile(s.era,  PITCHING_THRESHOLDS.era)}  comparison={projectionComparison({ current: s.era,  projected: p.era,  inverse: true, decimals: 2 })} />
              <StatCard label="FIP"  value={fip != null ? fip.toFixed(2) : null} percentile={approxPercentile(fip, PITCHING_THRESHOLDS.fip)} />
              <StatCard label="WHIP" value={fmt(s.whip)} percentile={approxPercentile(s.whip, PITCHING_THRESHOLDS.whip)} comparison={projectionComparison({ current: s.whip, projected: p.whip, inverse: true, decimals: 2 })} />
              <StatCard label="H/9"  value={fmt(s.hitsPer9Inn)}      percentile={approxPercentile(s.hitsPer9Inn,      PITCHING_THRESHOLDS.hitsPer9Inn)} />
              <StatCard label="HR/9" value={fmt(s.homeRunsPer9Inn)}   percentile={approxPercentile(s.homeRunsPer9Inn,  PITCHING_THRESHOLDS.homeRunsPer9Inn)} />
            </div>
          </div>

          {/* Volume */}
          <div>
            <p className="text-[10px] text-content-muted/60 uppercase tracking-wider mb-2">Volume</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard label="IP" value={fmt(s.inningsPitched, 1)} progress={projectionProgress({ current: Number(s.inningsPitched), projectedTotal: p.inningsPitched })} />
              <StatCard label="GS" value={s.gamesStarted} />
              <StatCard label="W"  value={s.wins}   percentile={approxPercentile(s.wins, PITCHING_THRESHOLDS.wins)} progress={projectionProgress({ current: s.wins,   projectedTotal: p.wins })} />
              <StatCard label="L"  value={s.losses} />
              <StatCard label="SV" value={s.saves}  progress={projectionProgress({ current: s.saves, projectedTotal: p.saves })} />
            </div>
          </div>

          {/* Stuff & command */}
          <div>
            <p className="text-[10px] text-content-muted/60 uppercase tracking-wider mb-2">Stuff &amp; command</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard label="K%"    value={fmtPct(kPct)}   percentile={approxPercentile(kPct,   PITCHING_THRESHOLDS.kPct)} />
              <StatCard label="BB%"   value={fmtPct(bbPct)}  percentile={approxPercentile(bbPct,  PITCHING_THRESHOLDS.bbPct)} />
              <StatCard label="K-BB%" value={fmtPct(kBbPct)} percentile={approxPercentile(kBbPct, PITCHING_THRESHOLDS.kBbPct)} />
              <StatCard label="K/9"   value={fmt(s.strikeoutsPer9Inn)} percentile={approxPercentile(s.strikeoutsPer9Inn, PITCHING_THRESHOLDS.strikeoutsPer9Inn)} />
              <StatCard label="BB/9"  value={fmt(s.walksPer9Inn)}      percentile={approxPercentile(s.walksPer9Inn,      PITCHING_THRESHOLDS.walksPer9Inn)} />
              <StatCard label="K"     value={s.strikeOuts} percentile={approxPercentile(s.strikeOuts, PITCHING_THRESHOLDS.strikeOuts)} progress={projectionProgress({ current: s.strikeOuts, projectedTotal: p.strikeOuts })} />
              <StatCard label="BB"    value={s.baseOnBalls} progress={projectionProgress({ current: s.baseOnBalls, projectedTotal: p.baseOnBalls })} />
            </div>
          </div>
        </div>
      </section>

      {/* Season percentile gauges */}
      {pitchGaugeStats.some(g => g.percentile != null) && (
        <section>
          <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">Season Percentiles</h3>
          <div className="card p-4">
            <PercentileGauge stats={pitchGaugeStats} />
          </div>
        </section>
      )}

      {/* Statcast arsenal */}
      {statcast?.error ? (
        <div className="card p-4 text-content-muted text-sm">Statcast data unavailable: {statcast.error}</div>
      ) : pitchTypes.length > 0 ? (
        <>
          <section>
            <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">
              Pitch Arsenal · {statcast.totalPitches?.toLocaleString()} pitches
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="card p-4 flex flex-col">
                <div className="text-xs text-content-muted mb-3">Usage</div>
                <PitchMixChart pitchTypes={pitchTypes} />
              </div>
              <div className="card p-4">
                <div className="text-xs text-content-muted mb-3">Pitch Location</div>
                <PitchLocationChart
                  locationData={locationData}
                  pitchTypes={pitchTypes}
                  pitchHand={pitchHand}
                />
              </div>
            </div>
          </section>

          {/* Pitch metric bars + Sankey outcome flow */}
          <section>
            <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">Pitch Metrics</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card p-4">
                <div className="text-xs text-content-muted mb-3">Whiff%</div>
                <PitchBarChart pitchTypes={pitchTypes} metric="whiffRate" format={v => `${v.toFixed(1)}%`} />
              </div>
              <div className="card p-4">
                <div className="text-xs text-content-muted mb-3">Avg Velocity</div>
                <PitchBarChart pitchTypes={pitchTypes} metric="avgVelo" format={v => `${v.toFixed(1)}`} />
              </div>
            </div>
          </section>

          {/* Pitch outcome Sankey */}
          {Object.keys(pitchOutcomes).length > 0 && (
            <section>
              <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">
                Pitch Outcome Flow
                <span className="ml-2 font-normal normal-case text-[10px]">(balls and strikes only)</span>
              </h3>
              <div className="card p-4">
                <SankeyChart pitchOutcomes={pitchOutcomes} />
              </div>
            </section>
          )}

          {/* Pitch-by-pitch table */}
          <section>
            <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">Pitch Breakdown</h3>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bg-border">
                      {['Pitch', 'Usage', 'Velo', 'Spin', 'Break', 'Whiff%'].map((h) => (
                        <th key={h} className="text-left text-xs text-content-muted font-medium uppercase tracking-wider px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pitchTypes.map((p) => (
                      <tr key={p.type} className="border-b border-bg-border/50 hover:bg-bg-elevated transition-colors">
                        <td className="px-4 py-3 font-medium text-content-primary">{p.name}</td>
                        <td className="px-4 py-3 font-mono text-content-secondary">{p.usage?.toFixed(1)}%</td>
                        <td className="px-4 py-3 font-mono text-content-secondary">{p.avgVelo ?? '—'}</td>
                        <td className="px-4 py-3 font-mono text-content-secondary">{p.avgSpin ? Math.round(p.avgSpin) : '—'}</td>
                        <td className="px-4 py-2">
                          <PitchBreakArrow name={p.name} hBreak={p.hBreak} vBreak={p.vBreak} movementPercentile={p.movementPercentile} />
                        </td>
                        <td className="px-4 py-3 font-mono text-content-secondary">{p.whiffRate != null ? `${p.whiffRate}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="card p-6 text-content-muted text-sm text-center">
          No Statcast data found for this season. Try selecting a different season.
        </div>
      )}

      {games.length > 3 && (
        <section>
          <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">
            ERA Trend
            <span className="ml-2 font-normal normal-case text-[10px]">(rolling {Math.min(games.length, 10)}-start avg)</span>
          </h3>
          <div className="card p-4">
            <RollingAverageChart
              data={[...games].reverse()}
              valueKey="era"
              valueLabel="ERA"
              color="#EF4444"
              windowSize={5}
            />
          </div>
        </section>
      )}

      <RecentGameLog group="pitching" rows={games} />
      <CareerStatsTable playerId={playerId} group="pitching" />
      <PlayerTransactions playerId={playerId} />
    </div>
  )
}

function PlayerNewsPanel({ playerName }) {
  const { data, isLoading } = useQuery({
    queryKey: ['player-news', playerName],
    queryFn: () => api.news.forPlayer(playerName),
    enabled: !!playerName,
    staleTime: 10 * 60 * 1000,
  })

  const items = data?.items || []
  if (!isLoading && !items.length) return null

  function relTime(ts) {
    try { return formatDistanceToNow(parseISO(ts), { addSuffix: true }) } catch { return '' }
  }

  const SOURCE_COLOR = {
    rotowire:  'text-purple-400',
    mlbtr:     'text-orange-400',
    mlb:       'text-blue-400',
    fangraphs: 'text-green-500',
    reddit:    'text-rose-400',
  }

  return (
    <section>
      <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">News &amp; Updates</h3>
      <div className="card divide-y divide-bg-border">
        {isLoading ? (
          <div className="p-4 space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => <div key={i} className="h-4 bg-bg-elevated rounded" />)}
          </div>
        ) : (
          items.slice(0, 8).map((item) => (
            <div key={item.id} className="p-3.5 flex gap-3 items-start">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${SOURCE_COLOR[item.sourceKey] ?? 'text-content-muted'}`}>
                    {item.source}
                  </span>
                  {item.injury && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-red-400 bg-red-400/10 border border-red-400/20 px-1.5 py-0.5 rounded">
                      {[item.injury.part, item.injury.list].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  <span className="text-[10px] text-content-muted">{relTime(item.publishedAt)}</span>
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm font-medium text-content-primary hover:text-brand transition-colors leading-snug"
                >
                  {item.title}
                </a>
                {item.summary && (
                  <p className="text-xs text-content-muted leading-relaxed line-clamp-2">{item.summary}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function PlayerTransactions({ playerId }) {
  const startDate = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
  const endDate   = new Date().toISOString().slice(0, 10)

  const { data, isLoading } = useQuery({
    queryKey: ['player-transactions', playerId],
    queryFn: () => api.transactions.list({ playerId, startDate, endDate, limit: 20 }),
    enabled: !!playerId,
    staleTime: 10 * 60 * 1000,
  })

  const transactions = data?.transactions || []
  if (!isLoading && !transactions.length) return null

  return (
    <section>
      <h3 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">Transactions</h3>
      <div className="card p-4">
        <TransactionsList
          transactions={transactions}
          loading={isLoading}
          showPlayer={false}
          emptyLabel="No transactions this season."
        />
      </div>
    </section>
  )
}

function FieldingTab({ mlbStats }) {
  const s = mlbStats || {}
  const fmt = (v, d = 3) => v != null ? Number(v).toFixed(d) : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Fielding%" value={fmt(s.fielding)} />
        <StatCard label="Errors" value={s.errors} />
        <StatCard label="Putouts" value={s.putOuts} />
        <StatCard label="Assists" value={s.assists} />
        <StatCard label="Double Plays" value={s.doublePlays} />
        <StatCard label="Innings" value={s.innings ? Number(s.innings).toFixed(1) : null} />
      </div>
      <div className="card p-4 text-sm text-content-muted text-center">
        Advanced fielding metrics (OAA, DRS) require Baseball Savant / Baseball Reference integration.
      </div>
    </div>
  )
}

// -------------------------------------------------------------------
// Main profile component
// -------------------------------------------------------------------

function FantasyStats({ playerId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['player-fantasy', playerId],
    queryFn: () => api.players.fantasy(playerId),
    enabled: !!playerId,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return null
  if (!data?.found) return null

  const breakdown = Array.isArray(data.weekPointsBreakdown) ? data.weekPointsBreakdown : []
  const dailyStats = Array.isArray(data.dailyStats) ? data.dailyStats : []

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted">
          Fantasy
        </h2>
        <span className="text-[10px] text-content-muted">Yahoo Fantasy</span>
      </div>

      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-sm text-content-muted">Today:</span>
          <span className="text-lg font-bold font-mono text-content-primary">{Number(data.dailyPoints || 0).toFixed(1)}<span className="text-sm font-normal text-content-muted ml-0.5">pts</span></span>
          {data.seasonPoints != null && (
            <span className="text-xs text-content-muted ml-auto">{Number(data.seasonPoints).toFixed(1)} season</span>
          )}
        </div>
        {dailyStats.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {dailyStats.map((stat) => (
              <div key={stat.stat_id} className="rounded-lg bg-bg-elevated border border-bg-border px-2 py-1.5">
                <div className="text-xs font-mono font-semibold text-content-primary">
                  {stat.value}<span className="text-[10px] text-content-muted font-normal ml-0.5">({stat.points})</span>
                </div>
                <div className="text-[9px] text-content-muted">{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {breakdown.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-content-muted">This Week</div>
          <div className="flex rounded-lg border border-bg-border overflow-hidden">
            {breakdown.map((entry, idx) => {
              const d = new Date(entry.date + 'T00:00:00')
              const label = Number.isNaN(d.getTime()) ? entry.date : `${d.getMonth() + 1}/${d.getDate()}`
              return (
                <div
                  key={entry.date}
                  className={`flex-1 text-center py-2 px-1 ${entry.date === data.scoringDate ? 'bg-brand/10' : 'bg-bg-elevated'} ${idx < breakdown.length - 1 ? 'border-r border-bg-border' : ''}`}
                >
                  <div className="text-[9px] text-content-muted">{label}</div>
                  <div className="text-xs font-semibold text-content-primary mt-0.5">{Number(entry.points || 0).toFixed(1)}</div>
                </div>
              )
            })}
            <div className="flex-none w-16 text-center py-2 px-1 bg-bg-elevated border-l border-bg-border">
              <div className="text-[9px] text-content-muted">Total</div>
              <div className="text-xs font-semibold text-brand mt-0.5">{Number(data.weeklyPoints || 0).toFixed(1)}</div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function ProjectionsTab({ playerId, isPitcher }) {
  const qc = useQueryClient()
  const [scenarioId, setScenarioId] = useState(null)
  const [projType, setProjType] = useState('rest_of_season')

  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: api.scenarios.list,
    staleTime: 60_000,
  })

  const queryKey = ['projection-player', playerId, scenarioId, projType]

  const { data: proj, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => api.projections.player(playerId, { scenarioId, type: projType }),
    enabled: !!playerId,
    staleTime: 5 * 60_000,
  })

  const recompute = useMutation({
    mutationFn: () => api.projections.player(playerId, { scenarioId, type: projType, refresh: true }),
    onSuccess: (data) => qc.setQueryData(queryKey, data),
  })

  const stats = proj?.projected_stats || {}
  const components = proj?.component_stats || {}

  const activeScenario = scenarios.find((s) => s.id === (scenarioId ?? null))
    || scenarios.find((s) => s.is_default)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-content-muted text-sm">
        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        Computing projection…
      </div>
    )
  }

  if (isError || proj?.error) {
    return (
      <div className="card p-8 text-center text-content-muted text-sm">
        {proj?.error || 'No projection available. This player may have insufficient historical data.'}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={scenarioId ?? ''}
          onChange={(e) => setScenarioId(e.target.value ? Number(e.target.value) : null)}
          className="bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>{s.name}{s.is_default ? ' (default)' : ''}</option>
          ))}
        </select>
        <div className="flex rounded-md border border-bg-border overflow-hidden">
          {[['rest_of_season', 'Rest of Season'], ['full_season', 'Full Season']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setProjType(val)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${projType === val ? 'tab-active' : 'tab-inactive'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {proj?.ran_at && !recompute.isPending && (
            <span className="text-xs text-content-muted">
              Last run {new Date(proj.ran_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}
          <button
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-light disabled:opacity-50 transition-colors"
          >
            {recompute.isPending ? (
              <>
                <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                Computing…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Recompute
              </>
            )}
          </button>
          <Link to="/projections/scenarios" className="text-xs text-brand hover:underline">
            Edit scenarios
          </Link>
        </div>
      </div>

      {activeScenario?.description && (
        <p className="text-sm text-content-muted">{activeScenario.description}</p>
      )}
      {recompute.isError && (
        <p className="text-xs text-red-500">Recompute failed: {recompute.error?.message}</p>
      )}

      {/* Projected stat line */}
      {!isPitcher ? (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide">Projected Stats</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="AVG"   value={stats.avg?.toFixed(3)}   percentile={approxPercentile(stats.avg, BATTING_THRESHOLDS.avg)} />
            <StatCard label="OBP"   value={stats.obp?.toFixed(3)}   percentile={approxPercentile(stats.obp, BATTING_THRESHOLDS.obp)} />
            <StatCard label="SLG"   value={stats.slg?.toFixed(3)}   percentile={approxPercentile(stats.slg, BATTING_THRESHOLDS.slg)} />
            <StatCard label="wRC+"  value={stats.wrc_plus?.toFixed(0)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="PA"    value={stats.pa} />
            <StatCard label="HR"    value={stats.hr} />
            <StatCard label="RBI"   value={stats.rbi} />
            <StatCard label="wOBA"  value={stats.woba?.toFixed(3)} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide">Projected Stats</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="ERA"   value={stats.era?.toFixed(2)}  percentile={approxPercentile(stats.era, PITCHING_THRESHOLDS.era)}  invert />
            <StatCard label="FIP"   value={stats.fip?.toFixed(2)}  />
            <StatCard label="xFIP"  value={stats.xfip?.toFixed(2)} />
            <StatCard label="WHIP"  value={stats.whip?.toFixed(2)} percentile={approxPercentile(stats.whip, PITCHING_THRESHOLDS.whip)} invert />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="IP"    value={stats.ip} />
            <StatCard label="K/9"   value={stats.k9?.toFixed(1)} />
            <StatCard label="BB/9"  value={stats.bb9?.toFixed(1)} />
            <StatCard label="K%"    value={stats.k_pct ? `${(stats.k_pct * 100).toFixed(1)}%` : '—'} />
          </div>
        </div>
      )}

      {/* Component breakdown */}
      {Object.keys(components).length > 0 && (
        <div className="card p-4 space-y-3">
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide">Projection Components</h3>
          <p className="text-xs text-content-muted">
            These are the underlying rates the engine projected, before being derived into the final stat line.
            Regression to mean, age curve, and Statcast blending have all been applied.
          </p>
          <div className="flex flex-wrap gap-4 pt-1">
            {Object.entries(components)
              .filter(([k]) => COMPONENT_LABELS_PP[k])
              .map(([key, val]) => (
                <div key={key} className="text-center min-w-[64px]">
                  <div className="text-[10px] text-content-muted uppercase tracking-wide">{COMPONENT_LABELS_PP[key]}</div>
                  <div className="font-mono text-sm font-semibold text-content-primary mt-0.5">
                    {typeof val === 'number' ? (COMPONENT_FMTS_PP[key]?.(val) ?? val.toFixed(2)) : '—'}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* System comparison */}
      {proj && !proj.error && (
        <div className="card p-4">
          <SystemComparison
            playerId={playerId}
            playerType={isPitcher ? 'pitcher' : 'batter'}
            ourStats={stats}
          />
        </div>
      )}

      {/* Scenario params summary */}
      {activeScenario && (
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-3">Scenario Parameters</h3>
          <div className="flex flex-wrap gap-3 text-xs">
            {[
              ['Year weights', `${activeScenario.year1_weight}/${activeScenario.year2_weight}/${activeScenario.year3_weight}`],
              ['Regression', `${activeScenario.regression_factor}×`],
              ['Age curve', activeScenario.age_curve_enabled ? `on (${activeScenario.age_curve_factor}×)` : 'off'],
              ['Statcast', `${Math.round(activeScenario.statcast_weight * 100)}%`],
              ['Default PA', activeScenario.default_pa],
              ['Default IP', activeScenario.default_ip],
            ].map(([label, value]) => (
              <div key={label} className="bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5">
                <span className="text-content-muted">{label}: </span>
                <span className="font-mono font-medium text-content-primary">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PlayerProfile() {
  const { id } = useParams()
  const playerId = Number(id)
  const [season, setSeason] = useState(CURRENT_SEASON)
  const [activeTab, setActiveTab] = useState('batting')

  const { data: info, isLoading: loadingInfo } = useQuery({
    queryKey: ['player-info', playerId],
    queryFn: () => api.players.info(playerId),
    enabled: !!playerId,
  })

  useEffect(() => {
    if (!info) return

    const pos = info.position
    const isTwoWay = pos === 'TWP'
    const isPrimaryPitcher = ['SP', 'RP', 'P'].includes(pos)

    if (isPrimaryPitcher && !isTwoWay) {
      setActiveTab('pitching')
    } else {
      setActiveTab('batting')
    }
  }, [info?.id, info?.position])

  const { data: mlbStats, isLoading: loadingStats } = useQuery({
    queryKey: ['player-stats', playerId, season],
    queryFn: () => api.stats.season(playerId, season),
    enabled: !!playerId,
  })

  const isPitcher = info && ['SP', 'RP', 'P'].includes(info.position)

  const { data: statcastPitching, isLoading: loadingSCPitching } = useQuery({
    queryKey: ['statcast-pitching', playerId, season],
    queryFn: () => api.stats.statcastPitching(playerId, season),
    enabled: !!playerId && activeTab === 'pitching',
    staleTime: 15 * 60 * 1000,
  })

  const { data: statcastBatting, isLoading: loadingSCBatting } = useQuery({
    queryKey: ['statcast-batting', playerId, season],
    queryFn: () => api.stats.statcastBatting(playerId, season),
    enabled: !!playerId && activeTab === 'batting',
    staleTime: 15 * 60 * 1000,
  })

  const { data: battingLog, isLoading: loadingBattingLog } = useQuery({
    queryKey: ['player-game-log', playerId, season, 'hitting'],
    queryFn: () => api.stats.gameLog(playerId, season, 'hitting', 30),
    enabled: !!playerId && activeTab === 'batting',
    staleTime: 5 * 60 * 1000,
  })

  const { data: pitchingLog, isLoading: loadingPitchingLog } = useQuery({
    queryKey: ['player-game-log', playerId, season, 'pitching'],
    queryFn: () => api.stats.gameLog(playerId, season, 'pitching', 30),
    enabled: !!playerId && activeTab === 'pitching',
    staleTime: 5 * 60 * 1000,
  })

  const { data: rawCustomProj } = useQuery({
    queryKey: ['custom-proj-player', playerId],
    queryFn: () => api.projections.player(playerId, { type: 'rest_of_season' }),
    enabled: !!playerId,
    staleTime: 10 * 60 * 1000,
  })

  const customProj = normalizeCustomProj(rawCustomProj)
  const battingProjection  = customProj?.projections && rawCustomProj?.player_type === 'batter'  ? customProj : null
  const pitchingProjection = customProj?.projections && rawCustomProj?.player_type === 'pitcher' ? customProj : null

  const { data: fantasyData } = useQuery({
    queryKey: ['player-fantasy', playerId],
    queryFn: () => api.players.fantasy(playerId),
    enabled: !!playerId,
    staleTime: 5 * 60 * 1000,
  })

  if (loadingInfo) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="card h-36" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <div key={i} className="card h-20" />)}
        </div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="card p-16 text-center">
        <div className="flex justify-center mb-3">
          <svg className="w-8 h-8 text-content-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="7" r="3" strokeWidth="1.5"/>
            <path d="M6 21v-2a6 6 0 0 1 6-6v0a6 6 0 0 1 6 6v2" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M8 14l-2 3" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M16 14l2 3" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="text-content-secondary">Player not found.</div>
        <Link to="/" className="btn-primary mt-4 inline-block">Back to today</Link>
      </div>
    )
  }

  const tabs = [
    { id: 'batting', label: 'Batting' },
    { id: 'pitching', label: 'Pitching' },
    { id: 'fielding', label: 'Fielding' },
    { id: 'projections', label: 'Projections' },
  ]

  const loading = loadingStats || loadingSCPitching || loadingSCBatting || loadingBattingLog || loadingPitchingLog

  return (
    <div className="space-y-10 py-10">
      <PlayerHeader
        info={info}
        season={season}
        onSeasonChange={setSeason}
      />

      <ProspectCard playerId={playerId} />

      <PlayerNewsPanel playerName={info.name} />

      <FactoidsPanel
        queryKey={['player-factoids', playerId, season]}
        queryFn={() => api.factoids.player(playerId, season)}
      />

      <OttoneuPlayerPanel playerName={info.name} playerId={playerId} />

      {/* Tabs */}
      <div className="flex items-center border-b border-bg-border w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={activeTab === t.id ? 'tab-active' : 'tab-inactive'}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && activeTab !== 'fielding' && (
        <div className="flex items-center gap-2 text-content-muted text-sm">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          Loading stats…
        </div>
      )}

      {activeTab === 'batting' && (
        <BattingTab
          playerId={playerId}
          mlbStats={mlbStats?.hitting}
          statcast={statcastBatting}
          projection={battingProjection}
          gameLog={battingLog}
          batSide={info.batSide}
        />
      )}
      {activeTab === 'pitching' && (
        <PitchingTab
          playerId={playerId}
          mlbStats={mlbStats?.pitching}
          statcast={statcastPitching}
          projection={pitchingProjection}
          gameLog={pitchingLog}
          pitchHand={info.pitchHand}
        />
      )}
      {activeTab === 'fielding' && (
        <FieldingTab mlbStats={mlbStats?.fielding} />
      )}
      {activeTab === 'projections' && (
        <ProjectionsTab playerId={playerId} isPitcher={isPitcher} />
      )}

      {fantasyData?.found && <FantasyStats playerId={playerId} />}

      <PlayerMetaCards info={info} />
    </div>
  )
}
