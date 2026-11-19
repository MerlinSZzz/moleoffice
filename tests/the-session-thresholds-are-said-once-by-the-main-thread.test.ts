// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION THRESHOLDS ARE SAID ONCE, BY THE MAIN THREAD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * src/server/lib/adapters/index.ts prints the session thresholds it read when it is loaded, once per process. A marker
 * on `globalThis` keeps it to once. A worker thread has a `globalThis` of its own, and the search thread loads that
 * file too, so the thread printed the line a second time. A thread's output reaches the process's output after the
 * main thread's. A program that built a server, printed its answer as its last line and closed the server had the
 * thread's line printed after its answer, so a test that read the program's last line read the thresholds instead.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS HELD HERE
 * ---------------------------------------------------------------------------------------
 *
 * A program loads the file on its main thread, prints a line of its own, then loads the file on a thread and waits for
 * that thread to end. It prints the thresholds once, before its own line, and nothing after it.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop the check of `isMainThread` in `announceThresholds` → red, as the thread prints the thresholds after the line.
 */
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { THRESHOLDS, describeThresholds } from '../src/server/lib/adapters/index.ts'
import { A_TEST_THAT_STARTS_SOMETHING } from './how-long-a-test-may-take.ts'

const THE_FILE = new URL('../src/server/lib/adapters/index.ts', import.meta.url).href
const ITS_OWN_LINE = 'This made-up program has loaded the file on its main thread.'

it('a program says them once, on its main thread, and a thread that loads the same file says nothing', () => {
  const program = [
    `await import(${JSON.stringify(THE_FILE)})`,
    `console.log(${JSON.stringify(ITS_OWN_LINE)})`,
    `const { Worker } = await import('node:worker_threads')`,
    `const thread = new Worker(new URL(${JSON.stringify(THE_FILE)}), { execArgv: ['--import', 'tsx'] })`,
    `await new Promise((ended, failed) => { thread.on('exit', ended); thread.on('error', failed) })`,
  ].join('\n')
  const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], {
    encoding: 'utf8',
    timeout: A_TEST_THAT_STARTS_SOMETHING,
  })
  expect(output.trimEnd().split('\n'), output).toEqual([describeThresholds(THRESHOLDS), ITS_OWN_LINE])
}, A_TEST_THAT_STARTS_SOMETHING)
