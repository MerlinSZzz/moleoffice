// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CHAPTER IS CHANGED AND EXPORTED UNDER ITS OWN NUMBER.
 *
 * The office uses a stored chapter under a number the shipped file lacks when its `extra.forRole` names a role card. The
 * chapter door and the export tool must then accept that number too. Each checks a chapter against the numbers the
 * office selected, which are the shipped ones and the role chapters, and not against the shipped numbers alone. So the
 * person can preview, apply and restore a role chapter on the regulations page, and the export writes it into the
 * chapters file and the default set, with its role mark.
 *
 * Every chapter here is MADE-UP. Chapter 17 is a number the shipped file lacks. This office copied no defaults, so
 * chapter 17 is the one stored chapter, and the default set the export makes holds it alone.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { AChaptersHistory, ChapterContent, SelectedChapter, TheSelectedChapters } from '../src/shared/chapter-edit.ts'
import { chapterFromRecord, theEnglishHashOfAChapter, theEnglishHashOfARule, type ARecordAsRead } from '../src/shared/office-rules.ts'

const N = 17, ROLE = 'worker'
const THE_CHAPTERS = '/api/office-regulations/chapters'
let db: TestDb, app: FastifyInstance, address: string, scratch: string, person: Record<string, string>
beforeAll(async () => {
  db = await freshDb(); app = (await apiApp()).app; await app.ready()
  address = await app.listen({ port: 0, host: '127.0.0.1' })
  scratch = mkdtempSync(join(tmpdir(), 'mole-role-chapter-door-'))
  mkdirSync(join(scratch, 'src/config/rules'), { recursive: true })
  person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() }
}, 60_000)
afterAll(async () => { await app.close(); db.close(); rmSync(scratch, { recursive: true, force: true }) })

async function read(): Promise<SelectedChapter | undefined> {
  const reply = await app.inject({ url: THE_CHAPTERS, headers: person })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as TheSelectedChapters).chapters.find(one => one.n === N)
}
async function history(): Promise<AChaptersHistory> {
  const reply = await app.inject({ url: `${THE_CHAPTERS}/${String(N)}/history`, headers: person })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json()
}
const filedRule = { id: 'r-1', type: 'text', heading: 'A MADE-UP rule of the role chapter', text: 'MADE-UP work of the role chapter is recorded.' }
const edited: ChapterContent = {
  label: 'A MADE-UP role chapter', title: 'MADE-UP rules for the role chapter', conclusion: 'MADE-UP conclusion: read it before the made-up role work.',
  zh: { label: '测试角色章节', title: '测试角色规章', conclusion: '测试结论：做测试角色工作之前读它。' },
  rules: [{ id: 'r-1', heading: 'A MADE-UP edited rule of the role chapter', text: 'MADE-UP edited work of the role chapter is recorded.', zh: { heading: '测试修改后的条文', text: '测试修改后的工作已记录。' } }],
}

/** File MADE-UP chapter 17 for a role card through the records, the one door that files a new number, with its label. */
async function fileTheRoleChapter() {
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: {
    kind: 'module', title: 'MADE-UP role chapter', summary: 'MADE-UP conclusion of the role chapter: read it before the made-up work.',
    data: { state: 'active', parts: [], extra: { chapter: N, forRole: ROLE }, summaryBlocks: [filedRule] },
  } })
  expect(made.statusCode, made.body).toBe(201)
  const id = made.json().record.id as string
  const revisions = (await app.inject({ url: `/api/records/${id}/revisions`, headers: person })).json().revisions as { seq: number; contentHash: string }[]
  const newest = revisions.reduce((a, b) => (b.seq > a.seq ? b : a))
  const labelled = await app.inject({ method: 'POST', url: `/api/records/${id}/short-forms`, headers: person, payload: { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: 'A MADE-UP filed role chapter' } } })
  expect(labelled.statusCode, labelled.body).toBe(200)
  return id
}

it('previews, applies and restores MADE-UP role chapter 17 through the chapter door, and its role mark stays', async () => {
  const id = await fileTheRoleChapter()
  const filed = await read()
  expect(filed).toMatchObject({ inUse: 'stored', record: id, forRole: ROLE })
  const beforeTheEdit = (await history()).versions[0]!.seq

  const preview = await app.inject({ method: 'POST', url: `${THE_CHAPTERS}/preview`, headers: person, payload: { n: N, chapter: edited } })
  expect(preview.statusCode, preview.body).toBe(200)
  expect(preview.json().problems).toEqual([])
  const applied = await app.inject({ method: 'POST', url: THE_CHAPTERS, headers: person, payload: { n: N, version: filed!.version, because: 'MADE-UP edit of the role chapter', chapter: edited } })
  expect(applied.statusCode, applied.body).toBe(200)
  const afterTheEdit = await read()
  expect(afterTheEdit).toMatchObject({ inUse: 'stored', record: id, forRole: ROLE, chapter: edited })

  const restorePreview = await app.inject({ method: 'POST', url: `${THE_CHAPTERS}/preview`, headers: person, payload: { n: N, from: beforeTheEdit } })
  expect(restorePreview.statusCode, restorePreview.body).toBe(200)
  expect(restorePreview.json().problems).toEqual([])
  const restored = await app.inject({ method: 'POST', url: `${THE_CHAPTERS}/restore`, headers: person, payload: { n: N, version: afterTheEdit!.version, because: 'MADE-UP restore of the role chapter', from: beforeTheEdit } })
  expect(restored.statusCode, restored.body).toBe(200)
  const back = await read()
  expect(back).toMatchObject({ inUse: 'stored', record: id, forRole: ROLE })
  expect(back!.chapter!.rules.map(rule => ({ heading: rule.heading, text: rule.text }))).toEqual([{ heading: filedRule.heading, text: filedRule.text }])
})

/** The exporter, run as its own process against this office, writing into the scratch folder. */
async function exporter() {
  const child = spawn(process.execPath, ['tools/rules-chapters.mjs', '--api', address, '--output', scratch], { cwd: process.cwd(), env: { ...process.env, MOLE_OFFICE_API: address, MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_AGENT: 'made-up-export-reader', MOLE_OFFICE_SESSION: '', MOLE_AGENT_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''; child.stdout.on('data', bytes => { output += String(bytes) }); child.stderr.on('data', bytes => { output += String(bytes) })
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  return { code, output }
}

it('the export writes MADE-UP role chapter 17 into the chapters file and the default set, with its role mark', async () => {
  // The default set is made from each rule's neutral twin, so the role chapter is given its twins first. Each twin's
  // Chinese names the twin's own English.
  const id = (await read())!.record!
  const record = (await app.inject({ url: `/api/records/${id}`, headers: person })).json().record as ARecordAsRead & { data: { summaryBlocks: { heading: string; text: string }[] } }
  const chapter = chapterFromRecord(record)!
  const summaryBlocks = record.data.summaryBlocks.map(block => ({ ...block, neutral: { heading: block.heading, text: block.text, zh: { heading: '测试中性条文', text: '测试中性工作。', from: theEnglishHashOfARule({ name: block.heading, text: block.text }) }, zhFrom: 'written for the default set', from: theEnglishHashOfARule({ name: block.heading, text: block.text }) } }))
  const neutral = { label: chapter.label, title: chapter.title, conclusion: chapter.conclusion, context: 'MADE-UP context of the role chapter.', zh: { label: '测试中性章节', title: '测试中性规章', conclusion: '测试中性结论。', from: theEnglishHashOfAChapter(chapter) }, from: theEnglishHashOfAChapter(chapter) }
  const twinned = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: person, payload: { dataPatch: { summaryBlocks, neutral } } })
  expect(twinned.statusCode, twinned.body).toBe(200)

  const exported = await exporter()
  expect(exported.code, exported.output).toBe(0)
  const chapters = JSON.parse(readFileSync(join(scratch, 'src/config/rules/chapters.json'), 'utf8')) as { chapters: { n: number; forRole?: string }[] }
  expect(chapters.chapters.map(one => ({ n: one.n, forRole: one.forRole }))).toEqual([{ n: N, forRole: ROLE }])
  const defaults = JSON.parse(readFileSync(join(scratch, 'src/config/rules/default-regulations.json'), 'utf8')) as { chapters: { n: number; forRole?: string }[] }
  expect(defaults.chapters.map(one => ({ n: one.n, forRole: one.forRole }))).toEqual([{ n: N, forRole: ROLE }])
})
