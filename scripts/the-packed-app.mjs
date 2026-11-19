// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT THE PACKED APP REALLY CARRIES, read back from what electron-builder wrote (wave 13t, round 15).
 * scripts/package-linux.mjs asks this after it has made the installers, and removes them when it names
 * anything wrong, and scripts/package-windows.mjs does the same with its win-unpacked folder (round W13).
 * A setting in the packager's config is a request; this reads the result.
 *
 *   - ELECTRON'S FUSES, from the packed binary itself (the beta plan l1RSxzw-j4P7, item 4), read by
 *     scripts/electron-fuses.mjs.
 *   - THE VERSION, in the app's package.json inside app.asar, which names the installers (the
 *     decision sKPFWjOuQVEe), and in the .deb's control file, where Debian writes the beta's hyphen as a
 *     tilde, so that a beta sorts before the release it leads to.
 *   - THE .deb's MENU ENTRY AND ITS ICON (round W30): the icon the entry names, in a folder the icon
 *     theme lists, at that folder's size.
 *   - THE CLASS OF THE .deb's WINDOW (round W31): the class Electron gives the packed app's window,
 *     read from the app.asar the .deb installs, is the one its menu entry names, so that a dock can
 *     match the window to the entry.
 *   - THE AppImage's RUNTIME, the program in front of its squashfs (round 16): the static runtime, which
 *     asks the machine for no libfuse.so.2, and not the one electron-builder used by default, which does.
 *   - THE LICENCES: Mole Office's own LICENSE and NOTICE and the third-party notices in
 *     resources/office, and Electron's LICENSE.electron.txt and LICENSES.chromium.html beside the binary.
 *   - ELECTRON'S LANGUAGES: the locales folder beside the binary holds a file for each of
 *     THE_LANGUAGES_CARRIED and no other.
 *
 * The developer CLAUDE.md is read by scripts/no-development-material.mjs, which package-linux.mjs asks
 * of the same folder.
 */

import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readTheFuses } from './electron-fuses.mjs'
import { THE_NOTICES_FILE } from './third-party-notices.mjs'

/**
 * The fuses a Linux installer is made with (item 4 of the beta plan). The others stay as
 * Electron ships them.
 *
 * RunAsNode IS ON because a Linux installer carries no Node of its own: the office runs on the app's own
 * program, told to run as Node (`theInstallsNode` in src/config/settings.mjs).
 */
export const THE_FUSES_SET = Object.freeze({
  RunAsNode: 'on',
  EnableNodeOptionsEnvironmentVariable: 'off',
  EnableNodeCliInspectArguments: 'off',
  EnableEmbeddedAsarIntegrityValidation: 'on',
  OnlyLoadAppFromAsar: 'on',
})

/**
 * The fuses the Windows and Mac installers are made with: the Linux installers', with RunAsNode off. Those
 * installers carry a Node of their own (scripts/the-shipped-node.mjs), so nothing needs their app to act as Node.
 */
export const THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC = Object.freeze({ ...THE_FUSES_SET, RunAsNode: 'off' })

/**
 * electron-builder's AppImage toolset that carries AppImage's static runtime, of 8 November 2025. Its
 * default toolset, 0.0.0, carries the runtime that loads libfuse.so.2, which Ubuntu 22.04 and later do
 * not install.
 */
export const THE_APPIMAGE_TOOLSET = '1.0.3'

/** The library the old AppImage runtime asks the machine for. */
const THE_FUSE_LIBRARY = 'libfuse.so.2'

/**
 * THE RUNTIME AT THE FRONT OF AN AppImage: an ELF program whose end is the end of its section headers,
 * where the squashfs starts (this is how AppImage's own tools find the offset). Whether it names
 * libfuse.so.2 says which runtime it is: the old one loads that library from the machine, and the
 * static one carries what it needs. Anything that is not a 64-bit little-endian ELF is said.
 *
 * @param {Buffer} front the AppImage's first bytes; 8 MiB is more than either runtime
 * @returns {{ length: number, needsLibfuse: boolean } | { unreadable: string }}
 */
export function theAppImageRuntime(front) {
  if (front.length < 64 || front.toString('latin1', 0, 4) !== '\x7fELF') return { unreadable: 'it does not start with an ELF header' }
  if (front[4] !== 2 || front[5] !== 1) return { unreadable: 'its runtime is not a 64-bit little-endian ELF program' }
  const length = Number(front.readBigUInt64LE(0x28)) + front.readUInt16LE(0x3a) * front.readUInt16LE(0x3c)
  if (length > front.length) return { unreadable: `its runtime says it is ${String(length)} bytes long, more than the ${String(front.length)} read` }
  return { length, needsLibfuse: front.subarray(0, length).includes(THE_FUSE_LIBRARY) }
}

/**
 * One file's text from an asar archive. The archive starts with a header: four bytes, then the
 * header's size, then the JSON of its file tree, padded; a file's bytes follow the header at the
 * offset the tree gives.
 *
 * @param {Buffer} archive
 * @param {string} path inside the archive, with / between names
 */
export function aFileInTheAsar(archive, path) {
  const headerSize = archive.readUInt32LE(4)
  const jsonSize = archive.readUInt32LE(12)
  const tree = /** @type {{ files?: Record<string, unknown> }} */ (JSON.parse(archive.subarray(16, 16 + jsonSize).toString('utf8')))
  /** @type {unknown} */
  let node = tree
  for (const name of path.split('/')) node = /** @type {{ files?: Record<string, unknown> }} */ (node).files?.[name]
  const file = /** @type {{ offset?: unknown, size?: unknown } | undefined} */ (node)
  if (file === undefined || typeof file.offset !== 'string' || typeof file.size !== 'number') throw new Error(`The archive holds no file ${path}.`)
  const start = 8 + headerSize + Number(file.offset)
  return archive.subarray(start, start + file.size).toString('utf8')
}

/**
 * The version Debian writes for a package version: a hyphen before a pre-release becomes a tilde, so
 * that 0.1.0~beta.1 sorts before 0.1.0, as electron-builder writes it.
 *
 * @param {string} version
 */
export const theDebianVersion = (version) => version.replace('-', '~')

/**
 * ELECTRON'S LANGUAGES AN INSTALLER CARRIES: Chromium's locale files, by their names without .pak. Each file
 * holds Chromium's own words in one language, such as those of a text field's menu, and Electron 44 ships 55.
 * These ten are the page's eight languages (LANGUAGES in src/shared/i18n.ts), with Spanish for Latin America
 * beside Spanish and Portuguese for Portugal beside Portuguese for Brazil. electron-builder 26.15.3 removes
 * every other one (its electronLanguages option, applied by removeUnusedLanguagesIfNeeded in app-builder-lib,
 * electron/ElectronFramework.js). It keeps a file whose name is one asked for, or the start of one before a
 * - or a _.
 */
export const THE_LANGUAGES_CARRIED = Object.freeze(['en-US', 'zh-CN', 'el', 'es', 'es-419', 'it', 'ko', 'pt-BR', 'pt-PT', 'th'])

/**
 * What the packed app's locales folder, beside its binary on Linux and on Windows, gets wrong: each of
 * THE_LANGUAGES_CARRIED it does not hold, and every other file it does.
 *
 * @param {string} unpacked electron-builder's linux-unpacked or win-unpacked folder
 * @returns {string[]}
 */
export function whatTheLocalesGetWrong(unpacked) {
  const folder = join(unpacked, 'locales')
  if (!existsSync(folder)) return [`The packed app has no locales folder, so it carries none of Electron's languages.`]
  const held = readdirSync(folder)
  const wanted = THE_LANGUAGES_CARRIED.map((language) => `${language}.pak`)
  const missing = wanted.filter((file) => !held.includes(file))
  const extra = held.filter((file) => !wanted.includes(file))
  return [
    ...(missing.length === 0 ? [] : [`The packed app's locales folder does not hold ${missing.join(', ')}.`]),
    ...(extra.length === 0 ? [] : [`The packed app's locales folder holds ${extra.join(', ')}, which THE_LANGUAGES_CARRIED in scripts/the-packed-app.mjs does not name.`]),
  ]
}

/**
 * THE SIZES THE ICON THEME LISTS, in pixels. A desktop looks for an app's icon in hicolor/NxN/apps only
 * for these N: the Size of each folder in the index.theme of hicolor-icon-theme 0.17, as Ubuntu 24.04
 * installs it in /usr/share/icons/hicolor. An icon in any other folder is never drawn (round W30).
 */
export const THE_ICON_THEMES_SIZES = Object.freeze([16, 22, 24, 32, 36, 48, 64, 72, 96, 128, 192, 256, 512])

/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * A PNG's size in pixels, from the IHDR chunk that follows its signature, or null when the bytes are not a PNG.
 *
 * @param {Buffer} bytes
 * @returns {{ width: number, height: number } | null}
 */
function thePngsSize(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('latin1', 12, 16) !== 'IHDR') return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/**
 * One key of a menu entry's [Desktop Entry] group, or null when that group has none or leaves it empty. A
 * key in one of the entry's other groups, such as an action's, is not the entry's own.
 *
 * @param {string} text the .desktop file
 * @param {'Icon' | 'StartupWMClass'} key
 */
function theMenuEntrysKey(text, key) {
  let group = ''
  for (const line of text.split(/\r?\n/)) {
    const header = /^\[(.*)\]\s*$/.exec(line)
    if (header !== null) group = header[1] ?? ''
    else if (group === 'Desktop Entry') {
      const found = new RegExp(`^${key}\\s*=\\s*(.*?)\\s*$`).exec(line)
      if (found !== null) return found[1] || null
    }
  }
  return null
}

/** Where a .deb puts a menu entry. */
const A_MENU_ENTRY = /^\.\/usr\/share\/applications\/[^/]+\.desktop$/

/**
 * Every path a .deb installs, from `dpkg-deb --contents`, each written ./usr/…, a link's own path and not
 * its target.
 *
 * @param {string} deb
 */
export function theDebsFiles(deb) {
  return execFileSync('dpkg-deb', ['--contents', deb], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .map((line) => / (\.\/.*?)(?: -> .*)?$/.exec(line)?.[1])
    .filter((path) => path !== undefined)
}

/**
 * Takes only the paths given out of a .deb, into a folder beside it, reads them with `read`, and removes the
 * folder after, whatever `read` did.
 *
 * @template T
 * @param {string} deb
 * @param {string[]} paths as theDebsFiles writes them
 * @param {(folder: string) => T} read
 * @returns {T}
 */
function readFromTheDeb(deb, paths, read) {
  const folder = mkdtempSync(join(dirname(deb), '.deb-'))
  try {
    // Only these files are taken out of the package, through tar, and pipefail says when dpkg-deb failed.
    execFileSync('bash', ['-o', 'pipefail', '-c', 'dpkg-deb --fsys-tarfile "$0" | tar -x -C "$1" -- "${@:2}"', deb, folder, ...paths], { stdio: 'pipe' })
    return read(folder)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

/**
 * EVERYTHING THE .deb's MENU ENTRY AND ITS ICON GET WRONG, one line each, read from the package itself: its
 * file list, from `dpkg-deb --contents`, and the entries and icons on it, taken out into a folder beside the
 * .deb that is removed after. The icon an entry names must be in hicolor/NxN/apps for an N the icon theme
 * lists, and be N by N pixels. Otherwise the menu and the dock draw a generic icon, as they did for the first
 * beta's .deb (round W30). An empty list says the package carries what a desktop needs; whether a desktop
 * draws it is seen only on one.
 *
 * @param {string} deb
 * @returns {string[]}
 */
export function whatTheDebsIconGetsWrong(deb) {
  const files = theDebsFiles(deb)
  const entries = files.filter((path) => A_MENU_ENTRY.test(path))
  if (entries.length === 0) return ['The .deb carries no menu entry in /usr/share/applications.']
  const icons = files.flatMap((path) => {
    const found = /^\.\/usr\/share\/icons\/hicolor\/((\d+)x(\d+))\/apps\/([^/]+)\.png$/.exec(path)
    return found === null ? [] : [{ path, folder: String(found[1]), width: Number(found[2]), height: Number(found[3]), name: String(found[4]) }]
  })
  return readFromTheDeb(deb, [...entries, ...icons.map((icon) => icon.path)], (folder) => {
    /** @type {string[]} */
    const wrong = []
    for (const entry of entries) {
      const said = entry.slice(entry.lastIndexOf('/') + 1)
      const name = theMenuEntrysKey(readFileSync(join(folder, entry), 'utf8'), 'Icon')
      if (name === null) {
        wrong.push(`The .deb's menu entry ${said} names no icon.`)
        continue
      }
      let drawn = false
      for (const icon of icons.filter((one) => one.name === name)) {
        const listed = icon.width === icon.height && THE_ICON_THEMES_SIZES.includes(icon.width)
        if (!listed) wrong.push(`The .deb puts its icon in hicolor/${icon.folder}, a folder the icon theme does not list.`)
        const size = thePngsSize(readFileSync(join(folder, icon.path)))
        if (size === null) wrong.push(`The .deb's icon in hicolor/${icon.folder} is not a PNG.`)
        else if (size.width !== icon.width || size.height !== icon.height) {
          wrong.push(`The .deb's icon in hicolor/${icon.folder} is ${String(size.width)} by ${String(size.height)} pixels, not ${String(icon.width)} by ${String(icon.height)}.`)
        } else if (listed) drawn = true
      }
      if (!drawn) wrong.push(`The .deb's menu entry ${said} names the icon ${name}, and no folder the icon theme lists holds it at that folder's size, so the menu and the dock draw a generic icon.`)
    }
    return wrong
  })
}

/**
 * THE CLASS ELECTRON GIVES THE APP'S WINDOW on Linux, its X11 WM_CLASS, from the app's package.json: its
 * desktopName without a final .desktop, or null when it has no desktopName. Electron 44.5.1 was measured
 * under Xvfb in round W31. desktopName mole-office.desktop gave the class mole-office, and a desktopName
 * with no .desktop gave itself. app.setName and a CHROME_DESKTOP set before the start changed nothing.
 * Without desktopName Electron takes productName and changes it ("Mole Office" gave mole-office), which is
 * not worked out here.
 *
 * @param {{ desktopName?: unknown }} app the app's package.json
 */
export function theClassOfTheWindow(app) {
  return typeof app.desktopName === 'string' && app.desktopName !== '' ? app.desktopName.replace(/\.desktop$/, '') : null
}

/**
 * EVERYTHING THE .deb's MENU ENTRY GETS WRONG ABOUT ITS WINDOW'S CLASS, one line each, read from the package
 * itself. A dock shows a window under the menu entry whose StartupWMClass is the window's class, or, when the
 * entry has no StartupWMClass, whose file name without .desktop is. Otherwise it cannot match the two, and
 * draws the window with an icon of its own. The class is read from the package.json in the app.asar the .deb
 * puts in /opt. An empty list says the package names its window's class; whether a dock shows the icon is
 * seen only on one.
 *
 * @param {string} deb
 * @returns {string[]}
 */
export function whatTheDebsWindowClassGetsWrong(deb) {
  const files = theDebsFiles(deb)
  const entries = files.filter((path) => A_MENU_ENTRY.test(path))
  if (entries.length === 0) return ['The .deb carries no menu entry in /usr/share/applications, so no entry names the class of its window.']
  const archive = files.find((path) => /^\.\/opt\/[^/]+\/resources\/app\.asar$/.test(path))
  if (archive === undefined) return ['The .deb carries no app.asar in /opt, so the class of its window cannot be read.']
  return readFromTheDeb(deb, [...entries, archive], (folder) => {
    const app = /** @type {{ desktopName?: unknown }} */ (JSON.parse(aFileInTheAsar(readFileSync(join(folder, archive)), 'package.json')))
    const windowClass = theClassOfTheWindow(app)
    if (windowClass === null) return ["The packed app's package.json says no desktopName, which Electron takes the class of its window from, so the class is not read here."]
    /** @type {string[]} */
    const wrong = []
    for (const entry of entries) {
      const said = entry.slice(entry.lastIndexOf('/') + 1)
      const named = theMenuEntrysKey(readFileSync(join(folder, entry), 'utf8'), 'StartupWMClass')
      if (named === null) {
        if (said.replace(/\.desktop$/, '') !== windowClass) {
          wrong.push(`The .deb's menu entry ${said} says no StartupWMClass, and its own name is not ${windowClass}, the class the packed app's window carries, so a dock cannot match the window to the entry.`)
        }
      } else if (named !== windowClass) {
        wrong.push(`The .deb's menu entry ${said} says StartupWMClass=${named}, and the packed app's window carries the class ${windowClass}, so a dock cannot match the window to the entry.`)
      }
    }
    return wrong
  })
}

/**
 * Everything the packed app gets wrong, one line each. An empty list means it carries what it should.
 *
 * @param {{ unpacked: string, root: string, version: string, deb?: string, appImage?: string, executable?: string,
 *   fuses?: Readonly<Record<string, string>> }} what
 *   `unpacked` is electron-builder's linux-unpacked or win-unpacked folder; `root` the checkout; `deb` and
 *   `appImage`, when given, the installers made from it; `executable` the binary's name in `unpacked`,
 *   mole-office on Linux and mole-office.exe on Windows
 *   `fuses` is the set the binary must carry: the Linux installers' unless another is given.
 * @returns {string[]}
 */
export function whatThePackedAppGetsWrong({ unpacked, root, version, deb, appImage, executable = 'mole-office', fuses: wantedFuses = THE_FUSES_SET }) {
  /** @type {string[]} */
  const wrong = []
  const fuses = readTheFuses(readFileSync(join(unpacked, executable)))
  for (const [name, wanted] of Object.entries(wantedFuses)) {
    if (fuses[name] !== wanted) wrong.push(`The fuse ${name} is ${fuses[name] ?? 'missing'} in the packed binary, not ${wanted}.`)
  }
  const app = /** @type {{ version?: unknown }} */ (JSON.parse(aFileInTheAsar(readFileSync(join(unpacked, 'resources', 'app.asar')), 'package.json')))
  if (app.version !== version) wrong.push(`The packed app's package.json says version ${String(app.version)}, not ${version}.`)
  if (deb !== undefined) {
    const said = execFileSync('dpkg-deb', ['-f', deb, 'Version'], { encoding: 'utf8' }).trim()
    if (said !== theDebianVersion(version)) wrong.push(`The .deb says version ${said}, not ${theDebianVersion(version)}.`)
    wrong.push(...whatTheDebsIconGetsWrong(deb))
    wrong.push(...whatTheDebsWindowClassGetsWrong(deb))
  }
  if (appImage !== undefined) {
    const front = Buffer.alloc(8 * 1024 * 1024)
    const fd = openSync(appImage, 'r')
    const read = readSync(fd, front, 0, front.length, 0)
    closeSync(fd)
    const runtime = theAppImageRuntime(front.subarray(0, read))
    if ('unreadable' in runtime) wrong.push(`The AppImage's runtime could not be read: ${runtime.unreadable}.`)
    else if (runtime.needsLibfuse) wrong.push(`The AppImage's runtime loads ${THE_FUSE_LIBRARY} from the machine, so it does not start where that is not installed.`)
  }
  const office = join(unpacked, 'resources', 'office')
  for (const name of ['LICENSE', 'NOTICE']) {
    const packed = join(office, name)
    if (!existsSync(packed)) wrong.push(`The packed office carries no ${name}.`)
    else if (!readFileSync(packed).equals(readFileSync(join(root, name)))) wrong.push(`The packed office's ${name} is not the checkout's.`)
  }
  if (!existsSync(join(office, THE_NOTICES_FILE))) wrong.push(`The packed office carries no ${THE_NOTICES_FILE}.`)
  for (const name of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) {
    if (!existsSync(join(unpacked, name))) wrong.push(`The packed app carries no ${name}, Electron's and Chromium's licences.`)
  }
  wrong.push(...whatTheLocalesGetWrong(unpacked))
  return wrong
}
