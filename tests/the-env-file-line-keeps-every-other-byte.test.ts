// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ENV-FILE LINE WRITER KEEPS EVERY OTHER BYTE.
 *
 * Two steps of round 12 write one line into the development checkout's `.env` while the office is
 * stopped: the bootstrap's handoff writes MOLE_OFFICE_STABLE_CHECKOUT, and the step that moves the
 * data folder writes MOLE_OFFICE_DB. Both call `setTheLine`, so this file proves the rule it keeps:
 * only the named line changes, and every other byte, the mode, the owner and the group stay. A
 * backup holds the original bytes beside the file, and `putTheBackupBack` puts them back.
 *
 * WHAT EACH TEST WATCHES. The bytes are compared against the exact bytes the writer should produce,
 * and the hash of the file without the named line is compared before and after the write. A refusal
 * is checked with the file and its folder unchanged: the same bytes, no backup and no temporary file.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { envFileValues } from '../src/config/settings.mjs'
import { fsyncTheFolder, putTheBackupBack, setTheLine } from '../src/config/env-file-line.mjs'

const NAME = 'MOLE_TEST_THE_LINE'
const MODE = 0o640

let folder = ''
let file = ''

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'the-env-file-line-'))
  file = join(folder, '.env')
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

/** Writes the file the test works on and gives it the mode the tests watch. */
function theFileHolding(body: string): Buffer {
  const bytes = Buffer.from(body)
  writeFileSync(file, bytes)
  chmodSync(file, MODE)
  return bytes
}

const hashOf = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const read = (): Buffer => readFileSync(file)
const listed = (): string[] => readdirSync(folder).sort()
const modeOf = (path: string): number => statSync(path).mode & 0o7777

/** Expects a refusal with `says` in its sentence, and the file and its folder left as they were. */
function refusesWithoutTouching(original: Buffer, says: RegExp, work: () => unknown): void {
  const wasThere = listed()
  expect(work).toThrow(says)
  expect(read().equals(original), 'the file is unchanged').toBe(true)
  expect(listed(), 'no backup and no temporary file was left').toEqual(wasThere)
}

/**
 * A readable file of this machine that another user owns, or null. A test cannot make one: this
 * sandbox user cannot give a file to another user.
 */
function aFileThisUserDoesNotOwn(): string | null {
  for (const path of ['/etc/hostname', '/etc/hosts', '/etc/passwd']) {
    try {
      const stats = statSync(path)
      if (stats.isFile() && stats.uid !== process.getuid!()) return path
    } catch {
      // Try the next one.
    }
  }
  return null
}

const foreign = aFileThisUserDoesNotOwn()

it('replaces the line in the middle and keeps every other byte, the mode, the owner and the group', () => {
  const original = theFileHolding(
    '# a comment\n# MOLE_TEST_THE_LINE=commented\n\nFIRST=one\r\nMOLE_TEST_THE_LINE=old value\nLAST=end',
  )
  const expected = Buffer.from(
    '# a comment\n# MOLE_TEST_THE_LINE=commented\n\nFIRST=one\r\nMOLE_TEST_THE_LINE=new value\nLAST=end',
  )

  const answer = setTheLine(file, NAME, 'new value', 'test')

  expect(read().equals(expected), 'the old bytes with only that one line changed').toBe(true)
  expect(answer.backup).toBe(`${file}.before-test`)
  expect(answer.before.sha256).toBe(hashOf(original))
  expect(answer.after.sha256).toBe(hashOf(expected))
  expect(answer.before.withoutTheLine, 'the bytes without the line are the same before and after').toBe(
    answer.after.withoutTheLine,
  )
  expect(answer.before.mode).toBe(MODE)
  expect(answer.after.mode).toBe(MODE)
  expect(answer.before.uid).toBe(process.getuid!())
  expect(answer.after.uid).toBe(process.getuid!())
  expect(answer.before.gid).toBe(process.getgid!())
  expect(answer.after.gid).toBe(process.getgid!())
  expect(modeOf(file)).toBe(MODE)
  expect(statSync(file).uid).toBe(process.getuid!())
  expect(statSync(file).gid).toBe(process.getgid!())
  expect(listed()).toEqual(['.env', '.env.before-test'])
})

it('keeps the carriage return of a replaced line that ends in CRLF', () => {
  const original = theFileHolding('A=1\r\nMOLE_TEST_THE_LINE=old\r\nB=2\r\n')
  const expected = Buffer.from('A=1\r\nMOLE_TEST_THE_LINE=new\r\nB=2\r\n')

  const answer = setTheLine(file, NAME, 'new', 'crlf')

  expect(read().equals(expected), 'only the text changed; the line keeps its own \\r\\n').toBe(true)
  expect(answer.before.withoutTheLine).toBe(answer.after.withoutTheLine)
  expect(readFileSync(answer.backup).equals(original)).toBe(true)
})

it('appends the line to a file that ends with a newline, keeping its final newline', () => {
  const original = theFileHolding('A=1\nB=2\n')
  const expected = Buffer.from('A=1\nB=2\nMOLE_TEST_THE_LINE=v\n')

  const answer = setTheLine(file, NAME, 'v', 'add')

  expect(read().equals(expected)).toBe(true)
  expect(answer.before.withoutTheLine).toBe(answer.after.withoutTheLine)
  expect(readFileSync(answer.backup).equals(original)).toBe(true)
})

it('appends the line to a file with no final newline, keeping it without one', () => {
  const original = theFileHolding('A=1\nB=2')
  const expected = Buffer.from('A=1\nB=2\nMOLE_TEST_THE_LINE=v')

  const answer = setTheLine(file, NAME, 'v', 'add')

  expect(read().equals(expected)).toBe(true)
  expect(answer.before.withoutTheLine).toBe(answer.after.withoutTheLine)
  expect(readFileSync(answer.backup).equals(original)).toBe(true)
})

it('writes the backup beside the file with the original bytes and mode', () => {
  const original = theFileHolding('A=1\n')

  const answer = setTheLine(file, NAME, 'v', 'backup')

  expect(answer.backup).toBe(`${file}.before-backup`)
  expect(readFileSync(answer.backup).equals(original)).toBe(true)
  expect(modeOf(answer.backup)).toBe(MODE)
  expect(statSync(answer.backup).uid).toBe(process.getuid!())
  expect(statSync(answer.backup).gid).toBe(process.getgid!())
  expect(listed()).toEqual(['.env', '.env.before-backup'])
})

it('refuses a file that is missing', () => {
  expect(() => setTheLine(file, NAME, 'v', 'test')).toThrow(/does not exist/)
  expect(listed()).toEqual([])
})

it('refuses a symbolic link', () => {
  const original = theFileHolding('A=1\n')
  const link = join(folder, 'link.env')
  symlinkSync(file, link)
  const wasThere = listed()

  expect(() => setTheLine(link, NAME, 'v', 'test')).toThrow(/symbolic link/)

  expect(read().equals(original), 'the file the link names is unchanged').toBe(true)
  expect(listed()).toEqual(wasThere)
})

it('refuses something that is not an ordinary file', () => {
  const sub = join(folder, 'a-folder')
  mkdirSync(sub)

  expect(() => setTheLine(sub, NAME, 'v', 'test')).toThrow(/ordinary file/)

  expect(listed()).toEqual(['a-folder'])
})

it.skipIf(foreign === null)('refuses a file this user does not own', () => {
  const other = foreign as string
  const original = readFileSync(other)

  expect(() => setTheLine(other, NAME, 'v', 'test')).toThrow(/not owned by this user/)

  expect(readFileSync(other).equals(original), 'that file is unchanged').toBe(true)
  expect(existsSync(`${other}.before-test`), 'no backup was left beside it').toBe(false)
})

it('refuses a name that is not a setting name', () => {
  const original = theFileHolding('A=1\n')
  for (const name of ['mole_test_the_line', '9LEADING', 'HAS SPACE', '']) {
    refusesWithoutTouching(original, /not a setting name/, () => setTheLine(file, name, 'v', 'test'))
  }
})

it('refuses a name the file sets on more than one line', () => {
  const original = theFileHolding(`MOLE_TEST_THE_LINE=one\n# MOLE_TEST_THE_LINE=commented\nMOLE_TEST_THE_LINE=two\nA=1`)

  refusesWithoutTouching(original, /more than one line/, () => setTheLine(file, NAME, 'v', 'test'))
})

it('refuses a value that would not read back exactly', () => {
  const original = theFileHolding('A=1\n')
  for (const value of ['has#a-hash', 'trailing ', ' leading', '"quoted"', "'quoted'", 'two\nlines', 'tail"']) {
    refusesWithoutTouching(original, /would not read back/, () => setTheLine(file, NAME, value, 'test'))
  }
})

it('refuses when the backup path already exists', () => {
  const original = theFileHolding('A=1\n')
  const backup = `${file}.before-test`
  writeFileSync(backup, 'AN OLDER BACKUP')
  const wasThere = listed()

  expect(() => setTheLine(file, NAME, 'v', 'test')).toThrow(/already exists/)

  expect(read().equals(original)).toBe(true)
  expect(readFileSync(backup, 'utf8')).toBe('AN OLDER BACKUP')
  expect(listed()).toEqual(wasThere)
})

it('refuses a label that is not plain', () => {
  const original = theFileHolding('A=1\n')
  for (const label of ['', 'has space', '.leads', '-leads']) {
    refusesWithoutTouching(original, /not a plain label/, () => setTheLine(file, NAME, 'v', label))
  }
})

it('writes a value with an inner space, and reads it back through envFileValues and a child process', () => {
  theFileHolding('A=1\n')
  const value = '/tmp/a folder with spaces/data'

  setTheLine(file, NAME, value, 'read-back')

  expect(envFileValues(file)[NAME]).toBe(value)
  const script =
    "process.loadEnvFile(process.argv[1]); process.stdout.write(process.env[process.argv[2]] ?? '__missing__')"
  const said = execFileSync(process.execPath, ['-e', script, file, NAME], { encoding: 'utf8' })
  expect(said).toBe(value)
})

it('puts the backup back byte for byte and leaves it where it is', () => {
  const original = theFileHolding('# comment\nA=1\r\nMOLE_TEST_THE_LINE=old')
  const answer = setTheLine(file, NAME, 'new', 'rollback')
  expect(read().equals(original), 'the write happened before the rollback').toBe(false)

  const found = putTheBackupBack(file, answer.backup, answer.before.sha256)

  expect(found).toBe(answer.before.sha256)
  expect(read().equals(original), 'the exact original bytes are back').toBe(true)
  expect(modeOf(file)).toBe(MODE)
  expect(existsSync(answer.backup), 'the backup stays').toBe(true)
  expect(readFileSync(answer.backup).equals(original)).toBe(true)
  expect(listed()).toEqual(['.env', '.env.before-rollback'])
})

it('refuses to put back a backup whose hash is not the expected one', () => {
  theFileHolding('A=1\n')
  const answer = setTheLine(file, NAME, 'new', 'rollback')
  const written = read()

  expect(() => putTheBackupBack(file, answer.backup, hashOf(Buffer.from('something else')))).toThrow(
    /does not hold/,
  )
  expect(read().equals(written), 'the file is untouched').toBe(true)

  writeFileSync(answer.backup, 'CHANGED BACKUP')
  expect(() => putTheBackupBack(file, answer.backup, answer.before.sha256)).toThrow(/does not hold/)
  expect(read().equals(written), 'the file is still untouched').toBe(true)
})

it('DF9: on Windows the folder that holds the .env is not flushed, and on Linux and the Mac it is', () => {
  const handle = 41
  /** What the file calls were asked to do, in order. */
  const recorded: unknown[][] = []
  const recorder = {
    openSync: (...asked: unknown[]): number => {
      recorded.push(['openSync', ...asked])
      return handle
    },
    fsyncSync: (...asked: unknown[]): void => {
      recorded.push(['fsyncSync', ...asked])
    },
    closeSync: (...asked: unknown[]): void => {
      recorded.push(['closeSync', ...asked])
    },
  }
  const openedForReading = [
    ['openSync', folder, 'r'],
    ['fsyncSync', handle],
    ['closeSync', handle],
  ]

  fsyncTheFolder(folder, 'win32', recorder)
  expect(
    recorded.splice(0),
    'on Windows the folder is not opened, flushed or closed, because Windows does not flush a folder',
  ).toEqual([])

  fsyncTheFolder(folder, 'linux', recorder)
  expect(recorded.splice(0), 'on Linux the folder is opened for reading, flushed and closed').toEqual(openedForReading)

  fsyncTheFolder(folder, 'darwin', recorder)
  expect(recorded.splice(0), 'on the Mac the folder is opened for reading, flushed and closed').toEqual(openedForReading)

  expect(() => fsyncTheFolder(folder, 'linux'), 'the real calls flush the folder without a throw').not.toThrow()
})

it('takes a file inside this user’s home folder as this user’s on Windows', async () => {
  const { whyTheFileIsNotThisUsers } = await import('../src/config/env-file-line.mjs')
  const home = mkdtempSync(join(tmpdir(), 'the-env-file-line-home-'))
  try {
    const inside = join(home, '.env')
    writeFileSync(inside, 'A=1\n')
    expect(whyTheFileIsNotThisUsers(inside, statSync(inside), 'win32', home)).toBeNull()
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

it('refuses a file outside this user’s home folder on Windows, naming the file and the home folder', async () => {
  const { whyTheFileIsNotThisUsers } = await import('../src/config/env-file-line.mjs')
  const home = mkdtempSync(join(tmpdir(), 'the-env-file-line-home-'))
  const elsewhere = mkdtempSync(join(tmpdir(), 'the-env-file-line-elsewhere-'))
  try {
    const outside = join(elsewhere, '.env')
    writeFileSync(outside, 'A=1\n')
    const why = whyTheFileIsNotThisUsers(outside, statSync(outside), 'win32', home)
    expect(why).toMatch(/not inside this user's home folder/)
    expect(why).toContain(outside)
    expect(why).toContain(home)
    expect(why).toMatch(/nothing was written/)
  } finally {
    rmSync(home, { recursive: true, force: true })
    rmSync(elsewhere, { recursive: true, force: true })
  }
})

it('still compares the owner on Linux, so a file this user owns is this user’s', async () => {
  const { whyTheFileIsNotThisUsers } = await import('../src/config/env-file-line.mjs')
  theFileHolding('A=1\n')
  expect(whyTheFileIsNotThisUsers(file, statSync(file), 'linux', '/a/home')).toBeNull()
})
