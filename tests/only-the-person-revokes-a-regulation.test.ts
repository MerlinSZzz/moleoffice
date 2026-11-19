// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Any agent may file and change a regulation on the owner's words naming its title or record.
 * Revoking on a change also permits a secretary using its own key with words naming that revocation.
 * Words naming only a change do not revoke; the grant never revokes; an agent never creates one revoked.
 * A later decision extends the original rule. The route cases for that extension
 * and their mutation proofs live in the-owners-words-restore-move-and-revoke-a-regulation.test.ts.
 * This file keeps the original filing, record-only warrant refusal, person and field-pairing cases.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'default'

const AS_AGENT: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}
const AS_PERSON: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

/** A warrant's words, kept exactly as design/regulations/ACCEPTANCE.md quotes them. */
const THE_OWNERS_WORDS = {
  saidBy: THE_TEST_OFFICES_OWNER.id,
  words: '人不能让agent进行设计（比如office flow的设计），还有architecture设计',
  where: 'terminal',
  when: '2026-09-11 14:40',
} as const

const TITLE = 'The owner’s first regulation: no agent design of office flow or architecture'

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

interface Reply {
  status: number
  body: Record<string, unknown>
}

async function post(payload: Record<string, unknown>, headers: Record<string, string> = AS_AGENT): Promise<Reply> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers, payload })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

async function patch(id: string, payload: Record<string, unknown>, headers: Record<string, string> = AS_AGENT): Promise<Reply> {
  const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

/** A regulation body, binding the person by default, ready to file. */
function aRegulation(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'regulation',
    title: TITLE,
    data: { sentence: THE_OWNERS_WORDS.words, binds: 'person', since: '2026-09-11', ...extra },
  }
}

/** The regulation, filed by the person themselves, so a revoke test has one to act on. */
async function filedByTheOwner(): Promise<string> {
  const { status, body } = await post(aRegulation(), AS_PERSON)
  expect(status, JSON.stringify(body)).toBe(201)
  return (body['record'] as { id: string }).id
}

// ============================================================================ filing one

describe('filing a regulation', () => {
  it('refuses an agent with no warrant, and files nothing', async () => {
    const { status, body } = await post(aRegulation())
    expect(status, JSON.stringify(body)).toBe(403)
    expect(String(body['error'])).toContain('the human')
  })

  it('lets an agent file one that carries a warrant on the owner’s words, naming the title in for', async () => {
    const { status, body } = await post({ ...aRegulation(), warrant: { ...THE_OWNERS_WORDS, for: [TITLE] } })
    expect(status, JSON.stringify(body)).toBe(201)
    expect(((body['record'] as { data: Record<string, unknown> }).data)['sentence']).toBe(THE_OWNERS_WORDS.words)
  })

  it('refuses an agent’s warrant that names a different record', async () => {
    const { status, body } = await post({ ...aRegulation(), warrant: { ...THE_OWNERS_WORDS, for: ['some other title'] } })
    expect(status, JSON.stringify(body)).toBe(403)
  })

  it('lets the person file one with no warrant needed', async () => {
    const { status } = await post(aRegulation(), AS_PERSON)
    expect(status).toBe(201)
  })
})

// ============================================================================ whom it binds

describe('whom it binds', () => {
  it('refuses "role" with no role named', async () => {
    const { status, body } = await post(aRegulation({ binds: 'role' }), AS_PERSON)
    expect(status, JSON.stringify(body)).toBe(400)
    expect(String(body['error'])).toContain('data.role')
  })

  it('refuses "person" with a role also named', async () => {
    const { status, body } = await post(aRegulation({ role: 'secretary' }), AS_PERSON)
    expect(status, JSON.stringify(body)).toBe(400)
    expect(String(body['error'])).toContain('data.role')
  })

  it('accepts "role" with a role named', async () => {
    const { status, body } = await post(aRegulation({ binds: 'role', role: 'secretary' }), AS_PERSON)
    expect(status, JSON.stringify(body)).toBe(201)
  })
})

// ============================================================================ revoking one

describe('revoking a regulation', () => {
  it('refuses an agent outright, with no warrant', async () => {
    const id = await filedByTheOwner()
    const { status, body } = await patch(id, { dataPatch: { revoked_at: '2026-10-01', revoked_because: 'done its work' } })
    expect(status, JSON.stringify(body)).toBe(403)
  })

  it('refuses an agent even carrying a warrant that would otherwise let it change the record', async () => {
    const id = await filedByTheOwner()
    const { status, body } = await patch(id, {
      dataPatch: { revoked_at: '2026-10-01', revoked_because: 'done its work' },
      warrant: { ...THE_OWNERS_WORDS, for: [id] },
    })
    expect(status, JSON.stringify(body)).toBe(403)
    expect(String(body['error'])).toContain('revoked_at')
    expect(String(body['error'])).toContain('person')
  })

  it('lets the person revoke it', async () => {
    const id = await filedByTheOwner()
    const { status, body } = await patch(id, { dataPatch: { revoked_at: '2026-10-01', revoked_because: 'done its work' } }, AS_PERSON)
    expect(status, JSON.stringify(body)).toBe(200)
  })

  it('leaves an ordinary edit that does not touch the revocation fields alone, for an agent with a warrant', async () => {
    const id = await filedByTheOwner()
    const { status, body } = await patch(id, { dataPatch: { since: '2026-09-12' }, warrant: { ...THE_OWNERS_WORDS, for: [id] } })
    expect(status, JSON.stringify(body)).toBe(200)
  })

  it('pairs revoked_at and revoked_because: neither alone is stored', async () => {
    const id = await filedByTheOwner()
    const onlyAt = await patch(id, { dataPatch: { revoked_at: '2026-10-01' } }, AS_PERSON)
    expect(onlyAt.status, JSON.stringify(onlyAt.body)).toBe(400)
    const onlyBecause = await patch(id, { dataPatch: { revoked_because: 'done its work' } }, AS_PERSON)
    expect(onlyBecause.status, JSON.stringify(onlyBecause.body)).toBe(400)
  })
})
