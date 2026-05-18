import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '../api'
import { SimPlayerAvatar } from '../components/sim/SimUI'
import RatingDots from '../components/RatingDots'

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
// IL badge
// ─────────────────────────────────────────────────────────────────

const IL_SEVERITY_CLS = {
  minor:    'text-yellow-400 border-yellow-400/40 bg-yellow-400/10',
  moderate: 'text-orange-400 border-orange-400/40 bg-orange-400/10',
  major:    'text-red-400   border-red-400/40   bg-red-400/10',
}

function ILBadge({ severity }) {
  const cls = IL_SEVERITY_CLS[severity] || 'text-red-400 border-red-400/40 bg-red-400/10'
  return (
    <span className={`inline-block px-1 py-0 rounded border text-[9px] font-bold uppercase ${cls}`}>
      IL
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────
// Drag handle icon
// ─────────────────────────────────────────────────────────────────

function GripIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
      <circle cx="5" cy="4"  r="1.2" />
      <circle cx="11" cy="4"  r="1.2" />
      <circle cx="5" cy="8"  r="1.2" />
      <circle cx="11" cy="8"  r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────
// Single ordered slot (batting order / rotation row)
// ─────────────────────────────────────────────────────────────────

function OrderedSlot({ index, player, label, dragHandleProps, onRemove, injuryMap, ratingsMap, isPitcher }) {
  if (!player) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-bg-border text-content-muted text-sm">
        <div className="w-5 shrink-0" />
        <span className="w-6 h-6 rounded bg-bg-elevated flex items-center justify-center text-xs font-mono font-bold text-content-muted shrink-0">
          {label || index + 1}
        </span>
        <span className="text-content-muted italic text-xs">Empty slot</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-surface border border-bg-border hover:border-bg-border/80 transition-colors group">
      {dragHandleProps ? (
        <div
          {...dragHandleProps}
          className="text-content-muted hover:text-content-secondary cursor-grab active:cursor-grabbing shrink-0 touch-none"
        >
          <GripIcon />
        </div>
      ) : (
        <div className="w-3.5 shrink-0" />
      )}

      <span className="w-6 h-6 rounded bg-brand/10 border border-brand/20 flex items-center justify-center text-[11px] font-mono font-bold text-brand shrink-0">
        {label || index + 1}
      </span>

      <SimPlayerAvatar playerId={player.id} name={player.name} size={32} />

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-content-primary truncate">{player.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <PosBadge pos={player.position} />
          {injuryMap?.[player.id] && <ILBadge severity={injuryMap[player.id]} />}
          {player.jerseyNumber && (
            <span className="text-[10px] text-content-muted font-mono">#{player.jerseyNumber}</span>
          )}
          <RatingDots ratings={ratingsMap?.[player.id]} isPitcher={isPitcher} />
        </div>
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-content-muted hover:text-red-400 transition-all shrink-0"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sortable wrapper for each slot
// ─────────────────────────────────────────────────────────────────

function SortableSlot({ id, index, player, label, onRemove, injuryMap, ratingsMap, isPitcher, disabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-40' : ''}>
      <OrderedSlot
        index={index}
        player={player}
        label={label}
        dragHandleProps={disabled ? null : { ...attributes, ...listeners }}
        onRemove={onRemove}
        injuryMap={injuryMap}
        ratingsMap={ratingsMap}
        isPitcher={isPitcher}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Draggable ordered list (batting order / rotation)
// ─────────────────────────────────────────────────────────────────

function OrderedList({ title, ids, slots, onReorder, onRemove, slotLabel, injuryMap, ratingsMap, isPitcher, disabled }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const oldIdx = ids.indexOf(Number(active.id))
    const newIdx = ids.indexOf(Number(over.id))
    if (oldIdx !== -1 && newIdx !== -1) onReorder(arrayMove(ids, oldIdx, newIdx))
  }

  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-bold text-content-primary uppercase tracking-wide">{title}</h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {slots.map((player, i) => (
              <SortableSlot
                key={ids[i] ?? `empty-${i}`}
                id={ids[i]}
                index={i}
                player={player}
                label={slotLabel ? slotLabel(i) : i + 1}
                onRemove={disabled ? null : onRemove}
                isFirst={i === 0}
                isLast={i === slots.length - 1}
                injuryMap={injuryMap}
                ratingsMap={ratingsMap}
                isPitcher={isPitcher}
                disabled={disabled}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Roster pool (full team list, click to add)
// ─────────────────────────────────────────────────────────────────

function RosterPool({ players, lineupIds, rotationIds, onAddToLineup, onAddToRotation, injuryMap, ratingsMap }) {
  const [search, setSearch]       = useState('')
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
          const inLineup   = lineupIds.includes(player.id)
          const inRotation = rotationIds.includes(player.id)
          const isP        = isPitcher(player.position)

          return (
            <div
              key={player.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                (inLineup || inRotation) ? 'bg-brand/5 border border-brand/15' : 'hover:bg-bg-surface border border-transparent'
              }`}
            >
              <SimPlayerAvatar playerId={player.id} name={player.name} size={28} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-content-primary truncate">{player.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <PosBadge pos={player.position} />
                  {injuryMap?.[player.id] && <ILBadge severity={injuryMap[player.id]} />}
                  {inLineup    && <span className="text-[9px] font-bold text-brand uppercase">In Lineup</span>}
                  {inRotation  && <span className="text-[9px] font-bold text-blue-400 uppercase">In Rotation</span>}
                  <RatingDots ratings={ratingsMap?.[player.id]} isPitcher={isP} />
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!isP && onAddToLineup && (
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
                {isP && onAddToRotation && (
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
// Bullpen roles panel
// ─────────────────────────────────────────────────────────────────

function BullpenRolesPanel({ roster, rotationIds, roles, onChange }) {
  const relievers = roster.filter(p => !rotationIds.includes(p.id))

  function RoleSelect({ label, value, multi = false, max = 2 }) {
    const selected = multi
      ? (Array.isArray(value) ? value : []).slice(0, max)
      : value ?? null

    function toggle(pid) {
      if (!multi) {
        onChange({ [roleKey(label)]: pid === selected ? null : pid })
        return
      }
      const cur  = Array.isArray(selected) ? selected : []
      const next = cur.includes(pid)
        ? cur.filter(id => id !== pid)
        : cur.length < max ? [...cur, pid] : cur
      onChange({ [roleKey(label)]: next })
    }

    return (
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-content-muted">{label}</p>
        <div className="flex flex-wrap gap-1">
          {relievers.slice(0, 12).map(p => {
            const isActive = multi
              ? (Array.isArray(selected) && selected.includes(p.id))
              : selected === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                  isActive
                    ? 'bg-brand/10 text-brand border-brand/30'
                    : 'border-bg-border text-content-muted hover:border-brand/30'
                }`}
              >
                {p.name?.split(' ').pop() || p.name}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="card p-4 space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-content-secondary">Bullpen Roles</h3>
      <RoleSelect label="Closer"      value={roles?.closer_id} multi={false} />
      <RoleSelect label="Setup Men"   value={roles?.setup_ids} multi={true}  max={2} />
      <RoleSelect label="Long Relief" value={roles?.long_ids}  multi={true}  max={2} />
    </div>
  )
}

function roleKey(label) {
  if (label === 'Closer')      return 'closer_id'
  if (label === 'Setup Men')   return 'setup_ids'
  if (label === 'Long Relief') return 'long_ids'
  return label
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

  const { data: leagueData } = useQuery({
    queryKey: ['sim-state', id],
    queryFn:  () => api.simulations.show(id),
    staleTime: 60_000,
  })
  const isLiveMode = leagueData?.league?.live_mode ?? false

  const playerMap = useMemo(() => {
    const map = {}
    ;(rosterData?.roster || []).forEach(p => { map[p.id] = p })
    return map
  }, [rosterData])

  const injuryMap = useMemo(() => {
    const raw = rosterData?.injuries || {}
    const map = {}
    Object.entries(raw).forEach(([pid, inj]) => { map[parseInt(pid)] = inj.severity })
    return map
  }, [rosterData])

  const ratingsMap = useMemo(() => {
    const raw = rosterData?.ratings || {}
    const map = {}
    Object.entries(raw).forEach(([pid, r]) => { map[parseInt(pid)] = r })
    return map
  }, [rosterData])

  const [lineupIds, setLineupIds]       = useState(null)
  const [rotationIds, setRotationIds]   = useState(null)
  const [bullpenRoles, setBullpenRoles] = useState(null)

  const effectiveLineup   = lineupIds    ?? (rosterData?.lineup_order  || [])
  const effectiveRotation = rotationIds  ?? (rosterData?.rotation      || [])
  const effectiveBullpen  = bullpenRoles ?? (rosterData?.bullpen_roles || {})

  const lineupPlayers   = effectiveLineup.map(pid => playerMap[pid] || null)
  const rotationPlayers = effectiveRotation.map(pid => playerMap[pid] || null)

  const [saveError, setSaveError] = useState(null)

  const saveMutation = useMutation({
    mutationFn: () => api.simulations.updateRoster(id, teamId, {
      lineup_order:  effectiveLineup,
      rotation:      effectiveRotation,
      bullpen_roles: effectiveBullpen,
    }),
    onSuccess: () => {
      setLineupIds(null)
      setRotationIds(null)
      setBullpenRoles(null)
      setSaveError(null)
      qc.invalidateQueries({ queryKey: ['sim-roster', id, teamId] })
    },
    onError: (err) => setSaveError(err.message),
  })

  const isDirty = lineupIds !== null || rotationIds !== null || bullpenRoles !== null

  function removeFromLineup(idx) {
    setLineupIds(effectiveLineup.filter((_, i) => i !== idx))
  }

  function addToLineup(player) {
    if (effectiveLineup.includes(player.id)) return
    setLineupIds([...effectiveLineup, player.id])
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

        {isLiveMode ? (
          <span className="text-xs text-amber-400 border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 rounded-lg">
            Live mode — lineups are taken from actual MLB games
          </span>
        ) : (
          <div className="flex items-center gap-3">
            {saveError && (
              <span className="text-xs text-red-400">{saveError}</span>
            )}
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
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr] gap-5 items-start">
        {/* Batting Lineup */}
        <OrderedList
          title="Batting Order"
          ids={effectiveLineup}
          slots={lineupPlayers}
          onReorder={isLiveMode ? null : setLineupIds}
          onRemove={isLiveMode ? null : removeFromLineup}
          disabled={isLiveMode}
          injuryMap={injuryMap}
          ratingsMap={ratingsMap}
          isPitcher={false}
        />

        {/* Pitching Rotation + Bullpen Roles */}
        <div className="space-y-4">
          <OrderedList
            title="Pitching Staff"
            ids={effectiveRotation}
            slots={rotationPlayers}
            onReorder={isLiveMode ? null : setRotationIds}
            onRemove={isLiveMode ? null : removeFromRotation}
            slotLabel={i => rotationLabels[i] || `P${i + 1}`}
            disabled={isLiveMode}
            injuryMap={injuryMap}
            ratingsMap={ratingsMap}
            isPitcher={true}
          />

          {!isLiveMode && (
            <BullpenRolesPanel
              roster={rosterData?.roster || []}
              rotationIds={effectiveRotation}
              roles={effectiveBullpen}
              onChange={roles => setBullpenRoles({ ...effectiveBullpen, ...roles })}
            />
          )}
        </div>

        {/* Full roster pool */}
        <RosterPool
          players={rosterData?.roster || []}
          lineupIds={effectiveLineup}
          rotationIds={effectiveRotation}
          onAddToLineup={isLiveMode ? null : addToLineup}
          onAddToRotation={isLiveMode ? null : addToRotation}
          injuryMap={injuryMap}
          ratingsMap={ratingsMap}
        />
      </div>
    </div>
  )
}
