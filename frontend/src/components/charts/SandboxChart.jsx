import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'

// ── palette & theme tokens ────────────────────────────────────────────────────
// PALETTE is intentionally static — it encodes categorical identity and must
// remain consistent across re-renders and theme changes.
const PALETTE = [
  '#6366F1', '#F59E0B', '#10B981', '#F97316',
  '#8B5CF6', '#0EA5E9', '#14B8A6', '#EC4899',
  '#84CC16', '#06B6D4', '#F43F5E', '#A855F7',
]

// Read ECharts color tokens from CSS variables so the chart matches the
// app theme (light or dark) rather than rendering as a dark island.
function getThemeColors() {
  const s = getComputedStyle(document.documentElement)
  const rgb = (v) => `rgb(${s.getPropertyValue(v).trim()})`
  return {
    bg:        'transparent',
    elevated:  rgb('--color-bg-elevated'),
    border:    rgb('--color-bg-border-strong'),
    primary:   rgb('--color-content-primary'),
    secondary: rgb('--color-content-secondary'),
    muted:     rgb('--color-content-muted'),
  }
}

const CHART_TYPES = [
  { id: 'bar',            label: 'Bar' },
  { id: 'horizontal_bar', label: 'H. Bar' },
  { id: 'line',           label: 'Line' },
  { id: 'area',           label: 'Area' },
  { id: 'scatter',        label: 'Scatter' },
  { id: 'histogram',      label: 'Distribution' },
]

const AGG_FNS = {
  avg:   vs => vs.reduce((a, b) => a + b, 0) / vs.length,
  sum:   vs => vs.reduce((a, b) => a + b, 0),
  count: vs => vs.length,
  min:   vs => Math.min(...vs),
  max:   vs => Math.max(...vs),
}

const ID_RE = /^(player_id|fg_id|mlbam_id|game_pk|game_id|team_id|batter_id|pitcher_id)$/i

// ── number formatting ─────────────────────────────────────────────────────

function fmtNum(v) {
  if (v == null || !Number.isFinite(Number(v))) return String(v ?? '')
  const n = Number(v)
  if (Number.isInteger(n)) return n.toLocaleString()
  const abs = Math.abs(n)
  if (abs >= 100)   return n.toFixed(1)
  if (abs >= 10)    return n.toFixed(2)
  if (abs >= 0.001) return n.toFixed(3)
  return n.toPrecision(4)
}

function axisLabel(v) {
  if (typeof v === 'string') return v.length > 14 ? v.slice(0, 13) + '…' : v
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k'
  if (Math.abs(n) >= 10)   return n.toFixed(0)
  if (Math.abs(n) >= 1)    return n.toFixed(1)
  return n.toFixed(2)
}

// ── data helpers ──────────────────────────────────────────────────────────

function detectColTypes(columns, rows) {
  return Object.fromEntries(
    columns.map((col, idx) => {
      const vals = rows.map(r => r[idx]).filter(v => v != null && v !== '')
      if (!vals.length) return [col, 'text']
      const numRatio = vals.filter(v => Number.isFinite(Number(v))).length / vals.length
      return [col, numRatio > 0.7 ? 'numeric' : 'text']
    })
  )
}

function toObjects(columns, rows) {
  return rows.map(row =>
    Object.fromEntries(columns.map((col, i) => {
      const v = row[i]
      if (v == null) return [col, null]
      const n = Number(v)
      return [col, Number.isFinite(n) ? n : v]
    }))
  )
}

function autoSuggest(columns, colTypes, objects) {
  const numeric = columns.filter(c => colTypes[c] === 'numeric' && !ID_RE.test(c))
  const text    = columns.filter(c => colTypes[c] === 'text'    && !ID_RE.test(c))

  const seasonCol = columns.find(c =>
    /^(season|year)$/i.test(c) &&
    new Set(objects.map(r => r[c])).size >= 2
  )
  const nameCol = text.find(c => /^(name|player|team|league|position)$/i.test(c))

  if (seasonCol && numeric.length >= 1)
    return { type: 'line', x: seasonCol, y: [numeric[0]], colorBy: nameCol ?? null }
  if (text.length >= 1 && numeric.length >= 1)
    return { type: 'horizontal_bar', x: text[0], y: [numeric[0]], colorBy: null }
  if (numeric.length >= 2)
    return { type: 'scatter', x: numeric[0], y: [numeric[1]], colorBy: text[0] ?? null }
  if (numeric.length >= 1)
    return { type: 'histogram', x: numeric[0], y: ['count'], colorBy: null }
  return { type: 'bar', x: columns[0], y: [columns[1] ?? columns[0]], colorBy: null }
}

function groupData(objects, xCol, yCols, aggKey) {
  const fn = AGG_FNS[aggKey]
  const groups = new Map()
  objects.forEach(row => {
    const key = row[xCol]
    if (key == null) return
    if (!groups.has(key)) groups.set(key, Object.fromEntries(yCols.map(y => [y, []])))
    yCols.forEach(y => {
      const n = Number(row[y])
      if (Number.isFinite(n)) groups.get(key)[y].push(n)
    })
  })
  return [...groups.entries()].map(([key, yMap]) => ({
    [xCol]: key,
    ...Object.fromEntries(yCols.map(y => [y, yMap[y].length ? fn(yMap[y]) : null])),
  }))
}

function groupDataMultiSeries(objects, xCol, yCol, colorByCol, aggKey, maxSeries = 8) {
  const fn      = AGG_FNS[aggKey]
  const series  = [...new Set(objects.map(r => r[colorByCol]).filter(v => v != null))].slice(0, maxSeries)
  const xGroups = new Map()

  objects.forEach(row => {
    const xVal = row[xCol]; const cat = row[colorByCol]
    if (xVal == null || !series.includes(cat)) return
    if (!xGroups.has(xVal)) xGroups.set(xVal, Object.fromEntries(series.map(s => [s, []])))
    const n = Number(row[yCol])
    if (Number.isFinite(n)) xGroups.get(xVal)[cat].push(n)
  })

  return [...xGroups.entries()]
    .map(([xVal, catMap]) => ({
      [xCol]: xVal,
      ...Object.fromEntries(series.map(s => [s, catMap[s].length ? fn(catMap[s]) : null])),
    }))
    .sort((a, b) => {
      const an = Number(a[xCol]), bn = Number(b[xCol])
      return Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(a[xCol]).localeCompare(String(b[xCol]))
    })
}

function sortByX(data, xCol) {
  return [...data].sort((a, b) => {
    const an = Number(a[xCol]), bn = Number(b[xCol])
    return Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(a[xCol]).localeCompare(String(b[xCol]))
  })
}

function histogramBuckets(objects, col, bins = 24) {
  const vals = objects.map(r => Number(r[col])).filter(Number.isFinite)
  if (!vals.length) return []
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const step = (hi - lo) / bins || 1
  const counts = Array(bins).fill(0)
  vals.forEach(v => { counts[Math.min(Math.floor((v - lo) / step), bins - 1)]++ })
  return counts.map((count, i) => ({ bucket: (lo + i * step).toFixed(2), count }))
}

// ── ECharts option builder ────────────────────────────────────────────────

function buildOption({ chartType, chartData, xCol, yCols, colorBySeries, objects, limit, colorBy, scatterColorMap, T }) {
  const AXIS_SHARED = {
    axisLine:  { lineStyle: { color: T.border } },
    axisTick:  { show: false },
    splitLine: { lineStyle: { color: T.border, opacity: 0.6 } },
  }

  function valueAxis(name) {
    return {
      ...AXIS_SHARED,
      type: 'value',
      name,
      nameLocation: 'middle',
      nameGap: 48,
      nameTextStyle: { color: T.muted, fontSize: 11 },
      axisLabel: { color: T.muted, fontSize: 11, formatter: axisLabel },
    }
  }

  function categoryAxis(data, name, extra = {}) {
    return {
      ...AXIS_SHARED,
      type: 'category',
      data,
      name,
      axisLabel: { color: T.muted, fontSize: 11, ...extra },
      splitLine: { show: false },
    }
  }

  function tooltipBase(trigger = 'axis') {
    return {
      trigger,
      backgroundColor: T.elevated,
      borderColor: T.border,
      textStyle: { color: T.primary, fontSize: 11 },
      appendToBody: true,
      extraCssText: 'box-shadow:0 4px 24px rgba(0,0,0,0.3);border-radius:8px;',
    }
  }

  const ZOOM_SLIDER = {
    type: 'slider',
    height: 18,
    bottom: 4,
    borderColor: T.border,
    backgroundColor: T.elevated,
    fillerColor: 'rgba(99,102,241,0.12)',
    handleStyle: { color: '#6366F1', borderColor: '#6366F1' },
    moveHandleStyle: { color: '#6366F1' },
    selectedDataBackground: {
      lineStyle: { color: '#6366F1' },
      areaStyle: { color: 'rgba(99,102,241,0.08)' },
    },
    dataBackground: {
      lineStyle: { color: T.border },
      areaStyle: { color: T.elevated },
    },
    textStyle: { color: T.muted },
  }

  function tooltipFmt(xCol) {
    return params => {
      const arr = Array.isArray(params) ? params : [params]
      const name = arr[0]?.axisValueLabel ?? arr[0]?.name ?? ''
      const rows = arr
        .filter(p => p.value != null)
        .map(p => {
          const val = Array.isArray(p.value) ? p.value[1] : p.value
          return `<div style="display:flex;justify-content:space-between;gap:16px">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px"></span><span style="color:${T.secondary}">${p.seriesName}</span></span>
            <strong style="color:${T.primary};font-family:monospace">${fmtNum(val)}</strong>
          </div>`
        })
      return `<div style="color:${T.primary};font-weight:600;margin-bottom:5px">${name}</div>${rows.join('')}`
    }
  }
  const showLegend = !!(colorBySeries || yCols.length > 1)
  const hasSlider  = chartType === 'line' || chartType === 'area'
  const gridTop    = showLegend ? 40 : 16
  const gridBottom = hasSlider ? 56 : 12

  const baseOpt = {
    backgroundColor: T.bg,
    color: PALETTE,
    textStyle: { color: T.secondary, fontSize: 11 },
    legend: showLegend ? {
      top: 6, type: 'scroll',
      textStyle: { color: T.secondary, fontSize: 11 },
      icon: 'circle', itemWidth: 8, itemHeight: 8,
      inactiveColor: T.muted,
      pageTextStyle: { color: T.muted },
      pageIconColor: T.secondary,
    } : undefined,
    grid: { left: 12, right: 12, top: gridTop, bottom: gridBottom, containLabel: true },
    animation: true,
    animationDuration: 400,
  }

  // ── Histogram ────────────────────────────────────────────────────────
  if (chartType === 'histogram') {
    return {
      ...baseOpt,
      tooltip: { ...tooltipBase(), formatter: tooltipFmt(xCol) },
      xAxis: categoryAxis(chartData.map(d => d.bucket), xCol, { rotate: 30, fontSize: 10 }),
      yAxis: valueAxis('count'),
      series: [{
        name: 'count', type: 'bar',
        data: chartData.map(d => d.count),
        barWidth: '98%',
        itemStyle: { color: PALETTE[0], borderRadius: [3, 3, 0, 0] },
      }],
      dataZoom: [{ type: 'inside' }],
    }
  }

  // ── Scatter ──────────────────────────────────────────────────────────
  if (chartType === 'scatter') {
    const yCol = yCols[0]
    const slice = objects.slice(0, limit)
    const scatterTooltip = params => {
      const [x, y] = params.value
      return `<div style="font-weight:600;margin-bottom:4px;color:${T.primary}">${params.seriesName}</div>
        <div style="color:${T.secondary}">${xCol}: <strong style="color:${T.primary};font-family:monospace">${fmtNum(x)}</strong></div>
        <div style="color:${T.secondary}">${yCol}: <strong style="color:${T.primary};font-family:monospace">${fmtNum(y)}</strong></div>`
    }
    return {
      ...baseOpt,
      tooltip: { ...tooltipBase('item'), formatter: scatterTooltip },
      xAxis: { ...valueAxis(xCol), nameGap: 32 },
      yAxis: valueAxis(yCol),
      series: scatterColorMap
        ? Object.entries(scatterColorMap).map(([cat, color], i) => ({
            name: String(cat), type: 'scatter',
            data: slice.filter(r => r[colorBy] === cat).map(r => [r[xCol], r[yCol]]),
            symbolSize: 7,
            itemStyle: { color, opacity: 0.85 },
          }))
        : [{
            name: `${xCol} vs ${yCol}`, type: 'scatter',
            data: slice.map(r => [r[xCol], r[yCol]]),
            symbolSize: 7,
            itemStyle: { opacity: 0.8 },
          }],
      dataZoom: [
        { type: 'inside', xAxisIndex: 0 },
        { type: 'inside', yAxisIndex: 0 },
      ],
    }
  }

  // ── Horizontal bar ────────────────────────────────────────────────────
  if (chartType === 'horizontal_bar') {
    const slice = [...chartData].sort((a, b) => (b[yCols[0]] ?? -Infinity) - (a[yCols[0]] ?? -Infinity)).slice(0, 40)
    return {
      ...baseOpt,
      tooltip: { ...tooltipBase(), formatter: tooltipFmt(xCol) },
      xAxis: { ...valueAxis(''), splitLine: { lineStyle: { color: T.border, opacity: 0.6 } }, axisLine: { lineStyle: { color: T.border } }, axisLabel: { color: T.muted, fontSize: 11, formatter: axisLabel } },
      yAxis: {
        ...AXIS_SHARED,
        type: 'category',
        data: slice.map(r => r[xCol]),
        inverse: false,
        axisLabel: { color: T.secondary, fontSize: 11, width: 100, overflow: 'truncate' },
        splitLine: { show: false },
      },
      series: yCols.map((y, si) => ({
        name: y, type: 'bar',
        data: slice.map(r => r[y]),
        itemStyle: { color: PALETTE[si % PALETTE.length], borderRadius: [0, 3, 3, 0], opacity: 0.85 },
        barMaxWidth: 24,
      })),
    }
  }

  // ── Vertical bar ─────────────────────────────────────────────────────
  if (chartType === 'bar') {
    const slice = [...chartData].sort((a, b) => (b[yCols[0]] ?? -Infinity) - (a[yCols[0]] ?? -Infinity)).slice(0, 30)
    const rotate = slice.length > 10 ? 30 : 0
    return {
      ...baseOpt,
      tooltip: { ...tooltipBase(), formatter: tooltipFmt(xCol) },
      xAxis: categoryAxis(slice.map(r => r[xCol]), '', { rotate, fontSize: rotate ? 10 : 11 }),
      yAxis: { ...valueAxis(''), axisLabel: { color: T.muted, fontSize: 11, formatter: axisLabel } },
      series: yCols.map((y, i) => ({
        name: y, type: 'bar',
        data: slice.map(r => r[y]),
        itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 36,
      })),
    }
  }

  // ── Line / Area ───────────────────────────────────────────────────────
  const isArea = chartType === 'area'
  const lineStyle = { width: 2 }
  const dot = { symbol: 'none' }

  if (colorBySeries) {
    // One line per colorBy category value
    return {
      ...baseOpt,
      tooltip: { ...tooltipBase(), formatter: tooltipFmt(xCol) },
      xAxis: categoryAxis(chartData.map(r => r[xCol])),
      yAxis: { ...valueAxis(''), axisLabel: { color: T.muted, fontSize: 11, formatter: axisLabel } },
      series: colorBySeries.map((cat, i) => ({
        name: String(cat), type: 'line',
        data: chartData.map(r => r[cat] ?? null),
        lineStyle: { ...lineStyle, color: PALETTE[i % PALETTE.length] },
        itemStyle: { color: PALETTE[i % PALETTE.length] },
        areaStyle: isArea ? { color: PALETTE[i % PALETTE.length], opacity: 0.08 } : undefined,
        connectNulls: true,
        ...dot,
      })),
      dataZoom: [{ type: 'inside' }, { ...ZOOM_SLIDER }],
    }
  }

  // One line per Y column
  return {
    ...baseOpt,
    tooltip: { ...tooltipBase(), formatter: tooltipFmt(xCol) },
    xAxis: categoryAxis(chartData.map(r => r[xCol])),
    yAxis: { ...valueAxis(''), axisLabel: { color: T.muted, fontSize: 11, formatter: axisLabel } },
    series: yCols.map((y, i) => ({
      name: y, type: 'line',
      data: chartData.map(r => r[y] ?? null),
      lineStyle: { ...lineStyle, color: PALETTE[i % PALETTE.length] },
      itemStyle: { color: PALETTE[i % PALETTE.length] },
      areaStyle: isArea ? { color: PALETTE[i % PALETTE.length], opacity: 0.08 } : undefined,
      ...dot,
    })),
    dataZoom: [{ type: 'inside' }, { ...ZOOM_SLIDER }],
  }
}

// ── main component ────────────────────────────────────────────────────────

export default function SandboxChart({ columns, rows }) {
  const colTypes    = useMemo(() => detectColTypes(columns, rows), [columns, rows])
  const objects     = useMemo(() => toObjects(columns, rows),      [columns, rows])
  const numericCols = useMemo(() => columns.filter(c => colTypes[c] === 'numeric' && !ID_RE.test(c)), [columns, colTypes])
  const textCols    = useMemo(() => columns.filter(c => colTypes[c] === 'text'    && !ID_RE.test(c)), [columns, colTypes])
  const initial     = useMemo(() => autoSuggest(columns, colTypes, objects), [columns, colTypes, objects])

  const [chartType, setChartType] = useState(() => initial.type)
  const [xCol,      setXCol]      = useState(() => initial.x)
  const [yCols,     setYCols]     = useState(() => initial.y)
  const [colorBy,   setColorBy]   = useState(() => initial.colorBy)
  const [agg,       setAgg]       = useState('avg')
  const [limit,     setLimit]     = useState(200)

  const isScatter = chartType === 'scatter'
  const isHist    = chartType === 'histogram'
  const isLine    = chartType === 'line' || chartType === 'area'

  // Multi-series: colorBy with ≤ 8 unique values
  const colorBySeries = useMemo(() => {
    if (!isLine || !colorBy) return null
    const vals = [...new Set(objects.slice(0, limit).map(r => r[colorBy]).filter(v => v != null))]
    return vals.length <= 8 ? vals : null
  }, [isLine, colorBy, objects, limit])

  const scatterColorMap = useMemo(() => {
    if (!isScatter || !colorBy) return null
    const vals = [...new Set(objects.slice(0, limit).map(r => r[colorBy]).filter(v => v != null))]
    return Object.fromEntries(vals.slice(0, 12).map((v, i) => [v, PALETTE[i % PALETTE.length]]))
  }, [isScatter, colorBy, objects, limit])

  const chartData = useMemo(() => {
    const slice = objects.slice(0, limit)
    if (isHist)    return histogramBuckets(slice, xCol)
    if (isScatter) return slice
    if (isLine && colorBySeries)
      return groupDataMultiSeries(slice, xCol, yCols[0], colorBy, agg)
    const grouped = groupData(slice, xCol, yCols, agg)
    return isLine ? sortByX(grouped, xCol) : grouped
  }, [objects, chartType, xCol, yCols, agg, limit, colorBySeries, colorBy])

  const option = useMemo(() => buildOption({
    chartType, chartData, xCol, yCols, colorBySeries,
    objects, limit, colorBy, scatterColorMap,
    T: getThemeColors(),
  }), [chartType, chartData, xCol, yCols, colorBySeries, objects, limit, colorBy, scatterColorMap])

  function toggleY(col) {
    setYCols(prev =>
      prev.includes(col)
        ? prev.length > 1 ? prev.filter(c => c !== col) : prev
        : isScatter ? [col] : [...prev, col]
    )
  }

  function switchType(id) {
    setChartType(id)
    const needsNumX = id === 'scatter' || id === 'histogram'
    if (needsNumX && colTypes[xCol] !== 'numeric' && numericCols.length)
      setXCol(numericCols[0])
    if (needsNumX)
      setYCols([yCols.find(c => numericCols.includes(c)) ?? numericCols[0] ?? yCols[0]])
  }

  const xOptions = isScatter || isHist
    ? numericCols
    : [...textCols, ...numericCols]

  const selStyle  = 'bg-bg-elevated border border-bg-border text-content-primary rounded-md px-2 py-1.5 outline-none focus:border-brand text-xs min-w-[100px]'
  const labelCls  = 'text-[10px] uppercase tracking-wider text-content-muted mb-1'

  return (
    <div className="space-y-3 p-4">
      {/* Chart type tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {CHART_TYPES.map(ct => (
          <button key={ct.id} type="button" onClick={() => switchType(ct.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
              chartType === ct.id
                ? 'bg-brand/15 border-brand/50 text-brand-light'
                : 'border-bg-border text-content-muted hover:text-content-secondary'
            }`}>
            {ct.label}
          </button>
        ))}
      </div>

      {/* Config row */}
      <div className="flex items-end gap-4 flex-wrap text-xs">
        <div>
          <p className={labelCls}>{isHist ? 'Column' : 'X Axis'}</p>
          <select value={xCol} onChange={e => setXCol(e.target.value)} className={selStyle}>
            {xOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {!isHist && (
          <div>
            <p className={labelCls}>{isScatter ? 'Y Axis' : 'Y Axis'}</p>
            <div className="flex flex-wrap gap-1 items-center min-h-[30px]">
              {numericCols.map(c => (
                <button key={c} type="button" onClick={() => toggleY(c)}
                  className={`px-2 py-1 rounded text-[11px] transition-colors border ${
                    yCols.includes(c)
                      ? 'bg-brand/15 border-brand/40 text-brand-light'
                      : 'border-bg-border text-content-muted hover:text-content-secondary'
                  }`}>
                  {c}
                </button>
              ))}
              {!numericCols.length && <span className="text-content-muted/60 text-[11px]">No numeric columns</span>}
            </div>
          </div>
        )}

        {(isScatter || isLine) && textCols.length > 0 && (
          <div>
            <p className={labelCls}>Color by</p>
            <select value={colorBy ?? ''} onChange={e => setColorBy(e.target.value || null)} className={selStyle}>
              <option value="">None</option>
              {textCols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {isLine && colorBy && !colorBySeries && (
              <p className="text-[10px] text-amber-400 mt-1">{'>'} 8 values — showing aggregate</p>
            )}
          </div>
        )}

        {!isScatter && !isHist && (
          <div>
            <p className={labelCls}>Aggregate</p>
            <select value={agg} onChange={e => setAgg(e.target.value)} className={selStyle}>
              {['avg', 'sum', 'count', 'min', 'max'].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}

        <div>
          <p className={labelCls}>Rows</p>
          <select value={limit} onChange={e => setLimit(Number(e.target.value))} className={selStyle}>
            {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Chart */}
      {chartData?.length
        ? <ReactECharts option={option} style={{ height: 400 }} notMerge opts={{ renderer: 'canvas' }} />
        : <div className="flex items-center justify-center h-64 text-content-muted text-sm">No data to visualize</div>
      }
    </div>
  )
}
