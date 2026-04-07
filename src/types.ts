export type PrivacyLevel = 'minimal' | 'balanced' | 'aggressive'

export type EntityType =
  | 'NAME' | 'ORG' | 'LOC' | 'EMAIL' | 'PHONE' | 'SSN' | 'MONEY'
  | 'DATE' | 'TIME' | 'IP' | 'KEY' | 'CARD' | 'ACCOUNT' | 'URL'
  | 'TERM' | 'ADDRESS' | 'PATH' | 'ID' | 'ENT'

export interface Span {
  value: string
  start: number
  end: number
  type: EntityType
  source: 'regex' | 'gliner' | 'nltagger' | 'bert-ner'
  score: number
}

export interface MaskResult {
  obfuscatedText: string
  entityMap: Record<string, string>
}

export interface EngineOptions {
  /** Enable GLiNER NER model (default: false, regex-only) */
  useGliner?: boolean
  /** GLiNER model path on HuggingFace (default: 'onnx-community/gliner_multi_pii-v1') */
  glinerModelPath?: string
  /** GLiNER confidence threshold (default: 0.3) */
  glinerThreshold?: number
  /** ONNX execution provider for GLiNER (default: 'cpu') */
  glinerExecutionProvider?: string
  /** Path to a local ONNX model file (skips download) */
  glinerOnnxPath?: string
  /** Enable Apple NLTagger + NSDataDetector (macOS/iOS only, default: false) */
  useNltagger?: boolean
  /** Absolute path to the nltagger Swift CLI binary (Node.js bridge) */
  nltaggerBinPath?: string
  /** Enable BERT-NER token classifier via @huggingface/transformers (default: false) */
  useBertNer?: boolean
  /** HuggingFace model id (default: 'Xenova/bert-base-NER') */
  bertNerModelPath?: string
  /** ONNX dtype: 'fp32' | 'fp16' | 'q8' | 'int8' | 'q4' | 'q4f16' | 'bnb4' (default: 'q4f16') */
  bertNerDtype?: string
  /** Device backend: 'wasm' | 'webgpu' | 'cpu' (default: 'wasm') */
  bertNerDevice?: string
  /** Confidence threshold (default: 0.5) */
  bertNerThreshold?: number
  /**
   * Override the transformers.js remote host. When set, model files are
   * fetched from this URL instead of the HuggingFace Hub. The bucket layout
   * must mirror a HF repo: <host>/<modelPath>/(config.json|tokenizer.json|onnx/model_*.onnx)
   */
  bertNerRemoteHost?: string
  /** Path template appended to remoteHost (default: '{model}'). */
  bertNerRemotePathTemplate?: string
  /**
   * Override the URL prefix where ORT Runtime Web .wasm / .mjs files are
   * fetched from. transformers.js defaults to a JSDelivr CDN; self-hosting
   * the files makes the load deterministic and removes the runtime dep on
   * an external CDN. Trailing slash required (matches ORT-Web convention).
   * Example: 'https://my-cdn.example.com/onnxruntime-web/1.19.2/'
   */
  bertNerWasmPaths?: string
}
