// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S OWN EFFORT, AND A CASTING ROW'S, FOLLOW THE ONE NAME RULE AND NOT THE COMPILED LIST.
 *
 * The owner's goal is that any model, variant and thinking level works from data, with no code change. The office gives
 * a run the agent's own effort when the run's model is the agent's own model. Before this change "is the agent's own
 * model" was decided by the compiled list in src/config/launcher-model-compatibility.json: two names that list gives one
 * model counted as one, and two names it does not hold counted as two. So an agent whose own model is a row's Office
 * model lost its own effort when the run named the row's native provider and native model, and a name the list ties to
 * the agent's model took the agent's effort even where no row or provider ties them. A rolled row and the row in force
 * were matched through the same list.
 *
 * THE RULE NOW. A run's model is the agent's own model when the two names are equal, when one is the other with the
 * provider the launcher adds in front (theProviderTheLauncherAdds in src/shared/worker-runs.ts: only Codex's, read from
 * src/config/runtime-native-providers.json), or when one row in force on the run's program names both, by the rule in
 * src/config/launcher-selection.mjs. A rolled row and the row in force
 * give their effort only to a name that names them by that rule, or to the name the office gives the launcher for the
 * row (theModelTheLauncherIsGiven in src/shared/worker-runs.ts: a Codex row's Office model with the Codex provider in
 * front). That second name matters for a row with no native data, which the rule names by its Office model alone. The
 * compiled list is not read for any of this.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database. Every Casting row and every
 * OpenCode agent's own model and variant is written through its doors as the person. The office refuses a variant for a
 * Codex agent, so the Q4 cases write the Codex agent's variant into its record with SQL, as an older office stored it.
 * The roll is written through the office's own roll writer. Every model name, native name, provider and effort is made
 * up for each run, and the test checks that the compiled list names none of them. The two names of one listed model are
 * read from the compiled list at run time, and the provider each runtime runs is read from its data file. No program is
 * started and no model runs.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED: answer() in src/server/lib/run-models.ts matches the agent's own model, the
 * rolled row's model and the row in force's model through the compiled list again. Every case goes red on its effort.
 * The two cases of a Codex row with no native data also go red when the rolled row and the row in force are matched by
 * the one name rule alone, without the name the office gives the launcher. And when theProviderTheLauncherAdds answers
 * the data file's provider for every runtime, the Claude Code case goes red on 'the agent'.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { inEnglish, saying } from '../src/shared/dev-sayings.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import type { TheModelARunGets } from '../src/shared/run-models.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const WORKSPACE = 'default'
/** An OpenCode agent whose own model and variant the person sets on its profile. */
const OPENCODE = 'own-effort-opencode'
/** A Codex agent whose own variant is written with SQL, because the office refuses one for Codex. */
const CODEX = 'own-effort-codex'
/** A Claude Code agent whose own variant is written with SQL, because the office refuses one for any runtime but OpenCode. */
const CLAUDE = 'own-effort-claude'
/** An OpenCode agent with no own model, for the rolled row and the row in force. */
const ROLLED = 'own-effort-rolled'
/** A Codex agent with no own model, for a rolled Codex row and a Codex row in force with no native data. */
const ROLLED_CODEX = 'own-effort-rolled-codex'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const asThe = (handle: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': WORKSPACE })
const LISTED = LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string>; startValues: Record<string, { effort: string | null }> }

type ParticipantsLib = typeof import('../src/server/lib/participants.ts')

let t: TestDb
let app: FastifyInstance
let participants: ParticipantsLib
const ids: Record<string, string> = {}

beforeAll(async () => {
  t = await freshDb()
  participants = await import('../src/server/lib/participants.ts')
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, runtime] of [[OPENCODE, 'opencode'], [CODEX, 'codex'], [CLAUDE, 'claude-code'], [ROLLED, 'opencode'], [ROLLED_CODEX, 'codex']] as const) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role: THE_WORKER, runtime, workArea: ['src'] } })
    expect(made.statusCode, made.body).toBe(201)
  }
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents: { id: string; handle: string }[] }
  for (const handle of [OPENCODE, CODEX, CLAUDE, ROLLED, ROLLED_CODEX]) ids[handle] = one(listed.agents.filter((agent) => agent.handle === handle), `${handle}'s registry row`).id
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** A model, a native name, a provider and two efforts made up for this run, none of which the compiled list names. */
function unseen() {
  const key = randomUUID()
  const made = { model: `office-${key}`, native: `native-${key}`, provider: `provider-${key}`, effort: `effort-${key}`, own: `own-effort-${key}` }
  for (const name of [made.model, made.native, `${made.provider}/${made.native}`]) expect(LISTED.aliases[name] ?? LISTED.startValues[name]).toBeUndefined()
  const efforts = Object.values(LISTED.startValues).map((value) => value.effort)
  for (const effort of [made.effort, made.own]) expect(efforts).not.toContain(effort)
  return made
}

/** Two different names the compiled list gives one model, read from the list at run time. */
function twoNamesOfOneListedModel(): [string, string] {
  const byModel = new Map<string, string[]>()
  for (const [name, model] of Object.entries(LISTED.aliases)) byModel.set(model, [...(byModel.get(model) ?? []), name])
  const names = [...byModel.values()].find((group) => group.length >= 2)
  expect(names, 'a model the compiled list gives two names').toBeDefined()
  return [names![0]!, names![1]!]
}

/** The provider the runtime's own program runs, read from the one data file that says it. */
function theProviderOf(runtime: 'codex' | 'claude-code'): string {
  const runtimes = JSON.parse(readFileSync(join(REPO, 'src/config/runtime-native-providers.json'), 'utf8')) as Record<string, { provider?: unknown }>
  const provider = runtimes[runtime]?.provider
  expect(typeof provider, `the provider of ${runtime} in runtime-native-providers.json`).toBe('string')
  return provider as string
}

/** Casting rows written by the person for the worker card, every project, in the order given, after every row is deleted; a null native writes none. Their ids. */
async function theWorkersRows(rows: { program: string; model: string; effort: string; native: { model: string; provider: string | null } | null }[]): Promise<number[]> {
  t.client.sqlite.prepare('DELETE FROM casting_rows').run()
  const written: number[] = []
  for (const row of rows) {
    const reply = await app.inject({ method: 'POST', url: `/api/casting/${THE_WORKER}`, headers: AS_THE_PERSON, payload: {
      program: { value: row.program }, model: { value: row.model }, effort: { value: row.effort }, ...(row.native === null ? {} : { native: { model: row.native.model, provider: row.native.provider, variant: null } }),
    } })
    expect(reply.statusCode, reply.body).toBe(201)
    written.push((reply.json() as { casting: { id: number } }).casting.id)
  }
  return written
}

/** An OpenCode agent's own model and variant, set on its profile as the person sets them. */
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
  // THE PREMISE: the office reads that model and that variant as the Codex agent's own.
  expect(participants.theModelOnTheAgentRecord(ids[CODEX]!)).toMatchObject({ model, variant, modelIsFor: 'codex' })
}

/** The Claude Code agent's own model, set as the person sets it, and its variant written into the same record with SQL. */
async function theClaudeCodeAgentsOwn(model: string, variant: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: `/api/office/run-models/agent/${CLAUDE}`, headers: AS_THE_PERSON, payload: { model } })
  expect(reply.statusCode, reply.body).toBe(200)
  const holder = participants.theModelOnTheAgentRecord(ids[CLAUDE]!)?.holding[0]
  expect(holder, "the Claude Code agent's record that holds its model").toBeDefined()
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.variant', ?) WHERE id = ?").run(variant, holder!)
  // THE PREMISE: the office reads that model and that variant as the Claude Code agent's own.
  expect(participants.theModelOnTheAgentRecord(ids[CLAUDE]!)).toMatchObject({ model, variant, modelIsFor: 'claude-code' })
}

/** The door a builder's start asks, as the launcher asks it, for `name` on `runtime`. */
async function forABuilder(handle: string, runtime: string, name: string): Promise<TheModelARunGets> {
  const reply = await app.inject({ method: 'GET', url: `/api/office/run-models/for/${handle}?place=builder&runtime=${runtime}&model=${encodeURIComponent(name)}`, headers: asThe(handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as TheModelARunGets
}

/** The agent's Casting roll, choosing one row, written on a run of that agent in this project. */
async function aRollChoosing(handle: string, row: { id: number; program: string; model: string; effort: string }): Promise<void> {
  const run = t.api.createRecord({ kind: 'session', title: 'a run whose Casting roll chose a row', workspaceId: WORKSPACE, actor: { type: 'human', id: THE_PERSON }, data: { state: 'running', servingAgentId: ids[handle] } }).id
  const { theCastingRoll } = await import('../src/shared/casting-roll.ts')
  const record = theCastingRoll({
    role: THE_WORKER,
    project: 'default',
    rows: [{ id: row.id, program: row.program, model: row.model, effort: row.effort, probability: 1, marked: true, labels: [], outUntil: null }],
    difficulty: null,
    named: null,
    earlier: null,
    builderModel: null,
    limits: { limited: [], unreadableStops: [], week: 'Synthetic.' },
    random: () => 0.5,
  }).record
  expect(record.choice, JSON.stringify(record)).toBe('rolled')
  t.api.writeTheCastingRoll(run, record, { type: 'human', id: THE_PERSON })
  const { theEarlierCastingRoll } = await import('../src/server/lib/casting-roll.ts')
  // THE PREMISE: the agent's newest roll in this project chose that row.
  expect(theEarlierCastingRoll(WORKSPACE, ids[handle]!)?.record.selected?.rowId).toBe(row.id)
}

describe("an agent's own effort is given for its own model by the one name rule", () => {
  // MUTATION: the agent's own model is matched through the compiled list; red on the second name's effort.
  it('gives no own effort for another name the compiled list gives the same model', async () => {
    const made = unseen()
    const [ownName, otherName] = twoNamesOfOneListedModel()
    await theWorkersRows([])
    await theOpenCodeAgentsOwn(ownName, made.own)
    const own = await forABuilder(OPENCODE, 'opencode', ownName)
    expect(own).toMatchObject({ effort: made.own, effortFrom: 'the agent' })
    const other = await forABuilder(OPENCODE, 'opencode', otherName)
    expect(other.effortFrom, otherName).not.toBe('the agent')
    expect(other.effort, otherName).not.toBe(made.own)
  })

  // MUTATION: the agent's own model is matched through the compiled list; red on 'Casting' in place of 'the agent'.
  it("gives the own effort when the run names the row's native provider and native model and the agent's own model is the row's Office model, and the other way round", async () => {
    const made = unseen()
    const nativeName = `${made.provider}/${made.native}`
    await theWorkersRows([{ program: 'opencode', model: made.model, effort: made.effort, native: { model: made.native, provider: made.provider } }])
    for (const [ownModel, runsModel] of [[made.model, nativeName], [nativeName, made.model]] as const) {
      await theOpenCodeAgentsOwn(ownModel, made.own)
      const answered = await forABuilder(OPENCODE, 'opencode', runsModel)
      expect(answered, `own ${ownModel}, the run's ${runsModel}`).toMatchObject({ model: runsModel, effort: made.own, effortFrom: 'the agent' })
    }
  })

  // MUTATION: the agent's own model is matched through the compiled list; red on the provider's name in either direction.
  it("gives a Codex agent's own effort for its model with or without the Codex provider in front, and not with another provider", async () => {
    const made = unseen()
    const provider = theProviderOf('codex')
    const prefixed = `${provider}/${made.native}`
    await theWorkersRows([])
    for (const [ownModel, runsModel] of [[made.native, prefixed], [prefixed, made.native]] as const) {
      await theCodexAgentsOwn(ownModel, made.own)
      const answered = await forABuilder(CODEX, 'codex', runsModel)
      expect(answered, `own ${ownModel}, the run's ${runsModel}`).toMatchObject({ model: runsModel, effort: made.own, effortFrom: 'the agent' })
    }
    await theCodexAgentsOwn(made.native, made.own)
    const another = await forABuilder(CODEX, 'codex', `${made.provider}/${made.native}`)
    expect(another.effortFrom).not.toBe('the agent')
    expect(another.effort).not.toBe(made.own)
  })

  // MUTATION: theProviderTheLauncherAdds answers the data file's provider for every runtime; red on the Claude Code case.
  it("gives a Claude Code agent no own effort for its model under the Claude Code provider, and a Codex agent its own effort under the Codex provider", async () => {
    const made = unseen()
    await theWorkersRows([])
    const claudeProvider = theProviderOf('claude-code')
    await theClaudeCodeAgentsOwn(made.model, made.own)
    const claude = await forABuilder(CLAUDE, 'claude-code', `${claudeProvider}/${made.model}`)
    expect(claude.effortFrom, `the Claude Code run naming ${claudeProvider}/${made.model}`).not.toBe('the agent')
    expect(claude.effort).not.toBe(made.own)
    const codexProvider = theProviderOf('codex')
    await theCodexAgentsOwn(made.native, made.own)
    const codex = await forABuilder(CODEX, 'codex', `${codexProvider}/${made.native}`)
    expect(codex.effortFrom).toBe('the agent')
    expect(codex.effort).toBe(made.own)
  })
})

describe("a Casting row's effort is given only to a name that names the row", () => {
  // MUTATION: the row in force's model is matched through the compiled list; red on 'Casting' and the sentence.
  it('gives the row in force no effort and no selection for another name the compiled list gives its model, and says so', async () => {
    const made = unseen()
    const [rowsName, otherName] = twoNamesOfOneListedModel()
    await theWorkersRows([{ program: 'opencode', model: rowsName, effort: made.effort, native: { model: made.native, provider: null } }])
    const rows = await forABuilder(ROLLED, 'opencode', rowsName)
    expect(rows).toMatchObject({ effort: made.effort, effortFrom: 'Casting' })
    expect(rows.selection).toBeDefined()
    const other = await forABuilder(ROLLED, 'opencode', otherName)
    expect(other.effortFrom).not.toBe('Casting')
    expect(other.effort).not.toBe(made.effort)
    expect(other).not.toHaveProperty('selection')
    expect(other.says).toContain(inEnglish(saying('effortCastingModelDiffers', { model: rowsName, asked: otherName })))
  })

  // MUTATION: the rolled row's model is matched through the compiled list; red on 'Casting roll'.
  it('gives the rolled row no effort for another name the compiled list gives its model', async () => {
    const inForce = unseen()
    const rolled = unseen()
    const [rowsName, otherName] = twoNamesOfOneListedModel()
    const [, rolledId] = await theWorkersRows([
      { program: 'opencode', model: inForce.model, effort: inForce.effort, native: { model: inForce.native, provider: null } },
      { program: 'opencode', model: rowsName, effort: rolled.effort, native: { model: rolled.native, provider: null } },
    ])
    await aRollChoosing(ROLLED, { id: rolledId!, program: 'opencode', model: rowsName, effort: rolled.effort })
    const rows = await forABuilder(ROLLED, 'opencode', rowsName)
    expect(rows).toMatchObject({ effort: rolled.effort, effortFrom: 'Casting roll' })
    const other = await forABuilder(ROLLED, 'opencode', otherName)
    expect(['Casting', 'Casting roll']).not.toContain(other.effortFrom)
    expect([inForce.effort, rolled.effort]).not.toContain(other.effort)
  })

  // MUTATION: the row in force is matched by the one name rule alone, without the name the office gives the launcher; red on 'Casting'.
  it('gives a Codex row in force with no native data its effort for its Office model with the Codex provider in front', async () => {
    const made = unseen()
    const launchersName = `${theProviderOf('codex')}/${made.model}`
    expect(LISTED.aliases[launchersName] ?? LISTED.startValues[launchersName]).toBeUndefined()
    await theWorkersRows([{ program: 'codex', model: made.model, effort: made.effort, native: null }])
    const answered = await forABuilder(ROLLED_CODEX, 'codex', launchersName)
    expect(answered).toMatchObject({ model: launchersName, effort: made.effort, effortFrom: 'Casting' })
    expect(answered.says).not.toContain(inEnglish(saying('effortCastingModelDiffers', { model: made.model, asked: launchersName })))
  })

  // MUTATION: the rolled row is matched by the one name rule alone, without the name the office gives the launcher; red on 'Casting roll'.
  it('gives a rolled Codex row with no native data its effort for its Office model with the Codex provider in front', async () => {
    const inForce = unseen()
    const rolled = unseen()
    const launchersName = `${theProviderOf('codex')}/${rolled.model}`
    expect(LISTED.aliases[launchersName] ?? LISTED.startValues[launchersName]).toBeUndefined()
    const [, rolledId] = await theWorkersRows([
      { program: 'codex', model: inForce.model, effort: inForce.effort, native: null },
      { program: 'codex', model: rolled.model, effort: rolled.effort, native: null },
    ])
    await aRollChoosing(ROLLED_CODEX, { id: rolledId!, program: 'codex', model: rolled.model, effort: rolled.effort })
    const answered = await forABuilder(ROLLED_CODEX, 'codex', launchersName)
    expect(answered).toMatchObject({ model: launchersName, effort: rolled.effort, effortFrom: 'Casting roll' })
  })
})
