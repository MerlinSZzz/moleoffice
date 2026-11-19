// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST NO LISTENER CARRIED IS THE OFFICE ITSELF, AND THE KEY RULE DOES NOT REACH IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P83 point 1, and the secretary's ruling of 13 September 2026 (report Shs0dwOcmIkm, "The
 * window's reach"): *point 1's key rule is about a request a listener carried; a request no listener
 * carried — an in-process call, a migration, a script inside the server process — is the office
 * itself.* `arrivalOf` returns undefined for such a request, and undefined is the honest third
 * answer, never "this machine".
 *
 * THIS IS THE HALF THAT KEEPS THE WHOLE SUITE RUNNING. An injected request is how four hundred test
 * files reach the product. A rule that read "no key means refuse" would have refused every one of
 * them, and a change that makes those go red in the hundreds is the rule being wrong, not the tests.
 *
 * THE CLAIM IS NOT "NOTHING CHANGED FOR EVERY CALLER". It is narrower and it is the true one: a
 * request on no socket is answered exactly as it was before, whether it sent the person's headers or
 * a key nobody issued. The listeners are where the key rule bites, and the other two files drive
 * those.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTheFirstOfficeInAHook, apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

const THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
})

afterAll(() => {
  t.close()
})

function decisionTitles(): string[] {
  return t.api
    .listRecords({ workspaceId: 'default', kind: 'decision' })
    .map((r: { title: string }) => r.title)
}

describe('a request no listener carried', () => {
  it('has no arrival at all, which is the fact the rule turns on', async () => {
    const { arrivalOf, actorFrom } = await import('../src/server/lib/http.ts')
    // A request on no socket: the shape every `app.inject` in this suite has.
    const bare = { headers: {}, raw: {} } as unknown as Parameters<typeof arrivalOf>[0]
    expect(arrivalOf(bare)).toBeUndefined()
    const actor = actorFrom({
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
      raw: {},
    } as unknown as Parameters<typeof actorFrom>[0])
    expect(actor.from).toBeUndefined()
    expect(actor.provedBy).toBeUndefined()
  })

  it('is answered exactly as before when it sends the person’s headers and no key', async () => {
    const built = await apiApp()
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: THE_PERSON,
      payload: {
        kind: 'decision',
        title: 'A decision from a caller on no socket at all',
        data: { replaces: [], because: 'no listener saw this, so there is nothing to place' },
      },
    })
    expect(res.statusCode, res.body).toBe(201)
    expect(decisionTitles()).toContain('A decision from a caller on no socket at all')
    await built.app.close()
  })

  it('is answered exactly as before when it carries a key this office never issued', async () => {
    const built = await apiApp()
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...THE_PERSON, 'x-mole-office-key': 'a-made-up-value-that-is-not-a-key' },
      payload: {
        kind: 'decision',
        title: 'A decision with a made-up key on no socket',
        data: { replaces: [], because: 'an in-process caller is the office itself' },
      },
    })
    expect(res.statusCode, res.body).toBe(201)
    expect(decisionTitles()).toContain('A decision with a made-up key on no socket')
    await built.app.close()
  })
})
