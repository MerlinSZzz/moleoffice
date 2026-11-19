// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE WORKER SAYS WHY A MESSAGE IS HELD ONCE, NOT ON EVERY PASS.
 *
 * MEASURED FIRST, 11 September 2026, on the live server's own log (problem 9UeL9VeVPn33): 143
 * messages addressed to agents nobody answers as sat in the queue, and every pass posted the same
 * sentence about every one of them — 20,679 posts in two hours, the same message re-marked up to
 * 296 times, 83 ms of the server's one thread each. Nothing about those messages changed between
 * passes. The worker now remembers what it last said about each queued delivery and posts again
 * only when the sentence differs, or when the message left the queue and came back.
 *
 * HOW IT IS PROVED. The office's held door is counted with a request hook. A message to an agent
 * with no runtime cannot start a run, so each pass holds it with a sentence. Pass one posts once;
 * pass two, with nothing changed, posts nothing; a second message posts once for itself and
 * nothing for the first. CONTROL: red before the change (pass two posts one). MUTATION: make
 * `sayItIsHeld` post whatever the memory says, and the second count is red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { onePass, whatTheWorkerLastSaidAbout, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

let t: TestDb
let app: FastifyInstance
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []
/** Every POST to the held door, in order. */
const heldPosts: string[] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}
async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}
async function anAgent(handle: string): Promise<string> {
  await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active' } })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}
async function messageTo(agentId: string, body: string): Promise<string> {
  const filed = await post('/api/records', { kind: 'message', title: body.slice(0, 60), data: { body, to: [{ kind: 'agent', id: agentId }] } })
  return (filed['record'] as { id: string }).id
}
async function sentenceOn(messageId: string): Promise<string | null> {
  const read = (await get(`/api/messages/${messageId}`)) as { message?: { deliveries?: { because: string | null }[] } }
  return one(read.message?.deliveries ?? [], `a delivery row for ${messageId}`).because
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  app.addHook('onRequest', async (req) => {
    if (req.method === 'POST' && /\/api\/worker\/messages\/[^/]+\/held$/.test(req.url)) heldPosts.push(req.url)
  })
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-held-once-'))
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: CHECKOUT,
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort() },
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('a message to an agent with no runtime, held pass after pass', () => {
  let agentId = ''
  let first = ''
  let second = ''

  it('is held with a sentence on the first pass, and the worker remembers it', async () => {
    agentId = await anAgent('held-once')
    first = await messageTo(agentId, 'The first message, which nothing can start a run for.')
    const report = await onePass(settings, watching)
    expect(report.held.map((h) => h.messageId)).toEqual([first])
    expect(heldPosts).toHaveLength(1)
    const sentence = await sentenceOn(first)
    expect(sentence).not.toBeNull()
    expect(whatTheWorkerLastSaidAbout({ messageId: first, to: { kind: 'agent', id: agentId } })).toBe(sentence)
  })

  it('posts nothing on the next pass, because nothing changed', async () => {
    const report = await onePass(settings, watching)
    expect(report.held.map((h) => h.messageId), 'the pass still reports the message as held').toEqual([first])
    expect(heldPosts, 'no second post for the same sentence').toHaveLength(1)
  })

  it('posts once for a new message, and still nothing for the first', async () => {
    second = await messageTo(agentId, 'A second message, held for the same reason.')
    await onePass(settings, watching)
    expect(heldPosts).toHaveLength(2)
    expect(heldPosts[1]).toContain(second)
  })

  it('forgets a message that left the queue, so one that comes back is said afresh', async () => {
    const seen = await app.inject({ method: 'POST', url: `/api/messages/${first}/mark`, headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agentId }, payload: { mark: 'seen' } })
    expect(seen.statusCode, seen.body).toBe(200)
    await onePass(settings, watching)
    expect(whatTheWorkerLastSaidAbout({ messageId: first, to: { kind: 'agent', id: agentId } }), 'left the queue, forgotten').toBeNull()
    expect(whatTheWorkerLastSaidAbout({ messageId: second, to: { kind: 'agent', id: agentId } }), 'still queued, still remembered').not.toBeNull()
    expect(heldPosts, 'nothing new was said').toHaveLength(2)
  })
})
