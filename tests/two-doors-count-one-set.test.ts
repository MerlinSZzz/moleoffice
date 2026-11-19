// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO DOORS, ONE TABLE, ONE SET.
 *
 * `POST /api/source/reindex` and `POST /api/implementation/rebuild` both write `source_files`. The
 * reindex scans one root and names no repository, so its rows carry `repository_id IS NULL`; the
 * rebuild scans a registered repository and names it. Before this file's fix the reindex deleted
 * EVERY row of the workspace and the coverage reader counted every row of the workspace, so:
 *
 *   1. a reindex erased the implementation index, and `GET /api/implementation/repositories` then
 *      read `indexed false`, `fileCount 0`, `builtAt none`;
 *   2. a rebuild after a reindex left every path in the table twice, once with a NULL owner and once
 *      with the repository id, and coverage counted 4,760 where the checkout held 2,381.
 *
 * The fix has two halves and this file drives both:
 *
 *   (b) the reindex deletes only the NULL rows it is about to rewrite, so it stops destroying the
 *       implementation index;
 *   (a) every reader that counts or lists files asks for the owner it means. The workspace scan's
 *       readers ask `repository_id IS NULL`; the implementation readers ask for their repository.
 *
 * WHAT THIS FILE ASSERTS, AND WHY THE RAW TABLE HOLDS TWO SETS ON PURPOSE. Two writers with two
 * stated owners is the model (a) and (b) chose; the table is not wrong for holding both. What must
 * never happen is a READER adding them together. So every path appears exactly once WITHIN each
 * owner's set, and each reader returns the checkout's real file count once — never twice it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The checkout every case scans, written down once so the expected count is the count on disk. */
const CHECKOUT: Record<string, string> = {
  'src/a.ts': 'export const a = 1\n',
  'src/b.ts': "import { a } from './a.ts'\n",
  'src/web/App.tsx': 'export const App = () => null\n',
  'src/lib/helper.ts': 'export const h = 2\n',
  'scripts/run.ts': "console.log('run')\n",
}
const PATHS = Object.keys(CHECKOUT).sort()

const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'content-type': 'application/json',
}

interface CoverageReply {
  coverage: { totalFiles: number; claimedFiles: number; unclaimed: string[] }
}
interface SourceReply {
  index: { fileCount: number }
  files: { path: string }[]
}
interface RepositoriesReply {
  repositories: { id: string; indexed: boolean; builtAt: string | null; fileCount: number }[]
}
interface RegisteredReply {
  repository: { id: string }
}

let t: TestDb
let app: FastifyInstance
const madeDirs: string[] = []
let previousRoot: string | undefined
let caseNumber = 0
let WORKSPACE = 'two-doors-case-0'
let HEADERS: Record<string, string> = {}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  previousRoot = process.env.MOLE_OFFICE_REPO_ROOT
})

afterEach(() => {
  // Put the environment back rather than leaving a scratch tree named as this checkout's root for
  // whichever test file the runner loads next in this worker process.
  if (previousRoot === undefined) delete process.env.MOLE_OFFICE_REPO_ROOT
  else process.env.MOLE_OFFICE_REPO_ROOT = previousRoot
  for (const dir of madeDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A throwaway checkout. Keys are repository-relative paths. */
function tree(files: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-two-doors-')))
  madeDirs.push(dir)
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return dir
}

function bodyOf<T>(res: { body: string }): T {
  const parsed: unknown = JSON.parse(res.body)
  return parsed as T
}

async function register(root: string): Promise<string> {
  caseNumber += 1
  WORKSPACE = `two-doors-case-${String(caseNumber)}`
  HEADERS = { ...AS_THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    headers: AS_THE_PERSON,
    payload: JSON.stringify({ id: WORKSPACE, title: `Mole Office case ${String(caseNumber)}` }),
  })
  expect(made.statusCode, made.body).toBe(201)
  const res = await app.inject({
    method: 'POST',
    url: '/api/implementation/repositories',
    headers: HEADERS,
    payload: JSON.stringify({ name: 'panelx', root }),
  })
  expect(res.statusCode, res.body).toBe(201)
  return bodyOf<RegisteredReply>(res).repository.id
}

/** Door one: the workspace scan. No input, and it walks `MOLE_OFFICE_REPO_ROOT`. */
async function reindex(): Promise<void> {
  const res = await app.inject({ method: 'POST', url: '/api/source/reindex', headers: HEADERS })
  expect(res.statusCode, res.body).toBe(200)
}

/** Door two: one repository's index. */
async function rebuild(repositoryId: string): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/implementation/rebuild',
    headers: HEADERS,
    payload: JSON.stringify({ repository: repositoryId }),
  })
  expect(res.statusCode, res.body).toBe(200)
}

async function coverage(): Promise<CoverageReply> {
  const res = await app.inject({ method: 'GET', url: '/api/source/coverage', headers: HEADERS })
  expect(res.statusCode, res.body).toBe(200)
  return bodyOf<CoverageReply>(res)
}

async function sourceFiles(): Promise<SourceReply> {
  const res = await app.inject({ method: 'GET', url: '/api/source', headers: HEADERS })
  expect(res.statusCode, res.body).toBe(200)
  return bodyOf<SourceReply>(res)
}

async function repositoryRow(repositoryId: string): Promise<RepositoriesReply['repositories'][number]> {
  const res = await app.inject({ method: 'GET', url: '/api/implementation/repositories', headers: HEADERS })
  expect(res.statusCode, res.body).toBe(200)
  const row = bodyOf<RepositoriesReply>(res).repositories.find((r) => r.id === repositoryId)
  if (row === undefined) throw new Error(`repository ${repositoryId} is not in the list`)
  return row
}

/** Every owner's rows in the live table, split by owner, so the per-owner claims can be read. */
function rowsByOwner(repositoryId: string): { null: string[]; mine: string[] } {
  const rows = t.client.sqlite
    .prepare('SELECT repository_id, path FROM source_files WHERE workspace_id = ? ORDER BY path')
    .all(WORKSPACE) as { repository_id: string | null; path: string }[]
  return {
    null: rows.filter((r) => r.repository_id === null).map((r) => r.path),
    mine: rows.filter((r) => r.repository_id === repositoryId).map((r) => r.path),
  }
}

describe('the reindex and the implementation rebuild agree on one set', () => {
  it('runs both doors and counts the checkout once, not twice', async () => {
    const root = tree(CHECKOUT)
    process.env.MOLE_OFFICE_REPO_ROOT = root
    const repositoryId = await register(root)

    await reindex()
    await rebuild(repositoryId)

    // EACH OWNER HOLDS EACH PATH ONCE. The table holds two owners by design; what this pins is
    // that neither writer duplicated a path inside its own set.
    const owners = rowsByOwner(repositoryId)
    expect(owners.null).toEqual(PATHS)
    expect(owners.mine).toEqual(PATHS)

    // THE TWO READERS EACH COUNT ONE OWNER. If either filter is removed these are 2x.
    const cover = await coverage()
    expect(cover.coverage.totalFiles).toBe(PATHS.length)

    const listed = await sourceFiles()
    expect(listed.index.fileCount).toBe(PATHS.length)
    expect(listed.files.map((file) => file.path).sort()).toEqual(PATHS)

    const repo = await repositoryRow(repositoryId)
    expect(repo.indexed).toBe(true)
    expect(repo.fileCount).toBe(PATHS.length)
  })

  it('does not wipe the implementation index when a reindex runs after the rebuild', async () => {
    const root = tree(CHECKOUT)
    process.env.MOLE_OFFICE_REPO_ROOT = root
    const repositoryId = await register(root)

    // THE LIVE FAILURE SEQUENCE, in the order that produced it: the implementation index existed,
    // then a reindex ran. The reindex used to delete the named rows along with its own.
    await rebuild(repositoryId)
    await reindex()

    const repo = await repositoryRow(repositoryId)
    expect(repo.indexed).toBe(true)
    expect(repo.builtAt).not.toBeNull()
    expect(repo.fileCount).toBe(PATHS.length)

    const cover = await coverage()
    expect(cover.coverage.totalFiles).toBe(PATHS.length)
  })
})
