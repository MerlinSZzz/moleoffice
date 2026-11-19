// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Acceptance: avatar uploads share a content-addressed file, with immutable chosen/given provenance.
 *
 * Production files planned: src/server/lib/avatars.ts and src/server/lib/avatar-compression.ts.
 * Corresponding tests: this file, tests/avatar-compression.test.ts and tests/avatar-upload-fixtures.ts.
 * Existing neighbours found by searching storeUploadedAvatar, giveTheOfferedPicture, pictureShownFor,
 * theAvatarToSend and the avatar POST/asset GET routes:
 * tests/avatars.test.ts, tests/agents-given-the-default-picture-share-one-stored-copy.test.ts,
 * tests/a-chat-setting-follows-the-person.test.ts,
 * tests/the-pictures-and-a-residents-file-are-sent-from-the-file.test.ts,
 * tests/a-test-world-says-why-the-faces-differ.test.ts.
 * The first two need fixture/path assertions adapted to content-addressed storage. The missing-file
 * neighbour uses a complete PNG. The streamed-file neighbour now checks the complete stored output,
 * rather than the original upload: resizing changes storage, while the route still streams its file.
 * The chat-setting neighbour is run unchanged. No UI or migration is planned.
 * The reviewed compression policy and packaging are held in the corresponding codec tests.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_PICTURE_WAS_GIVEN, avatarUrlFor, defaultAvatarAssetId, type ParticipantRef } from '../src/shared/participants.ts'
import { theFirstPortraitOf } from '../src/shared/portraits.ts'
import { avatarPng, avatarPngChunk, avatarPngParts, avatarOverPixelLimit } from './avatar-upload-fixtures.ts'

let t: TestDb
let app: FastifyInstance
let avatars: typeof import('../src/server/lib/avatars.ts')
const by: ParticipantRef = { kind: 'person', id: THE_PERSON }
const agent = (id: string): ParticipantRef => ({ kind: 'agent', id })
const row = (id: string): Record<string, unknown> => t.client.sqlite.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown>
const file = (id: string): string => join(dirname(t.file), String(row(id)['path']))
const files = (): string[] => existsSync(avatars.avatarDirectory()) ? readdirSync(avatars.avatarDirectory()).sort() : []

beforeEach(async () => {
  t = await freshDb()
  avatars = await import('../src/server/lib/avatars.ts')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)
afterEach(async () => { vi.restoreAllMocks(); await app.close(); t.close() })

describe('content sharing for avatar uploads', () => {
  it('replays deterministic uploads with preserved files and keeps different upload facts separate', async () => {
    const { idsInTurn } = await import('../src/server/lib/ids.ts')
    const bytes = avatarPng(61)
    const replay = (uploader: ParticipantRef, picture = bytes) => {
      const end = idsInTurn('avatar receipt replay fixture')
      try { return avatars.storeAvatarUpload(picture, uploader) }
      finally { end() }
    }
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2020-01-02T00:00:00Z'))
    try {
      const first = replay(by)
      const path = join(avatars.avatarDirectory(), 'receipts', `${first.receipt}.json`)
      const kept = { bytes: readFileSync(path), mtime: statSync(path).mtimeMs }
      // Reset deletes the database, while its sibling files remain. Recreate the same row state.
      t.client.sqlite.prepare("DELETE FROM assets WHERE origin = 'uploaded'").run()
      const again = replay(by)
      expect(again.assetId).toBe(first.assetId)
      expect(again.receipt).toBe(first.receipt)
      expect({ bytes: readFileSync(path), mtime: statSync(path).mtimeMs }).toEqual(kept)
      t.client.sqlite.prepare("DELETE FROM assets WHERE origin = 'uploaded'").run()
      const other = replay(agent('different-fixture-owner'), avatarPng(62))
      expect(other.receipt).not.toBe(first.receipt)
      expect({ bytes: readFileSync(path), mtime: statSync(path).mtimeMs }).toEqual(kept)
      const facts = JSON.parse(readFileSync(join(avatars.avatarDirectory(), 'receipts', `${other.receipt}.json`), 'utf8'))
      expect(facts.by).toEqual(agent('different-fixture-owner'))
      expect(facts.originalHash).toBe(createHash('sha256').update(avatarPng(62)).digest('hex'))
    } finally { vi.useRealTimers() }
  })

  it('names sibling databases in new receipts and never changes historical receipt files', async () => {
    const { idsInTurn } = await import('../src/server/lib/ids.ts')
    const config = await import('../src/config/settings.mjs')
    const bytes = avatarPng(64)
    const folder = join(avatars.avatarDirectory(), 'receipts')
    mkdirSync(folder, { recursive: true })
    const legacy = join(folder, 'old-receipt.json')
    writeFileSync(legacy, '{"historical":"kept exactly"}\n')
    const before = { bytes: readFileSync(legacy), mtime: statSync(legacy).mtimeMs }
    const upload = () => {
      const end = idsInTurn('sibling avatar receipt fixture')
      try { return avatars.storeAvatarUpload(bytes, by) }
      finally { end() }
    }
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2020-01-02T00:00:00Z'))
    try {
      const first = upload()
      t.client.sqlite.prepare("DELETE FROM assets WHERE origin = 'uploaded'").run()
      const sibling = join(dirname(t.file), 'sibling.db')
      vi.spyOn(config, 'settings').mockReturnValue({ ...config.settings(), databasePath: sibling })
      const second = upload()
      expect(second.receipt).not.toBe(first.receipt)
      for (const [result, database] of [[first, t.file], [second, sibling]] as const) {
        const receipt = JSON.parse(readFileSync(join(folder, `${result.receipt}.json`), 'utf8'))
        expect(receipt.database).toBe(database)
        expect(receipt.by).toEqual(by)
      }
      expect({ bytes: readFileSync(legacy), mtime: statSync(legacy).mtimeMs }).toEqual(before)
    } finally { vi.useRealTimers() }
  })

  it('refuses a corrupt receipt at its deterministic path without rewriting it', async () => {
    const { idsInTurn } = await import('../src/server/lib/ids.ts')
    const bytes = avatarPng(65)
    const upload = () => {
      const end = idsInTurn('corrupt avatar receipt fixture')
      try { return avatars.storeAvatarUpload(bytes, by) }
      finally { end() }
    }
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2020-01-02T00:00:00Z'))
    try {
      const first = upload()
      const path = join(avatars.avatarDirectory(), 'receipts', `${first.receipt}.json`)
      const corrupt = Buffer.from('conflicting historical receipt')
      writeFileSync(path, corrupt)
      t.client.sqlite.prepare("DELETE FROM assets WHERE origin = 'uploaded'").run()
      expect(upload).toThrow(/receipt/i)
      expect(readFileSync(path)).toEqual(corrupt)
    } finally { vi.useRealTimers() }
  })

  it('writes deterministic upload facts without treating native process RSS as image provenance', async () => {
    const compression = await import('../src/server/lib/avatar-compression.ts')
    const encode = vi.spyOn(compression, 'compressAvatar')
    const bytes = avatarPng(63)
    const { idsInTurn } = await import('../src/server/lib/ids.ts')
    const snapshot = (rss: number) => {
      encode.mockReturnValue({ bytes, disposition: compression.AVATAR_DISPOSITIONS.small,
        native: { cacheMemory: 0, cacheItems: 0, concurrency: 1, inputPixelLimit: compression.AVATAR_INPUT_PIXEL_LIMIT, peakRssBytes: rss } })
      const end = idsInTurn('avatar stable files fixture')
      try {
        avatars.storeAvatarUpload(bytes, by)
        return readdirSync(avatars.avatarDirectory(), { recursive: true, withFileTypes: true })
          .filter(entry => entry.isFile()).map(entry => {
            const path = join(entry.parentPath, entry.name)
            return [path.slice(avatars.avatarDirectory().length), createHash('sha256').update(readFileSync(path)).digest('hex')]
          }).sort()
      } finally { end() }
    }
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2020-01-02T00:00:00Z'))
    try {
      const first = snapshot(32 * 1024 * 1024)
      t.client.sqlite.prepare("DELETE FROM assets WHERE origin = 'uploaded'").run()
      const { rmSync } = await import('node:fs')
      rmSync(avatars.avatarDirectory(), { recursive: true })
      expect(snapshot(48 * 1024 * 1024)).toEqual(first)
    } finally { vi.useRealTimers() }
  })

  it('returns synchronously and shares the same asset, URL and SHA256 file across uploaders', async () => {
    const compression = await import('../src/server/lib/avatar-compression.ts')
    const encode = vi.spyOn(compression,'compressAvatar')
    const bytes = avatarPng(1, compression.AVATAR_STORED_SIDE*2, compression.AVATAR_STORED_SIDE*2)
    const one = avatars.storeUploadedAvatar(bytes, by)
    const receipts = (): string[] => readdirSync(join(avatars.avatarDirectory(),'receipts'))
    const before = { row: row(one), files: files(), mtime: statSync(file(one)).mtimeMs, receipts: receipts() }
    const encoded = encode.mock.calls.length
    const two = avatars.storeUploadedAvatar(bytes, agent('another-uploader'))
    expect(typeof one).toBe('string')
    expect(two).toBe(one)
    expect(avatarUrlFor(two)).toBe(avatarUrlFor(one))
    const stored = readFileSync(file(one))
    expect(String(row(one)['path'])).toContain(createHash('sha256').update(stored).digest('hex'))
    expect(row(one)['bytes']).toBe(stored.length)
    expect(row(two)).toEqual(before.row)
    expect(files()).toEqual(before.files)
    expect(statSync(file(one)).mtimeMs).toBe(before.mtime)
    const added = receipts().filter(receipt=>!before.receipts.includes(receipt))
    expect(added).toHaveLength(1)
    const receipt = JSON.parse(readFileSync(join(avatars.avatarDirectory(),'receipts',added[0]!), 'utf8'))
    expect(receipt.originalHash).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(receipt.assetId).toBe(one)
    expect(receipt.bytesSaved).toBe(receipt.originalBytes-receipt.storedBytes)
    expect(receipt.disposition).toBeTruthy()
    expect(encode.mock.calls.length).toBe(encoded)
  })

  it('keeps distinct images separate and never changes the earlier file or row', () => {
    const one = avatars.storeUploadedAvatar(avatarPng(2), by)
    const before = { row: row(one), bytes: readFileSync(file(one)), mtime: statSync(file(one)).mtimeMs }
    const two = avatars.storeUploadedAvatar(avatarPng(3), by)
    expect(two).not.toBe(one)
    expect(file(two)).not.toBe(file(one))
    expect(readFileSync(file(two)).equals(before.bytes)).toBe(false)
    expect(row(one)).toEqual(before.row)
    expect(readFileSync(file(one))).toEqual(before.bytes)
    expect(statSync(file(one)).mtimeMs).toBe(before.mtime)
  })

  for (const chosenFirst of [true, false]) it(`shares the blob without turning a chosen default into a given one, chosen first: ${String(chosenFirst)}`, () => {
    const who = agent(`chooses-${String(chosenFirst)}`)
    const offered = avatars.offeredAvatarBytes(avatars.THE_DEFAULT_PICTURE.set, avatars.THE_DEFAULT_PICTURE.name).body as Buffer
    let chosen: string, given: string
    const give = (): string => avatars.giveTheOfferedPicture(who, defaultAvatarAssetId(who), by)!
    if (chosenFirst) { chosen = avatars.storeUploadedAvatar(offered, by); given = give() }
    else { given = give(); chosen = avatars.storeUploadedAvatar(offered, by) }
    const before = { chosen: row(chosen), given: row(given), files: files() }
    expect(chosen).not.toBe(given)
    expect(file(chosen)).toBe(file(given))
    expect(row(given)['licence_source']).toBe(THE_PICTURE_WAS_GIVEN)
    expect(row(chosen)['licence_source']).not.toBe(THE_PICTURE_WAS_GIVEN)
    const onOffer = avatars.avatarsOnOffer()
    expect(avatars.pictureShownFor(who, given, onOffer, 'worker')).toBe(theFirstPortraitOf('worker'))
    expect(avatars.pictureShownFor(who, chosen, onOffer, 'worker')).toBe(avatarUrlFor(chosen))
    expect(avatars.storeUploadedAvatar(offered, agent('later-uploader'))).toBe(chosen)
    expect(give()).toBe(given)
    expect({ chosen: row(chosen), given: row(given), files: files() }).toEqual(before)
  })

  it('does not rewrite legacy rows, files or participant references when the same image is uploaded', () => {
    const bytes = avatarPng(4), id = 'legacy-upload-fixture'
    const path = join('avatars', `${id}.png`)
    mkdirSync(avatars.avatarDirectory(), { recursive: true })
    writeFileSync(join(dirname(t.file), path), bytes)
    t.client.sqlite.prepare("INSERT INTO assets (id,kind,origin,path,mime,bytes,created_at,licence_source) VALUES (?,'avatar','uploaded',?,'image/png',?,? ,NULL)").run(id, path, bytes.length, '2000-01-01 00:00:00')
    const previous = { row: row(id), bytes: readFileSync(file(id)), mtime: statSync(file(id)).mtimeMs }
    const people = t.client.sqlite.prepare('SELECT id, avatar_asset_id FROM people ORDER BY id').all()
    avatars.storeUploadedAvatar(bytes, by)
    expect({ row: row(id), bytes: readFileSync(file(id)), mtime: statSync(file(id)).mtimeMs }).toEqual(previous)
    expect(t.client.sqlite.prepare('SELECT id, avatar_asset_id FROM people ORDER BY id').all()).toEqual(people)
  })

  it('serves the stored bytes through the existing immutable asset route with their real MIME', async () => {
    const id = avatars.storeUploadedAvatar(avatarPng(5), by)
    const response = await app.inject({ method: 'GET', url: avatarUrlFor(id) })
    expect(response.statusCode).toBe(200)
    expect(response.rawPayload).toEqual(readFileSync(file(id)))
    expect(response.headers['content-type']).toContain(String(row(id)['mime']))
    expect(response.headers['cache-control']).toContain('immutable')
  })

  it('records the original hash, exact disposition and measured saving, and returns them on upload', async () => {
    const bytes = avatarPng(6)
    const response = await app.inject({ method: 'POST', url: `/api/participants/person/${THE_PERSON}/avatar`, headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }, payload: { bytes: bytes.toString('base64') } })
    expect(response.statusCode).toBe(201)
    const description = response.json().upload
    expect(description.originalHash).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(description.originalBytes).toBe(bytes.length)
    expect(description.storedBytes).toBeGreaterThan(0)
    expect(description.bytesSaved).toBe(description.originalBytes - description.storedBytes)
    expect(description.disposition).toBeTruthy()
    const manifest = JSON.parse(readFileSync(join(avatars.avatarDirectory(), `${description.originalHash}.json`), 'utf8'))
    expect(manifest).toMatchObject(description)
  })

  it('does not overwrite a conflicting hash-named blob or its existing rows', () => {
    const bytes = avatarPng(7)
    const hash = createHash('sha256').update(bytes).digest('hex')
    const path = join(avatars.avatarDirectory(), `sha256-${hash}.png`)
    mkdirSync(avatars.avatarDirectory(), { recursive: true })
    const other = avatarPng(8)
    writeFileSync(path, other)
    const before = t.client.sqlite.prepare('SELECT * FROM assets ORDER BY id').all()
    expect(() => avatars.storeUploadedAvatar(bytes, by)).toThrow()
    expect(readFileSync(path)).toEqual(other)
    expect(t.client.sqlite.prepare('SELECT * FROM assets ORDER BY id').all()).toEqual(before)
  })

  it('persists the explicit unavailable-codec disposition in the manifest and every repeat receipt', async () => {
    const compression=await import('../src/server/lib/avatar-compression.ts')
    const bytes=avatarPng(37)
    vi.spyOn(compression,'compressAvatar').mockReturnValue({bytes,disposition:compression.AVATAR_DISPOSITIONS.unavailable})
    const one=avatars.storeUploadedAvatar(bytes,by)
    const two=avatars.storeUploadedAvatar(bytes,agent('repeat-without-codec'))
    expect(two).toBe(one)
    expect(readFileSync(file(one))).toEqual(bytes)
    const hash=createHash('sha256').update(bytes).digest('hex')
    const manifest=JSON.parse(readFileSync(join(avatars.avatarDirectory(),`${hash}.json`),'utf8'))
    expect(manifest.disposition).toBe(compression.AVATAR_DISPOSITIONS.unavailable)
    const receipts=readdirSync(join(avatars.avatarDirectory(),'receipts')).map(name=>JSON.parse(readFileSync(join(avatars.avatarDirectory(),'receipts',name),'utf8'))).filter(receipt=>receipt.originalHash===hash)
    expect(receipts).toHaveLength(2)
    expect(receipts.every(receipt=>receipt.disposition===manifest.disposition && receipt.bytesSaved===0)).toBe(true)
  })

  it('refuses a corrupt manifest without rewriting it or any existing asset row', () => {
    const bytes=avatarPng(38)
    avatars.storeUploadedAvatar(bytes,by)
    const hash=createHash('sha256').update(bytes).digest('hex')
    const path=join(avatars.avatarDirectory(),`${hash}.json`)
    const corrupt=Buffer.from(JSON.stringify({...JSON.parse(readFileSync(path,'utf8')),originalHash:'wrong'}))
    writeFileSync(path,corrupt)
    const before=t.client.sqlite.prepare('SELECT * FROM assets ORDER BY id').all()
    expect(()=>avatars.storeUploadedAvatar(bytes,by)).toThrow()
    expect(readFileSync(path)).toEqual(corrupt)
    expect(t.client.sqlite.prepare('SELECT * FROM assets ORDER BY id').all()).toEqual(before)
  })

  it('shares one result blob for byte-distinct originals that encode the same picture', async () => {
    const compression=await import('../src/server/lib/avatar-compression.ts')
    const original=avatarPng(39,compression.AVATAR_STORED_SIDE*2,compression.AVATAR_STORED_SIDE*2)
    const parts=avatarPngParts(original)
    const data=parts.find(part=>part.type==='IDAT')!.data
    const middle=Math.floor(data.length/2)
    const other=Buffer.concat([original.subarray(0,8),...parts.flatMap(part=>part.type==='IDAT'?[avatarPngChunk('IDAT',data.subarray(0,middle)),avatarPngChunk('IDAT',data.subarray(middle))]:[part.whole])])
    expect(other.equals(original)).toBe(false)
    const one=avatars.storeUploadedAvatar(original,by),before=files().filter(name=>name.endsWith('.png')),mtime=statSync(file(one)).mtimeMs
    const two=avatars.storeUploadedAvatar(other,agent('another-encoding'))
    expect(two).toBe(one)
    expect(files().filter(name=>name.endsWith('.png'))).toEqual(before)
    expect(statSync(file(one)).mtimeMs).toBe(mtime)
  })

  it('stores signature-accepted bytes unchanged when decoding fails, with an explicit disposition', () => {
    const broken=Buffer.concat([avatarPng(40).subarray(0,8),Buffer.alloc(64)])
    const result=avatars.storeAvatarUpload(broken,by)
    expect(readFileSync(file(result.assetId))).toEqual(broken)
    expect(result.upload).toMatchObject({bytesSaved:0,storedHash:result.upload.originalHash,disposition:'codec did not finish: image processing failed'})
    expect(existsSync(join(avatars.avatarDirectory(),`${result.upload.originalHash}.json`))).toBe(true)
    expect(existsSync(join(avatars.avatarDirectory(),'receipts',`${result.receipt}.json`))).toBe(true)
  })

  it('stores a valid image above the unchanged native pixel cap as uploaded', async () => {
    const compression=await import('../src/server/lib/avatar-compression.ts')
    const bytes=avatarOverPixelLimit(compression.AVATAR_INPUT_PIXEL_LIMIT)
    expect(bytes.length).toBeLessThan(avatars.maxAvatarBytes())
    const result=avatars.storeAvatarUpload(bytes,by)
    expect(readFileSync(file(result.assetId))).toEqual(bytes)
    expect(result.upload).toMatchObject({bytesSaved:0,storedHash:result.upload.originalHash,disposition:'codec did not finish: pixel bound'})
  })

  it('keeps a deliberately chosen default chosen when the native codec is unavailable', async () => {
    const compression=await import('../src/server/lib/avatar-compression.ts')
    vi.spyOn(compression,'compressAvatar').mockImplementation(bytes=>({bytes,disposition:compression.AVATAR_DISPOSITIONS.unavailable}))
    const who=agent('chooses-without-codec')
    const bytes=avatars.offeredAvatarBytes(avatars.THE_DEFAULT_PICTURE.set,avatars.THE_DEFAULT_PICTURE.name).body as Buffer
    const chosen=avatars.storeUploadedAvatar(bytes,by)
    const given=avatars.giveTheOfferedPicture(who,defaultAvatarAssetId(who),by)!
    expect(file(chosen)).toBe(file(given))
    expect(avatars.pictureShownFor(who,chosen,avatars.avatarsOnOffer(),'worker')).toBe(avatarUrlFor(chosen))
    expect(avatars.pictureShownFor(who,given,avatars.avatarsOnOffer(),'worker')).toBe(theFirstPortraitOf('worker'))
  })
})
