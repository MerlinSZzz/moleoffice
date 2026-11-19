// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lockedCards, numberEdits, recover, rolesListNamesAnUnusedCard, startOffice, storedBeforeTheAllRuleChanged, storedSidebarStillLoads, type Office, type RecoveryCase } from './settings-recovery-by-presses.ts'

// The recovery cases keep the number, sidebar, word and chapter variants that run nowhere else.
// The two role variants also run on fresh offices: those already have the card's words record,
// while upgraded offices create it during recovery. The reportsTo sentence stays editable prose.
const keptRecoveryCases: readonly RecoveryCase[] = [
  'role-not-json', 'role-locked-name', 'chapter-two-records', 'number-not-a-number',
  'sidebar-unknown-page', 'word-unknown-key', 'notice-unknown-kind',
  'role-unknown-supervisor', 'number-out-of-range', 'sidebar-missing-page',
  'word-empty-value', 'chapter-missing-rule', 'role-unknown-appointee', 'role-no-duties',
]

// beforeTheOfficeStarts copies main's migration journal and default chapters. No test writes after start.
describe('made-up office upgraded from main', () => {
  let office: Office
  let shippedLocked: Awaited<ReturnType<typeof lockedCards>>
  beforeAll(async () => { office = await startOffice('upgraded'); shippedLocked = await lockedCards(office) }, 240_000)
  afterAll(async () => { await office?.stop() }, 120_000)
  it('records both older missing migration hashes, serves the pages and restores running numbers', async () => numberEdits(office), 120_000)
  for (const bad of keptRecoveryCases) it(bad === 'role-unknown-supervisor' ? 'keeps an unrecognised reportsTo sentence as prose and edits it by presses' : `recovers ${bad} by presses and names every unused stored value`, async () => {
    const damaged = await startOffice('upgraded', bad)
    try {
      const locked = bad === 'role-locked-name' || bad.startsWith('chapter-')
      if (locked) expect(await lockedCards(damaged)).toEqual(shippedLocked)
      try { await recover(damaged, bad) }
      finally { if (locked) expect(await lockedCards(damaged)).toEqual(shippedLocked) }
    } finally { await damaged.stop() }
  }, 180_000)
  // Wave 13r round 5, item 2: a page may now leave All projects. Main has no sidebar setting, so the
  // stored arrangement is one round 4's check accepted; see sidebarRound4Accepted.
  it('loads an arrangement round 4 accepted, then moves Flows into Developer by presses', async () => {
    const stored = await startOffice('upgraded', storedBeforeTheAllRuleChanged)
    try { await storedSidebarStillLoads(stored) } finally { await stored.stop() }
  }, 180_000)
  it('names the left-out card on the Roles list with an alert or status role', async () => {
    const damaged = await startOffice('upgraded', 'role-unknown-power')
    try { await rolesListNamesAnUnusedCard(damaged) } finally { await damaged.stop() }
  }, 120_000)
})
