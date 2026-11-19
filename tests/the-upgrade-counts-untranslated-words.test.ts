// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { theUpgradeMarkPath } from '../src/config/the-upgrade-mark.mjs'
import { baselineIsBack, git, remember, stableUpgradeFixture, write } from './stable-upgrade-fixture.ts'
import { closed, rows } from './a-closed-stable-upgrade.ts'

it('counts and lists absent, empty and unusable Chinese while accepting complete Chinese and later English additions', async () => {
  const { missingChinese } = await import('../tools/stable/untranslated-words.mjs')
  const english = { complete: 'Ready', absent: 'Waiting', empty: 'Read', counted: { one: '{n} item', other: '{n} items' }, join: ' ' }
  const chinese = { complete: '就绪', empty: ' ', counted: { other: '{n} 项' }, join: '' }
  expect(missingChinese(english, chinese)).toEqual(['absent', 'empty'])
  expect(missingChinese(english, { ...chinese, counted: { one: '{n} 项' } })).toEqual(['absent', 'counted', 'empty'])
  expect(missingChinese({ ...english, later: 'A later word' }, chinese)).toEqual(['absent', 'empty', 'later'])
})

it('answers a live count as JSON with exit zero even while words wait for translation', () => {
  const report = JSON.parse(execFileSync(process.execPath, ['tools/stable/untranslated-words.mjs', '--json'], { encoding: 'utf8' }))
  expect(report.untranslatedCount).toBe(report.missing.length)
  expect(report.sourceReviewCount).toBe(report.sourceReviews.length)
  for (const row of report.missing) {
    expect(row.key).toEqual(expect.any(String))
    expect(row.english).toBeDefined()
    expect(['office', 'office-map']).toContain(row.list)
  }
})

/*
 * THE COUNT IN A STABLE UPGRADE (tools/stable/upgrade-stable.criteria.md, item 15 (d)), on made-up offices only. The
 * made-up counter and notice contract are in tests/made-up-upgrade-words.ts: the counter gives what the file
 * `untranslated-count` in the fixture's folder says, and the contract drops the count while `notice-door-refuses-a-count`
 * is there. The AFTER text the real notice door writes is tested in
 * tests/the-stable-upgrade-notices-follow-the-transaction.test.ts, and the way back in
 * tests/the-stable-office-goes-back-to-its-previous-version.test.ts.
 */
type Fixture = Awaited<ReturnType<typeof stableUpgradeFixture>>
const theAfterOutcome = (result: { paths: { noticeJournal: string } }) => JSON.parse(rows(result.paths.noticeJournal).find((row) => row.step === 'after-ready').payload).outcome
const journalled = (result: { paths: { journal: string } }, step: string) => rows(result.paths.journal).filter((entry) => entry.step === step).map((entry) => entry.phase)

it('prints the count in the dry run, with the checkout and commit it counted and whether that is the target', async () => {
  const f = await stableUpgradeFixture()
  write(join(f.folder, 'untranslated-count'), '2')
  const dry = await upgradeStable(closed(f), { ...f.options, dry: true })
  expect(dry.state, JSON.stringify(dry)).toBe('dry')
  expect(dry.untranslatedWords).toEqual({ count: 2, checkout: f.dev, commit: f.target, isTarget: true })
  expect(dry.plan).toContain(`2 words are not yet translated into Chinese in ${f.dev} at ${f.target}. That is the target commit. The real run counts again in the candidate before the old office stops, and puts a count above zero in the AFTER notice. A target whose notice contract cannot take a count above zero is refused there.`)
  // A later commit in the development checkout: the dry run says it did not count the target.
  write(join(f.folder, 'untranslated-count'), '1')
  git(f.dev, 'commit', '--allow-empty', '-m', 'A made-up commit after the target'); const later = git(f.dev, 'rev-parse', 'HEAD')
  const moved = await upgradeStable(closed(f), { ...f.options, dry: true })
  expect(moved.untranslatedWords).toEqual({ count: 1, checkout: f.dev, commit: later, isTarget: false })
  expect(moved.plan.some((line: string) => line.startsWith(`1 word is not yet translated into Chinese in ${f.dev} at ${later}. That is not the target commit ${f.target}.`))).toBe(true)
  // A counter that is missing refuses the dry run. Validation refuses a development checkout with changes, so it is committed.
  git(f.dev, 'rm', '-q', 'tools/stable/untranslated-words.mjs'); git(f.dev, 'commit', '-m', 'A made-up commit without the counter')
  await expect(upgradeStable(closed(f), { ...f.options, dry: true })).rejects.toThrow(`The untranslated-word counter failed in ${f.dev}`)
  expect(readdirSync(f.recovery)).toEqual([])
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(false)
  expect(f.requests.filter((request) => request.method !== 'GET')).toEqual([])
}, 120_000)

it('puts a count above zero in the AFTER notice of a forward upgrade, counted in the candidate before the old office stops', async () => {
  const f = await stableUpgradeFixture()
  write(join(f.folder, 'untranslated-count'), '3')
  const result = remember(await upgradeStable(closed(f), f.options))
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(result.untranslatedWords).toBe(3)
  const entries = rows(result.paths.journal)
  const counted = entries.find((entry) => entry.step === 'untranslated-words' && entry.phase === 'counted')
  expect(counted).toMatchObject({ count: 3, says: 'The candidate shows 3 words in English on its Chinese pages.' })
  const at = (step: string, phase: string) => entries.findIndex((entry) => entry.step === step && entry.phase === phase)
  expect(at('untranslated-words', 'counted')).toBeLessThan(at('notice-contract', 'done'))
  expect(at('notice-contract', 'done')).toBeLessThan(at('closed-time', 'started'))
  expect(theAfterOutcome(result)).toMatchObject({ state: 'completed', untranslatedWords: 3 })
}, 120_000)

it('puts no count in the AFTER notice at zero, and still asks the target whether its notice contract can take one', async () => {
  const f = await stableUpgradeFixture()
  const result = remember(await upgradeStable(closed(f), f.options))
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(result.untranslatedWords).toBe(0)
  expect(journalled(result, 'notice-contract')).toContain('done')
  expect(theAfterOutcome(result).state).toBe('completed')
  expect(theAfterOutcome(result)).not.toHaveProperty('untranslatedWords')
}, 120_000)

/** The refusal happened before the old office stopped: nothing closed, no mark, the old version answers and the lock is gone. */
async function refusedBeforeTheOldOfficeStops(f: Fixture, result: { state: string; failure: string; paths: { journal: string } }, step: string) {
  expect(result.state, JSON.stringify(result)).toBe('unchanged')
  expect(result.failure).toContain(`${step} failed`)
  expect(journalled(result, 'closed-time')).toEqual([])
  expect(rows(result.paths.journal).some((entry) => entry.step.startsWith('old-stop-'))).toBe(false)
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(false)
  expect(existsSync(join(f.stable, '.git/stable-upgrade.lock'))).toBe(false)
  await baselineIsBack(f)
}

it('refuses the upgrade at the count when the counter fails, before the old office stops', async () => {
  const f = await stableUpgradeFixture()
  write(join(f.folder, 'untranslated-count.fails'), 'The made-up counter fails.')
  const result = remember(await upgradeStable(closed(f), f.options))
  await refusedBeforeTheOldOfficeStops(f, result, 'untranslated-words')
  expect(journalled(result, 'untranslated-words')).not.toContain('counted')
}, 120_000)

it('refuses a target whose notice contract cannot take a count above zero, before the old office stops, even at a count of zero', async () => {
  const f = await stableUpgradeFixture()
  write(join(f.folder, 'notice-door-refuses-a-count'), 'The made-up target was written before the count.')
  const result = remember(await upgradeStable(closed(f), f.options))
  await refusedBeforeTheOldOfficeStops(f, result, 'notice-contract')
  expect(rows(result.paths.journal).find((entry) => entry.step === 'untranslated-words' && entry.phase === 'counted')?.count).toBe(0)
}, 120_000)
