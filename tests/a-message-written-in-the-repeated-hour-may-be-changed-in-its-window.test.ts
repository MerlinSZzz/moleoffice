// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE WRITTEN IN THE REPEATED HOUR MAY BE CHANGED FOR ITS WHOLE WINDOW.
 *
 * On 25 October 2026 the clocks in Europe/London go back an hour at 02:00 summer time, so the hour from 01:00 comes
 * twice: first in summer time (00:00 to 01:00 UTC), then in winter time (01:00 to 02:00 UTC). On 28 March 2027 they go
 * forward an hour at 01:00, so the hour from 01:00 to 02:00 never comes.
 *
 * A message's writer may change its words for a while after writing it. Until when is worked out from when it was
 * written, and that is a local stamp with no offset (`created_at`). Both the reader that says until when (the
 * message's `wordsMayChangeUntil`) and the record door that takes or refuses the change read the stamp as the first
 * pass of the repeated hour. So a message written at 01:10 winter time could be changed until 00:12 UTC, an hour
 * before it was written, and its writer's change a minute later was refused. The record door now keeps the moment it
 * filed the message (`writtenTime`). That moment only says which pass of the hour its stamp means, so both read it,
 * through one function, only when it names the stamp beside it: its first 19 characters are the stamp, with T for the
 * space. The window then runs from that second, as it did from the stamp. A stamp changed without its moment is read
 * from its words, as before.
 *
 * WHAT IS PROVED, against a throwaway database, with this process's zone set to Europe/London and its clock set here.
 * Every message is written and changed through the record door, except the rows cases 3, 4 and 5 change by hand, which
 * say why.
 *
 *   1. A message written at 01:10 winter time on 25 October may be changed until its window after 01:10 winter time,
 *      and its writer's change at 01:11 winter time is taken.
 *   2. On 28 March 2027, a message written at 00:30 winter time may be changed until its window after 00:30, and one
 *      written at 02:30 summer time until its window after that, and a change a minute later is taken.
 *   3. Control: a message with no moment beside its stamp is read from its words, as before: written at 01:10, it may
 *      be changed until its window after 00:10 UTC, and its writer's change at 01:11 winter time is refused.
 *   4. A message whose moment names its stamp and cannot be read, with the offset +25:00, says nobody may change it,
 *      and its writer's change is refused, as for a stamp that cannot be read.
 *   5. A stamp changed alone is read from its words, as before. A message written at noon on 2 November 2026, with its
 *      stamp then set to 11:00, may be changed until its window after 11:00, and its writer's change at 12:01 is
 *      refused.
 *
 * Without the code, cases 1 and 4 are red. Cases 2, 3 and 5 are green. A reader that reads the moment whenever it is
 * there, without asking whether it names its stamp, turns case 5 red: it counts the window from noon, and takes the
 * change.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { freshDb, type TestDb } from './helpers.ts'

type Messages = typeof import('../src/server/lib/messages.ts')

const MINUTE = 60_000

/** 01:10 winter time, 25 October 2026, in the second pass of the repeated hour. */
const SECOND_PASS_AT_TEN_PAST = Date.UTC(2026, 9, 25, 1, 10, 0)
/** 00:10 UTC, 25 October 2026: 01:10 summer time, the first pass, which the words 01:10 read as. */
const FIRST_PASS_AT_TEN_PAST = Date.UTC(2026, 9, 25, 0, 10, 0)
/** 00:30 winter time, 28 March 2027, half an hour before the skipped hour. */
const BEFORE_THE_SKIP = Date.UTC(2027, 2, 28, 0, 30, 0)
/** 02:30 summer time, 28 March 2027, half an hour after the skipped hour, and an hour after the one above. */
const AFTER_THE_SKIP = Date.UTC(2027, 2, 28, 1, 30, 0)
/** Noon, 2 November 2026, in winter time and far from either change of the clocks. */
const NOON_IN_NOVEMBER = Date.UTC(2026, 10, 2, 12, 0, 0)
/** 11:00 the same day, an hour before. */
const AN_HOUR_BEFORE_NOON = Date.UTC(2026, 10, 2, 11, 0, 0)

const WORKSPACE = 'default'
const HUMAN = { type: 'human', id: THE_PERSON } as const
const THE_WORDS = 'A made-up word.'
const THE_CHANGED_WORDS = 'A made-up word, changed.'

let t: TestDb
let messages: Messages
let window: number
let reader: { id: string }
let theZoneBefore: string | undefined

beforeAll(async () => {
  theZoneBefore = process.env.TZ
  process.env.TZ = 'Europe/London'
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  messages = await import('../src/server/lib/messages.ts')
  window = (await import('../src/server/lib/env.ts')).messageEditWindowSeconds()
  t.api.createRecord({ workspaceId: WORKSPACE, kind: 'agent', title: 'reads-the-made-up-words', data: { handle: 'reads-the-made-up-words', runtime: 'claude-code', state: 'active' }, actor: HUMAN })
  reader = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('reads-the-made-up-words') as { id: string }
}, 60_000)

afterEach(() => {
  vi.useRealTimers()
})

afterAll(() => {
  t?.close()
  vi.unstubAllEnvs()
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
})

/** A message the person writes to the made-up agent, through the record door, on the clock as it is set. */
function aMessage(): string {
  return t.api.createRecord({ workspaceId: WORKSPACE, kind: 'message', title: 'a made-up word', data: { body: THE_WORDS, to: [{ kind: 'agent', id: reader.id }] }, actor: HUMAN }).id
}

/** Until when the message's words may change, as the message is read. */
function untilWhen(id: string): string | null {
  return messages.readMessage(id).wordsMayChangeUntil
}

/** The writer changes the message's words through the record door, on the clock as it is set. */
function change(id: string): void {
  t.api.patchRecord(id, { dataPatch: { body: THE_CHANGED_WORDS } }, HUMAN)
}

/** The words the message holds now. */
function theWordsOf(id: string): unknown {
  return (t.api.getRecord(id)!.data as Record<string, unknown>)['body']
}

describe('a message written in the repeated hour may be changed for its whole window', () => {
  it('1. a message written at 01:10 winter time may be changed until its window after 01:10, and is changed a minute later', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SECOND_PASS_AT_TEN_PAST })
    const id = aMessage()

    vi.setSystemTime(SECOND_PASS_AT_TEN_PAST + MINUTE)
    expect(untilWhen(id)).toBe(new Date(SECOND_PASS_AT_TEN_PAST + window * 1000).toISOString())
    change(id)
    expect(theWordsOf(id)).toBe(THE_CHANGED_WORDS)
  })

  it('2. on the night the clocks go forward, each message may be changed for its window after it was written', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: BEFORE_THE_SKIP })
    const before = aMessage()
    expect(untilWhen(before)).toBe(new Date(BEFORE_THE_SKIP + window * 1000).toISOString())

    vi.setSystemTime(AFTER_THE_SKIP)
    const after = aMessage()
    expect(untilWhen(after)).toBe(new Date(AFTER_THE_SKIP + window * 1000).toISOString())
    vi.setSystemTime(AFTER_THE_SKIP + MINUTE)
    change(after)
    expect(theWordsOf(after)).toBe(THE_CHANGED_WORDS)
  })

  it('3. control: a message with no moment beside its stamp is read from its words, as before', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SECOND_PASS_AT_TEN_PAST })
    const id = aMessage()
    // WRITTEN BY HAND, AS A MESSAGE WRITTEN BEFORE THE RECORD DOOR KEPT ITS MOMENT: the door's own row, with that moment
    // taken out. Without the code there is nothing to take out, and the row is left as it is.
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.writtenTime') WHERE id = ?").run(id)

    // Its words read as the first pass, 00:10 UTC, so at 01:11 winter time its window closed an hour ago.
    vi.setSystemTime(SECOND_PASS_AT_TEN_PAST + MINUTE)
    expect(untilWhen(id)).toBe(new Date(FIRST_PASS_AT_TEN_PAST + window * 1000).toISOString())
    expect(() => change(id)).toThrow(expect.objectContaining({ status: 403 }))
    expect(theWordsOf(id)).toBe(THE_WORDS)
  })

  it('4. a message whose moment cannot be read may be changed by nobody', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SECOND_PASS_AT_TEN_PAST })
    const id = aMessage()
    // WRITTEN BY HAND, BECAUSE NO DOOR WRITES A MOMENT THAT CANNOT BE READ: the door's own row, with its moment spoiled.
    // Its date and time are kept, so it still names its stamp, and its offset is one no clock has.
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.writtenTime.instant', substr(json_extract(data, '$.writtenTime.instant'), 1, 23) || '+25:00') WHERE id = ?")
      .run(id)
    const spoiled = t.client.sqlite.prepare("SELECT json_extract(data, '$.writtenTime.instant') AS instant FROM records WHERE id = ?").get(id) as { instant: string }
    expect(spoiled.instant).toBe('2026-10-25T01:10:00.000+25:00')

    vi.setSystemTime(SECOND_PASS_AT_TEN_PAST + MINUTE)
    expect(untilWhen(id)).toBeNull()
    expect(() => change(id)).toThrow(expect.objectContaining({ status: 409 }))
    expect(theWordsOf(id)).toBe(THE_WORDS)
  })

  it('5. a stamp changed alone is read from its words, as before', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOON_IN_NOVEMBER })
    const id = aMessage()
    // WRITTEN BY HAND, AS A TEST OR A WRITER THAT KNOWS ONLY THE STAMP AGES A MESSAGE: the door's own row, with its stamp
    // set an hour back and its moment left as the door wrote it. The record door never changes the stamp alone.
    t.client.sqlite.prepare("UPDATE records SET created_at = '2026-11-02 11:00:00' WHERE id = ?").run(id)

    // The moment names noon, not 11:00, so it is passed over, and the window runs from 11:00: at 12:01 it has closed.
    vi.setSystemTime(NOON_IN_NOVEMBER + MINUTE)
    expect(untilWhen(id)).toBe(new Date(AN_HOUR_BEFORE_NOON + window * 1000).toISOString())
    expect(() => change(id)).toThrow(expect.objectContaining({ status: 403 }))
    expect(theWordsOf(id)).toBe(THE_WORDS)
  })
})
