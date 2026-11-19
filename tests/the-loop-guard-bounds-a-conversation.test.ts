// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** Previously fake-runtime exits needed no submitted work. This fixture now registers a record area when absent and submits an explicit completion note through the real sealer; all original delivery and timing assertions remain. */
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/** Previously successful runtime exits needed no submission. This fixture now supplies a record manifest of a fixture completion note at finish; every new run uses the real sealer and the original loop assertions remain. */
/**
 * TWO AGENTS IN A GROUP STOP AFTER A WHILE, AND A LINE MOLE OFFICE WROTE STARTS NO RUN.
 *
 * Problem `jN0TdeawNlZZ`, measured by another builder on 4 September 2026: a group holding two agents
 * went from forty messages to seventy-eight in twenty minutes with nobody writing one. Each agent's
 * words reached the other through the group, the worker started a run for the other agent, and that
 * run's words came back. With a real tool every one of those hops is a model call on the owner's
 * account.
 *
 * The guard the worker had counted `inReplyTo` back to the last message a person sent. That bounds a
 * chain of replies. It does not bound a conversation, because a message an agent writes for itself
 * answers nothing, so the count is zero however long the group has been talking.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. The server is real and listening; the group, the messages, the
 * delivery rows and the system lines are all real rows. The agent tool is `tests/fake-runtime.mjs`,
 * a real process that prints a reply and exits. Nothing here spends a model call.
 *
 * Criteria M9 and M11 of design/messages/ACCEPTANCE.md.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let outputs: string
let settings: WorkerSettings
/** Every run this file's worker has going. One list, carried between passes, as the worker does. */
const watching: Parameters<typeof onePass>[1] = []
/** What `MOLE_OFFICE_AGENT_HOPS` said before this file set it, so it is put back. */
let hopsBefore: string | undefined

/** The limit this file is written against, set in the environment below so the server reads the same. */
const ALLOWED = 3

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The headers one agent writes with. An agent is named by its handle, as every actor id is. */
function asAgent(handle: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
  }
}

async function post(path: string, body: unknown, headers = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string, headers = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

/** Register a durable agent and give back its registry id. */
async function anAgent(handle: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code', workArea: ['records'] },
  })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

/** What the queue says about every message waiting for a run. */
interface QueueEntry {
  messageId: string
  to: { kind: string; id: string }
  needsNoRun: string | null
  conversationIsWaiting: string | null
}

async function theQueue(): Promise<QueueEntry[]> {
  const read = (await get('/api/worker/queue')) as { queue?: QueueEntry[] }
  return read.queue ?? []
}

/** How far one message got with one recipient, and what the row says about it. */
async function delivery(
  messageId: string,
  who: string,
): Promise<{ mark: string; because: string | null }> {
  const read = (await get(`/api/messages/${messageId}`)) as {
    message?: { deliveries?: { to: { id: string }; mark: string; because: string | null }[] }
  }
  return one(
    (read.message?.deliveries ?? []).filter((row) => row.to.id === who),
    `a delivery row of ${messageId} for ${who}`,
  )
}

/** Everything said in one group, oldest first. */
async function said(groupId: string): Promise<{ id: string; body: string; sentBy: { id: string } | null }[]> {
  const read = (await get(`/api/groups/${groupId}`)) as {
    messages?: { id: string; body: string; sentBy: { id: string } | null }[]
  }
  return read.messages ?? []
}

/** Write one message into a group, as whoever the headers say. */
/**
 * AND THE PERSON PRESSES TO START AN AGENT FOR IT, because these cases are about something else.
 *
 * Criterion M78: a message that would be answered by starting a NEW agent — one with no
 * conversation of its own here to pick up — waits for the person's press. Every agent in this file
 * is fresh, so the first message to each of them is one of those. The press is what the chat offers
 * the person; here it is done in the setup so that what is measured below is the rule each case is about
 * and not the press. It is sent as the person because it is refused to an agent.
 */
async function intoTheGroup(groupId: string, body: string, headers: Record<string, string>): Promise<string> {
  const filed = await post('/api/records', { kind: 'message', title: body.slice(0, 60), data: { body, toGroup: groupId } }, headers)
  const record = filed['record'] as { id?: string } | undefined
  if (record?.id === undefined) throw new Error(`the message was refused: ${JSON.stringify(filed).slice(0, 300)}`)
  await post(`/api/messages/${record.id}/start-an-agent`, {})
  return record.id
}

/** Run passes until nothing is going any more, so a later pass judges a still world. */
async function untilEveryRunHasEnded(within = 20_000): Promise<void> {
  const deadline = Date.now() + within
  for (;;) {
    await onePass(settings, watching)
    if (watching.length === 0) return
    if (Date.now() >= deadline) throw new Error('a run never ended')
    await new Promise((go) => setTimeout(go, 50))
  }
}

beforeAll(async () => {
  // THE LIMIT THIS FILE IS WRITTEN AGAINST IS SAID OUT LOUD, rather than taken from whatever the
  // machine happens to have in its environment. The server reads it through settings.mjs, which
  // prefers the environment this process was given.
  hopsBefore = process.env['MOLE_OFFICE_AGENT_HOPS']
  process.env['MOLE_OFFICE_AGENT_HOPS'] = String(ALLOWED)
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-loop-guard-'))
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: ALLOWED,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
  if (hopsBefore === undefined) delete process.env['MOLE_OFFICE_AGENT_HOPS']
  else process.env['MOLE_OFFICE_AGENT_HOPS'] = hopsBefore
})

describe('a line Mole Office wrote is delivered and never answered', () => {
  let groupId: string
  let alpha: string
  let beta: string

  it('opens a group, which writes the lines saying so', async () => {
    alpha = await anAgent('loop-alpha')
    beta = await anAgent('loop-beta')
    const opened = await post('/api/groups', {
      name: 'The gripper module',
      because: 'two agents are changing the same file',
      members: [
        { who: { kind: 'agent', id: alpha }, because: 'one of the two' },
        { who: { kind: 'agent', id: beta }, because: 'the other' },
        { who: { kind: 'person', id: THE_PERSON }, because: 'the owner watches' },
      ],
    })
    const group = opened['group'] as { id?: string } | undefined
    if (group?.id === undefined) throw new Error(`the group was refused: ${JSON.stringify(opened).slice(0, 400)}`)
    groupId = group.id
    const lines = await said(groupId)
    // ONE LINE, NOT ONE PLUS ONE PER MEMBER. Until 14 September 2026 a group opening wrote a line
    // saying so and a line per member joining, four here. The fix (defect 11 of the
    // office-defects batch, commit 684e2668, "A join is not a message"): the office's repetitive
    // notices are trimmed, and a join is carried by the group's members panel, which already held
    // joined_at and joined_because, instead of being sent as a message. So the opening writes the
    // one line that says the group was opened, and the members are read from the panel.
    expect(lines.length, 'a group opening writes one line, the one saying it was opened').toBe(1)
    for (const line of lines) expect(line.sentBy).toEqual(moleOffice())
  })

  it('says on the queue that each of those lines needs no run', async () => {
    const queue = await theQueue()
    // One line (the opening), waiting for each of the two agents: two rows, since the join lines
    // are no longer written (see the case above).
    expect(queue.length, 'one line, waiting for the two agents in the group').toBe(2)
    for (const entry of queue) {
      expect(entry.needsNoRun, `the queue entry for ${entry.messageId}`).toContain('for people to read')
      expect(entry.needsNoRun).toContain('nothing was spent')
    }
  })

  it('starts no run for one, and moves the mark anyway so nothing waits under a clock', async () => {
    const report = await onePass(settings, watching)
    expect(report.started, 'a line Mole Office wrote must start no run').toEqual([])
    expect(report.failed).toEqual([])
    // The one opening line for the two agents: two held rows (the join lines are no longer written).
    expect(report.held.length).toBe(2)

    const lines = await said(groupId)
    const first = one(lines.slice(0, 1), 'the line saying the group was opened')
    for (const who of [alpha, beta]) {
      const stands = await delivery(first.id, who)
      expect(stands.mark, 'a line nothing will answer must not be left waiting').toBe('delivered')
      expect(stands.because).toContain('for people to read')
    }
    // AND THE PERSON'S ROW IS UNTOUCHED: a person's queued row means unread, and reading is theirs.
    expect((await delivery(first.id, THE_PERSON)).mark).toBe('queued')
  })

  it('empties the queue of them, so the same lines are not decided again on every pass', async () => {
    expect(await theQueue()).toEqual([])
  })

  it('refuses to mark an ordinary message delivered without a run', async () => {
    const sent = await intoTheGroup(groupId, 'A question from a person.', AS_THE_OWNER)
    const refused = await post(`/api/worker/messages/${sent}/needs-no-run`, { to: { kind: 'agent', id: alpha } })
    expect(String(refused['error'])).toContain('not written by Mole Office')
    expect((await delivery(sent, alpha)).mark, 'the refused write must have changed nothing').toBe('queued')
  })

  /**
   * AND THE EXCHANGE THAT MESSAGE STARTS IS RUN TO ITS END HERE, IN THIS BLOCK'S OWN TEARDOWN.
   *
   * The message above is a person's, pressed, in a group of two agents. Since problem
   * `xjL8PoDabiW8` an answer goes to the group, so the first pass after it starts two runs, their
   * answers start two more, and the conversation stops at the hop limit: four fake-runtime processes
   * in two waves, one after the other. Until 9 October 2026 the first case of the next block paid for
   * them inside its own five seconds, as well as for its own group's four, and on the merge queue's
   * loaded machine it died at 5001 ms (full-suite-2026-10-09.json). This is the same drain at the
   * same point in the file, so the world the next block starts in is the one it always started in.
   */
  afterAll(async () => {
    await untilEveryRunHasEnded()
  }, 60_000)
})

describe('two agents in a group stop after they have said as much as they may', () => {
  let groupId: string
  let alpha: string
  let beta: string

  it('starts one run for each agent when a person writes to the group', async () => {
    // AND THE WORLD IS STILL BEFORE THIS BLOCK ASKS ANYTHING. The block above leaves one message
    // from the owner queued in another group on purpose, to prove that a refused write changed
    // nothing. Since 4 September 2026 an answer goes to the group its question was asked in
    // (problem `xjL8PoDabiW8`), so that message starts an exchange of its own, and a run of it in
    // flight would take one of the two run slots this test counts. The block above runs that
    // exchange to its end in its own `afterAll`; this pass checks nothing is still going.
    await untilEveryRunHasEnded()
    alpha = await anAgent('group-alpha')
    beta = await anAgent('group-beta')
    const opened = await post('/api/groups', {
      name: 'The arm module',
      because: 'a question for both of them',
      members: [
        { who: { kind: 'agent', id: alpha }, because: 'one of the two' },
        { who: { kind: 'agent', id: beta }, because: 'the other' },
        { who: { kind: 'person', id: THE_PERSON }, because: 'the owner watches' },
      ],
    })
    groupId = (opened['group'] as { id: string }).id
    // The lines the opening wrote start no run, and this clears them out of the queue.
    await onePass(settings, watching)

    const asked = await intoTheGroup(groupId, 'What do the two of you make of this?', AS_THE_OWNER)
    const report = await onePass(settings, watching)
    // THE PASS REPORT NAMES EACH STARTED RUN BY ITS AGENT'S HANDLE, which since criterion I1 is not its id.
    expect(report.started.map((r) => r.agent).sort(), 'a person writing to a group reaches every agent in it').toEqual(
      ['group-alpha', 'group-beta'].sort(),
    )
    for (const who of [alpha, beta]) expect((await delivery(asked, who)).mark).toBe('delivered')
    await untilEveryRunHasEnded()
  })

  /**
   * WHAT FILLS THE COUNT IS NOW THE EXCHANGE ITSELF, AND IT USED TO BE THREE MESSAGES WRITTEN HERE.
   *
   * Until 4 September 2026 a run's answer to a group message was filed privately to whoever asked
   * (problem `xjL8PoDabiW8`), so the agents' own answers never entered the group and the count above
   * stayed at nothing however many runs there had been. This block had to write three messages by
   * hand to reach the limit. Now an answer goes to the group: the owner's one question produces four
   * agent messages — one answer each to the owner, and one each to the other agent's answer — and the
   * fourth is one past the three this installation allows. Every assertion below is the one that was
   * here; what changed is who wrote the messages being counted.
   */
  it('holds what the agents say once they have said as much as they may, and says why on the row', async () => {
    const lines = await said(groupId)
    const byAgents = lines.filter((line) => line.sentBy !== null && [alpha, beta].includes(line.sentBy.id))
    expect(byAgents.length, 'the agents answering each other in a group must not run away').toBe(4)
    const last = byAgents[byAgents.length - 1]
    if (last?.sentBy == null) throw new Error('the agents wrote nothing into the group')

    // WHAT IS WAITING FOR A RUN IN THIS GROUP. Mole Office's own lines are left out: they are in the
    // queue too until a pass marks them delivered, they start no run either way, and this test is
    // about the messages the guard is holding. Other groups are left out because this block is about
    // this one.
    const here = new Set(lines.map((line) => line.id))
    const queue = (await theQueue()).filter((entry) => here.has(entry.messageId) && entry.needsNoRun === null)
    expect(queue.length, 'the last thing each agent said, waiting for the one it did not come from').toBe(2)
    for (const entry of queue) {
      expect(entry.conversationIsWaiting, `the queue entry for ${entry.messageId}`).toContain(
        `Agents have written ${String(byAgents.length)} messages in this conversation since a person last wrote`,
      )
      expect(entry.conversationIsWaiting).toContain('until a person writes something')
    }

    const report = await onePass(settings, watching)
    expect(report.started, 'nothing may be started once the conversation has gone as far as it may').toEqual([])
    const stands = await delivery(last.id, last.sentBy.id === alpha ? beta : alpha)
    expect(stands.mark, 'a message that may still run when a person writes stays queued').toBe('queued')
    expect(stands.because).toContain('Nothing more is started here until a person writes something')
  })

  it('tells the group once, in a line from Mole Office that addresses nobody', async () => {
    const lines = await said(groupId)
    const waiting = lines.filter((line) => line.body === SYSTEM_LINES.agentsAreWaitingForAPerson.line)
    expect(waiting.length, 'the group is told exactly once that its agents are waiting').toBe(1)
    expect(one(waiting, 'the line saying the agents are waiting').sentBy).toEqual(moleOffice())
    expect(waiting[0]?.body).not.toMatch(/\byou\b|\byour\b|\byours\b/i)
  })

  it('does not say it again on the next pass, however long the conversation stays stopped', async () => {
    await onePass(settings, watching)
    await onePass(settings, watching)
    const lines = await said(groupId)
    const waiting = lines.filter((line) => line.body === SYSTEM_LINES.agentsAreWaitingForAPerson.line)
    expect(waiting.length).toBe(1)
  })

  /**
   * A HELD MESSAGE IS HELD FOR EVER, AND THE WORKER SAYS SO EVERY TWO SECONDS.
   *
   * Writing the same sentence again used to announce a change that had not happened, so every open
   * page redrew its chat panel on every pass for as long as anything was held. This guard makes that
   * state permanent by design, so the write has to be the one that stops.
   */
  it('writes nothing when the sentence on the row has not changed', async () => {
    const held = (await theQueue())[0]
    if (held === undefined) throw new Error('nothing is being held, so there is no row to write on')
    const because = String(held.conversationIsWaiting)
    const first = await post(`/api/worker/messages/${held.messageId}/held`, { to: held.to, because })
    const again = await post(`/api/worker/messages/${held.messageId}/held`, { to: held.to, because })
    expect(first['written'], 'the row already says this, because a pass above wrote it').toBe(false)
    expect(again['written']).toBe(false)
    expect(again['because']).toBe(because)
    const changed = await post(`/api/worker/messages/${held.messageId}/held`, {
      to: held.to,
      because: 'Something else happened to this message.',
    })
    expect(changed['written'], 'a sentence that is different is written').toBe(true)
  })

  it('starts again the moment a person writes, because a person sets the count back to nothing', async () => {
    await intoTheGroup(groupId, 'The owner reading this and saying carry on.', AS_THE_OWNER)
    // THIS GROUP'S OWN QUEUE. A person writing sets the count back in the conversation they wrote
    // in and in no other, and the block above this one leaves a second group stopped on purpose.
    const here = new Set((await said(groupId)).map((line) => line.id))
    const queue = (await theQueue()).filter((entry) => here.has(entry.messageId))
    expect(queue.length).toBeGreaterThan(0)
    for (const entry of queue) expect(entry.conversationIsWaiting).toBeNull()

    const report = await onePass(settings, watching)
    expect(report.started.length, 'a person writing lets the agents run again').toBeGreaterThan(0)
    await untilEveryRunHasEnded()
  })
})

describe('a conversation between two agents alone is bounded the same way', () => {
  let alpha: string
  let beta: string

  it('holds the third message and writes no line into any group, because a pair has none', async () => {
    alpha = await anAgent('pair-alpha')
    beta = await anAgent('pair-beta')
    const groupsBefore = ((await get('/api/groups')) as { groups?: unknown[] }).groups?.length ?? 0

    const toBeta = async (body: string): Promise<string> => {
      const filed = await post(
        '/api/records',
        { kind: 'message', title: body.slice(0, 60), data: { body, to: [{ kind: 'agent', id: beta }] } },
        asAgent('pair-alpha'),
      )
      return (filed['record'] as { id: string }).id
    }
    await toBeta('Alpha to beta, the first thing.')
    await toBeta('Alpha to beta, the second thing.')
    const third = await toBeta('Alpha to beta, the third thing.')

    const waiting = one(
      (await theQueue()).filter((entry) => entry.messageId === third),
      'the third message waiting for a run',
    )
    expect(waiting.conversationIsWaiting).toContain(
      `Agents have written ${String(ALLOWED)} messages in this conversation`,
    )

    const report = await onePass(settings, watching)
    // The pass report names a started run by its agent's handle, so beta is looked for by its handle.
    expect(report.started.filter((r) => r.agent === 'pair-beta'), 'a pair is bounded like a group').toEqual([])
    expect((await delivery(third, beta)).because).toContain('until a person writes something')
    expect(((await get('/api/groups')) as { groups?: unknown[] }).groups?.length ?? 0).toBe(groupsBefore)
  })
})
