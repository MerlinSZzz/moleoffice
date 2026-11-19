// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A KEY IS REVOKED FROM THE EMBASSY'S CITIZENS, AND REVOKING IT DOES NOTHING ELSE.
 *
 * Criterion D3, P83 point 4's last word — *revocable from the Embassy*. The press was first drawn on
 * the Embassy's citizen row. Question 15 of report n9Mjk3c_sJRu, answered by a decision,
 * moved it to the citizen's own page, the one the row opens (src/web/components/RevokeTheirKey.tsx),
 * so this file now holds that the row draws none, the door the press uses, and the two things
 * revoking must NOT do — retire the agent and delete the credential.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PRESS IS BOUND TO
 * ---------------------------------------------------------------------------------------
 *
 * The server reads EVERY live `held_keys` row for a row's holder into `EmbassyRow.heldKeys` (a
 * device's under `person-device`, an agent's under `agent`; problem yZ71bheXm-Ji). A press is drawn
 * for each, because a control that would do nothing is not a control. It names its key by its
 * `held_keys` id, which is not a secret; the value never travels anywhere.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make the revoke door write nothing (`revokeTheKeyNamed` a no-op) → the revoked-state case, the
 *     embassy-heldKeys case and the "no longer the person" case all go red;
 *   draw the revoke press on the Embassy row again → the drawn-press case goes red;
 *   retire the agent in the revoke door → the not-retired case goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { EmbassyRow, WhatTheEmbassySays } from '../src/shared/worlds.ts'

type EmbassyModule = typeof import('../src/web/pages/EmbassyPage.tsx')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'not-the-person',
}

let t: TestDb
let app: FastifyInstance
let ep: EmbassyModule

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  ep = await import('../src/web/pages/EmbassyPage.tsx')
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** The Embassy's own half, drawn with what the server actually said. */
function drawn(said: WhatTheEmbassySays): string {
  return renderToStaticMarkup(h(ep.TheEmbassy, { said }))
}

async function theEmbassy(): Promise<WhatTheEmbassySays> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/embassy', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheEmbassySays
}

describe('a live key is revoked by its door, and the Embassy row leaves the press to the citizen page', () => {
  it('draws no press on the row, revokes the key, and leaves the agent and the credential alone', async () => {
    // AN AGENT'S CREDENTIAL, confirmed, then given its key by the one-off pass — the shape piece 3
    // will make ordinary. The key row is what the press is about.
    const asked = await app.inject({
      method: 'POST',
      url: '/api/office/visitors',
      headers: AS_AN_AGENT,
      payload: {
        handle: 'a-key-holder',
        name: 'A Key Holder',
        role: 'worker',
        conversationPath: '/logs/a-key-holder.jsonl',
        startDirectory: '/work/a-key-holder',
      },
    })
    expect(asked.statusCode, asked.body).toBe(201)
    const askedBody = asked.json() as { credential: { id: string } }
    const credentialId = askedBody.credential.id
    await app.inject({
      method: 'POST',
      url: `/api/office/visitors/${credentialId}/confirm`,
      headers: AS_THE_PERSON,
      payload: {},
    })
    const { giveAlreadyConfirmedCredentialsTheirKeysOnce } = await import('../src/server/lib/visitors.ts')
    giveAlreadyConfirmedCredentialsTheirKeysOnce()

    const before = await theEmbassy()
    // EMBASSY ROWS ARE KEYED BY THE REGISTRY ID, which since the mint is not the handle.
    const holderId = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('a-key-holder') as { id: string }).id
    const row = before.rows.find((one) => one.who.id === holderId) as EmbassyRow
    expect(row, 'the agent has a row').toBeTruthy()
    expect(row.heldKeys.map((one) => one.is), 'it holds one key, its own').toEqual(['its-own'])
    const keyId = row.heldKeys[0]!.id
    expect(row.retired, 'and is not retired').toBeNull()
    // THE PRESS IS NOT ON THE EMBASSY ROW: it is on the citizen's own page, which the browser test
    // tests/the-embassy-lets-a-visitor-in-and-sends-its-key-to-the-citizens-page.test.ts
    // presses. This follows question 15 of report n9Mjk3c_sJRu and a decision.
    expect(drawn(before), 'no press on the Embassy row, though the key is there').not.toContain(ep.EMBASSY_WORDS.revokeKey)

    // AN AGENT MAY NOT PRESS IT. It is the person's, like the other two presses on this page.
    const byAnAgent = await app.inject({
      method: 'POST',
      url: `/api/office/held-keys/${keyId}/revoke`,
      headers: AS_AN_AGENT,
      payload: {},
    })
    expect(byAnAgent.statusCode, byAnAgent.body).toBe(403)

    const revoked = await app.inject({
      method: 'POST',
      url: `/api/office/held-keys/${keyId}/revoke`,
      headers: AS_THE_PERSON,
      payload: { because: 'the test took the key back' },
    })
    expect(revoked.statusCode, revoked.body).toBe(200)

    const stored = t.client.sqlite
      .prepare('SELECT revoked_at, revoked_because FROM held_keys WHERE id = ?')
      .get(keyId) as { revoked_at: string | null; revoked_because: string | null }
    expect(stored.revoked_at, 'the key is marked revoked').not.toBeNull()
    expect(stored.revoked_because).toBe('the test took the key back')

    const after = await theEmbassy()
    const theRow = after.rows.find((one) => one.who.id === holderId) as EmbassyRow
    expect(theRow.heldKeys, 'no live key is left to revoke').toEqual([])
    expect(theRow.retired, 'revoking a key does not retire the agent').toBeNull()
    expect(drawn(after), 'and the press is gone with the key').not.toContain(ep.EMBASSY_WORDS.revokeKey)

    // THE CREDENTIAL IS NOT DELETED. It still stands confirmed and still names the same agent.
    const credential = await app.inject({
      method: 'GET',
      url: `/api/office/visitors/${credentialId}`,
      headers: AS_THE_PERSON,
    })
    expect(credential.statusCode).toBe(200)
    expect((credential.json() as { credential: { standing: string } }).credential.standing).toBe('trusted')

    // AND REVOKING IT AGAIN FINDS NOTHING LIVE, so a second press cannot mark a second key.
    const again = await app.inject({
      method: 'POST',
      url: `/api/office/held-keys/${keyId}/revoke`,
      headers: AS_THE_PERSON,
      payload: {},
    })
    expect(again.statusCode).toBe(404)
  })

  it('draws no press on a row that holds no key', async () => {
    const said = await theEmbassy()
    const withoutKeys: WhatTheEmbassySays = {
      ...said,
      rows: said.rows.map((one) => ({ ...one, heldKeys: [] })),
    }
    const page = drawn(withoutKeys)
    expect(page).not.toContain(ep.EMBASSY_WORDS.revokeKey)
  })
})
