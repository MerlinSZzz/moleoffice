// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RUN ALONE USES WHAT ITS CALLER GIVES.
 *
 * tools/merge-tool/red-files.mjs used to import keepTheReport and runInSandbox from office-keeper.mjs, the module that
 * talks to the office. It now takes both from its caller, as testing.mjs, pairs.mjs and tools/the-merger.mjs pass
 * office-keeper.mjs's, so the module reaches no office module itself. The guard,
 * tests/the-merge-tool-reaches-the-office-only-through-two-modules.test.ts, reads the imports as its own case.
 *
 * WHAT THIS FILE PROVES:
 * 1. runAlone rejects with exactly the exported sentence, RUN_ALONE_NEEDS_RUN_IN_SANDBOX_AND_KEEP_THE_REPORT, when it
 *    is given no options, only { noResult: 'answer' }, only runInSandbox, only keepTheReport, or a runInSandbox that is
 *    not a function. The office-keeper mock is never reached, and no function the caller gave is called.
 * 2. The functions the caller gives are the ones used: the given runInSandbox is called once with the sandbox, the
 *    label, npm and the file, and the given keepTheReport is called once with the report path and its file name. The
 *    answer has red null and a non-empty noResult, because no report was kept, and no office-keeper mock was reached.
 * THE OFFICE-KEEPER MOCK'S runInSandbox AND keepTheReport THROW and record that they were reached, so the old code is
 * red at once with a plain sentence instead of talking to the office. The log-and-state mock records the log and throws
 * on fail. The arguments mock keeps the module from reading the test runner's own command line, which arguments.mjs
 * would end the process over, and gives RERUN_LIMITS the values it really has.
 *
 * PROOF RUNS (chapter 5 rule 1), each with `node tools/run-named-tests.mjs <files>`, logs kept outside the checkout:
 * - control, before commit 2, on the old code the commit holds (run3-control-old.log; repeated after commit 2 as
 *   run4-control-c2.log, where the guard was green): the new file red in all three cases, case 1 because the exported
 *   sentence is not a non-empty string yet, case 2 because runAlone calls office-keeper's runInSandbox itself, and case 3
 *   because testing.mjs passes neither function; exit 1, 3 failed.
 * - mutation 1, after commit 4 (m1-guard-red.log): the office-keeper import put back in red-files.mjs made the guard red
 *   in case 1 alone, naming red-files.mjs; 1 failed and 3 passed. The restore was green (m1-guard-green.log, 4 passed).
 * - mutation 2 (m2-case1-red.log): taking out the first-statement check turned case 1 red, 1 failed and 2 passed. The
 *   restore was green (m2-green.log, 3 passed).
 * - mutation 6 (m6-merge-rerun-red.log): leaving keepTheReport out of the merge-rerun driver's call turned that file
 *   red in three cases with the exported sentence, 3 failed and 1 passed. The restore was green (m6-green.log, 4 passed).
 * - restore: the new file, the guard and the two changed drivers green (run6-c4-green.log, exit 0, 4 files and 35 passed).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'

const reached = vi.hoisted(() => ({ officeKeeper: [] as string[], log: [] as string[] }))

vi.mock('../../tools/merge-tool/arguments.mjs', () => ({
  RERUN_LIMITS: { timeoutMs: 900_000, idleTimeoutMs: 600_000 },
}))

vi.mock('../../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (message: string) => {
    throw Error(message)
  },
  log: (line: string) => {
    reached.log.push(line)
  },
}))

vi.mock('../../tools/merge-tool/office-keeper.mjs', () => ({
  runInSandbox: async () => {
    reached.officeKeeper.push('runInSandbox')
    throw Error('red-files.mjs reached office-keeper.mjs itself')
  },
  keepTheReport: () => {
    reached.officeKeeper.push('keepTheReport')
    throw Error('red-files.mjs reached office-keeper.mjs itself')
  },
}))

import * as redFiles from '../../tools/merge-tool/red-files.mjs'

const NEEDED = Reflect.get(redFiles, 'RUN_ALONE_NEEDS_RUN_IN_SANDBOX_AND_KEEP_THE_REPORT') as unknown

/** The function as this file calls it, so the file compiles before and after the module takes its sixth argument. */
type TheRunAlone = (
  sandbox: unknown,
  cwd: string,
  file: string,
  label: string,
  reports: string,
  given?: Record<string, unknown>,
) => Promise<{ red: boolean | null; noResult: string | null; absent: boolean }>
const runAlone = redFiles.runAlone as unknown as TheRunAlone

/** A sentence that is there and not empty, before any case asks an error to match it. */
function aNonEmptyString(said: unknown): string {
  expect(typeof said, 'the sentence is a string').toBe('string')
  expect((said as string).length, 'the sentence is not empty').toBeGreaterThan(0)
  return said as string
}

/** The message a refused call throws. */
async function theRefusal(run: Promise<unknown>): Promise<string> {
  try {
    await run
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('runAlone accepted what it cannot use')
}

it('1: refuses with its sentence when it is given neither function, or one that is not a function', async () => {
  const need = aNonEmptyString(NEEDED)
  const runInSandbox = vi.fn(async () => ({ code: 0, signal: null, timedOut: false, outFile: 'synthetic-alone.log', tail: '' }))
  const keepTheReport = vi.fn(() => 'synthetic-alone.json')

  const refused = [
    runAlone({ name: 'synthetic-sandbox' }, '/nonexistent', 'synthetic.test.ts', 'synthetic-alone', '/nonexistent'),
    runAlone({ name: 'synthetic-sandbox' }, '/nonexistent', 'synthetic.test.ts', 'synthetic-alone', '/nonexistent', { noResult: 'answer' }),
    runAlone({ name: 'synthetic-sandbox' }, '/nonexistent', 'synthetic.test.ts', 'synthetic-alone', '/nonexistent', { runInSandbox }),
    runAlone({ name: 'synthetic-sandbox' }, '/nonexistent', 'synthetic.test.ts', 'synthetic-alone', '/nonexistent', { keepTheReport }),
    runAlone(
      { name: 'synthetic-sandbox' },
      '/nonexistent',
      'synthetic.test.ts',
      'synthetic-alone',
      '/nonexistent',
      { runInSandbox: 'not a function', keepTheReport },
    ),
  ]
  for (const run of refused) expect(await theRefusal(run), 'the refusal runAlone gives').toBe(need)

  expect(runInSandbox, 'the given runInSandbox was not called').not.toHaveBeenCalled()
  expect(keepTheReport, 'the given keepTheReport was not called').not.toHaveBeenCalled()
  expect(reached.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

const folder = mkdtempSync(join(tmpdir(), 'the-run-alone-'))
afterAll(() => {
  rmSync(folder, { recursive: true, force: true })
})

it('2: uses the runInSandbox and keepTheReport its caller gives', async () => {
  writeFileSync(join(folder, 'synthetic.test.ts'), '// Synthetic test name.\n')
  const runInSandbox = vi.fn(
    async (_sandbox: unknown, _label: string, _command: string, _args: string[], _options: Record<string, unknown>) => ({
      code: 1,
      signal: null,
      timedOut: false,
      outFile: 'synthetic-alone.log',
      tail: '',
    }),
  )
  const keepTheReport = vi.fn((_written: string, _name: string) => join(folder, 'synthetic-alone.json'))

  const answer = await runAlone({ name: 'synthetic-sandbox' }, folder, 'synthetic.test.ts', 'synthetic-alone', folder, {
    noResult: 'answer',
    runInSandbox,
    keepTheReport,
  })

  expect(runInSandbox, 'the given runInSandbox was called once').toHaveBeenCalledTimes(1)
  const [sandbox, label, command, args, options] = runInSandbox.mock.calls[0]!
  expect(sandbox, 'the sandbox given').toEqual({ name: 'synthetic-sandbox' })
  expect(label, 'the label given').toBe('synthetic-alone')
  expect(command, 'the command given').toBe('npm')
  expect(args.at(-1), 'the file the argument list ends with').toBe('synthetic.test.ts')
  expect(options, 'the options given').toMatchObject({ cwd: folder, singleFile: 'synthetic.test.ts' })

  expect(keepTheReport, 'the given keepTheReport was called once').toHaveBeenCalledTimes(1)
  expect(keepTheReport, 'the report path and its file name').toHaveBeenCalledWith(join(folder, 'synthetic-alone.json'), 'synthetic-alone.json')

  expect(answer.red, 'a run with no kept report is not red').toBeNull()
  expect(typeof answer.noResult, 'the answer says there was no result').toBe('string')
  expect((answer.noResult as string).length, 'the noResult sentence is not empty').toBeGreaterThan(0)
  expect(reached.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

