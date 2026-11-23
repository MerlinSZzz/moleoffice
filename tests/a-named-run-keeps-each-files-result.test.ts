// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A named test run keeps each file's result beside its one use line (migration 0279).
 * The HTTP refusals must name the bad place and leave both tables alone. A trigger that rejects
 * the second file proves the use and the first file roll back together, without a production hook.
 */
import type { FastifyInstance } from 'fastify'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { NO_UNCOMMITTED_CHANGE, TOOL_USE_MOST_CHARACTERS, TEST_FILE_RESULTS, THE_TEST_FILES_TOOL, TEST_FILES_IN_A_USE_MOST, TEST_HASH_CHARACTERS, TEST_FILE_PATH_MOST_CHARACTERS } from '../src/shared/toolset.ts'

const ACTOR = { type: 'agent', id: 'file-results-tester' } as const
const HEADERS = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': ACTOR.id, 'x-mole-office-workspace': 'default' }
const HASH = '0123456789abcdef'
const TREE = { commit: 'a'.repeat(40), change: NO_UNCOMMITTED_CHANGE }
const FILES = [
  { file: 'tests/a.test.ts', result: 'passed', seconds: 1.234, testFileHash: HASH },
  { file: 'tests/b.test.ts', result: 'failed', seconds: 0, testFileHash: HASH },
  { file: 'tests/c.test.ts', result: 'no result', seconds: null, testFileHash: null },
]
let t: TestDb
let app: FastifyInstance
let run: string
const extra: TestDb[] = []
const folders: string[] = []

beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A synthetic named-test run', data: { state: 'running' }, actor: ACTOR }).id
  const category = t.api.createRecord({ workspaceId: 'default', kind: 'tool_category', title: 'Synthetic tools', data: { says: 'Test fixtures.' }, actor: ACTOR }).id
  for (const slug of [THE_TEST_FILES_TOOL, 'another-tool']) {
    t.api.createRecord({ workspaceId: 'default', kind: 'tool', title: slug, data: { entry: 'tool', slug, forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' }, actor: ACTOR })
  }
})
afterEach(async () => {
  await app.close()
  for (const db of extra.splice(0)) db.close()
  t.close()
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const body = (): Record<string, unknown> => ({ tool: THE_TEST_FILES_TOOL, said: '3 files: 1 passed, 1 failed, 1 without a result', files: FILES.map(f => ({ ...f })), tree: { ...TREE } })
/** Control characters take six JSON bytes apiece; these explicitly synthetic paths are all distinct. */
function maximumBody(): Record<string, unknown> {
  const result = TEST_FILE_RESULTS.reduce<string>((longest, word) => word.length > longest.length ? word : longest, '')
  return {
    tool: THE_TEST_FILES_TOOL,
    said: 'Synthetic maximum ' + '\u0001'.repeat(TOOL_USE_MOST_CHARACTERS - 'Synthetic maximum '.length),
    files: Array.from({ length: TEST_FILES_IN_A_USE_MOST }, (_, i) => {
      const prefix = `tests/${String(i).padStart(4, '0')}-`
      const suffix = '.test.ts'
      return { file: prefix + '\u0001'.repeat(TEST_FILE_PATH_MOST_CHARACTERS - prefix.length - suffix.length) + suffix, result, seconds: 0.0000010000000000000002, testFileHash: HASH }
    }),
    tree: { commit: 'a'.repeat(64), change: HASH },
  }
}
const postJson = (payload: string) => app.inject({ method: 'POST', url: '/api/toolset/uses', headers: { ...HEADERS, 'x-mole-office-session': run, 'content-type': 'application/json' }, payload })

const post = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/toolset/uses', headers: { ...HEADERS, 'x-mole-office-session': run }, payload })
const fileRows = () => t.client.sqlite.prepare('SELECT * FROM test_file_runs ORDER BY file').all() as Record<string, unknown>[]
const useRows = () => t.client.sqlite.prepare('SELECT * FROM tool_uses ORDER BY id').all()

async function refused(payload: Record<string, unknown>, place: string): Promise<void> {
  const before = { uses: useRows(), files: fileRows() }
  const res = await post(payload)
  expect(res.statusCode, res.body).toBe(400)
  const sentence = (res.json() as { error: string }).error
  expect(sentence).toContain(place)
  expect(sentence).toMatch(/Nothing was written\.$/)
  expect({ uses: useRows(), files: fileRows() }).toEqual(before)
}

describe('a named run keeps each file result', () => {
  it('1. stores three files on the use in the run project and keeps the same use line', async () => {
    const res = await post(body())
    expect(res.statusCode, res.body).toBe(201)
    const reply = res.json() as { files: number; line: { said: string }; says: string }
    expect(reply.files).toBe(3)
    expect(reply.says).toContain('with 3 test file results')
    const use = t.client.sqlite.prepare('SELECT id, workspace_id, run_id, said FROM tool_uses WHERE run_id = ?').get(run) as { id: string; workspace_id: string; run_id: string; said: string }
    expect(use).toMatchObject({ workspace_id: 'default', run_id: run, said: body()['said'] })
    const rows = fileRows()
    expect(new Set(rows.map(r => r['id'])).size).toBe(3)
    expect(rows).toEqual(FILES.map(f => ({ id: expect.any(String), workspace_id: 'default', use_id: use.id, file: f.file, result: f.result, seconds: f.seconds, test_file_hash: f.testFileHash, tree_commit: TREE.commit, tree_change: TREE.change })))
    const plain = await post({ tool: THE_TEST_FILES_TOOL, said: body()['said'] })
    expect(plain.statusCode, plain.body).toBe(201)
    expect((plain.json() as { line: unknown }).line).toMatchObject({ tool: THE_TEST_FILES_TOOL, said: reply.line.said })
    expect(fileRows()).toEqual(rows)
  })

  it('2. accepts an ordinary use with zero file rows', async () => {
    const res = await post({ tool: 'another-tool', said: 'A plain use.' })
    expect(res.statusCode, res.body).toBe(201)
    expect((res.json() as { files: number }).files).toBe(0)
    expect(fileRows()).toEqual([])
    expect(useRows()).toHaveLength(1)
  })

  it('3. refuses file results on another tool without writing either table', async () => {
    await refused({ ...body(), tool: 'another-tool' }, 'files')
  })

  const bad: { name: string; place: string; change: (b: Record<string, unknown>) => void }[] = [
    { name: 'files without tree', place: 'tree', change: b => { delete b['tree'] } },
    { name: 'tree without files', place: 'files', change: b => { delete b['files'] } },
    { name: 'no files', place: 'files', change: b => { b['files'] = [] } },
    { name: 'too many files', place: 'files', change: b => { b['files'] = Array.from({ length: TEST_FILES_IN_A_USE_MOST + 1 }, (_, i) => ({ ...FILES[0], file: `tests/${i}.test.ts` })) } },
    { name: 'duplicate file', place: 'files[1].file', change: b => { b['files'] = [FILES[0], FILES[0]] } },
    ...[
      ['empty path', ''], ['long path', 'a'.repeat(TEST_FILE_PATH_MOST_CHARACTERS + 1)],
      ['line break', 'tests/a\nb.test.ts'],
      ['backslash', 'tests\\a.test.ts'], ['absolute path', '/tests/a.test.ts'],
      ['parent segment', 'tests/../a.test.ts'], ['dot segment', 'tests/./a.test.ts'],
    ].map(([name, file]) => ({ name: name!, place: 'files[0].file', change: (b: Record<string, unknown>) => { b['files'] = [{ ...FILES[0], file }] } })),
    { name: 'unknown result', place: 'files[0].result', change: b => { b['files'] = [{ ...FILES[0], result: 'green' }] } },
    { name: 'negative seconds', place: 'files[0].seconds', change: b => { b['files'] = [{ ...FILES[0], seconds: -1 }] } },
    { name: 'short hash', place: 'files[0].testFileHash', change: b => { b['files'] = [{ ...FILES[0], testFileHash: 'a'.repeat(TEST_HASH_CHARACTERS - 1) }] } },
    { name: 'short commit', place: 'tree.commit', change: b => { b['tree'] = { ...TREE, commit: 'a'.repeat(39) } } },
    { name: 'unknown tree change', place: 'tree.change', change: b => { b['tree'] = { ...TREE, change: 'clean' } } },
    { name: 'unknown file key', place: 'files[0].extra', change: b => { b['files'] = [{ ...FILES[0], extra: true }] } },
    { name: 'unknown tree key', place: 'tree.extra', change: b => { b['tree'] = { ...TREE, extra: true } } },
    { name: 'unknown use key', place: 'extra', change: b => { b['extra'] = true } },
  ]
  for (const one of bad) it(`4. refuses ${one.name} and names ${one.place}`, async () => {
    const payload = body()
    one.change(payload)
    await refused(payload, one.place)
  })

  it('accepts the limits, a SHA-256 commit, changed tree hash and unknown tree values', async () => {
    const res = await post({ ...body(), files: [{ ...FILES[0], file: 'a'.repeat(TEST_FILE_PATH_MOST_CHARACTERS) }], tree: { commit: 'a'.repeat(64), change: HASH } })
    expect(res.statusCode, res.body).toBe(201)
    const unknown = await post({ ...body(), tree: { commit: null, change: null } })
    expect(unknown.statusCode, unknown.body).toBe(201)
    expect(fileRows().filter(r => r['tree_commit'] === null && r['tree_change'] === null)).toHaveLength(3)
  })

  it('accepts 5,000 distinct maximum-length paths as compact JSON', async () => {
    const payload = maximumBody()
    const files = payload['files'] as { file: string }[]
    expect(new Set(files.map(f => f.file)).size).toBe(TEST_FILES_IN_A_USE_MOST)
    expect(files.every(f => f.file.length === TEST_FILE_PATH_MOST_CHARACTERS)).toBe(true)
    const res = await postJson(JSON.stringify(payload))
    expect(res.statusCode, res.body).toBe(201)
    expect((res.json() as { files: number }).files).toBe(TEST_FILES_IN_A_USE_MOST)
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM test_file_runs').get()).toEqual({ n: TEST_FILES_IN_A_USE_MOST })
    expect(useRows()).toHaveLength(1)
  })

  it('refuses a body one byte above the use route limit without either kind of row', async () => {
    const { USE_BODY_MOST_BYTES } = await import('../src/server/api/toolset.ts')
    const json = JSON.stringify(maximumBody())
    expect(USE_BODY_MOST_BYTES).toBeGreaterThan(Buffer.byteLength(json))
    const payload = json + ' '.repeat(USE_BODY_MOST_BYTES + 1 - Buffer.byteLength(json))
    expect(Buffer.byteLength(payload)).toBe(USE_BODY_MOST_BYTES + 1)
    const before = { uses: useRows(), files: fileRows() }
    const res = await postJson(payload)
    expect(res.statusCode, res.body).toBe(413)
    expect({ uses: useRows(), files: fileRows() }).toEqual(before)
  })

  it('rolls back the use and earlier files when the second file insert throws', async () => {
    t.client.sqlite.exec("CREATE TRIGGER reject_second_test_file BEFORE INSERT ON test_file_runs WHEN NEW.file = 'tests/b.test.ts' BEGIN SELECT RAISE(ABORT, 'synthetic second file failure'); END")
    const res = await post(body())
    expect(res.statusCode, res.body).toBe(409)
    expect(useRows(), 'the use must roll back with the rejected file').toEqual([])
    expect(fileRows(), 'the earlier file must roll back too').toEqual([])
  })

  it('5. exports all rows and imports them exactly, including a second import', async () => {
    const res = await post(body())
    expect(res.statusCode, res.body).toBe(201)
    const expected = fileRows()
    const archive = mkdtempSync(join(tmpdir(), 'named-file-results-'))
    folders.push(archive)
    const exporter = await import('../src/server/lib/export.ts')
    exporter.writeExport(archive)
    const target = await freshDb()
    extra.push(target)
    const importer = await import('../src/server/lib/import.ts')
    importer.applyImport(archive)
    expect(target.client.sqlite.prepare('SELECT * FROM test_file_runs ORDER BY file').all()).toEqual(expected)
    importer.applyImport(archive)
    expect(target.client.sqlite.prepare('SELECT * FROM test_file_runs ORDER BY file').all()).toEqual(expected)
  })

  it('carries the use and its file results with a run moved to another project', async () => {
    expect((await post(body())).statusCode).toBe(201)
    const project = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: 'results-project', title: 'Synthetic results project' } })
    expect(project.statusCode, project.body).toBe(201)
    const moved = await app.inject({ method: 'POST', url: `/api/records/${run}/workspace`, headers: HEADERS, payload: { to: 'results-project' } })
    expect(moved.statusCode, moved.body).toBe(200)
    expect(fileRows().map(r => r['workspace_id'])).toEqual(FILES.map(() => 'results-project'))
    expect(t.client.sqlite.prepare('SELECT workspace_id FROM tool_uses WHERE run_id = ?').get(run)).toEqual({ workspace_id: 'results-project' })
  })
})
