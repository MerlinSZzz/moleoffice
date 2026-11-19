// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Choice identity across real native success, absent/unloadable native code, and forced probe failures. */
import * as fs from 'node:fs'
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { avatarPng } from './avatar-upload-fixtures.ts'
import { expectPictureIdentity, expectStoredPicture, pictureHash, pictureRecords } from './avatar-picture-identity.ts'
import { AVATAR_DIRECTORY } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { AvatarUploadDescription } from '../src/server/lib/avatars.ts'

const seam = vi.hoisted(() => ({
  mode: 'native' as 'native' | 'absent' | 'unloadable', module: '',
  beforeWrite: null as null | ((path: string, data: unknown, options: unknown) => void),
}))
vi.mock('node:module', async original => {
  const actual = await original<typeof import('node:module')>()
  return { ...actual, createRequire: (url: string) => {
    const require = actual.createRequire(url), resolve = require.resolve.bind(require)
    require.resolve = Object.assign((name: string, options?: unknown) => {
      if (name === 'sharp') {
        if (seam.mode === 'absent') throw Object.assign(new Error('controlled missing native module'), { code: 'MODULE_NOT_FOUND' })
        if (seam.mode === 'unloadable') return seam.module
      }
      return resolve(name, options as never)
    }, require.resolve)
    return require
  } }
})

let t: TestDb
let app: FastifyInstance
let avatars: typeof import('../src/server/lib/avatars.ts')
let codec: typeof import('../src/server/lib/avatar-compression.ts')
let resources: typeof import('../src/server/lib/resources.ts')
const who = { kind: 'person', id: THE_PERSON } as const
const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const endpoint = `/api/participants/person/${THE_PERSON}/avatar`

beforeEach(async () => {
  seam.mode = 'native'; seam.beforeWrite = null
  t = await freshDb()
  const guardedWrite = fs.writeFileSync
  vi.spyOn(fs, 'writeFileSync').mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
    if (typeof args[0] === 'string') seam.beforeWrite?.(args[0], args[1], args[2])
    return guardedWrite(...args)
  })
  avatars = await import('../src/server/lib/avatars.ts')
  codec = await import('../src/server/lib/avatar-compression.ts')
  resources = await import('../src/server/lib/resources.ts')
  resources.useOsProbe(resources.LINUX_PROBE)
  app = (await apiApp()).app
  await app.ready()
  seam.module = join(dirname(t.file), 'unloadable-native.cjs')
  writeFileSync(seam.module, 'throw new Error("controlled unloadable native module")')
})
afterEach(async () => {
  seam.mode = 'native'; seam.beforeWrite = null
  vi.restoreAllMocks()
  resources.useOsProbe(resources.LINUX_PROBE)
  await app.close(); t.close()
})

const original = (): Buffer => avatarPng(71, codec.AVATAR_STORED_SIDE * 2, codec.AVATAR_STORED_SIDE * 2)
const send = (bytes: Buffer) => app.inject({ method: 'POST', url: endpoint, headers, payload: { bytes: bytes.toString('base64') } })
function snapshot(): unknown {
  const folder = avatars.avatarDirectory()
  return {
    participant: t.client.sqlite.prepare('SELECT avatar_asset_id FROM people WHERE id = ?').get(who.id),
    assets: t.client.sqlite.prepare('SELECT * FROM assets ORDER BY id').all(),
    files: existsSync(folder) ? readdirSync(folder, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
      .map(entry => { const file = join(entry.parentPath, entry.name); return [file, readFileSync(file).toString('base64')] }).sort() : [],
  }
}

describe('original identity and stored representation', () => {
  for (const mode of ['native', 'absent', 'unloadable'] as const) it(`binds the selected original, served pixels, manifest and receipt with ${mode} codec`, async () => {
    seam.mode = mode
    const bytes = original()
    const sent = await send(bytes)
    expect(sent.statusCode, sent.body).toBe(201)
    const answer = sent.json()
    const served = await app.inject({ method: 'GET', url: answer.participant.avatarUrl })
    expect(served.statusCode).toBe(200)
    const upload = await expectStoredPicture(dirname(t.file), answer.participant.avatarUrl, bytes, served.rawPayload)
    expect(answer.upload).toEqual(upload)
    expect(upload.disposition).toBe(mode === 'native' ? codec.AVATAR_DISPOSITIONS.resized : codec.AVATAR_DISPOSITIONS.unavailable)
    const receipt = pictureRecords(dirname(t.file)).find(record => record.data.assetId === answer.participant.avatarUrl.slice('/api/assets/'.length))!.data
    expect(receipt).toMatchObject({ ...upload, by: who, assetId: answer.participant.avatarUrl.slice('/api/assets/'.length) })
    console.log(JSON.stringify({ mode, ...upload }))
  })

  it('retains exact bytes for a valid small PNG with real native decoding', async () => {
    const bytes = avatarPng(72, 16, 16)
    const sent = await send(bytes)
    expect(sent.statusCode, sent.body).toBe(201)
    const answer = sent.json()
    const served = await app.inject({ method: 'GET', url: answer.participant.avatarUrl })
    await expectPictureIdentity(bytes, served.rawPayload, answer.upload)
    expect(answer.upload.disposition).toBe(codec.AVATAR_DISPOSITIONS.small)
    expect(served.rawPayload).toEqual(bytes)
  })

  for (const mode of ['native', 'absent', 'unloadable'] as const) it(`explains the old signature-plus-junk participant fixture with ${mode} codec`, async () => {
    seam.mode = mode
    const broken = Buffer.concat([avatarPng(72).subarray(0, 8), Buffer.alloc(64, 7)])
    const response = await send(broken)
    expect(response.statusCode).toBe(201)
    expect(response.json().upload.disposition).toBe(mode === 'native' ? 'codec did not finish: image processing failed' : codec.AVATAR_DISPOSITIONS.unavailable)
    const held = await app.inject({ method: 'GET', url: response.json().participant.avatarUrl })
    expect(held.rawPayload).toEqual(broken)
    expect(response.json().upload).toMatchObject({ bytesSaved: 0, originalHash: pictureHash(broken), storedHash: pictureHash(broken) })
  })

  for (const failure of ['exit', 'timeout', 'error'] as const) it(`stores the original picture with the reason for a controlled codec ${failure}`, async () => {
    const fail = vi.fn(() => ({ status: failure === 'exit' ? 1 : null, stdout: Buffer.alloc(0), stderr: Buffer.from('controlled codec failure'),
      ...(failure === 'exit' ? {} : { error: Object.assign(new Error(`controlled ${failure}`), { code: failure === 'timeout' ? 'ETIMEDOUT' : 'EIO' }) }),
    }))
    resources.useOsProbe({ ...resources.LINUX_PROBE, runAvatarCodec: fail })
    const bytes = original()
    const response = await send(bytes)
    expect(response.statusCode, response.body).toBe(201)
    expect(fail).toHaveBeenCalledTimes(1)
    expect(fail.mock.calls[0]).toEqual([expect.objectContaining({ timeoutMs: codec.AVATAR_CODEC_TIMEOUT_MS, maxBufferBytes: codec.AVATAR_CODEC_BUFFER_BYTES })])
    expect(response.json().upload).toMatchObject({ bytesSaved: 0, originalHash: pictureHash(bytes), storedHash: pictureHash(bytes),
      disposition: `codec did not finish: ${failure === 'timeout' ? 'time bound' : failure === 'exit' ? 'child failed' : 'unknown reason'}` })
    const served = await app.inject({ method: 'GET', url: response.json().participant.avatarUrl })
    expect(served.rawPayload).toEqual(bytes)
  })

  for (const firstMode of ['native', 'absent'] as const) it(`reuses the immutable ${firstMode} result even when a later codec would fail`, async () => {
    seam.mode = firstMode
    const bytes = original(), first = avatars.storeAvatarUpload(bytes, who)
    const manifest = pictureRecords(dirname(t.file)).find(record => record.data.assetId === undefined && record.data.originalHash === pictureHash(bytes))!.path
    const kept = readFileSync(manifest)
    const fail = vi.fn(() => { throw new Error('later codec must not run') })
    resources.useOsProbe({ ...resources.LINUX_PROBE, runAvatarCodec: fail })
    seam.mode = 'native'
    const second = avatars.storeAvatarUpload(bytes, who)
    expect(second.assetId).toBe(first.assetId)
    expect(second.upload).toEqual(first.upload)
    expect(readFileSync(manifest)).toEqual(kept)
    expect(fail).not.toHaveBeenCalled()
    await expectStoredPicture(dirname(t.file), `/api/assets/${second.assetId}`, bytes, readFileSync(join(dirname(t.file), second.upload.path)))
  })

  for (const winnerMode of ['native', 'absent'] as const) it(`keeps another writer's ${winnerMode} manifest published before this writer's exclusive write`, async () => {
    const bytes = original()
    seam.mode = winnerMode
    const earlier = avatars.storeAvatarUpload(bytes, who)
    const winner = readFileSync(join(dirname(t.file), earlier.upload.path))
    const manifest = pictureRecords(dirname(t.file)).find(record => record.data.assetId === undefined && record.data.originalHash === pictureHash(bytes))!
    const kept = readFileSync(manifest.path)
    unlinkSync(manifest.path)
    seam.mode = winnerMode === 'native' ? 'absent' : 'native'
    let published = false
    seam.beforeWrite = (path, data, options) => {
      if (typeof data !== 'string' || (options as { flag?: string })?.flag !== 'wx') return
      const candidate = JSON.parse(data) as AvatarUploadDescription & { assetId?: string }
      if (candidate.assetId !== undefined || candidate.originalHash !== pictureHash(bytes)) return
      seam.beforeWrite = null
      writeFileSync(path, kept)
      published = true
    }
    const stored = avatars.storeAvatarUpload(bytes, who)
    expect(published).toBe(true)
    expect(stored.upload).toEqual(earlier.upload)
    const sent = await send(bytes)
    expect(sent.statusCode, sent.body).toBe(201)
    const served = await app.inject({ method: 'GET', url: sent.json().participant.avatarUrl })
    await expectStoredPicture(dirname(t.file), sent.json().participant.avatarUrl, bytes, served.rawPayload)
    expect(served.rawPayload).toEqual(winner)
  })

  it('rejects a different picture even when its stored hash and lengths are self-consistent', async () => {
    const bytes = original(), other = avatarPng(73, codec.AVATAR_STORED_SIDE * 2, codec.AVATAR_STORED_SIDE * 2)
    const encoded = codec.compressAvatar(other, 'image/png')
    const forged: AvatarUploadDescription = {
      originalHash: pictureHash(bytes), originalBytes: bytes.length, storedHash: pictureHash(encoded.bytes),
      storedBytes: encoded.bytes.length, bytesSaved: bytes.length - encoded.bytes.length,
      disposition: encoded.disposition, mime: 'image/png', path: '',
    }
    await expect(expectPictureIdentity(bytes, encoded.bytes, forged)).rejects.toThrow(/selected picture/)
  })
})
