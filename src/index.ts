export type { PrivacyLevel, EntityType, Span, MaskResult, EngineOptions } from './types.js'
export { LEVEL_TYPES, GLINER_LABELS, GLINER_LABEL_TO_TYPE } from './levels.js'
export { detectRegex } from './detectors/regex.js'
export { mergeSpans } from './merge.js'
export { replaceSpans } from './replace.js'

import type { PrivacyLevel, MaskResult, EngineOptions, Span } from './types.js'
import { detectRegex } from './detectors/regex.js'
import { filterSpansByLevel } from './levels.js'
import { mergeSpans } from './merge.js'
import { replaceSpans } from './replace.js'

/**
 * Mask PII in text according to the specified privacy level.
 *
 * Runs regex detection (always) and optionally GLiNER NER in parallel,
 * merges results, filters by privacy level, and replaces with placeholders.
 */
export async function mask(
  text: string,
  level: PrivacyLevel,
  options: EngineOptions = {},
): Promise<MaskResult> {
  const allSpans: Span[] = []

  // Regex detection (synchronous, always available)
  const regexSpans = detectRegex(text)
  allSpans.push(...regexSpans)

  // GLiNER detection (async, optional)
  if (options.useGliner) {
    const { detectGliner } = await import('./detectors/gliner.js')
    const glinerSpans = await detectGliner(text, level, options)
    allSpans.push(...glinerSpans)
  }

  // Apple NLTagger detection (async, optional, macOS/iOS only)
  if (options.useNltagger) {
    const { detectNltagger } = await import('./detectors/nltagger.js')
    const nltaggerSpans = await detectNltagger(text, level, options)
    allSpans.push(...nltaggerSpans)
  }

  // BERT-NER detection (async, optional, browser/Node via transformers.js)
  if (options.useBertNer) {
    const { detectBertNer } = await import('./detectors/bert-ner.js')
    const bertSpans = await detectBertNer(text, level, options)
    allSpans.push(...bertSpans)
  }

  // Merge, filter by level, replace
  const merged = mergeSpans(allSpans)
  const filtered = filterSpansByLevel(merged, level)
  return replaceSpans(text, filtered)
}

/**
 * Reconstruct original text by replacing placeholders with their values.
 * Deterministic — no model needed.
 */
export function reconstruct(
  text: string,
  entityMap: Record<string, string>,
): string {
  let result = text
  for (const [placeholder, value] of Object.entries(entityMap)) {
    result = result.replaceAll(placeholder, value)
  }
  return result
}
