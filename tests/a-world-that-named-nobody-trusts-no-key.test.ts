// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORLD THAT NAMED NOBODY TRUSTS NO KEY, AND A WORLD'S START BINDS NO KEY FROM A COPIED CREDENTIAL.
 * Criterion P84, its last clause; problem FmGa9AOxfaw1, the half the secretary found still open on 25
 * September 2026.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS MEASURES, WALKED
 * ---------------------------------------------------------------------------------------
 *
 * tools/isolated-mole-office.mjs writes MOLE_OFFICE_WORLD_STARTED_BY and
 * MOLE_OFFICE_WORLD_SECRETARIES into every world's environment, empty where it named nobody. A
 * throwaway world (no --show-to-the-person) never asks the office who its secretaries are, so both
 * are empty there. `theWorldsOwnAuthority` read empty as "not a world", so `aHeldKeyThisWorldTrusts`
 * trusted every key the world's table held, exactly as the office does. And
 * `giveAlreadyConfirmedCredentialsTheirKeysOnce`, run at every world's start, bound every copied
 * trusted visitor credential's token back into the emptied table as a key, a person's device
 * included. Together: a device key proved the person inside a world nobody gave it a part in.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 *   1. In a throwaway world (both settings set and empty), an agent key the table holds is refused
 *      on an ordinary write it would pass in the office, the refusal says nobody was named, and
 *      nothing is written. A device key is refused the person's act.
 *   2. In a world with a starter, the starter's key proves the starter; another agent's key is
 *      refused, naming the starter.
 *   3. A world's start binds no key from a copied trusted visitor credential, an agent's or a
 *      device's, in a throwaway world or a world with a starter, and the device's token then does
 *      not make its bearer the person.
 *   4. The office, where neither setting is set, is unchanged: an agent key proves that agent, and
 *      the start's pass still binds a trusted credential's key.
 *
 * EVERY KEY HERE IS A MADE-UP VALUE, and the credential tokens are made by the test's own database.
 * No key or hash is printed or asserted by value.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1 and 2. In src/server/lib/keys.ts `aHeldKeyThisWorldTrusts`, make `if (!world.inATestWorld)
 *      return true` read `return true` (trust every key) → the throwaway-world cases and the
 *      other-agent case go red.
 *   3. In src/server/lib/visitors.ts `giveAlreadyConfirmedCredentialsTheirKeysOnce`, take out the
 *      `if (theWorldsOwnAuthority().inATestWorld) return []` line (re-bind all) → the start cases go
 *      red.
 *   4. In src/server/lib/worldauthority.ts, make `inATestWorld` read `true` → the office cases go red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const STARTER_KEY = 'made-up-key-of-the-worlds-starter-5555'
const OTHER_KEY = 'made-up-key-of-some-other-agent-6666'
const DEVICE_KEY = 'made-up-key-of-a-persons-device-7777'

const KEY_ALONE = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }
const AS_AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'some-other-agent',
}

interface Stack {
  t: TestDb
  app: FastifyInstance
}

/**
 * A stack told what the tool tells a world. `undefined` deletes the setting, which is the office;
 * an empty string is what the tool writes for a world that named nobody.
 */
async function aStack(told: { startedBy?: string; secretaries?: string }): Promise<Stack> {
  const t = await freshDb()
  if (told.startedBy === undefined) delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  else process.env.MOLE_OFFICE_WORLD_STARTED_BY = told.startedBy
  if (told.secretaries === undefined) delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  else process.env.MOLE_OFFICE_WORLD_SECRETARIES = told.secretaries
  forgetTheWorldsOwnAuthority()
  // THE ROWS A WORLD'S TABLE CAN HOLD: a copy made before the table was emptied, or keys bound or
  // minted after the world started.
  const keys = await import('../src/server/lib/keys.ts')
  keys.holdTheKeyWhoseHashIs('agent', 'builder-pb', keys.keyHash(STARTER_KEY), null)
  keys.holdTheKeyWhoseHashIs('agent', 'some-other-agent', keys.keyHash(OTHER_KEY), null)
  keys.holdTheKeyWhoseHashIs('person-device', 'a-device', keys.keyHash(DEVICE_KEY), null)
  const app = (await apiApp()).app
  await app.ready()
  return { t, app }
}

async function closeIt(stack: Stack): Promise<void> {
  await stack.app.close()
  stack.t.close()
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
}

interface Answer {
  status: number
  error: string
  recordId: string
}

async function ask(
  app: FastifyInstance,
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Answer> {
  const reply = await app.inject({ method: 'POST', url, headers, payload })
  const body = reply.json() as { record?: { id?: string }; error?: string }
  return { status: reply.statusCode, error: body.error ?? '', recordId: body.record?.id ?? '' }
}

/** An ordinary write, which an agent's key alone passes in the office. */
function aNote(app: FastifyInstance, key: string, title: string): Promise<Answer> {
  return ask(app, '/api/records', { kind: 'note', title, data: { body: 'x' } }, { ...KEY_ALONE, 'x-mole-office-key': key })
}

/** The person's own act, refused to every agent by name. */
function thePersonsAct(app: FastifyInstance, headers: Record<string, string>, address: string): Promise<Answer> {
  return ask(app, '/api/office/trusted-machines', { address }, headers)
}

function notesTitled(t: TestDb, title: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records WHERE title = ?').get(title) as { n: number }).n
}

function actorOn(t: TestDb, recordId: string): { type: string; id: string } | undefined {
  return t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(recordId) as { type: string; id: string } | undefined
}

/** A trusted visitor credential as the copy carries it: trusted, and no key row for its token. */
async function aCopiedTrustedCredential(handle: string, role: string): Promise<{ token: string }> {
  const { issueACredential } = await import('../src/server/lib/visitors.ts')
  const { sqlite } = await import('../src/server/db/client.ts')
  const issued = issueACredential({
    handle,
    name: handle,
    role,
    world: null,
    machine: null,
    machineHow: 'nobody could tell',
    facts: { conversationPath: null, startDirectory: null, runtime: null, sessionRecord: null },
  })
  sqlite.prepare("UPDATE visitor_credentials SET standing = 'trusted' WHERE id = ?").run(issued.credential.id)
  return { token: issued.token }
}

async function keyRowsForToken(token: string): Promise<number> {
  const keys = await import('../src/server/lib/keys.ts')
  const { sqlite } = await import('../src/server/db/client.ts')
  return (
    sqlite.prepare('SELECT COUNT(*) AS n FROM held_keys WHERE key_hash = ?').get(keys.keyHash(token)) as { n: number }
  ).n
}

async function theStartsPass(): Promise<{ whoseKind: string; whoseId: string }[]> {
  const { giveAlreadyConfirmedCredentialsTheirKeysOnce } = await import('../src/server/lib/visitors.ts')
  return giveAlreadyConfirmedCredentialsTheirKeysOnce()
}

// ============================================================ 1. a throwaway world trusts no key

describe('a throwaway world, told it is a world with nobody named', () => {
  let stack: Stack

  beforeAll(async () => {
    stack = await aStack({ startedBy: '', secretaries: '' })
  })

  afterAll(async () => {
    await closeIt(stack)
  })

  it('refuses an agent key its table holds on a write the office would take, and writes nothing', async () => {
    const title = 'A note a throwaway world must not attribute to a key'
    const wrote = await aNote(stack.app, OTHER_KEY, title)
    expect(wrote.status, JSON.stringify(wrote).slice(0, 400)).toBe(403)
    expect(wrote.error, 'it names the holder').toContain('some-other-agent')
    expect(wrote.error, 'it says nobody started this world').toContain('Nobody was named as having started this world.')
    expect(wrote.error, 'it says no secretary was named').toContain('No secretary was named for this world.')
    expect(wrote.error, 'it says nothing was written').toContain('Nothing was written')
    expect(wrote.error, 'it never carries the key').not.toContain(OTHER_KEY)
    expect(notesTitled(stack.t, title), 'nothing was written').toBe(0)
  })

  it('refuses a device key the person’s act', async () => {
    const said = await thePersonsAct(stack.app, { ...KEY_ALONE, 'x-mole-office-key': DEVICE_KEY }, 'a-throwaway-machine')
    expect(said.status, JSON.stringify(said).slice(0, 300)).toBe(403)
    expect(said.error, 'it names the holder of the device key').toContain('a-device')
  })
})

// ============================================================ 2. a world with a starter trusts the starter's key

describe('a world started by builder-pb, whose tool named no secretary', () => {
  let stack: Stack

  beforeAll(async () => {
    stack = await aStack({ startedBy: 'builder-pb', secretaries: '' })
  })

  afterAll(async () => {
    await closeIt(stack)
  })

  it('lets the starter’s key prove the starter', async () => {
    const wrote = await aNote(stack.app, STARTER_KEY, 'A note the starter’s key wrote')
    expect(wrote.status, JSON.stringify(wrote).slice(0, 400)).toBe(201)
    expect(actorOn(stack.t, wrote.recordId)).toEqual({ type: 'agent', id: 'builder-pb' })
  })

  it('refuses another agent’s key, naming the starter', async () => {
    const title = 'A note another agent’s key must not write in the starter’s world'
    const wrote = await aNote(stack.app, OTHER_KEY, title)
    expect(wrote.status, JSON.stringify(wrote).slice(0, 400)).toBe(403)
    expect(wrote.error, 'it names the starter').toContain('"builder-pb" started this world.')
    expect(notesTitled(stack.t, title), 'nothing was written').toBe(0)
  })
})

// ============================================================ 3. a world's start binds no copied credential's key

describe('a world’s start, over trusted visitor credentials copied from the office', () => {
  for (const told of [
    { what: 'a throwaway world', startedBy: '', secretaries: '' },
    { what: 'a world started by builder-pb', startedBy: 'builder-pb', secretaries: THE_TEST_OFFICES_SECRETARY.handle },
  ]) {
    describe(told.what, () => {
      let stack: Stack
      let agentToken: string
      let deviceToken: string
      let given: { whoseKind: string; whoseId: string }[]

      beforeAll(async () => {
        stack = await aStack({ startedBy: told.startedBy, secretaries: told.secretaries })
        agentToken = (await aCopiedTrustedCredential('a-visiting-agent', 'worker')).token
        deviceToken = (await aCopiedTrustedCredential('a-paired-phone', '')).token
        given = await theStartsPass()
      })

      afterAll(async () => {
        await closeIt(stack)
      })

      it('binds no key, for the visiting agent or the device', async () => {
        expect(given, 'the pass said it bound keys').toEqual([])
        expect(await keyRowsForToken(agentToken), 'the visiting agent’s token became a key').toBe(0)
        expect(await keyRowsForToken(deviceToken), 'the device’s token became a key').toBe(0)
      })

      it('so the device’s token does not make its bearer the person', async () => {
        const said = await thePersonsAct(stack.app, { ...AS_AN_AGENT, 'x-mole-office-key': deviceToken }, 'a-copied-device')
        expect(said.status, JSON.stringify(said).slice(0, 300)).toBe(403)
      })
    })
  }
})

// ============================================================ 4. the office is unchanged

describe('the office, where neither setting is set', () => {
  let stack: Stack

  beforeAll(async () => {
    stack = await aStack({})
  })

  afterAll(async () => {
    await closeIt(stack)
  })

  it('still lets an agent’s key prove that agent', async () => {
    const wrote = await aNote(stack.app, OTHER_KEY, 'A note the office attributes to its key')
    expect(wrote.status, JSON.stringify(wrote).slice(0, 400)).toBe(201)
    expect(actorOn(stack.t, wrote.recordId)).toEqual({ type: 'agent', id: 'some-other-agent' })
  })

  it('still binds a trusted credential’s key at start, and the device’s token then makes the person', async () => {
    const { token } = await aCopiedTrustedCredential('an-office-phone', '')
    const given = await theStartsPass()
    expect(given).toContainEqual({ whoseKind: 'person-device', whoseId: 'an-office-phone' })
    expect(await keyRowsForToken(token)).toBe(1)
    const said = await thePersonsAct(stack.app, { ...AS_AN_AGENT, 'x-mole-office-key': token }, 'an-office-machine')
    expect(said.status, JSON.stringify(said).slice(0, 300)).toBeLessThan(300)
  })
})
