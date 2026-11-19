// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECT'S FLOWS LEFT UNCHANGED ARE SAID ONCE A DAY (problem UBCrM0LoMCm3; wave 13j round 50, done the way commit
 * 143bd221d did notebooks and modules).
 *
 * WHAT THIS FILE PROVES, through one tick of the office's reminder watcher at moments it chooses:
 * 1. With nobody named for the project, no flow line is sent, and the tick says so once.
 * 2. A project's flows unchanged for 14 days remind the one secretary the setting names, in one line of their own,
 *    once a day. A flow changed 13 days before the tick is not counted.
 * 3. A retired flow is not counted, however old, and the line says so (problem GQRD54nCb_7D). It is retired by the rule
 *    the Flows page folds it by, `isRetired` in src/server/lib/flows.ts.
 *
 * WHERE THE RULE LIVES: `A_FLOW_IS_STALE_AFTER_DAYS` and the flow group in src/server/lib/stale-records.ts. Every record
 * here is made up in this file's own empty office.
 *
 * MUTATIONS, each proved red after a control run and restored:
 *   1. the flow age 14 → 15 turns cases 1 and 2 red.
 *   2. the flow group taken out of the list the check walks turns cases 1 and 2 red.
 *   3. the once-a-day check (`said.has(about)`) removed turns case 2 red.
 *   4. the retired rule taken out of the flow check turns cases 1 and 2 red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const DAY = 86_400_000
/** The moment of the first tick, on the operator's own clock at a fixed hour, so a day's end is not crossed by accident. */
const R0 = new Date()
const NOW = new Date(R0.getFullYear(), R0.getMonth(), R0.getDate(), 12, 0, 0, 0)

function tick(now: Date): ReturnType<RemindersLib['sendTheRemindersThatAreDue']> {
  return reminders.sendTheRemindersThatAreDue('default', now, new Date(now.getTime() - DAY))
}

let clerkId = ''

/** A made-up flow last changed `ageMs` before NOW, with anything `more` adds to its data. */
function aFlowAged(title: string, ageMs: number, more: Record<string, unknown> = {}): string {
  const id = t.api.createRecord({
    workspaceId: 'default',
    kind: 'flow',
    title,
    data: {
      declared_in: 'only in this test file',
      runs: 'the office itself',
      trigger: 'A test tick.',
      stages: [],
      leaves_behind: 'nothing; a fixture',
      ...more,
    },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  t.client.sqlite.prepare('UPDATE records SET updated_at = ? WHERE id = ?').run(localStamp(new Date(NOW.getTime() - ageMs)), id)
  return id
}

interface Line {
  body: string
  saidInFull?: string
  extra?: { staleCheck?: { day: string; about: string; flows?: string[] } }
}

/** The office's flow lines to the clerk. */
function flowLines(): Line[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) " +
          "AND json_extract(data, '$.to[0].id') = ? AND json_extract(data, '$.extra.staleCheck.day') IS NOT NULL ORDER BY rowid",
      )
      .all(clerkId) as { data: string }[]
  )
    .map((one) => JSON.parse(one.data) as Line)
    .filter((one) => one.body === 'Flows have not changed')
}

const ids: Record<string, string> = {}

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = ''
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'clerk', name: 'clerk', role: 'secretary' },
  })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(201)
  clerkId = (reply.json() as { agent: { id: string } }).agent.id
  ids.old = aFlowAged('Fixture flow unchanged for 14 days', 14 * DAY)
  ids.older = aFlowAged('Fixture flow unchanged for 40 days', 40 * DAY)
  ids.recent = aFlowAged('Fixture flow changed 13 days ago', 13 * DAY)
  ids.retired = aFlowAged('Fixture flow retired, unchanged for 30 days', 30 * DAY, {
    retired: { why: 'A fixture; nothing follows it.', at: '2026-10-11', by: 'this test', file: 'only in this test file', line: 1 },
  })
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe("a project's flows", () => {
  it('1. with nobody named, send no line, and the tick says so once', () => {
    const first = tick(NOW)
    expect(first.staleNotSaid).toEqual([
      'default has 2 flows unchanged for 14 days or more, and nobody is named for it on the Settings page or in MOLE_OFFICE_MODULE_REMINDER_SECRETARIES, so nobody was reminded',
    ])
    expect(tick(new Date(NOW.getTime() + 60_000)).staleNotSaid).toEqual([])
    expect(flowLines()).toEqual([])
  })

  it('2. unchanged for 14 days remind the named secretary in one line of their own, once a day, leaving out a recent one and a retired one', () => {
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = 'default=clerk'
    const later = new Date(NOW.getTime() + 120_000)
    expect(tick(later).staleReminded).toEqual(['clerk about 2 flows in default'])
    expect(tick(new Date(later.getTime() + 60_000)).staleReminded).toEqual([])
    const lines = flowLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]!.extra!.staleCheck!.about).toBe('flows:default')
    expect([...lines[0]!.extra!.staleCheck!.flows!].sort()).toEqual([ids.old, ids.older].sort())
    expect(lines[0]!.saidInFull).toContain('2 flows in default have not changed for 14 days or more.')
    expect(lines[0]!.saidInFull).not.toContain(ids.recent!)
    expect(lines[0]!.saidInFull).not.toContain(ids.retired!)
    expect(lines[0]!.saidInFull).toContain('Retired flows are not counted.')
  })
})
