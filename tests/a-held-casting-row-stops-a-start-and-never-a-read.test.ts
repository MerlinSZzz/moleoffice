// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HELD CASTING ROW STOPS A START, AND NEVER A READ.
 *
 * A Casting row with native data is held when the native program refused the model or an option the row gave it
 * (holdACasting in src/server/lib/casting.ts), until a person or a secretary changes or clears it. selectionOfACasting
 * in the same file refuses a held row with a 409. answer() in src/server/lib/run-models.ts asked it for the row's
 * selection whenever it answered a builder or a check on the row's program and model, so every reader of that answer
 * failed while the row was held. The Runtime page (whereRunsGo in src/server/lib/runtime.ts) and the message worker's
 * queue (GET /api/worker/queue, which src/worker/index.ts reads) answered the 409 instead of their reading. Now the
 * reader answers, gives no selection and names the hold. Only the doors that start a run refuse it, with the same 409
 * and the same sentence: the run-models door the launcher and the check tool ask, and the effort the next round's door
 * and the worker run's door record, in src/server/lib/next-round.ts.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database. Each row is written, selected
 * and held through the Casting doors as the person, against a session record this file files as the run started from
 * the row; nothing ran. The check ask in the queue is written straight into the database, as
 * tests/a-check-row-reads-only-its-own-agents-runs.test.ts writes one. The hold's sentence is read from the row's own
 * selection door, so this file copies none of its words. Every model name and effort is made up for each run.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - answer() lets the hold's 409 through again: the Runtime page's and the queue's cases go red on the 409.
 *   - the run-models door answers a held row without the 409: the three door cases go red on a 200.
 *   - answer() gives a selection to a builder and a check only: the conversation's door case goes red on a 200.
 */
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_INSPECTOR, THE_WORKER } from '../src/shared/roles.ts'
import type { CastingSelection } from '../src/shared/casting.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const INSPECTOR = 'held-inspector'
const WORKER = 'held-worker'
const BUILDER = 'held-builder'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const as = (agent: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent, 'x-mole-office-workspace': WORKSPACE })
const at = localStamp(new Date())

/** A model, its native name and an effort made up for this run. */
function unseen() {
  const key = randomUUID()
  return { model: `office-${key}`, native: `native-${key}`, effort: `effort-${key}` }
}

let t: TestDb
let app: FastifyInstance
const check = unseen()
const work = unseen()
/** The sentence each held row's own selection door refuses with. */
let checkHeld = ''
let workHeld = ''
/** Registry ids, by handle. */
const ids: Record<string, string> = {}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}

/** THE ROW IN FORCE FOR `role`, every project, written as the person, naming `made` on claude-code with native data. Its id. */
async function aRow(role: string, made: ReturnType<typeof unseen>): Promise<number> {
  const reply = await call('POST', `/api/casting/${role}`, AS_THE_PERSON, {
    program: { value: 'claude-code' }, model: { value: made.model }, effort: { value: made.effort }, native: { model: made.native, provider: null, variant: null },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { casting: { id: number } }).casting.id
}

/**
 * HOLD THE ROW as a native refusal holds it: a session record names the row's selection as the one it was started with,
 * and the refusal is reported for that run as the person. Gives back the sentence the row's selection door now refuses
 * with, which is the sentence lib/casting.ts makes for the hold.
 */
async function hold(id: number, servingAgent: string): Promise<string> {
  const read = await call('GET', `/api/casting/rows/${String(id)}/selection`, AS_THE_PERSON)
  expect(read.statusCode, read.body).toBe(200)
  const selection = (read.json() as { selection: CastingSelection }).selection
  const run = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'Synthetic: a run started from a held row', data: {
    runtime: selection.runtime, model: selection.model, servingAgent, state: 'running', extra: { launcherSelection: selection },
  } })
  expect(run.statusCode, run.body).toBe(201)
  const refusal = { kind: 'model', code: 'model_not_found', said: 'Synthetic: the native program refused the selected model.' }
  const held = await call('POST', `/api/casting/rows/${String(id)}/hold`, AS_THE_PERSON, { revision: selection.casting!.revision, run: (run.json() as { record: { id: string } }).record.id, refusal })
  expect(held.statusCode, held.body).toBe(200)
  const refused = await call('GET', `/api/casting/rows/${String(id)}/selection`, AS_THE_PERSON)
  expect(refused.statusCode, refused.body).toBe(409)
  const says = (refused.json() as { error: string }).error
  expect(says).not.toBe('')
  return says
}

/** A check the office asked of the inspector, of a finished run, not started yet, with its delivery queued. Its message and run. */
function aCheckAsked(): { message: string; run: string } {
  const message = `synthetic-check-ask-${randomUUID()}`
  const run = `synthetic-checked-run-${randomUUID()}`
  const insert = t.client.sqlite.prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin)
    VALUES (?, ?, ?, ?, ?, ?, 'A made-up record', ?, 'fixture')`)
  insert.run(message, 'message-centre', THE_PERSON, at, at, 'message', JSON.stringify({ body: 'A made-up check ask.', sentBy: { kind: 'agent', id: 'mole-office' }, to: [{ kind: 'agent', id: ids[INSPECTOR] }], aboutRun: run, writtenIn: { project: WORKSPACE } }))
  insert.run(run, WORKSPACE, THE_PERSON, at, at, 'session', JSON.stringify({ state: 'finished', servingAgent: BUILDER, theCheck: { message, askedOf: INSPECTOR, askedAt: at, checkout: {}, says: 'A made-up check request.' } }))
  t.client.sqlite.prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, 'queued', ?)")
    .run(`synthetic-delivery-${randomUUID()}`, message, ids[INSPECTOR], at)
  return { message, run }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, role] of [[INSPECTOR, THE_INSPECTOR], [WORKER, THE_WORKER], [BUILDER, THE_WORKER]] as const) {
    const made = await call('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role, runtime: 'claude-code', workArea: ['src'] })
    expect(made.statusCode, made.body).toBe(201)
  }
  const listed = (await call('GET', '/api/participants', AS_THE_PERSON)).json() as { agents: { id: string; handle: string }[] }
  for (const handle of [INSPECTOR, WORKER, BUILDER]) ids[handle] = one(listed.agents.filter((agent) => agent.handle === handle), `the registry row of ${handle}`).id
  // THE WORKER'S OWN MODEL IS ITS ROW'S, so a builder and a conversation of it are both answered from that row.
  const own = await call('POST', `/api/office/run-models/agent/${WORKER}`, AS_THE_PERSON, { model: work.model })
  expect(own.statusCode, own.body).toBe(200)
  checkHeld = await hold(await aRow(THE_INSPECTOR, check), INSPECTOR)
  workHeld = await hold(await aRow(THE_WORKER, work), WORKER)
}, 60_000)
afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a held Casting row is read, and names its hold', () => {
  // MUTATION: answer() lets the hold's 409 through again; red on the thrown refusal.
  it("the Runtime page answers, and names the hold for the check's place and the worker's builder place", async () => {
    const { whereRunsGo } = await import('../src/server/lib/runtime.ts')
    const places = whereRunsGo().places
    const forCheck = one(places.filter((place) => place.placeSaid.code === 'placeCheck'), "the check's place")
    expect(forCheck.model.name).toBe(check.model)
    expect(forCheck.model.from).toContain(checkHeld)
    // The hold's sentence has no code, so the page draws the English as it came.
    expect(forCheck.model.fromSaid).toBeNull()
    const forWorker = one(places.filter((place) => place.placeSaid.code === 'placeBuilder' && place.placeSaid.values.card === THE_WORKER), "the worker's builder place")
    expect(forWorker.model.name).toBe(work.model)
    expect(forWorker.model.from).toContain(workHeld)
    expect(forWorker.model.fromSaid).toBeNull()
  })

  // MUTATION: answer() lets the hold's 409 through again; red on the 409.
  it('the message worker reads its queue, in both forms the worker process reads, with a check asked of the held inspector', async () => {
    const asked = aCheckAsked()
    for (const url of ['/api/worker/queue', '/api/worker/queue?only=checks&markDelivered=1']) {
      const reply = await call('GET', url, as(THE_MESSAGE_WORKER_ID))
      expect(reply.statusCode, `${url}: ${reply.body.slice(0, 400)}`).toBe(200)
      const rows = (reply.json() as { queue: { messageId: string; inspection?: { run: string; model?: string } }[] }).queue
      const row = one(rows.filter((queued) => queued.messageId === asked.message), `the check row in ${url}`)
      expect(row.inspection, url).toMatchObject({ run: asked.run, model: check.model })
    }
  })
})

describe('a held Casting row stops every start', () => {
  async function refused(agent: string, query: string, says: string): Promise<void> {
    const reply = await call('GET', `/api/office/run-models/for/${agent}?${query}`, as(agent))
    expect(reply.statusCode, reply.body).toBe(409)
    expect((reply.json() as { error: string }).error).toBe(says)
  }

  // MUTATION: the door answers a held row without the 409; red on a 200.
  it("the run-models door refuses a check on the inspector's held row with a 409 and the hold's sentence", async () => {
    await refused(INSPECTOR, 'place=check', checkHeld)
  })

  // MUTATION: the door answers a held row without the 409; red on a 200.
  it("the run-models door refuses a builder on the worker's held row with a 409 and the hold's sentence", async () => {
    await refused(WORKER, 'place=builder&runtime=claude-code', workHeld)
  })

  // MUTATION: the door answers a held row without the 409, or answer() gives a selection to a builder and a check only;
  // red on a 200 either way.
  it("the run-models door refuses a conversation on the worker's held row with a 409 and the hold's sentence", async () => {
    await refused(WORKER, `place=conversation&runtime=claude-code&model=${encodeURIComponent(work.model)}`, workHeld)
  })

  it("the effort the next round's door and the worker run's door record is refused on the held row with the same 409 and sentence", async () => {
    const { theEffortTheLauncherIsAnswered } = await import('../src/server/lib/next-round.ts')
    let thrown: unknown = null
    try {
      theEffortTheLauncherIsAnswered({ agentId: ids[WORKER]!, handle: WORKER, runtime: 'claude-code', model: work.model, project: WORKSPACE })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as { status?: number }).status).toBe(409)
    expect((thrown as Error).message).toBe(workHeld)
  })
})
