// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AFTER THE CLOSE, A CHECK WITH NO KEY IS REFUSED EXACTLY AS ITS WRITE IS. Check cLKfi0Ix9xw6, the second gap.
 *
 * A check door declares itself a read and is gated as the write it checks (`gatedAs` in src/shared/ops.ts). Once the
 * person has closed the key window, a write that carries no key is refused by `refuseAKeylessWriteAfterTheClose` in
 * src/server/lib/http.ts. A read would instead be refused as a request nobody proved, with other words, or answered.
 * This file closes the window and asks both check doors under an agent's name with no key, over a real socket, and
 * holds each answer to the write's own, with every table counted around the check.
 *
 * The case is in its own file because closing the window would change every case in
 * tests/a-write-can-be-checked-without-writing-it.test.ts, where the other gates on the check doors are held.
 *
 * The person's key is made up and written into this test's own key file. No real key is read or printed.
 *
 * MUTATION PROOF, after a green control:
 *
 * (a) In `refuseAKeylessWriteAfterTheClose` in src/server/lib/http.ts, read `theOperationThisRouteDeclared(req)` in
 *     place of `theActThisRouteIsGatedAs(req)`. Both doors go red: the check is answered as a read, not as its write.
 */
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')

const WORKER = 'a-worker-that-checks-first'
const WORKSPACE = { 'x-mole-office-workspace': 'default' }
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const THE_WORKER = { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WORKER }

const TEXT =
  'The mount holds calibration through a full transplant. What moved was the mast, by two millimetres at the top, ' +
  'and that is enough to explain every drift the logs show since August. The fix is to stiffen the mast.'

function aReport(title: string): Record<string, unknown> {
  return {
    kind: 'report',
    title,
    data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-10-05', blocks: [{ id: 'b-1', type: 'text', heading: 'What I found', text: TEXT }] },
  }
}

let t: TestDb
let app: FastifyInstance
let thisMachine: string
/** A report filed before the close, which the short-forms doors are asked about. */
let report: string
let madeFrom: { seq: number; contentHash: string }

/** The number of rows in every table, but the two a request adds whatever it does. */
function everyTablesRows(): Record<string, number> {
  const tables = t.client.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[]
  const counts: Record<string, number> = {}
  for (const { name } of tables) {
    if (name === 'api_calls' || name === 'header_only_calls') continue
    counts[name] = (t.client.sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n
  }
  return counts
}

async function overASocket(path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${thisMachine}${path}`, {
    method: 'POST',
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
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
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  // REGISTERED WITH THE PERSON'S KEY, so the agent holds a proved key and the close is not refused for it.
  const started = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...WORKSPACE, ...PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY, 'content-type': 'application/json' },
    payload: { handle: WORKER, name: WORKER },
  })
  if (started.statusCode !== 201) throw new Error(`registering ${WORKER} answered ${String(started.statusCode)}: ${started.body}`)
  // FILED IN PROCESS, which the close does not ask about.
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers: THE_WORKER, payload: aReport('A report filed before the close') })
  if (filed.statusCode !== 201) throw new Error(`filing the report answered ${String(filed.statusCode)}: ${filed.body}`)
  const record = (filed.json() as { record: { id: string }; version: string })
  report = record.record.id
  madeFrom = { seq: 1, contentHash: record.version }

  const closed = await overASocket('/api/office/key-window/close', { ...PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY })
  if (closed.status !== 200) throw new Error(`closing the window answered ${String(closed.status)}: ${JSON.stringify(closed.body)}`)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('after the close, a check under an agent\'s name with no key', () => {
  it('is refused at both check doors exactly as the write, and writes nothing', async () => {
    const shortForms = {
      madeFrom,
      forms: {
        label: 'Mount calibration',
        parts: [{ id: 'p-1', heading: 'The mount held', text30: 'The mount held; the mast moved.', text120: 'The mount kept its calibration when it was moved; the mast moved instead.', covers: ['b-1'] }],
      },
    }
    for (const [door, body] of [
      ['/api/records', aReport('A report with no key after the close')],
      [`/api/records/${report}/short-forms`, shortForms],
    ] as const) {
      const before = everyTablesRows()
      const check = await overASocket(`${door}/check`, THE_WORKER, body)
      expect(everyTablesRows(), `${door}/check changed a table`).toEqual(before)
      const write = await overASocket(door, THE_WORKER, body)
      expect(write.status, JSON.stringify(write.body)).toBe(403)
      expect(String(write.body['error']), 'the write was refused by another gate').toContain("The key window is closed, so an agent's name counts only with that agent's own key.")
      expect.soft(check, `${door}/check`).toEqual(write)
    }
  })
})
