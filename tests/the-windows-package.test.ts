// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOWS PACKAGE: ONE PER-USER INSTALLER, UNSIGNED, MADE ON LINUX. Wave 13t, round W13, item 18.
 *
 * The decisions: the Windows beta ships unsigned with a one-page install note; it
 * installs for one person with no administrator, and the office runs from sign-in to sign-out.
 * scripts/package-windows.mjs makes it with electron-builder's NSIS target and Mole Office's own script,
 * scripts/windows-installer.nsi. This test reads everything that can be read on Linux:
 *
 *   1. where a bundle keeps its Node on each system (theShippedNodeIn), and Node's name for its Windows zip;
 *   2. a file read out of a zip, with its CRC-32 checked;
 *   3. the target a bundle is made for: this machine's, or win32-x64 and nothing else, and bundle.mjs refuses
 *      any other before it writes anything;
 *   4. node-pty's Windows files, without its debugging symbols, and a copy that lacks one is named;
 *   5. a download checked against a hash fixed before it: the lockfile's sha512 from npm's registry only,
 *      a matching file is used without a download, and a file that does not match is removed;
 *   6. the avatar codec's Windows package is the one the lockfile locks, and carries libvips's library notices;
 *   7. the Windows build's facts: it is made on Linux x64 only, Electron's zip by the SHA-256 the electron
 *      package pins, the installer's facts from the places that decide them, including where the office's data
 *      folder is under %APPDATA%, its wait for the stop command
 *      taking in the time the stop asks again while the office's stop pipe is not there, the time it waits for the
 *      office to end, and the time it takes to end the holder, the per-user unsigned
 *      NSIS configuration that lets the person choose the folder, with the Linux fuses, and the execution
 *      levels read from a program's manifest;
 *   8. the installer's script: per-user with no administrator, the folder chosen on a directory page with the
 *      recorded folder as the default, an update kept in its folder, the per-user folder and any folder inside it
 *      refused first, then a folder inside the data folder or holding it, each with a sentence that says what is
 *      kept there, a folder holding other files
 *      refused on the folder page, which stays open, and again in the install section for a silent install,
 *      while an empty one is taken, and what a partial unpack left removed before the refusal; it stops what runs
 *      from the folder before it
 *      changes it, by the path of each program and never by its command line; each refusal of that stop
 *      writes which step refused, the step's exit code and what it printed to a file in TEMP, and the file of
 *      an earlier refusal is deleted first; the uninstaller deletes only
 *      the Run values that start the installed window by its full path, and their StartupApproved twins; it
 *      removes the folder before its entry in Installed apps, trying again once a second for about ten
 *      seconds, and keeps the entry, with the uninstaller it starts, while any of the folder is left; and it
 *      reads only the facts it is given;
 *   9. package-windows.mjs puts these together in order and reads back what it made;
 *  10. where the data goes at install (design/window/the-data-folder-move.criteria.md, DF23 to DF25): a page of its
 *      own on a first install only, a first install told by the install folder and the per-user folder, the default
 *      and /DATA= read before any page, a place refused by DF23's rules in their order, the page kept open on a
 *      refusal, /DATA= refused on any other install, the place written by the office's own command after the
 *      unpack is checked and the unpack removed when it refuses, and the installed office asked where its data is
 *      only when the folder holds this product.
 *  11. the office map's part on the components page (scripts/the-office-map-part.mjs): unticked on a first install,
 *      ticked when the folder already holds the map, also for a silent install, written into the folder the office
 *      reads its plugins from after the office's own section has emptied the folder on an update, and its words
 *      naming the place in Settings where the map is switched on.
 *
 * What only a Windows machine can test is named in the round's report and in the Win11 label: the installer
 * runs as the person without asking for an administrator, the window opens, the office answers, a terminal
 * opens, and the uninstaller leaves nothing.
 *
 * MUTATIONS, each red here and green again when put back:
 *   - theShippedNodeIn gives runtime/bin/node on Windows too: red, cases 1 and 7;
 *   - theNodeArchive calls Windows win32: red, case 1;
 *   - aFileInTheZip leaves out the CRC-32 check: red, case 2;
 *   - theBundleTarget makes a bundle for any target asked for: red, case 3;
 *   - bundle.mjs does not stop at a refused target: red, case 3;
 *   - thePtyWindowsParts leaves out conpty.dll: red, case 4;
 *   - whatThePtyLacks does not look for the Windows files: red, case 4;
 *   - theLockedPackage takes a package from anywhere: red, case 5;
 *   - fetchChecked keeps a file that does not match: red, case 5;
 *   - copyAvatarCodecInto copies another system's package at any version: red, case 6;
 *   - the Windows package gets no library notices: red, case 6;
 *   - theWindowsBuildRefusal lets a Mac make the installer: red, case 7;
 *   - theWindowsBuilderConfig installs for every user of the machine: red, case 7;
 *   - oneClick goes back on: red, case 7;
 *   - the directory page is removed: red, case 8;
 *   - the recorded folder is not taken as the default: red, case 8;
 *   - the folder page is never skipped: red, case 8;
 *   - the folder page is given no leave function: red, case 8;
 *   - the folder page's leave function quits instead of staying open: red, case 8;
 *   - the folder page's leave function does not apply the refusal rule: red, case 8;
 *   - a silent install does not apply the refusal rule: red, case 8;
 *   - the refusal rule refuses an empty folder: red, case 8;
 *   - an empty folder is refused as if it held other files: red, case 8;
 *   - the data folder rule is removed: red, case 8;
 *   - the backslash that ends the data folder's path is left off: red, case 8;
 *   - the data folder is compared case-sensitively: red, case 8;
 *   - the data folder's refusal does not end the function: red, case 8;
 *   - the data folder's refusal does not say where the data is: red, case 8;
 *   - the data folder fact names a folder that is not the one the office uses: red, case 7;
 *   - the uninstaller removes the office's data folder: red, case 8;
 *   - the default data folder is not the one the office's setting names: red, case 7;
 *   - the inside rule leaves off the backslash after the outer folder: red, cases 8 and 10;
 *   - the data folder in use is read after the rules that need it: red, case 8;
 *   - an install folder inside the data folder is taken: red, case 8;
 *   - the data page is shown on every install: red, case 10;
 *   - a per-user folder that holds files is taken as a first install: red, case 10;
 *   - /DATA= is left unused on an install that is not the first: red, case 10;
 *   - a place inside the per-user folder is refused in place of one that holds it: red, case 10;
 *   - a place that holds other files is taken without a database: red, case 10;
 *   - the drive letter check reads the first two characters: red, case 10;
 *   - the place's backslashes are left on before the default is compared: red, case 10;
 *   - the data page's leave does not check the install folder against the place: red, case 10;
 *   - a refused choose keeps what was unpacked: red, case 10;
 *   - the installed office is asked where its data is without its uninstaller in the folder: red, case 10;
 *   - the answer to where is taken whatever the command ended with: red, case 10;
 *   - the page names a Settings place that is not the one the Settings page draws: red, case 10;
 *   - what a partial unpack left is kept before the refusal: red, case 8;
 *   - theInstallerScript writes a fact with a quote in it: red, case 7;
 *   - the installer waits for the stop command without the time it waits for the stop pipe: red, case 7;
 *   - theInstallerFacts leaves the time the stop takes to end the holder out of its wait: red, case 7;
 *   - theExecutionLevelsIn finds no level: red, case 7;
 *   - the installer's script finds what runs from the folder by its command line: red, case 8;
 *   - the installer stops what runs from the folder after it has unpacked into it: red, case 8;
 *   - a step of the stop runs with nsExec::ExecToLog, which keeps neither its exit code nor what it printed: red, case 8;
 *   - one refusal of the stop is not written to the file: red, case 8;
 *   - the file of an earlier refusal is left where it was: red, case 8;
 *   - the installer asks for an administrator: red, case 8;
 *   - the uninstaller leaves the StartupApproved twin of a Run value: red, case 8;
 *   - the uninstaller tries the folder once: red, case 8;
 *   - the uninstaller deletes its entry in Installed apps before the folder: red, case 8;
 *   - the uninstaller keeps its entry but not the uninstaller the entry starts: red, case 8;
 *   - theInstallerFacts gives no exit code for a stale lock: red, cases 7 and 8;
 *   - theInstallerFacts gives no exit code for a stop that left the terminal holder: red, cases 7 and 8;
 *   - the installer refuses after a stop that left the terminal holder, which its next step ends: red, case 8;
 *   - package-windows.mjs reads the fuses from the Linux binary's name: red, case 9.
 *   - the office map's part is ticked on every install: red, case 11;
 *   - the office map's part is ticked when the folder does not hold the map: red, case 11;
 *   - .onInit does not decide whether the office map's part is ticked: red, case 11;
 *   - the office map's part is ticked when the folder holds the office, map or not: red, case 11;
 *   - theMapFacts puts the map in the office's folder, not in its plugins folder: red, case 11;
 *   - the office map's part writes its files into the office's folder: red, case 11.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'

import { copyAvatarCodecInto, theAvatarCodecPackageFor } from '../scripts/avatar-codec-in-a-bundle.mjs'
import { fetchChecked, theLockedPackage } from '../scripts/checked-downloads.mjs'
import { THE_WINDOWS_TARGET, isThisMachine, theBundleTarget } from '../scripts/the-bundle-target.mjs'
import { THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC } from '../scripts/the-packed-app.mjs'
import { aFileInTheZip, theNodeArchive } from '../scripts/the-shipped-node.mjs'
import { thePtyNativeFile, thePtyWindowsParts, whatThePtyLacks } from '../scripts/the-terminal-in-a-bundle.mjs'
import {
  THE_NSIS_TOOLSET,
  THE_WINDOWS_EXECUTABLE,
  theElectronZip,
  theExecutionLevelsIn,
  theInstallerFacts,
  theInstallerScript,
  theMapFacts,
  theWindowsBuilderConfig,
  theWindowsBuildRefusal,
} from '../scripts/the-windows-build.mjs'
import { THE_BUNDLES, THE_COMMAND_ENTRY, THE_PLUGINS_FOLDER, THE_SHIPPED_NODE_VERSION, settingNamed, thePerUserDataFolder, theShippedNodeIn } from '../src/config/settings.mjs'
import { THE_TEMPORARY_FOLDER_VARIABLES } from '../src/config/the-data-folder-move.mjs'
import { EXIT, STOP_PIPE_WAIT_MS, STOP_WAIT_MS, THE_HOLDER_ENDS_WITHIN_MS } from '../src/config/the-service-command.mjs'
import { en } from '../src/shared/words/en.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8')
const LOCK = JSON.parse(read('package-lock.json'))
const PTY = join(REPO, 'node_modules', 'node-pty')

const scratch: string[] = []
const aFolder = (): string => {
  const made = mkdtempSync(join(tmpdir(), 'windows-package-test-'))
  scratch.push(made)
  return made
}
afterAll(() => {
  for (const made of scratch) rmSync(made, { recursive: true, force: true })
})

/** A zip of the given files, stored (method 0) or deflated (method 8), as Node's Windows zip keeps them. */
function aZip(files: { name: string; bytes: Buffer; method: 0 | 8 }[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const data = file.method === 8 ? deflateRawSync(file.bytes) : file.bytes
    const name = Buffer.from(file.name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(file.method, 8)
    local.writeUInt32LE(crc32(file.bytes), 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(file.bytes.length, 22)
    local.writeUInt16LE(name.length, 26)
    parts.push(local, name, data)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(file.method, 10)
    entry.writeUInt32LE(crc32(file.bytes), 16)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(file.bytes.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, name)
    offset += 30 + name.length + data.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, directory, end])
}

/** The script's own lines, without its comments. */
const THE_SCRIPT = read('scripts/windows-installer.nsi')
const CODE = THE_SCRIPT.split('\n').filter((line) => !line.trimStart().startsWith(';')).join('\n')
/** One section of the script, from `Section "<name>"` to its SectionEnd. */
const section = (name: string): string => {
  const start = CODE.indexOf(`Section "${name}"`)
  expect(start, `the script has a Section "${name}"`).toBeGreaterThan(-1)
  return CODE.slice(start, CODE.indexOf('SectionEnd', start))
}

/** One function of the script, from `Function <name>` to its FunctionEnd. */
const fn = (name: string): string => {
  const start = CODE.indexOf(`Function ${name}\n`)
  expect(start, `the script has a Function ${name}`).toBeGreaterThan(-1)
  return CODE.slice(start, CODE.indexOf('FunctionEnd', start))
}

/**
 * theFolderIsInside as its lines say: whether the folder in $R2 is the folder in $R1 or inside it. It takes the
 * length of the outer folder and what follows it, that many characters of the inner folder and what follows it,
 * and compares the two with == or S==.
 */
function theFolderIsInsideAsWritten(): (outer: string, inner: string) => boolean {
  const inside = fn('theFolderIsInside')
  const length = /StrLen \$R3 "\$R1(\\?)"/.exec(inside)
  expect(length, 'the function takes the length of the outer folder and the backslash after it').not.toBeNull()
  const copy = /StrCpy \$R4 "\$R2(\\?)" \$R3/.exec(inside)
  expect(copy, 'the function takes that many characters of the inner folder and the backslash after it').not.toBeNull()
  const compare = /\$\{If\} \$R4 (S?==) "\$R1(\\?)"\s+StrCpy \$R0 "yes"/.exec(inside)
  expect(compare, 'the function compares the beginning of the inner folder with the outer one').not.toBeNull()
  const no = inside.indexOf('StrCpy $R0 "no"')
  expect(no, 'the answer is "no" unless the compare says otherwise').toBeGreaterThan(-1)
  expect(no).toBeLessThan(Number(compare?.index))
  return (outer, inner) => {
    const counted = `${outer}${length?.[1] ?? ''}`
    const beginning = `${inner}${copy?.[1] ?? ''}`.slice(0, counted.length)
    const refusedWhen = `${outer}${compare?.[2] ?? ''}`
    return compare?.[1] === 'S==' ? beginning === refusedWhen : beginning.toUpperCase() === refusedWhen.toUpperCase()
  }
}

/** Each rule of a function that asks theFolderIsInside and then refuses: its two folders, the answer that refuses, its sentence. */
function theInsideRules(body: string): { outer: string; inner: string; refusedWhen: 'inside' | 'outside'; sentence: string; at: number }[] {
  const rule = /StrCpy \$R1 (\S+)\s+StrCpy \$R2 (\S+)\s+Call theFolderIsInside\s+\$\{If\} \$R0 (==|!=) "yes"\s+StrCpy \$0 "([^\n]*)"\s+Return\s+\$\{EndIf\}/g
  return [...body.matchAll(rule)].map((found) => ({
    outer: String(found[1]),
    inner: String(found[2]),
    refusedWhen: found[3] === '==' ? 'inside' : 'outside',
    sentence: String(found[4]),
    at: found.index,
  }))
}

describe('1. where a bundle keeps its Node', () => {
  it('runtime/node.exe on Windows, runtime/bin/node on Linux and a Mac', () => {
    expect(theShippedNodeIn('win32')).toEqual(['runtime', 'node.exe'])
    expect(theShippedNodeIn('linux')).toEqual(['runtime', 'bin', 'node'])
    expect(theShippedNodeIn('darwin')).toEqual(['runtime', 'bin', 'node'])
  })

  it('Node calls its Windows zip win, where process.platform says win32', () => {
    expect(theNodeArchive('win32', 'x64')).toBe(`node-v${THE_SHIPPED_NODE_VERSION}-win-x64`)
    expect(theNodeArchive('linux', 'x64')).toBe(`node-v${THE_SHIPPED_NODE_VERSION}-linux-x64`)
  })
})

describe('2. a file read out of a zip', () => {
  const node = Buffer.from('MZ a stand-in for node.exe, '.repeat(40))
  const licence = Buffer.from('Node.js is licensed for use as follows: a stand-in.\n')
  const zip = aZip([
    { name: 'node-v1-win-x64/LICENSE', bytes: licence, method: 0 },
    { name: 'node-v1-win-x64/node.exe', bytes: node, method: 8 },
  ])

  it('reads a stored and a deflated file back byte for byte', () => {
    expect(aFileInTheZip(zip, 'node-v1-win-x64/LICENSE').equals(licence)).toBe(true)
    expect(aFileInTheZip(zip, 'node-v1-win-x64/node.exe').equals(node)).toBe(true)
  })

  it('names a file the zip does not hold, and anything that is not a zip', () => {
    expect(() => aFileInTheZip(zip, 'node-v1-win-x64/npm.cmd')).toThrow('The zip holds no file node-v1-win-x64/npm.cmd.')
    expect(() => aFileInTheZip(Buffer.alloc(64), 'node.exe')).toThrow('not a zip archive')
  })

  it('refuses a file whose bytes do not match their CRC-32', () => {
    const broken = Buffer.from(zip)
    const at = broken.indexOf('Node.js is licensed')
    broken[at] = 'X'.charCodeAt(0)
    expect(() => aFileInTheZip(broken, 'node-v1-win-x64/LICENSE')).toThrow('does not match its CRC-32')
  })
})

describe('3. the target a bundle is made for', () => {
  const linux = { platform: 'linux', arch: 'x64' }

  it("is this machine's without --for, and win32-x64 or this machine's with it", () => {
    expect(theBundleTarget(['--out', 'x'], linux)).toEqual({ target: linux })
    expect(theBundleTarget(['--for', 'win32-x64'], linux)).toEqual({ target: { platform: 'win32', arch: 'x64' } })
    expect(theBundleTarget(['--for', 'linux-x64'], linux)).toEqual({ target: linux })
    expect(THE_WINDOWS_TARGET).toEqual({ platform: 'win32', arch: 'x64' })
    expect(isThisMachine({ platform: 'win32', arch: 'x64' }, linux)).toBe(false)
    expect(isThisMachine(linux, linux)).toBe(true)
  })

  it('refuses any other target, and --for with none', () => {
    expect(theBundleTarget(['--for', 'darwin-arm64'], linux)).toEqual({ refused: 'A bundle is made for this machine, linux-x64, or for win32-x64, and not for darwin-arm64.' })
    expect(theBundleTarget(['--for', 'win32-arm64'], linux)).toHaveProperty('refused')
    expect(theBundleTarget(['--for'], linux)).toEqual({ refused: "--for needs a target: win32-x64, or this machine's own, linux-x64." })
    expect(theBundleTarget(['--for', '--out', 'x'], linux)).toHaveProperty('refused')
  })

  it('bundle.mjs stops at a refused target before it writes anything', () => {
    const never = join(aFolder(), 'never')
    const ran = spawnSync(process.execPath, [join(REPO, 'scripts', 'bundle.mjs'), '--out', never, '--for', 'darwin-arm64'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 25_000,
      env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' },
    })
    expect(ran.status, ran.stderr).toBe(1)
    expect(ran.stderr).toContain('and not for darwin-arm64.')
    expect(ran.stderr).toContain('Nothing was bundled.')
    expect(existsSync(never)).toBe(false)
  })
})

describe("4. node-pty's Windows files", () => {
  it('conpty.node, conpty_console_list.node and the conpty folder, and no debugging symbols', () => {
    const folder = join('prebuilds', 'win32-x64')
    expect(thePtyNativeFile('win32', 'x64')).toBe(join(folder, 'conpty.node'))
    expect(thePtyWindowsParts('win32', 'x64')).toEqual([join(folder, 'conpty_console_list.node'), join(folder, 'conpty', 'conpty.dll'), join(folder, 'conpty', 'OpenConsole.exe')])
    expect(thePtyWindowsParts('linux', 'x64')).toEqual([])
    expect(thePtyNativeFile('linux', 'x64')).toBe(join('prebuilds', 'linux-x64', 'pty.node'))
    expect([thePtyNativeFile('win32', 'x64'), ...thePtyWindowsParts('win32', 'x64')].some((file) => file.endsWith('.pdb'))).toBe(false)
  })

  it("the checkout's node-pty has them all, and a copy without conpty.dll is named", () => {
    expect(whatThePtyLacks(PTY, 'win32', 'x64')).toEqual([])
    const copy = aFolder()
    for (const file of [thePtyNativeFile('win32', 'x64'), ...thePtyWindowsParts('win32', 'x64')].filter((file) => !file.endsWith('conpty.dll'))) {
      mkdirSync(join(copy, file, '..'), { recursive: true })
      writeFileSync(join(copy, file), '')
    }
    expect(whatThePtyLacks(copy, 'win32', 'x64')).toEqual([`node-pty has no ${join('prebuilds', 'win32-x64', 'conpty', 'conpty.dll')}, which it opens every shell through on Windows.`])
  })
})

describe('5. a download checked against a hash fixed before it', () => {
  it("takes a package from the lockfile only from npm's registry, with its sha512", () => {
    const entry = LOCK.packages['node_modules/@img/sharp-win32-x64']
    expect(theLockedPackage(LOCK, '@img/sharp-win32-x64')).toEqual({
      name: '@img/sharp-win32-x64',
      version: entry.version,
      url: entry.resolved,
      digest: { algorithm: 'sha512', encoding: 'base64', value: String(entry.integrity).slice('sha512-'.length) },
    })
    expect(() => theLockedPackage(LOCK, '@img/no-such-package')).toThrow('package-lock.json does not lock @img/no-such-package.')
    const elsewhere = { packages: { 'node_modules/a': { version: '1.0.0', resolved: 'https://example.invalid/a-1.0.0.tgz', integrity: 'sha512-AAAA' } } }
    expect(() => theLockedPackage(elsewhere, 'a')).toThrow('not from https://registry.npmjs.org/')
    const weak = { packages: { 'node_modules/a': { version: '1.0.0', resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz', integrity: 'sha1-AAAA' } } }
    expect(() => theLockedPackage(weak, 'a')).toThrow('package-lock.json gives a no sha512.')
  })

  it('uses a file that matches without downloading it, and removes one that does not', async () => {
    const folder = aFolder()
    const file = join(folder, 'kept.zip')
    writeFileSync(file, 'the bytes an earlier run downloaded')
    const value = createHash('sha256').update('the bytes an earlier run downloaded').digest('hex')
    const another = createHash('sha256').update('other bytes').digest('hex')
    const said: string[] = []
    // Port 9 answers nothing: a download would fail, so a pass means none was tried.
    const url = 'http://127.0.0.1:9/never'
    const bytes = await fetchChecked({ url, file, digest: { algorithm: 'sha256', encoding: 'hex', value }, say: (line) => said.push(line) })
    expect(bytes.toString()).toBe('the bytes an earlier run downloaded')
    expect(said).toEqual([`kept.zip matches its sha256, ${value}, fixed before it was downloaded.`])
    await expect(fetchChecked({ url, file, digest: { algorithm: 'sha256', encoding: 'hex', value: another }, say: () => {} })).rejects.toThrow(
      `kept.zip does not match its sha256 (${value}, expected ${another}); the file was removed and nothing was used in its place.`,
    )
    expect(existsSync(file)).toBe(false)
  })
})

describe("6. the avatar codec's Windows package", () => {
  it('is the package the lockfile locks from the registry', () => {
    expect(theAvatarCodecPackageFor('win32', 'x64')).toBe('@img/sharp-win32-x64')
    expect(() => theLockedPackage(LOCK, theAvatarCodecPackageFor('win32', 'x64'))).not.toThrow()
  })

  it('is copied only at the version the lockfile locks, and carries libvips\'s library notices', () => {
    const fetched = aFolder()
    const version = String(LOCK.packages['node_modules/@img/sharp-win32-x64'].version)
    writeFileSync(join(fetched, 'package.json'), JSON.stringify({ name: '@img/sharp-win32-x64', version }))
    writeFileSync(join(fetched, 'README.md'), '# a stand-in for the package README, which lists libvips and its libraries\n')
    mkdirSync(join(fetched, 'lib'))
    writeFileSync(join(fetched, 'lib', 'libvips-42.dll'), '')
    expect(() => copyAvatarCodecInto(aFolder(), { platform: 'win32', arch: 'x64', folder: fetched, version: '0.0.0-not-locked' })).toThrow(
      `${fetched} holds @img/sharp-win32-x64@${version}, not @img/sharp-win32-x64@0.0.0-not-locked.`,
    )
    const out = aFolder()
    const copied = copyAvatarCodecInto(out, { platform: 'win32', arch: 'x64', folder: fetched, version })
    expect(copied.packages).toContain('@img/sharp-win32-x64')
    expect(copied.packages.some((name: string) => name.startsWith('@img/sharp-linux'))).toBe(false)
    const notices = readFileSync(join(out, 'node_modules', '@img', 'sharp-win32-x64', 'LICENSE-LIBRARY-NOTICES.txt'), 'utf8')
    expect(notices).toContain('a stand-in for the package README')
    expect(notices).toContain('GNU LESSER GENERAL PUBLIC LICENSE')
  })
})

describe("7. the Windows build's facts", () => {
  it('is made on Linux on x64 only', () => {
    expect(theWindowsBuildRefusal({ platform: 'linux', arch: 'x64' })).toBeNull()
    expect(theWindowsBuildRefusal({ platform: 'darwin', arch: 'arm64' })).toBe('The Windows installer is made on Linux, and this machine is darwin.')
    expect(theWindowsBuildRefusal({ platform: 'win32', arch: 'x64' })).toBe('The Windows installer is made on Linux, and this machine is win32.')
    expect(theWindowsBuildRefusal({ platform: 'linux', arch: 'arm64' })).toBe('The Windows installer is made on Linux on an x64 processor, and this one is arm64.')
  })

  it("takes Electron's Windows zip at the SHA-256 the electron package pins", () => {
    const electron = join(REPO, 'node_modules', 'electron')
    const { version } = JSON.parse(readFileSync(join(electron, 'package.json'), 'utf8'))
    const pinned = JSON.parse(readFileSync(join(electron, 'checksums.json'), 'utf8'))
    const name = `electron-v${version}-win32-x64.zip`
    expect(theElectronZip(electron)).toEqual({
      name,
      version,
      url: `https://github.com/electron/electron/releases/download/v${version}/${name}`,
      digest: { algorithm: 'sha256', encoding: 'hex', value: pinned[name] },
    })
    const unpinned = aFolder()
    writeFileSync(join(unpinned, 'package.json'), JSON.stringify({ version }))
    writeFileSync(join(unpinned, 'checksums.json'), '{}')
    expect(() => theElectronZip(unpinned)).toThrow(`pins no SHA-256 for ${name}.`)
  })

  it("gives the installer's facts from the places that decide them", () => {
    const facts = theInstallerFacts()
    expect(facts).toEqual({
      THE_NAME: 'Mole Office',
      THE_DATA_FOLDER: facts['THE_DATA_FOLDER'],
      THE_DEFAULT_DATA_FOLDER: facts['THE_DEFAULT_DATA_FOLDER'],
      THE_DATABASE: facts['THE_DATABASE'],
      THE_OFFICE: 'resources\\office',
      THE_NODE: ['resources', 'office', ...theShippedNodeIn('win32')].join('\\'),
      THE_COMMAND: `resources\\office\\${THE_BUNDLES[THE_COMMAND_ENTRY]}`,
      THE_STOP_WAIT_MS: String(STOP_PIPE_WAIT_MS + STOP_WAIT_MS + THE_HOLDER_ENDS_WITHIN_MS + 15_000),
      THE_STOPPED: String(EXIT.OK),
      THE_NOT_RUNNING: String(EXIT.NOT_RUNNING),
      THE_STALE: String(EXIT.STALE),
      THE_HOLDER_NOT_STOPPED: String(EXIT.HOLDER_NOT_STOPPED),
    })
    expect(facts['THE_NODE']).toBe('resources\\office\\runtime\\node.exe')
    const base = 'C:\\Users\\a-person\\AppData\\Roaming'
    const folder = String(facts['THE_DATA_FOLDER'])
    expect(folder).not.toBe('')
    expect(folder.startsWith('..')).toBe(false)
    expect(thePerUserDataFolder({ APPDATA: base }, 'win32')).toBe(join(base, ...folder.split('\\')))
    // The default database is the setting's own, in the per-user folder: the folder it is in, and its name.
    const perUser = win32.join(base, folder)
    const database = win32.join(perUser, String(facts['THE_DEFAULT_DATA_FOLDER']), String(facts['THE_DATABASE']))
    expect(database).toBe(win32.resolve(perUser, String(settingNamed('MOLE_OFFICE_DB').fallback)))
    expect(String(facts['THE_DATABASE'])).not.toContain('\\')
  })

  it('writes the facts as !define lines in front of the script, and refuses one NSIS would read as more', () => {
    const script = theInstallerScript('Name "${THE_NAME}"\n', { THE_NAME: 'Mole Office', THE_STALE: '4' })
    expect(script.split('\n').slice(1, 3)).toEqual(['!define THE_NAME "Mole Office"', '!define THE_STALE "4"'])
    expect(script.endsWith('\n\nName "${THE_NAME}"\n')).toBe(true)
    for (const value of ['Mole "Office"', 'C:\\$TEMP', 'two\nlines']) {
      expect(() => theInstallerScript('', { THE_NAME: value })).toThrow("The installer's fact THE_NAME holds")
    }
  })

  it('configures a per-user NSIS installer that lets the person choose the folder, unsigned, with the Linux fuses and no wine', () => {
    const config = theWindowsBuilderConfig({ app: '/a', out: '/o', work: '/w', electronVersion: '44.0.0', electronZip: '/z/electron.zip', script: '/w/i.nsi', icon: '/i.png' })
    expect(config.win).toEqual({ target: [{ target: 'nsis', arch: ['x64'] }], icon: '/i.png', signExecutable: false })
    expect(config.nsis).toEqual({
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      perMachine: false,
      allowElevation: false,
      packElevateHelper: false,
      script: '/w/i.nsi',
      differentialPackage: false,
    })
    expect(config.toolsets).toEqual({ nsis: THE_NSIS_TOOLSET })
    expect(config.electronDist).toBe('/z/electron.zip')
    expect(config.extraResources).toEqual([{ from: '/w', to: '.', filter: ['office/**/*'] }])
    const fuses = Object.fromEntries(Object.entries(config.electronFuses).map(([name, on]) => [name.charAt(0).toUpperCase() + name.slice(1), on ? 'on' : 'off']))
    expect(fuses).toEqual({ ...THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC })
  })

  it("reads the execution levels a program's manifest asks for", () => {
    const manifest = (level: string): Buffer => Buffer.from(`MZ\0\0<trustInfo><security><requestedPrivileges><requestedExecutionLevel level="${level}" uiAccess="false"/></requestedPrivileges></security></trustInfo>`, 'latin1')
    expect(theExecutionLevelsIn(manifest('asInvoker'))).toEqual(['asInvoker'])
    expect(theExecutionLevelsIn(manifest('requireAdministrator'))).toEqual(['requireAdministrator'])
    expect(theExecutionLevelsIn(Buffer.from('MZ no manifest'))).toEqual([])
  })
})

describe("8. the installer's script", () => {
  it('installs for the person running it and never asks for an administrator', () => {
    expect(CODE.match(/^[ \t]*RequestExecutionLevel[ \t]+\S+/gm)).toEqual(['RequestExecutionLevel user'])
    expect(CODE).toContain('InstallDir "$LOCALAPPDATA\\Programs\\${PRODUCT_FILENAME}"')
    expect(CODE).not.toMatch(/HKLM|\$PROGRAMFILES|SetShellVarContext\s+all|UserInfo::|runas/i)
    expect(section('-install')).toContain('SetShellVarContext current')
    expect(section('Uninstall')).toContain('SetShellVarContext current')
    // The office's settings, in %APPDATA%\mole-office, and its data folder are never removed. The only line
    // that names $APPDATA reads the per-user folder, before any page. The sections never name $APPDATA, and no
    // line of theirs that removes a file or a folder names the per-user folder or the data folder.
    expect(section('-install')).not.toContain('$APPDATA')
    expect(section('Uninstall')).not.toContain('$APPDATA')
    const dataFolderLines = CODE.split('\n').filter((one) => one.includes('$APPDATA'))
    expect(dataFolderLines).toHaveLength(1)
    for (const line of dataFolderLines) expect(line).toMatch(/^\s*StrCpy \$thePerUserFolder "\$APPDATA\\\$\{THE_DATA_FOLDER\}"$/)
    expect(fn('.onInit')).toContain(String(dataFolderLines[0]))
    expect(section('Uninstall')).not.toMatch(/\$thePerUserFolder|\$theDataFolder/)
    for (const line of section('-install').split('\n').filter((one) => /RMDir|Delete /.test(one))) {
      expect(line).not.toMatch(/\$thePerUserFolder|\$theDataFolder/)
    }
  })

  it('asks for the folder on a directory page before the install files page, and never in the uninstaller', () => {
    const directory = /^Page directory (\S+) "" (\S+)$/m.exec(CODE)
    const instfiles = /^Page instfiles$/m.exec(CODE)
    expect(directory, 'the script has a folder page').not.toBeNull()
    expect(instfiles, 'the script has the install files page').not.toBeNull()
    expect(directory!.index).toBeLessThan(instfiles!.index)
    expect(CODE.match(/^Page directory /gm)).toHaveLength(1)
    expect(CODE.match(/^UninstPage .*$/gm)).toEqual(['UninstPage instfiles'])
  })

  it('takes the folder Installed apps records as the default, from the same key the install section writes', () => {
    const defined = /^!define (THE_UNINSTALL_KEY) "([^"]+)"$/m.exec(CODE)
    expect(defined, 'the script defines where Installed apps keeps this product').not.toBeNull()
    const name = String(defined?.[1])
    expect(section('-install')).toContain(`WriteRegStr HKCU "\${${name}}" "InstallLocation" "$INSTDIR"`)
    const recorded = new RegExp(`^InstallDirRegKey HKCU "\\$\\{${name}\\}" "InstallLocation"$`, 'm')
    const line = recorded.exec(CODE)
    expect(line, 'the installer takes the recorded folder as its default').not.toBeNull()
    const fallback = CODE.indexOf('InstallDir "$LOCALAPPDATA\\Programs\\${PRODUCT_FILENAME}"')
    expect(fallback).toBeGreaterThan(-1)
    expect(fallback).toBeLessThan(line!.index)
  })

  it('skips the folder page when this product is already in the folder, so an update keeps its folder', () => {
    const page = /^Page directory (\S+) "" (\S+)$/m.exec(CODE)
    expect(page, 'the script has a folder page').not.toBeNull()
    const start = CODE.indexOf(`Function ${String(page?.[1])}`)
    expect(start).toBeGreaterThan(-1)
    const callback = CODE.slice(start, CODE.indexOf('FunctionEnd', start)).replace(/\s+/g, ' ')
    expect(callback).toContain('${If} ${FileExists} "$INSTDIR\\${THE_UNINSTALLER}" Abort ${EndIf}')
  })

  it('decides in one function which folder is refused: one that holds something without an uninstaller of this product, and never an empty one', () => {
    const decide = fn('theFolderIsRefused')
    // The function clears $0 first, because each caller reads it as the refusal.
    expect(decide.trimStart()).toMatch(/^Function theFolderIsRefused\s+StrCpy \$0 ""/)
    const state = /\$\{DirState\} "\$INSTDIR" (\$[A-Za-z0-9]+)/.exec(decide)
    expect(state, 'the function reads the state of $INSTDIR').not.toBeNull()
    const register = String(state?.[1])
    const held = decide.indexOf(`\${If} ${register} == 1`, state!.index)
    expect(held, 'the folder is refused only when it holds something').toBeGreaterThan(-1)
    const notOurs = decide.indexOf('${IfNot} ${FileExists} "$INSTDIR\\${THE_UNINSTALLER}"', held)
    expect(notOurs, "a folder holding this product's uninstaller goes on").toBeGreaterThan(-1)
    const refusal = decide.indexOf('StrCpy $0', notOurs)
    expect(refusal, 'the function refuses that folder').toBeGreaterThan(-1)
    expect(refusal).toBeLessThan(decide.indexOf('${EndIf}', notOurs))
    const line = decide.slice(refusal, decide.indexOf('\n', refusal))
    expect(line).toContain('$INSTDIR')
    // The test is the state of the folder, because FileExists calls an empty folder full.
    expect(decide).not.toContain('${FileExists} "$INSTDIR\\*.*"')
  })

  it('refuses the per-user folder and any folder inside it first, then a folder inside the data folder or holding it, each with a sentence that says what is kept there', () => {
    const inside = theFolderIsInsideAsWritten()
    const appData = 'C:\\Users\\a-person\\AppData\\Roaming'
    const perUser = `${appData}\\${String(theInstallerFacts()['THE_DATA_FOLDER'])}`
    expect([
      inside(perUser, perUser),
      inside(perUser, `${perUser}\\office`),
      inside(perUser, perUser.toUpperCase()),
      inside(perUser, `${perUser}-old`),
      inside(perUser, appData),
      inside(perUser, 'C:\\Users\\a-person\\AppData\\Local\\Programs\\Mole Office'),
      inside('D:\\Mole Office', 'D:\\Mole Office\\data'),
      inside('D:\\Mole Office\\data', 'D:\\Mole Office'),
    ]).toEqual([true, true, true, false, false, false, true, false])

    const decide = fn('theFolderIsRefused')
    const rules = theInsideRules(decide)
    expect(rules.map(({ outer, inner, refusedWhen }) => [outer, inner, refusedWhen])).toEqual([
      ['$thePerUserFolder', '$INSTDIR', 'inside'],
      ['$INSTDIR', '$theDataFolder', 'inside'],
      ['$theDataFolder', '$INSTDIR', 'inside'],
    ])
    const [perUserRule, holdsTheData, insideTheData] = rules
    expect(perUserRule!.sentence).toContain('$INSTDIR')
    expect(perUserRule!.sentence).toContain('$thePerUserFolder')
    for (const rule of [holdsTheData!, insideTheData!]) {
      expect(rule.sentence).toContain('$INSTDIR')
      expect(rule.sentence).toContain('$theDataFolder')
      // When the installed office could not say where its data is, the sentence says the default was assumed.
      expect(rule.sentence).toMatch(/ \$theDataFolderIsAssumed$/)
    }
    // The data folder in use is read after the per-user folder's rule, which needs nothing from it, and before the two rules that do.
    const asked = decide.indexOf('Call theDataFolderInUse')
    expect(asked).toBeGreaterThan(perUserRule!.at)
    expect(asked).toBeLessThan(holdsTheData!.at)
    // Each rule ends the function, and all three come before the folder's own state, so no later rule replaces their sentence.
    expect(insideTheData!.at).toBeLessThan(decide.indexOf('${DirState}'))
  })

  it('refuses that folder in the install section too, before the stop and the writing, because a silent install shows no folder page', () => {
    const install = section('-install')
    const refused = install.indexOf('Call theFolderIsRefused')
    expect(refused, 'the install section applies the refusal rule').toBeGreaterThan(-1)
    expect(refused).toBeLessThan(install.indexOf('Call theStop'))
    expect(refused).toBeLessThan(install.indexOf('SetOutPath "$INSTDIR"'))
    const check = install.indexOf('${If} $0 != ""', refused)
    expect(check, 'the section refuses when the rule gives a sentence').toBeGreaterThan(refused)
    const refusal = install.indexOf('!insertmacro theRefusal "$0"', check)
    expect(refusal, 'the section shows the sentence').toBeGreaterThan(check)
    expect(refusal).toBeLessThan(install.indexOf('${EndIf}', check))
    expect(install).not.toContain('${DirState}')
  })

  it('keeps the folder page open on a folder it refuses, so the person can choose another', () => {
    const page = /^Page directory (\S+) "" (\S+)$/m.exec(CODE)
    expect(page, 'the script has a folder page').not.toBeNull()
    const leave = fn(String(page?.[2]))
    const refused = leave.indexOf('Call theFolderIsRefused')
    expect(refused, 'the folder page applies the same refusal rule').toBeGreaterThan(-1)
    const check = leave.indexOf('${If} $0 != ""', refused)
    expect(check).toBeGreaterThan(refused)
    const box = leave.indexOf('MessageBox', check)
    expect(box, 'the page says why it refuses').toBeGreaterThan(check)
    expect(leave.slice(box, leave.indexOf('\n', box))).toContain('"$0"')
    const abort = leave.indexOf('Abort', box)
    expect(abort, 'the page stays open').toBeGreaterThan(box)
    expect(abort).toBeLessThan(leave.indexOf('${EndIf}', check))
    expect(leave).not.toContain('Quit')
    expect(leave).not.toContain('SetErrorLevel')
    expect(leave).not.toContain('theRefusal')
  })

  it('removes what a partial unpack put in the folder before it refuses to go on', () => {
    const install = section('-install')
    const extracted = install.indexOf('Nsis7z::Extract')
    expect(extracted, 'the install section extracts the app').toBeGreaterThan(-1)
    const look = install.indexOf('${IfNot} ${FileExists} "$INSTDIR\\${THE_WINDOW_EXE}"', extracted)
    expect(look, 'the install section looks for the unpacked files').toBeGreaterThan(-1)
    const left = install.indexOf('SetOutPath "$TEMP"', look)
    expect(left, 'the block leaves the folder before removing it').toBeGreaterThan(-1)
    const removed = install.indexOf('RMDir /r "$INSTDIR"', left)
    expect(removed, 'the block removes what was unpacked').toBeGreaterThan(-1)
    const refusal = install.indexOf('!insertmacro theRefusal', removed)
    expect(refusal, 'the block refuses to go on').toBeGreaterThan(-1)
    expect(refusal).toBeLessThan(install.indexOf('${EndIf}', look))
  })

  it('finds what runs from the folder by the path of each program, never by its command line', () => {
    expect(CODE).toContain('$$_.ExecutablePath.StartsWith($$d, [StringComparison]::OrdinalIgnoreCase)')
    expect(CODE).not.toMatch(/CommandLine|Get-Process\s+-Name|taskkill|ProcessName/i)
    const start = CODE.indexOf('Function ${un}theStop')
    const stop = CODE.slice(start, CODE.indexOf('FunctionEnd', start))
    // The office is asked to stop with its own Node and command first; only what is left is stopped by its path.
    expect(stop.indexOf('"$INSTDIR\\${THE_NODE}" "$INSTDIR\\${THE_COMMAND}" stop')).toBeGreaterThan(-1)
    expect(stop.indexOf('"$INSTDIR\\${THE_NODE}" "$INSTDIR\\${THE_COMMAND}" stop')).toBeLessThan(stop.indexOf('Stop-Process'))
    expect(stop).toContain('${If} $1 != ${THE_STOPPED}\n    ${AndIf} $1 != ${THE_NOT_RUNNING}\n    ${AndIf} $1 != ${THE_STALE}\n    ${AndIf} $1 != ${THE_HOLDER_NOT_STOPPED}')
  })

  it('stops what runs from the folder before it changes the folder, and stops itself when it cannot', () => {
    const install = section('-install')
    const stopped = install.indexOf('Call theStop')
    expect(stopped).toBeGreaterThan(-1)
    for (const change of ['RMDir', 'File ', 'Nsis7z::Extract', 'WriteUninstaller', 'WriteRegStr', 'CreateShortCut']) {
      expect(install.indexOf(change), `${change} comes after the stop`).toBeGreaterThan(stopped)
    }
    expect(install.slice(stopped, install.indexOf('RMDir'))).toMatch(/\$\{If\} \$0 != "stopped"\s+!insertmacro theRefusal/)
    const uninstall = section('Uninstall')
    const unStopped = uninstall.indexOf('Call un.theStop')
    expect(unStopped).toBeGreaterThan(-1)
    for (const change of ['DeleteRegValue', 'Delete ', 'DeleteRegKey', 'RMDir']) {
      expect(uninstall.indexOf(change), `${change} comes after the stop`).toBeGreaterThan(unStopped)
    }
    expect(CODE).toMatch(/!macro theRefusal sentence\s+MessageBox[^\n]*\s+SetErrorLevel 2\s+Quit\s+!macroend/)
  })

  it("writes which step of the stop refused, with the step's exit code and what it printed, to a file in TEMP", () => {
    const words = (text: string): string => text.trim().replace(/\s+/g, ' ')
    expect(CODE).toMatch(/^!define THE_STOP_REFUSED "\$TEMP\\\$\{PRODUCT_FILENAME\}-stop-refused\.txt"$/m)
    const start = CODE.indexOf('Function ${un}theStop')
    const stop = CODE.slice(start, CODE.indexOf('FunctionEnd', start))
    // The file of an earlier refusal is deleted first, so a file there after a run says that run refused.
    expect(words(stop)).toMatch(/^Function \$\{un\}theStop Delete "\$\{THE_STOP_REFUSED\}" /)
    // Each of the three steps keeps its exit code in $1 and what it printed in $2. ExecToLog keeps neither.
    expect(CODE).not.toContain('ExecToLog')
    expect(stop.match(/nsExec::/g)).toHaveLength(3)
    expect(stop.match(/nsExec::ExecToStack [^\n]+\n\s*Pop \$1\n\s*Pop \$2\n/g)).toHaveLength(3)
    // Each refusal is one use of the macro, with its own sentence, and $0 is set nowhere else but to "stopped".
    const refusals = [...stop.matchAll(/!insertmacro theStopRefused "([^"]+)"/g)].map((found) => String(found[1]))
    expect(refusals).toHaveLength(3)
    expect(new Set(refusals).size).toBe(3)
    expect(stop.match(/StrCpy \$0 [^\n]+/g)).toEqual(['StrCpy $0 "stopped"', 'StrCpy $0 "stopped"'])
    // The macro writes the sentence, the exit code and what was printed, and returns with the sentence in $0.
    expect(words(CODE)).toContain(words([
      '!macro theStopRefused sentence',
      'StrCpy $0 "${sentence}"',
      'FileOpen $3 "${THE_STOP_REFUSED}" w',
      'FileWrite $3 "${sentence}$\\r$\\nIt answered: $1$\\r$\\nIt printed:$\\r$\\n$2$\\r$\\n"',
      'FileClose $3',
      'Return',
      '!macroend',
    ].join(' ')))
    expect(CODE.indexOf('!macro theStopRefused sentence')).toBeLessThan(CODE.indexOf('!macro theStop un'))
  })

  it('deletes only the Run values that start the installed window by its full path, with their StartupApproved twins', () => {
    expect(CODE).toContain('!define THE_RUN_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Run"')
    expect(CODE).toContain('!define THE_APPROVED_RUN_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run"')
    const uninstall = section('Uninstall')
    expect(uninstall).toContain('StrCmp $R3 `"$INSTDIR\\${THE_WINDOW_EXE}"` theRunValueIsOurs')
    expect(uninstall).toContain('StrCmp $R2 "$INSTDIR\\${THE_WINDOW_EXE}" theRunValueIsOurs')
    const ours = uninstall.slice(uninstall.indexOf('theRunValueIsOurs:'), uninstall.indexOf('theRunValuesDone:'))
    expect(ours).toContain('DeleteRegValue HKCU "${THE_RUN_KEY}" $R1')
    expect(ours).toContain('DeleteRegValue HKCU "${THE_APPROVED_RUN_KEY}" $R1')
    expect(uninstall.match(/DeleteRegValue/g)).toHaveLength(2)
  })

  it('removes the folder before its entry in Installed apps, tries again once a second, and keeps the entry while any of the folder is left', () => {
    const words = (text: string): string => text.trim().replace(/\s+/g, ' ')
    expect(CODE).toMatch(/^!define THE_REMOVAL_TRIES 10$/m)
    const uninstall = section('Uninstall')
    expect(uninstall.match(/RMDir/g)).toHaveLength(1)
    expect(uninstall.match(/DeleteRegKey/g)).toHaveLength(1)
    expect(uninstall.indexOf('DeleteRegKey')).toBeGreaterThan(uninstall.indexOf('RMDir'))
    // While some of the folder is there, it waits a second and tries again, up to the tries.
    expect(words(uninstall)).toContain(words([
      'StrCpy $R0 1',
      'theRemoval:',
      'RMDir /r "$INSTDIR"',
      '${If} ${FileExists} "$INSTDIR\\*.*"',
      '${AndIf} $R0 < ${THE_REMOVAL_TRIES}',
      'IntOp $R0 $R0 + 1',
      'Sleep 1000',
      'Goto theRemoval',
      '${EndIf}',
    ].join(' ')))
    // When some is left, the uninstaller the entry starts is put back, and it stops before the entry is deleted.
    expect(words(uninstall.slice(uninstall.indexOf('Goto theRemoval')))).toContain(words([
      '${EndIf}',
      '${If} ${FileExists} "$INSTDIR\\*.*"',
      '${IfNot} ${FileExists} "$INSTDIR\\${THE_UNINSTALLER}"',
      'CopyFiles /SILENT "$EXEPATH" "$INSTDIR\\${THE_UNINSTALLER}"',
      '${EndIf}',
      '!insertmacro theRefusal "Some of $INSTDIR could not be removed, so ${THE_NAME} stays in Installed apps."',
      '${EndIf}',
      'DeleteRegKey HKCU "${THE_UNINSTALL_KEY}"',
    ].join(' ')))
  })

  it('reads exactly the facts it is given, and of electron-builder only the defines it passes', () => {
    const own = new Set([...CODE.matchAll(/^!define (THE_[A-Z_]+)/gm)].map((found) => String(found[1])))
    const read = new Set([...CODE.matchAll(/\$\{(THE_[A-Z_]+)\}/g)].map((found) => String(found[1])).filter((name) => !own.has(name)))
    expect([...read].sort()).toEqual(Object.keys({ ...theInstallerFacts(), ...theMapFacts('') }).sort())
    const nsis = new Set([
      'If', 'IfNot', 'Else', 'ElseIf', 'AndIf', 'AndIfNot', 'OrIf', 'OrIfNot', 'EndIf', 'Do', 'Loop', 'ExitDo', 'FileExists', 'DirState', 'Errors',
      'Silent', 'GetParameters', 'GetOptions', 'NSD_CreateLabel', 'NSD_CreateDirRequest', 'NSD_CreateBrowseButton', 'NSD_OnClick', 'NSD_GetText',
      'NSD_SetText', 'NSIS_MAX_STRLEN', 'un', 'sentence',
    ])
    // A section's own name for its index, as in `Section /o "Office map" theMapPart`, is the script's own.
    const parts = new Set([...CODE.matchAll(/^Section (?:\/o )?"[^"]*" (\w+)$/gm)].map((found) => String(found[1])))
    const builder = new Set(
      [...CODE.matchAll(/\$\{([A-Za-z_0-9]+)\}/g)].map((found) => String(found[1])).filter((name) => !name.startsWith('THE_') && !nsis.has(name) && !parts.has(name)),
    )
    expect([...builder].sort()).toEqual(['APP_64', 'COMPANY_NAME', 'ESTIMATED_SIZE', 'MUI_ICON', 'MUI_UNICON', 'PRODUCT_FILENAME', 'UNINSTALL_APP_KEY', 'VERSION'])
  })
})

describe('9. package-windows.mjs', () => {
  const text = read('scripts/package-windows.mjs')
  const at = (pattern: string): number => {
    const found = text.indexOf(pattern)
    expect(found, `package-windows.mjs has ${pattern}`).toBeGreaterThan(-1)
    return found
  }

  it('refuses another machine before it makes a folder, then bundles for Windows and puts node.exe in', () => {
    expect(at('const refusal = theWindowsBuildRefusal({ platform: process.platform, arch: process.arch })')).toBeLessThan(at('mkdirSync(out, { recursive: true })'))
    expect(at("'--for', theTargetsName(THE_WINDOWS_TARGET)")).toBeLessThan(at("await putTheShippedNodeInto(office, 'win32', 'x64', say)"))
  })

  it("writes the script with its facts, runs electron-builder for Windows x64, and reads back the binary, the version and the manifest", () => {
    expect(text).toContain("theInstallerScript(readFileSync(join(REPO_ROOT, 'scripts', 'windows-installer.nsi'), 'utf8'), { ...theInstallerFacts(), ...theMapFacts(map) })")
    expect(text).toContain("'--win', '--x64', '--config', configFile")
    expect(text).toContain('whatThePackedAppGetsWrong({ unpacked, root: REPO_ROOT, version: own.version, executable: THE_WINDOWS_EXECUTABLE, fuses: THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC })')
    expect(THE_WINDOWS_EXECUTABLE).toBe('mole-office.exe')
    expect(text).toContain("if (levels.length !== 1 || levels[0] !== 'asInvoker')")
    expect(at('const wrong = whatThePackedAppGetsWrong(')).toBeLessThan(at('removeTheInstallers()\n    fail(`${wrong.join'))
  })

  it('says each check that cannot run on Linux was not run', () => {
    expect(text.match(/say\(`NOT RUN: /g)).toHaveLength(2)
    expect(JSON.parse(read('package.json')).scripts['package:windows']).toBe('node scripts/package-windows.mjs')
  })
})

describe('10. where the data goes at install (DF23 to DF25)', () => {
  const words = (text: string): string => text.trim().replace(/\s+/g, ' ')
  const theDefault = '$thePerUserFolder\\${THE_DEFAULT_DATA_FOLDER}'
  const theKeptPlace = en['settingsCats.cat.kept']

  it('shows the data page after the folder page and before the install files page, only on a first install', () => {
    const directory = /^Page directory /m.exec(CODE)
    const data = /^Page custom (\S+) (\S+)$/m.exec(CODE)
    const instfiles = /^Page instfiles$/m.exec(CODE)
    expect(data, 'the script has a page of its own for the data folder').not.toBeNull()
    expect(CODE.match(/^Page custom /gm)).toHaveLength(1)
    expect(directory!.index).toBeLessThan(data!.index)
    expect(data!.index).toBeLessThan(instfiles!.index)
    const page = fn(String(data?.[1]))
    expect(words(page)).toMatch(/^Function theDataPage Call theFirstInstallHere \$\{If\} \$theFirstInstall != "yes" Abort \$\{EndIf\} nsDialogs::Create 1018 /)
    expect(page).toContain('${NSD_CreateDirRequest} 0 54u 75% 12u "$theDataFolder"\n  Pop $theDataBox')
    expect(page.match(/nsDialogs::Show/g)).toHaveLength(1)
    // The page says the folder can be moved later, by the name the Settings page gives the place.
    const label = /\$\{NSD_CreateLabel\} [^"]+"([^"]+)"/.exec(page)
    expect(label, 'the page says what it asks').not.toBeNull()
    expect(String(label?.[1])).toContain(`in Settings, under ${theKeptPlace}`)
  })

  it('takes a first install to be one with no product in the install folder and nothing in the per-user folder', () => {
    expect(words(fn('theFirstInstallHere'))).toBe(words([
      'Function theFirstInstallHere',
      'StrCpy $theFirstInstall "no"',
      '${DirState} "$thePerUserFolder" $R9',
      '${If} $R9 != 1',
      '${AndIfNot} ${FileExists} "$INSTDIR\\${THE_UNINSTALLER}"',
      'StrCpy $theFirstInstall "yes"',
      '${EndIf}',
    ].join(' ')))
    expect(CODE.match(/StrCpy \$theFirstInstall /g)).toHaveLength(2)
  })

  it('starts from the default data folder, and takes the place given with /DATA= before any page', () => {
    const init = words(fn('.onInit'))
    expect(init).toContain(words(`StrCpy $thePerUserFolder "$APPDATA\\\${THE_DATA_FOLDER}" StrCpy $theDataFolder "${theDefault}"`))
    expect(init).toContain(words([
      'StrCpy $theDataPlaceGiven "no"',
      '${GetParameters} $R0',
      'ClearErrors',
      '${GetOptions} $R0 "/DATA=" $R1',
      '${IfNot} ${Errors}',
      'StrCpy $theDataFolder $R1',
      'StrCpy $theDataPlaceGiven "yes"',
      '${EndIf}',
    ].join(' ')))
    // The default is the same folder in every place it is named: the per-user folder's data folder.
    const named = [...CODE.matchAll(/[^\s"]*\$\{THE_DEFAULT_DATA_FOLDER\}/g)].map((found) => found[0])
    expect(named.length).toBeGreaterThanOrEqual(4)
    for (const one of named) expect(one).toBe(theDefault)
  })

  it('refuses a place by the rules of DF23, in their order, and takes the default as it is', () => {
    const place = fn('theDataPlaceIsRefused')
    expect(words(place)).toMatch(new RegExp('^' + words([
      'Function theDataPlaceIsRefused',
      'StrCpy $0 ""',
      'StrCpy $R9 $theDataFolder',
      'Call theBackslashesOff',
      'StrCpy $theDataFolder $R9',
      `\${If} $theDataFolder == "${theDefault}"`,
      'Return',
      '${EndIf}',
    ].join(' ')).replace(/[$^{}()|[\]\\.*+?]/g, (character) => `\\${character}`)))
    expect(words(fn('theBackslashesOff'))).toBe(words('Function theBackslashesOff ${Do} StrCpy $R8 $R9 1 -1 ${If} $R8 != "\\" ${ExitDo} ${EndIf} StrCpy $R9 $R9 -1 ${Loop}'))

    // theDriveComesFirst is the one place the script asks whether a value begins with a drive letter, a
    // colon and a backslash. Windows answers the letter part, which cannot run here; the colon and
    // backslash part is read from the script, as theDataPlaceIsInTheFolder's check was before.
    const driveFirst = fn('theDriveComesFirst')
    expect(words(driveFirst)).toBe(words([
      'Function theDriveComesFirst',
      "System::Call 'shlwapi::PathGetDriveNumber(t R9) i .R8'",
      '${If} $R8 < 0',
      'StrCpy $R8 "no"',
      'Return',
      '${EndIf}',
      'StrCpy $R8 $R9 2 1',
      '${If} $R8 == ":\\"',
      'StrCpy $R8 "yes"',
      '${Else}',
      'StrCpy $R8 "no"',
      '${EndIf}',
    ].join(' ')))
    expect(driveFirst).toContain("System::Call 'shlwapi::PathGetDriveNumber(t R9) i .R8'")
    expect(words(driveFirst)).toContain(words('${If} $R8 < 0 StrCpy $R8 "no" Return ${EndIf}'))
    const colon = /StrCpy \$R8 \$R9 (\d+) (\d+)\s+\$\{If\} \$R8 (==|!=) "([^"]+)"/.exec(driveFirst)
    expect(colon, 'the function compares the second and third characters with the script\'s own answer').not.toBeNull()
    // PathGetDriveNumber answers 0 or more only for a letter A to Z and a colon.
    const beginsWithADriveAndBackslash = (one: string): boolean => {
      if (!/^[A-Za-z]:/.test(one)) return false
      const matched = one.substr(Number(colon?.[2]), Number(colon?.[1])) === colon?.[4]
      return colon?.[3] === '==' ? matched : !matched
    }
    expect(['D:\\Data', 'C:\\Users\\a-person\\Mole Office', 'Data', 'D:Data', '\\\\server\\share\\data', 'C:\\', '1:\\Data'].map(beginsWithADriveAndBackslash)).toEqual([
      true, true, false, false, false, true, false,
    ])
    // The script compares with a colon and a backslash in this one function.
    expect(CODE.match(/":\\"/g)).toHaveLength(1)
    expect(driveFirst).toContain('":\\"')

    // A full path that begins with a drive letter: theDriveComesFirst says so, and it is long enough.
    const drive = /Call theDriveComesFirst\s+StrLen \$R2 \$theDataFolder\s+\$\{If\} \$R8 != "yes"\s+\$\{OrIf\} \$R2 < (\d+)\s+StrCpy \$0 "([^\n]*)"\s+Return/.exec(place)
    expect(drive, 'the function refuses a place that is not a full path').not.toBeNull()
    const isAFullPath = (one: string): boolean => beginsWithADriveAndBackslash(one) && one.length >= Number(drive?.[1])
    expect(['D:\\Data', 'C:\\Users\\a-person\\Mole Office', 'Data', 'D:Data', '\\\\server\\share\\data', 'C:\\', '1:\\Data'].map(isAFullPath)).toEqual([true, true, false, false, false, false, false])
    // A place outside the profile folder is not refused, so no sentence sends the person into it.
    expect(drive?.[2]).not.toContain('$PROFILE')
    expect(place).not.toContain('$PROFILE')

    const rules = theInsideRules(place)
    expect(rules.map(({ outer, inner, refusedWhen }) => [outer, inner, refusedWhen])).toEqual([
      ['$theDataFolder', '$thePerUserFolder', 'inside'],
    ])
    const [settings] = rules
    expect(settings!.sentence).toContain('$thePerUserFolder')
    const inside = theFolderIsInsideAsWritten()
    expect(inside('C:\\Users\\a-person', 'C:\\Users\\a-person\\Mole Office data')).toBe(true)
    expect(inside('C:\\Users\\a-person', 'C:\\Users\\a-person-2\\Mole Office data')).toBe(false)
    expect(inside('D:\\Mole Office', 'C:\\Users\\a-person')).toBe(false)

    // The variables the function reads are the move's own list, in its order. Each is read into $R5 and asked
    // about, and refused with the temporary folder's words. No OneDrive folder is looked for.
    const variables = [...THE_TEMPORARY_FOLDER_VARIABLES]
    expect(CODE).not.toContain('OneDrive')
    expect([...place.matchAll(/ReadEnvStr \$R5 "([^"]+)"/g)].map((found) => String(found[1]))).toEqual(variables)
    const variableRefusal = (variable: string): string => {
      const one = new RegExp(
        `ReadEnvStr \\$R5 "${variable}"\\s+Call theDataPlaceIsInTheFolder\\s+\\$\\{If\\} \\$R0 == "yes"\\s+StrCpy \\$0 "([^"]+)"\\s+Return\\s+\\$\\{EndIf\\}`,
      ).exec(place)
      expect(one, `the function refuses a place in a folder ${variable} names`).not.toBeNull()
      return String(one?.[1])
    }
    for (const variable of THE_TEMPORARY_FOLDER_VARIABLES) {
      const sentence = variableRefusal(variable)
      expect(sentence).toContain('temporary folder')
      expect(sentence).toContain('$R5')
      expect(sentence).toContain('Windows deletes files there')
      expect(sentence).not.toContain('$PROFILE')
    }
    const variableAts = variables.map((variable) => place.indexOf(`ReadEnvStr $R5 "${variable}"`))

    // theDataPlaceIsInTheFolder asks theDriveComesFirst whether the value is a full path, takes the
    // backslashes off, asks theFolderIsInside with the written name, then asks again with the long name,
    // with that name's backslashes off too, only when Windows knows it.
    const inFolder = fn('theDataPlaceIsInTheFolder')
    expect(inFolder).toContain('StrCpy $R0 "no"')
    expect(inFolder.indexOf('StrCpy $R9 $R5'), 'the value is put in $R9 for the question').toBeGreaterThan(-1)
    const askedDrive = inFolder.indexOf('Call theDriveComesFirst')
    expect(askedDrive, 'the function asks whether the value begins with a drive letter').toBeGreaterThan(-1)
    expect(inFolder.indexOf('StrCpy $R9 $R5')).toBeLessThan(askedDrive)
    const notFullPath = inFolder.indexOf('${If} $R8 != "yes"', askedDrive)
    expect(notFullPath, 'the function returns when the question did not answer "yes"').toBeGreaterThan(askedDrive)
    expect(inFolder.slice(notFullPath, inFolder.indexOf('${EndIf}', notFullPath))).toContain('Return')
    expect(notFullPath).toBeLessThan(inFolder.indexOf('Call theBackslashesOff'))
    expect(inFolder.match(/Call theBackslashesOff/g)).toHaveLength(2)
    expect(words(inFolder)).toContain(
      words('StrCpy $R9 $R5 Call theDriveComesFirst ${If} $R8 != "yes" Return ${EndIf} Call theBackslashesOff StrCpy $R1 $R9 StrCpy $R2 $theDataFolder Call theFolderIsInside'),
    )
    const longNameAt = inFolder.indexOf("System::Call 'kernel32::GetLongPathName(t R5, t .R6, i ${NSIS_MAX_STRLEN}) i .R7'")
    expect(longNameAt, 'the function asks Windows for the long name').toBeGreaterThan(-1)
    const answered = inFolder.indexOf('${If} $R7 > 0', longNameAt)
    expect(answered, 'the long name is asked for only when the call answered more than 0').toBeGreaterThan(longNameAt)
    expect(inFolder.match(/Call theFolderIsInside/g)).toHaveLength(2)
    expect(inFolder.indexOf('Call theFolderIsInside')).toBeLessThan(longNameAt)
    expect(inFolder.indexOf('Call theFolderIsInside', answered)).toBeGreaterThan(answered)
    expect(words(inFolder.slice(answered))).toContain(
      words('StrCpy $R9 $R6 Call theBackslashesOff StrCpy $R1 $R9 StrCpy $R2 $theDataFolder Call theFolderIsInside'),
    )

    // A folder that holds files is taken only when it holds the office's database.
    const held = words(place).indexOf(words('${DirState} "$theDataFolder" $R9 ${If} $R9 == 1 ${IfNot} ${FileExists} "$theDataFolder\\${THE_DATABASE}" StrCpy $0 "'))
    expect(held, 'the function refuses a place that holds other files').toBeGreaterThan(-1)
    // In order: the default, the full path, the variables, the per-user folder, the files it holds.
    expect(place.indexOf('Return')).toBeLessThan(drive!.index)
    expect(drive!.index).toBeLessThan(variableAts[0]!)
    expect([...variableAts].sort((one, other) => one - other)).toEqual(variableAts)
    expect(variableAts[variableAts.length - 1]!).toBeLessThan(settings!.at)
    expect(settings!.at).toBeLessThan(place.indexOf('${DirState}'))
  })

  it('keeps the data page open on a place it refuses, and checks the install folder against the place too', () => {
    const data = /^Page custom (\S+) (\S+)$/m.exec(CODE)
    expect(words(fn(String(data?.[2])))).toBe(words([
      'Function theDataPageLeave',
      '${NSD_GetText} $theDataBox $theDataFolder',
      'Call theDataPlaceIsRefused',
      '${If} $0 == ""',
      'Call theFolderIsRefused',
      '${EndIf}',
      '${If} $0 != ""',
      'MessageBox MB_OK|MB_ICONEXCLAMATION "$0"',
      'Abort',
      '${EndIf}',
    ].join(' ')))
  })

  it("checks a first install's place before the install folder and the stop, and refuses /DATA= on any other install", () => {
    const install = section('-install')
    expect(words(install)).toContain(words([
      'Call theFirstInstallHere',
      '${If} $theFirstInstall == "yes"',
      'Call theDataPlaceIsRefused',
      '${If} $0 != ""',
      '!insertmacro theRefusal "$0 Nothing was changed."',
      '${EndIf}',
      '${ElseIf} $theDataPlaceGiven == "yes"',
      '!insertmacro theRefusal "',
    ].join(' ')))
    expect(install.indexOf('Call theFirstInstallHere')).toBeLessThan(install.indexOf('Call theDataPlaceIsRefused'))
    expect(install.indexOf('Call theDataPlaceIsRefused')).toBeLessThan(install.indexOf('Call theFolderIsRefused'))
    expect(install.indexOf('Call theFolderIsRefused')).toBeLessThan(install.indexOf('Call theStop'))
    const refusal = /\$\{ElseIf\} \$theDataPlaceGiven == "yes"\s+!insertmacro theRefusal "([^"]+)"/.exec(install)
    expect(refusal, 'an install that is not the first refuses /DATA=').not.toBeNull()
    expect(String(refusal?.[1])).toContain('/DATA=')
    expect(String(refusal?.[1])).toContain('Nothing was changed.')
    expect(String(refusal?.[1])).toContain(`Settings, then ${theKeptPlace}`)
  })

  it("writes a place other than the default with the office's own command once the files are checked, and removes what was unpacked when it refuses", () => {
    const install = section('-install')
    const look = install.indexOf('${IfNot} ${FileExists} "$INSTDIR\\${THE_WINDOW_EXE}"')
    expect(look).toBeGreaterThan(install.indexOf('Nsis7z::Extract'))
    const chosen = install.indexOf('data-folder choose "$theDataFolder"')
    expect(chosen, 'the install section writes the place with the office command').toBeGreaterThan(install.indexOf('${EndIf}', look))
    expect(chosen).toBeLessThan(install.indexOf('WriteUninstaller'))
    expect(words(install)).toContain(words([
      '${If} $theFirstInstall == "yes"',
      `\${AndIf} $theDataFolder != "${theDefault}"`,
      'SetOutPath "$INSTDIR\\${THE_OFFICE}"',
      'nsExec::ExecToStack /TIMEOUT=${THE_ASKING_WAIT_MS} `"$INSTDIR\\${THE_NODE}" "$INSTDIR\\${THE_COMMAND}" data-folder choose "$theDataFolder"`',
      'Pop $1',
      'Pop $2',
      'SetOutPath "$TEMP"',
      '${If} $1 != 0',
      'RMDir /r "$INSTDIR"',
      '!insertmacro theRefusal "',
    ].join(' ')))
    const refusal = /RMDir \/r "\$INSTDIR"\s+!insertmacro theRefusal "([^"]+)"\s+\$\{EndIf\}\s+DetailPrint/.exec(install)
    expect(refusal, "the refusal follows the removal").not.toBeNull()
    expect(String(refusal?.[1])).toContain('It said: $2')
    expect(CODE).toMatch(/^!define THE_ASKING_WAIT_MS \d+$/m)
  })

  it('asks the installed office where its data is only when the folder holds this product, its Node and its command, and says when it took the default', () => {
    const inUse = words(fn('theDataFolderInUse'))
    expect(inUse).toMatch(new RegExp('^' + words([
      'Function theDataFolderInUse',
      'Call theFirstInstallHere',
      '${If} $theFirstInstall == "yes"',
      'Return',
      '${EndIf}',
      `StrCpy $theDataFolder "${theDefault}"`,
      'StrCpy $theDataFolderIsAssumed "',
    ].join(' ')).replace(/[$^{}()|[\]\\.*+?]/g, (character) => `\\${character}`)))
    expect(inUse).toContain(words([
      '${If} ${FileExists} "$INSTDIR\\${THE_UNINSTALLER}"',
      '${AndIf} ${FileExists} "$INSTDIR\\${THE_NODE}"',
      '${AndIf} ${FileExists} "$INSTDIR\\${THE_COMMAND}"',
      'SetOutPath "$INSTDIR\\${THE_OFFICE}"',
      'nsExec::ExecToStack /TIMEOUT=${THE_ASKING_WAIT_MS} `"$INSTDIR\\${THE_NODE}" "$INSTDIR\\${THE_COMMAND}" data-folder where`',
      'Pop $1',
      'Pop $2',
      'SetOutPath "$TEMP"',
    ].join(' ')))
    // The answer is taken only when the command ended with 0 and its first line begins with a drive
    // letter, which theDriveComesFirst answers.
    expect(inUse).toContain(words('StrCpy $R9 $2 $R0 Call theBackslashesOff Call theDriveComesFirst ${If} $1 == 0 ${AndIf} $R8 == "yes" StrCpy $theDataFolder $R9 StrCpy $theDataFolderIsAssumed "" ${Else} StrCpy $theDataFolderIsAssumed "'))
    // These are the only two questions the installer asks the office, besides the stop.
    expect(CODE.match(/data-folder \w+/g)).toEqual(['data-folder where', 'data-folder choose'])
  })
})

describe("11. the office map's part", () => {
  const words = (text: string): string => text.trim().replace(/\s+/g, ' ')
  /** The office map's part, from its Section line to its SectionEnd. */
  const theMapsPart = (): string => {
    const start = CODE.search(/^Section \/o "Office map" /m)
    expect(start, 'the script has no unticked Section "Office map"').toBeGreaterThan(-1)
    return CODE.slice(start, CODE.indexOf('SectionEnd', start))
  }

  it('is the one part the components page lists, unticked on a first install, with words that say what the map is and where it is switched on', () => {
    // Every other section's name starts with "-", which keeps it off the components page; the uninstaller's is its own.
    const named = [...CODE.matchAll(/^Section (?:\/o )?"([^"]+)"/gm)].map((found) => String(found[1]))
    expect(named.filter((name) => !name.startsWith('-')), 'the components page lists a part other than the office map').toEqual(['Office map', 'Uninstall'])
    expect(CODE.match(/^Section \/o "Office map" theMapPart$/gm), 'the office map is not one part, unticked until the installer ticks it').toHaveLength(1)
    const data = /^Page custom /m.exec(CODE)
    const components = /^Page components theMapIsThere$/m.exec(CODE)
    const instfiles = /^Page instfiles$/m.exec(CODE)
    expect(components, 'the script has no components page that decides with theMapIsThere').not.toBeNull()
    expect(data!.index, 'the components page comes before the data page').toBeLessThan(components!.index)
    expect(components!.index, 'the components page comes after the install files page').toBeLessThan(instfiles!.index)
    // A folder without the map leaves the part unticked. .onInit asks too, because a silent install shows no page.
    expect(words(fn('theMapIsThere')), 'theMapIsThere unticks the part when the folder does not hold the map').toBe(words(`
      Function theMapIsThere
        \${If} $theMapDecidedFor == $INSTDIR
          Return
        \${EndIf}
        StrCpy $theMapDecidedFor $INSTDIR
        \${If} \${FileExists} "$INSTDIR\\\${THE_MAP}\\*.*"
          !insertmacro SelectSection \${theMapPart}
        \${Else}
          !insertmacro UnselectSection \${theMapPart}
        \${EndIf}
    `))
    expect(words(fn('.onInit')), '.onInit does not decide whether the office map is ticked').toMatch(/ Call theMapIsThere$/)
    const text = /^ComponentText "([^"]+)" "" "([^"]+)"$/m.exec(CODE)
    expect(text, 'the components page has no words of its own').not.toBeNull()
    expect(String(text?.[1]), 'the words do not say the map changes nothing').toContain(' changes nothing.')
    const place = `open ${en['nav.settings']}, then ${en['settingsCats.cat.tools']}, then ${en['settingsPanel.title.plugins']}.`
    expect(String(text?.[1]), 'the words do not name the place the Settings page draws').toMatch(new RegExp(`It is off until it is switched on: ${place.replace(/\./g, '\\.')}$`))
    expect(String(text?.[2])).toBe('Tick it to install the office map. Unticked, a map installed before is removed.')
  })

  it('is ticked when the folder holds the map, puts the map where the office reads its plugins, and leaves an unticked map removed by the update', () => {
    // THE_MAP is the office's plugins folder in the installed folder, then the map's id.
    const id = String((JSON.parse(read('plugins/office-map/plugin.json')) as { id: unknown }).id)
    expect(theMapFacts('staged'), 'the map does not go where the office reads its plugins').toEqual({
      THE_MAP: [theInstallerFacts()['THE_OFFICE'], ...relative(REPO, THE_PLUGINS_FOLDER).split(sep), id].join('\\'),
      THE_MAP_FILES: 'staged',
    })
    expect(words(fn('theMapIsThere')), 'the part is not ticked when the map is in the folder').toContain(
      words('${If} ${FileExists} "$INSTDIR\\${THE_MAP}\\*.*" !insertmacro SelectSection ${theMapPart}'),
    )
    // Ticked, the part writes the staged files into THE_MAP and nothing else.
    expect(words(theMapsPart()), 'the map part writes somewhere other than the map folder').toBe(
      words('Section /o "Office map" theMapPart SetOutPath "$INSTDIR\\${THE_MAP}" File /r "${THE_MAP_FILES}/*"'),
    )
    // Unticked, nothing writes it, and an update has already removed the folder whole, with any map in it.
    const install = words(section('-install'))
    const removal = install.indexOf('${If} ${FileExists} "$INSTDIR\\${THE_UNINSTALLER}" SetOutPath "$TEMP" RMDir /r "$INSTDIR" ${EndIf}')
    expect(removal, 'an update does not remove the folder whole').toBeGreaterThan(-1)
    expect(removal, 'an update removes the folder after it unpacks into it').toBeLessThan(install.indexOf('Nsis7z::Extract'))
    const office = CODE.indexOf('Section "-install"')
    const map = CODE.search(/^Section \/o "Office map" /m)
    const window = CODE.indexOf('Section "-the window"')
    expect(office, 'the map is written before the office').toBeLessThan(map)
    expect(map, 'the window is opened before the map is written').toBeLessThan(window)
    expect(section('Uninstall'), 'the uninstaller does not remove the folder, and the map is left').toContain('RMDir /r "$INSTDIR"')
  })
})
