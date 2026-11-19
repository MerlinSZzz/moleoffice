// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PACKED APP CARRIES WHAT IT SHOULD, READ BACK FROM WHAT WAS PACKED (wave 13t, round 15;
 * scripts/the-packed-app.mjs, which scripts/package-linux.mjs asks after it makes the installers).
 *
 *   1. Electron's fuses are read from a binary's own bytes (scripts/electron-fuses.mjs). A wire with a
 *      removed fuse, a byte that is none of the three, or no wire at all is said and never guessed. The
 *      copy the container test drives differs from the shipped binary only in the inspector's byte.
 *   2. A file is read from a real asar archive (tests/fixtures/an-invented-app.asar, made with
 *      @electron/asar 3), at the top and in a folder; a file it does not hold is said.
 *   3. An unpacked app with the fuses set, the version, LICENSE, NOTICE, the third-party notices and
 *      Electron's licences has nothing wrong; take any one away, or turn the inspector fuse back on,
 *      and that one thing is named.
 *      The Linux installers have RunAsNode on, so a binary with it off is named; the Windows and Mac
 *      installers are read against their own set, with it off.
 *   4. THE REAL PACKED APP, when MOLE_OFFICE_PACKED_APP names the folder package-linux.mjs wrote: its
 *      fuses, its version in app.asar and in the .deb (where Debian writes the beta's hyphen as a tilde),
 *      the .deb's menu entry and icon (round W30), the class its window carries (round W31), its
 *      licences, and no developer CLAUDE.md or AGENTS.md anywhere in it. Making installers
 *      needs a network and minutes, so this case runs only when one was made; the round's report says
 *      which build it read.
 *   4b. (round 16) An AppImage's runtime is read to its end from its ELF header, and the check says when
 *      it loads libfuse.so.2 from the machine; a library named after the runtime, in the app, does not
 *      count. Case 4 reads the real AppImage's runtime too.
 *   5. Electron's stock binary in node_modules reads as Electron documents its defaults. npm ci does not
 *      fetch that binary, and git ignores node_modules, so a fresh checkout has none until
 *      node node_modules/electron/install.js runs. Then this case skips, and prints the sentence from
 *      tests/the-window-display.ts that names the step, as the window test does (round 15b).
 *   6. (round W30) The .deb's menu entry and its icon are read from the package's own file list and files,
 *      in .debs made here with dpkg-deb. The icon the entry names must be in a folder the icon theme
 *      lists, at that folder's size, or the menu and the dock draw a generic icon, as they did for the
 *      first beta's .deb: its only icon was in hicolor/477x477, and was 477 by 406 pixels.
 *   7. (round W31) The class the packed app's window carries is read from the app.asar the .deb
 *      installs, and the .deb's menu entry must name it: by its StartupWMClass when it has one, by its
 *      own file name when it has none. A dock matches a window to a menu entry by that class.
 *   8. Electron's languages: the packed app's locales folder holds a file for each of THE_LANGUAGES_CARRIED,
 *      which carries each language the page speaks, and no other file. The Windows, Linux and Mac
 *      configurations all ask electron-builder for that list, the Mac with the names of its .lproj folders.
 *   9. The window's own words are in the system's first language (theSystemsLanguage in
 *      src/config/the-self-check-words.mjs), read from app.getPreferredSystemLanguages() in src/desktop/main.mjs, so
 *      the locale files the app carries do not decide them: a zh-TW system gets Chinese, a French system that lists
 *      Chinese second gets English, and a system that lists none gets English.
 *      A window started with a --lang switch takes the language the switch names first, as it did when it read
 *      app.getLocale(): the older window tests start it with --lang=zh-CN and expect Chinese.
 *
 * Three-run proofs: node tools/run-named-tests.mjs tests/the-packed-app-carries-what-it-should.test.ts
 * MUTATIONS:
 *   - FUSE_ORDER swaps NodeOptions and NodeCliInspect: red, cases 1, 3 and 5;
 *   - readTheFuses reads 'r' as off: red, case 1;
 *   - anInspectableCopy also turns RunAsNode on: red, case 1;
 *   - aFileInTheAsar leaves out the 8 bytes before the header: red, cases 2 and 3;
 *   - whatThePackedAppGetsWrong does not compare LICENSE with the checkout's: red, case 3;
 *   - THE_FUSES_SET leaves out the inspector: red, case 3;
 *   - (round 16) theAppImageRuntime reads the whole front it is given rather than the runtime's length:
 *     red, case 4b;
 *   - (round 16) whatThePackedAppGetsWrong does not read the AppImage: red, case 4b;
 *   - (round 15b) case 5 reads the binary without asking electronsBinary first: red on a fresh
 *     checkout, ENOENT;
 *   - (round W30) whatTheDebsIconGetsWrong takes any square folder as one the icon theme lists: red, case 6;
 *   - (round W30) whatTheDebsIconGetsWrong does not compare the icon's pixels with its folder: red, case 6;
 *   - (round W30) whatThePackedAppGetsWrong does not read the .deb's icon: red, case 6.
 *   - (round W31) theClassOfTheWindow keeps the .desktop of desktopName: red, case 7;
 *   - (round W31) whatTheDebsWindowClassGetsWrong compares StartupWMClass with nothing when the entry has one: red, case 7;
 *   - (round W31) whatThePackedAppGetsWrong does not read the class of the .deb's window: red, case 7.
 *   - whatTheLocalesGetWrong takes a locales folder that holds a file of another language: red, case 8;
 *   - THE_LANGUAGES_CARRIED leaves out Spanish for Latin America: red, case 8;
 *   - theMacsLanguages names the Mac's folders with -: red, case 8.
 *   - theSystemsLanguage reads the system's last language: red, case 9, a zh-TW system that lists English second gets English;
 *   - src/desktop/main.mjs reads the window's language from app.getLocale() again: red, case 9.
 *   - src/desktop/main.mjs ignores --lang and reads the system's list alone: red, case 9, and under the window list the
 *     three cases that start the window with --lang=zh-CN;
 *   - src/desktop/main.mjs reads app.getLocale() when no --lang is given: red, case 9.
 */

import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import { developmentMaterialIn } from '../scripts/no-development-material.mjs'
import { FUSE_ORDER, anInspectableCopy, readTheFuses } from '../scripts/electron-fuses.mjs'
import { theMacBuilderConfig, theMacsLanguages, writeAPng } from '../scripts/the-mac-build.mjs'
import { theWindowsBuilderConfig } from '../scripts/the-windows-build.mjs'
import { theSystemsLanguage } from '../src/config/the-self-check-words.mjs'
import { LANGUAGES } from '../src/shared/i18n.ts'
import {
  THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC,
  THE_LANGUAGES_CARRIED,
  aFileInTheAsar,
  theAppImageRuntime,
  theDebianVersion,
  whatTheDebsIconGetsWrong,
  whatTheDebsWindowClassGetsWrong,
  whatTheLocalesGetWrong,
  whatThePackedAppGetsWrong,
} from '../scripts/the-packed-app.mjs'
import { THE_NOTICES_FILE } from '../scripts/third-party-notices.mjs'
import { TEST_DATABASE_PREFIX } from './helpers.ts'
import { electronsBinary } from './the-window-display.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'
const folders: string[] = []
const aFolder = (name: string): string => {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}${name}-`)
  folders.push(dir)
  return dir
}
/** An invented binary: some bytes, the sentinel, version 1, the wire's length, the wire, more bytes. */
const aBinary = (wire: string): Buffer => Buffer.concat([Buffer.from('ELF invented bytes '), Buffer.from(SENTINEL), Buffer.from([1, wire.length]), Buffer.from(wire, 'latin1'), Buffer.from(' more bytes')])

/** The wire a Linux installer is made with: RunAsNode on, NodeOptions and the inspector off, the asar fuses on. */
const THE_WIRE = '100011011'

/** The wire the Windows and Mac installers are made with: the same, with RunAsNode off. */
const THE_WIRE_FOR_WINDOWS_AND_THE_MAC = '000011011'

/** AN INVENTED .deb: a control file and the files given, packed by dpkg-deb as electron-builder packs one. */
const aDeb = (name: string, files: Record<string, Buffer | string>): string => {
  const folder = aFolder(`deb-${name}`)
  const root = join(folder, 'root')
  for (const [path, bytes] of Object.entries({ 'DEBIAN/control': '', ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), bytes)
  }
  writeFileSync(join(root, 'DEBIAN', 'control'), ['Package: mole-office', 'Version: 9.9.9~test.1', 'Architecture: amd64', 'Maintainer: An invented maintainer', 'Description: An invented package for a test', ''].join('\n'))
  // mkdtemp makes a folder only its owner may read, and dpkg-deb refuses a DEBIAN folder like that.
  for (const made of [root, join(root, 'DEBIAN')]) chmodSync(made, 0o755)
  const deb = join(folder, `${name}.deb`)
  execFileSync('dpkg-deb', ['--build', '--root-owner-group', root, deb], { stdio: 'pipe' })
  return deb
}
const aPng = (width: number, height: number): Buffer => writeAPng({ width, height, rgba: Buffer.alloc(width * height * 4) })

/** Electron's locale files in an invented unpacked app, one for each of THE_LANGUAGES_CARRIED. */
const theLocalesInto = (unpacked: string): void => {
  mkdirSync(join(unpacked, 'locales'))
  for (const language of THE_LANGUAGES_CARRIED) writeFileSync(join(unpacked, 'locales', `${language}.pak`), 'Invented words.\n')
}

/**
 * AN INVENTED asar ARCHIVE of the files given, at its top, laid out as @electron/asar lays one out: four
 * bytes, the header's size, the header's own size and the JSON's, the JSON padded to four bytes, then the
 * files one after another.
 */
const anAsar = (files: Record<string, string>): Buffer => {
  let offset = 0
  const tree: Record<string, { offset: string; size: number }> = {}
  for (const [name, text] of Object.entries(files)) {
    tree[name] = { offset: String(offset), size: Buffer.byteLength(text) }
    offset += Buffer.byteLength(text)
  }
  const json = Buffer.from(JSON.stringify({ files: tree }))
  const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4)])
  const sizes = Buffer.alloc(16)
  sizes.writeUInt32LE(4, 0)
  sizes.writeUInt32LE(8 + padded.length, 4)
  sizes.writeUInt32LE(4 + padded.length, 8)
  sizes.writeUInt32LE(json.length, 12)
  return Buffer.concat([sizes, padded, ...Object.values(files).map((text) => Buffer.from(text))])
}

/** Where electron-builder's .deb installs the app's archive, and the package.json it writes there today. */
const THE_DEBS_APP = 'opt/mole-office/resources/app.asar'
const todaysApp = (): Buffer => anAsar({ 'package.json': JSON.stringify({ name: 'mole-office', productName: 'mole-office', desktopName: 'mole-office.desktop', version: '9.9.9-test.1', main: 'main.cjs' }) })

const STOCK = electronsBinary()
// Printed, so the skip and its reason are in the run's log and not only in a count of skipped tests.
if ('missing' in STOCK) console.log(`the-packed-app-carries-what-it-should: case 5 skipped. ${STOCK.missing}`)

afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

describe('the packed app', () => {
  it("reads Electron's fuses from a binary's bytes, and says what it cannot read", () => {
    expect(FUSE_ORDER).toHaveLength(9)
    expect(readTheFuses(aBinary('r01'))).toEqual({ RunAsNode: 'removed', EnableCookieEncryption: 'off', EnableNodeOptionsEnvironmentVariable: 'on' })
    expect(() => readTheFuses(aBinary('0x1'))).toThrow('The binary\'s fuse EnableCookieEncryption reads "x", which is none of on, off or removed.')
    expect(() => readTheFuses(Buffer.from('no wire here'))).toThrow('The binary carries no fuse wire.')
    expect(() => readTheFuses(Buffer.concat([aBinary('0'), aBinary('1')]))).toThrow('The binary carries more than one fuse wire.')
    // The container test's driven copy: only the inspector byte differs from the shipped binary.
    const shipped = aBinary(THE_WIRE)
    const driven = anInspectableCopy(shipped)
    expect(readTheFuses(driven)).toEqual({ ...readTheFuses(shipped), EnableNodeCliInspectArguments: 'on' })
    expect([...driven.keys()].filter((i) => driven[i] !== shipped[i])).toHaveLength(1)
    // A binary with RunAsNode off keeps it off in its driven copy.
    const off = aBinary(THE_WIRE_FOR_WINDOWS_AND_THE_MAC)
    expect(readTheFuses(anInspectableCopy(off)), 'the driven copy changes more than the inspector fuse').toEqual({ ...readTheFuses(off), EnableNodeCliInspectArguments: 'on' })
    expect(() => anInspectableCopy(aBinary('000r11011'))).toThrow("The binary's inspector fuse was removed, so no copy can turn it on.")
  })

  it('reads a file from a real asar archive, and says when it holds none', () => {
    const archive = readFileSync(join(REPO, 'tests', 'fixtures', 'an-invented-app.asar'))
    expect(JSON.parse(aFileInTheAsar(archive, 'package.json'))).toEqual({ name: 'an-invented-app', version: '9.9.9-test.1', main: 'main.cjs' })
    expect(aFileInTheAsar(archive, 'sub/words.txt')).toBe('Invented words in a folder.\n')
    expect(() => aFileInTheAsar(archive, 'nothing.json')).toThrow('The archive holds no file nothing.json.')
    expect(theDebianVersion('0.1.0-beta.1')).toBe('0.1.0~beta.1')
  })

  it('finds nothing wrong in an unpacked app that carries everything, and names each thing taken away', () => {
    const unpacked = aFolder('packed-app')
    const office = join(unpacked, 'resources', 'office')
    mkdirSync(office, { recursive: true })
    writeFileSync(join(unpacked, 'mole-office'), aBinary(THE_WIRE))
    copyFileSync(join(REPO, 'tests', 'fixtures', 'an-invented-app.asar'), join(unpacked, 'resources', 'app.asar'))
    for (const name of ['LICENSE', 'NOTICE']) copyFileSync(join(REPO, name), join(office, name))
    writeFileSync(join(office, THE_NOTICES_FILE), 'Invented notices.\n')
    for (const name of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) writeFileSync(join(unpacked, name), 'Invented licence.\n')
    theLocalesInto(unpacked)
    const check = (): string[] => whatThePackedAppGetsWrong({ unpacked, root: REPO, version: '9.9.9-test.1' })
    expect(check()).toEqual([])

    expect(whatThePackedAppGetsWrong({ unpacked, root: REPO, version: '0.1.0-beta.1' })).toEqual([
      "The packed app's package.json says version 9.9.9-test.1, not 0.1.0-beta.1.",
    ])
    writeFileSync(join(unpacked, 'mole-office'), aBinary('100111011'))
    expect(check()).toEqual(['The fuse EnableNodeCliInspectArguments is on in the packed binary, not off.'])
    writeFileSync(join(unpacked, 'mole-office'), aBinary(THE_WIRE_FOR_WINDOWS_AND_THE_MAC))
    expect(check()).toEqual(['The fuse RunAsNode is off in the packed binary, not on.'])
    expect(whatThePackedAppGetsWrong({ unpacked, root: REPO, version: '9.9.9-test.1', fuses: THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC })).toEqual([])
    writeFileSync(join(unpacked, 'mole-office'), aBinary(THE_WIRE))
    writeFileSync(join(office, 'LICENSE'), 'Another licence.\n')
    expect(check()).toEqual(["The packed office's LICENSE is not the checkout's."])
    rmSync(join(office, 'LICENSE'))
    rmSync(join(office, THE_NOTICES_FILE))
    rmSync(join(unpacked, 'LICENSES.chromium.html'))
    expect(check()).toEqual([
      'The packed office carries no LICENSE.',
      `The packed office carries no ${THE_NOTICES_FILE}.`,
      "The packed app carries no LICENSES.chromium.html, Electron's and Chromium's licences.",
    ])
  })

  it("reads an AppImage's runtime to its end, and says whether it loads libfuse.so.2 from the machine", () => {
    // AN INVENTED RUNTIME: an ELF header whose section headers end at byte 4096, then the squashfs. Only
    // the runtime's own bytes count, so the library named after them, in the app, does not.
    const anAppImage = (inTheRuntime: string, after = ''): Buffer => {
      const runtime = Buffer.alloc(4096)
      runtime.write('\x7fELF', 0, 'latin1')
      runtime[4] = 2
      runtime[5] = 1
      runtime.writeBigUInt64LE(4096n - 3n * 64n, 0x28)
      runtime.writeUInt16LE(64, 0x3a)
      runtime.writeUInt16LE(3, 0x3c)
      runtime.write(inTheRuntime, 200, 'latin1')
      return Buffer.concat([runtime, Buffer.from(`hsqs squashfs ${after}`)])
    }
    expect(theAppImageRuntime(anAppImage('fusermount'))).toEqual({ length: 4096, needsLibfuse: false })
    expect(theAppImageRuntime(anAppImage('dlopen libfuse.so.2'))).toEqual({ length: 4096, needsLibfuse: true })
    expect(theAppImageRuntime(anAppImage('fusermount', 'libfuse.so.2'))).toEqual({ length: 4096, needsLibfuse: false })
    expect(theAppImageRuntime(Buffer.from('#!/bin/sh\n'.padEnd(80)))).toEqual({ unreadable: 'it does not start with an ELF header' })
    const short = anAppImage('fusermount').subarray(0, 1000)
    expect(theAppImageRuntime(short)).toEqual({ unreadable: 'its runtime says it is 4096 bytes long, more than the 1000 read' })

    // AND IN THE CHECK OF THE PACKED APP: the same invented app as above, with each AppImage beside it.
    const unpacked = aFolder('packed-app-appimage')
    const office = join(unpacked, 'resources', 'office')
    mkdirSync(office, { recursive: true })
    writeFileSync(join(unpacked, 'mole-office'), aBinary(THE_WIRE))
    copyFileSync(join(REPO, 'tests', 'fixtures', 'an-invented-app.asar'), join(unpacked, 'resources', 'app.asar'))
    for (const name of ['LICENSE', 'NOTICE']) copyFileSync(join(REPO, name), join(office, name))
    writeFileSync(join(office, THE_NOTICES_FILE), 'Invented notices.\n')
    for (const name of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) writeFileSync(join(unpacked, name), 'Invented licence.\n')
    theLocalesInto(unpacked)
    const appImage = join(unpacked, 'invented.AppImage')
    const check = (): string[] => whatThePackedAppGetsWrong({ unpacked, root: REPO, version: '9.9.9-test.1', appImage })
    writeFileSync(appImage, anAppImage('fusermount'))
    expect(check()).toEqual([])
    writeFileSync(appImage, anAppImage('dlopen libfuse.so.2'))
    expect(check()).toEqual(["The AppImage's runtime loads libfuse.so.2 from the machine, so it does not start where that is not installed."])
  })

  it("6. reads the .deb's menu entry and says when its icon is in no folder the icon theme lists, at that folder's size", () => {
    const entry = (icon = 'Icon=mole-office\n'): string => `[Desktop Entry]\nName=Mole Office\nExec=/opt/mole-office/mole-office %U\nType=Application\n${icon}`
    const desktop = 'usr/share/applications/mole-office.desktop'
    const apps = (size: string, name = 'mole-office'): string => `usr/share/icons/hicolor/${size}/apps/${name}.png`
    const generic = "The .deb's menu entry mole-office.desktop names the icon mole-office, and no folder the icon theme lists holds it at that folder's size, so the menu and the dock draw a generic icon."

    // The first beta's .deb, as electron-builder made it from the logo as it is.
    expect(whatTheDebsIconGetsWrong(aDeb('first-beta', { [desktop]: entry(), [apps('477x477')]: aPng(477, 406) }))).toEqual([
      'The .deb puts its icon in hicolor/477x477, a folder the icon theme does not list.',
      "The .deb's icon in hicolor/477x477 is 477 by 406 pixels, not 477 by 477.",
      generic,
    ])
    // The square one carries today's app too, so the check of the packed app below finds its window's class.
    const square = aDeb('square', { [desktop]: entry(), [apps('512x512')]: aPng(512, 512), [THE_DEBS_APP]: todaysApp() })
    expect(whatTheDebsIconGetsWrong(square)).toEqual([])
    expect(whatTheDebsIconGetsWrong(aDeb('not-square', { [desktop]: entry(), [apps('512x512')]: aPng(477, 406) }))).toEqual([
      "The .deb's icon in hicolor/512x512 is 477 by 406 pixels, not 512 by 512.",
      generic,
    ])
    expect(whatTheDebsIconGetsWrong(aDeb('not-a-png', { [desktop]: entry(), [apps('512x512')]: 'Invented words, not a picture.\n' }))).toEqual([
      "The .deb's icon in hicolor/512x512 is not a PNG.",
      generic,
    ])
    // Only the icon the entry names counts.
    expect(whatTheDebsIconGetsWrong(aDeb('another-name', { [desktop]: entry(), [apps('512x512', 'another-name')]: aPng(512, 512) }))).toEqual([generic])
    expect(whatTheDebsIconGetsWrong(aDeb('no-entry', { [apps('512x512')]: aPng(512, 512) }))).toEqual([
      'The .deb carries no menu entry in /usr/share/applications.',
    ])
    // An icon in another group of the entry is not the entry's own.
    expect(whatTheDebsIconGetsWrong(aDeb('no-icon', { [desktop]: `${entry('')}\n[Desktop Action new-window]\nName=New window\nIcon=mole-office\n`, [apps('512x512')]: aPng(512, 512) }))).toEqual([
      "The .deb's menu entry mole-office.desktop names no icon.",
    ])
    // Nothing is left beside the .deb once it has been read.
    expect(readdirSync(dirname(square)).sort()).toEqual(['root', 'square.deb'])

    // AND IN THE CHECK OF THE PACKED APP, with an invented unpacked app that carries everything else.
    const unpacked = aFolder('packed-app-deb')
    const office = join(unpacked, 'resources', 'office')
    mkdirSync(office, { recursive: true })
    writeFileSync(join(unpacked, 'mole-office'), aBinary(THE_WIRE))
    copyFileSync(join(REPO, 'tests', 'fixtures', 'an-invented-app.asar'), join(unpacked, 'resources', 'app.asar'))
    for (const name of ['LICENSE', 'NOTICE']) copyFileSync(join(REPO, name), join(office, name))
    writeFileSync(join(office, THE_NOTICES_FILE), 'Invented notices.\n')
    for (const name of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) writeFileSync(join(unpacked, name), 'Invented licence.\n')
    theLocalesInto(unpacked)
    const check = (deb: string): string[] => whatThePackedAppGetsWrong({ unpacked, root: REPO, version: '9.9.9-test.1', deb })
    expect(check(square)).toEqual([])
    expect(check(aDeb('first-beta-again', { [desktop]: entry(), [apps('477x477')]: aPng(477, 406) }))).toContain(generic)
  }, 60_000)

  it("7. reads the class the packed app's window carries, and says when the .deb's menu entry does not name it", () => {
    const entry = (more = ''): string => `[Desktop Entry]\nName=Mole Office\nExec=/opt/mole-office/mole-office %U\nType=Application\nIcon=mole-office\n${more}`
    const desktop = 'usr/share/applications/mole-office.desktop'
    const icon = 'usr/share/icons/hicolor/512x512/apps/mole-office.png'
    const anApp = (fields: Record<string, string>): Buffer => anAsar({ 'package.json': JSON.stringify({ name: 'mole-office', ...fields, version: '9.9.9-test.1', main: 'main.cjs' }) })
    const notMatched = (said: string, windowClass: string): string =>
      `The .deb's menu entry mole-office.desktop says StartupWMClass=${said}, and the packed app's window carries the class ${windowClass}, so a dock cannot match the window to the entry.`

    // Today's .deb: electron-builder writes StartupWMClass from desktopName, and Electron gives the window
    // desktopName without .desktop as its class.
    const today = aDeb('today', { [desktop]: entry('StartupWMClass=mole-office\n'), [icon]: aPng(512, 512), [THE_DEBS_APP]: todaysApp() })
    expect(whatTheDebsWindowClassGetsWrong(today)).toEqual([])
    // An entry that names the app as a person reads it, not as its window carries it.
    expect(whatTheDebsWindowClassGetsWrong(aDeb('a-persons-name', { [desktop]: entry('StartupWMClass=Mole Office\n'), [THE_DEBS_APP]: todaysApp() }))).toEqual([notMatched('Mole Office', 'mole-office')])
    // desktopName decides, whatever productName says; with no .desktop at its end it is the class as it is.
    expect(whatTheDebsWindowClassGetsWrong(aDeb('another-desktop-name', { [desktop]: entry('StartupWMClass=mole-office\n'), [THE_DEBS_APP]: anApp({ productName: 'mole-office', desktopName: 'mole-office-beta.desktop' }) }))).toEqual([notMatched('mole-office', 'mole-office-beta')])
    expect(whatTheDebsWindowClassGetsWrong(aDeb('no-suffix', { [desktop]: entry('StartupWMClass=mole-office\n'), [THE_DEBS_APP]: anApp({ desktopName: 'mole-office' }) }))).toEqual([])
    // With no StartupWMClass the entry's own name must be the class, and one in another group is not the entry's.
    expect(whatTheDebsWindowClassGetsWrong(aDeb('by-its-name', { [desktop]: entry(), [THE_DEBS_APP]: todaysApp() }))).toEqual([])
    expect(
      whatTheDebsWindowClassGetsWrong(aDeb('another-file', { 'usr/share/applications/another-name.desktop': `${entry()}\n[Desktop Action new-window]\nName=New window\nStartupWMClass=mole-office\n`, [THE_DEBS_APP]: todaysApp() })),
    ).toEqual([
      "The .deb's menu entry another-name.desktop says no StartupWMClass, and its own name is not mole-office, the class the packed app's window carries, so a dock cannot match the window to the entry.",
    ])
    // What cannot be read is said, and never guessed.
    expect(whatTheDebsWindowClassGetsWrong(aDeb('no-desktop-name', { [desktop]: entry('StartupWMClass=mole-office\n'), [THE_DEBS_APP]: anApp({ productName: 'mole-office' }) }))).toEqual([
      "The packed app's package.json says no desktopName, which Electron takes the class of its window from, so the class is not read here.",
    ])
    expect(whatTheDebsWindowClassGetsWrong(aDeb('no-app', { [desktop]: entry('StartupWMClass=mole-office\n') }))).toEqual([
      'The .deb carries no app.asar in /opt, so the class of its window cannot be read.',
    ])
    expect(whatTheDebsWindowClassGetsWrong(aDeb('no-entry', { [THE_DEBS_APP]: todaysApp() }))).toEqual([
      'The .deb carries no menu entry in /usr/share/applications, so no entry names the class of its window.',
    ])
    // Nothing is left beside the .deb once it has been read.
    expect(readdirSync(dirname(today)).sort()).toEqual(['root', 'today.deb'])

    // AND IN THE CHECK OF THE PACKED APP, with an invented unpacked app that carries everything else.
    const unpacked = aFolder('packed-app-class')
    const office = join(unpacked, 'resources', 'office')
    mkdirSync(office, { recursive: true })
    writeFileSync(join(unpacked, 'mole-office'), aBinary(THE_WIRE))
    copyFileSync(join(REPO, 'tests', 'fixtures', 'an-invented-app.asar'), join(unpacked, 'resources', 'app.asar'))
    for (const name of ['LICENSE', 'NOTICE']) copyFileSync(join(REPO, name), join(office, name))
    writeFileSync(join(office, THE_NOTICES_FILE), 'Invented notices.\n')
    for (const name of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) writeFileSync(join(unpacked, name), 'Invented licence.\n')
    theLocalesInto(unpacked)
    const check = (deb: string): string[] => whatThePackedAppGetsWrong({ unpacked, root: REPO, version: '9.9.9-test.1', deb })
    expect(check(today)).toEqual([])
    expect(check(aDeb('a-persons-name-again', { [desktop]: entry('StartupWMClass=Mole Office\n'), [icon]: aPng(512, 512), [THE_DEBS_APP]: todaysApp() }))).toEqual([notMatched('Mole Office', 'mole-office')])
  }, 60_000)

  it("8. carries Electron's languages for each language the page speaks and no other, on every system", () => {
    // Each language the page speaks is carried, by its own name or as the start of a carried one before a -.
    for (const language of Object.keys(LANGUAGES)) {
      expect(THE_LANGUAGES_CARRIED.some((carried) => carried === language || carried.startsWith(`${language}-`)), `the page speaks ${language}, and no carried file of Electron's is in it`).toBe(true)
    }
    expect([...THE_LANGUAGES_CARRIED].sort(), 'the carried languages are not the ten chosen').toEqual(['el', 'en-US', 'es', 'es-419', 'it', 'ko', 'pt-BR', 'pt-PT', 'th', 'zh-CN'])

    const unpacked = aFolder('packed-app-locales')
    theLocalesInto(unpacked)
    expect(whatTheLocalesGetWrong(unpacked)).toEqual([])
    writeFileSync(join(unpacked, 'locales', 'fr.pak'), 'Invented words.\n')
    rmSync(join(unpacked, 'locales', 'es-419.pak'))
    expect(whatTheLocalesGetWrong(unpacked), 'a locales folder with a file missing and another one extra was taken').toEqual([
      "The packed app's locales folder does not hold es-419.pak.",
      "The packed app's locales folder holds fr.pak, which THE_LANGUAGES_CARRIED in scripts/the-packed-app.mjs does not name.",
    ])
    rmSync(join(unpacked, 'locales'), { recursive: true })
    expect(whatTheLocalesGetWrong(unpacked)).toEqual(["The packed app has no locales folder, so it carries none of Electron's languages."])

    // Windows and Linux ask for the list as it is; the Mac asks with the names of its .lproj folders, as zh_CN.
    const windows = theWindowsBuilderConfig({ app: '/a', out: '/o', work: '/w', electronVersion: '44.0.0', electronZip: '/z/electron.zip', script: '/w/i.nsi', icon: '/i.png' })
    expect(windows.electronLanguages, 'the Windows installer asks for other languages').toEqual([...THE_LANGUAGES_CARRIED])
    expect(readFileSync(join(REPO, 'scripts', 'package-linux.mjs'), 'utf8'), 'the Linux installers ask for other languages').toContain('    electronLanguages: [...THE_LANGUAGES_CARRIED],\n')
    const mac = theMacBuilderConfig({ app: '/a', work: '/w', output: '/o', version: '9.9.9-test.1', electron: '44.0.0', electronDist: '/d', identity: null, entitlements: '/e.plist', icon: '/i.icns' })
    expect(mac.electronLanguages, "the Mac asks for languages by names its .lproj folders do not have").toEqual(theMacsLanguages())
    expect(theMacsLanguages(), "the Mac's names are not the carried languages with _ for -").toEqual(['en_US', 'zh_CN', 'el', 'es', 'es_419', 'it', 'ko', 'pt_BR', 'pt_PT', 'th'])
  })

  it("9. gives the window's own words the language --lang names, or else the system's first language, whatever locale files the app carries", () => {
    expect(theSystemsLanguage(['zh-TW', 'en-US']), 'a zh-TW system that lists English second did not get Chinese').toBe('zh')
    expect(theSystemsLanguage(['zh-Hant-HK']), 'a Hong Kong system did not get Chinese').toBe('zh')
    expect(theSystemsLanguage(['fr-FR', 'zh-CN']), 'a French system that lists Chinese second did not get English').toBe('en')
    expect(theSystemsLanguage([]), 'a system that lists no language did not get English').toBe('en')
    const main = readFileSync(join(REPO, 'src', 'desktop', 'main.mjs'), 'utf8')
    expect(main, "the window does not take the language --lang names first, and the system's own languages otherwise").toContain("const theLanguage = () => theSystemsLanguage(app.commandLine.hasSwitch('lang') ? [app.commandLine.getSwitchValue('lang')] : app.getPreferredSystemLanguages())\n")
    expect(main, 'the window still reads the language Electron picked from the carried locale files').not.toMatch(/app\.getLocale\(\)\s*\)/)
  })

  const made = process.env['MOLE_OFFICE_PACKED_APP'] ?? ''
  it.skipIf(made === '')('the real packed app, in MOLE_OFFICE_PACKED_APP, carries what it should and no developer CLAUDE.md', () => {
    const version = (JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { version: string }).version
    const deb = readdirSync(made).find((file) => file === `mole-office-${version}-amd64.deb`)
    expect(deb, readdirSync(made).join(', ')).toBeDefined()
    expect(readdirSync(made)).toContain(`mole-office-${version}-x86_64.AppImage`)
    const unpacked = join(made, 'linux-unpacked')
    const appImage = join(made, `mole-office-${version}-x86_64.AppImage`)
    expect(whatThePackedAppGetsWrong({ unpacked, root: REPO, version, deb: join(made, String(deb)), appImage })).toEqual([])
    expect(developmentMaterialIn({ root: REPO, folder: unpacked })).toEqual([])
  }, 120_000)

  if ('missing' in STOCK) it.skip(`Electron's stock binary reads as Electron documents its defaults: skipped. ${STOCK.missing}`, () => {})
  else {
    const stock = STOCK.path
    it("reads Electron's stock binary as Electron documents its defaults", () => {
      // RunAsNode, NODE_OPTIONS, the inspector, file: privileges and the Wasm trap handlers on; cookie
      // encryption, asar integrity, asar-only and the V8 snapshot off.
      expect(readTheFuses(readFileSync(stock))).toEqual({
        RunAsNode: 'on',
        EnableCookieEncryption: 'off',
        EnableNodeOptionsEnvironmentVariable: 'on',
        EnableNodeCliInspectArguments: 'on',
        EnableEmbeddedAsarIntegrityValidation: 'off',
        OnlyLoadAppFromAsar: 'off',
        LoadBrowserProcessSpecificV8Snapshot: 'off',
        GrantFileProtocolExtraPrivileges: 'on',
        EnableWasmTrapHandlers: 'on',
      })
    })
  }
})
