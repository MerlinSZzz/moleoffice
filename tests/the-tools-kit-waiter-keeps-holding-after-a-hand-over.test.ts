// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITER IN tools/kit/ KEEPS THE HANDLE HELD AFTER A HAND-OVER.
 *
 * It is proved on `tools/kit/waiter.sh`, the copy with no personal default. Live agents still run
 * `design/agents/kit/waiter.sh` by its path.
 *
 * Problem `TZD7KatHAtEV`, measured by the office's secretary on 23 September 2026: the kit's waiter
 * (then the copy under design/agents/kit) ran `tools/hold-the-handle.mjs`, and when the tool handed a
 * message over the waiter wrote "=== waiter handed over" and STOPPED. The tool was written for a
 * session that starts it as a background command, whose exit wakes the session; the kit starts it
 * detached, so the exit woke nobody. From 22 September 00:00 to 23 September 09:12 the secretary's handle
 * was unheld for 732 minutes over 84 hand-overs, the longest gap 60 minutes. The same code also
 * appended only `tail -c 16000` of a delivery, so a long hand-over could be cut.
 *
 * WHAT IS PROVED HERE. The real `waiter.sh` runs against a temporary checkout whose
 * `tools/hold-the-handle.mjs` is a stub: it hands over once, then ends with a refusal. The stub is
 * run TWICE, so the loop goes on after a hand-over; the out file holds exactly one "=== waiter
 * handed over" and ends with "=== waiter ended"; and the whole delivery, longer than 16,000 bytes,
 * is in the out file. The stub records its arguments, and the test checks waiter.sh passes
 * `--kept-by-the-kit`, so the tool's hand-over does not tell the session to start a second waiter.
 *
 * MUTATION, PROVED AFTER A CONTROL RUN. See the commit message: in tools/kit/waiter.sh, end the
 * hand-over branch with `break` instead of going round the loop again. T4 goes red, because the stub
 * runs once.
 *
 * T8 PROVES THE BACK-OFF AND ITS CAP. The inspector found that the loop handed the same message
 * over once a second when the office did not mark it taken: measured 10 hand-overs and 21,960
 * bytes of out file in 10 seconds. So a stub hands the same id over three times and then stops;
 * the waiter must write the "came back" line after the second and third hand-over and wait the
 * back-off, measured against the start times the stub records. The cap now comes from the office's
 * own timing: the stub prints "office hold timing: beatEvery=0.1 lapsesAfter=1.0" and the test
 * lowers the start margin to 0.2 and the floor to 0.1, so the cap is 0.7. T8 gives the ladder
 * 0.3 s then 5 s and checks the second wait is clamped to 0.7 s and the out file says so. A second
 * case hands over three different ids: no "came back" line and only the ordinary one-second pause.
 *
 * T9 PROVES THE LOUDER LINE. A stub hands the same id over eleven times; on the tenth hand-over
 * that comes back the waiter writes one louder line, once, naming the message and the office door
 * to read, and goes on waiting at the cap.
 *
 * T10 PROVES THE FLOOR FOR TIMING THAT LEAVES NO ROOM. The stub prints "beatEvery=1
 * lapsesAfter=1.5" with the default margin, so the cap is negative: no back-off can keep the hold.
 * The waiter writes the loud "leaves no room" line once and waits 5 seconds, and the out file says
 * the wait was clamped to 5. The ladder is tiny, so the 5 could only come from the floor.
 *
 * EVERY WAITER THIS FILE STARTS IS IN A PROCESS GROUP OF ITS OWN (office regulations, chapter 2):
 * `detached: true` makes the waiter the leader of a new group, the stub it runs joins that group,
 * and the cleanup stops each group by the id this file recorded when it started it. Each waiter
 * normally ends by itself when the stub says it stopped; the cleanup is for a case that fails first.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const WAITER = fileURLToPath(new URL('../tools/kit/waiter.sh', import.meta.url))
const CHILDREN: ChildProcess[] = []

/** The long line the stub delivers. It is longer than the 16,000 bytes the old waiter kept. */
const LONG_DELIVERY = `BEGIN-OF-LONG-DELIVERY-${'x'.repeat(20_000)}`

/**
 * A stub in place of the handle tool. It hands over once, with a delivery longer than the old
 * `tail -c 16000` would keep, and answers a refusal the second time.
 */
const STUB = `import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const counter = join(here, 'attempts')
const n = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
writeFileSync(counter, String(n + 1))

// WHAT WAITER.SH SAID TO THE TOOL. T4 checks that --kept-by-the-kit is passed, so the tool knows
// the kit runs it again by itself and does not tell the session to start another waiter.
writeFileSync(join(here, 'arguments'), process.argv.slice(2).join(' '))

if (n === 0) {
  process.stdout.write(
    'WHO SENT IT: agent keeper\\nIN PROJECT: default\\nTHE MESSAGE, record LONG-1:\\n' +
      ${JSON.stringify(LONG_DELIVERY)} +
      '\\nexiting: delivered LONG-1\\n',
  )
  process.exit(0)
}
process.stdout.write('exiting: stopped\\n')
process.exit(0)
`

/**
 * A stub in place of the handle tool for T8, T9 and T10. It hands over the ids in `deliveries`,
 * one per run, then ends with "exiting: stopped". It records the wall-clock millisecond each run
 * started, so the test can see the wait the waiter put between a message that came back and the
 * next run. When the test writes `beat` and `lapse`, it prints the office's timing line the real
 * tool prints with --kept-by-the-kit, so waiter.sh caps a back-off against it.
 */
const REPEATING_STUB = `import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const counter = join(here, 'attempts')
const n = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
writeFileSync(counter, String(n + 1))
writeFileSync(join(here, 'arguments'), process.argv.slice(2).join(' '))
appendFileSync(join(here, 'starts'), String(Date.now()) + '\\n')

const beat = join(here, 'beat')
const lapse = join(here, 'lapse')
const timing =
  existsSync(beat) && existsSync(lapse)
    ? 'office hold timing: beatEvery=' + readFileSync(beat, 'utf8').trim() +
      ' lapsesAfter=' + readFileSync(lapse, 'utf8').trim() + '\\n'
    : ''

const sequence = readFileSync(join(here, 'deliveries'), 'utf8').trim().split(/\\s+/)
if (n < sequence.length) {
  process.stdout.write(timing + 'exiting: delivered ' + sequence[n] + '\\n')
  process.exit(0)
}
process.stdout.write(timing + 'exiting: stopped\\n')
process.exit(0)
`

/**
 * Run the real waiter.sh over the repeating stub. The child gets its own environment naming the
 * test's own office and never the launcher's (finding 44); the stub needs no office, and the
 * address below points nowhere. `deliveries` is the ids the stub hands over, one per run. `timing`
 * is the office's beat and lapse the stub prints, and `startMargin` and `minWait` lower the
 * waiter's own margin and floor so a scaled-down test measures the cap without a real wait.
 */
async function runTheRepeatingWaiter(options: {
  deliveries: string
  repeatWaits: string
  /** The office's timing the stub prints, as the real tool prints it with --kept-by-the-kit. */
  timing?: { beatEvery: string; lapsesAfter: string }
  /** Lower the start margin so the cap is small without a real wait. */
  startMargin?: string
  /** Lower the floor so a fractional cap is not read as "no room". */
  minWait?: string
}): Promise<{ dir: string; written: string; attempts: number; starts: number[]; code: number }> {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-kit-waiter-repeat-'))
  mkdirSync(join(dir, 'for-agents'), { recursive: true })
  writeFileSync(join(dir, 'for-agents', 'hold-the-handle.mjs'), REPEATING_STUB)
  chmodSync(join(dir, 'for-agents', 'hold-the-handle.mjs'), 0o755)
  writeFileSync(join(dir, 'for-agents', 'deliveries'), options.deliveries)
  if (options.timing !== undefined) {
    writeFileSync(join(dir, 'for-agents', 'beat'), options.timing.beatEvery)
    writeFileSync(join(dir, 'for-agents', 'lapse'), options.timing.lapsesAfter)
  }
  const out = join(dir, 'waiter.out')
  const child = spawn('bash', [WAITER, 'keeper', 'the-session', 'default', out], {
    detached: true,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      MOLE_OFFICE_CHECKOUT: dir,
      MOLE_OFFICE_API: 'http://127.0.0.1:9',
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_SESSION: 'the-session',
      MOLE_OFFICE_AGENT: 'keeper',
      MOLE_AGENT_KEY: 'a-test-key-for-the-stub',
      WAITER_REPEAT_WAITS: options.repeatWaits,
      ...(options.startMargin === undefined ? {} : { WAITER_START_MARGIN: options.startMargin }),
      ...(options.minWait === undefined ? {} : { WAITER_MIN_WAIT: options.minWait }),
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  CHILDREN.push(child)
  const code = await new Promise<number>((go) => child.on('exit', (c) => go(c ?? -1)))
  const starts = readFileSync(join(dir, 'for-agents', 'starts'), 'utf8')
    .trim()
    .split('\n')
    .map(Number)
  return {
    dir,
    written: readFileSync(out, 'utf8'),
    attempts: Number(readFileSync(join(dir, 'for-agents', 'attempts'), 'utf8')),
    starts,
    code,
  }
}

afterAll(() => {
  // BY THE PROCESS GROUP each waiter was started in, so the stub it was running goes with it.
  for (const child of CHILDREN) {
    if (child.pid === undefined) continue
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is the outcome this wanted.
    }
  }
})

describe("the waiter in tools/kit keeps holding after a hand-over", () => {
  it('T4: runs the tool again after a hand-over, keeps the whole delivery, and stops on a refusal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-office-kit-waiter-'))
    try {
      mkdirSync(join(dir, 'for-agents'), { recursive: true })
      writeFileSync(join(dir, 'for-agents', 'hold-the-handle.mjs'), STUB)
      chmodSync(join(dir, 'for-agents', 'hold-the-handle.mjs'), 0o755)
      const out = join(dir, 'waiter.out')

      const child = spawn('bash', [WAITER, 'keeper', 'the-session', 'default', out], {
        detached: true,
        // ITS OWN ENVIRONMENT, NOT THE LAUNCHER'S. The launcher's environment names the owner's
        // live office, and this test must not reach it: 23 September 2026, acceptance
        // finding 44. The stub needs no office; the address below points nowhere.
        env: {
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
          MOLE_OFFICE_CHECKOUT: dir,
          MOLE_OFFICE_API: 'http://127.0.0.1:9',
          MOLE_OFFICE_WORKSPACE: 'default',
          MOLE_OFFICE_SESSION: 'the-session',
          MOLE_OFFICE_AGENT: 'keeper',
          MOLE_AGENT_KEY: 'a-test-key-for-the-stub',
        },
        stdio: ['ignore', 'ignore', 'ignore'],
      })
      CHILDREN.push(child)
      const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
      expect(await ended, 'the waiter should stop on the refusal, not loop for ever').toBe(0)

      // THE STUB RAN TWICE: once for the hand-over, once more after it.
      expect(readFileSync(join(dir, 'for-agents', 'attempts'), 'utf8')).toBe('2')

      // AND WAITER.SH TOLD THE TOOL THE KIT RUNS IT AGAIN BY ITSELF, so the hand-over does not tell
      // the session to start a second waiter.
      expect(readFileSync(join(dir, 'for-agents', 'arguments'), 'utf8')).toContain('--kept-by-the-kit')

      const written = readFileSync(out, 'utf8')
      // ONE HAND-OVER, AND THE ENDING THE REFUSAL ASKS FOR.
      expect(written.split('=== waiter handed over').length - 1).toBe(1)
      const lastLine = written.trimEnd().split('\n').pop() ?? ''
      expect(lastLine.startsWith('=== waiter ended'), `the out file ended with: ${lastLine}`).toBe(true)
      // AND THE WHOLE DELIVERY IS THERE, all 20,000 x's and the marker at its front.
      expect(written.includes(LONG_DELIVERY), 'the delivery was cut').toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('T8: a wait above the cap the office sent is clamped to it, and the out file says so', async () => {
    // X X X: three hand-overs of the same id, then a stop. The office's own timing is beatEvery 0.1
    // and lapsesAfter 1.0, and the margin is 0.2, so the cap is 0.7. The ladder asks for 0.3 s then
    // 5 s, so the first back-off is 0.3 s and the second is clamped to 0.7 s. The first hand-over
    // of X is new and waits the ordinary second.
    const run = await runTheRepeatingWaiter({
      deliveries: 'X X X',
      repeatWaits: '0.3 5',
      startMargin: '0.2',
      minWait: '0.1',
      timing: { beatEvery: '0.1', lapsesAfter: '1.0' },
    })
    try {
      expect(run.code, 'the waiter should end when the stub stops').toBe(0)
      expect(run.attempts, 'three hand-overs and the stop').toBe(4)
      // THE OUT FILE SAYS THE 5 s WAIT WAS CLAMPED TO THE OFFICE'S 0.7 s CAP.
      expect(run.written).toContain('clamped to 0.7 s')
      // THE "came back" LINE TWICE, after the second and the third hand-over.
      const cameBack = run.written.split('came back, so the office did not mark them taken').length - 1
      expect(cameBack, run.written).toBe(2)
      // AND THE FIRST WAIT IS THE LADDER'S 0.3 s, THE SECOND THE CLAMPED 0.7 s — never the 5 s.
      expect(run.starts.length).toBe(4)
      expect(run.starts[2]! - run.starts[1]!).toBeGreaterThanOrEqual(300)
      expect(run.starts[2]! - run.starts[1]!).toBeLessThan(3000)
      expect(run.starts[3]! - run.starts[2]!).toBeGreaterThanOrEqual(300)
      expect(run.starts[3]! - run.starts[2]!).toBeLessThan(3000)
      expect(run.written).toContain('waiting 0.3 s before holding again')
      expect(run.written).toContain('waiting 0.7 s before holding again')
    } finally {
      rmSync(run.dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('T9: an id that comes back ten times writes one louder line, once, and goes on at the cap', async () => {
    // ELEVEN HAND-OVERS OF THE SAME ID: ten of them come back. On the tenth the waiter must write
    // the louder line once and go on waiting at the cap. The office's timing gives a tiny cap (0.05
    // with a lowered floor) so the waits are tiny and this is quick.
    const run = await runTheRepeatingWaiter({
      deliveries: 'X X X X X X X X X X X',
      repeatWaits: '0.05',
      startMargin: '0.4',
      minWait: '0.01',
      timing: { beatEvery: '0.05', lapsesAfter: '0.5' },
    })
    try {
      expect(run.code).toBe(0)
      expect(run.attempts, 'eleven hand-overs and the stop').toBe(12)
      // THE LOUDER LINE EXACTLY ONCE, and it names the message and the office's own door.
      const louder = run.written.split('came back 10 times in a row').length - 1
      expect(louder, run.written).toBe(1)
      expect(run.written).toContain(
        "message(s) X came back 10 times in a row; the office is not marking them taken. The handle stays held; a secretary should read GET /api/messages/X and the office's log (",
      )
      // AND TEN "came back" LINES, one for each hand-over after the first.
      const cameBack = run.written.split('came back, so the office did not mark them taken').length - 1
      expect(cameBack, run.written).toBe(10)
    } finally {
      rmSync(run.dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('T10: timing that leaves no room writes the loud line once and clamps the wait to 5 s', async () => {
    // THE OFFICE'S NUMBERS LEAVE NO ROOM: beatEvery 1 and lapsesAfter 1.5 with the default 10 s
    // start margin is negative, so no back-off can keep the hold. The waiter must write the loud
    // line once and wait the 5 s floor. The ladder is 0.05 s, far below 5, so the 5 can only come
    // from the floor and the out file has to say the wait was clamped to it.
    const run = await runTheRepeatingWaiter({
      deliveries: 'X X',
      repeatWaits: '0.05',
      timing: { beatEvery: '1', lapsesAfter: '1.5' },
    })
    try {
      expect(run.code, 'the waiter should end when the stub stops').toBe(0)
      expect(run.attempts, 'two hand-overs and the stop').toBe(3)
      // THE LOUD LINE EXACTLY ONCE, naming both numbers and the 5 s.
      const loud = run.written.split('leaves no room for a back-off').length - 1
      expect(loud, run.written).toBe(1)
      expect(run.written).toContain(
        "the office's hold timing (beat 1 s, lapse 1.5 s) leaves no room for a back-off; a message that comes back is handed over every 5 s until the timing is fixed (",
      )
      // AND THE WAIT IS 5 s, READ FROM THE OUT FILE RATHER THAN MEASURED.
      expect(run.written).toContain('clamped to 5 s')
      expect(run.written).toContain('waiting 5 s before holding again')
    } finally {
      rmSync(run.dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('T8: a hand-over with only new ids keeps the one-second pause and writes no "came back" line', async () => {
    // X, Y AND Z ARE ALL DIFFERENT: nothing came back, so no back-off line is written and the
    // pause is the ordinary one second. The repeat waits are 5 s, so a gap far below that proves
    // the back-off was not used.
    const run = await runTheRepeatingWaiter({ deliveries: 'X Y Z', repeatWaits: '5 5 5' })
    try {
      expect(run.code).toBe(0)
      expect(run.attempts).toBe(4)
      expect(run.written.includes('came back'), run.written).toBe(false)
      expect(run.starts.length).toBe(4)
      expect(run.starts[2]! - run.starts[1]!).toBeLessThan(5000)
    } finally {
      rmSync(run.dir, { recursive: true, force: true })
    }
  }, 60_000)
})
