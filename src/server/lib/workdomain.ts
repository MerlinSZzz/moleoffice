// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORK DOMAINS: THE WRITE-PATH RULES, AND THE ORDERING THAT MAKES A HYPOTHESIS EVIDENCE.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDERING IS A PROPERTY OF THE CODE, NOT OF A CONVENTION
 * ---------------------------------------------------------------------------------------
 *
 * An agent states what it believes BEFORE Mole Office tells it what it knows: PanelX does not tell an
 * agent its work scope straight away. A hypothesis an
 * agent wrote after reading the machine's answer is not evidence of anything — it is the machine's
 * answer with a signature on it.
 *
 * SO `POST /api/records` HAS NO ACCESS TO THE RESOLVER. Nothing on the create path imports the
 * module that resolves, and nothing on the create path may. `assertNothingResolvedOnCreate` below
 * is the second half of that: a create that ARRIVES carrying `data.resolved` is refused, because a
 * caller that sends its own resolution has skipped the ordering rather than followed it.
 *
 * AND NO HYPOTHESIS IS EVER MINTED FROM A SESSION. There are 92 session records carrying
 * `data.doing` and `data.workspace`, and a migration could make a domain from each of them. It must
 * not. The whole mechanism is about what the agent SAID before the machine spoke, so a hypothesis
 * nobody wrote is fabricated completion — the exact failure the owner's own list of failure modes
 * puts first. `everyWorkDomain` reads what is stored and mints nothing; a session with no domain
 * reads as *this session filed no work domain*, which is true and is a different sentence from
 * *this session had no scope*.
 *
 * ---------------------------------------------------------------------------------------
 * THESE GUARDS REFUSE A MISTAKE, NOT AN ATTACKER, AND THE FILE SAYS SO RATHER THAN IMPLYING IT
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office has no authentication. `src/server/lib/http.ts` says in its own words that the actor is
 * attribution and not proof. So *the owning agent* here means *the actor header matches the agent
 * this domain names*, and *a person* means *a request that said it was one*. That is worth having —
 * it stops an agent writing its own resolver finding by accident, which is the failure this is for —
 * and it is not a security property.
 */

import { anOfficeId } from './ids.ts'
import { nothingWrittenSentence } from './records/patching.ts'
import { sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { actsForThePerson, patchRecord, recordInWorkspace, type Actor } from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { versionOf } from './version.ts'
import { type StatedRelationship } from './implementation.ts'
import { statedInRepository } from '../db/stated-in-repository.ts'
import { indexStatus } from './index-status.ts'
import { listIndexedFiles } from './list-indexed-files.ts'
import { storedScanOf } from './stored-scan-of.ts'
import { listRepositories } from '../db/list-repositories.ts'
import {
  MACHINE_WRITTEN_FIELDS,
  OVERLAP_CLASSES,
  ROWS_THE_ACCEPT_GATE_REFUSES_ON,
  STANCE_SAYS,
  overlapKey,
  presenceFromAge,
  rankOf,
  sayCouldNotDo,
  stageOf,
  WRITTEN_BY,
  type AcceptedDomain,
  type Acknowledgement,
  type AcknowledgeStance,
  type CouldNotDo,
  type DiffRow,
  type DomainStage,
  type WorkDomainResponse,
  type MachineWrittenField,
  type OverlapClass,
  type PresenceState,
  type ResolvedEntry,
  type Resolution,
} from '@shared/workdomain.ts'
import { filesMatching, pathCovers } from '@shared/paths.ts'
import { localStamp, parseLocalStamp } from '@shared/time.ts'
import type { Authority, Provenance } from '@shared/implementation.ts'
import { kindWord } from '@shared/words.ts'
import type { ReindexReport } from '@shared/types.ts'
import { withArticle } from '@shared/work.ts'
import { theNewestUsesOf } from './newest-use.ts'
import { isObject } from './assert-nothing-resolved-on-create.ts'
import { WORK_DOMAIN_KIND } from '@shared/work-domain-kind.ts'

export { WORK_DOMAIN_KIND } from '@shared/work-domain-kind.ts'

export { isObject } from './assert-nothing-resolved-on-create.ts'

export { liveRecord } from './check-work-domain-ids.ts'

export { agentHandles } from './check-work-domain-ids.ts'

export { sessionSaysItRanAs } from './check-work-domain-ids.ts'

export { checkWorkDomainIds } from './check-work-domain-ids.ts'

export { assertNothingResolvedOnCreate } from './assert-nothing-resolved-on-create.ts'

export { sentenceForMachineField } from './assert-nothing-resolved-on-create.ts'

/**
 * WHAT AN ORDINARY `PATCH` MAY CHANGE ON A WORK DOMAIN, AND WHAT IT MAY NOT.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR MACHINE-WRITTEN FIELDS
 * ---------------------------------------------------------------------------------------
 *
 * `resolved`, `responses`, `accepted` and `acknowledged` each have exactly one route that writes
 * them. WITHOUT THIS GUARD, `PATCH /api/records/:id {"dataPatch":{"resolved":{…}}}` lets an agent
 * write its own resolver finding, and the whole of the criticism mechanism collapses into one field
 * the agent controls. That is the same class as the measured hole the governance work found — an
 * agent created a `problem` with `whose_move: person`, deleted it, and was answered HTTP 200.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE FREEZE AFTER ACCEPTANCE
 * ---------------------------------------------------------------------------------------
 *
 * *"Do not retain only the final merged domain"* is defeated by an agent editing `writes` after the
 * fact to match what it actually did. Before acceptance the hypothesis is still being worked out and
 * editing it is the point — that is the `revise` outcome. After acceptance it is evidence. The
 * refusal says what to do instead: accept again with a different `accepted`, which writes a NEW
 * revision and keeps both readings.
 *
 * ---------------------------------------------------------------------------------------
 * "A PERSON" MEANS A REQUEST THAT SAID SO, AND WITHOUT THAT RULE THE COLUMN IS THE DEFAULT
 * ---------------------------------------------------------------------------------------
 *
 * `actorFrom` answers a request that sent no actor headers with the owner and `stated: false`. So
 * without the clause below, a headerless `curl` was a person: it could edit a frozen hypothesis and
 * write all four machine fields with a 200. That is the freeze handing itself over, and it is the
 * class this repository records as having happened once already — a misspelt header became the one
 * identity allowed to write decisions.
 *
 * It is the same two facts `assertMayWrite` reads, in a second call site. `actor.stated === false`
 * is set in exactly one place and both callers test it; this is not a second copy of the rule.
 */
export function assertMayChangeThisDomain(opts: {
  kind: string
  id: string
  /** What is stored now. */
  before: unknown
  /** What this write is sending — the patch body, not the merged result. */
  arriving: unknown
  actor: Actor
}): void {
  if (opts.kind !== WORK_DOMAIN_KIND) return
  // THE ROUTE THAT OWNS THE FIELD IS WRITING IT. See `asTheOwningRoute` below for why this is a
  // module-private flag and not something a caller can send.
  if (theOwningRouteIsWriting) return
  const arriving = opts.arriving
  if (!isObject(arriving)) return

  // AND A STATED PERSON HAS TO HOLD THE PERSON'S KEY. Criterion P83, point 1: the header claim is
  // attribution, and the key is what makes a caller the person. A person who fails that is refused
  // like any other caller of the machine-written fields.
  const isStatedPerson = opts.actor.type === 'human' && opts.actor.stated !== false && thePersonIsProved(opts.actor)
  // AND THE PERSON'S PRESS ANSWERS IT, exactly as their quoted words do. Criterion P59: an elevation gives the
  // person's own acts, and this one is declared under that power in roles.json. Asked once, so the
  // elevation is written onto the ledgers of the write it allowed and not onto one it did not.
  const actsForPerson = opts.actor.type !== 'human' && actsForThePerson(opts.actor)

  // ---- the four machine-written fields ------------------------------------------------------
  for (const field of MACHINE_WRITTEN_FIELDS) {
    if (arriving[field] === undefined) continue
    if (isStatedPerson || actsForPerson) continue
    throw new PanelError(
      `"${field}" on a work domain is written by ${WRITTEN_BY[field]} and by nothing else, so this ` +
        `PATCH was refused and nothing was written. ` +
        (opts.actor.stated === false
          ? `This request sent no actor headers, so nothing said who is asking. An ordinary write takes that as ` +
            `the person typing by hand; writing what the machine concluded may not. Send ` +
            `x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are> if a person is correcting this by ` +
            `hand, or use the route. `
          : ``) +
        `The point of the separation is that what the agent believed and what the machine resolved are two ` +
        `different statements, each attributed to whoever made it. A field an agent can write for itself is ` +
        `neither.`,
      403,
    )
  }

  // ---- and the freeze after acceptance ------------------------------------------------------
  const stored = isObject(opts.before) ? opts.before : {}
  const accepted = stored['accepted']
  if (accepted === undefined || accepted === null) return
  if (isStatedPerson || actsForPerson) return

  const frozen = ['objective', 'writes', 'creates', 'dependsOn', 'repository'].filter(
    (key) => arriving[key] !== undefined,
  )
  if (frozen.length === 0) return
  const at = isObject(accepted) && typeof accepted['at'] === 'string' ? accepted['at'] : 'an earlier revision'
  throw new PanelError(
    `This work domain was accepted at ${at}, so ${frozen.length === 1 ? 'the field' : 'the fields'} ` +
      `${frozen.map((f) => `"${f}"`).join(', ')} ${frozen.length === 1 ? 'is' : 'are'} evidence rather than a ` +
      `working draft, and this PATCH was refused. Nothing was written. Before acceptance, editing the hypothesis ` +
      `is the point — that is what the "revise" outcome is for. After it, an edit would quietly make the record ` +
      `say the agent had always meant what it ended up doing, which is the one thing the history is kept to ` +
      `prevent. Accept again with a different "accepted": POST /api/work-domains/${opts.id}/accept. That writes a ` +
      `new revision and keeps both readings.`,
    403,
  )
}

// ============================================================================ what a scan saw

export { appendFileObservations } from './append-file-observations.ts'

// ============================================================================ the resolver

/**
 * WHAT THE MACHINE CAN ASK ABOUT A PATH TODAY, BEHIND ONE SEAM.
 *
 * `serves` answers *which records does this path serve*. `dependents` answers *what depends on this
 * path* — AS A UNION AND NOT AS AN ARRAY, so a caller cannot read *not available* as *nothing
 * depends on it*. The compiler refuses the shorter reading, which is the right shape here because
 * the honest empty answer and the unknown answer are the two this product keeps confusing, and this
 * is the one place in the resolver where the difference decides whether an agent is warned.
 */
export interface Implementation {
  /** When the Implementation Map answered. Null is a real answer and reaches every reply. */
  readAt: string | null
  serves(repository: string | null, path: string): { recordId: string; provenance: Provenance; authority: Authority }[]
  dependents(
    repository: string | null,
    path: string,
  ):
    | { known: true; dependents: { path: string; provenance: Provenance; hops: number }[] }
    | { known: false; because: CouldNotDo }
}

/**
 * THE ONE IMPLEMENTATION THERE IS TODAY, BUILT FROM WHAT EXISTS.
 *
 * `serves` reads the implementation map through `statedInRepository` in lib/implementation.ts, the
 * rows POST /api/implementation writes, and matches each pattern with `filesMatching` — THE path
 * matcher, not a second one — so a module whose row names `src/web` serves `src/web/App.tsx` and
 * does not serve `src/webhooks.ts`. Only rows of live modules whose authority is `stated` count: a
 * machine's guess is not made ownership until a person accepts it. Each row answers with its own
 * provenance, so an accepted guess does not read as a declaration.
 *
 * A PATH IS MATCHED ONLY AGAINST ROWS OF ITS OWN REPOSITORY, because a row's pattern is relative to
 * the repository it names. When the domain declares no repository and the entry has no prefix,
 * `repository` is null, and the path is in the project's single indexed repository (work-domain
 * design §6.4). When that is not exactly one repository, no module is named, rather than a repository
 * picked. The workspace scan is never read as a repository's: it does not record which repository it
 * is of, and the source door and coverage do not count it for one either (round 23 of wave 13s).
 *
 * `dependents` ANSWERS `known: false` AND NAMES THE MEASUREMENT. `source_files.imports` stores
 * `"@shared/time.ts"` exactly as it is written, and `tsconfig.json` declares `"@shared/*"` is
 * `"./src/shared/*"`; nothing in the product reads the second to resolve the first. A SUFFIX MATCH
 * IS NOT AN ACCEPTABLE STAND-IN and is refused by name: `@shared/time.ts` ends with
 * `shared/time.ts` and so does `src/shared/time.ts`, so a suffix rule would be right here and wrong
 * the first time two directories share a tail. A row that is sometimes a guess is worse than a row
 * that says Mole Office cannot check this yet, because the guess is invisible and the refusal is not.
 */
export class ClaimsImplementation implements Implementation {
  readonly readAt: string | null = null
  /** The repository a path with no repository is in, or null when the project does not name one. */
  private readonly unnamedRepository: string | null
  private readonly modules: Set<string>
  /** Each repository's counted rows, read once per resolution. */
  private readonly rowsOf = new Map<string, StatedRelationship[]>()

  constructor(private readonly workspaceId: string) {
    this.unnamedRepository = theRepositoryOfAnUnprefixedPath(workspaceId)
    const live = sqlite
      .prepare("SELECT id FROM records WHERE kind = 'module' AND workspace_id = ? AND deleted_at IS NULL")
      .all(workspaceId) as { id: string }[]
    this.modules = new Set(live.map((row) => row.id))
  }

  serves(repository: string | null, path: string): { recordId: string; provenance: Provenance; authority: Authority }[] {
    const key = repository ?? this.unnamedRepository
    if (key === null) return []
    let rows = this.rowsOf.get(key)
    if (rows === undefined) {
      rows = statedInRepository(key, this.workspaceId).filter(
        (row) => row.authority === 'stated' && this.modules.has(row.recordId),
      )
      this.rowsOf.set(key, rows)
    }
    const out: { recordId: string; provenance: Provenance; authority: Authority }[] = []
    for (const row of rows) {
      if (filesMatching(row.pattern, [path]).length === 0) continue
      if (out.some((seen) => seen.recordId === row.recordId)) continue
      out.push({ recordId: row.recordId, provenance: row.provenance, authority: row.authority })
    }
    return out
  }

  dependents(): { known: false; because: CouldNotDo } {
    return { known: false, because: 'imports_unresolved' }
  }
}

/** The one indexed repository a path with no repository is in, or null when there is not exactly one. */
function theRepositoryOfAnUnprefixedPath(workspaceId: string): string | null {
  const indexed = indexedRepositoriesFor(workspaceId)
  return indexed.length === 1 ? (indexed[0] ?? null) : null
}

/**
 * THE FILES AN ENTRY IN ONE REPOSITORY IS RESOLVED AGAINST, read once per repository.
 *
 * An entry in a repository is looked up in THAT repository's stored scan, through `storedScanOf` in
 * lib/sourceindex.ts, the reading the source door and coverage count a row against. It used to be
 * looked up in whichever scan was stored last, so once POST /api/source/reindex scanned every
 * repository, an entry in one repository was resolved against another's files. An entry with no
 * repository is in the project's one indexed repository; in a project that registers no repository
 * it is in the workspace scan, as before. Null means there is no scan to read it against.
 */
export function scanFor(workspaceId: string): (repository: string | null) => string[] | null {
  const read = new Map<string | null, string[] | null>()
  return (repository) => {
    const key = repository ?? theRepositoryOfAnUnprefixedPath(workspaceId)
    if (!read.has(key)) {
      const paths =
        key !== null
          ? (storedScanOf(workspaceId, key)?.files.map((file) => file.path) ?? null)
          : listRepositories(workspaceId).length === 0
            ? indexStatus(workspaceId) === null
              ? null
              : listIndexedFiles(workspaceId).map((file) => file.path)
            : null
      read.set(key, paths)
    }
    return read.get(key) ?? null
  }
}

/** Everything one resolution needs to read, gathered once. */
export interface ResolveContext {
  workspaceId: string
  /** What the domain says unqualified paths are relative to. An opaque key, never resolved. */
  repository: string | null
  /**
   * The newest stored scan, of any repository. It stamps a resolution and starts a drift window,
   * which are about time; the files an entry is resolved against come from `pathsIn`.
   */
  index: { builtAt: string; root: string; paths: string[] } | null
  /** The files an entry in this repository is resolved against: `scanFor`. */
  pathsIn: (repository: string | null) => string[] | null
  /** Every repository key this project has an index for. More than one makes a bare path ambiguous. */
  indexedRepositories: string[]
  implementation: Implementation
}

/**
 * The index of a workspace as the resolver needs it, or null when there is none.
 *
 * THE SCAN AND ITS FILES COME FROM ONE OWNER. Two doors write `source_index` and `source_files`:
 * the workspace scan (whose `repository_id` is NULL) and a repository rebuild. This read used to
 * take the newest stamp from one and then list every row in the table, so a resolver could be told
 * "this scan, at this age" while being handed two scans' paths — every file named twice, and a
 * bare path answered as though it were in a repository it is not. It now asks the stamp which owner
 * it is and lists only that owner's rows.
 */
export function indexFor(workspaceId: string): ResolveContext['index'] {
  const stamp = sqlite
    .prepare('SELECT built_at, root, repository_id FROM source_index WHERE workspace_id = ? ORDER BY built_at DESC LIMIT 1')
    .get(workspaceId) as { built_at: string; root: string; repository_id: string | null } | undefined
  if (stamp === undefined) return null
  const paths = (
    sqlite
      .prepare('SELECT path FROM source_files WHERE workspace_id = ? AND repository_id IS ?')
      .all(workspaceId, stamp.repository_id) as { path: string }[]
  ).map((r) => r.path)
  return { builtAt: stamp.built_at, root: stamp.root, paths }
}

/** The repository keys this project has scanned, as the resolver compares them: opaque strings. */
export function indexedRepositoriesFor(workspaceId: string): string[] {
  const rows = sqlite
    .prepare('SELECT DISTINCT repository_id FROM source_index WHERE workspace_id = ?')
    .all(workspaceId) as { repository_id: string | null }[]
  return rows.map((r) => r.repository_id).filter((id): id is string => typeof id === 'string' && id !== '')
}

/**
 * ONE WRITTEN ENTRY, RESOLVED. The agent's string is carried through untouched.
 *
 * Every branch that cannot answer says which code it could not answer under, and none of them
 * guesses. A project with more than one indexed repository and an entry with no prefix does NOT get
 * a repository picked for it: picking would decide, silently, whether two agents are told they
 * collide.
 */
export function resolveEntry(asWritten: string, ctx: ResolveContext): ResolvedEntry {
  const base: ResolvedEntry = { asWritten, shape: 'unresolved' }
  const colon = asWritten.indexOf(':')
  const prefixed = colon > 0 && !asWritten.slice(0, colon).includes('/')
  const repository = prefixed ? asWritten.slice(0, colon) : ctx.repository
  const written = prefixed ? asWritten.slice(colon + 1) : asWritten

  if (ctx.index === null) return { ...base, note: 'no_file_index' }
  if (prefixed && ctx.indexedRepositories.length > 0 && !ctx.indexedRepositories.includes(repository ?? '')) {
    return { ...base, note: 'unknown_repository' }
  }
  if (!prefixed && ctx.repository === null && ctx.indexedRepositories.length > 1) {
    return { ...base, note: 'ambiguous_repository' }
  }

  const paths = ctx.pathsIn(repository ?? null)
  if (paths === null) return { ...base, note: 'no_file_index', ...(repository === null || repository === undefined ? {} : { repository }) }

  const cleaned = written.trim().replace(/^\.\//, '').replace(/\/+$/, '')
  const withRepository = (entry: ResolvedEntry): ResolvedEntry =>
    repository === null || repository === undefined ? entry : { ...entry, repository }

  if (/[*?]/.test(cleaned)) {
    const matched = filesMatching(cleaned, paths)
    return withRepository({
      ...base,
      path: cleaned,
      shape: 'pattern',
      files: matched.length,
      modules: modulesOver(matched, ctx, repository),
    })
  }

  if (paths.includes(cleaned)) {
    return withRepository({
      ...base,
      path: cleaned,
      shape: 'file',
      files: 1,
      modules: modulesOver([cleaned], ctx, repository),
    })
  }
  const under = paths.filter((p) => p.startsWith(`${cleaned}/`))
  if (under.length > 0) {
    return withRepository({
      ...base,
      path: cleaned,
      shape: 'directory',
      files: under.length,
      modules: modulesOver(under, ctx, repository),
    })
  }
  // NOT IN THE INDEX IS AN ANSWER AND NOT A FAILURE. A file the agent is about to CREATE is not in
  // the index and should not be: `creates` entries are expected to read this way.
  return withRepository({ ...base, path: cleaned, shape: 'unindexed', files: 0, note: 'not_indexed' })
}

/**
 * THE IMPLEMENTATION MAP'S OWN ROWS BEHIND ONE RESOLVED ENTRY, as module and provenance. Problem zLPu7xMQPdG6.
 *
 * A stored resolution keeps module ids only, so the scope diff asks the map again, when the diff is computed, which
 * rows serve the entry's files and with what provenance. An accepted guess is a stated row whose provenance is `llm`,
 * and it must not be called declared. The files are read as the resolver read them: one file, the files a pattern
 * matches, or the files under a directory. A module the resolution named that no row serves now has no pair here, and
 * a row built from it then says no provenance rather than a guessed one.
 */
function theRowsBehind(
  entry: ResolvedEntry,
  ctx: ResolveContext,
  onlyModule?: string,
): { recordId: string; provenance: Provenance }[] {
  if (entry.path === undefined || ctx.index === null) return []
  const paths = ctx.pathsIn(entry.repository ?? ctx.repository)
  if (paths === null) return []
  const at = entry.path
  const files =
    entry.shape === 'file'
      ? [at]
      : entry.shape === 'pattern'
        ? filesMatching(at, paths)
        : entry.shape === 'directory'
          ? paths.filter((p) => p.startsWith(`${at}/`))
          : []
  const out: { recordId: string; provenance: Provenance }[] = []
  for (const file of files) {
    for (const row of ctx.implementation.serves(entry.repository ?? ctx.repository, file)) {
      if (onlyModule !== undefined && row.recordId !== onlyModule) continue
      if (out.some((seen) => seen.recordId === row.recordId && seen.provenance === row.provenance)) continue
      out.push({ recordId: row.recordId, provenance: row.provenance })
    }
  }
  return out
}

/**
 * WHAT A SCOPE-DIFF ROW SAYS ABOUT WHERE ITS MODULES CAME FROM. Each module row with its own provenance, and one
 * provenance for the whole row only when every row behind it agrees. With no row behind it, nothing is said, which is
 * not "declared". Every row the map counts here is stated (ClaimsImplementation counts no other), so the authority is
 * `stated` exactly when there is a row.
 */
function whereTheModulesCameFrom(
  pairs: { recordId: string; provenance: Provenance }[],
): Pick<Difference, 'provenance' | 'authority' | 'eachModule'> {
  if (pairs.length === 0) return { eachModule: [] }
  const first = pairs[0]?.provenance
  const agree = pairs.every((one) => one.provenance === first)
  return { ...(agree && first !== undefined ? { provenance: first } : {}), authority: 'stated', eachModule: pairs }
}

/** The record ids every one of these paths serves, folded to a set, ids only. */
function modulesOver(paths: readonly string[], ctx: ResolveContext, repository: string | null = ctx.repository): string[] {
  const out: string[] = []
  for (const path of paths) {
    for (const row of ctx.implementation.serves(repository, path)) {
      if (!out.includes(row.recordId)) out.push(row.recordId)
    }
  }
  return out
}

/**
 * WHAT THE MACHINE MADE OF ONE DOMAIN'S THREE LISTS.
 *
 * `couldNotDo` is NEVER OMITTED, and `checked: false` is what a reader gets when the resolver could
 * not finish at all. An empty `items` beside `checked: true` means the resolver looked and had
 * nothing to report, which is a different sentence from *nobody looked*.
 */
export function resolveDomain(data: Record<string, unknown>, ctx: ResolveContext): Resolution {
  const list = (key: string): string[] => {
    const held = data[key]
    return Array.isArray(held) ? held.filter((v): v is string => typeof v === 'string') : []
  }
  const writes = list('writes').map((entry) => resolveEntry(entry, ctx))
  const creates = list('creates').map((entry) => resolveEntry(entry, ctx))
  const dependsOn = list('dependsOn').map((entry) => resolveEntry(entry, ctx))

  const resolution: Resolution = {
    at: localStamp(new Date()),
    resolver: RESOLVER_VERSION,
    writes,
    creates,
    dependsOn,
    couldNotDo: { checked: true, items: [] },
  }
  if (ctx.index !== null) {
    resolution.index = {
      builtAt: ctx.index.builtAt,
      root: ctx.index.root,
      fileCount: ctx.index.paths.length,
      // THE SCAN, BY ITS ID. It is what a drift window's floor is measured against, for the reason
      // written on the field: a build stamp is a wall-clock stamp to the second and two rebuilds
      // inside one second share one.
      ...(scanOfTheIndex(ctx.workspaceId, ctx.index.builtAt) === null
        ? {}
        : { scanId: scanOfTheIndex(ctx.workspaceId, ctx.index.builtAt) as string }),
    }
  }

  // THE RESOLVER DID NOT FINISH AT ALL when there is no index: no path could be resolved and four of
  // the seven diff rows could not be computed. That is one `checked: false`, not seven items.
  if (ctx.index === null) {
    resolution.couldNotDo = { checked: false, because: 'no_file_index' }
    return resolution
  }

  const items: { code: CouldNotDo; inputs?: Record<string, string> }[] = []
  // THE MAP HAS NOT ANSWERED. It is reported on every resolution rather than left out, because a
  // reply that says nothing about the map reads as a reply the map agreed with.
  if (ctx.implementation.readAt === null) items.push({ code: 'map_absent' })
  const unresolvedImports = ctx.implementation.dependents(ctx.repository, '')
  if (unresolvedImports.known === false) {
    items.push({
      code: unresolvedImports.because,
      inputs: { example: '@shared/time.ts', alias: '@shared/*' },
    })
  }
  for (const entry of [...writes, ...creates, ...dependsOn]) {
    if (entry.note === undefined) continue
    if (items.some((item) => item.code === entry.note && item.inputs?.['path'] === entry.asWritten)) continue
    items.push({ code: entry.note, inputs: inputsOf(entry, ctx.workspaceId) })
  }
  resolution.couldNotDo = { checked: true, items }
  return resolution
}

/**
 * THE VALUES THE SENTENCE FOR AN ENTRY'S NOTE NAMES. An entry with `no_file_index` beside a stored scan is in a
 * repository with no scan of its own, and `unscanned` names it, so the sentence does not say the project has
 * no index at all.
 */
function inputsOf(entry: ResolvedEntry, workspaceId: string): Record<string, string> {
  if (entry.note !== 'no_file_index') return { path: entry.asWritten }
  const registered = listRepositories(workspaceId)
  const named = registered.find((r) => r.id === entry.repository || r.name === entry.repository)
  const unscanned =
    entry.repository !== undefined
      ? `the repository "${named?.name ?? entry.repository}"`
      : registered.length === 1
        ? `the repository "${registered[0]?.name}", the one this project registers`
        : `any of the ${registered.length} repositories this project registers (${registered.map((r) => `"${r.name}"`).join(', ')})`
  return { path: entry.asWritten, unscanned }
}

/** Bumped when the rules above change, so a stored conclusion says what made it. */
export const RESOLVER_VERSION = 'wd-1'

/**
 * WHICH SCAN WROTE THE OBSERVATIONS STAMPED AT THIS INDEX BUILD, or null when it recorded none.
 *
 * NULL IS A REAL ANSWER AND NOT A FAILURE: a rebuild that found nothing changed writes no
 * observations, so there is no scan id to name and the window has nothing of its own to exclude.
 */
function scanOfTheIndex(workspaceId: string, builtAt: string): string | null {
  const row = sqlite
    .prepare('SELECT scan_id FROM file_observations WHERE workspace_id = ? AND seen_at = ? LIMIT 1')
    .get(workspaceId, builtAt) as { scan_id: string } | undefined
  return row?.scan_id ?? null
}

// ============================================================================ the scope diff

/** One difference between what the agent said and what the machine read. Computed, never stored. */
export interface Difference {
  /** Stable, so a response written against one resolution still answers this row after a re-resolve. */
  key: string
  row: DiffRow
  subject: { path?: string; repository?: string; recordId?: string; otherDomainId?: string }
  /** Composed AT READ from the fields beside it. A diff is never stored. */
  says: string
  /**
   * Where the row's modules came from. On the rows about modules, set only when every implementation row behind the
   * row has this provenance; `eachModule` says each one. Absent means no row said.
   */
  provenance?: Provenance
  authority?: Authority
  /**
   * THE IMPLEMENTATION MAP'S ROWS BEHIND A ROW ABOUT MODULES, each with its own provenance (problem zLPu7xMQPdG6).
   * Present on shared_file, extra_semantic and no_known_path. An empty list means the map holds no row for them now.
   */
  eachModule?: { recordId: string; provenance: Provenance }[]
  computedFrom: 'the file index' | 'module claims' | 'links' | 'other work domains'
  /** What this row could not check, as a code. Present means the row is a could-not-say. */
  notKnown?: CouldNotDo
}

function differenceKey(row: DiffRow, subject: string): string {
  return `${row}:${subject}`
}

/**
 * THE SEVEN ROWS, AND WHICH OF THEM CAN BE COMPUTED TODAY.
 *
 * Four work now. One works over the two thirds of this repository a module claims and says so. One
 * works in half — its module half — and says which half ran. And one waits for the Implementation
 * Map's path-level inverse read, WHICH IS DRAWN AS A COULD-NOT-SAY RATHER THAN AS A CLEAN RESULT:
 * *Mole Office cannot check this yet*, with the reason, never *no dependencies missing*.
 *
 * ROW 6 IS COMPUTED HERE AND CAN NEVER REFUSE AN ACCEPT. It reads other agents' domains, so if it
 * could hold an accept open, a second agent filing a domain could make the first agent's accept fail
 * on a key it had never seen. `ROWS_THE_ACCEPT_GATE_REFUSES_ON` is where that rule lives.
 */
export function differencesFor(opts: {
  domainId: string
  data: Record<string, unknown>
  resolution: Resolution
  ctx: ResolveContext
  /** Every other open domain in this project, for row 6. */
  others: DomainSide[]
}): Difference[] {
  const out: Difference[] = []
  const { resolution } = opts
  const writes = resolution.writes ?? []
  const creates = resolution.creates ?? []
  const dependsOn = resolution.dependsOn ?? []
  const declared = aboutLinksOf(opts.domainId)

  // ---- row 7 first, because rows 1 and 4 are only honest about an entry the index holds ------
  for (const entry of [...writes, ...creates, ...dependsOn]) {
    if (entry.shape !== 'unindexed' && entry.shape !== 'unresolved') continue
    out.push({
      key: differenceKey('mapping_unsure', entry.asWritten),
      row: 'mapping_unsure',
      subject: { path: entry.asWritten, ...(entry.repository === undefined ? {} : { repository: entry.repository }) },
      says:
        entry.note === undefined
          ? `"${entry.asWritten}" could not be placed in this project.`
          : sayCouldNotDo(entry.note, { ...inputsOf(entry, opts.ctx.workspaceId), workspace: opts.ctx.workspaceId }),
      computedFrom: 'the file index',
      ...(entry.note === undefined ? {} : { notKnown: entry.note }),
    })
  }

  // ---- row 5: a declared path more than one module claims ------------------------------------
  for (const entry of [...writes, ...creates, ...dependsOn]) {
    const modules = entry.modules ?? []
    if (modules.length < 2) continue
    out.push({
      key: differenceKey('shared_file', entry.path ?? entry.asWritten),
      row: 'shared_file',
      subject: { path: entry.path ?? entry.asWritten },
      says: `"${entry.asWritten}" belongs to ${String(modules.length)} modules. Changing it reaches all of them.`,
      ...whereTheModulesCameFrom(theRowsBehind(entry, opts.ctx)),
      computedFrom: 'module claims',
    })
  }

  // ---- row 4: modules the paths reach that the `about` links do not name ----------------------
  const discovered: string[] = []
  for (const entry of [...writes, ...creates, ...dependsOn]) {
    for (const id of entry.modules ?? []) {
      if (declared.includes(id) || discovered.includes(id)) continue
      discovered.push(id)
      out.push({
        key: differenceKey('extra_semantic', id),
        row: 'extra_semantic',
        subject: { recordId: id, path: entry.path ?? entry.asWritten },
        says: `"${entry.asWritten}" is also in a module you did not name.`,
        ...whereTheModulesCameFrom(theRowsBehind(entry, opts.ctx, id)),
        computedFrom: 'module claims',
      })
    }
  }

  // ---- row 3: something the agent says it relies on that nothing it writes reaches ------------
  //
  // THE MODULE HALF RUNS AND THE IMPORT HALF DOES NOT, and the row says which. A `dependsOn` entry
  // in no module any declared write touches is reported from module claims. Whether some file the
  // domain writes IMPORTS it cannot be asked, because imports are stored as written.
  const writtenModules = new Set([...writes, ...creates].flatMap((entry) => entry.modules ?? []))
  for (const entry of dependsOn) {
    if (entry.shape === 'unindexed' || entry.shape === 'unresolved') continue
    const shares = (entry.modules ?? []).some((id) => writtenModules.has(id))
    if (shares) continue
    out.push({
      key: differenceKey('no_known_path', entry.path ?? entry.asWritten),
      row: 'no_known_path',
      subject: { path: entry.path ?? entry.asWritten },
      says:
        `Nothing Mole Office can see connects "${entry.asWritten}" to what you are changing: no module it belongs to is ` +
        `one your declared writes touch, and whether anything you write IMPORTS it could not be asked. ` +
        sayCouldNotDo('imports_unresolved', { example: '@shared/time.ts', alias: '@shared/*' }),
      ...whereTheModulesCameFrom(theRowsBehind(entry, opts.ctx)),
      computedFrom: 'module claims',
      notKnown: 'imports_unresolved',
    })
  }

  // ---- row 2: what the agent did not name that its own work imports ---------------------------
  //
  // ONE ROW, DRAWN AS A COULD-NOT-SAY. It is not drawn as *no dependencies missing*, because the
  // read has not been made: the map builds no path-level inverse and nothing resolves an import.
  const anyPath = [...writes, ...creates].find((entry) => entry.path !== undefined)
  if (anyPath !== undefined) {
    const answer = opts.ctx.implementation.dependents(opts.ctx.repository, anyPath.path ?? '')
    if (answer.known === false) {
      out.push({
        key: differenceKey('dependency_missing', 'the-whole-domain'),
        row: 'dependency_missing',
        subject: {},
        says: `Mole Office cannot check this yet. ${sayCouldNotDo(answer.because, { example: '@shared/time.ts', alias: '@shared/*' })}`,
        computedFrom: 'the file index',
        notKnown: answer.because,
      })
    }
  }

  // ---- row 6: another open domain relies on something this one changes ------------------------
  //
  // THE SAME COMPUTATION THE OVERLAP READ MAKES, called rather than written a second time. Two
  // functions answering "does another agent depend on this" is the defect this campaign exists to
  // stop.
  const mine: DomainSide = {
    domainId: opts.domainId,
    basis: 'stated',
    entries: [...writes, ...creates, ...dependsOn],
    writes,
    creates,
    dependsOn,
    records: declared,
  }
  for (const other of opts.others) {
    for (const finding of classifyOverlap(mine, other)) {
      if (finding.overlapClass !== 'write_dependency') continue
      out.push({
        key: differenceKey('other_domain_depends', finding.subject),
        row: 'other_domain_depends',
        subject: { path: finding.subject, otherDomainId: other.domainId },
        says: finding.forA,
        computedFrom: 'other work domains',
      })
    }
  }

  // ---- row 1: everything that resolved cleanly and fired nothing else --------------------------
  const fired = new Set(out.map((d) => d.subject.path ?? ''))
  for (const entry of [...writes, ...creates, ...dependsOn]) {
    if (entry.shape === 'unindexed' || entry.shape === 'unresolved') continue
    if (fired.has(entry.path ?? entry.asWritten)) continue
    out.push({
      key: differenceKey('agree', entry.path ?? entry.asWritten),
      row: 'agree',
      subject: { path: entry.path ?? entry.asWritten },
      says: `Mole Office read "${entry.asWritten}" the same way you did.`,
      computedFrom: 'the file index',
    })
  }
  return out
}

/** The record ids a domain's `about` links name. The structured form of what it says it is about. */
export function aboutLinksOf(domainId: string): string[] {
  const rows = sqlite
    .prepare("SELECT to_id FROM links WHERE from_id = ? AND type = 'about'")
    .all(domainId) as { to_id: string }[]
  return rows.map((r) => r.to_id)
}

// ============================================================================ overlap

/** One side of a comparison: what this domain covers, and on what authority it says so. */
export interface DomainSide {
  domainId: string
  /** `accepted` when the entries come from `data.accepted`; `stated` when they are the hypothesis. */
  basis: 'accepted' | 'stated'
  entries: ResolvedEntry[]
  /** What it expects to MODIFY. */
  writes: ResolvedEntry[]
  /** What it expects to CREATE. Separate from `writes`, because `create_in_area` is a class. */
  creates: ResolvedEntry[]
  dependsOn: ResolvedEntry[]
  records: string[]
}

export interface OverlapFinding {
  key: string
  overlapClass: OverlapClass
  rank: number
  word: string
  /** The shared path, or the shared record id when the class is `semantic_only`. */
  subject: string
  forA: string
  forB: string
  /** True when the covering rule could not tell, which is never the same as `no`. */
  unknown: boolean
}

/**
 * SIX CLASSES OVER FOUR RANKS, DECIDED IN ONE PLACE.
 *
 * NO MODEL RUNS ANYWHERE IN HERE. It is set arithmetic over stored entries and one table. The
 * browser holds no second mapping and re-decides no rank. A test deleted on 13 November 2026 walked `src/web`
 * twice to keep it that way — once for a class key and once for a numeric comparison against
 * `rank`, because either assertion alone passed a mutation the other caught.
 *
 * THE DIRECTION MATTERS AND EACH SIDE GETS ITS OWN SENTENCE. *You are changing something they rely
 * on* and *they are changing something you rely on* are the same overlap and two different things
 * to do about it.
 */
export function classifyOverlap(a: DomainSide, b: DomainSide): OverlapFinding[] {
  const out: OverlapFinding[] = []
  const add = (
    overlapClass: OverlapClass,
    subject: string,
    forA: string,
    forB: string,
    unknown = false,
  ): void => {
    const key = overlapKey(a.domainId, b.domainId, subject)
    if (out.some((f) => f.key === key && f.overlapClass === overlapClass)) return
    out.push({ key, overlapClass, rank: rankOf(overlapClass), word: OVERLAP_CLASSES[overlapClass].word, subject, forA, forB, unknown })
  }

  let anyPathClass = false
  let unknownPairs = 0

  // write/write — rank 4 — and create-in-area — rank 2 — which are told apart by the SHAPE of the
  // entry doing the covering. A create landing on exactly the path the other domain writes is
  // write/write: the two entries cover each other. A create landing inside a DIRECTORY or a pattern
  // the other writes is the weaker case — two agents adding different files to one place, usually
  // fine and occasionally a merge conflict in an index or a manifest.
  const aChanges = [...a.writes.map((e) => ({ e, creating: false })), ...a.creates.map((e) => ({ e, creating: true }))]
  const bChanges = [...b.writes.map((e) => ({ e, creating: false })), ...b.creates.map((e) => ({ e, creating: true }))]
  for (const mine of aChanges) {
    for (const theirs of bChanges) {
      const answer = pathCovers(mine.e, theirs.e)
      const back = pathCovers(theirs.e, mine.e)
      if (answer === 'unknown' && back === 'unknown') unknownPairs += 1
      if (answer !== 'yes' && back !== 'yes') continue
      anyPathClass = true
      const wide = answer === 'yes' ? mine : theirs
      const narrow = answer === 'yes' ? theirs : mine
      const exact = answer === 'yes' && back === 'yes'
      const subject = narrow.e.path ?? narrow.e.asWritten
      if (!exact && narrow.creating && (wide.e.shape === 'directory' || wide.e.shape === 'pattern')) {
        const creatorIsA = narrow === mine
        add(
          'create_in_area',
          subject,
          creatorIsA
            ? `You are creating "${subject}" inside "${wide.e.asWritten}", which the other session is changing.`
            : `The other session is creating "${subject}" inside "${wide.e.asWritten}", which you are changing.`,
          creatorIsA
            ? `The other session is creating "${subject}" inside "${wide.e.asWritten}", which you are changing.`
            : `You are creating "${subject}" inside "${wide.e.asWritten}", which the other session is changing.`,
        )
        continue
      }
      add(
        'write_write',
        subject,
        `You and the other session are both changing "${subject}".`,
        `You and the other session are both changing "${subject}".`,
      )
    }
  }

  // write/dependency — rank 3, both directions, each with its own sentence
  for (const mine of [...a.writes, ...a.creates]) {
    for (const theirs of b.dependsOn) {
      if (pathCovers(mine, theirs) !== 'yes') continue
      anyPathClass = true
      const subject = theirs.path ?? theirs.asWritten
      add(
        'write_dependency',
        subject,
        `You are changing "${subject}", which the other session says it relies on.`,
        `The other session is changing "${subject}", which you said you rely on.`,
      )
    }
  }
  for (const mine of a.dependsOn) {
    for (const theirs of [...b.writes, ...b.creates]) {
      if (pathCovers(theirs, mine) !== 'yes') continue
      anyPathClass = true
      const subject = mine.path ?? mine.asWritten
      add(
        'write_dependency',
        subject,
        `The other session is changing "${subject}", which you said you rely on.`,
        `You are changing "${subject}", which the other session says it relies on.`,
      )
    }
  }

  // read/read — rank 0, computed and counted, drawn by nobody
  for (const mine of a.dependsOn) {
    for (const theirs of b.dependsOn) {
      if (pathCovers(mine, theirs) !== 'yes') continue
      const subject = mine.path ?? mine.asWritten
      add(
        'read_read',
        subject,
        `You both rely on "${subject}" and neither of you is changing it.`,
        `You both rely on "${subject}" and neither of you is changing it.`,
      )
    }
  }

  // semantic — rank 1, and ONLY when no path class fired
  if (!anyPathClass) {
    for (const id of a.records) {
      if (!b.records.includes(id)) continue
      add(
        'semantic_only',
        id,
        'You are both working on the same part of the project.',
        'You are both working on the same part of the project.',
      )
    }
  }

  if (unknownPairs > 0 && out.length === 0) {
    // NOT SILENCE. A pair reported as no overlap when the truth is nobody could look is the failure
    // this read exists to prevent, so the unknown is carried out rather than dropped.
    out.push({
      key: overlapKey(a.domainId, b.domainId, 'unknown'),
      overlapClass: 'write_write',
      rank: rankOf('write_write'),
      word: OVERLAP_CLASSES.write_write.word,
      subject: 'unknown',
      forA: 'Mole Office could not tell whether these two overlap: neither path could be placed in a file index.',
      forB: 'Mole Office could not tell whether these two overlap: neither path could be placed in a file index.',
      unknown: true,
    })
  }
  return out
}

// ============================================================================ the domains themselves

/** One open work domain, as every read of them needs it. */
export interface OpenDomain {
  id: string
  title: string
  objective: string
  agentId: string
  sessionId: string
  stage: DomainStage
  basis: 'accepted' | 'stated'
  data: Record<string, unknown>
  lastSign: { at: string | null; from: string }
}

/**
 * EVERY OPEN WORK DOMAIN IN THIS PROJECT. Open means `closedAt` absent AND not deleted.
 *
 * `deleted_at` IS IN THE PREDICATE AND NOT ASSUMED. A soft-deleted domain keeps `closedAt` absent,
 * so a rule written over `closedAt` alone would go on reporting a deleted domain's collisions to
 * live agents for ever. Every other read in the product filters it; this one says so out loud, in
 * the same statement, so the two conditions cannot come apart.
 */
export function openDomainsIn(workspaceId: string): OpenDomain[] {
  // WHICH WORK-DOMAIN ROWS THERE ARE, FIRST. Asked as one statement over the project, SQLite used
  // `records_live_idx` and tested every live record with `json_valid` and `json_extract` to find that
  // no work domain was open: 45.3 ms for no rows on the 13 November office, where the project has
  // 25,351 live records and not one work domain. This read names `records_kind_idx`, as
  // `theRunsThatCouldNameAnAgent` in attachments.ts names its own indexes, and the same statement
  // answers in 0.0 ms. It asks for the place too, because the answer's order is the old query's order.
  const placed = sqlite
    .prepare(
      'SELECT id, updated_at FROM records INDEXED BY records_kind_idx ' +
        'WHERE kind = ? AND workspace_id = ? AND deleted_at IS NULL',
    )
    .all(WORK_DOMAIN_KIND, workspaceId) as { id: string; updated_at: string }[]
  placed.sort((a, b) =>
    a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0,
  )

  // AND ONLY THOSE ROWS' DATA. The predicate and the order are the ones the single statement had; the
  // `kind` here is redundant against the ids and keeps this statement saying what it reads.
  const rows = sqlite
    .prepare(
      "SELECT id, title, data FROM records WHERE kind = ? AND id IN (SELECT value FROM json_each(?)) " +
        "AND deleted_at IS NULL AND json_valid(data) AND json_extract(data, '$.closedAt') IS NULL",
    )
    .all(WORK_DOMAIN_KIND, JSON.stringify(placed.map((one) => one.id))) as {
    id: string
    title: string
    data: string
  }[]
  const byId = new Map(rows.map((row) => [row.id, row] as const))

  const out: OpenDomain[] = []
  for (const place of placed) {
    const row = byId.get(place.id)
    if (row === undefined) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(row.data)
    } catch {
      continue
    }
    if (!isObject(parsed)) continue
    out.push({
      id: row.id,
      title: row.title,
      objective: typeof parsed['objective'] === 'string' ? parsed['objective'] : '',
      agentId: typeof parsed['agent'] === 'string' ? parsed['agent'] : '',
      sessionId: typeof parsed['session'] === 'string' ? parsed['session'] : '',
      stage: stageOf(parsed as { resolved?: unknown; accepted?: unknown; closedAt?: unknown }),
      basis: parsed['accepted'] === undefined || parsed['accepted'] === null ? 'stated' : 'accepted',
      data: parsed,
      lastSign: lastSignOf(row.id, typeof parsed['session'] === 'string' ? parsed['session'] : null),
    })
  }
  return out
}

/**
 * WHETHER ANYBODY IS WORKING, AS AN AGE AND NEVER AS A WORD.
 *
 * Measured, and this is the measurement: ten `session` records in the owner's corpus read
 * `state: 'running'`, and nine of them last wrote a change row between ten and fourteen days ago.
 * So a stored state word does not say whether anybody is working, and NOTHING HERE READS ONE. It is
 * the newest of three stored facts — a revision of this domain, a change row from its session, and
 * its session's newest use of a tool — and nothing probes a process.
 *
 * NOTHING IS CLOSED AUTOMATICALLY. A domain with no sign for eleven days is drawn as *no sign of
 * work for 11 days · nobody has closed it*, and it still appears in overlap, because a stale domain
 * whose agent comes back is exactly the case a durable message is written for.
 */
export function lastSignOf(domainId: string, sessionId: string | null): { at: string | null; from: string } {
  const revision = sqlite
    .prepare('SELECT at FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
    .get(domainId) as { at: string } | undefined
  const change =
    sessionId === null
      ? undefined
      : (sqlite
          .prepare('SELECT at FROM changes WHERE session_id = ? ORDER BY at DESC LIMIT 1')
          .get(sessionId) as { at: string } | undefined)

  // A USE OF A TOOL BY ITS SESSION (round 33b). Since round 33 a use is a row of `tool_uses` and writes no change row,
  // so it is read here, as its run's newest use (lib/newest-use.ts).
  const used = sessionId === null ? undefined : theNewestUsesOf([sessionId]).get(sessionId)

  const signs = [
    ...(revision === undefined ? [] : [{ at: revision.at, from: 'a revision of this domain' }]),
    ...(change === undefined ? [] : [{ at: change.at, from: 'a change row from its session' }]),
    ...(used === undefined ? [] : [{ at: used, from: 'a use of a tool by its session' }]),
  ]
  if (signs.length === 0) return { at: null, from: 'nothing has been seen' }
  // The first of equal stamps is kept, so a revision still wins a tie, as it did before.
  return signs.reduce((newest, sign) => (sign.at > newest.at ? sign : newest))
}

/**
 * ONE DOMAIN AS AN OVERLAP COMPARES IT.
 *
 * `accepted.entries` ARE FROZEN AT ACCEPTANCE AND ARE USED AS THEY ARE. Recomputing them on every
 * read would make an overlap depend on the current index rather than on what the two agents
 * accepted, and two agents would then be told different things about one pair depending on when
 * each of them looked. A domain with nothing accepted still takes part — a file two agents are both
 * going to write is the same collision whether or not either has finished answering its differences
 * — and its side is marked `stated`, which changes the sentence and not the rank.
 */
export function sideOf(domain: OpenDomain, ctx: ResolveContext): DomainSide {
  const accepted = domain.data['accepted']
  if (isObject(accepted) && Array.isArray(accepted['entries'])) {
    const entries = (accepted['entries'] as ResolvedEntry[]).filter((e) => isObject(e))
    const asWritten = (key: string): string[] => {
      const held = accepted[key]
      return Array.isArray(held) ? held.filter((v): v is string => typeof v === 'string') : []
    }
    const pick = (key: string): ResolvedEntry[] =>
      entries.filter((entry) => asWritten(key).includes(entry.asWritten))
    return {
      domainId: domain.id,
      basis: 'accepted',
      entries,
      writes: pick('writes'),
      creates: pick('creates'),
      dependsOn: pick('dependsOn'),
      records: aboutLinksOf(domain.id),
    }
  }
  const resolution = resolveDomain(domain.data, ctx)
  const writes = resolution.writes ?? []
  const creates = resolution.creates ?? []
  const dependsOn = resolution.dependsOn ?? []
  return {
    domainId: domain.id,
    basis: 'stated',
    entries: [...writes, ...creates, ...dependsOn],
    writes,
    creates,
    dependsOn,
    records: aboutLinksOf(domain.id),
  }
}

/**
 * EVERY OVERLAP BETWEEN EVERY PAIR OF OPEN DOMAINS, COMPUTED AT READ AND STORED NOWHERE.
 *
 * It has no table, no row and no id in the database. Its identity is derived from its inputs — the
 * two domain ids sorted, then the shared subject — which is what lets a message name an overlap and
 * an acknowledgement point at one without anything minting a row to hold it.
 *
 * A DOMAIN NEVER OVERLAPS ITSELF. Two open domains of the SAME agent do overlap and are reported,
 * because in this corpus that is the likeliest first case: nine sessions still read as running.
 */
export function overlapsFor(workspaceId: string): {
  computedAt: string
  couldNotCompute: { overlapClass: OverlapClass; because: CouldNotDo }[]
  domains: OpenDomain[]
  overlaps: (OverlapFinding & { a: { id: string; basis: string }; b: { id: string; basis: string } })[]
  counts: { byRank: Record<string, number>; unknownPairs: number; readRead: number }
} {
  const domains = openDomainsIn(workspaceId)
  const ctx: ResolveContext = {
    workspaceId,
    repository: null,
    index: indexFor(workspaceId),
    indexedRepositories: indexedRepositoriesFor(workspaceId),
    pathsIn: scanFor(workspaceId),
    implementation: new ClaimsImplementation(workspaceId),
  }
  const dependents = ctx.implementation.dependents(ctx.repository, '')
  const sides = new Map(domains.map((d) => [d.id, sideOf(d, { ...ctx, repository: repositoryOf(d) })] as const))
  const overlaps: (OverlapFinding & { a: { id: string; basis: string }; b: { id: string; basis: string } })[] = []
  for (let i = 0; i < domains.length; i += 1) {
    for (let j = i + 1; j < domains.length; j += 1) {
      const first = domains[i]
      const second = domains[j]
      if (first === undefined || second === undefined) continue
      const left = sides.get(first.id)
      const right = sides.get(second.id)
      if (left === undefined || right === undefined) continue
      for (const finding of classifyOverlap(left, right)) {
        overlaps.push({ ...finding, a: { id: first.id, basis: left.basis }, b: { id: second.id, basis: right.basis } })
      }
    }
  }
  const byRank: Record<string, number> = {}
  for (const finding of overlaps) byRank[String(finding.rank)] = (byRank[String(finding.rank)] ?? 0) + 1
  return {
    computedAt: localStamp(new Date()),
    couldNotCompute: dependents.known ? [] : [{ overlapClass: 'interface_impact', because: dependents.because }],
    domains,
    overlaps: overlaps.sort((x, y) => y.rank - x.rank),
    counts: {
      byRank,
      unknownPairs: overlaps.filter((f) => f.unknown).length,
      readRead: overlaps.filter((f) => f.overlapClass === 'read_read').length,
    },
  }
}

// ============================================================================ who is working here

/** One domain's presence on one record, as a drawing asks for it. */
export interface PresenceHere {
  domainId: string
  domainTitle: string
  /**
   * THE AGENT'S NAME, NOT ITS RECORD ID. A card drawing `qW63QZFEI0QZ` beside a green dot tells a
   * reader nothing, and this product's rule is that a thing on screen is named after what it is to
   * the reader. The id is what is stored; the title is what a person reads. Empty string when the
   * domain named no agent — which the write path refuses today, so it means a record older than
   * that refusal.
   */
  agentId: string
  /** What the agent said it was doing. The one line a card can carry at the middle position. */
  objective: string
  /** Where the work stands. The OTHER dimension, never merged with `presence`. */
  stage: DomainStage
  /** Whether anybody is here, banded from an age. Never read from a stored state word. */
  presence: PresenceState
  /** Minutes since the last sign of work, or null when nothing has ever been seen. */
  quietForMinutes: number | null
  /** Which stored fact the age came from, in words. */
  lastSignFrom: string
  /** The worst overlap rank this domain is in, or null when it overlaps nothing. */
  worstOverlapRank: number | null
}

/** The presence read's answer. One key per record asked about, always. */
export interface PresenceReply {
  byRecord: Map<string, PresenceHere[]>
  /** How many open domains were compared, so a caller can say what the answer was computed over. */
  domainsRead: number
  couldNotCheck: { what: string; because: string }[]
}

/**
 * WHO IS WORKING ON EACH OF THESE RECORDS. THE READ A DRAWING MAKES, OVER THE CARDS ON SCREEN.
 *
 * ---------------------------------------------------------------------------------------
 * THE RECORD ID SET IS THE QUESTION, AND THAT IS NOT AN OPTIMISATION
 * ---------------------------------------------------------------------------------------
 *
 * A canvas draws nineteen cards out of a project with hundreds of records. Computing presence for
 * the whole project on every draw does the work of the project to draw nineteen marks, and does it
 * again on every press. Round ten wave 11's step 10 asked for this by name — *presence is computed
 * for the nodes on screen, not for a whole project on every draw* — and `tests/graph-presence.test.ts`
 * asserts the read is CALLED with the drawing's node id set, because a read that took the ids and
 * ignored them would look identical from outside.
 *
 * ---------------------------------------------------------------------------------------
 * TWO DIMENSIONS COME BACK, NEVER ONE WORD
 * ---------------------------------------------------------------------------------------
 *
 * `presence` says whether anybody is here and `stage` says where the work stands. The owner's
 * addendum section 3 forbids collapsing them into one status enum, and nothing in this reply does.
 * `presence` is an AGE banded by `presenceFromAge` — no stored state word is read anywhere in here,
 * because ten session records in this corpus say `running` and nine last wrote a fortnight ago.
 *
 * A RECORD NOBODY IS WORKING ON GETS AN EMPTY LIST AND NOT A MISSING KEY. A card drawing no presence
 * because nobody is here and a card drawing none because the read never ran are different facts.
 */
export function presenceOn(recordIds: readonly string[], workspaceId: string): PresenceReply {
  const byRecord = new Map<string, PresenceHere[]>()
  for (const id of recordIds) byRecord.set(id, [])
  if (recordIds.length === 0) return { byRecord, domainsRead: 0, couldNotCheck: [] }

  const asked = new Set(recordIds)
  const domains = openDomainsIn(workspaceId)
  const couldNotCheck: { what: string; because: string }[] = []

  // THE WORST RANK PER DOMAIN, COMPUTED ONCE. `overlapsFor` walks every pair of open domains; doing
  // it per record would run the same pair walk once for each card on the drawing.
  const worstRank = new Map<string, number>()
  if (domains.length > 1) {
    const found = overlapsFor(workspaceId)
    for (const overlap of found.overlaps) {
      for (const side of [overlap.a.id, overlap.b.id]) {
        const already = worstRank.get(side)
        if (already === undefined || overlap.rank > already) worstRank.set(side, overlap.rank)
      }
    }
    if (found.counts.unknownPairs > 0) {
      couldNotCheck.push({
        what: `${String(found.counts.unknownPairs)} of the overlaps between these domains`,
        because:
          'the covering rule could not tell whether the two entries cover each other, which is never the same ' +
          'answer as no',
      })
    }
  }

  // THE AGENTS' NAMES, READ ONCE. Every domain names a durable agent by record id and a card draws
  // a name, so the ids are resolved here rather than per card. A name Mole Office cannot find is left as
  // the empty string and the card falls back to the domain's own title — never to the raw id.
  const agentNames = new Map<string, string>()
  const wantedAgents = [...new Set(domains.map((one) => one.agentId).filter((one) => one !== ''))]
  if (wantedAgents.length > 0) {
    // IN PIECES (src/server/db/in-pieces.ts): every agent holding an open domain in the project is named, and nothing
    // caps how many agents do. The rows go into a map by id, so the order of the pieces does not matter.
    const rows = readInPieces(wantedAgents, (piece) => {
      const marks = piece.map(() => '?').join(',')
      return sqlite
        .prepare(`SELECT id, title FROM records WHERE id IN (${marks}) AND deleted_at IS NULL`)
        .all(...piece) as { id: string; title: string }[]
    })
    for (const row of rows) agentNames.set(row.id, row.title)
  }

  const now = Date.now()
  for (const domain of domains) {
    const reaches = aboutLinksOf(domain.id).filter((id) => asked.has(id))
    if (reaches.length === 0) continue
    const at = domain.lastSign.at === null ? null : parseLocalStamp(domain.lastSign.at)
    // A STAMP THAT WOULD NOT PARSE IS SAID, NOT SILENTLY AGED TO `never`. `never` means nothing has
    // been seen; an unreadable stamp means something was seen and could not be read.
    if (domain.lastSign.at !== null && at === null) {
      couldNotCheck.push({
        what: `how long ago work was seen on ${domain.title}`,
        because: `its last sign is stamped "${domain.lastSign.at}", which is not a stamp this reader can read`,
      })
    }
    const minutes = at === null ? null : Math.max(0, Math.round((now - at) / 60_000))
    const here: PresenceHere = {
      domainId: domain.id,
      domainTitle: domain.title,
      agentId: agentNames.get(domain.agentId) ?? '',
      objective: domain.objective,
      stage: domain.stage,
      presence: presenceFromAge(minutes),
      quietForMinutes: minutes,
      lastSignFrom: domain.lastSign.from,
      worstOverlapRank: worstRank.get(domain.id) ?? null,
    }
    for (const id of reaches) byRecord.get(id)!.push(here)
  }

  // Loudest first on every card, so a drawing never has to decide an order of its own.
  for (const list of byRecord.values()) {
    list.sort((a, b) => (b.worstOverlapRank ?? -1) - (a.worstOverlapRank ?? -1) || (a.quietForMinutes ?? Number.MAX_SAFE_INTEGER) - (b.quietForMinutes ?? Number.MAX_SAFE_INTEGER))
  }
  return { byRecord, domainsRead: domains.length, couldNotCheck }
}

/** What a domain says unqualified paths are relative to. An opaque key, never resolved. */
function repositoryOf(domain: OpenDomain): string | null {
  const held = domain.data['repository']
  return typeof held === 'string' && held !== '' ? held : null
}

// ============================================================================ the three writes

/**
 * THE ROUTE THAT OWNS A MACHINE-WRITTEN FIELD IS THE ONE WRITING IT, AND THIS IS HOW THAT IS KNOWN.
 *
 * `assertMayChangeThisDomain` refuses `resolved`, `responses`, `accepted` and `acknowledged` through
 * the ordinary records door. The three functions below write exactly those fields, through the same
 * `patchRecord` — so they need a way to say *this is the route that owns this field*, and it must
 * not be a way a caller can say it.
 *
 * IT IS NOT A KEY OF `RecordPatch` AND IT IS NOT A HEADER, both of which a caller could send. It is
 * a module-private flag that only the functions in THIS file can set, held across one synchronous
 * `patchRecord` call and cleared in a `finally`. SQLite is synchronous and this process writes one
 * record at a time, so there is no window in which a second write could see it raised.
 */
let theOwningRouteIsWriting = false

function asTheOwningRoute<T>(write: () => T): T {
  theOwningRouteIsWriting = true
  try {
    return write()
  } finally {
    theOwningRouteIsWriting = false
  }
}

/** The whole context one resolution needs, for a domain that may name its own repository. */
function contextFor(workspaceId: string, data: Record<string, unknown>): ResolveContext {
  return {
    workspaceId,
    repository: typeof data['repository'] === 'string' && data['repository'] !== '' ? data['repository'] : null,
    index: indexFor(workspaceId),
    indexedRepositories: indexedRepositoriesFor(workspaceId),
    pathsIn: scanFor(workspaceId),
    implementation: new ClaimsImplementation(workspaceId),
  }
}

/** The other open domains, as sides, for row 6 and for the accept reply. */
function otherSides(workspaceId: string, exceptId: string): DomainSide[] {
  const ctx = contextFor(workspaceId, {})
  return openDomainsIn(workspaceId)
    .filter((d) => d.id !== exceptId)
    .map((d) => sideOf(d, { ...ctx, repository: repositoryOf(d) }))
}

export interface ResolveReply {
  nothingWritten?: string
  domain: { id: string; title: string; version: string }
  resolution: Resolution
  differences: Difference[]
  overlaps: OverlapFinding[]
  note: string
}

/**
 * RESOLVE: what the machine makes of what the agent said, written as ITS OWN REVISION.
 *
 * IT IS A WRITE AND IT SAYS SO. It looks like a read and it is not: it stores what it concluded, so
 * a later session reads the conclusion instead of paying to recompute an opinion. Running it again
 * after the index improves writes another revision, and the history then holds both conclusions —
 * which is the point of keeping the provenance at all.
 *
 * IT NEVER RUNS ON THE CREATE PATH. Nothing on that path imports this function, and a create that
 * arrives carrying `resolved` is refused. That is what makes the ordering a property of the code.
 */
export function resolveWorkDomain(opts: {
  id: string
  workspaceId: string
  actor: Actor
  ifVersion?: string
}): ResolveReply {
  const record = requireDomain(opts.id, opts.workspaceId)
  const data = isObject(record.data) ? record.data : {}
  const ctx = contextFor(opts.workspaceId, data)
  const resolution = resolveDomain(data, ctx)
  const others = otherSides(opts.workspaceId, opts.id)
  const differences = differencesFor({ domainId: opts.id, data, resolution, ctx, others })

  const result = asTheOwningRoute(() =>
    patchRecord(
      opts.id,
      { dataPatch: { resolved: resolution as unknown as Record<string, unknown> }, ...(opts.ifVersion === undefined ? {} : { ifVersion: opts.ifVersion }) },
      opts.actor,
      { op: 'update', note: 'the resolve route wrote what the machine made of the declared scope' },
    ),
  )

  const mine = sideOf({ ...domainOf(record), data }, ctx)
  const overlaps = others.flatMap((other) => classifyOverlap(mine, other))
  const unanswered = differences.filter((d) => ROWS_THE_ACCEPT_GATE_REFUSES_ON.includes(d.row))
  return {
    ...(result.newSeq === null ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}),
    domain: { id: opts.id, title: record.title, version: versionOf(result.record) },
    resolution,
    differences,
    overlaps,
    note:
      `${String(differences.length)} difference${differences.length === 1 ? '' : 's'} between what you said and what ` +
      `Mole Office read, of which ${String(unanswered.length)} must be answered before this domain can be accepted. ` +
      `Row 6 — another session relying on something you are changing — is reported and never holds an accept open: ` +
      `it is about another agent's work, and an accept that could fail on a key you had never seen would be a lock ` +
      `wearing the word validation. Answer the rest with POST /api/work-domains/${opts.id}/accept.`,
  }
}

/**
 * ACCEPT: the responses and the accepted domain, in one call, because they are one decision.
 *
 * THE GATE. It refuses while any difference of the rows in `ROWS_THE_ACCEPT_GATE_REFUSES_ON` has no
 * response. Without it the whole mechanism is a suggestion: an agent would file a hypothesis, ignore
 * the diff, accept, and Mole Office would hold a record saying criticism happened when none did. It is
 * ordinary validation of an incomplete write and it is not a lock.
 *
 * AND IT IS COMPUTED OVER THE STORED RESOLUTION, not over a fresh one. A key that appears only under
 * a newer index is reported and never refuses, because otherwise an agent could be refused, answer,
 * and be refused again on a row that appeared in between — a loop with no exit and nobody at fault.
 *
 * `accepted` IS STATED BY THE AGENT AND IS NOT ASSEMBLED FROM THE OUTCOME WORDS. A rule that built
 * it out of eight words would be Mole Office deciding what the agent meant, in the one field every later
 * comparison reads.
 */
export function acceptWorkDomain(opts: {
  id: string
  workspaceId: string
  actor: Actor
  responses: WorkDomainResponse[]
  accepted: { writes?: string[]; creates?: string[]; dependsOn?: string[] }
  ifVersion?: string
}): { domain: { id: string; version: string }; accepted: AcceptedDomain; overlaps: OverlapFinding[]; note: string } {
  const record = requireDomain(opts.id, opts.workspaceId)
  const data = isObject(record.data) ? record.data : {}
  const stored = data['resolved']
  if (!isObject(stored)) {
    throw new PanelError(
      `This work domain has not been resolved yet, so there are no differences to answer and nothing to accept. ` +
        `Nothing was written. Ask for the resolution first: POST /api/work-domains/${opts.id}/resolve. The ordering ` +
        `is the point — what you believed and what the machine read are two statements, and accepting is what you ` +
        `say after seeing both.`,
      409,
    )
  }
  const ctx = contextFor(opts.workspaceId, data)
  const others = otherSides(opts.workspaceId, opts.id)
  const differences = differencesFor({
    domainId: opts.id,
    data,
    resolution: stored as unknown as Resolution,
    ctx,
    others,
  })

  const answeredKeys = new Set(opts.responses.map((r) => r.key).filter((k): k is string => typeof k === 'string'))
  const answeredRows = new Set(opts.responses.map((r) => r.row).filter((r): r is DiffRow => typeof r === 'string'))
  const unanswered = differences.filter(
    (d) => ROWS_THE_ACCEPT_GATE_REFUSES_ON.includes(d.row) && !answeredKeys.has(d.key) && !answeredRows.has(d.row),
  )
  if (unanswered.length > 0) {
    const shown = unanswered.slice(0, 10)
    throw new PanelError(
      `${String(unanswered.length)} difference${unanswered.length === 1 ? ' has' : 's have'} no answer, so nothing ` +
        `was written. Mole Office read your scope differently from the way you wrote it, and accepting without saying ` +
        `anything about that would leave a record saying criticism happened when none did. ` +
        `Unanswered: ${shown.map((d) => d.key).join(', ')}` +
        `${unanswered.length > shown.length ? `, and ${String(unanswered.length - shown.length)} more` : ''}. ` +
        `Answer one key at a time, or a whole row at once with {"row":"<row>","outcome":"accept"}. ` +
        `A row about ANOTHER session's work — other_domain_depends — is never in this list: it is reported, and ` +
        `what it asks for is an acknowledgement, not a response.`,
      400,
    )
  }

  const stamp = localStamp(new Date())
  const accepted: AcceptedDomain = {
    at: stamp,
    ...(isObject(stored['index']) ? { index: stored['index'] as AcceptedDomain['index'] } : {}),
    ...(typeof stored['at'] === 'string' ? { fromResolution: stored['at'] } : {}),
    ...(opts.accepted.writes === undefined ? {} : { writes: opts.accepted.writes }),
    ...(opts.accepted.creates === undefined ? {} : { creates: opts.accepted.creates }),
    ...(opts.accepted.dependsOn === undefined ? {} : { dependsOn: opts.accepted.dependsOn }),
    // RESOLVED ONCE, AT ACCEPTANCE, AND FROZEN. Every later overlap compares these, so two agents
    // are told the same thing about one pair whenever either of them looks.
    entries: [
      ...(opts.accepted.writes ?? []).map((entry) => resolveEntry(entry, ctx)),
      ...(opts.accepted.creates ?? []).map((entry) => resolveEntry(entry, ctx)),
      ...(opts.accepted.dependsOn ?? []).map((entry) => resolveEntry(entry, ctx)),
    ],
  }
  const stampedResponses = opts.responses.map((r) => ({ ...r, at: r.at ?? stamp }))

  const result = asTheOwningRoute(() =>
    patchRecord(
      opts.id,
      {
        dataPatch: {
          responses: stampedResponses as unknown as Record<string, unknown>[],
          accepted: accepted as unknown as Record<string, unknown>,
        },
        ...(opts.ifVersion === undefined ? {} : { ifVersion: opts.ifVersion }),
      },
      opts.actor,
      { op: 'update', note: 'the accept route wrote what the agent answered and what it accepted' },
    ),
  )

  const after = openDomainsIn(opts.workspaceId).find((d) => d.id === opts.id)
  const mine = after === undefined ? null : sideOf(after, ctx)
  const overlaps = mine === null ? [] : others.flatMap((other) => classifyOverlap(mine, other))
  return {
    ...(result.newSeq === null ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}),
    domain: { id: opts.id, version: versionOf(result.record) },
    accepted,
    overlaps,
    note:
      overlaps.length === 0
        ? `${result.newSeq === null ? nothingWrittenSentence({ kind: 'already-stored' }) : 'Accepted.'} No other open work domain in this project overlaps it.`
        : `${result.newSeq === null ? nothingWrittenSentence({ kind: 'already-stored' }) : 'Accepted, and nothing was refused.'} ${String(overlaps.length)} overlap` +
          `${overlaps.length === 1 ? '' : 's'} with other open work domains, worst first. Nothing here is a lock: ` +
          `both agents keep working, both are told, and what is asked of you is an acknowledgement — ` +
          `POST /api/work-domains/${opts.id}/acknowledge.`,
  }
}

/**
 * ACKNOWLEDGE: what this agent decided about one overlap. Advisory, and it refuses nobody anything.
 *
 * It refuses a KEY no current read produces, naming the ones that exist, because an acknowledgement
 * of an overlap that is not there is a statement about nothing. That is a refusal of a malformed
 * write, not of an act.
 */
export function acknowledgeOverlap(opts: {
  id: string
  workspaceId: string
  actor: Actor
  key: string
  stance: AcknowledgeStance
  note?: string
  ifVersion?: string
}): { domain: { id: string; version: string }; acknowledged: Acknowledgement; note: string } {
  const record = requireDomain(opts.id, opts.workspaceId)
  const data = isObject(record.data) ? record.data : {}
  const read = overlapsFor(opts.workspaceId)
  const mine = read.overlaps.filter((o) => o.a.id === opts.id || o.b.id === opts.id)
  if (!mine.some((o) => o.key === opts.key)) {
    throw new PanelError(
      `No overlap of this work domain is reported under the key "${opts.key}", so nothing was written. An ` +
        `acknowledgement of an overlap that is not there is a statement about nothing. ` +
        (mine.length === 0
          ? `Nothing overlaps this domain right now. GET /api/work-domains/overlaps is where they are read.`
          : `The keys reported right now: ${mine.slice(0, 10).map((o) => o.key).join(', ')}.`),
      400,
    )
  }
  const entry: Acknowledgement = {
    key: opts.key,
    stance: opts.stance,
    ...(opts.note === undefined ? {} : { note: opts.note }),
    at: localStamp(new Date()),
  }
  const held = Array.isArray(data['acknowledged']) ? (data['acknowledged'] as Acknowledgement[]) : []
  const result = asTheOwningRoute(() =>
    patchRecord(
      opts.id,
      {
        dataPatch: { acknowledged: [...held, entry] as unknown as Record<string, unknown>[] },
        ...(opts.ifVersion === undefined ? {} : { ifVersion: opts.ifVersion }),
      },
      opts.actor,
      { op: 'update', note: 'the acknowledge route wrote one stance about one overlap' },
    ),
  )
  return {
    domain: { id: opts.id, version: versionOf(result.record) },
    acknowledged: entry,
    note:
      `${STANCE_SAYS[opts.stance]} Nothing was locked, nothing was reserved and the other session was not stopped. ` +
      `Mole Office has no lease and no reservation anywhere in this mechanism: this repository holds nine unreleased ` +
      `resource claims, one for a process that has been gone for a fortnight, and a lock nobody releases is worse ` +
      `than no lock because a reader believes it.`,
  }
}

/** The record, refused with a sentence when it is not a live work domain in this project. */
function requireDomain(id: string, workspaceId: string): { id: string; title: string; data: unknown; version: string } {
  const record = recordInWorkspace(id, workspaceId)
  if (record.kind !== WORK_DOMAIN_KIND) {
    throw new PanelError(
      `${id} is ${withArticle(kindWord(record.kind, 'normal').text)}, not a work domain, so it has no scope to ` +
        `resolve and nothing to accept.`,
      400,
    )
  }
  return { id: record.id, title: record.title, data: record.data, version: versionOf(record) }
}

function domainOf(record: { id: string; title: string; data: unknown }): OpenDomain {
  const data = isObject(record.data) ? record.data : {}
  return {
    id: record.id,
    title: record.title,
    objective: typeof data['objective'] === 'string' ? data['objective'] : '',
    agentId: typeof data['agent'] === 'string' ? data['agent'] : '',
    sessionId: typeof data['session'] === 'string' ? data['session'] : '',
    stage: stageOf(data as { resolved?: unknown; accepted?: unknown; closedAt?: unknown }),
    basis: data['accepted'] === undefined || data['accepted'] === null ? 'stated' : 'accepted',
    data,
    lastSign: lastSignOf(record.id, typeof data['session'] === 'string' ? data['session'] : null),
  }
}

// ============================================================================ drift

/** One file that changed inside a domain's window, and where it falls against what was accepted. */
export interface DriftRow {
  path: string
  change: string
  bucket: 'expected' | 'arrived' | 'changed_a_dependency' | 'outside'
  says: string
  seenAt: string
  /** How the change was seen. Today there is one source and it says so rather than implying two. */
  seenBy: 'hashes'
  /** Which records the path serves, for an `outside` row. The new semantic scope. */
  modules?: string[]
  /** Which repository the observation was of, when a rebuild could name one. */
  repository?: string
}

export interface Drift {
  window: { from: string | null; to: string | null; width: string }
  /** True when the read could not say what changed, with the reason. Never an empty result. */
  couldNotSay: { because: string; scan?: string } | null
  rows: DriftRow[]
  counts: { expected: number; arrived: number; changedADependency: number; outside: number }
  attribution: { code: 'sole_open_domain' | 'several_open_domains'; openDomains: number; says: string }
  renewedCriticism: { owed: boolean; says: string }
  says: string
}

/**
 * WHAT HAS CHANGED SINCE THIS DOMAIN WAS ACCEPTED, FROM CONTENT HASHES AND NOTHING ELSE.
 *
 * ---------------------------------------------------------------------------------------
 * THE WINDOW, AND WHY IT IS PRINTED RATHER THAN IMPLIED
 * ---------------------------------------------------------------------------------------
 *
 * It begins at the build stamp of the index the domain was accepted against and ends at the newest
 * scan. A domain accepted while the index was built at 09:00, read after a scan at 17:00, has an
 * EIGHT-HOUR-WIDE WINDOW and cannot say when inside it each change happened. So the read prints the
 * width instead of implying a moment.
 *
 * ---------------------------------------------------------------------------------------
 * A FIRST SCAN INSIDE THE WINDOW STOPS THE READ REPORTING CHANGE AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * A rebuild with no previous index writes one `added` row per file in the repository. Bucketed, that
 * is the whole repository reported as outside the accepted domain, with nothing failing. So a scan
 * flagged `first_scan` inside the window makes this A COULD-NOT-SAY: the reply names the scan and
 * says Mole Office cannot say what changed in this window. It is not an empty result and it never reads
 * as *nothing changed*.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT CANNOT SEE, SAID PLAINLY RATHER THAN LEFT TO BE DISCOVERED
 * ---------------------------------------------------------------------------------------
 *
 * Nothing rescans by itself: this is what the newest scan saw, and the reply says when that was. A
 * file the index skips — a picture, a design document, anything a `.gitignore` covers — is invisible
 * to it, so a domain whose work is in `design/*.md` gets NO drift evidence rather than a clean one.
 * A change and a change back inside one window is one observation with the same hash and reads as
 * unchanged, which is exact rather than approximate: the content is what it was.
 *
 * AND IT DOES NOT SAY WHO CHANGED ANYTHING. A `file_observations` row says a file changed between
 * two scans. When more than one domain was open in the window, every one of them whose accepted set
 * does not cover the path is told, and each is told that Mole Office cannot say which. That is not a
 * failure of the read: two agents and one unexpected file is exactly the condition this exists for,
 * and both being told is the correct outcome.
 */
export function driftFor(domainId: string, workspaceId: string): Drift {
  const record = requireDomain(domainId, workspaceId)
  const data = isObject(record.data) ? record.data : {}
  const accepted = data['accepted']
  const nothingAccepted: Drift = {
    window: { from: null, to: null, width: 'no window' },
    couldNotSay: { because: 'This work domain has not been accepted yet, so there is nothing to compare against.' },
    rows: [],
    counts: { expected: 0, arrived: 0, changedADependency: 0, outside: 0 },
    attribution: { code: 'sole_open_domain', openDomains: 0, says: 'Nothing has been compared.' },
    renewedCriticism: { owed: false, says: 'Nothing has been accepted, so nothing can have drifted from it.' },
    says:
      `Drift is a comparison against the ACCEPTED domain, and this one has none. Resolve it, answer the ` +
      `differences and accept: POST /api/work-domains/${domainId}/accept.`,
  }
  if (!isObject(accepted)) return nothingAccepted

  const index = isObject(accepted['index']) ? accepted['index'] : null
  const from = index !== null && typeof index['builtAt'] === 'string' ? index['builtAt'] : null
  if (from === null) {
    return {
      ...nothingAccepted,
      couldNotSay: {
        because:
          'This domain was accepted against no file index, so its drift window has no beginning. Nothing can be ' +
          'compared. Build an index and accept again; the new acceptance carries the stamp the window starts from.',
      },
      says: 'Mole Office cannot say what has changed: this domain was accepted with no index to start a window from.',
    }
  }

  const newest = sqlite
    .prepare('SELECT built_at FROM source_index WHERE workspace_id = ? ORDER BY built_at DESC LIMIT 1')
    .get(workspaceId) as { built_at: string } | undefined
  const to = newest?.built_at ?? null

  // THE PREDICATE IS WORKSPACE AND STAMP, and `repository_id` is not in it. A rebuild that could not
  // name a repository wrote NULL, which means exactly one thing — the process scans one root — and a
  // window that excluded those rows would report nothing changed for every observation the older
  // rebuild made. Each row carries its repository out to the reply instead, so a reader can see
  // which of them Mole Office could place and which it could not.
  // AND THE FLOOR EXCLUDES THE ACCEPTING SCAN'S OWN ROWS, BY SCAN ID. Those rows describe the state
  // at the beginning of the window, not change inside it. Excluding them by STAMP would be wrong in
  // both directions at once: a build stamp is a wall-clock stamp to the second, so a strict `>`
  // drops a real change that landed in the same second, and a `>=` counts the accepting scan's own
  // observations as change. The id settles it exactly. When the accepting scan recorded nothing
  // there is no id and nothing to exclude, which is the honest case rather than a special one.
  const floorScan = isObject(index) && typeof index['scanId'] === 'string' ? index['scanId'] : null
  const rows = (
    sqlite
      .prepare(
        'SELECT scan_id, repository_id, path, change, seen_at, first_scan FROM file_observations ' +
          'WHERE workspace_id = ? AND seen_at >= ? ORDER BY seen_at, path',
      )
      .all(workspaceId, from) as {
    scan_id: string
    repository_id: string | null
    path: string
    change: string
    seen_at: string
    first_scan: number
  }[]
  ).filter((row) => floorScan === null || row.scan_id !== floorScan)

  const width = to === null || to === from ? 'a window of no width' : `from ${from} to ${to}`
  const openDomains = openDomainsIn(workspaceId).length
  const rebuiltFromNothing = rows.find((r) => r.first_scan === 1)
  if (rebuiltFromNothing !== undefined) {
    return {
      window: { from, to, width },
      couldNotSay: {
        because:
          `The file index was rebuilt from nothing on ${rebuiltFromNothing.seen_at}, so Mole Office cannot say what ` +
          `changed in this window. A rebuild with no previous index reports every file in the repository as added, ` +
          `which is a true statement about what the index holds and a false one about what changed.`,
        scan: rebuiltFromNothing.scan_id,
      },
      rows: [],
      counts: { expected: 0, arrived: 0, changedADependency: 0, outside: 0 },
      attribution: {
        code: openDomains > 1 ? 'several_open_domains' : 'sole_open_domain',
        openDomains,
        says: 'Nothing was attributed, because nothing was reported as changed.',
      },
      renewedCriticism: {
        owed: false,
        says: 'No criticism is owed on evidence Mole Office has said it cannot read.',
      },
      says: `Mole Office cannot say what changed in this window. The index was rebuilt from nothing inside it.`,
    }
  }

  const ctx = contextFor(workspaceId, data)
  const asEntries = (key: string): ResolvedEntry[] => {
    const held = accepted[key]
    const written = Array.isArray(held) ? held.filter((v): v is string => typeof v === 'string') : []
    const entries = Array.isArray(accepted['entries']) ? (accepted['entries'] as ResolvedEntry[]) : []
    return written.map(
      (w) => entries.find((e) => isObject(e) && e.asWritten === w) ?? resolveEntry(w, ctx),
    )
  }
  const writes = asEntries('writes')
  const creates = asEntries('creates')
  const dependsOn = asEntries('dependsOn')
  const covers = (entries: ResolvedEntry[], path: string): boolean =>
    entries.some((entry) => pathCovers(entry, { asWritten: path, path }) === 'yes')

  const out: DriftRow[] = []
  for (const row of rows) {
    const base = {
      path: row.path,
      change: row.change,
      seenAt: row.seen_at,
      seenBy: 'hashes' as const,
      ...(row.repository_id === null ? {} : { repository: row.repository_id }),
    }
    if (row.change === 'added' && covers(creates, row.path)) {
      out.push({ ...base, bucket: 'arrived', says: `The file you said you would create is there: "${row.path}".` })
      continue
    }
    if (covers(writes, row.path)) {
      out.push({ ...base, bucket: 'expected', says: `"${row.path}" changed, and you said you would change it.` })
      continue
    }
    if (covers(dependsOn, row.path)) {
      out.push({
        ...base,
        bucket: 'changed_a_dependency',
        says: `You changed "${row.path}", which you said you only relied on.`,
      })
      continue
    }
    out.push({
      ...base,
      bucket: 'outside',
      says: `"${row.path}" changed. It is not in your accepted domain.`,
      modules: ctx.implementation.serves(ctx.repository, row.path).map((r) => r.recordId),
    })
  }

  // WHETHER RENEWED CRITICISM IS OWED. Derived on every read and stored nowhere.
  //
  // IT IS "ARE THERE ROWS OUTSIDE", AND NOT "ARE THERE ROWS NEWER THAN THE ACCEPT". The window's
  // floor already excludes the accepting scan's own observations, so every row in it is a change the
  // accepted domain did not cover. And a SECOND accept moves `accepted.index` to a newer scan, which
  // shrinks the window and takes those rows out of it — so the comparison against a stamp would be
  // doing work the window has already done, and doing it at second resolution, where an accept and a
  // rebuild in the same second cannot be told apart.
  const outside = out.filter((r) => r.bucket === 'outside')
  const owed = outside.length > 0

  return {
    window: { from, to, width },
    couldNotSay: null,
    rows: out,
    counts: {
      expected: out.filter((r) => r.bucket === 'expected').length,
      arrived: out.filter((r) => r.bucket === 'arrived').length,
      changedADependency: out.filter((r) => r.bucket === 'changed_a_dependency').length,
      outside: outside.length,
    },
    attribution: {
      code: openDomains > 1 ? 'several_open_domains' : 'sole_open_domain',
      openDomains,
      says:
        openDomains > 1
          ? `${String(openDomains)} work domains were open, so Mole Office cannot say which of them changed these files. ` +
            `Every one whose accepted domain does not cover a path is told about it, which is the correct outcome ` +
            `rather than a failure of the read: two agents and one unexpected file is the condition this exists for.`
          : 'Only one work domain was open in this window.',
    },
    renewedCriticism: {
      owed,
      says: owed
        ? 'The accepted domain no longer covers the work. Accept again to say what it covers now.'
        : 'The accepted domain still covers the work.',
    },
    says:
      `${width}. ${String(outside.length)} file${outside.length === 1 ? '' : 's'} changed outside the accepted ` +
      `domain. This is what the newest scan saw and nothing rescans by itself, so a file the index skips — a ` +
      `picture, a design document, anything a .gitignore covers — is invisible here rather than reported as clean.`,
  }
}
