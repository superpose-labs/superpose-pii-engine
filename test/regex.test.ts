import { describe, it, expect } from 'vitest'
import { detectRegex } from '../src/detectors/regex.js'

describe('regex detector', () => {
  it('detects emails', () => {
    const spans = detectRegex('Contact sarah.chen@chevron.com for info')
    const emails = spans.filter(s => s.type === 'EMAIL')
    expect(emails).toHaveLength(1)
    expect(emails[0].value).toBe('sarah.chen@chevron.com')
  })

  it('detects phone numbers', () => {
    const spans = detectRegex('Call 415-555-0199 or (212) 555-1234')
    const phones = spans.filter(s => s.type === 'PHONE')
    expect(phones.length).toBeGreaterThanOrEqual(2)
  })

  it('detects SSNs', () => {
    const spans = detectRegex('SSN: 123-45-6789')
    const ssns = spans.filter(s => s.type === 'SSN')
    expect(ssns).toHaveLength(1)
    expect(ssns[0].value).toBe('123-45-6789')
  })

  it('detects credit cards', () => {
    const spans = detectRegex('Card: 4111-1111-1111-1111')
    const cards = spans.filter(s => s.type === 'CARD')
    expect(cards).toHaveLength(1)
  })

  it('detects money amounts', () => {
    const spans = detectRegex('Budget is $12M and fee is $4,500.00')
    const money = spans.filter(s => s.type === 'MONEY')
    expect(money.length).toBeGreaterThanOrEqual(2)
    expect(money.map(m => m.value)).toContain('$12M')
    expect(money.map(m => m.value)).toContain('$4,500.00')
  })

  it('detects API keys', () => {
    const spans = detectRegex('Key: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345')
    const keys = spans.filter(s => s.type === 'KEY')
    expect(keys.length).toBeGreaterThanOrEqual(1)
  })

  it('detects IP addresses', () => {
    const spans = detectRegex('Server at 192.168.1.100')
    const ips = spans.filter(s => s.type === 'IP')
    expect(ips).toHaveLength(1)
    expect(ips[0].value).toBe('192.168.1.100')
  })

  it('detects URLs', () => {
    const spans = detectRegex('Visit https://example.com/path')
    const urls = spans.filter(s => s.type === 'URL')
    expect(urls).toHaveLength(1)
  })

  it('detects dates', () => {
    const spans = detectRegex('Meeting on 2025-03-15')
    const dates = spans.filter(s => s.type === 'DATE')
    expect(dates).toHaveLength(1)
  })

  it('returns correct offsets', () => {
    const text = 'Email: test@example.com'
    const spans = detectRegex(text)
    const email = spans.find(s => s.type === 'EMAIL')!
    expect(text.slice(email.start, email.end)).toBe('test@example.com')
  })

  it('returns empty for no PII', () => {
    const spans = detectRegex('Hello world, this is a normal sentence.')
    expect(spans).toHaveLength(0)
  })
})
