// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STORED FILE IS KEPT BY THE BROWSER, AND A FILE AT A PATH IS CHECKED BY ITS VERSION.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * What `GET /api/file` tells a browser it may keep, and for whom.
 *
 *   1. A file one of the office's stores named is kept for a year. Each store gives a file a fresh
 *      random name and never writes other bytes under it, so the bytes under that name never change.
 *   2. A file at any other path can change. It is kept ten seconds and has a version tag. Asked
 *      again with that tag, an unchanged file is answered 304 with no bytes.
 *   3. A file changed in the last two seconds has no tag, and is answered as before: no-store.
 *      Its times cannot yet tell two versions apart.
 *   4. A file saved with download=1, and a file of a type a page cannot show, are answered as before:
 *      no-store and no tag.
 *   5. Every kept answer is private and names, in Vary, the request headers that decide who the
 *      reader is. A reader who may not read the file is refused, whatever tag they hold, and so is
 *      any reader once the record that pointed at the file is deleted.
 *   6. A stretch asked with If-Range is sent only while the tag it names is the file's own. Otherwise
 *      the whole file is sent.
 *   7. An If-Range that arrives twice — which Node hands over as one string joined with a comma, and
 *      which the code may receive as an array — names no single version. The whole file is sent.
 *
 * The same answers in a browser, counted, are in
 * tests/a-report-opened-again-asks-nothing-for-its-stored-pictures.test.ts.
 */

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const HERE = 'default'
const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** What a stored file's answer says, and what a file at a path says. Written out, not read from the door. */
const A_YEAR = 'private, max-age=31536000, immutable'
const TEN_SECONDS = 'private, max-age=10'

/** The request headers that decide who the reader is, spelled as they arrive. */
const THE_READERS_HEADERS = [
  'x-mole-office-actor-type',
  'x-mole-office-actor-id',
  'x-mole-office-session',
  'x-mole-office-key',
  'x-mole-office-workspace',
  'cookie',
]

/** A PNG of one pixel, so each store keeps a real picture. */
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const CHART = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7, 6, 5, 4, 3, 2, 1])

let t: TestDb
let app: FastifyInstance
let previousRoots: string | undefined
/** The one folder of paths this file may read, outside every store. */
let paths = ''
const at = (name: string): string => join(paths, name)

/** The picture the report store holds, the picture sent in a message, and a file put by hand in the report store. */
let reportPicture = ''
let messagePicture = ''
let byHand = ''
/** The record pointing at a file, deleted in the last case. */
let withdrawing = ''

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

async function ask(path: string, headers: Record<string, string> = OWNER, query = ''): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(path)}${query}`, headers })
}

async function post(url: string, payload: unknown, headers: Record<string, string>): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'POST', url, headers: { ...headers, 'content-type': 'application/json' }, payload: payload as never })
}

/** Register one agent as the owner, and give back its registry id. */
async function anAgent(handle: string): Promise<string> {
  const made = await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } }, OWNER)
  expect(made.statusCode, made.body).toBe(201)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: OWNER })).json() as { agents?: { id: string; handle: string }[] }
  const row = (listed.agents ?? []).find((one) => one.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} was registered and is not listed`)
  return row.id
}

/** What an answer says about keeping it. */
function keeping(res: LightMyRequestResponse): { status: number; cache: string; tag: string | null; vary: string[] } {
  const tag = res.headers['etag']
  return {
    status: res.statusCode,
    cache: String(res.headers['cache-control']),
    tag: typeof tag === 'string' ? tag : null,
    vary: String(res.headers['vary'] ?? '')
      .split(',')
      .map((one) => one.trim().toLowerCase())
      .filter((one) => one !== ''),
  }
}

/** A kept answer: the rule it is kept by, a tag, and every reader header named in Vary. */
function expectKept(res: LightMyRequestResponse, rule: string): string {
  const said = keeping(res)
  expect(said.status, res.body.slice(0, 300)).toBe(200)
  expect(said.cache).toBe(rule)
  expect(said.tag, 'a kept answer carries a version tag').toMatch(/^"[A-Za-z0-9_-]+"$/)
  for (const name of THE_READERS_HEADERS) expect(said.vary, `Vary names ${name}`).toContain(name)
  return said.tag ?? ''
}

/** Today's answer: kept by nobody, with no tag to ask again with. */
function expectNotKept(res: LightMyRequestResponse): void {
  const said = keeping(res)
  expect(said.cache).toBe('no-store')
  expect(said.tag).toBeNull()
}

beforeAll(async () => {
  t = await freshDb()
  paths = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-kept-files-')))
  // THE STORES BESIDE THE DATABASE ARE PREVIEW ROOTS WHATEVER THIS SAYS, as long as it says something.
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = paths
  app = (await apiApp()).app
  await app.ready()

  // A PICTURE A REPORT CARRIES, in the report store.
  const stored = await post('/api/report-files', { bytes: ONE_PIXEL_PNG, name: 'shot.png' }, OWNER)
  expect(stored.statusCode, stored.body).toBe(201)
  reportPicture = (stored.json() as { file: { path: string } }).file.path
  const store = await import('../src/server/lib/reportfiles.ts')
  byHand = join(store.reportFileDirectory(), 'put-here-by-hand.png')
  writeFileSync(byHand, CHART)

  // A PICTURE SENT IN A MESSAGE TO bo ALONE, which dee may not read.
  await anAgent('ada-writer')
  const bo = await anAgent('bo-reader')
  await anAgent('dee-bystander')
  const terminal = await post('/api/records', { kind: 'session', title: 'bo terminal', data: { state: 'running', runtime: 'claude-code', doing: 'holding' } }, OWNER)
  const session = (terminal.json() as { record: { id: string } }).record.id
  expect((await post('/api/handles/bo-reader/hold', { session, machine: 'a-machine', runtime: 'claude-code' }, OWNER)).statusCode).toBe(201)
  const sent = await post('/api/messages/pictures', { bytes: ONE_PIXEL_PNG }, asAgent('ada-writer'))
  expect(sent.statusCode, sent.body).toBe(201)
  messagePicture = (sent.json() as { picture: { path: string } }).picture.path
  const message = t.api.createRecord({
    kind: 'message',
    title: 'A picture for bo',
    workspaceId: HERE,
    data: { body: 'see the picture', to: [{ kind: 'agent', id: bo }], pictures: [{ id: 'p-1', type: 'image', path: messagePicture, alt: 'One pixel' }] },
    actor: { type: 'agent', id: 'ada-writer' } as never,
  }).id
  // THE COPIES ROUTED UP THE CHAIN ARE TAKEN AWAY, so bo is the one reader of it.
  t.client.sqlite.prepare('DELETE FROM message_delivery WHERE message_id = ? AND recipient_id != ?').run(message, bo)
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(message) as { data: string }
  const data = JSON.parse(row.data) as Record<string, unknown>
  delete data['routed']
  writeDataBypassingTheGate(t, message, data)

  // FILES AT A PATH, outside every store.
  writeFileSync(at('chart.png'), CHART)
  writeFileSync(at('changing.txt'), 'first')
  writeFileSync(at('notes.xyz'), 'bytes of a kind no page shows')
  writeFileSync(at('withdrawn.png'), CHART)

  t.api.createRecord({
    workspaceId: HERE,
    kind: 'module',
    title: 'The files this test asks for',
    data: {
      context: 'A module that points at each file, which is what lets the door read it.',
      parts: [],
      paths: [
        { id: 'shot', label: 'A stored picture', path: reportPicture, kind: 'image' },
        { id: 'by-hand', label: 'A file put by hand in the store', path: byHand, kind: 'image' },
        { id: 'chart', label: 'A picture at a path', path: at('chart.png'), kind: 'image' },
        { id: 'changing', label: 'A file that is changed', path: at('changing.txt'), kind: 'other' },
        { id: 'fresh', label: 'A file written in a case', path: at('fresh.png'), kind: 'image' },
        { id: 'notes', label: 'A file of a kind no page shows', path: at('notes.xyz'), kind: 'other' },
      ],
    },
    actor: t.api.HUMAN,
  })
  withdrawing = t.api.createRecord({
    workspaceId: HERE,
    kind: 'module',
    title: 'The record that is deleted',
    data: {
      context: 'Deleted in the last case.',
      parts: [],
      paths: [{ id: 'withdrawn', label: 'A file whose record is deleted', path: at('withdrawn.png'), kind: 'image' }],
    },
    actor: t.api.HUMAN,
  }).id

  // TWO SECONDS AFTER THE LAST WRITE, so every file above can be given a tag.
  await sleep(2_100)
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  await app?.close()
  t?.close()
  if (paths !== '') rmSync(paths, { recursive: true, force: true })
})

describe('a file a store named is kept for a year, for the reader who asked', () => {
  it('keeps a picture the report store named for a year, privately, and names the reader headers', async () => {
    expectKept(await ask(reportPicture), A_YEAR)
  })

  it('keeps a picture sent in a message for its reader, and refuses another reader whatever tag they hold', async () => {
    const tag = expectKept(await ask(messagePicture, asAgent('bo-reader')), A_YEAR)
    const again = await ask(messagePicture, { ...asAgent('bo-reader'), 'if-none-match': tag })
    expect(again.statusCode).toBe(304)
    expect(again.rawPayload.length).toBe(0)

    const dees = await ask(messagePicture, { ...asAgent('dee-bystander'), 'if-none-match': tag })
    expect(dees.statusCode, dees.body).toBeGreaterThanOrEqual(400)
    expect(dees.headers['etag']).toBeUndefined()
    expect(String(dees.headers['cache-control'] ?? '')).not.toContain('max-age')
  })

  it('checks a file put by hand into a store, under a name no store gives, like a file at a path', async () => {
    expectKept(await ask(byHand), TEN_SECONDS)
  })
})

describe('a file at a path is kept ten seconds and checked again by its tag', () => {
  it('answers 304 with no bytes to a reader holding the tag of an unchanged file', async () => {
    const tag = expectKept(await ask(at('chart.png')), TEN_SECONDS)
    const again = await ask(at('chart.png'), { ...OWNER, 'if-none-match': tag })
    expect(again.statusCode).toBe(304)
    expect(again.rawPayload.length).toBe(0)
    expect(keeping(again).cache).toBe(TEN_SECONDS)
    expect(keeping(again).tag).toBe(tag)
  })

  it(
    'sends a changed file whole, not kept while it is new, and under a new tag two seconds later',
    async () => {
      const first = expectKept(await ask(at('changing.txt')), TEN_SECONDS)
      // THE SAME LENGTH, so only the change itself can tell the two apart.
      writeFileSync(at('changing.txt'), 'other')
      const changed = await ask(at('changing.txt'), { ...OWNER, 'if-none-match': first })
      expect(changed.statusCode).toBe(200)
      expect(changed.body).toBe('other')
      expectNotKept(changed)

      await sleep(2_100)
      const later = await ask(at('changing.txt'), { ...OWNER, 'if-none-match': first })
      expect(later.body).toBe('other')
      const second = expectKept(later, TEN_SECONDS)
      expect(second).not.toBe(first)
    },
    // IT WAITS OUT THE TWO SECONDS ONCE, inside the five every other case here keeps.
    10_000,
  )

  it('answers a file written a moment ago as before, with no-store and no tag', async () => {
    writeFileSync(at('fresh.png'), CHART)
    const res = await ask(at('fresh.png'))
    expect(res.statusCode).toBe(200)
    expectNotKept(res)
  })

  it('sends the stretch asked with If-Range only while the tag it names is the file\'s own', async () => {
    const tag = expectKept(await ask(at('chart.png')), TEN_SECONDS)
    const stretch = await ask(at('chart.png'), { ...OWNER, range: 'bytes=0-3', 'if-range': tag })
    expect(stretch.statusCode).toBe(206)
    expect(stretch.rawPayload).toEqual(CHART.subarray(0, 4))

    const whole = await ask(at('chart.png'), { ...OWNER, range: 'bytes=0-3', 'if-range': '"a-tag-of-another-version"' })
    expect(whole.statusCode).toBe(200)
    expect(whole.rawPayload).toEqual(CHART)
  })

  it('sends the whole file when If-Range arrives twice, as one joined string or as an array', async () => {
    const tag = expectKept(await ask(at('chart.png')), TEN_SECONDS)
    // NODE HANDS DUPLICATES OVER AS ONE STRING JOINED WITH A COMMA, and that string names no one
    // version, so the stretch is not sent.
    const joined = await ask(at('chart.png'), {
      ...OWNER,
      range: 'bytes=0-3',
      'if-range': `${tag}, "a-tag-of-another-version"`,
    })
    expect(joined.statusCode).toBe(200)
    expect(joined.rawPayload).toEqual(CHART)
    expect(joined.headers['content-range']).toBeUndefined()

    // AN ARRAY IS THE OTHER SHAPE THE CODE MAY RECEIVE. However the two values reach the request,
    // together they name no one version, so the whole file is sent.
    const twice = await ask(at('chart.png'), {
      ...OWNER,
      range: 'bytes=0-3',
      'if-range': [tag, '"a-tag-of-another-version"'] as unknown as string,
    })
    expect(twice.statusCode).toBe(200)
    expect(twice.rawPayload).toEqual(CHART)
    expect(twice.headers['content-range']).toBeUndefined()
  })
})

describe('a saved file and a file a page cannot show are answered as before', () => {
  it('sends a saved file whole with no-store and no tag, whatever tag is held', async () => {
    const tag = expectKept(await ask(at('chart.png')), TEN_SECONDS)
    const saved = await ask(at('chart.png'), { ...OWNER, 'if-none-match': tag }, '&download=1')
    expect(saved.statusCode).toBe(200)
    expect(saved.rawPayload).toEqual(CHART)
    expectNotKept(saved)
  })

  it('sends a file of a type no page shows with no-store and no tag', async () => {
    const res = await ask(at('notes.xyz'))
    expect(res.statusCode).toBe(200)
    expectNotKept(res)
  })
})

describe('a withdrawn permission is never answered from a tag', () => {
  it('refuses a reader holding the tag once the record pointing at the file is deleted', async () => {
    const tag = expectKept(await ask(at('withdrawn.png')), TEN_SECONDS)
    t.api.deleteRecord(withdrawing, t.api.HUMAN)
    const res = await ask(at('withdrawn.png'), { ...OWNER, 'if-none-match': tag })
    expect(res.statusCode, res.body).toBe(403)
    expect(res.headers['etag']).toBeUndefined()
  })
})
