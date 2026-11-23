// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PICTURES AND A RESIDENT'S FILE ARE SENT FROM THE FILE, AS `GET /api/file` SENDS ONE. Wave 13y round 34, item 1.
 *
 * MEASURED FIRST, on 15 October 2026, with made-up files beside a copy of an office. Each of the three routes read the
 * whole file into memory before it sent a byte, and the server answered nothing else while it read. Through
 * `GET /api/residents/:agentId/space/file`, a made-up picture of 450 MiB took 0.65 to 0.68 s and read 450 MB, and the
 * first ask raised the process's peak memory by 892 MB; 450 MiB of text took 0.88 to 0.90 s, because the whole file was
 * also decoded as UTF-8 to say its type. A HEAD read the whole file as well, and a Range was answered with all of it.
 * `GET /api/portraits/:set/:of/:name` of the largest role portrait (1.38 MB) and `GET /api/assets/:id` of a picture at
 * the 2 MiB upload limit took 5 to 8 ms each, and were read whole the same way.
 *
 * WHAT THIS HOLDS, through the routes:
 *   1. each sends a stream of the file (an `fs.ReadStream`), and not its bytes held in memory, with the bytes and the
 *      headers it sent before: a role portrait whole; its small copy when it is made and when it is kept; somebody's
 *      own JPEG asked for small, which is sent whole and says why; an uploaded picture; and a file in a resident's
 *      space. A drawn picture is still its drawing. A HEAD of each carries the GET's headers and is handed no byte of
 *      the file.
 *   2. a resident's file answers one stretch in bytes with 206, a stretch it has none of with 416, and a Range it does
 *      not read with the whole file.
 *   3. the type a resident's file is sent as is the one the whole-file rule gives: a signature, UTF-8 to the end, a bad
 *      byte at the end, a character cut off at the end, and an empty file. The files are 9 MiB and more, a run of a
 *      9-byte unit of three characters, so that for any piece of a power of two up to 4 MiB that the type might be
 *      read in, one piece's end or the next cuts a character.
 *
 * WHAT IT DOES NOT HOLD. How long a request takes or how much memory it holds; the times are in the round's report.
 * Who may read which file, which tests/a-permanent-resident-has-a-space-of-its-own.test.ts, tests/avatars.test.ts and
 * tests/a-portrait-is-drawn-from-a-small-copy.test.ts hold.
 *
 * WHAT IS GIVEN UP, and said here so it is not found later. A reply sent from a stream carries no version tag, so
 * these three answer no 304 to a request that names one; and the usage recorder writes no
 * byte count for them. A picture is kept by the browser for a year in any case.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, ReadStream, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import type { Response as LightMyRequestResponse } from 'light-my-request'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { typeOfBytes } from '../src/shared/file-signatures.ts'
import { defaultAvatarAssetId } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { portraitAddress, smallPortrait } from '../src/shared/portraits.ts'
import { A_SLEEP_TIME, apiApp, freshDb, type TestDb } from './helpers.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': key,
})
const A_YEAR = 'public, max-age=31536000, immutable'
const SOMEBODY = 'someone-made-up'
/** Three characters, of two, three and four bytes. Of the first two ends of a piece of any power of two bytes, one falls inside a character. */
const UNIT = Buffer.from('é图😀', 'utf8')
const MiB = 1024 * 1024

let t: TestDb
let app: FastifyInstance
let lib: typeof import('../src/server/lib/portraits.ts')
let dataRoot = ''
let space = ''
let resident = ''
/** What each reply handed to Fastify to send, by the order the replies went out. */
const handed: { method: string; url: string; was: string }[] = []

function whatWasHanded(payload: unknown): string {
  if (payload instanceof ReadStream) return 'a stream of the file'
  if (Buffer.isBuffer(payload)) return 'bytes in memory'
  if (typeof payload === 'string') return 'text in memory'
  if (payload instanceof Readable) return 'another stream'
  return typeof payload
}

async function ask(url: string, method: 'GET' | 'HEAD' = 'GET', headers: Record<string, string> = {}): Promise<{ res: LightMyRequestResponse; was: string }> {
  const before = handed.length
  const res = await app.inject({ method, url, headers: { ...AS_THE_PERSON, ...headers } })
  const mine = handed.slice(before).filter((one) => one.url === url && one.method === method)
  expect(mine.length, `${method} ${url}: replies seen`).toBe(1)
  return { res, was: mine[0]!.was }
}

/** The type the route gave before this round, from the whole file: its first bytes, else UTF-8 to the end, else bytes. */
function theWholeFileRule(bytes: Buffer): string {
  const signed = typeOfBytes(bytes)
  if (signed !== null) return signed
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return 'text/plain; charset=utf-8'
  } catch {
    return 'application/octet-stream'
  }
}

/** A file in the resident's space, written straight onto the disk as the resident's own door would leave it. */
function inTheSpace(path: string, bytes: Buffer): Buffer {
  mkdirSync(dirname(join(space, path)), { recursive: true })
  writeFileSync(join(space, path), bytes)
  return bytes
}

const theFile = (path: string): string => `/api/residents/${resident}/space/file?path=${encodeURIComponent(path)}`

/** A GET and a HEAD of one address: the GET sends the file from the file, and the HEAD carries its headers and no byte. */
async function sentFromTheFile(url: string, bytes: Buffer, headers: Record<string, string>): Promise<void> {
  const got = await ask(url)
  expect(got.res.statusCode, got.res.body.slice(0, 300)).toBe(200)
  expect(got.res.rawPayload.equals(bytes), `${url}: the bytes are the file's`).toBe(true)
  for (const [name, value] of Object.entries({ ...headers, 'content-length': String(bytes.length) })) {
    expect(got.res.headers[name], `${url}: ${name}`).toBe(value)
  }
  expect(got.was, `${url}: what was handed to Fastify to send`).toBe('a stream of the file')

  const head = await ask(url, 'HEAD')
  expect(head.res.statusCode, head.res.body.slice(0, 300)).toBe(200)
  expect(head.res.rawPayload.length, `HEAD ${url}: a body`).toBe(0)
  for (const [name, value] of Object.entries({ ...headers, 'content-length': String(bytes.length) })) {
    expect(head.res.headers[name], `HEAD ${url}: ${name}`).toBe(value)
  }
  expect(head.was, `HEAD ${url}: what was handed to Fastify to send`).toBe('another stream')
}

beforeAll(async () => {
  t = await freshDb()
  // SOMEBODY'S OWN PORTRAITS ARE KEPT UNDER THE DATA FOLDER, which for a test is a folder of its own and never the
  // checkout. Mocked after `freshDb`, which empties the module cache, and before the server is built.
  dataRoot = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-pictures-sent-')))
  vi.doMock('../src/config/settings.mjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../src/config/settings.mjs')>()),
    DATA_ROOT: dataRoot,
  }))
  app = (await apiApp()).app
  app.addHook('onSend', async (req, _reply, payload) => {
    handed.push({ method: req.method, url: req.url, was: whatWasHanded(payload) })
    return payload
  })
  await app.ready()
  lib = await import('../src/server/lib/portraits.ts')

  // A RESIDENT, MADE THE WAY ONE IS: a secretary proposes it and it is confirmed by the person.
  const started = async (handle: string, role: string): Promise<{ id: string; key: string }> => {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role } })
    expect(reply.statusCode, reply.body).toBe(201)
    const said = reply.json() as { agent: { id: string }; whatToGiveIt?: { key?: string } }
    return { id: said.agent.id, key: String(said.whatToGiveIt?.key) }
  }
  const secretary = await started('sec-pictures', 'secretary')
  resident = (await started('res-pictures', 'worker')).id
  const proposed = await app.inject({
    method: 'POST', url: '/api/residents/proposals', headers: asAgent('sec-pictures', secretary.key),
    payload: { agentId: 'res-pictures', because: 'It has done steady work here for weeks.', sleepTime: A_SLEEP_TIME },
  })
  expect(proposed.statusCode, proposed.body).toBe(201)
  const confirmed = await app.inject({
    method: 'POST', url: `/api/residents/proposals/${String((proposed.json() as { proposal: { id: string } }).proposal.id)}/confirm`, headers: AS_THE_PERSON,
  })
  expect(confirmed.statusCode, confirmed.body).toBe(200)
  space = join(dirname(t.file), 'personal-spaces', resident)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  vi.doUnmock('../src/config/settings.mjs')
  if (dataRoot !== '') rmSync(dataRoot, { recursive: true, force: true })
})

describe('1: each route sends the file from the file, with the bytes and headers it sent before', () => {
  it('a role portrait, whole', async () => {
    const path = join(lib.portraitDirectory('role', 'administrator'), 'administrator-2.png')
    await sentFromTheFile(portraitAddress('role', 'administrator', 'administrator-2'), readFileSync(path), {
      'content-type': 'image/png', 'cache-control': A_YEAR, 'x-mole-office-picture': 'the whole picture',
    })
  })

  it('its small copy, when it is made and when it is kept', async () => {
    const address = smallPortrait(portraitAddress('role', 'administrator', 'administrator-3'))
    const made = await ask(address)
    expect(made.res.statusCode, made.res.body.slice(0, 300)).toBe(200)
    expect(made.res.headers['x-mole-office-picture']).toBe('a small copy made now, 320 of 1024 pixels wide')
    const folder = join(lib.portraitCopyDirectory(), 'role', 'administrator')
    const copies = readdirSync(folder).filter((name) => name.startsWith('administrator-3.png-'))
    expect(copies, 'the copy kept').toHaveLength(1)
    const copy = readFileSync(join(folder, copies[0]!))
    expect(made.res.rawPayload.equals(copy), 'the copy made now is the copy kept').toBe(true)
    expect(made.res.headers['content-type']).toBe('image/png')
    expect(made.res.headers['cache-control']).toBe(A_YEAR)
    expect(made.res.headers['content-length']).toBe(String(copy.length))
    expect(made.was, 'what was handed to Fastify to send').toBe('a stream of the file')

    await sentFromTheFile(address, copy, { 'content-type': 'image/png', 'cache-control': A_YEAR, 'x-mole-office-picture': 'the kept small copy, 320 pixels wide' })
  })

  it("somebody's own JPEG asked for small, which is sent whole and says why", async () => {
    expect(lib.portraitDirectory('custom', SOMEBODY).startsWith(`${dataRoot}/`), 'the custom portraits are under the test folder').toBe(true)
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(200_000, 7)])
    mkdirSync(lib.portraitDirectory('custom', SOMEBODY), { recursive: true })
    writeFileSync(join(lib.portraitDirectory('custom', SOMEBODY), `${SOMEBODY}-1.jpg`), jpeg)
    await sentFromTheFile(smallPortrait(portraitAddress('custom', SOMEBODY, `${SOMEBODY}-1`)), jpeg, {
      'content-type': 'image/jpeg', 'cache-control': A_YEAR,
      'x-mole-office-picture': 'the whole picture, because the picture is image/jpeg, and only a PNG is shrunk',
    })
  })

  it('an uploaded picture, and a drawn one is still its drawing', async () => {
    const avatars = await import('../src/server/lib/avatars.ts')
    const picture = readFileSync(join(lib.portraitDirectory('role', 'administrator'), 'administrator-1.png'))
    const id = avatars.storeUploadedAvatar(picture, { kind: 'person', id: THE_PERSON })
    // The upload policy may resize; this route still sends the whole stored file as a stream.
    const stored = avatars.avatarBytesFor(id).body as Buffer
    await sentFromTheFile(`/api/assets/${id}`, stored, { 'content-type': 'image/png', 'cache-control': A_YEAR })

    const drawn = await ask(`/api/assets/${defaultAvatarAssetId({ kind: 'person', id: THE_PERSON })}`)
    expect(drawn.res.statusCode, drawn.res.body.slice(0, 300)).toBe(200)
    expect(drawn.res.headers['content-type']).toBe('image/svg+xml')
    expect(drawn.res.headers['cache-control']).toBe(A_YEAR)
    expect(drawn.res.body.startsWith('<svg'), 'the drawing').toBe(true)
  })

  it("a file in a resident's space", async () => {
    const notes = inTheSpace('memory/notes.md', Buffer.from('A made-up note.\n'.repeat(400), 'utf8'))
    await sentFromTheFile(theFile('memory/notes.md'), notes, {
      'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-cache', 'accept-ranges': 'bytes',
    })
    const picture = inTheSpace('picture.png', readFileSync(join(lib.portraitDirectory('role', 'administrator'), 'administrator-1.png')))
    await sentFromTheFile(theFile('picture.png'), picture, { 'content-type': 'image/png', 'cache-control': 'private, no-cache', 'accept-ranges': 'bytes' })
  })
})

describe("2: a resident's file answers a stretch of itself", () => {
  it('one stretch in bytes with 206, a stretch it has none of with 416, and a Range it does not read with the whole file', async () => {
    const bytes = inTheSpace('stretch.txt', Buffer.from(Array.from({ length: 5000 }, (_, i) => `line ${String(i)}\n`).join(''), 'utf8'))
    const size = bytes.length

    const first = await ask(theFile('stretch.txt'), 'GET', { range: 'bytes=0-1023' })
    expect(first.res.statusCode, first.res.body.slice(0, 300)).toBe(206)
    expect(first.res.headers['content-range']).toBe(`bytes 0-1023/${String(size)}`)
    expect(first.res.headers['content-length']).toBe('1024')
    expect(first.res.headers['content-type'], 'the type of the whole file').toBe('text/plain; charset=utf-8')
    expect(first.res.rawPayload.equals(bytes.subarray(0, 1024))).toBe(true)
    expect(first.was).toBe('a stream of the file')

    const last = await ask(theFile('stretch.txt'), 'GET', { range: 'bytes=-10' })
    expect(last.res.statusCode).toBe(206)
    expect(last.res.headers['content-range']).toBe(`bytes ${String(size - 10)}-${String(size - 1)}/${String(size)}`)
    expect(last.res.rawPayload.equals(bytes.subarray(size - 10))).toBe(true)

    const none = await ask(theFile('stretch.txt'), 'GET', { range: `bytes=${String(size)}-` })
    expect(none.res.statusCode).toBe(416)
    expect(none.res.headers['content-range']).toBe(`bytes */${String(size)}`)
    expect(none.res.headers['content-type']).toMatch(/^application\/json/)
    expect(String((none.res.json() as { error?: unknown }).error)).toMatch(/has none of them\. Nothing was sent\.$/)

    for (const unread of ['items=0-5', 'bytes=0-5,10-20', 'bytes=9-3']) {
      const whole = await ask(theFile('stretch.txt'), 'GET', { range: unread })
      expect(whole.res.statusCode, unread).toBe(200)
      expect(whole.res.rawPayload.equals(bytes), `${unread}: the whole file`).toBe(true)
    }
  })
})

describe("3: a resident's file is sent as the type the whole-file rule gives", () => {
  /** The unit over and over, at least this many bytes and always whole characters. */
  const run = (bytes: number): Buffer => Buffer.alloc(Math.ceil(bytes / UNIT.length) * UNIT.length, UNIT)
  const cases: [string, () => Buffer, string][] = [
    ['a signature', () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), run(9 * MiB)]), 'image/png'],
    ['UTF-8 to the end', () => run(9 * MiB + 5), 'text/plain; charset=utf-8'],
    ['a bad byte at the end', () => Buffer.concat([run(9 * MiB), Buffer.from([0xff])]), 'application/octet-stream'],
    ['a character cut off at the end', () => Buffer.concat([run(9 * MiB), UNIT.subarray(0, 4)]), 'application/octet-stream'],
    ['an empty file', () => Buffer.alloc(0), 'text/plain; charset=utf-8'],
  ]
  for (const [what, make, expected] of cases) {
    it(what, async () => {
      const bytes = make()
      expect(theWholeFileRule(bytes), 'the rule, worked out here').toBe(expected)
      const path = `types/${what.replace(/[^a-z0-9]+/giu, '-')}.bin`
      inTheSpace(path, bytes)
      const got = await ask(theFile(path))
      expect(got.res.statusCode, got.res.body.slice(0, 300)).toBe(200)
      expect(got.res.headers['content-type']).toBe(expected)
      expect(got.res.headers['content-length']).toBe(String(bytes.length))
      expect(got.res.rawPayload.equals(bytes), 'the bytes are the file').toBe(true)
      const head = await ask(theFile(path), 'HEAD')
      expect(head.res.headers['content-type'], 'HEAD').toBe(expected)
    })
  }
})
