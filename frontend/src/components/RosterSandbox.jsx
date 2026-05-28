import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import { api } from '../api'

// ── Constants ─────────────────────────────────────────────────────────────────

const LINEUP_SLOTS = [
  { id: 'C',    label: 'C',    position: 'C',    group: 'Batters'  },
  { id: '1B',   label: '1B',   position: '1B',   group: 'Batters'  },
  { id: '2B',   label: '2B',   position: '2B',   group: 'Batters'  },
  { id: '3B',   label: '3B',   position: '3B',   group: 'Batters'  },
  { id: 'SS',   label: 'SS',   position: 'SS',   group: 'Batters'  },
  { id: 'OF-0', label: 'OF',   position: 'OF',   group: 'Batters'  },
  { id: 'OF-1', label: 'OF',   position: 'OF',   group: 'Batters'  },
  { id: 'OF-2', label: 'OF',   position: 'OF',   group: 'Batters'  },
  { id: 'Util', label: 'Util', position: 'Util', group: 'Batters'  },
  { id: 'SP-0', label: 'SP',   position: 'SP',   group: 'Pitchers' },
  { id: 'SP-1', label: 'SP',   position: 'SP',   group: 'Pitchers' },
  { id: 'RP-0', label: 'RP',   position: 'RP',   group: 'Pitchers' },
  { id: 'RP-1', label: 'RP',   position: 'RP',   group: 'Pitchers' },
]

const UTIL_ELIGIBLE = ['C', '1B', '2B', '3B', 'SS', 'OF']
const FA_POSITIONS  = ['All', 'C', '1B', '2B', '3B', 'SS', 'OF', 'SP', 'RP']

// Yahoo stat_id → label
const STAT_LABELS = {
  '16': 'HR', '18': 'RBI', '10': 'R', '28': 'SB',
  '34': 'W',  '37': 'K',   '41': 'ERA', '42': 'WHIP', '39': 'SV',
}
const BATTER_STATS  = ['16', '18', '10', '28']  // HR RBI R SB
const PITCHER_STATS = ['34', '37', '41', '39']  // W K ERA SV
// Rate stats — keep even when 0 (0.00 ERA is meaningful)
const RATE_STATS = new Set(['41', '42'])

// ── Pure helpers ──────────────────────────────────────────────────────────────

function normalizeEligible(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw.length) return raw.split(',').map(s => s.trim())
  return []
}

function canFill(player, slotPosition) {
  const positions = normalizeEligible(player?.eligible_positions)
  if (!positions.length) return false
  if (slotPosition === 'BN' || slotPosition === 'IL') return true
  if (slotPosition === 'Util') return positions.some(p => UTIL_ELIGIBLE.includes(p))
  return positions.includes(slotPosition)
}

function isPitcher(player) {
  return normalizeEligible(player?.eligible_positions).some(p => ['SP', 'RP', 'P'].includes(p))
}

function fmtStat(id, raw) {
  const v = parseFloat(raw)
  if (isNaN(v)) return null
  if (v === 0 && !RATE_STATS.has(id)) return null   // hide zero counting stats
  return RATE_STATS.has(id) ? v.toFixed(2) : (Number.isInteger(v) ? String(v) : v.toFixed(1))
}

function buildStatChips(player) {
  const stats = player.season_stats
  if (!Array.isArray(stats) || stats.length === 0) return []
  const ids = isPitcher(player) ? PITCHER_STATS : BATTER_STATS
  return ids.flatMap(id => {
    const entry = stats.find(s => String(s.stat_id) === id)
    if (!entry) return []
    const val = fmtStat(id, entry.value)
    return val !== null ? [{ id, label: STAT_LABELS[id], val }] : []
  })
}

// ── State helpers ─────────────────────────────────────────────────────────────

function initState(roster) {
  const slotMap = {}
  LINEUP_SLOTS.forEach(s => { slotMap[s.id] = null })
  if (!Array.isArray(roster) || !roster.length) return { slotMap, bench: [], il: [], dropped: [] }

  const bench = [], il = []
  let ofIdx = 0, spIdx = 0, rpIdx = 0

  for (const raw of roster) {
    const p = { ...raw, eligible_positions: normalizeEligible(raw.eligible_positions) }
    const pos = p.selected_position
    if      (pos === 'OF' && ofIdx < 3)      { slotMap[`OF-${ofIdx++}`] = p }
    else if (pos === 'SP' && spIdx < 2)      { slotMap[`SP-${spIdx++}`] = p }
    else if (pos === 'RP' && rpIdx < 2)      { slotMap[`RP-${rpIdx++}`] = p }
    else if (pos in slotMap && !slotMap[pos]){ slotMap[pos] = p }
    else if (pos === 'BN')                   { bench.push(p) }
    else if (pos === 'IL')                   { il.push(p) }
    else                                     { bench.push(p) }
  }
  return { slotMap, bench, il, dropped: [] }
}

function findPlayer(state, key) {
  for (const p of Object.values(state.slotMap)) if (p?.player_key === key) return p
  return state.bench.find(p => p.player_key === key)
      || state.il.find(p => p.player_key === key)
      || (state.dropped || []).find(p => p.player_key === key)
      || null
}

function findSlot(state, key) {
  for (const [id, p] of Object.entries(state.slotMap)) if (p?.player_key === key) return id
  if (state.bench.some(p => p.player_key === key)) return 'BN'
  if (state.il.some(p => p.player_key === key)) return 'IL'
  return null
}

function applyMove(state, log, playerKey, targetId) {
  const player   = findPlayer(state, playerKey)
  const sourceId = findSlot(state, playerKey)
  if (!player || !sourceId || sourceId === targetId) return null

  const targetDef  = LINEUP_SLOTS.find(s => s.id === targetId)
  const targetPos  = targetDef?.position ?? targetId
  if (!canFill(player, targetPos)) return null

  const newSlotMap = { ...state.slotMap }
  const newBench   = [...state.bench]
  const newIl      = [...state.il]

  if (sourceId === 'BN') newBench.splice(newBench.findIndex(p => p.player_key === playerKey), 1)
  else if (sourceId === 'IL') newIl.splice(newIl.findIndex(p => p.player_key === playerKey), 1)
  else newSlotMap[sourceId] = null

  let displaced = null
  if      (targetId === 'BN') newBench.push(player)
  else if (targetId === 'IL') newIl.push(player)
  else { displaced = newSlotMap[targetId]; newSlotMap[targetId] = player }

  if (displaced) {
    const srcDef = LINEUP_SLOTS.find(s => s.id === sourceId)
    if (srcDef && canFill(displaced, srcDef.position)) newSlotMap[sourceId] = displaced
    else if (sourceId === 'IL') newIl.push(displaced)
    else newBench.push(displaced)
  }

  const src = sourceId.replace(/-\d+$/, '')
  const tgt = targetId.replace(/-\d+$/, '')
  const entry = displaced
    ? `Swap ${player.name} (${src}) ↔ ${displaced.name} (${tgt})`
    : `${player.name}: ${src} → ${tgt}`

  return { state: { slotMap: newSlotMap, bench: newBench, il: newIl, dropped: state.dropped || [] }, log: [entry, ...log] }
}

function applyDrop(state, log, playerKey) {
  const player   = findPlayer(state, playerKey)
  const sourceId = findSlot(state, playerKey)
  if (!player || !sourceId) return null

  const newSlotMap = { ...state.slotMap }
  const newBench   = [...state.bench]
  const newIl      = [...state.il]

  if      (sourceId === 'BN') newBench.splice(newBench.findIndex(p => p.player_key === playerKey), 1)
  else if (sourceId === 'IL') newIl.splice(newIl.findIndex(p => p.player_key === playerKey), 1)
  else newSlotMap[sourceId] = null

  return {
    state: { slotMap: newSlotMap, bench: newBench, il: newIl, dropped: [...(state.dropped || []), player] },
    log: [`Drop ${player.name}`, ...log],
  }
}

function applyAddFA(state, log, fa, droppedKey) {
  const dropped = findPlayer(state, droppedKey)
  const result  = applyDrop(state, log, droppedKey)
  if (!result) return null

  const faPlayer = { ...fa, selected_position: 'BN', eligible_positions: normalizeEligible(fa.eligible_positions) }
  return {
    state: { ...result.state, bench: [...result.state.bench, faPlayer] },
    log: [`Add ${fa.name} (FA) · Drop ${dropped?.name}`, ...log],
  }
}

// ── Debounce hook ─────────────────────────────────────────────────────────────

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Shared PlayerCard ─────────────────────────────────────────────────────────
// Used in lineup slots, bench/IL, FA list, and drop picker — always the same layout.

function PlayerCard({ player, ptsValue, ptsLabel, action }) {
  const chips = buildStatChips(player)

  return (
    <div className="flex items-center gap-2.5 w-full min-w-0">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full overflow-hidden bg-bg-elevated border border-bg-border shrink-0 flex items-center justify-center">
        {player.image_url
          ? <img src={player.image_url} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none' }} />
          : <span className="text-[11px] font-bold text-content-muted">{player.name?.[0]}</span>
        }
      </div>

      {/* Name / team / stats */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] font-semibold text-content-primary truncate leading-tight">{player.name}</span>
          {player.status && <StatusBadge status={player.status} />}
        </div>
        <div className="text-[10px] text-content-muted leading-tight mt-px">
          {player.team_abbr} · {normalizeEligible(player.eligible_positions).join(', ')}
        </div>
        {chips.length > 0 ? (
          <div className="flex gap-x-2.5 mt-0.5 flex-wrap">
            {chips.map(c => (
              <span key={c.id} className="text-[10px] font-mono text-content-muted">
                {c.label}&thinsp;<span className="font-semibold text-content-secondary">{c.val}</span>
              </span>
            ))}
          </div>
        ) : player.is_starting_today ? (
          <div className="text-[10px] text-green-400/80 mt-0.5">Starting today</div>
        ) : null}
      </div>

      {/* Points */}
      {ptsValue != null && (
        <div className="shrink-0 text-right min-w-[44px]">
          <div className="text-sm font-bold font-mono text-brand tabular-nums leading-tight">
            {Number(ptsValue).toFixed(1)}
          </div>
          {ptsLabel && <div className="text-[9px] text-content-muted leading-tight">{ptsLabel}</div>}
        </div>
      )}

      {/* Action slot */}
      {action}
    </div>
  )
}

function StatusBadge({ status }) {
  const cls = status.startsWith('IL') ? 'text-red-400 bg-red-400/10 border-red-400/20'
    : status === 'DTD' ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
    : 'text-content-muted bg-bg-border border-bg-border'
  return (
    <span className={`inline-flex items-center px-1 py-px rounded text-[9px] font-semibold border ${cls}`}>
      {status}
    </span>
  )
}

function DropBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="Drop player"
      className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-[11px] text-content-muted/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
    >
      ✕
    </button>
  )
}

function AddBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 text-[11px] px-2 py-0.5 rounded font-semibold bg-brand/10 text-brand border border-brand/20 hover:bg-brand/20 transition-colors whitespace-nowrap"
    >
      + Add
    </button>
  )
}

// ── Drag wrapper ──────────────────────────────────────────────────────────────

function Draggable({ player, children }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: player.player_key })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing select-none touch-none w-full transition-opacity ${isDragging ? 'opacity-30' : ''}`}
    >
      {children}
    </div>
  )
}

// ── Lineup slot ───────────────────────────────────────────────────────────────

function SlotRow({ slotDef, player, activePlayer, onDrop }) {
  const isValid = activePlayer ? canFill(activePlayer, slotDef.position) : null
  const { isOver, setNodeRef } = useDroppable({ id: slotDef.id })

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
        isOver && isValid            ? 'border-brand bg-brand/10' :
        isOver && isValid === false  ? 'border-red-500/40 bg-red-500/5' :
        activePlayer && isValid      ? 'border-brand/30 bg-brand/5' :
        activePlayer && !isValid     ? 'opacity-40 border-bg-border/30' :
                                       'border-bg-border/50'
      }`}
    >
      <span className="w-8 shrink-0 text-center text-[10px] font-bold text-content-muted">
        {slotDef.label}
      </span>
      <div className="flex-1 min-h-[48px] flex items-center min-w-0">
        {player ? (
          <Draggable player={player}>
            <PlayerCard
              player={player}
              ptsValue={player.week_total > 0 ? player.week_total : null}
              ptsLabel="this wk"
            />
          </Draggable>
        ) : (
          <span className="text-[11px] text-content-muted/40 italic">—</span>
        )}
      </div>
      {player && !activePlayer && <DropBtn onClick={() => onDrop(player.player_key)} />}
    </div>
  )
}

// ── Pool area (bench / IL) ────────────────────────────────────────────────────

function PoolArea({ id, label, players, activePlayer, onDrop }) {
  const { isOver, setNodeRef } = useDroppable({ id })
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">{label}</div>
      <div
        ref={setNodeRef}
        className={`min-h-[44px] rounded-lg border p-2 transition-colors space-y-1 ${
          isOver ? 'border-brand bg-brand/10' : activePlayer ? 'border-brand/30 bg-brand/5' : 'border-bg-border'
        }`}
      >
        {players.length > 0 ? players.map(p => (
          <div key={p.player_key} className="flex items-center gap-1">
            <Draggable player={p}>
              <PlayerCard
                player={p}
                ptsValue={p.week_total > 0 ? p.week_total : null}
                ptsLabel="this wk"
              />
            </Draggable>
            {!activePlayer && <DropBtn onClick={() => onDrop(p.player_key)} />}
          </div>
        )) : (
          <span className="text-[11px] text-content-muted/40 italic">Empty</span>
        )}
      </div>
    </div>
  )
}

// ── Dropped list ──────────────────────────────────────────────────────────────

function DroppedList({ players }) {
  if (!players.length) return null
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-widest text-red-400/60 mb-2">Dropped</div>
      <div className="space-y-1.5">
        {players.map(p => (
          <div key={p.player_key} className="opacity-50 px-2">
            <PlayerCard player={p} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Drop picker modal ─────────────────────────────────────────────────────────

function DropPicker({ fa, sandboxState, weekNumber, onConfirm, onCancel }) {
  const [selectedKey, setSelectedKey] = useState(null)

  const roster = useMemo(() => [
    ...Object.values(sandboxState.slotMap).filter(Boolean),
    ...sandboxState.bench,
    ...sandboxState.il,
  ], [sandboxState])

  const selected     = roster.find(p => p.player_key === selectedKey) ?? null
  const faWeeklyAvg  = fa.season_points && weekNumber > 0 ? fa.season_points / weekNumber : null
  const delta        = faWeeklyAvg != null && selected?.week_total != null
    ? faWeeklyAvg - selected.week_total
    : null

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="bg-bg-surface border border-bg-border rounded-xl shadow-2xl w-full max-w-sm flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="p-4 border-b border-bg-border shrink-0">
          <div className="text-sm font-semibold text-content-primary">Adding {fa.name}</div>
          <div className="text-[11px] text-content-muted mt-0.5">
            {fa.team_abbr} · {fa.position}
            {faWeeklyAvg != null && (
              <span className="ml-2 text-brand font-semibold">~{faWeeklyAvg.toFixed(1)} pts/wk avg</span>
            )}
          </div>
        </div>

        {/* Impact comparison */}
        {selected && (
          <div className={`mx-4 mt-3 p-3 rounded-lg border shrink-0 ${
            delta > 0 ? 'border-green-500/30 bg-green-500/5' : delta < 0 ? 'border-red-500/30 bg-red-500/5' : 'border-bg-border bg-bg-elevated'
          }`}>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <div className="text-[9px] uppercase tracking-wide text-content-muted mb-1 font-semibold">+ Adding</div>
                <div className="font-semibold text-content-primary">{fa.name}</div>
                <div className="text-content-secondary mt-0.5">
                  {faWeeklyAvg != null
                    ? <><span className="text-brand font-bold">{faWeeklyAvg.toFixed(1)}</span> pts/wk avg</>
                    : <><span className="text-brand font-bold">{Number(fa.season_points || 0).toFixed(1)}</span> season</>
                  }
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wide text-content-muted mb-1 font-semibold">− Dropping</div>
                <div className="font-semibold text-content-primary">{selected.name}</div>
                <div className="text-content-secondary mt-0.5">
                  {selected.week_total != null
                    ? <><span className="font-bold">{Number(selected.week_total).toFixed(1)}</span> pts this wk</>
                    : 'No stats'
                  }
                </div>
              </div>
            </div>
            {delta !== null && (
              <div className={`mt-2 text-xs font-bold ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {delta >= 0 ? '↑ +' : '↓ '}{delta.toFixed(1)} pts/wk
              </div>
            )}
          </div>
        )}

        {/* Player list */}
        <div className="text-[11px] font-medium text-content-muted px-4 pt-3 pb-1 shrink-0">
          Who do you want to drop?
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-1.5">
          {roster.map(p => (
            <button
              key={p.player_key}
              onClick={() => setSelectedKey(p.player_key)}
              className={`w-full p-2.5 rounded-lg border text-left transition-colors ${
                selectedKey === p.player_key
                  ? 'border-brand bg-brand/10'
                  : 'border-bg-border hover:border-brand/30 hover:bg-bg-elevated'
              }`}
            >
              <PlayerCard
                player={p}
                ptsValue={p.week_total > 0 ? p.week_total : null}
                ptsLabel="this wk"
              />
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-bg-border flex gap-2 shrink-0">
          <button onClick={onCancel} className="flex-1 py-2 rounded border border-bg-border text-sm text-content-secondary hover:text-content-primary transition-colors">
            Cancel
          </button>
          <button
            onClick={() => selectedKey && onConfirm(fa, selectedKey)}
            disabled={!selectedKey}
            className="flex-1 py-2 rounded bg-brand text-white text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm Add
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Free agent search ─────────────────────────────────────────────────────────

function FreeAgentSearch({ onAddFA }) {
  const [position, setPosition] = useState('All')
  const [search, setSearch]     = useState('')
  const debouncedSearch         = useDebounced(search, 400)

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['yahoo-fa-search', position, debouncedSearch],
    queryFn: () => api.yahoo.searchFreeAgents({
      position: position === 'All' ? null : position,
      search:   debouncedSearch || null,
    }),
    staleTime: 3 * 60_000,
    retry: 1,
  })

  const players = data?.players ?? []

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-content-muted">
          Add Free Agent
        </div>
        {(isLoading || isFetching) && (
          <div className="w-3 h-3 border border-brand border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Search input */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted/50 text-sm pointer-events-none">⌕</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-full pl-8 pr-3 py-2 rounded-lg border border-bg-border bg-bg-elevated text-sm text-content-primary placeholder:text-content-muted/50 focus:outline-none focus:border-brand/50 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted/50 hover:text-content-muted transition-colors text-xs">
            ✕
          </button>
        )}
      </div>

      {/* Position filter */}
      <div className="flex flex-wrap gap-1.5">
        {FA_POSITIONS.map(pos => (
          <button
            key={pos}
            onClick={() => { setPosition(pos); setSearch('') }}
            className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-colors ${
              position === pos
                ? 'bg-brand/20 text-brand border border-brand/30'
                : 'bg-bg-elevated border border-bg-border text-content-secondary hover:text-content-primary'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {isError && <div className="text-sm text-content-muted">Free agents unavailable — check Yahoo connection.</div>}

      {!isLoading && !isError && players.length === 0 && (
        <div className="text-sm text-content-muted">
          {search ? `No free agents found matching "${search}".` : 'No free agents available for this position.'}
        </div>
      )}

      {players.length > 0 && (
        <div className="space-y-1.5">
          {players.map(p => (
            <div key={p.player_key} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-bg-border bg-bg-elevated hover:border-brand/30 transition-colors">
              <div className="flex-1 min-w-0">
                <PlayerCard
                  player={p}
                  ptsValue={p.season_points != null ? p.season_points : null}
                  ptsLabel="season"
                  action={<AddBtn onClick={() => onAddFA(p)} />}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function RosterSandbox({ roster, weekNumber = 1 }) {
  const [sandboxState, setSandboxState] = useState(() => initState(roster))
  const [log, setLog]                   = useState([])
  const [activeKey, setActiveKey]       = useState(null)
  const [pendingFA, setPendingFA]       = useState(null)
  const seededRef                       = useRef(false)

  useEffect(() => {
    if (roster?.length && !seededRef.current) {
      setSandboxState(initState(roster))
      seededRef.current = true
    }
  }, [roster])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const activePlayer = useMemo(
    () => (activeKey ? findPlayer(sandboxState, activeKey) : null),
    [activeKey, sandboxState]
  )

  function handleDragStart({ active }) { setActiveKey(active.id) }

  function handleDragEnd({ active, over }) {
    setActiveKey(null)
    if (!over) return
    const r = applyMove(sandboxState, log, active.id, over.id)
    if (r) { setSandboxState(r.state); setLog(r.log) }
  }

  function handleDrop(playerKey) {
    const r = applyDrop(sandboxState, log, playerKey)
    if (r) { setSandboxState(r.state); setLog(r.log) }
  }

  function handleConfirmAdd(fa, droppedKey) {
    const r = applyAddFA(sandboxState, log, fa, droppedKey)
    if (r) { setSandboxState(r.state); setLog(r.log) }
    setPendingFA(null)
  }

  function handleClear() {
    seededRef.current = false
    setSandboxState(initState(roster))
    setLog([])
    seededRef.current = true
  }

  async function handleCopyLog() {
    if (!log.length) return
    await navigator.clipboard.writeText(
      log.slice().reverse().map((e, i) => `${i + 1}. ${e}`).join('\n')
    )
  }

  const batters  = LINEUP_SLOTS.filter(s => s.group === 'Batters')
  const pitchers = LINEUP_SLOTS.filter(s => s.group === 'Pitchers')

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex items-center justify-between mb-4 gap-3">
          <p className="text-sm text-content-secondary">
            Drag to rearrange · <span className="text-content-muted font-medium">✕</span> to drop a player
          </p>
          <div className="flex gap-2 shrink-0">
            <button onClick={handleCopyLog} disabled={!log.length}
              className="text-[11px] px-3 py-1.5 rounded border border-bg-border text-content-secondary hover:text-content-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Copy log
            </button>
            <button onClick={handleClear}
              className="text-[11px] px-3 py-1.5 rounded border border-bg-border text-content-secondary hover:text-content-primary transition-colors">
              Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start">
          {/* Left: lineup + FA search */}
          <div className="space-y-4">
            <div className="card p-4">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">Batters</div>
              <div className="space-y-1">
                {batters.map(s => (
                  <SlotRow key={s.id} slotDef={s} player={sandboxState.slotMap[s.id]} activePlayer={activePlayer} onDrop={handleDrop} />
                ))}
              </div>
            </div>

            <div className="card p-4">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">Pitchers</div>
              <div className="space-y-1">
                {pitchers.map(s => (
                  <SlotRow key={s.id} slotDef={s} player={sandboxState.slotMap[s.id]} activePlayer={activePlayer} onDrop={handleDrop} />
                ))}
              </div>
            </div>

            <div className="card p-4 space-y-4">
              <PoolArea id="BN" label="Bench" players={sandboxState.bench} activePlayer={activePlayer} onDrop={handleDrop} />
              <PoolArea id="IL" label="Injured List" players={sandboxState.il} activePlayer={activePlayer} onDrop={handleDrop} />
              <DroppedList players={sandboxState.dropped ?? []} />
            </div>

            <FreeAgentSearch onAddFA={setPendingFA} />
          </div>

          {/* Right: transaction log */}
          <div className="card p-4 lg:sticky lg:top-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-3">
              Transaction Log
              {log.length > 0 && <span className="ml-2 font-normal normal-case tracking-normal text-content-secondary">({log.length})</span>}
            </div>
            {!log.length ? (
              <div className="text-[11px] text-content-muted/60 italic">No moves yet.</div>
            ) : (
              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                {log.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="shrink-0 text-[10px] font-mono text-content-muted/50 mt-0.5 w-5 text-right">{log.length - i}.</span>
                    <span className="text-[11px] text-content-secondary leading-snug">{entry}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activePlayer && (
            <div className="bg-bg-surface border border-brand rounded-lg px-3 py-2 shadow-lg pointer-events-none w-[240px]">
              <PlayerCard player={activePlayer} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {pendingFA && (
        <DropPicker
          fa={pendingFA}
          sandboxState={sandboxState}
          weekNumber={weekNumber}
          onConfirm={handleConfirmAdd}
          onCancel={() => setPendingFA(null)}
        />
      )}
    </>
  )
}
