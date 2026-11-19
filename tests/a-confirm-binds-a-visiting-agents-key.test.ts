// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONFIRM PRESS BINDS THE VISITING AGENT'S KEY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The visitor flow plan J_RIKvfdVUMn, piece 1: the bind at the confirm press stops being
 * device-only. An agent credential confirmed today holds a live `held_keys` row
 * immediately — an agent-kind key whose hash is the token's own SHA-256 — without a server restart,
 * and the same token then proves that agent on x-mole-office-key. The one-off startup pass
 * (giveAlreadyConfirmedCredentialsTheirKeysOnce, src/server/lib/visitors.ts) is left as the
 * one-off catch-up it says it is.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A RESTART IS NOWHERE IN THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * The defect this guards against was measured real on the live office: until this fix the confirm
 * bound a key only for a person's device, so a credential confirmed today held no key until the
 * office was next restarted — at which point the startup pass bound one, and a test that restarted
 * would report success without the fix ever having been in place. The control is the fresh confirm
 * in the fresh database this file drives. The harness never runs the startup pass.
 *
 * ---------------------------------------------------------------------------------------
 * NO SECRET REACHES ANY OUTPUT
 * ---------------------------------------------------------------------------------------
 *
 * The token is taken out of the ask door's 201 reply into a local variable and replayed as a
 * header, the way tests/a-visiting-agent-holds-its-own-credential.test.ts does. It is compared
 * through its SHA-256 only and is never printed, logged, asserted into a message, or written into
 * any file. Nothing here names a secret in a description or an assertion message.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { KEY_HEADER } from '../src/config/key-header.mjs'

let t: TestDb
let app: FastifyInstance
/** The two doors, as base URLs, as the credential test file names them. */
let thisMachine: string
let loquat: string
const extraDoors: Server[] = []

async function open(server: Server): Promise<string> {
  extraDoors.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { stampArrival } = await import('../src/server/lib/http.ts')
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  loquat = await open(
    createServer((raw, res) => {
      stampArrival(raw, 'another machine', 'the caller')
      app.routing(raw, res)
    }),
  )
})

afterAll(async () => {
  for (const server of extraDoors) await new Promise<void>((resolve) => server.close(() => resolve()))
  await app.close()
  t.close()
})

interface Answer {
  status: number
  body: Record<string, unknown>
}

async function ask(door: string, method: 'GET' | 'POST', path: string, payload?: unknown, headers: Record<string, string> = {}): Promise<Answer> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** The person, as the browser sends them. */
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

/** Ask loquat's door for one agent credential, and hand back the token and the row. */
async function askForOne(handle: string): Promise<{ token: string; credential: Record<string, unknown> }> {
  const answer = await ask(loquat, 'POST', '/api/office/visitors', {
    handle,
    name: `The visitor ${handle}`,
    role: 'worker',
    conversationPath: `/transcripts/${handle}`,
    startDirectory: `/work/${handle}`,
    runtime: 'claude-code',
  })
  expect(answer.status, JSON.stringify(answer.body)).toBe(201)
  return { token: answer.body.token as string, credential: answer.body.credential as Record<string, unknown> }
}

async function confirm(id: string): Promise<Record<string, unknown>> {
  const answer = await ask(thisMachine, 'POST', `/api/office/visitors/${id}/confirm`, undefined, PERSON)
  expect(answer.status, JSON.stringify(answer.body)).toBe(200)
  return answer.body
}

interface HeldRow {
  id: string
  whose_kind: string
  whose_id: string
  key_hash: string
  revoked_at: string | null
}

/**
 * Every key row the agent with one handle holds, read from the database and not from a reply. A key is
 * kept under the agent's registry id (criterion I5), which since the mint is not its handle.
 */
function heldRowsFor(handle: string): HeldRow[] {
  return t.client.sqlite
    .prepare(
      'SELECT id, whose_kind, whose_id, key_hash, revoked_at FROM held_keys ' +
        'WHERE whose_id = (SELECT id FROM agents WHERE handle = ?)',
    )
    .all(handle) as HeldRow[]
}

/** The registry id of the agent with one handle. */
function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** Who the office attributed the newest write to one record, read off the change row the write made. */
function actorOnTheChange(recordId: string): { type: string; id: string } | undefined {
  return t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(recordId) as { type: string; id: string } | undefined
}

describe('the confirm press binds the visiting agent’s key', () => {
  it('binds a live agent key for the handle with no restart in between, and the reply names it', async () => {
    const { token, credential } = await askForOne('bind-on-confirm')
    const confirmed = await confirm(String(credential.id))

    // THE ROW IS LIVE THE MOMENT THE PRESS LANDED. No restart, no startup pass.
    const rows = heldRowsFor('bind-on-confirm')
    expect(rows.length, 'the confirm bound no key for this handle').toBe(1)
    const row = rows[0] as HeldRow
    expect(row.whose_kind).toBe('agent')
    expect(row.revoked_at).toBeNull()

    // THE HASH IS THIS TOKEN'S OWN. The token is compared through its digest and never printed.
    const digest = createHash('sha256').update(token).digest('hex')
    expect(row.key_hash).toBe(digest)

    // AND THE REPLY NAMES THE ROW, WHICH HEADER TO SEND IT ON, AND THAT ONLY THE HASH IS KEPT.
    const named = confirmed.agentKey as { id: string; says: string } | null
    expect(named).not.toBeNull()
    expect(named?.id).toBe(row.id)
    expect(String(named?.says)).toContain('x-mole-office-key')
    expect(String(named?.says)).toContain('SHA-256')
  })

  it('makes the same token prove that agent on x-mole-office-key', async () => {
    const { token, credential } = await askForOne('token-proves')
    await confirm(String(credential.id))

    // THE KEY AND NOTHING ELSE: no actor headers, so the attribution can only have come from the
    // key, the way tests/an-agent-key-is-that-agent-and-no-more.test.ts measures it.
    const wrote = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': 'default',
        'x-mole-office-key': token,
      },
      payload: { kind: 'note', title: 'Written with the credential token alone', data: { body: 'named by the key' } },
    })
    expect(wrote.statusCode, wrote.body).toBe(201)
    const recordId = (wrote.json() as { record?: { id?: string } }).record?.id ?? ''
    expect(actorOnTheChange(recordId)).toEqual({ type: 'agent', id: idOf('token-proves') })

    // AND `howThisRequestProvedItself` NAMES THE SAME AGENT, so the proof is read once.
    const keys = await import('../src/server/lib/keys.ts')
    const proof = keys.howThisRequestProvedItself({ headers: { [KEY_HEADER]: token } } as never)
    expect(proof).toEqual({ how: 'an-agent-key', whoseId: idOf('token-proves') })
  })

  it('binds nothing new on a second confirm, and names no key again', async () => {
    const { credential } = await askForOne('no-second-key')
    await confirm(String(credential.id))
    const before = heldRowsFor('no-second-key')
    expect(before.length).toBe(1)

    const again = await confirm(String(credential.id))
    expect(heldRowsFor('no-second-key')).toEqual(before)
    expect(again.agentKey ?? null).toBeNull()
  })

  it('revokes the key it bound when the credential is ended', async () => {
    const { token, credential } = await askForOne('ended-binds')
    await confirm(String(credential.id))
    expect(heldRowsFor('ended-binds')[0]?.revoked_at).toBeNull()

    const ended = await ask(thisMachine, 'POST', `/api/office/visitors/${String(credential.id)}/end`, undefined, PERSON)
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)

    // THE ROW IS KEPT AND MARKED REVOKED, never deleted, and the token proves nothing any more.
    const after = heldRowsFor('ended-binds')
    expect(after.length).toBe(1)
    expect((after[0] as HeldRow).revoked_at).not.toBeNull()
    const keys = await import('../src/server/lib/keys.ts')
    expect(
      keys.howThisRequestProvedItself({ headers: { [KEY_HEADER]: token } } as never),
    ).toBeUndefined()
  })
})
