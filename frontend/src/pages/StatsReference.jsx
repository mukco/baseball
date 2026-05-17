import { useMemo, useState, useRef, useEffect } from 'react'
import { BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'
import { getAllStatHelp } from '../lib/statHelp'

const GROUPS = [
  {
    title: 'Batting',
    description: 'Core hitting production, rate stats, and batted-ball quality.',
    keys: ['avg', 'obp', 'slg', 'ops', 'wrcPlus', 'war', 'woba', 'xwoba', 'xba', 'homeRuns', 'rbi', 'stolenBases', 'plateAppearances', 'strikeouts', 'walks', 'kPct', 'bbPct', 'babip', 'hardHitPct', 'barrelPct', 'launchAngle', 'sweetSpotPct', 'exitVelo', 'maxExitVelo', 'sprintSpeed'],
  },
  {
    title: 'Pitching',
    description: 'Run prevention, strikeout-walk profile, and pitch-quality metrics.',
    keys: ['era', 'whip', 'fip', 'xfip', 'war', 'inningsPitched', 'wins', 'losses', 'saves', 'gamesStarted', 'kPer9', 'bbPer9', 'kPct', 'bbPct', 'kMinusBbPct', 'cswPct', 'gbPct', 'velocity', 'spinRate', 'horizontalBreak', 'verticalBreak', 'whiffPct'],
  },
  {
    title: 'Fielding',
    description: 'Basic defensive accounting stats used across player pages.',
    keys: ['fieldingPct', 'errors', 'putouts', 'assists', 'doublePlays', 'inningsFielding'],
  },
  {
    title: 'Team / Comparison',
    description: 'Composite edges used in matchup views and team comparisons.',
    keys: ['disciplineEdge', 'runPreventionEdge', 'contactQualityEdge'],
  },
]

const CALCULATORS = {
  avg: {
    inputs: [
      { key: 'h', label: 'Hits (H)', default: 30, min: 0, max: 300, step: 1 },
      { key: 'ab', label: 'At-Bats (AB)', default: 100, min: 1, max: 1000, step: 1 },
    ],
    compute: (v) => v.h / v.ab,
    format: (v) => v.toFixed(3),
    resultLabel: 'AVG',
    formula: (v) => `${v.h} / ${v.ab} = ${(v.h / v.ab).toFixed(3)}`,
  },
  obp: {
    inputs: [
      { key: 'h', label: 'Hits (H)', default: 30, min: 0, max: 300, step: 1 },
      { key: 'bb', label: 'Walks (BB)', default: 10, min: 0, max: 200, step: 1 },
      { key: 'hbp', label: 'HBP', default: 2, min: 0, max: 50, step: 1 },
      { key: 'ab', label: 'At-Bats (AB)', default: 100, min: 1, max: 1000, step: 1 },
      { key: 'sf', label: 'Sac Flies (SF)', default: 2, min: 0, max: 50, step: 1 },
    ],
    compute: (v) => (v.h + v.bb + v.hbp) / (v.ab + v.bb + v.hbp + v.sf),
    format: (v) => v.toFixed(3),
    resultLabel: 'OBP',
    formula: (v) => `(${v.h} + ${v.bb} + ${v.hbp}) / (${v.ab} + ${v.bb} + ${v.hbp} + ${v.sf}) = ${((v.h + v.bb + v.hbp) / (v.ab + v.bb + v.hbp + v.sf)).toFixed(3)}`,
  },
  slg: {
    inputs: [
      { key: 'tb', label: 'Total Bases (TB)', default: 40, min: 0, max: 600, step: 1 },
      { key: 'ab', label: 'At-Bats (AB)', default: 100, min: 1, max: 1000, step: 1 },
    ],
    compute: (v) => v.tb / v.ab,
    format: (v) => v.toFixed(3),
    resultLabel: 'SLG',
    formula: (v) => `${v.tb} / ${v.ab} = ${(v.tb / v.ab).toFixed(3)}`,
  },
  ops: {
    inputs: [
      { key: 'obp', label: 'OBP', default: 0.350, min: 0, max: 0.600, step: 0.005 },
      { key: 'slg', label: 'SLG', default: 0.450, min: 0, max: 1.000, step: 0.005 },
    ],
    compute: (v) => v.obp + v.slg,
    format: (v) => v.toFixed(3),
    resultLabel: 'OPS',
    formula: (v) => `${v.obp.toFixed(3)} + ${v.slg.toFixed(3)} = ${(v.obp + v.slg).toFixed(3)}`,
  },
  era: {
    inputs: [
      { key: 'er', label: 'Earned Runs (ER)', default: 30, min: 0, max: 200, step: 1 },
      { key: 'ip', label: 'Innings Pitched (IP)', default: 70, min: 1, max: 300, step: 0.1 },
    ],
    compute: (v) => (v.er / v.ip) * 9,
    format: (v) => v.toFixed(2),
    resultLabel: 'ERA',
    formula: (v) => `(${v.er} / ${v.ip}) x 9 = ${((v.er / v.ip) * 9).toFixed(2)}`,
  },
  whip: {
    inputs: [
      { key: 'bb', label: 'Walks (BB)', default: 20, min: 0, max: 200, step: 1 },
      { key: 'h', label: 'Hits (H)', default: 70, min: 0, max: 300, step: 1 },
      { key: 'ip', label: 'Innings Pitched (IP)', default: 70, min: 1, max: 300, step: 0.1 },
    ],
    compute: (v) => (v.bb + v.h) / v.ip,
    format: (v) => v.toFixed(2),
    resultLabel: 'WHIP',
    formula: (v) => `(${v.bb} + ${v.h}) / ${v.ip} = ${((v.bb + v.h) / v.ip).toFixed(2)}`,
  },
  babip: {
    inputs: [
      { key: 'h', label: 'Hits (H)', default: 50, min: 0, max: 300, step: 1 },
      { key: 'hr', label: 'Home Runs (HR)', default: 5, min: 0, max: 80, step: 1 },
      { key: 'ab', label: "At-Bats (AB)", default: 160, min: 1, max: 1000, step: 1 },
      { key: 'k', label: 'Strikeouts (K)', default: 30, min: 0, max: 400, step: 1 },
      { key: 'sf', label: 'Sac Flies (SF)', default: 3, min: 0, max: 50, step: 1 },
    ],
    compute: (v) => (v.h - v.hr) / (v.ab - v.k - v.hr + v.sf),
    format: (v) => v.toFixed(3),
    resultLabel: 'BABIP',
    formula: (v) => `(${v.h} - ${v.hr}) / (${v.ab} - ${v.k} - ${v.hr} + ${v.sf}) = ${((v.h - v.hr) / (v.ab - v.k - v.hr + v.sf)).toFixed(3)}`,
  },
  kPer9: {
    inputs: [
      { key: 'k', label: 'Strikeouts (K)', default: 80, min: 0, max: 400, step: 1 },
      { key: 'ip', label: 'Innings Pitched (IP)', default: 70, min: 1, max: 300, step: 0.1 },
    ],
    compute: (v) => (v.k / v.ip) * 9,
    format: (v) => v.toFixed(2),
    resultLabel: 'K/9',
    formula: (v) => `(${v.k} / ${v.ip}) x 9 = ${((v.k / v.ip) * 9).toFixed(2)}`,
  },
  bbPer9: {
    inputs: [
      { key: 'bb', label: 'Walks (BB)', default: 20, min: 0, max: 200, step: 1 },
      { key: 'ip', label: 'Innings Pitched (IP)', default: 70, min: 1, max: 300, step: 0.1 },
    ],
    compute: (v) => (v.bb / v.ip) * 9,
    format: (v) => v.toFixed(2),
    resultLabel: 'BB/9',
    formula: (v) => `(${v.bb} / ${v.ip}) x 9 = ${((v.bb / v.ip) * 9).toFixed(2)}`,
  },
  fip: {
    inputs: [
      { key: 'hr', label: 'HR Allowed', default: 8, min: 0, max: 60, step: 1 },
      { key: 'bb', label: 'Walks (BB)', default: 20, min: 0, max: 200, step: 1 },
      { key: 'hbp', label: 'HBP', default: 3, min: 0, max: 30, step: 1 },
      { key: 'k', label: 'Strikeouts (K)', default: 80, min: 0, max: 400, step: 1 },
      { key: 'ip', label: 'Innings Pitched (IP)', default: 70, min: 1, max: 300, step: 0.1 },
    ],
    compute: (v) => ((13 * v.hr + 3 * (v.bb + v.hbp) - 2 * v.k) / v.ip) + 3.2,
    format: (v) => v.toFixed(2),
    resultLabel: 'FIP',
    formula: (v) => `(13x${v.hr} + 3x(${v.bb}+${v.hbp}) - 2x${v.k}) / ${v.ip} + 3.2 = ${(((13 * v.hr + 3 * (v.bb + v.hbp) - 2 * v.k) / v.ip) + 3.2).toFixed(2)}`,
  },
  fieldingPct: {
    inputs: [
      { key: 'po', label: 'Putouts (PO)', default: 80, min: 0, max: 1000, step: 1 },
      { key: 'a', label: 'Assists (A)', default: 100, min: 0, max: 1000, step: 1 },
      { key: 'e', label: 'Errors (E)', default: 3, min: 0, max: 100, step: 1 },
    ],
    compute: (v) => (v.po + v.a) / (v.po + v.a + v.e),
    format: (v) => v.toFixed(3),
    resultLabel: 'Fielding%',
    formula: (v) => `(${v.po} + ${v.a}) / (${v.po} + ${v.a} + ${v.e}) = ${((v.po + v.a) / (v.po + v.a + v.e)).toFixed(3)}`,
  },
  kPct: {
    inputs: [
      { key: 'k', label: 'Strikeouts (K)', default: 50, min: 0, max: 400, step: 1 },
      { key: 'opp', label: 'Opportunities', default: 200, min: 1, max: 1000, step: 1 },
    ],
    compute: (v) => v.k / v.opp,
    format: (v) => (v * 100).toFixed(1) + '%',
    resultLabel: 'K%',
    formula: (v) => `${v.k} / ${v.opp} = ${(v.k / v.opp * 100).toFixed(1)}%`,
  },
  bbPct: {
    inputs: [
      { key: 'bb', label: 'Walks (BB)', default: 20, min: 0, max: 200, step: 1 },
      { key: 'opp', label: 'Opportunities', default: 200, min: 1, max: 1000, step: 1 },
    ],
    compute: (v) => v.bb / v.opp,
    format: (v) => (v * 100).toFixed(1) + '%',
    resultLabel: 'BB%',
    formula: (v) => `${v.bb} / ${v.opp} = ${(v.bb / v.opp * 100).toFixed(1)}%`,
  },
  hardHitPct: {
    inputs: [
      { key: 'hard', label: 'Hard-Hit Balls', default: 20, min: 0, max: 200, step: 1 },
      { key: 'total', label: 'Total Batted Balls', default: 60, min: 1, max: 500, step: 1 },
    ],
    compute: (v) => v.hard / v.total,
    format: (v) => (v * 100).toFixed(1) + '%',
    resultLabel: 'Hard Hit%',
    formula: (v) => `${v.hard} / ${v.total} = ${(v.hard / v.total * 100).toFixed(1)}%`,
  },
  barrelPct: {
    inputs: [
      { key: 'barrels', label: 'Barrels', default: 8, min: 0, max: 100, step: 1 },
      { key: 'total', label: 'Total Batted Balls', default: 60, min: 1, max: 500, step: 1 },
    ],
    compute: (v) => v.barrels / v.total,
    format: (v) => (v * 100).toFixed(1) + '%',
    resultLabel: 'Barrel%',
    formula: (v) => `${v.barrels} / ${v.total} = ${(v.barrels / v.total * 100).toFixed(1)}%`,
  },
  gbPct: {
    inputs: [
      { key: 'gb', label: 'Ground Balls', default: 30, min: 0, max: 200, step: 1 },
      { key: 'bip', label: 'Balls in Play', default: 70, min: 1, max: 500, step: 1 },
    ],
    compute: (v) => v.gb / v.bip,
    format: (v) => (v * 100).toFixed(1) + '%',
    resultLabel: 'GB%',
    formula: (v) => `${v.gb} / ${v.bip} = ${(v.gb / v.bip * 100).toFixed(1)}%`,
  },
  cswPct: {
    inputs: [
      { key: 'cs', label: 'Called Strikes', default: 25, min: 0, max: 200, step: 1 },
      { key: 'whiffs', label: 'Whiffs', default: 15, min: 0, max: 200, step: 1 },
      { key: 'pitches', label: 'Total Pitches', default: 150, min: 1, max: 500, step: 1 },
    ],
    compute: (v) => (v.cs + v.whiffs) / v.pitches,
    format: (v) => (v * 100).toFixed(1) + '%',
    resultLabel: 'CSW%',
    formula: (v) => `(${v.cs} + ${v.whiffs}) / ${v.pitches} = ${((v.cs + v.whiffs) / v.pitches * 100).toFixed(1)}%`,
  },
  whiffPct: {
    inputs: [
      { key: 'whiffs', label: 'Whiffs', default: 15, min: 0, max: 200, step: 1 },
      { key: 'swings', label: 'Total Swings', default: 80, min: 1, max: 400, step: 1 },
    ],
    compute: (v) => v.whiffs / v.swings,
    format: (v) => (v * 100).toFixed(1) + '%',
    resultLabel: 'Whiff%',
    formula: (v) => `${v.whiffs} / ${v.swings} = ${(v.whiffs / v.swings * 100).toFixed(1)}%`,
  },
}

function StatCalculator({ statKey }) {
  const config = CALCULATORS[statKey]
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState(() => {
    if (!config) return {}
    const initial = {}
    config.inputs.forEach((input) => { initial[input.key] = input.default })
    return initial
  })

  if (!config) return null

  function update(key, raw) {
    const parsed = parseFloat(raw)
    if (Number.isFinite(parsed)) {
      setValues((prev) => ({ ...prev, [key]: parsed }))
    }
  }

  const result = config.compute(values)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-brand-light hover:underline mt-2"
      >
        {open ? 'Close calculator' : 'Play with the formula'}
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-bg-elevated border border-bg-border p-3 space-y-2">
          <div className="text-xs text-content-muted font-mono">
            {config.formula(values)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {config.inputs.map((input) => (
              <div key={input.key}>
                <label className="text-[10px] text-content-muted block mb-0.5">{input.label}</label>
                <input
                  type="number"
                  value={values[input.key] ?? ''}
                  onChange={(e) => update(input.key, e.target.value)}
                  min={input.min}
                  max={input.max}
                  step={input.step}
                  className="w-full bg-bg-base border border-bg-border rounded px-2 py-1 text-sm text-content-primary font-mono outline-none focus:border-brand"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-content-muted uppercase tracking-wider font-semibold">{config.resultLabel}</span>
            <span className="text-lg font-bold font-mono text-content-primary">{config.format(result)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ stat }) {
  return (
    <article className="card p-5 space-y-3 h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-content-primary">{stat.label}</h3>
          <p className="mt-1 text-sm text-content-secondary">{stat.definition}</p>
        </div>
      </div>

      {stat.formulaLatex ? (
        <div className="rounded-lg bg-bg-elevated px-3 py-2 overflow-x-auto">
          <BlockMath math={stat.formulaLatex} />
        </div>
      ) : stat.formula ? (
        <div className="rounded-lg bg-bg-elevated px-3 py-2 text-sm text-content-muted">
          {stat.formula}
        </div>
      ) : null}

      {stat.intuition && (
        <div className="rounded-lg bg-brand/5 border border-brand/10 px-3 py-2 text-sm text-content-secondary leading-relaxed">
          <span className="font-semibold text-brand text-[10px] uppercase tracking-wider mr-1">Intuition:</span>
          {stat.intuition}
        </div>
      )}

      <p className="text-sm text-content-muted">{stat.interpretation}</p>

      <StatCalculator statKey={stat.key} />
    </article>
  )
}

function useDragScroll() {
  const ref = useRef(null)
  const state = useRef({ dragging: false, startY: 0, scrollTop: 0, moved: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function onDown(e) {
      if (e.button !== 0) return
      state.current = { dragging: true, startY: e.clientY, scrollTop: el.scrollTop, moved: false }
      el.style.cursor = 'grabbing'
    }

    function onMove(e) {
      if (!state.current.dragging) return
      const dy = e.clientY - state.current.startY
      if (Math.abs(dy) > 3) state.current.moved = true
      el.scrollTop = state.current.scrollTop - dy
    }

    function onUp() {
      state.current.dragging = false
      el.style.cursor = 'grab'
    }

    // Prevent click events on children if we dragged
    function onClickCapture(e) {
      if (state.current.moved) {
        e.stopPropagation()
        state.current.moved = false
      }
    }

    el.addEventListener('mousedown', onDown)
    el.addEventListener('click', onClickCapture, true)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)

    return () => {
      el.removeEventListener('mousedown', onDown)
      el.removeEventListener('click', onClickCapture, true)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return ref
}

export default function StatsReference() {
  const [query, setQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState(GROUPS[0].title)
  const allStats = useMemo(() => getAllStatHelp(), [])
  const normalizedQuery = query.trim().toLowerCase()
  const scrollRef = useDragScroll()

  const sections = useMemo(() => {
    return GROUPS.map((group) => {
      const stats = group.keys
        .map((key) => allStats.find((stat) => stat.key === key))
        .filter(Boolean)
        .filter((stat) => {
          if (!normalizedQuery) return true
          const haystack = [stat.label, stat.definition, stat.formula, stat.interpretation, stat.intuition]
            .filter(Boolean).join(' ').toLowerCase()
          return haystack.includes(normalizedQuery)
        })
      return { ...group, stats }
    })
  }, [allStats, normalizedQuery])

  // When searching, show all sections; otherwise show active tab
  const visibleSections = normalizedQuery
    ? sections.filter(s => s.stats.length > 0)
    : sections.filter(s => s.title === activeGroup)

  const totalVisible = visibleSections.reduce((sum, s) => sum + s.stats.length, 0)

  return (
    <div className="flex flex-col py-6" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Header */}
      <div className="shrink-0 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted">Definitions</p>
            <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.02em] text-content-primary">Stat Definitions</h1>
          </div>
          <div className="w-full sm:max-w-xs">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value) }}
              placeholder="Search stats…"
              className="w-full rounded-md border border-bg-border bg-bg-surface px-3 py-2 text-sm text-content-primary placeholder-content-muted outline-none focus:border-brand"
            />
          </div>
        </div>
      </div>

      {/* Section tabs — hidden when searching */}
      {!normalizedQuery && (
        <div className="shrink-0 flex gap-1 mb-4 border-b border-bg-border/40 pb-0">
          {GROUPS.map((g) => (
            <button
              key={g.title}
              onClick={() => setActiveGroup(g.title)}
              className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeGroup === g.title
                  ? 'border-brand text-brand-light'
                  : 'border-transparent text-content-muted hover:text-content-secondary'
              }`}
            >
              {g.title}
            </button>
          ))}
          <span className="ml-auto self-center text-xs text-content-muted pr-1">{totalVisible} stats</span>
        </div>
      )}

      {/* Drag-scrollable card area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden cursor-grab select-none rounded-lg"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div className="space-y-8 pr-1 pb-4">
          {visibleSections.length > 0 ? visibleSections.map((section) => (
            <section key={section.title} className="space-y-3">
              {normalizedQuery && (
                <div>
                  <h2 className="text-[15px] font-semibold text-content-primary">{section.title}</h2>
                  <p className="text-xs text-content-muted">{section.description}</p>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {section.stats.map((stat) => <StatCard key={stat.key} stat={stat} />)}
              </div>
            </section>
          )) : (
            <div className="card p-8 text-center text-content-muted">No stats matched your search.</div>
          )}
        </div>
      </div>
    </div>
  )
}
