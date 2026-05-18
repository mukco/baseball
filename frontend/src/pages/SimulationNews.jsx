import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

export const newsSeenKey = (leagueId) => `sim-news-seen-${leagueId}`

// ── Team abbreviation → MLB team_id ──────────────────────────────────────────
const TEAM_ID_MAP = {
  ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112,
  CIN: 113, CLE: 114, COL: 115, CWS: 145, DET: 116,
  HOU: 117, KC:  118, LAA: 108, LAD: 119, MIA: 146,
  MIL: 158, MIN: 142, NYM: 121, NYY: 147, OAK: 133,
  PHI: 143, PIT: 134, SD:  135, SEA: 136, SF:  137,
  STL: 138, TB:  139, TEX: 140, TOR: 141, WSH: 120,
}
const ABBR_PATTERN = new RegExp(`\\b(${Object.keys(TEAM_ID_MAP).join('|')})\\b`, 'g')

// ── Notable config ────────────────────────────────────────────────────────────
const NOTABLE_CFG = {
  opening_day:      { cls: 'bg-amber-500/20 text-amber-400 border-amber-500/40',    ring: 'ring-amber-500/40'  },
  all_star:         { cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40',       ring: 'ring-blue-500/40'   },
  trade_deadline:   { cls: 'bg-red-500/20 text-red-400 border-red-500/40',          ring: 'ring-red-500/40'    },
  roster_expansion: { cls: 'bg-green-500/20 text-green-400 border-green-500/40',    ring: 'ring-green-500/40'  },
  rule5_draft:      { cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40', ring: 'ring-purple-500/40' },
  winter_meetings:  { cls: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40', ring: 'ring-indigo-500/40' },
}

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']
const DOW_SHORT   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

// ── Calendar helpers ──────────────────────────────────────────────────────────
function toIso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function getSeasonMonths(startIso, endIso) {
  if (!startIso || !endIso) return []
  const [sy, sm] = startIso.split('-').map(Number)
  const [ey, em] = endIso.split('-').map(Number)
  const out = []
  let y = sy, m = sm - 1
  while (y < ey || (y === ey && m <= em - 1)) {
    out.push({ year: y, month: m })
    if (++m > 11) { m = 0; y++ }
  }
  return out
}

function buildMonthCells(year, month, simDates, stories, notableMap) {
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMo = new Date(year, month + 1, 0).getDate()
  const cells    = Array(startDow).fill(null)
  for (let d = 1; d <= daysInMo; d++) {
    const iso = toIso(year, month, d)
    cells.push({
      iso,
      day: d,
      simulated:  iso in simDates,
      gamesCount: simDates[iso] || 0,
      story:      stories[iso] || null,
      notable:    notableMap[iso] || null,
    })
  }
  while (cells.length % 7) cells.push(null)
  return cells
}

// ── StoryText ─────────────────────────────────────────────────────────────────
function StoryText({ text, leagueId }) {
  if (!text) return null
  ABBR_PATTERN.lastIndex = 0
  const parts = []
  let last = 0, m
  while ((m = ABBR_PATTERN.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: 'text', v: text.slice(last, m.index) })
    parts.push({ t: 'team', abbr: m[1], id: TEAM_ID_MAP[m[1]] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) })
  return (
    <>
      {parts.map((p, i) =>
        p.t === 'team'
          ? <Link key={i} to={`/simulation/${leagueId}/team/${p.id}`} className="font-bold text-brand hover:underline">{p.abbr}</Link>
          : <span key={i}>{p.v}</span>
      )}
    </>
  )
}

// ── DayCell ───────────────────────────────────────────────────────────────────
function DayCell({ cell, selected, onSelect }) {
  if (!cell) {
    return <div className="h-[120px] rounded bg-bg-surface/10 border border-bg-border/10" />
  }

  const { iso, day, simulated, story, notable, gamesCount } = cell
  const ncfg     = notable ? NOTABLE_CFG[notable.type] : null
  const clickable = simulated || notable
  const hasStory  = !!story?.headline
  const isLoading = simulated && !story

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onSelect(iso) : undefined}
      onKeyDown={clickable ? e => e.key === 'Enter' && onSelect(iso) : undefined}
      className={[
        'h-[120px] rounded border flex flex-col overflow-hidden transition-all',
        clickable ? 'cursor-pointer' : 'cursor-default',
        selected
          ? 'border-brand shadow-[0_0_0_2px_theme(colors.brand/30)] bg-brand/5'
          : simulated
            ? `border-bg-border bg-bg-elevated hover:border-brand/40 ${ncfg ? `ring-1 ring-inset ${ncfg.ring}` : ''}`
            : notable
              ? `border-bg-border/40 bg-bg-surface/50 ${ncfg ? `ring-1 ring-inset ${ncfg.ring}` : ''}`
              : 'border-bg-border/10 bg-bg-surface/20 opacity-20',
      ].join(' ')}
    >
      {/* Date header */}
      <div className={`flex items-baseline justify-between px-2 pt-1.5 pb-1 border-b ${selected ? 'border-brand/30' : 'border-bg-border/30'}`}>
        <span className={`text-sm font-black tabular-nums leading-none ${selected ? 'text-brand' : simulated ? 'text-content-primary' : 'text-content-muted'}`}>
          {day}
        </span>
        {gamesCount > 0 && !isLoading && (
          <span className="text-[9px] font-mono text-content-muted">{gamesCount}G</span>
        )}
        {story?.ai_generated && (
          <span className="text-[7px] font-bold uppercase tracking-wide text-brand bg-brand/10 border border-brand/20 px-1 py-px rounded-full leading-none">AI</span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col gap-1 p-2 overflow-hidden">
        {notable && ncfg && (
          <span className={`self-start px-1.5 py-px rounded border text-[8px] font-bold uppercase tracking-wide leading-tight ${ncfg.cls}`}>
            {notable.label}
          </span>
        )}

        {isLoading && (
          <div className="flex flex-col gap-1.5">
            <div className="h-2 bg-bg-border/40 rounded animate-pulse w-full" />
            <div className="h-2 bg-bg-border/30 rounded animate-pulse w-3/4" />
          </div>
        )}

        {hasStory && (
          <p className="text-[10px] font-bold leading-snug text-content-primary line-clamp-3">
            {story.headline}
          </p>
        )}

        {simulated && !hasStory && !isLoading && (
          <p className="text-[9px] text-content-muted italic">Quiet day</p>
        )}
      </div>
    </div>
  )
}

// ── MonthSection ──────────────────────────────────────────────────────────────
function MonthSection({ year, month, cells, selectedDate, onSelect }) {
  const hasAny = cells.some(c => c?.simulated || c?.notable)
  if (!hasAny) return null

  return (
    <section>
      <h3 className="text-xs font-black uppercase tracking-widest text-content-primary mb-2 flex items-center gap-2 border-b border-bg-border pb-1.5">
        {MONTH_NAMES[month]}
        <span className="text-content-muted font-normal">{year}</span>
      </h3>
      <div className="grid grid-cols-7 gap-px mb-1">
        {DOW_SHORT.map(d => (
          <div key={d} className="text-center text-[8px] font-bold uppercase tracking-widest text-content-muted py-0.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => (
          <DayCell
            key={cell?.iso ?? `pad-${i}`}
            cell={cell}
            selected={cell?.iso === selectedDate}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  )
}

// ── GameLink ──────────────────────────────────────────────────────────────────
function GameLink({ game, leagueId }) {
  const homeWon = game.home_score > game.away_score
  return (
    <Link
      to={`/simulation/${leagueId}/game/${game.id}`}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-bg-border bg-bg-surface hover:border-brand/40 hover:bg-bg-elevated transition-colors group text-[11px] font-mono"
    >
      <span className={`font-bold tabular-nums w-6 text-right ${!homeWon ? 'text-content-primary' : 'text-content-muted'}`}>{game.away}</span>
      <span className={`font-black tabular-nums ${!homeWon ? 'text-content-primary' : 'text-content-muted'}`}>{game.away_score ?? '—'}</span>
      <span className="text-content-muted mx-0.5">·</span>
      <span className={`font-black tabular-nums ${homeWon ? 'text-content-primary' : 'text-content-muted'}`}>{game.home_score ?? '—'}</span>
      <span className={`font-bold tabular-nums w-6 ${homeWon ? 'text-content-primary' : 'text-content-muted'}`}>{game.home}</span>
      <svg className="w-3 h-3 text-content-muted group-hover:text-brand ml-auto shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

// ── StoryPanel ────────────────────────────────────────────────────────────────
function StoryPanel({ date, story, notable, leagueId, games }) {
  const ncfg = notable ? NOTABLE_CFG[notable.type] : null
  const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  if (!date) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-center min-h-[200px]">
        <div className="w-10 h-10 rounded-full bg-bg-elevated flex items-center justify-center text-lg">📅</div>
        <p className="text-sm text-content-muted">Select a day to read the story</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Dateline */}
      <div className="border-b border-bg-border pb-3 space-y-1.5">
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-content-muted">{fmtDate(date)}</p>
        {notable && ncfg && (
          <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${ncfg.cls}`}>
            {notable.label}
          </span>
        )}
        {story?.ai_generated && (
          <span className="text-[8px] font-bold uppercase tracking-wider text-brand bg-brand/10 border border-brand/20 px-1.5 py-0.5 rounded-full inline-block">AI</span>
        )}
      </div>

      {/* Headline */}
      {story?.headline ? (
        <h2 className="text-lg font-black text-content-primary leading-snug">
          <StoryText text={story.headline} leagueId={leagueId} />
        </h2>
      ) : story && !story.ai_generated ? (
        <p className="text-sm text-content-muted italic">
          Quiet day — {story.games_count} game{story.games_count !== 1 ? 's' : ''}, no major stories.
        </p>
      ) : notable && !story ? (
        <p className="text-sm text-content-muted italic">{notable.label} — no games scheduled.</p>
      ) : (
        <div className="flex items-center gap-2 text-content-muted">
          <div className="w-3.5 h-3.5 border border-brand border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Generating story…</span>
        </div>
      )}

      {/* Games */}
      {games.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-content-muted">
            Results · {games.length}G
          </p>
          <div className="space-y-1">
            {games.map(g => <GameLink key={g.id} game={g} leagueId={leagueId} />)}
          </div>
        </div>
      )}

      {/* Story beats */}
      {(story?.stories || []).length > 0 && (
        <ul className="divide-y divide-bg-border/40">
          {story.stories.map((item, i) => (
            <StoryItem key={i} item={item} playerRefs={story.player_refs || []} leagueId={leagueId} />
          ))}
        </ul>
      )}
    </div>
  )
}

function StoryItem({ item, playerRefs, leagueId }) {
  const [open, setOpen] = useState(false)

  return (
    <li className="py-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-xs font-semibold text-content-primary leading-snug">
          <StoryText text={item.headline} leagueId={leagueId} />
        </p>
        {item.body && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="shrink-0 mt-0.5 text-content-muted hover:text-brand transition-colors"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {open && item.body && (
        <p className="text-xs text-content-secondary leading-relaxed">
          <StoryText text={item.body} leagueId={leagueId} />
        </p>
      )}

      {open && playerRefs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {playerRefs.map(p => (
            <Link
              key={p.id}
              to={`/simulation/${leagueId}/player/${p.id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-bg-border bg-bg-elevated text-[10px] font-medium text-content-secondary hover:text-brand hover:border-brand/40 transition-colors"
            >
              <span className="text-[8px] font-bold text-brand/70">{p.team}</span>
              {p.name}
            </Link>
          ))}
        </div>
      )}
    </li>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend({ notableList }) {
  const seenTypes = new Set(notableList.map(n => n.type))
  return (
    <div className="flex items-center gap-3 flex-wrap text-[10px] text-content-muted">
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-brand shrink-0" />
        Story generated
      </span>
      {Object.entries(NOTABLE_CFG).map(([type, cfg]) =>
        seenTypes.has(type) ? (
          <span key={type} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide ${cfg.cls}`}>
            {notableList.find(n => n.type === type)?.label}
          </span>
        ) : null
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SimulationNews() {
  const { id } = useParams()
  const [selectedDate, setSelectedDate] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sim-news-calendar', id],
    queryFn:  () => api.simulations.newsCalendar(id),
    staleTime: 2 * 60_000,
  })

  const seasonStart    = data?.season_start
  const seasonEnd      = data?.season_end
  const currentSimDate = data?.current_sim_date
  const simDates       = useMemo(() => data?.sim_dates     || {}, [data])
  const stories        = useMemo(() => data?.stories       || {}, [data])
  const gamesByDate    = useMemo(() => data?.games_by_date || {}, [data])
  const notableList    = useMemo(() => data?.notable       || [], [data])

  const notableMap = useMemo(
    () => Object.fromEntries(notableList.map(n => [n.date, n])),
    [notableList]
  )

  const months = useMemo(() => getSeasonMonths(seasonStart, seasonEnd), [seasonStart, seasonEnd])

  const monthData = useMemo(
    () => months.map(({ year, month }) => ({
      year, month,
      cells: buildMonthCells(year, month, simDates, stories, notableMap),
    })),
    [months, simDates, stories, notableMap]
  )

  const selectedStory   = selectedDate ? (stories[selectedDate]     || null) : null
  const selectedNotable = selectedDate ? (notableMap[selectedDate]   || null) : null
  const selectedGames   = selectedDate ? (gamesByDate[selectedDate]  || [])  : []

  const currentDateLabel = currentSimDate
    ? new Date(currentSimDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link to={`/simulation/${id}`} className="text-xs text-content-muted hover:text-brand transition-colors">
          ← League
        </Link>
        <h1 className="text-xl font-bold text-content-primary">Season Calendar</h1>
        {currentDateLabel && (
          <span className="text-xs font-mono text-content-muted bg-bg-elevated px-2 py-0.5 rounded border border-bg-border">
            through {currentDateLabel}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-content-muted">
          <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading calendar…</span>
        </div>
      ) : !seasonStart ? (
        <div className="card p-12 text-center space-y-2">
          <p className="text-sm font-semibold text-content-primary">No season data yet</p>
          <p className="text-xs text-content-muted">Simulate some games to see stories here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
          {/* Left: scrollable calendar */}
          <div className="space-y-8">
            <Legend notableList={notableList} />
            {monthData.map(({ year, month, cells }) => (
              <MonthSection
                key={`${year}-${month}`}
                year={year}
                month={month}
                cells={cells}
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
              />
            ))}
          </div>

          {/* Right: sticky story panel */}
          <div className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:overscroll-contain">
            <div className="card p-5">
              <StoryPanel
                date={selectedDate}
                story={selectedStory}
                notable={selectedNotable}
                games={selectedGames}
                leagueId={id}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
