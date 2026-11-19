// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { chapterFromRecord, theEnglishHashOfAChapter, theEnglishHashOfARule } from '../src/shared/office-rules.ts'
import type { ChapterContent, SelectedChapter, AChaptersHistory } from '../src/shared/chapter-edit.ts'
let db: TestDb, app: FastifyInstance, person: Record<string, string>
beforeAll(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready(); person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() } })
afterAll(async () => { await app.close(); db.close() })
async function read(): Promise<SelectedChapter> { return (await app.inject({ url: '/api/office-regulations/chapters', headers: person })).json().chapters.find((one: SelectedChapter) => one.n === 7) }
async function apply(chapter: ChapterContent) { const held = await read(); return app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers: person, payload: { n: 7, version: held.version, because: 'Made up language and metadata proof', chapter } }) }
const snapshot = () => JSON.stringify(['records', 'revisions', 'changes'].map(table => db.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))

it('requires Chinese with changed English, computes its hash, preserves neutral twins and marks, and removes metadata with a removed rule', async () => {
  const first: ChapterContent = { label: 'Made up language', title: 'The made up language office', conclusion: 'Read the made up rules together.', zh: { label: '测试语言', title: '测试语言办公室', conclusion: '一起读测试规章。' }, rules: [{ id: 'r-1', heading: 'A made up rule', text: 'Made up initial words.', zh: { heading: '测试条文', text: '测试的初始文字。' } }, { id: 'r-8', heading: 'A made up question', text: 'Made up question words.', zh: { heading: '测试提问', text: '测试提问的文字。' } }] }
  const made = await apply(first); expect(made.statusCode, made.body).toBe(200); expect(made.json().chineseDropped).toEqual([])
  let held = await read()
  const record = db.api.getRecord(held.record!)!
  const blocks = record.data['summaryBlocks'] as Record<string, unknown>[]
  const twinEnglish = { name: 'Made up neutral rule', text: 'Made up neutral text.' }
  const neutral = { heading: twinEnglish.name, text: twinEnglish.text, zh: { heading: '测试中性条文', text: '测试中性文字。', from: theEnglishHashOfARule(twinEnglish) }, zhFrom: 'written for the default set', from: theEnglishHashOfARule({ name: first.rules[0]!.heading, text: first.rules[0]!.text }) }
  blocks[0]!['neutral'] = neutral
  const twin = await app.inject({ method: 'PATCH', url: `/api/records/${held.record}`, headers: person, payload: { dataPatch: { summaryBlocks: blocks } } }); expect(twin.statusCode, twin.body).toBe(200)
  const marked = await app.inject({ method: 'POST', url: '/api/office-regulations/only-this-office', headers: person, payload: { chapter: held.record, rule: 'r-1', only: true } }); expect(marked.statusCode, marked.body).toBe(200)
  held = await read()
  const next = structuredClone(held.chapter!); next.conclusion = 'Changed made up conclusion.'; next.zh = null; next.rules[0]!.text = 'Changed made up English.'; next.rules[0]!.zh = null
  const before = snapshot(), preview = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/preview', payload: { n: 7, chapter: next } })
  expect(preview.statusCode).toBe(200); expect(preview.json().problems.join(' ')).toContain('Chinese'); expect(preview.json().ownWords.becomes.conclusion).toBe(next.conclusion)
  const refused = await apply(next); expect(refused.statusCode).toBe(400); expect(refused.json().code).toBe('chapterEditRefused'); expect(snapshot()).toBe(before)
  next.zh = { ...first.zh!, conclusion: '修改后的测试结论。' }; next.rules[0]!.zh = { heading: '测试条文', text: '修改后的测试英文对应的中文。' }
  const changed = await apply(next); expect(changed.statusCode, changed.body).toBe(200)
  const after = db.api.getRecord(held.record!)!.data
  const rule = (after['summaryBlocks'] as Record<string, unknown>[])[0]!
  expect(rule['neutral']).toEqual(neutral); expect(after['onlyThisOffice']).toEqual(record.data['onlyThisOffice'] ?? [{ rule: 'r-1', by: THE_TEST_OFFICES_OWNER.id, at: expect.any(String) }])
  expect(rule['zh']).toMatchObject({ ...next.rules[0]!.zh, from: theEnglishHashOfARule({ name: next.rules[0]!.heading, text: next.rules[0]!.text }) })
  const removed = structuredClone((await read()).chapter!); removed.rules.shift()
  expect((await apply(removed)).statusCode).toBe(200)
  const remaining = db.api.getRecord(held.record!)!.data
  expect(remaining['onlyThisOffice']).toBeUndefined(); expect((remaining['summaryBlocks'] as Record<string, unknown>[]).some(one => one['id'] === 'r-1')).toBe(false)
  const history = (await app.inject({ url: '/api/office-regulations/chapters/7/history', headers: person })).json() as AChaptersHistory
  const target = history.versions.find(one => one.after.rules.some(rule => rule.id === 'r-1'))!
  const restored = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/restore', headers: person, payload: { n: 7, version: (await read()).version, because: 'Restore the made up bilingual revision', from: target.seq } })
  expect(restored.statusCode, restored.body).toBe(200); expect((await read()).chapter).toEqual(target.after)
  const shipped = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/restore', headers: person, payload: { n: 7, version: restored.json().version, because: 'Restore the made up office from shipped', from: 'shipped' } })
  expect(shipped.statusCode, shipped.body).toBe(200); expect(shipped.json().chineseDropped).toContain('chapter'); expect(shipped.json().chineseDropped).toContain('r-8')
})

it('unchanged English with zh null keeps a stale stored half; Restore drops a stale half from its revision and names it', async () => {
  const held = await read(), record = db.api.getRecord(held.record!)!
  const blocks = record.data['summaryBlocks'] as Record<string, unknown>[]
  const rule = blocks.find(one => one['id'] === 'r-8')!
  rule['zh'] = { heading: '旧的测试中文', text: '旧的测试中文文字。', from: 'made-up-stale-hash' }
  db.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...record.data, summaryBlocks: blocks }), record.id)
  expect(halvesBesideOtherEnglish(record.id)).toEqual(['r-8'])
  const stale = await read(); expect(stale.chapter!.rules.find(one => one.id === 'r-8')!.zh).toBeNull(); expect(stale.chineseWaiting).toContain('r-8')
  const same = await apply(stale.chapter!); expect(same.statusCode, same.body).toBe(200)
  expect((db.api.getRecord(record.id)!.data['summaryBlocks'] as Record<string, unknown>[]).find(one => one['id'] === 'r-8')!['zh']).toEqual(rule['zh'])
  const history = (await app.inject({ url: '/api/office-regulations/chapters/7/history', headers: person })).json() as AChaptersHistory
  const restored = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/restore', headers: person, payload: { n: 7, version: same.json().version, because: 'Put back an older stale test revision', from: history.versions[0]!.seq } })
  expect(restored.statusCode, restored.body).toBe(200); expect(restored.json().chineseDropped).toContain('r-8'); expect((await read()).chineseWaiting).not.toContain('r-8')
})

it('a revision outside this chapter history is a coded refusal and the transaction writes nothing', async () => {
  const before = snapshot(), held = await read()
  const reply = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/restore', headers: person, payload: { n: 7, version: held.version, because: 'An invented revision that does not exist', from: 999999 } })
  expect(reply.statusCode, reply.body).toBe(404); expect(reply.json().code).toBe('chapterEditRefused'); expect(reply.json().error).toMatch(/Nothing was changed\.$/); expect(snapshot()).toBe(before)
})

/** Every Chinese half the chapter record holds, named by where it is, whose `from` is not the hash of the English stored beside it. */
function halvesBesideOtherEnglish(id: string): string[] {
  const record = db.api.getRecord(id)!, own = record.data['zh'] as { from?: unknown } | null | undefined
  const rules = (record.data['summaryBlocks'] as { id: string; heading: string; text: string; zh?: { from?: unknown } | null }[])
    .filter(rule => rule.zh != null && rule.zh.from !== theEnglishHashOfARule({ name: rule.heading, text: rule.text })).map(rule => rule.id)
  return [...rules, ...(own != null && own.from !== theEnglishHashOfAChapter(chapterFromRecord(record)!) ? ['chapter'] : [])]
}

it('never keeps the old Chinese beside changed English: an English-only Apply and an English-only records PATCH are each refused and write nothing', async () => {
  // Criterion (wave 13r round 5, item 4). The owner's decision stands. The secretary
  // withdrew the answer that an English-only edit is written without its Chinese.
  const both: ChapterContent = { label: 'Made up pair', title: 'The made up pair office', conclusion: 'Read the made up pair together.', zh: { label: '测试成对', title: '测试成对办公室', conclusion: '一起读测试成对规章。' }, rules: [{ id: 'r-1', heading: 'A made up pair rule', text: 'Made up pair words.', zh: { heading: '测试成对条文', text: '测试成对的文字。' } }, { id: 'r-8', heading: 'A made up pair question', text: 'Made up pair question words.', zh: { heading: '测试成对提问', text: '测试成对提问的文字。' } }] }
  const made = await apply(both); expect(made.statusCode, made.body).toBe(200)
  const held = await read(), id = held.record!
  expect(halvesBesideOtherEnglish(id)).toEqual([])
  const rule = structuredClone(held.chapter!); rule.rules[0]!.text = 'Changed made up pair words.'; rule.rules[0]!.zh = null
  const own = structuredClone(held.chapter!); own.conclusion = 'Changed made up pair conclusion.'; own.zh = null
  for (const next of [rule, own]) {
    const before = snapshot(), refused = await apply(next)
    expect(refused.statusCode, refused.body).toBe(400); expect(refused.json().code).toBe('chapterEditRefused'); expect(snapshot()).toBe(before)
    expect(halvesBesideOtherEnglish(id)).toEqual([])
  }
  const blocks = db.api.getRecord(id)!.data['summaryBlocks'] as Record<string, unknown>[]
  blocks[0]!['text'] = 'Changed made up pair words through the records door.'
  const before = snapshot(), patched = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: person, payload: { dataPatch: { summaryBlocks: blocks } } })
  expect(patched.statusCode, patched.body).toBe(400); expect(patched.json().code).toBe('chineseHalfNotFromThisEnglish'); expect(snapshot()).toBe(before)
  expect(halvesBesideOtherEnglish(id)).toEqual([])
})
