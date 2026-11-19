// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESIDENCY PROPOSAL IS SETTLED ONLY BY ITS OWN TWO PRESSES, CONFIRM AND NOT NOW.
 *
 * A decision and answer 4 of the proposal GsGFiDygATd5 say that confirming a resident makes its
 * personal space in the same act. A generic way of settling a fork would write a decision and
 * make no space, so each one refuses a residency
 * proposal before anything is written (`assertMaySettleFork` in src/server/lib/records.ts), and the generic fork band
 * does not draw one (`readForks` in src/server/lib/forks.ts). Every name and value is made up.
 *
 * WHAT IS PROVED HERE:
 *   1. the person's promote, a decision filed with a link to it, POST /api/links, and choosing again on its decision
 *      are each refused, naming Confirm and Not now, and nothing is written;
 *   2. it is not among the open forks of GET /api/forks; GET /api/waiting counts it once, as its own kind with its own
 *      verb (a residency proposal, confirm or not now), never as a generic fork to settle;
 *   3. its own Confirm still settles it, and makes the space.
 *
 * MUTATIONS (each after a green control run, then restored), named in the report that proposes this change.
 */

import type { FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function inject(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; json: Record<string, any>; text: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, any> = {}
  try {
    json = reply.json() as Record<string, any>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

const count = (sql: string): number => (t.client.sqlite.prepare(sql).get() as { n: number }).n
let proposal = ''
let agentId = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const secretary = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'sec-own-doors', name: 'sec-own-doors', role: 'secretary' })
  expect(secretary.status, secretary.text).toBe(201)
  const agent = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'res-own-doors', name: 'res-own-doors', role: 'worker' })
  expect(agent.status, agent.text).toBe(201)
  agentId = String(agent.json['agent'].id)
  const proposed = await inject(
    'POST',
    '/api/residents/proposals',
    { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'sec-own-doors', 'x-mole-office-key': String(secretary.json['whatToGiveIt'].key) },
    { agentId: 'res-own-doors', because: 'A made-up reason.' },
  )
  expect(proposed.status, proposed.text).toBe(201)
  proposal = String(proposed.json['proposal'].id)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a residency proposal', () => {
  it('1: is refused by every generic way of settling a fork, and nothing is written', async () => {
    const records = count('SELECT count(*) AS n FROM records')
    const links = count('SELECT count(*) AS n FROM links')
    const promoted = await inject('POST', `/api/records/${proposal}/promote`, AS_THE_PERSON, { title: 'Settled by the generic door' })
    expect(promoted.status, promoted.text).toBe(409)
    expect(promoted.json['code']).toBe('residentProposalHasItsOwnDoors')
    expect(String(promoted.json['error'])).toContain('Confirm and Not now')
    const filed = await inject('POST', '/api/records', AS_THE_PERSON, {
      kind: 'decision',
      title: 'A decision filed straight at it',
      data: { replaces: [] },
      links: [{ type: 'derived_from', toId: proposal }],
    })
    expect(filed.status, filed.text).toBe(409)
    expect(count('SELECT count(*) AS n FROM records')).toBe(records)
    // A DECISION THAT EXISTS, pointed at it by POST /api/links.
    const other = await inject('POST', '/api/records', AS_THE_PERSON, { kind: 'decision', title: 'An unrelated decision', data: { replaces: [] } })
    expect(other.status, other.text).toBe(201)
    const linked = await inject('POST', '/api/links', AS_THE_PERSON, { fromId: other.json['record'].id, toId: proposal, type: 'derived_from' })
    expect(linked.status, linked.text).toBe(409)
    expect(count('SELECT count(*) AS n FROM links')).toBe(links)
  })

  it('2: is not among the open forks, and waits on the person as its own kind, never as a generic fork', async () => {
    const forks = await inject('GET', '/api/forks', AS_THE_PERSON)
    expect(forks.status, forks.text).toBe(200)
    expect((forks.json['forks'] as { recordId: string }[]).map((one) => one.recordId)).not.toContain(proposal)
    const waiting = await inject('GET', '/api/waiting', AS_THE_PERSON)
    expect(waiting.status, waiting.text).toBe(200)
    // IT STILL WAITS ON THE PERSON, so every count of what waits on the person counts it (wave 13r round 4: Needs you said 0 while two
    // proposals waited). Once, as a residency proposal whose verb is its own two presses, and never as a fork to settle.
    const rows = (waiting.json['items'] as { id: string; kind: string; act: string; tier: string }[]).filter((one) => one.id === proposal)
    expect(rows).toEqual([expect.objectContaining({ kind: 'residency proposal', act: 'confirm-resident', tier: 'settle' })])
  })

  it('3: its own Confirm settles it and makes the space, and choosing again on that decision is refused', async () => {
    const confirmed = await inject('POST', `/api/residents/proposals/${proposal}/confirm`, AS_THE_PERSON)
    expect(confirmed.status, confirmed.text).toBe(200)
    expect(existsSync(join(dirname(t.file), 'personal-spaces', agentId))).toBe(true)
    const records = count('SELECT count(*) AS n FROM records')
    const again = await inject('POST', `/api/records/${String(confirmed.json['decision'].id)}/choose-again`, AS_THE_PERSON, { title: 'Chosen again by the generic door' })
    expect(again.status, again.text).toBe(409)
    expect(again.json['code']).toBe('residentProposalHasItsOwnDoors')
    expect(count('SELECT count(*) AS n FROM records')).toBe(records)
  })
})
