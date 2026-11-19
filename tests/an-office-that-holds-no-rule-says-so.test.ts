// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OFFICE THAT HOLDS NO RULE A READER NAMES SAYS SO, AND NAMES NO OTHER OFFICE'S. Item 1 of the line "the shipped
 * rules are general" (wave 13w).
 *
 * The brief reads chapter 7 rule r-8 (a question from the person) and chapter 9 rule r-8 (what the end of a
 * conversation would lose), and a check quotes chapter 7 rule r-8 when it asks for the trace of each change. Each
 * reads them by id from the office's own chapter records. An office's owner may change those records, so an office
 * can hold no chapter at all, or a chapter 7 with no rule r-8. Until wave 13w the three read the export of the
 * office this repository is developed in, which always held them, and a check whose rule was missing failed with an
 * internal error.
 *
 * A present stored chapter missing a code-named rule now reads explicit shipped recovery. Its record and
 * missing rule are named in every reader; a truly absent chapter remains absent.
 *
 * WHAT THE EARLIER CRITERION PROVED. In an office with no chapter record, and then in one whose chapters 7 and 9 hold no rule
 * r-8, the brief says which is missing and points at GET /api/office-regulations, and a check is still assembled:
 * its trace section says which is missing, quotes no rule, and still asks for the trace. Nothing names CODE.md.
 *
 * GET /api/after-a-compaction is read in both offices as well. The worker's card names the chapters to read. With none of
 * them held, and then with only chapter 9 held, the reply names the missing chapters in the plural form of its
 * sentence ("so they are not listed"). The other test of that sentence reaches only the singular. With none held,
 * the reply still says the chapters come from the role card: the card names them, and the office holds none of
 * them. The reply names no CLAUDE.md, which no install carries.
 *
 * MUTATIONS (each after a green control run, then restored), run on 13 October 2026:
 *   - `assembleTheInspectorsPrompt` in src/server/lib/inspection.ts throws again when the rule is missing. The two
 *     check cases go red.
 *   - `theRuleWithTheId` in src/server/lib/chapters.ts reads the export when the office holds no such rule. Every
 *     case goes red.
 *   - `everyChapterAtItsName` in src/server/lib/chapters.ts gives an empty list again for an office that holds no
 *     chapter. The second case goes red.
 *   - the sentence of `whatComesBackAfterACompaction` in src/server/lib/after-a-compaction.ts says "it is" for any
 *     number of missing chapters. The third and the last case go red.
 *   - that sentence says again that neither the registration nor the card names a chapter whenever no chapter is
 *     listed. The third case goes red.
 *   - `WHERE_THE_WHOLE_RULES_ARE` in the same file names CLAUDE.md again. The third case goes red.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const DECLARED = JSON.parse(readFileSync(new URL('../src/config/roles.json', import.meta.url), 'utf8')) as { cards: { name: string; mustRead: { chapters: { chapter: number }[] } }[] }
const WORKER_CHAPTERS = DECLARED.cards.find((card) => card.name === 'worker')!.mustRead.chapters.map((one) => one.chapter).sort((a, b) => a - b)

const WORKSPACE = 'default'
const WORKER = 'no-rule-worker'
const actor = { type: 'agent' as const, id: WORKER }
const asTheWorker = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': WORKER,
}

/** A made-up set whose chapters 7 and 9 hold rules r-1 to r-7 and no rule r-8, in the default set's shape. */
function aSetWithNoRuleEight() {
  return {
    chapters: [7, 9].map((n) => ({
      n,
      label: `Test chapter ${String(n)}`,
      title: `What test chapter ${String(n)} governs`,
      conclusion: `The conclusion of test chapter ${String(n)}.`,
      context: `Why test chapter ${String(n)} exists in this world.`,
      outline: Array.from({ length: 7 }, (_, i) => ({
        id: `r-${String(i + 1)}`,
        name: `Test rule ${String(n)} point ${String(i + 1)}`,
        text: `The words of test rule ${String(n)} point ${String(i + 1)}, written for this world.`,
        zh: { name: `测试规则 ${String(n)}.${String(i + 1)}`, text: `测试规则 ${String(n)}.${String(i + 1)} 的文字。` },
        zhFrom: 'written for the default set',
      })),
      zh: { label: `测试第 ${String(n)} 章`, title: `测试第 ${String(n)} 章管什么`, conclusion: `测试第 ${String(n)} 章的结论。` },
    })),
  }
}

let t: TestDb
let app: FastifyInstance
let lib: typeof import('../src/server/lib/inspection.ts')
let scratch = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  lib = await import('../src/server/lib/inspection.ts')
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-no-rule-'))
  const starter = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...asTheWorker, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { handle: 'no-rule-starter', name: 'Synthetic starter' },
  })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...asTheWorker, 'x-mole-office-actor-id': 'no-rule-starter' },
    payload: { handle: WORKER, name: 'Synthetic worker', workArea: [] },
  })
  expect(worker.statusCode, worker.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  rmSync(scratch, { recursive: true, force: true })
})

/** The brief the worker is given, its opening and its rule for a question. */
async function theBrief(): Promise<{ head: string; aQuestionFromThePerson: { found: boolean; says?: string } }> {
  const reply = await app.inject({ method: 'GET', url: '/api/brief', headers: asTheWorker })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { head: string; aQuestionFromThePerson: { found: boolean; says?: string } }
}

/** The rules part of what the worker is given back after a compaction. */
async function theRulesAfterACompaction(): Promise<{ chapters: { n: number }[]; from: string | null; says: string; whereTheWholeIs: string }> {
  const reply = await app.inject({ method: 'GET', url: '/api/after-a-compaction', headers: asTheWorker })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { rules: { chapters: { n: number }[]; from: string | null; says: string; whereTheWholeIs: string } }).rules
}

/** The prompt a check of one finished run is given, whole and its trace section. */
async function aCheckOfAFinishedRun(): Promise<{ prompt: string; trace: string }> {
  const note = t.api.createRecord({ kind: 'note', title: 'Synthetic note the run wrote', workspaceId: WORKSPACE, actor, origin: 'fixture', data: {} })
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run to check',
    workspaceId: WORKSPACE,
    actor,
    origin: 'fixture',
    data: { state: 'running', servingAgent: WORKER, cutFrom: 'main', submission: { kind: 'records', records: [note.id] } },
  }).id
  t.api.patchRecord(note.id, { title: `Written by the run: ${note.id}` }, { ...actor, sessionId: run })
  const finished = await app.inject({ method: 'PATCH', url: '/api/records/' + run, headers: asTheWorker, payload: { dataPatch: { state: 'finished' } } })
  expect(finished.statusCode, finished.body).toBe(200)
  const prompt = lib.assembleTheInspectorsPrompt({ reads: lib.whatTheInspectorReads(run, WORKSPACE), changes: lib.changesInTheWorkArea([], []), workspaceId: WORKSPACE })
  expect(prompt.text).not.toContain('CODE.md')
  const section = prompt.text.split('## Trace each change to the person')[1]?.split('\n\n---')[0]
  expect(section, 'the prompt has no trace section').toBeDefined()
  return { prompt: prompt.text, trace: section! }
}

describe('an office that holds no rule a reader names says so', () => {
  it('the brief of an office with no chapter says it holds no chapter 7 and no chapter 9, and names no other office', async () => {
    const brief = await theBrief()
    expect(brief.aQuestionFromThePerson.found).toBe(false)
    expect(brief.aQuestionFromThePerson.says).toContain("This office's regulations hold no chapter 7")
    expect(brief.aQuestionFromThePerson.says).toContain('GET /api/office-regulations')
    expect(brief.head).toContain("This office's regulations hold no chapter 9")
    expect(`${brief.head}\n${brief.aQuestionFromThePerson.says ?? ''}`).not.toContain('CODE.md')
  })

  it('a check in an office with no chapter is assembled, says it holds no chapter 7 and no chapter at all, and still asks for the trace', async () => {
    const { prompt, trace } = await aCheckOfAFinishedRun()
    expect(trace).toContain("This office's regulations hold no chapter 7, so no rule is quoted here.")
    expect(trace).not.toMatch(/Chapter 7 rule \d+:/u)
    expect(trace).toContain('`traced`')
    // THE LIST OF EVERY CHAPTER AT ITS NAME says in a sentence that the office holds none, not an empty list.
    expect(prompt).toContain('This office holds no chapter of its regulations.')
  })

  it('after a compaction in an office with no chapter, the reply names every chapter of the card as missing, in the plural', async () => {
    const rules = await theRulesAfterACompaction()
    expect(rules.chapters).toEqual([])
    expect(rules.from).toBe('the role card')
    expect(rules.says).toBe(`The chapters to read come from the role card. This office's regulations hold no chapter ${WORKER_CHAPTERS.join(', ')}, so they are not listed.`)
    expect(rules.whereTheWholeIs).toContain('GET /api/office-regulations')
    expect(rules.whereTheWholeIs).toContain('src/config/rules/USER.md')
    expect(rules.whereTheWholeIs, 'no install carries CLAUDE.md').not.toContain('CLAUDE.md')
  })

  it('with stored chapters 7 and 9 missing r-8, every reader uses shipped content and names the stored problem', async () => {
    // Broken stored records are made through the general door; the checked default copier refuses them.
    const headers = { ...asTheWorker, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
    const ids: string[] = []
    for (const chapter of aSetWithNoRuleEight().chapters) {
      const made = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'module', title: chapter.title, summary: chapter.conclusion, data: { context: chapter.context, parts: [], extra: { chapter: chapter.n }, summaryBlocks: chapter.outline.map(rule => ({ id: rule.id, type: 'text', heading: rule.name, text: rule.text })) } } })
      expect(made.statusCode, made.body).toBe(201); const id = made.json().record.id as string; ids.push(id)
      const revision = (await app.inject({ url: `/api/records/${id}/revisions`, headers })).json().revisions[0]
      const label = await app.inject({ method: 'POST', url: `/api/records/${id}/short-forms`, headers, payload: { madeFrom: { seq: revision.seq, contentHash: revision.contentHash }, forms: { label: chapter.label } } }); expect(label.statusCode, label.body).toBe(200)
    }
    const selected = (await app.inject({ url: '/api/office-regulations/chapters', headers })).json()
    const page = (await app.inject({ url: '/api/office-regulations', headers })).json()
    const { chaptersSelectedForRun } = await import('../src/worker/rules.ts')
    const runChapters = chaptersSelectedForRun(selected, process.cwd())
    for (const n of [7, 9]) {
      const choice = selected.chapters.find((one: { n: number }) => one.n === n)
      expect(choice.inUse).toBe('shipped'); expect(choice.notUsed.records).toContain(ids[n === 7 ? 0 : 1])
      const shown = page.chapters.find((one: { n: number }) => one.n === n)
      expect(shown.id).toBe(`shipped-chapter-${String(n)}`)
      expect(runChapters.find(one => one.n === n)!.outline).toEqual(shown.outline.map(({ id, name, text }: { id: string; name: string; text: string }) => ({ id, name, text })))
    }

    const brief = await theBrief()
    expect(brief.aQuestionFromThePerson.found).toBe(true)
    expect(brief.head).toContain('Chapter 7 needs rule r-8, which the code reads.')
    expect(brief.head).toContain('Chapter 9 needs rule r-8, which the code reads.')
    expect(brief.head).toContain('uses the shipped content')
    expect(brief.head).toContain('Stored records not used:')
    for (const id of ids) expect(brief.head).toContain(id)

    const { prompt, trace } = await aCheckOfAFinishedRun()
    expect(trace).toContain('Chapter 7 needs rule r-8, which the code reads.')
    expect(trace).toContain('uses the shipped content')
    expect(trace).toContain('Stored records not used:')
    expect(trace).toContain('`traced`')
    expect(prompt).not.toContain('This office holds no chapter of its regulations.')

    // The office now holds chapter 9, so the remaining chapters the worker card names are missing.
    const rules = await theRulesAfterACompaction()
    expect(rules.chapters.map((one) => one.n)).toEqual([9])
    expect(rules.says).toContain(`The chapters to read come from the role card. This office's regulations hold no chapter ${WORKER_CHAPTERS.filter((n) => n !== 9).join(', ')}, so they are not listed.`)
    expect(rules.says).toContain('Chapter 9 needs rule r-8, which the code reads.')
    expect(rules.says).toContain('uses the shipped content')
  })
})
