import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { api } from '../api'
import TransactionsList, { TYPE_FILTERS, RANGES } from '../components/TransactionsList'

export default function Transactions() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [rangeDays, setRangeDays] = useState(14)
  const [teamId, setTeamId] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const startDate = format(subDays(new Date(), rangeDays), 'yyyy-MM-dd')

  const { data: teamsData } = useQuery({
    queryKey: ['teams-all'],
    queryFn: () => api.teams.all(),
    staleTime: 60 * 60 * 1000,
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['transactions', teamId, startDate, today],
    queryFn: () => api.transactions.list({ teamId: teamId || undefined, startDate, endDate: today, limit: 200 }),
    staleTime: 5 * 60 * 1000,
  })

  const teams = useMemo(() => {
    const list = Array.isArray(teamsData) ? teamsData : (teamsData?.teams || [])
    return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [teamsData])

  const activeCodes = TYPE_FILTERS.find(f => f.key === typeFilter)?.codes
  const transactions = useMemo(() => {
    const all = data?.transactions || []
    if (!activeCodes) return all
    return all.filter(tx => activeCodes.includes(tx.type_code))
  }, [data, activeCodes])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-content-primary">Transactions</h1>
        <span className="text-xs text-content-muted">{transactions.length} moves</span>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        {/* Date range */}
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setRangeDays(r.days)}
              className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition-colors ${
                rangeDays === r.days
                  ? 'bg-bg-border text-content-primary'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Team filter */}
          <select
            value={teamId}
            onChange={e => setTeamId(e.target.value)}
            className="text-sm bg-bg-elevated border border-bg-border rounded-lg px-3 py-1.5 text-content-primary focus:outline-none focus:border-brand min-w-[160px]"
          >
            <option value="">All Teams</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {/* Type filter */}
          <div className="flex flex-wrap gap-1">
            {TYPE_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setTypeFilter(f.key)}
                className={`text-[11px] px-2.5 py-1 rounded font-medium transition-colors ${
                  typeFilter === f.key
                    ? 'bg-bg-border text-content-primary'
                    : 'text-content-muted hover:text-content-secondary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="card p-4">
        <TransactionsList
          transactions={transactions}
          loading={isLoading}
          error={error ? 'Failed to load transactions.' : null}
          showPlayer
        />
      </div>
    </div>
  )
}
