// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * M128 — A NOTICE ABOUT A CONVERSATION IS A SYSTEM LINE IN IT, AND THE PERSON IS TOLD SEPARATELY.
 *
 * Criterion M128 of design/messages/ACCEPTANCE.md, on a report to
 * an agent that many strange messages had been sent below. The problem is ercNxjlh1ayU and the picture is
 * QQ8q9bHMWrO0.
 * The M82 cap-stopped line was sent to the person AND to that agent, so it filled the person's chat with
 * that agent as a paragraph bubble, named no message, and was addressed to the very agent whose
 * conversation it was.
 *
 * WHAT IS PROVED HERE, on an app the office really serves:
 *
 *   1. THE CONVERSATION GETS A SYSTEM LINE NAMING THE MESSAGE. When the cap stops a run for a
 *      message, a Mole Office line is drawn in the conversation that message is in, carries
 *      `aboutMessage` with the message's id, and links to it.
 *   2. THE AGENT GETS NO MESSAGE. The notice is not addressed to the agent whose conversation it
 *      is, so that agent has no delivery row for it.
 *   3. THE STARTER IS TOLD, in one short line in the person's own conversation with the office, naming the
 *      message and offering the way to start the conversation again.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, PROVED AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: the cases below pass. Then, in `tellTheStarterTheCapStopped` in
 * src/server/lib/worker.ts, the old broadcast is put back — `writeASystemLineToTwo([starter, to],
 * workspaceId, line, by)` in place of the one-sided notice and the link. The case goes red, because
 * the agent whose conversation it is now has a delivery row for the notice (assertion 2) and the
 * notice names no message (assertion 1). The change was put back byte-for-byte (sha256 checked) and
 * the control run again: green.
 *
 * WHAT WOULD MAKE THIS GO RED: addressing the notice to the agent, dropping the `aboutMessage`, or
 * dropping the short office line.
 */

import type { AddressInfo } from 'node:net'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, theOfficesOwnId, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let api = ''
let senderId = ''
let miraId = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Register an agent as the person started it, and give back its registry id. */
async function anAgentStartedByThePerson(handle: string, name: string): Promise<string> {
  const made = await fetch(`${api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ handle, name, role: 'worker', runtime: 'claude-code' }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  const listed = (await (await fetch(`${api}/api/participants`, { headers: AS_THE_OWNER })).json()) as {
    agents?: { id: string; handle: string }[]
  }
  return one((listed.agents ?? []).filter((one) => one.handle === handle), `the registry row for ${handle}`).id
}

/** One message an agent writes to another, giving back its record id. */
async function theAgentSays(from: string, toId: string, body: string, expected: number): Promise<string> {
  const made = await fetch(`${api}/api/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': from,
    },
    body: JSON.stringify({ kind: 'message', title: body, data: { body, to: [{ kind: 'agent', id: toId }] } }),
  })
  expect(made.status, await made.clone().text()).toBe(expected)
  return ((await made.json()) as { record: { id: string } }).record.id
}

/** One conversation, read as one side of it. Empty when the read is refused. */
async function conversationAs(
  who: { kind: string; id: string },
  them: { kind: string; id: string },
): Promise<{ body: string; sentBy: { kind: string; id: string } | null; aboutMessage?: string | null; to: { kind: string; id: string }[] }[]> {
  const read = await fetch(
    `${api}/api/messages/conversation?kind=${them.kind}&id=${encodeURIComponent(them.id)}`,
    { headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': who.kind === 'person' ? 'human' : who.kind, 'x-mole-office-actor-id': who.id } },
  )
  const answer = (await read.json()) as {
    messages?: { body: string; sentBy: { kind: string; id: string } | null; aboutMessage?: string | null; to: { kind: string; id: string }[] }[]
  }
  return answer.messages ?? []
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  senderId = await anAgentStartedByThePerson('notice-sender', 'Notice Sender')
  miraId = await anAgentStartedByThePerson('notice-wren', 'Notice Wren')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('M128: the cap-stopped notice is a system line in the conversation it is about', () => {
  it('names the message, reaches the agent not at all, and tells the starter in the office conversation', async () => {
    // FOUR AGENT MESSAGES, NO PERSON, so the cap on the conversation is reached. The fourth is the
    // one the worker holds, and the notice is about the conversation those four are in.
    // NOTHING HOLDS NOTICE WREN IN THIS TEST OFFICE, so the office stores each message, routes it and
    // answers 409 rather than 201; the four are stored all the same.
    await theAgentSays('notice-sender', miraId, 'one', 409)
    await theAgentSays('notice-sender', miraId, 'two', 409)
    await theAgentSays('notice-sender', miraId, 'three', 409)
    const fourth = await theAgentSays('notice-sender', miraId, 'four', 409)

    const held = await app.inject({
      method: 'POST',
      url: `/api/worker/messages/${fourth}/held`,
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'mole-office/the-message-worker',
      },
      payload: { to: { kind: 'agent', id: miraId }, because: 'the cap holds it' },
    })
    expect(held.statusCode, held.body).toBe(200)
    expect((held.json() as { starter?: { written?: boolean } }).starter?.written, held.body).toBe(true)

    // (1) THE CONVERSATION IT IS ABOUT GETS A SYSTEM LINE NAMING THE MESSAGE.
    const between = await conversationAs({ kind: 'agent', id: 'notice-sender' }, { kind: 'agent', id: miraId })
    const notice = between.find((one) => one.sentBy?.id === theOfficesOwnId(t) && one.aboutMessage === fourth)
    expect(notice, 'the conversation was not told, or the notice names no message').toBeDefined()
    expect(notice?.body, 'the notice does not name the agent it is about').toContain('Notice Wren')

    // THE LINK TO THE MESSAGE IS ON THE NOTICE, so a reader opens the exact thing it names.
    const noticeId = (
      t.client.sqlite
        .prepare("SELECT id FROM records WHERE json_extract(data, '$.aboutMessage') = ? ORDER BY created_at DESC")
        .get(fourth) as { id: string } | undefined
    )?.id
    expect(noticeId, 'no notice record carries the message id').toBeDefined()
    const linked = t.client.sqlite
      .prepare("SELECT to_id FROM links WHERE from_id = ? AND type = 'about'")
      .all(noticeId) as { to_id: string }[]
    expect(linked.map((one) => one.to_id), 'the system line does not link to the message it names').toContain(fourth)

    // (2) THE AGENT WHOSE CONVERSATION IT IS GETS NO MESSAGE. The notice is addressed to the sender
    // agent, and never to the agent whose conversation it is.
    expect(
      notice?.to.some((one) => one.kind === 'agent' && one.id === miraId),
      'the notice was addressed to the very agent whose conversation it is',
    ).toBe(false)

    // (3) THE STARTER IS TOLD, in one short line in the person's own conversation with the office.
    const office = await conversationAs({ kind: 'person', id: THE_PERSON }, { kind: 'agent', id: theOfficesOwnId(t) })
    const short = office.filter((one) => one.sentBy?.id === theOfficesOwnId(t) && one.body.startsWith('Write to '))
    expect(short, 'the person was not told they can start the conversation again').toHaveLength(1)
    expect(short[0]?.body, 'the short line does not name the agent').toContain('Notice Wren')
    // The short line carries no `aboutMessage`: it is the office speaking to the person, not a
    // notice placed in the agent conversation.
    expect(short[0]?.aboutMessage ?? null).toBeNull()
  }, 60_000)

  it('draws the notice about a routed, held message in the writer’s conversation and not in the office one', async () => {
    // A HELD MESSAGE THE ROUTING DID NOT COPY. The agent it is addressed to answers nothing, and its
    // recorded owner is the person, so the routing gives it to nobody: the routed entry's `to` is null,
    // no copy is made and no delivery row is added, and the message waits for that agent. The notice
    // about it must follow the writer's addressee. The other direction is used here so the notice's
    // few words name another agent, and the conversation writes a fresh notice rather than reusing
    // the one already told above.
    // NOTHING HOLDS NOTICE SENDER IN THIS TEST OFFICE, so the office stores the message, routes it and
    // answers 409 rather than 201; the message is stored all the same.
    const sixth = await theAgentSays('notice-wren', senderId, 'six', 409)

    const held = await app.inject({
      method: 'POST',
      url: `/api/worker/messages/${sixth}/held`,
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'mole-office/the-message-worker',
      },
      payload: { to: { kind: 'agent', id: senderId }, because: 'the cap holds it' },
    })
    expect(held.statusCode, held.body).toBe(200)
    expect((held.json() as { starter?: { written?: boolean } }).starter?.written, held.body).toBe(true)

    // (1) IT IS IN THE CONVERSATION THE WRITER ADDRESSED, read as the writer, whom the notice was
    // addressed to. The other agent in that conversation is no party to the notice, and by the owner's
    // decision an agent reads only the messages it is a party to, so it is not shown the notice there.
    const between = await conversationAs({ kind: 'agent', id: 'notice-wren' }, { kind: 'agent', id: senderId })
    const inThePair = between.find((one) => one.sentBy?.id === theOfficesOwnId(t) && one.aboutMessage === sixth)
    expect(inThePair, 'the notice was not drawn in the conversation the writer addressed').toBeDefined()

    // (2) AND NOWHERE ELSE: NOT IN THE OFFICE'S OWN CONVERSATION WITH THE WRITER, the reader the
    // notice was addressed to. The notice reached only that reader, so the office-conversation rule
    // would draw it there if the aboutMessage rule did not put it in the pair instead.
    const office = await conversationAs({ kind: 'agent', id: 'notice-wren' }, { kind: 'agent', id: theOfficesOwnId(t) })
    const inTheOffice = office.find((one) => one.sentBy?.id === theOfficesOwnId(t) && one.aboutMessage === sixth)
    expect(inTheOffice, 'the notice was also drawn in the office conversation with the writer').toBeUndefined()
  }, 60_000)
})
