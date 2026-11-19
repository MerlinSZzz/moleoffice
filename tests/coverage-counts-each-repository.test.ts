// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * COVERAGE, THE UNCLAIMED LIST AND THE WORK DOMAINS COUNT EACH ROW IN ITS OWN REPOSITORY, as the source
 * door does. Problem ZXD3MbidIya1's second half, wave 13s round 23: from round 22 the door counted each
 * stated row against the stored scan of the repository the row names, and coverage still counted against
 * the workspace scan, so the two disagreed about the same module. Every case runs in a test office with
 * two scratch repositories of its own, on a scratch database; nothing here reaches the live office.
 *
 *   1. Coverage counts each repository's files against its own stored scan, and a file is claimed only
 *      by a row in its own repository. Mutation (i): every counted path claimed in every repository.
 *   2. Coverage reads each module as the door does, so the two answer the same files for it. Mutation
 *      (ii): coverage reads the module through `claimsOf`, against the workspace scan.
 *   3. A repository with no stored scan is named as not counted, with how to scan it, and adds nothing to
 *      the sums; a stale claim names its repository. Mutation (iii): a repository with no stored scan
 *      counted as one with no files. Mutation (iv): the repository left off a stale claim.
 *   4. The unclaimed list names each file's repository, and lists a path once for each repository it is
 *      unclaimed in. Mutation (v): the unclaimed list read off the workspace scan, as before.
 *   5. A project with no registered repository is counted against the workspace scan, as before.
 *      Mutation (vi): coverage counted repository by repository whatever the project registers.
 *   6. A work domain's entry in a repository is looked up in that repository's stored scan. Mutation
 *      (vii): every entry looked up in the workspace scan.
 *   7. An entry in a repository with no stored scan, beside a repository that has one, says which
 *      repository has no scan, and does not say the project has no index. Mutation (viii): the input
 *      that names the repository left out, so the sentence for a project with no index is said instead.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { AGENT, apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { CoverageInOneRepository, SourceCoverage } from '../src/shared/types.ts'

/**
 * EACH CASE GETS ITS OWN PROJECT. Repositories, their scans and their claims are per project, and a
 * project per case is what keeps one case's two checkouts out of another case's counts.
 */
let WORKSPACE = 'default'
let caseNumber = 0
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}

let t: TestDb
let app: FastifyInstance
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
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  if (rootBefore === undefined) delete process.env.MOLE_OFFICE_REPO_ROOT
  else process.env.MOLE_OFFICE_REPO_ROOT = rootBefore
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `coverage-case-${String(caseNumber)}`
  HUMAN['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: `Coverage case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
  server = aTree('mole-office-coverage-server-', {
    'src/server-only.ts': 'export const s = 1\n',
    'src/shared.ts': 'export const shared = 1\n',
  })
  firmware = aTree('mole-office-coverage-firmware-', {
    'lib/firmware-only.ts': 'export const f = 1\n',
    'src/shared.ts': 'export const shared = 2\n',
  })
  // The workspace scan walks MOLE_OFFICE_REPO_ROOT, so it is the scratch tree and nothing else.
  process.env.MOLE_OFFICE_REPO_ROOT = server
})

afterEach(() => {
  rmSync(server, { recursive: true, force: true })
  rmSync(firmware, { recursive: true, force: true })
})

async function send(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) {
  const res = await app.inject({ method, url, headers: HUMAN, ...(payload === undefined ? {} : { payload }) })
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

async function reindex(): Promise<void> {
  const res = await send('POST', '/api/source/reindex')
  expect(res.status, res.text.slice(0, 300)).toBe(200)
}

async function coverage(): Promise<SourceCoverage> {
  const res = await send('GET', '/api/source/coverage')
  expect(res.status, res.text.slice(0, 400)).toBe(200)
  return res.body.coverage as SourceCoverage
}

/** Each repository's counts, by name, as a reader compares them. */
function countsOf(entries: CoverageInOneRepository[] | null) {
  return (entries ?? []).map((entry) =>
    entry.scan === null
      ? { name: entry.repository.name, notCounted: entry.notCounted }
      : {
          name: entry.repository.name,
          total: entry.totalFiles,
          claimed: entry.claimedFiles,
          unclaimed: entry.unclaimed,
          percent: entry.percentClaimed,
        },
  )
}

/** The files one module claims, as "repository:path", from coverage. */
function moduleFilesInCoverage(cov: SourceCoverage, moduleId: string): string[] {
  const module = cov.modules.find((m) => m.moduleId === moduleId)
  return (module?.repositories ?? []).flatMap((entry) => entry.files.map((path) => `${entry.repository.name}:${path}`))
}

describe('coverage counts each row in its own repository, as the source door does', () => {
  it('counts each repository against its own scan, and a file only by a row in its own repository (i)', async () => {
    const moduleId = await aModule('Code in two checkouts')
    const serverId = await aRepository('server', server)
    const firmwareId = await aRepository('firmware', firmware)
    await state(moduleId, serverId, 'src')
    await state(moduleId, firmwareId, 'lib')
    await reindex()

    const cov = await coverage()
    // src/shared.ts is in both trees, and only the server's row states src, so firmware's copy is unclaimed.
    expect(countsOf(cov.repositories)).toEqual([
      { name: 'firmware', total: 2, claimed: 1, unclaimed: ['src/shared.ts'], percent: 50 },
      { name: 'server', total: 2, claimed: 2, unclaimed: [], percent: 100 },
    ])
    expect([cov.totalFiles, cov.claimedFiles, cov.unclaimedFiles, cov.percentClaimed]).toEqual([4, 3, 1, 75])
    expect(cov.unclaimed).toEqual(['src/shared.ts'])
    expect(cov.staleClaims).toEqual([])
  })

  it('reads each module as the door does, so both answer the same files for it (ii)', async () => {
    const moduleId = await aModule('The shared file')
    const serverId = await aRepository('server', server)
    const firmwareId = await aRepository('firmware', firmware)
    await state(moduleId, serverId, 'src/shared.ts')
    await state(moduleId, firmwareId, 'src/shared.ts')
    await state(moduleId, firmwareId, 'lib')
    await reindex()

    const door = await send('GET', `/api/source?module=${moduleId}`)
    expect(door.status, door.text.slice(0, 400)).toBe(200)
    const doorFiles = (door.body.files as { path: string; repository?: { name: string } }[]).map(
      (f) => `${f.repository?.name}:${f.path}`,
    )
    const cov = await coverage()
    expect(doorFiles).toEqual(['firmware:lib/firmware-only.ts', 'firmware:src/shared.ts', 'server:src/shared.ts'])
    expect(moduleFilesInCoverage(cov, moduleId)).toEqual(doorFiles)
    const module = cov.modules.find((m) => m.moduleId === moduleId)
    expect(module?.problem).toBeNull()
    const claimsOf = (claims: { pattern: string; matched: string[]; repository?: { name: string } }[] | undefined) =>
      (claims ?? []).map((c) => `${c.repository?.name}:${c.pattern}:${c.matched.length}`)
    expect(claimsOf(module?.claims)).toEqual(claimsOf(door.body.claims as never))
    expect(claimsOf(module?.claims).sort()).toEqual(['firmware:lib:1', 'firmware:src/shared.ts:1', 'server:src/shared.ts:1'])
  })

  it('names a repository with no stored scan as not counted, and a stale claim names its repository (iii, iv)', async () => {
    const moduleId = await aModule('Half scanned')
    const serverId = await aRepository('server', server)
    await state(moduleId, serverId, 'src/server-only.ts')
    await state(moduleId, serverId, 'src/gone.ts')
    await reindex()
    // Registered after the scan, so its slot is empty.
    const firmwareId = await aRepository('firmware', firmware)
    await state(moduleId, firmwareId, 'lib')

    const cov = await coverage()
    expect(countsOf(cov.repositories)).toEqual([
      {
        name: 'firmware',
        notCounted:
          'No scan of the repository "firmware" is stored. Its files are not counted. POST /api/source/reindex ' +
          'scans every registered repository that has a checkout on this machine into its own slot, and POST ' +
          '/api/implementation/rebuild does the same for one or all of them.',
      },
      { name: 'server', total: 2, claimed: 1, unclaimed: ['src/shared.ts'], percent: 50 },
    ])
    // Nothing of firmware's is in the sums: nobody has scanned it.
    expect([cov.totalFiles, cov.claimedFiles, cov.unclaimedFiles]).toEqual([2, 1, 1])
    // lib in firmware has not been looked for, so it is not stale; src/gone.ts in server has, and is.
    expect(cov.staleClaims.map((s) => `${s.repository?.name}:${s.pattern}`)).toEqual(['server:src/gone.ts'])
  })

  it('names each unclaimed file’s repository, once for each repository it is unclaimed in (v)', async () => {
    const moduleId = await aModule('Only the firmware library')
    await aRepository('server', server)
    const firmwareId = await aRepository('firmware', firmware)
    await state(moduleId, firmwareId, 'lib')
    await reindex()

    const { unclaimedFiles } = await import('../src/server/lib/sourceindex.ts')
    const unclaimed = unclaimedFiles({ workspaceId: WORKSPACE }).map((f) => `${f.repository?.name}:${f.path}`)
    // Biggest first; the two copies of src/shared.ts are one size, so they are listed by repository.
    expect(unclaimed).toEqual(['firmware:src/shared.ts', 'server:src/shared.ts', 'server:src/server-only.ts'])
  })

  it('counts a project with no registered repository against the workspace scan, as before (vi)', async () => {
    await reindex()
    await aModule('Nothing stated')

    const cov = await coverage()
    expect(cov.repositories).toBeNull()
    expect([cov.totalFiles, cov.claimedFiles, cov.unclaimedFiles]).toEqual([2, 0, 2])
    expect(cov.unclaimed).toEqual(['src/server-only.ts', 'src/shared.ts'])
  })

  it('looks a work domain’s entry up in its own repository’s stored scan (vii)', async () => {
    const moduleId = await aModule('The firmware library')
    const serverId = await aRepository('server', server)
    const firmwareId = await aRepository('firmware', firmware)
    await state(moduleId, firmwareId, 'lib')
    await reindex()

    const agent = t.api.createRecord({
      kind: 'agent',
      title: 'Agent coverage-test',
      data: { handle: 'coverage-test', state: 'active' },
      workspaceId: WORKSPACE,
      actor: AGENT,
    }).id
    const session = t.api.createRecord({ kind: 'session', title: 'A run', data: { doing: 'a run' }, workspaceId: WORKSPACE, actor: AGENT }).id
    const id = t.api.createRecord({
      kind: 'work_domain',
      title: 'Writes the firmware library',
      data: {
        objective: 'Writes the firmware library',
        agent,
        session,
        writes: [`${firmwareId}:lib/firmware-only.ts`, `${serverId}:lib/firmware-only.ts`],
      },
      workspaceId: WORKSPACE,
      actor: AGENT,
    }).id
    const { resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')
    const writes = resolveWorkDomain({ id, workspaceId: WORKSPACE, actor: AGENT }).resolution.writes
    expect((writes ?? []).map((w) => ({ repository: w.repository, shape: w.shape, files: w.files, modules: w.modules }))).toEqual([
      { repository: firmwareId, shape: 'file', files: 1, modules: [moduleId] },
      { repository: serverId, shape: 'unindexed', files: 0, modules: undefined },
    ])
  })

  it('says which repository has no stored scan, and not that the project has no index (viii)', async () => {
    await aRepository('server', server)
    await reindex()
    // Registered after the scan, so its slot is empty while the server's is not.
    const firmwareId = await aRepository('firmware', firmware)

    const agent = t.api.createRecord({
      kind: 'agent',
      title: 'Agent coverage-test',
      data: { handle: 'coverage-test', state: 'active' },
      workspaceId: WORKSPACE,
      actor: AGENT,
    }).id
    const session = t.api.createRecord({ kind: 'session', title: 'A run', data: { doing: 'a run' }, workspaceId: WORKSPACE, actor: AGENT }).id
    const id = t.api.createRecord({
      kind: 'work_domain',
      title: 'Writes the unscanned firmware',
      data: { objective: 'Writes the unscanned firmware', agent, session, repository: firmwareId, writes: ['lib/firmware-only.ts'] },
      workspaceId: WORKSPACE,
      actor: AGENT,
    }).id
    const { resolveWorkDomain } = await import('../src/server/lib/workdomain.ts')
    const { sayCouldNotDo } = await import('../src/shared/workdomain.ts')
    const reply = resolveWorkDomain({ id, workspaceId: WORKSPACE, actor: AGENT })
    const entry = reply.resolution.writes?.[0]
    expect({ repository: entry?.repository, shape: entry?.shape, note: entry?.note }).toEqual({
      repository: firmwareId,
      shape: 'unresolved',
      note: 'no_file_index',
    })
    const sentence =
      'No scan of the repository "firmware" is stored, so "lib/firmware-only.ts" could not be resolved. POST ' +
      '/api/source/reindex scans every registered repository that has a checkout on this machine into its own slot; ' +
      'resolve again after it.'
    const report = reply.resolution.couldNotDo
    const item = report.checked ? report.items?.find((i) => i.code === 'no_file_index') : undefined
    expect(item === undefined ? undefined : sayCouldNotDo(item.code, item.inputs)).toBe(sentence)
    expect(reply.differences.find((d) => d.row === 'mapping_unsure')?.says).toBe(sentence)
  })
})
