// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A FILE MAY BE READ FROM, AND WHERE A STORED FILE IS. The preview roots, the stores beside the database, the paths
 * a record stores, and the confined open of one file.
 *
 * These are the file door's own rules, and they were in src/server/api/files.ts beside it. They live here so that the
 * stores in src/server/lib/ that write a file the door will serve, and the send of a message that carries one, can ask
 * the same rules without importing the door. The door re-exports every name below that it exported before, so nothing
 * that imported them from it changes. "This endpoint" in the comments below is that door, GET /api/file.
 */

import { constants as FS_CONSTANTS, closeSync, existsSync, fstatSync, openSync, realpathSync, statSync } from 'node:fs'
import { basename, delimiter, dirname, isAbsolute, join, resolve as resolvePath } from 'node:path'
import type { PanelRecord } from '@shared/types.ts'
import type { PreviewRootSource } from '@shared/preview-roots.ts'
import { listRecords } from './records/reading.ts'
import { PanelError } from './panel-error.ts'
import { type Repository } from './repositories.ts'
import { listRepositories } from '../db/list-repositories.ts'
// The hand-added half of the derivation. This is the reader; the writer is the door that the
// Settings page presses, in src/server/api/preview-roots.ts.
import { addedPreviewRootsFor } from './preview-roots.ts'
import { REPO_ROOT, databaseDirectoryFrom, databasePathFrom, settingValue, settingWasSet, settings } from '../../config/settings.mjs'
import { THIS_PLATFORM, theNamesInAPath } from '../../config/the-paths-of-a-system.mjs'
import {
  theEarlierDataFoldersOfTheMark,
  theStoredFileNeedsTheMarkRefusal,
  type TheEarlierDataFoldersCannotBeKnown,
} from './the-earlier-data-folders.ts'
// THE HOME DIRECTORY THROUGH THE ONE FILE ALLOWED TO ASK FOR IT. `node:os` is not imported here.
// lib/adapters/index.ts is where the permit lives and why.
import { theHomeDirectory } from './adapters/index.ts'
import { inside } from '@shared/path-inside.ts'

// ============================================================================ configuration

/** The environment variable that says which directories a preview may read from. */
export const PREVIEW_ROOTS_VAR = 'MOLE_OFFICE_PREVIEW_ROOTS'

/**
 * The default root: the Mole Office checkout this file is part of.
 *
 * DELIBERATELY NOT `repoRoot()` FROM lib/sourceindex.ts, which is the same directory today. That
 * one is "which checkout the source index scans" and moves with MOLE_OFFICE_REPO_ROOT — so borrowing it
 * would mean pointing the index at another tree silently changed which files may be previewed.
 * Two settings, two meanings; this one is derived from where this file is and cannot drift from a
 * value somebody typed.
 *
 * It is a conservative default rather than a useful one, and that is the point: out of the box
 * Mole Office will read bytes only from its own checkout, and a folder of projects in a home directory
 * has to be named on purpose. The refusal names the variable, so nobody has to find that out from
 * the source.
 */
const CHECKOUT = resolvePath(REPO_ROOT)

/**
 * THE SECOND BUILT-IN ROOT: WHERE THIS PRODUCT'S OWN AGENTS PUT WHAT THEY MAKE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS BUILT IN, AND WHAT WENT WRONG WITHOUT IT
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M54. On 6 September 2026 the owner opened a handback report and every picture in it was
 * refused. Measured on a copy of the owner's corpus: report `ubALECmP9ub4` holds twenty pictures, all under
 * `~/.cache/mole-office/handback-shots/`, and every request for one came back 403 *"outside every
 * preview root"*. Nothing about the owner's machine caused it — the same request is refused on the machine
 * the API runs on.
 *
 * THEY ARE THERE BECAUSE THIS PROJECT PUT THEM THERE. An agent may not drop a screenshot straight into the
 * home folder, and CLAUDE.md now says every screenshot, log and scratch file an agent
 * makes goes under `~/.cache/mole-office`, and every builder and verifier brief repeats it. So the
 * rule that moved the pictures and the rule that refuses to serve them are this project's own two
 * rules disagreeing, and a report written by the rules could not be read.
 *
 * IT IS NOT A HOLE IN THE BOUNDARY. This directory is not somebody's home, not a folder of projects in
 * a home directory, and not `/`. It is one directory this product created for its own
 * working files, and a file in it is one of ours. Everything else about a preview is unchanged: a
 * live record still has to point at the path, `..` is still refused, and the file still has to be
 * here.
 *
 * A BUILT-IN ROOT THAT IS NOT ON DISK IS LEFT OUT RATHER THAN REFUSED. A root somebody typed is
 * checked and a missing one stops the request, because a boundary that quietly shrank is a
 * boundary nobody can rely on. Nobody typed this one, and an installation that has never run an
 * agent has no such directory — refusing every preview because of that would be this file
 * inventing a misconfiguration. `rootsSentence` prints the roots that are really in force either
 * way, so what is in force is never a guess.
 */
function whereAgentsWriteTheirs(): string {
  return join(theHomeDirectory(), '.cache', 'mole-office')
}

/**
 * THE STORES BESIDE THE DATABASE: the folders the upload doors write a file into and hand its path back
 * from. lib/reportfiles.ts, lib/messagepictures.ts and lib/returnedfiles.ts each take their folder from
 * `whereAStoreIs`. The names are here because each of those files already imports this one, so naming
 * them here makes no import cycle.
 *
 * THE THIRD BUILT-IN ROOT, WHEREVER THE DATABASE LIVES. A file a door stores is one this endpoint will be
 * asked to serve, so each store is a root. While the database is in the checkout's own data folder, the
 * checkout root already holds the stores. On 20 October 2026 a live office's data folder was moved out of
 * its checkout, and every upload was then refused with 500, because no root held the stores any more.
 *
 * EACH STORE, AND NOT THE DATABASE'S FOLDER. The key file and the database are in that folder too, and a
 * root over them would let a record that names one serve it.
 */
export const STORES_BESIDE_THE_DATABASE = ['report-files', 'message-pictures', 'returned-files'] as const

export type StoreBesideTheDatabase = (typeof STORES_BESIDE_THE_DATABASE)[number]

/** The folder the database in use is in, worked out from its path the way the settings reader does. */
function theDataFolder(): string {
  return databaseDirectoryFrom(settings().databasePath)
}

/** Where one store is on this machine, as an absolute path. */
export function whereAStoreIs(store: StoreBesideTheDatabase): string {
  return join(theDataFolder(), store)
}

/** Whether the data folder in use is not the default one, so a stored path may name an old store. */
export function theDataFolderHasMoved(): boolean {
  return databaseDirectoryFrom(databasePathFrom({})) !== theDataFolder()
}

/**
 * Whether a folder named as a store is above the path's last name. The walk starts above the last name, because a path
 * that is a store's own folder is in no store.
 */
function aStoreFolderIsAbove(path: string): boolean {
  let folder = dirname(path)
  for (;;) {
    if ((STORES_BESIDE_THE_DATABASE as readonly string[]).includes(basename(folder))) return true
    const above = dirname(folder)
    if (above === folder) return false
    folder = above
  }
}

/**
 * WHERE THE FILES RECORDS STORED ARE NOW, when the data folder has moved: a function from the path a
 * record names to the path its bytes are at.
 *
 * A record keeps the absolute path an upload door handed back. While the database was in the default
 * data folder, the one used when nothing sets the database path, that path is
 * `<checkout>/data/<store>/<name>`. The data folder move copies that folder and rewrites no record, so
 * each such record names a path where nothing is any more.
 *
 * So a path inside a store of the default data folder, or of any earlier data folder the move's mark
 * lists, is read from the same store beside the database in use, and a path inside the data folder in
 * use is returned as it is. The earlier folders matter because a second move, or a move after an
 * install that chose a place, would otherwise lose the stored files at the confirm. Nothing is
 * rewritten: the record still names the old path, and that path is what the reference check is met by.
 * An empty environment reads no setting, so `databasePathFrom({})` is the default database path,
 * worked out the one way the settings reader does.
 *
 * WHEN THE MARK CANNOT BE READ THE EARLIER FOLDERS ARE NOT KNOWN. A path the data folder in use or a
 * store of the default folder places is read as before. Any other path with a folder named as a store
 * above its last name is refused, because it may name a file in a store of an earlier data folder. Any
 * other path is answered as it is, because no list of earlier folders would read it from anywhere else.
 *
 * THE FOLDERS ARE READ ONCE, when this is called, and not for each path. Reading the settings took
 * 0.063 ms a time on 20 October 2026, and a walk over every record and revision maps every path in them.
 */
export function whereStoredFilesAreNow(
  earlier: readonly string[] | TheEarlierDataFoldersCannotBeKnown = theEarlierDataFoldersOfTheMark(),
): (path: string) => string {
  const before = databaseDirectoryFrom(databasePathFrom({}))
  const now = theDataFolder()
  const cannotBeKnown = 'state' in earlier
  const known = cannotBeKnown ? [] : earlier
  if (!theDataFolderHasMoved() && known.length === 0 && !cannotBeKnown) return (path) => path
  const moved = [before, ...known].flatMap((folder) =>
    STORES_BESIDE_THE_DATABASE.map((store) => ({ old: join(folder, store), now: join(now, store) })),
  )
  return (path) => {
    for (const store of moved) {
      if (path !== store.old && inside(path, store.old)) return join(store.now, path.slice(store.old.length + 1))
    }
    if (inside(path, now)) return path
    // A PATH WITH A STORE'S FOLDER ABOVE ITS LAST NAME MAY NAME A FILE IN A STORE OF AN EARLIER DATA FOLDER. A path
    // with no such folder is answered as it is, because no list of earlier folders would read it from anywhere else.
    if (cannotBeKnown && aStoreFolderIsAbove(path)) throw theStoredFileNeedsTheMarkRefusal(earlier.mark, earlier.why)
    return path
  }
}

/** One directory that wants to be a preview root, and where it came from, before it is resolved. */
interface RootClaim {
  path: string
  source: PreviewRootSource
}

/**
 * The roots in force when nobody has set the variable: this checkout, the directory above if it is
 * there, and each store beside the database that neither of those holds. One place decides it, so
 * the refusal and the check cannot disagree about the list.
 */
function builtInClaims(): RootClaim[] {
  const claims: RootClaim[] = [{ path: CHECKOUT, source: { kind: 'checkout' } }]
  const ours = whereAgentsWriteTheirs()
  if (existsSync(ours)) claims.push({ path: ours, source: { kind: 'agents' } })
  for (const store of STORES_BESIDE_THE_DATABASE) {
    const path = whereAStoreIs(store)
    // A store inside the checkout is already in, and listing it again would only lengthen the list.
    if (claims.some((claim) => inside(path, claim.path))) continue
    claims.push({ path, source: { kind: 'store', store } })
  }
  return claims
}

/**
 * A STORE'S FOLDER AS THE FILESYSTEM HAS IT, made or not yet. A door makes its store on its first
 * upload, after it has checked the store is inside a root, so a store that is not there yet is still
 * a root. Its links are resolved up to the nearest folder that is there.
 */
function canonicalOfAStore(path: string): string {
  if (existsSync(path)) return realpathSync(path)
  return join(canonicalOfAStore(dirname(path)), basename(path))
}

/**
 * The paths somebody named in the variable, in order, with duplicates left in place. Null unset. They are
 * separated as PATH is on this system (`path.delimiter`: a colon on Linux and macOS).
 */
function configuredPaths(): string[] | null {
  const raw = settingValue(PREVIEW_ROOTS_VAR)
  if (raw === null) return null
  return raw
    .split(delimiter)
    .map((p) => p.trim())
    .filter((p) => p !== '')
}

/**
 * The directories the setting contributes, exactly as the three states have always read.
 *
 * UNSET falls to the built-in directories, SET names exactly its own, and SET TO AN EMPTY STRING is
 * an empty list that `previewRoots` below honours as "preview nothing". This function is exported so
 * the server's start-up check can read the setting without opening the database, which is where that
 * check has always run.
 */
export function configuredPreviewRoots(): readonly PreviewRoot[] {
  const paths = configuredPaths()
  const claims: RootClaim[] =
    paths === null ? builtInClaims() : paths.map((path) => ({ path, source: { kind: 'env' } as const }))
  return rootList(claims)
}

/** Resolve one claim to a root, or refuse loudly naming the path and the reason. */
function toPreviewRoot(claim: RootClaim): PreviewRoot {
  const root = claim.path
  const whose = claim.source.kind === 'env' ? PREVIEW_ROOTS_VAR : 'A preview root derived for this project'
  // Absoluteness is judged on the value as written, BEFORE resolving: resolvePath() would
  // happily turn "projects/docs" into something absolute against whatever directory this
  // process was started in, which is the guess this refusal exists to prevent.
  if (!isAbsolute(root)) {
    throw new PanelError(
      `${whose} holds "${root}", which is not an absolute path. A relative path would mean a ` +
        'different directory depending on where the server was started from, so it is refused rather than ' +
        'resolved against the working directory.',
      500,
    )
  }
  const lexical = resolvePath(root)
  try {
    const canonical = claim.source.kind === 'store' ? canonicalOfAStore(lexical) : realpathSync(lexical)
    return { configured: lexical, canonical, source: claim.source }
  } catch (err) {
    throw new PanelError(
      `${whose} names "${root}", which cannot be resolved on this machine (${errnoOf(err)}). It is ` +
        'refused rather than dropped from the list: a boundary that quietly shrank would change which files ' +
        'this server reads, with nothing saying it had.',
      500,
    )
  }
}

/** Resolve claims to roots, keeping the first claim for a directory two sources both name. */
function rootList(claims: readonly RootClaim[]): PreviewRoot[] {
  const roots: PreviewRoot[] = []
  const seen = new Set<string>()
  for (const claim of claims) {
    const root = toPreviewRoot(claim)
    if (seen.has(root.canonical)) continue
    seen.add(root.canonical)
    roots.push(root)
  }
  return roots
}

/**
 * The directories derived for ONE PROJECT, beside whatever the setting names.
 *
 *   (b) the checkout and ~/.cache/mole-office, exactly as `builtInClaims` gives them;
 *   (c) the root of every repository registered in the project;
 *   (d) every directory a registered work area of the project names, resolved under every
 *       repository root of the project and INCLUDED ONLY IF IT IS A DIRECTORY THAT EXISTS;
 *   (e) every directory somebody added by hand for this project, which is the one part that needed
 *       a store, and likewise included only while it is a directory that is still there.
 *
 * A WORK AREA OR A HAND-ADDED DIRECTORY THAT IS NOT THERE IS NOT AN ERROR and is not a root. It is a
 * real absence, and the store still records who added one and when; inventing a directory nobody has
 * would be the fabrication this product refuses everywhere else.
 */
function derivedClaims(workspaceId: string): RootClaim[] {
  const claims: RootClaim[] = builtInClaims()
  const repositories = listRepositories(workspaceId)
  for (const repository of repositories) {
    if (repository.root === null) continue
    claims.push({
      path: repository.root,
      source: { kind: 'repository', repositoryId: repository.id, repositoryName: repository.name },
    })
  }
  claims.push(...workAreaClaims(workspaceId, repositories))
  for (const added of addedPreviewRootsFor(workspaceId)) {
    if (!existsSync(added.path)) continue
    claims.push({
      path: added.path,
      source: { kind: 'added', addedBy: added.addedBy, addedAt: added.addedAt, why: added.why },
    })
  }
  return claims
}

/** Every existing directory a registered work area of this project names, under a repository root. */
function workAreaClaims(workspaceId: string, repositories: readonly Repository[]): RootClaim[] {
  const rooted = repositories.filter((repository): repository is Repository & { root: string } => repository.root !== null)
  if (rooted.length === 0) return []
  // WHERE THE AREAS ARE READ FROM. A work area is written on the agent's RECORD in this project
  // (`changeWorkArea` in lib/participants.ts), which is what makes it this project's rather than
  // the whole installation's. The registry's own copy is not read here, because it carries no
  // project and a work area under the wrong project would be a directory nobody registered here.
  const areas = new Set<string>()
  for (const record of listRecords({ workspaceId, kind: 'agent' })) {
    const area = record.data['workArea']
    if (!Array.isArray(area)) continue
    for (const entry of area) if (typeof entry === 'string' && entry.trim() !== '') areas.add(entry.trim())
  }
  const claims: RootClaim[] = []
  for (const workArea of areas) {
    // A work area is repository-relative by the rule that writes one. A row written before that
    // rule could be absolute or climb, and such a row names no directory under a repository, so it
    // is left out rather than resolved into something nobody registered.
    if (isAbsolute(workArea) || theNamesInAPath(workArea).some((name) => name === '..')) continue
    for (const repository of rooted) {
      const directory = resolvePath(repository.root, workArea)
      if (!existsSync(directory)) continue
      let isDirectory = false
      try {
        isDirectory = statSync(directory).isDirectory()
      } catch {
        isDirectory = false
      }
      if (!isDirectory) continue
      claims.push({
        path: directory,
        source: { kind: 'workarea', repositoryId: repository.id, repositoryName: repository.name, workArea },
      })
    }
  }
  return claims
}

/** One preview root, as it is used and as the filesystem really has it, and where it came from. */
export interface PreviewRoot {
  /** Exactly as configured, after trimming and normalising. What the messages quote. */
  configured: string
  /** The same directory with every symlink resolved. What containment is really judged against. */
  canonical: string
  /**
   * WHERE THIS ROOT CAME FROM, as a value and not a sentence built at the end. The Settings panel
   * draws it, so a reader can tell a directory somebody typed from one a registered repository or
   * work area derived. See src/shared/preview-roots.ts.
   */
  source: PreviewRootSource
}

/**
 * Where a preview may read from, for ONE PROJECT.
 *
 * Colon-separated, like PATH and like MOLE_OFFICE_LOCK_PATHS, which this follows deliberately: that
 * list is also a boundary rather than a search list, for the same reason — the thing being bounded
 * is written to by agents, and "here is a path, go and read it" has to be answerable with no.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A UNION, AND THE VARIABLE IS NEVER REPLACED
 * ---------------------------------------------------------------------------------------
 *
 * The roots in force are the setting's own list AND the directories derived for this project: the
 * checkout, ~/.cache/mole-office, every registered repository's root, and every existing directory a
 * registered work area names under one of those roots. Nothing in the variable's three states moves:
 * unset still falls to the built-in directories, set still names exactly its own plus the derived
 * list, and SET TO AN EMPTY STRING is still honoured as "preview nothing" and gets no derived roots
 * either — an operator who turned previews off turned them off.
 *
 * WHY THE EMPTY STATE IS NOT JUST THE DERIVED LIST. DECISIONS-PENDING section 22 asks what an UNSET
 * variable should mean and section 24 asks whether GET /api/file stays at all. Both are deliberately
 * undecided, and both name this function. The union answers neither: the unset case still falls to
 * the built-in directories, and the door is neither removed nor widened.
 *
 * A root that is not absolute, or that is not a directory that exists, STOPS THE REQUEST with a
 * 500 naming the value. Neither is silently dropped: a dropped root changes which files this
 * server will read, and a boundary that quietly shrank or grew is a boundary nobody can rely on.
 */
export function previewRoots(workspaceId: string): readonly PreviewRoot[] {
  const paths = configuredPaths()
  // SET TO AN EMPTY STRING MEANS "PREVIEW NOTHING", AND THAT IS HONOURED RATHER THAN OVERRIDDEN.
  // The derived list is not a way round the operator's own off switch.
  if (paths !== null && paths.length === 0) return []

  const configured: RootClaim[] =
    paths === null ? builtInClaims() : paths.map((path) => ({ path, source: { kind: 'env' } as const }))
  return rootList([...configured, ...derivedClaims(workspaceId)])
}

/**
 * How the roots read in a refusal, including the case where there are none.
 *
 * EXPORTED for the reason `inside` below is: a door that stores a file this endpoint will be asked
 * to serve refuses with the same sentence about the same roots, and writing that sentence a second
 * time is how the two come to describe different boundaries.
 */
export function rootsSentence(roots: readonly PreviewRoot[]): string {
  if (roots.length === 0) {
    return `${PREVIEW_ROOTS_VAR} is set to an empty string, which means "preview nothing", and that is honoured ` +
      'rather than overridden — so no file at all can be previewed until it names a directory.'
  }
  const list = roots.map((root) => root.configured).join(', ')
  // NOT "THE TWO", WHICH WOULD BE FALSE ON AN INSTALLATION THAT HAS NEVER RUN AN AGENT. The
  // built-in list drops ~/.cache/mole-office when that directory is not there, so this sentence
  // counts what is really in force rather than repeating the number this file usually expects.
  //
  // AND IT COUNTS ONLY THE BUILT-IN ONES. When the variable is unset the list may also hold roots
  // derived from this project's registered repositories and work areas, and calling those
  // directories ones "Mole Office writes into itself" would be false. The sentence says which are
  // the built-in ones and says the rest are derived, so the union does not make it overstate.
  //
  // AND IT NAMES ONLY THE BUILT-IN KINDS IN FORCE, for the same reason: a store is listed only when
  // the checkout does not already hold it.
  const builtIn = new Set<PreviewRootSource['kind']>(['checkout', 'agents', 'store'])
  const builtInKinds = roots.map((root) => root.source.kind).filter((kind) => builtIn.has(kind))
  const builtInCount = builtInKinds.length
  const built = builtInCount === 1 ? 'this is the directory' : `these are the ${String(builtInCount)} directories`
  const what = ['its checkout']
  if (builtInKinds.includes('agents')) what.push('where its agents put what they make')
  if (builtInKinds.includes('store')) what.push('the folders beside its database that hold the files it stores')
  const listed = what.length === 1 ? what[0]! : `${what.slice(0, -1).join(', ')} and ${what[what.length - 1]!}`
  const plain = `${built} Mole Office writes into itself: ${listed}`
  const because = settingWasSet(PREVIEW_ROOTS_VAR)
    ? ''
    : builtInCount === roots.length
      ? ` is unset, so ${plain}`
      : ` is unset, so ${plain}. The rest are derived for this project from its registered repositories and work areas`
  return `The preview roots are ${list} (${PREVIEW_ROOTS_VAR}${because}).`
}

export { inside }

// ============================================================================ the reference set

/** One place a record stores a path, with everything needed to answer for it. */
export interface StoredPath {
  recordId: string
  recordTitle: string
  /** Where in the record's data it sits, e.g. `data.summaryBlocks[#grip-bench-frame].path`. */
  where: string
  /** The path exactly as stored. */
  path: string
  /** The id and type of the object holding this path, or null when it declares neither. */
  blockId: string | null
  blockType: string | null
  /**
   * The file's own name as the object holding this path gives it, the name a report shows for a file block, or null
   * when that object names none. A saved file is named by it (wave 13y round 135, item 80).
   */
  name: string | null
  /** The same path, spelled the way `requestedPath` spells one, or null when it is unusable. */
  normalised: string | null
  /** The machine it says the file is on, or null for this one. Empty is declared to mean this one. */
  machine: string | null
  /** True when the record holding it has been soft-deleted. */
  deleted: boolean
}

/** `[#clamp-docs]` when the element carries an id, `[2]` when it does not. */
function elementKey(item: unknown, index: number): string {
  if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
    const id = (item as Record<string, unknown>)['id']
    if (typeof id === 'string' && id.trim() !== '') return `#${id}`
  }
  return String(index)
}

/**
 * Every path one record stores, found by walking its `data` for `path` keys.
 *
 * A WALK RATHER THAN A LIST OF THE TWO FIELDS THAT HAVE ONE TODAY. `data.paths[].path` and the
 * image block in `data.summaryBlocks[].path` are the two shapes declaring a path in
 * src/shared/kinds.ts, and a list here naming those two would be a second copy of that fact —
 * the defect CLAUDE.md names as this repository's own. A third shape declaring `path` would then
 * be invisible to the preview, and the symptom would be a refusal nobody could explain. The walk
 * cannot fall behind, because it does not know the shapes at all: it knows the key.
 *
 * `machine` is read from the same object, because that is where both declared shapes put it and
 * because a machine name only means anything beside the path it qualifies.
 */
export function storedPathsIn(record: Pick<PanelRecord, 'id' | 'title' | 'data' | 'deletedAt'>): StoredPath[] {
  const found: StoredPath[] = []

  const visit = (value: unknown, where: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${where}[${elementKey(item, index)}]`))
      return
    }
    if (value === null || typeof value !== 'object') return
    const object = value as Record<string, unknown>

    const path = object['path']
    if (typeof path === 'string' && path !== '') {
      const machine = object['machine']
      const name = object['name']
      found.push({
        recordId: record.id,
        recordTitle: record.title,
        where: `${where}.path`,
        path,
        blockId: typeof object['id'] === 'string' ? object['id'] : null,
        blockType: typeof object['type'] === 'string' ? object['type'] : null,
        name: typeof name === 'string' && name.trim() !== '' ? name : null,
        normalised: usableStoredPath(path),
        // "Which machine it is on. Empty means this one" is the declared meaning of the field, so
        // a blank one is this machine rather than a machine called "".
        machine: typeof machine === 'string' && machine.trim() !== '' ? machine.trim() : null,
        deleted: record.deletedAt !== null,
      })
    }

    for (const [key, child] of Object.entries(object)) visit(child, `${where}.${key}`)
  }

  visit(record.data, 'data')
  return found
}

/**
 * A stored path in the one spelling the request side is compared against, or null.
 *
 * Null for a stored path that is relative, holds a NUL, or climbs with `..`. Such a reference is
 * not usable as one — it does not name one file on this machine — and it is dropped rather than
 * repaired, so a record cannot authorise `<a root>/../.ssh/id_rsa` by writing it that
 * way. Both sides go through the same three rules, which is what makes the comparison mean
 * anything.
 *
 * On Windows a `..` between separators of either kind is a climb.
 */
export function usableStoredPath(stored: string, platform: string = THIS_PLATFORM): string | null {
  if (stored.includes('\0') || !isAbsolute(stored)) return null
  if (theNamesInAPath(stored, platform).some((name) => name === '..')) return null
  return resolvePath(stored)
}

// ============================================================================ where the file is

/**
 * WHERE A PATH'S FILE IS, AND WHETHER CLAUSE 4 LETS IT BE READ: inside a preview root as written and after every link is
 * followed, or which of those it fails.
 *
 * ONE ANSWER FOR THE ROUTE AND FOR THE SEND OF A MESSAGE. The route in src/server/api/files.ts asks it for a file a record
 * already points at, and `refuseAFileTheDoorWouldNotServe` in src/server/lib/messages/the-file-a-message-may-carry.ts
 * asks it for a file a message is about to carry. Two copies of this rule would let a message be sent with a file the
 * door then refuses, and the person would see only "Refused" in the chat.
 */
export type WhereAFileIs = { at: string; roots: readonly PreviewRoot[] } & (
  | { is: 'outside' }
  | { is: 'not-there' }
  | { is: 'unresolved'; code: string }
  | { is: 'linked-out'; canonical: string }
  | { is: 'inside'; canonical: string }
)

export function whereAFileIs(asked: string, workspaceId: string): WhereAFileIs {
  // A FILE A STORE HELD BEFORE THE DATA FOLDER MOVED is read from where that store is now.
  const at = whereStoredFilesAreNow()(asked)
  const roots = previewRoots(workspaceId)
  if (!roots.some((root) => inside(at, root.configured))) return { at, roots, is: 'outside' }
  let canonical: string
  try {
    canonical = realpathSync(at)
  } catch (err) {
    const code = errnoOf(err)
    return code === 'ENOENT' ? { at, roots, is: 'not-there' } : { at, roots, is: 'unresolved', code }
  }
  if (!roots.some((root) => inside(canonical, root.canonical))) return { at, roots, is: 'linked-out', canonical }
  return { at, roots, is: 'inside', canonical }
}

// ============================================================================ opening the file

/** The errno of a filesystem failure, for messages that name what really happened. */
function errnoOf(err: unknown): string {
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' ? code : String(err)
}

/** What one word of the answer calls a thing that is not a regular file. */
function whatItIs(stat: { isDirectory(): boolean; isCharacterDevice(): boolean; isBlockDevice(): boolean; isFIFO(): boolean; isSocket(): boolean; isSymbolicLink(): boolean }): string {
  if (stat.isDirectory()) return 'a directory'
  if (stat.isCharacterDevice()) return 'a character device'
  if (stat.isBlockDevice()) return 'a block device'
  if (stat.isFIFO()) return 'a named pipe'
  if (stat.isSocket()) return 'a socket'
  if (stat.isSymbolicLink()) return 'a symbolic link'
  return 'not a regular file'
}

/** A file that was opened and checked: the descriptor its bytes are read from, and its size. */
export interface OpenFile {
  fd: number
  size: number
}

/**
 * Open a path that has already been approved, and check that it is a file — or refuse, saying which.
 *
 * ---------------------------------------------------------------------------------------
 * O_NOFOLLOW IS THE POINT OF THIS FUNCTION, AND IT IS NOT BELT AND BRACES
 * ---------------------------------------------------------------------------------------
 *
 * The caller has already resolved every symlink with realpath and checked that the answer is
 * inside a root. Between that check and this open, anything on this machine may replace the file
 * with a symlink pointing anywhere — the classic swap, and on a machine where several agents are
 * writing at once it is not exotic. O_NOFOLLOW makes the open itself refuse a symlink, so the
 * window closes: either this reads the file that was checked, or it reads nothing and says so.
 *
 * O_NONBLOCK is there for a different failure with the same shape. Opening a named pipe for
 * reading BLOCKS until somebody opens the other end, so a FIFO under a preview root would hang
 * this request forever rather than refusing it — a hang is the one answer that says nothing at
 * all. With O_NONBLOCK the open returns and `fstat` gets to say what it is.
 *
 * The bytes are read from the FILE DESCRIPTOR, never re-opened by path. Re-opening would be a
 * second chance for the path to name something else, and it would mean the thing checked and the
 * thing served were only probably the same file.
 */
export function openConfined(path: string): OpenFile {
  let fd: number
  try {
    fd = openSync(path, FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_NOFOLLOW | FS_CONSTANTS.O_NONBLOCK)
  } catch (err) {
    const code = errnoOf(err)
    if (code === 'ENOENT') {
      throw new PanelError(
        `${path} is not there. A record points at it, so the reference is stale rather than the request being ` +
          'wrong: the file has been moved, renamed or deleted since somebody wrote it down. Nothing is served in ' +
          "its place — a stand-in under the file's own name would be a picture of something nobody has.",
        404,
      )
    }
    if (code === 'ELOOP') {
      throw new PanelError(
        `${path} is a symbolic link now, and it was not when this request checked it a moment ago. The read refuses ` +
          'to follow a link rather than resolving it a second time, because a link swapped in between the check and ' +
          'the read is how a confined path is made to point outside. Nothing was read. Ask again.',
        409,
      )
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new PanelError(
        `${path} is there and this server cannot read it (${code}). That is reported as what it is — unreadable — ` +
          'and not as missing and not as empty, because those are three different facts about the file and only ' +
          'one of them is true.',
        409,
      )
    }
    throw new PanelError(
      `${path} could not be opened (${code}). Nothing was served: Mole Office would rather say which error the operating ` +
        'system gave than answer with something that looks like the file.',
      409,
    )
  }

  try {
    const stat = fstatSync(fd)
    // ONLY A REGULAR FILE HAS BYTES TO PREVIEW, and this condition was `if (false)` — a guard
    // written, wired in, and then disabled, so every check below it ran against a directory, a
    // device, a named pipe or a socket exactly as if it were a file.
    //
    // The failure it allowed was not a crash. `O_NONBLOCK` means opening a named pipe with no
    // writer succeeds and reads zero bytes, so Mole Office would have answered 200 with an EMPTY
    // preview — presenting "this is a pipe" as "this file is empty". Those are different facts and
    // only one of them is true, which is the whole of the rule this endpoint exists to keep.
    //
    // `fstatSync` on the ALREADY-OPEN descriptor, never a fresh stat of the path: the thing
    // classified has to be the thing served, or a symlink repointed between the two calls makes
    // the check describe a file nobody is reading.
    if (!stat.isFile()) {
      throw new PanelError(
        `${path} is ${whatItIs(stat)}, not a file, so there are no bytes to preview. Mole Office does not list a ` +
          'directory and does not read a device: it shows one file that a record points at. Open it where it lives.',
        409,
      )
    }
    // The descriptor that was checked is what the bytes come from, whole or a stretch at a time, and
    // `stat.size` is what the response promises: both from the same open file, so they cannot
    // describe different files. The caller closes it.
    return { fd, size: stat.size }
  } catch (err) {
    closeSync(fd)
    throw err
  }
}
