// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RETIRE PRESS IS DRAWN FOR WHOEVER MAY PRESS IT, FROM THE REPLY. Criterion P82.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PAGE DECIDED BEFORE THIS
 * ---------------------------------------------------------------------------------------
 *
 * It drew the press for everybody. Measured 8 September 2026 on a fresh database: a reader acting as
 * a secretary, on a worker's page it had not started, was offered the press — and the door refused
 * it 403. The reply carried nothing at all about who may retire.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ANSWER COMES ON THE REPLY AND IS NOT WORKED OUT IN THE BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The rank rule reads the power tree in design/permissions/roles.json and the row's own starter. A
 * page that worked it out would be a second copy of a permission rule with nothing keeping the two
 * in step — the ninth invariant broken in the worst place for it. The critic said so before it was
 * built (note IyKUXwTqwOTq, objection 4): *the rule must be computed once on the server and sent on
 * the profile reply as "may you retire this row, and if not, why not".*
 *
 * That is also what src/shared/authority.ts already says about an act kept to one machine: a control
 * is not drawn rather than drawn and then refused.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · the profile reply carries may-retire and why-not, and the two agree with the door;
 *   · the page draws the press where the reply says the reader may;
 *   · where it says they may not, the page draws that it is not theirs to retire and NO press, and the door's own
 *     sentence in developer mode;
 *   · a person's page carries no answer at all, because nobody retires a person;
 *   · a row already retired says who closed it and why, and offers no press.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   draw it for everybody: in src/web/pages/ProfilePage.tsx ignore `said.mayRetire.may` and always
 *     render the form → the refusal case goes red.
 *   drop `mayRetire` from `theProfile` (src/server/api/participants.ts) → every case goes red.
 *   drop `retiredBy` from `RetiredNotice` → the last case goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PROFILE_WORDS } from '../src/shared/profile.ts'
import { t as word } from '../src/shared/i18n.ts'

/** The retire press itself, as `Btn` draws it, and not the panel's heading of the same words. */
const THE_PRESS = `>${PROFILE_WORDS.retire}</button>`

type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')

let t: TestDb
let app: FastifyInstance
let pp: ProfileModule

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

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** One profile, as the given caller is answered it. */
async function profile(headers: Record<string, string>, kind: string, id: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/participants/${kind}/${id}/profile`, headers })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

/** That reply, drawn. The page is a pure function of it, which is the half a test can hold still. */
function drawn(said: Record<string, unknown>): string {
  return renderToStaticMarkup(
    h(pp.TheProfile, { said, onChanged: () => {} } as unknown as Parameters<ProfileModule['TheProfile']>[0]),
  )
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'sup-one', name: 'Supervisor One', role: 'supervisor' })
  await register(AS_THE_PERSON, { handle: 'work-one', name: 'Worker One', role: 'worker' })
  await register(AS_THE_PERSON, { handle: 'work-two', name: 'Worker Two', role: 'worker' })

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
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. the reply

describe('the profile reply', () => {
  it('says the person may retire anybody', async () => {
    const said = await profile(AS_THE_PERSON, 'agent', 'work-one')
    expect(said['mayRetire']).toEqual({ may: true, whyNot: null })
  })

  it('says a secretary may retire a worker’s row, by rank', async () => {
    const said = await profile(asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'agent', 'work-one')
    expect((said['mayRetire'] as Record<string, unknown>)['may']).toBe(true)
  })

  it('says a worker may not retire a supervisor’s row, and why not', async () => {
    const said = await profile(asAgent('work-one'), 'agent', 'sup-one')
    const may = said['mayRetire'] as { may: boolean; whyNot: string }
    expect(may.may).toBe(false)
    expect(may.whyNot, 'the door’s own sentence').toContain('below its own rung')
  })

  it('agrees with the door it came from', async () => {
    const said = await profile(asAgent('work-one'), 'agent', 'sup-one')
    const may = said['mayRetire'] as { may: boolean; whyNot: string }
    const door = await app.inject({
      method: 'POST',
      url: '/api/participants/agent/sup-one/retire',
      headers: asAgent('work-one'),
      payload: { because: 'measuring' },
    })
    expect(door.statusCode).toBe(403)
    // THE DOOR'S SENTENCE IS THE REPLY'S, PLUS THE LINE ABOUT NOTHING BEING WRITTEN. The page draws
    // the reason beside a press that is not there, where nobody has tried to write anything.
    expect(JSON.parse(door.body)['error'], 'one rule, one sentence').toBe(`${String(may.whyNot)} Nothing was written.`)
  })

  it('carries no answer on a person, because nobody retires a person', async () => {
    const said = await profile(AS_THE_PERSON, 'person', THE_PERSON)
    expect(said['mayRetire']).toBeNull()
  })
})

// ============================================================ 2. the page

describe('the page', () => {
  it('draws the press where the reply says the reader may', async () => {
    const page = drawn(await profile(asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'agent', 'work-one'))
    expect(page, 'the press').toContain(THE_PRESS)
  })

  it('draws that it is not theirs to retire, and no press, where the reply says they may not', async () => {
    const said = await profile(asAgent('work-one'), 'agent', 'sup-one')
    const page = drawn(said)
    expect(page, 'the short state').toContain(word('g6b.profile.notYoursToRetire'))
    expect(page, 'and no press').not.toContain(THE_PRESS)
    expect(page, 'the door’s own sentence is for a developer').not.toContain('below its own rung')
    const mode = await import('../src/web/lib/mode.ts')
    mode.setMode('inspect')
    const inspected = drawn(said)
    mode.setMode('normal')
    expect(inspected, 'the door’s own sentence, in developer mode').toContain('below its own rung')
  })

  it('draws nothing about retiring on a person’s page', async () => {
    const page = drawn(await profile(AS_THE_PERSON, 'person', THE_PERSON))
    expect(page).not.toContain(PROFILE_WORDS.retire)
  })

  it('says who closed a retired row, and why, and offers no press', async () => {
    const closed = await app.inject({
      method: 'POST',
      url: '/api/participants/agent/work-two/retire',
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { because: 'its task is done' },
    })
    expect(closed.statusCode, closed.body).toBe(200)
    // Plan 7FEOshq3mBGG keeps the stored retirer's handle in developer mode.
    const mode = await import('../src/web/lib/mode.ts')
    mode.setMode('inspect')
    const page = drawn(await profile(AS_THE_PERSON, 'agent', 'work-two'))
    mode.setMode('normal')
    expect(page, 'that it is closed').toContain(PROFILE_WORDS.retired)
    expect(page, 'why').toContain('its task is done')
    expect(page, 'and whose hand').toContain(THE_TEST_OFFICES_SECRETARY.handle)
    expect(page, 'and nothing left to do to it').not.toContain(THE_PRESS)
  })
})
