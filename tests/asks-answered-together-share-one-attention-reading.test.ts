// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ATTENTION THREAD WORKS OUT ONE READING FOR THE ASKS WAITING AT ONCE THAT ARE ALIKE (round 26 of wave 13w).
 *
 * A page asks the attention thread for Home's first page, the open work and the other projects at
 * once, and the thread answered them one after another, each with a reading of its own. On the made-up
 * office of the live size the fourth was answered after 528 ms where one reading took 149.
 * `answerTheseAsksTogether` (src/server/lib/attention-thread-worker.ts) now works out one reading for
 * the asks that are alike: the same project, resources and clock, and a reader hidden the same
 * messages. This file calls it as the thread does and proves two things.
 *
 * ALIKE ASKS SHARE ONE READING, AND ONLY THOSE. The owner's home, flow and a page of a list, and the
 * whole reading asked with no reader, share the first reading: the owner reads every message, as an
 * ask with no reader does. An agent who may not read a message between two other agents gets a reading
 * of their own, and so does another project. Each reading is counted where the records file works it
 * out, so an alike ask that works the shared reading out again is seen.
 *
 * EACH ANSWER IS THE ONE IT WOULD HAVE BEEN ALONE. Each is compared, as JSON, with `attentionNow` for
 * its own input cut to its own shape, at one fixed clock. The agent's answer is not the owner's: the
 * message hidden from the agent is counted in the owner's reading and not in theirs.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL green; a MUTATION
 * of one line red; RESTORE green, checked with cmp against a saved copy.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AttentionAnswer, AttentionAsk } from '../src/server/lib/attention-thread-worker.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const HERE = 'default'
const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

/** One fixed clock for every reading, because the rule ranks by how long a record has been in its state. */
const NOW = new Date(2026, 9, 6, 12, 0, 0).getTime()

let t: TestDb
let app: FastifyInstance
let R: typeof import('../src/server/lib/records.ts')
let shapes: typeof import('../src/server/lib/attention-shapes.ts')
let worker: typeof import('../src/server/lib/attention-thread-worker.ts')
let messages: typeof import('../src/server/lib/messages.ts')

async function post(url: string, payload: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url, headers: { ...OWNER, 'content-type': 'application/json' }, payload: payload as never })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as Record<string, unknown>
}

async function anAgent(handle: string): Promise<string> {
  await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } })
  const reply = await app.inject({ method: 'GET', url: '/api/participants', headers: OWNER })
  const row = ((reply.json() as { agents?: { id: string; handle: string }[] }).agents ?? []).find((one) => one.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} was registered and is not listed`)
  return row.id
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  R = await import('../src/server/lib/records.ts')
  shapes = await import('../src/server/lib/attention-shapes.ts')
  worker = await import('../src/server/lib/attention-thread-worker.ts')
  messages = await import('../src/server/lib/messages.ts')
  const db = t.client.sqlite

  // A MESSAGE BETWEEN TWO AGENTS, which the third may not read.
  await anAgent('ada-writer')
  const bo = await anAgent('bo-reader')
  await anAgent('dee-bystander')
  const between = R.createRecord({
    kind: 'message',
    title: 'A made-up line from ada to bo',
    workspaceId: HERE,
    data: { body: 'made-up words', to: [{ kind: 'agent', id: bo }] },
    actor: { type: 'agent', id: 'ada-writer' } as never,
  }).id
  db.prepare('DELETE FROM message_delivery WHERE message_id = ? AND recipient_id != ?').run(between, bo)
  const said = JSON.parse((db.prepare('SELECT data FROM records WHERE id = ?').get(between) as { data: string }).data) as Record<string, unknown>
  delete said['routed']
  writeDataBypassingTheGate(t, between, said)

  // RECORDS THE RULE LISTS, so each shape has rows in it.
  const add = db.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     VALUES (?, ?, 'owner', '2026-09-01 09:00:00', '2026-09-01 09:00:00', ?, ?, NULL, ?, NULL, 'fixture')`,
  )
  add.run('at-owed', HERE, 'task', 'A made-up promise to somebody outside', JSON.stringify({ state: 'doing', owed_to: 'the printer shop', due: '2026-09-10' }))
  add.run('at-stopped', HERE, 'problem', 'A made-up stop with a consequence', JSON.stringify({ state: 'blocked', consequence: { bearer: 'person', what: 'the rig may move' } }))
  add.run('at-report', HERE, 'report', 'A made-up report', JSON.stringify({ for: 'the owner', date: '2026-09-01', blocks: [{ id: 'b-1', type: 'text', heading: 'Words', text: 'made-up' }] }))
  add.run('at-note', HERE, 'note', 'A made-up note with no state', '{}')
  db.prepare("INSERT INTO workspaces (id, title, created_at, updated_at) VALUES ('elsewhere', 'Made-up elsewhere', '2026-09-01 09:00:00', '2026-09-01 09:00:00')").run()
  add.run('at-elsewhere', 'elsewhere', 'task', 'A made-up task in another project', JSON.stringify({ state: 'blocked' }))
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('asks answered together', () => {
  it('share one reading when they are alike, and each answer is the one it would have been alone', () => {
    const owner = messages.theMessageReader({ type: 'human', id: THE_PERSON })
    const dee = messages.theMessageReader({ type: 'agent', id: 'dee-bystander' })
    const of = (reader: typeof owner | undefined, workspaceId = HERE) => ({ workspaceId, resources: [], now: NOW, ...(reader === undefined ? {} : { reader }) })
    const asks: AttentionAsk[] = [
      { id: 1, input: of(owner), asked: { shape: 'home' } },
      { id: 2, input: of(owner), asked: { shape: 'flow' } },
      { id: 3, input: of(undefined), asked: { shape: 'whole' } },
      { id: 4, input: of(owner), asked: { shape: 'part', part: 'noState', from: 0 } },
      { id: 5, input: of(dee), asked: { shape: 'home' } },
      { id: 6, forEach: { resources: [], now: NOW, reader: owner }, each: ['elsewhere'] },
    ]
    // EACH READING WORKED OUT, named by its project and the messages hidden from its reader, counted where
    // the records file works it out. `readings` in an answer counts the different readings asked for, so
    // it stays the same when alike asks each work theirs out again.
    const workedOut: string[] = []
    const counting = {
      ...R,
      attentionWithTheseHidden: (input: Parameters<typeof R.attentionWithTheseHidden>[0], hidden: readonly string[]) => {
        workedOut.push(JSON.stringify([input.workspaceId, hidden]))
        return R.attentionWithTheseHidden(input, hidden)
      },
    }
    const answers: Exclude<AttentionAnswer, { ready: true }>[] = []
    worker.answerTheseAsksTogether(asks, 7, { records: counting, shapes, messages }, (answer) => answers.push(answer))

    expect(answers.map((one) => one.id)).toEqual([1, 2, 3, 4, 5, 6])
    for (const one of answers) if ('error' in one) throw new Error(one.error)
    // The readings worked out by the time each was answered: one for the owner and the ask with no
    // reader, a second for dee, and a third for the other project.
    expect(answers.map((one) => ('readings' in one ? one.readings : null))).toEqual([1, 1, 1, 1, 2, 3])
    // Each of the three was worked out once: the owner's reading here once for the four asks that share it.
    const named = (input: ReturnType<typeof of>): string => JSON.stringify([input.workspaceId, R.theMessagesHiddenFromTheAttentionReader(input)])
    expect(workedOut).toEqual([named(of(owner)), named(of(dee)), named(of(owner, 'elsewhere'))])
    expect(answers.every((one) => 'lastChange' in one && one.lastChange === 7)).toBe(true)

    const alone = (ask: AttentionAsk): unknown =>
      'each' in ask
        ? ask.each.map((workspaceId) => ({ workspaceId, reading: shapes.homeAttention(R.attentionNow({ ...ask.forEach, workspaceId })) }))
        : shapes.attentionInTheShape(ask.asked, R.attentionNow(ask.input))
    for (const [i, ask] of asks.entries()) {
      const answer = answers[i]
      expect(answer !== undefined && 'shaped' in answer ? JSON.stringify(answer.shaped) : null, `ask ${String(ask.id)}`).toBe(JSON.stringify(alone(ask)))
    }
    // Dee's reading is not the owner's: the message dee may not read is in the owner's records only.
    const readOf = (one: (typeof answers)[number] | undefined): unknown => (one !== undefined && 'shaped' in one ? (one.shaped as { read: { records: number } }).read.records : null)
    expect(readOf(answers[0])).toBe((readOf(answers[4]) as number) + 1)
  })

  it('answers an ask that fails with its error, and still answers the rest', () => {
    // A reading that fails for one project, as a broken read of it would.
    const failing = {
      ...R,
      attentionWithTheseHidden: (input: Parameters<typeof R.attentionWithTheseHidden>[0], hidden: readonly string[]) => {
        if (input.workspaceId === 'elsewhere') throw new Error('a made-up failure of one reading')
        return R.attentionWithTheseHidden(input, hidden)
      },
    }
    const asks: AttentionAsk[] = [
      { id: 1, input: { workspaceId: 'elsewhere', resources: [], now: NOW }, asked: { shape: 'flow' } },
      { id: 2, input: { workspaceId: HERE, resources: [], now: NOW }, asked: { shape: 'flow' } },
    ]
    const answers: Exclude<AttentionAnswer, { ready: true }>[] = []
    worker.answerTheseAsksTogether(asks, null, { records: failing, shapes, messages }, (answer) => answers.push(answer))
    expect(answers.map((one) => [one.id, 'error' in one ? one.error.split('\n')[0] : 'answered'])).toEqual([
      [1, 'Error: a made-up failure of one reading'],
      [2, 'answered'],
    ])
  })
})
