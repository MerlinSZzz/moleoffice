// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENT'S OWN EFFORT GOES INTO ITS CASTING ROW'S SELECTION, AND THE ANSWER NAMES BOTH EFFORTS.
 *
 * The owner's goal is that any model, variant and thinking level works from data, with no code change. When a run's
 * model is the agent's own model and a Casting row names it, the office's answer gives the run the agent's own effort
 * and the row's selection. The launcher applies only the selection. Before this change the selection carried the row's
 * effort, so the run started at the row's effort while the answer said it got the agent's, and nothing said that the
 * agent's effort was dropped.
 *
 * THE RULE NOW. The selection carries the agent's own effort. An OpenCode row's variant is replaced with it as well,
 * because OpenCode carries one variant option. When the two efforts are equal nothing changes. When they differ, the
 * answer's sentence names the agent's effort and the row's. A row that sets no effort gets the agent's effort, and the
 * sentence is the one for the agent's own effort, because nothing was replaced.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database. Every Casting row and the
 * OpenCode agent's own model and variant are written through the office's doors as the person. The office refuses a
 * variant for a Codex agent, so the Codex case writes it into the agent's record with SQL, as an older office stored it.
 * Every model name, native name, provider and effort is made up for each run, and the test checks that the compiled list
 * names none of them. No program is started and no model runs.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED: answer() in src/server/lib/run-models.ts gives the row's own selection again.
 * The three cases with a different effort go red on the selection.
 */
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { inEnglish, saying } from '../src/shared/dev-sayings.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import type { TheModelARunGets } from '../src/shared/run-models.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const OPENCODE = 'own-effort-into-opencode'
const CODEX = 'own-effort-into-codex'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const asThe = (handle: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': WORKSPACE })
const LISTED = LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string>; startValues: Record<string, { effort: string | null }> }

type ParticipantsLib = typeof import('../src/server/lib/participants.ts')
type Selection = { runtime: string; model: string; native: { model: string; provider: string | null; variant: string | null; effort: string | null }; casting: { id: number; revision: string } }

let t: TestDb
let app: FastifyInstance
let participants: ParticipantsLib
const ids: Record<string, string> = {}

beforeAll(async () => {
  t = await freshDb()
  participants = await import('../src/server/lib/participants.ts')
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, runtime] of [[OPENCODE, 'opencode'], [CODEX, 'codex']] as const) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role: THE_WORKER, runtime, workArea: ['src'] } })
    expect(made.statusCode, made.body).toBe(201)
  }
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents: { id: string; handle: string }[] }
  for (const handle of [OPENCODE, CODEX]) ids[handle] = one(listed.agents.filter((agent) => agent.handle === handle), `${handle}'s registry row`).id
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** A model, a native name, a provider and two efforts made up for this run, none of which the compiled list names. */
function unseen() {
  const key = randomUUID()
  const made = { model: `office-${key}`, native: `native-${key}`, provider: `provider-${key}`, effort: `row-effort-${key}`, own: `own-effort-${key}` }
  for (const name of [made.model, made.native, `${made.provider}/${made.native}`]) expect(LISTED.aliases[name] ?? LISTED.startValues[name]).toBeUndefined()
  const efforts = Object.values(LISTED.startValues).map((value) => value.effort)
  for (const effort of [made.effort, made.own]) expect(efforts).not.toContain(effort)
  return made
}

/** The worker card's one Casting row, written by the person after every row is deleted. A null effort leaves the cell empty. Its id. */
async function theWorkersRow(row: { program: string; model: string; effort: string | null; native: { model: string; provider: string | null; variant: string | null } }): Promise<number> {
  t.client.sqlite.prepare('DELETE FROM casting_rows').run()
  const reply = await app.inject({ method: 'POST', url: `/api/casting/${THE_WORKER}`, headers: AS_THE_PERSON, payload: {
    program: { value: row.program }, model: { value: row.model }, ...(row.effort === null ? {} : { effort: { value: row.effort } }), native: row.native,
  } })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { casting: { id: number } }).casting.id
}

/** What the row's own selection door answers, which is what the launcher checks a selection against. */
async function theRowsSelection(id: number): Promise<Selection> {
  const reply = await app.inject({ method: 'GET', url: `/api/casting/rows/${String(id)}/selection`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { selection: Selection }).selection
}

/** The OpenCode agent's own model and variant, set on its profile as the person sets them. */
async function theOpenCodeAgentsOwn(model: string, variant: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: `/api/office/run-models/agent/${OPENCODE}`, headers: AS_THE_PERSON, payload: { model, variant } })
  expect(reply.statusCode, reply.body).toBe(200)
}

/** The Codex agent's own model, set as the person sets it, and its variant written into the same record with SQL. */
async function theCodexAgentsOwn(model: string, variant: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: `/api/office/run-models/agent/${CODEX}`, headers: AS_THE_PERSON, payload: { model } })
  expect(reply.statusCode, reply.body).toBe(200)
  const holder = participants.theModelOnTheAgentRecord(ids[CODEX]!)?.holding[0]
  expect(holder, "the Codex agent's record that holds its model").toBeDefined()
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.variant', ?) WHERE id = ?").run(variant, holder!)
  expect(participants.theModelOnTheAgentRecord(ids[CODEX]!)).toMatchObject({ model, variant, modelIsFor: 'codex' })
}

/** What a conversation of the agent gets, as the message worker asks, with no model named. */
async function forAConversation(handle: string, runtime: string): Promise<TheModelARunGets> {
  const reply = await app.inject({ method: 'GET', url: `/api/office/run-models/for/${handle}?place=conversation&runtime=${runtime}`, headers: asThe(handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as TheModelARunGets
}

describe("the agent's own effort goes into its Casting row's selection", () => {
  // No mutation turns this red: it is the case where nothing changes, and it holds before and after the code.
  it("gives the row's own selection when the agent's own effort is the row's effort", async () => {
    const made = unseen()
    const id = await theWorkersRow({ program: 'opencode', model: made.model, effort: made.effort, native: { model: made.native, provider: made.provider, variant: null } })
    await theOpenCodeAgentsOwn(made.model, made.effort)
    const answered = await forAConversation(OPENCODE, 'opencode')
    expect(answered.selection).toEqual(await theRowsSelection(id))
    expect(answered).toMatchObject({ model: made.model, from: 'the agent', effort: made.effort, effortFrom: 'the agent' })
    expect(answered.says).toContain(inEnglish(saying('effortFromAgent', { effort: made.effort })))
  })

  // MUTATION: answer() gives the row's own selection again; red on the selection's effort.
  it("puts a Codex agent's own effort into its row's selection in place of the row's, and names both", async () => {
    const made = unseen()
    const id = await theWorkersRow({ program: 'codex', model: made.model, effort: made.effort, native: { model: made.native, provider: null, variant: null } })
    await theCodexAgentsOwn(made.model, made.own)
    const exact = await theRowsSelection(id)
    expect(exact.native).toMatchObject({ variant: null, effort: made.effort })
    const answered = await forAConversation(CODEX, 'codex')
    expect(answered.selection).toEqual({ ...exact, native: { ...exact.native, effort: made.own } })
    expect(answered).toMatchObject({ model: made.model, from: 'the agent', effort: made.own, effortFrom: 'the agent' })
    expect(answered.says).toContain(inEnglish(saying('effortFromAgentInPlaceOfTheRow', { effort: made.own, row: String(id), rowEffort: made.effort })))
    expect(answered.says).not.toContain(inEnglish(saying('effortFromAgent', { effort: made.own })))
  })

  // MUTATION: answer() gives the row's own selection again; red on the selection's variant and effort.
  it("puts an OpenCode agent's own effort into its row's variant and effort, in place of the row's, and names both", async () => {
    const made = unseen()
    const id = await theWorkersRow({ program: 'opencode', model: made.model, effort: made.effort, native: { model: made.native, provider: made.provider, variant: made.effort } })
    await theOpenCodeAgentsOwn(made.model, made.own)
    const exact = await theRowsSelection(id)
    expect(exact.native).toMatchObject({ variant: made.effort, effort: made.effort })
    const answered = await forAConversation(OPENCODE, 'opencode')
    expect(answered.selection).toEqual({ ...exact, native: { ...exact.native, variant: made.own, effort: made.own } })
    expect(answered).toMatchObject({ effort: made.own, effortFrom: 'the agent' })
    expect(answered.says).toContain(inEnglish(saying('effortFromAgentInPlaceOfTheRow', { effort: made.own, row: String(id), rowEffort: made.effort })))
  })

  // MUTATION: answer() gives the row's own selection again; red on the selection's effort.
  it("puts the agent's own effort into the selection of a row that sets no effort, and says it is the agent's", async () => {
    const made = unseen()
    const id = await theWorkersRow({ program: 'opencode', model: made.model, effort: null, native: { model: made.native, provider: made.provider, variant: null } })
    await theOpenCodeAgentsOwn(made.model, made.own)
    const exact = await theRowsSelection(id)
    expect(exact.native).toMatchObject({ variant: null, effort: null })
    const answered = await forAConversation(OPENCODE, 'opencode')
    expect(answered.selection).toEqual({ ...exact, native: { ...exact.native, effort: made.own } })
    expect(answered).toMatchObject({ effort: made.own, effortFrom: 'the agent' })
    expect(answered.says).toContain(inEnglish(saying('effortFromAgent', { effort: made.own })))
  })
})
