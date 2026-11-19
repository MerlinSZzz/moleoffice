// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SOURCE LOOKUP ANSWERS IN MILLISECONDS, AND A RUN OF THEM DOES NOT HOLD THE SERVER.
 *
 * GET /api/source/where used to resolve every module's claims against every registered repository's
 * stored scan on every call. On the live index's shape — two repository scans (4,249 files and 3)
 * and 182 module records — that measured about 1.05 s a call, almost all of it `coverage()`.
 *
 * This file builds that shape on a made-up office: a fresh database, a throwaway tree, the two
 * repository scans, and the modules and stated rows. It then proves the door still answers exactly
 * what the uncached lookup answers, that a warm lookup and a run of them answer inside the bound
 * below, that a second request is not held behind a lookup, and that a changed scan or claim is
 * seen by the next lookup.
 *
 * THE BOUND IS MACHINE-DEPENDENT, SO IT IS GENEROUS AND IT IS PAIRED WITH A RATIO. The measured
 * warm lookup was about 5 ms on this machine against about 1.0 s cold. The bound is 50 ms, ten
 * times the measured warm cost, and the first lookup must be at least ten times the warm one. The
 * ratio is what the feature promises; the bound alone would pass on a day when both happened to be
 * small.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

/** The bound a warm lookup and every lookup of a run must answer inside. */
const BOUND_MS = 50
/** The live index's shape: 4,249 files in the large repository and 3 in the small one. */
const LARGE_FILES = 4_249
/** The live index's shape: 182 module records in all. */
const MODULE_COUNT = 182
/** How many of those modules claim a directory of the large repository. The other three are below. */
const DIRECTORY_MODULES = MODULE_COUNT - 3

let db: TestDb
let app: FastifyInstance
let tree: string
let smallTree: string
let largeRepositoryId: string
let claimedLater: { id: string }

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

async function where(name: string): Promise<{ status: number; body: Record<string, any>; ms: number }> {
  const url = `/api/source/where?name=${encodeURIComponent(name)}`
  const started = performance.now()
  const res = await app.inject({ method: 'GET', url })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, any>, ms: performance.now() - started }
}

/** The answer without the two index-age fields, which are worked out on every call and must differ. */
function withoutAge(body: Record<string, any>): Record<string, any> {
  const { ageSeconds: _ageSeconds, age: _age, ...index } = body.index
  return { ...body, index }
}

beforeAll(async () => {
  db = await freshDb()
  const source = await import('../src/server/api/source.ts')
  const http = await import('../src/server/lib/http.ts')
  const map = await import('../src/server/lib/implementation.ts')
  const repos = await import('../src/server/lib/repositories.ts')

  tree = mkdtempSync(join(tmpdir(), 'source-lookup-fast-'))
  smallTree = mkdtempSync(join(tmpdir(), 'source-lookup-small-'))
  const workspaceId = 'default'
  const actor = db.api.HUMAN

  // The two files the named case answers about, then filler files spread over the directory
  // modules' claims. The scan therefore holds the live index's 4,249 files.
  write(join(tree, 'src/alpha/finder.ts'), "export function findTheThing(): string {\n  return 'found'\n}\n")
  write(join(tree, 'src/alpha/index.ts'), 'export const alphaIndex = 0\n')
  for (let i = 0; i < LARGE_FILES - 2; i++) {
    const directory = `src/d${String(i % DIRECTORY_MODULES).padStart(3, '0')}`
    write(join(tree, directory, `file${String(i).padStart(4, '0')}.ts`), `export const value${String(i)} = ${String(i)}\n`)
  }
  for (let i = 0; i < 3; i++) write(join(smallTree, `small${String(i)}.ts`), `export const small${String(i)} = ${String(i)}\n`)

  largeRepositoryId = repos.registerRepository({ workspaceId, name: 'large', root: tree, actor }).id
  const smallRepositoryId = repos.registerRepository({ workspaceId, name: 'small', root: smallTree, actor }).id
  map.rebuildRepository({ workspaceId, repositoryId: largeRepositoryId, actor })
  map.rebuildRepository({ workspaceId, repositoryId: smallRepositoryId, actor })

  function aModule(title: string, claims: string[]): { id: string } {
    const record = db.api.createRecord({
      workspaceId,
      kind: 'module',
      title,
      data: { context: `A made-up module called ${title}.`, parts: [] },
      actor,
    })
    for (const pattern of claims) {
      map.declareRelationship({ workspaceId, recordId: record.id, repositoryId: largeRepositoryId, pattern, actor })
    }
    return record
  }

  // Every directory module has a claim, so the uncached coverage path resolves 182 modules against
  // the 4,249-file scan on every call, exactly as the live index did.
  for (let i = 0; i < DIRECTORY_MODULES; i++) {
    aModule(`Directory module ${String(i)}`, [`src/d${String(i).padStart(3, '0')}/**`])
  }
  aModule('Finding things', ['src/alpha/**', 'src/gone/finder.ts'])
  aModule('Moved away', ['src/old/place.ts'])
  claimedLater = aModule('Claimed later', ['src/nowhere.ts'])
  const small = db.api.createRecord({
    workspaceId,
    kind: 'module',
    title: 'Small things',
    data: { context: 'A made-up module for the small repository.', parts: [] },
    actor,
  })
  map.declareRelationship({ workspaceId, recordId: small.id, repositoryId: smallRepositoryId, pattern: 'small0.ts', actor })

  app = Fastify()
  http.installErrorHandling(app)
  // A second request the test can put beside a lookup. It is not a product route; it is the
  // canary for whether a lookup is holding the server's thread.
  app.get('/api/health', async () => ({ ok: true }))
  await app.register(source.sourceRoutes, { prefix: '/api' })
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  db.close()
  rmSync(tree, { recursive: true, force: true })
  rmSync(smallTree, { recursive: true, force: true })
}, 60_000)

describe('a warm source lookup', () => {
  it('answers the same as the uncached lookup, inside the bound, and at least ten times cheaper than the first', async () => {
    const first = await where('findTheThing')
    const second = await where('findTheThing')

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(first.body.answered).toBe(true)
    expect(first.body.files.map((file: any) => file.path)).toContain('src/alpha/finder.ts')
    expect(withoutAge(second.body)).toEqual(withoutAge(first.body))
    // And the answer is the original uncached lookup's own, field for field. The cache stores the
    // derived data, not the response, so this compares the answer the door shapes now with the one
    // lib/source-lookup.ts still returns.
    const { lookUp } = await import('../src/server/lib/source-lookup.ts')
    const { index: _index, ...answer } = first.body
    expect(answer).toEqual(lookUp('default', 'findTheThing', 20))
    expect(second.ms).toBeLessThan(BOUND_MS)
    expect(first.ms).toBeGreaterThanOrEqual(second.ms * 10)
  }, 30_000)

  it('stays inside the bound for a run of different names, not seconds for each', async () => {
    const names = ['findTheThing', 'finder.ts', 'alpha/finder.ts', 'Finding things', 'index', 'nothingCalledThis', 'Moved away', 'small0']
    const times: number[] = []
    for (const name of names) {
      const one = await where(name)
      expect(one.status).toBe(200)
      times.push(one.ms)
    }
    expect(Math.max(...times)).toBeLessThan(BOUND_MS)
  }, 30_000)

  it('does not hold a second request behind a lookup', async () => {
    const lookup = app.inject({ method: 'GET', url: '/api/source/where?name=findTheThing' })
    const started = performance.now()
    const health = app.inject({ method: 'GET', url: '/api/health' })
    const [, healthAnswer] = await Promise.all([lookup, health])
    const healthMs = performance.now() - started
    expect(healthAnswer.statusCode).toBe(200)
    expect(healthMs).toBeLessThan(BOUND_MS)
  }, 30_000)
})

describe('a changed derived or canonical layer', () => {
  it('is seen by the next lookup after a repository scan is rebuilt', async () => {
    const before = await where('addedThing')
    expect(before.body.answered).toBe(false)

    write(join(tree, 'src/later/added.ts'), 'export const addedThing = 1\n')
    await (await import('../src/server/lib/implementation.ts')).rebuildRepository({
      workspaceId: 'default',
      repositoryId: largeRepositoryId,
      actor: db.api.HUMAN,
    })

    const after = await where('addedThing')
    expect(after.body.answered).toBe(true)
    expect(after.body.files.map((file: any) => file.path)).toContain('src/later/added.ts')
  }, 30_000)

  it('is seen by the next lookup after a module claim is written', async () => {
    const before = await where('Claimed later')
    expect(before.body.modules[0].files).toEqual([])

    await (await import('../src/server/lib/implementation.ts')).declareRelationship({
      workspaceId: 'default',
      recordId: claimedLater.id,
      repositoryId: largeRepositoryId,
      pattern: 'src/later/added.ts',
      actor: db.api.HUMAN,
    })

    const after = await where('Claimed later')
    expect(after.body.modules[0].files.map((file: any) => file.path)).toContain('src/later/added.ts')
    expect(after.body.modules[0].staleClaims.map((claim: any) => claim.pattern)).toEqual(['src/nowhere.ts'])
  }, 30_000)
})
