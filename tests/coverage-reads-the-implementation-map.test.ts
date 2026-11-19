// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * COVERAGE COUNTS THE FILES A MODULE'S STATED MAP ROWS NAME (problem 869fNSRUF7U1, piece F8).
 *
 * The write door refuses `claims` in a module's data and sends the author to POST
 * /api/implementation. Coverage used to read `data.claims` all the same, so no sequence of calls
 * could make GET /api/source/coverage count a claimed file: it read 0 claimed across a run that filed
 * 105 map rows. `claimsOf` in src/server/lib/sourceindex.ts now reads the stated rows of the
 * implementation map, and these cases hold it there.
 *
 *   1. The proof the secretary's ruling names: a module and one stated row, both indexes rebuilt, and the
 *      file reads as claimed. Mutation: the reader back on `data.claims`, and it reads 0.
 *   2. A guessed row claims nothing until a person accepts it. Mutation: guessed rows counted.
 *   3. GET /api/source?module=<id> lists the files the stated rows name, whatever their relation.
 *   4. With two repositories in the project, coverage counts each row against the stored scan of the
 *      repository the row names, as the source door does (decision 0KSoGUNDF9ml;
 *      tests/coverage-counts-each-repository.test.ts), and names the repository it could not count.
 *      Until wave 13s round 23 it counted nothing here and said why. Mutation: coverage read off the
 *      workspace scan whatever the project registers, and it counts nothing again.
 *
 * Every case runs on a scratch database and a scratch tree this file makes and removes.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { AGENT, apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ResolvedClaim, SourceCoverage } from '../src/shared/types.ts'

const PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let map: typeof import('../src/server/lib/implementation.ts')
let workspaces: typeof import('../src/server/lib/workspaces.ts')
let root: string
let workspace: string
let headers: Record<string, string>
let caseNumber = 0
const rootBefore = process.env.MOLE_OFFICE_REPO_ROOT

beforeAll(async () => {
  t = await freshDb()
  map = await import('../src/server/lib/implementation.ts')
  workspaces = await import('../src/server/lib/workspaces.ts')
  app = (await apiApp()).app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-coverage-map-')))
  for (const [path, content] of Object.entries({
    'src/owned.ts': 'export const owned = 1\n',
    'src/lib/a.ts': 'export const a = 1\n',
    'src/lib/b.ts': 'export const b = 1\n',
    'src/guessed.ts': 'export const guessed = 1\n',
    'tests/owned.test.ts': 'export const test = 1\n',
  })) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  // The workspace scan walks MOLE_OFFICE_REPO_ROOT, so it is this scratch tree and nothing else.
  process.env.MOLE_OFFICE_REPO_ROOT = root
  // Each case files into its own project, so the counts still see only the records that case filed.
  caseNumber += 1
  workspace = `coverage-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: workspace, title: `Coverage case ${String(caseNumber)}` })
  headers = { ...PERSON, 'x-mole-office-workspace': workspace }
})

afterEach(() => {
  if (rootBefore === undefined) delete process.env.MOLE_OFFICE_REPO_ROOT
  else process.env.MOLE_OFFICE_REPO_ROOT = rootBefore
  rmSync(root, { recursive: true, force: true })
})

async function send(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) {
  const res = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: res.statusCode, body: res.json() as Record<string, unknown>, text: res.body }
}

/** A module, filed through the records door. */
async function aModule(title: string): Promise<string> {
  const res = await send('POST', '/api/records', { kind: 'module', title, data: {} })
  expect(res.status, res.text.slice(0, 300)).toBe(201)
  return (res.body.record as { id: string }).id
}

/** A repository rooted at the scratch tree, or at no checkout when `rooted` is false. */
async function aRepository(name: string, rooted = true): Promise<string> {
  const res = await send('POST', '/api/implementation/repositories', { name, ...(rooted ? { root } : {}) })
  expect(res.status, res.text.slice(0, 300)).toBe(201)
  return (res.body.repository as { id: string }).id
}

/** One row stated by the person, through POST /api/implementation. */
async function state(recordId: string, repositoryId: string, pattern: string, relation = 'implements'): Promise<void> {
  const res = await send('POST', '/api/implementation', { recordId, repositoryId, pattern, relation })
  expect(res.status, res.text.slice(0, 300)).toBe(201)
}

/** Both indexes built from the scratch tree: the repository's own, and the workspace scan coverage counts. */
async function rebuildBoth(): Promise<void> {
  const rebuilt = await send('POST', '/api/implementation/rebuild')
  expect(rebuilt.status, rebuilt.text.slice(0, 300)).toBe(200)
  const reindexed = await send('POST', '/api/source/reindex')
  expect(reindexed.status, reindexed.text.slice(0, 300)).toBe(200)
}

async function coverage(): Promise<SourceCoverage> {
  const res = await send('GET', '/api/source/coverage')
  expect(res.status, res.text.slice(0, 300)).toBe(200)
  return res.body.coverage as SourceCoverage
}

describe('coverage reads the implementation map', () => {
  it('counts the file one stated row names, where it read 0 before the row existed', async () => {
    const moduleId = await aModule('The owned code')
    const repositoryId = await aRepository('scratch')
    await rebuildBoth()

    // THE CONTROL: the same office with no row reads nothing claimed, so the count below is the row's.
    const before = await coverage()
    expect(before.totalFiles).toBe(5)
    expect(before.claimedFiles).toBe(0)

    await state(moduleId, repositoryId, 'src/owned.ts')
    await rebuildBoth()

    const after = await coverage()
    expect(after.claimedFiles).toBeGreaterThan(0)
    expect(after.claimedFiles).toBe(1)
    expect(after.unclaimed).not.toContain('src/owned.ts')
    const module = after.modules.find((m) => m.moduleId === moduleId)
    expect(module?.files).toEqual(['src/owned.ts'])
    expect(module?.problem).toBeNull()
  })

  it('counts a guessed row for nothing until a person accepts it', async () => {
    const moduleId = await aModule('The guessed code')
    const repositoryId = await aRepository('scratch')
    const guess = map.declareRelationship({
      workspaceId: workspace,
      recordId: moduleId,
      repositoryId,
      pattern: 'src/guessed.ts',
      proposing: true,
      actor: AGENT,
    })
    expect(guess.row.authority).toBe('guessed')
    await rebuildBoth()

    const guessed = await coverage()
    expect(guessed.claimedFiles).toBe(0)
    expect(guessed.unclaimed).toContain('src/guessed.ts')
    expect(guessed.modules.find((m) => m.moduleId === moduleId)?.claims).toEqual([])

    // Accepted by a person, the same row counts: it was left out for being a guess, not for its pattern.
    map.acceptGuess(guess.row.id, workspace, { type: 'human', id: THE_PERSON })
    const accepted = await coverage()
    expect(accepted.claimedFiles).toBe(1)
    expect(accepted.unclaimed).not.toContain('src/guessed.ts')
  })

  it('lists the files the stated rows name at GET /api/source?module=, whatever their relation', async () => {
    const moduleId = await aModule('The listed code')
    const repositoryId = await aRepository('scratch')
    await state(moduleId, repositoryId, 'src/lib')
    await state(moduleId, repositoryId, 'tests/*.test.ts', 'tests')
    map.declareRelationship({
      workspaceId: workspace,
      recordId: moduleId,
      repositoryId,
      pattern: 'src/guessed.ts',
      proposing: true,
      actor: AGENT,
    })
    await rebuildBoth()

    const res = await send('GET', `/api/source?module=${moduleId}`)
    expect(res.status, res.text.slice(0, 300)).toBe(200)
    expect((res.body.files as { path: string }[]).map((f) => f.path)).toEqual([
      'src/lib/a.ts',
      'src/lib/b.ts',
      'tests/owned.test.ts',
    ])
    expect((res.body.claims as ResolvedClaim[]).map((c) => c.pattern)).toEqual(['src/lib', 'tests/*.test.ts'])
    expect(res.body.problem).toBeNull()
  })

  it('counts each row in its own repository in coverage when the project holds two, as the source door does', async () => {
    const moduleId = await aModule('The code of which checkout')
    const repositoryId = await aRepository('scratch')
    await state(moduleId, repositoryId, 'src/owned.ts')
    await aRepository('firmware', false)
    await rebuildBoth()

    const cover = await coverage()
    expect([cover.totalFiles, cover.claimedFiles]).toEqual([5, 1])
    const module = cover.modules.find((m) => m.moduleId === moduleId)
    expect(module?.claims.map((c) => `${c.repository?.name}:${c.pattern}`)).toEqual(['scratch:src/owned.ts'])
    expect(module?.problem).toBeNull()
    // firmware has no checkout, so nothing of it is counted, and coverage says so by name.
    const firmware = cover.repositories?.find((r) => r.repository.name === 'firmware')
    expect(firmware?.scan).toBeNull()
    expect(firmware?.notCounted).toMatch(/^No scan of the repository "firmware" is stored, and it has no checkout on this machine to scan\. Its files are not counted\./)

    // The door reads each repository's own scan, so the row is counted in scratch, by name.
    const listed = await send('GET', `/api/source?module=${moduleId}`)
    expect(listed.status).toBe(200)
    expect((listed.body.files as { path: string; repository?: { name: string } }[]).map((f) => [f.repository?.name, f.path])).toEqual([
      ['scratch', 'src/owned.ts'],
    ])
    expect(listed.body.problem).toBeNull()
  })
})
