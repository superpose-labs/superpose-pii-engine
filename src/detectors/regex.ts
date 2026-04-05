import type { EntityType, Span } from '../types.js'

interface Pattern {
  type: EntityType
  regex: RegExp
}

const PATTERNS: Pattern[] = [
  // Email — must come before other patterns that might partial-match
  { type: 'EMAIL', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },

  // Phone — international and US formats
  { type: 'PHONE', regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },

  // SSN
  { type: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g },

  // Credit card — 13-19 digits with optional separators
  { type: 'CARD', regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{1,7}\b/g },

  // API keys / secrets — common prefixes + long alphanumeric strings
  { type: 'KEY', regex: /\b(?:sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{20,}|xoxb-[a-zA-Z0-9-]+|glpat-[a-zA-Z0-9_-]{20,})\b/g },
  // Generic long hex/base64 secrets (40+ chars)
  { type: 'KEY', regex: /\b[a-fA-F0-9]{40,}\b/g },

  // Money — dollar amounts
  { type: 'MONEY', regex: /\$[\d,]+(?:\.\d{1,2})?(?:[KMBTkmbt](?:illion)?)?/g },

  // IP addresses (v4)
  { type: 'IP', regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g },

  // URLs
  { type: 'URL', regex: /https?:\/\/[^\s<>"{}|\\^`[\]]+/g },

  // Dates — multiple formats
  { type: 'DATE', regex: /\b\d{4}[-/]\d{2}[-/]\d{2}\b/g },
  { type: 'DATE', regex: /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g },
  { type: 'DATE', regex: /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:[,\s]+\d{4})?\b/gi },

  // Bank account / routing numbers — 8-17 digit sequences preceded by context words
  { type: 'ACCOUNT', regex: /(?:account|acct|routing)[\s#:]*\d{8,17}\b/gi },
]

export function detectRegex(text: string): Span[] {
  const spans: Span[] = []

  for (const pattern of PATTERNS) {
    // Reset regex lastIndex for each call
    pattern.regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.regex.exec(text)) !== null) {
      spans.push({
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        type: pattern.type,
        source: 'regex',
        score: 1.0, // regex matches are high confidence
      })
    }
  }

  return spans
}
