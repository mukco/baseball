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
    hotGame: (date) => fetchJSON(`/schedule/hot_game?date=${date}`),
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
    list: (topic = 'all', limit = 50) => fetchJSON(`/news?topic=${encodeURIComponent(topic)}&limit=${limit}`),
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
}
