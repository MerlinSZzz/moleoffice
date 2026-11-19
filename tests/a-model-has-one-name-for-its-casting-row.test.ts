// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MODEL HAS ONE NAME FOR ITS CASTING ROW, WITH OR WITHOUT ITS NATIVE PROVIDER IN FRONT.
 *
 * The owner's goal is that any model, variant and thinking level works from Casting data, with no code change. A Casting
 * row names an Office model and a native route: a native model, and for OpenCode and DSH a stored provider. Before this
 * change a name matched a row only when it was the row's Office model exactly. So a Codex worker started with
 * `--model <Codex's provider>/<native model>`, the name the worker command takes, was given no selection and no effort
 * by the office, and the launcher refused it in tools/sandbox-common.mjs because the compatibility list does not name it.
 *
 * THE RULE. A name names a row when it is exactly the row's Office model, or exactly `<native provider>/<native model>`.
 * The native provider is the row's stored provider, else the provider the runtime's own program runs, which
 * src/config/runtime-native-providers.json gives for Codex and Claude Code. Nothing else is stripped, lower-cased or
 * guessed. A name that one row in force matches takes that row's selection and effort, even when another row is the
 * one in force or the rolled row. A name that the rows in force match with two different models is ambiguous: it gets
 * no selection and no row's effort, the answer says so, and a start is refused with that sentence. Codex and Claude
 * Code are given the native model alone, and a name with another provider's prefix that is not the row's Office model
 * is refused.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, and every Casting row is
 * written through its doors as the person. Every model name and effort is made up for each run, and the test checks
 * that the compatibility list names none of them. The provider each runtime runs is read from the data file and never
 * written here. The last case runs the real `tools/sandbox.mjs worker` in a sandbox made from a synthetic checkout, with
 * the fake docker and devcontainer CLI the launcher tests use, and a stand-in `codex` first on PATH that writes down
 * what it was given. No model runs.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - the matcher in src/config/launcher-selection.mjs takes only the exact Office model: the prefixed-name cases go red;
 *   - the ambiguity check in src/server/lib/run-models.ts is removed: the ambiguous-name cases go red;
 *   - the refusal of another provider's model is removed: the refusal cases go red on the old sentence;
 *   - the one named row is ignored (theOneNamed is always null): the named-row cases go red on the selection, the
 *     effort, the sentence and the Casting row the answer names.
 */
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { applyLauncherSelection } from '../src/config/launcher-selection.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import type { TheModelARunGets } from '../src/shared/run-models.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { FAKE_DEVCONTAINER, FAKE_DF, FAKE_DOCKER, FAKE_DU, FAKE_FREE, startsOf, theFakeMachine } from './sandbox-stand-ins.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { aTestAddress } from './the-test-commit-address.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const NAME = 'one-name'
const STARTER = 'one-name-starter'
const WORKER = 'one-name-worker'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const AS_THE_WORKER = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WORKER, 'x-mole-office-workspace': WORKSPACE }

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type RunModelsLib = typeof import('../src/server/lib/run-models.ts')

let t: TestDb
let res: ResourcesLib
let app: FastifyInstance
let api = ''
let workerId = ''
let starterSession = ''

/**
 * THE PROVIDER THE RUNTIME'S OWN PROGRAM RUNS, read from the one data file that says it. A case that needs it fails here
 * when the file is not there.
 */
function theProviderOf(runtime: 'codex' | 'claude-code'): string {
  const runtimes = JSON.parse(readFileSync(join(REPO, 'src/config/runtime-native-providers.json'), 'utf8')) as Record<string, { provider?: unknown }>
  const provider = runtimes[runtime]?.provider
  expect(typeof provider, `the provider of ${runtime} in runtime-native-providers.json`).toBe('string')
  return provider as string
}

/** A model, its native name, an effort and a provider made up for this run, none of which the compatibility list names. */
function unseen() {
  const key = randomUUID()
  const made = { model: `office-${key}`, native: `native-${key}`, effort: `effort-${key}`, provider: `provider-${key}`, other: `elsewhere-${key}` }
  const listed = LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string>; startValues: Record<string, unknown> }
  for (const name of [made.model, made.native]) expect(listed.aliases[name] ?? listed.startValues[name]).toBeUndefined()
  return made
}

/** Casting rows written by the person for the worker card, every project, in the order given; a null model leaves the cell empty. Their ids. */
async function theWorkersRows(rows: { program: string; model: string | null; effort: string; native: { model: string; provider: string | null } }[]): Promise<number[]> {
  t.client.sqlite.prepare('DELETE FROM casting_rows').run()
  const ids: number[] = []
  for (const row of rows) {
    const written = await app.inject({ method: 'POST', url: `/api/casting/${THE_WORKER}`, headers: AS_THE_PERSON, payload: {
      program: { value: row.program }, ...(row.model === null ? {} : { model: { value: row.model } }), effort: { value: row.effort }, native: { model: row.native.model, provider: row.native.provider, variant: null },
    } })
    expect(written.statusCode, written.body).toBe(201)
    ids.push((written.json() as { casting: { id: number } }).casting.id)
  }
  return ids
}

/** What the row's own selection door answers, which is what the launcher checks a selection against. */
async function theRowsSelection(id: number): Promise<unknown> {
  const reply = await app.inject({ method: 'GET', url: `/api/casting/rows/${String(id)}/selection`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { selection: unknown }).selection
}

/** The door a builder's start asks, as the launcher asks it, for `name` on `runtime`; null asks with no model. */
async function forABuilder(runtime: string, name: string | null): Promise<{ status: number; body: TheModelARunGets & { error?: string } }> {
  const named = name === null ? '' : `&model=${encodeURIComponent(name)}`
  const reply = await app.inject({ method: 'GET', url: `/api/office/run-models/for/${WORKER}?place=builder&runtime=${runtime}${named}`, headers: AS_THE_WORKER })
  return { status: reply.statusCode, body: reply.json() as TheModelARunGets & { error?: string } }
}

/** The read every page and the queue make, for `name` on `runtime`. It never refuses. */
async function theRead(runtime: string, name: string): Promise<TheModelARunGets> {
  const { theModelARunGets } = (await import('../src/server/lib/run-models.ts')) as RunModelsLib
  return theModelARunGets({ place: 'builder', agentId: workerId, runtime, project: WORKSPACE, model: name })
}

/** The value after `flag`, where the command has it once; it fails the case when the flag is missing or repeated. */
function theOne(command: string[], flag: string): string | undefined {
  expect(command.filter((word) => word === flag), `${flag} in ${JSON.stringify(command)}`).toHaveLength(1)
  return command[command.indexOf(flag) + 1]
}

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  expect(thePortsATestKeepsOff()).not.toContain(Number(new URL(api).port))
  // THE STARTER AND THE WORKER. The starter registers the worker, so the last cases may start it; the starter's run is
  // filed with its own key, as its session hook files it.
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...AS_THE_PERSON, 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }, payload: { handle: STARTER, name: STARTER, role: 'secretary' } })
  expect(made.statusCode, made.body).toBe(201)
  const starterKey = String((made.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
  expect(starterKey).not.toBe('')
  const asTheStarter = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': STARTER, 'x-mole-office-workspace': WORKSPACE }
  const mine = await app.inject({ method: 'POST', url: '/api/records', headers: { ...asTheStarter, 'x-mole-office-key': starterKey }, payload: { kind: 'session', title: 'the starter run', data: { state: 'running' } } })
  expect(mine.statusCode, mine.body).toBe(201)
  starterSession = (mine.json() as { record: { id: string } }).record.id
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asTheStarter, payload: { handle: WORKER, name: WORKER, role: THE_WORKER, runtime: 'codex', workArea: ['src'] } })
  expect(worker.statusCode, worker.body).toBe(201)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents: { id: string; handle: string }[] }
  workerId = one(listed.agents.filter((agent) => agent.handle === WORKER), 'the worker\'s registry row').id
}, 60_000)

afterAll(async () => {
  res?.useOsProbe(res.LINUX_PROBE)
  await app?.close()
  t?.close()
})

describe("a name is a row's when it is the row's Office model or its native provider and native model", () => {
  // MUTATION: the matcher takes only the exact Office model; red on the prefixed name's selection.
  it("gives a Codex row's selection and effort for its Office model and for the Codex provider's name of its native model", async () => {
    const made = unseen()
    const provider = theProviderOf('codex')
    const [id] = await theWorkersRows([{ program: 'codex', model: made.model, effort: made.effort, native: { model: made.native, provider: null } }])
    const exact = await theRowsSelection(id!)
    expect(exact).toMatchObject({ runtime: 'codex', model: made.model, native: { model: made.native, provider: null, effort: made.effort }, casting: { id } })
    for (const name of [made.model, `${provider}/${made.native}`]) {
      const answered = await forABuilder('codex', name)
      expect(answered.status, JSON.stringify(answered.body)).toBe(200)
      expect(answered.body.selection, name).toEqual(exact)
      expect(answered.body, name).toMatchObject({ runtime: 'codex', model: name, from: 'the caller', effort: made.effort, effortFrom: 'Casting' })
      expect(answered.body.says, name).toContain(`effort ${made.effort}`)
    }
  })

  // MUTATION: the matcher strips any provider, or lower-cases; red on a selection for a name that is not the row's.
  it('gives a Codex row nothing for the bare native model, another provider, the provider in front of the Office model, or another case', async () => {
    const made = unseen()
    const provider = theProviderOf('codex')
    await theWorkersRows([{ program: 'codex', model: made.model, effort: made.effort, native: { model: made.native, provider: null } }])
    for (const name of [made.native, `${made.other}/${made.native}`, `${provider}/${made.model}`, `${provider}/${made.native.toUpperCase()}`]) {
      const answered = await forABuilder('codex', name)
      expect(answered.status, JSON.stringify(answered.body)).toBe(200)
      expect(answered.body, name).not.toHaveProperty('selection')
      expect(answered.body.effortFrom, name).not.toBe('Casting')
      expect(answered.body.effort, name).not.toBe(made.effort)
    }
  })

  // MUTATION: the matcher takes only the exact Office model; red on the stored provider's name.
  it("gives an OpenCode row's selection and effort for its stored provider and native model, and nothing for another provider", async () => {
    const made = unseen()
    const [id] = await theWorkersRows([{ program: 'opencode', model: made.model, effort: made.effort, native: { model: made.native, provider: made.provider } }])
    const exact = await theRowsSelection(id!)
    expect(exact).toMatchObject({ runtime: 'opencode', model: made.model, native: { model: made.native, provider: made.provider }, casting: { id } })
    const named = await forABuilder('opencode', `${made.provider}/${made.native}`)
    expect(named.status, JSON.stringify(named.body)).toBe(200)
    expect(named.body.selection).toEqual(exact)
    expect(named.body).toMatchObject({ runtime: 'opencode', model: `${made.provider}/${made.native}`, effort: made.effort, effortFrom: 'Casting' })
    // A stored provider is the row's provider: neither another one nor Codex's own names this row.
    for (const name of [`${made.other}/${made.native}`, `${theProviderOf('codex')}/${made.native}`]) {
      const answered = await forABuilder('opencode', name)
      expect(answered.status, JSON.stringify(answered.body)).toBe(200)
      expect(answered.body, name).not.toHaveProperty('selection')
      expect(answered.body.effortFrom, name).not.toBe('Casting')
    }
  })
})

describe('a name the rows in force match with two different models is ambiguous', () => {
  /**
   * Two rows in force for the worker card. The first's Office model is the name itself; the second's native route is
   * the name. In the second pair the first row is an OpenCode row whose stored provider and native model make the name,
   * so a row of another program counts too.
   */
  const pairs = [
    { case: 'two Codex rows', first: (made: ReturnType<typeof unseen>, provider: string) => ({ program: 'codex', model: `${provider}/${made.native}`, effort: `first-${made.effort}`, native: { model: `first-${made.native}`, provider: null } }) },
    { case: 'an OpenCode row and a Codex row', first: (made: ReturnType<typeof unseen>, provider: string) => ({ program: 'opencode', model: `first-${made.model}`, effort: `first-${made.effort}`, native: { model: made.native, provider } }) },
  ]

  // MUTATION: the ambiguity check is removed; red on the selection, the effort and the sentence.
  it.each(pairs)('$case: the read gives no selection and no row\'s effort, and names the name and both rows', async (pair) => {
    const made = unseen()
    const provider = theProviderOf('codex')
    const name = `${provider}/${made.native}`
    const first = pair.first(made, provider)
    const ids = await theWorkersRows([first, { program: 'codex', model: made.model, effort: made.effort, native: { model: made.native, provider: null } }])
    const says = `The model name ${name} matches Casting rows that name different models: ${String(ids[0])} (${first.model}), ${String(ids[1])} (${made.model}). No row gives it a selection or an effort.`
    const read = await theRead('codex', name)
    expect(read).not.toHaveProperty('selection')
    expect(read.ambiguous).toEqual({ name, rows: [{ row: ids[0], model: first.model }, { row: ids[1], model: made.model }], says })
    expect(read.says).toContain(says)
    expect([first.effort, made.effort]).not.toContain(read.effort)
    expect(['Casting', 'Casting roll']).not.toContain(read.effortFrom)
  })

  // MUTATION: the ambiguity check is removed; red on a 200 with a selection.
  it.each(pairs)('$case: the door a start asks refuses with a 409 and that sentence', async (pair) => {
    const made = unseen()
    const provider = theProviderOf('codex')
    const name = `${provider}/${made.native}`
    const first = pair.first(made, provider)
    await theWorkersRows([first, { program: 'codex', model: made.model, effort: made.effort, native: { model: made.native, provider: null } }])
    const read = await theRead('codex', name)
    const refused = await forABuilder('codex', name)
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body.error).toBe(read.ambiguous?.says)
  })

  it('two rows that name one Office model are not ambiguous, and the row in force gives the selection', async () => {
    const made = unseen()
    const provider = theProviderOf('codex')
    const ids = await theWorkersRows([
      { program: 'codex', model: made.model, effort: made.effort, native: { model: made.native, provider: null } },
      { program: 'opencode', model: made.model, effort: `other-${made.effort}`, native: { model: made.native, provider } },
    ])
    // THE PREMISE: the first row written is the row in force, and it is the Codex row.
    const inForce = (await app.inject({ method: 'GET', url: `/api/casting/for/${THE_WORKER}?project=${WORKSPACE}`, headers: AS_THE_PERSON })).json() as { casting: { id: number } }
    expect(inForce.casting.id).toBe(ids[0])
    const answered = await forABuilder('codex', `${provider}/${made.native}`)
    expect(answered.status, JSON.stringify(answered.body)).toBe(200)
    expect(answered.body).not.toHaveProperty('ambiguous')
    expect(answered.body.selection).toEqual(await theRowsSelection(ids[0]!))
    expect(answered.body).toMatchObject({ effort: made.effort, effortFrom: 'Casting' })
  })

  // MUTATION: a row with no Office model counts as naming an empty model; red on a 409 for an ambiguity.
  it('a row in force with no Office model matches no name, so it makes no name ambiguous', async () => {
    const made = unseen()
    const provider = theProviderOf('codex')
    const ids = await theWorkersRows([
      { program: 'codex', model: made.model, effort: made.effort, native: { model: made.native, provider: null } },
      { program: 'codex', model: null, effort: `other-${made.effort}`, native: { model: made.native, provider: null } },
    ])
    const answered = await forABuilder('codex', `${provider}/${made.native}`)
    expect(answered.status, JSON.stringify(answered.body)).toBe(200)
    expect(answered.body).not.toHaveProperty('ambiguous')
    expect(answered.body.selection).toEqual(await theRowsSelection(ids[0]!))
    expect(answered.body).toMatchObject({ effort: made.effort, effortFrom: 'Casting' })
  })
})

describe('a name that one row in force matches takes that row, even when another row is chosen', () => {
  /** Two Codex rows in force for the worker card, A first, with different made-up models, native models and efforts. */
  async function twoRows(): Promise<{ a: ReturnType<typeof unseen>; b: ReturnType<typeof unseen>; ids: number[] }> {
    const a = unseen()
    const b = unseen()
    const ids = await theWorkersRows([
      { program: 'codex', model: a.model, effort: a.effort, native: { model: a.native, provider: null } },
      { program: 'codex', model: b.model, effort: b.effort, native: { model: b.native, provider: null } },
    ])
    // THE PREMISE: the first row written is the row in force.
    const inForce = (await app.inject({ method: 'GET', url: `/api/casting/for/${THE_WORKER}?project=${WORKSPACE}`, headers: AS_THE_PERSON })).json() as { casting: { id: number } }
    expect(inForce.casting.id).toBe(ids[0])
    return { a, b, ids }
  }

  /** The agent's Casting roll, choosing one made-up Codex row, written on a run of the worker in this project. */
  async function aRollChoosing(row: { id: number; model: string; effort: string }): Promise<void> {
    const run = t.api.createRecord({ kind: 'session', title: 'a run whose Casting roll chose the row in force', workspaceId: WORKSPACE, actor: { type: 'human', id: THE_PERSON }, data: { state: 'running', servingAgentId: workerId } }).id
    const { theCastingRoll } = await import('../src/shared/casting-roll.ts')
    const record = theCastingRoll({
      role: THE_WORKER,
      project: 'default',
      rows: [{ id: row.id, program: 'codex', model: row.model, effort: row.effort, probability: 1, marked: true, labels: [], outUntil: null }],
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
    // THE PREMISE: the worker's newest roll in this project chose that row.
    expect(theEarlierCastingRoll(WORKSPACE, workerId)?.record.selected?.rowId).toBe(row.id)
  }

  // MUTATION: the one named row is ignored; red on the selection, the effort and the sentence.
  it("gives B's selection and effort for B's Office model, and says which row gave them", async () => {
    const { b, ids } = await twoRows()
    const exact = await theRowsSelection(ids[1]!)
    const answered = await forABuilder('codex', b.model)
    expect(answered.status, JSON.stringify(answered.body)).toBe(200)
    expect(answered.body).not.toHaveProperty('ambiguous')
    expect(answered.body.selection).toEqual(exact)
    expect(answered.body).toMatchObject({ effort: b.effort, effortFrom: 'Casting' })
    expect(answered.body.says).toContain(`The run gets effort ${b.effort} from Casting row ${String(ids[1])}, the one row in force that the model name ${b.model} names.`)
    const read = await theRead('codex', b.model)
    expect(read.selection).toEqual(exact)
    expect(read).toMatchObject({ effort: b.effort, effortFrom: 'Casting' })
  })

  // MUTATION: the one named row is ignored; red on the selection, the effort and the sentence.
  it("gives B's selection and effort for the Codex provider's name of B's native model", async () => {
    const { b, ids } = await twoRows()
    const name = `${theProviderOf('codex')}/${b.native}`
    const exact = await theRowsSelection(ids[1]!)
    const answered = await forABuilder('codex', name)
    expect(answered.status, JSON.stringify(answered.body)).toBe(200)
    expect(answered.body).not.toHaveProperty('ambiguous')
    expect(answered.body.selection).toEqual(exact)
    expect(answered.body).toMatchObject({ effort: b.effort, effortFrom: 'Casting' })
    expect(answered.body.says).toContain(`The run gets effort ${b.effort} from Casting row ${String(ids[1])}, the one row in force that the model name ${name} names.`)
    const read = await theRead('codex', name)
    expect(read.selection).toEqual(exact)
    expect(read).toMatchObject({ effort: b.effort, effortFrom: 'Casting' })
  })

  // MUTATION: the one named row is ignored; red on the selection and the effort of B.
  it("gives B's selection and effort when the agent's roll chose A", async () => {
    const { a, b, ids } = await twoRows()
    await aRollChoosing({ id: ids[0]!, model: a.model, effort: a.effort })
    const exact = await theRowsSelection(ids[1]!)
    const answered = await forABuilder('codex', b.model)
    expect(answered.status, JSON.stringify(answered.body)).toBe(200)
    expect(answered.body).not.toHaveProperty('ambiguous')
    expect(answered.body.selection).toEqual(exact)
    expect(answered.body).toMatchObject({ effort: b.effort, effortFrom: 'Casting' })
    const read = await theRead('codex', b.model)
    expect(read.selection).toEqual(exact)
    expect(read).toMatchObject({ effort: b.effort, effortFrom: 'Casting' })
  })

  it('with no name, the row in force gives its selection and its effort', async () => {
    const { a, ids } = await twoRows()
    const answered = await forABuilder('codex', null)
    expect(answered.status, JSON.stringify(answered.body)).toBe(200)
    expect(answered.body.selection).toEqual(await theRowsSelection(ids[0]!))
    expect(answered.body).toMatchObject({ effort: a.effort, effortFrom: 'Casting' })
  })

  // MUTATION: the one named row is ignored; red on the Casting row the answer names for cases 1 to 3.
  it('names the row whose selection the answer gives: the named row when one row is named, else the row in force', async () => {
    const byOffice = await twoRows()
    const office = await forABuilder('codex', byOffice.b.model)
    expect(office.status, JSON.stringify(office.body)).toBe(200)
    expect(office.body.casting?.id).toBe(byOffice.ids[1])
    const byNative = await twoRows()
    const native = await forABuilder('codex', `${theProviderOf('codex')}/${byNative.b.native}`)
    expect(native.status, JSON.stringify(native.body)).toBe(200)
    expect(native.body.casting?.id).toBe(byNative.ids[1])
    const afterARoll = await twoRows()
    await aRollChoosing({ id: afterARoll.ids[0]!, model: afterARoll.a.model, effort: afterARoll.a.effort })
    const rolled = await forABuilder('codex', afterARoll.b.model)
    expect(rolled.status, JSON.stringify(rolled.body)).toBe(200)
    expect(rolled.body.casting?.id).toBe(afterARoll.ids[1])
    const noName = await twoRows()
    const inForce = await forABuilder('codex', null)
    expect(inForce.status, JSON.stringify(inForce.body)).toBe(200)
    expect(inForce.body.casting?.id).toBe(noName.ids[0])
  })
})

/** The one sentence a runtime with a provider of its own refuses another provider's model with. */
function anotherProvidersModel(runtime: 'codex' | 'claude-code', name: string): string {
  return `${runtime} cannot run another provider's model, so it cannot run ${name}. Nothing was started.`
}

describe('Codex and Claude Code are given the native model alone, and refuse another provider', () => {
  const programs = [
    { runtime: 'codex' as const, flag: '-m', command: ['codex', 'exec', '--json', '--', 'Synthetic prompt'] },
    { runtime: 'claude-code' as const, flag: '--model', command: ['claude', '-p', 'Synthetic prompt'] },
  ]
  const aSelection = (runtime: string, made: ReturnType<typeof unseen>, model = made.model) => ({ runtime, model, native: { model: made.native, provider: null, variant: null, effort: made.effort }, casting: null })
  /** The command with its own model option, before the prompt and before Codex's `--`. */
  const naming = (command: string[], flag: string, name: string) => {
    const at = command.includes('--') ? command.indexOf('--') : command.length - 1
    return [...command.slice(0, at), flag, name, ...command.slice(at)]
  }

  // MUTATION: the matcher takes only the exact Office model; red on the launcher's refusal of the prefixed name.
  it.each(programs)('$runtime takes its provider\'s name of the native model and is given the native model, with no provider', ({ runtime, flag, command }) => {
    const made = unseen()
    const name = `${theProviderOf(runtime)}/${made.native}`
    const given = applyLauncherSelection(command, { runtime, model: name, selection: aSelection(runtime, made) })
    expect(theOne(given.command, flag)).toBe(made.native)
    expect(given.command).not.toContain(name)
    expect(given.command.join(' ')).not.toContain('model_provider')
    expect(given.start).toMatchObject({ model: made.model, native: { model: made.native, provider: null } })
  })

  // MUTATION: the matcher takes only the exact Office model; red on the command's own model option.
  it.each(programs)('$runtime replaces its provider\'s name of the native model in the command with the native model', ({ runtime, flag, command }) => {
    const made = unseen()
    const name = `${theProviderOf(runtime)}/${made.native}`
    const named = naming(command, flag, name)
    const given = applyLauncherSelection(named, { runtime, model: made.model, selection: aSelection(runtime, made) })
    expect(theOne(given.command, flag)).toBe(made.native)
    expect(given.command).not.toContain(name)
    expect(given.command.join(' ')).not.toContain('model_provider')
  })

  // MUTATION: the refusal of another provider is removed; red on the old sentence.
  it.each(programs)('$runtime refuses another provider\'s name, asked or in the command, in one sentence', ({ runtime, flag, command }) => {
    const made = unseen()
    const name = `${made.other}/${made.native}`
    expect(() => applyLauncherSelection(command, { runtime, model: name, selection: aSelection(runtime, made) })).toThrow(new Error(anotherProvidersModel(runtime, name)))
    const named = naming(command, flag, name)
    expect(() => applyLauncherSelection(named, { runtime, model: made.model, selection: aSelection(runtime, made) })).toThrow(new Error(anotherProvidersModel(runtime, name)))
  })

  it.each(programs)('$runtime still takes an Office model that has another provider in front, because it is the row\'s own name', ({ runtime, flag, command }) => {
    const made = unseen()
    const office = `${made.other}/${made.model}`
    const given = applyLauncherSelection(command, { runtime, model: office, selection: aSelection(runtime, made, office) })
    expect(theOne(given.command, flag)).toBe(made.native)
  })
})

describe("a real Codex worker started with its provider's name of a Casting row's native model", () => {
  let scratch = ''
  let sandboxes = ''
  let fakes = ''
  let dir = ''
  /** Every process group a case started, stopped at the end if its leader still works in the scratch. */
  const groups = new Set<number>()
  const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()

  /** The tool as its own process, as the starter, with only the caller's own settings cleared and `bin` first on PATH. */
  async function sandbox(args: string[], bin: string): Promise<{ status: number; out: string; err: string }> {
    const env: NodeJS.ProcessEnv = {
      ...withoutInheritedEffort(),
      PATH: `${bin}:${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
      FAKE_DOCKER_DIR: fakes,
      MOLE_OFFICE_AGENT: STARTER,
      MOLE_OFFICE_SESSION: starterSession,
      MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
    }
    delete env['MOLE_AGENT_KEY']
    return new Promise((done) => {
      const child = spawn(process.execPath, [TOOL, ...args, '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE], { env, detached: true })
      if (child.pid !== undefined) groups.add(child.pid)
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => (err += c))
      child.on('close', (code) => done({ status: code ?? 1, out, err }))
    })
  }

  /** A stand-in `codex` that writes down the arguments it was given and ends. Its folder, and the file it writes. */
  function aStandInCodex(label: string): { bin: string; seen: string } {
    const bin = join(scratch, `${label}-bin`)
    const seen = join(scratch, `${label}-codex-argv.json`)
    mkdirSync(bin)
    writeFileSync(join(bin, 'codex'), `#!${process.execPath}\nprocess.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(seen)}, JSON.stringify(process.argv.slice(2)))\nconsole.log(JSON.stringify({ type: 'thread.started', thread_id: '12345678-1234-4234-8234-123456789012' }))\n`, { mode: 0o755 })
    return { bin, seen }
  }

  async function theArgumentsIn(seen: string): Promise<string[]> {
    const until = Date.now() + 30_000
    while (!existsSync(seen) && Date.now() < until) await new Promise((done) => setTimeout(done, 200))
    expect(existsSync(seen), 'the stand-in codex was never started').toBe(true)
    return JSON.parse(readFileSync(seen, 'utf8')) as string[]
  }

  beforeAll(async () => {
    res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))
    scratch = mkdtempSync(join(tmpdir(), 'mole-office-one-name-'))
    sandboxes = join(scratch, 'sandboxes')
    fakes = join(scratch, 'fakes')
    const secrets = join(scratch, 'sandbox-secrets.env')
    mkdirSync(join(fakes, 'bin'), { recursive: true })
    writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
    writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))

    // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/, as the launcher tests make it.
    const main = join(scratch, 'main')
    mkdirSync(main)
    git(main, 'init', '-q', '-b', 'main')
    git(main, 'config', 'user.email', 'a-test@example.invalid')
    git(main, 'config', 'user.name', 'A test')
    git(main, 'config', 'commit.gpgsign', 'false')
    symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
    cpSync(join(REPO, 'src'), join(main, 'src'), { recursive: true })
    writeFileSync(join(main, 'src/config/rules/CODE.md'), '# Synthetic code\n\n## Chapter 5 — Synthetic tests\nSynthetic chapter text.\n')
    writeFileSync(join(main, 'README.md'), 'a checkout for the one-name test\n')
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'the checkout')
    mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
    mkdirSync(join(main, 'data'))

    // THE TEMPLATE: the real one's files, with the secrets file in this test's scratch.
    const template = join(scratch, 'template')
    mkdirSync(template)
    const real = join(REPO, 'sandboxes', 'mole-office-dev')
    writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
    const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8')) as { secrets: { hostFile: string } }
    office.secrets.hostFile = secrets
    writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))
    writeFileSync(secrets, '', { mode: 0o600 })


    const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--no-dsh', '--json'], join(fakes, 'bin'))
    expect(up.status, up.err).toBe(0)
    dir = (JSON.parse(up.out.trim()) as { folder: string }).folder
    // A SYNTHETIC Codex login. No login is performed, and no model runs.
    mkdirSync(join(dir, 'home', '.codex'), { recursive: true })
    writeFileSync(join(dir, 'home', '.codex', 'auth.json'), '{}\n')
  }, 120_000)

  afterAll(() => {
    for (const one of (sandboxes !== '' && existsSync(sandboxes) ? readdirSync(sandboxes) : [])) {
      for (const start of startsOf(join(sandboxes, one))) groups.add(start.hostPgid)
    }
    for (const group of groups) {
      if (group <= 1 || group === process.pid) continue
      try {
        if (!readlinkSync(`/proc/${group}/cwd`).startsWith(scratch)) continue
        process.kill(-group, 'SIGKILL')
      } catch {
        // gone
      }
    }
    if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
  })

  /** Start the worker on `name` for a Codex row naming `made`, and give back what the stand-in codex was given. */
  async function started(label: string, name: string, row: { model: string; native: string; effort: string }): Promise<string[]> {
    await theWorkersRows([{ program: 'codex', model: row.model, effort: row.effort, native: { model: row.native, provider: null } }])
    const brief = join(scratch, `${label}-brief.md`)
    writeFileSync(brief, '# A synthetic brief\nSynthetic text only.\n')
    const { bin, seen } = aStandInCodex(label)
    const ran = await sandbox(['worker', NAME, '--agent', WORKER, '--runtime', 'codex', '--model', name, '--brief', brief, '--json'], bin)
    expect(ran.status, ran.err).toBe(0)
    groups.add((JSON.parse(ran.out.trim()) as { hostPgid: number }).hostPgid)
    return theArgumentsIn(seen)
  }

  it("a worker started on the row's Office model starts, which shows this sandbox can start a worker at all", async () => {
    const made = unseen()
    const argv = await started('office-name', made.model, made)
    expect(theOne(argv, '-m')).toBe(made.native)
  }, 90_000)

  // MUTATION: the matcher takes only the exact Office model; red on the launcher's refusal with exit 2.
  it("a row whose native route is the prefixed name starts too, past the launcher's refusal, and Codex is given the native model alone", async () => {
    const made = unseen()
    const name = `${theProviderOf('codex')}/${made.native}`
    const argv = await started('native-route', name, made)
    expect(theOne(argv, '-m')).toBe(made.native)
    expect(argv).not.toContain(name)
    expect(argv).not.toContain(made.model)
    expect(argv.join(' ')).not.toContain('model_provider')
    expect(argv.join(' ')).toContain(`model_reasoning_effort=${JSON.stringify(made.effort)}`)
  }, 90_000)
})
