// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE THIRD-PARTY NOTICES AN INSTALLER CARRIES (the beta guide, question 7; the answer
 * 1QAbsVRtyDU6; wave 13t, round 15). The office is built from other people's packages, and their
 * licences ask that their notices go with it. This writes one plain-text file naming every package
 * that went into what ships, with its version, the licence its package.json names, and every licence
 * or notice file the package itself carries, word for word.
 *
 * Which packages: the ones the build actually read, not the ones package.json lists. esbuild's
 * metafile names every source file of the server, worker, command and window bundles; the page's
 * build writes its own list (THE_PAGES_MODULES in src/config/the-built-page.mjs); better-sqlite3 is
 * copied beside the bundles as it is. A source file under node_modules/<name> belongs to <name>.
 *
 * A package with no licence file of its own is listed with what its package.json says, and the file
 * says plainly that it carried none, rather than writing a licence text it did not carry. Where its
 * licence text was copied by hand from where the package was made (scripts/licence-texts-by-hand.mjs,
 * round 19), that text is carried after a sentence saying where it was copied from.
 *
 * Electron and Chromium, and Node, are not read here: their licences ship as the files they come
 * with, and this file names where.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import { LICENCE_TEXTS_BY_HAND, THE_TEXTS_BY_HAND } from './licence-texts-by-hand.mjs'

/** The file a bundle carries, at its root. */
export const THE_NOTICES_FILE = 'THIRD-PARTY-NOTICES.txt'

/** A licence or notice file, by its name in a package's own folder. */
const A_LICENCE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i

/**
 * The package folders some source paths belong to: for each path under node_modules, the folder of
 * the package it is in (the last node_modules in the path, and a scope when there is one). Paths
 * outside node_modules, and the build's own virtual modules (which start with a NUL), name none.
 *
 * @param {string[]} paths absolute, or relative to `from`
 * @param {string} from
 * @returns {string[]} each folder once, sorted
 */
export function packageFoldersOf(paths, from) {
  const folders = new Set()
  for (const raw of paths) {
    if (raw.startsWith('\0')) continue
    const path = resolve(from, raw.replace(/[?#].*$/, ''))
    const at = path.lastIndexOf(`${sep}node_modules${sep}`)
    if (at === -1) continue
    const inside = path.slice(at + `${sep}node_modules${sep}`.length).split(sep)
    const name = inside[0]?.startsWith('@') ? inside.slice(0, 2) : inside.slice(0, 1)
    folders.add(join(path.slice(0, at), 'node_modules', ...name))
  }
  return [...folders].sort()
}

/** A licence named as a string, or as `{ type }`. @param {unknown} x */
const aLicenceName = (x) =>
  typeof x === 'string' ? x : typeof x === 'object' && x !== null && 'type' in x && typeof x.type === 'string' ? x.type : null

/** The licence a package.json names, in either of its two forms, or null. @param {{ license?: unknown, licenses?: unknown }} pkg */
function theLicenceNamed(pkg) {
  const one = aLicenceName(pkg.license)
  if (one !== null) return one
  const many = Array.isArray(pkg.licenses) ? pkg.licenses.map(aLicenceName).filter((x) => x !== null) : []
  return many.length > 0 ? many.join(' OR ') : null
}

/**
 * The notices file's text for some package folders.
 *
 * @param {string[]} folders
 * @returns {{ text: string, packages: number, withoutAFile: string[] }}
 */
export function theNoticesFor(folders) {
  /** @type {Map<string, { licence: string | null, files: { name: string, text: string }[], byHand: string | null }>} */
  const byPackage = new Map()
  for (const folder of folders) {
    const own = join(folder, 'package.json')
    if (!existsSync(own)) throw new Error(`${folder} was read by the build but has no package.json, so its licence cannot be named.`)
    const pkg = /** @type {{ name?: unknown, version?: unknown, license?: unknown, licenses?: unknown }} */ (JSON.parse(readFileSync(own, 'utf8')))
    if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') throw new Error(`${own} names no name or no version.`)
    const files = readdirSync(folder)
      .filter((name) => A_LICENCE_FILE.test(name) && statSync(join(folder, name)).isFile())
      .sort()
      .map((name) => ({ name, text: readFileSync(join(folder, name), 'utf8').trimEnd() }))
    const byHand = files.length === 0 ? (LICENCE_TEXTS_BY_HAND.get(`${pkg.name}@${pkg.version}`) ?? null) : null
    if (byHand !== null) {
      const where = join(THE_TEXTS_BY_HAND, byHand.folder)
      for (const name of readdirSync(where).sort()) files.push({ name, text: readFileSync(join(where, name), 'utf8').trimEnd() })
    }
    byPackage.set(`${pkg.name}@${pkg.version}`, { licence: theLicenceNamed(pkg), files, byHand: byHand?.says ?? null })
  }
  const names = [...byPackage.keys()].sort()
  const rule = '='.repeat(78)
  const parts = [
    'THIRD-PARTY NOTICES FOR MOLE OFFICE',
    '',
    `Mole Office is built with the ${String(names.length)} packages below. Each is named with its version,`,
    'the licence its package.json names, and the licence and notice files it carries, as it carries them.',
    '',
    'Electron and Chromium, which make the window, are not listed here. Their licences are the files',
    'LICENSE.electron.txt and LICENSES.chromium.html in the folder Mole Office is installed in.',
    'Node, which runs the office, is not listed here either. On Windows and the Mac its licence is',
    'runtime/LICENSE, beside this file. On Linux the office runs on the Node inside Electron, whose',
    'licence is the Node.js part of LICENSES.chromium.html.',
    '',
  ]
  /** @type {string[]} */
  const withoutAFile = []
  for (const name of names) {
    const one = /** @type {{ licence: string | null, files: { name: string, text: string }[], byHand: string | null }} */ (byPackage.get(name))
    parts.push(rule, name, `Licence named in its package.json: ${one.licence ?? 'none'}`)
    if (one.files.length === 0) {
      withoutAFile.push(name)
      parts.push('The package carries no licence or notice file of its own.')
    }
    if (one.byHand !== null) parts.push(one.byHand)
    for (const file of one.files) parts.push('', `--- ${file.name} ---`, file.text)
    parts.push('')
  }
  return { text: `${parts.join('\n')}\n`, packages: names.length, withoutAFile }
}

/**
 * The page build's list of the files it was made from, refused when it is missing or older than the
 * page itself, because then it was not written by the build that made the page.
 *
 * @param {string} list THE_PAGES_MODULES
 * @param {string} page THE_BUILT_PAGE
 * @returns {string[]}
 */
export function readThePagesModules(list, page) {
  const index = join(page, 'index.html')
  if (!existsSync(list)) throw new Error(`${list} is missing, so the packages the page carries cannot be named. Run \`npm run build\` again.`)
  if (statSync(list).mtimeMs < statSync(index).mtimeMs) {
    throw new Error(`${list} is older than ${index}, so it was not written by the build that made the page. Run \`npm run build\` again.`)
  }
  const ids = /** @type {unknown} */ (JSON.parse(readFileSync(list, 'utf8')))
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) throw new Error(`${list} is not a list of file names.`)
  return ids
}

/**
 * Writes the notices file into a bundle folder.
 *
 * @param {{ folder: string, folders: string[] }} what
 * @returns {{ written: string, packages: number, withoutAFile: string[] }}
 */
export function writeTheThirdPartyNotices({ folder, folders }) {
  const { text, packages, withoutAFile } = theNoticesFor(folders)
  const written = join(folder, THE_NOTICES_FILE)
  writeFileSync(written, text)
  return { written, packages, withoutAFile }
}
