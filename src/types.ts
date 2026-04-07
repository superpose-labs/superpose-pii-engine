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
  source: 'regex' | 'gliner' | 'nltagger'
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
}
