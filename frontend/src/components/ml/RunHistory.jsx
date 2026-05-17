import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'

function RunCard({ run, onLoad, onDelete, isSelected }) {
  const { id, created_at, config, result } = run
  const date = new Date(created_at)
  const label = `${(config.model_type || '').replace(/_/g, ' ')} · ${config.target || '?'}`
  const isReg = result?.task === 'regression'
  const m = result?.metrics || {}

  return (
    <div
      className={`card p-3 cursor-pointer transition-colors hover:border-brand/50 ${
        isSelected ? 'border-brand bg-brand/5' : ''
      }`}
      onClick={() => onLoad(run)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-content-primary truncate capitalize">{label}</p>
          <p className="text-xs text-content-muted mt-0.5">
            {config.table} · {(config.features || []).length} features
          </p>
          <p className="text-xs text-content-muted">
            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(id) }}
          className="shrink-0 p-1 rounded text-content-muted hover:text-red-400 hover:bg-red-900/20 transition-colors"
          title="Delete run"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {isReg ? (
          <>
            {m.r2   != null && <Chip label="R²"   val={m.r2.toFixed(3)} />}
            {m.rmse != null && <Chip label="RMSE" val={m.rmse.toFixed(3)} />}
          </>
        ) : (
          <>
            {m.accuracy != null && <Chip label="Acc" val={`${(m.accuracy * 100).toFixed(0)}%`} />}
            {m.f1       != null && <Chip label="F1"  val={m.f1.toFixed(3)} />}
          </>
        )}
      </div>
    </div>
  )
}

function Chip({ label, val }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-bg-elevated rounded text-xs">
      <span className="text-content-muted">{label}</span>
      <span className="font-mono font-semibold text-content-primary">{val}</span>
    </span>
  )
}

export default function RunHistory({ selectedRunId, onLoad, onCompare, compareRunId }) {
  const qc = useQueryClient()

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['ml-runs'],
    queryFn: api.ml.runs,
    staleTime: 0,
  })

  const deleteMutation = useMutation({
    mutationFn: api.ml.deleteRun,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ml-runs'] }),
  })

  if (isLoading) return <p className="text-xs text-content-muted px-1">Loading runs…</p>
  if (runs.length === 0) return <p className="text-xs text-content-muted px-1">No saved runs yet. Train a model to start.</p>

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold text-content-muted uppercase tracking-wider">
          Run history ({runs.length})
        </p>
        {onCompare && runs.length >= 2 && (
          <button
            onClick={onCompare}
            className="text-xs text-brand hover:text-brand-light transition-colors"
          >
            Compare →
          </button>
        )}
      </div>
      {runs.map(run => (
        <RunCard
          key={run.id}
          run={run}
          onLoad={onLoad}
          onDelete={(id) => deleteMutation.mutate(id)}
          isSelected={run.id === selectedRunId || run.id === compareRunId}
        />
      ))}
    </div>
  )
}
