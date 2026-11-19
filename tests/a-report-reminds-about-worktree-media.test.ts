// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Report writes keep their media blocks and remind about files that will leave with a local worktree. */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { SummaryBlock } from '../src/shared/types.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

type Reminder = { code: string; blocks: { id: string; type: string; path: string; folder: string }[]; says: string }
type Write = { record: { id: string }; reportFileReminder?: Reminder }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64')
let t: TestDb
let app: FastifyInstance
let home: string
let sandboxes: string
let worktrees: string
let folders: typeof import('../src/config/sandbox-folder.mjs')
let previous: Record<string, string | undefined>

beforeAll(() => {
  previous = { HOME: process.env['HOME'], TMPDIR: process.env['TMPDIR'], MOLE_OFFICE_PREVIEW_ROOTS: process.env['MOLE_OFFICE_PREVIEW_ROOTS'] }
  home = mkdtempSync(join(tmpdir(), 'mole-office-picture-home-'))
  process.env['HOME'] = home
  // Put this test's database and stored files inside a sandbox, so the exemption is measured there too.
  const databaseRoot = join(home, '.cache', 'mole-office', 'sandboxes', 'picture-test', 'database')
  mkdirSync(databaseRoot, { recursive: true })
  process.env['TMPDIR'] = databaseRoot
})

beforeAll(async () => {
  t = await freshDb()
  folders = await import('../src/config/sandbox-folder.mjs')
  sandboxes = folders.SANDBOXES_FOLDER
  worktrees = folders.WORKTREES_FOLDER
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = dirname(t.file)
  app = (await apiApp()).app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(home, { recursive: true, force: true })
})

function image(id: string, path: string): SummaryBlock { return { id, type: 'image', path, alt: 'A stand-in picture' } }
function video(id: string, path: string): SummaryBlock { return { id, type: 'video', path, name: 'clip.mp4', size: 4, hash: '0123456789abcdef', alt: 'A stand-in film' } }
function risky(name = 'shot.png'): string { return join(sandboxes, 'stand-in', 'worktrees', 'a-worker', name) }

async function create(blocks: SummaryBlock[]): Promise<Write> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', payload: { kind: 'report', title: 'Pictures from a stand-in run', data: { blocks } } })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as Write
}

async function patch(id: string, blocks: SummaryBlock[]): Promise<Write> {
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, payload: { dataPatch: { blocks } } })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Write
}

async function kept(id: string, blocks: SummaryBlock[]): Promise<void> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${id}` })
  expect(read.statusCode, read.body).toBe(200)
  expect((read.json() as { record: { data: { blocks: SummaryBlock[] } } }).record.data.blocks).toEqual(blocks)
}

it('names local image, nested video and deeply nested audio blocks in the create reminder', async () => {
  const audio = { id: 'deep-audio', type: 'audio', path: risky('voice.wav'), name: 'voice.wav', size: 4, hash: '0123456789abcdef', alt: 'A stand-in sound' } as const
  const blocks: SummaryBlock[] = [
    { id: 'columns', type: 'columns', columns: [[{ id: 'grid', type: 'grid', blocks: [image('shot', risky())] }], [{ id: 'column-words', type: 'text', text: 'A stand-in picture.' }]] },
    { id: 'section', type: 'section', blocks: [video('film', risky('clip.mp4'))] },
    { id: 'sound-section', type: 'section', blocks: [{ id: 'box', type: 'box', blocks: [audio, { id: 'question', type: 'fillin', asks: 'What does the stand-in sound say?' }] }] },
    { id: 'tabs', type: 'tabs', tabs: [{ id: 'panel', label: 'Picture', blocks: [image('tab-shot', risky('tab.png'))] }, { id: 'other-panel', label: 'Words', blocks: [{ id: 'tab-words', type: 'text', text: 'Another stand-in part.' }] }] },
    { id: 'row', type: 'beside', parts: [{ id: 'left', blocks: [image('row-shot', risky('row.png'))] }, { id: 'right', blocks: [{ id: 'words', type: 'text', text: 'A stand-in picture.' }] }] },
    { id: 'remote-shot', type: 'image', path: risky('remote.png'), machine: 'another-machine', alt: 'On another machine' },
    { id: 'a-file', type: 'file', path: risky('source.txt'), name: 'source.txt', size: 4, hash: '0123456789abcdef' },
  ]
  const wrote = await create(blocks)
  expect(wrote.reportFileReminder).toMatchObject({ code: 'reportFileInWorktree', blocks: [
    { id: 'shot', type: 'image', path: risky(), folder: 'sandboxes' },
    { id: 'film', type: 'video', path: risky('clip.mp4'), folder: 'sandboxes' },
    { id: 'deep-audio', type: 'audio', path: audio.path, folder: 'sandboxes' },
    { id: 'tab-shot', type: 'image', path: risky('tab.png'), folder: 'sandboxes' },
    { id: 'row-shot', type: 'image', path: risky('row.png'), folder: 'sandboxes' },
  ] })
  const says = wrote.reportFileReminder!.says
  for (const id of ['shot', 'film', 'deep-audio', 'tab-shot', 'row-shot']) expect(says).toContain(id)
  expect(says).toContain('sandbox')
  expect(says).toContain('goes when that folder goes')
  expect(says).toContain('POST /api/report-files')
  expect(says).toContain('path, name, size and hash')
  await kept(wrote.record.id, blocks)
})

it('a PATCH adding a video inside a section names that block in its reminder', async () => {
  const wrote = await create([image('safe', join(home, 'shot.png'))])
  expect(wrote.reportFileReminder).toBeUndefined()
  const blocks: SummaryBlock[] = [{ id: 'section', type: 'section', blocks: [video('added-film', risky('added.mp4'))] }]
  const changed = await patch(wrote.record.id, blocks)
  expect(changed.reportFileReminder?.blocks).toEqual([{ id: 'added-film', type: 'video', path: risky('added.mp4'), folder: 'sandboxes' }])
  expect(changed.reportFileReminder?.says).toContain('added-film')
  await kept(wrote.record.id, blocks)
})

it('a stored report picture gets no reminder even when its database is inside a sandbox', async () => {
  const upload = await app.inject({ method: 'POST', url: '/api/report-files', payload: { bytes: PNG.toString('base64'), name: 'stored.png' } })
  expect(upload.statusCode, upload.body).toBe(201)
  const file = (upload.json() as { file: { path: string; name: string; size: number; hash: string } }).file
  expect(file.path.startsWith(sandboxes + '/')).toBe(true)
  const blocks: SummaryBlock[] = [image('stored-shot', file.path)]
  const wrote = await create(blocks)
  expect(wrote.reportFileReminder).toBeUndefined()
  await kept(wrote.record.id, blocks)
  const changed = await patch(wrote.record.id, blocks)
  expect(changed.reportFileReminder).toBeUndefined()
  await kept(wrote.record.id, blocks)
})

it('POST and PATCH keep every block exactly as sent with and without a reminder', async () => {
  for (const path of [risky(), join(home, 'elsewhere', 'shot.png')]) {
    const first = [image('kept-picture', path)]
    const wrote = await create(first)
    await kept(wrote.record.id, first)
    const next: SummaryBlock[] = [...first, { id: 'kept-section', type: 'section', blocks: [video('kept-film', path.replace('shot.png', 'clip.mp4'))] }]
    await patch(wrote.record.id, next)
    await kept(wrote.record.id, next)
  }
})

it('uses the declared worktrees folder and leaves outside paths without a reminder', async () => {
  expect(worktrees).toBe(join(home, '.cache', 'mole-office', 'worktrees'))
  expect(folders.theWorktreesFolder(home)).toBe(worktrees)
  const path = join(worktrees, 'stand-in', 'shot.png')
  const wrote = await create([image('worktree-shot', path)])
  expect(wrote.reportFileReminder?.blocks).toEqual([{ id: 'worktree-shot', type: 'image', path, folder: 'worktrees' }])
  await kept(wrote.record.id, [image('worktree-shot', path)])
  for (const outside of [join(home, 'elsewhere', 'stand-in', 'shot.png'), join(worktrees + '-beside', 'stand-in', 'shot.png'), join(sandboxes + '-beside', 'stand-in', 'shot.png')]) {
    const blocks = [image('outside-shot', outside)]
    const other = await create(blocks)
    expect(other.reportFileReminder).toBeUndefined()
    await kept(other.record.id, blocks)
  }
})
