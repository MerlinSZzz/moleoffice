// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON'S DEVICE CAN ASK TO COME IN, AND CONFIRMING IT ANSWERS A KEY BOUND TO THE PERSON.
 *
 * Criterion D2, the person's-device half of P83 point 4, which the secretary ruled must land with point 1
 * because their phone, their MacBook and the browser on their other computer hold no key and the window is the only thing
 * keeping them working. The owner's decision chose A's shape: every way in but loopback goes
 * through the credential flow that exists, and a confirmed credential for a person's device receives
 * its own key bound to the person, revocable from the Embassy.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A DEVICE IS STORED AS, AND WHY NO COLUMN WAS ADDED
 * ---------------------------------------------------------------------------------------
 *
 * `visitor_credentials` has three NOT NULL text columns an agent fills with a handle, a name and a
 * role card, and a browser has none of the three. So the ask stores the device's own name in
 * `handle` and `name`, and the empty word `A_DEVICE_ASKS_FOR_NO_CARD` in `role`. That empty role is
 * the whole marker: `isAPersonsDeviceCredential` reads it, the confirm does not apply P86's card
 * ceiling to a device because the ceiling is about a CARD, and the agent ask cannot reach the shape
 * because it is refused without a card. `held_keys` then carries the kind `person-device` — which
 * `keys.ts` already reads as the person — and the device's name as `whose_id`, so one device can be
 * revoked without touching the owner's others. Adding a column would be a second migration and a decision
 * above this worker, and it is not needed.
 *
 * ---------------------------------------------------------------------------------------
 * THE KEY IS THE TOKEN THE DEVICE ALREADY HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * The device is shown a token once when it asks. The confirm registers that token's SHA-256 in
 * `held_keys` through keys.ts, so the device already holds its key and no second secret has to
 * travel to a device that is not in the room when the owner presses Confirm. The office never sees
 * or prints the value. THE CONFIRM ANSWERS WHICH KEY IT BOUND, ONCE: a second confirm binds nothing
 * and answers null.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   stop registering the token in `held_keys` at confirm → the key case and the person-door case go
 *     red, and the one-off pass case still passes because it registers its own;
 *   let the device ask take the agent path (a worker role) → the no-card case goes red;
 *   make the revoke door write nothing → the revoked-key case goes red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** A device is not the person and does not claim to be; the key is what makes it the person. */
const AS_AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-device-that-is-not-the-person',
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

interface Asked {
  statusCode: number
  body: Record<string, unknown>
}

async function askForADevice(device: string): Promise<Asked> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/office/visitors',
    headers: AS_AN_AGENT,
    payload: { device },
  })
  return { statusCode: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

async function confirm(id: string): Promise<Asked> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/office/visitors/${id}/confirm`,
    headers: AS_THE_PERSON,
    payload: {},
  })
  return { statusCode: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** The live `held_keys` rows for one owner, read straight from the throwaway database. */
function keysFor(whoseKind: string, whoseId: string): { id: string; revoked_at: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT id, revoked_at FROM held_keys WHERE whose_kind = ? AND whose_id = ?')
    .all(whoseKind, whoseId) as { id: string; revoked_at: string | null }[]
}

describe('a person’s device asks to come in', () => {
  it('makes a pending credential that asks for no card, under the device’s own name', async () => {
    const asked = await askForADevice(`${THE_TEST_OFFICES_OWNER.id}-testbook`)
    expect(asked.statusCode, JSON.stringify(asked.body)).toBe(201)
    const credential = asked.body['credential'] as Record<string, unknown>
    expect(credential['standing']).toBe('pending')
    expect(credential['role']).toBe('')
    expect(credential['handle']).toBe(`${THE_TEST_OFFICES_OWNER.id}-testbook`)
    expect(credential['name']).toBe(`${THE_TEST_OFFICES_OWNER.id}-testbook`)
    expect(asked.body['confirmationAsked']).toBe(true)
    expect(String(asked.body['token'])).not.toBe('')
  })

  it('refuses a request that names a device and an agent’s fields at once', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/office/visitors',
      headers: AS_AN_AGENT,
      payload: { device: `${THE_TEST_OFFICES_OWNER.id}-testbook`, role: 'worker' },
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.json<{ error: string }>().error).toMatch(/device/)
  })
})

describe('confirming a device answers a key once and never again', () => {
  it('binds the token as a person-device key on the first confirm and answers no second', async () => {
    const asked = await askForADevice(`${THE_TEST_OFFICES_OWNER.id}-macbook`)
    const credential = asked.body['credential'] as Record<string, unknown>
    const id = String(credential['id'])

    const first = await confirm(id)
    expect(first.statusCode, JSON.stringify(first.body)).toBe(200)
    const deviceKey = first.body['deviceKey'] as { id: string; says: string } | null
    expect(deviceKey, 'the first confirm answers which key it bound').not.toBeNull()
    expect(deviceKey?.id).toBeTruthy()
    expect(deviceKey?.says).toMatch(/key/i)

    const afterFirst = keysFor('person-device', `${THE_TEST_OFFICES_OWNER.id}-macbook`)
    expect(afterFirst.length).toBe(1)
    expect(afterFirst[0]?.revoked_at).toBeNull()

    const second = await confirm(id)
    expect(second.statusCode).toBe(200)
    expect(second.body['deviceKey'] ?? null).toBeNull()
    expect(keysFor('person-device', `${THE_TEST_OFFICES_OWNER.id}-macbook`).length, 'no second key').toBe(1)
  })
})

describe('a request carrying the device’s key is the person', () => {
  it('is allowed the person’s press from an agent’s own claim, and refused without the key', async () => {
    const asked = await askForADevice(`${THE_TEST_OFFICES_OWNER.id}-phone`)
    const token = String(asked.body['token'])
    const id = String((asked.body['credential'] as Record<string, unknown>)['id'])
    expect((await confirm(id)).statusCode).toBe(200)

    // THE KEY IS THE WHOLE PROOF. The actor header says `agent` and names something that is not the
    // person, so only the key can make this request theirs.
    const withKey = await app.inject({
      method: 'POST',
      url: '/api/office/trusted-machines',
      headers: { ...AS_AN_AGENT, 'x-mole-office-key': token },
      payload: { address: '198.51.100.9', note: 'trusted by the device key in this test' },
    })
    expect(withKey.statusCode, withKey.body).toBe(200)

    const withoutKey = await app.inject({
      method: 'POST',
      url: '/api/office/trusted-machines',
      headers: AS_AN_AGENT,
      payload: { address: '198.51.100.7' },
    })
    expect(withoutKey.statusCode, 'an agent’s claim is not the person').toBe(403)
  })

  it('is nobody once the key is revoked', async () => {
    const asked = await askForADevice(`${THE_TEST_OFFICES_OWNER.id}-old-tablet`)
    const token = String(asked.body['token'])
    const id = String((asked.body['credential'] as Record<string, unknown>)['id'])
    const first = await confirm(id)
    const keyId = String((first.body['deviceKey'] as { id: string }).id)

    // Revoking is its own press (criterion D3), and it is the person's; the device key itself is
    // what proves the person here, which is the live key being taken away.
    const revoked = await app.inject({
      method: 'POST',
      url: `/api/office/held-keys/${keyId}/revoke`,
      headers: { ...AS_AN_AGENT, 'x-mole-office-key': token },
      payload: { because: 'the test revoked it' },
    })
    expect(revoked.statusCode, revoked.body).toBe(200)

    const after = await app.inject({
      method: 'POST',
      url: '/api/office/trusted-machines',
      headers: { ...AS_AN_AGENT, 'x-mole-office-key': token },
      payload: { address: '198.51.100.8' },
    })
    expect(after.statusCode, 'a revoked key proves nothing').toBe(403)
  })
})

describe('a credential already confirmed when this lands receives its key without a second confirmation', () => {
  it('registers the token it already holds, once, and stops', async () => {
    const { issueACredential, giveAlreadyConfirmedCredentialsTheirKeysOnce } = await import(
      '../src/server/lib/visitors.ts'
    )
    // A device confirmed before the confirm door learned to bind a key: trusted in the store, no
    // row in held_keys. This is the shape the one-off pass exists for.
    const issued = issueACredential({
      handle: 'an-old-device',
      name: 'an-old-device',
      role: '',
      world: null,
      machine: null,
      machineHow: 'nobody could tell',
      facts: { conversationPath: null, startDirectory: null, runtime: null, sessionRecord: null },
    })
    t.client.sqlite
      .prepare("UPDATE visitor_credentials SET standing = 'trusted' WHERE id = ?")
      .run(issued.credential.id)
    expect(keysFor('person-device', 'an-old-device')).toEqual([])

    const given = giveAlreadyConfirmedCredentialsTheirKeysOnce()
    expect(given).toContainEqual({ whoseKind: 'person-device', whoseId: 'an-old-device' })
    expect(keysFor('person-device', 'an-old-device').length).toBe(1)

    // AND THE TOKEN IT ALREADY HELD IS NOW ITS KEY. No second secret travelled anywhere.
    const asThePerson = await app.inject({
      method: 'POST',
      url: '/api/office/trusted-machines',
      headers: { ...AS_AN_AGENT, 'x-mole-office-key': issued.token },
      payload: { address: '198.51.100.6' },
    })
    expect(asThePerson.statusCode, asThePerson.body).toBe(200)

    // A SECOND START REGISTERS NOTHING. The row of any standing is what stops it.
    expect(giveAlreadyConfirmedCredentialsTheirKeysOnce()).toEqual([])
  })
})
