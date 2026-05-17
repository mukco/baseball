import { useMemo } from 'react'
import { sankey, sankeyLeft, sankeyLinkHorizontal } from 'd3-sankey'
import { pitchColor, pitchLabel, OUTCOME_LABELS, OUTCOME_COLORS, OUTCOME_ORDER } from '../../lib/pitchColors'

const VB_W = 560
const VB_H = 300
// Wide side margins leave room for node labels outside the flow area
const MARGIN = { top: 32, right: 130, bottom: 12, left: 130 }

const linkPath = sankeyLinkHorizontal()

export default function SankeyChart({ pitchOutcomes = {} }) {
  const graph = useMemo(() => {
    const types = Object.keys(pitchOutcomes)
      .filter(t => OUTCOME_ORDER.some(o => (pitchOutcomes[t]?.[o] || 0) > 0))
    if (!types.length) return null

    types.sort((a, b) => {
      const sum = t => OUTCOME_ORDER.reduce((s, o) => s + (pitchOutcomes[t]?.[o] || 0), 0)
      return sum(b) - sum(a)
    })

    const activeOutcomes = OUTCOME_ORDER.filter(o =>
      types.some(t => (pitchOutcomes[t]?.[o] || 0) > 0)
    )

    const nodes = [
      ...types.map(t => ({ id: t, isLeft: true, label: pitchLabel(t), color: pitchColor(t) })),
      ...activeOutcomes.map(o => ({ id: `o_${o}`, isLeft: false, label: OUTCOME_LABELS[o], color: OUTCOME_COLORS[o] })),
    ]
    const nodeIdx = Object.fromEntries(nodes.map((n, i) => [n.id, i]))

    const links = []
    for (const type of types) {
      for (const outcome of activeOutcomes) {
        const value = pitchOutcomes[type]?.[outcome] || 0
        if (value > 0) links.push({ source: nodeIdx[type], target: nodeIdx[`o_${outcome}`], value })
      }
    }
    if (!links.length) return null

    const layout = sankey()
      .nodeWidth(10)
      .nodePadding(16)
      .extent([[MARGIN.left, MARGIN.top], [VB_W - MARGIN.right, VB_H - MARGIN.bottom]])
      .nodeAlign(sankeyLeft)

    return layout({
      nodes: nodes.map(n => ({ ...n })),
      links: links.map(l => ({ ...l })),
    })
  }, [pitchOutcomes])

  if (!graph) {
    return (
      <div className="flex items-center justify-center h-40 text-content-muted text-sm">
        No pitch outcome data
      </div>
    )
  }

  const totalPitches = graph.links.reduce((s, l) => s + l.value, 0)

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full" role="img" aria-label="Sankey diagram of pitch type outcomes">
      <defs>
        {graph.links.map((link) => {
          const id = `sg-${link.source.index}-${link.target.index}`
          return (
            <linearGradient key={id} id={id} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={link.source.color} stopOpacity="0.45" />
              <stop offset="100%" stopColor={link.target.color} stopOpacity="0.25" />
            </linearGradient>
          )
        })}
      </defs>

      {/* Column headers */}
      <text
        x={MARGIN.left - 16} y={18}
        textAnchor="end"
        fontSize="9" fontFamily="sans-serif" fontWeight="700" letterSpacing="0.8"
        fill="rgb(var(--color-content-muted))"
      >
        PITCH TYPE
      </text>
      <text
        x={VB_W - MARGIN.right + 16} y={18}
        textAnchor="start"
        fontSize="9" fontFamily="sans-serif" fontWeight="700" letterSpacing="0.8"
        fill="rgb(var(--color-content-muted))"
      >
        RESULT
      </text>

      {/* Flow links */}
      {graph.links.map((link, i) => {
        const id = `sg-${link.source.index}-${link.target.index}`
        return (
          <path
            key={i}
            d={linkPath(link)}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth={Math.max(1, link.width)}
            strokeOpacity={0.7}
          >
            <title>{`${link.source.label} → ${link.target.label}: ${link.value}`}</title>
          </path>
        )
      })}

      {/* Nodes + labels */}
      {graph.nodes.map((node) => {
        const nodeH = node.y1 - node.y0
        const midY = (node.y0 + node.y1) / 2
        const isLeft = node.isLeft
        const labelX = isLeft ? node.x0 - 14 : node.x1 + 14
        const anchor = isLeft ? 'end' : 'start'

        const nodeTotal = isLeft
          ? graph.links.filter(l => l.source.index === node.index).reduce((s, l) => s + l.value, 0)
          : graph.links.filter(l => l.target.index === node.index).reduce((s, l) => s + l.value, 0)
        const pct = totalPitches > 0 ? Math.round(nodeTotal / totalPitches * 100) : 0

        return (
          <g key={node.id}>
            {/* Node bar */}
            <rect
              x={node.x0} y={node.y0}
              width={node.x1 - node.x0}
              height={Math.max(2, nodeH)}
              fill={node.color}
              rx={2}
            />

            {/* Label */}
            <text
              x={labelX}
              y={midY - (nodeH > 18 ? 5 : 0)}
              textAnchor={anchor}
              fontSize={10}
              fontFamily="sans-serif"
              fontWeight="500"
              fill="rgb(var(--color-content-secondary))"
            >
              {node.label}
            </text>

            {/* Percentage — only when node is tall enough for two lines */}
            {nodeH > 18 && (
              <text
                x={labelX}
                y={midY + 8}
                textAnchor={anchor}
                fontSize={9}
                fontFamily="monospace"
                fill="rgb(var(--color-content-muted))"
              >
                {pct}%
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
