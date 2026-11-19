// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SOURCE DOOR COUNTS A MODULE'S CLAIMS IN EACH REPOSITORY, BY NAME. Problem ZXD3MbidIya1; decision
 * 0KSoGUNDF9ml, as it was settled on 6 October 2026 (messages VNOIBKwRSVlk and ZDUbogzJDKYC).
 *
 * GET /api/source?module=<id> counted none of a module's claims in a project with two repositories,
 * because the workspace scan does not record which repository it is of. Now each registered
 * repository's scan is stored in its own slot, and each stated row is counted against the scan of
 * the repository the row names. Every case runs in a test office with two scratch repositories of its
 * own, on a scratch database; nothing here reaches the live office.
 *
 *   1. POST /api/source/reindex scans every registered repository with a checkout into its own slot,
 *      and says of one with no checkout that it was not scanned. Mutation (i): reindex scans no
 *      repository.
 *   2. Each row is counted against its own repository's scan, and every count names its repository.
 *      A file present in both trees but stated only in one is counted only there. Mutation (ii): every
 *      pattern the module states, in any repository, matched in each scanned repository.
 *   3. A path stated in both repositories is counted in each, and the answer says so. Mutation (iii):
 *      `inMoreThanOne` left empty.
 *   4. A row whose repository has no stored scan is named as not counted, with how to scan it, and the
 *      other repository is still counted. Mutation (iv): an unscanned repository's patterns matched
 *      against no files and not named as not counted.
 *   5. With only the workspace scan stored, which records no repository, the door refuses in words that
 *      say how to scan again, and does not count against it. Mutation (v): the refusal removed; the door
 *      then fails with a 500 instead.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ClaimsInOneRepository, ResolvedClaim } from '../src/shared/types.ts'

const asPerson = (workspace: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': workspace,
})

let t: TestDb
let app: FastifyInstance
/** This case's own project, so its counts see only the repositories it registered. */
let workspace = 'default'
let caseNumber = 0
/** The two scratch checkouts. `server` is also the tree the workspace scan walks. */
let server: string
let firmware: string
const rootBefore = process.env.MOLE_OFFICE_REPO_ROOT

function aTree(prefix: string, files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

beforeAll(async () => {
  t = await freshDb()
  server = aTree('mole-office-door-server-', {
    'src/server-only.ts': 'export const s = 1\n',
    'src/shared.ts': 'export const shared = 1\n',
  })
  firmware = aTree('mole-office-door-firmware-', {
    'lib/firmware-only.ts': 'export const f = 1\n',
    'src/shared.ts': 'export const shared = 2\n',
  })
  // The workspace scan walks MOLE_OFFICE_REPO_ROOT, so it is the scratch tree and nothing else.
  process.env.MOLE_OFFICE_REPO_ROOT = server
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(async () => {
  caseNumber += 1
  workspace = `source-door-case-${String(caseNumber)}`
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'Source door' } })
  expect(made.statusCode, made.body).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
  if (rootBefore === undefined) delete process.env.MOLE_OFFICE_REPO_ROOT
  else process.env.MOLE_OFFICE_REPO_ROOT = rootBefore
  rmSync(server, { recursive: true, force: true })
  rmSync(firmware, { recursive: true, force: true })
})

async function send(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) {
  const res = await app.inject({ method, url, headers: asPerson(workspace), ...(payload === undefined ? {} : { payload }) })
  return { status: res.statusCode, body: res.json() as Record<string, unknown>, text: res.body }
}

async function aModule(title: string): Promise<string> {
  const res = await send('POST', '/api/records', { kind: 'module', title, data: {} })
  expect(res.status, res.text.slice(0, 300)).toBe(201)
  return (res.body.record as { id: string }).id
}

async function aRepository(name: string, root: string | null): Promise<string> {
  const res = await send('POST', '/api/implementation/repositories', { name, ...(root === null ? {} : { root }) })
  expect(res.status, res.text.slice(0, 300)).toBe(201)
  return (res.body.repository as { id: string }).id
}

async function state(recordId: string, repositoryId: string, pattern: string): Promise<void> {
  const res = await send('POST', '/api/implementation', { recordId, repositoryId, pattern, relation: 'implements' })
  expect(res.status, res.text.slice(0, 300)).toBe(201)
}

async function reindex() {
  const res = await send('POST', '/api/source/reindex')
  expect(res.status, res.text.slice(0, 300)).toBe(200)
  return res.body
}

async function door(moduleId: string) {
  return send('GET', `/api/source?module=${moduleId}`)
}

/** Each listed file as "repository:path", which is what a count by repository has to keep apart. */
function filesOf(body: Record<string, unknown>): string[] {
  return (body.files as { path: string; repository?: { name: string } }[]).map((f) => `${f.repository?.name}:${f.path}`)
}

describe('the source door counts a module’s claims in each repository by name', () => {
  it('reindex scans every registered repository with a checkout into its own slot (i)', async () => {
    await aRepository('server', server)
    await aRepository('firmware', firmware)
    await aRepository('on-another-machine', null)

    const body = await reindex()
    const said = (body.repositories as { repository: { name: string }; scanned: boolean; fileCount?: number; because?: string }[])
      .map((r) => ({ name: r.repository.name, scanned: r.scanned, fileCount: r.fileCount, because: r.because }))
    expect(said).toEqual([
      { name: 'firmware', scanned: true, fileCount: 2, because: undefined },
      {
        name: 'on-another-machine',
        scanned: false,
        fileCount: undefined,
        because: '"on-another-machine" has no checkout on this machine, so there is nothing to scan.',
      },
      { name: 'server', scanned: true, fileCount: 2, because: undefined },
    ])
    const repositories = await send('GET', '/api/implementation/repositories')
    const indexed = (repositories.body.repositories as { name: string; indexed: boolean }[]).map((r) => [r.name, r.indexed])
    expect(indexed).toEqual([
      ['firmware', true],
      ['on-another-machine', false],
      ['server', true],
    ])
  })

  it('counts each row against its own repository’s scan and names the repository (ii)', async () => {
    const moduleId = await aModule('Code in two checkouts')
    const serverId = await aRepository('server', server)
    const firmwareId = await aRepository('firmware', firmware)
    await state(moduleId, serverId, 'src')
    await state(moduleId, firmwareId, 'lib')
    await reindex()

    const res = await door(moduleId)
    expect(res.status, res.text.slice(0, 400)).toBe(200)
    // src/shared.ts is in both trees, and only the server's row states src, so it is counted only there.
    expect(filesOf(res.body)).toEqual(['firmware:lib/firmware-only.ts', 'server:src/server-only.ts', 'server:src/shared.ts'])
    expect((res.body.claims as ResolvedClaim[]).map((c) => `${c.repository?.name}:${c.pattern}`)).toEqual([
      'firmware:lib',
      'server:src',
    ])
    const counts = (res.body.repositories as ClaimsInOneRepository[]).map((r) => ({
      name: r.repository.name,
      files: r.files,
      scanned: r.scan !== null,
      notCounted: r.notCounted,
    }))
    expect(counts).toEqual([
      { name: 'firmware', files: ['lib/firmware-only.ts'], scanned: true, notCounted: null },
      { name: 'server', files: ['src/server-only.ts', 'src/shared.ts'], scanned: true, notCounted: null },
    ])
    expect(res.body.problem).toBeNull()
    expect(res.body.staleClaims).toEqual([])
  })

  it('counts a path stated in both repositories in each, and says so (iii)', async () => {
    const moduleId = await aModule('The shared file')
    const serverId = await aRepository('server', server)
    const firmwareId = await aRepository('firmware', firmware)
    await state(moduleId, serverId, 'src/shared.ts')
    await state(moduleId, firmwareId, 'src/shared.ts')
    await reindex()

    const res = await door(moduleId)
    expect(res.status, res.text.slice(0, 400)).toBe(200)
    expect(filesOf(res.body)).toEqual(['firmware:src/shared.ts', 'server:src/shared.ts'])
    const both = res.body.inMoreThanOne as { paths: { path: string; repositories: { name: string }[] }[]; note: string }
    expect(both.paths.map((p) => [p.path, p.repositories.map((r) => r.name)])).toEqual([['src/shared.ts', ['firmware', 'server']]])
    expect(both.note).toBe(
      '1 path is claimed by this module in more than one repository, because a row in each of them states it, and ' +
        'each is counted once in every repository that states it. `files` lists each of them once per repository.',
    )
  })

  it('names a repository with no stored scan as not counted, and counts the other (iv)', async () => {
    const moduleId = await aModule('Half scanned')
    const serverId = await aRepository('server', server)
    await state(moduleId, serverId, 'src/server-only.ts')
    await reindex()
    // Registered after the scan, so its slot is empty.
    const firmwareId = await aRepository('firmware', firmware)
    await state(moduleId, firmwareId, 'lib')

    const res = await door(moduleId)
    expect(res.status, res.text.slice(0, 400)).toBe(200)
    expect(filesOf(res.body)).toEqual(['server:src/server-only.ts'])
    const firmwareEntry = (res.body.repositories as ClaimsInOneRepository[]).find((r) => r.repository.name === 'firmware')
    expect(firmwareEntry?.scan).toBeNull()
    expect(firmwareEntry?.claims).toEqual([])
    expect(firmwareEntry?.notCounted).toBe(
      'No scan of the repository "firmware" is stored. The 1 pattern stated in it is not counted. POST ' +
        '/api/source/reindex scans every registered repository that has a checkout on this machine into its own ' +
        'slot, and POST /api/implementation/rebuild does the same for one or all of them.',
    )
    // Not counted is not stale: nobody has looked for lib in firmware.
    expect(res.body.staleClaims).toEqual([])
    expect(res.body.problem).toBeNull()
  })

  it('refuses when only the workspace scan is stored, which records no repository (v)', async () => {
    await reindex()
    const moduleId = await aModule('Before the repositories')
    const serverId = await aRepository('server', server)
    const firmwareId = await aRepository('firmware', firmware)
    await state(moduleId, serverId, 'src')
    await state(moduleId, firmwareId, 'lib')

    const res = await door(moduleId)
    expect(res.status, res.text.slice(0, 400)).toBe(409)
    const error = (res.body as { error: string }).error
    expect(error).toMatch(
      /^This project has 2 registered repositories \("firmware", "server"\), and no scan of any of them is stored, so a module's claims cannot be counted\. The one scan stored here, of .+ on .+, does not record which repository it is of, so it is not counted\. Scan again with POST \/api\/source\/reindex, which scans every registered repository that has a checkout on this machine into its own slot\.$/,
    )
    expect(error).toContain(server)

    // And scanning again is what lets it count.
    await reindex()
    const again = await door(moduleId)
    expect(again.status, again.text.slice(0, 400)).toBe(200)
    expect(filesOf(again.body)).toEqual(['firmware:lib/firmware-only.ts', 'server:src/server-only.ts', 'server:src/shared.ts'])
  })
})
