// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION CHANGE, WRITTEN WHERE THE TEST MEASURES IT, because the commit that made the change
 * (77bdda4d) did not say so in its own words.
 *
 * OLD WORDING (the owner's rule of 11 September 2026): a worker is retired the moment its work is handed
 * back, even while its check is still running; this file measured that by retiring a worker whose
 * run had already reported.
 *
 * NEW WORDING, from option A of proposal Dbo6FNK86ohz, which the owner chose: a retire is refused
 * while a check or a report of one of the worker's runs is still owed, and the refusal names what
 * is owed. This file now retires the worker while its run is still working, which
 * the decision allows, and measures the same question after that: the verdict must still reach the
 * retired worker's starter.
 *
 * WHY: a verdict that reached a retired worker used to be thrown away (nothing written, the run
 * left inspecting). Refusing the retire until the check has ended keeps the starter there to
 * receive it. The repair of this file landed in 2ce7e67b; this note records the change of
 * criterion as its own commit, and history is not rewritten.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
/** These historical inspection fixtures are explicitly inventoried; all existing verdict and mutation-detection assertions remain. */
/** Eligibility fixture update: the old run fixtures named no submitted tip. Runs meant to be checked now record cutFrom and the actual checkout HEAD. */
import { execFileSync as readFixtureGit } from 'node:child_process'
const fixtureTip = readFixtureGit('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
/**
 * THE INSPECTOR: WHAT IT READS, THE TWO MESSAGES IT WRITES, AND THE GROUP A REFUSAL OPENS.
 *
 * Criteria C19 to C23, C25 and C26 of design/rules/ACCEPTANCE.md: a run is checked, and when nothing is
 * wrong a message ends the subagent and returns its result to the main agent; the higher agent's context
 * stays clean, and checking is kept apart from work. Where a release is refused, a group is opened
 * with the worker and the agent above it, to talk it through.
 *
 * C19: *A release is two messages written in one act.*
 * C20: *The starter is told that a check happened and is not sent the check.* Measured in bytes.
 * C21: *A refusal names what is missing and which chapter or precedent says so, and the subagent's
 *      run continues.*
 * C22: *An inspector that fixes what it found fails the check.*
 * C23: *An inspector loads no chapter at `full` that the brief did not name.* Measured in bytes.
 * C25: *The inspector reads the changes through the work area the worker registered.*
 * C26: *A refusal opens a group holding the worker, its supervisor and the inspector.*
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { THE_PERSON } from '../src/shared/person.ts'
import { checkedAndReleased } from '../src/shared/releasing.ts'
import { SEVEN_RUNGS_NAMED } from '../src/shared/detail.ts'
import { LADDER, aChapterAtItsNameOnTheLadder } from '../src/shared/chapters.ts'

const SHIPPED_CHAPTERS = (JSON.parse(readFileSync(new URL('../src/config/rules/default-regulations.json', import.meta.url), 'utf8')) as { chapters: { n: number; forRole?: string; outline: { name: string }[] }[] }).chapters
const DEFAULT_CHAPTERS = SHIPPED_CHAPTERS.filter((one) => one.forRole === undefined).map((one) => one.n)

/**
 * C23'S TWO MADE-UP ROLE CHAPTERS ARE IN A STAND-IN FOR THE SHIPPED FILE. A role chapter reaches an office through the
 * shipped regulations file, and a stored chapter whose number that file does not hold is refused on purpose (the coordinator,
 * messages SYgQGuu4kalC and SPR69fB8ma93). Until carry round 3 of wave 13r the C23 case filed 42 and 43 as plain records,
 * which the chapter selection now refuses. The program reads the shipped file twice: the chapter check imports it, and
 * `readTheDefaultRegulations` reads it from disk. The stand-in replaces both, so the two agree as they do in an office.
 * The test office copies the stand-in at its first start, as a fresh office copies the shipped file. A label may not be
 * the opening of its own title, so each title is `The MADE-UP role N` and the label is `MADE-UP role N`.
 */
const roleChapters = vi.hoisted(() => ({
  file: '',
  added: ([[42, 'worker'], [43, 'inspector']] as const).map(([n, role]) => ({
    n, forRole: role, label: `MADE-UP role ${n}`, title: `The MADE-UP role ${n}`, conclusion: `MADE-UP duties ${n}.`, context: 'MADE-UP role rules.',
    outline: [{ id: 'r-1', name: `MADE-UP role rule ${n}`, text: `MADE-UP role work ${n}.`, zh: { name: `测试角色条文 ${n}`, text: `测试角色工作 ${n}。` }, zhFrom: 'written for the default set' }],
    zh: { label: `测试角色 ${n}`, title: `测试角色规章 ${n}`, conclusion: `测试角色职责 ${n}。` },
  })),
}))
vi.mock('../src/config/rules/default-regulations.json', async (original) => {
  const real = await original<{ default: { chapters: unknown[] } }>()
  return { ...real, default: { ...real.default, chapters: [...real.default.chapters, ...roleChapters.added] } }
})
vi.mock('../src/server/lib/default-regulations.ts', async (original) => {
  const real = await original<typeof import('../src/server/lib/default-regulations.ts')>()
  return {
    ...real,
    readTheDefaultRegulations: (file?: string, checkout?: string) => real.readTheDefaultRegulations(file ?? roleChapters.file, checkout),
    copyTheDefaultRegulationsOnce: (file?: string, checkout?: string) => real.copyTheDefaultRegulationsOnce(file ?? roleChapters.file, checkout),
  }
})

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

/** One rule of chapter 5, which the briefs below name, read from the shipped file the office copies. Its words prove the chapter was written out. */
const A_RULE_OF_CHAPTER_FIVE = SHIPPED_CHAPTERS.find((one) => one.n === 5)!.outline[0]!.name
/** One rule of chapter 1, which no brief below names, read from the shipped file the office copies. Its words prove the chapter was NOT. */
const A_RULE_OF_CHAPTER_ONE = SHIPPED_CHAPTERS.find((one) => one.n === 1)!.outline[0]!.name

const THE_AREA = ['src/server/lib', 'tools']

/** The office names the inspector and one worker are registered with. A sentence for a person names an agent by these. */
const THE_INSPECTORS_NAME = 'Inspector One'
const BUILDER_DS_NAME = 'Builder D'

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function fileARun(handle: string, title: string): Promise<string> {
  const run = historicalSession(t, { workspaceId: WORKSPACE, kind: 'session', title, actor: { type: 'agent', id: handle }, data: { state: 'finished', servingAgent: handle, cutFrom: 'main', tip: fixtureTip, doing: 'building the check' } }).id
  // Each inspector check begins with an assembly, before any edit it must detect.
  if (handle !== 'builder-nowhere') {
    const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent('inspector-one'), payload: { changes: [] } })
    expect(assembled.statusCode, assembled.body).toBe(201)
  }
  return run
}

async function fileAReport(handle: string, title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'report',
      title,
      summary: 'The check was built and every criterion has a test.',
      data: {
        blocks: [{ id: 'b-1', type: 'text', heading: 'What was done', text: 'The check was built.' }],
        for: `${THE_TEST_OFFICES_SECRETARY.name}, which started it`,
        date: '2026-09-07',
        chaptersRead: [5],
      },
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

async function thePrompt(run: string, changes: { path: string; changes: string }[]): Promise<Record<string, unknown>> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}/prompt`,
    headers: asAgent('inspector-one'),
    payload: { changes },
  })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

/** Every message filed about one run, newest last, as the records they are. */
async function messagesAbout(run: string): Promise<Record<string, unknown>[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/records?kind=message&shape=full', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  const said = reply.json() as { records: Record<string, unknown>[] }
  return said.records.filter((one) => (one['data'] as Record<string, unknown>)['aboutRun'] === run)
}

function bodyOf(message: Record<string, unknown>): string {
  return String((message['data'] as Record<string, unknown>)['body'] ?? '')
}

/** The registry id of the live agent registered under this handle. A new agent's id is not its handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

function toOf(message: Record<string, unknown>): { kind: string; id: string }[] {
  return ((message['data'] as Record<string, unknown>)['to'] ?? []) as { kind: string; id: string }[]
}

beforeAll(async () => {
  t = await freshDb()
  // THE STAND-IN FOR THE SHIPPED FILE holds what the stand-in module holds: the shipped chapters and C23's 42 and 43.
  roleChapters.file = join(mkdtempSync(join(tmpdir(), 'c23-role-chapters-')), 'default-regulations.json')
  writeFileSync(roleChapters.file, JSON.stringify((await import('../src/config/rules/default-regulations.json')).default))
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a registration's chapters line is read against the
  // office's own chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  // ONLY THE PERSON APPOINTS AN INSPECTOR. An inspector appointed by the agent whose work it checks
  // is not a check, and POST /api/agents/started refuses any agent that tries.
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: THE_INSPECTORS_NAME, role: 'inspector' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
    handle: 'builder-c',
    name: 'Builder C',
    role: 'worker',
    chapters: ['5:full'],
    workArea: THE_AREA,
  })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
    handle: 'builder-d',
    name: BUILDER_DS_NAME,
    role: 'worker',
    chapters: ['5:full'],
    workArea: THE_AREA,
  })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-nowhere', name: 'Builder Nowhere', role: 'worker' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-two-runs', name: 'Builder Two Runs', role: 'worker', chapters: ['5:full'], workArea: THE_AREA })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-unlinked', name: 'Builder Unlinked', role: 'worker', chapters: ['5:full'], workArea: THE_AREA })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-linked-elsewhere', name: 'Builder Linked Elsewhere', role: 'worker', chapters: ['5:full'], workArea: THE_AREA })
})

afterAll(async () => {
  rmSync(join(roleChapters.file, '..'), { recursive: true, force: true })
  await app.close()
  t.close()
})

describe('C23 — the prompt carries no chapter at full that the brief did not name', () => {
  it('omits role chapters from the standing load and still writes out a role chapter the brief names', async () => {
    // Chapters 42 and 43 are in the stand-in for the shipped file, and the first-start copy filed them (`roleChapters`).
    await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      handle: 'made-up-role-builder', name: 'MADE-UP role builder', role: 'worker', chapters: ['42:full'], workArea: THE_AREA,
    })
    const run = await fileARun('made-up-role-builder', 'MADE-UP run with a named role chapter')
    const prompt = await thePrompt(run, [])
    const text = String(prompt['prompt'])
    const standing = text.split('## The office regulations, shared chapters by name')[1]!.split('## The run you are checking')[0]!
    expect(standing).toContain('The live server and database')
    expect(standing).not.toContain('MADE-UP role 42')
    expect(standing).not.toContain('MADE-UP role 43')
    expect(text).toContain('MADE-UP role rule 42')
    expect(text).not.toContain('MADE-UP role 43')
    expect(prompt['chaptersAt']).toEqual([{ chapter: 42, level: 'full', bytes: expect.any(Number) }])
  })

  it('writes out the chapter the brief named and holds the rest at their names', async () => {
    const run = await fileARun('builder-c', 'Builder C, the run to check')
    const prompt = await thePrompt(run, [{ path: 'src/server/lib/inspection.ts', changes: '@@ one line @@' }])
    const text = String(prompt['prompt'])
    expect(text).toContain(A_RULE_OF_CHAPTER_FIVE)
    expect(text).not.toContain(A_RULE_OF_CHAPTER_ONE)
    // Every chapter is still there at its name and what it governs, which is what makes the absence
    // of the rest a rule rather than an oversight.
    expect(text).toContain('The live server and database')
    expect(text).toContain(`Chapters ${DEFAULT_CHAPTERS.filter((n) => n !== 5).join(', ')} are held above at their name`)
  })

  // THE PROMPT SAYS ON THE LADDER WHERE A CHAPTER HELD AT ITS NAME SITS (acceptance finding 72; the coordinator, message
  // _gDlv52vFqAQ). In words alone an inspector read chapter 6 at its name and wrote its level as "name", which is no rung,
  // so that part of its chapters line could not be read. The words come from LADDER, so they cannot name another ladder.
  // MUTATION PROOF, 24 September 2026, alone in src/server/lib/inspection.ts: the section's sentence typed again by hand
  // without the rungs, and this goes red.
  it('names, from the ladder itself, the rungs a chapter held at its name is at', async () => {
    const run = await fileARun('builder-c', 'Builder C, the run whose chapters are held at their names')
    const text = String((await thePrompt(run, []))['prompt'])
    const onTheLadder = aChapterAtItsNameOnTheLadder()
    expect(text).toContain(`This is what you hold of each shared chapter: its name and what it governs, ${onTheLadder.rungs}.`)
    for (const rung of LADDER) expect(onTheLadder.rungs).toContain(rung)
    expect(onTheLadder.readAt).toBe(LADDER[1])
    expect(text).toContain(`are held above at their name and what they govern, at \`${onTheLadder.readAt}\`, and no further.`)
  })

  it('says which chapters it wrote out and at what level, and how big it is', async () => {
    const run = await fileARun('builder-c', 'Builder C, the second run to check')
    const prompt = await thePrompt(run, [])
    expect(prompt['chaptersAt']).toEqual([{ chapter: 5, level: 'full', bytes: expect.any(Number) }])
    expect(Number(prompt['bytes'])).toBeGreaterThan(0)
    expect(String(prompt['says'])).toContain('written out further')
  })

  it('is smaller than the whole code of law, which is the point of the design', async () => {
    const run = await fileARun('builder-c', 'Builder C, the third run to check')
    const prompt = await thePrompt(run, [])
    expect(Number(prompt['bytes'])).toBeLessThan(Number(prompt['wholeCodeBytes']))
  })

  // THE PROMPT SAYS THE RUN ENDS WHEN THE MODEL STOPS WRITING. Measured on 8 September 2026 (problem
  // 5bAnwm7Sp6Ht): the check's own model started the suite in the background, said it would resume
  // when notified, and ended; under `claude -p` there is no next turn, so the tool wrote nothing.
  it('tells the inspector to run everything in the foreground, because nothing in the background comes back', async () => {
    const run = await fileARun('builder-c', 'Builder C, the fourth run to check')
    const prompt = await thePrompt(run, [])
    const text = String(prompt['prompt'])
    expect(text).toContain('THIS RUN ENDS THE MOMENT YOU STOP WRITING')
    expect(text).toContain('Run every command in the foreground and wait for it to end')
    // AND NOT TO RUN THE WHOLE SUITE: the third check of the same run was stopped by the clock with no
    // verdict, inside a suite the worker had already run and reported.
    // AND THAT THE REPORT STANDS IN FOR THE SUITE'S NUMBERS ONLY (wave 13j, the round after X4FMBW2bGWp-, point 5b of the
    // check line's brief). MUTATION, 16 October 2026, after a green control: the paragraph taken out of
    // assembleTheInspectorsPrompt; this went red. Restored with cp and checked with cmp. The decision of 18 October
    // 2026, and the coordinator's way (A): prepare dependencies, build nothing, read the change and prove each changed test by a
    // restored mutation of its guarded code.
    expect.soft(text).toContain('Read the diff path by path against the recorded decisions and the rules.')
    // The prompt ships in the bundle, which may carry no decision of the owner's nor its id (scripts/no-owner-content.mjs).
    expect.soft(text).not.toMatch(/owner'?s\s+decisions?/i)
    expect.soft(text).not.toContain('madeUpanfjrl')
    expect.soft(text).toContain('Check every claim in the report against the code.')
    expect.soft(text).toContain('Do not run the build, the typecheck, the whole suite or lists of test files. The merge queue runs them all.')
    expect.soft(text).toContain('For each test this run added or changed, break the code it guards once or twice. Run only that test file, see it turn red, and restore the code.')
    expect.soft(text).toContain('THE TREE HAS NOT BEEN BUILT. A test that needs dist/ needs `npm run build` first; run that command yourself in your sandbox. tests/source-api.test.ts is the known test that needs it.')
    expect.soft(text).toContain('A RELEASE THAT RESTS ON THE REPORT ALONE IS NOT A CHECK. Say in the verdict what you read and which mutations you ran, with what each showed.')
    expect.soft(text).not.toContain('Build once')
    // The opening no longer says "You build nothing", which the dist/ paragraph above would contradict.
    expect.soft(text).toContain('You make no change to the work and you start nobody.')
    expect.soft(text).not.toContain('You build nothing')
  })
})

describe('C25 — the inspector reads the changes through the work area the worker registered', () => {
  it('carries the changes inside the area and names the ones outside without reading them', async () => {
    const run = await fileARun('builder-c', 'Builder C, the area run')
    const prompt = await thePrompt(run, [
      { path: 'src/server/lib/inspection.ts', changes: 'INSIDE THE AREA' },
      { path: 'src/web/pages/HomePage.tsx', changes: 'OUTSIDE THE AREA' },
    ])
    const text = String(prompt['prompt'])
    expect(text).toContain('INSIDE THE AREA')
    expect(text).not.toContain('OUTSIDE THE AREA')
    expect(text).toContain('src/web/pages/HomePage.tsx')
    const changes = prompt['changes'] as Record<string, unknown>
    expect(changes['outside']).toEqual(['src/web/pages/HomePage.tsx'])
    expect((changes['inside'] as unknown[]).length).toBe(1)
  })

  it('says a run with no work area is one nobody can check this way, not one with nothing to check', async () => {
    const run = await fileARun('builder-nowhere', 'Builder Nowhere, the run')
    // Old wording: “says a run with no work area is one nobody can check this way”.
    // The hard eligibility rule now refuses prompt assembly instead of assembling an empty area.
    const reply = await app.inject({
      method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'),
      payload: { changes: [{ path: 'src/server/lib/inspection.ts', changes: 'SOMETHING' }] },
    })
    expect(reply.statusCode).toBe(409)
    expect(reply.body).toContain('registered work area')
    expect(reply.body).not.toContain('SOMETHING')
  })
})

describe('C19 and C20 — a release is two messages, and the starter is not sent the check', () => {
  let run = ''
  const CHECK = 'I read the diff in src/server/lib and the report. Chapter 5 rule 1 is met: a control ran first.'

  beforeAll(async () => {
    run = await fileARun('builder-c', 'Builder C, the released run')
    await fileAReport('builder-c', 'Builder C, what it did')
    const answered = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent('inspector-one'),
      payload: { verdict: 'released', check: CHECK, chaptersRead: ['5:full'] },
    })
    expect(answered.statusCode, answered.body).toBe(201)
  })

  it('writes exactly two messages, one to the worker and one to the starter', async () => {
    const written = await messagesAbout(run)
    expect(written).toHaveLength(2)
    const toWorker = written.find((one) => toOf(one).some((who) => who.id === idOf('builder-c')))
    const toStarter = written.find((one) => toOf(one).some((who) => who.id === idOf(THE_TEST_OFFICES_SECRETARY.handle)))
    expect(toWorker, 'no message to the worker').toBeDefined()
    expect(toStarter, 'no message to the starter').toBeDefined()
  })

  it('ends the run in the message to the worker, and carries the check there', async () => {
    const toWorker = (await messagesAbout(run)).find((one) => toOf(one).some((who) => who.id === idOf('builder-c')))!
    expect(bodyOf(toWorker)).toContain('You are released')
    expect(bodyOf(toWorker)).toContain(CHECK)
  })

  it('sends the starter the result and one line, and never the check', async () => {
    const written = await messagesAbout(run)
    const toWorker = written.find((one) => toOf(one).some((who) => who.id === idOf('builder-c')))!
    const toStarter = written.find((one) => toOf(one).some((who) => who.id === idOf(THE_TEST_OFFICES_SECRETARY.handle)))!
    expect(bodyOf(toStarter)).toContain('The run filed no report linked about it, so there is no report to name.')
    expect(bodyOf(toStarter)).not.toContain('Builder C, what it did')
    expect(bodyOf(toStarter)).toContain(checkedAndReleased(THE_INSPECTORS_NAME))
    // C20 is measured in bytes: the starter's message carries the result plus one line, and a build
    // that forwarded the inspector's reasoning would carry the check as well.
    expect(bodyOf(toStarter)).not.toContain(CHECK)
    expect(Buffer.byteLength(bodyOf(toStarter))).toBeLessThan(Buffer.byteLength(bodyOf(toWorker)))
  })

  it('names the message that carried the check on the release itself', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    const stands = (reply.json() as { stands: Record<string, unknown> }).stands
    const release = stands['released'] as Record<string, unknown>
    expect(release['how']).toBe('an inspector')
    expect(release['by']).toEqual({ kind: 'agent', id: idOf('inspector-one') })
    const toWorker = (await messagesAbout(run)).find((one) => toOf(one).some((who) => who.id === idOf('builder-c')))!
    expect(release['check']).toBe(toWorker['id'])
  })
})

describe('the starter is told the run\'s own report, not the newest its agent wrote (acceptance finding 57)', () => {
  // ONE WORKER, TWO RUNS RELEASED ONE AFTER THE OTHER, as two runs of the tool maintainer's worker were a minute apart on 23 September
  // 2026: a git seal pins no records, so the release read every report the worker wrote, and told the starter of the
  // first run the second run's report. A report linked `about` its own run is read first (the coordinator, _ORPypABcx7i).
  // MUTATION PROOF, 23 September 2026, each alone in src/server/lib/inspection.ts: the linked reports not preferred, and
  // the first case goes red on the second run's report. The later repair (10 November 2026) names no report when none is
  // linked about the run, so the second and third cases go red on the old fallback.
  const released = async (run: string): Promise<string> => {
    const answered = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent('inspector-one'),
      payload: { verdict: 'released', check: 'A synthetic check; no model judged work.', chaptersRead: ['5:full'] },
    })
    expect(answered.statusCode, answered.body).toBe(201)
    const toStarter = (await messagesAbout(run)).find((one) => toOf(one).some((who) => who.id === idOf(THE_TEST_OFFICES_SECRETARY.handle)))
    expect(toStarter, 'no message to the starter').toBeDefined()
    return bodyOf(toStarter!)
  }
  const linkAbout = async (by: string, from: string, to: string): Promise<void> => {
    const linked = await app.inject({ method: 'POST', url: '/api/links', headers: asAgent(by), payload: { fromId: from, toId: to, type: 'about' } })
    expect(linked.statusCode, linked.body).toBe(201)
  }

  it('names the released run\'s linked report, though another run\'s report is newer', async () => {
    const first = await fileARun('builder-two-runs', 'Builder Two Runs, the first run')
    const second = await fileARun('builder-two-runs', 'Builder Two Runs, the second run')
    await linkAbout('builder-two-runs', await fileAReport('builder-two-runs', 'Builder Two Runs, what the first run did'), first)
    // THE SECOND RUN'S REPORT IS THE NEWER ONE, strictly: records are ordered by a wall-clock second, and two reports
    // filed in the same second would come back in whatever order, which is not the case that went wrong.
    await new Promise((ok) => setTimeout(ok, 1_100))
    await linkAbout('builder-two-runs', await fileAReport('builder-two-runs', 'Builder Two Runs, what the second run did'), second)
    const said = await released(first)
    expect(said).toContain('Builder Two Runs, what the first run did')
    expect(said).not.toContain('Builder Two Runs, what the second run did')
    expect(said).not.toContain('Not linked about this run.')
  })

  it('says there is no report linked about the run, and names none of the agent\'s other reports', async () => {
    const run = await fileARun('builder-unlinked', 'Builder Unlinked, a run with no linked report')
    await fileAReport('builder-unlinked', 'Builder Unlinked, a report linked to nothing')
    const said = await released(run)
    expect(said).toContain('The run filed no report linked about it, so there is no report to name.')
    expect(said).not.toContain('Builder Unlinked, a report linked to nothing')
    expect(said).not.toContain('It closes when you confirm this report.')
  })

  // A REPORT LINKED TO THE RUN BUT WRITTEN BY SOMEBODY ELSE IS NOT THE AGENT'S (the inspector's note on the follow-ups'
  // release, acceptance finding 58): the agent's own reports are read, and none of them is linked about the run, so the
  // notice names none of them. The release notice of 10 November named another run's report and was confirmed from
  // the notice alone.
  // MUTATION PROOF, 24 September 2026: the flag read off every linked report instead of the agent's, and this goes red.
  it("names no report when the only report linked to the run is somebody else's", async () => {
    const run = await fileARun('builder-linked-elsewhere', 'Builder Linked Elsewhere, a run')
    await linkAbout(THE_TEST_OFFICES_SECRETARY.handle, await fileAReport(THE_TEST_OFFICES_SECRETARY.handle, `${THE_TEST_OFFICES_SECRETARY.name}, a report about that run`), run)
    await fileAReport('builder-linked-elsewhere', 'Builder Linked Elsewhere, its own report')
    const said = await released(run)
    expect(said).toContain('The run filed no report linked about it, so there is no report to name.')
    expect(said).not.toContain('Builder Linked Elsewhere, its own report')
  })
})

describe('C21 and C26 — a refusal names what is missing, the run continues, and a group opens', () => {
  let run = ''
  const CHECK = 'The report says it read chapter 5 and no test was proved by mutation.'

  beforeAll(async () => {
    run = await fileARun('builder-d', 'Builder D, the refused run')
    const answered = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent('inspector-one'),
      payload: {
        verdict: 'refused',
        check: CHECK,
        missing: ['no mutation proof for the new test', 'no control run before it'],
        says: { chapter: 5 },
        chaptersRead: ['5:full'],
      },
    })
    expect(answered.statusCode, answered.body).toBe(201)
  })

  it('tells the worker what is missing and which chapter says so', async () => {
    const toWorker = (await messagesAbout(run)).find((one) => toOf(one).some((who) => who.id === idOf('builder-d')))!
    expect(bodyOf(toWorker)).toContain('You are not released')
    expect(bodyOf(toWorker)).toContain('no mutation proof for the new test')
    expect(bodyOf(toWorker)).toContain('chapter 5')
  })

  it('leaves the run unreleased, so it goes back to work', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    const stands = (reply.json() as { stands: Record<string, unknown> }).stands
    expect(stands['released']).toBeNull()
    expect(stands['unreleasedFinish']).toBe(true)
  })

  it('tells the starter a refusal happened and not what it was', async () => {
    const toStarter = (await messagesAbout(run)).find((one) => toOf(one).some((who) => who.id === idOf(THE_TEST_OFFICES_SECRETARY.handle)))!
    expect(bodyOf(toStarter)).toContain(`refused to release ${BUILDER_DS_NAME}`)
    expect(bodyOf(toStarter)).not.toContain(CHECK)
    expect(bodyOf(toStarter)).not.toContain('no mutation proof')
  })

  it('opens a group holding the worker, its supervisor and the inspector', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/groups', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(reply.statusCode, reply.body).toBe(200)
    const groups = (reply.json() as { groups: Record<string, unknown>[] }).groups
    const mine = groups.find((one) => String(one['name']).includes('builder-d'))
    expect(mine, JSON.stringify(groups.map((one) => one['name']))).toBeDefined()
    const members = (mine!['members'] as { who: { kind: string; id: string } }[]).map((one) => one.who.id)
    expect(new Set(members)).toEqual(new Set(['builder-d', THE_TEST_OFFICES_SECRETARY.handle, 'inspector-one'].map(idOf)))
    expect(String(mine!['openedBecause'])).toContain('the refusal stands')
  })

  it('names the group in the message to the starter, so nobody has to notice it', async () => {
    const toStarter = (await messagesAbout(run)).find((one) => toOf(one).some((who) => who.id === idOf(THE_TEST_OFFICES_SECRETARY.handle)))!
    const reply = await app.inject({ method: 'GET', url: '/api/groups', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    const groups = (reply.json() as { groups: Record<string, unknown>[] }).groups
    const mine = groups.find((one) => String(one['name']).includes('builder-d'))!
    expect(bodyOf(toStarter)).toContain(String(mine['id']))
  })

  it('refuses a refusal that names nothing missing, so no refusal is an opinion', async () => {
    const other = await fileARun('builder-d', 'Builder D, the second run')
    const no = await app.inject({
      method: 'POST',
      url: `/api/checks/${other}`,
      headers: asAgent('inspector-one'),
      payload: { verdict: 'refused', check: 'It feels wrong.', says: { chapter: 5 } },
    })
    expect(no.statusCode).toBe(400)
    expect(String((no.json() as { error: string }).error)).toContain('names what is missing')
    expect(await messagesAbout(other)).toEqual([])
  })

  it('refuses a refusal that names no chapter and no precedent', async () => {
    const other = await fileARun('builder-d', 'Builder D, the third run')
    const no = await app.inject({
      method: 'POST',
      url: `/api/checks/${other}`,
      headers: asAgent('inspector-one'),
      payload: { verdict: 'refused', check: 'It feels wrong.', missing: ['something'] },
    })
    expect(no.statusCode).toBe(400)
    expect(await messagesAbout(other)).toEqual([])
  })
})

describe('C22 — an inspector that fixes what it found fails the check', () => {
  it('refuses the check and names the records the inspector changed', async () => {
    const run = await fileARun('builder-c', 'Builder C, the run it fixed')
    const report = await fileAReport('builder-c', 'Builder C, the report it will fix')
    const fixed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${report}`,
      headers: asAgent('inspector-one'),
      payload: { dataPatch: { chaptersRead: [1, 5, 9] } },
    })
    expect(fixed.statusCode, fixed.body).toBe(200)

    const no = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent('inspector-one'),
      payload: { verdict: 'released', check: 'I read it, and I tidied the report while I was there.' },
    })
    expect(no.statusCode).toBe(403)
    const said = String((no.json() as { error: string }).error)
    expect(said).toContain(report)
    expect(said).toContain('no longer checking it')
    expect(said).toContain('Nothing was written.')
    expect(await messagesAbout(run)).toEqual([])
  })
})

/**
 * ONE WORD THE READING LADDER HAS NOT GOT DOES NOT THROW THE CHECK AWAY. Problem `y_HP9aIa0Bd6`.
 *
 * A check ran for twelve minutes and delivered nothing: it said it read six chapters at level
 * "rules", `"rules"` is not one of the seven rungs, and the door refused the whole submission with
 * 400. The refusal named the word it would not take and not the seven it would, so a checker could
 * not learn the ladder from it, and the verdict the checker had already reached was lost while the
 * run stayed inspecting and its worktree kept.
 *
 * THE TWO MUTATIONS:
 *   - Take `SEVEN_RUNGS_NAMED` out of `notARungSaid` in src/shared/chapters.ts, and the first case
 *     goes red because the reply no longer names the seven positions the ladder does have.
 *   - Put the door's `throw new PanelError(...)` back over `chaptersRead.problems`, and the second
 *     case goes red: the answer is 400 and no release is recorded on the run.
 */
describe('the chapters line cannot throw a finished verdict away (problem y_HP9aIa0Bd6)', () => {
  const NOT_A_RUNG = [{ chapter: 5, level: 'rules' }]

  it('names the seven positions the reading ladder does have, so a checker can learn it', async () => {
    const run = await fileARun('builder-c', 'Builder C, the check whose chapters word is not a rung')
    const answered = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent('inspector-one'),
      payload: { verdict: 'released', check: 'I read it and it is all there.', chaptersRead: NOT_A_RUNG },
    })
    expect(answered.statusCode, answered.body).toBe(201)
    const said = answered.json() as { chaptersReadUnreadable?: string[] }
    expect(said.chaptersReadUnreadable?.join(' ')).toContain(SEVEN_RUNGS_NAMED)
  })

  it('records the verdict anyway, with the unreadable line kept as text on the run', async () => {
    const run = await fileARun('builder-c', 'Builder C, the run whose chapters line could not be read')
    const answered = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent('inspector-one'),
      payload: { verdict: 'released', check: 'I read it and it is all there.', chaptersRead: NOT_A_RUNG },
    })
    expect(answered.statusCode, answered.body).toBe(201)

    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    const stands = (read.json() as { stands: Record<string, unknown> }).stands
    const release = stands['released'] as Record<string, unknown> | null
    expect(release, 'the verdict was thrown away over the chapters line').not.toBeNull()
    // THE FIELD `chaptersReadUnreadable` SAYS IT COULD NOT BE READ; its value keeps the line as text
    // and why. Both halves of problem y_HP9aIa0Bd6's second fix are checked here.
    const kept = (release?.['chaptersReadUnreadable'] ?? []) as string[]
    expect(kept.join(' ')).toContain('{"chapter":5,"level":"rules"}')
    expect(kept.join(' ')).toContain('is not a position on the reading ladder')
    // THE RUN MOVED OFF inspecting, so its worktree can be let go.
    expect(stands['standing']).toBe('reporting')
    // AND THE WORKER IS TOLD THE CHAPTERS ARE NOT KNOWN, NEVER THAT NONE WERE READ (acceptance finding 65; the coordinator, problem
    // OZfz8TM0M-xF): "none" would say the check read no chapter, which a reader cannot tell from a check that read none.
    // MUTATION PROOF, 24 September 2026, alone in src/server/lib/inspection.ts: the sentence saying "none" put back,
    // and this goes red.
    const toWorker = (await messagesAbout(run)).find((one) => toOf(one).some((who) => who.id === idOf('builder-c')))
    expect(toWorker, 'no message to the worker').toBeDefined()
    expect(bodyOf(toWorker!)).toContain('Chapters read for this check: not known')
    expect(bodyOf(toWorker!)).not.toContain('Chapters read for this check: none')
  })
})

describe('a worker retired before its check ended still gets its verdict, delivered to its starter (problem bVge3jfi1_gr)', () => {
  // THE OWNER'S RULE OF 11 SEPTEMBER retires a worker at the end of its work, and a check takes forty
  // minutes; the message door refuses a message to a retired agent. Until 13 September 2026 the two
  // met in the verdict and it was thrown away: nothing written, the run left "inspecting".
  // A DECISION OF 16 SEPTEMBER 2026 refuses retiring WHILE a run of the agent still owes a check or a
  // report. What that decision leaves open — a retirement while the run is still
  // working, before the worker has said anything is finished — is how this test reaches the same
  // question: the worker is retired, then says its work is finished, then the check ends, and the
  // verdict still has to reach the retired worker's starter without being thrown away.
  // THE MUTATION: address the check to the worker again (`to: [workerRef]`) and the release is
  // refused 409 by the message door, so the first case goes red.
  let run = ''
  const CHECK = 'I read the diff in src/server/lib. Chapter 5 rule 1 is met: a control ran first, then the mutation.'

  beforeAll(async () => {
    await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      handle: 'builder-e',
      name: 'Builder E',
      role: 'worker',
      chapters: ['5:full'],
      workArea: THE_AREA,
    })
    // THE RUN, OPENED AND LEFT WORKING, so the retire below is the act the new decision allows.
    const opened = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'session',
      title: 'Builder E, retired before its check ended',
      actor: { type: 'agent', id: 'builder-e' },
      data: { state: 'running', servingAgent: 'builder-e', cutFrom: 'main', tip: fixtureTip, doing: 'building the check' },
    })
    run = opened.id
    t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
    await fileAReport('builder-e', 'Builder E, what it did')
    const retired = await app.inject({
      method: 'POST',
      url: '/api/participants/agent/builder-e/retire',
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { because: 'The work was handed back, and a worker with nothing left is retired at once.' },
    })
    expect(retired.statusCode, retired.body).toBe(200)
    // THEN THE WORKER SAYS ITS WORK IS FINISHED, and the check stands over the run of a retired agent.
    const said = t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, { type: 'agent', id: 'builder-e' })
    expect((said as unknown as { record: { data: { state: string } } }).record.data.state).toBe('finished')
    const assembled = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}/assembled`,
      headers: asAgent('inspector-one'),
      payload: { changes: [] },
    })
    expect(assembled.statusCode, assembled.body).toBe(201)
    const answered = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent('inspector-one'),
      payload: { verdict: 'released', check: CHECK, chaptersRead: ['5:full'] },
    })
    expect(answered.statusCode, answered.body).toBe(201)
  })

  it('writes the release on the run, so the check is not lost', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    const stands = (reply.json() as { stands: Record<string, unknown> }).stands
    expect(stands['released'], 'the run is not released').not.toBeNull()
  })

  it('sends nothing to the retired worker, and carries the check to its starter saying so in the first line', async () => {
    const written = await messagesAbout(run)
    expect(written.some((one) => toOf(one).some((who) => who.id === idOf('builder-e'))), 'a message went to the retired worker').toBe(false)
    const carried = written.find((one) => bodyOf(one).includes(CHECK))
    expect(carried, 'no message carries the check').toBeDefined()
    expect(toOf(carried!)).toEqual([{ kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) }])
    expect(bodyOf(carried!).split('\n')[0]).toContain('is retired')
    expect(bodyOf(carried!)).toContain('You are released')
    const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    const release = (reply.json() as { stands: Record<string, unknown> }).stands['released'] as Record<string, unknown>
    expect(release['check']).toBe(carried!['id'])
  })
})
