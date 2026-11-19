// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORKER ON ANOTHER MACHINE READS THE QUEUE, TAKES A RUN AND ANSWERS IT — AND STARTING ONE STAYS
 * HERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * Criteria P21, P22 and P23 of design/permissions/ACCEPTANCE.md, on the owner's answer 3 of 6 September
 * 2026, whose first clause says that a worker on the owner's other machine may do these
 * things. "These things" are the three acts proposal `AZjUp7h1NWyq` asked about.
 *
 *   P21. Reading the queue, claiming a run and returning its result may all be done from another
 *        machine. A run is read, claimed from loquat, answered, and the answer appears in the
 *        conversation.
 *   P22. Starting a run stays on this machine. `agent.dispatch` is still refused from another
 *        machine, with the sentence it already writes.
 *   P23. A claim records which machine took the run. The run's row names the machine, and the
 *        conversation says which machine answered.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE ROUTES WERE `local` UNTIL P21, AND THAT IS WHAT MAKES THIS MEASURABLE
 * ---------------------------------------------------------------------------------------
 *
 * `agent-coordination.md` 10.3 declared them local and `remote-access.md` 6.8 argued them remote;
 * each cited a ruling, so proposal `Mk1VfP8L31Uz` held them at the one that forbade more. Criterion P21
 * settles it. A test that only asked "are they remote" would pass on the day somebody declared every
 * route remote by accident, so P22 is measured in the same file: dispatch is still refused, from the
 * same door, in the same run.
 *
 * ---------------------------------------------------------------------------------------
 * TWO REAL DOORS AND NOT ONE `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * The same reason tests/governance-from-another-machine.test.ts gives: an injected request is on no
 * socket, so its arrival is `undefined`, which means the machine rules do not apply to it.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { thePersonsKeyHeader, theOfficesKeyHeader, apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let thisMachine: string
let loquat: string
const extraDoors: Server[] = []

/** The address a worker on loquat appears to come from, and what the run should record. */
const LOQUAT_ADDRESS = '192.0.2.20'

async function open(server: Server): Promise<string> {
  extraDoors.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()

  const { stampArrival, CLIENT_ADDRESS_HEADER } = await import('../src/server/lib/http.ts')
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  loquat = await open(
    createServer((raw, res) => {
      // A PROXY ON THIS COMPUTER, which is what the door a private network daemon passes requests
      // through is, AND THE ADDRESS IT FORWARDED. That pair is what `writtenFrom` reads, and it is
      // the pair criterion P23 is about: the machine on the run is a measurement of the connection
      // and not something the worker typed into its claim.
      raw.headers[CLIENT_ADDRESS_HEADER] = LOQUAT_ADDRESS
      stampArrival(raw, 'another machine', 'a proxy on this computer')
      app.routing(raw, res)
    }),
  )
})

afterAll(async () => {
  for (const server of extraDoors) await new Promise<void>((resolve) => server.close(() => resolve()))
  await app.close()
  t.close()
})

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function ask(
  door: string,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
  headers: Record<string, string> = PERSON,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: { ...headers, ...(path.endsWith('/dispatch') ? thePersonsKeyHeader() : path.endsWith('/claim') ? theOfficesKeyHeader() : {}) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/**
 * A conversation with one comment in it, dispatched from THIS machine, so there is a run to take.
 *
 * The dispatch is made here on purpose: criterion P22 says starting a run stays on this machine, so
 * the only way to have a run at all is to start it from the door that may.
 */
async function aRunWaiting(title: string): Promise<{ threadId: string; runId: string }> {
  const thread = await ask(thisMachine, 'POST', '/api/agent/threads', { title, mode: 'direct' })
  expect(thread.status, JSON.stringify(thread.body)).toBe(201)
  const threadId = (thread.body.thread as { id: string }).id

  const said = await ask(thisMachine, 'POST', `/api/agent/threads/${threadId}/messages`, {
    intent: 'change',
    body: 'What does the queue look like from over there?',
    // WHO IT IS FOR. A comment that names nobody is held at dispatch rather than sent, so without
    // this there is no run and everything below would measure an empty queue.
    recipient: { kind: 'new' },
  })
  expect(said.status, JSON.stringify(said.body)).toBe(201)

  const sent = await ask(thisMachine, 'POST', `/api/agent/threads/${threadId}/dispatch`)
  expect(sent.status, JSON.stringify(sent.body)).toBe(201)
  const runs = (sent.body.runs ?? []) as { id: string }[]
  expect(runs.length, 'the dispatch made no run, so there is nothing to claim').toBeGreaterThan(0)
  return { threadId, runId: runs[0]?.id ?? '' }
}

describe('P21 — reading the queue, claiming a run and answering it may all be done from loquat', () => {
  it('reads the queue from another machine', async () => {
    await aRunWaiting('Reading the queue from loquat')
    const queue = await ask(loquat, 'GET', '/api/agent/runs?state=queued')
    expect(queue.status, JSON.stringify(queue.body)).toBe(200)
    expect((queue.body.runs as unknown[]).length, 'the queue read from loquat is empty').toBeGreaterThan(0)
  })

  it('claims a run from another machine and answers it, and the answer lands in the conversation', async () => {
    const { threadId, runId } = await aRunWaiting('Answering from loquat')

    const claimed = await ask(loquat, 'POST', `/api/agent/runs/${runId}/claim`, { worker: 'the worker on loquat' })
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(200)

    const answered = await ask(loquat, 'POST', `/api/agent/runs/${runId}/result`, {
      result: { answer: 'It looks the same from here.' },
    })
    expect(answered.status, JSON.stringify(answered.body)).toBe(200)

    // AND THE ANSWER IS IN THE CONVERSATION. A route that answered 200 and filed nothing would pass
    // every check above it.
    const conversation = await ask(thisMachine, 'GET', `/api/agent/threads/${threadId}`)
    expect(JSON.stringify(conversation.body)).toContain('It looks the same from here.')
  })
})

describe('P22 — starting a run stays on this machine', () => {
  it('refuses a dispatch from another machine, with the sentence it already writes', async () => {
    const thread = await ask(thisMachine, 'POST', '/api/agent/threads', {
      title: 'A dispatch attempted from loquat',
      mode: 'direct',
    })
    const threadId = (thread.body.thread as { id: string }).id
    await ask(thisMachine, 'POST', `/api/agent/threads/${threadId}/messages`, {
      intent: 'change',
      body: 'Start this from over there.',
      recipient: { kind: 'new' },
    })

    const refused = await ask(loquat, 'POST', `/api/agent/threads/${threadId}/dispatch`)
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    // THE SENTENCE IT ALREADY WRITES, which is `refusalFromAnotherMachine`'s, built from the route's
    // own declaration: the act, why it is kept here, and which computer asked.
    expect(String(refused.body.error)).toContain('Sending a thread to an agent')
    expect(String(refused.body.error)).toContain('this request came from another computer')
    expect(String(refused.body.error)).toContain(LOQUAT_ADDRESS)

    // AND NO RUN WAS MADE. A 403 that dispatched anyway would be the failure this criterion is about.
    const runs = t.client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM agent_runs WHERE thread_id = ?')
      .get(threadId) as { n: number }
    expect(runs.n, 'a dispatch refused from another machine still made a run').toBe(0)
  })
})

describe('P23 — a claim records which machine took the run', () => {
  it('names the machine on the run’s own row', async () => {
    const { runId } = await aRunWaiting('Which machine took it')
    await ask(loquat, 'POST', `/api/agent/runs/${runId}/claim`, { worker: 'the worker on loquat' })

    const row = t.client.sqlite
      .prepare('SELECT claimed_by, claimed_from_machine FROM agent_runs WHERE id = ?')
      .get(runId) as { claimed_by: string | null; claimed_from_machine: string | null }
    expect(row.claimed_by).toBe('the worker on loquat')
    expect(row.claimed_from_machine, 'the run does not say which machine claimed it').toBe(LOQUAT_ADDRESS)
  })

  it('says which machine answered, in the conversation', async () => {
    const { threadId, runId } = await aRunWaiting('The conversation says where it went')
    await ask(loquat, 'POST', `/api/agent/runs/${runId}/claim`, { worker: 'the worker on loquat' })

    const conversation = await ask(thisMachine, 'GET', `/api/agent/threads/${threadId}`)
    const runs = conversation.body.runs as { id: string; claimedFromMachine: string | null; says: string }[]
    const mine = runs.find((one) => one.id === runId)
    expect(mine?.claimedFromMachine, 'the conversation’s run does not carry the machine').toBe(LOQUAT_ADDRESS)
    // AND IT IS IN THE SENTENCE A PERSON READS, not only in a field a page might not draw.
    expect(mine?.says, 'the sentence about this run does not name the machine').toContain(LOQUAT_ADDRESS)
  })

  it('records nobody-could-tell rather than this machine when a run is claimed from here', async () => {
    const { runId } = await aRunWaiting('Claimed at home')
    await ask(thisMachine, 'POST', `/api/agent/runs/${runId}/claim`, { worker: 'the worker here' })
    const row = t.client.sqlite
      .prepare('SELECT claimed_from_machine FROM agent_runs WHERE id = ?')
      .get(runId) as { claimed_from_machine: string | null }
    // THIS MACHINE'S OWN NAME, or null where the probe could not answer. Either is honest; the one
    // thing it must never be is loquat's address.
    expect(row.claimed_from_machine).not.toBe(LOQUAT_ADDRESS)
  })

  it('does not let a worker name its own machine', async () => {
    const { runId } = await aRunWaiting('A worker naming somewhere else')
    const refused = await ask(loquat, 'POST', `/api/agent/runs/${runId}/claim`, {
      worker: 'a worker with ideas',
      machine: 'somewhere-else',
    })
    // THE BODY IS STRICT, so a field for the machine is refused rather than ignored. This is the one
    // thing about a claim a worker must not be able to say for itself.
    expect(refused.status).toBe(400)
    const row = t.client.sqlite
      .prepare('SELECT claimed_from_machine FROM agent_runs WHERE id = ?')
      .get(runId) as { claimed_from_machine: string | null }
    expect(row.claimed_from_machine).toBeNull()
  })
})
