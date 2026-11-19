// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RELEASE'S CASE IS READ FROM THE MIGRATIONS FOLDER (tools/stable/upgrade-stable.criteria.md, "A slimmer stable
 * release", part 1). A target that changes no file under the migrations folder, against the version serving, is case
 * 1. A target that adds, changes, deletes or renames a file there is case 2, and the files are named, a rename by both
 * of its names. The case is read when the configuration is checked, journalled as the first line after the lock's, and
 * returned in the dry result and in the result, and the dry plan says what the case copies. A re-mint map is applied by
 * a migration, so a release of case 1 refuses one before the lock, with nothing changed. The way back's reading is in
 * tests/the-stable-office-goes-back-to-its-previous-version.test.ts. The repositories, the database and the office are
 * made up.
 *
 * Mutations, one at a time after a control run, then restored:
 * - the case is read from another folder than the migrations folder: the second case is red;
 * - the case is read without --no-renames: the second case is red (a rename is named by its new name only);
 * - a re-mint map is accepted in case 1: the fourth case is red.
 */
import { chmodSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { CASE_1_TAKES_NO_REMINT_MAP, upgradeStable, validateUpgradeConfig } from '../tools/stable/stable-upgrade-transaction.mjs'
import { git, nothingChanged, remember, snapshot, stableUpgradeFixture, THE_BASELINES_MIGRATION, THE_TARGETS_MIGRATION, write } from './stable-upgrade-fixture.ts'
import { rows, type Fixture } from './a-closed-stable-upgrade.ts'

/** What a refusal said, or null when there was none. */
function refusal(attempt: () => unknown) {
  try { attempt(); return null } catch (error) { return (error as Error).message }
}
const anAsyncRefusal = (attempt: Promise<unknown>) => attempt.then(() => null, (error: Error) => error.message)

/**
 * A target made on a branch of its own from the fixture's target, with one change, merged into main with the "ours"
 * strategy: it is an ancestor of main, as a target must be, and main's tree stays as it was, so each target holds only
 * its own change.
 */
function aTargetThat(f: Fixture, name: string, change: () => void) {
  git(f.dev, 'checkout', '-q', '-b', name, f.target)
  change()
  git(f.dev, 'add', '-A'); git(f.dev, 'commit', '-q', '-m', `Synthetic target that ${name}`)
  const target = git(f.dev, 'rev-parse', 'HEAD')
  git(f.dev, 'checkout', '-q', 'main'); git(f.dev, 'merge', '-q', '-s', 'ours', '--no-edit', name)
  return target
}

/** The dry plan as one text, to ask what it names. */
const thePlan = (dry: { plan: string[] }) => dry.plan.join('\n')

// Each case builds one made-up office (about 20 seconds here); the third and fourth also run a release (about a minute).
// The limits leave room for a slower machine.
it('reads case 1 from a target that changes no migration, and the dry plan copies nothing', async () => {
  const f = await stableUpgradeFixture(false, false, false, false, false, false, 1)
  const valid = validateUpgradeConfig(f.config)
  expect(valid.releaseCase).toEqual({ case: 1, because: expect.any(String), files: [] })
  const dry = await upgradeStable(f.config, { ...f.options, dry: true })
  expect(dry.state, JSON.stringify(dry)).toBe('dry')
  expect(dry.releaseCase).toEqual(valid.releaseCase)
  expect(dry.plan.filter((line: string) => line.includes(valid.releaseCase.because)), 'one plan line says the case').toHaveLength(1)
  const plan = thePlan(dry)
  for (const named of [dry.paths.candidateDatabase, dry.paths.privateDatabase, 'candidate.sqlite', 'restore.sqlite']) expect(plan).not.toContain(named)
  expect(plan).not.toMatch(/sanitized/i)
  expect(plan, 'no migration runs').not.toMatch(/\bmigrate\b/i)
}, 120_000)

it('reads case 2 from a target that adds, changes, deletes or renames a migration, and names each file', async () => {
  const f = await stableUpgradeFixture(false, false, false, false, false, false, 1)
  const renamed = join(THE_BASELINES_MIGRATION, '..', '0000_synthetic_baseline_renamed.sql')
  const targets = [
    { target: aTargetThat(f, 'adds-a-migration', () => write(join(f.dev, THE_TARGETS_MIGRATION), '-- A made-up migration this test adds.\n')), files: [THE_TARGETS_MIGRATION] },
    { target: aTargetThat(f, 'changes-a-migration', () => write(join(f.dev, THE_BASELINES_MIGRATION), '-- The made-up baseline migration, changed by this test.\n')), files: [THE_BASELINES_MIGRATION] },
    { target: aTargetThat(f, 'deletes-a-migration', () => rmSync(join(f.dev, THE_BASELINES_MIGRATION))), files: [THE_BASELINES_MIGRATION] },
    { target: aTargetThat(f, 'renames-a-migration', () => renameSync(join(f.dev, THE_BASELINES_MIGRATION), join(f.dev, renamed))), files: [THE_BASELINES_MIGRATION, renamed].sort() },
  ]
  for (const { target, files } of targets) {
    const releaseCase = validateUpgradeConfig({ ...f.config, targetCommit: target }).releaseCase
    expect(releaseCase, git(f.dev, 'log', '-1', '--format=%s', target)).toEqual({ case: 2, because: expect.any(String), files })
  }
  // A change outside the migrations folder alone leaves the release in case 1.
  const outside = aTargetThat(f, 'changes-a-file-beside-the-migrations', () => write(join(f.dev, THE_BASELINES_MIGRATION, '../../not-a-migration.txt'), 'made up\n'))
  expect(validateUpgradeConfig({ ...f.config, targetCommit: outside }).releaseCase).toEqual({ case: 1, because: expect.any(String), files: [] })
}, 120_000)

it('journals case 2 first after the lock, returns it in the dry result and the result, and plans one copy at a time', async () => {
  const f = await stableUpgradeFixture()
  const valid = validateUpgradeConfig(f.config)
  expect(valid.releaseCase).toEqual({ case: 2, because: expect.any(String), files: [THE_TARGETS_MIGRATION] })
  const dry = await upgradeStable(f.config, { ...f.options, dry: true })
  expect(dry.state, JSON.stringify(dry)).toBe('dry')
  expect(dry.releaseCase).toEqual(valid.releaseCase)
  expect(dry.plan.filter((line: string) => line.includes(valid.releaseCase.because)), 'one plan line says the case').toHaveLength(1)
  expect(dry.plan.some((line: string) => line.includes(dry.paths.candidateDatabase) && /delete/i.test(line)), 'the plan says when the rehearsal copy is deleted').toBe(true)
  expect(dry.plan.some((line: string) => line.includes(dry.paths.privateDatabase)), 'the plan names the one rollback copy').toBe(true)
  expect(thePlan(dry)).not.toMatch(/sanitized/i)
  const result = remember(await upgradeStable(f.config, f.options))
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(result.releaseCase).toEqual(valid.releaseCase)
  const journal = rows(result.paths.journal)
  const lock = journal.findIndex((e) => e.step === 'lock' && e.phase === 'attempt')
  expect(lock).toBeGreaterThanOrEqual(0)
  expect(journal[lock + 1]).toMatchObject({ step: 'release-case', phase: 'decided', ...valid.releaseCase })
  expect(journal.filter((e) => e.step === 'release-case')).toHaveLength(1)
}, 240_000)

it('refuses a re-mint map in case 1, before the lock and with nothing changed, and journals case 1 when it runs', async () => {
  expect(CASE_1_TAKES_NO_REMINT_MAP).toEqual(expect.any(String))
  const f = await stableUpgradeFixture(false, false, false, false, false, false, 1)
  const map = join(f.folder, 'staged-remint-map.json')
  write(map, '{"synthetic":"a made-up staged re-mint map, never applied"}\n'); chmodSync(map, 0o600)
  const config = { ...f.config, remintMap: map }
  const before = snapshot(f)
  expect(refusal(() => validateUpgradeConfig(config))).toBe(CASE_1_TAKES_NO_REMINT_MAP)
  expect(await anAsyncRefusal(upgradeStable(config, { ...f.options, dry: true }))).toBe(CASE_1_TAKES_NO_REMINT_MAP)
  await nothingChanged(f, before)
  expect(await anAsyncRefusal(upgradeStable(config, f.options))).toBe(CASE_1_TAKES_NO_REMINT_MAP)
  await nothingChanged(f, before)
  const result = remember(await upgradeStable(f.config, f.options))
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(result.releaseCase).toEqual({ case: 1, because: expect.any(String), files: [] })
  const journal = rows(result.paths.journal)
  const lock = journal.findIndex((e) => e.step === 'lock' && e.phase === 'attempt')
  expect(journal[lock + 1]).toMatchObject({ step: 'release-case', phase: 'decided', ...result.releaseCase })
}, 240_000)
