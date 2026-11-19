// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A VISITING AGENT HOLDS ITS OWN CREDENTIAL, PENDING UNTIL THE OWNER CONFIRMS IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * Criteria P24, P25, P27, P28 and P29 of design/permissions/ACCEPTANCE.md:
 *
 *     an agent from a machine with no world yet is registered as a trusted visitor, each agent is issued its
 *     own credential, and the run's facts (a conversation path or a start directory, with the token) show
 *     whether it is the same agent or another that found the token; the person confirms each, and oversees them.
 *
 *   P24. Two agents on loquat get two credentials; each holds a conversation storage path or a start
 *        directory, a runtime, a machine and a session record id; the token is shown once and stored
 *        as a hash.
 *   P25. Every request under a pending credential is refused, and nothing it sent is stored under its
 *        handle. After the owner confirms, the same request is accepted.
 *   P27. The same token sent from a different start directory produces a mismatch row naming both
 *        facts.
 *   P28. The credential page says what it cannot prove.
 *   P29. End it, send the same request, get a refusal naming the credential and when it ended.
 *
 * ---------------------------------------------------------------------------------------
 * TWO REAL DOORS AND NOT ONE `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * A visitor is an agent on ANOTHER machine, and an injected request is on no socket at all — its
 * arrival is `undefined`, which means the machine rules do not apply to it. So this file opens two
 * listeners onto one built app and drives real HTTP through each, the way
 * tests/governance-from-another-machine.test.ts does and for the same reason: a test that set the
 * arrival by hand would be proving that its own assignment reached the guard.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { FACTS_COMPARED, WHAT_A_CREDENTIAL_CANNOT_PROVE, whatAMismatchDoesToday } from '../src/shared/visitors.ts'
import { visitorPath } from '../src/web/components/router.tsx'
import { moleOffice } from '../src/shared/participants.ts'
import { CREDENTIAL_WORDS } from '../src/web/pages/CredentialPage.tsx'

let t: TestDb
let app: FastifyInstance
/** The two doors, as base URLs. Every request below names which one it went through. */
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
      // `the caller` AND NOT `a proxy on this computer`, because that is what a tailnet listener
      // is: the socket really does carry the visitor's address, so `writtenFrom` reads it and the
      // credential records a machine. A proxy would need the forwarded header this test does not
      // model, and the machine would then be nobody-could-tell — which is a real answer and not the
      // one criterion P24 is about.
      stampArrival(raw, 'another machine', 'the caller')
      app.routing(raw, res)
    }),
  )
  // REGISTER THE AGENT THE CONFIRM DOOR TEST ASKS AS. A made-up id is refused by `actorFrom` before
  // the door's own check, so this makes that check the thing under test.
  const registered = await ask(thisMachine, 'POST', '/api/agents/started', { handle: ASKING_AGENT, name: 'The agent that asks at this machine' }, PERSON)
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
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
  method: 'GET' | 'POST' | 'PATCH',
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

/**
 * AN AGENT REGISTERED ON THIS MACHINE, so a request from one reaches the door's own check.
 *
 * An agent id no registry holds is refused first, by `actorFrom` in src/server/lib/http.ts. This
 * file's subject is the confirm door's own refusal, so the asking agent must be a real one.
 */
const ASKING_AGENT = 'loquat-asking-agent'

interface Credential {
  id: string
  handle: string
  standing: string
  facts: { conversationPath: string | null; startDirectory: string | null; runtime: string | null; sessionRecord: string | null; machine: string | null }
  machine: string | null
  requests: number
  writes: number
  mismatches: number
  confirmedBy: { kind: string; id: string } | null
  endedAt: string | null
  endsAt: string
}

/** Ask loquat's door for a credential, and hand back the token and the row. */
async function askForOne(over: Record<string, unknown> = {}): Promise<{ token: string; credential: Credential }> {
  const answer = await ask(loquat, 'POST', '/api/office/visitors', {
    handle: 'loquat-worker',
    name: 'The worker on loquat',
    role: 'worker',
    conversationPath: `${THE_TEST_FIXTURE_ROOT}/.claude/projects/loquat/aaa`,
    startDirectory: `${THE_TEST_FIXTURE_ROOT}/work/loquat`,
    runtime: 'claude-code',
    sessionRecord: 'sess-loquat-1',
    ...over,
  })
  expect(answer.status, JSON.stringify(answer.body)).toBe(201)
  return { token: answer.body.token as string, credential: answer.body.credential as Credential }
}

/** The three headers a visitor sends on every request afterwards. */
function carrying(token: string, facts: { conversation?: string; startedIn?: string } = {}): Record<string, string> {
  return {
    'x-mole-office-credential': token,
    'x-mole-office-conversation': facts.conversation ?? `${THE_TEST_FIXTURE_ROOT}/.claude/projects/loquat/aaa`,
    'x-mole-office-start-directory': facts.startedIn ?? `${THE_TEST_FIXTURE_ROOT}/work/loquat`,
  }
}

/** Every row of `visitor_requests` for one credential, read from the database and not from a reply. */
function requestRowsFor(credentialId: string): { route: string; refused_because: string | null; mismatch: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT route, refused_because, mismatch FROM visitor_requests WHERE credential_id = ? ORDER BY at')
    .all(credentialId) as { route: string; refused_because: string | null; mismatch: string | null }[]
}

describe('P24 — a visiting agent is issued its own credential, holding the run’s identifying facts', () => {
  it('gives two agents on loquat two credentials, each holding its own run’s facts', async () => {
    const first = await askForOne({ handle: 'loquat-one', conversationPath: '/transcripts/one' })
    const second = await askForOne({ handle: 'loquat-two', conversationPath: '/transcripts/two' })

    // ONE CREDENTIAL PER AGENT, each agent is issued its own. Two rows, two tokens.
    expect(first.credential.id).not.toBe(second.credential.id)
    expect(first.token).not.toBe(second.token)

    for (const [asked, got] of [
      ['/transcripts/one', first.credential],
      ['/transcripts/two', second.credential],
    ] as const) {
      expect(got.facts.conversationPath).toBe(asked)
      expect(got.facts.startDirectory).toBe(`${THE_TEST_FIXTURE_ROOT}/work/loquat`)
      expect(got.facts.runtime).toBe('claude-code')
      expect(got.facts.sessionRecord).toBe('sess-loquat-1')
      // THE MACHINE IS MEASURED, not sent: the body named none and the row has one.
      expect(got.machine, 'the machine a visitor asked from was not recorded').not.toBeNull()
    }
  })

  it('shows the token once and stores a hash, so no later read can hand it back', async () => {
    const { token, credential } = await askForOne({ handle: 'loquat-hash' })

    // WHAT IS STORED IS THE HASH AND NOT THE SECRET.
    const row = t.client.sqlite
      .prepare('SELECT token_hash FROM visitor_credentials WHERE id = ?')
      .get(credential.id) as { token_hash: string }
    expect(row.token_hash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(row.token_hash).not.toBe(token)

    // AND NO READ HANDS THE TOKEN BACK. Not the one credential, and not the list.
    const one = await ask(thisMachine, 'GET', `/api/office/visitors/${credential.id}`, undefined, PERSON)
    expect(JSON.stringify(one.body)).not.toContain(token)
    const list = await ask(thisMachine, 'GET', '/api/office/visitors', undefined, PERSON)
    expect(JSON.stringify(list.body)).not.toContain(token)
    // NOR THE HASH, which is not a secret but is also not a thing any page needs.
    expect(JSON.stringify(one.body)).not.toContain(row.token_hash)
  })

  it('refuses a credential asked for with neither of the two facts, naming both', async () => {
    const answer = await ask(loquat, 'POST', '/api/office/visitors', {
      handle: 'loquat-factless',
      name: 'A run that said nothing about itself',
      role: 'worker',
    })
    expect(answer.status).toBe(400)
    expect(String(answer.body.error)).toContain('conversationPath')
    expect(String(answer.body.error)).toContain('startDirectory')
  })
})

describe('P25 — a pending visitor cannot work', () => {
  it('refuses every request under a pending credential and stores nothing under its handle', async () => {
    const { token, credential } = await askForOne({ handle: 'loquat-pending' })
    expect(credential.standing).toBe('pending')

    const before = t.api.listRecords({ workspaceId: 'default', kind: 'note' }).length
    const refused = await ask(
      loquat,
      'POST',
      '/api/records',
      { kind: 'note', title: 'A pending visitor wrote this', data: { body: 'nothing' } },
      { ...carrying(token), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'loquat-pending' },
    )
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(String(refused.body.error)).toContain('waiting to be confirmed')
    expect(String(refused.body.error)).toContain(credential.id)
    // NOTHING IT SENT IS STORED UNDER ITS HANDLE. The refusal has to be the whole of it: a 403 that
    // wrote the record anyway would be worse than no gate at all.
    expect(t.api.listRecords({ workspaceId: 'default', kind: 'note' }).length).toBe(before)

    // A READ IS REFUSED TOO. The rule asks for the person's confirmation, with nothing narrowing it to writes, and a
    // pending visitor that could read the whole corpus would be a pending visitor that is working.
    const read = await ask(loquat, 'GET', '/api/records?kind=note', undefined, carrying(token))
    expect(read.status).toBe(403)
  })

  it('accepts the same request once the owner has confirmed it', async () => {
    const { token, credential } = await askForOne({ handle: 'loquat-confirmed' })

    const confirmed = await ask(
      thisMachine,
      'POST',
      `/api/office/visitors/${credential.id}/confirm`,
      undefined,
      PERSON,
    )
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
    expect((confirmed.body.credential as Credential).standing).toBe('trusted')
    expect((confirmed.body.credential as Credential).confirmedBy?.id).toBe(THE_TEST_OFFICES_OWNER.id)

    const written = await ask(
      loquat,
      'POST',
      '/api/records',
      { kind: 'note', title: 'A confirmed visitor wrote this', data: { body: 'something' } },
      { ...carrying(token), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'loquat-confirmed' },
    )
    expect(written.status, JSON.stringify(written.body)).toBe(201)
    expect(
      t.api.listRecords({ workspaceId: 'default', kind: 'note' }).map((r: { title: string }) => r.title),
    ).toContain('A confirmed visitor wrote this')
  })

  it('confirms only for the person, and says so to an agent that asks from this machine', async () => {
    const { credential } = await askForOne({ handle: 'loquat-selfconfirm' })
    const refused = await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/confirm`, undefined, {
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': ASKING_AGENT,
    })
    expect(refused.status).toBe(403)
    expect(String(refused.body.error)).toContain('owner')
    // AND IT REALLY IS STILL PENDING. A refusal that confirmed it anyway would be the one failure
    // this whole criterion exists to prevent.
    const read = await ask(thisMachine, 'GET', `/api/office/visitors/${credential.id}`, undefined, PERSON)
    expect((read.body.credential as Credential).standing).toBe('pending')
  })

  it('is not even asked from another machine: the confirm door is kept where the office runs', async () => {
    // SINCE 13 SEPTEMBER 2026 (problem MLcj9RHaDkLa). Until P83's key exists, a `human` header from
    // another machine is a claim the office cannot check, so a visitor could confirm its own
    // credential. The owner’s choice on P83, A's shape, makes the first confirmation happen on the
    // machine that runs the office, and the door now says so before any handler runs.
    const { credential } = await askForOne({ handle: 'loquat-selfconfirm-2' })
    for (const headers of [
      { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'loquat-selfconfirm-2' },
      PERSON,
    ]) {
      const refused = await ask(loquat, 'POST', `/api/office/visitors/${credential.id}/confirm`, undefined, headers)
      expect(refused.status).toBe(403)
      expect(String(refused.body.error)).toContain('another computer')
    }
    const read = await ask(thisMachine, 'GET', `/api/office/visitors/${credential.id}`, undefined, PERSON)
    expect((read.body.credential as Credential).standing).toBe('pending')
  })
})

describe('P27 — a token that matches with facts that do not is recorded as a mismatch', () => {
  it('records a mismatch row naming the fact, what was issued and what was sent', async () => {
    const { token, credential } = await askForOne({ handle: 'loquat-mismatch' })
    await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/confirm`, undefined, PERSON)

    // THE SAME TOKEN, FROM A DIFFERENT START DIRECTORY. This is the case the rule names:
    // another agent that found the token somewhere and passes itself off as the first.
    await ask(loquat, 'GET', '/api/health', undefined, carrying(token, { startedIn: '/tmp/somewhere-else' }))

    const rows = requestRowsFor(credential.id)
    const mismatched = rows.filter((row) => row.mismatch !== null)
    expect(mismatched.length, 'a request from a different start directory recorded no mismatch').toBe(1)
    const said = JSON.parse(mismatched[0]?.mismatch ?? '[]') as { said: string; issued: string; sent: string }[]
    expect(said.length).toBe(1)
    // BOTH FACTS ARE ON THE ROW. A row saying only "these did not match" cannot be read a week later.
    expect(said[0]?.issued).toBe(`${THE_TEST_FIXTURE_ROOT}/work/loquat`)
    expect(said[0]?.sent).toBe('/tmp/somewhere-else')
    expect(said[0]?.said).toContain('directory')

    // AND IT IS SHOWN. The count is on the credential and the row is on its page.
    const read = await ask(thisMachine, 'GET', `/api/office/visitors/${credential.id}`, undefined, PERSON)
    expect((read.body.credential as Credential).mismatches).toBe(1)
    expect(JSON.stringify(read.body.requests)).toContain('/tmp/somewhere-else')
  })

  it('counts a request that sends the same facts as no mismatch at all', async () => {
    const { token, credential } = await askForOne({ handle: 'loquat-match' })
    await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/confirm`, undefined, PERSON)
    await ask(loquat, 'GET', '/api/health', undefined, carrying(token))
    const read = await ask(thisMachine, 'GET', `/api/office/visitors/${credential.id}`, undefined, PERSON)
    expect((read.body.credential as Credential).mismatches).toBe(0)
    expect((read.body.credential as Credential).requests).toBeGreaterThan(0)
  })

  it('treats a dropped fact header as a mismatch, so silence costs the same as a wrong answer', async () => {
    const { token, credential } = await askForOne({ handle: 'loquat-silent' })
    await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/confirm`, undefined, PERSON)
    // ONLY THE TOKEN. Dropping the facts is the cheapest way for anything holding a stolen token to
    // avoid being compared to anything.
    await ask(loquat, 'GET', '/api/health', undefined, { 'x-mole-office-credential': token })
    const read = await ask(thisMachine, 'GET', `/api/office/visitors/${credential.id}`, undefined, PERSON)
    expect((read.body.credential as Credential).mismatches).toBe(1)
  })

  it('refuses a token no credential here matches, and writes no row for it', async () => {
    const before = (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM visitor_requests').get() as { n: number }).n
    const answer = await ask(loquat, 'GET', '/api/health', undefined, { 'x-mole-office-credential': 'not-a-token' })
    expect(answer.status).toBe(403)
    expect(String(answer.body.error)).toContain('no credential here matches')
    expect((t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM visitor_requests').get() as { n: number }).n).toBe(before)
  })
})

// These tests cite a decision.
describe("A mismatch is not refused, and the agent's superior is told once", () => {
  const notice = 'aCredentialWasUsedWithOtherFacts'
  let secretary: string

  function idOf(handle: string): string {
    const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
    return row.id
  }

  function messagesToAPerson(): number {
    return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message' AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM json_each(records.data, '$.to') WHERE json_extract(value, '$.kind') = 'person')")
      .get() as { n: number }).n
  }

  function noticesFor(credential: string): {
    body: string; saidInFull: string; notice: string; sentBy: { kind: string; id: string };
    to: { kind: string; id: string }[]; lead: { target: { kind: string; route: string } };
    extra: { credentialMismatch: { credential: string; key: string } };
  }[] {
    return (t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.notice') = ? AND json_extract(data, '$.extra.credentialMismatch.credential') = ?")
      .all(notice, credential) as { data: string }[]).map(row => JSON.parse(row.data))
  }

  async function nameSecretary(agent: string | null = secretary) {
    const named = await ask(thisMachine, 'POST', '/api/office/dead-letter-secretary', { agent }, PERSON)
    expect(named.status, JSON.stringify(named.body)).toBe(200)
  }

  async function confirmed(handle: string) {
    const issued = await askForOne({ handle })
    const answer = await ask(thisMachine, 'POST', `/api/office/visitors/${issued.credential.id}/confirm`, undefined, PERSON)
    expect(answer.status, JSON.stringify(answer.body)).toBe(200)
    return issued
  }

  beforeAll(async () => {
    const made = await ask(thisMachine, 'POST', '/api/agents/started', { handle: 'p83-secretary', name: 'Test mismatch secretary', role: 'secretary' }, PERSON)
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    secretary = idOf('p83-secretary')
    const reading = await ask(thisMachine, 'GET', '/api/office/dead-letter-secretary', undefined, PERSON)
    expect(reading.status).toBe(200)
    expect(reading.body.mayBeNamed).toContainEqual(expect.objectContaining({ id: secretary }))
  })

  afterAll(async () => { await nameSecretary(null) })

  it('answers the request and tells only the dead-letter secretary, once per different mismatch', async () => {
    await nameSecretary()
    const { token, credential } = await confirmed('p83-confirmed')
    const sent = '/tmp/p83-other-directory'
    const toThePersonBefore = messagesToAPerson()
    const answer = await ask(loquat, 'GET', '/api/health', undefined, carrying(token, { startedIn: sent }))
    expect(answer.status, JSON.stringify(answer.body)).toBe(200)
    const lines = noticesFor(credential.id)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.notice).toBe(notice)
    expect(lines[0]!.body).toBe('A credential was used with other facts')
    expect(lines[0]!.sentBy).toEqual(moleOffice())
    expect(lines[0]!.to).toEqual([{ kind: 'agent', id: secretary }])
    expect(lines[0]!.to.some(to => to.kind === 'person')).toBe(false)
    for (const text of [credential.id, credential.handle, FACTS_COMPARED[1].said, credential.facts.startDirectory!, sent,
      'The request was answered.', 'no agent above could be told', 'Check whether this was the agent you answer for.',
      'A mismatch does not refuse a request; it is recorded and counted on the credential.']) {
      expect(lines[0]!.saidInFull).toContain(text)
    }
    expect(lines[0]!.lead.target).toEqual({ kind: 'page', route: visitorPath(credential.id) })
    expect(lines[0]!.extra.credentialMismatch.credential).toBe(credential.id)
    expect(lines[0]!.extra.credentialMismatch.key).toBeTruthy()
    const again = await ask(loquat, 'GET', '/api/health', undefined, carrying(token, { startedIn: sent }))
    expect(again.status).toBe(200)
    expect(noticesFor(credential.id)).toHaveLength(1)
    const different = await ask(loquat, 'GET', '/api/health', undefined, carrying(token, { startedIn: '/tmp/p83-third-directory' }))
    expect(different.status).toBe(200)
    expect(noticesFor(credential.id)).toHaveLength(2)
    expect(new Set(noticesFor(credential.id).map(line => line.extra.credentialMismatch.key)).size).toBe(2)
    expect(messagesToAPerson()).toBe(toThePersonBefore)
  })

  it('says nothing about matching facts', async () => {
    await nameSecretary()
    const { token, credential } = await confirmed('p83-matching')
    expect((await ask(loquat, 'GET', '/api/health', undefined, carrying(token))).status).toBe(200)
    expect(noticesFor(credential.id)).toEqual([])
    // A positive control makes absence meaningful: the same credential can produce a notice.
    await ask(loquat, 'GET', '/api/health', undefined, carrying(token, { startedIn: '/tmp/p83-match-control' }))
    expect(noticesFor(credential.id)).toHaveLength(1)
    await ask(loquat, 'GET', '/api/health', undefined, carrying(token))
    expect(noticesFor(credential.id)).toHaveLength(1)
  })

  it('records the mismatch without telling anybody when no dead-letter secretary is named', async () => {
    await nameSecretary(null)
    const { token, credential } = await confirmed('p83-nobody')
    expect((await ask(loquat, 'GET', '/api/health', undefined, carrying(token, { startedIn: '/tmp/p83-nobody' }))).status).toBe(200)
    expect(noticesFor(credential.id)).toEqual([])
    expect(requestRowsFor(credential.id).filter(row => row.mismatch !== null)).toHaveLength(1)
    // Nothing is marked as already said when nobody could be told; naming a secretary enables it.
    await nameSecretary()
    await ask(loquat, 'GET', '/api/health', undefined, carrying(token, { startedIn: '/tmp/p83-nobody' }))
    expect(noticesFor(credential.id)).toHaveLength(1)
  })

  it('tells the agent starter of a confirmed credential whose row\'s starter was moved, instead of the dead-letter secretary', async () => {
    await nameSecretary()
    const made = await ask(thisMachine, 'POST', '/api/agents/started', { handle: 'p83-starter', name: 'Test citizen starter', role: 'supervisor' }, PERSON)
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const starter = idOf('p83-starter')
    const { token, credential } = await confirmed('p83-citizen')
    // THE PERSON MOVES THE STARTER BY THEIR PRESS ON THE AGENT'S PAGE, the one door that does it since wave 13u round 186.
    const visitor = t.client.sqlite.prepare('SELECT id FROM agents WHERE credential = ?').get(credential.id) as { id: string }
    const moved = await ask(thisMachine, 'POST', `/api/agents/${visitor.id}/starter`, {
      to: starter, because: 'A made-up reason: this starter answers for the visiting agent now.',
    }, PERSON)
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    const row = t.client.sqlite.prepare('SELECT started_by_kind AS kind, started_by_id AS id FROM agents WHERE credential = ?')
      .get(credential.id)
    expect(row).toEqual({ kind: 'agent', id: starter })
    expect((await ask(loquat, 'GET', '/api/health', undefined, carrying(token, { startedIn: '/tmp/p83-citizen' }))).status).toBe(200)
    expect(noticesFor(credential.id)).toHaveLength(1)
    expect(noticesFor(credential.id)[0]!.to).toEqual([{ kind: 'agent', id: starter }])
    expect(noticesFor(credential.id)[0]!.saidInFull).toContain('nearest agent above that agent in its chain of starters')
  })

  it('tells the superior about mismatches on pending, ended and run-out requests too', async () => {
    await nameSecretary()
    for (const standing of ['pending', 'ended', 'run-out'] as const) {
      const { token, credential } = await askForOne({ handle: `p83-${standing}` })
      if (standing !== 'pending') {
        expect((await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/confirm`, undefined, PERSON)).status).toBe(200)
        if (standing === 'ended') expect((await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/end`, undefined, PERSON)).status).toBe(200)
        // No door moves a credential past its end, and nothing here drives the clock.
        else t.client.sqlite.prepare('UPDATE visitor_credentials SET ends_at = ? WHERE id = ?').run('2000-01-01 00:00:00', credential.id)
      }
      const refused = await ask(loquat, 'GET', '/api/health', undefined, carrying(token, { startedIn: '/tmp/p83-refused' }))
      expect(refused.status).toBe(403)
      expect(noticesFor(credential.id)).toHaveLength(1)
      expect(noticesFor(credential.id)[0]!.to).toEqual([{ kind: 'agent', id: secretary }])
      expect(noticesFor(credential.id)[0]!.saidInFull).toContain(`The request was refused for another reason: ${String(refused.body.error)}`)
      expect(requestRowsFor(credential.id)[0]!.mismatch).not.toBeNull()
    }
  })
})

describe('P28 — the credential page says what it cannot prove', () => {
  it('says a token proves possession and not identity, and that a mismatch is evidence', () => {
    const all = WHAT_A_CREDENTIAL_CANNOT_PROVE.join(' ')
    // The four things the criterion asks for, each in the product's own words rather than a
    // paraphrase this test invented.
    expect(all).toContain('Anything that can read the token can send it')
    expect(all).toContain('A mismatch is evidence, not proof')
    expect(all).toContain('moved directory')
    expect(all).toContain('read the run')
  })

  it('draws all four of them on the page, and what a mismatch does', () => {
    // THE PAGE'S OWN WORDS, read from the module the page draws from, so a sentence deleted from
    // the page fails here rather than being noticed by somebody looking at a screenshot.
    expect(CREDENTIAL_WORDS.cannotProve).toBe('What this cannot prove')
    expect(WHAT_A_CREDENTIAL_CANNOT_PROVE.length).toBe(4)
    expect(whatAMismatchDoesToday()).toContain('does not refuse the request')
    expect(whatAMismatchDoesToday()).not.toContain('has not been answered')
  })
})

describe('P29 — the owner ends a credential in one press and its requests are refused after', () => {
  it('refuses the same request afterwards, naming the credential and when it ended', async () => {
    const { token, credential } = await askForOne({ handle: 'loquat-ended' })
    await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/confirm`, undefined, PERSON)

    const worked = await ask(loquat, 'GET', '/api/health', undefined, carrying(token))
    expect(worked.status).toBe(200)

    // ONE PRESS. No body, no reason typed, no second confirmation.
    const ended = await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/end`, undefined, PERSON)
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    const row = ended.body.credential as Credential
    expect(row.standing).toBe('ended')
    expect(row.endedAt).not.toBeNull()

    const refused = await ask(loquat, 'GET', '/api/health', undefined, carrying(token))
    expect(refused.status).toBe(403)
    expect(String(refused.body.error)).toContain(credential.id)
    expect(String(refused.body.error)).toContain('loquat-ended')
    expect(String(refused.body.error)).toContain(row.endedAt ?? 'never')
  })

  it('keeps the row and every request ever made under it', async () => {
    const { token, credential } = await askForOne({ handle: 'loquat-kept' })
    await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/confirm`, undefined, PERSON)
    await ask(loquat, 'GET', '/api/health', undefined, carrying(token))
    const before = requestRowsFor(credential.id).length
    expect(before).toBeGreaterThan(0)

    await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/end`, undefined, PERSON)
    // THE OFFICE DOES NOT DELETE THE EVIDENCE OF HOW SOMEBODY GOT IN.
    expect(requestRowsFor(credential.id).length).toBeGreaterThanOrEqual(before)
    const read = await ask(thisMachine, 'GET', `/api/office/visitors/${credential.id}`, undefined, PERSON)
    expect(read.status).toBe(200)
  })

  it('does not confirm an ended credential back into use', async () => {
    const { credential } = await askForOne({ handle: 'loquat-noundo' })
    await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/end`, undefined, PERSON)
    const again = await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/confirm`, undefined, PERSON)
    expect(again.status).toBe(409)
    expect(String(again.body.error)).toContain('not confirmed back into use')
  })

  it('ends only for the person', async () => {
    const { credential } = await askForOne({ handle: 'loquat-selfend' })
    const refused = await ask(loquat, 'POST', `/api/office/visitors/${credential.id}/end`, undefined, {
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'loquat-selfend',
    })
    expect(refused.status).toBe(403)
  })
})
