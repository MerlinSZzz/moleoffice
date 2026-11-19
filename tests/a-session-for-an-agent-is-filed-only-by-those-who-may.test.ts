// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Fixture update: in (k) the stranger changes the doing line of its own session, which the person has bound to S, as a run's record is changed only by those who hold the run; what (k) proves is unchanged. */
/**
 * A SESSION FOR AN AGENT IS FILED ONLY BY THOSE WHO MAY. the secretary's decision of round 30, on report qdY3yuWb900p,
 * block b-8, point 3, and the answers in message 1uZgEr3aLmke.
 *
 * The office acts on the agent a session names: its message limit, its finished-child line and its stop are read
 * from it. A session write that names an agent (`ranAs`, `servingAgent` or `servingAgentId`) is accepted only from
 * that agent, an agent above it in its chain of starters, the person with their key (or from inside the office's own
 * program), and the office itself. A session for the inspector may also be filed by a secretary, or by whoever
 * submitted the merge entry the check is for. The patch path is the same door. Anything else is refused with 403, a
 * sentence naming who may, and nothing written.
 *
 * Two writes are the office's or the person's own acts, by the secretary's answers 3 and 4: the office binding a run to the
 * identity it made for it (`identityForAddressedRun`), and the person's press that admits a waiting registration,
 * which is checked before it writes anything and reads the owner as the owner's other acts do.
 *
 * THE AGENTS. The person registers the secretary, the inspector and a stranger. The secretary registers supervisor S;
 * S registers worker V.
 *
 *   (a) the stranger files a session for S: refused, the sentence names who may, nothing is written.
 *   (b) S files a session for itself: accepted.
 *   (c) the secretary, which started S, files one for S, and the secretary files one for V, two rungs down: accepted. This is what
 *       tools/register-a-run.mjs sends (servingAgent, servingAgentId and ranAs), which the sandbox launcher and the
 *       DeepSeek and Codex worker starts reach through tools/file-a-run.mjs.
 *   (d) the person, from inside the office's own program, files one for S: accepted.
 *   (e) the office files one for S: the message worker by name (dispatch), and THE_OFFICE in-process (the merge
 *       queue's own runs): accepted.
 *   (f) a request that says it is the person, from this computer's own program with no key of the owner's, while the key
 *       window is open, files one for S: refused.
 *   (g) a session for the inspector: the stranger is refused, with the sentence naming a secretary and the
 *       submitter; the secretary, which the inspector's chain does not hold, is accepted.
 *   (h) the submitter of a merge entry the check is for files the inspector's session: accepted; the stranger with
 *       the same check: refused.
 *   (i) the stranger names S only through servingAgentId: refused.
 *   (j) the stranger names S only through ranAs: refused.
 *   (k) the patch path: the stranger writes S onto its own session: refused and nothing changes; the person then
 *       writes S onto it, and the stranger changes its doing line, leaving S as it is: accepted.
 *   (l) the office binds a run that names nobody to the identity it made for it, for the stranger's message: accepted.
 *   (m) the owner's press admitting a waiting registration, keyless from the owner's own program while the key window is open:
 *       accepted, and the agent, its session and its ranAs are all written.
 *   (n) a press nothing proves to be the owner's is refused before it writes anything.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone
 * ---------------------------------------------------------------------------------------
 *
 *   M1. src/server/lib/records.ts, createRecord: the call to `assertThisCallerMayFileASessionFor` taken off: (a),
 *       (f), (g) refused, (h) refused, (i) and (j) go red.
 *   M2. `whyThisCallerMayNotFileASessionFor`: the line accepting the agent itself taken out: (b) goes red.
 *   M3. the same: the line accepting an agent above it in its chain taken out: (c) goes red.
 *   M4. the same: the line accepting the person taken out: (d) goes red.
 *   M5. the same: the line accepting the office taken out: (e) goes red.
 *   M6. `thePersonIsFilingThisSession` made to read `thePersonIsProved` always: (f) goes red.
 *   M7. the inspector line: `theSecretaryOfThisOffice(actor) ||` taken out: (g) the secretary goes red.
 *   M8. the inspector line: its condition made `theInspector` alone: (g) and (h) stranger go red.
 *   M9. the inspector line: `|| theCallerSubmittedTheEntryThisCheckIsFor(...)` taken out: (h) submitter goes red.
 *   M10. src/server/lib/messages.ts, `everyAgentASessionsDataNames`: 'servingAgentId' taken out of its list: (i) red.
 *   M11. the same: the `ranAs` loop taken out: (j) goes red.
 *   M12. patchRecord: the call to `assertThisCallerMayFileASessionFor` taken off: (k) refusal goes red.
 *   M13. `whyThisCallerMayNotFileASessionFor`: `held` made `[]` always: (k) acceptance goes red.
 *   M14. `identityForAddressedRun`: the counter not opened around its patch: (l) goes red.
 *   M15. `asTheirPressThatAdmitsARegistration`: the counter not opened: (m) goes red.
 *   M16. `asTheirPressThatAdmitsARegistration`: its check before the write taken out: (n) goes red.
 */

import type { AddressInfo } from 'node:net'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let door = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
  }
}

async function ask(method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** One request over the real listener, so the office reads which program sent it. */
async function overTheListener(method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const sent = await fetch(`${door}${url}`, { method, headers, body: JSON.stringify(payload) })
  return { status: sent.status, body: (await sent.json()) as Record<string, unknown> }
}

function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? body['message'] ?? JSON.stringify(body))
}

async function register(handle: string, by: Record<string, string>, role: string): Promise<void> {
  const made = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

function agentRecordOf(handle: string): string {
  return (
    t.client.sqlite
      .prepare("SELECT id FROM records WHERE kind = 'agent' AND workspace_id = 'default' AND json_extract(data, '$.handle') = ?")
      .get(handle) as { id: string }
  ).id
}

/** A session for `serving`, with the three facts tools/register-a-run.mjs writes. */
function forThe(serving: string): Record<string, unknown> {
  return { servingAgent: serving, servingAgentId: idOf(serving), ranAs: [{ workspaceId: 'default', agentId: agentRecordOf(serving) }] }
}

async function file(headers: Record<string, string>, title: string, facts: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  return ask('POST', '/api/records', headers, { kind: 'session', title, data: { state: 'running', runtime: 'claude-code', ...facts } })
}

function idIn(body: Record<string, unknown>): string {
  return String((body['record'] as { id?: string } | undefined)?.id ?? '')
}

function howManyCalled(title: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records WHERE title = ?').get(title) as { n: number }).n
}

function dataOf(id: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

/** The refusal this door gives: 403, the agent it names, who may, and nothing written. */
function expectTheRefusal(reply: { status: number; body: Record<string, unknown> }, handle: string): void {
  expect(reply.status, said(reply.body)).toBe(403)
  expect(said(reply.body)).toContain(`This session names the agent "${handle}"`)
  expect(said(reply.body)).toContain(
    'A session for an agent is filed only by that agent, an agent above it in its chain of starters, the person with their key, or the office itself.',
  )
  expect(said(reply.body)).toContain('Nothing was written.')
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  await register(THE_TEST_OFFICES_SECRETARY.handle, AS_THE_PERSON, 'secretary')
  await register('inspector-one', AS_THE_PERSON, 'inspector')
  await register('a-stranger', AS_THE_PERSON, 'supervisor')
  await register('sup-s', asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'supervisor')
  await register('worker-v', asAgent('sup-s'), 'worker')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the four who may file a session for an agent', () => {
  it('(a) a stranger filing a session for S is refused, with a sentence naming who may, and nothing is written', async () => {
    const title = 'a session the stranger files for S'
    const refused = await file(asAgent('a-stranger'), title, forThe('sup-s'))
    expectTheRefusal(refused, 'sup-s')
    expect(said(refused.body)).toContain('agent "a-stranger" may not file or change a session for it')
    // WHAT TO DO INSTEAD, for an agent that wanted to start a run for a worker it did not register (
    // message HtiZpb6fcwb5: the old road of a supervisor filing such runs is dead, and the refusal says so).
    expect(said(refused.body)).toContain(
      'To start a run for an agent you did not register, ask a secretary to file it, or register the agent yourself, as its starter.',
    )
    expect(howManyCalled(title)).toBe(0)
  })

  it('(b) S files a session for itself: accepted', async () => {
    const own = await file(asAgent('sup-s'), 'a session S files for itself', forThe('sup-s'))
    expect(own.status, said(own.body)).toBe(201)
  })

  it(`(c) ${THE_TEST_OFFICES_SECRETARY.handle}, which started S, files for S and for V two rungs down: accepted`, async () => {
    const forS = await file(asAgent(THE_TEST_OFFICES_SECRETARY.handle), `a session ${THE_TEST_OFFICES_SECRETARY.handle} files for S`, forThe('sup-s'))
    expect(forS.status, said(forS.body)).toBe(201)
    const forV = await file(asAgent(THE_TEST_OFFICES_SECRETARY.handle), `a session ${THE_TEST_OFFICES_SECRETARY.handle} files for V`, forThe('worker-v'))
    expect(forV.status, said(forV.body)).toBe(201)
  })

  it('(d) the person, from inside the office, files one for S: accepted', async () => {
    const theirs = await file(AS_THE_PERSON, 'a session the person files for S', forThe('sup-s'))
    expect(theirs.status, said(theirs.body)).toBe(201)
  })

  it('(e) the office files one for S, by the message worker and in-process: accepted', async () => {
    const dispatched = await file(asAgent('mole-office/the-message-worker'), 'a session the message worker files for S', forThe('sup-s'))
    expect(dispatched.status, said(dispatched.body)).toBe(201)
    const inside = t.api.createRecord({
      kind: 'session',
      title: 'a session the office files for S',
      workspaceId: 'default',
      origin: 'fixture',
      data: { state: 'running', ...forThe('sup-s') },
      actor: { type: 'system', id: 'mole-office' },
    })
    expect(inside.id).not.toBe('')
  })

  it("(f) a claim to be the person with no key, from this computer's own program in the open window: refused", async () => {
    const title = 'a session a keyless claim to be the owner files for S'
    const refused = await overTheListener('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title, data: { state: 'running', ...forThe('sup-s') } })
    expectTheRefusal(refused, 'sup-s')
    expect(said(refused.body)).toContain("A claim to be the person counts here only with the person's key, even while the key window is open.")
    expect(howManyCalled(title)).toBe(0)
  })
})

describe(`a session for the inspector (${THE_TEST_OFFICES_SECRETARY.handle}, message 1uZgEr3aLmke, answers 1 and 2)`, () => {
  it(`(g) the stranger is refused, naming a secretary and the submitter; ${THE_TEST_OFFICES_SECRETARY.handle}, a secretary, is accepted`, async () => {
    const title = 'an inspector session the stranger files'
    const refused = await file(asAgent('a-stranger'), title, forThe('inspector-one'))
    expectTheRefusal(refused, 'inspector-one')
    expect(said(refused.body)).toContain('A session for the inspector may also be filed by a secretary, or by whoever submitted the merge entry the check is for.')
    expect(howManyCalled(title)).toBe(0)
    const byArgus = await file(asAgent(THE_TEST_OFFICES_SECRETARY.handle), `an inspector session ${THE_TEST_OFFICES_SECRETARY.handle} files`, forThe('inspector-one'))
    expect(byArgus.status, said(byArgus.body)).toBe(201)
  })

  it('(h) the submitter of a merge entry the check is for is accepted; the stranger with the same check is refused', async () => {
    const checked = await file(asAgent('sup-s'), 'the run S submitted', forThe('sup-s'))
    expect(checked.status, said(checked.body)).toBe(201)
    const run = idIn(checked.body)
    // A MERGE ENTRY S SUBMITTED ON THAT RUN, as the merge queue stores one. Written directly: the queue's own doors
    // need a sealed git tip, and this case is about who may file the check's session, not about the queue.
    t.client.sqlite
      .prepare(
        'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) ' +
          "VALUES (?, 'default', ?, '2026-10-02 09:00:00', '2026-10-02 09:00:00', 'merge_entry', ?, ?, 'fixture')",
      )
      .run(
        'entry-of-s-run',
        THE_PERSON,
        'a merge entry S submitted',
        JSON.stringify({
          state: 'pinned',
          run,
          seal: { id: 'a-seal', hash: 'f'.repeat(64) },
          changeset: { adapter: 'git', root: '/nowhere', repository: 'fixture', branch: 'b' },
          submittedBy: { kind: 'agent', id: idOf('sup-s') },
          occupies: null,
        }),
      )
    // ITS CREATE ROW, as the records door writes one with every record: the queue lists the entries a check is for in the
    // order they were written, read from that row, and answers 500 for an entry that has none.
    t.client.sqlite
      .prepare(
        'INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, new_value, at) ' +
          "VALUES ('create-entry-of-s-run', 'entry-of-s-run', 'default', 'create', 'human', ?, 'a merge entry S submitted', '2026-10-02 09:00:00')",
      )
      .run(THE_PERSON)
    const theCheck = { ...forThe('inspector-one'), extra: { purpose: 'inspection', inspectionRun: run } }
    const bySubmitter = await file(asAgent('sup-s'), 'the check of the run S submitted, filed by S', theCheck)
    expect(bySubmitter.status, said(bySubmitter.body)).toBe(201)
    const title = 'the check of the run S submitted, filed by the stranger'
    const refused = await file(asAgent('a-stranger'), title, theCheck)
    expectTheRefusal(refused, 'inspector-one')
    expect(howManyCalled(title)).toBe(0)
  })
})

describe('every fact a write can carry is asked about', () => {
  it('(i) the stranger names S only through servingAgentId: refused', async () => {
    const title = 'a session the stranger files for S by id alone'
    const refused = await file(asAgent('a-stranger'), title, { servingAgentId: idOf('sup-s') })
    expectTheRefusal(refused, 'sup-s')
    expect(howManyCalled(title)).toBe(0)
  })

  it('(j) the stranger names S only through ranAs: refused', async () => {
    const title = 'a session the stranger files that ran as S'
    const refused = await file(asAgent('a-stranger'), title, { ranAs: [{ workspaceId: 'default', agentId: agentRecordOf('sup-s') }] })
    expectTheRefusal(refused, 'sup-s')
    expect(howManyCalled(title)).toBe(0)
  })
})

describe('the patch path is the same door', () => {
  it('(k) the stranger writing S onto its own session is refused; changing only the doing line of a session for S is accepted', async () => {
    const plain = await file(asAgent('a-stranger'), 'a session the stranger files for nobody', {})
    expect(plain.status, said(plain.body)).toBe(201)
    const id = idIn(plain.body)
    const refused = await ask('PATCH', `/api/records/${id}`, asAgent('a-stranger'), { dataPatch: { servingAgent: 'sup-s', doing: 'changed' } })
    expectTheRefusal(refused, 'sup-s')
    expect(dataOf(id)['servingAgent']).toBeUndefined()
    expect(dataOf(id)['doing']).toBeUndefined()

    // The person writes S onto the stranger's session, so the session names S and the stranger still holds it: a run's
    // data is changed only by those who hold the run, so the stranger may not write to a session another agent filed.
    const bound = await ask('PATCH', `/api/records/${id}`, AS_THE_PERSON, { dataPatch: forThe('sup-s') })
    expect(bound.status, said(bound.body)).toBe(200)
    const left = await ask('PATCH', `/api/records/${id}`, asAgent('a-stranger'), { dataPatch: { doing: 'a line the stranger wrote' } })
    expect(left.status, said(left.body)).toBe(200)
  })
})

describe(`the office's binding and the owner's press are their own acts (${THE_TEST_OFFICES_SECRETARY.handle}, message 1uZgEr3aLmke, answers 3 and 4)`, () => {
  it('(l) the office binds a run that names nobody to the identity it made, for a message the stranger addresses', async () => {
    const nobodys = await file(AS_THE_PERSON, 'a run nobody named', {})
    expect(nobodys.status, said(nobodys.body)).toBe(201)
    const run = idIn(nobodys.body)
    const answer = t.api.identityForAddressedRun(run, { type: 'agent', id: 'a-stranger', sessionId: null })
    expect(answer.addressable).toBe(true)
    const ranAs = dataOf(run)['ranAs'] as { agentId: string }[]
    expect(ranAs).toHaveLength(1)
  })

  it('(m) the owner\'s keyless press from the owner\'s own program in the open window admits a waiting registration, whole', async () => {
    const asked = await overTheListener('POST', '/api/agents/register-myself', asAgent('admitted-one'), {
      handle: 'admitted-one',
      name: 'The agent admitted-one',
      workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
    })
    expect(asked.status, said(asked.body)).toBe(202)
    const granted = await overTheListener('POST', `/api/roles/requests/${String(asked.body['request'])}/grant`, AS_THE_PERSON, {})
    expect(granted.status, said(granted.body)).toBe(201)
    const session = String(granted.body['session'])
    expect((dataOf(session)['ranAs'] as { agentId: string }[])[0]?.agentId).toBe(agentRecordOf('admitted-one'))
  })

  it('(n) a press nothing proves to be the owner\'s is refused before it writes anything', () => {
    let wrote = false
    const notTheOwner = { type: 'human' as const, id: THE_PERSON, sessionId: null, from: 'this machine' as const }
    expect(() =>
      t.api.asTheirPressThatAdmitsARegistration(notTheOwner, () => {
        wrote = true
      }),
    ).toThrow("Admitting a registration files a session for the agent it admits, so it is the person's own press")
    expect(wrote).toBe(false)
  })
})
