// Interactive NN layer configuration: add/remove layers, set neuron count per layer.

export default function LayerBuilder({ layers, onChange }) {
  function update(index, neurons) {
    const next = layers.map((l, i) => i === index ? { neurons: Math.max(1, Number(neurons)) } : l)
    onChange(next)
  }

  function add() {
    onChange([...layers, { neurons: 32 }])
  }

  function remove(index) {
    onChange(layers.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <label className="text-xs text-content-secondary block">
        Hidden layers
        <span className="ml-1 text-content-muted">(input + output layers added automatically)</span>
      </label>

      {layers.length === 0 && (
        <p className="text-xs text-content-muted italic">No hidden layers — model is linear.</p>
      )}

      {layers.map((layer, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-content-muted w-14 shrink-0">Layer {i + 1}</span>
          <input
            type="number"
            min={1}
            max={2048}
            value={layer.neurons}
            onChange={e => update(i, e.target.value)}
            className="flex-1 bg-bg-elevated border border-bg-border rounded px-2 py-1 text-sm font-mono text-content-primary"
          />
          <span className="text-xs text-content-muted shrink-0">neurons</span>
          <button
            onClick={() => remove(i)}
            className="text-content-muted hover:text-red-400 transition-colors shrink-0"
            title="Remove layer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      ))}

      <button
        onClick={add}
        className="text-xs text-brand hover:text-brand-light transition-colors flex items-center gap-1 mt-1"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path d="M12 4v16m8-8H4"/>
        </svg>
        Add layer
      </button>

      {/* Architecture diagram */}
      {layers.length > 0 && (
        <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1 flex-wrap">
          <ArchNode label="Input" sub="features" color="bg-bg-border" />
          <Arrow />
          {layers.map((l, i) => (
            <span key={i} className="flex items-center gap-1">
              <ArchNode label={l.neurons} sub="ReLU" color="bg-brand/20 border border-brand/30" />
              <Arrow />
            </span>
          ))}
          <ArchNode label="Output" sub="target" color="bg-amber-500/20 border border-amber-500/30" />
        </div>
      )}
    </div>
  )
}

function ArchNode({ label, sub, color }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded px-2 py-1.5 min-w-12 ${color}`}>
      <span className="text-xs font-mono font-bold text-content-primary">{label}</span>
      <span className="text-[10px] text-content-muted">{sub}</span>
    </div>
  )
}

function Arrow() {
  return <span className="text-content-muted text-xs shrink-0">→</span>
}
