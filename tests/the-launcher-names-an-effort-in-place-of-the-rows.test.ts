// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LAUNCHER LETS THROUGH ONE DIFFERENCE FROM ITS CASTING ROW, ANOTHER EFFORT, AND ITS WORDS NAME BOTH EFFORTS.
 *
 * The owner's goal is that any model, variant and thinking level works from data, with no code change. The office's
 * answer now puts the agent's own effort into its Casting row's selection (tests/the-agents-own-effort-goes-into-the-
 * rows-selection.test.ts). Before a start, the launcher rechecks the selection against the row with the row's own
 * selection door, recheckLauncherSelection in tools/sandbox-common.mjs. Before this change it refused any difference,
 * so a selection carrying the agent's effort was refused as a changed row.
 *
 * THE RULE NOW. The recheck lets through exactly one difference: an effort that is set and is not the row's, with an
 * OpenCode row's variant replaced by the same effort. theRowsEffortUnder in src/config/launcher-selection.mjs decides
 * it. Every other difference is still refused. The start's words state what the launcher can prove: "effort X, in place
 * of Casting row N's Y", or "effort X; Casting row N sets no effort". Only where the launcher holds the office's answer,
 * and that answer says the effort is the agent's, it adds "(the office says: the agent's own setting)" and the start's
 * effortFrom is 'the agent'. Where it holds only a selection, effortFrom is a value of its own in THE_EFFORT_SOURCES,
 * which says that the effort is not the row's and its source is not proved. When the native program refuses such an
 * effort with an option refusal, the row is not held, because its own effort was not tried, and one sentence says so.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, and every row, hold and model is
 * written through its doors as the person. The launcher reaches it through a relay this file starts on a free port; the
 * relay hands each request to the same server in this process and gives back its answer unchanged. No program is
 * started and no model runs. Every model name, native name, provider and effort is made up for each run, and the test
 * checks that the compiled list names none of them. The refusal in the last cases is a made-up sentence.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED, AND HOW EACH REFUSAL THE RECHECK KEEPS IS PROVED. The cases that let another
 * effort through, the words and the case-3 sentence are red before the code. The refusals the recheck keeps already hold
 * before the code, so they are green before and after it. Each one is proved by a mutation instead: let
 * theRowsEffortUnder pass any difference, and each kept case that the selection door answers goes red; restore it and
 * it is green. The Casting id and the revision are refused by the door before theRowsEffortUnder runs, so they go red
 * only when the door's revision check in readACastingSelection (src/server/lib/casting.ts) is removed as well. The held
 * row is refused by the door too, and goes red when selectionOfACasting stops refusing a held row.
 */
import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { applyLauncherSelection, theRefusalOfAnEffortNotTheRows } from '../src/config/launcher-selection.mjs'
import { AN_UNPROVED_EFFORT_NOT_THE_ROWS, LAUNCHER_MODEL_COMPATIBILITY, THE_EFFORT_SOURCES } from '../src/config/model-efforts.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { aCommandsStartFromTheOffice, recheckLauncherSelection } from '../tools/sandbox-common.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AGENT = 'effort-in-place'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const AS_THE_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT, 'x-mole-office-workspace': WORKSPACE }
const LISTED = LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string>; startValues: Record<string, { effort: string | null }> }
const CHANGED = 'The selected Casting row changed. Nothing was started.'
const NOT_RECHECKED = /^The selected Casting row could not be rechecked \(/
const THE_OFFICE_SAYS = " (the office says: the agent's own setting)"

type Selection = { runtime: string; model: string; native: { model: string; provider: string | null; variant: string | null; effort: string | null }; casting: { id: number; revision: string } | null }
type Start = { effort: string | null; effortFrom: string; words: string; rowsEffort?: string | null; selection: Selection }

let t: TestDb
let app: FastifyInstance
let relay: Server
let api = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: AGENT, name: AGENT, role: THE_WORKER, runtime: 'opencode', workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  // THE RELAY: the launcher asks over HTTP, and this server answers only through inject. Only the office's own headers go on.
  relay = createServer((request, response) => {
    const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => name.startsWith('x-mole-office-'))) as Record<string, string>
    void app.inject({ method: request.method as 'GET', url: request.url ?? '/', headers }).then((reply) => {
      response.writeHead(reply.statusCode, { 'content-type': 'application/json' })
      response.end(reply.body)
    })
  })
  await new Promise<void>((done) => relay.listen(0, '127.0.0.1', done))
  api = `http://127.0.0.1:${String((relay.address() as AddressInfo).port)}`
  expect(thePortsATestKeepsOff()).not.toContain(Number(new URL(api).port))
}, 60_000)

afterAll(async () => {
  await new Promise<void>((done) => relay?.close(() => done()))
  await app?.close()
  t?.close()
})

/** A model, a native name, a provider and two efforts made up for this run, none of which the compiled list names. */
function unseen() {
  const key = randomUUID()
  const made = { model: `office-${key}`, native: `native-${key}`, provider: `provider-${key}`, effort: `row-effort-${key}`, other: `other-effort-${key}` }
  for (const name of [made.model, made.native, `${made.provider}/${made.native}`]) expect(LISTED.aliases[name] ?? LISTED.startValues[name]).toBeUndefined()
  const efforts = Object.values(LISTED.startValues).map((value) => value.effort)
  for (const effort of [made.effort, made.other]) expect(efforts).not.toContain(effort)
  return made
}

/** An OpenCode row for the worker card, written by the person; a null effort leaves the cell empty. Its id and its own selection. */
async function anOpenCodeRow(made: ReturnType<typeof unseen>, { variant, effort }: { variant: string | null; effort: string | null }): Promise<{ id: number; exact: Selection }> {
  const written = await app.inject({ method: 'POST', url: `/api/casting/${THE_WORKER}`, headers: AS_THE_PERSON, payload: {
    program: { value: 'opencode' }, model: { value: made.model }, ...(effort === null ? {} : { effort: { value: effort } }), native: { model: made.native, provider: made.provider, variant },
  } })
  expect(written.statusCode, written.body).toBe(201)
  const id = (written.json() as { casting: { id: number } }).casting.id
  const read = await app.inject({ method: 'GET', url: `/api/casting/rows/${String(id)}/selection`, headers: AS_THE_PERSON })
  expect(read.statusCode, read.body).toBe(200)
  const exact = (read.json() as { selection: Selection }).selection
  expect(exact).toMatchObject({ runtime: 'opencode', model: made.model, native: { model: made.native, provider: made.provider, variant, effort }, casting: { id } })
  return { id, exact }
}

/** `exact` with its native fields changed as given. */
const withNative = (exact: Selection, native: Partial<Selection['native']>): Selection => ({ ...exact, native: { ...exact.native, ...native } })

const recheck = (selection: Selection) => recheckLauncherSelection(api, selection, { headers: AS_THE_AGENT })

/** The value after `flag`, where the command has it once; it fails the case when the flag is missing or repeated. */
function theOne(command: string[], flag: string): string | undefined {
  expect(command.filter((word) => word === flag), `${flag} in ${JSON.stringify(command)}`).toHaveLength(1)
  return command[command.indexOf(flag) + 1]
}

describe("the recheck lets through only another effort, and hands back the row's", () => {
  let plain: { id: number; exact: Selection; made: ReturnType<typeof unseen> }
  let variant: { id: number; exact: Selection; made: ReturnType<typeof unseen> }
  let noEffort: { id: number; exact: Selection; made: ReturnType<typeof unseen> }

  beforeAll(async () => {
    const one = unseen()
    plain = { ...(await anOpenCodeRow(one, { variant: null, effort: one.effort })), made: one }
    const two = unseen()
    variant = { ...(await anOpenCodeRow(two, { variant: two.effort, effort: two.effort })), made: two }
    const three = unseen()
    noEffort = { ...(await anOpenCodeRow(three, { variant: null, effort: null })), made: three }
  })

  // MUTATION: the recheck refuses any difference again; red on the refusal.
  it("hands back the row's own effort for another effort, and the selection as it is for none", async () => {
    await expect(recheck(plain.exact)).resolves.toEqual({ selection: plain.exact })
    const other = withNative(plain.exact, { effort: plain.made.other })
    await expect(recheck(other)).resolves.toEqual({ selection: other, rowsEffort: plain.made.effort })
  })

  // MUTATION: the recheck refuses any difference again; red on the refusal.
  it("hands back an OpenCode row's own variant when the variant and the effort are both replaced with another effort", async () => {
    const other = withNative(variant.exact, { variant: variant.made.other, effort: variant.made.other })
    await expect(recheck(other)).resolves.toEqual({ selection: other, rowsEffort: variant.made.effort })
  })

  // MUTATION: the recheck refuses any difference again; red on the refusal.
  it('hands back null for an effort given to a row that sets none', async () => {
    const other = withNative(noEffort.exact, { effort: noEffort.made.other })
    await expect(recheck(other)).resolves.toEqual({ selection: other, rowsEffort: null })
  })

  // KEPT REFUSALS. Each is green before and after the code; see the header for the mutation that proves each one.
  it('refuses another runtime, alone and with another effort', async () => {
    await expect(recheck({ ...plain.exact, runtime: 'codex' })).rejects.toThrow(CHANGED)
    await expect(recheck({ ...withNative(plain.exact, { effort: plain.made.other }), runtime: 'codex' })).rejects.toThrow(CHANGED)
  })

  it('refuses another Office model, alone and with another effort', async () => {
    const model = unseen().model
    await expect(recheck({ ...plain.exact, model })).rejects.toThrow(CHANGED)
    await expect(recheck({ ...withNative(plain.exact, { effort: plain.made.other }), model })).rejects.toThrow(CHANGED)
  })

  it('refuses another native model, alone and with another effort', async () => {
    const native = unseen().native
    await expect(recheck(withNative(plain.exact, { model: native }))).rejects.toThrow(CHANGED)
    await expect(recheck(withNative(plain.exact, { model: native, effort: plain.made.other }))).rejects.toThrow(CHANGED)
  })

  it('refuses another provider and no provider, alone and with another effort', async () => {
    for (const provider of [unseen().provider, null]) {
      await expect(recheck(withNative(plain.exact, { provider })), String(provider)).rejects.toThrow(CHANGED)
      await expect(recheck(withNative(plain.exact, { provider, effort: plain.made.other })), String(provider)).rejects.toThrow(CHANGED)
    }
  })

  it("refuses another row's Casting id, alone and with another effort", async () => {
    const casting = { id: variant.id, revision: plain.exact.casting!.revision }
    await expect(recheck({ ...plain.exact, casting })).rejects.toThrow(NOT_RECHECKED)
    await expect(recheck({ ...withNative(plain.exact, { effort: plain.made.other }), casting })).rejects.toThrow(NOT_RECHECKED)
  })

  it('refuses another revision, alone and with another effort', async () => {
    const casting = { id: plain.id, revision: `revision-${randomUUID()}` }
    await expect(recheck({ ...plain.exact, casting })).rejects.toThrow(NOT_RECHECKED)
    await expect(recheck({ ...withNative(plain.exact, { effort: plain.made.other }), casting })).rejects.toThrow(NOT_RECHECKED)
  })

  it('refuses an effort set to null where the row sets one', async () => {
    await expect(recheck(withNative(plain.exact, { effort: null }))).rejects.toThrow(CHANGED)
    await expect(recheck(withNative(variant.exact, { effort: null }))).rejects.toThrow(CHANGED)
  })

  it('refuses every other variant difference', async () => {
    const other = plain.made.other
    // A variant set where the row has none: with the row's effort, and with the same other effort.
    await expect(recheck(withNative(plain.exact, { variant: other }))).rejects.toThrow(CHANGED)
    await expect(recheck(withNative(plain.exact, { variant: other, effort: other }))).rejects.toThrow(CHANGED)
    const another = variant.made.other
    // The row's variant replaced while its effort stays; dropped while the effort is replaced; replaced by a third value.
    await expect(recheck(withNative(variant.exact, { variant: another }))).rejects.toThrow(CHANGED)
    await expect(recheck(withNative(variant.exact, { variant: null, effort: another }))).rejects.toThrow(CHANGED)
    await expect(recheck(withNative(variant.exact, { variant: `third-${another}`, effort: another }))).rejects.toThrow(CHANGED)
  })

  it('refuses a held row, alone and with another effort', async () => {
    const made = unseen()
    const { id, exact } = await anOpenCodeRow(made, { variant: null, effort: made.effort })
    const run = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: { kind: 'session', title: 'Synthetic: a run started from a row that is then held', data: {
      runtime: exact.runtime, model: exact.model, servingAgent: AGENT, state: 'running', extra: { launcherSelection: exact },
    } } })
    expect(run.statusCode, run.body).toBe(201)
    const refusal = { kind: 'model', code: 'model_not_found', said: 'Synthetic: the native program refused the selected model.' }
    const held = await app.inject({ method: 'POST', url: `/api/casting/rows/${String(id)}/hold`, headers: AS_THE_PERSON, payload: { revision: exact.casting!.revision, run: (run.json() as { record: { id: string } }).record.id, refusal } })
    expect(held.statusCode, held.body).toBe(200)
    await expect(recheck(exact)).rejects.toThrow(NOT_RECHECKED)
    await expect(recheck(withNative(exact, { effort: made.other }))).rejects.toThrow(NOT_RECHECKED)
  })
})

/** A selection of row 7 at the effort `made.other`, and the start applyLauncherSelection makes of it with `options`. */
function theStartOf(made: ReturnType<typeof unseen>, options: Record<string, unknown>): Start {
  const selection: Selection = { runtime: 'opencode', model: made.model, native: { model: made.native, provider: made.provider, variant: null, effort: made.other }, casting: { id: 7, revision: `revision-${made.model}` } }
  return (applyLauncherSelection(['opencode', 'run', 'say hello'], { runtime: 'opencode', model: null, selection, ...options }) as { start: Start }).start
}

describe("the start's words name both efforts, and say where the effort came from only when the office said it", () => {
  let made: ReturnType<typeof unseen>
  beforeAll(() => { made = unseen() })
  const start = (options: Record<string, unknown>) => theStartOf(made, options)

  // MUTATION: applyLauncherSelection ignores the row's effort; red on the words and the source.
  it("names the row's effort it replaced, and gives the source the launcher cannot prove a value of its own", () => {
    expect(THE_EFFORT_SOURCES).toContain(AN_UNPROVED_EFFORT_NOT_THE_ROWS)
    expect(typeof AN_UNPROVED_EFFORT_NOT_THE_ROWS).toBe('string')
    const replaced = start({ rowsEffort: made.effort })
    expect(replaced).toMatchObject({ effort: made.other, effortFrom: AN_UNPROVED_EFFORT_NOT_THE_ROWS, rowsEffort: made.effort })
    expect(replaced.words).toContain(`; effort ${made.other}, in place of Casting row 7's ${made.effort}; fast mode`)
    const none = start({ rowsEffort: null })
    expect(none).toMatchObject({ effort: made.other, effortFrom: AN_UNPROVED_EFFORT_NOT_THE_ROWS, rowsEffort: null })
    expect(none.words).toContain(`; effort ${made.other}; Casting row 7 sets no effort; fast mode`)
  })

  // MUTATION: applyLauncherSelection ignores the office's word; red on 'the agent' and the words.
  it("says the office named the agent's own setting, and takes it as the source, only when told so", () => {
    const replaced = start({ rowsEffort: made.effort, officeSaysTheAgent: true })
    expect(replaced).toMatchObject({ effortFrom: 'the agent', rowsEffort: made.effort })
    expect(replaced.words).toContain(`; effort ${made.other}, in place of Casting row 7's ${made.effort}${THE_OFFICE_SAYS}; fast mode`)
    const none = start({ rowsEffort: null, officeSaysTheAgent: true })
    expect(none).toMatchObject({ effortFrom: 'the agent', rowsEffort: null })
    expect(none.words).toContain(`; effort ${made.other}; Casting row 7 sets no effort${THE_OFFICE_SAYS}; fast mode`)
  })

  // No mutation turns this red: a selection that is the row's own is unchanged before and after the code.
  it("keeps the row's own effort as Casting's, with no row's effort in the start", () => {
    const own = start({})
    expect(own).toMatchObject({ effort: made.other, effortFrom: 'Casting' })
    expect(own).not.toHaveProperty('rowsEffort')
    expect(own.words).toContain(`; effort ${made.other}; fast mode`)
  })
})

describe("the launcher's two paths with a selection", () => {
  // MUTATION: the launcher does not pass on whether the office's answer named the agent; red on 'the agent'.
  it("starts at the agent's own effort from the office's answer, names the row's, and says the office named the agent", async () => {
    const made = unseen()
    const { id } = await anOpenCodeRow(made, { variant: made.effort, effort: made.effort })
    const own = await app.inject({ method: 'POST', url: `/api/office/run-models/agent/${AGENT}`, headers: AS_THE_PERSON, payload: { model: made.model, variant: made.other } })
    expect(own.statusCode, own.body).toBe(200)
    const values = await aCommandsStartFromTheOffice(['opencode', 'run', 'say hello'], { api, agent: AGENT, workspace: WORKSPACE, runtime: 'opencode', env: {}, place: 'conversation', headers: AS_THE_AGENT }) as { command: string[]; start: Start }
    expect(theOne(values.command, '--variant')).toBe(made.other)
    expect(values.start).toMatchObject({ effort: made.other, effortFrom: 'the agent', rowsEffort: made.effort })
    expect(values.start.words).toContain(`; effort ${made.other}, in place of Casting row ${String(id)}'s ${made.effort}${THE_OFFICE_SAYS}; fast mode`)
  })

  // MUTATION: the recheck refuses any difference again; red on the refusal.
  it("starts at a given selection's other effort, names the row's, and does not say where the effort came from", async () => {
    const made = unseen()
    const { id, exact } = await anOpenCodeRow(made, { variant: made.effort, effort: made.effort })
    const given = withNative(exact, { variant: made.other, effort: made.other })
    const values = await aCommandsStartFromTheOffice(['opencode', 'run', 'say hello'], { api, agent: AGENT, workspace: WORKSPACE, runtime: 'opencode', env: {}, place: 'builder', headers: AS_THE_AGENT, selection: given }) as { command: string[]; start: Start }
    expect(theOne(values.command, '--variant')).toBe(made.other)
    expect(values.start).toMatchObject({ effort: made.other, effortFrom: AN_UNPROVED_EFFORT_NOT_THE_ROWS, rowsEffort: made.effort })
    expect(values.start.words).toContain(`; effort ${made.other}, in place of Casting row ${String(id)}'s ${made.effort}; fast mode`)
  })
})

describe("case 3: a native refusal of an effort that is not the row's own holds nothing", () => {
  let made: ReturnType<typeof unseen>
  beforeAll(() => { made = unseen() })
  const start = (options: Record<string, unknown>) => theStartOf(made, options)
  const option = { kind: 'option', code: 'unknown_variant', said: 'Synthetic: the native program does not know this variant.' }

  // MUTATION: the sentence is removed and the hold is posted as before; red on the missing sentence.
  it("says the row is not held, in one sentence that names the effort, the native model, the row and the row's effort", () => {
    expect(theRefusalOfAnEffortNotTheRows(start({ rowsEffort: made.effort }), option)).toBe(
      `The native program refused effort ${made.other} for native model ${made.native} on Casting row 7, in place of the row's own effort ${made.effort}: ${option.said} The row is not held, because its own effort was not tried.`,
    )
    expect(theRefusalOfAnEffortNotTheRows(start({ rowsEffort: null, officeSaysTheAgent: true }), option)).toBe(
      `The native program refused effort ${made.other} for native model ${made.native} on Casting row 7, which sets no effort: ${option.said} The row is not held, because it was not tried without an effort.`,
    )
  })

  // MUTATION: the sentence is removed and the hold is posted as before; red on the missing function.
  it("has no sentence for a refusal of the model, or for a start at the row's own effort, so those hold the row as before", () => {
    expect(theRefusalOfAnEffortNotTheRows(start({ rowsEffort: made.effort }), { ...option, kind: 'model', code: 'model_not_found' })).toBeNull()
    expect(theRefusalOfAnEffortNotTheRows(start({}), option)).toBeNull()
  })
})
