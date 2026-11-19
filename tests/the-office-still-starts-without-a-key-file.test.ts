// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * AN OFFICE WITH NO KEY FILE STILL WORKS, AND ITS OWN PROCESS MAKES THE SAME REQUEST AS BEFORE.
 * Criterion P83 point 5, and the rule that keeps the office startable.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DRIVEN
 * ---------------------------------------------------------------------------------------
 *
 * The message worker is driven for real, twice. Once with no key file at all — the state before the
 * office has run once — and once with a file that holds no office value. In both, onePass must
 * resolve rather than throw, the office must answer, and the worker's calls must carry no key: they
 * are the same header-only requests they were before this piece. A reader that threw on a missing
 * file would take the worker down at startup, which is worse than an office with no keys.
 *
 * The values in the key file are made up by this test; no real key is read, printed or asserted on.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control)
 * ---------------------------------------------------------------------------------------
 *
 * In src/config/office-key.mjs, make the missing-file branch throw instead of answering null (for
 * example `throw new Error(says)` in place of the `return`). onePass then rejects and this file goes
 * red. Restoring the return turns it green.
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

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

let t: TestDb
let app: FastifyInstance
let api: string
let scratch: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const keyFilePath = (): string => join(dirname(t.file), 'keys.json')

/** What the office filed for the worker's own requests, read after a pass. */
function identitySources(): string[] {
  return (
    t.client.sqlite
      .prepare(
        'SELECT identity_source FROM api_calls ' +
          "WHERE actor_id = 'mole-office/the-message-worker' ORDER BY at_ms ASC",
      )
      .all() as { identity_source: string }[]
  ).map((row) => row.identity_source)
}

beforeAll(async () => {
  t = await freshDb()
  // A VALID FILE FIRST, so the office starts and keeps a key in memory. Each case below takes the
  // file away or spoils it after that, which is the state the worker reads.
  writeFileSync(
    keyFilePath(),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-no-key-'))
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

describe('an office with no key file', () => {
  it('drives the worker, answers every request, and sends no key', async () => {
    unlinkSync(keyFilePath())
    await expect(onePass(settings, watching)).resolves.toBeDefined()
    const sources = identitySources()
    expect(sources.length, 'the worker made no call, so nothing was measured').toBeGreaterThan(0)
    expect(sources, 'a key was sent although there is no key file').not.toContain('key')
  }, 60_000)

  it('drives the worker with a file that holds no office value, and sends no key', async () => {
    writeFileSync(
      keyFilePath(),
      `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, providers: {} }, null, 2)}\n`,
      { mode: 0o600 },
    )
    await expect(onePass(settings, watching)).resolves.toBeDefined()
    const sources = identitySources()
    expect(sources.length, 'the worker made no call, so nothing was measured').toBeGreaterThan(0)
    expect(sources, 'a key was sent although the file names no office key').not.toContain('key')
  }, 60_000)
})
