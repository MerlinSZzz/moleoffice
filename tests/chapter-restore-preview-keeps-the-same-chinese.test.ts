// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { ChapterContent, SelectedChapter, AChapterPreview } from '../src/shared/chapter-edit.ts'
let db: TestDb, app: FastifyInstance, person: Record<string, string>
beforeAll(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready(); person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() } })
afterAll(async () => { await app.close(); db.close() })
async function read(): Promise<SelectedChapter> { return (await app.inject({ url: '/api/office-regulations/chapters', headers: person })).json().chapters.find((one: SelectedChapter) => one.n === 1) }

it('shipped preview keeps current Chinese beside unchanged English and equals what Restore writes', async () => {
  const shipped = (await read()).shipped
  if (shipped === null) throw new Error('Chapter 1 answered no shipped text, and this case previews a restore from it.')
  const bilingual: ChapterContent = { ...shipped, zh: { label: '测试章节名称', title: '测试章节标题', conclusion: '测试章节结论。' }, rules: shipped.rules.map(rule => ({ ...rule, zh: { heading: '测试条文名称', text: '测试条文的中文。' } })) }
  const initial = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers: person, payload: { n: 1, version: null, because: 'Made up Chinese preview fixture', chapter: bilingual } }); expect(initial.statusCode, initial.body).toBe(200)
  const next = structuredClone(bilingual); next.rules[0]!.text = 'Only this invented rule differs from shipped.'; next.rules[0]!.zh = { heading: '测试条文名称', text: '只有这条测试条文变了。' }
  const applied = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers: person, payload: { n: 1, version: initial.json().version, because: 'Change one invented rule', chapter: next } }); expect(applied.statusCode, applied.body).toBe(200)
  const preview = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/preview', payload: { n: 1, from: 'shipped' } }); expect(preview.statusCode, preview.body).toBe(200)
  const checked = preview.json() as AChapterPreview
  expect(checked.problems).toEqual([]); expect(checked.ownWords).toBeNull(); expect(checked.changes).toHaveLength(1); expect(checked.changes[0]!.becomes!.zh).toBeNull()
  const predicted = structuredClone(next)
  if (checked.ownWords !== null) Object.assign(predicted, checked.ownWords.becomes)
  for (const change of checked.changes) { const rule = predicted.rules.find(one => one.id === change.rule)!; Object.assign(rule, change.becomes) }
  const restored = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/restore', headers: person, payload: { n: 1, version: applied.json().version, because: 'Restore from the shown preview', from: 'shipped' } }); expect(restored.statusCode, restored.body).toBe(200)
  expect(restored.json().chapter).toEqual(predicted); expect((await read()).chapter).toEqual(predicted)
  expect(restored.json().chineseDropped).toEqual([shipped.rules[0]!.id]); expect(predicted.zh).toEqual(bilingual.zh); expect(predicted.rules[1]!.zh).toEqual(bilingual.rules[1]!.zh)
})
