import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { Link } from 'react-router-dom'
import { api } from '../api'

const TOPICS = [
  { id: 'all',       label: 'All Sources'  },
  { id: 'mlb',       label: 'MLB.com'      },
  { id: 'fangraphs', label: 'FanGraphs'    },
  { id: 'mlbtr',     label: 'Trade Rumors' },
  { id: 'reddit',    label: 'r/baseball'   },
  { id: 'rotowire',  label: 'Rotowire'     },
]

const SOURCE_META = {
  mlb:       { dot: 'bg-blue-500',    text: 'text-blue-500',    label: 'MLB.com'           },
  fangraphs: { dot: 'bg-green-600',   text: 'text-green-600',   label: 'FanGraphs'         },
  mlbtr:     { dot: 'bg-orange-500',  text: 'text-orange-500',  label: 'MLB Trade Rumors'  },
  reddit:    { dot: 'bg-rose-500',    text: 'text-rose-500',    label: 'r/baseball'        },
  rotowire:  { dot: 'bg-purple-500',  text: 'text-purple-500',  label: 'Rotowire'          },
}

function relativeTime(ts) {
  if (!ts) return ''
  try {
    return formatDistanceToNow(parseISO(ts), { addSuffix: true })
  } catch {
    return ts
  }
}

function SourceTag({ sourceKey, source }) {
  const meta = SOURCE_META[sourceKey] || { dot: 'bg-content-muted', text: 'text-content-muted', label: source }
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
      <span className={`text-[11px] font-semibold uppercase tracking-widest ${meta.text}`}>{meta.label}</span>
    </span>
  )
}

function PlayerChips({ mentions = [] }) {
  if (!mentions.length) return null
  return (
    <>
      {mentions.slice(0, 4).map((m) => (
        <Link
          key={m.id}
          to={`/player/${m.id}`}
          className="relative z-10 inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-bg-elevated border border-bg-border text-xs text-content-secondary hover:text-content-primary hover:border-brand transition-colors"
        >
          <img
            src={m.headshotUrl}
            alt={m.name}
            className="w-4 h-4 rounded-full object-cover bg-bg-border shrink-0"
            onError={(e) => { e.target.style.display = 'none' }}
          />
          {m.name}
        </Link>
      ))}
    </>
  )
}

function TeamChips({ teams = [] }) {
  if (!teams.length) return null
  return (
    <>
      {teams.slice(0, 3).map((t) =>
        t.id ? (
          <Link
            key={t.id}
            to={`/team/${t.id}`}
            className="relative z-10 inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-bg-elevated border border-bg-border text-xs text-content-secondary hover:text-content-primary hover:border-brand transition-colors"
          >
            {t.logoUrl && (
              <img
                src={t.logoUrl}
                alt={t.abbreviation}
                className="w-3.5 h-3.5 object-contain shrink-0"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
            {t.abbreviation || t.name}
          </Link>
        ) : (
          <span
            key={`${t.abbreviation || t.name}-plain`}
            className="relative z-10 inline-flex items-center h-6 px-2 rounded-full bg-bg-elevated border border-bg-border text-xs text-content-secondary"
          >
            {t.abbreviation || t.name}
          </span>
        )
      )}
    </>
  )
}

function InjuryBadge({ injury }) {
  if (!injury) return null
  const label = [injury.part, injury.list].filter(Boolean).join(' · ')
  if (!label) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-red-400 bg-red-400/10 border border-red-400/20 px-1.5 py-0.5 rounded">
      <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 shrink-0" aria-hidden="true">
        <path d="M6 1a5 5 0 100 10A5 5 0 006 1zm.5 7.5h-1v-1h1v1zm0-2.5h-1V3.5h1V6z"/>
      </svg>
      {label}
    </span>
  )
}

// Compact list row — used in "All Sources" view
function NewsListItem({ item }) {
  const hasMentions = (item.mentions?.length || 0) + (item.teamMentions?.length || 0) > 0

  return (
    <article className="relative flex gap-3 items-start py-3.5 border-b border-bg-border/50 last:border-0 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <SourceTag sourceKey={item.sourceKey} source={item.source} />
          <span className="text-[11px] text-content-muted">{relativeTime(item.publishedAt)}</span>
          <InjuryBadge injury={item.injury} />
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="after:absolute after:inset-0 after:content-['']"
        >
          <h3 className="text-sm font-medium text-content-primary leading-snug line-clamp-2 group-hover:text-brand transition-colors">
            {item.title}
          </h3>
        </a>
        {item.summary && (
          <p className="text-xs text-content-muted leading-relaxed mt-0.5 line-clamp-1">{item.summary}</p>
        )}
        {hasMentions && (
          <div className="relative z-10 mt-1.5 flex flex-wrap gap-1">
            <TeamChips teams={item.teamMentions} />
            <PlayerChips mentions={item.mentions} />
          </div>
        )}
      </div>
      {item.imageUrl && (
        <div className="w-24 h-16 shrink-0 rounded overflow-hidden bg-bg-elevated">
          <img
            src={item.imageUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }}
          />
        </div>
      )}
    </article>
  )
}

// Grid card — used in per-source views
function NewsCard({ item }) {
  const hasMentions = (item.mentions?.length || 0) + (item.teamMentions?.length || 0) > 0

  return (
    <article className="relative card overflow-hidden flex flex-col group hover:border-brand transition-colors h-full">
      {item.imageUrl && (
        <div className="w-full h-44 overflow-hidden bg-bg-elevated shrink-0">
          <img
            src={item.imageUrl}
            alt=""
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
            onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }}
          />
        </div>
      )}
      <div className="flex flex-col flex-1 p-4">
        <div className="flex items-center gap-2 mb-2 text-xs text-content-muted flex-wrap">
          <SourceTag sourceKey={item.sourceKey} source={item.source} />
          <span className="text-bg-border select-none">·</span>
          <span>{relativeTime(item.publishedAt)}</span>
          <InjuryBadge injury={item.injury} />
        </div>

        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="after:absolute after:inset-0 after:content-['']"
        >
          <h3 className="news-roundup-headline line-clamp-3 group-hover:text-brand transition-colors">
            {item.title}
          </h3>
        </a>

        {item.summary && (
          <p className="text-xs text-content-secondary leading-relaxed mt-2 line-clamp-2">{item.summary}</p>
        )}

        <div className="mt-auto">
          {hasMentions && (
            <div className="relative z-10 mt-3 pt-3 border-t border-bg-border flex flex-wrap gap-1.5">
              <TeamChips teams={item.teamMentions} />
              <PlayerChips mentions={item.mentions} />
            </div>
          )}
          {item.author && (
            <p className="text-[11px] text-content-muted mt-2 italic">By {item.author}</p>
          )}
        </div>
      </div>
    </article>
  )
}

export default function News() {
  const [topic, setTopic] = useState('all')
  const [query, setQuery] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['news-feed', topic],
    queryFn: () => api.news.list(topic, topic === 'all' ? 100 : 60),
    staleTime: 5 * 60 * 1000,
  })

  const items = data?.items || []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const hay = `${item.title || ''} ${item.summary || ''} ${item.author || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, query])

  return (
    <div className="space-y-10 py-10">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-content-primary">Baseball News Wire</h1>
          <p className="text-sm text-content-muted mt-1">MLB.com · FanGraphs · MLB Trade Rumors · r/baseball</p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search headlines..."
          className="bg-bg-elevated border border-bg-border text-content-primary text-sm rounded-md px-3 py-2 outline-none focus:border-brand w-full sm:w-72"
        />
      </div>

      {/* Source tabs */}
      <div className="flex items-center border-b border-bg-border w-fit overflow-x-auto">
        {TOPICS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTopic(t.id)}
            className={topic === t.id ? 'tab-active whitespace-nowrap' : 'tab-inactive whitespace-nowrap'}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* States */}
      {isLoading && (
        <div className="card p-8 text-center text-content-muted text-sm">Loading latest stories...</div>
      )}
      {error && (
        <div className="card p-6 text-content-muted text-sm">Failed to load news: {error.message}</div>
      )}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="card p-8 text-center text-content-muted">No stories found.</div>
      )}

      {/* Content */}
      {!isLoading && !error && filtered.length > 0 && (
        topic === 'all' ? (
          <div className="card px-4 divide-y-0">
            {filtered.map((item) => (
              <NewsListItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
        )
      )}
    </div>
  )
}
