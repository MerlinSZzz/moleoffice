// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAGE HEARS ONLY WHAT WAS STORED. Wave 13n's round 39.
 *
 * `announce` (src/server/lib/events.ts) told the open pages about a write in the middle of its
 * transaction, so a write refused after that point was announced all the same: a page drew a message
 * that was never stored (report 6o9jgh_SM1C-). Now an announcement made inside a transaction is sent
 * when the outermost transaction commits and dropped when it rolls back
 * (src/server/db/told-when-stored.ts).
 *
 * The writes here are real message writes through `createRecord`, which announces `message.new`. The
 * refusal is a step after it in the same transaction, as a door that files a message and then finds a
 * reason to refuse the whole write would make it.
 *
 * Case names name the source mutation tried against each assertion.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const HERE = 'default'
const AS_THE_OWNER = { type: 'human', id: THE_PERSON } as const

let t: TestDb
let events: typeof import('../src/server/lib/events.ts')
let participants: typeof import('../src/server/lib/participants.ts')
let page: { said: { id: number; name: string; text: string }[]; id: number }
let agent: ParticipantRef
let caseNumber = 0

/** Write one message from the owner to the agent and give back its id. */
function say(body: string): string {
  return t.api.createRecord({
    kind: 'message',
    title: body.slice(0, 40),
    workspaceId: HERE,
    data: { body, to: [agent] },
    actor: AS_THE_OWNER as never,
  }).id
}

/** The names of the events the page was sent that name this message or carry these words. */
function heard(about: string): string[] {
  return page.said.filter((one) => one.text.includes(about)).map((one) => one.name)
}

function stored(id: string): boolean {
  return t.client.sqlite.prepare('SELECT 1 FROM records WHERE id = ?').get(id) !== undefined
}

class Refused extends Error {}

beforeAll(async () => {
  t = await freshDb()
  events = await import('../src/server/lib/events.ts')
  participants = await import('../src/server/lib/participants.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  const handle = `hears-agent-${String(caseNumber)}`
  events.forgetTheChannel()
  t.api.createRecord({
    kind: 'agent',
    title: handle,
    workspaceId: HERE,
    data: { handle, runtime: 'claude-code', state: 'active' },
    actor: AS_THE_OWNER as never,
  })
  const who = participants.participantForActor({ type: 'agent', id: handle })
  if (who === null) throw new Error('the agent was registered and no registry row answers to it')
  agent = who
  const said: { id: number; name: string; text: string }[] = []
  const id = events.pageOpened({
    workspaceId: HERE,
    who: { kind: 'person', id: THE_PERSON },
    send: (one) => said.push({ id: one.id, name: one.event.name, text: JSON.stringify(one.event) }),
  })
  page = { said, id }
})

afterEach(() => {
  events.pageClosed(page.id)
})

it('a stored write is announced once: telling the pages at the call as well as at the commit announces it twice', () => {
  const id = say('A message that is stored.')
  expect(stored(id)).toBe(true)
  expect(heard(id)).toEqual(['message.new'])
})

it('a stored write inside an outer transaction is announced once, after the commit: telling at the call announces it before it is stored', () => {
  let id = ''
  let heardBeforeTheCommit: string[] = []
  t.client.sqlite.transaction(() => {
    id = say('A message filed inside a longer write.')
    heardBeforeTheCommit = heard(id)
  })()
  expect(heardBeforeTheCommit).toEqual([])
  expect(stored(id)).toBe(true)
  expect(heard(id)).toEqual(['message.new'])
})

it('a write refused after its announce point announces nothing: telling the pages at the call announces a message that was never stored', () => {
  let id = ''
  expect(() =>
    t.client.sqlite.transaction(() => {
      id = say('A message whose write is refused afterwards.')
      throw new Refused('The test refuses this write after the message was filed.')
    })(),
  ).toThrow(Refused)
  expect(id).not.toBe('')
  expect(stored(id)).toBe(false)
  expect(heard(id)).toEqual([])
  expect(heard('A message whose write is refused afterwards.')).toEqual([])
  // A page that comes back after a break is not handed it either.
  const back = events.since(0, HERE, { kind: 'person', id: THE_PERSON })
  expect(back.events.filter((one) => JSON.stringify(one.event).includes(id))).toEqual([])
})

it('a rolled-back savepoint announces nothing while its caller goes on: keeping its announcements for the caller tells a page about a message that was rolled back', () => {
  let kept = ''
  let rolledBack = ''
  t.client.sqlite.transaction(() => {
    try {
      t.client.sqlite.transaction(() => {
        rolledBack = say('A message in a savepoint that rolls back.')
        throw new Refused('The test rolls this savepoint back.')
      })()
    } catch (error) {
      if (!(error instanceof Refused)) throw error
    }
    kept = say('A message its caller files after the savepoint.')
  })()
  expect(stored(rolledBack)).toBe(false)
  expect(stored(kept)).toBe(true)
  expect(heard(rolledBack)).toEqual([])
  expect(heard(kept)).toEqual(['message.new'])
})

it("a drizzle transaction holds them too: drizzle's db.transaction opens its outermost transaction on the same handle", () => {
  let id = ''
  expect(() =>
    t.client.db.transaction(() => {
      id = say('A message in a drizzle transaction that is refused.')
      throw new Refused('The test refuses this drizzle write.')
    }),
  ).toThrow(Refused)
  expect(stored(id)).toBe(false)
  expect(heard(id)).toEqual([])
})
