import { useMemo } from 'react'

const PITCH_COLORS = {
  FF: '#D22D49', SI: '#FE9D00', FC: '#933F2C',
  SL: '#EEE716', ST: '#D2E338', CU: '#00D1ED',
  KC: '#01C8E3', CH: '#1DBE3A', FS: '#3BACAC',
  KN: '#9C9C9C', EP: '#5A5A5A',
}
function pitchColor(type) { return PITCH_COLORS[type] || '#9CA3AF' }

const VB_W = 340, VB_H = 300
const PAD  = { top: 16, right: 16, bottom: 44, left: 44 }
const CW   = VB_W - PAD.left - PAD.right
const CH   = VB_H - PAD.top  - PAD.bottom

const H_MIN = -25, H_MAX = 25
const V_MIN = -30, V_MAX = 30

function mapH(h) { return PAD.left + (h - H_MIN) / (H_MAX - H_MIN) * CW }
function mapV(v) { return VB_H - PAD.bottom - (v - V_MIN) / (V_MAX - V_MIN) * CH }

export default function PitchMovementChart({ data = [] }) {
  const averages = useMemo(() => {
    const byType = {}
    for (const d of data) {
      if (d.hBreak == null || d.vBreak == null) continue
      if (!byType[d.type]) byType[d.type] = { type: d.type, name: d.name, hSum: 0, vSum: 0, n: 0 }
      byType[d.type].hSum += d.hBreak
      byType[d.type].vSum += d.vBreak
      byType[d.type].n   += 1
    }
    return Object.values(byType).map(({ type, name, hSum, vSum, n }) => ({
      type, name,
      meanH: hSum / n,
      meanV: vSum / n,
    }))
  }, [data])

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-content-muted text-sm">
        No movement data available
      </div>
    )
  }

  const gridH = [-20, -15, -10, -5, 0, 5, 10, 15, 20]
  const gridV = [-25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25]

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
        {averages.map(({ type, name }) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pitchColor(type) }} />
            <span className="text-[11px] text-content-secondary">{name}</span>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full">
        <defs>
          <clipPath id="mv-clip">
            <rect x={PAD.left} y={PAD.top} width={CW} height={CH} />
          </clipPath>
          {/* Soft glow for average markers */}
          <filter id="mv-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background */}
        <rect x={PAD.left} y={PAD.top} width={CW} height={CH} fill="#0C1017" rx="3" />

        {/* Minor grid lines */}
        {gridH.map(h => (
          <line key={`gh${h}`}
            x1={mapH(h)} y1={PAD.top} x2={mapH(h)} y2={VB_H - PAD.bottom}
            stroke={h === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)'}
            strokeWidth={h === 0 ? 1 : 0.5}
          />
        ))}
        {gridV.map(v => (
          <line key={`gv${v}`}
            x1={PAD.left} y1={mapV(v)} x2={VB_W - PAD.right} y2={mapV(v)}
            stroke={v === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)'}
            strokeWidth={v === 0 ? 1 : 0.5}
          />
        ))}

        {/* Individual pitch scatter — clipped */}
        <g clipPath="url(#mv-clip)">
          {data.map((d, i) => {
            if (d.hBreak == null || d.vBreak == null) return null
            return (
              <circle
                key={i}
                cx={mapH(d.hBreak)}
                cy={mapV(d.vBreak)}
                r={2}
                fill={pitchColor(d.type)}
                fillOpacity={0.38}
              />
            )
          })}
        </g>

        {/* Average markers — rendered above scatter */}
        {averages.map(({ type, meanH, meanV }) => {
          const color = pitchColor(type)
          const cx    = mapH(meanH)
          const cy    = mapV(meanV)
          return (
            <g key={`avg-${type}`} filter="url(#mv-glow)">
              <circle cx={cx} cy={cy} r={11} fill={color} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} />
              <text
                x={cx} y={cy + 3.5}
                textAnchor="middle"
                fontSize={6.5}
                fontWeight="700"
                fill="#fff"
                fontFamily="monospace"
                letterSpacing="0"
              >
                {type}
              </text>
            </g>
          )
        })}

        {/* X axis ticks & labels */}
        {[-20, -10, 0, 10, 20].map(h => (
          <g key={`xt${h}`}>
            <line
              x1={mapH(h)} y1={VB_H - PAD.bottom}
              x2={mapH(h)} y2={VB_H - PAD.bottom + 4}
              stroke="rgba(255,255,255,0.2)" strokeWidth={0.8}
            />
            <text
              x={mapH(h)} y={VB_H - PAD.bottom + 13}
              textAnchor="middle" fontSize={8}
              fill="rgba(255,255,255,0.38)" fontFamily="sans-serif"
            >{h}</text>
          </g>
        ))}

        {/* Y axis ticks & labels */}
        {[-20, -10, 0, 10, 20].map(v => (
          <g key={`yt${v}`}>
            <line
              x1={PAD.left} y1={mapV(v)}
              x2={PAD.left - 4} y2={mapV(v)}
              stroke="rgba(255,255,255,0.2)" strokeWidth={0.8}
            />
            <text
              x={PAD.left - 7} y={mapV(v) + 3}
              textAnchor="end" fontSize={8}
              fill="rgba(255,255,255,0.38)" fontFamily="sans-serif"
            >{v}</text>
          </g>
        ))}

        {/* Axis labels */}
        <text x={PAD.left + CW / 2} y={VB_H - 3}
          textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.3)" fontFamily="sans-serif">
          Horizontal Break (in)
        </text>
        <text
          x={10} y={PAD.top + CH / 2}
          textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.3)" fontFamily="sans-serif"
          transform={`rotate(-90, 10, ${PAD.top + CH / 2})`}
        >
          Induced Vertical Break (in)
        </text>
      </svg>
    </div>
  )
}
