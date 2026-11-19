// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AFTER THE PERSON CLOSES THE KEY WINDOW, NOTHING A CALLER WITH NO KEY WRITES IS WRITTEN AS THE OWNER'S ACT.
 * Criterion P83 point 1 and finding 82; the inspector's refusal of wave 13m, round 2
 * (check session ozoWwczc7wcT, 26 September 2026 01:39).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * After the close, `actorFrom` answered a keyless agent claim as a request that named nobody, which
 * is the person with `stated: false`. It did that on writes as well as reads. Every keyless write is
 * refused after the close except at the doors a caller uses to get a key, and one of those,
 * `POST /api/agents/register-myself`, writes a waiting row under the caller's actor. So a keyless
 * registration of "some-new-agent" was filed with the owner as the change log's actor. A registration
 * that named the person, or named nobody, was written as the owner's in the same way, with no turn needed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * One scratch office on a real loopback listener. The person's key closes the window, and then:
 *   (1) a keyless registration under an agent's name waits for the owner's press, and the change log writes
 *       the waiting row under that agent's name, never the person's;
 *   (2) a keyless registration that names the person is refused, and nothing is written;
 *   (3) a keyless registration that names nobody is refused, and nothing is written.
 * The keys are made up and written into this test's own key file. No real key is read or printed.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF, one line each, after a green control
 * ---------------------------------------------------------------------------------------
 *
 * (A) In `actorFrom`, drop the effect condition from the turn of a keyless agent claim into a request
 *     that named nobody, so it turns writes too. (1) goes red: the row is written as the owner.
 * (B) In `refuseAKeylessWriteAfterTheClose`, let every claim through the doors to a key. (2) and (3)
 *     go red: the registration is written as the person's.
 */

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const DIR = `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`

const WORKSPACE = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const asAgent = (handle: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

/** A reply shown in a failure message with every key in it replaced, so no log ever carries a key. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a key>')

let t: TestDb
let app: FastifyInstance
let here = ''

async function register(handle: string, headers: Record<string, string>): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${here}/api/agents/register-myself`, {
    method: 'POST',
    headers: { ...WORKSPACE, ...headers },
    body: JSON.stringify({ handle, name: `The agent ${handle}`, workingDirectory: DIR }),
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: res.status, json, text: hidden(text) }
}

/** Every actor the change log wrote for one record. */
function whoTheChangeLogNames(recordId: string): { actor_type: string; actor_id: string }[] {
  return t.client.sqlite
    .prepare('SELECT actor_type, actor_id FROM changes WHERE record_id = ?')
    .all(recordId) as { actor_type: string; actor_id: string }[]
}

/** How many waiting registrations name this handle. */
function waitingRowsFor(handle: string): number {
  const rows = t.client.sqlite
    .prepare("SELECT data FROM records WHERE kind = 'role_request' AND deleted_at IS NULL")
    .all() as { data: string }[]
  return rows.filter((row) => row.data.includes(`"${handle}"`)).length
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const closed = await fetch(`${here}/api/office/key-window/close`, {
    method: 'POST',
    headers: { ...PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY },
  })
  if (closed.status !== 200) throw new Error(`closing the window answered ${String(closed.status)}`)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('once the window is closed, a keyless registration', () => {
  it('(1) under an agent’s name waits, and the change log names that agent, never the person', async () => {
    const asked = await register('some-new-agent', asAgent('some-new-agent'))
    expect(asked.status, asked.text).toBe(202)
    const request = asked.json['request']
    expect(typeof request, asked.text).toBe('string')
    const named = whoTheChangeLogNames(request as string)
    expect(named.length, 'the waiting row has a change log entry').toBeGreaterThan(0)
    for (const row of named) {
      expect(row.actor_type === 'human' && row.actor_id === THE_TEST_OFFICES_OWNER.id, `the change log wrote ${row.actor_type}/${row.actor_id}`).toBe(false)
      expect(row).toEqual({ actor_type: 'agent', actor_id: 'some-new-agent' })
    }
  })

  it('(2) that names the person is refused, and nothing is written', async () => {
    const asked = await register('a-second-new-agent', PERSON)
    expect(asked.status, asked.text).toBe(403)
    expect(asked.text).toContain('x-mole-office-actor-id')
    expect(waitingRowsFor('a-second-new-agent')).toBe(0)
  })

  it('(3) that names nobody is refused, and nothing is written', async () => {
    const asked = await register('a-third-new-agent', {})
    expect(asked.status, asked.text).toBe(403)
    expect(waitingRowsFor('a-third-new-agent')).toBe(0)
  })
})
