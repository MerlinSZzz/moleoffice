// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Swept letters explain the grouped notice for each owner reach result. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let office: TestDb
beforeAll(async () => { office = await freshDb() })
afterAll(() => { office?.close() })

it.each([
  ['an owner', 'deadLetterRouting.summary.ownerReached'],
  ['an owner whose reach is uncertain', 'deadLetterRouting.summary.ownerUncertain'],
  ['an owner waiting', 'deadLetterRouting.summary.ownerWaiting'],
] as const)('a summary describes the grouped notice for %s', async (how, key) => {
  const { theRoutedLine } = await import('../src/shared/messages.ts')
  const { sayInEnglish } = await import('../src/shared/i18n.ts')
  const addressee = 'A synthetic reader'
  const reached = 'A synthetic owner'
  const line = theRoutedLine({ addressee, was: 'retired', passedOver: [], ending: { how, reached } }, true)
  expect(line.endsWith(sayInEnglish(key, { addressee, reached }))).toBe(true)
})
