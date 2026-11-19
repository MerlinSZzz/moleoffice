// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELEASE OF CASE 1 REFUSES CLOSED VERIFICATION (tools/stable/upgrade-stable.criteria.md, "A slimmer stable release",
 * part 2). Closed verification compares the target with a copy of the database taken before the migration, and a
 * release whose target changes no migration takes no copy, so its checks would compare the database with itself. The
 * configuration is refused before the lock, with nothing changed: no lock, no journal, no work folder, and the old
 * version still serves. The repositories, the database and the office are made up.
 *
 * Mutation, after a control run, then restored:
 * - validateUpgradeConfig accepts closedVerification in case 1: the first case is red.
 */
import { expect, it } from 'vitest'
import { CASE_1_TAKES_NO_CLOSED_VERIFICATION, upgradeStable, validateUpgradeConfig } from '../tools/stable/stable-upgrade-transaction.mjs'
import { nothingChanged, snapshot, stableUpgradeFixture } from './stable-upgrade-fixture.ts'
import { closed } from './a-closed-stable-upgrade.ts'

/** What a refusal said, or null when there was none. */
function refusal(attempt: () => unknown) {
  try { attempt(); return null } catch (error) { return (error as Error).message }
}
const anAsyncRefusal = (attempt: Promise<unknown>) => attempt.then(() => null, (error: Error) => error.message)

// One made-up office, a dry run and a refused run. The fixture's build and start take about 20 seconds here; the
// limit leaves room for a slower machine.
it('refuses closed verification for a target that changes no migration, before the lock and with nothing changed', async () => {
  expect(CASE_1_TAKES_NO_CLOSED_VERIFICATION).toEqual(expect.any(String))
  const f = await stableUpgradeFixture(false, false, false, false, false, false, 1)
  const config = closed(f)
  const before = snapshot(f)
  expect(refusal(() => validateUpgradeConfig(config))).toBe(CASE_1_TAKES_NO_CLOSED_VERIFICATION)
  expect(await anAsyncRefusal(upgradeStable(config, { ...f.options, dry: true }))).toBe(CASE_1_TAKES_NO_CLOSED_VERIFICATION)
  await nothingChanged(f, before)
  expect(await anAsyncRefusal(upgradeStable(config, f.options))).toBe(CASE_1_TAKES_NO_CLOSED_VERIFICATION)
  await nothingChanged(f, before)
  // The same target without closed verification is a release of case 1 the configuration takes.
  expect(validateUpgradeConfig(f.config).releaseCase).toMatchObject({ case: 1, files: [] })
}, 120_000)
