import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BarChart, Bar, Tooltip, ResponsiveContainer, Cell, YAxis } from 'recharts'
import { api } from '../../api'

function primaryMetric(run) {
  const m = run.result?.metrics || {}
  return run.result?.task === 'regression' ? (m.r2 ?? null) : (m.accuracy ?? null)
}

function metricColor(val) {
  if (val == null) return '#6b7280'
  if (val >= 0.70) return 'rgb(var(--color-brand))'
  if (val >= 0.40) return '#f59e0b'
  return '#ef4444'
}

function metricColorClass(val) {
  if (val == null) return 'bg-content-muted'
  if (val >= 0.70) return 'bg-brand'
  if (val >= 0.40) return 'bg-amber-500'
  return 'bg-red-500'
}

function shortLabel(run) {
  const mt = (run.config?.model_type || '').replace(/_/g, ' ')
  const tgt = run.config?.target || '?'
  return `${mt} · ${tgt}`.slice(0, 24)
}

function formatMetrics(run) {
  const m = run.result?.metrics || {}
  const isReg = run.result?.task === 'regression'
  if (isReg) {
    return [
      m.r2   != null ? `R² ${m.r2.toFixed(3)}` : null,
      m.rmse != null ? `RMSE ${m.rmse.toFixed(3)}` : null,
    ].filter(Boolean).join(', ')
  }
  return [
    m.accuracy != null ? `Acc ${(m.accuracy * 100).toFixed(0)}%` : null,
    m.f1       != null ? `F1 ${m.f1.toFixed(3)}` : null,
  ].filter(Boolean).join(', ')
}

function openAssistant(run) {
  const cfg = run.config || {}
  const res = run.result || {}
  const m = res.metrics || {}
  const isReg = res.task === 'regression'

  const metricsStr = formatMetrics(run)
  const features = cfg.features || []
  const featureStr = features.slice(0, 5).join(', ')
  const modelType = (cfg.model_type || '').replace(/_/g, ' ')

  const initialMessage = `Analyze this ML model run: ${modelType} predicting ${cfg.target} from ${featureStr}. Metrics: ${metricsStr}.`

  const fi = Array.isArray(res.feature_importance)
    ? res.feature_importance.slice(0, 5).map(f => ({ name: f.feature, importance: f.importance }))
    : []

  window.dispatchEvent(new CustomEvent('statline:open-assistant', {
    detail: {
      context: {
        pageType: 'ml_run',
        mlRun: {
          model_type: cfg.model_type,
          task: res.task,
          target: cfg.target,
          table: cfg.table,
          features,
          metrics: m,
          train_samples: res.train_samples,
          test_samples: res.test_samples,
          feature_importance: fi,
        },
      },
      initialMessage,
    },
  }))
}

function RunCard({ run, onLoad, onDelete, isSelected }) {
  const { id, created_at, config, result } = run
  const date = new Date(created_at)
  const label = `${(config.model_type || '').replace(/_/g, ' ')} · ${config.target || '?'}`
  const isReg = result?.task === 'regression'
  const m = result?.metrics || {}
  const primary = primaryMetric(run)
  const pct = primary != null ? Math.min(100, Math.max(0, primary * 100)) : null

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
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); openAssistant(run) }}
            className="p-1 rounded text-content-muted hover:text-brand hover:bg-brand/10 transition-colors"
            title="Chat with Statline about this run"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(id) }}
            className="p-1 rounded text-content-muted hover:text-red-400 hover:bg-red-900/20 transition-colors"
            title="Delete run"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
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
      {pct != null && (
        <div className="h-1 bg-bg-border rounded-full overflow-hidden mt-2">
          <div
            className={`h-full rounded-full ${metricColorClass(primary)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
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

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-bg-elevated border border-bg-border rounded px-2 py-1 text-xs shadow-lg">
      <p className="text-content-primary font-medium">{d.label}</p>
      <p className="text-content-secondary">{d.metricLabel}: <span className="font-mono font-semibold">{d.value?.toFixed(3)}</span></p>
    </div>
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

  const isReg = runs[0]?.result?.task === 'regression'
  const metricLabel = isReg ? 'R²' : 'Accuracy'

  const chartData = runs
    .slice(0, 10)
    .map(r => ({
      id: r.id,
      label: shortLabel(r),
      value: primaryMetric(r),
      metricLabel,
      run: r,
    }))
    .filter(d => d.value != null)
    .reverse()

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

      {chartData.length >= 2 && (
        <div className="px-1 pb-1">
          <p className="text-[10px] text-content-muted mb-1">{metricLabel} across runs — click a bar to load</p>
          <ResponsiveContainer width="100%" height={96}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
              <YAxis domain={[0, 1]} tick={{ fontSize: 9, fill: 'rgb(var(--color-content-muted))' }} tickCount={3} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} onClick={(d) => onLoad(d.run)} style={{ cursor: 'pointer' }}>
                {chartData.map((d) => (
                  <Cell key={d.id} fill={metricColor(d.value)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

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
