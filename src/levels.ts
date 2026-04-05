import type { EntityType, PrivacyLevel } from './types.js'

/** Which entity types to mask at each privacy level */
export const LEVEL_TYPES: Record<PrivacyLevel, Set<EntityType>> = {
  minimal: new Set(['KEY', 'SSN', 'CARD', 'ACCOUNT']),
  balanced: new Set(['KEY', 'SSN', 'CARD', 'ACCOUNT', 'NAME', 'ORG', 'EMAIL', 'PHONE', 'MONEY']),
  aggressive: new Set([
    'KEY', 'SSN', 'CARD', 'ACCOUNT', 'NAME', 'ORG', 'EMAIL', 'PHONE', 'MONEY',
    'DATE', 'TIME', 'LOC', 'ADDRESS', 'IP', 'URL', 'TERM', 'PATH', 'ID',
  ]),
}

/** GLiNER entity labels to request per privacy level */
export const GLINER_LABELS: Record<PrivacyLevel, string[]> = {
  minimal: [
    'api key', 'password', 'social security number',
    'credit card number', 'bank account number', 'routing number', 'secret key',
  ],
  balanced: [
    'person name', 'organization', 'email address', 'phone number', 'money amount',
    'api key', 'password', 'social security number',
    'credit card number', 'bank account number', 'routing number', 'secret key',
  ],
  aggressive: [
    'person name', 'organization', 'email address', 'phone number', 'money amount',
    'api key', 'password', 'social security number',
    'credit card number', 'bank account number', 'routing number', 'secret key',
    'date', 'time', 'location', 'address', 'ip address', 'url',
    'domain term', 'file path', 'identifier',
  ],
}

/** Map GLiNER label strings → our EntityType */
export const GLINER_LABEL_TO_TYPE: Record<string, EntityType> = {
  'person name': 'NAME',
  'organization': 'ORG',
  'email address': 'EMAIL',
  'phone number': 'PHONE',
  'money amount': 'MONEY',
  'api key': 'KEY',
  'password': 'KEY',
  'secret key': 'KEY',
  'social security number': 'SSN',
  'credit card number': 'CARD',
  'bank account number': 'ACCOUNT',
  'routing number': 'ACCOUNT',
  'date': 'DATE',
  'time': 'TIME',
  'location': 'LOC',
  'address': 'ADDRESS',
  'ip address': 'IP',
  'url': 'URL',
  'domain term': 'TERM',
  'file path': 'PATH',
  'identifier': 'ID',
}

export function filterSpansByLevel(spans: import('./types.js').Span[], level: PrivacyLevel) {
  const allowed = LEVEL_TYPES[level]
  return spans.filter(s => allowed.has(s.type))
}
