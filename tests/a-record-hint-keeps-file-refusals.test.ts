// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { addressForTheBrowser, previewUrl, whereALinkFetches } from '../src/web/components/SummaryBlocks.tsx'

let office: TestDb
let app: FastifyInstance
let root: string
let previousRoots: string | undefined
const bytes = Buffer.from('made-up picture bytes')
const path = (name: string) => join(root, `${name}.png`)
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'test-reader' }

function insert(id: string, name: string, options: { project?: string; deleted?: boolean; machine?: string; message?: boolean } = {}) {
  const data = { paths: [{ path: path(name), ...(options.machine ? { machine: options.machine } : {}) }], ...(options.message ? { body: 'Private test message', sentBy: { kind: 'agent', id: 'test-writer' }, to: [{ kind: 'agent', id: 'test-recipient' }] } : {}) }
  office.client.sqlite.prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
    VALUES (?, ?, 'owner', '2026-01-01 00:00:00', '2026-01-01 00:00:00', ?, ?, NULL, ?, ?, 'fixture')`)
    .run(id, options.project ?? 'default', options.message ? 'message' : 'note', `Test record ${id}`, JSON.stringify(data), options.deleted ? '2026-01-01 00:00:00' : null)
}

async function ask(name: string, record?: string) {
  return app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(path(name))}${record === undefined ? '' : `&record=${encodeURIComponent(record)}`}`, headers })
}

beforeAll(async () => {
  office = await freshDb()
  root = realpathSync(mkdtempSync(join(tmpdir(), 'file-hint-test-')))
  previousRoots = process.env.MOLE_OFFICE_PREVIEW_ROOTS
  process.env.MOLE_OFFICE_PREVIEW_ROOTS = root
  for (const name of ['live', 'unmentioned', 'deleted', 'remote', 'foreign', 'private', 'mixed']) writeFileSync(path(name), bytes)
  insert('test-live', 'live')
  insert('test-deleted', 'deleted', { deleted: true })
  insert('test-remote', 'remote', { machine: 'another-machine' })
  insert('test-foreign', 'foreign', { project: 'another-project' })
  insert('test-private', 'private', { message: true })
  insert('test-mixed-live', 'mixed')
  insert('test-mixed-deleted', 'mixed', { deleted: true })
  insert('test-mixed-remote', 'mixed', { machine: 'another-machine' })
  const files = await import('../src/server/api/files.ts')
  const http = await import('../src/server/lib/http.ts')
  app = Fastify({ logger: false })
  http.installErrorHandling(app)
  await app.register(files.fileRoutes, { prefix: '/api' })
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app?.close()
  office?.close()
  if (previousRoots === undefined) delete process.env.MOLE_OFFICE_PREVIEW_ROOTS
  else process.env.MOLE_OFFICE_PREVIEW_ROOTS = previousRoots
  if (root) rmSync(root, { recursive: true, force: true })
})

describe('a record hint is an authorization checked on each picture read', () => {
  it('carries the record in every address a report builds for a browser', () => {
    expect(previewUrl('/tmp/a b/picture 1.png', 'made-up-record')).toBe(
      '/api/file?path=%2Ftmp%2Fa%20b%2Fpicture%201.png&record=made-up-record',
    )
    expect(addressForTheBrowser('/tmp/a b/picture 1.png', 'panelx', true, 'made-up-record')).toBe(
      '/api/file?path=%2Ftmp%2Fa%20b%2Fpicture%201.png&record=made-up-record&workspace=panelx&download=1',
    )
    // The page's request may be sent to another origin while it visits another world, so this one is
    // checked by what it says about the file rather than by the prefix.
    expect(whereALinkFetches('/tmp/a b/picture 1.png', true, 'panelx', 'made-up-record')).toContain(
      '&record=made-up-record&workspace=panelx&download=1',
    )
  })

  it('names every accepted query parameter when refusing an unknown one', async () => {
    const response = await app.inject({ method: 'GET', url: `${previewUrl(path('live'))}&unexpected=1`, headers })
    expect(response.statusCode).toBe(400)
    const error = response.json<{ error: string }>().error
    for (const option of ['"path"', '"download=1"', '"open=1"', '"workspace"', '"record"']) {
      expect(error).toContain(option)
    }
  })

  it('serves the named live local reference without the project-wide text search', async () => {
    const sqlite = office.client.sqlite as unknown as { prepare: (sql: string) => unknown }
    const prepare = sqlite.prepare
    let searched = false
    sqlite.prepare = function (this: unknown, sql: string) {
      if (/\binstr\s*\(/i.test(sql)) searched = true
      return prepare.call(this, sql)
    }
    try {
      const response = await app.inject({ method: 'GET', url: previewUrl(path('live'), 'test-live'), headers })
      expect(response.statusCode, response.body).toBe(200)
      expect(response.rawPayload.equals(bytes)).toBe(true)
      expect(response.headers['x-mole-office-record']).toBe('test-live')
      expect(searched).toBe(false)
    } finally {
      sqlite.prepare = prepare
    }
  })

  it.each([
    ['unmentioned', 'test-live', 403],
    ['deleted', 'test-deleted', 403],
    ['remote', 'test-remote', 409],
    ['foreign', 'test-foreign', 403],
    ['private', 'test-private', 403],
  ] as const)('keeps the exact refusal for %s with a hint', async (name, record, status) => {
    const original = await ask(name)
    const hinted = await ask(name, record)
    expect(original.statusCode, original.body).toBe(status)
    expect(hinted.statusCode, hinted.body).toBe(original.statusCode)
    expect(hinted.body).toBe(original.body)
    expect(hinted.rawPayload.includes(bytes)).toBe(false)
  })

  it.each(['test-mixed-live', 'test-mixed-deleted', 'test-mixed-remote'])('keeps the live reference when mixed with other references: %s', async (record) => {
    const original = await ask('mixed')
    const hinted = await ask('mixed', record)
    expect(original.statusCode, original.body).toBe(200)
    expect(hinted.statusCode, hinted.body).toBe(original.statusCode)
    expect(hinted.rawPayload.equals(original.rawPayload)).toBe(true)
    expect(hinted.headers['x-mole-office-record']).toBe('test-mixed-live')
  })
})
