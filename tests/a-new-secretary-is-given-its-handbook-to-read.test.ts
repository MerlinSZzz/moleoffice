// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW SECRETARY IS GIVEN ITS HANDBOOK TO READ, ON ITS OWN CHECKLIST.
 *
 * WHAT WAS DECIDED. When an agent is given the secretary card, the office adds one item to that
 * agent's own checklist: read the secretary's handbook. The item links the card message that carried
 * the handbook. The secretary marks the item done itself. The item is added once per agent and card,
 * as the handbook is sent once. If the agent has no checklist yet, the office makes one.
 *
 * THE CHOICE ABOUT OTHER CARDS. Only the secretary card gets this item. Workers are registered for
 * each dispatch, often for one task, so an item and a checklist for every worker would fill the office
 * with checklists nobody keeps.
 *
 * WHAT EACH CASE PROVES.
 *   1. A new secretary has exactly one checklist, owned by it, with exactly one open handbook item,
 *      and the item links the card message marked as carrying the secretary card's handbook.
 *   2. An agent that already has a checklist gets the handbook item on that same checklist.
 *   3. Giving another card and then the secretary card again leaves exactly one handbook item in all
 *      its checklists together. (Registering the same handle again is not a way in: the starter door
 *      refuses a handle a live agent holds.)
 *   4. The secretary marks the handbook item done as itself, with its own key. An agent's "done" needs
 *      evidence, so it names the session it read the handbook in, as the item's words say.
 *   5. A supervisor card carries its handbook but gets no handbook item, and no checklist is made for
 *      it by this feature.
 *
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST (23 October 2026), each alone, in
 * src/server/lib/cardmessage.ts, in the working tree only, put back afterwards:
 *
 *   the condition that this very message carried the handbook taken out → case 3 red, with a second item;
 *   the condition that the card is the secretary card taken out → case 5 red, with an item for the supervisor,
 *     and cases 2 and 3 red with it, because each gives the worker card on the way;
 *   no checklist made for an agent that has none → case 1 red, and cases 3 and 4 red with it, which start
 *     from an agent with no checklist;
 *   the card message left out of the item's links → case 1 red, on the links;
 *   the item added as one whose evidence must be a manual section → case 4 red, because a session is not one.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let THE_HANDBOOK_ITEM_WORDS = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface StartedAgent {
  status: number
  text: string
  id: string
  key: string
}

interface AChecklist {
  id: string
  owner: { kind: string; id: string }
  items: { id: string; words: string; state: string; links?: string[] }[]
}

interface AMessage {
  id: string
  mark: { card?: string } | null
}

async function inject(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: InjectOptions['payload'],
  headers: Record<string, string> = AS_THE_PERSON,
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

/** Register through the starter door, as the person. */
async function started(body: Record<string, unknown>): Promise<StartedAgent> {
  const reply = await inject('POST', '/api/agents/started', body)
  const agent = (reply.json['agent'] ?? {}) as { id?: string }
  const give = (reply.json['whatToGiveIt'] ?? {}) as { key?: string }
  return { status: reply.status, text: reply.text, id: String(agent.id ?? ''), key: String(give.key ?? '') }
}

/** The headers of one registered agent, acting as itself with the key its registration gave it. */
function asAgent(handle: string, key: string): Record<string, string> {
  return {
    ...AS_THE_PERSON,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-key': key,
  }
}

/** Every checklist owned by one agent, through the real read door. */
async function checklistsFor(handle: string): Promise<AChecklist[]> {
  const reply = await inject('GET', `/api/checklists?owner=agent:${handle}`)
  expect(reply.status, reply.text).toBe(200)
  return reply.json['checklists'] as AChecklist[]
}

/** Every message waiting for one agent, with the mark saying which card's handbook it carried. */
async function messagesFor(handle: string): Promise<AMessage[]> {
  const waiting = await inject('GET', `/api/handles/${handle}/waiting`)
  expect(waiting.status, waiting.text).toBe(200)
  const out: AMessage[] = []
  for (const one of (waiting.json as { waiting: { messageId: string }[] }).waiting) {
    const reply = await inject('GET', `/api/records/${one.messageId}`)
    expect(reply.status, reply.text).toBe(200)
    const data = (reply.json['record'] as { data: Record<string, unknown> }).data
    const extra = (data['extra'] ?? {}) as Record<string, unknown>
    out.push({ id: one.messageId, mark: (extra['handbookSent'] as AMessage['mark']) ?? null })
  }
  return out
}

/** The one waiting message that carried the secretary card's handbook. */
async function theSecretaryCardMessage(handle: string): Promise<AMessage> {
  const secretary = (await messagesFor(handle)).filter((one) => one.mark?.card === 'secretary')
  expect(secretary.length, 'the secretary card message is not waiting for the agent').toBe(1)
  return secretary[0]!
}

/** The handbook items across every checklist the agent owns. */
function theHandbookItems(checklists: readonly AChecklist[]): AChecklist['items'] {
  return checklists.flatMap((one) => one.items.filter((item) => item.words === THE_HANDBOOK_ITEM_WORDS))
}

beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const cardmessage = await import('../src/server/lib/cardmessage.ts')
  THE_HANDBOOK_ITEM_WORDS = cardmessage.THE_HANDBOOK_ITEM_WORDS
})

afterEach(async () => {
  await app.close()
  t.close()
})

describe('a new secretary is given its handbook to read', () => {
  it('1. has one checklist of its own with one open item that links the card message', async () => {
    const handle = 'made-up-secretary'
    const made = await started({ handle, name: 'Made-up secretary', role: 'secretary' })
    expect(made.status, made.text).toBe(201)

    const checklists = await checklistsFor(handle)
    expect(checklists.length, 'the office made no checklist, or more than one').toBe(1)
    const only = checklists[0]!
    expect(only.owner).toEqual({ kind: 'agent', id: made.id })

    const items = theHandbookItems(checklists)
    expect(items.length, 'the checklist does not hold exactly one handbook item').toBe(1)
    expect(items[0]!.state).toBe('open')

    const card = await theSecretaryCardMessage(handle)
    expect(items[0]!.links ?? [], 'the handbook item does not link the card message').toContain(card.id)
  })

  it('2. puts the item on a checklist the agent already has', async () => {
    const handle = 'made-up-worker'
    const made = await started({ handle, name: 'Made-up worker', role: 'worker' })
    expect(made.status, made.text).toBe(201)

    const theirs = await inject('POST', '/api/checklists', { title: 'A made-up checklist' }, asAgent(handle, made.key))
    expect(theirs.status, theirs.text).toBe(201)
    const checklist = (theirs.json['checklist'] as { id: string }).id

    const given = await inject('POST', `/api/roles/card/${handle}`, { role: 'secretary' })
    expect(given.status, given.text).toBe(201)

    const checklists = await checklistsFor(handle)
    expect(checklists.length, 'the card was given and the agent now has more than one checklist').toBe(1)
    expect(checklists[0]!.id).toBe(checklist)
    expect(theHandbookItems(checklists).length, 'the existing checklist has no handbook item').toBe(1)
  })

  it('3. gives no second handbook item when the card is given again', async () => {
    const handle = 'made-up-secretary-again'
    const made = await started({ handle, name: 'Made-up secretary again', role: 'secretary' })
    expect(made.status, made.text).toBe(201)
    expect(theHandbookItems(await checklistsFor(handle)).length).toBe(1)

    const another = await inject('POST', `/api/roles/card/${handle}`, { role: 'worker' })
    expect(another.status, another.text).toBe(201)
    const again = await inject('POST', `/api/roles/card/${handle}`, { role: 'secretary' })
    expect(again.status, again.text).toBe(201)

    expect(theHandbookItems(await checklistsFor(handle)).length, 'the office added a second handbook item').toBe(1)
  })

  it('4. the secretary marks the item done as itself', async () => {
    const handle = 'made-up-secretary-ticks'
    const made = await started({ handle, name: 'Made-up secretary ticking', role: 'secretary' })
    expect(made.status, made.text).toBe(201)

    const checklists = await checklistsFor(handle)
    const item = theHandbookItems(checklists)[0]
    expect(item, 'there is no handbook item to mark done').toBeDefined()

    const session = await inject(
      'POST',
      '/api/records',
      { kind: 'session', title: 'Made-up session: the secretary reads its handbook', data: { state: 'running', runtime: 'claude-code' } },
      asAgent(handle, made.key),
    )
    expect(session.status, session.text).toBe(201)
    const readIn = (session.json['record'] as { id: string }).id

    const done = await inject(
      'PATCH',
      `/api/checklists/${checklists[0]!.id}/items/${item!.id}`,
      { state: 'done', evidence: [{ kind: 'run', record: readIn }] },
      asAgent(handle, made.key),
    )
    expect(done.status, done.text).toBe(200)
    expect((done.json['item'] as { state: string }).state).toBe('done')
  })

  it('5. another card gets no handbook item', async () => {
    const handle = 'made-up-supervisor'
    const made = await started({ handle, name: 'Made-up supervisor', role: 'supervisor' })
    expect(made.status, made.text).toBe(201)

    const card = (await messagesFor(handle)).filter((one) => one.mark?.card === 'supervisor')
    expect(card.length, 'the supervisor card message carries no handbook, so this case proves nothing').toBe(1)

    expect(theHandbookItems(await checklistsFor(handle)).length, 'a card that is not the secretary card got the item').toBe(0)
  })
})
