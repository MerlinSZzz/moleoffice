// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SENT DRAFT READS NO TITLE LIST, AND THE RECORD DOOR NAMES CLOSE TITLES FOR EVERY KIND BUT A MESSAGE. Wave 13u
 * round 38; the message, wave 13s round 186.
 *
 * A write through `createRecordWithReport` (src/server/lib/records.ts) makes two lists unless its caller says not to:
 * the records already called what the new one is called, and the records whose titles are close to its title. The
 * second reads the id, kind and title of every live record of the project (`nearDuplicateTitles`): 18,799 rows for one
 * message on the made-up office of the live counts. Only the answer of POST /api/records names the lists. Agents read
 * that answer (chapter 4 of the rules), and the door cannot tell the page from an agent's tool, so there both lists stay
 * for every kind but one. A message makes the first list and not the second (1 Nov 2026). A message is kept from
 * being stored twice by its send id, and titles may repeat, so in a chat a close title is ordinary and says nothing. The
 * answer of POST /api/drafts/:id/send names neither list and nothing else reads them, so a draft's send asks for
 * neither.
 *
 * The agent send holds its reader for the send; the person send keeps its reader unheld.
 * Every id, handle and sentence written here is made up for this file's throwaway office.
 *
 * WHAT IS PROVED HERE.
 *
 *   1. THE RECORD DOOR'S ANSWER TO A MESSAGE NAMES ONLY THE RECORDS CALLED THE SAME, AND A NOTE'S NAMES BOTH LISTS. A
 *      message from the person and one from an agent, each called what a note already filed is called, and close to
 *      the title of a second note. Each answer's list of the records called the same is the one the list function
 *      gives for that title before the write, with its sentence. The answer has no close titles and no sentence about
 *      them, and the statement that reads every title does not run. A note from the person, with a title placed the
 *      same way, answers with both lists as the list functions give them, and the statement ran once for it.
 *   2. A SENT DRAFT READS NO TITLE. A draft that becomes a message, one that becomes a report and one that becomes a
 *      note, each called what a note already filed is called, are sent through POST /api/drafts/:id/send. The
 *      statement that reads every title does not run, and the answer names neither list, as it named neither before.
 *
 * THE LIMITS.
 *   · Case 1 compares the door's answers with what the list functions give, and not with an answer from older code.
 *   · The statement is told by its text as drizzle writes it. If that text changed, case 2 would count nothing whatever
 *     the code did. Case 1 counts the same text, and it would fail first.
 *
 * WHAT TURNS EACH RED:
 *   · case 2: take `namesWhatIsAlreadyFiled: false` out of `sendADraft` in src/server/lib/drafts.ts (wave 13u round 38);
 *   · case 1: let `createRecordWithReport` make the list of close titles for a message again, or make that list for no
 *     kind (each tried in wave 13s round 186).
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
const WRITER = 'made-up-draft-writer'
const READER = 'made-up-draft-reader'
/** The statement of `nearDuplicateTitles`, as drizzle writes it. */
const EVERY_TITLE = 'select "id", "kind", "title" from "records" where ("records"."workspace_id" = ? and "records"."deleted_at" is null and "records"."kind" <> ?)'

let t: TestDb
let app: FastifyInstance
let writerRun = ''
/** How many times the statement over every title ran, and how many rows it gave back. */
let everyTitle = { runs: 0, rows: 0 }
let made = 0

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
  for (const handle of [WRITER, READER]) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: `A made-up ${handle}` } })
    expect(r.statusCode, r.body).toBe(201)
  }
  writerRun = t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'session',
    title: 'A made-up run of the draft writer',
    actor: { type: 'agent', id: WRITER },
    data: { state: 'running', servingAgent: WRITER },
  }).id
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

const asTheWriter = (): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': WRITER,
  'x-mole-office-session': writerRun,
})

/** The registry id of one agent, by its handle. */
function agentId(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/**
 * A new title, with a note already called it and a note whose title is close to it. Gives back the title and the ids
 * of the two notes.
 */
function aTitleAlreadyFiled(): { title: string; same: string; close: string } {
  const title = TITLES[made]!
  made += 1
  const note = (called: string): string =>
    t.api.createRecord({ workspaceId: PROJECT, kind: 'note', title: called, data: { body: 'Made up for this file.' }, actor: t.api.HUMAN }).id
  return { title, same: note(title), close: note(`${title}s`) }
}

/** What `act` answers, with the runs of the statement over every title counted while it ran. */
async function counted<T>(act: () => Promise<T>): Promise<{ answer: T; runs: number; rows: number }> {
  everyTitle = { runs: 0, rows: 0 }
  const answer = await act()
  return { answer, ...everyTitle }
}

const liveRecords = (): number =>
  (t.client.sqlite.prepare('SELECT count(*) AS n FROM records WHERE workspace_id = ? AND deleted_at IS NULL').get(PROJECT) as { n: number }).n

const THE_LIST_KEYS = ['similar', 'similarNote', 'sameTitle', 'sameTitleNote']
/** One title for each write, none of them close to another. */
const TITLES = [
  'The made-up glaze plan for the spring kiln',
  'A made-up order of clay from the north quarry',
  'The made-up rota for the drying racks',
  'A made-up price list for the summer fair',
  'The made-up repair of the wheel motor',
  'The made-up count of saggars in the back store',
]

describe('the lists of titles already filed', () => {
  it('1. the record door\'s answer to a message names the records called the same and no close titles, and a note\'s names both', async () => {
    for (const [who, headers] of [
      ['the person', AS_THE_PERSON],
      ['an agent', asTheWriter()],
    ] as const) {
      const filed = aTitleAlreadyFiled()
      // NOT A TITLE WITH NOTHING CLOSE TO IT: both notes are among the close titles, and the answer leaves them out.
      expect(t.api.nearDuplicateTitles(filed.title, PROJECT).map((one) => one.id).sort(), `${who}: the close titles before the write`).toEqual(
        [filed.same, filed.close].sort(),
      )
      let holder = ''
      if (who === 'an agent') {
        holder = t.api.createRecord({ workspaceId: PROJECT, kind: 'session', title: 'A synthetic holder', actor: t.api.HUMAN,
          data: { state: 'running', runtime: 'claude-code' } }).id
        const { registerResource } = await import('../src/server/lib/resources.ts')
        registerResource({ workspaceId: PROJECT, sessionRecordId: holder, type: 'process', key: String(process.pid), actor: t.api.HUMAN })
        const held = await app.inject({ method: 'POST', url: `/api/handles/${encodeURIComponent(READER)}/hold`, headers: AS_THE_PERSON,
          payload: { session: holder, machine: 'a-synthetic-machine', runtime: 'claude-code' } })
        expect(held.statusCode, held.body).toBe(201)
      }
      const sent = await counted(() =>
        app.inject({
          method: 'POST',
          url: '/api/records',
          headers,
          payload: { kind: 'message', title: filed.title, data: { body: 'A made-up message.', to: [{ kind: 'agent', id: agentId(READER) }] } },
        }),
      )
      if (holder) {
        const released = await app.inject({ method: 'POST', url: `/api/handles/${encodeURIComponent(READER)}/release`, headers: AS_THE_PERSON,
          payload: { session: holder, because: 'The synthetic send is complete.' } })
        expect(released.statusCode, released.body).toBe(200)
      }
      // The person sends to an unheld reader; the agent sends while the reader is held.
      // The answer's lists are what this case reads, and a 409 carries them all the same.
      expect(sent.answer.statusCode, sent.answer.body).toBe(who === 'the person' ? 409 : 201)
      const reply = JSON.parse(sent.answer.body) as Record<string, unknown> & { sameTitle?: { id: string }[]; sameTitleNote?: unknown }
      expect(reply.sameTitle?.map((one) => one.id), `${who}: the records called the same`).toEqual([filed.same])
      expect(reply.sameTitleNote, `${who}: the sentence beside them`).toEqual(expect.stringContaining(`already called "${filed.title}"`))
      expect(Object.keys(reply).filter((key) => key === 'similar' || key === 'similarNote'), `${who}: the close titles in the answer`).toEqual([])
      expect({ runs: sent.runs, rows: sent.rows }, `${who}: the statement over every title`).toEqual({ runs: 0, rows: 0 })
    }

    // A NOTE THROUGH THE SAME DOOR STILL NAMES BOTH LISTS, so the message's answer is not that of a door that makes neither.
    const filed = aTitleAlreadyFiled()
    const close = JSON.parse(JSON.stringify(t.api.nearDuplicateTitles(filed.title, PROJECT))) as ReturnType<typeof t.api.nearDuplicateTitles>
    expect(close.map((one) => one.id).sort(), 'a note: the close titles before the write').toEqual([filed.same, filed.close].sort())
    const records = liveRecords()
    const sent = await counted(() =>
      app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: { kind: 'note', title: filed.title, data: { body: 'A made-up note.' } } }),
    )
    expect(sent.answer.statusCode, sent.answer.body).toBe(201)
    const reply = JSON.parse(sent.answer.body) as { record: { id: string }; similar?: unknown; similarNote?: unknown; sameTitle?: { id: string }[] }
    expect(reply.similar, 'a note: the close titles in the answer').toEqual(close)
    expect(reply.similarNote, 'a note: the sentence beside them').toBe(t.api.describeSimilar(reply.record.id, close))
    expect(reply.sameTitle?.map((one) => one.id), 'a note: the records called the same').toEqual([filed.same])
    expect({ runs: sent.runs, rows: sent.rows }, 'a note: the statement over every title').toEqual({ runs: 1, rows: records })
  })

  it('2. a draft sent as a message, a report or a note reads no title, and its answer names neither list', async () => {
    for (const becomes of ['message', 'report', 'note'] as const) {
      const filed = aTitleAlreadyFiled()
      const draft = await app.inject({
        method: 'POST',
        url: '/api/records',
        headers: asTheWriter(),
        payload: {
          kind: 'draft',
          title: filed.title,
          data: { body: 'Made-up words.', becomes, ...(becomes === 'message' ? { for: [{ kind: 'agent', id: agentId(READER) }] } : {}) },
        },
      })
      expect(draft.statusCode, draft.body).toBe(201)
      const id = (JSON.parse(draft.body) as { record: { id: string } }).record.id
      const sent = await counted(() => app.inject({ method: 'POST', url: `/api/drafts/${id}/send`, headers: asTheWriter() }))
      expect(sent.answer.statusCode, sent.answer.body).toBe(201)
      const reply = JSON.parse(sent.answer.body) as Record<string, unknown> & { became: { kind: string; title: string } }
      expect(reply.became.kind).toBe(becomes)
      expect(reply.became.title, 'the record is called what a note already filed is called').toBe(filed.title)
      expect(Object.keys(reply).filter((key) => THE_LIST_KEYS.includes(key)), `a ${becomes}: the lists in the answer`).toEqual([])
      expect({ runs: sent.runs, rows: sent.rows }, `a ${becomes}: the statement over every title`).toEqual({ runs: 0, rows: 0 })
    }
  })
})
