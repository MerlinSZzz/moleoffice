// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NAME THAT MEANS TWO AGENTS IS TOLD THAT IT MEANS TWO AGENTS, AND NOT TOLD THAT NOTHING IS REGISTERED.
 *
 * ---------------------------------------------------------------------------------------
 * THE DOOR, AND THE DECISION THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 * `whyAnUnregisteredAgentMayNotWrite` in src/server/lib/records/unregistered-agent.ts refuses a record write under an
 * agent id no registry row holds (problem `tClP6DIMlOpz`, 16 September 2026). It asks
 * `participantForActor`, and since piece I-1 that reader gives TWO different answers:
 *
 *   NULL where nothing bears the name — a real answer, and the door's own 403 follows it.
 *   A RAISED 409 where the name is one agent's id and another live agent's handle.
 *
 * Piece I-3b owns this file and had to decide what the door says for the second. It lets the refusal
 * through rather than turning it into its own sentence, for two reasons, and this file holds both:
 *
 *   THE DOOR'S OWN SENTENCE WOULD BE FALSE. It says *nothing is registered as the agent "X"* when
 *   two things are. A refusal that stops the right write for a reason that is not true is the
 *   failure this whole cluster exists to prevent — invariant 2 and invariant 5.
 *
 *   AND ONE FACT IS ANSWERED IN ONE PLACE. `whyAReferenceNamesTwoAgents` in lib/participants.ts
 *   already names both agents, says what state each is in, and gives the id to send instead.
 *   Writing a second sentence about that here would be invariant 9's defect.
 *
 * IT CANNOT FIRE ON MAIN TODAY. Every handle is unique across every row until piece I-2 frees one,
 * and all 370 legacy ids equal their handles, so no string is both. The collision is built here
 * rather than waited for, which is what makes the behaviour provable before the day it matters.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL SOCKET, AND WHY A PATCH RATHER THAN A POST
 * ---------------------------------------------------------------------------------------
 *
 * THE RULE READS `actor.from`, which the listener that accepted the connection writes. An injected
 * request is on no socket, so the rule does not apply to it and a test using one would prove nothing
 * about the caller the rule is about. tests/a-write-under-an-unregistered-agent-id-is-refused.test.ts
 * says the same and this follows it.
 *
 * AND THE WRITE IS A PATCH, MEASURED RATHER THAN ASSUMED. `POST /api/records` is on
 * `THE_REGISTRATION_DOORS`, so `refuseAnUnregisteredAgentOnAWrite` in lib/http.ts steps aside for it
 * and this rule is not what answers such a request — a first draft of this file used a POST, and the
 * mutation below did not turn it red, which is how that was found. An ordinary `PATCH
 * /api/records/:id` is not a registration door, so the rule is asked and its answer is what the
 * caller reads.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   wrap the `participantForActor` call in `whyAnUnregisteredAgentMayNotWrite` in a try that
 *     swallows the refusal — the first case below goes red, because the caller is then told that
 *     nothing is registered under a name two agents answer to.
 */

import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let base = ''

/** The retired agent. It registered before the mint, so the string `quill` IS its id. */
const RETIRED = { id: 'quill', handle: 'quill-the-first', name: 'Quill' }
/** The agent that took the freed name afterwards, and was given an id of its own. */
const LIVE = { id: 'Qq8wR4nLc1Vx', handle: 'quill', name: 'Quill Two' }

const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

function insertAgent(who: { id: string; handle: string; name: string }, retired: boolean): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${who.id}`, '2026-09-16 10:00:00')
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) VALUES (?,?,?,?,?,?,?)',
    )
    .run(
      who.id,
      who.name,
      who.handle,
      `avatar-default-agent-${who.id}`,
      retired ? 1 : 0,
      retired ? '2026-09-10 14:00:00' : null,
      '2026-09-16 10:00:00',
    )
}

/** An ordinary write over a real socket: a PATCH, which is not a registration door. */
async function write(words: string, headers: Record<string, string>): Promise<{ code: number; said: string }> {
  const res = await fetch(`${base}/api/records/${aNote}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ summary: words }),
  })
  return { code: res.status, said: await res.text() }
}

/** The note every write below is aimed at, filed by the person before any of them. */
let aNote = ''

beforeAll(async () => {
  t = await freshDb()
  insertAgent(RETIRED, true)
  insertAgent(LIVE, false)
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
    },
    payload: { kind: 'note', title: 'A note every write below is aimed at', data: { body: 'the person\'s own' } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  aNote = (filed.json() as { record: { id: string } }).record.id
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the door that refuses an unregistered agent id tells an absence from an ambiguity', () => {
  it('answers the resolver’s refusal for a name two agents answer to, naming both and the id to send', async () => {
    const refused = await write('changed under a name that means two agents', asAgent('quill'))

    expect(refused.code, 'an ambiguous name was answered as an ordinary refusal').toBe(409)
    expect(refused.said).toContain('names two agents')
    expect(refused.said, 'the refusal does not name the agent whose id it is').toContain(RETIRED.name)
    expect(refused.said, 'the refusal does not name the agent whose handle it is').toContain(LIVE.name)
    expect(refused.said, 'the refusal does not say which id to send instead').toContain(LIVE.id)
    expect(
      refused.said,
      'the caller was told nothing is registered under a name two things are registered under',
    ).not.toContain('Nothing is registered as the agent')
  })

  it('still answers its own refusal for a name nothing bears, so it was not widened into uselessness', async () => {
    const unknown = 'claude-code/nobody-registered-this-one'
    const refused = await write('changed by nobody', asAgent(unknown))

    expect(refused.code, 'a write under an id no registry holds was accepted').toBe(403)
    expect(refused.said).toContain('Nothing is registered as the agent')
    expect(refused.said).toContain(unknown)
  })

  it('lets the live agent write under the name that means only itself, which is its minted id', async () => {
    const live = await write('changed by the agent that holds the name now', asAgent(LIVE.id))
    expect(live.code, live.said).toBe(200)
  })

  it('cannot be got round by sending the retired agent’s id, because its id IS the ambiguous string', async () => {
    // THE ONE BOUNDED COST A DECISION ACCEPTED, and it belongs to piece I-1 rather
    // than to this one: a legacy agent's id is its old handle, so once a live agent bears that
    // handle there is no string left that means the retired one. The resolver's sentence says so
    // rather than offering an id that would be refused again, and this pins that it stays said.
    const refused = await write('changed by the agent that held it before', asAgent(RETIRED.id))

    expect(refused.code, 'the ambiguous string was accepted when sent as the retired agent’s id').toBe(409)
    // The body is JSON, so the quotation marks inside the sentence arrive escaped; the two halves
    // either side of them are matched rather than the escaping being written out here.
    expect(refused.said, 'the refusal does not say why no name can mean the retired agent').toContain(
      `The id of ${RETIRED.name} is`,
    )
    expect(refused.said).toContain(`itself, so a name alone cannot mean ${RETIRED.name}`)
  })

  it('lets the declared writers no registry row holds go on writing', async () => {
    // `AGENT_IDS_THAT_NEED_NO_REGISTRATION` is the list, and the door reads it before it asks the
    // registry anything. Two of them are driven here; the list itself is held by
    // tests/a-write-under-an-unregistered-agent-id-is-refused.test.ts.
    for (const who of ['mole-office/the-message-worker', 'claude-code']) {
      const wrote = await write(`changed by ${who}`, asAgent(who))
      expect(wrote.code, wrote.said).toBe(200)
    }
  })
})
