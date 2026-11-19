// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SESSION THAT STARTS AGAIN AFTER ITS RECORD WAS CLOSED GETS A NEW RECORD, AND THE OLD ONE STAYS
 * CLOSED. The owner's section 16 (design/ROUND-ELEVEN-OWNER-MESSAGE.md): "SessionStart/register must
 * create a NEW attachment." and "Do not pretend an old closed attachment remained alive."
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `end` closes the session record. A `claude --resume` runs `start` again with the same session id,
 * and the hook used to find the closed record through its note, write the new process onto it and say
 * it was "already filed". The session was answering on a record that said finished (problem
 * n8Wdb_ZaCb_2, record I1YvY7y7shXb). Now the closed record is left exactly as it was, and
 * this start goes the way a start with no note goes.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. start, end, start again behind the claude program: a NEW record is filed and reads running, the
 *      note names it, the old record is unchanged byte for byte, and the line names both. A second
 *      `end` closes the new record, and the old one is still unchanged.
 *   2. The same when this start is not behind the claude program, and when the old record was closed
 *      some other way (`closedHow` agent-said): a new record on every start.
 *   3. The note names a closed record and one live record names the conversation: that live record is
 *      taken over, and nothing new is filed.
 *   4. The note names a closed record and two live records name the conversation: nothing is filed,
 *      and the line says this start is on no record.
 *
 * Each run is the real hook, as a child process, against a listening server on a throwaway database,
 * with HOME set to a scratch folder. "Behind the claude program" is a shell script called `claude`
 * above the hook, the way tests/the-hook-writes-down-which-conversation-this-is.test.ts does it.
 *
 * ---------------------------------------------------------------------------------------
 * CONTROL, MUTATION, RESTORE
 * ---------------------------------------------------------------------------------------
 *
 * The runs and their logs are named in the commit message of the change that rewrote this file.
 *   · MUTATION A: a note naming a record that is over is used as it was before (`if (byNote !== null)`),
 *     so the old record is stamped and nothing new is filed. All four cases go red.
 *   · MUTATION B: `earlier` is set to null, so the line no longer names the closed record. All four
 *     cases go red, because each one reads that line.
 */

import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(CHECKOUT, 'tools', 'session-hook.mjs')
const NOTES = join(CHECKOUT, '.logs')
const TESTER = 'resume-tester'

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url: string
let scratch: string
const notesWritten: string[] = []
/** The session records that were already in the office when this case began. */
let heldAtTheStart = new Set<string>()

beforeAll(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  url = `http://127.0.0.1:${String((server.app.server.address() as AddressInfo).port)}`
  // THE AGENT THESE RUNS ANSWER AS, filed once. The scratch folder is outside the checkout, and a run
  // there that nothing names prints only that it does not know who it answers as.
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: TESTER,
    data: { handle: TESTER, state: 'active', runtime: 'claude-code' },
    actor: { type: 'human', id: THE_PERSON },
  })
}, 60_000)

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-hook-resume-'))
  // THE READING IS OVER THE WHOLE OFFICE, so the case takes the ids that were there at its start
  // and counts the ones added since. Nothing is filtered by conversation: a session record written
  // with the wrong provider session is still a session record this case must see.
  heldAtTheStart = new Set(t.api.listRecords({ workspaceId: 'default', kind: 'session' }).map((one) => one.id))
})

afterAll(async () => {
  await server.app.close()
  t.close()
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
  for (const name of notesWritten.splice(0)) rmSync(join(NOTES, name), { force: true })
})

function aSessionId(): string {
  const id = `resume-${Math.random().toString(36).slice(2)}-${String(Date.now())}`
  notesWritten.push(`session-${id}.json`)
  return id
}

function aTranscript(): string {
  const path = join(scratch, `t-${Math.random().toString(36).slice(2)}.jsonl`)
  writeFileSync(path, '{"type":"user"}\n', 'utf8')
  return path
}

/** Run the real hook, behind a script called `claude` when `behindClaude` is true. */
async function runHook(mode: 'start' | 'end', payload: Record<string, unknown>, behindClaude: boolean): Promise<string> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: mkdtempSync(join(scratch, 'home-')),
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
    MOLE_OFFICE_AGENT: TESTER,
  }
  delete env['TMUX_PANE']
  let program = 'node'
  if (behindClaude) {
    program = join(scratch, 'claude')
    writeFileSync(program, `#!/bin/sh\necho "WRAPPER-PID $$"\n"${process.execPath}" "$@"\n`, { mode: 0o755 })
  }
  return await new Promise<string>((resolve, reject) => {
    const child = execFile(program, [HOOK, mode], { encoding: 'utf8', env }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(JSON.stringify(payload))
  })
}

function theNote(sessionId: string): string | null {
  const path = join(NOTES, `session-${sessionId}.json`)
  if (!existsSync(path)) return null
  return String((JSON.parse(readFileSync(path, 'utf8')) as { id?: unknown }).id ?? '')
}

function sessionIds(): string[] {
  return t.api
    .listRecords({ workspaceId: 'default', kind: 'session' })
    .map((one) => one.id)
    .filter((id) => !heldAtTheStart.has(id))
}

function dataOf(id: string): Record<string, unknown> {
  return t.api.getRecord(id)!.data as Record<string, unknown>
}

/** Start and end one session behind the claude program, and hand back the closed record's id. */
async function aSessionThatEnded(sessionId: string, payload: Record<string, unknown>): Promise<string> {
  await runHook('start', payload, true)
  await runHook('end', payload, true)
  const ids = sessionIds()
  expect(ids, 'the control: one record for the first run').toHaveLength(1)
  expect(dataOf(ids[0]!)['state'], 'the control: end closes the record').toBe('finished')
  expect(theNote(sessionId)).toBe(ids[0])
  return ids[0]!
}

describe('a session that starts again after its record was closed gets a new record', () => {
  it('files a new running record, points the note at it, and leaves the old record exactly as it was', async () => {
    const sessionId = aSessionId()
    const payload = { session_id: sessionId, transcript_path: aTranscript(), cwd: scratch, reason: 'prompt_input_exit' }
    const old = await aSessionThatEnded(sessionId, payload)
    const before = JSON.stringify(dataOf(old))

    const out = await runHook('start', payload, true)

    const fresh = sessionIds().filter((one) => one !== old)
    expect(fresh, 'no new record was filed').toHaveLength(1)
    const now = fresh[0]!
    expect(dataOf(now)['state']).toBe('running')
    expect(dataOf(now)['providerSession']).toBe(sessionId)
    expect(theNote(sessionId), 'the note still names the closed record').toBe(now)
    expect(JSON.stringify(dataOf(old)), 'the closed record was written to').toBe(before)
    const was = JSON.parse(before) as Record<string, unknown>
    expect(out).toContain(`This session is filed as record ${now}.`)
    expect(out).toContain(
      `The record this session's note named, ${old}, reads finished, closed at ${String(was['closedAt'])}. It stays ` +
        `closed and this start did not change it: a closed record is never reopened. This start filed the new record ${now}.`,
    )

    await runHook('end', payload, true)
    expect(dataOf(now)['state'], 'the second end did not close the new record').toBe('finished')
    expect(typeof dataOf(now)['closedBecause']).toBe('string')
    expect(JSON.stringify(dataOf(old)), 'the second end wrote to the old record').toBe(before)
  })

  it('files a new record on every start: without the claude program, and after a close of another kind', async () => {
    const sessionId = aSessionId()
    const payload = { session_id: sessionId, transcript_path: aTranscript(), cwd: scratch }
    await runHook('start', payload, true)
    const [old] = sessionIds()
    t.api.patchRecord(
      old!,
      { dataPatch: { state: 'finished', closedAt: '2026-09-24 10:00:00', closedHow: 'agent-said', closedBecause: 'The agent said its work was done.' } },
      { type: 'human', id: THE_PERSON },
    )
    const before = JSON.stringify(dataOf(old!))

    const out = await runHook('start', payload, false)

    const fresh = sessionIds().filter((one) => one !== old)
    expect(fresh).toHaveLength(1)
    expect(theNote(sessionId)).toBe(fresh[0])
    expect(JSON.stringify(dataOf(old!))).toBe(before)
    expect(out).toContain(`This start filed the new record ${fresh[0]!}.`)
  })
})

describe('the closed record and the lookup of the conversation are one path', () => {
  it('takes over the one live record naming the conversation instead of filing a new one', async () => {
    const sessionId = aSessionId()
    const payload = { session_id: sessionId, transcript_path: aTranscript(), cwd: scratch }
    const old = await aSessionThatEnded(sessionId, payload)
    const before = JSON.stringify(dataOf(old))
    const live = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'filed by register-myself after the end',
      data: { state: 'running', runtime: 'claude-code', providerSession: sessionId },
      actor: { type: 'human', id: THE_PERSON },
    }).id

    const out = await runHook('start', payload, true)

    expect(sessionIds().sort(), 'a new record was filed beside the live one').toEqual([old, live].sort())
    expect(theNote(sessionId)).toBe(live)
    expect(JSON.stringify(dataOf(old))).toBe(before)
    expect(out).toContain(`This start took over record ${live} instead.`)
  })

  it('files nothing when two live records name the conversation, and says this start is on no record', async () => {
    const sessionId = aSessionId()
    const payload = { session_id: sessionId, transcript_path: aTranscript(), cwd: scratch }
    const old = await aSessionThatEnded(sessionId, payload)
    const before = JSON.stringify(dataOf(old))
    for (const title of ['one', 'two']) {
      t.api.createRecord({
        workspaceId: 'default',
        kind: 'session',
        title,
        data: { state: 'running', runtime: 'claude-code', providerSession: sessionId },
        actor: { type: 'human', id: THE_PERSON },
      })
    }

    const out = await runHook('start', payload, true)

    expect(sessionIds()).toHaveLength(3)
    expect(JSON.stringify(dataOf(old))).toBe(before)
    expect(out).toContain('This start is on no record.')
    expect(out).toContain('open session records already name this conversation')
  })
})
