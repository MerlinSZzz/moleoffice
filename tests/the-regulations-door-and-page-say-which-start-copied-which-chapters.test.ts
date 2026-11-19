// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REGULATIONS DOOR SAYS WHICH START COPIED WHICH CHAPTERS.
 *
 * A start copies each default chapter whose number the office has never held (src/server/lib/default-regulations.ts).
 * So one office may hold chapters its first start copied, chapters a later start copied, and chapters no start copied.
 * The regulations door answers `copiedFromTheDefaults` with one entry for each copy: its file, its time, whether the
 * office held no chapter when it ran, and the chapters in use it holds. Beside them, `notCopied` is each chapter in use
 * that no copied record holds.
 *
 * WHAT THIS FILE HOLDS THE OFFICE TO, in the two cases of an upgrade:
 *   (a) a first start copied the chapters of the set that no role is marked for, and a later start copied the role
 *       chapters: the door names two copies, the first one made when the office held no chapter, and no chapter as
 *       not copied;
 *   (b) the person filed the chapters that no role is marked for, and a start copied the role chapters: the door names
 *       one copy, made when the office held chapters, and names the person's chapters as copied by no start.
 * In both:
 *   1. the door's field holds exactly that, with each copy's time read from the copied records' own marks;
 *   2. the door's sentence, built by `copiedFromTheDefaultsSentence`, names the time of each copy and is not one of the
 *      two sentences of a single first copy.
 * One more case holds the copy mark an older version wrote, which lacks the field that says whether the office held a
 * chapter: the door reads it as one copy, made at the office's first start, of every chapter.
 *
 * The chapters the person files here are MADE-UP: their titles say so. The default set, the copy, the record door and
 * the regulations door are real. Each database is a temporary one this file makes; nothing reaches the live office.
 *
 * EACH CASE TAKES ITS OFFICE IN A HOOK, so the cold import of the server falls inside the hook's sixty seconds and each
 * case keeps the runner's five (tests/how-long-a-test-may-take.ts).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { A_CHAPTER, type WhatTheOfficeRegulationsSay } from '../src/shared/office-rules.ts'

type TheCopy = typeof import('../src/server/lib/default-regulations.ts')

/** The default set, read from the file the copier reads (`THE_DEFAULT_REGULATIONS_FILE`) once a case has made its office. */
let DEFAULTS: { chapters: { n: number; forRole?: string; outline: { id: string }[] }[] } = { chapters: [] }
/** The numbers of the default set: of its chapters that no role is marked for, and of its role chapters. */
let EARLIER: number[] = []
let ROLE_CHAPTERS: number[] = []
/** This case's copy of the server's copier, imported cold by the hook before the case runs. */
let copy: TheCopy

let db: TestDb | null = null
let app: FastifyInstance | null = null
let scratch: string | null = null
let person: Record<string, string> = {}

afterEach(async () => {
  await app?.close()
  db?.close()
  if (scratch !== null) rmSync(scratch, { recursive: true, force: true })
  delete (globalThis as unknown as { window?: unknown }).window
  app = null
  db = null
  scratch = null
})

beforeEach(async () => {
  copy = await aFreshOffice()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

async function aFreshOffice(): Promise<TheCopy> {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() }
  // A VALUE FROM src/server IS READ AFTER freshDb: a value import at the top of the file would load the database client
  // before this case's office exists.
  const theCopy = await import('../src/server/lib/default-regulations.ts')
  DEFAULTS = JSON.parse(readFileSync(join(import.meta.dirname, '..', theCopy.THE_DEFAULT_REGULATIONS_FILE), 'utf8')) as typeof DEFAULTS
  EARLIER = DEFAULTS.chapters.filter((one) => one.forRole === undefined).map((one) => one.n)
  ROLE_CHAPTERS = DEFAULTS.chapters.filter((one) => one.forRole !== undefined).map((one) => one.n)
  return theCopy
}

/** Case (a): a first start copies a made-up default set of the chapters no role is marked for, and a later start the shipped set. */
async function caseA(copy: TheCopy): Promise<void> {
  scratch = mkdtempSync(join(tmpdir(), 'mole-earlier-default-set-'))
  const earlierSet = join(scratch, 'default-regulations.json')
  const shipped = JSON.parse(readFileSync(join(import.meta.dirname, '..', copy.THE_DEFAULT_REGULATIONS_FILE), 'utf8')) as typeof DEFAULTS
  writeFileSync(earlierSet, JSON.stringify({ ...shipped, chapters: shipped.chapters.filter((one) => EARLIER.includes(one.n)) }))
  expect(copy.copyTheDefaultRegulationsOnce(earlierSet).copied).toBe(EARLIER.length)
  expect(copy.copyTheDefaultRegulationsOnce().copied).toBe(ROLE_CHAPTERS.length)
}

/** Case (b): the person files the chapters no role is marked for through the record door, with no copy mark, then a start copies. */
async function caseB(copy: TheCopy): Promise<void> {
  for (const n of EARLIER) {
    const ids = DEFAULTS.chapters.find((one) => one.n === n)!.outline.map((rule) => rule.id)
    const made = await app!.inject({ method: 'POST', url: '/api/records', headers: person, payload: {
      kind: 'module', title: `MADE-UP chapter ${String(n)} the person filed`, summary: 'MADE-UP conclusion of a chapter the person filed.',
      data: { state: 'active', parts: [], extra: { chapter: n }, summaryBlocks: ids.map((id) => ({ id, type: 'text', heading: `A MADE-UP rule ${id}`, text: 'MADE-UP words of the person.' })) },
    } })
    expect(made.statusCode, made.body).toBe(201)
    const id = made.json().record.id as string
    const revisions = (await app!.inject({ url: `/api/records/${id}/revisions`, headers: person })).json().revisions as { seq: number; contentHash: string }[]
    const newest = revisions.reduce((a, b) => (b.seq > a.seq ? b : a))
    const labelled = await app!.inject({ method: 'POST', url: `/api/records/${id}/short-forms`, headers: person, payload: { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: `A MADE-UP chapter ${String(n)}` } } })
    expect(labelled.statusCode, labelled.body).toBe(200)
  }
  expect(copy.copyTheDefaultRegulationsOnce().copied).toBe(ROLE_CHAPTERS.length)
}

/** The time each copy wrote on the records it made, read from the records themselves: one time for these numbers. */
function theTimeCopied(numbers: readonly number[]): string {
  const types = A_CHAPTER.sqliteNumberTypes.map(() => '?').join(', ')
  const marks = numbers.map(() => '?').join(', ')
  const rows = db!.client.sqlite
    .prepare(`SELECT DISTINCT json_extract(data, '$.extra.copiedFromTheDefaults.at') AS at FROM records WHERE kind = ? AND json_type(data, ?) IN (${types}) AND json_extract(data, ?) IN (${marks})`)
    .all(A_CHAPTER.kind, A_CHAPTER.jsonPath, ...A_CHAPTER.sqliteNumberTypes, A_CHAPTER.jsonPath, ...numbers) as { at: string | null }[]
  expect(rows, `one copy time for chapters ${numbers.join(', ')}`).toHaveLength(1)
  expect(rows[0]!.at).not.toBeNull()
  return rows[0]!.at!
}

async function theDoor(): Promise<WhatTheOfficeRegulationsSay> {
  const reply = await app!.inject({ url: '/api/office-regulations', headers: person })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheOfficeRegulationsSay
}

describe('(a) a first start copied the chapters no role is marked for, and a later start the role chapters', () => {
  it('the door names both copies, each with its own time, and no chapter as not copied', async () => {
    await caseA(copy)
    const first = theTimeCopied(EARLIER), later = theTimeCopied(ROLE_CHAPTERS)
    const said = await theDoor()
    expect(said.copiedFromTheDefaults).toEqual({
      copies: [
        { file: copy.THE_DEFAULT_REGULATIONS_FILE, at: first, first: true, chapters: EARLIER },
        { file: copy.THE_DEFAULT_REGULATIONS_FILE, at: later, first: false, chapters: ROLE_CHAPTERS },
      ],
      notCopied: [],
    })
    const { copiedFromTheDefaultsSentence } = await import('../src/server/lib/office-regulations.ts')
    const sentence = copiedFromTheDefaultsSentence(said.copiedFromTheDefaults)
    expect(said.says).toContain(sentence)
    expect(sentence).toContain(first)
    expect(sentence).toContain(later)
    // NOT ONE OF THE TWO SENTENCES OF A SINGLE FIRST COPY, which said that every chapter was copied at the first start.
    const asOneFirstCopy = { file: copy.THE_DEFAULT_REGULATIONS_FILE, at: first, first: true, chapters: [...EARLIER, ...ROLE_CHAPTERS] }
    expect(sentence).not.toBe(copiedFromTheDefaultsSentence({ copies: [asOneFirstCopy], notCopied: [] }))
    expect(said.says).not.toContain(copiedFromTheDefaultsSentence({ copies: [asOneFirstCopy], notCopied: [] }))
  })

})

describe('(b) the person filed the chapters no role is marked for, and a start copied the role chapters', () => {
  it('the door names the one copy, made when the office held chapters, and the person\'s chapters as copied by no start', async () => {
    await caseB(copy)
    const later = theTimeCopied(ROLE_CHAPTERS)
    const said = await theDoor()
    expect(said.copiedFromTheDefaults).toEqual({
      copies: [{ file: copy.THE_DEFAULT_REGULATIONS_FILE, at: later, first: false, chapters: ROLE_CHAPTERS }],
      notCopied: EARLIER,
    })
    const { copiedFromTheDefaultsSentence } = await import('../src/server/lib/office-regulations.ts')
    const sentence = copiedFromTheDefaultsSentence(said.copiedFromTheDefaults)
    expect(said.says).toContain(sentence)
    expect(sentence).toContain(later)
    // NOT THE SENTENCE OF A SINGLE FIRST COPY WITH CHAPTERS ADDED LATER, which said the role chapters came at the
    // first start and the person's chapters after it.
    const asOneFirstCopy = { file: copy.THE_DEFAULT_REGULATIONS_FILE, at: later, first: true, chapters: ROLE_CHAPTERS }
    expect(sentence).not.toBe(copiedFromTheDefaultsSentence({ copies: [asOneFirstCopy], notCopied: EARLIER }))
    expect(said.says).not.toContain(copiedFromTheDefaultsSentence({ copies: [asOneFirstCopy], notCopied: EARLIER }))
  })

})

describe('an office whose chapters carry the copy mark an older version wrote', () => {
  it('the door reads the older mark as one copy at the first start, of every chapter, and says the sentence of a single first copy', async () => {
    const every = [...EARLIER, ...ROLE_CHAPTERS]
    expect(copy.copyTheDefaultRegulationsOnce().copied).toBe(every.length)
    // THE MARK AN OLDER VERSION WROTE. Before this change the copier wrote `{ file: THE_DEFAULT_REGULATIONS_FILE, at: nowStamp() }`
    // (src/server/lib/default-regulations.ts line 203 at commit c91472bfa), and its type there, at lines 97-100, holds
    // those two fields only. The copier now writes one field more, whether the office held a chapter. Taking that field
    // out of each copied record leaves the older mark exactly, and the case checks that it does.
    const types = A_CHAPTER.sqliteNumberTypes.map(() => '?').join(', ')
    db!.client.sqlite
      .prepare(`UPDATE records SET data = json_remove(data, '$.extra.copiedFromTheDefaults.officeHeldChapters') WHERE kind = ? AND json_type(data, ?) IN (${types})`)
      .run(A_CHAPTER.kind, A_CHAPTER.jsonPath, ...A_CHAPTER.sqliteNumberTypes)
    const marks = db!.client.sqlite
      .prepare(`SELECT json_extract(data, '$.extra.copiedFromTheDefaults') AS mark FROM records WHERE kind = ? AND json_type(data, ?) IN (${types})`)
      .all(A_CHAPTER.kind, A_CHAPTER.jsonPath, ...A_CHAPTER.sqliteNumberTypes) as { mark: string | null }[]
    expect(marks).toHaveLength(every.length)
    for (const { mark } of marks) expect(Object.keys(JSON.parse(mark!) as object).sort()).toEqual(['at', 'file'])
    const at = theTimeCopied(every)
    const said = await theDoor()
    expect(said.copiedFromTheDefaults).toEqual({ copies: [{ file: copy.THE_DEFAULT_REGULATIONS_FILE, at, first: true, chapters: every }], notCopied: [] })
    const { copiedFromTheDefaultsSentence } = await import('../src/server/lib/office-regulations.ts')
    const asTheFirstStart = { file: copy.THE_DEFAULT_REGULATIONS_FILE, at, first: true, chapters: every }
    expect(said.says).toContain(copiedFromTheDefaultsSentence({ copies: [asTheFirstStart], notCopied: [] }))
    expect(said.says).not.toContain(copiedFromTheDefaultsSentence({ copies: [{ ...asTheFirstStart, first: false }], notCopied: [] }))
  })
})
