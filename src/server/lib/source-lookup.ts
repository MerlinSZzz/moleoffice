// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * "WHERE IS X", ANSWERED FROM THE SOURCE INDEX BEFORE ANYBODY SEARCHES THE REPOSITORY.
 *
 * A name is looked up in two places, both already stored: the files of the scan, and the module
 * records with the stated rows of the implementation map. Nothing here walks a directory or reads a
 * file. A name the index does not hold is answered `answered: false` with a sentence saying so,
 * because the caller then searches, and an empty list with no sentence would read as "it is nowhere".
 *
 * WHAT MATCHES A FILE, in the order the answer ranks them:
 *   - "path end": the name holds a "/" and the path is the name or ends in "/" + the name, so the
 *     match is on whole segments ("alpha/finder.ts" answers src/alpha/finder.ts, "pha/finder.ts" does not);
 *   - "export": the scan lists the name among the file's exports;
 *   - "file name": the file's name is the name, with or without its last extension.
 * Imports are not matched: a file that imports a name is where the name is used, not where it is.
 *
 * WHAT MATCHES A MODULE: its title, ignoring case, or its id. The answer gives the files its claims
 * match in the scan now, and each claim that matches no file as stale, never as one of its files.
 *
 * THE CLAIMS ARE COVERAGE'S OWN. Which module claims which file is read from `coverage` in
 * lib/sourceindex.ts, so this door and GET /api/source/coverage cannot disagree about one module: in
 * a project with registered repositories each stated row is counted against the stored scan of the
 * repository it names, and otherwise against the workspace scan.
 *
 * WHAT A LIMIT LEFT OUT IS DECLARED, as every capped read declares it (src/shared/disclosure.ts): each
 * list cut at the limit says how many it could have carried and names every file it left out, by its
 * path, after its repository's name and a colon when it is from a repository's scan.
 *
 * The index is derived and can be older than any checkout. This answers what the scan held when it
 * was built; checking each path against a checkout is the caller's part (tools/source-lookup.mjs).
 */

import { checkSubtraction, type LeftOutCounts, type LeftOutGroup } from '@shared/disclosure.ts'
import type { RepositoryNamed, SourceFile } from '@shared/types.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { coverage } from './sourceindex.ts'
import { listIndexedFiles } from './list-indexed-files.ts'
import { storedScanOf } from './stored-scan-of.ts'

/** How a file matched the name, best first. */
export type FileMatch = 'path end' | 'export' | 'file name'

const MATCH_ORDER: readonly FileMatch[] = ['path end', 'export', 'file name']

/** A module claim that matched a file: which module, and the pattern that matched. */
export interface ClaimingModule {
  id: string
  title: string
  pattern: string
}

/** A file of the scan that matched the name. `repository` is null when it is from the workspace scan. */
export interface FoundFile {
  path: string
  repository: RepositoryNamed | null
  matchedBy: FileMatch[]
  modules: ClaimingModule[]
}

/** A module called by the name, with the files its claims match in the scan now, and its stale claims. */
export interface FoundModule {
  id: string
  title: string
  files: { path: string; repository: RepositoryNamed | null }[]
  /** How many of its files were left out of `files` by the limit: `subtraction.leftOut`. */
  filesLeft: number
  /** What the limit left out of `files`, with every file it left out named in `leftOutGroups`. */
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<'row_limit'>[]
  /** Claims that match no file in the scan. `problem` is there when the pattern could never match. */
  staleClaims: { pattern: string; repository: RepositoryNamed | null; problem?: string }[]
  /** Why its stated rows could not be counted at all; null when they were. */
  problem: string | null
}

export interface SourceLookup {
  name: string
  /** True when at least one file of the scan is given: a matched file, or a file of a matched module. */
  answered: boolean
  files: FoundFile[]
  /** How many matched files were left out of `files` by the limit: `subtraction.leftOut`. */
  left: number
  /** What the limit left out of `files`, with every file it left out named in `leftOutGroups`. */
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<'row_limit'>[]
  modules: FoundModule[]
  /** Registered repositories whose files were not read, because no scan of them is stored. */
  notRead: { repository: RepositoryNamed; because: string }[]
  /** Why the index gives no file for the name, as a sentence; null when it gives one. */
  noAnswer: string | null
}

/** The scans this project's claims are counted against: each registered repository's own, or the workspace scan. */
function scansToRead(workspaceId: string): {
  scans: { repository: RepositoryNamed | null; files: SourceFile[] }[]
  notRead: SourceLookup['notRead']
} {
  const registered = listRepositories(workspaceId)
  if (registered.length === 0) return { scans: [{ repository: null, files: listIndexedFiles(workspaceId) }], notRead: [] }
  const scans: { repository: RepositoryNamed | null; files: SourceFile[] }[] = []
  const notRead: SourceLookup['notRead'] = []
  for (const repo of registered) {
    const repository = { id: repo.id, name: repo.name }
    const stored = storedScanOf(workspaceId, repo.id)
    if (stored === null) notRead.push({ repository, because: `No scan of the repository "${repo.name}" is stored, so its files were not read.` })
    else scans.push({ repository, files: stored.files })
  }
  return { scans, notRead }
}

function matchesOf(file: SourceFile, name: string): FileMatch[] {
  const found: FileMatch[] = []
  if (name.includes('/') && (file.path === name || file.path.endsWith(`/${name}`))) found.push('path end')
  if (file.exports.includes(name)) found.push('export')
  const base = file.path.slice(file.path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  if (base === name || (dot > 0 && base.slice(0, dot) === name)) found.push('file name')
  return found
}

const keyOf = (repository: RepositoryNamed | null, path: string): string => `${repository?.id ?? ''}\u0000${path}`

const byRepositoryThenPath = (
  a: { path: string; repository: RepositoryNamed | null },
  b: { path: string; repository: RepositoryNamed | null },
): number => (a.repository?.name ?? '').localeCompare(b.repository?.name ?? '') || a.path.localeCompare(b.path)

/** A file named as one id: its path, after its repository's name and a colon when it is from a repository's scan. */
const idOf = (file: { path: string; repository: RepositoryNamed | null }): string =>
  file.repository === null ? file.path : `${file.repository.name}:${file.path}`

/** The first `limit` files of a list, and the rest named and checked as the shared check asks. */
function cutAtTheLimit<File extends { path: string; repository: RepositoryNamed | null }>(
  where: string,
  all: File[],
  limit: number,
): { carried: File[]; subtraction: LeftOutCounts; leftOutGroups: LeftOutGroup<'row_limit'>[] } {
  const carried = all.slice(0, limit)
  const ids = all.slice(carried.length).map(idOf)
  const leftOutGroups: LeftOutGroup<'row_limit'>[] = [{ cause: 'budget', bucket: 'row_limit', count: ids.length, ids }]
  const subtraction: LeftOutCounts = { candidates: all.length, carried: carried.length, leftOut: ids.length, shortened: 0 }
  checkSubtraction(where, subtraction, leftOutGroups)
  return { carried, subtraction, leftOutGroups }
}

/** Why a module called by the name gives no file now, as the end of a sentence. */
function whyNoFile(module: FoundModule): string {
  if (module.problem !== null) return `its stated rows were not counted: ${module.problem}`
  const stale = module.staleClaims.length
  if (stale === 0) return 'it claims no file'
  return stale === 1 ? 'its one claim matches no file in the scan' : `each of its ${String(stale)} claims matches no file in the scan`
}

/**
 * Look a name up in the source index: the files of the scan and the module records' claims.
 * Throws through `coverage` when no scan is stored; the route checks that first and answers 404 or 409.
 */
export function lookUp(workspaceId: string, name: string, limit = 20): SourceLookup {
  const { scans, notRead } = scansToRead(workspaceId)
  const claimed = coverage(workspaceId).modules

  // Which module claims which file, by the claims coverage resolved.
  const claimsOn = new Map<string, ClaimingModule[]>()
  const modules: FoundModule[] = []
  const lowered = name.toLowerCase()
  for (const module of claimed) {
    const entries = module.repositories === undefined
      ? [{ repository: null, claims: module.claims }]
      : module.repositories.filter((entry) => entry.scan !== null).map((entry) => ({ repository: entry.repository, claims: entry.claims }))
    const files = new Map<string, { path: string; repository: RepositoryNamed | null }>()
    const staleClaims: FoundModule['staleClaims'] = []
    for (const entry of entries) {
      for (const claim of entry.claims) {
        if (claim.matched.length === 0) {
          staleClaims.push({ pattern: claim.pattern, repository: entry.repository, ...(claim.problem === null ? {} : { problem: claim.problem }) })
        }
        for (const path of claim.matched) {
          const key = keyOf(entry.repository, path)
          const held = claimsOn.get(key)
          const one = { id: module.moduleId, title: module.moduleTitle, pattern: claim.pattern }
          if (held === undefined) claimsOn.set(key, [one])
          else held.push(one)
          files.set(key, { path, repository: entry.repository })
        }
      }
    }
    if (module.moduleTitle.toLowerCase() !== lowered && module.moduleId !== name) continue
    const cut = cutAtTheLimit(`lookUp: the files of module ${module.moduleId}`, [...files.values()].sort(byRepositoryThenPath), limit)
    modules.push({
      id: module.moduleId,
      title: module.moduleTitle,
      files: cut.carried,
      filesLeft: cut.subtraction.leftOut,
      subtraction: cut.subtraction,
      leftOutGroups: cut.leftOutGroups,
      staleClaims,
      problem: module.problem,
    })
  }

  const matched: FoundFile[] = []
  for (const scan of scans) {
    for (const file of scan.files) {
      const matchedBy = matchesOf(file, name)
      if (matchedBy.length === 0) continue
      matched.push({ path: file.path, repository: scan.repository, matchedBy, modules: claimsOn.get(keyOf(scan.repository, file.path)) ?? [] })
    }
  }
  const rank = (file: FoundFile): number => MATCH_ORDER.indexOf(file.matchedBy[0]!)
  matched.sort((a, b) => rank(a) - rank(b) || byRepositoryThenPath(a, b))

  const { carried: files, subtraction, leftOutGroups } = cutAtTheLimit('lookUp: the matched files', matched, limit)
  const answered = files.length > 0 || modules.some((module) => module.files.length > 0)
  return {
    name,
    answered,
    files,
    left: subtraction.leftOut,
    subtraction,
    leftOutGroups,
    modules,
    notRead,
    noAnswer: answered ? null : noAnswerFor(name, modules, notRead),
  }
}

function noAnswerFor(name: string, modules: FoundModule[], notRead: SourceLookup['notRead']): string {
  const unread = notRead.length === 0 ? '' : ` ${notRead.map((one) => one.because).join(' ')}`
  if (modules.length === 0) {
    return (
      `The source index has no entry for "${name}": no file in the scan exports it or is named it, no path ends in it, ` +
      `and no module is called it.${unread} Search the repository for it.`
    )
  }
  const called = modules.map((module) => `the module "${module.title}" is called that, and ${whyNoFile(module)}`).join('; ')
  return (
    `The source index has no entry for "${name}" that gives a file now: no file in the scan exports it or is named it, ` +
    `no path ends in it, and ${called}.${unread} Search the repository for it.`
  )
}
