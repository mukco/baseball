import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function MLHint({ hint, className = '' }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const id = useId()
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)

  const updatePosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const maxWidth = Math.min(300, window.innerWidth - 16)
    const half = maxWidth / 2
    let left = rect.left + rect.width / 2
    left = Math.max(8 + half, Math.min(window.innerWidth - 8 - half, left))
    const tooltipHeight = tooltipRef.current?.offsetHeight || 120
    let top = rect.bottom + 8
    if (top + tooltipHeight > window.innerHeight - 8) top = rect.top - tooltipHeight - 8
    if (top < 8) top = 8
    setPosition({ top, left, maxWidth })
  }

  useEffect(() => {
    if (!open) return
    updatePosition()
    const rafId = window.requestAnimationFrame(updatePosition)
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target) && !tooltipRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.cancelAnimationFrame(rafId)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open])

  if (!hint) return null

  const keepOpen = (target) => Boolean(
    rootRef.current?.contains(target) || tooltipRef.current?.contains(target)
  )

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={(e) => { if (!keepOpen(e.relatedTarget)) setOpen(false) }}
      onFocus={() => setOpen(true)}
      onBlur={(e) => { if (!rootRef.current?.contains(e.relatedTarget)) setOpen(false) }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Explain ${hint.label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-bg-border text-[10px] font-bold text-content-muted hover:text-content-primary hover:border-content-muted focus:outline-none focus:ring-2 focus:ring-brand/40"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
      >
        i
      </button>

      {open && createPortal(
        <span
          ref={tooltipRef}
          id={id}
          role="tooltip"
          className="rounded-lg border border-bg-border bg-bg-surface p-3 text-left shadow-2xl"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={(e) => { if (!keepOpen(e.relatedTarget)) setOpen(false) }}
          style={{
            position: 'fixed',
            top: position?.top ?? 8,
            left: position?.left ?? 8,
            width: position?.maxWidth ?? 300,
            transform: 'translateX(-50%)',
            zIndex: 9999,
          }}
        >
          <span className="block text-xs font-semibold text-content-primary">{hint.label}</span>
          <span className="mt-1 block text-xs text-content-secondary">{hint.definition}</span>
          {hint.formula && (
            <span className="mt-2 block rounded bg-bg-elevated px-2 py-1 text-[11px] font-mono text-content-secondary">
              {hint.formula}
            </span>
          )}
          {hint.interpretation && (
            <span className="mt-1.5 block text-[11px] text-content-muted">{hint.interpretation}</span>
          )}
        </span>,
        document.body
      )}
    </span>
  )
}
