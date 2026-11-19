// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A MESSAGE ANSWERS IS SAID BY THE WRITER, AND WORKED OUT ONLY WHEN THE WRITER DID NOT SAY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/kinds.ts` declared `inReplyTo` as the message this one answers, written by the worker
 * and "by anybody answering in a conversation". Nothing in the browser wrote it. The server worked
 * the same question out a second way, in `answersSomebodyHere`: a message is an answer when one of
 * the people it is addressed to has already said something about that same place.
 *
 * So the document agents are told to read before they write promised a behaviour no screen had, and
 * an agent with two comments on one page could not tell which of them had been answered. One fact
 * worked out in two places, which is the defect CLAUDE.md names as this codebase's own. Problem
 * `Wjb30lfFs62C`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS DECIDED, AND WHAT THIS FILE HOLDS TO IT
 * ---------------------------------------------------------------------------------------
 *
 * The writer's own word comes first. The answer a person types into an agent's comment card names
 * the message it answers, and that is enough on its own. When a message with a target says nothing
 * about what it answers, the old reading still stands: it is an answer if somebody it is addressed
 * to has already spoken about that place. Two ways of SAYING it, one of which is a fallback for
 * silence, is not two ways of DECIDING it.
 *
 * The browser half — that the card really does write it — is in
 * `tests/an-agent-comments-on-a-page.test.ts`, where the card is already opened and typed into.
 *
 * AND THE LOOP GUARD READS WHAT IT ALWAYS READ. `hopsBehind` walks `inReplyTo` back and stops at a
 * message a person sent. A person's answer now names what it answers, which puts a person's message
 * in a chain that used to end before it — so the last test here is that the guard still stops there.
 */

import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const WORKSPACE = 'default'
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const THE_AGENT = { type: 'agent', id: 'reader-y' } as const
const ANOTHER_AGENT = { type: 'agent', id: 'other-z' } as const

let t: TestDb
let events: typeof import('../src/server/lib/events.ts')
let worker: typeof import('../src/server/lib/worker.ts')
let reportId = ''

/** The place everything in this file is about. */
const aBlock = () => ({ target: { kind: 'region', recordId: reportId, regionId: 'data.blocks[#b-1]' } })

beforeAll(async () => {
  t = await freshDb()
  events = await import('../src/server/lib/events.ts')
  worker = await import('../src/server/lib/worker.ts')
  for (const [handle, name] of [
    ['reader-y', 'Reader Y'],
    ['other-z', 'Other Z'],
  ]) {
    t.api.createRecord({
      kind: 'agent',
      title: name as string,
      workspaceId: WORKSPACE,
      data: { handle, runtime: 'claude-code', state: 'active' },
      actor: PERSON,
    })
  }
  reportId = t.api.createRecord({
    kind: 'report',
    title: 'What the force sweep showed',
    workspaceId: WORKSPACE,
    data: {
      for: THE_TEST_OFFICES_OWNER.name,
      date: '2026-09-04',
      blocks: [{ id: 'b-1', type: 'text', heading: 'What I found', text: 'The gripper closed at 11.8 newtons.' }],
    },
    actor: PERSON,
  }).id
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  // THE CHANNEL IS THE ONLY THING THESE CASES SHARE: each case reads the announcements its own
  // writes raised, from an empty channel.
  events.forgetTheChannel()
})

/** File one message and give back its id. */
function message(actor: { type: string; id: string }, data: Record<string, unknown>): string {
  return t.api.createRecord({
    kind: 'message',
    title: String(data['body'] ?? 'a message').slice(0, 40),
    workspaceId: WORKSPACE,
    data,
    actor: actor as never,
  }).id
}

/**
 * The names of the comment announcements the channel has carried, oldest first, as the owner's page
 * is given them. A comment reaches only its parties and the owner, so a page
 * with no reader is given none of them.
 */
function announced(): string[] {
  return events
    .since(0, WORKSPACE, { kind: 'person', id: PERSON.id })
    .events.map((one) => one.event.name)
    .filter((name) => name.startsWith('comment.'))
}

describe('a message says what it answers, and the server believes it', () => {
  it('announces an answer that names what it answers as an answer', () => {
    const said = message(THE_AGENT, { body: 'Every one of these used the same gripper.', target: aBlock() })
    message(PERSON, {
      body: 'Measured on Tuesday.',
      to: [{ kind: 'agent', id: 'reader-y' }],
      target: aBlock(),
      inReplyTo: said,
    })
    expect(announced()).toEqual(['comment.placed', 'comment.replied'])
  })

  it('believes the writer even where nothing stored would have said it was an answer', () => {
    // NOBODY HAS SPOKEN ABOUT THIS PLACE except the writer's own agent, and the message is addressed
    // to a second agent that has said nothing here. The inference would call this a first remark.
    const said = message(THE_AGENT, { body: 'A first remark.', target: aBlock() })
    message(PERSON, {
      body: 'An answer addressed to somebody who has not spoken here.',
      to: [{ kind: 'agent', id: 'other-z' }],
      target: aBlock(),
      inReplyTo: said,
    })
    expect(announced()).toEqual(['comment.placed', 'comment.replied'])
  })
})

describe('when the writer says nothing, the server works it out as it always did', () => {
  it('reads an answer from the place and the addressee', () => {
    message(THE_AGENT, { body: 'A first remark.', target: aBlock() })
    message(PERSON, {
      body: 'An answer that names nothing.',
      to: [{ kind: 'agent', id: 'reader-y' }],
      target: aBlock(),
    })
    expect(announced()).toEqual(['comment.placed', 'comment.replied'])
  })

  it('calls a remark about a place nobody has spoken about a first remark', () => {
    message(THE_AGENT, { body: 'A first remark.', target: aBlock() })
    message(PERSON, {
      body: 'A remark addressed to somebody who has said nothing here.',
      to: [{ kind: 'agent', id: 'other-z' }],
      target: aBlock(),
    })
    expect(announced()).toEqual(['comment.placed', 'comment.placed'])
  })
})

describe('the loop guard reads what it always read', () => {
  it('stops at a person message, whether or not that message names what it answers', () => {
    // AN AGENT ANSWERS AN AGENT ANSWERS A PERSON. Walking back from the newest message, the one it
    // is standing on is not a hop and the one behind it is, and the person's own message ends the
    // walk. So one hop, and the count is of agents answering agents since a person last spoke.
    const fromThePerson = message(PERSON, { body: 'Please look at this.', to: [{ kind: 'agent', id: 'reader-y' }] })
    const firstAgent = message(THE_AGENT, {
      body: 'I looked. Other Z should see it.',
      to: [{ kind: 'agent', id: 'other-z' }],
      inReplyTo: fromThePerson,
    })
    const secondAgent = message(ANOTHER_AGENT, {
      body: 'Seen.',
      to: [{ kind: 'agent', id: 'reader-y' }],
      inReplyTo: firstAgent,
    })
    expect(worker.hopsBehind(secondAgent)).toBe(1)

    // NOW THE PERSON ANSWERS, NAMING WHAT THEY ANSWER, which is what the comment card writes today.
    // The guard breaks on the person before it reads the field at all, so the count starts again.
    const personAnswered = message(PERSON, {
      body: 'Measured on Tuesday.',
      to: [{ kind: 'agent', id: 'reader-y' }],
      target: aBlock(),
      inReplyTo: secondAgent,
    })
    expect(worker.hopsBehind(personAnswered)).toBe(0)

    // And an agent answering that person is no hops at all, because the person ended the chain.
    const afterThePerson = message(THE_AGENT, {
      body: 'Understood.',
      to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }],
      inReplyTo: personAnswered,
    })
    expect(worker.hopsBehind(afterThePerson)).toBe(0)
  })
})
