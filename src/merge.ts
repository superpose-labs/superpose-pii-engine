import type { Span } from './types.js'

const SOURCE_PRIORITY: Record<string, number> = {
  regex: 3,
  nltagger: 2,
  gliner: 2,
}

/**
 * Merge spans from multiple detectors, deduplicating overlaps.
 * Priority: longer span > higher score > regex over gliner.
 */
export function mergeSpans(spans: Span[]): Span[] {
  if (spans.length === 0) return []

  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end)
  const result: Span[] = []

  for (const span of sorted) {
    const prev = result[result.length - 1]
    if (!prev || span.start >= prev.end) {
      result.push(span)
      continue
    }

    // Overlapping — decide which to keep
    const spanLen = span.end - span.start
    const prevLen = prev.end - prev.start

    if (spanLen > prevLen) {
      result[result.length - 1] = span
    } else if (spanLen === prevLen) {
      if (span.score > prev.score) {
        result[result.length - 1] = span
      } else if (span.score === prev.score) {
        const spanPri = SOURCE_PRIORITY[span.source] || 0
        const prevPri = SOURCE_PRIORITY[prev.source] || 0
        if (spanPri > prevPri) {
          result[result.length - 1] = span
        }
      }
    }
    // else prev is longer, keep it
  }

  return result
}
