import { describe, it, expect } from 'vitest'
import { mergeSpans } from '../src/merge.js'
import type { Span } from '../src/types.js'

function span(start: number, end: number, type: string, source: string, score = 1): Span {
  return { value: '', start, end, type: type as any, source: source as any, score }
}

describe('mergeSpans', () => {
  it('keeps non-overlapping spans', () => {
    const result = mergeSpans([span(0, 5, 'NAME', 'gliner'), span(10, 15, 'EMAIL', 'regex')])
    expect(result).toHaveLength(2)
  })

  it('deduplicates overlapping spans — keeps longer', () => {
    const result = mergeSpans([
      span(0, 5, 'NAME', 'gliner'),   // "Sarah"
      span(0, 15, 'NAME', 'gliner'),  // "Dr. Sarah Chen"
    ])
    expect(result).toHaveLength(1)
    expect(result[0].end).toBe(15)
  })

  it('prefers regex over gliner for same-length overlaps', () => {
    const result = mergeSpans([
      span(0, 10, 'PHONE', 'gliner', 0.9),
      span(0, 10, 'PHONE', 'regex', 0.9),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('regex')
  })

  it('prefers higher score for same-length overlaps', () => {
    const result = mergeSpans([
      span(0, 10, 'NAME', 'gliner', 0.5),
      span(0, 10, 'NAME', 'gliner', 0.9),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(0.9)
  })

  it('returns empty for empty input', () => {
    expect(mergeSpans([])).toHaveLength(0)
  })
})
