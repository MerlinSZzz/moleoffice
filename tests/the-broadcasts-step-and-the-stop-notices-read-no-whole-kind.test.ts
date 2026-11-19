// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BROADCASTS STEP AND THE STOP-NOTICE READ FIND THEIR MESSAGES THROUGH AN INDEX, NOT BY READING EVERY MESSAGE.
 *
 * Wave 13y round 20. On 10 October 2026 the live log said one flow-reminders pass took 953 ms. Its
 * broadcasts step took 740 ms, 724 ms of it inside SQLite, and its one-notice-per-cause step took 110 ms.
 * The statements were timed on live: three of them for each of the five secretaries, and the one that
 * finds the last stopped-run notice, each read the stored data of every message, about 31,600, at about
 * 48 ms each.
 *
 * WHAT THIS FILE PROVES. Every statement those two read through, on every road the broadcasts step
 * takes (a reminder due, a reminder already sent, a report late, a schedule paused) and on the second
 * stop-notice pass, is planned by SQLite without walking all of `records` or every message through the
 * kind's index or the project's. That includes the read each message the step writes makes for another
 * message in its second, which walked the kind's index until wave 13y round 36. The plan of each statement
 * is read from SQLite itself. The indexes of migration 0228 are each named in some plan, so a reader that
 * stopped asking in their words is caught even if SQLite found another narrow road.
 *
 * WHAT IT DOES NOT PROVE. What each reader answers; tests/the-secretary-broadcasts-on-a-schedule.test.ts,
 * tests/the-secretary-report-reminders-carry-the-template.test.ts,
 * tests/the-person-skips-a-secretarys-next-broadcast-on-its-page.test.ts and
 * tests/a-stopped-run-tells-the-person-once-as-the-office.test.ts hold that.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL green. MUTATION 1:
 * `theBroadcastsOf` asks the kind as a value again, and the broadcasts case is red. MUTATION 2: the stop
 * notices are read without naming their index, and the notices case is red. RESTORE green, checked with
 * cmp against a saved copy.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')
type BroadcastLib = typeof import('../src/server/lib/broadcast.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib
let broadcast: BroadcastLib

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

/**
 * A plan step that walks all of `records`, or every record of one kind or one project. The same test as
 * tests/the-chat-reads-only-what-it-needs.test.ts uses.
 */
const A_WHOLE_READ = /SCAN records\b|records_kind_idx|records_live_idx \(workspace_id=\?(?: AND deleted_at=\?)?\)/

interface WhatWasPlanned {
  /** Each plan step, of a statement about messages, that walks a whole kind or project, with the statement. */
  wholeReads: string[]
  /** Every index any of those statements' plans named. */
  indexes: Set<string>
}

/**
 * Runs `work` and reads SQLite's plan for every statement it ran that is about messages: the text names
 * the kind `'message'`, or a bound value is `message`. Statements that write are left out; a plan is read
 * for a read only.
 */
function thePlansOf(work: () => void, about: RegExp | null = null): WhatWasPlanned {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => Record<string, unknown> }
  const original = sqlite.prepare
  const asked: { text: string; args: unknown[] }[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = original.call(this, text)
    if (/^\s*select\b/i.test(text)) {
      for (const method of ['all', 'get'] as const) {
        const read = statement[method] as (...args: unknown[]) => unknown
        statement[method] = function (this: unknown, ...args: unknown[]) {
          asked.push({ text, args })
          return read.apply(this, args)
        }
      }
    }
    return statement
  }
  try {
    work()
  } finally {
    sqlite.prepare = original
  }
  const wholeReads: string[] = []
  const indexes = new Set<string>()
  for (const { text, args } of asked) {
    const aboutMessages = text.includes("'message'") || args.includes('message')
    if (!aboutMessages || (about !== null && !about.test(text))) continue
    const plan = t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${text}`).all(...args) as { detail: string }[]
    for (const step of plan) {
      const named = /USING (?:COVERING )?INDEX (\w+)/.exec(step.detail)?.[1]
      if (named !== undefined) indexes.add(named)
      if (A_WHOLE_READ.test(step.detail)) wholeReads.push(`${step.detail} in: ${text.slice(0, 160)}`)
    }
  }
  return { wholeReads, indexes }
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

/** One message from `from` to `to`, both agents. */
function aMessageBetween(from: string, to: string, body: string, extra?: Record<string, unknown>): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'line',
    data: { body, to: [{ kind: 'agent', id: to }], sentBy: { kind: 'agent', id: from }, ...(extra === undefined ? {} : { extra }) },
    actor: { type: 'agent', id: from },
  }).id
}

/** One message from the secretary to the person, its body naming `slot`. */
function aBroadcast(agentId: string, slot: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'broadcast',
    data: { body: `${slot} 进度；需要决策；问题`, to: [{ kind: 'person', id: THE_PERSON }], sentBy: { kind: 'agent', id: agentId } },
    actor: { type: 'agent', id: agentId },
  }).id
}

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_LEAD_MINUTES = '30'
  process.env.MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT = '3'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES = '15'
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  broadcast = await import('../src/server/lib/broadcast.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register('clerk', 'secretary')
  await register('busy-a', 'worker')
  await register('busy-b', 'worker')
  // MESSAGES THAT ARE NONE OF THE STEP'S BUSINESS, so a read of every message has something to read.
  for (let i = 0; i < 60; i++) aMessageBetween(idOf['busy-a']!, idOf['busy-b']!, `line ${String(i)}`)
  // THE REPORT TEMPLATE IS SET, so the late road is taken.
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = t.api.createRecord({
    workspaceId: 'default',
    kind: 'note',
    title: 'The report template of this test',
    data: { body: 'A made-up template for this test.' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
})

afterAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  await app.close()
  t.close()
})

describe('the broadcasts step', () => {
  it('reads no whole kind on any of its roads, and finds its lines through the indexes of migrations 0199 and 0228', () => {
    const clerk = idOf['clerk']!
    const indexes = new Set<string>()
    const wholeReads: string[] = []
    const tick = (now: Date) => {
      const planned = thePlansOf(() => {
        broadcast.sendTheBroadcastRemindersThatAreDue('default', now)
      })
      wholeReads.push(...planned.wholeReads)
      for (const one of planned.indexes) indexes.add(one)
    }
    // A REMINDER DUE, then the same reminder already sent.
    const due = thePlansOf(() => {
      expect(broadcast.sendTheBroadcastRemindersThatAreDue('default', at(1, 6, 35)).reminded).toEqual([clerk])
    })
    wholeReads.push(...due.wholeReads)
    for (const one of due.indexes) indexes.add(one)
    tick(at(1, 6, 40))
    // A REPORT LATE: no report for the 07:00 slot by 07:20, so the one more reminder goes.
    const late = thePlansOf(() => {
      expect(broadcast.sendTheBroadcastRemindersThatAreDue('default', at(1, 7, 20)).noReport).toEqual([clerk])
    })
    wholeReads.push(...late.wholeReads)
    for (const one of late.indexes) indexes.add(one)
    // A SCHEDULE PAUSED: three broadcasts the person left unanswered.
    for (const slot of ['07:00', '18:00', '07:00']) aBroadcast(clerk, slot)
    const paused = thePlansOf(() => {
      expect(broadcast.sendTheBroadcastRemindersThatAreDue('default', at(2, 17, 35)).paused).toEqual([clerk])
    })
    wholeReads.push(...paused.wholeReads)
    for (const one of paused.indexes) indexes.add(one)
    tick(at(2, 17, 40))

    expect(wholeReads).toEqual([])
    for (const named of [
      'records_message_sent_by_idx',
      'records_message_broadcast_slot_idx',
      'records_message_broadcast_skip_idx',
      'message_delivery_recipient_idx',
    ]) {
      expect(indexes, `no plan named ${named}`).toContain(named)
    }
  })
})

describe('the stop notices', () => {
  it('the newest notice for each cause is found through its index, and none is sent twice in the hour', () => {
    const closedAt = new Date(R0.getTime() - 5 * 60_000)
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'stopped by quota',
      data: {
        state: 'crashed',
        closedAt: localStamp(closedAt),
        closedBecause: 'You have used your quota.',
        closedHow: 'provider-event',
        stopCause: { kind: 'quota', said: 'You have used your quota.', at: null, resetsAt: null },
      },
      actor: { type: 'human', id: THE_PERSON },
    })
    const since = new Date(R0.getTime() - 60_000)
    expect(reminders.sendTheRemindersThatAreDue('default', R0, since).noticesSent).toEqual(['quota'])
    const again = thePlansOf(() => {
      expect(reminders.sendTheRemindersThatAreDue('default', new Date(R0.getTime() + 20 * 60_000), since).noticesSent).toEqual([])
    }, /m94/)
    expect(again.wholeReads).toEqual([])
    expect(again.indexes).toContain('records_message_stop_cause_idx')
  })
})
