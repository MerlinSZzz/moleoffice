// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REGULATIONS DOOR NAMES ONLY THE CHAPTERS FILED AFTER THE COPY AS ADDED LATER.
 *
 * A fresh office copies the default set of chapters at its first run, and each copied chapter record carries the mark
 * `extra.copiedFromTheDefaults`. The regulations door answers `copiedFromTheDefaults` with the copies the starts made
 * and a `notCopied` list: each chapter in use that no copied record holds. Its `says` then carries one sentence about
 * the copy, and when only the first start copied and there are chapters it did not copy, the sentence names them first
 * as added later.
 *
 * WHAT THIS FILE HOLDS THE DOOR TO:
 *   1. a chapter marked for a role, filed after the copy under a number the shipped file lacks, is in use and is named
 *      as added later; a chapter marked for no role, under a number the shipped file lacks, is not in use, so it is
 *      not named;
 *   2. a copied chapter the person deletes is not in use while it is absent, so it is not named; the record restore
 *      door brings the same record back with its copy mark, so it is not named then either;
 *   3. a copied chapter the person deletes and then files again from the shipped file is a new record with no copy
 *      mark, so it is named as added later.
 *
 * The door's sentence about the copy is read through `copiedFromTheDefaultsSentence`, the one exported function that
 * builds it, so a sentence that names a chapter's number in the wrong words fails here. The cases run in the order
 * below, and each starts from the state the one before it left.
 *
 * Every chapter filed here is MADE-UP: its title, its conclusion, its one rule and its label say so. The shipped
 * chapters, the copy, the record door and the chapter restore door are real. The database is a temporary one this file
 * makes; nothing reaches the live office.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { TheSelectedChapters } from '../src/shared/chapter-edit.ts'
import type { WhatTheOfficeRegulationsSay } from '../src/shared/office-rules.ts'

const N = 17, NO_ROLE = 18
let db: TestDb, app: FastifyInstance, person: Record<string, string>
let K: number, kId: string

type TheDoorsSentence = (copied: WhatTheOfficeRegulationsSay['copiedFromTheDefaults']) => string

/**
 * THE DOOR'S SENTENCE ABOUT THE COPY, built from the door's own copies and the chapters no copy holds, so a test never
 * writes a fragment of the product's words itself.
 */
function sentenceFrom(copiedFromTheDefaultsSentence: TheDoorsSentence) {
  return (said: WhatTheOfficeRegulationsSay, notCopied: number[]): string =>
    copiedFromTheDefaultsSentence({ copies: said.copiedFromTheDefaults!.copies, notCopied })
}

async function theDoor(): Promise<WhatTheOfficeRegulationsSay> {
  const reply = await app.inject({ url: '/api/office-regulations', headers: person })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheOfficeRegulationsSay
}

beforeAll(async () => {
  db = await freshDb(); app = (await apiApp()).app; await app.ready()
  const { SHIPPED_CHAPTER_NUMBERS } = await import('../src/shared/chapter-check.ts')
  person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() }
  expect(SHIPPED_CHAPTER_NUMBERS, 'the made-up chapters need numbers the shipped file lacks').not.toContain(N)
  expect(SHIPPED_CHAPTER_NUMBERS, 'the made-up chapters need numbers the shipped file lacks').not.toContain(NO_ROLE)

  // THE COPY A FRESH OFFICE MAKES AT ITS FIRST RUN, then two MADE-UP chapters filed after it: one marked for the worker
  // card, one marked for no role.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBe(SHIPPED_CHAPTER_NUMBERS.length)
  const madeUp = [
    { n: N, role: 'worker' as string | undefined, title: 'MADE-UP role chapter', conclusion: 'MADE-UP conclusion of the role chapter: read it before the made-up work.', label: 'A MADE-UP role chapter', heading: 'A MADE-UP rule of the role chapter', text: 'MADE-UP work of the role chapter is recorded.' },
    { n: NO_ROLE, role: undefined as string | undefined, title: 'MADE-UP chapter marked for no role', conclusion: 'MADE-UP conclusion of the chapter marked for no role: read it before the made-up work.', label: 'A MADE-UP no-role chapter', heading: 'A MADE-UP rule of the chapter marked for no role', text: 'MADE-UP work of the chapter marked for no role is recorded.' },
  ]
  for (const one of madeUp) {
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: {
      kind: 'module', title: one.title, summary: one.conclusion,
      data: { state: 'active', parts: [], extra: { chapter: one.n, ...(one.role === undefined ? {} : { forRole: one.role }) }, summaryBlocks: [{ id: 'r-1', type: 'text', heading: one.heading, text: one.text }] },
    } })
    expect(made.statusCode, made.body).toBe(201)
    const id = made.json().record.id as string
    const revisions = (await app.inject({ url: `/api/records/${id}/revisions`, headers: person })).json().revisions as { seq: number; contentHash: string }[]
    const newest = revisions.reduce((a, b) => (b.seq > a.seq ? b : a))
    const labelled = await app.inject({ method: 'POST', url: `/api/records/${id}/short-forms`, headers: person, payload: { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: one.label } } })
    expect(labelled.statusCode, labelled.body).toBe(200)
  }

  // THE COPIED CHAPTER THE PERSON WILL DELETE: the last shipped number, and the record that holds it.
  K = SHIPPED_CHAPTER_NUMBERS.at(-1)!
  const choice = await app.inject({ url: '/api/office-regulations/chapters', headers: person })
  expect(choice.statusCode, choice.body).toBe(200)
  kId = (choice.json() as TheSelectedChapters).chapters.find(one => one.n === K)!.record!
  expect(kId, 'the copied chapter to delete is filed in a record').toBeTruthy()
}, 60_000)

afterAll(async () => {
  await app.close()
  db.close()
})

describe('the regulations door names only the chapters filed after the copy as added later', () => {
  it('names the role chapter filed after the copy, and not the chapter marked for no role', async () => {
    const { copiedFromTheDefaultsSentence } = await import('../src/server/lib/office-regulations.ts')
    const sentence = sentenceFrom(copiedFromTheDefaultsSentence)
    const said = await theDoor()
    expect(said.chapters.map(one => one.n), 'the role chapter filed after the copy is in use').toContain(N)
    expect(said.chapters.find(one => one.n === N)!.forRole).toBe('worker')
    expect(said.chapters.map(one => one.n), 'the chapter marked for no role is not in use').not.toContain(NO_ROLE)
    expect(said.copiedFromTheDefaults?.notCopied).toEqual([N])
    expect(said.says).toContain(sentence(said, [N]))
    expect(said.says).not.toContain(sentence(said, []))
    expect(said.says).not.toContain(sentence(said, [NO_ROLE]))
    expect(said.says).not.toContain(sentence(said, [N, NO_ROLE]))
  })

  it('does not name a copied chapter while it is absent, nor after the record restore door brings it back', async () => {
    const { copiedFromTheDefaultsSentence } = await import('../src/server/lib/office-regulations.ts')
    const sentence = sentenceFrom(copiedFromTheDefaultsSentence)

    const deleted = await app.inject({ method: 'DELETE', url: `/api/records/${kId}`, headers: person })
    expect(deleted.statusCode, deleted.body).toBe(200)
    const whileAbsent = await theDoor()
    expect(whileAbsent.chapters.map(one => one.n), 'the deleted chapter is not in use').not.toContain(K)
    expect(whileAbsent.copiedFromTheDefaults?.notCopied).toEqual([N])
    expect(whileAbsent.says).toContain(sentence(whileAbsent, [N]))
    expect(whileAbsent.says).not.toContain(sentence(whileAbsent, [K, N]))

    const restored = await app.inject({ method: 'POST', url: `/api/records/${kId}/restore`, headers: person, payload: {} })
    expect(restored.statusCode, restored.body).toBe(200)
    const back = await theDoor()
    expect(back.chapters.find(one => one.n === K)?.id, 'the record restore door brought back the same record').toBe(kId)
    expect(back.copiedFromTheDefaults?.notCopied).toEqual([N])
    expect(back.says).toContain(sentence(back, [N]))
    expect(back.says).not.toContain(sentence(back, [K, N]))
  })

  it('names a copied chapter as added later when the chapter restore door files it again from the shipped file', async () => {
    const { copiedFromTheDefaultsSentence } = await import('../src/server/lib/office-regulations.ts')
    const sentence = sentenceFrom(copiedFromTheDefaultsSentence)

    const deleted = await app.inject({ method: 'DELETE', url: `/api/records/${kId}`, headers: person })
    expect(deleted.statusCode, deleted.body).toBe(200)
    const filedAgain = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/restore', headers: person, payload: { n: K, version: null, because: 'MADE-UP restore of a deleted chapter', from: 'shipped' } })
    expect(filedAgain.statusCode, filedAgain.body).toBe(200)
    const said = await theDoor()
    const held = said.chapters.find(one => one.n === K)
    expect(held, 'the chapter filed again from the shipped file is in use').toBeDefined()
    expect(held!.id, 'the chapter filed again from the shipped file is a new record').not.toBe(kId)
    expect(said.copiedFromTheDefaults?.notCopied).toEqual([K, N])
    expect(said.says).toContain(sentence(said, [K, N]))
    expect(said.says).not.toContain(sentence(said, [N]))
  })
})
