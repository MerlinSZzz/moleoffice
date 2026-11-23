// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEARCH FINDS EACH MATCH BY ITS BEST FIELD ALONE, AND MAKES WHOLE ONLY THE RESULTS IT SENDS. EACH ANSWERS AS IT DID.
 *
 * Wave 13y round 167, the search part of the package on requests that hold the server. MEASURED FIRST, 15 November
 * 2026, on the made-up office of the live shape (202,207 records, 172,751 of them in the default project): a search for
 * a word 170,067 records say built a snippet and a path for every one of them, and sent five. `searchRecords` over the
 * project took 1.0 to 2.4 s of it, against 0.16 to 0.21 s to tell only whether each record says it.
 *
 * WHAT IS HELD HERE:
 *   1. `theBestFieldThatSays` gives the `rank` `searchRecord` gives, and null where it gives null, for made-up records
 *      and searches in several scripts.
 *   2. `theRecordsThatSay` gives the records `searchRecords` gives, each with the same rank, in the same order. Records
 *      written in the same second are among them, and stay in the order they were given in.
 *   3. GET /api/search answers the person with the results, the count and the ids left out that the door gave before
 *      this round. They are worked out here as the door worked them out then: every record of the project, each with its
 *      count of what is incomplete, through `searchRecords`, the first `limit` sent and the rest named by id. Since
 *      20 November 2026 a search gives each result at a level, by the person's decision of that day, so each record
 *      carries `atLevel` and past the answer's cap is titles only; what the door gave before is compared without it.
 *
 * Parts 1 and 2 need no database. Part 3 is a fresh test database with made-up notes written through the records' own
 * write, so the index of the records' text holds them. Every row is made up.
 */
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { searchRecord, searchRecords, theBestFieldThatSays, theRecordsThatSay } from '../src/shared/search.ts'
import type { PanelRecord } from '../src/shared/types.ts'

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
const PIECES = ['quillwort', 'Quillwort', 'QUILLWORT', '夹具标定', '夹具', 'ქართული', 'ᲥᲐᲠᲗᲣᲚᲘ', 'Kelvin', 'kelvin', 'İstanbul', 'istanbul', 'straße', 'STRASSE', '   ', '', 'pond', 'a pond by the bench', '18']
const QUERIES = [...PIECES, 'symptom', ' pond ', 'note 1', 'made-up', 'zzqqxxnothing']

// THREE SECONDS FOR 400 RECORDS, so most matches share a field and a second with others, and the order among those is
// the order they were given in.
const THE_SECONDS = ['2026-11-15 09:00:00', '2026-11-15 09:00:01', '2026-11-15 09:00:02']

/** 400 made-up records, the same ones each time: titles, summaries and bodies drawn from the pieces above. */
function theMadeUpRecords(): PanelRecord[] {
  const next = aSequence(167)
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
  return Array.from({ length: 400 }, (_, i) => {
    const at = THE_SECONDS[Math.floor(next() * THE_SECONDS.length)]!
    return {
      id: `made-up-${String(i)}`,
      kind: 'note',
      workspaceId: 'default',
      ownerId: 'owner',
      title: next() < 0.2 ? pick() : `A made-up note ${String(i)}`,
      summary: next() < 0.5 ? null : pick(),
      data: aValue(0) as Record<string, unknown>,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    } as PanelRecord
  })
}

describe('1 and 2. each match by its best field alone', () => {
  it('1. theBestFieldThatSays gives the rank searchRecord gives, and null where it gives null', () => {
    const records = theMadeUpRecords()
    const ranks = new Map<number | null, number>()
    for (const record of records) {
      for (const q of QUERIES) {
        const expected = searchRecord(record, q)?.rank ?? null
        expect(theBestFieldThatSays(record, q), `${JSON.stringify(record)} for "${q}"`).toBe(expected)
        ranks.set(expected, (ranks.get(expected) ?? 0) + 1)
      }
    }
    // EVERY ANSWER IS THERE IN NUMBER, so the agreement is not only on records that say nothing, or only in titles.
    for (const rank of [null, 0, 1, 2]) expect(ranks.get(rank) ?? 0, `the pairs answered ${String(rank)}`).toBeGreaterThan(100)
  })

  it('2. theRecordsThatSay gives the records searchRecords gives, each with its rank, in the same order', () => {
    const records = theMadeUpRecords()
    let sameFieldAndSecond = 0
    for (const q of QUERIES) {
      const expected = searchRecords(records, q).map((hit) => ({ id: hit.record.id, rank: hit.rank }))
      const found = theRecordsThatSay(records, q)
      expect(found.map((match) => ({ id: match.record.id, rank: match.rank })), `the matches for "${q}"`).toEqual(expected)
      // Each match is the record it was given, not a copy of it.
      for (const match of found) expect(records).toContain(match.record)
      for (let i = 1; i < found.length; i += 1) {
        if (found[i]!.rank === found[i - 1]!.rank && found[i]!.record.createdAt === found[i - 1]!.record.createdAt) sameFieldAndSecond += 1
      }
    }
    // MATCHES THAT ONLY THE ORDER THEY WERE GIVEN IN TELLS APART, next to each other, in number.
    expect(sameFieldAndSecond, 'the neighbours with the same field and the same second').toBeGreaterThan(500)
  })
})

describe('3. GET /api/search', () => {
  let t: TestDb
  let app: FastifyInstance
  const THE_PERSONS_HEADERS = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  const WORDS = ['quillwort', 'Quillwort', '夹具标定', 'pond', 'a pond by the bench', 'İstanbul', 'straße', 'Kelvin']

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-15T09:00:00') })
    t = await freshDb()
    const { searchRoutes } = await import('../src/server/api/search.ts')
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    app = Fastify()
    installErrorHandling(app)
    await app.register(searchRoutes, { prefix: '/api' })
    await app.ready()
    // SIXTY NOTES IN FOUR SECONDS, fifteen in each, with the words in the title, the summary, the body, several of them
    // or none.
    const next = aSequence(1671)
    const pick = (): string => WORDS[Math.floor(next() * WORDS.length)]!
    for (let i = 0; i < 60; i += 1) {
      if (i % 15 === 0) vi.setSystemTime(new Date(`2026-11-15T09:00:0${String(i / 15)}`))
      const summary = next() < 0.5 ? null : `A made-up summary with ${pick()}`
      t.api.createRecord({
        workspaceId: 'default',
        kind: 'note',
        title: next() < 0.4 ? `A made-up note on ${pick()}` : `A made-up note ${String(i)}`,
        ...(summary === null ? {} : { summary }),
        data: next() < 0.3 ? {} : { body: `A made-up body: ${pick()}, and then ${pick()}.` },
        actor: AGENT,
      })
    }
  }, 300_000)

  afterAll(async () => {
    await app.close()
    vi.useRealTimers()
    t.close()
  })

  it('answers the results, the count and the ids left out that the door gave before', async () => {
    const { incompletenessOf, listRecords } = await import('../src/server/lib/records.ts')
    const listed = listRecords({ workspaceId: 'default' })
    // THE PROJECT HOLDS ONLY THE NOTES MADE HERE, so the rule below is the whole of what the door did before for the
    // person: no message hidden, no run's honour reading, no decision a later one replaced.
    expect(listed.map((record) => `${record.kind} ${record.title.startsWith('A made-up note')}`)).toEqual(listed.map(() => 'note true'))
    expect(listed).toHaveLength(60)
    const records = listed.map((record) => ({ ...record, incompleteCount: incompletenessOf(record).length }))
    let leftOut = 0
    let givenWhole = 0
    for (const q of [...WORDS, 'made-up', 'A made-up note', 'zzqqxxnothing']) {
      for (const limit of [5, 500]) {
        const every = searchRecords(records, q)
        const reply = await app.inject({ method: 'GET', url: `/api/search?q=${encodeURIComponent(q)}&limit=${String(limit)}`, headers: THE_PERSONS_HEADERS })
        expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
        const body = reply.json() as {
          results: { record: Record<string, unknown> & { id: string; atLevel: { given: string | null; because: string } } }[]
          counts: { matched: number; returned: number }
          leftOutGroups: { ids: string[] }[]
        }
        // SINCE 20 NOVEMBER 2026 A SEARCH GIVES EACH RESULT AT A LEVEL, by the person's decision of that day, so each
        // record carries `atLevel` and past the answer's cap is titles only. What the door gave before is compared
        // without it.
        expect(body.results, `the results for "${q}", limit ${String(limit)}`).toHaveLength(every.slice(0, limit).length)
        for (const [i, result] of body.results.entries()) {
          const before = every[i]!
          const { record, ...theRest } = result
          const { atLevel, ...recordWithoutItsLevel } = record
          const { record: oldRecord, ...oldRest } = before
          expect(theRest, `the results for "${q}", limit ${String(limit)}`).toEqual(oldRest)
          expect(record.id, `the results for "${q}", limit ${String(limit)}`).toEqual(oldRecord.id)
          if (atLevel.given === 'full') {
            expect(recordWithoutItsLevel, `the results for "${q}", limit ${String(limit)}`).toEqual(oldRecord)
            givenWhole += 1
          } else {
            expect(atLevel.because, `the results for "${q}", limit ${String(limit)}`).toBe('pastTheCap')
          }
        }
        expect(body.counts, `the counts for "${q}", limit ${String(limit)}`).toMatchObject({ matched: every.length, returned: Math.min(limit, every.length) })
        expect(body.leftOutGroups.map((group) => group.ids), `the ids left out for "${q}", limit ${String(limit)}`).toEqual([every.slice(limit).map((hit) => hit.record.id)])
        leftOut += every.slice(limit).length
      }
    }
    // Some searches left records out, so the ids left out were compared, and not only empty lists.
    expect(leftOut, 'the matches left out over every search').toBeGreaterThan(50)
    // The records given whole were compared, and not only their ids.
    expect(givenWhole, 'the records given whole over every search').toBeGreaterThan(0)
  })
})
