// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONCE LOQUAT RUNS A WORLD, ITS AGENTS REGISTER AS CITIZENS WITH NO CONFIRMATION.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P30 of design/permissions/ACCEPTANCE.md:
 *
 *     once another of the person's machines runs Mole Office with a world, its agents are citizens of that world;
 *     the person signs in to each such world, and therefore they register through the Embassy at once, with no confirmation
 *
 * *Measured: a world is registered from loquat, an agent of that world registers, its first request
 * is accepted, and no confirmation was asked for. Its earlier visitor rows are kept and marked
 * ended.*
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER IS THE MEASUREMENT
 * ---------------------------------------------------------------------------------------
 *
 * A test that registered the world first and then asked for a credential would show the citizen path
 * working and would say nothing about the sentence that matters, which is the one about what happens
 * to the agents that came in BEFORE the world did. So this file asks for a visitor credential first,
 * registers the world second, and then measures both halves: the new agent works at once, and the
 * old row is kept and marked ended with a reason a person can read.
 *
 * ---------------------------------------------------------------------------------------
 * "THE SAME PERSON" IS A CLAIM AND THIS FILE DOES NOT PRETEND OTHERWISE
 * ---------------------------------------------------------------------------------------
 *
 * The world says who started it and nothing here checks that. Criterion P31 is what makes the
 * Embassy say so, and it is measured in
 * tests/the-embassy-lists-every-visitor-and-world.test.ts. What is measured here is only that the
 * confirmation step is skipped for a world this office holds a live row for.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let thisMachine: string
let loquat: string
const extraDoors: Server[] = []

/**
 * TWO DATABASE IDENTITIES, BECAUSE THE TESTS BELOW MEASURE TWO DIFFERENT MOMENTS.
 *
 * Registering a world is idempotent and permanent, so a file that used one identity throughout would
 * have that world registered from the second test onwards and the "before the world existed" half of
 * the criterion would silently stop being measured. Sixteen hex characters is what an identity is.
 */
const LOQUAT_WORLD = 'beefbeefbeefbeef'
const LOQUAT_LATER = 'cafecafecafecafe'

async function open(server: Server): Promise<string> {
  extraDoors.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const { stampArrival } = await import('../src/server/lib/http.ts')
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  loquat = await open(
    createServer((raw, res) => {
      stampArrival(raw, 'another machine', 'the caller')
      app.routing(raw, res)
    }),
  )
})

afterAll(async () => {
  for (const server of extraDoors) await new Promise<void>((resolve) => server.close(() => resolve()))
  await app.close()
  t.close()
})

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function ask(
  door: string,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
  headers: Record<string, string> = PERSON,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

interface Credential {
  id: string
  handle: string
  standing: string
  world: string | null
  confirmedBy: { kind: string; id: string } | null
  endedBecause: string | null
}

async function askForOne(over: Record<string, unknown>): Promise<{ token: string; credential: Credential; body: Record<string, unknown> }> {
  const answer = await ask(loquat, 'POST', '/api/office/visitors', {
    name: 'A worker on loquat',
    role: 'worker',
    conversationPath: '/transcripts/loquat',
    startDirectory: `${THE_TEST_FIXTURE_ROOT}/work/loquat`,
    runtime: 'claude-code',
    ...over,
  })
  expect(answer.status, JSON.stringify(answer.body)).toBe(201)
  return { token: answer.body.token as string, credential: answer.body.credential as Credential, body: answer.body }
}

/**
 * loquat says it has started a world, by the identity of its own database.
 *
 * UNDER THE NAME A WORLD REPORTS UNDER, which is what a real world sends (`theHeadersThisWorldReportsUnder` in
 * src/server/lib/office.ts). It used to be sent in the person's name with no key; since item 1 of a decision,
 * that is refused from a machine this office does not trust, and no world ever sent
 * it.
 */
async function loquatRegistersItsWorld(identity: string): Promise<Record<string, unknown>> {
  const { theHeadersThisWorldReportsUnder } = await import('../src/server/lib/office.ts')
  const registered = await ask(loquat, 'POST', '/api/office/worlds', {
    name: `loquat ${identity.slice(0, 4)}`,
    kind: 'remote',
    // WHO IT SAYS STARTED IT. Said by that world and checked by nothing here, which is criterion
    // P31 and is why the Embassy carries a sentence about it.
    startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    databaseIdentity: identity,
    standing: 'canonical',
    installation: 'loquat-installation',
  }, { 'content-type': 'application/json', ...theHeadersThisWorldReportsUnder() })
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
  return registered.body
}

describe('P30 — a citizen of a world the same person owns registers with no confirmation', () => {
  it('leaves an agent pending while loquat has no world', async () => {
    const { credential } = await askForOne({ handle: 'loquat-before', world: LOQUAT_WORLD })
    // THE WORLD IS NAMED AND THE OFFICE HOLDS NO ROW FOR IT, so this is still a visitor. A world a
    // caller merely NAMES vouches for nothing: the check is the office's own live row.
    expect(credential.standing).toBe('pending')
  })

  it('accepts the first request of an agent of a registered world, with no confirmation asked for', async () => {
    await loquatRegistersItsWorld(LOQUAT_WORLD)

    const { token, credential, body } = await askForOne({ handle: 'loquat-citizen', world: LOQUAT_WORLD })
    expect(credential.standing, 'an agent of a registered world was still made to wait').toBe('trusted')
    expect(body.confirmationAsked, 'the reply says a confirmation was asked for').toBe(false)
    // NOBODY PRESSED ANYTHING, and the row says who vouched rather than naming a person who did not
    // press. The world's own declared starter is what stands there.
    expect(credential.confirmedBy?.id).toBe(THE_TEST_OFFICES_OWNER.id)

    // AND ITS FIRST REQUEST IS ANSWERED. Nothing was confirmed in between.
    const first = await ask(loquat, 'GET', '/api/health', undefined, {
      'x-mole-office-credential': token,
      'x-mole-office-conversation': '/transcripts/loquat',
      'x-mole-office-start-directory': `${THE_TEST_FIXTURE_ROOT}/work/loquat`,
    })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
  })

  it('keeps the earlier visitor rows and marks them ended, with the reason on the row', async () => {
    // A VISITOR FIRST, then the world. That order is the criterion's last sentence, and it needs a
    // world this file has not registered yet.
    const { token, credential } = await askForOne({ handle: 'loquat-was-a-visitor', world: LOQUAT_LATER })
    expect(credential.standing, 'the world under test was already registered, so nothing below is measured').toBe(
      'pending',
    )
    await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/confirm`, undefined, PERSON)
    await ask(loquat, 'GET', '/api/health', undefined, {
      'x-mole-office-credential': token,
      'x-mole-office-conversation': '/transcripts/loquat',
      'x-mole-office-start-directory': `${THE_TEST_FIXTURE_ROOT}/work/loquat`,
    })

    const registered = await loquatRegistersItsWorld(LOQUAT_LATER)
    // THE REGISTRATION IS WHAT ENDS THE VISIT, and it says which credentials stopped being visits.
    expect(registered.noLongerVisitors, 'registering the world ended no visitor credential').toContain(credential.id)

    // AND AN AGENT OF THAT WORLD IS A CITIZEN FROM THEN ON, with nobody asked to confirm it.
    const now = await askForOne({ handle: 'loquat-citizen-two', world: LOQUAT_LATER })
    expect(now.credential.standing).toBe('trusted')

    const read = await ask(thisMachine, 'GET', `/api/office/visitors/${credential.id}`, undefined, PERSON)
    const after = read.body.credential as Credential
    // THE ROW IS KEPT. The office does not delete the evidence of how somebody first got in.
    expect(read.status).toBe(200)
    expect(after.standing).toBe('ended')
    expect(after.endedBecause).toContain('This world was registered')
    expect(JSON.stringify(read.body.requests), 'the requests it made were thrown away').toContain('/api/health')

    // AND THE OLD TOKEN NO LONGER WORKS, which is what "ended" has to mean.
    const refused = await ask(loquat, 'GET', '/api/health', undefined, {
      'x-mole-office-credential': token,
      'x-mole-office-conversation': '/transcripts/loquat',
      'x-mole-office-start-directory': `${THE_TEST_FIXTURE_ROOT}/work/loquat`,
    })
    expect(refused.status).toBe(403)
  })

  it('ends a credential that named no world, when the world registers at the machine it asked from', async () => {
    /**
     * THE CASE THE CRITERION IS ACTUALLY ABOUT, and the one the first version of this code missed.
     *
     * An agent that asked before loquat ran a world named NO world, because there was none to name.
     * Measured on 7 September 2026 with two isolated stacks: the world registered, and nothing was
     * ended, because the only rows looked at were the ones naming that world. The machine is what
     * links them.
     */
    const { credential } = await askForOne({ handle: 'loquat-nameless' })
    expect(credential.world, 'this row was supposed to name no world').toBeNull()
    expect(credential.standing).toBe('pending')

    const machine = (
      await ask(thisMachine, 'GET', `/api/office/visitors/${credential.id}`, undefined, PERSON)
    ).body.credential as { machine: string | null }
    expect(machine.machine, 'nothing recorded the machine, so this case cannot be measured').not.toBeNull()

    const registered = await ask(loquat, 'POST', '/api/office/worlds', {
      name: 'loquat, reached at the address it asked from',
      kind: 'remote',
      startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      databaseIdentity: 'a1a1a1a1a1a1a1a1',
      // WHERE ANOTHER MACHINE REACHES IT. Its host is what the credential recorded as the machine.
      addressForOtherMachines: `http://${machine.machine ?? ''}:8787`,
      standing: 'canonical',
      installation: 'loquat-installation',
    })
    expect(registered.status, JSON.stringify(registered.body)).toBe(201)
    expect(
      registered.body.noLongerVisitors,
      'a world registering at the machine a visitor asked from ended nothing',
    ).toContain(credential.id)

    const after = (
      await ask(thisMachine, 'GET', `/api/office/visitors/${credential.id}`, undefined, PERSON)
    ).body.credential as Credential
    expect(after.standing).toBe('ended')
    expect(after.endedBecause).toContain('This world was registered')
  })

  it('leaves a credential alone when nothing links it to the world that registered', async () => {
    // THE HONEST DIRECTION. A credential wrongly ended stops an agent that was working; one left
    // open is a row the person can see at the Embassy and end themselves in one press.
    const { credential } = await askForOne({ handle: 'loquat-unrelated' })
    const registered = await ask(loquat, 'POST', '/api/office/worlds', {
      name: 'a world somewhere else entirely',
      kind: 'remote',
      startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      databaseIdentity: 'b2b2b2b2b2b2b2b2',
      addressForOtherMachines: 'http://nowhere-near-here.example:8787',
      standing: 'canonical',
      installation: 'loquat-installation',
    })
    expect(registered.body.noLongerVisitors).not.toContain(credential.id)
    const after = (
      await ask(thisMachine, 'GET', `/api/office/visitors/${credential.id}`, undefined, PERSON)
    ).body.credential as Credential
    expect(after.standing).toBe('pending')
  })

  it('does not make a citizen of an agent that names a world this office has never seen', async () => {
    const { credential } = await askForOne({ handle: 'loquat-invented', world: 'ffffffffffffffff' })
    expect(credential.standing, 'a world nobody registered was taken at its word').toBe('pending')
  })
})
