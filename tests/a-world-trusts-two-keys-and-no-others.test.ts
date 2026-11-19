// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * IN A TEST WORLD, ITS STARTER'S KEY AND THE SECRETARY'S KEY ARE TRUSTED AND NOTHING ELSE.
 * Criterion P84, its last clause.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS MEASURES, WALKED
 * ---------------------------------------------------------------------------------------
 *
 * A world is started from a COPY of the office's database (tools/isolated-mole-office.mjs:
 * `const db = join(place, 'copy.db')`), and `held_keys` — the SHA-256 of every agent key and every
 * device key the office ever made — is copied with it. A world's key file is a FRESH `keys.json`
 * beside that copy (src/config/settings.mjs `keysPathFrom`), so the office's person key and office
 * key do not travel. But `heldKeyByHash` in src/server/lib/keys.ts reads the COPIED table, and
 * `howThisRequestProvedItself` trusted every row it found. So before this clause a world accepted
 * every agent key the office had ever made as proof of that agent, and a copied person's-device key
 * as proof of the person.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, EACH BY DRIVING AN ACT
 * ---------------------------------------------------------------------------------------
 *
 *   · in a world told who started it, the starter's key alone does the person's act;
 *   · the secretary's key alone does the person's act;
 *   · SOME OTHER agent's key from the copied table is refused, and the refusal names who may;
 *   · a copied person's-device key is refused, so it can no longer make the person;
 *   · the name path is untouched: naming the starter with no key still works, and a stray key does
 *     not narrow it, because the key proves nothing and the name decides;
 *   · the office, which is never a test world, still accepts the very key the world refuses.
 *
 * EVERY KEY HERE IS A MADE-UP VALUE. No real key is written, printed or asserted anywhere.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. In src/server/lib/keys.ts, make `aHeldKeyThisWorldTrusts` return true always → the world
 *      accepts the copied table again, and the other-agent, device and ordinary-write cases fail.
 *   2. Make it return false always → the starter and the secretary are refused, and the office case
 *      fails too, because the office's own key path moves with it.
 *   3. In src/server/lib/http.ts, drop `...(owners.holds ? { theOwnersAuthority: owners } : {})` from
 *      the key-only return → a trusted key no longer does the person's act, and the starter and
 *      secretary cases fail.
 *   4. In the same call, make the untrusted-key refusal fire even when actor headers were supplied →
 *      the stray-key case fails, so the name path really is left alone.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const STARTER_KEY = 'made-up-key-of-the-worlds-starter-0000'
const SECRETARY_KEY = 'made-up-key-of-the-secretary-0000'
const OTHER_KEY = 'made-up-key-of-some-other-agent-0000'
const DEVICE_KEY = 'made-up-key-of-a-persons-device-0000'

const KEY_ALONE = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** A stack whose database is the copy, with the copied held_keys and the world settings. */
async function aStack(told: { startedBy?: string; secretaries?: string }): Promise<{
  t: TestDb
  app: FastifyInstance
}> {
  const t = await freshDb()
  if (told.startedBy === undefined) delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  else process.env.MOLE_OFFICE_WORLD_STARTED_BY = told.startedBy
  if (told.secretaries === undefined) delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  else process.env.MOLE_OFFICE_WORLD_SECRETARIES = told.secretaries
  forgetTheWorldsOwnAuthority()
  // THE COPIED TABLE. These rows are what a world inherits when its database is copied.
  const keys = await import('../src/server/lib/keys.ts')
  keys.holdTheKeyWhoseHashIs('agent', 'builder-pb', keys.keyHash(STARTER_KEY), null)
  keys.holdTheKeyWhoseHashIs('agent', THE_TEST_OFFICES_SECRETARY.handle, keys.keyHash(SECRETARY_KEY), null)
  keys.holdTheKeyWhoseHashIs('agent', 'some-other-agent', keys.keyHash(OTHER_KEY), null)
  keys.holdTheKeyWhoseHashIs('person-device', 'a-device', keys.keyHash(DEVICE_KEY), null)
  const app = (await apiApp()).app
  await app.ready()
  return { t, app }
}

interface Answer {
  status: number
  error: string
  recordId: string
}

async function ask(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  payload: Record<string, unknown> | undefined,
  headers: Record<string, string>,
): Promise<Answer> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  const body = reply.json() as { record?: { id?: string }; error?: string }
  return { status: reply.statusCode, error: body.error ?? '', recordId: body.record?.id ?? '' }
}

/** The person's own act, used here because it is refused to every agent by name in the office. */
function thePersonsAct(app: FastifyInstance, key: string, address: string): Promise<Answer> {
  return ask(app, 'POST', '/api/office/trusted-machines', { address }, { ...KEY_ALONE, 'x-mole-office-key': key })
}

function actorOn(t: TestDb, recordId: string): { type: string; id: string } | undefined {
  return t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(recordId) as { type: string; id: string } | undefined
}

// ============================================================ 1. a world trusts exactly two keys

describe(`a world started by builder-pb, copied from an office whose secretary is ${THE_TEST_OFFICES_SECRETARY.handle}`, () => {
  let stack: { t: TestDb; app: FastifyInstance }

  beforeAll(async () => {
    stack = await aStack({ startedBy: 'builder-pb', secretaries: THE_TEST_OFFICES_SECRETARY.handle })
  })

  afterAll(async () => {
    await stack.app.close()
    stack.t.close()
    delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
    delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
    forgetTheWorldsOwnAuthority()
  })

  it('lets the starter’s key do the person’s act', async () => {
    const said = await thePersonsAct(stack.app, STARTER_KEY, 'loquat')
    expect(said.status, JSON.stringify(said).slice(0, 300)).toBeLessThan(300)
  })

  it('lets the secretary’s key do the person’s act', async () => {
    const said = await thePersonsAct(stack.app, SECRETARY_KEY, 'a-second-machine')
    expect(said.status, JSON.stringify(said).slice(0, 300)).toBeLessThan(300)
  })

  it('refuses another agent’s copied key, and the refusal names who may', async () => {
    const said = await thePersonsAct(stack.app, OTHER_KEY, 'a-third-machine')
    expect(said.status, JSON.stringify(said).slice(0, 300)).toBe(403)
    const why = said.error
    expect(why, 'it names the holder of the refused key').toContain('some-other-agent')
    expect(why, 'it says nothing was written').toContain('Nothing was written')
    expect(why, 'it names the starter').toContain('builder-pb')
    expect(why, 'it names the secretary').toContain(THE_TEST_OFFICES_SECRETARY.handle)
    expect(why, 'it never carries the key’s bytes').not.toContain(OTHER_KEY)
  })

  it('refuses a copied device key, which can no longer make the person', async () => {
    const said = await thePersonsAct(stack.app, DEVICE_KEY, 'a-fourth-machine')
    expect(said.status, JSON.stringify(said).slice(0, 300)).toBe(403)
    expect(said.error, 'it names the holder of the device key').toContain('a-device')
    expect(said.error, 'it says nothing was written').toContain('Nothing was written')
  })

  it('does not accept another agent’s key as proof of that agent on an ordinary write', async () => {
    const wrote = await ask(
      stack.app,
      'POST',
      '/api/records',
      { kind: 'note', title: 'A note the world must not attribute to a copied key', data: { body: 'x' } },
      { ...KEY_ALONE, 'x-mole-office-key': OTHER_KEY },
    )
    expect(wrote.status, 'the copied key proved that agent anyway').toBe(403)
    const rows = stack.t.client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM records WHERE title = ?')
      .get('A note the world must not attribute to a copied key') as { n: number }
    expect(rows.n, 'nothing was written').toBe(0)
  })

  it('keeps the name path: the starter by name and no key still does the person’s act', async () => {
    const said = await ask(stack.app, 'POST', '/api/office/trusted-machines', { address: 'a-fifth-machine' }, asAgent('builder-pb'))
    expect(said.status, JSON.stringify(said).slice(0, 300)).toBeLessThan(300)
  })

  it('does not narrow the name path: a stray key proves nothing, so the name decides', async () => {
    const said = await ask(
      stack.app,
      'POST',
      '/api/office/trusted-machines',
      { address: 'a-sixth-machine' },
      { ...asAgent('builder-pb'), 'x-mole-office-key': OTHER_KEY },
    )
    expect(said.status, JSON.stringify(said).slice(0, 300)).toBeLessThan(300)
  })
})

// ============================================================ 2. the office is never a test world

describe('the office, which is never a test world', () => {
  let stack: { t: TestDb; app: FastifyInstance }

  beforeAll(async () => {
    stack = await aStack({})
  })

  afterAll(async () => {
    await stack.app.close()
    stack.t.close()
    delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
    delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
    forgetTheWorldsOwnAuthority()
  })

  it('still lets another agent’s key prove that agent, exactly as before', async () => {
    const wrote = await ask(
      stack.app,
      'POST',
      '/api/records',
      { kind: 'note', title: 'A note the office attributes to the key that wrote it', data: { body: 'x' } },
      { ...KEY_ALONE, 'x-mole-office-key': OTHER_KEY },
    )
    expect(wrote.status, JSON.stringify(wrote).slice(0, 400)).toBe(201)
    expect(actorOn(stack.t, wrote.recordId), 'the key proved its holder in the office').toEqual({
      type: 'agent',
      id: 'some-other-agent',
    })
  })

  it('still lets a device key do the person’s act, exactly as before', async () => {
    const said = await thePersonsAct(stack.app, DEVICE_KEY, 'loquat')
    expect(said.status, JSON.stringify(said).slice(0, 300)).toBeLessThan(300)
  })

  it('still refuses an agent the person’s act by name, with the office’s own sentence', async () => {
    const said = await ask(stack.app, 'POST', '/api/office/trusted-machines', { address: 'a-seventh-machine' }, asAgent('builder-pb'))
    expect(said.status).toBe(403)
    expect(said.error, 'the office sentence, not a test-world one').toContain('An agent is never the person.')
    expect(said.error).not.toContain('test world')
  })
})
