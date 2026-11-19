// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE CLEANUP READS A WITHDRAWN ENTRY WHILE THE OFFICE IS SLOW, AND STOPS THE TOOL WITHIN A BOUND. Wave 13u,
 * round 185.
 *
 * tools/merge-tool/cleanup.mjs asks the office for its entry every 15 seconds while the merge tool runs, and stops the
 * tool's process groups when the entry is withdrawn, cancelled or superseded. It gave each answer 5 seconds. While a
 * suite runs the office answers more slowly than that: the tool's own health watch, which gives an answer 30 seconds,
 * saw 14 of 289 answers take over 10 seconds during one entry's suite, the slowest 19.4. The cleanup aborted each such
 * ask, wrote "entry state could not be read during testing" in the tool's log, and so could not have read a withdrawal
 * while the office was that slow.
 *
 *   1. A real cleanup, beside a fake office that answers the entry as withdrawn after 12 seconds, stops the tool's
 *      group and a group the tool recorded, and exits 0, within the first look plus the office's slow answer plus a
 *      margin. It says why in its log, and says no ask went unanswered.
 *
 * The fake office is this file's own server on a loopback port. The cleanup is given no office setting of this run and
 * a database path in a scratch folder, so it finds no key file and sends no key. Every group handed to the cleanup is
 * one this file started, detached into a group of its own.
 *
 * WHAT GOES RED. Control run first, on main, where the cleanup gives an answer 5 seconds: case 1 goes red at its bound,
 * with both groups still running.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { theProcessAt } from '../src/config/session-process.mjs'

const CLEANUP = join(import.meta.dirname, '..', 'tools', 'merge-tool', 'cleanup.mjs')
const ENTRY = 'a-made-up-entry'
/** How long the fake office takes to answer the entry: over the old 5 seconds, and in the range a suite's office took. */
const THE_OFFICE_TAKES_MS = 12_000
/** The cleanup's first look comes 15 seconds after it is configured. */
const ITS_FIRST_LOOK_MS = 15_000
/** The stop itself waits a second between its two signals, and a loaded machine is slower. */
const A_MARGIN_MS = 20_000
const OWN = theProcessAt(process.pid)
const THIS_FILES_GROUP = OWN.here ? OWN.pgid : null

let scratch: string
let office: Server | null = null
const started: ChildProcess[] = []

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-slow-office-'))
})

afterEach(async () => {
  // EACH BY ITS OWN PID, never by group: what this file started and what is still running.
  for (const one of started.splice(0)) if (one.exitCode === null && one.signalCode === null) one.kill('SIGKILL')
  if (office !== null) await new Promise<void>((done) => office!.close(() => done()))
  office = null
  rmSync(scratch, { recursive: true, force: true })
})

/** A process this file starts as the leader of a group of its own, with its start time as the reader reads it. */
function aGroupOfItsOwn(): { child: ChildProcess; pid: number; startedAt: string; ended: Promise<NodeJS.Signals | null> } {
  const child = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' })
  started.push(child)
  if (child.pid === undefined) throw new Error('sleep did not start')
  const now = theProcessAt(child.pid)
  if (!now.here || now.startedAt === null || now.pgid !== child.pid) throw new Error(`the group of ${String(child.pid)} could not be read: ${JSON.stringify(now)}`)
  if (child.pid <= 1 || child.pid === THIS_FILES_GROUP) throw new Error(`this file never hands group ${String(child.pid)} to a real cleanup`)
  const ended = new Promise<NodeJS.Signals | null>((ok) => child.once('exit', (_code, signal) => ok(signal)))
  return { child, pid: child.pid, startedAt: now.startedAt, ended }
}

/** A fake office that answers the entry as withdrawn after THE_OFFICE_TAKES_MS, and takes a gate's count at once. */
async function aSlowOffice(): Promise<{ api: string; asked: string[] }> {
  const asked: string[] = []
  office = createServer((req, res) => {
    asked.push(`${String(req.method)} ${String(req.url)}`)
    const answer = (body: object) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.method === 'GET' && req.url === `/api/merge-queue/${ENTRY}`) setTimeout(() => answer({ entry: { id: ENTRY, state: 'withdrawn' } }), THE_OFFICE_TAKES_MS)
    else answer({})
  })
  await new Promise<void>((done) => office!.listen(0, '127.0.0.1', () => done()))
  return { api: `http://127.0.0.1:${String((office!.address() as AddressInfo).port)}`, asked }
}

/** Resolves true when `ended` settles within `ms`, and false when it does not. */
const within = (ended: Promise<unknown>, ms: number): Promise<boolean> =>
  Promise.race([ended.then(() => true), new Promise<boolean>((done) => setTimeout(() => done(false), ms))])

describe('a merge cleanup beside a slow office', () => {
  it('1: reads the withdrawn entry and stops the tool and its recorded group within a bound', async () => {
    const { api, asked } = await aSlowOffice()
    const tool = aGroupOfItsOwn()
    const suite = aGroupOfItsOwn()
    const log = join(scratch, 'cleanup.log')
    // AS THE MERGE TOOL STARTS IT: detached, with only its IPC channel. No office setting of this run reaches it, and
    // its database path is a scratch one, so it reads no key.
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('MOLE_')))
    const watcher = spawn(process.execPath, [CLEANUP, '--watch'], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { ...env, MOLE_OFFICE_DB: join(scratch, 'made-up.db') },
    })
    started.push(watcher)
    // ITS LAST LINE IN THE LOG comes after the groups have ended, so the log is read once the cleanup has exited.
    const watcherEnded = new Promise<number | null>((ok) => watcher.once('exit', (code) => ok(code)))
    const tell = (message: object): Promise<void> => new Promise((ok, fail) => watcher.send(message, (err) => (err === null ? ok() : fail(err))))
    await tell({
      type: 'configure',
      config: { ownerGroup: tool.pid, ownerGroupStartedAt: tool.startedAt, api, entry: ENTRY, log, headers: {}, launcher: '', identity: [], environment: {} },
    })
    await tell({ type: 'group', pid: suite.pid, startedAt: suite.startedAt })

    const bound = ITS_FIRST_LOOK_MS + THE_OFFICE_TAKES_MS + A_MARGIN_MS
    const stopped = await within(Promise.all([tool.ended, suite.ended, watcherEnded]), bound)
    let said = ''
    try {
      said = readFileSync(log, 'utf8')
    } catch {
      said = '(the cleanup wrote no log)'
    }
    expect(stopped, `both groups and the cleanup ended within ${String(bound / 1000)} s; the office was asked ${JSON.stringify(asked)}; the cleanup's log:\n${said}`).toBe(true)
    expect(await watcherEnded, `the cleanup's log:\n${said}`).toBe(0)
    expect(await tool.ended).toBe('SIGTERM')
    expect(await suite.ended).toBe('SIGTERM')
    expect(said).toContain(`merge cleanup: entry ${ENTRY} is withdrawn;`)
    expect(said).not.toContain('entry state could not be read')
  }, 90_000)
})
