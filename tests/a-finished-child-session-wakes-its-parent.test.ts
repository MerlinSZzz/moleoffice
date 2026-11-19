// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHILD SESSION THAT FINISHES WAKES ITS PARENT, ONCE. Problem c3p75p8aALd2, item 5 of
 * a decision.
 *
 * A coordinating session sat idle for an hour after its subagents had finished, because nothing acted
 * when a session's state became `finished`. Now the write that moves a session to `finished` sends
 * one line from Mole Office to the agent its parent session answers as. That line is a message to the
 * agent, which is the door that reaches a runtime whose turn has ended.
 *
 * WHAT IS PROVED
 *   1. A child naming its parent in `parentAttachment` that finishes puts one line in the parent
 *      agent's messages, about the child.
 *   2. Finishing again, after running again, writes no second line.
 *   3. A child that crashes wakes nobody, and a finished session naming no parent wakes nobody.
 *   4. ONE FINISH, ONE NOTICE, on problem 2-AtvZiEfVO9. When the seal's
 *      notice, written earlier in the same finish, already reached the agent the parent answers as, no second line is
 *      written. A seal's notice to another agent leaves the line as it was.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the finish stops calling tellTheParentAChildFinished   → cases 1 and 2
 *   the line is written without looking for an earlier one → case 2
 *   the wake is asked on every ending, not on finished     → case 3
 *
 * WHAT THIS DOES NOT PROVE. That a runtime's waiter hands the line to the model is the session hook's
 * and the waiter's business (tools/session-hook.mjs and tools/hold-the-handle.mjs), which are another agent's.
 *
 * Nothing here opens ./data/panelx.db: `freshDb` in tests/helpers.ts makes a throwaway database.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let caseNumber = 0
let coordinator = 'coordinator'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method, url, headers: AS_THE_OWNER, ...(payload === undefined ? {} : { payload: payload as never }) })
  expect(reply.statusCode, reply.body).toBeLessThan(300)
  return (reply.body === '' ? {} : reply.json()) as Record<string, unknown>
}

async function aSession(title: string, data: Record<string, unknown> = {}): Promise<string> {
  const filed = await call('POST', '/api/records', { kind: 'session', title, data: { state: 'running', runtime: 'claude-code', doing: title, ...data } })
  return (filed['record'] as { id: string }).id
}

/** A parent session that answers as the agent `coordinator`, by holding its handle. */
async function aParentAnsweringAsTheCoordinator(): Promise<{ parent: string; agent: string }> {
  await call('POST', '/api/records', { kind: 'agent', title: 'Coordinator', data: { handle: coordinator, state: 'active', runtime: 'claude-code' } })
  const listed = (await call('GET', '/api/participants')) as { agents?: { id: string; handle: string }[] }
  const agent = one((listed.agents ?? []).filter((a) => a.handle === coordinator), 'the coordinator').id
  const parent = await aSession('the coordinating session')
  await call('POST', `/api/handles/${coordinator}/hold`, { session: parent, machine: 'a-machine', runtime: 'claude-code' })
  return { parent, agent }
}

/** Every line Mole Office has written about this child session. */
function linesAbout(child: string): { to: unknown; body: string }[] {
  const rows = t.client.sqlite
    .prepare("SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.aboutRun') = ?")
    .all(child) as { data: string }[]
  return rows
    .map((row) => JSON.parse(row.data) as { to: unknown; body: string; sentBy: { id: string } })
    .filter((said) => said.sentBy.id === moleOffice().id)
}

/** The seal's notice about this run to one agent, written as `sealFinishedRun` writes it in a finish. */
async function aSealNoticeTo(agent: string, run: string): Promise<void> {
  const groups = await import('../src/server/lib/groups.ts')
  const line = SYSTEM_LINES.aRunWasSealed({ run, agent: 'a-subagent', seal: 'Test-seal-id', kind: 'records', git: null, files: null, records: [] })
  groups.writeASystemLineToOne({ kind: 'agent', id: agent }, 'default', line, { type: 'system', id: moleOffice().id }, { run })
}

/**
 * ONE OFFICE FOR THE FILE. Each case files its own child sessions and registers the agents it names
 * under handles of its own, so no case joins a row another case wrote.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  coordinator = `coordinator-${String(caseNumber)}`
})

describe('a finished child session wakes its parent', () => {
  it('writes one line to the agent the parent session answers as', async () => {
    const { parent, agent } = await aParentAnsweringAsTheCoordinator()
    const child = await aSession('a subagent reading the logs', { parentAttachment: parent })
    expect(linesAbout(child)).toEqual([])
    await call('PATCH', `/api/records/${child}`, { dataPatch: { state: 'finished' } })
    const lines = linesAbout(child)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.to).toEqual([{ kind: 'agent', id: agent }])
    expect(lines[0]!.body).toContain('a subagent reading the logs')
  })

  it('writes no second line when the same child finishes again', async () => {
    const { parent } = await aParentAnsweringAsTheCoordinator()
    const child = await aSession('a subagent reading the logs', { parentAttachment: parent })
    await call('PATCH', `/api/records/${child}`, { dataPatch: { state: 'finished' } })
    await call('PATCH', `/api/records/${child}`, { dataPatch: { state: 'running' } })
    await call('PATCH', `/api/records/${child}`, { dataPatch: { state: 'finished' } })
    expect(linesAbout(child)).toHaveLength(1)
  })

  it('wakes nobody for a crash, or for a finished session that names no parent', async () => {
    const { parent } = await aParentAnsweringAsTheCoordinator()
    const crashed = await aSession('a subagent that died', { parentAttachment: parent })
    await call('PATCH', `/api/records/${crashed}`, { dataPatch: { state: 'crashed' } })
    expect(linesAbout(crashed)).toEqual([])
    const orphan = await aSession('a session on its own')
    await call('PATCH', `/api/records/${orphan}`, { dataPatch: { state: 'finished' } })
    expect(linesAbout(orphan)).toEqual([])
  })

  it("writes no second line when the seal's notice already told that agent", async () => {
    const { parent, agent } = await aParentAnsweringAsTheCoordinator()
    const child = await aSession('a subagent with a seal', { parentAttachment: parent })
    await aSealNoticeTo(agent, child)
    await call('PATCH', `/api/records/${child}`, { dataPatch: { state: 'finished' } })
    const lines = linesAbout(child)
    expect(lines, 'a second notice of the same finish was written').toHaveLength(1)
    expect(lines[0]!.body).toBe(`Run ${child} sealed`)
  })

  it("still writes the line when the seal's notice went to another agent", async () => {
    const { parent } = await aParentAnsweringAsTheCoordinator()
    const anotherHandle = `another-starter-${String(caseNumber)}`
    await call('POST', '/api/records', { kind: 'agent', title: 'Another starter', data: { handle: anotherHandle, state: 'active', runtime: 'claude-code' } })
    const listed = (await call('GET', '/api/participants')) as { agents?: { id: string; handle: string }[] }
    const another = one((listed.agents ?? []).filter((a) => a.handle === anotherHandle), 'another starter').id
    const child = await aSession('a subagent sealed for somebody else', { parentAttachment: parent })
    await aSealNoticeTo(another, child)
    await call('PATCH', `/api/records/${child}`, { dataPatch: { state: 'finished' } })
    expect(linesAbout(child)).toHaveLength(2)
  })
})
