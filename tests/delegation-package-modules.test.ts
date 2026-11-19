// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PACKAGE NAMES THE MODULES THE WORK IS IN, AND THE FILES COME FROM THOSE MODULES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion F16 point 1 as corrected by decision 5fIvP6qTPzgM (the secretary's ruling on proposal
 * _bCBYmUSTJDf, option 1). The implementation door refuses a task by design — the map means
 * ownership, and only a module, a block or a pipeline can own code — so the package names the
 * module records the work is in, and the files come from those modules' own rows:
 *
 *   1. A package naming a module carries the code stated for it, through `statedFor`.
 *   2. A package naming a task is refused, naming the id and the kind it found.
 *   3. A package naming an id that is nothing in this project is refused by name.
 *   4. A package naming a module with no stated code says so by that module's name.
 *   5. A package naming no module at all says that, in different words from case 4.
 *   6. The one sentence about the files says they are the files of the modules this work is in,
 *      and never the files this task owns.
 *
 * Every mutation was run as a control first (green), then applied (red), then reversed by hand
 * and checked back byte-identical — never `git checkout` — with the sha256 in the report.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { injectedPackageFixture, updateMadeUpModuleForPackage } from './module-package-fixture.ts'
import { THE_PERSON } from '../src/shared/person.ts'

/** Each case works in a project of its own, so every column it reads is only its own tasks. */
let WORKSPACE = 'panelx'

let HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
let caseNumber = 0

const A_PACKAGE = {
  forTheOutside: 'Build the module on its own and return a zip holding the source.',
  suits: 'own_module',
  acceptance: 'The module runs on its own and its tests pass.',
  acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' },
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  HUMAN = { ...HUMAN, 'x-mole-office-workspace': WORKSPACE }
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: `Mole Office ${String(caseNumber)}` } })
  expect(made.statusCode, made.body).toBe(201)
})

/** File one record through the route and hand back its id. */
async function file(kind: string, title: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data: {} } })
  expect(res.statusCode, res.body).toBe(201)
  const id = (res.json() as { record: { id: string } }).record.id
  if (kind === 'module') await updateMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE), id)
  return id
}

/** Ask the packaging door for one task, with the given modules. */
async function packageIt(taskId: string, moduleIds?: string[]) {
  return app.inject({
    method: 'POST',
    url: `/api/delegation/${taskId}/package`,
    headers: HUMAN,
    payload: { ...A_PACKAGE, ...(moduleIds === undefined ? {} : { moduleIds }) },
  })
}

/** The code somebody stated for one module, through the implementation door of a scratch repository. */
async function stateSomeCodeFor(moduleId: string, pattern = 'src/camera.ts'): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'f16-files-repo-'))
  try {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/implementation/repositories',
      headers: HUMAN,
      payload: { name: 'f16-files-scratch', root },
    })
    expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
    const repositoryId = (registered.json() as { repository: { id: string } }).repository.id
    const declared = await app.inject({
      method: 'POST',
      url: '/api/implementation',
      headers: HUMAN,
      payload: { recordId: moduleId, repositoryId, pattern, relation: 'implements' },
    })
    expect(declared.statusCode, declared.body.slice(0, 300)).toBe(201)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

/** Read the delegation column for this project. */
async function theColumn() {
  const res = await app.inject({ method: 'GET', url: '/api/delegation', headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as {
    tasks: Record<string, unknown>[]
    couldNotRead: { recordId: string }[]
  }
}

interface NamedRow {
  recordId: string
  namedModuleCount: number
  statedCodeFromModules: number
  modulesWithNoStatedCode: string[]
  filesSays: string
  says: string | null
  modules: { recordId: string; title: string | null; repositoryId: string; pattern: string; relation: string; authority: string }[]
}

/** One task's row from the column, by id. */
async function rowFor(taskId: string): Promise<NamedRow> {
  const column = await theColumn()
  const row = column.tasks.find((one) => one['recordId'] === taskId)
  expect(row, `no row for ${taskId}`).toBeDefined()
  return row as unknown as NamedRow
}

// ============================================================================ the named modules' files

describe('a package naming a module carries the code stated for that module', () => {
  it('carries the stated rows through the reply and through the column', async () => {
    const taskId = await file('task', 'Fit the wrist camera')
    const moduleId = await file('module', 'The wrist camera module')
    await stateSomeCodeFor(moduleId, 'src/camera.ts')

    const res = await packageIt(taskId, [moduleId])
    expect(res.statusCode, res.body).toBe(201)
    const said = res.json() as NamedRow
    expect(said.namedModuleCount).toBe(1)
    expect(said.statedCodeFromModules).toBe(1)
    expect(said.modulesWithNoStatedCode).toEqual([])
    expect(said.filesSays).toContain('the files of the modules this work is in')
    expect(said.modules).toEqual([
      {
        recordId: moduleId,
        title: 'The wrist camera module',
        repositoryId: expect.any(String),
        pattern: 'src/camera.ts',
        relation: 'implements',
        authority: 'stated',
      },
    ])

    const row = await rowFor(taskId)
    expect(row.namedModuleCount).toBe(1)
    expect(row.statedCodeFromModules).toBe(1)
    expect(row.modules).toHaveLength(1)
    expect(row.modules[0]?.pattern).toBe('src/camera.ts')
    expect(row.modulesWithNoStatedCode).toEqual([])
    expect(row.filesSays).toBe(said.filesSays)
    // A package that names a module has no sentence: its tag and facts say the rest.
    expect(row.says).toBeNull()
  })
})

// ============================================================================ the refusals

describe('an id that cannot own code is refused, by name', () => {
  it('refuses a task, naming the id and the kind it found', async () => {
    const taskId = await file('task', 'A package of real work')
    const notAModule = await file('task', 'Another task, named as one')
    const res = await packageIt(taskId, [notAModule])
    expect(res.statusCode, res.body).toBe(400)
    const error = (res.json() as { error: string }).error
    expect(error).toContain(notAModule)
    expect(error).toContain('a task')
    expect(error).toContain('a module, a block or a pipeline')
  })

  it('refuses an id that is nothing in this project, by name', async () => {
    const taskId = await file('task', 'A package of real work')
    const nothing = 'zzzNowhere000'
    const res = await packageIt(taskId, [nothing])
    expect([400, 404]).toContain(res.statusCode)
    expect(res.body).toContain(nothing)
  })
})

// ============================================================================ the three honest answers

describe('a package whose modules name no code says so, by name', () => {
  it('names the module that has no stated code, when none of the named ones do', async () => {
    const taskId = await file('task', 'In a module nobody has stated code for')
    const moduleId = await file('module', 'The silent module')
    const res = await packageIt(taskId, [moduleId])
    expect(res.statusCode, res.body).toBe(201)
    const said = res.json() as NamedRow
    expect(said.namedModuleCount).toBe(1)
    expect(said.statedCodeFromModules).toBe(0)
    expect(said.modulesWithNoStatedCode).toEqual(['The silent module'])
    expect(said.filesSays).toContain('The silent module')
    expect(said.filesSays).toContain('none of them has any stated code')

    const row = await rowFor(taskId)
    expect(row.modulesWithNoStatedCode).toEqual(['The silent module'])
    expect(row.filesSays).toBe(said.filesSays)
  })

  it('names the ones without stated code and keeps the ones with it, in one package', async () => {
    const taskId = await file('task', 'Across two modules')
    const withCode = await file('module', 'The stated module')
    const withoutCode = await file('module', 'The unspoken module')
    await stateSomeCodeFor(withCode, 'src/stated.ts')

    const res = await packageIt(taskId, [withCode, withoutCode])
    expect(res.statusCode, res.body).toBe(201)
    const said = res.json() as NamedRow
    expect(said.namedModuleCount).toBe(2)
    expect(said.statedCodeFromModules).toBe(1)
    expect(said.modulesWithNoStatedCode).toEqual(['The unspoken module'])
    expect(said.filesSays).toContain('The unspoken module')
    expect(said.filesSays).toContain('the files of the modules this work is in')
  })

  it('refuses a package naming no module, including an empty module list', async () => {
    const taskId = await file('task', 'No module named')
    const { A_PACKAGE_NEEDS_A_MODULE } = await import('../src/server/lib/module-requirements.ts')
    for (const ids of [undefined, []]) {
      const res = await packageIt(taskId, ids)
      expect(res.statusCode, res.body).toBe(400)
      expect((res.json() as { error: string }).error).toContain(A_PACKAGE_NEEDS_A_MODULE)
    }
  })
})

// ============================================================================ the one sentence

describe('the sentence about the files is written once and says the weaker claim', () => {
  it('says the files are the modules\' and never the task\'s own, and the three answers differ', async () => {
    const { thePackageFilesSentence } = await import('../src/shared/delegation.ts')
    const none = thePackageFilesSentence({ namedModuleCount: 0, modulesWithNoStatedCode: [] })
    const allSilent = thePackageFilesSentence({ namedModuleCount: 2, modulesWithNoStatedCode: ['a', 'b'] })
    const someSilent = thePackageFilesSentence({ namedModuleCount: 2, modulesWithNoStatedCode: ['b'] })

    // WHERE FILES ARE CARRIED, THE CLAIM IS THE MODULES'. Where none is, the sentence says no
    // file list is carried rather than implying one.
    expect(none).toContain('carries no file list')
    expect(allSilent).toContain('files of the modules this work is in')
    expect(someSilent).toContain('files of the modules this work is in')
    // THE WEAKER CLAIM, SAID POSITIVELY, AND NEVER THE FALSE ONE. The negative is worded as a
    // rejection — "not the files this task owns" — so the test negates the assertion form, not
    // the substring.
    expect(none).not.toContain('are the files this task owns')
    expect(allSilent).not.toContain('are the files this task owns')
    expect(someSilent).not.toContain('are the files this task owns')
    expect(new Set([none, allSilent, someSilent]).size).toBe(3)
  })

  it('refuses a moduleIds list that is not a list of ids', async () => {
    const taskId = await file('task', 'A package of real work')
    for (const bad of ['not-a-list', [42]]) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/delegation/${taskId}/package`,
        headers: HUMAN,
        payload: { ...A_PACKAGE, moduleIds: bad },
      })
      expect(res.statusCode, res.body).toBe(400)
      expect(res.body).toContain('moduleIds')
    }
  })
})
