// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOOR THAT ANSWERS THE DIRECTORIES A PREVIEW MAY READ, FOR ONE PROJECT.
 *
 * Criterion U4 as rewritten on 8 September 2026: the directories a preview may read are derived per
 * project and the Settings page shows the list with where each entry came from. Until this route
 * there was no door that answered that list, so the page could not draw it.
 *
 * ---------------------------------------------------------------------------------------
 * IT ANSWERS THE SAME DERIVATION THE PREVIEW CHECKS
 * ---------------------------------------------------------------------------------------
 *
 * The route calls `previewRoots(workspaceId)` from src/server/api/files.ts, the one function the
 * refusal and the message-picture upload also call. So this file can assert the SHAPE and the
 * PROVENANCE of the answer, and tests/file-preview.test.ts asserts the fence the answer describes.
 *
 * MUTATION: change the route to answer from anything but `previewRoots(workspaceId)` — a hard-coded
 * list, or a call with no workspace — and the repository entry and the per-project entry below are
 * red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
// TYPE ONLY, so naming it here opens no database. The route module itself is imported after
// `freshDb()` sets MOLE_OFFICE_DB, the way tests/helpers.ts requires.
import type { PreviewRootsReply } from '../src/server/api/preview-roots.ts'
import { trackApiRoutes } from '../src/server/api/kinds.ts'

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let app: FastifyInstance
let repoRoot: string
let notes: string
let otherWorkspace: string

beforeAll(async () => {
  t = await freshDb()
  const repos = await import('../src/server/lib/repositories.ts')
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  const http = await import('../src/server/lib/http.ts')
  const { previewRootRoutes } = await import('../src/server/api/preview-roots.ts')

  otherWorkspace = 'preview-door-other'
  createWorkspace({ id: otherWorkspace, title: 'Preview door, another project' })
  repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-preview-door-')))
  const docs = join(repoRoot, 'docs')
  mkdirSync(docs)
  notes = join(repoRoot, 'notes')
  mkdirSync(notes)
  writeFileSync(join(repoRoot, 'readme.md'), '# A repository\n')

  repos.registerRepository({ workspaceId: 'default', name: 'preview-door-repo', root: repoRoot, actor: HUMAN })
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'A worker whose area names the repository docs folder',
    data: { handle: 'preview-door-worker', workArea: ['docs'] },
    actor: HUMAN,
  })

  app = Fastify({ logger: false })
  trackApiRoutes(app)
  http.installErrorHandling(app)
  await app.register(previewRootRoutes, { prefix: '/api' })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  rmSync(repoRoot, { recursive: true, force: true })
  t.close()
})

async function read(workspaceId: string): Promise<PreviewRootsReply> {
  const res = await app.inject({ method: 'GET', url: '/api/preview-roots', headers: { 'x-mole-office-workspace': workspaceId } })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as PreviewRootsReply
}

describe('the preview-roots door', () => {
  it('answers the roots in force for the project named, each with where it came from', async () => {
    const reply = await read('default')
    expect(reply.workspaceId).toBe('default')
    expect(reply.roots.length).toBeGreaterThan(0)
    for (const root of reply.roots) {
      expect(typeof root.path, `no path on an entry: ${JSON.stringify(root)}`).toBe('string')
      expect(typeof root.canonical, `no canonical path on an entry: ${JSON.stringify(root)}`).toBe('string')
      expect(root.source.kind, `no source on ${root.path}`).toBeTruthy()
    }
    const withSource = (kind: string): string[] =>
      reply.roots.filter((root) => root.source.kind === kind).map((root) => root.path)
    expect(withSource('repository')).toContain(repoRoot)
    expect(withSource('workarea')).toContain(join(repoRoot, 'docs'))
    expect(withSource('checkout').length).toBeGreaterThan(0)
    expect(reply.says).toMatch(/director/i)
  })

  it('answers for one project only: a repository registered here is absent from another project', async () => {
    const other = await read(otherWorkspace)
    expect(other.workspaceId).toBe(otherWorkspace)
    expect(other.roots.map((root) => root.path)).not.toContain(repoRoot)
    expect(other.roots.some((root) => root.source.kind === 'repository')).toBe(false)
  })

  it('refuses a project that does not exist rather than answering about another one', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/preview-roots', headers: { 'x-mole-office-workspace': 'no-such-project' } })
    expect(res.statusCode).toBe(404)
  })
})

// ============================================================ the press that adds one by hand

const PRESS_HEADERS = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'content-type': 'application/json',
}

describe('the press that adds a directory by hand', () => {
  it('records the directory with who and when, and it round-trips into the derived list', async () => {
    // NOBODY HAS ADDED ONE YET, and that is a different fact from "the list is empty".
    expect((await read('default')).added.chosen).toBe(false)

    const res = await app.inject({
      method: 'POST',
      url: '/api/preview-roots',
      headers: PRESS_HEADERS,
      payload: { path: notes, why: 'the odd folder this project reads' },
    })
    expect(res.statusCode, res.body).toBe(200)
    const added = (res.json() as PreviewRootsReply).added
    expect(added.chosen).toBe(true)
    const entry = added.additions.find((one) => one.path === notes)
    expect(entry, `no addition for ${notes}: ${JSON.stringify(added)}`).toBeTruthy()
    // MUTATION: take the insert out of `addPreviewRoot` and the three lines below are red.
    expect(entry?.addedBy).toBe(`human:${THE_TEST_OFFICES_OWNER.id}`)
    expect(entry?.addedAt).toBeTruthy()
    expect(entry?.why).toBe('the odd folder this project reads')

    // ROUND-TRIP: a fresh read sees it, and the derived list carries it with its source.
    const after = await read('default')
    expect(after.added.additions.map((one) => one.path)).toContain(notes)
    const root = after.roots.find((one) => one.path === notes)
    expect(root?.source.kind).toBe('added')
    // ADDED BESIDE THE REPOSITORY ROOT, NEVER IN PLACE OF IT.
    expect(after.roots.map((one) => one.path)).toContain(repoRoot)
  })

  it('refuses a path that is not a directory on this machine, and writes nothing', async () => {
    const before = (await read('default')).added.additions.length
    const res = await app.inject({
      method: 'POST',
      url: '/api/preview-roots',
      headers: PRESS_HEADERS,
      payload: { path: join(repoRoot, 'no-such-directory'), why: 'because' },
    })
    expect(res.statusCode).toBe(400)
    expect(String((res.json() as { error?: unknown }).error)).toContain('not a directory')
    expect((await read('default')).added.additions.length).toBe(before)
  })
})
