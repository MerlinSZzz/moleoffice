// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON CHANGES THEIR OWN ROLE CARD FROM THEIR PROFILE — CRITERION P52.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * On the profile page a person could not change their own role card.
 *
 * The three doors had existed since the card work landed. `PATCH /api/participants/person/<id>`
 * takes `role`, `occupation` and `portrait`, and refuses anybody but the person themselves. Nothing
 * on any screen drew a control for one of them, so the only way to use their own card was a request
 * typed by hand. Problem `sPNcAuBd0reg`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, BOTH DIRECTIONS
 * ---------------------------------------------------------------------------------------
 *
 *   · the panel is drawn on a person's OWN page and on nobody else's, and not on an agent's;
 *   · it offers only the cards a person may hold, never a role an agent is registered as;
 *   · the three writes go through and the reading comes back holding them;
 *   · an agent asking for the same three is refused, and the record is exactly as it was. A suite
 *     proving only that the form works would pass with the door wide open.
 *
 * AND THE PICTURES A PERSON MAY CHOOSE FROM are the role's own and their own, read from two folders
 * by the route this criterion needed: `GET /api/portraits/<set>/<of>`.
 *
 * THE PANEL OPENS AS READING, like every page in this product. It draws the three values and one
 * press; the boxes appear when somebody asks for them. That is the rule
 * `tests/read-before-edit.test.ts` holds, and the editor beside this one on the same page — the name
 * and the picture on `YourAppearance` — has always worked that way.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop `{yours ? <YourCard …/> : null}` from ProfilePage.tsx → the two drawing cases go red.
 *   make `YourCard` read `cards` instead of `personCards` → the offered-cards case goes red.
 *   remove the `whyTheChangeIsRefused` call from `setThePersonsCard` → the refusal case goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')
type YourCardModule = typeof import('../src/web/components/YourCard.tsx')

let t: TestDb
let app: FastifyInstance
let pp: ProfileModule
let yc: YourCardModule

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-pa' }

async function profile(who: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/participants/person/${who}/profile`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

async function change(headers: Record<string, string>, body: unknown): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/participants/person/${THE_PERSON}`,
    headers,
    payload: body as Record<string, unknown>,
  })
  return { code: reply.statusCode, said: reply.body }
}

/** The profile page's own half, drawn with what the server actually said, as whoever is asking. */
function drawn(said: Record<string, unknown>): string {
  return renderToStaticMarkup(
    h(pp.TheProfile, { said, onChanged: () => {} } as unknown as Parameters<ProfileModule['TheProfile']>[0]),
  )
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
  // WHO THE PAGE THINKS IS READING. `getActor` reads this key, and the panel is drawn only for a
  // person looking at their own page — so the store says the person, which is what a browser at their
  // own machine holds.
  storage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: THE_PERSON }))
  pp = (await import('../src/web/pages/ProfilePage.tsx')) as ProfileModule
  yc = (await import('../src/web/components/YourCard.tsx')) as YourCardModule
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. where it is drawn

describe('the panel that changes your own card', () => {
  it('is on your own page', async () => {
    expect(drawn(await profile(THE_PERSON))).toContain(yc.YOUR_CARD_WORDS.title)
  })

  it('is not on somebody else’s page', async () => {
    const mine = await profile(THE_PERSON)
    const someoneElse = {
      ...mine,
      participant: { ...(mine['participant'] as Record<string, unknown>), id: 'somebody-else' },
    }
    expect(drawn(someoneElse)).not.toContain(yc.YOUR_CARD_WORDS.title)
  })

  it('is not on an agent’s page, which holds no person’s card at all', async () => {
    const mine = await profile(THE_PERSON)
    const anAgent = {
      ...mine,
      participant: { ...(mine['participant'] as Record<string, unknown>), kind: 'agent' },
    }
    expect(drawn(anAgent)).not.toContain(yc.YOUR_CARD_WORDS.title)
  })
})

// ============================================================ 2. the three writes

describe('a person’s own card', () => {
  it('takes which card they hold, what they do, and the picture, and reads them back', async () => {
    const roles = await app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
    const said = roles.json() as { personCards: { name: string }[] }
    const card = said.personCards[0]?.name
    expect(card, 'the declaration holds no person card').toBeTruthy()

    const done = await change(AS_THE_PERSON, {
      role: card,
      occupation: 'robotics engineer',
      portrait: '/api/portraits/role/administrator/administrator-2',
    })
    expect(done.code, done.said).toBe(200)

    const back = (await profile(THE_PERSON))['participant'] as Record<string, unknown>
    expect(back['role']).toBe(card)
    expect(back['occupation']).toBe('robotics engineer')
    expect(back['portrait']).toBe('/api/portraits/role/administrator/administrator-2')
    // The page draws the chosen picture's small copy; a press opens the whole picture (wave 13x round 11).
    expect(drawn(await profile(THE_PERSON))).toContain('class="yc-shown" src="/api/portraits/role/administrator/administrator-2?size=small"')
  })

  it('takes the picture back with an empty string, so the card’s own is drawn again', async () => {
    expect((await change(AS_THE_PERSON, { portrait: '' })).code).toBe(200)
    expect(((await profile(THE_PERSON))['participant'] as Record<string, unknown>)['portrait']).toBeNull()
  })

  it('is refused to an agent, and nothing is written', async () => {
    const before = (await profile(THE_PERSON))['participant'] as Record<string, unknown>
    const no = await change(AS_AN_AGENT, { occupation: 'somebody else’s idea of the person\'s job' })
    expect(no.code).toBe(403)
    const after = (await profile(THE_PERSON))['participant'] as Record<string, unknown>
    expect(after['occupation']).toBe(before['occupation'])
  })

  it('is refused a role from the agent list, because nothing reads across the two', async () => {
    const no = await change(AS_THE_PERSON, { role: 'worker' })
    expect(no.code).toBe(400)
    expect(no.said).toContain('administrator')
  })
})

// ============================================================ 3. the pictures it offers

describe('the pictures a person may put on their card', () => {
  it('are read from one folder at a time, by name', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/portraits/role/administrator', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    const said = reply.json() as { portraits: { address: string }[] }
    expect(said.portraits.length, 'no picture was painted for the administrator card').toBeGreaterThan(0)
    expect(said.portraits[0]?.address).toContain('/api/portraits/role/administrator/')
  })

  it('say nothing is there rather than failing, where a folder has no pictures in it', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/portraits/custom/nobody-at-all', headers: AS_THE_PERSON })
    expect(reply.statusCode).toBe(200)
    const said = reply.json() as { portraits: unknown[]; note: string }
    expect(said.portraits).toEqual([])
    expect(said.note).toContain('nobody has put a picture there')
  })

  it('refuse a set that is not one of the two', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/portraits/somewhere/else', headers: AS_THE_PERSON })
    expect(reply.statusCode).toBe(404)
    expect(reply.body).toContain('There are two')
  })
})
