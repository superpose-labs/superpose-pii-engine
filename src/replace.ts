import type { Span, MaskResult } from './types.js'

/**
 * Replace spans with typed placeholders [TYPE_N] and build entity map.
 * Spans must be non-overlapping (run mergeSpans first).
 */
export function replaceSpans(text: string, spans: Span[]): MaskResult {
  if (spans.length === 0) {
    return { obfuscatedText: text, entityMap: {} }
  }

  // Sort by start position (ascending) for placeholder numbering
  const sorted = [...spans].sort((a, b) => a.start - b.start)

  const typeCounts: Record<string, number> = {}
  const entityMap: Record<string, string> = {}
  const replacements: { start: number; end: number; placeholder: string }[] = []

  for (const span of sorted) {
    typeCounts[span.type] = (typeCounts[span.type] || 0) + 1
    const placeholder = `[${span.type}_${typeCounts[span.type]}]`
    entityMap[placeholder] = span.value
    replacements.push({ start: span.start, end: span.end, placeholder })
  }

  // Replace right-to-left to preserve offsets
  let obfuscated = text
  for (const r of replacements.reverse()) {
    obfuscated = obfuscated.slice(0, r.start) + r.placeholder + obfuscated.slice(r.end)
  }

  return { obfuscatedText: obfuscated, entityMap }
}
