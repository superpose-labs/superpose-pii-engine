import type { Span, PrivacyLevel, EngineOptions } from '../types.js'

/**
 * BERT-NER detector — small token-classification model from Xenova/bert-base-NER
 * (dslim/bert-base-NER fine-tuned on CoNLL-2003).
 *
 * Runs in browser (transformers.js / ONNX Runtime Web) and Node.js. Designed
 * for the iOS Safari constraint where GLiNER's 900 MB model is unloadable —
 * the q4f16 ONNX variant is ~94 MB on disk and fits inside iOS Safari's
 * ~256 MB Wasm memory ceiling.
 *
 * Coverage is intentionally narrow:
 *   - PER  → NAME
 *   - ORG  → ORG
 *   - LOC  → LOC
 *   - MISC → ENT (rarely useful, dropped at filter time)
 *
 * Email / phone / SSN / credit-card / API-key / money / date / IP / URL all
 * come from the regex layer.
 */

interface CachedPipeline {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipeline: (text: string) => Promise<RawToken[]>
  modelId: string
  dtype: string
}

interface RawToken {
  entity: string // 'B-PER' | 'I-PER' | ... | 'O'
  score: number
  word: string
  index?: number
  start?: number
  end?: number
}

let cached: CachedPipeline | null = null
let initPromise: Promise<CachedPipeline> | null = null

const LABEL_TO_TYPE: Record<string, Span['type']> = {
  PER: 'NAME',
  ORG: 'ORG',
  LOC: 'LOC',
  MISC: 'ENT',
}

async function getPipeline(
  modelId: string,
  dtype: string,
  device: string,
  remoteHost?: string,
  remotePathTemplate?: string,
): Promise<CachedPipeline> {
  if (cached && cached.modelId === modelId && cached.dtype === dtype) {
    return cached
  }
  if (initPromise) return initPromise

  initPromise = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformers: any = await import('@huggingface/transformers')
    const pipeline = transformers.pipeline || transformers.default?.pipeline
    if (!pipeline) {
      throw new Error(
        '@huggingface/transformers is installed but pipeline() export was not found',
      )
    }
    // Configure the env on the SAME transformers module instance the
    // pipeline() call below will use. Setting env from outside this module
    // (e.g. in a Web Worker that imports transformers separately) does not
    // reliably reach this scope when bundlers split chunks.
    if (remoteHost && transformers.env) {
      transformers.env.allowLocalModels = false
      transformers.env.allowRemoteModels = true
      transformers.env.remoteHost = remoteHost
      transformers.env.remotePathTemplate = remotePathTemplate || '{model}'
    }
    const ner = await pipeline('token-classification', modelId, { dtype, device })
    const wrapped = async (text: string): Promise<RawToken[]> => {
      const out = await ner(text)
      return Array.isArray(out) ? (out as RawToken[]) : []
    }
    cached = { pipeline: wrapped, modelId, dtype }
    return cached
  })()
  return initPromise
}

/**
 * Walks token-level NER output, groups B-/I- runs into entity strings, and
 * resolves their character positions in the original text.
 *
 * transformers.js doesn't reliably surface `aggregation_strategy` for this
 * model variant, so we aggregate manually. Subword pieces are joined by
 * stripping the `##` continuation marker.
 */
function aggregate(tokens: RawToken[], text: string, threshold: number): Span[] {
  const spans: Span[] = []
  let buf: { label: string; pieces: string[]; score: number; count: number } | null = null
  let cursor = 0 // last position we matched in `text`

  const flush = () => {
    if (!buf) return
    const avgScore = buf.score / buf.count
    if (avgScore < threshold) {
      buf = null
      return
    }
    const mapped = LABEL_TO_TYPE[buf.label]
    if (!mapped || mapped === 'ENT') {
      buf = null
      return
    }

    // Reconstruct the word: join subword pieces, dropping `##` prefixes.
    const word = buf.pieces
      .map((p, i) => (i === 0 ? p : p.startsWith('##') ? p.slice(2) : ' ' + p))
      .join('')
      .trim()

    if (word && word.length >= 3) {
      // Find the word starting at or after the current cursor.
      const idx = text.indexOf(word, cursor)
      if (idx !== -1) {
        spans.push({
          value: word,
          start: idx,
          end: idx + word.length,
          type: mapped,
          source: 'bert-ner',
          score: avgScore,
        })
        cursor = idx + word.length
      }
    }
    buf = null
  }

  for (const tok of tokens) {
    const ent = tok.entity || 'O'
    if (ent === 'O' || !ent) {
      flush()
      continue
    }
    const m = /^([BI])-(.+)$/.exec(ent)
    if (!m) {
      flush()
      continue
    }
    const [, prefix, label] = m

    if (prefix === 'B' || !buf || buf.label !== label) {
      flush()
      buf = { label, pieces: [tok.word], score: tok.score, count: 1 }
    } else {
      buf.pieces.push(tok.word)
      buf.score += tok.score
      buf.count += 1
    }
  }
  flush()
  return spans
}

export async function detectBertNer(
  text: string,
  _level: PrivacyLevel,
  options: EngineOptions = {},
): Promise<Span[]> {
  const modelId = options.bertNerModelPath || 'Xenova/bert-base-NER'
  const dtype = options.bertNerDtype || 'q4f16'
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
  const device = options.bertNerDevice || (isBrowser ? 'wasm' : 'cpu')
  // Default 0.7: high enough to filter low-confidence noise, low enough to
  // catch borderline real entities. Combined with the 3-char minimum span
  // length below, this rejects subword-tokenization fragments like "SS"
  // (from "SSN" → "SS" + "##N" → mis-tagged at 0.99).
  const threshold = options.bertNerThreshold ?? 0.7

  const { pipeline } = await getPipeline(
    modelId,
    dtype,
    device,
    options.bertNerRemoteHost,
    options.bertNerRemotePathTemplate,
  )
  const tokens = await pipeline(text)

  // Fast path: if the runtime did surface start/end, prefer that.
  const haveOffsets = tokens.some((t) => typeof t.start === 'number' && typeof t.end === 'number')
  if (haveOffsets) {
    const spans: Span[] = []
    for (const tok of tokens) {
      if (tok.score < threshold) continue
      const rawLabel = (tok.entity || '').replace(/^[BI]-/, '')
      const mapped = LABEL_TO_TYPE[rawLabel]
      if (!mapped || mapped === 'ENT') continue
      if (typeof tok.start !== 'number' || typeof tok.end !== 'number') continue
      const value = text.slice(tok.start, tok.end)
      if (!value) continue
      spans.push({
        value,
        start: tok.start,
        end: tok.end,
        type: mapped,
        source: 'bert-ner',
        score: tok.score,
      })
    }
    return spans
  }

  // Slow path: aggregate B-/I- runs and re-index by string match.
  return aggregate(tokens, text, threshold)
}
