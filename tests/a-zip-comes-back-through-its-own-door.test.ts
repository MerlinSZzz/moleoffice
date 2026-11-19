// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ZIP SOMEBODY BROUGHT BACK FROM OUTSIDE COMES IN THROUGH ONE DOOR OF ITS OWN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion F16, point 5, of design/flows/ACCEPTANCE.md, which says
 * that an outside return may be text, pictures or a zip, and the zip comes
 * in through one new door built the way the pictures door is, stored beside the pictures, refused
 * above 50 MB, never opened by the office, and kept as long as the record that points at it.
 *
 * Seven things:
 *
 *   1. THE READ SAYS THE LIMIT AND THE TYPE. GET /api/returned-files answers the largest size and
 *      the one type BEFORE a person chooses a file, the way GET /api/messages/pictures does.
 *   2. A DIRECTORY OUTSIDE EVERY PREVIEW ROOT REFUSES BEFORE ANYTHING IS WRITTEN. A file accepted,
 *      stored and then unservable is worse than a refusal, because the preview door would never
 *      read it back.
 *   3. A FILE THAT IS NOT A ZIP IS REFUSED, and the refusal names the bytes it found instead.
 *   4. A FILE ONE BYTE OVER THE LIMIT IS REFUSED, and the refusal names the limit and the size.
 *   5. A ZIP UNDER THE LIMIT IS STORED, and the path comes back and the bytes on disk are the bytes
 *      that were sent.
 *   6. AN EMPTY BODY IS REFUSED.
 *   7. BASE64 THAT CANNOT BE READ IS REFUSED, before anything is written.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   answer a limit that is not the one in force                 → case 1
 *   skip the preview-root check and write anyway                → case 2
 *   stop checking the four-byte zip signature                   → case 3
 *   stop checking the size against the setting                  → case 4
 *   write bytes other than the ones that arrived                → case 5
 *   read an empty body as a file                                → case 6
 *   decode base64 without checking its shape                    → case 7
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE DATABASE DIRECTORY IS ADDED TO THE PREVIEW ROOTS, AND WHY THAT IS NOT CHEATING
 * ---------------------------------------------------------------------------------------
 *
 * A returned file is stored beside the database, and GET /api/file reads only inside a preview
 * root. A test database lives in a temporary directory of its own, so without naming it the upload
 * door would refuse — which is the door being right rather than the test being wrong: it will not
 * store a file nothing could ever serve. So this test names the directory its database lives in,
 * which is what a real installation gets for free by keeping its database inside the checkout.
 *
 * NO SERVER IS STARTED. `apiApp` builds the product's own server without listening, and every
 * request goes through `app.inject`, so this file touches no port and no shared database.
 *
 * The zip is built byte by byte in this file, so what the door stores is a real zip and not four
 * bytes wearing the marker's name.
 */

import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The checkout, so it stays a preview root beside this test's temporary database directory. */
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

/** Small enough that a test can hold a file over it without building megabytes. */
const LIMIT = 4096

/** A CRC-32 of bytes, so the zip built below is a real archive rather than four bytes and a name. */
function crc32Of(bytes: Buffer): number {
  let c = 0xffffffff
  for (const byte of bytes) {
    c ^= byte
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (c ^ 0xffffffff) >>> 0
}

/** Build a real zip holding one stored entry, with its local header, central directory and end. */
function aZipHolding(name: string, contents: Buffer): Buffer {
  const nameBytes = Buffer.from(name, 'utf8')
  const crc = crc32Of(contents)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0, 6)
  local.writeUInt16LE(0, 8)
  local.writeUInt16LE(0, 10)
  local.writeUInt16LE(0, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(contents.length, 18)
  local.writeUInt32LE(contents.length, 22)
  local.writeUInt16LE(nameBytes.length, 26)
  local.writeUInt16LE(0, 28)
  const body = Buffer.concat([local, nameBytes, contents])

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(0, 10)
  central.writeUInt16LE(0, 12)
  central.writeUInt16LE(0, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(contents.length, 20)
  central.writeUInt32LE(contents.length, 24)
  central.writeUInt16LE(nameBytes.length, 28)
  central.writeUInt16LE(0, 30)
  central.writeUInt16LE(0, 32)
  central.writeUInt16LE(0, 34)
  central.writeUInt16LE(0, 36)
  central.writeUInt32LE(0, 38)
  central.writeUInt32LE(0, 42)
  const centralDirectory = Buffer.concat([central, nameBytes])

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(body.length, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([body, centralDirectory, end])
}

/** The zip this test sends: one small text file of outside work, under the limit. */
const A_ZIP = aZipHolding('outside-work/notes.txt', Buffer.from('the outside work came back'))

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'f16-zip-door',
}

let t: TestDb
let app: FastifyInstance
let lib: typeof import('../src/server/lib/returnedfiles.ts')
let ours = ''
let previousRoots: string | undefined
let previousLimit: string | undefined

beforeAll(async () => {
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  previousLimit = process.env['MOLE_OFFICE_RETURNED_FILE_MAX_BYTES']
  // A LOW LIMIT, so the refusal can be met with a small file instead of a fifty megabyte one. Set
  // before the app is built, because the route reads the number once when it registers.
  process.env['MOLE_OFFICE_RETURNED_FILE_MAX_BYTES'] = String(LIMIT)
  t = await freshDb()
  ours = dirname(t.file)
  // THE DATABASE'S OWN DIRECTORY IS A ROOT, because that is where the returned file will be stored.
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${ours}`
  const built = await apiApp()
  app = built.app
  await app.ready()
  lib = await import('../src/server/lib/returnedfiles.ts')
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  if (previousLimit === undefined) delete process.env['MOLE_OFFICE_RETURNED_FILE_MAX_BYTES']
  else process.env['MOLE_OFFICE_RETURNED_FILE_MAX_BYTES'] = previousLimit
})

/** One request to the returned-file door, and its answer read as JSON. */
async function send(bytes: unknown): Promise<{ status: number; error: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/returned-files',
    headers: HEADERS,
    payload: JSON.stringify(bytes),
  })
  let error = ''
  try {
    error = (JSON.parse(reply.body) as { error?: string }).error ?? ''
  } catch {
    error = reply.body
  }
  return { status: reply.statusCode, error }
}

describe('one door takes a zip somebody brought back from outside', () => {
  it('says the largest size and the one type before anything is chosen', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/returned-files', headers: HEADERS })
    expect(reply.statusCode, reply.body).toBe(200)
    const body = JSON.parse(reply.body) as {
      returnedFile: { maxBytes: number; type: string; types: string[]; said: string }
    }
    // THE NUMBER IN FORCE, not the built-in one, so a lowered limit reaches the chooser.
    expect(body.returnedFile.maxBytes).toBe(LIMIT)
    expect(body.returnedFile.type).toBe('application/zip')
    expect(body.returnedFile.types).toContain('zip')
    expect(body.returnedFile.said).toContain('ZIP')
  })

  it('refuses before writing when the directory is outside every preview root', async () => {
    // PREVIEWS TURNED OFF. The store beside the database is a built-in root wherever the database
    // lives, so naming only the checkout no longer leaves the returned files out; an empty setting does.
    process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = ''
    try {
      expect(existsSync(lib.returnedFileDirectory()), 'nothing was stored before this case').toBe(false)
      const answer = await send({ bytes: A_ZIP.toString('base64') })
      expect(answer.status).toBe(500)
      expect(answer.error).toContain('Nothing was written')
      expect(answer.error).toContain(lib.returnedFileDirectory())
      // THE DIRECTORY WAS NOT EVEN MADE, which is what "before any bytes are written" means.
      expect(existsSync(lib.returnedFileDirectory()), 'nothing was written and nothing was made').toBe(false)
    } finally {
      process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${ours}`
    }
  })

  it('refuses bytes that are not a zip, and names what it found instead', async () => {
    const notAZip = Buffer.from('these words are not a zip at all')
    const answer = await send({ bytes: notAZip.toString('base64') })
    expect(answer.status).toBe(415)
    expect(answer.error).toContain('Nothing was written')
    // THE BYTES THEMSELVES, so the caller can see what arrived: "thes" in hex, and in letters.
    expect(answer.error).toContain('74 68 65 73')
    expect(answer.error).toContain('thes')
    expect(existsSync(lib.returnedFileDirectory())).toBe(false)
  })

  it('refuses a file one byte over the limit, naming the limit and the size', async () => {
    // A REAL ZIP HEADER FIRST, so the only reason to refuse it is its size.
    const oneOver = Buffer.concat([A_ZIP.subarray(0, 4), Buffer.alloc(LIMIT + 1 - 4, 7)])
    expect(oneOver.length).toBe(LIMIT + 1)
    const answer = await send({ bytes: oneOver.toString('base64') })
    expect(answer.status).toBe(413)
    expect(answer.error).toContain(String(LIMIT + 1))
    expect(answer.error).toContain(String(LIMIT))
    expect(answer.error).toContain('Nothing was written')
    expect(existsSync(lib.returnedFileDirectory())).toBe(false)
  })

  it('refuses an empty body, and an empty file, both before writing', async () => {
    const noBytes = await send({})
    expect(noBytes.status).toBe(400)
    expect(noBytes.error).toContain('Nothing was written')
    const emptyFile = await send({ bytes: '' })
    expect(emptyFile.status).toBe(400)
    expect(emptyFile.error).toContain('Nothing was written')
  })

  it('refuses base64 that cannot be read, before anything is written', async () => {
    const answer = await send({ bytes: 'not base64 !!' })
    expect(answer.status).toBe(400)
    expect(answer.error).toContain('base64')
    expect(answer.error).toContain('Nothing was written')
  })

  it('takes base64 the way the base64 command writes it, wrapped in lines', async () => {
    // THE `base64` COMMAND WRAPS AT 76 CHARACTERS, so a person who encodes a zip at a terminal and
    // pastes the result has sent exactly the right bytes with newlines through them. That is the
    // only thing whitespace can mean here, so it comes out rather than being refused. What stays
    // strict is the storage: the case above still refuses a body base64 cannot hold.
    const wrapped = (A_ZIP.toString('base64').match(/.{1,76}/gu) ?? []).join('\n')
    expect(wrapped).toContain('\n')
    const reply = await app.inject({
      method: 'POST',
      url: '/api/returned-files',
      headers: HEADERS,
      payload: JSON.stringify({ bytes: wrapped }),
    })
    expect(reply.statusCode, reply.body).toBe(201)
    const stored = (JSON.parse(reply.body) as { returnedFile: { path: string; bytes: number } }).returnedFile
    expect(stored.bytes).toBe(A_ZIP.length)
    expect(readFileSync(stored.path).equals(A_ZIP)).toBe(true)
  })

  it('stores a zip under the limit and hands back the path', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/returned-files',
      headers: HEADERS,
      payload: JSON.stringify({ bytes: A_ZIP.toString('base64') }),
    })
    expect(reply.statusCode, reply.body).toBe(201)
    const body = JSON.parse(reply.body) as {
      returnedFile: { path: string; mime: string; bytes: number }
    }
    const stored = body.returnedFile
    expect(stored.mime).toBe('application/zip')
    expect(stored.bytes).toBe(A_ZIP.length)
    expect(stored.path.startsWith(lib.returnedFileDirectory())).toBe(true)
    expect(stored.path.endsWith('.zip')).toBe(true)
    // THE FILE ON DISK IS THE BYTES THAT WERE SENT, byte for byte.
    expect(readFileSync(stored.path).equals(A_ZIP)).toBe(true)
  })

  it('takes the file from the database directory this test made, under the temporary root', () => {
    // A guard on the whole file: the file really landed under the temporary directory, so nothing
    // above wrote into the checkout or the owner's own data directory.
    const directory = lib.returnedFileDirectory()
    expect(directory.startsWith(ours)).toBe(true)
    expect(directory.startsWith(join(tmpdir(), 'mole-office-'))).toBe(true)
  })
})
