import { describe, it, expect } from 'vitest'
import { getStatHelp, STAT_HELP, STAT_ALIASES } from '../lib/statHelp'

describe('STAT_HELP entries', () => {
  it('every entry has a label, definition, and interpretation', () => {
    const missing = Object.entries(STAT_HELP)
      .filter(([, v]) => !v.label || !v.definition || !v.interpretation)
      .map(([k]) => k)
    expect(missing).toEqual([])
  })

  it('labels are non-empty strings', () => {
    for (const [key, entry] of Object.entries(STAT_HELP)) {
      expect(typeof entry.label, `label for ${key}`).toBe('string')
      expect(entry.label.length, `label for ${key} is empty`).toBeGreaterThan(0)
    }
  })
})

describe('STAT_ALIASES', () => {
  it('every alias target key exists in STAT_HELP', () => {
    const missing = Object.entries(STAT_ALIASES)
      .filter(([, target]) => !STAT_HELP[target])
      .map(([alias, target]) => `${alias} → ${target}`)
    expect(missing).toEqual([])
  })

  it('has at least common stat aliases', () => {
    expect(STAT_ALIASES).toHaveProperty('hr')
    expect(STAT_ALIASES).toHaveProperty('avg')
    expect(STAT_ALIASES).toHaveProperty('era')
  })
})

describe('getStatHelp', () => {
  it('returns entry for a known key', () => {
    const result = getStatHelp('avg')
    expect(result).not.toBeNull()
    expect(result.label).toBe('AVG')
  })

  it('resolves through STAT_ALIASES', () => {
    const result = getStatHelp('hr')
    expect(result).not.toBeNull()
    expect(result.label).toBeTruthy()
  })

  it('is case-insensitive', () => {
    const lower = getStatHelp('era')
    const upper = getStatHelp('ERA')
    expect(lower).toEqual(upper)
  })

  it('strips surrounding whitespace', () => {
    expect(getStatHelp('  avg  ')).toEqual(getStatHelp('avg'))
  })

  it('returns null for an unknown stat', () => {
    expect(getStatHelp('xyzzy_unknown_123')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(getStatHelp(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(getStatHelp('')).toBeNull()
  })
})
