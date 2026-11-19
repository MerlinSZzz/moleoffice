// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GROUPS OVER HTTP.
 *
 *   GET  /api/groups                      every group in this project, with who is in each
 *   GET  /api/groups/:id                  one group and everything said in it
 *   POST /api/groups                      open one
 *   POST /api/groups/:id/members          put somebody in it
 *   POST /api/groups/:id/members/remove   take somebody out of it, or leave it yourself
 *
 * WRITING A MESSAGE INTO A GROUP IS NOT HERE. A message is a record, so it is written at
 * POST /api/records with kind "message" and `toGroup` inside `data`, set to the group's id, exactly
 * as a message to a person is written with `to` there. theBodyThatWritesAMessage in
 * src/shared/messages.ts builds the whole body. A second write door would be a second set of rules
 * about somebody's own words.
 *
 * THE RULES ARE IN src/server/lib/groups.ts, beside the refusals that name them. Nothing here
 * repeats one.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PARTICIPANT_KINDS, theMoleOfficeTest, type ParticipantRef } from '@shared/participants.ts'
import { GROUP_WORDS, SECRETARIAT_GROUP_KEY, type GroupMemberOnTheWire } from '@shared/groups.ts'
import { participantKey, theBodyThatWritesAMessage, theProjectsOfAConversation } from '@shared/messages.ts'
import { PAGE_SHAPE, PAGE_SHAPE_REFUSAL, aGroupRowForThePage } from '@shared/short-lists.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { EVERY_PROJECT } from '@shared/which-projects.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { announce } from '../lib/events.ts'
import {
  addAMemberAndSayWhy,
  groupsFor,
  handleOf,
  groupsIn,
  openAGroupAndSayWhy,
  takeOutAndSayWhy,
  theGroupOrARefusal,
} from '../lib/groups.ts'
import {
  messagesInAGroup,
  messagesInEachGroup,
  recordThatSomebodyRead,
  anythingUnreadInAGroup,
  anythingUnreadAmong,
  unreadInAGroup,
  unreadAmong,
  whenTheyLastRead,
  messagesSentToGroups,
  onlyTheMessagesThisReaderMayRead,
  theMessageReader,
} from '../lib/messages.ts'
import { whyReadingSomebodyElsesIsRefused } from '@shared/why-reading-somebody-elses-is-refused.ts'

// ============================================================================ the sentences

const LIST_NOTE =
  'EVERY GROUP IN THIS PROJECT, newest first, each with the participants in it now. A group is a ' +
  'conversation with several subscribers: a message addressed to one goes to every member of it, as one message ' +
  'with one delivery mark per member. `yours` says which of them you are in. Some were opened by hand and some ' +
  'were opened by two work claims overlapping, and the sentence on each says which. `unread` on each is how many ' +
  'of its messages you have not said you read — a line Mole Office wrote is not one of them, criterion M33, and ' +
  '`anythingUnread` beside it is true when anything is unread INCLUDING such a line, which is what makes the row ' +
  'bold without putting a number on it. `unread` is counted by the same rule every other unread number in this ' +
  'product uses. ?shape=page answers the same groups with only what the chat draws of each: its id, name, opener, ' +
  'the two unread fields, whether it is pinned, and each member\'s `who`. Left out, every row is whole.'

const READ_NOTE =
  'ONE GROUP AND EVERYTHING SAID IN IT, oldest first, with who is in it now and how many of the messages you ' +
  'have not read. A person may read a group they are not in, which is criterion M12 applied to groups, and that ' +
  'read is recorded on a table that is kept. An agent reads only the groups it is in.'

const OPEN_NOTE =
  'OPEN A GROUP. Any participant may open one. It takes the name a reader sees, one plain sentence saying why, ' +
  'and the members it starts with, each with its own sentence saying why they are in it. Mole Office writes one ' +
  'line into the new group saying it was opened, and one per member saying they were added. Sending into it is ' +
  'POST /api/records with ' +
  theBodyThatWritesAMessage({ toGroup: '<the id this returns>' }, '<what you say>') +
  '.'

const ADD_NOTE =
  'PUT SOMEBODY IN A GROUP. Any participant may add anybody, with one plain sentence saying why. Mole Office ' +
  'writes the line saying so. Somebody already in it is refused rather than added twice.'

const REMOVE_NOTE =
  'TAKE SOMEBODY OUT OF A GROUP. Anybody may take themselves out. A person may take an agent out. An agent may ' +
  'take nobody else out, and an agent reaching for a person is refused with the rule saying why: a conflict ' +
  'between two agents is exactly the moment a person must not be removable by one of them. The membership row is ' +
  'kept and marked as ended, so that somebody reading the group later can still see who was in it and when.'

// ============================================================================ what a caller sends

const whichGroup = z.object({ id: z.string().min(1) })

const aParticipant = z.object({
  kind: z.enum(PARTICIPANT_KINDS),
  id: z.string().min(1),
})

const openBody = z.object({
  name: z.string(),
  because: z.string(),
  members: z.array(z.object({ who: aParticipant, because: z.string() })).default([]),
})

const memberBody = z.object({ who: aParticipant, because: z.string() })

const removeBody = z.object({ who: aParticipant })

const asSide = z.object({ as: z.string().min(1).optional() })

/** How much of each row the list answers. See `LIST_NOTE` and src/shared/short-lists.ts. */
const listShape = z.object({ shape: z.literal(PAGE_SHAPE, { error: PAGE_SHAPE_REFUSAL }).optional() })

/** Who is asking, as a participant, or a refusal saying how to become one. */
function whoIsAsking(req: Parameters<typeof actorFrom>[0]): ParticipantRef {
  const actor = actorFrom(req)
  const me = participantForActor(actor)
  if (me === null) {
    throw new PanelError(
      `Nothing in either registry answers to the ${actor.type} "${actor.id}", so there is no group that could be ` +
        'yours to open or to read. GET /api/participants lists every person and every durable agent. A durable ' +
        'agent is registered by filing a record of kind "agent" with the handle you write under.',
      403,
    )
  }
  return me
}

/**
 * THE MEMBER AS A GROUP STORES IT. A caller may name an agent by its id or by its handle, and a
 * membership stores the registry id, criterion I2. The one resolver decides which agent the name
 * means, and its refusal (two agents answer, or a write names a retired handle) is this door's
 * answer. A name nobody bears is passed on unchanged, and the group library refuses it in its own
 * sentence. A person is passed on unchanged.
 */
function theMemberAsStored(who: ParticipantRef): ParticipantRef {
  if (who.kind !== 'agent') return who
  const found = theAgentAnArrivingReferenceNames(who.id, 'writing')
  return found === null ? who : { kind: 'agent', id: found.agent.id }
}

/**
 * THE MEMBER A `?as=` VALUE NAMES, or undefined because it names nobody in the group. A person is
 * matched by id. An agent may be named by its id or its handle, so the one resolver says which agent
 * it is, criterion I2, and its refusal is this door's answer.
 */
function theMemberASideNames(members: readonly GroupMemberOnTheWire[], said: string): ParticipantRef | undefined {
  const person = members.find((member) => member.who.kind === 'person' && member.who.id === said)
  if (person !== undefined) return person.who
  const found = theAgentAnArrivingReferenceNames(said, 'reading')
  if (found === null) return undefined
  return members.find((member) => member.who.kind === 'agent' && member.who.id === found.agent.id)?.who
}

// ============================================================================ the routes

export async function groupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/groups', route('group.list', 'remote', LIST_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const asked = parse(listShape, req.query ?? {}, 'The shape asked for')
    const whole = everyGroupAsTheListCarriesIt(me, workspaceId)
    // THE PAGE'S SHORT LIST IS THE WHOLE LIST WITH FIELDS LEFT OUT. The same rows in the same order,
    // each cut by `aGroupRowForThePage`; nothing on a row is worked out a second way.
    if (asked.shape === PAGE_SHAPE) return { ...whole, groups: whole.groups.map(aGroupRowForThePage) }
    return whole
  })

  /** Every group with its two unread fields and its pinned mark, as the list door answers it. */
  function everyGroupAsTheListCarriesIt(me: ParticipantRef, workspaceId: string) {
    const groups = groupsIn(EVERY_PROJECT)
    let officeTest: ((who: ParticipantRef) => boolean) | undefined
    const isOffice = (who: ParticipantRef) => who.kind === 'agent' && (officeTest ??= theMoleOfficeTest())(who)
    // HOW MANY OF EACH GROUP'S MESSAGES THIS READER HAS NOT SAID THEY READ. It is here because the
    // number on the circle is the sum of the rows the panel draws (M19), and a group is one of
    // those rows. Without it a group message would be counted by the circle and shown on nothing.
    return {
      me,
      // EVERY PROJECT, BECAUSE A GROUP IS THE PERSON'S. Decision `t5DlN5-uTZoT`: a group follows the
      // conversations, which criterion M55 made the person's whichever project is open. Until this,
      // the circle added unread messages counted across every project to unread groups counted in
      // one, so the number was about two different things. Problem `m1ea9ihnnu9e`.
      // THE POOL IS READ ONCE FOR THE WHOLE LIST. Measured 11 September 2026 on an idle copy of the owner's
      // database (problem 9UeL9VeVPn33): this door took 3.3 to 3.6 seconds, because each of the two
      // counts below read every message of every project again for each of 27 groups — 54 reads of
      // one pool that answers the same for all of them. Read once here and handed down, it is the
      // same count from the same rows.
      // ONLY THE MESSAGES SENT TO THESE GROUPS ARE READ, because every use below keeps a group's own messages and
      // nothing else. They are the same entries in the same order as in every message of every project: 185 ms
      // before and 49 ms after on an office of 12,500 messages (wave 13y round 13).
      // THE POOL IS FILED BY GROUP ONCE, so the three questions below that ask for one group's own messages walk it
      // once between them instead of three times for each group.
      groups: ((pool) => {
        const filed = messagesInEachGroup(groups.map((one) => one.id), pool)
        return groups.map((one) => ({
          ...one,
          unread: unreadAmong(filed.get(one.id) ?? [], me, isOffice),
          // AND WHETHER ANYTHING IS UNREAD AT ALL, criterion M33, which is what makes the row bold. A
          // group whose only unread thing is the line saying it was opened has `unread` 0 and this
          // true: a system line left unread counts as much as a real message does.
          anythingUnread: anythingUnreadAmong(filed.get(one.id) ?? [], me),
          // WHETHER THIS IS THE OFFICE'S OWN STANDING GROUP. The list draws it in a category of its
          // own, first, so the row says which category it belongs to rather than the browser matching
          // on the name "Secretariat", which anybody can type on a group they opened. The key itself
          // stays on this side: the browser is told what the row is, not how the database spells it.
          pinned: one.about === SECRETARIAT_GROUP_KEY,
          // THE PROJECTS ITS MESSAGES WERE WRITTEN IN OR ARE MARKED ABOUT, latest first, by the rule every row of the
          // chat's one list is marked with.
          projects: theProjectsOfAConversation(filed.get(one.id) ?? []),
        }))
      })(messagesSentToGroups(groups.map((one) => one.id), EVERY_PROJECT)),
      yours: groupsFor(me, EVERY_PROJECT).map((one) => one.id),
      workspaceId,
    }
  }

  app.get('/groups/:id', route('group.read', 'remote', READ_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const asked = parse(whichGroup, req.params, 'The group asked about')
    const group = theGroupOrARefusal(asked.id, EVERY_PROJECT)
    const mine = group.members.some((member) => participantKey(member.who) === participantKey(me))
    // A PERSON MAY READ A GROUP THEY ARE NOT IN, AND AN AGENT MAY NOT. The same rule and the same
    // sentence as reading a conversation between two agents, because it is the same question:
    // criterion M12 gives a person the right to read what agents said to each other, and a group is
    // where two agents in conflict do it. `whyReadingSomebodyElsesIsRefused` is the one place it is
    // decided, so the two surfaces cannot come to different answers.
    if (!mine) {
      const because = whyReadingSomebodyElsesIsRefused(me)
      if (because !== null) throw new PanelError(because, 403)
    }
    // WHICH MEMBER'S SIDE IT IS BEING READ FROM. A group's messages are the same list whoever asks —
    // one message with several marks, not a copy each — so the side chooses whose delivery mark the
    // reader is shown, and nothing else. Left out, it is the reader's own side when they are in the
    // group, and the member who opened it when they are not.
    const side = parse(asSide, req.query ?? {}, 'The side to read it as')
    const chosen =
      side.as === undefined
        ? mine
          ? me
          : (group.members[0]?.who ?? group.openedBy)
        : theMemberASideNames(group.members, side.as)
    if (chosen === undefined) {
      throw new PanelError(
        `"${String(side.as)}" is not in this group, so it has no side to read it from. ` +
          `Read it as one of these members, by the id in brackets: ` +
          `${group.members.map((member) => `${handleOf(member.who)} (${member.who.id})`).join(', ')}.`,
        400,
      )
    }
    // WHEN THIS READER LAST OPENED IT, READ BEFORE THIS READ IS WRITTEN, for the reason the pair
    // route gives: otherwise the answer would be "you read this a moment ago".
    const before = mine ? null : whenTheyLastRead(me, group.id, EVERY_PROJECT)
    if (!mine) recordThatSomebodyRead(me, group.id, chosen, workspaceId)
    // THIS GROUP'S MESSAGES, READ ONCE FOR THE THREE QUESTIONS BELOW, and not every message of every
    // project. Reading the whole pool here made opening one group cost as much as the office's largest
    // read, and on 11 October 2026 that read was refused outright (round 48h of wave 13k).
    const pool = messagesSentToGroups([group.id], EVERY_PROJECT)
    return {
      group,
      me,
      /** True when the reader is one of the members, false when they are reading somebody else's. */
      yours: mine,
      asSide: chosen,
      // ONLY THE MESSAGES THIS READER MAY READ. A member that is not the owner
      // or a secretary reads what was sent while it was in the group, and not what was said before
      // it joined or after it left.
      messages: onlyTheMessagesThisReaderMayRead(theMessageReader(actorFrom(req)), messagesInAGroup(group.id, EVERY_PROJECT, pool)),
      unread: unreadInAGroup(group.id, me, EVERY_PROJECT, pool),
      anythingUnread: anythingUnreadInAGroup(group.id, me, EVERY_PROJECT, pool),
      readBefore: before,
      says: mine ? null : GROUP_WORDS.readingSomebodyElses,
      workspaceId,
    }
  })

  app.post('/groups', route('group.open', 'remote', OPEN_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const body = parse(openBody, req.body, 'The group to open')
    // EVERY MEMBER IS RESOLVED BEFORE THE GROUP IS OPENED, so a refusal of any one of them leaves no
    // group behind.
    const members = body.members.map((member) => ({ who: theMemberAsStored(member.who), because: member.because }))
    const group = openAGroupAndSayWhy(
      {
        workspaceId,
        name: body.name,
        openedBy: me,
        because: body.because,
        members,
      },
      actorFrom(req),
    )
    groupsChanged(workspaceId, group.id, `The group "${group.name}" was opened.`)
    reply.code(201)
    return { group, workspaceId }
  })

  app.post('/groups/:id/members', route('group.add-member', 'remote', ADD_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    whoIsAsking(req)
    const asked = parse(whichGroup, req.params, 'The group to add somebody to')
    const body = parse(memberBody, req.body, 'The member to add')
    const group = addAMemberAndSayWhy(asked.id, theMemberAsStored(body.who), body.because)
    groupsChanged(workspaceId, asked.id, `Somebody was added to the group "${group.name}".`)
    return { group, workspaceId }
  })

  app.post('/groups/:id/members/remove', route('group.remove-member', 'remote', REMOVE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const asked = parse(whichGroup, req.params, 'The group to take somebody out of')
    const body = parse(removeBody, req.body, 'The member to take out')
    const group = takeOutAndSayWhy(asked.id, theMemberAsStored(body.who), actorFrom(req), me)
    groupsChanged(workspaceId, asked.id, `Somebody was taken out of the group "${group.name}".`)
    return { group, workspaceId }
  })
}

/**
 * TELL EVERY PAGE THAT THE GROUPS CHANGED: one opened, or its members changed.
 *
 * Every page draws the list of groups, and which groups a reader is in decides the second half of the
 * number on the circle, so the contacts are named too. A page showing this group reads it again. The
 * list is read rather than sent as rows because these writes are rare.
 */
function groupsChanged(workspaceId: string, groupId: string, because: string): void {
  announce({ name: 'list.changed', workspaceId, lists: ['groups', 'contacts'], about: null, groupId, because })
}
