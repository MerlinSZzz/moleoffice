// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHAPTER'S ROLE MARK SURVIVES ITS SELECTION. A chapter record carrying `extra.forRole` is read by its role through the
 * card, and stays out of every run's standing load. So the selection door, the run's reader, the rules-file size check,
 * shipped recovery and Restore of a missing chapter each keep the mark (message SYgQGuu4kalC).
 *
 * Every chapter here is MADE-UP. No shipped chapter carries a mark today, so a stand-in for the shipped file marks two.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { AChapterWritten, ChapterContent, TheSelectedChapters } from '../src/shared/chapter-edit.ts'
import { chapterFromRecord, theEnglishHashOfAChapter, theEnglishHashOfARule, type ARecordAsRead } from '../src/shared/office-rules.ts'

const shipped = vi.hoisted(() => ({ role: 'worker', marked: [6, 8] }))
vi.mock('../src/server/lib/read-the-default-regulations.ts', async (original) => {
  const real = await original<typeof import('../src/server/lib/read-the-default-regulations.ts')>()
  return { ...real, readTheDefaultRegulations: () => real.readTheDefaultRegulations().map(chapter => shipped.marked.includes(chapter.n) ? { ...chapter, forRole: shipped.role } : chapter) }
})

let db: TestDb, app: FastifyInstance, address: string, scratch: string, person: Record<string, string>
beforeAll(async () => {
  db = await freshDb(); app = (await apiApp()).app; await app.ready()
  address = await app.listen({ port: 0, host: '127.0.0.1' })
  scratch = mkdtempSync(join(tmpdir(), 'mole-chapter-role-mark-'))
  mkdirSync(join(scratch, 'src/config/rules'), { recursive: true })
  person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() }
}, 60_000)
afterAll(async () => { await app.close(); db.close(); rmSync(scratch, { recursive: true, force: true }) })

function made(n: number, who: string): ChapterContent {
  return {
    label: `MADE-UP ${who} chapter ${String(n)}`, title: `MADE-UP rules for chapter ${String(n)}`, conclusion: `MADE-UP conclusion of chapter ${String(n)}: read it before the made-up work.`,
    zh: { label: `测试章节 ${String(n)}`, title: `测试规章 ${String(n)}`, conclusion: `测试结论 ${String(n)}。` },
    rules: [{ id: 'r-1', heading: `MADE-UP rule of chapter ${String(n)}`, text: `MADE-UP work of chapter ${String(n)} is recorded.`, zh: { heading: `测试条文 ${String(n)}`, text: `测试工作 ${String(n)} 已记录。` } }],
  }
}
async function selected(): Promise<TheSelectedChapters> { return (await app.inject({ url: '/api/office-regulations/chapters', headers: person })).json() }
async function apply(n: number, chapter: ChapterContent): Promise<AChapterWritten> {
  const written = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers: person, payload: { n, version: null, because: 'MADE-UP chapter for the role mark', chapter } })
  expect(written.statusCode, written.body).toBe(200)
  return written.json()
}
const pointer = (chapter: { label: string; conclusion: string }) => `- **${chapter.label}** — ${chapter.conclusion}`
/** The chapters a run reads from the door, and the AGENTS.md it writes from them. */
async function theRunsFile() {
  const { chaptersSelectedForRun, writeRulesInto } = await import('../src/worker/rules.ts')
  const chapters = chaptersSelectedForRun(await selected(), process.cwd())
  const written = writeRulesInto(scratch, process.cwd(), 'AGENTS.md', chapters)
  return { chapters, text: readFileSync(join(scratch, 'AGENTS.md'), 'utf8'), bytes: written.bytes }
}

it('a stored chapter marked for a role keeps its mark from the door to the run, and stays out of the run’s AGENTS.md', async () => {
  const shared = made(1, 'shared'), role = made(10, 'inspector')
  await apply(1, shared)
  const filed = await apply(10, role)
  const marked = await app.inject({ method: 'PATCH', url: `/api/records/${filed.record!}`, headers: person, payload: { dataPatch: { extra: { chapter: 10, forRole: 'inspector' } } } })
  expect(marked.statusCode, marked.body).toBe(200)
  const choice = await selected()
  expect(choice.chapters.find(one => one.n === 10)).toMatchObject({ inUse: 'stored', forRole: 'inspector' })
  expect(choice.chapters.find(one => one.n === 1)).not.toHaveProperty('forRole')
  const run = await theRunsFile()
  expect(run.chapters.find(one => one.n === 10)).toHaveProperty('forRole', 'inspector')
  expect(run.chapters.find(one => one.n === 1)).not.toHaveProperty('forRole')
  expect(run.text).toContain(pointer(shared))
  expect(run.text).not.toContain(role.label)
  expect(run.text).not.toContain(role.conclusion)
})

it('the size check measures the file the run writes, with the marked chapter left out', async () => {
  const run = await theRunsFile(), choice = await selected()
  for (const n of [1, 10]) {
    const preview = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/preview', headers: person, payload: { n, chapter: choice.chapters.find(one => one.n === n)!.chapter } })
    expect(preview.statusCode, preview.body).toBe(200)
    expect(preview.json().rulesFile, `the preview of chapter ${String(n)}`).toEqual({ bytes: run.bytes, most: expect.any(Number) })
  }
})

/** The exporter, run as its own process against this office, writing into the scratch folder. */
async function exporter() {
  const child = spawn(process.execPath, ['tools/rules-chapters.mjs', '--api', address, '--output', scratch], { cwd: process.cwd(), env: { ...process.env, MOLE_OFFICE_API: address, MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_AGENT: 'made-up-export-reader', MOLE_OFFICE_SESSION: '', MOLE_AGENT_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''; child.stdout.on('data', bytes => { output += String(bytes) }); child.stderr.on('data', bytes => { output += String(bytes) })
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  return { code, output }
}
/** Give a stored chapter its neutral twins, which the default set is made from, with the twin's conclusion as given. Each twin's Chinese names the twin's own English. */
async function twins(n: number, conclusion: string) {
  const id = (await selected()).chapters.find(one => one.n === n)!.record!
  const record = (await app.inject({ url: `/api/records/${id}`, headers: person })).json().record as ARecordAsRead & { data: { summaryBlocks: { heading: string; text: string }[] } }
  const chapter = chapterFromRecord(record)!
  const summaryBlocks = record.data.summaryBlocks.map(block => ({ ...block, neutral: { heading: block.heading, text: block.text, zh: { heading: '测试中性条文', text: '测试中性工作。', from: theEnglishHashOfARule({ name: block.heading, text: block.text }) }, zhFrom: 'written for the default set', from: theEnglishHashOfARule({ name: block.heading, text: block.text }) } }))
  const neutral = { label: chapter.label, title: chapter.title, conclusion, context: 'MADE-UP context of the default chapter.', zh: { label: '测试中性章节', title: '测试中性规章', conclusion: '测试中性结论。', from: theEnglishHashOfAChapter({ title: chapter.title, conclusion, label: chapter.label }) }, from: theEnglishHashOfAChapter(chapter) }
  const written = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: person, payload: { dataPatch: { summaryBlocks, neutral } } })
  expect(written.statusCode, written.body).toBe(200)
}

it('the default export’s size check leaves the marked chapter out, as the run’s file does', async () => {
  // Counted, this conclusion alone would take the run's file past the 32,256 bytes it must stay under.
  const long = 'MADE-UP duty of the role chapter, read only through its card. '.repeat(500)
  await twins(1, made(1, 'shared').conclusion)
  await twins(10, long)
  const exported = await exporter()
  expect(exported.code, exported.output).toBe(0)
  const written = JSON.parse(readFileSync(join(scratch, 'src/config/rules/default-regulations.json'), 'utf8')) as { chapters: { n: number; forRole?: string; conclusion: string }[] }
  expect(written.chapters.map(one => one.n)).toEqual([1, 10])
  expect(written.chapters[1]).toMatchObject({ forRole: 'inspector', conclusion: long })
})

it('shipped recovery reads the shipped chapter’s mark, in the door’s answer, its records and the run', async () => {
  const filed = await apply(6, made(6, 'recovered'))
  const broken = await app.inject({ method: 'PATCH', url: `/api/records/${filed.record!}`, headers: person, payload: { dataPatch: { summaryBlocks: [] } } })
  expect(broken.statusCode, broken.body).toBe(200)
  const choice = await selected(), six = choice.chapters.find(one => one.n === 6)!
  expect(six).toMatchObject({ inUse: 'shipped', forRole: shipped.role })
  const extra = (one: { data: unknown }) => (one.data as { extra: { chapter: number } }).extra
  expect(extra(choice.records!.find(one => extra(one).chapter === 6)!)).toEqual({ chapter: 6, forRole: shipped.role })
  const run = await theRunsFile()
  expect(run.chapters.find(one => one.n === 6)).toHaveProperty('forRole', shipped.role)
  expect(run.text).not.toContain(pointer(six.chapter!))
})

it('Restore of a missing chapter from the shipped files writes the shipped chapter’s mark on the new record', async () => {
  expect((await selected()).chapters.find(one => one.n === 8)).toMatchObject({ inUse: 'none', record: null })
  const restore = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/restore', headers: person, payload: { n: 8, version: null, because: 'MADE-UP restore of a missing marked chapter', from: 'shipped' } })
  expect(restore.statusCode, restore.body).toBe(200)
  const written = restore.json() as AChapterWritten
  expect(written).toMatchObject({ inUse: 'stored', forRole: shipped.role })
  const record = await app.inject({ url: `/api/records/${written.record!}`, headers: person })
  expect(record.json().record.data.extra).toEqual({ chapter: 8, forRole: shipped.role })
  const run = await theRunsFile()
  expect(run.chapters.find(one => one.n === 8)).toHaveProperty('forRole', shipped.role)
  expect(run.text).not.toContain(pointer(written.chapter!))
})

it('the run’s reader stops on a role mark that is not a role name', async () => {
  const { chaptersSelectedForRun } = await import('../src/worker/rules.ts')
  const invalid = structuredClone(await selected()) as unknown as { chapters: { n: number; forRole?: unknown }[] }
  invalid.chapters.find(one => one.n === 10)!.forRole = 7
  expect(() => chaptersSelectedForRun(invalid, process.cwd())).toThrow('chapter 10 is not a role name')
})
