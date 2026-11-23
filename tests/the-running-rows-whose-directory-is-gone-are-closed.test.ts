// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUNNING ROW WHOSE WORKING DIRECTORY IS GONE IS CLOSED, AND A ROW WHOSE DIRECTORY IS THERE IS NOT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, ON THE OWNER'S OFFICE
 * ---------------------------------------------------------------------------------------
 *
 * Problem `2plCt-8-b-pW`. Session `bO306uhlFxqZ` (Supervisor SF — Cluster F, started 11 September
 * 2026) said `running` five days after its worktree was removed and its agent was retired. The
 * own-rows closer of 15 September closes a row whose RECORDED PROCESS is gone; this row recorded no
 * process at all, so that closer leaves it alone, and a finish through the door is refused by the
 * seal because the directory the work would be sealed from is not there. Nothing closes it.
 *
 * THIS IS THE CLOSER'S QUESTION TOO. Its condition is the pair of facts the problem names: the row
 * records no process, so nothing the recorded pid says can speak for it, and its working directory
 * no longer exists on the disk, so nothing behind the word `running` can be found. The row is
 * closed with the one cause the reading knows — the directory is gone and no process was recorded —
 * and never with `crashed`, which it did not observe.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first. Take the body off
 * `closeTheRunningRowsWhoseDirectoryIsGone` in src/server/lib/own-rows.ts, so it closes nothing,
 * and this file goes red: the running row that names a directory which is not on the disk is still
 * running, and none was reported closed.
 *
 * THE ROW THAT RECORDS A PROCESS HERE IS DELIBERATELY NOT CLOSED. The process closer reaches only
 * the office's own three parts, so a run like this fixture is not its to close either; the
 * assertion is that the new directory reading does not close one that recorded a process, so a
 * future change to either close shows up here rather than silently.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const AS_AN_AGENT = { type: 'agent', id: 'vitest/finish-door-own-rows' } as const

let t: TestDb
let folder = ''
let gone = ''

beforeAll(async () => {
  t = await freshDb()
  // The sweep's isolated worlds folder, where a caller of `sendTheRemindersThatAreDue` keeps its
  // world-serving stacks; a throwaway directory is what every caller gives it.
  folder = mkdtempSync(join(tmpdir(), 'mole-office-gone-dirs-'))
  // A directory that EXISTED when the run was filed and is not there any more — the worktree a
  // supervisor's run worked in until somebody removed it.
  gone = mkdtempSync(join(tmpdir(), 'mole-office-dircloser-'))
  rmSync(gone, { recursive: true, force: true })
})

afterAll(async () => {
  t?.close()
  rmSync(folder, { recursive: true, force: true })
})

/** One running session row, as a run the office would have filed. */
function aRunningRow(data: Record<string, unknown>): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'Supervisor fixture — Cluster X',
    data: { state: 'running', startedAt: '2026-09-15 10:00:00', doing: 'a row this test filed', ...data },
    actor: AS_AN_AGENT,
  }).id
}

/** One pass of the reminder sweep against this test's own database. */
async function closeNow(): Promise<Record<string, string[]>> {
  const { sendTheRemindersThatAreDue } = await import('../src/server/lib/reminders.ts')
  const pass = sendTheRemindersThatAreDue('default', new Date(), new Date(Date.now() - 60_000), folder) as unknown as Record<string, string[]>
  return pass
}

describe('the closer, through the sweep that calls it', () => {
  it('closes a running row that recorded no process whose working directory is not on the disk, with the one cause it knows', async () => {
    const id = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'Supervisor SF — Cluster F',
      data: {
        state: 'running',
        startedAt: '2026-09-15 10:00:00',
        doing: 'the health and cleanup of a cluster that has landed',
        workingDirectory: gone,
      },
      actor: AS_AN_AGENT,
    }).id

    const before = t.api.getRecord(id)!
    expect(before.data['state']).toBe('running')
    expect(before.data['closedBecause'] ?? null).toBeNull()

    const pass = await closeNow()

    expect(pass.directoryGoneRowsClosed).toContain(id)
    const row = t.api.getRecord(id)!
    expect(row.data['state'], 'the row still says it is running').toBe('finished')
    expect(row.data['closedHow'], 'the close word for nobody having said it ended').toBe('went-stale')
    expect(row.data['closedBecause']).toBe(`its working directory ${gone} no longer exists and it recorded no process`)
  })

  it('leaves a running row whose working directory is still on the disk alone', async () => {
    const kept = aRunningRow({ workingDirectory: REPO })
    const pass = await closeNow()
    expect(pass.directoryGoneRowsClosed, `${kept} should not have been closed`).not.toContain(kept)
    expect(t.api.getRecord(kept)?.data['state']).toBe('running')
    expect(t.api.getRecord(kept)?.data['closedBecause'] ?? null).toBeNull()
  })

  it('leaves a row that recorded no working directory alone, and a row that recorded a process to the process closer', async () => {
    const noDirectory = aRunningRow({})
    const recorded = aRunningRow({
      workingDirectory: gone,
      extra: { discovered: { pid: process.pid, pidStartedAt: '1999-01-01 00:00:00' } },
    })

    const pass = await closeNow()

    // A ROW THAT RECORDS NO WORKING DIRECTORY cannot be asked anything about a place, so the closer
    // says nothing about it rather than guessing one.
    expect(pass.directoryGoneRowsClosed, 'the closer guessed at a row that recorded no directory').not.toContain(noDirectory)
    expect(t.api.getRecord(noDirectory)?.data['state']).toBe('running')
    // A ROW THAT RECORDS A PROCESS is the process closer's question, whatever its directory says.
    // Its going or staying is read from the pid, and this closer must not close it by district.
    // A ROW THAT RECORDS A PROCESS is not this closer's to close: its going or staying is the
    // process closer's question, which reads the pid — and the process closer reaches only the
    // office's own parts, so a run like this one is left exactly as it stands, recording a process.
    expect(pass.directoryGoneRowsClosed, 'the directory reading closed a row that recorded a process').not.toContain(recorded)
    expect(t.api.getRecord(recorded)?.data['state']).toBe('running')
    expect(t.api.getRecord(recorded)?.data['closedBecause'] ?? null).toBeNull()
  })
})

/**
 * THE SWEEP'S TWO CLOSERS READ EVERY PROJECT OF THE INSTALLATION, NOT ONLY ONE.
 *
 * The sweep was started in one project and both closers read only that project's rows, so a running
 * row filed in another project — a real second project the installation holds — was never looked at
 * by either closer, however gone its process or its directory was. This is the follow-up to the fix
 * of problem `2plCt-8-b-pW`: the row it was filed on now closes, but only because the server
 * happens to have been started in the project that row lives in.
 */
describe('the closers reach every project of the installation', () => {
  it('closes a running row the second project filed, from one sweep started for the first project, with the same cause line', async () => {
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'second', title: 'The second project' })
    const id = t.api.createRecord({
      workspaceId: 'second',
      kind: 'session',
      title: 'Supervisor SS — Cluster S',
      data: {
        state: 'running',
        startedAt: '2026-09-15 10:00:00',
        doing: 'the health of a cluster whose worktree the second project has since removed',
        workingDirectory: gone,
      },
      actor: AS_AN_AGENT,
    }).id

    // ONE CALL, STARTED FOR THE FIRST PROJECT. The row belongs to another project entirely; the
    // sweep reads it anyway, because its registry names the second project too.
    const pass = await closeNow()

    expect(pass.directoryGoneRowsClosed, `${id} was not closed by the sweep started for the first project`).toContain(id)
    const row = t.api.getRecord(id)!
    expect(row.data['state'], 'the row still says it is running').toBe('finished')
    expect(row.data['closedHow'], 'the close word for nobody having said it ended').toBe('went-stale')
    expect(row.data['closedBecause'], "the same cause line the first project's rows get").toBe(
      `its working directory ${gone} no longer exists and it recorded no process`,
    )
  })

  it('leaves a running row in the second project whose working directory is still on the disk alone', async () => {
    const kept = t.api.createRecord({
      workspaceId: 'second',
      kind: 'session',
      title: 'Supervisor ST — Cluster T',
      data: {
        state: 'running',
        startedAt: '2026-09-15 10:00:00',
        doing: 'a row whose directory is still there',
        workingDirectory: REPO,
      },
      actor: AS_AN_AGENT,
    }).id

    const pass = await closeNow()

    expect(pass.directoryGoneRowsClosed, `${kept} should not have been closed`).not.toContain(kept)
    expect(t.api.getRecord(kept)?.data['state']).toBe('running')
    expect(t.api.getRecord(kept)?.data['closedBecause'] ?? null).toBeNull()
  })

  it('says the project beside each closed id in the log, while the installation holds more than one project', async () => {
    const { theClosedRowsSaidForTheLog } = await import('../src/server/lib/reminders.ts')
    // The second project was created by the first test of this describe, so the registry here holds
    // two — which is the only condition under which the project is said at all.
    const closed = t.api.createRecord({
      workspaceId: 'second',
      kind: 'session',
      title: 'Supervisor SU — Cluster U',
      data: { state: 'running', startedAt: '2026-09-15 10:00:00', workingDirectory: gone },
      actor: AS_AN_AGENT,
    }).id

    expect(theClosedRowsSaidForTheLog([closed])).toBe(`${closed} (second)`)
  })
})


// ================================================ a row the seal would otherwise try to read

describe('a row whose run would be sealed on a finish', () => {
  it('is closed by the sweep without the seal being attempted, because a stale close is not a finish', async () => {
    // A run that names its agent and its cut, the shape a supervisor's run has. On a finish the
    // office would seal it, and the seal reads the working directory, which is gone: sealing
    // would throw and take the whole tick with it. The close is the office's reading, not the
    // run's word, so nothing is sealed and the tick goes on.
    const row = aRunningRow({
      workingDirectory: gone,
      servingAgent: 'a-handle-nobody-registered',
      cutFrom: 'main',
    })
    const pass = await closeNow()
    expect(pass['directoryGoneRowsClosed'], 'the row with a would-be seal was not closed').toContain(row)
    const closed = t.api.getRecord(row)
    expect(closed?.data['state']).toBe('finished')
    expect(closed?.data['closedHow']).toBe('went-stale')
    expect(closed?.data['sealedTip'] ?? null, 'a stale close wrote a seal').toBeNull()
  })
})


// ================================================ a row whose launcher still holds its process row

/**
 * A RUNNING ROW IS LEFT ALONE WHILE ITS LAUNCHER'S PROCESS ROW IS OPEN, WHATEVER ITS DIRECTORY SAYS.
 *
 * The launcher writes the run's command as a process row marked as started by the product, and releases it when the
 * command ends. A run whose worktree was removed while its launcher still ran was closed under the launcher by the
 * directory reading. The closer now passes over such a row, and closes it as before once that process row is released.
 */
describe('a running row whose launcher still holds its process row', () => {
  /** A running row naming a directory that is gone, with an open process row for its launcher, as the launcher registers one. */
  async function aLaunchedRow(): Promise<{ id: string; launcher: string }> {
    const { registerResource } = await import('../src/server/lib/resources.ts')
    const id = aRunningRow({ workingDirectory: gone })
    // THE TEST'S OWN PROCESS STANDS FOR THE LAUNCHED COMMAND, because the ledger takes only a pid that is running.
    const launcher = registerResource({
      workspaceId: 'default', sessionRecordId: id, type: 'process', key: String(process.pid), startedByTheProduct: true,
      actor: AS_AN_AGENT,
    }).id
    return { id, launcher }
  }

  it('leaves the row running after a sweep while its launcher process row is open', async () => {
    const { id } = await aLaunchedRow()
    const pass = await closeNow()
    expect(pass.directoryGoneRowsClosed, 'the directory reading closed a row whose launcher still holds its process row').not.toContain(id)
    expect(t.api.getRecord(id)?.data['state']).toBe('running')
    expect(t.api.getRecord(id)?.data['closedBecause'] ?? null).toBeNull()
  })

  it('closes the row on the next sweep once its launcher process row is released, with the cause a gone directory gets', async () => {
    const { closeRowThatStoppedMatching } = await import('../src/server/lib/resources.ts')
    const { theDirectoryGoneRowPatch } = await import('../src/config/own-rows.mjs')
    const { id, launcher } = await aLaunchedRow()
    expect((await closeNow()).directoryGoneRowsClosed).not.toContain(id)
    // RELEASED AS THE LEDGER RECORDS A ROW WHOSE COMMAND ENDED, with no signal: the release door would stop the row's
    // process group, which here is the test's own.
    closeRowThatStoppedMatching(launcher, 'default', 'the test command ended', AS_AN_AGENT)
    const pass = await closeNow()
    expect(pass.directoryGoneRowsClosed, `${id} was not closed once its launcher process row was released`).toContain(id)
    const row = t.api.getRecord(id)!
    const asToday = theDirectoryGoneRowPatch(gone, '')
    expect(row.data['state']).toBe(asToday.state)
    expect(row.data['closedBecause']).toBe(asToday.closedBecause)
    expect(row.data['closedHow']).toBe(asToday.closedHow)
  })
})
