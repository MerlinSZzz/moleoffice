// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUND'S START GIVES THE RULES THE OFFICE HOLDS. readTheRoundsRules in src/shared/round-start-rules.ts asks
 * GET /api/office-regulations/chapters and GET /api/office-regulations once each when a round starts, makes CODE.md's
 * text from the chapters with codeOfLawText, and reads every live regulation of the person whole. prepareRoundChapters
 * saves that text as the CODE.md source, under the door and the time of the reading, and the regulations in the
 * manifest as `regulations`; deliveredRoundBrief gives the regulations right after the brief; withTheRoundStartPack
 * names where each part came from and gives only the line's part of TERRITORIES.md.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office, with its own doors for
 * chapters, regulations and records. The one chapter it holds, written through its own chapter door, its two titles, the
 * regulations, the sandbox, its TERRITORIES.md, NEXT.md and LINE-common.md, the worktree's CODE.md and the brief are made
 * up. A refusal is answered by a stand-in that changes the scratch office's
 * own answer for one door. The launcher-level case runs the real commandRound from tools/sandbox.mjs over the scratch
 * office, a sandbox folder the test makes and removes, and made-up record ids.
 *
 * THE CASES, in plain words: a chapter changed in the office is what the next start gives, and the worktree's CODE.md
 * is not given; nothing answering, an answer other than 200 and an answer not of the shape each stop the start, for each
 * of the two doors, and nothing is written; a revoked regulation is not given, the start says when no regulation is
 * live, and a live one is given whole; the line's own section and its fallback rule are given and no general section of
 * TERRITORIES.md, under a normal selection and under a fallback one, and the head names where each part came from; and
 * a round the launcher starts saves the office's chapters and the live regulation in its manifest and delivered brief.
 */

import type { FastifyInstance } from 'fastify'
import { basename, dirname, join, resolve } from 'node:path'
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'
import { THE_PROGRAM_A_RUNTIME_RUNS } from '../src/config/launcher-selection.mjs'
import type { ChapterContent, SelectedChapter } from '../src/shared/chapter-edit.ts'
import { validateData } from '../src/shared/kinds.ts'
import type { AskTheOffice } from '../src/shared/round-chapters/backlog.ts'
import { prepareRoundChapters, ROUND_CHAPTERS_POLICY_FILE, THE_UNSAFE_TERRITORY_NOTICE } from '../src/shared/round-chapters/delivery.ts'
import {
  deliveredRoundBrief, readRoundChapters, regulationsText, roundChaptersOutline, THE_CHAPTERS_DOOR, theChaptersReadAt,
  THE_REGULATIONS_DOOR, THE_SAVED_SELECTION_HOLDS_TERRITORIES_IN_FULL, type GivenRegulation,
} from '../src/shared/round-chapters/manifest.ts'
import { whatTheOfficeAnswered } from '../src/shared/round-start-delegations.ts'
import { NEXT_FILE, oneReadAway, THE_FALLBACK_RULE, THE_PACK_REFUSAL, theRoundStartPackHead, whereEachPartCameFrom } from '../src/shared/round-start-pack.ts'
import { itsAnswerCannotBeUsed, readTheRoundsRules, theRulesCannotBeRead } from '../src/shared/round-start-rules.ts'
import { chaptersOfTheAnswer } from '../src/worker/rules.ts'
import { aRunWithNoTitleARoundCanTakeWords, theAgentsOwnWorktree, whyARunMayNotWorkIn } from '../tools/sandbox-common.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { madeUpRound } from './round-chapters-fixture.ts'

const LINE = 'rs'
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
let t: TestDb
let app: FastifyInstance

/** The one chapter the scratch office holds, chapter 2, as it is first written. The worktree's CODE.md has other words for chapter 2. */
const FIRST_TITLE = 'MADE-UP first title of chapter 2'
const CHANGED_TITLE = 'MADE-UP title of chapter 2, changed in the office'
const aChapter = (title: string): ChapterContent => ({
  label: 'MADE-UP chapter 2', title, conclusion: 'MADE-UP conclusion of chapter 2: read it before the made-up work.',
  zh: { label: '测试章节 2', title: `测试规章 2：${title === FIRST_TITLE ? '初版' : '改版'}`, conclusion: '测试结论 2。' },
  rules: [{ id: 'r-1', heading: 'MADE-UP rule of chapter 2', text: 'MADE-UP work of chapter 2 is recorded.', zh: { heading: '测试条文 2', text: '测试工作 2 已记录。' } }],
})
/** The made-up regulations of the person: one revoked, one live, and one the launcher-level case files. */
const REVOKED = { title: 'Made-up revoked regulation', sentence: 'Made-up: nobody paints the fence on a Sunday.' }
const LIVE = { title: 'Made-up live regulation', sentence: 'Made-up: every made-up bed is watered before noon.' }
const LAUNCHED = { title: 'Made-up regulation a launched round is given', sentence: 'Made-up: every made-up gate is shut at night.' }

/** The launcher's request, as the round start makes it, here to the scratch office. */
const askTheMadeUpOffice = (asked: string[] = []) => async (path: string) => {
  asked.push(path)
  const reply = await app.inject({ method: 'GET', url: path, headers: PERSON })
  return { status: reply.statusCode, body: reply.json() as unknown }
}

/** The scratch office, with the answer to one path changed from its own. */
const aStandIn = (changed: Record<string, (real: { status: number; body: any }) => { status: number | null; body?: unknown; why?: string }>, asked: string[] = []) => async (path: string) => {
  const real = await askTheMadeUpOffice(asked)(path)
  return changed[path]?.(real) ?? real
}

/** The words of the made-up sandbox's TERRITORIES.md: two general sections, this sandbox's heading, another line's, and the fallback rule. */
const territoriesOf = (sandbox: string) =>
  '# Territories\n\n## A. How the lines share files\nGENERAL-A words every line shares.\n\n## B. The lines\n\n' +
  `### ${LINE}, the made-up rules line (sandbox ${sandbox})\nRS-OWN files of the line.\n\n#### Rs detail\nRS-DETAIL.\n\n` +
  '### other, another made-up line (sandbox other-sandbox)\nOTHER-LINE files.\n\n' +
  `${THE_FALLBACK_RULE}, for every changed file not named above: made-up rule words.\n\n## C. Merging\nGENERAL-C words on merging.\n`
/** The heading of TERRITORIES.md that names the made-up sandbox. */
const headingOf = (sandbox: string) => `${LINE}, the made-up rules line (sandbox ${sandbox})`

/**
 * A made-up sandbox whose TERRITORIES.md names it, so the pack is made. `fallback` gives it a policy whose TERRITORIES.md
 * selection is not the line's own, so the delivery falls back and saves every file whole.
 */
function aRulesRound(fallback = false) {
  const f = madeUpRound()
  const sandbox = basename(f.dir)
  writeFileSync(join(f.dir, 'briefs/TERRITORIES.md'), territoriesOf(sandbox))
  writeFileSync(join(f.dir, NEXT_FILE), '# Made-up next\n\n## 1. Next work\n\nMADE-UP item.\n')
  writeFileSync(join(f.dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify({ version: 1, kinds: { synthetic: {
    'CODE.md': [{ chapter: 2, descendants: true }], 'LINE-common.md': [{ path: ['Common', 'Local'] }], 'TERRITORIES.md': fallback ? [] : '*',
  } }, territories: {} }))
  return { ...f, sandbox }
}

/** The round start, as the launcher makes it: the rules from the office, then the manifest. */
async function aStart(f: ReturnType<typeof aRulesRound>, request: AskTheOffice = askTheMadeUpOffice()) {
  const rules = await readTheRoundsRules({ request, checkout: f.worktree })
  return { rules, ...prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief, rules }) }
}

/** The words of a refusal up to its reason, read from the functions that make them. */
const WHY = '\u0000'
const upToTheReason = (door: string, words: (why: string) => string) => THE_PACK_REFUSAL(theRulesCannotBeRead(door, words(WHY))).split(WHY)[0]!

/** A regulation of the person, filed by the person, and revoked by the person when `revoked` is given. */
async function aRegulation(words: { title: string; sentence: string }, since: string, revoked?: string) {
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers: PERSON, payload: { kind: 'regulation', title: words.title, data: { sentence: words.sentence, binds: 'person', since } } })
  expect(filed.statusCode, filed.body).toBe(201)
  const id = String(filed.json().record.id)
  if (revoked !== undefined) {
    const revoking = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: PERSON, payload: { dataPatch: { revoked_at: revoked, revoked_because: 'Made-up: no longer needed.' } } })
    expect(revoking.statusCode, revoking.body).toBe(200)
  }
  return id
}

/** Chapter 2 as the office's chapter door gives it now. */
async function chapterTwo(): Promise<SelectedChapter> {
  const read = await app.inject({ method: 'GET', url: THE_CHAPTERS_DOOR, headers: PERSON })
  expect(read.statusCode, read.body).toBe(200)
  return (read.json().chapters as SelectedChapter[]).find(one => one.n === 2)!
}

async function writeChapterTwo(title: string, version: string | null) {
  const written = await app.inject({ method: 'POST', url: THE_CHAPTERS_DOOR, headers: PERSON, payload: { n: 2, version, because: 'MADE-UP chapter for the round start test', chapter: aChapter(title) } })
  expect(written.statusCode, written.body).toBe(200)
}

/** Where a sandbox's files are named from: the delivery reads the sandbox at its real path. */
const at = (f: { dir: string }, path: string) => join(realpathSync(f.dir), path)

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  await writeChapterTwo(FIRST_TITLE, null)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("a round's start reads the chapters from the office (RS-1)", () => {
  it('1. a chapter changed in the office is what the next start gives, and the worktree\'s CODE.md is not given', async () => {
    const before = await aStart(aRulesRound())
    expect(before.manifest.sources[0]!.text).toContain(`**${FIRST_TITLE}**`)
    expect(before.manifest.sources[0]!.text).not.toContain(CHANGED_TITLE)
    const first = await chapterTwo()
    expect(first.inUse).toBe('stored')
    await writeChapterTwo(CHANGED_TITLE, first.version)

    const f = aRulesRound()
    expect(readFileSync(join(f.worktree, 'src/config/rules/CODE.md'), 'utf8')).toContain('PORTS')
    const asked: string[] = []
    const { rules, manifest, brief } = await aStart(f, askTheMadeUpOffice(asked))
    expect(asked).toEqual([THE_CHAPTERS_DOOR, THE_REGULATIONS_DOOR])

    const code = manifest.sources[0]!
    expect(code.path).toBe(theChaptersReadAt(rules.regulations.at))
    expect(code.path).toContain(`GET ${THE_CHAPTERS_DOOR}`)
    expect(code.path).not.toContain(f.worktree)
    expect(code.text).toContain(`**${CHANGED_TITLE}**`)
    expect(code.text).not.toContain(FIRST_TITLE)
    expect(code.text).not.toContain('PORTS')
    expect(manifest.chapters.map(one => one.chapter)).toEqual([2])

    const delivered = readFileSync(brief, 'utf8')
    expect(delivered).toBe(deliveredRoundBrief(manifest))
    expect(delivered).toContain(roundChaptersOutline(manifest))
    expect(delivered).toContain(CHANGED_TITLE)
    expect(delivered).not.toContain(FIRST_TITLE)
    expect(delivered).not.toContain('Made-up ports')
    expect(delivered).not.toContain(join(f.worktree, 'src/config/rules/CODE.md'))
    expect(readRoundChapters(JSON.parse(readFileSync(brief.replace(/\.md$/, '.json'), 'utf8')))).toEqual(manifest)
  })

  const doors = [THE_CHAPTERS_DOOR, THE_REGULATIONS_DOOR]

  it.each(doors)('2. nothing answering %s stops the start, names the door and writes nothing', async door => {
    const f = aRulesRound()
    const why = 'Made-up: no office answered this door'
    const asked: string[] = []
    const request = aStandIn({ [door]: () => ({ status: null, why }) }, asked)
    await expect(aStart(f, request)).rejects.toThrow(THE_PACK_REFUSAL(theRulesCannotBeRead(door, whatTheOfficeAnswered({ status: null, why }))))
    expect(asked).toEqual(doors.slice(0, doors.indexOf(door) + 1))
    expect(existsSync(join(f.dir, 'out/round-chapters'))).toBe(false)
  })

  it.each(doors)('3. %s answering 500 stops the start, names the door and what the office said, and writes nothing', async door => {
    const f = aRulesRound()
    const answer = { status: 500, body: { error: 'Made-up: this door broke' } }
    const request = aStandIn({ [door]: () => answer })
    await expect(aStart(f, request)).rejects.toThrow(THE_PACK_REFUSAL(theRulesCannotBeRead(door, whatTheOfficeAnswered(answer))))
    expect(existsSync(join(f.dir, 'out/round-chapters'))).toBe(false)
  })

  it('4. a chapters answer not of the shape stops the start with the reading\'s own words, and writes nothing', async () => {
    const f = aRulesRound()
    const bad = (real: { status: number; body: any }) => ({ status: 200, body: { ...real.body, chapters: 'made-up' } })
    let why = ''
    try { chaptersOfTheAnswer(bad({ status: 200, body: {} }).body, THE_CHAPTERS_DOOR, f.worktree) } catch (error) { why = (error as Error).message }
    expect(why).not.toBe('')
    await expect(aStart(f, aStandIn({ [THE_CHAPTERS_DOOR]: bad }))).rejects.toThrow(THE_PACK_REFUSAL(theRulesCannotBeRead(THE_CHAPTERS_DOOR, itsAnswerCannotBeUsed(why))))
    expect(existsSync(join(f.dir, 'out/round-chapters'))).toBe(false)
  })

  it('5. a regulations answer not of the shape stops the start, names the door, and writes nothing', async () => {
    const f = aRulesRound()
    for (const body of [{ regulations: 'made-up' }, { regulations: [{ id: 'made-up', title: 'Made-up', sentence: 'Made-up.', binds: 'made-up', role: null, since: null, revokedAt: null }] }]) {
      await expect(aStart(f, aStandIn({ [THE_REGULATIONS_DOOR]: () => ({ status: 200, body }) }))).rejects.toThrow(upToTheReason(THE_REGULATIONS_DOOR, itsAnswerCannotBeUsed))
    }
    expect(existsSync(join(f.dir, 'out/round-chapters'))).toBe(false)
  })
})

describe("a round's start gives the person's live regulations whole (RS-2)", () => {
  it('6. a revoked regulation is not given, the start says when none is live, and a live one is given whole after the brief', async () => {
    const revoked = await aRegulation(REVOKED, '2026-11-01', '2026-11-02')
    const f = aRulesRound()
    const none = await aStart(f)
    expect(none.manifest.regulations!.live).toEqual([])
    expect(none.manifest.regulations!.text).toBe(regulationsText(none.rules.regulations.at, []))
    const noneGiven = readFileSync(none.brief, 'utf8')
    expect(noneGiven).toContain(regulationsText(none.rules.regulations.at, []))
    expect(noneGiven).not.toContain(REVOKED.title)
    expect(noneGiven).not.toContain(REVOKED.sentence)

    const live = await aRegulation(LIVE, '2026-11-03')
    const g = aRulesRound()
    const { rules, manifest, brief } = await aStart(g)
    const given: GivenRegulation = { id: live, title: LIVE.title, sentence: LIVE.sentence, binds: 'person', since: '2026-11-03' }
    expect(manifest.regulations).toEqual(rules.regulations)
    expect(manifest.regulations!.live).toEqual([given])
    const delivered = readFileSync(brief, 'utf8')
    expect(delivered).toContain(LIVE.title)
    expect(delivered).toContain(LIVE.sentence)
    expect(delivered).toContain(live)
    expect(delivered).not.toContain(REVOKED.title)
    expect(delivered).not.toContain(REVOKED.sentence)
    expect(delivered).not.toContain(revoked)
    // RIGHT AFTER THE BRIEF, before everything else the start gives.
    expect(delivered.startsWith(`${manifest.brief.text}\n\n---\n\n${manifest.regulations!.text}\n\n---\n\n`)).toBe(true)
    // The saved text must be the text its items make.
    expect(() => readRoundChapters({ ...manifest, regulations: { ...manifest.regulations!, live: [] } })).toThrow()
  })
})

describe("a round's start gives only the line's territory and names where each part came from (RS-3)", () => {
  it.each([false, true])('7. fallback selection %s: no general section of TERRITORIES.md is given, and the head names each source', async fallback => {
    const f = aRulesRound(fallback)
    const { rules, manifest, brief } = await aStart(f)
    const territories = manifest.sources[2]!
    expect(manifest.fallback).toBe(fallback)
    if (fallback) {
      expect(manifest.notice).toBe(THE_UNSAFE_TERRITORY_NOTICE)
      // The saved selection, which the check reads, keeps the whole file.
      expect(territories.fullFile).toBe(true)
      expect(territories.text).toBe(territoriesOf(f.sandbox))
    } else {
      expect(territories.fullFile).toBe(false)
    }

    const delivered = readFileSync(brief, 'utf8')
    for (const words of ['GENERAL-A', 'GENERAL-C', 'OTHER-LINE']) expect(delivered).not.toContain(words)
    expect(delivered).toContain('RS-OWN files of the line.')
    expect(delivered).toContain('RS-DETAIL.')
    expect(delivered).toContain(`${THE_FALLBACK_RULE}, for every changed file not named above: made-up rule words.`)
    if (fallback) expect(delivered).toContain(THE_SAVED_SELECTION_HOLDS_TERRITORIES_IN_FULL)
    else expect(delivered).not.toContain(THE_SAVED_SELECTION_HOLDS_TERRITORIES_IN_FULL)

    const [head, away] = manifest.pack!.text.split('\n\n')
    const from = {
      chaptersAt: rules.regulations.at, code: manifest.sources[0]!.path, heading: headingOf(f.sandbox),
      territories: territories.path, next: at(f, NEXT_FILE), common: manifest.sources[1]!.path,
    }
    expect(head).toBe(`${theRoundStartPackHead(LINE)} ${whereEachPartCameFrom(from)}`)
    for (const named of [`GET ${THE_CHAPTERS_DOOR}`, `GET ${THE_REGULATIONS_DOOR}`, rules.regulations.at, at(f, 'briefs/TERRITORIES.md'), headingOf(f.sandbox), at(f, NEXT_FILE), at(f, 'briefs/LINE-common.md')]) {
      expect(head, named).toContain(named)
    }
    // The full chapters are named at their door, and the worktree's CODE.md is not named at all.
    expect(away).toBe(oneReadAway([at(f, 'briefs/TERRITORIES.md'), at(f, 'briefs/LINE-common.md'), at(f, NEXT_FILE)], true))
    expect(delivered).not.toContain(join(f.worktree, 'src/config/rules/CODE.md'))
  })
})

/** The launcher's own declaration of a name, run with the globals this file gives it, as the neighbouring round test does. */
function actual(name: string, globals: Record<string, unknown>) {
  const launcher = resolve('tools/sandbox.mjs')
  const source = readFileSync(launcher, 'utf8')
  let start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\n}\n', start)
  if (source.slice(start - 6, start) === 'async ') start -= 6
  if (start < 0 || end < 0) throw new Error(`Missing launcher declaration ${name}`)
  return runInNewContext(`(${source.slice(start, end + 2)})`, globals, { filename: launcher }) as (...args: any[]) => any
}

/** Every exported function the round delivery, its chapters and the round start's readers are made from. */
async function theRoundFunctions(): Promise<Record<string, any>> {
  return {
    ...await import('../src/shared/round-chapters/delivery.ts'),
    ...await import('../src/shared/round-chapters/manifest.ts'),
    ...await import('../src/shared/round-chapters/backlog.ts'),
    ...await import('../src/shared/round-chapters/standing.ts'),
    ...await import('../src/shared/round-start-delegations.ts'),
    ...await import('../src/shared/round-start-rules.ts'),
  }
}

describe('a round the launcher starts carries the rules the office holds', () => {
  /**
   * The real commandRound, with the real chapter delivery and the real rules reader. The office it asks is the scratch
   * office above; the sandbox folder, the brief, the prior run and every record id it files are made up. Nothing here
   * starts a runtime or writes to the live office.
   */
  it('8. the saved manifest and the delivered brief hold the office\'s chapter and its live regulations', async () => {
    const launched = await aRegulation(LAUNCHED, '2026-11-04')
    const now = (await chapterTwo()).chapter!.title
    const regulations = await app.inject({ method: 'GET', url: THE_REGULATIONS_DOOR, headers: PERSON })
    expect(regulations.statusCode, regulations.body).toBe(200)
    const standing = (regulations.json().regulations as { id: string; revokedAt: string | null }[]).filter(one => one.revokedAt === null).map(one => one.id)
    expect(standing).toContain(launched)
    const f = aRulesRound()
    const module = await theRoundFunctions()
    const launcher = resolve('tools/sandbox.mjs')
    const events: string[] = []
    const record: any = { data: { extra: { retained: 'keep' } } }
    let filedArgs: any
    const globals: Record<string, any> = {
      ...module, Buffer, existsSync, statSync, readFileSync, resolve, join, FULL_PERMISSIONS,
      chosen: { runtime: 'claude-code', agent: 'synthetic', brief: f.brief }, A_WORKERS_RUNTIME: 'claude-code',
      aWorkersWords: () => 'sandbox', theAddressARunCommitsAt: () => {}, whoIsAsking: () => ({}),
      theClaudeCodeVariablesInASandbox: () => ({ variables: [], window: { tokens: '200000', from: 'a made-up setting' } }),
      aSandboxToStartIn: async () => ({ dir: f.dir, name: 'synthetic', workspace: 'fixture' }),
      theAgentIsRegistered: async () => {}, theSandboxHasTheRuntimeLogin: () => {}, nothingOfItStillRuns: async () => {},
      // THE RUN BEFORE, with the worktree this round works in and a title and model the round takes.
      theRunARoundContinues: async () => ({ run: 'prior', data: { runtime: 'claude-code', workingDirectory: f.worktree, cutFrom: 'synthetic-base', model: 'made-up-model', territory: ['prior-territory'] }, title: 'A made-up run before the round', entry: {} }),
      aRunWithNoTitleARoundCanTakeWords, theAgentsOwnWorktree, whyARunMayNotWorkIn,
      theRoundsRunWasFiledHere: async () => {}, theNameClaudeTakes: (s: string) => s, theNameCodexTakes: (s: string) => s,
      theCodexThreadOf: () => 'thread',
      theOpenCodeSessionOf: () => ({ session: 'session', database: 'opencode-agent-synthetic.db', says: null }),
      theBriefInside: (_dir: string, path: string) => path, refreshMainBeforeRun: () => {}, theHelperTakesStdin: () => true,
      theBriefWithTheStartingWords: (_sb: unknown, _runtime: string, path: string) => path,
      theHelperTakesTheOpenCodeDatabase: () => true,
      theClaudeCodeCommand: ({ brief }: any) => ['claude', brief],
      anAgentsRunFiledHere: async (_sb: any, _who: any, args: any) => { filedArgs = args; events.push('filed'); return { id: 'filed', words: ['--filed', 'filed', '--brief', args.brief] } },
      api: 'synthetic', theCallerNamed: () => ({}),
      // THE STAND-IN OFFICE answers the two rules doors, and every other door the start reads, from the scratch office.
      askTheOfficeWhileItRestarts: async (_api: string, path: string) => {
        const reply = await app.inject({ method: 'GET', url: path, headers: PERSON })
        return { status: reply.statusCode, body: reply.json() as unknown }
      },
      THE_PROGRAM_A_RUNTIME_RUNS,
      theStartValues: async (command: string[]) => ({ command, env: {}, start: null }),
      theClaudeCodeEnvironment: () => ({}),
      theSecretsFor: () => ({ lines: [], says: '', file: null, quiet: true, warning: null }),
      askTheOffice: async (_api: any, path: string, options: any = {}) => {
        if (options.method === 'PATCH') { record.data = { ...record.data, ...options.body.dataPatch }; expect(validateData('session', record.data).ok).toBe(true); events.push('saved'); return { status: 200, body: { record } } }
        if (path.startsWith('/api/checks/')) { events.push('acknowledged'); return { status: 200, body: { chapters: module.savedChaptersLine(record.data.extra.roundChapters) } } }
        return { status: 200, body: { record } }
      },
      startThroughTheHelper: async () => { events.push('started'); return {} },
      printTheStart: () => {}, sayWhatWasStarted: () => {}, writeTheUseLine: async () => {}, say: () => {},
      refuse: (s: string) => { throw new Error(s) }, usage: (s: string) => { throw new Error(s) },
    }
    for (const name of ['theCodexCommand', 'theOpenCodeCommand', 'theClaudeCodeCommand']) globals[name] = actual(name, globals)
    if (readFileSync(launcher, 'utf8').includes('function theStandingStagesFor(')) globals['theStandingStagesFor'] = actual('theStandingStagesFor', globals)
    for (const name of ['whyARoundCannotWorkIn', 'whyARoundStartsANewConversation']) if (readFileSync(launcher, 'utf8').includes(`function ${name}(`)) globals[name] = actual(name, globals)
    for (const name of ['theAreaTheDoorSetIsTheDeclaredOne', 'theDeclaredAreaIsSetForTheRun']) if (readFileSync(launcher, 'utf8').includes(`function ${name}(`)) globals[name] = actual(name, globals)
    const outcome = await actual('commandRound', globals)().then(() => null, (e: Error) => e)
    expect(outcome).toBeNull()
    expect(events).toEqual(['filed', 'saved', 'acknowledged', 'started'])

    const manifest = readRoundChapters(record.data.extra.roundChapters)
    expect(manifest.regulations).toBeDefined()
    expect(manifest.sources[0]!.path).toBe(theChaptersReadAt(manifest.regulations!.at))
    expect(manifest.sources[0]!.text).toContain(`**${now}**`)
    expect(manifest.sources[0]!.text).not.toContain('PORTS')
    expect(manifest.regulations!.live.map(one => one.id).sort()).toEqual([...standing].sort())
    expect(manifest.regulations!.live.find(one => one.id === launched)).toMatchObject({ title: LAUNCHED.title, sentence: LAUNCHED.sentence, binds: 'person', since: '2026-11-04' })

    const delivered = readFileSync(filedArgs.brief, 'utf8')
    expect(delivered).toBe(deliveredRoundBrief(manifest))
    expect(delivered).toContain(now)
    expect(delivered).toContain(manifest.regulations!.text)
    expect(delivered).toContain(LAUNCHED.sentence)
    expect(delivered).not.toContain(REVOKED.sentence)
  })
})
