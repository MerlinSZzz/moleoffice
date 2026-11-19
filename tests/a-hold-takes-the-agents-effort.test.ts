// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HOLD TAKES A SELECTION THAT DIFFERS FROM THE ROW'S ONLY IN ITS EFFORT.
 *
 * The launcher may start a Casting row with the agent's own effort in place of the row's, and the run records that
 * selection in its extra.launcherSelection. holdACasting in src/server/lib/casting.ts used to refuse unless the
 * recorded selection was exactly the row's, so a model refusal of such a run was answered 409 and the row was not
 * held. Now a selection that differs only in native.effort, in the one way theRowsEffortUnder in
 * src/config/launcher-selection.mjs allows, holds the row. Any other difference still gets the same 409 and the same
 * words, and writes nothing.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database. Each row is written, read and
 * held through the Casting doors as the person, against a session record this file files as the run started from the
 * row; nothing ran. The agent's own effort is made up for each run. The extra case compares its refusal with a
 * plainly wrong selection's, so this file copies none of the hold's words.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - the exact comparison comes back: the first case goes red on a 409 in place of a 200.
 *   - the check accepts any difference: the extra case goes red on a 200 in place of a 409.
 */
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import type { CastingSelection } from '../src/shared/casting.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const WORKER = 'hold-effort-worker'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }

/** A model, its native name and an effort made up for this test. */
function unseen() {
  const key = randomUUID()
  return { model: `office-${key}`, native: `native-${key}`, effort: `effort-${key}` }
}

let t: TestDb
let app: FastifyInstance
let worker = ''

async function call(method: 'GET' | 'POST', url: string, payload?: unknown) {
  return app.inject({ method, url, headers: AS_THE_PERSON, ...(payload === undefined ? {} : { payload: payload as never }) })
}

/** A row of `role`, every project, written as the person, naming `made` on claude-code with native data. Its id. */
async function aRow(role: string, made: ReturnType<typeof unseen>): Promise<number> {
  const reply = await call('POST', `/api/casting/${role}`, {
    program: { value: 'claude-code' }, model: { value: made.model }, effort: { value: made.effort }, native: { model: made.native, provider: null, variant: null },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { casting: { id: number } }).casting.id
}

/** The row's own selection, as its selection door answers it. */
async function theRowsSelection(id: number): Promise<CastingSelection> {
  const reply = await call('GET', `/api/casting/rows/${String(id)}/selection`)
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { selection: CastingSelection }).selection
}

/** A running run whose recorded selection is `selection`, filed as the person as the launcher files one. Its id. */
async function aRunStartedFrom(selection: CastingSelection): Promise<string> {
  const run = await call('POST', '/api/records', {
    kind: 'session', title: 'Synthetic: a run started from a Casting row', data: {
      runtime: selection.runtime, model: selection.model, servingAgent: worker, state: 'running', extra: { launcherSelection: selection },
    },
  })
  expect(run.statusCode, run.body).toBe(201)
  return (run.json() as { record: { id: string } }).record.id
}

/** Report a model refusal for `run` against row `id`, whose content revision is `revision`, as the person. */
async function hold(id: number, revision: string, run: string) {
  return call('POST', `/api/casting/rows/${String(id)}/hold`, {
    revision, run, refusal: { kind: 'model', code: 'model_not_found', said: 'Synthetic: the native program refused the selected model.' },
  })
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await call('POST', '/api/agents/started', { handle: WORKER, name: WORKER, role: THE_WORKER, runtime: 'claude-code', workArea: ['src'] })
  expect(made.statusCode, made.body).toBe(201)
  const listed = (await call('GET', '/api/participants')).json() as { agents: { id: string; handle: string }[] }
  worker = one(listed.agents.filter((agent) => agent.handle === WORKER), `the registry row of ${WORKER}`).id
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("a hold takes the selection a run recorded with the agent's own effort", () => {
  // MUTATION: the exact comparison comes back; red on a 409 in place of a 200.
  it("holds the row when the recorded selection differs from it only in the agent's own effort", async () => {
    const made = unseen()
    const id = await aRow(THE_WORKER, made)
    const rows = await theRowsSelection(id)
    const own = `own-${randomUUID()}`
    const recorded = { ...rows, native: { ...rows.native, effort: own } }
    const run = await aRunStartedFrom(recorded)
    const held = await hold(id, rows.casting!.revision, run)
    expect(held.statusCode, held.body).toBe(200)
    expect(held.json()).toMatchObject({ held: true, first: true })
    const refused = await call('GET', `/api/casting/rows/${String(id)}/selection`)
    expect(refused.statusCode, refused.body).toBe(409)
  })

  // MUTATION: the check accepts any difference; red on a 200 in place of a 409.
  it('refuses a selection that differs in another field with the same words and writes no hold', async () => {
    const made = unseen()
    const id = await aRow(THE_WORKER, made)
    const rows = await theRowsSelection(id)
    const recorded = { ...rows, casting: { ...rows.casting!, revision: `other-revision-${randomUUID()}` } }
    const run = await aRunStartedFrom(recorded)
    const held = await hold(id, rows.casting!.revision, run)
    expect(held.statusCode, held.body).toBe(409)
    // A CONTROL: a selection that names another row's model is refused by the same comparison, so the words are read
    // from the server and not copied here.
    const other = await aRow(THE_WORKER, unseen())
    const otherRows = await theRowsSelection(other)
    const controlRun = await aRunStartedFrom({ ...rows, model: otherRows.model })
    const control = await hold(other, otherRows.casting!.revision, controlRun)
    expect(control.statusCode, control.body).toBe(409)
    const said = (held.json() as { error: string }).error
    expect(said).not.toBe('')
    expect(said).toBe((control.json() as { error: string }).error)
    const stillRead = await call('GET', `/api/casting/rows/${String(id)}/selection`)
    expect(stillRead.statusCode, stillRead.body).toBe(200)
    expect((stillRead.json() as { selection: CastingSelection }).selection).toEqual(rows)
  })
})
