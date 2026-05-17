export const PITCH_COLORS = {
  FF: '#D22D49', SI: '#FE9D00', FC: '#933F2C',
  SL: '#EEE716', ST: '#D2E338', CU: '#00D1ED',
  KC: '#01C8E3', CH: '#1DBE3A', FS: '#3BACAC',
  KN: '#9C9C9C', EP: '#5A5A5A',
}

export const PITCH_LABELS = {
  FF: '4-Seam', SI: 'Sinker', FC: 'Cutter',
  SL: 'Slider', ST: 'Sweeper', CU: 'Curve',
  KC: 'Knuckle Curve', CH: 'Changeup',
  FS: 'Splitter', KN: 'Knuckleball', EP: 'Eephus',
}

export const OUTCOME_LABELS = {
  ball: 'Ball',
  called_strike: 'Called Strike',
  swinging_strike: 'Swinging Strike',
}

export const OUTCOME_COLORS = {
  ball: '#6B7280',
  called_strike: '#60A5FA',
  swinging_strike: '#F87171',
}

export const OUTCOME_ORDER = ['ball', 'called_strike', 'swinging_strike']

export function pitchColor(type) {
  return PITCH_COLORS[type] || '#9CA3AF'
}

export function pitchLabel(type) {
  return PITCH_LABELS[type] || type
}
