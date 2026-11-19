// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The source index over HTTP: what this repository is made of, and which module has taken
 * responsibility for each file.
 *
 *   GET  /api/source                 the index — every file, its language, size, imports, exports
 *   GET  /api/source?module=<id>     the files one module claims, each row counted in the scan of its repository
 *   GET  /api/source?path=<prefix>   just one directory or one file, by repository-relative prefix
 *   GET  /api/source/coverage        unclaimed files, stale claims, and the percentage claimed
 *   GET  /api/source/where?name=<X>  where X is, from the files of the scan and the modules' claims
 *   POST /api/source/reindex         rebuild it and each registered repository's scan, and say what changed
 *
 * `module` and `path` are the only query parameters, they may be combined, and any other one is
 * refused with a message naming these two — see `sourceQuery`. An audit had to discover that by
 * trying and being refused, then fetched every file and filtered them in the caller instead.
 *
 * ---------------------------------------------------------------------------------------
 * THIS FILE IS ROUTES. THE INDEX ITSELF IS src/server/lib/sourceindex.ts
 * ---------------------------------------------------------------------------------------
 *
 * Everything here works out who is asking, checks the input, decides the HTTP status and shapes
 * the response. It walks nothing, stores nothing and creates no table. Every fact in every answer
 * below comes from lib/sourceindex.ts.
 *
 * IT USED TO CARRY A SECOND SCANNER. This file once held its own copy of the walk, the storage,
 * the CREATE TABLE statements and the coverage engine, written in parallel with lib/sourceindex.ts
 * by an agent who could not edit that directory. Both ran CREATE TABLE IF NOT EXISTS for
 * `source_files` and `source_index` at import, against the same database, and they agreed only
 * because one author had copied the other's DDL statement for statement. Adding a column to
 * either would have broken the other writer on INSERT, at runtime, with nothing failing at
 * compile time and no test naming the cause — the exact silent wrongness this feature exists to
 * remove, sitting inside the feature. The copy is gone; lib/sourceindex.ts survived, because it
 * strips comments before reading imports, honours .gitignore, and keeps a content hash per file.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS IMPOSSIBLE TO WRITE TO THE INDEX THROUGH THIS API
 * ---------------------------------------------------------------------------------------
 *
 * There is no PUT and no PATCH for a source file, and no route that takes a file description in
 * a body. The only write is POST /api/source/reindex, which throws the whole index away and
 * rebuilds it from disk. That is not caution, it is the definition of the layer: anything a
 * person typed in here would be deleted by the next scan without being read once, which is a
 * worse way to lose a sentence than never having a field for it.
 *
 * The one thing a person does type is which code a module is responsible for. That is a row of the
 * implementation map, written through POST /api/implementation, where no scan can reach it.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY ANSWER SAYS HOW OLD IT IS
 * ---------------------------------------------------------------------------------------
 *
 * Every response carries a SourceIndexStamp, built by `sourceStamp` in lib/sourceindex.ts: when
 * the scan finished, how long ago that was in seconds and in words, what it walked, and what it
 * deliberately did not look at. A derived view that does not say how old it is invites somebody
 * to trust it after a refactor, and this one is built to be read by agents, which do not notice
 * that a file list feels out of date.
 *
 * The index is NOT rebuilt on read. A GET that quietly rescanned would make `builtAt` always
 * "now", which is exactly the lie the stamp exists to prevent, and it would turn a read into a
 * write. Before the first rebuild every GET here is a 404 that names the endpoint to call: an
 * empty file list would read as "this repository has no code".
 *
 * THE 404 IS DECIDED HERE, not in lib/. A missing index is a 404 to a caller who asked for the
 * index over HTTP, and a 409 to `coverage()` called from a script — same fact, two audiences, and
 * choosing between them is what a route file is for. So the routes check `indexStatus()` first
 * and answer with the sentence naming the rebuild endpoint; the lib refusal is the backstop
 * underneath it, and neither of them ever answers "nothing is unclaimed" for an index that was
 * never built.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THESE ROUTES ARE REGISTERED, AND WHERE THEIR DESCRIPTIONS LIVE
 * ---------------------------------------------------------------------------------------
 *
 * src/server/index.ts registers them under /api with a dynamic `await import`, like its
 * neighbours, because this file reaches the database and the database client reads MOLE_OFFICE_DB the
 * moment it is imported — which must not happen before .env is loaded.
 *
 * GET /api lists these endpoints automatically: it is built from the router itself. Their
 * one-line descriptions used to be a hand-written map at the bottom of this file, waiting to be
 * pasted into api/kinds.ts, and for as long as they waited GET /api answered `description: null`
 * for all three — including the rebuild endpoint, whose body an agent guessed. They now live in
 * DERIVED_ROUTE_NOTES in api/kinds.ts, which is what GET /api reads, and SOURCE_ROUTE_NOTES at
 * the bottom of this file is a view onto that map rather than a second copy of it.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type {
  ClaimsInOneRepository,
  ModuleClaims,
  PanelRecord,
  ReindexReport,
  RepositoryNamed,
  ResolvedClaim,
  SourceCoverage,
  SourceFile,
  SourceIndexStamp,
} from '@shared/types.ts'
import { checkSubtraction, type LeftOutCounts, type LeftOutGroup } from '@shared/disclosure.ts'
import { suggestKey } from '@shared/kinds.ts'
import { getRecord, listRecords, type Actor } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { DERIVED_ROUTE_NOTES } from './kinds.ts'
import {
  claimsByRepository,
  claimsOf,
  coverage,
  oldestScan,
  problemOfTheRepositories,
  rebuildIndex,
  repoRoot,
  requireARepositoryScan,
  sourceStamp,
  type IndexStatus,
} from '../lib/sourceindex.ts'
import { indexStatus } from '../lib/index-status.ts'
import { listIndexedFiles } from '../lib/list-indexed-files.ts'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { refuseAMessageThisReaderMayNotRead, theMessageReader } from '../lib/messages.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { rebuildRepository } from '../lib/implementation.ts'
import { statedInRepository } from '../db/stated-in-repository.ts'
import type { ClaimingModule, FileMatch, FoundFile, FoundModule, SourceLookup } from '../lib/source-lookup.ts'

// ============================================================================ input shapes

/** The query parameters GET /api/source accepts. Named once, used by the schema and its refusal. */
const SOURCE_QUERY_KEYS = ['module', 'path'] as const

/**
 * `?module=<record id>` and `?path=<prefix>`, both optional, and nothing else.
 *
 * strictObject, so an unknown query parameter is refused rather than ignored: a caller that
 * asked for `?moduleId=abc` and got the whole index back would read it as "this module claims
 * everything", which is the worst possible wrong answer from a coverage tool.
 *
 * THE REFUSAL SAYS WHAT IS ACCEPTED. An audit tried ?path= and ?moduleId= and was refused both
 * times, cleanly, with no list of what would have worked — so it fetched all 80-odd files and
 * filtered them in the caller. Zod's own "unrecognized keys" message names what was wrong and
 * nothing else; the message below names the two keys that exist and suggests the one a near miss
 * was probably meant to be, using the same `suggestKey` the 404 for a wrong /api path uses.
 */
const sourceQuery = z.strictObject(
  {
    module: z
      .string({ error: 'module must be the id of a module record, as text' })
      .trim()
      .min(1, { error: 'module must not be empty — it is the id of a module record, from GET /api/records?kind=module' })
      .optional(),
    /**
     * A repository-relative prefix, matched on WHOLE PATH SEGMENTS.
     *
     * Not a substring: "src/server" must not also answer with src/serverless.ts, because a
     * filter that quietly includes a neighbouring directory is a filter whose answer cannot be
     * trusted for coverage. Matching is done in the route, against the file list already in
     * memory, which is why this is cheap enough to exist at all.
     */
    path: z
      .string({ error: 'path must be text: a repository-relative prefix such as "src/server/api"' })
      .trim()
      .min(1, {
        error:
          'path must not be empty. It is a repository-relative prefix — "src/server/api" for a directory and ' +
          'everything under it, or one file\'s exact path. Leave it out to get the whole index.',
      })
      // Refused rather than matched against nothing. A glob here would answer with an empty file
      // list, which reads as "there is no code under there" — and the caller would have no way to
      // tell that from a prefix that is simply wrong.
      .refine((p) => !/[*?]/.test(p), {
        error:
          'path is a plain prefix, not a pattern: "*" and "?" are not matched here. Use "src/web" for everything ' +
          'under src/web. Globs are what a pattern in the implementation map takes, and ?module= is how you ask ' +
          'for the files a module\'s patterns match.',
      })
      .refine((p) => !p.startsWith('/'), {
        error:
          'path is relative to the repository root, so it must not start with "/". The index holds no absolute ' +
          'path, so one here would match nothing at all. Write "src/server/api", not "/home/…/src/server/api".',
      })
      .optional(),
  },
  {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? `GET /api/source takes ${SOURCE_QUERY_KEYS.join(' and ')}, and this request sent ` +
          `${issue.keys.map((k) => `"${k}"`).join(', ')}. ` +
          issue.keys
            .map((key) => {
              const meant = suggestKey(key, SOURCE_QUERY_KEYS)
              return meant === null ? '' : `Did you mean "${meant}" for "${key}"? `
            })
            .join('') +
          '`module` is the id of a module record, from GET /api/records?kind=module, and narrows the answer to the ' +
          'files that module claims. `path` is a repository-relative prefix such as "src/server/api" and narrows ' +
          'it to one directory or one file. They may be sent together.'
        : undefined,
  },
)

/** `?name=<X>` and an optional `?limit=`, and nothing else; the refusal of another key names these two. */
const whereQuery = z.strictObject({
  name: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'name is required: what to look for, such as "sourceindex.ts", "api/source.ts", "lookUp" or a module\'s title.'
          : 'name must be text: a file name, a path end, an exported name or a module\'s title.',
    })
    .trim()
    .min(1, { error: 'name must not be empty. It is what to look for: "sourceindex.ts", "api/source.ts", "lookUp" or a module\'s title.' })
    .max(200, { error: 'name must be at most 200 characters.' }),
  limit: z.coerce
    .number({ error: 'limit must be a whole number from 1 to 100' })
    .int({ error: 'limit must be a whole number from 1 to 100' })
    .min(1, { error: 'limit must be a whole number from 1 to 100' })
    .max(100, { error: 'limit must be a whole number from 1 to 100' })
    .optional(),
}, {
  error: (issue) =>
    issue.code === 'unrecognized_keys'
      ? `GET /api/source/where takes name and limit, and this request sent ${issue.keys.map((k) => `"${k}"`).join(', ')}.`
      : undefined,
})

// ============================================================================ responses

/**
 * What `?path=` narrowed the answer to, when it was sent.
 *
 * Present only when a filter was applied, and then always — because the stamp above says the
 * index holds 87 files and the array below has 12, and a caller who cannot see why has been
 * handed a number it can only misread. Same rule as the stamp itself: an answer that has been
 * narrowed says so, in the answer.
 */
export interface SourcePathFilter {
  /** The prefix as it was used, after trimming and dropping a leading "./" or trailing "/". */
  path: string
  /** How many files matched the prefix. */
  matched: number
  /**
   * How many were on the table before it was applied: the whole index on a plain request, or the
   * files the module claims when `?module=` was sent too. Not always the index's file count, and
   * `note` says which of the two this is in words.
   */
  of: number
  /** The same two numbers as a sentence, including the case where nothing matched. */
  note: string
}

export interface SourceIndexResponse {
  index: SourceIndexStamp
  files: SourceFile[]
  filter?: SourcePathFilter
}

/** A claimed file, and the registered repository whose stored scan it was found in, when there is one. */
export type ClaimedSourceFile = SourceFile & { repository?: RepositoryNamed }

/** The answer to ?module=: the module, its claims resolved, and the files behind them. */
export interface ModuleSourceResponse {
  /**
   * The scan the answer was counted against. In a project with registered repositories the claims
   * are counted against each repository's own stored scan, and this is the OLDEST of the scans
   * that were counted (or, when none was, the oldest stored scan of any of the project's
   * repositories), because an answer is as old as its oldest part. `repositories` carries each
   * repository's own stamp.
   */
  index: SourceIndexStamp
  module: { id: string; title: string }
  claims: ResolvedClaim[]
  /** The claimed files, with everything the index knows about each, and the repository each was found in. */
  files: ClaimedSourceFile[]
  /** The claims that matched nothing, repeated here so a caller cannot miss them. */
  staleClaims: ResolvedClaim[]
  /**
   * Set when this module's stated rows cannot be counted against this index, because the project
   * holds more than one repository and the index names none. Null in the ordinary case.
   *
   * In a project with registered repositories: set when none of this module's stated rows could be
   * counted, and it then joins each repository's `notCounted` sentence.
   */
  problem: string | null
  /**
   * Present when the project has registered repositories: the module's stated rows, counted
   * repository by repository against each one's own stored scan (decision 0KSoGUNDF9ml). A
   * repository whose patterns were not counted says why, and how to scan it.
   */
  repositories?: ClaimsInOneRepository[]
  /**
   * Present with `repositories`: the paths this module claims in more than one repository, each with
   * the repositories it was counted in, and a sentence saying so. A row is counted only in the
   * repository it names, so a path is here only when a row in each of those repositories states it.
   */
  inMoreThanOne?: { paths: { path: string; repositories: RepositoryNamed[] }[]; note: string }
  /**
   * Set when `?path=` was sent alongside `?module=`.
   *
   * It narrows `files` and NOTHING ELSE. `claims` and `staleClaims` are always resolved against
   * the whole index, because whether a claim still matches anything is a fact about the
   * repository, not about the slice of it somebody asked to look at — resolving them against a
   * filtered list would report a live claim as stale for as long as the filter was on.
   */
  filter?: SourcePathFilter
}

export interface SourceCoverageResponse {
  index: SourceIndexStamp
  coverage: SourceCoverage
}

/** The answer to GET /api/source/where: the scan it was read from, and what the name found there. */
export type SourceWhereResponse = { index: SourceIndexStamp } & SourceLookup

export interface ReindexResponse {
  index: SourceIndexStamp
  changes: ReindexReport
  /**
   * Every registered repository of this project, and whether its own slot was scanned by this
   * request (through `rebuildRepository`, the one writer of a repository's stored scan), or why not.
   */
  repositories: (
    | { repository: RepositoryNamed; scanned: true; builtAt: string; fileCount: number }
    | { repository: RepositoryNamed; scanned: false; because: string }
  )[]
}

// ============================================================================ the one guard

/**
 * The stored index, or the 404 that says how to build one.
 *
 * Every GET here goes through this. An empty `files` array with a 200 would read as "this
 * repository has no code", which is the shape of wrong answer this whole feature exists to stop
 * being given, so the refusal names the one endpoint that fixes it and says why a read does not
 * fix it by itself.
 */
function requireIndex(workspaceId: string): IndexStatus {
  const status = indexStatus(workspaceId)
  if (status === null) {
    throw new PanelError(
      `The source index for workspace "${workspaceId}" has not been built yet, so there is nothing to serve. Build ` +
        `it with POST /api/source/reindex, which walks ${repoRoot()} and takes about a second. Each workspace holds ` +
        'its own index, because a project describes its own checkout — another project having one is not this one ' +
        'having one, and answering from it would report every module here as claiming a repository it has never seen. ' +
        'It is not built on read on purpose: a scan triggered by a GET would make builtAt always "now", and an empty ' +
        'file list would read as "this repository has no code".',
      404,
    )
  }
  return status
}

/**
 * The stamp of the scan a project's claims are counted against, or the refusal that says there is none.
 *
 * A project with registered repositories is counted against each one's stored scan, and the answer is as
 * old as the oldest of them; only a project with none is counted against the workspace scan. Coverage and
 * the lookup both read their stamp here, so they cannot date one answer two ways.
 */
function stampOfTheCountedScans(workspaceId: string): SourceIndexStamp {
  const registered = listRepositories(workspaceId)
  return registered.length === 0
    ? sourceStamp(requireIndex(workspaceId))
    : oldestScan(requireARepositoryScan(workspaceId, registered).map((status) => sourceStamp(status)))
}

// ============================================================================ the derived answer, kept until a layer changes

/**
 * ONE WORKSPACE'S DERIVED ANSWER: the files each stored scan holds, and the claims coverage resolved
 * for every module. A lookup needs both on every call, and resolving them is what cost a second.
 *
 * WHY IT IS CACHED HERE AND NOT IN lib/. The measurement that opened this fix put about 93% of a
 * lookup's 1.05 s in `coverage(workspaceId)`: 182 modules, each resolving its stated rows against
 * the 4,249-file stored scan of its repository, and then the same scan read once more for the
 * summary. The file lists and the resolved claims do not change between scans or module writes, so
 * this file keeps them for as long as neither layer has moved.
 *
 * THE KEY IS BOTH LAYERS, READ CHEAPLY. The derived half is each registered repository's stored scan
 * stamp (`builtAt` and `fileCount`), and the workspace scan's stamp where no repository is registered.
 * The canonical half is every module record's id, title and `updatedAt`, and every live stated row of
 * the implementation map: its id, record, repository, pattern, relation, provenance and acceptance.
 * A guessed row becomes stated by an acceptance, which changes `acceptedAt`/`acceptedBy`; a removed
 * row leaves the list; a new row brings its id. Reading the rows takes two indexed queries here (one
 * per registered repository), not one query per module.
 *
 * A hit repeats only the match loop and the per-call stamp. `SourceIndexStamp.age` is never stored:
 * `sourceStamp` works it out from the cached IndexStatus on every answer, as it did before.
 */
interface CachedSourceLookup {
  /** The exact key that produced this data. A different key replaces the entry for this workspace. */
  revision: string
  /** What `scansToRead` in lib/source-lookup.ts would have read. */
  scans: { repository: RepositoryNamed | null; files: SourceFile[] }[]
  notRead: SourceLookup['notRead']
  /** `coverage(workspaceId).modules`, in the order coverage gives them. */
  modules: ModuleClaims[]
  /** The stamp material the cache was keyed on, so the age can be worked out per call. */
  registered: ReturnType<typeof listRepositories>
  statuses: (IndexStatus | null)[]
  workspaceStatus: IndexStatus | null
}

const sourceLookups = new Map<string, CachedSourceLookup>()

/**
 * The revision of both layers, and the scan readings the key was made from.
 *
 * It is deliberately a string rather than a number: two workspaces and two scans must not collide,
 * and this is compared with `===` against the exact string that built the cached entry.
 */
function sourceRevision(workspaceId: string): {
  key: string
  registered: ReturnType<typeof listRepositories>
  statuses: (IndexStatus | null)[]
  workspaceStatus: IndexStatus | null
} {
  const registered = listRepositories(workspaceId)
  const statuses = registered.map((repo) => indexStatus(workspaceId, repo.id))
  // The workspace scan is only counted when the project registers no repository, exactly as
  // `stampOfTheCountedScans` and `scansToRead` do. A project with repositories never reads it.
  const workspaceStatus = registered.length === 0 ? indexStatus(workspaceId) : null

  const parts: string[] = [`workspace\u0000${workspaceId}`]
  for (let i = 0; i < registered.length; i++) {
    const repo = registered[i]!
    const status = statuses[i]!
    parts.push(
      `repository\u0000${repo.id}\u0000${repo.name}\u0000${repo.root ?? ''}\u0000${repo.updatedAt}\u0000` +
        `${status === null ? 'none' : `${status.builtAt}\u0000${String(status.fileCount)}`}`,
    )
  }
  if (workspaceStatus !== null) {
    parts.push(`workspace-scan\u0000${workspaceStatus.builtAt}\u0000${String(workspaceStatus.fileCount)}`)
  } else if (registered.length === 0) {
    parts.push('workspace-scan\u0000none')
  }

  // The canonical layer: the module records the lookup answers about, in coverage's own order.
  for (const module of listRecords({ workspaceId, kind: 'module' })) {
    parts.push(`module\u0000${module.id}\u0000${module.title}\u0000${module.updatedAt}\u0000${module.deletedAt ?? ''}`)
  }
  // And the rows that say whose code each file is. `statedInRepository` reads every live row in a
  // registered repository, including a guessed one, so an acceptance that changes what a claim means
  // is part of the key even though it writes no module field.
  for (const repo of registered) {
    for (const row of statedInRepository(repo.id, workspaceId)) {
      parts.push(
        `row\u0000${row.id}\u0000${row.recordId}\u0000${row.repositoryId}\u0000${row.pattern}\u0000${row.relation}\u0000` +
          `${row.provenance}\u0000${row.acceptedAt ?? ''}\u0000${row.acceptedBy ?? ''}\u0000${row.statedAt}`,
      )
    }
  }

  return { key: parts.join('\u0001'), registered, statuses, workspaceStatus }
}

/**
 * The stamp of the scans a lookup is counted against, worked out from the revision's readings.
 *
 * These are the same two cases `stampOfTheCountedScans` answers. The refusal path asks that
 * function so the 404 or 409 keeps its exact words: it is taken only when no scan is stored, and an
 * answer nobody can compute has nothing to cache.
 */
function stampOfTheRevision(
  workspaceId: string,
  revision: { registered: ReturnType<typeof listRepositories>; statuses: (IndexStatus | null)[]; workspaceStatus: IndexStatus | null },
): SourceIndexStamp {
  if (revision.registered.length === 0) {
    return revision.workspaceStatus === null ? stampOfTheCountedScans(workspaceId) : sourceStamp(revision.workspaceStatus)
  }
  const stored = revision.statuses.filter((status): status is IndexStatus => status !== null)
  return stored.length === 0
    ? stampOfTheCountedScans(workspaceId)
    : oldestScan(stored.map((status) => sourceStamp(status)))
}

/** What `scansToRead` in lib/source-lookup.ts would have read, from the revision's statuses. */
function scansOfTheRevision(
  workspaceId: string,
  revision: { registered: ReturnType<typeof listRepositories>; statuses: (IndexStatus | null)[] },
): { scans: CachedSourceLookup['scans']; notRead: SourceLookup['notRead'] } {
  if (revision.registered.length === 0) {
    return { scans: [{ repository: null, files: listIndexedFiles(workspaceId) }], notRead: [] }
  }
  const scans: CachedSourceLookup['scans'] = []
  const notRead: SourceLookup['notRead'] = []
  for (let i = 0; i < revision.registered.length; i++) {
    const repo = revision.registered[i]!
    const repository: RepositoryNamed = { id: repo.id, name: repo.name }
    if (revision.statuses[i] === null) {
      notRead.push({ repository, because: `No scan of the repository "${repo.name}" is stored, so its files were not read.` })
    } else {
      scans.push({ repository, files: listIndexedFiles(workspaceId, repo.id) })
    }
  }
  return { scans, notRead }
}

/** The cached derived answer for this revision, or the one this call builds and keeps. */
function cachedSourceLookup(
  workspaceId: string,
  revision: ReturnType<typeof sourceRevision>,
): CachedSourceLookup {
  const held = sourceLookups.get(workspaceId)
  if (held !== undefined && held.revision === revision.key) return held
  const { scans, notRead } = scansOfTheRevision(workspaceId, revision)
  // Coverage is the expensive reading, and it is the one that defines a claim. Ask it once, here,
  // rather than reimplementing how a stated row is counted against a repository.
  const modules = coverage(workspaceId).modules
  const built: CachedSourceLookup = {
    revision: revision.key,
    scans,
    notRead,
    modules,
    registered: revision.registered,
    statuses: revision.statuses,
    workspaceStatus: revision.workspaceStatus,
  }
  sourceLookups.set(workspaceId, built)
  return built
}

// ============================================================================ the match loop over the cached answer

/** How a file matched the name, best first. The same three rules, and the same order, as lib/source-lookup.ts. */
const MATCH_ORDER: readonly FileMatch[] = ['path end', 'export', 'file name']

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

/**
 * `lookUp`, over the cached derived answer. The rules, ranking, limit, subtraction and `noAnswer`
 * are copied from lib/source-lookup.ts rather than restated in different words: this function must
 * answer exactly what that one answers, and the new test compares them on a made-up index.
 */
function lookUpInTheCache(cached: CachedSourceLookup, name: string, limit = 20): SourceLookup {
  const { scans, notRead, modules: claimed } = cached

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

// ============================================================================ the path filter

/**
 * Is this file at, or under, that prefix?
 *
 * WHOLE SEGMENTS, never a substring: "src/web" answers for src/web/App.tsx and must NOT answer
 * for src/webhooks.ts. A filter that quietly swept in the neighbouring directory would give a
 * coverage answer that is wrong in the direction nobody checks.
 *
 * This is deliberately the same rule as `filesMatching` in lib/sourceindex.ts, which resolves a
 * module's claims — one repository, one meaning for "under src/web", or `?path=src/web` and a
 * claim of `src/web` would disagree about the same files. It is not that function only because
 * that function is exported as `_internals`, marked for tests alone; the two are pinned against
 * each other in tests/surface-fixes.test.ts so they cannot drift apart in silence. Exporting
 * `filesMatching` properly and deleting this would be the better end state — lib/sourceindex.ts
 * belongs to another agent this phase.
 */
function underPath(filePath: string, prefix: string): boolean {
  return filePath === prefix || filePath.startsWith(`${prefix}/`)
}

/** "src/web/", "./src/web" and "src/web" are one prefix. Written once so both uses agree. */
function cleanPrefix(prefix: string): string {
  return prefix.trim().replace(/^\.\//, '').replace(/\/+$/, '')
}

// ============================================================================ each repository's own scan

/**
 * THE SCAN OF EACH REGISTERED REPOSITORY, put into its own slot by the one writer of that slot.
 *
 * Decision 0KSoGUNDF9ml says each workspace scan records the repository it scanned. A repository's
 * stored scan is the rows under its id, and `rebuildRepository` in lib/implementation.ts is what
 * writes them, so this calls it rather than writing a second copy of the same scan somewhere else
 * (message VNOIBKwRSVlk). A repository with no checkout here is not scanned and says so; a
 * checkout the office refuses to read says the refusal's own words. Anything else is not caught.
 */
function scanEachRepository(workspaceId: string, actor: Actor): ReindexResponse['repositories'] {
  return listRepositories(workspaceId).map((repo) => {
    const repository: RepositoryNamed = { id: repo.id, name: repo.name }
    if (repo.root === null) {
      return { repository, scanned: false as const, because: `"${repo.name}" has no checkout on this machine, so there is nothing to scan.` }
    }
    try {
      const built = rebuildRepository({ workspaceId, repositoryId: repo.id, actor })
      return { repository, scanned: true as const, builtAt: built.builtAt, fileCount: built.fileCount }
    } catch (error) {
      if (!(error instanceof PanelError)) throw error
      return { repository, scanned: false as const, because: error.message }
    }
  })
}

/**
 * ?module= IN A PROJECT WITH REGISTERED REPOSITORIES: every stated row counted against the stored scan
 * of the repository it names, by `claimsByRepository`. The workspace scan is never counted here,
 * because it does not record which repository it is of; when no repository of the project has a
 * stored scan, the answer is a refusal that says how to scan them.
 */
function moduleByRepository(
  record: PanelRecord,
  workspaceId: string,
  registered: ReturnType<typeof listRepositories>,
  narrow: (list: ClaimedSourceFile[], listIs: string) => { files: ClaimedSourceFile[]; filter?: SourcePathFilter },
): ModuleSourceResponse {
  const stored = requireARepositoryScan(workspaceId, registered)

  const byRepository = claimsByRepository(record)
  const counted = byRepository.repositories.filter((entry) => entry.scan !== null)
  const index =
    counted.length > 0 ? oldestScan(counted.map((entry) => entry.scan!)) : oldestScan(stored.map((status) => sourceStamp(status)))

  const files: ClaimedSourceFile[] = []
  for (const entry of counted) {
    const byPath = new Map(listIndexedFiles(workspaceId, entry.repository.id).map((file) => [file.path, file]))
    for (const path of entry.files) {
      const file = byPath.get(path)
      // Every matched path came out of this same repository's scan a moment ago.
      if (file === undefined) throw new Error(`unreachable: ${path} matched ${entry.repository.name}'s scan and is not in it`)
      files.push({ ...file, repository: entry.repository })
    }
  }
  const claims = counted.flatMap((entry) => entry.claims)
  const paths = byRepository.inMoreThanOne

  return {
    index,
    module: { id: record.id, title: record.title },
    claims,
    ...narrow(files, 'files this module claims'),
    staleClaims: claims.filter((claim) => claim.matched.length === 0),
    problem: problemOfTheRepositories(byRepository),
    repositories: byRepository.repositories,
    inMoreThanOne: {
      paths,
      note:
        paths.length === 0
          ? 'No path is claimed by this module in more than one repository.'
          : `${paths.length === 1 ? '1 path is' : `${paths.length} paths are`} claimed by this module in more than one ` +
            'repository, because a row in each of them states it, and each is counted once in every repository that ' +
            'states it. `files` lists each of them once per repository.',
    },
  }
}

// ============================================================================ routes

export async function sourceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The index, or the files one module claims.
   *
   * Both live on one path because they are the same list seen through two lenses, and a caller
   * who has the index in hand should not have to learn a second endpoint to narrow it.
   */
  app.get('/source', route('source.read', 'remote'),
    async (req): Promise<SourceIndexResponse | ModuleSourceResponse> => {
    const query = parse(sourceQuery, req.query, 'The query string is not usable:')
    const workspaceId = workspaceOf(req)
    // A project with registered repositories answers ?module= from each repository's own stored
    // scan and never from the workspace scan, so only the other two answers need the workspace scan.
    const registered = query.module === undefined ? [] : listRepositories(workspaceId)
    const stamp = registered.length === 0 ? sourceStamp(requireIndex(workspaceId)) : null
    const files = registered.length === 0 ? listIndexedFiles(workspaceId) : []

    /**
     * Narrow a file list by `?path=`, and say what that did.
     *
     * The whole index is already in memory by the time this runs, so the filter costs one pass
     * over an array. It exists because without it the only way to ask about one directory was to
     * fetch all of it and filter in the caller — which every caller then does slightly
     * differently, and one of them eventually matches src/webhooks.ts for "src/web".
     */
    function narrow<F extends SourceFile>(list: F[], listIs: string): { files: F[]; filter?: SourcePathFilter } {
      if (query.path === undefined) return { files: list }
      const prefix = cleanPrefix(query.path)
      const kept = list.filter((file) => underPath(file.path, prefix))
      const segments = 'A prefix is matched on whole path segments, so "src/web" never answers for src/webhooks.ts.'
      return {
        files: kept,
        filter: {
          path: prefix,
          matched: kept.length,
          of: list.length,
          note:
            kept.length === 0
              ? `None of the ${list.length} ${listIs} is at or under "${prefix}", so \`files\` is empty for that ` +
                `reason and not because there is no code there. ${segments}`
              : `${kept.length} of the ${list.length} ${listIs} are at or under "${prefix}". ${segments}`,
        },
      }
    }

    if (query.module === undefined) return { index: stamp!, ...narrow(files, 'files in the index') }

    // Resolved here rather than through `filesFor` in lib/, which takes an id OR a title: this
    // endpoint documents itself as taking the id from GET /api/records?kind=module, and the
    // refusals below say which record could not be used and where the usable ids are.
    // A module in ANOTHER workspace is answered exactly as a module that does not exist. It is not
    // "you may not read this" — nothing here authenticates anybody — it is that this endpoint
    // resolves the claims of a module against THIS project's index, and a module from another
    // project has never described this checkout. Naming it as present-but-elsewhere would also
    // leak one project's record ids into another's refusals for no gain.
    const noLiveRecordHere = (): PanelError =>
      new PanelError(
        `No live record with id ${query.module} in workspace "${workspaceId}". The ids of the modules that can ` +
          'claim source are in GET /api/records?kind=module, which answers about the workspace this request names.',
        404,
      )
    // A MESSAGE THE CALLER MAY NOT READ IS ANSWERED AS AN ID THAT NAMES NOTHING, in the same words, and not
    // as a record of the wrong kind, whose refusal below quotes its title.
    refuseAMessageThisReaderMayNotRead(theMessageReader(actorFrom(req)), query.module, noLiveRecordHere)
    const record = getRecord(query.module)
    if (record === null || record.deletedAt !== null || record.workspaceId !== workspaceId) throw noLiveRecordHere()
    if (record.kind !== 'module') {
      throw new PanelError(
        `Record ${record.id} is a ${record.kind}, not a module: "${record.title}". Only a module claims source ` +
          'files, because a module is the thing that carries responsibility for a subsystem.',
        400,
      )
    }

    if (stamp === null) return moduleByRepository(record, workspaceId, registered, narrow)

    // Resolved against the WHOLE index, before any ?path= narrowing. See the note on
    // ModuleSourceResponse.filter: a claim's health is a fact about the repository, and
    // resolving it against a slice would call a live claim stale for as long as the filter was on.
    const resolved = claimsOf(record, files.map((file) => file.path))
    const byPath = new Map(files.map((file) => [file.path, file]))
    const claimed = resolved.files.map((path) => {
      const file = byPath.get(path)
      // Every matched path came out of this same list a moment ago.
      if (file === undefined) throw new Error(`unreachable: ${path} matched the index and is not in it`)
      return file
    })

    return {
      index: stamp,
      module: { id: record.id, title: record.title },
      claims: resolved.claims,
      ...narrow(claimed, 'files this module claims'),
      staleClaims: resolved.claims.filter((claim) => claim.matched.length === 0),
      problem: resolved.problem,
    }
  })

  /**
   * Unclaimed files, stale claims, and the percentage claimed.
   *
   * This is the unconsumed-results query one level down: a file no module claims is code nobody
   * has taken responsibility for, and a claim that matches nothing is a module describing a
   * repository that has moved on. Both are computed on read, from the index and the module
   * records — neither is stored, for the same reason completeness is not.
   */
  app.get('/source/coverage', route('source.read', 'remote'), async (req): Promise<SourceCoverageResponse> => {
    const workspaceId = workspaceOf(req)
    return { index: stampOfTheCountedScans(workspaceId), coverage: coverage(workspaceId) }
  })

  /**
   * Where a name is, from the source index, before anybody searches the repository.
   *
   * A file matches by a path end, an export or its file name, and a module by its title or id; the
   * rules are in lib/source-lookup.ts. A name nothing matches is a 200 with `answered: false` and
   * `noAnswer` saying so, because "the index does not know it" is an answer and the caller searches
   * next. A claim that matches no file in the scan is listed as stale and never given as a file.
   */
  app.get('/source/where', route('source.read', 'remote'), async (req): Promise<SourceWhereResponse> => {
    const query = parse(whereQuery, req.query, 'The query string is not usable:')
    const workspaceId = workspaceOf(req)
    // Read both layers' revision first, then the stamp, then the derived answer. The stamp comes
    // before the cache is built so a missing index keeps its 404 and a project with no stored
    // repository scan keeps its 409, in the same words as every other source door.
    const revision = sourceRevision(workspaceId)
    const index = stampOfTheRevision(workspaceId, revision)
    return { index, ...lookUpInTheCache(cachedSourceLookup(workspaceId, revision), query.name, query.limit) }
  })

  /**
   * Rebuild the index, and say what changed since the last scan.
   *
   * This is the ONLY write in this file. It replaces every row: the index is derived, so there
   * is nothing in it worth merging. The answer carries the whole comparison against the previous
   * scan, because a caller holding an older reading needs to know which parts of it survived.
   *
   * The rebuild is attributed to whoever asked, like every other write. It is not written to
   * `changes`, for the reason `reader_anchors` in db/schema.ts gives: `changes` is the daily view, and a rebuild is not
   * something that happened to a record. Who rebuilt it, and when, is answerable from the stamp.
   */
  app.post('/source/reindex', route('source.index', 'remote'), async (req): Promise<ReindexResponse> => {
    const actor: Actor = actorFrom(req)
    // THE ELEVENTH NO-BODY ROUTE, and it had this right before the others did — its own schema was the
    // shape they were all copied from. It goes through the shared check now so that the query string
    // is covered too: `POST /api/source/reindex?totalNonsense=42` was a 200.
    takesNoInput(
      req,
      'POST /api/source/reindex',
      'It rebuilds the index from the repository and there is nothing to configure. Nothing typed by hand ' +
        'can enter this index — it is derived, and the next scan would delete it. What a module is responsible ' +
        'for is stated as rows of the implementation map, through POST /api/implementation.',
    )

    // The scan lands in the workspace this request names, and replaces only that workspace's rows.
    // Measured before the index was scoped: a rebuild under a second project's root replaced
    // `source_index` and `source_files` wholesale, and all 152 claims of the first project were
    // then reported stale. What is STILL one per process is the root itself — MOLE_OFFICE_REPO_ROOT —
    // so a second project's index has to be built by a process started against its checkout. That
    // is a product decision left open rather than a gap this route hides.
    const workspaceId = workspaceOf(req)
    const outcome = rebuildIndex({ workspaceId, actor })
    return { index: sourceStamp(outcome), changes: outcome.report, repositories: scanEachRepository(workspaceId, actor) }
  })
}

// ============================================================================ discoverability

/**
 * One sentence per endpoint of this file, keyed the way the maps in api/kinds.ts are keyed.
 *
 * A VIEW, NOT A SECOND COPY. The sentences are written once, in DERIVED_ROUTE_NOTES in
 * api/kinds.ts, which is what GET /api reads; this picks out the ones that describe the routes
 * below. It used to hold its own wording, waiting to be pasted into that file, and a second
 * hand-maintained copy of anything is the exact defect this phase is fixing — two copies agree
 * until the day one of them is edited, and nothing fails when they stop.
 *
 * Picking is deliberately strict: a key that is not in DERIVED_ROUTE_NOTES throws at import
 * rather than yielding a shorter map, because a missing sentence is what leaves an endpoint
 * undiscoverable. tests/source-api.test.ts pins the keys here against the routes actually
 * registered below, so a new route with no sentence fails the suite.
 *
 * api/kinds.ts is safe to import from here: it reaches nothing but src/shared/ and fastify's
 * types, so it cannot drag a second database connection into this file.
 */
export const SOURCE_ROUTE_NOTES: Readonly<Record<string, string>> = Object.fromEntries(
  ['GET /api/source', 'GET /api/source/coverage', 'GET /api/source/where', 'POST /api/source/reindex'].map((key) => {
    const note = DERIVED_ROUTE_NOTES[key]
    if (note === undefined) {
      throw new Error(
        `DERIVED_ROUTE_NOTES in src/server/api/kinds.ts has no line for ${key}, so GET /api would list it with ` +
          'no description. Write the sentence there, not here.',
      )
    }
    return [key, note]
  }),
)
