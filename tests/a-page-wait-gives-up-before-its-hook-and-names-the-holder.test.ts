// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WAIT FOR A PAGE GIVES UP BEFORE THE HOOK AROUND IT, AND SAYS WHO HOLDS THE LOCK.
 *
 * Two red runs on 2 and 3 November 2026 ended inside the page build of tests/helpers.ts and neither
 * said why. The wait and the hook around it both allowed five minutes, so the hook ended first and
 * the refusal that names the lock never printed. A waiting process now gives up at four minutes,
 * says how long it waited and what who.txt says about the holder, and stops a build that is still
 * running at that limit.
 *
 * EVERY CASE USES A LOCK OF ITS OWN under a temporary folder, never the checkout's dist/. The holder
 * is a `node -e` process this file starts, and each case ends it.
 *
 * WHAT THIS FILE DRIVES. `waitForAPage` in tests/helpers.ts takes the lock, the who.txt path, the
 * limit, the readiness check and the build as arguments, so a short wait can be driven here. The two
 * real waits call it with the checkout's paths and the four-minute limit.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HOW_LONG_A_PAGE_WAIT_MAY_LAST,
  theWordsWhenAPageWaitGivesUp,
  waitForAPage,
  type ABuildOfThePage,
  type APageWaitedFor,
} from './helpers.ts'

/** The folder this case made, and every process it started. Both are cleared after each case. */
let folder = ''
let children: ChildProcess[] = []

/** Start a node process that does nothing until it is told to stop. */
function startANodeThatSleeps(script = 'setInterval(() => {}, 1000)'): ChildProcess {
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  return child
}

/** End that process, if it has not ended already; a process that ignores SIGTERM is killed. */
async function theEndOf(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const ended = new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    child.once('exit', () => resolve())
  })
  child.kill('SIGTERM')
  const kill = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }, 1_000)
  await ended
  clearTimeout(kill)
}

/** A lock directory and its who.txt, under a temporary folder this case owns. */
function aLockOfThisCasesOwn(): { lock: string; who: string } {
  folder = mkdtempSync(join(tmpdir(), 'a-page-wait-'))
  const lock = join(folder, 'the-lock')
  return { lock, who: join(lock, 'who.txt') }
}

/** A started build whose child never exits, with the output it has printed so far. */
function aBuildThatNeverEnds(
  script = "process.stdout.write('a stand-in build that never ends\\n'); setInterval(() => {}, 1000)",
): { running: ABuildOfThePage; child: ChildProcess } {
  const child = startANodeThatSleeps(script)
  let output = ''
  child.stdout?.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    output += String(chunk)
  })
  let ended = false
  const endedPromise = new Promise<void>((resolve) => {
    child.once('exit', () => {
      ended = true
      resolve()
    })
  })
  return {
    child,
    running: {
      ended: endedPromise,
      output: () => output,
      stop: (signal) => {
        if (ended) return false
        return child.kill(signal)
      },
    },
  }
}

/** Run the wait and hand back its refusal, or null because it returned instead. */
async function whatTheWaitSays(asked: APageWaitedFor): Promise<Error | null> {
  try {
    await waitForAPage(asked)
    return null
  } catch (err) {
    return err as Error
  }
}

afterEach(async () => {
  await Promise.all(children.map(theEndOf))
  children = []
  if (folder !== '') rmSync(folder, { recursive: true, force: true })
  folder = ''
})

describe('a wait for a page that gives up', () => {
  it('names the live process in who.txt, and says how long it waited', async () => {
    const { lock, who } = aLockOfThisCasesOwn()
    const holder = startANodeThatSleeps()
    mkdirSync(lock, { recursive: true })
    writeFileSync(who, `process ${String(holder.pid)}\n`)
    let builds = 0
    const limit = 2_000
    const began = Date.now()
    const refusal = await whatTheWaitSays({
      lock,
      who,
      limit,
      ready: () => false,
      build: () => {
        builds += 1
        throw new Error('this wait built the page while another process held the lock')
      },
      builds: () => builds,
      refusal: (seen) => theWordsWhenAPageWaitGivesUp('the page a browser test is served', seen, builds),
    })
    expect(refusal, 'the wait returned; it should have refused').not.toBeNull()
    const said = refusal?.message ?? ''
    expect(builds, said).toBe(0)
    expect(said).toContain(`process ${String(holder.pid)}`)
    expect(said).toContain('still running')
    expect(said).toContain('0 builds')
    const waited = /after (\d+) seconds of waiting/.exec(said)
    expect(waited, said).not.toBeNull()
    expect(Number(waited?.[1])).toBeGreaterThanOrEqual(Math.floor(limit / 1000))
    expect(Date.now() - began).toBeGreaterThanOrEqual(limit)
    expect(existsSync(lock), 'a live holder had its lock removed').toBe(true)
  }, 20_000)

  it('says who.txt could not be read when it is missing, and never guesses a process', async () => {
    const { lock, who } = aLockOfThisCasesOwn()
    mkdirSync(lock, { recursive: true })
    const refusal = await whatTheWaitSays({
      lock,
      who,
      limit: 1_500,
      ready: () => false,
      build: () => {
        throw new Error('this wait built the page while the lock held no readable holder')
      },
      builds: () => 0,
      refusal: (seen) => theWordsWhenAPageWaitGivesUp('the page a browser test is served', seen, 0),
    })
    expect(refusal, 'the wait returned; it should have refused').not.toBeNull()
    const said = refusal?.message ?? ''
    expect(said).toContain('could not be read')
    expect(said).toContain(lock)
    expect(said).not.toMatch(/\bprocess \d+\b/)
  }, 20_000)

  it('says who.txt says nothing readable, and never guesses a process', async () => {
    const { lock, who } = aLockOfThisCasesOwn()
    mkdirSync(lock, { recursive: true })
    writeFileSync(who, 'the builder is a person, not a process\n')
    const refusal = await whatTheWaitSays({
      lock,
      who,
      limit: 1_500,
      ready: () => false,
      build: () => {
        throw new Error('this wait built the page while the lock said nothing readable')
      },
      builds: () => 0,
      refusal: (seen) => theWordsWhenAPageWaitGivesUp('the page a browser test is served', seen, 0),
    })
    expect(refusal, 'the wait returned; it should have refused').not.toBeNull()
    const said = refusal?.message ?? ''
    expect(said).toContain('says nothing readable')
    expect(said).toContain(lock)
    expect(said).not.toMatch(/\bprocess \d+\b/)
  }, 20_000)

  it('stops a build that does not end, and says so with the last of what it printed', async () => {
    const { lock, who } = aLockOfThisCasesOwn()
    let builds = 0
    let child: ChildProcess | null = null
    const limit = 2_000
    const refusal = await whatTheWaitSays({
      lock,
      who,
      limit,
      ready: () => false,
      build: () => {
        builds += 1
        const made = aBuildThatNeverEnds()
        child = made.child
        return made.running
      },
      builds: () => builds,
      refusal: (seen) => theWordsWhenAPageWaitGivesUp('the page a browser test is served', seen, builds),
    })
    expect(refusal, 'the wait returned; it should have refused').not.toBeNull()
    const said = refusal?.message ?? ''
    expect(said).toContain('Its build was still running when the wait gave up')
    expect(said).toContain('stopped with SIGTERM')
    expect(said).not.toContain('The build it started')
    expect(said).toContain(`process ${String(process.pid)}`)
    expect(said).toContain('which is this process')
    expect(said).toContain('a stand-in build that never ends')
    expect(builds, said).toBe(1)
    const stopped = child as ChildProcess | null
    expect(stopped, 'the build was never started').not.toBeNull()
    expect(
      stopped?.exitCode !== null || stopped?.signalCode !== null,
      'the build child was still running after the wait refused',
    ).toBe(true)
    expect(() => process.kill(Number(stopped?.pid), 0), 'the build child is still there').toThrow()
    expect(existsSync(lock), 'the lock was not removed when the build was stopped').toBe(false)
  }, 20_000)

  it('kills a build that ignores SIGTERM, and says it used SIGKILL', async () => {
    const { lock, who } = aLockOfThisCasesOwn()
    let builds = 0
    let child: ChildProcess | null = null
    const refusal = await whatTheWaitSays({
      lock,
      who,
      limit: 1_500,
      ready: () => false,
      build: () => {
        builds += 1
        const made = aBuildThatNeverEnds(
          "process.on('SIGTERM', () => {}); process.stdout.write('a build that ignores SIGTERM\\n'); setInterval(() => {}, 1000)",
        )
        child = made.child
        return made.running
      },
      builds: () => builds,
      refusal: (seen) => theWordsWhenAPageWaitGivesUp('the page a browser test is served', seen, builds),
    })
    expect(refusal, 'the wait returned; it should have refused').not.toBeNull()
    const said = refusal?.message ?? ''
    expect(said).toContain('Its build was still running when the wait gave up')
    expect(said).toContain('stopped with SIGKILL after it did not end 5 seconds after SIGTERM')
    expect(said).toContain('a build that ignores SIGTERM')
    const stopped = child as ChildProcess | null
    expect(stopped, 'the build was never started').not.toBeNull()
    expect(
      stopped?.exitCode !== null || stopped?.signalCode !== null,
      'the build child was still running after the wait refused',
    ).toBe(true)
    expect(() => process.kill(Number(stopped?.pid), 0), 'the build child is still there').toThrow()
    expect(existsSync(lock), 'the lock was not removed when the build was killed').toBe(false)
  }, 30_000)

  it('takes over a lock whose process has ended, and builds once', async () => {
    const { lock, who } = aLockOfThisCasesOwn()
    const dead = startANodeThatSleeps()
    mkdirSync(lock, { recursive: true })
    writeFileSync(who, `process ${String(dead.pid)}\n`)
    await theEndOf(dead)
    let builds = 0
    let built = false
    await waitForAPage({
      lock,
      who,
      limit: 5_000,
      ready: () => built,
      build: () => {
        builds += 1
        built = true
        return { ended: Promise.resolve(), output: () => '', stop: () => false }
      },
      builds: () => builds,
      refusal: (seen) => theWordsWhenAPageWaitGivesUp('the page a browser test is served', seen, builds),
    })
    expect(builds).toBe(1)
    expect(built).toBe(true)
    expect(existsSync(lock), 'the lock was not removed after the build').toBe(false)
  }, 20_000)

  it('gives up sooner than the hooks and cases that call the two waits', () => {
    // The callers' limits are literals in other files: tests/a-report-page-says-what-is-missing-in-words.test.ts
    // gives 300_000 at lines 94 and 164; tests/a-pipeline-reads-in-tiers.test.ts:262 gives 300_000; and
    // tests/the-mole-office-command-starts-the-paired-office.test.ts:322,
    // tests/the-mole-office-command-starts-the-stable-office.test.ts:193 and
    // tests/the-mole-office-command-stops-the-supervisor.test.ts:300 give their hooks 300_000.
    expect(HOW_LONG_A_PAGE_WAIT_MAY_LAST).toBe(240_000)
    expect(HOW_LONG_A_PAGE_WAIT_MAY_LAST).toBeLessThan(300_000)
  })
})
