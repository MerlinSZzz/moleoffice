// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUND THE OFFICE STARTS ITSELF STARTS, AND SAVES ITS TERRITORY (30 October 2026). The message worker starts a round
 * as the office: it holds the office's key and no agent key. Since stable upgrade 10 the launcher saves the round's
 * chapter selection and its territory on the run it filed, before the model starts (saveRoundChapters). The territory
 * door lets only the run's own key, its agent's key or its agent's registered starter change territory, so the save,
 * sent as the office, was refused, the launcher exited 1, and nothing started.
 *
 * WHAT THIS FILE PROVES, on a made-up office in this process, through the real commandRound of tools/sandbox.mjs:
 *   1. A next round the office starts is filed with a key of its own, saves its chapter selection and its territory,
 *      and starts.
 *   2. A territory write on such a run by an agent that is not its agent's starter, with that agent's own key, is still
 *      refused, and the territory stays as it was.
 *
 * MUTATIONS, each after a green control run and each restored: listed by the Code commit that makes them possible.
 *
 * Every fixture is synthetic: the agents, the runs, the sandbox folder and the brief are made up here, and nothing
 * reaches the live server. The run is filed as tools/register-a-run.mjs files it, and the helper that would start the
 * model is not run: the case notes that it was asked.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PROGRAM_A_RUNTIME_RUNS } from '../src/config/launcher-selection.mjs'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { ROUND_LAUNCHER_RUNTIME } from '../src/shared/next-round.ts'
import * as backlog from '../src/shared/round-chapters/backlog.ts'
import * as delivery from '../src/shared/round-chapters/delivery.ts'
import * as manifest from '../src/shared/round-chapters/manifest.ts'
import * as roundStartRules from '../src/shared/round-start-rules.ts'
import { THE_LAUNCHER_ASKS_AS } from '../src/worker/runtimes/round.ts'
import { aRunWithNoTitleARoundCanTakeWords, officeHeaders, theAgentsOwnWorktree, whyARunMayNotWorkIn } from '../tools/sandbox-common.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, theOfficesKeyHeader, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { madeUpRound, theMadeUpOfficesAnswer, THE_MADE_UP_OFFICE_WITH_CHAPTER_2 } from './round-chapters-fixture.ts'

const launcher = resolve('tools/sandbox.mjs')
const standingFile = resolve('src/shared/round-chapters/standing.ts')
const delegationsFile = resolve('src/shared/round-start-delegations.ts')
const STARTER = 'office-round-starter'
const OTHER = 'office-round-other'
const A_MADE_UP_MODEL = 'claude-made-up-office-round-1'

/** As in the neighbouring round tests: run the actual declaration, with external boundaries made up. */
function actual(name: string, globals: Record<string, unknown>) {
  const source = readFileSync(launcher, 'utf8')
  let start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\n}\n', start)
  if (source.slice(start - 6, start) === 'async ') start -= 6
  if (start < 0 || end < 0) throw new Error(`Missing launcher declaration ${name}`)
  return runInNewContext(`(${source.slice(start, end + 2)})`, globals, { filename: launcher }) as (...args: any[]) => any
}

describe('a round the office starts itself', () => {
  let t: TestDb
  let app: FastifyInstance
  const ids: Record<string, string> = {}
  const keys: Record<string, string> = {}
  let asPerson: Record<string, string>
  let asTheWorker: Record<string, string>
  const asAgent = (handle: string): Record<string, string> => ({
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(keys[handle] === undefined ? {} : { 'x-mole-office-key': keys[handle] }),
  })
  /** One request to the made-up office, answered as the launcher's askTheOffice answers. */
  async function ask(path: string, { method = 'GET', headers = {}, body, workspace }: { method?: string; headers?: Record<string, string>; body?: unknown; workspace?: string } = {}) {
    const r = await app.inject({
      method: method as 'GET' | 'POST' | 'PATCH',
      url: path,
      headers: { ...(workspace === undefined ? {} : { 'x-mole-office-workspace': workspace }), ...headers },
      ...(body === undefined ? {} : { payload: body as never }),
    })
    return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
  }
  async function register(handle: string, headers: Record<string, string>, payload: Record<string, unknown>) {
    const r = await ask('/api/agents/started', { method: 'POST', headers, body: { handle, name: `Synthetic ${handle}`, runtime: 'claude-code', ...payload } })
    expect(r.status, r.raw).toBe(201)
    ids[handle] = String(r.body['agent'].id)
    const key = r.body['whatToGiveIt']?.key
    if (typeof key === 'string' && key !== '') keys[handle] = key
  }
  /** A line: an agent whose work is under work/, started by the starter. */
  async function aLine(handle: string): Promise<string> {
    await register(handle, asAgent(STARTER), { workArea: ['work'] })
    return handle
  }
  /** The office writes this as itself: the actor of a fixture planted the way the office plants it. */
  const asTheOfficeWritesIt = async () => ({ type: 'system', id: (await import('../src/shared/participants.ts')).moleOffice().id }) as const

  /**
   * THE OFFICE STARTS THE NEXT ROUND OF `line`, as the message worker does: a run of the line before, whose next round
   * is planted as `starting` with the worker's launcher run, and the real commandRound asked as the worker with the
   * office's key in MOLE_AGENT_KEY, the way the round launcher gives it. Answers what the start did.
   */
  async function theOfficeStartsARound(line: string) {
    const f = madeUpRound()
    const before = t.api.createRecord({
      kind: 'session', title: `Synthetic round before of ${line}`, workspaceId: 'default', actor: { type: 'agent', id: ids[STARTER]! }, origin: 'fixture',
      data: { state: 'running', servingAgent: line, servingAgentId: ids[line], runtime: 'claude-code', model: A_MADE_UP_MODEL, workingDirectory: f.worktree, cutFrom: 'main' },
    }).id
    const wrapper = await ask('/api/records', {
      method: 'POST', headers: asTheWorker,
      body: { kind: 'session', title: `Synthetic launcher run for the round after ${before}`, data: { state: 'running', runtime: ROUND_LAUNCHER_RUNTIME, doing: 'starting a synthetic next round; this run runs no model', workingDirectory: f.worktree, startedByMoleOffice: true, extra: { purpose: 'round', round: before } } },
    })
    expect(wrapper.status, wrapper.raw).toBe(201)
    const launcherRun = String(wrapper.body['record'].id)
    const bytes = readFileSync(f.brief)
    t.api.writeTheNextRound(before, {
      state: 'starting',
      askedAt: '2026-10-30 00:30:00',
      askedBy: { who: { id: (await import('../src/shared/participants.ts')).moleOffice().id }, as: 'the office' },
      brief: { path: f.brief, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length },
      sandbox: { folder: f.dir, instance: basename(f.dir), container: 'synthetic-container-row' },
      starting: { at: '2026-10-30 00:31:00', wrapper: launcherRun, model: A_MADE_UP_MODEL, modelSays: 'Synthetic: the model the run before named.' },
    }, await asTheOfficeWritesIt())

    const events: string[] = []
    let filed: { id: string; key: string | null } | null = null
    const who = { agent: THE_LAUNCHER_ASKS_AS, session: launcherRun }
    const globals: Record<string, any> = {
      ...delivery, ...manifest, ...backlog, ...roundStartRules, ...existsSync(standingFile) ? await import(standingFile) : {}, ...existsSync(delegationsFile) ? await import(delegationsFile) : {}, Buffer, existsSync, statSync, readFileSync, join, resolve, officeHeaders,
      chosen: { runtime: 'claude-code', agent: line, brief: f.brief, continues: before }, A_WORKERS_RUNTIME: 'claude-code',
      aWorkersWords: () => 'synthetic', theAddressARunCommitsAt: () => {}, whoIsAsking: () => who,
      // THE COMPACTION WINDOW, which the real one reads from the office's settings, is made up: no Claude Code is started here.
      theClaudeCodeVariablesInASandbox: () => ({ variables: [], window: { tokens: '200000', from: 'a made-up setting' } }),
      aSandboxToStartIn: async () => ({ dir: f.dir, name: 'synthetic', workspace: 'default' }),
      theAgentIsRegistered: async () => {}, theSandboxHasTheRuntimeLogin: () => {}, nothingOfItStillRuns: async () => {},
      // THE RUN BEFORE, read from its record with its title, which a round given no --title takes, as the real one reads it.
      theRunARoundContinues: async () => ({ run: before, data: t.api.getRecord(before)!.data, title: t.api.getRecord(before)!.title, entry: {} }),
      aRunWithNoTitleARoundCanTakeWords, theAgentsOwnWorktree, whyARunMayNotWorkIn,
      theRoundsRunWasFiledHere: async () => {}, theNameClaudeTakes: (s: string) => s, theNameCodexTakes: (s: string) => s,
      theCodexThreadOf: () => null, theOpenCodeSessionOf: () => null, refreshMainBeforeRun: () => {}, theHelperTakesStdin: () => false,
      theBriefWithTheStartingWords: (_sb: unknown, _runtime: string, brief: string) => brief,
      theClaudeCodeCommand: ({ brief }: { brief: string }) => ['claude', brief],
      THE_PROGRAM_A_RUNTIME_RUNS, theStartValues: async (command: string[]) => ({ command, env: {}, start: null }), theClaudeCodeEnvironment: () => ({}), theSecretsFor: () => ({ lines: [] }),
      api: 'http://made-up-office.invalid',
      askTheOffice: (_api: string, path: string, options: any) => ask(path, options),
      // THE STANDING STAGES ARE READ FROM THE MADE-UP OFFICE, as the launcher's ask reads them. ITS TWO RULES DOORS ANSWER
      // AS A MADE-UP OFFICE THAT HOLDS ONLY A MADE-UP CHAPTER 2, the chapter the round's policy selects, which this test
      // office does not hold.
      askTheOfficeWhileItRestarts: (_api: string, path: string, options: any) => {
        if (path.startsWith('/api/backlog')) throw new Error('The made-up brief names no line, so no backlog is asked.')
        const rules = theMadeUpOfficesAnswer(path, THE_MADE_UP_OFFICE_WITH_CHAPTER_2)
        return rules !== null ? Promise.resolve({ status: 200, body: rules }) : ask(path, options)
      },
      // FILED AS tools/register-a-run.mjs FILES IT: as the caller, its session the parent, derived from the run it continues.
      anAgentsRunFiledHere: async (sb: { workspace: string }, asker: typeof who, args: Record<string, any>) => {
        events.push('filed')
        const r = await ask('/api/records', {
          method: 'POST', headers: { ...globals['theCallerNamed'](sb.workspace, asker), 'content-type': 'application/json' },
          body: {
            kind: 'session', title: args['title'],
            data: { state: 'running', runtime: args['runtime'], model: args['model'], servingAgent: args['agent'], servingAgentId: ids[args['agent']], workingDirectory: args['worktree'], cutFrom: args['cutFrom'], parentAttachment: asker.session },
            links: [{ type: 'derived_from', toId: args['continues'] }],
          },
        })
        expect(r.status, r.raw).toBe(201)
        const key = typeof r.body['runKey']?.key === 'string' ? String(r.body['runKey'].key) : null
        filed = { id: String(r.body['record'].id), key }
        return { id: filed.id, key, agent: args['agent'], model: args['model'], words: ['--filed', filed.id] }
      },
      startThroughTheHelper: async () => { events.push('started'); return {} },
      printTheStart: () => {}, sayWhatWasStarted: () => {}, writeTheUseLine: async () => {}, say: () => {},
      refuse: (s: string) => { throw new Error(s) }, usage: (s: string) => { throw new Error(s) },
    }
    globals['theCallerNamed'] = actual('theCallerNamed', globals)
    if (readFileSync(launcher, 'utf8').includes('function theStandingStagesFor(')) globals['theStandingStagesFor'] = actual('theStandingStagesFor', globals)
    // A ROUND CONTINUES THE RUN --continues NAMES when that run ran on the round's runtime and its worktree, the made-up
    // one, holds the rules file. The launcher's own declarations decide it, as they do in a real round.
    for (const name of ['whyARoundCannotWorkIn', 'whyARoundStartsANewConversation']) globals[name] = actual(name, globals)
    for (const name of ['theAreaTheDoorSetIsTheDeclaredOne', 'theDeclaredAreaIsSetForTheRun']) globals[name] = actual(name, globals)

    const keyBefore = process.env['MOLE_AGENT_KEY']
    process.env['MOLE_AGENT_KEY'] = theOfficesKeyHeader()['x-mole-office-key']
    let failed: string | null = null
    try {
      await actual('commandRound', globals)()
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error)
    } finally {
      if (keyBefore === undefined) delete process.env['MOLE_AGENT_KEY']
      else process.env['MOLE_AGENT_KEY'] = keyBefore
    }
    return { failed, events, filed: filed as { id: string; key: string | null } | null, before }
  }

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, ...thePersonsKeyHeader() }
    asTheWorker = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_LAUNCHER_ASKS_AS, ...theOfficesKeyHeader() }
    await register(STARTER, asPerson, { workArea: ['work'], role: 'supervisor' })
    await register(OTHER, asPerson, { workArea: ['work'], role: 'supervisor' })
  }, 60_000)
  afterAll(async () => {
    await app?.close(); t?.close()
  })

  it('1. starts, filed with a key of its own, and saves its chapter selection and its territory first', async () => {
    const round = await theOfficeStartsARound(await aLine('office-round-line-one'))
    expect(round.failed).toBeNull()
    expect(round.events).toEqual(['filed', 'started'])
    // THE OFFICE GAVE THE ROUND'S RUN A KEY OF ITS OWN, and the run before says its next round started as that run.
    expect(round.filed?.key).toEqual(expect.any(String))
    expect(t.api.getRecord(round.before)!.data['nextRound']).toMatchObject({ state: 'started', started: { run: round.filed!.id } })
    const data = t.api.getRecord(round.filed!.id)!.data
    expect(data['territory']).toEqual(['garden'])
    expect(manifest.savedRoundChapters(data)?.territory).toEqual(['garden'])
  })

  it('2. a territory write by an agent that is not its agent\'s starter is still refused, and the territory stays', async () => {
    const round = await theOfficeStartsARound(await aLine('office-round-line-two'))
    expect(round.filed).not.toBeNull()
    const run = round.filed!.id
    const territory = t.api.getRecord(run)!.data['territory']
    const written = await ask(`/api/records/${run}`, { method: 'PATCH', headers: asAgent(OTHER), body: { dataPatch: { territory: ['kitchen'] } } })
    expect(written.status, written.raw).toBe(403)
    expect(written.body['error']).toBe(sayInEnglish('territory.onlyWriters'))
    expect(t.api.getRecord(run)!.data['territory']).toEqual(territory)
  })
})
