// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * A MESSAGE NOBODY CAN TAKE GOES UP THE ADDRESSEE'S CHAIN OF STARTERS, ENDING AT THE SECRETARY.
 *
 * A message to a worker that cannot be reached, because it has closed for example, is routed to its
 * supervisor, then the supervisor above, and then the secretary. The secretary's decision
 * `J1Qge4JH87bv` settles the build; it amends an earlier decision, which sent a dead letter one hop to the
 * addressee's starter and to the owner when that starter was retired.
 *
 * WHAT CHANGED. The addressee is never replaced and the words are never rewritten. The letter keeps
 * its addressee, who can read it if it comes back, and Mole Office ALSO gives it to ONE participant:
 * the first reachable one up the addressee's chain of starters, ending at the secretary and then the
 * owner. "Cannot be reached" now covers a registered agent nothing is answering as, which is what the
 * chat draws as "Cannot reach".
 *
 * WHAT IS MEASURED, and the mutation that turns each red
 *
 *   · the six owner endings and the starter ending, each with the finished line word for word;
 *   · the chat's mark and the routing agree for a live session, a run, a sandbox run, nothing, a
 *     dead hold, a retired agent, and an agent with recent output and nothing answering;
 *     MUTATION (a): route on `participantPresence` (the dot) instead of `whyThisAgentCannotBeReached`
 *     (the mark) — the recent-output case went red, because the dot called it green and the message
 *     would not be routed. Since 27 September 2026 (problem h1S1MLK-SQ1I) the dot is the mark's
 *     reading, so that case now checks the two agree and this mutation no longer separates them;
 *   · `data.to` unchanged while one more delivery row is written for the chosen participant;
 *     MUTATION (d): rewrite `data.to` to the chosen participant instead of adding `routed` — the
 *     two-rows case goes red;
 *   · the sender rule: the first reachable one is the sender, so no copy is made. The no-copy line
 *     keeps the ending the walk reached when the sender is the owner, a form the supervisor added
 *     because the brief's rung sentence is false on that path;
 *     MUTATION (f): put the brief's rung sentence back on the owner-is-the-sender path — the
 *     owner-sender cases go red;
 *   · a stored-handle rung resolves through the one handle, not the exact id;
 *     MUTATION (c): read each rung by exact id only — the stored-handle case goes red;
 *   · a person's send to a RETIRED addressee answers 409 with `routed`; a person's send to a
 *     REGISTERED addressee nothing is answering as also answers 409, with `routed` and a reason in
 *     the presence dot's own word; an agent's send to that same addressee stays 201 with `routed`.
 *     MUTATION (j): answer 201 for the person's unheld send — the unheld case goes red;
 *   · an office line routes on retired and NOT on nothing answering;
 *     MUTATION (e): route office lines on nothing answering — that case goes red;
 *   · a run's reply whose addressee is retired, and one whose addressee nothing is answering as, are
 *     both routed the same way: data.to is unchanged, the chosen participant gets one more delivery
 *     row, the routed entry carries its line, and the process log prints that line because a run's
 *     reply has no caller to answer;
 *     MUTATION (h): skip the run-reply path in the send block — both run-reply cases go red;
 *   · a CHECK of a run's reply to a retired addressee logs nothing, because no letter went anywhere
 *     (src/server/lib/only-a-check.ts; wave 13s, round 20);
 *     MUTATION (i): in src/server/lib/records.ts, delete `!onlyChecking() && ` from the line that logs the
 *     routed lines — the check case goes red;
 *   · the envelope's fourth line is printed for the routed recipient and not for the addressee, is
 *     carried beside the body on the full queue row and never on the narrow one;
 *     MUTATION (g): drop the routed line from the full queue row — the full-row case goes red;
 *   · a routed letter is not also in the dead letters.
 *     MUTATION (b): drop the secretary stop — the secretary-unreachable case goes red, because the
 *     letter would go past the secretary to the owner's own starter.
 *
 * A REACHABLE RUNG IS A RUNNING SESSION RECORD SERVING IT PLUS A LIVE CHILD PROCESS REGISTERED AS
 * ITS RESOURCE, the way tests/a-sandbox-run-counts-as-going.test.ts builds one. The children are
 * killed by their group in afterAll.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { AnOfficeLine } from '../src/shared/groups.ts'

let t: TestDb
let app: FastifyInstance
let groups: typeof import('../src/server/lib/groups.ts')

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** Every real child this file started, stopped by group afterwards. */
const started: ChildProcess[] = []
let transcripts = ''

const LONG_AGO = (): Date => new Date(Date.now() - 2 * 60 * 60 * 1000)

/** One routed entry, as the reply carries it. */
interface TheRouting {
  for: { kind: string; id: string }
  because: string
  to: { kind: string; id: string } | null
  passedOver: { who: { kind: string; id: string }; because: string }[]
  line: string
  said?: { addressee: string; ending: { how: string } }
}

// ============================================================ fixtures

/**
 * Register an agent and give back its registry id. The id is minted and is not the handle, so it is
 * read back from the registry row by handle.
 */
function anAgent(handle: string, data: Record<string, unknown> = {}): string {
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code', ...data },
    actor: t.api.HUMAN,
  })
  return idOf(handle)
}

/** The registry id of the one agent bearing this handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent bears the handle ${handle}`).toBeDefined()
  return row!.id
}

/** An agent named by its registry id, the way a stored reference holds it. */
const agentRef = (handle: string): { kind: 'agent'; id: string } => ({ kind: 'agent', id: idOf(handle) })

/** Point one agent's registry row at its starter, or leave it with none. The agent is named by handle. */
function setStartedBy(handle: string, by: { kind: string; id: string } | null): void {
  t.client.sqlite
    .prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?')
    .run(by?.kind ?? null, by?.id ?? null, idOf(handle))
  const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
  if (columns.some((column) => column.name === 'owner_id')) {
    setFixtureOwner(t.client.sqlite, by?.kind === 'agent' ? by.id : null, idOf(handle), 'id')
  }
}

function retire(handle: string, because = 'the piece of work is done'): void {
  t.client.sqlite.prepare('UPDATE agents SET retired = 1, retired_because = ? WHERE id = ?').run(because, idOf(handle))
}

function makeSecretary(handle: string): void {
  t.client.sqlite.prepare("UPDATE agents SET role = 'secretary' WHERE id = ?").run(idOf(handle))
}

/** A session record, running unless said otherwise. */
function aSessionFor(agentId: string, data: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'a run of this agent',
    data: { state: 'running', runtime: 'claude-code', servingAgent: agentId, ...data },
    actor: t.api.HUMAN,
  }).id
}

/** A real process of this test's own, in its own group, registered against the run. */
async function aLiveProcessFor(sessionRecordId: string): Promise<void> {
  const child = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({
    workspaceId: WORKSPACE,
    sessionRecordId,
    type: 'process',
    key: String(child.pid),
    actor: t.api.HUMAN,
  })
}

/** A running session plus a live process: the mark reads this as a run, and the dot as green. */
async function makeReachable(agentId: string, data: Record<string, unknown> = {}): Promise<string> {
  const session = aSessionFor(agentId, data)
  await aLiveProcessFor(session)
  return session
}

/** A transcript whose last line carries this instant, which is what a held session answers from. */
function aTranscriptNow(agentId: string): string {
  const path = join(transcripts, `session-${agentId}.jsonl`)
  writeFileSync(
    path,
    `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: 'the answer' }] },
    })}\n`,
  )
  return path
}

/** Take the handle for one session, through the door a waiter uses. */
async function hold(handle: string, session: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${encodeURIComponent(handle)}/hold`,
    headers: AS_THE_PERSON,
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** The `data` of one record, read straight off the row. */
function dataOf(id: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

/** Delivery rows of one message, as the table holds them. */
function deliveriesOf(
  messageId: string,
): { recipientKind: string; recipientId: string; mark: string; inferredBy: string | null }[] {
  return t.client.sqlite
    .prepare(
      'SELECT recipient_kind AS recipientKind, recipient_id AS recipientId, mark, inferred_by AS inferredBy ' +
        'FROM message_delivery WHERE message_id = ? ORDER BY recipient_id',
    )
    .all(messageId) as unknown as {
    recipientKind: string
    recipientId: string
    mark: string
    inferredBy: string | null
  }[]
}

/**
 * A person's send over the one door every message write arrives at.
 *
 * `to` may be a handle or an id. A RETIRED addressee is named by its id, as the chat names it: a
 * write that follows a handle to a retired agent is refused before anything is stored (criterion
 * I2), so a send by that handle would never reach the routing this file is about.
 */
async function sendAsThePerson(
  to: string,
  body: string,
): Promise<{ code: number; said: Record<string, unknown>; messageId: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'message', title: body.slice(0, 40), data: { to: [{ kind: 'agent', id: to }], body } },
  })
  const said = reply.json() as Record<string, unknown>
  const record = said['record'] as { id: string } | undefined
  return { code: reply.statusCode, said, messageId: record?.id ?? '' }
}

/** The routing off a send's reply, or an empty list. */
function routedOffTheReply(said: Record<string, unknown>): TheRouting[] {
  return (said['routed'] as TheRouting[] | undefined) ?? []
}

/**
 * A registered agent's send, used for the owner endings.
 *
 * The sender is an agent and not the person, because the owner IS the person: when a person sends to
 * an address whose chain ends at the owner, rule 5 says no copy is made (the sender is the chosen
 * participant). An agent sender lets the owner ending be observed without a copy to the sender.
 */
async function sendAsAgent(
  from: string,
  to: string,
  body: string,
): Promise<{ code: number; said: Record<string, unknown>; messageId: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(from),
    payload: { kind: 'message', title: body.slice(0, 40), data: { to: [{ kind: 'agent', id: to }], body } },
  })
  const said = reply.json() as Record<string, unknown>
  const record = said['record'] as { id: string } | undefined
  return { code: reply.statusCode, said, messageId: record?.id ?? '' }
}

/**
 * A RUN'S OWN REPLY, filed the way lib/worker.ts files one.
 *
 * `senderIsTheRun` is the field the message worker sets on an agent's own words as it delivers them.
 * It is never reachable from a request, and a run has no caller to answer, so the routing prints its
 * line in the process log instead of returning it in a reply. The old file this one replaced covered
 * this path; it was lost in the move and is restored here.
 *
 * `to` is the addressee's registry id. The worker takes a reply's addressee from a stored reference,
 * never from a name somebody typed.
 */
function aRunsReply(to: string, body: string): { messageId: string; data: Record<string, unknown> } {
  const written = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'message',
    title: body.slice(0, 40),
    data: {
      body,
      to: [{ kind: 'agent', id: to }],
      sentBy: { kind: 'agent', id: 'whoever-served' },
      inReplyTo: 'talk-1',
      fromRun: 'the-run',
    },
    actor: { type: 'agent', id: 'mole-office/worker' },
    senderIsTheRun: true,
  })
  return { messageId: written.id, data: dataOf(written.id) }
}

beforeAll(async () => {
  transcripts = mkdtempSync(join(tmpdir(), 'routing-core-'))
  t = await freshDb()
  groups = await import('../src/server/lib/groups.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()

  // THE SIX OWNER ENDINGS, EACH WITH ITS OWN CHAIN. THE ADDRESSEES ARE REGISTERED AND NOTHING IS
  // ANSWERING AS THEM, and an AGENT sends to them: when the person sends to an addressee whose chain
  // ends at the owner, the person IS the owner and rule 5 makes no copy, so the owner line could not
  // be seen by a person's send. The starter ending is tested with a person's send and a retired
  // addressee, because that is the 409 the decision keeps.
  anAgent('the-sender')
  anAgent('starter-end')
  anAgent('starter-mid')
  anAgent('starter-top')
  setStartedBy('starter-end', agentRef('starter-mid'))
  setStartedBy('starter-mid', agentRef('starter-top'))
  await makeReachable('starter-top')
  retire('starter-end')

  anAgent('no-secretary-end')
  anAgent('no-secretary-mid')
  setStartedBy('no-secretary-end', agentRef('no-secretary-mid'))
  setStartedBy('no-secretary-mid', { kind: 'person', id: THE_PERSON })

  anAgent('secretary-end')
  anAgent('secretary-rung')
  makeSecretary('secretary-rung')
  setStartedBy('secretary-end', agentRef('secretary-rung'))

  anAgent('no-starter-end')

  anAgent('no-starter-mid-end')
  anAgent('no-starter-rung')
  setStartedBy('no-starter-mid-end', agentRef('no-starter-rung'))

  anAgent('bad-name-end')
  setStartedBy('bad-name-end', { kind: 'agent', id: 'ghost-no-agent' })

  anAgent('loop-end-a')
  anAgent('loop-end-b')
  setStartedBy('loop-end-a', agentRef('loop-end-b'))
  setStartedBy('loop-end-b', agentRef('loop-end-a'))

  anAgent('holder-is-secretary-end')
  makeSecretary('holder-is-secretary-end')

  // THE MARK AND THE ROUTING MUST READ ONE FACT.
  anAgent('live-session-here')
  await hold(
    'live-session-here',
    aSessionFor('live-session-here', {
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId: 'live-session-here',
          logPath: aTranscriptNow('live-session-here'),
          resumeCommand: null,
          startedAt: null,
          entryPoint: null,
        },
      },
    }),
  )

  anAgent('run-here')
  await makeReachable('run-here')

  anAgent('sandbox-here')
  await makeReachable('sandbox-here', {
    sandbox: {
      template: 'a-template',
      container: 'a-container',
      folder: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/sandboxes/a-test-sandbox`,
    },
  })

  anAgent('nothing-here')

  anAgent('dead-hold-here')
  await hold(
    'dead-hold-here',
    // NO servingAgent, AND THE BRIDGE ITS RECORD NAMES HAS ENDED: the hold is real, but a process recorded as
    // the session's own has ended and no transcript of it grew, so the session behind it answers nothing. The pid
    // is above any pid a Linux machine hands out, so no process runs under it. With no process recorded at all,
    // a beating hold would read as answering.
    t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'session',
      title: 'a session that has stopped',
      data: {
        state: 'running',
        runtime: 'codex',
        providerSession: 'a-provider-session',
        extra: { codexBridge: { pid: 2147483004, script: 'made-up-bridge.mjs', thread: 'a-provider-session' } },
      },
      actor: t.api.HUMAN,
    }).id,
  )

  anAgent('retired-here')
  retire('retired-here')

  // A RUN THAT WROTE OUTPUT RECENTLY WITH NO PROCESS. Until 27 September 2026 the dot said green here
  // while the mark said nobody. Since problem h1S1MLK-SQ1I the dot is the mark's reading, so both say
  // nobody; the routing still reads the mark.
  anAgent('dot-green-mark-nobody')
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'a run with output and no process',
    data: {
      state: 'running',
      runtime: 'claude-code',
      ranAs: [{ workspaceId: WORKSPACE, agentId: idOf('dot-green-mark-nobody') }],
      lastOutputAt: localStamp(new Date()),
    },
    actor: t.api.HUMAN,
  })

  // THE SENDER RULE: the addressee's first reachable rung is the sender itself.
  anAgent('sender-rule')
  anAgent('sender-rule-addressee')
  setStartedBy('sender-rule-addressee', agentRef('sender-rule'))
  await makeReachable('sender-rule')

  // A STORED-HANDLE RUNG: a minted id whose handle is the stored string.
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated') " +
        'ON CONFLICT(id) DO NOTHING',
    )
    .run('avatar-default-agent-MintedRung01', '2026-09-16 10:00:00')
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at, started_by_kind, started_by_id) ' +
        'VALUES (?, ?, ?, ?, 0, ?, NULL, NULL)',
    )
    .run('MintedRung01', 'Minted Rung', 'minted-rung-handle', 'avatar-default-agent-MintedRung01', '2026-09-16 10:00:00')
  anAgent('stored-handle-end')
  setStartedBy('stored-handle-end', { kind: 'agent', id: 'minted-rung-handle' })
  retire('stored-handle-end')
  await makeReachable('MintedRung01')

  // THE OFFICE'S OWN LINES.
  anAgent('office-retired-end')
  anAgent('office-retired-top')
  setStartedBy('office-retired-end', agentRef('office-retired-top'))
  await makeReachable('office-retired-top')
  retire('office-retired-end')
  anAgent('office-nothing-end')
}, 60_000)

afterAll(() => {
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file is testing.
    }
  }
  rmSync(transcripts, { recursive: true, force: true })
  app.close()
  t.close()
})

// ============================================================ the six owner endings

describe('the owner receives the letter at each ending, and the line says which one', () => {
  it('reaches the first owner who can be reached, passing over one who cannot', async () => {
    const { code, said } = await sendAsThePerson(idOf('starter-end'), 'A note for a chain')
    expect(code).toBe(409)
    const entry = routedOffTheReply(said)[0]!
    expect(entry.for).toEqual(agentRef('starter-end'))
    expect(entry.to).toEqual(agentRef('starter-top'))
    expect(entry.passedOver.map((one) => one.who.id)).toEqual([idOf('starter-mid')])
    expect(entry.said?.ending.how).toBe('an owner')
    const { theRoutedLine } = await import('../src/shared/messages.ts')
    expect(entry.line).toBe(theRoutedLine(entry.said as Parameters<typeof theRoutedLine>[0]))
  })

  async function expectsWaiting(code: number, said: Record<string, unknown>, messageId: string, addressee: string, sender: { kind: string; id: string }) {
    expect(code).toBe(409)
    const entry = routedOffTheReply(said)[0]!
    const { NO_REACHABLE_OWNER_ENDING, theRoutedLine } = await import('../src/shared/messages.ts')
    expect(entry.for).toEqual(agentRef(addressee))
    expect(entry.to).toBeNull()
    expect(entry.said?.ending.how).toBe(NO_REACHABLE_OWNER_ENDING)
    expect(entry.line).toBe(theRoutedLine(entry.said as Parameters<typeof theRoutedLine>[0]))
    expect(dataOf(messageId)['to']).toEqual([agentRef(addressee)])
    expect(dataOf(messageId)['sentBy']).toEqual(sender)
    expect(deliveriesOf(messageId).map((one) => [one.recipientId, one.mark])).toEqual([[idOf(addressee), 'queued']])
  }

  it('keeps the original waiting when the chain has no reachable agent', async () => {
    const { code, said, messageId } = await sendAsAgent('the-sender', idOf('no-secretary-end'), 'A note for a quiet owner')
    await expectsWaiting(code, said, messageId, 'no-secretary-end', agentRef('the-sender'))
  })

  it('keeps the original waiting when the responsible secretary is unreachable', async () => {
    const { code, said, messageId } = await sendAsAgent('the-sender', idOf('secretary-end'), 'A note for the secretary chain')
    await expectsWaiting(code, said, messageId, 'secretary-end', agentRef('the-sender'))
  })

  it('leaves a letter with an addressee that has no recorded owner', async () => {
    const { said } = await sendAsAgent('the-sender', 'no-starter-end', 'A note with no recorded owner')
    const entry = routedOffTheReply(said)[0]!
    expect(entry.to).toBeNull()
    const { theRoutedLine, OWNERLESS_ROUTING_ENDING } = await import('../src/shared/messages.ts')
    expect(entry.said?.ending.how).toBe(OWNERLESS_ROUTING_ENDING)
    expect(entry.said?.ending.how).toBeTruthy()
    expect(entry.said?.addressee).toBe('no-starter-end')
    expect(entry.line).toBe(theRoutedLine(entry.said as Parameters<typeof theRoutedLine>[0]))
    expect(entry.line).not.toContain(idOf('no-starter-end'))
  })

  it('keeps the original waiting when the last owner has no owner recorded', async () => {
    const { code, said, messageId } = await sendAsAgent('the-sender', idOf('no-starter-mid-end'), 'A note that stops a rung up')
    await expectsWaiting(code, said, messageId, 'no-starter-mid-end', agentRef('the-sender'))
  })

  it('leaves a letter with its addressee when its owner cannot be resolved', async () => {
    const { said } = await sendAsAgent('the-sender', 'bad-name-end', 'A note to a name nobody answers')
    const entry = routedOffTheReply(said)[0]!
    expect(entry.to).toBeNull()
    const { theRoutedLine, BROKEN_OWNERS_ROUTING_ENDING } = await import('../src/shared/messages.ts')
    expect(entry.said?.ending.how).toBe(BROKEN_OWNERS_ROUTING_ENDING)
    expect(entry.said?.ending.how).toBeTruthy()
    expect(entry.said?.addressee).toBe('bad-name-end')
    expect(entry.line).toBe(theRoutedLine(entry.said as Parameters<typeof theRoutedLine>[0]))
    expect(entry.line).not.toContain(idOf('bad-name-end'))
  })

  it('leaves a letter with its addressee when the owner chain goes round', async () => {
    const { said } = await sendAsAgent('the-sender', 'loop-end-a', 'A note round a loop')
    const entry = routedOffTheReply(said)[0]!
    expect(entry.to).toBeNull()
    const { theRoutedLine, BROKEN_OWNERS_ROUTING_ENDING } = await import('../src/shared/messages.ts')
    expect(entry.said?.ending.how).toBe(BROKEN_OWNERS_ROUTING_ENDING)
    expect(entry.said?.ending.how).toBeTruthy()
    expect(entry.said?.addressee).toBe('loop-end-a')
    expect(entry.line).toBe(theRoutedLine(entry.said as Parameters<typeof theRoutedLine>[0]))
    expect(entry.line).toContain('loop-end-b')
    expect(entry.line).not.toContain(idOf('loop-end-b'))
  })

  it('keeps a secretary addressee without an owner in its own queue', async () => {
    const { said } = await sendAsAgent('the-sender', 'holder-is-secretary-end', 'A note for a secretary addressee')
    expect(routedOffTheReply(said)[0]!.to).toBeNull()
  })

  it('makes no copy when a person writes to an agent with no owner', async () => {
    const { code, said, messageId } = await sendAsThePerson('no-starter-end', 'A person writes to an agent')
    expect(code).toBe(409)
    expect(routedOffTheReply(said)[0]!.to).toBeNull()
    expect(deliveriesOf(messageId).map((one) => one.recipientId)).toEqual([idOf('no-starter-end')])
  })

  it('keeps the original waiting when a person sends up an unreachable chain', async () => {
    const { code, said, messageId } = await sendAsThePerson(idOf('no-secretary-end'), 'A person writes up a chain')
    await expectsWaiting(code, said, messageId, 'no-secretary-end', { kind: 'person', id: THE_PERSON })
  })

  it('resolves a stored handle for an owner through the one agent bearing it', async () => {
    const { code, said } = await sendAsThePerson(idOf('stored-handle-end'), 'A note to a stored handle')
    expect(code).toBe(409)
    expect(routedOffTheReply(said)[0]!.to).toEqual({ kind: 'agent', id: 'MintedRung01' })
  })
})

// ============================================================ the mark and the routing agree

describe('the chat’s mark and the routing read one fact', () => {
  /** Both readings of one agent, named here by handle. The library functions take its registry id. */
  async function bothReadings(handle: string): Promise<{ reach: string | null; how: string; dot: string }> {
    const agentId = idOf(handle)
    const { whoIsAnsweringAs, whyThisAgentCannotBeReached } = await import('../src/server/lib/worker.ts')
    const { participantPresence } = await import('../src/server/lib/presence.ts')
    const reach = whyThisAgentCannotBeReached(agentId, WORKSPACE)
    return {
      reach: reach === null ? null : reach.was,
      how: whoIsAnsweringAs(agentId, WORKSPACE).how,
      dot: participantPresence({ kind: 'agent', id: agentId }, WORKSPACE).colour,
    }
  }

  it('agrees for a live session, a run, a sandbox run, nothing and a dead hold', async () => {
    const live = await bothReadings('live-session-here')
    expect(live.how).toBe('a live session')
    expect(live.reach).toBeNull()

    const run = await bothReadings('run-here')
    expect(run.how).toBe('a run')
    expect(run.reach).toBeNull()

    const sandbox = await bothReadings('sandbox-here')
    expect(sandbox.how).toBe('a run')
    expect(sandbox.reach).toBeNull()

    const nothing = await bothReadings('nothing-here')
    expect(nothing.how).toBe('nobody')
    expect(nothing.reach).toBe('nothing answering')

    // A HOLD WHOSE RECORDED PROCESS HAS ENDED IS NOBODY, not a live session.
    const dead = await bothReadings('dead-hold-here')
    expect(dead.how).toBe('nobody')
    expect(dead.reach).toBe('nothing answering')
  })

  it('routes a registered agent with recent output and nothing answering, which the dot no longer calls green', async () => {
    const reading = await bothReadings('dot-green-mark-nobody')
    // THE DOT AND THE MARK ARE ONE READING NOW (problem h1S1MLK-SQ1I), so recent output alone is grey.
    expect(reading.dot, 'the dot is green beside a mark that says nobody').toBe('grey')
    expect(reading.how).toBe('nobody')
    expect(reading.reach).toBe('nothing answering')
    const { code, said } = await sendAsThePerson('dot-green-mark-nobody', 'A note for a dot-green agent')
    expect(code, JSON.stringify(said)).toBe(409)
    expect(routedOffTheReply(said)).toHaveLength(1)
  })

  it('routes a retired agent, whose reading is the red reason', async () => {
    const reading = await bothReadings('retired-here')
    expect(reading.reach).toBe('retired')
  })
})

// ============================================================ the shape of the copy

describe('the addressee is kept and one more row is written for the chosen participant', () => {
  it('leaves data.to alone, writes data.routed, and makes a second delivery row', async () => {
    const { said, messageId } = await sendAsThePerson(idOf('starter-end'), 'The addressee keeps its words')
    const data = dataOf(messageId)
    // THE ADDRESSEE IS NEVER REPLACED AND THE WORDS ARE NEVER REWRITTEN.
    expect(data['to']).toEqual([agentRef('starter-end')])
    expect(data['body']).toBe('The addressee keeps its words')
    const routed = data['routed'] as { to: { kind: string; id: string } }[]
    expect(routed).toHaveLength(1)
    expect(routed[0]!.to).toEqual(agentRef('starter-top'))
    // TWO ROWS: the addressee's own, and the copy's, tagged as the routing's.
    const rows = deliveriesOf(messageId)
    expect(rows.map((one) => one.recipientId).sort()).toEqual([idOf('starter-end'), idOf('starter-top')].sort())
    expect(rows.find((one) => one.recipientId === idOf('starter-top'))!.inferredBy).toBe('the routing')
    expect(routedOffTheReply(said)[0]!.line).toBe((data['routed'] as { line: string }[])[0]!.line)
  })
})

// ============================================================ the sender rule

describe('the sender is the first reachable one, so no copy is made', () => {
  it('carries the entry with to null and writes only the addressee’s row', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('sender-rule'),
      payload: {
        kind: 'message',
        title: 'a note to a closed addressee',
        data: { to: [{ kind: 'agent', id: 'sender-rule-addressee' }], body: 'A note from the sender itself' },
      },
    })
    const said = reply.json() as Record<string, unknown>
    expect(reply.statusCode, JSON.stringify(said)).toBe(409)
    const entry = routedOffTheReply(said)[0]!
    expect(entry.to).toBeNull()
    expect(entry.for).toEqual(agentRef('sender-rule-addressee'))
    expect(entry.said?.ending.how).toBe('the owner sent it')
    const messageId = (said['record'] as { id: string }).id
    const rows = deliveriesOf(messageId)
    expect(rows.map((one) => one.recipientId)).toEqual([idOf('sender-rule-addressee')])
  })
})

// ============================================================ the answer

describe('what the send answers', () => {
  it('answers 409 for a person’s send to a retired addressee, with the routing in the reply', async () => {
    const { code, said } = await sendAsThePerson(idOf('starter-end'), 'A person writes to a retired agent')
    expect(code, JSON.stringify(said)).toBe(409)
    expect(routedOffTheReply(said)).toHaveLength(1)
  })

  it('answers 409 for a person’s send to a registered addressee nothing answers as, with the routing in the reply', async () => {
    const { code, said } = await sendAsThePerson('nothing-here', 'A person writes to a quiet agent')
    expect(code, JSON.stringify(said)).toBe(409)
    expect(routedOffTheReply(said)).toHaveLength(1)
    expect(said['error']).toBe(routedOffTheReply(said)[0]!.line)
    // THE WORD IS READ FOR THE SAME AGENT, not copied into this file.
    const { participantPresence } = await import('../src/server/lib/presence.ts')
    const word = participantPresence({ kind: 'agent', id: idOf('nothing-here') }, WORKSPACE).word
    const reason = String(said['reason'] ?? '')
    expect(reason.toLowerCase(), `the reason does not name ${word}`).toContain(word.toLowerCase())
    expect(reason.toLowerCase(), 'the reason calls an unheld agent retired').not.toContain('retired')
  })

  it('keeps M110’s 409 for an agent’s own send to a retired agent, writing nothing', async () => {
    const before = t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('sender-rule'),
      payload: { kind: 'message', title: 'refused', data: { to: [{ kind: 'agent', id: idOf('starter-end') }], body: 'no' } },
    })
    expect(reply.statusCode, reply.body).toBe(409)
    const after = t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }
    expect(after.n, 'a refused send writes nothing').toBe(before.n)
  })
})

// ============================================================ the office's own lines

describe('an office line routes on retired and not on nothing answering', () => {
  it('gives the office line to the chain when the addressee is retired, and logs the line', async () => {
    const lines: string[] = []
    const printed = vi.spyOn(console, 'log').mockImplementation((...parts) => {
      lines.push(parts.map((one) => String(one)).join(' '))
    })
    try {
      const line: AnOfficeLine = { line: 'The check of your piece of work is done.', said: null, notice: 'aCounterFired' }
      const wrote = groups.writeASystemLineToOne(agentRef('office-retired-end'), WORKSPACE, line, {
        type: 'agent',
        id: THE_TEST_OFFICES_SECRETARY.handle,
      })
      const data = dataOf(wrote.id)
      expect(data['to']).toEqual([agentRef('office-retired-end')])
      expect(String(data['body'])).toBe('The check of your piece of work is done.')
      const routed = data['routed'] as { to: { kind: string; id: string }; line: string }[]
      expect(routed).toHaveLength(1)
      expect(routed[0]!.to).toEqual(agentRef('office-retired-top'))
      const rows = deliveriesOf(wrote.id)
      expect(rows.map((one) => one.recipientId).sort()).toEqual([idOf('office-retired-end'), idOf('office-retired-top')].sort())
      expect(lines.some((one) => one.includes(routed[0]!.line)), JSON.stringify(lines)).toBe(true)
    } finally {
      printed.mockRestore()
    }
  })

  it('leaves an office line to a registered agent nothing answers as exactly as it was', async () => {
    const line: AnOfficeLine = { line: 'A reminder with nobody there.', said: null, notice: 'aCounterFired' }
    const wrote = groups.writeASystemLineToOne(agentRef('office-nothing-end'), WORKSPACE, line, {
      type: 'agent',
      id: THE_TEST_OFFICES_SECRETARY.handle,
    })
    const data = dataOf(wrote.id)
    expect(data['routed']).toBeUndefined()
    expect(data['to']).toEqual([agentRef('office-nothing-end')])
    expect(String(data['body'])).toBe('A reminder with nobody there.')
    expect(deliveriesOf(wrote.id).map((one) => one.recipientId)).toEqual([idOf('office-nothing-end')])
  })
})

// ============================================================ a run's reply

describe("a run's reply is routed, and the process log carries its line", () => {
  it('keeps data.to, adds a delivery row for the reached starter, and logs the line when the addressee is retired', () => {
    const lines: string[] = []
    const printed = vi.spyOn(console, 'log').mockImplementation((...parts) => {
      lines.push(parts.map((one) => String(one)).join(' '))
    })
    try {
      const { messageId, data } = aRunsReply(idOf('starter-end'), 'The run says the piece of work is finished.')
      // THE ADDRESSEE IS NEVER REPLACED.
      expect(data['to']).toEqual([agentRef('starter-end')])
      const routed = data['routed'] as { to: { kind: string; id: string }; line: string }[]
      expect(routed).toHaveLength(1)
      expect(routed[0]!.to).toEqual(agentRef('starter-top'))
      expect(routed[0]!.line).toBeTruthy()
      // ONE MORE DELIVERY ROW, TAGGED AS THE ROUTING'S.
      const rows = deliveriesOf(messageId)
      expect(rows.map((one) => one.recipientId).sort()).toEqual([idOf('starter-end'), idOf('starter-top')].sort())
      expect(rows.find((one) => one.recipientId === idOf('starter-top'))!.inferredBy).toBe('the routing')
      // A RUN'S REPLY HAS NO CALLER TO ANSWER, so the process log says where it went.
      expect(lines.some((one) => one.includes(routed[0]!.line)), JSON.stringify(lines)).toBe(true)
    } finally {
      printed.mockRestore()
    }
  })

  it('routes to the owner and logs the line when nothing answers as the addressee', () => {
    const lines: string[] = []
    const printed = vi.spyOn(console, 'log').mockImplementation((...parts) => {
      lines.push(parts.map((one) => String(one)).join(' '))
    })
    try {
      const { messageId, data } = aRunsReply(idOf('nothing-here'), 'The run says the piece of work is finished.')
      expect(data['to']).toEqual([agentRef('nothing-here')])
      const routed = data['routed'] as { to: { kind: string; id: string } | null; line: string }[]
      expect(routed).toHaveLength(1)
      expect(routed[0]!.to).toBeNull()
      const rows = deliveriesOf(messageId)
      expect(rows.map((one) => one.recipientId)).toEqual([idOf('nothing-here')])
      expect(lines.some((one) => one.includes(routed[0]!.line)), JSON.stringify(lines)).toBe(true)
    } finally {
      printed.mockRestore()
    }
  })
})

describe("a check of a run's reply logs no routed line", () => {
  it('prints the routed line when the reply is written, and nothing when it is only checked', async () => {
    const { writeOrCheck } = await import('../src/server/lib/only-a-check.ts')
    const lines: string[] = []
    const printed = vi.spyOn(console, 'log').mockImplementation((...parts) => {
      lines.push(parts.map((one) => String(one)).join(' '))
    })
    try {
      // THE CONTROL: written, the routed line is printed.
      const { data } = writeOrCheck('write', () => aRunsReply(idOf('starter-end'), 'The run says this one is written.'))
      const routedLine = (data['routed'] as { line: string }[])[0]!.line
      expect(lines.filter((one) => one.includes(routedLine)), JSON.stringify(lines)).toHaveLength(1)
      // CHECKED, the same reply prints nothing and is not stored.
      lines.length = 0
      const before = t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }
      const checked = writeOrCheck('check', () => aRunsReply(idOf('starter-end'), 'The run says this one is only checked.'))
      expect((checked.data['routed'] as { line: string }[])[0]!.line, 'the check did not route, so it proves nothing').toBe(routedLine)
      expect(lines.filter((one) => one.includes(routedLine)), JSON.stringify(lines)).toEqual([])
      const after = t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }
      expect(after.n, 'the check wrote a message').toBe(before.n)
    } finally {
      printed.mockRestore()
    }
  })
})

// ============================================================ the fourth envelope line

describe('the hand-over envelope says when this recipient got a routed copy', () => {
  it('carries the line on the full queue row and never on the narrow one', async () => {
    const { messageId } = await sendAsThePerson(idOf('starter-end'), 'A note the envelope must explain')
    const { theQueue } = await import('../src/server/lib/worker.ts')
    // THE NARROW ROW IS IDS AND SMALL FIELDS AND NO WORDS, and the routed line is words.
    const narrow = theQueue(WORKSPACE).find((one) => one.messageId === messageId && one.to.id === idOf('starter-top'))
    expect(narrow, 'the routed copy must be on the narrow queue').toBeTruthy()
    expect(Object.hasOwn(narrow ?? {}, 'routedLine'), 'the narrow row leaked the routed words').toBe(false)
    // THE FULL ROW CARRIES IT, BESIDE THE BODY.
    const full = theQueue(WORKSPACE, { full: true }).filter((one) => one.messageId === messageId)
    const toTheCopy = full.find((one) => one.to.id === idOf('starter-top'))
    const toTheAddressee = full.find((one) => one.to.id === idOf('starter-end'))
    expect(toTheCopy?.routedLine).toBeTruthy()
    expect(toTheAddressee?.routedLine).toBeNull()
    // AND THE ENVELOPE ITSELF PUTS IT ON THE FOURTH LINE, ONLY WHEN IT IS GIVEN.
    const { deliveryEnvelope } = await import('../src/shared/messages.ts')
    const withIt = deliveryEnvelope({
      from: 'agent x',
      inProject: WORKSPACE,
      message: messageId,
      routedLine: toTheCopy!.routedLine,
    })
    expect(withIt).toHaveLength(4)
    expect(withIt[3]).toBe(`ROUTED TO YOU: ${toTheCopy!.routedLine}`)
    const withoutIt = deliveryEnvelope({ from: 'agent x', inProject: WORKSPACE, message: messageId })
    expect(withoutIt).toHaveLength(3)
  })
})

// ============================================================ dead letters

describe('a routed letter is not also broadcast as a dead letter', () => {
  it('leaves the routed addressee out of the dead letters', async () => {
    const { messageId } = await sendAsThePerson(idOf('starter-end'), 'A routed letter must not be broadcast twice')
    const { deadLettersNow } = await import('../src/server/lib/deadletters.ts')
    // THE ROW IS QUEUED FOR A RETIRED ADDRESSEE, so without the skip it would be a dead letter.
    expect(deliveriesOf(messageId).some((one) => one.recipientId === idOf('starter-end'))).toBe(true)
    expect(deadLettersNow().some((one) => one.messageId === messageId)).toBe(false)
  })
})
