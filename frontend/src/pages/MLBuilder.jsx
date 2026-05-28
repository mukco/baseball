import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { getStatHelp } from '../lib/statHelp'
import { calcNNParams } from '../lib/mlUtils'
import NNExplainer from '../components/ml/NNExplainer'
import LayerBuilder from '../components/ml/LayerBuilder'
import ModelResults from '../components/ml/ModelResults'
import RunHistory from '../components/ml/RunHistory'
import RunComparison from '../components/ml/RunComparison'
import MLHint from '../components/ml/MLHint'
import PlayerSearchInput from '../components/PlayerSearchInput'
import { ML_HELP } from '../lib/mlHelp'

// ── Constants ──────────────────────────────────────────────────────────────────

const TABLES = [
  { value: 'batters',                   label: 'Batters (warehouse)' },
  { value: 'pitchers',                  label: 'Pitchers (warehouse)' },
  { value: 'teams_batting',             label: 'Teams — Batting' },
  { value: 'teams_pitching',            label: 'Teams — Pitching' },
  { value: 'fg_projections_batting',    label: 'FG Projections — Batting' },
  { value: 'fg_projections_pitching',   label: 'FG Projections — Pitching' },
  { value: 'pitch_by_pitch',            label: 'Pitch by Pitch (Statcast)' },
]

const PLAYER_TABLES = new Set([
  'batters', 'pitchers',
  'fg_projections_batting', 'fg_projections_pitching',
  'pitch_by_pitch',
])

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

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatTooltip({ name, children }) {
  const [coords, setCoords] = useState(null)
  const help = getStatHelp(name)

  return (
    <div
      className="relative"
      onMouseEnter={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        setCoords({ x: rect.left, y: rect.top })
      }}
      onMouseLeave={() => setCoords(null)}
    >
      {children}
      {coords && help && createPortal(
        <div
          className="fixed z-[9999] w-64 bg-bg-elevated border border-bg-border rounded-lg p-3 shadow-2xl pointer-events-none"
          style={{ left: coords.x, top: coords.y - 8, transform: 'translateY(-100%)' }}
        >
          <p className="text-xs font-semibold text-content-primary mb-1">
            {help.label || name}
            {help.label && help.label !== name && (
              <span className="text-content-muted font-normal ml-1.5 font-mono">({name})</span>
            )}
          </p>
          <p className="text-xs text-content-secondary leading-snug">{help.definition}</p>
          {help.intuition && (
            <p className="text-xs text-content-muted leading-snug mt-1.5 italic">{help.intuition}</p>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

function ColumnBadge({ name, selected, onClick }) {
  return (
    <StatTooltip name={name}>
      <button
        onClick={onClick}
        className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
          selected
            ? 'bg-brand text-white'
            : 'bg-bg-elevated text-content-secondary hover:text-content-primary hover:bg-bg-border'
        }`}
      >
        {name}
      </button>
    </StatTooltip>
  )
}

function SectionLabel({ children, hint }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <p className="text-xs font-semibold text-content-muted uppercase tracking-wider">{children}</p>
      {hint && <MLHint hint={hint} />}
    </div>
  )
}

function HyperparamInput({ label, type = 'number', value, onChange, options, min, max, step, help, hintKey }) {
  return (
    <div title={help}>
      <div className="flex items-center gap-1 mb-1">
        <label className="text-xs text-content-secondary">{label}</label>
        {hintKey && <MLHint hint={ML_HELP[hintKey]} />}
      </div>
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
  const [selectedPlayer, setSelectedPlayer] = useState(null)
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
  const categoricalColumns = useMemo(() =>
    columnsData?.columns?.filter(c => c.type?.toLowerCase().includes('varchar')).map(c => c.name) || [],
    [columnsData]
  )
  const isCategoricalTarget = categoricalColumns.includes(target)

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
  }

  function handleCompareSelect(run) {
    if (!compareRunA) { setCompareRunA(run); return }
    if (!compareRunB) { setCompareRunB(run); return }
    setCompareRunA(run); setCompareRunB(null)
  }

  function handleTrain() {
    const filters = {}
    if (selectedPlayer) filters.player_id = selectedPlayer.id

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
      filters,
    }
    setResults(null)
    setActiveRunId(null)
    trainMutation.mutate(config)
  }

  const requiresPlayer = table === 'pitch_by_pitch'
  const canTrain = features.length > 0 && target && !features.includes(target) &&
    (!requiresPlayer || selectedPlayer != null)

  // Escape main's padding so we can fill the viewport height
  return (
    <div className="-my-8 -mx-4 sm:-mx-6 lg:-mx-8 flex flex-col bg-bg-base" style={{ height: 'calc(100vh - 4rem)' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-bg-border flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-content-primary leading-tight">ML Model Builder</h1>
          <p className="text-content-muted text-xs">Train models on warehouse stats · runs saved automatically</p>
        </div>
        <button
          onClick={() => setExplainerOpen(o => !o)}
          className={`btn-ghost text-xs flex items-center gap-1.5 ${explainerOpen ? 'text-brand' : ''}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4m0-4h.01" />
          </svg>
          How it works
        </button>
      </div>

      {explainerOpen && (
        <div className="border-b border-bg-border overflow-y-auto flex-shrink-0 max-h-80 px-5 py-4">
          <NNExplainer onClose={() => setExplainerOpen(false)} />
        </div>
      )}

      {/* ── Three panes ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Config pane ─────────────────────────────────────────────────── */}
        <div className="w-[300px] flex-shrink-0 border-r border-bg-border overflow-y-auto">
          <div className="p-4 space-y-4">

            {/* Data source */}
            <div>
              <SectionLabel>Data source</SectionLabel>
              <div className="grid grid-cols-1 gap-1">
                {TABLES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => { setTable(t.value); setFeatures([]); setTarget(''); setSelectedPlayer(null) }}
                    className={`text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
                      table === t.value ? 'tab-active' : 'tab-inactive'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Player filter */}
            {PLAYER_TABLES.has(table) && (
              <div>
                <SectionLabel>
                  Player filter
                  {requiresPlayer && <span className="text-brand normal-case font-normal ml-1">(required)</span>}
                </SectionLabel>
                <PlayerSearchInput
                  value={selectedPlayer}
                  onChange={setSelectedPlayer}
                  placeholder={requiresPlayer ? 'Select a player to fetch pitches…' : 'Filter to player…'}
                />
                {selectedPlayer && (
                  <p className="text-xs text-content-muted mt-1.5">
                    Training on <span className="text-content-secondary">{selectedPlayer.name}</span> rows only
                  </p>
                )}
                {requiresPlayer && !selectedPlayer && (
                  <p className="text-xs text-amber-500 mt-1.5">
                    A player is required — pitch-by-pitch data is fetched per player from Baseball Savant
                  </p>
                )}
              </div>
            )}

            {/* Features */}
            <div>
              <SectionLabel>Features <span className="text-brand normal-case font-normal">({features.length} selected)</span></SectionLabel>
              {colsLoading && <p className="text-content-muted text-xs">Loading columns…</p>}
              {(colsError || columnsData?.error) && (
                <p className="text-red-400 text-xs">ML service unavailable — run <code className="font-mono bg-bg-elevated px-1 rounded">python3 ml_service/main.py</code></p>
              )}
              {!colsLoading && !columnsData?.error && allColumns.length > 0 && (
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                  {numericColumns.filter(c => c !== target).map(col => (
                    <ColumnBadge key={col} name={col} selected={features.includes(col)} onClick={() => toggleFeature(col)} />
                  ))}
                </div>
              )}
            </div>

            {/* Target */}
            <div>
              <SectionLabel>Target</SectionLabel>
              {categoricalColumns.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs text-content-muted mb-1">Categorical</p>
                  <div className="flex flex-wrap gap-1">
                    {categoricalColumns.map(col => (
                      <StatTooltip key={col} name={col}>
                        <button
                          onClick={() => { setTarget(col); setTask('classification') }}
                          className={`px-2 py-0.5 rounded text-xs font-mono transition-colors border ${
                            target === col
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-bg-elevated text-content-secondary border-bg-border hover:text-content-primary hover:bg-bg-border'
                          }`}
                        >
                          {col}
                        </button>
                      </StatTooltip>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {numericColumns.filter(c => !features.includes(c)).map(col => (
                  <StatTooltip key={col} name={col}>
                    <button
                      onClick={() => setTarget(col)}
                      className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                        target === col
                          ? 'bg-amber-500 text-white'
                          : 'bg-bg-elevated text-content-secondary hover:text-content-primary hover:bg-bg-border'
                      }`}
                    >
                      {col}
                    </button>
                  </StatTooltip>
                ))}
              </div>
              {target && (
                <p className="text-xs text-amber-400 mt-1">
                  <span className="font-mono">{target}</span>
                  {isCategoricalTarget && <span className="text-content-muted ml-1">— categorical · classification only</span>}
                  {!isCategoricalTarget && getStatHelp(target) && <span className="text-content-muted ml-1">— {getStatHelp(target)?.definition}</span>}
                </p>
              )}
            </div>

            {/* Task */}
            <div>
              <SectionLabel>Task</SectionLabel>
              <div className="flex gap-1.5">
                {['regression', 'classification'].map(t => (
                  <button
                    key={t}
                    onClick={() => setTask(t)}
                    disabled={
                      (isCategoricalTarget && t === 'regression') ||
                      MODEL_TYPES.find(m => m.value === modelType)?.task === (t === 'regression' ? 'classification' : 'regression')
                    }
                    className={`flex-1 px-2 py-1.5 rounded text-xs capitalize transition-colors disabled:opacity-40 ${
                      task === t ? 'tab-active' : 'tab-inactive'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {task === 'classification' && (
                <div className="mt-2 space-y-2">
                  {!isCategoricalTarget && (
                    <label className="flex items-center gap-2 text-xs text-content-secondary cursor-pointer">
                      <input type="checkbox" checked={oneHot} onChange={e => setOneHot(e.target.checked)} className="accent-brand" />
                      Bin continuous target into classes
                      <MLHint hint={ML_HELP.one_hot} />
                    </label>
                  )}
                  {!isCategoricalTarget && oneHot && (
                    <HyperparamInput label="Number of bins" value={targetBins} onChange={v => setTargetBins(Number(v))} min={2} max={10} step={1} />
                  )}
                </div>
              )}
              <div className="mt-2">
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-xs text-content-secondary">Test split</label>
                  <MLHint hint={ML_HELP.test_split} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="range" min={0.1} max={0.4} step={0.05} value={testSize}
                    onChange={e => setTestSize(Number(e.target.value))} className="flex-1 accent-brand" />
                  <span className="text-xs font-mono text-content-primary w-8">{Math.round(testSize * 100)}%</span>
                </div>
              </div>
            </div>

            {/* Model type */}
            <div>
              <SectionLabel>Model</SectionLabel>
              <div className="grid grid-cols-1 gap-1">
                {MODEL_TYPES.map(m => (
                  <div key={m.value} className="flex items-center gap-1">
                    <button
                      onClick={() => handleModelTypeChange(m.value)}
                      className={`flex-1 text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
                        modelType === m.value ? 'tab-active' : 'tab-inactive'
                      }`}
                    >
                      {m.label}
                    </button>
                    <MLHint hint={ML_HELP[m.value]} />
                  </div>
                ))}
              </div>
            </div>

            {/* Hyperparameters */}
            <div>
              <SectionLabel hint={ML_HELP[modelType]}>Hyperparameters</SectionLabel>
              <div className="space-y-2.5">
                {modelType === 'linear_regression' && (
                  <>
                    <HyperparamInput label="Regularization" value={hyperparams.regularization} onChange={v => handleHp('regularization', v)}
                      options={[{value:'none',label:'None'},{value:'l2',label:'L2 (Ridge)'},{value:'l1',label:'L1 (Lasso)'}]}
                      hintKey="regularization" />
                    {hyperparams.regularization !== 'none' && (
                      <HyperparamInput label="Alpha" value={hyperparams.alpha} onChange={v => handleHp('alpha', v)} min={0.001} max={100} step={0.1} />
                    )}
                  </>
                )}
                {modelType === 'logistic_regression' && (
                  <>
                    <HyperparamInput label="C (inverse reg.)" value={hyperparams.C} onChange={v => handleHp('C', v)} min={0.001} max={100} step={0.1}
                      hintKey="c_param" />
                    <HyperparamInput label="Penalty" value={hyperparams.penalty} onChange={v => handleHp('penalty', v)}
                      options={[{value:'l2',label:'L2 (default)'},{value:'l1',label:'L1'}]} />
                  </>
                )}
                {modelType === 'random_forest' && (
                  <>
                    <HyperparamInput label="Trees" value={hyperparams.n_estimators} onChange={v => handleHp('n_estimators', v)} min={10} max={500} step={10}
                      hintKey="n_estimators" />
                    <HyperparamInput label="Max depth (blank = unlimited)" value={hyperparams.max_depth} onChange={v => handleHp('max_depth', v)} min={1} max={50} step={1}
                      hintKey="max_depth" />
                  </>
                )}
                {modelType === 'gradient_boosting' && (
                  <>
                    <HyperparamInput label="Trees" value={hyperparams.n_estimators} onChange={v => handleHp('n_estimators', v)} min={10} max={500} step={10}
                      hintKey="n_estimators" />
                    <HyperparamInput label="Learning rate" value={hyperparams.learning_rate} onChange={v => handleHp('learning_rate', v)} min={0.001} max={1} step={0.01}
                      hintKey="learning_rate" />
                    <HyperparamInput label="Max depth" value={hyperparams.max_depth} onChange={v => handleHp('max_depth', v)} min={1} max={10} step={1}
                      hintKey="max_depth" />
                  </>
                )}
                {modelType === 'neural_network' && (
                  <>
                    <LayerBuilder layers={layers} onChange={setLayers} />
                    {features.length > 0 && (
                      <div className="bg-bg-elevated rounded px-2.5 py-1.5 flex items-center justify-between">
                        <span className="text-xs text-content-secondary">Parameters</span>
                        <span className="text-xs font-mono font-bold text-brand">{nnParamCount?.toLocaleString()}</span>
                      </div>
                    )}
                    <HyperparamInput label="Activation" value={hyperparams.activation} onChange={v => handleHp('activation', v)}
                      options={[{value:'relu',label:'ReLU'},{value:'tanh',label:'Tanh'},{value:'sigmoid',label:'Sigmoid'},{value:'leaky_relu',label:'Leaky ReLU'}]}
                      hintKey="activation" />
                    <HyperparamInput label="Learning rate" value={hyperparams.learning_rate} onChange={v => handleHp('learning_rate', v)} min={0.0001} max={0.1} step={0.0001}
                      hintKey="learning_rate" />
                    <HyperparamInput label="Epochs" value={hyperparams.epochs} onChange={v => handleHp('epochs', v)} min={5} max={500} step={5}
                      hintKey="epochs" />
                    <HyperparamInput label="Dropout" value={hyperparams.dropout} onChange={v => handleHp('dropout', v)} min={0} max={0.8} step={0.05}
                      hintKey="dropout" />
                  </>
                )}
              </div>
            </div>

            {/* Train */}
            <div className="pt-1 space-y-2">
              <button
                onClick={handleTrain}
                disabled={!canTrain || trainMutation.isPending}
                className="w-full btn-primary py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {trainMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Training…
                  </span>
                ) : 'Train Model'}
              </button>
              {!canTrain && !trainMutation.isPending && (
                <p className="text-xs text-content-muted text-center">
                  {requiresPlayer && !selectedPlayer
                    ? 'Select a player to fetch pitch-by-pitch data.'
                    : features.length === 0
                    ? 'Select at least one feature.'
                    : 'Select a target column.'}
                </p>
              )}
              {trainMutation.error && (
                <p className="text-red-400 text-xs text-center">{trainMutation.error.message}</p>
              )}
            </div>

          </div>
        </div>

        {/* ── Results pane ────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="p-5">
            {results ? (
              <ModelResults results={{ ...results, target: results.target || target }} />
            ) : (
              <div className="flex flex-col items-center justify-center text-center h-full min-h-64 text-content-muted pt-20">
                <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
                  <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
                <p className="text-sm">Results will appear here after training.</p>
                <p className="text-xs mt-1 text-content-muted">Configure features and target, then click <span className="text-content-secondary">Train Model</span>.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── History pane ─────────────────────────────────────────────────── */}
        <div className="w-[260px] flex-shrink-0 border-l border-bg-border overflow-y-auto">
          <div className="p-4">
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
        </div>

      </div>
    </div>
  )
}
