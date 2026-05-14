export const TEAM_ID_BY_ABBR = {
  LAA: 108,
  ARI: 109,
  BAL: 110,
  BOS: 111,
  CHC: 112,
  CIN: 113,
  CLE: 114,
  COL: 115,
  DET: 116,
  HOU: 117,
  KC: 118,
  LAD: 119,
  WSH: 120,
  NYM: 121,
  OAK: 133,
  PIT: 134,
  SD: 135,
  SEA: 136,
  SF: 137,
  STL: 138,
  TB: 139,
  TEX: 140,
  TOR: 141,
  MIN: 142,
  PHI: 143,
  ATL: 144,
  CWS: 145,
  MIA: 146,
  NYY: 147,
  MIL: 158,
}

const TEAM_ABBR_ALIASES = {
  CHW: 'CWS',
  KCR: 'KC',
  SDP: 'SD',
  SFG: 'SF',
  TBR: 'TB',
  WSN: 'WSH',
}

export function teamIdFromAbbr(rawAbbr) {
  const abbr = String(rawAbbr || '').trim().toUpperCase()
  if (!abbr) return null
  return TEAM_ID_BY_ABBR[abbr] || TEAM_ID_BY_ABBR[TEAM_ABBR_ALIASES[abbr]] || null
}
