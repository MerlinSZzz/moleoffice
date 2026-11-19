// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE OFFICE'S OWN PROCESSES LEAVE THE SETTINGS LIST OF HEADER-ONLY CALLERS. Criterion P83 point 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE LIST IS, AND WHAT THIS MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * For one version a request that carries the actor headers and no key still counts from this
 * machine, and every such request is folded into `header_only_calls`, which the Settings page draws
 * so the person can see who still needs a key before the window closes. An office process that
 * holds the office's key is not a header-only caller and must not appear.
 *
 * The message worker is driven for real, twice. The first pass reads a key file this test wrote and
 * must leave no row for the worker. The second pass reads no key file at all and must leave a row,
 * which is what proves the list would have caught the missing key rather than the test measuring an
 * empty table. Nothing here reads, prints or asserts on a real key.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control)
 * ---------------------------------------------------------------------------------------
 *
 * In src/worker/index.ts, delete the `...{ [KEY_HEADER]: office.key }` line from `ask`. The first
 * pass then folds the worker into `header_only_calls` and the first case goes red. Restoring the
 * line turns it green.
 */

import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

/** The made-up office value this test's key file holds. Never the office's real key. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

let t: TestDb
let app: FastifyInstance
let api: string
let scratch: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

function headerOnlyCalls(): { actor_id: string; calls: number }[] {
  return t.client.sqlite
    .prepare(
      'SELECT actor_id, calls FROM header_only_calls ' +
        "WHERE actor_id = 'mole-office/the-message-worker' ORDER BY actor_id",
    )
    .all() as { actor_id: string; calls: number }[]
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
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-office-key-list-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: CHECKOUT,
    runs: 1,
    hops: 1,
    outputRoot: join(scratch, 'runs'),
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_DB: t.file },
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe('the office’s own calls leave the header-only list', () => {
  it('a pass that reads the office’s key leaves no row for the worker', async () => {
    await onePass(settings, watching)
    expect(headerOnlyCalls(), 'the worker still appears as a header-only caller while it holds the key').toEqual([])
  }, 60_000)

  it('a pass with no key file at all does leave a row, so the first case measures something', async () => {
    // THE KEY FILE IS TAKEN AWAY, which is the state before the office has run once. The server has
    // already read and kept its key, but the worker reads the file fresh and finds nothing.
    unlinkSync(join(dirname(t.file), 'keys.json'))
    await onePass(settings, watching)
    const rows = headerOnlyCalls()
    expect(rows.length, 'a keyless pass left no row, so the empty table above proved nothing').toBeGreaterThan(0)
    expect(rows[0]?.calls, 'the keyless pass was not counted').toBeGreaterThan(0)
  }, 60_000)
})
