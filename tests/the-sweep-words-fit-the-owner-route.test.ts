// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let office: TestDb

beforeAll(async () => {
  office = await freshDb()
})

afterAll(() => {
  office?.close()
})

it('describes routed letters without assuming who sent them or which tree was used', async () => {
  const { theDeadLetterSweepInWords } = await import('../src/shared/dead-letter-lines.ts')
  const { createI18n } = await import('../src/shared/i18n.ts')
  const facts = {
    archived: [], routed: [{ name: 'Example', count: 2 }], summarised: [{ name: 'Example', count: 2 }],
    keptBySender: 0, givenToTheSecretary: null, waiting: { fromThePerson: 0, fromAgents: 0 },
    broadcast: null, deliveredTo: { name: 'Example' },
  }
  for (const language of ['en', 'el', 'es', 'it', 'ko', 'pt', 'th'] as const) {
    const words = theDeadLetterSweepInWords(facts, createI18n(language).t, false)
    expect(words, language).toMatch(/routed/i)
    expect(words, language).not.toMatch(/starter|from agents/i)
  }
})

it('describes a retained letter without claiming a particular ownership path', async () => {
  const { theDeadLetterSweepInWords } = await import('../src/shared/dead-letter-lines.ts')
  const { createI18n } = await import('../src/shared/i18n.ts')
  const facts = {
    archived: [], routed: [], keptBySender: 1, givenToTheSecretary: null,
    waiting: { fromThePerson: 0, fromAgents: 0 }, broadcast: null, deliveredTo: { name: 'Example' },
  }
  for (const language of ['en', 'el', 'es', 'it', 'ko', 'pt', 'th'] as const) {
    const words = theDeadLetterSweepInWords(facts, createI18n(language).t, false)
    expect(words, language).not.toMatch(/starter|from agents/i)
    expect(words, language).toMatch(/sender/i)
  }
})
