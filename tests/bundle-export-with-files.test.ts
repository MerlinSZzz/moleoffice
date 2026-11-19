// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SERVER HALF OF THE ZIP EXPORT.
 *
 * A person exporting a bundle or a task's package may ask for the files the records name as well as
 * the text. This file drives the real doors and reads the zip back: the manifest names both report
 * files with their sizes and hashes, the answer "no" gives the text alone byte for byte, a named
 * file that is gone is listed as missing, a set over the size line says what was left out, and a
 * file holding a key hash never leaves.
 *
 * MUTATIONS. After a green control run: change `> 0` to `> 1` in the key-hash check in
 * src/server/lib/zip-export/related-files.ts, and the key-hash case turns red. Change the missing
 * file's `because` to an empty string, and the missing-file case turns red. Restore each time.
 *
 * THE LINE IS CROSSED BY HANDING `theZipExportOf` A SMALL ONE, as the backup test hands its own
 * tool a small line. The two doors pass the design's own 256 MiB; writing 256 MiB of test files to
 * prove the same branch would cost the machine and prove nothing more.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { entriesOfZip } from './zip-export-read.ts'

const WORKSPACE = 'default'
const PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}
const FIXED = new Date('2026-10-30T20:00:00Z')

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FIXED)
})

afterEach(async () => {
  vi.useRealTimers()
  await app.close()
  t.close()
})

async function post(url: string, payload?: unknown, headers = PERSON): Promise<{ status: number; body: any; raw: Buffer; headers: Record<string, unknown> }> {
  const res = await app.inject({ method: 'POST', url, payload: payload === undefined ? undefined : (payload as object), headers })
  return {
    status: res.statusCode,
    body: res.headers['content-type']?.toString().startsWith('application/zip') === true ? null : res.json(),
    raw: res.rawPayload,
    headers: res.headers,
  }
}

async function upload(name: string, bytes: Buffer): Promise<{ path: string; name: string; size: number; hash: string }> {
  const made = await post('/api/report-files', { name, bytes: bytes.toString('base64') })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.file
}

function fileBlock(id: string, file: { path: string; name: string; size: number; hash: string }): Record<string, unknown> {
  return { id, type: 'file', path: file.path, name: file.name, size: file.size, hash: file.hash }
}

async function aReport(blocks: Record<string, unknown>[]): Promise<string> {
  const made = await post('/api/records', {
    kind: 'report',
    title: 'The bench report',
    summary: 'A made-up report about the bench run, written for this test.',
    data: { blocks, for: 'The person', date: '2026-10-30' },
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id
}

async function aBundle(reportId: string, title = 'Hand this report'): Promise<string> {
  const made = await post('/api/records', {
    kind: 'context_bundle',
    title,
    data: { scope: 'record', scopeRecordId: reportId, preset: 'continue' },
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function manifestOf(raw: Buffer): any {
  const entries = entriesOfZip(raw)
  const manifestEntry = entries.get('manifest.json')
  expect(manifestEntry, 'the zip has no manifest.json').toBeDefined()
  return JSON.parse(manifestEntry!.bytes.toString('utf8')) as any
}

async function storedExports(bundleId: string): Promise<Record<string, any>[]> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${bundleId}`, headers: PERSON })
  const data = (read.json() as { record: { data: Record<string, unknown> } }).record.data
  const list = data['exports']
  return Array.isArray(list) ? (list as Record<string, any>[]) : []
}

describe('the bundle export with the related files', () => {
  it('answers one zip whose manifest names both report files with their hashes', async () => {
    const first = Buffer.from('the first report file\n', 'utf8')
    const second = randomBytes(512)
    const one = await upload('summary.ts', first)
    const two = await upload('plot.png', second)
    const reportId = await aReport([fileBlock('b-one', one), fileBlock('b-two', two)])
    const bundleId = await aBundle(reportId)

    const textAnswer = await post('/api/bundles/export', { bundleId })
    expect(textAnswer.status, JSON.stringify(textAnswer.body)).toBe(200)
    const zipped = await post('/api/bundles/export', { bundleId, withFiles: true })
    expect(zipped.status, JSON.stringify(zipped.body)).toBe(200)
    expect(String(zipped.headers['content-type'])).toContain('application/zip')
    expect(String(zipped.headers['content-disposition'])).toBe('attachment; filename="Hand-this-report-2.zip"')

    const entries = entriesOfZip(zipped.raw)
    expect(entries.get('text.txt')?.bytes.toString('utf8')).toBe(textAnswer.body.text)
    const manifest = manifestOf(zipped.raw)
    expect(manifest.export.title).toBe('Hand this report')
    expect(manifest.export.n).toBe(2)
    expect(manifest.export.line.bytes).toBe(268_435_456)
    expect(manifest.export.line.files).toBe(10_000)
    expect(manifest.text.sha256).toBe(sha256(Buffer.from(textAnswer.body.text, 'utf8')))

    expect(manifest.included).toHaveLength(2)
    for (const [name, bytes] of [['summary.ts', first], ['plot.png', second]] as const) {
      const listed = manifest.included.find((one: any) => one.name === name)
      expect(listed, `${name} is not in the manifest`).toBeDefined()
      expect(listed.bytes).toBe(bytes.length)
      expect(listed.sha256).toBe(sha256(bytes))
      expect(listed.records).toEqual([{ recordId: reportId, recordTitle: 'The bench report' }])
      const stored = name === 'summary.ts' ? one : two
      const inside = entries.get(`files/report-files/${basename(stored.path)}`)
      expect(inside, `${name} is not in the zip`).toBeDefined()
      expect(inside!.bytes.equals(bytes)).toBe(true)
    }
    expect(manifest.missing).toEqual([])
    expect(manifest.leftOut).toEqual([])

    const entry = (await storedExports(bundleId)).at(-1)!
    expect(entry.files.included.map((one: any) => one.name).sort()).toEqual(['plot.png', 'summary.ts'])
    expect(entry.files.zipBytes).toBe(zipped.raw.length)
    expect(entry.files.zipHash).toBe(sha256(zipped.raw))
  })

  it('gives the text alone, byte for byte, when the answer is no', async () => {
    const one = await upload('summary.ts', Buffer.from('one file\n', 'utf8'))
    const reportId = await aReport([fileBlock('b-one', one)])
    const bundleId = await aBundle(reportId)

    const absent = await post('/api/bundles/export', { bundleId })
    const no = await post('/api/bundles/export', { bundleId, withFiles: false })
    expect(absent.status).toBe(200)
    expect(no.status).toBe(200)
    expect(String(absent.headers['content-type'])).toContain('application/json')
    expect(String(no.headers['content-type'])).toContain('application/json')
    expect(no.body.text).toBe(absent.body.text)
    expect(absent.body.export).not.toHaveProperty('files')
    expect(no.body.export).not.toHaveProperty('files')

    const wrong = await post('/api/bundles/export', { bundleId, withFiles: 'yes' })
    expect(wrong.status).toBe(400)
  })

  it('names a file that is no longer on disk as missing, with the record that named it', async () => {
    const kept = await upload('kept.txt', Buffer.from('this one stays\n', 'utf8'))
    const gone = await upload('gone.txt', Buffer.from('this one goes\n', 'utf8'))
    const reportId = await aReport([fileBlock('b-kept', kept), fileBlock('b-gone', gone)])
    const bundleId = await aBundle(reportId)
    rmSync(gone.path, { force: true })

    const zipped = await post('/api/bundles/export', { bundleId, withFiles: true })
    expect(zipped.status, JSON.stringify(zipped.body)).toBe(200)
    const manifest = manifestOf(zipped.raw)
    expect(manifest.included.map((one: any) => one.name)).toEqual(['kept.txt'])
    expect(manifest.missing).toHaveLength(1)
    expect(manifest.missing[0].name).toBe('gone.txt')
    expect(manifest.missing[0].records).toEqual([{ recordId: reportId, recordTitle: 'The bench report' }])
    expect(manifest.missing[0].because).toBe('there is no file at that path on this machine')

    const entry = (await storedExports(bundleId)).at(-1)!
    expect(entry.files.missing).toEqual(manifest.missing)
  })

  it('says what was left out when the set is over the line', async () => {
    const big = await upload('big.txt', Buffer.from('x'.repeat(20), 'utf8'))
    const small = await upload('small.txt', Buffer.from('yyyyy', 'utf8'))
    const reportId = await aReport([fileBlock('b-big', big), fileBlock('b-small', small)])
    const record = t.api.getRecord(reportId)
    expect(record).not.toBeNull()
    const { theZipExportOf } = await import('../src/server/lib/zip-export/related-files.ts')
    const made = theZipExportOf({
      records: [record!],
      text: 'text',
      title: 'Over the line',
      n: 1,
      lineBytes: 10,
      keyHashes: new Set(),
    })
    expect(made.manifest.export.line.bytes).toBe(10)
    expect(made.manifest.included).toEqual([])
    expect(made.manifest.leftOut).toHaveLength(2)
    const [firstLeftOut, secondLeftOut] = made.manifest.leftOut
    expect(firstLeftOut?.name).toBe('big.txt')
    expect(firstLeftOut?.bytes).toBe(20)
    expect(firstLeftOut?.because).toContain('10')
    expect(secondLeftOut?.name).toBe('small.txt')
    expect(secondLeftOut?.because).toContain('after a file')
    expect(made.files.leftOut).toEqual(made.manifest.leftOut)
  })

  it('leaves a file holding a key hash out, and no such hash is anywhere in the zip', async () => {
    const hash = '0123456789abcdef'.repeat(4)
    t.client.sqlite
      .prepare('INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) VALUES (?, ?, ?, ?, ?)')
      .run('made-up-key-row', 'agent', 'made-up-agent', hash, '2026-10-30 20:00:00')
    const tainted = await upload('tainted.txt', Buffer.from(`a made-up key is written here: ${hash}\n`, 'utf8'))
    const clean = await upload('clean.txt', Buffer.from('nothing secret here\n', 'utf8'))
    const reportId = await aReport([fileBlock('b-tainted', tainted), fileBlock('b-clean', clean)])
    const bundleId = await aBundle(reportId)

    const zipped = await post('/api/bundles/export', { bundleId, withFiles: true })
    expect(zipped.status, JSON.stringify(zipped.body)).toBe(200)
    const manifest = manifestOf(zipped.raw)
    expect(manifest.included.map((one: any) => one.name)).toEqual(['clean.txt'])
    expect(manifest.leftOut).toHaveLength(1)
    expect(manifest.leftOut[0].name).toBe('tainted.txt')
    expect(manifest.leftOut[0].because).toContain('key hash')
    for (const [name, entry] of entriesOfZip(zipped.raw)) {
      expect(entry.bytes.includes(Buffer.from(hash)), `${name} holds the key hash`).toBe(false)
    }
    expect(zipped.raw.includes(Buffer.from(hash))).toBe(false)
  })

  it('answers a zip for a task package too, and records the files the same way', async () => {
    const task = await post('/api/records', { kind: 'task', title: 'Fit the wrist camera' })
    expect(task.status, JSON.stringify(task.body)).toBe(201)
    const taskId = task.body.record.id as string
    const packaged = await post(`/api/delegation/${taskId}/package`, {
      moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))],
      forTheOutside: 'Build the module and return a zip holding the source.',
      suits: 'own_module',
      acceptance: 'The source builds and its own test passes.',
      acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' },
    })
    expect(packaged.status, JSON.stringify(packaged.body)).toBe(201)
    const bundleId = packaged.body.bundle.id as string

    const textAnswer = await post(`/api/delegation/${taskId}/export-outside`)
    expect(textAnswer.status, JSON.stringify(textAnswer.body)).toBe(200)
    const zipped = await post(`/api/delegation/${taskId}/export-outside`, { withFiles: true })
    expect(zipped.status, JSON.stringify(zipped.body)).toBe(200)
    expect(String(zipped.headers['content-type'])).toContain('application/zip')
    expect(String(zipped.headers['content-disposition'])).toBe('attachment; filename="Fit-the-wrist-camera-2.zip"')

    const entries = entriesOfZip(zipped.raw)
    expect(entries.get('text.txt')?.bytes.toString('utf8')).toBe(textAnswer.body.text)
    const manifest = manifestOf(zipped.raw)
    expect(manifest.export.title).toBe('Fit the wrist camera')
    expect(Array.isArray(manifest.included)).toBe(true)

    const entry = (await storedExports(bundleId)).at(-1)!
    expect(entry.files.zipHash).toBe(sha256(zipped.raw))
    expect(entry.files).toHaveProperty('included')
  })

  it('never follows a link out of a store, and names the file it left out', async () => {
    const kept = await upload('kept.txt', Buffer.from('this one stays\n', 'utf8'))
    const store = dirname(kept.path)
    const outside = mkdtempSync(join(tmpdir(), 'mole-office-outside-'))
    const secret = join(outside, 'secret.txt')
    writeFileSync(secret, 'this must not leave the building\n')
    // A LINK INSIDE THE STORE, POINTING OUT OF IT. The written path is inside report-files/ and
    // only the file on the far end is outside, which is the shape the old containment check missed.
    const link = join(store, 'link')
    symlinkSync(outside, link, 'dir')
    try {
      const reportId = await aReport([
        fileBlock('b-kept', kept),
        { id: 'b-linked', type: 'file', path: join(link, 'secret.txt'), name: 'secret.txt', size: 33, hash: '0123456789abcdef' },
      ])
      const bundleId = await aBundle(reportId)

      const zipped = await post('/api/bundles/export', { bundleId, withFiles: true })
      expect(zipped.status, JSON.stringify(zipped.body)).toBe(200)
      const manifest = manifestOf(zipped.raw)
      expect(manifest.included.map((one: any) => one.name)).toEqual(['kept.txt'])
      expect(manifest.leftOut).toHaveLength(1)
      expect(manifest.leftOut[0].name).toBe('secret.txt')
      expect(manifest.leftOut[0].because).toContain('link')
      for (const [name] of entriesOfZip(zipped.raw)) {
        expect(name.includes('secret.txt'), `${name} carries the file behind the link`).toBe(false)
      }
      expect(zipped.raw.includes(Buffer.from('this must not leave the building'))).toBe(false)

      const entry = (await storedExports(bundleId)).at(-1)!
      expect(entry.files.leftOut).toEqual(manifest.leftOut)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('names a file it cannot read as missing rather than failing the export', async () => {
    // A KEY HASH IN THE OFFICE makes the search open each file. Without one the search answers zero
    // without opening anything, which would hide the fault this case is about.
    t.client.sqlite
      .prepare('INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) VALUES (?, ?, ?, ?, ?)')
      .run('made-up-key-row-for-reading', 'agent', 'made-up-agent', 'fedcba9876543210'.repeat(4), '2026-10-30 20:00:00')
    const readable = await upload('readable.txt', Buffer.from('readable\n', 'utf8'))
    const unreadable = await upload('unreadable.txt', Buffer.from('this one cannot be read\n', 'utf8'))
    chmodSync(unreadable.path, 0o000)
    try {
      const reportId = await aReport([fileBlock('b-readable', readable), fileBlock('b-unreadable', unreadable)])
      const bundleId = await aBundle(reportId)

      const zipped = await post('/api/bundles/export', { bundleId, withFiles: true })
      expect(zipped.status, JSON.stringify(zipped.body)).toBe(200)
      const manifest = manifestOf(zipped.raw)
      expect(manifest.included.map((one: any) => one.name)).toEqual(['readable.txt'])
      expect(manifest.missing).toHaveLength(1)
      expect(manifest.missing[0].name).toBe('unreadable.txt')
      expect(manifest.missing[0].because).toContain('could not be read')

      const entry = (await storedExports(bundleId)).at(-1)!
      expect(entry.files.missing).toEqual(manifest.missing)
    } finally {
      chmodSync(unreadable.path, 0o644)
    }
  })

  it('keeps the export entry exactly as it was when no files were asked for', async () => {
    const one = await upload('summary.ts', Buffer.from('one file\n', 'utf8'))
    const reportId = await aReport([fileBlock('b-one', one)])
    const bundleId = await aBundle(reportId)
    const answer = await post('/api/bundles/export', { bundleId })
    expect(answer.status).toBe(200)
    const entry = answer.body.export
    expect(Object.keys(entry)).toEqual(['n', 'at', 'by', 'characters', 'bytes', 'textHash', 'carried', 'restrictions', 'leftOut', 'fits'])
  })
})
