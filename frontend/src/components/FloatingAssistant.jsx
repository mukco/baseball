import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueries } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'
import { api } from '../api'
import DynamicChart from './charts/DynamicChart'
import PlayerHoverCard from './PlayerHoverCard'
import { extractCandidates } from './AutoLinkedText'
import { useSandbox } from '../contexts/SandboxContext'

const SESSIONS_KEY     = 'statline-assistant-sessions'
const ACTIVE_KEY       = 'statline-assistant-active'
const WIDTH_STORAGE_KEY = 'statline-assistant-width'
const WELCOME = { role: 'assistant', text: 'Ask me anything about the page you are viewing.' }
const DEFAULT_WIDTH = 400
const MIN_WIDTH = 340
const MAX_WIDTH = 640
const MAX_SESSIONS = 30

function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }
function blankSession() { return { id: genId(), title: null, messages: [WELCOME], createdAt: Date.now() } }

function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
    // Migrate old single-history format
    const oldRaw = localStorage.getItem('statline-assistant-history')
    if (oldRaw) {
      const msgs = JSON.parse(oldRaw)
      if (Array.isArray(msgs) && msgs.length > 1) {
        const firstUser = msgs.find(m => m.role === 'user')
        return [{ id: genId(), title: firstUser?.text?.slice(0, 50) ?? null, messages: msgs, createdAt: Date.now() }]
      }
    }
  } catch { /* ignore */ }
  return [blankSession()]
}

function loadActiveId(sessions) {
  try {
    const id = localStorage.getItem(ACTIVE_KEY)
    if (id && sessions.find(s => s.id === id)) return id
  } catch { /* ignore */ }
  return sessions[0]?.id ?? null
}

function fmtSessionDate(ts) {
  const d = new Date(ts)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86_400_000)
  if (diffDays === 0) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7)  return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function deriveContext(pathname) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'player' && parts[1]) return { pageType: 'player', playerId: Number(parts[1]) }
  if (parts[0] === 'team' && parts[1]) return { pageType: 'team', teamId: Number(parts[1]) }
  if (parts[0] === 'game' && parts[1]) return { pageType: 'game', gamePk: Number(parts[1]) }
  if (parts[0] === 'leaderboards') return { pageType: 'stats' }
  if (parts[0] === 'stats-reference') return { pageType: 'definitions' }
  if (parts[0] === 'news') return { pageType: 'news' }
  if (parts[0] === 'digest') return { pageType: 'digest' }
  if (parts[0] === 'sandbox') return { pageType: 'sandbox' }
  return { pageType: 'schedule' }
}

function loadWidth() {
  try {
    const raw = window.localStorage.getItem(WIDTH_STORAGE_KEY)
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed))
  } catch {
    // ignore
  }
  return DEFAULT_WIDTH
}

function AssistantComposer({ onSubmit, isPending, prefill, onPrefillConsumed }) {
  const [question, setQuestion] = useState('')
  const [mentions, setMentions] = useState([])
  const [mentionResults, setMentionResults] = useState([])
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionType, setMentionType] = useState('') // '' = none, 'players', 'teams'
  const [mentionIdx, setMentionIdx] = useState(-1)
  const inputRef = useRef(null)
  const searchTimeout = useRef(null)

  useEffect(() => {
    if (prefill) {
      setQuestion(prefill)
      onPrefillConsumed?.()
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [prefill]) // eslint-disable-line react-hooks/exhaustive-deps

  function detectMention(value, cursorPos) {
    const before = value.slice(0, cursorPos)
    const atIdx = before.lastIndexOf('@')
    if (atIdx === -1) return null
    const after = before.slice(atIdx + 1)
    if (after.includes(' ')) return null
    return { start: atIdx, query: after }
  }

  function handleChange(e) {
    const raw = e.target.value
    setQuestion(raw)

    const cursorPos = e.target.selectionStart
    const mention = detectMention(raw, cursorPos)

    if (mention) {
      setMentionQuery(mention.query)
      setMentionOpen(true)

      if (searchTimeout.current) clearTimeout(searchTimeout.current)
      searchTimeout.current = setTimeout(async () => {
        const q = mention.query.trim()
        if (q.length < 1) {
          setMentionResults([])
          setMentionType('')
          return
        }
        try {
          const [players, teams] = await Promise.all([
            api.players.search(q).catch(() => []),
            api.teams.all().catch(() => []),
          ])
          const teamResults = teams
            .filter((t) =>
              [t.name, t.abbreviation, t.location].some((v) => v?.toLowerCase().includes(q.toLowerCase()))
            )
            .slice(0, 3)
            .map((t) => ({ type: 'team', id: t.id, name: t.name, abbr: t.abbreviation }))

          const playerResults = (players || [])
            .slice(0, 5)
            .map((p) => ({ type: 'player', id: p.id, name: p.name, pos: p.position }))

          setMentionResults([...playerResults, ...teamResults])
          setMentionType(playerResults.length > 0 ? 'players' : teamResults.length > 0 ? 'teams' : '')
          setMentionIdx(-1)
        } catch {
          setMentionResults([])
        }
      }, 200)
    } else {
      setMentionOpen(false)
      setMentionResults([])
      setMentionIdx(-1)
    }
  }

  function selectMention(result) {
    const cursorPos = inputRef.current?.selectionStart ?? question.length
    const before = question.slice(0, cursorPos)
    const atIdx = before.lastIndexOf('@')
    if (atIdx === -1) return

    const after = question.slice(cursorPos)
    const newText = before.slice(0, atIdx) + '@' + result.name + ' ' + after
    setQuestion(newText)
    setMentions((prev) => [...prev.filter((m) => m.name !== result.name), { name: result.name, type: result.type, id: result.id }])
    setMentionOpen(false)
    setMentionResults([])
    setMentionIdx(-1)

    setTimeout(() => {
      if (inputRef.current) {
        const pos = atIdx + result.name.length + 2
        inputRef.current.focus()
        inputRef.current.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  function handleKeyDown(e) {
    if (!mentionOpen || mentionResults.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMentionIdx((prev) => (prev + 1) % mentionResults.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMentionIdx((prev) => (prev <= 0 ? mentionResults.length - 1 : prev - 1))
    } else if (e.key === 'Enter' && mentionIdx >= 0) {
      e.preventDefault()
      selectMention(mentionResults[mentionIdx])
    } else if (e.key === 'Escape') {
      setMentionOpen(false)
      setMentionResults([])
      setMentionIdx(-1)
    }
  }

  function submit(e) {
    e.preventDefault()
    const q = question.trim()
    if (!q || isPending) return
    setQuestion('')
    setMentions([])
    setMentionOpen(false)
    setMentionResults([])
    if (inputRef.current) inputRef.current.style.height = 'auto'
    onSubmit({ text: q, mentions: [...mentions] })
  }

  function handleTextareaChange(e) {
    handleChange(e)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }

  function handleTextareaKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (mentionOpen && mentionIdx >= 0 && mentionResults.length > 0) {
        e.preventDefault()
        selectMention(mentionResults[mentionIdx])
        return
      }
      e.preventDefault()
      submit(e)
      return
    }
    handleKeyDown(e)
  }

  return (
    <form onSubmit={submit} className="relative p-2 border-t border-bg-border bg-bg-elevated flex gap-2 items-end shrink-0">
      {mentionOpen && mentionResults.length > 0 && (
        <div className="absolute bottom-full left-2 right-2 mb-1 bg-bg-elevated border border-bg-border rounded-lg shadow-2xl overflow-hidden z-50">
          {mentionResults.map((result, idx) => (
            <button
              key={`${result.type}-${result.id}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectMention(result) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                idx === mentionIdx ? 'bg-bg-border/60' : 'hover:bg-bg-border/40'
              }`}
            >
              <span className={`font-semibold shrink-0 ${result.type === 'player' ? 'text-brand' : 'text-green-400'}`}>
                {result.type === 'player' ? '@' : '#'}
              </span>
              <span className="text-content-primary font-medium">{result.name}</span>
              {result.type === 'player' && result.pos && (
                <span className="text-content-muted">· {result.pos}</span>
              )}
              {result.type === 'team' && result.abbr && (
                <span className="text-content-muted">· {result.abbr}</span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 relative">
        <textarea
          ref={inputRef}
          value={question}
          onChange={handleTextareaChange}
          onKeyDown={handleTextareaKeyDown}
          placeholder="Ask about this page... Use @Player or @Team"
          rows={1}
          className="w-full bg-bg-base border border-bg-border rounded px-2 py-1.5 text-sm text-content-primary outline-none focus:border-brand resize-none overflow-hidden leading-normal"
          style={{ maxHeight: '160px', overflowY: 'auto' }}
        />
      </div>
      <button
        type="submit"
        className="btn-primary text-sm px-3 shrink-0"
        disabled={isPending}
        style={{ paddingTop: '0.375rem', paddingBottom: '0.375rem' }}
      >
        Send
      </button>
    </form>
  )
}

const MD_COMPONENTS = {
  p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
  code: ({ inline, className, children }) =>
    inline ? (
      <code className="bg-bg-border rounded px-1 text-[12px] font-mono">{children}</code>
    ) : (
      <code className={`block overflow-x-auto rounded p-2 text-[12px] font-mono ${className ?? ''}`}>{children}</code>
    ),
  pre: ({ children }) => <pre className="my-1 overflow-x-auto">{children}</pre>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-1">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) => {
    if (href?.startsWith('/player/')) {
      const id = Number(href.replace('/player/', ''))
      return (
        <PlayerHoverCard playerId={id || null}>
          <Link to={href} className="text-brand-light hover:text-content-primary transition-colors">{children}</Link>
        </PlayerHoverCard>
      )
    }
    return <a href={href} className="text-brand underline" target="_blank" rel="noreferrer">{children}</a>
  },
}

function extractSqlFromMessage(m) {
  const match = m.text?.match(/```sql\s*([\s\S]+?)```/)
  return match ? match[1].trim() : null
}

function AssistantMessage({ m, onLoadSql }) {
  const candidates = useMemo(() => extractCandidates(m.text || ''), [m.text])

  const results = useQueries({
    queries: candidates.map(name => ({
      queryKey: ['player-search', name],
      queryFn: () => api.players.search(name),
      staleTime: 30 * 60_000,
    }))
  })

  const linkedText = useMemo(() => {
    const nameToId = {}
    results.forEach((r, i) => {
      const player = r.data?.[0]
      if (player?.active && player.name === candidates[i]) {
        nameToId[candidates[i]] = player.id
      }
    })
    const linked = Object.keys(nameToId)
    if (!linked.length) return m.text || ''
    let result = m.text
    linked.sort((a, b) => b.length - a.length).forEach(name => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      result = result.replace(new RegExp(escaped, 'g'), `[${name}](/player/${nameToId[name]})`)
    })
    return result
  }, [m.text, results, candidates])

  const extractedSql = useMemo(() => extractSqlFromMessage(m), [m])
  const hasText   = linkedText.trim().length > 0
  const hasCharts = m.charts?.length > 0
  const hasTools  = m.tools?.length > 0

  return (
    <>
      {hasText && (
        <div className="inline-block rounded-lg px-3 py-2 text-sm bg-bg-elevated text-content-primary border border-bg-border max-w-[92%]">
          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex, rehypeHighlight]} components={MD_COMPONENTS}>
            {linkedText}
          </ReactMarkdown>
        </div>
      )}
      {!hasText && !hasCharts && hasTools && (
        <div className="inline-block rounded-lg px-3 py-2 text-sm bg-bg-elevated text-content-muted border border-bg-border/50 max-w-[92%] italic">
          Used {m.tools.length} tool{m.tools.length !== 1 ? 's' : ''}
        </div>
      )}
      {extractedSql && onLoadSql && (
        <div className="mt-1 text-left">
          <button
            type="button"
            onClick={() => onLoadSql(extractedSql)}
            className="text-[11px] text-brand-light hover:text-content-primary transition-colors border border-brand/30 hover:border-brand/60 rounded px-2 py-0.5 bg-brand/5 hover:bg-brand/10"
          >
            Load in Sandbox ↗
          </button>
        </div>
      )}
      {hasCharts && (
        <div className="mt-2 space-y-3">
          {m.charts.map((chart, i) => (
            <div key={i} className="rounded-xl border border-bg-border bg-bg-elevated p-3">
              <DynamicChart type={chart.type} title={chart.title} data={chart.data} xKey={chart.xKey} yKey={chart.yKey} height={180} />
            </div>
          ))}
        </div>
      )}
      {hasTools && (
        <details className="mt-1 text-left" open={!hasText}>
          <summary className="text-[11px] text-content-muted cursor-pointer select-none">Tools used ({m.tools.length})</summary>
          <div className="mt-1 space-y-1">
            {m.tools.map((t, i) => (
              <div key={i} className="text-[11px] text-content-muted rounded border border-bg-border px-2 py-1 bg-bg-base">
                <span className="text-content-secondary">{t.tool}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  )
}

export default function AssistantSidebar({ open }) {
  const { pathname } = useLocation()
  const navigate     = useNavigate()
  const context = useMemo(() => ({ ...deriveContext(pathname), pathname }), [pathname])

  const [sessions, setSessions]             = useState(loadSessions)
  const [activeId, setActiveId]             = useState(() => { const s = loadSessions(); return loadActiveId(s) })
  const [sessionPanelOpen, setSessionPanel] = useState(false)
  const [width, setWidth]                   = useState(loadWidth)
  const [composerPrefill, setComposerPrefill] = useState(null)
  const scrollRef = useRef(null)
  const bottomRef = useRef(null)
  const resizeStateRef = useRef(null)

  const activeSession = sessions.find(s => s.id === activeId) ?? sessions[0]
  const messages = activeSession?.messages ?? [WELCOME]

  function setMessages(updater) {
    setSessions(prev => prev.map(s => {
      if (s.id !== (activeSession?.id)) return s
      const next = typeof updater === 'function' ? updater(s.messages) : updater
      // Auto-title from first user message
      const title = s.title ?? next.find(m => m.role === 'user')?.text?.slice(0, 60) ?? null
      return { ...s, messages: next, title }
    }))
  }

  function createSession() {
    const s = blankSession()
    setSessions(prev => [s, ...prev].slice(0, MAX_SESSIONS))
    setActiveId(s.id)
    setSessionPanel(false)
  }

  function switchSession(id) {
    setActiveId(id)
    setSessionPanel(false)
  }

  function deleteSession(id) {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id)
      if (next.length === 0) {
        const fresh = blankSession()
        setActiveId(fresh.id)
        return [fresh]
      }
      if (id === activeId) setActiveId(next[0].id)
      return next
    })
  }

  const { currentSql, currentError, pendingQuestion, setPendingQuestion, loadSql } = useSandbox()

  // Consume pending question (set by Sandbox "Ask assistant" button)
  useEffect(() => {
    if (pendingQuestion) {
      setComposerPrefill(pendingQuestion)
      setPendingQuestion(null)
    }
  }, [pendingQuestion, setPendingQuestion])

  function handleLoadSql(sql) {
    loadSql(sql)
    if (pathname !== '/sandbox') {
      navigate('/sandbox', { state: { sql } })
    }
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
    } catch { /* ignore */ }
  }, [sessions])

  useEffect(() => {
    try {
      if (activeId) window.localStorage.setItem(ACTIVE_KEY, activeId)
    } catch { /* ignore */ }
  }, [activeId])

  useEffect(() => {
    try {
      window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width))
    } catch {
      // ignore storage errors
    }
  }, [width])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' })
  }, [open])

  useEffect(() => {
    function handlePointerMove(e) {
      const state = resizeStateRef.current
      if (!state) return

      const delta = state.startX - e.clientX
      const viewportMax = Math.floor(window.innerWidth * 0.55)
      const nextWidth = Math.min(Math.min(MAX_WIDTH, viewportMax), Math.max(MIN_WIDTH, state.startWidth + delta))
      setWidth(nextWidth)
    }

    function stopResizing() {
      resizeStateRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResizing)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResizing)
    }
  }, [])

  const askMutation = useMutation({
    mutationFn: async ({ text, mentions }) => {
      const history = messages.filter((m) => m !== WELCOME && m.role !== 'welcome')

      const resolvedPlayers = []
      const resolvedTeams = []
      for (const m of mentions || []) {
        if (m.type === 'player') resolvedPlayers.push({ id: m.id, name: m.name })
        if (m.type === 'team') resolvedTeams.push({ id: m.id, name: m.name })
      }

      const mentionContext = {}
      if (resolvedPlayers.length > 0) mentionContext.mentionedPlayers = resolvedPlayers
      if (resolvedTeams.length > 0) mentionContext.mentionedTeams = resolvedTeams

      const sandboxContext = context.pageType === 'sandbox'
        ? {
            ...(currentSql  ? { currentSql }  : {}),
            ...(currentError ? { currentError } : {}),
          }
        : {}

      return api.assistant.ask(text, { ...context, ...mentionContext, ...sandboxContext }, history)
    },
    onSuccess: (data, { text }) => {
      setMessages((prev) => [
        ...prev,
        { role: 'user', text },
        { role: 'assistant', text: data.answer, tools: data.tools || [], charts: data.charts || [] },
      ])
    },
    onError: (error, { text }) => {
      setMessages((prev) => [
        ...prev,
        { role: 'user', text },
        { role: 'assistant', text: `Sorry, I hit an error: ${error.message}` },
      ])
    },
  })

  function submitQuestion(payload) {
    askMutation.mutate(payload)
  }

  function clearHistory() {
    createSession()
  }

  function startResizing(e) {
    resizeStateRef.current = { startX: e.clientX, startWidth: width }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <aside
      className={`${open ? 'flex' : 'hidden'} relative flex-col shrink-0 border-l border-bg-border bg-bg-surface sticky top-16 h-[calc(100vh-4rem)]`}
      style={{ borderRadius: 'var(--radius-lg)', width }}
    >
      <button
        type="button"
        aria-label="Resize assistant"
        onPointerDown={startResizing}
        className="absolute left-0 top-0 h-full w-2 -translate-x-1/2 cursor-col-resize"
      />
      <div className="border-b border-bg-border bg-bg-elevated shrink-0">
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm text-content-primary font-semibold truncate">
              {activeSession?.title ?? 'Statline Assistant'}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted">
              Context: {context.pageType}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setSessionPanel(v => !v)}
              title="Chat history"
              className="text-[11px] text-content-muted hover:text-content-primary px-2 py-1 rounded hover:bg-bg-border transition-colors"
            >
              History
            </button>
            <button
              type="button"
              onClick={createSession}
              title="New chat"
              className="text-[11px] text-content-muted hover:text-content-primary px-2 py-1 rounded hover:bg-bg-border transition-colors"
            >
              + New
            </button>
          </div>
        </div>

        {sessionPanelOpen && (
          <div className="border-t border-bg-border">
            <div className="max-h-52 overflow-y-auto">
              {sessions.map(s => (
                <div
                  key={s.id}
                  className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                    s.id === activeId ? 'bg-brand/10 text-content-primary' : 'hover:bg-bg-border/40 text-content-secondary'
                  }`}
                  onClick={() => switchSession(s.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{s.title ?? 'New chat'}</p>
                    <p className="text-[10px] text-content-muted">{fmtSessionDate(s.createdAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); deleteSession(s.id) }}
                    className="text-content-muted hover:text-red-400 transition-colors text-xs px-1.5 py-0.5 rounded hover:bg-red-400/10 opacity-0 group-hover:opacity-100"
                    title="Delete chat"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {sessions.length > 1 && (
              <div className="border-t border-bg-border px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete all ${sessions.length} chats?`)) {
                      const fresh = blankSession()
                      setSessions([fresh])
                      setActiveId(fresh.id)
                      setSessionPanel(false)
                    }
                  }}
                  className="text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
                >
                  Delete all chats
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((m, idx) => (
          <div key={idx} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            {m.role === 'user' ? (
              <div className="inline-block rounded-lg px-3 py-2 text-sm bg-brand text-white max-w-[92%]">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex, rehypeHighlight]} components={MD_COMPONENTS}>
                  {m.text}
                </ReactMarkdown>
              </div>
            ) : (
              <AssistantMessage m={m} onLoadSql={handleLoadSql} />
            )}
          </div>
        ))}
        {askMutation.isPending && (
          <div className="text-xs text-content-muted">Thinking...</div>
        )}
        <div ref={bottomRef} />
      </div>

      <AssistantComposer
        onSubmit={submitQuestion}
        isPending={askMutation.isPending}
        prefill={composerPrefill}
        onPrefillConsumed={() => setComposerPrefill(null)}
      />
    </aside>
  )
}
