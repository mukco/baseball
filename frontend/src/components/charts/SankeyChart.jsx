import { useMemo } from 'react'

const PITCH_COLORS = {
  FF: '#D22D49', SI: '#FE9D00', FC: '#933F2C',
  SL: '#EEE716', ST: '#D2E338', CU: '#00D1ED',
  KC: '#01C8E3', CH: '#1DBE3A', FS: '#3BACAC',
  KN: '#9C9C9C', EP: '#5A5A5A',
}
function pitchColor(t) { return PITCH_COLORS[t] || '#9CA3AF' }

const OUTCOME_LABELS = {
  ball:            'Ball',
  called_strike:   'Called K',
  swinging_strike: 'Swing K',
  foul:            'Foul',
  in_play:         'In Play',
}
const OUTCOME_COLORS = {
  ball:            '#6B7280',
  called_strike:   '#60A5FA',
  swinging_strike: '#F87171',
  foul:            '#FCD34D',
  in_play:         '#4ADE80',
}
const OUTCOME_ORDER = ['ball', 'called_strike', 'swinging_strike', 'foul', 'in_play']

const VB_W = 420, VB_H = 300
const NODE_W = 16
const LEFT_X = 0, RIGHT_X = VB_W - NODE_W
const LINK_X1 = LEFT_X + NODE_W, LINK_X2 = RIGHT_X
const MID_X = (LINK_X1 + LINK_X2) / 2
const GAP = 5

function ribbonPath(x1, y1a, y1b, x2, y2a, y2b) {
  return [
    `M ${x1},${y1a}`,
    `C ${MID_X},${y1a} ${MID_X},${y2a} ${x2},${y2a}`,
    `L ${x2},${y2b}`,
    `C ${MID_X},${y2b} ${MID_X},${y1b} ${x1},${y1b}`,
    'Z',
  ].join(' ')
}

export default function SankeyChart({ pitchOutcomes = {} }) {
  const layout = useMemo(() => {
    const types = Object.keys(pitchOutcomes).filter(t => pitchOutcomes[t])
    if (!types.length) return null

    const totalPitches = types.reduce((s, t) =>
      s + OUTCOME_ORDER.reduce((ss, o) => ss + (pitchOutcomes[t][o] || 0), 0), 0)
    if (!totalPitches) return null

    const usable = VB_H - GAP * (types.length - 1)

    // Left nodes
    const leftNodes = []
    let yL = 0
    for (const type of types) {
      const typeTotal = OUTCOME_ORDER.reduce((s, o) => s + (pitchOutcomes[type][o] || 0), 0)
      const h = Math.max((typeTotal / totalPitches) * usable, 2)
      leftNodes.push({ type, y: yL, h, total: typeTotal, pct: (typeTotal / totalPitches * 100).toFixed(0) })
      yL += h + GAP
    }

    // Right nodes
    const outcomeTotals = Object.fromEntries(
      OUTCOME_ORDER.map(o => [o, types.reduce((s, t) => s + (pitchOutcomes[t][o] || 0), 0)])
    )
    const usableR = VB_H - GAP * (OUTCOME_ORDER.length - 1)
    const rightNodes = []
    let yR = 0
    for (const o of OUTCOME_ORDER) {
      const h = Math.max((outcomeTotals[o] / totalPitches) * usableR, 2)
      rightNodes.push({ outcome: o, y: yR, h, total: outcomeTotals[o], pct: (outcomeTotals[o] / totalPitches * 100).toFixed(0) })
      yR += h + GAP
    }

    // Links
    const leftOffsets  = Object.fromEntries(leftNodes.map(n => [n.type, n.y]))
    const rightOffsets = Object.fromEntries(rightNodes.map(n => [n.outcome, n.y]))

    const links = []
    for (const lNode of leftNodes) {
      for (const o of OUTCOME_ORDER) {
        const count = pitchOutcomes[lNode.type][o] || 0
        if (!count) continue
        const rNode = rightNodes.find(n => n.outcome === o)
        if (!rNode) continue

        const lh = (count / totalPitches) * usable
        const rh = (count / totalPitches) * usableR
        const y1a = leftOffsets[lNode.type]
        const y1b = y1a + lh
        const y2a = rightOffsets[o]
        const y2b = y2a + rh

        leftOffsets[lNode.type] = y1b
        rightOffsets[o] = y2b

        links.push({
          path:        ribbonPath(LINK_X1, y1a, y1b, LINK_X2, y2a, y2b),
          srcColor:    pitchColor(lNode.type),
          dstColor:    OUTCOME_COLORS[o],
          srcType:     lNode.type,
          outcome:     o,
          gradId:      `sg-${lNode.type}-${o}`,
          count,
        })
      }
    }

    return { leftNodes, rightNodes, links, total: totalPitches }
  }, [pitchOutcomes])

  if (!layout) {
    return (
      <div className="flex items-center justify-center h-40 text-content-muted text-sm">
        No pitch outcome data
      </div>
    )
  }

  const { leftNodes, rightNodes, links } = layout

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full">
      <defs>
        {links.map(l => (
          <linearGradient
            key={l.gradId}
            id={l.gradId}
            x1={LINK_X1} y1="0" x2={LINK_X2} y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%"   stopColor={l.srcColor} stopOpacity="0.65" />
            <stop offset="100%" stopColor={l.dstColor} stopOpacity="0.45" />
          </linearGradient>
        ))}
        <filter id="node-shadow" x="-10%" y="-5%" width="120%" height="110%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Gradient ribbons */}
      {links.map((l, i) => (
        <path
          key={i}
          d={l.path}
          fill={`url(#${l.gradId})`}
          stroke="none"
        />
      ))}

      {/* Left nodes — pitch types */}
      {leftNodes.map(n => {
        const color = pitchColor(n.type)
        return (
          <g key={n.type}>
            <defs>
              <linearGradient id={`ln-${n.type}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor={color} stopOpacity="1" />
                <stop offset="100%" stopColor={color} stopOpacity="0.7" />
              </linearGradient>
            </defs>
            <rect
              x={LEFT_X} y={n.y}
              width={NODE_W} height={Math.max(n.h, 3)}
              rx="3" fill={`url(#ln-${n.type})`}
              filter="url(#node-shadow)"
            />
            <text
              x={LEFT_X + NODE_W + 6} y={n.y + n.h / 2 - 2}
              fontSize={9} fill="rgba(255,255,255,0.9)" fontFamily="monospace" fontWeight="bold"
            >
              {n.type}
            </text>
            <text
              x={LEFT_X + NODE_W + 6} y={n.y + n.h / 2 + 9}
              fontSize={7.5} fill="rgba(255,255,255,0.45)" fontFamily="sans-serif"
            >
              {n.pct}%
            </text>
          </g>
        )
      })}

      {/* Right nodes — outcomes */}
      {rightNodes.map(n => {
        const color = OUTCOME_COLORS[n.outcome]
        return (
          <g key={n.outcome}>
            <defs>
              <linearGradient id={`rn-${n.outcome}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor={color} stopOpacity="1" />
                <stop offset="100%" stopColor={color} stopOpacity="0.7" />
              </linearGradient>
            </defs>
            <rect
              x={RIGHT_X} y={n.y}
              width={NODE_W} height={Math.max(n.h, 3)}
              rx="3" fill={`url(#rn-${n.outcome})`}
              filter="url(#node-shadow)"
            />
            <text
              x={RIGHT_X - 6} y={n.y + n.h / 2 - 2}
              fontSize={9} fill="rgba(255,255,255,0.9)" fontFamily="sans-serif" textAnchor="end"
            >
              {OUTCOME_LABELS[n.outcome]}
            </text>
            <text
              x={RIGHT_X - 6} y={n.y + n.h / 2 + 9}
              fontSize={7.5} fill="rgba(255,255,255,0.45)" fontFamily="sans-serif" textAnchor="end"
            >
              {n.pct}%
            </text>
          </g>
        )
      })}
    </svg>
  )
}
