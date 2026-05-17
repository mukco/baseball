import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

const CARD_WIDTH  = 260
const CARD_HEIGHT = 200  // approx — used only for flip logic
const SHOW_DELAY  = 320
const HIDE_DELAY  = 120

function headshotUrl(id) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${id}/headshot/67/current`
}

function fmt3(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(3).replace(/^0/, '')
}

function fmt2(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(2)
}

function fmt1(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(1)
}

// Tiny inline SVG sparkline
function Sparkline({ values, invert = false, color = 'currentColor' }) {
  if (!values || values.length < 2) return null
  const W = 72, H = 28
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 0.001
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const pct = (v - min) / range
    const y = invert ? pct * (H - 4) + 2 : (1 - pct) * (H - 4) + 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = points[points.length - 1].split(',')
  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.7}
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} opacity={0.9} />
    </svg>
  )
}

function CardContent({ playerId, data, isFetching }) {
  if (isFetching && !data) {
    return (
      <div className="flex items-center justify-center h-16">
        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!data || data.error) {
    return <p className="text-xs text-content-muted italic">Stats unavailable</p>
  }

  const isBatter  = data.playerType === 'batter'
  const brandColor = 'rgb(var(--color-brand))'

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <img
          src={headshotUrl(playerId)}
          alt=""
          className="w-10 h-10 rounded-full object-cover bg-bg-border shrink-0"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-content-primary truncate">{data.name}</p>
          <p className="text-[11px] text-content-muted">
            {[data.position, data.team].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {/* Stats */}
      {isBatter ? (
        <>
          {/* Slash line */}
          <div className="grid grid-cols-4 gap-1 text-center">
            {[
              { label: 'AVG', value: fmt3(data.avg) },
              { label: 'OBP', value: fmt3(data.obp) },
              { label: 'SLG', value: fmt3(data.slg) },
              { label: 'OPS', value: fmt3(data.ops) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-bg-base rounded px-1 py-1">
                <p className="text-[9px] text-content-muted uppercase tracking-wide">{label}</p>
                <p className="text-xs font-mono font-semibold text-content-primary">{value}</p>
              </div>
            ))}
          </div>

          {/* xwOBA + SLG trend */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-content-muted">xwOBA</p>
              <p className="text-sm font-mono font-semibold text-content-primary">
                {data.xwoba != null ? fmt3(data.xwoba) : '—'}
              </p>
            </div>
            {data.trend?.length >= 2 && (
              <div className="text-right">
                <p className="text-[10px] text-content-muted mb-0.5">SLG trend</p>
                <div style={{ color: brandColor }}>
                  <Sparkline values={data.trend} color={brandColor} />
                </div>
              </div>
            )}
          </div>

          {data.pa != null && (
            <p className="text-[10px] text-content-muted">{data.pa} PA · {data.season}</p>
          )}
        </>
      ) : (
        <>
          {/* ERA / WHIP / K9 */}
          <div className="grid grid-cols-3 gap-1 text-center">
            {[
              { label: 'ERA',  value: fmt2(data.era)  },
              { label: 'WHIP', value: fmt2(data.whip) },
              { label: 'K/9',  value: fmt1(data.k9)   },
            ].map(({ label, value }) => (
              <div key={label} className="bg-bg-base rounded px-1 py-1">
                <p className="text-[9px] text-content-muted uppercase tracking-wide">{label}</p>
                <p className="text-xs font-mono font-semibold text-content-primary">{value}</p>
              </div>
            ))}
          </div>

          {/* xwOBA against + ERA trend */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-content-muted">xwOBA against</p>
              <p className="text-sm font-mono font-semibold text-content-primary">
                {data.xwoba != null ? fmt3(data.xwoba) : '—'}
              </p>
            </div>
            {data.trend?.length >= 2 && (
              <div className="text-right">
                <p className="text-[10px] text-content-muted mb-0.5">ERA trend</p>
                <div style={{ color: brandColor }}>
                  {/* invert=true so low ERA draws as high (good) */}
                  <Sparkline values={data.trend} invert color={brandColor} />
                </div>
              </div>
            )}
          </div>

          {data.ip && (
            <p className="text-[10px] text-content-muted">{data.ip} IP · {data.season}</p>
          )}
        </>
      )}
    </div>
  )
}

export default function PlayerHoverCard({ playerId, children }) {
  const [visible, setVisible]   = useState(false)
  const [cardPos, setCardPos]   = useState({ top: 0, left: 0, above: false })
  const showTimer = useRef(null)
  const hideTimer = useRef(null)
  const triggerRef = useRef(null)

  const { data, isFetching } = useQuery({
    queryKey: ['player-hover', playerId],
    queryFn:  () => api.players.hoverStats(playerId),
    enabled:  visible && !!playerId,
    staleTime: 15 * 60_000,
    retry: false,
  })

  useEffect(() => () => {
    clearTimeout(showTimer.current)
    clearTimeout(hideTimer.current)
  }, [])

  function computePos() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const spaceBelow = window.innerHeight - rect.bottom
    const above = spaceBelow < CARD_HEIGHT + 16
    const left  = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - CARD_WIDTH - 8
    )
    setCardPos({
      top:   above ? rect.top - 8 : rect.bottom + 8,
      left,
      above,
    })
  }

  function handleMouseEnter() {
    clearTimeout(hideTimer.current)
    showTimer.current = setTimeout(() => {
      computePos()
      setVisible(true)
    }, SHOW_DELAY)
  }

  function handleMouseLeave() {
    clearTimeout(showTimer.current)
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY)
  }

  if (!playerId) return children

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex"
      >
        {children}
      </span>

      {visible && createPortal(
        <div
          onMouseEnter={() => clearTimeout(hideTimer.current)}
          onMouseLeave={handleMouseLeave}
          style={{
            position:  'fixed',
            top:       cardPos.above ? undefined : cardPos.top,
            bottom:    cardPos.above ? window.innerHeight - cardPos.top : undefined,
            left:      cardPos.left,
            width:     CARD_WIDTH,
            zIndex:    9999,
          }}
          className="bg-bg-elevated border border-bg-border rounded-xl shadow-2xl p-3 pointer-events-auto"
        >
          <CardContent playerId={playerId} data={data} isFetching={isFetching} />
        </div>,
        document.body
      )}
    </>
  )
}
