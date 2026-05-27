const BASE = '/api'
const CURRENT_SEASON = new Date().getFullYear()

async function fetchJSON(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    let message = `API error ${res.status}: ${path}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {}
    throw new Error(message)
  }
  return res.json()
}

export const api = {
  standings: {
    current: () => fetchJSON('/standings'),
  },
  schedule: {
    today: () => fetchJSON('/schedule/today'),
    byDate: (date) => fetchJSON(`/schedule/${date}`),
    hotGames: (date) => fetchJSON(`/schedule/hot_game?date=${date}`),
  },
  games: {
    details: (gamePk) => fetchJSON(`/games/${gamePk}`),
    plays: (gamePk) => fetchJSON(`/games/${gamePk}/plays`),
    insights: (gamePk, { refresh = false } = {}) => fetchJSON(`/games/${gamePk}/insights${refresh ? '?refresh=true' : ''}`),
    winProbability: (gamePk) => fetchJSON(`/games/${gamePk}/win_probability`),
    picks: (gamePk, { refresh = false } = {}) => fetchJSON(`/games/${gamePk}/picks${refresh ? '?refresh=true' : ''}`),
  },
  players: {
    search: (q) => fetchJSON(`/players/search?q=${encodeURIComponent(q)}`).then((res) => {
      // search_unavailable is a soft error — return empty so the UI can show a hint
      if (res?.error === 'search_unavailable') throw Object.assign(new Error('Search temporarily unavailable'), { soft: true })
      return Array.isArray(res) ? res : []
    }),
    info: (id) => fetchJSON(`/players/${id}`),
    hoverStats: (id) => fetchJSON(`/players/${id}/hover_stats`),
    fantasy: (id) => fetchJSON(`/players/${id}/fantasy`),
  },
  teams: {
    all: () => fetchJSON('/teams'),
    info: (id) => fetchJSON(`/teams/${id}`),
    stats: (id, season = CURRENT_SEASON) => fetchJSON(`/teams/${id}/stats?season=${season}`),
    gameLog: (id, season = CURRENT_SEASON) => fetchJSON(`/teams/${id}/game_log?season=${season}`),
    history: (id) => fetchJSON(`/teams/${id}/history`),
  },
  stats: {
    season: (id, season = CURRENT_SEASON) => fetchJSON(`/stats/${id}/season?season=${season}`),
    career: (id, group = 'hitting') => fetchJSON(`/stats/${id}/career?group=${group}`),
    gameLog: (id, season = CURRENT_SEASON, group = 'hitting', limit = 30) =>
      fetchJSON(`/stats/${id}/game_log?season=${season}&group=${group}&limit=${limit}`),
    projections: (id, season = CURRENT_SEASON, group = 'hitting', source = 'steamer') =>
      fetchJSON(`/stats/${id}/projections?season=${season}&group=${group}&source=${source}`),
    statcastPitching: (id, season = CURRENT_SEASON) => fetchJSON(`/stats/${id}/statcast/pitching?season=${season}`),
    statcastBatting: (id, season = CURRENT_SEASON) => fetchJSON(`/stats/${id}/statcast/batting?season=${season}`),
  },
  leaderboards: {
    batting: (season = CURRENT_SEASON, minPa = 100) => fetchJSON(`/leaderboards/batting?season=${season}&min_pa=${minPa}`),
    pitching: (season = CURRENT_SEASON, minIp = 30) => fetchJSON(`/leaderboards/pitching?season=${season}&min_ip=${minIp}`),
    teams: (season = CURRENT_SEASON, group = 'batting') => fetchJSON(`/leaderboards/teams?season=${season}&group=${group}`),
  },
  news: {
    list:      (topic = 'all', limit = 50) => fetchJSON(`/news?topic=${encodeURIComponent(topic)}&limit=${limit}`),
    forPlayer: (name)                       => fetchJSON(`/news?player_name=${encodeURIComponent(name)}`),
  },
  mlb: {
    watch: (gamePk) => fetchJSON(`/mlb/watch/${gamePk}`),
  },
  sandbox: {
    datasets: () => fetchJSON('/sandbox/datasets'),
    query: (sql, limit = 500) => fetchJSON('/sandbox/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, limit }),
    }),
    refresh: () => fetchJSON('/sandbox/refresh', { method: 'POST' }),
  },
  assistant: {
    ask: (question, context = {}, messages = []) => fetchJSON('/assistant/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context, messages }),
    }),
  },
  digest: {
    get: (date, { refresh = false } = {}) => {
      const params = new URLSearchParams()
      if (date) params.set('date', date)
      if (refresh) params.set('refresh', 'true')
      const qs = params.toString()
      return fetchJSON(`/daily_summary${qs ? `?${qs}` : ''}`)
    },
  },
  factoids: {
    player: (id, season = CURRENT_SEASON) => fetchJSON(`/players/${id}/factoids?season=${season}`),
    team:   (id) => fetchJSON(`/teams/${id}/factoids`),
    game:   (gamePk) => fetchJSON(`/games/${gamePk}/factoids`),
  },
  ml: {
    health: () => fetchJSON('/ml/health'),
    columns: (table) => fetchJSON(`/ml/columns/${table}?duckdb_path=`),
    train: (config) => fetchJSON('/ml/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ml: config }),
    }),
    runs: () => fetchJSON('/ml/runs'),
    deleteRun: (id) => fetchJSON(`/ml/runs/${id}`, { method: 'DELETE' }),
  },
  yahoo: {
    status:   () => fetchJSON('/yahoo/status'),
    authUrl:  () => fetchJSON('/yahoo/auth_url'),
    callback: (code) => fetchJSON('/yahoo/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }),
    roster: () => fetchJSON('/yahoo/roster'),
    dashboard: () => fetchJSON('/yahoo/dashboard'),
    insights: ({ refresh = false } = {}) => fetchJSON(`/yahoo/insights${refresh ? '?refresh=true' : ''}`),
    freeAgents: ({ refresh = false } = {}) => fetchJSON(`/yahoo/free_agents${refresh ? '?refresh=true' : ''}`),
    searchFreeAgents: ({ position = null, search = null, limit = 25 } = {}) => {
      const params = new URLSearchParams()
      if (position) params.set('position', position)
      if (search)   params.set('search', search)
      if (limit !== 25) params.set('limit', String(limit))
      const qs = params.toString()
      return fetchJSON(`/yahoo/free_agent_search${qs ? `?${qs}` : ''}`)
    },
  },
  ottoneu: {
    roster:       () => fetchJSON('/ottoneu/roster'),
    standings:    () => fetchJSON('/ottoneu/standings'),
    auctions:     () => fetchJSON('/ottoneu/auctions'),
    waivers:      () => fetchJSON('/ottoneu/waivers'),
    capOverview:  () => fetchJSON('/ottoneu/cap_overview'),
    playerStatus: (fgId) => fetchJSON(`/ottoneu/player_status?fg_id=${fgId}`),
    insights:     ({ refresh = false } = {}) => fetchJSON(`/ottoneu/insights${refresh ? '?refresh=true' : ''}`),
    freeAgents:   ({ refresh = false, minors = false } = {}) => {
      const params = new URLSearchParams()
      if (refresh) params.set('refresh', 'true')
      if (minors)  params.set('minors', 'true')
      const qs = params.toString()
      return fetchJSON(`/ottoneu/free_agents${qs ? `?${qs}` : ''}`)
    },
    allRosters:   () => fetchJSON('/ottoneu/all_rosters'),
    playerStats:  ({ fgIds = [], names = [] } = {}) => {
      const p = new URLSearchParams()
      fgIds.forEach(id => p.append('fg_ids[]', id))
      names.forEach(n  => p.append('names[]', n))
      return fetchJSON(`/ottoneu/player_stats?${p}`)
    },
    playerAnalysis: ({ fgId, name } = {}) => {
      const p = new URLSearchParams()
      if (fgId) p.set('fg_id', fgId)
      if (name) p.set('name', name)
      return fetchJSON(`/ottoneu/player_analysis?${p}`)
    },
    loans: () => fetchJSON('/ottoneu/loans'),
    leagueStats: () => fetchJSON('/ottoneu/league_stats'),
  },
  prospects: {
    top100: () => fetchJSON('/prospects/top100'),
    team: (teamId) => fetchJSON(`/prospects/team/${teamId}`),
    player: (playerId) => fetchJSON(`/prospects/player/${playerId}`),
  },
  odds: {
    today: (date) => fetchJSON(`/odds/today${date ? `?date=${date}` : ''}`),
  },
  transactions: {
    list: ({ teamId, playerId, startDate, endDate, limit } = {}) => {
      const p = new URLSearchParams()
      if (teamId)    p.set('team_id', teamId)
      if (playerId)  p.set('player_id', playerId)
      if (startDate) p.set('start_date', startDate)
      if (endDate)   p.set('end_date', endDate)
      if (limit)     p.set('limit', limit)
      return fetchJSON(`/transactions?${p}`)
    },
  },
  projections: {
    leagueAccuracy: (playerType = 'batter') =>
      fetchJSON(`/projections/accuracy/league?player_type=${playerType}`),
    player: (id, { scenarioId, type = 'rest_of_season', refresh = false } = {}) => {
      const p = new URLSearchParams()
      if (scenarioId) p.set('scenario_id', scenarioId)
      p.set('type', type)
      if (refresh) p.set('refresh', 'true')
      return fetchJSON(`/projections/player/${id}?${p}`)
    },
    leaderboard: ({ runId, playerType = 'batter', season } = {}) => {
      const p = new URLSearchParams()
      if (runId) p.set('run_id', runId)
      p.set('player_type', playerType)
      if (season) p.set('season', season)
      return fetchJSON(`/projections/leaderboard?${p}`)
    },
  },
  projectionRuns: {
    list: ({ scenarioId, season } = {}) => {
      const p = new URLSearchParams()
      if (scenarioId) p.set('scenario_id', scenarioId)
      if (season) p.set('season', season)
      return fetchJSON(`/projection_runs?${p}`)
    },
    create: ({ scenarioId, playerIds, projectionType = 'rest_of_season', seasons, name } = {}) =>
      fetchJSON('/projection_runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id:     scenarioId,
          player_ids:      playerIds,
          projection_type: projectionType,
          seasons,
          name,
        }),
      }),
    destroy: (id) =>
      fetchJSON(`/projection_runs/${id}`, { method: 'DELETE' }),
  },
  scenarios: {
    list: () => fetchJSON('/scenarios'),
    show: (id) => fetchJSON(`/scenarios/${id}`),
    create: (body) => fetchJSON('/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: body }),
    }),
    update: (id, body) => fetchJSON(`/scenarios/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: body }),
    }),
    destroy: (id) => fetchJSON(`/scenarios/${id}`, { method: 'DELETE' }),
  },
  franchises: {
    list:    ()   => fetchJSON('/franchises'),
    show:    (id) => fetchJSON(`/franchises/${id}`),
    destroy: (id) => fetchJSON(`/franchises/${id}`, { method: 'DELETE' }),
    create: (body) => fetchJSON('/franchises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    advance:       (id)               => fetchJSON(`/franchises/${id}/advance`, { method: 'POST' }),
    playerHistory: (id, playerId)     => fetchJSON(`/franchises/${id}/player_history/${playerId}`),
    teamHistory:   (id, teamId)       => fetchJSON(`/franchises/${id}/team_history/${teamId}`),
  },
  simulations: {
    list: () => fetchJSON('/simulations'),
    create: (body) => fetchJSON('/simulations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    show: (id) => fetchJSON(`/simulations/${id}`),
    destroy: (id) => fetchJSON(`/simulations/${id}`, { method: 'DELETE' }),
    sync: (id, throughDate) => fetchJSON(`/simulations/${id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ through_date: throughDate }),
    }),
    simulateDay: (id, date) => fetchJSON(`/simulations/${id}/simulate_day`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    }),
    jobStatus: (id, jobId) => fetchJSON(`/simulations/${id}/jobs/${jobId}`),
    simulateGame: (id, gameId) => fetchJSON(`/simulations/${id}/games/${gameId}/simulate`, {
      method: 'POST',
    }),
    gameShow:     (id, gameId) => fetchJSON(`/simulations/${id}/games/${gameId}`),
    gameInsights: (id, gameId, { refresh = false } = {}) => fetchJSON(`/simulations/${id}/games/${gameId}/insights${refresh ? '?refresh=true' : ''}`),
    schedule: (id, date) => fetchJSON(`/simulations/${id}/schedule${date ? `?date=${date}` : ''}`),
    analysis: (id) => fetchJSON(`/simulations/${id}/analysis`),
    probabilities: (id, gameId, runs = 100) => fetchJSON(`/simulations/${id}/games/${gameId}/probabilities?runs=${runs}`),
    roster: (id, teamId) => fetchJSON(`/simulations/${id}/rosters/${teamId}`),
    updateRoster: (id, teamId, body) => fetchJSON(`/simulations/${id}/rosters/${teamId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    stats:           (id)               => fetchJSON(`/simulations/${id}/stats`),
    teamPlayerStats: (id, teamId)       => fetchJSON(`/simulations/${id}/team_player_stats/${teamId}`),
    playerStats:     (id, playerId)     => fetchJSON(`/simulations/${id}/stats/${playerId}`),
    seasonInsights: (id, { refresh = false } = {}) => fetchJSON(`/simulations/${id}/insights${refresh ? '?refresh=true' : ''}`),
    playerInsights: (id, playerId, { refresh = false } = {}) => fetchJSON(`/simulations/${id}/player_insights/${playerId}${refresh ? '?refresh=true' : ''}`),
    teamInsights:   (id, teamId,   { refresh = false } = {}) => fetchJSON(`/simulations/${id}/team_insights/${teamId}${refresh ? '?refresh=true' : ''}`),
    simulateThrough: (id, throughDate) => fetchJSON(`/simulations/${id}/simulate_through`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ through_date: throughDate }),
    }),
    simulateSeason: (id) => fetchJSON(`/simulations/${id}/simulate_season`, { method: 'POST' }),
    seedPlayoffs:   (id) => fetchJSON(`/simulations/${id}/seed_playoffs`, { method: 'POST' }),
    simulatePlayoffRound: (id, round) => fetchJSON(`/simulations/${id}/simulate_playoff_round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ round }),
    }),
    playoffs:        (id) => fetchJSON(`/simulations/${id}/playoffs`),
    playoffLeaders:  (id) => fetchJSON(`/simulations/${id}/playoff_leaders`),
    playoffInsights: (id, { refresh = false } = {}) => fetchJSON(`/simulations/${id}/playoff_insights${refresh ? '?refresh=true' : ''}`),
    awards: (id) => fetchJSON(`/simulations/${id}/awards`),
    generateAwards: (id) => fetchJSON(`/simulations/${id}/generate_awards`, { method: 'POST' }),
    playoffAwards: (id) => fetchJSON(`/simulations/${id}/playoff_awards`),
    generatePlayoffAwards: (id) => fetchJSON(`/simulations/${id}/generate_playoff_awards`, { method: 'POST' }),
    news:         (id, { page = 1, per = 14 } = {}) => fetchJSON(`/simulations/${id}/news?page=${page}&per=${per}`),
    newsCalendar: (id) => fetchJSON(`/simulations/${id}/news/calendar`),
    injuries:     (id, { teamId } = {}) => fetchJSON(`/simulations/${id}/injuries${teamId ? `?team_id=${teamId}` : ''}`),
    config:       (id)              => fetchJSON(`/simulations/${id}/config`),
    updateConfig: (id, params)      => fetchJSON(`/simulations/${id}/config`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ params }),
    }),
    applyPreset:  (id, preset)      => fetchJSON(`/simulations/${id}/config`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ preset }),
    }),
  },
  simulationPresets: {
    list:    ()             => fetchJSON('/simulation_presets'),
    create:  (name, params) => fetchJSON('/simulation_presets', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, params }),
    }),
    destroy: (id)           => fetchJSON(`/simulation_presets/${id}`, { method: 'DELETE' }),
  },
  cache: {
    status: () => fetchJSON('/cache/status'),
    warm: (tier) => fetchJSON(`/cache/warm${tier ? `?tier=${tier}` : ''}`, { method: 'POST' }),
  },
  settings: {
    get: () => fetchJSON('/settings'),
    update: (attrs) => fetchJSON('/settings', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ settings: attrs }),
    }),
  },
}
