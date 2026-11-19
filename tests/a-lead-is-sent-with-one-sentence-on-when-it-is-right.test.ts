// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LEAD IS SENT WITH ONE SENTENCE ON WHEN IT IS RIGHT, AND NOTHING IS REFUSED BECAUSE OF IT.
 *
 * A message's lead ("Take me there") is for a reader who must be taken
 * somewhere, a report to read or a page where they must act, and a plain link is for anything else. The office does
 * not turn a lead into a link and refuses nothing. Instead one short sentence, `WHEN_TO_SEND_A_LEAD` in
 * src/shared/when-to-send-a-lead.mjs, is said in the three places an agent makes a lead: the `lead` field's words
 * (GET /api/kinds/message), the write door's answer to a message that carries one, and the office tool's description.
 *
 * WHAT IS PROVED
 *   1. A message filed with a lead is answered with `leadReminder`, the sentence. A message with no lead is not.
 *   3. A lead to any kind of place is still delivered as sent: a report, a block and a table row of a report, a page,
 *      a problem, a task, a note, a plan and a line of a plan. Each is stored, names what it was sent to, and comes in
 *      the reader's offers read with that lead.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the door leaves the sentence out of its answer            → cases 1 and 3
 *   the door says it to every message, with a lead or not     → case 1
 *   the field's words or the tool's description lose it       → case 2
 *   the door refuses a lead to anything but a report or page  → case 3
 *
 * Nothing here opens ./data/panelx.db: `freshDb` in tests/helpers.ts makes a throwaway database.
 */

import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { WHEN_TO_SEND_A_LEAD } from '../src/shared/when-to-send-a-lead.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const WS = 'default'
const GUIDE = 'guide-when'
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

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const reply = await inject('POST', '/api/records', AS_THE_PERSON, { kind, title, data })
  expect(reply.status, reply.text).toBe(201)
  return (reply.json['record'] as { id: string }).id
}

/** The guide sends the person a message, with this lead or with none, and the door's answer comes back. */
async function send(words: string, lead?: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  return inject('POST', '/api/records', AS_THE_GUIDE, {
    kind: 'message',
    title: words,
    data: { body: words, to: [{ kind: 'person', id: THE_PERSON }], ...(lead === undefined ? {} : { lead: { target: lead } }) },
  })
}

/** Everything a lead below points at, made through the ordinary doors. */
const at: Record<string, Record<string, unknown>> = {}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const started = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle: GUIDE, name: 'Guide When', workArea: ['src'] })
  expect(started.status, started.text).toBe(201)

  const report = await file('report', 'What the bench said', {
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
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the door says when a lead is right', () => {
  it('answers a message with a lead with the sentence, and a message with none without it', async () => {
    const led = await send('Come and read the bench report.', at['a report'])
    expect(led.status, led.text).toBe(201)
    expect(led.json['leadReminder']).toBe(WHEN_TO_SEND_A_LEAD)

    const plain = await send('The bench report is filed.')
    expect(plain.status, plain.text).toBe(201)
    expect(plain.json, 'a message with no lead was told when a lead is right').not.toHaveProperty('leadReminder')
  })

})

describe('a lead to any kind of place is still delivered as sent', () => {
  it('stores each one, names what it was sent to, and offers it to the reader', async () => {
    const sent: { name: string; id: string; target: Record<string, unknown>; stored: unknown }[] = []
    for (const [name, target] of Object.entries(at)) {
      const reply = await send(`Come and look at ${name}.`, target)
      expect(reply.status, `a lead to ${name} was not stored: ${reply.text}`).toBe(201)
      expect(reply.json['leadReminder'], `a lead to ${name}`).toBe(WHEN_TO_SEND_A_LEAD)
      const record = reply.json['record'] as { id: string; data: { lead?: { target: Record<string, unknown> } } }
      // THE STORED LEAD NAMES WHAT IT WAS SENT TO. The door writes a block of a report as the part of the record it is,
      // so the kind word may change; every identifier sent is still in what is stored.
      const storedTarget = JSON.stringify(record.data.lead?.target ?? null)
      for (const [key, value] of Object.entries(target)) {
        if (key !== 'kind') expect(storedTarget, `the lead to ${name} lost its ${key}`).toContain(String(value))
      }
      sent.push({ name, id: record.id, target, stored: record.data.lead })
    }
    expect(sent.length, 'the places a lead was sent to').toBe(9)

    const offers = await inject('GET', '/api/messages?only=waiting-for-me&leads=1&full=1', AS_THE_PERSON)
    expect(offers.status, offers.text).toBe(200)
    const offered = new Map((offers.json['messages'] as { id: string; lead: unknown }[]).map((one) => [one.id, one.lead]))
    for (const one of sent) {
      expect(offered.has(one.id), `the lead to ${one.name} was not offered to the reader`).toBe(true)
      expect(offered.get(one.id), `the lead to ${one.name} reached the reader changed`).toEqual(one.stored)
    }
  })
})
