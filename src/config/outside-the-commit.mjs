// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT IN A WORK TREE IS NOT THE COMMIT, WORKED OUT WITHOUT ASKING GIT TO COMPARE A FILE.
 *
 * A run can write its repository's config and its attributes. Git runs a filter that the repository
 * names whenever it compares a file in the work tree with a commit or with the index: `diff HEAD`,
 * `status`, and the rest. A filter is any program, and its name cannot be overridden in advance
 * (src/config/guarded-git.mjs). So git is asked here only for lists: the commit's whole tree
 * (`ls-tree`, on object ids), which paths it converts (`check-attr --cached`), and the paths in the
 * index with the untracked files (`ls-files`, with the work tree pinned). Each of those runs nothing
 * under the guard. The files on disk are read by this module.
 *
 * A tracked file must be there, as a file or a link as the commit says, with the executable bit the
 * commit says. Its bytes must have git's own name for the committed blob. A path in `changed` is one
 * whose bytes the caller compares itself, so only its kind and executable bit are checked here. A path
 * in the index that the commit does not hold is a staged file. An untracked file that git does not
 * ignore is listed apart, so a caller can exempt some of them.
 *
 * WHAT THIS CANNOT COMPARE. A file whose attributes make git change its bytes on checkout: one with a
 * filter, `eol=crlf`, `ident` or a `working-tree-encoding`. Whether its bytes are what git would write
 * from the commit cannot be known without running that conversion, and a filter is a program the run
 * may have chosen. So when its bytes are not the committed blob's, it is listed apart, in
 * `notCompared`: it may hold work and it may not, so no caller takes it as the commit's. When its bytes
 * are the blob's, as they are when no program for its filter is configured, the commit holds every
 * byte of it, and it is not listed. Either way it must still be there, as a file, with its executable
 * bit. Line endings set by core.autocrlf or core.eol and not by an attribute are not worked out, and
 * neither is core.fileMode=false. Such a file reads as differing. A submodule is not compared.
 *
 * A SPARSE CHECKOUT. A path the index marks skip-worktree (`ls-files -t` tags it S) is one git does not
 * write out, as a sparse checkout leaves a folder out. When nothing is at such a path, it is not
 * compared and not listed. When a file is there, it is compared as any tracked file: in a sparse
 * checkout git clears the mark itself, and a run can set the mark on any file with
 * `git update-index --skip-worktree`, after which git status shows no change to it.
 *
 * The seal (src/server/lib/sealed-tip.ts) and the tools that look at a work tree on the host
 * (tools/the-inspector.mjs, tools/inspector-sandbox.mjs, tools/sandbox.mjs) read it here, each with
 * its own guarded git.
 */

import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, openSync, readlinkSync, readSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Runs one guarded git command in the repository and answers its standard output. `workTree` pins
 * the work tree; `input` is sent on standard input.
 * @typedef {(args: string[], options?: { input?: string, workTree?: string }) => Buffer} GitReader
 */

/** How much of a file is read at a time. */
const A_PIECE = 8 * 1024 * 1024

/**
 * The names in a NUL-delimited list git wrote. An unfinished list or an empty name is refused.
 * @param {Buffer} bytes
 * @returns {string[]}
 */
export function theNamesIn(bytes) {
  if (bytes.length && bytes[bytes.length - 1] !== 0) throw new Error('git answered an incomplete NUL-delimited path list.')
  const names = bytes.length ? bytes.toString('utf8').slice(0, -1).split('\0') : []
  if (names.some((name) => !name)) throw new Error('git answered an empty entry in a NUL-delimited path list.')
  return names
}

/**
 * Paths in groups of at most 32 KiB, so no one git command is handed too many.
 * @param {string[]} names
 * @returns {string[][]}
 */
export function inGroups(names) {
  /** @type {string[][]} */
  const groups = []
  /** @type {string[]} */
  let group = []
  let bytes = 0
  for (const name of names) {
    const size = Buffer.byteLength(name) + 1
    if (group.length && bytes + size > 32 * 1024) { groups.push(group); group = []; bytes = 0 }
    group.push(name); bytes += size
  }
  if (group.length) groups.push(group)
  return groups
}

/**
 * GIT'S OWN NAME FOR SOME BYTES AS A BLOB: "blob <size>", a NUL, then the bytes, hashed with the
 * repository's object hash. A committed object id of 40 hex digits says SHA-1, and one of 64 says
 * SHA-256. The caller adds the bytes.
 * @param {string} oid
 * @param {number} size
 */
export function gitsNameForABlob(oid, size) {
  return createHash(oid.length === 40 ? 'sha1' : 'sha256').update(`blob ${String(size)}\0`)
}

/**
 * One entry of a commit's whole tree, with the size `ls-tree -l` gives a blob. A gitlink has no size.
 * @typedef {{ path: string, mode: string, oid: string, size: number | null }} TreeEntry
 */

/**
 * @param {GitReader} read
 * @param {string} commit
 * @returns {TreeEntry[]}
 */
function theWholeTreeOf(read, commit) {
  const invalid = () => new Error(`git answered an invalid entry in the whole tree of ${commit}.`)
  return theNamesIn(read(['ls-tree', '-r', '-l', '-z', '--full-tree', commit])).map((entry) => {
    const tab = entry.indexOf('\t')
    const header = /^([0-7]{6}) (blob|commit) ([a-f0-9]{40}(?:[a-f0-9]{24})?) +(-|0|[1-9][0-9]*)$/.exec(entry.slice(0, tab))
    if (tab < 0 || !header) throw invalid()
    const [, mode, type, oid, size] = header
    if ((type === 'commit') !== (mode === '160000') || (size === '-') !== (type === 'commit')) throw invalid()
    return { path: entry.slice(tab + 1), mode: String(mode), oid: String(oid), size: size === '-' ? null : Number(size) }
  })
}

/** The attributes that make git change a file's bytes when it writes the file out. */
const CONVERTS = ['filter', 'eol', 'ident', 'working-tree-encoding']

/**
 * Which of these paths git would change on checkout, read with `check-attr --cached`, which reads
 * attributes and runs nothing. An attribute that is unspecified or unset changes nothing, and `eol`
 * changes bytes only when it is crlf.
 * @param {GitReader} read
 * @param {string[]} names
 */
function thePathsGitConverts(read, names) {
  /** @type {Set<string>} */
  const converted = new Set()
  for (const group of inGroups(names)) {
    const fields = theNamesIn(read(['check-attr', '--cached', '-z', '--stdin', ...CONVERTS], { input: group.join('\0') + '\0' }))
    if (fields.length % 3 !== 0) throw new Error('git answered an incomplete attribute list.')
    for (let at = 0; at < fields.length; at += 3) {
      const [path, attribute, value] = [String(fields[at]), fields[at + 1], fields[at + 2]]
      if (value === 'unspecified' || value === 'unset') continue
      if (attribute === 'eol' && value !== 'crlf') continue
      converted.add(path)
    }
  }
  return converted
}

/**
 * EVERY PATH OUTSIDE THE COMMIT. `dirty` holds the tracked paths whose copy in the work tree is not
 * what the commit holds, and the staged paths the commit does not hold. `untracked` holds the
 * untracked paths git does not ignore. `notCompared` holds the tracked paths git converts on checkout
 * whose bytes are not the committed blob's, which this module cannot compare (the header says why);
 * none of them is in `dirty`. A skip-worktree path with nothing at it is in no list (the header says
 * why). `read` must run git under the guard of src/config/guarded-git.mjs.
 *
 * One `ls-files` lists the index and the untracked files together, each with its tag: `?` is
 * untracked, `S` is skip-worktree, and any other tag is in the index. The work tree is pinned to
 * `directory`, whatever core.worktree says. With `folders`, a folder git does not track at all is one
 * entry ending in `/`, as `git status` shows it, so a file added inside it later changes nothing in
 * the list.
 * @param {string} directory
 * @param {string} commit
 * @param {GitReader} read
 * @param {ReadonlySet<string>} [changed]
 * @param {{ folders?: boolean }} [shown]
 * @returns {{ dirty: string[], untracked: string[], notCompared: string[] }}
 */
export function whatIsOutsideTheCommit(directory, commit, read, changed = new Set(), shown = {}) {
  const tree = theWholeTreeOf(read, commit)
  /** @type {Map<string, boolean>} */
  const folders = new Map()
  /** @param {string} folder */
  const isAFolder = (folder) => {
    let answer = folders.get(folder)
    if (answer === undefined) {
      try { answer = lstatSync(folder).isDirectory() }
      catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes(String(/** @type {NodeJS.ErrnoException} */ (error).code))) throw new Error(`Cannot read ${folder}: ${String(error)}`)
        answer = false
      }
      folders.set(folder, answer)
    }
    return answer
  }
  const asFolders = shown.folders ? ['--directory', '--no-empty-directory'] : []
  const listed = theNamesIn(read(['ls-files', '-z', '-t', '--cached', '--others', ...asFolders, '--exclude-standard'], { workTree: directory })).map((entry) => {
    if (entry[1] !== ' ' || entry.length < 3) throw new Error('git answered an invalid entry in the list of the index and the untracked files.')
    return { tag: entry[0], path: entry.slice(2) }
  })
  const skipped = new Set(listed.filter((one) => one.tag === 'S').map((one) => one.path))
  const piece = Buffer.allocUnsafe(A_PIECE)
  /** @type {Set<string>} */
  const dirty = new Set()
  /** @type {string[]} */
  const otherBytes = []
  for (const one of tree) {
    if (one.size === null) continue
    const found = theFileHoldsTheBlob(directory, { ...one, size: one.size }, !changed.has(one.path), isAFolder, piece)
    if (found === 'other bytes') otherBytes.push(one.path)
    else if (found !== 'the blob' && !(found === 'absent' && skipped.has(one.path))) dirty.add(one.path)
  }
  // A FILE GIT CONVERTS ON CHECKOUT, WITH OTHER BYTES THAN THE BLOB, COULD NOT BE COMPARED, and is listed apart.
  // Only the files whose bytes differ are asked about.
  const converted = otherBytes.length ? thePathsGitConverts(read, otherBytes) : new Set()
  /** @type {string[]} */
  const notCompared = []
  for (const path of otherBytes) {
    if (converted.has(path)) notCompared.push(path)
    else dirty.add(path)
  }
  const held = new Set(tree.map((one) => one.path))
  /** @type {string[]} */
  const untracked = []
  for (const { tag, path } of listed) {
    if (tag === '?') untracked.push(path)
    else if (!held.has(path)) dirty.add(path)
  }
  return { dirty: [...dirty], untracked, notCompared }
}

/**
 * Every entry of the index, as `ls-files --stage` gives it, which reads the index and runs nothing under the guard.
 * @param {string} directory
 * @param {GitReader} read
 * @returns {{ mode: string, oid: string, stage: string, path: string }[]}
 */
export function theIndexOf(directory, read) {
  return theNamesIn(read(['ls-files', '-z', '--stage'], { workTree: directory })).map((entry) => {
    const fields = /^([0-7]{6}) ([a-f0-9]{40}(?:[a-f0-9]{24})?) ([0-3])\t([^]+)$/.exec(entry)
    if (!fields) throw new Error('git answered an invalid entry in the list of the index.')
    const [, mode = '', oid = '', stage = '', path = ''] = fields
    return { mode, oid, stage, path }
  })
}

/**
 * WHAT THE INDEX HOLDS APART FROM THE COMMIT. `staged` holds the paths the index holds with other bytes
 * or another mode than the commit, or in conflict, which `git status` counts as changes even when the
 * file on disk is the commit's again. `submodules` holds every submodule the index names.
 * @param {string} directory
 * @param {string} commit
 * @param {GitReader} read
 * @returns {{ staged: string[], submodules: string[] }}
 */
export function whatTheIndexHoldsApart(directory, commit, read) {
  const tree = new Map(theWholeTreeOf(read, commit).map((one) => [one.path, one]))
  /** @type {string[]} */
  const staged = []
  /** @type {string[]} */
  const submodules = []
  for (const { mode, oid, stage, path } of theIndexOf(directory, read)) {
    if (mode === '160000') submodules.push(path)
    const held = tree.get(path)
    if ((stage !== '0' || held === undefined || held.mode !== mode || held.oid !== oid) && !staged.includes(path)) staged.push(path)
  }
  return { staged, submodules }
}

/**
 * Whether the file at a committed path is that blob: there, of the kind its mode says, with the
 * executable bit its mode says, and, when `bytes` is true, with git's own name for the blob.
 *
 * A PATH THROUGH A LINK OR A FILE IS ABSENT, as it is to git, which never follows a link inside a path.
 * A file is opened without following a link and without waiting, so a link or a named pipe put there
 * after the check is not read, and a read never goes past the committed size. 'other bytes' is said
 * only of a file that is there as the right kind, because a conversion on checkout can explain only that.
 * 'absent' is said when nothing is at the path, or a folder on it is not a folder; what is there in a
 * folder's place is listed by `ls-files` as untracked.
 * @param {string} directory
 * @param {{ path: string, mode: string, oid: string, size: number }} one
 * @param {boolean} bytes
 * @param {(folder: string) => boolean} isAFolder
 * @param {Buffer} piece
 * @returns {'the blob' | 'absent' | 'not there as committed' | 'other bytes'}
 */
function theFileHoldsTheBlob(directory, one, bytes, isAFolder, piece) {
  let folder = directory
  for (const part of one.path.split('/').slice(0, -1)) {
    folder = join(folder, part)
    if (!isAFolder(folder)) return 'absent'
  }
  const full = join(directory, one.path)
  /** @param {unknown} error @returns {'absent' | 'not there as committed'} */
  const unreadable = (error) => {
    const code = String(/** @type {NodeJS.ErrnoException} */ (error).code)
    if (['ENOENT', 'ENOTDIR'].includes(code)) return 'absent'
    if (code === 'ELOOP') return 'not there as committed'
    throw new Error(`Cannot read tracked file ${one.path}: ${String(error)}`)
  }
  let stat
  try { stat = lstatSync(full) } catch (error) { return unreadable(error) }
  if (one.mode === '120000') {
    if (!stat.isSymbolicLink()) return 'not there as committed'
    if (!bytes) return 'the blob'
    let target
    try { target = readlinkSync(full, { encoding: 'buffer' }) } catch (error) { return unreadable(error) }
    // A link is never converted, so its other target is not 'other bytes'.
    const same = target.length === one.size && gitsNameForABlob(one.oid, one.size).update(target).digest('hex') === one.oid
    return same ? 'the blob' : 'not there as committed'
  }
  if (!stat.isFile() || ((stat.mode & 0o100) !== 0) !== (one.mode === '100755')) return 'not there as committed'
  if (!bytes) return 'the blob'
  if (stat.size !== one.size) return 'other bytes'
  let fd
  try { fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) } catch (error) { return unreadable(error) }
  try {
    const opened = fstatSync(fd)
    if (!opened.isFile()) return 'not there as committed'
    if (opened.size !== one.size) return 'other bytes'
    const asGit = gitsNameForABlob(one.oid, one.size)
    let total = 0
    for (let read = readSync(fd, piece, 0, Math.min(piece.length, one.size + 1 - total), null); read > 0;
      read = readSync(fd, piece, 0, Math.min(piece.length, one.size + 1 - total), null)) {
      asGit.update(piece.subarray(0, read))
      total += read
      if (total > one.size) return 'other bytes'
    }
    return total === one.size && asGit.digest('hex') === one.oid ? 'the blob' : 'other bytes'
  } finally {
    closeSync(fd)
  }
}
