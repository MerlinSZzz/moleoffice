// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHAPTER THE SHIPPED FILE LACKS IS USED ONLY WITH A ROLE CARD'S MARK.
 *
 * The office uses a stored chapter under a number the shipped file lacks when its `extra.forRole` names a role card,
 * after the same check as any other chapter. That is decision 65Rakwbgy26O, which replaces the rule this file used to
 * pin: that such a chapter is always named unsupported and never used. This file holds the new rule and the guards
 * beside it, the run's reading of the chapter, and the refusal to restore shipped text the office does not have.
 *
 * Every chapter here is MADE-UP. The chapters filed here are 17, 18, 19 and 20, numbers the shipped file lacks. The
 * shipped numbers are read from the shipped file (`SHIPPED_CHAPTER_NUMBERS`), never typed here, so this file holds
 * however many chapters the office ships.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { TheSelectedChapters } from '../src/shared/chapter-edit.ts'
import { SHIPPED_CHAPTER_NUMBERS } from '../src/shared/chapter-check.ts'

let db: TestDb, app: FastifyInstance, person: Record<string, string>, scratch: string
beforeAll(async () => {
  db = await freshDb(); app = (await apiApp()).app; await app.ready()
  scratch = mkdtempSync(join(tmpdir(), 'mole-chapter-unshipped-'))
  person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() }
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  copyTheDefaultRegulationsOnce()
})
afterAll(async () => { await app.close(); db.close(); rmSync(scratch, { recursive: true, force: true }) })

const snapshot = () => JSON.stringify(['records', 'revisions', 'changes'].map(table => db.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))
const readTheChapters = () => app.inject({ url: '/api/office-regulations/chapters', headers: person })
const theChapter = (selected: TheSelectedChapters, n: number) => selected.chapters.find(one => one.n === n)
function theUnsupported(selected: TheSelectedChapters) {
  if (selected.unsupported === null) throw new Error('The answer named no unsupported records, and this case expects one.')
  return selected.unsupported
}

const labelOf = (n: number) => `A MADE-UP chapter ${String(n)}`
const conclusionOf = (n: number) => `MADE-UP conclusion of chapter ${String(n)}: read it before the made-up work.`

/** File one MADE-UP chapter under its own number, with a label, the way this file always filed one. */
async function fileAChapter(n: number, forRole: string | undefined, rules: Record<string, unknown>[]) {
  const label = labelOf(n), conclusion = conclusionOf(n)
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: {
    kind: 'module',
    title: `MADE-UP chapter ${String(n)}`,
    summary: conclusion,
    data: { state: 'active', parts: [], extra: { chapter: n, ...(forRole === undefined ? {} : { forRole }) }, summaryBlocks: rules },
  } })
  expect(made.statusCode, made.body).toBe(201)
  const id = made.json().record.id as string
  const revisions = (await app.inject({ url: `/api/records/${id}/revisions`, headers: person })).json().revisions as { seq: number; contentHash: string }[]
  const newest = revisions.reduce((a, b) => (b.seq > a.seq ? b : a))
  const labelled = await app.inject({ method: 'POST', url: `/api/records/${id}/short-forms`, headers: person, payload: { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label } } })
  expect(labelled.statusCode, labelled.body).toBe(200)
  return { id, label, conclusion }
}
const oneRule = (n: number) => [{ id: 'r-1', type: 'text', heading: `A MADE-UP rule of chapter ${String(n)}`, text: `MADE-UP work of chapter ${String(n)} is recorded.` }]

it('uses MADE-UP chapter 17, marked for a role card, and writes nothing', async () => {
  const original = (await readTheChapters()).json() as TheSelectedChapters
  expect(original.unsupported).toBeNull()
  const filed = await fileAChapter(17, 'worker', oneRule(17))
  const before = snapshot(), reply = await readTheChapters(); expect(reply.statusCode, reply.body).toBe(200)
  const selected = reply.json() as TheSelectedChapters
  expect(selected.chapters.map(one => one.n)).toEqual([...SHIPPED_CHAPTER_NUMBERS, 17])
  expect(theChapter(selected, 17)).toMatchObject({ n: 17, inUse: 'stored', record: filed.id, forRole: 'worker', shipped: null })
  expect(selected.chapters.filter(one => one.n !== 17)).toEqual(original.chapters)
  expect(selected.unsupported).toBeNull()
  expect(selected.records?.some(one => one.id === filed.id)).toBe(true)
  expect(snapshot()).toBe(before)
})

it('the run reads MADE-UP chapter 17 and leaves it out of the shared rules', async () => {
  const answer = (await readTheChapters()).json() as TheSelectedChapters
  expect(theChapter(answer, 17)).toMatchObject({ inUse: 'stored', forRole: 'worker' })
  const { chaptersSelectedForRun, writeRulesInto } = await import('../src/worker/rules.ts')
  const chapters = chaptersSelectedForRun(answer, process.cwd())
  expect(chapters.map(one => one.n)).toEqual([...SHIPPED_CHAPTER_NUMBERS, 17])
  expect(chapters.find(one => one.n === 17)).toHaveProperty('forRole', 'worker')
  writeRulesInto(scratch, process.cwd(), 'AGENTS.md', chapters)
  const text = readFileSync(join(scratch, 'AGENTS.md'), 'utf8')
  expect(text).not.toContain(labelOf(17))
  expect(text).not.toContain(conclusionOf(17))
})

it('does not use MADE-UP chapter 18, which has no role mark', async () => {
  const filed = await fileAChapter(18, undefined, oneRule(18))
  const selected = (await readTheChapters()).json() as TheSelectedChapters
  expect(theChapter(selected, 18)).toBeUndefined()
  expect(theUnsupported(selected).records).toContain(filed.id)
  expect(theUnsupported(selected).problems).toContain(`${filed.id}: Chapter 18 is not one of the shipped chapter numbers and is not used.`)
})

it('does not use MADE-UP chapter 19, whose mark names no role card', async () => {
  const filed = await fileAChapter(19, 'made-up-role', oneRule(19))
  const selected = (await readTheChapters()).json() as TheSelectedChapters
  expect(theChapter(selected, 19)).toBeUndefined()
  expect(theUnsupported(selected).records).toContain(filed.id)
  expect(theUnsupported(selected).problems).toContain(`${filed.id}: Chapter 19 is marked for the role "made-up-role", which no role card holds, and is not used.`)
})

it('does not use MADE-UP chapter 20 when the same check as any chapter names a problem', async () => {
  const filed = await fileAChapter(20, 'worker', [])
  const selected = (await readTheChapters()).json() as TheSelectedChapters
  expect(theChapter(selected, 20)).toBeUndefined()
  expect(theUnsupported(selected).records).toContain(filed.id)
  expect(theUnsupported(selected).problems).toContain(`${filed.id}: The chapter has no rules.`)
})

it('refuses to restore MADE-UP chapter 17 from shipped text it does not have, and writes nothing', async () => {
  const before = snapshot()
  const reply = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/preview', headers: person, payload: { n: 17, from: 'shipped' } })
  expect(reply.statusCode, reply.body).toBe(404)
  expect(reply.json().error).toContain('Chapter 17 is not shipped, so there is no shipped text to restore it from.')
  expect(snapshot()).toBe(before)
})
