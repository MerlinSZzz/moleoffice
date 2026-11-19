// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELEASE THAT CHANGES NO MIGRATION COPIES NO DATA (tools/stable/upgrade-stable.criteria.md, "A slimmer stable
 * release", part 2). In case 1 no copy of the database is on disk at any journal line: no candidate.sqlite, no
 * restore.sqlite, no sanitized.sqlite and no other file with SQLite's header. The target's trial start runs on the live
 * database, in the live release check's mode, while the old version serves. Downtime runs no migration and no release
 * check, and a rollback restores no database: the old version starts again on the same file. A target whose settings
 * refuse the live mode has no trial start; it is checked at downtime on the closed database instead, still with no copy,
 * and a failure of that check rolls back on the untouched database. The repositories, the database (in WAL mode, as the
 * office's is) and the office are made up.
 *
 * Mutations, one at a time after a control run, then restored:
 * - the rehearsal copy is made in case 1 as well: the first case is red;
 * - the trial start is given release-check instead of the live mode: the first case is red;
 * - the migration runs in case 1: the first case is red.
 */
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { NO_IMAGE_IN_CASE_1, upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { baselineIsBack, remember, snapshot, stableUpgradeFixture, startsOf, theDatabaseCopies, track } from './stable-upgrade-fixture.ts'
import { rows, type Fixture } from './a-closed-stable-upgrade.ts'

/** A made-up office of case 1 with its database in WAL mode, whose target takes the live mode or refuses it. */
const aReleaseOfCase1 = (liveMode: 'taken' | 'refused' = 'taken') => stableUpgradeFixture(false, false, false, false, false, true, 1, liveMode)

/** The copies of the database seen at each journal line that saw one. */
function copiesAtEveryLine(f: Fixture) {
  const seen: Array<{ line: string, copies: string[] }> = []
  return { seen, onJournal: (entry: { step: string, phase: string }) => { const copies = theDatabaseCopies(f); if (copies.length) seen.push({ line: `${entry.step} ${entry.phase}`, copies }) } }
}

/** The starts that were not ordinary, as the made-up office wrote them down. */
const theChecks = (f: Fixture) => startsOf(f).filter((start) => start.mode !== 'ordinary')

/** What case 1 never runs, with or without the live mode. */
const NEVER_IN_CASE_1 = ['candidate-database', 'candidate-migrate', 'candidate-checkpoint', 'delete-candidate-database', 'sanitized-backup', 'private-backup', 'migrate', 'recover-database']

/** Each journal line says no image was made and none is needed, where it speaks of a restore point. */
function noImageIsSpokenOf(journal: any[], result: { databaseLoss: string }) {
  expect(result.databaseLoss).toBe(NO_IMAGE_IN_CASE_1)
  const spoken = journal.filter((e) => 'databaseLoss' in e)
  expect(spoken.length).toBeGreaterThan(0)
  for (const e of spoken) expect(e.databaseLoss, `${e.step} ${e.phase}`).toBe(NO_IMAGE_IN_CASE_1)
}

// Each case builds one made-up office and runs one release: about a minute here, two for the slowest. The limits leave
// room for a slower machine.
it('publishes case 1 with no copy at any line, a trial start on the live database in the live mode, no migration and no release check', async () => {
  expect(NO_IMAGE_IN_CASE_1).toEqual(expect.any(String))
  const f = await aReleaseOfCase1()
  const inode = statSync(f.database).ino
  const watch = copiesAtEveryLine(f)
  const result = remember(await upgradeStable(f.config, { ...f.options, onJournal: watch.onJournal }))
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(result.releaseCase).toMatchObject({ case: 1, files: [] })
  expect(watch.seen, 'no copy of the database at any journal line').toEqual([])
  expect(theChecks(f), 'one trial start, on the live database, in the live mode').toEqual([{ mode: 'release-check-live', database: f.database, repository: result.paths.candidate }])
  expect(existsSync(join(f.folder, 'migrate-arguments')), 'no migration ran').toBe(false)
  const journal = rows(result.paths.journal)
  const steps = new Set(journal.map((e) => e.step))
  for (const step of [...NEVER_IN_CASE_1, 'stable-checkpoint', 'stable-check']) expect(steps.has(step), step).toBe(false)
  expect(journal.find((e) => e.step === 'candidate-live-mode' && e.phase === 'answered')).toMatchObject({ takes: true })
  expect(statSync(f.database).ino).toBe(inode)
  expect(snapshot(f).records).toEqual([{ id: 'authored', value: 'baseline' }])
  noImageIsSpokenOf(journal, result)
}, 240_000)

it('rolls case 1 back after install-artifacts with no database restored, and the old version serves the same file', async () => {
  const f = await aReleaseOfCase1()
  const inode = statSync(f.database).ino
  const watch = copiesAtEveryLine(f)
  const result = remember(await upgradeStable(f.config, { ...f.options, onJournal: watch.onJournal, onStep: (event: any) => { track(event); if (event.step === 'install-artifacts' && event.phase === 'after') throw new Error('Synthetic failure after install-artifacts') } }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(watch.seen, 'no copy of the database at any journal line').toEqual([])
  const journal = rows(result.paths.journal)
  const steps = new Set(journal.map((e) => e.step))
  for (const step of NEVER_IN_CASE_1) expect(steps.has(step), step).toBe(false)
  expect(statSync(f.database).ino).toBe(inode)
  await baselineIsBack(f)
  noImageIsSpokenOf(journal, result)
}, 240_000)

it('checks a target whose settings refuse the live mode at downtime instead, on the closed database and with no copy', async () => {
  const f = await aReleaseOfCase1('refused')
  const inode = statSync(f.database).ino
  const watch = copiesAtEveryLine(f)
  const result = remember(await upgradeStable(f.config, { ...f.options, onJournal: watch.onJournal }))
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(watch.seen, 'no copy of the database at any journal line').toEqual([])
  const journal = rows(result.paths.journal)
  expect(journal.find((e) => e.step === 'candidate-live-mode' && e.phase === 'answered')).toMatchObject({ takes: false })
  // The trial start is left out, in a line that says so, and the stable release check runs in its place.
  expect(journal.filter((e) => e.step === 'candidate-check').map((e) => e.phase)).toEqual(['left-out'])
  expect(journal.find((e) => e.step === 'candidate-check')?.says).toEqual(expect.any(String))
  expect(theChecks(f), 'one release check, at downtime, on the live database').toEqual([{ mode: 'release-check', database: f.database, repository: f.stable }])
  expect(existsSync(join(f.folder, 'migrate-arguments')), 'no migration ran').toBe(false)
  const steps = new Set(journal.map((e) => e.step))
  for (const step of NEVER_IN_CASE_1) expect(steps.has(step), step).toBe(false)
  expect(statSync(f.database).ino).toBe(inode)
  noImageIsSpokenOf(journal, result)
}, 240_000)

it('rolls a target that refuses the live mode back on the untouched database when its check at downtime fails', async () => {
  const f = await aReleaseOfCase1('refused')
  const inode = statSync(f.database).ino
  const watch = copiesAtEveryLine(f)
  const result = remember(await upgradeStable(f.config, { ...f.options, onJournal: watch.onJournal, onStep: (event: any) => { track(event); if (event.step === 'stable-check-health' && event.phase === 'before') throw new Error('Synthetic failure of the release check at downtime') } }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(watch.seen, 'no copy of the database at any journal line').toEqual([])
  const journal = rows(result.paths.journal)
  const steps = new Set(journal.map((e) => e.step))
  for (const step of NEVER_IN_CASE_1) expect(steps.has(step), step).toBe(false)
  expect(statSync(f.database).ino).toBe(inode)
  await baselineIsBack(f)
  noImageIsSpokenOf(journal, result)
}, 240_000)
