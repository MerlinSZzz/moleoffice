// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'

const futureModule = '../src/shared/main-suite-fix-chronology.ts'
const readChronology = () => import(futureModule)
const originalEndedAtMs = Date.parse('2026-10-15T09:20:00Z')

it('requires original green to end strictly after both the actual repair landing and original red receipt', async () => {
  const { originalGreenFollowsRepair } = await readChronology()
  const facts = { landedAt: '2026-10-15 09:30:00', originalEndedAtMs, timeZone: 'UTC' }
  expect(originalGreenFollowsRepair({ ...facts, endedAt: '2026-10-15 09:45:00' })).toBe(true)
  for (const endedAt of ['2026-10-15 09:19:00', '2026-10-15 09:20:00', '2026-10-15 09:25:00', '2026-10-15 09:30:00']) {
    expect(originalGreenFollowsRepair({ ...facts, endedAt })).toBe(false)
  }
  expect(originalGreenFollowsRepair({ ...facts, landedAt: '2026-10-15 09:10:00', endedAt: '2026-10-15 09:15:00' })).toBe(false)
})
it('keeps missing invalid gap fold or unknown original time out of the repair green proof', async () => {
  const { originalGreenFollowsRepair } = await readChronology()
  const facts = { endedAt: '2026-10-15 09:45:00', landedAt: '2026-10-15 09:30:00', originalEndedAtMs, timeZone: 'UTC' }
  for (const changed of [{ endedAt: undefined }, { landedAt: null }, { endedAt: 'invalid' }, { originalEndedAtMs: null },
    { endedAt: '2026-11-01 01:30:00', timeZone: 'America/New_York' }, { endedAt: '2026-03-08 02:30:00', timeZone: 'America/New_York' }]) {
    expect(originalGreenFollowsRepair({ ...facts, ...changed })).toBe(false)
  }
})
