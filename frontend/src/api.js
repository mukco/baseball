const BASE = '/api'

async function fetchJSON(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

export const api = {
  schedule: {
    today: () => fetchJSON('/schedule/today'),
    byDate: (date) => fetchJSON(`/schedule/${date}`),
  },
  players: {
    search: (q) => fetchJSON(`/players/search?q=${encodeURIComponent(q)}`),
    info: (id) => fetchJSON(`/players/${id}`),
  },
  stats: {
    season: (id, season = 2024) => fetchJSON(`/stats/${id}/season?season=${season}`),
    career: (id, group = 'hitting') => fetchJSON(`/stats/${id}/career?group=${group}`),
    statcastPitching: (id, season = 2024) => fetchJSON(`/stats/${id}/statcast/pitching?season=${season}`),
    statcastBatting: (id, season = 2024) => fetchJSON(`/stats/${id}/statcast/batting?season=${season}`),
  },
  leaderboards: {
    batting: (season = 2024) => fetchJSON(`/leaderboards/batting?season=${season}`),
    pitching: (season = 2024) => fetchJSON(`/leaderboards/pitching?season=${season}`),
  },
}
