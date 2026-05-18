const BATTER_DIMS = [
  { key: 'contact',    label: 'CON', full: 'Contact'    },
  { key: 'power',      label: 'PWR', full: 'Power'      },
  { key: 'discipline', label: 'EYE', full: 'Discipline' },
]

const PITCHER_DIMS = [
  { key: 'stuff',         label: 'STF', full: 'Stuff'       },
  { key: 'control',       label: 'CMD', full: 'Control'      },
  { key: 'hr_prevention', label: 'GB',  full: 'Ground Ball'  },
]

const DOT_COLOR = {
  1: 'bg-content-muted/30',
  2: 'bg-brand/60',
  3: 'bg-brand',
}

const DOT_COLOR_LG = {
  1: 'bg-red-500/50',
  2: 'bg-amber-400/80',
  3: 'bg-brand',
}

const TIER_LABEL = { 1: 'Below Avg', 2: 'Above Avg', 3: 'Elite' }
const TIER_COLOR = {
  1: 'text-red-400',
  2: 'text-amber-400',
  3: 'text-brand',
}

// size: 'sm' (default, compact inline) | 'lg' (player page card)
export default function RatingDots({ ratings, isPitcher, size = 'sm' }) {
  if (!ratings) return null

  const dims = isPitcher ? PITCHER_DIMS : BATTER_DIMS

  if (size === 'lg') {
    return (
      <div className="grid grid-cols-3 gap-4">
        {dims.map(({ key, full }) => {
          const stars = ratings[key]
          if (!stars) return null
          return (
            <div
              key={key}
              className="card p-5 flex flex-col items-center gap-3"
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-content-muted">
                {full}
              </span>
              <div className="flex items-center gap-2.5">
                {[1, 2, 3].map(n => (
                  <span
                    key={n}
                    className={`inline-block w-6 h-6 rounded-full transition-colors ${
                      n <= stars ? DOT_COLOR_LG[stars] : 'bg-bg-elevated border-2 border-bg-border'
                    }`}
                  />
                ))}
              </div>
              <span className={`text-sm font-bold leading-none ${TIER_COLOR[stars]}`}>
                {TIER_LABEL[stars]}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  // sm — compact inline
  return (
    <div className="flex items-center gap-2">
      {dims.map(({ key, label }) => {
        const stars = ratings[key]
        if (!stars) return null
        return (
          <div key={key} className="flex items-center gap-0.5">
            <span className="text-[8px] font-bold text-content-muted font-mono mr-0.5 tracking-wider">{label}</span>
            {[1, 2, 3].map(n => (
              <span
                key={n}
                className={`inline-block w-1.5 h-1.5 rounded-full ${n <= stars ? DOT_COLOR[stars] : 'bg-bg-elevated border border-bg-border'}`}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
