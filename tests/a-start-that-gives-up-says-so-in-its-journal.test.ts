// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START THAT GIVES UP SAYS SO IN ITS JOURNAL, AND SAYS WHEN ITS CLEARING UP ENDED.
 *
 * A stage writes one row when it begins, and this file proves it writes another when it stops waiting, followed by
 * one when the clearing up after the failed start has ended. The liveApp case stalls Chromium's launch, as
 * tests/a-start-stops-waiting-by-name-before-its-hooks-limit.test.ts does, so the stage that waits for Chromium is
 * the one that gives up. The hook that starts it is given a limit of the time a stopped start needs to clear up and
 * 30 seconds more.
 *
 * MUTATION PROOF (logs named in the report of the run that added this file), each alone after a green control:
 *   - the give-up row is not written: both cases go red;
 *   - the end row is not written: case 2 goes red;
 *   - the end row is written at the top of the catch, before its wait: case 2 goes red.
 */
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import * as helpers from './helpers.ts'
import { A_START_THAT_STOPS_CLEARS_UP_WITHIN_MS, closeTheBrowserThisWorkerShares, liveApp } from './helpers.ts'
import { theSetupWaitsKeptFor, type Wait } from './a-start-keeps-its-waits.ts'

/** The limit of the hook that starts the stalled stack below. */
const STALLED_HOOK_MS = A_START_THAT_STOPS_CLEARS_UP_WITHIN_MS + 30_000

/** What a give-up row begins with, read by its name so this file runs before that name is there. */
const GIVE_UP_PREFIX = Reflect.get(helpers, 'THE_GIVE_UP_PREFIX') as string | undefined
/** The wait named when the failed start begins to clear up, read the same way. */
const CLEANING_UP = Reflect.get(helpers, 'THE_CLEARING_UP_AFTER_A_FAILED_START') as string | undefined
/** What the row says when the clearing up has ended, read the same way. */
const CLEANING_UP_ENDED = Reflect.get(helpers, 'THE_CLEARING_UP_AFTER_A_FAILED_START_ENDED') as string | undefined

describe('a start that gives up', () => {
  const name = 'a-start-that-gives-up'
  let refuse: ((error: Error) => void) | null = null
  let refused: unknown = null
  let refusedAt: number | null = null
  let began = 0
  let rows: Wait[] = []

  beforeAll(async () => {
    // The hook's limit counts from the hook's start, so this is the start the give-up's lower bound is measured from.
    began = Date.now()
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
    refusedAt = Date.now()
    clearTimeout(timer)
    const file = expect.getState().testPath
    if (typeof file !== 'string' || file === '') throw new Error('The case could not find its own test file to read its journal.')
    const kept = theSetupWaitsKeptFor(file)
    const who = kept[0]?.who
    rows = who === undefined ? [] : kept.filter((row) => row.who === who)
  }, STALLED_HOOK_MS)

  afterAll(() => {
    refuse?.(new Error('The test released the stalled Chromium launch.'))
    vi.restoreAllMocks()
  })

  it('a stage that gives up writes so in the journal, after the stage it gave up in', () => {
    expect(GIVE_UP_PREFIX, 'helpers.ts says what a give-up row begins with').toBeTypeOf('string')
    const giveUpAt = rows.findIndex((row) => row.what.startsWith(GIVE_UP_PREFIX!))
    expect(giveUpAt, 'a stage gave up in the journal').toBeGreaterThanOrEqual(0)
    const gaveUpOn = rows[giveUpAt]!.what.slice(GIVE_UP_PREFIX!.length)
    const stageAt = rows.findIndex((row) => row.what === gaveUpOn)
    expect(stageAt, 'the stage that gave up has its own row').toBeGreaterThanOrEqual(0)
    expect(giveUpAt, 'the give-up row comes after the stage it gave up in').toBeGreaterThan(stageAt)
    expect(rows[giveUpAt]!.at, 'the give-up is no earlier than the stage').toBeGreaterThanOrEqual(rows[stageAt]!.at)
    expect(rows[giveUpAt]!.at, 'the give-up came when it was due, not later').toBeGreaterThanOrEqual(
      began + STALLED_HOOK_MS - A_START_THAT_STOPS_CLEARS_UP_WITHIN_MS - 1_000,
    )
  })

  it('a start that gave up writes in the journal when its clearing up ended', () => {
    expect(GIVE_UP_PREFIX, 'helpers.ts says what a give-up row begins with').toBeTypeOf('string')
    expect(CLEANING_UP, 'helpers.ts names the wait that clears up a failed start').toBeTypeOf('string')
    expect(CLEANING_UP_ENDED, 'helpers.ts says what the end row says').toBeTypeOf('string')
    const giveUpAt = rows.findIndex((row) => row.what.startsWith(GIVE_UP_PREFIX!))
    expect(giveUpAt, 'a stage gave up in the journal').toBeGreaterThanOrEqual(0)
    expect(rows[giveUpAt + 1]?.what, 'the clearing up follows the give-up').toBe(CLEANING_UP)
    const ended = rows[giveUpAt + 2]
    expect(ended?.what, 'the clearing up ended after it began').toBe(CLEANING_UP_ENDED)
    expect(refusedAt, 'the hook kept the time it got the refusal').toBeTypeOf('number')
    expect(ended!.at, 'the end row is no later than the refusal').toBeLessThanOrEqual(refusedAt!)
  })
})
