import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'

export default function ClassBreakdownChart({ classBreakdown }) {
  if (!classBreakdown || classBreakdown.length === 0) return null

  const data = classBreakdown.map(c => ({
    name: c.class,
    Precision: c.precision,
    Recall: c.recall,
    F1: c.f1,
    support: c.support,
  }))

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-1">
        Per-class precision / recall / F1
      </p>
      <p className="text-xs text-content-muted mb-3">
        Support (n rows) shown in tooltip. Weak classes often have small support — check your bins.
      </p>
      <ResponsiveContainer width="100%" height={Math.max(160, classBreakdown.length * 50)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4 }}>
          <XAxis type="number" domain={[0, 1]} tick={{ fill: '#7A90AF', fontSize: 10 }} />
          <YAxis type="category" dataKey="name" tick={{ fill: '#E8EDF5', fontSize: 11 }} width={72} />
          <Tooltip
            contentStyle={{ background: '#0D1A2D', border: '1px solid #1C3050', borderRadius: 6 }}
            itemStyle={{ color: '#E8EDF5', fontSize: 12 }}
            formatter={(val, name, props) => {
              const extra = name === 'Precision' ? ` (n=${props.payload.support})` : ''
              return [`${val.toFixed(3)}${extra}`, name]
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#7A90AF' }} />
          <Bar dataKey="Precision" fill="#2563EB" radius={[0, 3, 3, 0]} barSize={8} />
          <Bar dataKey="Recall"    fill="#16A34A" radius={[0, 3, 3, 0]} barSize={8} />
          <Bar dataKey="F1"        fill="#9333EA" radius={[0, 3, 3, 0]} barSize={8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
