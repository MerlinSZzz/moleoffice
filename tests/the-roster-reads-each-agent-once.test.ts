// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROSTER READS EACH ACTIVE AGENT'S RECORD AND REGISTRY ROW ONCE, NOT ONCE PER AGENT AGAIN. Wave 13k's round 31b
 * (run IcBh-emQrBQY: its message x6cAd9Ed_q0f, and block b-7 of its report 3Rf_vXK5sEq9) found Home no sooner
 * ready: readiness waits for the rosters, and their largest cost was `presenceOf`, which read the agent's record and
 * its registry row again for every agent, and the roster read the registry row once more for each row it drew. Now
 * the roster reads every active agent's registry row in one query and hands the records it already holds to
 * `presenceOf` (`recordOf` and `registeredOf` on `WhatARosterReadOnce`, src/server/lib/presence.ts).
 *
 * Measured on the made-up office of 400 agents (tests/an-office-of-the-live-shape.ts), wave 13r round 11: the largest
 * roster's server time went from 82 and 79 ms to 24 and 24 ms (median of 9, two pairs), and Home's ready time from 800
 * and 768 ms to 734 and 684 ms.
 *
 * WHAT THIS FILE HOLDS, on an office of twelve registered agents:
 *   1. Home's roster and the whole roster ask the one-agent registry query for no agent, and read no agent's record by
 *      its id;
 *   2. every row still names the registry row `agentForRecord` names, so reading once changed no answer.
 * (tests/the-roster-reads-each-run-once.test.ts already holds that every presence reading is unchanged.)
 *
 * MUTATION: take `recordOf` and `registeredOf` off the roster's shared read and the first case fails, counting the
 * one-agent reads again.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let app: BuiltServer
const AGENTS = 12

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function aWorkerCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { cards: { name: string; rung: number }[] }
  return [...said.cards].sort((a, b) => a.rung - b.rung)[0]!.name
}

/** How many statements whose text matches each pattern `run` prepares. */
function counting<T>(patterns: Record<string, RegExp>, run: () => T): { result: T; counts: Record<string, number> } {
  const sqlite = t.client.sqlite as unknown as { prepare: (source: string) => unknown }
  const original = sqlite.prepare.bind(sqlite)
  const counts = Object.fromEntries(Object.keys(patterns).map((name) => [name, 0])) as Record<string, number>
  sqlite.prepare = (source: string) => {
    for (const [name, pattern] of Object.entries(patterns)) if (pattern.test(source)) counts[name] = (counts[name] ?? 0) + 1
    return original(source)
  }
  try {
    return { result: run(), counts }
  } finally {
    sqlite.prepare = original
  }
}

const ONE_AGENT_AT_A_TIME = {
  registryRow: /FROM agent_records m JOIN agents a ON a\.id = m\.agent_id WHERE m\.record_id = \?/,
  recordById: /from "records" where "records"\."id" = \?/i,
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  const card = aWorkerCard()
  for (let i = 0; i < AGENTS; i += 1) {
    const started = await app.app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: `kiln-${String(i)}`, name: `Kiln ${String(i)}`, role: card, workArea: ['src'] },
    })
    expect(started.statusCode, started.body).toBe(201)
  }
}, 120_000)

afterAll(async () => {
  await app.app.close()
  t.close()
})

describe('the roster reads each agent once', () => {
  it('asks no one-agent registry query and reads no agent record by its id, for Home and for the whole roster', async () => {
    const working = await import('../src/server/lib/working.ts')
    const home = counting(ONE_AGENT_AT_A_TIME, () => working.theRosterHomeDraws('default'))
    expect(home.result.rows.length).toBe(AGENTS)
    expect(home.counts).toEqual({ registryRow: 0, recordById: 0 })

    const whole = counting(ONE_AGENT_AT_A_TIME, () => working.whoIsWorking('default'))
    expect(whole.counts.registryRow).toBe(0)
  })

  it('names, on every row, the registry row agentForRecord names', async () => {
    const working = await import('../src/server/lib/working.ts')
    const participants = await import('../src/server/lib/participants.ts')
    for (const row of working.theRosterHomeDraws('default').rows) {
      const one = participants.agentForRecord(row.agentId)
      expect(row.participant).toEqual(one === null ? null : { id: one.id, name: one.name, startedBy: one.startedBy })
    }
  })
})
