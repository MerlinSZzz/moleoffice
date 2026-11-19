// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OFFICE WHOSE DATABASE LIVES OUTSIDE ITS CHECKOUT STILL STORES AND SHOWS ITS FILES.
 *
 * On 20 October 2026 a live office's data folder was moved out of its checkout by
 * tools/stable/move-the-data-folder.mjs. Two things broke. A new upload was refused with 500, because the
 * stores beside the database were inside no preview root. And every file a record stored before
 * the move was gone from the page, because the record still names `<checkout>/data/<store>/<id>`
 * and the bytes are now in `<data folder>/<store>/<id>`.
 *
 * The made-up office here is the shape that broke: freshDb puts the database in a test folder under
 * the temporary directory, so the checkout's own `data/` is not the data folder. Nothing is written
 * under the checkout's `data/`; the old path is only a string on a record, as it is on the live one.
 *
 * CONTROL: on main before the fix, the upload is refused with 500, the old picture is a 404, the
 * unnamed list counts the moved file and named-inside lists no record. The two refusals hold on
 * main too, and they stay true after the fix.
 *
 * MUTATIONS, each made alone and restored:
 *   - builtInClaims in src/server/api/files.ts claims no store: the upload and the roots case fail.
 *   - whereStoredFilesAreNow returns each path unchanged: the old picture, the unnamed list and
 *     named-inside fail.
 *   - the data folder itself is claimed instead of each store: the file beside the database is served.
 *   - named-inside asks about a store's name only for the store's own folder and the data folder, and
 *     not for a folder above them: the case of the folder above the data folder fails (round 72).
 *   - whereStoredFilesAreNow answers a path it cannot place unchanged while the move mark cannot be read:
 *     the unreadable-mark case fails (criterion DF17, round W65).
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { StoredReportFile } from '../src/server/lib/reportfiles.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder, apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

/** The checkout these tests run in, and the data folder it had before anything moved. */
const CHECKOUT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const THE_CHECKOUTS_DATA_FOLDER = join(CHECKOUT, 'data')

const PICTURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 8, 9, 240, 241, 242])
const BESIDE = 'A file that lies loose beside the database, in no store.\n'
const OUTSIDE = 'A file in a folder that is neither the checkout nor the data folder.\n'

/**
 * EACH CASE GETS ITS OWN PROJECT, and the stores beside the database are emptied before each case.
 * The `named-inside` door and the reports it reads are per project; the store folder is one folder
 * for the office, so a file one case wrote is removed before the next case so that the count of
 * files in a store is that case's own.
 */
let WORKSPACE = 'default'
let caseNumber = 0
const PERSON = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let t: TestDb
let app: FastifyInstance
let dataFolder: string
let previousRoots: string | undefined

const THE_STORES = ['report-files', 'message-pictures', 'returned-files'] as const

beforeAll(async () => {
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  t = await freshDb()
  dataFolder = dirname(t.file)
  // A FOLDER THAT HOLDS NOTHING HERE, named so that no setting outside this test decides the roots.
  // The built-in roots are added to whatever the setting names, so this leaves them as they are.
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = aTestDatabaseFolder('aside')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `moved-folder-case-${String(caseNumber)}`
  PERSON['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: `Moved folder case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
  for (const store of THE_STORES) {
    const folder = join(dataFolder, store)
    rmSync(folder, { recursive: true, force: true })
    mkdirSync(folder, { recursive: true })
  }
})

function ask(path: string): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(path)}`, headers: PERSON })
}

/** A report whose data is written as it was before the move, past the write gate, as an imported row is. */
function aReportNaming(path: string, title: string): string {
  const report = t.api.createRecord({
    workspaceId: WORKSPACE, kind: 'report', title,
    data: { blocks: [{ id: 'b-text', type: 'text', text: 'A report.' }] }, actor: t.api.HUMAN,
  })
  writeDataBypassingTheGate(t, report.id, { blocks: [{ id: 'b-picture', type: 'image', path, name: 'picture.png' }] })
  return report.id
}

/** A report picture stored before the move: the bytes in the store's new place, the record naming the old one. */
function aPictureFromBeforeTheMove(): { old: string; now: string; recordId: string } {
  const name = 'Kq3mBefore7x.png'
  const now = join(dataFolder, 'report-files', name)
  mkdirSync(dirname(now), { recursive: true })
  writeFileSync(now, PICTURE)
  const old = join(THE_CHECKOUTS_DATA_FOLDER, 'report-files', name)
  return { old, now, recordId: aReportNaming(old, 'A report written before the data folder moved') }
}

describe('an office whose database lives outside its checkout', () => {
  it('is the shape this file is about: the data folder is not the checkout’s', () => {
    expect(dataFolder.startsWith(`${CHECKOUT}/`)).toBe(false)
    expect(dataFolder).not.toBe(THE_CHECKOUTS_DATA_FOLDER)
  })

  it('shows a picture a record names under the checkout’s data folder, read from where the store is now', async () => {
    const { old, now, recordId } = aPictureFromBeforeTheMove()
    const res = await ask(old)
    expect(res.statusCode, res.body.slice(0, 600)).toBe(200)
    expect(res.rawPayload.equals(PICTURE)).toBe(true)
    expect(res.headers['x-mole-office-record']).toBe(recordId)
    expect(res.headers['x-mole-office-read-from']).toBe(now)
    // The record is not rewritten, and nothing was put under the checkout's data folder.
    expect(t.api.getRecord(recordId)?.data).toEqual({ blocks: [{ id: 'b-picture', type: 'image', path: old, name: 'picture.png' }] })
    expect(existsSync(old)).toBe(false)
  })

  it('stores a new upload beside the database and shows it', async () => {
    const sent = await app.inject({
      method: 'POST', url: '/api/report-files', headers: PERSON,
      payload: { name: 'notes.txt', bytes: Buffer.from('Written after the move.\n').toString('base64') },
    })
    expect(sent.statusCode, sent.body.slice(0, 600)).toBe(201)
    const file = sent.json<{ file: StoredReportFile }>().file
    expect(dirname(file.path)).toBe(join(dataFolder, 'report-files'))
    t.api.createRecord({
      workspaceId: WORKSPACE, kind: 'report', title: 'A report written after the move',
      data: { blocks: [{ id: 'b-file', type: 'file', ...file }] }, actor: t.api.HUMAN,
    })
    const res = await ask(file.path)
    expect(res.statusCode, res.body.slice(0, 600)).toBe(200)
    expect(res.body).toBe('Written after the move.\n')
    expect(res.headers['x-mole-office-read-from']).toBeUndefined()
  })

  it('makes each store beside the database a root, and says where each came from', async () => {
    const { previewRoots } = await import('../src/server/api/files.ts')
    const stores = previewRoots(WORKSPACE).filter((root) => root.source.kind === 'store')
    expect(stores.map((root) => root.configured)).toEqual(
      ['report-files', 'message-pictures', 'returned-files'].map((store) => join(dataFolder, store)),
    )
    expect(stores.map((root) => root.source)).toEqual(
      ['report-files', 'message-pictures', 'returned-files'].map((store) => ({ kind: 'store', store })),
    )
  })

  it('still refuses a file outside the checkout and the stores, and one loose beside the database', async () => {
    const outside = join(aTestDatabaseFolder('outside'), 'elsewhere.txt')
    writeFileSync(outside, OUTSIDE)
    aReportNaming(outside, 'A report naming a file outside every root')
    const far = await ask(outside)
    expect(far.statusCode, far.body.slice(0, 600)).toBe(403)
    expect(far.body).not.toContain(OUTSIDE)
    expect(String(far.json<{ error: string }>().error)).toContain('outside every preview root')

    const beside = join(dataFolder, 'beside-the-database.txt')
    writeFileSync(beside, BESIDE)
    aReportNaming(beside, 'A report naming a file beside the database')
    const near = await ask(beside)
    expect(near.statusCode, near.body.slice(0, 600)).toBe(403)
    expect(near.body).not.toContain(BESIDE)
  })

  it('does not count a moved file as unnamed when a record names its old path', async () => {
    const { now } = aPictureFromBeforeTheMove()
    const { unnamedReportFiles } = await import('../src/server/lib/reportfiles.ts')
    const answer = unnamedReportFiles()
    expect(answer).toMatchObject({ directoryState: 'present', filesExamined: 1, unnamedCount: 0 })
    expect(answer.files.map((file) => file.name)).not.toContain(now.split('/').pop())
  })

  it('names the record that stored a file under the old path when asked about the store’s new folder', async () => {
    const { old, recordId } = aPictureFromBeforeTheMove()
    const folder = join(dataFolder, 'report-files')
    const res = await app.inject({
      method: 'GET', url: `/api/report-files/named-inside?folder=${encodeURIComponent(folder)}`, headers: PERSON,
    })
    expect(res.statusCode, res.body.slice(0, 600)).toBe(200)
    const records = res.json<{ records: { id: string; paths: { where: string; path: string }[] }[] }>().records
    expect(records).toEqual([expect.objectContaining({ id: recordId, paths: [{ where: 'data.blocks[#b-picture].path', path: old }] })])
  })

  it('names the record that stored a file under the old path when asked about the data folder itself', async () => {
    const { old, recordId } = aPictureFromBeforeTheMove()
    const res = await app.inject({
      method: 'GET', url: `/api/report-files/named-inside?folder=${encodeURIComponent(dataFolder)}`, headers: PERSON,
    })
    expect(res.statusCode, res.body.slice(0, 600)).toBe(200)
    const records = res.json<{ records: { id: string; paths: { where: string; path: string }[] }[] }>().records
    expect(records).toEqual([expect.objectContaining({ id: recordId, paths: [{ where: 'data.blocks[#b-picture].path', path: old }] })])
  })

  // The door asks about a store's name only for a folder at or above the store's new place (round 72). The old path
  // holds no segment of a folder above the data folder, so only the store's name finds the record there.
  it('names the record that stored a file under the old path when asked about the folder above the data folder', async () => {
    const { old, recordId } = aPictureFromBeforeTheMove()
    const res = await app.inject({
      method: 'GET', url: `/api/report-files/named-inside?folder=${encodeURIComponent(dirname(dataFolder))}`, headers: PERSON,
    })
    expect(res.statusCode, res.body.slice(0, 600)).toBe(200)
    const records = res.json<{ records: { id: string; paths: { where: string; path: string }[] }[] }>().records
    expect(records).toEqual([expect.objectContaining({ id: recordId, paths: [{ where: 'data.blocks[#b-picture].path', path: old }] })])
  })

  // A folder inside a store is not at or above it, so the door asks about no store's name there. The old path of a file
  // inside that folder holds the folder's last segment as written, and that is what finds the record.
  it('names the record that stored a file under the old path when asked about a folder inside the store', async () => {
    const name = 'Kq3mInside7x.png'
    const folder = join(dataFolder, 'report-files', 'round-72-inside')
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, name), PICTURE)
    const old = join(THE_CHECKOUTS_DATA_FOLDER, 'report-files', 'round-72-inside', name)
    const recordId = aReportNaming(old, 'A report written before the data folder moved, of a file in a folder in the store')
    const res = await app.inject({
      method: 'GET', url: `/api/report-files/named-inside?folder=${encodeURIComponent(folder)}`, headers: PERSON,
    })
    expect(res.statusCode, res.body.slice(0, 600)).toBe(200)
    const records = res.json<{ records: { id: string; paths: { where: string; path: string }[] }[] }>().records
    expect(records).toEqual([expect.objectContaining({ id: recordId, paths: [{ where: 'data.blocks[#b-picture].path', path: old }] })])
  })

  it('reads a path in a store of an earlier data folder from the same store beside the database in use', async () => {
    const { whereStoredFilesAreNow } = await import('../src/server/api/files.ts')
    const earlier = aTestDatabaseFolder('earlier')
    const name = 'Kq3mEarlier7x.png'
    const old = join(earlier, 'report-files', name)
    const read = whereStoredFilesAreNow([earlier])
    expect(read(old)).toBe(join(dataFolder, 'report-files', name))
    expect(read(join(earlier, 'not-a-store', name))).toBe(join(earlier, 'not-a-store', name))
  })

  // THE MARK LISTS THE EARLIER DATA FOLDERS, so while it cannot be read nobody knows them (criterion DF17). A path the
  // folder in use or the default folder places is read as before; any other path may be in an earlier folder, and it
  // is refused with the mark named rather than read from where the record says.
  it('refuses a path it cannot place while the move mark cannot be read, and names the mark', async () => {
    const { whereStoredFilesAreNow } = await import('../src/server/api/files.ts')
    const { theEarlierDataFoldersOfTheMark, theStoredFilesNeedTheMarkWords } = await import('../src/server/api/data-folder.ts')
    const { readTheMoveMark } = await import('../src/config/the-data-folder-move.mjs')
    const mark = join(aTestDatabaseFolder('unreadable-mark'), 'data-folder-move.json')
    writeFileSync(mark, '{ this is not a mark')
    const read = readTheMoveMark(mark)
    expect(read.state).toBe('unreadable')
    const why = read.state === 'unreadable' ? read.why : ''
    const isNow = whereStoredFilesAreNow(theEarlierDataFoldersOfTheMark(mark))
    const name = 'Kq3mUnreadable7x.png'
    expect(isNow(join(dataFolder, 'report-files', name))).toBe(join(dataFolder, 'report-files', name))
    expect(isNow(join(THE_CHECKOUTS_DATA_FOLDER, 'report-files', name))).toBe(join(dataFolder, 'report-files', name))
    let refused: unknown = null
    try {
      isNow(join(aTestDatabaseFolder('earlier-not-known'), 'report-files', name))
    } catch (error) {
      refused = error
    }
    expect(refused).toMatchObject({
      message: theStoredFilesNeedTheMarkWords(mark, why),
      status: 503,
      code: 'dataFolderMarkUnreadable',
      values: { mark, why },
    })
  })
})
