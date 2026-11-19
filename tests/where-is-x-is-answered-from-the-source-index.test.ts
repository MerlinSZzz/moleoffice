// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * "WHERE IS X" IS ANSWERED FROM THE SOURCE INDEX: GET /api/source/where?name=X.
 *
 * The door answers a name from the module records and the stored scan of their repository, before
 * anybody searches the repository. A file matches when the scan lists the name among its exports,
 * when its file name is the name with or without its extension, or, for a name holding a slash,
 * when its path ends in the name on whole segments. A module matches by its title, ignoring case, or
 * its id. A claim that matches nothing in the scan is stale: it is listed as stale and never given as
 * a place where the name is.
 *
 * Everything here runs against a made-up office: a fresh database and a throwaway tree, registered
 * as the project's one repository and scanned, with modules and claims filed in it.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { trackApiRoutes } from '../src/server/api/kinds.ts'

let db: TestDb
let app: FastifyInstance
let tree: string
let finding: { id: string }
let movedAway: { id: string }

const FILES: Record<string, string> = {
  'src/alpha/finder.ts': "// The made-up module's one file.\n\nexport function findTheThing(): string {\n  return 'found'\n}\n",
  'src/alpha/index.ts': 'export const alphaIndex = 0\n',
  'src/beta/helper.ts': 'export const helperValue = 1\n',
  'src/beta/index.ts': 'export const betaIndex = 2\n',
  'src/gamma/index.ts': 'export const gammaIndex = 3\n',
}

async function where(query: string): Promise<{ status: number; body: Record<string, any> }> {
  const res = await app.inject({ method: 'GET', url: `/api/source/where?${query}` })
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, any> }
}

beforeAll(async () => {
  db = await freshDb()
  const source = await import('../src/server/api/source.ts')
  const http = await import('../src/server/lib/http.ts')
  const map = await import('../src/server/lib/implementation.ts')
  const repos = await import('../src/server/lib/repositories.ts')

  tree = mkdtempSync(join(tmpdir(), 'where-is-x-'))
  for (const [path, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(tree, path)), { recursive: true })
    writeFileSync(join(tree, path), text)
  }
  const repositoryId = repos.registerRepository({ workspaceId: 'default', name: 'made-up', root: tree, actor: db.api.HUMAN }).id
  map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: db.api.HUMAN })

  const aModule = (title: string, claims: string[]): { id: string } => {
    const record = db.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title,
      data: { context: `A made-up module called ${title}.`, parts: [] },
      actor: db.api.HUMAN,
    })
    for (const pattern of claims) {
      map.declareRelationship({ workspaceId: 'default', recordId: record.id, repositoryId, pattern, actor: db.api.HUMAN })
    }
    return record
  }
  finding = aModule('Finding things', ['src/alpha/**', 'src/gone/finder.ts'])
  movedAway = aModule('Moved away', ['src/old/place.ts'])

  app = Fastify()
  trackApiRoutes(app)
  http.installErrorHandling(app)
  await app.register(source.sourceRoutes, { prefix: '/api' })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  db.close()
  rmSync(tree, { recursive: true, force: true })
})

// ---- criterion 1: a name the index knows is answered without a search

describe('a name the source index knows', () => {
  it('is answered with the file that exports it, its repository and the module that claims it', async () => {
    const { status, body } = await where('name=findTheThing')
    expect(status).toBe(200)
    expect(body.answered).toBe(true)
    expect(body.noAnswer).toBeNull()
    expect(body.files).toEqual([
      {
        path: 'src/alpha/finder.ts',
        repository: { id: expect.any(String), name: 'made-up' },
        matchedBy: ['export'],
        modules: [{ id: finding.id, title: 'Finding things', pattern: 'src/alpha/**' }],
      },
    ])
    expect(body.left).toBe(0)
    expect(typeof body.index.builtAt).toBe('string')
  })

  it('matches a file name with or without its extension, and a path end only on whole segments', async () => {
    expect((await where('name=helper')).body.files.map((f: any) => [f.path, f.matchedBy])).toEqual([['src/beta/helper.ts', ['file name']]])
    expect((await where('name=finder.ts')).body.files.map((f: any) => [f.path, f.matchedBy])).toEqual([['src/alpha/finder.ts', ['file name']]])
    expect((await where('name=alpha/finder.ts')).body.files.map((f: any) => [f.path, f.matchedBy])).toEqual([['src/alpha/finder.ts', ['path end']]])
    // "pha/finder.ts" ends the path but not on a whole segment, so it names nothing.
    expect((await where('name=pha/finder.ts')).body.answered).toBe(false)
  })

  it('answers a module by its title, ignoring case, with the files its claims match now', async () => {
    const { body } = await where(`name=${encodeURIComponent('FINDING THINGS')}`)
    expect(body.answered).toBe(true)
    expect(body.modules).toHaveLength(1)
    expect(body.modules[0].id).toBe(finding.id)
    expect(body.modules[0].files.map((f: any) => f.path)).toEqual(['src/alpha/finder.ts', 'src/alpha/index.ts'])
    expect((await where(`name=${finding.id}`)).body.modules.map((m: any) => m.id)).toEqual([finding.id])
  })

  it('lists at most the limit, and counts the files it left out', async () => {
    const { body } = await where('name=index&limit=2')
    expect(body.files).toHaveLength(2)
    expect(body.left).toBe(1)
  })

  it('names each file a limit left out, by its repository and path, in the shared declaration of what was left out', async () => {
    const { body } = await where('name=index&limit=2')
    expect(body.subtraction).toEqual({ candidates: 3, carried: 2, leftOut: 1, shortened: 0 })
    expect(body.leftOutGroups).toEqual([{ cause: 'budget', bucket: 'row_limit', count: 1, ids: ['made-up:src/gamma/index.ts'] }])

    const one = (await where(`name=${encodeURIComponent('Finding things')}&limit=1`)).body.modules[0]
    expect(one.files.map((f: any) => f.path)).toEqual(['src/alpha/finder.ts'])
    expect(one.filesLeft).toBe(1)
    expect(one.subtraction).toEqual({ candidates: 2, carried: 1, leftOut: 1, shortened: 0 })
    expect(one.leftOutGroups).toEqual([{ cause: 'budget', bucket: 'row_limit', count: 1, ids: ['made-up:src/alpha/index.ts'] }])

    const whole = (await where('name=findTheThing')).body
    expect(whole.subtraction).toEqual({ candidates: 1, carried: 1, leftOut: 0, shortened: 0 })
    expect(whole.leftOutGroups.flatMap((group: any) => group.ids)).toEqual([])
  })

  it('refuses a request that names nothing', async () => {
    expect((await where('name=')).status).toBe(400)
    expect((await where('limit=3')).status).toBe(400)
  })
})

// ---- criterion 2: a name the index does not know is said, and not answered

describe('a name the source index does not know', () => {
  it('is answered false, with a sentence saying the index has no entry for it', async () => {
    const { status, body } = await where('name=nothingCalledThis')
    expect(status).toBe(200)
    expect(body.answered).toBe(false)
    expect(body.files).toEqual([])
    expect(body.modules).toEqual([])
    expect(body.noAnswer).toContain('no entry for "nothingCalledThis"')
  })
})

// ---- criterion 3: a stale entry is said, never answered as current

describe('a claim that matches nothing in the scan', () => {
  it('is listed as stale beside the files a module claims now, and never as one of them', async () => {
    const { body } = await where(`name=${encodeURIComponent('Finding things')}`)
    expect(body.modules[0].staleClaims).toEqual([{ pattern: 'src/gone/finder.ts', repository: { id: expect.any(String), name: 'made-up' } }])
    expect(body.modules[0].files.map((f: any) => f.path)).not.toContain('src/gone/finder.ts')
  })

  it('leaves a module with only stale claims unanswered, and says why', async () => {
    const { body } = await where(`name=${encodeURIComponent('Moved away')}`)
    expect(body.answered).toBe(false)
    expect(body.files).toEqual([])
    expect(body.modules.map((m: any) => [m.id, m.files])).toEqual([[movedAway.id, []]])
    expect(body.modules[0].staleClaims.map((c: any) => c.pattern)).toEqual(['src/old/place.ts'])
    expect(body.noAnswer).toContain('"Moved away"')
    expect(body.noAnswer).toContain('matches no file')
  })
})
