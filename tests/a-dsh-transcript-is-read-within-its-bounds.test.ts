// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DSH TRANSCRIPT IS READ WITHIN ITS BOUNDS: ITS TEXT HAS A MOST, AND THE FILE READ IS THE FILE THAT WAS CHECKED.
 *
 * A review of wave 13n's inspector files (OcaFB-eOWjWp, carried whole by the secretary in tsiRESr-4X7L). A dsh check's
 * transcript is in the check's private home, where the model has a shell, and the inspector reads it on the host.
 *
 * WHAT IS PROVED, one case each:
 *   - Point 2. A .zstd transcript's text has a most, THE_MOST_OF_A_TRANSCRIPTS_TEXT, over all its frames together. The
 *     limit on the file's size is on its compressed bytes, and a few compressed MB can decode to many GB. One frame
 *     whose text is one byte past the most is not read, and the answer says why. Two frames, each under the most, whose
 *     texts together pass it, are not read either. A transcript whose text is exactly the most is read whole. These
 *     cases compare the text's length, not the text: when a mutation hands back 64 MiB of text, vitest's comparison of
 *     the text itself does not finish.
 *   - Point 2's memory bound. Each frame is handed to zstd with what is left of the most as its maxOutputLength, so
 *     zstd stops a frame that would pass the most before its text is in memory. The running total alone cannot do
 *     this: it is checked only after a whole frame has been decoded, and the answer is the same sentence either way.
 *     So the case reads it through a spy on node:zlib, which records the maxOutputLength each frame is given and how
 *     many bytes zstd handed back.
 *   - Point 1. The file read is the file that was checked. O_NOFOLLOW guards only the last name, so the file is read
 *     only through the descriptor it was opened as, and only when that descriptor is the file the caller looked at
 *     (its device and inode) and /proc/self/fd says it is inside the real sessions folder. Another file put at its name
 *     after the look is refused. So is the very file that was looked at, when its folder has been moved out of the
 *     sessions folder and a link left in its place. A link at the last name, a folder, and a file past the most are
 *     refused too.
 *
 * Nothing here is a real transcript: each frame is spaces, or a made-up line, compressed by Node's own zstd. Each file
 * of point 1 is a made-up line in a temporary folder of this test's own, removed after each case.
 *
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run, then restored:
 *   - Decode each frame with no maxOutputLength and keep no running total: the first two cases go red, and so does the
 *     case of what zstd is handed.
 *   - Keep maxOutputLength on each frame but no running total: the two-frame case goes red, and so does the case of
 *     what zstd is handed.
 *   - Decode each frame with no maxOutputLength but keep the running total: the case of what zstd is handed goes red.
 *   - No comparison of the opened file's device and inode with the file looked at: the case of another file goes red.
 *   - No look at /proc/self/fd: the case of the folder moved out goes red.
 */
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { constants, zstdCompressSync } from 'node:zlib'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { theFileThatWasChecked } from '../tools/inspector-checked-file.mjs'
import { textOfTheTranscript, theTextOfTheTranscript, THE_MOST_OF_A_TRANSCRIPTS_TEXT } from '../tools/dsh-hooks/served.mjs'

/** EACH CALL TO ZSTD'S DECODER: the maxOutputLength it was given, and how many bytes it handed back, or that it refused. */
const decodes = vi.hoisted(() => [] as { maxOutputLength: number | undefined; gave: number | 'refused' }[])
vi.mock('node:zlib', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:zlib')>()
  const zstdDecompressSync = ((...args: Parameters<typeof real.zstdDecompressSync>) => {
    const one: (typeof decodes)[number] = { maxOutputLength: args[1]?.maxOutputLength, gave: 'refused' }
    decodes.push(one)
    const out = real.zstdDecompressSync(...args)
    one.gave = out.length
    return out
  }) as typeof real.zstdDecompressSync
  return { ...real, default: { ...real, zstdDecompressSync }, zstdDecompressSync }
})

const PATH = 'session.v3.jsonl.zstd'
const PAST_THE_MOST = `its text is longer than ${String(THE_MOST_OF_A_TRANSCRIPTS_TEXT)} bytes, the most a transcript is decoded to`

/** What a read gave, with the length of its text in place of the text. */
function inShort(read: { text: string | null; why?: string }): { length: number | null; why?: string } {
  return { length: read.text === null ? null : read.text.length, ...(read.why === undefined ? {} : { why: read.why }) }
}

/** One frame of `size` spaces, as dsh compresses one write: with the checksum flag. */
function aFrameOfSpaces(size: number): Buffer {
  return zstdCompressSync(Buffer.alloc(size, 0x20), { params: { [constants.ZSTD_c_checksumFlag]: 1 } })
}

describe('a .zstd transcript is decoded to at most THE_MOST_OF_A_TRANSCRIPTS_TEXT', () => {
  it('is 64 MiB', () => {
    expect(THE_MOST_OF_A_TRANSCRIPTS_TEXT).toBe(64 * 1024 * 1024)
  })

  it('reads no text from one frame whose text is one byte past the most, and says why', () => {
    const bytes = aFrameOfSpaces(THE_MOST_OF_A_TRANSCRIPTS_TEXT + 1)
    // THE CASE'S OWN PREMISE: the file is small, so the limit on its size does not stop it.
    expect(bytes.length).toBeLessThan(64 * 1024)
    expect(inShort(theTextOfTheTranscript(PATH, bytes))).toEqual({ length: null, why: PAST_THE_MOST })
    expect(textOfTheTranscript(PATH, bytes)?.length ?? null).toBeNull()
  })

  it('reads no text from two frames each under the most, whose texts together pass it', () => {
    const half = THE_MOST_OF_A_TRANSCRIPTS_TEXT / 2
    const bytes = Buffer.concat([aFrameOfSpaces(half), aFrameOfSpaces(half + 1)])
    expect(inShort(theTextOfTheTranscript(PATH, bytes))).toEqual({ length: null, why: PAST_THE_MOST })
    expect(textOfTheTranscript(PATH, bytes)?.length ?? null).toBeNull()
  })

  it('reads a transcript whose text is exactly the most, whole', () => {
    const half = THE_MOST_OF_A_TRANSCRIPTS_TEXT / 2
    const read = theTextOfTheTranscript(PATH, Buffer.concat([aFrameOfSpaces(half), aFrameOfSpaces(half)]))
    expect(inShort(read)).toEqual({ length: THE_MOST_OF_A_TRANSCRIPTS_TEXT })
    expect('why' in read).toBe(false)
  })

  it('gives each frame what is left of the most as its maxOutputLength, so zstd decodes no frame past it', () => {
    const half = THE_MOST_OF_A_TRANSCRIPTS_TEXT / 2
    decodes.splice(0)
    expect(inShort(theTextOfTheTranscript(PATH, aFrameOfSpaces(THE_MOST_OF_A_TRANSCRIPTS_TEXT + 1)))).toEqual({ length: null, why: PAST_THE_MOST })
    expect(decodes.splice(0)).toEqual([{ maxOutputLength: THE_MOST_OF_A_TRANSCRIPTS_TEXT, gave: 'refused' }])
    expect(inShort(theTextOfTheTranscript(PATH, Buffer.concat([aFrameOfSpaces(half), aFrameOfSpaces(half + 1)])))).toEqual({ length: null, why: PAST_THE_MOST })
    expect(decodes.splice(0)).toEqual([
      { maxOutputLength: THE_MOST_OF_A_TRANSCRIPTS_TEXT, gave: half },
      { maxOutputLength: half, gave: 'refused' },
    ])
  })

  it('says why when the bytes are not whole frames, and when zstd refuses a frame', () => {
    const line = zstdCompressSync(Buffer.from('{"type":"user/message"}\n'), { params: { [constants.ZSTD_c_checksumFlag]: 1 } })
    expect(theTextOfTheTranscript(PATH, line.subarray(0, line.length - 3))).toEqual({ text: null, why: 'its bytes are not whole zstd frames' })
    // A WRONG CHECKSUM: the frame's shape is whole, and zstd itself refuses it.
    const wrong = Buffer.from(line)
    wrong.writeUInt8(wrong.readUInt8(wrong.length - 1) ^ 0xff, wrong.length - 1)
    expect(theTextOfTheTranscript(PATH, wrong)).toEqual({ text: null, why: 'zstd refused one of its frames' })
    expect(theTextOfTheTranscript(PATH, line)).toEqual({ text: '{"type":"user/message"}\n' })
  })
})

const A_LINE = '{"type":"user/message"}\n'

const scratches: string[] = []
afterEach(() => {
  for (const one of scratches.splice(0)) rmSync(one, { recursive: true, force: true })
})

/** A temporary folder of this test's own, with a sessions folder and one session's transcript in it. */
function aSessionsFolder(): { root: string; sessions: string; folder: string; file: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-transcript-read-')))
  scratches.push(root)
  const sessions = join(root, 'sessions')
  const folder = join(sessions, '--work--', 'a-session')
  mkdirSync(folder, { recursive: true })
  const file = join(folder, 'session.v3.jsonl')
  writeFileSync(file, A_LINE)
  return { root, sessions, folder, file }
}

describe('a transcript is read only through the file that was checked', () => {
  it('reads the file that was checked, whole', () => {
    const { sessions, file } = aSessionsFolder()
    const read = theFileThatWasChecked(file, lstatSync(file), sessions)
    expect(read.ok ? read.bytes.toString('utf8') : read.why).toBe(A_LINE)
  })

  it('refuses another file put at its name after it was checked', () => {
    const { sessions, folder, file } = aSessionsFolder()
    const checked = lstatSync(file)
    writeFileSync(join(folder, 'another'), 'Another made-up line.\n')
    renameSync(join(folder, 'another'), file)
    // THE CASE'S OWN PREMISE: the name leads to another file, in the same folder.
    expect(lstatSync(file).ino).not.toBe(checked.ino)
    expect(theFileThatWasChecked(file, checked, sessions)).toEqual({ ok: false, why: 'the file opened is not the file that was checked, so it was not read' })
  })

  it('refuses the file that was checked when its folder was moved out of the sessions folder and a link left in its place', () => {
    const { root, sessions, folder, file } = aSessionsFolder()
    const checked = lstatSync(file)
    const outside = join(root, 'outside')
    renameSync(folder, outside)
    symlinkSync(outside, folder)
    // THE CASE'S OWN PREMISE: through the link, the name leads to the very file that was checked, now outside.
    expect(statSync(file).ino).toBe(checked.ino)
    expect(theFileThatWasChecked(file, checked, sessions)).toEqual({ ok: false, why: 'the file opened is outside its own folder, so it was not read' })
  })

  it('refuses a link at the last name, a folder, and a file past the most', () => {
    const { sessions, folder, file } = aSessionsFolder()
    expect(theFileThatWasChecked(file, lstatSync(file), sessions, { most: 4 })).toEqual({ ok: false, why: `it is ${String(Buffer.byteLength(A_LINE))} bytes, more than the 4 this tool reads` })
    expect(theFileThatWasChecked(folder, lstatSync(folder), sessions)).toEqual({ ok: false, why: 'it is not a regular file' })
    const checked = lstatSync(file)
    renameSync(file, join(folder, 'moved'))
    symlinkSync(join(folder, 'moved'), file)
    expect(theFileThatWasChecked(file, checked, sessions)).toEqual({ ok: false, why: 'it could not be opened (ELOOP)' })
  })
})
