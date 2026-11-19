// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PRESS RETIRES AN AGENT'S REGISTRY ROW — PROBLEM zyCcJYCLsAe7.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED
 * ---------------------------------------------------------------------------------------
 *
 * Under proposal R9T5Xov_ueav (the agent had been closed, and it was only for a test) the secretary removed the
 * Codex agent's record. Its registry row, from 7 September 2026, whose id names the owner, stayed in the
 * Embassy as an ACTIVE CONTACT.
 *
 * WHY: nothing retired a registry row. `PATCH /api/participants/agent/<id>` does not take `retired`,
 * and the only writer of that column was `retireWhateverWasStartedFor` in src/server/lib/claims.ts —
 * the release of a claim, which an agent that registered itself never has. Retirement was written
 * for agents an office STARTED, and an agent that came in through the plain records door had no way
 * out of the registry at all. A reader could not tell a closed test agent from a live one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · the press retires the row, with who, when and why;
 *   · a reason is required, because the reason is what tells a closed agent from a live one;
 *   · the person may, the agent's own starter may, and nobody else does;
 *   · the handle is free again, by a decision and criterion I3: a later registration under it
 *     makes a new agent with a new id, and the retired row is left as it was;
 *   · removing the agent's RECORD does the same thing to the row, and the reply says so;
 *   · the Embassy carries the retirement on the row and the page folds it away behind a press;
 *   · the profile draws the press, and draws what was recorded once it has been used.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop `whyThisIsNotYoursToRetire` from the route → the refusal case goes red.
 *   drop `retireTheRowBehind` from `deleteRecord` → the record case goes red.
 *   make `agentByHandle` answer a retired row again → the handle cases go red.
 *   make `retired` on the Embassy row always null → the Embassy cases go red.
 *   drop `<RetireThisAgent/>` from ProfilePage.tsx → the two page cases go red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PROFILE_WORDS } from '../src/shared/profile.ts'
import type { WhatTheEmbassySays } from '../src/shared/worlds.ts'

type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')
type EmbassyModule = typeof import('../src/web/pages/EmbassyPage.tsx')

let t: TestDb
let app: FastifyInstance
let pp: ProfileModule
let ep: EmbassyModule

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as Record<string, unknown>)['record'] as string
}

async function retire(
  headers: Record<string, string>,
  handle: string,
  because?: string,
): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${handle}/retire`,
    headers,
    payload: because === undefined ? {} : { because },
  })
  return { code: reply.statusCode, said: reply.body }
}

async function rowFor(handle: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/participants/agent/${handle}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as Record<string, unknown>)['participant'] as Record<string, unknown>
}

async function embassy(): Promise<WhatTheEmbassySays> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/embassy', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheEmbassySays
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-one', name: 'Builder One', role: 'worker' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-two', name: 'Builder Two', role: 'worker' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-three', name: 'Builder Three', role: 'worker' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-four', name: 'Builder Four', role: 'worker' })

  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  storage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: THE_PERSON }))
  pp = (await import('../src/web/pages/ProfilePage.tsx')) as ProfileModule
  ep = (await import('../src/web/pages/EmbassyPage.tsx')) as EmbassyModule
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. the press

/**
 * THE REGISTRY ID OF THE RETIRED `builder-one`, read before a new agent takes the handle. From then
 * on the handle names the new agent (criterion I3), so every later case asks for the retired one by id.
 */
let theRetiredId = ''

describe('retiring an agent', () => {
  it('retires the row, with who, when and why', async () => {
    const said = await retire(AS_THE_PERSON, 'builder-one', 'a test agent, closed')
    expect(said.code, said.said).toBe(200)
    const row = await rowFor('builder-one')
    theRetiredId = String(row['id'])
    expect(row['retired']).toBe(true)
    expect(row['retiredBecause']).toBe('a test agent, closed')
    expect(row['retiredAt'], 'when it happened').not.toBeNull()
    expect(row['retiredBy'], 'and whose hand').toEqual({ kind: 'person', id: THE_PERSON })
  })

  it('requires a reason, because that is what tells a closed agent from a live one', async () => {
    const said = await retire(AS_THE_PERSON, 'builder-two')
    expect(said.code).toBe(400)
    expect(said.said, 'and the sentence says what a reason is for').toContain(
      'a reader can tell a closed test agent from a live one',
    )
    expect((await rowFor('builder-two'))['retired'], 'nothing was written').toBe(false)
  })

  it('lets the agent that started it retire it', async () => {
    const said = await retire(asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'builder-two', `${THE_TEST_OFFICES_SECRETARY.handle} is closing its own worker`)
    expect(said.code, said.said).toBe(200)
    // WHO RETIRED IT IS STORED BY REGISTRY ID, and the secretary's id is not its handle.
    expect((await rowFor('builder-two'))['retiredBy']).toEqual({ kind: 'agent', id: (await rowFor(THE_TEST_OFFICES_SECRETARY.handle))['id'] })
  })

  it('refuses an agent that did not start it, and names who may', async () => {
    const said = await retire(asAgent('builder-three'), 'builder-four', 'not mine to close')
    expect(said.code).toBe(403)
    expect(said.said, 'it names the starter').toContain(THE_TEST_OFFICES_SECRETARY.handle)
    expect(said.said).toContain('Nothing was written')
    expect((await rowFor('builder-four'))['retired'], 'nothing was written').toBe(false)
  })

  it('answers 404 for a handle no registry holds, rather than writing a row', async () => {
    const said = await retire(AS_THE_PERSON, 'nobody-here', 'x')
    expect(said.code).toBe(404)
  })
})

// ============================================================ 2. the handle is free again

/**
 * A DECISION AND CRITERION I3 OF design/agents/IDENTITY-ACCEPTANCE.md.
 * These cases used to prove the opposite: that a retired handle was refused to every later registration (problem
 * zyCcJYCLsAe7). The decision replaced that rule: a handle is unique among live
 * agents and free again after retirement, and a registration under a freed handle makes a NEW agent
 * with a NEW id. What the old rule protected is still held, by other means: the retired agent keeps
 * its row, its id, its reason and its history, and the new agent is a different row.
 */
describe('a retired handle', () => {
  /** Every row bearing one handle, oldest first, read straight from the table. */
  function everyRowBearing(handle: string): { id: string; name: string; retired: number; retired_because: string | null }[] {
    return t.client.sqlite
      .prepare('SELECT id, name, retired, retired_because FROM agents WHERE handle = ? ORDER BY created_at, rowid')
      .all(handle) as { id: string; name: string; retired: number; retired_because: string | null }[]
  }

  it('makes a new agent with a new id when it is registered again in the same project', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { handle: 'builder-one', name: 'Somebody Else', role: 'worker' },
    })
    expect(reply.statusCode, reply.body).toBe(201)
    const made = (reply.json() as { agent: { id: string; retired: boolean } }).agent
    expect(made.id, 'a new id').not.toBe(theRetiredId)
    expect(made.retired, 'and it is live').toBe(false)
    const rows = everyRowBearing('builder-one')
    expect(rows.map((one) => one.id)).toEqual([theRetiredId, made.id])
  })

  /**
   * AND IN ANOTHER PROJECT, a record under the handle is the LIVE agent bearing it: one live registry
   * row per handle, which is the rule the migration mapped by. It is not mapped onto the retired row.
   */
  it('maps a registration in another project onto the live agent that now bears it, not the retired one', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { id: 'another', title: 'Another project' },
    })
    expect(made.statusCode, made.body).toBe(201)
    const reply = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { ...asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'x-mole-office-workspace': 'another' },
      payload: { handle: 'builder-one', name: 'Somebody Else Again', role: 'worker' },
    })
    expect(reply.statusCode, reply.body).toBe(201)
    const mappedTo = (reply.json() as { agent: { id: string } }).agent.id
    const rows = everyRowBearing('builder-one')
    expect(rows.length, 'no third row').toBe(2)
    expect(mappedTo, 'the live one').toBe(rows[1]!.id)
    expect(mappedTo).not.toBe(theRetiredId)
  })

  it('leaves the retired agent as it was, because nothing was deleted and nothing was moved', async () => {
    const row = everyRowBearing('builder-one').find((one) => one.id === theRetiredId)
    expect(row?.name, 'the row is kept').toBe('Builder One')
    expect(row?.retired, 'still retired').toBe(1)
    expect(row?.retired_because).toBe('a test agent, closed')
  })
})

// ============================================================ 3. removing the record does the same

describe('removing an agent’s record', () => {
  it('retires the registry row with it, and the reply says so', async () => {
    const record = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-five', name: 'Builder Five', role: 'worker' })
    const gone = await app.inject({ method: 'DELETE', url: `/api/records/${record}`, headers: AS_THE_PERSON })
    expect(gone.statusCode, gone.body).toBe(200)
    expect(gone.body, 'the reply says what happened to the row').toContain('is retired with it')
    const row = await rowFor('builder-five')
    expect(row['retired'], 'the row a reader sees in the Embassy').toBe(true)
    expect(String(row['retiredBecause']), 'and it says which record went').toContain('was removed')
  })
})

// ============================================================ 4. the Embassy

describe('the Embassy', () => {
  it('carries the retirement on the row', async () => {
    const said = await embassy()
    // THE EMBASSY ROW IS KEYED BY REGISTRY ID, which is not the handle. The retired agent's id was read
    // before a new agent took its handle.
    const row = said.rows.find((one) => one.who.id === theRetiredId)
    expect(row, 'the row is kept and still listed').toBeDefined()
    expect(row?.retired, 'and it says it was retired').not.toBeNull()
    expect(row?.retired?.because).toBe('a test agent, closed')
  })

  it('folds it away, and says how many are folded', async () => {
    const said = await embassy()
    const page = renderToStaticMarkup(h(ep.TheEmbassy, { said }))
    expect(page, 'the press that shows them').toContain(ep.EMBASSY_WORDS.showRetired)
    expect(page, 'and a retired row is not drawn until it is pressed').not.toContain('a test agent, closed')
  })

  it('leaves a live row in the list', async () => {
    const said = await embassy()
    const page = renderToStaticMarkup(h(ep.TheEmbassy, { said }))
    expect(page).toContain(THE_TEST_OFFICES_SECRETARY.name)
  })
})

// ============================================================ 5. the profile

describe('the agent’s profile', () => {
  it('draws the press, and says what retiring does', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: '/api/participants/agent/builder-four/profile',
      headers: AS_THE_PERSON,
    })
    expect(reply.statusCode).toBe(200)
    const page = renderToStaticMarkup(
      h(pp.TheProfile, { said: reply.json(), onChanged: () => {} } as unknown as Parameters<
        ProfileModule['TheProfile']
      >[0]),
    )
    expect(page).toContain(PROFILE_WORDS.retire)
    // A DECISION AND CRITERION I3: the words say the handle is free again, where they said it
    // was never reused.
    expect(page, 'plan 7FEOshq3mBGG keeps the normal explanation free of identifiers').toContain('revokes its keys and stops new work')
  })

  it('draws what was recorded once it has been used, and no press', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: `/api/participants/agent/${theRetiredId}/profile`,
      headers: AS_THE_PERSON,
    })
    const page = renderToStaticMarkup(
      h(pp.TheProfile, { said: reply.json(), onChanged: () => {} } as unknown as Parameters<
        ProfileModule['TheProfile']
      >[0]),
    )
    expect(page).toContain(PROFILE_WORDS.retired)
    expect(page, 'the reason is what tells a closed agent from a live one').toContain('a test agent, closed')
    expect(page, 'and there is nothing left to do to it').not.toContain(PROFILE_WORDS.retireSays)
  })

  it('draws no press on a person, who is not retired by anybody', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: `/api/participants/person/${THE_PERSON}/profile`,
      headers: AS_THE_PERSON,
    })
    const page = renderToStaticMarkup(
      h(pp.TheProfile, { said: reply.json(), onChanged: () => {} } as unknown as Parameters<
        ProfileModule['TheProfile']
      >[0]),
    )
    expect(page).not.toContain(PROFILE_WORDS.retire)
  })
})
