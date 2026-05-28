import { createContext, useContext, useState, useCallback } from 'react'

const STORAGE_KEY = 'ottoneu_player_lists_v1'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { watch: [], cut: [], trade: [] }
    const p = JSON.parse(raw)
    return {
      watch: Array.isArray(p.watch) ? p.watch : [],
      cut:   Array.isArray(p.cut)   ? p.cut   : [],
      trade: Array.isArray(p.trade) ? p.trade : [],
    }
  } catch {
    return { watch: [], cut: [], trade: [] }
  }
}

function persist(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

export function listKey(p) {
  return p.player_id != null ? `pid:${p.player_id}` : `fgid:${p.fg_id ?? p.name}`
}

function normalize(p) {
  const k = listKey(p)
  return {
    _key:          k,
    player_id:     p.player_id     ?? null,
    fg_id:         p.fg_id         ?? null,
    name:          p.name          ?? '',
    mlb_team:      p.mlb_team      ?? p.team ?? '',
    roster_team:   p.roster_team   ?? null,
    salary:        p.salary        ?? null,
    approx_fg_pts: p.approx_fg_pts ?? null,
    on_my_team:    p.on_my_team    ?? false,
  }
}

export function usePlayerLists() {
  const [state, setState] = useState(load)

  const toggle = useCallback((player, list) => {
    setState(prev => {
      const k = listKey(player)
      const exists = prev[list].some(p => p._key === k)
      const next = exists
        ? { ...prev, [list]: prev[list].filter(p => p._key !== k) }
        : { ...prev, [list]: [...prev[list], normalize(player)] }
      persist(next)
      return next
    })
  }, [])

  const remove = useCallback((player, list) => {
    setState(prev => {
      const k = listKey(player)
      const next = { ...prev, [list]: prev[list].filter(p => p._key !== k) }
      persist(next)
      return next
    })
  }, [])

  const clear = useCallback((list) => {
    setState(prev => {
      const next = { ...prev, [list]: [] }
      persist(next)
      return next
    })
  }, [])

  const isOn = useCallback((player, list) => {
    const k = listKey(player)
    return state[list]?.some(p => p._key === k) ?? false
  }, [state])

  return { lists: state, toggle, remove, clear, isOn }
}

export const PlayerListsContext = createContext(null)

export function PlayerListsProvider({ children }) {
  const value = usePlayerLists()
  return <PlayerListsContext.Provider value={value}>{children}</PlayerListsContext.Provider>
}

export function usePlayerListsContext() {
  return useContext(PlayerListsContext)
}
