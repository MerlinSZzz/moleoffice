// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE IMPLEMENTATION MAP OVER HTTP: WHERE DOES THIS PROJECT MEANING EXIST IN THE IMPLEMENTED WORLD?
 *
 *   GET    /api/implementation/repositories       which repositories, with roots and index ages
 *   POST   /api/implementation/repositories       register one
 *   PATCH  /api/implementation/repositories/:id   rename, re-point the root, change the note
 *   DELETE /api/implementation/repositories/:id   refused while any AUTHORED row references it
 *   GET    /api/implementation/record/:id         what is this record implemented by
 *   GET    /api/implementation/resource           what does this file serve
 *   POST   /api/implementation                    declare or propose a relationship
 *   DELETE /api/implementation/:id                soft-delete one
 *   POST   /api/implementation/:id/accept         only a person may accept a guess
 *   POST   /api/implementation/rebuild            rebuild the index and the findings
 *   GET    /api/implementation/revisions          code revisions for a repository
 *   POST   /api/implementation/revisions          record one
 *
 * ---------------------------------------------------------------------------------------
 * THIS FILE IS ROUTES. THE MAP ITSELF IS src/server/lib/implementation.ts
 * ---------------------------------------------------------------------------------------
 *
 * Everything here works out who is asking, checks the input, decides the HTTP status and shapes the
 * response. It walks nothing and stores nothing. `api/source.ts` records what happened the last
 * time a route file grew its own copy of the layer beneath it, and this file does not repeat it.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO READS EACH SAY WHAT THEY LEFT OUT, AND `notLookedFor` IS THE FIFTH INVARIANT ON THE WIRE
 * ---------------------------------------------------------------------------------------
 *
 * Both reads carry `notLookedFor`: every provenance with no producer in this build. An absent
 * build-graph relationship is then never readable as *there is none*. It is computed from
 * `PROVENANCE` in @shared/implementation.ts rather than typed, so a resolver landing shortens it in
 * the same commit that adds the producer.
 *
 * And both carry wave 1's disclosure shape when they narrow: `GET /api/implementation/record/:id`
 * pages its file lists, and a page is a `budget` narrowing that declares its own arithmetic.
 * `checkSubtraction` throws rather than reporting, so a reader that quietly dropped one member
 * cannot ship a shorter list as a complete answer.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `GET /api/source` IS STILL HERE
 * ---------------------------------------------------------------------------------------
 *
 * The design retires `GET /api/source`, `GET /api/source/coverage` and `POST /api/source/reindex`
 * and replaces them with routes here. THEY ARE NOT RETIRED YET. They read this map now: a module's
 * claims are its stated rows, read by `claimsOf` in lib/sourceindex.ts through `statedFor`. When
 * the project holds no registered repository, `GET /api/source?module=` counts them against the
 * workspace scan that `POST /api/source/reindex` builds. Otherwise it counts each row against the
 * stored scan of the repository the row names (decision 0KSoGUNDF9ml), and so do coverage, the
 * unclaimed list and the work domains, through `claimsByRepository` and `storedScanOf`. What those
 * routes still own is the workspace scan and the reads over it.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { filesMatching } from '@shared/paths.ts'
import { AUTHORITY_SAYS, notLookedFor, PROVENANCE, type Authority, type Provenance } from '@shared/implementation.ts'
import { checkSubtraction, type LeftOutCounts, type LeftOutGroup } from '@shared/disclosure.ts'
import { sayItWasDoneFromAnotherComputer } from '../lib/changed-from-another-computer.ts'
import { getRecord } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { refuseAMessageThisReaderMayNotRead, theMessageReader } from '../lib/messages.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import {
  acceptGuess,
  alsoSuggestedFor,
  declareRelationship,
  filesInRepository,
  findingsFor,
  findingsForPath,
  listRevisions,
  rebuildRepository,
  recordRevision,
  retireRelationship,
  type Finding,
  type RebuiltRepository,
  type StatedRelationship,
} from '../lib/implementation.ts'
import { statedFor } from '../db/stated-for.ts'
import { statedInRepository } from '../db/stated-in-repository.ts'
import {
  deleteRepository,
  everScanned,
  registerRepository,
  updateRepository,
} from '../lib/repositories.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { repositoryById } from '../db/repository-by-id.ts'
import { sqlite } from '../db/client.ts'

/**
 * HOW MANY FILES ONE ANSWER WILL LIST BEFORE IT FOLDS THEM.
 *
 * The fold is what stops a file tree reaching a screen: the matched paths of one row are folded to
 * their deepest common directory with a count, so a pattern matching 577 files is one line rather
 * than 577. This ceiling is the OTHER half — when a level really does hold more entries than a
 * person can read, the reply carries a page and says so in the disclosure shape.
 */
const PAGE = 20

// ============================================================================ shapes

/** One repository as this API answers about it, with what is known about its index. */
export interface RepositoryOut {
  id: string
  name: string
  note: string | null
  /** The absolute path on this machine, or null because there is no checkout of it here. */
  root: string | null
  hasRoot: boolean
  indexed: boolean
  builtAt: string | null
  fileCount: number
  createdAt: string
  createdBy: string
}

function repositoryOut(id: string, workspaceId: string): RepositoryOut {
  const repo = repositoryById(id, workspaceId)
  if (repo === null) throw new PanelError(`No repository ${id} in this project.`, 404)
  const stamp = sqlite
    .prepare('SELECT built_at FROM source_index WHERE workspace_id = ? AND repository_id = ?')
    .get(workspaceId, id) as { built_at: string } | undefined
  return {
    id: repo.id,
    name: repo.name,
    note: repo.note,
    root: repo.root,
    hasRoot: repo.root !== null,
    indexed: stamp !== undefined,
    builtAt: stamp?.built_at ?? null,
    fileCount: filesInRepository(workspaceId, id).length,
    createdAt: repo.createdAt,
    createdBy: repo.createdBy,
  }
}

/** What a normal reader is told about one row, without asking: a word, a glyph, and the meaning. */
function says(authority: Authority): { word: string; glyph: string; meaning: string } {
  return AUTHORITY_SAYS[authority]
}

/** The six provenance values nothing in this build produces, with the words the surface draws. */
function nobodyHasLooked(): NobodyLooked[] {
  return notLookedFor().map((p) => ({ provenance: p, phrase: PROVENANCE[p].phrase, refused: PROVENANCE[p].refused }))
}

/** One stated row on the wire, with what it covers now and how its matches fold. */
export interface StatedOut {
  rowId: string
  pattern: string
  relation: string
  provenance: Provenance
  authority: Authority
  says: { word: string; glyph: string; meaning: string }
  statedBy: string
  statedAt: string
  acceptedBy: string | null
  acceptedAt: string | null
  note: string | null
  revisionId: string | null
  matched: number
  /**
   * THE ROLL-UP, AND IT IS WHAT STOPS A FILE TREE REACHING A SCREEN.
   *
   * The matched paths are folded to their deepest common directory with a count. Measured: a
   * module's 577 matched files fold to 4 lines, one per pattern.
   */
  directories: { path: string; files: number }[]
  /** Set when the pattern matches nothing NOW. A stale row keeps its words, its author and its date. */
  stale: boolean
  /**
   * The longest prefix of the pattern that is still a directory in the index.
   *
   * WHAT TURNS A MYSTERY INTO A RENAME. A pattern of `src/web/components/PanelGrid.tsx` that has
   * become `src/web/components/grid/PanelGrid.tsx` reports that `src/web/components` still exists.
   * Null when nothing of it survives, or when the row is not stale.
   */
  nearestThatExists: string | null
}

/** The deepest common directory of a set of paths, with the count. One line per row. */
function foldToDirectories(paths: readonly string[]): { path: string; files: number }[] {
  if (paths.length === 0) return []
  const first = paths[0]
  if (first === undefined) return []
  let common = first.split('/').slice(0, -1)
  for (const path of paths) {
    const parts = path.split('/').slice(0, -1)
    let shared = 0
    while (shared < common.length && shared < parts.length && common[shared] === parts[shared]) shared += 1
    common = common.slice(0, shared)
  }
  return [{ path: common.join('/') || '.', files: paths.length }]
}

/** The longest prefix of a pattern that is still a directory somewhere in the file list. */
function nearestThatExists(pattern: string, paths: readonly string[]): string | null {
  const parts = pattern.replace(/^\.\//, '').replace(/\/+$/, '').split('/')
  for (let take = parts.length - 1; take > 0; take -= 1) {
    const prefix = parts.slice(0, take).join('/')
    if (prefix.includes('*') || prefix.includes('?')) continue
    if (paths.some((path) => path === prefix || path.startsWith(`${prefix}/`))) return prefix
  }
  return null
}

function statedOut(row: StatedRelationship, paths: readonly string[]): StatedOut {
  const matched = filesMatching(row.pattern, paths)
  return {
    rowId: row.id,
    pattern: row.pattern,
    relation: row.relation,
    provenance: row.provenance,
    authority: row.authority,
    says: says(row.authority),
    statedBy: row.statedBy,
    statedAt: row.statedAt,
    acceptedBy: row.acceptedBy,
    acceptedAt: row.acceptedAt,
    note: row.note,
    revisionId: row.revisionId,
    matched: matched.length,
    directories: foldToDirectories(matched),
    stale: paths.length > 0 && matched.length === 0,
    nearestThatExists: paths.length > 0 && matched.length === 0 ? nearestThatExists(row.pattern, paths) : null,
  }
}

/** One finding on the wire. The evidence is two facts; the sentence is the reader's to compose. */
export interface FindingOut {
  rowId: string
  path: string
  relation: string
  provenance: Provenance
  authority: Authority
  says: { word: string; glyph: string; meaning: string }
  evidencePath: string
  evidenceDetail: string
  builtAt: string
  /** How many OTHER records the same file was suggested for. What makes a shared file legible. */
  alsoSuggestedFor: number
}

function findingOut(finding: Finding, shared: ReadonlyMap<string, number>): FindingOut {
  return {
    rowId: finding.id,
    path: finding.path,
    relation: finding.relation,
    provenance: finding.provenance,
    authority: finding.authority,
    says: says(finding.authority),
    evidencePath: finding.evidencePath,
    evidenceDetail: finding.evidenceDetail,
    builtAt: finding.builtAt,
    alsoSuggestedFor: Math.max(0, (shared.get(finding.path) ?? 1) - 1),
  }
}

/**
 * WHAT THE THREE RECORD PAGES DRAW, AS ONE REPOSITORY'S WORTH OF IT.
 *
 * DECLARED HERE, WHERE THE ROUTE IS, AND IMPORTED AS A TYPE BY THE BROWSER. The same arrangement
 * `api/source.ts` and `components/ModuleSource.tsx` have used since the derived layer landed: an
 * `import type` is erased before the bundle is built, so nothing of the server reaches it, and the
 * surface cannot come to disagree with the route it is drawing. The handler below is ANNOTATED with
 * these types rather than inferring them, so a field the browser reads and the route stops sending
 * is a compile error rather than an `undefined` on a screen.
 */
export interface RepositoryImplementation {
  repository: { id: string; name: string; hasRoot: boolean }
  indexed: boolean
  /** How many files the STATED rows cover. Not the size of the repository. */
  fileCount: number
  /** How many stated rows match nothing today. */
  stale: number
  stated: StatedOut[]
  suggested: FindingOut[]
  proposed: StatedOut[]
  disagreements: FindingOut[]
}

/** One source with no producer in this build, with the words a surface draws for it. */
export interface NobodyLooked {
  provenance: Provenance
  phrase: string
  refused: string | null
}

/** The whole answer to *what is this record implemented by*. */
export interface RecordImplementationReply {
  record: { id: string; kind: string; title: string }
  repositories: RepositoryImplementation[]
  counts: LeftOutCounts
  leftOut: LeftOutGroup<'page'>[]
  notLookedFor: NobodyLooked[]
  note: string
}

/**
 * EVERY REPOSITORY IN THIS PROJECT, WITH WHAT IS KNOWN ABOUT EACH ONE'S INDEX.
 *
 * NAMED SO THE BROWSER CAN HOLD IT. The Repositories panel in Settings imports this and the two
 * below; without a name, the panel would restate the shape and the two would be free to disagree,
 * which is the defect `CLAUDE.md` names as this repository's own.
 */
export interface RepositoriesReply {
  repositories: RepositoryOut[]
  note: string
}

/** What comes back when a repository is registered. It is NOT scanned by this call. */
export interface RepositoryRegisteredReply {
  repository: RepositoryOut
  note: string
}

/** What comes back from a rebuild: one entry per repository scanned, and the server's sentence. */
export interface RebuiltReply {
  built: RebuiltRepository[]
  note: string
}

/**
 * What comes back when somebody says a record is implemented, tested or configured by some code.
 *
 * `matched` IS COUNTED NOW, so the writer sees at once whether the pattern hit anything, and
 * `indexBuilt` tells a pattern that matched nothing from a repository nothing has ever scanned.
 */
export interface DeclaredReply {
  row: StatedRelationship
  says: { word: string; glyph: string; meaning: string }
  matched: number
  indexBuilt: boolean
  note: string
}

/** What comes back when a person accepts a guess. */
export interface AcceptedReply {
  row: StatedRelationship
  says: { word: string; glyph: string; meaning: string }
  note: string
}

// ============================================================================ input shapes

const declareBody = z.strictObject({
  recordId: z.string().trim().min(1, { error: 'recordId is the id of the module, block or pipeline this is about' }),
  repositoryId: z.string().trim().min(1, { error: 'repositoryId names the tree the pattern is relative to' }),
  pattern: z.string().trim().min(1, { error: 'pattern is repository-relative, such as "src/server/lib"' }),
  relation: z.string().trim().optional(),
  note: z.string().nullish(),
  revisionId: z.string().nullish(),
  proposing: z.boolean().optional(),
})

const repositoryBody = z.strictObject({
  name: z.string().trim().min(1, { error: 'name is what a person reads: "mole-office", "calibration"' }),
  root: z.string().nullish(),
  note: z.string().nullish(),
})

const patchRepositoryBody = z.strictObject({
  name: z.string().trim().optional(),
  root: z.string().nullish(),
  note: z.string().nullish(),
})

const revisionBody = z.strictObject({
  repositoryId: z.string().trim().min(1),
  ref: z.string().trim().min(1, { error: 'ref is the identifier your tooling uses. Mole Office stores it and never resolves it.' }),
  label: z.string().nullish(),
  note: z.string().nullish(),
})

const rebuildBody = z.strictObject({ repository: z.string().trim().optional() })

const resourceQuery = z.strictObject({
  repository: z.string().trim().min(1, { error: 'repository is the id of a registered repository' }),
  path: z.string().trim().min(1, { error: 'path is repository-relative, such as "src/server/lib/records.ts"' }),
})

const recordQuery = z.strictObject({
  under: z.string().trim().optional(),
  page: z.coerce.number().int().min(0).optional(),
})

// ============================================================================ routes

export async function implementationRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------- repositories

  app.get('/implementation/repositories', route('implementation.repositories', 'remote'), async (req): Promise<RepositoriesReply> => {
    const workspaceId = workspaceOf(req)
    const repositories = listRepositories(workspaceId).map((repo) => repositoryOut(repo.id, workspaceId))
    return {
      repositories,
      note:
        repositories.length === 0
          ? 'No repository is registered in this project, so no pattern has a tree to resolve ' +
            'against. The Repositories panel in Settings registers one, and so does POST ' +
            '/api/implementation/repositories.'
          : `${repositories.length} repositor${repositories.length === 1 ? 'y' : 'ies'}. A repository with no root ` +
            `is a real state: it is named, there is no checkout of it on this machine, it can hold relationships ` +
            `and be read, and it cannot be scanned.`,
    }
  })

  app.post('/implementation/repositories', route('implementation.repository-write', 'local', {
    because: 'acts-on-this-machine',
    act: 'Registering a folder of code on this computer',
  }), async (req, reply): Promise<RepositoryRegisteredReply> => {
    const workspaceId = workspaceOf(req)
    const body = parse(repositoryBody, req.body, 'This repository was not registered:')
    const repo = registerRepository({
      workspaceId,
      name: body.name,
      root: body.root ?? null,
      note: body.note ?? null,
      actor: actorFrom(req),
    })
    reply.code(201)
    return {
      repository: repositoryOut(repo.id, workspaceId),
      note:
        `"${repo.name}" is registered and has no index yet. It is NOT scanned by this call — a scan started by a ` +
        `write would make the index's own date mean "when somebody last saved a form". Scan now on its row in ` +
        `Settings builds one, and so does POST /api/implementation/rebuild.`,
    }
  })

  app.patch('/implementation/repositories/:id', route('implementation.repository-write', 'local', {
    because: 'acts-on-this-machine',
    act: 'Pointing a repository at a different folder on this computer',
  }), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = req.params as { id: string }
    const body = parse(patchRepositoryBody, req.body, 'This repository was not changed:')
    const out = updateRepository({
      id,
      workspaceId,
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.note === undefined ? {} : { note: body.note }),
      ...(body.root === undefined ? {} : { root: body.root }),
      actor: actorFrom(req),
      theAct: theActKeptHere(req),
    })
    return { repository: repositoryOut(id, workspaceId), wasRoot: out.wasRoot, dropped: { indexedFiles: out.droppedIndexFiles, findings: out.droppedFindings }, note: out.note }
  })

  app.delete('/implementation/repositories/:id', route('implementation.repository-write', 'local', {
    because: 'acts-on-this-machine',
    act: 'Deleting a repository and everything read out of its folder',
  }), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = req.params as { id: string }
    return deleteRepository(id, workspaceId, actorFrom(req))
  })

  // -------------------------------------------------------------- the two reads

  /**
   * WHAT DOES THIS FILE SERVE? The forward direction.
   *
   * `indexed: false` IS A REAL ANSWER AND IS NOT AN ERROR. A path a person typed that the scan
   * never saw — because it is ignored by a `.gitignore`, begins with an underscore, or is not a
   * source extension — still has relationships and still answers. *No module owns this* and *the
   * index does not cover this kind of file* must never look alike.
   */
  app.get('/implementation/resource', route('implementation.resource', 'remote'), async (req) => {
    const workspaceId = workspaceOf(req)
    const query = parse(resourceQuery, req.query, 'The query string is not usable:')
    const repository = repositoryById(query.repository, workspaceId)
    if (repository === null) throw new PanelError(`No repository ${query.repository} in this project.`, 404)

    const paths = filesInRepository(workspaceId, query.repository)
    const indexed = paths.includes(query.path)

    const serves = statedInRepository(query.repository, workspaceId)
      .filter((row) => filesMatching(row.pattern, [query.path]).length > 0)
      .map((row) => {
        const record = getRecord(row.recordId)
        return {
          recordId: row.recordId,
          kind: record?.kind ?? null,
          title: record?.title ?? null,
          relation: row.relation,
          authority: row.authority,
          says: says(row.authority),
          provenance: row.provenance,
          pattern: row.pattern,
          rowId: row.id,
          statedBy: row.statedBy,
        }
      })
      // A relationship whose record has been deleted is dropped, the way coverage already drops one.
      .filter((entry) => entry.title !== null)

    const shared = alsoSuggestedFor(query.repository, workspaceId)
    const suggested = findingsForPath(query.repository, query.path, workspaceId)
      .filter((finding) => getRecord(finding.recordId)?.deletedAt == null)
      .map((finding) => findingOut(finding, shared))

    return {
      repository: { id: repository.id, name: repository.name },
      path: query.path,
      indexed,
      serves,
      suggested,
      // THE COUNT OF OTHER RECORDS THAT ALSO SERVE THIS FILE, which is the fact behind I's "shared
      // resources". A count of 0 that COULD have been higher is still worth sending: it is what
      // makes the first non-zero one visible.
      sharedWith: Math.max(0, serves.length - 1),
      notLookedFor: nobodyHasLooked(),
      note: indexed
        ? `${serves.length} record${serves.length === 1 ? '' : 's'} state this file as theirs.`
        : `The index does not hold "${query.path}". That is not the same as no record owning it: the scan skips ` +
          `what .gitignore names, anything beginning with an underscore, and anything that is not a source ` +
          `extension. Any relationship stated about it is still listed above.`,
    }
  })

  /**
   * WHAT IS THIS RECORD IMPLEMENTED BY? The inverse, and what the three pages draw.
   *
   * THREE LISTS, NOT ONE WITH A FLAG ON EACH ROW, because they are three different things to do:
   *
   *   stated    — read it; change it if it is wrong.
   *   suggested — A QUESTION: nobody has claimed this file and this record's code imports it.
   *   proposed  — ACCEPT OR DELETE: an agent said this and nobody has answered.
   */
  app.get(
    '/implementation/record/:id',
    route('implementation.record', 'remote'),
    async (req): Promise<RecordImplementationReply> => {
      const workspaceId = workspaceOf(req)
      const { id } = req.params as { id: string }
      const query = parse(recordQuery, req.query, 'The query string is not usable:')
      // A MESSAGE THE CALLER MAY NOT READ IS REFUSED before its title can be quoted below, in the words an
      // id naming nothing gets, so the answer does not say it is there.
      const noRecordHere = (): PanelError => new PanelError(`No record ${id} in this project.`, 404)
      refuseAMessageThisReaderMayNotRead(theMessageReader(actorFrom(req)), id, noRecordHere)
      const record = getRecord(id)
      if (record === null) throw noRecordHere()
      if (record.workspaceId !== workspaceId) {
        // THE REFUSAL NAMES THE PROJECT THE RECORD IS REALLY IN, when there is one. Answering "no
        // such record" about a record that exists somewhere else sends a reader hunting for something
        // they can reach by sending one header, and `tests/by-id-boundary.test.ts` holds every route
        // with an id in its path to that.
        throw new PanelError(
          `Record ${id} — "${record.title}" — is in the project "${record.workspaceId}", not "${workspaceId}". ` +
            `Send x-mole-office-workspace: ${record.workspaceId} to ask about it. A relationship resolves against a ` +
            `repository of ITS OWN project, so answering across the boundary would resolve its patterns against a ` +
            `checkout it has never described.`,
          404,
        )
      }

      const rows = statedFor(id, workspaceId)
      const findings = findingsFor(id, workspaceId)
      const repositoryIds = [...new Set([...rows.map((r) => r.repositoryId), ...findings.map((f) => f.repositoryId)])]

      const page = query.page ?? 0
      const groups: LeftOutGroup<'page'>[] = []
      let candidates = 0
      let carried = 0

      const repositories = repositoryIds.map((repositoryId) => {
        const repo = repositoryById(repositoryId, workspaceId)
        const paths = filesInRepository(workspaceId, repositoryId)
        const shared = alsoSuggestedFor(repositoryId, workspaceId)
        const here = rows.filter((row) => row.repositoryId === repositoryId)
        const stated = here.filter((row) => row.authority === 'stated').map((row) => statedOut(row, paths))
        const proposed = here.filter((row) => row.authority === 'guessed').map((row) => statedOut(row, paths))
        const allSuggested = findings.filter((f) => f.repositoryId === repositoryId).map((f) => findingOut(f, shared))
        candidates += allSuggested.length
        const suggested = allSuggested.slice(page * PAGE, page * PAGE + PAGE)
        carried += suggested.length
        const dropped = allSuggested.filter((row) => !suggested.includes(row))
        if (dropped.length > 0) {
          groups.push({ cause: 'budget', bucket: 'page', count: dropped.length, ids: dropped.map((r) => r.rowId) })
        }
        return {
          repository:
            repo === null
              ? { id: repositoryId, name: 'a repository that is no longer registered', hasRoot: false }
              : { id: repo.id, name: repo.name, hasRoot: repo.root !== null },
          indexed: paths.length > 0,
          fileCount: stated.reduce((n, row) => n + row.matched, 0),
          stale: stated.filter((row) => row.stale).length,
          stated,
          suggested,
          proposed,
          // A DISAGREEMENT IS A RESOLVER POINTING AT A RECORD OTHER THAN THE ONE WHOSE STATED ROW
          // COVERS THE FILE. Measured 0 today, because every candidate is computed over uncovered
          // files only and so cannot yet contradict a claim. The list exists because the first
          // manifest resolver will produce some, and because a design with nowhere to put a
          // contradiction resolves it silently.
          disagreements: allSuggested.filter((row) => stated.some((s) => filesMatching(s.pattern, [row.path]).length > 0)),
        }
      })

      const counts: LeftOutCounts = {
        candidates,
        carried,
        leftOut: groups.reduce((n, g) => n + g.count, 0),
        shortened: 0,
      }
      // IT THROWS; IT DOES NOT REPORT. A reader that quietly dropped one member would otherwise ship
      // a shorter list as a complete answer.
      checkSubtraction('GET /api/implementation/record/:id', counts, groups)

      return {
        record: { id: record.id, kind: record.kind, title: record.title },
        repositories,
        counts,
        leftOut: groups,
        notLookedFor: nobodyHasLooked(),
        note:
          repositories.length === 0
            ? `Nothing has been said about which code "${record.title}" is. POST /api/implementation says it.`
            : `${counts.candidates === 0 ? 'No' : String(counts.candidates)} file${counts.candidates === 1 ? '' : 's'} ` +
              `nobody has claimed are imported by this record's code${counts.leftOut === 0 ? '' : `, and ${counts.leftOut} of them are on a later page`}.`,
      }
    },
  )

  // -------------------------------------------------------------- writes

  app.post('/implementation', route('implementation.write', 'remote'), async (req, reply): Promise<DeclaredReply> => {
    const workspaceId = workspaceOf(req)
    const body = parse(declareBody, req.body, 'This relationship was not written:')
    const out = declareRelationship({
      workspaceId,
      recordId: body.recordId,
      repositoryId: body.repositoryId,
      pattern: body.pattern,
      ...(body.relation === undefined ? {} : { relation: body.relation }),
      ...(body.note === undefined ? {} : { note: body.note }),
      ...(body.revisionId === undefined ? {} : { revisionId: body.revisionId }),
      ...(body.proposing === undefined ? {} : { proposing: body.proposing }),
      actor: actorFrom(req),
    })
    reply.code(201)
    return { row: out.row, says: says(out.row.authority), matched: out.matched, indexBuilt: out.indexBuilt, note: out.note }
  })

  // THE PERSON MAY ACCEPT FROM A PAIRED COMPUTER, with their own key over an encrypted door:
  // accepting writes one row in the database and reads no folder, so nothing on this machine is acted on. The two
  // doors around it that read this computer's folders, `implementation.rebuild` and `implementation.repository-write`,
  // stay here.
  app.post('/implementation/:id/accept', route('implementation.accept', 'local', {
    because: 'reserved-to-the-owner',
    act: "Accepting a machine's guess at a record's code",
    thePersonMayFromAnotherComputer: true,
  }), async (req): Promise<AcceptedReply> => {
    const workspaceId = workspaceOf(req)
    const { id } = req.params as { id: string }
    const out = acceptGuess(id, workspaceId, actorFrom(req), theActKeptHere(req))
    sayItWasDoneFromAnotherComputer(req, `A guess about which code record ${id} owns was accepted`)
    return { row: out.row, says: says(out.row.authority), note: out.note }
  })

  app.delete('/implementation/:id', route('implementation.write', 'remote'), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = req.params as { id: string }
    return retireRelationship(id, workspaceId, actorFrom(req))
  })

  app.post('/implementation/rebuild', route('implementation.rebuild', 'local', {
    because: 'acts-on-this-machine',
    act: 'Re-reading the folders of code on this computer',
  }), async (req): Promise<RebuiltReply> => {
    const workspaceId = workspaceOf(req)
    const body = parse(rebuildBody, req.body ?? {}, 'This rebuild did not start:')
    const actor = actorFrom(req)
    const wanted =
      body.repository === undefined
        ? listRepositories(workspaceId).filter((repo) => repo.root !== null)
        : [repositoryById(body.repository, workspaceId)].filter((r): r is NonNullable<typeof r> => r !== null)
    if (wanted.length === 0) {
      throw new PanelError(
        body.repository === undefined
          ? 'No repository in this project has a checkout on this machine, so there is nothing to scan. Register ' +
            'one with a root, or point an existing one at a directory.'
          : `No repository ${body.repository} in this project.`,
        404,
      )
    }
    const built = wanted.map((repo) => rebuildRepository({ workspaceId, repositoryId: repo.id, actor }))
    return {
      built,
      note: `${built.length} repositor${built.length === 1 ? 'y' : 'ies'} rebuilt. Nothing anybody stated was written or deleted: a rebuild reads that table and cannot write it.`,
    }
  })

  // -------------------------------------------------------------- code revisions

  app.get('/implementation/revisions', route('implementation.revisions', 'remote'), async (req) => {
    const workspaceId = workspaceOf(req)
    const query = parse(z.strictObject({ repository: z.string().trim().min(1) }), req.query, 'The query string is not usable:')
    return {
      revisions: listRevisions(query.repository, workspaceId),
      note: 'Mole Office stores each of these exactly as it was supplied and resolves none of them. It cannot say whether one is an ancestor of another, because that is Git’s question and Git owns implementation history.',
    }
  })

  app.post('/implementation/revisions', route('implementation.revisions-write', 'remote'), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const body = parse(revisionBody, req.body, 'This code revision was not recorded:')
    const revision = recordRevision({
      workspaceId,
      repositoryId: body.repositoryId,
      ref: body.ref,
      ...(body.label === undefined ? {} : { label: body.label }),
      ...(body.note === undefined ? {} : { note: body.note }),
      actor: actorFrom(req),
    })
    reply.code(201)
    return { revision, note: 'Stored as supplied. Mole Office never parses it, never resolves it and never orders two of them.' }
  })
}

/** Read by the API index so that every route here has a sentence. Not a second copy: a view. */
export const IMPLEMENTATION_ROUTE_NOTES: Readonly<Record<string, string>> = {
  'GET /api/implementation/repositories': 'Which repositories this project is implemented in, with their roots and index ages.',
  'POST /api/implementation/repositories': 'Register a repository. It does not scan; POST /api/implementation/rebuild does.',
  'PATCH /api/implementation/repositories/:id': 'Rename one, change its note, or re-point its root. Re-pointing deletes everything derived from the tree it is leaving.',
  'DELETE /api/implementation/repositories/:id': 'Delete one. Refused while any relationship or code revision somebody wrote still names it.',
  'GET /api/implementation/record/:id': 'What code this module, block or pipeline is implemented by: what people stated, what a resolver suggests, and what an agent has proposed.',
  'GET /api/implementation/resource': 'What one file serves: which records state it as theirs, and which a resolver has suggested it for.',
  'POST /api/implementation': 'Say that a record is implemented, tested or configured by some code. Send "proposing": true to file it as a guess.',
  'DELETE /api/implementation/:id': 'Soft-delete one relationship. An agent may not delete what a person stated.',
  'POST /api/implementation/:id/accept': 'Accept a guess, which is what turns it into ownership. Only a person may do this.',
  'POST /api/implementation/rebuild': 'Rebuild the file index and the resolver findings of one repository, or of every repository with a checkout here.',
  'GET /api/implementation/revisions': 'The code revisions recorded against one repository, exactly as they were supplied.',
  'POST /api/implementation/revisions': 'Record a code revision identifier. Mole Office stores it and never resolves it.',
}
