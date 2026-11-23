// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * LINKS: making one between two records, refusing one across projects, and unlinking. They were
 * moved out of src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`; the governance guards
 * import `assertMayPutAForkBackOnTheQueue` from this file, and every caller still imports these names
 * from records.ts. This file reads `assertMayShapeTheFuture` from ./governance-guards.ts inside a
 * function body only; every other name comes from the file where it lives.
 */
import { refuseOrdinaryKnowledgeWrite } from '../../knowledge/guard.ts'
import { KNOWLEDGE_WORKSPACE } from '@shared/knowledge/constants.ts'
import { db, sqlite } from '../../db/client.ts'
import { whereALinkWithAMessageIsFiled } from '../../db/message-centre-migration.ts'
import { links, records, revalidations } from '../../db/schema.ts'
import { anOfficeId } from '../ids.ts'
import { logChange } from '../log-change.ts'
import { PanelError } from '../panel-error.ts'
import { aRecordChanged } from '../record-changes.ts'
// The two kinds that carry a restriction, and the one walk that says which records one reaches.
// This file may import that one: `restrictions.ts` reads the database and the shared layer and
// imports nothing from here, so the arrow points one way.
import { restrictionsFrom } from '../restrictions.ts'
import { assertMayShapeTheFuture } from './governance-guards.ts'
import { type Actor } from './actor.ts'
import { LINKS_THAT_REPLACE_A_FORK, PROPOSAL_KIND, theForkIsAlreadySettled, theOtherAnswersToThisFork } from './fork-settled.ts'
import { assertMayReplaceAFork, assertMaySettleFork, forkIsTheOwnersToSettle, humanMadeThisLink, linkTakesThisForkOffTheQueue } from './fork-settling.ts'
import { checkGate, resolveGateStage } from './link-gates.ts'
import { actsForThePerson } from './own-words.ts'
import { nothingWrittenSentence } from './patching.ts'
import { checkLinkKinds } from './planning-guards.ts'
import { listRecordsWithDataAs, onlyTheseFieldsOf } from './reading.ts'
import { checkRestrictionLinks, checkTheForkBehindARestriction, RESTRICTION_KIND_SET } from './restrictions.ts'
import { ARRIVAL_IS_NOT_A_CLAIM, arrivalDetail, isSomebodyMoleOfficeCannotPlace, ONE_PERSON_AND_THE_NAME_IS_ITS_OWN, strangerDetail } from './served-doors.ts'
import { describeStoredGate, readLinkGate, sameGate } from './stored-link-gates.ts'
import { blockIdsOf, type CarriedData } from '@shared/blocks.ts'
// The one reader of containment, and the two questions a `part_of` write has to ask before it is
// written. Pure, and shared with the browser: see the head of that file for why the three stores
// are read in one place. `createLink` in records/links.ts asks both.
import { CONTAINMENT_LINK, type ContainmentContext, type ContainmentLink, hasParentAlready, wouldMakeCycle } from '@shared/containment.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { named } from '@shared/named.ts'
import { now } from '@shared/now.ts'
import { THE_PERSON } from '@shared/person.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { LINK_TYPES, type LinkType, RESOLVES_PROPOSAL } from '@shared/types.ts'
import { type Gate } from '@shared/work.ts'
import { and, eq, inArray, or, sql } from 'drizzle-orm'

// ---------------------------------------------------------------------------- links

/**
 * Refuse a link whose two ends are in different projects, naming both.
 *
 * THE BOUNDARY'S ONE HARD RULE. A link joins two records into one graph, and every reading built on
 * that graph — backlinks, what nothing is using, what is blocked, the neighbourhood the corpus
 * migration measured — would then be answering about two projects at once.
 *
 * IT IS REFUSED RATHER THAN DROPPED. Answering 201 and writing nothing would be a fake success;
 * answering 201 and filing it under one of the two would be a silent semantic substitution. The
 * caller is told which record is where and the two ways out.
 *
 * IT LIVES HERE, beside the link write that calls it, rather than in lib/workspaces.ts, which is
 * where it belongs by subject. The importer calls it too.
 */
export function refuseCrossWorkspaceLink(
  from: { id: string; title: string; workspaceId: string; kind: string },
  to: { id: string; title: string; workspaceId: string; kind: string },
  type: LinkType,
): void {
  if (from.workspaceId === to.workspaceId) return
  if (type === 'relates_to' && from.kind === 'knowledge_bookmark' && to.kind === 'knowledge_entry' && to.workspaceId === KNOWLEDGE_WORKSPACE && from.workspaceId !== KNOWLEDGE_WORKSPACE) return
  // ONE FLOW REPLACING ANOTHER MAY CROSS PROJECTS. The Flows page stands every
  // project's flows together, and a general flow in one project replaces a department's old one in
  // another. The link is filed in the newer flow's project, and the old flow's own page still reads it by its id.
  if (type === 'supersedes' && from.kind === 'flow' && to.kind === 'flow') return
  // A MESSAGE BELONGS TO NO PROJECT, so a link with a message at one end crosses no boundary: it
  // is filed in the other end's project (`whereALinkWithAMessageIsFiled`), where that record's own read lists it.
  if (from.kind === 'message' || to.kind === 'message') return
  throw new PanelError(
    // BOTH IDS AS WELL AS BOTH TITLES. The titles are what a person recognises; the ids are what
    // the repair takes, and a caller told only the titles has to go and look them up — in two
    // different workspaces, which is the awkward part of the very situation being reported.
    `"${from.title}" (${from.id}) is in the workspace "${from.workspaceId}" and "${to.title}" (${to.id}) is in ` +
      `"${to.workspaceId}", so this link would cross a project boundary. Nothing was written, and nothing was ` +
      `quietly dropped either. A link joins two records into one graph, and every reading built on that graph — ` +
      `backlinks, what nothing is using, what is blocked — would then be answering about two projects at once. ` +
      `Either move one record into the other's workspace — POST /api/records/${from.id}/workspace ` +
      `{"to":"${to.workspaceId}"} sent with x-mole-office-workspace: ${from.workspaceId}, which reports what else ` +
      `would have to come with it and refuses rather than dragging anything silently — or write the ` +
      `relationship in words on a record that is in one of them.`,
    409,
  )
}

export function createLink(input: {
  fromId: string
  toId: string
  type?: LinkType
  inferred?: boolean
  /**
   * How hard this dependency is, when the caller knows. Only a `blocks` link may carry one.
   *
   * Left out means UNQUALIFIED — that A blocks B and nobody has said how much — which is what
   * every link written before these columns existed holds. It does not mean `hard`.
   */
  gate?: Gate
  /**
   * What moves along a `feeds` link, in the writer's own words. Only a `feeds` link may carry it. Left out means
   * nobody said what moves, which is what the column's NULL means.
   */
  carries?: readonly CarriedData[]
  actor: Actor
}): { id: string; revalidation?: RevalidationWritten; nothingWritten?: string } {
  const { fromId, toId, actor } = input
  const type = input.type ?? 'relates_to'
  const gate = input.gate ?? null
  const carries = input.carries === undefined ? null : JSON.stringify(input.carries)

  if (!(type in LINK_TYPES)) throw new PanelError(`"${type}" is not a link type.`)
  if (fromId === toId) throw new PanelError('A record cannot link to itself.')
  // Before the existence query, because a caller with a malformed gate should be told about the
  // request it is holding rather than about the state of the database.
  if (gate !== null) checkGate(gate, type)
  if (carries !== null && type !== 'feeds') {
    throw new PanelError(
      `Only a "feeds" link may carry \`carries\`, and this one is "${type}". \`carries\` names what moves from one ` +
        'step to another, and no other link type says that anything moves. Nothing was written.',
    )
  }

  const both = db.select().from(records).where(inArray(records.id, [fromId, toId])).all()
  if (both.length < 2) throw bothEndsMustExist()

  // BOTH ENDS MUST BE IN ONE PROJECT, AND THE LINK IS FILED THERE.
  //
  // Measured before this check existed: POST /api/links joining a greenhouse record to a Mole Office one
  // answered 201 and stored a link whose row said `workspace_id = 'default'` — so the boundary was
  // crossed silently AND the link was filed in a third project that neither end was in. The insert
  // below never named the column at all and SQLite's own default supplied it.
  //
  // The refusal names both records and both projects, because "these two are not in the same
  // project" is only actionable if you can see which is where.
  const from = both.find((r) => r.id === fromId)
  const to = both.find((r) => r.id === toId)
  if (from === undefined || to === undefined) throw bothEndsMustExist()
  if (from.kind === 'knowledge_bookmark' || to.kind === 'knowledge_bookmark') refuseOrdinaryKnowledgeWrite('knowledge_bookmark')
  refuseCrossWorkspaceLink(from, to, type)
  assertMaySettleFork(from, to, type, actor)
  // AND THE OTHER TWO WAYS OUT OF THE SAME QUEUE, asked here beside the settling link because all
  // three end with a fork no longer waiting on anybody. `assertMayReplaceAFork` says why the three
  // are one act and where its own rule differs from the settling one.
  assertMayReplaceAFork(from, to, type, actor)
  // THE ENDS OF THE THREE INTENDED TYPES ARE CHECKED BY KIND, and `supersedes` is checked when it
  // reaches into the planned world at all. Before the governance acts below, because a caller whose
  // link could never be right should hear about the link rather than about who it is.
  // WHAT THE RECORD IS, BEFORE WHAT THE ENDS ARE. A `ran_instead` writing `instead_of` is refused
  // with the sentence about what a fallback is; asking the kind rule first would answer it with a
  // sentence about planned states, which sends the reader to the wrong problem.
  checkRestrictionLinks(from, to, type)
  checkLinkKinds(from, to, type)
  // `replace` — one whole planned future retiring another.
  if (type === 'supersedes' && to.kind === 'trajectory') {
    assertMayShapeTheFuture({ id: to.id, kind: to.kind, title: to.title }, 'replace', actor)
  }
  // `re-point` — a SECOND `plans_for`. A planned future has exactly one subject, so a second one is
  // moving the person's plan onto a different thing. (Deleting the first and making another is the
  // same act performed in two requests, and the first of those two is the `unlink` act below.)
  if (type === 'plans_for' && from.kind === 'trajectory') {
    const already = db
      .select({ id: links.id })
      .from(links)
      .where(and(eq(links.fromId, from.id), eq(links.type, 'plans_for')))
      .all()
    if (already.length > 0) {
      assertMayShapeTheFuture({ id: from.id, kind: from.kind, title: from.title }, 're-point', actor)
    }
  }
  // The three shape rules about restrictions, and the one governance rule. Both are asked here,
  // beside the fork guard, because both are about the link that is being written.
  checkTheForkBehindARestriction(from, to, type)

  const existing = db
    .select()
    .from(links)
    .where(and(eq(links.fromId, fromId), eq(links.toId, toId), eq(links.type, type)))
    .get()
  if (existing) {
    // Creating the same link twice has always been idempotent, and stays so. What is NOT
    // idempotent is asking for a gate the stored link does not have: quietly answering with the
    // existing id would report success and leave the caller believing a gate it can no longer see,
    // and quietly overwriting would throw away what somebody else wrote. Both are refused, with
    // the two requests that resolve it.
    const stored = readLinkGate(existing)
    // AND THE SAME FOR WHAT MOVES: a different list is refused, never swapped in, for the gate's reason.
    if (carries !== null && existing.carries !== carries) {
      throw new PanelError(
        `A "feeds" link from ${fromId} to ${toId} already exists (${existing.id}) and it carries ` +
          `${existing.carries ?? 'nothing anybody named'}, and this request named ${carries}. Nothing was written: ` +
          `what moves is somebody's statement, and replacing it silently would lose it. To change it, ` +
          `DELETE /api/links/${existing.id} and create the link again. To use the link as it stands, send the same ` +
          'request without `carries`.',
        409,
      )
    }
    if (gate === null || sameGate(stored.gate, gate)) return { id: existing.id, nothingWritten: nothingWrittenSentence({ kind: 'link-exists' }) }
    throw new PanelError(
      `A "${type}" link from ${fromId} to ${toId} already exists (${existing.id}) and it ` +
        `${describeStoredGate(stored)}. This request asked for "${gate.kind}"` +
        `${gate.upTo === undefined ? '' : ` up to "${gate.upTo}"`}, and nothing was written: the gate on a ` +
        `stored link is somebody's statement about how much it blocks, and replacing it silently would lose ` +
        `that. To change it, DELETE /api/links/${existing.id} and create the link again with the gate you ` +
        `want. To use the link as it stands, send the same request without \`gate\`.`,
      409,
    )
  }

  // AND NO SECOND ANSWER TO A SETTLED FORK, in the promote door's words. `theForkIsAlreadySettled` says why. After the
  // repeat above, so a settling link that is already stored still answers with its id.
  if (type === RESOLVES_PROPOSAL && from.kind === DECISION_KIND && to.kind === PROPOSAL_KIND) {
    const standing = theOtherAnswersToThisFork(to, from.id)
    if (standing.length > 0) throw theForkIsAlreadySettled(to, standing, { by: 'link', decision: from })
  }

  // WHICH SORT OF STAGE A PARTIAL GATE NAMES, worked out now and stored beside it, or refused when it
  // names a step or a checklist item of some other record. After the repeat above, so sending a link
  // that is already stored again still answers with its id and writes nothing.
  const upToSort = gate?.upTo === undefined ? null : resolveGateStage(to, gate.upTo)

  // ------------------------------------------------------------------ containment, before it is written
  //
  // A `part_of` link is the one link that says a record is INSIDE another, so two shapes of it are
  // refused: a loop, and a second parent. `design/ROUND-FOUR-BUILD.md` decision 3 settles both.
  //
  // WHY IT IS ASKED HERE AND NOT EARLIER. The idempotent branch above returns first, so asking for
  // a `part_of` link that is already stored still hands back its id rather than being refused for
  // the parent it is itself.
  //
  // THE QUESTIONS ARE NOT ASKED HERE, they are asked of `@shared/containment.ts`, which is the one
  // reader of all three containment stores — a pipeline's stored order, a module's checklist, and
  // this link. Writing the walk again here would be the same fact worked out in two places, and the
  // pipeline half would be the half that drifted: a block is a step of its pipeline with no link
  // saying so, so a rule that only read links would let a block be given a second parent and call
  // it the first.
  //
  // THE LOOP IS ASKED FIRST. When both are true the loop is the bigger fact and its sentence names
  // the whole ring; "it already has a parent" would send the reader to remove one link and leave
  // them with the loop.
  if (type === CONTAINMENT_LINK) {
    // Deleted records included. Deleting never removes anything here, so a deleted parent still
    // holds its part — and a refusal that ignored it would be followed by a link the reader cannot
    // see the other end of. `hasParentAlready` says in words when the parent it names is deleted.
    // The checks are handed only the links, pipelines and records they read, so that a link does not load the whole project.
    const context = whatTheContainmentChecksRead(fromId, toId, from.workspaceId)
    const loop = wouldMakeCycle(fromId, toId, context)
    if (loop.refuse) throw new PanelError(loop.sentence, 409)
    const second = hasParentAlready(fromId, context)
    if (second.refuse) throw new PanelError(second.sentence, 409)
  }

  const id = anOfficeId()
  // ONE TRANSACTION, because a `resolves` link into a restriction writes re-validation rows in the
  // same act. The link and the rows are one fact — this restriction has been answered and here is
  // the work that was resting on it when that happened — and half of it stored is worse than
  // neither: the restriction would read resolved with nothing recording what it had reached.
  const revalidation = sqlite.transaction(() => {
    db.insert(links)
      .values({
        id,
        // The project both ends are in — checked above, so this cannot be one end's and not the
        // other's. Stated rather than left to the column default, which is what filed every link
        // ever written in `default` whatever its ends said. A link with a message at one end is filed in the other end's
        // project, and one between two messages in the message centre.
        workspaceId: from.kind === 'message' || to.kind === 'message' ? whereALinkWithAMessageIsFiled(from, to) : from.workspaceId,
        // WHO OWNS THE LINK, by the rule a record's owner is worked out by in `createRecordWithReport`: the
        // person who made it, or the office's owner when an agent did. It was left to a hard-coded personal
        // DEFAULT until the owner migration `the_owner_comes_from_the_installer` took the default away.
        ownerId: actor.type === 'human' ? actor.id : THE_PERSON,
        fromId,
        toId,
        type,
        inferred: input.inferred ?? false,
        createdBy: actor.id,
        // WHETHER THAT ID IS A PERSON, AN AGENT OR THE OFFICE. The id alone
        // could not say, so every reader asking had to go to the change log.
        createdByType: actor.type,
        createdAt: now(),
        updatedAt: now(),
        gate: gate?.kind ?? null,
        gateUpTo: gate?.upTo ?? null,
        gateUpToSort: upToSort,
        carries,
      })
      .run()
    // One row, in the format every reader of the change log already draws: `field` is the link type
    // and `newValue` is the other end. The gate is not a second row and is not squeezed into this
    // one — it is part of the link this row names, and the link carries its own `createdBy` and
    // `createdAt`, so who set the gate and when is answerable without inventing a row format that
    // ChangeLog.tsx would render as something it is not.
    logChange(fromId, 'link', actor, type, null, toId)
    aRecordChanged(from, 'link')
    aRecordChanged(to, 'link')
    if (type !== 'resolves' || !RESTRICTION_KIND_SET.includes(to.kind)) return null
    return writeRevalidationRows(to.id, from.workspaceId)
  })()
  return revalidation === null ? { id } : { id, revalidation }
}

/**
 * WHAT `wouldMakeCycle` AND `hasParentAlready` READ, AND NOTHING ELSE OF THE PROJECT.
 *
 * The two checks read three things, all through `indexOf` in @shared/containment.ts:
 *   - the project's `part_of` links, the same rows `allLinks` gives, of that one type, since `indexOf` skips the rest;
 *   - every pipeline of the project, deleted ones too, with its `blockIds`, because a pipeline's stored order is the
 *     second parent store (`pipelinesByBlock` in @shared/blocks.ts);
 *   - of each record the two walks reach, its id, kind, title and whether it is deleted: a refusal names a record by
 *     its title and id, parents are put in order by title, then id, and a deleted parent is said in words.
 *
 * WHICH RECORDS THE WALKS REACH is worked out from the links and the pipelines alone, since only they say what holds
 * what: every holder of `fromId` or `toId` in either store, then every holder of those, until no new id comes. That
 * reaches as far as the stores go, so it reaches as far as `MAX_CONTAINMENT_DEPTH` and past a loop in the stored data
 * without stating either limit a second time. It also reaches some records the walks never ask about, which changes
 * no answer: a record that is not a pipeline is looked up only by its id.
 *
 * THE SAME PROJECT RULE AS `listRecords`, deleted records included: the records are read with `ids` through
 * `listRecordsWithDataAs`, which asks `theRecordsListed`. An id the read does not find, a record in another project or
 * no record at all, is not handed in, so the walk stops there and the link is refused as not checked, as before.
 */
function whatTheContainmentChecksRead(fromId: string, toId: string, workspaceId: string): ContainmentContext {
  const partOfLinks: ContainmentLink[] = db
    .select({ id: links.id, fromId: links.fromId, toId: links.toId, type: links.type })
    .from(links)
    .where(and(eq(links.workspaceId, workspaceId), eq(links.type, CONTAINMENT_LINK)))
    .all()
  const pipelines = listRecordsWithDataAs({ workspaceId, kind: 'pipeline', includeDeleted: true }, onlyTheseFieldsOf(['blockIds']))

  const holders = new Map<string, string[]>()
  const holds = (partId: string, holderId: string): void => {
    const known = holders.get(partId)
    if (known === undefined) holders.set(partId, [holderId])
    else known.push(holderId)
  }
  for (const link of partOfLinks) holds(link.fromId, link.toId)
  for (const pipeline of pipelines) for (const blockId of blockIdsOf(pipeline)) holds(blockId, pipeline.id)

  const reached = new Set<string>([fromId, toId])
  let level = [...reached]
  while (level.length > 0) {
    const next: string[] = []
    for (const id of level) {
      for (const holderId of holders.get(id) ?? []) {
        if (reached.has(holderId)) continue
        reached.add(holderId)
        next.push(holderId)
      }
    }
    level = next
  }

  // A pipeline is already read with its `blockIds`, so it is not read a second time without them.
  const pipelineIds = new Set(pipelines.map((pipeline) => pipeline.id))
  const others = [...reached].filter((id) => !pipelineIds.has(id))
  const walked = others.length === 0 ? [] : listRecordsWithDataAs({ workspaceId, includeDeleted: true, ids: others }, sql<string>`'{}'`)
  return { records: [...pipelines, ...walked], links: partOfLinks }
}

/**
 * WHAT A RESOLUTION WROTE, AND WHAT IT DID NOT.
 *
 * Never a bare count. A reply that leaves something out says how much and of what kind, and a reply
 * that CREATED something is under the same rule — a resolution that silently marked four pieces of
 * evidence for re-checking is exactly the surprise this feature exists to prevent.
 */
export interface RevalidationWritten {
  written: number
  /** Rows that were already there, from an earlier resolution of the same restriction. */
  alreadyOpen: number
  /** Records the walk could not go through, because they have been deleted. */
  skippedDeleted: number
  /** True when nothing was written because the author said nothing rests on it. */
  harmless: boolean
  records: { id: string; kind: string; distance: number }[]
}

/**
 * ONE ROW PER RECORD THE RESTRICTION REACHED, AND NOTHING IS WRITTEN TO ANY OF THOSE RECORDS.
 *
 * No field, no change row, no revision on a reached record. A resolution touches the restriction's
 * links and the `revalidations` table and nothing else. **Resolution changes the words and writes
 * the rows. It removes nothing** — the restriction keeps travelling, reading *resolved, not
 * re-checked*, until somebody judges each record.
 *
 * `reached_by` and `distance` are FROZEN as this walk found them. The graph moves; a row written
 * today must say what was true today, or a re-check six weeks later is a check against a question
 * nobody asked. `written_by` says which moment that is.
 *
 * A HARMLESS RESTRICTION WRITES ZERO ROWS. Its author said nothing rests on it; writing
 * re-validation rows would contradict the record's own severity.
 *
 * Rows are written for the DECLARED SCOPE too, at distance 0 — the record the restriction was about
 * is the first thing that needs re-checking — and those rows are load-bearing beyond their own
 * record: a carried reading reads its standing off the row for the record it is carried from.
 *
 * IDEMPOTENT. The unique index on `(restriction_id, record_id)` means resolving twice writes no
 * second row; if the graph has grown, a second resolution adds rows only for records that have
 * none, and the reply says how many were already open.
 */
function writeRevalidationRows(restrictionId: string, workspaceId: string): RevalidationWritten {
  const restriction = db.select().from(records).where(eq(records.id, restrictionId)).get()
  const severity = (restriction?.data as Record<string, unknown> | null)?.['severity']
  if (severity === 'harmless') {
    return { written: 0, alreadyOpen: 0, skippedDeleted: 0, harmless: true, records: [] }
  }
  const reached = restrictionsFrom(restrictionId, workspaceId)
  const already = new Set(
    db
      .select({ recordId: revalidations.recordId })
      .from(revalidations)
      .where(eq(revalidations.restrictionId, restrictionId))
      .all()
      .map((row) => row.recordId),
  )
  const written: { id: string; kind: string; distance: number }[] = []
  let alreadyOpen = 0
  for (const entry of reached.found) {
    if (already.has(entry.recordId)) {
      alreadyOpen += 1
      continue
    }
    const record = db.select().from(records).where(eq(records.id, entry.recordId)).get()
    if (record === undefined) continue
    db.insert(revalidations)
      .values({
        id: anOfficeId(),
        workspaceId,
        restrictionId,
        recordId: entry.recordId,
        reachedBy: JSON.stringify(entry.path),
        distance: entry.distance,
        writtenBy: 'resolution',
        at: now(),
        state: 'needs_review',
      })
      .run()
    written.push({ id: entry.recordId, kind: record.kind, distance: entry.distance })
  }
  return {
    written: written.length,
    alreadyOpen,
    skippedDeleted: reached.skippedDeleted,
    harmless: false,
    records: written,
  }
}

/**
 * THE REFUSAL FOR A LINK WHOSE END IS NOT THERE, from `createLink` and from the link door, which answers a
 * message the caller may not read at either end with it too.
 */
export function bothEndsMustExist(): PanelError {
  return new PanelError('Both ends of a link must exist.', 404)
}

/**
 * THE FOURTH DOOR ONTO THE OWNER'S QUEUE: REMOVING THE LINK THAT TOOK A FORK OFF IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE, EXECUTED OVER HTTP ON 27 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * `deleteLink` checked the workspace boundary and `assertMayShapeTheFuture` on both ends. Nothing
 * about forks. Three requests from an agent, on the owner's own corpus:
 *
 *     DELETE /api/links/<settling-link>   the link the person's decision settled a fork with   200   queue 24 -> 25
 *     DELETE /api/links/<superseding-link>   the `supersedes` THE PERSON made            200   queue 25 -> 26
 *     DELETE /api/links/<duplicate-link>   the `duplicate_of` THE PERSON made          200   queue 26 -> 27
 *
 * Three of the person's governance acts undone, three forks back in their queue, by an agent. The account is
 * `design/round-eleven/wave-b/attack.md`, section 2.
 *
 * THIS WAS ALREADY KNOWN AND ONLY HALF ANSWERED. The comment inside `readForks` names this exact
 * attack — *"could delete the link of a genuinely settled fork to put it back. Found by an
 * independent reviewer, both directions executed"* — and answers it with *"`assertMaySettleFork`
 * refuses that write now"*. It refuses the WRITE. Nothing refused the REMOVAL, and the reader's
 * defence does not cover it: a reader can ignore a link an agent made, and it cannot ignore a link
 * that is gone.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REFUSED, AND IT IS THE SAME TWO QUESTIONS THE OTHER FORK GUARDS ASK
 * ---------------------------------------------------------------------------------------
 *
 * Only a link that is taking a fork off the queue RIGHT NOW is this guard's business, and
 * `linkTakesThisForkOffTheQueue` is what says so — the queue's own reader, so this guard and the
 * queue cannot disagree about which links matter. Removing a link the queue is already ignoring
 * changes nothing and is not refused.
 *
 * An agent is then refused on either of two answers:
 *
 *   1. THE FORK IS THE OWNER'S — it says `the owner`, or nobody has said, or an agent wrote the
 *      classification onto it. Putting one of the owner's forks back is theirs to do, exactly as taking one
 *      off them is.
 *   2. A PERSON MADE THE LINK. Undoing what the person did is theirs, whatever the fork says. This is the half
 *      the classification does not cover: the person settled a fork marked "an agent" on 27 August 2026, and
 *      without this clause an agent could take that settlement apart.
 *
 * WHAT IS NOT REFUSED: an agent removing its own exit link from a fork that is not the owner's. That is an
 * agent tidying up after itself, it is the direction of putting a question BACK, and refusing it
 * would leave agents unable to correct their own links.
 */
export function assertMayPutAForkBackOnTheQueue(
  link: { fromId: string; type: string; toId: string },
  ends: readonly { id: string; kind: string; title: string }[],
  actor: Actor,
): void {
  // WHICH END OF THIS LINK IS THE FORK, from the declaration the reader and the create guards read.
  // `derived_from` is the third exit and it is not in that list, because the list is the two that
  // REPLACE a fork; the settling link ANSWERS one. Both take it off the queue, so both are here.
  const exit =
    link.type === RESOLVES_PROPOSAL
      ? ({ forkEnd: 'to' } as const)
      : LINKS_THAT_REPLACE_A_FORK.find((one) => one.type === link.type)
  if (exit === undefined) return
  const forkId = exit.forkEnd === 'to' ? link.toId : link.fromId
  const otherId = exit.forkEnd === 'to' ? link.fromId : link.toId
  const fork = ends.find((end) => end.id === forkId)
  const other = ends.find((end) => end.id === otherId)
  if (fork === undefined || fork.kind !== PROPOSAL_KIND) return
  // A SETTLING LINK COMES FROM A DECISION AND FROM NOTHING ELSE, which is what `proposalResolution`
  // counts. A note derived from a proposal settles nothing, so removing one is ordinary work.
  if (link.type === RESOLVES_PROPOSAL && other?.kind !== DECISION_KIND) return
  // IS THIS LINK DOING ANYTHING? If the queue is already ignoring it, removing it changes nothing.
  if (!linkTakesThisForkOffTheQueue(forkId, link.fromId, link.type, link.toId)) return

  const their = forkIsTheOwnersToSettle(forkId)
  const byAPerson = humanMadeThisLink(link.fromId, link.type, link.toId)
  if (!their && !byAPerson) return

  const act =
    link.type === RESOLVES_PROPOSAL
      ? `Removing the link that settles the fork "${fork.title}" puts that question back in the owner's queue ` +
        `and takes the decision that answered it off the record`
      : `Removing the ${link.type} link on the fork "${fork.title}" puts that question back in the owner's queue`
  const whose = their
    ? `That fork is the owner's`
    : `That fork is not the owner's, but a person made this link, and undoing what they did is theirs`
  const tail =
    `Nothing was written and the link is exactly as it was. If the fork really is open again — the ` +
    `record that replaced it was wrong, or the decision does not answer it — say so on the fork: ` +
    `POST /api/records {"kind":"annotation","title":"<short name>","data":{"body":"<why this is still ` +
    `open>"}} then POST /api/links {"fromId":"<the annotation>","toId":"${forkId}","type":"about"}. The owner ` +
    `sees it on the fork's own page and removing the link stays one request for them.`

  const asked = `delete the ${link.type} link that takes fork ${forkId} off the queue`

  // AND THE PERSON'S PRESS ANSWERS IT, exactly as their quoted words do. Criterion P59: an elevation gives the
  // person's own acts, and this is one of them — `actKey` on this guard's entry in GOVERNANCE_GUARDS
  // is the act, and the declaration files that act under the power an elevation hands over. The
  // refusal below is unchanged for a request with no warrant and no elevation.
  if (actor.type !== 'human' && actsForThePerson(actor)) return
  if (actor.type !== 'human') {
    throw new PanelError(`${act}. ${whose}, and this request came from ${actor.type} "${actor.id}". ${tail}`, 403)
  }
  if (actor.stated === false) {
    throw new PanelError(
      `${act}. ${whose}, and this request sent no actor headers, so nothing said who is asking. Ordinary ` +
        `writes take that as the person typing by hand; putting something back in somebody's queue may not, ` +
        `because an absent header is not evidence that a person made the write. ${tail} ` +
        `Send x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are>.`,
      403,
    )
  }
  // AND IS IT SOMEBODY MOLE OFFICE KNOWS, asked with the actor clause above and before the machine one,
  // for the reason the other three fork guards give: it is true from any machine.
  if (isSomebodyMoleOfficeCannotPlace(actor)) {
    throw new PanelError(
      `${act}. ${whose}, and this request was made in the name "${actor.id}", which is not somebody Mole Office ` +
        `can place. ${tail} ${ONE_PERSON_AND_THE_NAME_IS_ITS_OWN}`,
      403,
      strangerDetail(asked, actor),
    )
  }
  // AND WHERE IT WAS ASKED FROM, last, because the clauses above hold from any machine and this one
  // does not.
  if (actor.from === 'another machine' && !thePersonIsProved(actor)) {
    throw new PanelError(
      `${act}, and that is done at the machine Mole Office runs on. This request came from another machine. ` +
        `${tail} ${ARRIVAL_IS_NOT_A_CLAIM}`,
      403,
      arrivalDetail(asked),
    )
  }
}

export function deleteLink(id: string, actor: Actor, workspaceId: string): void {
  const l = db.select().from(links).where(eq(links.id, id)).get()
  if (!l) throw new PanelError(`No link with id ${id}`, 404)
  // A link belongs to the project both its ends are in, so deleting one from another project would
  // be reaching across the boundary to remove something. 404, in the same words `recordInWorkspace`
  // uses and for the same reason: it is not found HERE, and nothing is being hidden.
  if (l.workspaceId !== workspaceId) {
    throw new PanelError(
      `No link with id ${id} in the workspace "${workspaceId}". That id names a link in "${l.workspaceId}", ` +
        `which is a different project. Send x-mole-office-workspace: ${l.workspaceId} to work in it.`,
      404,
    )
  }
  // `unlink` — ANY LINK WITH EITHER END IN THE PLANNED WORLD, and both ends is the point. An earlier
  // draft covered only the TO end; `plans_for` runs trajectory -> subject, so its to-end is the
  // pipeline and deleting one left the planned future alive and attached to nothing — gone from the
  // pipeline page, the module page and every read in this design, with one change row as the only
  // trace. That is retiring somebody's planned future without deleting a record.
  const ends = db
    .select({ id: records.id, kind: records.kind, title: records.title, workspaceId: records.workspaceId })
    .from(records)
    .where(inArray(records.id, [l.fromId, l.toId]))
    .all()
  for (const end of ends) {
    if (end.kind === 'knowledge_bookmark') refuseOrdinaryKnowledgeWrite(end.kind)
    assertMayShapeTheFuture({ id: end.id, kind: end.kind, title: end.title }, 'unlink', actor)
  }
  // AND THE FORK GUARD, WHICH THIS ROUTE ASKED NOTHING OF UNTIL 27 AUGUST 2026. Three of the
  // owner's own governance acts were undone through this door in three requests. It is asked here,
  // beside the planning guard, because both are questions about what removing this link would take
  // away from somebody.
  assertMayPutAForkBackOnTheQueue({ fromId: l.fromId, type: l.type, toId: l.toId }, ends, actor)
  db.delete(links).where(eq(links.id, id)).run()
  logChange(l.fromId, 'unlink', actor, l.type, l.toId, null)
  for (const end of ends) aRecordChanged(end, 'link')
}