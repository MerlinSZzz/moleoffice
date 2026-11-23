// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOVING A RECORD FROM ONE PROJECT TO ANOTHER — the verb the boundary was missing.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS: THE PRODUCT COULD REACH A STATE IT COULD NOT LEAVE
 * ---------------------------------------------------------------------------------------
 *
 * `POST /api/workspaces` establishes an empty project and says so — "no existing record is moved
 * into it, because which project a record belongs to is a judgement about that record". That
 * sentence was true and there was no verb behind it. Nothing anywhere took a record and a
 * destination, so a record filed into the wrong project stayed there.
 *
 * That is not a tidiness problem. Measured on the real database on 2026-08-12: five records written
 * through the API without `x-mole-office-workspace` landed in `default` and were then linked to modules
 * in `panelx`. `createLink` refuses a cross-workspace link TODAY, and those five predate the
 * refusal — so the archive of that database held five links the importer refuses, and
 * `npx tsx scripts/import.ts` would not restore the corpus from its own export. The refusal was
 * right. The state was unreachable from inside the product, which is what this file fixes.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A JUDGEMENT, SO THE CALLER MAKES IT AND MOLE OFFICE DOES THE CHECKING
 * ---------------------------------------------------------------------------------------
 *
 * The caller states one record and one destination. Everything else is measured:
 *
 *   WHAT HAS TO COME WITH IT. A link joins two records into one graph and may not cross a project
 *   boundary, so moving one end of a link moves the other unless the other is already at the
 *   destination. The same is true of a pipeline and its blocks, which are joined by the pipeline's
 *   own ordered `blockIds` rather than by a link — see `companionsOf` below. The set is closed
 *   transitively, so what comes back is the WHOLE consequence and not the first step of it.
 *
 *   NOTHING IS DRAGGED SILENTLY. When anything other than the named record has to move, the request
 *   is REFUSED and the refusal names every record, every relationship that forces it, and the exact
 *   request that would carry it out. The caller re-sends naming them in `also`. So a move of several
 *   records is always a move somebody read the list of first.
 *
 *   NOTHING IS DELETED TO MAKE A MOVE POSSIBLE. A link is somebody's statement about the work. The
 *   two ways out of a forced companion are to move it or to remove the relationship on purpose with
 *   `DELETE /api/links/:id`, and the refusal says both. This file never removes one.
 *
 *   AND YOU CAN SEE IT WITHOUT DOING IT. `dryRun: true` returns the identical report and writes
 *   nothing, the same shape `POST /api/sessions/discover` already uses. That is the only way to see
 *   the consequence of a move that needs no companion, which would otherwise just happen.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MOVES WITH A RECORD, AND WHY EACH ONE IS NOT A CHOICE
 * ---------------------------------------------------------------------------------------
 *
 * Six tables carry `workspace_id` for rows that belong to a record rather than to a project, and
 * every one of them says the record's project a second time rather than holding an opinion of its
 * own. Leaving any behind is this codebase's recurring defect: the same fact worked out in two
 * places, so the two can disagree.
 *
 *   records              the row itself.
 *   links                a link is filed in the project both its ends are in (`createLink`), so a
 *                        link touching a moved record is filed at the destination.
 *   changes              a change row's project is the project of the record it is about. `logChange`
 *                        derives it and refuses a parameter for it; this keeps the derivation true
 *                        for rows already written.
 *   revisions            the same rule one table along, and the costliest one to get wrong. A
 *                        revision holds the only stored copy of what a record used to contain, and
 *                        a project-scoped export reads this column — so a revision left behind is a
 *                        revision the destination project's archive does not carry. See below.
 *   session_resources    a ledger row hangs off the session record that registered it. A row left
 *                        behind would name a session no read in its own project can reach.
 *   presentation_intent  keyed (workspace, scope, target): a node row targets a record id, and a
 *                        `pipeline:<id>` scope names a pipeline record.
 *
 * `panel_layouts` and `reader_anchors` are NOT in that list and it is not an omission. A layout is
 * keyed by a page name and an anchor by a reader; neither names a record, so neither has an opinion
 * about where one is filed.
 *
 * WHAT LEAVING THE REVISIONS BEHIND ACTUALLY COST, measured on 18 August 2026 before this line was
 * written. Move a record with three revisions out of `default` and into `greenhouse`: revisions 1
 * and 2 stayed stamped `default`. `POST /api/export/workspace` for `greenhouse` then wrote one
 * revision file out of three, and the archive of `default` wrote two revision files under the
 * heading "Revision 1 of (no record has that id)". Restore the `greenhouse` archive somewhere and
 * the record's
 * history starts at revision 3, while `GET /api/records/:id/revisions` says "Every revision this
 * record has is here" and `GET /api/records/:id/revisions/1` answers "It has 1 — they are numbered
 * 1 to 1". Two false sentences, from one column nobody updated.
 *
 * WHY THE COLUMN IS REWRITTEN RATHER THAN LEFT AS HISTORY. `revisions.workspace_id` is DERIVED, and
 * db/schema.ts says so in as many words: "a revision's project is the project of the record it is
 * of; that is the same fact, not a second one". `changes.workspace_id` carries the identical rule and
 * this file has always rewritten that one. A derived column left un-derived is the recurring defect.
 *
 * WHAT THAT COSTS, STATED, BECAUSE IT IS NOT NOTHING. `fileRecordsInWorkspace` in lib/records/file-records-in-workspace.ts
 * writes a revision for the move, and `GET /api/records/:id/revisions` reports that revision's
 * `changed` as `[]` — a revision was written and, by the ledger's own reading, nothing moved. A
 * revision's CONTENT does not carry the project at all, for the reasons `RevisionContent` in
 * lib/revisions.ts gives, so that is true whether or not this file rewrites the column. The change
 * log still holds the whole of it, as a row whose field is `workspaceId` with the two project ids
 * on it, so nothing is lost; it is the LEDGER's sentence that has gone quiet.
 *
 * THE FIX FOR THAT IS ONE ARGUMENT IN ANOTHER FILE and is not made here. `saveRevision` already
 * takes a `note` — a restore uses it to say which revision it put back — so the move's revision
 * should carry one saying which project the record came from and which it went to. That is a
 * revision saying why it exists, which is what a `note` is for, and it does not depend on a derived
 * column pretending to be history. It is recorded in this round's findings for whoever owns
 * lib/records.ts.
 *
 * ---------------------------------------------------------------------------------------
 * SESSION ATTRIBUTION IS HISTORICAL PROVENANCE, NOT PROJECT OWNERSHIP
 * ---------------------------------------------------------------------------------------
 *
 * THIS IS THE RULE, AND IT IS WRITTEN HERE BECAUSE THIS IS WHERE IT IS ENFORCED. Every other place
 * that meets it — `sessionFiledElsewhere` in lib/records.ts, `migrateChangeSessions` in
 * lib/sessions.ts, the note this file returns — points back at this paragraph rather than restating
 * it, because a rule stated in four voices is four rules.
 *
 * Moving a record changes THAT RECORD'S project and carries the history the record owns. It never
 * moves the session that wrote that history. A session is a run that happened: it is somebody's
 * night at a keyboard, filed where that work was being done, and re-filing it because one of the
 * records it touched has been re-filed would be Mole Office deciding, on nobody's authority, that a run
 * belongs wherever its output ended up. So:
 *
 *   A SESSION IS NEVER A FORCED COMPANION. `companionsOf` will not carry one and will not walk
 *   through one. A session moves when a caller names it as the record to move — `POST
 *   /api/records/<the session>/workspace` — and at no other time. The reverse was already true and
 *   stays true: naming a session does not drag every record it ever wrote to, because a change row
 *   is not a relationship anybody stated.
 *
 *   THE ATTRIBUTION SURVIVES INTACT. A change row carried into the destination keeps the session id
 *   it was written with. It is not blanked, not repointed at something local, and not dropped: it is
 *   the true answer to "which run did this", and the run did not move because the record did.
 *
 *   WHAT IS LEFT IS A ROW WHOSE SESSION IS IN ANOTHER PROJECT, WHICH IS SAID OUT LOUD. From the
 *   row's own project that id resolves to `elsewhere` — see `sessionFiledElsewhere` — which names
 *   the project the session is filed in and refuses to read into it. Not "no session answers to
 *   this", which would be false, and not the session's own work, which is that project's business.
 *   `sessionAttributionNote` below counts those rows on every move that makes one, and it is a
 *   description of the semantics rather than a defect being tolerated.
 *
 * THE COST, STATED. A record linked to a session it does not sit with cannot move on its own: the
 * link would cross, and this file will not carry the session and will not delete the link. That
 * move is refused, naming the link, and the way through is a request that says which of the two
 * things it means — move the session (naming it, with the rest in `also`), or take the link out on
 * purpose. Both are somebody's judgement, which is the whole posture of this verb.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE CROSSING CHECK, NOT THE WALK, IS THE AUTHORITY
 * ---------------------------------------------------------------------------------------
 *
 * `companionsOf` works out what must come. `linksLeftCrossing` asks the different question — given
 * exactly this set of records at this destination, which stored links would still have their two
 * ends in different projects — and it is asked twice: once before the write, so a walk that missed
 * something refuses instead of writing, and once after, inside the same transaction, so a write that
 * left a boundary crossed rolls back. One function, two calls, and the guarantee is the function's
 * rather than the walk's.
 */

import { KNOWLEDGE_WORKSPACE, isKnowledgeKind } from '@shared/knowledge/constants.ts'
import { KNOWLEDGE_WORDS } from '@shared/words/en-wave-13u.ts'
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { piecesOf, readInPieces } from '../db/in-pieces.ts'
import { changes, links, presentationIntent, records, revisions, sessionResources } from '../db/schema.ts'
import { blockIdsOf } from '@shared/blocks.ts'
import { FLOW_RUN_KIND } from '@shared/flow-run.ts'
import { pipelineScope } from '@shared/presentation.ts'
import { writtenInOf } from '@shared/messages.ts'
import { MESSAGE_CENTRE, isAProjectOnAList } from '@shared/workspaces.ts'
import { whereALinkWithAMessageIsFiled } from '../db/message-centre-migration.ts'
import {
  assertMayWrite,
  fileRecordsInWorkspace,
  recordInWorkspace,
  type Actor,
} from './records.ts'
import { theProjectARecordsRowsAreFiledIn } from './log-change.ts'
import { PanelError } from './panel-error.ts'
import { checkNoDutiesOrDepartmentsRestOn, checkTheDutiesTakenAway, checkTheSecretaryDuties } from './grant/secretary-duties.ts'
import { SECRETARY_DUTIES_KIND } from '@shared/secretary-duties-record.ts'
import { checkTheDepartment, checkTheDepartmentTakenAway, DEPARTMENT_KIND } from './grant/departments.ts'
import { getWorkspace } from '../db/get-workspace.ts'

// ---------------------------------------------------------------------------- what comes back

/**
 * Why a record other than the one that was named has to move.
 *
 * BOTH ENDS AND THE ROW THAT JOINS THEM. "It is linked to something that is moving" is not
 * actionable: the reader has to be able to go and look at the relationship and decide whether it is
 * the relationship that is wrong, which is the other way out of the refusal.
 */
export interface Forcing {
  /** `link` when a stored relationship joins them, `pipeline` when one is a block of the other. */
  relation: 'link' | 'pipeline'
  /** The link id, or the pipeline record's id — the row a person would go and look at. */
  through: string
  /** The record already moving that this one is joined to. */
  withId: string
  withTitle: string
  /** The whole of it in one sentence, so a caller acting on the first line is not misled. */
  why: string
}

/** One record in the move, with where it is coming from and what forces it to come. */
export interface MovingRecord {
  id: string
  kind: string
  title: string
  /** The project it is in now. Not always the same for every row: a chain can reach a third one. */
  from: string
  /** Null on the record the request named. Set on every record that has to come with it. */
  forcedBy: Forcing | null
}

/** A stored link whose two ends would sit in different projects. Named, never removed. */
export interface CrossingLink {
  linkId: string
  type: string
  fromId: string
  fromTitle: string
  fromWorkspace: string
  toId: string
  toTitle: string
  toWorkspace: string
}

/** How many rows in each table the move carries. Every number is a row that really changed. */
export interface MovedRows {
  records: number
  links: number
  changes: number
  /** Revision-ledger rows re-filed. A move that carried none of these lost the record's history. */
  revisions: number
  resources: number
  intent: number
}

export interface MoveReport {
  /** True when nothing was written: either a dry run, or the record was already there. */
  dryRun: boolean
  /** The project the request was working in, which is the project the named record is in. */
  from: string
  to: string
  /** True when the record is already in the destination. Nothing is written and nothing is claimed. */
  alreadyThere: boolean
  /** The named record first, then every record that has to come, each with what forces it. */
  moving: MovingRecord[]
  /** What `also` has to say for this move to be allowed to run. Empty when the record moves alone. */
  needsAlso: string[]
  /** Rows carried. All zero on a dry run — nothing was carried, and saying otherwise would be a lie. */
  rows: MovedRows
  /** The sentence. Says what happened, or what would happen, in the voice every other write uses. */
  note: string
  /**
   * How many change rows this move leaves naming a session in another project — or null when it
   * leaves none. See `sessionAttributionNote`: it describes the rule, and it is never a refusal.
   */
  sessionNote: string | null
  /**
   * The stored links that would still cross a boundary with exactly these records moved. On a dry run they are why the
   * move would be refused, named so a caller can draw them. Empty on a move made, since a crossing refuses the move.
   */
  crossing: CrossingLink[]
}

// ---------------------------------------------------------------------------- reading the graph

/**
 * One record row, as this file needs it. Deleted rows included: a deleted record is still filed in a
 * project, still carries its title, and links still point at it.
 *
 * `kind` is `string` AND NOT `RecordKind`, deliberately. It is read straight off a text column, and
 * a hand-edited row can hold a word Mole Office does not know; narrowing it here with a cast would make
 * this file state something about the row that the row does not state. `assertMayWrite` takes a
 * string for the same reason.
 */
interface Row {
  id: string
  kind: string
  title: string
  workspaceId: string
}

function rowOf(r: { id: string; kind: string; title: string; workspaceId: string }): Row {
  return { id: r.id, kind: r.kind, title: r.title, workspaceId: r.workspaceId }
}

/** Every record by id, live and deleted. Read once: the walk below asks about it many times. */
function allRecords(): Map<string, Row> {
  const rows = db
    .select({ id: records.id, kind: records.kind, title: records.title, workspaceId: records.workspaceId })
    .from(records)
    .all()
  return new Map(rows.map((r) => [r.id, rowOf(r)]))
}

/**
 * WHAT A DRY RUN HAS NOT ASKED ABOUT A SECRETARY'S DUTIES. The project they go to checks them only on the records as
 * they land there, and a dry run writes nothing, so the dry run says so rather than reading as a move that will pass.
 */
export function aDryRunDoesNotAskWhereTheDutiesGo(ids: readonly string[], to: string): string {
  return (
    `\nThe project "${to}" has not checked the secretary's duties in ${ids.join(', ')}. That check runs only when the ` +
    `move is made, on the records as they land there. So the move may still be refused.`
  )
}

/** One record's stored data, for the guard of a kind that reads it. A Row carries none. */
function theStoredDataOf(id: string): unknown {
  return db.select({ data: records.data }).from(records).where(eq(records.id, id)).get()?.data
}

/**
 * Which records must move with `seedIds` so that nothing is left joined across the boundary. The seeds are the records
 * the caller named: one for the record door, and an agent's record with its runs for the agent's move (lib/agent-move.ts).
 *
 * TWO RELATIONS, AND THE SECOND IS THE ONE A LINK-ONLY WALK WOULD MISS. A link is the obvious
 * relation and it is stored in `links`. A pipeline's membership is NOT a link — the pipeline's own
 * ordered `blockIds` is the one statement of which blocks it holds, deliberately, so that membership
 * and order cannot disagree (see `pipelineHolding` in lib/records/pipeline-membership.ts). A walk over links alone would
 * happily move a block out from under its pipeline, and the pipeline page would then report it as an
 * id naming nothing: a silent break made by the very verb that exists to prevent one.
 *
 * A record ALREADY AT THE DESTINATION is not pulled in, because the relationship to it stops
 * crossing the moment the seed arrives. That is the ordinary case for a session being filed where
 * the work it is about already lives.
 *
 * A SESSION IS NEVER PULLED IN AT ALL, whatever joins it to the set — see the rule in this file's
 * header. It is also never walked THROUGH, which is the half that is easy to miss: if a session
 * could be a stepping stone, moving one note would reach the session that wrote it and then every
 * record on its other links, and a caller who named one record would be shown a list of a stranger's
 * work to confirm. The session is where the walk stops.
 *
 * The walk is transitive and terminates: every record enters the set at most once.
 */
function companionsOf(
  seedIds: readonly string[],
  to: string,
  everything: Map<string, Row>,
): { forced: Map<string, Forcing>; sessionsHeldBack: Map<string, Forcing> } {
  const linkRows = db
    .select({ id: links.id, fromId: links.fromId, toId: links.toId, type: links.type })
    .from(links)
    .all()
  const touching = new Map<string, { id: string; type: string; otherId: string }[]>()
  const remember = (at: string, entry: { id: string; type: string; otherId: string }): void => {
    const list = touching.get(at)
    if (list === undefined) touching.set(at, [entry])
    else list.push(entry)
  }
  for (const l of linkRows) {
    remember(l.fromId, { id: l.id, type: l.type, otherId: l.toId })
    remember(l.toId, { id: l.id, type: l.type, otherId: l.fromId })
  }

  // Pipeline membership, both ways, read off the pipelines' own `blockIds`.
  const blockToPipeline = new Map<string, Row[]>()
  const pipelineBlocks = new Map<string, string[]>()
  for (const row of everything.values()) {
    if (row.kind !== 'pipeline') continue
    const full = db.select({ data: records.data }).from(records).where(eq(records.id, row.id)).get()
    const ids = blockIdsOf({ data: full?.data ?? {} })
    pipelineBlocks.set(row.id, ids)
    for (const blockId of ids) blockToPipeline.set(blockId, [...(blockToPipeline.get(blockId) ?? []), row])
  }

  const forced = new Map<string, Forcing>()
  const sessionsHeldBack = new Map<string, Forcing>()
  const moving = new Set<string>(seedIds)
  const queue = [...seedIds]

  const consider = (candidateId: string, forcing: Forcing): void => {
    if (moving.has(candidateId)) return
    const candidate = everything.get(candidateId)
    // A relationship naming a record nothing answers to cannot cross anything. It is a broken
    // reference that already existed; this verb neither repairs nor reports it.
    if (candidate === undefined) return
    if (candidate.workspaceId === to) return
    // A MESSAGE IS NEVER CARRIED ALONG EITHER: it belongs to no project and stays in the message
    // centre. A link between it and a moving record is filed in the record's project, so it moves with the record.
    if (candidate.kind === 'message') return
    // THE ONE KIND THAT IS NEVER CARRIED. Session attribution is historical provenance, not project
    // ownership: see this file's header. Remembered rather than silently skipped, because the
    // refusal that follows has to be able to say which session it declined to move and what joined
    // it to the set — a walk that quietly went round it would leave the caller reading "some link
    // still crosses" with no idea which judgement they are being asked for.
    if (candidate.kind === 'session') {
      sessionsHeldBack.set(candidateId, forcing)
      return
    }
    moving.add(candidateId)
    forced.set(candidateId, forcing)
    queue.push(candidateId)
  }

  while (queue.length > 0) {
    const id = queue.shift()
    if (id === undefined) break
    const here = everything.get(id)
    if (here === undefined) continue

    for (const edge of touching.get(id) ?? []) {
      const other = everything.get(edge.otherId)
      consider(edge.otherId, {
        relation: 'link',
        through: edge.id,
        withId: id,
        withTitle: here.title,
        why:
          `a "${edge.type}" link (${edge.id}) joins it to "${here.title}" (${id}), which is moving, so leaving it ` +
          `behind in "${other?.workspaceId ?? '?'}" would put the two ends of that link in different projects`,
      })
    }

    for (const owner of blockToPipeline.get(id) ?? []) {
      consider(owner.id, {
        relation: 'pipeline',
        through: owner.id,
        withId: id,
        withTitle: here.title,
        why:
          `the pipeline "${owner.title}" (${owner.id}) lists "${here.title}" (${id}) among its blocks, and a ` +
          `pipeline's ordered blockIds is the only statement of what it holds — a block in another project reads ` +
          `on the pipeline page as an id naming nothing`,
      })
    }
    for (const blockId of pipelineBlocks.get(id) ?? []) {
      const block = everything.get(blockId)
      consider(blockId, {
        relation: 'pipeline',
        through: id,
        withId: id,
        withTitle: here.title,
        why:
          `it is a block of the pipeline "${here.title}" (${id}), which is moving, and a pipeline's blocks are ` +
          `named by that pipeline alone${block === undefined ? '' : ` — "${block.title}" would be left in "${block.workspaceId}"`}`,
      })
    }
  }

  return { forced, sessionsHeldBack }
}

/**
 * Given that every id in `moving` ends up in `to`, which stored links would still cross a boundary.
 *
 * THE AUTHORITY. `companionsOf` decides what to carry; this decides whether carrying it was enough,
 * and it is asked before the write and again after it. A link with neither end moving is not this
 * function's business: it was already legal or already broken before the request arrived.
 */
export function linksLeftCrossing(moving: ReadonlySet<string>, to: string, everything: Map<string, Row>): CrossingLink[] {
  const out: CrossingLink[] = []
  const at = (id: string): string | null => {
    if (moving.has(id)) return to
    return everything.get(id)?.workspaceId ?? null
  }
  const rows = db
    .select({ id: links.id, fromId: links.fromId, toId: links.toId, type: links.type })
    .from(links)
    .all()
  for (const l of rows) {
    if (!moving.has(l.fromId) && !moving.has(l.toId)) continue
    // A LINK WITH A MESSAGE AT ONE END CROSSES NO BOUNDARY: the message belongs to no project.
    if (everything.get(l.fromId)?.kind === 'message' || everything.get(l.toId)?.kind === 'message') continue
    const from = at(l.fromId)
    const to_ = at(l.toId)
    // A link naming a record that does not exist is already broken and is not made worse by this.
    if (from === null || to_ === null) continue
    if (from === to_) continue
    out.push({
      linkId: l.id,
      type: l.type,
      fromId: l.fromId,
      fromTitle: everything.get(l.fromId)?.title ?? '(no record)',
      fromWorkspace: from,
      toId: l.toId,
      toTitle: everything.get(l.toId)?.title ?? '(no record)',
      toWorkspace: to_,
    })
  }
  return out
}

// ---------------------------------------------------------------------------- the refusals

/**
 * Records already in the destination that a moving record will share a title with.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS A REPORT, AND IT USED TO BE A REFUSAL
 * ---------------------------------------------------------------------------------------
 *
 * Until 17 August 2026 a move was refused with "A title is unique inside one project". The owner
 * overturned that rule: **ID is identity. Title is presentation. Titles may repeat.** Two records
 * of one name in one project is now an allowed state, so a move that produces one is an allowed
 * move, and refusing it would be forbidding a genuinely distinct record because of what it is
 * called.
 *
 * IT IS STILL SAID OUT LOUD, in the reply and in the dry run, because the person doing the move is
 * the one who can tell whether these two are one piece of work. Nothing is merged, nothing is
 * renamed, and nothing is refused.
 *
 * EVERY HOLDER IS RETURNED, not one per title, since several records in the destination may already
 * share the name.
 */
function titleClashes(moving: readonly Row[], to: string): { moving: Row; heldBy: Row }[] {
  const ids = moving.map((r) => r.id)
  // IN PIECES (src/server/db/in-pieces.ts): a move can carry a whole project, so its titles are read a piece at a time;
  // a holder has one title and a title is in one piece, so no holder comes back twice, and no order was ever asked for.
  const held = readInPieces(
    moving.map((r) => r.title),
    (piece) =>
      db
        .select({ id: records.id, kind: records.kind, title: records.title, workspaceId: records.workspaceId })
        .from(records)
        .where(and(eq(records.workspaceId, to), inArray(records.title, piece)))
        .all(),
  )
  const out: { moving: Row; heldBy: Row }[] = []
  for (const row of moving) {
    for (const holder of held) {
      if (holder.title !== row.title || ids.includes(holder.id)) continue
      out.push({ moving: row, heldBy: rowOf(holder) })
    }
  }
  return out
}

/** What the destination already calls by these names, as one sentence. Empty when there is none. */
function describeTitleClashes(clashes: readonly { moving: Row; heldBy: Row }[], to: string): string {
  if (clashes.length === 0) return ''
  const each = clashes
    .map((c) => `"${c.moving.title}" (${c.moving.id}) lands beside ${c.heldBy.kind} ${c.heldBy.id}, already called that`)
    .join('; ')
  return (
    ` "${to}" already calls ${clashes.length === 1 ? 'one record' : `${clashes.length} records`} by ` +
    `${clashes.length === 1 ? 'a name in this move' : 'names in this move'}: ${each}. That is allowed — an id ` +
    `says which record it is and a title says what it is called — and nothing was merged or renamed. Rename one ` +
    `with PATCH /api/records/<id> {"title":"…"} if they are meant to be told apart on a page.`
  )
}

/**
 * How many change rows this move leaves naming a session in another project, as one sentence.
 *
 * THIS IS A DESCRIPTION OF THE RULE, NOT A REPORT OF DAMAGE, and it used to read as the second
 * thing. A change row names the session that wrote it; moving a record carries the row and never
 * the session (see this file's header), so the two can end up in different projects two ways round:
 *
 *   a session moves and rows about records that are NOT moving keep naming it, or
 *   a record moves and its rows keep naming a session that is staying behind.
 *
 * NEITHER IS REFUSED AND NEITHER IS A LOSS. The rows still carry the id somebody wrote, which is the
 * true answer to "which run did this", and from their own project that id now resolves to
 * `elsewhere` — `sessionFiledElsewhere` in lib/records.ts names the project the session is filed in
 * and declines to read into it. The alternative — dragging the session, or dragging every record a
 * session ever touched — is the guess this verb exists to refuse.
 *
 * It is counted anyway, because the number is the honest size of what just happened: a caller who
 * moves a session out from under a night's work should be told how much of the change log now points
 * across a boundary, even though every row of it is still true.
 */
function sessionAttributionNote(moving: ReadonlySet<string>, to: string): string | null {
  if (moving.size === 0) return null
  const placeholders = (piece: readonly string[]): string => piece.map(() => '?').join(',')

  // Rows naming a moving session record, whose own record is not moving and is not at the
  // destination — so after this write the row and the session it names are in different projects.
  // IN PIECES (src/server/db/in-pieces.ts): a move can carry a whole project, so the sessions are read a piece at a time
  // (a row names one session, so it is in one piece) and "its record is not moving" is asked below of the whole set,
  // because a NOT IN cannot be split, before the counts are added up; a NULL record_id is left out, as NOT IN left it out.
  const away = readInPieces(moving, (piece) =>
    sqlite
      .prepare(
        `SELECT c.record_id AS recordId, count(*) AS n FROM changes c
           LEFT JOIN records r ON r.id = c.record_id
          WHERE c.session_id IN (${placeholders(piece)})
            AND coalesce(r.workspace_id, '') <> ?
          GROUP BY c.record_id`,
      )
      .all(...piece, to) as { recordId: string | null; n: number }[],
  )

  // Rows ABOUT a moving record that name a session which is neither moving nor already there.
  // IN PIECES (src/server/db/in-pieces.ts): a move can carry a whole project, so the records are read a piece at a time
  // (a row is about one record, so it is in one piece) and "its session is not moving" is asked below of the whole set,
  // because a NOT IN cannot be split, before the counts are added up; the join still leaves out a row with no session.
  const back = readInPieces(moving, (piece) =>
    sqlite
      .prepare(
        `SELECT c.session_id AS sessionId, count(*) AS n FROM changes c
           JOIN records s ON s.id = c.session_id
          WHERE c.record_id IN (${placeholders(piece)})
            AND s.workspace_id <> ?
          GROUP BY c.session_id`,
      )
      .all(...piece, to) as { sessionId: string; n: number }[],
  )

  const strandedAway = away.reduce(
    (total, row) => (row.recordId === null || moving.has(row.recordId) ? total : total + Number(row.n)),
    0,
  )
  const strandedBack = back.reduce((total, row) => (moving.has(row.sessionId) ? total : total + Number(row.n)), 0)
  if (strandedAway === 0 && strandedBack === 0) return null

  const parts: string[] = []
  if (strandedAway > 0) {
    parts.push(
      `${strandedAway} change row(s) about records that are NOT moving name a session record that is, so they ` +
        `stay in their own project naming a session now filed in "${to}"`,
    )
  }
  if (strandedBack > 0) {
    parts.push(
      `${strandedBack} change row(s) about records that ARE moving name a session staying behind, so they land ` +
        `in "${to}" naming a session filed where they came from`,
    )
  }
  return (
    `${parts.join('; and ')}. That is the rule rather than a casualty of it: session attribution is historical ` +
    `provenance, not project ownership, so a record changes project and the run that wrote its history does not ` +
    `move with it. Every one of those rows still carries the id somebody wrote and still names the session that ` +
    `really did the work; asked from the project the rows are in, that id answers "this is a session filed in ` +
    `<the other project>" rather than answering nothing. Moving the session as well is a request of its own — ` +
    `POST /api/records/<the session>/workspace — and this one will not make that judgement for you.`
  )
}

// ---------------------------------------------------------------------------- the verb

export interface MoveInput {
  /** The destination project. Must already exist: `POST /api/workspaces` establishes one. */
  to: string
  /** Every OTHER record that has to move, confirmed by the caller after being shown the list. */
  also?: readonly string[]
  /** Report what would happen and write nothing. */
  dryRun?: boolean
  /**
   * OTHER RECORDS NAMED WITH IT, by a caller that moves a set as one: lib/agent-move.ts names an agent's record and its
   * ended runs. Each is in the same project and moves as named, so it asks nothing of `also`, and one walk starts from
   * all of them. The record door takes no such field.
   */
  withIt?: readonly string[]
}

/**
 * Move one record, and exactly what must come with it, into another project.
 *
 * `workspaceId` is the project the REQUEST is working in, and the record has to be in it: you move a
 * record out of the project you are looking at, in the same way you delete one out of it.
 */
export function moveRecordToWorkspace(
  id: string,
  workspaceId: string,
  input: MoveInput,
  actor: Actor,
): MoveReport {
  const to = input.to
  const dryRun = input.dryRun ?? false
  const named = recordInWorkspace(id, workspaceId)
  const namedWithIt = [...new Set(input.withIt ?? [])].filter((each) => each !== id).map((each) => recordInWorkspace(each, workspaceId))
  if (to === KNOWLEDGE_WORKSPACE || [named, ...namedWithIt].some((each) => isKnowledgeKind(each.kind))) throw new PanelError(KNOWLEDGE_WORDS.onlyDoor, 400)
  // A MESSAGE IS KEPT IN THE MESSAGE CENTRE AND BELONGS TO NO PROJECT, and the message centre holds
  // nothing else, so neither is moved. A project a message is about is its writer's `aboutProject`, not a move.
  for (const each of [named, ...namedWithIt]) {
    if (each.kind === 'message') {
      throw new PanelError(
        `${each.id} is a message, and a message belongs to no project: it is kept in the message centre. Nothing was moved. ` +
          'The project a message is about is a mark its writer gives, data.aboutProject.',
        400,
      )
    }
  }
  if (to === MESSAGE_CENTRE) {
    throw new PanelError(`"${MESSAGE_CENTRE}" is the office's message centre and holds only messages. Nothing was moved.`, 400)
  }

  const destination = getWorkspace(to)
  if (destination === null) {
    throw new PanelError(
      `There is no workspace called "${to}", so nothing was moved. A workspace is a project boundary and it is ` +
        `refused rather than created on the spot: a misspelt id would file this record into a project nobody has, ` +
        `and nothing spelling it correctly would ever find it again. GET /api/workspaces lists them; ` +
        `POST /api/workspaces establishes a new one.`,
      404,
    )
  }

  const nothing: MovedRows = { records: 0, links: 0, changes: 0, revisions: 0, resources: 0, intent: 0 }

  if (workspaceId === to) {
    // Nothing to do, said as nothing to do. A report claiming a move that did not happen is the one
    // answer this server is written against, and `alreadyDischarged` on POST /records/:id/fulfil is
    // the same shape for the same reason.
    return {
      dryRun: true,
      from: workspaceId,
      to,
      alreadyThere: true,
      moving: [{ id: named.id, kind: named.kind, title: named.title, from: workspaceId, forcedBy: null }],
      needsAlso: [],
      rows: nothing,
      note:
        `"${named.title}" (${named.id}) is already in "${to}". Nothing was written and nothing else was ` +
        `examined: there is no move to make.`,
      sessionNote: null,
      crossing: [],
    }
  }

  const everything = allRecords()
  const seeds = [id, ...namedWithIt.map((each) => each.id)]
  const { forced, sessionsHeldBack } = companionsOf(seeds, to, everything)
  const movingIds = new Set<string>([...seeds, ...forced.keys()])
  const movingRows: Row[] = [...movingIds].map((each) => {
    const row = everything.get(each)
    if (row === undefined) throw new Error(`record ${each} vanished between two reads of the same table`)
    return row
  })

  const moving: MovingRecord[] = movingRows
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      from: row.workspaceId,
      forcedBy: forced.get(row.id) ?? null,
    }))
    // The named record first, then the companions by id, so the list reads the way it is argued.
    .sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : a.id < b.id ? -1 : 1))
  // A RUN'S OWN FLOW RUN GOES WITH IT AND IS NOT ASKED FOR (wave 13p round 25). The office wrote it beside the run, so
  // moving the run is the judgement about it too; asked for, it turned every move of a run into a refusal the caller
  // never had before. It is still listed in `moving`, so the report says it moved.
  const namedRuns = new Set([named, ...namedWithIt].filter((each) => each.kind === 'session').map((each) => each.id))
  const theRunsOwnFlowRun = (m: MovingRecord): boolean =>
    m.kind === FLOW_RUN_KIND &&
    m.forcedBy !== null &&
    namedRuns.has(m.forcedBy.withId) &&
    sqlite.prepare("SELECT 1 FROM records WHERE id = ? AND json_extract(data, '$.run') = ?").get(m.id, m.forcedBy.withId) !== undefined
  const needsAlso = moving.filter((m) => m.forcedBy !== null && !theRunsOwnFlowRun(m)).map((m) => m.id)

  // ---- every refusal, gathered before anything is written

  // WHO MAY MOVE WHAT, asked of every record in the set and not only of the named one. A companion
  // is still a record being written, and an agent that could move a `decision` by naming its
  // neighbour would have got round the human-only rule by the side door.
  for (const row of movingRows) assertMayWrite(row.kind, 'move', actor, row.id, undefined, to)
  // A SECRETARY'S DUTIES LEAVE THEIR PROJECT AS A DELETE TAKES THEM AWAY (lib/grant/secretary-duties.ts): the same writer
  // and words, asked on the decisions they rest on here. The project they go to asks the whole write guard at the write.
  const dutiesMoving = movingRows
    .filter((row) => row.kind === SECRETARY_DUTIES_KIND)
    .map((row) => ({ id: row.id, from: row.workspaceId, data: theStoredDataOf(row.id) }))
  for (const duties of dutiesMoving) checkTheDutiesTakenAway({ workspaceId: duties.from, data: duties.data, actor, act: 'move' })
  // A DEPARTMENT LEAVES ITS PROJECT AS A DELETE TAKES IT AWAY (lib/grant/departments.ts), and is asked the whole write
  // guard where it lands, inside the write.
  const departmentsMoving = movingRows
    .filter((row) => row.kind === DEPARTMENT_KIND)
    .map((row) => ({ id: row.id, from: row.workspaceId, data: theStoredDataOf(row.id) }))
  for (const one of departmentsMoving) {
    checkTheDepartmentTakenAway({ workspaceId: one.from, id: one.id, data: one.data, actor, act: 'move', goingWithIt: movingIds })
  }
  // AND A DECISION THAT DUTIES OR A DEPARTMENT LEFT BEHIND REST ON DOES NOT LEAVE THEM, on a dry run too. Duties moving
  // with it are asked at the write, where they land.
  for (const row of movingRows) if (row.kind === 'decision') checkNoDutiesOrDepartmentsRestOn(row, 'move', movingIds)

  const sessionNote = sessionAttributionNote(movingIds, to)
  const plan = (note: string, rows: MovedRows, crossing: CrossingLink[]): MoveReport => ({
    dryRun: true,
    from: workspaceId,
    to,
    alreadyThere: false,
    moving,
    needsAlso,
    rows,
    note,
    sessionNote,
    crossing,
  })

  const describeCompanions = (): string =>
    moving
      .filter((m) => m.forcedBy !== null)
      .map((m) => `  · ${m.kind} "${m.title}" (${m.id}, in "${m.from}") — ${m.forcedBy?.why ?? ''}`)
      .join('\n')

  /**
   * The sessions the walk reached and would not carry, and what a caller may do instead.
   *
   * Written out whenever there are any, because "some link still crosses" is not an answer somebody
   * can act on: what they are actually being asked is which of two judgements they are making, and
   * neither of them is one this verb may make for them.
   */
  const describeHeldBackSessions = (): string => {
    if (sessionsHeldBack.size === 0) return ''
    const lines = [...sessionsHeldBack.entries()].map(([sessionId, why]) => {
      const row = everything.get(sessionId)
      return `  · session "${row?.title ?? sessionId}" (${sessionId}, in "${row?.workspaceId ?? '?'}") — ${why.why}`
    })
    return (
      `\n${sessionsHeldBack.size} session record(s) are joined to this move and were NOT carried:\n` +
      `${lines.join('\n')}\n` +
      `Session attribution is historical provenance, not project ownership: a session is a run that happened, ` +
      `filed where that work was being done, and moving a record it touched is not a reason to re-file the run. ` +
      `So no move ever carries a session, and \`also\` will not take one either. Two ways on, and only you know ` +
      `which you mean: move the session itself, naming it as the record to move and the rest in \`also\` — ` +
      `POST /api/records/<the session>/workspace {"to":${JSON.stringify(to)},"also":[…]} — or take the link out ` +
      `on purpose with DELETE /api/links/<id> and move this record alone. The change rows that session wrote are ` +
      `untouched either way: they keep naming it, and asked from either project that id says which project the ` +
      `session is filed in.`
    )
  }

  // A SESSION LISTED AS A BLOCK OF A MOVING PIPELINE — a state Mole Office cannot produce and will not
  // move around. `checkBlockIds` refuses anything but a block, so a pipeline holding a session was
  // hand-written into the database. Leaving the session behind would put a hole in that pipeline's
  // order and carrying it would break the rule above, so neither is done and the row is named.
  const heldByPipeline = [...sessionsHeldBack.entries()].filter(([, why]) => why.relation === 'pipeline')
  if (heldByPipeline.length > 0) {
    throw new PanelError(
      `Nothing was moved. ${heldByPipeline.length} session record(s) are listed among the blocks of a pipeline ` +
        `in this move: ${heldByPipeline.map(([sessionId, why]) => `${sessionId} (pipeline ${why.through})`).join(', ')}. ` +
        `A pipeline's blockIds holds blocks — POST /api/records/<pipeline>/blocks refuses anything else — so these ` +
        `rows were written by hand, and this verb will neither carry a session nor leave a hole in a pipeline's ` +
        `order. Take them out of blockIds first and this move can be judged on its links alone.`,
      409,
    )
  }

  const request =
    `POST /api/records/${id}/workspace ` +
    `{"to":${JSON.stringify(to)}${needsAlso.length === 0 ? '' : `,"also":${JSON.stringify(needsAlso)}`}}`

  const confirmed = [...new Set(input.also ?? [])]
  const missing = needsAlso.filter((each) => !confirmed.includes(each))
  // Naming the run's own flow run anyway is not an extra: it is moving, asked for or not.
  const carriedWithTheRun = moving.filter(theRunsOwnFlowRun).map((m) => m.id)
  const extra = confirmed.filter((each) => !needsAlso.includes(each) && !carriedWithTheRun.includes(each))

  if (!dryRun && (missing.length > 0 || extra.length > 0)) {
    const lines: string[] = []
    if (missing.length > 0) {
      lines.push(
        `Moving "${named.title}" (${id}) into "${to}" cannot be done on its own: ${missing.length} other ` +
          `record(s) are joined to it and would be left with a relationship crossing the project boundary. ` +
          `Nothing was written.\n${describeCompanions()}`,
      )
    }
    if (extra.length > 0) {
      lines.push(
        `\`also\` names ${extra.map((e) => `"${e}"`).join(', ')}, which nothing forces to move. This verb carries ` +
          `the record you named and exactly what must come with it; moving another record is another judgement ` +
          `and another request. Nothing was written.`,
      )
    }
    lines.push(
      `To make the whole move, having read the list:\n  ${request}\n` +
        `To move the named record alone instead, first take the relationship out on purpose — ` +
        `DELETE /api/links/<id> — because nothing here will remove one to make a move possible. ` +
        `\`{"to":${JSON.stringify(to)},"dryRun":true}\` reports all of this and writes nothing.` +
        // SAID HERE TOO, because this refusal hands the caller a request to send. A session joined
        // to this move will refuse that request as well, and a refusal whose own instruction is
        // about to fail is worse than one that says everything at once.
        describeHeldBackSessions(),
    )
    throw new PanelError(lines.join('\n\n'), 409)
  }

  // NOT A REFUSAL. See `titleClashes`: a repeated title is an allowed state, so this is reported in
  // the reply and in the dry run and the move goes ahead.
  const clashes = titleClashes(movingRows, to)

  // THE AUTHORITY, ASKED BEFORE THE WRITE. `companionsOf` should have made this empty; if it did
  // not, the move is refused rather than made, and the refusal names the links themselves.
  const crossing = linksLeftCrossing(movingIds, to, everything)
  if (crossing.length > 0 && !dryRun) {
    throw new PanelError(
      `Nothing was moved. With exactly these ${movingIds.size} record(s) in "${to}", ${crossing.length} stored ` +
        `link(s) would still have their two ends in different projects:\n` +
        crossing
          .map(
            (c) =>
              `  · "${c.type}" link ${c.linkId}: "${c.fromTitle}" (${c.fromId}) in "${c.fromWorkspace}" → ` +
              `"${c.toTitle}" (${c.toId}) in "${c.toWorkspace}"`,
          )
          .join('\n') +
        `\nEither move the other end too, or remove the relationship on purpose with DELETE /api/links/<id>. ` +
        `Nothing here deletes a link to make a move possible.` +
        describeHeldBackSessions(),
      409,
    )
  }

  const wouldCarry = countRows(movingIds)

  if (dryRun) {
    return plan(
      `Nothing was written. Moving "${named.title}" (${id}) from "${workspaceId}" to "${to}" would carry ` +
        `${describeRows(moving.length, wouldCarry)}` +
        (needsAlso.length === 0
          ? // "It moves alone" has to stop saying "nothing else is joined to it" when something is:
            // a session joined to this record IS joined to it, and it is the one thing a move will
            // not carry. Reporting that as "nothing" would hide the whole reason this would refuse.
            sessionsHeldBack.size === 0
            ? carriedWithTheRun.length === 0
              ? `. It moves alone: nothing else is joined to it outside "${to}".`
              : `. It moves with its own flow run, unasked, and nothing else is joined to it outside "${to}".`
            : carriedWithTheRun.length === 0
              ? `. No other RECORD comes with it.`
              : `. No other RECORD comes with it but its own flow run, unasked.`
          : `, because ${needsAlso.length} other record(s) are joined to it:\n${describeCompanions()}\n` +
            (carriedWithTheRun.length === 0 ? '' : `Its own flow run goes with it too, unasked.\n`) +
            `The request that does it: ${request}`) +
        (crossing.length === 0
          ? ''
          : // The list itself, because there is no list above in a dry run — this is the report, not
            // the refusal, and "see the list above" sent a reader looking for one that is not here.
            `\nAND IT WOULD BE REFUSED: ${crossing.length} link(s) would still have their two ends in ` +
              `different projects:\n` +
              crossing
                .map(
                  (c) =>
                    `  · "${c.type}" link ${c.linkId}: "${c.fromTitle}" (${c.fromId}) in "${c.fromWorkspace}" → ` +
                    `"${c.toTitle}" (${c.toId}) in "${c.toWorkspace}"`,
                )
                .join('\n')) +
        (dutiesMoving.length === 0 ? '' : aDryRunDoesNotAskWhereTheDutiesGo(dutiesMoving.map((duties) => duties.id), to)) +
        describeTitleClashes(clashes, to) +
        describeHeldBackSessions(),
      nothing,
      crossing,
    )
  }

  // ---- the write, whole or not at all

  // THE DUTIES ARE ASKED WHERE THEY LAND, inside the write, so a decision moving with them counts there and a refusal
  // rolls the whole move back. `mine` is the record's own id, so it is not refused as its own second copy.
  const carried = sqlite.transaction((): MovedRows => {
    const rows = carryInto(movingIds, movingRows, to, actor)
    for (const duties of dutiesMoving) checkTheSecretaryDuties({ workspaceId: to, data: duties.data, before: null, mine: duties.id, actor })
    for (const one of departmentsMoving) checkTheDepartment({ workspaceId: to, data: one.data, before: null, mine: one.id, actor })
    return rows
  })()

  return {
    dryRun: false,
    from: workspaceId,
    to,
    alreadyThere: false,
    moving,
    needsAlso,
    rows: carried,
    note:
      `Moved ${describeRows(moving.length, carried)} from "${workspaceId}" to "${to}". ` +
      (needsAlso.length === 0
        ? carriedWithTheRun.length === 0
          ? `"${named.title}" moved alone.`
          : `"${named.title}" moved with its own flow run, which goes with a run unasked.`
        : `"${named.title}" and ${needsAlso.length} record(s) joined to it moved together, in one transaction.` +
          (carriedWithTheRun.length === 0 ? '' : ' Its own flow run went with it too, unasked.')) +
      ` Every moved record has a change row saying so, attributed to ${actor.type}:${actor.id}. No link was ` +
      `removed and no record outside the list was touched.` +
      describeTitleClashes(clashes, to),
    sessionNote,
    crossing: [],
  }
}

/**
 * THE WRITE OF A MOVE, whole or not at all: the records, their links, change rows, revisions, session resources and
 * presentation intent, then the crossing check asked again on what was written. Shared by `moveRecordToWorkspace` and
 * `fileARecordWhoseKindChanged`, so a record changes project one way.
 */
function carryInto(movingIds: ReadonlySet<string>, movingRows: readonly Row[], to: string, actor: Actor): MovedRows {
  return sqlite.transaction((): MovedRows => {
    const ids = [...movingIds]

    // THE RECORDS THEMSELVES GO THROUGH lib/records.ts, which is the one door every write to that
    // table uses — it asks the human-only guard about every row and writes the change rows. See
    // `fileRecordsInWorkspace` there for why the write is not in this file with the rest of the move.
    fileRecordsInWorkspace(ids, to, actor)
    refileTheLinksOf(ids, to)
    // THE CHANGE ROWS GO WHERE A RECORD'S ROWS ARE FILED, asked of lib/records.ts after the record has moved: its new
    // project, or for a message the project it was written in.
    for (const each of ids) {
      db.update(changes).set({ workspaceId: theProjectARecordsRowsAreFiledIn(each) ?? to }).where(eq(changes.recordId, each)).run()
    }
    // THE REVISION LEDGER, for the reason the header gives at length. This is the same statement one
    // table along, and it is the one an archive can least afford to have missed.
    // IN PIECES (src/server/db/in-pieces.ts): a move can carry a whole project, so these two updates run once per piece
    // inside this same transaction; a row names one record, so each row is updated by one piece only.
    for (const piece of piecesOf(ids)) {
      db.update(revisions).set({ workspaceId: to }).where(inArray(revisions.recordId, piece)).run()
    }
    for (const piece of piecesOf(ids)) {
      db.update(sessionResources).set({ workspaceId: to }).where(inArray(sessionResources.sessionRecordId, piece)).run()
    }
    // IN PIECES (src/server/db/in-pieces.ts): the move's ids and its pipelines' scopes both grow with the move, so this
    // update runs once per pair of pieces inside this same transaction; a row matched by two pairs is updated twice, and
    // the second update changes nothing, because it sets the constant `to` and reads nothing from the row.
    const pipelineScopes = movingRows.filter((r) => r.kind === 'pipeline').map((r) => pipelineScope(r.id))
    for (const condition of intentOfTheMove(ids, pipelineScopes)) {
      db.update(presentationIntent).set({ workspaceId: to }).where(condition).run()
    }

    // AND ASKED AGAIN, on the state the write actually produced. A move that left a boundary
    // crossed rolls back here rather than being reported as done.
    const after = allRecords()
    const stillCrossing = linksLeftCrossing(new Set(ids), to, after)
    if (stillCrossing.length > 0) {
      throw new PanelError(
        `The move was rolled back and nothing was changed. After moving ${ids.length} record(s) into "${to}", ` +
          `${stillCrossing.length} link(s) still had their two ends in different projects: ` +
          stillCrossing.map((c) => `${c.linkId} (${c.fromWorkspace} → ${c.toWorkspace})`).join(', ') +
          `. This is a defect in the move itself rather than in the request; please report it with these ids.`,
        500,
      )
    }
    // COUNTED HERE, AFTER THE WRITE, AND THAT IS THE WHOLE OF THE FIX. These numbers used to be
    // taken at the top of this transaction, before `fileRecordsInWorkspace` ran — so the move's own
    // change row and its own revision, one of each per record, were written after the counting and
    // never appeared in it. The report was short by the number of records moved, in the two columns
    // a person is most likely to check against the destination.
    //
    // Counting afterwards is not a bigger number for its own sake. A move's report answers "how much
    // came with it", and what came with it is what now sits in the destination stamped `to` — which
    // includes the row saying the move happened. The record's own count is `ids.length` either way.
    return countRows(movingIds)
  })()
}

/**
 * EVERY LINK WITH A MOVING RECORD AT ONE END, filed where it belongs after the move: with a message at either end, where
 * `whereALinkWithAMessageIsFiled` says, and otherwise in the destination. Read after the records have moved.
 */
function refileTheLinksOf(ids: readonly string[], to: string): void {
  // IN PIECES (src/server/db/in-pieces.ts): a move can carry a whole project, so the links are read a piece at a time,
  // with the same piece at both ends; a link whose two ends are in two pieces comes back twice and is re-filed once.
  const rows = readInPieces(ids, (piece) => {
    const placeholders = piece.map(() => '?').join(', ')
    return sqlite
      .prepare(
        `SELECT l.id AS id, f.kind AS fromKind, f.workspace_id AS fromProject, t.kind AS toKind, t.workspace_id AS toProject ` +
          `FROM links l JOIN records f ON f.id = l.from_id JOIN records t ON t.id = l.to_id ` +
          `WHERE l.from_id IN (${placeholders}) OR l.to_id IN (${placeholders})`,
      )
      .all(...piece, ...piece) as { id: string; fromKind: string; fromProject: string; toKind: string; toProject: string }[]
  })
  const refiled = new Set<string>()
  for (const link of rows) {
    if (refiled.has(link.id)) continue
    refiled.add(link.id)
    const filed =
      link.fromKind === 'message' || link.toKind === 'message'
        ? whereALinkWithAMessageIsFiled({ kind: link.fromKind, workspaceId: link.fromProject }, { kind: link.toKind, workspaceId: link.toProject })
        : to
    db.update(links).set({ workspaceId: filed }).where(eq(links.id, link.id)).run()
  }
}

/**
 * THE PRESENTATION-INTENT ROWS A MOVE CARRIES — a row whose target is a moving record, or any row in a moving pipeline's
 * scope — as one condition per pair of pieces, the first piece of each list together, then the second, and so on. With
 * 500 or fewer of each it is one condition, as it always was. `carryInto` writes by it and `countRows` counts by it.
 */
function intentOfTheMove(targets: readonly string[], scopes: readonly string[]): SQL[] {
  const targetPieces = piecesOf(targets)
  const scopePieces = piecesOf(scopes)
  const conditions: SQL[] = []
  for (let at = 0; at < Math.max(targetPieces.length, scopePieces.length); at++) {
    const targetPiece = targetPieces[at]
    const scopePiece = scopePieces[at]
    const condition = or(
      targetPiece === undefined ? undefined : inArray(presentationIntent.target, targetPiece),
      scopePiece === undefined ? undefined : inArray(presentationIntent.scope, scopePiece),
    )
    if (condition !== undefined) conditions.push(condition)
  }
  return conditions
}

// ---------------------------------------------------------------------------- a kind change across the message centre

/**
 * WHERE A KIND CHANGE FILES A RECORD, asked before anything is written, on check FxhxPXzPuOZO. The
 * message centre holds only messages, so a record that becomes a message goes into it, and a message that becomes
 * another kind goes to the project it was written in, `data.writtenIn.project`. Null when the record stays where it is.
 *
 * REFUSED, AND NOTHING WRITTEN, when a message names no project to go to, or when a link would join it to a record in
 * another project once it is there. Each refusal says why and what to do.
 */
export function whereAKindChangeFilesARecord(
  before: { id: string; kind: string; workspaceId: string; data: unknown },
  nextKind: string,
): string | null {
  if (before.kind === nextKind) return null
  if (nextKind === 'message') return before.workspaceId === MESSAGE_CENTRE ? null : MESSAGE_CENTRE
  if (before.workspaceId !== MESSAGE_CENTRE) return null
  const data = (typeof before.data === 'object' && before.data !== null && !Array.isArray(before.data) ? before.data : {}) as Record<string, unknown>
  const home = writtenInOf(data)?.project
  if (home === undefined || getWorkspace(home) === null || !isAProjectOnAList(home)) {
    throw new PanelError(
      `${before.id} is a message written in no project${home === undefined ? '' : ` that exists (its mark names "${home}")`}, so as a ` +
        `${nextKind} it would have no project to be kept in: the message centre holds only messages. Nothing was written. ` +
        `Keep it a message, or file a new ${nextKind} in the project you mean and link it to this message.`,
      409,
      undefined,
      undefined,
      'This message was written in no project, so it cannot become another kind.',
      { code: 'messageWrittenInNoProject', values: {} },
    )
  }
  const everything = allRecords()
  const row = everything.get(before.id)
  if (row !== undefined) everything.set(before.id, { ...row, kind: nextKind })
  const crossing = linksLeftCrossing(new Set([before.id]), home, everything)
  if (crossing.length > 0) {
    throw new PanelError(
      `As a ${nextKind}, ${before.id} would be kept in "${home}", the project it was written in, and ${String(crossing.length)} ` +
        `link(s) would then join it to a record in another project:\n` +
        crossing
          .map((c) => `  · "${c.type}" link ${c.linkId}: "${c.fromTitle}" (${c.fromId}) in "${c.fromWorkspace}" → "${c.toTitle}" (${c.toId}) in "${c.toWorkspace}"`)
          .join('\n') +
        `\nNothing was written. Take the link out on purpose with DELETE /api/links/<id>, or keep it a message.`,
      409,
      undefined,
      undefined,
      'A link would join this record to another project, so it cannot become another kind.',
      { code: 'messageLinkedAcrossProjects', values: {} },
    )
  }
  return home
}

/** File a record whose kind has just changed where `whereAKindChangeFilesARecord` said, through the move's own write. */
export function fileARecordWhoseKindChanged(id: string, to: string, actor: Actor): void {
  const row = allRecords().get(id)
  // patchRecord has just written it, in this transaction, so a record that is not there is a broken assumption.
  if (row === undefined) throw new Error(`record ${id} vanished between its kind change and its filing, in one transaction`)
  carryInto(new Set([id]), [row], to, actor)
}

/**
 * Row counts for the tables a move carries, measured on the state the move LEAVES BEHIND — it is
 * called at the end of the transaction, so the change row and revision the move itself writes are
 * counted with the rest. Called before the write it is short by one of each per record.
 */
function countRows(movingIds: ReadonlySet<string>): MovedRows {
  const ids = [...movingIds]
  if (ids.length === 0) return { records: 0, links: 0, changes: 0, revisions: 0, resources: 0, intent: 0 }
  // IN PIECES (src/server/db/in-pieces.ts): a move can carry a whole project, and each row counted through this names
  // one record, so it falls in one piece only and the pieces' counts are added up.
  const countAddedUp = (query: (piece: string[]) => { get: () => { n: number } | undefined }): number =>
    piecesOf(ids).reduce((total, piece) => total + Number(query(piece).get()?.n ?? 0), 0)
  // IN PIECES (src/server/db/in-pieces.ts): a move can carry a whole project; a record is in one piece only, and the
  // scopes are only ever used as a list to match against, so their order does not matter.
  const pipelineScopes = readInPieces(ids, (piece) =>
    db
      .select({ id: records.id })
      .from(records)
      .where(and(inArray(records.id, piece), eq(records.kind, 'pipeline')))
      .all(),
  ).map((r) => pipelineScope(r.id))
  return {
    records: ids.length,
    // IN PIECES (src/server/db/in-pieces.ts): a move can carry a whole project, so the links are read a piece at a time
    // with the same piece at both ends; a link whose two ends are in two pieces comes back twice, so its id is counted once.
    links: new Set(
      readInPieces(ids, (piece) =>
        db
          .select({ id: links.id })
          .from(links)
          .where(or(inArray(links.fromId, piece), inArray(links.toId, piece)))
          .all(),
      ).map((l) => l.id),
    ).size,
    changes: countAddedUp((piece) =>
      db
        .select({ n: sql<number>`count(*)` })
        .from(changes)
        .where(inArray(changes.recordId, piece)),
    ),
    revisions: countAddedUp((piece) =>
      db
        .select({ n: sql<number>`count(*)` })
        .from(revisions)
        .where(inArray(revisions.recordId, piece)),
    ),
    resources: countAddedUp((piece) =>
      db
        .select({ n: sql<number>`count(*)` })
        .from(sessionResources)
        .where(inArray(sessionResources.sessionRecordId, piece)),
    ),
    // IN PIECES (src/server/db/in-pieces.ts): the move's ids and its pipelines' scopes both grow with the move; a row can
    // match in two pairs of pieces, so each row is told apart by its primary key, (workspace, scope, target), and counted once.
    intent: new Set(
      intentOfTheMove(ids, pipelineScopes).flatMap((condition) =>
        db
          .select({ workspaceId: presentationIntent.workspaceId, scope: presentationIntent.scope, target: presentationIntent.target })
          .from(presentationIntent)
          .where(condition)
          .all()
          .map((row) => JSON.stringify([row.workspaceId, row.scope, row.target])),
      ),
    ).size,
  }
}

/**
 * "3 records, 5 links, 11 change rows, 4 revisions, 1 ledger row" — tables with nothing left out.
 *
 * EVERY TABLE THE MOVE CARRIES IS NAMED HERE. A move that quietly left a table behind was invisible
 * to the person who made it, because the sentence they read never mentioned the table. That is how
 * the revision ledger was left behind on every move until 18 August 2026: nothing said it was meant
 * to come, so nothing said it had not.
 */
function describeRows(recordCount: number, rows: MovedRows): string {
  const parts = [`${recordCount} record${recordCount === 1 ? '' : 's'}`]
  if (rows.links > 0) parts.push(`${rows.links} link${rows.links === 1 ? '' : 's'}`)
  if (rows.changes > 0) parts.push(`${rows.changes} change row${rows.changes === 1 ? '' : 's'}`)
  if (rows.revisions > 0) parts.push(`${rows.revisions} revision${rows.revisions === 1 ? '' : 's'}`)
  if (rows.resources > 0) parts.push(`${rows.resources} ledger row${rows.resources === 1 ? '' : 's'}`)
  if (rows.intent > 0) parts.push(`${rows.intent} arrangement row${rows.intent === 1 ? '' : 's'}`)
  return parts.join(', ')
}

/**
 * Every link whose two ends are in different projects, over the WHOLE database.
 *
 * Not used by the verb. It is what a check asks — tests/workspace-move.test.ts and the restore proof
 * both need "is the boundary intact anywhere at all", and a second hand-written version of the join
 * is how the two answers drift.
 */
export function crossWorkspaceLinks(): CrossingLink[] {
  const rows = sqlite
    .prepare(
      `SELECT l.id AS linkId, l.type AS type,
              l.from_id AS fromId, rf.title AS fromTitle, rf.workspace_id AS fromWorkspace,
              l.to_id   AS toId,   rt.title AS toTitle,   rt.workspace_id AS toWorkspace
         FROM links l
         JOIN records rf ON rf.id = l.from_id
         JOIN records rt ON rt.id = l.to_id
        WHERE rf.workspace_id <> rt.workspace_id
        ORDER BY l.id`,
    )
    .all() as CrossingLink[]
  return rows
}
