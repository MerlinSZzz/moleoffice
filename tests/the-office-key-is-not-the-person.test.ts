// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S KEY IS THE OFFICE, AND IT IS NEVER THE PERSON. Criterion P83 point 5, and C3 of the
 * piece that sends it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS DRIVES A DOOR AND NOT A ROW
 * ---------------------------------------------------------------------------------------
 *
 * `onlyThePersonMay` reads the key and the window through `thePersonIsProved`: a stated person from
 * this machine with no key is covered by the one-version window, and a proof that is not the
 * person's — the office's included — is refused before the window is ever consulted. The door this
 * file drives is the person's press that trusts a machine, which is reachable from this machine and
 * consults that one question unconditionally.
 *
 * The control and the keyed case are the same request over the same real listener, so the only
 * difference is whose key is attached. Nothing here reads, prints or asserts on a real key: the key
 * file is written by this test with a made-up office value.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control)
 * ---------------------------------------------------------------------------------------
 *
 * In src/server/lib/keys.ts, delete `if (keysMatch(presented, keys.office)) return
 * { how: 'the-office-key', whoseId: THE_OFFICE }`. The office's made-up key is then unrecognised,
 * proves nothing, and the keyed press is accepted by the window — this file goes red. Restoring the
 * line turns it green.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The person's headers, exactly what the window is about. No key yet. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** The made-up office value this test's key file holds. Never the office's real key. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

let t: TestDb
let app: FastifyInstance
let door: string

interface Answer {
  status: number
  ok: boolean
  error: string
}

/** The person's own press: trusting a machine. It asks `thePersonIsProved` and nothing else. */
async function trustAMachine(headers: Record<string, string>, address: string): Promise<Answer> {
  const res = await fetch(`${door}/api/office/trusted-machines`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ address, note: 'a made-up address for this test' }),
  })
  const body = (await res.json()) as { error?: string }
  return { status: res.status, ok: res.ok, error: body.error ?? '' }
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the office’s key is not the person', () => {
  it('the person’s press from this machine and no key is covered by the window', async () => {
    const done = await trustAMachine(THE_PERSON, '198.51.100.41')
    expect(done.ok, `the window refused the control: ${String(done.status)} ${done.error}`).toBe(true)
  })

  it('the same press with the office’s key is refused, because a key left the window path', async () => {
    const refused = await trustAMachine(
      { ...THE_PERSON, 'x-mole-office-key': A_MADE_UP_OFFICE_KEY },
      '198.51.100.42',
    )
    expect(refused.status, `the office key pressed the person’s act: ${doneWords(refused)}`).toBe(403)
    expect(refused.error.length, 'the refusal carried no sentence').toBeGreaterThan(0)
  })
})

/** A failure line with the status and never a key value. */
function doneWords(answer: Answer): string {
  return `${String(answer.status)} ${answer.error}`.slice(0, 200)
}
