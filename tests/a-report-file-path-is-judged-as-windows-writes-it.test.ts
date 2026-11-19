// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT FILE'S PATH IS JUDGED AS WINDOWS WRITES IT, AND THE READ REFUSES A LINK THERE TOO (wave 13n, round DN).
 *
 * WHY. tools/office-mcp.mjs judged a report file's path with node's own isAbsolute and normalize, split the path on
 * "/" only to find a credentials folder, and opened with O_NOFOLLOW and O_NONBLOCK, which Windows does not have. On
 * Windows it accepted "\\work" and "\\\\server\\share" that src/config/the-paths-of-a-system.mjs refuses, refused a
 * path written with "/", missed a credentials folder written with a backslash, and followed a link at the open with
 * nothing comparing the file opened with the file at the path.
 *
 * HOW WINDOWS IS STOOD IN. Every rule takes the system as a parameter ('win32', 'linux', 'darwin'), as
 * src/config/the-paths-of-a-system.mjs does, and process.platform is never changed. The constants the open uses are
 * stood in too, so a system with no O_NOFOLLOW is proved on this host: a real link in a temporary folder is opened by
 * a read whose constants have none, and the comparison after the open must refuse it.
 *
 * WHAT THE CASES CHECK. Every refusal sentence comes from the exported sentence function that the code itself calls,
 * given this test's own values. The test builds no sentence of its own and carries no long literal from the tool.
 * Linux and the Mac are checked against the answer the two base checks give: posix.isAbsolute and posix.normalize.
 *
 * NOT SHOWN HERE. Nothing has run on Windows. realpathSync on Windows expands 8.3 short names, which this change does
 * not answer.
 *
 * MUTATIONS, each alone after a control run and each restored:
 *   1. the full-path check back to the host's isAbsolute (path.startsWith("/"))        -> case 1 red
 *   2. a Windows path holding "/" refused again, as the normalize comparison did       -> case 2a red
 *   3. the credentials split back to "/" only, ignoring the system                     -> case 3 red
 *   4. the open ORing all three constants and always trusting O_NOFOLLOW               -> case 4 red
 *   5. every system splitting on both separators, so Linux takes a "\" as one          -> cases 2c and 3 red
 *   6. the opened-file comparison dropping dev and keeping ino                         -> case 4 red
 *   7. the read skipping the comparison after the open when the open cannot refuse     -> case 4 red
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { describe, expect, it } from 'vitest'

import { howAFullPathIsWritten } from '../src/config/the-paths-of-a-system.mjs'
import {
  aReportFileRead,
  howAReportFileIsOpened,
  theCredentialsPartIn,
  theFullPathIsNotWritten,
  theLinkIsRefused,
  theLinkRefused,
  theOpenedFileIsNotThePath,
  theOpenedFileRefused,
  theReportFilePathRefused,
} from '../tools/office-mcp.mjs'

const WINDOWS_CONSTANTS = { O_RDONLY: 0 }
const POSIX_CONSTANTS = { O_RDONLY: 0, O_NONBLOCK: 2048, O_NOFOLLOW: 131072 }
const identity = {
  MOLE_OFFICE_AGENT: 'synthetic-worker',
  MOLE_OFFICE_SESSION: 'synthetic-session',
  MOLE_OFFICE_WORKSPACE: 'default',
}
const env: NodeJS.ProcessEnv = { ...identity, MOLE_AGENT_KEY: 'a1'.repeat(32), MOLE_OFFICE_API: 'http://127.0.0.1:9' }

/** The office's own limit for a report file, answered without a request leaving this process. */
const fetchImpl = (async (input: string | URL) => {
  const url = new URL(String(input))
  if (url.pathname !== '/api/report-files') throw new Error(`the read asked the office for ${url.pathname}`)
  return new Response(JSON.stringify({ reportFile: { maxBytes: 1024 * 1024 } }), { status: 200 })
}) as unknown as typeof fetch

/** The sentence a read refused with, or a word saying it did not refuse. */
async function theRefusal(run: Promise<unknown>): Promise<string> {
  return await run.then(
    () => 'the read did not refuse',
    (why: unknown) => (why instanceof Error ? why.message : String(why)),
  )
}

describe('1. a full path is what the per-system layer says it is', () => {
  it('takes a drive-letter path on Windows and refuses "\\work" and "\\\\server\\share" as relative paths', async () => {
    const says = theFullPathIsNotWritten('\\work', 'win32')
    expect(theReportFilePathRefused('\\work', 'win32')).toBe(says)
    expect(says).toContain('full path')
    expect(says).toContain(howAFullPathIsWritten('report.md', 'win32'))
    expect(says).toContain(JSON.stringify('\\work'))
    expect(says).toContain('Nothing was sent.')
    expect(theReportFilePathRefused('\\\\server\\share', 'win32')).toBe(theFullPathIsNotWritten('\\\\server\\share', 'win32'))
    expect(theReportFilePathRefused('work', 'win32')).toBe(theFullPathIsNotWritten('work', 'win32'))
    expect(theReportFilePathRefused('C:work', 'win32')).toBe(theFullPathIsNotWritten('C:work', 'win32'))
    expect(theReportFilePathRefused('C:\\work\\report.md', 'win32')).toBeNull()
    expect(theReportFilePathRefused('C:/work/report.md', 'win32')).toBeNull()
    expect(await theRefusal(aReportFileRead('\\work', { platform: 'win32' }))).toBe(theFullPathIsNotWritten('\\work', 'win32'))
  })
})

describe('2. a path is judged by its own parts, and Windows writes it with either separator', () => {
  it('takes "C:/x/report.md" on Windows and goes on to look for the file', async () => {
    expect(theReportFilePathRefused('C:/x/report.md', 'win32')).toBeNull()
    expect(await theRefusal(aReportFileRead('C:/x/report.md', { platform: 'win32' }))).toContain('could not be found')
  })

  it('refuses two separators together and a "." or ".." part on every system, in the full-path sentence', () => {
    const refused: [string, string][] = [
      ['C:\\x\\\\report.md', 'win32'],
      ['C:\\x/\\y\\report.md', 'win32'],
      ['C:\\x\\.\\report.md', 'win32'],
      ['C:\\x\\..\\report.md', 'win32'],
      ['/x//report.md', 'linux'],
      ['/x/./report.md', 'linux'],
      ['/x/../report.md', 'darwin'],
    ]
    for (const [path, platform] of refused) {
      expect(theReportFilePathRefused(path, platform), `${platform} ${path}`).toBe(theFullPathIsNotWritten(path, platform))
    }
    expect(theReportFilePathRefused('C:\\x\\report.md', 'win32')).toBeNull()
    expect(theReportFilePathRefused('C:\\x\\', 'win32')).toBeNull()
    expect(theReportFilePathRefused('/x/', 'linux')).toBeNull()
  })

  it('keeps the Linux and the Mac answer for every path in the table, word for word', () => {
    const paths = [
      '/', '/x', '//', '//x', '//x/', '/x/', '/x//', '/x///', '/x/.', '/x/./', '/x/..', '/x/../',
      '/./x', '/../x', '/x/./y', '/x//y', '/x/../y', '/x/.../y', '/x/.hidden/y', '/x/y/.', '/x/.env',
      '/x/.env.', '/a b/c', '/x/\\y', '/x/..hidden', '/x/...', '/.', '/..', '//x//y//', 'work',
      'C:\\work', '\\work', '\\\\server\\share', '', '.', '..', '/x\\y',
    ]
    for (const platform of ['linux', 'darwin'] as const) {
      for (const path of paths) {
        const refusedAtBase = !posix.isAbsolute(path) || posix.normalize(path) !== path
        const says = theReportFilePathRefused(path, platform)
        expect(says !== null, `${platform} ${path}`).toBe(refusedAtBase)
        if (refusedAtBase) expect(says).toBe(theFullPathIsNotWritten(path, platform))
      }
    }
  })

  it('compares the real path with Windows spelling, ignoring case, and exactly on Linux and the Mac', () => {
    expect(theLinkRefused('C:/work/report.md', 'C:\\work\\report.md', 'win32')).toBeNull()
    expect(theLinkRefused('C:\\Users\\Jory\\report.md', 'c:\\users\\jory\\report.md', 'win32')).toBeNull()
    expect(theLinkRefused('C:\\Users\\jory\\pointer.md', 'C:\\Users\\jory\\real.md', 'win32')).toBe(
      theLinkIsRefused('C:\\Users\\jory\\pointer.md', 'C:\\Users\\jory\\real.md'),
    )
    for (const platform of ['linux', 'darwin'] as const) {
      expect(theLinkRefused('/srv/work/report.md', '/srv/work/report.md', platform)).toBeNull()
      expect(theLinkRefused('/srv/work/report.md', '/srv/work/Report.md', platform)).toBe(
        theLinkIsRefused('/srv/work/report.md', '/srv/work/Report.md'),
      )
      expect(theLinkRefused('/srv/work/report.md', '/srv/work/./report.md', platform)).toBe(
        theLinkIsRefused('/srv/work/report.md', '/srv/work/./report.md'),
      )
    }
  })
})

describe('3. the credentials folders are found in every part the system splits', () => {
  it('finds them in a backslash path in any case on Windows, and keeps a backslash inside a name elsewhere', () => {
    expect(theCredentialsPartIn('C:\\Users\\jory\\.SSH\\id.png', 'win32')).toBe('.SSH')
    expect(theCredentialsPartIn('C:/work/.ENV.local/picture.png', 'win32')).toBe('.ENV.local')
    expect(theCredentialsPartIn('C:\\Users\\jory\\notes\\.git\\config', 'win32')).toBe('.git')
    expect(theCredentialsPartIn('C:\\Users\\jory\\pictures\\a.png', 'win32')).toBeUndefined()
    for (const platform of ['linux', 'darwin'] as const) {
      expect(theCredentialsPartIn('/srv/work/.ssh/id.png', platform)).toBe('.ssh')
      expect(theCredentialsPartIn('/srv/work/.SSH/id.png', platform)).toBeUndefined()
      expect(theCredentialsPartIn('/srv/work/a\\.ssh/id.png', platform)).toBeUndefined()
      expect(theCredentialsPartIn('/srv/work/.env.local', platform)).toBe('.env.local')
    }
  })
})

describe('4. the open takes no flag the system does not have, and a link is refused after it', () => {
  it('gives Windows no O_NOFOLLOW and no O_NONBLOCK, and keeps both on Linux and the Mac', () => {
    expect(howAReportFileIsOpened(WINDOWS_CONSTANTS, 'win32')).toEqual({ flags: 0, refusesALink: false })
    for (const platform of ['linux', 'darwin'] as const) {
      expect(howAReportFileIsOpened(POSIX_CONSTANTS, platform)).toEqual({ flags: 2048 | 131072, refusesALink: true })
    }
    // A stand-in with no O_NOFOLLOW judged as Linux adds no undefined value, and leaves the link to the comparison after the open.
    expect(howAReportFileIsOpened(WINDOWS_CONSTANTS, 'linux')).toEqual({ flags: 0, refusesALink: false })
  })

  it('compares dev and ino as bigints, refuses a link, another file and a missing path, and takes the same file', () => {
    const opened = { dev: 10n, ino: 20n }
    const atThePath = { dev: 10n, ino: 20n, isSymbolicLink: () => false }
    expect(theOpenedFileRefused('/x/report.md', opened, atThePath)).toBeNull()
    const refused = [
      { dev: 10n, ino: 20n, isSymbolicLink: () => true },
      { dev: 11n, ino: 20n, isSymbolicLink: () => false },
      { dev: 10n, ino: 21n, isSymbolicLink: () => false },
    ]
    for (const atPath of refused) {
      expect(theOpenedFileRefused('/x/report.md', opened, atPath)).toBe(theOpenedFileIsNotThePath('/x/report.md'))
    }
    expect(theOpenedFileRefused('/x/report.md', opened, null)).toBe(theOpenedFileIsNotThePath('/x/report.md'))
    // A file index past 2^53 keeps both digits.
    expect(theOpenedFileRefused(
      '/x/report.md',
      { dev: 9007199254740993n, ino: 20n },
      { dev: 9007199254740992n, ino: 20n, isSymbolicLink: () => false },
    )).toBe(theOpenedFileIsNotThePath('/x/report.md'))
  })

  it('refuses a real link through the read when the open cannot refuse it, and reads a real file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'report-file-windows-'))
    try {
      const target = join(dir, 'real.png')
      const link = join(dir, 'pointer.png')
      writeFileSync(target, 'a report picture')
      symlinkSync(target, link)
      const refused = await theRefusal(aReportFileRead(link, { platform: 'linux', theConstants: WINDOWS_CONSTANTS, env, fetchImpl }))
      expect(refused).toBe(theOpenedFileIsNotThePath(link))
      const read = await aReportFileRead(target, { platform: 'linux', theConstants: WINDOWS_CONSTANTS, env, fetchImpl })
      expect(read.bytes.toString()).toBe('a report picture')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
