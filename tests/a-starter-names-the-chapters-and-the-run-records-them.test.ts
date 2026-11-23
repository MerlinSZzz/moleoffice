// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STARTER NAMES THE CHAPTERS, AND THE RUN RECORDS WHICH WERE NAMED.
 *
 * Criteria C14, C15 and C16 of design/rules/ACCEPTANCE.md: an agent that starts another can tell it,
 * at the start, which parts of the rules it needs to know.
 *
 * C14: *A starter's brief names chapters, and the run records which were named.* Measured: read the
 * run back and the chapters line is there.
 *
 * C15: *A brief that names no chapter is recorded as having named the default six, and the emptiness
 * is visible.* Measured: the run says "no chapters named; the worker default applies", not nothing.
 *
 * C16: *A subagent's report says which chapters it read.* Measured: the report carries the list, and
 * a report without one is incomplete rather than accepted.
 *
 * WHAT IS NOT PROVED HERE. Whether the release happens is C17 and C18, and the inspector is C19 to
 * C26; both are their own files. This one is about the line being written, read back, and told apart
 * from its own absence.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { readFileSync } from 'node:fs'
import type { RolesDeclaration } from '../src/shared/roles.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { LADDER, WHAT_A_CARD_MEANS, noChaptersNamed, readAChaptersLine } from '../src/shared/chapters.ts'

let t: TestDb
let app: FastifyInstance

const DECLARED = JSON.parse(readFileSync(new URL('../src/config/roles.json', import.meta.url), 'utf8')) as RolesDeclaration
const SHARED_CHAPTERS = (JSON.parse(readFileSync(new URL('../src/config/rules/default-regulations.json', import.meta.url), 'utf8')) as { chapters: { n: number; forRole?: string }[] }).chapters.filter((one) => one.forRole === undefined).map((one) => one.n).sort((a, b) => a - b)
const theDeclaredReading = (role: string) => DECLARED.cards.find((card) => card.name === role)!.mustRead.chapters
  .map((one) => ({ chapter: one.chapter, level: WHAT_A_CARD_MEANS[one.level] }))
  .sort((a, b) => a.chapter - b.chapter)

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

async function register(
  headers: Record<string, string>,
  payload: Record<string, unknown>,
): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** One run of one agent, filed the way a started agent files its own. */
async function fileARun(handle: string, title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: { kind: 'session', title, data: { state: 'running', servingAgent: handle } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

/** What GET /api/checks/<run> says about the chapters of the agent this run serves. */
async function chaptersOfRun(run: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a registration's chapters line is read against the
  // office's own chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
  const secretary = await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  expect(secretary.status, JSON.stringify(secretary.said)).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})


describe('C14 — a starter names chapters and they are recorded', () => {
  it('stores a chapters line sent as numbers with levels, and reads it back on the run', async () => {
    const made = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      handle: 'builder-one',
      name: 'Builder One',
      role: 'worker',
      chapters: ['5:full', '9'],
    })
    expect(made.status, JSON.stringify(made.said)).toBe(201)
    const run = await fileARun('builder-one', 'Builder One, first run')
    const read = await chaptersOfRun(run)
    const chapters = read['chapters'] as Record<string, unknown>
    expect(chapters['named']).toEqual([
      { chapter: 5, level: 'full' },
      { chapter: 9, level: 'digest' },
    ])
    expect(chapters['mustRead']).toEqual(chapters['named'])
    expect(chapters['from']).toBe('the brief')
    expect(chapters['says']).toBeNull()
  })

  it('takes a chapter by its name as well as by its number, because a brief is written in words', async () => {
    // CHAPTER 6 IS NAMED BY THE NAME THIS OFFICE GIVES IT, in lower case as a brief would write it. The default set
    // renamed it from "The drawing and screens" to "Screens" in wave 13w round 5, so a fixed word would name nothing.
    const read = await app.inject({ method: 'GET', url: '/api/office-regulations', headers: AS_THE_PERSON })
    expect(read.statusCode, read.body).toBe(200)
    const six = (read.json() as { chapters: { n: number; label: string }[] }).chapters.find((one) => one.n === 6)
    expect(six?.label, 'this office holds no chapter 6 with a name').toBeTruthy()
    const made = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      handle: 'builder-named',
      name: 'Builder Named',
      role: 'worker',
      chapters: ['Tests and gates:full', six!.label.toLowerCase()],
    })
    expect(made.status, JSON.stringify(made.said)).toBe(201)
    const chapters = (made.said['chapters'] ?? {}) as Record<string, unknown>
    expect(chapters['named']).toEqual([
      { chapter: 5, level: 'full' },
      { chapter: 6, level: 'digest' },
    ])
  })

  it('refuses a word that names no chapter, with the word in the refusal, and writes nothing', async () => {
    const no = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      handle: 'builder-wrong-chapter',
      name: 'Builder Wrong Chapter',
      role: 'worker',
      chapters: ['5', 'The chapter about lunch'],
    })
    expect(no.status).toBe(400)
    const said = String(no.said['error'] ?? '')
    expect(said).toContain('The chapter about lunch')
    expect(said).toContain('Nothing was written.')
    const gone = await app.inject({
      method: 'GET',
      url: '/api/participants',
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    })
    const agents = (gone.json() as { agents: Record<string, unknown>[] }).agents
    expect(agents.find((one) => one['handle'] === 'builder-wrong-chapter')).toBeUndefined()
  })

  it('refuses a level the reading ladder has no rung for, and names it', async () => {
    const no = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      handle: 'builder-wrong-level',
      name: 'Builder Wrong Level',
      role: 'worker',
      chapters: ['5:deeply'],
    })
    expect(no.status).toBe(400)
    expect(String(no.said['error'] ?? '')).toContain('deeply')
  })
})

describe('C15 — a brief that names no chapter has named the default set, and it says so', () => {
  it('says "no chapters named; the worker default applies" rather than nothing', async () => {
    const made = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      handle: 'builder-silent',
      name: 'Builder Silent',
      role: 'worker',
    })
    expect(made.status, JSON.stringify(made.said)).toBe(201)
    const run = await fileARun('builder-silent', 'Builder Silent, first run')
    const read = await chaptersOfRun(run)
    const chapters = read['chapters'] as Record<string, unknown>
    expect(chapters['named']).toBeNull()
    expect(chapters['says']).toBe(noChaptersNamed('worker'))
    expect(chapters['says']).toBe('no chapters named; the worker default applies')
    expect(read['chaptersSays']).toBe('no chapters named; the worker default applies')
  })

  it('applies the chapters the worker card names, read off the card and not typed anywhere', async () => {
    const run = await fileARun('builder-silent', 'Builder Silent, second run')
    const chapters = (await chaptersOfRun(run))['chapters'] as Record<string, unknown>
    expect(chapters['from']).toBe('the role card')
    const applies = chapters['mustRead'] as { chapter: number; level: string }[]
    expect(applies).toEqual(theDeclaredReading('worker'))
    // The card says `full` for a worker, and `full` is a rung of this ladder under its own name.
    expect(new Set(applies.map((one) => one.level))).toEqual(new Set(['full']))
  })

  it('gives a supervisor the supervisor default, so the default follows the declared card', async () => {
    const made = await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      handle: 'sup-silent',
      name: 'Supervisor Silent',
      role: 'supervisor',
    })
    expect(made.status, JSON.stringify(made.said)).toBe(201)
    const chapters = (made.said['chapters'] ?? {}) as Record<string, unknown>
    expect(chapters['says']).toBe('no chapters named; the supervisor default applies')
    const applies = chapters['mustRead'] as { chapter: number; level: string }[]
    expect(applies).toEqual(theDeclaredReading('supervisor'))
    // A ruling, and the secretary's agreed reading of it: a
    // supervisor reads every chapter's conclusion first, and the full rule text only for a
    // chapter a piece of work actually touches, named in that work's own brief — not five
    // whole chapters read before the work is even known. The card declares which
    // chapters are read at `conclusion` (rung `gist`) and which are read at `full`.
    const shared = applies.filter((one) => SHARED_CHAPTERS.includes(one.chapter))
    expect(shared.map((one) => one.chapter)).toEqual(SHARED_CHAPTERS)
    expect(new Set(shared.map((one) => one.level))).toEqual(new Set(['gist']))
    expect(shared.filter((one) => one.level === 'full')).toHaveLength(0)
  })
})

describe('C16 — a report says which chapters it read', () => {
  it('carries the list, and the check sets it against what the brief named', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('builder-one'),
      payload: {
        kind: 'report',
        title: 'Builder One, what it did',
        summary: 'It built the thing.',
        data: {
          blocks: [{ id: 'b-1', type: 'text', heading: 'What was done', text: 'The thing was built.' }],
          for: `${THE_TEST_OFFICES_SECRETARY.name}, which started it`,
          date: '2026-09-07',
          chaptersRead: [5],
        },
      },
    })
    expect(reply.statusCode, reply.body).toBe(201)
    const run = await fileARun('builder-one', 'Builder One, reporting run')
    const read = await chaptersOfRun(run)
    const reports = read['reports'] as Record<string, unknown>[]
    const mine = reports.find((one) => one['title'] === 'Builder One, what it did')
    expect(mine, JSON.stringify(reports)).toBeDefined()
    expect(mine!['chaptersRead']).toEqual([5])
    // The brief named 5 and 9; the report says 5. The sentence leads with what was not read.
    expect(String(mine!['says'])).toContain('Not read: 9')
  })

  it('reads a report with no list as one nobody can check, never as one that read none', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('builder-silent'),
      payload: {
        kind: 'report',
        title: 'Builder Silent, what it did',
        summary: 'It built the other thing.',
        data: {
          blocks: [{ id: 'b-1', type: 'text', heading: 'What was done', text: 'The other thing was built.' }],
          for: `${THE_TEST_OFFICES_SECRETARY.name}, which started it`,
          date: '2026-09-07',
        },
      },
    })
    expect(reply.statusCode, reply.body).toBe(201)
    const run = await fileARun('builder-silent', 'Builder Silent, reporting run')
    const reports = (await chaptersOfRun(run))['reports'] as Record<string, unknown>[]
    const mine = reports.find((one) => one['title'] === 'Builder Silent, what it did')
    expect(mine!['chaptersRead']).toBeNull()
    expect(String(mine!['says'])).toContain('nobody can check')
    expect(String(mine!['says'])).not.toContain('read none of them')
  })
})

describe('a chapters line is loose to write and strict to store', () => {
  it('keeps the longer of two readings when one chapter is named twice', () => {
    const read = readAChaptersLine(['5', '5:full'], [{ n: 5, label: 'Tests and gates' }])
    expect(read.named).toEqual([{ chapter: 5, level: 'full' }])
    expect(read.problems).toEqual([])
  })

  it('reads a card word as the rung it names, so the two vocabularies are joined in one place', () => {
    const read = readAChaptersLine(['5:conclusion'], [{ n: 5, label: 'Tests and gates' }])
    expect(read.named).toEqual([{ chapter: 5, level: 'gist' }])
  })

  // ONE WORD READS THE SAME IN EITHER SHAPE (acceptance finding 66; message bbD9i0YMwvMN: invariant 9, one reading
  // of one fact). Until 24 September 2026 "5:conclusion" was read as gist while {chapter: 5, level: "conclusion"} was
  // refused, so a checker's line was read or refused by its punctuation. Every rung, every word a role card uses, a
  // rung with spaces round it, the blank word, and two words that are no level, each sent both ways.
  // MUTATION PROOF, 24 September 2026, alone in src/shared/chapters.ts: the {chapter, level} shape taking a rung only
  // again, and this goes red on "conclusion".
  it('reads one level word the same whether it comes as text or as {chapter, level}', () => {
    const chapters = [{ n: 5, label: 'Tests and gates' }]
    for (const word of [...LADDER, ...Object.keys(WHAT_A_CARD_MEANS), ' full ', '', 'Full', 'rules']) {
      const asText = readAChaptersLine([`5:${word}`], chapters)
      const asObject = readAChaptersLine([{ chapter: 5, level: word }], chapters)
      expect(asObject.named, `the word "${word}"`).toEqual(asText.named)
      expect(asObject.problems.length, `the word "${word}"`).toBe(asText.problems.length)
    }
    expect(readAChaptersLine([{ chapter: 5, level: 'conclusion' }], chapters).named).toEqual([{ chapter: 5, level: 'gist' }])
    expect(readAChaptersLine([{ chapter: 5, level: 'label-and-title' }], chapters).named).toEqual([{ chapter: 5, level: 'title' }])
    expect(readAChaptersLine([{ chapter: 5, level: 'rules' }], chapters).problems[0]?.because).toContain('"rules" is not a position on the reading ladder')
  })

  it('reports every bad word rather than stopping at the first', () => {
    const read = readAChaptersLine(['99', 'nonsense', '5'], [{ n: 5, label: 'Tests and gates' }])
    expect(read.named).toEqual([{ chapter: 5, level: 'digest' }])
    expect(read.problems).toHaveLength(2)
  })

  // A CHAPTER SENT AS A JSON NUMBER IS THE CHAPTER OF THAT NUMBER (invariant 8: loose input). Until 22 November 2026
  // a bare 5 was refused as no chapter number at all, while "5" was read as chapter 5.
  const chapters = [{ n: 1, label: 'The live server and database' }, { n: 5, label: 'Tests and gates' }]

  it('3: reads a whole number as the chapter of that number, at the level its text would get', () => {
    const asNumbers = readAChaptersLine([1, 5], chapters)
    expect(asNumbers.named).toEqual(readAChaptersLine(['1', '5'], chapters).named)
    expect(asNumbers.problems).toEqual([])
  })

  it('4: refuses a number with no chapter as its text is refused, and a number that is not whole as not whole', () => {
    expect(readAChaptersLine([99], chapters).problems).toEqual(readAChaptersLine(['99'], chapters).problems)
    const notWhole = readAChaptersLine([1.5], chapters)
    expect(notWhole.named).toEqual([])
    expect(notWhole.problems.map((one) => one.because)).toEqual(readAChaptersLine([{ chapter: 1.5 }], chapters).problems.map((one) => one.because))
    expect(notWhole.problems.map((one) => one.because)).not.toEqual(readAChaptersLine([true], chapters).problems.map((one) => one.because))
  })
})
