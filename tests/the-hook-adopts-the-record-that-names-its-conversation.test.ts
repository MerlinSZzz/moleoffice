// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readTheHookDetails } from './hook-details.ts'
/**
 * THE START HOOK TAKES OVER THE ONE OPEN RECORD THAT ALREADY NAMES ITS CONVERSATION. It is the
 * owner's decision of 24 September 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * When a session's note (.logs/session-<id>.json) was missing, `start` filed a new session record. A
 * record that already named the conversation — filed by `tools/register-myself.mjs --provider-session`,
 * or by a waiter — then never got the session's process, and letters were routed wrongly twice in one
 * week because of it. The rule now: with exactly one open record naming the conversation, the hook
 * takes it over; with none, it files one as before; with more than one, it files none and names them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. One open record with `providerSession` = the session id, and no note: the hook writes the note
 *      naming it, records this process on it, and files no second record.
 *   2. The same when only `data.extra.discovered.externalId` names the conversation.
 *   3. No record names it: the hook files one, as before.
 *   4. Two open records name it: the hook files nothing, writes no note, and names both.
 *   5. A finished record naming it is not taken over: the hook files a new one and leaves it alone.
 *   6. The office did not answer the list of session records: the hook files one and says another
 *      record may already name the conversation.
 *   7. A note whose record was deleted counts as no note: the one open record is taken over.
 *   8. The start-folder answer, which runs before the record is chosen, counts the record taken over as
 *      this session's own, so an agent whose waiter holds its handle there is named, not refused.
 *
 * Each run is the real hook, as a child process, against a listening server on a throwaway database,
 * with HOME set to a scratch folder. Cases 1 and 2 put a shell script called `claude` above the hook,
 * the way tests/the-hook-writes-down-which-conversation-this-is.test.ts does, so the process is recorded.
 *
 * ---------------------------------------------------------------------------------------
 * CONTROL, MUTATION, RESTORE
 * ---------------------------------------------------------------------------------------
 *
 * The runs and their logs are named in the commit message of the change that added this file.
 *   · MUTATION A: `theRecordThisStartIsFor` returns `file` whenever the note names nothing, so the
 *     hook files as before regardless. Cases 1, 2, 4, 6, 7 and 8 go red (6 because the mutation also
 *     says the list was read).
 *   · MUTATION B: with more than one record, the first is taken over. Case 4 goes red.
 *   · MUTATION C: the start-folder answer compares only with the note again. Case 8 goes red.
 */

import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(CHECKOUT, 'tools', 'session-hook.mjs')
const NOTES = join(CHECKOUT, '.logs')

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url: string
let scratch: string
const notesWritten: string[] = []
const TESTER = 'adopt-tester'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeEach(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  url = `http://127.0.0.1:${String((server.app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-hook-adopt-'))
  // THE AGENT THESE RUNS ANSWER AS, named in the environment. The scratch folder is outside the checkout,
  // and a run there that nothing names prints only that it does not know who it answers as, which would
  // hide the line these cases read. The start-folder case names nobody here, on purpose.
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: TESTER,
    data: { handle: TESTER, state: 'active', runtime: 'claude-code' },
    actor: { type: 'human', id: THE_PERSON },
  })
})

afterEach(async () => {
  await server.app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
  for (const name of notesWritten.splice(0)) rmSync(join(NOTES, name), { force: true })
})

function aSessionId(): string {
  const id = `adopt-${Math.random().toString(36).slice(2)}-${String(Date.now())}`
  notesWritten.push(`session-${id}.json`)
  return id
}

function aTranscript(name = 'conversation.jsonl'): string {
  const path = join(scratch, name)
  writeFileSync(path, '{"type":"user"}\n', 'utf8')
  return path
}

/**
 * Run the real hook. `behindClaude` puts a shell script called `claude` above it, so the hook's parent
 * is read as the claude program and its process is recorded.
 */
async function runHook(
  payload: Record<string, unknown>,
  options: { behindClaude?: boolean; api?: string; namesNoAgent?: boolean } = {},
): Promise<string> {
  const home = mkdtempSync(join(scratch, 'home-'))
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    MOLE_OFFICE_API: options.api ?? url,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
    MOLE_OFFICE_AGENT: TESTER,
  }
  delete env['TMUX_PANE']
  if (options.namesNoAgent === true) delete env['MOLE_OFFICE_AGENT']
  let program = 'node'
  if (options.behindClaude === true) {
    program = join(scratch, 'claude')
    writeFileSync(program, `#!/bin/sh\necho "WRAPPER-PID $$"\n"${process.execPath}" "$@"\n`, { mode: 0o755 })
  }
  return await new Promise<string>((resolve, reject) => {
    const child = execFile(program, [HOOK, 'start'], { encoding: 'utf8', env }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(JSON.stringify(payload))
  })
}

/** The record id the note names, or null when there is no note. */
function theNote(sessionId: string): string | null {
  const path = join(NOTES, `session-${sessionId}.json`)
  if (!existsSync(path)) return null
  return String((JSON.parse(readFileSync(path, 'utf8')) as { id?: unknown }).id ?? '')
}

function sessionRecords() {
  return t.api.listRecords({ workspaceId: 'default', kind: 'session' })
}

function aSessionRecord(title: string, data: Record<string, unknown>): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    data: { runtime: 'claude-code', ...data },
    actor: { type: 'human', id: THE_PERSON },
  }).id
}

function discoveredOn(id: string): Record<string, unknown> {
  const data = t.api.getRecord(id)!.data as { extra?: { discovered?: Record<string, unknown> } }
  return data.extra?.discovered ?? {}
}

describe('exactly one open record names the conversation, and the hook takes it over', () => {
  it('by providerSession: writes the note to it, records this process on it, and files no second record', async () => {
    const sessionId = aSessionId()
    const named = aSessionRecord('filed by register-myself', { state: 'running', providerSession: sessionId })
    expect(theNote(sessionId), 'the case needs the note to be missing').toBeNull()

    const out = await runHook({ session_id: sessionId, transcript_path: aTranscript(), cwd: scratch }, { behindClaude: true })

    expect(theNote(sessionId), 'the note does not name the record that names this conversation').toBe(named)
    expect(sessionRecords().map((one) => one.id), 'a second record was filed').toEqual([named])
    const discovered = discoveredOn(named)
    const wrapperPid = Number(/WRAPPER-PID (\d+)/.exec(out)?.[1] ?? 'NaN')
    expect(discovered['pid'], 'this process was not recorded on the record taken over').toBe(wrapperPid)
    expect(discovered['externalId']).toBe(sessionId)
    expect(out).toContain(`This session is filed as record ${named}.`)
    expect(out).toContain(
      `No new record was filed: record ${named} was still open and already named this conversation (${sessionId}), ` +
        'so the hook took it over and wrote its note for this session.',
    )
    expect(out).toContain(`This run's own process is on its record: pid ${String(wrapperPid)}`)
  })

  it('by the discovery stamp alone: takes it over the same way', async () => {
    const sessionId = aSessionId()
    const transcript = aTranscript()
    const named = aSessionRecord('stamped by a waiter', {
      state: 'running',
      extra: { discovered: { tool: 'claude-code', externalId: sessionId, logPath: transcript } },
    })
    expect((t.api.getRecord(named)!.data as Record<string, unknown>)['providerSession']).toBeUndefined()

    const out = await runHook({ session_id: sessionId, transcript_path: transcript, cwd: scratch }, { behindClaude: true })

    expect(theNote(sessionId)).toBe(named)
    expect(sessionRecords().map((one) => one.id)).toEqual([named])
    expect(discoveredOn(named)['pid']).toBe(Number(/WRAPPER-PID (\d+)/.exec(out)?.[1] ?? 'NaN'))
    expect(out).toContain(`No new record was filed: record ${named} was still open`)
  })

  it('takes over the one open record when the note names a record that was deleted', async () => {
    const sessionId = aSessionId()
    const gone = aSessionRecord('the record the note named', { state: 'running' })
    t.api.deleteRecord(gone, { type: 'human', id: THE_PERSON })
    writeFileSync(join(NOTES, `session-${sessionId}.json`), JSON.stringify({ id: gone }), 'utf8')
    const named = aSessionRecord('filed again by register-myself', { state: 'running', providerSession: sessionId })

    await runHook({ session_id: sessionId, cwd: scratch })

    expect(theNote(sessionId)).toBe(named)
    expect(sessionRecords().map((one) => one.id)).toEqual([named])
  })
})

describe('no open record names the conversation', () => {
  it('files one, as before', async () => {
    const sessionId = aSessionId()
    aSessionRecord('another conversation', { state: 'running', providerSession: 'somebody-else' })

    const out = await runHook({ session_id: sessionId, cwd: scratch })

    const mine = sessionRecords().filter((one) => (one.data as Record<string, unknown>)['providerSession'] === sessionId)
    expect(mine).toHaveLength(1)
    expect(theNote(sessionId)).toBe(mine[0]!.id)
    expect(out).toContain(`This session is filed as record ${mine[0]!.id}. It has no real title yet.`)
    expect(out).not.toContain('No new record was filed')
    expect(out).not.toContain('may already name it')
  })

  it('does not take over a finished record that names it, and leaves that record alone', async () => {
    const sessionId = aSessionId()
    const finished = aSessionRecord('an ended run of this conversation', {
      state: 'finished',
      providerSession: sessionId,
      closedAt: '2026-09-23 09:05:38',
      closedHow: 'provider-event',
      closedBecause: 'The session ended and nothing in its transcript said why.',
    })
    const before = JSON.stringify(t.api.getRecord(finished)!.data)

    await runHook({ session_id: sessionId, cwd: scratch }, { behindClaude: true })

    const ids = sessionRecords().map((one) => one.id)
    expect(ids).toHaveLength(2)
    expect(theNote(sessionId)).not.toBe(finished)
    expect(ids).toContain(theNote(sessionId))
    expect(JSON.stringify(t.api.getRecord(finished)!.data), 'the finished record was written to').toBe(before)
  })
})

describe('more than one open record names the conversation', () => {
  it('files nothing, writes no note, and names both records', async () => {
    const sessionId = aSessionId()
    const first = aSessionRecord('one', { state: 'running', providerSession: sessionId })
    const second = aSessionRecord('two', {
      state: 'idle',
      extra: { discovered: { tool: 'claude-code', externalId: sessionId, logPath: aTranscript() } },
    })
    const before = [JSON.stringify(t.api.getRecord(first)!.data), JSON.stringify(t.api.getRecord(second)!.data)]

    const out = await runHook({ session_id: sessionId, transcript_path: aTranscript('mine.jsonl'), cwd: scratch }, { behindClaude: true })

    expect(theNote(sessionId), 'a note was written').toBeNull()
    expect(sessionRecords().map((one) => one.id).sort()).toEqual([first, second].sort())
    expect([JSON.stringify(t.api.getRecord(first)!.data), JSON.stringify(t.api.getRecord(second)!.data)]).toEqual(before)
    expect(out).toContain('This session is NOT on the record.')
    expect(out).toContain(`2 open session records already name this conversation (${sessionId}): `)
    expect(out).toContain(first)
    expect(out).toContain(second)
    expect(out).toContain('The hook does not choose between them, so it filed no record, took none over and wrote no note.')
    expect(out).toContain("This run's own process is on no record, because this session has no record.")
    expect(out).not.toContain('Mole Office refused it')
  })
})

describe('the list of session records could not be read', () => {
  it('files one as before, and says another record may already name the conversation', async () => {
    const sessionId = aSessionId()
    // A RECORD THAT DOES NAME THE CONVERSATION, so a hook that read "no answer" as "none" would be wrong
    // in a way this case can see: it would say nothing about it.
    const named = aSessionRecord('filed by register-myself', { state: 'running', providerSession: sessionId })
    const office = await anOfficeWhoseSessionListDoesNotAnswer()
    try {
      const out = await runHook({ session_id: sessionId, cwd: scratch }, { api: office.address })
      const note = theNote(sessionId)
      expect(note).not.toBeNull()
      expect(note).not.toBe(named)
      expect(out).toContain(`This session is filed as record ${String(note)}.`)
      expect(readTheHookDetails(out)).toContain(
        'Mole Office did not answer which session records already name this conversation, so another record may ' +
          'already name it.',
      )
      expect(office.listAsked(), 'the hook never asked for the list, so the case proves nothing').toBe(true)
    } finally {
      await office.close()
    }
  })
})

describe('the start-folder answer counts the record taken over as this session', () => {
  it('names the agent whose waiter holds its handle on that record, rather than saying it answers elsewhere', async () => {
    const sessionId = aSessionId()
    const folder = mkdtempSync(join(scratch, 'start-folder-'))
    const agent = t.api.createRecord({
      workspaceId: 'default',
      kind: 'agent',
      title: 'adopt-agent',
      data: { handle: 'adopt-agent', state: 'active', runtime: 'claude-code', startFolder: folder },
      actor: { type: 'human', id: THE_PERSON },
    }).id
    // THE RECORD A WAITER HOLDS THE HANDLE ON, naming this conversation, with a transcript that grew just
    // now so the office reads it as answering. The same shape the start-folder test builds.
    const transcript = join(scratch, 'answering.jsonl')
    writeFileSync(
      transcript,
      `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'the answer' }] } })}\n`,
    )
    const named = aSessionRecord('filed by register-myself for adopt-agent', {
      state: 'running',
      providerSession: sessionId,
      ranAs: [{ workspaceId: 'default', agentId: agent }],
      extra: { discovered: { tool: 'claude-code', externalId: sessionId, logPath: transcript } },
    })
    const held = await server.app.inject({
      method: 'POST',
      url: '/api/handles/adopt-agent/hold',
      headers: AS_THE_OWNER,
      payload: { session: named, machine: 'a-machine', runtime: 'claude-code' },
    })
    expect(held.statusCode, held.body.slice(0, 300)).toBe(201)
    const door = await server.app.inject({ method: 'GET', url: '/api/handles/adopt-agent', headers: AS_THE_OWNER })
    const answering = (door.json() as { answering: { how: string; session: string | null } }).answering
    expect(answering.how, 'the office does not read the record as answering, so the case proves nothing').toBe('a live session')
    expect(answering.session).toBe(named)

    const out = await runHook({ session_id: sessionId, transcript_path: transcript, cwd: folder }, { namesNoAgent: true })

    expect(theNote(sessionId)).toBe(named)
    expect(out).toContain('You are answering as the agent "adopt-agent" here.')
    expect(out).not.toContain('is already answering in the session filed as record')
    expect(out).toContain('YOU ARE ANSWERING AS "adopt-agent" IN THIS SESSION')
  })
})

/**
 * AN OFFICE THAT FORWARDS EVERY REQUEST TO THE REAL ONE, EXCEPT THE LIST OF SESSION RECORDS, which it
 * answers with a refusal. Everything else — the world header, the filing, every other read — is the
 * real server's own answer, so the case measures the one missing read.
 */
async function anOfficeWhoseSessionListDoesNotAnswer(): Promise<{
  address: string
  close: () => Promise<void>
  listAsked: () => boolean
}> {
  let asked = false
  const proxy = createServer((req, res) => {
    void (async () => {
      const path = req.url ?? '/'
      const body: Buffer[] = []
      for await (const chunk of req) body.push(chunk as Buffer)
      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string' && name !== 'host' && name !== 'content-length') headers[name] = value
      }
      const answer = await fetch(`${url}${path}`, {
        method: req.method ?? 'GET',
        headers,
        ...(body.length === 0 ? {} : { body: Buffer.concat(body) }),
      })
      let text = await answer.text()
      let status = answer.status
      if ((req.method ?? 'GET') === 'GET' && path.startsWith('/api/records?kind=session')) {
        asked = true
        text = JSON.stringify({ error: 'a test office that does not answer this read' })
        status = 503
      }
      for (const [name, value] of answer.headers) {
        if (name !== 'content-length' && name !== 'content-encoding' && name !== 'transfer-encoding') res.setHeader(name, value)
      }
      res.statusCode = status
      res.end(text)
    })().catch((err: unknown) => {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(err) }))
    })
  })
  await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', () => done()))
  return {
    address: `http://127.0.0.1:${String((proxy.address() as AddressInfo).port)}`,
    close: async () => await new Promise<void>((done) => proxy.close(() => done())),
    listAsked: () => asked,
  }
}
