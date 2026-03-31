import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

export default function Navbar() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['player-search', query],
    queryFn: () => api.players.search(query),
    enabled: query.length >= 2,
    staleTime: 30_000,
  })

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && !inputRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSelect(player) {
    setQuery('')
    setOpen(false)
    navigate(`/player/${player.id}`)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') setOpen(false)
  }

  const navLink = (path, label) => (
    <Link
      to={path}
      className={`text-sm font-medium transition-colors ${
        location.pathname === path
          ? 'text-content-primary'
          : 'text-content-secondary hover:text-content-primary'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <nav className="sticky top-0 z-50 border-b border-bg-border bg-bg-base/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="text-xl">⚾</span>
          <span className="font-bold text-content-primary tracking-tight">Statline</span>
        </Link>

        {/* Nav links */}
        <div className="hidden sm:flex items-center gap-5">
          {navLink('/', 'Today')}
          {navLink('/leaderboards', 'Leaderboards')}
        </div>

        {/* Search — grows to fill remaining space */}
        <div className="relative flex-1 max-w-md ml-auto">
          <div className="flex items-center gap-2 bg-bg-surface border border-bg-border rounded-lg px-3 py-2 focus-within:border-brand transition-colors">
            <svg className="w-4 h-4 text-content-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => query.length >= 2 && setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search players…"
              className="bg-transparent text-sm text-content-primary placeholder-content-muted outline-none w-full"
            />
            {isFetching && (
              <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
            )}
          </div>

          {/* Dropdown */}
          {open && results.length > 0 && (
            <div ref={dropdownRef} className="absolute top-full mt-2 w-full bg-bg-elevated border border-bg-border rounded-xl shadow-2xl overflow-hidden z-50">
              {results.slice(0, 8).map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-border transition-colors text-left"
                >
                  <img
                    src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_60,q_auto:best/v1/people/${p.id}/headshot/67/current`}
                    alt={p.name}
                    className="w-8 h-8 rounded-full object-cover bg-bg-border"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-content-primary truncate">{p.name}</div>
                    <div className="text-xs text-content-muted truncate">
                      {p.position} · {p.team || 'Free Agent'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
