// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SESSION THE HOOK FILED UNDER AN AGENT'S NAME IS HELD BY THAT AGENT'S OWN KEY, AND BY NO OTHER.
 *
 * At a session's start the session hook knows the session's agent by name, and often not the agent's key. It then files
 * the session with the office's key under the agent's name, and says `heldByItsFiler: true` in that filing
 * (for-agents/session-hook.mjs). The rule for a keyed session header (src/server/lib/the-run-a-key-holds.ts) reads it
 * from the session's first revision: the agent named there may then write to its session with its own key. Before
 * this, that write was refused, because nothing said the office filed the session for that agent.
 *
 * The field gives holding and nothing else. It is not `servingAgent`, so the session is not work handed in: the office
 * does not seal it when it ends and tells nobody. Only the office's own key writes it, as true, in the write that files
 * a session; every other write that would set, change or drop it is refused (src/server/lib/held-by-its-filer.ts).
 *
 * WHAT IS REAL. Two agents are registered at the real starter door. The hook is spawned as Claude Code spawns it, from
 * tools/session-hook.mjs, with a payload on stdin, against this file's own office on a free port, with a home folder
 * this test made. Its environment holds only what the case sets, so no agent and no key of the shell that runs this
 * test reaches it. Every write after that goes through the real doors with `app.inject`. No assertion prints a key.
 *
 * MUTATIONS, each alone, after a green control:
 *   1. The hook files without `heldByItsFiler`: "the agent the hook named writes to it with its own key" goes red, and
 *      so do the three cases after it on the same session, and both cases of "a hook newer than its office", where the
 *      first filing no longer carries the field.
 *   2. The create door's guard taken out (src/server/lib/records.ts): "nor set it when it files a session itself"
 *      goes red.
 *   3. The patch door's guard taken out (src/server/lib/records.ts): "may not drop the field from the session it
 *      holds" and "may not add the field to a session it does not hold" go red, and so does "stays an ordinary session
 *      when it ends", because the field was dropped the case before.
 *   4. The rule takes any first revision the office's key wrote under the agent's name, without reading the field
 *      (src/server/lib/the-run-a-key-holds.ts): "a session the office's key filed under its name without the field"
 *      goes red, and so does "an office whose session kind does not declare the field", whose session A's key then
 *      holds.
 *   5. The hook's second filing without the field taken out: "an office whose session kind does not declare the field"
 *      goes red.
 *   6. The hook files again without the field on any 400: "an office that refuses the filing for another reason" goes
 *      red.
 *
 * AN OFFICE OLDER THAN THE HOOK refuses the field as a key its session kind does not declare. The hook then files the
 * session once more without it, as before the field, and says so, so that a hook newer than its office does not lose
 * the session's record. It does that on that one refusal only. That office is this file's own, with the field taken out
 * of its session kind for the one run of the hook, behind a stand-in that forwards every request whole and writes down
 * each filing.
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(CHECKOUT, 'tools', 'session-hook.mjs')

/** The words every refusal of a keyed session header carries (src/server/lib/the-run-a-key-holds.ts). */
const THE_RULE = 'only when the key it carries holds that run'

/**
 * THE REFUSAL OF A WRITE THAT WOULD SET, CHANGE OR DROP THE FIELD, `ONLY_THE_OFFICES_KEY_FILES_A_SESSION_HELD_BY_ITS_FILER`
 * in src/server/lib/held-by-its-filer.ts, written out.
 */
const ONLY_THE_OFFICES_KEY =
  "heldByItsFiler is written only by the office's own key, as true, in the write that files a session under an agent's " +
  'name. No other write may set, change or drop it. Nothing was written.'

const A = 'held-agent-a'
const B = 'held-agent-b'

let t: TestDb
let app: FastifyInstance
let url: string
let officeKey = ''
let keyOfA = ''
let keyOfB = ''
const notesWritten: string[] = []
const foldersMade: string[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** An agent's own headers: its name, and its key and its run where it sends them. */
function asAgent(handle: string, key?: string, session?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(key === undefined ? {} : { 'x-mole-office-key': key }),
    ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
}

/** Whether a value is a key, as a yes or no, so a failing assertion never prints a key. */
function isAKey(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url: path, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** The words of a refusal. */
function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? body['message'] ?? JSON.stringify(body))
}

/** Register an agent at the starter door, as the person, and hand back the key it was answered. */
async function register(handle: string): Promise<string> {
  const made = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, runtime: 'claude-code', role: 'worker' })
  expect(made.status, said(made.body)).toBe(201)
  const key = String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(isAKey(key), `the registration of ${handle} answered no key`).toBe(true)
  return key
}

/** A record's stored data, read from the database. */
function theDataOf(recordId: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(recordId) as { data: string } | undefined
  expect(row, `no record ${recordId}`).toBeDefined()
  return JSON.parse(row!.data) as Record<string, unknown>
}

/** Who made the record's first write, and what proved it. */
function theFirstWriteOf(recordId: string): { actorId: string; provedBy: string | null } {
  return t.client.sqlite
    .prepare('SELECT actor_id AS actorId, proved_by AS provedBy FROM revisions WHERE record_id = ? AND seq = 1')
    .get(recordId) as { actorId: string; provedBy: string | null }
}

function messagesStored(): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
}

/**
 * Run the hook for one conversation, as Claude Code runs it at `mode`, naming `agent` or no agent, and hand back the
 * record its note names.
 *
 * ONLY WHAT THE CASE SETS reaches the hook: every MOLE_ and SANDBOX_ variable of this process is left out, so no key of
 * an agent reaches it, and the agent is the one the case names or none.
 */
async function runTheHook(mode: 'start' | 'end', sessionId: string, agent: string | null): Promise<string> {
  const ran = await theHookRunsAt(url, mode, sessionId, agent)
  expect(ran.id, 'the hook filed no record, so it wrote no note').not.toBeNull()
  return ran.id!
}

/**
 * Run the hook the same way against the office at `office`, and hand back what it printed and the record its note
 * names, or null when it wrote no note.
 */
async function theHookRunsAt(
  office: string,
  mode: 'start' | 'end',
  sessionId: string,
  agent: string | null,
): Promise<{ id: string | null; out: string }> {
  const home = mkdtempSync(join(tmpdir(), 'mole-office-held-by-its-filer-home-'))
  const startedIn = mkdtempSync(join(tmpdir(), 'mole-office-held-by-its-filer-start-'))
  foldersMade.push(home, startedIn)
  const env: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('MOLE_') && !name.startsWith('SANDBOX_')) env[name] = value
  }
  Object.assign(env, {
    HOME: home,
    MOLE_OFFICE_API: office,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(home, 'hook-details'),
    ...(agent === null ? {} : { MOLE_OFFICE_AGENT: agent }),
  })
  const note = join(CHECKOUT, '.logs', `session-${sessionId}.json`)
  if (!notesWritten.includes(note)) notesWritten.push(note)
  const out = await new Promise<string>((resolve, reject) => {
    const child = execFile('node', [HOOK, mode], { encoding: 'utf8', env, cwd: startedIn }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(
      JSON.stringify({ session_id: sessionId, cwd: startedIn, hook_event_name: mode === 'start' ? 'SessionStart' : 'SessionEnd' }),
    )
  })
  if (!existsSync(note)) return { id: null, out }
  const id = String((JSON.parse(readFileSync(note, 'utf8')) as { id?: unknown }).id ?? '')
  expect(id, 'the note names no record').not.toBe('')
  return { id, out }
}

/** One session filing the hook sent, and what the office answered it. */
interface AFiling {
  data: Record<string, unknown>
  status: number
  said: string
}

/**
 * A STAND-IN IN FRONT OF THIS FILE'S OWN OFFICE. It forwards every request and every answer whole, and writes down the
 * data of each session the hook files and what the office answered. `alter`, when given, changes the data of each
 * session filing after it is written down and before it is forwarded.
 */
async function anOfficeThatCountsFilings(
  alter?: (data: Record<string, unknown>) => void,
): Promise<{ address: string; filings: AFiling[]; close: () => Promise<void> }> {
  const filings: AFiling[] = []
  const server = createServer((req, res) => {
    void (async () => {
      const asked = req.url ?? '/'
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      let body = chunks.length === 0 ? undefined : Buffer.concat(chunks).toString('utf8')
      let filing: AFiling | null = null
      if (req.method === 'POST' && asked.split('?')[0] === '/api/records' && body !== undefined) {
        const sent = JSON.parse(body) as { kind?: unknown; data?: Record<string, unknown> }
        if (sent.kind === 'session') {
          filing = { data: structuredClone(sent.data ?? {}), status: 0, said: '' }
          filings.push(filing)
          if (alter !== undefined) {
            sent.data = sent.data ?? {}
            alter(sent.data)
            body = JSON.stringify(sent)
          }
        }
      }
      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string' && name !== 'host' && name !== 'content-length') headers[name] = value
      }
      const answer = await fetch(`${url}${asked}`, { method: req.method ?? 'GET', headers, ...(body === undefined ? {} : { body }) })
      const text = await answer.text()
      if (filing !== null) {
        filing.status = answer.status
        filing.said = answer.status < 400 ? '' : said(JSON.parse(text) as Record<string, unknown>)
      }
      for (const [name, value] of answer.headers) {
        if (name !== 'content-length' && name !== 'content-encoding' && name !== 'transfer-encoding') res.setHeader(name, value)
      }
      res.statusCode = answer.status
      res.end(text)
    })().catch((err: unknown) => {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(err) }))
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()))
  const port = (server.address() as AddressInfo).port
  return {
    address: `http://127.0.0.1:${String(port)}`,
    filings,
    close: async () => await new Promise<void>((done) => server.close(() => done())),
  }
}

/** The line the hook prints when the office refused the field and the session was filed again without it. */
const NOT_HELD_LINE =
  "This office does not take heldByItsFiler yet, so the session is filed as before, and the agent's own key does not hold it."

const aConversation = (what: string): string => `held-${what}-${String(Date.now())}-${String(Math.random()).slice(2)}`

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ port: 0, host: '127.0.0.1' })
  url = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  officeKey = (JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8')) as { office: string }).office
  keyOfA = await register(A)
  keyOfB = await register(B)
}, 120_000)

afterAll(async () => {
  for (const note of notesWritten.splice(0)) rmSync(note, { force: true })
  for (const folder of foldersMade.splice(0)) rmSync(folder, { recursive: true, force: true })
  await app?.close()
  t?.close()
})

describe('a session the hook filed under an agent’s name, with no key of the agent’s', () => {
  const conversation = aConversation('named')
  let run = ''

  it('the agent the hook named writes to it with its own key', async () => {
    run = await runTheHook('start', conversation, A)
    expect(theFirstWriteOf(run), 'the hook did not file it with the office’s key under the agent’s name').toEqual({
      actorId: A,
      provedBy: 'the-office-key',
    })
    const wrote = await ask('PATCH', `/api/records/${run}`, asAgent(A, keyOfA, run), {
      title: 'Agent A says what this session is',
      dataPatch: { doing: 'Agent A is writing to the session the hook filed for it.' },
    })
    expect(wrote.status, said(wrote.body)).toBe(200)
    const record = t.client.sqlite.prepare('SELECT title FROM records WHERE id = ?').get(run) as { title: string }
    expect(record.title).toBe('Agent A says what this session is')
    expect(theDataOf(run)['doing']).toBe('Agent A is writing to the session the hook filed for it.')
  }, 60_000)

  it('another agent’s own key is refused there, in the rule’s words', async () => {
    const wrote = await ask('PATCH', `/api/records/${run}`, asAgent(B, keyOfB, run), {
      title: 'Agent B takes this session',
      dataPatch: { doing: 'Agent B is writing to a session it does not hold.' },
    })
    expect(wrote.status, said(wrote.body)).toBe(403)
    expect(said(wrote.body)).toContain(THE_RULE)
    expect(said(wrote.body)).toContain(`"${run}"`)
    expect(said(wrote.body)).toContain(`that run does not serve "${B}"`)
    expect(theDataOf(run)['doing']).toBe('Agent A is writing to the session the hook filed for it.')
  })

  it('the agent’s own key may not drop the field from the session it holds', async () => {
    const wrote = await ask('PATCH', `/api/records/${run}`, asAgent(A, keyOfA, run), { dataPatch: { heldByItsFiler: false } })
    expect(wrote.status, said(wrote.body)).toBe(403)
    expect(said(wrote.body)).toContain(ONLY_THE_OFFICES_KEY)
    expect(theDataOf(run)['heldByItsFiler']).toBe(true)
  })

  it('stays an ordinary session when it ends: not sealed, and nobody is told', async () => {
    const before = messagesStored()
    const ended = await runTheHook('end', conversation, A)
    expect(ended).toBe(run)
    const data = theDataOf(run)
    expect(data['state']).toBe('finished')
    expect(data['heldByItsFiler']).toBe(true)
    for (const field of ['servingAgent', 'servingAgentId', 'ranAs', 'submission', 'sealedTip', 'atTheSeal']) {
      expect(data[field], `the ended session carries ${field}`).toBeUndefined()
    }
    expect(messagesStored(), 'a message was stored when the session ended').toBe(before)
  }, 60_000)
})

describe('a session no agent holds by its filing', () => {
  let forNobody = ''

  it('the hook with no agent named files a session no agent’s key holds, as before', async () => {
    forNobody = await runTheHook('start', aConversation('nobody'), null)
    expect(theDataOf(forNobody)['heldByItsFiler']).toBeUndefined()
    const wrote = await ask('PATCH', `/api/records/${forNobody}`, asAgent(A, keyOfA, forNobody), { dataPatch: { doing: 'Agent A is writing.' } })
    expect(wrote.status, said(wrote.body)).toBe(403)
    expect(said(wrote.body)).toContain(THE_RULE)
    expect(said(wrote.body)).toContain(`"${forNobody}"`)
  }, 60_000)

  it('a session the office’s key filed under its name without the field is not the agent’s', async () => {
    const filed = await ask('POST', '/api/records', asAgent(A, officeKey), {
      kind: 'session',
      title: 'Filed for agent A by the office, without the field',
      data: { state: 'running', runtime: 'claude-code' },
    })
    expect(filed.status, said(filed.body)).toBe(201)
    const id = String((filed.body['record'] as { id?: string } | undefined)?.id ?? '')
    expect(theFirstWriteOf(id)).toEqual({ actorId: A, provedBy: 'the-office-key' })
    const wrote = await ask('PATCH', `/api/records/${id}`, asAgent(A, keyOfA, id), { dataPatch: { doing: 'Agent A is writing.' } })
    expect(wrote.status, said(wrote.body)).toBe(403)
    expect(said(wrote.body)).toContain(THE_RULE)
    expect(said(wrote.body)).toContain(`"${id}"`)
  })

  it('an agent’s own key may not add the field to a session it does not hold', async () => {
    const wrote = await ask('PATCH', `/api/records/${forNobody}`, asAgent(A, keyOfA), { dataPatch: { heldByItsFiler: true } })
    expect(wrote.status, said(wrote.body)).toBe(403)
    expect(said(wrote.body)).toContain(ONLY_THE_OFFICES_KEY)
    expect(theDataOf(forNobody)['heldByItsFiler']).toBeUndefined()
  })

  it('nor set it when it files a session itself', async () => {
    const title = 'Agent A files a session that says the office filed it'
    const filed = await ask('POST', '/api/records', asAgent(A, keyOfA), {
      kind: 'session',
      title,
      data: { state: 'running', runtime: 'claude-code', heldByItsFiler: true },
    })
    expect(filed.status, said(filed.body)).toBe(403)
    expect(said(filed.body)).toContain(ONLY_THE_OFFICES_KEY)
    expect(t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session' AND title = ?").get(title)).toEqual({ n: 0 })
  })
})

describe('a hook newer than its office', () => {
  it('an office whose session kind does not declare the field gets two filings, the second without it, and the hook says so', async () => {
    // THE OFFICE'S SESSION KIND WITHOUT THE FIELD, as an office from before it: the same module the server reads.
    const { KIND_SPECS } = await import('../src/shared/kinds.ts')
    const fields = KIND_SPECS.session.fields
    const at = fields.findIndex((field) => field.key === 'heldByItsFiler')
    expect(at, 'the session kind does not declare the field, so taking it out proves nothing').toBeGreaterThanOrEqual(0)
    const office = await anOfficeThatCountsFilings()
    const [taken] = fields.splice(at, 1)
    let ran: { id: string | null; out: string }
    try {
      ran = await theHookRunsAt(office.address, 'start', aConversation('older'), A)
    } finally {
      fields.splice(at, 0, taken!)
      await office.close()
    }
    expect(office.filings.map((filing) => filing.data['heldByItsFiler'])).toEqual([true, undefined])
    expect(office.filings[0]!.status).toBe(400)
    expect(office.filings[0]!.said).toContain('unknown key "heldByItsFiler" — ')
    expect(office.filings[1]!.status, office.filings[1]!.said).toBe(201)
    expect(ran.out).toContain(NOT_HELD_LINE)
    expect(ran.id, 'the hook filed no record, so it wrote no note').not.toBeNull()
    expect(theDataOf(ran.id!)['heldByItsFiler']).toBeUndefined()
    const wrote = await ask('PATCH', `/api/records/${ran.id!}`, asAgent(A, keyOfA, ran.id!), { dataPatch: { doing: 'Agent A is writing.' } })
    expect(wrote.status, said(wrote.body)).toBe(403)
    expect(said(wrote.body)).toContain(THE_RULE)
  }, 60_000)

  it('an office that refuses the filing for another reason is not asked again without the field', async () => {
    // ANOTHER REFUSAL IN THE SAME WORDS FOR ANOTHER KEY, from the real office: the closest a refusal comes to the one the
    // hook files again on, without being it.
    const office = await anOfficeThatCountsFilings((data) => {
      data['notAFieldOfASession'] = true
    })
    let ran: { id: string | null; out: string }
    try {
      ran = await theHookRunsAt(office.address, 'start', aConversation('refused'), A)
    } finally {
      await office.close()
    }
    expect(office.filings.length, 'the hook filed nothing').toBeGreaterThan(0)
    for (const filing of office.filings) {
      expect(filing.status).toBe(400)
      expect(filing.said).toContain('unknown key "notAFieldOfASession" — ')
    }
    expect(office.filings.map((filing) => filing.data['heldByItsFiler'])).toEqual(office.filings.map(() => true))
    expect(ran.out).not.toContain(NOT_HELD_LINE)
    expect(ran.id).toBeNull()
  }, 60_000)
})
