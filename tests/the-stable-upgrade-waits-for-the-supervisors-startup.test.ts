// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE UPGRADE SAYS PUBLISHED ONLY ONCE THE NEW ORDINARY SERVICE'S SUPERVISOR HAS FINISHED ITS STARTUP. serve-dev's
 * startup can still end after its server answers, and a supervisor whose startup ends stops the server it started. So an
 * ordinary start's health step reads, from the start's own log, the line serve-dev prints once its startup is done
 * (src/config/supervisor-startup-done.mjs), and a start whose supervisor does not say it fails as an unhealthy one does.
 * The made-up target's serve-dev holds that line, or ends its startup without it (the fixture's THE_STARTUP). The
 * repositories, the database, the office and its supervisor are made up.
 *
 * Mutations, one at a time after a control run, then restored:
 * - the ordinary start's health step does not wait for the line: the first three cases are red;
 * - a group that ends during the wait is not noticed: the second case waits out the start limit and is red at its own
 *   time limit;
 * - the reads of the log are not bounded by health.attempts: the third case is red;
 * - the resume does not wait for the line: the fourth case is red;
 * - a journal that names no log is not noticed: the fifth case is red;
 * - a log that is gone is not noticed: the sixth case is red.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { resumeStableUpgrade, upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { theLogSaysTheStartupIsDone } from '../src/config/supervisor-startup-done.mjs'
import { baselineIsBack, remember, stableUpgradeFixture, THE_FIXTURE_HEALTH, track } from './stable-upgrade-fixture.ts'
import { configFor, crashTheUpgradeAt, rows, type Fixture } from './a-closed-stable-upgrade.ts'

/**
 * How long the made-up target's serve-dev holds its line after its office first answers healthy. It is several times
 * what the fixture's attempts would wait, and a release that does not wait for the line has published long before it.
 */
const HELD_MS = THE_FIXTURE_HEALTH.attempts * THE_FIXTURE_HEALTH.intervalMs * 5

/** A case-2 office whose target's serve-dev holds its line or ends its startup, with or without the fixture's attempts. */
async function aTarget(startup: { heldMs: number } | { endsAfterMs: number }, attempts: 'named' | 'left out') {
  const f = await stableUpgradeFixture(false, false, false, false, false, false, 2, 'taken', 0, null, startup)
  if (attempts === 'left out') delete f.config.health.attempts
  return f
}

/**
 * WHAT THE ORDINARY START'S LOG SAID AT EACH LINE OF THE JOURNAL that matters here: whether its supervisor had said its
 * startup was done. The log is the ordinary start's, named by its group-recorded line, or `log` for a resume, whose
 * start the crashed upgrade recorded. The supervisor is the one the first topology after it names.
 */
function theStartupAsJournalled(f: Fixture, log: string | null = null) {
  let supervisor: number | null = null
  const said: Array<{ step: string; phase: string; done: boolean | null }> = []
  const onJournal = (e: any) => {
    if (e.step === 'ordinary-start' && e.phase === 'group-recorded') { log = e.log; supervisor = null }
    if (e.step === 'ordinary-topology' && e.phase === 'observed' && log !== null && supervisor === null) supervisor = e.topology.supervisor.pid
    if (!['ordinary-topology', 'ordinary-start-health', 'resume-health', 'published', 'recovery'].includes(e.step)) return
    said.push({ step: e.step, phase: e.phase, done: log === null || supervisor === null ? null : theLogSaysTheStartupIsDone(readFileSync(log, 'utf8'), supervisor, f.config.servicePort) })
  }
  const at = (step: string, phase: string) => said.find((s) => s.step === step && s.phase === phase)
  return { onJournal, said, at }
}

/** The start answered while its supervisor still held its line, and published was journalled only once the line was there. */
function publishedAfterTheLine(seen: ReturnType<typeof theStartupAsJournalled>) {
  expect(seen.at('ordinary-topology', 'observed')?.done, JSON.stringify(seen.said)).toBe(false)
  expect(seen.at('published', 'verified')?.done, JSON.stringify(seen.said)).toBe(true)
}

/** The ordinary start's health step did not finish, nothing was published, and the old version is back. */
async function notPublished(f: Fixture, result: any) {
  expect(result.state, JSON.stringify(result)).toBe('restored')
  const journal = rows(result.paths.journal)
  expect(journal.some((e) => e.step === 'ordinary-start-health' && e.phase === 'done')).toBe(false)
  expect(journal.some((e) => e.step === 'published')).toBe(false)
  await baselineIsBack(f)
}

// One made-up office and a release whose ordinary start waits HELD_MS for its line: about half a minute here.
it('journals published only after the new supervisor says its startup is done', async () => {
  const f = await aTarget({ heldMs: HELD_MS }, 'left out')
  const seen = theStartupAsJournalled(f)
  const result = remember(await upgradeStable(f.config, { ...f.options, onJournal: seen.onJournal }))
  expect(result.state, JSON.stringify(result)).toBe('published')
  publishedAfterTheLine(seen)
}, 120_000)

// One made-up office and a release that rolls back once the target's supervisor ends its startup: under a minute here.
// Without health.attempts the wait may take six minutes, so a release that missed the end would run out this case's time.
it('does not report published when the new supervisor ends its startup, and restores the old version', async () => {
  const f = await aTarget({ endsAfterMs: HELD_MS }, 'left out')
  const seen = theStartupAsJournalled(f)
  await notPublished(f, remember(await upgradeStable(f.config, { ...f.options, onJournal: seen.onJournal })))
  expect(seen.at('recovery', 'attempt')?.done, JSON.stringify(seen.said)).toBe(false)
}, 120_000)

// One made-up office and a release that gives up on the held line after the fixture's attempts: under a minute here.
it('gives up on a held line after the reads health.attempts names, and restores the old version', async () => {
  const f = await aTarget({ heldMs: HELD_MS }, 'named')
  const seen = theStartupAsJournalled(f)
  await notPublished(f, remember(await upgradeStable(f.config, { ...f.options, onJournal: seen.onJournal })))
  expect(seen.at('recovery', 'attempt')?.done, JSON.stringify(seen.said)).toBe(false)
}, 120_000)

/** A closed release ended by SIGKILL as its ordinary start's health step begins, its lock, and the start it recorded. */
async function aCrashAsTheOrdinaryStartIsRead(f: Fixture) {
  const crash = await crashTheUpgradeAt(f, configFor(f, 'publishing'), { run: 'publishing', step: 'ordinary-start-health', phase: 'attempt', nth: 1 })
  expect(crash.reached, crash.said).toBe(true)
  const lock = join(f.stable, '.git/stable-upgrade.lock')
  const started = rows(lock).find((e) => e.step === 'ordinary-start' && e.phase === 'group-recorded')
  expect(started?.log, 'the crashed upgrade recorded the ordinary start with its log').toEqual(expect.any(String))
  return { lock, started }
}

/** The resume did not publish, restored the old version, and its failure names the ordinary start by its process group. */
async function aResumeThatCannotReadTheStart(f: Fixture, lock: string, started: any) {
  const resumed = remember(await resumeStableUpgrade(lock, { ...f.options, onStep: track }))
  await notPublished(f, resumed)
  expect(resumed.failure, 'the failure names the start it could not read').toContain(String(started.pgid))
}

// One made-up office, a closed release ended by SIGKILL as its ordinary start's health step begins, and the resume that
// finishes the generation it opened: about a minute here.
it('resumes a crash in the ordinary start\'s health step and journals published only after the line', async () => {
  const f = await aTarget({ heldMs: HELD_MS }, 'left out')
  const { lock, started } = await aCrashAsTheOrdinaryStartIsRead(f)
  const seen = theStartupAsJournalled(f, started.log)
  const resumed = remember(await resumeStableUpgrade(lock, { ...f.options, onStep: track, onJournal: seen.onJournal }))
  expect(resumed.state, JSON.stringify(resumed)).toBe('published')
  publishedAfterTheLine(seen)
}, 180_000)

// The crash of the case before, and a journal whose ordinary start names no log: about a minute here.
it('fails a resume whose journal names no log for the ordinary start, and restores the old version', async () => {
  const f = await aTarget({ heldMs: HELD_MS }, 'left out')
  const { lock, started } = await aCrashAsTheOrdinaryStartIsRead(f)
  const without = rows(lock).map((e) => e.step === 'ordinary-start' && e.phase === 'group-recorded' ? (({ log, ...rest }) => rest)(e) : e)
  writeFileSync(lock, without.map((e) => JSON.stringify(e) + '\n').join(''))
  await aResumeThatCannotReadTheStart(f, lock, started)
}, 180_000)

// The crash of the case before, and the ordinary start's log removed before the resume: about a minute here.
it('fails a resume whose ordinary start\'s log is gone, and restores the old version', async () => {
  const f = await aTarget({ heldMs: HELD_MS }, 'left out')
  const { lock, started } = await aCrashAsTheOrdinaryStartIsRead(f)
  rmSync(started.log)
  await aResumeThatCannotReadTheStart(f, lock, started)
}, 180_000)
