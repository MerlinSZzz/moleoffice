// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The API's half of "strict schema, flexible completeness", over real HTTP.
 *
 * The decision these tests hold in place, in one line: a record with something WRONG in it is
 * refused and nothing is stored; a record that is merely UNFINISHED is stored, and every response
 * that carries it says what it is still missing.
 *
 * Both halves matter and they fail in opposite directions, so both are tested here rather than
 * only the new one:
 *
 *   - The bug that started this was a POST of {"contxet":"typo"} answered with a 201, found six
 *     hours later in a screenshot. The refusal tests below make sure relaxing the required-field
 *     rule did not relax that one too.
 *   - The cost of over-correcting was 22 tests that could no longer create a module the natural
 *     way. `POST {"kind":"module","title":"x"}` is a legitimate write, and the tests assert the
 *     201 does NOT keep quiet about the two empty fields — a silent 201 is the same failure as
 *     the one just fixed, pointing the other way.
 *
 * Nothing here is allowed to assert that completeness is STORED, because it is not: there is no
 * column and no flag. `everyIncompletenessIsComputed` below reads the raw row out of SQLite and
 * proves the answer came from the specs rather than from the record.
 *
 * HOW THE HTTP TESTS ARE BUILT. src/server/index.ts listens on a port the moment it is imported,
 * so it cannot be imported here. Its routes are plain Fastify plugins, so this file registers the
 * same ones against a throwaway database, the way tests/patch.test.ts and tests/kinds-api.test.ts
 * do. Every import is dynamic and happens AFTER freshDb() has pointed MOLE_OFFICE_DB at a temporary
 * file, because db/client.ts opens its file the moment it is first imported.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

// ------------------------------------------------------------------------------ the harness

interface Harness {
  db: TestDb
  app: FastifyInstance
}

async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  const app = Fastify()
  // Without this a PanelError becomes a 500 with no message, and every assertion about what a
  // caller is told would be testing Fastify's default rather than Mole Office's answer.
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.ready()
  return { db, app }
}

let h: Harness
beforeEach(async () => {
  h = await freshApp()
})
afterEach(() => {
  h.db.close()
})

// ------------------------------------------------------------------------------ small readers

/** The JSON body of a response, as an object, or a failure that shows what actually came back. */
function bodyOf(res: { body: string; statusCode: number }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 200)}`)
  }
  return parsed as Record<string, unknown>
}

function errorOf(res: { body: string; statusCode: number }): string {
  const message = bodyOf(res)['error']
  if (typeof message !== 'string') throw new Error(`expected an error string, got ${res.body.slice(0, 200)}`)
  return message
}

function recordOf(res: { body: string; statusCode: number }): Record<string, unknown> {
  const record = bodyOf(res)['record']
  if (typeof record !== 'object' || record === null) {
    throw new Error(`expected a record, got ${res.body.slice(0, 200)}`)
  }
  return record as Record<string, unknown>
}

interface Incompleteness {
  path: string
  message: string
}

/**
 * The `incomplete` list of a response, checked to be one.
 *
 * It is read as a list of {path, message} rather than as strings, because `path` is what a UI
 * anchors on and a test that only looked at the message would not notice it going missing.
 */
function incompleteOf(res: { body: string; statusCode: number }): Incompleteness[] {
  const list = bodyOf(res)['incomplete']
  if (!Array.isArray(list)) throw new Error(`expected an incomplete array, got ${res.body.slice(0, 300)}`)
  return list.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null) throw new Error(`incomplete[${i}] is not an object`)
    const { path, message } = entry as Record<string, unknown>
    if (typeof path !== 'string' || typeof message !== 'string') {
      throw new Error(`incomplete[${i}] must have a string path and message, got ${JSON.stringify(entry)}`)
    }
    return { path, message }
  })
}

const pathsOf = (res: { body: string; statusCode: number }) => incompleteOf(res).map((i) => i.path)

/** The one-sentence version, or undefined when the response did not carry one. */
function noteOf(res: { body: string; statusCode: number }): string | undefined {
  const note = bodyOf(res)['incompleteNote']
  if (note === undefined) return undefined
  if (typeof note !== 'string') throw new Error(`incompleteNote must be a string, got ${JSON.stringify(note)}`)
  return note
}

/**
 * The three requests, awaited.
 *
 * `inject` returns a chainable object rather than a plain promise, so each helper awaits it here:
 * a caller that forgot the await would otherwise be reading `statusCode` off the chain and
 * getting undefined, which reads as a test that passed.
 */
const post = async (url: string, body: Record<string, unknown>) =>
  await h.app.inject({ method: 'POST', url, payload: body })
const patch = async (url: string, body: Record<string, unknown>) =>
  await h.app.inject({ method: 'PATCH', url, payload: body })
const get = async (url: string) => await h.app.inject({ method: 'GET', url })

/** Create a module with only a title. The write the 22 broken tests were all doing. */
const stubModule = (title = 'wrist camera') => post('/api/records', { kind: 'module', title })

// ============================================================ a stub is stored, and reported

describe('POST stores an unfinished record and says what is missing', () => {
  it('creates a module from a title alone, with a 201 that names both empty fields', async () => {
    const res = await stubModule()
    expect(res.statusCode).toBe(201)

    // Stored, and stored as it was sent: no invented context, no empty parts array put there to
    // make the record look finished. A default written on the caller's behalf is the silent
    // fallback this project refuses.
    const record = recordOf(res)
    expect(record['title']).toBe('wrist camera')
    expect(record['data']).toEqual({})

    // In the order KIND_SPECS declares them, so a page can render the list straight through.
    expect(pathsOf(res)).toEqual(['data.context', 'data.parts'])

    // Each entry is a sentence someone can act on, not "context is required".
    const [context] = incompleteOf(res)
    expect(context?.message).toContain('incomplete')
    expect(context?.message.length).toBeGreaterThan(40)
  })

  it('leads with one sentence, because a 201 that hides this is the silence we just removed', async () => {
    const note = noteOf(await stubModule())
    expect(note).toBeDefined()
    expect(note).toContain('incomplete')
    expect(note).toContain('data.context')
    expect(note).toContain('data.parts')
    // It has to say what to do next, not only what is wrong.
    expect(note).toContain('PATCH')
  })

  it('says nothing extra when the record is complete', async () => {
    const res = await post('/api/records', {
      kind: 'module',
      title: 'complete module',
      data: { context: 'why this exists', parts: [] },
    })
    expect(res.statusCode).toBe(201)
    expect(incompleteOf(res)).toEqual([])
    expect(noteOf(res)).toBeUndefined()
  })

  it('treats an empty checklist as complete — [] is an answer, absence is not', async () => {
    const res = await post('/api/records', {
      kind: 'module',
      title: 'nothing to do yet',
      data: { context: 'measured, nothing outstanding', parts: [] },
    })
    expect(pathsOf(res)).toEqual([])
  })

  it('accepts a data-less record of every kind that used to need one', async () => {
    // The 22 tests that broke were spread over these kinds. Each one is a stub with a 201.
    // `message` LEFT THIS LIST ON 4 SEPTEMBER 2026 and has a test of its own below. It is not an
    // exception to filing a stub: a message names who it is to, and one that names nobody and points
    // at nothing reaches nobody, so there is no stub of it to file.
    for (const kind of ['module', 'session', 'pipeline', 'direction', 'obligation']) {
      const res = await post('/api/records', { kind, title: `stub ${kind}` })
      expect(res.statusCode, `${kind}: ${res.body.slice(0, 200)}`).toBe(201)
    }
  })

  it('refuses a message with no data, because a message that names nobody reaches nobody', async () => {
    const refused = await post('/api/records', { kind: 'message', title: 'stub message' })
    expect(refused.statusCode).toBe(400)
    expect(refused.body).toContain('names nobody and points at nothing')
    // AND ACCEPTS ONE THE MOMENT IT NAMES SOMEBODY, still with nothing else on it. What is refused
    // is the missing addressee, not an unfinished record.
    const taken = await post('/api/records', {
      kind: 'message',
      title: 'stub message',
      data: { to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }] },
    })
    expect(taken.statusCode, taken.body.slice(0, 200)).toBe(201)
  })

  it('reports nothing for a kind with no required fields', async () => {
    const res = await post('/api/records', { kind: 'note', title: 'a thought' })
    expect(res.statusCode).toBe(201)
    expect(incompleteOf(res)).toEqual([])
    expect(noteOf(res)).toBeUndefined()
  })
})

// ============================================================ wrong is still refused

describe('a wrong field is still a 400 with nothing stored', () => {
  it('refuses the misspelt key that started all this', async () => {
    const res = await post('/api/records', {
      kind: 'module',
      title: 'probe',
      data: { contxet: 'typo' },
    })
    expect(res.statusCode).toBe(400)

    const message = errorOf(res)
    expect(message).toContain('contxet')
    expect(message).toContain('did you mean "context"')

    // ONE field is wrong, not two. The absent `parts` is not an error any more, and a refusal
    // that counted it would send the caller looking for a second problem it does not have.
    expect(message).toContain('one field is wrong')

    // And nothing was written: a refusal that stored a partial record would be worse than the
    // 201 it replaced.
    expect(bodyOf(await get('/api/records'))['records']).toEqual([])
  })

  it('refuses a value of the wrong type while the same field being absent is fine', async () => {
    const wrong = await post('/api/records', {
      kind: 'module',
      title: 'typed wrong',
      data: { context: 'fine', parts: 'should be a list' },
    })
    expect(wrong.statusCode).toBe(400)
    expect(errorOf(wrong)).toContain('data.parts')

    const absent = await post('/api/records', {
      kind: 'module',
      title: 'left out',
      data: { context: 'fine' },
    })
    expect(absent.statusCode).toBe(201)
    expect(pathsOf(absent)).toEqual(['data.parts'])
  })

  it('refuses a half-written nested object, which absence never excuses', async () => {
    const res = await post('/api/records', {
      kind: 'module',
      title: 'half a part',
      data: { context: 'fine', parts: [{ id: 'p1' }] },
    })
    // A part you wrote at all has to be written whole: a ModulePart with no name renders as a
    // blank heading. You may leave `parts` out; you may not send half a part.
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('data.parts[0]')
  })

  it('refuses a value outside the vocabulary', async () => {
    // 'finished' is a real session state; 'exploded' is not, and a state nothing renders is a
    // record that will read as blank on the page rather than as wrong.
    const res = await post('/api/records', {
      kind: 'session',
      title: 'bad state',
      data: { state: 'exploded' },
    })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('data.state')
    expect(errorOf(res)).toContain('running')
  })
})

// ============================================================ filling it in, one PATCH at a time

describe('PATCH shrinks the list as the record is enriched', () => {
  it('takes a dataPatch and reports what is still missing after it', async () => {
    const id = String(recordOf(await stubModule())['id'])

    const res = await patch(`/api/records/${id}`, {
      dataPatch: { context: 'A ZED 2i over the chest, looking down the working volume.' },
    })
    expect(res.statusCode).toBe(200)
    expect(pathsOf(res)).toEqual(['data.parts'])
    expect(noteOf(res)).toContain('data.parts')
    expect(noteOf(res)).not.toContain('data.context')

    // The merge work that landed just before this is untouched: one path reported as changed.
    const outcome = bodyOf(res)['dataPatch'] as Record<string, unknown>
    expect(outcome['changed']).toEqual(['data.context'])
    expect(outcome['deleted']).toEqual([])
  })

  it('drops the note entirely once the last field arrives', async () => {
    const id = String(recordOf(await stubModule())['id'])
    await patch(`/api/records/${id}`, { dataPatch: { context: 'why it exists' } })

    const res = await patch(`/api/records/${id}`, {
      dataPatch: { parts: [{ id: 'mount', name: 'Mount and rigid transform', items: [] }] },
    })
    expect(res.statusCode).toBe(200)
    expect(incompleteOf(res)).toEqual([])
    expect(noteOf(res)).toBeUndefined()
  })

  it('reports the record again when a merge DELETES a required field', async () => {
    const created = await post('/api/records', {
      kind: 'module',
      title: 'about to lose its checklist',
      data: { context: 'why it exists', parts: [] },
    })
    expect(incompleteOf(created)).toEqual([])
    const id = String(recordOf(created)['id'])

    // null deletes the key. That is a successful write that makes the record LESS finished, and
    // it is the case that forces `incomplete` to be recomputed from the stored record rather
    // than carried over from what the caller sent.
    const res = await patch(`/api/records/${id}`, { dataPatch: { parts: null } })
    expect(res.statusCode).toBe(200)
    expect((bodyOf(res)['dataPatch'] as Record<string, unknown>)['deleted']).toEqual(['data.parts'])
    expect(recordOf(res)['data']).toEqual({ context: 'why it exists' })
    expect(pathsOf(res)).toEqual(['data.parts'])
    expect(noteOf(res)).toContain('data.parts')
  })

  it('still validates a merge as the whole record it produces', async () => {
    const id = String(recordOf(await stubModule())['id'])
    await patch(`/api/records/${id}`, { dataPatch: { context: 'why it exists' } })

    const res = await patch(`/api/records/${id}`, { dataPatch: { parts: 'a string' } })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('data.parts')

    // Refused means nothing moved: the context written a moment ago is still there.
    const after = await get(`/api/records/${id}`)
    expect(recordOf(after)['data']).toEqual({ context: 'why it exists' })
    expect(pathsOf(after)).toEqual(['data.parts'])
  })

  it('reports the record on a patch that never touches data at all', async () => {
    const id = String(recordOf(await stubModule())['id'])

    // A title-only patch does not reach the validation gate. The report describes the RECORD,
    // not the patch, so it still comes back — answering "nothing missing" because nothing was
    // checked would report a half-written module as finished.
    const res = await patch(`/api/records/${id}`, { title: 'wrist camera, renamed' })
    expect(res.statusCode).toBe(200)
    expect(pathsOf(res)).toEqual(['data.context', 'data.parts'])
    expect(bodyOf(res)['dataPatch']).toBeUndefined()
  })

  it('reports the record on a merge that changed nothing', async () => {
    const created = await post('/api/records', {
      kind: 'module',
      title: 'unchanged',
      data: { context: 'why it exists' },
    })
    const id = String(recordOf(created)['id'])

    // Re-sending the value that is already there writes nothing, not even updatedAt. The report
    // is still the truth about the record.
    const res = await patch(`/api/records/${id}`, { dataPatch: { context: 'why it exists' } })
    expect(res.statusCode).toBe(200)
    expect((bodyOf(res)['dataPatch'] as Record<string, unknown>)['unchanged']).toEqual(['data.context'])
    expect(pathsOf(res)).toEqual(['data.parts'])
  })
})

// ============================================================ the read path agrees with the write

describe('every response carrying a record carries its incompleteness', () => {
  it('GET /records/:id says exactly what the 201 said', async () => {
    const created = await stubModule()
    const id = String(recordOf(created)['id'])

    const read = await get(`/api/records/${id}`)
    expect(read.statusCode).toBe(200)
    // Same specs, same data, so the same answer. If the write path and the read path ever
    // computed it differently, this is where it shows.
    expect(incompleteOf(read)).toEqual(incompleteOf(created))
    // A read is not news, so no sentence: the page draws the empty fields where they belong.
    expect(noteOf(read)).toBeUndefined()
    // And the rest of the page's data is still there.
    expect(bodyOf(read)['links']).toEqual([])
    expect(Array.isArray(bodyOf(read)['changes'])).toBe(true)
  })

  it('POST /records/:id/restore brings the report back with the record', async () => {
    const id = String(recordOf(await stubModule())['id'])
    await h.app.inject({ method: 'DELETE', url: `/api/records/${id}` })

    const res = await post(`/api/records/${id}/restore`, {})
    expect(res.statusCode).toBe(200)
    expect(pathsOf(res)).toEqual(['data.context', 'data.parts'])
    expect(noteOf(res)).toBeDefined()
  })
})

// ============================================================ the list carries a count, not text

describe('GET /records carries a count per record', () => {
  beforeEach(async () => {
    await stubModule('stub one')
    await post('/api/records', {
      kind: 'module',
      title: 'finished one',
      data: { context: 'why it exists', parts: [] },
    })
    await post('/api/records', { kind: 'session', title: 'stub session' })
  })

  const rows = async (url = '/api/records?shape=full') => {
    const list = bodyOf(await get(url))['records']
    if (!Array.isArray(list)) throw new Error('expected a records array')
    return list as Record<string, unknown>[]
  }

  it('counts what each record is missing', async () => {
    const byTitle = new Map((await rows()).map((r) => [String(r['title']), r]))
    expect(byTitle.get('stub one')?.['incompleteCount']).toBe(2)
    expect(byTitle.get('finished one')?.['incompleteCount']).toBe(0)
    expect(byTitle.get('stub session')?.['incompleteCount']).toBe(1)
  })

  it('sends the count and NOT the sentences, so the list stays light', async () => {
    for (const row of await rows()) {
      expect(typeof row['incompleteCount']).toBe('number')
      // The full descriptions on every row would be kilobytes of text the list never renders.
      expect(row['incomplete']).toBeUndefined()
    }
    // The record itself is still spread across the row, so everything reading .title still works.
    const first = (await rows())[0]
    expect(first?.['kind']).toBeDefined()
    expect(first?.['data']).toBeDefined()
  })

  it('keeps the counts when the list is narrowed to one kind', async () => {
    const modules = await rows('/api/records?kind=module&shape=full')
    expect(modules).toHaveLength(2)
    expect(modules.map((r) => r['incompleteCount']).sort()).toEqual([0, 2])
  })
})

// ============================================================ computed, never stored

describe('completeness is computed, not stored', () => {
  it('leaves no trace of it in the row', async () => {
    const id = String(recordOf(await stubModule())['id'])

    // Straight out of SQLite, past every layer that could be adding the field on the way out.
    const row = h.db.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(id) as Record<
      string,
      unknown
    >
    expect(Object.keys(row)).not.toContain('incomplete')
    expect(Object.keys(row)).not.toContain('incompleteCount')
    expect(JSON.parse(String(row['data']))).toEqual({})
  })

  it('answers for a row written straight to the database, past the gate entirely', async () => {
    // A record from before any of this existed: `data` holding something no spec declares. The
    // read path must still answer, because one bad row must not take down a page. It is the
    // reason completenessOf never throws.
    h.db.client.sqlite
      .prepare(
        `INSERT INTO records (id, kind, workspace_id, owner_id, title, summary, data, created_at, updated_at)
         VALUES (?, 'module', 'default', '${THE_TEST_OFFICES_OWNER.id}', 'written before the gate', NULL, ?, ?, ?)`,
      )
      .run('legacy000001', JSON.stringify({ contxet: 'the typo, already stored' }), '2026-01-01 09:00:00', '2026-01-01 09:00:00')

    const res = await get('/api/records/legacy000001')
    expect(res.statusCode).toBe(200)
    expect(pathsOf(res)).toEqual(['data.context', 'data.parts'])

    const list = bodyOf(await get('/api/records?shape=full'))['records'] as Record<string, unknown>[]
    expect(list.find((r) => r['id'] === 'legacy000001')?.['incompleteCount']).toBe(2)
  })
})
