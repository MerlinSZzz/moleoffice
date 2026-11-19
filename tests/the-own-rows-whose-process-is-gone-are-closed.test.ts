// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OFFICE ROW WHOSE PROCESS IS GONE IS CLOSED, BY THE SWEEP AND BY THE NEXT START.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `1p-pQxYe0RLB`. The replaced-rows close reaches a row only when the same part starts again
 * on the same port and checkout. A browser app a check worktree started is never started again — a
 * check works in a worktree it discards — so its row said running for ever, and the same was true of
 * any of the three parts whose process was killed without a word.
 *
 * The API's own start and the reminder tick now read each own-row's recorded pid against the
 * machine. This file proves the rule and the tick on real databases, and `tests/startup.test.ts`
 * proves the start beside `closeTheEarlierOwnRows`, through a server spawned the way `npm start`
 * starts one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES TO SAY
 * ---------------------------------------------------------------------------------------
 *
 * A row with no recorded pid is left alone: nothing can be said about a row nobody gave a pid. A row
 * whose process is alive is left running. Nothing is ever written `crashed`: the row was found by a
 * reading that the process is absent, not by seeing how it ended, which is the fifth rule.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { theRecordedProcessIsGone, theRecordedProcessOf } from '../src/config/own-rows.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const WEB_PORT = 5199
const THE_ROLES = ['The API server', 'The message worker', 'The browser app'] as const
const AS_AN_AGENT = { type: 'agent', id: 'vitest/own-rows-gone' } as const

let t: TestDb
let folder = ''

beforeEach(async () => {
  t = await freshDb()
  folder = mkdtempSync(join(tmpdir(), 'mole-office-gone-rows-'))
})

afterEach(() => {
  t.close()
  rmSync(folder, { recursive: true, force: true })
  folder = ''
})

/** A pid the operating system really no longer has, from a child this test started and let exit. */
async function aPidThatIsGone(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  const pid = child.pid
  if (pid === undefined) throw new Error('the child this test started reported no pid')
  await new Promise<void>((done) => child.once('exit', () => done()))
  const { osProbe } = await import('../src/server/lib/resources.ts')
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (osProbe().processById(pid) === null) return pid
    await new Promise((go) => setTimeout(go, 25))
  }
  throw new Error(`pid ${String(pid)} never went away`)
}

/** One running own-row, with the process block a real start would have written. */
function anOwnRow(title: string, discovered: Record<string, unknown> | null): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    data: {
      state: 'running',
      runtime: 'mole-office',
      startedAt: '2026-09-15 10:00:00',
      doing: 'a row this test filed',
      workingDirectory: REPO,
      extra: {
        ownPart: { role: title, port: WEB_PORT, checkout: REPO },
        ...(discovered === null ? {} : { discovered }),
      },
    },
    actor: AS_AN_AGENT,
  }).id
}

describe('the recorded process rule', () => {
  it('calls a missing process gone, the same pid with another start time gone, and the same process alive', () => {
    expect(theRecordedProcessOf({ data: { extra: { discovered: { pid: 41 } } } })).toEqual({
      pid: 41,
      pidStartedAt: null,
    })
    expect(theRecordedProcessOf({ data: {} })).toEqual({ pid: null, pidStartedAt: null })

    const live = { startedAt: '2026-09-15 10:00:00' }
    expect(theRecordedProcessIsGone({ pid: 41, pidStartedAt: null }, null), 'a missing process is not gone').toBe('gone')
    expect(theRecordedProcessIsGone({ pid: 41, pidStartedAt: null }, live)).toBe('alive')
    expect(theRecordedProcessIsGone({ pid: 41, pidStartedAt: live.startedAt }, live)).toBe('alive')
    expect(
      theRecordedProcessIsGone({ pid: 41, pidStartedAt: '2026-09-15 09:00:00' }, live),
      'the number was reused and the row was called alive',
    ).toBe('gone')
    expect(theRecordedProcessIsGone({ pid: null, pidStartedAt: null }, null), 'a row with no pid was called gone').toBe(
      'unknown',
    )
    // THE OLD READING IS STILL THE SAME PROCESS. Before 3 September 2026 the start time was the
    // /proc directory's modification time; a row stamped that way is not a reused pid.
    expect(
      theRecordedProcessIsGone(
        { pid: 41, pidStartedAt: '2026-09-14 23:00:00' },
        { startedAt: '2026-09-15 10:00:00', directoryChangedAt: '2026-09-14 23:00:00' },
      ),
    ).toBe('alive')
  })
})

describe('the sweep tick closes an own-row whose process is gone', () => {
  it('closes a dead process row of each own part, and leaves an alive, a reused-stamp and a pid-less one alone', async () => {
    const deadPid = await aPidThatIsGone()
    const { osProbe } = await import('../src/server/lib/resources.ts')
    const live = osProbe().processById(process.pid)
    if (live === null) throw new Error('this test process could not be read, so the alive case proves nothing')

    const dead: string[] = []
    for (const role of THE_ROLES) dead.push(anOwnRow(role, { pid: deadPid }))
    // A role this close must not touch: only the office's own parts are read.
    const aRun = anOwnRow('A run that is not an own part', { pid: deadPid })
    // THE ALIVE ROW, and the number reused by a different process: both name THIS process.
    const alive = anOwnRow('The browser app', { pid: process.pid, pidStartedAt: live.startedAt })
    const reused = anOwnRow('The message worker', { pid: process.pid, pidStartedAt: '1999-01-01 00:00:00' })
    const noPid = anOwnRow('The API server', null)

    const { sendTheRemindersThatAreDue } = await import('../src/server/lib/reminders.ts')
    const pass = sendTheRemindersThatAreDue('default', new Date(), new Date(Date.now() - 60_000), folder)

    for (const id of [...dead, reused]) {
      expect(pass.deadOwnRowsClosed, `${id} was not closed by the tick`).toContain(id)
      const row = t.api.getRecord(id)
      expect(row?.data['state'], 'the row still says it is running').toBe('finished')
      expect(row?.data['closedHow']).toBe('went-stale')
    }
    const firstDead = dead[0]
    if (firstDead === undefined) throw new Error('the dead rows this test filed have no first')
    expect(String(t.api.getRecord(firstDead)?.data['closedBecause'])).toMatch(
      new RegExp(`^its process ${String(deadPid)} is gone, found at \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$`),
    )
    expect(t.api.getRecord(firstDead)?.data['closedHow'], 'it wrote crashed').not.toBe('crashed')

    for (const id of [aRun, alive, noPid]) {
      expect(pass.deadOwnRowsClosed, `${id} should not have been closed`).not.toContain(id)
      expect(t.api.getRecord(id)?.data['state'], 'a row that should have been left running was closed').toBe('running')
      expect(t.api.getRecord(id)?.data['closedBecause'] ?? null).toBeNull()
    }
  }, 60_000)
})
