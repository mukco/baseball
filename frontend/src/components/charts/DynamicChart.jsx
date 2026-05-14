import { useRef } from 'react'
import {
  BarChart, Bar,
  LineChart, Line,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'

const BRAND        = '#6366F1'
const BRAND_LIGHT  = '#818CF8'
const BORDER       = '#2D2D3A'
const MUTED        = '#6B7280'
const SURFACE      = '#1E1E2A'
const SECONDARY    = '#9CA3AF'

const PALETTE = [
  '#6366F1', '#F59E0B', '#10B981', '#EF4444',
  '#8B5CF6', '#F97316', '#14B8A6', '#EC4899',
]

function CustomTooltip({ active, payload, label, xKey, yKey, type }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  const point = entry?.payload || {}
  return (
    <div className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-xs shadow-xl" style={{ minWidth: 120 }}>
      {type === 'scatter' ? (
        <>
          <p className="font-semibold text-content-primary mb-1">{point.name || point.Name || point.team || point.Team || ''}</p>
          <p className="text-content-secondary">{xKey}: <strong className="text-content-primary">{point[xKey]}</strong></p>
          <p className="text-content-secondary">{yKey}: <strong className="text-content-primary">{point[yKey]}</strong></p>
        </>
      ) : (
        <>
          <p className="font-semibold text-content-primary mb-1">{label || point.name}</p>
          <p className="text-content-secondary">{yKey}: <strong className="text-content-primary">{entry?.value}</strong></p>
        </>
      )}
    </div>
  )
}

const AXIS_PROPS = {
  tick:     { fill: MUTED, fontSize: 11 },
  axisLine: { stroke: BORDER },
  tickLine: false,
}

const CHART_MARGIN = { top: 8, right: 8, left: -12, bottom: 0 }

export default function DynamicChart({ type, title, data, xKey = 'name', yKey = 'value', color, height = 180 }) {
  const containerRef = useRef(null)
  if (!data?.length) return null

  let chart = null

  if (type === 'bar') {
    chart = (
      <BarChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid vertical={false} stroke={BORDER} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} {...AXIS_PROPS} interval={0} tick={{ ...AXIS_PROPS.tick, fontSize: 10 }} />
        <YAxis {...AXIS_PROPS} width={40} />
        <Tooltip content={<CustomTooltip xKey={xKey} yKey={yKey} type="bar" />} cursor={{ fill: SURFACE }} />
        <Bar dataKey={yKey} radius={[3, 3, 0, 0]} maxBarSize={40}>
          {data.map((_, i) => (
            <Cell key={i} fill={color || BRAND} fillOpacity={Math.max(0.5, 0.85 - i * 0.03)} />
          ))}
        </Bar>
      </BarChart>
    )
  } else if (type === 'horizontal_bar') {
    chart = (
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 4, bottom: 4 }}>
        <XAxis type="number" {...AXIS_PROPS} />
        <YAxis type="category" dataKey={xKey} {...AXIS_PROPS} width={90} tick={{ ...AXIS_PROPS.tick, fontSize: 10 }} />
        <Tooltip content={<CustomTooltip xKey={xKey} yKey={yKey} type="horizontal_bar" />} cursor={{ fill: SURFACE }} />
        <Bar dataKey={yKey} radius={[0, 3, 3, 0]} maxBarSize={16}>
          <LabelList dataKey={yKey} position="right" style={{ fill: SECONDARY, fontSize: 10 }} />
          {data.map((_, i) => (
            <Cell key={i} fill={i === 0 ? BRAND_LIGHT : (color || BRAND)} fillOpacity={i === 0 ? 1 : 0.65} />
          ))}
        </Bar>
      </BarChart>
    )
  } else if (type === 'line') {
    chart = (
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid stroke={BORDER} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={40} />
        <Tooltip content={<CustomTooltip xKey={xKey} yKey={yKey} type="line" />} />
        <Line
          type="monotone"
          dataKey={yKey}
          stroke={color || BRAND_LIGHT}
          strokeWidth={2}
          dot={{ fill: color || BRAND_LIGHT, r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    )
  } else if (type === 'scatter') {
    chart = (
      <ScatterChart margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={BORDER} strokeDasharray="3 3" />
        <XAxis type="number" dataKey={xKey} name={xKey} {...AXIS_PROPS} label={{ value: xKey, position: 'insideBottom', offset: -2, fill: MUTED, fontSize: 10 }} />
        <YAxis type="number" dataKey={yKey} name={yKey} {...AXIS_PROPS} width={40} label={{ value: yKey, angle: -90, position: 'insideLeft', fill: MUTED, fontSize: 10 }} />
        <Tooltip content={<CustomTooltip xKey={xKey} yKey={yKey} type="scatter" />} cursor={{ strokeDasharray: '3 3' }} />
        <Scatter data={data}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.8} />
          ))}
        </Scatter>
      </ScatterChart>
    )
  }

  if (!chart) return null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        {title && (
          <p className="text-[11px] font-medium text-content-muted uppercase tracking-wider">{title}</p>
        )}
        <ExportButtons containerRef={containerRef} title={title} data={data} />
      </div>
      <div ref={containerRef}>
        <ResponsiveContainer width="100%" height={height}>
          {chart}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ExportButtons({ containerRef, title, data }) {
  function exportPng() {
    const svg = containerRef.current?.querySelector('svg')
    if (!svg) return

    const { width, height } = svg.getBoundingClientRect()
    const scale = 2
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    ctx.fillStyle = '#0F0F17'
    ctx.fillRect(0, 0, width, height)

    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob((pngBlob) => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(pngBlob)
        a.download = `${title || 'chart'}.png`
        a.click()
      })
    }
    img.src = url
  }

  function exportCsv() {
    if (!data?.length) return
    const keys = Object.keys(data[0])
    const rows = [keys.join(','), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${title || 'chart'}.csv`
    a.click()
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={exportPng}
        title="Download PNG"
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-content-muted hover:text-content-primary hover:bg-bg-elevated transition-colors"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        PNG
      </button>
      <button
        onClick={exportCsv}
        title="Download CSV"
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-content-muted hover:text-content-primary hover:bg-bg-elevated transition-colors"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        CSV
      </button>
    </div>
  )
}
