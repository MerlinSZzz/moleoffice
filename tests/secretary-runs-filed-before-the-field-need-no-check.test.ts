// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY'S RUN THE OFFICE FILED BEFORE IT WROTE needsNoCheck GETS IT FROM THE MIGRATION. Problem 7zhliUpNgKPx.
 *
 * Since main 3822e94cd the office writes `needsNoCheck` in the first write of the run it files for a secretary's
 * design/-only merge entry. Three runs filed before that carry none and read as waiting for a check. The data step in
 * src/server/db/secretary-runs-need-no-check.ts, run by `migrateInPlace`, writes the field on such a run, as the
 * office, found through the merge entry that names the run.
 *
 * WHAT IS PROVED HERE, on a throwaway database, through the real merge queue door and the real `migrateInPlace`:
 *   1. A run filed for a secretary's design/-only entry, with the field taken off it and off every revision of it
 *      (which is what a run filed before the change holds), reads closed after the step. The step wrote the field,
 *      one change row and one revision, all as the office, and nothing else in the run changed.
 *   2. A run with the same title shape, filed by the office with the same purpose, that no merge entry names, is
 *      left exactly as it was. So is a run filed after the change, which already holds the field.
 *   3. A second run of the step changes nothing.
 *
 * MUTATION PROOFS, each after a control, recorded in the commit message:
 *   - the step selects by title instead of through the entry: case 2 goes red;
 *   - the step's call taken out of `migrateInPlace`: case 1 goes red;
 *   - the step's check for a field already held taken out: case 3 goes red.
 *
 * Every fixture here is synthetic: the git folders are made under `.logs/` in this checkout and removed after, and
 * nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { migrateInPlace, type MigrationOutcome } from '../src/server/db/migrate.ts'
import { NEEDS_NO_CHECK, howARunStands } from '../src/shared/releasing.ts'
import { contentOf, versionOf } from '../src/server/lib/version.ts'

let t: TestDb
let app: FastifyInstance
const made: string[] = []

const THE_OFFICE = 'mole-office/the-api-server'
const TITLE_SHAPE = "The office's run for a secretary's design/ entry: "

const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asSecretary = as('agent', 'nd-secretary')

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory inside this checkout's `.logs/`, removed after the file. */
function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `no-check-data-${prefix}-`))
  made.push(dir)
  return dir
}

/** A synthetic git folder: `main`, and a branch on top of it changing one design/ file, checked out. */
function aFolder(branch: string): string {
  const dir = scratch(branch)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic no-check-data fixture')
  mkdirSync(join(dir, 'design'), { recursive: true })
  writeFileSync(join(dir, 'design', 'rules.md'), 'The rules, as they were.\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', branch)
  writeFileSync(join(dir, 'design', 'rules.md'), `The rules, as ${branch} has them.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic change')
  return realpathSync(dir)
}

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/** File a secretary's design/-only entry through the real door, and answer the run the office filed for it. */
async function aSecretarysEntry(branch: string): Promise<{ run: string; entry: string }> {
  const filed = await call('POST', '/api/merge-queue', asSecretary, {
    changeset: { adapter: 'git', repository: 'fixture-main', branch },
    workingDirectory: aFolder(branch),
  })
  expect(filed.status, filed.raw).toBe(201)
  return { run: filed.body['entry'].run as string, entry: filed.body['entry'].id as string }
}

interface Row {
  id: string
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
  updated_at: string
}

const readRow = (id: string): Row => t.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(id) as Row
const dataOf = (id: string): Record<string, unknown> => JSON.parse(readRow(id).data) as Record<string, unknown>
const revisionsOf = (id: string) =>
  t.client.sqlite.prepare('SELECT seq, actor_type, actor_id, op, content_hash, data FROM revisions WHERE record_id = ? ORDER BY seq').all(id) as {
    seq: number
    actor_type: string
    actor_id: string
    op: string
    content_hash: string
    data: string
  }[]
const changesOf = (id: string) =>
  t.client.sqlite.prepare('SELECT op, actor_type, actor_id, field, new_value FROM changes WHERE record_id = ? ORDER BY rowid').all(id) as {
    op: string
    actor_type: string
    actor_id: string
    field: string | null
    new_value: string | null
  }[]
const count = (table: string): number => (t.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n

/** The hash a record's newest revision must hold for the record to stay writable. */
function versionNow(id: string): string {
  const row = readRow(id)
  return versionOf(contentOf({ kind: row.kind, title: row.title, summary: row.summary, data: JSON.parse(row.data) as Record<string, unknown>, deletedAt: row.deleted_at }))
}

/**
 * TAKE THE FIELD OFF A RUN AND OFF EVERY REVISION OF IT, each revision's hash recomputed. That is what a run the
 * office filed before main 3822e94cd holds: the same run, the same entry, the same seal, and no `needsNoCheck`
 * anywhere in its history. It is a fixture edit, made in SQL because no door may take the field off.
 */
function asFiledBeforeTheField(id: string): void {
  const sqlite = t.client.sqlite
  const row = readRow(id)
  const data = JSON.parse(row.data) as Record<string, unknown>
  delete data[NEEDS_NO_CHECK]
  sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
  const revisions = sqlite.prepare('SELECT id, kind, title, summary, data, deleted_at FROM revisions WHERE record_id = ?').all(id) as {
    id: string
    kind: string
    title: string
    summary: string | null
    data: string
    deleted_at: string | null
  }[]
  for (const one of revisions) {
    const held = JSON.parse(one.data) as Record<string, unknown>
    delete held[NEEDS_NO_CHECK]
    const content = contentOf({ kind: one.kind, title: one.title, summary: one.summary, data: held, deletedAt: one.deleted_at })
    sqlite.prepare('UPDATE revisions SET data = ?, content_hash = ? WHERE id = ?').run(JSON.stringify(content.data), versionOf(content), one.id)
  }
}

/** The run filed before the field, as the fixture leaves it. */
let before: { run: string; entry: string }
/** A run filed after the change, which already holds the field. */
let after: { run: string; entry: string }
/** A run with the same title shape and purpose, filed by the office, that no merge entry names. */
let lookalike: string

let beforeRow: Row
let lookalikeRow: Row
let afterRow: Row
let first: MigrationOutcome

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'fixture-main', root: realpathSync(scratch('main')), actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  const started = await call('POST', '/api/agents/started', asPerson, { handle: 'nd-secretary', name: 'Synthetic nd-secretary', role: 'secretary' })
  expect(started.status, started.raw).toBe(201)

  before = await aSecretarysEntry('old-notes')
  after = await aSecretarysEntry('new-notes')
  asFiledBeforeTheField(before.run)

  // THE LOOKALIKE: the office's own title shape and the same purpose, written by the office, and no entry names it.
  // It is not finished, so the record door does not seal it.
  lookalike = t.api.createRecord({
    kind: 'session',
    title: `${TITLE_SHAPE}lookalike-notes at 0123456789ab`,
    workspaceId: 'default',
    actor: { type: 'agent', id: THE_OFFICE },
    origin: 'fixture',
    data: { state: 'idle', servingAgent: 'nd-secretary', extra: { purpose: 'secretary-documents' } },
  }).id

  beforeRow = readRow(before.run)
  lookalikeRow = readRow(lookalike)
  afterRow = readRow(after.run)
  expect(howARunStands(dataOf(before.run)).standing, 'the fixture did not leave the old run waiting for a check').toBe('inspecting')
  expect(readRow(before.run).title.startsWith(TITLE_SHAPE)).toBe(true)

  first = migrateInPlace(t.client.sqlite)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe("a secretary's run the office filed before it wrote needsNoCheck", () => {
  it('reads closed after the step, which wrote the field, one change row and one revision, as the office, and nothing else', () => {
    expect(first.secretaryRuns.marked).toEqual([before])
    expect(first.secretaryRuns.written).toBe(1)

    const data = dataOf(before.run)
    const stands = howARunStands(data)
    expect(stands.standing).toBe('closed')
    expect(stands.waitingFor).toBeNull()
    expect(stands.unreleasedFinish).toBe(false)
    expect(data[NEEDS_NO_CHECK]).toMatchObject({ decision: 'madeUpuoadum' })
    expect((data[NEEDS_NO_CHECK] as { because: string }).because).toContain(`(${before.entry})`)

    // NOTHING ELSE IN THE RUN MOVED.
    const { [NEEDS_NO_CHECK]: _written, ...rest } = data
    expect(rest).toEqual(JSON.parse(beforeRow.data))
    const row = readRow(before.run)
    expect({ title: row.title, summary: row.summary, updated_at: row.updated_at }).toEqual({
      title: beforeRow.title,
      summary: beforeRow.summary,
      updated_at: beforeRow.updated_at,
    })

    // AS THE OFFICE, IN BOTH HISTORIES, and the newest revision names what the run now holds.
    const revisions = revisionsOf(before.run)
    const newest = revisions[revisions.length - 1]!
    expect(newest).toMatchObject({ actor_type: 'agent', actor_id: THE_OFFICE, op: 'update' })
    expect(newest.content_hash).toBe(versionNow(before.run))
    const last = changesOf(before.run).at(-1)!
    expect(last).toMatchObject({ op: 'update', actor_type: 'agent', actor_id: THE_OFFICE, field: `data.${NEEDS_NO_CHECK}` })
    expect(JSON.parse(last.new_value!)).toEqual(data[NEEDS_NO_CHECK])
  })

  it('leaves a lookalike run that no entry names, and a run that already holds the field, exactly as they were', () => {
    expect(readRow(lookalike)).toEqual(lookalikeRow)
    expect(NEEDS_NO_CHECK in dataOf(lookalike)).toBe(false)
    expect(readRow(after.run)).toEqual(afterRow)
    expect(first.secretaryRuns.alreadyHeldIt).toBe(1)
  })

  it('changes nothing on a second run', () => {
    const rows = { before: readRow(before.run), after: readRow(after.run), lookalike: readRow(lookalike) }
    const counts = { records: count('records'), changes: count('changes'), revisions: count('revisions') }
    const second = migrateInPlace(t.client.sqlite)
    expect(second.secretaryRuns.written).toBe(0)
    expect(second.secretaryRuns.marked).toEqual([])
    expect(second.secretaryRuns.alreadyHeldIt).toBe(2)
    expect({ before: readRow(before.run), after: readRow(after.run), lookalike: readRow(lookalike) }).toEqual(rows)
    expect({ records: count('records'), changes: count('changes'), revisions: count('revisions') }).toEqual(counts)
  })
})
