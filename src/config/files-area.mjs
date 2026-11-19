// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHERE A FILES RUN MAY LAND: an agent's files area, and the one rule for whether a file lies inside it.
 * Acceptance finding 52 (report EnJvvsDTF_Dx, block f-52), on the design approved on
 * 23 September 2026 (recover/work/office/design-files-area.md; messages Yzb2Vd-cKicN and 1bbshFyI-jfU).
 *
 * A files seal's paths are relative to its root, and an agent's work area is repository-relative (criterion
 * P92), so no file of a files run was ever inside a work area. The files area is a second field beside it:
 * absolute folders, each kept as it was written and as it resolved when it was registered. The run never
 * names its own; its starter, the owner or a secretary does.
 *
 * THE REAL LOCATION DECIDES, NEVER THE SPELLING. A file is inside when its real location, with every link
 * followed, lies inside a folder's resolved location. A folder whose location today is not the one it
 * resolved to when registered (a link repointed) makes every file of the entry refused by name until
 * somebody registers it again: the new target is never followed. A file whose real location lies in a git
 * working tree or a hidden folder of a home is outside, wherever the area is. One reading, used by the
 * office's check, by the inspector tool and by the queue when an entry is integrated and when it lands.
 */
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { isAnAbsolutePath, thePathsOf } from './the-paths-of-a-system.mjs'

/**
 * @typedef {{ written: string, resolved: string }} FilesAreaFolder
 */

/**
 * Whether `inner` is the folder `outer` or lies under it; both are real, absolute locations.
 * @param {string} inner
 * @param {string} outer
 * @returns {boolean}
 */
function under(inner, outer) {
  const rel = relative(outer, inner)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * ONE FOLDER OF A FILES AREA AS IT IS WRITTEN: trailing separators dropped, or the reason it is refused before
 * anything on disk is looked at. `/` stays `/`, and on Windows "C:\" stays "C:\", so the root is refused as the
 * root once it is resolved. Absolute is a drive letter on Windows and "/" elsewhere (src/config/the-paths-of-a-system.mjs);
 * Linux and the Mac answer as they did when this check was written in src/server/lib/participants.ts.
 *
 * @param {string} entry what a caller wrote
 * @param {string} [platform] a value of `process.platform`, this system's unless a test names another
 * @returns {{ written: string, because: string | null }}
 */
export function theFilesAreaFolderAsWritten(entry, platform = process.platform) {
  const paths = thePathsOf(platform)
  const trimmed = entry.trim()
  const written =
    platform === 'win32'
      ? trimmed.replace(/[\\/]+$/u, '').replace(/^([A-Za-z]:)$/u, '$1\\')
      : trimmed.replace(/\/+$/u, '') || (trimmed.startsWith('/') ? '/' : '')
  const plain =
    written !== '' &&
    isAnAbsolutePath(written, platform) &&
    paths.normalize(written) === written &&
    !written.split(platform === 'win32' ? /[\\/]/u : '/').includes('..')
  return { written, because: plain ? null : 'a files area is absolute folders, written plainly, with no `..`.' }
}

/**
 * WHERE THIS SYSTEM KEEPS ITS HOMES: the folder each person's home is made in, and root's own home.
 * Linux makes homes under /home and root's is /root. macOS makes them under /Users, and root's home is
 * /var/root. src/config/start-folder.mjs reads the same answer, so the two cannot name different homes.
 *
 * WINDOWS makes homes under Users on the drive it runs from, which it names in SystemDrive, and has no root
 * user, so `root` is null. That folder is Windows' default; a machine that moved it still has the home this
 * process runs in refused, which both lists add. With no SystemDrive set, `under` is null and no folder of
 * homes is read rather than one guessed.
 *
 * @param {string} [platform] a value of `process.platform`, this system's unless a test names another
 * @param {Record<string, string | undefined>} [env] where Windows' SystemDrive is read from
 * @returns {{ under: string | null, root: string | null }}
 */
export function whereTheHomesAre(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    const drive = env['SystemDrive']
    return { under: typeof drive === 'string' && /^[A-Za-z]:$/u.test(drive) ? `${drive}\\Users` : null, root: null }
  }
  return platform === 'darwin' ? { under: '/Users', root: '/var/root' } : { under: '/home', root: '/root' }
}

/**
 * THE HOMES ON THIS MACHINE, each real: every folder directly under the folder homes are made in (/home on
 * Linux, /Users on macOS, C:\Users on Windows), root's home where there is one, and the home this process runs in.
 * @param {string} [platform] a value of `process.platform`, this system's unless a test names another
 * @returns {string[]}
 */
export function theHomes(platform = process.platform) {
  const where = whereTheHomesAre(platform)
  const homes = new Set(where.root === null ? [homedir()] : [where.root, homedir()])
  if (where.under !== null) {
    try {
      for (const name of readdirSync(where.under)) homes.add(join(where.under, name))
    } catch {
      // no folder of homes: the other two stand
    }
  }
  return [...homes].map((one) => (existsSync(one) ? realpathSync(one) : one))
}

/**
 * The hidden folder directly under a home that a real location lies in (~/.ssh, ~/.config, ~/.claude), or null.
 * @param {string} real
 * @param {readonly string[]} homes
 * @returns {string | null}
 */
export function theHiddenHomeFolderHolding(real, homes) {
  for (const home of homes) {
    const below = relative(home, real)
    if (below === '' || below.startsWith('..') || isAbsolute(below)) continue
    const first = below.split('/')[0] ?? ''
    if (first.startsWith('.')) return join(home, first)
  }
  return null
}

/**
 * The git working tree a real location lies in, or null: the nearest folder at or above it that holds `.git`.
 * @param {string} real
 * @returns {string | null}
 */
export function theGitTreeHolding(real) {
  for (let at = real; ; at = dirname(at)) {
    if (existsSync(join(at, '.git'))) return at
    if (dirname(at) === at) return null
  }
}

/**
 * THE REAL LOCATION OF A PATH THAT MAY NOT EXIST YET: the nearest existing ancestor, resolved with every link
 * followed, and the rest of the path joined on as written. A file an add will create has no location of its
 * own yet, but the folders it will be written through do.
 * @param {string} absolute
 * @returns {string}
 */
export function theRealLocation(absolute) {
  const rest = []
  let at = absolute
  while (!existsSync(at)) {
    const up = dirname(at)
    if (up === at) break
    rest.unshift(basename(at))
    at = up
  }
  return rest.length === 0 ? realpathSync(at) : join(realpathSync(at), ...rest)
}

/**
 * The folders of an area whose location today is not the one they resolved to when registered.
 * @param {readonly FilesAreaFolder[]} area
 * @returns {{ written: string, resolved: string, now: string | null }[]}
 */
export function theFoldersThatMoved(area) {
  const moved = []
  for (const folder of area) {
    let now = null
    try {
      now = realpathSync(folder.written)
    } catch {
      now = null
    }
    if (now !== folder.resolved) moved.push({ ...folder, now })
  }
  return moved
}

/**
 * IS THIS FILE OF A FILES RUN INSIDE THE AGENT'S FILES AREA? `root` and `path` are the seal's; the answer
 * names the file's real location, and why it is not inside when it is not.
 * @param {string} root the folder the run's files land in, absolute
 * @param {string} path the file's path under it, as the seal holds it
 * @param {readonly FilesAreaFolder[] | null} area the agent's files area, or null when it has none
 * @returns {{ inside: boolean, real: string, says: string }}
 */
export function insideTheFilesArea(root, path, area) {
  const real = theRealLocation(join(root, path))
  if (area === null || area.length === 0) {
    return { inside: false, real, says: `${path} lands at ${real}, and this agent has no files area, so no file of a files run is inside it.` }
  }
  const [one] = theFoldersThatMoved(area)
  if (one !== undefined) {
    return {
      inside: false,
      real,
      says:
        `The files area ${one.written} resolved to ${one.resolved} when it was registered and resolves to ${one.now ?? 'nothing'} now, ` +
        'so no file is inside it until somebody registers it again; the new location is never followed.',
    }
  }
  const holder = area.find((folder) => under(real, folder.resolved))
  if (holder === undefined) {
    return { inside: false, real, says: `${path} lands at ${real}, which is outside this agent's files area (${area.map((folder) => folder.resolved).join(', ')}).` }
  }
  // AND NEVER INTO A REPOSITORY OR A HIDDEN FOLDER OF A HOME, even one that appeared inside the area after it was
  // registered: files that belong to a repository go through the git lane (the reason given in message 1bbshFyI-jfU).
  const tree = theGitTreeHolding(real)
  if (tree !== null) return { inside: false, real, says: `${path} lands at ${real}, inside the git working tree ${tree}; files that belong to a repository go through the git lane.` }
  const hidden = theHiddenHomeFolderHolding(real, theHomes())
  if (hidden !== null) return { inside: false, real, says: `${path} lands at ${real}, inside the hidden folder ${hidden}, which no files run writes.` }
  return { inside: true, real, says: `${path} lands at ${real}, inside the files area ${holder.resolved}.` }
}

