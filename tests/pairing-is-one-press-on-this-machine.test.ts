// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PAIRING THIS BROWSER IS ONE PRESS ON THE MACHINE THE OFFICE RUNS ON. Criterion P83, point 2.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The person's key exists (point 1) and the pairing page offers one press. This is the door behind
 * that press: a request from the office's own computer sets the person's key as a cookie, and the
 * next request from that browser is the person. The cookie is HttpOnly, so page JavaScript cannot
 * read the key, and SameSite strict, so another site cannot make this browser act as the person.
 * Pairing is offered on this machine only: the same press through the listener for other machines
 * is refused and sets no cookie.
 *
 * AND AN UNPAIRED BROWSER STILL REACHES THE OFFICE. This is the half that keeps the merge from
 * being an outage: for one version the window still covers a keyless claim from this computer, and
 * a pairing page that stood between the person and their office would be the trap this piece exists
 * to remove.
 *
 * ---------------------------------------------------------------------------------------
 * WHY REAL LISTENERS AND NOT `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * Every fact here is about a request a LISTENER carried: whether pairing is offered reads the
 * listener's stamp, and the local-only refusal reads it too, and neither can be set by a caller. So
 * this file opens the first listener with `app.listen` and the product's own second listener with
 * `listenForOtherMachines`, exactly as tests/local-only-routes.test.ts does, and drives both with
 * `fetch`. The cookie is carried back the way a browser carries it, in the Cookie header.
 *
 * ---------------------------------------------------------------------------------------
 * THE KEY IS NEVER PRINTED
 * ---------------------------------------------------------------------------------------
 *
 * The pairing press answers with a real cookie, and this file carries it back without ever writing
 * its value: `cookieOnly` returns the name-and-value pair and no assertion quotes it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The person's headers and no key: exactly the claim the one-version window is about. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** An address the trusted list does not cover, so the second listener really is another machine. */
const NOT_TRUSTED = '203.0.113.7'

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
  // THE FIRST LISTENER, which stamps `this machine`.
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  // THE PRODUCT'S OWN SECOND LISTENER, not a copy of it written here.
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`
})

async function shutTheOtherDoor(): Promise<void> {
  await new Promise<void>((done) => {
    otherMachines.close(() => {
      done()
    })
  })
}

afterAll(async () => {
  await shutTheOtherDoor()
  await app.close()
  t.close()
})

interface Answer {
  status: number
  body: { paired?: boolean; offered?: boolean; error?: string; detail?: string }
  setCookie: string | null
}

/** Ask whether this browser is paired, and whether pairing is offered here. */
async function readPairing(door: string, headers: Record<string, string> = THE_PERSON): Promise<Answer> {
  const res = await fetch(`${door}/api/office/pairing`, { headers })
  const body = (await res.json()) as Answer['body']
  return { status: res.status, body, setCookie: res.headers.get('set-cookie') }
}

/** The one press. */
async function pressPairing(door: string, headers: Record<string, string> = THE_PERSON): Promise<Answer> {
  const res = await fetch(`${door}/api/office/pairing`, { method: 'POST', headers })
  const body = (await res.json()) as Answer['body']
  return { status: res.status, body, setCookie: res.headers.get('set-cookie') }
}

/**
 * THE COOKIE TO SEND BACK: the name and value only, never the whole header and never printed.
 *
 * A browser sends exactly this pair on the next request. Keeping the attributes out of it is not
 * tidiness — sending `HttpOnly` back as if it were part of the value is how a test fails to notice
 * that the attribute is missing from the reply.
 */
function cookieOnly(setCookie: string | null): string {
  if (setCookie === null) throw new Error('the pairing reply set no cookie')
  const pair = setCookie.split(';')[0]
  if (pair === undefined || !pair.startsWith('mole-office-key=')) {
    throw new Error('the pairing reply set no mole-office-key cookie')
  }
  return pair
}

/** A person-only act: change whether the office map moves. Its guard asks for the person unconditionally. */
async function changeTheScene(door: string, headers: Record<string, string>): Promise<number> {
  const res = await fetch(`${door}/api/office/scene-settings`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ motion: true }),
  })
  return res.status
}

describe('one press on this machine pairs this browser', () => {
  it('sets the cookie, and the next request from that browser is the person', async () => {
    // BEFORE THE PRESS: nothing has proved this browser, and pairing is offered here.
    const before = await readPairing(thisMachine)
    expect(before.status, before.body.error).toBe(200)
    expect(before.body.paired, 'an unpaired browser was already the person').toBe(false)
    expect(before.body.offered, 'an unpaired browser at this computer was not offered pairing').toBe(true)

    const pressed = await pressPairing(thisMachine)
    expect(pressed.status, `the pairing press was refused: ${pressed.body.error ?? ''}`).toBe(200)
    expect(pressed.body.paired).toBe(true)
    expect(pressed.body.offered, 'a paired browser was still offered pairing').toBe(false)
    const cookie = cookieOnly(pressed.setCookie)

    // THE NEXT REQUEST CARRIES THE COOKIE AND IS THE PERSON. `paired` is true only when the key was
    // read, and a person-only door is driven as well so this is an act and not only a header read.
    const after = await readPairing(thisMachine, { ...THE_PERSON, cookie })
    expect(after.body.paired, 'the browser that just paired is not the person').toBe(true)
    expect(after.body.offered, 'a paired browser was offered pairing again').toBe(false)
    expect(
      await changeTheScene(thisMachine, { ...THE_PERSON, cookie }),
      'a person-only door refused the browser that had just paired',
    ).toBe(200)
  })

  it('sets a cookie that is HttpOnly and SameSite strict, on the whole site', async () => {
    const pressed = await pressPairing(thisMachine)
    const header = pressed.setCookie ?? ''
    expect(header, 'the pairing reply set no cookie').toContain('mole-office-key=')
    // THE TWO ATTRIBUTES THE CRITERION NAMES. HttpOnly keeps page JavaScript from reading the key;
    // SameSite strict keeps another site from making this browser act as the person.
    expect(header, 'the cookie is not HttpOnly').toContain('HttpOnly')
    expect(header, 'the cookie is not SameSite strict').toMatch(/SameSite=Strict/i)
    // AND IT IS A COOKIE EVERY ROUTE RECEIVES, not one path's fragment.
    expect(header, 'the cookie is not scoped to the whole site').toContain('Path=/')
  })

  it('is refused from the second listener, and sets no cookie there', async () => {
    const answer = await pressPairing(anotherMachine, { ...THE_PERSON, 'x-forwarded-for': NOT_TRUSTED })
    expect(answer.status, `a caller from another machine paired this browser: ${answer.body.error ?? ''}`).toBe(403)
    expect(answer.setCookie, 'a refused pairing set a cookie anyway').toBeNull()
    // AND THE SECOND LISTENER IS NOT OFFERED IT. The offer reads the listener's stamp, which no
    // caller can set, so the page there says to join through the Embassy instead.
    const read = await readPairing(anotherMachine, { ...THE_PERSON, 'x-forwarded-for': NOT_TRUSTED })
    expect(read.body.offered, 'pairing was offered off the machine Mole Office runs on').toBe(false)
  })
})

describe('an unpaired browser still reaches the office while the window is open', () => {
  it('answers a read, and does the person’s act from this computer', async () => {
    const read = await fetch(`${thisMachine}/api/records`, { headers: THE_PERSON })
    expect(read.status, 'the office did not answer an unpaired browser').toBe(200)
    // A PERSON'S ACT, TOO. For one version the window covers a keyless claim from this computer, and
    // this is the half that stops pairing from standing between the person and their office.
    expect(
      await changeTheScene(thisMachine, THE_PERSON),
      'a keyless browser at this computer was refused while the window was open',
    ).toBe(200)
  })
})
