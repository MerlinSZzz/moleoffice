// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { ChapterContent, TheSelectedChapters } from '../src/shared/chapter-edit.ts'

let db: TestDb, app: FastifyInstance, address: string, scratch: string, person: Record<string, string>
const EDITED = 'Made up rule: ask the lighthouse keeper before opening this room.'
const CONCLUSION = 'Made up conclusion: read this before opening the lighthouse room.'
beforeAll(async () => {
  db = await freshDb(); app = (await apiApp()).app; await app.ready()
  address = await app.listen({ port: 0, host: '127.0.0.1' })
  scratch = mkdtempSync(join(tmpdir(), 'mole-chapter-export-'))
  mkdirSync(join(scratch, 'src/config/rules'), { recursive: true })
  person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() }
}, 60_000)
afterAll(async () => { await app.close(); db.close(); rmSync(scratch, { recursive: true, force: true }) })
async function selected(): Promise<TheSelectedChapters> { return (await app.inject({ url: '/api/office-regulations/chapters', headers: person })).json() }
async function exporter(check = false) {
  const child = spawn(process.execPath, ['tools/rules-chapters.mjs', '--api', address, '--output', scratch, ...(check ? ['--check'] : [])], { cwd: process.cwd(), env: { ...process.env, MOLE_OFFICE_API: address, MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_AGENT: 'made-up-export-reader', MOLE_OFFICE_SESSION: '', MOLE_AGENT_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''; child.stdout.on('data', bytes => { output += String(bytes) }); child.stderr.on('data', bytes => { output += String(bytes) })
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  return { code, output }
}

it('one Apply reaches the page, selection, starter, brief, exported rule text and the run conclusion', async () => {
  const first: ChapterContent = { label: 'Made up lighthouse', title: 'Rules for the made up lighthouse', conclusion: 'A made up starting conclusion.', zh: { label: '测试灯塔', title: '测试灯塔的规章', conclusion: '测试的初始结论。' }, rules: [{ id: 'r-8', heading: 'A made up question rule', text: 'A made up starting rule.', zh: { heading: '测试提问条文', text: '测试的初始条文。' } }] }
  const create = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers: person, payload: { n: 7, version: null, because: 'Made up initial chapter', chapter: first } })
  expect(create.statusCode, create.body).toBe(200)
  const next = structuredClone(first); next.conclusion = CONCLUSION; next.rules[0]!.text = EDITED
  const apply = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters', headers: person, payload: { n: 7, version: create.json().version, because: 'Made up common reader proof', chapter: next } })
  expect(apply.statusCode, apply.body).toBe(200)
  const choice = await selected(); expect(choice.chapters.find(one => one.n === 7)!.chapter!.rules[0]!.text).toBe(EDITED)
  const page = await app.inject({ url: '/api/office-regulations', headers: person }); expect(page.json().chapters[0].outline[0].text).toBe(EDITED)
  expect(page.json().chapters[0].zh).not.toBeNull(); expect(page.json().chapters[0].outline[0].zh).not.toBeNull()
  const starter = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle: 'made-up-chapter-reader', name: 'Made up chapter reader', role: 'worker', chapters: ['Made up lighthouse:outline'] } })
  expect(starter.statusCode, starter.body).toBe(201)
  expect(starter.json().chapters.named).toEqual([{ chapter: 7, level: 'outline' }])
  const { agentByHandle } = await import('../src/server/lib/participants.ts'), { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const agent = agentByHandle('made-up-chapter-reader')!
  const headers = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent.handle!, 'x-mole-office-key': makeAnAgentKey(agent.id, null) }
  const brief = await app.inject({ url: '/api/brief', headers }); expect(brief.statusCode, brief.body).toBe(200); expect(brief.body).toContain(EDITED)
  const compacted = await app.inject({ url: '/api/after-a-compaction', headers }); expect(compacted.statusCode, compacted.body).toBe(200); expect(compacted.body).toContain('Made up lighthouse')
  const { chaptersSelectedForRun, writeRulesInto } = await import('../src/worker/rules.ts')
  writeRulesInto(scratch, process.cwd(), 'AGENTS.md', chaptersSelectedForRun(choice, process.cwd()))
  expect(readFileSync(join(scratch, 'AGENTS.md'), 'utf8')).toContain(CONCLUSION)
  const exported = await exporter(); expect(exported.code, exported.output).toBe(0)
  expect(exported.output).toContain(choice.says + '\n')
  expect(readFileSync(join(scratch, 'src/config/rules/chapters.json'), 'utf8')).toContain(EDITED)
  expect(readFileSync(join(scratch, 'src/config/rules/CODE.md'), 'utf8')).toContain(EDITED)
  for (const file of ['src/config/rules/chapters.json', 'src/config/rules/CODE.md', 'CLAUDE.md', 'AGENTS.md']) {
    const english = readFileSync(join(scratch, file), 'utf8')
    expect(english, file).not.toMatch(/\p{Script=Han}/u); expect(english, file).not.toContain('"zh"')
  }
  expect(exported.output).toContain('this office holds none')
  const checked = await exporter(true); expect(checked.code, checked.output).toBe(0); expect(checked.output).toContain('this office holds none')
  const restore = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/restore', headers: person, payload: { n: 7, version: apply.json().version, because: 'Made up restore after export', from: 'shipped' } })
  expect(restore.statusCode, restore.body).toBe(200)
  // Corrupt only this invented office to prove the exporter names the shipped source in both modes.
  const record = restore.json().record
  const broken = await app.inject({ method: 'PATCH', url: `/api/records/${record}`, headers: person, payload: { dataPatch: { summaryBlocks: [] } } }); expect(broken.statusCode).toBe(200)
  const fallback = await exporter(); expect(fallback.code, fallback.output).toBe(0); expect(fallback.output).toContain('uses shipped neutral English, with no Chinese'); expect(fallback.output).toContain(record)
  expect(fallback.output).toContain((await selected()).says + '\n')
  const document = readFileSync(join(scratch, 'src/config/rules/CODE.md'), 'utf8')
  expect(document).toContain('The shipped chapter in src/config/rules/default-regulations.json'); expect(document).toContain(record); expect(document).not.toContain('`shipped-chapter-7`, in Mole Office')
  const fallbackCheck = await exporter(true); expect(fallbackCheck.code, fallbackCheck.output).toBe(0); expect(fallbackCheck.output).toContain(record)
}, 60_000)

it('the run reader refuses missing and invalid selected content instead of reading the checkout chapters', async () => {
  const { chaptersSelectedForRun } = await import('../src/worker/rules.ts')
  expect(() => chaptersSelectedForRun(null, process.cwd())).toThrow('GET /api/office-regulations/chapters')
  const choice = await selected(), invalid = structuredClone(choice)
  invalid.chapters.find(one => one.n === 7)!.chapter!.rules = []
  expect(() => chaptersSelectedForRun(invalid, process.cwd())).toThrow('has no rules')
  expect(() => chaptersSelectedForRun({ chapters: [] }, process.cwd())).toThrow('incomplete set')
})


it('a run cannot start when the chapter door does not answer, and the request carries that run key', async () => {
  const { startOne } = await import('../src/worker/index.ts')
  const requested: { path: string; headers: Headers }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    requested.push({ path, headers: new Headers(init.headers) })
    if (path === '/api/records') return new Response(JSON.stringify({ record: { id: 'made-up-starting-run' }, runKey: { key: 'made-up-test-run-key' } }), { status: 201 })
    if (path === '/api/brief') return new Response(JSON.stringify({ opening: 'Made up brief.' }))
    if (path.startsWith('/api/records/') && init?.method === 'PATCH') return new Response(JSON.stringify({ record: { id: path.slice('/api/records/'.length) } }), { status: 200 })
    return new Response('Made up unavailable chapter door', { status: 503 })
  })
  try {
    const waiting = { messageId: 'made-up-message', workspaceId: 'default', to: { kind: 'agent', id: 'made-up-reader' }, handle: 'made-up-reader', runtime: 'codex', model: 'made-up-model', body: 'Read this made up message.', sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, sentAt: '2026-10-14 05:00', resume: null, hops: 0 }
    const settings = { api: 'http://made-up-office.invalid', workspace: 'default', checkout: scratch, session: null, env: { PATH: '/usr/bin', MOLE_OFFICE_DB: db.file }, runs: 1, stopWithPid: null, hops: 4, outputRoot: scratch }
    const result = await startOne(waiting as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
    expect(result.ok).toBe(false)
    expect((result as { because: string }).because).toContain('GET /api/office-regulations/chapters')
    const chapterRequest = requested.find(one => one.path === '/api/office-regulations/chapters')!
    expect(chapterRequest.headers.get('x-mole-office-key')).toBe('made-up-test-run-key')
    expect(chapterRequest.headers.get('x-mole-office-actor-id')).toBe('made-up-reader')
  } finally { vi.unstubAllGlobals() }
})

it('run startup prints the exact selection notice before writing its real rules file', async () => {
  const choice = await selected(), rules = await import('../src/worker/rules.ts'), { startOne } = await import('../src/worker/index.ts')
  const events: string[] = [], realWriter = rules.writeRulesInto, destination = join(scratch, 'made-up-run')
  mkdirSync(destination)
  const writer = vi.spyOn(rules, 'writeRulesInto').mockImplementation((_cwd, checkout, file, chapters) => {
    events.push('writing-rules'); realWriter(destination, checkout, file, chapters)
    throw new Error('Made up stop after writing rules, before an adapter starts')
  })
  const output = vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { events.push(String(chunk)); return true })
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    if (path === '/api/records') return new Response(JSON.stringify({ record: { id: 'made-up-notice-run' }, runKey: { key: 'made-up-notice-key' } }), { status: 201 })
    if (path === '/api/brief') return new Response(JSON.stringify({ opening: 'Made up brief.' }))
    if (path.startsWith('/api/records/') && init?.method === 'PATCH') return new Response(JSON.stringify({ record: { id: path.slice('/api/records/'.length) } }), { status: 200 })
    if (path === '/api/office-regulations/chapters') return new Response(JSON.stringify(choice))
    return new Response('Made up unavailable door', { status: 503 })
  })
  try {
    const waiting = { messageId: 'made-up-notice-message', workspaceId: 'default', to: { kind: 'agent', id: 'made-up-reader' }, handle: 'made-up-reader', runtime: 'codex', model: 'made-up-model', body: 'Read these made up rules.', sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, sentAt: '2026-10-14 05:00', resume: null, hops: 0 }
    const settings = { api: 'http://made-up-office.invalid', workspace: 'default', checkout: process.cwd(), session: null, env: { PATH: '/usr/bin', MOLE_OFFICE_DB: db.file }, runs: 1, stopWithPid: null, hops: 4, outputRoot: scratch }
    const result = await startOne(waiting as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
    expect(result.ok).toBe(false); expect((result as { because: string }).because).toContain('Made up stop after writing rules')
    expect(events.indexOf(choice.says + '\n')).toBeGreaterThanOrEqual(0); expect(events.indexOf(choice.says + '\n')).toBeLessThan(events.indexOf('writing-rules'))
    const file = readFileSync(join(destination, 'AGENTS.md'), 'utf8')
    for (const chapter of choice.chapters) {
      if (chapter.inUse === 'none') expect(choice.says).toContain(`holds no chapter ${String(chapter.n)}`)
      for (const id of chapter.notUsed?.records ?? []) { expect(choice.says).toContain(id); expect(file).not.toContain(id) }
      if (chapter.chapter !== null) expect(file).toContain(chapter.chapter.conclusion)
    }
  } finally { writer.mockRestore(); output.mockRestore(); vi.unstubAllGlobals() }
})
