// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEARCH AND A LIST OF RECORDS BY KIND ANSWER EACH RESULT AT A LEVEL, NOT AS A WHOLE RECORD.
 *
 * The person's decision of 20 November 2026: one option, the level each result is given at (1 the label, 2 the title,
 * 3 the conclusion, which is the record's summary, 4 to 6 by part, then full). Each kind has its own default level, a
 * setting. A record whose whole content is shorter than the short limit, a setting, comes back whole whatever its
 * kind. A level nobody wrote falls back to the next shorter level that exists and the answer says so in words, and the
 * full text is never cut to fill a level. Each answer has a cap on its total size, a setting, and the results past it
 * come back as titles only. A reader reads one record further at a level it names.
 *
 * WHAT IS HELD HERE, on a made-up office of the live size (tests/an-office-the-size-of-the-real-one.ts, 14,000
 * records) with sixty made-up long reports, one made-up module and one made-up short decision added:
 *   1. A search over reports, at the reports' default level, stays under the cap, and the results past it are titles
 *      only. The characters the answer counts are the characters of the words it gives.
 *   2. A short decision comes back whole, even when a shorter level is asked.
 *   3. A level nobody wrote falls back to the next shorter one, says so in words, and cuts nothing.
 *   4. Both doors take the level option.
 *   5. One record is read at a named level.
 *   6. A level beside a shape is refused, and so is a level that does not exist, with nothing answered.
 *
 * Every record added here is made up, says so in its title, and carries the fixture mark.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { anOfficeTheSizeOfTheirs } from './an-office-the-size-of-the-real-one.ts'
import { apiApp } from './helpers.ts'

const THE_WORD = 'quillmoss'
const REPORTS = 60
const SHORT_UNDER = 300
const CAP = 6_000

const AS_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const PERSON = { type: 'human', id: THE_PERSON } as const

interface AtLevel {
  asked: string
  askedBy: 'the-request' | 'the-kinds-default'
  given: string | null
  because: 'asked' | 'short' | 'fellBack' | 'pastTheCap'
  missing: { level: string; why: string }[]
  says: string | null
  characters: number
}
interface Row {
  id: string
  kind: string
  title?: string
  label?: string
  summary?: string | null
  data?: Record<string, unknown>
  atLevel: AtLevel
}
interface Levels {
  asked: string | null
  shortUnder: number
  cap: number
  characters: number
  pastTheCap: number
  says: string
  readOne: string
}
interface SearchAnswer {
  results: { record: Row; hits: unknown[]; rank: number }[]
  levels: Levels
}
interface ListAnswer {
  records: Row[]
  returned: number
  levels: Levels
}

let server: Awaited<ReturnType<typeof apiApp>>
let remove = (): void => undefined
let theLongReport = ''
let theShortDecision = ''
let theModule = ''
const BODY = Array.from({ length: 30 }, (_, i) => `Made-up sentence ${String(i + 1)} about the ${THE_WORD} bed, written for a test.`).join(' ')
const SUMMARY = `A made-up report about the ${THE_WORD} bed, written for a test of levels, with one line of conclusion that says nothing real about any bed.`

async function get<T>(url: string, status = 200): Promise<T> {
  const reply = await server.app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 800)).toBe(status)
  return reply.json() as T
}

/** The characters of the words a row gives, counted from the row itself and not from the answer's own count. */
function wordsGiven(row: Row): number {
  return (row.label?.length ?? 0) + (row.title?.length ?? 0) + (typeof row.summary === 'string' ? row.summary.length : 0)
}

beforeAll(async () => {
  const office = await anOfficeTheSizeOfTheirs()
  remove = office.remove
  vi.resetModules()
  process.env['MOLE_OFFICE_DB'] = office.file
  server = await apiApp()
  const R = await import('../src/server/lib/records.ts')
  for (let i = 0; i < REPORTS; i += 1) {
    const made = R.createRecord({
      kind: 'report', workspaceId: 'default', origin: 'fixture', actor: PERSON,
      title: `Made-up report ${String(i + 1)} about ${THE_WORD}`,
      summary: SUMMARY,
      data: { for: 'the owner', date: '2026-11-20', blocks: [{ id: 'b-1', type: 'text', text: BODY }] },
    })
    if (i === 0) theLongReport = made.id
  }
  theModule = R.createRecord({
    kind: 'module', workspaceId: 'default', origin: 'fixture', actor: PERSON,
    title: `A made-up module about ${THE_WORD}`,
    summary: SUMMARY,
    data: { summaryBlocks: [{ id: 'b-1', type: 'text', text: BODY }] },
  }).id
  theShortDecision = R.createRecord({
    kind: 'decision', workspaceId: 'default', origin: 'fixture', actor: PERSON,
    title: `Made-up: ${THE_WORD} stays`,
    summary: 'A made-up short decision.',
    data: { because: 'Made up for a test.' },
  }).id
}, 900_000)

afterAll(async () => {
  await server?.app.close()
  remove()
})

describe('a search and a list of records by kind answer each result at a level', () => {
  it('1. a search over reports stays under the cap, and the results past it are titles only', async () => {
    const answer = await get<SearchAnswer>(`/api/search?q=${THE_WORD}&kind=report&limit=${String(REPORTS)}`)
    expect(answer.results).toHaveLength(REPORTS)
    expect(answer.levels.cap).toBe(CAP)
    expect(answer.levels.asked, 'no level was asked, so each kind answers at its own default').toBeNull()
    // THE ANSWER'S COUNT IS THE COUNT OF THE WORDS IT GIVES, and it stays under the cap.
    const counted = answer.results.reduce((sum, one) => sum + wordsGiven(one.record), 0)
    expect(answer.levels.characters).toBe(counted)
    expect(counted).toBeLessThanOrEqual(CAP)
    // A REPORT'S DEFAULT IS THE CONCLUSION, and the first results are given at it.
    const first = answer.results[0]!.record
    expect(first.atLevel).toMatchObject({ asked: '3', askedBy: 'the-kinds-default', given: '3', because: 'asked' })
    expect(first.summary).toBe(SUMMARY)
    expect(first.data?.['blocks'], 'a report at the conclusion carries no body').toBeUndefined()
    // PAST THE CAP, EVERY RESULT IS TITLES ONLY, in the order of the results.
    const past = answer.results.findIndex((one) => one.record.atLevel.because === 'pastTheCap')
    expect(past, 'sixty long reports do not fit under the cap at the conclusion').toBeGreaterThan(0)
    const titlesOnly = answer.results.slice(past)
    expect(answer.levels.pastTheCap).toBe(titlesOnly.length)
    for (const one of titlesOnly) {
      expect(one.record.atLevel).toMatchObject({ given: '2', because: 'pastTheCap' })
      expect(one.record.title).toMatch(/^Made-up report \d+ about quillmoss$/)
      expect(one.record.summary).toBeUndefined()
      expect(one.record.data?.['blocks']).toBeUndefined()
    }
    expect(answer.levels.says).toMatch(/titles only/)
    expect(answer.levels.readOne).toContain('/api/records?ids=')
  }, 120_000)

  it('2. a short decision comes back whole, even at level 2', async () => {
    const answer = await get<SearchAnswer>(`/api/search?q=${THE_WORD}&kind=decision&level=2`)
    const found = answer.results.find((one) => one.record.id === theShortDecision)
    expect(found, 'the short decision is found').toBeDefined()
    expect(found!.record.atLevel).toMatchObject({ asked: '2', askedBy: 'the-request', given: 'full', because: 'short' })
    expect(found!.record.summary).toBe('A made-up short decision.')
    expect(found!.record.data?.['because']).toBe('Made up for a test.')
    expect(answer.levels.shortUnder).toBe(SHORT_UNDER)
    // AND A DECISION ASKED BY KIND, WITH NO LEVEL, IS AT ITS KIND'S DEFAULT, WHICH IS FULL.
    const listed = await get<ListAnswer>(`/api/records?kind=decision&ids=${theShortDecision}`)
    expect(listed.records[0]!.atLevel).toMatchObject({ asked: 'full', askedBy: 'the-kinds-default', given: 'full' })
  }, 120_000)

  it('3. a level nobody wrote falls back to the next shorter one, says so in words, and cuts nothing', async () => {
    const answer = await get<ListAnswer>(`/api/records?ids=${theLongReport}&level=4`)
    expect(answer.returned).toBe(1)
    const row = answer.records[0]!
    expect(row.atLevel).toMatchObject({ asked: '4', askedBy: 'the-request', given: '3', because: 'fellBack' })
    expect(row.atLevel.missing).toEqual([{ level: '4', why: 'notWritten' }])
    expect(row.atLevel.says).toMatch(/Level 4/)
    expect(row.atLevel.says).toMatch(/not written/)
    expect(row.atLevel.says).toMatch(/Conclusion/)
    // NOTHING WAS CUT TO FILL IT: the conclusion is the stored summary, whole, and the body is not there at all.
    expect(row.summary).toBe(SUMMARY)
    expect(row.data?.['blocks']).toBeUndefined()
    // A MODULE FALLS BACK THE SAME WAY, through the same function.
    const module = await get<ListAnswer>(`/api/records?ids=${theModule}&level=5`)
    expect(module.records[0]!.atLevel).toMatchObject({ asked: '5', given: '3', because: 'fellBack' })
  }, 120_000)

  it('4. both doors take the level option', async () => {
    const searched = await get<SearchAnswer>(`/api/search?q=${THE_WORD}&kind=report&level=2&limit=10`)
    expect(searched.levels.asked).toBe('2')
    for (const one of searched.results) {
      expect(one.record.atLevel).toMatchObject({ asked: '2', askedBy: 'the-request', given: '2' })
      expect(one.record.title).toMatch(/quillmoss/)
      expect(one.record.summary).toBeUndefined()
    }
    const listed = await get<ListAnswer>('/api/records?kind=report&level=2&limit=10')
    expect(listed.levels.asked).toBe('2')
    expect(listed.records).toHaveLength(10)
    for (const row of listed.records) {
      expect(row.atLevel.asked).toBe('2')
      expect(typeof row.title).toBe('string')
    }
  }, 120_000)

  it('5. one record is read at a named level', async () => {
    const atTheConclusion = await get<ListAnswer>(`/api/records?ids=${theLongReport}&level=3`)
    expect(atTheConclusion.records[0]!.atLevel).toMatchObject({ asked: '3', given: '3', because: 'asked' })
    expect(atTheConclusion.records[0]!.summary).toBe(SUMMARY)
    const whole = await get<ListAnswer>(`/api/records?ids=${theLongReport}&level=full`)
    expect(whole.records[0]!.atLevel).toMatchObject({ asked: 'full', given: 'full', because: 'asked' })
    expect(whole.records[0]!.data?.['blocks']).toEqual([{ id: 'b-1', type: 'text', text: BODY }])
  }, 120_000)

  it('6. a level beside a shape is refused, and so is a level that does not exist', async () => {
    await get(`/api/records?kind=report&shape=full&level=2`, 400)
    await get(`/api/records?kind=report&level=7`, 400)
    await get(`/api/search?q=${THE_WORD}&level=seven`, 400)
  }, 120_000)
})
