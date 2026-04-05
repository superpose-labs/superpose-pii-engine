# Superpose PII Engine

A browser-compatible PII (Personally Identifiable Information) detection and masking engine. Runs entirely client-side — no data ever leaves the user's device.

Superpose PII Engine powers the privacy layer in [Superpose](https://superpose.us), replacing sensitive information with typed placeholders (`[NAME_1]`, `[PHONE_1]`, etc.) before text is sent to any AI model, then restoring them in the response.

## How It Works

```
User input                          AI sees                              User sees
─────────────                       ───────                              ─────────
"Call Dr. Sarah Chen     mask()     "Call [NAME_1]            AI          "Call Dr. Sarah Chen
 at 415-555-0199"       ──────►     at [PHONE_1]"          ──────►        at 415-555-0199,
                                                          reconstruct()   here's the info..."
```

Two detection layers run in parallel on the original text:

1. **Regex** — catches structured PII with near-perfect accuracy: emails, phones, SSNs, credit cards, API keys, money amounts, IPs, URLs, dates
2. **GLiNER** (optional) — a zero-shot NER model that catches names, organizations, locations, and other context-dependent entities

Results are merged, filtered by privacy level, and replaced with placeholders. Reconstruction is a simple deterministic string replacement — no model needed.

## Install

```bash
npm install @anthropic/superpose-pii-engine

# Optional: install GLiNER for name/org/location detection
npm install gliner
```

## Quick Start

```typescript
import { mask, reconstruct } from '@anthropic/superpose-pii-engine'

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

### With GLiNER (for names, orgs, locations)

```typescript
const result = await mask(
  'Schedule call with Dr. Sarah Chen at Chevron, 415-555-0199',
  'balanced',
  { useGliner: true }
)

console.log(result.obfuscatedText)
// → "Schedule call with [NAME_1] at [ORG_1], [PHONE_1]"
```

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
  import { mask, reconstruct } from '@anthropic/superpose-pii-engine'

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
import { mask } from '@anthropic/superpose-pii-engine'

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
} from '@anthropic/superpose-pii-engine'
```

## Entity Types

| Type | Example | Detected by | Masked at |
|------|---------|-------------|-----------|
| `NAME` | Dr. Sarah Chen | GLiNER | balanced+ |
| `ORG` | Chevron, Goldman Sachs | GLiNER | balanced+ |
| `EMAIL` | sarah@acme.com | Regex | balanced+ |
| `PHONE` | 415-555-0199 | Regex | balanced+ |
| `MONEY` | $12M, $4,500.00 | Regex | balanced+ |
| `SSN` | 123-45-6789 | Regex | minimal+ |
| `CARD` | 4111-1111-1111-1111 | Regex | minimal+ |
| `KEY` | ghp_aBcDeFg..., sk-... | Regex | minimal+ |
| `ACCOUNT` | routing/account numbers | Regex | minimal+ |
| `IP` | 192.168.1.100 | Regex | aggressive |
| `URL` | https://example.com | Regex | aggressive |
| `DATE` | 2025-03-15, March 15 | Regex | aggressive |
| `LOC` | New York, Austin TX | GLiNER | aggressive |
| `ADDRESS` | 123 Main St | GLiNER | aggressive |
| `TERM` | drilling, laparoscopic | GLiNER | aggressive |

## Development

```bash
git clone https://github.com/superpose-labs/superpose-pii-engine.git
cd superpose-pii-engine
npm install
npm test        # Run 24 tests
npm run build   # Build ESM + CJS to dist/
```

## Architecture

```
text ──► detectRegex() ──────────► spans[] ──┐
     └─► detectGliner() (opt) ──► spans[] ──┤
                                             ├──► mergeSpans() ──► filterByLevel() ──► replaceSpans()
                                             │         │                                     │
                                             │    dedup overlaps                    right-to-left replace
                                             │    (longer wins)                     build entityMap
                                             │                                           │
                                             └───────────────────────────────────► { obfuscatedText, entityMap }
```

## License

MIT
