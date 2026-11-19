// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GROUPS: A CONVERSATION WITH SEVERAL SUBSCRIBERS, AND THE LINES MOLE OFFICE WRITES INTO ONE.
 *
 * Criterion M11 of design/messages/ACCEPTANCE.md: *A conversation may have several subscribers; a
 * message to it goes to all of them. A conflict between two agents (M13) opens a group with the
 * owner in it, without anybody asking. Any participant may open a group. Mole Office itself is a
 * participant with a fixed avatar that writes only system lines (a group opened, a member added, a
 * claim in conflict), so those lines have a sender and are not faked as an agent's.*
 *
 * So a group is one message pool with several subscribers, and what one agent sends goes to every member.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, expectPanelError, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import {
  HANDLE_BELONGS_TO_MOLE_OFFICE,
  defaultAvatarAssetId,
  moleOffice,
  MOLE_OFFICE_HANDLE,
  MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE,
  MOLE_OFFICE_NAME,
  isMoleOffice,
  type ParticipantRef,
} from '../src/shared/participants.ts'
import {
  AN_AGENT_MAY_NOT_REMOVE_A_PERSON,
  AN_AGENT_MAY_ONLY_REMOVE_ITSELF,
  A_MESSAGE_GOES_TO_A_GROUP_OR_TO_PEOPLE,
  NOBODY_IS_IN_THAT_GROUP,
  SYSTEM_LINES,
  YOU_ARE_NOT_IN_THAT_GROUP,
} from '../src/shared/groups.ts'
import { NOTHING_ANSWERS_FOR_MOLE_OFFICE, participantKey } from '../src/shared/messages.ts'

type GroupsLib = typeof import('../src/server/lib/groups.ts')
type MessagesLib = typeof import('../src/server/lib/messages.ts')
type KnownParticipant = import('../src/server/lib/messages.ts').KnownParticipant
type ParticipantsLib = typeof import('../src/server/lib/participants.ts')
type BackfillLib = typeof import('../src/server/db/message-delivery-migration.ts')

let t: TestDb
let team: GroupsLib
let pool: MessagesLib
let who: ParticipantsLib
let backfill: BackfillLib

const OWNER: ParticipantRef = { kind: 'person', id: THE_PERSON }
/**
 * THE TWO AGENTS, BY THE ID THE REGISTRY GAVE EACH. An agent's id is not its handle: registering it
 * gives it an id of its own. So these are filled in by `beforeEach`, after the two are registered.
 */
let BUILDER: ParticipantRef
let CHECKER: ParticipantRef

/**
 * A REGISTRY ROW FOR A TEST, from a ref alone.
 *
 * `contactsFor` needs the handle and the name since criterion M25, because a message whose writer
 * typed a `from` line and claimed nobody belongs under that writer until somebody registers under
 * the same name. These tests only ever match on the id, so this row puts the id in the handle and the
 * name as well. The real handle is different, and nothing here reads it.
 */
function known(who: ParticipantRef): KnownParticipant {
  return { who, name: who.id, handle: who.id }
}

type AsAnAgent = { type: 'agent'; id: string }
const HUMAN = { type: 'human', id: THE_PERSON } as const
let AS_BUILDER: AsAnAgent
let AS_CHECKER: AsAnAgent

beforeEach(async () => {
  t = await freshDb()
  team = await import('../src/server/lib/groups.ts')
  pool = await import('../src/server/lib/messages.ts')
  who = await import('../src/server/lib/participants.ts')
  backfill = await import('../src/server/db/message-delivery-migration.ts')
  // A GROUP NAMES ITS PROJECT AND THE COLUMN REFERENCES `workspaces`, so the project has to exist
  // before one can be opened. A record does not need the row — `records.workspace_id` has no
  // reference — which is why the other message tests never declare one.
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'panelx', title: 'Mole Office' })
  for (const [handle, title] of [
    ['builder-x', 'Builder X'],
    ['checker-y', 'Checker Y'],
  ] as const) {
    t.api.createRecord({
      workspaceId: 'panelx',
      kind: 'agent',
      title,
      data: { handle, runtime: 'claude-code', state: 'active' },
      actor: HUMAN,
    })
  }
  const idOf = (handle: string) =>
    (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  BUILDER = { kind: 'agent', id: idOf('builder-x') }
  CHECKER = { kind: 'agent', id: idOf('checker-y') }
  AS_BUILDER = { type: 'agent', id: BUILDER.id }
  AS_CHECKER = { type: 'agent', id: CHECKER.id }
})

afterEach(() => {
  t.close()
})

/** A group with the three of them in it, opened by the builder. */
function aGroupOfThree() {
  return team.openAGroupAndSayWhy(
    {
      workspaceId: 'panelx',
      name: 'The gripper module',
      openedBy: BUILDER,
      because: 'Two of us are changing the same file and the owner should see it.',
      members: [
        { who: BUILDER, because: 'It opened the group.' },
        { who: CHECKER, because: 'It is working on the same file.' },
        { who: OWNER, because: 'A conflict between two agents is the person’s to see.' },
      ],
    },
    AS_BUILDER,
  )
}

/** One message into a group, written the way anything writes one: as a record. */
function sayInTheGroup(groupId: string, body: string, actor: typeof HUMAN | AsAnAgent) {
  return t.api.createRecord({
    workspaceId: 'panelx',
    kind: 'message',
    title: body.slice(0, 40),
    data: { body, toGroup: groupId },
    actor,
  })
}

// ============================================================ Mole Office is a participant

describe('Mole Office itself is a participant, and it is not an agent somebody runs', () => {
  it('has a registry row with a name, a picture and no runtime', () => {
    const row = who.readParticipant(moleOffice())
    expect(row).not.toBeNull()
    expect(row?.name).toBe(MOLE_OFFICE_NAME)
    expect(row?.avatarAssetId).toBe(defaultAvatarAssetId(moleOffice()))
    expect((row as { runtime?: string | null }).runtime ?? null).toBeNull()
    expect((row as { retired?: boolean }).retired).toBe(false)
    expect(isMoleOffice(moleOffice())).toBe(true)
    expect(isMoleOffice(BUILDER)).toBe(false)
  })

  it('cannot be renamed or given a new picture, by an agent or by the owner', () => {
    for (const by of [BUILDER, OWNER]) {
      const refused = expectPanelError(t, () => who.setParticipantName(moleOffice(), 'Something else', by), 403)
      expect(refused.message).toBe(MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE)
    }
    expect(who.readParticipant(moleOffice())?.name).toBe(MOLE_OFFICE_NAME)
  })

  it('cannot be retired, because no agent record may take its handle', () => {
    // THE ONLY DOOR TO THE `retired` COLUMN is an agent record whose state says retired, mapped onto
    // a registry row by its handle. Refusing the handle is what closes it, and the refusal names the
    // reason rather than saying the handle is taken.
    const refused = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: 'panelx',
          kind: 'agent',
          title: 'A pretender',
          data: { handle: MOLE_OFFICE_HANDLE, runtime: 'claude-code', state: 'retired' },
          actor: AS_BUILDER,
        }),
      409,
    )
    expect(refused.message).toBe(HANDLE_BELONGS_TO_MOLE_OFFICE)
    expect(who.readParticipant(moleOffice())).not.toBeNull()
    expect((who.readParticipant(moleOffice()) as { retired?: boolean }).retired).toBe(false)
  })

  it('is never mapped onto by a record that got past the door, so nothing can retire it that way', () => {
    // THE DOOR IS ONE HALF AND THE REGISTRY IS THE OTHER. An imported record is written with
    // hand-built SQL and passes through no gate, so `assertHandleIsFree` above never sees it.
    // `keepTheAgentRegistryInStep` is what would map it onto a registry row, and it reads the same
    // declaration — so a record holding this handle is left unmapped and Mole Office's row is
    // untouched. Both halves read `whyHandleIsRefused`, so the rule is written once.
    who.keepTheAgentRegistryInStep(
      {
        id: 'importedxyz1',
        title: 'An imported pretender',
        handle: MOLE_OFFICE_HANDLE,
        runtime: 'claude-code',
        state: 'retired',
        retiredBecause: 'Taken out of use.',
      },
      OWNER,
    )
    const row = who.readParticipant(moleOffice())
    expect(row?.name).toBe(MOLE_OFFICE_NAME)
    expect((row as { retired?: boolean }).retired).toBe(false)
    expect(who.agentForRecord('importedxyz1')).toBeNull()
  })

  it('cannot be written to, because nothing is running to read a reply', () => {
    const refused = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: 'panelx',
          kind: 'message',
          title: 'Hello?',
          data: { body: 'Are you there?', to: [moleOffice()] },
          actor: HUMAN,
        }),
      400,
    )
    expect(refused.message).toBe(NOTHING_ANSWERS_FOR_MOLE_OFFICE)
  })

  it('is not offered as somebody to write to', () => {
    const everyone = [OWNER, BUILDER, CHECKER, moleOffice()].map(known)
    const named = pool
      .contactsFor(OWNER, everyone, pool.justThisProject('panelx'))
      .flatMap((one) => (one.who === null ? [] : [participantKey(one.who)]))
    expect(named).not.toContain(participantKey(moleOffice()))
    expect(named.sort()).toEqual([participantKey(BUILDER), participantKey(CHECKER)].sort())
  })
})

// ============================================================ M11: a message reaches every member

describe('a message to a group goes to every member of it', () => {
  it('writes one delivery row per member and none for the sender', () => {
    const group = aGroupOfThree()
    const said = sayInTheGroup(group.id, 'I am holding the sweep until you answer.', AS_BUILDER)
    const rows = pool.deliveriesOf(said.id)
    expect(rows.map((one) => participantKey(one.to)).sort()).toEqual(
      [participantKey(CHECKER), participantKey(OWNER)].sort(),
    )
    expect(rows.every((one) => one.mark === 'queued')).toBe(true)
    expect(rows.map((one) => participantKey(one.to))).not.toContain(participantKey(BUILDER))
  })

  it('is one message and not one per member, so everybody reads the same words', () => {
    const group = aGroupOfThree()
    sayInTheGroup(group.id, 'One set of words.', AS_BUILDER)
    const inTheGroup = pool.messagesInAGroup(group.id, pool.EVERY_PROJECT).filter((one) => one.body === 'One set of words.')
    expect(inTheGroup).toHaveLength(1)
    expect(inTheGroup[0]?.deliveries).toHaveLength(2)
  })

  it('says which group it went to, so a reader can tell it from a message to one person', () => {
    const group = aGroupOfThree()
    const said = sayInTheGroup(group.id, 'To the group.', AS_BUILDER)
    expect(pool.readMessage(said.id, 'panelx').toGroup).toBe(group.id)
  })

  it('keeps a group message out of the private conversation with the sender', () => {
    const group = aGroupOfThree()
    sayInTheGroup(group.id, 'Everybody can read this.', AS_BUILDER)
    const between = pool.conversationBetween(OWNER, BUILDER, pool.justThisProject('panelx'))
    expect(between.messages.map((one) => one.body)).not.toContain('Everybody can read this.')
    expect(pool.messagesInAGroup(group.id, pool.EVERY_PROJECT).map((one) => one.body)).toContain('Everybody can read this.')
  })

  it('is not read as a conversation between two agents, because a group is not a pair', () => {
    const group = aGroupOfThree()
    sayInTheGroup(group.id, 'To all three of us.', AS_BUILDER)
    // THE TWO AGENTS ARE BOTH IN THIS GROUP AND HAVE SAID NOTHING TO EACH OTHER. Reading a message
    // to three people as a conversation between each two of them would invent a conversation nobody
    // had, and the owner would then be offered it to read from either side.
    expect(pool.conversationsBetweenAgents(pool.justThisProject('panelx'))).toEqual([])
  })

  it('is drawn under the group and never as a contact of its own, because it is in a conversation', () => {
    // THERE USED TO BE A BOARD and this test read it. Criterion M25 removed it: every message is in
    // a conversation, and the only rows a contact list holds now are registered participants and
    // writers nobody registered. A group message must be neither.
    const group = aGroupOfThree()
    sayInTheGroup(group.id, 'Not a contact of its own.', AS_BUILDER)
    const everyone = [OWNER, BUILDER, CHECKER, moleOffice()].map(known)
    const lines = pool.contactsFor(OWNER, everyone, pool.justThisProject('panelx'))
    expect(lines.filter((one) => one.who === null)).toEqual([])
    expect(lines.map((one) => one.last?.body)).not.toContain('Not a contact of its own.')
    expect(pool.messagesInAGroup(group.id, pool.EVERY_PROJECT).map((one) => one.body)).toContain('Not a contact of its own.')
  })

  it('is never stamped as a message whose recipients a migration worked out', () => {
    // A GROUP MESSAGE LEAVES `to` OUT, because the delivery rows are the only copy of who it reached.
    // The backfill that stamps `inferred_by` looks for a message that names nobody, and without a
    // second clause it would call every group message one whose recipient Mole Office guessed —
    // which is a false claim about somebody's own writing. Found on a scratch stack on 4 September.
    const group = aGroupOfThree()
    const said = sayInTheGroup(group.id, 'Nobody guessed who this went to.', AS_BUILDER)
    // THE BACKFILL IS RUN, not assumed not to have run. It runs on every migrate, so a database
    // migrated after a group message was written meets it.
    backfill.stampWhatWasInferred(t.client.sqlite)
    const stamp = t.client.sqlite
      .prepare('SELECT inferred_by AS by FROM message_delivery WHERE message_id = ?')
      .all(said.id) as { by: string | null }[]
    expect(stamp.length).toBeGreaterThan(0)
    expect(stamp.every((one) => one.by === null)).toBe(true)
  })

  it('refuses a group nobody is in, because the message would reach nobody', () => {
    const empty = team.openAGroup({
      workspaceId: 'panelx',
      name: 'Nobody yet',
      openedBy: BUILDER,
      because: 'Opened before anybody was added.',
      members: [],
    })
    const refused = expectPanelError(t, () => sayInTheGroup(empty.id, 'Anybody there?', AS_BUILDER), 400)
    expect(refused.message).toBe(NOBODY_IS_IN_THAT_GROUP)
  })

  it('refuses a group id this project does not hold, naming what to read instead', () => {
    const refused = expectPanelError(t, () => sayInTheGroup('nosuchgroup1', 'Hello.', AS_BUILDER), 400)
    expect(refused.message).toContain('nosuchgroup1')
    expect(refused.message).toContain('GET /api/groups')
  })

  it('refuses somebody who is not in the group', () => {
    const group = team.openAGroupAndSayWhy(
      {
        workspaceId: 'panelx',
        name: 'Two of us',
        openedBy: BUILDER,
        because: 'Two of us are on this.',
        members: [
          { who: BUILDER, because: 'It opened the group.' },
          { who: OWNER, because: 'The person asked to be in it.' },
        ],
      },
      AS_BUILDER,
    )
    const refused = expectPanelError(t, () => sayInTheGroup(group.id, 'Let me in.', AS_CHECKER), 400)
    expect(refused.message).toBe(YOU_ARE_NOT_IN_THAT_GROUP)
  })

  it('refuses a message addressed to a group and to people at the same time', () => {
    const group = aGroupOfThree()
    const refused = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: 'panelx',
          kind: 'message',
          title: 'Both',
          data: { body: 'Both ways.', toGroup: group.id, to: [OWNER] },
          actor: AS_BUILDER,
        }),
      400,
    )
    expect(refused.message).toBe(A_MESSAGE_GOES_TO_A_GROUP_OR_TO_PEOPLE)
  })
})

// ============================================================ M11: who may do what

describe('who may open a group, add to it and leave it', () => {
  it('lets any participant open one and put people in it', () => {
    const byAnAgent = aGroupOfThree()
    expect(byAnAgent.members).toHaveLength(3)
    const byThePerson = team.openAGroupAndSayWhy(
      {
        workspaceId: 'panelx',
        name: 'The person’s own',
        openedBy: OWNER,
        because: 'The person wanted the two of them in one place.',
        members: [
          { who: OWNER, because: 'The person opened it.' },
          { who: BUILDER, because: 'The agent asked to be here.' },
        ],
      },
      HUMAN,
    )
    expect(byThePerson.members).toHaveLength(2)
    expect(team.groupsIn(pool.EVERY_PROJECT)).toHaveLength(2)
  })

  it('lets a person leave, and keeps the row saying they were in it', () => {
    const group = aGroupOfThree()
    const after = team.takeOutAndSayWhy(group.id, OWNER, HUMAN, OWNER)
    expect(after.members.map((one) => participantKey(one.who))).not.toContain(participantKey(OWNER))
    expect(after.members).toHaveLength(2)
    // THE MEMBERSHIP IS KEPT AND MARKED AS ENDED, so a month later somebody can still see the owner was in
    // it. `membersOf` returns who is in it now; the row is still in the table.
    const rows = t.client.sqlite
      .prepare('SELECT member_id, left_at FROM group_members WHERE group_id = ? AND member_id = ?')
      .all(group.id, THE_PERSON) as { member_id: string; left_at: string | null }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.left_at).not.toBeNull()
  })

  it('refuses an agent taking a person out, with the rule saying why', () => {
    const group = aGroupOfThree()
    const refused = expectPanelError(t, () => team.takeOutAndSayWhy(group.id, OWNER, AS_BUILDER, BUILDER), 403)
    expect(refused.message).toBe(AN_AGENT_MAY_NOT_REMOVE_A_PERSON)
    expect(team.membersOf(group.id).map((one) => participantKey(one.who))).toContain(participantKey(OWNER))
  })

  it('refuses one agent taking another out, and lets it take itself out', () => {
    const group = aGroupOfThree()
    const refused = expectPanelError(
      t,
      () => team.takeOutAndSayWhy(group.id, CHECKER, AS_BUILDER, BUILDER),
      403,
    )
    expect(refused.message).toBe(AN_AGENT_MAY_ONLY_REMOVE_ITSELF)
    const after = team.takeOutAndSayWhy(group.id, CHECKER, AS_CHECKER, CHECKER)
    expect(after.members.map((one) => participantKey(one.who))).not.toContain(participantKey(CHECKER))
  })

  it('lets a person take an agent out', () => {
    const group = aGroupOfThree()
    const after = team.takeOutAndSayWhy(group.id, CHECKER, HUMAN, OWNER)
    expect(after.members.map((one) => participantKey(one.who))).not.toContain(participantKey(CHECKER))
  })

  it('refuses one participant in a group twice, at the door and at the database', () => {
    const group = aGroupOfThree()
    const refused = expectPanelError(
      t,
      () => team.addAMemberAndSayWhy(group.id, CHECKER, 'Again.'),
      400,
    )
    expect(refused.message).toContain('already in that group')
    // AND THE DATABASE REFUSES IT TOO, so the rule holds even if a caller ever got past the door.
    expect(() =>
      t.client.sqlite
        .prepare(
          'INSERT INTO group_members (id, group_id, member_kind, member_id, joined_at, joined_because, left_at) ' +
            "VALUES ('twiceoverxyz', ?, 'agent', ?, '2026-09-04 07:00:00', 'By hand.', NULL)",
        )
        .run(group.id, CHECKER.id),
    ).toThrow(/UNIQUE/)
  })

  it('lets somebody who left join again, and keeps both rows', () => {
    const group = aGroupOfThree()
    team.takeOutAndSayWhy(group.id, CHECKER, AS_CHECKER, CHECKER)
    const after = team.addAMemberAndSayWhy(group.id, CHECKER, 'It came back to the same file.')
    expect(after.members.map((one) => participantKey(one.who))).toContain(participantKey(CHECKER))
    const rows = t.client.sqlite
      .prepare('SELECT id FROM group_members WHERE group_id = ? AND member_id = ?')
      .all(group.id, CHECKER.id)
    expect(rows).toHaveLength(2)
  })
})

// ============================================================ M11: the system lines

describe('Mole Office writes the lines saying what happened, and they are not an agent speaking', () => {
  it('writes a line when a group is opened and no line per member, whose reason is on its own row', () => {
    const group = aGroupOfThree()
    const said = pool.messagesInAGroup(group.id, pool.EVERY_PROJECT)
    expect(said.every((one) => one.sentBy !== null && isMoleOffice(one.sentBy))).toBe(true)
    expect(said).toHaveLength(1)
    expect(said[0]?.body).toBe(
      SYSTEM_LINES.groupOpened('The gripper module', 'Two of us are changing the same file and the owner should see it.')
        .line,
    )
    // THE JOIN IS NOT A MESSAGE. The membership row already carries
    // `joined_at` and `joined_because`, and the members panel draws them, so a message repeating them
    // was one fact written twice — and a model wake every time somebody joined a group.
    expect(said.map((one) => one.body)).not.toContain(
      SYSTEM_LINES.memberAdded('Checker Y', 'It is working on the same file.').line,
    )
    expect(group.members.map((one) => one.joinedBecause)).toContain('It is working on the same file.')
    expect(group.members.every((one) => one.joinedAt.length > 0)).toBe(true)
  })

  it('writes a line when somebody is added later, and one when somebody leaves', () => {
    const group = team.openAGroupAndSayWhy(
      {
        workspaceId: 'panelx',
        name: 'Two of us',
        openedBy: BUILDER,
        because: 'Two of us are on this.',
        members: [
          { who: BUILDER, because: 'It opened the group.' },
          { who: OWNER, because: 'The person asked to be in it.' },
        ],
      },
      AS_BUILDER,
    )
    team.addAMemberAndSayWhy(group.id, CHECKER, 'It is on the same file.')
    team.takeOutAndSayWhy(group.id, CHECKER, AS_CHECKER, CHECKER)
    const bodies = pool.messagesInAGroup(group.id, pool.EVERY_PROJECT).map((one) => one.body)
    // A JOIN WRITES NO MESSAGE NOW; A LEAVE STILL DOES, because a leave is not stored on a row the
    // panel still draws — the membership is gone.
    expect(bodies).not.toContain(SYSTEM_LINES.memberAdded('Checker Y', 'It is on the same file.').line)
    expect(bodies).toContain(SYSTEM_LINES.memberLeft('Checker Y').line)
  })

  it('addresses nobody: every system line states what happened and asks for nothing', () => {
    // SECTION 7.5 NAMES THIS AS THE OWNER'S QUESTION, filed as proposal `gGUxEiMa2bgw`. Until the owner
    // answers it these lines speak to no one, which is the narrower of the two readings. The test is
    // the words themselves: no second person anywhere in any of them.
    const group = aGroupOfThree()
    team.takeOutAndSayWhy(group.id, CHECKER, AS_CHECKER, CHECKER)
    // BOTH HALVES OF EVERY LINE, since criterion M34 split them: the few words the block draws and
    // the sentence hung off it as hover text. Checking only the body would quietly narrow this test
    // to the half that is now three words long.
    const conflict = SYSTEM_LINES.claimsInConflict('the gripper module', 'builder-x', 'checker-y')
    const every = [
      ...pool.messagesInAGroup(group.id, pool.EVERY_PROJECT).flatMap((one) => [one.body, one.saidInFull ?? '']),
      conflict.line,
      conflict.said ?? '',
      SYSTEM_LINES.agentsAreWaitingForAPerson.line,
      SYSTEM_LINES.agentsAreWaitingForAPerson.said,
    ]
    for (const line of every) {
      expect(line).not.toMatch(/\byou\b|\byour\b|\byours\b/i)
    }
  })

  it('refuses anybody but Mole Office to write a line as Mole Office', () => {
    const group = aGroupOfThree()
    const refused = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: 'panelx',
          kind: 'message',
          title: 'Mole Office',
          data: { body: 'A group was opened.', toGroup: group.id, sentBy: moleOffice() },
          actor: AS_BUILDER,
        }),
      400,
    )
    expect(refused.message).toContain('sent by')
  })

  it('names the actor whose request caused the line, so nothing about who wrote it is hidden', () => {
    const group = aGroupOfThree()
    const first = pool.messagesInAGroup(group.id, pool.EVERY_PROJECT)[0]
    const rows = t.client.sqlite
      .prepare("SELECT actor_type, actor_id FROM changes WHERE record_id = ? AND op = 'create'")
      .all(first?.id) as { actor_type: string; actor_id: string }[]
    expect(rows[0]?.actor_type).toBe('agent')
    expect(rows[0]?.actor_id).toBe(BUILDER.id)
    expect(first?.sentBy).toEqual(moleOffice())
  })
})
