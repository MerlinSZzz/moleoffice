// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOWS PATHS, FOLDERS AND PROGRAM NAMES, PROVED ON LINUX BY NAMING THE PLATFORM (wave 13t, round 25;
 * report bknY4s0NBTAT, items 5 to 9).
 *
 * Windows is stood in by a parameter, 'win32', or by a made-up system whose files are a table. process.platform
 * is never changed: that would make the native parts load another system's binary.
 *
 * WHAT IS PROVED:
 *   1. an absolute path with a drive letter is accepted where an absolute path is asked for: a start folder, a
 *      files area, a path the screening looks for; and the refusals that name a folder still hold there: the
 *      relative path, "..", a drive's root and a home (in any case);
 *   2. the home comes from USERPROFILE on Windows, and the sandbox folder and the mail tool's folder are under
 *      %LOCALAPPDATA%, or AppData\Local under the home when it is not set;
 *   3. the lock folder on Windows is the user's temporary folder;
 *   4. the program finder splits PATH at ";" and tries each PATHEXT ending, so node.exe and claude.cmd are found
 *      and a file called just "node" is not; a .cmd is started through cmd.exe with each word quoted, and a word
 *      cmd.exe would change is refused in words;
 *   5. LINUX AND THE MAC ANSWER EXACTLY AS BEFORE, each answer written out here as it was on main 73883aaee.
 *
 * NOT PROVED HERE: that any of this runs on a Windows machine. Nothing has yet.
 *
 * MUTATIONS, in the commit message, one per part.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theCredentialsFile } from '../src/config/claude-code-login.mjs'
import { theFilesAreaFolderAsWritten, whereTheHomesAre } from '../src/config/files-area.mjs'
import { theWayToStart, whereIsThisTool } from '../src/config/runtimes.mjs'
import { theSandboxesFolder } from '../src/config/sandbox-folder.mjs'
import { howToStart, theDefaultLockFolders } from '../src/config/settings.mjs'
import { theHomeFolderSpellings, theSameStartFolder, theStartFolderAsItIsStored } from '../src/config/start-folder.mjs'
import { theMailToolFolder } from '../src/config/the-mail-tool.mjs'
import { isAnAbsolutePath, isTheRoot, theHomeNamedIn, theNamesInAPath } from '../src/config/the-paths-of-a-system.mjs'
import { freshDb, type TestDb } from './helpers.ts'

// The server's modules open a database when they load, so they are loaded after a throwaway one is named.
let t: TestDb
let validateFilesArea: typeof import('../src/server/lib/participants.ts').validateFilesArea
let screenWhatWouldLeave: typeof import('../src/server/lib/screening.ts').screenWhatWouldLeave
beforeAll(async () => {
  t = await freshDb()
  ;({ validateFilesArea } = await import('../src/server/lib/participants.ts'))
  ;({ screenWhatWouldLeave } = await import('../src/server/lib/screening.ts'))
}, 60_000)
afterAll(() => {
  t.close()
})

/** A made-up system: its platform, its PATHEXT, and the files that are there. */
function aSystem(platform: string, files: string[], pathext?: string) {
  const there = new Set(files)
  return { platform, pathext, comspec: 'C:\\Windows\\system32\\cmd.exe', isThere: (path: string) => there.has(path) }
}

const HOME = 'C:\\Users\\jory'

describe('1. a drive-letter path is absolute on Windows, and the refusals that name a folder still hold', () => {
  it('reads a drive letter as absolute and a drive as a root', () => {
    expect(isAnAbsolutePath('C:\\work', 'win32')).toBe(true)
    expect(isAnAbsolutePath('d:/work', 'win32')).toBe(true)
    expect(isAnAbsolutePath('/work', 'win32')).toBe(false)
    expect(isAnAbsolutePath('\\\\server\\share', 'win32')).toBe(false)
    expect(isAnAbsolutePath('C:work', 'win32')).toBe(false)
    expect(isTheRoot('C:\\', 'win32')).toBe(true)
    expect(isTheRoot('C:\\work', 'win32')).toBe(false)
  })

  it('stores a start folder with a drive letter, with its trailing separators gone', () => {
    const homes = [HOME]
    expect(theStartFolderAsItIsStored('C:\\work\\mole', 'win32', homes)).toEqual({ folder: 'C:\\work\\mole', because: null })
    expect(theStartFolderAsItIsStored('C:\\work\\mole\\\\', 'win32', homes)).toEqual({ folder: 'C:\\work\\mole', because: null })
    expect(theSameStartFolder('C:\\Work\\Mole', 'c:\\work\\mole\\', 'win32')).toBe(true)
  })

  it('refuses a relative path, "..", a drive root and a home, in their words', () => {
    const homes = [HOME]
    expect(theStartFolderAsItIsStored('work\\mole', 'win32', homes).because).toContain('beginning with a drive letter, as "C:\\"')
    expect(theStartFolderAsItIsStored('\\work', 'win32', homes).because).toContain('is not an absolute path')
    expect(theStartFolderAsItIsStored('C:\\work\\..\\other', 'win32', homes).because).toContain('is not written plainly')
    expect(theStartFolderAsItIsStored('C:\\', 'win32', homes).because).toContain('The root of the machine is not a start folder')
    expect(theStartFolderAsItIsStored('D:', 'win32', homes).because).toContain('The root of the machine is not a start folder')
    expect(theStartFolderAsItIsStored('c:\\users\\JORY\\', 'win32', homes).because).toContain('is a home folder on this machine')
  })

  it('reads the homes from SystemDrive, has no root user, and keeps the home this process runs in', () => {
    expect(whereTheHomesAre('win32', { SystemDrive: 'C:' })).toEqual({ under: 'C:\\Users', root: null })
    expect(whereTheHomesAre('win32', {})).toEqual({ under: null, root: null })
    expect(theHomeFolderSpellings('win32', HOME, { SystemDrive: 'C:' })).toEqual([HOME])
  })

  it('writes a files area folder with a drive letter plainly, and refuses one without', () => {
    expect(theFilesAreaFolderAsWritten('C:\\data\\', 'win32')).toEqual({ written: 'C:\\data', because: null })
    expect(theFilesAreaFolderAsWritten('C:', 'win32')).toEqual({ written: 'C:\\', because: null })
    expect(theFilesAreaFolderAsWritten('/data', 'win32').because).toBe('a files area is absolute folders, written plainly, with no `..`.')
    expect(theFilesAreaFolderAsWritten('C:\\data\\..\\x', 'win32').because).not.toBeNull()
    // Past the spelling, a drive-letter folder is looked for on disk, which this Linux machine does not have.
    expect(() => validateFilesArea(['C:\\data'], 'win32')).toThrow('The files area cannot hold "C:\\data": it is not a folder on this machine.')
    expect(() => validateFilesArea(['/data'], 'win32')).toThrow('a files area is absolute folders, written plainly')
  })

  it('finds a Windows path under the home in text that would leave, in any case and either separator', () => {
    const screen = (text: string) =>
      screenWhatWouldLeave(text, { homeDirectory: () => HOME, platform: 'win32', secretSettingValues: () => [], registeredPersonName: () => 'Nobody Here' })
        .findings.filter((one) => one.check === 'home_directory_path')
        .map((one) => /"([^"]+)"/u.exec(one.says)?.[1])
    expect(screen('see C:\\Users\\jory\\notes.txt.')).toEqual(['C:\\Users\\jory\\notes.txt'])
    expect(screen('see c:/users/JORY/notes.txt')).toEqual(['c:/users/JORY/notes.txt'])
    expect(screen('see C:\\Users\\joryx\\notes.txt and D:\\work')).toEqual([])
    expect(screen('see C:\\Users\\jory\\..\\other\\notes.txt')).toEqual([])
  })

  it('DF29: reads a Windows path\'s names at either separator, and a path elsewhere at "/" only', () => {
    expect(
      theNamesInAPath('C:\\Users\\a\\data\\message-pictures', 'win32'),
      'a Windows path is split at every "\\", so its names are the folders it walks',
    ).toEqual(['C:', 'Users', 'a', 'data', 'message-pictures'])
    expect(
      theNamesInAPath('C:\\Users\\a/data\\\\message-pictures\\', 'win32'),
      'on Windows "/" separates names as "\\" does, and a doubled or trailing separator is not a name',
    ).toEqual(['C:', 'Users', 'a', 'data', 'message-pictures'])
    expect(
      theNamesInAPath('/srv/a\\b', 'linux'),
      'on Linux a "\\" is part of a name, so only "/" separates',
    ).toEqual(['', 'srv', 'a\\b'])
    expect(
      theNamesInAPath('/srv/a\\b', 'darwin'),
      'on the Mac a "\\" is part of a name, so only "/" separates',
    ).toEqual(['', 'srv', 'a\\b'])
    expect(
      theNamesInAPath('/srv//a/', 'linux'),
      'a leading separator is kept as an empty first name, and a doubled or trailing one is not a name',
    ).toEqual(['', 'srv', 'a'])
    expect(theNamesInAPath('/', 'linux'), 'a path that is only a separator has one name, and it is empty').toEqual([''])
  })
})

describe('2. the home, the sandbox folder and the mail tool folder on Windows', () => {
  it('takes the home from USERPROFILE, never from HOME', () => {
    expect(theHomeNamedIn({ USERPROFILE: HOME, HOME: '/c/Users/jory' }, 'win32')).toBe(HOME)
    expect(theHomeNamedIn({ HOME: '/c/Users/jory' }, 'win32')).toBeNull()
    expect(theCredentialsFile({ USERPROFILE: HOME }, 'win32')).toBe('C:\\Users\\jory\\.claude\\.credentials.json')
    expect(theCredentialsFile({ HOME: '/c/Users/jory' }, 'win32')).toBeNull()
  })

  it('puts the sandboxes and the mail tool under %LOCALAPPDATA%, or AppData\\Local under the home', () => {
    expect(theSandboxesFolder('win32', HOME, { LOCALAPPDATA: 'D:\\Local' })).toBe('D:\\Local\\mole-office\\sandboxes')
    expect(theSandboxesFolder('win32', HOME, {})).toBe('C:\\Users\\jory\\AppData\\Local\\mole-office\\sandboxes')
    expect(theMailToolFolder({}, HOME, 'win32')).toBe('C:\\Users\\jory\\AppData\\Local\\mole-office\\mail-the-summonses')
    expect(theMailToolFolder({ LOCALAPPDATA: 'D:\\Local', XDG_STATE_HOME: '/state' }, HOME, 'win32')).toBe('D:\\Local\\mole-office\\mail-the-summonses')
    expect(theMailToolFolder({ MAIL_TOOL_DIR: 'D:\\mail\\' }, HOME, 'win32')).toBe('D:\\mail')
  })
})

describe('3. the lock folder on Windows', () => {
  it('is the user temporary folder alone', () => {
    expect(theDefaultLockFolders('win32', 'C:\\Users\\jory\\AppData\\Local\\Temp')).toEqual(['C:\\Users\\jory\\AppData\\Local\\Temp'])
  })
})

describe('4. the program finder and the starter on Windows', () => {
  const PATH = 'C:\\Windows\\system32;;C:\\Program Files\\nodejs;C:\\Users\\jory\\AppData\\Roaming\\npm'

  it('finds node.exe and claude.cmd by their bare names, and not a file called just "node"', () => {
    const system = aSystem('win32', [
      'C:\\Windows\\system32\\node',
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Users\\jory\\AppData\\Roaming\\npm\\claude',
      'C:\\Users\\jory\\AppData\\Roaming\\npm\\claude.cmd',
    ])
    expect(whereIsThisTool('node', PATH, system)).toBe('C:\\Program Files\\nodejs\\node.exe')
    expect(whereIsThisTool('claude', PATH, system)).toBe('C:\\Users\\jory\\AppData\\Roaming\\npm\\claude.cmd')
    expect(whereIsThisTool('codex', PATH, system)).toBeNull()
  })

  it('reads PATHEXT, its case, and a path written with either separator', () => {
    // PATHEXT's endings are tried in lower case; Windows finds a file whatever the case of its name.
    const system = aSystem('win32', ['C:\\tools\\run.ps1', 'C:\\tools\\node.exe'], '.EXE;.PS1')
    expect(whereIsThisTool('run', 'C:\\tools', system)).toBe('C:\\tools\\run.ps1')
    expect(whereIsThisTool('C:\\tools\\node', undefined, system)).toBe('C:\\tools\\node.exe')
    expect(whereIsThisTool('C:\\tools\\node.exe', undefined, system)).toBe('C:\\tools\\node.exe')
    expect(whereIsThisTool('C:/tools/missing', 'C:\\tools', system)).toBeNull()
  })

  it('starts a .cmd through cmd.exe with each word quoted, and an .exe as it is', () => {
    const system = aSystem('win32', [])
    expect(theWayToStart('C:\\npm\\claude.cmd', ['-p', 'a & b', 'C:\\out\\'], system)).toEqual({
      command: 'C:\\Windows\\system32\\cmd.exe',
      args: ['/d', '/s', '/v:off', '/c', '""C:\\npm\\claude.cmd" "-p" "a & b" "C:\\out\\\\""'],
      windowsVerbatimArguments: true,
    })
    expect(theWayToStart('C:\\npm\\RUN.BAT', [], system).windowsVerbatimArguments).toBe(true)
    expect(theWayToStart('C:\\nodejs\\node.exe', ['--version'], system)).toEqual({
      command: 'C:\\nodejs\\node.exe',
      args: ['--version'],
      windowsVerbatimArguments: false,
    })
    expect(howToStart('worker', 'win32').command.endsWith(join('node_modules', '.bin', 'tsx.cmd'))).toBe(true)
  })

  it('refuses, in words, a word cmd.exe would change', () => {
    const system = aSystem('win32', [])
    for (const word of ['say "hi"', '%PATH%', 'one\ntwo']) {
      expect(() => theWayToStart('C:\\npm\\claude.cmd', [word], system)).toThrow('which cmd.exe would change before the program saw it. Nothing was started.')
    }
  })
})

/** A home this file makes, for the Linux and Mac cases that read a home folder. */
const A_HOME = mkdtempSync(join(tmpdir(), 'windows-paths-home-'))
afterAll(() => rmSync(A_HOME, { recursive: true, force: true }))

describe('5. Linux and the Mac answer exactly as before', () => {
  for (const platform of ['linux', 'darwin']) {
    it(`answers as it did on ${platform}`, () => {
      const homes = [A_HOME]
      expect(theStartFolderAsItIsStored('/work/mole//', platform, homes)).toEqual({ folder: '/work/mole', because: null })
      expect(theStartFolderAsItIsStored('work', platform, homes).because).toBe(
        '"work" is not an absolute path. A start folder is compared with the directory the session hook says a session ' +
          'started in, and a relative path means nothing to a hook running in some other directory. Write it from the root, beginning with "/".',
      )
      expect(theStartFolderAsItIsStored('C:\\work', platform, homes).because).toContain('is not an absolute path')
      expect(theStartFolderAsItIsStored('/', platform, homes).because).toContain('The root of the machine is not a start folder')
      expect(theStartFolderAsItIsStored(A_HOME.toUpperCase(), platform, homes).folder).toBe(A_HOME.toUpperCase())
      expect(theSameStartFolder('/Work', '/work', platform)).toBe(false)
      expect(theFilesAreaFolderAsWritten('/data//', platform)).toEqual({ written: '/data', because: null })
      expect(theFilesAreaFolderAsWritten('/', platform)).toEqual({ written: '/', because: null })
      expect(theFilesAreaFolderAsWritten('C:\\data', platform).because).not.toBeNull()
      expect(theCredentialsFile({ HOME: A_HOME, USERPROFILE: 'C:\\Users\\someone' }, platform)).toBe(join(A_HOME, '.claude', '.credentials.json'))
      expect(theCredentialsFile({ USERPROFILE: 'C:\\Users\\jory' }, platform)).toBeNull()
      expect(theSandboxesFolder(platform, A_HOME, { LOCALAPPDATA: 'D:\\Local' })).toBe(join(A_HOME, '.cache', 'mole-office', 'sandboxes'))
      expect(theMailToolFolder({ LOCALAPPDATA: 'D:\\Local' }, A_HOME, platform)).toBe(join(A_HOME, '.local', 'state', 'mole-office', 'mail-the-summonses'))
      expect(theMailToolFolder({ XDG_STATE_HOME: '/state' }, A_HOME, platform)).toBe('/state/mole-office/mail-the-summonses')
      expect(howToStart('worker', platform).command.endsWith(join('node_modules', '.bin', 'tsx'))).toBe(true)

      const system = aSystem(platform, ['/usr/bin/node', '/opt/npm/claude.cmd', '/opt/npm/codex'], '.EXE;.CMD')
      expect(whereIsThisTool('node', '/usr/local/bin::/usr/bin', system)).toBe('/usr/bin/node')
      expect(whereIsThisTool('codex', '/opt/npm', system)).toBe('/opt/npm/codex')
      expect(whereIsThisTool('claude', '/opt/npm', system)).toBeNull()
      expect(whereIsThisTool('/usr/bin/node', undefined, system)).toBe('/usr/bin/node')
      expect(whereIsThisTool('node', '/usr/local/bin;/usr/bin', system)).toBeNull()
      expect(theWayToStart('/opt/npm/claude.cmd', ['say "%x%"'], system)).toEqual({
        command: '/opt/npm/claude.cmd',
        args: ['say "%x%"'],
        windowsVerbatimArguments: false,
      })
    })
  }

  it('keeps the lock folders: /tmp and /var/lock on Linux, /tmp and the temporary folder on a Mac', () => {
    expect(theDefaultLockFolders('linux', '/tmp')).toEqual(['/tmp', '/var/lock'])
    expect(theDefaultLockFolders('darwin', '/var/folders/x/T')).toEqual(['/tmp', '/var/folders/x/T'])
    expect(theDefaultLockFolders('darwin', '/tmp')).toEqual(['/tmp'])
  })

  it('keeps the homes: /home and /root on Linux, /Users and /var/root on a Mac', () => {
    expect(whereTheHomesAre('linux')).toEqual({ under: '/home', root: '/root' })
    expect(whereTheHomesAre('darwin')).toEqual({ under: '/Users', root: '/var/root' })
  })

  it('finds a path under the home on Linux, and not a Windows one', () => {
    const screen = (text: string) =>
      screenWhatWouldLeave(text, { homeDirectory: () => A_HOME, platform: 'linux', secretSettingValues: () => [], registeredPersonName: () => 'Nobody Here' })
        .findings.filter((one) => one.check === 'home_directory_path')
        .map((one) => /"([^"]+)"/u.exec(one.says)?.[1])
    expect(screen(`see ${A_HOME}/notes.txt and C:\\Users\\someone\\x`)).toEqual([`${A_HOME}/notes.txt`])
  })

  it('refuses a real Linux folder for a files area only for what it is, as before', () => {
    const folder = mkdtempSync(join(tmpdir(), 'windows-paths-'))
    try {
      expect(existsSync(folder)).toBe(true)
      expect(() => validateFilesArea(['relative/one'], 'linux')).toThrow('a files area is absolute folders, written plainly')
      expect(() => validateFilesArea([join(folder, 'missing')], 'linux')).toThrow('it is not a folder on this machine.')
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
