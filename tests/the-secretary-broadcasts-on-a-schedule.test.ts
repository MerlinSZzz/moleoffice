// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARY'S BROADCAST: A SCHEDULE, A REMINDER, A BROADCAST AND A PAUSE.
 *
 * By a decision on a message, every secretary broadcasts on a schedule of its own, the office reminds it before each
 * slot, and when the last three broadcasts have gone unanswered the office pauses the schedule and tells it
 * once. The acceptance criteria are B1 to B7 in
 * design/agents/BROADCAST-ACCEPTANCE.md.
 *
 * WHAT THIS FILE PROVES. The three settings are the owner's declared numbers. A schedule is made when the
 * secretary card is given and never a second one; it is brought back for a secretary that lacks one,
 * and it ends at retirement. The reminder goes at slot minus the lead, once for that slot and not
 * again. A message from the secretary to the person that names the slot is recognised. Three
 * unanswered broadcasts pause the schedule, the secretary is told once, no reminder follows, and one
 * answer from the person starts it again. The profile read carries the reading a page draws.
 *
 * WHERE THE RULES LIVE. src/server/lib/broadcast.ts holds the schedule, the recognition and the
 * pause; `sendTheBroadcastRemindersThatAreDue` is one tick of it. The three settings are declared in
 * src/config/settings.mjs and read in src/server/lib/env.ts. The schedule lives in the agent record's
 * existing `extra` field, so no kind, table or field was added.
 *
 * MUTATION PROOF, named, after a control run: in src/server/lib/broadcast.ts, `thePauseReadingFor`
 * is made to answer `paused: false` always (the line `const paused = last.length === limit &&
 * !answered` becomes `const paused = false`). The pause case below goes red; the file is restored
 * byte-identical, sha256 checked before and after.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'

// THE LINE EVERY SCHEDULED REPORT REMINDER CARRIES, on a decision and point 1 of a
// message. It is the criterion, so it is spelt here rather than
// imported.
const THE_OWNER_CHECK = '再查一遍：有哪些工作被 owner 卡住，有哪些事在等他决定。每一件都要在你自己的清单（checklist）里有一项，状态是 waiting on the owner，并且开着提醒；怎么做见流程 The decision reminder。'
// THE LINE THAT FOLLOWS IT, on a later decision (point 4): the reminder before each report slot
// tells the secretary to tidy its own checklist the way the lesson behind that decision says. Spelt here for the same reason.
const THE_CHECKLIST_TIDY = '再整理一下你自己的清单，只留三种项：常设项（standing）、你负责的每个流程（pipeline）各一项（写明它的下一步）、一天内能做完又不等任何事的项；要等别的工作、要按顺序做或一时做不完的，都改成流程里的一个步骤（block），写明它在等什么；不属于任何设计的杂事放进一个待办流程（backlog）；移走的项标成 superseded 并链接到它的步骤，这样写过的东西不会丢。'
// AND THE THIRD SENTENCE, on a later decision: the reminder before each report slot also asks the
// secretary to tidy the owner's checklist. Spelt here for the same reason.
const THE_OWNERS_CHECKLIST_TIDY = '再整理一下 owner 的清单（checklist）：他已经做完的项，按他的原话标 done（onThePersonsWords）或请他勾掉；被后来的消息取代的项标 superseded 并链接那条消息；新的、要他看或要他定的东西挂上去；每项标题写短，一句话概括，不写成小作文；改完给他发一句，说明改了哪几项。'
// AND THE LINE AFTER THEM ON A NEW SECRETARY. Since that decision the office gives a new
// secretary one item, to read its handbook, so its reminder ends with that one open item until it marks the item done.
const ITS_HANDBOOK_ITEM_IS_OPEN = 'Your checklists have 1 open item. None is waiting on the owner. Read them with GET /api/checklists.'
import { THE_PERSON } from '../src/shared/person.ts'
import { gateDefaultHere, readSetting } from '../src/config/settings.mjs'
import { gateNamed } from '../src/config/gates.mjs'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')
type BroadcastLib = typeof import('../src/server/lib/broadcast.ts')
type EnvLib = typeof import('../src/server/lib/env.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib
let broadcast: BroadcastLib
let env: EnvLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The real clock, once, so every fake moment in this file is measured from the operator's day. */
const R0 = new Date()

/** A moment on the local day of `R0`, moved by whole days. */
function theDay(days: number): { y: number; m: number; d: number } {
  const when = new Date(R0.getFullYear(), R0.getMonth(), R0.getDate() + days)
  return { y: when.getFullYear(), m: when.getMonth(), d: when.getDate() }
}

async function post(path: string, body: unknown, headers = AS_THE_PERSON): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/**
 * The registry id each registration answered, by handle. A new agent's id is not its handle, and
 * the library calls and the stored rows below take the id.
 */
const idOf: Record<string, string> = {}

async function register(handle: string, role: string): Promise<void> {
  const { code, said } = await post('/api/agents/started', { handle, name: handle, role })
  expect(code, `registering ${handle} as ${role}: ${JSON.stringify(said).slice(0, 300)}`).toBe(201)
  idOf[handle] = (said as { agent: { id: string } }).agent.id
}

/** One message from the secretary to the person, its body naming the slot back. `agentId` is the registry id. */
function aBroadcast(agentId: string, slot: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'broadcast',
    data: {
      body: `${slot} 进度；需要决策；问题`,
      to: [{ kind: 'person', id: THE_PERSON }],
      sentBy: { kind: 'agent', id: agentId },
    },
    actor: { type: 'agent', id: agentId },
  }).id
}

/** One message from the person to the secretary. `agentId` is the registry id. */
function anAnswerTo(agentId: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'answer',
    data: { body: 'Go ahead.', to: [{ kind: 'agent', id: agentId }], sentBy: { kind: 'person', id: THE_PERSON } },
    actor: { type: 'human', id: THE_PERSON },
  }).id
}

/** The office reminder lines already written to one agent for one slot occurrence. */
function reminderLinesTo(handle: string, occurrence: string): { body: string; saidInFull?: string }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.extra.broadcastSlot') = ?",
      )
      .all(occurrence) as { data: string }[]
  ).map((one) => JSON.parse(one.data) as { body: string; saidInFull?: string })
}

/** The office pause lines already written to one agent. */
function pauseLinesTo(handle: string): { body: string }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.extra.broadcastPause') = 1",
      )
      .all() as { data: string }[]
  ).map((one) => JSON.parse(one.data) as { body: string })
}

beforeAll(async () => {
  // THREE SLOTS ARE SET IN THIS SUITE, whatever the checkout's own `.env` says, so a test about the
  // reminder's timing is about the product and not about one machine's configuration. The default is
  // two slots (decision neHefMNZkJDU); the third here gives the cases a slot that is not the day's last.
  // tests/a-fresh-office-broadcasts-twice-a-day.test.ts holds what an office with the default does.
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,13:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_LEAD_MINUTES = '30'
  process.env.MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT = '3'
  // NO REPORT TEMPLATE IN THIS SUITE, so the reminder lines below are the lines without one. The
  // template's own lines are proved in tests/the-secretary-report-reminders-carry-the-template.test.ts.
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  broadcast = await import('../src/server/lib/broadcast.ts')
  env = await import('../src/server/lib/env.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('B2: the three settings are declared with their defaults', () => {
  it('declares the three, with their declared defaults', () => {
    expect(readSetting('MOLE_OFFICE_BROADCAST_TIMES', {}).value).toBe('07:00,18:00')
    expect(readSetting('MOLE_OFFICE_BROADCAST_LEAD_MINUTES', {}).value).toBe('30')
    // THE PAUSE'S DEFAULT IS ITS GATE ROW'S, read where the row declares it rather than copied here: the row is
    // pinned in tests/the-gates-have-one-list-and-one-reading.test.ts.
    expect(readSetting('MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT', {}).value).toBe(gateDefaultHere(gateNamed('broadcast-pause')))
  })

  it('reads them through the declaration, and refuses a time that is not one', () => {
    expect(env.broadcastTimes()).toEqual(['07:00', '13:00', '18:00'])
    expect(env.broadcastLeadMinutes()).toBe(30)
    expect(env.broadcastUnansweredLimit()).toBe(3)
    const before = process.env.MOLE_OFFICE_BROADCAST_TIMES
    process.env.MOLE_OFFICE_BROADCAST_TIMES = 'nonsense'
    expect(() => env.broadcastTimes()).toThrow('not a time of day')
    process.env.MOLE_OFFICE_BROADCAST_TIMES = before
  })
})

describe('B1: one schedule per secretary, made at the card door and ended at retirement', () => {
  it('a registration naming the secretary card makes one schedule', async () => {
    await register(THE_TEST_OFFICES_SECRETARY.handle, 'secretary')
    const held = broadcast.theBroadcastScheduleOf(idOf[THE_TEST_OFFICES_SECRETARY.handle]!)
    expect(held, 'the office made a schedule for the new secretary').not.toBeNull()
    expect(held?.endedAt).toBeNull()
  })

  it('a second reconciliation makes no second schedule', async () => {
    const before = broadcast.theBroadcastScheduleOf(idOf[THE_TEST_OFFICES_SECRETARY.handle]!)
    broadcast.syncTheBroadcastSchedules()
    broadcast.syncTheBroadcastSchedules()
    const after = broadcast.theBroadcastScheduleOf(idOf[THE_TEST_OFFICES_SECRETARY.handle]!)
    expect(after?.madeAt).toBe(before?.madeAt)
  })

  it('a secretary that lacks one is brought in step', async () => {
    // THE STATE A SERVER START MEETS: a secretary whose agent record carries no schedule.
    const found = (t.client.sqlite
      .prepare("SELECT r.id AS id FROM agent_records m JOIN records r ON r.id = m.record_id WHERE m.agent_id = ?")
      .get(idOf[THE_TEST_OFFICES_SECRETARY.handle]) as { id: string }).id
    const read = t.api.getRecord(found)
    expect(read).not.toBeNull()
    const data = read?.data as Record<string, unknown>
    const extra = { ...(data['extra'] as Record<string, unknown>) }
    delete extra['broadcastSchedule']
    writeDataBypassingTheGate(t, found, { ...data, extra })
    expect(broadcast.theBroadcastScheduleOf(idOf[THE_TEST_OFFICES_SECRETARY.handle]!)).toBeNull()
    broadcast.syncTheBroadcastSchedules()
    expect(broadcast.theBroadcastScheduleOf(idOf[THE_TEST_OFFICES_SECRETARY.handle]!)).not.toBeNull()
  })

  it('a plain worker gets none', async () => {
    await register('w-one', 'worker')
    expect(broadcast.theBroadcastScheduleOf(idOf['w-one']!)).toBeNull()
  })

  it('a retired secretary\u2019s schedule ends', async () => {
    const { code, said } = await post(`/api/participants/agent/${THE_TEST_OFFICES_SECRETARY.handle}/retire`, { because: 'Her work is done.' })
    expect(code, JSON.stringify(said).slice(0, 300)).toBe(200)
    expect(broadcast.theBroadcastScheduleOf(idOf[THE_TEST_OFFICES_SECRETARY.handle]!)?.endedAt).not.toBeNull()
  })
})

describe('B3: the reminder goes at slot minus the lead, once for the slot', () => {
  const SLOT = '13:00'

  function theSlotMoment(days: number): Date {
    const day = theDay(days)
    return new Date(day.y, day.m, day.d, 13, 0, 0, 0)
  }

  function theOccurrence(days: number): string {
    return localStamp(theSlotMoment(days)).slice(0, 16)
  }

  it('a reminder is sent in the window and not before it', async () => {
    await register('scribe', 'secretary')
    const watchingSince = new Date(R0.getTime() - 86_400_000)
    const before = new Date(theSlotMoment(0).getTime() - 31 * 60_000)
    const early = reminders.sendTheRemindersThatAreDue('default', before, watchingSince)
    expect(early.broadcastsReminded).not.toContain(idOf['scribe'])
    const inWindow = new Date(theSlotMoment(0).getTime() - 29 * 60_000)
    const due = reminders.sendTheRemindersThatAreDue('default', inWindow, watchingSince)
    expect(due.broadcastsReminded, JSON.stringify(due).slice(0, 300)).toContain(idOf['scribe'])
    const lines = reminderLinesTo('scribe', theOccurrence(0))
    expect(lines).toHaveLength(1)
    expect(lines[0]?.body).toBe(`${SLOT} 秘书汇报工作`)
  })

  it('the same slot is never reminded twice, and the next day is a new slot', async () => {
    const watchingSince = new Date(R0.getTime() - 86_400_000)
    const inWindow = new Date(theSlotMoment(0).getTime() - 29 * 60_000)
    reminders.sendTheRemindersThatAreDue('default', inWindow, watchingSince)
    expect(reminderLinesTo('scribe', theOccurrence(0))).toHaveLength(1)
    const tomorrow = new Date(theSlotMoment(1).getTime() - 29 * 60_000)
    const second = reminders.sendTheRemindersThatAreDue('default', tomorrow, watchingSince)
    expect(second.broadcastsReminded).toContain(idOf['scribe'])
    expect(reminderLinesTo('scribe', theOccurrence(1))).toHaveLength(1)
  })
})

describe('B7: the day\u2019s last reminder also says to check the backups, once a day', () => {
  function theMoment(days: number, hours: number): Date {
    const day = theDay(days)
    return new Date(day.y, day.m, day.d, hours, 0, 0, 0)
  }

  it('ships no sentence, so an office with nothing set reminds only of the slot, and the last slot of the day is the latest time', () => {
    // Since 2 October 2026 the product ships no sentence, by FLO-04 of a decision. Any sentence
    // names one lab's tools and habits, so it belongs in that office's own .env.
    expect(readSetting('MOLE_OFFICE_BROADCAST_BACKUP_REMINDER', {}).value).toBeNull()
    expect(broadcast.theLastSlotOfTheDay()).toBe('18:00')
  })

  it('the 18:00 reminder carries the sentence behind its few words, the 07:00 and 13:00 ones do not, and an empty setting takes it out', async () => {
    await register('keeper', 'secretary')
    const watchingSince = new Date(R0.getTime() - 86_400_000)
    const occurrence = (days: number, hours: number) => localStamp(theMoment(days, hours)).slice(0, 16)
    // The office's own sentence, as an office writes it in its .env.
    const before = process.env.MOLE_OFFICE_BROADCAST_BACKUP_REMINDER
    process.env.MOLE_OFFICE_BROADCAST_BACKUP_REMINDER = 'Check that today\u2019s new work has a second copy.'
    try {
      const sentence = env.broadcastBackupReminder()
      expect(sentence).toBe('Check that today\u2019s new work has a second copy.')
      for (const hours of [7, 13, 18]) {
        reminders.sendTheRemindersThatAreDue('default', new Date(theMoment(2, hours).getTime() - 29 * 60_000), watchingSince)
      }
      // EVERY SECRETARY STILL HOLDING THE CARD HERE GETS THE SAME LINE, so the lines are read as a set.
      // The line stays a few words (criterion M34); the sentence is the whole sentence behind it.
      const lines = [7, 13, 18].map((hours) => [...new Set(reminderLinesTo('keeper', occurrence(2, hours)).map((one) => `${one.body} | ${one.saidInFull ?? '-'}`))])
      expect(lines[0]).toEqual([`07:00 秘书汇报工作 | ${THE_OWNER_CHECK} ${THE_CHECKLIST_TIDY} ${THE_OWNERS_CHECKLIST_TIDY} ${ITS_HANDBOOK_ITEM_IS_OPEN}`])
      expect(lines[1]).toEqual([`13:00 秘书汇报工作 | ${THE_OWNER_CHECK} ${THE_CHECKLIST_TIDY} ${THE_OWNERS_CHECKLIST_TIDY} ${ITS_HANDBOOK_ITEM_IS_OPEN}`])
      expect(lines[2]).toEqual([`18:00 秘书汇报工作 | ${THE_OWNER_CHECK} ${THE_CHECKLIST_TIDY} ${THE_OWNERS_CHECKLIST_TIDY} ${String(sentence)} ${ITS_HANDBOOK_ITEM_IS_OPEN}`])

      process.env.MOLE_OFFICE_BROADCAST_BACKUP_REMINDER = ''
      expect(env.broadcastBackupReminder()).toBeNull()
      reminders.sendTheRemindersThatAreDue('default', new Date(theMoment(3, 18).getTime() - 29 * 60_000), watchingSince)
      expect([...new Set(reminderLinesTo('keeper', occurrence(3, 18)).map((one) => `${one.body} | ${one.saidInFull ?? '-'}`))]).toEqual([`18:00 秘书汇报工作 | ${THE_OWNER_CHECK} ${THE_CHECKLIST_TIDY} ${THE_OWNERS_CHECKLIST_TIDY} ${ITS_HANDBOOK_ITEM_IS_OPEN}`])
    } finally {
      if (before === undefined) delete process.env.MOLE_OFFICE_BROADCAST_BACKUP_REMINDER
      else process.env.MOLE_OFFICE_BROADCAST_BACKUP_REMINDER = before
    }
  })
})

describe('B4: a broadcast naming the slot is recognised', () => {
  it('a message from the secretary to the person that names the slot is the broadcast', () => {
    const before = broadcast.theBroadcastReadingFor(idOf['scribe']!, R0)
    const id = aBroadcast(idOf['scribe']!, '13:00')
    const after = broadcast.theBroadcastReadingFor(idOf['scribe']!, R0)
    expect(after.last?.slot).toBe('13:00')
    expect(after.last?.at).not.toBe(before.last?.at ?? null)
    expect(id).not.toBe('')
  })
})

describe('B5: three unanswered broadcasts pause, the secretary is told once, an answer resumes', () => {
  const SLOT = '18:00'

  beforeAll(async () => {
    await register('quiet', 'secretary')
  })

  it('the office sends no reminder while it is paused, and tells the secretary once', async () => {
    aBroadcast(idOf['quiet']!, SLOT)
    aBroadcast(idOf['quiet']!, SLOT)
    aBroadcast(idOf['quiet']!, SLOT)
    expect(broadcast.thePauseReadingFor(idOf['quiet']!).paused).toBe(true)
    const day = theDay(0)
    const due = new Date(day.y, day.m, day.d, 17, 45, 0, 0)
    const watchingSince = new Date(R0.getTime() - 86_400_000)
    const first = reminders.sendTheRemindersThatAreDue('default', due, watchingSince)
    expect(first.broadcastsPaused).toContain(idOf['quiet'])
    expect(first.broadcastsReminded).not.toContain(idOf['quiet'])
    expect(pauseLinesTo('quiet')).toHaveLength(1)
    reminders.sendTheRemindersThatAreDue('default', due, watchingSince)
    expect(pauseLinesTo('quiet')).toHaveLength(1)
  })

  it('one answer from the person starts it again', async () => {
    anAnswerTo(idOf['quiet']!)
    expect(broadcast.thePauseReadingFor(idOf['quiet']!).paused).toBe(false)
    const day = theDay(1)
    const due = new Date(day.y, day.m, day.d, 17, 45, 0, 0)
    const watchingSince = new Date(R0.getTime() - 86_400_000)
    const again = reminders.sendTheRemindersThatAreDue('default', due, watchingSince)
    expect(again.broadcastsReminded).toContain(idOf['quiet'])
  })
})

describe('B6: the page that draws a secretary\u2019s state carries the reading', () => {
  it('the profile read says the next slot, the last broadcast and whether it is paused', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/participants/agent/scribe', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
    const said = reply.json() as { participant: { broadcast?: { on: boolean; says: string[] } } }
    expect(said.participant.broadcast, 'a secretary has a broadcast reading').toBeTruthy()
    expect(said.participant.broadcast?.on).toBe(true)
    // THE SERVER'S SENTENCE CARRIES THE STAMP AS STORED; the page says it in the office's own words for a time.
    expect(said.participant.broadcast?.says.join(' ')).toMatch(/The next broadcast is \d{4}-\d{2}-\d{2} \d{2}:\d{2}\./)
  })
})
