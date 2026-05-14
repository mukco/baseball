import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'
import { api } from '../api'
import DynamicChart from './charts/DynamicChart'

const STORAGE_KEY = 'statline-assistant-history'
const WELCOME = { role: 'assistant', text: 'Ask me anything about the page you are viewing.' }

function deriveContext(pathname) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'player' && parts[1]) return { pageType: 'player', playerId: Number(parts[1]) }
  if (parts[0] === 'team' && parts[1]) return { pageType: 'team', teamId: Number(parts[1]) }
  if (parts[0] === 'game' && parts[1]) return { pageType: 'game', gamePk: Number(parts[1]) }
  if (parts[0] === 'leaderboards') return { pageType: 'leaderboards' }
  if (parts[0] === 'news') return { pageType: 'news' }
  if (parts[0] === 'digest') return { pageType: 'digest' }
  if (parts[0] === 'sandbox') return { pageType: 'sandbox' }
  return { pageType: 'schedule' }
}

function loadHistory() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // ignore
  }
  return [WELCOME]
}

export default function AssistantSidebar({ open }) {
  const { pathname } = useLocation()
  const context = useMemo(() => ({ ...deriveContext(pathname), pathname }), [pathname])
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState(loadHistory)
  const bottomRef = useRef(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {
      // ignore storage errors
    }
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const askMutation = useMutation({
    mutationFn: async (q) => {
      const history = messages.filter((m) => m !== WELCOME && m.role !== 'welcome')
      return api.assistant.ask(q, context, history)
    },
    onSuccess: (data, q) => {
      setMessages((prev) => [
        ...prev,
        { role: 'user', text: q },
        { role: 'assistant', text: data.answer, tools: data.tools || [], charts: data.charts || [] },
      ])
    },
    onError: (error, q) => {
      setMessages((prev) => [
        ...prev,
        { role: 'user', text: q },
        { role: 'assistant', text: `Sorry, I hit an error: ${error.message}` },
      ])
    },
  })

  function submit(e) {
    e.preventDefault()
    const q = question.trim()
    if (!q || askMutation.isPending) return
    setQuestion('')
    askMutation.mutate(q)
  }

  function clearHistory() {
    setMessages([WELCOME])
  }

  return (
    <aside
      className={`${open ? 'flex' : 'hidden'} flex-col w-[360px] shrink-0 border-l border-bg-border bg-bg-surface sticky top-16 h-[calc(100vh-4rem)]`}
    >
      <div className="px-3 py-2 border-b border-bg-border bg-bg-elevated flex items-center justify-between shrink-0">
        <div>
          <div className="text-sm font-semibold text-content-primary">Statline Assistant</div>
          <div className="text-[11px] text-content-muted">Context: {context.pageType}</div>
        </div>
        <button
          type="button"
          onClick={clearHistory}
          className="text-[11px] text-content-muted hover:text-content-primary px-2 py-1 rounded hover:bg-bg-border transition-colors"
        >
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((m, idx) => (
          <div key={idx} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={
                m.role === 'user'
                  ? 'inline-block rounded-lg px-3 py-2 text-sm bg-brand text-white max-w-[92%]'
                  : 'inline-block rounded-lg px-3 py-2 text-sm bg-bg-elevated text-content-primary border border-bg-border max-w-[92%]'
              }
            >
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeHighlight]}
                components={{
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
                  a: ({ href, children }) => (
                    <a href={href} className="text-brand underline" target="_blank" rel="noreferrer">{children}</a>
                  ),
                }}
              >
                {m.text}
              </ReactMarkdown>
            </div>
            {m.role === 'assistant' && m.charts?.length > 0 && (
              <div className="mt-2 space-y-3">
                {m.charts.map((chart, i) => (
                  <div key={i} className="rounded-xl border border-bg-border bg-bg-elevated p-3">
                    <DynamicChart
                      type={chart.type}
                      title={chart.title}
                      data={chart.data}
                      xKey={chart.xKey}
                      yKey={chart.yKey}
                      height={180}
                    />
                  </div>
                ))}
              </div>
            )}
            {m.role === 'assistant' && m.tools?.length > 0 && (
              <details className="mt-1 text-left">
                <summary className="text-[11px] text-content-muted cursor-pointer">
                  Tools used ({m.tools.length})
                </summary>
                <div className="mt-1 space-y-1">
                  {m.tools.map((t, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-content-muted rounded border border-bg-border px-2 py-1 bg-bg-base"
                    >
                      <span className="text-content-secondary">{t.tool}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ))}
        {askMutation.isPending && (
          <div className="text-xs text-content-muted">Thinking...</div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={submit}
        className="p-2 border-t border-bg-border bg-bg-elevated flex gap-2 shrink-0"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this page…"
          className="flex-1 bg-bg-base border border-bg-border rounded px-2 py-1.5 text-sm text-content-primary outline-none focus:border-brand"
        />
        <button
          type="submit"
          className="btn-primary text-sm px-3"
          disabled={askMutation.isPending}
        >
          Send
        </button>
      </form>
    </aside>
  )
}
