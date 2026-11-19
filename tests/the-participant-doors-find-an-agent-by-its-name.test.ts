// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PARTICIPANT DOORS FIND AN AGENT BY ITS HANDLE OR ITS ID, AND STORE THE ID.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROTECTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion I2 of design/agents/IDENTITY-ACCEPTANCE.md, for src/server/api/participants.ts. Since the
 * mint (criterion I1) a new agent's id is twelve characters of its own and its handle is only a name.
 * The dsh hooks send the handle to `GET` and `PATCH /api/participants/agent/<handle>` (criterion I9),
 * so those doors read the `:id` segment as an arriving reference, through the one resolver. The
 * retire rule compares the stored starter with the live caller through `sameAgent`, and stores who
 * retired the row by registry id. The sentences name an agent by its handle, never by a minted id.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   GET and the profile read `who` from the path unresolved → the "by its handle" read cases go red.
 *   PATCH reads `who` from the path unresolved → the PATCH-by-handle case, the own-line case and the
 *     "names two agents" case go red (the legacy row `foo` is changed instead of refused).
 *   the picture door reads `who` from the path unresolved → the picture case goes red.
 *   GET /api/avatars reads `for` unresolved → the "what is offered" case goes red.
 *   the key of POST /agents/started is asked about by `body.handle` → the "names two agents" case goes
 *     red, because registering `foo` beside the legacy row `foo` is refused after its row is written.
 *   whoMayRetire compares `starter.id === actor.id` → the "starter sends its handle" case goes red.
 *   the retire door stores the raw header as `retiredBy` → the `retiredBy` case goes red.
 *   whoMayRetire's sentence prints the stored starter id → the refusal-sentence case goes red.
 *   theChainUpFrom prints the rung's id → the chain sentence case goes red.
 *   the registration refusal lists the chain by id → the chain sentence case goes red.
 *   the card message of POST /agents/started goes to `body.handle` → the card message case goes red.
 *
 * ROUND 2, the sentences a person reads and one comparison:
 *   `chosenByHandle` on the card reply is null → the card chooser case goes red.
 *   whoChoseTheCardSays ignores the name it is given → the card chooser case goes red.
 *   TheirCard.tsx passes no name, or ProfilePage.tsx draws `retiredBy.id` → the page case goes red.
 *   theEmbassy carries no `byHandle` or no `cardChosenByHandle`, whoChoseTheCardInAWord ignores its
 *     name, or EmbassyPage.tsx draws the chooser's id → the Embassy case goes red. The Embassy's
 *     retirer line is drawn only after a press, so its page mutation is proved in the browser file
 *     tests/the-embassy-draws-the-retirer-by-its-handle.test.ts.
 *   `retiredByHandle` on the agent wire is null → the retirer's handle case goes red.
 *   the restore refusal prints the key's stored holder id → the restore case goes red.
 *   theCardAskWaitingOnThePerson compares the stored asker with the handle → the card ask case goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whoChoseTheCardSays, type WhoChoseTheCard } from '../src/shared/roles.ts'
import { PROFILE_WORDS } from '../src/shared/profile.ts'
import type { WhatTheEmbassySays } from '../src/shared/worlds.ts'

let t: TestDb
let app: FastifyInstance

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

/** Register an agent through the door, and hand back its registry id, which is not its handle. */
async function register(headers: Record<string, string>, handle: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers,
    payload: { handle, name: `Name of ${handle}` },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const id = ((reply.json() as { agent: { id: string } }).agent).id
  expect(id, 'the mint line is not in this tree').not.toBe(handle)
  return id
}

/** One registry row, read straight from the table. */
function row(id: string): { name: string; handle: string; retired: number; retired_by_kind: string | null; retired_by_id: string | null } {
  return t.client.sqlite
    .prepare('SELECT name, handle, retired, retired_by_kind, retired_by_id FROM agents WHERE id = ?')
    .get(id) as { name: string; handle: string; retired: number; retired_by_kind: string | null; retired_by_id: string | null }
}

/** A registry row written straight into the table, the shape an agent registered before the mint has. */
function insertLegacyAgent(id: string, handle: string, name: string, startedBy: { kind: string; id: string } | null): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${id}`, '2026-09-16 10:00:00')
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at, started_by_kind, started_by_id) ' +
        'VALUES (?, ?, ?, ?, 0, ?, ?, ?)',
    )
    .run(id, name, handle, `avatar-default-agent-${id}`, '2026-09-16 10:00:00', startedBy?.kind ?? null, startedBy?.id ?? null)
}

async function retire(headers: Record<string, string>, who: string): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${who}/retire`,
    headers,
    payload: { because: 'a test agent, closed by the test' },
  })
  return { code: reply.statusCode, said: reply.body }
}

let starter: string
let childA: string
let childB: string
let childC: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // A WORKER STARTS THREE WORKERS. A worker holds no rung above a worker, so the only thing that lets
  // it retire them is being their starter. The stranger is a worker too, and is nobody's starter.
  starter = await register(AS_THE_PERSON, 'starter-w')
  childA = await register(asAgent('starter-w'), 'child-a')
  childB = await register(asAgent('starter-w'), 'child-b')
  childC = await register(asAgent('starter-w'), 'child-c')
  await register(AS_THE_PERSON, 'stranger')
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('GET and the profile find a new agent by its handle and by its id', () => {
  it('reads the agent by its handle', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/participants/agent/child-a', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    expect((reply.json() as { participant: { id: string } }).participant.id).toBe(childA)
  })

  it('reads the agent by its id', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/participants/agent/${childA}`, headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    expect((reply.json() as { participant: { id: string } }).participant.id).toBe(childA)
  })

  it('reads the profile by its handle and by its id', async () => {
    for (const said of ['child-a', childA]) {
      const reply = await app.inject({ method: 'GET', url: `/api/participants/agent/${said}/profile`, headers: AS_THE_PERSON })
      expect(reply.statusCode, `${said}: ${reply.body}`).toBe(200)
      expect((reply.json() as { participant: { id: string } }).participant.id).toBe(childA)
    }
  })
})

describe('PATCH finds a new agent by its handle and by its id', () => {
  it('changes the name by the handle and then by the id', async () => {
    const byHandle = await app.inject({
      method: 'PATCH',
      url: '/api/participants/agent/child-b',
      headers: AS_THE_PERSON,
      payload: { name: 'Renamed by handle' },
    })
    expect(byHandle.statusCode, byHandle.body).toBe(200)
    expect(row(childB).name).toBe('Renamed by handle')
    const byId = await app.inject({
      method: 'PATCH',
      url: `/api/participants/agent/${childB}`,
      headers: AS_THE_PERSON,
      payload: { name: 'Renamed by id' },
    })
    expect(byId.statusCode, byId.body).toBe(200)
    expect(row(childB).name).toBe('Renamed by id')
  })

  it('lets an agent write its own line when it sends its handle in the path and the header', async () => {
    const reply = await app.inject({
      method: 'PATCH',
      url: '/api/participants/agent/child-b',
      headers: asAgent('child-b'),
      payload: { state: 'reading the brief' },
    })
    expect(reply.statusCode, reply.body).toBe(200)
  })

  it('refuses a string that is one agent\'s id and another live agent\'s handle, and changes neither', async () => {
    insertLegacyAgent('foo', 'legacy-foo', 'Legacy Foo', { kind: 'person', id: THE_PERSON })
    const newFoo = await register(AS_THE_PERSON, 'foo')
    const reply = await app.inject({
      method: 'PATCH',
      url: '/api/participants/agent/foo',
      headers: AS_THE_PERSON,
      payload: { name: 'Should not land' },
    })
    expect(reply.statusCode, reply.body).toBe(409)
    const said = (reply.json() as { error: string }).error
    expect(said).toContain('"foo" names two agents')
    expect(said).toContain(`Send the id ${newFoo}`)
    expect(row('foo').name).toBe('Legacy Foo')
    expect(row(newFoo).name).toBe('Name of foo')
  })
})

describe('the picture door finds a new agent by its handle', () => {
  it('puts the drawn picture back, keyed on the registry id', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/participants/agent/child-c/avatar',
      headers: AS_THE_PERSON,
      payload: { reset: true },
    })
    expect(reply.statusCode, reply.body).toBe(201)
    const held = t.client.sqlite.prepare('SELECT avatar_asset_id AS asset FROM agents WHERE id = ?').get(childC) as { asset: string }
    expect(held.asset).toContain(childC)
  })

  it('answers what is offered to the agent a handle names, and says it by registry id', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/avatars?for=agent:child-c', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    expect((reply.json() as { offeredFor: { kind: string; id: string } }).offeredFor).toEqual({ kind: 'agent', id: childC })
  })
})

describe('the retire rule', () => {
  it('lets the starter retire its agent when the starter sends its handle, and stores its registry id', async () => {
    const done = await retire(asAgent('starter-w'), 'child-a')
    expect(done.code, done.said).toBe(200)
    expect(row(childA).retired).toBe(1)
    expect(row(childA).retired_by_kind).toBe('agent')
    expect(row(childA).retired_by_id).toBe(starter)
  })

  it('lets the starter retire its agent when the starter sends its id', async () => {
    const done = await retire(asAgent(starter), childB)
    expect(done.code, done.said).toBe(200)
    expect(row(childB).retired).toBe(1)
    expect(row(childB).retired_by_id).toBe(starter)
  })

  it('refuses another agent, and names the starter by its handle', async () => {
    const done = await retire(asAgent('stranger'), 'child-c')
    expect(done.code, done.said).toBe(403)
    expect(row(childC).retired).toBe(0)
    expect(done.said).toContain('it was started by agent starter-w')
    expect(done.said).not.toContain(starter)
  })
})

describe('the chain of starters names a rung by its handle', () => {
  it('refuses a registration under an agent nobody recorded a starter for, naming it by its handle', async () => {
    insertLegacyAgent('Orphan1234ab', 'orphan', 'Orphan', null)
    const reply = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: asAgent('orphan'),
      payload: { handle: 'under-the-orphan', name: 'Under the orphan' },
    })
    expect(reply.statusCode, reply.body).toBe(403)
    const said = (reply.json() as { error: string }).error
    expect(said).toContain('Nobody recorded who started "orphan"')
    expect(said, 'the chain it would have joined names the rung by its handle').toContain('What it would have joined: agent "orphan"')
    expect(said).not.toContain('Orphan1234ab')
  })
})

describe('the registration card message', () => {
  it('is delivered to the new row\'s registry id, not to its handle', async () => {
    const id = await register(AS_THE_PERSON, 'carded')
    const to = t.client.sqlite
      .prepare("SELECT recipient_id AS id FROM message_delivery WHERE recipient_kind = 'agent' AND recipient_id IN (?, ?)")
      .all(id, 'carded') as { id: string }[]
    expect(to.length).toBeGreaterThan(0)
    expect(to.every((one) => one.id === id), JSON.stringify(to)).toBe(true)
  })
})

// ============================================================ round 2

/** Register an agent and hand back its registry id and the key the registration answered once. */
async function registerWithKey(
  headers: Record<string, string>,
  handle: string,
  role?: string,
): Promise<{ id: string; key: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers,
    payload: { handle, name: `Name of ${handle}`, ...(role === undefined ? {} : { role }) },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const said = reply.json() as { agent: { id: string }; whatToGiveIt: { key?: string } }
  expect(said.agent.id, 'the mint line is not in this tree').not.toBe(handle)
  expect(typeof said.whatToGiveIt.key, 'the registration answered no key').toBe('string')
  return { id: said.agent.id, key: said.whatToGiveIt.key as string }
}

async function profileOf(who: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/participants/agent/${who}/profile`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

describe('a sentence a person reads names an agent by its handle', () => {
  it('names the agent that chose a card by its handle, not by its minted id', async () => {
    const boss = await registerWithKey(AS_THE_PERSON, 'boss-sup', 'supervisor')
    await registerWithKey(asAgent('boss-sup'), 'boss-child', 'worker')
    const card = (await profileOf('boss-child'))['theCardTheyHold'] as {
      chosenBy: WhoChoseTheCard | null
      chosenByHandle: string | null
    }
    expect(card.chosenBy, 'the mark stores the registry id').toEqual({ how: 'a-starter', who: { kind: 'agent', id: boss.id } })
    expect(card.chosenByHandle).toBe('boss-sup')
    const sentence = whoChoseTheCardSays(card.chosenBy, card.chosenByHandle)
    expect(sentence).toBe('chosen by boss-sup, which registered this agent')
    expect(sentence).not.toContain(boss.id)
  })

  it('names the agent that retired a row by its handle, beside the id it stores', async () => {
    // child-a was retired above by starter-w, which sent its handle.
    const reply = await app.inject({ method: 'GET', url: `/api/participants/agent/${childA}`, headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    const held = (reply.json() as { participant: Record<string, unknown> }).participant
    expect(held['retiredBy']).toEqual({ kind: 'agent', id: starter })
    expect(held['retiredByHandle']).toBe('starter-w')
  })

  it('names the holder of the key by its handle when a restore contradicts itself', async () => {
    const holder = await registerWithKey(AS_THE_PERSON, 'key-holder')
    await registerWithKey(AS_THE_PERSON, 'key-other')
    // THE KEY GOES WITHOUT AN ACTOR HEADER. An agent's key beside the person's header is refused before any door runs,
    // by a decision and message F4KyroEu2Pp3. So these two requests send only the project and
    // the key, which makes the caller the key's holder.
    const keyOnly = { 'x-mole-office-workspace': 'default', 'x-mole-office-key': holder.key }
    const reply = await app.inject({
      method: 'GET',
      url: '/api/restore/key-other',
      headers: keyOnly,
    })
    expect(reply.statusCode, reply.body).toBe(400)
    const said = (reply.json() as { error: string }).error
    expect(said).toContain('carries the key of "key-holder"')
    expect(said).toContain('or ask for "key-holder"')
    expect(said).not.toContain(holder.id)
    // AND WHAT IT SAYS TO ASK FOR WORKS: the holder's handle with its own key is answered.
    const asked = await app.inject({
      method: 'GET',
      url: '/api/restore/key-holder',
      headers: keyOnly,
    })
    expect(asked.statusCode, asked.body).toBe(200)
  })
})

describe('a waiting card ask by a new agent', () => {
  it('is found on its own page, though the ask stores its registry id', async () => {
    const asker = await registerWithKey(AS_THE_PERSON, 'asks-for-more')
    const asked = await app.inject({
      method: 'POST',
      url: '/api/roles/requests',
      headers: asAgent('asks-for-more'),
      payload: { asking: 'supervisor', because: 'This module needs more workers.' },
    })
    expect(asked.statusCode, asked.body).toBe(201)
    const request = (asked.json() as { request: string }).request
    const stored = await app.inject({ method: 'GET', url: `/api/records/${request}`, headers: AS_THE_PERSON })
    const data = (stored.json() as { record: { data: { asker: { id: string }; answersTo: { kind: string } } } }).record.data
    expect(data.asker.id, 'the ask stores the registry id').toBe(asker.id)
    expect(data.answersTo.kind, 'an agent the person started asks the person').toBe('person')
    const cardAsk = (await profileOf('asks-for-more'))['cardAsk'] as { requestId: string; handle: string } | null
    expect(cardAsk, 'the waiting ask is missing from the agent page').not.toBeNull()
    expect(cardAsk?.requestId).toBe(request)
    expect(cardAsk?.handle).toBe('asks-for-more')
  })
})

describe('the citizen\'s page draws both handles', () => {
  /** The profile page's own half, drawn with what the server actually said, as the card page test does. */
  async function drawnProfile(who: string): Promise<string> {
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
    const pp = await import('../src/web/pages/ProfilePage.tsx')
    const said = await profileOf(who)
    // Plan 7FEOshq3mBGG keeps stored handles and chooser provenance in developer mode.
    const mode = await import('../src/web/lib/mode.ts')
    mode.setMode('inspect')
    try {
      return renderToStaticMarkup(
        h(pp.TheProfile, { said, onChanged: () => {} } as unknown as Parameters<typeof pp.TheProfile>[0]),
      )
    } finally { mode.setMode('normal') }
  }

  it('draws the same two handles on the Embassy rows', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/office/embassy', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    const said = reply.json() as WhatTheEmbassySays
    const retired = said.rows.find((one) => one.who.id === childA)
    expect(retired?.retired?.by).toEqual({ kind: 'agent', id: starter })
    expect(retired?.retired?.byHandle).toBe('starter-w')
    const chosenFor = (t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'boss-child'").get() as { id: string }).id
    const chosen = said.rows.find((one) => one.who.id === chosenFor)
    expect(chosen?.cardChosenByHandle).toBe('boss-sup')
    const ep = await import('../src/web/pages/EmbassyPage.tsx')
    const page = renderToStaticMarkup(h(ep.TheEmbassy, { said }))
    // THE CARD-CHOSEN WORD IS ON A LIVE ROW, so a static drawing reaches it. A retired row is drawn
    // only after a press, so its retirer is checked in a browser, in
    // tests/the-embassy-draws-the-retirer-by-its-handle.test.ts.
    expect(page).toContain('<span class="emb-value">boss-sup</span>')
  })

  it('draws who chose the card and who retired the row by their handles', async () => {
    const card = await drawnProfile('boss-child')
    expect(card).toContain('chosen by boss-sup, which registered this agent')
    const retired = await drawnProfile(childA)
    expect(retired).toContain(`${PROFILE_WORDS.retiredBy}</span> starter-w</p>`)
    expect(retired).not.toContain(`${PROFILE_WORDS.retiredBy}</span> ${starter}`)
  })
})
