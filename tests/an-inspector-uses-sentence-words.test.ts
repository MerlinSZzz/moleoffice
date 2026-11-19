// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { freshDb, type TestDb } from './helpers.ts'

let db: TestDb
let delegation: typeof import('../src/server/lib/delegation.ts')
beforeAll(async () => { db = await freshDb(); delegation = await import('../src/server/lib/delegation.ts') }, 60_000)
afterAll(() => db.close())

it('uses sentence words for the inspector’s judgments in all three sentences', () => {
  expect(delegation.theInspectorsCheckSays([{ pointId: 'P1', judged: 'more_than_asked', holds: false, why: 'Made up.' }]))
    .toContain(t('delegation.inspection.sentence.more_than_asked'))
  expect(delegation.aPointThatDoesNotHoldSays({ task: 'made-up-task', title: 'Made-up package', pointId: 'P1', says: null, claimed: 'done', claimedWords: 'Made up.', judged: 'unfinished', why: 'Made up.' }))
    .toContain(t('delegation.inspection.sentence.unfinished'))
  expect(delegation.theClaimsThatCannotHoldSay([{ pointId: 'P1', claimed: 'done', judged: 'narrower' }]))
    .toContain(t('delegation.inspection.sentence.narrower'))
})
