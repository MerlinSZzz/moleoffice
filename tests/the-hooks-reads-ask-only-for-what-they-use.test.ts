// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION HOOK ASKS ONLY FOR WHAT IT USES (wave 14c, AT-6).
 *
 * The live office answers about 460 KB to the hook's records search and about 840 KB to its handles
 * read, 112 and 57 times an hour. This file grows one conversation record to 400 KB and 31 fresh
 * holds, then runs the real hook against a proxy that records the address it asks for. It proves:
 *
 *   1. `GET /api/records?...&shape=hook` answers under 100 KB with a 400 KB record in the office,
 *      and keeps only the fields the hook reads, including the provenance mark every listed row
 *      carries;
 *   2. `GET /api/handles?session=…&state=fresh,kept&shape=hold` answers only the named session's
 *      hold and only the three fields the hook reads, while the unfiltered door still answers all
 *      31 holds;
 *   3. the hook's start search asks `shape=hook`, not `shape=full`, and its handles read names the
 *      candidate record instead of reading every hold;
 *   4. the hook's stop run-count read asks `state=fresh` for the running record ids;
 *   5. the hook still adopts the record that names its conversation and still names the agent
 *      holding it.
 *
 * CONTROL RED is the tree before the change: `shape=hook` and the handles words are 400s, and the
 * old hook asks `shape=full` and a bare `/api/handles`. MUTATION: `shape=hook` keeps `data.detail`
 * (case 1 goes over 100 KB) and the handles filter ignores `session` (31 holds come back).
 */

import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { A_TEST_THAT_STARTS_SOMETHING } from './how-long-a-test-may-take.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(CHECKOUT, 'tools', 'session-hook.mjs')
const NOTES = join(CHECKOUT, '.logs')
const CONVERSATION = `w14c-hook-${Math.random().toString(36).slice(2)}-${String(Date.now())}`
const HOLDER = 'w14c-hook-holder'
const OTHER_HOLDS = 30
const AS_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let office: TestDb
let app: FastifyInstance
let url: string
let proxy: Server
let proxyUrl: string
let scratch: string
let candidate = ''
let otherSessions: string[] = []
const reads: { method: string; path: string }[] = []
const notesWritten: string[] = []

beforeAll(async () => {
  office = await freshDb()
  ;({ app } = await apiApp())
  await app.listen({ port: 0, host: '127.0.0.1' })
  url = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-hook-reads-'))

  // ONE RECORD AT THE LIVE SIZE, naming the conversation both ways the hook checks.
  candidate = office.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'A made-up run at the live size',
    data: {
      state: 'running',
      providerSession: CONVERSATION,
      detail: 'd'.repeat(400 * 1024),
      extra: { discovered: { externalId: CONVERSATION, pid: 424242, pidStartedAt: '2026-11-16 12:00:00' } },
    },
    actor: { type: 'human', id: THE_PERSON },
  }).id

  // 31 fresh holds, each on its own session, made through the doors. The first names the agent the
  // hook must still find; the other 30 are what the whole door used to send every start.
  const holding = await makeAgent(HOLDER)
  await holdTheHandle(HOLDER, holding, candidate)
  for (let i = 0; i < OTHER_HOLDS; i += 1) {
    const handle = `w14c-hook-other-${String(i + 1).padStart(2, '0')}`
    const session = office.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: `A made-up run ${String(i + 1)}`,
      data: { state: 'running' },
      actor: { type: 'human', id: THE_PERSON },
    }).id
    otherSessions.push(session)
    const key = await makeAgent(handle)
    await holdTheHandle(handle, key, session)
  }

  // A proxy the hook talks to, recording every address it asks for and forwarding the answer.
  proxy = createServer((req, res) => {
    void (async () => {
      const asked = req.url ?? '/'
      reads.push({ method: req.method ?? 'GET', path: asked })
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const body = chunks.length === 0 ? undefined : Buffer.concat(chunks)
      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string' && name !== 'host' && name !== 'content-length' && name !== 'connection') headers[name] = value
      }
      const answer = await fetch(`${url}${asked}`, {
        method: req.method ?? 'GET',
        headers,
        ...(body === undefined ? {} : { body }),
      })
      const bytes = Buffer.from(await answer.arrayBuffer())
      // FORWARD THE OFFICE'S OWN HEADERS, not only the body. The hook decides which world answered
      // from the world header on the health reply; a proxy that drops it makes every office look
      // like a stranger, and the hook rightly stops before it reads a record.
      const forwarded: Record<string, string> = {}
      for (const [name, value] of answer.headers) {
        if (name === 'content-length' || name === 'content-encoding' || name === 'connection' || name === 'transfer-encoding') continue
        forwarded[name] = value
      }
      res.writeHead(answer.status, { ...forwarded, 'content-length': String(bytes.length) })
      res.end(bytes)
    })().catch((error: unknown) => {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end(error instanceof Error ? error.message : String(error))
    })
  })
  await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', done))
  proxyUrl = `http://127.0.0.1:${String((proxy.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  proxy.closeAllConnections()
  await new Promise<void>((done) => proxy.close(() => done()))
  await app.close()
  office.close()
  rmSync(scratch, { recursive: true, force: true })
  for (const name of notesWritten.splice(0)) rmSync(join(NOTES, name), { force: true })
}, 60_000)

async function makeAgent(handle: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...AS_OWNER, 'content-type': 'application/json' },
    payload: { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const key = (reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key
  expect(typeof key).toBe('string')
  return String(key)
}

async function holdTheHandle(handle: string, key: string, session: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${encodeURIComponent(handle)}/hold`,
    headers: {
      ...AS_OWNER,
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': handle,
      'x-mole-office-key': key,
    },
    payload: { session, machine: 'w14c-made-up-machine', runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function read(path: string): Promise<{ status: number; bytes: number; body: any }> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_OWNER })
  return {
    status: reply.statusCode,
    bytes: Buffer.byteLength(reply.body),
    body: reply.json(),
  }
}

/** Run the real hook through the proxy, with no agent named so the handle path is read. */
async function runHook(mode: 'start' | 'stop', sessionId: string): Promise<string> {
  const home = mkdtempSync(join(scratch, 'home-'))
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    MOLE_OFFICE_API: proxyUrl,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: office.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
  }
  delete env['MOLE_OFFICE_AGENT']
  delete env['TMUX_PANE']
  const transcript = join(scratch, `transcript-${mode}-${String(Math.random())}.jsonl`)
  writeFileSync(transcript, '{"type":"user"}\n', 'utf8')
  notesWritten.push(`session-${sessionId}.json`)
  return await new Promise<string>((resolve, reject) => {
    const child = execFile(process.execPath, [HOOK, mode], { encoding: 'utf8', env, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error !== null) reject(error)
        else resolve(stdout)
      })
    child.stdin?.end(JSON.stringify({ session_id: sessionId, transcript_path: transcript }))
  })
}

const handleReads = (list: readonly { method: string; path: string }[]) =>
  list.filter((one) => one.method === 'GET' && one.path.startsWith('/api/handles?'))

describe('the hook asks only for what it uses', () => {
  it('answers the records search under 100 KB with only the fields the hook reads', async () => {
    const reply = await read(`/api/records?kind=session&projects=all&q=${encodeURIComponent(CONVERSATION)}&shape=hook`)
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    expect(reply.bytes).toBeLessThan(100 * 1024)
    const rows = reply.body.records as Record<string, any>[]
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(Object.keys(row).sort()).toEqual(['data', 'deletedAt', 'id', 'kind', 'origin', 'title', 'workspaceId'])
    expect(row.origin).toBe('authored')
    expect(row.data.state).toBe('running')
    expect(row.data.providerSession).toBe(CONVERSATION)
    expect(row.data.detail).toBeUndefined()
    expect(Object.keys(row.data.extra.discovered).sort()).toEqual(['externalId', 'pid', 'pidStartedAt'])
  }, A_TEST_THAT_STARTS_SOMETHING)

  it('answers only the named holds, and only the three fields the hook reads', async () => {
    const every = await read('/api/handles')
    expect(every.status).toBe(200)
    expect(every.body.holds).toHaveLength(OTHER_HOLDS + 1)

    const one = await read(`/api/handles?session=${encodeURIComponent(candidate)}&state=fresh,kept&shape=hold`)
    expect(one.status, JSON.stringify(one.body)).toBe(200)
    expect(one.body.holds).toHaveLength(1)
    expect(Object.keys(one.body.holds[0]).sort()).toEqual(['handle', 'session', 'state'])
    expect(one.body.holds[0]).toMatchObject({ session: candidate, handle: HOLDER, state: 'fresh' })
    expect(one.bytes).toBeLessThan(every.bytes)

    const two = await read(`/api/handles?session=${encodeURIComponent([candidate, otherSessions[0]!].join(','))}&state=fresh&shape=hold`)
    expect(two.body.holds).toHaveLength(2)

    const released = await read(`/api/handles?session=${encodeURIComponent(candidate)}&state=released&shape=hold`)
    expect(released.body.holds).toHaveLength(0)

    const bad = await read('/api/handles?state=not-a-state')
    expect(bad.status).toBe(400)
    expect(JSON.stringify(bad.body)).toContain('not-a-state')
  }, A_TEST_THAT_STARTS_SOMETHING)

  it('asks the door for the hook’s own reads, and still adopts the record and names its holder', async () => {
    reads.length = 0
    const out = await runHook('start', CONVERSATION)
    const start = [...reads]

    const search = start.find((one) =>
      one.path.startsWith('/api/records?') &&
      new URL(one.path, 'http://office.test').searchParams.get('shape') === 'hook' &&
      one.path.includes(encodeURIComponent(CONVERSATION)))
    expect(search, start.map((one) => one.path).join('\n')).toBeDefined()
    expect(start.some((one) => one.path.startsWith('/api/records?') &&
      new URL(one.path, 'http://office.test').searchParams.get('shape') === 'full')).toBe(false)

    expect(start.some((one) => one.path === '/api/handles')).toBe(false)
    const narrow = handleReads(start).find((one) =>
      new URL(one.path, 'http://office.test').searchParams.get('shape') === 'hold')
    expect(narrow, start.map((one) => one.path).join('\n')).toBeDefined()
    const at = new URL(narrow!.path, 'http://office.test')
    expect(at.searchParams.get('state')).toBe('fresh,kept')
    expect(at.searchParams.get('session')).toContain(candidate)

    expect(out).toContain(HOLDER)
    const records = office.api.listRecords({ workspaceId: 'default', kind: 'session' })
    expect(records.filter((one) => one.data['providerSession'] === CONVERSATION)).toHaveLength(1)

    const runningRows = await read('/api/sessions?only=running')
    expect(runningRows.body.sessions.map((one: { recordId: string }) => one.recordId)).toContain(candidate)

    reads.length = 0
    await runHook('stop', CONVERSATION)
    const stop = [...reads]
    expect(stop.some((one) => one.path === '/api/handles')).toBe(false)
    const running = handleReads(stop).find((one) =>
      (new URL(one.path, 'http://office.test').searchParams.get('state') ?? '').split(',').includes('fresh'))
    expect(running, stop.map((one) => one.path).join('\n')).toBeDefined()
    expect(new URL(running!.path, 'http://office.test').searchParams.get('session')).toContain(candidate)
  }, A_TEST_THAT_STARTS_SOMETHING)
})
