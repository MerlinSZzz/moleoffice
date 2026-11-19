// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE MESSAGE POOL: who sent it, who it is to, where it points, and how far it got.
 *
 * Criterion M1 of design/messages/ACCEPTANCE.md: *A message is one record kind with: who sent it (a
 * participant, by kind and id), who it is to (one or more participants, or a group), an optional
 * target (a record, and within it a block, a region or a span, using the anchor an annotation
 * carries today), the body, when it was sent, and a delivery mark per recipient (queued, delivered,
 * seen). A comment on a page is a message with a target, whoever writes it; existing `annotation`
 * rows stay readable and are drawn as they are; new comments are messages. The message board, a
 * conversation and a page's comments read the same rows through one library.*
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, expectPanelError, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import {
  DELIVERY,
  DELIVERY_MARKS,
  A_GROUP_IS_NAMED_BY_ITS_ID,
  NOBODY_NAMED_AND_NOTHING_POINTED_AT,
  deliveryWord,
  piecesOfBody,
  whyAddresseesAreRefused,
} from '../src/shared/messages.ts'
import { KIND_SPECS } from '../src/shared/kinds.ts'
import { readMoleOfficeIdWith } from '../src/shared/participants.ts'

type MessagesLib = typeof import('../src/server/lib/messages.ts')
type KnownParticipant = import('../src/server/lib/messages.ts').KnownParticipant

let t: TestDb
let pool: MessagesLib
/** The one database and module instance the cases that can share them use. */
let sharedT: TestDb
let sharedPool: MessagesLib
/** The shared server generation's reader of the office's own registry row. */
let sharedOfficeId: () => string
/** The project this case files into, so no case reads what another case wrote. */
let project = 'panelx'
let caseNumber = 0

const OWNER: ParticipantRef = { kind: 'person', id: THE_PERSON }
/**
 * THE TWO AGENTS AS A WRITER NAMES THEM, by handle. A message stores an agent by its registry id,
 * which is not the handle, so a stored value is compared with `stored(...)` below instead.
 */
const BUILDER: ParticipantRef = { kind: 'agent', id: 'builder-x' }
const CHECKER: ParticipantRef = { kind: 'agent', id: 'checker-y' }

/** The registry id of one agent this file registered, found by its handle. */
function theIdOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as
    | { id: string }
    | undefined
  if (row === undefined) throw new Error(`no registry row for ${handle}`)
  return row.id
}

/** An agent as a message stores it: by its registry id. */
function stored(who: ParticipantRef): ParticipantRef {
  return who.kind === 'agent' ? { kind: 'agent', id: theIdOf(who.id) } : who
}

/**
 * A REGISTRY ROW FOR A TEST, from a ref that names an agent by handle.
 *
 * `contactsFor` needs the handle and the name since criterion M25, because a message whose writer
 * typed a `from` line and claimed nobody belongs under that writer until somebody registers under
 * the same name. The row carries the registry id, and the handle doubles as the name.
 */
function known(who: ParticipantRef): KnownParticipant {
  return { who: stored(who), name: who.id, handle: who.id }
}

const HUMAN = { type: 'human', id: THE_PERSON } as const
const AS_BUILDER = { type: 'agent', id: 'builder-x' } as const
const AS_CHECKER = { type: 'agent', id: 'checker-y' } as const

/** Register the two agents this file writes as, in the project the messages name. */
function registerTheTwoAgents(db: TestDb, inProject: string): void {
  for (const [handle, title] of [
    ['builder-x', 'Builder X'],
    ['checker-y', 'Checker Y'],
  ] as const) {
    db.api.createRecord({
      workspaceId: inProject,
      kind: 'agent',
      title,
      data: { handle, runtime: 'claude-code', state: 'active' },
      actor: HUMAN,
    })
  }
}

beforeAll(async () => {
  sharedT = await freshDb()
  sharedPool = await import('../src/server/lib/messages.ts')
  const participants = await import('../src/server/lib/participants.ts')
  sharedOfficeId = participants.moleOfficeIdFromItsRow
  registerTheTwoAgents(sharedT, project)
}, 60_000)

afterAll(() => {
  sharedT.close()
})

beforeEach(() => {
  // EACH CASE FILES INTO A PROJECT OF ITS OWN, so a count or a list sees only that case's records.
  caseNumber += 1
  project = `panelx-case-${String(caseNumber)}`
  t = sharedT
  pool = sharedPool
  // A CASE THAT STARTS ITS OWN DATABASE REBINDS THE OFFICE'S ID READER, and this puts the shared one back.
  readMoleOfficeIdWith(sharedOfficeId)
  const at = '2026-08-14 09:00:00'
  t.client.sqlite
    .prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(project, `A test project ${String(caseNumber)}`, at, at)
})

/** One message, written the way anything writes one: as a record. */
function say(body: string, to: readonly ParticipantRef[], actor: typeof HUMAN | typeof AS_BUILDER | typeof AS_CHECKER) {
  return t.api.createRecord({
    workspaceId: project,
    kind: 'message',
    title: body.slice(0, 40),
    data: { body, to },
    actor,
  })
}

/**
 * A MESSAGE TO THE OWNER FROM A WRITER NO REGISTRY HOLDS, put into the database rather than written.
 *
 * The write door refuses this act since criterion M59, on 6 September 2026, and rightly. The rows
 * are still in the live database — every message written before the refusal existed — and the
 * backfill migration is what has to cope with them. So the state is built the only honest way left:
 * write the message as a registered agent, then change the change log's actor to the id nothing
 * answers to, which is what the migration reads to work out a sender.
 */
function anOldMessageFromNobodyRegistered() {
  const written = t.api.createRecord({
    workspaceId: project,
    kind: 'message',
    title: 'From nobody registered',
    data: { body: 'Written by an actor nothing answers to.', to: [OWNER] },
    actor: AS_BUILDER,
  })
  t.client.sqlite.prepare("UPDATE changes SET actor_id = 'gemini-cli' WHERE record_id = ?").run(written.id)
  return written
}

/** A place on a page, the same anchor a comment of the older kind carries. */
function aPlaceOn(recordId: string) {
  return { target: { kind: 'record', recordId, workspaceId: project } }
}

// ============================================================ what a message carries

describe('a message says who sent it, who it is to and when it was sent', () => {
  it('is given the participant its writer answers to, without the writer saying so', () => {
    const message = say('The print cracked again.', [OWNER], AS_BUILDER)
    const read = pool.readMessage(message.id, project)
    expect(read.sentBy).toEqual(stored(BUILDER))
    expect(read.to).toEqual([OWNER])
  })

  it('refuses a sender that is not the writer, because a message is somebody speaking', () => {
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: project,
          kind: 'message',
          title: 'Not mine',
          data: { body: 'Not mine.', to: [OWNER], sentBy: CHECKER },
          actor: AS_BUILDER,
        }),
      400,
    )
    expect(error.message).toContain('who sent it is who wrote it')
  })

  it('says when it was sent from the record own created time, with no second stored copy', () => {
    const message = say('When was this.', [OWNER], AS_BUILDER)
    const read = pool.readMessage(message.id, project)
    expect(read.sentAt).toBe(message.createdAt)
    expect(Object.keys(message.data)).not.toContain('sentAt')
  })

  it('keeps the line somebody typed in `from` and does not rewrite it into a participant', () => {
    const message = t.api.createRecord({
      workspaceId: project,
      kind: 'message',
      title: 'Typed',
      data: { body: 'Typed.', to: [OWNER], from: 'claude-code · session touch' },
      actor: AS_BUILDER,
    })
    const read = pool.readMessage(message.id, project)
    expect(read.from).toBe('claude-code · session touch')
    expect(read.sentBy).toEqual(stored(BUILDER))
  })
})

// ============================================================ who it is to

describe('who a message is to', () => {
  it('refuses a message that names nobody and points at nothing, and says what to add', () => {
    // IT USED TO BE STORED AS ADDRESSED TO THE OWNER. That reading was right about what a line on
    // the message board is, and wrong about where to put it: an interpretation written into the
    // field an author writes, with nothing saying it was one. A reader could not then tell a message
    // addressed to the owner on purpose from one addressed to the owner by that rule. Problem `16ZZLBHM_VsT`.
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: project,
          kind: 'message',
          title: 'For the board',
          data: { body: 'The board still works.' },
          actor: AS_BUILDER,
        }),
      400,
    )
    expect(error.message).toBe(NOBODY_NAMED_AND_NOTHING_POINTED_AT)
    expect(error.message, 'the refusal names both things that would settle it').toContain('`to`')
    expect(error.message).toContain('`target`')
  })

  it('takes a line for the owner when the owner is named, which is how a board line is written now', () => {
    const message = t.api.createRecord({
      workspaceId: project,
      kind: 'message',
      title: 'For the board',
      data: { body: 'The board still works.', to: [OWNER] },
      actor: AS_BUILDER,
    })
    expect(message.data['to']).toEqual([OWNER])
    const rows = pool.readMessage(message.id, project).deliveries
    expect(rows.map((one) => one.mark)).toEqual(['queued'])
    // NOTHING WORKED THIS RECIPIENT OUT: the writer named the owner, so the row says nobody inferred it.
    expect(
      t.client.sqlite.prepare('SELECT inferred_by AS by FROM message_delivery WHERE message_id = ?').get(message.id),
    ).toEqual({ by: null })
  })

  it('publishes the same rule in the schema that the door enforces', () => {
    // Problem `16ZZLBHM_VsT` was one reply saying both things: the `to` field's description said
    // such a write was refused and the first cross-field rule said it was stored. An agent is told
    // to read the schema instead of a document precisely so that cannot happen.
    const message = KIND_SPECS['message']
    expect(message.fields.find((one) => one.key === 'to')?.refusal).toBe(NOBODY_NAMED_AND_NOTHING_POINTED_AT)
    expect(message.rules?.[0]).toContain('REFUSED')
    expect(message.rules?.[0]).not.toContain('is addressed to the owner, and the recipient is STORED')
  })

  it('refuses a `to` that is present and empty, because somebody named nobody', () => {
    const error = expectPanelError(t, () => say('To nobody at all.', [], AS_BUILDER), 400)
    expect(error.message).toContain('nobody to send it to')
  })

  it('accepts a comment addressed to nobody, because who should read it is a later question', () => {
    const about = t.api.createRecord({ workspaceId: project, kind: 'note', title: 'A page', data: {}, actor: HUMAN })
    const comment = t.api.createRecord({
      workspaceId: project,
      kind: 'message',
      title: 'A remark',
      data: { body: 'This number does not match the run log.', target: aPlaceOn(about.id) },
      actor: HUMAN,
    })
    const read = pool.readMessage(comment.id, project)
    expect(read.to).toEqual([])
    expect(read.target).not.toBeNull()
  })

  it('refuses a group named by anything but an id, with the sentence saying how one is named', () => {
    // GROUPS ARE BUILT (M11) AND THE SHAPE CHECK IS WHAT IS LEFT OF THIS RULE. Until part 2e this
    // test proved that every use of the field was refused. What tests the built behaviour is
    // tests/groups.test.ts; this one holds the half that belongs to the pool: the field is a group
    // id and nothing else. `validateData` stores the sentence beside the field so
    // GET /api/kinds/message publishes the rule, and the door is what enforces it.
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: project,
          kind: 'message',
          title: 'To a group',
          data: { body: 'To a group.', toGroup: '   ' },
          actor: AS_BUILDER,
        }),
      400,
    )
    // THE FIELD'S OWN REFUSAL IS INSIDE THE SENTENCE, not the whole of it: the completeness reader
    // catches a blank value first and quotes the rule the field declares. That is one sentence in one
    // place, which is what matters — `A_GROUP_IS_NAMED_BY_ITS_ID` is written once and both readers
    // say it.
    expect(error.message).toContain(A_GROUP_IS_NAMED_BY_ITS_ID)
  })

  it('refuses a recipient neither registry holds, naming it', () => {
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: project,
          kind: 'message',
          title: 'To nobody real',
          data: { body: 'Hello?', to: [{ kind: 'agent', id: 'nobody-at-all' }] },
          actor: HUMAN,
        }),
      400,
    )
    expect(error.message).toContain('nobody-at-all')
    expect(error.message).toContain('GET /api/participants')
  })

  /**
   * A MESSAGE COMES FROM A WRITER SOMEBODY REGISTERED, TO A PERSON AS TO AN AGENT. Criterion M59,
   * with the owner's decision that withdrew the unregistered reporting path.
   *
   * On 6 September 2026 the owner got a message in their chat from "bundle-drafter", an agent nobody
   * had registered — record uKYQZRs6qqtS, actor claude-code/bundle-drafter. The recipient was
   * checked against the registries and the writer was not. Whoever starts an agent is responsible
   * for managing it and connecting it to the office.
   */
  it('refuses a message to a person from a writer neither registry holds', () => {
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: project,
          kind: 'message',
          title: 'BUNDLE cluster rewritten',
          data: { body: 'The rewrite is done, four questions for you.', to: [OWNER] },
          actor: { type: 'agent', id: 'claude-code/bundle-drafter' },
        }),
      400,
    )
    expect(error.message).toContain('claude-code/bundle-drafter')
    // THE ONE WAY ON IS REGISTER FIRST. The second way, write to the agent that started you, is gone.
    expect(error.message).toContain('kind `agent`')
    expect(error.message).toContain('Register first')
    expect(error.message).not.toContain('Or write to')
    // AND NOTHING WAS WRITTEN.
    expect(t.api.listRecords({ workspaceId: project, kind: 'message' })).toHaveLength(0)
  })

  it('refuses a message from an unregistered writer to a registered agent too, and writes nothing', () => {
    // THE REPORTING PATH IS WITHDRAWN. An unregistered writer's message to the agent that started it
    // used to be accepted on purpose. Now the writer must register before its message is accepted,
    // to an agent as to a person.
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: project,
          kind: 'message',
          title: 'BUNDLE cluster rewritten',
          data: { body: 'The rewrite is done, four questions for you.', to: [BUILDER] },
          actor: { type: 'agent', id: 'claude-code/bundle-drafter' },
        }),
      400,
    )
    expect(error.message).toContain('claude-code/bundle-drafter')
    expect(error.message).toContain('Register first')
    expect(error.message).not.toContain('Or write to')
    expect(t.api.listRecords({ workspaceId: project, kind: 'message' })).toHaveLength(0)
  })

  it('still takes a message to a person from a writer that IS registered', () => {
    // THE CONTROL. A refusal that also refused the ordinary case would look identical in the count.
    const message = say('The print cracked again.', [OWNER], AS_BUILDER)
    expect(pool.readMessage(message.id, project).sentBy).toEqual(stored(BUILDER))
  })

  /**
   * WHAT THIS CASE USED TO SAY, AND WHY IT SAYS SOMETHING ELSE NOW.
   *
   * It used to assert that the record gate refused this FIRST, with the rule it holds for every
   * declared shape carrying an id: two of them in one record may not share one.
   *
   * That rule no longer collects a `ParticipantRef`, and this is the reason. An id that ADDRESSES
   * one object inside a record — a checklist line, a report part, a chart series — may not repeat,
   * because two of them leave no single thing to change. A participant reference is not that: its
   * id names a row in another registry, and one record naming the same participant twice is normal.
   * Criterion C29 made the first such record: a run holds `released.reportedTo` and `confirmed.by`,
   * and in the ordinary case both are the same agent, because the supervisor a run reported to is
   * the one who confirms its report. See IDS_THAT_NAME_SOMETHING_ELSE in src/shared/kinds.ts and
   * problem VSvZM4vlFMw7.
   *
   * NOTHING IS WEAKENED AND THE CASE IS NOT NARROWED. The write is still refused with a 400, and
   * the refusal is now the pool's OWN check, which was written for exactly this and was already
   * there. What changed is which of the two speaks, and the pool's words are the better ones: they
   * say who was named twice and what a recipient's mark is for.
   */
  it('refuses one recipient named twice, because one recipient has one mark', () => {
    const error = expectPanelError(t, () => say('Twice.', [OWNER, OWNER], AS_BUILDER), 400)
    expect(error.message).toContain('named twice among the recipients')
    expect(whyAddresseesAreRefused([OWNER, OWNER])).toContain('named twice among the recipients')
  })
})

// ============================================================ the delivery marks

describe('how far a message got is one row per recipient, and it never goes backwards', () => {
  it('starts every recipient at queued, with a row each', () => {
    const message = say('Two of you.', [OWNER, CHECKER], AS_BUILDER)
    const read = pool.readMessage(message.id, project)
    expect(read.deliveries.map((one) => one.mark)).toEqual(['queued', 'queued'])
    expect(read.deliveries.map((one) => one.to.id).sort()).toEqual([THE_PERSON, theIdOf('checker-y')].sort())
  })

  it('moves a mark forward and refuses to move it back, saying so', () => {
    const message = say('Read this.', [OWNER], AS_BUILDER)
    expect(pool.markDelivery(message.id, OWNER, 'seen').changed).toBe(true)
    const back = pool.markDelivery(message.id, OWNER, 'delivered')
    expect(back.changed).toBe(false)
    expect(back.mark).toBe('seen')
    expect(back.because).toContain('never moves backwards')
  })

  it('refuses to mark a delivery of a message somebody else was sent', () => {
    const message = say('For the owner.', [OWNER], AS_BUILDER)
    const error = expectPanelError(t, () => pool.markDelivery(message.id, stored(CHECKER), 'seen'), 404)
    expect(error.message).toContain('was not addressed to')
  })

  it('writes no revision when a mark changes, because a mark is not a field', () => {
    const message = say('Count the revisions.', [OWNER], AS_BUILDER)
    const before = t.client.sqlite
      .prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?')
      .get(message.id) as { n: number }
    pool.markDelivery(message.id, OWNER, 'delivered')
    pool.markDelivery(message.id, OWNER, 'seen')
    const after = t.client.sqlite
      .prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?')
      .get(message.id) as { n: number }
    expect(after.n).toBe(before.n)
  })

  it('has a plain sentence for each of the three marks, and names one it does not know', () => {
    for (const mark of DELIVERY_MARKS) {
      expect(deliveryWord(mark)).toBe(DELIVERY[mark])
      expect(DELIVERY[mark].sentence.length).toBeGreaterThan(20)
    }
    expect(deliveryWord('posted').word).toContain('unknown delivery mark')
  })
})

// ============================================================ the rows and the field agree

describe('who a message is to is written twice, and the two may not disagree', () => {
  it('gives every name in `to` a delivery row and gives a row to nobody else', () => {
    const message = say('Both of you.', [OWNER, CHECKER], AS_BUILDER)
    const stored = (t.api.getRecord(message.id)?.data['to'] ?? []) as ParticipantRef[]
    const rows = pool.deliveriesOf(message.id)
    expect(rows.map((one) => `${one.to.kind}:${one.to.id}`).sort()).toEqual(
      stored.map((one) => `${one.kind}:${one.id}`).sort(),
    )
  })
})

// ============================================================ one library, three readers

describe('the board, a conversation and a page comments read the same rows', () => {
  it('puts a message on the board and in the conversation it belongs to', () => {
    const message = say('On both.', [OWNER], AS_BUILDER)
    expect(pool.messagePool(project).map((one) => one.id)).toContain(message.id)
    expect(pool.conversationBetween(OWNER, stored(BUILDER), pool.justThisProject(project)).messages.map((one) => one.id)).toContain(message.id)
  })

  it('reads a comment of the older kind and a comment written now as one list', () => {
    const about = t.api.createRecord({ workspaceId: project, kind: 'note', title: 'A page', data: {}, actor: HUMAN })
    const old = t.api.createRecord({
      workspaceId: project,
      kind: 'annotation',
      title: 'An older comment',
      data: { body: 'Written before the pool.', context: aPlaceOn(about.id) },
      actor: HUMAN,
    })
    const now = t.api.createRecord({
      workspaceId: project,
      kind: 'message',
      title: 'A comment now',
      data: { body: 'Written since.', target: aPlaceOn(about.id) },
      actor: HUMAN,
    })
    const both = pool.commentsIn(project)
    expect(both.map((one) => one.id).sort()).toEqual([old.id, now.id].sort())
    expect(both.find((one) => one.id === old.id)?.entry).toBe('annotation')
    expect(both.find((one) => one.id === now.id)?.entry).toBe('message')
    expect(pool.commentsOnRecord(about.id, project).map((one) => one.id).sort()).toEqual([old.id, now.id].sort())
  })

  it('leaves a message that points nowhere out of the comments', () => {
    const message = say('Not a comment.', [OWNER], AS_BUILDER)
    expect(pool.commentsIn(project).map((one) => one.id)).not.toContain(message.id)
  })

  it('draws an older comment as it is, with no sender and no marks invented for it', () => {
    const about = t.api.createRecord({ workspaceId: project, kind: 'note', title: 'A page', data: {}, actor: HUMAN })
    const old = t.api.createRecord({
      workspaceId: project,
      kind: 'annotation',
      title: 'An older comment',
      data: { body: 'Written before the pool.', context: aPlaceOn(about.id) },
      actor: AS_BUILDER,
    })
    const read = pool.commentsIn(project).find((one) => one.id === old.id)
    expect(read?.sentBy).toBeNull()
    expect(read?.to).toEqual([])
    expect(read?.deliveries).toEqual([])
  })
})

// ============================================================ contacts and the unread count

describe('contacts and what is unread', () => {
  it('puts the newest conversation first and counts what this reader has not read', () => {
    say('From the builder.', [OWNER], AS_BUILDER)
    say('From the checker.', [OWNER], AS_CHECKER)
    const lines = pool.contactsFor(OWNER, [OWNER, BUILDER, CHECKER].map(known), pool.justThisProject(project))
    expect(lines.map((one) => one.who?.id)).toEqual([theIdOf('checker-y'), theIdOf('builder-x')])
    expect(lines.every((one) => one.unread === 1)).toBe(true)
    // THE SAME RULE COUNTS THE CONTACTS AND THE CIRCLE, since M19. `unreadFor`, which counted the
    // delivery table over again, is gone: it could disagree with these rows with nothing failing.
    expect(pool.unreadAmong(lines.map((one) => one.last).filter((one) => one !== null), OWNER)).toBe(2)
  })

  it('leaves the reader out of their own contacts', () => {
    const lines = pool.contactsFor(OWNER, [OWNER, BUILDER].map(known), pool.justThisProject(project))
    expect(lines.map((one) => one.who?.id)).not.toContain(THE_PERSON)
  })

  it('stops counting a message as unread once the reader says they have read it', () => {
    const message = say('Please read.', [OWNER], AS_BUILDER)
    const before = pool.contactsFor(OWNER, [OWNER, BUILDER].map(known), pool.justThisProject(project))
    expect(before.reduce((sum, one) => sum + one.unread, 0)).toBeGreaterThan(0)
    pool.markDelivery(message.id, OWNER, 'seen')
    const after = pool.contactsFor(OWNER, [OWNER, BUILDER].map(known), pool.justThisProject(project))
    expect(after.reduce((sum, one) => sum + one.unread, 0)).toBe(before.reduce((sum, one) => sum + one.unread, 0) - 1)
  })
})

// ============================================================ links inside a body

describe('a record id or a page address in a body is something to press', () => {
  it('finds a record id and a page address and leaves the words between them alone', () => {
    const pieces = piecesOfBody('The result is in LKJQbOhAK3kz, and the board is at #/notes.')
    expect(pieces.filter((one) => one.what === 'record').map((one) => one.text)).toEqual(['LKJQbOhAK3kz'])
    expect(pieces.filter((one) => one.what === 'page').map((one) => one.text)).toEqual(['#/notes'])
    expect(pieces.map((one) => one.text).join('')).toBe('The result is in LKJQbOhAK3kz, and the board is at #/notes.')
  })

  it('presses nothing in a body that names nothing', () => {
    const pieces = piecesOfBody('See the plan when you get a moment.')
    expect(pieces.every((one) => one.what === 'words')).toBe(true)
  })

  it.each([
    '-abcdefghijk',
    'abcdefghijk-',
    '-abcdefghij-',
    '_abcdefghijk',
    'abcdefghijk_',
    '_abcdefghij_',
  ])('recognizes the complete ID %s at the edge of a body and beside punctuation', (id) => {
    for (const body of [id, `Read (${id}), then stop.`]) {
      const pieces = piecesOfBody(body)
      expect(pieces.filter((piece) => piece.what === 'record')).toEqual([
        { what: 'record', text: id, recordId: id },
      ])
      expect(pieces.map((piece) => piece.text).join('')).toBe(body)
    }
  })

  it.each([
    '-abcdefghijkl',
    'abcdefghijkl-',
    '_abcdefghijkl',
    'abcdefghijkl_',
    'abcdefghijklm',
  ])('does not take a twelve-character link out of the thirteen-character token %s', (token) => {
    const body = `Long token: ${token}.`
    const pieces = piecesOfBody(body)
    expect(pieces.filter((piece) => piece.what === 'record')).toEqual([])
    expect(pieces.map((piece) => piece.text).join('')).toBe(body)
  })
})

// ============================================================ the backfill

describe('the migration that gives every message already here a sender and a delivery row', () => {
  // THIS BLOCK KEEPS A FRESH DATABASE FOR EACH CASE. The migration counts and rewrites every message in the database,
  // and one case takes every delivery row away by hand, so no two of these cases can share one.
  beforeEach(async () => {
    project = 'panelx'
    t = await freshDb()
    pool = await import('../src/server/lib/messages.ts')
    registerTheTwoAgents(t, project)
  })

  afterEach(() => {
    t.close()
  })

  it('addresses each one to the owner, marks it read where the old flag said so, and says so in numbers', async () => {
    const { migrateMessageDelivery, INFERRED_BY } = await import('../src/server/db/message-delivery-migration.ts')
    // TWO MESSAGES AS THEY WERE WRITTEN BEFORE THE POOL: an old `read` flag, no sender, no recipient
    // and no delivery row. The rows are put into that state by hand, because the door will not write
    // one any more, which is the whole reason the migration exists.
    const wasRead = say('Already read.', [OWNER], AS_BUILDER)
    const notRead = say('Not read yet.', [OWNER], AS_BUILDER)
    t.client.sqlite.prepare('DELETE FROM message_delivery').run()
    t.client.sqlite
      .prepare("UPDATE records SET data = json_remove(json_set(data, '$.read', json('true')), '$.sentBy', '$.to') WHERE id = ?")
      .run(wasRead.id)
    t.client.sqlite
      .prepare("UPDATE records SET data = json_remove(json_set(data, '$.read', json('false')), '$.sentBy', '$.to') WHERE id = ?")
      .run(notRead.id)

    const report = migrateMessageDelivery(t.client.sqlite)
    expect(report.messagesSeen).toBe(2)
    expect(report.sendersWritten).toBe(2)
    expect(report.ledgerRestamped).toBe(2)
    expect(report.deliveriesWritten).toBe(2)
    expect(report.markedSeen).toBe(1)
    expect(report.markedDelivered).toBe(1)
    expect(report.sendersNotFound).toEqual([])

    // `because` and `run` are null on every row this migration writes: migration 0116 added them and
    // nobody has said anything about these deliveries. Null here is nobody wrote it down, which is
    // exactly right for a row backfilled from a message written before any of this existed.
    expect(pool.readMessage(wasRead.id, project).deliveries).toEqual([
      { to: OWNER, mark: 'seen', at: wasRead.createdAt, because: null, run: null },
    ])

    // AND EVERY ROW IT WROTE SAYS THIS MIGRATION WORKED THE RECIPIENT OUT. The message names nobody;
    // the owner is who a line on the board was for. That reading is kept and it is visible, which is
    // the whole of the correction to decision 4.
    const stamps = t.client.sqlite
      .prepare('SELECT inferred_by AS by FROM message_delivery ORDER BY id')
      .all() as { by: string | null }[]
    expect(stamps.map((one) => one.by)).toEqual([INFERRED_BY, INFERRED_BY])
    expect(pool.readMessage(notRead.id, project).sentBy).toEqual(stored(BUILDER))

    // A SECOND RUN WRITES NOTHING, and the report says zero rather than repeating the first one.
    const again = migrateMessageDelivery(t.client.sqlite)
    expect(again.sendersWritten).toBe(0)
    expect(again.deliveriesWritten).toBe(0)
  })

  it('says what is in the database on a second run, instead of an all-clear about an empty set', async () => {
    const { migrateMessageDelivery, describeMessageDelivery } = await import(
      '../src/server/db/message-delivery-migration.ts'
    )
    // TWO MESSAGES THE BACKFILL WOULD HAVE TO WORK ON: no sender and no delivery row. One of them is
    // written by an actor neither registry holds, so it keeps having no sender however often this
    // runs, which is the state the live database is in.
    const known = say('From somebody registered.', [OWNER], AS_BUILDER)
    const orphan = anOldMessageFromNobodyRegistered()
    t.client.sqlite.prepare('DELETE FROM message_delivery').run()
    t.client.sqlite
      .prepare("UPDATE records SET data = json_remove(data, '$.sentBy') WHERE id IN (?, ?)")
      .run(known.id, orphan.id)

    migrateMessageDelivery(t.client.sqlite)

    // THE SECOND RUN. It writes nothing, and what it says has to be about this database rather than
    // about the empty set of messages it had anything to do. Problem `5NiHOF49fZ5y`: the line read
    // "Nothing to do. All 0 message(s) already say who sent them and who they reached."
    const again = migrateMessageDelivery(t.client.sqlite)
    expect(again.deliveriesWritten).toBe(0)
    expect(again.sendersWritten).toBe(0)
    expect(again.messagesInDatabase).toBe(2)
    expect(again.messagesWithRowsAlready).toBe(2)
    expect(again.messagesWithNoSender, 'the one whose writer neither registry holds').toBe(1)

    const said = describeMessageDelivery(again)
    expect(said).toContain('the delivery rows exist for all 2 of the 2 message(s)')
    expect(said, 'the senderless one is counted rather than hidden').toContain('1 of them still say nobody sent them')
    expect(said, 'the sentence that read as an all-clear is gone').not.toContain('All 0 message(s)')
  })

  it('stamps a delivery row it wrote before the column existed, and leaves an addressed one alone', async () => {
    const { migrateMessageDelivery, INFERRED_BY } = await import('../src/server/db/message-delivery-migration.ts')
    // EXACTLY THE SHAPE THE LIVE DATABASE IS IN. The backfill ran under migration 0115 and wrote
    // twenty-five rows; migration 0118 added the column afterwards, so those rows have no stamp and
    // there is nothing left for the backfill to write. This is the run that has to say something.
    const worked = say('A line on the board.', [OWNER], AS_BUILDER)
    const addressed = say('And one addressed to an agent.', [CHECKER], AS_BUILDER)
    t.client.sqlite.prepare('UPDATE message_delivery SET inferred_by = NULL').run()
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.to') WHERE id = ?").run(worked.id)

    const report = migrateMessageDelivery(t.client.sqlite)
    expect(report.deliveriesWritten, 'both messages already have their rows').toBe(0)
    expect(report.stamped).toBe(1)

    const stamp = (id: string) =>
      (t.client.sqlite.prepare('SELECT inferred_by AS by FROM message_delivery WHERE message_id = ?').get(id) as {
        by: string | null
      }).by
    expect(stamp(worked.id), 'this recipient was worked out by the migration').toBe(INFERRED_BY)
    expect(stamp(addressed.id), 'this one was named by whoever wrote the message').toBeNull()

    // A SECOND RUN FINDS NOTHING LEFT TO STAMP.
    expect(migrateMessageDelivery(t.client.sqlite).stamped).toBe(0)
  })

  it('gives no owner row to a message that already reached somebody else', async () => {
    const { migrateMessageDelivery } = await import('../src/server/db/message-delivery-migration.ts')
    // A MESSAGE FROM ONE AGENT TO ANOTHER. The send wrote the addressee's row: checker-y records no owner
    // and nothing is answering as it, so the routing keeps the letter waiting and gives no copy to anybody. The
    // BACKFILL must write no owner row — that would be a copy of a delivery nobody made. The
    // start-up gate found the shape on a scratch copy of the live database before any test did.
    const between = say('Are you in the same files?', [CHECKER], AS_BUILDER)
    const report = migrateMessageDelivery(t.client.sqlite)
    expect(report.deliveriesWritten).toBe(0)
    // THE SEND'S OWN ROW IS ALREADY THERE, and it is the only one. The backfill writes nothing.
    expect(pool.readMessage(between.id, project).to.map((one) => `${one.kind}:${one.id}`).sort()).toEqual([
      `agent:${theIdOf('checker-y')}`,
    ])
  })

  it('gives a message whose rows are gone the rows its own `to` names, not an owner row', async () => {
    const { migrateMessageDelivery, describeMessageDelivery } = await import('../src/server/db/message-delivery-migration.ts')
    // PROBLEM IywLd0CDUsOK. A message from one agent to another, whose delivery rows are then taken
    // away by hand. Act 2 used to give it one row addressed to the owner, stamped as the migration's
    // own guess, whatever its `to` said. It now writes what the write door wrote: a row for the agent
    // it names, with the door's own `inferred_by`, `queued`. The routing adds no row: checker-y records no
    // owner, so the letter waits for it.
    const between = say('Are you in the same files?', [CHECKER], AS_BUILDER)
    const rowsOf = (id: string) =>
      (
        t.client.sqlite
          .prepare('SELECT recipient_kind AS kind, recipient_id AS id, mark, inferred_by AS by FROM message_delivery WHERE message_id = ?')
          .all(id) as { kind: string; id: string; mark: string; by: string | null }[]
      )
        .map((one) => `${one.kind}:${one.id} ${one.mark} ${String(one.by)}`)
        .sort()
    const asTheDoorWroteThem = rowsOf(between.id)
    expect(asTheDoorWroteThem).toEqual([`agent:${theIdOf('checker-y')} queued null`])
    t.client.sqlite.prepare('DELETE FROM message_delivery WHERE message_id = ?').run(between.id)

    // THE PREVIEW THE START-UP GUARD PRINTS SAYS WHERE THE ROWS WOULD GO, read off a copy before the
    // step runs: none to the owner, one queued to the recipient the message names, and that one queued for an
    // agent. It used to say every row 'reached the owner'.
    const { previewMigration } = await import('../src/server/db/migrate.ts')
    const preview = previewMigration(t.client.sqlite)
    const messagesLine = preview.wouldWrite.find((line) => line.startsWith('messages:'))
    expect(messagesLine, preview.wouldWrite.join('\n')).toBeDefined()
    expect(messagesLine).not.toContain('reached the owner')
    expect(messagesLine).toContain('Write 1 delivery row(s).')
    expect(messagesLine).toContain('0 are addressed to the owner because their message names nobody')
    expect(messagesLine).toContain('1 are addressed to the recipients their message names')
    expect(messagesLine).toContain('1 row(s) were queued for an agent')
    expect(rowsOf(between.id), 'the preview wrote into the database it previewed').toEqual([])

    const report = migrateMessageDelivery(t.client.sqlite)
    expect(rowsOf(between.id), 'the rows are not the ones the write door wrote').toEqual(asTheDoorWroteThem)
    expect(report.deliveriesWritten).toBe(1)
    expect(report.toTheRecipientsNamed).toBe(1)
    expect(report.markedSeen + report.markedDelivered, 'an owner row was written for a message that names somebody').toBe(0)
    expect(report.stamped, 'act 3 stamped a row the writer named').toBe(0)
    expect(describeMessageDelivery(report)).toContain('1 are addressed to the recipients their message names')
    // THE ROWS THE MESSAGE WORKER WOULD HAND OVER ARE COUNTED ON THE REPORT LINE: the agent's row is
    // queued for an agent.
    expect(report.queuedForAnAgent).toBe(1)
    expect(describeMessageDelivery(report)).toContain('1 row(s) were queued for an agent')

    // A SECOND RUN WRITES NOTHING, AND SAYS NO ROW WAS QUEUED FOR AN AGENT.
    const again = migrateMessageDelivery(t.client.sqlite)
    expect(again.deliveriesWritten).toBe(0)
    expect(again.queuedForAnAgent).toBe(0)
    expect(describeMessageDelivery(again)).toContain('no row was queued for an agent')
  })

  it('leaves a message with no sender when neither registry holds its writer, and names it', async () => {
    const { migrateMessageDelivery } = await import('../src/server/db/message-delivery-migration.ts')
    const orphan = anOldMessageFromNobodyRegistered()
    t.client.sqlite.prepare('DELETE FROM message_delivery').run()
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.sentBy') WHERE id = ?").run(orphan.id)

    const report = migrateMessageDelivery(t.client.sqlite)
    expect(report.sendersNotFound.map((one) => one.recordId)).toContain(orphan.id)
    expect(pool.readMessage(orphan.id, project).sentBy).toBeNull()
    // ITS OWN WORDS ARE UNTOUCHED. Nothing invented a participant for it.
    expect(pool.readMessage(orphan.id, project).body).toBe('Written by an actor nothing answers to.')
  })
})
