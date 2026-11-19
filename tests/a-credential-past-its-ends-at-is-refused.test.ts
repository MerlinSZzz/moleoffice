// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CREDENTIAL PAST ITS ends_at IS REFUSED, AND A CAMPAIGN THE OWNER ENDED SAYS SO.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The expiry clause of `whyThisCredentialMayNotWork` (src/server/lib/visitorgate.ts), on the ends_at
 * column section 3.6 of design/permissions/ACCEPTANCE.md issues ("when it expires without being
 * renewed"), and on a decision, which keeps the way in as the credential flow that
 * exists.
 *
 *   - A confirmed credential whose ends_at has passed is refused with the expiry sentence
 *     (src/shared/visitors.ts, expiredRefusal) and NOT with the ended sentence — the order of the
 *     three clauses in `whyThisCredentialMayNotWork` puts ended and pending ahead of expiry, so
 *     a credential the owner ended before its month was up says the owner ended it.
 *   - The refusal is written into visitor_requests, because visitors are to be counted and supervised: the owner sees the refused attempts
 *     as well as the answered ones.
 *   - A credential the owner ended before it ran out still names the ending, even when its ends_at is in
 *     the past by then.
 *
 * Nothing here drives the clock: the test writes an ends_at in the past directly into the row, the
 * way existing tests read and write SQLite, and drives a real request through loquat's door.
 *
 * ---------------------------------------------------------------------------------------
 * TWO REAL DOORS AND NOT ONE `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * The same shape tests/a-visiting-agent-holds-its-own-credential.test.ts uses: a visitor is an agent
 * on ANOTHER machine, and an injected request is on no socket at all, so this file opens two
 * listeners onto one built app and drives real HTTP through each. Only the loquat door carries the
 * credential in these tests.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'

let t: TestDb
let app: FastifyInstance
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
  const built = await apiApp()
  app = built.app
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

async function ask(
  door: string,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
  headers: Record<string, string> = {},
): Promise<Answer> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** The person, as the browser sends them. */
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

interface Credential {
  id: string
  handle: string
  standing: string
  endsAt: string
}

/** Ask loquat's door for a credential, confirm it, and hand back the token and the row. */
async function askedAndConfirmed(handle: string): Promise<{ token: string; credential: Credential }> {
  const asked = await ask(loquat, 'POST', '/api/office/visitors', {
    handle,
    name: `A visitor named ${handle}`,
    role: 'worker',
    conversationPath: `${THE_TEST_FIXTURE_ROOT}/.claude/projects/${handle}/aaa`,
    startDirectory: `${THE_TEST_FIXTURE_ROOT}/work/${handle}`,
    runtime: 'claude-code',
    sessionRecord: `sess-${handle}`,
  })
  expect(asked.status, JSON.stringify(asked.body)).toBe(201)
  const credential = asked.body.credential as Credential
  const confirmed = await ask(
    thisMachine,
    'POST',
    `/api/office/visitors/${credential.id}/confirm`,
    undefined,
    PERSON,
  )
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
  return { token: asked.body.token as string, credential }
}

/** The three headers a visitor sends on every request. */
function carrying(token: string, handle: string): Record<string, string> {
  return {
    'x-mole-office-credential': token,
    'x-mole-office-conversation': `${THE_TEST_FIXTURE_ROOT}/.claude/projects/${handle}/aaa`,
    'x-mole-office-start-directory': `${THE_TEST_FIXTURE_ROOT}/work/${handle}`,
  }
}

/** Write an ends_at in the past directly into the row, the way the product computes it from localStamp. */
function endTheRowInThePast(credential: Credential, daysAgo: number): string {
  const past = localStamp(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000))
  const wrote = t.client.sqlite
    .prepare('UPDATE visitor_credentials SET ends_at = ? WHERE id = ?')
    .run(past, credential.id)
  expect(wrote.changes).toBe(1)
  return past
}

/** Every row of visitor_requests for one credential, read from the database and not from a reply. */
function requestRowsFor(credentialId: string): { route: string; refused_because: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT route, refused_because FROM visitor_requests WHERE credential_id = ? ORDER BY at')
    .all(credentialId) as { route: string; refused_because: string | null }[]
}

describe('a credential past its ends_at is refused', () => {
  it('refuses a confirmed credential whose ends_at has passed with the expiry sentence, and not the ended one', async () => {
    const { token, credential } = await askedAndConfirmed('expiring-past')

    // THE ROW'S OWN ENDS_AT, WRITTEN IN THE PAST BY HAND. No code path writes one: a month is one
    // constant at issue, so nothing drives a credential past its ends_at except an edit like this.
    const past = endTheRowInThePast(credential, 1)

    const refused = await ask(loquat, 'GET', '/api/health', undefined, carrying(token, 'expiring-past'))
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    const sentence = String(refused.body.error)
    expect(sentence).toContain('ran out at')
    expect(sentence).toContain(past)
    expect(sentence).toContain(credential.id)
    // THE OTHER SENTENCE, NOT SAID. The credential was never ended, and the ended sentence names
    // different facts; a refusal that said both would be unreadable.
    expect(sentence).not.toContain('was ended')
  })

  it('writes the refusal into visitor_requests, so the refused attempts are seen too', async () => {
    const { token, credential } = await askedAndConfirmed('expiring-recorded')
    const past = endTheRowInThePast(credential, 2)

    await ask(loquat, 'GET', '/api/health', undefined, carrying(token, 'expiring-recorded'))

    const rows = requestRowsFor(credential.id)
    const refusedRows = rows.filter((row) => row.refused_because !== null)
    expect(refusedRows.length).toBeGreaterThanOrEqual(1)
    expect(refusedRows[0]?.refused_because).toContain('ran out at')
    expect(refusedRows[0]?.refused_because).toContain(past)
  })

  it('says a credential the owner ended before it ran out was ended, even with ends_at in the past', async () => {
    const { token, credential } = await askedAndConfirmed('expiring-ended')

    // THE OWNER ENDS IT WHILE IT IS STILL GOOD — and only then does its month pass. Standing wins, which
    // is the fact the owner acted on.
    const ended = await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/end`, undefined, PERSON)
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    const standing = ended.body.credential as Credential
    expect(standing.standing).toBe('ended')

    const past = endTheRowInThePast(credential, 1)

    const refused = await ask(loquat, 'GET', '/api/health', undefined, carrying(token, 'expiring-ended'))
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    const sentence = String(refused.body.error)
    expect(sentence).toContain('was ended')
    expect(sentence).toContain(credential.id)
    expect(sentence).not.toContain('ran out at')
    expect(past.length).toBeGreaterThan(0)
  })
})
