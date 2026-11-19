// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START STOPS WAITING, BY NAME, BEFORE ITS HOOK'S LIMIT. Hooks that start a browser stack ran out of time on the
 * cloud box, and the suite's log gave vitest's own words: the hook timed out, and nothing about what it was waiting
 * for. Now liveApp works out when the hook or case that called it must end, and stops waiting early enough to clear up
 * before that. It then refuses with a message that names the wait it stopped in. tests/the-time-a-hook-has-left.ts
 * reads each hook's limit and start time, and a case's from the case.
 *
 * THE LIVEAPP CASES START A REAL STACK and stall its Chromium launch, as tests/the-review-panel-setup-names-its-wait
 * .test.ts does. The hook that starts it is given a limit of the time a stopped start needs to clear up and 30 seconds
 * more, so the start stops waiting about 30 seconds in. The hook stops waiting itself a second before its limit, so a
 * start that does not stop is a red case below rather than a hook that timed out and cases that were skipped.
 *
 * MUTATION PROOF (logs named in the report of the run that added this file), each alone after a green control:
 *   - liveApp waits for Chromium's launch with no bound: the hook times out, and cases 5 and 6 go red;
 *   - a hook's limit is read as the runner's default for hooks, not the hook's own: cases 2 and 3 go red;
 *   - a case's limit is not read, so a start in a case is not bounded: cases 4 and 7 go red.
 */
import { join } from 'node:path'
import { chromium } from 'playwright'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import * as helpers from './helpers.ts'
import { closeTheBrowserThisWorkerShares, liveApp } from './helpers.ts'

const REPO = join(import.meta.dirname, '..')
const THE_MODULE = join(REPO, 'tests', 'the-time-a-hook-has-left.ts')

type TheEnd = { at: number; limitMs: number; of: 'hook' | 'case' }
type Reader = () => TheEnd | null

/** How long a start that stops is given to clear up, read by its name so this file type-checks before it is there. */
const CLEARS_UP_MS = Reflect.get(helpers, 'A_START_THAT_STOPS_CLEARS_UP_WITHIN_MS') as number | undefined
/** The limit of the hook that starts the stalled stack below. */
const STALLED_HOOK_MS = (CLEARS_UP_MS ?? 0) + 30_000

/** The reader of when the running hook or case must end, read by its path. */
async function theReader(): Promise<Reader> {
  const module = (await import(THE_MODULE)) as object
  const read = Reflect.get(module, 'whenThisHookOrCaseMustEnd') as Reader | undefined
  expect(read, 'tests/the-time-a-hook-has-left.ts exports whenThisHookOrCaseMustEnd').toBeTypeOf('function')
  return read!
}

/** What the reader said while this file was collected, when no hook or case was running, or the error it threw. */
const atCollection: unknown = await import(THE_MODULE).then(
  (module: object) => {
    try {
      return (Reflect.get(module, 'whenThisHookOrCaseMustEnd') as Reader)()
    } catch (error) {
      return error
    }
  },
  (error: unknown) => error,
)

/** A reading taken in a hook, with the time just before it, or what went wrong, kept for the case to say. */
type Taken = { before: number; end: TheEnd | null } | { failed: unknown }
const take = async (): Promise<Taken> => {
  try {
    const read = await theReader()
    const before = Date.now()
    return { before, end: read() }
  } catch (error) {
    return { failed: error }
  }
}

/** The end of a hook or case that started at most a second before `before`, with the limit `limitMs`. */
const expectTheEnd = (reading: Taken, limitMs: number, of: 'hook' | 'case'): void => {
  if ('failed' in reading) throw reading.failed
  const taken = reading
  expect(taken.end).toMatchObject({ limitMs, of })
  expect(taken.end!.at, 'the end is counted from the start of the hook or case').toBeLessThanOrEqual(taken.before + limitMs)
  expect(taken.end!.at, 'the end is counted from the start of the hook or case').toBeGreaterThan(taken.before + limitMs - 1_000)
}

let inTheFilesHook: Taken | null = null
beforeAll(async () => {
  inTheFilesHook = await take()
}, 41_000)

describe('the time a hook or case has left', () => {
  let inTheNestedHook: Taken | null = null
  let inEachHook: Taken | null = null
  beforeAll(async () => {
    inTheNestedHook = await take()
  }, 43_000)
  beforeEach(async () => {
    inEachHook = await take()
  }, 47_000)

  it('1: while no hook or case runs, the reader says it cannot tell, rather than guess', () => {
    expect(atCollection, 'the reader throws while the file is collected').toBeInstanceOf(Error)
    expect((atCollection as Error).message).toMatch(/could not tell which hook or case is running/u)
  })

  it('2: in a beforeAll, the end is the hook\'s start and its own limit, for the file\'s hook and for a nested one', () => {
    expectTheEnd(inTheFilesHook!, 41_000, 'hook')
    expectTheEnd(inTheNestedHook!, 43_000, 'hook')
  })

  it('3: in a beforeEach, the end is the hook\'s own', () => {
    expectTheEnd(inEachHook!, 47_000, 'hook')
  })
})

describe('the time a case has left', () => {
  it('4: in a case, the end is the case\'s start and its own limit', async () => {
    expectTheEnd(await take(), 53_000, 'case')
  }, 53_000)
})

describe('liveApp', () => {
  const name = 'a-start-stops-by-name'
  let refuse: ((error: Error) => void) | null = null
  let refused: unknown = null
  let tookMs = 0

  beforeAll(async () => {
    const began = Date.now()
    // A browser that an earlier test file in this process started would be taken without a launch, and there would be
    // no launch to stall.
    await closeTheBrowserThisWorkerShares()
    const blocked = new Promise<Awaited<ReturnType<typeof chromium.launch>>>((_resolve, reject) => { refuse = reject })
    vi.spyOn(chromium, 'launch').mockImplementationOnce(() => blocked)
    let timer: ReturnType<typeof setTimeout> | undefined
    const stillWaiting = new Promise<string>((resolve) => {
      timer = setTimeout(() => { resolve('the start was still waiting a second before the hook\'s limit') }, STALLED_HOOK_MS - 1_000)
    })
    refused = await Promise.race([
      liveApp({ name, viewport: { width: 640, height: 480 } }).then(
        async (app) => {
          await app.stop()
          return null
        },
        (error: unknown) => error,
      ),
      stillWaiting,
    ])
    clearTimeout(timer)
    tookMs = Date.now() - began
  }, STALLED_HOOK_MS)

  afterAll(() => {
    refuse?.(new Error('The test released the stalled Chromium launch.'))
    vi.restoreAllMocks()
  })

  it('5: a start that a stalled launch holds up stops waiting before the hook\'s limit, and says what it waited for', () => {
    expect(CLEARS_UP_MS, 'helpers.ts says how long a start that stops is given to clear up').toBeTypeOf('number')
    expect(refused, 'the start was refused').toBeInstanceOf(Error)
    const message = (refused as Error).message
    expect(message).toContain(`the stack for the browser test ${name} stopped waiting for Chromium to launch`)
    expect(message, 'the refusal gives the hook\'s limit').toContain(`its hook may take ${String(STALLED_HOOK_MS / 1000)} s`)
    expect(message, 'the refusal gives the time kept back to clear up').toContain(`${String(CLEARS_UP_MS! / 1000)} s of that to clear up`)
  })

  it('6: it stopped once the time kept back to clear up was all that was left, and cleared up within it', () => {
    expect(refused, 'the start stopped by itself').toBeInstanceOf(Error)
    expect(tookMs, 'it did not stop before it had to').toBeGreaterThanOrEqual(STALLED_HOOK_MS - CLEARS_UP_MS! - 1_000)
    expect(tookMs, 'the refusal came before the hook\'s limit').toBeLessThan(STALLED_HOOK_MS)
  })

  it('7: in a case with less time than a start that stops needs to clear up, it starts nothing and says so', async () => {
    expect(CLEARS_UP_MS, 'helpers.ts says how long a start that stops is given to clear up').toBeGreaterThan(10_000)
    const began = Date.now()
    const stages: string[] = []
    const said = await liveApp({ name: 'a-start-with-no-time', viewport: { width: 640, height: 480 }, onSetupWait: (what) => { stages.push(what) } })
      .then(async (app) => {
        await app.stop()
        return null
      }, (error: unknown) => error)
    expect(said).toBeInstanceOf(Error)
    expect((said as Error).message).toContain('the stack for the browser test a-start-with-no-time did not start: its case had ')
    expect((said as Error).message).toContain(`less than the ${String(CLEARS_UP_MS! / 1000)} s a start that stops needs to clear up`)
    expect(stages, 'nothing was started').toEqual([])
    expect(Date.now() - began, 'it said so at once').toBeLessThan(1_000)
  }, 10_000)
})
