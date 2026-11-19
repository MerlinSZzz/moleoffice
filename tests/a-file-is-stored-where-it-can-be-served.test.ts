// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILE IS STORED WHERE IT CAN BE SERVED, OR THE WRITE IS REFUSED FIRST. Criterion R3.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/file` reads a file only while a live record in this project points at it AND the file
 * sits inside a preview root. So a file stored where no preview root reaches would be accepted,
 * written, pointed at by a report, and impossible to draw — the first invariant broken. Two things
 * are proved here:
 *
 *   1. An installation whose database directory is outside every preview root is REFUSED BEFORE ANY
 *      BYTES ARE WRITTEN, and the refusal names the directory, the roots and the variable that sets
 *      them. Since 20 October 2026 each store beside the database is a built-in root wherever the
 *      database lives, so the one such installation left is one that turned previews off.
 *   2. The file a stored block points at comes back whole through the preview door, and the response
 *      names the record that authorised the read.
 *
 * WHY THE RECORD IS WRITTEN BYPASSING THE GATE. The structural half of the record door lives in
 * src/shared/kinds.ts, which another worker holds tonight; a `file` block reaches it only once that
 * file names the shape. `writeDataBypassingTheGate` is the helper that exists for exactly a state
 * the gate will not yet write, and the read path is what this case is about.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

/** How many characters of the sha256 token this product keeps, from the one declaration. */
const HASH_CHARS = 16

/** The checkout, which is always a preview root, so a root sentence always names one. */
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

type StoreApi = typeof import('../src/server/lib/reportfiles.ts')

let t: TestDb
let store: StoreApi
let app: FastifyInstance
let previousRoots: string | undefined
let rootsForThisFile: string

/** The short sha256 token the product's own `hashOfBytes` produces, written out here to compare. */
function expectedHash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, HASH_CHARS)
}

/** One file block, built from what the store handed back. */
function blockFrom(stored: { path: string; name: string; size: number; hash: string }, id = 'b-file'): Record<string, unknown> {
  return { id, type: 'file', path: stored.path, name: stored.name, size: stored.size, hash: stored.hash }
}

/** The message a refused call threw, or a failure saying it did not throw at all. */
function refusalOf(run: () => unknown): string {
  try {
    run()
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
  throw new Error('expected the call to be refused, but it returned')
}

beforeAll(async () => {
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  t = await freshDb()
  // The database is in a temporary directory of this test's own, so that directory is a preview
  // root. The refusal case below takes it back out again.
  rootsForThisFile = `${CHECKOUT}:${dirname(t.file)}`
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = rootsForThisFile
  store = await import('../src/server/lib/reportfiles.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

beforeEach(() => {
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = rootsForThisFile
})

afterEach(() => {
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a file that could never be served is refused before anything is written', () => {
  it('says the directory, the roots and the variable, and writes nothing', () => {
    // TURN PREVIEWS OFF, so no root reaches report-files/. The store beside the database is a built-in
    // root wherever the database lives, so naming only the checkout no longer leaves it out.
    process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = ''
    const directory = store.reportFileDirectory()
    expect(existsSync(directory)).toBe(false)

    const message = refusalOf(() => store.storeAReportFile(Buffer.from('a file nobody could read'), 'x.txt', 'default'))
    expect(message).toContain(directory)
    expect(message).toContain('MOLE_OFFICE_PREVIEW_ROOTS')
    expect(message).toContain('Nothing was written')
    // What is in force is said: no root at all, because the setting means "preview nothing".
    expect(message).toContain('preview nothing')
    // And it is true when it says nothing was written.
    expect(existsSync(directory)).toBe(false)
  })
})

describe('the file a block points at comes back through the preview door', () => {
  it('stores through POST /api/report-files, then GET /api/file serves the whole file', async () => {
    const bytes = Buffer.from('const answer = 42\n', 'utf8')
    const posted = await app.inject({
      method: 'POST',
      url: '/api/report-files',
      headers: { 'content-type': 'application/json' },
      payload: { bytes: bytes.toString('base64'), name: 'answer.ts' },
    })
    expect(posted.statusCode, posted.body).toBe(201)
    const stored = (posted.json() as { file: { path: string; name: string; size: number; hash: string } }).file
    expect(stored.name).toBe('answer.ts')
    expect(stored.size).toBe(bytes.length)
    expect(stored.hash).toBe(expectedHash(bytes))
    // The name, size and hash came back from the body's bytes and were not read off the caller.
    expect(readFileSync(stored.path)).toEqual(bytes)

    // Nothing points at it yet, so the preview door refuses it — no record grants the read.
    const beforeAnyRecord = await app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(stored.path)}` })
    expect(beforeAnyRecord.statusCode).not.toBe(200)

    // A report whose blocks hold the file block.
    const report = t.api.createRecord({
      workspaceId: 'default',
      kind: 'report',
      title: 'A report carrying its own source',
      data: { blocks: [{ id: 'b-plain', type: 'text', text: 'The source is attached.' }] },
      actor: t.api.HUMAN,
    })
    writeDataBypassingTheGate(t, report.id, { blocks: [blockFrom(stored, 'b-source')] })

    const served: LightMyRequestResponse = await app.inject({
      method: 'GET',
      url: `/api/file?path=${encodeURIComponent(stored.path)}`,
    })
    expect(served.statusCode, served.body).toBe(200)
    expect(Buffer.from(served.rawPayload)).toEqual(bytes)
    // The response answers which record authorised the read, from the record itself.
    expect(served.headers['x-mole-office-record']).toBe(report.id)
  })
})
