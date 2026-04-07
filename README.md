# Superpose PII Engine

> ## ⚠️ Important: Apple NLTagger backend does NOT run in any web browser
>
> The NLTagger backend uses Apple's `NaturalLanguage` framework, which is **only callable from native Swift/Objective-C code**. It does **not** work in:
>
> - **Mobile Safari on iOS / iPadOS** (or any iOS browser — they all use WebKit, which has no NLTagger JS binding)
> - **Safari on macOS**
> - **Chrome / Firefox / Edge / Brave on any platform**
> - **PWAs / "Add to Home Screen"** apps on iOS
> - **Electron apps** (Chromium-based, no native binding)
>
> Apple does not expose `NLTagger` to JavaScript on any platform, and an Apple Developer account does not unlock new browser APIs.
>
> ### Where the NLTagger backend *does* work
>
> - **Native iOS / iPadOS apps** that embed a `WKWebView` and register a `webkit.messageHandlers` bridge
> - **Native macOS apps** (SwiftUI / AppKit) that call the engine directly from Swift
> - **Tauri 2 / Capacitor desktop & mobile shells** when wired up to a Swift sidecar or plugin
> - **Node.js on macOS** (for evaluation/dev) via the Swift CLI bridge in `superpose-eval`
>
> ### If you are shipping to web browsers
>
> Use **GLiNER** (`useGliner: true`) on **desktop browsers** — best accuracy, runs via ONNX Runtime Web (WASM/WebGPU). The q4f16 ONNX is 472 MB, which is fine on desktop but exceeds iOS Safari's Wasm memory ceiling.
>
> Use **BERT-base-NER** (`useBertNer: true`) on **iOS Safari and other mobile browsers** — only ~94 MB at q4f16, the only browser backend that fits on iPhone today. Lower mask-recall than GLiNER but ~100% keep precision at balanced/aggressive levels.
>
> ---

A PII (Personally Identifiable Information) detection and masking engine. Runs entirely client-side — no data ever leaves the user's device when using the GLiNER (browser/Node) or NLTagger (native Apple) backends.

Superpose PII Engine powers the privacy layer in [Superpose](https://superpose.us), replacing sensitive information with typed placeholders (`[NAME_1]`, `[PHONE_1]`, etc.) before text is sent to any AI model, then restoring them in the response.

## How It Works

```
User input                          AI sees                              User sees
─────────────                       ───────                              ─────────
"Call Dr. Sarah Chen     mask()     "Call [NAME_1]            AI          "Call Dr. Sarah Chen
 at 415-555-0199"       ──────►     at [PHONE_1]"          ──────►        at 415-555-0199,
                                                          reconstruct()   here's the info..."
```

Detection layers run on the original text. The regex layer is always on; one of three ML backends can be enabled depending on the deployment target:

1. **Regex** (always on) — catches structured PII with near-perfect accuracy: emails, phones, SSNs, credit cards, API keys, money amounts, IPs, URLs, dates
2. **GLiNER** (optional, ~1.1 GB ONNX / 472 MB q4f16) — a zero-shot NER model that catches names, organizations, locations, and other context-dependent entities. **Best accuracy.** Runs in browser via ONNX Runtime Web (WASM/WebGPU) or in Node.js. Recommended for desktop browsers and servers where the memory headroom exists.
3. **BERT-base-NER** (optional, ~94 MB q4f16) — `Xenova/bert-base-NER` (dslim/bert-base-NER fine-tuned on CoNLL-2003) loaded via `@huggingface/transformers`. **The only option that fits in iOS Safari's ~256 MB Wasm memory ceiling.** Detects 4 entity classes (PER / LOC / ORG / MISC) → mapped to NAME / LOC / ORG. Use on mobile browsers; combine with the regex layer for everything structured.
4. **Apple NLTagger** (optional, **0 MB**) — uses the built-in `NaturalLanguage.NLTagger` + `NSDataDetector`. **Native Apple code only** — works in iOS / iPadOS / macOS apps that link `NaturalLanguage`, or in Node.js on macOS via the Swift CLI bridge for evaluation. **Does not work in any web browser**, including Safari on macOS or iOS. See the warning at the top of this README.

Results are merged, filtered by privacy level, and replaced with placeholders. Reconstruction is a simple deterministic string replacement — no model needed.

### Backend comparison (1,000-sample evaluation)

| Backend | Pass rate | Macro F1 | Aggressive F1 | Keep precision | Binary cost | Where it runs |
|---------|----------:|---------:|--------------:|---------------:|------------:|---|
| Regex + GLiNER | **93.87%** | **54.3%** | 56.6% | ~50% | ~1.1 GB / 472 MB q4f16 | Desktop browser, Node |
| Regex + BERT-base-NER | 76.23% | 38.8% | **63.2%** | **100% / 100%** (bal/agg) | **~94 MB q4f16** | **iOS Safari**, desktop browser, Node |
| Regex + NLTagger (macOS/iOS) | 79.27% | 39.3% | **63.2%** | 96–98% | **0 MB** | Native Apple apps only |
| Regex only | TBD | TBD | TBD | TBD | 0 MB | Anywhere |

GLiNER wins on overall recall and is the right desktop default. BERT-base-NER is the only browser-shippable option for iOS (GLiNER's q4f16 at 472 MB still exceeds iOS Safari's Wasm memory ceiling). NLTagger wins on safety and ships for free on Apple devices but cannot be used from a browser.

## Install

```bash
npm install @superpose/pii-engine

# Optional: GLiNER for desktop browsers / Node — best accuracy
npm install gliner

# Optional: BERT-base-NER via transformers.js — only browser-shippable option for iOS
npm install @huggingface/transformers

# Optional: build the Apple NLTagger Swift CLI bridge (macOS/iOS native only)
# See "Apple NLTagger Backend (iOS / macOS)" below.
```

## Quick Start

```typescript
import { mask, reconstruct } from '@superpose/pii-engine'

// Regex-only (no GLiNER, zero dependencies, instant)
const result = await mask(
  'Email sarah.chen@acme.com or call 415-555-0199, SSN 123-45-6789',
  'balanced'
)

console.log(result.obfuscatedText)
// → "Email [EMAIL_1] or call [PHONE_1], SSN [SSN_1]"

console.log(result.entityMap)
// → { "[EMAIL_1]": "sarah.chen@acme.com", "[PHONE_1]": "415-555-0199", "[SSN_1]": "123-45-6789" }

// After AI responds, restore placeholders
const aiResponse = 'I found the contact info: [EMAIL_1], phone [PHONE_1].'
const restored = reconstruct(aiResponse, result.entityMap)
// → "I found the contact info: sarah.chen@acme.com, phone 415-555-0199."
```

### With GLiNER (for names, orgs, locations — browser/server/desktop)

```typescript
const result = await mask(
  'Schedule call with Dr. Sarah Chen at Chevron, 415-555-0199',
  'balanced',
  { useGliner: true }
)

console.log(result.obfuscatedText)
// → "Schedule call with [NAME_1] at [ORG_1], [PHONE_1]"
```

### With BERT-base-NER (browser/Node — fits in iOS Safari)

```typescript
const result = await mask(
  'Schedule call with Dr. Sarah Chen at Chevron in Houston, 415-555-0199',
  'aggressive',
  {
    useBertNer: true,
    bertNerDtype: 'q4f16',          // ~94 MB; use 'fp32' in Node if onnxruntime-node has q4f16 issues
    bertNerThreshold: 0.7,           // default
  }
)
```

To self-host the model files (recommended — avoids HF hub at runtime), set the transformers.js env before calling `mask()`:

```typescript
import { env } from '@huggingface/transformers'
env.allowLocalModels = false
env.allowRemoteModels = true
env.remoteHost = 'https://my-cdn.example.com'
env.remotePathTemplate = '{model}'
// Then call mask() with bertNerModelPath: 'bert-ner/Xenova/bert-base-NER'
```

Mirror the HuggingFace repo layout under your CDN: `<host>/<modelPath>/(config.json|tokenizer.json|tokenizer_config.json|special_tokens_map.json|vocab.txt|onnx/model_q4f16.onnx)`.

### With Apple NLTagger (macOS / iOS native only — zero binary cost)

```typescript
const result = await mask(
  'Schedule call with Dr. Sarah Chen at Chevron, 415-555-0199',
  'balanced',
  {
    useNltagger: true,
    nltaggerBinPath: '/path/to/nltagger-bin', // Swift CLI bridge (Node.js only)
  }
)

console.log(result.obfuscatedText)
// → "Schedule call with [NAME_1] at [ORG_1], [PHONE_1]"
```

In a native Swift app, port the regex layer to Swift and call `NLTagger` + `NSDataDetector` directly — no subprocess, no Node.js, zero added binary on top of the OS.

## Privacy Levels

The engine supports three privacy levels that control which entity types get masked:

### `minimal` — secrets only

Masks only critical credentials. Everything else stays visible.

| Masked | Kept as-is |
|--------|-----------|
| API keys (`sk-...`, `ghp_...`, `AKIA...`) | Names, orgs |
| Passwords | Emails, phones |
| SSNs (`123-45-6789`) | Money amounts |
| Credit card numbers | Dates, locations |
| Bank account/routing numbers | Everything else |

### `balanced` — standard PII

Masks identifying information while preserving generic context.

| Masked | Kept as-is |
|--------|-----------|
| Everything from minimal | Generic nouns (contract, meeting, report) |
| Person names | Job titles (CEO, VP) |
| Organizations | Service names (Zoom, Slack) |
| Email addresses | Dates |
| Phone numbers | Locations |
| Money amounts | |

### `aggressive` — maximum privacy

Masks nearly all identifying or contextual information.

| Masked | Kept as-is |
|--------|-----------|
| Everything from balanced | Verbs, prepositions, articles |
| Dates and times | Generic nouns (contract, meeting, patient) |
| Locations and addresses | |
| IP addresses and URLs | |
| Domain-specific terms | |
| Identifiers and file paths | |

## Browser Integration

The engine is designed to run in the browser. The regex layer has zero dependencies and works everywhere. GLiNER runs via ONNX Runtime Web (WASM or WebGPU).

### Regex-only (simplest, ~0ms latency)

```html
<script type="module">
  import { mask, reconstruct } from '@superpose/pii-engine'

  const input = document.getElementById('user-input').value
  const { obfuscatedText, entityMap } = await mask(input, 'balanced')

  // Send obfuscatedText to your AI backend
  const aiResponse = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message: obfuscatedText })
  }).then(r => r.json())

  // Restore PII in the response
  const restored = reconstruct(aiResponse.message, entityMap)
  document.getElementById('output').textContent = restored
</script>
```

### With GLiNER in the browser

```typescript
import { mask } from '@superpose/pii-engine'

// First call downloads and caches the ONNX model (~200MB)
// Subsequent calls are fast (~50-200ms)
const result = await mask(userInput, 'balanced', {
  useGliner: true,
  glinerModelPath: 'onnx-community/gliner_multi_pii-v1',
  glinerExecutionProvider: 'webgpu', // or 'wasm' for wider support
})
```

For production, pre-download the ONNX model and serve it from your own CDN:

```typescript
const result = await mask(userInput, 'balanced', {
  useGliner: true,
  glinerOnnxPath: '/models/gliner-pii/model.onnx',
  glinerExecutionProvider: 'webgpu',
})
```

## API Reference

### `mask(text, level, options?)`

Detect and mask PII in text.

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | `string` | Input text to mask |
| `level` | `'minimal' \| 'balanced' \| 'aggressive'` | Privacy level |
| `options.useGliner` | `boolean` | Enable GLiNER NER model (default: `false`) |
| `options.glinerModelPath` | `string` | HuggingFace model ID (default: `'onnx-community/gliner_multi_pii-v1'`) |
| `options.glinerThreshold` | `number` | Confidence threshold 0-1 (default: `0.3`) |
| `options.glinerExecutionProvider` | `string` | ONNX provider: `'cpu'`, `'wasm'`, `'webgpu'` (default: `'cpu'`) |
| `options.glinerOnnxPath` | `string` | Path to local ONNX file (skips HuggingFace download) |
| `options.useBertNer` | `boolean` | Enable BERT-base-NER via `@huggingface/transformers` (default: `false`) |
| `options.bertNerModelPath` | `string` | Model id (default: `'Xenova/bert-base-NER'`) |
| `options.bertNerDtype` | `string` | ONNX dtype: `'fp32' \| 'fp16' \| 'q8' \| 'int8' \| 'q4' \| 'q4f16' \| 'bnb4'` (default: `'q4f16'`) |
| `options.bertNerDevice` | `string` | Device: `'wasm' \| 'webgpu' \| 'cpu'` (default: `'wasm'` in browser, `'cpu'` in Node) |
| `options.bertNerThreshold` | `number` | Confidence threshold 0-1 (default: `0.7`) |
| `options.useNltagger` | `boolean` | Enable Apple NLTagger backend (macOS/iOS only, default: `false`) |
| `options.nltaggerBinPath` | `string` | Absolute path to the nltagger Swift CLI binary |

Returns `Promise<MaskResult>`:

```typescript
{
  obfuscatedText: string        // Text with placeholders
  entityMap: Record<string, string>  // { "[NAME_1]": "Dr. Sarah Chen", ... }
}
```

### `reconstruct(text, entityMap)`

Restore placeholders to original values. Synchronous, no model needed.

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | `string` | Text containing `[TYPE_N]` placeholders |
| `entityMap` | `Record<string, string>` | Map from `mask()` output |

Returns `string` with placeholders replaced.

### Lower-level exports

For custom pipelines, individual components are exported:

```typescript
import {
  detectRegex,      // (text: string) => Span[]
  mergeSpans,       // (spans: Span[]) => Span[]
  replaceSpans,     // (text: string, spans: Span[]) => MaskResult
  LEVEL_TYPES,      // { minimal: Set<EntityType>, balanced: ..., aggressive: ... }
  GLINER_LABELS,    // Entity labels sent to GLiNER per level
} from '@superpose/pii-engine'
```

## Entity Types

| Type | Example | Detected by | Masked at |
|------|---------|-------------|-----------|
| `NAME` | Dr. Sarah Chen | GLiNER, BERT-NER, NLTagger | balanced+ |
| `ORG` | Chevron, Goldman Sachs | GLiNER, BERT-NER, NLTagger | balanced+ |
| `EMAIL` | sarah@acme.com | Regex, NLTagger | balanced+ |
| `PHONE` | 415-555-0199 | Regex, NLTagger | balanced+ |
| `MONEY` | $12M, $4,500.00 | Regex | balanced+ |
| `SSN` | 123-45-6789 | Regex | minimal+ |
| `CARD` | 4111-1111-1111-1111 | Regex | minimal+ |
| `KEY` | ghp_aBcDeFg..., sk-... | Regex | minimal+ |
| `ACCOUNT` | routing/account numbers | Regex | minimal+ |
| `IP` | 192.168.1.100 | Regex | aggressive |
| `URL` | https://example.com | Regex, NLTagger | aggressive |
| `DATE` | 2025-03-15, March 15 | Regex, NLTagger | aggressive |
| `LOC` | New York, Austin TX | GLiNER, BERT-NER, NLTagger | aggressive |
| `ADDRESS` | 123 Main St | GLiNER, NLTagger | aggressive |
| `TERM` | drilling, laparoscopic | GLiNER | aggressive |

## Development

```bash
git clone https://github.com/superpose-labs/superpose-pii-engine.git
cd superpose-pii-engine
npm install
npm test        # Run 24 tests
npm run build   # Build ESM + CJS to dist/
```

## Apple NLTagger Backend (iOS / macOS)

The NLTagger backend uses Apple's built-in `NaturalLanguage` framework — already on every iOS and macOS device — to detect entities at **zero binary cost**.

What it detects:

| Source | Entities |
|--------|----------|
| `NLTagger(.nameType)` | `NAME`, `ORG`, `LOC` |
| `NSDataDetector` | `PHONE`, `EMAIL`, `URL`, `DATE`, `ADDRESS` |

**Node.js usage** (for evaluation, desktop apps via Electron/Tauri):

The JS detector spawns a small Swift CLI bridge that exposes NLTagger over stdin/stdout. The bridge source lives in [`superpose-eval/providers/nltagger-src/nltagger.swift`](https://github.com/superpose-labs/superpose-eval/blob/main/providers/nltagger-src/nltagger.swift). Build it with:

```bash
swiftc -O nltagger.swift -o nltagger-bin
```

Then pass the absolute path:

```typescript
await mask(text, 'balanced', {
  useNltagger: true,
  nltaggerBinPath: '/abs/path/to/nltagger-bin',
})
```

**Native Swift usage** (recommended for iOS/macOS apps):

In a real Swift app, skip the Node bridge entirely:

1. Port `src/detectors/regex.ts` to Swift (regex is portable; the Swift `NSRegularExpression` API works fine).
2. Port `src/merge.ts`, `src/levels.ts`, `src/replace.ts` to Swift (pure functions, ~100 LOC each).
3. Call `NLTagger(tagSchemes: [.nameType])` and `NSDataDetector(types:)` directly to populate the same `Span` struct.
4. Run `mergeSpans` → `filterSpansByLevel` → `replaceSpans`.

The result is a fully on-device PII pipeline with **0 MB** added to the app binary, no model downloads, no network calls, and Neural Engine acceleration for the NER step on Apple Silicon.

**Performance:** 1,000 samples × 3 privacy levels = 3,000 assertions in **3m 53s** on a Mac mini (concurrency 2, including Node↔Swift subprocess overhead). Native Swift would be substantially faster.

## Architecture

```
text ──► detectRegex()  (always)                         ┐
     ├─► detectGliner()    (opt, ~1.1 GB / 472 MB q4f16) ─┤
     ├─► detectBertNer()   (opt, ~94 MB q4f16)            ┤
     └─► detectNltagger()  (opt, 0 MB, native Apple only) ┤
                                                          │
                              ┌───────────────────────────┘
                              ▼
                       mergeSpans()  ──►  filterByLevel()  ──►  replaceSpans()
                              │                                       │
                       dedup overlaps                      right-to-left replace
                       (longer wins)                       build entityMap
                              │                                       │
                              └───────────────────────────────────────┴──► { obfuscatedText, entityMap }
```

The three NER backends are mutually exclusive in practice — pick the one that matches your deployment target:

| Target | Recommended backend |
|---|---|
| Desktop browser | GLiNER (best accuracy) |
| Server / Node.js | GLiNER (or NLTagger via Swift CLI on macOS) |
| **iOS Safari / mobile browser** | **BERT-base-NER** (only one that fits) |
| Native iOS / macOS app | NLTagger (zero binary cost) |

The regex layer is shared by all three.

## License

MIT
