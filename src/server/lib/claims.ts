// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORK CLAIMS: FILING ONE, READING ITS LEASE, AND OPENING A GROUP WHEN TWO OF THEM OVERLAP.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M13, which absorbs proposal `pg10HWny6J0j`. An agent says what it is working on when it
 * starts. A second live claim naming the same record or the same file opens a group with both agents
 * and the owner in it, without anybody asking.
 *
 * ---------------------------------------------------------------------------------------
 * THE LEASE ENDS WHEN THE RUN ENDS, AND WHICH INPUT SAID SO IS CARRIED WITH THE ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * Two inputs, and they are not equally strong.
 *
 *   THE LEDGER, when a process was registered for this run (GROUND's G5). A registered process the
 *   machine says is gone ends the lease. This is the strong answer.
 *
 *   THE SESSION RECORD, when nothing was registered. Its own state word is then the only thing that
 *   can be asked, and the office asks the same reader every run's own page asks: WHERE THE RUN
 *   STANDS, not the bare word `finished`. A run that said it finished is being checked and keeps its
 *   claim until the check releases it, refuses it or a supervisor confirms it — criterion C29. A run
 *   that was released, refused, confirmed, crashed or orphaned has ended, and its claim ends with it.
 *   This is the weak answer, and the weakness is said out loud on every claim it decides: a run that
 *   died without writing that down would hold a claim open for ever. Decision 9 of Mole Office note
 *   `P-OfZpb_-MHk` measured exactly that failure on the worker's own queue.
 *
 * MOST SESSIONS REGISTER NO PROCESS. An agent working in a terminal files a session record and
 * registers nothing, so requiring a live process would end every such claim the moment it was filed.
 * That is why both inputs exist, rather than the ledger alone.
 *
 * THERE IS NO EXPIRY TIME. `renewed_at` records the run saying it is still here and changes nothing
 * about when the lease ends. A number of minutes would be a guess about how long work takes, and a
 * claim that expired while its run was still going is the wrong answer in the direction that matters.
 */

import { statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'
import { db, sqlite } from '../db/client.ts'
import { STORED_FIELDS, changes, handleHolds, links, records, workClaims } from '../db/schema.ts'
import { nowStamp } from '@shared/time.ts'
import { isParticipantKind, participantWord, type ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { participantKey } from '@shared/messages.ts'
import {
  A_CLAIM_IS_THE_CLAIMANTS_OWN,
  A_CLAIM_OF_A_RUNNING_RUN_IS_THE_AUTHORS_OWN,
  CLAIM_WORDS,
  conflictGroupName,
  THAT_CLAIM_HAS_ENDED,
  isClaimedKind,
  leaseInputSays,
  noSuchRun,
  noWorkAreaForTheOfficesOwnRow,
  noWorkAreaToStart,
  overlapKey,
  thingsOverlap,
  whyTheThingsAreRefused,
  type ClaimOnTheWire,
  type ClaimedThing,
  type LeaseInput,
  type LeaseState,
  type Overlap,
} from '@shared/claims.ts'
import { pathCovers } from '@shared/paths.ts'
import {
  A_ROW_WITH_NO_ROLE_READS_AS,
  aRoleNeedsARegisteredWorkArea,
  cardFor,
  whoTheCardReportsTo,
} from '@shared/roles.ts'
import { isMoleOffice, moleOffice } from '@shared/participants.ts'
import { SYSTEM_LINES, THE_OVERLAP_ENDED_PREFIX, type AnOfficeLine } from '@shared/groups.ts'
import { createLink, theAgentIdOfATerritoryRun, theAgentOfATerritoryRun, everyAgentAStoredStampCouldName, getRecord, getRecordsWithIds, patchRecord, throughTheCardDoor, whetherThisWriteFinishesTheRun, whoFiled, type RecordPatch, type TerritoryWriteCheck, type TheTerritoryRunLookups } from './records.ts'
import { PanelError } from './panel-error.ts'
import { GitFailure, GitSession, Stale } from './async-take-back.ts'
import { REMINDED_BEFORE_THE_SEAL, readRemindedBeforeTheSeal } from '@shared/before-the-seal.ts'
import { retireThisAgent, whyThisActorMayNotRetire, type RegisteredAgent } from './participants.ts'
import { agentsStartedFor } from '../db/agents-started-for.ts'
import { repositoryRelativePaths } from './repository-relative-paths.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import { recordForAgentIn } from '../db/record-for-agent-in.ts'
import { everyAgentsIdentityWithReferencesReadOnce, type TheIdentityOf } from './agent-references.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { asStored } from '@shared/as-stored.ts'
import { elevationsThatEndWith } from './elevations-that-end-with.ts'
import { anyRecordForAgent } from '../db/any-record-for-agent.ts'
import { processLivenessForRun, processLivenessForRuns, type Liveness } from './resources.ts'
import { howARunStands } from '@shared/releasing.ts'
import { readGit } from './resources.ts'
import { whatIsOutsideTheCommit } from '../../config/outside-the-commit.mjs'
import { theRoleCards, theRoleCardsAreRead } from './roles.ts'
import {
  groupOpenedFor,
  groupsOpenedForAWorkAreaOverlap,
  handleOf,
  openAGroupAndSayWhy,
  writeASystemLine,
} from './groups.ts'
import { messagesInAGroup } from './messages.ts'
import { theLiveHoldOnSession } from './handles.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { EVERY_PROJECT } from '@shared/which-projects.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { theRegistryReadOnce } from './inspection.ts'
import { bringTheSecretariatGroupInStep } from './secretariat.ts'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from './gate-counts.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { Actor } from './records.ts'

// ============================================================================ the lease

/**
 * THE REGISTRY ROW ONE STORED REFERENCE NAMES, the one reading this file's stored references use.
 *
 * A claim row's `claimantId`, a `startedBy` link walked above an agent, and an elevation grant's
 * recorded handle were all written earlier and are read back now. They are read the stored way and
 * never through the arriving-reference resolver: exact id first, which settles it alone; failing
 * that, the one agent bearing the string as a handle, live or retired; and no agent where more than
 * one answers. A stored name two agents could answer names nobody, which keeps a page readable and
 * stops a claim being attributed to the wrong agent.
 *
 * `everyAgentAStoredStampCouldName` in lib/records.ts is that one reading, built on the readers of
 * lib/agent-references.ts. This gives it back as a registry row.
 */
function theAgentAStoredReferenceNames(stored: string): RegisteredAgent | null {
  const named = everyAgentAStoredStampCouldName(stored)
  if (named.length !== 1) return null
  return readParticipant({ kind: 'agent', id: named[0]!.id }) as RegisteredAgent | null
}

/** What one row says its lease is, and which input answered. */
interface Standing {
  state: LeaseState
  from: LeaseInput | null
  /**
   * WHETHER THE RUN ITSELF IS STILL RUNNING, which is not the same as whether the claim is live.
   *
   * A run that said it finished is waiting for a check and is not running, but criterion C29 keeps
   * its claim live — so `state` is `live` while `running` is false. F3 and F4 ask this and nothing
   * else: a new claim opens no group against a claim of a run that is not running, and the secretary
   * may release one. A claim already released carries false, because there is no running run behind
   * a claim nobody holds.
   */
  running: boolean
}

/**
 * WHETHER THE RUN BEHIND ONE CLAIM IS STILL GOING, and which input said so.
 *
 * The ledger is asked first because it is the stronger answer. A run with a registered process the
 * machine says is alive is going, whatever its record says; one whose every registered process is
 * gone has ended, whatever its record says. Only where nothing was registered does the record's own
 * word decide, and the answer then carries `the session record` so that no screen can draw it as
 * strongly as the other.
 *
 * Problem wNjQEfclwxjJ, inspector lBw2WAGMOKwF, UQQeEtGCHiRn: a process that cannot
 * be read keeps the claim held. USER.md invariants 2 and 5 forbid releasing claims on a guess
 * or calling an unchecked process alive. Only a confirmed live process answers from the ledger.
 * When none is confirmed alive, an unknown reading has its own input and words.
 */
export function howTheRunStands(
  runId: string,
  workspaceId: string,
  // NOT READ ANY MORE: the standing needs no agent (see below). Kept so that the callers handing in
  // one reading of the registry are unchanged.
  agents?: () => readonly RegisteredAgent[],
  // The normalized candidate before storage; the ledger and standing reader stay the same.
  candidate?: PanelRecord,
  // WHAT A CALLER READING MANY RUNS READ BEFOREHAND: the run's open process readings and its record,
  // null where no record has the id. `liveClaimsForColumn` reads both once for every run of a project.
  read?: { held: readonly Liveness[]; run: PanelRecord | null },
): Standing {
  const held = read?.held ?? processLivenessForRun(runId, workspaceId)
  if (held.length > 0) {
    if (held.some((one) => one.state === 'alive')) return { state: 'live', from: 'the ledger', running: true }
    if (held.some((one) => one.state === 'unknown')) {
      return { state: 'live', from: 'a process that could not be checked', running: true }
    }
    return { state: 'the run ended', from: 'the ledger', running: false }
  }
  const run = candidate ?? (read === undefined ? getRecord(runId) : read.run)
  // A RUN NOTHING ANSWERS FOR HAS ENDED. A claim whose session record was deleted has nothing behind
  // it at all, and holding the claim open on an absence would be the fifth rule broken: nothing is
  // there is not the same as somebody is still working.
  if (run === null || run.deletedAt !== null) {
    return { state: 'the run ended', from: 'the session record', running: false }
  }
  /**
   * THE CLAIM ENDS ON THE RUN'S STANDING, NOT ON THE WORD `finished`. Criterion F1, problem
   * DrX8P0fYGmx8.
   *
   * `state: finished` is the worker's own word that its work is done, and C29 says that word is not
   * the end: the run enters `inspecting` and stays a live run — its worktree kept, nothing about it
   * removed — until a check and then a supervisor say otherwise. So an inspecting run keeps its
   * claim, and so does a run still working. Every other standing the office can work out is the run
   * being over: a release put it in `reporting`, a refusal put it in `rebuttal`, a confirmation put
   * it in `closed`, and a run that died without saying so is `crashed` or `orphaned`.
   *
   * IT ASKS THE SAME READER EVERY OTHER SCREEN ASKS. `howARunStands` works the standing out from
   * the office's four acts, and `whereARunStands` takes its standing from it, so there is no second
   * rule here free to disagree with the run's own page. It is asked directly because
   * `whereARunStands` also reads the run's agent and the names its sentences print, which no
   * standing needs, and a caller reading every claim of a project would read those for each run.
   */
  // A run whose stored data is not an object is read as an empty one, as `whereARunStands` reads it.
  const standing = howARunStands(typeof run.data === 'object' && run.data !== null && !Array.isArray(run.data) ? run.data : {}).standing
  if (standing === 'inspecting') return { state: 'live', from: 'the session record', running: false }
  if (standing === 'working') {
    // A run that never said it finished. If its own state is one of the words that mean over, it
    // died without saying so; otherwise it is still going, and `idle` and `unknown` are still going
    // because neither says the run stopped.
    if (theRunHasEnded(run.data['state'])) {
      return { state: 'the run ended', from: 'the session record', running: false }
    }
    return { state: 'live', from: 'the session record', running: true }
  }
  // `reporting` (released), `rebuttal` (refused) and `closed` (confirmed) are all over as far as what
  // the run was holding. Nothing the run did keeps its claim alive once one of the office's own acts
  // has ended it.
  return { state: 'the run ended', from: 'the session record', running: false }
}

/** One stored row, read into the shape every screen and every caller gets. */
function asClaim(row: typeof workClaims.$inferSelect, agents?: () => readonly RegisteredAgent[], readStanding?: Standing): ClaimOnTheWire {
  const things = thingsOf(row.things)
  const claimant: ParticipantRef = {
    kind: isParticipantKind(row.claimantKind) ? row.claimantKind : 'agent',
    id: row.claimantId,
  }
  const standing: Standing = readStanding ?? howTheRunStands(row.run, row.workspaceId, agents)
  /**
   * A CLAIM SOMEBODY RELEASED WHILE ITS RUN IS STILL GOING READS `released`. Once the run itself has
   * ended, the run's own end is the stronger fact: nobody released this claim, the run did.
   *
   * F2 writes `releasedAt` on a crashed or orphaned run so the row is carried and the group can be
   * told, and this is what keeps the word on the wire `the run ended` rather than `released`. The
   * change is the reconciliation F1 and F2 owe each other: the transition is what writes the row, and
   * the standing is what a reader sees.
   */
  const held: Standing =
    row.releasedAt !== null && standing.state === 'live'
      ? { state: 'released', from: null, running: false }
      : standing
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    claimant,
    run: row.run,
    things,
    openedAt: row.openedAt,
    renewedAt: row.renewedAt,
    releasedAt: row.releasedAt,
    releasedBecause: row.releasedBecause,
    state: held.state,
    from: held.from,
  }
}

/** The things off a stored JSON string. Anything that is not a claimed thing is left out. */
function thingsOf(stored: string): ClaimedThing[] {
  let held: unknown
  try {
    held = JSON.parse(stored)
  } catch {
    // A ROW WHOSE JSON CANNOT BE READ NAMES NOTHING, and it says so rather than taking a page down.
    // Nothing writes such a row through this file; one could only arrive by hand or from an import.
    return []
  }
  if (!Array.isArray(held)) return []
  const out: ClaimedThing[] = []
  for (const one of held) {
    if (one === null || typeof one !== 'object' || Array.isArray(one)) continue
    const said = one as { what?: unknown; id?: unknown }
    if (!isClaimedKind(said.what)) continue
    if (typeof said.id !== 'string' || said.id === '') continue
    out.push({ what: said.what, id: said.id })
  }
  return out
}

// ============================================================================ reading

/**
 * Every claim in one project, newest first.
 *
 * `agents` IS NOT READ ANY MORE. A claim's standing used to ask which agent its run serves, so the
 * registry was read once for all the claims, and a caller reading several projects handed in its own
 * reading (`theRegistryReadOnce` in lib/inspection.ts). `howTheRunStands` now reads the standing
 * through `howARunStands`, which needs no agent. The argument is kept so that its callers are unchanged.
 */
export function claimsIn(workspaceId: string, agents: () => readonly RegisteredAgent[] = theRegistryReadOnce(), only?: TheseClaims): ClaimOnTheWire[] {
  return theClaimRows(workspaceId, only).map((row) => asClaim(row, agents))
}

/** The stored claim rows of one project, newest first. `claimsIn` and `liveClaimsForColumn` both read them here. */
function theClaimRows(workspaceId: string, only?: TheseClaims): (typeof workClaims.$inferSelect)[] {
  const inProject = eq(workClaims.workspaceId, workspaceId)
  const among = (values: readonly string[]) => sql`(select value from json_each(${JSON.stringify(values)}))`
  return db
    .select()
    .from(workClaims)
    .where(only === undefined ? inProject : and(inProject, sql`(${workClaims.claimantId} in ${among(only.claimants)} or ${workClaims.run} in ${among(only.runs)})`))
    .orderBy(sql`${workClaims.openedAt} desc`, sql`${workClaims.id} desc`)
    .all()
}

/**
 * THE CLAIMS A READING OF SOME AGENTS NEEDS (wave 13y round 51): those whose claimant has one of these ids, and those
 * held by one of these runs. The claimant's id alone, whatever its kind, because a kind `asClaim` cannot read is read as
 * an agent.
 */
export interface TheseClaims {
  claimants: readonly string[]
  runs: readonly string[]
}

/** Every claim in one project whose lease has not ended, newest first. */
export function liveClaimsIn(workspaceId: string, agents?: () => readonly RegisteredAgent[], only?: TheseClaims): ClaimOnTheWire[] {
  return claimsIn(workspaceId, agents, only).filter((one) => one.state === 'live')
}

/**
 * THE LIVE CLAIMS OF A PROJECT, as `liveClaimsIn` gives them, with the process ledger and the run records read once
 * for all the runs instead of once for each claim. The delegation column asks this. Each run's standing is still
 * worked out by `howTheRunStands`, which is handed what was read.
 */
export function liveClaimsForColumn(workspaceId: string): ClaimOnTheWire[] {
  const rows = theClaimRows(workspaceId)
  const ids = [...new Set(rows.map((row) => row.run))]
  const processes = processLivenessForRuns(ids, workspaceId)
  const runs = getRecordsWithIds(ids)
  const standings = new Map<string, Standing>()
  const standingOf = (id: string): Standing => {
    const kept = standings.get(id)
    if (kept !== undefined) return kept
    const standing = howTheRunStands(id, workspaceId, undefined, undefined, { held: processes.get(id) ?? [], run: runs.get(id) ?? null })
    standings.set(id, standing)
    return standing
  }
  return rows.map((row) => asClaim(row, undefined, standingOf(row.run))).filter((claim) => claim.state === 'live')
}

/**
 * Every live claim naming one record, newest first. This is what a record page draws. A caller that asks about many
 * records may pass `live`: it must be the live claims of the same workspace, read once, because `workspaceId` is then
 * not read.
 */
export function liveClaimsOnRecord(recordId: string, workspaceId: string, live = liveClaimsIn(workspaceId)): ClaimOnTheWire[] {
  return live.filter((one) =>
    one.things.some((thing) => thing.what === 'record' && thing.id === recordId),
  )
}

/** One claim, or a refusal naming what the id turned out to be. */
export function theClaimOrARefusal(id: string, workspaceId: string): ClaimOnTheWire {
  const row = db.select().from(workClaims).where(eq(workClaims.id, id)).get()
  if (row === undefined) {
    throw new PanelError(`No work claim has the id ${id}. GET /api/claims lists every claim in this project.`, 404)
  }
  if (row.workspaceId !== workspaceId) {
    throw new PanelError(
      `The claim ${id} is in the project "${row.workspaceId}" and this request is about "${workspaceId}".`,
      404,
    )
  }
  return asClaim(row)
}

// ============================================================================ overlap

/**
 * EVERY PAIR OF LIVE CLAIMS THAT NAME THE SAME THING, in one project.
 *
 * TWO CLAIMS FROM THE SAME PARTICIPANT ARE NOT AN OVERLAP. An agent that files a second claim while
 * its first is still live is not in conflict with itself, and opening a group with one member in it
 * would be the mechanism firing on nothing.
 *
 * ONE PAIR PER THING, not one per pair of claims. Two agents claiming the same three files are three
 * overlaps, and each has its own key — so a group opened for the first does not silence the other
 * two, and the system lines say which thing each is about.
 */
export function overlapsIn(workspaceId: string): Overlap[] {
  // OLDEST FIRST, so which pair is named for one overlap does not depend on the order rows came
  // back. A participant may hold two live claims on the same thing — it filed a second one while
  // the first was still going — and the pair named is then the earliest two, every time anybody
  // asks. Reading them newest first made that arbitrary, which made "is this claim in a conflict"
  // arbitrary with it.
  const live = [...liveClaimsIn(workspaceId)].sort(
    (a, b) => a.openedAt.localeCompare(b.openedAt) || a.id.localeCompare(b.id),
  )
  const out: Overlap[] = []
  const seen = new Set<string>()
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i]
      const b = live[j]
      if (a === undefined || b === undefined) continue
      if (participantKey(a.claimant) === participantKey(b.claimant)) continue
      // AN OVERLAP INSIDE ONE STARTER CHAIN IS DELEGATION, NOT A CONFLICT. Criterion P100 (B): two
      // agents in one chain open no group and nothing is said, so this reading leaves their pair out
      // entirely — the record page draws no conflict, and `openTheGroupsForANewClaimAndSayWhy` finds
      // nothing to open. Two agents in different chains fall through exactly as before.
      if (
        a.claimant.kind === 'agent' &&
        b.claimant.kind === 'agent' &&
        theTwoAgentsAreInOneChain(a.claimant.id, b.claimant.id)
      ) {
        continue
      }
      for (const thing of a.things) {
        for (const other of b.things) {
          if (!thingsOverlap(thing, other)) continue
          const key = overlapKey(a.claimant, b.claimant, thing)
          if (seen.has(key)) continue
          seen.add(key)
          const pair: readonly [ClaimOnTheWire, ClaimOnTheWire] = a.id < b.id ? [a, b] : [b, a]
          out.push({ claims: pair, thing, key, groupId: groupOpenedFor(key)?.id ?? null })
        }
      }
    }
  }
  return out
}

/** Every overlap one claim is part of. */
export function overlapsFor(claimId: string, workspaceId: string): Overlap[] {
  return overlapsIn(workspaceId).filter((one) => one.claims.some((claim) => claim.id === claimId))
}

/** Every overlap that touches one record, so a record page can draw the conflict in the wrong colour. */
export function overlapsOnRecord(recordId: string, workspaceId: string): Overlap[] {
  return overlapsIn(workspaceId).filter((one) => one.thing.what === 'record' && one.thing.id === recordId)
}

/**
 * WHAT ONE CLAIMED THING IS CALLED. Two forms, because a name and a sentence want different things.
 *
 * `quoted` goes inside a sentence — *Two agents are working on "The clamp calibration"* — where
 * the quotation marks are what tell the reader where the title starts and stops. `plain` is the same
 * words with nothing around them, for the group's own name, where a second pair of quotation marks
 * inside a quoted name reads as a mistake.
 */
function thingInWords(thing: ClaimedThing): { quoted: string; plain: string } {
  if (thing.what === 'path') {
    const said = CLAIM_WORDS.aPath(thing.id)
    return { quoted: said, plain: said }
  }
  const record = getRecord(thing.id)
  if (record === null) return { quoted: CLAIM_WORDS.recordIsGone, plain: CLAIM_WORDS.recordIsGone }
  return { quoted: `"${record.title}"`, plain: record.title }
}

/**
 * OPEN A GROUP FOR ONE OVERLAP, WITHOUT ANYBODY ASKING, and write the line saying why.
 *
 * The group holds both claimants and the owner, and nobody was asked. The owner is in it because a
 * conflict between two agents is theirs to see.
 *
 * THE SAME OVERLAP NEVER OPENS A SECOND GROUP. `groups.about` holds the overlap's one spelling under
 * a unique index, so a second attempt finds the first group and writes nothing. That is checked
 * before the write and enforced by the database, because the check alone would lose a race between
 * two claims filed in the same moment.
 *
 * P95's AREA OVERLAP USES THE SAME CORE, and only its members and its line differ. `openTheGroupOnce`
 * is that core: the one check for a group already open, the one group write, and the one system
 * line. Nothing opens a group a second way.
 */
export function openTheGroupForAnOverlap(overlap: Overlap, workspaceId: string, by: Actor): string {
  const [first, second] = overlap.claims
  const owner: ParticipantRef = { kind: 'person', id: THE_PERSON }
  const members = [
    { who: first.claimant, because: `It claimed ${thingInWords(overlap.thing).quoted} at ${first.openedAt}.` },
    { who: second.claimant, because: `It claimed ${thingInWords(overlap.thing).quoted} at ${second.openedAt}.` },
  ]
  // THE OWNER IS ADDED UNLESS THEY ARE ONE OF THE TWO ALREADY. A person can hold a claim, and adding them
  // twice would be refused; their membership is the point of the group, so it is checked rather than
  // assumed.
  if (!members.some((one) => participantKey(one.who) === participantKey(owner))) {
    members.push({ who: owner, because: 'A conflict between two agents is the person\'s to see, so the person was added to it.' })
  }
  return openTheGroupOnce(
    overlap.key,
    conflictGroupName(
      handleOf(first.claimant),
      handleOf(second.claimant),
      thingInWords(overlap.thing).plain,
    ),
    'Two agents claimed the same thing at the same time, so this group was opened for them to settle it.',
    members,
    SYSTEM_LINES.claimsInConflict(
      thingInWords(overlap.thing).quoted,
      handleOf(first.claimant),
      handleOf(second.claimant),
    ),
    workspaceId,
    by,
  )
}

/**
 * THE ONE PLACE A GROUP IS OPENED FOR AN OVERLAP. Both the claim overlap above and P95's area
 * overlap below come through here, so the same pair never opens two groups and the same act cannot
 * get two wordings. A clash over a GPU booking (lib/bookings.ts) comes through here too. One of the
 * owner's decisions says it is the same kind of thing as a work-area
 * overlap.
 * A territory group's first line is linked to the two runs it names (`discusses`), as every later line in that
 * group is.
 */
export function openTheGroupOnce(
  key: string,
  name: string,
  because: string,
  members: readonly { who: ParticipantRef; because: string }[],
  line: AnOfficeLine,
  workspaceId: string,
  by: Actor,
  discusses: readonly string[] = [],
): string {
  const already = groupOpenedFor(key)
  if (already !== null) return already.id
  const group = openAGroupAndSayWhy({ workspaceId, name, openedBy: moleOffice(), because, members, about: key }, by)
  sayAnOverlapLine(group.id, workspaceId, line, discusses, by)
  return group.id
}

/** Write an overlap line into its group, and link it to each record it names. Nothing is linked when nobody is in the group. */
function sayAnOverlapLine(groupId: string, workspaceId: string, line: AnOfficeLine, discusses: readonly string[], by: Actor): void {
  const said = writeASystemLine(groupId, workspaceId, line, by)
  if (said === null) return
  // discusses: "The note or message, to what it is about" — here the line, to each run it names.
  for (const toId of discusses) createLink({ fromId: said.id, toId, type: 'discusses', actor: by })
}

/**
 * ONE OVERLAP BETWEEN TWO AGENTS' REGISTERED WORK AREAS — CRITERION P95.
 *
 * A work area is what an agent registered as the place it works, and "at work" is the office's own
 * word for an agent with a live work claim: the claim is the moment the office observes work
 * starting, and the two cannot disagree about who is at work if they read the same rows. The
 * comparison reuses `thingsOverlap`, which is the one place a folder covering a file is decided.
 */
export interface WorkAreaOverlap {
  /** The other agent's handle. */
  withAgent: string
  /** The group opened for the pair. */
  group: string
  /** The path both areas cover. */
  path: string
}

/** The one spelling of an area overlap: the two agents in handle order. Never drawn. */
export function workAreaOverlapKey(first: string, second: string): string {
  return ['work-area', ...[first, second].sort()].join('|')
}

/**
 * OPEN A GROUP FOR EVERY OTHER AGENT AT WORK WHOSE AREA OVERLAPS THIS ONE — CRITERION P95.
 *
 * NOTHING IS REFUSED BY AN OVERLAP. This returns the groups it opened and never throws for the
 * overlap itself: the registration or widening that caused it has already been written and stands.
 * The members are the two agents and, for each, the one above it as ITS OWN CARD says — its starter,
 * or the secretary, and nobody where the card reports to the person. That is criterion P100 (A):
 * the card decides, never the historical starter chain. The owner is not added, which is the
 * claim-overlap rule and not this one. The group is the P95 answer to a clash; the office does not
 * stop the work. An overlap inside one starter chain opens no group at all — criterion P100 (B).
 */
export function openTheGroupsForAWorkArea(
  input: { agentHandle: string; area: readonly string[]; workspaceId: string },
  by: Actor,
): WorkAreaOverlap[] {
  // `input.agentHandle` is a STORED reference: the work-area door and the registration door pass the
  // handle the registry row carries, and a legacy row is found by its own id here as well.
  const me = theAgentAStoredReferenceNames(input.agentHandle)
  if (me === null || input.area.length === 0) return []
  const secretary = theOnlySecretary()
  const opened: WorkAreaOverlap[] = []
  for (const other of theAgentsAtWork(input.workspaceId)) {
    if (other.handle === me.handle) continue
    const theirArea = Array.isArray(other.workArea) ? other.workArea : []
    if (theirArea.length === 0) continue
    const path = theOverlappingPath(input.area, theirArea)
    if (path === null) continue
    /**
     * AN OVERLAP INSIDE ONE STARTER CHAIN OPENS NO GROUP. Criterion P100 (B): a superior's area
     * holding a subordinate's area is the ordinary shape of delegation, not a collision, so nothing
     * is opened and nothing is said. Two agents in different chains go on exactly as before. The
     * check is after the path is found, so a pair whose areas do not overlap is untouched either way.
     */
    if (theTwoAgentsAreInOneChain(me.handle, other.handle)) continue
    const key = workAreaOverlapKey(me.handle, other.handle)
    if (groupOpenedFor(key) !== null) continue
    const members = theMembersOfAWorkAreaGroup(me, other, path, secretary)
    const group = openTheGroupOnce(
      key,
      conflictGroupName(me.handle, other.handle, path),
      `Two registered work areas overlap on ${path}, so this group was opened for them to settle it.`,
      members,
      SYSTEM_LINES.workAreasInConflict(
        path,
        me.handle,
        other.handle,
      ),
      input.workspaceId,
      by,
    )
    markTheWorkAreaOverlap(me, other, group, path, input.workspaceId, by)
    opened.push({ withAgent: other.handle, group, path })
  }
  return opened
}

export type TerritoryOverlaps =
  | { compared: false; because: string }
  | {
      compared: true
      /** Each running run of another line whose changed paths meet this run's, with every path where they meet. */
      overlaps: { run: string; agent: string; paths: string[]; group?: string; notOpened?: string; notChecked?: string }[]
      /** Each running run of another line that could not be compared with this one, and why. No group is opened for it. */
      notChecked?: { run: string; agent: string; says: string }[]
    }

/**
 * A TERRITORY NAMES FOLDERS AND FILES AT ANY DEPTH, normalised, and nothing outside the repository (wave 13u
 * round 62). It used to be checked with the worker card's work-area rule, which refuses a file inside a folder,
 * so a run could name a busy shared file only by naming its whole folder. A territory is a warning between
 * lines, not a registration, so it keeps only the rule that its paths lie inside the repository; the
 * comparison takes a changed path against an entry with pathCovers.
 */
export function validateATerritory(area: readonly string[]): string[] {
  return repositoryRelativePaths(area, 'A territory')
}

/**
 * ---------------------------------------------------------------------------------------
 * TWO RUNS MEET WHERE THEIR CHANGED PATHS MEET (wave 13u round 194)
 * ---------------------------------------------------------------------------------------
 *
 * On 9 November 2026 the office sent 189 notices of a territory overlap, and nearly every answer in those groups said
 * there was none. Each line declares the folders every line works in, so two runs met whenever they changed any file in
 * one of them. Now two runs meet only at a path one of them changed:
 *
 *   - a path both runs changed, or
 *   - a path one run changed that lies under a narrow entry of the other run's territory: a file, a pattern, or a folder
 *     only one line declares. A folder counts whether it is written `folder` or `folder/**`.
 *
 * A shared folder never makes two runs meet by itself. A declared folder is shared when the territories of two or more
 * different agents declare it or something inside it: the folder itself, a folder or a file under it, or a pattern whose
 * fixed start lies under it. The territories read for this are those of every running run and of each agent's latest
 * run that holds one, because a line between rounds still works in what it last declared. No run is aged out. The rule
 * counts agents, not runs. No folder name is written here: which folders are shared comes out of the stored territories.
 *
 * A run's changed paths are what differs between its `cutFrom` and its worktree, its `workingDirectory`: committed and
 * uncommitted changes, both sides of a rename, deletions, and untracked files Git does not ignore. Git reads them in a
 * child process, asynchronously, with a deadline and a size limit (GitSession in async-take-back.ts), before the write
 * that compares them, so a read never holds the server thread or a database transaction. A run whose changes could not
 * be read is never compared as if it had changed nothing: the answer says why in words, under `notChecked`, and no group
 * is opened on a guess.
 */

/** How long Git may take to read one worktree's changed paths, in milliseconds. */
export const CHANGED_PATHS_DEADLINE_MS = 10_000

/** How many paths where two runs meet a group's line names, before it says how many more there are. */
export const MEETING_PATHS_NAMED = 10

/** One run's changed paths as Git read them, or the sentence saying why they could not be read. */
export type AChangedPathsRead = { paths: string[] } | { notRead: string }

/** The changed paths read before one write, for each worktree and cut a compared run names (`whereItsChangesAre`). */
export type TheChangedPaths = ReadonlyMap<string, AChangedPathsRead>

/** Where a run's changes are read: its worktree and its cut, with the key the reads are kept under; or why nowhere. */
function whereItsChangesAre(data: Record<string, unknown>): { folder: string; cut: string; key: string } | { notRead: string } {
  const folder = data['workingDirectory'], cut = data['cutFrom']
  if (typeof folder !== 'string' || !isAbsolute(folder)) return { notRead: sayInEnglish('territory.notReadNoWorktree') }
  if (typeof cut !== 'string' || cut.trim() === '') return { notRead: sayInEnglish('territory.notReadNoCut') }
  return { folder, cut, key: `${folder}\u0000${cut}` }
}

/**
 * Read one worktree's changed paths since its cut, in one Git session that is closed whatever happens.
 *
 * GIT IS ASKED FOR LISTS, AND THE OFFICE COMPARES THE FILES ITSELF. A run can write its repository's config and its
 * attributes, and git runs a clean or process filter the repository names whenever it compares a file in the work tree
 * with a commit or the index. A filter is any program, and it would run on the host as the owner. So no `diff` or other
 * comparison of worktree files runs here: `whatIsOutsideTheCommit` (src/config/outside-the-commit.mjs) asks git for the
 * commit's tree, the paths it converts and the index with the untracked files, and reads the files here. A file the
 * shared reader could not compare is counted as changed, never as unchanged.
 */
async function readTheChangedPaths(folder: string, cut: string): Promise<AChangedPathsRead> {
  if (!isAFolder(folder)) return { notRead: sayInEnglish('territory.notReadWorktreeGone', { folder }) }
  const session = new GitSession()
  const until = performance.now() + CHANGED_PATHS_DEADLINE_MS
  const git = async (args: string[]) => session.read(folder, args, until)
  const outsideTheCommit = (args: string[], options?: { input?: string; workTree?: string }) => {
    const left = until - performance.now()
    if (left <= 0) throw new Stale('deadline')
    return readGit(folder, args, { ...(options ?? {}), timeoutMs: Math.max(1, Math.ceil(left)) })
  }
  try {
    let commit: string
    try {
      commit = (await git(['rev-parse', '--verify', '--end-of-options', `${cut}^{commit}`])).trim()
    } catch (error) {
      if (error instanceof GitFailure && error.status !== null) return { notRead: sayInEnglish('territory.notReadNoCommit', { cut }) }
      throw error
    }
    const outside = whatIsOutsideTheCommit(folder, commit, outsideTheCommit)
    return { paths: [...new Set([...outside.dirty, ...outside.notCompared, ...outside.untracked])].sort() }
  } catch (error) {
    if (error instanceof Stale && error.reason === 'deadline') {
      return { notRead: sayInEnglish('territory.notReadTooLong', { seconds: String(CHANGED_PATHS_DEADLINE_MS / 1000) }) }
    }
    if (error instanceof Stale) return { notRead: sayInEnglish('territory.notReadNoGit') }
    return { notRead: sayInEnglish('territory.notReadGitFailed', { says: error instanceof Error ? error.message : String(error) }) }
  } finally {
    session.close()
  }
}

/** One run in the light list: only the data the comparison reads, and the agent's id, worked out once. */
type ALightTerritoryRun = {
  id: string
  workspaceId: string
  data: Record<string, unknown>
  /** Whether the run may be running, decided in SQL from its state and its open process rows. */
  mayBeRunning: boolean
  /** The registry id of the run's agent, or null when the office can name none. */
  agentId: string | null
}

/** One reading of every territory run before a write: the light rows, and the whole record of each running run. */
type ATerritoryReading = {
  /** Every session in the project holding a territory, newest first. */
  runs: readonly ALightTerritoryRun[]
  /** The whole record of every flagged run `howTheRunStands` calls running, newest first. */
  running: readonly PanelRecord[]
}

/** The data fields the territory comparison reads from a run, and no others. */
const THE_TERRITORY_FIELDS_THE_COMPARISON_READS = ['territory', 'workingDirectory', 'cutFrom', 'state', 'servingAgentId', 'servingAgent', 'ranAs'] as const

/**
 * The comparison's data fields as a JSON object, built as `thePresenceSessionData` builds presence's: each value keeps
 * its JSON type, and data that is not an object is passed through to the reader that would have seen it.
 */
function theTerritorySessionData() {
  const fields = sql.join(THE_TERRITORY_FIELDS_THE_COMPARISON_READS.flatMap((field) => [sql`${field}`, sql`${records.data} -> ${`$.${field}`}`]), sql`, `)
  return sql`case when json_valid(${records.data}) then case when json_type(${records.data}) = 'object' then json_object(${fields}) else ${records.data} end else ${records.data} end`.mapWith(records.data)
}

/**
 * ONE LIGHT LIST OF EVERY TERRITORY RUN IN THE PROJECT, WITH WHICH RUNS MAY BE RUNNING DECIDED IN SQL.
 *
 * A run may still be running when its state has not ended, or when the ledger holds an open process row for it. A run
 * with ledger rows is running only when one of them is alive or unknown, and those are open rows; a run with no open
 * rows is running only while its standing is `working`, which `sessionHasNotEnded` says. The flagged rows alone are
 * read whole, and `howTheRunStands` has the last word on which of them is running.
 *
 * Exported so that a test can compare each light row's agent with what `theAgentOfATerritoryRun` answers for that run
 * alone.
 */
export function theRunsWithATerritory(workspaceId: string): ATerritoryReading {
  const agents = theRegistryReadOnce()
  const identityOf = everyAgentsIdentityWithReferencesReadOnce(sqlite)
  const rows = db.select({
    id: records.id,
    workspaceId: records.workspaceId,
    data: theTerritorySessionData(),
    mayBeRunning: sql<number>`(${STORED_FIELDS.sessionHasNotEnded(records.data)} OR EXISTS (
      SELECT 1 FROM session_resources
      WHERE session_resources.workspace_id = records.workspace_id
        AND session_resources.session_record_id = records.id
        AND session_resources.type = 'process' AND session_resources.released_at IS NULL
    ))`,
  }).from(records).where(and(
    eq(records.workspaceId, workspaceId), eq(records.kind, 'session'), isNull(records.deletedAt),
    sql`json_extract(${records.data}, '$.territory') IS NOT NULL`,
  )).orderBy(sql`${records.createdAt} DESC`, sql`${records.id} DESC`).all()
  const lookups = theReadsOfEveryTerritoryRun(workspaceId, rows.map((row) => row.id), identityOf)
  const runs: ALightTerritoryRun[] = rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    data: row.data,
    mayBeRunning: row.mayBeRunning === 1,
    // THE SERVED AGENT FROM THE IDENTITIES READ ONCE, which reads no agent row. A row that names no serving agent is
    // asked of `theAgentIdOfATerritoryRun` with its reads made once for the list. Asked one run at a time, such a row
    // cost about nine statements, so a write cost more for every run that had ever ended. The answer is the same
    // because that reading asks this one first.
    agentId: theAgentARunServes(row.data, identityOf)?.id
      ?? theAgentIdOfATerritoryRun({ id: row.id, workspaceId: row.workspaceId, data: row.data }, undefined, lookups)
      ?? null,
  }))
  const running: PanelRecord[] = []
  for (const row of runs) {
    if (!row.mayBeRunning) continue
    const record = getRecord(row.id)
    if (record !== null && howTheRunStands(row.id, row.workspaceId, agents, record).running) running.push(record)
  }
  return { runs, running }
}

/**
 * THE READS OF `theAgentOfATerritoryRun` FOR EVERY RUN IN ONE LIGHT LIST. Each answers what its one-row reader answers.
 *
 * The reads that differ from one run to the next are made in one statement each. One finds the sessions with a hold not
 * yet released, and each of those is still asked through `theLiveHoldOnSession`, so a lapsed hold is released as before.
 * The other reads the create row of every listed run. A run in the message centre is still asked through `whoFiled`,
 * because its older rows may be filed under another project. Every agent name is answered from the identities read
 * once, because on a busy office almost every ended run names an agent of its own, and a read for each name was a read
 * for each run.
 */
function theReadsOfEveryTerritoryRun(workspaceId: string, ids: readonly string[], identityOf: TheIdentityOf): TheTerritoryRunLookups {
  const listed = new Set(ids)
  let held: Set<string> | undefined
  let filed: Map<string, { actorType: string; actorId: string }> | undefined
  return {
    identityOf,
    liveHoldOn: (session) => {
      held ??= new Set(db.select({ session: handleHolds.sessionRecordId }).from(handleHolds).where(isNull(handleHolds.releasedAt)).all().map((row) => row.session))
      return held.has(session) ? theLiveHoldOnSession(session) : null
    },
    filerOf: (inWorkspace, recordId) => {
      if (inWorkspace !== workspaceId || workspaceId === MESSAGE_CENTRE || !listed.has(recordId)) return whoFiled(inWorkspace, recordId)
      filed ??= theFirstCreateRowOfEach(workspaceId, ids)
      return filed.get(recordId) ?? null
    },
  }
}

/** The oldest create row of each record listed, in one statement, ordered and found as `whoFiled` finds one record's. */
function theFirstCreateRowOfEach(workspaceId: string, ids: readonly string[]): Map<string, { actorType: string; actorId: string }> {
  const rows = db
    .select({ recordId: changes.recordId, actorType: changes.actorType, actorId: changes.actorId })
    .from(changes)
    .where(and(
      sql`+${changes.workspaceId} = ${workspaceId}`,
      sql`${changes.recordId} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`,
      eq(changes.op, 'create'),
    ))
    .orderBy(asc(changes.at), asc(changes.appendOrder))
    .all()
  const first = new Map<string, { actorType: string; actorId: string }>()
  for (const row of rows) if (!first.has(row.recordId)) first.set(row.recordId, { actorType: row.actorType, actorId: row.actorId })
  return first
}

/** The reading made before a write, kept by the changed paths that write hands on. */
const theReadingBehindTheChangedPaths = new WeakMap<TheChangedPaths, ATerritoryReading>()

/**
 * READ, BEFORE A WRITE, THE CHANGED PATHS IT WILL COMPARE: those of the run as the write would leave it, and of every
 * running run holding a territory. The record door awaits this before it opens its transaction, and hands the answer to
 * `refuseATerritoryOverlapAtBlock` and `openTheGroupsForATerritory`. Each worktree is read once, all of them at once.
 * The reading of the runs is made here once, before the Git reads, and kept by the map this answers.
 */
export async function theChangedPathsBeforeATerritoryWrite(run: { workspaceId: string; data: Record<string, unknown> }): Promise<TheChangedPaths> {
  const reading = theRunsWithATerritory(run.workspaceId)
  const where = new Map<string, { folder: string; cut: string }>()
  const add = (data: Record<string, unknown>) => {
    const at = whereItsChangesAre(data)
    if (!('notRead' in at)) where.set(at.key, at)
  }
  add(run.data)
  for (const other of reading.running) add(other.data)
  const read = await Promise.all([...where].map(async ([key, at]) => [key, await readTheChangedPaths(at.folder, at.cut)] as const))
  const changed = new Map(read)
  theReadingBehindTheChangedPaths.set(changed, reading)
  return changed
}

/**
 * READ, BEFORE A PATCH, WHAT IT WILL COMPARE, or null when it compares nothing: a write that changes a session's
 * territory, or the first write that says a running run holding a territory is finished (`atItsSeal`). That first
 * finished send is where a run is compared again, before anything of it is written, so a group opens before the run is
 * sealed, even when the send is answered with the reminder before the seal. A send after the reminder before the seal
 * kept its reading is a second send of the same seal, and was compared at the first.
 */
export async function theChangedPathsBeforeAPatch(
  before: PanelRecord,
  patch: Pick<RecordPatch, 'kind' | 'data' | 'dataPatch'>,
): Promise<{ changed: TheChangedPaths; atItsSeal: boolean } | null> {
  if (before.kind !== 'session' || (patch.kind !== undefined && patch.kind !== 'session')) return null
  const merged: Record<string, unknown> = patch.data ?? { ...before.data }
  for (const [key, value] of Object.entries(patch.dataPatch ?? {})) {
    if (value === null) delete merged[key]
    else merged[key] = value
  }
  const changesItsTerritory = Object.hasOwn(patch.dataPatch ?? patch.data ?? {}, 'territory')
  const atItsSeal = theFirstFinishedSendOf(before, patch)
  if (!changesItsTerritory && !atItsSeal) return null
  const read = await theChangedPathsBeforeATerritoryWrite({ workspaceId: before.workspaceId, data: merged })
  // AT THE SEAL THE RUN IS COMPARED AS IT STANDS, still running, so its stored worktree and cut are read too.
  const asItStands = whereItsChangesAre(before.data)
  if (!atItsSeal || 'notRead' in asItStands || read.has(asItStands.key)) return { changed: read, atItsSeal }
  const changed = new Map([...read, [asItStands.key, await readTheChangedPaths(asItStands.folder, asItStands.cut)]])
  const reading = theReadingBehindTheChangedPaths.get(read)
  if (reading !== undefined) theReadingBehindTheChangedPaths.set(changed, reading)
  return { changed, atItsSeal }
}

/** Whether this write is the first that says a running run holding a territory is finished. */
function theFirstFinishedSendOf(before: PanelRecord, patch: Pick<RecordPatch, 'data' | 'dataPatch'>): boolean {
  if (!Array.isArray(before.data['territory']) || theRunHasEnded(before.data['state'])) return false
  const { explicitlyFinishes, aVerdictClosedIt } = whetherThisWriteFinishesTheRun(before, patch)
  if (!explicitlyFinishes || aVerdictClosedIt !== undefined) return false
  const held = readRemindedBeforeTheSeal(before.data[REMINDED_BEFORE_THE_SEAL])
  const afterSeal = typeof before.data['sealedTip'] === 'string' ? before.data['sealedTip'] : null
  return !(held?.reminded === true && held.afterSeal === afterSeal)
}

/** One run's changed paths, from the reads made before the write, or why they are not known. */
function theChangesOf(run: PanelRecord, changed: TheChangedPaths): AChangedPathsRead {
  const at = whereItsChangesAre(run.data)
  if ('notRead' in at) return at
  return changed.get(at.key) ?? { notRead: sayInEnglish('territory.notReadBeforeTheWrite') }
}

/** One territory overlap: the other run, its agent, every path where the two meet, and what could not be checked. */
type ATerritoryOverlap = { run: PanelRecord; agent: RegisteredAgent; paths: string[]; notChecked?: string }

/** One reading of a territory comparison, shared by the refusal, the reminder and the seal. */
function theOverlapsForATerritory(
  run: PanelRecord,
  changed: TheChangedPaths,
  beforeWrite?: { filedBy?: { actorType: string; actorId: string } },
): { me: RegisteredAgent | null; overlaps: ATerritoryOverlap[] } {
  const overlaps: ATerritoryOverlap[] = []
  const agents = theRegistryReadOnce()
  if (!howTheRunStands(run.id, run.workspaceId, agents, beforeWrite === undefined ? undefined : run).running) return { me: null, overlaps }
  const me = theAgentOfATerritoryRun(run, beforeWrite?.filedBy)
  if (me === null) return { me, overlaps }
  const reading = theReadingBehindTheChangedPaths.get(changed) ?? theRunsWithATerritory(run.workspaceId)
  const runningIds = new Set(reading.running.map((one) => one.id))
  const stored = reading.runs.filter((one) => one.id !== run.id)
  const shared = theSharedFolders([{ run, agent: me }, ...theTerritoriesThatSayWhatIsShared(stored, runningIds)])
  const mine = { read: theTerritoryRead(run), changes: theChangesOf(run, changed) }
  for (const otherRun of reading.running) {
    if (otherRun.id === run.id) continue
    const other = theAgentOfATerritoryRun(otherRun)
    if (other === null || other.id === me.id) continue
    if (theTwoAgentsAreInOneChain(me.id, other.id)) continue
    const meeting = whereTwoRunsMeet(mine, { read: theTerritoryRead(otherRun), changes: theChangesOf(otherRun, changed) }, shared)
    if (meeting.paths.length === 0 && meeting.notChecked === undefined) continue
    overlaps.push({ run: otherRun, agent: other, paths: meeting.paths, ...(meeting.notChecked === undefined ? {} : { notChecked: meeting.notChecked }) })
  }
  return { me, overlaps }
}

/** Each territory refusal, with the position it was made at and how many overlaps it named. */
const whatARefusalNamed = new WeakMap<PanelError, { position: string; overlaps: number }>()

/**
 * THE RECORD DOOR'S CHECK AT BLOCK, made with the changed paths read before the write. Asked on the writer's normalized
 * candidate, before its first storage. Only two runs that meet at a path refuse the write: a pair that could not be
 * compared refuses nothing, because that would refuse on a guess.
 */
export function refuseATerritoryOverlapAtBlock(changed: TheChangedPaths): TerritoryWriteCheck {
  return (run, filedBy) => {
    const position = String(gatePosition('file-territories'))
    if (position !== 'block') return
    const overlaps = theOverlapsForATerritory(run, changed, { filedBy }).overlaps.filter((one) => one.paths.length > 0)
    if (overlaps.length === 0) return
    const conflicts = overlaps.map(one => sayInEnglish('territory.blockOverlap', {
      run: one.run.id, agent: one.agent.id, path: thePathsInWords(one.paths),
    })).join('; ')
    const refusal = new PanelError(sayInEnglish('territory.block', { overlaps: conflicts }), 409)
    whatARefusalNamed.set(refusal, { position, overlaps: overlaps.length })
    throw refusal
  }
}

/**
 * A TERRITORY REFUSAL IS COUNTED AFTER THE WRITE THAT ASKED IT IS TAKEN BACK. The create door asks the refusal inside
 * its transaction, so a count written there would be rolled back with the refused record. Each overlap the refusal
 * named counts once, as openTheGroupsForATerritory counts each overlap it finds. A check stores nothing, so it
 * counts nothing.
 */
export function countingATerritoryRefusal<T>(only: 'write' | 'check', write: () => T): T {
  try {
    return write()
  } catch (error) {
    const named = only === 'write' && error instanceof PanelError ? whatARefusalNamed.get(error) : undefined
    for (let i = 0; i < (named?.overlaps ?? 0); i++) gateMet('file-territories', named!.position)
    throw error
  }
}

/**
 * Compare a run with every other running line's run, with the changed paths read before the write; each pair that
 * meets uses the shared overlap group core. Asked after a territory write, and before the first finished send of a run
 * holding one, while the run is still running.
 */
export function openTheGroupsForATerritory(run: PanelRecord, by: Actor, changed: TheChangedPaths): TerritoryOverlaps {
  const position = String(gatePosition('file-territories'))
  const overlaps: Extract<TerritoryOverlaps, { compared: true }>['overlaps'] = []
  const notChecked: NonNullable<Extract<TerritoryOverlaps, { compared: true }>['notChecked']> = []
  const { me, overlaps: found } = theOverlapsForATerritory(run, changed)
  if (me === null) return { compared: true, overlaps }
  const secretary = theOnlySecretary()
  for (const { run: otherRun, agent: other, paths, notChecked: says } of found) {
    if (paths.length === 0) {
      notChecked.push({ run: otherRun.id, agent: other.id, says: says! })
      continue
    }
    const overlap: (typeof overlaps)[number] = { run: otherRun.id, agent: other.id, paths, ...(says === undefined ? {} : { notChecked: says }) }
    gateMet('file-territories', position)
    if (position === 'off') {
      overlap.notOpened = sayInEnglish('territory.offNotOpened')
      overlaps.push(overlap)
      continue
    }
    try {
      overlap.group = sayTheTerritoryOverlap(run, me, otherRun, other, paths, secretary, by)
    } catch (error) {
      overlap.notOpened = error instanceof Error ? error.message : String(error)
    }
    overlaps.push(overlap)
  }
  return { compared: true, overlaps, ...(notChecked.length === 0 ? {} : { notChecked }) }
}

/** Every distinct agent holding a live claim in this project, retired rows left out. */
function theAgentsAtWork(workspaceId: string): RegisteredAgent[] {
  const seen = new Set<string>()
  const out: RegisteredAgent[] = []
  for (const claim of liveClaimsIn(workspaceId)) {
    if (claim.claimant.kind !== 'agent') continue
    if (seen.has(claim.claimant.id)) continue
    seen.add(claim.claimant.id)
    // A STORED claimant id off the claim row, read the stored way rather than by handle.
    const row = theAgentAStoredReferenceNames(claim.claimant.id)
    if (row !== null && row.retired !== true) out.push(row)
  }
  return out
}

/** The broader of two paths that overlap, which is the one the group is named for. */
function theOverlappingPath(mine: readonly string[], theirs: readonly string[]): string | null {
  for (const a of mine) {
    for (const b of theirs) {
      if (!thingsOverlap({ what: 'path', id: a }, { what: 'path', id: b })) continue
      return pathCovers({ asWritten: a, path: a }, { asWritten: b, path: b }) === 'yes' ? a : b
    }
  }
  return null
}

/** One run's stored territory, or an empty list when it holds none or holds something that is not a list. */
function theTerritoryOf(run: { data: Record<string, unknown> }): string[] {
  return Array.isArray(run.data['territory']) ? run.data['territory'] as string[] : []
}

/**
 * ONE GROUP FOR TWO LINES OF WORK, AND ONE LINE IN IT EACH TIME THEIR RUNS MEET (wave 13u round 183). Answers the group.
 *
 * A territory group was keyed by the two runs. A line's next round is a new run, so two lines that met every round got
 * a new group every round. Now the group is keyed by the two agents, as a work-area group is, though by registry id
 * and not by handle. The first meeting opens it. A later meeting of two runs of the same two agents writes one line in
 * it, naming the two runs and the paths, and opens nothing. The line is delivered to the group's members, as the first
 * one was. A group whose overlap ended is used the same way. The group keeps the name and the members it was opened
 * with. Each line names every path where the two runs meet, up to MEETING_PATHS_NAMED, and how many more there are.
 */
function sayTheTerritoryOverlap(
  run: PanelRecord,
  me: RegisteredAgent,
  otherRun: PanelRecord,
  other: RegisteredAgent,
  paths: readonly string[],
  secretary: ParticipantRef | null,
  by: Actor,
): string {
  const path = thePathsInWords(paths)
  const line = SYSTEM_LINES.territoriesInConflict(path, aLineAndItsRun(me, run), aLineAndItsRun(other, otherRun))
  const discusses = [run.id, otherRun.id]
  const key = theTerritoryGroupKey(me.id, other.id)
  const group = groupOpenedFor(key)
  if (group === null) {
    const members = theMembersOfAWorkAreaGroup(me, other, path, secretary, true)
    return openTheGroupOnce(key, conflictGroupName(me.handle, other.handle, paths[0]!), sayInEnglish('territory.groupBecause', { path }), members, line, run.workspaceId, by, discusses)
  }
  if (!theOverlapWasTold(group.id, run, me, otherRun, other, paths)) sayAnOverlapLine(group.id, run.workspaceId, line, discusses, by)
  return group.id
}

/** The paths where two runs meet, in words: the first MEETING_PATHS_NAMED, and how many more there are. */
function thePathsInWords(paths: readonly string[]): string {
  const named = paths.slice(0, MEETING_PATHS_NAMED).join(', ')
  const more = paths.length - MEETING_PATHS_NAMED
  return more > 0 ? sayInEnglish('territory.morePaths', { paths: named, more: String(more) }) : named
}

/** One side of an overlap line: the agent's handle and its run. */
function aLineAndItsRun(agent: RegisteredAgent, run: PanelRecord): string {
  return sayInEnglish('territory.aLineAndItsRun', { agent: agent.handle, run: run.id })
}

/**
 * The one spelling of the key a territory group is opened under: the two agents' registry ids, in either order. Not
 * their handles, as `workAreaOverlapKey` takes: a handle can be renamed, and a retired agent's handle can be taken by
 * a new agent, which would then be found in the old agent's group.
 */
function theTerritoryGroupKey(oneAgent: string, otherAgent: string): string {
  return ['territory', ...[oneAgent, otherAgent].sort()].join('|')
}

/**
 * THE RUNS ONE LINE OF WORK HOLDS: the run itself, then every earlier run of the same agent that it resumes.
 *
 * The round launcher files a run that continues another with a `derived_from` link to it, in the same write that files
 * the run, and writes its territory only afterwards. So the link is there whenever the territory is compared. It files
 * that link for a line's next round as well as for a round resumed after its run stopped. Only an earlier run that
 * holds no seal was resumed. A sealed run finished its round, so the run after it is new work and is told again. The
 * walk does not go past a sealed run. A link to a run of another agent is no continuation, and the walk does not go
 * past it either. Nothing refuses a link back, so a run already taken is not taken again, and a loop of links ends.
 */
function theRunsALineHolds(run: PanelRecord, agent: RegisteredAgent): PanelRecord[] {
  const line = [run]
  const seen = new Set([run.id])
  for (let at = 0; at < line.length; at++) {
    const continued = db.select({ id: links.toId }).from(links)
      // derived_from in its general sense: a run continues the run before it, as the round launcher files it.
      .where(and(eq(links.fromId, line[at]!.id), eq(links.type, 'derived_from'))).all()
    for (const { id } of continued) {
      if (seen.has(id)) continue
      seen.add(id)
      const earlier = getRecord(id)
      if (earlier === null || earlier.kind !== 'session' || theAgentOfATerritoryRun(earlier)?.id !== agent.id) continue
      const sealed = earlier.data['sealedTip']
      if (typeof sealed === 'string' && sealed !== '') continue
      line.push(earlier)
    }
  }
  return line
}

/**
 * A RUN'S TERRITORY AS IT IS READ FOR THE COMPARISON (wave 13u round 174, read again in round 194).
 *
 * An entry is a file, a pattern or a folder. It is a folder when the run's own worktree, its `workingDirectory`, holds a
 * folder at that path, or when it is written `folder/**`. An entry the worktree does not hold is a file, which may not
 * be made yet. When the worktree cannot be read, no entry written without a pattern is known to be a folder or a file,
 * and `worktree` is false.
 */
type ATerritoryRead = { run: { id: string; data: Record<string, unknown> }; entries: string[]; folders: Set<string>; worktree: boolean }

function theTerritoryRead(run: { id: string; data: Record<string, unknown> }): ATerritoryRead {
  const entries = theTerritoryOf(run)
  const named = run.data['workingDirectory']
  const worktree = typeof named === 'string' && isAbsolute(named) && isAFolder(named) ? named : null
  const folders = new Set(worktree === null ? [] : entries.filter((entry) => !isAPattern(entry) && isAFolder(join(worktree, entry))))
  return { run, entries, folders, worktree: worktree !== null }
}

/** Whether a folder is at this path. Nothing there, or a file where a folder on the path would be, is no folder. */
function isAFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return false
    throw error
  }
}

/** Whether an entry is a pattern, as pathCovers reads one. */
function isAPattern(entry: string): boolean {
  return /[*?]/.test(entry)
}

/** The folder an entry written as `folder/**` names, or null for any other entry. */
function theFolderItChanges(entry: string): string | null {
  const folder = entry.endsWith('/**') ? entry.slice(0, -3) : null
  return folder === null || folder === '' || isAPattern(folder) ? null : folder
}

/** The part of an entry before its first segment holding a pattern: the whole entry when it holds none. */
function theFixedStartOf(entry: string): string {
  const segments = entry.split('/')
  const first = segments.findIndex(isAPattern)
  return (first === -1 ? segments : segments.slice(0, first)).join('/')
}

/** Whether a path is a folder or lies in it by whole segments. */
function isAtOrUnder(path: string, folder: string): boolean {
  return folder === '' || path === folder || path.startsWith(`${folder}/`)
}

/**
 * THE TERRITORIES THAT SAY WHICH FOLDERS ARE SHARED: every running run, and each agent's latest run holding a
 * territory, from runs listed newest first. A run whose agent the office cannot name is left out, as the comparison
 * leaves it out. `running` holds the ids of the runs the reading called running.
 */
function theTerritoriesThatSayWhatIsShared(
  newestFirst: readonly ALightTerritoryRun[],
  running: ReadonlySet<string>,
): { run: ALightTerritoryRun; agent: { id: string } }[] {
  const latest = new Set<string>()
  const out: { run: ALightTerritoryRun; agent: { id: string } }[] = []
  for (const run of newestFirst) {
    if (run.agentId === null) continue
    const itsLatest = !latest.has(run.agentId)
    latest.add(run.agentId)
    if (itsLatest || running.has(run.id)) out.push({ run, agent: { id: run.agentId } })
  }
  return out
}

/**
 * WHICH DECLARED FOLDERS ARE SHARED, worked out from the territories given. A folder is shared when two or more
 * different agents declare it or something inside it. `unknown` holds the entries that two or more agents declare
 * that may be a shared folder or a file: the worktree that would say which could not be read, and nothing is declared
 * strictly inside them.
 */
type TheSharedFolders = { shared: Set<string>; unknown: Set<string> }

function theSharedFolders(territories: readonly { run: { id: string; data: Record<string, unknown> }; agent: { id: string } }[]): TheSharedFolders {
  const declared = territories.map(({ run, agent }) => ({ agent: agent.id, read: theTerritoryRead(run) }))
  const starts = declared.flatMap(({ agent, read }) => read.entries.map((entry) => ({ agent, start: theFixedStartOf(entry) })))
  const shared = new Set<string>(), unknown = new Set<string>()
  for (const { read } of declared) {
    for (const entry of read.entries) {
      const written = theFolderItChanges(entry)
      const folder = written ?? (isAPattern(entry) ? null : entry)
      if (folder === null || shared.has(folder)) continue
      const inside = starts.filter((one) => isAtOrUnder(one.start, folder))
      if (new Set(inside.map((one) => one.agent)).size < 2) continue
      const known = written !== null || read.folders.has(folder) || inside.some((one) => one.start !== folder)
      if (known) shared.add(folder)
      else if (!read.worktree) unknown.add(folder)
    }
  }
  for (const folder of shared) unknown.delete(folder)
  return { shared, unknown }
}

/** What one side of a comparison holds: its territory as read, and its changed paths or why they are not known. */
type ARunCompared = { read: ATerritoryRead; changes: AChangedPathsRead }

/**
 * WHERE TWO RUNS MEET: every path both changed, and every path one changed that lies under a narrow entry of the other's
 * territory, sorted. `notChecked` says, in words, what could not be compared: a run whose changes are not known, or an
 * entry that may be a shared folder. A path is a meeting only when it is certain.
 */
function whereTwoRunsMeet(mine: ARunCompared, theirs: ARunCompared, folders: TheSharedFolders): { paths: string[]; notChecked?: string } {
  const paths = new Set<string>()
  const unsure: string[] = []
  const changed = (side: ARunCompared) => ('paths' in side.changes ? side.changes.paths : null)
  const a = changed(mine), b = changed(theirs)
  if (a !== null && b !== null) {
    const other = new Set(b)
    for (const path of a) if (other.has(path)) paths.add(path)
  }
  for (const [changes, owner] of [[a, theirs], [b, mine]] as const) {
    if (changes === null) continue
    for (const entry of owner.read.entries) {
      const folder = theFolderItChanges(entry) ?? entry
      if (folders.shared.has(folder)) continue
      const under = changes.filter((path) => pathCovers({ asWritten: entry, path: entry }, { asWritten: path, path }) === 'yes')
      if (under.length === 0) continue
      if (folders.unknown.has(folder)) unsure.push(sayInEnglish('territory.mayBeShared', { entry, run: owner.read.run.id }))
      else for (const path of under) paths.add(path)
    }
  }
  for (const side of [mine, theirs]) {
    if ('notRead' in side.changes) unsure.push(sayInEnglish('territory.notRead', { run: side.read.run.id, because: side.changes.notRead }))
  }
  return { paths: [...paths].sort(), ...(unsure.length === 0 ? {} : { notChecked: unsure.join(' ') }) }
}

/**
 * WHETHER THIS GROUP ALREADY TOLD THESE TWO RUNS OF THIS OVERLAP, since its overlap last ended.
 *
 * Each overlap line is linked to the two runs it names. A line for these two runs told them. A round resumed after a
 * login's limit is a new run, and it was told too when a line names a run its line resumes and the other run, and
 * every path where the two runs meet now lies under both of those earlier runs' stored territories. The territories
 * are read from the records, never out of a line.
 */
function theOverlapWasTold(
  groupId: string,
  run: PanelRecord,
  me: RegisteredAgent,
  otherRun: PanelRecord,
  other: RegisteredAgent,
  paths: readonly string[],
): boolean {
  const told = theRunPairsAGroupTold(groupId)
  const named = (a: string, b: string) => told.some((pair) => pair.has(a) && pair.has(b))
  if (named(run.id, otherRun.id)) return true
  const covers = (earlier: PanelRecord, path: string) =>
    theTerritoryOf(earlier).some((entry) => pathCovers({ asWritten: entry, path: entry }, { asWritten: path, path }) === 'yes')
  for (const a of theRunsALineHolds(run, me)) {
    for (const b of theRunsALineHolds(otherRun, other)) {
      if (!named(a.id, b.id)) continue
      if (paths.every((path) => covers(a, path) && covers(b, path))) return true
    }
  }
  return false
}

/** The runs each line of a group names, from its `discusses` links, for the lines after its last "Overlap ended" line. */
function theRunPairsAGroupTold(groupId: string): Set<string>[] {
  const lines = messagesInAGroup(groupId, EVERY_PROJECT)
  let since = lines.length
  while (since > 0 && !saysTheOverlapEnded(lines[since - 1]!.body)) since--
  return lines.slice(since).map((line) => new Set(db.select({ id: links.toId }).from(links)
    .where(and(eq(links.fromId, line.id), eq(links.type, 'discusses'))).all().map((one) => one.id)))
}

/**
 * WHETHER A GROUP HOLDS THE LINE SAYING ITS OVERLAP HAS ENDED.
 *
 * A group opened for an overlap has no closed column. This line is what says it is over, and every reader asks here.
 */
function theGroupSaysTheOverlapEnded(groupId: string): boolean {
  return messagesInAGroup(groupId, EVERY_PROJECT).some((one) => saysTheOverlapEnded(one.body))
}

/** Whether one line says its overlap has ended. The one reading of `THE_OVERLAP_ENDED_PREFIX`. */
function saysTheOverlapEnded(body: string): boolean {
  return body.startsWith(THE_OVERLAP_ENDED_PREFIX)
}

/** The one active secretary, or null because there is none. A card that reports to the secretary resolves here. */
function theActiveSecretary(): ParticipantRef | null {
  if (!theRoleCardsAreRead()) return null
  const card = theRoleCards().elevation.onlyThisCardCanHoldIt
  const row = listParticipants().agents.find((one) => one.role === card && one.retired !== true)
  return row === undefined ? null : { kind: 'agent', id: row.id }
}

/**
 * THE ONE AGENT ABOVE ONE AGENT, read from the card it holds now. Criterion P100 (A).
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT `startedBy` ANY MORE
 * ---------------------------------------------------------------------------------------
 *
 * It used to be the agent that started this one, for ever. The decision of 15 September 2026
 * makes it the card the agent holds now. `whoTheCardReportsTo` reads the card's own
 * `reportsTo` sentence, and this turns that reading into a concrete agent.
 *
 *   its starter     the agent that started it, where that agent is still registered and not retired
 *   the secretary   the secretary in its own starter chain; where the chain holds none, the one
 *                   active secretary where the office has exactly one, and null where it has several
 *   the person      null, because a person is never added to a work-area group as an "above" member
 *   nobody named    null, because the office can name no agent above the holder
 *
 * A SECRETARY HAS NOBODY ABOVE IT BUT THE PERSON, which is why the secretary's own card resolves to
 * null. Nothing here falls back to the starter chain: an agent once started by another is not above
 * it after a card change, which is the whole defect this criterion removes.
 */
function theOneAbove(agent: RegisteredAgent, secretary: ParticipantRef | null): ParticipantRef | null {
  if (!theRoleCardsAreRead()) return null
  const card = cardFor(theRoleCards(), agent.role)
  switch (whoTheCardReportsTo(card)) {
    case 'its starter':
      return theRegisteredStarterOf(agent)
    case 'the secretary':
      return theSecretaryInTheChainOf(agent) ?? secretary
    default:
      return null
  }
}

/**
 * THE SECRETARY IN AN AGENT'S OWN STARTER CHAIN, nearest first, or null because the chain holds
 * none. A supervisor's card says it reports to "the secretary", and the secretary it means is the
 * one that started it, or started its starter — not whichever row holds the card first. Three
 * agents held the card on 15 September 2026, and the first row was the same agent every time, above
 * supervisors it never started. A retired secretary in the chain is passed over and the walk goes
 * on above it.
 */
function theSecretaryInTheChainOf(agent: RegisteredAgent): ParticipantRef | null {
  const card = theRoleCards().elevation.onlyThisCardCanHoldIt
  for (const above of theStartersAbove(agent.id)) {
    // Each one is a registry id, or a stored `startedBy` string no single agent answers.
    const row = theAgentAStoredReferenceNames(above)
    if (row !== null && row.role === card && row.retired !== true) return { kind: 'agent', id: row.id }
  }
  return null
}

/** Whether a participant is a registered agent, not retired, that holds the secretary card. */
function holdsTheSecretaryCard(who: ParticipantRef): boolean {
  if (who.kind !== 'agent' || !theRoleCardsAreRead()) return false
  const row = theAgentAStoredReferenceNames(who.id)
  return row !== null && row.role === theRoleCards().elevation.onlyThisCardCanHoldIt && row.retired !== true
}

/**
 * THE ONE ACTIVE SECRETARY WHERE THE OFFICE HAS EXACTLY ONE, or null. Where several agents hold the
 * card, "the secretary" names nobody in particular, and the first row is a guess the office does
 * not make: absence beats a guess, so nobody is added above a holder whose chain has no secretary.
 */
function theOnlySecretary(): ParticipantRef | null {
  if (!theRoleCardsAreRead()) return null
  const card = theRoleCards().elevation.onlyThisCardCanHoldIt
  const active = listParticipants().agents.filter((one) => one.role === card && one.retired !== true)
  const only = active.length === 1 ? active[0] : undefined
  return only === undefined ? null : { kind: 'agent', id: only.id }
}

/**
 * THE SECRETARY AN AGENT ANSWERS TO, read the way a work-area group reads it: the secretary in its own
 * starter chain, or the one active secretary where the chain holds none and the office has exactly
 * one. An agent that holds the secretary card answers to itself. Null when the office can name nobody.
 * Lib/bookings.ts asks it for the secretaries concerned in a request to go first.
 */
export function theSecretaryAgentAnswersTo(stored: string): ParticipantRef | null {
  if (!theRoleCardsAreRead()) return null
  const agent = theAgentAStoredReferenceNames(stored)
  if (agent === null) return null
  if (agent.role === theRoleCards().elevation.onlyThisCardCanHoldIt && agent.retired !== true) {
    return { kind: 'agent', id: agent.id }
  }
  return theSecretaryInTheChainOf(agent) ?? theOnlySecretary()
}

/** The agent that started this one, where it is still registered and not retired. */
export function theRegisteredStarterOf(agent: RegisteredAgent): ParticipantRef | null {
  const starter = agent.startedBy
  if (starter === null || starter.kind !== 'agent') return null
  const row = theAgentAStoredReferenceNames(starter.id)
  if (row === null || row.retired === true) return null
  return { kind: 'agent', id: row.id }
}

/**
 * WHETHER THE HOLDER OF A KEY IS THE REGISTERED STARTER OF THIS AGENT. P83 point 5.
 *
 * Both sides are stored references, so both are read the stored way. The starter is the agent's
 * `startedBy`, read by `theRegisteredStarterOf` above, so a retired starter starts nothing. The key
 * holder is the `whose_id` of the `held_keys` row the request's key matched. Neither is ever read by
 * the arriving resolver, so a name a request sends cannot make it the starter.
 *
 * The run-key door in api/records.ts asks it. A run key is an agent key of its agent, so a supervisor
 * holding its own run key is the starter of the workers it registered.
 */
export function theKeyHolderIsTheRegisteredStarterOf(agent: RegisteredAgent, keyHolder: string): boolean {
  const starter = theRegisteredStarterOf(agent)
  const holder = theAgentAStoredReferenceNames(keyHolder)
  return starter !== null && holder !== null && holder.id === starter.id
}

/**
 * EVERY AGENT ABOVE THIS ONE IN ITS STARTER CHAIN, nearest first. Criterion P100 (B).
 *
 * The chain is the `startedBy` links and nothing else, and a RETIRED AGENT IN THE CHAIN DOES NOT
 * BREAK IT: the links are read whether the row is retired or not, because the chain is who started
 * whom and retirement is a later fact about the row rather than a cut in the chain. A person at the
 * top ends it, and so does a link nobody recorded or a cycle, which is read once and stopped.
 *
 * EXPORTED FOR ONE MORE READER: the office's check for key files left in a sandbox (lib/key-files.ts) tells the two
 * agents nearest above a key's holder, which is the same chain read the same way.
 */
export function theStartersAbove(stored: string): string[] {
  const above: string[] = []
  const start = theAgentAStoredReferenceNames(stored)
  const seen = new Set<string>([start?.id ?? stored])
  let at = start?.startedBy ?? null
  while (at !== null && at.kind === 'agent') {
    // EACH LINK IS A STORED `startedBy` STRING, read the stored way and kept as the registry id it
    // names. A link no single agent answers is kept as it is stored, and the chain stops there.
    const row = theAgentAStoredReferenceNames(at.id)
    const id = row?.id ?? at.id
    if (seen.has(id)) break
    seen.add(id)
    above.push(id)
    at = row?.startedBy ?? null
  }
  return above
}

/**
 * WHETHER TWO AGENTS ARE IN ONE STARTER CHAIN. Criterion P100 (B).
 *
 * One is the other's starter, or its starter's starter, and so on — so this asks whether either is
 * an ancestor of the other. Two agents that merely share a starter are NOT in one chain by this
 * reading, and their overlap is the real collision the group is for.
 */
export function theTwoAgentsAreInOneChain(first: string, second: string): boolean {
  // Both are stored strings, a handle or an id. Each is compared as the registry id it names.
  const firstId = theAgentAStoredReferenceNames(first)?.id ?? first
  const secondId = theAgentAStoredReferenceNames(second)?.id ?? second
  return theStartersAbove(first).includes(secondId) || theStartersAbove(second).includes(firstId)
}

/** Both agents, the one above each read from its card, and nobody twice. */
function theMembersOfAWorkAreaGroup(
  me: RegisteredAgent,
  other: RegisteredAgent,
  path: string,
  secretary: ParticipantRef | null,
  territory = false,
): { who: ParticipantRef; because: string }[] {
  const both: readonly (readonly [RegisteredAgent, string])[] = [
    [me, other.handle],
    [other, me.handle],
  ]
  const members: { who: ParticipantRef; because: string }[] = both.map(([who, against]) => ({
    who: { kind: 'agent', id: who.id },
    because: territory ? sayInEnglish('territory.memberBecause', { path, against }) : `Its registered work area covers ${path}, which ${against}'s area also covers.`,
  }))
  for (const [who, against] of both) {
    const above = theOneAbove(who, secretary)
    if (above === null) continue
    if (members.some((one) => participantKey(one.who) === participantKey(above))) continue
    // A SECRETARY THAT IS NOT ONE OF THE TWO LINES IS NOT ADDED TO A TERRITORY GROUP (wave 13u round 174). It was
    // copied on 186 group messages in one day. It reads every message, so it can still read the group's
    // (GET /api/messages?group=<id>).
    if (territory && holdsTheSecretaryCard(above)) continue
    members.push({
      who: above,
      because: territory ? sayInEnglish('territory.aboveBecause', { agent: who.handle, against }) : `It is above ${who.handle}, whose area is in this overlap with ${against}.`,
    })
  }
  return members
}

/** Say on both agents' records that their areas overlap and a group was opened for it. */
function markTheWorkAreaOverlap(
  me: RegisteredAgent,
  other: RegisteredAgent,
  group: string,
  path: string,
  workspaceId: string,
  by: Actor,
): void {
  for (const [who, against] of [
    [me, other.handle],
    [other, me.handle],
  ] as const) {
    const recordId = recordForAgentIn(who.id, workspaceId)
    if (recordId === null) continue
    const record = getRecord(recordId)
    if (record === null) continue
    const extra = record.data['extra'] as Record<string, unknown> | undefined
    patchRecord(
      recordId,
      {
        dataPatch: {
          extra: {
            ...extra,
            workAreaOverlap: { with: against, group, path, at: nowStamp() },
          },
        },
      },
      by,
    )
  }
}

/**
 * ONE CLAIM A NEW CLAIM MET WHOSE RUN IS NOT RUNNING, so no group was opened. Criterion F3.
 *
 * A group is opened for two agents at work. A run that said its work is finished is waiting for a
 * check and is not at work, so a new claim on the same thing leaves it alone and the caller is told
 * which claim and which run it met. The claim still holds what it named: the worktree is kept until
 * the check is done, and criterion C29 is why.
 */
export interface ClaimHeldForACheck {
  /** The earlier claim. */
  claim: string
  /** The run holding it, which said it finished and is waiting for a check. */
  run: string
  /** One plain sentence, for the answer to the claim that was filed. */
  says: string
}

/** What opening the groups for one new claim did, including the overlaps it deliberately left alone. */
export interface TheGroupsANewClaimOpened {
  /** Every group that was opened. */
  groups: string[]
  /** Every overlap that opened no group because the earlier claim's run is not running. */
  heldForACheck: ClaimHeldForACheck[]
}

/**
 * OPEN A GROUP FOR EVERY OVERLAP ONE CLAIM IS IN THAT HAS NONE YET.
 *
 * Called on the write path, so a claim that collides is a group before the request has answered and
 * nobody has to ask for one.
 *
 * KEPT AS THE PLAIN DOOR for callers that want only the groups, and it is the one this file's own
 * signature has always offered. It is the same work as the fuller door below, so there is no second
 * way a group is opened.
 */
export function openTheGroupsForANewClaim(claimId: string, workspaceId: string, by: Actor): string[] {
  return openTheGroupsForANewClaimAndSayWhy(claimId, workspaceId, by).groups
}

/**
 * THE SAME DOOR, ANSWERING WHAT IT LEFT ALONE. Criterion F3.
 *
 * A NEW CLAIM OPENS NO GROUP AGAINST A CLAIM WHOSE RUN IS NOT RUNNING. A run that said it finished
 * is waiting for a check and is not at work, so the group that would have been opened for two agents
 * at work is not opened for one agent and one waiting run. Instead the caller is told which claim
 * and which run the new claim met, and no group opens.
 */
export function openTheGroupsForANewClaimAndSayWhy(
  claimId: string,
  workspaceId: string,
  by: Actor,
): TheGroupsANewClaimOpened {
  const groups: string[] = []
  const heldForACheck: ClaimHeldForACheck[] = []
  for (const overlap of overlapsFor(claimId, workspaceId)) {
    if (overlap.groupId !== null) continue
    const other = overlap.claims.find((one) => one.id !== claimId)
    if (other !== undefined && !howTheRunStands(other.run, workspaceId).running) {
      heldForACheck.push({
        claim: other.id,
        run: other.run,
        says: CLAIM_WORDS.heldForACheck(other.id, other.run),
      })
      continue
    }
    groups.push(openTheGroupForAnOverlap(overlap, workspaceId, by))
  }
  return { groups, heldForACheck }
}

// ============================================================================ writing

/** What filing a claim needs. */
export interface FileAClaim {
  workspaceId: string
  claimant: ParticipantRef
  /** The session record of the run doing the work. */
  run: string
  things: readonly ClaimedThing[]
}

/** Refuse a run that is not a session record of this project. */
function theRunOrARefusal(runId: string, workspaceId: string): void {
  const run = getRecord(runId)
  if (run === null || run.deletedAt !== null || run.kind !== 'session' || run.workspaceId !== workspaceId) {
    throw new PanelError(noSuchRun(runId), 400)
  }
}

/** File a claim, and open a group for every overlap it makes. */
export function fileAClaim(
  input: FileAClaim,
  by: Actor,
): { claim: ClaimOnTheWire; groups: string[]; heldForACheck: ClaimHeldForACheck[] } {
  const because = whyTheThingsAreRefused(input.things)
  if (because !== null) throw new PanelError(because, 400)
  // THE CLAIMANT IS THE CALLER CLAIMING NOW. The claim door resolved the arriving actor through
  // `participantForActor` before it built `input.claimant`, so what is here is a REGISTRY ID and is
  // read by id, never by handle. The same row is used below for the work-area rule.
  const registered = readParticipant(input.claimant)
  if (registered === null) {
    throw new PanelError(
      `Nothing is registered as the ${participantWord(input.claimant.kind)} "${input.claimant.id}", so it cannot ` +
        'claim any work. GET /api/participants lists every person and every durable agent.',
      400,
    )
  }
  /**
   * AND A REGISTERED AGENT MAY NOT START WORK BEFORE ITS AREA IS REGISTERED — criterion P93: no work
   * starts before the area is registered, with one exception. A claim is what the office
   * records when an agent starts working: this file's own first line says so, and a live claim is
   * what "at work" means for P95's overlap. So this is the door the worker's first act goes through.
   *
   * THE CHECK IS ONLY THAT SOMETHING IS REGISTERED, never that it keeps the new grain. An area
   * stored before the rule keeps working, and re-judging it here would be the rule refusing the
   * office it governs — the mistake the ruling of 12 September 2026 names.
   *
   * IT IS NOT ASKED OF A PERSON. A person may claim work without a work area, because a work area
   * is a rule about agents. And nothing here can refuse a wild agent the person started outside
   * Mole Office: such a caller is refused one line above by a rule that predates this one, for the
   * honest reason that no registry holds it at all.
   *
   * A CARD WHOSE WORK-AREA GRAIN IS `nothing` NEEDS NO AREA TO CLAIM. A secretary is limited by
   * nothing, so a claim of its own is accepted with no area registered. WHETHER A ROLE NEEDS ONE IS
   * READ FROM THE CARD, in `aRoleNeedsARegisteredWorkArea` — the one place — because this door and
   * the work-area door once read the same fact apart: this one demanded an area the other refused a
   * secretary, so no value of the area satisfied both (problem XivYfQN8RLQz). No role is named here.
   *
   * WHEN THE CARDS HAVE NOT BEEN READ the door keeps its older answer and requires an area. The
   * cards are read once, from buildApp, before the first request; every HTTP caller has them.
   */
  if (input.claimant.kind === 'agent') {
    // `registered` is the registry row the ARRIVING name resolved to, read above by id.
    const row = registered as RegisteredAgent
    const role = row.role ?? A_ROW_WITH_NO_ROLE_READS_AS
    const needsAnArea = !theRoleCardsAreRead() || aRoleNeedsARegisteredWorkArea(theRoleCards(), row.role ?? null)
    if (needsAnArea && (row.workArea === null || row.workArea.length === 0)) {
      // Mole Office's own row holds no card, so its refusal does not say it holds one.
      const said = isMoleOffice({ kind: 'agent', id: row.id })
        ? noWorkAreaForTheOfficesOwnRow(row.handle, role)
        : noWorkAreaToStart(row.handle, role)
      throw new PanelError(said, 403)
    }
  }
  theRunOrARefusal(input.run, input.workspaceId)

  const id = anOfficeId()
  db.insert(workClaims)
    .values({
      id,
      workspaceId: input.workspaceId,
      claimantKind: input.claimant.kind,
      claimantId: input.claimant.id,
      run: input.run,
      things: JSON.stringify(input.things),
      openedAt: nowStamp(),
      renewedAt: null,
      releasedAt: null,
      releasedBecause: null,
    })
    .run()
  // THE GROUPS ARE OPENED AFTER THE ROW, NOT INSIDE A TRANSACTION WITH IT. A group is opened by
  // writing message records, and a record write opens its own transaction. What that costs: a crash
  // between the two leaves a claim with no group, and the next claim filed on the same thing opens
  // it. The claim is the thing that matters and it is written first.
  const opened = openTheGroupsForANewClaimAndSayWhy(id, input.workspaceId, by)
  return {
    claim: theClaimOrARefusal(id, input.workspaceId),
    groups: opened.groups,
    heldForACheck: opened.heldForACheck,
  }
}

/** The run says it is still working on this. It moves nothing about when the lease ends. */
export function renewAClaim(id: string, workspaceId: string, by: ParticipantRef): ClaimOnTheWire {
  const claim = theClaimOrARefusal(id, workspaceId)
  if (participantKey(claim.claimant) !== participantKey(by)) throw new PanelError(A_CLAIM_IS_THE_CLAIMANTS_OWN, 403)
  if (claim.state !== 'live') throw new PanelError(THAT_CLAIM_HAS_ENDED, 409)
  db.update(workClaims).set({ renewedAt: nowStamp() }).where(eq(workClaims.id, id)).run()
  return theClaimOrARefusal(id, workspaceId)
}

/**
 * SAY THE RUN HAS FINISHED WITH THIS CLAIM.
 *
 * THE AUTHOR MAY ALWAYS. The secretary may end a claim whose run is not running — one waiting for a
 * check, or one whose run is already over — because nobody else can and the claim would otherwise
 * stay live for ever. That is criterion F4, on problem DrX8P0fYGmx8: the five overlap groups a live
 * corpus opened against a finished run's claim could not be closed because only its author could
 * release it and its author's session was finished.
 *
 * A CLAIM OF A RUN STILL RUNNING STAYS THE AUTHOR'S ALONE. The author is there; the secretary ending
 * it would take work out of a live agent's hands.
 *
 * THE REASON IS RECORDED on the row, as it always was. F5 follows: every group opened for an overlap
 * this claim was part of is told the overlap has ended, in one line.
 */
export function releaseAClaim(
  id: string,
  workspaceId: string,
  by: ParticipantRef,
  because: string,
  /**
   * The releaser as the request carried it, which the retire rule reads: the person's key and an agent's own key are
   * on it. A caller with no request is the participant `by` names.
   */
  actor: Actor = actorFor(by),
): ClaimOnTheWire & { agentsLeftLive?: AnAgentTheReleaseLeftLive[] } {
  const claim = theClaimOrARefusal(id, workspaceId)
  const mine = participantKey(claim.claimant) === participantKey(by)
  if (!mine && !theSecretaryMayEndThisClaim(claim, by)) {
    // TWO REFUSALS, because the two callers have two different next steps. A stranger is told the
    // claim is the claimant's own; the secretary is told the run is still running, so waiting is the
    // only thing the rule leaves.
    if (isTheSecretary(by)) throw new PanelError(A_CLAIM_OF_A_RUNNING_RUN_IS_THE_AUTHORS_OWN, 403)
    throw new PanelError(A_CLAIM_IS_THE_CLAIMANTS_OWN, 403)
  }
  // A CLAIM WHOSE RUN HAS ALREADY ENDED MAY STILL BE RELEASED, and it is not refused: the run ending
  // and somebody saying they finished are two different facts, and writing the second down over the
  // first loses nothing. What is refused is releasing one that is already released.
  if (claim.releasedAt !== null) throw new PanelError(THAT_CLAIM_HAS_ENDED, 409)
  // THE GROUPS ARE FOUND BEFORE THE ROW MOVES, because a claim that has stopped reading live is in
  // no overlap any more and the group it was in would be lost. F5 below.
  const groups = theGroupsThisClaimHeld(claim, workspaceId)
  markTheClaimReleased(id, because)
  // AND THE ROLE OF ANY AGENT STARTED FOR THIS PIECE OF WORK HAS COME TO ITS END. Criterion P15.
  // Here, in the one place a claim is released, rather than in the route: a rule enforced on one
  // write path is not a rule, and this is the write path.
  // A CLAIM MAY NAME SEVERAL THINGS, so every record it named is asked about. A path is not asked:
  // an agent is started for a piece of work, and a folder is not one.
  const agentsLeftLive: AnAgentTheReleaseLeftLive[] = []
  for (const thing of claim.things) {
    if (thing.what === 'record') {
      agentsLeftLive.push(...retireWhateverWasStartedFor(thing.id, workspaceId, by, actor))
      // AND ANY ELEVATION GIVEN UNTIL THIS PIECE OF WORK ENDED HAS ENDED. Criterion P59's second
      // end, here for the reason the retirement is here: this is the one place a claim is released,
      // and the person picked THIS record when they pressed. Nothing is scheduled and nothing polls.
      endWhateverWasGivenUntil(thing.id)
    }
  }
  sayTheOverlapEndedIn(groups, workspaceId, actorFor(by), mine ? 'claim released' : 'secretary released it')
  const released = theClaimOrARefusal(id, workspaceId)
  // THE LIST IS THERE ONLY WHEN THE RELEASE LEFT AN AGENT LIVE, so a release that left none answers as it always did.
  return agentsLeftLive.length === 0 ? released : { ...released, agentsLeftLive }
}

/** An agent started for the released work that the releaser may not retire, and the retire rule's reason. */
export interface AnAgentTheReleaseLeftLive {
  agent: { kind: 'agent'; id: string }
  handle: string
  /** The retire rule's refusal, without the line saying nothing was written: the claim itself was released. */
  why: string
}

/** The change-log actor behind a participant. A claim's caller is named as the kind it really is. */
function actorFor(by: ParticipantRef): Actor {
  return { type: by.kind === 'person' ? 'human' : 'agent', id: by.id }
}

/**
 * END EVERY LIVE CLAIM OF ONE RUN, IN THE SAME ACT THAT ENDS THE RUN. Criterion F2.
 *
 * Called on the state transition that ends a session (`theRunHasEnded` in lib/keys.ts), and
 * by the superseded and closed-unchecked doors in their settlement transactions. This is not
 * `releaseAClaim`: it asks no author and it retires no agent and ends no elevation. P15's own note forbids those side effects here: an agent's message saying it has finished
 * does not mean it has really finished, so a run saying it finished must not retire the very agents whose release P15 waits
 * for. This writes the claim row and tells the groups, and nothing else.
 *
 * F1 DECIDES, NOT THE TRANSITION LIST. The transition fires for `finished`, `crashed` and
 * `orphaned`, and a run that said it finished is only `inspecting`: `howTheRunStands` reads that
 * standing, so a run being checked keeps its claim. The transition is therefore the moment this is
 * asked, and the standing is the answer — the one reading, in the one place.
 *
 * The reason is the run's own ending, and it is recorded because every claim row carries why it
 * ended. Returns the claims it ended, so a caller can see what the run was holding.
 */
export function endTheClaimsOfARun(
  runId: string,
  workspaceId: string,
  by: Actor,
  because = 'The run it belonged to ended.',
): string[] {
  const ended: string[] = []
  if (howTheRunStands(runId, workspaceId).state === 'live') return ended
  for (const claim of claimsOfRun(runId, workspaceId)) {
    const groups = theGroupsThisClaimHeld(claim, workspaceId)
    markTheClaimReleased(claim.id, because)
    sayTheOverlapEndedIn(groups, workspaceId, by, 'run ended')
    ended.push(claim.id)
  }
  return ended
}

/** The one write that ends a claim row, shared by every path that ends one. */
function markTheClaimReleased(id: string, because: string): void {
  db.update(workClaims)
    .set({ releasedAt: nowStamp(), releasedBecause: because.trim() === '' ? null : because.trim() })
    .where(eq(workClaims.id, id))
    .run()
}

/** Whether this caller is the active secretary, whoever they are. */
function isTheSecretary(by: ParticipantRef): boolean {
  const secretary = theActiveSecretary()
  return secretary !== null && participantKey(secretary) === participantKey(by)
}

/** Whether the secretary may end this claim: the caller is it, and the run is not running. */
function theSecretaryMayEndThisClaim(claim: ClaimOnTheWire, by: ParticipantRef): boolean {
  if (!isTheSecretary(by)) return false
  return !howTheRunStands(claim.run, claim.workspaceId).running
}

/**
 * EVERY GROUP OPENED FOR AN OVERLAP THIS CLAIM WAS PART OF, live or not. Criterion F5.
 *
 * IT CANNOT ASK `overlapsIn`, because this runs as the claim is ending and a claim that is ending is
 * no longer in a live pair. So it works the same overlap key out itself, from the two claims and the
 * older one's thing, which is the spelling `overlapsIn` uses and `groupOpenedFor` stores. A group is
 * added once however many things the two claims have in common.
 */
function theGroupsThisClaimHeld(claim: ClaimOnTheWire, workspaceId: string): string[] {
  const groups = new Set<string>()
  const rows = db.select().from(workClaims).where(eq(workClaims.workspaceId, workspaceId)).all()
  for (const row of rows) {
    if (row.id === claim.id) continue
    const other: ParticipantRef = {
      kind: isParticipantKind(row.claimantKind) ? row.claimantKind : 'agent',
      id: row.claimantId,
    }
    if (participantKey(other) === participantKey(claim.claimant)) continue
    const theirThings = thingsOf(row.things)
    // THE OLDER CLAIM'S THING SPELLS THE KEY, exactly as `overlapsIn` orders the pair.
    const iAmOlder =
      claim.openedAt.localeCompare(row.openedAt) < 0 ||
      (claim.openedAt === row.openedAt && claim.id < row.id)
    const olderThings = iAmOlder ? claim.things : theirThings
    const newerThings = iAmOlder ? theirThings : claim.things
    for (const older of olderThings) {
      for (const newer of newerThings) {
        if (!thingsOverlap(older, newer)) continue
        const group = groupOpenedFor(overlapKey(claim.claimant, other, older))
        if (group !== null) groups.add(group.id)
      }
    }
  }
  return [...groups]
}

/**
 * TELL EVERY GROUP WHOSE OVERLAP HAS ENDED WHY, IN ONE LINE. Criterion F5.
 *
 * A group opened for an overlap has no closed column and no closed state. What says it is over is
 * this line, written once per group: the two claims of an overlap can end at different moments, and
 * the second must not put a second line in. `THE_OVERLAP_ENDED_PREFIX` is the one spelling of what
 * the line says, read here and by whatever later asks whether the group has already been told.
 */
function sayTheOverlapEndedIn(
  groupIds: readonly string[],
  workspaceId: string,
  by: Actor,
  because: string,
): void {
  for (const groupId of groupIds) {
    if (theGroupSaysTheOverlapEnded(groupId)) continue
    writeASystemLine(groupId, workspaceId, SYSTEM_LINES.theOverlapEnded(because), by)
  }
}

/**
 * THE ONE REASON THE MARKING LINE CARRIES. Criterion P100 (C).
 *
 * A group opened for a work-area overlap that criterion B would no longer open is not closed by any
 * column or migration: the office's one existing "overlap ended" line marks it, exactly as the
 * earlier work of 14 September marked the groups whose claims had ended. The reason says the
 * two things C asks for — the overlap was inside one starter chain, and the group is not needed.
 */
export const THE_OVERLAP_WAS_INSIDE_ONE_CHAIN =
  'the overlap was inside one starter chain, so the group is not needed'

/**
 * MARK EVERY WORK-AREA OVERLAP GROUP THAT CRITERION B WOULD NO LONGER OPEN. Criterion P100 (C).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * B stops NEW groups being opened for an overlap inside one starter chain, and it says nothing
 * about the groups already open when it arrived. Those groups were real when they were opened and
 * there is no column that can be flipped and no migration to run. So the office says so in the
 * group itself, with the one line it already uses for a group whose overlap is over: this writes
 * `theOverlapEnded` with `THE_OVERLAP_WAS_INSIDE_ONE_CHAIN` into every work-area group whose two
 * agents are in one chain now and which has not been told. One line per group, and running it twice
 * writes nothing the second time, because it asks what the group already holds rather than
 * remembering what it did.
 *
 * IT IS `system` AND NOT THE CALLER. The office worked this out from the chain; the caller ran the
 * sweep and decided nothing about any group. A change row in the caller's name would be a false
 * name in a permanent log, which is the reason `retireWhateverWasStartedFor` gives for the same
 * choice. `markTheWorkAreaGroupsInsideOneChain` returns the groups it marked, so a caller that
 * wants to say what it did has the ids.
 *
 * `workspaceId` NARROWS THE SWEEP to one project, and absent marks every project's groups. The
 * sweep reads each group's own project from the row, so a line is written where the group lives.
 */
export function markTheWorkAreaGroupsInsideOneChain(by: Actor, workspaceId?: string): string[] {
  const marked: string[] = []
  for (const group of theWorkAreaGroupsInsideOneChain(workspaceId)) {
    writeASystemLine(
      group.id,
      group.workspaceId,
      SYSTEM_LINES.theOverlapEnded(THE_OVERLAP_WAS_INSIDE_ONE_CHAIN),
      by,
    )
    marked.push(group.id)
  }
  return marked
}

/**
 * EVERY WORK-AREA GROUP THAT CRITERION B WOULD NO LONGER OPEN AND THAT HAS NOT BEEN TOLD.
 *
 * The read half of the sweep above, separated so a caller can say what it would write without
 * writing it — the way `scripts/shorten-the-system-lines-written-before-m34.ts` reports before it
 * acts. It asks the chain as it stands now and the group's own messages, so the answer is a reading
 * of the rows rather than a memory of an earlier run.
 */
export function theWorkAreaGroupsInsideOneChain(
  workspaceId?: string,
): { id: string; workspaceId: string }[] {
  const out: { id: string; workspaceId: string }[] = []
  for (const group of groupsOpenedForAWorkAreaOverlap()) {
    if (workspaceId !== undefined && group.workspaceId !== workspaceId) continue
    const [, first, second] = group.about.split('|')
    if (first === undefined || second === undefined || first === '' || second === '') continue
    if (!theTwoAgentsAreInOneChain(first, second)) continue
    if (theGroupSaysTheOverlapEnded(group.id)) continue
    out.push({ id: group.id, workspaceId: group.workspaceId })
  }
  return out
}

/**
 * RETIRE EVERY AGENT WHOSE ROLE ENDED WHEN THIS PIECE OF WORK WAS RELEASED. Criterion P15.
 *
 * Every role card says what ends it. For a worker that is the task it was
 * started for, *"once that task has been checked and released"* — and the design says the agent
 * saying it is done is not what ends it. So the end is somebody
 * else releasing the work, which is this.
 *
 * AN AGENT THAT NAMED NO WORK IS NEVER TOUCHED. `started_for` is NULL for it, and NULL means nobody
 * said rather than "there is no end". Retiring an agent because a field was empty would end a role
 * on no evidence at all.
 *
 * THE RELEASER IS THE ONE RETIRING, AND THE CARD'S RETIRE RULE IS ASKED FOR EACH AGENT. Releasing work used to
 * retire every agent started for it, whoever released it, so a release could retire an agent its releaser had no
 * right to retire, such as one holding a card the person appoints. Now an agent the rule lets the releaser retire is
 * retired, and one it does not is left live and returned with the rule's reason, so the release's answer names it.
 * The claim is released either way.
 * While the gate is at block no agent may retire itself, so a worker that releases its own claim is not retired by
 * that release, and its starter retires it.
 *
 * IT RETIRES THROUGH `retireThisAgent`, the one function every way of retiring an agent goes through. It retires the
 * row and every agent record mapped to it, and revokes the agent's keys. Its record writes are filed under the
 * product's own writer of agent records, not under the releaser's name, and the row says who retired it.
 *
 * AN AGENT WITH NO RECORD IN THIS PROJECT IS NOT ASKED, as before.
 */
function retireWhateverWasStartedFor(recordId: string, workspaceId: string, by: ParticipantRef, actor: Actor): AnAgentTheReleaseLeftLive[] {
  const left: AnAgentTheReleaseLeftLive[] = []
  const work = getRecord(recordId)
  const because =
    'The task it was started for was released' + (work === null ? '.' : `: "${work.title}".`) + ' What ends this role is on its card.'
  for (const agent of agentsStartedFor(recordId)) {
    if (recordForAgentIn(agent.id, workspaceId) === null) continue
    const whyNot = whyThisActorMayNotRetire(agent, actor)
    if (whyNot === null) retireThisAgent(agent.id, by, because)
    else left.push({ agent: { kind: 'agent', id: agent.id }, handle: agent.handle, why: whyNot })
  }
  // AND A SECRETARY RETIRED THIS WAY LEAVES THE SECRETARIAT GROUP TOO. This path does not go through the retire
  // door, so it calls the one reconciliation the other doors call. It makes no group: the rule makes that at a server
  // start or at the first secretary's registration.
  bringTheSecretariatGroupInStep()
  return left
}

/**
 * END EVERY ELEVATION THE PERSON GAVE UNTIL THIS PIECE OF WORK ENDED. Criterion P59.
 *
 * One of the three ends is "until a piece of work ends", and this is the moment
 * that happens. `elevationsThatEndWith` decides which grants it is and hands back the ended object;
 * the write is a patch to the secretary's own record, so the end gets a change row and a revision
 * saying what ended it, exactly as the grant did.
 *
 * IT IS `system` AND NOT THE PERSON RELEASING THE CLAIM, for the reason the retirement beside it
 * gives: they released a claim and said nothing about any secretary. A change row in their name would be
 * a false name in a permanent log.
 *
 * A GRANT WHOSE AGENT HAS NO RECORD ANY MORE IS LEFT AS IT IS, and it still stops holding: the
 * registry row is what a refusal reads, and `theElevationHeldBy` asks the clock and the card. What
 * would be lost is the sentence saying what ended it, which is worth less than a write that throws.
 */
function endWhateverWasGivenUntil(recordId: string): void {
  for (const { handle, every } of elevationsThatEndWith(recordId)) {
    // `handle` is the STORED handle the elevation grant recorded, read the stored way.
    const row = theAgentAStoredReferenceNames(handle)
    if (row === null) continue
    const held = anyRecordForAgent(row.id)
    if (held === null) continue
    // THROUGH THE DOOR, because this is the elevation mechanism ending a grant rather than somebody
    // writing one. Problem mz5ddKDITE3j: the ordinary record write path refuses a change to
    // `elevation` on an agent record to everybody but the person and the doors that do that act.
    throughTheCardDoor(() =>
      patchRecord(held.record, { dataPatch: { elevation: asStored(every) } }, { type: 'system', id: moleOffice().id }),
    )
  }
}

/** The sentence saying how one claim stands, for a screen that draws one line about it. */
export function howItStands(claim: ClaimOnTheWire): string {
  const word = claim.state === 'live' ? 'Working on it' : claim.state === 'released' ? 'Finished' : 'The run ended'
  return CLAIM_WORDS.leaseUntil(word, claim.from === null ? '' : leaseInputSays(claim.from)).trim()
}

/** Every claim filed by one run, so a run that ends can be seen to have ended its claims. */
export function claimsOfRun(runId: string, workspaceId: string): ClaimOnTheWire[] {
  return db
    .select()
    .from(workClaims)
    .where(and(eq(workClaims.run, runId), eq(workClaims.workspaceId, workspaceId), isNull(workClaims.releasedAt)))
    .all()
    .map((row) => asClaim(row))
}
