import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '../api'
import { getStatHelp } from '../lib/statHelp'
import { useSandbox } from '../contexts/SandboxContext'
import SandboxCell from '../components/SandboxCell'

// ── Notebook state ────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9)

function makeCell(sql = '', type = 'sql') {
  return { id: uid(), title: '', sql, type }
}

function makeTab(name) {
  const tabId = uid()
  return {
    tab: { id: tabId, name },
    cells: [makeCell('SELECT * FROM batters LIMIT 50')],
  }
}

const DEFAULT_STATE = (() => {
  const { tab, cells } = makeTab('Notebook 1')
  return { tabs: [tab], activeTabId: tab.id, cells: { [tab.id]: cells } }
})()

function loadState() {
  try {
    const raw = localStorage.getItem('sandbox_notebook')
    if (raw) return JSON.parse(raw)
  } catch {}
  return DEFAULT_STATE
}

function reducer(state, action) {
  switch (action.type) {
    case 'ADD_TAB': {
      const { tab, cells } = makeTab(`Notebook ${state.tabs.length + 1}`)
      return { ...state, tabs: [...state.tabs, tab], activeTabId: tab.id, cells: { ...state.cells, [tab.id]: cells } }
    }
    case 'RENAME_TAB': {
      return { ...state, tabs: state.tabs.map(t => t.id === action.id ? { ...t, name: action.name } : t) }
    }
    case 'CLOSE_TAB': {
      if (state.tabs.length === 1) return state
      const tabs = state.tabs.filter(t => t.id !== action.id)
      const cells = { ...state.cells }
      delete cells[action.id]
      const activeTabId = state.activeTabId === action.id ? tabs[tabs.length - 1].id : state.activeTabId
      return { ...state, tabs, cells, activeTabId }
    }
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTabId: action.id }

    case 'ADD_CELL': {
      const tab = state.activeTabId
      const newCell = makeCell(action.sql ?? '', action.cellType ?? 'sql')
      return { ...state, cells: { ...state.cells, [tab]: [...(state.cells[tab] ?? []), newCell] } }
    }
    case 'UPDATE_SQL': {
      const { tabId, cellId, sql } = action
      return {
        ...state,
        cells: {
          ...state.cells,
          [tabId]: state.cells[tabId].map(c => c.id === cellId ? { ...c, sql } : c),
        },
      }
    }
    case 'UPDATE_TITLE': {
      const { tabId, cellId, title } = action
      return {
        ...state,
        cells: {
          ...state.cells,
          [tabId]: state.cells[tabId].map(c => c.id === cellId ? { ...c, title } : c),
        },
      }
    }
    case 'DELETE_CELL': {
      const { tabId, cellId } = action
      const remaining = state.cells[tabId].filter(c => c.id !== cellId)
      const cells = remaining.length ? remaining : [makeCell()]
      return { ...state, cells: { ...state.cells, [tabId]: cells } }
    }
    case 'INSERT_CELL_AT': {
      const tab = action.tabId ?? state.activeTabId
      const list = [...(state.cells[tab] ?? [])]
      list.splice(action.index, 0, makeCell(action.sql ?? '', action.cellType ?? 'sql'))
      return { ...state, cells: { ...state.cells, [tab]: list } }
    }
    case 'REORDER_CELLS': {
      const { tabId, oldIndex, newIndex } = action
      return {
        ...state,
        cells: { ...state.cells, [tabId]: arrayMove(state.cells[tabId], oldIndex, newIndex) },
      }
    }
    default:
      return state
  }
}

// ── Glossary sidebar ──────────────────────────────────────────────────────

function GlossaryEntry({ col }) {
  const help = getStatHelp(col.name)
  const [open, setOpen] = useState(false)

  if (help) {
    return (
      <div className="rounded-lg border border-bg-border bg-bg-elevated overflow-hidden">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="w-full text-left px-3 py-2.5 flex items-start justify-between gap-2 hover:bg-bg-surface/50 transition-colors">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-content-primary">{help.label}</span>
              <span className="text-[10px] font-mono text-content-muted">{col.name}</span>
            </div>
            {!open && <p className="text-xs text-content-muted mt-0.5 line-clamp-1">{help.definition}</p>}
          </div>
          <span className="text-content-muted text-xs shrink-0 mt-0.5">{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div className="px-3 pb-3 space-y-2 border-t border-bg-border/50">
            <p className="text-xs text-content-secondary pt-2">{help.definition}</p>
            {help.formulaLatex ? (
              <div className="rounded bg-bg-surface px-2 py-1 overflow-x-auto">
                <BlockMath math={help.formulaLatex} />
              </div>
            ) : help.formula ? (
              <div className="rounded bg-bg-surface px-2 py-1 text-xs text-content-muted font-mono">{help.formula}</div>
            ) : null}
            {help.intuition && (
              <div className="rounded bg-brand/5 border border-brand/10 px-2.5 py-2 text-xs text-content-secondary leading-relaxed">
                <span className="font-semibold text-brand text-[10px] uppercase tracking-wider mr-1">Intuition:</span>
                {help.intuition}
              </div>
            )}
            {help.interpretation && <p className="text-[11px] text-content-muted">{help.interpretation}</p>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-bg-border bg-bg-elevated p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-mono text-content-primary">{col.name}</span>
        <span className="text-[10px] uppercase tracking-wider text-content-muted">{col.type}</span>
      </div>
      <p className="text-xs text-content-secondary mt-1">{col.description}</p>
    </div>
  )
}

// ── Insert zone ───────────────────────────────────────────────────────────

function InsertZone({ onInsert }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div className="relative flex items-center justify-center h-6"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <div className={`absolute inset-x-0 h-px transition-colors ${hovered ? 'bg-brand/30' : 'bg-transparent'}`} />
      <div className={`relative flex items-center gap-1.5 transition-all duration-150 ${hovered ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
        <button type="button" onClick={() => onInsert('sql')}
          className="text-[10px] px-2 py-0.5 rounded bg-bg-elevated border border-brand/30 text-brand-light hover:bg-brand/10 transition-colors">
          + SQL
        </button>
        <button type="button" onClick={() => onInsert('md')}
          className="text-[10px] px-2 py-0.5 rounded bg-bg-elevated border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 transition-colors">
          + Markdown
        </button>
      </div>
    </div>
  )
}

// ── Sortable cell wrapper ──────────────────────────────────────────────────

function SortableCellWrapper({ cell, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cell.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 20 : undefined }}>
      <SandboxCell cell={cell} dragHandleProps={{ ...attributes, ...listeners }} {...props} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function Sandbox() {
  const queryClient = useQueryClient()
  const location    = useLocation()
  const [state, dispatch]   = useReducer(reducer, null, loadState)
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [sidebarDataset, setSidebarDataset] = useState(null)
  const [schemaSearch, setSchemaSearch] = useState('')
  const [renamingTabId, setRenamingTabId]   = useState(null)
  const [focusedCellId, setFocusedCellId]   = useState(null)
  const renameInputRef = useRef(null)
  const { setCurrentSql, setCurrentError, loadSqlRef, askAssistant } = useSandbox()

  const activeCells = state.cells[state.activeTabId] ?? []

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const oldIndex = activeCells.findIndex(c => c.id === active.id)
    const newIndex = activeCells.findIndex(c => c.id === over.id)
    dispatch({ type: 'REORDER_CELLS', tabId: state.activeTabId, oldIndex, newIndex })
  }

  // Persist to localStorage on every state change
  useEffect(() => {
    try { localStorage.setItem('sandbox_notebook', JSON.stringify(state)) } catch {}
  }, [state])

  // Register ref so assistant can inject SQL as a new cell
  useEffect(() => {
    loadSqlRef.current = sql => dispatch({ type: 'ADD_CELL', sql, cellType: 'sql' })
    return () => { loadSqlRef.current = null }
  }, [loadSqlRef])

  // Sync focused cell SQL to context — only when focus changes, not on each keystroke
  useEffect(() => {
    const cell = activeCells.find(c => c.id === focusedCellId)
    setCurrentSql(cell?.sql ?? '')
  }, [focusedCellId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load SQL from navigation state (e.g. assistant "Load in Sandbox" button)
  useEffect(() => {
    if (location.state?.sql) dispatch({ type: 'ADD_CELL', sql: location.state.sql })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (renamingTabId) renameInputRef.current?.focus()
  }, [renamingTabId])

  const { data: datasets = [] } = useQuery({
    queryKey: ['sandbox-datasets'],
    queryFn: () => api.sandbox.datasets(),
    staleTime: 2 * 60 * 1000,
  })

  const anyStale = datasets.some(d => d.stale)

  // Build CodeMirror SQL schema: table → Completion[] with type + description
  const cmSchema = useMemo(() =>
    Object.fromEntries(datasets.map(ds => [
      ds.table,
      (ds.columns ?? []).map(col => ({
        label: col.name,
        type:   'variable',
        detail: col.type,
        info:   col.description,
      })),
    ])),
    [datasets],
  )
  const cmTables = useMemo(() =>
    datasets.map(ds => ({ label: ds.table, type: 'type', detail: `${ds.rowCount?.toLocaleString() ?? '?'} rows` })),
    [datasets],
  )

  const refreshMutation = useMutation({
    mutationFn: () => api.sandbox.refresh(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sandbox-datasets'] }),
  })

  const schemaDataset = sidebarDataset
    ? datasets.find(d => d.id === sidebarDataset)
    : datasets[0]

  return (
    <div className="flex flex-col gap-0 min-h-0">
      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">SQL Sandbox</h1>
          <p className="text-sm text-content-muted mt-1">
            DuckDB warehouse — batters &amp; pitchers, FG projections, team stats, simulation leagues
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
              anyStale
                ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'
                : 'border-bg-border text-content-muted hover:text-content-secondary'
            }`}
            title={anyStale ? 'Warehouse schema or data is stale — click to rebuild (1–3 min)' : 'Force a full warehouse rebuild'}>
            {refreshMutation.isPending ? 'Rebuilding…' : anyStale ? '⚠ Rebuild Warehouse' : 'Rebuild Warehouse'}
          </button>
          <button type="button" onClick={() => setSidebarOpen(o => !o)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              sidebarOpen
                ? 'border-brand/40 text-brand-light bg-brand/10'
                : 'border-bg-border text-content-muted hover:text-content-secondary'
            }`}>
            Schema
          </button>
        </div>
      </div>

      <div className="flex gap-6 items-start min-h-0">
        {/* ── Notebook ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-0">
          {/* Tab bar */}
          <div className="flex items-end gap-0 border-b border-bg-border mb-4 overflow-x-auto">
            {state.tabs.map(tab => (
              <div key={tab.id}
                className={`group flex items-center gap-1 px-4 py-2 border-b-2 cursor-pointer shrink-0 transition-colors ${
                  tab.id === state.activeTabId
                    ? 'border-brand text-content-primary'
                    : 'border-transparent text-content-muted hover:text-content-secondary hover:border-bg-border-strong'
                }`}
                onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', id: tab.id })}>
                {renamingTabId === tab.id ? (
                  <input
                    ref={renameInputRef}
                    defaultValue={tab.name}
                    onBlur={e => { dispatch({ type: 'RENAME_TAB', id: tab.id, name: e.target.value || tab.name }); setRenamingTabId(null) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') e.target.blur()
                      if (e.key === 'Escape') setRenamingTabId(null)
                    }}
                    onClick={e => e.stopPropagation()}
                    className="bg-transparent text-sm outline-none border-b border-brand w-28"
                  />
                ) : (
                  <span className="text-sm" onDoubleClick={() => setRenamingTabId(tab.id)}>
                    {tab.name}
                  </span>
                )}
                {state.tabs.length > 1 && (
                  <button type="button"
                    onClick={e => { e.stopPropagation(); dispatch({ type: 'CLOSE_TAB', id: tab.id }) }}
                    className="opacity-0 group-hover:opacity-100 text-content-muted hover:text-red-400 transition-all ml-1 text-xs leading-none">
                    ×
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => dispatch({ type: 'ADD_TAB' })}
              className="px-3 py-2 text-content-muted hover:text-content-primary transition-colors text-sm border-b-2 border-transparent shrink-0">
              +
            </button>
          </div>

          {/* Cells with DnD + insert zones */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={activeCells.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                {activeCells.map((cell, i) => (
                  <div key={cell.id}>
                    <SortableCellWrapper
                      cell={cell}
                      index={i}
                      onUpdateSql={sql => dispatch({ type: 'UPDATE_SQL', tabId: state.activeTabId, cellId: cell.id, sql })}
                      onUpdateTitle={title => dispatch({ type: 'UPDATE_TITLE', tabId: state.activeTabId, cellId: cell.id, title })}
                      onDelete={() => dispatch({ type: 'DELETE_CELL', tabId: state.activeTabId, cellId: cell.id })}
                      onFocus={() => setFocusedCellId(cell.id)}
                      onError={msg => { setFocusedCellId(cell.id); setCurrentError(msg) }}
                      askAssistant={askAssistant}
                      schema={cmSchema}
                      tables={cmTables}
                    />
                    <InsertZone onInsert={type => dispatch({ type: 'INSERT_CELL_AT', index: i + 1, cellType: type })} />
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Add cell at end */}
          <div className="flex items-center gap-2">
            <button type="button"
              onClick={() => dispatch({ type: 'ADD_CELL', cellType: 'sql' })}
              className="flex-1 py-2.5 rounded-xl border border-dashed border-bg-border text-content-muted hover:text-brand-light hover:border-brand/40 text-xs transition-colors flex items-center justify-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              SQL cell
            </button>
            <button type="button"
              onClick={() => dispatch({ type: 'ADD_CELL', cellType: 'md' })}
              className="flex-1 py-2.5 rounded-xl border border-dashed border-bg-border text-content-muted hover:text-purple-300 hover:border-purple-500/40 text-xs transition-colors flex items-center justify-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Markdown cell
            </button>
          </div>
        </div>

        {/* ── Schema sidebar ───────────────────────────────────────── */}
        {sidebarOpen && (
          <aside className="w-72 shrink-0 card p-4 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto flex flex-col gap-3">
            {/* Table picker */}
            <div className="flex flex-col gap-1.5">
              <h2 className="text-xs font-semibold text-content-muted uppercase tracking-[0.08em]">Schema</h2>
              <select
                value={schemaDataset?.id ?? ''}
                onChange={e => { setSidebarDataset(e.target.value); setSchemaSearch('') }}
                className="w-full bg-bg-elevated border border-bg-border text-content-primary text-xs rounded-md px-2 py-1.5 outline-none focus:border-brand">
                {datasets.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
              {schemaDataset && (
                <p className="text-[10px] text-content-muted leading-snug">
                  <span className="font-mono text-content-secondary">{schemaDataset.table}</span>
                  {' · '}
                  {schemaDataset.rowCount?.toLocaleString() ?? '—'} rows
                  {schemaDataset.lastRefreshedAt && ` · ${new Date(schemaDataset.lastRefreshedAt).toLocaleDateString()}`}
                </p>
              )}
            </div>

            {/* Column search */}
            <input
              type="search"
              placeholder="Search columns…"
              value={schemaSearch}
              onChange={e => setSchemaSearch(e.target.value)}
              className="w-full bg-bg-elevated border border-bg-border text-content-primary text-xs rounded-md px-2.5 py-1.5 outline-none focus:border-brand placeholder:text-content-muted/50"
            />

            {/* Column list */}
            <div className="space-y-2">
              {(schemaDataset?.columns ?? [])
                .filter(col => !schemaSearch || col.name.toLowerCase().includes(schemaSearch.toLowerCase()))
                .map(col => (
                  <GlossaryEntry key={col.name} col={col} />
                ))}
              {!(schemaDataset?.columns?.length) && (
                <p className="text-xs text-content-muted">No schema info available.</p>
              )}
              {schemaDataset?.columns?.length > 0 && schemaSearch &&
                !(schemaDataset.columns.some(c => c.name.toLowerCase().includes(schemaSearch.toLowerCase()))) && (
                <p className="text-xs text-content-muted">No columns match "{schemaSearch}".</p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
