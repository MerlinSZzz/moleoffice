// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * BEFORE DOWNTIME, A CALL TO THE LIVE OFFICE THAT GETS NO ANSWER IS TRIED AGAIN FOR A MINUTE
 * (tools/stable/upgrade-stable.criteria.md, "A slimmer stable release", part 6). The release sends its reads and its
 * BEFORE notice to the live office through tools/stable/stable-upgrade-notices.mjs's `triedAgainForAMinute`: a call that
 * gets no answer is sent again, the same each time, and each try again is journalled. A call that still has no answer
 * when the minute is over stops the release before downtime, with the state unchanged, and the refusal names the call
 * and how long it waited. The emergency count is sent once whatever it gets, and from downtime on every call is sent
 * once: the AFTER notice that gets no answer is left pending, as before.
 *
 * A stand-in in front of the made-up office gives no answer to one call for a while: each try takes the release's own
 * transport timeout and then fails as a transport that got no answer does. The release reads the clock in this process,
 * through Date.now and setTimeout, so it runs on a fake clock that also moves on by itself. The stand-in moves that clock
 * on by the transport timeout at each try, and by the wrapper's pause as soon as the wrapper has set it, so the minute
 * passes on the release's clock without being waited for. The repositories, the database and the office are made up.
 *
 * Mutations, one at a time after a control run, then restored:
 * - no wrapper before downtime: the first case is red;
 * - the wrapper gives up after half the window: the second case is red (it says how long it waited);
 * - the wrapper sends the emergency count again: the third case is red (a mutation in stable-upgrade-notices.mjs);
 * - the wrapper after downtime as well: the fourth case is red.
 */
import { existsSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { THE_PAUSE_BETWEEN_TRIES_MS, THE_RETRY_WINDOW_MS } from '../tools/stable/stable-upgrade-notices.mjs'
import { upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { baselineIsBack, git, remember, stableUpgradeFixture } from './stable-upgrade-fixture.ts'
import { rows, type Fixture } from './a-closed-stable-upgrade.ts'

const NOTICE = '/api/office/upgrades/notice'
const THE_EMERGENCY_COUNT = '/api/office/gates/stable-emergency/met'
const NO_ANSWER = 'The made-up office gave no answer.'

type Request = { method: string, path: string, body?: any }

/**
 * The made-up office behind a stand-in that gives no answer to the calls `isTheCall` picks until `stallMs` has passed
 * since the first of them. Each try it receives is kept as it came. A try that gets no answer moves the fake clock on by
 * the transport timeout before it fails, and by the wrapper's pause as soon as the wrapper has set it.
 */
function aStallingOffice(f: Fixture, isTheCall: (request: Request) => boolean, stallMs: number) {
  const tries: Request[] = []
  let first: number | null = null
  const officeRequest = async (request: Request, destination?: { api: string }) => {
    if (isTheCall(request)) {
      tries.push(structuredClone(request))
      first ??= Date.now()
      if (Date.now() - first < stallMs) {
        vi.advanceTimersByTime(f.config.health.timeoutMs)
        // A call that is sent once has no pause after it, and the release may have ended and given the real clock back.
        setImmediate(() => { if (vi.isFakeTimers()) vi.advanceTimersByTime(THE_PAUSE_BETWEEN_TRIES_MS) })
        throw Object.assign(new Error(NO_ANSWER), { noAnswer: true })
      }
    }
    return f.options.officeRequest(request, destination)
  }
  Object.assign(officeRequest, { identity: (f.options.officeRequest as any).identity })
  return { tries, officeRequest }
}

/** One release through the stand-in, on a fake clock from its start to its end. */
async function release(f: Fixture, office: ReturnType<typeof aStallingOffice>) {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
  try { return remember(await upgradeStable(f.config, { ...f.options, officeRequest: office.officeRequest })) }
  finally { vi.useRealTimers() }
}

const theNotice = (stage: 'before' | 'after') => (request: Request) => request.method === 'POST' && request.path === NOTICE && request.body?.stage === stage

/** The lines that say a call was tried again. */
const triedAgain = (journal: any[]) => journal.filter((e) => e.step === 'live-office' && e.phase === 'tried-again')

// Each case builds one made-up office and runs one release, a few seconds each here. The limits leave room for a slower
// machine.
it('goes on when the BEFORE notice gets no answer for a while, and sends the same call each time', async () => {
  const f = await stableUpgradeFixture()
  const office = aStallingOffice(f, theNotice('before'), THE_RETRY_WINDOW_MS / 3)
  const result = await release(f, office)
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(office.tries.length, 'the notice was tried again').toBeGreaterThan(1)
  for (const tried of office.tries) expect(tried).toEqual(office.tries[0])
  const lines = triedAgain(rows(result.paths.journal))
  expect(lines).toHaveLength(office.tries.length - 1)
  for (const line of lines) expect(line.says).toContain(`POST ${NOTICE}`)
}, 240_000)

it('stops before downtime when the BEFORE notice gets no answer for longer than the window, with the state unchanged', async () => {
  const f = await stableUpgradeFixture()
  const office = aStallingOffice(f, theNotice('before'), THE_RETRY_WINDOW_MS * 1.5)
  const result = await release(f, office)
  expect(result.state, JSON.stringify(result)).toBe('unchanged')
  expect(result.failure).toContain(`POST ${NOTICE}`)
  const waited = Number(/after ([\d.]+) seconds/.exec(result.failure)?.[1])
  expect(waited, 'the refusal says how long it waited').toBeGreaterThanOrEqual(THE_RETRY_WINDOW_MS / 1000)
  expect(result.notices?.state).toBe('unconfirmed')
  expect(rows(result.paths.journal).some((e) => e.step.startsWith('old-stop-')), 'no old office was stopped').toBe(false)
  expect(existsSync(result.paths.lock), 'no lock is left').toBe(false)
  expect(git(f.stable, 'tag', '--list', f.config.candidateTag), 'no candidate tag').toBe('')
  await baselineIsBack(f)
}, 240_000)

it('sends an emergency count that gets no answer once, says so, and goes on', async () => {
  const f = await stableUpgradeFixture()
  f.policy.emergency()
  const office = aStallingOffice(f, (request) => request.method === 'POST' && request.path === THE_EMERGENCY_COUNT, Infinity)
  const result = await release(f, office)
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(office.tries, 'the count was sent once').toHaveLength(1)
  expect(rows(result.paths.journal).find((e) => e.step === 'emergency-count' && e.phase === 'said')?.says).toContain(NO_ANSWER)
}, 240_000)

it('sends the AFTER notice once after downtime, and leaves it pending when it gets no answer', async () => {
  const f = await stableUpgradeFixture()
  const office = aStallingOffice(f, theNotice('after'), Infinity)
  const result = await release(f, office)
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(office.tries, 'the AFTER notice was sent once').toHaveLength(1)
  expect(result.notices?.state).toBe('pending')
  expect(triedAgain(rows(result.paths.journal))).toEqual([])
}, 240_000)
