import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

const HEADSHOT = (id) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_60,q_auto:best/v1/people/${id}/headshot/67/current`

export default function PlayerSearchInput({ value, onChange, placeholder = 'Search player…' }) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const inputRef            = useRef(null)
  const dropdownRef         = useRef(null)

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['player-search', query],
    queryFn: () => api.players.search(query),
    enabled: query.length >= 2,
    staleTime: 30_000,
    retry: false,
  })

  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current   && !inputRef.current.contains(e.target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSelect(player) {
    onChange(player)
    setQuery('')
    setOpen(false)
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 bg-bg-elevated border border-bg-border rounded px-2.5 py-1.5">
        <img
          src={HEADSHOT(value.id)}
          alt={value.name}
          className="w-5 h-5 rounded-full object-cover bg-bg-border shrink-0"
          onError={(e) => { e.target.style.display = 'none' }}
        />
        <span className="text-xs text-content-primary flex-1 truncate font-medium">{value.name}</span>
        {value.position && (
          <span className="text-xs text-content-muted shrink-0">{value.position}</span>
        )}
        <button
          onClick={() => onChange(null)}
          className="text-content-muted hover:text-content-primary shrink-0 ml-1 text-base leading-none"
          aria-label="Clear player filter"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-bg-elevated border border-bg-border rounded px-2.5 py-1.5 focus-within:border-brand transition-colors">
        <svg className="w-3 h-3 text-content-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          onKeyDown={e => e.key === 'Escape' && setOpen(false)}
          placeholder={placeholder}
          className="bg-transparent text-xs text-content-primary placeholder:text-content-muted outline-none w-full"
        />
        {isFetching && (
          <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
        )}
      </div>

      {open && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full mt-1 left-0 right-0 bg-bg-elevated border border-bg-border rounded-lg shadow-xl overflow-hidden z-50"
        >
          {results.slice(0, 6).map(p => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-bg-border transition-colors text-left"
            >
              <img
                src={HEADSHOT(p.id)}
                alt={p.name}
                className="w-7 h-7 rounded-full object-cover bg-bg-border shrink-0"
                onError={(e) => { e.target.style.display = 'none' }}
              />
              <div className="min-w-0">
                <div className="text-xs font-medium text-content-primary truncate">{p.name}</div>
                <div className="text-xs text-content-muted truncate">
                  {p.position}{p.team ? ` · ${p.team}` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
