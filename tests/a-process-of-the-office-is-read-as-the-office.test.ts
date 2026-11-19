// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A PROCESS OF THE OFFICE MAKES A REQUEST, AND THE OFFICE READS IT AS THE OFFICE. P83 point 5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DRIVEN, AND WHAT IS READ
 * ---------------------------------------------------------------------------------------
 *
 * The message worker is one of the office's own processes. `onePass` runs it for real against a real
 * listener, and the office's own call book — `api_calls` — is then read: every request the worker
 * made under its own name must carry a key the office recognised, which is what `identity_source`
 * of `key` means. A request with the office's key leaves the one-version header window; a request
 * with only the actor headers is filed as `checked` and lands on the header-only list.
 *
 * THE KEY VALUE IS MADE UP BY THIS TEST. The key file is written here, before the server is built,
 * with an office value no office ever made. The test never reads, prints or asserts on a real key.
 * The office writes a person key and a providers section in the same file because that is the shape
 * the server reads; their values are made up too and are never used.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control)
 * ---------------------------------------------------------------------------------------
 *
 * In src/worker/index.ts, delete the `...{ [KEY_HEADER]: office.key }` line from `ask`. The worker
 * sends the actor headers and no key, the call is filed as `checked`, and this file goes red.
 * Restoring the line turns it green.
 */

import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

beforeAll(async () => {
  t = await freshDb()
  // THE KEY FILE IS WRITTEN BEFORE THE SERVER IS BUILT, because the server reads it once at first
  // run and keeps the answer in memory. This is the file a real first run would have made.
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-office-key-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: CHECKOUT,
    runs: 1,
    hops: 1,
    outputRoot: join(scratch, 'runs'),
    // THE DATABASE PATH IS THE ONE THING THAT TELLS THE READER WHICH KEY FILE TO READ. It is the
    // throwaway database this test made, never the checkout's.
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_DB: t.file },
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe('a process of the office is read as the office', () => {
  it('reads the worker’s own request as a keyed call, not a header-only claim', async () => {
    // THE DRIVE. One pass is one round of the worker's real loop; its very first act is to read the
    // runs already going, which is a request to this office under the worker's own name.
    await onePass(settings, watching)

    const calls = t.client.sqlite
      .prepare(
        'SELECT identity_source, actor_type, actor_id FROM api_calls ' +
          "WHERE actor_id = 'mole-office/the-message-worker' ORDER BY at_ms ASC",
      )
      .all() as { identity_source: string; actor_type: string; actor_id: string }[]

    expect(calls.length, 'the worker made no call under its own name, so nothing was measured').toBeGreaterThan(0)
    expect(calls[0]?.actor_type).toBe('agent')
    expect(
      calls.every((call) => call.identity_source === 'key'),
      `the office did not read every worker call as keyed: ${JSON.stringify(calls)}`,
    ).toBe(true)
  }, 60_000)
})
