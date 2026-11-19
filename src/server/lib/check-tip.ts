// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Read Git's stored HEAD without starting a process. This is eligibility, not a sealed tip.
 * Check doors and run handling call this reader repeatedly. Reading deltas here avoids starting
 * Git on those requests and also works when Git is not installed.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'
import { inspectionBase, inspectionTrunk } from '../../config/inspection-base.mjs'
import { packedCommitAt, UnreadableGitObject } from './packed-git-object.ts'

export { UnreadableGitObject } from './packed-git-object.ts'

export const COMMIT_ID = /^[0-9a-f]{40}$/i

/** The .git directory and the common directory a worktree shares, or null when there is neither. */
function gitDirectories(directory: string): { git: string; common: string } | null {
  try {
    let git = join(directory, '.git')
    if (!statSync(git).isDirectory()) {
      const marker = /^gitdir: (.+)\r?\n?$/.exec(readFileSync(git, 'utf8'))
      if (!marker?.[1]) return null
      git = resolve(directory, marker[1])
    }
    const common = existsSync(join(git, 'commondir'))
      ? resolve(git, readFileSync(join(git, 'commondir'), 'utf8').trim()) : git
    return { git, common }
  } catch { return null }
}

/**
 * ONE `objects` DIRECTORY, AND EVERY ONE IT BORROWS FROM.
 *
 * `git clone --shared` — how the sandbox launcher makes an instance's own clone (piece P2), to
 * share the main checkout's object store rather than copying it — writes no object of its own for
 * a commit the source already had. Its `objects/info/alternates` names where the real bytes are,
 * one path per line, and real git walks it; the lookup below did not, so `recordedHead` answered
 * `null` for a commit that was there all along. Measured proving the template on a full suite run
 * (fix-insandbox): `check-eligibility`'s own `workingDirectory: process.cwd()` case, run inside such
 * a clone, is exactly this — the object is only ever in the alternate, never local.
 *
 * Alternates can themselves have alternates (a clone of a clone), so this walks the chain rather
 * than reading one level, with a visited set against a cycle and a bound this reader has never
 * needed in practice. A line is a path relative to the `objects` directory that named it, unless it
 * is already absolute, which is how git writes and reads the file.
 */
function objectDirectories(objects: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const queue = [objects]
  while (queue.length > 0 && found.length < 32) {
    const one = queue.shift()!
    if (seen.has(one)) continue
    seen.add(one)
    found.push(one)
    try {
      const lines = readFileSync(join(one, 'info', 'alternates'), 'utf8').split('\n')
      for (const line of lines) {
        const path = line.trim()
        if (path === '' || path.startsWith('#')) continue
        queue.push(isAbsolute(path) ? path : resolve(one, path))
      }
    } catch { /* no alternates file here, or it could not be read: this one dir is all there is */ }
  }
  return found
}

/**
 * A COMMIT OBJECT, LOOSE OR PACKED, IN ONE `objects` DIRECTORY ALONE. `null` means only that this
 * one directory does not hold it verified — `recordedHead` is what tries the rest of the chain.
 */
function commitObjectAt(objects: string, value: string, allObjects: readonly string[]): string | null {
  const looseObject = join(objects, value.slice(0, 2), value.slice(2))
  if (existsSync(looseObject)) {
    const bytes = inflateSync(readFileSync(looseObject))
    const end = bytes.indexOf(0)
    const header = /^commit (\d+)$/.exec(bytes.toString('ascii', 0, end))
    return header && Number(header[1]) === bytes.length - end - 1 && createHash('sha1').update(bytes).digest('hex') === value ? value : null
  }
  return packedCommitAt(objects, value, allObjects)
}

/**
 * THE COMMIT ID A REF HOLDS, read off disk with no object read. It opens the .git marker and commondir
 * (`gitDirectories`), the ref's own file in the .git directory or the common directory, and packed-refs, and
 * follows a symbolic ref. Null where there is no such ref or it holds no commit id. `recordedHead` reads the
 * object it names as well; the check names origin's copy of the trunk with this alone, so that naming it cannot throw.
 */
function recordedRefValue(directory: string, named: string): { value: string; common: string } | null {
  if (!isAbsolute(directory)) return null
  try {
    const dirs = gitDirectories(directory)
    if (!dirs) return null
    const { git, common } = dirs
    const direct = /^[A-Za-z0-9._/-]+$/.test(named) && !named.startsWith('/') &&
      !named.split('/').some((part) => part === '.' || part === '..') && existsSync(join(git, named)) && statSync(join(git, named)).isFile()
    let value = direct
      ? readFileSync(join(git, named), 'utf8').trim()
      : COMMIT_ID.test(named) ? named : `ref: ${named.startsWith('refs/') ? named : `refs/heads/${named}`}`
    const seen = new Set<string>()
    while (value.startsWith('ref: ')) {
      const ref = value.slice(5)
      if (!/^refs\/[\w./-]+$/.test(ref) || ref.split('/').includes('..') || seen.has(ref)) return null
      seen.add(ref)
      if (seen.size > 16) return null
      const loose = [join(git, ref), join(common, ref)].find((path) => existsSync(path))
      if (loose) value = readFileSync(loose, 'utf8').trim()
      else {
        const packed = readFileSync(join(common, 'packed-refs'), 'utf8').split('\n')
          .find((line) => line.split(' ')[1] === ref)
        if (!packed) return null
        value = packed.split(' ')[0] ?? ''
      }
    }
    return COMMIT_ID.test(value) ? { value, common } : null
  } catch {
    // A missing ref or an unreadable ref file still cannot establish a tip.
    return null
  }
}

/** Missing refs remain unknown. An unreadable packed object names why it could not be read. */
export function recordedHead(directory: string, named = 'HEAD'): string | null {
  const ref = recordedRefValue(directory, named)
  if (ref === null) return null
  const { value, common } = ref
  try {
    const directories = objectDirectories(join(common, 'objects'))
    let unreadable: UnreadableGitObject | null = null
    for (const objects of directories) {
      // One directory's own trouble (no pack/ at all, an unreadable file) says nothing about the
      // next one in the chain, so it is caught here rather than at the top: a `--shared` clone with
      // no packs of its own must still reach its alternate, not stop at the first empty directory.
      let found: string | null = null
      try {
        found = commitObjectAt(objects, value, directories)
      } catch (error) {
        if (error instanceof UnreadableGitObject) unreadable ??= error
      }
      if (found !== null) return found
    }
    if (unreadable !== null) throw unreadable
    return null
  } catch (error) {
    if (error instanceof UnreadableGitObject) throw error
    // An unreadable loose object still cannot establish a tip.
    return null
  }
}

/** The ref a symbolic ref points at, as a full ref name, or null when there is no such symref. */
export function recordedSymbolicTarget(directory: string, named: string): string | null {
  if (!isAbsolute(directory)) return null
  const dirs = gitDirectories(directory)
  if (!dirs) return null
  for (const base of [dirs.git, dirs.common]) {
    try {
      const value = readFileSync(join(base, named), 'utf8').trim()
      if (value.startsWith('ref: ')) return value.slice(5)
    } catch { /* this ref is not a loose file here */ }
  }
  return null
}

/**
 * THE REPOSITORY'S TRUNK, read through the same function the seal reads it through. No process is
 * started: the refs are read off disk, which is what makes this usable in the check path.
 */
function recordedTrunk(directory: string) {
  return inspectionTrunk({
    remoteHead: () => {
      const target = recordedSymbolicTarget(directory, 'refs/remotes/origin/HEAD')
      const prefix = 'refs/remotes/'
      return target !== null && target.startsWith(prefix) ? target.slice(prefix.length) : null
    },
    localExists: (name: string) => recordedHead(directory, name) !== null,
  })
}

/**
 * Resolve plain refs without Git. The readers open the .git marker, commondir, HEAD and other direct
 * ref files, packed-refs, loose refs, objects/info/alternates, loose objects, and pack and index files.
 */
function recordedPlainRef(directory: string, named: string): { kind: 'resolved'; commit: string } | { kind: 'absent' | 'unreadable' } {
  if (!/^[A-Za-z0-9._/-]+$/.test(named) || named.startsWith('/') || named.includes('..') ||
      named.split('/').some((part) => part === '.' || part === '..') || /^[0-9a-f]{4,39}$/i.test(named)) return { kind: 'unreadable' }
  const dirs = gitDirectories(directory)
  if (dirs === null) return { kind: 'unreadable' }
  const packedPath = join(dirs.common, 'packed-refs')
  const packed = existsSync(packedPath) ? readFileSync(packedPath, 'utf8').split('\n') : []
  const refs = [named, `refs/${named}`, `refs/tags/${named}`, `refs/heads/${named}`, `refs/remotes/${named}`, `refs/remotes/${named}/HEAD`]
  for (let index = 0; index < refs.length; index++) {
    const ref = refs[index]!
    const paths = index === 0 ? [join(dirs.git, ref)] : [join(dirs.git, ref), join(dirs.common, ref)]
    const loose = paths.some((path) => existsSync(path) && statSync(path).isFile())
    if (!loose && (index === 0 || !packed.some((line) => line.split(' ')[1] === ref))) continue
    try {
      const commit = recordedHead(directory, ref)
      return commit === null ? { kind: 'unreadable' } : { kind: 'resolved', commit }
    } catch (error) {
      if (error instanceof UnreadableGitObject) return { kind: 'unreadable' }
      throw error
    }
  }
  return { kind: 'absent' }
}

/** What the check and the seal (./sealed-tip.ts) say of a base the run's record names as a commit. */
export const A_RECORDED_COMMIT_SAYS = "The run's record names this commit."

/** Why the check and the seal cannot tell a repository's trunk, as inspectionTrunk (../../config/inspection-base.mjs) finds it. */
export const THE_TRUNK_CANNOT_BE_TOLD = 'it has no origin/HEAD to read and it has both of the local branches main and master or neither of them'

/** How to make a base exact, where the trunk `trunk` was read in its place. */
export function howToMakeTheBaseExact(trunk: string): string {
  return `To make the base exact, register or start the run with --cut-from ${trunk}, or with a full commit hash.`
}

/**
 * What the check and the seal say where the base a run names did not resolve, and the trunk was read in its place:
 * which reader read which trunk, at which commit, and how to make the base exact. The person reads it on the check
 * and in the seal, so it names the commit and the flag; the trunk's own sentence named neither. `origin` is
 * origin's copy of the trunk where it stands at another commit, for the check, which cannot tell which is newer.
 */
export function aBaseThatDidNotResolve(
  reader: 'seal' | 'check', directory: string, base: string, trunk: string, commit: string | null,
  origin: { branch: string; commit: string } | null = null,
): string {
  const who = reader === 'seal' ? 'the seal' : 'the check'
  const read = commit === null ? `${trunk}, whose commit ${who} could not read`
    : origin === null ? `${trunk} at ${commit}`
      : `${trunk} at ${commit}, or ${origin.branch} at ${origin.commit} if ${origin.branch} is ahead of it`
  return `The repository of ${directory} has no branch or commit named ${base}, so ${who} read the repository's trunk instead: ${read}. ` +
    howToMakeTheBaseExact(trunk)
}

/** What the check says where the base a run names did not resolve and the repository's trunk cannot be told, so it read nothing. */
export function aBaseWithNoTrunkInItsPlace(directory: string, base: string): string {
  return `The repository of ${directory} has no branch or commit named ${base}, and the check read nothing in its place, ` +
    `because the repository's trunk cannot be told: ${THE_TRUNK_CANNOT_BE_TOLD}. ` +
    'To make the base exact, register or start the run with --cut-from and one of its local branches, or with a full commit hash.'
}

/** The same base choice the tool makes, using the server's filesystem reader. */
export function recordedCutFrom(directory: string | null, cutFrom: string | null) {
  try {
    // A vanished checkout cannot establish that a plain name is missing. Keep the name as an
    // unverified historical fact, as the legacy-run reader did before the fallback existed.
    if (directory !== null && cutFrom !== null && gitDirectories(directory) === null &&
        /^[A-Za-z0-9._/-]+$/.test(cutFrom) && !cutFrom.startsWith('/') && !cutFrom.includes('..') &&
        !cutFrom.split('/').includes('.') && !/^[0-9a-f]{4,40}$/i.test(cutFrom)) {
      return { branch: cutFrom, says: `The checkout ${directory} could not be read, so the recorded base ${cutFrom} was not verified.` }
    }
    const head = directory === null ? null : recordedHead(directory)
    const ref = directory === null || cutFrom === null || COMMIT_ID.test(cutFrom) ? null : recordedPlainRef(directory, cutFrom)
    const resolved = directory === null || cutFrom === null ? null : COMMIT_ID.test(cutFrom)
      ? recordedHead(directory, cutFrom) : ref?.kind === 'resolved' ? ref.commit : null
    const trunk = directory === null ? null : recordedTrunk(directory)
    if (directory !== null && cutFrom !== null && resolved === null) {
      if (COMMIT_ID.test(cutFrom)) return { branch: null, says: `The base commit ${cutFrom} could not be read in ${directory}.` }
      if (ref?.kind !== 'absent') return { branch: null, says: `The check cannot read the base ${cutFrom} without git in ${directory}.` }
      if (trunk === null || trunk.branch === null) {
        return { branch: null, says: aBaseWithNoTrunkInItsPlace(directory, cutFrom) }
      }
      // THE TRUNK'S COMMIT, AND origin's COPY OF IT WHERE THAT STANDS ELSEWHERE. The inspector reads the newer of the
      // two (theNewerTrunk, ../../config/inspection-base.mjs); telling which is newer takes git, so both are named.
      // origin's is the id its ref holds, read with no object read, so naming it cannot take away the base.
      const read = recordedPlainRef(directory, trunk.branch)
      const commit = read.kind === 'resolved' ? read.commit : null
      const far = commit === null || trunk.branch.startsWith('origin/') ? null : recordedRefValue(directory, `refs/remotes/origin/${trunk.branch}`)?.value ?? null
      const origin = far === null || far === commit ? null : { branch: `origin/${trunk.branch}`, commit: far }
      return { branch: trunk.branch, says: aBaseThatDidNotResolve('check', directory, cutFrom, trunk.branch, commit, origin) }
    }
    if (cutFrom !== null && COMMIT_ID.test(cutFrom)) return { branch: cutFrom, says: A_RECORDED_COMMIT_SAYS }
    return inspectionBase(cutFrom, head, resolved, trunk)
  } catch (error) {
    if (error instanceof UnreadableGitObject) return { branch: null, says: error.message }
    throw error
  }
}
