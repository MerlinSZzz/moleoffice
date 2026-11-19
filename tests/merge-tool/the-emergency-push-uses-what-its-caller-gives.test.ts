// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMERGENCY PUSH USES WHAT ITS CALLER GIVES.
 *
 * tools/merge-tool/emergency-push.mjs used to import ask and sleep from office-keeper.mjs, the module that talks to the
 * office. It now takes both from its caller, so the module reaches no office module itself. tools/the-merger.mjs passes
 * its own ask and office-keeper.mjs's sleep, testing.mjs passes office-keeper.mjs's ask, and land.mjs passes the ask its
 * caller gives landGit. The guard,
 * tests/the-merge-tool-reaches-the-office-only-through-two-modules.test.ts, reads the imports as its own case.
 *
 * WHAT THIS FILE PROVES:
 * 1. runTheEmergencyPush rejects with exactly THE_EMERGENCY_PUSH_NEEDS_ASK_AND_SLEEP when given no sleep, a sleep that
 *    is not a function, or no ask. The whatAboutTheOffice it is given is never called, and the office-keeper ask and
 *    sleep mocks are never reached.
 * 2. sayThePushesThatMovedMain rejects with exactly SAYING_THE_PUSHES_NEEDS_ASK when given no fourth argument, {}, or
 *    an ask that is not a function, and the office-keeper mocks are not reached.
 * 3. The given functions are the ones used. (a) sayThePushesThatMovedMain calls the given ask once, with GET and a
 *    merge-list path, and reaches no office-keeper mock. (b) runTheEmergencyPush waits with the given sleep: in a
 *    scratch repository whose merge queue names a landing entry of it, it rejects with the given sleep's own error,
 *    that sleep is called once with everyMs, and no office-keeper mock is reached.
 * THE OFFICE-KEEPER MOCKS THROW, so the old code is red at once with a plain sentence instead of reaching the office.
 * The log-and-state mock records the log and throws on fail. The arguments mock keeps the module from reading the test
 * runner's own command line, which arguments.mjs would end the process over.
 *
 * CASE 3(b) IS RED ON THE OLD CODE. The old code waited with office-keeper.mjs's sleep, so the office-keeper mock threw
 * before the given sleep was called, and the case saw that mock's sentence instead of the given sleep's.
 *
 * PROOF RUNS (chapter 5 rule 1), each with `node tools/run-named-tests.mjs <files>`, logs kept outside the checkout:
 * - control, after commit 2 (control-c2-red.log): the new file red in cases 1, 2, 3(a), 3(b) and 4 on the old code,
 *   each for its own reason, and the guard green.
 * - mutation 1 (m1-guard-red.log): the office-keeper import put back in emergency-push.mjs made the guard red in case 1
 *   alone, naming emergency-push.mjs; the restore was green (m1-guard-green.log).
 * - mutation 2 (m2-case1-red.log): the first-statement check of runTheEmergencyPush taken out turned case 1 red; the
 *   restore was green (m2-green.log).
 * - mutation 3 (m3-case2-red.log): the first-statement check of sayThePushesThatMovedMain taken out turned case 2 red;
 *   the restore was green (m3-green.log).
 * - restore: the new file, the guard and the three changed test files green (c4-green.log).
 *
 * ROUND 206: land.mjs comes off the not-yet-moved list, so its case 4 no longer holds it to the office-keeper import; it
 * now checks the ask its caller gives landGit (decision BxtP4m3YkTOQ).
 * - control, at the Criterion commit before the Code commit (r206-control-criterion.log): case 4 red on land.mjs's
 *   office-keeper import and its options list, the other four cases green; 1 failed and 4 passed.
 * - after the Code commit (r206-code-green.log): the file green, 5 passed.
 * - mutation 1 (r206-m1-import-red.log): the ask import put back in land.mjs made case 4 red; the restore was green
 *   (r206-m1-import-green.log).
 * - mutation 2 (r206-m2-call-red.log): land.mjs's sayThePushesThatMovedMain call without ask made case 4 red; the restore
 *   was green (r206-m2-call-green.log).
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'

const said = vi.hoisted(() => ({ log: [] as string[], officeAsk: 0, officeSleep: 0 }))

vi.mock('../../tools/merge-tool/arguments.mjs', () => ({
  ABSENT: 'absent',
  GIT_IDENTITY: {
    GIT_AUTHOR_NAME: 'Synthetic queue',
    GIT_AUTHOR_EMAIL: 'synthetic@example.invalid',
    GIT_COMMITTER_NAME: 'Synthetic queue',
    GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
  },
  WORKDIR: '/nonexistent',
  chosen: { entry: 'synthetic-entry', sandboxes: '/synthetic/work' },
  theMainMirrorOf: () => '/synthetic/mirror',
}))

vi.mock('../../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (message: string) => {
    throw Error(message)
  },
  log: (line: string) => {
    said.log.push(line)
  },
  ACloneNamesAProgram: class ACloneNamesAProgram extends Error {},
}))

vi.mock('../../tools/merge-tool/office-keeper.mjs', () => ({
  ask: async () => {
    said.officeAsk += 1
    throw Error('the emergency push reached office-keeper.mjs itself')
  },
  sleep: async () => {
    said.officeSleep += 1
    throw Error('the emergency push reached office-keeper.mjs itself')
  },
}))

import * as thePush from '../../tools/merge-tool/emergency-push.mjs'

const NEEDED_ASK_AND_SLEEP = Reflect.get(thePush, 'THE_EMERGENCY_PUSH_NEEDS_ASK_AND_SLEEP') as unknown
const NEEDED_ASK = Reflect.get(thePush, 'SAYING_THE_PUSHES_NEEDS_ASK') as unknown

/** The two functions as this file calls them, so it compiles before and after the module takes the new arguments. */
type RunTheEmergencyPush = (given: Record<string, unknown>) => Promise<unknown>
type SayThePushes = (root: string, from: string, to: string, given?: Record<string, unknown>) => Promise<unknown>
const runTheEmergencyPush = thePush.runTheEmergencyPush as unknown as RunTheEmergencyPush
const sayThePushesThatMovedMain = thePush.sayThePushesThatMovedMain as unknown as SayThePushes

/** An ask that is never reached by the new code, and that says so if the old code reaches it. */
const anAskThatShouldNotBeReached = async () => {
  throw Error('the given ask was reached before the arguments were checked')
}

/** The message a call rejects with, so a case compares the sentence whole rather than its opening words. */
async function theRefusal(call: () => Promise<unknown>): Promise<string> {
  try {
    await call()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw Error('the call was accepted with arguments it did not get')
}

const A_MESSAGE = { id: 'made-up-message', seq: 1, contentHash: 'made-up-hash' }

const madeFolders: string[] = []

afterAll(() => {
  for (const folder of madeFolders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

it('runTheEmergencyPush refuses with its sentence when it is given no sleep, a sleep that is not a function, or no ask', async () => {
  expect(typeof NEEDED_ASK_AND_SLEEP).toBe('string')
  expect((NEEDED_ASK_AND_SLEEP as string).length).toBeGreaterThan(0)

  const given: [string, Record<string, unknown>][] = [
    ['no sleep', { ask: anAskThatShouldNotBeReached }],
    ['a sleep that is not a function', { ask: anAskThatShouldNotBeReached, sleep: 'not a function' }],
    ['no ask', { sleep: async () => {} }],
  ]
  for (const [because, one] of given) {
    const whatAboutTheOffice = vi.fn(async () => ({ mainOnly: true, says: 'A synthetic office.' }))
    const message = await theRefusal(() =>
      runTheEmergencyPush({ root: '/synthetic-root', commit: 'a'.repeat(40), message: A_MESSAGE, whatAboutTheOffice, everyMs: 7, ...one }),
    )
    expect(message, because).toBe(NEEDED_ASK_AND_SLEEP)
    expect(whatAboutTheOffice, because).not.toHaveBeenCalled()
  }

  expect(said.officeAsk).toBe(0)
  expect(said.officeSleep).toBe(0)
})

it('sayThePushesThatMovedMain refuses with its sentence when it is given no fourth argument, {}, or an ask that is not a function', async () => {
  expect(typeof NEEDED_ASK).toBe('string')
  expect((NEEDED_ASK as string).length).toBeGreaterThan(0)

  const calls: [string, () => Promise<unknown>][] = [
    ['no fourth argument', () => sayThePushesThatMovedMain('/synthetic-root', 'a'.repeat(40), 'b'.repeat(40))],
    ['an empty object', () => sayThePushesThatMovedMain('/synthetic-root', 'a'.repeat(40), 'b'.repeat(40), {})],
    ['an ask that is not a function', () => sayThePushesThatMovedMain('/synthetic-root', 'a'.repeat(40), 'b'.repeat(40), { ask: 'not a function' })],
  ]
  for (const [because, call] of calls) {
    expect(await theRefusal(call), because).toBe(NEEDED_ASK)
  }

  expect(said.officeAsk).toBe(0)
  expect(said.officeSleep).toBe(0)
})

it('sayThePushesThatMovedMain asks the given ask once, with GET and its merge-list path', async () => {
  const asked: [string, string][] = []
  const ask = async (method: string, path: string) => {
    asked.push([method, path])
    return { status: 200, body: { lanes: [], emergencyPushes: [] } }
  }

  await sayThePushesThatMovedMain('/synthetic-root', 'a'.repeat(40), 'b'.repeat(40), { ask })

  expect(asked).toHaveLength(1)
  expect(asked[0]![0]).toBe('GET')
  expect(asked[0]![1].startsWith('/api/merge-queue?lane=')).toBe(true)
  expect(said.officeAsk).toBe(0)
  expect(said.officeSleep).toBe(0)
})

it('runTheEmergencyPush waits with the given sleep, and calls it once with everyMs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'emergency-push-sleep-'))
  madeFolders.push(root)
  execFileSync('git', ['init', '--quiet', root], { encoding: 'utf8' })

  const ask = async (method: string, path: string) => {
    if (method === 'GET' && path.startsWith('/api/merge-queue?')) {
      return { status: 200, body: { lanes: [{ lane: root, entries: [{ id: 'synthetic-entry', state: 'landing', lane: root }] }], emergencyPushes: [] } }
    }
    return { status: 418, body: { error: 'This synthetic office takes no emergency push.' } }
  }
  const waited: number[] = []
  const sleep = async (ms: number) => {
    waited.push(ms)
    throw Error('synthetic sleep')
  }

  const message = await theRefusal(() =>
    runTheEmergencyPush({
      root,
      commit: 'a'.repeat(40),
      message: A_MESSAGE,
      ask,
      sleep,
      whatAboutTheOffice: async () => ({ mainOnly: true, says: 'A synthetic office.' }),
      waitMs: 60_000,
      everyMs: 7,
    }),
  )

  expect(message).toBe('synthetic sleep')
  expect(waited).toEqual([7])
  expect(said.officeAsk).toBe(0)
  expect(said.officeSleep).toBe(0)
})

