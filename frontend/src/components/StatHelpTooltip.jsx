import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'
import { getStatHelp } from '../lib/statHelp'

export default function StatHelpTooltip({ stat, className = '' }) {
  const help = getStatHelp(stat)
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
    const maxWidth = Math.min(320, window.innerWidth - 16)
    const half = maxWidth / 2

    let left = rect.left + (rect.width / 2)
    left = Math.max(8 + half, Math.min(window.innerWidth - 8 - half, left))

    const tooltipHeight = tooltipRef.current?.offsetHeight || 128
    let top = rect.bottom + 8

    if (top + tooltipHeight > window.innerHeight - 8) {
      top = rect.top - tooltipHeight - 8
      if (top < 8) top = 8
    }

    setPosition({ top, left, maxWidth })
  }

  useEffect(() => {
    if (!open) return undefined

    updatePosition()
    const rafId = window.requestAnimationFrame(updatePosition)

    const onPointerDown = (event) => {
      const target = event.target
      const inTrigger = rootRef.current?.contains(target)
      const inTooltip = tooltipRef.current?.contains(target)
      if (!inTrigger && !inTooltip) {
        setOpen(false)
      }
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.cancelAnimationFrame(rafId)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open])

  if (!help) return null

  const closeOnBlur = (event) => {
    if (!rootRef.current?.contains(event.relatedTarget)) {
      setOpen(false)
    }
  }

  const keepOpenOnTransition = (nextTarget) => {
    if (!nextTarget) return false
    return Boolean(rootRef.current?.contains(nextTarget) || tooltipRef.current?.contains(nextTarget))
  }

  const onRootMouseLeave = (event) => {
    if (keepOpenOnTransition(event.relatedTarget)) return
    setOpen(false)
  }

  const onTooltipMouseLeave = (event) => {
    if (keepOpenOnTransition(event.relatedTarget)) return
    setOpen(false)
  }

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={onRootMouseLeave}
      onFocus={() => setOpen(true)}
      onBlur={closeOnBlur}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Explain ${help.label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-bg-border text-[10px] font-bold text-content-muted hover:text-content-primary hover:border-content-muted focus:outline-none focus:ring-2 focus:ring-brand/40"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        i
      </button>

      {open && createPortal(
        <span
          ref={tooltipRef}
          id={id}
          role="tooltip"
          className="rounded-lg border border-bg-border bg-bg-surface p-3 text-left shadow-2xl overflow-hidden"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={onTooltipMouseLeave}
          style={{
            position: 'fixed',
            top: position?.top ?? 8,
            left: position?.left ?? 8,
            width: position?.maxWidth ?? 320,
            transform: 'translateX(-50%)',
            zIndex: 9999,
          }}
        >
          <span className="block text-xs font-semibold text-content-primary">{help.label}</span>
          <span className="mt-1 block text-xs text-content-secondary">{help.definition}</span>
          {help.formulaLatex ? (
            <span
              className="mt-2 block max-w-full overflow-x-auto overflow-y-hidden rounded bg-bg-elevated px-2 py-1 text-content-primary"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <BlockMath math={help.formulaLatex} />
            </span>
          ) : (
            <span className="mt-2 block text-[11px] text-content-muted">{help.formula}</span>
          )}
          <span className="mt-1 block text-[11px] text-content-muted">{help.interpretation}</span>
        </span>,
        document.body
      )}
    </span>
  )
}
