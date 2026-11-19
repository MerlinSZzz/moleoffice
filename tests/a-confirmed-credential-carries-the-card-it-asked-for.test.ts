// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONFIRMED CREDENTIAL CARRIES THE CARD IT ASKED FOR, AND ITS ROW LEADS TO A PAGE. Criterion P81,
 * and the half of problem dOhkq6Nrbq2b that perm-5a left open.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * A visitor's registration names its role card, and nobody has to open it afterwards to change it to
 * supervisor: a credential names the card it asks for, and confirming gives that card in the same
 * press.
 *
 * MEASURED BEFORE THIS BRANCH, on 8 September 2026: a credential asking for the supervisor card was
 * confirmed 200 and the profile of the handle it asked for answered 404 both before and after — "No
 * agent in this installation answers to codex-far". No registry row and no agent record were made;
 * the Embassy drew the row as a visitor, unregistered, with the card read off the credential rather
 * than off any row. The `role` on the credential was never checked against the card tree either, so
 * any word at all could be asked for.
 *
 * Five things:
 *
 *   · the door refuses a card no role card holds, naming every word there is;
 *   · confirming writes the agent record and its row, with the handle and the card asked for, and
 *     the mark saying the confirmer gave it;
 *   · a card above the visitor card ceiling — the secretary, the inspector — is REFUSED AT THE ISSUING
 *     DOOR by default, naming the ceiling and MOLE_OFFICE_VISITOR_CARD_CEILING, which is criterion
 *     P86 superseding the older confirm-time diversion P81 built;
 *   · nothing is confirmed without a card: the worker card is written either way;
 *   · the row leads to a citizen's page that answers, which is dOhkq6Nrbq2b closed.
 *
 * ---------------------------------------------------------------------------------------
 * TWO REAL DOORS AND NOT ONE `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * A visitor is an agent on another machine, and an injected request is on no socket at all — its
 * arrival is undefined, so the machine rules do not apply to it. This opens two listeners onto one
 * built app, the way tests/a-visiting-agent-holds-its-own-credential.test.ts does.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. In src/server/api/visitors.ts, drop the `isARole` check at the issuing door → an unknown card
 *      is issued against and the first case fails.
 *   2. In the same file, have the confirm route not call `theCitizenAConfirmMakes` → no row is
 *      written and the second, fourth and fifth cases fail.
 *   3. In src/server/api/visitors.ts, take out the `whyThisCardIsAboveTheVisitorCeiling` check at the
 *      issuing door → a credential asking for the secretary card is issued and the third case fails.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { WhoChoseTheCard } from '../src/shared/roles.ts'
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
async function askToComeIn(handle: string, role: string): Promise<{ id: string; status: number; body: Record<string, unknown> }> {
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

afterAll(async () => {
  for (const s of extraDoors) await new Promise<void>((r) => s.close(() => r()))
  await app.close()
  t.close()
})

describe('the card a credential asks for', () => {
  it('is refused when no role card holds that word', async () => {
    const said = await askToComeIn('codex-nonsense', 'overlord')
    expect(said.status, JSON.stringify(said.body).slice(0, 300)).toBe(400)
    expect(String(said.body.error), 'the word it sent').toContain('overlord')
    expect(String(said.body.error), 'and every word there is').toContain('worker')
    expect(String(said.body.error)).toContain('supervisor')
  })

  it('is written on the row when the owner confirms, with the mark saying the owner gave it', async () => {
    const asked = await askToComeIn('codex-sup', 'supervisor')
    expect(asked.status).toBe(201)
    // BEFORE: nothing answers to the handle. This is the state problem dOhkq6Nrbq2b was filed about.
    const before = await ask(here, 'GET', '/api/participants/agent/codex-sup')
    expect(before.status, 'nothing answers to the handle yet').toBe(404)

    const done = await ask(here, 'POST', `/api/office/visitors/${asked.id}/confirm`, {}, PERSON)
    expect(done.status, JSON.stringify(done.body).slice(0, 300)).toBe(200)
    const citizen = done.body.citizen as { card: string; asked: string; says: string }
    expect(citizen.card, 'the card asked for is the card given').toBe('supervisor')
    expect(citizen.asked).toBe('supervisor')

    const row = await ask(here, 'GET', '/api/participants/agent/codex-sup')
    expect(row.status, 'and the row is there').toBe(200)
    const held = row.body.participant as {
      role: string
      credential: string
      cardChosenBy: WhoChoseTheCard | null
      startedBy: { kind: string; id: string } | null
    }
    expect(held.role).toBe('supervisor')
    expect(held.credential, 'the row names the credential it came in on').toBe(asked.id)
    expect(held.cardChosenBy, 'and the mark says the confirmer gave it').toEqual({
      how: 'a-credential',
      who: { kind: 'person', id: THE_PERSON },
    })
    expect(held.startedBy, 'the confirmer answers for it').toEqual({ kind: 'person', id: THE_PERSON })
  })

  it('is refused at the issuing door when it is above the visitor card ceiling', async () => {
    const asked = await askToComeIn('codex-sec', 'secretary')
    expect(asked.status, JSON.stringify(asked.body).slice(0, 300)).toBe(400)
    expect(String(asked.body.error), 'the ceiling it is above').toContain('supervisor')
    expect(String(asked.body.error), 'and the setting that holds it').toContain(
      'MOLE_OFFICE_VISITOR_CARD_CEILING',
    )
    // AND NOTHING WAS ISSUED, so no row exists for the handle the credential would have asked under.
    const row = await ask(here, 'GET', '/api/participants/agent/codex-sec')
    expect(row.status, 'nothing answers to the handle').toBe(404)
  })

  it('is never absent: nothing is confirmed without a card', async () => {
    for (const handle of ['codex-sup']) {
      const row = await ask(here, 'GET', `/api/participants/agent/${handle}`)
      const held = row.body.participant as { role: string | null }
      expect(held.role, `${handle} holds a card`).not.toBeNull()
    }
  })

  it('makes the Embassy row a citizen rather than a visitor', async () => {
    const said = await ask(here, 'GET', '/api/office/embassy')
    const rows = said.body.rows as { who: { id: string }; standing: string; registered: boolean; role: unknown }[]
    // EMBASSY ROWS ARE KEYED BY THE REGISTRY ID, which since the mint is not the handle.
    const codexSupId = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('codex-sup') as { id: string }).id
    const mine = rows.find((one) => one.who.id === codexSupId)
    expect(mine, 'the row is in the list').toBeDefined()
    expect(mine?.registered, 'and this office holds it now').toBe(true)
    expect(mine?.role).toBe('supervisor')
  })
})
