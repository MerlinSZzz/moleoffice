// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONVERSATION IS GIVEN ITS CASTING ROW'S SELECTION, UNDER THE BUILDER'S RULE.
 *
 * The owner's goal is that any model, variant and thinking level works with no code change. A Casting row may carry
 * native data, and the office gives a builder and a check the row's selection when the run's program and model are the
 * row's. Before this change a conversation was never given it. A conversation's model comes from the agent's own
 * record, then the Settings page, then .env, and the agent's own record may name the row's program and model. The
 * launcher then had no selection, looked the model up in src/config/launcher-model-compatibility.json, and refused every
 * model that list does not name before anything started. Now GET /api/office/run-models/for/<agent>?place=conversation
 * gives the row's selection under the builder's rule: the rolled row if it names the run's program and model, else the
 * row in force, and only when that row's program and model are the run's. Where a conversation's model comes from is
 * unchanged.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, and every row and model is
 * written through its doors as the person. The launcher's aCommandsStartFromTheOffice in tools/sandbox-common.mjs, which
 * startModelRun in src/worker/runtimes/common.ts calls for every conversation, reaches the office through a relay this
 * file starts on a free port. The relay hands each request to the same server in this process and gives back its answer
 * unchanged. No program is started and no model runs: the case reads the command and the start values the launcher works
 * out. Every model name and effort is made up for each run, and the test checks that the compatibility list names none of
 * them before it relies on that.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED: answer() in src/server/lib/run-models.ts gives a selection to a builder and a
 * check only. The first case goes red on the office's answer, and the second on the launcher's refusal.
 */
import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import type { TheModelARunGets } from '../src/shared/run-models.ts'
import { aCommandsStartFromTheOffice } from '../tools/sandbox-common.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AGENT = 'conversing-one'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const AS_THE_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT, 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance
let relay: Server
let api = ''
/** Every path the launcher asked the relay for, in order. */
const asked: string[] = []

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: AGENT, name: 'Conversing One', role: THE_WORKER, runtime: 'claude-code', workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  // THE RELAY: the launcher asks over HTTP, and this server answers only through inject. Only the office's own headers go on.
  relay = createServer((request, response) => {
    asked.push(request.url ?? '')
    const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => name.startsWith('x-mole-office-'))) as Record<string, string>
    void app.inject({ method: request.method as 'GET', url: request.url ?? '/', headers }).then((reply) => {
      response.writeHead(reply.statusCode, { 'content-type': 'application/json' })
      response.end(reply.body)
    })
  })
  await new Promise<void>((done) => relay.listen(0, '127.0.0.1', done))
  api = `http://127.0.0.1:${String((relay.address() as AddressInfo).port)}`
})
afterAll(async () => {
  await new Promise<void>((done) => relay.close(() => done()))
  await app.close()
  t.close()
})

/** A model, its native name and an effort made up for this run, none of which the compatibility list names. */
function unseen() {
  const key = randomUUID()
  const made = { model: `office-${key}`, native: `native-${key}`, effort: `effort-${key}` }
  const listed = LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string>; startValues: Record<string, unknown> }
  for (const name of [made.model, made.native]) expect(listed.aliases[name] ?? listed.startValues[name]).toBeUndefined()
  return made
}

/** THE WORKER CARD'S ROW IN FORCE, written as the person, naming `made` on `program` with native data. Its id. */
async function theWorkersRow(program: 'claude-code' | 'codex', made: ReturnType<typeof unseen>): Promise<number> {
  const row = { program: { value: program }, model: { value: made.model }, effort: { value: made.effort }, native: { model: made.native, provider: null, variant: null } }
  const taken = (await app.inject({ method: 'GET', url: `/api/casting/for/${THE_WORKER}?project=${WORKSPACE}`, headers: AS_THE_PERSON })).json() as { casting: { id: number } | null }
  const written = taken.casting === null
    ? await app.inject({ method: 'POST', url: `/api/casting/${THE_WORKER}`, headers: AS_THE_PERSON, payload: row })
    : await app.inject({ method: 'PATCH', url: `/api/casting/rows/${String(taken.casting.id)}`, headers: AS_THE_PERSON, payload: row })
  expect([200, 201], written.body).toContain(written.statusCode)
  return (written.json() as { casting: { id: number } }).casting.id
}

/** The agent's own model, set on its profile as the person sets it. Its runtime is the one it was registered with. */
async function theAgentsOwnModel(model: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: `/api/office/run-models/agent/${AGENT}`, headers: AS_THE_PERSON, payload: { model } })
  expect(reply.statusCode, reply.body).toBe(200)
}

/** What the row's own selection door answers, which is what the launcher checks a selection against. */
async function theRowsSelection(id: number): Promise<unknown> {
  const reply = await app.inject({ method: 'GET', url: `/api/casting/rows/${String(id)}/selection`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { selection: unknown }).selection
}

async function forAConversation(query: string): Promise<TheModelARunGets> {
  const reply = await app.inject({ method: 'GET', url: `/api/office/run-models/for/${AGENT}?place=conversation&${query}`, headers: AS_THE_AGENT })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as TheModelARunGets
}

/** The value after `flag`, where the command has it once; it fails the case when the flag is missing or repeated. */
function theOne(command: string[], flag: string): string | undefined {
  expect(command.filter((word) => word === flag), `${flag} in ${JSON.stringify(command)}`).toHaveLength(1)
  return command[command.indexOf(flag) + 1]
}

describe("a conversation is given its Casting row's selection, under the builder's rule", () => {
  // MUTATION: answer() gives a selection to a builder and a check only; red on the selection.
  it("gives a conversation on the row's program and model the row's selection, and its model still comes from the agent's own record", async () => {
    const made = unseen()
    const id = await theWorkersRow('claude-code', made)
    await theAgentsOwnModel(made.model)
    const exact = await theRowsSelection(id)
    expect(exact).toMatchObject({ runtime: 'claude-code', model: made.model, native: { model: made.native, effort: made.effort }, casting: { id } })

    // AS THE MESSAGE WORKER ASKS, with no model, and as the launcher asks, with the model its command names.
    const unnamed = await forAConversation('runtime=claude-code')
    expect(unnamed.selection).toEqual(exact)
    expect(unnamed).toMatchObject({ runtime: 'claude-code', model: made.model, from: 'the agent' })
    const named = await forAConversation(`runtime=claude-code&model=${encodeURIComponent(made.model)}`)
    expect(named.selection).toEqual(exact)
    expect(named).toMatchObject({ runtime: 'claude-code', model: made.model, from: 'the caller' })
  })

  // MUTATION: answer() gives a selection to a builder and a check only; red on the launcher's refusal of an unlisted model.
  it("starts a conversation through the launcher on the row's native model and effort, and is not refused", async () => {
    const made = unseen()
    const id = await theWorkersRow('claude-code', made)
    await theAgentsOwnModel(made.model)
    asked.length = 0
    // THE COMMAND A CLAUDE CODE CONVERSATION STARTS WITH, as ClaudeCodeAdapter.commandFor in src/worker/runtimes/claude-code.ts
    // begins it: the guard's and the permissions' words that follow name no model and no effort, so they are left out.
    const given = await aCommandsStartFromTheOffice(['claude', '-p', 'Synthetic: a made-up message.', '--output-format', 'json', '--model', made.model], {
      api, agent: AGENT, workspace: WORKSPACE, runtime: 'claude-code', env: {}, place: 'conversation', headers: AS_THE_AGENT,
    })
    const command = given.command as string[]
    expect(theOne(command, '--model')).toBe(made.native)
    expect(theOne(command, '--effort')).toBe(made.effort)
    expect(command).not.toContain(made.model)
    expect((given.start as { selection?: { casting: { id: number } | null } } | null)?.selection?.casting?.id).toBe(id)
    // It asked as a conversation, and checked the row's selection again before it started.
    expect(asked[0]).toMatch(new RegExp(`^/api/office/run-models/for/${AGENT}\\?place=conversation&`))
    expect(asked.some((path) => path.startsWith(`/api/casting/rows/${String(id)}/selection?revision=`)), JSON.stringify(asked)).toBe(true)
  })

  it("gives no selection to a conversation whose model or whose program is not the row's", async () => {
    const made = unseen()
    await theWorkersRow('claude-code', made)
    const other = unseen()
    await theAgentsOwnModel(other.model)
    const otherModel = await forAConversation('runtime=claude-code')
    expect(otherModel).toMatchObject({ runtime: 'claude-code', model: other.model, from: 'the agent' })
    expect(otherModel).not.toHaveProperty('selection')

    await theWorkersRow('codex', made)
    await theAgentsOwnModel(made.model)
    const otherProgram = await forAConversation('runtime=claude-code')
    expect(otherProgram).toMatchObject({ runtime: 'claude-code', model: made.model, from: 'the agent' })
    expect(otherProgram).not.toHaveProperty('selection')
  })
})
