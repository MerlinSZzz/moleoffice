// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE ABOUT A RUN IS FOUND BY THE RUN'S INDEX, NOT BY READING EVERY MESSAGE.
 *
 * Before the office writes a line about a run, it asks whether it already wrote that line, so that it never writes it
 * twice. Three lookups ask it: two in `tellTheParentAChildFinished` (src/server/lib/worker.ts), when a child session
 * finishes, and one in `tellOnce` (src/server/lib/the-line-next-round.ts), when a line's next round is asked or starts.
 * Each named the run as `json_extract(data, '$.aboutRun')`, which no index holds, so SQLite read every message's data.
 * On a made-up office with the live office's 122,682 messages each lookup took about 150 ms, two of them inside the
 * write that finishes a run.
 *
 * WHAT IS PROVED
 *   3. The child's finish finds the same messages: one line to the parent's agent past a withdrawn copy, a copy from
 *      another sender and a copy about another run; no second line when the child finishes again; and none when the
 *      seal's notice about the child already went to the parent's agent.
 *   4. The next round's notice finds the same messages: one line to the line's secretary past the same three near
 *      misses, and no second line when the round is told again.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   a lookup stops asking `deleted_at IS NULL`, the sender or the body        → case 3 or 4
 *
 * WHAT THIS DOES NOT PROVE. The time a lookup takes. A fresh test office has a few messages, so it shows the plan and the
 * answers, and the times are measured on a made-up office of the live size outside the suite.
 *
 * Every record here is made up. `freshDb` in tests/helpers.ts makes a throwaway database.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { setFixtureOwner } from './agent-owner-fixture.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let theLine: typeof import('../src/server/lib/the-line-next-round.ts')
let participants: typeof import('../src/server/lib/participants.ts')

const WORKSPACE = 'default'
/** A line's supervisor, named as the office reads a line from a handle, and the secretary its duties name. */
const THE_LINE = 'madeup'
const SUPERVISOR = `wave-${THE_LINE}-supervisor`
const SECRETARY = 'made-up-secretary'
const ANOTHER_SENDER = { kind: 'agent', id: 'made-up-other-sender' } as const
const A_WITHDRAWN_AT = '2026-11-01 00:00:00'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method, url, headers: AS_THE_OWNER, ...(payload === undefined ? {} : { payload: payload as never }) })
  expect(reply.statusCode, reply.body).toBeLessThan(300)
  return (reply.body === '' ? {} : reply.json()) as Record<string, unknown>
}

async function register(handle: string, role: string): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_OWNER,
    payload: { handle, name: `Made-up ${handle}`, role, ...(role === 'secretary' ? {} : { workArea: ['work'] }) } })
  expect(reply.statusCode, reply.body).toBe(201)
  return String((reply.json() as { agent: { id: string } }).agent.id)
}

async function aSession(title: string, data: Record<string, unknown> = {}): Promise<string> {
  const filed = await call('POST', '/api/records', { kind: 'session', title, data: { state: 'running', runtime: 'claude-code', doing: title, ...data } })
  return (filed['record'] as { id: string }).id
}

/** A parent session answering as a made-up coordinator, by holding its handle. */
async function aParent(coordinator: string): Promise<{ parent: string; agent: string }> {
  await call('POST', '/api/records', { kind: 'agent', title: 'Made-up coordinator', data: { handle: coordinator, state: 'active', runtime: 'claude-code' } })
  const listed = (await call('GET', '/api/participants')) as { agents?: { id: string; handle: string }[] }
  const agent = one((listed.agents ?? []).filter((a) => a.handle === coordinator), 'the coordinator').id
  const parent = await aSession('the made-up coordinating session')
  await call('POST', `/api/handles/${coordinator}/hold`, { session: parent, machine: 'a-made-up-machine', runtime: 'claude-code' })
  return { parent, agent }
}

/** A made-up stored message, written past the door so it can be a near miss of a lookup. */
function aMessage(data: Record<string, unknown>, withdrawn = false): void {
  const record = t.api.createRecord({ kind: 'note', title: 'Made-up message', workspaceId: WORKSPACE, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, origin: 'fixture' })
  t.client.sqlite.prepare('UPDATE records SET kind = ?, data = ?, deleted_at = ? WHERE id = ?').run('message', JSON.stringify(data), withdrawn ? A_WITHDRAWN_AT : null, record.id)
}

/** The office's own live lines about one run, in the order written. */
function theOfficesLinesAbout(run: string): { to: unknown; body: string }[] {
  const rows = t.client.sqlite
    .prepare("SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.aboutRun') = ? ORDER BY rowid")
    .all(run) as { data: string }[]
  return rows.map((row) => JSON.parse(row.data) as { to: unknown; body: string; sentBy: { id: string } }).filter((said) => said.sentBy.id === moleOffice().id)
}



/** A made-up run of the line, and the line's supervisor as the office reads it. */
async function aRunOfTheLine(title: string) {
  const run = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'session', title, origin: 'fixture', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, data: { state: 'finished' } })
  const supervisor = participants.agentByHandle(SUPERVISOR)
  if (supervisor === null) throw new Error(`The made-up supervisor ${SUPERVISOR} is not registered.`)
  return { run, supervisor }
}

let theSecretary = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  theLine = await import('../src/server/lib/the-line-next-round.ts')
  participants = await import('../src/server/lib/participants.ts')
  theSecretary = await register(SECRETARY, 'secretary')
  await register(SUPERVISOR, 'supervisor')
  // THE SUPERVISOR IS HANDED TO THE SECRETARY. Since the owner package a next round's notice goes to the supervisor's
  // recorded owner, and the person who registered it is its owner until a hand-over moves it, as here.
  setFixtureOwner(t.client.sqlite, theSecretary, SUPERVISOR, 'handle')
  const duties = t.api.createRecord({ kind: 'note', title: 'Made-up duties record', workspaceId: WORKSPACE, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, origin: 'fixture' })
  t.client.sqlite
    .prepare('UPDATE records SET kind = ?, data = ? WHERE id = ?')
    .run('secretary_duties', JSON.stringify({ secretary: { kind: 'agent', id: theSecretary }, area: 'Made-up area', lines: [THE_LINE], restsOn: [] }), duties.id)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a message about a run', () => {


  it("3. is found by a child's finish as before: one line past three near misses, none twice, none after the seal's notice", async () => {
    const { parent, agent } = await aParent('made-up-coordinator-3')
    const title = 'a made-up subagent with near misses'
    const child = await aSession(title, { parentAttachment: parent })
    const line = SYSTEM_LINES.aChildSessionFinished(child, title).line
    const to = [{ kind: 'agent', id: agent }]
    aMessage({ body: line, to, aboutRun: child, sentBy: moleOffice() }, true)
    aMessage({ body: line, to, aboutRun: child, sentBy: ANOTHER_SENDER })
    aMessage({ body: line, to, aboutRun: 'made-up-another-run', sentBy: moleOffice() })
    aMessage({ body: `Run ${child} sealed`, notice: 'aRunWasSealed', to: [ANOTHER_SENDER], aboutRun: child, sentBy: moleOffice() })
    await call('PATCH', `/api/records/${child}`, { dataPatch: { state: 'finished' } })
    expect(theOfficesLinesAbout(child).map((said) => said.body), 'the lines about the child after its finish').toEqual([`Run ${child} sealed`, line])
    expect(theOfficesLinesAbout(child)[1]!.to).toEqual(to)
    await call('PATCH', `/api/records/${child}`, { dataPatch: { state: 'running' } })
    await call('PATCH', `/api/records/${child}`, { dataPatch: { state: 'finished' } })
    expect(theOfficesLinesAbout(child), 'the lines after the second finish').toHaveLength(2)

    const sealed = await aSession('a made-up subagent with a seal', { parentAttachment: parent })
    aMessage({ body: `Run ${sealed} sealed`, notice: 'aRunWasSealed', to, aboutRun: sealed, sentBy: moleOffice() })
    await call('PATCH', `/api/records/${sealed}`, { dataPatch: { state: 'finished' } })
    expect(theOfficesLinesAbout(sealed).map((said) => said.body), "the lines after the seal's notice").toEqual([`Run ${sealed} sealed`])
  })

  it("4. is found by a next round's notice as before: one line to the secretary past three near misses, and none twice", async () => {
    const { run, supervisor } = await aRunOfTheLine('A made-up round with near misses')
    const body = `Run made-up-next-run started after run ${run.id} with brief /made-up/NEXT.md.`
    const to = [{ kind: 'agent', id: theSecretary }]
    aMessage({ body, to, aboutRun: run.id, sentBy: moleOffice() }, true)
    aMessage({ body, to, aboutRun: run.id, sentBy: ANOTHER_SENDER })
    aMessage({ body, to, aboutRun: 'made-up-another-run', sentBy: moleOffice() })
    theLine.tellTheSecretaryTheRoundStarted(run, supervisor, 'made-up-next-run', '/made-up/NEXT.md')
    expect(theOfficesLinesAbout(run.id), 'the notices about the run').toEqual([expect.objectContaining({ body, to })])
    theLine.tellTheSecretaryTheRoundStarted(run, supervisor, 'made-up-next-run', '/made-up/NEXT.md')
    expect(theOfficesLinesAbout(run.id), 'the notices after the round is told again').toHaveLength(1)
  })
})
