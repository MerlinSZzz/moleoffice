// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The report door's media reminder says what each kind of block takes once its file is stored: an image block its path
 * only, a video or audio block its path, name, size and hash. An image block declares no name, size or hash, so a writer
 * who gave it all four, as the reminder's first words asked, had the whole report write refused with a 400.
 * Mutation: the first words back. Red. The words are English only: their Chinese waits for the translation round
 * so no case here reads Chinese.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import type { SummaryBlock } from '../src/shared/types.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type Write = { record: { id: string }; reportFileReminder?: { says: string } }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64')
let t: TestDb
let app: FastifyInstance
let home: string
let worktrees: string
let previous: Record<string, string | undefined>

beforeAll(() => {
  previous = { HOME: process.env['HOME'], MOLE_OFFICE_PREVIEW_ROOTS: process.env['MOLE_OFFICE_PREVIEW_ROOTS'] }
  home = mkdtempSync(join(tmpdir(), 'mole-office-reminder-home-'))
  process.env['HOME'] = home
})

beforeEach(async () => {
  t = await freshDb()
  worktrees = (await import('../src/config/sandbox-folder.mjs')).WORKTREES_FOLDER
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = dirname(t.file)
  app = (await apiApp()).app
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
})

afterAll(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(home, { recursive: true, force: true })
})

it('tells an image block to take the stored path only, and the image block that follows it is kept', async () => {
  const shot = join(worktrees, 'a-worker', 'shot.png')
  const wrote = await app.inject({ method: 'POST', url: '/api/records', payload: { kind: 'report', title: 'A picture from a stand-in worktree', data: { blocks: [{ id: 'shot', type: 'image', path: shot, alt: 'A stand-in picture' }] } } })
  expect(wrote.statusCode, wrote.body).toBe(201)
  const { record, reportFileReminder } = wrote.json() as Write
  expect(reportFileReminder?.says).toContain("Then point an image block at the stored file's path only")
  expect(reportFileReminder?.says).toContain('a video or audio block at its path, name, size and hash')

  const upload = await app.inject({ method: 'POST', url: '/api/report-files', payload: { bytes: PNG.toString('base64'), name: 'shot.png' } })
  expect(upload.statusCode, upload.body).toBe(201)
  const file = (upload.json() as { file: { path: string; name: string; size: number; hash: string } }).file

  // What the first words asked: the image block refuses name, size and hash, and the whole write with them.
  const allFour = await app.inject({ method: 'PATCH', url: `/api/records/${record.id}`, payload: { dataPatch: { blocks: [{ id: 'shot', type: 'image', ...file, alt: 'A stand-in picture' }] } } })
  expect(allFour.statusCode, allFour.body).toBe(400)
  expect((allFour.json() as { error: string }).error).toContain('unknown key "name"')

  // What the reminder says now: the stored path only. The write is kept and nothing is left to remind about.
  const blocks: SummaryBlock[] = [{ id: 'shot', type: 'image', path: file.path, alt: 'A stand-in picture' }]
  const followed = await app.inject({ method: 'PATCH', url: `/api/records/${record.id}`, payload: { dataPatch: { blocks } } })
  expect(followed.statusCode, followed.body).toBe(200)
  expect((followed.json() as Write).reportFileReminder).toBeUndefined()
  const read = await app.inject({ method: 'GET', url: `/api/records/${record.id}` })
  expect((read.json() as { record: { data: { blocks: SummaryBlock[] } } }).record.data.blocks).toEqual(blocks)
})
