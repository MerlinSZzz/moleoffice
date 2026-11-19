// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A file description follows the same version and privacy rules as the file it describes. */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const owner = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const picture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
let database: TestDb
let app: FastifyInstance
let previousRoots: string | undefined
let folder = ''
let stored = ''
let unknown = ''
let path = ''
let report = ''

async function post(url: string, payload: unknown): Promise<LightMyRequestResponse> {
  const result = await app.inject({ method: 'POST', url, headers: { ...owner, 'content-type': 'application/json' }, payload: payload as never })
  expect(result.statusCode, result.body).toBe(201)
  return result
}

function ask(file: string, query: string, headers: Record<string, string> = owner): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(file)}${query}`, headers })
}

beforeAll(async () => {
  database = await freshDb()
  folder = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-file-description-')))
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = folder
  app = (await apiApp()).app
  await app.ready()
  const image = (await post('/api/report-files', { name: 'made-up.png', bytes: picture.toString('base64') })).json() as { file: { path: string } }
  const other = (await post('/api/report-files', { name: 'made-up.unknown', bytes: picture.toString('base64') })).json() as { file: { path: string; name: string; size: number; hash: string } }
  stored = image.file.path
  unknown = other.file.path
  path = join(folder, 'made-up.png')
  writeFileSync(path, picture)
  report = ((await post('/api/records', { kind: 'report', title: 'Made-up file descriptions', data: { blocks: [
    { id: 'stored', type: 'image', path: stored, alt: 'Made-up stored picture' },
    { id: 'unknown', type: 'file', ...other.file },
    { id: 'path', type: 'image', path, alt: 'Made-up path picture' },
  ] } })).json() as { record: { id: string } }).record.id
}, 120_000)

afterAll(async () => {
  await app?.close()
  database?.close()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  if (folder) rmSync(folder, { recursive: true, force: true })
})

it('uses the file version and reader-specific privacy for a stored description', async () => {
  const bytes = await ask(stored, '&open=1')
  const description = await ask(stored, '&metadata=1')
  expect(description.statusCode, description.body).toBe(200)
  expect(description.headers.etag).toBe(bytes.headers.etag)
  expect(description.json()).toEqual({ type: 'image/png', size: picture.length })
  expect(description.headers['cache-control']).toBe('private, max-age=31536000, immutable')
  expect(String(description.headers.vary)).toBe(String(bytes.headers.vary))
  const held = await ask(stored, '&metadata=1', { ...owner, 'if-none-match': String(description.headers.etag) })
  expect(held.statusCode).toBe(304)
  expect(held.rawPayload.length).toBe(0)
})

it('does not keep or validate a description requested as a save', async () => {
  const description = await ask(stored, '&metadata=1')
  const saved = await ask(stored, '&metadata=1&download=1', { ...owner, 'if-none-match': String(description.headers.etag) })
  expect(saved.statusCode).toBe(200)
  expect(saved.headers['cache-control']).toBe('no-store')
  expect(saved.headers.etag).toBeUndefined()
})

it('does not give an unknown file type a version tag', async () => {
  const description = await ask(unknown, '&metadata=1')
  expect(description.statusCode, description.body).toBe(200)
  expect(description.headers['cache-control']).toBe('no-store')
  expect(description.headers.etag).toBeUndefined()
})

it('gives a recently changed path no tag and later uses the file version', async () => {
  writeFileSync(path, picture)
  const recent = await ask(path, '&metadata=1')
  expect(recent.statusCode, recent.body).toBe(200)
  expect(recent.headers['cache-control']).toBe('no-store')
  expect(recent.headers.etag).toBeUndefined()
  await new Promise((resolve) => setTimeout(resolve, 2_200))
  const bytes = await ask(path, '&open=1')
  const description = await ask(path, '&metadata=1')
  expect(description.headers['cache-control']).toBe('private, max-age=10')
  expect(description.headers.etag).toBe(bytes.headers.etag)
  const held = await ask(path, '&metadata=1', { ...owner, 'if-none-match': String(description.headers.etag) })
  expect(held.statusCode).toBe(304)
  expect(held.rawPayload.length).toBe(0)
}, 30_000)

it('keeps the exact refusal of a description when the named record does not hold the file', async () => {
  const unmentioned = join(folder, 'made-up-unmentioned.png')
  writeFileSync(unmentioned, picture)
  const original = await ask(unmentioned, '&metadata=1')
  const hinted = await ask(unmentioned, `&metadata=1&record=${encodeURIComponent(report)}`)
  expect(original.statusCode, original.body).toBe(403)
  expect(hinted.statusCode, hinted.body).toBe(original.statusCode)
  expect(hinted.body).toBe(original.body)
  expect(hinted.rawPayload.includes(picture)).toBe(false)
})

it('describes a file the same way when the live record holding it is named', async () => {
  const original = await ask(stored, '&metadata=1')
  const hinted = await ask(stored, `&metadata=1&record=${encodeURIComponent(report)}`)
  expect(original.statusCode, original.body).toBe(200)
  expect(hinted.statusCode, hinted.body).toBe(200)
  expect(hinted.json()).toEqual(original.json())
  expect(hinted.headers.etag).toBeDefined()
  expect(hinted.headers.etag).toBe(original.headers.etag)
})
