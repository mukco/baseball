import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

const ALL_TEAMS = [
  { id: 108, name: 'Los Angeles Angels',       abbreviation: 'LAA', color: '#003263' },
  { id: 109, name: 'Arizona Diamondbacks',      abbreviation: 'ARI', color: '#A71930' },
  { id: 110, name: 'Baltimore Orioles',         abbreviation: 'BAL', color: '#DF4601' },
  { id: 111, name: 'Boston Red Sox',            abbreviation: 'BOS', color: '#BD3039' },
  { id: 112, name: 'Chicago Cubs',              abbreviation: 'CHC', color: '#0E3386' },
  { id: 113, name: 'Cincinnati Reds',           abbreviation: 'CIN', color: '#C6011F' },
  { id: 114, name: 'Cleveland Guardians',       abbreviation: 'CLE', color: '#00385D' },
  { id: 115, name: 'Colorado Rockies',          abbreviation: 'COL', color: '#33006F' },
  { id: 116, name: 'Detroit Tigers',            abbreviation: 'DET', color: '#0C2340' },
  { id: 117, name: 'Houston Astros',            abbreviation: 'HOU', color: '#002D62' },
  { id: 118, name: 'Kansas City Royals',        abbreviation: 'KC',  color: '#004687' },
  { id: 119, name: 'Los Angeles Dodgers',       abbreviation: 'LAD', color: '#005A9C' },
  { id: 120, name: 'Washington Nationals',      abbreviation: 'WSH', color: '#AB0003' },
  { id: 121, name: 'New York Mets',             abbreviation: 'NYM', color: '#002D72' },
  { id: 133, name: 'Athletics',                 abbreviation: 'ATH', color: '#003831' },
  { id: 134, name: 'Pittsburgh Pirates',        abbreviation: 'PIT', color: '#FDB827' },
  { id: 135, name: 'San Diego Padres',          abbreviation: 'SD',  color: '#2F241D' },
  { id: 136, name: 'Seattle Mariners',          abbreviation: 'SEA', color: '#0C2C56' },
  { id: 137, name: 'San Francisco Giants',      abbreviation: 'SF',  color: '#FD5A1E' },
  { id: 138, name: 'St. Louis Cardinals',       abbreviation: 'STL', color: '#C41E3A' },
  { id: 139, name: 'Tampa Bay Rays',            abbreviation: 'TB',  color: '#092C5C' },
  { id: 140, name: 'Texas Rangers',             abbreviation: 'TEX', color: '#003278' },
  { id: 141, name: 'Toronto Blue Jays',         abbreviation: 'TOR', color: '#134A8E' },
  { id: 142, name: 'Minnesota Twins',           abbreviation: 'MIN', color: '#002B5C' },
  { id: 143, name: 'Philadelphia Phillies',     abbreviation: 'PHI', color: '#E81828' },
  { id: 144, name: 'Atlanta Braves',            abbreviation: 'ATL', color: '#CE1141' },
  { id: 145, name: 'Chicago White Sox',         abbreviation: 'CWS', color: '#27251F' },
  { id: 146, name: 'Miami Marlins',             abbreviation: 'MIA', color: '#00A3E0' },
  { id: 147, name: 'New York Yankees',          abbreviation: 'NYY', color: '#003087' },
  { id: 158, name: 'Milwaukee Brewers',         abbreviation: 'MIL', color: '#12284B' },
]

export default function Navbar({ theme = 'light', onToggleTheme, assistantOpen = false, onToggleAssistant }) {
  const [query, setQuery]           = useState('')
  const [open, setOpen]             = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const inputRef    = useRef(null)
  const dropdownRef = useRef(null)
  const navigate    = useNavigate()
  const location    = useLocation()

  // Close mobile drawer on any navigation
  useEffect(() => { setMobileMenuOpen(false) }, [location.pathname])

  const { data: playerResults = [], isFetching, isError: searchError } = useQuery({
    queryKey: ['player-search', query],
    queryFn: () => api.players.search(query),
    enabled: query.length >= 2,
    staleTime: 30_000,
    retry: false,
  })

  const teamResults = query.length >= 2
    ? ALL_TEAMS.filter(t =>
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        t.abbreviation.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 3)
    : []

  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSelect(item, type) {
    setQuery('')
    setOpen(false)
    navigate(type === 'team' ? `/team/${item.id}` : `/player/${item.id}`)
  }

  const hasResults = playerResults.length > 0 || teamResults.length > 0

  function handleKeyDown(e) {
    if (e.key === 'Escape') setOpen(false)
  }

  const navLink = (path, label) => {
    const active = location.pathname === path
    return (
      <Link
        to={path}
        className={`text-[13px] font-medium px-3 py-1.5 rounded-md transition-colors ${
          active
            ? 'bg-bg-elevated text-content-primary'
            : 'text-content-secondary hover:text-content-primary'
        }`}
      >
        {label}
      </Link>
    )
  }

  const mobileLink = (to, label) => {
    const active = to === '/'
      ? location.pathname === '/'
      : location.pathname === to || location.pathname.startsWith(to + '/')
    return (
      <Link
        key={to}
        to={to}
        onClick={() => setMobileMenuOpen(false)}
        className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          active
            ? 'bg-bg-elevated text-content-primary'
            : 'text-content-secondary hover:text-content-primary hover:bg-bg-elevated/60'
        }`}
      >
        {label}
      </Link>
    )
  }

  const drawerSection = (title) => (
    <div key={title} className="px-3 pt-4 pb-1">
      <span className="text-[10px] font-semibold text-content-muted uppercase tracking-widest">{title}</span>
    </div>
  )

  function NewsDropdown({ location }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
      const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [])

    const NEWS_ITEMS = [
      { to: '/news',         label: 'News'         },
      { to: '/digest',       label: 'Stat Blast'   },
      { to: '/transactions', label: 'Transactions' },
      { to: '/gambling',     label: 'Picks'        },
    ]

    const active = NEWS_ITEMS.some(i => location.pathname === i.to)

    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`text-[13px] font-medium px-3 py-1.5 rounded-md transition-colors ${
            active
              ? 'bg-bg-elevated text-content-primary'
              : 'text-content-secondary hover:text-content-primary'
          }`}
        >
          News
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute top-full mt-1 left-0 z-50 bg-bg-elevated border border-bg-border rounded-lg shadow-2xl py-1 min-w-[140px]">
              {NEWS_ITEMS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-2 text-sm transition-colors ${
                    location.pathname === to
                      ? 'text-content-primary bg-bg-border/40'
                      : 'text-content-secondary hover:text-content-primary hover:bg-bg-border/20'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  function ResearchDropdown({ location }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
      const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [])

    const ITEMS = [
      { to: '/leaderboards', label: 'Stats'        },
      { to: '/projections',  label: 'Projections'  },
      { to: '/simulation',   label: 'Simulation'   },
      { to: '/sandbox',      label: 'Sandbox'      },
      { to: '/ml',           label: 'ML Builder'   },
    ]

    const isItemActive = (to) => {
      if (to === '/simulation') {
        return location.pathname.startsWith('/simulation') || location.pathname.startsWith('/franchise')
      }
      return location.pathname === to
    }

    const active = ITEMS.some(i => isItemActive(i.to))

    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`text-[13px] font-medium px-3 py-1.5 rounded-md transition-colors ${
            active
              ? 'bg-bg-elevated text-content-primary'
              : 'text-content-secondary hover:text-content-primary'
          }`}
        >
          Research
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute top-full mt-1 left-0 z-50 bg-bg-elevated border border-bg-border rounded-lg shadow-2xl py-1 min-w-[140px]">
              {ITEMS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-2 text-sm transition-colors ${
                    isItemActive(to)
                      ? 'text-content-primary bg-bg-border/40'
                      : 'text-content-secondary hover:text-content-primary hover:bg-bg-border/20'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // right-0 so the dropdown doesn't clip on narrower desktop windows
  function DefinitionsDropdown({ location }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
      const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [])

    const ITEMS = [
      { to: '/stats-reference',    label: 'Stats'    },
      { to: '/gambling-reference', label: 'Gambling' },
      { to: '/baseball-reference', label: 'Baseball' },
    ]

    const active = ITEMS.some(i => location.pathname === i.to)

    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`text-[13px] font-medium px-3 py-1.5 rounded-md transition-colors ${
            active
              ? 'bg-bg-elevated text-content-primary'
              : 'text-content-secondary hover:text-content-primary'
          }`}
        >
          Definitions
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute top-full mt-1 right-0 z-50 bg-bg-elevated border border-bg-border rounded-lg shadow-2xl py-1 min-w-[140px]">
              {ITEMS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-2 text-sm transition-colors ${
                    location.pathname === to
                      ? 'text-content-primary bg-bg-border/40'
                      : 'text-content-secondary hover:text-content-primary hover:bg-bg-border/20'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-bg-border bg-bg-base/90 backdrop-blur-md">

      {/* Mobile drawer backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 sm:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile slide-in drawer — always in DOM for CSS transition */}
      <div
        aria-hidden={!mobileMenuOpen}
        className={`fixed top-0 left-0 bottom-0 w-72 z-50 bg-bg-base border-r border-bg-border flex flex-col sm:hidden transform transition-transform duration-200 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-bg-border shrink-0">
          <Link to="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2">
            <span className="text-xl leading-none" aria-label="Statline">⚾</span>
            <span className="font-semibold text-content-primary tracking-tight">Statline</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-content-muted hover:text-content-primary hover:bg-bg-elevated transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Drawer nav links */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {mobileLink('/', 'Today')}

          {drawerSection('News')}
          {mobileLink('/news',         'News'        )}
          {mobileLink('/digest',       'Stat Blast'  )}
          {mobileLink('/transactions', 'Transactions')}
          {mobileLink('/gambling',     'Picks'       )}

          <div className="my-1" />
          {mobileLink('/teams', 'Teams')}

          {drawerSection('Research')}
          {mobileLink('/leaderboards', 'Stats'      )}
          {mobileLink('/projections',  'Projections')}
          {mobileLink('/simulation',   'Simulation' )}
          {mobileLink('/sandbox',      'Sandbox'    )}
          {mobileLink('/ml',           'ML Builder' )}

          {drawerSection('Definitions')}
          {mobileLink('/stats-reference',    'Stats'   )}
          {mobileLink('/gambling-reference', 'Gambling')}
          {mobileLink('/baseball-reference', 'Baseball')}

          <div className="my-1" />
          {mobileLink('/fantasy',   'Fantasy'  )}
          {mobileLink('/prospects', 'Prospects')}
        </div>

        {/* Drawer footer: Settings + Theme toggle */}
        <div className="border-t border-bg-border p-2 space-y-1 shrink-0">
          <Link
            to="/settings"
            onClick={() => setMobileMenuOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              location.pathname === '/settings'
                ? 'bg-bg-elevated text-content-primary'
                : 'text-content-secondary hover:text-content-primary hover:bg-bg-elevated/60'
            }`}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            Settings
          </Link>
          <button
            type="button"
            onClick={() => { onToggleTheme?.(); setMobileMenuOpen(false) }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-bg-elevated/60 transition-colors"
          >
            {theme === 'dark' ? (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
                </svg>
                Light Mode
              </>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3a7 7 0 1 0 9 9 9 9 0 1 1-9-9z" />
                </svg>
                Dark Mode
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─── Main navbar bar ─── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-2 sm:gap-6">

        {/* Hamburger — mobile only */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
          className="sm:hidden shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg text-content-secondary hover:text-content-primary hover:bg-bg-elevated transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="text-xl leading-none" aria-label="Statline">⚾</span>
          <span className="font-semibold text-content-primary tracking-tight">Statline</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden sm:flex items-center gap-1">
          {navLink('/', 'Today')}
          <NewsDropdown location={location} />
          {navLink('/teams', 'Teams')}
          <ResearchDropdown location={location} />
          <DefinitionsDropdown location={location} />
          {navLink('/fantasy', 'Fantasy')}
          {navLink('/prospects', 'Prospects')}
        </div>

        {/* Search — grows to fill remaining space */}
        <div className="relative flex-1 min-w-0">
          <div className="flex items-center gap-2 bg-bg-surface border border-bg-border rounded-md px-3 py-2 focus-within:border-brand transition-colors">
            <svg className="w-4 h-4 text-content-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => query.length >= 2 && setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search players & teams…"
              className="bg-transparent text-sm text-content-primary placeholder-content-muted outline-none w-full min-w-0"
            />
            {isFetching && (
              <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
            )}
            <kbd className="hidden lg:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-bg-elevated border border-bg-border text-[10px] text-content-muted font-mono leading-none shrink-0">
              <span>⌘K</span>
            </kbd>
          </div>

          {/* Search dropdown */}
          {open && searchError && query.length >= 2 && (
            <div ref={dropdownRef} className="absolute top-full mt-2 w-full bg-bg-elevated border border-bg-border rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="px-4 py-3 text-xs text-content-muted italic">Player search temporarily unavailable — check connection.</div>
            </div>
          )}
          {open && !searchError && hasResults && (
            <div ref={dropdownRef} className="absolute top-full mt-2 w-full bg-bg-elevated border border-bg-border rounded-xl shadow-2xl overflow-hidden z-50">
              {teamResults.length > 0 && (
                <>
                  <div className="px-4 pt-2 pb-1">
                    <span className="text-[10px] font-semibold text-content-muted uppercase tracking-widest">Teams</span>
                  </div>
                  {teamResults.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelect(t, 'team')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-bg-border transition-colors text-left"
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                        style={{ backgroundColor: t.color, fontSize: 10 }}
                      >
                        {t.abbreviation}
                      </div>
                      <div className="text-sm font-medium text-content-primary truncate">{t.name}</div>
                    </button>
                  ))}
                </>
              )}
              {playerResults.length > 0 && (
                <>
                  <div className="px-4 pt-2 pb-1">
                    <span className="text-[10px] font-semibold text-content-muted uppercase tracking-widest">Players</span>
                  </div>
                  {playerResults.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelect(p, 'player')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-bg-border transition-colors text-left"
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
                          {p.position}{p.team ? ` · ${p.team}` : p.active ? '' : ' · Inactive'}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right icon group — grouped to stay tight on small screens */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Assistant */}
          <button
            type="button"
            onClick={() => onToggleAssistant?.()}
            aria-label={assistantOpen ? 'Close Statline Assistant' : 'Open Statline Assistant'}
            title={assistantOpen ? 'Close Statline Assistant' : 'Open Statline Assistant'}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border text-sm font-medium transition-colors ${
              assistantOpen
                ? 'border-brand bg-brand text-white'
                : 'border-bg-border bg-bg-surface text-content-secondary hover:text-content-primary hover:bg-bg-elevated'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="hidden sm:inline">Assistant</span>
          </button>

          {/* Settings — desktop only; available in mobile drawer */}
          <Link
            to="/settings"
            aria-label="Settings"
            title="Settings"
            className={`hidden sm:inline-flex shrink-0 items-center justify-center w-9 h-9 rounded-lg border border-bg-border bg-bg-surface text-content-secondary hover:text-content-primary hover:bg-bg-elevated transition-colors ${
              location.pathname === '/settings' ? 'border-brand text-brand' : ''
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </Link>

          {/* Theme toggle — desktop only; available in mobile drawer */}
          <button
            type="button"
            onClick={() => onToggleTheme?.()}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="hidden sm:inline-flex shrink-0 items-center justify-center w-9 h-9 rounded-lg border border-bg-border bg-bg-surface text-content-secondary hover:text-content-primary hover:bg-bg-elevated transition-colors"
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3a7 7 0 1 0 9 9 9 9 0 1 1-9-9z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </nav>
  )
}
