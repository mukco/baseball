import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import PredActualChart from './PredActualChart'
import ClassBreakdownChart from './ClassBreakdownChart'
import MLHint from './MLHint'
import { ML_HELP } from '../../lib/mlHelp'

const MUTED  = 'rgb(var(--color-content-muted))'
const BORDER = 'rgb(var(--color-bg-border))'

function MetricCard({ label, value, hintKey }) {
  return (
    <div className="bg-bg-elevated rounded p-3 text-center">
      <div className="flex items-center justify-center gap-1 mb-0.5">
        <p className="text-xs text-content-muted">{label}</p>
        {hintKey && <MLHint hint={ML_HELP[hintKey]} />}
      </div>
      <p className="text-xl font-mono font-bold text-content-primary">{value}</p>
    </div>
  )
}

function SummaryChip({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-elevated rounded text-xs text-content-secondary">
      <span className="text-content-muted">{label}</span>
      <span className="font-semibold text-content-primary">{value}</span>
    </span>
  )
}

export default function ModelResults({ results }) {
  const {
    model_type, task, metrics, confusion_matrix, confusion_labels,
    class_breakdown, test_predictions,
    feature_importance, loss_history, parameter_count, architecture,
    train_samples, test_samples, training_time_ms,
    target,
  } = results

  const isClassification = task === 'classification'
  const lossData = loss_history?.map((loss, i) => ({ epoch: i + 1, loss })) || []

  const topFeatures = (feature_importance || []).slice(0, 12)
  const importanceData = topFeatures.map(f => ({ name: f.feature, value: f.importance }))

  return (
    <div className="space-y-4 min-w-0">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        <SummaryChip label="Model" value={model_type.replace(/_/g, ' ')} />
        <SummaryChip label="Task" value={task} />
        <SummaryChip label="Train" value={`${train_samples} rows`} />
        <SummaryChip label="Test" value={`${test_samples} rows`} />
        <SummaryChip label="Time" value={`${(training_time_ms / 1000).toFixed(1)}s`} />
        {parameter_count != null && (
          <SummaryChip label="Parameters" value={parameter_count.toLocaleString()} />
        )}
      </div>

      {/* Architecture */}
      {architecture && (
        <div className="card p-3">
          <p className="text-xs text-content-muted mb-1">Architecture</p>
          <p className="text-sm font-mono text-content-primary break-all">{architecture}</p>
        </div>
      )}

      {/* Metrics */}
      <div className="card p-4 space-y-3">
        <p className="text-xs font-semibold text-content-muted uppercase tracking-wider">Metrics</p>
        {isClassification ? (
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="Accuracy" value={`${(metrics.accuracy * 100).toFixed(1)}%`} hintKey="accuracy" />
            <MetricCard label="F1 Score" value={metrics.f1?.toFixed(3)} hintKey="f1" />
            <MetricCard label="Precision" value={metrics.precision?.toFixed(3)} hintKey="precision" />
            <MetricCard label="Recall" value={metrics.recall?.toFixed(3)} hintKey="recall" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <MetricCard label="R²" value={metrics.r2?.toFixed(3)} hintKey="r2" />
            <MetricCard label="RMSE" value={metrics.rmse?.toFixed(2)} hintKey="rmse" />
            <MetricCard label="MAE" value={metrics.mae?.toFixed(2)} hintKey="mae" />
          </div>
        )}
      </div>

      {/* Loss curve — NN only */}
      {lossData.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <p className="text-xs font-semibold text-content-muted uppercase tracking-wider">Training loss</p>
            <MLHint hint={ML_HELP.training_loss} />
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={lossData}>
              <XAxis dataKey="epoch" tick={{ fill: MUTED, fontSize: 11 }} label={{ value: 'Epoch', position: 'insideBottom', offset: -2, fill: MUTED, fontSize: 11 }} />
              <YAxis tick={{ fill: MUTED, fontSize: 11 }} width={55} />
              <Tooltip
                contentStyle={{ background: 'rgb(var(--color-bg-elevated))', border: `1px solid ${BORDER}`, borderRadius: 6 }}
                labelStyle={{ color: MUTED, fontSize: 11 }}
                itemStyle={{ color: 'rgb(var(--color-content-primary))', fontSize: 12 }}
              />
              <Line type="monotone" dataKey="loss" stroke="rgb(var(--color-brand))" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Feature importance */}
      {importanceData.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <p className="text-xs font-semibold text-content-muted uppercase tracking-wider">Feature importance</p>
            <MLHint hint={ML_HELP.feature_importance} />
          </div>
          <ResponsiveContainer width="100%" height={Math.min(280, Math.max(120, importanceData.length * 22))}>
            <BarChart data={importanceData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" tick={{ fill: MUTED, fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'rgb(var(--color-content-secondary))', fontSize: 11 }} width={110} />
              <Tooltip
                contentStyle={{ background: 'rgb(var(--color-bg-elevated))', border: `1px solid ${BORDER}`, borderRadius: 6 }}
                itemStyle={{ color: 'rgb(var(--color-content-primary))', fontSize: 12 }}
              />
              <Bar dataKey="value" fill="rgb(var(--color-brand))" fillOpacity={0.8} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Predicted vs Actual + residuals — regression */}
      {test_predictions && (
        <PredActualChart testPredictions={test_predictions} target={target || 'target'} />
      )}

      {/* Per-class precision/recall/F1 — classification */}
      {class_breakdown && (
        <ClassBreakdownChart classBreakdown={class_breakdown} />
      )}

      {/* Confusion matrix */}
      {confusion_matrix && confusion_labels && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-3">
            Confusion matrix <span className="normal-case font-normal">(rows = actual, cols = predicted)</span>
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs font-mono">
              <thead>
                <tr>
                  <th className="text-content-muted pr-2 text-right">actual \ pred</th>
                  {confusion_labels.map(l => (
                    <th key={l} className="px-2 py-1 text-content-secondary text-center">{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {confusion_matrix.map((row, ri) => {
                  const rowSum = row.reduce((a, b) => a + b, 0)
                  return (
                    <tr key={ri}>
                      <td className="text-content-secondary pr-2 text-right font-semibold">{confusion_labels[ri]}</td>
                      {row.map((val, ci) => {
                        const intensity = rowSum > 0 ? val / rowSum : 0
                        const isCorrect = ri === ci
                        return (
                          <td
                            key={ci}
                            className="px-2 py-1.5 text-center rounded"
                            style={{
                              background: isCorrect
                                ? `rgba(37,99,235,${Math.max(0.1, intensity)})`
                                : intensity > 0.05 ? `rgba(239,68,68,${intensity * 0.6})` : undefined,
                              color: intensity > 0.4 ? '#fff' : undefined,
                            }}
                          >
                            {val}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
