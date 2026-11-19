// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MODEL READER READS AN AGENT'S ROLE WITHOUT READING ITS RUNTIME (wave 13y round 44).
 *
 * `theModelARunGets` asks `theCardOf` for the card an agent holds. `theCardOf` asked
 * `readParticipant` for the whole participant and used only its `role`; building that participant
 * ran a second statement for the record's runtime, which the card does not need. The change reads
 * the role from the same kept agent-row statement `readParticipant` already reads, through the
 * same reader of the row's role column.
 *
 * ROUND 47 OF WAVE 13Y READS THE AGENT'S RECORDS ONCE PER ANSWER. `answer` asked
 * `theModelOnTheAgentRecord` for the agent, and so did `modelAnswer`, which `answer` calls: two runs
 * of the same statement for the same agent in one call, with nothing written between them. Now
 * `answer` reads once and hands the result to `modelAnswer`. Case 2 counts that, and cases 4 and 5
 * show the answer is the same and is not kept from one answer to the next.
 *
 * Five cases:
 *
 * 1. THE ANSWER. `theModelARunGets` gives the same answer for an agent's own model, the Settings
 *    page's choice, a Casting row for a builder and for a check, nothing set at all, an agent with
 *    no role, an agent whose role names a card the declaration does not have, and no agent row.
 *    `theCardOfAgent` and `readParticipant` keep their own answers on the same rows. These hold on
 *    the old code too.
 * 2. THE COST. Twenty-five reads of the model a run gets run the runtime read once each. This case
 *    was 75 before round 44, when `theCardOf` ran the statement once more through `readParticipant`,
 *    and 50 before round 47, when `modelAnswer` and `answer` each ran it.
 * 3. NOTHING IS KEPT. The agent's role is changed between two calls, and the second answer names
 *    the second role's Casting row. This holds on the old code too; it turns red if a change keeps
 *    the role between calls.
 * 4. THE SAME ANSWER AS BEFORE ROUND 47. Every kind of ask the two runs fed, for agents with an own
 *    model on the run's runtime, an own model for another runtime on an older record, no model, an
 *    effort and no model, and no agent at all, digests to what it digested at the commit before the
 *    change (95cadff28), except that a Codex run answering a message with no model named now takes its
 *    agent's Casting row or is refused, so those answers are digested as they are now, and a refused
 *    Codex run's effort part says the run is refused. Two sentences are worded as wave 13y round 121
 *    rewrote them: a setting not set is "MOLE_OFFICE_AGENT_MODEL is not set", not "Nobody set
 *    MOLE_OFFICE_AGENT_MODEL", and a runtime given no model is "and opencode none", not "and opencode is
 *    passed none". Ten answers of 485 hold them, and nothing else in any answer moved. The Casting row a message run's queue keeps,
 *    which wave 13n round BU added to the answer, is left out of the digest, because round 47's
 *    answers had no such field. So is the list of runtimes the message worker gives a model and an
 *    effort to, which wave 13n round BY added to an agent's reading. So is the reason an answer with no
 *    selection says it has none, which wave 13n's round of 5 November 2026 added to the answer. The case also checks that the asks reach every
 *    place the agent's records
 *    decide something: the runtime, the model, a model passed over, the variant and the effort.
 * 5. THE RECORDS ARE NOT KEPT EITHER. The agent's own model is changed between two answers, and the
 *    second answer names the new model. This holds on the old code too; it turns red if a change
 *    keeps the records from one answer to the next.
 *
 * Every row and every choice here is synthetic, in this file's own temporary test database.
 */
import { createHash } from 'node:crypto'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS } from '../src/shared/roles.ts'
import { NO_MODEL_SAYS } from '../src/config/agent-model.mjs'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': WORKSPACE })
/** The one statement `runtimeOfTheAgentRecord` and `theModelOnTheAgentRecord` read. */
const THE_RUNTIME_READ = "json_extract(r.data, '$.runtime')"
/** An empty world, so this checkout's `.env` cannot answer for the model layer. */
const NO_WORLD = {}

let t: TestDb
let app: FastifyInstance
let runModels: typeof import('../src/server/lib/run-models.ts')
let participants: typeof import('../src/server/lib/participants.ts')
let agentId = ''
/** Every statement executed while `counting` is set, by its SQL text. */
let counting = false
const ran: string[] = []

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const reply = await call('POST', '/api/agents/started', headers, payload)
  expect(reply.statusCode, reply.body).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(payload['handle']) as { id: string }
  return row.id
}

async function setAgent(agent: string, model: string | null): Promise<void> {
  const reply = await call('POST', `/api/office/run-models/agent/${agent}`, PERSON, { model })
  expect(reply.statusCode, reply.body).toBe(200)
}

async function setOffice(change: unknown): Promise<void> {
  const reply = await call('POST', '/api/office/run-models', PERSON, change)
  expect(reply.statusCode, reply.body).toBe(200)
}

/** Set one role's marked every-project casting, adding the first or changing the marked one. */
async function cast(role: string, program: string | null, model: string | null, effort?: string | null): Promise<void> {
  const marked = ((await call('GET', `/api/casting/for/${role}`, PERSON)).json() as { casting: { id: number } | null }).casting
  const cells = { program: { value: program }, model: { value: model }, ...(effort === undefined ? {} : { effort: { value: effort } }) }
  const reply =
    marked === null
      ? await call('POST', `/api/casting/${role}`, PERSON, cells)
      : await call('PATCH', `/api/casting/rows/${String(marked.id)}`, PERSON, cells)
  expect(reply.statusCode, reply.body).toBe(marked === null ? 201 : 200)
}

function read(asked: { place: 'conversation' | 'builder' | 'check'; agentId: string | null; runtime: string | null }) {
  return runModels.theModelARunGets(asked, NO_WORLD)
}

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE COUNTER GOES IN BEFORE THE SERVER IS BUILT, so every statement it prepares is wrapped.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['get', 'all', 'run'] as const) {
      const original = statement[method] as (...args: unknown[]) => unknown
      statement[method] = function (this: unknown, ...args: unknown[]) {
        if (counting) ran.push(text)
        return original.apply(this, args)
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  runModels = await import('../src/server/lib/run-models.ts')
  participants = await import('../src/server/lib/participants.ts')
  await register(PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary', runtime: 'claude-code' })
  agentId = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'role-reader', name: 'A role reader', role: 'worker', runtime: 'claude-code', workArea: ['src'] })
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

it('gives the same answer for every layer and every shape of agent row', async () => {
  // a. THE AGENT'S OWN MODEL.
  await setAgent('role-reader', 'the-agents-own-model')
  expect(read({ place: 'conversation', agentId, runtime: 'claude-code' })).toMatchObject({
    model: 'the-agents-own-model',
    from: 'the agent',
    runtime: 'claude-code',
  })
  expect(read({ place: 'builder', agentId, runtime: 'claude-code' })).toMatchObject({ model: 'the-agents-own-model', from: 'the agent' })

  // b. THE SETTINGS PAGE'S CHOICE FOR A CONVERSATION.
  await setAgent('role-reader', null)
  await setOffice({ places: { conversation: { runtime: 'claude-code', model: 'the-settings-model' } } })
  expect(read({ place: 'conversation', agentId, runtime: null })).toMatchObject({
    model: 'the-settings-model',
    from: 'the place',
    runtime: 'claude-code',
  })

  // c. A CASTING ROW FOR A BUILDER AND FOR A CHECK. The row's declared card is a worker, so the
  // worker Casting row is taken, and `theCardOfAgent` answers the row's own role word.
  await setOffice({ places: { conversation: null } })
  await cast('worker', 'claude-code', 'the-worker-model')
  await cast('inspector', 'claude-code', 'the-check-model')
  expect(participants.theCardOfAgent(agentId)).toBe('worker')
  expect(read({ place: 'builder', agentId, runtime: 'claude-code' })).toMatchObject({
    model: 'the-worker-model',
    from: 'the role',
    runtime: 'claude-code',
  })
  const check = read({ place: 'check', agentId, runtime: null })
  expect(check).toMatchObject({ model: 'the-check-model', from: 'the role', runtime: 'claude-code' })
  expect(check.says).toContain('for inspector')

  // d. NOTHING SET AT ALL.
  t.client.sqlite.prepare('DELETE FROM casting_rows').run()
  t.client.sqlite.prepare('DELETE FROM run_models').run()
  const nothing = read({ place: 'conversation', agentId, runtime: 'claude-code' })
  expect(nothing).toMatchObject({ model: null, from: 'none' })
  expect(nothing.says).toContain(NO_MODEL_SAYS.conversation)

  // e. AN AGENT WITH NO ROLE ON ITS ROW. Such a row reads as a worker, so the worker Casting row
  // is taken, and `theCardOfAgent` names the worker card.
  await cast('worker', 'claude-code', 'the-worker-model')
  t.client.sqlite.prepare('UPDATE agents SET role = NULL WHERE id = ?').run(agentId)
  expect(read({ place: 'builder', agentId, runtime: 'claude-code' })).toMatchObject({ model: 'the-worker-model', from: 'the role' })
  expect(participants.theCardOfAgent(agentId)).toBe(A_ROW_WITH_NO_ROLE_READS_AS)
  expect(participants.readParticipant({ kind: 'agent', id: agentId })).toMatchObject({ role: null, runtime: 'claude-code' })

  // f. A ROLE THAT NAMES A CARD THE DECLARATION DOES NOT HAVE. It is not the worker, so the worker
  // Casting row is not taken, and `theCardOfAgent` still answers the word as stored.
  const undeclared = 'a-card-the-declaration-does-not-have'
  t.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run(undeclared, agentId)
  expect(read({ place: 'builder', agentId, runtime: 'claude-code' })).toMatchObject({ model: null, from: 'none' })
  expect(participants.theCardOfAgent(agentId)).toBe(undeclared)
  expect(participants.readParticipant({ kind: 'agent', id: agentId })).toMatchObject({ role: undeclared })

  // g. NO AGENT ROW AT ALL.
  expect(participants.readParticipant({ kind: 'agent', id: 'no-agent-has-this-id' })).toBeNull()
  expect(participants.theCardOfAgent('no-agent-has-this-id')).toBeNull()
  expect(read({ place: 'conversation', agentId: 'no-agent-has-this-id', runtime: 'claude-code' })).toMatchObject({ model: null, from: 'none' })

  t.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run('worker', agentId)
}, 60_000)

it('runs the runtime read once for each of twenty-five reads', () => {
  ran.length = 0
  counting = true
  try {
    for (let i = 0; i < 25; i++) read({ place: 'conversation', agentId, runtime: 'claude-code' })
  } finally {
    counting = false
  }
  // `answer` runs `theModelOnTheAgentRecord` once and hands its result to `modelAnswer`, and the card
  // read runs no runtime statement. Before round 44 this count was 75, and before round 47 it was 50.
  expect(ran.filter((sql) => sql.includes(THE_RUNTIME_READ)).length).toBe(25)
}, 60_000)

it('reads the role from the row afresh between two calls', async () => {
  await cast('worker', 'claude-code', 'the-first-role-model')
  t.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run('worker', agentId)
  expect(read({ place: 'builder', agentId, runtime: 'claude-code' })).toMatchObject({ model: 'the-first-role-model', from: 'the role' })

  await cast('supervisor', 'claude-code', 'the-second-role-model')
  t.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run('supervisor', agentId)
  expect(read({ place: 'builder', agentId, runtime: 'claude-code' })).toMatchObject({ model: 'the-second-role-model', from: 'the role' })
  expect(participants.theCardOfAgent(agentId)).toBe('supervisor')

  t.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run('worker', agentId)
}, 60_000)

/** The live records of one agent, newest first, in the order `theModelOnTheAgentRecord` reads them. */
function recordsOf(agent: string): string[] {
  return (
    t.client.sqlite
      .prepare('SELECT r.id AS id FROM agent_records m JOIN records r ON r.id = m.record_id WHERE m.agent_id = ? AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC')
      .all(agent) as { id: string }[]
  ).map((one) => one.id)
}

/** Write the runtime, model and variant onto one stored agent record, as the record kind keeps them. */
function storeOn(record: string, fields: { runtime?: string; model?: string; variant?: string }): void {
  for (const [name, value] of Object.entries(fields)) {
    t.client.sqlite.prepare(`UPDATE records SET data = json_set(data, '$.${name}', ?) WHERE id = ?`).run(value, record)
  }
}

/** The agents of cases 4 and 5 by their handles, filled by case 4. */
const shaped = new Map<string, string>()

it('gives every kind of ask the same answer as before round 47', async () => {
  t.client.sqlite.prepare('DELETE FROM casting_rows').run()
  t.client.sqlite.prepare('DELETE FROM run_models').run()
  await cast('worker', 'claude-code', 'claude-worker-model', 'low')
  await cast('inspector', 'claude-code', 'claude-check-model', 'max')
  await setOffice({ places: { conversation: { runtime: 'opencode', model: 'opencode-go/the-settings-model' } } })
  const made = await call('POST', '/api/workspaces', PERSON, { id: 'second-project', title: 'Second project' })
  expect(made.statusCode, made.body).toBeLessThan(300)

  // AN OWN MODEL AND EFFORT ON THE RUN'S RUNTIME.
  const ownHere = await register(PERSON, { handle: 'own-here', name: 'Own here', role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  storeOn(recordsOf(ownHere)[0]!, { model: 'claude-own-model', variant: 'high' })
  // AN OWN MODEL FOR ANOTHER RUNTIME, ON AN OLDER RECORD. The newer record, from a second project, names claude-code
  // and no model, so the runtime is the newer record's and the model and the runtime it is for are the older one's.
  const ownElsewhere = await register(PERSON, { handle: 'own-elsewhere', name: 'Own elsewhere', role: 'worker', runtime: 'opencode', workArea: ['src'] })
  storeOn(recordsOf(ownElsewhere)[0]!, { model: 'opencode-go/own-model', variant: 'max' })
  const second = await call('POST', '/api/agents/started', { ...PERSON, 'x-mole-office-workspace': 'second-project' }, { handle: 'own-elsewhere', name: 'Own elsewhere', role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  expect(second.statusCode, second.body).toBe(201)
  const both = recordsOf(ownElsewhere)
  expect(both).toHaveLength(2)
  storeOn(both[0]!, { runtime: 'claude-code' })
  // NO MODEL, ON CODEX.
  const noModel = await register(PERSON, { handle: 'no-model', name: 'No model', role: 'worker', runtime: 'codex', workArea: ['src'] })
  // AN EFFORT AND NO MODEL: the record is one that names something, and no model is read from it.
  const effortOnly = await register(PERSON, { handle: 'effort-only', name: 'Effort only', role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  storeOn(recordsOf(effortOnly)[0]!, { variant: 'high' })
  for (const [handle, id] of [['own-here', ownHere], ['own-elsewhere', ownElsewhere], ['no-model', noModel], ['effort-only', effortOnly]] as const) shaped.set(handle, id)

  const agents: [string, string][] = [...shaped.entries(), ['no-such-agent', 'no-agent-has-this-id']]
  const answers: unknown[] = []
  for (const [label, id] of agents) {
    for (const place of ['conversation', 'builder', 'check'] as const) {
      for (const runtime of [null, 'claude-code', 'opencode', 'codex']) {
        for (const model of [undefined, 'claude-own-model', 'opencode-go/own-model', 'gpt-6.1-sol']) {
          for (const project of [null, WORKSPACE]) {
            const asked = { place, agentId: id, runtime, model, project }
            answers.push({ label, place, runtime, model: model ?? null, project, answer: runModels.theModelARunGets(asked, NO_WORLD) })
          }
        }
      }
    }
    answers.push({ label, agentsRunModel: runModels.anAgentsRunModel(id, NO_WORLD) })
  }

  // THE ASKS REACH EVERY PLACE THE AGENT'S RECORDS DECIDE SOMETHING, so the digest below covers them.
  type One = { label: string; place: string; answer?: { runtime: string | null; runtimeSays: string; from: string; variant: string | null; effortFrom?: string; says: string } }
  const asked = (answers as One[]).filter((one) => one.answer !== undefined)
  const where = {
    runtimeFromTheRecord: asked.filter((one) => one.answer!.runtimeSays === "The agent's own record names it.").length,
    modelFromTheAgent: asked.filter((one) => one.answer!.from === 'the agent').length,
    modelPassedOver: asked.filter((one) => one.answer!.says.includes("This agent's own model, opencode-go/own-model, is for opencode")).length,
    variantFromTheAgent: asked.filter((one) => one.label === 'own-elsewhere' && one.place === 'conversation' && one.answer!.variant === 'max').length,
    effortFromTheAgent: asked.filter((one) => one.answer!.effortFrom === 'the agent').length,
  }
  for (const [name, count] of Object.entries(where)) expect(count, name).toBeGreaterThan(0)

  // THE DIGEST. The agents' ids are made afresh for each run of the file, and a Casting row's id counts the rows the
  // earlier cases wrote, so each is replaced by what it names before the answers are digested. The Casting row a message
  // run's queue keeps (`kept`, wave 13n round BU) is left out, because the answers before round 47 had no such field, and
  // so are the runtimes the message worker gives a model and an effort to (`theWorkerGives`, wave 13n round BY) and
  // the reason an answer has no selection (`noSelection`, wave 13n, 5 November 2026).
  const castingRoles = new Map((t.client.sqlite.prepare('SELECT id, role FROM casting_rows').all() as { id: number; role: string }[]).map((row) => [row.id, row.role]))
  let text = JSON.stringify(answers, (key, value: unknown) =>
    key === 'kept' || key === 'theWorkerGives' || key === 'noSelection' ? undefined
      : key === 'casting' && value !== null && typeof value === 'object' ? { ...(value as object), id: castingRoles.get((value as { id: number }).id) ?? 'no such row' } : value,
  )
  for (const [label, id] of agents) text = text.split(id).join(label)
  expect(answers).toHaveLength(5 * (3 * 4 * 4 * 2 + 1))
  expect(createHash('sha256').update(text).digest('hex').slice(0, 24)).toBe('8d7c68862838e7219f7bbff7')
}, 60_000)

it("reads the agent's own model afresh between two answers", () => {
  const ownHere = shaped.get('own-here')!
  expect(read({ place: 'builder', agentId: ownHere, runtime: 'claude-code' })).toMatchObject({ model: 'claude-own-model', from: 'the agent', effort: 'high' })
  storeOn(recordsOf(ownHere)[0]!, { model: 'claude-own-model-changed', variant: 'low' })
  expect(read({ place: 'builder', agentId: ownHere, runtime: 'claude-code' })).toMatchObject({ model: 'claude-own-model-changed', from: 'the agent', effort: 'low' })
}, 60_000)
