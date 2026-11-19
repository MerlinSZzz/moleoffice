// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { ChapterContent, SelectedChapter, TheSelectedChapters, AChaptersHistory } from '../src/shared/chapter-edit.ts'

let db: TestDb, app: FastifyInstance, person: Record<string, string>
/**
 * A chapter number the case owns. The office holds one set of chapters, read by every project, so two
 * cases editing one number would each see the other's edits; a number each case owns gives the same
 * isolation the fresh office gave. The five general-write cases share chapter 7, the one number the
 * code reads a rule from that the case removes (RULES_THE_CODE_NAMES): each of them starts by writing
 * its own content over whatever the one before left, and ends with the shipped chapter restored.
 */
let N = 7
const content = (): ChapterContent => ({ label: 'Made up chapter', title: 'Rules for the made up office', conclusion: 'Read these made up rules before this test work.', zh: { label: '测试规章', title: '测试办公室的规章', conclusion: '测试工作之前读这些规章。' }, rules: Array.from({ length: 8 }, (_, i) => ({ id: `r-${String(i + 1)}`, heading: `Made up rule ${String(i + 1)}`, text: `Made up words for rule ${String(i + 1)}.`, zh: { heading: `测试条文 ${String(i + 1)}`, text: `测试条文 ${String(i + 1)} 的文字。` } })) })
beforeAll(async () => {
  db = await freshDb(); app = (await apiApp()).app; await app.ready()
  person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() }
}, 60_000)
afterAll(async () => { await app.close(); db.close() })
async function read(): Promise<SelectedChapter> {
  const reply = await app.inject({ url: '/api/office-regulations/chapters', headers: person })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as TheSelectedChapters).chapters.find(one => one.n === N)!
}
async function apply(chapter: ChapterContent, extra = {}, headers = person) {
  const before = await read()
  return app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers, payload: { n: N, version: before.version, because: 'Made up chapter edit reason', chapter, ...extra } })
}
async function restore(from: 'shipped' | number, extra = {}, headers = person) {
  const before = await read()
  return app.inject({ method: 'POST', url: '/api/office-regulations/chapters/restore', headers, payload: { n: N, version: before.version, because: 'Made up restoration reason', from, ...extra } })
}
function snapshot() {
  return JSON.stringify(['records', 'revisions', 'changes'].map(table => db.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))
}
async function history(offset = 0): Promise<AChaptersHistory> {
  const reply = await app.inject({ url: `/api/office-regulations/chapters/${String(N)}/history?offset=${String(offset)}`, headers: person })
  expect(reply.statusCode, reply.body).toBe(200); return reply.json()
}

it('reads, previews, applies with a reason, and restores record history and shipped through the doors alone', async () => {
  N = 1
  expect((await read()).inUse).toBe('none')
  const first = content(), before = snapshot()
  const preview = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/preview', payload: { n: N, chapter: first } })
  expect(preview.statusCode).toBe(200); expect(preview.json().problems).toEqual([]); expect(snapshot()).toBe(before)
  const saved = await apply(first); expect(saved.statusCode, saved.body).toBe(200)
  expect((await read()).chapter).toEqual(first)
  const old = await history()
  expect(old.versions[0]).toMatchObject({ because: 'Made up chapter edit reason', after: first, by: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  const next = content(); next.rules[7]!.text = 'The made up office now reads this edited rule.'
  expect((await apply(next)).statusCode).toBe(200)
  expect((await restore(old.versions[0]!.seq)).statusCode).toBe(200); expect((await read()).chapter).toEqual(first)
  expect((await restore('shipped')).statusCode).toBe(200)
  const restored = await read(); expect(restored.inUse).toBe('stored'); expect(restored.chapter).toEqual(restored.shipped)
  const held = snapshot(); const stale = await apply(first, { version: saved.json().version })
  expect(stale.statusCode).toBe(409); expect(stale.json().code).toBe('chapterEditRefused'); expect(snapshot()).toBe(held)
  for (let i = 0; i < 11; i++) { const chapter = content(); chapter.conclusion += ` Edit ${String(i)}.`; expect((await apply(chapter)).statusCode).toBe(200) }
  expect((await history()).versions).toHaveLength(10); expect((await history()).next).toBe(10); expect((await history(10)).versions.length).toBeGreaterThan(0)
})

it('an absent chapter stays absent until Restore files the shipped chapter', async () => {
  N = 2
  expect((await read()).chapter).toBeNull()
  // THE PAGE LISTS EVERY CHAPTER THE OFFICE HOLDS, so the reading is taken at the start of the case
  // and the case checks that nothing was added to it before Restore, and exactly its own chapter after.
  const pageAtStart = (await app.inject({ url: '/api/office-regulations' })).json().chapters as { n: number }[]
  expect(pageAtStart.map(one => one.n)).not.toContain(N)
  const { theAbsenceOfARule } = await import('../src/server/lib/chapters.ts')
  expect(theAbsenceOfARule(N, 'r-8')).toContain(`hold no chapter ${String(N)}`)
  const pageBefore = (await app.inject({ url: '/api/office-regulations' })).json().chapters as { n: number }[]
  expect(pageBefore).toEqual(pageAtStart)
  expect((await restore('shipped')).statusCode).toBe(200)
  expect((await read()).inUse).toBe('stored'); expect((await read()).chapter).toEqual((await read()).shipped)
  const pageAfter = (await app.inject({ url: '/api/office-regulations' })).json().chapters as { n: number }[]
  expect(pageAfter.map(one => one.n).sort()).toEqual([...pageAtStart.map(one => one.n), N].sort())
})

it('agents and a raised secretary cannot Apply or Restore and nothing is written', async () => {
  N = 3
  expect((await apply(content())).statusCode).toBe(200)
  const { agentByHandle } = await import('../src/server/lib/participants.ts')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  for (const role of ['worker', 'secretary']) {
    const handle = `made-up-chapter-${role}`
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle, name: `Made up ${role}`, role } })
    expect(made.statusCode, made.body).toBe(201)
    const agent = agentByHandle(handle)!
    if (role === 'secretary') {
      const raised = await app.inject({ method: 'POST', url: `/api/roles/elevation/${handle}`, headers: person, payload: { reason: 'Made up authority proof', endsWhen: 'at a time', until: '2099-01-01 07:00' } })
      expect(raised.statusCode, raised.body).toBe(201)
    }
    const headers = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': makeAnAgentKey(agent.id, null) }
    const before = snapshot()
    for (const request of [() => apply(content(), {}, headers), () => restore('shipped', {}, headers)]) {
      const refused = await request(); expect(refused.statusCode, refused.body).toBe(403); expect(refused.json().code).toBe('chapterEditRefused'); expect(snapshot()).toBe(before)
    }
  }
})

it.each(['no rules', 'no text', 'duplicate id', 'named rule gone', 'second record'])('a general record write with %s uses shipped loudly and the person restores it', async defect => {
  N = 7
  expect((await apply(content())).statusCode).toBe(200)
  const held = await read(), blocks = (db.api.getRecord(held.record!)!.data['summaryBlocks'] as Record<string, unknown>[]).map(rule => ({ ...rule }))
  if (defect === 'no rules') blocks.splice(0)
  if (defect === 'no text') blocks[0]!['text'] = ''
  if (defect === 'duplicate id') blocks[1]!['id'] = blocks[0]!['id']
  if (defect === 'named rule gone') blocks.pop()
  if (defect === 'second record') {
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: { kind: 'module', title: 'Second made up chapter record', summary: 'A duplicate chapter for a test.', data: { state: 'active', parts: [], extra: { chapter: N }, summaryBlocks: blocks } } })
    expect(made.statusCode, made.body).toBe(201)
  } else {
    const before = snapshot()
    const patched = await app.inject({ method: 'PATCH', url: `/api/records/${held.record}`, headers: person, payload: { dataPatch: { summaryBlocks: blocks } } })
    if (defect === 'no text' || defect === 'duplicate id') {
      expect(patched.statusCode, patched.body).toBe(400); expect(snapshot()).toBe(before)
      // These two shapes are already refused by the general door. Model an older corrupt office explicitly.
      db.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.summaryBlocks', json(?)) WHERE id = ?").run(JSON.stringify(blocks), held.record)
    } else expect(patched.statusCode, patched.body).toBe(200)
  }
  const selected = await read(); expect(selected.inUse).toBe('shipped'); expect(selected.chapter).toEqual(selected.shipped); expect(selected.notUsed!.records).toContain(held.record); expect(selected.notUsed!.problems.length).toBeGreaterThan(0)
  const page = await app.inject({ url: '/api/office-regulations' }); expect(page.statusCode, page.body).toBe(200); expect(page.json().says).toContain(held.record)
  const { chapterAt, chapterNumbered } = await import('../src/server/lib/chapters.ts')
  expect(chapterAt(chapterNumbered(N)!, 'outline').text).toContain('uses the shipped content')
  const before = snapshot()
  if (defect === 'second record') { expect((await restore('shipped')).statusCode).toBe(400); expect(snapshot()).toBe(before) }
  const restored = await restore('shipped', defect === 'second record' ? { keep: held.record } : {})
  expect(restored.statusCode, restored.body).toBe(200); expect((await read()).inUse).toBe('stored'); expect((await read()).notUsed).toBeNull()
  if (defect === 'second record') {
    const deleted = db.client.sqlite.prepare("SELECT id FROM records WHERE deleted_at IS NOT NULL AND json_extract(data,'$.extra.chapter') = ?").get(N) as { id: string }
    const revisions = await app.inject({ url: `/api/records/${deleted.id}/revisions`, headers: person })
    expect(revisions.statusCode).toBe(200); expect(revisions.json().revisions.some((one: { op: string }) => one.op === 'delete')).toBe(true)
  }
})

it('refuses a chapter whose conclusion puts the actual run rules file inside the Codex headroom', async () => {
  N = 9
  expect((await apply(content())).statusCode).toBe(200)
  const next = content(); next.conclusion = 'Made up long conclusion. '.repeat(2000)
  const before = snapshot(), preview = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/preview', payload: { n: N, chapter: next } })
  expect(preview.statusCode).toBe(200); expect(preview.json().rulesFile.bytes).toBeGreaterThan(preview.json().rulesFile.most)
  expect(preview.json().problems.join(' ')).toContain('headroom')
  const refused = await apply(next); expect(refused.statusCode).toBe(400); expect(refused.json().error).toMatch(/Nothing was changed\.$/); expect(snapshot()).toBe(before)
})
