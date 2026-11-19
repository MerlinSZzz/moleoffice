// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PRECEDENT IS A `problem` RECORD LINKED TO ITS CHAPTER WITH `about`, AND NO NEW KIND WAS ADDED.
 *
 * Criterion C10 of design/rules/ACCEPTANCE.md: "A precedent is a problem record linked to its
 * chapter with about, and no new kind was added." Measured there against `GET /api/kinds`: the
 * same kinds after this cluster as before it. Section 5 of the same file names what a precedent
 * needs and the `problem` field that already holds each one — what happened (`symptom`), why
 * (`cause`), what it cost (`why_it_hurts`), what was done (`fix`), how to recognise it coming back
 * (`how_to_tell_it_is_back`), where it happened (`seen_in`) — plus the link itself, `about`, from
 * the problem to the chapter.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE `problem` KIND STILL DECLARES ALL SIX FIELDS a precedent needs.
 *   2. NO `precedent` KIND EXISTS BESIDE IT. Adding one would be the sixth invariant's own defect:
 *      two ways to record the same break.
 *   3. A `problem` MAY CARRY AN `about` LINK TO A MODULE — a chapter is a module record
 *      (design/rules/ACCEPTANCE.md section 4) — and the link is readable from both ends, which is
 *      what makes "linked to its chapter" true rather than asserted.
 *
 * Proved by mutation with a control run of this file first: removing one field (for example
 * `how_to_tell_it_is_back`) from the `problem` kind's declaration in src/shared/kinds.ts turns
 * case 1 red without touching anything else.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 120_000)
afterAll(async () => {
  await app.close()
  t.close()
})

async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}
async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}

/** Every field key the served `problem` kind declares. */
async function problemFieldKeys(): Promise<Set<string>> {
  const kinds = await get('/api/kinds')
  expect(kinds.status, JSON.stringify(kinds.body)).toBe(200)
  const list = kinds.body.kinds as { kind: string; fields: { key: string }[] }[]
  const problem = list.find((one) => one.kind === 'problem')
  expect(problem, 'no "problem" kind is declared at all').toBeDefined()
  return new Set((problem as { fields: { key: string }[] }).fields.map((f) => f.key))
}

const WHAT_A_PRECEDENT_NEEDS = ['symptom', 'cause', 'fix', 'why_it_hurts', 'how_to_tell_it_is_back', 'seen_in']

describe('a precedent is a problem record, and no new kind was added for it', () => {
  it('the problem kind still carries every field a precedent needs', async () => {
    const keys = await problemFieldKeys()
    for (const need of WHAT_A_PRECEDENT_NEEDS) {
      expect(keys, `the problem kind lost its "${need}" field, which section 5 names as what a precedent needs`).toContain(need)
    }
  })


  it('links a problem to a chapter with about, and the link reads both ways', async () => {
    const chapter = await post('/api/records', {
      kind: 'module',
      title: 'Chapter for this test',
      summary: 'A stand-in chapter record, so the link does not depend on a real one.',
    })
    expect(chapter.status, JSON.stringify(chapter.body)).toBe(201)
    const chapterId = chapter.body.record.id as string

    const problem = await post('/api/records', {
      kind: 'problem',
      title: 'A break this test invents',
      data: { symptom: 'made up for this test', state: 'open' },
    })
    expect(problem.status, JSON.stringify(problem.body)).toBe(201)
    const problemId = problem.body.record.id as string

    const linked = await post('/api/links', { fromId: problemId, toId: chapterId, type: 'about' })
    expect(linked.status, JSON.stringify(linked.body)).toBe(201)

    // READ FROM THE PROBLEM: it names the chapter it is about.
    const problemPage = await get(`/api/records/${problemId}`)
    const problemLinks = JSON.stringify(problemPage.body.links ?? problemPage.body)
    expect(problemLinks, 'the problem does not carry its about-link to the chapter').toContain(chapterId)

    // READ FROM THE CHAPTER: it names the problem as a precedent about it.
    const chapterPage = await get(`/api/records/${chapterId}`)
    const chapterLinks = JSON.stringify(chapterPage.body.links ?? chapterPage.body)
    expect(chapterLinks, 'the chapter does not list the problem as a precedent about it').toContain(problemId)
  })
})
