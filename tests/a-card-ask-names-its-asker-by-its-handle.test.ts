// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARD ASK WAITING ON THE PERSON NAMES ITS ASKER BY ITS OFFICE NAME.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROTECTS
 * ---------------------------------------------------------------------------------------
 *
 * A session that registers itself and asks for a card files a role request answered by the person.
 * Its `asker` is stored as the new agent's registry id (wave 13b), and since the mint
 * (criterion I1 of design/agents/IDENTITY-ACCEPTANCE.md) that id is twelve characters nobody chose.
 * Two sentences the person reads name the asker: the "Waiting on you" door (GET /api/needs-you) and
 * the waiting reading (GET /api/waiting), and the press that grants the card answers with the asker
 * and a sentence about it. Each names the agent by its office name, and shows the
 * unregistered-agent word where no single registry row answers it. The answer's `agent` field
 * stays the handle, and the stored fields are unchanged.
 *
 * THE ASK ON THE ASKER'S OWN PAGE names the asker too. GET /api/participants/agent/:id/profile carries
 * the request sentence in `says` and the name its press reads in `name`; the page's failure and done
 * sentences read that name. An older ask that stores the asker's handle is still found through the
 * one agent that handle names, and a registry row whose office name is blank reads as its handle.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   Print the handle in either sentence again, answer the grant with it, or return the handle as
 *   the profile card ask's name and sentence, and that case fails: it names the handle where the
 *   office name belongs, or the office name where the handle field belongs. Stop reading the stored
 *   handle where a row's office name is blank, and the fallback case fails.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let here: string
let askId: string
let mintedId: string

const HANDLE = 'asks-for-a-card'
const NAME = 'Asks For A Card'
// A MADE-UP PERSON KEY, sent with the registration: a new handle whose request proves nobody waits for
// the owner's press (decision Nc9QRT9R_IvF), and this file is about an ask made by an agent admitted at once.
const PERSON_KEY = randomBytes(32).toString('hex')
const AS_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url, headers: AS_PERSON })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Record<string, unknown>
}

/** Start an agent as the person, and hand back its registry id, which is not its handle. */
async function startAnAgent(handle: string, name: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_PERSON,
    payload: { handle, name },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { agent: { id: string } }).agent.id
}

/** File a waiting card ask written by `writer`, whose asker is stored as `stored`: a handle or a registry id. */
function fileACardAsk(writer: string, stored: string, title: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'role_request',
    title,
    actor: { type: 'agent', id: writer },
    data: {
      asking: 'supervisor',
      asker: { kind: 'agent', id: stored },
      answersTo: { kind: 'person', id: THE_PERSON },
      because: 'Made-up: an ask whose asker reference is set for this case.',
    },
  }).id
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  // THE SELF-REGISTRATION DOOR ANSWERS ONLY THIS MACHINE, so it is asked over a real socket.
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const res = await fetch(`${here}/api/agents/register-myself`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': HANDLE, 'x-mole-office-key': PERSON_KEY },
    body: JSON.stringify({ handle: HANDLE, name: NAME, runtime: 'codex', workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`, workArea: ['src/server'], requestedRole: 'supervisor' }),
  })
  expect(res.status, await res.clone().text()).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(HANDLE) as { id: string }
  mintedId = row.id
  expect(mintedId, 'the mint gave the agent an id of its own').not.toBe(HANDLE)
  const profile = await getJson(`/api/participants/agent/${HANDLE}/profile`)
  askId = (profile['cardAsk'] as { requestId: string }).requestId
  // THE PRECONDITION: the ask stores the asker by its registry id.
  const ask = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(askId) as { data: string }
  expect((JSON.parse(ask.data) as { asker: { id: string } }).asker.id).toBe(mintedId)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a card ask names its asker by its office name', () => {
  it('on the Waiting on you door', async () => {
    const needs = await getJson('/api/needs-you')
    const action = (needs['actions'] as { recordId: string; act: string; because: string }[]).find((one) => one.recordId === askId)
    expect(action?.act).toBe('give-card')
    expect(action?.because).toContain(`"${NAME}" was started by you`)
    expect(action?.because).not.toContain(HANDLE)
    expect(action?.because).not.toContain(mintedId)
  })

  it('in the waiting reading', async () => {
    const waiting = await getJson('/api/waiting')
    const item = (waiting['items'] as { id: string; because: { what: string } }[]).find((one) => one.id === askId)
    expect(item, 'the ask is in the waiting reading').toBeDefined()
    expect(item?.because.what).toContain(`"${NAME}"`)
    expect(item?.because.what).not.toContain(HANDLE)
    expect(item?.because.what).not.toContain(mintedId)
  })

  it('names the asking agent by its office name on its own page, and keeps the stored handle', async () => {
    const profile = await getJson(`/api/participants/agent/${HANDLE}/profile`)
    const cardAsk = profile['cardAsk'] as { requestId: string; handle: string; name: string; says: string }
    expect(cardAsk.requestId).toBe(askId)
    expect(cardAsk.handle, 'the profile stopped carrying the stored handle').toBe(HANDLE)
    expect(cardAsk.name, 'the profile names the asker by its handle').toBe(NAME)
    expect(cardAsk.says, 'the request sentence draws the handle').not.toContain(HANDLE)
    expect(cardAsk.says, 'the request sentence does not draw the office name').toContain(
      `"${NAME}" asks you for the supervisor card.`,
    )
    expect(cardAsk.says).not.toContain(mintedId)
  })

  it('finds an ask stored by its handle before the mint, and names it by its office name', async () => {
    await startAnAgent('older-asker', 'Older Asker')
    const request = fileACardAsk('older-asker', 'older-asker', 'older-asker asks for the supervisor card')
    const profile = await getJson('/api/participants/agent/older-asker/profile')
    const cardAsk = profile['cardAsk'] as { requestId: string; handle: string; name: string; says: string }
    expect(cardAsk.requestId).toBe(request)
    expect(cardAsk.handle, 'the profile stopped carrying the stored handle').toBe('older-asker')
    expect(cardAsk.name, 'the ask found by its stored handle was not named by its office name').toBe('Older Asker')
    expect(cardAsk.says, 'the request sentence draws the handle').not.toContain('older-asker')
    expect(cardAsk.says, 'the request sentence does not draw the office name').toContain(
      '"Older Asker" asks you for the supervisor card.',
    )
  })

  it('falls back to the stored handle where the registry row has no office name', async () => {
    const id = await startAnAgent('blank-name-asker', 'A name that will be blank')
    const request = fileACardAsk('blank-name-asker', id, 'blank-name-asker asks for the supervisor card')
    t.client.sqlite.prepare('UPDATE agents SET name = ? WHERE id = ?').run('', id)
    const profile = await getJson('/api/participants/agent/blank-name-asker/profile')
    const cardAsk = profile['cardAsk'] as { requestId: string; handle: string; name: string; says: string }
    expect(cardAsk.requestId).toBe(request)
    expect(cardAsk.handle, 'the profile stopped carrying the stored handle').toBe('blank-name-asker')
    expect(cardAsk.name, 'a blank office name did not fall back to the stored handle').toBe('blank-name-asker')
    expect(cardAsk.says, 'the request sentence does not draw the stored handle').toContain(
      '"blank-name-asker" asks you for the supervisor card.',
    )
  })

  it('in the answer of the press that grants it, which comes last because it ends the ask', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/roles/requests/${askId}/grant`, headers: AS_PERSON, payload: {} })
    expect([200, 201], res.body).toContain(res.statusCode)
    const said = res.json() as { agent: string; note: string }
    expect(said.agent).toBe(HANDLE)
    expect(said.note).toContain(`${NAME} holds the supervisor card`)
    expect(said.note).not.toContain(HANDLE)
    expect(said.note).not.toContain(mintedId)
  })
})
