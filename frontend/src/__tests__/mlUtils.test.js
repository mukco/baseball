import { describe, it, expect } from 'vitest'
import { calcNNParams } from '../lib/mlUtils'

describe('calcNNParams', () => {
  it('matches the formula for a two-hidden-layer network', () => {
    // (5+1)*64 + (64+1)*32 + (32+1)*1 = 384 + 2080 + 33 = 2497
    expect(calcNNParams(5, [{ neurons: 64 }, { neurons: 32 }], 1)).toBe(2497)
  })

  it('handles a single hidden layer', () => {
    // (10+1)*16 + (16+1)*1 = 176 + 17 = 193
    expect(calcNNParams(10, [{ neurons: 16 }], 1)).toBe(193)
  })

  it('handles multiclass output', () => {
    // (4+1)*8 + (8+1)*3 = 40 + 27 = 67
    expect(calcNNParams(4, [{ neurons: 8 }], 3)).toBe(67)
  })

  it('handles no hidden layers (direct input→output)', () => {
    // (3+1)*2 = 8
    expect(calcNNParams(3, [], 2)).toBe(8)
  })

  it('returns 0 for zero-size input and output with no layers', () => {
    expect(calcNNParams(0, [], 0)).toBe(0)
  })

  it('scales linearly with a wider single hidden layer', () => {
    const narrow = calcNNParams(10, [{ neurons: 32 }], 1)
    const wide   = calcNNParams(10, [{ neurons: 64 }], 1)
    expect(wide).toBeGreaterThan(narrow)
  })

  it('adding a layer increases parameter count', () => {
    const shallow = calcNNParams(10, [{ neurons: 32 }], 1)
    const deep    = calcNNParams(10, [{ neurons: 32 }, { neurons: 32 }], 1)
    expect(deep).toBeGreaterThan(shallow)
  })

  it('is consistent with PyTorch formula — default 64,32 config', () => {
    // Default MLBuilder layers: [{neurons:64},{neurons:32}], input varies by feature count
    // With 5 features: (5+1)*64 + (64+1)*32 + (32+1)*1
    const result = calcNNParams(5, [{ neurons: 64 }, { neurons: 32 }], 1)
    expect(result).toBe(6 * 64 + 65 * 32 + 33 * 1)
  })
})
