// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old kind count was 28. sealed_tip adds submitted evidence as the twenty-ninth kind; it adds no attachment kind. The attachment exclusion remains. */
/**
 * THE ATTACHMENT'S OWN FACTS ARE DECLARED KEYS ON THE `session` RECORD, AND THERE IS NO NEW KIND.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN ATTACHMENT IS
 * ---------------------------------------------------------------------------------------
 *
 * One period in which one provider session took part as one durable agent. It has an opening
 * moment, an ending moment and a reason for the end. Round ten's addendum two, section 2:
 * *"A temporary attachment represents one period in which a provider session is actively
 * participating as that Agent."*
 *
 * It is the `session` record. Not a new record kind, not a new table, and
 * `agent-coordination.md` §A2.1 says why in five words: *"This is a rename of an idea, not a new
 * table."*
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TEST IS A WRITE AND NOT A LOOK AT THE DECLARATION
 * ---------------------------------------------------------------------------------------
 *
 * `checkUnknownKeys` in src/shared/kinds.ts REFUSES a key no field declares. So a key that is not
 * declared is not "stored somewhere else" — the whole write is refused, and every hook and route
 * that tried to write an attachment would be answered with an error. Sending the eight keys
 * through `POST /api/records` and reading them back is therefore the only check that proves the
 * declaration does the job it exists for.
 *
 * THE MUTATION: delete any one of the eight FieldSpecs from `KIND_SPECS.session` and the first
 * test goes red with the validator's own words about that key.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { CLOSED_HOW } from '../src/shared/lifecycle.ts'

let t: TestDb
let app: FastifyInstance

const HEADERS = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'lifecycle-test',
} as const

/** Every fact an attachment knows about itself, in one record, as a route would send them. */
const AN_ATTACHMENT = {
  state: 'running',
  runtime: 'claude-code',
  providerSession: '3dea5df5-87ba-492f-82e7-454e48c9bd0e',
  machine: 'sisyphus',
  workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
  workspace: 'panelx',
  terminal: 'baseline:@15.%44',
  parentAttachment: 'r7K2mQ1xBvNa',
  closedAt: '2026-08-27 18:40:00',
  closedBecause: 'The agent said this period of participation was over.',
  closedHow: 'agent-said',
} as const

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a session record carries the attachment it is', () => {
  it('accepts all eight of the attachment keys and hands every one of them back', async () => {
    // THE PARENT IS A REAL SESSION THIS CALLER FILED. It was the example id of the declaration, which names no session,
    // until the records door began refusing a parent the caller has no part in (problem NlOyicZP_Jjt).
    const parent = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HEADERS,
      payload: { kind: 'session', title: 'the attachment that started this one', data: { state: 'running' } },
    })
    expect(parent.statusCode, parent.body).toBe(201)
    const attachment = { ...AN_ATTACHMENT, parentAttachment: String(JSON.parse(parent.body).record.id) }
    const written = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HEADERS,
      payload: { kind: 'session', title: 'an attachment', data: attachment },
    })
    expect(written.statusCode, written.body).toBe(201)

    const id = JSON.parse(written.body).record.id
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HEADERS })
    const data = JSON.parse(read.body).record.data

    for (const key of [
      'providerSession',
      'machine',
      'workingDirectory',
      'terminal',
      'parentAttachment',
      'closedAt',
      'closedBecause',
      'closedHow',
    ] as const) {
      expect(data[key], `${key} did not survive the write door`).toBe(attachment[key])
    }
    // And nothing was quietly parked in the open bag, which is what happens to a key nobody
    // declared once somebody relaxes the refusal.
    expect(data['extra'], 'an attachment fact was stored in `extra` rather than as itself').toBeUndefined()
  })

  it('refuses a close word that is not one of the five, and says what the five are', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HEADERS,
      payload: {
        kind: 'session',
        title: 'closed somehow',
        data: { state: 'finished', closedAt: '2026-08-27 18:40:00', closedBecause: 'it ended', closedHow: 'killed' },
      },
    })
    expect(res.statusCode).toBe(400)
    for (const word of CLOSED_HOW) expect(res.body).toContain(word)
  })

})


