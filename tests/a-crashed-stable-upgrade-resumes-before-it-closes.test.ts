// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CRASH PROOF OF tools/stable/upgrade-stable.criteria.md, item 15 (b), at each boundary before the office closes:
 * the upgrade program is ended by SIGKILL right after that journal line, and the resume comes back to "closed" or
 * "rolled back", never to an office nothing verified. tests/a-closed-stable-upgrade.ts holds the boundaries and the
 * proof. Every office here is made up.
 */
import { expect, it } from 'vitest'
import { upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { remember, stableUpgradeFixture } from './stable-upgrade-fixture.ts'
import { THE_PARTS, configFor, crashTheUpgradeAt, theBoundaryIn, theCrashIsResumed, theResumeEnds, theUntestedEntries } from './a-closed-stable-upgrade.ts'

for (const b of THE_PARTS['before-it-closes']!) it(`resumes a crash after ${theBoundaryIn(b)}, and ends ${theResumeEnds(b)}`, async () => {
  const f = await stableUpgradeFixture()
  await theCrashIsResumed(f, b, await crashTheUpgradeAt(f, configFor(f, b.run), b))
}, 120_000)

it('names every journal entry inside the closure, of a run that publishes and of one that rolls back, as a tested boundary', async () => {
  let publishing: string[] = []
  for (const run of ['publishing', 'rejecting'] as const) {
    const f = await stableUpgradeFixture()
    const entries: Array<{ step: string; phase: string }> = []
    const result = remember(await upgradeStable(configFor(f, run), { ...f.options, onJournal: (entry: { step: string; phase: string }) => { entries.push(entry) } }))
    expect(result.state, JSON.stringify(result)).toBe(run === 'publishing' ? 'published' : 'restored')
    const { inside, untested } = theUntestedEntries(entries, run, publishing)
    expect(untested).toEqual([])
    if (run === 'publishing') publishing = inside
  }
}, 120_000)
