// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONVERSATION BETWEEN AN AGENT AND MOLE OFFICE ITSELF DRAWS ITS MESSAGES. Problem NuuT5VYCgLz3, round 40 of wave 13n.
 *
 * The "between agents" list and the conversation it opens were worked out by two rules. The list
 * (`conversationsBetweenAgents`) paired each sender with each agent it wrote to, and Mole Office counts as an agent
 * there. The conversation (`conversationBetween`) asks `everyoneElseThisMessageIsBetween`, which puts a notice about a
 * message in the conversation that message is in (criterion M128) and not in the office's own conversation with its
 * reader. So a notice the office wrote to an agent about a message, as the cap notice to a starter is, made the list
 * show a conversation between that agent and Mole Office, and opening it drew nothing.
 *
 * WHAT THIS FILE PROVES, through the two doors the page reads:
 *   1. every conversation the list shows, opened, holds the line the list says was last in it;
 *   2. a notice the office wrote to an agent about a message is not the last line of that agent's conversation with
 *      Mole Office in the list, and opened, that conversation does not hold it;
 *   3. an ordinary line the office wrote to an agent is the last line of their conversation, and opened, it is there.
 * Starting an agent writes an office line of its own to it, so each agent here has a conversation with Mole Office.
 * MUTATION: build the list's pairs from the sender and its addressees again, without the conversation's rule. Cases 1
 * and 2 go red.
 *
 * Everybody and everything here is made up.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'

let t: TestDb
let app: FastifyInstance
let groups: typeof import('../src/server/lib/groups.ts')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const THE_OFFICE = { type: 'system', id: moleOffice().id } as const

type Ref = { kind: string; id: string }
type Listed = { between: [Ref, Ref]; last: { id: string } }

let lineTo = ''
let notifiedOnly = ''
let ordinaryLine = ''
let notice = ''

async function anAgent(handle: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { runtime: 'claude-code', handle, name: `Test ${handle}`, role: 'worker' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return String((reply.json() as { agent: { id: string } }).agent.id)
}

async function theList(): Promise<Listed[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/messages/between-agents', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { conversations: Listed[] }).conversations
}

async function theConversation(two: [Ref, Ref]): Promise<{ status: number; ids: string[] }> {
  const reply = await app.inject({ method: 'GET', url: `/api/messages/between/${two[0].id}~${two[1].id}`, headers: AS_THE_PERSON })
  if (reply.statusCode !== 200) return { status: reply.statusCode, ids: [] }
  return { status: 200, ids: (reply.json() as { messages: { id: string }[] }).messages.map((one) => one.id) }
}

const withTheOffice = (one: Listed, agent: string): boolean =>
  one.between.some((side) => side.id === moleOffice().id) && one.between.some((side) => side.id === agent)

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  groups = await import('../src/server/lib/groups.ts')
  lineTo = await anAgent('ledger-kite')
  notifiedOnly = await anAgent('ledger-wren')
  // AN ORDINARY LINE FROM THE OFFICE TO ONE AGENT: it is in the office's own conversation with that agent.
  ordinaryLine = groups.writeASystemLineToOne({ kind: 'agent', id: lineTo }, 'default', SYSTEM_LINES.aRunWaitedAndEnded(5), THE_OFFICE).id
  // A NOTICE ABOUT A MESSAGE, as the cap notice to a starter is: it is in the conversation that message is in.
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'message', title: 'A letter that waits', data: { body: 'A letter that waits.', to: [{ kind: 'agent', id: notifiedOnly }] } },
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(filed.statusCode, filed.body).toBe(409)
  const letter = String((filed.json() as { record: { id: string } }).record.id)
  notice = groups.writeASystemLineToOne(
    { kind: 'agent', id: notifiedOnly },
    'default',
    SYSTEM_LINES.theCapStoppedForYou(letter, 'Test ledger-wren'),
    THE_OFFICE,
    { message: letter },
  ).id
}, 90_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a conversation with the office draws its messages', () => {
  it('opens every listed conversation onto the line the list says was last', async () => {
    const listed = await theList()
    expect(listed.length, 'the list holds the office conversation this file wrote').toBeGreaterThan(0)
    for (const one of listed) {
      const opened = await theConversation(one.between)
      const name = `${one.between[0].id}~${one.between[1].id}`
      expect(opened.status, `${name} opens`).toBe(200)
      expect(opened.ids, `${name} holds its last line`).toContain(one.last.id)
    }
  })

  it('keeps a notice about a message out of the office conversation of the agent it was written to', async () => {
    const found = (await theList()).filter((one) => withTheOffice(one, notifiedOnly))
    expect(found).toHaveLength(1)
    expect(found[0]!.last.id, 'the notice is not the last line of the office conversation').not.toBe(notice)
    expect((await theConversation(found[0]!.between)).ids).not.toContain(notice)
  })

  it('lists the office conversation of an agent it wrote an ordinary line to, and draws the line', async () => {
    const found = (await theList()).filter((one) => withTheOffice(one, lineTo))
    expect(found).toHaveLength(1)
    expect(found[0]!.last.id).toBe(ordinaryLine)
    expect((await theConversation(found[0]!.between)).ids).toContain(ordinaryLine)
  })
})
