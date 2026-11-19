// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REGISTRATION NAMING NO CARD IS A WORKER NOBODY CHOSE, AND IT SAYS SO. Criterion P75.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * A registration that names no card makes a worker by default.
 * Registering an agent with no rung named writes worker on its row, MARKED AS THE RULE'S
 * DEFAULT rather than as a starter's choice; nothing reads an absent card.
 *
 * MEASURED BEFORE THIS BRANCH, on 8 September 2026 against a copy of the live corpus: registering
 * with no card left `role` NULL on the registry row and no `role` key on the agent record at all.
 * The Embassy drew `role: "worker"` and `choseRole: false`, both worked out from that null in
 * src/server/api/office.ts — so which card the row held and whether anybody chose it were two facts
 * read out of one empty value.
 *
 * Four things:
 *
 *   · a registration naming no card writes `worker` on the record AND on the registry row, with the
 *     mark saying the rule chose it and naming nobody;
 *   · a registration naming a card writes that card with the mark naming the starter that chose it;
 *   · the Embassy row and the citizen's page carry the mark, and both draw the same sentence;
 *   · a row written before the mark existed is answered "nobody recorded who chose this card" — not
 *     "the rule chose it", which nothing can know about such a row.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. In src/server/api/participants.ts, put `...(body.role === undefined ? {} : { role: body.role })`
 *      back in place of the always-written card → the row is NULL again and the first case fails.
 *   2. In the same place, write `{ how: 'the-rule', who: null }` whatever the starter said → the
 *      second case fails, because a card a starter chose is marked as nobody's choice.
 *   3. In src/shared/roles.ts, have `theMarkSaying` answer `{ how: 'the-rule', who: null }` for an
 *      absent mark → the fourth case fails, because a row nobody recorded is claimed as the rule's.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import {
  A_ROW_WITH_NO_ROLE_READS_AS,
  NOBODY_RECORDED_WHO_CHOSE_THE_CARD,
  whoChoseTheCardSays,
  type WhoChoseTheCard,
} from '../src/shared/roles.ts'

let t: TestDb
let app: FastifyInstance
let here: string

const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const secretary = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle }

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  payload?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${here}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** One Embassy row, by the handle on it. Null because the list holds none. */
/** The registry id of the agent with this handle. A new agent's id is minted, so it is not the handle. */
async function idOf(handle: string): Promise<string> {
  const said = await ask('GET', `/api/participants/agent/${handle}`)
  return (said.body.participant as { id: string }).id
}

async function embassyRowFor(handle: string): Promise<Record<string, unknown> | null> {
  const id = await idOf(handle)
  const said = await ask('GET', '/api/office/embassy')
  const rows = said.body.rows as { who: { id: string } }[]
  return (rows.find((one) => one.who.id === id) as Record<string, unknown> | undefined) ?? null
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  // THE STARTER FIRST. A registration needs a starter the registries hold, and a chain that reaches
  // the person: the person registers the secretary, and the secretary registers the rest.
  const madeArgus = await ask('POST', '/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, runtime: 'claude-code', role: 'secretary' }, PERSON)
  expect(madeArgus.status, JSON.stringify(madeArgus.body).slice(0, 300)).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a registration that names no card', () => {
  it('writes the worker card on the record and on the row', async () => {
    const made = await ask('POST', '/api/agents/started', { handle: 'no-card', name: 'No Card', runtime: 'claude-code' }, secretary)
    expect(made.status, JSON.stringify(made.body).slice(0, 300)).toBe(201)

    const record = await ask('GET', `/api/records/${String(made.body.record)}`)
    const data = (record.body.record as { data: Record<string, unknown> }).data
    expect(data.role, 'the card is on the record rather than absent').toBe(A_ROW_WITH_NO_ROLE_READS_AS)

    const row = await ask('GET', '/api/participants/agent/no-card')
    expect((row.body.participant as { role: unknown }).role, 'and on the registry row').toBe(
      A_ROW_WITH_NO_ROLE_READS_AS,
    )
  })

  it('marks it as the rule’s and names nobody, because nobody chose it', async () => {
    const record = await ask('GET', '/api/participants/agent/no-card')
    const mark = (record.body.participant as { cardChosenBy: WhoChoseTheCard | null }).cardChosenBy
    expect(mark).toEqual({ how: 'the-rule', who: null })
    expect(whoChoseTheCardSays(mark), 'and the sentence says nobody chose it').toContain('nobody chose this card')
  })

  it('says so in the reply to the registration itself', async () => {
    const made = await ask('POST', '/api/agents/started', { handle: 'no-card-two', name: 'No Card Two', runtime: 'claude-code' }, secretary)
    const card = made.body.card as { role: string; chosenBy: WhoChoseTheCard; says: string | null }
    expect(card.role, 'the reply names the card that was written').toBe(A_ROW_WITH_NO_ROLE_READS_AS)
    expect(card.chosenBy).toEqual({ how: 'the-rule', who: null })
    expect(card.says).toContain('the rule wrote')
  })
})

describe('a registration that names a card', () => {
  it('writes that card, marked as the starter’s choice', async () => {
    const made = await ask(
      'POST',
      '/api/agents/started',
      { handle: 'a-supervisor', name: 'A Supervisor', role: 'supervisor', runtime: 'claude-code' },
      secretary,
    )
    expect(made.status, JSON.stringify(made.body).slice(0, 300)).toBe(201)
    const row = await ask('GET', '/api/participants/agent/a-supervisor')
    const held = row.body.participant as { role: string; cardChosenBy: WhoChoseTheCard | null }
    expect(held.role).toBe('supervisor')
    expect(held.cardChosenBy).toEqual({ how: 'a-starter', who: { kind: 'agent', id: await idOf(THE_TEST_OFFICES_SECRETARY.handle) } })
    // THE SENTENCE NAMES THE CHOOSER BY THE HANDLE ON ITS ROW, which the card reply carries beside the
    // stored id, and the page passes it exactly this way (wave rule 5).
    const profile = await ask('GET', '/api/participants/agent/a-supervisor/profile')
    const card = (profile.body as { theCardTheyHold: { chosenByHandle: string | null } }).theCardTheyHold
    expect(whoChoseTheCardSays(held.cardChosenBy, card.chosenByHandle)).toContain(`chosen by ${THE_TEST_OFFICES_SECRETARY.handle},`)
  })
})

describe('the two screens read the mark rather than working it out', () => {
  it('the Embassy row carries it', async () => {
    const nobody = await embassyRowFor('no-card')
    expect(nobody, 'the row is in the list').not.toBeNull()
    expect(nobody?.cardChosenBy).toEqual({ how: 'the-rule', who: null })
    const chosen = await embassyRowFor('a-supervisor')
    expect(chosen?.cardChosenBy).toEqual({ how: 'a-starter', who: { kind: 'agent', id: await idOf(THE_TEST_OFFICES_SECRETARY.handle) } })
  })

  it('the citizen’s page carries it, and says the same sentence', async () => {
    const said = await ask('GET', '/api/participants/agent/no-card/profile')
    const card = (said.body as { theCardTheyHold: { chosenBy: WhoChoseTheCard | null } }).theCardTheyHold
    expect(card.chosenBy).toEqual({ how: 'the-rule', who: null })
    const row = await embassyRowFor('no-card')
    expect(
      whoChoseTheCardSays(card.chosenBy),
      'one sentence, from one place, on both screens',
    ).toBe(whoChoseTheCardSays(row?.cardChosenBy as WhoChoseTheCard | null))
  })
})

describe('a row written before the mark existed', () => {
  /**
   * WHAT SUCH A ROW IS. An `agent` record filed through the ordinary door, which writes no mark —
   * exactly what every registration wrote before 8 September 2026. It is the honest stand-in for a
   * row in the live corpus, and it needs no fixture written into a table by hand.
   */
  it('is answered “nobody recorded who chose this card”, and never “the rule chose it”', async () => {
    const made = await ask(
      'POST',
      '/api/records',
      { kind: 'agent', title: 'An Older Row', data: { handle: 'older-row', state: 'active', role: 'worker', runtime: 'claude-code' } },
      PERSON,
    )
    expect(made.status, JSON.stringify(made.body).slice(0, 300)).toBe(201)
    const row = await ask('GET', '/api/participants/agent/older-row')
    const held = row.body.participant as { role: string; cardChosenBy: WhoChoseTheCard | null }
    expect(held.role, 'the word is on the row').toBe('worker')
    expect(held.cardChosenBy, 'and nothing was invented about who chose it').toBeNull()
    expect(whoChoseTheCardSays(held.cardChosenBy)).toBe(NOBODY_RECORDED_WHO_CHOSE_THE_CARD)
    const embassy = await embassyRowFor('older-row')
    expect(embassy?.cardChosenBy).toBeNull()
  })
})
