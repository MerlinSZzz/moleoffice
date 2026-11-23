// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LEAD IS REMINDED UNLESS IT GOES TO A REPORT WRITTEN FOR ITS READER, A PAGE, OR A RECORD WAITING ON THE PERSON.
 *
 * A message's lead takes its reader to a place. The office turns no lead into a link and refuses nothing: every lead is
 * stored as sent. Instead one short sentence, `WHEN_TO_SEND_A_LEAD` in src/shared/when-to-send-a-lead.mjs, is said
 * only when the lead is not right: not to a report written for one of its readers, not to a part of one, not to a page,
 * and not to a record the waiting list holds when the person reads it. Everything else is reminded: a report written
 * for somebody else, a report written for nobody, a plan, a line of a plan, any other record, and a target the door
 * cannot read.
 *
 * THE SENTENCE IS SAID IN FOUR PLACES AN AGENT MEETS IT: the `lead` field's words (GET /api/kinds/message), the write
 * door's answer to such a message, the office tool's description, and the skill's section on taking somebody to a page.
 *
 * WHAT IS PROVED
 *   1. The door says the sentence for a lead to a report written for somebody else, and says nothing for a lead to a
 *      report written for the person.
 *   2. A message with no lead is told nothing.
 *   3. A lead to any kind of place is still delivered as sent: a report, a block and a table row of a report, a page,
 *      a problem, a task, a note, a plan and a line of a plan. Each is stored, names what it was sent to, and comes in
 *      the reader's offers read with that lead.
 *   4. A stored lead names what it was sent to.
 *   5. The reader's offers carry each lead as it was stored.
 *   6. A report written for an agent is quiet to that agent and reminded to the person.
 *   7. A record that waits on the person is quiet to the person and reminded to an agent.
 *   8. The skill's section on taking somebody to a page carries the sentence.
 *   9. The shipped rule files no longer carry the rule's old name.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the door leaves the sentence out of a lead that is not right  → cases 1, 3, 6 and 7
 *   the door says it for a lead that is right                     → cases 1, 3, 6 and 7
 *   the door says it to a message with no lead                    → case 2
 *   a stored lead loses what it was sent to                       → case 4
 *   the reader's offers change or lose a lead                     → case 5
 *   the skill's section loses the sentence                        → case 8
 *   a shipped rule file still carries the old name                → case 9
 *   the door refuses a lead to anything but a report or a page    → case 3
 *
 * Nothing here opens ./data/panelx.db: `freshDb` in tests/helpers.ts makes a throwaway database.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAPTERS_SOURCE, HOW_TO_LEAD, SKILL_SOURCE, sectionOf } from '../src/shared/rules-text.ts'
import { WHEN_TO_SEND_A_LEAD } from '../src/shared/when-to-send-a-lead.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const WS = 'default'
const GUIDE = 'guide-when'
/**
 * The name chapter 7's second rule had before this change, kept as history. It does not change; the new name lives in
 * the chapter record, which a test office does not hold.
 */
const THE_RULES_OLD_NAME = 'Take me there is a lead, not a link'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WS,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_GUIDE = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': GUIDE }

async function inject(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  payload?: InjectOptions['payload'],
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const options: InjectOptions = { method, url, headers }
  if (payload !== undefined) options.payload = payload
  const reply = await app.inject(options)
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

async function file(
  kind: string,
  title: string,
  data: Record<string, unknown>,
  headers: Record<string, string> = AS_THE_PERSON,
): Promise<string> {
  const reply = await inject('POST', '/api/records', headers, { kind, title, data })
  expect(reply.status, reply.text).toBe(201)
  return (reply.json['record'] as { id: string }).id
}

/** The guide sends the person a message, with this lead or with none, and the door's answer comes back. */
async function send(
  words: string,
  lead?: Record<string, unknown>,
  to: { kind: 'person' | 'agent'; id: string }[] = [{ kind: 'person', id: THE_PERSON }],
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  return inject('POST', '/api/records', AS_THE_GUIDE, {
    kind: 'message',
    title: words,
    data: { body: words, to, ...(lead === undefined ? {} : { lead: { target: lead } }) },
  })
}

/** Everything a lead below points at, made through the ordinary doors. */
const at: Record<string, Record<string, unknown>> = {}
let READER_WHEN: string
let tipCheck: string
let secondTipCheck: string
let armProblem: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const started = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle: GUIDE, name: 'Guide When', workArea: ['src'] })
  expect(started.status, started.text).toBe(201)
  const reader = await inject('POST', '/api/agents/started', AS_THE_PERSON, {
    handle: 'reader-when',
    name: 'Reader When',
    workArea: ['src'],
  })
  expect(reader.status, reader.text).toBe(201)
  READER_WHEN = (reader.json['agent'] as { id: string }).id

  const report = await file('report', 'What the bench said', {
    for: 'the person, who asked for the bench numbers',
    blocks: [
      { id: 'b-1', type: 'text', text: 'The mount tolerance is 0.2 mm and nobody measured it.' },
      {
        id: 'b-2',
        type: 'table',
        columns: [{ label: 'run' }, { label: 'error (px)', align: 'right' }],
        rows: [{ cells: ['before the knock', 0.4] }, { cells: ['after the knock', 1.9] }],
      },
    ],
  })
  const kilnLog = await file('report', 'What the kiln log said', {
    for: 'the secretary, who puts it to the person',
    blocks: [{ id: 'b-1', type: 'text', text: 'The kiln held at 1,180 degrees for six hours.' }],
  })
  const seedCount = await file('report', 'What the seed count said', {
    blocks: [{ id: 'b-1', type: 'text', text: 'Two hundred and ten seeds went into the trays.' }],
  })
  const shelfCount = await file('report', 'What the shelf count said', {
    for: '主人，他要看这些数字',
    blocks: [{ id: 'b-1', type: 'text', text: 'Six jars are left on the top shelf.' }],
  })
  const plan = await inject('POST', '/api/plans', AS_THE_PERSON, { title: 'This week', body: 'Re-measure the mount' })
  expect(plan.status, plan.text).toBe(201)
  const planned = plan.json as { plan: { id: string }; lines: { id: string }[] }
  expect(planned.lines[0], 'the plan came back with no lines to point at').toBeDefined()

  at['a report'] = { kind: 'record', recordId: report, workspaceId: WS }
  at['a block of a report'] = { kind: 'reportBlock', recordId: report, blockId: 'b-1' }
  at['a row of a report table'] = { kind: 'tableRow', recordId: report, blockId: 'b-2', rowKey: '2' }
  at['a page'] = { kind: 'page', route: '/records' }
  at['a problem'] = { kind: 'record', recordId: await file('problem', 'The kiln ran hot', {}), workspaceId: WS }
  at['a task'] = { kind: 'record', recordId: await file('task', 'Re-measure the mount', {}), workspaceId: WS }
  at['a note'] = {
    kind: 'record',
    recordId: await file('note', 'Where the seed trays are kept', { date: '2026-11-07', body: 'On the top shelf.' }),
    workspaceId: WS,
  }
  at['a plan'] = { kind: 'plan', planId: planned.plan.id }
  at['a line of a plan'] = { kind: 'planLine', planId: planned.plan.id, lineId: planned.lines[0]?.id ?? '' }
  at['a report written for somebody else'] = { kind: 'record', recordId: kilnLog, workspaceId: WS }
  at['a report written for nobody'] = { kind: 'record', recordId: seedCount, workspaceId: WS }
  at['a report written for the person in Chinese'] = { kind: 'record', recordId: shelfCount, workspaceId: WS }

  // THESE ARE KEPT OUTSIDE `at` BECAUSE NOBODY READS THEM AS QUIET FOR THE PERSON.
  tipCheck = await file('report', 'What the tip check found', {
    for: 'reader-when, who runs the tests at the tip',
    blocks: [{ id: 'b-1', type: 'text', text: 'The tip check found one failing test.' }],
  })
  secondTipCheck = await file('report', 'What the second tip check found', {
    for: 'READER WHEN; the second check',
    blocks: [{ id: 'b-1', type: 'text', text: 'The second tip check found nothing.' }],
  })
  armProblem = await file(
    'problem',
    'The arm stops short of the handover pose',
    { symptom: 'it stops 4 cm short', whose_move: 'person' },
    AS_THE_GUIDE,
  )
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the door says when a lead is right', () => {
  it('answers a lead to a report written for somebody else with the sentence, and one written for the person without it', async () => {
    const reminded = await send('Come and read the kiln log.', at['a report written for somebody else'])
    expect(reminded.status, reminded.text).toBe(201)
    expect(reminded.json['leadReminder']).toBe(WHEN_TO_SEND_A_LEAD)

    const quiet = await send('Come and read the bench report.', at['a report'])
    expect(quiet.status, quiet.text).toBe(201)
    expect(quiet.json, 'a lead to a report written for its reader was reminded').not.toHaveProperty('leadReminder')
  })

  it('says nothing to a message with no lead', async () => {
    const plain = await send('The bench report is filed.')
    expect(plain.status, plain.text).toBe(201)
    expect(plain.json, 'a message with no lead was told when a lead is right').not.toHaveProperty('leadReminder')
  })
})

describe('a lead to any kind of place is still delivered as sent', () => {
  it('stores each one, names what it was sent to, and offers it to the reader', async () => {
    const QUIET = new Set([
      'a report',
      'a block of a report',
      'a row of a report table',
      'a page',
      'a report written for the person in Chinese',
    ])
    const sent: { name: string; id: string; target: Record<string, unknown>; stored: unknown }[] = []
    for (const [name, target] of Object.entries(at)) {
      const reply = await send(`Come and look at ${name}.`, target)
      expect(reply.status, `a lead to ${name} was not stored: ${reply.text}`).toBe(201)
      if (QUIET.has(name)) {
        expect(reply.json, `a lead to ${name} was reminded`).not.toHaveProperty('leadReminder')
      } else {
        expect(reply.json['leadReminder'], `a lead to ${name}`).toBe(WHEN_TO_SEND_A_LEAD)
      }
      const record = reply.json['record'] as { id: string; data: { lead?: { target: Record<string, unknown> } } }
      // THE STORED LEAD NAMES WHAT IT WAS SENT TO. The door writes a block of a report as the part of the record it is,
      // so the kind word may change; every identifier sent is still in what is stored.
      const storedTarget = JSON.stringify(record.data.lead?.target ?? null)
      for (const [key, value] of Object.entries(target)) {
        if (key !== 'kind') expect(storedTarget, `the lead to ${name} lost its ${key}`).toContain(String(value))
      }
      sent.push({ name, id: record.id, target, stored: record.data.lead })
    }
    expect(sent.length, 'the places a lead was sent to').toBe(12)

    const offers = await inject('GET', '/api/messages?only=waiting-for-me&leads=1&full=1', AS_THE_PERSON)
    expect(offers.status, offers.text).toBe(200)
    const offered = new Map((offers.json['messages'] as { id: string; lead: unknown }[]).map((one) => [one.id, one.lead]))
    for (const one of sent) {
      expect(offered.has(one.id), `the lead to ${one.name} was not offered to the reader`).toBe(true)
      expect(offered.get(one.id), `the lead to ${one.name} reached the reader changed`).toEqual(one.stored)
    }
  })
})

describe('a lead to a report written for an agent', () => {
  it('is quiet to that agent and reminded to the person', async () => {
    for (const recordId of [tipCheck, secondTipCheck]) {
      const target = { kind: 'record', recordId, workspaceId: WS }
      const toTheAgent = await send('Come and read the tip check.', target, [{ kind: 'agent', id: READER_WHEN }])
      // A SEND TO A REGISTERED AGENT THAT NO SESSION HOLDS IS STORED AND ANSWERED 409, with the whole answer, so the
      // reminder is read from either answer.
      expect([201, 409], toTheAgent.text).toContain(toTheAgent.status)
      expect(toTheAgent.json, 'a lead to a report written for this agent was reminded').not.toHaveProperty('leadReminder')

      const toThePerson = await send('Come and read the tip check.', target)
      expect(toThePerson.status, toThePerson.text).toBe(201)
      expect(toThePerson.json['leadReminder']).toBe(WHEN_TO_SEND_A_LEAD)
    }
  })
})

describe('a lead to a record that waits on the person', () => {
  it('is quiet to the person and reminded to an agent', async () => {
    const waiting = await inject('GET', '/api/waiting', AS_THE_PERSON)
    expect(waiting.status, waiting.text).toBe(200)
    const items = waiting.json['items'] as { id: string }[]
    expect(
      items.some((one) => one.id === armProblem),
      'the premise failed: the problem is not on the waiting list, so the lead was not tried',
    ).toBe(true)

    const target = { kind: 'record', recordId: armProblem, workspaceId: WS }
    const toThePerson = await send('Come and settle the arm problem.', target)
    expect(toThePerson.status, toThePerson.text).toBe(201)
    expect(toThePerson.json, 'a lead to a record waiting on the person was reminded').not.toHaveProperty('leadReminder')

    const toTheAgent = await send('Come and settle the arm problem.', target, [{ kind: 'agent', id: READER_WHEN }])
    expect([201, 409], toTheAgent.text).toContain(toTheAgent.status)
    expect(toTheAgent.json['leadReminder']).toBe(WHEN_TO_SEND_A_LEAD)
  })
})

describe('the skill says the sentence', () => {
  it('carries it in the section on taking somebody to a page', () => {
    const skill = readFileSync(join(REPO_ROOT, SKILL_SOURCE), 'utf8')
    const section = sectionOf(skill, HOW_TO_LEAD)
    expect(section, 'the skill no longer has the section on taking somebody to a page').not.toBeNull()
    const words = (section ?? '').replaceAll('**', '').replace(/\s+/g, ' ')
    expect(words).toContain(WHEN_TO_SEND_A_LEAD)
  })
})

describe("the shipped rules carry the rule's new name", () => {
  it('no longer carries the name chapter 7 rule 2 had before this change', async () => {
    const chapters = readFileSync(join(REPO_ROOT, CHAPTERS_SOURCE), 'utf8')
    const { CODE_SOURCE } = await import('../src/worker/rules.ts')
    const { THE_DEFAULT_REGULATIONS_FILE } = await import('../src/server/lib/read-the-default-regulations.ts')
    const code = readFileSync(join(REPO_ROOT, CODE_SOURCE), 'utf8')
    const defaults = readFileSync(join(REPO_ROOT, THE_DEFAULT_REGULATIONS_FILE), 'utf8')
    expect(chapters, `the chapter records still carry "${THE_RULES_OLD_NAME}"`).not.toContain(THE_RULES_OLD_NAME)
    expect(code, `CODE.md still carries "${THE_RULES_OLD_NAME}"`).not.toContain(THE_RULES_OLD_NAME)
    expect(defaults, `the default regulations still carry "${THE_RULES_OLD_NAME}"`).not.toContain(THE_RULES_OLD_NAME)
  })
})
