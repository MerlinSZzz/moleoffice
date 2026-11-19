// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE CAP ON WHAT AGENTS MAY SAY WITHOUT A PERSON NEVER STOPS A CHECK.
 *
 * Criterion M82 of design/messages/ACCEPTANCE.md section 42, on problem `S5ouUa6A0rrL` of
 * 7 September 2026 and decision `4mdJbLfAP713`: there is no hard limit, and the group is where it is
 * talked out.
 *
 * WHAT WENT WRONG, MEASURED. The inspector's SECOND refusal of one agent's work sat in message_delivery
 * marked queued with the cap's own sentence on it: agents had written four messages in that
 * conversation since a person last wrote, and this installation allows three. The check-and-fix
 * loop that had been asked for died quietly on its second round. Nothing was written in the group
 * and nothing was said to the starter; it was found by reading the delivery row by hand.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. THE CONTROL. Two ordinary agents in an ordinary group still stop at the limit, and the
 *    sentence still names it. Without this, every case below could pass on a cap that had simply
 *    been turned off.
 * 2. A message an inspector wrote is not counted, so the limit is not reached by its refusals.
 * 3. Nothing said inside a group an inspector's refusal opened is counted, whoever wrote it, so
 *    the conversation the group was opened to have can happen.
 * 4. When the cap DOES stop a run, the starter of the agent is told in words, once.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, RUN AT THE MERGE COMMIT 300ea432 ON 8 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 5 cases, all green. Then, in `writtenByAnInspector` in src/server/lib/worker.ts, the
 * reading of the registry row was
 * replaced by `return false`, so what an inspector wrote counts against the cap again.
 *
 * THE CASES THAT WENT RED, and they are the ones this criterion is about:
 *
 *   × does not count an inspector against the cap, so its refusals go on being delivered
 *   × counts nothing said inside a group an inspector opened, whoever wrote it
 *
 * The change was put back and the control run again: 5 cases, all green. So the test holds the
 * behaviour rather than passing beside it.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

async function post(path: string, body: unknown, headers: Record<string, string> = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as never })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

/** Register an agent through the door that takes a role, and give back its registry id. */
async function anAgent(handle: string, role: string, startedBy?: string): Promise<string> {
  const headers = startedBy === undefined ? AS_THE_OWNER : asAgent(startedBy)
  // THE RUNTIME WORD IS SET, because `whyNotNow` asks about it BEFORE it asks about the cap, and an
  // agent with no runtime word is held for that instead — which would make every case here pass on
  // the wrong reason.
  const made = await post('/api/agents/started', { handle, name: handle, role, runtime: 'claude-code' }, headers)
  expect(made['error'], JSON.stringify(made).slice(0, 300)).toBeUndefined()
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

/**
 * OPEN A GROUP, NAMING WHO OPENED IT, THROUGH THE LIBRARY RATHER THAN THE ROUTE.
 *
 * The route sets `openedBy` from whoever calls it, and opening a group is a supervisor's act, so an
 * inspector cannot reach it. In the product an inspector's refusal opens its group through exactly
 * this function, called inside `src/server/lib/inspection.ts` — which is the path criterion M82 is
 * about — so this is the same door the product uses, not a way round the gate.
 */
/**
 * IT IS IMPORTED WHEN IT IS CALLED, not at the top of the file. Importing a server library opens
 * Mole Office's database, and a test that does that before `freshDb()` has said which database it
 * means is refused by the product itself, naming the operator's own file. That refusal is right and
 * this is how a test asks for the library after the door is open.
 */
async function aGroup(name: string, openedBy: string, members: string[]): Promise<string> {
  const { openAGroupAndSayWhy } = await import('../src/server/lib/groups.ts')
  const opened = openAGroupAndSayWhy(
    {
      workspaceId: 'default',
      name,
      openedBy: { kind: 'agent', id: openedBy },
      because: 'this is what the group is for',
      members: members.map((id) => ({ who: { kind: 'agent' as const, id }, because: 'a member' })),
    },
    { type: 'agent', id: openedBy },
  )
  return opened.id
}

async function intoTheGroup(groupId: string, body: string, from: string): Promise<string> {
  const filed = await post(
    '/api/records',
    { kind: 'message', title: body.slice(0, 40), data: { body, toGroup: groupId } },
    asAgent(from),
  )
  const record = filed['record'] as { id?: string } | undefined
  if (record?.id === undefined) throw new Error(`the message was refused: ${JSON.stringify(filed).slice(0, 400)}`)
  return record.id
}

/** What the queue says about one message for one agent: the cap's sentence, or the empty string. */
async function whyTheCapHoldsIt(messageId: string, agentId: string): Promise<string> {
  const read = (await get('/api/worker/queue')) as {
    queue?: { messageId: string; to: { id: string }; conversationIsWaiting: string | null }[]
  }
  const row = (read.queue ?? []).find((x) => x.messageId === messageId && x.to.id === agentId)
  return String(row?.conversationIsWaiting ?? '')
}

/** Every system line Mole Office wrote about a message (criterion M128), whole. */
function noticeLines(): { id: string; body: string; saidInFull: string }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT id, data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) " +
          "AND json_extract(data, '$.aboutMessage') IS NOT NULL",
      )
      .all() as { id: string; data: string }[]
  ).map((row) => {
    const data = JSON.parse(row.data) as { body: string; saidInFull?: string }
    return { id: row.id, body: data.body, saidInFull: data.saidInFull ?? '' }
  })
}

/** Every short line the office wrote to the person in the office conversation (criterion M128). */
function shortOfficeLines(): { body: string; saidInFull: string }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) " +
          "AND json_extract(data, '$.to[0].kind') = 'person' " +
          "AND json_extract(data, '$.aboutMessage') IS NULL",
      )
      .all() as { data: string }[]
  )
    .map((row) => JSON.parse(row.data) as { body: string; saidInFull?: string })
    .filter((one) => one.body.startsWith('Write to '))
    .map((one) => ({ body: one.body, saidInFull: one.saidInFull ?? '' }))
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-cap-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('the control: two ordinary agents in an ordinary group still stop at the limit', () => {
  it('holds the fourth thing they say, and the sentence names the limit', async () => {
    const one1 = await anAgent('plain-one', 'worker')
    const two = await anAgent('plain-two', 'worker')
    const group = await aGroup('An ordinary group', one1, [one1, two])

    // FOUR MESSAGES FROM AGENTS, WITH NO PERSON WRITING. The installation allows three.
    await intoTheGroup(group, 'one', 'plain-one')
    await intoTheGroup(group, 'two', 'plain-two')
    await intoTheGroup(group, 'three', 'plain-one')
    const fourth = await intoTheGroup(group, 'four', 'plain-two')

    const said = await whyTheCapHoldsIt(fourth, one1)
    expect(said).toContain('this installation allows 3')
    expect(said).toContain('Nothing more is started here until a person writes something')
  })
})

describe('what an inspector writes is not counted, and neither is its group', () => {
  let worker = ''
  let inspector = ''
  let refusalGroup = ''

  it('does not count an inspector against the cap, so its refusals go on being delivered', async () => {
    worker = await anAgent('checked-worker', 'worker')
    inspector = await anAgent('the-checker', 'inspector')
    const group = await aGroup('A group with an inspector in it', worker, [worker, inspector])

    // THE INSPECTOR SAYS FOUR THINGS. Under the cap that is one past the limit.
    await intoTheGroup(group, 'You are not released. One.', 'the-checker')
    await intoTheGroup(group, 'You are not released. Two.', 'the-checker')
    await intoTheGroup(group, 'You are not released. Three.', 'the-checker')
    const fourth = await intoTheGroup(group, 'You are not released. Four.', 'the-checker')

    expect(await whyTheCapHoldsIt(fourth, worker)).toBe('')
  })

  it('counts nothing said inside a group an inspector opened, whoever wrote it', async () => {
    // THE GROUP A REFUSAL OPENS is opened by the inspector, with the worker in it. Criterion C26.
    refusalGroup = await aGroup('A refusal: checked-worker', inspector, [worker, inspector])

    // AND THE WORKER TALKS IT OUT, past the limit, because the group is where it is talked out.
    await intoTheGroup(refusalGroup, 'Here is what I did.', 'checked-worker')
    await intoTheGroup(refusalGroup, 'And here is the file.', 'checked-worker')
    await intoTheGroup(refusalGroup, 'And the test.', 'checked-worker')
    const fourth = await intoTheGroup(refusalGroup, 'And the mutation proof.', 'checked-worker')

    expect(await whyTheCapHoldsIt(fourth, inspector)).toBe('')
  })

  it('still stops the same agents in a group nobody was refused in, so the exemption is about the group', async () => {
    // THE SAME TWO AGENTS, in a group a WORKER opened. Nothing about who they are exempts them: it
    // is the group a refusal opened that does, and this says so.
    const ordinary = await aGroup('The same two, talking about something else', worker, [worker, inspector])
    await intoTheGroup(ordinary, 'one', 'checked-worker')
    await intoTheGroup(ordinary, 'two', 'checked-worker')
    await intoTheGroup(ordinary, 'three', 'checked-worker')
    const fourth = await intoTheGroup(ordinary, 'four', 'checked-worker')

    expect(await whyTheCapHoldsIt(fourth, inspector)).toContain('this installation allows 3')
  })
})

describe('when the cap does stop a run, the conversation is told', () => {
  it('writes a system line into the conversation naming the message, and tells the person, once', async () => {
    // THE STARTER IS THE PERSON, because M128's short line is for the person. The group is where the agents
    // ran out, which is the conversation the notice is about.
    const worker = await anAgent('the-started', 'worker')
    const other = await anAgent('the-other', 'worker')
    const group = await aGroup('A group that runs out', other, [worker, other])

    const first = await intoTheGroup(group, 'one', 'the-other')
    const second = await intoTheGroup(group, 'two', 'the-other')
    const third = await intoTheGroup(group, 'three', 'the-other')
    const fourth = await intoTheGroup(group, 'four', 'the-other')
    const whose = [first, second, third, fourth]

    // THE CONTROL: before the worker runs, no notice about this pause is written.
    expect(noticeLines().filter((one) => whose.some((id) => one.saidInFull.includes(id)))).toHaveLength(0)

    await onePass(settings, watching)

    // (a) THE CONVERSATION GETS A SYSTEM LINE NAMING THE MESSAGE. It is written as Mole Office, into
    // the group the message was in, names one of the messages this pause is holding, and links to
    // it. The worker starts runs newest first, so which of the four it names is not fixed; that it
    // names one of them is. Other conversations in this file were also stopped by the cap and are
    // narrowed out by the message they name.
    const notices = noticeLines().filter((one) => whose.some((id) => one.saidInFull.includes(id)))
    expect(notices, 'the conversation was not told that the cap stopped a run').toHaveLength(1)
    expect(notices[0]?.body).toContain('the-started')
    const named = whose.find((id) => notices[0]?.saidInFull.includes(id))
    expect(named, 'the notice names no message of this pause').toBeDefined()
    const linked = t.client.sqlite
      .prepare("SELECT to_id FROM links WHERE from_id = ? AND type = 'about'")
      .all(notices[0]?.id) as { to_id: string }[]
    expect(linked.map((one) => one.to_id), 'the notice does not link to the message it names').toContain(named)

    // (b) AND THE PERSON IS TOLD ONCE, in their own conversation with the office, in one short line.
    const short = shortOfficeLines().filter((one) => whose.some((id) => one.saidInFull.includes(id)))
    expect(short, 'the person was not told they can start the conversation again').toHaveLength(1)

    // AND IT IS SAID ONCE PER PAUSE, however many passes run.
    await onePass(settings, watching)
    await onePass(settings, watching)
    expect(
      noticeLines().filter((one) => whose.some((id) => one.saidInFull.includes(id))),
      'the notice was written again on a later pass',
    ).toHaveLength(1)
    expect(
      shortOfficeLines().filter((one) => whose.some((id) => one.saidInFull.includes(id))),
      'the person was told again on a later pass',
    ).toHaveLength(1)
  }, 60_000)
})
