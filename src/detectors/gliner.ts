import type { Span, PrivacyLevel, EngineOptions } from '../types.js'
import { GLINER_LABELS, GLINER_LABEL_TO_TYPE } from '../levels.js'

let glinerInstance: any = null
let glinerModelId: string | null = null

export async function detectGliner(
  text: string,
  level: PrivacyLevel,
  options: EngineOptions = {},
): Promise<Span[]> {
  const modelPath = options.glinerModelPath || 'onnx-community/gliner_multi_pii-v1'
  const threshold = options.glinerThreshold ?? 0.3
  const executionProvider = options.glinerExecutionProvider || 'cpu'
  const onnxPath = options.glinerOnnxPath

  if (!glinerInstance || glinerModelId !== modelPath) {
    // Try gliner/node first (Node.js), fall back to gliner (browser)
    let Gliner: any
    try {
      const mod = await import('gliner/node')
      Gliner = mod.Gliner || mod.default?.Gliner || mod.default
    } catch {
      const mod = await import('gliner')
      Gliner = mod.Gliner || mod.default?.Gliner || mod.default
    }

    const onnxSettings: any = { executionProvider }
    if (onnxPath) {
      onnxSettings.modelPath = onnxPath
    } else {
      // In Node, attempt to download and cache the model
      onnxSettings.modelPath = await resolveOnnxPath(modelPath)
    }

    glinerInstance = new Gliner({
      tokenizerPath: modelPath,
      onnxSettings,
      maxWidth: 12,
    })
    await glinerInstance.initialize()
    glinerModelId = modelPath
  }

  const entities = GLINER_LABELS[level] || GLINER_LABELS.balanced
  const results = await glinerInstance.inference({
    texts: [text],
    entities,
    threshold,
    flatNer: false,
    multiLabel: false,
  })

  const raw = results[0] || []
  return raw.map((r: any) => ({
    value: r.spanText || text.slice(r.start, r.end),
    start: r.start,
    end: r.end,
    type: GLINER_LABEL_TO_TYPE[r.label] || 'ENT',
    source: 'gliner' as const,
    score: r.score ?? 0.5,
  }))
}

/** Download ONNX model from HuggingFace and cache locally (Node.js only) */
async function resolveOnnxPath(modelId: string): Promise<string> {
  // Dynamic imports for Node-only modules
  const fs = await import('fs')
  const path = await import('path')
  const https = await import('https')

  const cacheDir = path.join(process.cwd(), '.gliner-cache')
  const slug = modelId.replace(/\//g, '--')
  const onnxPath = path.join(cacheDir, slug, 'model.onnx')

  if (fs.existsSync(onnxPath)) return onnxPath

  console.log(`[pii-engine] Downloading ONNX model: ${modelId}`)
  const url = `https://huggingface.co/${modelId}/resolve/main/onnx/model.onnx`

  await new Promise<void>((resolve, reject) => {
    const dir = path.dirname(onnxPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const file = fs.createWriteStream(onnxPath)
    const get = (u: string) => {
      https.get(u, (res: any) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
      }).on('error', reject)
    }
    get(url)
  })

  console.log(`[pii-engine] Cached: ${onnxPath}`)
  return onnxPath
}
