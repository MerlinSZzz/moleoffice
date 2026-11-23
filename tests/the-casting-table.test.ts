// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_MODELS_START_VALUES } from '../src/config/model-efforts.mjs'
/**
 * THE CASTING TABLE (选角表): SEVERAL CASTINGS FOR EACH ROLE, THE ONE MARK, THE PROJECT RULE, AND THE READER
 * THAT TAKES A RUN'S MODEL FROM IT.
 *
 * What this file proves:
 *
 *   1. GET /api/casting answers every role card, and a role nobody has cast has no casting and says so.
 *   2. A role holds several castings. The first casting of a scope carries the mark, and the answer
 *      says so; a later one does not. Each cell says where it came from, and every write adds a
 *      history row that names the casting.
 *   3. The one mark: moving it is one write that takes it from the old casting; the marked casting is
 *      refused removal while others remain in its scope, with nothing written; the last casting of a
 *      scope may go.
 *   4. The project rule: a project's own castings of a role replace the every-project castings as a
 *      whole. There is no cell-by-cell override any more.
 *   5. An agent whose own key does not prove the secretary card is refused at all four write doors with a 403 and
 *      the code castingNotOwnerOrSecretary, and nothing is written: here the secretary and a worker are named with no
 *      key. A secretary with its own key is in
 *      tests/a-secretary-changes-the-casting-table.test.ts.
 *   6. A bad program, role, project, casting or decision is refused, and nothing is written, even
 *      when another cell of the same write was good.
 *   7. `theModelARunGets` takes a builder's model from a matching marked casting. A check takes
 *      its program, model and effort from the inspector's marked casting. The door the launcher asks
 *      gives a builder's Codex row as openai/<model>, the name the launcher's worker command takes, and a
 *      row already named openai/<model> as it is. A check keeps the name the row holds (item 2ac). The door gives a
 *      Codex model set on the agent's own profile the same way (item 2ae).
 *   8. Migration 0190 keeps every row of migration 0189's table with every cell and source, marks
 *      each, copies into a project row the cells it left empty and the every-project row filled, and
 *      writes one history row for each saying what it did.
 *
 * Every test runs against a throwaway database through the real routes. No model is called.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { nativeRefusalWithCode } from '../src/config/launcher-selection.mjs'
import { GATES } from '../src/config/gates.mjs'
import { readCastingProbability, type CastingFor, type CastingHistory, type CastingReading, type CastingRow, type CastingWritten } from '../src/shared/casting.ts'
import type { TheModelARunGets } from '../src/shared/run-models.ts'

const WORKSPACE = 'default'
const PROJECT = 'casting-proj'
const QUIET_PROJECT = 'casting-quiet'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': WORKSPACE })

let t: TestDb
let app: FastifyInstance
let decision = ''
let notADecision = ''
let castingSecretaryKey = ''

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}

async function add(role: string, body: unknown): Promise<CastingWritten> {
  const reply = await call('POST', `/api/casting/${role}`, PERSON, body)
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as CastingWritten
}

async function change(id: number, body: unknown): Promise<CastingWritten> {
  const reply = await call('PATCH', `/api/casting/rows/${String(id)}`, PERSON, body)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as CastingWritten
}

async function mark(id: number): Promise<CastingWritten> {
  const reply = await call('POST', `/api/casting/rows/${String(id)}/mark`, PERSON)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as CastingWritten
}

async function remove(id: number): Promise<CastingWritten> {
  const reply = await call('DELETE', `/api/casting/rows/${String(id)}`, PERSON)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as CastingWritten
}

async function table(): Promise<CastingReading> {
  const reply = await call('GET', '/api/casting', PERSON)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as CastingReading
}

async function castingFor(role: string, project?: string): Promise<CastingFor> {
  const reply = await call('GET', `/api/casting/for/${role}${project === undefined ? '' : `?project=${project}`}`, PERSON)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as CastingFor
}

/** Every casting of one role, in every scope. */
async function castingsOf(role: string): Promise<CastingRow[]> {
  return ((await table()).roles.find((card) => card.role === role)?.scopes ?? []).flatMap((scope) => scope.castings)
}

/** Both tables, whole, to prove a refused write changed nothing. */
function stored(): string {
  return JSON.stringify([
    t.client.sqlite.prepare('SELECT * FROM casting_rows ORDER BY id').all(),
    t.client.sqlite.prepare('SELECT * FROM casting_row_changes ORDER BY id').all(),
  ])
}

/** Empty both tables, so a test starts from a table nobody has written. The database is the test's own. */
function emptyTheTable(): void {
  t.client.sqlite.prepare('DELETE FROM casting_rows').run()
  t.client.sqlite.prepare('DELETE FROM casting_row_changes').run()
}

async function forAgent(agent: string, query: string, headers: Record<string, string> = PERSON): Promise<TheModelARunGets> {
  const reply = await call('GET', `/api/office/run-models/for/${agent}?${query}`, headers)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as TheModelARunGets
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await call('POST', '/api/agents/started', headers, payload)
  expect(reply.statusCode, reply.body).toBe(201)
}

async function file(kind: string, title: string): Promise<string> {
  // A DECISION SAYS WHAT IT REPLACES (problem ZSWftCSVUP2r); a test decision replaces none.
  const reply = await call('POST', '/api/records', PERSON, { kind, title, data: kind === 'decision' ? { ...governsTheWholeProject(), replaces: [] } : {} })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: PROJECT, title: 'A project the test made' })
  createWorkspace({ id: QUIET_PROJECT, title: 'A project with no castings of its own' })
  const secretary = await call('POST','/api/agents/started',PERSON,{ handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary', runtime: 'claude-code' })
  expect(secretary.statusCode,secretary.body).toBe(201)
  castingSecretaryKey = secretary.json().whatToGiveIt.key
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'cast-worker', name: 'Cast worker', role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  decision = await file('decision', 'The test decides how a worker is cast')
  notADecision = await file('note', 'A note that is not a decision')
}, 90_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('reading the table', () => {
  it('answers every role card, and a role nobody has cast has no casting and says so', async () => {
    const read = await table()
    // NO MAILER SINCE 1 OCTOBER 2026: the mail tool is off the role cards.
    expect(read.roles.map((card) => card.role)).toEqual(['worker', 'supervisor', 'secretary', 'inspector'])
    for (const card of read.roles) {
      expect(card.scopes).toEqual([])
      expect(card.says).toBe('Nobody has cast this role. The table holds no casting for it.')
    }
    const forOne = await castingFor('supervisor')
    expect(forOne).toMatchObject({ casting: null, scope: null, model: null })
    expect(forOne.empty).toEqual(['program', 'model', 'effort', 'difficulty', 'quota', 'cost', 'labels', 'probability', 'out_until', 'why'])
    expect(forOne.says).toBe('The Casting table marks no casting for supervisor, so the tools have no row to take.')
  })

  it('refuses a role no card holds with a 404 naming the cards', async () => {
    const reply = await call('GET', '/api/casting/for/director', PERSON)
    expect(reply.statusCode, reply.body).toBe(404)
    expect(reply.body).toContain('The cards are worker, supervisor, secretary, inspector.')
  })
})

describe('several castings for one role', () => {
  it('holds several castings of one role; the first carries the mark and says so, a later one does not', async () => {
    emptyTheTable()
    const first = await add('worker', {
      program: { value: 'dsh', decision },
      model: { value: '  deepseek-v4.1-flash ', decision: ` ${decision} ` },
      difficulty: { value: 'simple to hard', decision },
      quota: { value: 'its own DeepSeek quota' },
      cost: { value: 'cheap for what it gives' },
      why: { value: 'An ordinary worker wants speed and a low price.' },
    })
    expect(first.casting.marked).toBe(true)
    expect(first.says).toBe(`Added casting ${String(first.casting.id)} of worker for every project. It is the first casting of worker there, so it carries the mark: the tools take this one.`)
    expect(first.casting.cells.program).toMatchObject({ value: 'dsh', from: { decision: { id: decision, project: WORKSPACE }, moved: false, copied: false, by: { kind: 'human', id: THE_PERSON } } })
    expect(first.casting.cells.model.value).toBe('deepseek-v4.1-flash')
    expect(first.casting.cells.difficulty.value).toBe('simple to hard')
    expect(first.casting.cells.effort).toEqual({ value: null, from: null })

    const second = await add('worker', { program: { value: 'claude-code' }, model: { value: 'claude-opus-5-5' }, difficulty: { value: 'hard' } })
    const third = await add('worker', { program: { value: 'codex' }, model: { value: 'gpt-6-luna' }, effort: { value: 'max' } })
    expect(second.casting.marked).toBe(false)
    expect(second.says).toBe(`Added casting ${String(second.casting.id)} of worker for every project. The tools still take casting ${String(first.casting.id)} there.`)

    const workers = await castingsOf('worker')
    expect(workers.map((row) => [row.id, row.marked, row.cells.model.value])).toEqual([
      [first.casting.id, true, 'deepseek-v4.1-flash'],
      [second.casting.id, false, 'claude-opus-5-5'],
      [third.casting.id, false, 'gpt-6-luna'],
    ])
    expect((await castingFor('worker')).casting?.id).toBe(first.casting.id)

    // EVERY WRITE ADDS A HISTORY ROW THAT NAMES THE CASTING.
    const history = (await call('GET', `/api/casting/worker/history?casting=${String(first.casting.id)}`, PERSON)).json() as CastingHistory
    expect(history.changes.map((one) => [one.castingId, one.what, one.before, one.after?.marked])).toEqual([[first.casting.id, 'add', null, true]])
    expect(history.changes[0]?.decisions).toEqual([decision])

    // A CHANGE SETS ONLY THE CELLS IT NAMES, and its history row holds the row before it.
    await change(first.casting.id, { effort: { value: 'high' } })
    const again = (await call('GET', `/api/casting/worker/history?casting=${String(first.casting.id)}`, PERSON)).json() as CastingHistory
    expect(again.changes.map((one) => one.what)).toEqual(['change', 'add'])
    expect(again.changes[0]?.before?.cells.effort.value).toBeNull()
    expect(again.changes[0]?.after?.cells.effort.value).toBe('high')
    expect(again.changes[0]?.after?.cells.program.from?.decision?.id).toBe(decision)
    // THE ROLE'S WHOLE HISTORY holds every casting's changes.
    const whole = (await call('GET', '/api/casting/worker/history', PERSON)).json() as CastingHistory
    expect(whole.changes.map((one) => one.castingId).sort()).toEqual([first.casting.id, first.casting.id, second.casting.id, third.casting.id].sort())
  })
})

describe('the one mark', () => {
  it('moves the mark in one write, taking it from the casting that had it', async () => {
    const [first, second] = await castingsOf('worker')
    if (first === undefined || second === undefined) throw new Error('the castings of the test before are missing')
    const moved = await mark(second.id)
    expect(moved.says).toBe(`Casting ${String(second.id)} carries the mark now: the tools take it for worker in every project. Casting ${String(first.id)} no longer does.`)
    const workers = await castingsOf('worker')
    expect(workers.filter((row) => row.marked).map((row) => row.id)).toEqual([second.id])
    expect((await castingFor('worker')).model).toBe('claude-opus-5-5')
    const firstHistory = (await call('GET', `/api/casting/worker/history?casting=${String(first.id)}`, PERSON)).json() as CastingHistory
    expect(firstHistory.changes[0]).toMatchObject({ what: 'unmark', before: { marked: true }, after: { marked: false } })
    const secondHistory = (await call('GET', `/api/casting/worker/history?casting=${String(second.id)}`, PERSON)).json() as CastingHistory
    expect(secondHistory.changes[0]).toMatchObject({ what: 'mark', before: { marked: false }, after: { marked: true } })
    // MARKING THE MARKED CASTING WRITES NOTHING.
    const before = stored()
    expect((await mark(second.id)).says).toBe(`Casting ${String(second.id)} already carries the mark. Nothing was written.`)
    expect(stored()).toBe(before)
  })

  it('refuses to remove the marked casting while others remain, and writes nothing', async () => {
    const marked = (await castingsOf('worker')).find((row) => row.marked)
    if (marked === undefined) throw new Error('no marked worker casting')
    const before = stored()
    const reply = await call('DELETE', `/api/casting/rows/${String(marked.id)}`, PERSON)
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.body).toContain('Mark another casting first, then remove this one. Nothing was written.')
    expect(reply.body).toContain('castingRemoveTheMarkedRow')
    expect(stored()).toBe(before)
  })

  it('removes a casting that is not marked, and the last casting of a scope, mark and all', async () => {
    const workers = await castingsOf('worker')
    for (const row of workers.filter((one) => !one.marked)) await remove(row.id)
    const last = (await castingsOf('worker'))[0]
    if (last === undefined) throw new Error('no worker casting left')
    expect(last.marked).toBe(true)
    const gone = await remove(last.id)
    expect(gone.says).toBe(`Removed casting ${String(last.id)}, the last casting of worker for every project. The table marks no casting there now.`)
    expect(await castingsOf('worker')).toEqual([])
    expect((await castingFor('worker')).casting).toBeNull()
    // THE HISTORY OF A REMOVED CASTING IS KEPT.
    const history = (await call('GET', `/api/casting/worker/history?casting=${String(last.id)}`, PERSON)).json() as CastingHistory
    expect(history.changes[0]).toMatchObject({ what: 'remove', after: null, before: { marked: true } })
  })
})

describe('the project rule', () => {
  it("takes the project's marked casting if the project has castings of the role, else the every-project one, never cell by cell", async () => {
    emptyTheTable()
    const every = await add('worker', { program: { value: 'dsh' }, model: { value: 'the-every-project-model' }, effort: { value: 'high' } })
    const own = await add('worker', { project: PROJECT, model: { value: 'the-projects-model' } })
    expect(own.casting.marked).toBe(true)
    expect(own.says).toContain(`It is the first casting of worker there, so it carries the mark`)

    const inProject = await castingFor('worker', PROJECT)
    expect(inProject).toMatchObject({ scope: 'the project', model: 'the-projects-model', casting: { id: own.casting.id } })
    // THE PROJECT'S CASTING LEAVES PROGRAM AND EFFORT EMPTY, AND THEY STAY EMPTY: nothing is taken from every project.
    expect(inProject.program).toBeNull()
    expect(inProject.effort).toBeNull()
    expect(inProject.empty).toContain('program')

    const inQuiet = await castingFor('worker', QUIET_PROJECT)
    expect(inQuiet).toMatchObject({ scope: 'every project', model: 'the-every-project-model', program: 'dsh', casting: { id: every.casting.id } })
    expect((await castingFor('worker')).casting?.id).toBe(every.casting.id)

    const card = (await table()).roles.find((one) => one.role === 'worker')
    expect(card?.scopes.map((scope) => [scope.project, scope.castings.map((row) => row.id)])).toEqual([
      [null, [every.casting.id]],
      [PROJECT, [own.casting.id]],
    ])
  })
})

describe('an agent is refused, and nothing is written', () => {
  it('refuses an agent its own key does not prove a secretary at all four write doors with a 403, a code and words, and writes nothing', async () => {
    const some = (await castingsOf('worker'))[0]
    if (some === undefined) throw new Error('no worker casting')
    for (const [method, url, body] of [
      ['POST', '/api/casting/worker', { model: { value: 'x' } }],
      ['PATCH', `/api/casting/rows/${String(some.id)}`, { model: { value: 'x' } }],
      ['DELETE', `/api/casting/rows/${String(some.id)}`, undefined],
      ['POST', `/api/casting/rows/${String(some.id)}/mark`, undefined],
    ] as const) {
      for (const agent of [THE_TEST_OFFICES_SECRETARY.handle, 'cast-worker']) {
        const before = stored()
        const reply = await call(method, url, asAgent(agent), body)
        expect(reply.statusCode, `${agent} ${method} ${url}: ${reply.body}`).toBe(403)
        expect(reply.json()).toMatchObject({ code: 'castingNotOwnerOrSecretary' })
        expect(reply.body).toContain('Changing the Casting table is for the owner, or for an agent holding the secretary card.')
        expect(stored(), `${agent} ${method} ${url} wrote something`).toBe(before)
      }
    }
  })

  it('refuses a bad program, role, project, casting or decision, and writes nothing, even beside a good cell', async () => {
    const some = (await castingsOf('worker'))[0]
    if (some === undefined) throw new Error('no worker casting')
    for (const [method, url, body, status, says] of [
      ['POST', '/api/casting/worker', { model: { value: 'fine' }, program: { value: 'gpt-cli' } }, 400, 'is not a program the office knows'],
      ['POST', '/api/casting/director', { model: { value: 'fine' } }, 404, 'The cards are worker, supervisor'],
      ['POST', '/api/casting/worker', { project: 'no-such-project', model: { value: 'fine' } }, 404, 'no-such-project'],
      ['POST', '/api/casting/worker', { model: { value: 'fine', decision: 'nosuchrecord' } }, 400, 'holds no record with that id'],
      ['POST', '/api/casting/worker', { model: { value: 'fine', decision: notADecision } }, 400, 'not a decision'],
      ['POST', '/api/casting/worker', { model: { value: null, decision } }, 400, 'An empty cell names no decision'],
      ['POST', '/api/casting/worker', {}, 400, 'Name at least one of program, model, effort, difficulty, quota, cost, labels, probability, out_until, why'],
      ['POST', '/api/casting/worker', { model: { value: 'fine' }, colour: { value: 'red' } }, 400, 'colour'],
      ['PATCH', `/api/casting/rows/${String(some.id)}`, { model: { value: 'fine' }, program: { value: 'gpt-cli' } }, 400, 'is not a program the office knows'],
      ['PATCH', `/api/casting/rows/${String(some.id)}`, { project: PROJECT, model: { value: 'fine' } }, 400, 'project'],
      ['PATCH', '/api/casting/rows/999999', { model: { value: 'fine' } }, 404, 'There is no casting with the id 999999.'],
      ['DELETE', '/api/casting/rows/999999', undefined, 404, 'There is no casting with the id 999999.'],
      ['POST', '/api/casting/rows/999999/mark', undefined, 404, 'There is no casting with the id 999999.'],
      ['POST', '/api/casting/rows/not-a-number/mark', undefined, 400, 'must be a casting id'],
    ] as const) {
      const before = stored()
      const reply = await call(method, url, PERSON, body)
      expect(reply.statusCode, `${method} ${url} ${JSON.stringify(body)}: ${reply.body}`).toBe(status)
      expect(reply.body).toContain(says)
      expect(stored(), `${method} ${url} ${JSON.stringify(body)} wrote something`).toBe(before)
    }
  })
})

describe('the model a run gets comes from the marked casting', () => {
  it("takes a builder's model and effort from its role's marked casting", async () => {
    emptyTheTable()
    await add('worker', { program: { value: 'claude-code' }, model: { value: 'the-cast-model' }, effort: { value: 'max' } })
    const unmarked = await add('worker', { program: { value: 'claude-code' }, model: { value: 'the-unmarked-model' } })
    const answered = await forAgent('cast-worker', 'place=builder&runtime=claude-code')
    // The office now answers the Casting effort separately; the launcher passes that value at startup.
    expect(answered).toMatchObject({ model: 'the-cast-model', from: 'the role', runtime: 'claude-code', variant: null, effort: 'max', effortFrom: 'Casting' })
    expect(answered.says).toBe('The Casting table names the-cast-model for worker. The run gets effort max from the Casting row for worker.')
    // AND THE OTHER CASTING ONCE THE MARK MOVES TO IT.
    await mark(unmarked.casting.id)
    expect((await forAgent('cast-worker', 'place=builder&runtime=claude-code')).model).toBe('the-unmarked-model')
  })

  it('does not use a model the marked casting names for another program, or for no program, and says why', async () => {
    const marked = (await castingsOf('worker')).find((row) => row.marked)
    if (marked === undefined) throw new Error('no marked worker casting')
    await change(marked.id, { program: { value: 'dsh' } })
    const other = await forAgent('cast-worker', 'place=builder&runtime=claude-code')
    expect(other.from).toBe('the settings file')
    expect(other.says).toContain('The Casting table names the-unmarked-model for worker on dsh, and this run is on claude-code, so it is not used.')

    await change(marked.id, { program: { value: null } })
    const none = await forAgent('cast-worker', 'place=builder&runtime=claude-code')
    expect(none.from).toBe('the settings file')
    expect(none.says).toContain('names the-unmarked-model for worker and no program')
  })

  it("takes the check's program, model and effort from the inspector's marked casting", async () => {
    const inspector = await add('inspector', { program: { value: 'claude-code' }, model: { value: 'the-inspectors-model' } })
    const check = await forAgent('cast-worker', 'place=check')
    expect(check).toMatchObject({ model: 'the-inspectors-model', from: 'the role', runtime: 'claude-code', variant: null })

    // THE ROW'S EFFORT GOES WITH ITS MODEL TO A CHECK (wave 13v round 27), and nothing says it is dropped.
    // MUTATION PROOF (after a green control): in run-models.ts give a check `variant: null` again; this goes red.
    await change(inspector.casting.id, { effort: { value: 'max' } })
    const atMax = await forAgent('cast-worker', 'place=check')
    expect(atMax).toMatchObject({ model: 'the-inspectors-model', from: 'the role', runtime: 'claude-code', variant: 'max', effort: 'max', effortFrom: 'Casting' })
    expect(atMax.says).toBe('The Casting table names the-inspectors-model for inspector. The run gets effort max from the Casting row for inspector.')

    await change(inspector.casting.id, { program: { value: 'codex' }, model: { value: 'gpt-6.1-sol' }, effort: { value: 'xhigh' } })
    const codex = await forAgent('cast-worker', 'place=check')
    expect(codex).toMatchObject({ runtime: 'codex', model: 'gpt-6.1-sol', from: 'the role', variant: 'xhigh', effort: 'xhigh', effortFrom: 'Casting' })
    expect(codex.says).toBe('The Casting table names gpt-6.1-sol for inspector. The run gets effort xhigh from the Casting row for inspector.')
    expect(codex.casting?.id).toBe(inspector.casting.id)
  })

  it("reads the project's marked casting for the project a request names", async () => {
    const marked = (await castingsOf('worker')).find((row) => row.marked && row.project === null)
    if (marked === undefined) throw new Error('no marked worker casting')
    await change(marked.id, { program: { value: 'claude-code' } })
    await add('worker', { project: PROJECT, program: { value: 'claude-code' }, model: { value: 'the-projects-model' } })
    const inProject = await forAgent('cast-worker', 'place=builder&runtime=claude-code', { ...PERSON, 'x-mole-office-workspace': PROJECT })
    expect(inProject.model).toBe('the-projects-model')
    expect((await forAgent('cast-worker', 'place=builder&runtime=claude-code')).model).toBe('the-unmarked-model')
  })

  // THE LAUNCHER GIVEN NO --model ASKS THIS DOOR (theModelTheOfficeGives in tools/sandbox-common.mjs), and its worker
  // command takes a Codex model only as openai/<model> (theNameCodexTakes in tools/sandbox.mjs). Before item 2ac the door
  // answered a Codex row's bare name, so the launcher refused it and started nothing.
  it('gives a Codex row to the launcher as openai/<model>, and a row already named openai/<model> as it is (item 2ac)', async () => {
    const codex = await add('worker', { program: { value: 'codex' }, model: { value: 'gpt-6.1-sol' } })
    await mark(codex.casting.id)
    const bare = await forAgent('cast-worker', 'place=builder&runtime=codex')
    expect(bare).toMatchObject({ runtime: 'codex', model: 'openai/gpt-6.1-sol', from: 'the role' })
    expect(bare.casting?.id).toBe(codex.casting.id)
    // The words keep the row's name as the row holds it; only the model the launcher is given carries openai/.
    expect(bare.says).toContain('The Casting table names gpt-6.1-sol for worker.')

    await change(codex.casting.id, { model: { value: 'openai/gpt-6-luna' } })
    const named = await forAgent('cast-worker', 'place=builder&runtime=codex')
    expect(named).toMatchObject({ runtime: 'codex', model: 'openai/gpt-6-luna', from: 'the role' })
  })

  // A PROFILE TAKES A BARE CODEX NAME: whyAnAgentsModelIsRefused in src/shared/run-models.ts refuses only a missing
  // program, an empty model and an empty variant. Before item 2ae the door gave such a name as the profile holds it, and
  // the launcher refused it as it refused a bare Casting row before item 2ac.
  it("gives a Codex model on the agent's own profile to the launcher as openai/<model>, and one already named so as it is (item 2ae)", async () => {
    await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'cast-codex', name: 'Cast Codex worker', role: 'worker', runtime: 'codex', workArea: ['src'] })
    const set = async (model: string): Promise<void> => {
      const reply = await call('POST', '/api/office/run-models/agent/cast-codex', PERSON, { model })
      expect(reply.statusCode, reply.body).toBe(200)
    }
    await set('gpt-6.1-sol')
    const bare = await forAgent('cast-codex', 'place=builder&runtime=codex')
    expect(bare).toMatchObject({ runtime: 'codex', model: 'openai/gpt-6.1-sol', from: 'the agent' })
    // The words keep the name as the profile holds it; only the model the launcher is given carries openai/. They go on
    // to say whether the Casting row's effort applies, which is not this item.
    expect(bare.says.startsWith("gpt-6.1-sol is this agent's own model, set on its profile."), bare.says).toBe(true)
    expect(bare.says).not.toContain('openai/gpt-6.1-sol')

    await set('openai/gpt-6-luna')
    const named = await forAgent('cast-codex', 'place=builder&runtime=codex')
    expect(named).toMatchObject({ runtime: 'codex', model: 'openai/gpt-6-luna', from: 'the agent' })
  })
})

describe('migration 0190 keeps every row of the table before it', () => {
  it('keeps each row with every cell and source, marks it, copies the project cells, and says what it did', async () => {
    const sqlite = t.client.sqlite
    emptyTheTable()
    // THE ROWS MIGRATION 0189'S TABLE HELD, written in its shape: an every-project worker row with three cells, a
    // project worker row that left program and effort empty, a supervisor row moved from Settings, and one history row.
    const source = (at: string, id: string, moved: boolean, decided: string | null) =>
      JSON.stringify({ at, by: { kind: 'human', id }, decision: decided === null ? null : { id: decided, project: WORKSPACE }, moved })
    const insert = sqlite.prepare(
      'INSERT INTO casting (role, project, program, program_from, model, model_from, effort, effort_from, why, why_from, changed_at, changed_by_kind, changed_by_id, authority) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    insert.run('worker', '', 'dsh', source('2026-09-29 10:00:00', THE_PERSON, false, decision), 'deepseek-v4.1-flash', source('2026-09-29 10:00:00', THE_PERSON, false, decision), 'high', source('2026-09-29 10:01:00', THE_PERSON, false, null), null, null, '2026-09-29 10:01:00', 'human', THE_PERSON, null)
    insert.run('worker', PROJECT, null, null, 'claude-sonnet-5-5', source('2026-09-29 11:00:00', THE_PERSON, false, null), null, null, 'A sample reason for the project.', source('2026-09-29 11:00:00', THE_PERSON, false, null), '2026-09-29 11:00:00', 'human', THE_PERSON, null)
    insert.run('supervisor', '', 'claude-code', source('2026-09-20 09:00:00', THE_PERSON, true, null), 'the-old-supervisor-model', source('2026-09-20 09:00:00', THE_PERSON, true, null), null, null, null, null, '2026-09-20 09:00:00', 'human', THE_PERSON, null)
    sqlite
      .prepare("INSERT INTO casting_changes (role, project, at, by_kind, by_id, authority, decisions, note, before, after) VALUES ('supervisor', '', '2026-09-20 09:00:00', 'human', ?, NULL, '[]', ?, NULL, ?)")
      .run(THE_PERSON, 'Moved from Settings, The model each run uses, by migration 0189.', JSON.stringify({ program: { value: 'claude-code', from: null }, model: { value: 'the-old-supervisor-model', from: null }, effort: { value: null, from: null }, why: { value: null, from: null } }))
    const before = sqlite.prepare('SELECT * FROM casting ORDER BY role, project').all() as Record<string, string | null>[]

    const migration = readFileSync(new URL('../drizzle/0190_several_castings_for_each_role.sql', import.meta.url), 'utf8')
    for (const statement of migration.split('--> statement-breakpoint')) sqlite.exec(statement)

    // EVERY ROW SURVIVES, with every cell and its source, and carries the mark.
    const after = sqlite.prepare('SELECT * FROM casting_rows ORDER BY role, project').all() as Record<string, string | number | null>[]
    expect(after.map((row) => [row['role'], row['project'], row['marked']])).toEqual(before.map((row) => [row['role'], row['project'], 1]))
    for (const [index, old] of before.entries()) {
      const now = after[index] ?? {}
      for (const cell of ['program', 'model', 'effort', 'why']) {
        if (old[cell] !== null) {
          expect(now[cell], `${String(old['role'])}/${String(old['project'])} ${cell}`).toBe(old[cell])
          expect(now[`${cell}_from`], `${String(old['role'])}/${String(old['project'])} ${cell} source`).toBe(old[`${cell}_from`])
        }
      }
      for (const column of ['changed_at', 'changed_by_kind', 'changed_by_id', 'authority']) expect(now[column]).toBe(old[column])
    }
    // THE PROJECT ROW'S EMPTY CELLS THE EVERY-PROJECT ROW FILLED ARE COPIED, and say so; its own cells are its own.
    const project = after.find((row) => row['project'] === PROJECT) ?? {}
    expect(project['program']).toBe('dsh')
    expect(JSON.parse(String(project['program_from']))).toEqual({ ...JSON.parse(source('2026-09-29 10:00:00', THE_PERSON, false, decision)), copied: true })
    expect(project['effort']).toBe('high')
    expect(JSON.parse(String(project['effort_from']))).toMatchObject({ copied: true, decision: null })
    expect(project['model']).toBe('claude-sonnet-5-5')
    expect(JSON.parse(String(project['model_from']))['copied']).toBeUndefined()
    expect(project['why']).toBe('A sample reason for the project.')

    // THE TOOLS GET WHAT THEY GOT BEFORE: the project's model, and the program and effort they took from every project.
    const inProject = await castingFor('worker', PROJECT)
    expect(inProject).toMatchObject({ program: 'dsh', model: 'claude-sonnet-5-5', effort: 'high' })
    expect(inProject.cells.program.from).toMatchObject({ copied: true, decision: { id: decision } })
    expect((await castingFor('supervisor')).cells.model.from).toMatchObject({ moved: true, copied: false })

    // EVERY HISTORY ROW OF 0189 IS COPIED WITH ITS ID, and every row gets one more saying what the migration did.
    const supervisor = (await castingsOf('supervisor'))[0]
    const worker = (await castingsOf('worker')).find((row) => row.project === PROJECT)
    if (supervisor === undefined || worker === undefined) throw new Error('a migrated casting is missing')
    const supervisorHistory = (await call('GET', `/api/casting/supervisor/history?casting=${String(supervisor.id)}`, PERSON)).json() as CastingHistory
    expect(supervisorHistory.changes.map((one) => [one.what, one.by.kind])).toEqual([['migrate', 'migration'], ['add', 'human']])
    expect(supervisorHistory.changes[1]?.note).toBe('Moved from Settings, The model each run uses, by migration 0189.')
    expect(supervisorHistory.changes[1]?.after?.marked).toBeNull()
    const workerHistory = (await call('GET', `/api/casting/worker/history?casting=${String(worker.id)}`, PERSON)).json() as CastingHistory
    expect(workerHistory.changes).toHaveLength(1)
    expect(workerHistory.changes[0]?.note).toBe(
      `Kept by migration 0190, with every cell and its source. It was the only casting of worker in ${PROJECT}, so it carries the mark: the tools take this one. ` +
        'Copied from the every-project row, because this row left them empty and the tools took them from there: program, effort.',
    )
    expect(workerHistory.changes[0]?.before?.cells.program.value).toBeNull()
    expect(workerHistory.changes[0]?.after?.cells.program.value).toBe('dsh')
    expect(sqlite.prepare('SELECT count(*) AS n FROM casting_row_changes').get()).toEqual({ n: 1 + after.length })
  })
})

describe('the probability cell', () => {
  it('normalizes loose probability words on both write doors and keeps canonical values in its answer and history', async () => {
    emptyTheTable()
    const written: CastingWritten['casting'][] = []
    for (const value of ['0.3', '.3', '30%', '30 %']) {
      const added = await add('worker', { probability: { value } })
      expect(added.casting.cells.probability.value).toBe('0.3')
      written.push(added.casting)
    }
    expect(t.client.sqlite.prepare('SELECT probability FROM casting_rows ORDER BY id').all()).toEqual([
      { probability: '0.3' }, { probability: '0.3' }, { probability: '0.3' }, { probability: '0.3' },
    ])
    const first = written[0]
    if (first === undefined) throw new Error('the first probability casting is missing')
    expect((await castingFor('worker')).cells.probability.value).toBe('0.3')

    const changed = await change(first.id, { probability: { value: '25 %' } })
    expect(changed.casting.cells.probability.value).toBe('0.25')
    const historyReply = await call('GET', `/api/casting/worker/history?casting=${String(first.id)}`, PERSON)
    expect(historyReply.statusCode, historyReply.body).toBe(200)
    const history = historyReply.json() as CastingHistory
    expect(history.changes.map((entry) => entry.what)).toEqual(['change', 'add'])
    expect(history.changes[0]?.before?.cells.probability.value).toBe('0.3')
    expect(history.changes[0]?.after?.cells.probability.value).toBe('0.25')
    expect(history.changes[1]?.after?.cells.probability.value).toBe('0.3')
  })

  it('refuses values outside the probability forms on add and change without writing anything', async () => {
    emptyTheTable()
    const existing = await add('worker', { model: { value: 'sample' }, probability: { value: '0.3' } })
    for (const value of ['1.1', '-0.1', 'abc', '0.3.1']) {
      for (const [method, url, body] of [
        ['POST', '/api/casting/worker', { model: { value: 'another sample' }, probability: { value } }],
        ['PATCH', `/api/casting/rows/${String(existing.casting.id)}`, { probability: { value } }],
      ] as const) {
        const before = stored()
        const reply = await call(method, url, PERSON, body)
        expect(reply.statusCode, `${method} ${JSON.stringify(value)}: ${reply.body}`).toBe(400)
        expect(reply.body).toContain(value)
        expect(reply.body).toContain('decimal from 0 to 1')
        expect(reply.body).toContain('percentage from 0% to 100%')
        expect(stored(), `${method} ${JSON.stringify(value)} wrote something`).toBe(before)
      }
    }
  })

  it('reads empty as null and refuses a stored value that is not canonical', () => {
    expect(readCastingProbability(null)).toBeNull()
    expect(readCastingProbability('0.3')).toBe(0.3)
    expect(readCastingProbability('1')).toBe(1)
    expect(readCastingProbability('0')).toBe(0)
    for (const value of ['', '.3', '0.30', '1.0', '1.01', '30%']) {
      expect(() => readCastingProbability(value), value).toThrow(/canonical/)
    }
  })

  it('reads an image written before the probability, labels and Out until cells as empty', async () => {
    emptyTheTable()
    const added = await add('worker', { model: { value: 'current-model' } })
    const source = { at: '2026-10-01 10:00:00', by: { kind: 'human', id: THE_PERSON }, decision: null, moved: false, copied: false }
    const oldImage = JSON.stringify({
      program: { value: null, from: null },
      model: { value: 'old-model', from: source },
      effort: { value: null, from: null },
      difficulty: { value: 'hard', from: source },
      quota: { value: null, from: null },
      cost: { value: null, from: null },
      why: { value: null, from: null },
      marked: true,
    })
    t.client.sqlite
      .prepare(
        "INSERT INTO casting_row_changes (casting_id, role, project, what, at, by_kind, by_id, decisions, before, after) " +
          "VALUES (?, 'worker', '', 'change', '2026-10-01 10:00:00', 'human', ?, '[]', ?, ?)",
      )
      .run(added.casting.id, THE_PERSON, oldImage, oldImage)

    const reply = await call('GET', `/api/casting/worker/history?casting=${String(added.casting.id)}`, PERSON)
    expect(reply.statusCode, reply.body).toBe(200)
    const history = reply.json() as CastingHistory
    expect(history.changes[0]?.before?.cells.probability).toEqual({ value: null, from: null })
    expect(history.changes[0]?.after?.cells.probability).toEqual({ value: null, from: null })
    expect(history.changes[0]?.before?.cells.labels).toEqual({ value: null, from: null })
    expect(history.changes[0]?.after?.cells.labels).toEqual({ value: null, from: null })
    expect(history.changes[0]?.before?.cells.out_until).toEqual({ value: null, from: null })
    expect(history.changes[0]?.after?.cells.out_until).toEqual({ value: null, from: null })
    expect(history.changes[0]?.before?.cells.difficulty.value).toBe('hard')
  })
})

describe('one immediately usable native selection stays on its Casting row', () => {
  async function nativeRow() {
    emptyTheTable()
    const key = randomUUID()
    const native = { model: `native-${key}`, provider: `provider-${key}`, variant: null }
    const added = await add('worker', { program: { value: 'dsh' }, model: { value: `office-${key}` }, effort: { value: `effort-${key}` }, native })
    const read = await call('GET', `/api/casting/rows/${added.casting.id}/selection`, PERSON)
    expect(read.statusCode, read.body).toBe(200)
    return { row: added.casting, selection: read.json().selection, native }
  }
  async function selectedRun(selection: any) {
    const reply = await call('POST', '/api/records', PERSON, { kind: 'session', title: 'Synthetic selected native run', data: {
      runtime: selection.runtime, model: selection.model, servingAgent: 'cast-worker', state: 'running', extra: { launcherSelection: selection },
    } })
    expect(reply.statusCode, reply.body).toBe(201)
    return reply.json().record.id as string
  }
  const refusal = { kind: 'model', code: 'model_not_found', said: 'Synthetic native program refused the selected model.' }

  it('answers an unseen native tuple immediately, preserving its Office identity and current effort cell', async () => {
    const { row, selection, native } = await nativeRow()
    expect(selection).toMatchObject({ runtime: 'dsh', model: row.cells.model.value,
      native: { ...native, effort: row.cells.effort.value }, casting: { id: row.id } })
    expect(selection.casting.revision).toEqual(expect.any(String))
    const listed = (await castingsOf('worker'))[0] as any
    expect(listed.native).toEqual(native)
    expect(listed.selectionRevision).toBe(selection.casting.revision)
  })

  it('only the exact run key may report its selection, and a worker cannot clear its hold', async () => {
    const { row, selection } = await nativeRow()
    const fileRun = async () => {
      const response = await call('POST', '/api/records', {...asAgent(THE_TEST_OFFICES_SECRETARY.handle),'x-mole-office-key':castingSecretaryKey}, { kind: 'session', title: 'Synthetic keyed selection run', data: {
        runtime: selection.runtime, model: selection.model, servingAgent: 'cast-worker', state: 'running', extra: { launcherSelection: selection },
      } })
      expect(response.statusCode, response.body).toBe(201)
      expect(response.json().runKey?.key, 'the real Office must issue this run its own key').toBeTruthy()
      return { id: response.json().record.id as string, key: response.json().runKey.key as string }
    }
    const own = await fileRun(), other = await fileRun()
    const keyed = (run: typeof own) => ({ ...asAgent('cast-worker'), 'x-mole-office-key': run.key, 'x-mole-office-session': run.id })
    const body = { revision: selection.casting.revision, run: own.id, refusal }
    expect((await call('POST', `/api/casting/rows/${row.id}/hold`, keyed(other), body)).statusCode).toBe(403)
    expect((await call('POST', `/api/casting/rows/${row.id}/hold`, keyed(own), { ...body, run: other.id })).statusCode).toBe(403)
    const held = await call('POST', `/api/casting/rows/${row.id}/hold`, keyed(own), body)
    expect(held.statusCode, held.body).toBe(200)
    const before = stored()
    const setting=GATES.find(one=>one.id==='who-changes-the-casting-table')!.setting
    const previous=process.env[setting]
    process.env[setting]='off'
    try {
      for (const patch of [{ hold: null }, { model: { value: 'worker cannot clear by editing' } }]) {
        expect((await call('PATCH', `/api/casting/rows/${row.id}`, keyed(own), patch)).statusCode).toBe(403)
        expect(stored()).toBe(before)
      }
      expect((await call('DELETE', `/api/casting/rows/${row.id}`, keyed(own))).statusCode).toBe(403)
      expect(stored()).toBe(before)
    } finally {
      if(previous===undefined) delete process.env[setting]
      else process.env[setting]=previous
    }
    await change(row.id, { hold: null })
  })

  it('the producer never borrows row effort through an unrelated provider with the same model basename', async () => {
    emptyTheTable()
    const known=Object.keys(THE_MODELS_START_VALUES)[0]!
    const rowEffort='row-effort-'+randomUUID()
    await add('worker',{program:{value:'codex'},model:{value:known},effort:{value:rowEffort}})
    const model='unrelated-provider/'+known
    const answer=await forAgent('cast-worker','place=builder&runtime=codex&model='+encodeURIComponent(model))
    expect(answer.model).toBe(model)
    expect(answer.effort).toBeNull()
    expect(answer.effortFrom).toBe('none')
  })

  it('a changed row refuses its earlier token without selecting another row', async () => {
    const { row, selection } = await nativeRow()
    await change(row.id, { effort: { value: `changed-${randomUUID()}` } })
    const stale = await call('GET', `/api/casting/rows/${row.id}/selection?revision=${selection.casting.revision}`, PERSON)
    expect(stale.statusCode, stale.body).toBe(409)
    expect(stale.json().error).toMatch(/changed/i)
  })

  it('a native refusal holds the exact row after refusal; repeating it writes no second notice', async () => {
    const { row, selection } = await nativeRow()
    const run = await selectedRun(selection)
    const body = { revision: selection.casting.revision, run, refusal }
    const first = await call('POST', `/api/casting/rows/${row.id}/hold`, PERSON, body)
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json()).toMatchObject({ held: true, first: true })
    const notices = () => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND json_extract(data,'$.aboutRun') = ?").get(run) as {n:number}).n
    expect(notices()).toBe(1)
    const beforeRepeat = stored()
    const again = await call('POST', `/api/casting/rows/${row.id}/hold`, PERSON, body)
    expect(again.statusCode, again.body).toBe(200)
    expect(again.json()).toMatchObject({ held: true, first: false })
    expect(stored()).toBe(beforeRepeat)
    expect(notices()).toBe(1)
    const held = await call('GET', `/api/casting/rows/${row.id}/selection?revision=${selection.casting.revision}`, PERSON)
    expect(held.statusCode).toBe(409)
    expect(held.json().error).toContain(refusal.said)
    const listed = (await castingsOf('worker'))[0] as any
    expect(listed.selectionRevision).toBe(selection.casting.revision)
    expect(listed.hold).toMatchObject({ run, refusal })
  })

  it('stores the normalized native diagnostic in the row and every history image',async()=>{
    const {row,selection}=await nativeRow()
    const run=await selectedRun(selection)
    const said='TOKEN=synthetic-private-value\nSynthetic native refusal.'
    const canonical=nativeRefusalWithCode(refusal.code,said)!
    const held=await call('POST',`/api/casting/rows/${row.id}/hold`,PERSON,{revision:selection.casting.revision,run,refusal:{...refusal,said}})
    expect(held.statusCode,held.body).toBe(200)
    const listed=(await castingsOf('worker'))[0]!
    expect(listed.hold?.refusal.said).toBe(canonical.said)
    expect(stored()).not.toContain('synthetic-private-value')
    const history=await call('GET',`/api/casting/worker/history?casting=${row.id}`,PERSON)
    expect(history.json().changes[0].after.hold.refusal.said).toBe(canonical.said)
    const blocked=await call('GET',`/api/casting/rows/${row.id}/selection`,PERSON)
    expect(blocked.body).not.toContain('synthetic-private-value')
    expect(blocked.json().error).toContain(canonical.said)
  })

  it.each(['capacity', 'quota', 'agent-prose'])('a %s report does not hold any Casting row', async kind => {
    const { row, selection } = await nativeRow()
    const run = await selectedRun(selection)
    const before = stored()
    const reply = await call('POST', `/api/casting/rows/${row.id}/hold`, PERSON, { revision: selection.casting.revision, run, refusal: { ...refusal, kind } })
    expect(reply.statusCode).toBe(400)
    expect(stored()).toBe(before)
  })

  it('an edit or explicit clear lifts the hold with a new content token', async () => {
    const { row, selection } = await nativeRow()
    const run = await selectedRun(selection)
    expect((await call('POST', `/api/casting/rows/${row.id}/hold`, PERSON, { revision: selection.casting.revision, run, refusal })).statusCode).toBe(200)
    await change(row.id, { hold: null })
    const current = await call('GET', `/api/casting/rows/${row.id}/selection`, PERSON)
    expect(current.statusCode, current.body).toBe(200)
    expect(current.json().selection.casting.revision).not.toBe(selection.casting.revision)
    expect((await castingsOf('worker'))[0]).toMatchObject({ hold: null })
    const late = await call('POST', `/api/casting/rows/${row.id}/hold`, PERSON, { revision: selection.casting.revision, run, refusal })
    expect(late.statusCode).toBe(409)
  })

  it('marking another row and back preserves native fields, and history keeps them', async () => {
    const { row, native } = await nativeRow()
    const other = await add('worker', { model: { value: 'synthetic other Office label' } })
    for (const id of [other.casting.id, row.id]) expect((await call('POST', `/api/casting/rows/${id}/mark`, PERSON)).statusCode).toBe(200)
    expect((await castingsOf('worker')).find(one => one.id === row.id)).toMatchObject({ native })
    const history = await call('GET', `/api/casting/worker/history?casting=${row.id}`, PERSON)
    expect(history.statusCode).toBe(200)
    expect(history.json().changes[0].after.native).toEqual(native)
  })

  it('moving the mark preserves a native refusal hold and its content token', async () => {
    const { row, selection } = await nativeRow()
    const run = await selectedRun(selection)
    expect((await call('POST', `/api/casting/rows/${row.id}/hold`, PERSON, {revision:selection.casting.revision,run,refusal})).statusCode).toBe(200)
    const other = await add('worker', {model:{value:'synthetic other Office label'}})
    for(const id of [other.casting.id,row.id]) {
      expect((await call('POST', `/api/casting/rows/${id}/mark`, PERSON)).statusCode).toBe(200)
      const held = (await castingsOf('worker')).find(one=>one.id===row.id)
      expect(held).toMatchObject({selectionRevision:selection.casting.revision,hold:{run,refusal}})
    }
  })

  it('reads the latest row image by the existing row/id index', async () => {
    const { row } = await nativeRow()
    const trace = vi.spyOn(t.client.sqlite, 'prepare')
    await call('GET', `/api/casting/rows/${row.id}/selection`, PERSON)
    const queries = trace.mock.calls.map(one => String(one[0]))
    trace.mockRestore()
    const query = queries.find(sql => sql.includes('casting_row_changes') && sql.includes('after') && !sql.startsWith('EXPLAIN'))
    expect(query, 'the production current-state reader must execute an indexed history lookup').toBeDefined()
    const plan = t.client.sqlite.prepare('EXPLAIN QUERY PLAN ' + query!).all(row.id) as { detail: string }[]
    const indexes = t.client.sqlite.prepare('PRAGMA index_list(casting_row_changes)').all() as { name: string }[]
    const index = indexes.find(one => {
      const columns = t.client.sqlite.prepare('PRAGMA index_info(' + one.name + ')').all() as { name: string }[]
      return columns.map(column => column.name).join(',') === 'casting_id,id'
    })
    expect(index).toBeDefined()
    expect(plan.some(one => one.detail.includes(index!.name) && /SEARCH/.test(one.detail))).toBe(true)
  })

  it('the authored archive and restore retain the latest native image and its content token', async () => {
    const { row, selection, native } = await nativeRow()
    const { AUTHORED_TABLES } = await import('../src/server/db/schema.ts')
    expect(AUTHORED_TABLES).toContain('casting_row_changes')
    const folder = mkdtempSync(join(tmpdir(), 'casting-native-archive-'))
    try {
      const exporter = await import('../src/server/lib/export.ts')
      exporter.writeExport(folder)
      const before = stored()
      t.client.sqlite.prepare('DELETE FROM casting_rows').run()
      t.client.sqlite.prepare('DELETE FROM casting_row_changes').run()
      const importer = await import('../src/server/lib/import.ts')
      importer.applyImport(folder)
      expect(stored()).toBe(before)
      const restored = await call('GET', `/api/casting/rows/${row.id}/selection`, PERSON)
      expect(restored.statusCode, restored.body).toBe(200)
      expect(restored.json().selection).toEqual(selection)
      expect((await castingsOf('worker'))[0]).toMatchObject({ native })
      const run = await selectedRun(selection)
      expect((await call('POST', `/api/casting/rows/${row.id}/hold`, PERSON, {revision:selection.casting.revision,run,refusal})).statusCode).toBe(200)
      exporter.writeExport(folder)
      const heldBefore=stored()
      t.client.sqlite.prepare('DELETE FROM casting_rows').run()
      t.client.sqlite.prepare('DELETE FROM casting_row_changes').run()
      importer.applyImport(folder)
      expect(stored()).toBe(heldBefore)
      const held=await call('GET', `/api/casting/rows/${row.id}/selection`, PERSON)
      expect(held.statusCode,held.body).toBe(409)
      expect(held.json().error).toContain(refusal.said)
      expect((await castingsOf('worker'))[0]).toMatchObject({native,selectionRevision:selection.casting.revision,hold:{run,refusal}})
    } finally { rmSync(folder, { recursive: true, force: true }) }
  }, 60_000)

  it('a legacy row without native fields is explicitly legacy, not a guessed native selection', async () => {
    emptyTheTable()
    const added = await add('worker', { program: { value: 'dsh' }, model: { value: 'synthetic legacy Office label' } })
    const reply = await call('GET', `/api/casting/rows/${added.casting.id}/selection`, PERSON)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json()).toMatchObject({ selection: null, legacy: true })
    expect(reply.json().says).toMatch(/legacy|older|native.*not/i)
  })

  it.each(['missing native','array','empty image'])('refuses a latest persisted %s rather than silently clearing its native hold',async damage=>{
    const {row,selection}=await nativeRow()
    const run=await selectedRun(selection)
    expect((await call('POST',`/api/casting/rows/${row.id}/hold`,PERSON,{revision:selection.casting.revision,run,refusal})).statusCode).toBe(200)
    const latest=t.client.sqlite.prepare('SELECT id,"after" FROM casting_row_changes WHERE casting_id=? ORDER BY id DESC LIMIT 1').get(row.id) as {id:number;after:string}
    const image=JSON.parse(latest.after)
    delete image.native
    const broken=damage==='array'?[]:damage==='empty image'?{}:image
    t.client.sqlite.prepare('UPDATE casting_row_changes SET "after"=? WHERE id=?').run(JSON.stringify(broken),latest.id)
    const reply=await call('GET',`/api/casting/rows/${row.id}/selection`,PERSON)
    expect(reply.statusCode,reply.body).toBe(500)
    expect(reply.json().error).toMatch(/Casting.*(unreadable|object|incomplete|history)/i)
  })
})
