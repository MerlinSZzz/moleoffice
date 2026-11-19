// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { ChapterContent, SelectedChapter, AChaptersHistory } from '../src/shared/chapter-edit.ts'
let db: TestDb, app: FastifyInstance, person: Record<string, string>
let chapterNumber = 7
let caseNumber = 0
const chapter: ChapterContent = { label: 'Made up restoration', title: 'Rules for a made up restoration office', conclusion: 'Read these made up restoration rules together.', zh: { label: '测试恢复', title: '测试恢复办公室的规章', conclusion: '一起读这些测试恢复规章。' }, rules: [{ id: 'r-8', heading: 'A made up question', text: 'The first made up restoration text.', zh: { heading: '测试提问', text: '第一份测试恢复文字。' } }] }
beforeAll(async () => {
  db = await freshDb(); app = (await apiApp()).app; await app.ready()
}, 60_000)
afterAll(async () => { await app.close(); db.close() })
beforeEach(async () => {
  caseNumber += 1
  chapterNumber = 6 + caseNumber
  person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() }
  const set = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers: person, payload: { n: chapterNumber, version: null, because: 'Made up restore preview fixture', chapter } })
  expect(set.statusCode, set.body).toBe(200)
})
async function read(): Promise<SelectedChapter> { return (await app.inject({ url: '/api/office-regulations/chapters', headers: person })).json().chapters.find((one: SelectedChapter) => one.n === chapterNumber) }
async function history(): Promise<AChaptersHistory> { return (await app.inject({ url: `/api/office-regulations/chapters/${String(chapterNumber)}/history`, headers: person })).json() }
async function preview(from: 'shipped' | number, keep?: string) { return app.inject({ method: 'POST', url: '/api/office-regulations/chapters/preview', payload: { n: chapterNumber, from, ...(keep === undefined ? {} : { keep }) } }) }
async function restore(from: 'shipped' | number, keep?: string) { return app.inject({ method: 'POST', url: '/api/office-regulations/chapters/restore', headers: person, payload: { n: chapterNumber, version: (await read()).version, because: 'Made up restoration from its preview', from, ...(keep === undefined ? {} : { keep }) } }) }
const snapshot = () => JSON.stringify(['records', 'revisions', 'changes'].map(table => db.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))

it('previews the shipped recovery without Apply Chinese checks and Restore writes that content', async () => {
  const held = await read()
  const broken = await app.inject({ method: 'PATCH', url: `/api/records/${held.record}`, headers: person, payload: { dataPatch: { summaryBlocks: [] } } }); expect(broken.statusCode).toBe(200)
  const before = snapshot(), checked = await preview('shipped')
  expect(checked.statusCode, checked.body).toBe(200); expect(checked.json().problems).toEqual([]); expect(snapshot()).toBe(before)
  const restored = await restore('shipped'); expect(restored.statusCode, restored.body).toBe(200); expect(restored.json().chapter).toEqual(held.shipped)
  expect(checked.json().ownWords.becomes.conclusion).toBe(restored.json().chapter.conclusion)
  for (const payload of [{ n: chapterNumber }, { n: chapterNumber, chapter, from: 'shipped' }]) {
    const initial = snapshot(), refused = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/preview', payload })
    expect(refused.statusCode).toBe(400); expect(refused.json().code).toBe('chapterEditRefused'); expect(snapshot()).toBe(initial)
  }
})

it('a historical preview and Restore make the same structural checks while stale Chinese is dropped', async () => {
  const held = await read(), stored = db.api.getRecord(held.record!)!, blocks = stored.data['summaryBlocks'] as Record<string, unknown>[]
  blocks[0]!['zh'] = { heading: '旧测试中文', text: '旧测试文字。', from: 'an-invented-old-hash' }
  db.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...stored.data, summaryBlocks: blocks }), stored.id)
  const same = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers: person, payload: { n: chapterNumber, version: (await read()).version, because: 'Keep an invented older Chinese half', chapter: (await read()).chapter } })
  expect(same.statusCode, same.body).toBe(200)
  const revision = (await history()).versions[0]!
  const checked = await preview(revision.seq); expect(checked.statusCode).toBe(200); expect(checked.json().problems).toEqual([])
  const restored = await restore(revision.seq); expect(restored.statusCode, restored.body).toBe(200); expect(restored.json().chineseDropped).toEqual(['r-8'])
  const broken = await app.inject({ method: 'PATCH', url: `/api/records/${stored.id}`, headers: person, payload: { dataPatch: { summaryBlocks: [] } } }); expect(broken.statusCode).toBe(200)
  const badRevision = (await history()).versions[0]!.seq, before = snapshot(), invalid = await preview(badRevision)
  expect(invalid.statusCode).toBe(200); expect(invalid.json().problems).toContain('The chapter has no rules.')
  const refused = await restore(badRevision); expect(refused.statusCode).toBe(400); expect(refused.json().error).toContain(invalid.json().problems[0]); expect(snapshot()).toBe(before)
})

it('with duplicate records, history and preview read the shown record and Restore writes into the other record kept', async () => {
  const held = await read()
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: { kind: 'module', title: 'A second made up chapter source', summary: 'A different conclusion in the second made up source.', data: { state: 'active', parts: [], extra: { chapter: chapterNumber }, summaryBlocks: [{ id: 'r-8', type: 'text', heading: 'Another made up question', text: 'The other made up restoration text.' }] } } })
  expect(made.statusCode, made.body).toBe(201)
  const id = made.json().record.id as string
  const revision = (await app.inject({ url: `/api/records/${id}/revisions`, headers: person })).json().revisions[0]
  const labelled = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: person, payload: { dataPatch: { shortForms: { label: { text: 'Other made up source', madeFrom: { seq: revision.seq, contentHash: revision.contentHash } } } } } })
  expect(labelled.statusCode, labelled.body).toBe(200)
  const selected = await read(), shown = await history()
  expect(shown.record).toBe(selected.record)
  const keep = selected.notUsed!.records.find(record => record !== shown.record)!, from = shown.versions[0]!
  expect([held.record, id]).toContain(keep)
  const before = snapshot(), checked = await preview(from.seq, keep)
  expect(checked.statusCode, checked.body).toBe(200); expect(checked.json().problems).toEqual([]); expect(snapshot()).toBe(before)
  expect(checked.json().changes.find((one: { rule: string }) => one.rule === 'r-8').becomes.text).toBe(from.after.rules[0]!.text)
  const restored = await restore(from.seq, keep)
  expect(restored.statusCode, restored.body).toBe(200); expect(restored.json().record).toBe(keep); expect(restored.json().chapter).toEqual(from.after); expect(restored.json().notUsed).toBeNull()
})
