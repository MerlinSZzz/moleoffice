// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TASK BECOMES A PACKAGE: THE FIELD, THE TWO DOORS, AND WHO IS RESPONSIBLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion F16, points 1, 7 and 8. Each test names the one thing it is about, so a mutation can
 * be aimed at it:
 *
 *   - the state word is the furthest-along one that is true, in the declared order;
 *   - the packaging door writes a bundle, an `about` link and the package field, and the bundle is
 *     the one the task points at;
 *   - the packaging door refuses each thing it will not package, by name, and writes nothing;
 *   - packaging again replaces the package and files a new bundle, leaving the old one answerable;
 *   - a package that names no code says so, and names the door that states code;
 *   - a package that does name code counts it through `statedFor`;
 *   - the list door draws the row from records, newest package first;
 *   - a task claimed by an agent and taken outside by a person says both, and the state is the
 *     furthest along;
 *   - who is responsible, for each of the rules: the person, a live agent, the first live agent up a
 *     retired creator's chain, the secretary, and the honest unknown when there is no create row.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { packageStateOf, thePackageFilesSentence } from '../src/shared/delegation.ts'
import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { packageStateWord, packageSuitWord } from '../src/shared/words.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let WORKSPACE = 'panelx'
let caseNumber = 0
let packageModule = ''

const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}

const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-workspace': WORKSPACE,
})

const A_PACKAGE = {
  forTheOutside: 'Build the module on its own and return a zip holding the source.',
  suits: 'own_module',
  acceptance: 'The module runs on its own and its tests pass.',
  acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' },
}

let t: TestDb
let app: FastifyInstance
let delegation: typeof import('../src/server/lib/delegation.ts')

/**
 * ONE OFFICE FOR THE FILE, and a project of its own for each case. The column reads every task in
 * the project the request names, so a case's own project keeps its reading to the records that case
 * filed.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  delegation = await import('../src/server/lib/delegation.ts')
}, 60_000)

afterAll(() => {
  app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  HUMAN['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
  packageModule = await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))
})

/** File one record through the route and hand back its id. */
async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers: Record<string, string> = HUMAN): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/**
 * Register a durable agent through the route, as the caller's headers say, and hand back the id the
 * registry gave it. That id is not the handle.
 */
async function registerAgent(
  handle: string,
  headers: Record<string, string> = HUMAN,
  role?: string,
  workArea?: string[],
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers,
    payload: {
      handle,
      name: handle,
      ...(role === undefined ? {} : { role }),
      ...(workArea === undefined ? {} : { workArea }),
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no registry row for ${handle}`).toBeDefined()
  return row!.id
}

/** Ask the packaging door for one task, with one field overridden. */
async function packageIt(taskId: string, body: Record<string, unknown> = {}, headers: Record<string, string> = HUMAN) {
  return app.inject({
    method: 'POST',
    url: `/api/delegation/${taskId}/package`,
    headers,
    payload: { ...A_PACKAGE, moduleIds: [packageModule], ...body },
  })
}

/** Read the delegation column for this project. */
async function theColumn(headers: Record<string, string> = HUMAN) {
  const res = await app.inject({ method: 'GET', url: '/api/delegation', headers })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as {
    tasks: Record<string, unknown>[]
    couldNotRead: { recordId: string }[]
    workspaceId: string
  }
}

/** One task's row from the column, by id. */
async function rowFor(taskId: string): Promise<Record<string, unknown>> {
  const column = await theColumn()
  const row = column.tasks.find((one) => one['recordId'] === taskId)
  expect(row, `no row for ${taskId}`).toBeDefined()
  return row as Record<string, unknown>
}

/** The whole database as a string, except the request log, so a refusal can be shown to write nothing. */
function databaseNow(): string {
  const tables = (
    t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string
    }[]
  )
    .map((one) => one.name)
    .filter((name) => name !== 'api_calls' && name !== 'hourly_calls')
  const counts = tables.map((name) => {
    const { n } = t.client.sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }
    return `${name}=${n}`
  })
  const rows = t.client.sqlite.prepare('SELECT * FROM records ORDER BY id').all()
  return `${counts.join(' ')}\n${JSON.stringify(rows)}`
}

// ============================================================================ the declared order

describe('the state word of a package with no inside acts', () => {
  it('answers done, handed back, taken or to do, in that order', () => {
    expect(packageStateOf({ completed: true, returned: true, outside: true, claimed: true })).toBe('done')
    expect(packageStateOf({ completed: false, returned: true, outside: true, claimed: true })).toBe('handed_back')
    expect(packageStateOf({ completed: false, returned: false, outside: true, claimed: true })).toBe('taken')
    expect(packageStateOf({ completed: false, returned: false, outside: false, claimed: true })).toBe('taken')
    expect(packageStateOf({ completed: false, returned: false, outside: false, claimed: false })).toBe('to_do')
  })
})

// ============================================================================ the readings

describe('the words a person reads for a package', () => {
  it('names a value no table knows instead of handing it back', () => {
    const suit = packageSuitWord('make_tea')
    expect(suit.standing).toBe('unknown')
    expect(suit.text).toBe('unknown kind of outside work: make_tea')
    const state = packageStateWord('nearly')
    expect(state.standing).toBe('unknown')
    expect(state.text).toBe('unknown package state: nearly')
  })
})

// ============================================================================ the packaging door

describe('the door that makes a package', () => {
  it('files a bundle about the task, links it with about, and writes the package field', async () => {
    const taskId = await file('task', 'Fit the wrist camera')
    const res = await packageIt(taskId)
    expect(res.statusCode, res.body).toBe(201)
    const said = res.json() as {
      task: { id: string }
      package: { bundleId: string; suits: string; forTheOutside: string }
      bundle: { id: string }
      link: { id: string; type: string }
      statedCodeCount: number
      replacedBundleId: string | null
    }
    expect(said.task.id).toBe(taskId)
    expect(said.package.bundleId).toBe(said.bundle.id)
    expect(said.package.suits).toBe('own_module')
    expect(said.package.forTheOutside).toBe(A_PACKAGE.forTheOutside)
    expect(said.link.type).toBe('about')
    expect(said.replacedBundleId).toBe(null)

    // THE TASK POINTS AT THE BUNDLE.
    const task = await app.inject({ method: 'GET', url: `/api/records/${taskId}`, headers: HUMAN })
    const taskData = (task.json() as { record: { data: Record<string, unknown> } }).record.data
    expect((taskData['package'] as { bundleId: string }).bundleId).toBe(said.bundle.id)

    // THE BUNDLE IS ABOUT THE TASK, AT THE PRESET AND DETAIL THE DOOR DEFAULTS TO.
    const bundle = await app.inject({ method: 'GET', url: `/api/records/${said.bundle.id}`, headers: HUMAN })
    expect(bundle.statusCode, bundle.body).toBe(200)
    const bundleBody = bundle.json() as { record: { kind: string; data: Record<string, unknown> } }
    expect(bundleBody.record.kind).toBe('context_bundle')
    expect(bundleBody.record.data['scope']).toBe('record')
    expect(bundleBody.record.data['scopeRecordId']).toBe(taskId)
    expect(bundleBody.record.data['preset']).toBe('continue')
    expect(bundleBody.record.data['detail']).toBe('gist')

    // THE LINK IS A ROW IN THE LINK TABLE, FROM THE BUNDLE TO THE TASK.
    const link = t.client.sqlite
      .prepare('SELECT id, type FROM links WHERE from_id = ? AND to_id = ?')
      .get(said.bundle.id, taskId) as { id: string; type: string } | undefined
    expect(link?.id).toBe(said.link.id)
    expect(link?.type).toBe('about')
  })

  it('refuses each thing it will not package, by name, and writes nothing', async () => {
    const aModule = await file('module', 'Not a task at all')
    const cases: { what: string; taskId: string; body: Record<string, unknown>; contains: string }[] = [
      { what: 'a record that is not a task', taskId: aModule, body: {}, contains: 'only a task can be packaged' },
      {
        what: 'an empty forTheOutside',
        taskId: await file('task', 'Empty words for outside'),
        body: { forTheOutside: '   ' },
        contains: 'the only part of a package written for a reader who cannot reach Mole Office',
      },
      {
        what: 'a kind of outside work that is not one of the three',
        taskId: await file('task', 'Wrong suit'),
        body: { suits: 'gardening' },
        contains: 'The three are:',
      },
      {
        what: 'an empty acceptance',
        taskId: await file('task', 'No acceptance'),
        body: { acceptance: '' },
        contains: 'not ready to leave',
      },
      {
        what: 'an acceptanceSource missing the commit',
        taskId: await file('task', 'No commit'),
        body: { acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16' } },
        contains: 'All three of file, criterion and commit are required',
      },
      {
        what: 'a preset the product does not declare',
        taskId: await file('task', 'No such preset'),
        body: { preset: 'make_it_so' },
        contains: 'The presets are:',
      },
    ]

    for (const one of cases) {
      const before = databaseNow()
      const res = await packageIt(one.taskId, one.body)
      expect(res.statusCode, `${one.what}: ${res.body}`).toBe(400)
      expect(res.body, one.what).toContain(one.contains)
      expect(databaseNow(), `${one.what} wrote to the database`).toBe(before)
    }
  })

  it('packages again by replacing the package and filing a new bundle, and leaves the old bundle answerable', async () => {
    const taskId = await file('task', 'Package this twice')
    const first = await packageIt(taskId)
    expect(first.statusCode, first.body).toBe(201)
    const firstBundle = (first.json() as { bundle: { id: string } }).bundle.id

    const second = await packageIt(taskId, {
      suits: 'desk_work',
      forTheOutside: 'Plan the release and return the plan as text.',
      acceptance: 'The plan names every step and its owner.',
    })
    expect(second.statusCode, second.body).toBe(201)
    const secondBody = second.json() as { bundle: { id: string }; package: { bundleId: string }; replacedBundleId: string | null }
    expect(secondBody.bundle.id).not.toBe(firstBundle)
    expect(secondBody.package.bundleId).toBe(secondBody.bundle.id)
    expect(secondBody.replacedBundleId).toBe(firstBundle)

    // The old bundle still exists and is still a bundle, so what it produced stayed answerable.
    const old = await app.inject({ method: 'GET', url: `/api/records/${firstBundle}`, headers: HUMAN })
    expect(old.statusCode, old.body).toBe(200)
    expect((old.json() as { record: { kind: string } }).record.kind).toBe('context_bundle')

    // And the task points at the second one.
    const task = await app.inject({ method: 'GET', url: `/api/records/${taskId}`, headers: HUMAN })
    const taskData = (task.json() as { record: { data: Record<string, unknown> } }).record.data
    expect((taskData['package'] as { bundleId: string }).bundleId).toBe(secondBody.bundle.id)
  })

  it('says a package names no code, and names the door that states it', async () => {
    const taskId = await file('task', 'Names no code')
    const res = await packageIt(taskId)
    expect(res.statusCode, res.body).toBe(201)
    const said = res.json() as { statedCodeCount: number; codeNote: string; note: string; namedModuleCount: number }
    expect(said.statedCodeCount).toBe(0)
    expect(said.namedModuleCount).toBe(1)
    expect(said.codeNote).toContain('POST /api/implementation')

    const row = await rowFor(taskId)
    expect(row['statedCodeCount']).toBe(0)
    expect(row['namedModuleCount']).toBe(1)
    expect(row['says']).toBeNull()
    // THE FILES SENTENCE IS THE ONE WRITTEN IN src/shared/delegation.ts, which names the door.
    expect(row['filesSays']).toBe(thePackageFilesSentence({ namedModuleCount: 1, modulesWithNoStatedCode: ['Made-up module for a package'] }))
  })
})

// ============================================================================ the column

describe('the door that lists the packages', () => {
  it('draws each row from the records, newest package first', async () => {
    const older = await file('task', 'Packaged first')
    const newer = await file('task', 'Packaged second')
    const first = await packageIt(older)
    expect(first.statusCode, first.body).toBe(201)
    expect((await packageIt(newer, { suits: 'from_pictures' })).statusCode).toBe(201)
    // TWO PACKAGES WRITTEN IN THE SAME SECOND are indistinguishable by `at`, so the older one is
    // given an earlier stamp: this is the column reading `packagedAt`, which is what "newest first"
    // means, and not an accident of two record ids.
    const firstPackage = (first.json() as { package: Record<string, unknown> }).package
    const moved = await app.inject({
      method: 'PATCH',
      url: `/api/records/${older}`,
      headers: HUMAN,
      payload: { dataPatch: { package: { ...firstPackage, at: '2026-09-01 00:00:00' } } },
    })
    expect(moved.statusCode, moved.body).toBe(200)

    const column = await theColumn()
    expect(column.workspaceId).toBe(WORKSPACE)
    expect(column.tasks.map((one) => one['recordId']).slice(0, 2)).toEqual([newer, older])
    expect(column.tasks[0]?.['packagedAt']).not.toBe('2026-09-01 00:00:00')
    const row = column.tasks.find((one) => one['recordId'] === newer) as Record<string, unknown>
    expect(row['suits']).toBe('from_pictures')
    expect(row['state']).toBe('to_do')
    expect(row['heldBy']).toBe(null)
    expect(row['outsideName']).toBe(null)
    expect(row['returnCount']).toBe(0)
    expect(row['confirmedAt']).toBe(null)
    expect(row['exportCount']).toBe(0)
    expect(row['responsible']).toEqual({ kind: 'person', id: THE_PERSON })
    expect(String(row['responsibleWhy'])).toContain('rule 2')
  })

  it('says both when a task is claimed by an agent and taken outside by a person', async () => {
    const taskId = await file('task', 'Held and promised out')
    expect((await packageIt(taskId)).statusCode).toBe(201)
    const holderId = await registerAgent('pkg-holder', HUMAN, undefined, ['src'])
    // A LIVE CLAIM NEEDS A RUN THAT IS STILL GOING. Its session record's own state is the weak
    // answer the claim reads when nothing was registered.
    const run = await file('session', 'a run for the claim', { state: 'running' })
    const claimed = await app.inject({
      method: 'POST',
      url: '/api/claims',
      headers: asAgent('pkg-holder'),
      payload: { run, things: [{ what: 'record', id: taskId }] },
    })
    expect(claimed.statusCode, claimed.body).toBe(201)

    // A PERSON'S TAKE, written on the task directly: this piece declares the field and the take
    // door is a later piece, so the test sets the state the column must read.
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/records/${taskId}`,
      headers: HUMAN,
      payload: {
        dataPatch: {
          takenOutside: [
            {
              who: 'ChatGPT (my own account)',
              comesBack: 'A zip holding the module.',
              byWhen: '2026-09-18',
              at: '2026-09-14 19:10:00',
              takenBy: { actorType: 'human', actorId: THE_PERSON },
            },
          ],
        },
      },
    })
    expect(patch.statusCode, patch.body).toBe(200)

    const row = await rowFor(taskId)
    expect(row['state']).toBe('taken')
    expect(row['heldBy']).toEqual({ kind: 'agent', id: holderId })
    expect(row['outsideName']).toBe('ChatGPT (my own account)')
  })

  it('draws an unreadable package as a named row rather than dropping the task', async () => {
    const taskId = await file('task', 'A package nobody can read')
    // A package missing a required part, written around the gate the way an old record could be.
    t.client.sqlite
      .prepare('UPDATE records SET data = ? WHERE id = ?')
      .run(JSON.stringify({ package: { bundleId: '', suits: 'own_module' } }), taskId)
    const column = await theColumn()
    expect(column.tasks.some((one) => one['recordId'] === taskId)).toBe(false)
    expect(column.couldNotRead.map((one) => one.recordId)).toContain(taskId)
  })
})

// ============================================================================ who is responsible

describe('who is responsible', () => {
  it('answers the person who created the task', async () => {
    const taskId = t.api.createRecord({
      kind: 'task',
      title: 'A task the person made',
      workspaceId: WORKSPACE,
      actor: { type: 'human', id: THE_PERSON, stated: true },
    }).id
    const said = delegation.responsibleFor(taskId)
    expect(said.who).toEqual({ kind: 'person', id: THE_PERSON })
    expect(said.why).toContain('rule 2')
    expect(said.why).toContain('may always confirm')
  })

  it('answers the live agent that created the task', async () => {
    const liveId = await registerAgent('pkg-live')
    const taskId = t.api.createRecord({
      kind: 'task',
      title: 'A task a live agent made',
      workspaceId: WORKSPACE,
      actor: { type: 'agent', id: 'pkg-live', stated: true },
    }).id
    const said = delegation.responsibleFor(taskId)
    // THE RESPONSIBLE AGENT IS NAMED BY ITS REGISTRY ID, which since the mint is not its handle.
    expect(said.who).toEqual({ kind: 'agent', id: liveId })
    expect(said.why).toContain('rule 3')
  })

  it('walks up a retired creator\'s starter chain to the first live agent', async () => {
    const bossId = await registerAgent('pkg-boss')
    await registerAgent('pkg-worker', asAgent('pkg-boss'))
    const taskId = t.api.createRecord({
      kind: 'task',
      title: 'A task a retired agent made',
      workspaceId: WORKSPACE,
      actor: { type: 'agent', id: 'pkg-worker', stated: true },
    }).id
    const retired = await app.inject({
      method: 'POST',
      url: '/api/participants/agent/pkg-worker/retire',
      headers: HUMAN,
      payload: { because: 'the piece it was started for is finished' },
    })
    expect(retired.statusCode, retired.body).toBe(200)
    const said = delegation.responsibleFor(taskId)
    expect(said.who).toEqual({ kind: 'agent', id: bossId })
    expect(said.why).toContain('rule 4')
    expect(said.why).toContain('pkg-boss')
  })

  it('answers the secretary when the chain reaches no live agent', async () => {
    const secretaryId = await registerAgent('pkg-secretary', HUMAN, 'secretary')
    await registerAgent('pkg-alone')
    const taskId = t.api.createRecord({
      kind: 'task',
      title: 'A task with nobody above it',
      workspaceId: WORKSPACE,
      actor: { type: 'agent', id: 'pkg-alone', stated: true },
    }).id
    const retired = await app.inject({
      method: 'POST',
      url: '/api/participants/agent/pkg-alone/retire',
      headers: HUMAN,
      payload: { because: 'the piece it was started for is finished' },
    })
    expect(retired.statusCode, retired.body).toBe(200)
    const said = delegation.responsibleFor(taskId)
    expect(said.who).toEqual({ kind: 'agent', id: secretaryId })
    expect(said.why).toContain('rule 5')
  })

  it('says the change log has no create row rather than guessing', async () => {
    const taskId = t.api.createRecord({
      kind: 'task',
      title: 'A task with no create row',
      workspaceId: WORKSPACE,
      actor: { type: 'human', id: THE_PERSON, stated: true },
    }).id
    t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = ? AND op = 'create'").run(taskId)
    const said = delegation.responsibleFor(taskId)
    expect(said.who).toBe(null)
    expect(said.why).toContain('no create row')
    expect(said.why).toContain('rather than guess')
  })
})
