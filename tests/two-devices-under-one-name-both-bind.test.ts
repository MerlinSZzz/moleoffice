// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO CREDENTIALS UNDER ONE DEVICE NAME, BOTH CONFIRMED, AND THE SECOND TOKEN IS THE PERSON.
 *
 * Problem _vd-_MXlswH5 and criterion D2, P83 point 4. The confirm bound a device's key by the
 * device's NAME: `aKeyWasEverHeldBy('person-device', credential.handle)` asked whether ANY key of
 * that name existed, so a second credential under a name that already held a key bound nothing — and
 * the press still answered the sentence saying *the key for this device is now bound*, about the
 * FIRST device's key. That is a fake success in a sentence the office stores and draws, and the
 * self-naming the amendment adds makes two credentials under one name ordinary: a browser that
 * changed its user agent, or two browsers on one machine, give themselves the same browser-and-system
 * name and a different tail only when their storage differs.
 *
 * `held_keys` has no credential column and this piece adds none (no migration). The mend is to ask
 * about THIS credential's TOKEN rather than the name: the confirm binds unless a key is already held
 * with this token's hash, and answers `deviceKey` from the row whose hash is this token's. This test
 * is the one that goes red on the old by-name bind.
 *
 * ---------------------------------------------------------------------------------------
 * WHY REAL LISTENERS
 * ---------------------------------------------------------------------------------------
 *
 * The confirm is `reach: 'local'`, so the listener's stamp decides whether it may be reached at all,
 * and the person-only act is driven from the second listener so the one-version window cannot stand
 * in for the key. This is the same shape tests/ending-a-credential-kills-its-key.test.ts uses.
 *
 * THE TOKENS ARE NEVER PRINTED. They are carried into the x-mole-office-key header and no assertion
 * quotes a value.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The person's headers, and no key: the confirm is the owner's press on this machine. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** A device's own token is what makes a request the owner's, so the actor header says `agent`. */
const AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-device-that-is-not-the-person',
}

/** The one name both credentials ask under. */
const ONE_NAME = 'Chrome on Windows 1a2b'

let t: TestDb
let app: FastifyInstance
let thisMachine: string
let anotherMachine: string
let otherMachines: Server

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  // A SECOND LISTENER FOR THE PERSON-ONLY ACT, so the loopback half of the one-version window cannot
  // answer it and the key is the only thing that can.
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`
})

afterAll(async () => {
  await new Promise<void>((done) => {
    otherMachines.close(() => {
      done()
    })
  })
  await app.close()
  t.close()
})

/** One device asks under the same name, through the credential flow's own ask door. */
async function askForADevice(): Promise<{ token: string; id: string }> {
  const res = await fetch(`${thisMachine}/api/office/visitors`, {
    method: 'POST',
    headers: THE_PERSON,
    body: JSON.stringify({ device: ONE_NAME }),
  })
  const body = (await res.json()) as { token?: string; credential?: { id?: string }; error?: string }
  expect(res.status, body.error ?? '').toBe(201)
  return { token: String(body.token), id: String(body.credential?.id) }
}

/** The owner's confirm, on the machine the office runs on. */
async function confirm(id: string): Promise<{ status: number; deviceKey: { id: string } | null }> {
  const res = await fetch(`${thisMachine}/api/office/visitors/${id}/confirm`, {
    method: 'POST',
    headers: THE_PERSON,
    body: '{}',
  })
  const body = (await res.json()) as { deviceKey?: { id: string } | null; error?: string }
  expect(res.status, body.error ?? '').toBe(200)
  return { status: res.status, deviceKey: body.deviceKey ?? null }
}

/** A person-only act with one device's token, from the untrusted second listener. */
async function isThisDeviceThePerson(token: string): Promise<number> {
  const res = await fetch(`${anotherMachine}/api/office/scene-settings`, {
    method: 'PATCH',
    headers: { ...AN_AGENT, 'x-mole-office-key': token },
    body: JSON.stringify({ motion: true }),
  })
  return res.status
}

describe('a second credential under one device name binds its own key', () => {
  it('makes the second device’s token the person, and answers the key it bound for that token', async () => {
    // THE WINDOW MUST NOT COVER THE ACT, or a keyless claim would be answered anyway and this test
    // would pass for a reason that has nothing to do with the second token.
    const { thisOfficeTrusts } = await import('../src/server/lib/trustedmachines.ts')
    expect(thisOfficeTrusts('127.0.0.1'), 'the second listener is trusted, so the window would answer').toBe(false)

    const first = await askForADevice()
    const second = await askForADevice()
    expect(first.token).not.toBe(second.token)

    const firstConfirm = await confirm(first.id)
    expect(firstConfirm.deviceKey, 'the first confirm named no key').not.toBeNull()

    // THE SECOND CONFIRM. On the by-name bind this bound nothing and `deviceKey` named the FIRST
    // device's key; on the by-token bind it binds this credential's own key and names that row.
    const secondConfirm = await confirm(second.id)
    expect(secondConfirm.deviceKey, 'the second confirm named no key of its own').not.toBeNull()
    expect(secondConfirm.deviceKey?.id, 'the second confirm named the first device’s key').not.toBe(
      firstConfirm.deviceKey?.id,
    )

    // THE MEASUREMENT IS THE ACT, NOT THE ROW. The second token is the person.
    expect(await isThisDeviceThePerson(second.token), 'the second device’s token proved nothing').toBe(200)
    // AND THE FIRST STILL IS.
    expect(await isThisDeviceThePerson(first.token), 'the first device lost its key').toBe(200)

    // TWO LIVE ROWS FOR ONE NAME, which is what the name cannot tell apart and the hash can.
    const rows = t.client.sqlite
      .prepare(
        "SELECT key_hash FROM held_keys WHERE whose_kind = 'person-device' AND whose_id = ? AND revoked_at IS NULL",
      )
      .all(ONE_NAME) as { key_hash: string }[]
    expect(rows.length, 'the second credential bound no key of its own').toBe(2)
  })
})
