import { useMemo, useState } from 'react'
import { BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'
import { getAllGamblingHelp, GAMBLING_GROUPS } from '../lib/gamblingHelp'

function oddsToImplied(odds) {
  const n = Number(odds)
  if (!Number.isFinite(n)) return null
  return n < 0 ? (-n / (-n + 100)) : (100 / (n + 100))
}

function americanPayout(odds, bet) {
  const n = Number(odds)
  const b = Number(bet)
  if (!Number.isFinite(n) || !Number.isFinite(b)) return null
  return n < 0 ? (b / -n * 100) : (b * n / 100)
}

function parlayOdds(oddsList) {
  const implieds = oddsList.map((o) => {
    const ip = oddsToImplied(o)
    return ip != null ? 1 / ip : null
  })
  if (implieds.some((v) => v == null)) return null
  const combined = implieds.reduce((a, b) => a * b, 1)
  return combined > 0 ? (combined - 1) * 100 : null
}

const GAMBLING_CALCULATORS = {
  moneyline: {
    inputs: [
      { key: 'favOdds', label: 'Favorite odds (e.g. -150)', default: -150, min: -99999, max: 99999, step: 1 },
      { key: 'dogOdds', label: 'Underdog odds (e.g. +130)', default: 130, min: -99999, max: 99999, step: 1 },
      { key: 'bet', label: 'Bet Amount ($)', default: 100, min: 1, max: 100000, step: 1 },
    ],
    compute: (v) => {
      const fav = Number(v.favOdds)
      const dog = Number(v.dogOdds)
      const bet = Number(v.bet)
      const favIP = Number.isFinite(fav) && fav !== 0 ? oddsToImplied(fav) : null
      const dogIP = Number.isFinite(dog) && dog !== 0 ? oddsToImplied(dog) : null
      const favWin = Number.isFinite(fav) && fav !== 0 ? americanPayout(fav, bet) : null
      const dogWin = Number.isFinite(dog) && dog !== 0 ? americanPayout(dog, bet) : null
      return { fav, dog, bet, favIP, dogIP, favWin, dogWin }
    },
    format: (v) => '',
    resultLabel: '',
    formatResult: (v) => {
      if (v.favIP == null || v.dogIP == null) return { lines: ['Enter valid odds for both sides'], cols: {} }
      return {
        lines: [
          `Favorite (${v.fav}): ${(v.favIP * 100).toFixed(1)}% implied · Win $${v.favWin?.toFixed(2)} on $${v.bet}`,
          `Underdog (${v.dog >= 0 ? '+' : ''}${v.dog}): ${(v.dogIP * 100).toFixed(1)}% implied · Win $${v.dogWin?.toFixed(2)} on $${v.bet}`,
        ],
        cols: {
          'Vig': v.favIP != null && v.dogIP != null ? `${((v.favIP + v.dogIP - 1) * 100).toFixed(2)}%` : '—',
        }
      }
    },
  },
  americanOdds: {
    inputs: [
      { key: 'odds', label: 'American Odds (e.g. -150)', default: -150, min: -9999, max: 9999, step: 1 },
      { key: 'bet', label: 'Bet Amount ($)', default: 100, min: 1, max: 100000, step: 1 },
    ],
    compute: (v) => {
      const implied = oddsToImplied(v.odds)
      const payout = americanPayout(v.odds, v.bet)
      return { odds: v.odds, bet: v.bet, implied, payout, win: payout != null ? v.bet + payout : null }
    },
    format: (v) => '',
    resultLabel: '',
    formatResult: (v) => {
      if (v.implied == null) return { lines: ['Enter valid odds'], cols: {} }
      const prefix = v.odds < 0 ? '' : '+'
      return {
        lines: [
          `Risk $${v.bet} to win $${v.payout?.toFixed(2)} (total return: $${v.win?.toFixed(2)})`,
        ],
        cols: {
          Odds: `${prefix}${v.odds}`,
          'Implied %': `${(v.implied * 100).toFixed(1)}%`,
          Payout: `$${v.payout?.toFixed(2)}`,
        }
      }
    },
  },
  impliedProbability: {
    inputs: [
      { key: 'odds', label: 'American Odds (e.g. +200)', default: 200, min: -9999, max: 9999, step: 1 },
    ],
    compute: (v) => {
      const ip = oddsToImplied(v.odds)
      const payout = americanPayout(v.odds, 100)
      return { odds: v.odds, implied: ip, payout }
    },
    format: (v) => '',
    resultLabel: '',
    formatResult: (v) => {
      if (v.implied == null) return { lines: ['Enter valid odds'], cols: {} }
      const prefix = v.odds < 0 ? '' : '+'
      return {
        lines: [],
        cols: {
          Odds: `${prefix}${v.odds}`,
          'Win Prob': `${(v.implied * 100).toFixed(1)}%`,
          'Per $100': `Win $${v.payout?.toFixed(2)}`,
        }
      }
    },
  },
  vig: {
    inputs: [
      { key: 'odds1', label: 'Odds (fav, e.g. -150)', default: -150, min: -9999, max: 9999, step: 1 },
      { key: 'odds2', label: 'Odds (dog, e.g. +130)', default: 130, min: -9999, max: 9999, step: 1 },
    ],
    compute: (v) => {
      const ip1 = oddsToImplied(v.odds1)
      const ip2 = oddsToImplied(v.odds2)
      if (ip1 == null || ip2 == null) return null
      const total = ip1 + ip2
      return { odds1: v.odds1, odds2: v.odds2, ip1, ip2, total, vig: total - 1 }
    },
    format: (v) => '',
    resultLabel: '',
    formatResult: (v) => {
      if (!v) return { lines: ['Enter valid odds for both sides'], cols: {} }
      const p1 = v.odds1 < 0 ? '' : '+'
      const p2 = v.odds2 < 0 ? '' : '+'
      return {
        lines: [
          `${p1}${v.odds1} → ${(v.ip1 * 100).toFixed(1)}% win probability`,
          `${p2}${v.odds2} → ${(v.ip2 * 100).toFixed(1)}% win probability`,
        ],
        cols: {
          'Total Market': `${(v.total * 100).toFixed(1)}%`,
          'Vig (Juice)': `${(v.vig * 100).toFixed(2)}%`,
        }
      }
    },
  },
  parlay: {
    inputs: [
      { key: 'leg1', label: 'Leg 1 odds', default: -110, min: -9999, max: 9999, step: 1 },
      { key: 'leg2', label: 'Leg 2 odds', default: -110, min: -9999, max: 9999, step: 1 },
      { key: 'leg3', label: 'Leg 3 odds', default: -110, min: -9999, max: 9999, step: 1 },
    ],
    compute: (v) => {
      const legs = [v.leg1, v.leg2, v.leg3].filter((o) => Number.isFinite(Number(o)))
      const combined = parlayOdds(legs)
      const implied = combined != null ? 1 / (combined / 100 + 1) : null
      return { legs: legs.length, combined, implied, payout: combined != null ? `+${Math.round(combined)}` : '—' }
    },
    format: (v) => '',
    resultLabel: '',
    formatResult: (v) => {
      if (v.combined == null) return { lines: ['Enter valid odds for all legs'], cols: {} }
      return {
        lines: [],
        cols: {
          Legs: String(v.legs),
          'Parlay Odds': v.payout,
          'Implied %': `${(v.implied * 100).toFixed(1)}%`,
        }
      }
    },
  },
}

function StatCalculator({ statKey }) {
  const config = GAMBLING_CALCULATORS[statKey]
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState(() => {
    if (!config) return {}
    const initial = {}
    config.inputs.forEach((input) => { initial[input.key] = input.default })
    return initial
  })

  if (!config) return null

  function update(key, raw) {
    const parsed = parseFloat(raw)
    if (Number.isFinite(parsed)) {
      setValues((prev) => ({ ...prev, [key]: parsed }))
    }
  }

  const result = config.compute(values)

  const formattedResult = config.formatResult ? config.formatResult(result) : null

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-brand-light hover:underline mt-2"
      >
        {open ? 'Close calculator' : 'Play with the formula'}
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-bg-elevated border border-bg-border p-3 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {config.inputs.map((input) => (
              <div key={input.key}>
                <label className="text-[10px] text-content-muted block mb-0.5">{input.label}</label>
                <input
                  type="number"
                  value={values[input.key] ?? ''}
                  onChange={(e) => update(input.key, e.target.value)}
                  min={input.min}
                  max={input.max}
                  step={input.step}
                  className="w-full bg-bg-base border border-bg-border rounded px-2 py-1 text-sm text-content-primary font-mono outline-none focus:border-brand"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-content-muted uppercase tracking-wider font-semibold">{config.resultLabel}</span>
            {formattedResult ? (
              <div className="space-y-0.5">
                {formattedResult.lines?.map((line, i) => (
                  <div key={i} className="text-xs font-mono text-content-primary">{line}</div>
                ))}
                {formattedResult.cols && Object.keys(formattedResult.cols).length > 0 && (
                  <div className="flex gap-3 mt-1">
                    {Object.entries(formattedResult.cols).map(([label, value]) => (
                      <div key={label} className="text-xs">
                        <span className="text-content-muted">{label}: </span>
                        <span className="font-semibold font-mono text-content-primary">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-lg font-bold font-mono text-content-primary">{result ? config.format(result) : '—'}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ stat }) {
  return (
    <article className="card p-5 space-y-3 h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-content-primary">{stat.label}</h3>
          <p className="mt-1 text-sm text-content-secondary">{stat.definition}</p>
        </div>
      </div>

      {stat.formulaLatex ? (
        <div className="rounded-lg bg-bg-elevated px-3 py-2 overflow-x-auto">
          <BlockMath math={stat.formulaLatex} />
        </div>
      ) : stat.formula ? (
        <div className="rounded-lg bg-bg-elevated px-3 py-2 text-sm text-content-muted">
          {stat.formula}
        </div>
      ) : null}

      {stat.intuition && (
        <div className="rounded-lg bg-brand/5 border border-brand/10 px-3 py-2 text-sm text-content-secondary leading-relaxed">
          <span className="font-semibold text-brand text-[10px] uppercase tracking-wider mr-1">Intuition:</span>
          {stat.intuition}
        </div>
      )}

      {stat.example && (
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 px-3 py-2 text-sm text-content-secondary leading-relaxed">
          <span className="font-semibold text-amber-400 text-[10px] uppercase tracking-wider mr-1">Example:</span>
          {stat.example}
        </div>
      )}

      <StatCalculator statKey={stat.key} />
    </article>
  )
}

export default function GamblingReference() {
  const [query, setQuery] = useState('')
  const allStats = useMemo(() => getAllGamblingHelp(), [])
  const normalizedQuery = query.trim().toLowerCase()

  const sections = useMemo(() => {
    return GAMBLING_GROUPS.map((group) => {
      const stats = group.keys
        .map((key) => allStats.find((stat) => stat.key === key))
        .filter(Boolean)
        .filter((stat) => {
          if (!normalizedQuery) return true
          const haystack = [stat.label, stat.definition, stat.example, stat.formula, stat.intuition]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return haystack.includes(normalizedQuery)
        })
      return { ...group, stats }
    }).filter((group) => group.stats.length > 0)
  }, [allStats, normalizedQuery])

  const totalVisible = sections.reduce((sum, section) => sum + section.stats.length, 0)

  return (
    <div className="space-y-10 py-10">
      <section className="card-raised p-6 sm:p-8">
        <div className="max-w-3xl space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-content-muted">Gambling</p>
            <h1 className="mt-2 text-[32px] sm:text-4xl font-semibold tracking-[-0.02em] text-content-primary">Betting Definitions</h1>
          </div>
          <p className="text-content-secondary leading-7">
            A glossary of common baseball betting terms, bet types, and how odds work.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="text-sm text-content-muted">{totalVisible} terms shown</div>
            <div className="w-full sm:max-w-sm">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search terms, definitions, or examples"
                className="w-full rounded-md border border-bg-border bg-bg-surface px-3 py-2 text-sm text-content-primary placeholder-content-muted outline-none focus:border-brand"
              />
            </div>
          </div>
        </div>
      </section>

      {sections.length > 0 ? sections.map((section) => (
        <section key={section.title} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-[18px] font-semibold text-content-primary">{section.title}</h2>
            <p className="text-sm text-content-muted">{section.description}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {section.stats.map((stat) => <StatCard key={stat.key} stat={stat} />)}
          </div>
        </section>
      )) : (
        <div className="card p-8 text-center text-content-muted">No terms matched your search.</div>
      )}
    </div>
  )
}
