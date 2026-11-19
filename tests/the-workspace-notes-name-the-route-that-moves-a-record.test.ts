// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NOTES ON `unassigned` AND `general` NAME A ROUTE THAT REALLY MOVES A RECORD. Problem JwtgCLiccj7N.
 *
 * `GET /api/workspaces` is one of the first reads an agent makes, and it serves each project's note.
 * The notes the workspace migration wrote on the two catch-all projects said to move a record with
 * `PATCH /api/records/:id`, and PATCH refuses the move with a 400. The notes now name
 * `POST /api/records/:id/workspace`, built from the same constant the route is registered with.
 *
 * WHAT IS CHECKED.
 *   1. Over HTTP, each of the two notes names one request, and following that request moves a record
 *      out of that project. The test reads the method, the path and the body out of the sentence, so
 *      a note naming a route that refuses the move fails here however it is worded.
 *   2. The repair of rows that already hold the old words, which nothing runs by itself: a dry run
 *      writes nothing, `--do-it`'s path rewrites only a note that is the old words exactly, and a
 *      second run changes nothing.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url))

const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code/a-worker',
}

/** The one request a note names: its method, its path, and the JSON body written after it, if any. */
function theRequestIn(note: string): { method: string; path: string; body: Record<string, unknown> | null } {
  const found = /\b(GET|POST|PUT|PATCH|DELETE) (\/api\/[^\s]+)(?: (\{[^}]*\}))?/.exec(note)
  if (found === null) throw new Error(`this note names no request: ${note}`)
  const [, method, path, body] = found
  return { method: method as string, path: path as string, body: body === undefined ? null : (JSON.parse(body) as Record<string, unknown>) }
}

// ================================================================ what GET /api/workspaces serves

describe('the note on each catch-all project names a request that moves a record out of it', () => {
  let t: TestDb
  let app: FastifyInstance
  let unplaced: string

  beforeAll(async () => {
    t = await freshDb()
    // THE STATE THE OWNER'S OFFICE IS IN, made the way it was made: a measurement that could not
    // place one record puts it in `unassigned`, which establishes `unassigned` and `general` with
    // the notes the migration writes.
    const probe = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'A note nobody could place',
      data: {},
      actor: { type: 'agent', id: 'claude-code/a-worker' },
    }).id
    const { migrateWorkspaces } = await import('../src/server/db/workspace-migration.ts')
    const report = migrateWorkspaces(t.client.sqlite, {
      measurement: [{ id: probe, workspace: 'unassigned', by: 'nothing', kind: 'note', title: 'A note nobody could place' }],
    })
    expect(report.established).toEqual(expect.arrayContaining(['unassigned', 'general']))
    app = (await apiApp()).app
    await app.ready()
    // A LONGER WAIT THAN THE DEFAULT 10 SECONDS. The first test of the file imports the whole
    // server cold, and on 30 September 2026 that took more than 10 seconds on a busy sandbox.
  }, 60_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  beforeEach(() => {
    unplaced = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'A note nobody could place',
      data: {},
      actor: { type: 'agent', id: 'claude-code/a-worker' },
    }).id
    // THE PLACE THE MIGRATION WOULD HAVE PUT IT, written straight at the table: one record kept in
    // the catch-all project this case is about.
    t.client.sqlite.prepare("UPDATE records SET workspace_id = 'unassigned' WHERE id = ?").run(unplaced)
  })

  const noteOf = async (id: string): Promise<string> => {
    const res = await app.inject({ method: 'GET', url: '/api/workspaces', headers: AS_AGENT })
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    const row = (res.json() as { workspaces: { id: string; note: string | null }[] }).workspaces.find((one) => one.id === id)
    expect(row, `GET /api/workspaces has no row "${id}"`).toBeDefined()
    return row?.note ?? ''
  }

  const whereIs = (id: string): string =>
    (t.client.sqlite.prepare('SELECT workspace_id AS w FROM records WHERE id = ?').get(id) as { w: string }).w

  it('on Unassigned: following the sentence moves the record into another project', async () => {
    const note = await noteOf('unassigned')
    expect(note).not.toContain('PATCH /api/records/:id')
    const asked = theRequestIn(note)
    expect(asked.body, `the note names no body to send: ${note}`).not.toBeNull()
    // The body is sent as the note writes it, with its one placeholder filled in.
    const body = JSON.parse(JSON.stringify(asked.body).replace('<project id>', 'general')) as Record<string, unknown>
    const res = await app.inject({
      method: asked.method as 'POST',
      url: asked.path.replace(':id', unplaced),
      headers: { ...AS_AGENT, 'x-mole-office-workspace': 'unassigned' },
      payload: body,
    })
    expect(res.statusCode, `${asked.method} ${asked.path}: ${res.body.slice(0, 300)}`).toBe(200)
    expect(whereIs(unplaced)).toBe('general')
  })

  it('on General: the route it names moves a record out of General as well', async () => {
    // Put the record in General first, written straight into the table: it has no links, change
    // rows in General are not what this test is about, and the move under test comes after.
    t.client.sqlite.prepare("UPDATE records SET workspace_id = 'general' WHERE id = ?").run(unplaced)
    const note = await noteOf('general')
    expect(note).not.toContain('PATCH /api/records/:id')
    const asked = theRequestIn(note)
    const res = await app.inject({
      method: asked.method as 'POST',
      url: asked.path.replace(':id', unplaced),
      headers: { ...AS_AGENT, 'x-mole-office-workspace': 'general' },
      payload: { to: 'default' },
    })
    expect(res.statusCode, `${asked.method} ${asked.path}: ${res.body.slice(0, 300)}`).toBe(200)
    expect(whereIs(unplaced)).toBe('default')
  })
})

// ================================================================ the rows that already hold the old words

/** The two old notes, word for word, as the owner's office stores them today. */
const OLD_UNASSIGNED =
  'Records no measurement could place: nothing said which project they belong to, or two lines of evidence ' +
  'said different things. They are here rather than in a project because assigning them would have been a ' +
  'guess. Move one with PATCH /api/records/:id once somebody knows.'
const OLD_GENERAL =
  'Work that is deliberately miscellaneous: small, real and not worth a project of its own. It is different ' +
  'from Unassigned, which holds records whose proper home nobody has decided yet. This project starts empty ' +
  'and stays empty until somebody files something into it on purpose, with PATCH /api/records/:id or the ' +
  "move panel on a record. Established beside Unassigned by the owner's decision AtiSHfG00BVV of " +
  '16 August 2026.'

describe('the repair of the stored notes, which nothing runs by itself', () => {
  let dir: string
  let db: Database.Database

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mole-office-notes-'))
    db = new Database(join(dir, 'panelx.db'))
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    migrateInPlace(db, MIGRATIONS)
    const put = db.prepare(
      "INSERT INTO workspaces (id, title, note, created_at, updated_at) VALUES (?, ?, ?, '2026-08-12 01:44:45', '2026-08-12 01:44:45')",
    )
    put.run('unassigned', 'Unassigned', OLD_UNASSIGNED)
    put.run('general', 'General', OLD_GENERAL)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const noteOf = (id: string): string | null =>
    (db.prepare('SELECT note FROM workspaces WHERE id = ?').get(id) as { note: string | null }).note

  it('writes nothing on a dry run, and says which rows it would rewrite', async () => {
    const { repairTheNotesThatNamedPatch } = await import('../src/server/db/workspace-migration.ts')
    const found = repairTheNotesThatNamedPatch(db, false)
    expect(found).toEqual([
      { id: 'unassigned', found: 'rewritten' },
      { id: 'general', found: 'rewritten' },
    ])
    expect(noteOf('unassigned')).toBe(OLD_UNASSIGNED)
    expect(noteOf('general')).toBe(OLD_GENERAL)
  })

  it('rewrites both old notes to name the route that moves a record, and a second run changes nothing', async () => {
    const { repairTheNotesThatNamedPatch } = await import('../src/server/db/workspace-migration.ts')
    repairTheNotesThatNamedPatch(db, true)
    for (const id of ['unassigned', 'general']) {
      expect(noteOf(id)).not.toContain('PATCH /api/records/:id')
      expect(noteOf(id)).toContain('POST /api/records/:id/workspace')
    }
    expect(repairTheNotesThatNamedPatch(db, true)).toEqual([
      { id: 'unassigned', found: 'current' },
      { id: 'general', found: 'current' },
    ])
  })

  it('leaves a note somebody changed, even when it still names PATCH', async () => {
    const edited = `${OLD_UNASSIGNED} Ask ${THE_TEST_OFFICES_OWNER.name} first.`
    db.prepare("UPDATE workspaces SET note = ? WHERE id = 'unassigned'").run(edited)
    db.prepare("UPDATE workspaces SET note = 'Odds and ends.' WHERE id = 'general'").run()
    const { repairTheNotesThatNamedPatch } = await import('../src/server/db/workspace-migration.ts')
    expect(repairTheNotesThatNamedPatch(db, true)).toEqual([
      { id: 'unassigned', found: 'left' },
      { id: 'general', found: 'other' },
    ])
    expect(noteOf('unassigned')).toBe(edited)
    expect(noteOf('general')).toBe('Odds and ends.')
  })
})
