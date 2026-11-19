// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A VISITOR MAY NOT COME IN UNDER A LIVE AGENT'S HANDLE, AND A SECOND CONFIRM SAYS WHAT IT WROTE.
 * Problems z-9zXhVeAPvA and miIe0Y41ciEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The confirm press had a branch for a credential whose handle a live agent already bears. Its
 * sentence said the confirmation "linked the credential to that row", and the branch wrote nothing
 * on the row (problem miIe0Y41ciEM, found in report H61MpXkwXK-X). Worse, the
 * key bound at the same press was kept under that live agent's id, so a visitor that asked as
 * that live agent's handle and was confirmed held a token that proved that agent (problem z-9zXhVeAPvA).
 *
 * The design words (design/permissions/DESIGN-2026-09-08-perm-5.md) say a taken handle is refused
 * with the existing row named. Both doors now refuse it, and the confirm refuses before it writes
 * anything. The one live row a confirm may still meet is the row that already carries the same
 * credential, and there the press writes nothing and says so.
 *
 * ---------------------------------------------------------------------------------------
 * THE PATHS, ONE CASE EACH
 * ---------------------------------------------------------------------------------------
 *
 *   · the ask door, under a handle a local agent bears: refused, and no credential is written;
 *   · the confirm door, for a credential asked before a local agent took the handle: refused, and
 *     nothing is written: no standing, no key, no trusted machine, nothing on the agent's row. Its
 *     token proves nobody;
 *   · the same credential confirmed a second time: the row it already carries, nothing written;
 *   · the same, after the person revoked the credential's key;
 *   · a handle that is a retired agent's id: refused at the ask and at the confirm, and the confirm
 *     writes nothing. Without the refusal the key's resolver would refuse it with 409 after the
 *     confirm had written the standing and a row;
 *   · a second confirm after the credential's row was renamed and another agent took the handle in
 *     another project: refused, and nothing is written.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. In src/server/api/visitors.ts, the confirm route, drop the `throw` after
 *      `whyAVisitorMayNotTakeThisHandle` → the second, fifth and last cases fail. For a live
 *      agent's handle, `theCitizenAConfirmMakes` meets a row that does not carry the credential
 *      and answers 500, after the standing was written.
 *   1b. Drop that `throw` and the 500 guard in `theCitizenAConfirmMakes` too → the second case
 *      shows the visitor's token proving the local agent.
 *   2. In `whyAVisitorMayNotTakeThisHandle` (src/server/lib/visitors.ts), return null at once →
 *      the ask door issues the credential, and the first, second, fifth and last cases fail.
 *   2b. In the same function, drop the `could.byId` check → the fifth case fails: the confirm
 *      writes the standing and a row, and then the key's resolver answers 409.
 *   3. In `theCitizenAConfirmMakes`, put back the old sentence ("…so this confirmation linked the
 *      credential to that row…") → the third and fourth cases fail.
 *   4. In `whatTheKeyProvesAboutTheRowThatWasThere`, drop the revoked check → the fourth case fails.
 *   5. In the confirm route, have `provesWho` always answer the "whoever … names" form → the third
 *      case fails on the key sentence.
 */

import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let here: string
let loquat: string
const extraDoors: Server[] = []

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function open(server: Server): Promise<string> {
  extraDoors.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

async function ask(
  door: string,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  payload?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** A credential asked for from loquat, and its token. */
async function askFromLoquat(handle: string): Promise<{ id: string; token: string }> {
  const asked = await ask(loquat, 'POST', '/api/office/visitors', {
    handle,
    name: `The visitor ${handle}`,
    role: 'worker',
    conversationPath: `/transcripts/${handle}.jsonl`,
    runtime: 'codex',
  })
  expect(asked.status, JSON.stringify(asked.body).slice(0, 300)).toBe(201)
  return { id: (asked.body.credential as { id: string }).id, token: asked.body.token as string }
}

interface Citizen {
  agent: { id: string; name: string; handle: string; credential: string | null }
  card: string
  says: string
}

async function confirm(credential: string): Promise<Citizen> {
  return (await confirmWhole(credential)).citizen
}

/** The whole confirm reply: the citizen, and the key sentence a newly confirmed credential gets. */
async function confirmWhole(
  credential: string,
): Promise<{ citizen: Citizen; agentKey: { id: string; says: string } | null }> {
  const done = await ask(here, 'POST', `/api/office/visitors/${credential}/confirm`, {}, PERSON)
  expect(done.status, JSON.stringify(done.body).slice(0, 300)).toBe(200)
  return {
    citizen: done.body.citizen as Citizen,
    agentKey: (done.body.agentKey ?? null) as { id: string; says: string } | null,
  }
}

/** A local agent, registered on this machine by the person through the starter door. */
async function aLocalAgent(
  handle: string,
  role: string,
  project = 'default',
): Promise<{ id: string; record: string }> {
  const made = await ask(here, 'POST', '/api/agents/started', { handle, name: handle, role }, {
    ...PERSON,
    'x-mole-office-workspace': project,
  })
  expect(made.status, JSON.stringify(made.body).slice(0, 300)).toBe(201)
  return { id: (made.body.agent as { id: string }).id, record: String(made.body.record) }
}

/** The registry row, as stored. */
function theRow(id: string): { handle: string; role: string | null; credential: string | null } {
  return t.client.sqlite.prepare('SELECT handle, role, credential FROM agents WHERE id = ?').get(id) as {
    handle: string
    role: string | null
    credential: string | null
  }
}

/** The agent record a registry row is joined to. The reply names the row, not the record. */
function theRecordOf(agentId: string): string {
  return (
    t.client.sqlite.prepare('SELECT record_id FROM agent_records WHERE agent_id = ?').get(agentId) as {
      record_id: string
    }
  ).record_id
}

/** How many live rows bear one handle. */
function liveRowsBearing(handle: string): number {
  return (
    t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM agents WHERE handle = ? AND retired = 0').get(handle) as {
      n: number
    }
  ).n
}

/** The agent record's revision count and its updatedAt, as the record door answers them. */
async function theRecordAsStored(
  record: string,
  project = 'default',
): Promise<{ seq: number; updatedAt: string; data: unknown }> {
  const read = await ask(here, 'GET', `/api/records/${record}`, undefined, { ...PERSON, 'x-mole-office-workspace': project })
  expect(read.status).toBe(200)
  const r = read.body.record as { updatedAt: string; data: unknown }
  return { seq: read.body.revisionSeq as number, updatedAt: r.updatedAt, data: r.data }
}

/** The key row this token's hash is kept in. */
function theKeyOf(token: string): { id: string; whose_kind: string; whose_id: string; revoked_at: string | null } {
  const hash = createHash('sha256').update(token).digest('hex')
  return t.client.sqlite
    .prepare('SELECT id, whose_kind, whose_id, revoked_at FROM held_keys WHERE key_hash = ?')
    .get(hash) as { id: string; whose_kind: string; whose_id: string; revoked_at: string | null }
}

beforeAll(async () => {
  t = await freshDb()
  // A SECOND PROJECT, for the last case: a handle this project once bore is refused here for ever.
  t.client.sqlite
    .prepare("INSERT INTO workspaces (id, title, created_at, updated_at) VALUES ('elsewhere', 'Elsewhere', ?, ?)")
    .run('2026-09-25 09:00:00', '2026-09-25 09:00:00')
  app = (await apiApp()).app
  await app.ready()
  const { stampArrival } = await import('../src/server/lib/http.ts')
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  loquat = await open(
    createServer((raw, res) => {
      stampArrival(raw, 'another machine', 'the caller')
      app.routing(raw, res)
    }),
  )
})

afterAll(async () => {
  for (const s of extraDoors) await new Promise<void>((r) => s.close(() => r()))
  await app.close()
  t.close()
})

/** A credential's standing, as stored. */
function standingOf(credential: string): string {
  return (t.client.sqlite.prepare('SELECT standing FROM visitor_credentials WHERE id = ?').get(credential) as {
    standing: string
  }).standing
}

/** How many credentials were ever issued under one handle. */
function credentialsUnder(handle: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM visitor_credentials WHERE handle = ?').get(handle) as {
    n: number
  }).n
}

/** Every row of the trusted machines table, removed ones included. */
function trustedMachineRows(): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM trusted_machines').get() as { n: number }).n
}

/**
 * One retired registry row with an id chosen here, written straight at the table with the picture
 * row its foreign key needs. The doors mint every new id, so an id that is a word can only be made
 * this way, the way tests/a-key-is-bound-to-the-agent-and-not-to-its-name.test.ts makes one.
 */
function anAgentRowWithTheId(id: string, handle: string, name: string): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${id}`, '2026-09-01 10:00:00')
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) ' +
        'VALUES (?, ?, ?, ?, 1, ?, ?)',
    )
    .run(id, name, handle, `avatar-default-agent-${id}`, '2026-09-02 10:00:00', '2026-09-01 10:00:00')
}

/** Whom a request carrying only this token is, read from the one place a key is read. */
async function whoTheTokenProves(token: string): Promise<unknown> {
  const keys = await import('../src/server/lib/keys.ts')
  return keys.howThisRequestProvedItself({ headers: { [KEY_HEADER]: token } } as never) ?? null
}

describe('a handle a live agent already bears', () => {
  it('is refused at the ask door, naming the agent, and no credential is written', async () => {
    const local = await aLocalAgent('local-one', 'supervisor')
    const asked = await ask(loquat, 'POST', '/api/office/visitors', {
      handle: 'local-one',
      name: 'Somebody else',
      role: 'worker',
      conversationPath: '/transcripts/local-one.jsonl',
      runtime: 'codex',
    })
    expect(asked.status, JSON.stringify(asked.body).slice(0, 300)).toBe(409)
    expect(String(asked.body.error)).toContain(
      `The handle "local-one" already names an agent here. local-one (${local.id}): a live agent bears it as its handle.`,
    )
    expect(String(asked.body.error)).toContain('Nothing was issued.')
    expect(credentialsUnder('local-one')).toBe(0)
  })

  it('is refused at the confirm door before anything is written, and the token proves nobody', async () => {
    const visitor = await askFromLoquat('late-taken')
    const local = await aLocalAgent('late-taken', 'supervisor')
    const before = await theRecordAsStored(local.record)
    const machines = trustedMachineRows()

    const done = await ask(here, 'POST', `/api/office/visitors/${visitor.id}/confirm`, {}, PERSON)

    // SOFT, so a run where the refusal is gone goes on to say what was written and whom the token proves.
    expect.soft(done.status, JSON.stringify(done.body).slice(0, 300)).toBe(409)
    expect.soft(String(done.body.error)).toContain(`late-taken (${local.id}): a live agent bears it as its handle`)
    expect.soft(String(done.body.error)).toContain('Nothing was confirmed')
    expect.soft(standingOf(visitor.id), 'the credential is still waiting').toBe('pending')
    expect.soft(theKeyOf(visitor.token) ?? null, 'no key was bound').toBeNull()
    expect.soft(trustedMachineRows(), 'no machine was trusted').toBe(machines)
    expect(liveRowsBearing('late-taken'), 'no second row').toBe(1)
    expect(theRow(local.id)).toEqual({ handle: 'late-taken', role: 'supervisor', credential: null })
    expect(await theRecordAsStored(local.record), 'the agent record was not written').toEqual(before)
    expect(await whoTheTokenProves(visitor.token), 'the visitor is not the local agent').toBeNull()
  })

  it('is met on a second confirm only as the row this credential already carries, and nothing is written', async () => {
    const visitor = await askFromLoquat('twice-over')
    const whole = await confirmWhole(visitor.id)
    const made = whole.citizen.agent
    expect(whole.agentKey?.says, 'a new row: the key names it').toContain(
      `the request is The visitor twice-over (${made.id}).`,
    )
    expect(theRow(made.id).credential, 'the first confirm wrote the row with this credential').toBe(visitor.id)
    const before = await theRecordAsStored(theRecordOf(made.id))

    const second = await confirm(visitor.id)

    expect(second.agent.id).toBe(made.id)
    expect(liveRowsBearing('twice-over')).toBe(1)
    expect(await theRecordAsStored(theRecordOf(made.id)), 'the second confirm wrote nothing').toEqual(before)
    expect(theKeyOf(visitor.token).whose_id).toBe(made.id)
    expect(second.says).toBe(
      `"twice-over" already answers to The visitor twice-over (${made.id}), the row that already carries this ` +
        'credential. This confirmation wrote nothing: no second row, and nothing on that row. This ' +
        'credential\'s key is kept under that row\'s id, so a request carrying its token is The visitor twice-over.',
    )
    expect(second.says).not.toContain('linked')
  })

  it('says the token proves nobody once the person has revoked the key', async () => {
    const visitor = await askFromLoquat('revoked-one')
    const first = await confirm(visitor.id)
    const key = theKeyOf(visitor.token)
    const revoked = await ask(here, 'POST', `/api/office/held-keys/${key.id}/revoke`, {}, PERSON)
    expect(revoked.status, JSON.stringify(revoked.body).slice(0, 300)).toBe(200)
    const before = await theRecordAsStored(theRecordOf(first.agent.id))

    const again = await confirm(visitor.id)

    const at = theKeyOf(visitor.token).revoked_at
    expect(at).not.toBeNull()
    expect(await theRecordAsStored(theRecordOf(first.agent.id))).toEqual(before)
    expect(again.says).toContain('the row that already carries this credential')
    expect(again.says.endsWith(`This credential's key was revoked at ${String(at)}, so its token proves nobody.`)).toBe(
      true,
    )
  })

  it('is refused at both doors when it is an agent’s id, and the confirm writes nothing first', async () => {
    // A RETIRED LEGACY AGENT, whose id is a word, as agents registered before the mint have. Its
    // handle is not the word, so no live agent and no retired agent bears the word as a handle.
    const legacy = 'old-legacy'
    const visitor = await askFromLoquat(legacy)
    anAgentRowWithTheId(legacy, 'old-legacy-was', 'The old legacy agent')
    const machines = trustedMachineRows()

    const asked = await ask(loquat, 'POST', '/api/office/visitors', {
      handle: legacy,
      name: 'Another visitor',
      role: 'worker',
      conversationPath: '/transcripts/another.jsonl',
      runtime: 'codex',
    })
    // SOFT, so a run without the refusal goes on to show what the confirm writes before it refuses.
    expect.soft(asked.status, JSON.stringify(asked.body).slice(0, 300)).toBe(409)
    expect.soft(String(asked.body.error)).toContain(`The old legacy agent (${legacy}): it is the id of a retired agent`)
    expect.soft(credentialsUnder(legacy), 'only the credential asked before the row existed').toBe(1)

    const done = await ask(here, 'POST', `/api/office/visitors/${visitor.id}/confirm`, {}, PERSON)
    expect.soft(done.status, JSON.stringify(done.body).slice(0, 300)).toBe(409)
    expect.soft(String(done.body.error)).toContain(`The old legacy agent (${legacy}): it is the id of a retired agent`)
    expect(standingOf(visitor.id), 'the credential is still waiting').toBe('pending')
    expect(liveRowsBearing(legacy), 'no row was written under the word').toBe(0)
    expect(theKeyOf(visitor.token) ?? null, 'no key was bound').toBeNull()
    expect(trustedMachineRows(), 'no machine was trusted').toBe(machines)
  })

  it('refuses a second confirm once another agent has taken the handle, and writes nothing', async () => {
    const visitor = await askFromLoquat('moved')
    const first = await confirm(visitor.id)
    const renamed = await ask(here, 'PATCH', `/api/records/${theRecordOf(first.agent.id)}`, { dataPatch: { handle: 'moved-away' } }, PERSON)
    expect(renamed.status, JSON.stringify(renamed.body).slice(0, 300)).toBe(200)
    // IN ANOTHER PROJECT, because this project still refuses a handle one of its records once bore.
    const other = await aLocalAgent('moved', 'worker', 'elsewhere')
    const before = await theRecordAsStored(other.record, 'elsewhere')
    const keyBefore = theKeyOf(visitor.token)

    const again = await ask(here, 'POST', `/api/office/visitors/${visitor.id}/confirm`, {}, PERSON)

    expect(again.status, JSON.stringify(again.body).slice(0, 300)).toBe(409)
    expect(String(again.body.error)).toContain(`moved (${other.id}): a live agent bears it as its handle`)
    expect(theRow(other.id).credential).toBeNull()
    expect(await theRecordAsStored(other.record, 'elsewhere')).toEqual(before)
    expect(theKeyOf(visitor.token), 'the key stayed with the row it was bound to').toEqual(keyBefore)
    expect(keyBefore.whose_id).toBe(first.agent.id)
  })
})
