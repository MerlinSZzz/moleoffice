// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GROUPS: OPENING ONE, WHO IS IN IT, AND THE LINES MOLE OFFICE WRITES INTO IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A GROUP IS AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M11 of design/messages/ACCEPTANCE.md. A group is a name and the participants in it. A
 * message addressed to a group is ONE message with one delivery row per member — the pool's existing
 * marks — and `message_delivery` stays the only copy of who a message reached. Nothing here holds a
 * message, and nothing here is a second message store.
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY DO WHAT, AND WHY THE RULES ARE THESE
 * ---------------------------------------------------------------------------------------
 *
 * Any participant may open a group and add members (M11). A person may leave. An agent may leave. An
 * agent may not take anybody else out, and a person may take an agent out.
 *
 * THE ONE RULE THAT IS NOT IN THE PERSON'S WORDS IS THE LAST HALF, and it is written down as an engineering
 * decision rather than smuggled in. M11 says only that an agent may not remove a person. A person
 * removing an agent is the same power M3 already gives them over an agent's name and picture, and a
 * group with a member nobody can take out is a group that can never be tidied. An agent removing
 * another agent is refused because the group a conflict opens holds exactly the two agents in
 * conflict, and either of them could otherwise end the conversation by removing the other.
 *
 * ---------------------------------------------------------------------------------------
 * A SYSTEM LINE IS A MESSAGE WHOSE SENDER IS MOLE OFFICE
 * ---------------------------------------------------------------------------------------
 *
 * There is no flag saying "this is a system line". Mole Office is a participant with its own registry
 * row and picture, and a message it sent is a system line because it sent it. One fact in one place.
 * `writeASystemLine` below is the only thing that writes one, and `lib/records.ts` refuses a `sentBy` that
 * is not the writer for everybody else — so nothing but this file can speak as Mole Office.
 */

import { and, asc, eq, inArray, isNotNull, isNull, like, sql } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'
import { db } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { groupMembers, groups } from '../db/schema.ts'
import { EVERY_PROJECT, type WhichProjects } from '@shared/which-projects.ts'
import { narrowedToProjects } from '@shared/which-projects-sql.ts'
import { nowStamp } from '@shared/time.ts'
import {
  moleOffice,
  isMoleOffice,
  isParticipantKind,
  participantWord,
  type ParticipantRef,
} from '@shared/participants.ts'
import {
  AN_AGENT_MAY_NOT_REMOVE_A_PERSON,
  AN_AGENT_MAY_ONLY_REMOVE_ITSELF,
  GROUP_MEMBER_MAX,
  NOBODY_IS_IN_THAT_GROUP,
  YOU_ARE_NOT_IN_THAT_GROUP,
  SYSTEM_LINES,
  SYSTEM_LINE_TITLE,
  type AnOfficeLine,
  type SystemLine,
  alreadyInThatGroup,
  noSuchGroup,
  notInThatGroup,
  tooManyMembers,
  whyGroupNameIsRefused,
  whyTheReasonIsRefused,
  whoAMessageMentions,
  type GroupMemberOnTheWire,
  type GroupOnTheWire,
  type Mentionable,
} from '@shared/groups.ts'
import { participantKey, sameParticipant } from '@shared/messages.ts'
import { createRecord, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { agentsWithTheseIds } from '../db/agents-with-these-ids.ts'
import { readParticipant } from '../db/read-participant.ts'
import { readGroup } from '../db/read-group.ts'
import { refOf } from '../db/read-group.ts'
import { membersOf } from '../db/members-of.ts'
import { membersOfMany } from '../db/members-of.ts'

// ============================================================================ reading

export { refOf } from '../db/read-group.ts'

/**
 * The registry row's name or handle for one participant, or the id when no row answers. The one rule for
 * `nameOf`, `handleOf` and the @ reading's members (`asMentionable`).
 */
function theRowsOrTheId(who: ParticipantRef, row: { name: string; handle: string } | null | undefined, part: 'name' | 'handle'): string {
  return row?.[part] ?? who.id
}

/** The name a reader sees for one participant, or the id when no registry row answers. */
export function nameOf(who: ParticipantRef): string {
  return theRowsOrTheId(who, readParticipant(who), 'name')
}

/**
 * THE HANDLE ONE PARTICIPANT ANSWERS TO, or the id when no registry row answers.
 *
 * A handle is unique in the registry and short, which a display name is neither, so it is what names
 * a participant where a name has to tell one thing from another in a few characters. The one place
 * that is true today is the name a conflict opens a group with; see `conflictGroupName` in
 * shared/claims.ts.
 */
export function handleOf(who: ParticipantRef): string {
  return theRowsOrTheId(who, readParticipant(who), 'handle')
}

export { membersOf } from '../db/members-of.ts'

export { membersOfMany } from '../db/members-of.ts'

export { readGroup } from '../db/read-group.ts'

/**
 * One group, or a refusal naming what the id turned out to be.
 *
 * THE REFUSAL SAYS WHERE THE GROUP REALLY IS, when it is in another project. Nothing is being hidden
 * — the same caller gets it by sending one header — so a refusal that did not name the project would
 * send a reader hunting for a group that is right there. `tests/by-id-boundary.test.ts` holds every
 * route with an id in its path to that.
 */
export function theGroupOrARefusal(id: string, which: WhichProjects): GroupOnTheWire {
  const found = readGroup(id, which)
  if (found !== null) return found
  if ('oneProject' in which) {
    const anywhere = db.select().from(groups).where(eq(groups.id, id)).get()
    if (anywhere !== undefined) {
      throw new PanelError(
        `The group ${id} is in the project "${anywhere.workspaceId}" and this request is about "${which.oneProject}".`,
        404,
      )
    }
    throw new PanelError(
      `No group in the project "${which.oneProject}" has the id ${id}. GET /api/groups lists every group in it.`,
      404,
    )
  }
  // ASKED ACROSS EVERY PROJECT, so there is no other project to point at: this id is in none of them.
  throw new PanelError(`No group in this installation has the id ${id}. GET /api/groups lists the groups there are.`, 404)
}

/** Every group in the projects asked about, newest first. The group list asks for every project. */
export function groupsIn(which: WhichProjects): GroupOnTheWire[] {
  return readGroups(which, null)
}

/**
 * The groups in the projects asked about, newest first, with their members. Given an id, only the groups
 * with a current member of that id, so no other group's members are read. The caller checks the kind.
 */
function readGroups(which: WhichProjects, memberId: string | null): GroupOnTheWire[] {
  const rows = db
    .select()
    .from(groups)
    .where(
      and(
        narrowedToProjects(groups.workspaceId, which),
        memberId === null
          ? undefined
          : sql`exists (select 1 from ${groupMembers} where ${groupMembers.groupId} = ${groups.id} and ${groupMembers.memberId} = ${memberId} and ${groupMembers.leftAt} is null)`,
      ),
    )
    .orderBy(sql`${groups.openedAt} desc`, sql`${groups.id} desc`)
    .all()
  const members = membersOfMany(rows.map((row) => row.id))
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    about: row.about,
    openedBy: refOf(row.openedByKind, row.openedById),
    openedBecause: row.openedBecause,
    openedAt: row.openedAt,
    members: members.get(row.id) ?? [],
  }))
}

/** Every group this participant is in now, newest first, across the projects asked about. */
export function groupsFor(who: ParticipantRef, which: WhichProjects): GroupOnTheWire[] {
  return readGroups(which, who.id).filter((group) =>
    group.members.some((member) => participantKey(member.who) === participantKey(who)),
  )
}

/** True when this participant is in that group now. */
export function isAMember(groupId: string, who: ParticipantRef): boolean {
  return membersOf(groupId).some((member) => participantKey(member.who) === participantKey(who))
}

/** The group opened for one overlap, or null because none has been. */
export function groupOpenedFor(about: string): GroupOnTheWire | null {
  const row = db.select().from(groups).where(eq(groups.about, about)).get()
  if (row === undefined) return null
  return readGroup(row.id, EVERY_PROJECT)
}

/**
 * EVERY GROUP OPENED FOR A WORK-AREA OVERLAP, with the one spelling of that overlap and the project
 * it was opened in. Criterion P100 (C).
 *
 * THE MARKING SWEEP NEEDS THIS READ. A group a registration opened for two overlapping work areas
 * carries `about` of the form `work-area|<first>|<second>`, which is `workAreaOverlapKey`'s one
 * spelling in lib/claims.ts. Nothing else may mark such a group, and the sweep cannot ask
 * `groupOpenedFor` because it does not know the pair before it reads it. So the pairs come off the
 * rows, and `about` is answered as it is stored rather than parsed here.
 */
export function groupsOpenedForAWorkAreaOverlap(): { id: string; workspaceId: string; about: string }[] {
  return db
    .select({ id: groups.id, workspaceId: groups.workspaceId, about: groups.about })
    .from(groups)
    .where(and(isNotNull(groups.about), like(groups.about, 'work-area|%')))
    .all()
    .map((row) => ({ id: row.id, workspaceId: row.workspaceId, about: row.about ?? '' }))
}

// ============================================================================ writing

/** Refuse a participant nothing in either registry answers to. */
function theParticipantOrARefusal(who: ParticipantRef): void {
  if (readParticipant(who) === null) {
    throw new PanelError(
      `Nothing is registered as the ${participantWord(who.kind)} "${who.id}", so it cannot be put in a group. ` +
        'GET /api/participants lists every person and every durable agent, with the id of each.',
      400,
    )
  }
}

/** What opening a group needs. */
export interface OpenAGroup {
  workspaceId: string
  name: string
  /** Who is opening it. */
  openedBy: ParticipantRef
  /** One plain sentence saying why. */
  because: string
  /** Everybody who is in it from the start, each with the sentence saying why they are. */
  members: readonly { who: ParticipantRef; because: string }[]
  /**
   * The one spelling of the overlap this group was opened for, or absent because somebody opened it
   * by hand. A second group for the same overlap is refused by the database's own unique index.
   */
  about?: string
}

/**
 * OPEN A GROUP, PUT ITS MEMBERS IN IT, AND WRITE THE LINE SAYING SO. One transaction.
 *
 * THE SYSTEM LINES ARE NOT WRITTEN HERE. This function writes rows; a message is a record, and a
 * record write goes through lib/records.ts, which cannot be called from inside this transaction
 * without nesting one. The caller writes the lines with `systemLine` below, straight after. What
 * that costs is written on `openAGroupAndSayWhy` in lib/groupwriting.ts, which is the one door
 * everything else uses and which does both halves.
 */
export function openAGroup(input: OpenAGroup): GroupOnTheWire {
  const badName = whyGroupNameIsRefused(input.name)
  if (badName !== null) throw new PanelError(badName, 400)
  const badReason = whyTheReasonIsRefused(input.because, 'this group was opened')
  if (badReason !== null) throw new PanelError(badReason, 400)
  theParticipantOrARefusal(input.openedBy)
  if (input.members.length > GROUP_MEMBER_MAX) throw new PanelError(tooManyMembers(input.members.length), 400)
  const seen = new Set<string>()
  for (const member of input.members) {
    theParticipantOrARefusal(member.who)
    const badWhy = whyTheReasonIsRefused(member.because, `${member.who.id} was added`)
    if (badWhy !== null) throw new PanelError(badWhy, 400)
    const key = participantKey(member.who)
    if (seen.has(key)) throw new PanelError(alreadyInThatGroup(member.who.id), 400)
    seen.add(key)
  }

  const at = nowStamp()
  const id = anOfficeId()
  db.transaction(() => {
    db.insert(groups)
      .values({
        id,
        workspaceId: input.workspaceId,
        name: input.name.trim(),
        openedByKind: input.openedBy.kind,
        openedById: input.openedBy.id,
        openedBecause: input.because.trim(),
        openedAt: at,
        about: input.about ?? null,
      })
      .run()
    for (const member of input.members) {
      db.insert(groupMembers)
        .values({
          id: anOfficeId(),
          groupId: id,
          memberKind: member.who.kind,
          memberId: member.who.id,
          joinedAt: at,
          joinedBecause: member.because.trim(),
          leftAt: null,
        })
        .run()
    }
  })
  return theGroupOrARefusal(id, EVERY_PROJECT)
}

/** Put one more participant in a group. Any participant may add anybody (M11). */
export function addAMember(groupId: string, who: ParticipantRef, because: string): GroupOnTheWire {
  // THE GROUP IS LOOKED UP ACROSS EVERY PROJECT. Decision `t5DlN5-uTZoT` puts the writes with the
  // reads: a group somebody can see from another project and cannot write in is worse than one they
  // cannot see at all.
  const group = theGroupOrARefusal(groupId, EVERY_PROJECT)
  theParticipantOrARefusal(who)
  const badWhy = whyTheReasonIsRefused(because, `${who.id} was added`)
  if (badWhy !== null) throw new PanelError(badWhy, 400)
  if (isAMember(groupId, who)) throw new PanelError(alreadyInThatGroup(who.id), 400)
  if (group.members.length >= GROUP_MEMBER_MAX) throw new PanelError(tooManyMembers(group.members.length), 400)
  db.insert(groupMembers)
    .values({
      id: anOfficeId(),
      groupId,
      memberKind: who.kind,
      memberId: who.id,
      joinedAt: nowStamp(),
      joinedBecause: because.trim(),
      leftAt: null,
    })
    .run()
  return theGroupOrARefusal(groupId, EVERY_PROJECT)
}

/**
 * WHY ONE PARTICIPANT MAY NOT TAKE ANOTHER OUT OF A GROUP, or null when they may.
 *
 * Anybody may take themselves out. A person may take an agent out. An agent may take nobody else
 * out, and the sentence says which of the two rules refused it — an agent reaching for a person gets
 * the rule M11 states in the person's words, and an agent reaching for another agent gets the narrower one.
 */
export function whyTheRemovalIsRefused(who: ParticipantRef, by: ParticipantRef): string | null {
  if (participantKey(who) === participantKey(by)) return null
  if (by.kind === 'person') return null
  if (who.kind === 'person') return AN_AGENT_MAY_NOT_REMOVE_A_PERSON
  return AN_AGENT_MAY_ONLY_REMOVE_ITSELF
}

/** Take one participant out of a group, or refuse with the sentence naming the rule. */
export function takeOutOfTheGroup(groupId: string, who: ParticipantRef, by: ParticipantRef): GroupOnTheWire {
  theGroupOrARefusal(groupId, EVERY_PROJECT)
  const because = whyTheRemovalIsRefused(who, by)
  if (because !== null) throw new PanelError(because, 403)
  if (!isAMember(groupId, who)) throw new PanelError(notInThatGroup(who.id), 400)
  db.update(groupMembers)
    .set({ leftAt: nowStamp() })
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.memberKind, who.kind),
        eq(groupMembers.memberId, who.id),
        isNull(groupMembers.leftAt),
      ),
    )
    .run()
  return theGroupOrARefusal(groupId, EVERY_PROJECT)
}

// ============================================================================ addressing a group

export { whyTheGroupAddressingIsRefused } from '../db/why-the-group-addressing-is-refused.ts'

/**
 * MEMBERS AS THE @ READING NEEDS THEM, in the order given, each read from the registries once.
 *
 * THE AGENTS' ROWS ARE READ TOGETHER, in pieces, through `agentsWithTheseIds` (wave 13y round 48). Each
 * member was read twice through `readParticipant`, once for its handle and once for its name, and each
 * read built the whole agent with the statement for its record's runtime: 4,242 builds in one queue ask
 * on a made-up office. A person is still read through `readParticipant`, once. The kinds split as
 * `readParticipant` splits them, and where no row answers the id stands in, by the rule `nameOf` and
 * `handleOf` use.
 */
function asMentionable(members: readonly ParticipantRef[]): Mentionable[] {
  const agents = agentsWithTheseIds(members.filter((who) => who.kind !== 'person').map((who) => who.id))
  return members.map((who) => {
    const row = who.kind === 'person' ? readParticipant(who) : agents.get(who.id)
    return { who, handle: theRowsOrTheId(who, row, 'handle'), name: theRowsOrTheId(who, row, 'name') }
  })
}

/** Everybody in one group now, with the handle and the name the @ reading matches against. */
export function mentionableMembersOf(groupId: string): Mentionable[] {
  return asMentionable(membersOf(groupId).map((member) => member.who))
}

/**
 * THE SAME READING FOR SEVERAL GROUPS AT ONCE, keyed by group id.
 *
 * A whole-message read holds messages from every group the reader has ever been in, and resolving
 * each group with its own query would read the membership table once per group. This reads it once
 * for all of them, which is the same shape `deliveriesOfMany` uses one file over.
 */
export function mentionableMembersOfMany(groupIds: readonly string[]): Map<string, Mentionable[]> {
  const out = new Map<string, Mentionable[]>()
  // IN PIECES (src/server/db/in-pieces.ts), as in `membersOfMany`.
  const rows = readInPieces(groupIds, (piece) =>
    db
      .select()
      .from(groupMembers)
      .where(and(inArray(groupMembers.groupId, piece), isNull(groupMembers.leftAt)))
      .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.id))
      .all(),
  )
  // EVERY MEMBER OF EVERY GROUP IN ONE READING, so an agent in several groups is read once.
  const resolved = asMentionable(rows.map((row) => refOf(row.memberKind, row.memberId)))
  for (const [i, row] of rows.entries()) {
    const held = out.get(row.groupId) ?? []
    held.push(resolved[i]!)
    out.set(row.groupId, held)
  }
  return out
}

/**
 * WHO ONE MESSAGE TO A GROUP IS DELIVERED TO: every member except whoever sent it, narrowed to the
 * members the message @s.
 *
 * ---------------------------------------------------------------------------------------
 * AN @ DECIDES WHO IS TOLD, by criteria GM1 and GM3.
 * ---------------------------------------------------------------------------------------
 *
 * A message that @s one or more members is delivered only to them. A message that @s nobody, and
 * one that says @所有人 or @all, is delivered to every member, which is what every group message
 * did until this rule. An @ that matches nobody is words and addresses nobody, so it falls to the
 * same deliver-to-everybody case as a message with no @ at all.
 *
 * THE SENDER GETS NO ROW. A delivery row is a mark about somebody else reading, so a row addressed
 * to the sender would put their own words in their own unread count.
 */
export function whoAGroupMessageReaches(
  groupId: string,
  sender: ParticipantRef | null,
  body: string,
): ParticipantRef[] {
  const members = membersOf(groupId)
  const reachable = members
    .map((member) => member.who)
    .filter((who) => sender === null || !sameParticipant(who, sender))
  const reading = whoAMessageMentions(
    body,
    asMentionable(members.map((member) => member.who)),
  )
  if (reading.everyone || reading.who.length === 0) return reachable
  return reachable.filter((who) => reading.who.some((one) => sameParticipant(one, who)))
}

// ============================================================================ the system lines

/**
 * WRITE ONE LINE AS MOLE OFFICE ITSELF, into one group.
 *
 * THE WRITER IS THE ACTOR WHOSE REQUEST CAUSED IT AND THE SENDER IS MOLE OFFICE. Both are true, and
 * the same shape as an agent's reply filed by the worker: the change log names who really made the
 * write, and the message names who is speaking. `lib/records.ts` refuses a `sentBy` that is not the
 * writer for everybody else, and the opening is checked there rather than waived — the sender must
 * be Mole Office and the message must be addressed to a group.
 *
 * IT RETURNS NULL WHEN THE GROUP IS EMPTY. A group whose only member is the participant the line is
 * about — somebody leaving the last membership, say — has nobody left to read it, and a message in
 * no group at all is a line nobody can reach. That is a real state and not a failure, so nothing is
 * written and the caller is told nothing was.
 *
 * THE CHECK BELOW IS ABOUT WHETHER THE GROUP STILL HOLDS A MEMBER AT ALL, which is what makes the
 * line readable when somebody opens it.
 */
export function writeASystemLine(
  groupId: string,
  workspaceId: string,
  said: AnOfficeLine,
  by: Actor,
  about?: { run?: string; message?: string },
  /**
   * THE MEMBERS THIS LINE IS DELIVERED TO, when it is not every member. Problem 0WUuvB0IhRfb: the
   * dead-letter sweep's line is delivered only to the secretary named to take the dead letters, and
   * to nobody when nobody is named. The line is still in the group, and every member reads it there;
   * only the delivery rows, which wake a reader, are narrowed. Stored as `deliveredOnlyTo`, and read
   * by `whoAMessageIsTo` in lib/messages.ts. Absent means every member, as before.
   */
  deliveredOnlyTo?: readonly ParticipantRef[],
  /**
   * ANY OTHER DECLARED FIELD THE CALLER STORES ON THE LINE, such as the dead-letter sweep's own mark
   * `deadLetterSweep`. Each key must be a field the message kind declares, because the write is
   * checked against the declaration like any other.
   */
  besides?: Record<string, unknown>,
): { id: string } | null {
  if (membersOf(groupId).length === 0) return null
  const written = createRecord({
    workspaceId,
    kind: 'message',
    title: SYSTEM_LINE_TITLE,
    data: {
      body: said.line,
      notice: said.notice,
      // AND THE WHOLE SENTENCE BESIDE THE FEW WORDS, criterion M34. Both are stored, so a line
      // written today still carries the sentence it was written with; the panel draws the words and
      // hangs the sentence off them as hover text. Left out entirely where there is nothing more to
      // say, because an empty string there would read as a sentence nobody wrote.
      ...(said.said === null ? {} : { saidInFull: said.said }),
      toGroup: groupId,
      sentBy: moleOffice(),
      // WHICH RUN THIS LINE IS ABOUT, when it is about one. See `writeASystemLineToTwo` below for
      // what reads it and why it is on the line rather than beside it.
      ...(about?.run === undefined ? {} : { aboutRun: about.run }),
      ...(about?.message === undefined ? {} : { aboutMessage: about.message }),
      ...(deliveredOnlyTo === undefined ? {} : { deliveredOnlyTo: deliveredOnlyTo.map((one) => ({ kind: one.kind, id: one.id })) }),
      ...(besides ?? {}),
    },
    actor: by,
    senderIsMoleOffice: true,
  })
  return { id: written.id }
}

/**
 * WRITE ONE LINE AS MOLE OFFICE ITSELF, to one participant alone.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS BESIDE THE OTHER TWO
 * ---------------------------------------------------------------------------------------
 *
 * `writeASystemLine` speaks into a group; `writeASystemLineToTwo` speaks into the conversation
 * between two participants, because a line addressed to only one of a pair is drawn in no
 * conversation at all (`isBetween` in lib/messages.ts needs both sides). Until criterion M105 the
 * office could do neither of those AND could not address one participant on their own — F10's
 * reminder is the office telling one agent something with nobody else party to it, and this is the
 * door for that. `src/server/lib/records.ts` checks the opening the same way it checks the other
 * two: the sender must be Mole Office, and `to` must name exactly one participant.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT IS DRAWN
 * ---------------------------------------------------------------------------------------
 *
 * A message addressed to one participant is in that participant's own list of things said to them,
 * whichever screen reads it: `isBetween` treats Mole Office's line as reaching a "conversation"
 * once it has reached everybody it was sent to, and a single recipient is trivially everybody.
 *
 * `about` names the run the line is about, when there is one, for the same reason
 * `writeASystemLineToTwo` carries it: so later bookkeeping can ask *has this already been said*
 * by reading the conversation rather than storing a flag beside it.
 */
export function writeASystemLineToOne(
  to: ParticipantRef,
  workspaceId: string,
  said: AnOfficeLine,
  by: Actor,
  about?: { run?: string; message?: string },
  /**
   * ANY MARK THE CALLER NEEDS BESIDE THE LINE, in the declared `extra` bag. The M94 notice keeps
   * the cause it folded and the run ids it named here, which is how the sweep tells a later tick
   * whether it has already said this cause's notice inside the hour without storing a flag
   * somewhere that could disagree with the message itself.
   */
  extra?: Record<string, unknown>,
  /**
   * WHERE THIS LINE OFFERS TO TAKE THE READER, the same shape a message's own `lead` field takes
   * (`leadOfRecord` in shared/messages.ts is what reads it back). Optional and absent for every
   * line that only reports something happened. A take opens a conversation with the one
   * responsible for a task and carries a lead to it, so the responsible one is taken there in one
   * press rather than given an id to find (criterion F16, point 4) — that is the first caller of
   * this parameter, and it is a new, additive, optional argument so every earlier caller of this
   * function is unaffected.
   */
  lead?: unknown,
): { id: string } {
  const written = createRecord({
    workspaceId,
    kind: 'message',
    title: SYSTEM_LINE_TITLE,
    data: {
      body: said.line,
      notice: said.notice,
      ...(said.said === null ? {} : { saidInFull: said.said }),
      to: [to],
      sentBy: moleOffice(),
      ...(about?.run === undefined ? {} : { aboutRun: about.run }),
      ...(about?.message === undefined ? {} : { aboutMessage: about.message }),
      ...(extra === undefined ? {} : { extra }),
      ...(lead === undefined ? {} : { lead }),
    },
    actor: by,
    senderIsMoleOffice: true,
  })
  return { id: written.id }
}

/**
 * WRITE ONE LINE AS MOLE OFFICE ITSELF, TO SEVERAL AGENTS AT ONCE. When the person marks a checklist item done, the
 * office tells whoever added it or the agents the item names, in one message to all of them. It is one message, so
 * each agent reads the same words and the item keeps one message id.
 * Agents only: the rule in lib/records.ts refuses a person among three or more, because a line drawn in a person's
 * conversations has to reach one conversation.
 */
export function writeASystemLineToAgents(
  agents: readonly ParticipantRef[],
  workspaceId: string,
  said: AnOfficeLine,
  by: Actor,
  about?: { message?: string },
): { id: string } {
  const written = createRecord({
    workspaceId,
    kind: 'message',
    title: SYSTEM_LINE_TITLE,
    data: {
      body: said.line,
      notice: said.notice,
      ...(said.said === null ? {} : { saidInFull: said.said }),
      to: [...agents],
      sentBy: moleOffice(),
      ...(about?.message === undefined ? {} : { aboutMessage: about.message }),
    },
    actor: by,
    senderIsMoleOffice: true,
  })
  return { id: written.id }
}

/**
 * WRITE ONE LINE AS MOLE OFFICE ITSELF, into the conversation between two participants.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS BESIDE THE ONE ABOVE
 * ---------------------------------------------------------------------------------------
 *
 * Until 4 September 2026 Mole Office could only say something in a GROUP. A conversation between one
 * person and one agent had nowhere for the product to speak, and `tellTheGroupTheAgentsAreWaiting`
 * in lib/worker.ts says so in its own name: *Nothing is written for a pair.* Criteria M22 and M24
 * both ask for a line in exactly that kind of conversation — a run waited for the next message and
 * none came, a restart cut a run off — so this is the door for them.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS ADDRESSED TO BOTH SIDES, AND THAT IS WHAT PUTS IT IN THEIR CONVERSATION
 * ---------------------------------------------------------------------------------------
 *
 * `isBetween` in lib/messages.ts draws a line Mole Office wrote in a conversation when it reached
 * both of the people in it. So the two participants here are the two sides, and nothing else works:
 * a line addressed to one of them would appear in no conversation at all, which is where a line
 * addressed to one person by Mole Office went before this existed.
 *
 * `about` names the run the line is about, when there is one. It is what lets the worker's own
 * bookkeeping ask *has this run's ending already been said* by looking at the conversation rather
 * than by storing a flag beside it — the same reason `tellTheGroupTheAgentsAreWaiting` looks for its
 * own words instead of writing one down.
 */
export function writeASystemLineToTwo(
  two: readonly [ParticipantRef, ParticipantRef],
  workspaceId: string,
  said: AnOfficeLine,
  by: Actor,
  about?: { run?: string; message?: string },
): { id: string } {
  const written = createRecord({
    workspaceId,
    kind: 'message',
    title: SYSTEM_LINE_TITLE,
    data: {
      body: said.line,
      notice: said.notice,
      ...(said.said === null ? {} : { saidInFull: said.said }),
      to: [two[0], two[1]],
      sentBy: moleOffice(),
      ...(about?.run === undefined ? {} : { aboutRun: about.run }),
      ...(about?.message === undefined ? {} : { aboutMessage: about.message }),
    },
    actor: by,
    senderIsMoleOffice: true,
  })
  return { id: written.id }
}

/**
 * OPEN A GROUP AND WRITE THE LINE SAYING SO. The one door everything else uses.
 *
 * Two writes and not one transaction, because a message is a record and a record write opens its own
 * transaction. What that costs: a crash between them leaves a group with no opening line. The group
 * is the thing that matters and it is written first, so what survives is a group whose reason is on
 * its own row — `opened_because` — rather than a line about a group that is not there.
 */
export function openAGroupAndSayWhy(input: OpenAGroup, by: Actor): GroupOnTheWire {
  const group = openAGroup(input)
  writeASystemLine(group.id, input.workspaceId, SYSTEM_LINES.groupOpened(group.name, group.openedBecause), by)
  return theGroupOrARefusal(group.id, EVERY_PROJECT)
}

/**
 * ADD A MEMBER, WHOSE REASON IS STORED ON ITS OWN ROW.
 *
 * THE LINE SAYING SO IS GONE, on the person's words of 14 September 2026. `joined_because` on the membership
 * row already says why, `joined_at` already says when, and the members panel draws both — a message
 * repeating them was one fact written twice, and every message is a model wake for somebody. Nothing
 * new is recorded: the same two columns carry the same two facts they always did.
 *
 * THE ACTOR IS NO LONGER TAKEN. There is no message to attribute, so there is nothing for a writer
 * to name; the membership row itself is the record.
 */
export function addAMemberAndSayWhy(groupId: string, who: ParticipantRef, because: string): GroupOnTheWire {
  return addAMember(groupId, who, because)
}

/** Take somebody out and write the line saying so, in the group's own project. */
export function takeOutAndSayWhy(
  groupId: string,
  who: ParticipantRef,
  by: Actor,
  asWhom: ParticipantRef,
): GroupOnTheWire {
  const group = takeOutOfTheGroup(groupId, who, asWhom)
  writeASystemLine(groupId, group.workspaceId, SYSTEM_LINES.memberLeft(nameOf(who)), by)
  return group
}
