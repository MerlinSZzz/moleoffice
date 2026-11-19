// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Codec failure stores the uploaded bytes; storage failures and pre-codec refusals still refuse. */
import * as fs from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { avatarPng, avatarPngChunk, avatarPngParts, avatarOverPixelLimit } from './avatar-upload-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { avatarUrlFor, defaultAvatarAssetId, THE_PICTURE_WAS_GIVEN } from '../src/shared/participants.ts'

const seam = vi.hoisted(() => ({ module: null as string | null }))
vi.mock('node:module', async original => {
  const actual = await original<typeof import('node:module')>()
  return { ...actual, createRequire: (url: string) => {
    const require = actual.createRequire(url), resolve = require.resolve.bind(require)
    require.resolve = Object.assign((name: string, options?: unknown) => name === 'sharp' && seam.module !== null ? seam.module : resolve(name, options as never), require.resolve)
    return require
  } }
})

let t: TestDb
let app: FastifyInstance
let avatars: typeof import('../src/server/lib/avatars.ts')
let codec: typeof import('../src/server/lib/avatar-compression.ts')
let resources: typeof import('../src/server/lib/resources.ts')
const by = { kind: 'person', id: THE_PERSON } as const
const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const endpoint = `/api/participants/person/${THE_PERSON}/avatar`
const send = (bytes: Buffer) => app.inject({ method: 'POST', url: endpoint, headers, payload: { bytes: bytes.toString('base64') } })
const source = (): Buffer => avatarPng(81, codec.AVATAR_STORED_SIDE * 2, codec.AVATAR_STORED_SIDE * 2)
/**
 * The pixels of `source` with each scanline Sub-filtered: 1,893 bytes instead of 262,503, for the cases whose codec never
 * decodes the picture, because vitest's toEqual takes a third of a second over 262 KB and a fallback compares it three times.
 */
function theSameInSmall(): Buffer {
  const whole = source(), parts = avatarPngParts(whole), row = codec.AVATAR_STORED_SIDE * 2 * 4 + 1
  const raw = inflateSync(parts.find(part => part.type === 'IDAT')!.data), sub = Buffer.alloc(raw.length)
  for (let at = 0; at < raw.length; at++) sub[at] = at % row === 0 ? 1 : ((raw[at] ?? 0) - (at % row > 4 ? raw[at - 4] ?? 0 : 0)) & 255
  return Buffer.concat([whole.subarray(0, 8), ...parts.map(part => part.type === 'IDAT' ? avatarPngChunk('IDAT', deflateSync(sub, { level: 9 })) : part.whole)])
}
function standIn(program: string): void {
  seam.module = join(dirname(t.file), 'codec-stand-in.cjs')
  fs.writeFileSync(seam.module, program)
}

beforeEach(async () => {
  seam.module = null
  t = await freshDb()
  avatars = await import('../src/server/lib/avatars.ts')
  codec = await import('../src/server/lib/avatar-compression.ts')
  resources = await import('../src/server/lib/resources.ts')
  resources.useOsProbe(resources.LINUX_PROBE)
  app = (await apiApp()).app
  await app.ready()
}, 60_000)
afterEach(async () => {
  seam.module = null
  vi.restoreAllMocks()
  resources?.useOsProbe(resources.LINUX_PROBE)
  await app?.close()
  // A proof run may retain each fixture before the normal helper removes its temporary database.
  const evidence = process.env['AVATAR_FALLBACK_EVIDENCE']
  if (evidence && t) {
    const title = expect.getState().currentTestName!
    const name = title.replace(/[^a-zA-Z0-9-]+/g, '-').slice(0, 115) + '-' + hash(Buffer.from(title)).slice(0, 12)
    const folder = join(evidence, name)
    fs.mkdirSync(folder, { recursive: true })
    await t.client.sqlite.backup(join(folder, 'database.db'))
    for (const entry of fs.readdirSync(dirname(t.file))) {
      if (!entry.startsWith('panelx.db')) fs.cpSync(join(dirname(t.file), entry), join(folder, entry), { recursive: true })
    }
  }
  t?.close()
})

async function expectFallback(bytes: Buffer, reason: string): Promise<void> {
  const encode = vi.spyOn(codec, 'compressAvatar')
  const first = await send(bytes)
  expect(first.statusCode, first.body).toBe(201)
  const answer = first.json(), upload = answer.upload
  const facts = { originalHash: hash(bytes), storedHash: hash(bytes), originalBytes: bytes.length, storedBytes: bytes.length,
    bytesSaved: 0, disposition: `codec did not finish: ${reason}`, mime: 'image/png' }
  expect(upload).toMatchObject(facts)
  const manifest = join(avatars.avatarDirectory(), `${hash(bytes)}.json`)
  const file = join(dirname(t.file), upload.path)
  expect(JSON.parse(fs.readFileSync(manifest, 'utf8'))).toEqual(upload)
  expect(fs.readFileSync(file)).toEqual(bytes)
  const before = [manifest, file].map(path => ({ bytes: fs.readFileSync(path), mtime: fs.statSync(path).mtimeMs }))
  const again = await send(bytes)
  expect(again.statusCode, again.body).toBe(201)
  expect(again.json().upload).toEqual(upload)
  expect(again.json().participant.avatarUrl).toBe(answer.participant.avatarUrl)
  expect(again.json().receipt).not.toBe(answer.receipt)
  expect(encode).toHaveBeenCalledTimes(1)
  expect([manifest, file].map(path => ({ bytes: fs.readFileSync(path), mtime: fs.statSync(path).mtimeMs }))).toEqual(before)
  const receipts = fs.readdirSync(join(avatars.avatarDirectory(), 'receipts')).map(name => ({ name,
    facts: JSON.parse(fs.readFileSync(join(avatars.avatarDirectory(), 'receipts', name), 'utf8')),
  })).filter(receipt => receipt.facts.originalHash === hash(bytes))
  expect(receipts).toHaveLength(2)
  expect(new Set(receipts.map(receipt => receipt.name)).size).toBe(2)
  for (const receipt of receipts) expect(receipt.facts).toMatchObject({ ...facts, by, assetId: answer.participant.avatarUrl.slice('/api/assets/'.length) })
  const served = await app.inject({ method: 'GET', url: answer.participant.avatarUrl })
  expect(served.statusCode).toBe(200)
  expect(served.rawPayload).toEqual(bytes)
  expect(served.headers['cache-control']).toContain('immutable')
}

for (const format of ['png', 'jpeg', 'webp'] as const) it(`retains successful ${format} bytes and measures normal immutable reads`, async () => {
  const sharp = createRequire(import.meta.url)('sharp')
  let image = sharp(avatarPng(10, codec.AVATAR_STORED_SIDE * 4, codec.AVATAR_STORED_SIDE * 2))
    .withMetadata({ orientation: 6 }).withIccProfile('p3')
  if (format === 'jpeg') image = image.flatten({ background: '#f1d7a3' }).jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
  else if (format === 'webp') image = image.webp({ lossless: true })
  else image = image.png()
  const bytes = await image.toBuffer(), direct = codec.compressAvatar(bytes, `image/${format}`)
  const stored = avatars.storeAvatarUpload(bytes, by)
  expect(stored.upload.disposition).toBe(codec.AVATAR_DISPOSITIONS.resized)
  expect(fs.readFileSync(join(dirname(t.file), stored.upload.path))).toEqual(direct.bytes)
  const reads: number[] = []
  for (let i = 0; i < 11; i++) {
    const start = performance.now()
    const served = await app.inject({ method: 'GET', url: avatarUrlFor(stored.assetId) })
    const ms = performance.now() - start
    expect(served.statusCode).toBe(200)
    expect(served.rawPayload).toEqual(direct.bytes)
    if (i >= 2) reads.push(ms)
  }
  fs.writeFileSync(join(dirname(t.file), `success-${format}.bin`), direct.bytes)
  const result = { format, originalHash: hash(bytes), storedHash: hash(direct.bytes), readsMs: reads, medianMs: [...reads].sort((a, b) => a - b)[4] }
  fs.writeFileSync(join(dirname(t.file), `success-${format}.json`), JSON.stringify(result) + '\n')
  console.log(JSON.stringify(result))
})

it('stores exact originals after the actual bounded child times out without machine load', async () => {
  standIn(`Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${codec.AVATAR_CODEC_TIMEOUT_MS * 2})`)
  await expectFallback(source(), 'time bound')
}, 30_000)

it('stores exact originals when the actual child stops unexpectedly', async () => {
  standIn('process.kill(process.pid, "SIGTERM")')
  await expectFallback(theSameInSmall(), 'child failed')
})

for (const stream of ['stdout', 'stderr']) it(`stores exact originals when the actual child exceeds its ${stream} bound`, async () => {
  standIn(`require('node:fs').writeFileSync(${stream === 'stdout' ? 1 : 2}, Buffer.alloc(${codec.AVATAR_CODEC_BUFFER_BYTES + 1}, 120)); process.exit(0)`)
  await expectFallback(source(), 'output bound')
})

it('stores exact originals above the production pixel bound without changing that bound', async () => {
  const bytes = avatarOverPixelLimit(codec.AVATAR_INPUT_PIXEL_LIMIT)
  expect(bytes.length).toBeLessThan(avatars.maxAvatarBytes())
  await expectFallback(bytes, 'pixel bound')
})

it('stores exact originals when image processing fails inside the actual child', async () => {
  standIn('function image() { throw new Error("opaque private decoder details") }; image.cache=()=>({memory:{max:0},items:{max:0}}); image.concurrency=()=>1; module.exports=image')
  await expectFallback(theSameInSmall(), 'image processing failed')
})

for (const output of ['incomplete', 'null', '{"disposition":"unrecognized"}', '{"disposition":"resized"}', '{"disposition":"resized","base64":""}', '{"disposition":"resized","base64":"%%%"}']) {
  it(`stores exact originals for invalid child result ${output}`, async () => {
    standIn(`process.stdout.write(${JSON.stringify(output)});process.exit(0)`)
    await expectFallback(theSameInSmall(), 'invalid result')
  })
}

for (const failure of ['launch', 'unknown'] as const) it(`stores exact originals after a controlled ${failure} failure`, async () => {
  resources.useOsProbe({ ...resources.LINUX_PROBE, runAvatarCodec: () => {
    if (failure === 'unknown') throw new Error('opaque private probe details')
    return { status: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error: Object.assign(new Error('opaque spawn details'), { code: 'ENOENT' }) }
  } })
  await expectFallback(theSameInSmall(), failure === 'launch' ? 'launch failed' : 'unknown reason')
})

it('records the reason when the installed probe cannot run the codec', async () => {
  resources.useOsProbe({ ...resources.LINUX_PROBE, runAvatarCodec: undefined })
  const bytes = source(), first = await send(bytes)
  expect(first.statusCode, first.body).toBe(201)
  const upload = first.json().upload
  expect(upload).toMatchObject({ originalHash: hash(bytes), storedHash: hash(bytes), disposition: codec.AVATAR_DISPOSITIONS.unavailable })
  expect(JSON.parse(fs.readFileSync(join(avatars.avatarDirectory(), `${hash(bytes)}.json`), 'utf8'))).toEqual(upload)
})

it('registers with an offered original when the child fails, retaining chosen and given provenance', async () => {
  standIn('process.exit(7)')
  const response = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'agent', title: 'Codec fallback fixture', data: {
    handle: 'codec-fallback-fixture', runtime: 'codex', role: 'worker', state: 'active',
  } } })
  expect(response.statusCode, response.body).toBe(201)
  const given = t.client.sqlite.prepare('SELECT id, avatar_asset_id FROM agents WHERE handle = ?').get('codec-fallback-fixture') as { id: string; avatar_asset_id: string }
  expect(given).toBeDefined()
  const who = { kind: 'agent', id: given.id } as const
  const bytes = avatars.offeredAvatarBytes(avatars.THE_DEFAULT_PICTURE.set, avatars.THE_DEFAULT_PICTURE.name).body as Buffer
  const chosen = avatars.storeAvatarUpload(bytes, by)
  const row = (id: string) => t.client.sqlite.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown>
  expect(chosen.assetId).not.toBe(given.avatar_asset_id)
  expect(row(chosen.assetId).path).toBe(row(given.avatar_asset_id).path)
  expect(row(given.avatar_asset_id).licence_source).toBe(THE_PICTURE_WAS_GIVEN)
  expect(row(chosen.assetId).licence_source).toBeNull()
  expect(avatars.giveTheOfferedPicture(who, defaultAvatarAssetId(who), by)).toBe(given.avatar_asset_id)
  expect((await app.inject({ method: 'GET', url: avatarUrlFor(given.avatar_asset_id) })).rawPayload).toEqual(bytes)
  expect(chosen.upload.disposition).toBe('codec did not finish: child failed')
})

it('keeps type, empty and input-byte refusals ahead of any codec attempt', async () => {
  const encode = vi.spyOn(codec, 'compressAvatar').mockImplementation(() => { throw new Error('must not run') })
  for (const [bytes, status] of [[Buffer.alloc(0), 400], [Buffer.from('not a picture'), 415], [Buffer.alloc(avatars.maxAvatarBytes() + 1), 413]] as const) {
    expect(() => avatars.storeAvatarUpload(bytes, by)).toThrow(expect.objectContaining({ status }))
  }
  expect(encode).not.toHaveBeenCalled()
})

for (const target of ['blob', 'manifest', 'receipt'] as const) it(`propagates a ${target} write failure after codec fallback`, () => {
  standIn('process.exit(7)')
  const actualWrite = fs.writeFileSync
  const failure = Object.assign(new Error('controlled storage write failure'), { code: 'EACCES' })
  vi.spyOn(fs, 'writeFileSync').mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
    const path = String(args[0])
    if (target === 'blob' ? path.endsWith('.png') : target === 'receipt' ? path.includes('/receipts/') : path.endsWith('.json') && !path.includes('/receipts/')) throw failure
    return actualWrite(...args)
  })
  expect(() => avatars.storeAvatarUpload(source(), by)).toThrow(failure)
})

it('refuses a conflicting original blob after codec fallback without overwriting it', () => {
  standIn('process.exit(7)')
  const bytes = source(), path = join(avatars.avatarDirectory(), `sha256-${hash(bytes)}.png`)
  fs.mkdirSync(avatars.avatarDirectory(), { recursive: true })
  const other = avatarPng(82)
  fs.writeFileSync(path, other)
  const before = t.client.sqlite.prepare('SELECT * FROM assets ORDER BY id').all()
  expect(() => avatars.storeAvatarUpload(bytes, by)).toThrow(/content hash/)
  expect(fs.readFileSync(path)).toEqual(other)
  expect(t.client.sqlite.prepare('SELECT * FROM assets ORDER BY id').all()).toEqual(before)
})
