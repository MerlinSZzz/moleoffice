// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE IMPORT OVER HTTP AND OVER THE COMMAND LINE — that the safe answer is the easy one to reach,
 * and that a refusal is a refusal all the way out to the caller.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * The library is tested elsewhere: tests/import-roundtrip.test.ts asks whether an archive comes
 * back whole, and tests/import-conflicts.test.ts asks what happens when it cannot. This file asks
 * the questions that are only about the two surfaces:
 *
 *   Does GET really write nothing, and does it show the same plan POST would apply?
 *   Does a refusal reach the caller as a refusal — a 4xx, `applied: false`, and every reason —
 *     rather than as a 200 that a client would read as success?
 *   Does the CLI default to doing nothing, and does it need a word you had to mean?
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE CLI IS TESTED BY ITS OPTION READER AND NOT BY BEING RUN
 * ---------------------------------------------------------------------------------------
 *
 * `scripts/import.ts` runs `main()` only when it was started directly, so importing it under vitest
 * gives the runner's argv and executes nothing. What is worth pinning is the part that decides what
 * the command MEANS — that no flag is ignored, and that writing is never the default — and that is
 * `readOptions`, which is exported for this.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { everyPartTable } from '../src/server/db/every-part-table.ts'
import { readOptions } from '../scripts/import.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type App = Awaited<ReturnType<typeof apiApp>>['app']

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const HEADERS = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

let t: TestDb
let app: App
let root: string
let made = ''

beforeEach(async () => {
  t = await freshDb()
  root = mkdtempSync(join(tmpdir(), 'mole-office-import-api-'))
  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  // The seam `POST /api/export` was given for exactly this: neither endpoint takes a directory from
  // its caller, because a path in a request body would be a loopback page naming any directory this
  // process can read or write.
  exportLib.useExportRoot(root)

  made = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Tray clamp', data: { context: 'the hand' }, actor: HUMAN }).id
  exportLib.writeExport(root)
  app = (await apiApp()).app
})

afterEach(async () => {
  await app.close()
  rmSync(root, { recursive: true, force: true })
  t.close()
})

/** A parsed reply body, with the fields these two endpoints promise. */
interface Body {
  root: string
  ok: boolean
  applied?: boolean
  refusals: { path: string; line: number; problem: string }[]
  notes: string[]
  read: Record<string, number>
  inserts: Record<string, number>
  updates: Record<string, number>
  unchanged: Record<string, number>
  notInArchive: Record<string, number>
  rows: { region: string; key: string; action: string; columns: string[] }[]
  tables?: { imported: string[]; rebuiltByScanning: string[] }
  neverDoes?: string
  error?: string
}

async function get(): Promise<{ status: number; body: Body }> {
  const reply = await app.inject({ method: 'GET', url: '/api/import', headers: HEADERS })
  return { status: reply.statusCode, body: JSON.parse(reply.body) as Body }
}

async function post(): Promise<{ status: number; body: Body }> {
  const reply = await app.inject({ method: 'POST', url: '/api/import', headers: HEADERS, payload: '' })
  return { status: reply.statusCode, body: JSON.parse(reply.body) as Body }
}

// ================================================================================ GET is the dry run

describe('GET /api/import says what would happen and writes nothing', () => {
  it('answers 200 with the plan, naming where it would read from', async () => {
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.root).toBe(root)
    expect(body.ok).toBe(true)
  })

  it('changes not one row, however many times it is asked', async () => {
    const before = t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }
    await get()
    await get()
    const after = t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }
    expect(after.n).toBe(before.n)
  })

  it('shows the same plan the POST would apply, because both come from one function', async () => {
    t.api.patchRecord(made, { data: { context: 'edited since the export' } }, HUMAN)
    const planned = (await get()).body
    // TWO ROWS, AND THE SECOND IS THE ONE A PERSON WOULD NEVER GUESS. Writing the record back leaves
    // its newest revision describing content the record no longer holds, so the import writes one
    // revision saying what it holds after the restore. That row is in the plan for the same reason
    // every other row is: the plan is what somebody reads before anything moves.
    expect(planned.rows.map((r) => `${r.region} ${r.action}`)).toEqual(['records update', 'revisions insert'])
    expect(planned.rows[0]?.key).toBe(made)
    // Not the whole column list: `updatedAt` is a wall-clock stamp to the second, so whether it
    // also moved depends on how fast this test ran. What must hold is that the edit is named.
    expect(planned.rows[0]?.columns).toContain('data')
    const applied = (await post()).body
    expect(applied.rows).toEqual(planned.rows)
  })

  it('names the tables it imports and the ones a scan rebuilds, on every reply', async () => {
    const { body } = await get()
    expect(body.tables?.imported).toContain('session_resources')
    expect(body.tables?.rebuiltByScanning).toContain('source_files')
    // A table absent by decision and a table somebody forgot look identical from the outside.
    expect(body.tables?.imported).not.toContain('source_files')
    // No archive carries panel_layouts, so an import names it nowhere as imported.
    expect(body.tables?.imported).not.toContain('panel_layouts')
  })

  it('names every part table an archive carries, from the declarations', async () => {
    // THE PART TABLES ARE THE SCHEMA PARTS' ANSWER, not a list typed here. An archive carries a part
    // table exactly when its `aPartTable` declaration says so, and the reply must name each one.
    const parts = everyPartTable()
    const carried = parts.filter((table) => table.says.exported).map((table) => table.name)
    expect(carried.length).toBeGreaterThan(0)
    const { body } = await get()
    for (const table of carried) {
      expect(body.tables?.imported, `${table} is carried by an archive and is not named`).toContain(table)
    }
    for (const table of parts.filter((one) => !one.says.exported).map((one) => one.name)) {
      expect(body.tables?.imported, `${table} is carried by no archive and is named`).not.toContain(table)
    }
  })

  it('names every table the import writes, and nothing else', async () => {
    // THE EXPECTED LIST COMES FROM THE DECLARATIONS THE IMPORTER READS, not from a copy of its
    // answer. `EXPORTED_REGIONS` in src/server/lib/export.ts is the archived tables of schema.ts
    // followed by every table a schema part declares for an archive, and that is the list the
    // importer's one write loop reads (src/server/lib/import.ts:1383, applied at :3771). Working it
    // out here from the same declarations means a part table declared for an archive cannot be left
    // out of the reply, and a table no archive carries cannot be added to it.
    const { ARCHIVED_TABLES } = (await import('../src/server/db/schema.ts')) as typeof import('../src/server/db/schema.ts')
    const declared = [
      ...ARCHIVED_TABLES,
      ...everyPartTable()
        .filter((table) => table.says.exported)
        .map((table) => table.name),
    ]
    const { body } = await get()
    expect([...(body.tables?.imported ?? [])].sort()).toEqual([...declared].sort())
  })
})

// ================================================================================ POST applies

describe('POST /api/import applies the archive, or refuses and changes nothing', () => {
  it('applies it and reports what it did', async () => {
    t.api.patchRecord(made, { title: 'Tray clamp, edited since the export' }, HUMAN)
    const { status, body } = await post()
    expect(status).toBe(200)
    expect(body.applied).toBe(true)
    const title = t.client.sqlite.prepare('SELECT title FROM records WHERE id = ?').get(made) as { title: string }
    expect(title.title).toBe('Tray clamp')
  })

  it('takes no body at all, and is not refused for having none', async () => {
    // A `fetch` wrapper with one shared headers object sends a JSON content type and nothing after
    // it, and so does `curl -H 'content-type: application/json' -X POST`.
    const reply = await app.inject({ method: 'POST', url: '/api/import', headers: HEADERS, payload: '' })
    expect(reply.body).not.toContain('Body cannot be empty')
    expect(reply.statusCode).toBe(200)
  })

  it('answers 409 with EVERY reason, and applied: false, when it refuses', async () => {
    // Both halves matter. The status is what a script reads and the field is what a person reads,
    // and a caller that reads one and not the other must not be able to mistake this for success.
    const file = join(root, 'records', 'module', `${made}.md`)
    writeFileSync(file, readFileSync(file, 'utf8').replace('title: "Tray clamp"', 'title: null'), 'utf8')
    const { status, body } = await post()
    expect(status).toBe(409)
    expect(body.applied).toBe(false)
    expect(body.ok).toBe(false)
    expect(body.refusals.length).toBeGreaterThan(0)
    expect(body.error).toContain('nothing was written')
  })

  it('wrote nothing when it refused', async () => {
    const file = join(root, 'records', 'module', `${made}.md`)
    writeFileSync(file, readFileSync(file, 'utf8').replace('"context": "the hand"', '"context": "this must not survive"'), 'utf8')
    writeFileSync(file, readFileSync(file, 'utf8').replace('kind: "module"', 'kind: "module"\nauthor: "nobody"'), 'utf8')
    await post()
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(made) as { data: string }
    expect((JSON.parse(row.data) as { context: string }).context).toBe('the hand')
  })

  it('refuses cleanly when there is no archive beside this database at all', async () => {
    // tests/server-wiring.test.ts sends an empty body to every endpoint that takes one, against a
    // throwaway database whose mirror does not exist. That must be a sentence, not a stack trace,
    // and it must certainly not create anything.
    const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
    exportLib.useExportRoot(join(root, 'a-mirror-nobody-wrote'))
    const { status, body } = await post()
    expect(status).toBe(409)
    expect(body.refusals[0]?.problem).toContain('there is no directory at')
  })
})

// ================================================================================ the CLI

describe('the command line does nothing until it is told to', () => {
  it('defaults to the plan, because an export writes files and an import writes the database', () => {
    expect(readOptions([])).toEqual({ from: null, apply: false, json: false })
  })

  it('applies only when the word is there', () => {
    expect(readOptions(['--apply'])).toEqual({ from: null, apply: true, json: false })
  })

  it('takes a source directory in either spelling', () => {
    expect(readOptions(['--from', '/tmp/x'])).toEqual({ from: '/tmp/x', apply: false, json: false })
    expect(readOptions(['--from=/tmp/x'])).toEqual({ from: '/tmp/x', apply: false, json: false })
  })

  it('refuses an option it does not know rather than ignoring it', () => {
    // An ignored flag is the worst kind: `--dry-run` silently ignored on a command whose default
    // was to write would be a data loss caused by a typo.
    expect(() => readOptions(['--dry-run'])).toThrow('I do not know the option --dry-run')
  })

  it('refuses --from with nothing after it', () => {
    expect(() => readOptions(['--from'])).toThrow('--from needs a directory after it')
    expect(() => readOptions(['--from', '--json'])).toThrow('--from needs a directory after it')
  })

  it('prints the usage rather than doing anything when asked for help', () => {
    const parsed = readOptions(['--help'])
    expect('help' in parsed && parsed.help).toContain('--apply')
    expect('help' in parsed && parsed.help).toContain('all of the archive or none of it')
  })
})
