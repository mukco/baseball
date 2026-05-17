import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { evaluate } from 'mathjs'

// ─── Baseball stat formulas ───────────────────────────────────────────────────

const FORMULAS = [
  {
    id: 'obp',
    name: 'OBP',
    description: 'On-Base Percentage',
    formula: '(H + BB + HBP) / (AB + BB + HBP + SF)',
    vars: [
      { key: 'H',   label: 'H',   full: 'Hits' },
      { key: 'BB',  label: 'BB',  full: 'Walks' },
      { key: 'HBP', label: 'HBP', full: 'Hit by Pitch' },
      { key: 'AB',  label: 'AB',  full: 'At Bats' },
      { key: 'SF',  label: 'SF',  full: 'Sac Flies' },
    ],
    compute: v => (v.H + v.BB + v.HBP) / (v.AB + v.BB + v.HBP + v.SF),
    decimals: 3,
    leadingZero: false,
  },
  {
    id: 'slg',
    name: 'SLG',
    description: 'Slugging Percentage',
    formula: '(1B + 2×2B + 3×3B + 4×HR) / AB',
    vars: [
      { key: 's1B', label: '1B',  full: 'Singles' },
      { key: 's2B', label: '2B',  full: 'Doubles' },
      { key: 's3B', label: '3B',  full: 'Triples' },
      { key: 'HR',  label: 'HR',  full: 'Home Runs' },
      { key: 'AB',  label: 'AB',  full: 'At Bats' },
    ],
    compute: v => (v.s1B + 2 * v.s2B + 3 * v.s3B + 4 * v.HR) / v.AB,
    decimals: 3,
    leadingZero: false,
  },
  {
    id: 'ops',
    name: 'OPS',
    description: 'On-Base + Slugging',
    formula: 'OBP + SLG',
    vars: [
      { key: 'OBP', label: 'OBP', full: 'On-Base %' },
      { key: 'SLG', label: 'SLG', full: 'Slugging %' },
    ],
    compute: v => v.OBP + v.SLG,
    decimals: 3,
    leadingZero: true,
  },
  {
    id: 'babip',
    name: 'BABIP',
    description: 'Batting Avg on Balls in Play',
    formula: '(H − HR) / (AB − K − HR + SF)',
    vars: [
      { key: 'H',  label: 'H',  full: 'Hits' },
      { key: 'HR', label: 'HR', full: 'Home Runs' },
      { key: 'AB', label: 'AB', full: 'At Bats' },
      { key: 'K',  label: 'K',  full: 'Strikeouts' },
      { key: 'SF', label: 'SF', full: 'Sac Flies' },
    ],
    compute: v => (v.H - v.HR) / (v.AB - v.K - v.HR + v.SF),
    decimals: 3,
    leadingZero: false,
  },
  {
    id: 'era',
    name: 'ERA',
    description: 'Earned Run Average',
    formula: '(ER × 9) / IP',
    vars: [
      { key: 'ER', label: 'ER', full: 'Earned Runs' },
      { key: 'IP', label: 'IP', full: 'Innings Pitched' },
    ],
    compute: v => (v.ER * 9) / v.IP,
    decimals: 2,
    leadingZero: true,
  },
  {
    id: 'whip',
    name: 'WHIP',
    description: 'Walks + Hits per Inning',
    formula: '(BB + H) / IP',
    vars: [
      { key: 'BB', label: 'BB', full: 'Walks Allowed' },
      { key: 'H',  label: 'H',  full: 'Hits Allowed' },
      { key: 'IP', label: 'IP', full: 'Innings Pitched' },
    ],
    compute: v => (v.BB + v.H) / v.IP,
    decimals: 3,
    leadingZero: true,
  },
  {
    id: 'fip',
    name: 'FIP',
    description: 'Fielding Independent Pitching',
    formula: '(13×HR + 3×(BB+HBP) − 2×K) / IP + C',
    vars: [
      { key: 'HR',  label: 'HR',  full: 'Home Runs' },
      { key: 'BB',  label: 'BB',  full: 'Walks' },
      { key: 'HBP', label: 'HBP', full: 'Hit by Pitch' },
      { key: 'K',   label: 'K',   full: 'Strikeouts' },
      { key: 'IP',  label: 'IP',  full: 'Innings Pitched' },
      { key: 'C',   label: 'C',   full: 'FIP Constant (~3.15)' },
    ],
    compute: v => (13 * v.HR + 3 * (v.BB + v.HBP) - 2 * v.K) / v.IP + v.C,
    decimals: 2,
    leadingZero: true,
  },
  {
    id: 'woba',
    name: 'wOBA',
    description: 'Weighted On-Base Average',
    formula: '(0.69×BB + 0.72×HBP + 0.89×1B + 1.27×2B + 1.62×3B + 2.10×HR) / PA',
    vars: [
      { key: 'BB',  label: 'BB',  full: 'Walks (excl. IBB)' },
      { key: 'HBP', label: 'HBP', full: 'Hit by Pitch' },
      { key: 's1B', label: '1B',  full: 'Singles' },
      { key: 's2B', label: '2B',  full: 'Doubles' },
      { key: 's3B', label: '3B',  full: 'Triples' },
      { key: 'HR',  label: 'HR',  full: 'Home Runs' },
      { key: 'AB',  label: 'AB',  full: 'At Bats' },
      { key: 'IBB', label: 'IBB', full: 'Int. Walks' },
      { key: 'SF',  label: 'SF',  full: 'Sac Flies' },
    ],
    compute: v =>
      (0.69 * v.BB + 0.72 * v.HBP + 0.89 * v.s1B + 1.27 * v.s2B + 1.62 * v.s3B + 2.1 * v.HR) /
      (v.AB + v.BB - v.IBB + v.SF + v.HBP),
    decimals: 3,
    leadingZero: false,
  },
  {
    id: 'iso',
    name: 'ISO',
    description: 'Isolated Power',
    formula: 'SLG − AVG',
    vars: [
      { key: 'SLG', label: 'SLG', full: 'Slugging %' },
      { key: 'AVG', label: 'AVG', full: 'Batting Average' },
    ],
    compute: v => v.SLG - v.AVG,
    decimals: 3,
    leadingZero: false,
  },
]

// ─── Button layout ─────────────────────────────────────────────────────────────

const ROWS = [
  // Scientific strip
  [
    { label: '(',  val: '(',          type: 'sci' },
    { label: ')',  val: ')',          type: 'sci' },
    { label: 'x²', val: '^2',        type: 'sci' },
    { label: '√',  val: 'sqrt(',     type: 'sci' },
    { label: '%',  val: '%',         type: 'sci' },
    { label: 'π',  val: String(Math.PI), type: 'sci' },
  ],
  [
    { label: 'AC',  val: 'AC',      type: 'clear' },
    { label: '+/−', val: 'negate',  type: 'fn' },
    { label: '⌫',   val: 'back',    type: 'fn' },
    { label: '÷',   val: '/',       type: 'op' },
  ],
  [
    { label: '7', val: '7', type: 'num' },
    { label: '8', val: '8', type: 'num' },
    { label: '9', val: '9', type: 'num' },
    { label: '×', val: '*', type: 'op' },
  ],
  [
    { label: '4', val: '4', type: 'num' },
    { label: '5', val: '5', type: 'num' },
    { label: '6', val: '6', type: 'num' },
    { label: '−', val: '-', type: 'op' },
  ],
  [
    { label: '1', val: '1', type: 'num' },
    { label: '2', val: '2', type: 'num' },
    { label: '3', val: '3', type: 'num' },
    { label: '+', val: '+', type: 'op' },
  ],
  [
    { label: '0', val: '0', type: 'num', wide: true },
    { label: '.', val: '.', type: 'num' },
    { label: '=', val: '=', type: 'eq' },
  ],
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function safeEval(expr) {
  if (!expr || !expr.trim()) return null
  try {
    const cleaned = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    const result = evaluate(cleaned)
    if (typeof result !== 'number' || !isFinite(result)) return null
    const s = Number(result.toPrecision(12)).toString()
    return s.length > 14 ? Number(result).toExponential(6) : s
  } catch {
    return null
  }
}

function formatFormulaResult(value, decimals, leadingZero) {
  if (value === null || !isFinite(value) || isNaN(value)) return '—'
  const fixed = value.toFixed(decimals)
  return leadingZero ? fixed : fixed.replace(/^0\./, '.')
}

// ─── Button styles ─────────────────────────────────────────────────────────────

const BTN_BASE = 'flex items-center justify-center rounded-xl font-medium select-none cursor-pointer transition-all duration-75 active:scale-95'

const BTN_TYPE = {
  num:   'bg-bg-elevated text-content-primary text-[17px] hover:brightness-110',
  sci:   'bg-bg-surface text-content-muted text-[13px] hover:text-content-secondary hover:bg-bg-elevated',
  op:    'bg-bg-surface text-brand-light text-[20px] font-semibold hover:bg-bg-elevated',
  eq:    'bg-brand text-white text-[20px] font-semibold hover:opacity-90',
  clear: 'bg-bg-surface text-red-400 text-[15px] font-semibold hover:bg-red-500/10',
  fn:    'bg-bg-surface text-content-secondary text-[15px] hover:bg-bg-elevated',
}

// ─── FormulaMode ───────────────────────────────────────────────────────────────

function FormulaMode({ formula, onBack }) {
  const [vals, setVals] = useState(() =>
    Object.fromEntries(formula.vars.map(v => [v.key, '']))
  )
  const inputRefs = useRef({})

  const result = useMemo(() => {
    const parsed = {}
    for (const { key } of formula.vars) {
      const n = parseFloat(vals[key])
      if (isNaN(n)) return null
      parsed[key] = n
    }
    try {
      const r = formula.compute(parsed)
      return isFinite(r) ? r : null
    } catch {
      return null
    }
  }, [vals, formula])

  const display = formatFormulaResult(result, formula.decimals, formula.leadingZero)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-bg-border/40">
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={onBack}
            className="text-content-muted hover:text-content-primary transition-colors p-0.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-[13px] font-bold text-content-primary">{formula.name}</span>
          <span className="text-[11px] text-content-muted">{formula.description}</span>
        </div>
        <p className="text-[10px] font-mono text-content-muted pl-6">{formula.formula}</p>
      </div>

      {/* Result */}
      <div className="px-4 py-3 text-right border-b border-bg-border/20">
        <div className="text-[10px] text-content-muted uppercase tracking-wider mb-0.5">{formula.name}</div>
        <div className={`font-mono font-semibold transition-all ${result !== null ? 'text-[38px] text-content-primary' : 'text-[38px] text-content-muted/30'}`}>
          {display}
        </div>
      </div>

      {/* Variable inputs */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {formula.vars.map((v, i) => (
          <div key={v.key} className="flex items-center gap-3">
            <div className="w-10 text-right shrink-0">
              <span className="text-[12px] font-bold font-mono text-brand-light">{v.label}</span>
            </div>
            <div className="flex-1">
              <input
                ref={el => { inputRefs.current[v.key] = el }}
                type="number"
                step="any"
                placeholder="0"
                value={vals[v.key]}
                onChange={e => setVals(prev => ({ ...prev, [v.key]: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault()
                    const next = formula.vars[i + 1]
                    if (next) inputRefs.current[next.key]?.focus()
                  }
                }}
                className="w-full bg-bg-surface border border-bg-border rounded-lg px-3 py-1.5 text-[14px] text-content-primary font-mono text-right focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <div className="w-20 text-[10px] text-content-muted leading-tight">{v.full}</div>
          </div>
        ))}
      </div>

      {/* Clear button */}
      <div className="px-4 pb-3 pt-1">
        <button
          onClick={() => setVals(Object.fromEntries(formula.vars.map(v => [v.key, ''])))}
          className="w-full text-[12px] text-content-muted hover:text-red-400 transition-colors py-1.5 rounded-lg hover:bg-red-500/5"
        >
          Clear all
        </button>
      </div>
    </div>
  )
}

// ─── Calculator ────────────────────────────────────────────────────────────────

export default function Calculator({ open, onClose }) {
  const [expr, setExpr]     = useState('')
  const [history, setHistory] = useState([])
  const [activeFormula, setActiveFormula] = useState(null)
  const [formulasOpen, setFormulasOpen] = useState(false)
  const panelRef = useRef(null)

  const liveResult = useMemo(() => safeEval(expr), [expr])

  const press = useCallback((val) => {
    switch (val) {
      case 'AC':
        setExpr('')
        break
      case 'back':
        setExpr(e => e.slice(0, -1))
        break
      case 'negate':
        setExpr(e => {
          if (!e) return '-'
          if (e.startsWith('-')) return e.slice(1)
          return '-' + e
        })
        break
      case '=': {
        const r = safeEval(expr)
        if (r !== null) {
          setHistory(h => [{ expr, result: r }, ...h].slice(0, 20))
          setExpr(r)
        }
        break
      }
      default:
        setExpr(e => e + val)
    }
  }, [expr])

  // Keyboard support
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.target.tagName === 'INPUT') return
      const map = {
        Enter: '=', Backspace: 'back', Escape: 'AC',
        '+': '+', '-': '-', '*': '*', '/': '/',
        '.': '.', '%': '%', '(': '(', ')': ')',
        '0':'0','1':'1','2':'2','3':'3','4':'4',
        '5':'5','6':'6','7':'7','8':'8','9':'9',
      }
      if (map[e.key]) {
        e.preventDefault()
        press(map[e.key])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, press])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose])

  if (!open) return null

  if (activeFormula) {
    const f = FORMULAS.find(f => f.id === activeFormula)
    return (
      <div
        ref={panelRef}
        className="fixed bottom-20 left-4 z-50 w-[300px] bg-bg-surface border border-bg-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: 520 }}
      >
        <FormulaMode formula={f} onBack={() => setActiveFormula(null)} />
      </div>
    )
  }

  return (
    <div
      ref={panelRef}
      className="fixed bottom-20 left-4 z-50 w-[300px] bg-bg-surface border border-bg-border rounded-2xl shadow-2xl overflow-hidden select-none"
    >
      {/* Display */}
      <div className="bg-bg-base px-4 pt-4 pb-3">
        <div className="min-h-[20px] text-right text-[13px] font-mono text-content-muted truncate mb-1 pr-0.5">
          {expr || <span className="opacity-0">0</span>}
        </div>
        <div className={`text-right font-mono font-light transition-all leading-none ${
          liveResult !== null
            ? 'text-[42px] text-content-primary'
            : expr
            ? 'text-[42px] text-content-muted/30'
            : 'text-[42px] text-content-muted/20'
        }`}>
          {liveResult ?? (expr ? '…' : '0')}
        </div>
      </div>

      {/* Baseball formulas strip */}
      <div className="border-t border-bg-border/40">
        <button
          onClick={() => setFormulasOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2 text-[11px] text-content-muted hover:text-content-secondary transition-colors"
        >
          <span className="uppercase tracking-wider font-semibold">Baseball Formulas</span>
          <svg
            className={`w-3.5 h-3.5 transition-transform ${formulasOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {formulasOpen && (
          <div className="px-3 pb-2.5 grid grid-cols-3 gap-1.5">
            {FORMULAS.map(f => (
              <button
                key={f.id}
                onClick={() => { setActiveFormula(f.id); setFormulasOpen(false) }}
                className="bg-bg-elevated hover:bg-brand/10 hover:text-brand-light border border-bg-border hover:border-brand/20 rounded-lg py-1.5 text-[11px] font-bold text-content-secondary transition-all text-center"
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Keypad */}
      <div className="p-2.5 pt-1.5 space-y-1.5 border-t border-bg-border/40">
        {/* Scientific strip */}
        <div className="grid grid-cols-6 gap-1">
          {ROWS[0].map(btn => (
            <button
              key={btn.label}
              onClick={() => press(btn.val)}
              className={`${BTN_BASE} ${BTN_TYPE[btn.type]} h-9`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Main rows */}
        {ROWS.slice(1).map((row, ri) => (
          <div key={ri} className="grid gap-1.5" style={{ gridTemplateColumns: row.map(b => b.wide ? '2fr' : '1fr').join(' ') }}>
            {row.map(btn => (
              <button
                key={btn.label}
                onClick={() => press(btn.val)}
                className={`${BTN_BASE} ${BTN_TYPE[btn.type]} h-12`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="border-t border-bg-border/40 px-3 py-2 space-y-1 max-h-28 overflow-y-auto">
          {history.map((h, i) => (
            <button
              key={i}
              onClick={() => setExpr(h.result)}
              className="w-full flex justify-between items-center text-[11px] hover:bg-bg-elevated rounded px-2 py-0.5 transition-colors group"
            >
              <span className="font-mono text-content-muted truncate mr-2">{h.expr}</span>
              <span className="font-mono text-content-secondary group-hover:text-content-primary shrink-0">= {h.result}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
