// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WRITE NAMES THE RUN THAT MADE IT, OR IS TOLD IT DOES NOT.
 *
 * Two problems about the change log's session column, the one place that names the run behind a
 * change (criterion T2 by method C, src/server/lib/spent-on-this.ts).
 *
 *   1. Problem VD2wduT5I5mN. Two supervisors sent their AGENT record's id as
 *      x-mole-office-session, and every change they wrote stored an id that names no run. The
 *      header is now refused when it holds the id of a record that is not a session, with a
 *      sentence that says what to send, and nothing is written. A session record's id still passes.
 *      A run name nobody has filed yet passes on a request with no key, and is refused on one with a
 *      key (problem TwH5ICyRxLVd): a key holds only a run that is filed, and
 *      tests/a-session-header-is-bound-to-its-key.test.ts holds the rest of that rule. The session
 *      hook files its run with no session header, so it is not touched by the rule.
 *
 *   2. Problem J1oPHDg-jWeY. A write sent with an agent's actor headers and no session header
 *      stores change rows that name no run, and nothing told the writer. It is still answered and
 *      stored as before; its answer now carries x-mole-office-names-no-run with the sentence. A
 *      person's write, a write that named a run, a read, a refused write and a write the office's
 *      own key proved carry no such header.
 *
 * In process through `app.inject`, because both rules are about the headers a request carries and
 * neither reads which machine sent it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let notice: { header: string; sentence: string }

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const lib = await import('../src/server/lib/a-write-that-names-no-run.ts')
  notice = { header: lib.NAMES_NO_RUN_HEADER, sentence: lib.NAMES_NO_RUN_NOTICE }
  // BUILDING THE WHOLE SERVER takes longer than vitest's ten seconds on a loaded machine.
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const asAgent = (session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

async function file(headers: Record<string, string>, kind: string, title: string) {
  return app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: {} } })
}

function recordsTitled(title: string): number {
  return (t.client.sqlite.prepare('SELECT count(*) AS n FROM records WHERE title = ?').get(title) as { n: number }).n
}

function sessionOfTheCreateRow(recordId: string): string | null {
  const row = t.client.sqlite
    .prepare("SELECT session_id AS s FROM changes WHERE record_id = ? AND op = 'create'")
    .get(recordId) as { s: string | null } | undefined
  if (row === undefined) throw new Error(`no create row for ${recordId}`)
  return row.s
}

describe('a session header holding the id of a record that is not a run (VD2wduT5I5mN)', () => {
  it('is refused with a sentence naming what to send, and writes nothing', async () => {
    const agent = await file(AS_THE_PERSON, 'agent', 'Supervisor SD — Cluster D')
    expect(agent.statusCode, agent.body).toBe(201)
    const agentId = (agent.json() as { record: { id: string } }).record.id

    const refused = await file(asAgent(agentId), 'task', 'written under an agent id')
    expect(refused.statusCode, refused.body).toBe(400)
    const said = refused.body
    expect(said).toContain(`x-mole-office-session is \\"${agentId}\\"`)
    expect(said).toContain("the id of a record that is not a run's session record")
    expect(said).toContain("Send the id of your run's own session record")
    expect(recordsTitled('written under an agent id')).toBe(0)
    expect(refused.headers[notice.header]).toBeUndefined()
  })

  // ONLY A WRITE IS REFUSED. The harm is a change row storing an id that names no run, and a read
  // stores no change row, so the same header on a read is answered.
  it('answers a read that carries the same header', async () => {
    const agent = await file(AS_THE_PERSON, 'agent', 'Supervisor SC — Cluster C')
    expect(agent.statusCode, agent.body).toBe(201)
    const agentId = (agent.json() as { record: { id: string } }).record.id

    const read = await app.inject({ method: 'GET', url: `/api/records/${agentId}`, headers: asAgent(agentId) })
    expect(read.statusCode, read.body).toBe(200)
    const written = await file(asAgent(agentId), 'task', 'a write beside the read')
    expect(written.statusCode, written.body).toBe(400)
  })

  it("passes a session record's id, and the change row names that run", async () => {
    const run = await file(AS_THE_PERSON, 'session', 'a run of this test')
    expect(run.statusCode, run.body).toBe(201)
    const runId = (run.json() as { record: { id: string } }).record.id

    const written = await file(asAgent(runId), 'task', 'written under a run')
    expect(written.statusCode, written.body).toBe(201)
    const id = (written.json() as { record: { id: string } }).record.id
    expect(sessionOfTheCreateRow(id)).toBe(runId)
    expect(written.headers[notice.header]).toBeUndefined()
  })

  it('passes a run name nobody has filed yet on a request with no key, which filing the session binds later', async () => {
    const written = await file(asAgent('a-run-name-not-yet-filed'), 'task', 'written under a run name')
    expect(written.statusCode, written.body).toBe(201)
    const id = (written.json() as { record: { id: string } }).record.id
    expect(sessionOfTheCreateRow(id)).toBe('a-run-name-not-yet-filed')
  })

  // A KEY HOLDS ONLY A RUN THAT IS FILED (problem TwH5ICyRxLVd, the third condition).
  it('refuses a run name nobody has filed yet on a request with a key, and writes nothing', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: 'a-keyed-writer', name: 'a-keyed-writer', runtime: 'claude-code', role: 'worker' },
    })
    expect(made.statusCode, made.body).toBe(201)
    const key = String((made.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key)
    const refused = await file(
      { ...asAgent('a-run-name-filed-by-nobody'), 'x-mole-office-actor-id': 'a-keyed-writer', 'x-mole-office-key': key },
      'task',
      'written with a key under a run name nobody filed',
    )
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.body).toContain('a-run-name-filed-by-nobody')
    expect(recordsTitled('written with a key under a run name nobody filed')).toBe(0)
  })

  // THE SESSION HOOK FILES ITS RUN WITH NO SESSION HEADER, and with the office's key when the agent holds none.
  it("leaves the session hook's filing as it was, and the run it files may be named after", async () => {
    const asTheHook = { ...asAgent(), ...theOfficesKeyHeader() }
    const run = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asTheHook,
      payload: { kind: 'session', title: 'a run the hook filed', data: { state: 'running', runtime: 'claude-code' } },
    })
    expect(run.statusCode, run.body).toBe(201)
    const runId = (run.json() as { record: { id: string } }).record.id
    for (const headers of [{ ...asAgent(runId), ...theOfficesKeyHeader() }, asAgent(runId)]) {
      const written = await file(headers, 'task', `written in the run the hook filed, ${Object.keys(headers).length}`)
      expect(written.statusCode, written.body).toBe(201)
      expect(sessionOfTheCreateRow((written.json() as { record: { id: string } }).record.id)).toBe(runId)
    }
  })
})

describe('an agent write that names no run (J1oPHDg-jWeY)', () => {
  it('is stored as before and its answer says it names no run', async () => {
    const written = await file(asAgent(), 'task', 'written by an agent with no run')
    expect(written.statusCode, written.body).toBe(201)
    const id = (written.json() as { record: { id: string } }).record.id
    expect(sessionOfTheCreateRow(id)).toBeNull()
    expect(written.headers[notice.header]).toBe(notice.sentence)
  })

  it("says nothing on a person's write", async () => {
    const written = await file(AS_THE_PERSON, 'task', 'written by the person')
    expect(written.statusCode, written.body).toBe(201)
    expect(written.headers[notice.header]).toBeUndefined()
  })

  it('says nothing on a read by an agent with no run', async () => {
    const read = await app.inject({ method: 'GET', url: '/api/records?kind=task', headers: asAgent() })
    expect(read.statusCode, read.body).toBe(200)
    expect(read.headers[notice.header]).toBeUndefined()
  })

  it('says nothing on a write that was refused', async () => {
    const refused = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent(),
      payload: { kind: 'no-such-kind', title: 'refused' },
    })
    expect(refused.statusCode).toBeGreaterThanOrEqual(400)
    expect(refused.headers[notice.header]).toBeUndefined()
  })

  it("says nothing on a write the office's own key proved, which rightly carries no run", async () => {
    const written = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...asAgent(), 'x-mole-office-actor-id': 'mole-office-agent-worker', ...theOfficesKeyHeader() },
      payload: { kind: 'task', title: 'written by the office', data: {} },
    })
    expect(written.statusCode, written.body).toBe(201)
    expect(written.headers[notice.header]).toBeUndefined()
  })
})
