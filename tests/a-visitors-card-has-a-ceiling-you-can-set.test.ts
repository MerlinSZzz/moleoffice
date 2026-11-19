// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A VISITOR'S CARD HAS A CEILING YOU CAN SET — CRITERION P86.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The rule: a visitor's card is at most supervisor by default, never inspector or
 * secretary, and the person may change that in the settings. A visitor is an agent that came in through the Embassy
 * on a credential. The card a credential asks for, and the card a confirm gives, is refused above the
 * ceiling with a sentence naming the ceiling and naming MOLE_OFFICE_VISITOR_CARD_CEILING.
 *
 * Three things:
 *
 *   · by default the inspector card is refused at the issuing door, and the sentence names the
 *     supervisor ceiling and the setting;
 *   · with MOLE_OFFICE_VISITOR_CARD_CEILING raised the card is accepted, confirming writes it, and
 *     the row says the setting raised the ceiling;
 *   · the supervisor card, which is the default ceiling, is given with nothing set and no raised mark.
 *
 * ---------------------------------------------------------------------------------------
 * TWO REAL DOORS AND NOT ONE `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * A visitor is an agent on another machine, and the credential's machine is measured from the socket.
 * This opens a second listener stamped as another machine, the way the credential tests do, so the
 * visitor path is exercised through the product's own door and not a copy of it.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. In src/server/api/visitors.ts, take out the `whyThisCardIsAboveTheVisitorCeiling` check at the
 *      issuing door → the credential asking for the inspector card is issued and the first case fails.
 *   2. In the same file, take out the check in the confirm route → the raised-card case still passes,
 *      but a credential issued before the ceiling was lowered would be confirmed. The first case is
 *      the one that proves the default refusal.
 *   3. In src/server/lib/visitorceiling.ts, make `whyThisCardIsAboveTheVisitorCeiling` always answer
 *      null → the first case fails.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let here: string
let loquat: string
const extraDoors: Server[] = []

const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

async function open(server: Server): Promise<string> {
  extraDoors.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

async function ask(
  door: string,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** Ask loquat's door for a credential naming a card, and hand back the row it made. */
async function askToComeIn(
  handle: string,
  role: string,
): Promise<{ id: string; status: number; body: Record<string, unknown> }> {
  const said = await ask(loquat, 'POST', '/api/office/visitors', {
    handle,
    name: `The ${handle} on loquat`,
    role,
    conversationPath: `${THE_TEST_FIXTURE_ROOT}/.claude/projects/loquat/${handle}.jsonl`,
    runtime: 'codex',
  })
  const credential = said.body.credential as { id: string } | undefined
  return { id: credential?.id ?? '', status: said.status, body: said.body }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const { stampArrival } = await import('../src/server/lib/http.ts')
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  loquat = await open(
    createServer((raw, res) => {
      stampArrival(raw, 'another machine', 'the caller')
      app.routing(raw, res)
    }),
  )
})

afterEach(() => {
  delete process.env.MOLE_OFFICE_VISITOR_CARD_CEILING
})

afterAll(async () => {
  for (const s of extraDoors) await new Promise<void>((r) => s.close(() => r()))
  await app.close()
  t.close()
})

describe('the visitor card ceiling', () => {
  it('refuses the inspector card by default, naming the ceiling and the setting', async () => {
    delete process.env.MOLE_OFFICE_VISITOR_CARD_CEILING
    const said = await askToComeIn('ceiling-inspector', 'inspector')
    expect(said.status, JSON.stringify(said.body).slice(0, 300)).toBe(400)
    const error = String(said.body.error)
    expect(error, 'the card it asked for').toContain('inspector')
    expect(error, 'the ceiling it is above').toContain('supervisor')
    expect(error, 'and the setting that holds the ceiling').toContain('MOLE_OFFICE_VISITOR_CARD_CEILING')
  })

  it('accepts it with the ceiling raised, and the row says the setting raised the ceiling', async () => {
    process.env.MOLE_OFFICE_VISITOR_CARD_CEILING = 'inspector'
    const asked = await askToComeIn('ceiling-raised', 'inspector')
    expect(asked.status, JSON.stringify(asked.body).slice(0, 300)).toBe(201)

    const done = await ask(here, 'POST', `/api/office/visitors/${asked.id}/confirm`, {}, PERSON)
    expect(done.status, JSON.stringify(done.body).slice(0, 300)).toBe(200)
    const citizen = done.body.citizen as { card: string; says: string }
    expect(citizen.card, 'the card asked for is the card given').toBe('inspector')
    expect(citizen.says, 'the setting is named').toContain('MOLE_OFFICE_VISITOR_CARD_CEILING')
    expect(citizen.says, 'and that it raised the ceiling').toContain('raised')

    const row = await ask(here, 'GET', '/api/participants/agent/ceiling-raised')
    expect((row.body.participant as { role: string }).role, 'the row holds it').toBe('inspector')

    const embassy = await ask(here, 'GET', '/api/office/embassy')
    const rows = embassy.body.rows as {
      who: { id: string }
      role: string | null
      cardCeilingRaised: string | null
    }[]
    // EMBASSY ROWS ARE KEYED BY THE REGISTRY ID, which since the mint is not the handle.
    const raisedId = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('ceiling-raised') as { id: string }).id
    const mine = rows.find((one) => one.who.id === raisedId)
    expect(mine, 'the Embassy has a row for it').toBeDefined()
    expect(mine?.role, 'and the row holds the card').toBe('inspector')
    expect(mine?.cardCeilingRaised, 'and says the setting raised the ceiling').toContain(
      'MOLE_OFFICE_VISITOR_CARD_CEILING',
    )
  })

  it('gives the supervisor card with nothing set, and says nothing about a raised ceiling', async () => {
    delete process.env.MOLE_OFFICE_VISITOR_CARD_CEILING
    const asked = await askToComeIn('ceiling-supervisor', 'supervisor')
    expect(asked.status, JSON.stringify(asked.body).slice(0, 300)).toBe(201)
    const done = await ask(here, 'POST', `/api/office/visitors/${asked.id}/confirm`, {}, PERSON)
    expect(done.status).toBe(200)
    const citizen = done.body.citizen as { card: string; says: string }
    expect(citizen.card).toBe('supervisor')
    expect(citizen.says, 'nothing raised the ceiling for this one').not.toContain('raised the ceiling')
  })
})
