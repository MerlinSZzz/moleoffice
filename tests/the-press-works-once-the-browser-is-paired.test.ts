// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LOOP CLOSES: ONCE THIS BROWSER IS PAIRED, THE CLOSE-THE-WINDOW PRESS WORKS. Criterion P83,
 * point 2, and problem OgdgFc68y3xq.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The one press that closes the key window asks for a proof that outlives the window, because a
 * browser the window made the person would otherwise shut itself out the moment it pressed. Until
 * this piece nothing could give a browser that proof, so the press was refused to every browser in
 * the product. This is the case that says the piece did what it is for: a browser with no key is
 * refused with the sentence naming what it needs, the pairing press gives it a device key in two
 * halves, and the SAME press from the same browser, carrying both, is then accepted.
 *
 * AND THE WINDOW REALLY CLOSES. After the press a keyless claim from this computer is nobody, which
 * is the state the press exists to reach; the paired browser is still the person.
 *
 * ---------------------------------------------------------------------------------------
 * WHY REAL LISTENERS
 * ---------------------------------------------------------------------------------------
 *
 * The press is `reach: 'local'`, so the listener's stamp is half of whether it may be reached at
 * all, and the key that proves the person arrives as a cookie half and a header half, as a browser
 * sends them. Both are driven
 * with `fetch` against the listener `app.listen` opened, exactly as tests/the-press-closes-the-
 * window.test.ts does; `app.inject()` is on no socket and would measure a different caller.
 *
 * THE KEY IS NEVER PRINTED. The pairing reply's two halves are carried back without a value being
 * quoted anywhere, the way this repository's other key tests do it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEVICE_HALF_COOKIE, DEVICE_HALF_HEADER } from '../src/config/key-header.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The person's headers and no key: the claim the window covers until the person pairs. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let t: TestDb
let app: FastifyInstance
let thisMachine: string

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
})

afterAll(async () => {
  await app.close()
  t.close()
})

interface Answer {
  status: number
  error: string
  setCookie: string | null
  deviceHalf?: string
}

/** The person's press that closes the window, driven through the listener for this machine. */
async function pressToClose(headers: Record<string, string>): Promise<Answer> {
  const res = await fetch(`${thisMachine}/api/office/key-window/close`, { method: 'POST', headers })
  const body = (await res.json()) as { error?: string }
  return { status: res.status, error: body.error ?? '', setCookie: res.headers.get('set-cookie') }
}

/** The one pairing press, with the name the browser gives itself. */
async function pairThisBrowser(): Promise<Answer> {
  const res = await fetch(`${thisMachine}/api/office/pairing`, {
    method: 'POST',
    headers: THE_PERSON,
    body: JSON.stringify({ device: 'Test browser that closes the window' }),
  })
  const body = (await res.json()) as { error?: string; deviceHalf?: string }
  return { status: res.status, error: body.error ?? '', setCookie: res.headers.get('set-cookie'), deviceHalf: body.deviceHalf }
}

/** The two halves to send back, the cookie as name and value only, never printed. */
function bothHalves(paired: Answer): Record<string, string> {
  if (paired.setCookie === null) throw new Error('the pairing reply set no cookie')
  const pair = paired.setCookie.split(';')[0]
  if (pair === undefined || !pair.startsWith(`${DEVICE_HALF_COOKIE}=`)) {
    throw new Error('the pairing reply set no cookie half')
  }
  if (paired.deviceHalf === undefined || paired.deviceHalf === '') throw new Error('the pairing reply answered no header half')
  return { cookie: pair, [DEVICE_HALF_HEADER]: paired.deviceHalf }
}

/** A person-only act, so the closed window can be measured and not only the press. */
async function changeTheScene(headers: Record<string, string>): Promise<number> {
  const res = await fetch(`${thisMachine}/api/office/scene-settings`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ motion: true }),
  })
  return res.status
}

describe('the loop closes', () => {
  it('refuses the press to a browser with no key, and accepts it after that browser pairs', async () => {
    // BEFORE: the press is refused, and the refusal names what the browser needs rather than only
    // saying no. This is the state every browser was in before this piece.
    const refused = await pressToClose(THE_PERSON)
    expect(refused.status, 'a browser with no key closed the window').toBe(403)
    expect(refused.error, 'the refusal does not say a key is needed').toContain('holds no key')
    expect(refused.error, 'the refusal does not say pairing is the way on').toContain('Pair this browser first')

    // PAIR: one press, and the reply sets the cookie half and answers the header half.
    const paired = await pairThisBrowser()
    expect(paired.status, `the pairing press was refused: ${paired.error}`).toBe(200)
    const halves = bothHalves(paired)

    // AFTER: the same press, from the same browser, is the person's and is accepted.
    const accepted = await pressToClose({ ...THE_PERSON, ...halves })
    expect(accepted.status, `the browser that paired was still refused: ${accepted.error}`).toBe(200)

    // AND THE WINDOW IS SHUT. A keyless claim from this computer is nobody now, and the paired
    // browser goes on being the person — which is the whole state the press exists to reach.
    expect(await changeTheScene(THE_PERSON), 'a keyless act still counted after the window closed').toBe(403)
    expect(await changeTheScene({ ...THE_PERSON, ...halves }), 'the paired browser lost the person when the window closed').toBe(200)
  })
})
