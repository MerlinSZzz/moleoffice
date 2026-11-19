// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE INSTALLED PACKAGE LOCK WHERE A RUN RAN, kept beside each run alone and each suite run, and the words that say
 * whether a suite and a run alone had the same installed packages. A file red in the suite and green alone may have run
 * on different packages, and nothing kept said which. The lock is evidence only: nothing that lands or bounces reads it.
 * Part of the merge tool, tools/the-merger.mjs; red-files.mjs and testing.mjs call it.
 *
 * Two lock files are kept, and a hash of one is never compared with a hash of the other. npm writes its own record of
 * what an install put in node_modules, node_modules/.package-lock.json, and it is not package-lock.json, even for the
 * same packages.
 *
 * EACH LOCK SAYS WHERE IT WAS READ, and the words that compare two locks name both places. A suite on the cloud box
 * reads a lock its own npm ci wrote, and a run alone here reads the record of the install the merge clone links to.
 * That record can be older than the packages in the folder, so two hashes can differ when the packages do not.
 *
 * TWO LOCKS ARE COMPARED BY THEIR PACKAGES, without the root's own name and version (theInstalledPart). The root's
 * version is in both files, so every bump of it made two installs of the same packages look different. The whole
 * file's sha256 is still kept beside each run.
 */
import './a-library-is-not-a-program.mjs'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** What a place with neither lock keeps, in place of a hash. */
export const NO_LOCK_FOUND = 'no lock found'
const INSTALLED = 'node_modules/.package-lock.json'
const LOCKFILE = 'package-lock.json'
/**
 * WHERE A LOCK WAS READ, in the words its `readAt` holds: here, with the path of the file read; here, in the commit the
 * cloud box ran; or on the cloud box, after the install before its build (tools/cloud-suite.mjs).
 */
export const LOCK_READ = {
  /** @param {string} file */
  here: (file) => `here at ${file}`,
  /** @param {string} file */
  hereInTheCommitTheBoxRan: (file) => `here at ${file} in the commit the cloud box ran`,
  onTheBox: "on the cloud box after an npm ci of the commit's package-lock.json",
}

/** What a lock the cloud box answered says when its answer gives no `installedPackages`, so its packages are not compared. */
export const FROM_BEFORE_THE_PACKAGES = "in an answer from before the cloud box hashed its packages without the root's name and version"
/**
 * What it says when the box could not hash its packages, with the reason the box gave, its semicolons made commas.
 * @param {string} reason
 */
export const thePackagesUnread = (reason) => `and the cloud box could not hash its packages (${reason.replaceAll(';', ',')})`

/**
 * @typedef {{ file: string, sha256: string, packages: string | null, packagesUnread?: string, readAt: string } | { file: null, sha256: null, says: string }} AnInstalledLock
 * `sha256` is the whole file's, and `packages` the sha256 of theInstalledPart of it, or null when the cloud box's
 * answer gave none, with `packagesUnread` when the box said why it could not make it. `readAt` says where the lock was
 * read: here, with the path of the file read, or on the cloud box.
 */

/**
 * THE PART OF A LOCK THAT SAYS WHAT WAS INSTALLED, as JSON text: the whole record without the root's own name and
 * version, at its top and in its "" entry. tools/cloud-suite.mjs runs this function's own text on the cloud box, so
 * it uses nothing outside itself, and the box and this machine hash the same part.
 *
 * @param {string} text
 */
export function theInstalledPart(text) {
  const record = JSON.parse(text)
  delete record.name
  delete record.version
  const root = record.packages?.['']
  if (root !== undefined) { delete root.name; delete root.version }
  return JSON.stringify(record)
}

/** @param {string} file */
const sha256Of = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
/** @param {string} file */
const packagesOf = (file) => createHash('sha256').update(theInstalledPart(readFileSync(file, 'utf8'))).digest('hex')

/**
 * THE INSTALLED LOCK OF THE TREE A RUN RAN IN: node_modules/.package-lock.json when it is there, and otherwise the
 * package-lock.json beside the node_modules the tree's node_modules is, after its links, which is the lockfile that
 * install used. A tree with no node_modules, or with neither file, has no lock found.
 *
 * @param {string} tree
 * @returns {AnInstalledLock}
 */
export function theInstalledLock(tree) {
  const modules = join(tree, 'node_modules')
  if (existsSync(modules)) {
    const real = realpathSync(modules)
    const installed = join(real, '.package-lock.json')
    if (existsSync(installed)) return { file: INSTALLED, sha256: sha256Of(installed), packages: packagesOf(installed), readAt: LOCK_READ.here(installed) }
    const lockfile = join(dirname(real), LOCKFILE)
    if (existsSync(lockfile)) return { file: LOCKFILE, sha256: sha256Of(lockfile), packages: packagesOf(lockfile), readAt: LOCK_READ.here(lockfile) }
  }
  return { file: null, sha256: null, says: NO_LOCK_FOUND }
}

/**
 * THE INSTALLED LOCK OF A SUITE THE CLOUD BOX RAN: the sha256 the box's answer gives of its node_modules/.package-lock.json
 * (tools/cloud-suite.criteria.md, criterion 23), with the sha256 of its packages it gives as `installedPackages`, and,
 * when its answer gives no lock, the package-lock.json of the commit it ran, read here in `clone`. An answer with
 * `installedLock` and no `installedPackages` is from before the box hashed its packages, so its packages are null,
 * unless it gives `installedPackagesUnread`, the reason the box could not hash them.
 *
 * @param {{ installedLock?: string, installedPackages?: string, installedPackagesUnread?: string } | undefined} box
 * @param {string} clone
 * @returns {AnInstalledLock}
 */
export function theBoxLock(box, clone) {
  if (typeof box?.installedLock === 'string') {
    const unread = typeof box.installedPackagesUnread === 'string' ? { packagesUnread: box.installedPackagesUnread } : {}
    return { file: INSTALLED, sha256: box.installedLock, packages: typeof box.installedPackages === 'string' ? box.installedPackages : null, ...unread, readAt: LOCK_READ.onTheBox }
  }
  const lockfile = join(clone, LOCKFILE)
  return existsSync(lockfile) ? { file: LOCKFILE, sha256: sha256Of(lockfile), packages: packagesOf(lockfile), readAt: LOCK_READ.hereInTheCommitTheBoxRan(lockfile) } : { file: null, sha256: null, says: NO_LOCK_FOUND }
}

/**
 * WHETHER A RUN AND A RUN ALONE HAD THE SAME INSTALLED PACKAGES, in words with no semicolon, since the reruns are
 * joined with one. `theRun` is "the suite" or "the related tests". The hashes compared are of the packages. Two locks
 * of different files cannot be compared, and nor can a lock the cloud box answered with no hash of its packages.
 *
 * @param {string} theRun
 * @param {AnInstalledLock} inIt
 * @param {AnInstalledLock} alone
 */
export function theLocksCompared(theRun, inIt, alone) {
  const short = (/** @type {string} */ sha256) => sha256.slice(0, 16)
  if (inIt.sha256 !== null && alone.sha256 !== null && inIt.packages !== null && alone.packages !== null && inIt.file === alone.file) {
    const read = `read ${inIt.readAt} for ${theRun} and ${alone.readAt} for the run alone`
    const what = `${inIt.file} without the root's name and version`
    return inIt.packages === alone.packages
      ? `${theRun} and the run alone had the same installed packages (${what}, sha256 ${short(inIt.packages)}, ${read})`
      : `${theRun} and the run alone had different installed packages (${what}, sha256 ${short(inIt.packages)} in ${theRun} and ${short(alone.packages)} alone, ${read})`
  }
  /** @param {AnInstalledLock} lock */
  const said = (lock) => (lock.sha256 === null ? lock.says : `${lock.file}, sha256 ${short(lock.sha256)}, read ${lock.readAt}${lock.packages === null ? `, ${lock.packagesUnread === undefined ? FROM_BEFORE_THE_PACKAGES : thePackagesUnread(lock.packagesUnread)}` : ''}`)
  return `the installed packages of ${theRun} and of the run alone cannot be compared (in ${theRun} ${said(inIt)}, and alone ${said(alone)})`
}
