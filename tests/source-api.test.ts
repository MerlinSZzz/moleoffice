// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The source index, tested the way the two layers have to behave.
 *
 * The failure this feature answers: a dogfooding agent filed eight of ten subsystems and the two
 * front-end ones could only ever be stubs, because nothing published what the browser app is made
 * of. So these tests are not "the endpoint returns 200". They check the three properties that
 * make a derived layer safe to believe:
 *
 *   1. IT SAYS HOW OLD IT IS. Every response carries the build time and the age, and a GET never
 *      rebuilds — a read that quietly rescanned would make `builtAt` always "now", which is the
 *      one lie that would let somebody trust this after a refactor.
 *   2. IT CANNOT BE WRITTEN TO. There is no PUT, no PATCH and no DELETE for a source file, and a
 *      rebuild with a body is refused rather than half-obeyed.
 *   3. IT ANSWERS THE TWO QUESTIONS IT EXISTS FOR. Files no module claims, and claims that point
 *      at paths that are not there.
 *
 * The scan is exercised against throwaway trees and never against this whole repository: a tree
 * of copies of the files the cases name, and trees of their own for what happens when a file is
 * added, renamed or deleted without editing files this phase does not own. The whole repository
 * is scanned in tests/sourceindex.test.ts, which proves it is the root scanned by default and that
 * the walk over it skips what it should.
 */

import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, one, type TestDb } from './helpers.ts'
import { trackApiRoutes, type ApiRoute } from '../src/server/api/kinds.ts'
import { KIND_SPECS, validateData } from '../src/shared/kinds.ts'
import type { ModuleClaims, ResolvedClaim, SourceFile, SourceIndexStamp } from '../src/shared/types.ts'
import { claimProblem } from '../src/shared/paths.ts'

/**
 * FILE A MODULE'S CLAIMS AS STATED ROWS OF THE IMPLEMENTATION MAP, which is what coverage reads.
 *
 * `claimsOf` in src/server/lib/sourceindex.ts reads the stated rows `statedFor` returns, in the
 * project's one repository. The rows go in through `declareRelationship`, the function behind
 * POST /api/implementation. A pattern that door refuses, such as an absolute path, is written
 * straight into the table instead, the way the claims migration (src/server/db/module-claims.ts)
 * keeps such a pattern as it was written.
 *
 * The door counts each row against the stored scan of the repository the row names (decision
 * 0KSoGUNDF9ml), so the one repository is rooted at the checkout the workspace scan walks, and its
 * own scan is stored when it is registered.
 */
function withClaims(id: string, claims: readonly string[]): void {
  const repositoryId = repos.listRepositories('default')[0]?.id ?? aScannedFixture()
  claims.forEach((pattern, n) => {
    if (claimProblem(pattern) === null) {
      map.declareRelationship({ workspaceId: 'default', recordId: id, repositoryId, pattern, actor: db.api.HUMAN })
      return
    }
    db.client.sqlite
      .prepare(
        'INSERT INTO implementation_map (id, workspace_id, record_id, repository_id, pattern, relation, provenance, ' +
          "stated_at, stated_by) VALUES (?, 'default', ?, ?, ?, 'implements', 'declared', '2026-09-25 00:00:00', " +
          "'system:module-claims-migration')",
      )
      .run(`row-${id}-${n}`, id, repositoryId, pattern)
  })
}

function aScannedFixture(): string {
  const repositoryId = repos.registerRepository({
    workspaceId: 'default',
    name: 'fixture',
    root: idx.repoRoot(),
    actor: db.api.HUMAN,
  }).id
  map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: db.api.HUMAN })
  return repositoryId
}

type SourceApi = typeof import('../src/server/api/source.ts')
type SourceIndexLib = typeof import('../src/server/lib/sourceindex.ts')
type HttpLib = typeof import('../src/server/lib/http.ts')

let db: TestDb
let source: SourceApi
let map: typeof import('../src/server/lib/implementation.ts')
let repos: typeof import('../src/server/lib/repositories.ts')
let workspaces: typeof import('../src/server/lib/workspaces.ts')
/**
 * The scan and the comparison live in lib/sourceindex.ts, which is the only implementation of
 * either. api/source.ts is routes over it, so the two blocks at the bottom of this file that
 * exercise a scan directly reach for the library rather than through the endpoints.
 */
let idx: SourceIndexLib
let app: FastifyInstance
let listRoutes: () => readonly ApiRoute[]
/** The module whose data the coverage tests overwrite, filed by the claims tests. */
let staleModuleId: string

/** Parse a response the way a caller does: from the bytes on the wire. */
function bodyOf(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 160)}`)
  }
  return parsed as Record<string, unknown>
}

async function get(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url, headers })
  return { status: res.statusCode, body: bodyOf(res) }
}

async function reindex(
  payload?: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res =
    payload === undefined
      ? await app.inject({ method: 'POST', url: '/api/source/reindex', headers })
      : await app.inject({ method: 'POST', url: '/api/source/reindex', headers, payload })
  return { status: res.statusCode, body: bodyOf(res) }
}

function stampOf(body: Record<string, unknown>): SourceIndexStamp {
  const stamp = body.index
  if (typeof stamp !== 'object' || stamp === null) throw new Error(`no index stamp in ${JSON.stringify(body).slice(0, 200)}`)
  return stamp as SourceIndexStamp
}

function filesOf(body: Record<string, unknown>): SourceFile[] {
  if (!Array.isArray(body.files)) throw new Error(`no files in ${JSON.stringify(body).slice(0, 200)}`)
  return body.files as SourceFile[]
}

function fileAt(files: readonly SourceFile[], path: string): SourceFile {
  const found = files.find((file) => file.path === path)
  if (found === undefined) {
    throw new Error(`${path} is not in the index; it has ${files.length} files, e.g. ${files.slice(0, 5).map((f) => f.path).join(', ')}`)
  }
  return found
}

/**
 * THE CHECKOUT THIS FILE SCANS, AND WHY IT IS NOT THIS ONE. The door scans the root `repoRoot` in
 * src/server/lib/sourceindex.ts reads on each request, so for as long as this file runs that root
 * names a small tree. Scanning this whole checkout, once for the first rebuild and again for the
 * repository the claims cases register, takes seconds on a busy machine (tests/sourceindex.test.ts
 * says how many), where a hook has ten, and a hook that runs out skips every case in the file.
 *
 * The cases name a few of this repository's files, so those files are copied from this checkout
 * when the file starts, and nothing they say is written down here. Beside them are the places a
 * scan passes over, each holding a file the index would take if it looked there.
 */
const NAMED_SOURCE_FILES = [
  'src/server/api/source.ts',
  'src/server/lib/records.ts',
  'src/shared/kinds.ts',
  'src/web/App.tsx',
  'src/web/index.html',
  'src/web/pages/HomePage.tsx',
  'src/web/styles.css',
  'tests/source-api.test.ts',
] as const
/** Files of this checkout that are not source, so the scan has something to count and leave out. */
const OTHER_FILES = ['README.md', 'package.json'] as const
const PLACES_PASSED_OVER = ['.git/a.ts', '_scratch/a.ts', 'data/a.ts', 'dist/a.ts', 'node_modules/a.ts', 'src/_probe.ts'] as const

/** The small tree, every source file copied into it, and the root that was set before it. */
let tree: string | undefined
let sourceFiles: string[]
let rootBefore: string | undefined

function aSmallCopyOfThisCheckout(): void {
  const checkout = fileURLToPath(new URL('../', import.meta.url))
  // A pattern across directories has to match more than five files, so four more pages go in,
  // whichever sort first, and one migration for a language that is not TypeScript.
  const morePages = readdirSync(join(checkout, 'src/web/pages'))
    .filter((name) => name.endsWith('.tsx') && name !== 'HomePage.tsx')
    .sort()
    .slice(0, 4)
    .map((name) => `src/web/pages/${name}`)
  const migration = readdirSync(join(checkout, 'drizzle')).filter((name) => name.endsWith('.sql')).sort()[0]
  if (morePages.length < 4 || migration === undefined) {
    throw new Error(`this checkout has ${morePages.length} more pages and ${migration ?? 'no'} migration; the tree needs four and one`)
  }
  sourceFiles = [...NAMED_SOURCE_FILES, ...morePages, `drizzle/${migration}`]

  tree = mkdtempSync(join(tmpdir(), 'mole-office-source-api-'))
  rootBefore = process.env[idx.ROOT_VAR]
  for (const path of [...sourceFiles, ...OTHER_FILES]) {
    mkdirSync(dirname(join(tree, path)), { recursive: true })
    copyFileSync(join(checkout, path), join(tree, path))
  }
  for (const path of PLACES_PASSED_OVER) {
    mkdirSync(dirname(join(tree, path)), { recursive: true })
    writeFileSync(join(tree, path), 'export const PASSED_OVER = true\n')
  }
  process.env[idx.ROOT_VAR] = tree
}

beforeAll(async () => {
  db = await freshDb()
  source = await import('../src/server/api/source.ts')
  idx = await import('../src/server/lib/sourceindex.ts')
  map = await import('../src/server/lib/implementation.ts')
  repos = await import('../src/server/lib/repositories.ts')
  workspaces = await import('../src/server/lib/workspaces.ts')
  const http: HttpLib = await import('../src/server/lib/http.ts')
  aSmallCopyOfThisCheckout()

  app = Fastify()
  listRoutes = trackApiRoutes(app)
  http.installErrorHandling(app)
  await app.register(source.sourceRoutes, { prefix: '/api' })
  await app.ready()
})

afterAll(async () => {
  // The root goes back first, because the files after this one in a shared process read the same
  // variable, and a close that fails would leave it pointing at a tree that is gone.
  if (tree !== undefined) {
    if (rootBefore === undefined) delete process.env[idx.ROOT_VAR]
    else process.env[idx.ROOT_VAR] = rootBefore
    rmSync(tree, { recursive: true, force: true })
  }
  await app.close()
  db.close()
})

// ============================================================ before anything has been scanned

describe('an index that has never been built', () => {
  it('is a 404 that names the one endpoint that builds it, not an empty file list', async () => {
    const { status, body } = await get('/api/source')
    expect(status).toBe(404)
    // An empty `files` array with a 200 would read as "this repository has no code", which is
    // the shape of wrong answer this whole feature exists to stop being given.
    expect(body.files).toBeUndefined()
    expect(String(body.error)).toContain('POST /api/source/reindex')
  })

  it('refuses to compute coverage over an index that does not exist', async () => {
    const { status, body } = await get('/api/source/coverage')
    expect(status).toBe(404)
    expect(String(body.error)).toContain('POST /api/source/reindex')
  })
})

// ============================================================================ the first scan

describe('the first rebuild', () => {
  let first: Record<string, unknown>

  beforeAll(async () => {
    const res = await reindex()
    expect(res.status).toBe(200)
    first = res.body
  })

  it('says it was the first scan, so nothing is reported as a change that nobody made', () => {
    const changes = first.changes as { firstScan: boolean; previousBuiltAt: string | null; removed: string[]; changed: unknown[] }
    expect(changes.firstScan).toBe(true)
    expect(changes.previousBuiltAt).toBeNull()
    expect(changes.removed).toEqual([])
    expect(changes.changed).toEqual([])
  })

  it('found every source file of the checkout it was pointed at, the file being tested among them', () => {
    const changes = first.changes as { added: string[] }
    expect(stampOf(first).root).toBe(tree)
    expect([...changes.added].sort()).toEqual([...sourceFiles].sort())
    expect(changes.added).toContain('tests/source-api.test.ts')
  })

  it('stamps the answer with when it was built, how old that is, and who asked', () => {
    const stamp = stampOf(first)
    expect(stamp.builtAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(stamp.ageSeconds).toBeGreaterThanOrEqual(0)
    expect(stamp.age).toMatch(/^\d+[smhd]/)
    expect(stamp.builtBy).toBe(`human:${THE_TEST_OFFICES_OWNER.id}`)
    expect(stamp.fileCount).toBe(sourceFiles.length)
    expect(stamp.scanMs).toBeGreaterThanOrEqual(0)
  })

  it('says where it did not look, because an unsearched place is not an empty one', () => {
    const stamp = stampOf(first)
    const said = stamp.skipped.join(' ')
    expect(said).toContain('node_modules')
    expect(said).toContain('dist')
    // The files that exist and are not indexed are counted, so the coverage figure below is a
    // percentage of a set somebody can see rather than of a set chosen silently.
    expect(said).toMatch(/\d+ \.(png|md|json)/)
  })

  it('carries the sentence that stops it being read as the canonical layer', () => {
    const stamp = stampOf(first)
    expect(stamp.derived).toContain('DERIVED')
    expect(stamp.derived).toContain('POST /api/source/reindex')
    expect(stamp.howRead).toContain('not by a parser')
  })
})

// ============================================================================ what it indexed

describe('the index', () => {
  let files: SourceFile[]
  let stamp: SourceIndexStamp

  beforeAll(async () => {
    const { status, body } = await get('/api/source')
    expect(status).toBe(200)
    files = filesOf(body)
    stamp = stampOf(body)
  })

  it('describes a file by what it is, not by what anybody typed about it', () => {
    const self = fileAt(files, 'src/server/api/source.ts')
    expect(self.language).toBe('typescript')
    expect(self.sizeBytes).toBeGreaterThan(1000)
    expect(self.lines).toBeGreaterThan(100)
    expect(self.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('reads what a file imports and what it declares for others', () => {
    const self = fileAt(files, 'src/server/api/source.ts')
    expect(self.imports).toContain('@shared/types.ts')
    // This file is routes over one scanner, and the index is where that is visible: it imports
    // the library, and it reads no directory of its own. A second scanner growing back in here
    // would announce itself as node:fs on this row.
    expect(self.imports).toContain('../lib/sourceindex.ts')
    expect(self.imports).not.toContain('node:fs')
    expect(self.exports).toContain('sourceRoutes')
    expect(self.exports).toContain('SOURCE_ROUTE_NOTES')
  })

  it('covers the other languages in the repository, not only TypeScript', () => {
    expect(fileAt(files, 'src/web/styles.css').language).toBe('css')
    expect(fileAt(files, 'src/web/index.html').language).toBe('html')
    expect(files.some((file) => file.language === 'tsx')).toBe(true)
    expect(files.some((file) => file.language === 'sql')).toBe(true)
  })

  it('leaves out what it said it left out', () => {
    for (const file of files) {
      expect(file.path.startsWith('node_modules/'), file.path).toBe(false)
      expect(file.path.startsWith('dist/'), file.path).toBe(false)
      expect(file.path.startsWith('.git/'), file.path).toBe(false)
      expect(file.path.startsWith('data/'), file.path).toBe(false)
      // A leading underscore is this repository's mark for scratch and generated material.
      expect(file.path.split('/').some((part) => part.startsWith('_')), file.path).toBe(false)
    }
  })

  it('is not rebuilt by reading it: the age is the age of the scan, not of the request', async () => {
    const again = await get('/api/source')
    expect(stampOf(again.body).builtAt).toBe(stamp.builtAt)
    expect(stampOf(again.body).fileCount).toBe(stamp.fileCount)
  })

  it('refuses a query parameter it does not know rather than answering something else', async () => {
    // ?moduleId= silently ignored would hand back the whole index, which a caller would read as
    // "this module claims everything" — the worst possible wrong answer from a coverage tool.
    const res = await app.inject({ method: 'GET', url: '/api/source?moduleId=abc' })
    expect(res.statusCode).toBe(400)
    expect(String(bodyOf(res).error)).toContain('moduleId')
  })
})

// ============================================================================ claims

describe('what a module claims', () => {
  let claimant: { id: string }
  let stale: { id: string }
  let absolute: { id: string }

  beforeAll(() => {
    claimant = db.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'Source API',
      data: {
        context: 'The endpoints that serve the derived source index and resolve module claims against it.',
        parts: [],
      },
      actor: db.api.HUMAN,
    })
    withClaims(claimant.id, ['src/server/api/source.ts', 'src/shared/kinds.ts'])
    stale = db.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'Web front end',
      data: {
        context: 'The browser app: panels, pages and the layout the user drags into place.',
        parts: [],
      },
      actor: db.api.HUMAN,
    })
    withClaims(stale.id, ['src/**/*.tsx', 'src/web/legacy/**'])
    staleModuleId = stale.id
    absolute = db.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'Claim written the wrong way round',
      data: {
        context: 'A module whose claim was written as if it were a PathRef, to prove that is reported as its own problem.',
        parts: [],
      },
      actor: db.api.HUMAN,
    })
    withClaims(absolute.id, [`${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/src/web`])
  })

  it('resolves an exact path and a directory to real files', async () => {
    const { status, body } = await get(`/api/source?module=${claimant.id}`)
    expect(status).toBe(200)
    const claims = body.claims as ResolvedClaim[]
    expect(claims.map((c) => c.pattern)).toEqual(['src/server/api/source.ts', 'src/shared/kinds.ts'])
    expect(one(claims[0]?.matched ?? [], 'match')).toBe('src/server/api/source.ts')
    // The files come back whole, not as bare paths: the point of resolving a claim is to get at
    // what the index knows about the file, not to be told the string back.
    expect(filesOf(body).map((f) => f.path)).toEqual(['src/server/api/source.ts', 'src/shared/kinds.ts'])
    expect(fileAt(filesOf(body), 'src/shared/kinds.ts').exports).toContain('KIND_SPECS')
    expect(body.problem).toBeNull()
  })

  it('matches a pattern across directories, including the file that is not in one', async () => {
    const { body } = await get(`/api/source?module=${stale.id}`)
    const matched = (body.claims as ResolvedClaim[])[0]?.matched ?? []
    expect(matched.length).toBeGreaterThan(5)
    for (const path of matched) expect(path.endsWith('.tsx'), path).toBe(true)
    expect(matched).toContain('src/web/App.tsx')
    expect(matched).toContain('src/web/pages/HomePage.tsx')
  })

  it('reports a claim that matches nothing as stale, and says which module made it', async () => {
    const { body } = await get(`/api/source?module=${stale.id}`)
    const staleClaims = body.staleClaims as ResolvedClaim[]
    expect(staleClaims.map((c) => c.pattern)).toEqual(['src/web/legacy/**'])
    // Stale, not malformed: the pattern is well formed and the files have gone. The two have
    // different fixes, so they are not reported as one thing.
    expect(one(staleClaims, 'stale claim').problem).toBeNull()
  })

  it('tells an absolute path apart from a stale one, because no rebuild will ever fix it', async () => {
    const { body } = await get(`/api/source?module=${absolute.id}`)
    const claim = one(body.claims as ResolvedClaim[], 'claim')
    expect(claim.matched).toEqual([])
    expect(claim.problemCode).toBe('sourceClaimAbsolute')
    expect(String(claim.problem)).toContain('absolute path')
    expect(String(claim.problem)).toContain('paths')
  })

  it('carries the build time, like every other answer here', async () => {
    const { body } = await get(`/api/source?module=${claimant.id}`)
    expect(stampOf(body).builtAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('says which record it could not use, rather than answering with the whole index', async () => {
    const missing = await get('/api/source?module=does-not-exist')
    expect(missing.status).toBe(404)
    expect(String(missing.body.error)).toContain('?kind=module')

    const note = db.api.createRecord({ workspaceId: 'default',
      kind: 'note',
      title: 'Not a module',
      data: { body: 'A note cannot claim source, because a note carries no responsibility for anything.' },
      actor: db.api.HUMAN,
    })
    const wrongKind = await get(`/api/source?module=${note.id}`)
    expect(wrongKind.status).toBe(400)
    expect(String(wrongKind.body.error)).toContain('is a note, not a module')
  })
})

// ============================================================================ coverage

describe('coverage', () => {
  let coverage: {
    totalFiles: number
    claimedFiles: number
    unclaimedFiles: number
    percentClaimed: number | null
    unclaimed: string[]
    staleClaims: {
      moduleId: string
      moduleTitle: string
      pattern: string
      problem: string | null
      problemCode?: string | null
    }[]
    modules: ModuleClaims[]
  }
  let stamp: SourceIndexStamp

  beforeAll(async () => {
    const { status, body } = await get('/api/source/coverage')
    expect(status).toBe(200)
    coverage = body.coverage as typeof coverage
    stamp = stampOf(body)
  })

  it('counts the whole index, and agrees with the index about how big it is', () => {
    expect(coverage.totalFiles).toBe(stamp.fileCount)
    expect(coverage.claimedFiles + coverage.unclaimedFiles).toBe(coverage.totalFiles)
  })

  it('names the files no module has taken responsibility for', () => {
    // Nothing above claims the server library, so it must be in this list. This is the
    // unconsumed-results query one level down, and an empty answer here would be the bug.
    expect(coverage.unclaimed).toContain('src/server/lib/records.ts')
    expect(coverage.unclaimed).not.toContain('src/server/api/source.ts')
    expect(coverage.unclaimedFiles).toBe(coverage.unclaimed.length)
  })

  it('gives the percentage claimed, and it is a real fraction of a countable set', () => {
    const percent = coverage.percentClaimed
    expect(percent).not.toBeNull()
    expect(percent).toBeGreaterThan(0)
    expect(percent).toBeLessThan(100)
    expect(percent).toBeCloseTo((coverage.claimedFiles / coverage.totalFiles) * 100, 1)
  })

  it('lists every stale claim with the module that has to fix it', () => {
    const patterns = coverage.staleClaims.map((c) => `${c.moduleTitle}: ${c.pattern}`)
    expect(patterns).toContain('Web front end: src/web/legacy/**')
    expect(patterns).toContain(`Claim written the wrong way round: ${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/src/web`)
    const malformed = coverage.staleClaims.find((c) => c.moduleTitle === 'Claim written the wrong way round')
    expect(malformed?.problemCode).toBe('sourceClaimAbsolute')
    expect(String(malformed?.problem)).toContain('absolute path')
  })

  it('lists modules that claim nothing, because that is the finding', async () => {
    const quiet = db.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'A module that has never claimed a file',
      data: { context: 'Hardware. It owns a bracket and a camera mount, and no code at all.', parts: [] },
      actor: db.api.HUMAN,
    })
    const { body } = await get('/api/source/coverage')
    const found = (body.coverage as typeof coverage).modules.find((m) => m.moduleId === quiet.id)
    expect(found, 'a module with no claims must still be listed').toBeDefined()
    expect(found?.claims).toEqual([])
    expect(found?.files).toEqual([])
    expect(found?.problem).toBeNull()
  })

  it('reads a module\'s claims from the map, whatever its data still holds', async () => {
    // A record written by an older build can still hold `claims` in its data, even a bare string.
    // Written straight to SQLite, because the write door refuses the key. Coverage reads the map,
    // so the report neither breaks on it nor counts it.
    db.client.sqlite
      .prepare('UPDATE records SET data = ? WHERE id = ?')
      .run(
        JSON.stringify({ context: 'written before claims were a list', parts: [], claims: 'src/web' }),
        staleModuleId,
      )
    const { status, body } = await get('/api/source/coverage')
    expect(status).toBe(200)
    const module = (body.coverage as typeof coverage).modules.find((m) => m.moduleId === staleModuleId)
    expect(module?.claims.map((c) => c.pattern)).toEqual(['src/**/*.tsx', 'src/web/legacy/**'])
    expect(module?.problem).toBeNull()
  })
})

// ============================================================ the index cannot be written to

describe('writing to the index', () => {
  it('is not possible: there is no PUT, PATCH or DELETE for a source file', async () => {
    for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({
        method,
        url: '/api/source/src/web/App.tsx',
        payload: { path: 'src/web/App.tsx', language: 'typescript' },
      })
      expect(res.statusCode, `${method} /api/source/...`).toBe(404)
    }
  })

  it('is not possible by POSTing a file either — the only POST is the rebuild', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/source', payload: { path: 'invented.ts' } })
    expect(res.statusCode).toBe(404)
  })

  it('refuses a rebuild that carries a body, rather than rebuilding and ignoring it', async () => {
    const { status, body } = await reindex({ files: [{ path: 'invented.ts' }] })
    expect(status).toBe(400)
    expect(String(body.error)).toContain('derived')
  })

  it('left the index exactly as it was after all of that', async () => {
    const { body } = await get('/api/source')
    expect(filesOf(body).some((file) => file.path === 'invented.ts')).toBe(false)
  })
})

// ============================================================================ rebuilding

/** The checkout the rebuilding cases scan: three files, so a scan takes milliseconds however busy the machine is. */
const A_SMALL_CHECKOUT: Readonly<Record<string, string>> = {
  'src/main.ts': "import { helper } from './helper.ts'\nexport const NAME = 'x'\n",
  'src/helper.ts': 'export function helper(x: unknown) { return x }\n',
  'src/page.css': 'body { color: red }\n',
}

describe('rebuilding', () => {
  /**
   * A CHECKOUT AND A PROJECT OF THEIR OWN. Neither case needs this repository: the first is about the
   * comparison with the last scan, the second about who the stamp names. In the default project a
   * rebuild walks the file's tree twice, once for the project's scan and once more for the repository
   * the claims cases registered at it. So while they run, the root the door reads on each request names
   * a tree of three files, and they ask in a project that has no registered repository. No case in this
   * file scans the real repository; tests/sourceindex.test.ts does.
   */
  const PROJECT = { 'x-mole-office-workspace': 'source-api-rebuilding' }
  let root: string
  let rootBefore: string | undefined

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mole-office-rebuild-'))
    for (const [path, text] of Object.entries(A_SMALL_CHECKOUT)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    rootBefore = process.env[idx.ROOT_VAR]
    process.env[idx.ROOT_VAR] = root
    workspaces.createWorkspace({ id: PROJECT['x-mole-office-workspace'], title: 'A scratch checkout rebuilt' })
    // The scan the first case compares against.
    expect((await reindex(undefined, PROJECT)).status).toBe(200)
  })

  afterAll(() => {
    // Put the root back, because the cases after these, and the files after this one in a shared process,
    // read the same variable.
    if (rootBefore === undefined) delete process.env[idx.ROOT_VAR]
    else process.env[idx.ROOT_VAR] = rootBefore
    rmSync(root, { recursive: true, force: true })
  })

  it('compares against the last scan and reports that nothing moved', async () => {
    const before = stampOf((await get('/api/source', PROJECT)).body)
    const { status, body } = await reindex(undefined, PROJECT)
    expect(status).toBe(200)

    const changes = body.changes as {
      firstScan: boolean
      previousBuiltAt: string
      added: string[]
      removed: string[]
      changed: { path: string; what: string }[]
      unchanged: number
    }
    expect(changes.firstScan).toBe(false)
    expect(changes.previousBuiltAt).toBe(before.builtAt)

    // The invariant of a comparison: every file in the new scan is new, different, or the same.
    expect(changes.added.length + changes.changed.length + changes.unchanged).toBe(stampOf(body).fileCount)

    // NOTHING MOVED ANYWHERE IN THE TREE. The tree is this test's own, and nothing writes to it between
    // the two scans, so the whole comparison is quiet and every file of it was found the same.
    expect(stampOf(body).root).toBe(root)
    expect(changes.added).toEqual([])
    expect(changes.removed).toEqual([])
    expect(changes.changed).toEqual([])
    expect(changes.unchanged).toBe(Object.keys(A_SMALL_CHECKOUT).length)
  })

  it('attributes the rebuild to whoever asked for it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/source/reindex',
      headers: { ...PROJECT, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
    })
    expect(res.statusCode).toBe(200)
    expect(stampOf(bodyOf(res)).builtBy).toBe('agent:claude-code')
  })
})

// ============================================================ the scan, on a tree of its own

describe('the scan itself', () => {
  let root: string
  let result: ReturnType<SourceIndexLib['scanTree']>

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'mole-office-scan-'))
    mkdirSync(join(root, 'app'))
    mkdirSync(join(root, 'node_modules'))
    mkdirSync(join(root, '_scratch'))
    mkdirSync(join(root, '.hidden'))
    writeFileSync(
      join(root, 'app/main.ts'),
      "import { helper } from './helper.ts'\nimport fs from 'node:fs'\nexport const NAME = 'x'\nexport function run() { return helper(fs) }\n",
    )
    writeFileSync(join(root, 'app/helper.ts'), 'export function helper(x: unknown) { return x }\nexport default helper\n')
    writeFileSync(join(root, 'app/page.css'), '@import "./base.css";\nbody { color: red }\n')
    writeFileSync(join(root, 'app/tool.py'), 'import os\nfrom pathlib import Path\n\ndef run():\n    return os.getcwd()\n')
    writeFileSync(join(root, 'README.md'), '# not source\n')
    writeFileSync(join(root, 'node_modules/dep.ts'), 'export const dep = 1\n')
    writeFileSync(join(root, '_scratch/notes.ts'), 'export const scratch = 1\n')
    writeFileSync(join(root, '.hidden/secret.ts'), 'export const secret = 1\n')
    result = idx.scanTree(root)
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('indexes the source and nothing else', () => {
    expect(result.files.map((f) => f.path)).toEqual(['app/helper.ts', 'app/main.ts', 'app/page.css', 'app/tool.py'])
  })

  it('reads imports and exports per language, and says so where it cannot', () => {
    const main = fileAt(result.files, 'app/main.ts')
    expect(main.imports).toEqual(['./helper.ts', 'node:fs'])
    expect(main.exports).toEqual(['NAME', 'run'])
    expect(fileAt(result.files, 'app/helper.ts').exports).toEqual(['helper', 'default'])
    expect(fileAt(result.files, 'app/page.css').imports).toEqual(['./base.css'])
    expect(fileAt(result.files, 'app/page.css').exports).toEqual([])
    const python = fileAt(result.files, 'app/tool.py')
    expect(python.imports).toEqual(['os', 'pathlib'])
    expect(python.exports).toEqual(['run'])
  })

  it('counts lines the way an editor shows them', () => {
    expect(fileAt(result.files, 'app/main.ts').lines).toBe(4)
    expect(fileAt(result.files, 'app/helper.ts').lines).toBe(2)
  })

  it('says what it skipped and why, one sentence each', () => {
    const said = result.skipped.join(' ')
    expect(said).toContain('node_modules')
    expect(said).toContain('_scratch')
    expect(said).toContain('.hidden')
    expect(said).toContain('1 .md')
  })
})

// ============================================================ what a rebuild reports as changed

describe('the comparison a rebuild reports', () => {
  const file = (path: string, over: Partial<SourceFile> = {}): SourceFile => ({
    path,
    language: 'typescript',
    sizeBytes: 100,
    lines: 5,
    imports: ['node:fs'],
    exports: ['a'],
    modifiedAt: '2026-08-08 10:00:00',
    ...over,
  })

  it('reports a file that appeared and a file that went, by name', () => {
    const report = idx.reindexReport(
      [file('src/a.ts'), file('src/gone.ts')],
      [file('src/a.ts'), file('src/new.ts')],
      '2026-08-08 09:00:00',
    )
    expect(report.firstScan).toBe(false)
    expect(report.previousBuiltAt).toBe('2026-08-08 09:00:00')
    expect(report.added).toEqual(['src/new.ts'])
    expect(report.removed).toEqual(['src/gone.ts'])
    expect(report.unchanged).toBe(1)
  })

  it('says what differs about a file that is still there', () => {
    const report = idx.reindexReport(
      [file('src/a.ts')],
      [file('src/a.ts', { sizeBytes: 240, lines: 9, imports: ['node:fs', 'node:path'], exports: [], modifiedAt: '2026-08-08 11:00:00' })],
      '2026-08-08 09:00:00',
    )
    const changed = one(report.changed, 'changed file')
    expect(changed.path).toBe('src/a.ts')
    expect(changed.what).toContain('100 -> 240 bytes')
    expect(changed.what).toContain('5 -> 9 lines')
    expect(changed.what).toContain('imports added: node:path')
    expect(changed.what).toContain('exports gone: a')
  })

  it('treats a rename as one file gone and one arrived, which is what a scan can honestly see', () => {
    const report = idx.reindexReport([file('src/old.ts')], [file('src/new.ts')], '2026-08-08 09:00:00')
    expect(report.added).toEqual(['src/new.ts'])
    expect(report.removed).toEqual(['src/old.ts'])
    expect(report.changed).toEqual([])
  })
})

// ============================================================================ discoverability

describe('the endpoints', () => {
  it('are all described, so GET /api can say what each one is for', () => {
    const registered = listRoutes().map((route) => `${route.method} ${route.path}`).sort()
    expect(registered).toEqual(['GET /api/source', 'GET /api/source/coverage', 'GET /api/source/where', 'POST /api/source/reindex'])
    // ROUTE_NOTES in api/kinds.ts is what GET /api reads, and that file belongs to another agent
    // this phase. These are the lines to paste into it; pinning them here is what stops them
    // rotting while they wait.
    expect(Object.keys(source.SOURCE_ROUTE_NOTES).sort()).toEqual(registered)
    for (const [route, note] of Object.entries(source.SOURCE_ROUTE_NOTES)) {
      expect(note.length, route).toBeGreaterThan(60)
    }
  })
})

// ============================================================ the claim field on the module kind

describe('the claim field, after window B took it off the kind', () => {
  /**
   * IT USED TO BE DECLARED, AND EVERY CASE HERE ASSERTED THAT. Window B emptied `data.claims` into
   * `implementation_map` and deleted the declaration in the same commit — one commit, because
   * `records.ts` validates the MERGED record and a record still holding the key after the
   * declaration went could not be patched at all.
   *
   * What is asserted now is the other side of the same fact: the door refuses the key and sends the
   * author to the implementation map, and `claimsOf` reads the map, so the door and the reader agree
   * about where a module's code is written.
   */
  it('is no longer declared on the module kind, and the whole-record example holds none', () => {
    expect(KIND_SPECS.module.fields.find((field) => field.key === 'claims')).toBeUndefined()
    expect((KIND_SPECS.module.example as Record<string, unknown>)['claims']).toBeUndefined()
    // AND THE EXAMPLE THE SCHEMA HANDS OUT IS STILL COPYABLE, which is what the case this replaces
    // was really protecting: an agent that copies `GET /api/kinds/module` is answered 201.
    expect(validateData('module', KIND_SPECS.module.example).ok).toBe(true)
  })

  it('refuses a list of paths, and says where the answer lives instead', () => {
    const refused = validateData('module', {
      context: 'x'.repeat(30),
      parts: [],
      claims: ['src/web/**', 'src/shared/types.ts'],
    })
    expect(refused.ok).toBe(false)
    const said = refused.ok ? '' : refused.errors.map((e) => e.message).join('\n')
    expect(said).toContain('POST /api/implementation')
    expect(said).toContain('GET /api/implementation/record/')
  })

  it('reads the implementation map, and not the key the door no longer takes', async () => {
    // NOT A RESTATEMENT OF THE CASES ABOVE. The door is shut, and the reader follows it to the map;
    // a reader left on the old key would answer "nobody has claimed anything" for every module
    // whose code was stated through POST /api/implementation, which is every module there is.
    const mod = db.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title: 'A module written before window B',
      data: { context: 'It holds the key the door no longer takes.', parts: [] },
      actor: db.api.HUMAN,
    })
    db.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.claims', json(?)) WHERE id = ?")
      .run(JSON.stringify(['src/shared/kinds.ts']), mod.id)
    withClaims(mod.id, ['src/server/api/source.ts'])
    const { status, body } = await get(`/api/source?module=${mod.id}`)
    expect(status).toBe(200)
    expect((body['claims'] as ResolvedClaim[]).map((c) => c.pattern)).toEqual(['src/server/api/source.ts'])
  })
})
