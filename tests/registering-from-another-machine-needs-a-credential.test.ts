// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REGISTERING AN AGENT FROM ANOTHER MACHINE NEEDS A CREDENTIAL THE OWNER CONFIRMED — CRITERION P69.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * An agent on another machine registered itself here. It became an agent on the contacts list, not a
 * visitor, and nobody was asked to confirm it.
 *
 * On the owner's own corpus: a Codex worker from 7 September 2026, whose id names the owner, a citizen of
 * this world, on the contacts list, `startedBy` null. Its record `KafK03fZvjgd` holds handle, state, source,
 * workArea, role and runtime and NO `startedBy` — which POST /api/agents/started always writes — so it came
 * through POST /api/records with kind `agent`. Its profile says fourteen requests from the address
 * 192.0.2.20.
 *
 * SO THE GATE IS ON BOTH DOORS. A check on the registration route alone would have left open the
 * door that was actually used, and this suite drives both.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, BOTH DIRECTIONS
 * ---------------------------------------------------------------------------------------
 *
 *   · from this machine nothing changes: registration goes through and the row names no credential;
 *   · from another machine with no credential, BOTH doors refuse, and the refusal names the door
 *     that issues one and says the owner confirms it at the Embassy;
 *   · a credential the owner has not confirmed does not work, and the sentence says it is waiting for the owner;
 *   · once the owner confirms it, the ordinary door registers the agent and the row names the credential —
 *     on the registry and on the Embassy row the owner reads;
 *   · a caller cannot name its own credential. A suite without that case would pass with the field
 *     read off the body, which is a claim wearing a measurement's clothes.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   delete the `whereThisRegistrationCameFrom` clause from POST /api/agents/started → two cases red.
 *   delete it from POST /api/records → the case about the door the Codex worker used goes red.
 *   have `withTheCredentialMeasuredHere` keep what the caller sent → the last case goes red.
 *   stop `keepTheAgentRegistryInStep` following `credential` → the case about the row goes red.
 */

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let otherMachines: Server
let elsewhere: string
/**
 * THE DOOR THE REFUSAL NAMES, read from the one place that declares it.
 *
 * IT IS IMPORTED INSIDE `beforeAll` AND NOT AT THE TOP. A static import of anything under
 * `src/server/lib/` opens Mole Office's database at module load, which is before `freshDb()` has
 * said which database — and the product refuses that outright rather than opening the operator's own
 * file. Every server module this suite reads is imported the same way, after the database is set.
 */
let theCredentialDoor = ''

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

/** A request through the product's own listener for other machines, not a copy of it written here. */
async function fromElsewhere(
  path: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; said: string; json: Record<string, unknown> }> {
  const res = await fetch(`${elsewhere}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const said = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(said) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: res.status, said, json }
}

/** The same, from this machine. `app.inject` arrives through neither listener, which is not elsewhere. */
async function fromHere(
  path: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; said: string; json: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as Record<string, unknown> })
  return {
    status: reply.statusCode,
    said: reply.body,
    json: reply.statusCode < 400 ? (reply.json() as Record<string, unknown>) : {},
  }
}

async function theRow(handle: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/participants/agent/${handle}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { participant: Record<string, unknown> }).participant
}

/** A credential for a visiting agent, and its token. Pending until the owner confirms it. */
async function askForACredential(handle: string): Promise<{ id: string; token: string }> {
  const asked = await fromElsewhere(
    '/api/office/visitors',
    { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' },
    { handle, name: `The ${handle} run`, role: 'worker', startDirectory: `${THE_TEST_FIXTURE_ROOT}/${handle}` },
  )
  expect(asked.status, asked.said).toBe(201)
  const credential = asked.json['credential'] as { id: string }
  return { id: credential.id, token: String(asked.json['token']) }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  // THE PRODUCT'S OWN SECOND LISTENER, not a copy of it written here. It is what stamps a request
  // as having arrived from another machine, and nothing a caller sends can produce that stamp.
  theCredentialDoor = (await import('../src/server/lib/registrationgate.ts')).THE_CREDENTIAL_DOOR
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  elsewhere = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`
  const secretary = await fromHere('/api/agents/started', AS_THE_PERSON, {
    handle: THE_TEST_OFFICES_SECRETARY.handle,
    name: THE_TEST_OFFICES_SECRETARY.name,
    role: 'secretary',
  })
  expect(secretary.status, secretary.said).toBe(201)
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

// ============================================================ 1. this machine is unchanged

describe('on the owner’s own machine', () => {
  it('registers an agent as it always did, and the row names no credential', async () => {
    const said = await fromHere('/api/agents/started', asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'here-one', name: 'Here One' })
    expect(said.status, said.said).toBe(201)
    expect(said.json['credential'], 'none was needed').toBeNull()
    expect((await theRow('here-one'))['credential'], 'and the row says so').toBeNull()
  })
})

// ============================================================ 2. from elsewhere, with nothing

describe('from another machine with no credential', () => {
  it('refuses the registration door, and names where to ask and who confirms', async () => {
    const said = await fromElsewhere('/api/agents/started', asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      handle: 'far-one',
      name: 'Far One',
    })
    expect(said.status, said.said).toBe(403)
    expect(said.said, 'the door that issues one').toContain(theCredentialDoor)
    expect(said.said, 'and where the owner confirms it').toContain('Embassy')
    expect(said.said).toContain('Nothing was written')
  })

  it('refuses the door the Codex worker actually used', async () => {
    // POST /api/records WITH KIND `agent`, which is what wrote `KafK03fZvjgd`: no `startedBy`, its
    // own actor id, from an address. A gate on the registration route alone would answer 201 here.
    const said = await fromElsewhere('/api/records', asAgent('codex-far'), {
      kind: 'agent',
      title: 'Codex Windows worker',
      data: { handle: 'codex-far', state: 'active', role: 'worker', runtime: 'codex' },
    })
    expect(said.status, said.said).toBe(403)
    expect(said.said).toContain(theCredentialDoor)
    const back = await app.inject({ method: 'GET', url: '/api/participants/agent/codex-far', headers: AS_THE_PERSON })
    expect(back.statusCode, 'and nothing was registered').toBe(404)
  })
})

// ============================================================ 3. a credential the owner has not confirmed

describe('with a credential the owner has not confirmed', () => {
  it('is refused, and the sentence says it is waiting for the owner', async () => {
    const credential = await askForACredential('pending-one')
    const said = await fromElsewhere(
      '/api/agents/started',
      { ...asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'x-mole-office-credential': credential.token },
      { handle: 'pending-one', name: 'Pending One' },
    )
    expect(said.status, said.said).toBe(403)
    expect(said.said, 'the owner’s press is what it waits for').toContain('confirm')
  })
})

// ============================================================ 4. once the owner confirms it

describe('once the owner confirms the credential', () => {
  /**
   * WHAT THIS MEASURED UNTIL 8 SEPTEMBER 2026, AND WHY IT CHANGED.
   *
   * It confirmed a credential and then registered through the ordinary door, expecting a 201 and a
   * fresh row. Criterion P81 changes both halves of that. The confirm itself now writes the agent
   * record and its row, so by the time this registration is made the row already exists; and a
   * second registration under one credential is answered with the row that credential has, because
   * one session on another machine gets one row.
   *
   * What the case is about is unchanged and is still measured: the row carries the credential that
   * let it in, and the reply says which one.
   */
  it('registers through the ordinary door, with the credential named on the row', async () => {
    const credential = await askForACredential('far-two')
    const confirmed = await fromHere(`/api/office/visitors/${credential.id}/confirm`, AS_THE_PERSON, {})
    expect(confirmed.status, confirmed.said).toBe(200)

    const said = await fromElsewhere(
      '/api/agents/started',
      { ...asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'x-mole-office-credential': credential.token },
      { handle: 'far-two', name: 'Far Two' },
    )
    expect(said.status, said.said).toBe(200)
    expect(said.json['alreadyRegistered'], 'the confirm had already made the row').toBe(true)
    expect((said.json['agent'] as { handle: string }).handle, 'and it names the handle to write under').toBe('far-two')
    expect((await theRow('far-two'))['credential'], 'and the registry row names the credential').toBe(credential.id)
  })

  it('names it on the row the owner reads at the Embassy', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/office/embassy', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    const rows = (reply.json() as { rows: { who: { id: string }; credential: string | null }[] }).rows
    // THE EMBASSY ROW IS KEYED BY REGISTRY ID, and a row registered since the mint has an id of its own.
    const farId = (await theRow('far-two'))['id']
    const hereId = (await theRow('here-one'))['id']
    const far = rows.find((one) => one.who.id === farId)
    expect(far?.credential, 'the row says which credential let this agent in').not.toBeNull()
    const here = rows.find((one) => one.who.id === hereId)
    expect(here?.credential, 'and a row registered on the owner’s own machine names none').toBeNull()
  })
})

// ============================================================ 5. the credential is measured

describe('the credential on a row is measured and never sent', () => {
  it('refuses a later write that would change it', async () => {
    const row = await theRow('far-two')
    const record = String(row['record'])
    const said = await app.inject({
      method: 'PATCH',
      url: `/api/records/${record}`,
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { dataPatch: { credential: 'a-credential-it-does-not-hold' } },
    })
    expect(said.statusCode, said.body).toBe(403)
    expect(said.body, 'and it says why the field cannot be written').toContain('measured')
    expect((await theRow('far-two'))['credential'], 'and nothing moved').not.toBe('a-credential-it-does-not-hold')
  })

  it('replaces one the caller wrote into the body', async () => {
    const said = await fromHere('/api/records', asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      kind: 'agent',
      title: 'Claims A Credential',
      // NO CARD IN THE BODY, and that is not incidental. Since problem mz5ddKDITE3j the ordinary
      // record door refuses a card on an agent record to everybody but the person and the doors that
      // appoint, so a `role` here would be refused before the credential was ever looked at — and
      // this case is about the credential.
      data: { handle: 'claims-one', state: 'active', credential: 'a-credential-it-does-not-hold' },
    })
    expect(said.status, said.said).toBe(201)
    expect(
      (await theRow('claims-one'))['credential'],
      'it was registered on this machine, so it came in on none whatever it wrote',
    ).toBeNull()
  })
})
