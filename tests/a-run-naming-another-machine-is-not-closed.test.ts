// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUNNING ROW THAT NAMES ANOTHER MACHINE IS LEFT ALONE BY BOTH CLOSERS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * Problem `pvpFkZTZRoyY`. The session kind's `machine` key lets a run on another machine say which
 * machine it is on, absent meaning this one, the same word the file kinds use. Before this, the
 * two row closers read only this machine: the directory-gone closer ran `existsSync` on the
 * directory the row named, and the process closer asked this machine's probe about the pid the row
 * recorded. A run on another machine that filed its session here once it was confirmed as a
 * visitor would be closed as stale by the sweep while it was still working — its directory lives
 * on the other machine, and this machine's disk knows nothing of it.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first. Take the `theRowNamesAnotherMachine`
 * check out of the two closers in src/server/lib/own-rows.ts and this file goes red: the remote
 * rows are closed by a sweep that read them against this machine's disk.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

const { THE_API_SERVER } = await import('../src/config/own-rows.mjs')

// A name for another machine on the network. Not what this machine calls itself under its own
// hostname, wherever the run is on this machine to read it.
const ANOTHER = 'cedar-of-the-visitor'
const AS_AN_AGENT = { type: 'agent', id: 'vitest/visitor-machine-columns' } as const

let t: TestDb
let gone: string
let HERE: string | null
let THIS: typeof import('../src/server/lib/machines.ts')

beforeAll(async () => {
  t = await freshDb()
  // Opened after freshDb() has named a database of this test's own; the module reads this
  // machine's name through the operating-system layer, whose import opens the database.
  THIS = await import('../src/server/lib/machines.ts')
  HERE = THIS.thisMachine()
  // A directory that is not on this machine's disk.
  gone = mkdtempSync(join(tmpdir(), 'mole-office-remote-machine-'))
  rmSync(gone, { recursive: true, force: true })
})

afterAll(async () => {
  t?.close()
  rmSync(gone, { recursive: true, force: true })
})

/** One running session row, as a filed run the office would not have written itself. */
function aRunningRow(data: Record<string, unknown>, title = 'Supervisor fixture — Remote X'): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    data: { state: 'running', startedAt: '2026-09-16 10:00:00', doing: 'a row this test filed', ...data },
    actor: AS_AN_AGENT,
  }).id
}

/** One pass of the reminder sweep against this test's own database. */
async function closeNow(): Promise<Record<string, string[]>> {
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-remote-sweep-'))
  try {
    const { sendTheRemindersThatAreDue } = await import('../src/server/lib/reminders.ts')
    return (await sendTheRemindersThatAreDue('default', new Date(), new Date(Date.now() - 60_000), folder)) as unknown as Record<string, string[]>
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

describe('the sweep leaves the rows of another machine alone', () => {
  it('leaves a running row naming another machine alone, though its directory is not on this disk', async () => {
    const remote = aRunningRow({ workingDirectory: gone, machine: ANOTHER })

    const pass = await closeNow()

    expect(pass.directoryGoneRowsClosed, 'the directory closer closed a row of another machine').not.toContain(remote)
    expect(pass.deadOwnRowsClosed, 'the process closer closed a row of another machine').not.toContain(remote)
    const row = t.api.getRecord(remote)!
    expect(row.data['state'], 'the row still says it is running').toBe('running')
    expect(row.data['closedBecause'] ?? null).toBeNull()
  })

  it('closes a row naming no machine as today, and its reason sentence is the one the local rows already had', async () => {
    const local = aRunningRow({ workingDirectory: gone })

    const pass = await closeNow()

    expect(pass.directoryGoneRowsClosed, 'a row naming no machine was left running').toContain(local)
    const row = t.api.getRecord(local)!
    expect(row.data['state']).toBe('finished')
    expect(row.data['closedHow']).toBe('went-stale')
    expect(row.data['closedBecause']).toBe(`its working directory ${gone} no longer exists and it recorded no process`)
  })

  it('closes a row naming THIS machine as today, the contrast the remote name is cut against', async () => {
    // HERE is what thisMachine() answers on the machine this run is on, so a row naming it names
    // this machine and is this machine's reading, whatever value the probe found.
    const local = aRunningRow({ workingDirectory: gone, machine: HERE })

    const pass = await closeNow()

    expect(pass.directoryGoneRowsClosed, 'a row naming this machine was left running').toContain(local)
    expect(t.api.getRecord(local)!.data['state']).toBe('finished')
  })

  it('the process closer too leaves an office row that names another machine alone', async () => {
    // An office's own part row, of the shape the process closer exists to close, carrying the
    // extra fact that the process is on another machine. Under no pid here its close would be a
    // guess about a machine the reading is not on.
    const remote = aRunningRow(
      { machine: ANOTHER, extra: { discovered: { pid: 2_147_483_646, pidStartedAt: '2026-09-16 10:00:00' } } },
      THE_API_SERVER,
    )
    const local = aRunningRow(
      { extra: { discovered: { pid: 2_147_483_645, pidStartedAt: '2026-09-16 10:00:00' } } },
      THE_API_SERVER,
    )

    const pass = await closeNow()

    expect(pass.deadOwnRowsClosed, 'the process closer closed a row of another machine').not.toContain(remote)
    expect(t.api.getRecord(remote)!.data['state']).toBe('running')
    expect(pass.deadOwnRowsClosed, 'the same row without a machine name was not closed').toContain(local)
  })
})
