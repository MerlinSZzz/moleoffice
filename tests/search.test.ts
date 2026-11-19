// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * FINDING A RECORD BY WHAT IT SAYS.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASUREMENT THIS ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * There was no search: `GET /api/search` was a 404 and `?q=` a 400, so every "which record says X"
 * was a full corpus download and local string matching. An agent that used the product for a week:
 * *"Answering questions 4, 5, 10 and 11 was string-matching in Python, not API use."*
 *
 * The browser had a box and it narrowed the records ALREADY LOADED, by title and one-line summary
 * only. Measured against the live corpus on 2026-08-12, that is not nearly enough — more than half
 * of every real search is in the body of the record:
 *
 *     clamp        matches  20 records · only  9 by title and summary
 *     anchor                 8                 2
 *     workspace            100                13
 *
 * So the tests below are about the three things that separate this from a `LIKE '%q%'`:
 *
 *   - it reads VALUES and never field names, or searching `symptom` returns every problem;
 *   - it works in both scripts by being a substring match, because Chinese has no word boundary
 *     and no case, and English has both;
 *   - "nothing matched" and "there was nothing to match against" are different answers.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import { searchRecords, textValuesIn } from '../src/shared/search.ts'
import type { PanelRecord } from '../src/shared/types.ts'

interface Harness {
  db: TestDb
  app: FastifyInstance
}

async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { searchRoutes } = await import('../src/server/api/search.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const app = Fastify()
  installErrorHandling(app)
  await app.register(searchRoutes, { prefix: '/api' })
  await app.ready()
  return { db, app }
}

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  const h = await freshApp()
  t = h.db
  app = h.app
})

afterEach(async () => {
  await app.close()
  t.close()
})

/** The reply of a search, insisted upon. */
async function search(query: string, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url: `/api/search?${query}`, headers })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  return JSON.parse(res.body) as Record<string, unknown>
}

/** The refusal sentence of a search that should not have been answered. */
async function refused(query: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: `/api/search?${query}` })
  expect(res.statusCode, res.body.slice(0, 200)).toBe(400)
  return String((JSON.parse(res.body) as { error: string }).error)
}

/** The titles that came back, in the order they came back. */
const titlesOf = (body: Record<string, unknown>): string[] =>
  (body['results'] as { record: PanelRecord }[]).map((r) => r.record.title)

describe('a search reads what a record says, not only what it is called', () => {
  it('finds a word that is only in the body, and says where it found it', async () => {
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'problem',
      title: 'The rig keeps moving after the stop button is pressed',
      summary: 'Reproduced twice on the bench.',
      data: { state: 'open', symptom: 'The clamp stays closed and the carriage keeps travelling.' },
      actor: AGENT,
    })

    const body = await search('q=clamp')

    // THE ASSERTION THIS FILE EXISTS FOR. The word is in neither the title nor the summary, and a
    // search that only read those would answer nothing — which is what the browser box did.
    expect(body['counts']).toMatchObject({ matched: 1, searched: 1 })
    const hits = (body['results'] as { hits: { where: string; snippet: string }[] }[])[0]?.hits ?? []
    expect(hits[0]?.where).toBe('data.symptom')
    // And enough of the text to see WHY it matched, rather than a bare true.
    expect(hits[0]?.snippet).toContain('clamp')
  })

  it('matches a value and never a field name', async () => {
    // EVERY `problem` HAS A `symptom` FIELD. If the raw JSON were searched, this query would return
    // every problem in the corpus, and the commonest searches — the names of the fields this
    // product publishes — would all be useless.
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'problem',
      title: 'A defect whose text never uses the word',
      data: { state: 'open', symptom: 'The arm keeps moving.' },
      actor: AGENT,
    })
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'problem',
      title: 'A defect that really discusses one',
      data: { state: 'open', symptom: 'The symptom is intermittent.' },
      actor: AGENT,
    })

    const body = await search('q=symptom')
    expect(titlesOf(body)).toEqual(['A defect that really discusses one'])
  })

  it('does not match a number, because "18" in a search box means eighteen to nobody', () => {
    const values = textValuesIn({ hours: 18, text: 'eighteen hours', done: true, note: null })
    expect(values.map((v) => v.where)).toEqual(['data.text'])
  })

  it('reads a checklist line, and names the line it read', async () => {
    const module = t.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title: 'A module whose checklist mentions it',
      data: {
        context: 'Nothing here says the word.',
        parts: [{ id: 'mount', name: 'Mount', items: [{ id: 'm1', text: 'Re-cut the bracket', state: 'todo' }] }],
      },
      actor: AGENT,
    })
    expect(module.id).toBeTruthy()

    const body = await search('q=bracket')
    const hits = (body['results'] as { hits: { where: string }[] }[])[0]?.hits ?? []
    // The path a caller can take back to the record and check, in the API's own vocabulary.
    expect(hits[0]?.where).toBe('data.parts[0].items[0].text')
  })
})

describe('both scripts, by being a substring match and not a word one', () => {
  beforeEach(() => {
    t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: '夹具重印与复测', data: { blockIds: [] }, actor: AGENT })
    t.api.createRecord({ workspaceId: 'default', kind: 'task', title: 'Re-print the clamp jaw tip', data: { state: 'todo' }, actor: AGENT })
  })

  it('finds a Chinese word inside a longer Chinese title', async () => {
    // 夹具 is "clamp" and 夹具重印与复测 is "clamp reprint and retest". There is no space between
    // them and no word boundary to tokenise on, so a substring match is not a shortcut here — it is
    // how you look for a word in this script.
    const body = await search(`q=${encodeURIComponent('夹具')}`)
    expect(titlesOf(body)).toEqual(['夹具重印与复测'])
  })

  it('finds an English word from a prefix, folding case', async () => {
    expect(titlesOf(await search('q=CLAM'))).toEqual(['Re-print the clamp jaw tip'])
    expect(titlesOf(await search('q=clamp'))).toEqual(['Re-print the clamp jaw tip'])
  })

  it('does not stem, expand or otherwise guess at what the word means', async () => {
    // `clamps` is not `clamp` and `印刷` is not `重印`. A search that quietly widened either
    // would be making a claim about the language that nothing here is entitled to make.
    expect(titlesOf(await search('q=clamps'))).toEqual([])
    expect(titlesOf(await search(`q=${encodeURIComponent('印刷')}`))).toEqual([])
  })
})

describe('the order is where the match is, and nothing cleverer', () => {
  it('puts a title match before a summary match before a body match', async () => {
    t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'In the body', data: { body: 'a beacon here' }, actor: AGENT })
    t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'In the summary', summary: 'a beacon here', data: {}, actor: AGENT })
    t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A beacon in the title', data: {}, actor: AGENT })

    expect(titlesOf(await search('q=beacon'))).toEqual(['A beacon in the title', 'In the summary', 'In the body'])
  })

  it('reports every place one record matched, best field first', async () => {
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'A beacon',
      summary: 'about the beacon',
      data: { body: 'the beacon again' },
      actor: AGENT,
    })
    const hits = (await search('q=beacon'))['results'] as { hits: { where: string }[] }[]
    expect(hits[0]?.hits.map((h) => h.where)).toEqual(['title', 'summary', 'data.body'])
  })
})

describe('a search is of one project, and says which', () => {
  it('does not reach a record in another project', async () => {
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'robotics', title: 'Robotics', note: 'the other project' })
    t.api.createRecord({ workspaceId: 'robotics', kind: 'note', title: 'A beacon in robotics', data: {}, actor: AGENT })
    t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A beacon in default', data: {}, actor: AGENT })

    expect(titlesOf(await search('q=beacon'))).toEqual(['A beacon in default'])
    expect(titlesOf(await search('q=beacon', { 'x-mole-office-workspace': 'robotics' }))).toEqual(['A beacon in robotics'])
    // Always stated, because a result list is meaningless without knowing what was searched.
    expect((await search('q=beacon'))['workspace']).toBe('default')
  })

  it('refuses an unknown project rather than searching a different one', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=x', headers: { 'x-mole-office-workspace': 'nope' } })
    expect(res.statusCode).toBe(404)
  })
})

describe('the three answers that are not results', () => {
  it('tells "nothing matched" from "there was nothing to match against"', async () => {
    // THE DISTINCTION RULE 5 IS ABOUT. A reader who cannot tell these apart goes looking for a
    // record that was never there, or stops looking for one that is.
    const empty = await search('q=beacon')
    expect(empty['counts']).toMatchObject({ matched: 0, searched: 0 })
    expect(String(empty['note'])).toContain('no records')
    expect(String(empty['note'])).toContain('not the same')

    t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Something else', data: {}, actor: AGENT })
    const nothing = await search('q=beacon')
    expect(nothing['counts']).toMatchObject({ matched: 0, searched: 1 })
    expect(String(nothing['note'])).toContain('Nothing in this project')
  })

  it('refuses an empty or blank query rather than answering with everything', async () => {
    expect(await refused('q=')).toContain('did not say what to look for')
    expect(await refused(`q=${encodeURIComponent('   ')}`)).toContain('did not say what to look for')
    // And it names the request that DOES list everything, so the refusal is a route rather than a no.
    expect(await refused('q=')).toContain('GET /api/records')
  })

  it('refuses a parameter it does not know, rather than ignoring it', async () => {
    expect(await refused('q=x&fuzzy=true')).toContain('fuzzy')
  })
})

describe('what it does not claim to be', () => {
  it('counts every match even when it returns fewer', async () => {
    const ids: string[] = []
    for (let i = 0; i < 12; i++) {
      ids.push(t.api.createRecord({ workspaceId: 'default', kind: 'note', title: `beacon ${i}`, data: {}, actor: AGENT }).id)
    }
    const body = await search('q=beacon&limit=5')
    expect(body['counts']).toMatchObject({ matched: 12, returned: 5 })
    expect(body['truncated']).toBe(true)
    const returned = (body['results'] as { record: { id: string } }[]).map((hit) => hit.record.id)
    expect(body['subtraction']).toEqual({ candidates: 12, carried: 5, leftOut: 7, shortened: 0 })
    expect(body['leftOutGroups']).toEqual([{
      cause: 'budget', bucket: 'row_limit', count: 7,
      ids: expect.arrayContaining(ids.filter((id) => !returned.includes(id))),
    }])
    expect((body['leftOutGroups'] as { ids: string[] }[])[0]!.ids).toHaveLength(7)
    // The count in the sentence is the true one, not the returned one.
    expect(String(body['note'])).toContain('12 of 12')
    expect(String(body['note'])).toContain('Matching records left out beyond this reply’s row limit: 7.')
  })


  it('is pure over the records it is given, so the rule can be checked without a server', () => {
    const record = (over: Partial<PanelRecord>): PanelRecord =>
      ({
        id: 'r1',
        kind: 'note',
        workspaceId: 'default',
        ownerId: THE_TEST_OFFICES_OWNER.id,
        title: 'a title',
        summary: null,
        data: {},
        createdAt: '2026-08-01 09:00:00',
        updatedAt: '2026-08-01 09:00:00',
        deletedAt: null,
        ...over,
      }) as PanelRecord
    const found = searchRecords([record({ title: 'holds a beacon' }), record({ id: 'r2', title: 'does not' })], 'beacon')
    expect(found.map((f) => f.record.id)).toEqual(['r1'])
  })
})
