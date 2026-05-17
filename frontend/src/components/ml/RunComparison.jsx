import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'

function MetricRow({ label, a, b }) {
  if (a == null && b == null) return null
  const aNum = typeof a === 'number' ? a : null
  const bNum = typeof b === 'number' ? b : null
  const better = aNum != null && bNum != null
    ? (label === 'RMSE' || label === 'MAE' ? (aNum < bNum ? 'a' : aNum > bNum ? 'b' : null)
                                            : (aNum > bNum ? 'a' : aNum < bNum ? 'b' : null))
    : null

  return (
    <tr className="border-t border-bg-border">
      <td className="py-1.5 pr-3 text-xs text-content-muted">{label}</td>
      <td className={`py-1.5 px-2 text-xs font-mono text-center ${better === 'a' ? 'text-green-400 font-bold' : 'text-content-primary'}`}>
        {aNum != null ? aNum.toFixed(4) : '—'}
      </td>
      <td className={`py-1.5 px-2 text-xs font-mono text-center ${better === 'b' ? 'text-green-400 font-bold' : 'text-content-primary'}`}>
        {bNum != null ? bNum.toFixed(4) : '—'}
      </td>
    </tr>
  )
}

function metricsRows(task, m) {
  if (task === 'regression') {
    return [
      { label: 'R²',   val: m?.r2 },
      { label: 'RMSE', val: m?.rmse },
      { label: 'MAE',  val: m?.mae },
    ]
  }
  return [
    { label: 'Accuracy',  val: m?.accuracy },
    { label: 'F1',        val: m?.f1 },
    { label: 'Precision', val: m?.precision },
    { label: 'Recall',    val: m?.recall },
  ]
}

function shortLabel(run) {
  const c = run.config
  return `${(c.model_type || '').replace(/_/g, ' ')} / ${c.target || '?'}`
}

function FeatureCompare({ runA, runB }) {
  const fiA = Object.fromEntries((runA.result?.feature_importance || []).map(f => [f.feature, f.importance]))
  const fiB = Object.fromEntries((runB.result?.feature_importance || []).map(f => [f.feature, f.importance]))
  const allFeatures = Array.from(new Set([...Object.keys(fiA), ...Object.keys(fiB)]))
  if (allFeatures.length === 0) return null

  const data = allFeatures
    .map(f => ({ feature: f, A: +(fiA[f] || 0).toFixed(4), B: +(fiB[f] || 0).toFixed(4) }))
    .sort((x, y) => (y.A + y.B) - (x.A + x.B))
    .slice(0, 12)

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-3">
        Feature importance comparison
      </p>
      <ResponsiveContainer width="100%" height={Math.max(140, data.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" tick={{ fill: '#7A90AF', fontSize: 10 }} />
          <YAxis type="category" dataKey="feature" tick={{ fill: '#E8EDF5', fontSize: 11 }} width={110} />
          <Tooltip
            contentStyle={{ background: '#0D1A2D', border: '1px solid #1C3050', borderRadius: 6 }}
            itemStyle={{ color: '#E8EDF5', fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#7A90AF' }} />
          <Bar dataKey="A" name={shortLabel(runA).slice(0, 20)} fill="#2563EB" radius={[0, 3, 3, 0]} barSize={8} />
          <Bar dataKey="B" name={shortLabel(runB).slice(0, 20)} fill="#9333EA" radius={[0, 3, 3, 0]} barSize={8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function RunComparison({ runA, runB, onClose }) {
  if (!runA || !runB) return null
  const task = runA.result?.task || runB.result?.task || 'regression'
  const rowsA = metricsRows(task, runA.result?.metrics)
  const rowsB = metricsRows(task, runB.result?.metrics)

  function configRow(label, fn) {
    const va = fn(runA.config)
    const vb = fn(runB.config)
    return { label, a: va, b: vb, diff: va !== vb }
  }

  const configRows = [
    configRow('Model',    c => (c.model_type || '').replace(/_/g, ' ')),
    configRow('Table',    c => c.table || '—'),
    configRow('Target',   c => c.target || '—'),
    configRow('Features', c => (c.features || []).length + ' cols'),
    configRow('Task',     c => c.task || '—'),
    configRow('Test size',c => `${((c.test_size || 0.2) * 100).toFixed(0)}%`),
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content-primary">Run comparison</h3>
        <button onClick={onClose} className="text-xs text-content-muted hover:text-content-primary transition-colors">
          ✕ Close
        </button>
      </div>

      {/* Config diff */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">Configuration</p>
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left text-xs text-content-muted pb-1 w-24" />
              <th className="text-center text-xs font-semibold text-brand pb-1">Run A</th>
              <th className="text-center text-xs font-semibold text-purple-400 pb-1">Run B</th>
            </tr>
          </thead>
          <tbody>
            {configRows.map(({ label, a, b, diff }) => (
              <tr key={label} className={`border-t border-bg-border ${diff ? 'bg-yellow-900/10' : ''}`}>
                <td className="py-1.5 pr-3 text-xs text-content-muted">{label}</td>
                <td className="py-1.5 px-2 text-xs text-content-primary text-center">{String(a)}</td>
                <td className="py-1.5 px-2 text-xs text-content-primary text-center">{String(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Metrics diff */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
          Metrics <span className="normal-case font-normal">(green = better)</span>
        </p>
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left text-xs text-content-muted pb-1 w-24" />
              <th className="text-center text-xs font-semibold text-brand pb-1">Run A</th>
              <th className="text-center text-xs font-semibold text-purple-400 pb-1">Run B</th>
            </tr>
          </thead>
          <tbody>
            {rowsA.map(({ label }, i) => (
              <MetricRow key={label} label={label} a={rowsA[i].val} b={rowsB[i].val} />
            ))}
          </tbody>
        </table>
      </div>

      <FeatureCompare runA={runA} runB={runB} />
    </div>
  )
}
