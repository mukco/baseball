import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { SimBadge, SimSpinner } from '../components/sim/SimUI'

function pct(v) { return v == null ? '—' : `${(v * 100).toFixed(1)}%` }
function rate(v, d = 3) { return v == null ? '—' : v.toFixed(d) }
function timeAgo(iso) {
  if (!iso) return 'never'
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function Chip({ label, value }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-2 bg-bg-elevated rounded border border-bg-border min-w-[72px]">
      <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">{label}</span>
      <span className="text-sm font-mono font-bold text-content-primary">{value}</span>
    </div>
  )
}

function LeagueBaseline({ constants }) {
  const [open, setOpen] = useState(false)
  if (!constants) return null
  const b = constants.batter || {}
  const p = constants.pitcher || {}
  const l = constants.league || {}

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-bg-elevated/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold uppercase tracking-wider text-content-secondary">League Baseline</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-mono border border-brand/20">
            derived
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-content-muted">
            {constants.derived_at ? `updated ${timeAgo(constants.derived_at)}` : 'not yet derived'}
          </span>
          <span className="text-content-muted text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-bg-border">
          <p className="text-[11px] text-content-muted pt-3">
            These values are derived from the data warehouse and used as the simulation baseline.
            Multipliers like Run Environment scale against these numbers.
          </p>

          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Batters</div>
            <div className="flex flex-wrap gap-2">
              <Chip label="K%"     value={pct(b.k_pct)} />
              <Chip label="BB%"    value={pct(b.bb_pct)} />
              <Chip label="BABIP"  value={rate(b.babip)} />
              <Chip label="ISO"    value={rate(b.iso)} />
              <Chip label="HR/FB"  value={pct(b.hr_fb_pct)} />
              <Chip label="FB%"    value={pct(b.fb_pct)} />
              <Chip label="GB%"    value={pct(b.gb_pct)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Pitchers</div>
            <div className="flex flex-wrap gap-2">
              <Chip label="K%"    value={pct(p.k_pct)} />
              <Chip label="BB%"   value={pct(p.bb_pct)} />
              <Chip label="BABIP" value={rate(p.babip)} />
              <Chip label="HR/FB" value={pct(p.hr_fb_pct)} />
              <Chip label="GB%"   value={pct(p.gb_pct)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-content-muted">League</div>
            <div className="flex flex-wrap gap-2">
              <Chip label="wOBA"     value={rate(l.woba)} />
              <Chip label="RC/PA"    value={rate(l.rc_per_pa)} />
              <Chip label="FIP Const" value={rate(l.fip_constant, 2)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const PRESETS = [
  { key: 'realistic',    label: 'Realistic',      desc: 'MLB-accurate defaults' },
  { key: 'no_injuries',  label: 'No Injuries',    desc: 'Disable the injury system' },
  { key: 'chaos',        label: 'Chaos',          desc: 'High variance, injury-heavy' },
  { key: 'pitchers_era', label: "Pitcher's Era",  desc: 'Suppressed offense and HR' },
  { key: 'launch_angle', label: 'Launch Angle',   desc: 'Elevated HR and run scoring' },
]

const SECTIONS = [
  {
    title: 'Run Environment',
    fields: [
      { key: 'run_environment', label: 'Run Environment', type: 'range', min: 0.7, max: 1.5, step: 0.05,
        hint: '1.0 = MLB average. Lower = pitcher\'s era, higher = offensive explosion.' },
      { key: 'hr_environment', label: 'HR Rate', type: 'range', min: 0.5, max: 2.0, step: 0.1,
        hint: 'Multiplier on HR rate independent of general offense.' },
      { key: 'park_factor_strength', label: 'Park Factor Strength', type: 'range', min: 0.0, max: 1.0, step: 0.1,
        hint: '0 = neutral parks, 1 = full real-world park factors (Coors, Petco, etc).' },
      { key: 'variance', label: 'Variance / Luck', type: 'range', min: 0.3, max: 2.0, step: 0.1,
        hint: 'Low = chalk wins, high = upsets and wild swings.' },
    ],
  },
  {
    title: 'Injury System',
    fields: [
      { key: 'injury_rate', label: 'Injury Rate', type: 'range', min: 0.0, max: 3.0, step: 0.1,
        hint: '0 = disabled. 1.0 = MLB-realistic (~600 IL stints per season). 2+ = carnage.' },
      { key: 'injury_il_days_min', label: 'Min IL Days', type: 'number', min: 7, max: 30,
        hint: 'Shortest possible IL stint in days.' },
      { key: 'injury_il_days_max', label: 'Max IL Days', type: 'number', min: 15, max: 180,
        hint: 'Longest possible IL stint. Controls how often season-ending injuries occur.' },
    ],
  },
  {
    title: 'AI Manager',
    fields: [
      { key: 'ai_difficulty', label: 'AI Difficulty', type: 'select',
        options: [
          { value: 'stub',  label: 'Stub (current)' },
          { value: 'basic', label: 'Basic (coming soon)' },
          { value: 'sharp', label: 'Sharp (coming soon)' },
        ],
        hint: 'Controls how intelligently the AI manager makes in-game decisions. Only stub is active today.' },
    ],
  },
]

function RangeField({ fieldKey, def: fd, value, onChange }) {
  const num = Number(value ?? fd.min)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-content-primary">{fd.label}</label>
        <span className="text-sm font-mono font-bold text-brand tabular-nums w-12 text-right">
          {num.toFixed(fd.step < 0.1 ? 2 : 1)}
        </span>
      </div>
      <input
        type="range"
        min={fd.min} max={fd.max} step={fd.step}
        value={num}
        onChange={e => onChange(fieldKey, parseFloat(e.target.value))}
        className="w-full accent-brand h-1.5 rounded"
      />
      <div className="flex justify-between text-[10px] text-content-muted">
        <span>{fd.min}</span><span>{fd.max}</span>
      </div>
      {fd.hint && <p className="text-[11px] text-content-muted">{fd.hint}</p>}
    </div>
  )
}

function NumberField({ fieldKey, def: fd, value, onChange }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-content-primary block">{fd.label}</label>
      <input
        type="number"
        min={fd.min} max={fd.max}
        value={value ?? fd.min}
        onChange={e => onChange(fieldKey, parseInt(e.target.value, 10))}
        className="bg-bg-elevated border border-bg-border text-content-primary text-sm rounded px-3 py-1.5 outline-none focus:border-brand w-28 font-mono"
      />
      {fd.hint && <p className="text-[11px] text-content-muted">{fd.hint}</p>}
    </div>
  )
}

function SelectField({ fieldKey, def: fd, value, onChange }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-content-primary block">{fd.label}</label>
      <select
        value={value ?? fd.options[0].value}
        onChange={e => onChange(fieldKey, e.target.value)}
        className="bg-bg-elevated border border-bg-border text-content-primary text-sm rounded px-3 py-1.5 outline-none focus:border-brand"
      >
        {fd.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {fd.hint && <p className="text-[11px] text-content-muted">{fd.hint}</p>}
    </div>
  )
}

export default function SimulationConfig() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [localParams, setLocalParams] = useState(null)
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey:  ['sim-config', id],
    queryFn:   () => api.simulations.config(id),
    staleTime: 30_000,
    onSuccess: d => { if (!localParams) setLocalParams(d.params) },
  })

  const params = localParams || data?.params || {}

  const saveMutation = useMutation({
    mutationFn: () => api.simulations.updateConfig(id, params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sim-config', id] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const presetMutation = useMutation({
    mutationFn: (preset) => api.simulations.applyPreset(id, preset),
    onSuccess: (d) => {
      setLocalParams(d.params)
      qc.invalidateQueries({ queryKey: ['sim-config', id] })
    },
  })

  function handleChange(key, value) {
    setSaved(false)
    setLocalParams(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6 py-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to={`/simulation/${id}`} className="text-content-muted hover:text-brand transition-colors text-sm">
          ← League
        </Link>
        <SimBadge />
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-content-primary">Simulation Config</h1>
      </div>

      {isLoading ? <SimSpinner className="py-16" /> : (
        <>
          {/* Presets */}
          <div className="card p-4 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-content-secondary">Quick Presets</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => presetMutation.mutate(p.key)}
                  disabled={presetMutation.isPending}
                  title={p.desc}
                  className="px-3 py-1.5 text-xs font-bold border border-bg-border bg-bg-elevated text-content-secondary hover:text-brand hover:border-brand/40 rounded transition-colors disabled:opacity-50"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sections */}
          {SECTIONS.map(section => (
            <div key={section.title} className="card p-5 space-y-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-content-secondary border-b border-bg-border pb-2">
                {section.title}
              </h2>
              {section.fields.map(fd => {
                const props = { fieldKey: fd.key, def: fd, value: params[fd.key], onChange: handleChange }
                if (fd.type === 'range')  return <RangeField  key={fd.key} {...props} />
                if (fd.type === 'number') return <NumberField key={fd.key} {...props} />
                if (fd.type === 'select') return <SelectField key={fd.key} {...props} />
                return null
              })}
            </div>
          ))}

          {/* Save */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="btn-primary px-6 py-2 text-sm font-bold disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save Config'}
            </button>
            {saved && <span className="text-xs text-emerald-400 font-medium">Saved</span>}
            {saveMutation.isError && (
              <span className="text-xs text-red-400">{saveMutation.error?.message}</span>
            )}
          </div>

          <LeagueBaseline constants={data?.constants} />
        </>
      )}
    </div>
  )
}
