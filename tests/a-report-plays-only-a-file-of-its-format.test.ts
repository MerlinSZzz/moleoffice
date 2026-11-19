// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SOUND OR FILM FILE IS THE FORMAT ITS NAME SAYS, AND A PLAYED BLOCK POINTS ONLY AT ONE.
 *
 * A report's `audio` and `video` blocks play a file the office keeps. Two doors keep that honest:
 *
 *   1. THE UPLOAD DOOR, POST /api/report-files. A file whose name ends in .wav, .mp3, .m4a, .mp4 or
 *      .webm must begin with that format's bytes, or it is refused with 415 and the reason, and
 *      nothing is written. Every other file is accepted as before, because a `file` block carries
 *      any file.
 *   2. THE RECORD DOOR, POST /api/records. An `audio` block plays .wav, .mp3 or .m4a and a `video`
 *      block plays .mp4 or .webm. A block whose path ends in anything else is refused with the reason,
 *      and no record is written. This door may not read the disk, so it reads the path's ending, and
 *      door 1 is what makes that ending true.
 *
 * The door checks only the first bytes. So the files that pass here begin as their format does and
 * are not whole recordings; the whole WAV is real, and the others are the first bytes of their kind.
 * Playing is measured in a browser, in tests/a-report-plays-its-audio-and-video.test.ts.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A real WAV file: a PCM header and a tenth of a second of silence. */
function aWav(): Buffer {
  const rate = 8000
  const data = Buffer.alloc(rate / 10 * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

/** The first bytes of an MP4 container: a box of type "ftyp". */
const AN_MP4_START = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'ascii'), Buffer.alloc(12)])

/** One file of each format that begins as that format does. */
const BEGINS_RIGHT: Record<string, Buffer> = {
  'voice.wav': aWav(),
  'voice.mp3': Buffer.concat([Buffer.from('ID3', 'ascii'), Buffer.alloc(20)]),
  'voice.m4a': AN_MP4_START,
  'film.mp4': AN_MP4_START,
  'film.webm': Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)]),
}

/** Bytes that are none of the five formats. */
const NOT_A_RECORDING = Buffer.from('this is plain text and not a recording of anything\n'.repeat(4))

let t: TestDb
let app: FastifyInstance
let previousRoots: string | undefined

beforeAll(async () => {
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  t = await freshDb()
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${dirname(t.file)}`
  const built = await apiApp()
  app = built.app
  await app.ready()
}, 60_000)

afterEach(async () => {
  // The files one case stored are the only thing it leaves in the shared office, so removing them
  // returns the report-file directory to the empty state each case found.
  const store = await import('../src/server/lib/reportfiles.ts')
  rmSync(store.reportFileDirectory(), { recursive: true, force: true })
})

afterAll(async () => {
  await app.close()
  t.close()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
})

async function send(name: string, bytes: Buffer) {
  return app.inject({
    method: 'POST',
    url: '/api/report-files',
    headers: AS_THE_PERSON,
    payload: { bytes: bytes.toString('base64'), name },
  })
}

/** How many files the upload door has stored. */
async function storedFiles(): Promise<number> {
  const store = await import('../src/server/lib/reportfiles.ts')
  const directory = store.reportFileDirectory()
  return existsSync(directory) ? readdirSync(directory).length : 0
}

describe('the upload door', () => {
  it('refuses a file named as sound or film whose bytes are not that format, with the reason, and writes nothing', async () => {
    for (const [name, format] of [
      ['voice.wav', 'WAV'],
      ['voice.mp3', 'MP3'],
      ['voice.m4a', 'M4A'],
      ['film.mp4', 'MP4'],
      ['film.webm', 'WebM'],
      ['LOUD.WAV', 'WAV'],
    ] as const) {
      const answer = await send(name, NOT_A_RECORDING)
      expect(answer.statusCode, `${name}: ${answer.body}`).toBe(415)
      const said = (answer.json() as { error: string }).error
      expect(said).toContain(`That file is named "${name}"`)
      expect(said).toContain(`its bytes are not ${format}`)
      expect(said).toContain('Nothing was written.')
    }
    expect(await storedFiles()).toBe(0)
  })

  it('refuses a file of one format named as another', async () => {
    const answer = await send('voice.wav', BEGINS_RIGHT['film.webm']!)
    expect(answer.statusCode, answer.body).toBe(415)
    expect((answer.json() as { error: string }).error).toContain('every WAV file begins with "RIFF" and has "WAVE" at byte 8')
    expect(await storedFiles()).toBe(0)
  })

  it('stores a file of each of the five formats that begins as its format does', async () => {
    for (const [name, bytes] of Object.entries(BEGINS_RIGHT)) {
      const answer = await send(name, bytes)
      expect(answer.statusCode, `${name}: ${answer.body}`).toBe(201)
      expect((answer.json() as { file: { name: string; size: number } }).file).toMatchObject({ name, size: bytes.length })
    }
    expect(await storedFiles()).toBe(Object.keys(BEGINS_RIGHT).length)
  })

  it('still stores any other file whatever its bytes, for a file block', async () => {
    const answer = await send('notes.txt', NOT_A_RECORDING)
    expect(answer.statusCode, answer.body).toBe(201)
    expect(await storedFiles()).toBe(1)
  })
})

describe('the record door', () => {
  async function write(blocks: Record<string, unknown>[]) {
    return app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'report', title: 'A report with a sample in it', data: { blocks } },
    })
  }

  const FACTS = { name: 'sample', size: 20480, hash: '0a1b2c3d4e5f6071', alt: 'what is heard' }

  function reports(): number {
    return t.api.listRecords({ workspaceId: 'default', kind: 'report' }).length
  }

  it('refuses a played block whose file is not a format it plays, with the reason, and writes nothing', async () => {
    const before = reports()
    for (const [type, path, reason] of [
      ['audio', `${THE_TEST_FIXTURE_ROOT}/report-files/abc.ogg`, 'an audio block plays a .wav, .mp3 or .m4a file, and this path ends in ".ogg". A file of any other format goes in a "file" block'],
      ['audio', `${THE_TEST_FIXTURE_ROOT}/report-files/abc.mp4`, 'ends in ".mp4", which a video block plays: write a video block for it'],
      ['audio', `${THE_TEST_FIXTURE_ROOT}/report-files/abc`, 'this path has no extension'],
      ['video', `${THE_TEST_FIXTURE_ROOT}/report-files/abc.mov`, 'a video block plays a .mp4 or .webm file, and this path ends in ".mov"'],
      ['video', `${THE_TEST_FIXTURE_ROOT}/report-files/abc.wav`, 'a video block plays a .mp4 or .webm file, and this path ends in ".wav", which an audio block plays: write an audio block for it'],
    ] as const) {
      const answer = await write([{ id: 'b-sample', type, path, ...FACTS }])
      expect(answer.statusCode, `${type} ${path}: ${answer.body}`).toBe(400)
      expect((answer.json() as { error: string }).error, `${type} ${path}`).toContain(reason)
    }
    expect(reports()).toBe(before)
  })

  it('accepts an audio block and a video block whose files are formats they play', async () => {
    const answer = await write([
      { id: 'b-voice', type: 'audio', path: `${THE_TEST_FIXTURE_ROOT}/report-files/abc.WAV`, ...FACTS },
      { id: 'b-film', type: 'video', path: `${THE_TEST_FIXTURE_ROOT}/report-files/abc.webm`, ...FACTS, caption: 'The first film.' },
    ])
    expect(answer.statusCode, answer.body).toBe(201)
  })
})
