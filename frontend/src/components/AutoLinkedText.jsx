import { useMemo, Fragment } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api'
import PlayerHoverCard from './PlayerHoverCard'

// Matches 2+ capitalized words that look like player names (e.g. "Mike Trout", "J.D. Martinez")
const NAME_RE = /\b([A-Z][a-zA-Z.'-]*(?:\s+[A-Z][a-zA-Z.'-]+)+)\b/g
// Matches numbers / decimals / percentages for bolding
const NUM_RE = /(\b\d+\.?\d*%?|\.\d+\b)/

export function extractCandidates(text) {
  if (!text) return []
  return [...new Set(text.match(NAME_RE) || [])].slice(0, 8)
}

function renderWithNumbers(text, keyPrefix) {
  const parts = text.split(/(\b\d+\.?\d*%?|\.\d+\b)/g)
  return parts.map((part, i) =>
    NUM_RE.test(part)
      ? <strong key={`${keyPrefix}-n${i}`} className="font-semibold">{part}</strong>
      : part
  )
}

export default function AutoLinkedText({ text, className }) {
  const candidates = useMemo(() => extractCandidates(text), [text])

  const results = useQueries({
    queries: candidates.map(name => ({
      queryKey: ['player-search', name],
      queryFn: () => api.players.search(name),
      staleTime: 30 * 60_000,
    }))
  })

  const nameToId = useMemo(() => {
    const map = {}
    results.forEach((r, i) => {
      const player = r.data?.[0]
      if (player?.active && player.name === candidates[i]) {
        map[candidates[i]] = player.id
      }
    })
    return map
  }, [results, candidates])

  const parts = useMemo(() => {
    if (!text) return []
    const linked = Object.keys(nameToId)
    if (!linked.length) return [text]
    const sorted = linked.sort((a, b) => b.length - a.length)
    const escaped = sorted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return text.split(new RegExp(`(${escaped.join('|')})`, 'g'))
  }, [text, nameToId])

  return (
    <span className={className}>
      {parts.map((part, i) => {
        const id = nameToId[part]
        if (id) {
          return (
            <PlayerHoverCard key={i} playerId={id}>
              <Link to={`/player/${id}`} className="text-brand-light hover:text-content-primary transition-colors">
                {part}
              </Link>
            </PlayerHoverCard>
          )
        }
        return <Fragment key={i}>{renderWithNumbers(part, `p${i}`)}</Fragment>
      })}
    </span>
  )
}
