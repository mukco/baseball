import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import CodeMirror from '@uiw/react-codemirror'
import { sql as sqlLang } from '@codemirror/lang-sql'
import { EditorView, keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api'
import StatHelpTooltip from './StatHelpTooltip'
import SandboxChart from './charts/SandboxChart'
import SandboxPivot from './SandboxPivot'

// Brand-color overrides on top of one-dark base theme
const BRAND_OVERRIDE = EditorView.theme({
  '&':                           { backgroundColor: '#0F1117' },
  '.cm-content':                 { caretColor: '#6366F1' },
  '.cm-cursor':                  { borderLeftColor: '#6366F1' },
  '.cm-selectionBackground':     { background: '#6366F128 !important' },
  '&.cm-focused .cm-selectionBackground': { background: '#6366F135 !important' },
  '.cm-activeLine':              { backgroundColor: '#1F253238' },
  '.cm-gutters':                 { backgroundColor: '#0F1117', borderRight: '1px solid #1F2532' },
  '.cm-activeLineGutter':        { backgroundColor: '#1F253238' },
}, { dark: true })

const BASE_EXTENSIONS = [oneDark, BRAND_OVERRIDE]

const ID_COLS = new Set(['player_id', 'fg_id', 'mlbam_id', 'game_pk', 'game_id', 'team_id', 'batter_id', 'pitcher_id'])

function fmtCell(v, col) {
  if (v == null) return null
  if (typeof v !== 'number') return String(v)
  if (!Number.isFinite(v)) return String(v)
  if (Number.isInteger(v)) return ID_COLS.has(col) ? String(v) : v.toLocaleString()
  const abs = Math.abs(v)
  if (abs >= 100)   return v.toFixed(1)
  if (abs >= 10)    return v.toFixed(2)
  if (abs >= 0.001) return v.toFixed(3)
  return v.toPrecision(4)
}

function fmtSummary(v) {
  if (v == null) return '—'
  if (!Number.isFinite(v)) return String(v)
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k'
  if (Math.abs(v) >= 10)   return v.toFixed(1)
  return v.toFixed(3).replace(/\.?0+$/, '')
}

function ResultTable({ columns, rows, allRows, sortKey, sortDir, onSort, showSummary }) {
  const nameIdx   = columns.indexOf('name')
  const pidIdx    = columns.indexOf('player_id')

  const summaryStats = useMemo(() => {
    if (!showSummary) return null
    return columns.map((_, idx) => {
      const vals = allRows.map(r => r[idx]).filter(v => v != null && Number.isFinite(Number(v))).map(Number)
      if (!vals.length) return { type: 'text', count: allRows.filter(r => r[idx] != null).length }
      const sum = vals.reduce((a, b) => a + b, 0)
      return { type: 'numeric', avg: sum / vals.length, min: Math.min(...vals), max: Math.max(...vals) }
    })
  }, [columns, allRows, showSummary])

  return (
    <div className="overflow-auto max-h-[480px]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-bg-surface z-10">
          <tr className="border-b border-bg-border">
            {columns.map(c => (
              <th key={c} onClick={() => onSort(c)}
                className="text-left px-3 py-2 text-xs uppercase tracking-wider text-content-muted whitespace-nowrap cursor-pointer select-none hover:text-content-primary">
                <span className="inline-flex items-center gap-1">
                  {c}
                  <StatHelpTooltip stat={c} />
                  {sortKey === c && <span className="text-brand-light">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-bg-border/40 hover:bg-bg-elevated/30">
              {row.map((cell, i) => {
                const col = columns[i]
                const isName = i === nameIdx && pidIdx >= 0 && row[pidIdx] != null
                return (
                  <td key={`${ri}-${i}`} className="px-3 py-2 font-mono text-content-secondary whitespace-nowrap">
                    {cell == null
                      ? <span className="text-content-muted/40">—</span>
                      : isName
                        ? <Link to={`/player/${row[pidIdx]}`} className="text-brand-light hover:underline">{String(cell)}</Link>
                        : (fmtCell(cell, col) ?? String(cell))}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        {showSummary && summaryStats && (
          <tfoot>
            <tr className="border-t-2 border-bg-border bg-bg-elevated/60 sticky bottom-0">
              {summaryStats.map((s, i) => (
                <td key={i} className="px-3 py-2 whitespace-nowrap">
                  {s.type === 'numeric' ? (
                    <div className="space-y-0.5">
                      <div className="text-[10px] text-brand-light font-mono font-semibold">avg {fmtSummary(s.avg)}</div>
                      <div className="text-[9px] text-content-muted font-mono">{fmtSummary(s.min)} – {fmtSummary(s.max)}</div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-content-muted font-mono">{s.count} non-null</div>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function SandboxCellInner({
  cell, index,
  onUpdateSql, onUpdateTitle,
  onDelete,
  onFocus, onError,
  askAssistant,
  dragHandleProps,
  schema,
  tables,
}) {
  const [viewMode,    setViewMode]    = useState('table')
  const [showSummary, setShowSummary] = useState(false)
  const [sortKey,     setSortKey]     = useState(null)
  const [sortDir,     setSortDir]     = useState('desc')
  const [collapsed,   setCollapsed]   = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [mdEditing,   setMdEditing]   = useState(!cell.sql)

  // Local text state — keeps keystrokes inside this component
  const [localSql, setLocalSql] = useState(() => cell.sql)
  const titleRef = useRef(null)
  const mdRef    = useRef(null)

  // Sync in when the cell is replaced externally (e.g. assistant injection into a new cell)
  const prevCellId = useRef(cell.id)
  useEffect(() => {
    if (cell.id !== prevCellId.current) {
      setLocalSql(cell.sql)
      prevCellId.current = cell.id
    }
  }, [cell.id, cell.sql])

  const isMd = cell.type === 'md'

  // Stable ref so the keymap extension never goes stale
  const mutateRef = useRef(null)

  const sqlExtensions = useMemo(() => {
    const sqlExt = sqlLang({
      schema:            schema ?? {},
      tables:            tables ?? [],
      upperCaseKeywords: true,
    })
    const runKey = Prec.highest(keymap.of([{
      key: 'Mod-Enter',
      run: () => { mutateRef.current?.(); return true },
    }]))
    return [...BASE_EXTENSIONS, sqlExt, runKey]
  }, [schema, tables])

  const mutation = useMutation({
    mutationFn: () => api.sandbox.query(localSql, 500),
    onSuccess: data => {
      setSortKey(data.columns[0])
      setSortDir('desc')
      setViewMode('table')
    },
    onError: err => onError?.(err.message),
  })
  mutateRef.current = () => mutation.mutate()

  const result = mutation.data
  const error  = mutation.error

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus()
  }, [editingTitle])

  useEffect(() => {
    if (mdEditing) mdRef.current?.focus()
  }, [mdEditing])

  const sortedRows = useMemo(() => {
    if (!result?.rows?.length || !sortKey) return result?.rows ?? []
    const idx = result.columns.indexOf(sortKey)
    if (idx < 0) return result.rows
    return [...result.rows].sort((a, b) => {
      const av = a[idx], bv = b[idx]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const an = Number(av), bn = Number(bv)
      const cmp = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [result, sortKey, sortDir])

  function handleSort(col) {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(col); setSortDir('desc') }
  }

  return (
    <div className="card overflow-hidden" onFocus={onFocus}>
      {/* ── Cell header ───────────────────────────────────────────── */}
      <div className="px-3 py-2 flex items-center gap-2 bg-bg-elevated/50 border-b border-bg-border">
        <span className="text-[10px] text-content-muted font-mono shrink-0 select-none">
          [{index + 1}]
        </span>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
          isMd
            ? 'bg-purple-500/15 text-purple-300'
            : 'bg-brand/15 text-brand-light'
        }`}>
          {isMd ? 'MD' : 'SQL'}
        </span>

        {editingTitle ? (
          <input
            ref={titleRef}
            value={cell.title}
            onChange={e => onUpdateTitle(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={e => e.key === 'Enter' && setEditingTitle(false)}
            placeholder="Cell title…"
            className="flex-1 bg-transparent text-sm font-medium text-content-primary outline-none placeholder:text-content-muted/40 min-w-0"
          />
        ) : (
          <button type="button" onClick={() => setEditingTitle(true)}
            className="flex-1 text-left text-sm font-medium min-w-0 truncate hover:text-brand-light transition-colors">
            {cell.title
              ? <span className="text-content-primary">{cell.title}</span>
              : <span className="text-content-muted/40 font-normal italic">Untitled cell</span>}
          </button>
        )}

        <div className="flex items-center gap-0.5 shrink-0 ml-auto">
          {/* Drag handle */}
          <button type="button" title="Drag to reorder"
            className="p-1.5 text-content-muted hover:text-content-primary cursor-grab active:cursor-grabbing touch-none transition-colors"
            {...(dragHandleProps ?? {})}>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
              <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
              <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
              <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
            </svg>
          </button>
          <CellIconBtn onClick={onDelete} title="Delete cell" hoverRed>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </CellIconBtn>
          <CellIconBtn onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}
            style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </CellIconBtn>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* ── Markdown cell ──────────────────────────────────────── */}
          {isMd && (
            mdEditing ? (
              <div className="p-3 space-y-2">
                <textarea
                  ref={mdRef}
                  value={localSql}
                  onChange={e => setLocalSql(e.target.value)}
                  onBlur={() => onUpdateSql(localSql)}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault()
                      onUpdateSql(localSql)
                      setMdEditing(false)
                    }
                  }}
                  placeholder="Write markdown here… (Cmd+Enter to preview)"
                  rows={6}
                  className="w-full bg-bg-elevated border border-bg-border rounded-lg p-3 text-sm font-mono text-content-primary outline-none focus:border-brand resize-y placeholder:text-content-muted/40"
                />
                <button type="button" onClick={() => { onUpdateSql(localSql); setMdEditing(false) }}
                  className="text-xs px-3 py-1.5 rounded-md bg-brand text-white font-medium hover:opacity-90 transition-opacity">
                  Done
                </button>
              </div>
            ) : (
              <div className="group/md relative">
                <div
                  className="sandbox-md px-5 py-4 cursor-text min-h-[2.5rem]"
                  onClick={() => setMdEditing(true)}
                >
                  {localSql.trim()
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{localSql}</ReactMarkdown>
                    : <p className="text-content-muted/40 italic text-sm">Click to add markdown…</p>}
                </div>
                <button type="button" onClick={() => setMdEditing(true)}
                  className="absolute top-2 right-2 opacity-0 group-hover/md:opacity-100 transition-opacity text-[10px] px-2 py-1 rounded border border-bg-border text-content-muted hover:text-content-primary bg-bg-surface">
                  Edit
                </button>
              </div>
            )
          )}

          {/* ── SQL Editor ─────────────────────────────────────────── */}
          {!isMd && (
          <div className="relative group">
            <CodeMirror
              value={localSql}
              onChange={setLocalSql}
              onBlur={() => onUpdateSql(localSql)}
              theme="none"
              extensions={sqlExtensions}
              minHeight="80px"
              placeholder="SELECT * FROM batters LIMIT 50"
              basicSetup={{
                lineNumbers:        false,
                foldGutter:         false,
                autocompletion:     true,
                bracketMatching:    true,
                closeBrackets:      true,
                highlightActiveLine: true,
                tabSize:            2,
              }}
              className="sandbox-cm-editor border border-bg-border rounded-lg overflow-hidden focus-within:border-brand transition-colors text-sm font-mono"
            />
            <button
              type="button"
              onClick={() => { onUpdateSql(localSql); mutation.mutate() }}
              disabled={mutation.isPending || !localSql.trim()}
              className="absolute bottom-3 right-3 text-xs px-3 py-1.5 rounded-md bg-brand text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40 shadow-sm z-10"
            >
              {mutation.isPending ? 'Running…' : '▶ Run'}
            </button>
          </div>
          )}

          {/* ── Error ──────────────────────────────────────────────── */}
          {!isMd && error && (
            <div className="mx-3 mb-3 rounded-lg p-3 text-xs text-red-300 bg-red-500/5 border border-red-500/20 flex items-start justify-between gap-3">
              <span className="flex-1 font-mono leading-relaxed">{error.message}</span>
              {askAssistant && (
                <button type="button"
                  onClick={() => askAssistant(`Error in SQL Sandbox:\n\`\`\`\n${error.message}\n\`\`\`\nQuery:\n\`\`\`sql\n${cell.sql}\n\`\`\`\nHow do I fix it?`)}
                  className="shrink-0 text-brand-light underline hover:text-content-primary">
                  Ask assistant
                </button>
              )}
            </div>
          )}

          {/* ── Results ────────────────────────────────────────────── */}
          {!isMd && result && (
            <div className="border-t border-bg-border">
              <div className="px-4 py-2 border-b border-bg-border flex items-center gap-3 flex-wrap">
                <span className="text-xs text-content-muted">
                  <span className="text-content-primary font-medium">{result.rowCount}</span> rows
                  {' · '}
                  <span className="text-content-primary">{result.runtimeMs}ms</span>
                  {result.truncated && <span className="text-amber-400 ml-2">· truncated to 500</span>}
                </span>

                <div className="flex items-center gap-0.5 ml-auto bg-bg-elevated rounded-lg p-0.5">
                  {['table', 'chart', 'pivot'].map(t => (
                    <button key={t} type="button" onClick={() => setViewMode(t)}
                      className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                        viewMode === t
                          ? 'bg-bg-surface text-content-primary shadow-sm'
                          : 'text-content-muted hover:text-content-secondary'
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>

                {viewMode === 'table' && (
                  <button type="button" onClick={() => setShowSummary(s => !s)}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                      showSummary
                        ? 'border-brand/40 text-brand-light bg-brand/10'
                        : 'border-bg-border text-content-muted hover:text-content-secondary'
                    }`}>
                    ∑ Summary
                  </button>
                )}
              </div>

              {viewMode === 'table' && (
                <ResultTable
                  columns={result.columns}
                  rows={sortedRows}
                  allRows={result.rows}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  showSummary={showSummary}
                />
              )}
              {viewMode === 'chart' && (
                <SandboxChart key={result.columns.join('|')} columns={result.columns} rows={result.rows} />
              )}
              {viewMode === 'pivot' && (
                <SandboxPivot key={result.columns.join('|')} columns={result.columns} rows={result.rows} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const SandboxCell = memo(SandboxCellInner)
export default SandboxCell

function CellIconBtn({ onClick, disabled, title, hoverRed, style, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} style={style}
      className={`p-1.5 rounded transition-colors disabled:opacity-25 ${
        hoverRed
          ? 'text-content-muted hover:text-red-400'
          : 'text-content-muted hover:text-content-primary'
      }`}>
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {children}
      </svg>
    </button>
  )
}
