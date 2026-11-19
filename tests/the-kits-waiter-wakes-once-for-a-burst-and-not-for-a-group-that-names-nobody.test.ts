// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KIT'S WAITER WAKES ONCE FOR A BURST, NOT AT ALL FOR A GROUP MESSAGE THAT NAMES NOBODY, AND AT ONCE FOR A PERSON.
 *
 * Before 7 November 2026 waiter.sh wrote "=== waiter handed over", the line a session's Monitor wakes on, after every
 * hand-over. Now a message sent to a group does not wake the agent unless it names the agent,
 * the waiter gathers a burst before it wakes, until 20 seconds pass with nothing new or 90 seconds in all, and
 * a person's message wakes it at once. The waiter tool says which a hand-over is, in its line
 * "hand-over wakes: now | after-a-burst | nobody" (tests/a-group-message-that-names-nobody-does-not-wake-the-agent.test.ts).
 * This file proves what waiter.sh does with that line.
 *
 * WHAT IS PROVED HERE. The real waiter.sh runs against a temporary checkout whose for-agents/hold-the-handle.mjs is a
 * stub. The stub reads a made-up inbox, one line per run: how many seconds it holds before it hands over, the answer
 * it prints, and the id it hands over. The test watches the out file and notes when each wake line appears. The quiet
 * time and the longest time are made short through WAITER_BURST_QUIET and WAITER_BURST_LONGEST.
 *   1. A person's hand-over wakes at once.
 *   2. Group hand-overs that name nobody are kept in the out file with "=== waiter kept this for the next wake", and
 *      wake nobody.
 *   3. Three hand-overs about a second apart wake once, a quiet time after the third.
 *   4. Hand-overs that never leave a quiet time wake at the longest time after the first.
 *   5. A person's hand-over during a burst wakes at once, and the burst does not wake again after it.
 *   6. A kept hand-over during a burst does not put the burst's wake off.
 *   7. An older tool, which prints no wake line, wakes at once, as before.
 *   8. A waiter that ends while it gathers, by the tool's stop or by a stop of its process group, wakes the session
 *      first, and leaves nothing of itself running.
 *
 * EVERY WAITER THIS FILE STARTS IS IN A PROCESS GROUP OF ITS OWN (office regulations, chapter 2): `detached: true`
 * makes the waiter the leader of a new group, the stub and the burst's timer join that group, and the cleanup stops
 * each group by the id this file recorded when it started it.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const WAITER = fileURLToPath(new URL('../tools/kit/waiter.sh', import.meta.url))
const GROUPS: number[] = []

const WAKE = '=== waiter handed over'
const KEPT = '=== waiter kept this for the next wake'
const ENDED = '=== waiter ended'

/**
 * A stub in place of the waiter tool. Run n reads line n of the inbox, "<seconds> <answer> <id>": it holds for the
 * seconds, then hands the id over and prints "hand-over wakes: <answer>" before its last line, as the real tool does
 * with --kept-by-the-kit. The answer "none" prints no wake line, as an older tool does; "stop" ends the waiter with
 * "exiting: stopped". After the last line it stops. It notes the millisecond of each hand-over.
 */
const STUB = `import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const counter = join(here, 'runs')
const n = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
writeFileSync(counter, String(n + 1))
const inbox = readFileSync(join(here, 'inbox'), 'utf8').trim().split('\\n').map((line) => line.trim().split(/\\s+/))
const [seconds, answer, id] = inbox[n] ?? ['0', 'stop', '-']
setTimeout(() => {
  if (answer === 'stop') {
    process.stdout.write('exiting: stopped\\n')
    process.exit(0)
  }
  appendFileSync(join(here, 'handed'), id + ' ' + String(Date.now()) + '\\n')
  process.stdout.write('THE MESSAGE, record ' + id + ':\\nMade-up words.\\n' + (answer === 'none' ? '' : 'hand-over wakes: ' + answer + '\\n') + 'exiting: delivered ' + id + '\\n')
  process.exit(0)
}, Number(seconds) * 1000)
`

interface ARun {
  written: string
  /** The millisecond each wake line was first seen in the out file. */
  wakesAt: number[]
  /** The millisecond the stub handed each id over. */
  handedAt: Record<string, number>
  /** Whether anything of the waiter's process group was still running a moment after it ended. */
  leftRunning: boolean
}

function groupIsAlive(group: number): boolean {
  try {
    process.kill(-group, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Run the real waiter.sh over the stub and the made-up inbox, watching the out file. `stopTheGroupAfter` sends the
 * group a stop once the stub has started that many runs, as the kit's stop-waiter.sh does.
 */
async function runTheWaiter(inbox: string[], times: { quiet: string; longest: string }, stopTheGroupAfter?: number): Promise<ARun> {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-kit-waiter-burst-'))
  try {
    mkdirSync(join(dir, 'for-agents'), { recursive: true })
    writeFileSync(join(dir, 'for-agents', 'hold-the-handle.mjs'), STUB)
    chmodSync(join(dir, 'for-agents', 'hold-the-handle.mjs'), 0o755)
    writeFileSync(join(dir, 'for-agents', 'inbox'), inbox.join('\n') + '\n')
    const out = join(dir, 'waiter.out')
    const child: ChildProcess = spawn('bash', [WAITER, 'keeper', 'the-session', 'default', out], {
      // ITS OWN ENVIRONMENT, NOT THE LAUNCHER'S: the stub needs no office, and the address below points nowhere.
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        MOLE_OFFICE_CHECKOUT: dir,
        MOLE_OFFICE_API: 'http://127.0.0.1:9',
        WAITER_BURST_QUIET: times.quiet,
        WAITER_BURST_LONGEST: times.longest,
      },
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: true,
    })
    if (child.pid === undefined) throw new Error('the waiter did not start')
    const group = child.pid
    GROUPS.push(group)
    let ended = false
    child.on('exit', () => (ended = true))
    const wakesAt: number[] = []
    const seen = (): string => (existsSync(out) ? readFileSync(out, 'utf8') : '')
    const note = (): void => {
      const count = seen().split(WAKE).length - 1
      while (wakesAt.length < count) wakesAt.push(Date.now())
    }
    const runs = (): number => (existsSync(join(dir, 'for-agents', 'runs')) ? Number(readFileSync(join(dir, 'for-agents', 'runs'), 'utf8')) : 0)
    const until = Date.now() + 40_000
    let stopped = false
    while (!ended && Date.now() < until) {
      note()
      if (stopTheGroupAfter !== undefined && !stopped && runs() >= stopTheGroupAfter) {
        process.kill(-group, 'SIGTERM')
        stopped = true
      }
      await new Promise((go) => setTimeout(go, 40))
    }
    expect(ended, `the waiter did not end:\n${seen()}`).toBe(true)
    // A MOMENT FOR WHAT THE GROUP STILL RUNS TO FINISH, then look once more.
    for (let i = 0; i < 25 && groupIsAlive(group); i++) await new Promise((go) => setTimeout(go, 40))
    note()
    const handed = existsSync(join(dir, 'for-agents', 'handed')) ? readFileSync(join(dir, 'for-agents', 'handed'), 'utf8').trim().split('\n') : []
    return {
      written: seen(),
      wakesAt,
      handedAt: Object.fromEntries(handed.map((line) => [line.split(' ')[0]!, Number(line.split(' ')[1])])),
      leftRunning: groupIsAlive(group),
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const timesIn = (text: string, words: string): number => text.split(words).length - 1

afterAll(() => {
  for (const group of GROUPS) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Already gone, which is where a waiter that ended by itself is.
    }
  }
})

describe("the kit's waiter wakes its session for what asks it to", () => {
  it('1: wakes at once for a person’s hand-over', async () => {
    const run = await runTheWaiter(['0 now A'], { quiet: '20', longest: '90' })
    expect(run.wakesAt.length, run.written).toBe(1)
    expect(run.wakesAt[0]! - run.handedAt['A']!, 'the wake waited').toBeLessThan(1000)
    expect(run.written).not.toContain(KEPT)
  }, 60_000)

  it('2: keeps group hand-overs that name nobody, and wakes nobody for them', async () => {
    const run = await runTheWaiter(['0 nobody A', '0 nobody B'], { quiet: '0.5', longest: '1' })
    expect(run.wakesAt.length, run.written).toBe(0)
    expect(timesIn(run.written, KEPT), run.written).toBe(2)
    expect(run.written).toContain('THE MESSAGE, record A:')
    expect(run.written).toContain('THE MESSAGE, record B:')
    expect(run.written.trimEnd().split('\n').pop()).toMatch(/^=== waiter ended/)
  }, 60_000)

  it('3: wakes once for three hand-overs a second apart, a quiet time after the third', async () => {
    const run = await runTheWaiter(['0 after-a-burst A', '0 after-a-burst B', '0 after-a-burst C', '5 stop -'], { quiet: '2.5', longest: '30' })
    expect(run.wakesAt.length, run.written).toBe(1)
    const afterTheThird = run.wakesAt[0]! - run.handedAt['C']!
    expect(afterTheThird, 'the wake did not wait the quiet time after the third').toBeGreaterThanOrEqual(2300)
    expect(afterTheThird).toBeLessThan(4500)
  }, 60_000)

  it('4: wakes at the longest time after the first when the hand-overs leave no quiet time', async () => {
    const run = await runTheWaiter(
      ['0 after-a-burst A', '0 after-a-burst B', '0 after-a-burst C', '0 after-a-burst D', '0 after-a-burst E', '0 after-a-burst F', '4 stop -'],
      { quiet: '2.5', longest: '4' },
    )
    expect(run.wakesAt.length, run.written).toBeGreaterThanOrEqual(1)
    const afterTheFirst = run.wakesAt[0]! - run.handedAt['A']!
    // THE CLOCK IS READ IN WHOLE SECONDS, so the longest time holds to within one. Without it the first wake would
    // come a quiet time after F, more than seven seconds after A.
    expect(afterTheFirst, 'the wake came before the longest time').toBeGreaterThanOrEqual(2900)
    expect(afterTheFirst, 'the wake did not come at the longest time').toBeLessThan(5600)
  }, 60_000)

  it('5: wakes at once for a person’s hand-over during a burst, and not again for the burst', async () => {
    const run = await runTheWaiter(['0 after-a-burst A', '0 now B', '5 stop -'], { quiet: '3', longest: '30' })
    expect(run.wakesAt.length, run.written).toBe(1)
    expect(run.wakesAt[0]! - run.handedAt['B']!, 'the person’s hand-over waited').toBeLessThan(1000)
  }, 60_000)

  it('6: does not put a burst’s wake off for a kept hand-over', async () => {
    const run = await runTheWaiter(['0 after-a-burst A', '0 nobody B', '0 nobody C', '5 stop -'], { quiet: '2.5', longest: '30' })
    expect(run.wakesAt.length, run.written).toBe(1)
    const afterTheFirst = run.wakesAt[0]! - run.handedAt['A']!
    expect(afterTheFirst).toBeGreaterThanOrEqual(2300)
    expect(afterTheFirst, 'a kept hand-over put the wake off').toBeLessThan(run.handedAt['C']! - run.handedAt['A']! + 2300)
    expect(timesIn(run.written, KEPT), run.written).toBe(2)
  }, 60_000)

  it('7: wakes at once for an older tool that prints no wake line', async () => {
    const run = await runTheWaiter(['0 none A'], { quiet: '20', longest: '90' })
    expect(run.wakesAt.length, run.written).toBe(1)
    expect(run.wakesAt[0]! - run.handedAt['A']!).toBeLessThan(1000)
  }, 60_000)

  it('8: wakes the session before it ends while gathering, when the tool stops', async () => {
    const run = await runTheWaiter(['0 after-a-burst A', '0 stop -'], { quiet: '20', longest: '90' })
    expect(run.wakesAt.length, run.written).toBe(1)
    expect(run.written.indexOf(WAKE), run.written).toBeLessThan(run.written.indexOf(ENDED))
    expect(run.wakesAt[0]! - run.handedAt['A']!, 'the wake waited for the quiet time').toBeLessThan(5000)
    expect(run.leftRunning, 'the burst’s timer was left running').toBe(false)
  }, 60_000)

  it('8: wakes the session before it ends while gathering, when its process group is stopped', async () => {
    const run = await runTheWaiter(['0 after-a-burst A', '60 stop -'], { quiet: '20', longest: '90' }, 2)
    expect(run.wakesAt.length, run.written).toBe(1)
    expect(run.wakesAt[0]! - run.handedAt['A']!, 'the wake waited for the quiet time').toBeLessThan(5000)
    expect(run.leftRunning, 'something of the waiter was left running').toBe(false)
  }, 60_000)
})
