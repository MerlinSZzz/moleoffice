// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CANDIDATE TAG OF tests/stable-upgrade-fixture.ts NAMES THE DAY IT IS MADE ON, NOT THE DAY THE MODULE WAS LOADED.
 *
 * WHAT WENT WRONG. tests/a-closed-upgrade-runs-several-verifiers.test.ts went red in a whole-suite run that crossed
 * local midnight, and was green alone right after. Four of its cases stopped on "The candidate tag must name the
 * current local day.", from validateUpgradeConfig in tools/stable/stable-upgrade-transaction.mjs, which asks that the
 * tag's day be the local day when the upgrade runs. The fixture made its tag once, when the module was loaded, and put
 * that tag in every configuration it made. So a file loaded before midnight handed the day before to a case run after it.
 *
 * WHAT IS CLAIMED HERE.
 *   1. The fixture's one function that makes a candidate tag gives the day of the moment it is called: just before
 *      local midnight it names that day, and just after it names the next. Only Date is faked, and only in this case.
 *   2. The fixture exports no candidate tag made once, under its old name or under any other, so a tag made at load
 *      cannot come back.
 *
 * WHAT IS NOT CLAIMED. That each configuration the fixture makes takes its tag from that function: showing it would
 * start a made-up office, and this file starts none. A case whose fixture is made before midnight and whose upgrade runs
 * after it still meets the rule; that window is one case's seconds.
 *
 * Loading the fixture here starts no process. It adds the fixture's afterEach and afterAll, which end and remove only
 * what a fixture made, and this file makes none. The maker is looked up by name, so this file compiles before it exists.
 */
import { expect, it, vi } from 'vitest'
import * as theFixture from './stable-upgrade-fixture.ts'

/** What the fixture module exports, by name. */
const exported: Record<string, unknown> = { ...theFixture }

/** The name of the fixture's one function that makes a candidate tag. */
const THE_MAKER = 'theCandidateTagForToday'

/** The form of a candidate tag the fixture makes: stable-<local day>-fixture. */
const A_FIXTURE_CANDIDATE_TAG = /^stable-\d{4}-\d{2}-\d{2}-fixture$/

function theMaker(): () => string {
  const maker = exported[THE_MAKER]
  if (typeof maker !== 'function') throw new Error(`tests/stable-upgrade-fixture.ts exports no function ${THE_MAKER}, which makes a candidate tag.`)
  return maker as () => string
}

it('makes a tag that names the later day just after local midnight, and exports no tag made once', () => {
  const make = theMaker()
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 0, 14, 23, 59, 59, 500))
    expect(make(), 'a tag made half a second before local midnight').toBe('stable-2026-01-14-fixture')
    vi.setSystemTime(new Date(2026, 0, 15, 0, 0, 0, 500))
    expect(make(), 'a tag made half a second after local midnight').toBe('stable-2026-01-15-fixture')
  } finally {
    vi.useRealTimers()
  }
  expect(Object.keys(exported), 'the fixture exports its old tag made at load').not.toContain('candidateTag')
  const madeOnce = Object.entries(exported).filter(([, value]) => typeof value === 'string' && A_FIXTURE_CANDIDATE_TAG.test(value)).map(([name]) => name)
  expect(madeOnce, 'exports that hold a candidate tag made once').toEqual([])
})
