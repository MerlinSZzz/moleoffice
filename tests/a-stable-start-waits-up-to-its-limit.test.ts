// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START MAY TAKE UP TO ITS LIMIT (tools/stable/upgrade-stable.criteria.md, "A slimmer stable release", part 5). With
 * no health.attempts in the configuration, each start of the release waits for its health answer until the release's
 * start limit has passed since the start began, and the dry plan says the limit and where it came from. Each start's
 * health line says, in `seconds` and in its sentence, how long the start took to answer. With the attempts named, the
 * wait is as it was. The made-up target's office waits before it listens (the fixture's slow start, which sleeps and
 * burns no processor) for longer than the fixture's attempts would wait. The repositories, the database and the office
 * are made up.
 *
 * Mutations, one at a time after a control run, then restored:
 * - with no attempts, the health is read once: the second and fourth cases are red;
 * - the seconds are left out of the health lines: the second and fourth cases are red.
 */
import { expect, it } from 'vitest'
import { THE_START_LIMIT_MS, upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { baselineIsBack, remember, stableUpgradeFixture, THE_FIXTURE_HEALTH, track } from './stable-upgrade-fixture.ts'
import { rows, type Fixture } from './a-closed-stable-upgrade.ts'

/**
 * Five times what the fixture's attempts would wait, if each read failed at once. Each read takes a little time of its
 * own, so the attempts wait a little longer than their product; five times leaves them well short.
 */
const SLOW_START_MS = THE_FIXTURE_HEALTH.attempts * THE_FIXTURE_HEALTH.intervalMs * 5

/** A case-2 office whose target is slow to start, and its configuration with the attempts left out. */
async function aSlowTarget() {
  const f = await stableUpgradeFixture(false, false, false, false, false, false, 2, 'taken', SLOW_START_MS)
  delete f.config.health.attempts
  return f
}

/** The done line of each start's health, by the start's name. */
function healthLines(f: Fixture, journal: any[]) {
  return Object.fromEntries(journal.filter((e) => /-health$/.test(e.step) && e.phase === 'done').map((e) => [e.step.replace(/-health$/, ''), e]))
}

/** Each named start's done line holds its seconds, at least `atLeast`, and its sentence says them. */
function theSecondsAreSaid(lines: Record<string, any>, names: string[], atLeast: number) {
  for (const name of names) {
    const line = lines[name]
    expect(line, `${name} has a health done line`).toBeDefined()
    expect(line.seconds, name).toEqual(expect.any(Number))
    expect(line.seconds, name).toBeGreaterThanOrEqual(atLeast)
    expect(line.says, name).toContain(String(line.seconds))
  }
}

// The criteria give the limit as 6 minutes; this keeps a change of it from going by unseen.
it('keeps the start limit at six minutes', () => {
  expect(THE_START_LIMIT_MS).toBe(6 * 60_000)
})

// One made-up office and one release whose three starts each wait SLOW_START_MS: about a minute and a half here. The
// limit leaves room for a slower machine.
it('waits for a slow start without attempts, says the limit in the plan, and says each start\'s seconds', async () => {
  const f = await aSlowTarget()
  const dry = await upgradeStable(f.config, { ...f.options, dry: true })
  expect(dry.state, JSON.stringify(dry)).toBe('dry')
  const minutes = `${String(THE_START_LIMIT_MS / 60_000)} minutes`
  expect(dry.plan.filter((line: string) => line.includes(minutes)), 'one plan line says the limit').toHaveLength(1)
  expect(dry.plan.find((line: string) => line.includes(minutes))).toMatch(/default/i)
  const result = remember(await upgradeStable(f.config, f.options))
  expect(result.state, JSON.stringify(result)).toBe('published')
  theSecondsAreSaid(healthLines(f, rows(result.paths.journal)), ['candidate-check', 'stable-check', 'ordinary-start'], SLOW_START_MS / 1000)
}, 300_000)

// One made-up office, a dry run and a release that stops at its first start: under a minute here.
it('gives up on the same slow start when the attempts are named, before anything is stopped', async () => {
  const f = await stableUpgradeFixture(false, false, false, false, false, false, 2, 'taken', SLOW_START_MS)
  const dry = await upgradeStable(f.config, { ...f.options, dry: true })
  expect(dry.plan.filter((line: string) => line.includes(`health.attempts`) && line.includes(String(THE_FIXTURE_HEALTH.attempts))), 'one plan line says the attempts').toHaveLength(1)
  const result = remember(await upgradeStable(f.config, f.options))
  expect(result.state, JSON.stringify(result)).toBe('unchanged')
  const journal = rows(result.paths.journal)
  expect(journal.some((e) => e.step === 'candidate-check-health' && e.phase === 'done')).toBe(false)
  expect(journal.some((e) => e.step.startsWith('old-stop-'))).toBe(false)
  await baselineIsBack(f)
}, 240_000)

// One made-up office and a release that rolls back after the slow target has started once: about a minute here.
it('says the seconds of the recovery\'s starts as well', async () => {
  const f = await aSlowTarget()
  const result = remember(await upgradeStable(f.config, { ...f.options, onStep: (event: any) => { track(event); if (event.step === 'install-artifacts' && event.phase === 'after') throw new Error('Synthetic failure after install-artifacts') } }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  const lines = healthLines(f, rows(result.paths.journal))
  // The previous version starts at once, so its seconds are only said, with no lower bound.
  theSecondsAreSaid(lines, ['recover-start', ...(lines['recover-check'] ? ['recover-check'] : [])], 0)
  await baselineIsBack(f)
}, 240_000)
