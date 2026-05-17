import { useMemo, useState } from 'react'
import PivotTableUI from 'react-pivottable/PivotTableUI'
import TableRenderers from 'react-pivottable/TableRenderers'
import { aggregatorTemplates } from 'react-pivottable/Utilities'
import 'react-pivottable/pivottable.css'

// These are identifiers/dimensions — never meaningful to sum or average
const DIMENSION_COLS = new Set([
  'player_id', 'fg_id', 'mlbam_id', 'name', 'team', 'league',
  'position', 'season', 'projection_system',
])

// Parse to number first: DuckDB may serialize floats as strings in JSON
function toNum(v) {
  if (v == null || v === '') return NaN
  const n = typeof v === 'number' ? v : Number(v)
  return n
}

function fmt(v) {
  const n = toNum(v)
  if (!Number.isFinite(n)) return v == null ? '' : String(v)
  if (Number.isInteger(n)) return n.toLocaleString()
  const abs = Math.abs(n)
  if (abs >= 100)   return n.toFixed(1)
  if (abs >= 10)    return n.toFixed(2)
  if (abs >= 0.001) return n.toFixed(3)
  return n.toPrecision(4)
}

const fmtInt = v => {
  const n = toNum(v)
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : String(v ?? '')
}

const tpl = aggregatorTemplates
const AGGREGATORS = {
  'Average':    tpl.average(fmt),
  'Sum':        tpl.sum(fmt),
  'Count':      tpl.count(fmtInt),
  'Max':        tpl.max(fmt),
  'Min':        tpl.min(fmt),
  'Median':     tpl.median(fmt),
  'Std Dev':    tpl.stdev(1, fmt),
  '% of Total': tpl.fractionOf(tpl.sum(), 'total', v => fmt(toNum(v) * 100) + '%'),
}

// Convert [col, row[]] → [{col: val}] and coerce numeric strings to numbers
function toObjects(columns, rows) {
  return rows.map(row =>
    Object.fromEntries(columns.map((col, i) => {
      const v = row[i]
      if (v == null || v === '') return [col, null]
      if (DIMENSION_COLS.has(col)) return [col, String(v)]
      const n = Number(v)
      return [col, Number.isFinite(n) ? n : String(v)]
    }))
  )
}

const TIPS = [
  { label: 'Career matrix', hint: 'Rows: name  ·  Cols: season  ·  Value: war' },
  { label: 'Team compare',  hint: 'Rows: team  ·  Value: wrc_plus or war' },
  { label: 'Proj vs actual', hint: 'JOIN tables first, then Rows: name  ·  Value: war' },
]

// Only expose the Table renderer — Chart tab handles visualisation
const RENDERERS = { Table: TableRenderers.Table }

export default function SandboxPivot({ columns, rows }) {
  const data = useMemo(() => toObjects(columns, rows), [columns, rows])

  const [pivotState, setPivotState] = useState(() => {
    const dims    = columns.filter(c =>  DIMENSION_COLS.has(c))
    const metrics = columns.filter(c => !DIMENSION_COLS.has(c))
    return {
      rows:           dims.length    ? [dims[0]]    : [],
      cols:           [],
      vals:           metrics.length ? [metrics[0]] : [],
      aggregatorName: metrics.length ? 'Average'    : 'Count',
      rendererName:   'Table',
    }
  })

  return (
    <div className="pvt-sandbox overflow-auto">
      {/* Quick-start tips */}
      <div className="flex items-center gap-2 flex-wrap px-4 pt-4 pb-3 border-b border-bg-border/50">
        <span className="text-[10px] text-content-muted uppercase tracking-wider font-semibold shrink-0">
          Quick starts
        </span>
        {TIPS.map(t => (
          <span
            key={t.label}
            className="text-[10px] bg-bg-elevated border border-bg-border rounded px-2 py-0.5 text-content-secondary font-mono leading-relaxed"
          >
            <span className="text-brand-light font-semibold not-italic">{t.label}:</span>
            {' '}{t.hint}
          </span>
        ))}
        <span className="text-[10px] text-content-muted ml-auto hidden xl:inline">
          Drag pills into Rows / Cols zones · pick aggregation
        </span>
      </div>

      <div className="p-4">
        <PivotTableUI
          data={data}
          aggregators={AGGREGATORS}
          renderers={RENDERERS}
          onChange={s => setPivotState(s)}
          {...pivotState}
        />
      </div>
    </div>
  )
}
