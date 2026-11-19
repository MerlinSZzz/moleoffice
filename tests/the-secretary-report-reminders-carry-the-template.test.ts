// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARY'S REPORT REMINDERS: THE TEMPLATE, THE REQUIREMENT, AND ONE MORE REMINDER WHEN NO
 * REPORT HAS COME.
 *
 * Three decisions: the first makes every secretary's report an office report, with one short chat line that opens it,
 * and the third says the annotations on the secretary's report YcJRwBmhvppQ, part 3, are the
 * go-ahead. Part 3 says: the office's reminders before each
 * report carry a link to the template and the requirement, and when there is still no report 15 minutes after the slot,
 * the office reminds the secretary once more.
 *
 * WHAT THIS FILE PROVES, on the office's fake clock (one tick of `sendTheRemindersThatAreDue` at a
 * moment this file chooses):
 * 1. With MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE set, the 06:30 and the 17:30 reminder each carry a
 *    lead to the template and the requirement sentence, and the 17:30 one keeps its backup sentence.
 * 2. At 07:15 and 18:15 the office reminds a secretary once more only when it has no report for that
 *    slot, and only once.
 * 3. With the setting empty, the reminders carry no lead and no sentence about a template, and no
 *    second reminder goes.
 * 4. With the setting naming a record the office does not hold, the reminders say so, carry no lead,
 *    and no second reminder goes.
 *
 * WHERE THE RULES LIVE. src/server/lib/broadcast.ts: `theReportTemplate`, `theReportForTheSlot` and
 * `sendTheBroadcastRemindersThatAreDue`. The two settings are declared in src/config/settings.mjs and
 * read in src/server/lib/env.ts. No record id of any real office is written here: the template is a
 * note this file makes in its own empty office.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'

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

type RemindersLib = typeof import('../src/server/lib/reminders.ts')
type BroadcastLib = typeof import('../src/server/lib/broadcast.ts')
type EnvLib = typeof import('../src/server/lib/env.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib
let broadcast: BroadcastLib
let env: EnvLib

/** The template this file makes in its own office. */
let templateId = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The real clock, once, so every fake moment here is measured from the operator's day. */
const R0 = new Date()

/** A moment on the local day `days` after R0's, at hh:mm. */
function at(days: number, hours: number, minutes: number): Date {
  return new Date(R0.getFullYear(), R0.getMonth(), R0.getDate() + days, hours, minutes, 0, 0)
}

/** The slot occurrence the office writes on its lines: `YYYY-MM-DD HH:MM`. */
function occurrence(days: number, hours: number): string {
  return localStamp(at(days, hours, 0)).slice(0, 16)
}

/** One tick of the office's reminder watcher at `now`. */
function tick(now: Date): ReturnType<RemindersLib['sendTheRemindersThatAreDue']> {
  return reminders.sendTheRemindersThatAreDue('default', now, new Date(now.getTime() - 86_400_000))
}

const idOf: Record<string, string> = {}

async function register(handle: string, role: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle, name: handle, role },
  })
  expect(reply.statusCode, `registering ${handle}: ${reply.body.slice(0, 300)}`).toBe(201)
  idOf[handle] = (reply.json() as { agent: { id: string } }).agent.id
}

interface Line {
  body: string
  saidInFull?: string
  lead?: { target?: { kind?: string; recordId?: string; workspaceId?: string } }
}

/** The office lines to one agent that carry `mark` = `value` in their `extra` bag. */
function officeLinesTo(handle: string, mark: string, value: string): Line[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) " +
          "AND json_extract(data, '$.to[0].id') = ? AND json_extract(data, '$.extra.' || ?) = ?",
      )
      .all(idOf[handle], mark, value) as { data: string }[]
  ).map((one) => JSON.parse(one.data) as Line)
}

/** One chat line from a secretary to the person, carrying the slot mark and, when given, a lead. */
function aChatLine(handle: string, slot: string, leadTo: string | null): string {
  const agentId = idOf[handle]!
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'report line',
    data: {
      body: '老大，汇报在这里，点按钮打开。',
      to: [{ kind: 'person', id: THE_PERSON }],
      sentBy: { kind: 'agent', id: agentId },
      extra: { broadcastSlot: slot },
      ...(leadTo === null ? {} : { lead: { target: { kind: 'record', recordId: leadTo, workspaceId: 'default' } } }),
    },
    actor: { type: 'agent', id: agentId },
  }).id
}

/** A record of `kind` in this file's office. */
function aRecord(kind: 'report' | 'note', title: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind,
    title,
    data: kind === 'report' ? { blocks: [{ id: 'b-1', type: 'text', text: 'A made-up report for this test.' }] } : { body: 'A made-up template for this test.' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
}

/** The requirement sentence, as the office writes it with the two times this file sets. */
const THE_REQUIREMENT = '每天 07:00 和 18:00，按这份模板写一份报告，再在聊天里发一句话，带一个打开这份报告的按钮。'

beforeAll(async () => {
  // THE SETTINGS ARE FIXED HERE, whatever the checkout's own `.env` says, so a test about the
  // reminders is about the product and not about one machine's configuration.
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_LEAD_MINUTES = '30'
  process.env.MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT = '3'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES = '15'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  broadcast = await import('../src/server/lib/broadcast.ts')
  env = await import('../src/server/lib/env.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register('clerk', 'secretary')
  templateId = aRecord('note', 'The report template of this test')
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the two settings', () => {
  it('reads the template as nothing when the setting is empty, and the late minutes as a whole number', () => {
    expect(env.broadcastReportTemplate()).toBeNull()
    expect(env.broadcastReportLateMinutes()).toBe(15)
  })
})

describe('with a template set, both reminders carry the link and the sentence', () => {
  beforeAll(() => {
    process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = templateId
  })

  it('the 06:30 and the 17:30 reminder each lead to the template and say the requirement', () => {
    expect(tick(at(1, 6, 31)).broadcastsReminded).toContain(idOf['clerk'])
    expect(tick(at(1, 17, 31)).broadcastsReminded).toContain(idOf['clerk'])
    const morning = officeLinesTo('clerk', 'broadcastSlot', occurrence(1, 7))
    const evening = officeLinesTo('clerk', 'broadcastSlot', occurrence(1, 18))
    expect(morning).toHaveLength(1)
    expect(evening).toHaveLength(1)
    for (const line of [morning[0]!, evening[0]!]) {
      expect(line.lead?.target).toEqual({ kind: 'record', recordId: templateId, workspaceId: 'default' })
      expect(line.saidInFull ?? '').toContain(THE_REQUIREMENT)
      expect(line.saidInFull ?? '').toContain(`${THE_OWNER_CHECK} ${THE_CHECKLIST_TIDY}`)
    }
    expect(morning[0]!.body).toBe('07:00 秘书汇报工作')
    expect(evening[0]!.body).toBe('18:00 秘书汇报工作')
    expect(morning[0]!.saidInFull).toContain(`extra.broadcastSlot = "${occurrence(1, 7)}"`)
    // THE 17:30 REMINDER KEEPS ITS BACKUP CHECK, after the requirement.
    const backup = env.broadcastBackupReminder()
    if (backup !== null) expect(evening[0]!.saidInFull).toContain(backup)
    if (backup !== null) expect(morning[0]!.saidInFull ?? '').not.toContain(backup)
  })
})

describe('at 07:15 and 18:15, one more reminder goes only when there is no report for the slot', () => {
  beforeAll(() => {
    process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = templateId
  })

  it('a line with the slot mark but no lead to a report is not a report, so the 07:15 reminder goes, once', () => {
    aChatLine('clerk', occurrence(2, 7), null)
    aChatLine('clerk', occurrence(2, 7), aRecord('note', 'Not a report'))
    expect(tick(at(2, 7, 14)).broadcastsWithNoReport).not.toContain(idOf['clerk'])
    expect(tick(at(2, 7, 16)).broadcastsWithNoReport).toContain(idOf['clerk'])
    expect(tick(at(2, 7, 20)).broadcastsWithNoReport).not.toContain(idOf['clerk'])
    const lines = officeLinesTo('clerk', 'broadcastNoReport', occurrence(2, 7))
    expect(lines).toHaveLength(1)
    expect(lines[0]!.body).toBe('07:00 的报告还没有收到')
    expect(lines[0]!.lead?.target?.recordId).toBe(templateId)
  })

  it('a line with the slot mark and a lead to a report is the report, so no 18:15 reminder goes', () => {
    aChatLine('clerk', occurrence(2, 18), aRecord('report', 'The 18:00 report of this test'))
    expect(broadcast.theReportForTheSlot(idOf['clerk']!, occurrence(2, 18))).not.toBeNull()
    expect(tick(at(2, 18, 16)).broadcastsWithNoReport).not.toContain(idOf['clerk'])
    expect(officeLinesTo('clerk', 'broadcastNoReport', occurrence(2, 18))).toHaveLength(0)
  })
})

describe('with no template set, nothing is said about a template', () => {
  beforeAll(() => {
    process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  })

  it('the 06:30 reminder carries no lead and no sentence about a template, and no 07:15 reminder goes', () => {
    tick(at(3, 6, 31))
    const lines = officeLinesTo('clerk', 'broadcastSlot', occurrence(3, 7))
    expect(lines).toHaveLength(1)
    expect(lines[0]!.lead).toBeUndefined()
    expect(lines[0]!.saidInFull).toBe(`${THE_OWNER_CHECK} ${THE_CHECKLIST_TIDY} ${THE_OWNERS_CHECKLIST_TIDY} ${ITS_HANDBOOK_ITEM_IS_OPEN}`)
    expect(tick(at(3, 7, 16)).broadcastsWithNoReport).toEqual([])
    expect(officeLinesTo('clerk', 'broadcastNoReport', occurrence(3, 7))).toHaveLength(0)
  })
})

describe('with the setting naming a record the office does not hold', () => {
  beforeAll(() => {
    process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = 'noSuchRecord'
  })

  afterAll(() => {
    process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  })

  it('the reminder says the office does not hold it, carries no lead, and no 07:15 reminder goes', () => {
    tick(at(4, 6, 31))
    const lines = officeLinesTo('clerk', 'broadcastSlot', occurrence(4, 7))
    expect(lines).toHaveLength(1)
    expect(lines[0]!.lead).toBeUndefined()
    expect(lines[0]!.saidInFull).toContain('MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE 写的是 noSuchRecord')
    expect(lines[0]!.saidInFull ?? '').not.toContain(THE_REQUIREMENT)
    expect(lines[0]!.saidInFull ?? '').toContain(`${THE_OWNER_CHECK} ${THE_CHECKLIST_TIDY}`)
    expect(tick(at(4, 7, 16)).broadcastsWithNoReport).toEqual([])
  })
})
