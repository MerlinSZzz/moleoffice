// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DELIVERY MARK AND A READ MARK FOLLOW THE MESSAGE, NOT THE PROJECT WHOEVER IS ASKING STANDS IN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHAT IT COST THE OWNER
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M76 of design/messages/ACCEPTANCE.md section 40, on the owner's finding of 7 September 2026 at
 * 15:10. Three messages written from the owner's other computer were filed in the Robotics
 * project. The waiter holding the coordinator's handle
 * had been started in Mole Office.
 * In the corpus all three still carry the mark `queued`, and the secretary's reply NkteFxcZUy0l is filed in
 * Mole Office, on the wrong side of the boundary from the messages it answers.
 *
 * The cause is one line: `readMessage(id, workspaceId)` refuses a message filed in another project,
 * and every mark-writing path called it first. So:
 *
 *   the waiter's `took`   → 404 before any mark could be written; the row kept its clock
 *   the record read       → 404 as well, so the waiter printed "would not hand back what it says"
 *   the browser's `mark`  → 404, so a message the owner had just read stayed unread
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE LIVE SESSION MARKS IT DELIVERED WHEREVER IT IS FILED. The waiter asks from Mole Office
 *      about a message in Robotics and the clock becomes a tick.
 *   2. AND THE REPLY SAYS WHERE THE MESSAGE WAS WRITTEN. Until a decision, of
 *      29 September 2026, it said
 *      which project the message was filed in, so an answer could be filed there. Now every message is kept in the
 *      message centre and belongs to no project, so the reply names the mark `writtenIn`, and an answer joins its
 *      conversation wherever it is written.
 *   3. READING MARKS IT READ WHEREVER THE READER STANDS. The owner is in Mole Office; the message is in
 *      Robotics; it stops being unread.
 *   4. A PLAIN READ IS ANSWERED FROM ANY PROJECT TOO. Until a decision, of 29
 *      September 2026, `GET /api/messages/:id` refused a
 *      message from another project. A message belongs to no project now, so the project a request names is not part of
 *      the question; who may read it is the reader rule, which tests/who-reads-a-message-in-the-message-centre.test.ts
 *      proves.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   put the project gate back on the took door   → cases 1 and 2
 *   put it back on the mark door                 → case 3
 *   put a project gate back on the plain read    → case 4
 */

import type { FastifyInstance } from 'fastify'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

const HERE = 'panelx'
const THERE = 'robotics'

let t: TestDb
let app: FastifyInstance

const inProject = (id: string): Record<string, string> => ({
  'x-mole-office-workspace': id,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
})

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as never })
  return reply.json() as Record<string, unknown>
}

/** How far a message got with its one recipient, read in the project it is actually filed in. */
async function markOn(messageId: string): Promise<string> {
  const reply = await app.inject({ method: 'GET', url: `/api/messages/${messageId}`, headers: inProject(THERE) })
  const read = reply.json() as { message?: { deliveries?: { mark: string }[] } }
  return one(read.message?.deliveries ?? [], `a delivery row for ${messageId}`).mark
}

let agentId = ''
let session = ''

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  for (const [id, title] of [
    [HERE, 'Mole Office'],
    [THERE, 'Robotics'],
  ]) {
    const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id, title } })
    expect(made.statusCode, made.body).toBe(201)
  }

  // THE AGENT AND THE SESSION ARE IN MOLE OFFICE, which is where the waiter was started. This is
  // the owner's case exactly: one durable agent, a session holding its handle, filed here.
  await post(
    '/api/records',
    { kind: 'agent', title: THE_TEST_OFFICES_SECRETARY.name, data: { handle: `${THE_TEST_OFFICES_SECRETARY.handle}-m76`, state: 'active', runtime: 'claude-code' } },
    inProject(HERE),
  )
  const listed = (
    await app.inject({ method: 'GET', url: '/api/participants', headers: inProject(HERE) })
  ).json() as { agents?: { id: string; handle: string }[] }
  agentId = one((listed.agents ?? []).filter((a) => a.handle === `${THE_TEST_OFFICES_SECRETARY.handle}-m76`), 'the registry row').id

  const filed = await post(
    '/api/records',
    { kind: 'session', title: 'A terminal', data: { state: 'running', runtime: 'claude-code', doing: 'holding' } },
    inProject(HERE),
  )
  session = (filed['record'] as { id: string }).id
  const held = await app.inject({
    method: 'POST',
    url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}-m76/hold`,
    headers: inProject(HERE),
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
  expect(held.statusCode, held.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** The owner's case: a message written in Robotics, addressed to an agent whose waiter is in Mole Office. */
async function aMessageInRobotics(body: string): Promise<string> {
  const filed = await post(
    '/api/records',
    { kind: 'message', title: body.slice(0, 40), data: { body, to: [{ kind: 'agent', id: agentId }] } },
    inProject(THERE),
  )
  const record = filed['record'] as { id: string; workspaceId: string; data: { writtenIn?: { project?: string } } } | undefined
  // KEPT IN THE MESSAGE CENTRE, WITH THE MARK OF WHERE IT WAS WRITTEN.
  expect(record?.workspaceId, 'the message is in the message centre').toBe('message-centre')
  expect(record?.data.writtenIn?.project, 'the message was written in the other project').toBe(THERE)
  return String(record?.id)
}

describe('a mark follows the message and not the asker', () => {
  it('lets the live session mark delivered a message filed in another project', async () => {
    const messageId = await aMessageInRobotics('传入第二张后第一张被挤掉')
    // THE CONTROL: it starts queued, so a tick cannot pass for free.
    expect(await markOn(messageId)).toBe('queued')

    // THE WAITER ASKS FROM THE PROJECT IT WAS STARTED IN, which is the whole of the owner's case.
    const took = await app.inject({
      method: 'POST',
      url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}-m76/took`,
      headers: inProject(HERE),
      payload: { session, message: messageId },
    })
    expect(took.statusCode, took.body).toBe(200)
    expect(await markOn(messageId), 'the clock became a tick').toBe('delivered')
  })

  it('says where the message was written, and no project to answer in', async () => {
    const messageId = await aMessageInRobotics('聊天框样式example，send again')
    const took = await app.inject({
      method: 'POST',
      url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}-m76/took`,
      headers: inProject(HERE),
      payload: { session, message: messageId },
    })
    expect(took.statusCode, took.body).toBe(200)
    const said = took.json() as {
      inProject?: string
      writtenIn?: { project?: string }
      workspaceId?: string
      message?: { workspaceId?: string; writtenIn?: { project?: string } }
    }
    expect(said.writtenIn, 'the reply names where the message was written').toEqual({ project: THERE })
    expect(said, 'no project to answer in').not.toHaveProperty('inProject')
    // AND IT STILL SAYS WHICH PROJECT THE WAITER ASKED FROM, which is a different fact.
    expect(said.workspaceId).toBe(HERE)
    expect(said.message?.workspaceId).toBe('message-centre')
    expect(said.message?.writtenIn).toEqual({ project: THERE })
  })

  it('lets the owner mark read a message filed in another project than the one they stand in', async () => {
    // A MESSAGE TO THE OWNER, in the other project: the agent's answer, which is the half of the owner's case
    // where the row the owner is looking at stays unread after the owner has read it.
    const filed = await post(
      '/api/records',
      {
        kind: 'message',
        title: 'The answer',
        data: { body: '收到：五条已记录', to: [{ kind: 'person', id: THE_PERSON }] },
      },
      { ...inProject(THERE), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': `${THE_TEST_OFFICES_SECRETARY.handle}-m76` },
    )
    const messageId = String((filed['record'] as { id: string }).id)
    expect(await markOn(messageId)).toBe('queued')
    // THE OWNER IS STANDING IN MOLE OFFICE. The chat is theirs across every project and draws this message,
    // so reading it has to be writable from where the owner is reading it.
    const marked = await app.inject({
      method: 'POST',
      url: `/api/messages/${messageId}/mark`,
      headers: inProject(HERE),
      payload: { mark: 'seen' },
    })
    expect(marked.statusCode, marked.body).toBe(200)
    expect(await markOn(messageId)).toBe('seen')
  })

  it('answers a plain read about a message written in another project, from any project', async () => {
    const messageId = await aMessageInRobotics('这条只是被读取')
    const there = await app.inject({ method: 'GET', url: `/api/messages/${messageId}`, headers: inProject(THERE) })
    expect(there.statusCode).toBe(200)
    // A MESSAGE BELONGS TO NO PROJECT, so the project the request names is not part of the question.
    const here = await app.inject({ method: 'GET', url: `/api/messages/${messageId}`, headers: inProject(HERE) })
    expect(here.statusCode, here.body).toBe(200)
  })
})
