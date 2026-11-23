// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MUTATIONS of the backlog read, item 19 (e), each run alone after a green control and restored after (29 October 2026):
 *   - commandRound reads no backlog for a brief that names a line: the case with a line is red;
 *   - the delivered brief gains a separator when no line is declared: every runtime row is red.
 * MUTATION of item 29, run the same way (31 October 2026): the round passes no --opencode-database: the opencode row is red.
 * MUTATION of the round's title, run the same way (2 November 2026): a round given no --title does not take the title of
 * the run it continues: every case is red.
 * MUTATION of a round that starts a new conversation, run the same way (5 November 2026): whyARoundCannotWorkIn says every
 * worktree is gone, so the round no longer continues the made-up run: every runtime row and the case with a line are red.
 * MUTATION of a round's model, run the same way (6 November 2026): commandRound asks the office for the model of a
 * round whose run before ran on its runtime: every runtime row and the case with a line are red.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { MADE_UP_CHAPTER_2, madeUpRound, theMadeUpOfficesAnswer, THE_MADE_UP_OFFICE_WITH_CHAPTER_2 } from './round-chapters-fixture.ts'
import { FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'
import { noSuchEndpoint } from '../src/server/api/kinds.ts'
import { THE_PROGRAM_A_RUNTIME_RUNS } from '../src/config/launcher-selection.mjs'
import { validateData } from '../src/shared/kinds.ts'
import { aRunWithNoTitleARoundCanTakeWords, askTheOfficeWhileItRestarts, theAgentsOwnWorktree, whyARunMayNotWorkIn } from '../tools/sandbox-common.mjs'

const launcher = resolve('tools/sandbox.mjs')
const moduleFile = resolve('src/shared/round-chapters/delivery.ts')
const backlogFile = resolve('src/shared/round-chapters/backlog.ts')
const standingFile = resolve('src/shared/round-chapters/standing.ts')
const delegationsFile = resolve('src/shared/round-start-delegations.ts')


/** As in the neighbouring round tests: run the actual declaration, with external boundaries made up. */
function actual(name: string, globals: Record<string, unknown>) {
  const source = readFileSync(launcher, 'utf8')
  let start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\n}\n', start)
  if (source.slice(start - 6, start) === 'async ') start -= 6
  if (start < 0 || end < 0) throw new Error(`Missing launcher declaration ${name}`)
  return runInNewContext(`(${source.slice(start, end + 2)})`, globals, { filename: launcher }) as (...args: any[]) => any
}


async function deliveryModule(): Promise<Record<string, any>> {
  // Before implementation the existing launcher still runs: the red is missing delivery, never a missing import.
  return existsSync(moduleFile) ? { ...await import(moduleFile), ...await import('../src/shared/round-chapters/manifest.ts'), ...existsSync(backlogFile) ? await import(backlogFile) : {}, ...existsSync(standingFile) ? await import(standingFile) : {}, ...existsSync(delegationsFile) ? await import(delegationsFile) : {}, ...await import('../src/shared/round-start-rules.ts') } : {}
}

describe('a round files and delivers one saved chapter selection', () => {
  /** The real commandRound. With `older`, the brief declares a line and the backlog is asked of a stand-in there, through the launcher's own ask. */
  const aRoundStarts = async (runtime: string, direct: boolean, older: string | null = null) => {
    const f = madeUpRound()
    if (older !== null) {
      writeFileSync(f.brief + '.round.json', JSON.stringify({ kind: 'synthetic', territory: ['garden'], line: 'made-up-line', items: ['2'] }))
      writeFileSync(join(f.dir, 'briefs/REQUIREMENTS.md'), '# Made-up requirements\n2. Made-up.\n')
    }
    const module = await deliveryModule()
    const events: string[] = []; const said: string[] = []
    let record: any = { data: { extra: { retained: 'keep' } } }
    let filedArgs: any; let passed: string[] = []
    const globals: Record<string, any> = {
      ...module, Buffer, existsSync, statSync, readFileSync, resolve, join, FULL_PERMISSIONS,
      chosen: { runtime, agent: 'synthetic', brief: f.brief }, A_WORKERS_RUNTIME: 'claude-code',
      aWorkersWords: () => 'sandbox', theAddressARunCommitsAt: () => {}, whoIsAsking: () => ({}),
      // THE COMPACTION WINDOW, which the real one reads from the office's settings, is made up: no Claude Code is started here.
      theClaudeCodeVariablesInASandbox: () => ({ variables: [], window: { tokens: '200000', from: 'a made-up setting' } }),
      aSandboxToStartIn: async () => ({ dir: f.dir, name: 'synthetic', workspace: 'fixture' }),
      theAgentIsRegistered: async () => {}, theSandboxHasTheRuntimeLogin: () => {}, nothingOfItStillRuns: async () => {},
      // THE RUN BEFORE, with the title a round given no --title takes, as the real one reads it from the run's record.
      // It ran on the round's runtime, as a run a round continues does: the real theRoundsRunWasFiledHere refuses one
      // that names another runtime or none, and a round keeps the model only of a run on its own runtime.
      theRunARoundContinues: async () => ({ run: 'prior', data: { runtime, workingDirectory: f.worktree, cutFrom: 'synthetic-base', model: 'openai/synthetic-model', territory: ['prior-territory'] }, title: 'A made-up run before the round', entry: {} }),
      aRunWithNoTitleARoundCanTakeWords, theAgentsOwnWorktree, whyARunMayNotWorkIn,
      theRoundsRunWasFiledHere: async () => {}, theNameClaudeTakes: (s: string) => s, theNameCodexTakes: (s: string) => s,
      theCodexThreadOf: () => 'thread',
      theOpenCodeSessionOf: () => ({ session: 'session', database: 'opencode-agent-synthetic.db', says: null }),
      theBriefInside: (_dir: string, path: string) => path, refreshMainBeforeRun: () => {}, theHelperTakesStdin: () => direct,
      theBriefWithTheStartingWords: (_sb: unknown, _runtime: string, path: string) => path,
      theHelperTakesTheOpenCodeDatabase: () => true,
      theClaudeCodeCommand: ({ brief }: any) => ['claude', brief],
      anAgentsRunFiledHere: async (_sb: any, _who: any, args: any) => { filedArgs = args; events.push('filed'); return { id: 'filed', words: ['--filed', 'filed', '--brief', args.brief] } },
      api: 'synthetic', theCallerNamed: () => ({}),
      // THE TWO RULES DOORS ANSWER AS A MADE-UP OFFICE THAT HOLDS ONLY A MADE-UP CHAPTER 2, the chapter the round's
      // policy selects. WITH NO STAND-IN NO OTHER DOOR ANSWERS, as the real ask says once it has asked again long enough.
      askTheOfficeWhileItRestarts: (_api: string, path: string, options: any, waiting: any) => theMadeUpOfficesAnswer(path, THE_MADE_UP_OFFICE_WITH_CHAPTER_2) !== null
        ? Promise.resolve({ status: 200, body: theMadeUpOfficesAnswer(path, THE_MADE_UP_OFFICE_WITH_CHAPTER_2) })
        : older === null
          ? Promise.resolve({ status: null, why: 'made-up: no office answers this round' })
          : askTheOfficeWhileItRestarts(older, path, options, waiting),
      // The round asks for the start values before it delivers the chapters. These answer as the real ones do when the office applies none.
      THE_PROGRAM_A_RUNTIME_RUNS, theStartValues: async (command: string[]) => ({ command, env: {}, start: null }), theClaudeCodeEnvironment: () => ({}), theSecretsFor: () => ({ lines: [], says: '', file: null, quiet: true, warning: null }),
      askTheOffice: async (_api: any, path: string, options: any = {}) => {
        if (options.method === 'PATCH') { record.data = { ...record.data, ...options.body.dataPatch }; expect(validateData('session', record.data).ok).toBe(true); events.push('saved'); return { status: 200, body: { record } } }
        if (path.startsWith('/api/checks/')) { events.push('acknowledged'); return { status: 200, body: { chapters: module.savedChaptersLine(record.data.extra.roundChapters) } } }
        return { status: 200, body: { record } }
      },
      startThroughTheHelper: async (_sb: any, _who: any, words: string[]) => { events.push('started'); passed = words; return {} },
      printTheStart: () => {}, sayWhatWasStarted: () => {}, writeTheUseLine: async () => {}, say: (s: string) => said.push(s),
      refuse: (s: string) => { throw new Error(s) }, usage: (s: string) => { throw new Error(s) },
    }
    for (const name of ['theCodexCommand', 'theOpenCodeCommand', 'theClaudeCodeCommand']) globals[name] = actual(name, globals)
    if (readFileSync(launcher, 'utf8').includes('function theStandingStagesFor(')) globals['theStandingStagesFor'] = actual('theStandingStagesFor', globals)
    // A ROUND CONTINUES ITS RUN when the run's worktree is there and holds the rules file, as the made-up run's does. The
    // launcher's own declarations decide it, as they do in a real round.
    for (const name of ['whyARoundCannotWorkIn', 'whyARoundStartsANewConversation']) if (readFileSync(launcher, 'utf8').includes(`function ${name}(`)) globals[name] = actual(name, globals)
    for (const name of ['theAreaTheDoorSetIsTheDeclaredOne', 'theDeclaredAreaIsSetForTheRun']) if (readFileSync(launcher, 'utf8').includes(`function ${name}(`)) globals[name] = actual(name, globals)
    await actual('commandRound', globals)()
    expect(events, 'snapshot must be saved before any runtime starts').toEqual(['filed', 'saved', 'acknowledged', 'started'])
    const manifest = record.data.extra.roundChapters
    expect(manifest.kind).toBe('synthetic'); expect(manifest.territory).toEqual(['garden'])
    expect(record.data.extra.retained).toBe('keep'); expect(record.data.territory).toEqual(['garden'])
    expect(filedArgs.brief.startsWith(join(f.dir, 'out'))).toBe(true)
    const delivered = readFileSync(filedArgs.brief, 'utf8')
    expect(delivered).toContain(readFileSync(f.brief, 'utf8'))
    // CHAPTER 2 IS THE OFFICE'S, and the worktree's CODE.md, which holds PORTS under its chapter 2, is not given. The round
    // is given the chapters at outline: each chapter's heading and its first line that is not empty, which in the CODE.md
    // text made from the office is the chapter's title in bold. The rule's words are under "### The rules", one read away.
    expect(delivered).toContain(`**${MADE_UP_CHAPTER_2.title}**`); expect(delivered).not.toContain(MADE_UP_CHAPTER_2.rules[0]!.text)
    expect(delivered).toContain('CHOSEN'); expect(delivered).toContain('GARDEN')
    expect(delivered).toContain(module.roundChaptersOutline(manifest))
    for (const omitted of ['PORTS', 'CHILD', 'TESTS', 'OMITTED', 'OTHER', 'KITCHEN']) expect(delivered).not.toContain(omitted)
    expect(said.join('\n')).toContain(`Chapter 2 — ${MADE_UP_CHAPTER_2.label}`)
    expect(said.join('\n')).toContain('Common / Local / Chosen')
    expect(said.join('\n')).not.toContain('Omitted')
    if (runtime === 'codex' || runtime === 'opencode') {
      // THE BRIEF IS IN NO WORD OF THE COMMAND: the helper gives it to the program on its standard input.
      expect(passed.filter(word => word.includes(delivered))).toEqual([])
      expect(filedArgs.command).toContain(runtime === 'codex' ? 'resume' : '--session')
      // AN OPENCODE ROUND RUNS ON THE DATABASE FILE THAT HOLDS ITS SESSION, and passes that file to the helper.
      const at = passed.indexOf('--opencode-database')
      if (runtime === 'opencode') expect(passed.slice(at, at + 2), 'the round passed no OpenCode database').toEqual(['--opencode-database', 'opencode-agent-synthetic.db'])
    } else if (runtime === 'claude-code' && !direct) {
      expect(filedArgs.command.slice(0, 2)).toEqual(['sh', '-c'])
      expect(filedArgs.command[2]).toContain("< '" + filedArgs.brief + "'")
    }
    if (runtime !== 'codex' && runtime !== 'opencode') expect(passed).toContain(filedArgs.brief)
    if (direct) expect(passed.slice(passed.indexOf('--stdin') + 1, passed.indexOf('--stdin') + 2)).toEqual([filedArgs.brief])
    return { manifest, delivered, said, module }
  }

  it.each([['codex', true], ['opencode', true], ['claude-code', true], ['claude-code', false], ['dsh', false]])('%s, direct stdin %s', async (runtime, direct) => {
    // A BRIEF THAT NAMES NO LINE IS DELIVERED BYTE FOR BYTE AS BEFORE the backlog: the brief, then the person's
    // regulations as the office answered them, here none, then the rules.
    const { manifest, delivered, module } = await aRoundStarts(String(runtime), Boolean(direct))
    expect(manifest.backlog).toBeUndefined()
    expect(manifest.regulations.text).toBe(module.regulationsText(manifest.regulations.at, []))
    expect(delivered).toBe(manifest.brief.text + '\n\n---\n\n' + manifest.regulations.text + '\n\n---\n\n' + module.WHERE_A_NAME_IS_DEFINED + '\n\n' + module.roundChaptersGivenText(manifest))
  })

  it('a round whose brief names a line starts against an office with no backlog door, and its brief says so in one sentence that points to the file', async () => {
    const heard: string[] = []
    const standIn = createServer((req, res) => {
      heard.push(String(req.url))
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify(noSuchEndpoint('GET', String(req.url), [])))
    })
    await new Promise<void>((done) => standIn.listen(0, '127.0.0.1', done))
    try {
      const { manifest, delivered, said } = await aRoundStarts('claude-code', false, `http://127.0.0.1:${String((standIn.address() as AddressInfo).port)}`)
      // THE ROUND THEN ASKS ITS AGENT'S ROLE FOR THE STANDING STAGES, and the 404 leaves it to start with none.
      expect(heard).toEqual(['/api/backlog?line=made-up-line', '/api/participants/agent/synthetic'])
      const sentence = 'This office has no backlog door (it answered GET /api/backlog with 404), so this round reads its items in briefs/REQUIREMENTS.md as before.'
      expect(manifest.backlog).toMatchObject({ line: 'made-up-line', named: ['2'], from: 'the file', items: [], text: sentence })
      expect(delivered.startsWith(manifest.brief.text + '\n\n---\n\n' + manifest.regulations.text + '\n\n---\n\n' + sentence + '\n\n---\n\n')).toBe(true)
      expect(said.join('\n')).toContain('Backlog of line made-up-line: none from the office; this round reads briefs/REQUIREMENTS.md.')
    } finally {
      await new Promise((done) => standIn.close(done))
    }
  })
})
