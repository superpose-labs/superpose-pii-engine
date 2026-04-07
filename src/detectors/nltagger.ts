import type { Span, PrivacyLevel, EngineOptions } from '../types.js'

/**
 * Apple NLTagger + NSDataDetector detector.
 *
 * macOS/iOS only. In Node.js this spawns a Swift CLI binary that uses the
 * NaturalLanguage framework. In a native Swift app, the same logic would be
 * called directly from the host language — this module exists so the
 * JavaScript port of pii-engine can be evaluated against the Apple stack.
 *
 * Detected entity types:
 *   - NLTagger.nameType: NAME (person), ORG (organization), LOC (place)
 *   - NSDataDetector: PHONE, EMAIL, URL, DATE, ADDRESS
 *
 * The provided binary must accept newline-delimited JSON requests
 *   {"input": "...", "level": "balanced"}
 * on stdin and respond with one JSON line:
 *   {"obfuscatedText": "...", "entityMap": {...}, "spans": [{start, end, type, value}, ...]}
 */

interface NltaggerSpan {
  start: number
  end: number
  type: string
  value: string
}

interface NltaggerResponse {
  obfuscatedText?: string
  entityMap?: Record<string, string>
  spans?: NltaggerSpan[]
  error?: string
}

const TYPE_MAP: Record<string, string> = {
  NAME: 'NAME',
  ORG: 'ORG',
  LOC: 'LOC',
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
  URL: 'URL',
  DATE: 'DATE',
  ADDRESS: 'ADDRESS',
}

async function callBinary(binPath: string, input: string, level: string): Promise<NltaggerResponse> {
  const { spawnSync } = await import('child_process')
  const req = JSON.stringify({ input, level }) + '\n'
  const res = spawnSync(binPath, [], { input: req, encoding: 'utf8' })
  if (res.status !== 0) {
    throw new Error(`nltagger exited ${res.status}: ${res.stderr}`)
  }
  const line = res.stdout.split('\n')[0]
  return JSON.parse(line) as NltaggerResponse
}

export async function detectNltagger(
  text: string,
  level: PrivacyLevel,
  options: EngineOptions = {},
): Promise<Span[]> {
  const binPath = options.nltaggerBinPath
  if (!binPath) {
    throw new Error('nltaggerBinPath is required when useNltagger is true')
  }

  const response = await callBinary(binPath, text, level)
  if (response.error) {
    throw new Error(`nltagger error: ${response.error}`)
  }

  if (Array.isArray(response.spans) && response.spans.length > 0) {
    return response.spans
      .map((s) => {
        const mappedType = TYPE_MAP[s.type] || 'ENT'
        return {
          value: s.value || text.slice(s.start, s.end),
          start: s.start,
          end: s.end,
          type: mappedType as Span['type'],
          source: 'nltagger' as const,
          score: 0.9,
        }
      })
      .filter((s) => !!s.value)
  }
  return []
}
