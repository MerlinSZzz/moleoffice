// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY READS THE PROCESS ROWS ONCE AND ONLY THE READER'S PART OF THE MESSAGES, AND ITS ANSWER
 * IS THE SAME, BYTE FOR BYTE, AS THE ANSWER MAIN'S READINGS GIVE. Problem iZtwtr12RSxw.
 *
 * MEASURED FIRST, 27 September 2026, on a copy of the owner's office (wave 13j round 3, the work on the doors): one
 * call of GET /api/office/embassy took about 580 ms alone. The CPU profile put two avoidable costs in
 * it. `participantPresence` read the unreleased process rows again for every agent row, because the
 * Embassy handed it the machine, the session rows and the waiting runs but not the process rows.
 * And the contact column read every message of every project, where the contacts door reads only
 * the reader's part (`theMessagesOfOneReader`). The Embassy now takes both from the readings the
 * roster and the contacts door use (`thePresenceReadingsOf`, `theContactsOfOneReader`).
 *
 * WHAT IS PROVED HERE, on an app built by the product:
 *
 *   1. THE SAME ANSWER. The two readings are swapped, inside this test, for the ones main made: the
 *      process rows read afresh for every row, and the contacts worked out from the whole pool. The
 *      door's reply with main's readings and with the code's own readings must be the same text.
 *      The clock is held still for both, so a sentence that names a time cannot differ.
 *   2. THE PROCESS ROWS ARE READ ONCE, with three agents and again with six.
 *   3. THE CONTACTS COST WHAT THE READER'S MESSAGES COST. Thirty more messages between two agents
 *      leave the number of messages the Embassy builds where it was. Main built every message.
 *
 * HOW A READ IS COUNTED. Every statement the database runs during one request is counted by its SQL,
 * at the statement, as tests/the-embassy-reads-once-per-request.test.ts does. The process rows are
 * the statement that joins `session_resources` to the session records. Every message that is built
 * has its delivery rows read in one statement with one `?` per message (`deliveriesOfMany`), so the
 * largest number of `?` in a delivery read is the number of messages built, as
 * tests/the-contacts-come-from-the-readers-own-messages.test.ts counts it.
 *
 * MUTATIONS, one at a time (written in the commit message with the commands and log paths):
 *   - in `theEmbassy` (src/server/api/office.ts), leave `processes` out of the call to
 *     `participantPresence`: case 2 goes red.
 *   - in `theContactsOfOneReader` (src/server/lib/messages.ts), let `contactsFor` read the whole
 *     pool: case 3 goes red.
 *   - in `theEmbassy`, hand `participantPresence` process rows that hold nothing: case 2 goes red
 *     (the rows are never read). Case 1 stays green, and that is right since wave 13j round 3: a
 *     live process row alone does not make an agent green (M4, M74, M126 as amended). The live
 *     agent is green because a run serving it is still running with a live process, which the
 *     answering reading (`theRunRowServing` in src/server/lib/worker.ts) reads from the machine's
 *     own reading of that run, not from these rows. These rows now change only the words beside a
 *     grey dot. Checked on 27 September 2026: with the rows emptied, 1 failed (case 2), 2 passed.
 *   - in `theEmbassy`, place the contacts with no registry rows (`asContactsToPlace(..., new Map())`):
 *     case 1 goes red, because the retired agent no longer sits in the retired group.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'

/** Which readings the two swapped functions below give: the code's own, or the ones main made. */
const readings = vi.hoisted(() => ({ as: 'the code' as 'the code' | 'main' }))

vi.mock('../src/server/lib/presence.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/server/lib/presence.ts')>()
  return {
    ...real,
    thePresenceReadingsOf: (...args: Parameters<typeof real.thePresenceReadingsOf>) => {
      const shared = real.thePresenceReadingsOf(...args)
      // MAIN'S READING: the machine, the session rows and the waiting runs once for the table, and
      // the process rows again for every row, which is what `participantPresence` did when the
      // Embassy handed it no process rows.
      return readings.as === 'the code' ? shared : { ...shared, processes: () => real.theUnreleasedProcessRows() }
    },
  }
})

vi.mock('../src/server/lib/messages.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/server/lib/messages.ts')>()
  return {
    ...real,
    theContactsOfOneReader: (me: Parameters<typeof real.theContactsOfOneReader>[0]) => {
      if (readings.as === 'the code') return real.theContactsOfOneReader(me)
      // MAIN'S READING: `contactsFor` with its own default, the whole pool of every project. The
      // Embassy does not use the pool, so none is handed back.
      return { contacts: real.contactsFor(me, real.everybodyRegistered(), real.EVERY_PROJECT), pool: [], agents: real.everyAgentById() }
    },
  }
})

type Ref = { kind: 'person' | 'agent'; id: string }

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})
const PERSON: Ref = { kind: 'person', id: THE_PERSON }

/** The registry id of every agent this file registered, by handle. */
const agentIds = new Map<string, string>()
const agent = (handle: string): Ref => ({ kind: 'agent', id: agentIds.get(handle) ?? handle })

/**
 * One agent registered through the ordinary door, with one run of its own and a live process row
 * on that run, as tests/the-embassy-reads-once-per-request.test.ts builds them.
 */
async function anAgentWithAProcess(handle: string, runData: Record<string, unknown> = {}): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle, name: handle, role: 'worker', runtime: 'claude-code', workArea: ['src'] },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const made = reply.json() as { agent: { id: string }; record: string }
  agentIds.set(handle, made.agent.id)
  const run = historicalSession(t, {
    workspaceId: 'default',
    actor: { type: 'agent', id: handle },
    kind: 'session',
    title: `A run of ${handle}`,
    data: { servingAgentId: made.agent.id, ranAs: [{ workspaceId: 'default', agentId: made.record }], ...runData },
  })
  t.client.sqlite
    .prepare(
      'INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) ' +
        "VALUES (?, 'default', ?, 'process', ?, '{}', ?, ?)",
    )
    .run(`process-of-${handle}`, run.id, `pid:${handle}`, localStamp(new Date()), handle)
}

/**
 * Transcripts this file writes. The live agent's run carries one, as a run a person's tool started
 * would. It does not decide the dot: since wave 13j round 3 an agent is green only when something
 * answers as it, here the running run whose process row is alive (M4, M74, M126 as amended).
 */
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-embassy-once-'))

/**
 * AN AGENT WHOSE RUN IS ANSWERING: a running run that serves it, with this test's own process
 * registered on that run through the resources door. The answering reading finds the run alive from
 * the machine's reading of that process, so the agent reads green on the Embassy.
 */
async function anAgentWithALiveProcess(handle: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, workArea: ['src'] } })
  expect(reply.statusCode, reply.body).toBe(201)
  agentIds.set(handle, (reply.json() as { agent: { id: string } }).agent.id)
  const logPath = join(transcripts, `${handle}.jsonl`)
  writeFileSync(
    logPath,
    `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'the answer' }] } })}\n`,
  )
  const session = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'session',
      title: `a run of ${handle}`,
      data: {
        state: 'running',
        servingAgent: handle,
        extra: { discovered: { tool: 'claude-code', externalId: `embassy-once-${handle}`, logPath, resumeCommand: null, startedAt: null, entryPoint: null } },
      },
    },
  })
  expect(session.statusCode, session.body).toBe(201)
  const sessionId = (session.json() as { record: { id: string } }).record.id
  const row = await app.inject({
    method: 'POST',
    url: '/api/resources',
    headers: asAgent(handle),
    payload: { sessionRecordId: sessionId, type: 'process', key: String(process.pid), detail: `this test process, for ${handle}`, adopting: 'this test process started before the session the test filed for it' },
  })
  expect(row.statusCode, row.body).toBe(201)
}

/** One message through the create door, answered `expected`, giving back its record id. */
async function say(headers: Record<string, string>, to: Ref, body: string, expected = 201): Promise<string> {
  const made = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'message', title: body, data: { body, to: [to] } } })
  expect(made.statusCode, made.body).toBe(expected)
  return (made.json() as { record: { id: string } }).record.id
}

/**
 * A MESSAGE KEPT BETWEEN TWO AGENTS. The create door copies a message between two agents nobody is
 * running to the person; this takes the copy back, so the message is in the
 * whole pool and not in the person's part of it.
 */
function keepBetweenTheTwo(id: string, to: Ref): void {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  const data = JSON.parse(row.data) as Record<string, unknown>
  delete data['routed']
  writeDataBypassingTheGate(t, id, data)
  t.client.sqlite.prepare('DELETE FROM message_delivery WHERE message_id = ?').run(id)
  t.client.sqlite
    .prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, 'queued', ?)")
    .run(`${id}-d0`, id, to.kind, to.id, '2026-09-27 10:00:00')
}

async function embassyText(): Promise<string> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/embassy', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.body
}

/** The SQL of every statement the database runs while `act` runs, one entry per run. */
async function statementsRunDuring(act: () => Promise<unknown>): Promise<string[]> {
  const statement = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, unknown>
  const seen: string[] = []
  const kept = new Map<string, unknown>()
  for (const name of ['all', 'get', 'iterate', 'run']) {
    const original = statement[name] as (this: { source: string }, ...args: unknown[]) => unknown
    kept.set(name, original)
    statement[name] = function (this: { source: string }, ...args: unknown[]) {
      seen.push(this.source)
      return original.apply(this, args)
    }
  }
  try {
    await act()
  } finally {
    for (const [name, original] of kept) statement[name] = original
  }
  return seen
}

/** How many times the unreleased process rows were read (`theUnreleasedProcessRows`). */
const processRowReads = (statements: readonly string[]): number =>
  statements.filter((sql) => sql.includes('FROM session_resources r LEFT JOIN records s ON s.id = r.session_record_id')).length

/** The most messages any one delivery read built (`deliveriesOfMany`: one `?` per message). */
const mostMessagesBuilt = (statements: readonly string[]): number =>
  Math.max(0, ...statements.filter((sql) => /from "message_delivery"/i.test(sql)).map((sql) => (sql.match(/\?/g) ?? []).length))

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // A RUN WAITING FOR THE NEXT MESSAGE, a large idle run and a plain one, as the older Embassy test.
  await anAgentWithAProcess('embassy-once-waiting', {
    deliveringMessage: 'a-message-it-answered',
    providerSession: 'provider-session-of-embassy-once-waiting',
    runtime: 'claude-code',
    waitsUntil: localStamp(new Date(Date.now() + 5 * 60_000)),
  })
  await anAgentWithAProcess('embassy-once-expensive', {
    usageReceipt: { runtime: 'claude-code', model: 'claude-sonnet-5', inputTokens: 250000, inputIncludesCached: true },
    lastOutputAt: '2026-09-01 00:00:00',
  })
  await anAgentWithAProcess('embassy-once-plain')
  await anAgentWithALiveProcess('embassy-once-live')

  // CONTACTS FOR THE PERSON: conversations both ways, and one agent moved into a group the owner made.
  await say(AS_THE_PERSON, agent('embassy-once-waiting'), 'hello waiting')
  await say(asAgent('embassy-once-expensive'), PERSON, 'expensive writes to the person')
  await say(asAgent('embassy-once-plain'), PERSON, 'plain writes to the person')
  // A RETIRED AGENT THAT WROTE TO THE OWNER, which the contacts place in the retired group (criterion M121).
  const retiring = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'embassy-once-retired', name: 'embassy-once-retired', workArea: ['src'] } })
  expect(retiring.statusCode, retiring.body).toBe(201)
  agentIds.set('embassy-once-retired', (retiring.json() as { agent: { id: string } }).agent.id)
  await say(asAgent('embassy-once-retired'), PERSON, 'retired writes to the person before it goes')
  const retired = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${agentIds.get('embassy-once-retired') ?? ''}/retire`,
    headers: AS_THE_PERSON,
    payload: { because: 'its work for this test is done' },
  })
  expect(retired.statusCode, retired.body).toBe(200)
  const made = await app.inject({
    method: 'POST',
    url: '/api/messages/contact-groups',
    headers: AS_THE_PERSON,
    payload: { name: 'Agents I watch', side: 'agent' },
  })
  expect(made.statusCode, made.body).toBe(201)
  const group = (made.json() as { group: { key: string } }).group.key
  const contacts = await app.inject({ method: 'GET', url: '/api/messages/contacts', headers: AS_THE_PERSON })
  expect(contacts.statusCode, contacts.body).toBe(200)
  const plainKey = (contacts.json() as { contacts: { key: string; who: Ref | null }[] }).contacts.find(
    (one) => one.who?.id === agentIds.get('embassy-once-plain'),
  )?.key
  expect(plainKey, 'the plain agent is one of the person\'s contacts').toBeDefined()
  const moved = await app.inject({
    method: 'POST',
    url: '/api/messages/contact-placements',
    headers: AS_THE_PERSON,
    payload: { contact: plainKey, group },
  })
  expect(moved.statusCode, moved.body).toBe(200)
}, 60_000)

afterAll(async () => {
  readings.as = 'the code'
  await app.close()
  t.close()
  rmSync(transcripts, { recursive: true, force: true })
})

describe('GET /api/office/embassy', () => {
  it("answers the same text with main's readings and with its own", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date())
      readings.as = 'main'
      const mains = await embassyText()
      readings.as = 'the code'
      const own = await embassyText()
      expect(own, 'the same reply, byte for byte').toBe(mains)
      // THE SEEDS DID WHAT THEY ARE FOR, or the comparison would prove nothing about them.
      const contacts = await app.inject({ method: 'GET', url: '/api/messages/contacts', headers: AS_THE_PERSON })
      const retiredGroupName = (contacts.json() as { contactGroups: { key: string; name: string }[] }).contactGroups.find((one) => one.key === 'retired')?.name
      expect(retiredGroupName, 'the contacts have a retired group').toBeDefined()
      const said = JSON.parse(own) as { rows: { who: Ref; contact: boolean; group: string | null; presence: { colour: string } | null }[] }
      const rowOf = (handle: string) => said.rows.find((one) => one.who.kind === 'agent' && one.who.id === agentIds.get(handle))
      expect(rowOf('embassy-once-plain')?.group, 'the moved contact sits in the group the owner made').toBe('Agents I watch')
      expect(rowOf('embassy-once-expensive')?.contact, 'an agent that wrote to the owner is a contact').toBe(true)
      expect(rowOf('embassy-once-waiting')?.presence?.colour, 'the waiting run makes its agent reachable').toBe('green')
      expect(rowOf('embassy-once-live')?.presence?.colour, 'the running run with a live process makes its agent reachable').toBe('green')
      expect(rowOf('embassy-once-retired')?.contact, 'the retired agent is still a contact').toBe(true)
      expect(rowOf('embassy-once-retired')?.group, 'and it sits in the retired group').toBe(retiredGroupName)
    } finally {
      readings.as = 'the code'
      vi.useRealTimers()
    }
  })

  it('reads the process rows once, however many agents there are', async () => {
    const withThree = processRowReads(await statementsRunDuring(embassyText))
    for (const handle of ['embassy-once-fourth', 'embassy-once-fifth', 'embassy-once-sixth']) await anAgentWithAProcess(handle)
    const withSix = processRowReads(await statementsRunDuring(embassyText))
    expect({ withThree, withSix }, 'the process rows are read once for the whole table').toEqual({ withThree: 1, withSix: 1 })
  })

  it("builds only the reader's messages for the contact column", async () => {
    const before = mostMessagesBuilt(await statementsRunDuring(embassyText))
    for (let i = 0; i < 30; i++) {
      // NOTHING HOLDS embassy-once-fifth IN THE TEST OFFICE, so the office stores each message, routes it and answers 409.
      // The message is stored all the same, and the line below keeps it between the two.
      const id = await say(asAgent('embassy-once-fourth'), agent('embassy-once-fifth'), `between two agents ${String(i)}`, 409)
      keepBetweenTheTwo(id, agent('embassy-once-fifth'))
    }
    const after = mostMessagesBuilt(await statementsRunDuring(embassyText))
    expect(before, 'the contact column builds the person\'s messages').toBeGreaterThan(0)
    expect(after, 'thirty messages the owner is not in add nothing to what the Embassy builds').toBe(before)
  })
})
