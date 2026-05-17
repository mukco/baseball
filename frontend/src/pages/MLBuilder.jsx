import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { STAT_HELP, STAT_ALIASES } from '../lib/statHelp'
import { calcNNParams } from '../lib/mlUtils'
import NNExplainer from '../components/ml/NNExplainer'
import LayerBuilder from '../components/ml/LayerBuilder'
import ModelResults from '../components/ml/ModelResults'
import RunHistory from '../components/ml/RunHistory'
import RunComparison from '../components/ml/RunComparison'

// ── Constants ──────────────────────────────────────────────────────────────────

const TABLES = [
  { value: 'batters',                  label: 'Batters (warehouse)' },
  { value: 'pitchers',                 label: 'Pitchers (warehouse)' },
  { value: 'teams_batting',            label: 'Teams — Batting' },
  { value: 'teams_pitching',           label: 'Teams — Pitching' },
  { value: 'fg_projections_batting',   label: 'FG Projections — Batting' },
  { value: 'fg_projections_pitching',  label: 'FG Projections — Pitching' },
]

const MODEL_TYPES = [
  { value: 'linear_regression',    label: 'Linear Regression',    task: 'regression' },
  { value: 'logistic_regression',  label: 'Logistic Regression',  task: 'classification' },
  { value: 'random_forest',        label: 'Random Forest',        task: 'both' },
  { value: 'gradient_boosting',    label: 'Gradient Boosting',    task: 'both' },
  { value: 'neural_network',       label: 'Neural Network',       task: 'both' },
]

const DEFAULT_LAYERS = [{ neurons: 64 }, { neurons: 32 }]

const DEFAULT_HYPERPARAMS = {
  linear_regression:   { regularization: 'none', alpha: 1.0 },
  logistic_regression: { C: 1.0, penalty: 'l2' },
  random_forest:       { n_estimators: 100, max_depth: '' },
  gradient_boosting:   { n_estimators: 100, learning_rate: 0.1, max_depth: 3 },
  neural_network:      { activation: 'relu', learning_rate: 0.001, epochs: 50, dropout: 0.0 },
}

function statHelp(colName) {
  const key = STAT_ALIASES[colName] || colName
  return STAT_HELP[key]?.description || null
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ColumnBadge({ name, selected, onClick }) {
  const help = statHelp(name)
  return (
    <button
      title={help || name}
      onClick={onClick}
      className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
        selected
          ? 'bg-brand text-white'
          : 'bg-bg-elevated text-content-secondary hover:text-content-primary hover:bg-bg-border'
      }`}
    >
      {name}
    </button>
  )
}

function SectionLabel({ children }) {
  return <p className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">{children}</p>
}

function HyperparamInput({ label, type = 'number', value, onChange, options, min, max, step, help }) {
  return (
    <div title={help}>
      <label className="text-xs text-content-secondary block mb-1">{label}</label>
      {options ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-bg-elevated border border-bg-border rounded px-2 py-1 text-sm text-content-primary"
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-bg-elevated border border-bg-border rounded px-2 py-1 text-sm text-content-primary font-mono"
        />
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MLBuilder() {
  const qc = useQueryClient()
  const [table, setTable]           = useState('batters')
  const [features, setFeatures]     = useState([])
  const [target, setTarget]         = useState('')
  const [task, setTask]             = useState('regression')
  const [modelType, setModelType]   = useState('random_forest')
  const [hyperparams, setHyperparams] = useState({ ...DEFAULT_HYPERPARAMS.random_forest })
  const [layers, setLayers]         = useState(DEFAULT_LAYERS)
  const [oneHot, setOneHot]         = useState(false)
  const [targetBins, setTargetBins] = useState(4)
  const [testSize, setTestSize]     = useState(0.2)
  const [explainerOpen, setExplainerOpen] = useState(false)
  const [results, setResults]       = useState(null)
  const [activeRunId, setActiveRunId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [compareRunA, setCompareRunA] = useState(null)
  const [compareRunB, setCompareRunB] = useState(null)

  // Fetch column list for selected table
  const { data: columnsData, isLoading: colsLoading, error: colsError } = useQuery({
    queryKey: ['ml-columns', table],
    queryFn: () => api.ml.columns(table),
    staleTime: 30 * 60 * 1000,
    retry: false,
  })

  const allColumns = useMemo(() => columnsData?.columns?.map(c => c.name) || [], [columnsData])
  const numericColumns = useMemo(() =>
    columnsData?.columns?.filter(c => ['double', 'float', 'integer', 'bigint', 'float32', 'float64'].some(t => c.type?.toLowerCase().includes(t))).map(c => c.name) || [],
    [columnsData]
  )

  // Compute parameter count for NN
  const nnParamCount = useMemo(() => {
    if (modelType !== 'neural_network') return null
    const outputSize = task === 'classification' ? (oneHot ? targetBins : 2) : 1
    return calcNNParams(features.length || 1, layers, outputSize)
  }, [modelType, features.length, layers, task, oneHot, targetBins])

  const trainMutation = useMutation({
    mutationFn: (config) => api.ml.train(config),
    onSuccess: (data) => {
      setResults(data)
      setActiveRunId(data.run_id || null)
      qc.invalidateQueries({ queryKey: ['ml-runs'] })
    },
  })

  function toggleFeature(col) {
    setFeatures(f => f.includes(col) ? f.filter(x => x !== col) : [...f, col])
  }

  function handleModelTypeChange(mt) {
    setModelType(mt)
    setHyperparams({ ...DEFAULT_HYPERPARAMS[mt] })
    const def = MODEL_TYPES.find(m => m.value === mt)
    if (def?.task === 'regression') setTask('regression')
    if (def?.task === 'classification') setTask('classification')
  }

  function handleHp(key, value) {
    setHyperparams(prev => ({ ...prev, [key]: value }))
  }

  function handleLoadRun(run) {
    const result = { ...run.result, target: run.config?.target }
    setResults(result)
    setActiveRunId(run.id)
    setCompareMode(false)
    // Restore config state so the form reflects the loaded run
    const c = run.config || {}
    if (c.table)      setTable(c.table)
    if (c.features)   setFeatures(c.features)
    if (c.target)     setTarget(c.target)
    if (c.task)       setTask(c.task)
    if (c.model_type) { setModelType(c.model_type); setHyperparams({ ...DEFAULT_HYPERPARAMS[c.model_type], ...(c.hyperparams || {}) }) }
    if (c.one_hot_target != null) setOneHot(c.one_hot_target)
    if (c.target_bins)  setTargetBins(c.target_bins)
    if (c.test_size)    setTestSize(c.test_size)
  }

  function handleStartCompare() {
    setCompareMode(true)
    setCompareRunA(null)
    setCompareRunB(null)
    setHistoryOpen(true)
  }

  function handleCompareSelect(run) {
    if (!compareRunA) { setCompareRunA(run); return }
    if (!compareRunB) { setCompareRunB(run); return }
    setCompareRunA(run); setCompareRunB(null)
  }

  function handleTrain() {
    const config = {
      table,
      features,
      target,
      task,
      model_type: modelType,
      one_hot_target: oneHot,
      target_bins: targetBins,
      test_size: testSize,
      hyperparams: modelType === 'neural_network'
        ? { ...hyperparams, layers: layers.map(l => l.neurons) }
        : hyperparams,
      filters: {},
    }
    setResults(null)
    setActiveRunId(null)
    trainMutation.mutate(config)
  }

  const canTrain = features.length > 0 && target && !features.includes(target)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">ML Model Builder</h1>
          <p className="text-content-secondary text-sm mt-1">
            Train machine learning models on warehouse stats. Runs are saved automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className={`btn-ghost text-sm flex items-center gap-1.5 ${historyOpen ? 'text-brand' : ''}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </button>
          <button
            onClick={() => setExplainerOpen(o => !o)}
            className="btn-ghost text-sm flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4m0-4h.01" />
            </svg>
            How it works
          </button>
        </div>
      </div>

      {explainerOpen && <NNExplainer onClose={() => setExplainerOpen(false)} />}

      {/* Run history panel */}
      {historyOpen && (
        <div className="card p-4">
          {compareMode && compareRunA && compareRunB ? (
            <RunComparison
              runA={compareRunA}
              runB={compareRunB}
              onClose={() => { setCompareMode(false); setCompareRunA(null); setCompareRunB(null) }}
            />
          ) : (
            <RunHistory
              selectedRunId={activeRunId}
              compareRunId={compareMode ? (compareRunA?.id || null) : null}
              onLoad={compareMode ? handleCompareSelect : handleLoadRun}
              onCompare={handleStartCompare}
            />
          )}
          {compareMode && (!compareRunA || !compareRunB) && (
            <p className="text-xs text-content-muted mt-3 px-1">
              {!compareRunA ? 'Click a run to select as Run A.' : 'Click another run to select as Run B.'}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left: Configuration ────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Table */}
          <div className="card p-4 space-y-3">
            <SectionLabel>Data source</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {TABLES.map(t => (
                <button
                  key={t.value}
                  onClick={() => { setTable(t.value); setFeatures([]); setTarget('') }}
                  className={`text-left px-3 py-2 rounded text-sm transition-colors ${
                    table === t.value ? 'tab-active' : 'tab-inactive'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Columns */}
          <div className="card p-4 space-y-4">
            <SectionLabel>Feature columns <span className="text-brand normal-case font-normal">({features.length} selected)</span></SectionLabel>
            {colsLoading && <p className="text-content-muted text-sm">Loading columns…</p>}
            {(colsError || columnsData?.error) && (
              <p className="text-red-400 text-sm">ML service unavailable — start it with <code className="font-mono text-xs bg-bg-elevated px-1 py-0.5 rounded">python3 ml_service/main.py</code> from the project root.</p>
            )}
            {!colsLoading && !columnsData?.error && allColumns.length > 0 && (
              <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                {numericColumns.filter(c => c !== target).map(col => (
                  <ColumnBadge
                    key={col}
                    name={col}
                    selected={features.includes(col)}
                    onClick={() => toggleFeature(col)}
                  />
                ))}
              </div>
            )}

            <div className="border-t border-bg-border pt-3">
              <SectionLabel>Target column</SectionLabel>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {numericColumns.filter(c => !features.includes(c)).map(col => (
                  <button
                    key={col}
                    title={statHelp(col) || col}
                    onClick={() => setTarget(col)}
                    className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                      target === col
                        ? 'bg-amber-500 text-white'
                        : 'bg-bg-elevated text-content-secondary hover:text-content-primary hover:bg-bg-border'
                    }`}
                  >
                    {col}
                  </button>
                ))}
              </div>
              {target && (
                <p className="text-xs text-amber-400 mt-1.5">
                  Target: <span className="font-mono">{target}</span>
                  {statHelp(target) && <span className="text-content-muted ml-1">— {statHelp(target)}</span>}
                </p>
              )}
            </div>
          </div>

          {/* Task */}
          <div className="card p-4 space-y-3">
            <SectionLabel>Task</SectionLabel>
            <div className="flex gap-2">
              {['regression', 'classification'].map(t => (
                <button
                  key={t}
                  onClick={() => setTask(t)}
                  disabled={MODEL_TYPES.find(m => m.value === modelType)?.task === (t === 'regression' ? 'classification' : 'regression')}
                  className={`flex-1 px-3 py-2 rounded text-sm capitalize transition-colors disabled:opacity-40 ${
                    task === t ? 'tab-active' : 'tab-inactive'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {task === 'classification' && (
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-sm text-content-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={oneHot}
                    onChange={e => setOneHot(e.target.checked)}
                    className="accent-brand"
                  />
                  One-hot encode target (bin continuous column into classes)
                </label>
                {oneHot && (
                  <HyperparamInput
                    label="Number of bins (quantile-based)"
                    value={targetBins}
                    onChange={v => setTargetBins(Number(v))}
                    min={2} max={10} step={1}
                    help="Divides the target column into N equal-frequency buckets, each becoming a class label."
                  />
                )}
              </div>
            )}
            <div>
              <label className="text-xs text-content-secondary block mb-1" title="Fraction of rows held back for evaluation (not used during training).">
                Test split
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={0.1} max={0.4} step={0.05}
                  value={testSize}
                  onChange={e => setTestSize(Number(e.target.value))}
                  className="flex-1 accent-brand"
                />
                <span className="text-sm font-mono text-content-primary w-10">{Math.round(testSize * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Model type */}
          <div className="card p-4 space-y-3">
            <SectionLabel>Model type</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {MODEL_TYPES.map(m => (
                <button
                  key={m.value}
                  onClick={() => handleModelTypeChange(m.value)}
                  className={`text-left px-3 py-2 rounded text-sm transition-colors ${
                    modelType === m.value ? 'tab-active' : 'tab-inactive'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Hyperparameters */}
            <div className="pt-2 border-t border-bg-border space-y-3">
              <SectionLabel>Hyperparameters</SectionLabel>

              {modelType === 'linear_regression' && (
                <>
                  <HyperparamInput label="Regularization" value={hyperparams.regularization} onChange={v => handleHp('regularization', v)}
                    options={[{value:'none',label:'None'},{value:'l2',label:'L2 (Ridge)'},{value:'l1',label:'L1 (Lasso)'}]}
                    help="L2 penalizes large weights evenly. L1 drives some weights to zero (feature selection)." />
                  {hyperparams.regularization !== 'none' && (
                    <HyperparamInput label="Alpha (strength)" value={hyperparams.alpha} onChange={v => handleHp('alpha', v)}
                      min={0.001} max={100} step={0.1}
                      help="Higher alpha = stronger regularization = simpler model." />
                  )}
                </>
              )}

              {modelType === 'logistic_regression' && (
                <>
                  <HyperparamInput label="C (inverse regularization)" value={hyperparams.C} onChange={v => handleHp('C', v)}
                    min={0.001} max={100} step={0.1}
                    help="Smaller C = stronger regularization. Larger C = less regularization, closer fit to training data." />
                  <HyperparamInput label="Penalty" value={hyperparams.penalty} onChange={v => handleHp('penalty', v)}
                    options={[{value:'l2',label:'L2 (default)'},{value:'l1',label:'L1'}]}
                    help="L1 can zero out unimportant features. L2 is more numerically stable." />
                </>
              )}

              {modelType === 'random_forest' && (
                <>
                  <HyperparamInput label="Trees (n_estimators)" value={hyperparams.n_estimators} onChange={v => handleHp('n_estimators', v)}
                    min={10} max={500} step={10}
                    help="More trees = more stable predictions but slower training. 100 is a good default." />
                  <HyperparamInput label="Max depth (blank = unlimited)" value={hyperparams.max_depth} onChange={v => handleHp('max_depth', v)}
                    min={1} max={50} step={1}
                    help="Limits how deep each tree can grow. Deeper trees can overfit; shallower trees underfit." />
                </>
              )}

              {modelType === 'gradient_boosting' && (
                <>
                  <HyperparamInput label="Trees (n_estimators)" value={hyperparams.n_estimators} onChange={v => handleHp('n_estimators', v)}
                    min={10} max={500} step={10}
                    help="Each tree corrects the errors of the previous one. More trees can overfit." />
                  <HyperparamInput label="Learning rate" value={hyperparams.learning_rate} onChange={v => handleHp('learning_rate', v)}
                    min={0.001} max={1} step={0.01}
                    help="How much each tree contributes. Lower = slower learning but often better generalization." />
                  <HyperparamInput label="Max depth" value={hyperparams.max_depth} onChange={v => handleHp('max_depth', v)}
                    min={1} max={10} step={1}
                    help="Deeper trees capture more complex patterns but are more prone to overfitting." />
                </>
              )}

              {modelType === 'neural_network' && (
                <>
                  <LayerBuilder layers={layers} onChange={setLayers} />

                  {features.length > 0 && (
                    <div className="bg-bg-elevated rounded p-2 flex items-center justify-between">
                      <span className="text-xs text-content-secondary">Total parameters</span>
                      <span className="text-sm font-mono font-bold text-brand">
                        {nnParamCount?.toLocaleString()}
                      </span>
                    </div>
                  )}

                  <HyperparamInput label="Activation function" value={hyperparams.activation} onChange={v => handleHp('activation', v)}
                    options={[
                      {value:'relu',    label:'ReLU (recommended)'},
                      {value:'tanh',    label:'Tanh'},
                      {value:'sigmoid', label:'Sigmoid'},
                      {value:'leaky_relu', label:'Leaky ReLU'},
                    ]}
                    help="ReLU is the default for most tasks — fast and effective. Tanh outputs [-1,1] which can help with symmetric data." />
                  <HyperparamInput label="Learning rate" value={hyperparams.learning_rate} onChange={v => handleHp('learning_rate', v)}
                    min={0.0001} max={0.1} step={0.0001}
                    help="How fast the network updates its weights. Too high = unstable training. Too low = slow convergence." />
                  <HyperparamInput label="Epochs" value={hyperparams.epochs} onChange={v => handleHp('epochs', v)}
                    min={5} max={500} step={5}
                    help="One epoch = one full pass through the training data. More epochs = more learning (up to a point)." />
                  <HyperparamInput label="Dropout" value={hyperparams.dropout} onChange={v => handleHp('dropout', v)}
                    min={0} max={0.8} step={0.05}
                    help="Randomly zeros out a fraction of neurons during training to prevent overfitting. 0 = disabled." />
                </>
              )}
            </div>
          </div>

          {/* Train button */}
          <button
            onClick={handleTrain}
            disabled={!canTrain || trainMutation.isPending}
            className="w-full btn-primary py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {trainMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Training…
              </span>
            ) : 'Train Model'}
          </button>
          {!canTrain && !trainMutation.isPending && (
            <p className="text-xs text-content-muted text-center">
              {features.length === 0 ? 'Select at least one feature column.' : 'Select a target column (different from features).'}
            </p>
          )}
          {trainMutation.error && (
            <p className="text-red-400 text-sm text-center">{trainMutation.error.message}</p>
          )}
        </div>

        {/* ── Right: Results ─────────────────────────────────────────────────── */}
        <div>
          {results ? (
            <ModelResults results={{ ...results, target: results.target || target }} />
          ) : (
            <div className="card p-8 flex flex-col items-center justify-center text-center min-h-64 text-content-muted">
              <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
                <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
              <p className="text-sm">Results will appear here after training.</p>
              <p className="text-xs mt-1">Configure and click <span className="text-content-secondary">Train Model</span> to begin.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
