// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEARCH WORKS OUT ONCE WHICH MESSAGES A READER COULD BE A PARTY TO, COUNTS THE RECORDS IT SEARCHED WITHOUT READING
 * THEM AGAIN, AND COUNTS THE MATCHES IN OTHER PROJECTS WITHOUT A SNIPPET. EACH ANSWERS AS IT DID.
 *
 * Wave 13y round 114, item 47, the fourth pass over the API's speed. MEASURED FIRST, 31 October 2026, on the made-up
 * office shaped to the live counts of that morning (126,005 records in eleven projects and the message centre, 428 MB
 * of data), as an agent: GET /api/search for a word nearly every record says, from the second largest project, took
 * 3,289 ms, the median of three takes after one warm-up, at a load of 3.6 on 20 cores. It read whole the records of its
 * own project and of the ten others, which its answer needs. For each of those eleven lists it worked out again which
 * messages the agent could be a party to, about 390 ms of its statements, and for each other project it built a snippet
 * for every match only to count them. For a word few records say it took 377 ms, and 163 ms of that read every record
 * of the project again, without its data, to count how many it searched.
 *
 * WHAT IS HELD HERE:
 *   1. An agent's search works out once which messages it could be a party to, however many lists of messages it reads.
 *   2. The count of the records searched reads no more rows when the project holds more records that do not say it.
 *   3. `counts.searched` is the number of the project's records the reader may read, for the person and an agent, for a
 *      word few records say, a word most records say, and one kind. It is worked out here as the door worked it out
 *      before this round: every record of the project, read whole, less the messages the reader may not read.
 *   4. `elsewhere` gives, for each other project, how many of its records the reader may read say it, worked out here as
 *      the door worked it out before this round: with `searchRecords`, the rule that also builds the snippets.
 *   5. `saysIt` answers what `searchRecord` answers, for made-up records and searches in several scripts.
 *
 * 1 AND 2 COUNT THE STATEMENTS OF `theSearchAnswer`, run here, with the ask the door's own `theSearchAsk` builds. The door
 * answers a search on a thread of its own (src/server/lib/search-thread.ts), and a statement run on that thread is not
 * seen by a spy on this one. 3 and 4 ask the door itself.
 *
 * The office is tests/the-office-with-every-way-into-a-view.ts, with a few made-up notes added. Every row is made up.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { saysIt, searchRecord, searchRecords } from '../src/shared/search.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { THE_MEASURED_NOW } from './the-office-of-the-slowest-reads.ts'
import { buildTheOfficeWithEveryWayIntoAView, ELSEWHERE } from './the-office-with-every-way-into-a-view.ts'

let t: TestDb
let app: FastifyInstance
let agentHandle = ''

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: THE_MEASURED_NOW })
  vi.stubEnv('MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS', '120')
  t = await freshDb()
  const R = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: R.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  const { office } = await buildTheOfficeWithEveryWayIntoAView(t.client.sqlite)
  agentHandle = (t.client.sqlite.prepare('select handle from agents where id = ?').get(office.theAgent) as { handle: string }).handle
  aNote('A made-up quillwort survey', null, { body: 'Counted by the pond.' })
  aNote('A made-up pond', 'beside the quillwort', {})
  aNote('A made-up far quillwort', null, {}, ELSEWHERE)
  // MORE THAN FIFTY MESSAGES WRITTEN IN THE OTHER PROJECT, half of them sent by the agent, so the agent's list of that
  // project's messages is long enough to be narrowed, as the list of its own project's is.
  const add = t.client.sqlite.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values (?, 'message-centre', 'owner', ?, ?, 'message', ?, null, ?, null, 'fixture')`,
  )
  for (let i = 0; i < 56; i += 1) {
    const at = `2026-10-01 10:${String(i).padStart(2, '0')}:00`
    const sentBy = i % 2 === 0 ? { kind: 'agent', id: office.theAgent } : { kind: 'person', id: THE_PERSON }
    const data = { body: 'A made-up measurement, written elsewhere.', to: [{ kind: 'agent', id: 'made-up-nobody' }], sentBy, writtenIn: { project: ELSEWHERE } }
    add.run(`made-up-elsewhere-${String(i).padStart(2, '0')}`, at, at, `A made-up message elsewhere ${String(i)}`, JSON.stringify(data))
  }
  app = (await apiApp()).app
  await app.ready()
}, 300_000)

afterAll(async () => {
  await app.close()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  t.close()
})

/** A note with this title, summary and data, written through the records' own write, so the index holds it. */
function aNote(title: string, summary: string | null, data: Record<string, unknown>, workspaceId = 'default'): string {
  return t.api.createRecord({ workspaceId, kind: 'note', title, ...(summary === null ? {} : { summary }), data, actor: t.api.HUMAN }).id
}

const THE_PERSONS_HEADERS = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const theAgentsHeaders = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agentHandle })
const theAgent = (): { type: string; id: string } => ({ type: 'agent', id: agentHandle })
const READERS = [
  { is: 'the person', headers: () => THE_PERSONS_HEADERS, actor: () => ({ type: 'human', id: THE_PERSON }) },
  { is: 'an agent', headers: theAgentsHeaders, actor: theAgent },
]

interface Answer {
  counts: { matched: number; returned: number; searched: number }
  elsewhere: { workspaceId: string; title: string; matched: number }[]
}

/** Every statement run while `run` runs, a request's included, with the rows it handed back. */
async function theStatementsOf(run: () => Promise<unknown>): Promise<{ sql: string; rows: number }[]> {
  type Run = (this: { source: string }, ...params: unknown[]) => unknown
  // THE STATEMENTS' OWN PROTOTYPE, so a statement prepared before this runs and kept is counted too.
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, Run>
  const ran: { sql: string; rows: number }[] = []
  const originals = new Map<string, Run>()
  for (const method of ['all', 'get', 'run', 'iterate']) {
    const call = prototype[method]!
    originals.set(method, call)
    prototype[method] = function (...params: unknown[]) {
      const got = call.apply(this, params)
      ran.push({ sql: this.source, rows: method === 'all' ? (got as unknown[]).length : method === 'get' ? Number(got !== undefined) : 0 })
      return got
    }
  }
  try {
    await run()
  } finally {
    for (const [method, call] of originals) prototype[method] = call
  }
  return ran
}

async function search(query: string, headers: Record<string, string>): Promise<Answer> {
  const reply = await app.inject({ method: 'GET', url: `/api/search?${query}`, headers: { 'x-mole-office-workspace': 'default', ...headers } })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Answer
}

/** The answer `theSearchAnswer` works out here, for the search the door would read from this query string and reader. */
async function theAnswerHere(query: string, reader: () => { type: string; id: string }): Promise<Answer> {
  const { theSearchAnswer, theSearchAsk } = await import('../src/server/api/search.ts')
  return theSearchAnswer(theSearchAsk('default', Object.fromEntries(new URLSearchParams(query)), reader))
}

describe('a search', () => {
  it('1. works out once which messages an agent could be a party to, however many lists of messages it reads', async () => {
    let answer: Answer | undefined
    const ran = await theStatementsOf(async () => {
      answer = await theAnswerHere('q=measurement', theAgent)
    })
    // The office's other project holds what the agent searched for, so the search read more than one list of messages.
    expect(answer!.elsewhere.map((one) => one.workspaceId), 'the projects elsewhere that say it').toEqual([ELSEWHERE])
    // TWO STATEMENTS OF THE NARROWING STAND FOR ALL OF IT. For an agent reader, `theMessagesAReaderCouldBeAPartyTo`
    // reads, in one statement, the stored senders that could be one of the reader's names with white space around it.
    // Then it looks up the reader's own messages. Both statements go through the index of the sender, once each time
    // the narrowing is worked out. So a narrowing worked out twice would show 4.
    const narrowings = ran.filter((one) => one.sql.includes('records_message_sent_by_idx'))
    expect(narrowings, 'the statements of the narrowing, worked out once').toHaveLength(2)
  })

  it('2. counts the records it searched without reading more rows when the project holds more records that do not say it', async () => {
    const rowsOf = async (): Promise<{ rows: number; searched: number }> => {
      let answer: Answer | undefined
      const ran = await theStatementsOf(async () => {
        answer = await theAnswerHere('q=quillwort', theAgent)
      })
      return { rows: ran.reduce((sum, one) => sum + one.rows, 0), searched: answer!.counts.searched }
    }
    const before = await rowsOf()
    for (let i = 0; i < 30; i += 1) aNote(`A made-up bench ${String(i)}`, null, { body: 'Nothing to find here.' })
    const after = await rowsOf()
    expect(after.searched, 'each new record is counted as searched').toBe(before.searched + 30)
    expect(after.rows, 'the rows the search read').toBe(before.rows)
  })

  describe('3. counts as searched the records of the project the reader may read', () => {
    for (const reader of READERS) {
      for (const query of ['q=quillwort', 'q=measurement', 'q=quillwort&kind=note', 'q=zzqqxxnothing']) {
        it(`for ${reader.is}, ${query}`, async () => {
          const { listRecords } = await import('../src/server/lib/records.ts')
          const { onlyTheMessagesThisReaderMayRead, theMessageReader } = await import('../src/server/lib/messages.ts')
          const kind = query.includes('kind=note') ? { kind: 'note' as const } : {}
          const expected = onlyTheMessagesThisReaderMayRead(theMessageReader(reader.actor()), listRecords({ workspaceId: 'default', ...kind })).length
          if (reader.is === 'an agent' && kind.kind === undefined) {
            // The agent may not read every message of the project, so the count leaves some out.
            expect(expected, 'what the agent may read').toBeLessThan(listRecords({ workspaceId: 'default' }).length)
          }
          expect((await search(query, reader.headers())).counts.searched).toBe(expected)
        })
      }
    }
  })

  describe('4. counts, for each other project, the records the reader may read that say it', () => {
    for (const reader of READERS) {
      for (const q of ['quillwort', 'measurement']) {
        it(`for ${reader.is}, q=${q}`, async () => {
          const { listRecords } = await import('../src/server/lib/records.ts')
          const { onlyTheMessagesThisReaderMayRead, theMessageReader } = await import('../src/server/lib/messages.ts')
          const { recordsWithTheHonourThisReaderMaySee } = await import('../src/server/lib/honour.ts')
          const { listWorkspaces } = await import('../src/server/lib/workspaces.ts')
          const me = theMessageReader(reader.actor())
          const expected = listWorkspaces()
            .filter((w) => w.id !== 'default')
            .map((w) => {
              const rows = recordsWithTheHonourThisReaderMaySee(onlyTheMessagesThisReaderMayRead(me, listRecords({ workspaceId: w.id })), me)
              return { workspaceId: w.id, title: w.title, matched: searchRecords(rows.map((row) => ({ ...row, incompleteCount: 0 })), q).length }
            })
            .filter((w) => w.matched > 0)
            .sort((a, b) => b.matched - a.matched)
          expect(expected.length, 'the projects elsewhere that say it').toBeGreaterThan(0)
          expect((await search(`q=${q}`, reader.headers())).elsewhere).toEqual(expected)
        })
      }
    }
  })
})

/** A fixed sequence of numbers in [0, 1), so a failure can be run again. */
function aSequence(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = Math.imul(state ^ (state >>> 15), 1 | state)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

// Pieces of text in several scripts, with the letters JavaScript folds in its own way (the Kelvin sign, the dotted
// capital I, the sharp s), blanks, and a word that is only ever a field's name.
const PIECES = ['quillwort', 'Quillwort', 'QUILLWORT', '夹具标定', '夹具', 'ქართული', 'ᲥᲐᲠᲗᲣᲚᲘ', 'Kelvin', 'kelvin', 'İstanbul', 'istanbul', 'straße', 'STRASSE', '   ', '', 'pond', 'a pond by the bench', '18']

describe('5. saysIt', () => {
  it('answers what searchRecord answers, for made-up records and searches in several scripts', () => {
    const next = aSequence(114)
    const pick = (): string => PIECES[Math.floor(next() * PIECES.length)]!
    const aValue = (depth: number): unknown => {
      const roll = next()
      if (depth > 2 || roll < 0.35) return pick()
      if (roll < 0.45) return Math.floor(next() * 40)
      if (roll < 0.5) return next() < 0.5
      if (roll < 0.55) return null
      if (roll < 0.75) return Array.from({ length: Math.floor(next() * 3) }, () => aValue(depth + 1))
      return Object.fromEntries(Array.from({ length: Math.floor(next() * 3) }, (_, i) => [next() < 0.2 ? 'symptom' : `field${String(i)}`, aValue(depth + 1)]))
    }
    const records: PanelRecord[] = Array.from({ length: 300 }, (_, i) => ({
      id: `made-up-${String(i)}`,
      kind: 'note',
      workspaceId: 'default',
      ownerId: 'owner',
      title: next() < 0.2 ? pick() : `A made-up note ${String(i)}`,
      summary: next() < 0.5 ? null : pick(),
      data: aValue(0) as Record<string, unknown>,
      createdAt: '2026-10-31 09:00:00',
      updatedAt: '2026-10-31 09:00:00',
      deletedAt: null,
    }) as PanelRecord)
    const queries = [...PIECES, 'symptom', ' pond ', 'note 1', 'made-up', 'zzqqxxnothing']
    let said = 0
    let notSaid = 0
    for (const record of records) {
      for (const q of queries) {
        const expected = searchRecord(record, q) !== null
        expect(saysIt(record, q), `${JSON.stringify(record)} for "${q}"`).toBe(expected)
        if (expected) said += 1
        else notSaid += 1
      }
    }
    // The pairs hold both answers in number, so the agreement is not only on records that say nothing.
    expect(said, 'the pairs where the record says it').toBeGreaterThan(500)
    expect(notSaid, 'the pairs where it does not').toBeGreaterThan(500)
  })
})
