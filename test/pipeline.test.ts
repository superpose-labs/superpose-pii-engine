import { describe, it, expect } from 'vitest'
import { mask, reconstruct } from '../src/index.js'

// These tests run regex-only (no GLiNER) for fast CI

describe('mask (regex-only)', () => {
  const text = 'Call Dr. Sarah Chen at Chevron, 415-555-0199, re: $12M drilling contract, email sarah.chen@chevron.com'

  it('minimal — only masks secrets', async () => {
    const result = await mask(text, 'minimal')
    // No SSN/card/API key in this text, so nothing should be masked
    expect(result.obfuscatedText).toContain('Dr. Sarah Chen')
    expect(result.obfuscatedText).toContain('Chevron')
    expect(Object.keys(result.entityMap).length).toBe(0)
  })

  it('balanced — masks names, phones, emails, money (regex catches phone/email/money)', async () => {
    const result = await mask(text, 'balanced')
    // Regex should catch phone, email, money
    expect(result.obfuscatedText).not.toContain('415-555-0199')
    expect(result.obfuscatedText).not.toContain('sarah.chen@chevron.com')
    expect(result.obfuscatedText).not.toContain('$12M')
    // Names/orgs need GLiNER — regex can't catch them
    expect(result.obfuscatedText).toContain('Dr. Sarah Chen')
    expect(result.obfuscatedText).toContain('Chevron')
    // Placeholders present
    expect(result.obfuscatedText).toContain('[PHONE_1]')
    expect(result.obfuscatedText).toContain('[EMAIL_1]')
    expect(result.obfuscatedText).toContain('[MONEY_1]')
  })

  it('aggressive — masks everything regex can find', async () => {
    const result = await mask(text, 'aggressive')
    expect(result.obfuscatedText).not.toContain('415-555-0199')
    expect(result.obfuscatedText).not.toContain('sarah.chen@chevron.com')
    expect(result.obfuscatedText).not.toContain('$12M')
  })

  it('masks SSN and credit card at minimal level', async () => {
    const result = await mask('SSN: 123-45-6789, card 4111-1111-1111-1111', 'minimal')
    expect(result.obfuscatedText).not.toContain('123-45-6789')
    expect(result.obfuscatedText).not.toContain('4111-1111-1111-1111')
    expect(result.obfuscatedText).toContain('[SSN_1]')
    expect(result.obfuscatedText).toContain('[CARD_1]')
  })

  it('masks API keys at minimal level', async () => {
    const result = await mask('Key: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345', 'minimal')
    expect(result.obfuscatedText).not.toContain('ghp_')
    expect(result.obfuscatedText).toContain('[KEY_1]')
  })
})

describe('reconstruct', () => {
  it('restores placeholders to original values', () => {
    const masked = 'Call [NAME_1] at [PHONE_1]'
    const entityMap = { '[NAME_1]': 'Dr. Sarah Chen', '[PHONE_1]': '415-555-0199' }
    const result = reconstruct(masked, entityMap)
    expect(result).toBe('Call Dr. Sarah Chen at 415-555-0199')
  })

  it('handles empty entity map', () => {
    expect(reconstruct('Hello world', {})).toBe('Hello world')
  })

  it('handles duplicate placeholders', () => {
    const result = reconstruct('[NAME_1] called [NAME_1]', { '[NAME_1]': 'Alice' })
    expect(result).toBe('Alice called Alice')
  })
})
