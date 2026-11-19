// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEALED RUN'S KEY STILL WRITES THAT RUN'S SERVED CONDITIONS, AND NOTHING ELSE. Decision oVlDVG_F8RsG of 27 September
 * 2026 (the secretary's, on an answer to problem VJom2joVhqjM).
 *
 * A run's key is revoked in the write that ends it. One write comes after the end in the normal order: the launcher's
 * record of the conditions the run was served, written when its command ends, which for a run that seals itself is after
 * its seal. Wave 13n's round 14 met it at 12:24 that day: "the model that answered could not be recorded (403 ...)". A
 * round started from the host holds no other key in its container, by design, so its own key is the only one there is.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. While the run lives, its key writes its served conditions. The control.
 *   2. After the run has ended, with the key window closed as it is in the office, the same key still writes that run's
 *      served conditions, and the change is the run's own agent's.
 *   3. It writes nothing else: another field of the same run, served with another field beside it, a record of its own,
 *      and another run's served conditions are each refused, and nothing is written.
 *   4. The key sent alone, with no header naming who asks, is held the same way: it writes that run's served conditions
 *      and is refused every other field of the run, another record, and a POST, and nothing is written.
 *
 * Every write here goes over the office's listener, as the launcher's does, so the closed window is the one it meets.
 * The run is filed the way the office's own worker files one, and the office mints its key; the keys are made up.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the revoked run key's one proof taken out of howThisRequestProvedItself (lib/keys.ts): case 2 goes red;
 *   - the body's half taken out of patchRecord (lib/records.ts): case 3 goes red on the other field of the same run;
 *   - `sealedRunsOwnKey` left off the actor on actorFrom's key-alone branch (lib/http.ts): case 4 goes red.
 */

import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

/** Made-up keys, written before the server is built, so the office's own worker proves itself with the office's key. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

const HANDLE = 'a-sealing-round'
const SERVED = { model: 'a-model-for-this-test', temperature: 0, briefBytes: 420, contextTokens: { largestTurn: 1200, total: 5400 } }

let t: TestDb
let app: FastifyInstance
let api = ''
let agentId = ''
let run = ''
let another = ''
let key = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The office's own worker: an agent actor that proved itself with the office's key. */
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

/** As the launcher asks about a run: the run's agent, the run as its session, and the run's own key. */
const asTheRun = (session: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
  'x-mole-office-session': session,
  'x-mole-office-key': key,
})

/** The run's key and nothing else that names who asks, which `actorFrom` answers on its own branch. */
const theKeyAlone = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-key': key,
})

/** Over the listener, as the launcher sends it. */
async function send(method: 'POST' | 'PATCH', path: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; text: string }> {
  const reply = await fetch(`${api}${path}`, { method, headers, body: JSON.stringify(body) })
  return { status: reply.status, text: await reply.text() }
}

async function fileARun(title: string): Promise<{ id: string; key: string }> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: { kind: 'session', title, data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: agentId, doing: 'a round that seals itself' } },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: { id: string }; runKey?: { key?: string } }
  return { id: body.record.id, key: String(body.runKey?.key) }
}

function theServedOf(id: string): unknown {
  const row = t.client.sqlite.prepare("SELECT json_extract(data, '$.served') AS served FROM records WHERE id = ?").get(id) as { served: string | null }
  return row.served === null ? null : JSON.parse(row.served)
}

function whoWroteServed(id: string): { actor_type: string; actor_id: string; proved_by: string | null }[] {
  // THE CHANGE LOG NAMES A FIELD BY ITS PATH, data.served.<key>, as tests/a-run-says-what-its-runtime-served-it.test.ts reads
  // it, and keeps the name the headers gave, with how a key proved it beside it.
  return t.client.sqlite
    .prepare("SELECT actor_type, actor_id, proved_by FROM changes WHERE record_id = ? AND field LIKE 'data.served%' ORDER BY at, rowid")
    .all(id) as never
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: HANDLE, name: HANDLE, role: 'supervisor', runtime: 'claude-code' } })
  expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents?: { id: string; handle: string }[] }
  agentId = one((listed.agents ?? []).filter((a) => a.handle === HANDLE), `the registry row for ${HANDLE}`).id
  const first = await fileARun('a round that seals itself')
  run = first.id
  key = first.key
  expect(key, 'the office minted the run no key, so this file would prove nothing').toMatch(/^[0-9a-f]{64}$/)
  another = (await fileARun('another round')).id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe("a run's key after the run has ended", () => {
  it('1: writes its served conditions while the run lives', async () => {
    const wrote = await send('PATCH', `/api/records/${run}`, asTheRun(run), { dataPatch: { served: SERVED } })
    expect(wrote.status, wrote.text.slice(0, 300)).toBe(200)
    expect(theServedOf(run)).toEqual(SERVED)
  })

  it("2: still writes that run's served conditions once the run has ended, with the key window closed", async () => {
    // THE RUN ENDS, and its key is revoked in the same write.
    const ended = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: AS_THE_OFFICE_WORKER, payload: { dataPatch: { state: 'crashed' } } })
    expect(ended.statusCode, ended.body.slice(0, 300)).toBe(200)
    // AND THE WINDOW IS CLOSED, as the person's press closed it in the office on 27 September 2026.
    t.client.sqlite
      .prepare("UPDATE installation SET window_closed_at = '2026-09-27 11:11:39', window_closed_by_kind = 'person', window_closed_by_id = ? WHERE only_row = 1")
      .run(THE_PERSON)
    ;(await import('../src/server/lib/keywindow.ts')).forgetTheKeyWindowThisProcessRead()

    const later = { ...SERVED, contextTokens: { largestTurn: 1300, total: 9100 } }
    const wrote = await send('PATCH', `/api/records/${run}`, asTheRun(run), { dataPatch: { served: later } })
    expect(wrote.status, wrote.text.slice(0, 300)).toBe(200)
    expect(theServedOf(run)).toEqual(later)
    // THE RUN'S OWN AGENT, PROVED BY A KEY: the dead key proved it for this one write, and nothing else could have after the close.
    expect(whoWroteServed(run).at(-1), 'the last served write is not the run agent own, proved by its key').toEqual({ actor_type: 'agent', actor_id: HANDLE, proved_by: 'an-agent-key' })
  })

  it('3: writes nothing else with that key, and nothing is written', async () => {
    const before = JSON.stringify(theServedOf(run))
    for (const [what, method, path, body] of [
      ['another field of the same run', 'PATCH', `/api/records/${run}`, { dataPatch: { doing: 'one more thing after the end' } }],
      ['served with another field beside it', 'PATCH', `/api/records/${run}`, { dataPatch: { served: SERVED, doing: 'and this' } }],
      ['a record of its own', 'POST', '/api/records', { kind: 'note', title: 'After the end', data: { body: 'written with a dead key' } }],
      ["another run's served conditions", 'PATCH', `/api/records/${another}`, { dataPatch: { served: SERVED } }],
    ] as const) {
      const refused = await send(method, path, asTheRun(run), body)
      expect(refused.status, `${what}: ${refused.text.slice(0, 200)}`).toBe(403)
    }
    expect(JSON.stringify(theServedOf(run))).toBe(before)
    expect(theServedOf(another)).toBeNull()
    const doing = t.client.sqlite.prepare("SELECT json_extract(data, '$.doing') AS doing FROM records WHERE id = ?").get(run) as { doing: string }
    expect(doing.doing).toBe('a round that seals itself')
  })

  it('4: holds the key sent alone to the same one write', async () => {
    // THE RUN ENDED IN CASE 2, and the window is closed.
    const alone = { ...SERVED, contextTokens: { largestTurn: 1400, total: 9900 } }
    const wrote = await send('PATCH', `/api/records/${run}`, theKeyAlone(), { dataPatch: { served: alone } })
    expect(wrote.status, wrote.text.slice(0, 300)).toBe(200)
    expect(theServedOf(run)).toEqual(alone)
    const titleBefore = (t.client.sqlite.prepare('SELECT title FROM records WHERE id = ?').get(run) as { title: string }).title
    for (const [what, method, path, body] of [
      ['another field of the same run', 'PATCH', `/api/records/${run}`, { dataPatch: { doing: 'one more thing after the end' } }],
      ['its state', 'PATCH', `/api/records/${run}`, { dataPatch: { state: 'running' } }],
      ['its title', 'PATCH', `/api/records/${run}`, { title: 'a new title' }],
      ['its summary', 'PATCH', `/api/records/${run}`, { summary: 'a new summary' }],
      ['served with another field beside it', 'PATCH', `/api/records/${run}`, { dataPatch: { served: SERVED, doing: 'and this' } }],
      ["another run's served conditions", 'PATCH', `/api/records/${another}`, { dataPatch: { served: SERVED } }],
      ['a record of its own', 'POST', '/api/records', { kind: 'note', title: 'After the end', data: { body: 'written with a dead key' } }],
    ] as const) {
      const refused = await send(method, path, theKeyAlone(), body)
      expect(refused.status, `${what}: ${refused.text.slice(0, 200)}`).toBe(403)
    }
    expect(theServedOf(run)).toEqual(alone)
    expect(theServedOf(another)).toBeNull()
    const after = t.client.sqlite.prepare("SELECT title, summary, json_extract(data, '$.doing') AS doing, json_extract(data, '$.state') AS state FROM records WHERE id = ?").get(run) as { title: string; summary: string | null; doing: string; state: string }
    expect(after).toEqual({ title: titleBefore, summary: null, doing: 'a round that seals itself', state: 'crashed' })
  })
})
