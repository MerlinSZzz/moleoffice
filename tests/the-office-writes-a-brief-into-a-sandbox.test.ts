// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE PLACE THE OFFICE'S SERVER WRITES INTO A SANDBOX FOLDER (tier 2 of the owner's decision, round B, part 7;
 * Fr7xGMIidn97, way (a), on the conditions of XHY2fVFG3Qq8, answer 6). `writeABriefIntoASandbox`
 * writes a brief as a new file in the sandbox's briefs folder. A program in the sandbox can change that folder while the
 * office writes, so the writer refuses rather than write through a link.
 *
 * WHAT THIS FILE PROVES:
 * 1. A brief is written as `<stem>.md` in the briefs folder of the sandbox folder's real path, and the text is given
 *    the name it is written under. A name that is taken goes on to `<stem>-2.md`, and the file there is not touched.
 * 2. A link at the brief's name counts as taken: the office writes the next name and never writes through the link.
 * 3. A briefs folder that is a link, or is missing, and a sandbox folder that cannot be read, are refused, and nothing is
 *    written anywhere. So is a brief whose every name the office tries is taken: it tries 20, `<stem>.md` and then
 *    `<stem>-2.md` to `<stem>-20.md`, because the server tries them on its one thread (x2y70-Bc8xmi). And so is a
 *    name that holds anything but letters, digits, "-" and "_", which the writer checks itself rather than trust its
 *    caller (a review, forwarded in 8MQYUt5KEfoD).
 * 4. When the folder the office holds open is not the briefs folder, or the file it created is not the one at the path
 *    it names, or the file's name in the folder it holds leads anywhere but that path, nothing is written into it. A write
 *    that fails says the file may hold part of the brief. On a system that is not Linux it refuses, because it cannot
 *    hold the folder open there.
 *
 * Case 4 makes those swaps happen by answering the writer's own `realpathSync`, `lstatSync` and `writeFileSync` once with
 * a made-up answer, because a race with a real program cannot be timed in a test. Everything else is real files. All
 * of it is synthetic and made under the temporary directory, and removed after.
 *
 * THE FOLDER IS HELD OPEN BY THE OPERATING-SYSTEM LAYER, `inAFolderHeldOpen` in src/server/lib/resources.ts, which
 * lib/key-files.ts holds a folder with too (A7). Importing that file opens the database it
 * points at, so this file makes a test database first and imports the writer, and the `node:fs` the writer reads, after
 * it. The database is not used.
 */
import type * as NodeFs from 'node:fs'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  const lstatSync = vi.fn(real.lstatSync)
  const realpathSync = vi.fn(real.realpathSync)
  const writeFileSync = vi.fn(real.writeFileSync)
  return { ...real, default: { ...real, lstatSync, realpathSync, writeFileSync }, lstatSync, realpathSync, writeFileSync }
})

type WriterLib = typeof import('../src/server/lib/the-office-writes-into-a-sandbox.ts')
/** The `node:fs` the writer reads, imported after the test database, so a made-up answer reaches the writer. */
let fs: typeof NodeFs
let writeABriefIntoASandbox: WriterLib['writeABriefIntoASandbox']
let t: TestDb | undefined
let scratch: string
let n = 0
/** A synthetic sandbox folder, with a briefs folder unless `briefs` is false. */
function aSandbox(briefs = true): string {
  n += 1
  const folder = join(scratch, `sandbox-${String(n)}`)
  mkdirSync(briefs ? join(folder, 'briefs') : folder, { recursive: true })
  return folder
}
const text = (name: string) => `# Synthetic brief ${name}\n`
const listed = (dir: string) => readdirSync(dir).sort()

beforeAll(async () => {
  t = await freshDb()
  fs = await import('node:fs')
  ;({ writeABriefIntoASandbox } = await import('../src/server/lib/the-office-writes-into-a-sandbox.ts'))
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'the-office-writes-a-brief-into-a-sandbox-')))
})
// IN VITEST 4 A RESET PUTS BACK THE IMPLEMENTATION EACH vi.fn WAS MADE WITH, which is the real one.
afterEach(() => { vi.mocked(fs.lstatSync).mockReset(); vi.mocked(fs.realpathSync).mockReset(); vi.mocked(fs.writeFileSync).mockReset() })
afterAll(() => { t?.close(); if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true }) })

describe('a brief written into a sandbox', () => {
  it('is a new file named for its stem in the briefs folder, and a name that is taken goes on to the next', () => {
    const folder = aSandbox()
    const first = writeABriefIntoASandbox(folder, 'resolve-synthEntry1', text)
    expect(first).toEqual({ path: join(folder, 'briefs', 'resolve-synthEntry1.md'), name: 'resolve-synthEntry1' })
    expect(readFileSync(join(folder, 'briefs', 'resolve-synthEntry1.md'), 'utf8')).toBe('# Synthetic brief resolve-synthEntry1\n')
    expect(statSync(join(folder, 'briefs', 'resolve-synthEntry1.md')).mode & 0o777).toBe(0o644 & ~process.umask())

    const second = writeABriefIntoASandbox(folder, 'resolve-synthEntry1', text)
    expect(second).toEqual({ path: join(folder, 'briefs', 'resolve-synthEntry1-2.md'), name: 'resolve-synthEntry1-2' })
    expect(readFileSync(join(folder, 'briefs', 'resolve-synthEntry1-2.md'), 'utf8')).toBe('# Synthetic brief resolve-synthEntry1-2\n')
    expect(readFileSync(join(folder, 'briefs', 'resolve-synthEntry1.md'), 'utf8')).toBe('# Synthetic brief resolve-synthEntry1\n')
  })

  it('is written into the real folder when the sandbox folder is named through a link', () => {
    const folder = aSandbox()
    const named = join(scratch, `named-${String(n)}`)
    symlinkSync(folder, named)
    expect(writeABriefIntoASandbox(named, 'resolve-synthEntry2', text)).toEqual({ path: join(folder, 'briefs', 'resolve-synthEntry2.md'), name: 'resolve-synthEntry2' })
  })

  it('takes a link at its name as taken, writes the next name, and leaves what the link points at as it was', () => {
    const folder = aSandbox()
    const outside = join(scratch, `outside-${String(n)}.md`)
    writeFileSync(outside, 'Synthetic: a file outside the sandbox.\n')
    symlinkSync(outside, join(folder, 'briefs', 'resolve-synthEntry3.md'))
    expect(writeABriefIntoASandbox(folder, 'resolve-synthEntry3', text)).toEqual({ path: join(folder, 'briefs', 'resolve-synthEntry3-2.md'), name: 'resolve-synthEntry3-2' })
    expect(readFileSync(outside, 'utf8')).toBe('Synthetic: a file outside the sandbox.\n')
  })
})

describe('a brief the office refuses to write', () => {
  it('refuses a briefs folder that is a link, and writes nothing where it points', () => {
    const folder = aSandbox(false)
    const elsewhere = join(scratch, `elsewhere-${String(n)}`)
    mkdirSync(elsewhere)
    symlinkSync(elsewhere, join(folder, 'briefs'))
    const r = writeABriefIntoASandbox(folder, 'resolve-synthEntry4', text)
    expect(r).toEqual({ refused: `${join(folder, 'briefs')} is a link or not a folder, and the office does not write through a link. Nothing was written.` })
    expect(listed(elsewhere)).toEqual([])
  })

  it('refuses a sandbox with no briefs folder, and makes none', () => {
    const folder = aSandbox(false)
    const r = writeABriefIntoASandbox(folder, 'resolve-synthEntry5', text)
    expect(r).toEqual({ refused: `The office cannot hold the briefs folder ${join(folder, 'briefs')} open while it writes: ENOENT. Nothing was written.` })
    expect(listed(folder)).toEqual([])
  })

  it('refuses a sandbox folder that cannot be read', () => {
    const missing = join(scratch, 'no-such-sandbox')
    expect(writeABriefIntoASandbox(missing, 'resolve-synthEntry6', text)).toEqual({ refused: expect.stringMatching(new RegExp(`^The sandbox folder ${missing} cannot be read: ENOENT.+\\. Nothing was written\\.$`)) })
  })

  it('refuses when every one of the 20 names it tries is taken, and makes no name after the last', () => {
    const folder = aSandbox()
    const briefs = join(folder, 'briefs')
    const taken = Array.from({ length: 20 }, (_, i) => `resolve-synthEntry11${i === 0 ? '' : `-${String(i + 1)}`}.md`)
    for (const name of taken) writeFileSync(join(briefs, name), 'Synthetic: a name that is taken.\n')
    expect(writeABriefIntoASandbox(folder, 'resolve-synthEntry11', text)).toEqual({
      refused: `Every name the office tries in ${briefs} is taken, from resolve-synthEntry11.md to resolve-synthEntry11-20.md, and it tries no more than 20. Nothing was written.`,
    })
    expect(listed(briefs)).toEqual([...taken].sort())
  })

  it('refuses a name that holds anything but letters, digits, "-" and "_", and writes nothing, in the folder or above it', () => {
    const folder = aSandbox()
    // WITHOUT THE CHECK an empty name is written as `.md`, and a name with "/" in it reaches the held folder's own
    // refusal, which throws, and which the office should not have to rely on.
    expect(writeABriefIntoASandbox(folder, '', text)).toEqual({ refused: 'A brief\'s name holds only letters, digits, "-" and "_", and "" does not. Nothing was written.' })
    expect(writeABriefIntoASandbox(folder, '../resolve-synthEntry12', text)).toEqual({ refused: 'A brief\'s name holds only letters, digits, "-" and "_", and "../resolve-synthEntry12" does not. Nothing was written.' })
    expect(listed(folder)).toEqual(['briefs'])
    expect(listed(join(folder, 'briefs'))).toEqual([])
  })

  it('writes nothing when the folder it holds open is not the briefs folder', () => {
    const folder = aSandbox()
    const actual = vi.mocked(fs.realpathSync).getMockImplementation()!
    vi.mocked(fs.realpathSync).mockImplementation(((path: NodeFs.PathLike) => (String(path).startsWith('/proc/self/fd/') ? join(scratch, 'moved') : actual(path))) as typeof NodeFs.realpathSync)
    expect(writeABriefIntoASandbox(folder, 'resolve-synthEntry7', text)).toEqual({ refused: `The briefs folder the office opened is at ${join(scratch, 'moved')}, not ${join(folder, 'briefs')}. Nothing was written.` })
    expect(listed(join(folder, 'briefs'))).toEqual([])
  })

  it('writes nothing into a file it created that is not the one at the path it names, and leaves that file empty', () => {
    const folder = aSandbox()
    const other = join(scratch, `other-${String(n)}`)
    writeFileSync(other, '')
    vi.mocked(fs.lstatSync).mockImplementationOnce((() => statSync(other)) as unknown as typeof NodeFs.lstatSync)
    const path = join(folder, 'briefs', 'resolve-synthEntry8.md')
    expect(writeABriefIntoASandbox(folder, 'resolve-synthEntry8', text)).toEqual({ refused: `${path} changed while the office created it, so the office wrote nothing into the file it created, which is left empty.` })
    expect(readFileSync(path, 'utf8')).toBe('')
  })

  it('writes nothing into a file it created whose name in the folder it holds leads anywhere but the path it names', () => {
    const folder = aSandbox()
    const actual = vi.mocked(fs.realpathSync).getMockImplementation()!
    const elsewhere = join(scratch, 'elsewhere.md')
    vi.mocked(fs.realpathSync).mockImplementation(((path: NodeFs.PathLike) => (String(path).startsWith('/proc/self/fd/') && String(path).endsWith('.md') ? elsewhere : actual(path))) as typeof NodeFs.realpathSync)
    const path = join(folder, 'briefs', 'resolve-synthEntry13.md')
    expect(writeABriefIntoASandbox(folder, 'resolve-synthEntry13', text)).toEqual({ refused: `${path} changed while the office created it, so the office wrote nothing into the file it created, which is left empty.` })
    expect(readFileSync(path, 'utf8')).toBe('')
  })

  it('says the file may hold part of the brief when the write fails', () => {
    const folder = aSandbox()
    vi.mocked(fs.writeFileSync).mockImplementationOnce(() => { throw new Error('Synthetic: the disk is full') })
    const path = join(folder, 'briefs', 'resolve-synthEntry9.md')
    expect(writeABriefIntoASandbox(folder, 'resolve-synthEntry9', text)).toEqual({ refused: `${path} was created, and writing the brief into it failed: Synthetic: the disk is full. The file may hold part of the brief.` })
  })

  it('refuses on a system that is not Linux, where it cannot hold the folder open, and writes nothing', () => {
    const folder = aSandbox()
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    try {
      expect(writeABriefIntoASandbox(folder, 'resolve-synthEntry10', text)).toEqual({ refused: `The office cannot hold the briefs folder ${join(folder, 'briefs')} open while it writes: darwin has no /proc/self/fd to hold a folder open by, so nothing was done. Nothing was written.` })
    } finally { Object.defineProperty(process, 'platform', platform) }
    expect(listed(join(folder, 'briefs'))).toEqual([])
  })
})
