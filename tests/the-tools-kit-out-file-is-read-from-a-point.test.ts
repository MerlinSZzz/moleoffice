// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITER'S OUT FILE IS READ FROM A POINT BY tools/kit/, SO NO MESSAGE IS READ TWICE OR LOST.
 *
 * This is tests/the-waiter-out-file-is-read-from-a-point.test.ts, proved again on
 * `tools/kit/read-new.sh` and `tools/kit/mark-read.sh`, the copies with no personal
 * default. That file goes on testing the two scripts under design/agents/kit, which live agents
 * still run by their paths.
 *
 * Problem `TZD7KatHAtEV`. When the kit's waiter keeps running, a session no longer reads the whole
 * out file at every wake: it reads only what the file gained. Two scripts do it:
 *
 *   read-new.sh <out file>   prints what the file gained since the last read point, and writes the
 *                            size it read into <out file>.read-offset.pending;
 *   mark-read.sh <out file>  makes that pending size the read point in <out file>.read-offset.
 *
 * WHAT IS PROVED HERE. A block is printed once and not again after mark-read.sh. A block appended
 * between read-new.sh and mark-read.sh is printed by the next read-new.sh — the read point is the
 * size read, not the size at marking, so nothing appended in between can be skipped. Everything the
 * file gained is printed, including the tool's own chatter, because dropping lines by pattern risks
 * swallowing a message line. A line that only names MOLE_AGENT_KEY is printed whole; a line with a
 * key value prints the value as (withheld) and never the value.
 *
 * T6 PROVES THE READ ITSELF CANNOT SKIP THE START OF A MESSAGE. It gives the child a fake `wc` that
 * measures the real size, prints it, and then appends a block, so the file grows between the
 * measurement and the read. A read that asked for "the last $ADDED bytes" would print the appended
 * block and lose the bytes just after the read point. The fixed read prints exactly the bytes from
 * the read point to the measured size, and the block the fake appended comes out of the next read
 * once mark-read.sh has moved the read point to that measured size.
 *
 * MUTATION, PROVED AFTER A CONTROL RUN. See the commit message: changing the read in
 * tools/kit/read-new.sh back to `tail -c "$ADDED"` makes T6 red, because the appended block pushes the
 * bytes after the read point out of the window.
 *
 * EVERY SCRIPT THIS FILE RUNS IS IN A PROCESS GROUP OF ITS OWN (office regulations, chapter 2):
 * `detached: true` makes it the leader of a new group, and the pipeline inside it joins that group.
 * Each one ends by itself in a few milliseconds; if one has not ended within ten seconds, its group
 * is stopped by the id this file recorded when it started it, and the case fails.
 */

import { spawn } from 'node:child_process'
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const READ_NEW = fileURLToPath(new URL('../tools/kit/read-new.sh', import.meta.url))
const MARK_READ = fileURLToPath(new URL('../tools/kit/mark-read.sh', import.meta.url))

/** How long one script may run before its group is stopped and the case fails. */
const A_SCRIPT_MAY_RUN_MS = 10_000

/**
 * Run one kit script and give back what it printed. A non-zero exit is a failure of the script.
 *
 * `PATH` may be replaced, which is how T6 puts a fake `wc` in front of the real one.
 */
async function run(script: string, out: string, home: string, extraEnv: NodeJS.ProcessEnv = {}): Promise<string> {
  const child = spawn('bash', [script, out], {
    detached: true,
    env: { ...process.env, HOME: home, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')))
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
  let stoppedByTheTimer = false
  const timer = setTimeout(() => {
    stoppedByTheTimer = true
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // The group ended between the timer and the signal.
      }
    }
  }, A_SCRIPT_MAY_RUN_MS)
  const status = await new Promise<number | null>((done) => child.on('close', (code) => done(code)))
  clearTimeout(timer)
  if (stoppedByTheTimer) throw new Error(`${script} was still running after ${String(A_SCRIPT_MAY_RUN_MS)} ms, so its group was stopped`)
  if (status !== 0) throw new Error(`${script} exited ${String(status)}: ${stderr}`)
  return stdout
}

/**
 * A fake `wc` that measures the real size, prints it, and THEN appends a block to the out file.
 *
 * The append lands between `read-new.sh`'s measurement and its read. A reader that printed "the last
 * $ADDED bytes" would then print the appended block and lose the bytes after the read point. The
 * fake runs the real `wc` by its absolute path, because the fake is first on `PATH`.
 */
function putAFakeWcIn(fakeDir: string, out: string): void {
  // THE REAL wc IS FOUND ON PATH BY THIS FILE ITSELF, so finding it starts no process.
  const realWc = (process.env.PATH ?? '').split(':').map((folder) => join(folder, 'wc')).find((path) => existsSync(path))
  if (realWc === undefined) throw new Error('no wc on PATH, so the fake wc has nothing to call')
  mkdirSync(fakeDir, { recursive: true })
  writeFileSync(
    join(fakeDir, 'wc'),
    [
      '#!/bin/bash',
      `answer=$("${realWc}" "$@")`,
      `printf '%s\\n' "$answer"`,
      // APPENDED AFTER THE MEASUREMENT, so the file on disk is longer than the size just printed.
      `printf '%s\\n' 'grew-while-wc-ran' >> '${out}'`,
      '',
    ].join('\n'),
  )
  chmodSync(join(fakeDir, 'wc'), 0o755)
}

describe('the waiter out file is read from a point by tools/kit', () => {
  it('T5: prints each block once, keeps a block added in between, and never prints a key value', async () => {
    const home = mkdtempSync(join(tmpdir(), 'mole-office-read-point-'))
    try {
      const dir = join(home, '.cache', 'mole-office')
      mkdirSync(dir, { recursive: true })
      const out = join(dir, 'waiter.out')
      // THE TOOL'S OWN CHATTER IS IN THE FILE AND IS PRINTED, because dropping lines by pattern
      // risks swallowing a message line that starts with the same words.
      writeFileSync(out, 'Project "default" taken from the --workspace you named.\nA words only in the first block.\n')

      const first = await run(READ_NEW, out, home)
      expect(first).toContain('A words only in the first block.')
      expect(first, 'the chatter is printed, not filtered').toContain('Project "default" taken from the --workspace you named.')
      await run(MARK_READ, out, home)

      // ONCE, AND NOT AGAIN AFTER THE READ POINT MOVES.
      expect((await run(READ_NEW, out, home)).trim(), 'the block was printed again after it was marked read').toBe('')

      // A BLOCK ADDED BETWEEN THE READ AND THE MARK IS KEPT FOR THE NEXT READ.
      appendFileSync(out, 'B words read first.\n')
      expect(await run(READ_NEW, out, home)).toContain('B words read first.')
      appendFileSync(out, 'C words added between the read and the mark.\n')
      await run(MARK_READ, out, home)
      const afterTheGap = await run(READ_NEW, out, home)
      expect(afterTheGap, 'the block added in the gap was lost').toContain('C words added between the read and the mark.')
      expect(afterTheGap, 'the block read before the gap was printed again').not.toContain('B words read first.')
      await run(MARK_READ, out, home)

      // A KEY VALUE IS MASKED. A LINE THAT ONLY NAMES THE VARIABLE IS KEPT WHOLE.
      appendFileSync(
        out,
        'this line only names MOLE_AGENT_KEY and nothing else\nMOLE_AGENT_KEY=topsecretvalue\n',
      )
      const keyed = await run(READ_NEW, out, home)
      expect(keyed, 'the line that only names the variable was dropped').toContain(
        'this line only names MOLE_AGENT_KEY and nothing else',
      )
      expect(keyed, 'the value was not masked').toContain('MOLE_AGENT_KEY=(withheld)')
      expect(keyed, 'the key value reached the reader').not.toContain('topsecretvalue')
      await run(MARK_READ, out, home)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  }, 30_000)

  it('T6: reads from the read point to the measured size when the file grows while wc runs', async () => {
    const home = mkdtempSync(join(tmpdir(), 'mole-office-read-race-'))
    try {
      const dir = join(home, '.cache', 'mole-office')
      mkdirSync(dir, { recursive: true })
      const out = join(dir, 'waiter.out')
      const fakeDir = join(home, 'bin')

      // A READ POINT AT THE END OF THE FIRST BLOCK, so the bytes under test start there.
      writeFileSync(out, 'A0\n')
      await run(READ_NEW, out, home)
      await run(MARK_READ, out, home)

      // THE BLOCK THE READ MUST PRINT, and only it. The fake wc below appends a second block while
      // the measurement is being printed.
      appendFileSync(out, 'B1\n')

      putAFakeWcIn(fakeDir, out)
      const withTheFakeWc = { PATH: `${fakeDir}:${process.env.PATH ?? ''}` }

      const first = await run(READ_NEW, out, home, withTheFakeWc)
      expect(first, 'the read printed the appended block instead of the bytes after the read point').toBe('B1\n')

      await run(MARK_READ, out, home)

      // THE FAKE WC APPENDED A BLOCK during the first read. The read point moved only to the size
      // that was measured, so the appended block comes out of the next read and is not lost.
      const next = await run(READ_NEW, out, home, withTheFakeWc)
      expect(next, 'the block appended while wc ran was lost').toContain('grew-while-wc-ran')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  }, 30_000)
})
