// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { ChapterContent, SelectedChapter } from '../src/shared/chapter-edit.ts'
let db: TestDb, app: FastifyInstance, person: Record<string, string>
beforeAll(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready(); person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() } })
afterAll(async () => { await app.close(); db.close() })
async function read(): Promise<SelectedChapter> { return (await app.inject({ url: '/api/office-regulations/chapters', headers: person })).json().chapters.find((one: SelectedChapter) => one.n === 7) }
const snapshot = () => JSON.stringify(['records', 'revisions', 'changes'].map(table => db.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))

it('the edit preview checks and compares the kept record, and Apply writes the same content', async () => {
  const ids: string[] = []
  for (const text of ['The first invented words.', 'The second invented words.']) {
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: { kind: 'module', title: 'A made up chapter for preview', summary: 'Read the invented chapter before this test work.', data: { state: 'active', parts: [], extra: { chapter: 7 }, summaryBlocks: [{ id: 'r-8', type: 'text', heading: 'An invented question', text }] } } }); expect(made.statusCode, made.body).toBe(201)
    const id = made.json().record.id as string; ids.push(id)
    const revision = (await app.inject({ url: `/api/records/${id}/revisions`, headers: person })).json().revisions[0]
    const labelled = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: person, payload: { dataPatch: { shortForms: { label: { text: 'Invented chapter preview', madeFrom: { seq: revision.seq, contentHash: revision.contentHash } } } } } }); expect(labelled.statusCode, labelled.body).toBe(200)
  }
  const selected = await read(), keep = ids.find(id => id !== selected.record)!, old = db.api.getRecord(keep)!, rule = (old.data['summaryBlocks'] as { heading: string; text: string }[])[0]!
  const chapter: ChapterContent = { label: 'Invented chapter preview', title: old.title, conclusion: old.summary!, zh: null, rules: [{ id: 'r-8', heading: rule.heading, text: rule.text, zh: null }] }
  const noEnglishChange = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/preview', payload: { n: 7, keep, chapter } }); expect(noEnglishChange.statusCode, noEnglishChange.body).toBe(200); expect(noEnglishChange.json().problems).toEqual([]); expect(noEnglishChange.json().changes).toEqual([])
  chapter.rules[0]!.text = 'Edited words for the kept invented record.'; chapter.rules[0]!.zh = { heading: '测试提问', text: '保留记录的测试新文字。' }
  const before = snapshot(), preview = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/preview', payload: { n: 7, keep, chapter } }); expect(preview.statusCode, preview.body).toBe(200); expect(preview.json().problems).toEqual([]); expect(snapshot()).toBe(before)
  expect(preview.json().changes[0].was.text).toBe(rule.text)
  const badKeep = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/preview', payload: { n: 7, keep: 'not-a-record-of-this-chapter', chapter } }); expect(badKeep.statusCode).toBe(200); expect(badKeep.json().problems.join(' ')).toContain('record to keep does not hold this chapter'); expect(snapshot()).toBe(before)
  const applied = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers: person, payload: { n: 7, version: selected.version, keep, because: 'Apply the kept record shown in preview', chapter } }); expect(applied.statusCode, applied.body).toBe(200)
  expect(applied.json().record).toBe(keep); expect(applied.json().chapter).toEqual(chapter); expect(applied.json().chapter.rules[0].text).toBe(preview.json().changes[0].becomes.text)
  const after = snapshot(), stale = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers: person, payload: { n: 7, version: selected.version, because: 'An invented stale version', chapter } }); expect(stale.statusCode).toBe(409); expect(snapshot()).toBe(after)
})
