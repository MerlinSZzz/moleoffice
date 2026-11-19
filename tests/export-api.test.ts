// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EXPORT OVER HTTP: what `GET /api/export` promises and whether `POST /api/export` does it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS AND IS NOT CHECKED HERE
 * ---------------------------------------------------------------------------------------
 *
 * tests/server-wiring.test.ts already proves both endpoints are registered, reachable, and
 * described in `GET /api` — it reads the route groups off disk and compares them against the app,
 * so nothing here needs to retype a list. This file checks the two things that file cannot: that
 * the reply is true, and that the endpoint does what its own sentence says.
 *
 * The format itself is tests/export-format.test.ts. The mirror is tests/export-mirror.test.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE EXPORT ROOT IS MOVED BEFORE ANYTHING IS POSTED
 * ---------------------------------------------------------------------------------------
 *
 * `POST /api/export` deliberately takes no destination: a path in a request body would be a
 * loopback page able to write files anywhere this process can reach. So it writes to
 * `exportRoot()`, which is `<repo>/data/mirror` — a real directory a person may have a real mirror
 * in. `useExportRoot` points this process at a throwaway directory instead, the same way
 * `useOsProbe` points the resource ledger at a fake machine.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { ARCHIVED_TABLES, DERIVED_TABLES, everyPartTable } from '../src/server/db/schema.ts'

let t: TestDb
let app: FastifyInstance
let root: string
let moduleId: string

const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

/**
 * EVERY TABLE AN ARCHIVE CARRIES, read from the schema rather than retyped.
 *
 * The authored tables in schema.ts less the ones no backup or export carries, then every table a
 * schema part declares for an archive. A part table is authored work too, and a list that named
 * only the tables of schema.ts would call a new part table's absence correct.
 */
const EXPORTED_TABLES: readonly string[] = [
  ...ARCHIVED_TABLES,
  ...everyPartTable()
    .filter((table) => table.says.exported)
    .map((table) => table.name),
]

interface ExportPreview {
  format: string
  root: string
  wouldWrite: { files: number; bytes: number }
  counts: Record<string, number>
  notExported: string[]
  mirror: { root: string; exists: boolean; isRepository: boolean }
  notes: string[]
  committing: string
}

interface ExportResult extends ExportPreview {
  ok: true
  files: number
  bytes: number
  written: string[]
  removed: string[]
  unchanged: number
  tables: { exported: string[]; rebuiltByScanning: string[] }
}

beforeAll(async () => {
  t = await freshDb()
  root = mkdtempSync(join(tmpdir(), 'mole-office-export-api-'))
  const lib = await import('../src/server/lib/export.ts')
  lib.useExportRoot(root)

  const module = t.api.createRecord({ workspaceId: 'default',
    kind: 'module',
    title: '夹具标定',
    summary: '把 effort 值标定成实际夹持力',
    data: { context: 'The gripper calibration.', parts: [] },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  })
  moduleId = module.id

  const built = await apiApp()
  app = built.app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  rmSync(root, { recursive: true, force: true })
  t.close()
})

async function get(): Promise<ExportPreview> {
  const reply = await app.inject({ method: 'GET', url: '/api/export' })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return JSON.parse(reply.body) as ExportPreview
}

async function post(): Promise<ExportResult> {
  const reply = await app.inject({ method: 'POST', url: '/api/export', headers: HUMAN })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return JSON.parse(reply.body) as ExportResult
}

// ================================================================================ GET

describe('GET /api/export says what an export would contain, and writes nothing', () => {
  it('answers with the format, the destination and a count for every table an export carries', () => {
    return get().then((body) => {
      expect(body.format).toBe('mole-office-export/2')
      expect(body.root).toBe(root)
      for (const table of EXPORTED_TABLES) {
        expect(Object.keys(body.counts), `${table} is not counted`).toContain(table)
      }
      expect(body.counts['records']).toBeGreaterThan(0)
      expect(body.wouldWrite.files).toBeGreaterThan(0)
      expect(body.wouldWrite.bytes).toBeGreaterThan(0)
    })
  })

  it('names the tables it will not export, so an absence is a decision and not a gap', async () => {
    const body = await get()
    expect([...body.notExported].sort()).toEqual([...DERIVED_TABLES].sort())
  })

  it('writes nothing at all', async () => {
    // A "preview" that wrote files would be the worst kind of surprise: a GET with a side effect
    // on somebody's mirror.
    rmSync(root, { recursive: true, force: true })
    await get()
    expect(existsSync(root)).toBe(false)
  })

  it('says the mirror is not a repository when it is not one', async () => {
    const body = await get()
    expect(body.mirror.root).toBe(root)
    expect(body.mirror.isRepository).toBe(false)
  })

  it('says on every reply that it does not commit, and how to', async () => {
    // The endpoint does half of what the roadmap row asks for, and the half it does not do is
    // named in the reply rather than left for somebody to discover from an empty git log.
    const body = await get()
    expect(body.committing).toContain('never commits them')
    expect(body.committing).toContain('npx tsx scripts/export.ts')
  })
})

// ================================================================================ POST

describe('POST /api/export writes the export', () => {
  it('writes the files, and the record with a Chinese title is one of them', async () => {
    const body = await post()
    expect(body.ok).toBe(true)
    expect(body.root).toBe(root)
    expect(body.written).toContain(`records/module/${moduleId}.md`)
    expect(readFileSync(join(root, 'records', 'module', `${moduleId}.md`), 'utf8')).toContain('夹具标定')
    expect(readFileSync(join(root, 'MANIFEST.md'), 'utf8')).toContain('mole-office-export/2')
  })

  it('reports the two lists a caller acts on: what changed, and what it removed', async () => {
    const second = await post()
    // Nothing changed between the two calls, so nothing was rewritten. An export that reported
    // every file as written would report a change nobody made, and the mirror's commit message is
    // built from exactly this list.
    expect(second.written).toEqual([])
    expect(second.removed).toEqual([])
    expect(second.unchanged).toBe(second.files)
  })

  it('separates the tables it exported from the tables a scan rebuilds', async () => {
    const body = await post()
    expect([...body.tables.exported].sort()).toEqual([...EXPORTED_TABLES].sort())
    expect([...body.tables.rebuiltByScanning].sort()).toEqual([...DERIVED_TABLES].sort())
  })

  it('takes no body, and is not refused for being sent one that is empty', async () => {
    // A fetch wrapper with one shared headers object sends `content-type: application/json` with
    // nothing after it. That used to be a 400 naming neither Mole Office nor the endpoint.
    const reply = await app.inject({
      method: 'POST',
      url: '/api/export',
      headers: { ...HUMAN, 'content-type': 'application/json' },
      payload: '',
    })
    expect(reply.statusCode).toBe(200)
  })

  it('shows up in what GET says next time, which is how the two stay honest about each other', async () => {
    await post()
    const preview = await get()
    expect(preview.mirror.exists).toBe(true)
    // GET builds the whole export to answer, so its file count is the count POST just wrote rather
    // than a number worked out a different way.
    const written = await post()
    expect(preview.wouldWrite.files).toBe(written.files)
  })
})

// ================================================================================ hygiene

describe('the endpoint never wrote into the repository', () => {
  it('exported to a temporary directory, not to the default mirror', () => {
    // `POST /api/export` takes no destination on purpose, so a test that had not moved the root
    // would have written several hundred files into the repository's own data/mirror.
    expect(root).toContain(tmpdir())
    expect(process.env.MOLE_OFFICE_DB).toBe(t.file)
    expect(t.file).toContain(tmpdir())
  })
})
