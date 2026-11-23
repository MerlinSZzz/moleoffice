// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT ACTIVE IN THE REPEATED HOUR IS NOT REMINDED EARLY THAT IT IS IDLE.
 *
 * On 25 October 2026 the clocks in Europe/London go back an hour at 02:00 summer time, so the hour from 01:00 comes
 * twice: first in summer time (00:00 to 01:00 UTC), then in winter time (01:00 to 02:00 UTC). On 28 March 2027 they go
 * forward an hour at 01:00, so the hour from 01:00 to 02:00 never comes.
 *
 * The idle reminder tells an agent it has been idle once an hour has passed since its newest activity: a message it
 * sent or was sent, a run filed for it, output a run of it wrote down, or a use of a tool on its run. Each of those
 * says when it happened as a local stamp with no offset, and the reminder read every stamp as the first pass of the
 * repeated hour. So an agent that sent a message at 01:10 winter time was reminded at 01:40 winter time, half an hour
 * later, as if it had been quiet since 00:10 UTC. Each of those now keeps the moment of its stamp beside it. That
 * moment only says which pass of the hour its stamp means, so the reminder reads it only when it names the stamp beside
 * it: its first 19 characters are the stamp, with T for the space. A stamp changed without its moment is read from its
 * words, as before.
 *
 * WHAT IS PROVED, against a throwaway database, with this process's zone set to Europe/London and its clock set here.
 * Every message and run is filed through the record door, and every use through the use door's own function, except
 * the rows cases 5 and 6 change by hand, which say why. The reminders are sent as the minute's pass sends them.
 *
 *   1. An agent that sends a message at 01:10 winter time on 25 October, and the agent it sends it to, are not reminded
 *      at 01:40 winter time. Both are reminded at 02:11 winter time, an hour and a minute later.
 *   2. The same holds for a run filed at 01:10 winter time, for output written down at 01:10 winter time on a run filed
 *      in the first pass, and for a use of a tool at 01:10 winter time on such a run.
 *   3. On 28 March 2027, an agent that sends a message at 00:30 winter time is not reminded at 02:20 summer time, and
 *      is at 02:31 summer time.
 *   4. Control: an agent sent a message at 01:05 summer time and reminded at 01:10 winter time is not reminded again at
 *      01:11 winter time.
 *   5. Control: a message, a run, output and a use with no moment beside their stamps are read from their words, as
 *      before. Their stamps say 01:10, which reads as 00:10 UTC, so at 01:40 winter time each of their agents is
 *      reminded.
 *   6. A stamp changed alone is read from its words, as before. A message, a run, output and a use at noon on
 *      2 November 2026, with their stamps then set to 11:00, have each of their agents reminded at 12:30. And an agent
 *      reminded at 11:01, whose reminder's stamp is then set to 09:30, before the activity it answered, is reminded
 *      again at 12:30.
 *
 * Without the code, cases 1 and 2 are red: every agent in them is reminded at 01:40 winter time. Cases 3, 4, 5 and 6
 * are green. A reminder that reads the moment whenever it is there, without asking whether it names its stamp, turns
 * case 6 red: it reads each activity at noon and the reminder at 11:01, and reminds none of those agents at 12:30.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { clockStamp } from '../src/shared/time.ts'
import { freshDb, type TestDb } from './helpers.ts'

type Reminders = typeof import('../src/server/lib/reminders.ts')
type Toolset = typeof import('../src/server/lib/toolset.ts')

const MINUTE = 60_000

/** 00:30 summer time, 25 October 2026, before the repeated hour: when the watcher in cases 1, 2, 4 and 5 started. */
const BEFORE_THE_REPEATED_HOUR = Date.UTC(2026, 9, 24, 23, 30, 0)
/** 01:05 summer time, 25 October 2026, in the first pass of the repeated hour. */
const FIRST_PASS_AT_FIVE_PAST = Date.UTC(2026, 9, 25, 0, 5, 0)
/** 01:10 winter time, 25 October 2026, in the second pass of the repeated hour. */
const SECOND_PASS_AT_TEN_PAST = Date.UTC(2026, 9, 25, 1, 10, 0)
/** 00:00 winter time, 28 March 2027: when the watcher in case 3 started. */
const THE_NIGHT_OF_THE_SKIP = Date.UTC(2027, 2, 28, 0, 0, 0)
/** 00:30 winter time, 28 March 2027, half an hour before the skipped hour. */
const BEFORE_THE_SKIP = Date.UTC(2027, 2, 28, 0, 30, 0)
/** 09:00, 2 November 2026, in winter time and far from either change of the clocks: when the watcher in case 6 started. */
const NINE_IN_NOVEMBER = Date.UTC(2026, 10, 2, 9, 0, 0)
/** 10:00 the same day. */
const TEN_IN_NOVEMBER = Date.UTC(2026, 10, 2, 10, 0, 0)
/** 10:30 the same day. */
const HALF_PAST_TEN_IN_NOVEMBER = Date.UTC(2026, 10, 2, 10, 30, 0)
/** Noon the same day. */
const NOON_IN_NOVEMBER = Date.UTC(2026, 10, 2, 12, 0, 0)

const WORKSPACE = 'default'
const HUMAN = { type: 'human', id: THE_PERSON } as const
const TOOL = 'made-up-copy'

let t: TestDb
let reminders: Reminders
let toolset: Toolset
let theZoneBefore: string | undefined

beforeAll(() => {
  theZoneBefore = process.env.TZ
  process.env.TZ = 'Europe/London'
})

beforeEach(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  toolset = await import('../src/server/lib/toolset.ts')
  // THE ROLE CARDS ARE READ ONCE, AS THE SERVER READS THEM WHEN IT STARTS: a reminder names a card's duties.
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  // A TOOL FOR THE USE DOOR TO WRITE A USE OF.
  const category = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'tool_category', title: 'Made-up tools', data: { says: 'Made up.' }, actor: HUMAN }).id
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'tool',
    title: 'Made-up copy',
    data: { entry: 'tool', slug: TOOL, forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' },
    actor: HUMAN,
  })
}, 60_000)

afterEach(() => {
  vi.useRealTimers()
  t?.close()
  vi.unstubAllEnvs()
})

afterAll(() => {
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
})

/** One agent the office registered as a worker, by handle, with its registry id. */
function anAgent(handle: string): { handle: string; id: string } {
  t.api.createRecord({ workspaceId: WORKSPACE, kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active', role: 'worker' }, actor: HUMAN })
  const { id } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  return { handle, id }
}

/** A message the agent `from` writes to the agent `to`, through the record door, on the clock as it is set. */
function aMessage(from: { handle: string }, to: { id: string }): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'message',
    title: 'a made-up word',
    data: { body: 'A made-up word.', to: [{ kind: 'agent', id: to.id }] },
    actor: { type: 'agent', id: from.handle },
  }).id
}

/** A running run filed for the agent through the record door, on the clock as it is set. */
function aRunFor(agent: { id: string }): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'a made-up run',
    data: { state: 'running', runtime: 'claude-code', servingAgent: agent.id, deliveringMessage: 'none-here' },
    actor: HUMAN,
  }).id
}

/** Output written down on the run now, as its worker writes it: the stamp and its moment from one clock reading. */
function outputWrittenDownNow(run: string): void {
  const reading = clockStamp()
  t.api.patchRecord(run, { dataPatch: { lastOutputAt: reading.stamp, lastOutputTime: reading } }, HUMAN)
}

/** One use of the made-up tool on the run, through the use door's own function, on the clock as it is set. */
function aUseOn(run: string): void {
  toolset.writeAUse({ workspaceId: WORKSPACE, actor: { ...HUMAN, sessionId: run }, tool: TOOL, said: 'make: a made-up use' })
}

/** The handles reminded that they are idle by the minute's pass at `now`, with the clock set to `now`. */
function remindedAt(now: number, watchingSince: number): string[] {
  vi.setSystemTime(now)
  return reminders.sendTheRemindersThatAreDue(WORKSPACE, new Date(now), new Date(watchingSince)).idleReminded
}

describe('an agent active in the repeated hour is not reminded early that it is idle', () => {
  it('1. an agent that sends a message at 01:10 winter time, and the agent it sends to, are reminded an hour later and not before', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SECOND_PASS_AT_TEN_PAST })
    const writer = anAgent('writes-in-the-second-pass')
    const reader = anAgent('is-written-to-in-the-second-pass')
    aMessage(writer, reader)

    const early = remindedAt(SECOND_PASS_AT_TEN_PAST + 30 * MINUTE, BEFORE_THE_REPEATED_HOUR)
    expect(early, 'the agents reminded half an hour after the message').not.toContain(writer.handle)
    expect(early, 'the agents reminded half an hour after the message').not.toContain(reader.handle)
    const due = remindedAt(SECOND_PASS_AT_TEN_PAST + 61 * MINUTE, BEFORE_THE_REPEATED_HOUR)
    expect(due, 'the agents reminded an hour and a minute after the message').toEqual(expect.arrayContaining([writer.handle, reader.handle]))
  })

  it('2. a run filed, output written down and a use made at 01:10 winter time keep their agents from an early reminder', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: FIRST_PASS_AT_FIVE_PAST })
    const writing = anAgent('output-in-the-second-pass')
    const writingRun = aRunFor(writing)
    const using = anAgent('a-use-in-the-second-pass')
    const usingRun = aRunFor(using)

    vi.setSystemTime(SECOND_PASS_AT_TEN_PAST)
    const filed = anAgent('a-run-filed-in-the-second-pass')
    aRunFor(filed)
    outputWrittenDownNow(writingRun)
    aUseOn(usingRun)

    const handles = [filed.handle, writing.handle, using.handle]
    const early = remindedAt(SECOND_PASS_AT_TEN_PAST + 30 * MINUTE, BEFORE_THE_REPEATED_HOUR)
    for (const handle of handles) expect(early, `the agents reminded half an hour after ${handle}'s activity`).not.toContain(handle)
    const due = remindedAt(SECOND_PASS_AT_TEN_PAST + 61 * MINUTE, BEFORE_THE_REPEATED_HOUR)
    expect(due, 'the agents reminded an hour and a minute after their activity').toEqual(expect.arrayContaining(handles))
  })

  it('3. on the night the clocks go forward, an agent that sends a message before the skipped hour is reminded an hour later', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: BEFORE_THE_SKIP })
    const writer = anAgent('writes-before-the-skip')
    aMessage(writer, anAgent('is-written-to-before-the-skip'))

    expect(remindedAt(BEFORE_THE_SKIP + 50 * MINUTE, THE_NIGHT_OF_THE_SKIP), 'the agents reminded at 02:20 summer time').not.toContain(writer.handle)
    expect(remindedAt(BEFORE_THE_SKIP + 61 * MINUTE, THE_NIGHT_OF_THE_SKIP), 'the agents reminded at 02:31 summer time').toContain(writer.handle)
  })

  it('4. control: an agent reminded at 01:10 winter time after a message at 01:05 summer time is not reminded again a minute later', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: FIRST_PASS_AT_FIVE_PAST })
    const reader = anAgent('is-written-to-in-the-first-pass')
    aMessage(anAgent('writes-in-the-first-pass'), reader)

    expect(remindedAt(SECOND_PASS_AT_TEN_PAST, BEFORE_THE_REPEATED_HOUR), 'the agents reminded at 01:10 winter time').toContain(reader.handle)
    expect(remindedAt(SECOND_PASS_AT_TEN_PAST + MINUTE, BEFORE_THE_REPEATED_HOUR), 'the agents reminded at 01:11 winter time').not.toContain(reader.handle)
  })

  it('5. control: activity with no moment beside its stamp is read from its words, as before', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: FIRST_PASS_AT_FIVE_PAST })
    const writing = anAgent('output-with-no-moment')
    const writingRun = aRunFor(writing)
    const using = anAgent('a-use-with-no-moment')
    const usingRun = aRunFor(using)

    vi.setSystemTime(SECOND_PASS_AT_TEN_PAST)
    const writer = anAgent('writes-with-no-moment')
    const message = aMessage(writer, anAgent('is-written-to-with-no-moment'))
    const filed = anAgent('a-run-filed-with-no-moment')
    const filedRun = aRunFor(filed)
    // WRITTEN BY HAND, AS A MESSAGE AND A RUN FILED BEFORE A RECORD KEPT THE MOMENT IT WAS FILED: the door's own rows,
    // with that moment taken out. Without the code there is nothing to take out, and the rows are left as they are.
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.writtenTime') WHERE id = ?").run(message)
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.filedTime') WHERE id = ?").run(filedRun)
    // Output written down as a run wrote it before a moment was kept beside it: the stamp alone.
    t.api.patchRecord(writingRun, { dataPatch: { lastOutputAt: '2026-10-25 01:10:00' } }, HUMAN)
    // WRITTEN BY HAND, AS A USE WRITTEN BEFORE A USE KEPT ITS MOMENT: the columns the use door wrote then. No door
    // writes a use without its moment now.
    t.client.sqlite
      .prepare(
        "INSERT INTO tool_uses (id, workspace_id, run_id, seq, at, tool, said, actor_type, actor_id) VALUES ('a-made-up-old-use', ?, ?, 1, '2026-10-25 01:10:00', ?, 'make: a made-up use', 'human', ?)",
      )
      .run(WORKSPACE, usingRun, TOOL, THE_PERSON)

    // Their words read as the first pass, 00:10 UTC, so at 01:40 winter time each is an hour and a half old.
    const reminded = remindedAt(SECOND_PASS_AT_TEN_PAST + 30 * MINUTE, BEFORE_THE_REPEATED_HOUR)
    expect(reminded, 'the agents reminded at 01:40 winter time').toEqual(expect.arrayContaining([writer.handle, filed.handle, writing.handle, using.handle]))
  })

  it('6. activity and a reminder with their stamps changed alone are read from their words, as before', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: TEN_IN_NOVEMBER })
    const remindedOnce = anAgent('reminded-before-its-stamp-changed-alone')
    aRunFor(remindedOnce)
    vi.setSystemTime(HALF_PAST_TEN_IN_NOVEMBER)
    const writing = anAgent('output-with-its-stamp-changed-alone')
    const writingRun = aRunFor(writing)
    const using = anAgent('a-use-with-its-stamp-changed-alone')
    const usingRun = aRunFor(using)
    expect(remindedAt(TEN_IN_NOVEMBER + 61 * MINUTE, NINE_IN_NOVEMBER), 'the agents reminded at 11:01').toContain(remindedOnce.handle)

    vi.setSystemTime(NOON_IN_NOVEMBER)
    const writer = anAgent('writes-with-its-stamp-changed-alone')
    const reader = anAgent('written-to-with-its-stamp-changed-alone')
    const message = aMessage(writer, reader)
    const filed = anAgent('a-run-filed-with-its-stamp-changed-alone')
    const filedRun = aRunFor(filed)
    outputWrittenDownNow(writingRun)
    aUseOn(usingRun)
    // WRITTEN BY HAND, AS A TEST OR A WRITER THAT KNOWS ONLY THE STAMP AGES A MESSAGE, A RUN, OUTPUT OR A USE: the doors'
    // own rows, with each stamp set an hour back and its moment left as the door wrote it. No door changes the stamp alone.
    const anHourBack = '2026-11-02 11:00:00'
    t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id IN (?, ?)').run(anHourBack, message, filedRun)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.lastOutputAt', ?) WHERE id = ?").run(anHourBack, writingRun)
    t.client.sqlite.prepare('UPDATE tool_uses SET at = ? WHERE run_id = ?').run(anHourBack, usingRun)
    // WRITTEN BY HAND IN THE SAME WAY: the reminder the minute's pass wrote at 11:01, with its stamp set to 09:30, before
    // the run filed at 10:00 that it answered.
    const theReminder = t.client.sqlite
      .prepare(
        "UPDATE records SET created_at = '2026-11-02 09:30:00' WHERE json_extract(data, '$.body') = ? AND id IN (SELECT message_id FROM message_delivery WHERE recipient_kind = 'agent' AND recipient_id = ?)",
      )
      .run(SYSTEM_LINES.youHaveBeenIdle('').line, remindedOnce.id)
    expect(theReminder.changes, 'the idle reminders written to the agent reminded at 11:01').toBe(1)

    // Each moment names a time its stamp no longer says, so it is passed over. The stamps say 11:00, so at 12:30 each
    // agent is an hour and a half idle, and the reminder at 09:30 is older than the activity at 10:00 it answered.
    const reminded = remindedAt(NOON_IN_NOVEMBER + 30 * MINUTE, NINE_IN_NOVEMBER)
    for (const agent of [writer, reader, filed, writing, using, remindedOnce]) expect(reminded, 'the agents reminded at 12:30').toContain(agent.handle)
  })
})
