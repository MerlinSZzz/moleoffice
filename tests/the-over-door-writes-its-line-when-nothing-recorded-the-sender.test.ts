// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OVER DOOR WRITES ITS LINE WHERE SOMEBODY CAN READ IT (problem MHcSOsp_u5pY).
 *
 * Until 16 September 2026 POST /api/worker/waits/:session/over was refused on EVERY call, 124,375
 * times in nine days (the steward's stock-take, report jDwkhne4tDWR, finding 三-1; the count was
 * still growing at 110,839 when this was measured). The refusal the worker kept printing, word for
 * word, was:
 *
 *     Nothing recorded who sent message <id>, so it is in no conversation and there is nowhere to
 *     say what happened to run <session>. Nothing was written.
 *
 * THE CAUSE is on the door's side. A message written by an actor id that answers to no registry row
 * keeps no `sentBy` — the ordinary path, documented on the field itself in src/shared/kinds.ts — and
 * its message is in no conversation (`conversationOf` in lib/worker.ts). The run the worker filed
 * for it still waits and still reads `over` in GET /api/worker/waits, so every pass the worker
 * pressed the door and every pass it was refused 400 for ever: the line could not be written.
 *
 * SINCE 24 SEPTEMBER 2026 THE WRITE DOOR REFUSES A NEW MESSAGE FROM SUCH AN ACTOR (chapter 7 rule 2), as a
 * decision ruled. So the legacy row this test reads is built the only honest way left:
 * written by a registered writer, then stripped of its sender.
 *
 * WHAT CHANGED: where the message names no group and no sender, the line is written to the agent the
 * run was serving, with `writeASystemLineToOne` — the same door criterion F10 uses to tell one agent
 * something. The line is stored with `aboutRun`, so the bookkeeping that asks has the ending been
 * said decides from the stored line as before, and the run stops being pressed once its line exists.
 * Whether a wait is OVER is decided exactly as it was before; only the destination of the line moved.
 *
 * The test drives the HTTP doors with real fetch over the network, as the worker asks them: the
 * request `ask` in src/worker/index.ts builds — content-type carried, no body sent.
 */
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localStamp } from '../src/shared/time.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

let t: TestDb
let app: FastifyInstance
let port: number

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-trace': 'waits-over',
  'x-mole-office-purpose': 'module-work',
}

/** Exactly the headers `ask` in src/worker/index.ts puts on the over press, and no body. */
const AS_THE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
}

async function pressOver(session: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`http://127.0.0.1:${String(port)}/api/worker/waits/${session}/over`, {
    method: 'POST',
    headers: AS_THE_WORKER,
  })
  return { status: res.status, text: await res.text() }
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  port = (app.server.address() as AddressInfo).port
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the over door against a run whose message has no recorded sender', () => {
  it('records no sender for a message written by an actor nobody registered, and answers the press', async () => {
    // THE REGISTERED AGENT first, because delivering a message to nobody is refused on its own.
    await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OWNER,
      payload: { kind: 'agent', title: 'hook-x', data: { handle: 'hook-x', state: 'active', runtime: 'claude-code' } },
    })
    const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
    const agentId = one((listed.agents ?? []).filter((a) => a.handle === 'hook-x'), 'the registry row for hook-x').id

    // A WRITER NO REGISTRY HOLDS CANNOT WRITE THIS MESSAGE THROUGH THE DOOR ANY MORE. Chapter 7
    // rule 2 refuses it in words, to an agent as to a person.
    const refused = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'hook-nobody-ever-registered',
        'x-mole-office-trace': 'waits-over',
        'x-mole-office-purpose': 'module-work',
      },
      payload: { kind: 'message', title: 'a note from nowhere', data: { body: 'Please read record zzzzzzzzzz.', to: [{ kind: 'agent', id: 'hook-x' }] } },
    })
    expect(refused.statusCode).toBe(400)
    expect(String((JSON.parse(refused.body) as { error?: string }).error)).toContain('Register first')

    // THE LEGACY ROW STILL HAS TO BE READ, so it is built the only honest way left: written by the
    // owner and then stripped of its sender, exactly as the rows written before the refusal exist.
    const note = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OWNER,
      payload: { kind: 'message', title: 'a note from nowhere', data: { body: 'Please read record zzzzzzzzzz.', to: [{ kind: 'agent', id: 'hook-x' }] } },
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(note.statusCode).toBe(409)
    const messageId = (JSON.parse(note.body) as { record?: { id?: string } }).record?.id
    expect(messageId).toBeTypeOf('string')
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.sentBy') WHERE id = ?").run(messageId)
    const seen = (await get(`/api/records/${messageId}`)) as {
      record?: { data?: Record<string, unknown>; workspaceId?: string }
    }
    // KEPT IN THE MESSAGE CENTRE, as every message is.
    expect(seen.record?.workspaceId).toBe('message-centre')
    expect(seen.record?.data?.['sentBy']).toBeUndefined()

    // THE RUN the worker filed: waiting on that message, over past its moment.
    const run = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OWNER,
      payload: {
        kind: 'session',
        title: 'hook-x answering a message',
        data: {
          state: 'running',
          runtime: 'claude-code',
          servingAgent: agentId,
          deliveringMessage: messageId,
          providerSession: 'hook-provider-1',
          waitsUntil: localStamp(new Date(Date.now() - 60_000)),
          startedByMoleOffice: true,
        },
      },
    })
    expect(run.statusCode).toBe(201)
    const session = (JSON.parse(run.body) as { record?: { id?: string } }).record?.id
    expect(session).toBeTypeOf('string')

    // THE LIST TELLS THE WORKER IT IS OVER; one of these reads stands in for the shape the
    // production worker presses against.
    const waits = (await get('/api/worker/waits')) as { waits?: Record<string, unknown>[] }
    const here = one(
      (waits.waits ?? []).filter((w) => w['session'] === session),
      'the run waiting for the next message whose message has no recorded sender',
    )
    expect(here['over']).toBe(true)

    // AND ONE PRESS ENDS IT, where it was refused 400 for ever before. THE REFUSAL THAT WAS, word
    // for word, is what a refused press used to say.
    const press = await pressOver(session!)
    expect(String(JSON.parse(press.text)['error'] ?? '')).not.toContain('in no conversation')
    expect(press.status).toBe(200)
    const said = JSON.parse(press.text) as { line?: { said?: string } }
    expect(said.line?.said).toContain('will not remember')

    // AND THE WAIT IS GONE FROM THE LIST, because the line now carries aboutRun and the goodbye is
    // said — so the door is not pressed for this session again on the next pass.
    const after = (await get('/api/worker/waits')) as { waits?: Record<string, unknown>[] }
    expect((after.waits ?? []).map((w) => w['session'])).not.toContain(session)
  }, 40_000)
})
