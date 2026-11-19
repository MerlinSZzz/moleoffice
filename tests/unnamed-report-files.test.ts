// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The list preserves current references and restorable history. Problem H_XZ7K7uNvmv. */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { THE_SECRETARY } from '../src/shared/roles.ts'
import type { StoredReportFile, UnnamedReportFiles } from '../src/server/lib/reportfiles.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let files: typeof import('../src/server/lib/reportfiles.ts')
let previousRoots: string | undefined

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const asAgent = (id: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

beforeAll(async () => {
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  t = await freshDb()
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = dirname(t.file)
  files = await import('../src/server/lib/reportfiles.ts')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(() => {
  // Each case starts from the database the file's setup left. A savepoint rolls back every record,
  // revision and project the case writes, so a prose citation made for one case cannot protect the
  // uploads of another.
  t.client.sqlite.exec('SAVEPOINT unnamed_file_case')
})

afterEach(() => {
  t.client.sqlite.exec('ROLLBACK TO unnamed_file_case; RELEASE unnamed_file_case')
  // The report files one case uploaded are the only thing it leaves in the shared office, and one
  // case needs the folder to be missing when it starts, so each case gets the folder it found.
  rmSync(files.reportFileDirectory(), { recursive: true, force: true })
})

afterAll(async () => {
  await app.close()
  t.close()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
})

async function upload(name: string, text: string): Promise<StoredReportFile> {
  const response = await app.inject({
    method: 'POST', url: '/api/report-files', headers: PERSON,
    payload: { name, bytes: Buffer.from(text).toString('base64') },
  })
  expect(response.statusCode, response.body).toBe(201)
  return response.json<{ file: StoredReportFile }>().file
}

const block = (file: StoredReportFile) => ({ id: 'b-file', type: 'file', ...file })
const textBlock = { id: 'b-text', type: 'text', text: 'The file block was replaced.' }

/** Keep this reference in current content only, so revision copies cannot hide a broken record reader. */
function currentOnly(data: Record<string, unknown>, workspaceId = 'default', kind: 'module' | 'report' = 'module'): string {
  const record = t.api.createRecord({ workspaceId, kind, title: 'Current reference', actor: t.api.HUMAN })
  writeDataBypassingTheGate(t, record.id, data)
  return record.id
}

function fileFacts(path: string) {
  const stat = lstatSync(path)
  return { size: stat.size, ino: stat.ino, mode: stat.mode, mtime: stat.mtimeMs, ctime: stat.ctimeMs, birthtime: stat.birthtimeMs }
}

/** Reading a directory can update its access time in the operating system; it is not a content write. */
function folderSnapshot() {
  const directory = files.reportFileDirectory()
  return {
    directory: fileFacts(directory),
    entries: readdirSync(directory).sort().map((name) => ({
      name, facts: fileFacts(join(directory, name)), bytes: readFileSync(join(directory, name)),
    })),
  }
}

function readWithoutWrites(): UnnamedReportFiles {
  const before = t.client.sqlite.serialize()
  const changes = t.client.sqlite.prepare('SELECT total_changes() AS n').get()
  t.client.sqlite.pragma('query_only = ON')
  try {
    const answer = files.unnamedReportFiles()
    expect(t.client.sqlite.serialize().equals(before)).toBe(true)
    expect(t.client.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(changes)
    return answer
  } finally {
    t.client.sqlite.pragma('query_only = OFF')
  }
}

/** One statement that read records or revisions, with how many rows it returned. */
interface ReturnedBatch {
  table: 'records' | 'revisions'
  rows: number
}

/**
 * Read while recording the rows each record or revision statement returned, and while holding the
 * database to reads only. The page bound is judged from what the database really handed back, not
 * from the source text of the reader.
 */
function readRecordingBatches(): { answer: UnnamedReportFiles; batches: ReturnedBatch[] } {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare as (this: unknown, sql: string) => Record<string, unknown>
  const batches: ReturnedBatch[] = []
  const before = t.client.sqlite.serialize()
  const changes = t.client.sqlite.prepare('SELECT total_changes() AS n').get()
  t.client.sqlite.pragma('query_only = ON')
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    const all = statement['all']
    if (typeof all === 'function') {
      statement['all'] = function (this: unknown, ...args: unknown[]) {
        const result = (all as (...a: unknown[]) => unknown).apply(this, args)
        const table = /from\s+"?(records|revisions)"?/iu.exec(text)?.[1]?.toLowerCase()
        if ((table === 'records' || table === 'revisions') && Array.isArray(result)) {
          batches.push({ table, rows: result.length })
        }
        return result
      }
    }
    return statement
  }
  try {
    const answer = files.unnamedReportFiles()
    expect(t.client.sqlite.serialize().equals(before)).toBe(true)
    expect(t.client.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(changes)
    return { answer, batches }
  } finally {
    sqlite.prepare = prepare
    t.client.sqlite.pragma('query_only = OFF')
  }
}

it('lists only the unnamed upload, preserves a replaced revision and changes no file or row', async () => {
  const unnamed = await upload('lost.txt', 'This upload has no record.\n')
  const current = await upload('current.txt', 'A current block names this upload.\n')
  const older = await upload('older.txt', 'A restorable revision names this upload.\n')
  const report = t.api.createRecord({
    workspaceId: 'default', kind: 'report', title: 'Current file reference',
    data: { blocks: [textBlock] }, actor: t.api.HUMAN,
  })
  // The reader must also protect a current row without a matching revision, such as an imported row.
  writeDataBypassingTheGate(t, report.id, { blocks: [block(current)] })
  const changed = t.api.createRecord({
    workspaceId: 'default', kind: 'report', title: 'A changed report',
    data: { blocks: [block(older)] }, actor: t.api.HUMAN,
  })
  t.api.patchRecord(changed.id, { dataPatch: { blocks: [textBlock] } }, t.api.HUMAN)

  const before = folderSnapshot()
  const answer = readWithoutWrites()
  expect(answer).toMatchObject({ directoryState: 'present', filesExamined: 3, unnamedCount: 1, skippedEntries: [] })
  expect(answer.files).toEqual([{
    name: basename(unnamed.path), size: Buffer.byteLength('This upload has no record.\n'),
    storedAt: null, modifiedAt: expect.any(String),
  }])
  expect(Date.parse(answer.files[0]!.modifiedAt)).toBe(lstatSync(unnamed.path).mtime.getTime())
  expect(answer.timeSource).toBe('filesystem mtime')
  expect(answer.note).toContain('The upload time is not recorded')
  expect(folderSnapshot()).toEqual(before)
})

it('counts nested summaries, message attachments and deleted records and revisions across projects', async () => {
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'elsewhere', title: 'Another project' })
  const summary = await upload('summary.txt', 'In a summary')
  const attached = await upload('picture.png', 'A message attachment')
  const nested = await upload('nested.txt', 'Nested in a block')
  const deleted = await upload('deleted.txt', 'On a deleted row in another project')
  const revision = await upload('revision.txt', 'Only an older summary in another project')
  currentOnly({ summaryBlocks: [block(summary)] })
  t.api.createRecord({
    workspaceId: 'default', kind: 'message', title: 'A picture attachment', actor: t.api.HUMAN,
    data: { body: 'The attached picture.', to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }],
      pictures: [{ id: 'picture', type: 'image', path: attached.path, alt: 'An attachment' }] },
  })
  currentOnly({ blocks: [{ id: 'group', type: 'columns', columns: [{ blocks: [block(nested)] }] }] }, 'default', 'report')
  const gone = currentOnly({ paths: [{ path: deleted.path }] }, 'elsewhere')
  t.api.deleteRecord(gone, t.api.HUMAN)
  const changed = t.api.createRecord({
    workspaceId: 'elsewhere', kind: 'module', title: 'An older summary',
    data: { summaryBlocks: [block(revision)] }, actor: t.api.HUMAN,
  })
  t.api.patchRecord(changed.id, { dataPatch: { summaryBlocks: [textBlock] } }, t.api.HUMAN)
  t.api.deleteRecord(changed.id, t.api.HUMAN)
  const before = folderSnapshot()
  expect(readWithoutWrites()).toMatchObject({ filesExamined: 5, unnamedCount: 0, files: [] })
  expect(folderSnapshot()).toEqual(before)
})

it('keeps a file named on a later page, in a revision only, and in a deleted record in another project', async () => {
  const onALaterPage = await upload('later.txt', 'A record after more than one page names this.')
  const onlyInARevision = await upload('revised.txt', 'Only an older revision names this.')
  const nestedInADeletedProject = await upload('gone.txt', 'Nested in a deleted record in another project.')
  const leftAlone = await upload('left-alone.txt', 'Nothing names this file.')

  // More rows than two pages, so a reader that keeps one page and stops cannot pass this case.
  for (let n = 0; n < 2 * files.UNNAMED_REPORT_FILE_PAGE_SIZE + 3; n += 1) {
    t.api.createRecord({ workspaceId: 'default', kind: 'module', title: `Filler ${String(n)}`, actor: t.api.HUMAN })
  }
  currentOnly({ blocks: [block(onALaterPage)] }, 'default', 'report')
  const revised = t.api.createRecord({
    workspaceId: 'default', kind: 'report', title: 'A file only an older revision names',
    data: { blocks: [block(onlyInARevision)] }, actor: t.api.HUMAN,
  })
  t.api.patchRecord(revised.id, { dataPatch: { blocks: [textBlock] } }, t.api.HUMAN)
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'later-pages', title: 'Another project' })
  const gone = currentOnly({ blocks: [{ id: 'group', type: 'columns', columns: [{ blocks: [block(nestedInADeletedProject)] }] }] }, 'later-pages', 'report')
  t.api.deleteRecord(gone, t.api.HUMAN)

  const { answer, batches } = readRecordingBatches()
  expect(batches.filter((one) => one.table === 'records').length).toBeGreaterThan(1)
  expect(batches.filter((one) => one.table === 'revisions').length).toBeGreaterThan(1)
  expect(batches.every((one) => one.rows <= files.UNNAMED_REPORT_FILE_PAGE_SIZE)).toBe(true)
  expect(answer).toMatchObject({ directoryState: 'present', filesExamined: 4, unnamedCount: 1, skippedEntries: [] })
  expect(answer.files.map((one) => one.name)).toEqual([basename(leftAlone.path)])
})

it('keeps a file named in prose, in any case, and leaves an unnamed file alone', async () => {
  const inATitle = await upload('title.txt', 'Its stored name is in a title.')
  const inASummary = await upload('summary.txt', 'Its stored name is in a summary.')
  const byARelativePath = await upload('relative.txt', 'Its stored name is in a relative path.')
  const leftAlone = await upload('no-mention.txt', 'No text mentions this file.')
  t.api.createRecord({
    workspaceId: 'default', kind: 'module', title: `Earlier note: ${basename(inATitle.path).toUpperCase()}`,
    actor: t.api.HUMAN,
  })
  t.api.createRecord({
    workspaceId: 'default', kind: 'module', title: 'A note with a summary',
    summary: `See ${basename(inASummary.path).toUpperCase()} for the measurements.`, actor: t.api.HUMAN,
  })
  t.api.createRecord({
    workspaceId: 'default', kind: 'module', title: 'A note with a relative path',
    data: { extra: { note: `The older copy is at report-files/${basename(byARelativePath.path).toUpperCase()}.` } },
    actor: t.api.HUMAN,
  })
  const { answer } = readRecordingBatches()
  expect(answer).toMatchObject({ filesExamined: 4, unnamedCount: 1 })
  expect(answer.files.map((one) => one.name)).toEqual([basename(leftAlone.path)])
})

it('does not read an endpoint, a test name or a concrete other file as the folder itself', async () => {
  const named = await upload('named.txt', 'Its stored name is in a title.')
  const leftAlone = await upload('left-alone-endpoint.txt', 'Nothing names this file.')
  t.api.createRecord({
    workspaceId: 'default', kind: 'module',
    title: 'The route is /api/report-files and its list is /api/report-files/unnamed; the test is tests/unnamed-report-files.test.ts',
    data: { extra: { note: 'A concrete sibling is report-files/not-a-candidate.txt, and report-files.test.ts is a test name.' } },
    actor: t.api.HUMAN,
  })
  t.api.createRecord({
    workspaceId: 'default', kind: 'module', title: `A stored name: ${basename(named.path).toUpperCase()}`,
    actor: t.api.HUMAN,
  })
  const { answer } = readRecordingBatches()
  expect(answer).toMatchObject({ filesExamined: 2, unnamedCount: 1 })
  expect(answer.files.map((one) => one.name)).toEqual([basename(leftAlone.path)])
})

it('keeps every file when prose names the report-files folder itself', async () => {
  await upload('one.txt', 'The first upload')
  await upload('two.txt', 'The second upload')
  t.api.createRecord({
    workspaceId: 'default', kind: 'module', title: 'The report-files folder holds older uploads',
    data: { extra: { note: 'Nothing here names a particular file in that folder.' } }, actor: t.api.HUMAN,
  })
  const { answer } = readRecordingBatches()
  expect(answer).toMatchObject({ filesExamined: 2, unnamedCount: 0, files: [] })
})

it('reads no record or revision when the folder holds no regular file', () => {
  mkdirSync(files.reportFileDirectory())
  mkdirSync(join(files.reportFileDirectory(), 'subfolder'))
  const { answer, batches } = readRecordingBatches()
  expect(answer).toMatchObject({
    directoryState: 'present', filesExamined: 0, unnamedCount: 0, skippedEntries: ['subfolder'], files: [],
  })
  expect(batches).toEqual([])
})

it('distinguishes a missing folder from an empty one and names entries it does not inspect', () => {
  const directory = files.reportFileDirectory()
  expect(readWithoutWrites()).toMatchObject({ directoryState: 'missing', filesExamined: 0, unnamedCount: 0 })
  expect(existsSync(directory)).toBe(false)
  mkdirSync(directory)
  expect(readWithoutWrites()).toMatchObject({ directoryState: 'present', filesExamined: 0, unnamedCount: 0 })
  mkdirSync(join(directory, 'subfolder'))
  symlinkSync(t.file, join(directory, 'linked-file'))
  expect(readWithoutWrites()).toMatchObject({
    directoryState: 'present', filesExamined: 0, unnamedCount: 0,
    skippedEntries: ['linked-file', 'subfolder'], files: [],
  })
  expect(lstatSync(join(directory, 'linked-file')).isSymbolicLink()).toBe(true)
  expect(lstatSync(join(directory, 'subfolder')).isDirectory()).toBe(true)
})

it('serves the person and secretary, refuses a worker, and describes the remote read', async () => {
  for (const [headers, payload] of [
    [PERSON, { handle: 'list-secretary', name: 'List secretary', role: THE_SECRETARY }],
    [asAgent('list-secretary'), { handle: 'list-worker', name: 'List worker', role: 'worker' }],
  ] as const) {
    const response = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
    expect(response.statusCode, response.body).toBe(201)
  }
  const stored = await upload('unclaimed.txt', 'An upload to list')
  const before = folderSnapshot()
  for (const headers of [PERSON, asAgent('list-secretary')]) {
    const response = await app.inject({ method: 'GET', url: '/api/report-files/unnamed', headers })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json()).toMatchObject({
      filesExamined: 1, unnamedCount: 1, files: [{ name: basename(stored.path) }],
      narrowedByPermission: null, note: expect.stringContaining('request and key-use accounting still applies'),
    })
  }
  const refused = await app.inject({ method: 'GET', url: '/api/report-files/unnamed', headers: asAgent('list-worker') })
  expect(refused.statusCode, refused.body).toBe(403)
  expect(refused.json().error).toContain('Only the person and the secretary')
  const index = await app.inject({ method: 'GET', url: '/api', headers: PERSON })
  expect(index.body).toContain('/api/report-files/unnamed')
  expect(index.body).toContain('filesystem mtime')
  expect(folderSnapshot()).toEqual(before)
})
