// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW ASKS THE STOP WHAT SHUT DOWN LEFT, AND ONLY ONCE THE SERVER HAS LET ITS LOCK GO. Wave 13t, round W40.
 *
 * The window hands its Shut down to the office page, and the page's door ends the server through its own way out
 * (src/server/index.ts). The server stops answering first, then ends the terminal holder, and lets its service lock go
 * last. Until this round the window quit as soon as the office stopped answering, so a holder the way out could not end
 * was left running and nobody was told. The window now waits for the lock to go and then runs `mole-office stop`, whose
 * sentence it shows when the stop did not end everything (src/desktop/what-the-shut-down-left.mjs). A stop run while
 * the lock is still there would find a server that no longer answers, and say that instead of what was left.
 *
 * WHAT IS MEASURED, with a lock file of this file's own and a stand-in for the stop:
 *   1. While the lock is there, the stop is not run. Once the lock has gone, it is run once, and its answer is returned.
 *   2. With no lock, the stop is run at once.
 *   3. A lock that stays past the limit does not hold the window: the stop is run then, and its answer is returned.
 *
 * WHAT THE WINDOW SAYS AFTER A STOP THAT DID NOT END EVERYTHING (round W41). Before it, the window said "Mole Office was
 * not shut down" and the stop's words, without the stop's exit code, even when the server had stopped and only the
 * terminal holder was left. Measured in English and Chinese, with the window's own words read by their keys:
 *   4. A stop that exited HOLDER_NOT_STOPPED is said as a server that stopped and a holder still running: the sentence
 *      names the exit code and the stop's words, and does not say that Mole Office was not shut down.
 *   5. Any other failed stop is said as Mole Office not shut down, with its exit code and its words.
 *   6. A stop that did not end with an exit code (it did not run, or a signal ended it) is said with its words and no
 *      number.
 *
 * WHAT IT DOES NOT MEASURE. The window itself (Electron) is not started here. src/desktop/main.mjs hands its own stop to
 * this function and passes its answer to whatTheWindowSaysOfTheStop, and the window was not walked on Windows or a Mac.
 * The real way out and the real stop are measured in tests/the-shutdown-door-ends-the-terminal-holder.test.ts.
 *
 * MUTATIONS, after a control run: the function does not wait for the lock (red: case 1, the stop ran while the lock was
 * there); the window says couldNotStop for every code (red: case 4); couldNotStop leaves out the code (red: case 5);
 * couldNotStop writes a missing code as a number would be (red: case 6).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { WINDOW_WORDS } from '../src/config/the-self-check-words.mjs'
import { EXIT } from '../src/config/the-service-command.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { whatTheShutDownLeft, whatTheWindowSaysOfTheStop } from '../src/desktop/what-the-shut-down-left.mjs'
import { TEST_DATABASE_PREFIX } from './a-test-folder.ts'

const folders: string[] = []

afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
})

/** A folder of this file's own, and the path of a service lock in it that no server holds. */
function aLockPath(): string {
  const folder = mkdtempSync(`${TEST_DATABASE_PREFIX}window-lock-`)
  folders.push(folder)
  return join(folder, 'office.db.lock')
}

/** Write a lock that reads as a lock, naming a made-up server. */
function writeALock(lockPath: string): void {
  writeFileSync(lockPath, JSON.stringify({ token: 'a-made-up-token', pid: 4242, pgid: 4242, port: 1, processStartedAt: 'a made-up start' }))
  expect(readTheServiceLock(lockPath).state, 'the lock this test wrote does not read as a lock').toBe('read')
}

/** What the stop answered, as the window's own stop answers. */
const THE_STOP_SAID = { ok: false, said: 'A made-up stop: the terminal holder was not stopped.' }

/** A stand-in for the stop that records when it was run and whether the lock was there then. */
function aStop(lockPath: string): { runTheStop: () => Promise<typeof THE_STOP_SAID>; runs: { lockWasThere: boolean }[] } {
  const runs: { lockWasThere: boolean }[] = []
  return {
    runs,
    runTheStop: () => {
      runs.push({ lockWasThere: readTheServiceLock(lockPath).state !== 'absent' })
      return Promise.resolve(THE_STOP_SAID)
    },
  }
}

describe("the window's Shut down asks the stop what was left", () => {
  it('1: does not run the stop while the lock is there, and runs it once when the lock has gone', async () => {
    const lockPath = aLockPath()
    writeALock(lockPath)
    const stop = aStop(lockPath)
    const answered = whatTheShutDownLeft({ lockPath, runTheStop: stop.runTheStop, within: 30_000 })
    await new Promise((later) => setTimeout(later, 1_500))
    expect(stop.runs, 'the stop was run while the server still held its lock').toEqual([])
    rmSync(lockPath)
    expect(await answered).toEqual(THE_STOP_SAID)
    expect(stop.runs).toEqual([{ lockWasThere: false }])
  }, 60_000)

  it('2: with no lock, runs the stop at once', async () => {
    const lockPath = aLockPath()
    const stop = aStop(lockPath)
    const since = Date.now()
    expect(await whatTheShutDownLeft({ lockPath, runTheStop: stop.runTheStop, within: 30_000 })).toEqual(THE_STOP_SAID)
    expect(Date.now() - since, 'the stop waited with no lock there').toBeLessThan(1_000)
    expect(stop.runs).toEqual([{ lockWasThere: false }])
  }, 60_000)

  it('3: a lock that stays past the limit does not hold the window, and the stop says what it finds', async () => {
    const lockPath = aLockPath()
    writeALock(lockPath)
    const stop = aStop(lockPath)
    const since = Date.now()
    expect(await whatTheShutDownLeft({ lockPath, runTheStop: stop.runTheStop, within: 1_000 })).toEqual(THE_STOP_SAID)
    const took = Date.now() - since
    expect(took, 'the stop did not wait for the lock').toBeGreaterThanOrEqual(1_000)
    expect(took, 'the stop waited far past the limit').toBeLessThan(10_000)
    expect(stop.runs).toEqual([{ lockWasThere: true }])
  }, 60_000)
})

/** Words of a made-up stop, with no number in them, so a number in the window's sentence is the exit code. */
const THE_STOPS_WORDS = 'A made-up stop said this, and nothing more.'

describe('what the window says after a stop that did not end everything', () => {
  for (const language of ['en', 'zh'] as const) {
    const words = WINDOW_WORDS[language]

    it(`4 (${language}): a stop that left the terminal holder is said as that, with its exit code and its words`, () => {
      const code = EXIT.HOLDER_NOT_STOPPED
      const sentence = whatTheWindowSaysOfTheStop({ code, said: THE_STOPS_WORDS }, words)
      expect(sentence).toBe(words.holderStillRunning(code, THE_STOPS_WORDS))
      expect(sentence, 'the sentence does not name the exit code').toContain(String(code))
      expect(sentence, "the sentence does not give the stop's words").toContain(THE_STOPS_WORDS)
      // The server did stop, so the sentence does not open as a stop that failed does.
      const notShutDown = words.couldNotStop(code, THE_STOPS_WORDS).split('`')[0]?.trim() ?? ''
      expect(notShutDown, 'couldNotStop has no words before the command').not.toBe('')
      expect(sentence).not.toContain(notShutDown)
    })

    it(`5 (${language}): any other failed stop is said as not shut down, with its exit code and its words`, () => {
      const sentences = [1, EXIT.STARTER_UNSUITABLE].map((code) => {
        const sentence = whatTheWindowSaysOfTheStop({ code, said: THE_STOPS_WORDS }, words)
        expect(sentence).toBe(words.couldNotStop(code, THE_STOPS_WORDS))
        expect(sentence, `the sentence does not name exit code ${String(code)}`).toContain(String(code))
        expect(sentence, "the sentence does not give the stop's words").toContain(THE_STOPS_WORDS)
        return sentence
      })
      expect(new Set(sentences).size, 'two exit codes gave one sentence').toBe(2)
    })

    it(`6 (${language}): a stop that did not end with an exit code is said with its words and no number`, () => {
      const sentence = whatTheWindowSaysOfTheStop({ code: null, said: THE_STOPS_WORDS }, words)
      expect(sentence).toBe(words.couldNotStop(null, THE_STOPS_WORDS))
      expect(sentence, "the sentence does not give the stop's words").toContain(THE_STOPS_WORDS)
      expect(sentence, 'the sentence names a code the stop did not give').not.toMatch(/\d|null|undefined/)
    })
  }
})
