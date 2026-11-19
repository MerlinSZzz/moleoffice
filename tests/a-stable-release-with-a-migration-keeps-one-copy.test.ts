// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELEASE THAT CHANGES A MIGRATION KEEPS AT MOST ONE COPY (tools/stable/upgrade-stable.criteria.md, "A slimmer stable
 * release", part 3). In case 2 the rehearsal copy (candidate.sqlite) is migrated and checked, and then deleted with every
 * companion file before the BEFORE notice. The one rollback copy (restore.sqlite) is taken at downtime. No sanitized
 * backup is taken. At no journal line are two copies of the database on disk. The repositories, the database (in WAL
 * mode, as the office's is) and the office are made up.
 *
 * Mutations, one at a time after a control run, then restored:
 * - the rehearsal copy is deleted after notice-before: the case is red;
 * - the rehearsal copy is kept: the case is red.
 */
import { readdirSync } from 'node:fs'
import { expect, it } from 'vitest'
import { upgradeStable, validateUpgradeConfig } from '../tools/stable/stable-upgrade-transaction.mjs'
import { remember, stableUpgradeFixture, theDatabaseCopies, THE_TARGETS_MIGRATION, track } from './stable-upgrade-fixture.ts'
import { rows } from './a-closed-stable-upgrade.ts'

// One made-up office and one release: about a minute here. The limit leaves room for a slower machine.
it('publishes case 2 with at most one copy at every line, deletes the rehearsal copy before the BEFORE notice, and takes no sanitized backup', async () => {
  const f = await stableUpgradeFixture(false, false, false, false, false, true)
  const atEveryLine: Array<{ line: string, copies: string[] }> = []
  const work = validateUpgradeConfig(f.config).paths.work
  let atTheNotice: string[] | null = null
  const result = remember(await upgradeStable(f.config, {
    ...f.options,
    onJournal: (entry: any) => { atEveryLine.push({ line: `${entry.step} ${entry.phase}`, copies: theDatabaseCopies(f) }) },
    onStep: (event: any) => { track(event); if (event.step === 'notice-before' && event.phase === 'before') atTheNotice = readdirSync(work).filter((name) => name.startsWith('candidate.sqlite')) },
  }))
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(result.releaseCase).toMatchObject({ case: 2, files: [THE_TARGETS_MIGRATION] })
  expect(atEveryLine.filter((seen) => seen.copies.length > 1), 'never two copies at once').toEqual([])
  // Each copy was on disk at some line: the rehearsal copy and then the rollback copy.
  const ever = new Set(atEveryLine.flatMap((seen) => seen.copies.map((copy) => copy.split('/').at(-1))))
  expect(ever).toEqual(new Set(['candidate.sqlite', 'restore.sqlite']))
  expect(atTheNotice, 'no rehearsal file is left when the BEFORE notice is sent').toEqual([])
  const journal = rows(result.paths.journal)
  const attempt = (step: string) => journal.findIndex((e) => e.step === step && e.phase === 'attempt')
  for (const [first, second] of [['candidate-stop', 'delete-candidate-database'], ['delete-candidate-database', 'notice-before']] as const) {
    expect(attempt(first), `${first} runs`).toBeGreaterThanOrEqual(0)
    expect(attempt(first), `${first} before ${second}`).toBeLessThan(attempt(second))
  }
  expect(journal.some((e) => e.step === 'delete-candidate-database' && e.phase === 'done')).toBe(true)
  expect(journal.some((e) => /sanitized/.test(e.step)), 'no sanitized backup').toBe(false)
  expect(journal.find((e) => e.step === 'release-case')).toMatchObject({ phase: 'decided', case: 2, files: [THE_TARGETS_MIGRATION] })
}, 240_000)
