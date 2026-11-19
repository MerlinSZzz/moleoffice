// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE CLEANUP SIGNALS ONLY A PROCESS GROUP IT RECORDED, AND ONLY WHILE THAT GROUP IS STILL THE ONE IT RECORDED.
 *
 * tools/merge-tool/cleanup.mjs runs beside the merge tool and, when the tool ends or is killed, signals the process
 * groups the tool recorded, and the tool's own group when the tool did not end by itself. On 15 October 2026 a line
 * sandbox ended with exit 0 while a worker ran tests/the-merger.test.ts, which drives this cleanup. A group signal from
 * inside that reached the container's keep-alive is the likely cause, though it was not proven.
 *
 * WHAT IS PROVED:
 *   1. three groups are never signalled, whatever was recorded: group 1, an id that is not a group id (0 and below,
 *      which `process.kill` turns into "the caller's own group" and "every process the user may signal"), and the
 *      cleanup's own group. A cleanup that cannot read its own group signals none;
 *   2. a real cleanup that recorded a group with a start time other than its leader's, as the tool's own group or as one
 *      it started, sends it nothing: the group's sleeping process outlives the cleanup;
 *   3. the same cleanup, given the right start times, does stop both groups, so case 2 is not a cleanup that signals
 *      nothing at all;
 *   4. a real cleanup that recorded its own group, with the right start time, refuses it, says so in its log and exits 1,
 *      instead of ending itself with its own SIGTERM.
 * No case hands group 1 to a real cleanup. Every group a real cleanup is given is one this file started, detached into
 * a group of its own, or the cleanup's own.
 *
 * WHAT GOES RED. Control run first. Make the cleanup signal a group whatever its leader's start time (take out the two
 * start-time `continue`s in its stop) and case 2 goes red. Take out the refusal of the cleanup's own group in
 * whyAGroupIsNeverSignalled and cases 1 and 4 go red. Take out the refusal of group 1 and case 1 goes red.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { theProcessAt } from '../src/config/session-process.mjs'
import { whyAGroupIsNeverSignalled } from '../tools/merge-tool/cleanup.mjs'

const CLEANUP = join(import.meta.dirname, '..', 'tools', 'merge-tool', 'cleanup.mjs')
const A_WRONG_START = '2001-01-01T00:00:00.000Z'
const OWN = theProcessAt(process.pid)
const THIS_FILES_GROUP = OWN.here ? OWN.pgid : null

let scratch: string
const started: ChildProcess[] = []

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-merge-cleanup-'))
})

afterEach(() => {
  // EACH BY ITS OWN PID, never by group: what this file started and what is still running.
  for (const one of started.splice(0)) if (one.exitCode === null && one.signalCode === null) one.kill('SIGKILL')
  rmSync(scratch, { recursive: true, force: true })
})

/** A process this file starts as the leader of a group of its own, with its start time as the reader reads it. */
function aGroupOfItsOwn(): { child: ChildProcess; pid: number; startedAt: string; ended: Promise<NodeJS.Signals | null> } {
  const child = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' })
  started.push(child)
  if (child.pid === undefined) throw new Error('sleep did not start')
  const now = theProcessAt(child.pid)
  if (!now.here || now.startedAt === null || now.pgid !== child.pid) throw new Error(`the group of ${String(child.pid)} could not be read: ${JSON.stringify(now)}`)
  const ended = new Promise<NodeJS.Signals | null>((ok) => child.once('exit', (_code, signal) => ok(signal)))
  return { child, pid: child.pid, startedAt: now.startedAt, ended }
}

/** A group this file may hand to a real cleanup: one it started, never group 1 and never its own. */
function mayBeHandedOver(pid: number): number {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === THIS_FILES_GROUP) throw new Error(`this file never hands group ${String(pid)} to a real cleanup`)
  return pid
}

/**
 * A REAL CLEANUP WATCHER, started as the merge tool starts it: detached, with only its IPC channel. It is told about
 * no sandbox and no seat, so it signals groups and asks nothing else. Its office address is never asked within the
 * 15 seconds before its first look, and it is a closed port.
 */
function aCleanup(owner: { pid: number; startedAt: string }): { watcher: ChildProcess; pid: number; log: string; tell: (message: object) => Promise<void>; ended: Promise<{ code: number | null; signal: NodeJS.Signals | null; said: string }> } {
  const log = join(scratch, 'cleanup.log')
  const watcher = spawn(process.execPath, [CLEANUP, '--watch'], { detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  started.push(watcher)
  if (watcher.pid === undefined) throw new Error('the cleanup did not start')
  let said = ''
  watcher.stdout?.on('data', (chunk: Buffer) => (said += chunk.toString('utf8')))
  watcher.stderr?.on('data', (chunk: Buffer) => (said += chunk.toString('utf8')))
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null; said: string }>((ok) =>
    watcher.once('exit', (code, signal) => ok({ code, signal, said })),
  )
  const tell = (message: object): Promise<void> =>
    new Promise((ok, fail) => watcher.send(message, (err) => (err === null ? ok() : fail(err))))
  const config = {
    ownerGroup: mayBeHandedOver(owner.pid),
    ownerGroupStartedAt: owner.startedAt,
    api: 'http://127.0.0.1:9',
    entry: 'a-synthetic-entry',
    log,
    headers: {},
    launcher: '',
    identity: [],
    environment: {},
  }
  void tell({ type: 'configure', config })
  return { watcher, pid: watcher.pid, log, tell, ended }
}

function stillRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null
}

describe('the groups the merge cleanup never signals', () => {
  it('refuses group 1, an id that is no group, and its own group, and every group when it cannot read its own', () => {
    for (const notAGroup of [0, -1, -4242, 2.5, Number.NaN, Number.POSITIVE_INFINITY, '4242', null, undefined]) {
      expect(whyAGroupIsNeverSignalled(notAGroup, 4242), String(notAGroup)).toContain('is not a process group id')
    }
    expect(whyAGroupIsNeverSignalled(1, 4242)).toContain('group 1 is the first process')
    expect(whyAGroupIsNeverSignalled(4242, 4242)).toContain("is the cleanup's own")
    expect(whyAGroupIsNeverSignalled(4243, null)).toContain('could not read its own process group')
    expect(whyAGroupIsNeverSignalled(4243, 4242)).toBeNull()
  })
})

describe('a real merge cleanup', () => {
  it('sends nothing to a group it recorded with another start time, as the tool\'s group or as one it started', async () => {
    const owner = aGroupOfItsOwn()
    const other = aGroupOfItsOwn()
    const cleanup = aCleanup({ pid: owner.pid, startedAt: A_WRONG_START })
    await cleanup.tell({ type: 'group', pid: mayBeHandedOver(other.pid), startedAt: A_WRONG_START })
    // THE TOOL'S CHANNEL CLOSES, as when the tool is killed: the stop that adds the tool's own group.
    cleanup.watcher.disconnect()
    const ended = await cleanup.ended
    expect(ended, ended.said).toMatchObject({ code: 0, signal: null })
    expect(readFileSync(cleanup.log, 'utf8')).toContain('merge cleanup: merge tool process ended;')
    expect(stillRunning(owner.child), "the tool's group, recorded with another start time").toBe(true)
    expect(stillRunning(other.child), 'a started group, recorded with another start time').toBe(true)
  })

  it('stops both groups when they were recorded with their own start times', async () => {
    const owner = aGroupOfItsOwn()
    const other = aGroupOfItsOwn()
    const cleanup = aCleanup(owner)
    await cleanup.tell({ type: 'group', pid: mayBeHandedOver(other.pid), startedAt: other.startedAt })
    cleanup.watcher.disconnect()
    const ended = await cleanup.ended
    expect(ended, ended.said).toMatchObject({ code: 0, signal: null })
    expect(await owner.ended).toBe('SIGTERM')
    expect(await other.ended).toBe('SIGTERM')
  })

  it('refuses its own group, says so in its log, and exits 1 instead of ending itself', async () => {
    const owner = aGroupOfItsOwn()
    const cleanup = aCleanup(owner)
    const itself = theProcessAt(cleanup.pid)
    if (!itself.here || itself.startedAt === null || itself.pgid !== cleanup.pid) throw new Error(`the cleanup's group could not be read: ${JSON.stringify(itself)}`)
    await cleanup.tell({ type: 'group', pid: mayBeHandedOver(cleanup.pid), startedAt: itself.startedAt })
    // THE TOOL ENDS BY ITSELF: the stop that signals only the groups the tool recorded.
    await cleanup.tell({ type: 'finish' })
    const ended = await cleanup.ended
    expect(ended, ended.said).toMatchObject({ code: 1, signal: null })
    expect(existsSync(cleanup.log)).toBe(true)
    const log = readFileSync(cleanup.log, 'utf8')
    expect(log).toContain(`recorded process group ${String(cleanup.pid)} was not signalled: group ${String(cleanup.pid)} is the cleanup's own`)
    expect(log).toContain('merge cleanup: merge tool ended; recorded process groups not confirmed stopped;')
    expect(stillRunning(owner.child), "the tool's group, which a tool that ended by itself does not have signalled").toBe(true)
  })
})
