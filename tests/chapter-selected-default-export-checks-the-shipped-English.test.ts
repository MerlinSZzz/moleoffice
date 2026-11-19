// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theEnglishHashOfAChapter, theEnglishHashOfARule } from '../src/shared/office-rules.ts'
import type { ChapterContent, TheSelectedChapters } from '../src/shared/chapter-edit.ts'
let db: TestDb, app: FastifyInstance, address: string, scratch: string
beforeAll(async () => {
  db = await freshDb(); app = (await apiApp()).app; await app.ready(); address = await app.listen({ port: 0, host: '127.0.0.1' })
  scratch = mkdtempSync(join(tmpdir(), 'mole-selected-default-export-')); mkdirSync(join(scratch, 'src/config/rules'), { recursive: true })
  const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() }
  const chapter: ChapterContent = { label: 'Made up neutral', title: 'Rules for a made up neutral office', conclusion: 'Read these made up neutral rules first.', zh: { label: '测试中性规章', title: '测试中性办公室的规章', conclusion: '先读测试中性规章。' }, rules: [{ id: 'r-1', heading: 'A made up neutral rule', text: 'The made up neutral words.', zh: { heading: '测试中性条文', text: '测试中性文字。' } }] }
  const made = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers: person, payload: { n: 1, version: null, because: 'Made up stored neutral chapter', chapter } }); expect(made.statusCode, made.body).toBe(200)
  const record = db.api.getRecord(made.json().record)!, blocks = record.data['summaryBlocks'] as Record<string, unknown>[]
  blocks[0]!['neutral'] = { heading: chapter.rules[0]!.heading, text: chapter.rules[0]!.text, zh: { ...chapter.rules[0]!.zh!, from: theEnglishHashOfARule({ name: chapter.rules[0]!.heading, text: chapter.rules[0]!.text }) }, zhFrom: 'written for the default set', from: theEnglishHashOfARule({ name: chapter.rules[0]!.heading, text: chapter.rules[0]!.text }) }
  const neutral = { label: chapter.label, title: chapter.title, conclusion: chapter.conclusion, context: 'Made up neutral context.', zh: { ...chapter.zh!, from: theEnglishHashOfAChapter(chapter) }, from: theEnglishHashOfAChapter(chapter) }
  const twins = await app.inject({ method: 'PATCH', url: `/api/records/${record.id}`, headers: person, payload: { dataPatch: { neutral, summaryBlocks: blocks } } }); expect(twins.statusCode, twins.body).toBe(200)
  const bad = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: { kind: 'module', title: 'A made up broken default source', summary: 'This invented chapter has no rules.', data: { state: 'active', parts: [], extra: { chapter: 7 }, summaryBlocks: [] } } }); expect(bad.statusCode).toBe(201)
}, 60_000)
afterAll(async () => { await app.close(); db.close(); rmSync(scratch, { recursive: true, force: true }) })
async function exporter(api: string) {
  const child = spawn(process.execPath, ['tools/rules-chapters.mjs', '--api', api, '--output', scratch], { env: { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_SESSION: '', MOLE_OFFICE_AGENT: 'made-up-default-reader', MOLE_AGENT_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''; child.stdout.on('data', bytes => { output += String(bytes) }); child.stderr.on('data', bytes => { output += String(bytes) })
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) }); return { code, output }
}
const snapshot = () => JSON.stringify(['CLAUDE.md', 'chapters.json', 'CODE.md', 'default-regulations.json'].map(file => readFileSync(join(scratch, file === 'CLAUDE.md' ? file : 'src/config/rules/' + file), 'utf8')))

it('combines a stored neutral twin with the matching shipped default, including its Chinese, and omits absent chapters', async () => {
  const result = await exporter(address); expect(result.code, result.output).toBe(0)
  const made = JSON.parse(readFileSync(join(scratch, 'src/config/rules/default-regulations.json'), 'utf8'))
  const shipped = JSON.parse(readFileSync('src/config/rules/default-regulations.json', 'utf8')).chapters.find((one: { n: number }) => one.n === 7)
  expect(made.chapters.map((one: { n: number }) => one.n)).toEqual([1, 7]); expect(made.chapters[1]).toEqual(shipped)
  expect(made.chapters[0].label).toBe('Made up neutral'); expect(result.output).toContain('uses shipped neutral English, with no Chinese')
})

it('refuses every differing English part before writing any export and names the first differing part', async () => {
  const original = (await app.inject({ url: '/api/office-regulations/chapters' })).json() as TheSelectedChapters
  for (const field of ['label', 'title', 'conclusion', 'id', 'heading', 'text', 'present']) {
    const bad = structuredClone(original), choice = bad.chapters.find(one => one.n === 7)!, record = bad.records!.find(one => one.id === 'shipped-chapter-7')!, data = record.data as Record<string, unknown>, blocks = data['summaryBlocks'] as Record<string, unknown>[]
    if (field === 'label') { choice.chapter!.label += ' mismatch'; (data['shortForms'] as { label: { text: string } }).label.text = choice.chapter!.label }
    else if (field === 'title') { choice.chapter!.title += ' mismatch'; record.title = choice.chapter!.title }
    else if (field === 'conclusion') { choice.chapter!.conclusion += ' mismatch'; record.summary = choice.chapter!.conclusion }
    else if (field === 'present') { choice.chapter!.rules.push({ id: 'r-999', heading: 'Made up extra rule', text: 'Made up extra words.', zh: null }); blocks.push({ id: 'r-999', type: 'text', heading: 'Made up extra rule', text: 'Made up extra words.' }) }
    else { const rule = choice.chapter!.rules[0]!; if (field === 'id') rule.id = 'r-999'; else rule[field as 'heading' | 'text'] += ' mismatch'; blocks[0]![field] = rule[field as 'id' | 'heading' | 'text'] }
    choice.shipped = structuredClone(choice.chapter!)
    const server = createServer((_req, reply) => { reply.setHeader('content-type', 'application/json'); reply.end(JSON.stringify(bad)) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const port = (server.address() as { port: number }).port, before = snapshot(), result = await exporter(`http://127.0.0.1:${String(port)}`)
      expect(result.code, result.output).toBe(1); expect(result.output).toContain('Chapter 7 from the office differs'); expect(result.output).toContain(field === 'present' ? 'being present' : field); expect(result.output).toContain('Nothing was written.'); expect(snapshot()).toBe(before)
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error))) }
  }
}, 60_000)
