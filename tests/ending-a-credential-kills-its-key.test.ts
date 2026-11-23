// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ENDING A CREDENTIAL KILLS THE KEY IT BOUND — PROBLEM cJHoRBVT6IG8, CRITERION P83 POINT 4.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * A confirmed person's device becomes the person because the confirm registers the SHA-256 of the
 * token the device already holds in `held_keys`. Ending the credential updated only
 * `visitor_credentials`: the row said ended, the press answered 200, and the token went on proving
 * the person. Measured on 13 September 2026, problem cJHoRBVT6IG8: after the end press the same
 * token on `x-mole-office-key` wrote a decision and the office answered 201.
 *
 * The key arrives on a different header from the credential, and `heldKeyByHash` never reads the
 * credential's standing, so the visitor gate could not have caught it. Two presses existed and only
 * one of them worked.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, AND WHY IT DRIVES THE ACT
 * ---------------------------------------------------------------------------------------
 *
 * This drives the whole way through on a real app: it asks for a device credential, confirms it,
 * ends it, and then TRIES THE PERSON'S ACT with the token. It does not assert that the credential
 * says ended — that is what the existing tests already do, and it is exactly what missed this. The
 * act is the measurement: the same decision write is answered 201 while the key lives and 403 once
 * the credential is ended.
 *
 * THE ACT IS ASKED FROM A DOOR THE WINDOW DOES NOT COVER, so the answer is about the key and not
 * about the one-version window. The second listener is the product's own, and the caller's address
 * is asserted not to be on the trusted list before the act, so a trusted row cannot stand in for the
 * revoked key and make this pass for the wrong reason.
 *
 * MUTATION PROOF (after a green control): delete the `revokeTheKeyWhoseHashIs` call from
 * `endACredential` in src/server/lib/visitors.ts — put the missing revoke back out — and the final
 * case goes red, because the ended token writes the decision again. Restoring it turns the case
 * green. Every file was restored byte-identical, with the sha256 on both sides.
 */

import { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'

/** The person's headers and the key: a device that was confirmed sends both. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

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
  // THE FIRST LISTENER, for the doors that are kept on this machine (the confirm and the end).
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  // THE PRODUCT'S OWN SECOND LISTENER, for the person-only act. It stamps `another machine` and the
  // socket carries the caller, so this request is not covered by the window's loopback half.
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

interface Answer {
  status: number
  error: string
  token?: string
  id?: string
}

async function askForADevice(): Promise<{ status: number; token: string; credentialId: string }> {
  const res = await fetch(`${thisMachine}/api/office/visitors`, {
    method: 'POST',
    headers: THE_PERSON,
    body: JSON.stringify({ device: 'the-test-phone' }),
  })
  const body = (await res.json()) as { token?: string; credential?: { id?: string }; error?: string }
  expect(res.status, body.error ?? '').toBe(201)
  expect(typeof body.token, 'the ask door showed no token, so nothing can be proved with it').toBe('string')
  const token = body.token as string
  const credentialId = body.credential?.id
  expect(typeof credentialId, 'the ask door named no credential').toBe('string')
  return { status: res.status, token, credentialId: credentialId as string }
}

/** Confirm or end, both kept on this machine, with the person's headers. */
async function press(path: string): Promise<number> {
  const res = await fetch(`${thisMachine}${path}`, {
    method: 'POST',
    headers: THE_PERSON,
    body: '{}',
  })
  return res.status
}

/** The person-only act: a decision written with the device's token, from the second listener. */
async function writeADecisionWithTheToken(token: string, title: string): Promise<Answer> {
  const res = await fetch(`${anotherMachine}/api/records`, {
    method: 'POST',
    headers: { ...THE_PERSON, 'x-mole-office-key': token },
    body: JSON.stringify({
      kind: 'decision',
      title,
      data: {
        ...governsTheWholeProject(), replaces: [], because: 'the token the device was shown when it asked' },
    }),
  })
  const body = (await res.json()) as { error?: string; record?: { id?: string } }
  return { status: res.status, error: body.error ?? '', id: body.record?.id }
}

describe('the key a device credential bound dies with the credential', () => {
  it('refuses the person-only act once the credential is ended, and lets it through before', async () => {
    // THE WINDOW MUST NOT COVER THIS DOOR, or a revoked key would be answered anyway and this test
    // would pass for a reason that has nothing to do with the key.
    const { thisOfficeTrusts } = await import('../src/server/lib/trustedmachines.ts')
    expect(
      thisOfficeTrusts('127.0.0.1'),
      'the second listener is trusted, so the window and not the key would answer the final act',
    ).toBe(false)

    const { token, credentialId } = await askForADevice()

    // CONFIRM: the token's hash becomes the device's key.
    expect(await press(`/api/office/visitors/${credentialId}/confirm`), 'the confirm press failed').toBe(200)

    // CONTROL: while the key lives, the token is the person from the untrusted door.
    const before = await writeADecisionWithTheToken(token, 'The device holds its own key')
    expect(before.status, `the live token was refused: ${before.error}`).toBe(201)

    // END: the row is marked ended and the key it bound is revoked in the same act.
    expect(await press(`/api/office/visitors/${credentialId}/end`), 'the end press failed').toBe(200)

    // THE ACT IS DRIVEN, NOT THE ROW. The same token writes a second decision and is refused.
    const after = await writeADecisionWithTheToken(token, 'The ended token cannot write this')
    expect(
      after.status,
      `an ended credential's token still wrote a decision (${String(after.status)}): ${after.error}`,
    ).toBe(403)

    // AND THE OFFICE SAID WHY, so a person reading the refusal can act on it.
    expect(after.error.length, 'the refusal carried no sentence').toBeGreaterThan(0)

    // THE KEY ROW IS MARKED, and the reason names the credential that bound it. This is the second
    // half of the evidence; the refused act above is what the test is for.
    const hash = (await import('../src/server/lib/keys.ts')).keyHash(token)
    const row = t.client.sqlite
      .prepare('SELECT revoked_at, revoked_because FROM held_keys WHERE key_hash = ?')
      .get(hash) as { revoked_at: string | null; revoked_because: string | null } | undefined
    expect(row, 'the device key row is gone, so the revoke cannot be seen').toBeDefined()
    expect(row?.revoked_at, 'the key is not marked revoked').not.toBeNull()
    expect(row?.revoked_because ?? '', 'the revoke reason does not name the credential').toContain(credentialId)
  })
})
