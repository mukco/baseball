import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import PlayerLink from '../components/PlayerLink'

const TEAMS = [
  { id: 108, name: 'Angels', abbr: 'LAA' }, { id: 109, name: 'D-backs', abbr: 'ARI' },
  { id: 110, name: 'Orioles', abbr: 'BAL' }, { id: 111, name: 'Red Sox', abbr: 'BOS' },
  { id: 112, name: 'Cubs', abbr: 'CHC' }, { id: 113, name: 'Reds', abbr: 'CIN' },
  { id: 114, name: 'Guardians', abbr: 'CLE' }, { id: 115, name: 'Rockies', abbr: 'COL' },
  { id: 116, name: 'Tigers', abbr: 'DET' }, { id: 117, name: 'Astros', abbr: 'HOU' },
  { id: 118, name: 'Royals', abbr: 'KC' }, { id: 119, name: 'Dodgers', abbr: 'LAD' },
  { id: 120, name: 'Nationals', abbr: 'WSH' }, { id: 121, name: 'Mets', abbr: 'NYM' },
  { id: 133, name: 'Athletics', abbr: 'OAK' }, { id: 134, name: 'Pirates', abbr: 'PIT' },
  { id: 135, name: 'Padres', abbr: 'SD' }, { id: 136, name: 'Mariners', abbr: 'SEA' },
  { id: 137, name: 'Giants', abbr: 'SF' }, { id: 138, name: 'Cardinals', abbr: 'STL' },
  { id: 139, name: 'Rays', abbr: 'TB' }, { id: 140, name: 'Rangers', abbr: 'TEX' },
  { id: 141, name: 'Blue Jays', abbr: 'TOR' }, { id: 142, name: 'Twins', abbr: 'MIN' },
  { id: 143, name: 'Phillies', abbr: 'PHI' }, { id: 144, name: 'Braves', abbr: 'ATL' },
  { id: 145, name: 'White Sox', abbr: 'CWS' }, { id: 146, name: 'Marlins', abbr: 'MIA' },
  { id: 147, name: 'Yankees', abbr: 'NYY' }, { id: 158, name: 'Brewers', abbr: 'MIL' },
]

function pct(num, den) {
  if (!den || den === 0) return null
  return (num / den * 100).toFixed(1) + '%'
}

function fmt(val, decimals = 3) {
  if (val == null || val === '') return null
  const n = Number(val)
  if (isNaN(n)) return null
  return decimals === 3 ? n.toFixed(3).replace(/^0\./, '.') : n.toFixed(decimals)
}

function StatPill({ label, value }) {
  if (value == null) return null
  return (
    <div className="flex flex-col items-center px-3 py-1.5 bg-bg-elevated rounded">
      <span className="text-[10px] text-content-muted uppercase tracking-wider">{label}</span>
      <span className="text-sm font-mono font-medium text-content-primary mt-0.5">{value}</span>
    </div>
  )
}

function HittingStats({ h }) {
  if (!h) return <p className="text-xs text-content-muted italic">No stats this season</p>
  const bbPct = pct(h.baseOnBalls, h.plateAppearances)
  const kPct = pct(h.strikeOuts, h.plateAppearances)
  return (
    <div className="flex flex-wrap gap-1.5">
      <StatPill label="PA"   value={h.plateAppearances} />
      <StatPill label="AVG"  value={fmt(h.avg)} />
      <StatPill label="OBP"  value={fmt(h.obp)} />
      <StatPill label="SLG"  value={fmt(h.slg)} />
      <StatPill label="OPS"  value={fmt(h.ops)} />
      <StatPill label="BB%"  value={bbPct} />
      <StatPill label="K%"   value={kPct} />
      <StatPill label="BABIP" value={fmt(h.babip)} />
      <StatPill label="HR"   value={h.homeRuns} />
      <StatPill label="SB"   value={h.stolenBases} />
      <StatPill label="RBI"  value={h.rbi} />
    </div>
  )
}

function PitchingStats({ p }) {
  if (!p) return <p className="text-xs text-content-muted italic">No stats this season</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      <StatPill label="IP"   value={p.inningsPitched} />
      <StatPill label="ERA"  value={fmt(p.era, 2)} />
      <StatPill label="WHIP" value={fmt(p.whip, 2)} />
      <StatPill label="K/9"  value={fmt(p.strikeoutsPer9Inn, 1)} />
      <StatPill label="BB/9" value={fmt(p.walksPer9Inn, 1)} />
      <StatPill label="K"    value={p.strikeOuts} />
      <StatPill label="BB"   value={p.baseOnBalls} />
      <StatPill label="HR"   value={p.homeRuns} />
    </div>
  )
}

function ExpandedStats({ prospect }) {
  const stats = prospect.stats
  const hitting = stats?.hitting
  const pitching = stats?.pitching
  const isPitcher = ['SP', 'RP', 'P'].includes(prospect.position) || prospect.position?.endsWith('HP')
  const tools = prospect.tools || {}
  const toolEntries = Object.entries(tools)

  return (
    <tr className="bg-bg-elevated/30 border-b border-bg-border/60">
      <td colSpan={9} className="px-4 py-3 space-y-3">
        {prospect.tldr && (
          <p className="text-xs text-content-secondary leading-relaxed max-w-2xl">{prospect.tldr}</p>
        )}
        <div className="flex flex-wrap gap-4 items-start">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-content-muted mb-1.5">2025 Stats</p>
            {!prospect.resolved ? (
              <p className="text-xs text-content-muted italic">Player not found in MLB Stats API</p>
            ) : isPitcher ? (
              <PitchingStats p={pitching} />
            ) : (
              <HittingStats h={hitting} />
            )}
          </div>
          {toolEntries.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-content-muted mb-1.5">Scouting Grades (present / future)</p>
              <div className="flex flex-wrap gap-1.5">
                {toolEntries.map(([key, val]) => (
                  <StatPill key={key} label={key.toUpperCase()} value={val} />
                ))}
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

function FvBadge({ fv }) {
  if (!fv) return <span className="text-content-muted">-</span>
  const color = fv >= 70 ? 'text-yellow-400' : fv >= 60 ? 'text-brand-light' : fv >= 50 ? 'text-content-secondary' : 'text-content-muted'
  return <span className={`font-mono font-semibold ${color}`}>{fv}</span>
}

function ProspectRow({ prospect, showOrgRank, expanded, onToggle }) {
  const displayRank = showOrgRank ? prospect.orgRank : prospect.rank

  function handleRowClick(e) {
    if (e.target.closest('a')) return
    onToggle()
  }

  return (
    <tr
      className={`border-b border-bg-border/60 last:border-b-0 hover:bg-bg-elevated/40 transition-colors cursor-pointer ${expanded ? 'bg-bg-elevated/20' : ''}`}
      onClick={handleRowClick}
    >
      <td className="py-2.5 px-2 text-xs font-mono text-content-muted w-8">{displayRank || '-'}</td>
      <td className="py-2.5 px-2 whitespace-nowrap">
        {prospect.playerId ? (
          <PlayerLink playerId={prospect.playerId} name={prospect.name} imageClassName="w-6 h-6" />
        ) : (
          <span className="text-sm font-medium text-content-primary">{prospect.name}</span>
        )}
      </td>
      <td className="py-2.5 px-2 text-xs text-content-secondary">{prospect.position}</td>
      <td className="py-2.5 px-2 text-xs text-content-muted">{prospect.team}</td>
      <td className="py-2.5 px-2 text-xs font-mono text-content-muted">{prospect.level}</td>
      <td className="py-2.5 px-2 text-xs font-mono text-content-muted">{prospect.age}</td>
      <td className="py-2.5 px-2 text-xs text-content-muted">{prospect.bats}/{prospect.throws}</td>
      <td className="py-2.5 px-2 text-center"><FvBadge fv={prospect.fv} /></td>
      <td className="py-2.5 px-2 text-xs font-mono text-content-muted text-center">{prospect.eta || '-'}</td>
    </tr>
  )
}

function ProspectTable({ prospects, loading, showOrgRank = false }) {
  const [expandedKey, setExpandedKey] = useState(null)

  if (loading) {
    return <div className="text-sm text-content-muted p-4">Loading prospects...</div>
  }

  if (!Array.isArray(prospects) || prospects.length === 0) {
    return <div className="text-sm text-content-muted p-4">No prospect data available.</div>
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bg-border text-content-muted text-xs">
              <th className="text-left px-2 py-3">#</th>
              <th className="text-left px-2 py-3">Player</th>
              <th className="text-left px-2 py-3">Pos</th>
              <th className="text-left px-2 py-3">Team</th>
              <th className="text-left px-2 py-3">Level</th>
              <th className="text-left px-2 py-3">Age</th>
              <th className="text-left px-2 py-3">B/T</th>
              <th className="text-center px-2 py-3">FV</th>
              <th className="text-center px-2 py-3">ETA</th>
            </tr>
          </thead>
          <tbody>
            {prospects.map((p) => {
              const key = `${p.playerId || p.name}-${p.rank}`
              const isExpanded = expandedKey === key
              return [
                <ProspectRow
                  key={key}
                  prospect={p}
                  showOrgRank={showOrgRank}
                  expanded={isExpanded}
                  onToggle={() => setExpandedKey(isExpanded ? null : key)}
                />,
                isExpanded && <ExpandedStats key={`${key}-expanded`} prospect={p} />,
              ]
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-content-muted px-3 py-2 border-t border-bg-border/40">Click any row to expand stats &amp; scouting grades</p>
    </div>
  )
}

export default function Prospects() {
  const [tab, setTab] = useState('top100')
  const [teamId, setTeamId] = useState(147)

  const { data: top100, isLoading: loadingTop } = useQuery({
    queryKey: ['prospects-top100'],
    queryFn: () => api.prospects.top100(),
    staleTime: 30 * 60 * 1000,
  })

  const { data: teamProspects, isLoading: loadingTeam } = useQuery({
    queryKey: ['prospects-team', teamId],
    queryFn: () => api.prospects.team(teamId),
    enabled: tab === 'team',
    staleTime: 30 * 60 * 1000,
  })

  return (
    <div className="space-y-10 py-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-content-primary">Prospects</h1>
          <p className="text-sm text-content-muted mt-1">Via FanGraphs — click any row for full stats &amp; scouting grades</p>
        </div>
        <div className="flex items-center gap-3">
          {tab === 'team' && (
            <select
              value={teamId}
              onChange={(e) => setTeamId(Number(e.target.value))}
              className="bg-bg-elevated border border-bg-border text-content-primary text-sm rounded-md px-3 py-1.5 outline-none focus:border-brand"
            >
              {TEAMS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <div className="flex items-center border-b border-bg-border">
            <button onClick={() => setTab('top100')} className={tab === 'top100' ? 'tab-active' : 'tab-inactive'}>Top 100</button>
            <button onClick={() => setTab('team')} className={tab === 'team' ? 'tab-active' : 'tab-inactive'}>By Team</button>
          </div>
        </div>
      </div>

      {tab === 'top100' && <ProspectTable prospects={top100} loading={loadingTop} />}
      {tab === 'team' && <ProspectTable prospects={teamProspects} loading={loadingTeam} showOrgRank />}
    </div>
  )
}
