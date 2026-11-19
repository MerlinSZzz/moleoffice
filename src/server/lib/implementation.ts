// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE PROJECT MEANING LIVES IN THE IMPLEMENTED WORLD.
 *
 * ---------------------------------------------------------------------------------------
 * TWO TABLES, SPLIT BY WHO MAY WRITE, NOT BY WHAT THE ROW SAYS
 * ---------------------------------------------------------------------------------------
 *
 *   implementation_map       what a person or an agent STATED. Authored, exported, never
 *                            touched by a rebuild.
 *   implementation_findings  what a resolver WORKED OUT. Derived, rebuilt whole per repository,
 *                            never exported.
 *
 * The split is the same discipline `sourceindex.ts` already keeps between `records` and the file
 * index, one level up, and its header gives the reason in one sentence: A SCAN WOULD OVERWRITE
 * SOMETHING SOMEBODY WROTE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT `links` ROWS, WHICH IS THE FIRST THING ANYBODY ASKS
 * ---------------------------------------------------------------------------------------
 *
 * `links.from_id` and `links.to_id` are declared foreign keys to `records.id` (`schema.ts:308-313`)
 * and A PATH HAS NO RECORD. A.1 forbids minting one — *"Do not turn every source file into a normal
 * heavyweight Mole Office artifact"* — so a relationship between a record and code cannot be a link, and
 * the database is what refuses it rather than a rule somebody has to remember.
 *
 * THAT IS ALSO THE FIRST OF THE FIVE MECHANISMS THAT KEEP AN LLM GUESS OUT OF CANONICAL OWNERSHIP.
 * A.4: *"An LLM guess must not silently become canonical ownership."* The five:
 *
 *   1. The database refuses the strongest form of it. Canonical ownership of a block by a module is
 *      a `links` row of type `implements`, and a resolver cannot write one, whatever it infers.
 *   2. `implementation_findings` HAS NO COLUMN THAT COULD NAME A SECOND RECORD, and nothing in this
 *      file touches `links`. `tests/implementation-map-boundary.test.ts` greps this file for
 *      `INSERT INTO links`, `createLink` and `logChange(… 'link' …)` and fails if any appears — a
 *      grep test rather than a comment. The rule
 *      was quietly false for two months when it was only a comment.
 *   3. A guessed row is in a different table from a computed one and neither is in the canonical
 *      one. Every count that means ownership excludes `guessed` rows.
 *   4. Acceptance is a governance act, so only a person may perform it —
 *      `assertMayAcceptAGuess` in lib/records/implementation-map-gates.ts, refused at the write.
 *   5. Every reader is told, including the normal one. `authorityOf` in @shared/implementation.ts.
 *
 * ---------------------------------------------------------------------------------------
 * AND A RESOLVER NEVER OVERWRITES A PERSON EITHER
 * ---------------------------------------------------------------------------------------
 *
 * The reverse of A.4 is L's *"let deterministic mappings silently overwrite Agent judgment;"*. A
 * rebuild deletes only `implementation_findings` rows for the repository it rebuilt. It cannot
 * reach `implementation_map`. When a person's statement and a resolver's finding disagree about the
 * same file, BOTH SURVIVE and the read reports the disagreement. There is no reconciliation step
 * and no winner, because J says *"Preserve Agent-versus-resolver disagreement and criticism."*
 *
 * THE MECHANISM THAT PREVENTS BOTH DIRECTIONS IS THAT THERE IS NO OVERWRITE PATH IN THE PRODUCT AT
 * ALL. The unique index includes `provenance`, so a person's statement and an agent's guess about
 * the same pattern are two rows that coexist. Nothing here updates a `pattern`, a `relation` or a
 * `provenance` on a row that exists.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { anOfficeId } from './ids.ts'
import { claimProblem, filesMatching } from '@shared/paths.ts'
import {
  authorityOf,
  isProvenance,
  isRelation,
  type Authority,
  type Provenance,
  type Relation,
} from '@shared/implementation.ts'
import type { ReindexReport, SourceFile } from '@shared/types.ts'
import { sqlite } from '../db/client.ts'
import { appendFileObservations } from './append-file-observations.ts'
import {
  assertMayAcceptAGuess,
  assertMayRetireSomebodyElsesRow,
  getRecord,
  type Actor,
} from './records.ts'
import { logChange } from './log-change.ts'
import { PanelError } from './panel-error.ts'
import { localStamp } from '@shared/time.ts'
import { checkedRoot } from './repositories.ts'
import { repositoryById } from '../db/repository-by-id.ts'
import { reindexReport, scanTree } from './sourceindex.ts'
import { aliasesFrom, RESOLVERS, type FindingRow } from './resolvers/index.ts'
import { MAP_COLUMNS } from '../db/stated-for.ts'
import { toStated } from '../db/stated-for.ts'
import { statedInRepository } from '../db/stated-in-repository.ts'
import { RECORD_KINDS_THAT_OWN_CODE } from '@shared/record-kinds-that-own-code.ts'

export { RECORD_KINDS_THAT_OWN_CODE } from '@shared/record-kinds-that-own-code.ts'

// ============================================================================ rows as read

/** One row of `implementation_map`, as every reader gets it. */
export interface StatedRelationship {
  id: string
  workspaceId: string
  recordId: string
  repositoryId: string
  pattern: string
  relation: Relation
  provenance: Provenance
  note: string | null
  revisionId: string | null
  statedAt: string
  statedBy: string
  acceptedAt: string | null
  acceptedBy: string | null
  /** Set when somebody removed it. A soft delete, the way `records` does it. */
  deletedAt: string | null
  /** Computed from the three above it. NEVER a column — see @shared/implementation.ts. */
  authority: Authority
}

export interface MapRow {
  id: string
  workspace_id: string
  record_id: string
  repository_id: string
  pattern: string
  relation: string
  provenance: string
  note: string | null
  revision_id: string | null
  stated_at: string
  stated_by: string
  accepted_at: string | null
  accepted_by: string | null
  deleted_at: string | null
}

export { MAP_COLUMNS } from '../db/stated-for.ts'

export { toStated } from '../db/stated-for.ts'

/** One row of `implementation_revisions`. An opaque string Mole Office stores and never resolves. */
export interface CodeRevision {
  id: string
  workspaceId: string
  repositoryId: string
  ref: string
  label: string | null
  note: string | null
  statedAt: string
  statedBy: string
}

// ============================================================================ reads over the map

export { statedFor } from '../db/stated-for.ts'

export { statedInRepository } from '../db/stated-in-repository.ts'

/** One row by id, inside one workspace, deleted rows included so a second delete can say so. */
export function statedById(id: string, workspaceId: string): StatedRelationship | null {
  const row = sqlite
    .prepare(`SELECT ${MAP_COLUMNS} FROM implementation_map WHERE id = ? AND workspace_id = ?`)
    .get(id, workspaceId) as MapRow | undefined
  return row === undefined ? null : toStated(row)
}

/**
 * Every file of one repository the index holds, in path order.
 *
 * SCOPED BY REPOSITORY AND NOT ONLY BY WORKSPACE, which is the whole point of the key change window
 * A made: two repositories may both hold `src/index.ts`. Rows written before repositories had ids
 * carry NULL and are not this repository's, so they are not returned — a repository that has never
 * been rebuilt under its own id has no files, `matched` is 0 everywhere, and the read says the
 * index has not been built rather than saying the pattern matches nothing.
 */
export function filesInRepository(workspaceId: string, repositoryId: string): string[] {
  const rows = sqlite
    .prepare('SELECT path FROM source_files WHERE workspace_id = ? AND repository_id = ? ORDER BY path')
    .all(workspaceId, repositoryId) as { path: string }[]
  return rows.map((r) => r.path)
}

// ============================================================================ declaring one

export interface DeclareRelationship {
  workspaceId: string
  recordId: string
  repositoryId: string
  pattern: string
  relation?: string
  note?: string | null
  revisionId?: string | null
  /**
   * An agent saying *this is a guess*. It is what makes the row `llm` rather than `declared`.
   *
   * AN AGENT MAY DO EITHER, AND THAT IS DELIBERATE. An agent that has read the code and is stating
   * a fact is not guessing, and forcing it to mark everything as a guess would make the mark mean
   * nothing.
   */
  proposing?: boolean
  actor: Actor
}

/** What one declaration wrote, and what it matches right now. */
export interface Declared {
  row: StatedRelationship
  /** How many files the pattern matches TODAY, so the writer sees at once whether it hit anything. */
  matched: number
  /** Null when this repository has no index yet, which is not the same as matching nothing. */
  indexBuilt: boolean
  note: string
}

/**
 * Declare — or propose — that a record is implemented, tested or configured by some code.
 *
 * THE PATTERN IS STORED AND THE FILE LIST IS NOT. A resolved list would be a second copy of
 * something `filesMatching` can produce, stale the moment a file is added. `matched` below is
 * computed for the answer and stored nowhere.
 */
export function declareRelationship(opts: DeclareRelationship): Declared {
  const pattern = opts.pattern.trim()
  const problem = claimProblem(pattern)
  if (problem !== null) {
    // `claimProblem` COMPLETES THE SENTENCE «pattern» …, AND IT IS ALREADY PUNCTUATED WHEN IT HAS
    // MORE THAN ONE THING TO SAY. This used to add a full stop and a second copy of the advice
    // unconditionally, and a person typing an absolute path into Add code read:
    //
    //   "/etc/passwd" is an absolute path. Claims are written relative to the repository root —
    //   "src/web/components" rather than the full path. An absolute path belongs in `paths`, which
    //   points at material outside this repository.. Nothing was written. A pattern is written
    //   relative to the repository — "src/web/components" rather than the full path.
    //
    // Two full stops together, and the same instruction twice in one refusal. Found by using Add
    // code in a browser on 26 August 2026. The advice belongs to `claimProblem`, which is the one
    // place that knows which mistake was made — and it is the same text the Source page draws
    // beside a module's own claim, so it has to be complete on its own.
    const said = problem.endsWith('.') ? problem : `${problem}.`
    throw new PanelError(`"${opts.pattern}" ${said} Nothing was written.`)
  }

  const relation = opts.relation ?? 'implements'
  if (!isRelation(relation)) {
    throw new PanelError(
      `"${relation}" is not a relation this map has a word for. It takes "implements" — this code is where the ` +
        `meaning lives — "tests" — this code checks it — and "configures" — this code sets it up or builds it. ` +
        `There is deliberately no "depends_on": a record's dependency on code it does not own is worked out at ` +
        `read time from this map and the import graph, rather than stored a second time here.`,
    )
  }

  const record = getRecord(opts.recordId)
  if (record === null || record.workspaceId !== opts.workspaceId) {
    throw new PanelError(`No record ${opts.recordId} in this project.`, 404)
  }
  if (record.deletedAt !== null) {
    throw new PanelError(
      `"${record.title}" was deleted on ${record.deletedAt}. Restore it first — POST /api/records/${record.id}/restore ` +
        `— and then say what code it owns; a relationship written onto a deleted record is a statement nothing draws.`,
    )
  }
  if (!(RECORD_KINDS_THAT_OWN_CODE as readonly string[]).includes(record.kind)) {
    throw new PanelError(
      `"${record.title}" is a ${record.kind}, and a relationship to code is about a structural thing: a module, a ` +
        `block or a pipeline. A ${record.kind} does not own code. If this ${record.kind} is ABOUT some code, link ` +
        `it to the module that owns it.`,
    )
  }

  const repository = repositoryById(opts.repositoryId, opts.workspaceId)
  if (repository === null) {
    throw new PanelError(
      `No repository ${opts.repositoryId} in this project. GET /api/implementation/repositories lists them, and ` +
        `POST /api/implementation/repositories registers one. A pattern means nothing without the tree it is ` +
        `relative to.`,
      404,
    )
  }

  // PROVENANCE IS SET FROM THE ACTOR AND FROM WHAT IT SAID IT WAS DOING, never from the request
  // body directly. `llm` means LLM INFERENCE, so a person cannot write one: a human proposing is a
  // human declaring, and letting a person file a row that reads "a machine guessed this" would put
  // a mark on the corpus that means the opposite of what happened.
  const proposing = opts.proposing === true
  if (proposing && opts.actor.type === 'human') {
    throw new PanelError(
      `"proposing" marks a row as a machine's inference — it is what makes the row a guess a person still has to ` +
        `accept. This request came from a person, so there is nobody to accept it: what you write is already ` +
        `stated. Send it without "proposing".`,
    )
  }
  const provenance: Provenance = proposing ? 'llm' : 'declared'

  const clash = sqlite
    .prepare(
      `SELECT ${MAP_COLUMNS} FROM implementation_map WHERE workspace_id = ? AND record_id = ? AND repository_id = ? ` +
        'AND pattern = ? AND relation = ? AND deleted_at IS NULL',
    )
    .all(opts.workspaceId, opts.recordId, opts.repositoryId, pattern, relation) as MapRow[]

  const exact = clash.find((row) => row.provenance === provenance)
  if (exact !== undefined) {
    throw new PanelError(
      `"${pattern}" is already on "${record.title}" as ${relation}, ${provenance === 'declared' ? 'stated' : 'proposed'} ` +
        `by ${exact.stated_by} on ${exact.stated_at} — row ${exact.id}. Nothing was written and that row is ` +
        `untouched. To change what it says, delete it and write the new one; there is no overwrite path in this ` +
        `product at all, because an overwrite is how one side of a disagreement disappears.`,
      409,
    )
  }
  // A PERSON RESTATING AN AGENT'S UN-ACCEPTED GUESS IS ALMOST CERTAINLY MEANING TO ACCEPT IT, and
  // two rows saying the same thing would leave the guess sitting in the proposed list for ever with
  // nobody to answer it. The refusal names the route that does what they meant.
  const guess = clash.find(
    (row) => authorityOf(row.provenance as Provenance, row.accepted_at, row.accepted_by) === 'guessed',
  )
  if (guess !== undefined && opts.actor.type === 'human') {
    throw new PanelError(
      `${guess.stated_by} already proposed "${pattern}" on "${record.title}" as ${relation}, on ${guess.stated_at}, ` +
        `and nobody has answered it — row ${guess.id}. Writing your own beside it would leave theirs waiting for ` +
        `ever. ACCEPT IT INSTEAD: POST /api/implementation/${guess.id}/accept. The row then says what really ` +
        `happened — an agent proposed this and you accepted it on this day — which is not the same as you having ` +
        `declared it, and Mole Office will not say the second when the first is true.`,
      409,
    )
  }

  const at = localStamp(new Date())
  const row: MapRow = {
    id: anOfficeId(),
    workspace_id: opts.workspaceId,
    record_id: opts.recordId,
    repository_id: opts.repositoryId,
    pattern,
    relation,
    provenance,
    note: opts.note ?? null,
    revision_id: opts.revisionId ?? null,
    stated_at: at,
    stated_by: `${opts.actor.type}:${opts.actor.id}`,
    accepted_at: null,
    accepted_by: null,
    deleted_at: null,
  }
  if (row.revision_id !== null) {
    const revision = sqlite
      .prepare('SELECT id FROM implementation_revisions WHERE id = ? AND workspace_id = ? AND repository_id = ?')
      .get(row.revision_id, opts.workspaceId, opts.repositoryId) as { id: string } | undefined
    if (revision === undefined) {
      throw new PanelError(
        `No code revision ${row.revision_id} in "${repository.name}". POST /api/implementation/revisions records ` +
          `one; Mole Office stores the string you supply and never resolves it.`,
        404,
      )
    }
  }

  sqlite.transaction(() => {
    sqlite
      .prepare(
        'INSERT INTO implementation_map (id, workspace_id, record_id, repository_id, pattern, relation, provenance, ' +
          'note, revision_id, stated_at, stated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        row.id,
        row.workspace_id,
        row.record_id,
        row.repository_id,
        row.pattern,
        row.relation,
        row.provenance,
        row.note,
        row.revision_id,
        row.stated_at,
        row.stated_by,
      )
    // SOMEBODY SAYING WHAT CODE A RECORD OWNS IS A THING THAT HAPPENED TO THAT RECORD, so it
    // belongs on the daily page. A rebuild never writes here, so the flooding argument that keeps
    // `source_files` out of `records` does not apply: this table takes what people write and
    // nothing else.
    logChange(opts.recordId, 'update', opts.actor, `implementation.${relation}`, null, pattern)
  })()

  const files = filesInRepository(opts.workspaceId, opts.repositoryId)
  const indexBuilt = files.length > 0
  const matched = filesMatching(pattern, files).length
  return {
    row: toStated(row),
    matched,
    indexBuilt,
    note: !indexBuilt
      ? `Written. "${repository.name}" has no index of its own yet, so Mole Office cannot say what this pattern covers — ` +
        `that is not the same as it covering nothing. POST /api/implementation/rebuild builds one.`
      : matched === 0
        ? `Written, and it matches none of the ${files.length} files in "${repository.name}" today. That is not a ` +
          `refusal — a pattern may name code that does not exist yet — but if it was meant to match something now, ` +
          `check the spelling against GET /api/implementation/files.`
        : `Written, and it covers ${matched} of the ${files.length} files in "${repository.name}" today.`,
  }
}

// ============================================================================ accepting a guess

/** What accepting one did. Both facts survive it: an agent proposed this, a person accepted it. */
export interface Accepted {
  row: StatedRelationship
  note: string
}

/**
 * Accept a guess, which is what turns it into ownership.
 *
 * IT DOES NOT ALTER `provenance`. The corpus keeps both facts — an agent proposed this, and a named
 * person accepted it on a named day — so a read of an accepted row says exactly that. IT NEVER SAYS
 * *the person declared this*, because they did not.
 *
 * ONE `:id` SPACE, AND A FINDINGS ID IS REFUSED IN IT. A findings id is a real id drawn on screen,
 * and it is stable only until the next rebuild, so this looks there on a miss and says what it is
 * rather than answering "no such row", which would be true and useless.
 *
 * `theAct` is the act as the accept door declares it, read from its route, so a person who is not proved reads which
 * act was refused rather than "This act".
 */
export function acceptGuess(id: string, workspaceId: string, actor: Actor, theAct?: string): Accepted {
  const row = statedById(id, workspaceId)
  if (row === null) {
    refuseAFindingsId(id, workspaceId, 'accept')
    throw new PanelError(`No relationship ${id} in this project.`, 404)
  }
  if (row.deletedAt !== null) {
    throw new PanelError(`Relationship ${id} was deleted on ${row.deletedAt}. Nothing was written.`, 409)
  }
  if (row.authority !== 'guessed') {
    throw new PanelError(
      row.authority === 'stated'
        ? `Row ${id} is already stated${row.acceptedBy === null ? '' : ` — ${row.acceptedBy} accepted it on ${row.acceptedAt}`}. ` +
          `There is nothing to accept. Nothing was written.`
        : `Row ${id} is something Mole Office worked out from the code itself, not somebody's guess. A computed row is ` +
          `not accepted, it is RECOMPUTED — the next rebuild either produces it again or does not, which is the ` +
          `honest answer about a fact that lives in the tree. If you want to state it as yours, write it: ` +
          `POST /api/implementation.`,
      409,
    )
  }

  assertMayAcceptAGuess({ id: row.id, recordId: row.recordId, pattern: row.pattern, provenance: row.provenance }, actor, theAct)

  const at = localStamp(new Date())
  const by = `${actor.type}:${actor.id}`
  sqlite.transaction(() => {
    sqlite.prepare('UPDATE implementation_map SET accepted_at = ?, accepted_by = ? WHERE id = ?').run(at, by, id)
    logChange(row.recordId, 'update', actor, `implementation.accepted`, row.statedBy, row.pattern)
  })()

  const after = statedById(id, workspaceId)
  if (after === null) throw new PanelError(`Relationship ${id} disappeared during its own acceptance.`, 500)
  return {
    row: after,
    note:
      `"${row.pattern}" now counts as ownership. It still says ${row.statedBy} proposed it — the provenance is ` +
      `untouched — and it now also says ${by} accepted it on ${at}. Those are two different facts and Mole Office keeps ` +
      `both: a read of this row will never say you declared it, because you did not.`,
  }
}

/**
 * Soft-delete one, the way `records` does it.
 *
 * A RELATIONSHIP SOMEBODY WROTE AND SOMEBODY ELSE REMOVED IS A THING THAT HAPPENED, and the change
 * log names it. `assertMayRetireSomebodyElsesRow` refuses a non-human when a person wrote the row.
 */
export function retireRelationship(id: string, workspaceId: string, actor: Actor): { row: StatedRelationship; note: string } {
  const row = statedById(id, workspaceId)
  if (row === null) {
    refuseAFindingsId(id, workspaceId, 'delete')
    throw new PanelError(`No relationship ${id} in this project.`, 404)
  }
  if (row.deletedAt !== null) {
    return { row, note: `Row ${id} was already deleted, so nothing was written and that date still stands.` }
  }
  assertMayRetireSomebodyElsesRow(
    { id: row.id, recordId: row.recordId, pattern: row.pattern, statedBy: row.statedBy },
    actor,
  )
  const at = localStamp(new Date())
  sqlite.transaction(() => {
    sqlite.prepare('UPDATE implementation_map SET deleted_at = ? WHERE id = ?').run(at, id)
    logChange(row.recordId, 'delete', actor, `implementation.${row.relation}`, row.pattern, null)
  })()
  const after = statedById(id, workspaceId)
  return {
    row: after ?? row,
    note: `"${row.pattern}" is off this record. The row is still there with its date and its author — a soft delete, the way records does it — so the change log can say what happened.`,
  }
}

/**
 * A findings id sent to a route that addresses the map: say what it is rather than "no such row".
 *
 * Answering *no such row* would be true and useless. A findings id is drawn on screen, in the
 * `suggested` list, and somebody pressing accept on one has made a reasonable mistake.
 */
function refuseAFindingsId(id: string, workspaceId: string, act: 'accept' | 'delete'): void {
  const finding = sqlite
    .prepare('SELECT record_id, path FROM implementation_findings WHERE id = ? AND workspace_id = ?')
    .get(id, workspaceId) as { record_id: string; path: string } | undefined
  if (finding === undefined) return
  throw new PanelError(
    `${id} is a row a resolver worked out about "${finding.path}", not somebody's statement. It is replaced whole ` +
      `by the next rebuild, so there is nothing to ${act} and it would come back. TO MAKE IT YOURS, STATE IT: ` +
      `POST /api/implementation {"recordId":"${finding.record_id}","repositoryId":"<which repository>",` +
      `"pattern":"${finding.path}","relation":"implements"}.`,
    409,
  )
}

// ============================================================================ code revisions

/**
 * Record a code revision identifier a caller supplied.
 *
 * MOLE OFFICE STORES IT AND NEVER RESOLVES IT. That is K.6's whole answer: *"Verify PanelX links semantic
 * project history to implementation revisions without pretending to replace Git file/commit
 * history."* Nothing here parses the string, nothing orders two of them, nothing asks whether one
 * is an ancestor of another, and nothing spawns a process to find out.
 *
 * THERE IS NO `kind` COLUMN saying whether this is a commit, a tag or a branch. Those are Git's
 * words, Mole Office cannot check any of them, and a column holding an unverifiable classification is
 * the fifth engineering rule broken with extra steps. A caller who wants to say what it is writes
 * it in `note`.
 */
export function recordRevision(opts: {
  workspaceId: string
  repositoryId: string
  ref: string
  label?: string | null
  note?: string | null
  actor: Actor
}): CodeRevision {
  const ref = opts.ref.trim()
  if (ref === '') {
    throw new PanelError(
      'A code revision needs the string that identifies it. Mole Office does not parse it, so any string your tooling ' +
        'uses is fine — a commit hash, a tag, a build number. What it must not be is empty, because then it ' +
        'identifies nothing.',
    )
  }
  const repository = repositoryById(opts.repositoryId, opts.workspaceId)
  if (repository === null) throw new PanelError(`No repository ${opts.repositoryId} in this project.`, 404)

  const existing = sqlite
    .prepare(
      'SELECT id, workspace_id, repository_id, ref, label, note, stated_at, stated_by FROM implementation_revisions ' +
        'WHERE workspace_id = ? AND repository_id = ? AND ref = ?',
    )
    .get(opts.workspaceId, opts.repositoryId, ref) as CodeRevisionRow | undefined
  if (existing !== undefined) {
    throw new PanelError(
      `"${ref}" is already recorded against "${repository.name}" — ${existing.id}, by ${existing.stated_by} on ` +
        `${existing.stated_at}. Nothing was written. One string, one row: Mole Office cannot tell two spellings of one ` +
        `revision apart, so it does not pretend to.`,
      409,
    )
  }

  const row: CodeRevisionRow = {
    id: anOfficeId(),
    workspace_id: opts.workspaceId,
    repository_id: opts.repositoryId,
    ref,
    label: opts.label ?? null,
    note: opts.note ?? null,
    stated_at: localStamp(new Date()),
    stated_by: `${opts.actor.type}:${opts.actor.id}`,
  }
  sqlite
    .prepare(
      'INSERT INTO implementation_revisions (id, workspace_id, repository_id, ref, label, note, stated_at, stated_by) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(row.id, row.workspace_id, row.repository_id, row.ref, row.label, row.note, row.stated_at, row.stated_by)
  return toRevision(row)
}

interface CodeRevisionRow {
  id: string
  workspace_id: string
  repository_id: string
  ref: string
  label: string | null
  note: string | null
  stated_at: string
  stated_by: string
}

function toRevision(row: CodeRevisionRow): CodeRevision {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    repositoryId: row.repository_id,
    ref: row.ref,
    label: row.label,
    note: row.note,
    statedAt: row.stated_at,
    statedBy: row.stated_by,
  }
}

/** Every code revision recorded against one repository, newest first. */
export function listRevisions(repositoryId: string, workspaceId: string): CodeRevision[] {
  const rows = sqlite
    .prepare(
      'SELECT id, workspace_id, repository_id, ref, label, note, stated_at, stated_by FROM implementation_revisions ' +
        'WHERE workspace_id = ? AND repository_id = ? ORDER BY stated_at DESC, id',
    )
    .all(workspaceId, repositoryId) as CodeRevisionRow[]
  return rows.map(toRevision)
}

/** The un-accepted guesses on live records, which is what waits on a person. */
export function guessesNobodyHasAnswered(): { id: string; workspaceId: string; recordId: string; pattern: string; statedAt: string }[] {
  const rows = sqlite
    .prepare(
      `SELECT m.id AS id, m.workspace_id AS workspace_id, m.record_id AS record_id, m.pattern AS pattern, ` +
        `m.stated_at AS stated_at, m.provenance AS provenance, m.accepted_at AS accepted_at, ` +
        `m.accepted_by AS accepted_by FROM implementation_map m JOIN records r ON r.id = m.record_id ` +
        `WHERE m.deleted_at IS NULL AND r.deleted_at IS NULL`,
    )
    .all() as {
    id: string
    workspace_id: string
    record_id: string
    pattern: string
    stated_at: string
    provenance: string
    accepted_at: string | null
    accepted_by: string | null
  }[]
  return rows
    .filter((row) => {
      if (!isProvenance(row.provenance)) return false
      return authorityOf(row.provenance, row.accepted_at, row.accepted_by) === 'guessed'
    })
    .map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      recordId: row.record_id,
      pattern: row.pattern,
      statedAt: row.stated_at,
    }))
}

// ============================================================================ findings, rebuilt whole

/** One row of `implementation_findings`, as every reader gets it. */
export interface Finding {
  id: string
  recordId: string
  repositoryId: string
  path: string
  relation: Relation
  provenance: Provenance
  evidencePath: string
  evidenceDetail: string
  builtAt: string
  /** Computed. A finding is `computed` and can never be anything else — nothing accepts one. */
  authority: Authority
}

interface FindingDbRow {
  id: string
  record_id: string
  repository_id: string
  path: string
  relation: string
  provenance: string
  evidence_path: string
  evidence_detail: string
  built_at: string
}

function toFinding(row: FindingDbRow): Finding {
  const provenance = row.provenance as Provenance
  return {
    id: row.id,
    recordId: row.record_id,
    repositoryId: row.repository_id,
    path: row.path,
    relation: row.relation as Relation,
    provenance,
    evidencePath: row.evidence_path,
    evidenceDetail: row.evidence_detail,
    builtAt: row.built_at,
    // NEVER ACCEPTED. A findings row has no `accepted_at`, so `authorityOf` reads nulls and the
    // answer is the tier of the provenance. A computed row is not accepted, it is recomputed.
    authority: authorityOf(provenance, null, null),
  }
}

const FINDING_COLUMNS =
  'id, record_id, repository_id, path, relation, provenance, evidence_path, evidence_detail, built_at'

/**
 * Every finding about one record, joined to live records by the caller.
 *
 * `record_id` IS NOT A DECLARED FOREIGN KEY, so a finding about a record somebody deleted between
 * the scan and the write is possible. The read joins to live records and drops the rest, which is
 * what `coverage()` already does with modules; the next rebuild removes them properly.
 */
export function findingsFor(recordId: string, workspaceId: string): Finding[] {
  const rows = sqlite
    .prepare(
      `SELECT ${FINDING_COLUMNS} FROM implementation_findings WHERE workspace_id = ? AND record_id = ? ` +
        'ORDER BY path',
    )
    .all(workspaceId, recordId) as FindingDbRow[]
  return rows.map(toFinding)
}

/** Every finding about one file. */
export function findingsForPath(repositoryId: string, path: string, workspaceId: string): Finding[] {
  const rows = sqlite
    .prepare(
      `SELECT ${FINDING_COLUMNS} FROM implementation_findings WHERE workspace_id = ? AND repository_id = ? ` +
        'AND path = ? ORDER BY record_id',
    )
    .all(workspaceId, repositoryId, path) as FindingDbRow[]
  return rows.map(toFinding)
}

/** How many OTHER records the same file was suggested for. What makes a shared file legible. */
export function alsoSuggestedFor(repositoryId: string, workspaceId: string): Map<string, number> {
  const rows = sqlite
    .prepare(
      'SELECT path, count(DISTINCT record_id) AS c FROM implementation_findings ' +
        'WHERE workspace_id = ? AND repository_id = ? GROUP BY path',
    )
    .all(workspaceId, repositoryId) as { path: string; c: number }[]
  return new Map(rows.map((r) => [r.path, r.c]))
}

/** What one rebuild of one repository did. */
export interface RebuiltRepository {
  repositoryId: string
  repositoryName: string
  root: string
  builtAt: string
  fileCount: number
  scanMs: number
  /** The existing file-by-file comparison, which `rebuildIndex` already computes. */
  report: ReindexReport
  /**
   * The scan this rebuild appended to `file_observations`, and how many rows it wrote.
   *
   * NAMED BY ITS ID AND NOT BY ITS STAMP: `built_at` is a wall-clock stamp to the second, so two
   * rebuilds inside one second share one. A reply that has to name a scan names this.
   */
  observed: { scanId: string; rows: number }
  findingsWritten: number
  /** Per resolver, so a resolver that found nothing is distinguishable from one that did not run. */
  resolvers: { provenance: Provenance; ran: boolean; needs: string; note: string; rows: number }[]
  unresolvedSpecifiers: { count: number; first: string[] }
  outsideTheRepository: number
  /** Stated rows that matched at least one file before and match none now. */
  wentStale: { rowId: string; recordId: string; pattern: string }[]
  /** Stated rows that matched none before and match at least one now. */
  cameBack: { rowId: string; recordId: string; pattern: string }[]
  /**
   * True when there was nothing of this tree to compare against, so neither list is offered.
   *
   * A RE-POINT IS NOT A RENAME. After a root moves there is no previous build of this repository,
   * and comparing a build of one tree against a build of a different tree would report every
   * difference between two checkouts as a change inside one.
   */
  firstBuild: boolean
  note: string
}

/**
 * Rebuild one repository: the file index, then the findings.
 *
 * `scanTree` RUNS FIRST AND OUTSIDE THE TRANSACTION, and that is not an accident of style. SQLite
 * has one writer. A filesystem walk inside the write lock stops every other write to Mole Office for the
 * length of it — 268 ms on this checkout, and A.1's own scale is *"tens of thousands of files"*. An
 * earlier draft of this design said "in one transaction" over all five steps; that is a regression
 * hiding inside the word *unchanged*, and this comment is why nobody should rebuild it.
 *
 * `implementation_map` IS READ AND IS NEVER WRITTEN OR DELETED HERE. The read is what lets the
 * resolvers know which files are already covered; it changes nothing. That is the half of L's rule
 * that runs the other way — *"let deterministic mappings silently overwrite Agent judgment"* — and
 * the mechanism against it is that this function holds no statement that could write that table.
 */
export function rebuildRepository(opts: {
  workspaceId: string
  repositoryId: string
  actor: Actor
}): RebuiltRepository {
  const repository = repositoryById(opts.repositoryId, opts.workspaceId)
  if (repository === null) throw new PanelError(`No repository ${opts.repositoryId} in this project.`, 404)
  if (repository.root === null) {
    throw new PanelError(
      `"${repository.name}" has no checkout on this machine, so there is nothing to scan. That is a real state and ` +
        `not a fault: it can hold relationships, be read and be drawn — it cannot be indexed. PATCH ` +
        `/api/implementation/repositories/${repository.id} with a root points it at one.`,
    )
  }
  const root = checkedRoot(repository.root, `it is the root of the repository "${repository.name}"`)

  // WHAT WAS THERE BEFORE, read before anything is written, because after the write it is gone.
  const previous = sqlite
    .prepare('SELECT built_at FROM source_index WHERE workspace_id = ? AND repository_id = ?')
    .get(opts.workspaceId, opts.repositoryId) as { built_at: string } | undefined
  const previousFiles = filesInRepository(opts.workspaceId, opts.repositoryId)
  const before = new Map(
    sqlite
      .prepare(
        'SELECT path, language, size_bytes, lines, imports, exports, modified_at FROM source_files ' +
          'WHERE workspace_id = ? AND repository_id = ?',
      )
      .all(opts.workspaceId, opts.repositoryId)
      .map((row) => {
        const r = row as {
          path: string
          language: string
          size_bytes: number
          lines: number
          imports: string
          exports: string
          modified_at: string
        }
        return [
          r.path,
          {
            path: r.path,
            language: r.language as SourceFile['language'],
            sizeBytes: r.size_bytes,
            lines: r.lines,
            imports: JSON.parse(r.imports) as string[],
            exports: JSON.parse(r.exports) as string[],
            modifiedAt: r.modified_at,
          } satisfies SourceFile,
        ] as const
      }),
  )
  const previousHashes = new Map(
    (
      sqlite
        .prepare('SELECT path, hash FROM source_file_hashes WHERE workspace_id = ? AND repository_id = ?')
        .all(opts.workspaceId, opts.repositoryId) as { path: string; hash: string }[]
    ).map((r) => [r.path, r.hash] as const),
  )

  // THE STATED ROWS, AND WHAT THEY MATCHED BEFORE. Read before the scan so that `wentStale` and
  // `cameBack` compare two real states rather than one state against itself.
  const stated = statedInRepository(opts.repositoryId, opts.workspaceId).filter((row) => row.authority === 'stated')
  const matchedBefore = new Map(stated.map((row) => [row.id, filesMatching(row.pattern, previousFiles).length]))

  // ------------------------------------------------------------------ outside the transaction
  const scan = scanTree(root)
  const aliases = aliasesFrom(readTsconfig(root))

  const builtAt = localStamp(new Date())
  const files = scan.files
  const paths = files.map((f) => f.path)

  // WHICH FILES A STATED ROW COVERS NOW, and which records each file is served by. Both are
  // computed from `filesMatching` — the one matcher — rather than from a second rule.
  const coveredByStated = new Set<string>()
  const servedBy = new Map<string, string[]>()
  for (const row of stated) {
    for (const path of filesMatching(row.pattern, paths)) {
      coveredByStated.add(path)
      const held = servedBy.get(path)
      if (held === undefined) servedBy.set(path, [row.recordId])
      else if (!held.includes(row.recordId)) held.push(row.recordId)
    }
  }

  const ran: RebuiltRepository['resolvers'] = []
  const findings: FindingRow[] = []
  let unresolved = { count: 0, first: [] as string[] }
  let outside = 0
  for (const resolver of RESOLVERS) {
    const answer = resolver.run({ files, coveredByStated, servedBy, aliases })
    if (answer === null) {
      ran.push({
        provenance: resolver.provenance,
        ran: false,
        needs: resolver.needs,
        rows: 0,
        note: `Nothing here for it to read. It needs ${resolver.needs}.`,
      })
      continue
    }
    findings.push(...answer.rows)
    unresolved = {
      count: unresolved.count + answer.unresolved.count,
      first: [...unresolved.first, ...answer.unresolved.first].slice(0, 20),
    }
    outside += answer.outside
    ran.push({
      provenance: resolver.provenance,
      ran: true,
      needs: resolver.needs,
      rows: answer.rows.length,
      note: answer.note,
    })
  }

  // WHAT THIS SCAN SAW, COMPUTED BEFORE THE WRITE because the ledger append inside the transaction
  // is written from it. Its inputs — `before`, `previousHashes` and `previous` — were all read
  // before the scan, so computing it here rather than in the return statement changes nothing about
  // what it answers.
  const firstBuildOfThisRepository = previous === undefined
  const report = reindexReport(
    firstBuildOfThisRepository ? null : [...before.values()],
    files,
    previous?.built_at ?? null,
    { before: previousHashes, after: scan.hashes },
  )

  // ------------------------------------------------------------------ the transaction, and only it
  let observed: { scanId: string; rows: number } = { scanId: '', rows: 0 }
  sqlite.transaction(() => {
    // SCOPED BY REPOSITORY AS WELL AS BY WORKSPACE, which is the whole point of window A's key
    // change and is the same fix, one level down, as the workspace scoping that stopped a second
    // project destroying the first one's index.
    sqlite
      .prepare('DELETE FROM source_files WHERE workspace_id = ? AND repository_id = ?')
      .run(opts.workspaceId, opts.repositoryId)
    sqlite
      .prepare('DELETE FROM source_file_hashes WHERE workspace_id = ? AND repository_id = ?')
      .run(opts.workspaceId, opts.repositoryId)
    sqlite
      .prepare('DELETE FROM source_index WHERE workspace_id = ? AND repository_id = ?')
      .run(opts.workspaceId, opts.repositoryId)

    const insertFile = sqlite.prepare(
      'INSERT INTO source_files (workspace_id, repository_id, path, language, size_bytes, lines, imports, exports, ' +
        'modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    const insertHash = sqlite.prepare(
      'INSERT INTO source_file_hashes (workspace_id, repository_id, path, hash, built_at) VALUES (?, ?, ?, ?, ?)',
    )
    for (const file of files) {
      insertFile.run(
        opts.workspaceId,
        opts.repositoryId,
        file.path,
        file.language,
        file.sizeBytes,
        file.lines,
        JSON.stringify(file.imports),
        JSON.stringify(file.exports),
        file.modifiedAt,
      )
      const hash = scan.hashes.get(file.path)
      if (hash !== undefined) insertHash.run(opts.workspaceId, opts.repositoryId, file.path, hash, builtAt)
    }
    sqlite
      .prepare(
        'INSERT INTO source_index (workspace_id, repository_id, built_at, built_by, root, scan_ms, skipped) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        opts.workspaceId,
        opts.repositoryId,
        builtAt,
        `${opts.actor.type}:${opts.actor.id}`,
        root,
        scan.scanMs,
        JSON.stringify(scan.skipped),
      )

    // REBUILT WHOLE, PER REPOSITORY. Every findings row of this repository goes and the resolvers'
    // answers replace them. That is the one sentence that makes `built_at` mean anything: a
    // findings row is never older than the build it says it came from.
    sqlite
      .prepare('DELETE FROM implementation_findings WHERE workspace_id = ? AND repository_id = ?')
      .run(opts.workspaceId, opts.repositoryId)
    const insertFinding = sqlite.prepare(
      'INSERT INTO implementation_findings (id, workspace_id, record_id, repository_id, path, relation, provenance, ' +
        'evidence_path, evidence_detail, built_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const row of findings) {
      insertFinding.run(
        anOfficeId(),
        opts.workspaceId,
        row.recordId,
        opts.repositoryId,
        row.path,
        row.relation,
        row.provenance,
        row.evidencePath,
        row.evidenceDetail,
        builtAt,
      )
    }

    // AND WHAT THIS SCAN SAW, APPENDED TO THE ONE LEDGER NOTHING REBUILDS.
    //
    // `source_files`, `source_index` and `source_file_hashes` are derived and every row above was
    // just replaced whole, so the comparison this rebuild computed exists for one reply and is then
    // unrecoverable. A work domain accepted three scans ago has no way to ask what changed unless
    // somebody kept it. Kept here, in this transaction, because a hole in a ledger that answers
    // "what changed since" reads as "nothing changed".
    //
    // THIS REBUILD KNOWS ITS REPOSITORY AND PASSES THE ID. The older whole-workspace rebuild in
    // lib/sourceindex.ts cannot name one and passes null, and null there has one stated meaning —
    // a process that scans one root and mints no id. Neither is a guess.
    observed = appendFileObservations({
      workspaceId: opts.workspaceId,
      repositoryId: opts.repositoryId,
      seenAt: builtAt,
      report,
      hashes: scan.hashes,
    })
  })()

  // ------------------------------------------------------------------ after the commit
  const firstBuild = firstBuildOfThisRepository
  const wentStale: RebuiltRepository['wentStale'] = []
  const cameBack: RebuiltRepository['cameBack'] = []
  if (!firstBuild) {
    for (const row of stated) {
      const was = matchedBefore.get(row.id) ?? 0
      const now = filesMatching(row.pattern, paths).length
      if (was > 0 && now === 0) wentStale.push({ rowId: row.id, recordId: row.recordId, pattern: row.pattern })
      // `cameBack` IS NOT SYMMETRY FOR ITS OWN SAKE. A rename breaks a pattern and somebody fixes
      // it; a rebuild that only reported breakage would never say the repair landed, and the person
      // would go on seeing an alarm they had already cleared.
      if (was === 0 && now > 0) cameBack.push({ rowId: row.id, recordId: row.recordId, pattern: row.pattern })
    }
  }

  return {
    repositoryId: opts.repositoryId,
    repositoryName: repository.name,
    root,
    builtAt,
    fileCount: files.length,
    scanMs: scan.scanMs,
    report,
    observed,
    findingsWritten: findings.length,
    resolvers: ran,
    unresolvedSpecifiers: unresolved,
    outsideTheRepository: outside,
    wentStale,
    cameBack,
    firstBuild,
    note: firstBuild
      ? `First build of "${repository.name}": ${files.length} files, ${findings.length} candidate owners. There is ` +
        `nothing of this tree to compare against, so nothing is reported as having gone stale or come back — that ` +
        `would be a comparison of two different checkouts reported as a change inside one.`
      : `"${repository.name}": ${files.length} files. ${wentStale.length} stated pattern` +
        `${wentStale.length === 1 ? '' : 's'} matched something before and match nothing now; ${cameBack.length} ` +
        `matched nothing before and match something now. Nothing anybody stated was written or deleted by this ` +
        `rebuild — it reads that table and cannot write it.`,
  }
}

/**
 * The repository's TypeScript configuration as text, or an empty string.
 *
 * AN ABSENT FILE IS NORMAL AND IS NOT AN ERROR. `aliasesFrom` answers an empty table for it, every
 * aliased specifier then lands in `unresolved`, and the rebuild reports the count. That is a
 * narrowing that says so rather than a silent substitution.
 */
function readTsconfig(root: string): string {
  try {
    return readFileSync(join(root, 'tsconfig.json'), 'utf8')
  } catch {
    return ''
  }
}
