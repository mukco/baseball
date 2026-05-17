import { useState, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

// ─────────────────────────────────────────────────────────────────
// Position badge
// ─────────────────────────────────────────────────────────────────

const POS_COLORS = {
  SP: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  RP: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  C:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  '1B': 'bg-green-500/15 text-green-400 border-green-500/30',
  '2B': 'bg-green-500/15 text-green-400 border-green-500/30',
  '3B': 'bg-green-500/15 text-green-400 border-green-500/30',
  SS: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  LF: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  CF: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  RF: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  DH: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
}

function PosBadge({ pos }) {
  const cls = POS_COLORS[pos] || 'bg-bg-elevated text-content-muted border-bg-border'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold font-mono uppercase ${cls}`}>
      {pos}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────
// Draggable ordered list (batting order / rotation)
// ─────────────────────────────────────────────────────────────────

function OrderedSlot({ index, player, label, onMoveUp, onMoveDown, onRemove, isFirst, isLast }) {
  if (!player) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-bg-border text-content-muted text-sm">
        <span className="w-6 h-6 rounded bg-bg-elevated flex items-center justify-center text-xs font-mono font-bold text-content-muted shrink-0">
          {label || index + 1}
        </span>
        <span className="text-content-muted italic text-xs">Empty slot</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-surface border border-bg-border hover:border-bg-border/80 transition-colors group">
      <span className="w-6 h-6 rounded bg-brand/10 border border-brand/20 flex items-center justify-center text-[11px] font-mono font-bold text-brand shrink-0">
        {label || index + 1}
      </span>

      <img
        src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_40,q_auto:best/v1/people/${player.id}/headshot/67/current`}
        alt=""
        className="w-8 h-8 rounded-full object-cover bg-bg-border shrink-0"
        onError={e => { e.target.style.display = 'none' }}
      />

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-content-primary truncate">{player.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <PosBadge pos={player.position} />
          {player.jerseyNumber && (
            <span className="text-[10px] text-content-muted font-mono">#{player.jerseyNumber}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          type="button"
          onClick={() => onMoveUp(index)}
          disabled={isFirst}
          className="w-6 h-6 flex items-center justify-center rounded text-content-muted hover:text-content-primary disabled:opacity-25 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onMoveDown(index)}
          disabled={isLast}
          className="w-6 h-6 flex items-center justify-center rounded text-content-muted hover:text-content-primary disabled:opacity-25 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="w-6 h-6 flex items-center justify-center rounded text-content-muted hover:text-red-400 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function OrderedList({ title, slots, onMoveUp, onMoveDown, onRemove, slotLabel }) {
  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-bold text-content-primary uppercase tracking-wide">{title}</h3>
      <div className="space-y-2">
        {slots.map((player, i) => (
          <OrderedSlot
            key={i}
            index={i}
            player={player}
            label={slotLabel ? slotLabel(i) : i + 1}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onRemove={onRemove}
            isFirst={i === 0}
            isLast={i === slots.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Roster pool (full team list, click to add)
// ─────────────────────────────────────────────────────────────────

function RosterPool({ players, lineupIds, rotationIds, onAddToLineup, onAddToRotation }) {
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('ALL')

  const positions = ['ALL', ...[...new Set(players.map(p => p.position).filter(Boolean))].sort()]

  const filtered = players.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchPos    = posFilter === 'ALL' || p.position === posFilter
    return matchSearch && matchPos
  })

  const isPitcher = pos => ['SP', 'RP', 'P', 'TWP'].includes(pos)

  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-bold text-content-primary uppercase tracking-wide">Full Roster</h3>

      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 focus-within:border-brand transition-colors">
          <svg className="w-3.5 h-3.5 text-content-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search players…"
            className="bg-transparent text-sm text-content-primary placeholder-content-muted outline-none w-full"
          />
        </div>
        <select
          value={posFilter}
          onChange={e => setPosFilter(e.target.value)}
          className="bg-bg-elevated border border-bg-border rounded-md px-2 py-1.5 text-xs text-content-secondary focus:outline-none focus:border-brand"
        >
          {positions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
        {filtered.map(player => {
          const inLineup    = lineupIds.includes(player.id)
          const inRotation  = rotationIds.includes(player.id)
          const isP         = isPitcher(player.position)

          return (
            <div
              key={player.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                (inLineup || inRotation) ? 'bg-brand/5 border border-brand/15' : 'hover:bg-bg-surface border border-transparent'
              }`}
            >
              <img
                src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_40,q_auto:best/v1/people/${player.id}/headshot/67/current`}
                alt=""
                className="w-7 h-7 rounded-full object-cover bg-bg-border shrink-0"
                onError={e => { e.target.style.display = 'none' }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-content-primary truncate">{player.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <PosBadge pos={player.position} />
                  {inLineup    && <span className="text-[9px] font-bold text-brand uppercase">In Lineup</span>}
                  {inRotation  && <span className="text-[9px] font-bold text-blue-400 uppercase">In Rotation</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!isP && (
                  <button
                    type="button"
                    onClick={() => onAddToLineup(player)}
                    disabled={inLineup}
                    title="Add to batting lineup"
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand/10 text-brand border border-brand/20 hover:bg-brand/20 disabled:opacity-30 transition-colors"
                  >
                    BAT
                  </button>
                )}
                {isP && (
                  <button
                    type="button"
                    onClick={() => onAddToRotation(player)}
                    disabled={inRotation}
                    title="Add to pitching rotation"
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 disabled:opacity-30 transition-colors"
                  >
                    PITCH
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-xs text-content-muted text-center py-4">No players match.</div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Roster page
// ─────────────────────────────────────────────────────────────────

export default function SimulationRoster() {
  const { id, teamId } = useParams()
  const qc = useQueryClient()

  const { data: rosterData, isLoading } = useQuery({
    queryKey: ['sim-roster', id, teamId],
    queryFn:  () => api.simulations.roster(id, teamId),
    staleTime: 60_000,
  })

  // Derive player map
  const playerMap = useMemo(() => {
    const map = {}
    ;(rosterData?.roster || []).forEach(p => { map[p.id] = p })
    return map
  }, [rosterData])

  // Lineup order — array of player objects (or null for empty slots)
  const [lineupIds, setLineupIds]     = useState(null)  // null = use server data
  const [rotationIds, setRotationIds] = useState(null)

  const effectiveLineup   = lineupIds   ?? (rosterData?.lineup_order  || [])
  const effectiveRotation = rotationIds ?? (rosterData?.rotation      || [])

  const lineupPlayers   = effectiveLineup.map(id => playerMap[id] || null)
  const rotationPlayers = effectiveRotation.map(id => playerMap[id] || null)

  const saveMutation = useMutation({
    mutationFn: () => api.simulations.updateRoster(id, teamId, {
      lineup_order: effectiveLineup,
      rotation:     effectiveRotation,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sim-roster', id, teamId] }),
  })

  const isDirty = lineupIds !== null || rotationIds !== null

  // Lineup operations
  function moveInLineup(idx, delta) {
    const arr = [...effectiveLineup]
    const other = idx + delta
    if (other < 0 || other >= arr.length) return
    ;[arr[idx], arr[other]] = [arr[other], arr[idx]]
    setLineupIds(arr)
  }

  function removeFromLineup(idx) {
    setLineupIds(effectiveLineup.filter((_, i) => i !== idx))
  }

  function addToLineup(player) {
    if (effectiveLineup.includes(player.id)) return
    setLineupIds([...effectiveLineup, player.id])
  }

  // Rotation operations
  function moveInRotation(idx, delta) {
    const arr = [...effectiveRotation]
    const other = idx + delta
    if (other < 0 || other >= arr.length) return
    ;[arr[idx], arr[other]] = [arr[other], arr[idx]]
    setRotationIds(arr)
  }

  function removeFromRotation(idx) {
    setRotationIds(effectiveRotation.filter((_, i) => i !== idx))
  }

  function addToRotation(player) {
    if (effectiveRotation.includes(player.id)) return
    setRotationIds([...effectiveRotation, player.id])
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-content-muted py-12 justify-center">
        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        Loading roster…
      </div>
    )
  }

  const rotationLabels = ['SP1', 'SP2', 'SP3', 'SP4', 'SP5', 'RP1', 'RP2', 'RP3', 'RP4', 'RP5']

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to={`/simulation/${id}`} className="text-xs text-content-muted hover:text-brand transition-colors">
              ← Back to Command Center
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-8 rounded-sm"
              style={{ background: rosterData?.team_color || '#666' }}
            />
            <div>
              <h1 className="text-2xl font-bold text-content-primary">{rosterData?.team_name}</h1>
              <p className="text-content-muted text-sm">{rosterData?.roster?.length || 0} players on roster</p>
            </div>
          </div>
        </div>

        {isDirty && (
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="btn-primary flex items-center gap-1.5"
          >
            {saveMutation.isPending ? (
              <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            Save Changes
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr] gap-5 items-start">
        {/* Batting Lineup */}
        <OrderedList
          title="Batting Order"
          slots={lineupPlayers}
          onMoveUp={(i)  => moveInLineup(i, -1)}
          onMoveDown={(i) => moveInLineup(i, 1)}
          onRemove={removeFromLineup}
        />

        {/* Pitching Rotation */}
        <OrderedList
          title="Pitching Staff"
          slots={rotationPlayers}
          onMoveUp={(i)  => moveInRotation(i, -1)}
          onMoveDown={(i) => moveInRotation(i, 1)}
          onRemove={removeFromRotation}
          slotLabel={i => rotationLabels[i] || `P${i + 1}`}
        />

        {/* Full roster pool */}
        <RosterPool
          players={rosterData?.roster || []}
          lineupIds={effectiveLineup}
          rotationIds={effectiveRotation}
          onAddToLineup={addToLineup}
          onAddToRotation={addToRotation}
        />
      </div>
    </div>
  )
}
