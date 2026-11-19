// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FOUR WRITES WHOSE ANSWERS NAME NO LIST READ NO TITLE, AND THE RECORD DOOR STILL NAMES CLOSE TITLES. Wave 13u round 39.
 *
 * A write through `createRecordWithReport` (src/server/lib/records.ts) makes two lists unless its caller says not to:
 * the records already called what the new one is called, and the records whose titles are close to its title. The
 * second reads the id, kind and title of every live record of the project (`nearDuplicateTitles`): 18,799 rows for
 * each record written on the made-up office of the live counts. Four doors write through it and name neither list in
 * their answers, and nothing else keeps what the write gave back but the record. So these four ask for neither list:
 *   - a role request, POST /api/roles/requests: the request and the message that carries it;
 *   - the role cards copied, POST /api/roles/mirror: one record for each card;
 *   - a new counter, POST /api/counters;
 *   - the person's answers sent, POST /api/records/:id/answers/send: one decision for each choice.
 *
 * Every id, handle and sentence written here is made up for this file's throwaway office.
 *
 * WHAT IS PROVED HERE.
 *
 *   1. THE RECORD DOOR'S ANSWER STILL NAMES BOTH LISTS, for a note called what a note already filed is called. The
 *      statement that reads every title ran once. This is also the guard for the cases after it: they count the same
 *      statement by its text, and if drizzle wrote that text differently they would count nothing whatever the code
 *      did. This case would fail first.
 *   2. to 5. Each of the four doors writes what it wrote before and answers with the same keys as before, and the
 *      statement that reads every title does not run. Where a title can be chosen, a note already called it and a
 *      note with a close title are filed first, so each list would not be empty.
 *
 * THE LIMITS.
 *   · The answers are compared with the keys each door's answer had before this round, written out below, and not
 *     with an answer from the code before this round.
 *   · A counter's task (src/server/lib/counters.ts, `runTheAction`) is not among the four. The counters' tick reaches
 *     that write as well as two doors.
 *
 * WHAT TURNS EACH RED, each tried in wave 13u round 39:
 *   · case 2: take `namesWhatIsAlreadyFiled: false` out of the role request in src/server/api/roles.ts, and
 *     separately out of the message that carries it;
 *   · case 3: take it out of the role card copy in src/server/api/roles.ts;
 *   · case 4: take it out of `makeACounter` in src/server/lib/counters.ts;
 *   · case 5: take it out of the decision in `sendAnswers`, src/server/lib/answers.ts;
 *   · case 1: let `createRecordWithReport` make no list of close titles for a note.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': PROJECT,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const ASKER = 'made-up-card-asker'
const WRITER = 'made-up-question-writer'
/** The statement of `nearDuplicateTitles`, as drizzle writes it. */
const EVERY_TITLE = 'select "id", "kind", "title" from "records" where ("records"."workspace_id" = ? and "records"."deleted_at" is null and "records"."kind" <> ?)'

let t: TestDb
let app: FastifyInstance
/** How many times the statement over every title ran, and how many rows it gave back. */
let everyTitle = { runs: 0, rows: 0 }

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE COUNTER GOES IN BEFORE THE SERVER IS MADE, so no statement the server keeps is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    if (text !== EVERY_TITLE) return statement
    const all = statement['all'] as (...args: unknown[]) => unknown[]
    statement['all'] = function (this: unknown, ...args: unknown[]) {
      const rows = all.apply(this, args)
      everyTitle = { runs: everyTitle.runs + 1, rows: everyTitle.rows + rows.length }
      return rows
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, role] of [[ASKER, 'worker'], [WRITER, 'supervisor']] as const) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: `A made-up ${handle}`, role } })
    expect(r.statusCode, r.body).toBe(201)
  }
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

const asAgent = (handle: string): Record<string, string> => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

/** A note called `title` and a note whose title is close to it, so that neither list would be empty. */
function alreadyFiled(title: string): { same: string; close: string } {
  const note = (called: string): string =>
    t.api.createRecord({ workspaceId: PROJECT, kind: 'note', title: called, data: { body: 'Made up for this file.' }, actor: t.api.HUMAN }).id
  const filed = { same: note(title), close: note(`${title}s`) }
  // NOT AN EMPTY LIST: both notes are among the close titles before the write. Others may be among them too: in case
  // 2 the notes filed first are called by the asker's registry id, which the server makes up, and about one id in 800
  // makes them close to the message's title as well.
  expect(t.api.nearDuplicateTitles(title, PROJECT).map((one) => one.id), `the close titles of "${title}"`).toEqual(expect.arrayContaining([filed.same, filed.close]))
  return filed
}

/** What `act` answers, with the runs of the statement over every title counted while it ran. */
async function counted<T>(act: () => Promise<T>): Promise<{ answer: T; runs: number; rows: number }> {
  everyTitle = { runs: 0, rows: 0 }
  const answer = await act()
  return { answer, ...everyTitle }
}

const liveRecords = (): number =>
  (t.client.sqlite.prepare('SELECT count(*) AS n FROM records WHERE workspace_id = ? AND deleted_at IS NULL').get(PROJECT) as { n: number }).n
const titleOf = (id: string): { kind: string; title: string } =>
  t.client.sqlite.prepare('SELECT kind, title FROM records WHERE id = ?').get(id) as { kind: string; title: string }

describe('the lists of titles already filed', () => {
  it('1. the record door\'s answer to a note still names the records called the same and those close to it', async () => {
    const title = 'The made-up glaze plan for the spring kiln'
    const filed = alreadyFiled(title)
    const records = liveRecords()
    const sent = await counted(() =>
      app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: { kind: 'note', title, data: { body: 'A made-up note.' } } }),
    )
    expect(sent.answer.statusCode, sent.answer.body).toBe(201)
    const reply = JSON.parse(sent.answer.body) as { similar?: { id: string }[]; sameTitle?: { id: string }[] }
    expect(reply.similar?.map((one) => one.id).sort(), 'the close titles in the answer').toEqual([filed.same, filed.close].sort())
    expect(reply.sameTitle?.map((one) => one.id), 'the records called the same').toEqual([filed.same])
    expect({ runs: sent.runs, rows: sent.rows }, 'the statement over every title').toEqual({ runs: 1, rows: records })
  })

  it('2. a role request and the message that carries it read no title, and the answer is as it was', async () => {
    // THE REQUEST IS CALLED BY THE ASKER'S REGISTRY ID, which the server gave it, and not by its handle.
    const askerId = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(ASKER) as { id: string }).id
    alreadyFiled(`${askerId} asks for the supervisor card`)
    alreadyFiled('A request for the supervisor card')
    const sent = await counted(() =>
      app.inject({ method: 'POST', url: '/api/roles/requests', headers: asAgent(ASKER), payload: { asking: 'supervisor', because: 'Made up for this file.' } }),
    )
    expect(sent.answer.statusCode, sent.answer.body).toBe(201)
    const reply = JSON.parse(sent.answer.body) as Record<string, unknown> & { request: string; message: string }
    expect(Object.keys(reply).sort()).toEqual(['answersTo', 'asking', 'holding', 'incomplete', 'message', 'narrowedByPermission', 'note', 'request'])
    expect(titleOf(reply.request)).toEqual({ kind: 'role_request', title: `${askerId} asks for the supervisor card` })
    expect(titleOf(reply.message)).toEqual({ kind: 'message', title: 'A request for the supervisor card' })
    expect({ runs: sent.runs, rows: sent.rows }, 'the statement over every title').toEqual({ runs: 0, rows: 0 })
  })

  it('3. the role cards copied read no title, and the answer is as it was', async () => {
    const before = (t.client.sqlite.prepare(`SELECT count(*) AS n FROM records WHERE kind = 'role_card' AND deleted_at IS NULL`).get() as { n: number }).n
    const noBody: Record<string, string> = { ...AS_THE_PERSON }
    delete noBody['content-type']
    const sent = await counted(() => app.inject({ method: 'POST', url: '/api/roles/mirror', headers: noBody }))
    expect(sent.answer.statusCode, sent.answer.body).toBe(200)
    const reply = JSON.parse(sent.answer.body) as { written: string[] } & Record<string, unknown>
    expect(Object.keys(reply).sort()).toEqual(['alreadyCurrent', 'narrowedByPermission', 'note', 'rewritten', 'written'])
    // NOT A MIRROR THAT WROTE NOTHING: every card was copied for the first time.
    expect(before).toBe(0)
    expect(reply.written.length).toBeGreaterThan(0)
    expect((t.client.sqlite.prepare(`SELECT count(*) AS n FROM records WHERE kind = 'role_card' AND deleted_at IS NULL`).get() as { n: number }).n).toBe(reply.written.length)
    expect({ runs: sent.runs, rows: sent.rows }, 'the statement over every title').toEqual({ runs: 0, rows: 0 })
  })

  it('4. a new counter reads no title, and the answer is as it was', async () => {
    const title = 'A made-up counter of kiln firings'
    alreadyFiled(title)
    const sent = await counted(() =>
      app.inject({
        method: 'POST',
        url: '/api/counters',
        headers: AS_THE_PERSON,
        payload: { title, counts: 'Made-up kiln firings.', triggers: [{ kind: 'count', n: 3 }], action: { kind: 'task', title: 'A made-up look at the kiln' } },
      }),
    )
    expect(sent.answer.statusCode, sent.answer.body).toBe(201)
    const reply = JSON.parse(sent.answer.body) as { counter: { id: string } } & Record<string, unknown>
    expect(Object.keys(reply).sort()).toEqual(['counter', 'narrowedByPermission', 'says', 'workspaceId'])
    expect(titleOf(reply.counter.id)).toEqual({ kind: 'counter', title })
    expect({ runs: sent.runs, rows: sent.rows }, 'the statement over every title').toEqual({ runs: 0, rows: 0 })
  })

  it('5. the person\'s answers sent read no title for the decision, and the answer is as it was', async () => {
    const question = 'Which made-up glaze should the spring batch use?'
    alreadyFiled(question)
    const report = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent(WRITER),
      payload: {
        kind: 'report',
        title: 'Made-up questions about the spring kiln',
        data: { for: 'A made-up reader', date: '2026-10-19', blocks: [{ id: 'q-glaze', type: 'choice', question, options: [{ id: 'a', label: 'Celadon' }, { id: 'b', label: 'Tenmoku' }] }] },
      },
    })
    expect(report.statusCode, report.body).toBe(201)
    const reportId = (JSON.parse(report.body) as { record: { id: string } }).record.id
    const kept = await app.inject({ method: 'PUT', url: `/api/records/${reportId}/answers/q-glaze`, headers: AS_THE_PERSON, payload: { answer: { chosen: ['a'] } } })
    expect(kept.statusCode, kept.body).toBe(200)
    const sent = await counted(() =>
      app.inject({ method: 'POST', url: `/api/records/${reportId}/answers/send`, headers: AS_THE_PERSON, payload: { press: { scope: 'report' } } }),
    )
    expect(sent.answer.statusCode, sent.answer.body).toBe(201)
    const reply = JSON.parse(sent.answer.body) as { decisions: string[]; messages: unknown[] } & Record<string, unknown>
    expect(Object.keys(reply).sort()).toEqual(['answers', 'decisions', 'messages', 'narrowedByPermission'])
    expect(reply.decisions).toHaveLength(1)
    expect(titleOf(reply.decisions[0]!)).toEqual({ kind: 'decision', title: question })
    expect(reply.messages).toHaveLength(1)
    expect({ runs: sent.runs, rows: sent.rows }, 'the statement over every title').toEqual({ runs: 0, rows: 0 })
  })
})
