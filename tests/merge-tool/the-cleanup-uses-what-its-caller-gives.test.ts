// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CLEANUP WATCHER'S ENVIRONMENT IS PASSED BY ITS CALLER.
 *
 * tools/merge-tool/cleanup.mjs used to import withThePairing from tools/merge-tool/the-pairing.mjs and work out the
 * watcher's environment itself. It now takes that environment from its caller, office-keeper.mjs's watchMergeCleanup
 * passing withThePairing(process.env), so cleanup.mjs no longer imports the-pairing.mjs. It still reaches settings.mjs
 * through src/config/office-key.mjs, so it stays on the list of merge-tool modules not yet moved.
 * tools/merge-tool/the-pairing.mjs is deleted and its helper lives in arguments.mjs.
 *
 * WHAT THIS FILE PROVES:
 * A. startCleanup throws exactly the exported sentence, START_CLEANUP_NEEDS_THE_WATCHERS_ENVIRONMENT, when its second
 *    argument is missing, null, or a string, and spawn is never called.
 * B. Given an environment object, spawn is called once with that same object as env (the same reference), --watch as the
 *    argument after cleanup.mjs's own path, detached: true and an 'ipc' channel, and the stand-in child is sent
 *    { type: 'configure', config }.
 *
 * THE node:child_process MOCK replaces spawn and spawnSync, so no watcher is started and no process runs. The stand-in
 * child has pid, once and send; startCleanup returns its pid and sends the configure message through send.
 *
 * PROOF RUNS (chapter 5 rule 1), each with `node tools/run-named-tests.mjs <files>`, logs kept outside the checkout:
 * - control on the file as committed, run in a clone at af485fced where the code is unchanged (control-clone-red.log):
 *   red in A and B, exit 1, 2 failed. Run 3 (r3-cleanup-red-before-code.log) ran before the beforeEach reset was added,
 *   on the file without it.
 * - after the code change (r4-whole-green.log): green, 2 passed.
 * - mutation 1, the first-statement check taken out (m1-case-a-red.log): A red alone, 1 failed and 1 passed; the restore
 *   was green (m1-green.log, 2 passed).
 * - mutation 2, the watcher spawned with process.env (m2-case-b-red.log): B red alone, 1 failed and 1 passed; the
 *   restore was green (m2-green.log, 2 passed).
 */

import { fileURLToPath } from 'node:url'
import { beforeEach, expect, it, vi } from 'vitest'

const stand = vi.hoisted(() => {
  const calls: { spawn: unknown[][]; sent: unknown[]; once: string[] } = { spawn: [], sent: [], once: [] }
  const child = {
    pid: 4242,
    once: (event: string, _listener: () => void) => {
      calls.once.push(event)
    },
    send: (message: unknown) => {
      calls.sent.push(message)
    },
  }
  return { calls, child }
})

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => {
    stand.calls.spawn.push(args)
    return stand.child
  },
  spawnSync: () => {
    throw Error('cleanup.mjs started a process synchronously')
  },
}))

import * as cleanup from '../../tools/merge-tool/cleanup.mjs'

const NEEDED = Reflect.get(cleanup, 'START_CLEANUP_NEEDS_THE_WATCHERS_ENVIRONMENT') as unknown
const startCleanup = cleanup.startCleanup as unknown as (config: Record<string, unknown>, environment?: unknown) => number

const CONFIG = { api: 'http://example.invalid', entry: 'synthetic-entry', log: 'synthetic-cleanup.log' }

beforeEach(() => {
  stand.calls.spawn.length = 0
  stand.calls.sent.length = 0
})

/** The message a refused call throws. */
function theRefusal(environment: unknown): string {
  try {
    startCleanup(CONFIG, environment)
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('startCleanup accepted an environment it cannot use')
}

it('A: refuses with its sentence when the watcher’s environment is missing, null, or not an object, and starts nothing', () => {
  expect(typeof NEEDED, 'the sentence is a string').toBe('string')
  expect((NEEDED as string).length, 'the sentence is not empty').toBeGreaterThan(0)

  for (const environment of [undefined, null, 'not an environment']) {
    expect(theRefusal(environment), 'the refusal startCleanup gives').toBe(NEEDED)
  }
  expect(stand.calls.spawn, 'spawn was never called').toEqual([])
})

it('B: spawns the watcher in the environment its caller gives, and sends it the configuration', () => {
  const environment = { PATH: '/synthetic/bin', A_SETTING: 'a value' }

  const pid = startCleanup(CONFIG, environment)

  expect(stand.calls.spawn, 'spawn was called once').toHaveLength(1)
  const [command, words, options] = stand.calls.spawn[0] as [string, string[], Record<string, unknown>]
  expect(command, 'the process started').toBe(process.execPath)
  expect(words[0], 'the watcher is cleanup.mjs').toBe(fileURLToPath(new URL('../../tools/merge-tool/cleanup.mjs', import.meta.url)))
  expect(words[1], 'the watcher switch').toBe('--watch')
  expect(options.env, 'the environment the caller gave, the same object').toBe(environment)
  expect(options.detached, 'the watcher is detached').toBe(true)
  expect(options.stdio, 'an ipc channel').toContain('ipc')
  expect(stand.calls.sent, 'the child was sent the configuration').toEqual([{ type: 'configure', config: CONFIG }])
  expect(pid, 'the watcher process id is returned').toBe(stand.child.pid)
})
