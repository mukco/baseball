const BASE = '/api'
const CURRENT_SEASON = new Date().getFullYear()

async function fetchJSON(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
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
  },
  players: {
    search: (q) => fetchJSON(`/players/search?q=${encodeURIComponent(q)}`),
    info: (id) => fetchJSON(`/players/${id}`),
  },
  teams: {
    all: () => fetchJSON('/teams'),
    info: (id) => fetchJSON(`/teams/${id}`),
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
    batting: (season = CURRENT_SEASON) => fetchJSON(`/leaderboards/batting?season=${season}`),
    pitching: (season = CURRENT_SEASON) => fetchJSON(`/leaderboards/pitching?season=${season}`),
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
}
