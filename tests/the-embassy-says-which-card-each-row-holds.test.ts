// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY SAYS WHICH ROLE CARD EACH ROW HOLDS — CRITERION P53.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET
 * ---------------------------------------------------------------------------------------
 *
 * On 6 September 2026 an agent looked as if it was not the secretary yet.
 *
 * That agent was given the secretary card at 18:40 that day and the registry read it. The Embassy, which
 * is the one page that answers who the office knows, drew the PICTURE off that card and never the
 * word — so the page could not answer the question the owner was asking. Measured on a copy of the owner's corpus
 * on 6 September: that agent's row read `agent  group Special`, and the word `secretary` was nowhere on
 * the page.
 *
 * ---------------------------------------------------------------------------------------
 * AND A CARD NOBODY WROTE IS NEVER DRAWN AS ONE SOMEBODY CHOSE
 * ---------------------------------------------------------------------------------------
 *
 * `role` on an embassy row is never null for a registered row: a row with no card is READ AS the
 * worker card, or the administrator card for a person, which is what every refusal in the product
 * already does. Drawing that word here would tell a reader somebody had chosen it. So the row
 * carries `choseRole` beside it — the same device `chosePortrait` already is — and the screen says
 * `no role set` where nobody wrote one.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop the card lines from the row in EmbassyPage.tsx → both drawing cases go red.
 *   make `choseRole` always true in src/server/api/office.ts → the no-card case goes red: a word
 *     nobody chose is drawn as though somebody had.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { WhatTheEmbassySays } from '../src/shared/worlds.ts'
import { EMBASSY_WORDS } from '../src/web/pages/EmbassyPage.tsx'

type EmbassyModule = typeof import('../src/web/pages/EmbassyPage.tsx')

let t: TestDb
let app: FastifyInstance
let ep: EmbassyModule
/** The registry ids the two agents below were given. An embassy row names an agent by that id, not its handle. */
let argusId = ''
let olderId = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function theEmbassy(): Promise<WhatTheEmbassySays> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/embassy', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheEmbassySays
}

/** The page's own half, drawn with what the server actually said, with everybody shown. */
function drawn(said: WhatTheEmbassySays): string {
  return renderToStaticMarkup(h(ep.TheEmbassy, { said }))
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
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
  ep = (await import('../src/web/pages/EmbassyPage.tsx')) as EmbassyModule

  // THE SECRETARY, given the card the way the owner gave the office's own secretary one: at registration, by the person.
  const one = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' },
  })
  expect(one.statusCode, one.body).toBe(201)
  argusId = (one.json() as { agent: { id: string } }).agent.id
  // AND A ROW WITH NO CARD ON IT AT ALL, which is how every agent registered before 6 September
  // 2026 stands. It is read as the worker card everywhere, and nobody chose that word.
  const older = t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'An older agent',
    data: { handle: 'older-agent', runtime: 'claude-code', state: 'active' },
    actor: { type: 'human', id: THE_PERSON },
  })
  olderId = (t.client.sqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(older.id) as { id: string }).id
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a row on the Embassy', () => {
  it('says which card it holds, so the secretary is visible as one', async () => {
    const said = await theEmbassy()
    const secretary = said.rows.find((row) => row.who.id === argusId)
    expect(secretary, `${THE_TEST_OFFICES_SECRETARY.handle} has no row on the embassy`).toBeDefined()
    expect(secretary?.role).toBe('secretary')
    expect(secretary?.choseRole).toBe(true)
    // THE WORD ITSELF, AS AN ELEMENT'S WHOLE TEXT. `secretary` is already in the markup inside the
    // portrait's alt text, so a plain substring check would pass with the card line deleted.
    expect(drawn(said)).toContain(`>${EMBASSY_WORDS.card}</span><span class="emb-value">secretary<`)
  })

  it('draws the short mark where nobody chose a role, keeping the stored reading separate', async () => {
    const said = await theEmbassy()
    const older = said.rows.find((row) => row.who.id === olderId)
    expect(older, 'the older agent has no row on the embassy').toBeDefined()
    // The READING still answers `worker`, because that is what every refusal reads it as.
    expect(older?.role).toBe('worker')
    // What the SCREEN says about it is a different thing, and this is the difference.
    expect(older?.choseRole).toBe(false)
    expect(drawn(said)).toContain(`>${EMBASSY_WORDS.card}</span><span class="emb-value"><span class="px-absent">—</span>`)
  })

  it('says nothing about a card for somebody no registry here holds', async () => {
    // A visitor's card is their own world's answer, so this one has none and the row draws none.
    const said = await theEmbassy()
    for (const row of said.rows) {
      if (row.registered) continue
      expect(row.role, 'a row for a stranger claims a card this office cannot know').toBeNull()
      expect(row.choseRole).toBe(false)
    }
  })
})
