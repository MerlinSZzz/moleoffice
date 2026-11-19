// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chapterEdits, lockedCards, noticeEdits, numberEdits, recover, roleEdits, sidebarEdits, startOffice, wordEdits, type Office, type RecoveryCase } from './settings-recovery-by-presses.ts'

// All fixture writes live in beforeTheOfficeStarts in the helper. After start, only browser presses write.
// The six edit-and-restore cases stay here. The two role recovery variants also run on upgraded
// offices, where recovery creates their words record. Here recovery reuses or patches that record.
// The other recovery cases and the Roles-list card case run on the upgraded office.
// Proof: each case is caught by a number reset, notice history, word, sidebar, role-check or chapter
// required-rule mutation.
const freshRecoveryCases: readonly RecoveryCase[] = ['role-unknown-appointee', 'role-no-duties']

describe('made-up fresh office', () => {
  let office: Office
  let shippedLocked: Awaited<ReturnType<typeof lockedCards>>
  beforeAll(async () => { office = await startOffice('fresh'); shippedLocked = await lockedCards(office) }, 240_000)
  afterAll(async () => { await office?.stop() }, 120_000)
  it('edits running numbers and restores the shipped value by presses', async () => numberEdits(office), 120_000)
  it('edits notice rules and restores history and office defaults by presses', async () => noticeEdits(office), 120_000)
  it('edits page words and restores history and shipped words by presses', async () => wordEdits(office), 120_000)
  it('edits sidebar placement and restores history and shipped placement by presses', async () => sidebarEdits(office), 120_000)
  it('edits added roles and restores history and shipped absence by presses', async () => roleEdits(office), 120_000)
  it('edits a chapter and restores history and the shipped chapter by presses', async () => chapterEdits(office), 120_000)
  for (const bad of freshRecoveryCases) it(bad === 'role-unknown-supervisor' ? 'keeps an unrecognised reportsTo sentence as prose and edits it by presses' : `recovers ${bad} by presses and names every unused stored value`, async () => {
    const damaged = await startOffice('fresh', bad)
    try {
      const locked = bad === 'role-locked-name' || bad.startsWith('chapter-')
      if (locked) expect(await lockedCards(damaged)).toEqual(shippedLocked)
      try { await recover(damaged, bad) }
      finally { if (locked) expect(await lockedCards(damaged)).toEqual(shippedLocked) }
    } finally { await damaged.stop() }
  }, 180_000)
})
