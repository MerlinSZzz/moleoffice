// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING A CHAPTER NAMES ITS PRECEDENTS; READING A PRECEDENT NAMES ITS CHAPTER.
 *
 * Criterion C11 of design/rules/ACCEPTANCE.md: "The five existing breaks are linked to their
 * chapters. Measured: each has an about link and each chapter lists it." (This is the same
 * bidirectional reading criterion C13 states in general terms: "Reading a chapter names its
 * precedents; reading a precedent names its chapter. Measured both ways in one request each.")
 *
 * WHAT THIS FILE DOES NOT DO, AND WHY. C11 as written names five specific real records
 * (`LD9Yor6qIVVC`, `JmaDkej3InKw`, `Bz3T7il_bbts`, `M6Q9v0UOYEX9`, `IIbh2IOLM1Js`) in the live
 * corpus. Nothing in this worktree may reach that corpus — the brief this test was written under
 * forbids touching the live office's port or its database — so whether those five specific rows are still
 * linked is not something a test run from here can answer. What this file proves instead is the
 * mechanism their claim depends on: that the link between a problem and its chapter is read BOTH
 * WAYS, and that a chapter linked from SEVERAL precedents (chapter 2 in the real corpus has four)
 * lists all of them rather than one. If that mechanism holds, the five real links hold too,
 * provided they were made; whether they were made is a fact about data this run cannot see, and it
 * is reported separately as such rather than assumed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. A problem `about` a chapter shows that link on the problem's own page.
 *   2. The chapter's own page shows the SAME link, the other way — this is "both ways", not a
 *      convention two different readers happen to agree on.
 *   3. A chapter with THREE precedents lists all three, not the first one written. A test that
 *      linked only one problem could pass by coincidence if the backlink read stopped at one.
 *
 * Proved by mutation with a control run of this file first: in src/server/lib/records/link-readers.ts,
 * narrowing `resolveLinks`'s query from `or(eq(links.fromId, recordId), eq(links.toId, recordId))`
 * to `eq(links.fromId, recordId)` alone (dropping the backlink half) turns cases 2 and 3 red — the
 * chapter stops naming any precedent at all — while case 1 stays green, which is itself part of the
 * proof: the forward direction and the backward direction are genuinely two different reads.
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

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}

async function aChapter(title: string): Promise<string> {
  const made = await post('/api/records', { kind: 'module', title, data: { context: `${title}, for this test.` } })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}
async function aPrecedent(title: string): Promise<string> {
  const made = await post('/api/records', { kind: 'problem', title, data: { symptom: 'invented for this test', state: 'open' } })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

describe('reading a chapter names its precedents, and reading a precedent names its chapter', () => {
  it('a linked precedent names its chapter on its own page', async () => {
    const chapter = await aChapter('Chapter for C11, case 1')
    const problem = await aPrecedent('A break this test invents')
    const linked = await post('/api/links', { fromId: problem, toId: chapter, type: 'about' })
    expect(linked.status, JSON.stringify(linked.body)).toBe(201)

    const problemPage = await get(`/api/records/${problem}`)
    const links = (problemPage.body.links ?? []) as { type: string; isBacklink: boolean; other: { id: string } }[]
    const toChapter = links.find((one) => one.type === 'about' && !one.isBacklink && one.other.id === chapter)
    expect(toChapter, 'the problem does not name the chapter it is about').toBeDefined()
  })

  it('the chapter names the precedent back, the other way', async () => {
    const chapter = await aChapter('Chapter for C11, case 2')
    const problem = await aPrecedent('A break this test invents')
    await post('/api/links', { fromId: problem, toId: chapter, type: 'about' })

    const chapterPage = await get(`/api/records/${chapter}`)
    const links = (chapterPage.body.links ?? []) as { type: string; isBacklink: boolean; other: { id: string } }[]
    const fromProblem = links.find((one) => one.type === 'about' && one.isBacklink && one.other.id === problem)
    expect(fromProblem, 'the chapter does not list the precedent about it').toBeDefined()
  })

  it('a chapter with three precedents lists all three, not just the first', async () => {
    const chapter = await aChapter('Chapter for C11, case 3')
    const problems = [
      await aPrecedent('First break this test invents'),
      await aPrecedent('Second break this test invents'),
      await aPrecedent('Third break this test invents'),
    ]
    for (const problem of problems) {
      const linked = await post('/api/links', { fromId: problem, toId: chapter, type: 'about' })
      expect(linked.status, JSON.stringify(linked.body)).toBe(201)
    }

    const chapterPage = await get(`/api/records/${chapter}`)
    const links = (chapterPage.body.links ?? []) as { type: string; isBacklink: boolean; other: { id: string } }[]
    const named = new Set(links.filter((one) => one.type === 'about' && one.isBacklink).map((one) => one.other.id))
    for (const problem of problems) {
      expect(named, `the chapter should list ${problem} among its precedents`).toContain(problem)
    }
    expect(named.size, 'the chapter should list all three precedents, not a subset').toBe(3)
  })
})
