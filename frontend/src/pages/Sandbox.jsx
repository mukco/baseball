import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Editor from 'react-simple-code-editor'
import Prism from 'prismjs'
import 'prismjs/components/prism-sql'
import { api } from '../api'
import StatHelpTooltip from '../components/StatHelpTooltip'

export default function Sandbox() {
  const [datasetId, setDatasetId] = useState('players')
  const [sql, setSql] = useState('')
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('desc')

  const { data: datasets = [], isLoading: loadingDatasets } = useQuery({
    queryKey: ['sandbox-datasets'],
    queryFn: () => api.sandbox.datasets(),
    staleTime: 2 * 60 * 1000,
  })

  const selected = useMemo(
    () => datasets.find((d) => d.id === datasetId) || datasets[0],
    [datasets, datasetId]
  )

  useEffect(() => {
    if (!selected) return
    setDatasetId(selected.id)
    if (!sql.trim()) setSql(selected.defaultSql || 'SELECT * FROM players LIMIT 50')
  }, [selected?.id])

  const queryMutation = useMutation({
    mutationFn: () => api.sandbox.query(sql, 500),
  })

  function runQuery() {
    queryMutation.mutate()
  }

  function handleEditorKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      runQuery()
    }
  }

  const result = queryMutation.data

  const sortedRows = useMemo(() => {
    if (!result?.rows?.length || !sortKey) return result?.rows || []
    const idx = result.columns.indexOf(sortKey)
    if (idx < 0) return result.rows

    return [...result.rows].sort((a, b) => {
      const av = a[idx]
      const bv = b[idx]

      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1

      const aNum = Number(av)
      const bNum = Number(bv)
      const bothNumeric = Number.isFinite(aNum) && Number.isFinite(bNum)

      let cmp
      if (bothNumeric) cmp = aNum - bNum
      else cmp = String(av).localeCompare(String(bv))

      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [result, sortKey, sortDir])

  function handleSort(column) {
    if (sortKey === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(column)
      setSortDir('desc')
    }
  }

  useEffect(() => {
    if (!result?.columns?.length) return
    setSortKey(result.columns[0])
    setSortDir('desc')
  }, [result?.columns?.join('|')])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">SQL Sandbox</h1>
          <p className="text-sm text-content-muted mt-1">DuckDB-backed queries over multi-season local datasets</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selected?.id || datasetId}
            onChange={(e) => {
              const next = datasets.find((d) => d.id === e.target.value)
              setDatasetId(e.target.value)
              if (next?.defaultSql) setSql(next.defaultSql)
            }}
            className="bg-bg-elevated border border-bg-border text-content-primary text-sm rounded-lg px-3 py-2 outline-none focus:border-brand"
            disabled={loadingDatasets}
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={runQuery}
            disabled={queryMutation.isPending || !sql.trim()}
            className="btn-primary"
          >
            {queryMutation.isPending ? 'Running...' : 'Run Query'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {selected && (
            <div className="card p-4 text-xs text-content-muted flex items-center gap-4 flex-wrap">
              <span>Dataset: <span className="text-content-primary">{selected.table}</span></span>
              <span>Rows: <span className="text-content-primary">{selected.rowCount ?? '-'}</span></span>
              <span>Refreshed: <span className="text-content-primary">{selected.lastRefreshedAt || '-'}</span></span>
              {selected.stale && <span className="text-amber-400">Stale dataset</span>}
              <span>Tip: <span className="text-content-primary">Cmd/Ctrl + Enter</span></span>
            </div>
          )}

          <section className="card p-4">
            <Editor
              value={sql}
              onValueChange={(code) => setSql(code)}
              onKeyDown={handleEditorKeyDown}
              highlight={(code) => Prism.highlight(code, Prism.languages.sql, 'sql')}
              padding={12}
              className="sandbox-editor min-h-[220px] bg-bg-elevated border border-bg-border rounded-lg text-sm font-mono outline-none focus-within:border-brand"
              textareaClassName="sandbox-editor-textarea"
              preClassName="sandbox-editor-pre"
            />
          </section>

          {queryMutation.error && (
            <div className="card p-4 text-sm text-red-300">{queryMutation.error.message}</div>
          )}

          {result && (
            <section className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-bg-border text-xs text-content-muted flex items-center gap-4">
                <span>Returned: <span className="text-content-primary">{result.rowCount}</span></span>
                <span>Runtime: <span className="text-content-primary">{result.runtimeMs}ms</span></span>
                {result.truncated && <span className="text-amber-400">Truncated to 500 rows</span>}
              </div>

              <div className="overflow-auto max-h-[520px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-bg-surface z-10">
                    <tr className="border-b border-bg-border">
                      {result.columns.map((c) => (
                        <th
                          key={c}
                          onClick={() => handleSort(c)}
                          className="text-left px-3 py-2 text-xs uppercase tracking-wider text-content-muted whitespace-nowrap cursor-pointer select-none hover:text-content-primary"
                        >
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
                    {sortedRows.map((row, idx) => (
                      <tr key={idx} className="border-b border-bg-border/40">
                        {row.map((cell, i) => (
                          <td key={`${idx}-${i}`} className="px-3 py-2 font-mono text-content-secondary whitespace-nowrap">
                            {cell == null ? '-' : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside className="card p-4 xl:sticky xl:top-20">
          <h2 className="text-sm font-semibold text-content-primary">Column Glossary</h2>
          <p className="text-xs text-content-muted mt-1">Definitions for <span className="font-mono text-content-primary">{selected?.table || 'players'}</span></p>

          <div className="mt-4 space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {(selected?.columns || []).map((col) => (
              <div key={col.name} className="rounded-lg border border-bg-border bg-bg-elevated p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-mono text-content-primary">{col.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-content-muted">{col.type}</span>
                </div>
                <p className="text-xs text-content-secondary mt-1">{col.description}</p>
              </div>
            ))}
            {(selected?.columns || []).length === 0 && (
              <div className="text-xs text-content-muted">No glossary is available for this dataset yet.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
