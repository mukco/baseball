import { format, parseISO } from 'date-fns'
import PlayerLink from './PlayerLink'

const TYPE_CONFIG = {
  CU:   { label: 'Called Up',  classes: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  OPT:  { label: 'Optioned',   classes: 'text-amber-400  bg-amber-400/10  border-amber-400/20'  },
  DES:  { label: 'DFA',        classes: 'text-red-400    bg-red-400/10    border-red-400/20'    },
  IL:   { label: 'IL',         classes: 'text-red-400    bg-red-400/10    border-red-400/20'    },
  IL7:  { label: 'IL-7',       classes: 'text-red-400    bg-red-400/10    border-red-400/20'    },
  IL10: { label: 'IL-10',      classes: 'text-red-400    bg-red-400/10    border-red-400/20'    },
  IL15: { label: 'IL-15',      classes: 'text-red-400    bg-red-400/10    border-red-400/20'    },
  IL60: { label: 'IL-60',      classes: 'text-red-400    bg-red-400/10    border-red-400/20'    },
  ACT:  { label: 'Activated',  classes: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  TRD:  { label: 'Trade',      classes: 'text-blue-400   bg-blue-400/10   border-blue-400/20'   },
  REL:  { label: 'Released',   classes: 'text-content-muted bg-bg-border border-bg-border'       },
  SFA:  { label: 'Signed',     classes: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' },
  SIG:  { label: 'Signed',     classes: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' },
  ASG:  { label: 'Rehab',      classes: 'text-amber-400  bg-amber-400/10  border-amber-400/20'  },
  RTN:  { label: 'Returned',   classes: 'text-content-muted bg-bg-border border-bg-border'       },
  OUT:  { label: 'Outrighted', classes: 'text-content-muted bg-bg-border border-bg-border'       },
  CLW:  { label: 'Claimed',    classes: 'text-violet-400 bg-violet-400/10 border-violet-400/20' },
}

export const TYPE_FILTERS = [
  { key: 'all',    label: 'All' },
  { key: 'moves',  label: 'Call-ups / Options', codes: ['CU', 'OPT', 'ASG', 'RTN', 'OUT'] },
  { key: 'il',     label: 'IL / Activated',     codes: ['IL', 'IL7', 'IL10', 'IL15', 'IL60', 'ACT'] },
  { key: 'trades', label: 'Trades',              codes: ['TRD', 'CLW'] },
  { key: 'dfa',    label: 'DFA / Released',      codes: ['DES', 'REL'] },
  { key: 'signed', label: 'Signings',            codes: ['SFA', 'SIG'] },
]

export const RANGES = [
  { label: 'Last 7 days',  days: 7  },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 60 days', days: 60 },
]

function typeCfg(code) {
  return TYPE_CONFIG[code] || { label: code, classes: 'text-content-muted bg-bg-border border-bg-border' }
}

function fmtDate(str) {
  try { return format(parseISO(str), 'MMM d') } catch { return str }
}

function TypeBadge({ code }) {
  const cfg = typeCfg(code)
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}

function TransactionRow({ tx, showPlayer = true }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-bg-border/50 last:border-0">
      {/* Content */}
      <div className="flex-1 min-w-0">
        {showPlayer ? (
          <div className="flex items-center gap-2 flex-wrap">
            <PlayerLink
              playerId={tx.person?.id}
              name={tx.person?.name}
              imageClassName="w-6 h-6"
              textClassName="text-sm font-medium text-content-primary"
            />
            <TypeBadge code={tx.type_code} />
          </div>
        ) : (
          <TypeBadge code={tx.type_code} />
        )}
        <p className="text-[11px] text-content-muted leading-snug mt-0.5">
          {tx.description}
        </p>
      </div>

      {/* Date */}
      <span className="shrink-0 text-[11px] text-content-muted tabular-nums pt-0.5">
        {fmtDate(tx.date)}
      </span>
    </div>
  )
}

export default function TransactionsList({ transactions = [], loading = false, error = null, showPlayer = true, emptyLabel = 'No transactions found.' }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-content-muted text-sm justify-center">
        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        Loading transactions…
      </div>
    )
  }

  if (error) {
    return <p className="py-4 text-sm text-content-muted">{error}</p>
  }

  if (!transactions.length) {
    return <p className="py-4 text-sm text-content-muted">{emptyLabel}</p>
  }

  return (
    <div>
      {transactions.map(tx => (
        <TransactionRow key={tx.id} tx={tx} showPlayer={showPlayer} />
      ))}
    </div>
  )
}
