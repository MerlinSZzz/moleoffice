// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ATTENTION THREAD WORKS OUT EACH READER'S HIDDEN MESSAGES ONCE FOR THE ASKS IT ANSWERS TOGETHER.
 *
 * MEASURED FIRST, 28 October 2026, on the made-up office at the scale of 22 October 2026: GET
 * /api/attention?shape=other-projects for an agent who may not read 37,796 of the office's 55,765 messages took
 * 3,368 ms, the median of nine reads. Each project's reading asked which messages the agent may not read
 * (`everyMessageHiddenFrom`), and that list is the same in every project: 271 ms, worked out again for each of the
 * 10 projects read.
 *
 * HOW IT IS PROVED. `answerTheseAsksTogether` is called as the thread calls it, with asks for two agents and the
 * owner, over the project asked about and two others. Each answer is compared, as JSON, with `attentionNow` for its
 * own input cut to its own shape. The two agents are hidden different messages, so an answer given another reader's
 * list is not the one it would have been alone. The work is counted at the statement, with the SQL taken from a lone
 * read: the statement `everyMessageHiddenFrom` runs besides the reader's rule. It runs once for each agent and never
 * for the owner, who reads every message. The count is soft, so code that does more work is still checked for its
 * answers. After the asks, a message written later is hidden from the next read, so nothing was kept.
 *
 * CONTROL: on the code before this change the count was red and the answers green.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { AttentionAnswer, AttentionAsk } from '../src/server/lib/attention-thread-worker.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const HERE = 'default'
const OTHERS = ['hidden-once-north', 'hidden-once-south']

/** One fixed clock for every reading, because the rule ranks by how long a record has been in its state. */
const NOW = new Date(2026, 9, 6, 12, 0, 0).getTime()

let t: TestDb
beforeAll(async () => {
  t = await freshDb()
})
afterAll(() => t.close())

/** Every statement run while `work` runs, by its SQL. */
function traced<T>(work: () => T): { answer: T; ran: string[] } {
  type Run = (this: { source: string }, ...params: unknown[]) => unknown
  // THE STATEMENTS' OWN PROTOTYPE, so a statement prepared before this runs and kept is counted too.
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, Run>
  const ran: string[] = []
  const originals = new Map<string, Run>()
  for (const method of ['all', 'get', 'run', 'iterate']) {
    const call = prototype[method]!
    originals.set(method, call)
    prototype[method] = function (...params: unknown[]) {
      ran.push(this.source)
      return call.apply(this, params)
    }
  }
  try {
    return { answer: work(), ran }
  } finally {
    for (const [method, call] of originals) prototype[method] = call
  }
}

/** A statement's SQL with each list of `?` written as one, so a read of one id and a read of many are the same read. */
const asOneRead = (sql: string): string => sql.replace(/\?(\s*,\s*\?)*/g, '?')

it("works out each reader's hidden messages once for the asks answered together, and each answer is the one it would have been alone", async () => {
  const R = await import('../src/server/lib/records.ts')
  const shapes = await import('../src/server/lib/attention-shapes.ts')
  const worker = await import('../src/server/lib/attention-thread-worker.ts')
  const messages = await import('../src/server/lib/messages.ts')
  const db = t.client.sqlite

  // FOUR AGENTS, each a row of its own, so the reader's rule knows each by its id.
  for (const id of ['hidden-once-ada', 'hidden-once-bo', 'hidden-once-cy', 'hidden-once-dee']) {
    db.prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, '2026-09-01 09:00:00', NULL, NULL, 'generated')",
    ).run(`avatar-default-agent-${id}`)
    db.prepare("INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES (?, ?, ?, ?, 0, '2026-09-01 09:00:00')").run(id, id, id, `avatar-default-agent-${id}`)
  }
  // A MESSAGE FROM ONE AGENT TO ANOTHER, in the project asked about, handed to that one alone and routed to nobody.
  const say = (from: string, to: string, title: string): string => {
    const id = R.createRecord({ kind: 'message', title, workspaceId: HERE, data: { body: 'made-up words', to: [{ kind: 'agent', id: to }] }, actor: { type: 'agent', id: from } as never }).id
    db.prepare('DELETE FROM message_delivery WHERE message_id = ? AND recipient_id != ?').run(id, to)
    const said = JSON.parse((db.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, unknown>
    delete said['routed']
    writeDataBypassingTheGate(t, id, said)
    return id
  }
  const adaToBo = say('hidden-once-ada', 'hidden-once-bo', 'A made-up line from ada to bo')
  const boToCy = say('hidden-once-bo', 'hidden-once-cy', 'A made-up line from bo to cy')
  for (const id of OTHERS) {
    db.prepare("INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, '2026-09-01 09:00:00', '2026-09-01 09:00:00')").run(id, id)
    db.prepare(
      `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       VALUES (?, ?, 'owner', '2026-09-01 09:00:00', '2026-09-01 09:00:00', 'task', 'A made-up task in another project', NULL, ?, NULL, 'fixture')`,
    ).run(`${id}-task`, id, JSON.stringify({ state: 'blocked' }))
  }

  const owner = messages.theMessageReader({ type: 'human', id: THE_PERSON })
  const ada = messages.theMessageReader({ type: 'agent', id: 'hidden-once-ada' })
  const dee = messages.theMessageReader({ type: 'agent', id: 'hidden-once-dee' })
  // THE FIXTURE HOLDS WHAT IT MEANS TO: ada is hidden one of the two messages, dee both, the owner neither.
  expect(messages.everyMessageHiddenFrom(ada, HERE)).toEqual(expect.arrayContaining([boToCy]))
  expect(messages.everyMessageHiddenFrom(ada, HERE)).not.toContain(adaToBo)
  expect(messages.everyMessageHiddenFrom(dee, HERE)).toEqual(expect.arrayContaining([adaToBo, boToCy]))
  expect(messages.everyMessageHiddenFrom(owner, HERE)).toEqual([])

  const of = (reader: typeof ada, workspaceId = HERE) => ({ workspaceId, resources: [], now: NOW, reader })
  const asks: AttentionAsk[] = [
    { id: 1, input: of(ada), asked: { shape: 'home' } },
    { id: 2, input: of(ada), asked: { shape: 'whole' } },
    { id: 3, forEach: { resources: [], now: NOW, reader: ada }, each: OTHERS },
    { id: 4, input: of(dee), asked: { shape: 'whole' } },
    { id: 5, forEach: { resources: [], now: NOW, reader: dee }, each: OTHERS },
    { id: 6, input: of(owner), asked: { shape: 'whole' } },
    { id: 7, input: of(ada, OTHERS[0]), asked: { shape: 'flow' } },
  ]
  const answers: Exclude<AttentionAnswer, { ready: true }>[] = []
  const together = traced(() => worker.answerTheseAsksTogether(asks, null, { records: R, shapes, messages }, (answer) => answers.push(answer)))

  expect(answers.map((one) => one.id)).toEqual(asks.map((one) => one.id))
  for (const one of answers) if ('error' in one) throw new Error(one.error)
  const alone = (ask: AttentionAsk): unknown =>
    'each' in ask
      ? ask.each.map((workspaceId) => ({ workspaceId, reading: shapes.homeAttention(R.attentionNow({ ...ask.forEach, workspaceId })) }))
      : shapes.attentionInTheShape(ask.asked, R.attentionNow(ask.input))
  for (const [i, ask] of asks.entries()) {
    const answer = answers[i]
    expect(answer !== undefined && 'shaped' in answer ? JSON.stringify(answer.shaped) : null, `ask ${String(ask.id)}`).toBe(JSON.stringify(alone(ask)))
  }
  // ADA'S READING IS NOT DEE'S: the message from ada to bo is in ada's records only.
  const readOf = (one: (typeof answers)[number] | undefined): unknown => (one !== undefined && 'shaped' in one ? (one.shaped as { read: { records: number } }).read.records : null)
  expect(readOf(answers[1])).toBe((readOf(answers[3]) as number) + 1)

  // THE LIST'S OWN READ: what `everyMessageHiddenFrom` runs besides the reader's rule, which a reading never runs.
  const ids = (db.prepare("SELECT id FROM records WHERE kind = 'message'").all() as { id: string }[]).map((row) => row.id)
  const theRule = new Set(traced(() => messages.theMessagesThisReaderMayRead(ada, ids)).ran.map(asOneRead))
  const theListsOwnRead = new Set(traced(() => messages.everyMessageHiddenFrom(ada, HERE)).ran.map(asOneRead).filter((sql) => !theRule.has(sql)))
  expect(theListsOwnRead.size, 'one statement, taken from the code').toBe(1)
  const runsOf = (ran: string[]): number => ran.filter((sql) => theListsOwnRead.has(asOneRead(sql))).length
  expect(runsOf(traced(() => R.attentionWithTheseHidden(of(ada), [])).ran), 'a reading never runs it').toBe(0)
  const readersHiddenSomething = new Set([ada, dee, owner].filter((one) => !one.readsEveryMessage).map((one) => JSON.stringify(one.who)))
  expect.soft(runsOf(together.ran), "each reader's list is read once").toBe(readersHiddenSomething.size)

  // NOTHING IS KEPT ONCE THE ASKS ARE ANSWERED: a message written after them is hidden from the next read.
  const later = say('hidden-once-bo', 'hidden-once-cy', 'A made-up later line from bo to cy')
  expect(messages.everyMessageHiddenFrom(ada, HERE)).toContain(later)
})
