// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DIRECTORY WITH A LIVE PROCESS IN IT IS NOT REMOVED.
 *
 * This is the one check the resource-lease design carried that did real work, and the only part of
 * that design a decision kept when the rest was withdrawn. It lives in
 * tools/live-processes.mjs, once, and tools/the-inspector.mjs and tools/accept.mjs both call it
 * before `git worktree remove --force`. The check reads /proc directly: it needs no ledger, no
 * office and no network, so it survives the design that used to wrap it unchanged.
 *
 * WHAT EACH TEST PROVES
 *   - a quiet tree passes the refusal, and the sentence says nobody was found in it;
 *   - a process whose working directory is inside the tree is found, and the refusal names the tree
 *     and the process, because the next question anybody asks is whose it is;
 *   - a process in a neighbouring tree is not reported for this one;
 *   - a process in a tree named through a symbolic link is found, because /proc names the real path
 *     (problem jSze4NteBCbY).
 *
 * MUTATION PROOF (run after a green control): in tools/live-processes.mjs, change
 * `if (found.length > 0)` inside refuseToRemoveIfAnybodyIsIn to `if (false)` —
 * "a directory with a live process in it is not removed" then fails, because the occupied tree
 * passes the refusal. Restoring the line turns the test green again. For the link case, change
 * `realpathSync(resolve(at))` in processesIn to `resolve(at)`: the link case fails, because the
 * process is found under its real path only. Restoring the line turns it green again.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { once } from 'node:events'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { processesIn, refuseToRemoveIfAnybodyIsIn, whoStillUses } from '../tools/live-processes.mjs'

let tree = ''
let child: ChildProcess | null = null

beforeEach(() => {
  tree = mkdtempSync(join(tmpdir(), 'mole-office-live-process-'))
})
afterEach(async () => {
  await settle()
  rmSync(tree, { recursive: true, force: true })
})

/** Start a process that stays alive with its working directory inside `at`, and wait until it is up. */
async function occupy(at: string): Promise<number> {
  const started = spawn(process.execPath, ['-e', 'process.stdout.write("up"); setInterval(() => {}, 1000)'], {
    cwd: at,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  child = started
  await once(started.stdout!, 'data')
  return started.pid!
}

/** Stop the process occupy started, and wait until it is gone, before its directory is taken away. */
async function settle(): Promise<void> {
  if (child !== null) {
    child.kill('SIGTERM')
    await once(child, 'close')
    child = null
  }
}

describe('a directory with a live process in it is not removed', () => {
  it('lets a quiet tree go: the refusal passes and the sentence says nobody is in it', () => {
    expect(() => refuseToRemoveIfAnybodyIsIn(tree)).not.toThrow()
    expect(whoStillUses(tree)).toBe('No readable live process cwd was found in it.')
  })

  it('refuses to remove a tree a process is working in, and names the tree and the process', async () => {
    const inner = join(tree, 'worker')
    mkdirSync(inner)
    const pid = await occupy(inner)
    const found = processesIn(tree)
    expect(found.length, 'the process was not found in the tree it is working in').toBeGreaterThan(0)
    expect(found.join(', ')).toContain(`PID ${pid}`)
    let refused: string | null = null
    try {
      refuseToRemoveIfAnybodyIsIn(tree)
    } catch (why) {
      refused = String((why as Error).message)
    }
    expect(refused, 'an occupied tree was not refused').not.toBeNull()
    expect(refused).toContain('Refusing to remove')
    expect(refused).toContain(tree)
    expect(refused).toContain(`PID ${pid}`)
  })

  it('does not report a process working in a neighbouring tree', async () => {
    const other = mkdtempSync(join(tmpdir(), 'mole-office-live-process-other-'))
    try {
      await occupy(other)
      expect(processesIn(tree)).toEqual([])
      expect(() => refuseToRemoveIfAnybodyIsIn(tree)).not.toThrow()
    } finally {
      await settle()
      rmSync(other, { recursive: true, force: true })
    }
  })

  it('finds a process in a tree named through a symbolic link, and refuses that tree', async () => {
    const real = join(tree, 'real')
    mkdirSync(real)
    const named = join(tree, 'named-through-a-link')
    symlinkSync(real, named, 'dir')
    const pid = await occupy(named)
    expect(processesIn(named).join(', '), 'the process was not found through the link').toContain(`PID ${pid}`)
    expect(() => refuseToRemoveIfAnybodyIsIn(named)).toThrow(`PID ${pid}`)
  })
})
