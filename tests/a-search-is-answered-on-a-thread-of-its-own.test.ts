// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEARCH IS ANSWERED ON A THREAD OF ITS OWN, WITH THE SAME ANSWER, AND THE SERVER ANSWERS OTHER REQUESTS MEANWHILE.
 *
 * Wave 13y round 167. GET /api/search worked its answer out on the thread that reads requests, so while it ran the
 * server read no other request. On the made-up office of the live shape, a search for a word nearly every record says
 * took seconds, and every other request waited for it. The search is now answered on a worker thread
 * (src/server/lib/search-thread.ts).
 *
 * WHAT IS HELD HERE:
 *   1. A search through the door runs none of its reads on the request thread: no statement there reads the index of
 *      the records' text, which the same search worked out here does read.
 *   2. A request sent after a search is answered before it, while the search waits for its thread to start.
 *   3. The door answers what `theSearchAnswer` answers here, for the person and an agent: for a word few records say, a
 *      word most say, one kind, a limit, every project, one other project, a record's id, two letters, and a word no
 *      record says.
 *   4. A search that is waiting when the thread ends fails with the sentence that says so, and is not answered on the
 *      request thread instead. The next search starts a thread again and is answered.
 *
 * WHAT IS NOT HELD HERE: how long anything takes. That is measured on the made-up office of the live shape, where a
 * search takes seconds. On this small office every search takes milliseconds, and the machine's load would decide a
 * limit in time.
 *
 * The office is tests/the-office-with-every-way-into-a-view.ts, with a few made-up notes added. Every row is made up.
 */
import type { FastifyInstance } from 'fastify'
import { Worker } from 'node:worker_threads'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { NARROWED_BY_PERMISSION } from '../src/shared/disclosure.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { buildTheOfficeWithEveryWayIntoAView, ELSEWHERE } from './the-office-with-every-way-into-a-view.ts'

let t: TestDb
let app: FastifyInstance
let agentHandle = ''
let aNoteId = ''

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS', '120')
  t = await freshDb()
  const R = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: R.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  const { office } = await buildTheOfficeWithEveryWayIntoAView(t.client.sqlite)
  agentHandle = (t.client.sqlite.prepare('select handle from agents where id = ?').get(office.theAgent) as { handle: string }).handle
  aNoteId = aNote('A made-up quillwort survey', null, { body: 'Counted by the pond.' })
  aNote('A made-up pond', 'beside the quillwort', {})
  aNote('A made-up far quillwort', null, { body: 'A made-up measurement.' }, ELSEWHERE)
  app = (await apiApp()).app
  await app.ready()
}, 300_000)

afterAll(async () => {
  await app.close()
  vi.unstubAllEnvs()
  t.close()
})

/** A note with this title, summary and data, written through the records' own write, so the index holds it. */
function aNote(title: string, summary: string | null, data: Record<string, unknown>, workspaceId = 'default'): string {
  return t.api.createRecord({ workspaceId, kind: 'note', title, ...(summary === null ? {} : { summary }), data, actor: t.api.HUMAN }).id
}

const READERS = [
  { is: 'the person', actor: (): { type: string; id: string } => ({ type: 'human', id: THE_PERSON }) },
  { is: 'an agent', actor: (): { type: string; id: string } => ({ type: 'agent', id: agentHandle }) },
]

function headersOf(actor: { type: string; id: string }): Record<string, string> {
  return { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': actor.type, 'x-mole-office-actor-id': actor.id }
}

/** The answer `theSearchAnswer` works out here, for the search the door reads from this query string and reader. */
async function theAnswerHere(query: string, reader: () => { type: string; id: string }): Promise<unknown> {
  const { theSearchAnswer, theSearchAsk } = await import('../src/server/api/search.ts')
  return theSearchAnswer(theSearchAsk('default', Object.fromEntries(new URLSearchParams(query)), reader))
}

/** The text of every statement this thread runs while `run` runs. */
async function theStatementsOf(run: () => Promise<unknown>): Promise<string[]> {
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
    await run()
  } finally {
    for (const [method, call] of originals) prototype[method] = call
  }
  return ran
}

/** Whether a statement reads the index of the records' text (src/server/lib/record-text-index.ts). */
const readsTheIndex = (sql: string): boolean => /\brecord_text\s+MATCH\b/i.test(sql)

describe('a search', () => {
  it('starts its thread when the search door is set up', async () => {
    const { endTheSearchThread } = await import('../src/server/lib/search-thread.ts')
    const terminate = vi.spyOn(Worker.prototype, 'terminate')
    try {
      await endTheSearchThread()
      expect(terminate).toHaveBeenCalledTimes(1)
    } finally {
      terminate.mockRestore()
    }
  })

  it('tells the next search when an early thread start fails, then tries again', async () => {
    const { endTheSearchThread, searchOnItsOwnThread } = await import('../src/server/lib/search-thread.ts')
    const { theSearchAsk } = await import('../src/server/api/search.ts')
    await endTheSearchThread()
    const unref = vi.spyOn(Worker.prototype, 'unref').mockImplementation(function (this: Worker) {
      queueMicrotask(() => {
        this.emit('error', new Error('made-up thread startup failure'))
        void this.terminate()
      })
      return this
    })
    const other = (await apiApp()).app
    try {
      await other.ready()
      expect(unref).toHaveBeenCalled()
      unref.mockRestore()
      const ask = theSearchAsk('default', { q: 'quillwort' }, READERS[0]!.actor)
      await expect(searchOnItsOwnThread(ask)).rejects.toThrow('made-up thread startup failure')
      expect(JSON.parse(JSON.stringify(await searchOnItsOwnThread(ask)))).toEqual(JSON.parse(JSON.stringify(await theAnswerHere('q=quillwort', READERS[0]!.actor))))
    } finally {
      unref.mockRestore()
      await other.close()
    }
  }, 60_000)
  it('1. runs none of its reads on the request thread', async () => {
    const here = await theStatementsOf(() => theAnswerHere('q=quillwort', READERS[0]!.actor))
    expect(here.filter(readsTheIndex).length, 'the reads of the index by the same search worked out here').toBeGreaterThan(0)
    let status = 0
    const onTheRequestThread = await theStatementsOf(async () => {
      status = (await app.inject({ method: 'GET', url: '/api/search?q=quillwort', headers: headersOf(READERS[0]!.actor()) })).statusCode
    })
    expect(status).toBe(200)
    expect(onTheRequestThread.filter(readsTheIndex), 'the reads of the index on the request thread').toEqual([])
  }, 60_000)

  it('2. lets a request sent after it be answered before it, while it waits for its thread to start', async () => {
    const { endTheSearchThread } = await import('../src/server/lib/search-thread.ts')
    // NO THREAD IS RUNNING, so the search below starts one and waits for it to load.
    await endTheSearchThread()
    const answered: string[] = []
    const search = app.inject({ method: 'GET', url: '/api/search?q=quillwort', headers: headersOf(READERS[0]!.actor()) }).then((reply) => {
      answered.push('the search')
      return reply
    })
    const read = app.inject({ method: 'GET', url: `/api/records/${aNoteId}`, headers: headersOf(READERS[0]!.actor()) }).then((reply) => {
      answered.push('the record')
      return reply
    })
    const [searched, record] = await Promise.all([search, read])
    expect(searched.statusCode, searched.body).toBe(200)
    expect(record.statusCode, record.body).toBe(200)
    expect(answered, 'the order the two were answered in').toEqual(['the record', 'the search'])
  }, 60_000)

  describe('3. answers what the same search worked out here answers', () => {
    for (const reader of READERS) {
      it(`for ${reader.is}`, async () => {
        const queries = [
          'q=survey',
          'q=quillwort',
          'q=measurement',
          'q=quillwort&kind=note',
          'q=measurement&limit=2',
          'q=quillwort&projects=all',
          `q=quillwort&projects=${ELSEWHERE}`,
          `q=${aNoteId}`,
          'q=mo',
          'q=zzqqxxnothing',
        ]
        for (const query of queries) {
          const reply = await app.inject({ method: 'GET', url: `/api/search?${query}`, headers: headersOf(reader.actor()) })
          expect(reply.statusCode, reply.body).toBe(200)
          // THE KEY EVERY ANSWERED READ CARRIES, added by the server as it writes the reply (`sayWhetherPermissionNarrowedIt`).
          const asTheDoorWritesIt = { ...(JSON.parse(JSON.stringify(await theAnswerHere(query, reader.actor))) as object), [NARROWED_BY_PERMISSION]: null }
          expect(reply.json(), query).toEqual(asTheDoorWritesIt)
        }
      }, 60_000)
    }
  })

  it('4. fails, and says so, when its thread ends before it is answered, and the next search starts a thread again', async () => {
    const { endTheSearchThread, searchOnItsOwnThread, THE_SERVER_CLOSED } = await import('../src/server/lib/search-thread.ts')
    const { theSearchAsk } = await import('../src/server/api/search.ts')
    await endTheSearchThread()
    const ask = theSearchAsk('default', { q: 'quillwort' }, READERS[1]!.actor)
    const waiting = searchOnItsOwnThread(ask)
    await endTheSearchThread()
    await expect(waiting).rejects.toThrow(THE_SERVER_CLOSED)
    expect(JSON.parse(JSON.stringify(await searchOnItsOwnThread(ask)))).toEqual(JSON.parse(JSON.stringify(await theAnswerHere('q=quillwort', READERS[1]!.actor))))
  }, 60_000)
})
