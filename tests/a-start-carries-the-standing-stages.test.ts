// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START CARRIES THE FLOWS' STANDING STAGES (item 22, 30 October 2026). A supervisor read the standing rules of its
 * line and copied them into each worker brief by hand, and on 30 October a worker brief left one out: print the office
 * variables only with the one tool that masks them. The office's flows now mark such stages `standing`. The launcher
 * reads them from the office when it starts a round or a worker, and gives them to that start whatever the brief says.
 *
 * WHAT THIS FILE PROVES, on a made-up office in this process, through the real commandWorker, commandExec and
 * commandRound of tools/sandbox.mjs:
 *   1. The records door takes a flow stage marked standing, and refuses a mark that is not true or false.
 *   2. A worker started with a brief that omits the office-variables line still receives it, for each runtime `worker`
 *      starts: the marked stage's words, with the flow and the revision they were read at, come before the brief, so
 *      the brief still ends with its own last step. A stage not marked is not given. Every read goes through the
 *      launcher's ask that waits while the office restarts.
 *   3. An OpenCode worker started with `exec` gets them in its command's last word, which is the text of its brief; a
 *      command whose last word is not that text is refused, and nothing is filed. A last word that is the short prompt
 *      naming the brief's file, as a brief too long for one argument is given, becomes the short prompt naming the
 *      delivered brief; a short prompt naming another file is refused, and nothing is filed.
 *   4. A round's saved chapter selection names the flow and its revision, its delivered brief carries the stages right
 *      after the brief, and the office's check door acknowledges that selection.
 *   5. A marked stage changed later: the next start is given the new words and names the new revision.
 *   6. An office that answers today's flow shape, with no stage marked, starts the worker with its brief unchanged,
 *      byte for byte, and says so in one line.
 *   7. A refused or missing answer (401, 403, no answer, a list it cannot read) starts the worker without them, its
 *      brief unchanged, and says why in one sentence.
 *   8. A marked stage that cannot be read stops the start, and nothing is filed.
 *   9. A saved selection whose standing stages are not the text their flows give is refused when it is read, and so is
 *      one that gives none and does not say why.
 *
 * MUTATIONS, each after a green control run and each restored: listed by the Code commit that makes them possible.
 *
 * Every fixture is synthetic: the agents, the flows, their stages, the sandbox folder and the briefs are made up here,
 * and nothing reaches the live server. The helper that would start the model is not run: each case notes what it was
 * asked to start.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PROGRAM_A_RUNTIME_RUNS } from '../src/config/launcher-selection.mjs'
import { whyNotPlainPaths } from '../src/config/a-workers-left-out-paths.mjs'
import { FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import * as backlog from '../src/shared/round-chapters/backlog.ts'
import * as delivery from '../src/shared/round-chapters/delivery.ts'
import * as manifest from '../src/shared/round-chapters/manifest.ts'
import * as standingStages from '../src/shared/round-chapters/standing.ts'
import * as routerHost from '../tools/provider-router-host.mjs'
import { aRunWithNoTitleARoundCanTakeWords, askTheOfficeWhileItRestarts, theAgentsOwnWorktree, whyARunMayNotWorkIn } from '../tools/sandbox-common.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { madeUpRound } from './round-chapters-fixture.ts'

const launcher = resolve('tools/sandbox.mjs')
const delegationsFile = resolve('src/shared/round-start-delegations.ts')
const SUPERVISOR = 'standing-stages-supervisor'
const WORKER = 'standing-stages-worker'

/** As in the neighbouring round tests: run the actual declaration, with external boundaries made up. */
function actual(name: string, globals: Record<string, unknown>) {
  const source = readFileSync(launcher, 'utf8')
  let start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\n}\n', start)
  if (source.slice(start - 6, start) === 'async ') start -= 6
  if (start < 0 || end < 0) throw new Error(`Missing launcher declaration ${name}`)
  return runInNewContext(`(${source.slice(start, end + 2)})`, globals, { filename: launcher }) as (...args: any[]) => any
}

/** The launcher's helpers that call one another, each its actual declaration, put into the same globals. */
// whyARoundCannotWorkIn and whyARoundStartsANewConversation decide that a round continues the made-up run, whose worktree
// is there and holds the rules file, as they decide it in a real round.
const LAUNCHER_HELPERS = ['theStandingStagesFor', 'whyARoundCannotWorkIn', 'whyARoundStartsANewConversation', 'theAreaTheDoorSetIsTheDeclaredOne', 'theDeclaredAreaIsSetForTheRun']

/** A made-up worker brief. It names no way to print the office variables, and it ends with its own last step. */
const A_WORKER_BRIEF = 'Made-up worker brief: water the made-up beds.\nIt names no tool for the office variables.\nFinish with the made-up last step.\n'

type Answer = { status: number | null; body?: unknown; why?: string }
type Ask = (path: string, options: { workspace?: string; headers?: Record<string, string> }) => Promise<Answer>

describe('a start carries the standing stages of the flows that apply to it', () => {
  let t: TestDb
  let app: FastifyInstance
  const keys: Record<string, string> = {}
  let asPerson: Record<string, string>
  const asAgent = (handle: string, workspace = 'default'): Record<string, string> => ({
    'x-mole-office-workspace': workspace,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(keys[handle] === undefined ? {} : { 'x-mole-office-key': keys[handle] }),
  })
  async function inject(path: string, { method = 'GET', headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
    const r = await app.inject({ method: method as 'GET' | 'POST' | 'PATCH', url: path, headers, ...(body === undefined ? {} : { payload: body as never }) })
    return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
  }
  /** The made-up office, asked as the launcher's ask is: the project in the workspace header, the caller's own headers. */
  const theMadeUpOffice: Ask = async (path, options) => {
    const r = await inject(path, { headers: { ...(options.workspace === undefined ? {} : { 'x-mole-office-workspace': options.workspace }), ...options.headers } })
    return { status: r.status, body: r.body }
  }
  async function register(handle: string, headers: Record<string, string>, payload: Record<string, unknown>) {
    const r = await inject('/api/agents/started', { method: 'POST', headers, body: { handle, name: `Made-up ${handle}`, runtime: 'claude-code', ...payload } })
    expect(r.status, r.raw).toBe(201)
    const key = r.body['whatToGiveIt']?.key
    if (typeof key === 'string' && key !== '') keys[handle] = key
  }

  /** A made-up source each stage rests on, as a flow stage needs one. */
  const aSource = (title: string) => t.api.createRecord({ kind: 'report', title: `Made-up source of ${title}`, data: { blocks: [] }, workspaceId: 'default', actor: t.api.HUMAN }).id
  /** A made-up general flow for workers and supervisors: one stage not marked, and the stages given here. */
  function aFlow(title: string, marked: { does: string; standing?: unknown }[]): string {
    const source = aSource(title)
    const stages = [{ does: `Made-up stage of ${title} that is not standing: water the made-up beds.` }, ...marked]
      .map((stage, i) => ({ n: i + 1, ...stage, why: `Made-up why ${i + 1}.`, sources: [source] }))
    try {
      return t.api.createRecord({
        kind: 'flow', title, workspaceId: 'default', actor: t.api.HUMAN,
        data: { declared_in: 'tools/test-kettle.mjs', runs: 'the office itself', trigger: `A made-up trigger for ${title}.`, stages, leaves_behind: 'a made-up served kettle', applies_to: { scope: 'general', roles: ['worker', 'supervisor'] } },
      }).id
    } catch (error) {
      throw new Error(`The office would not file a flow with a stage marked standing: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  /** The flow's revision, as the record door answers it. */
  const revisionOf = async (id: string) => String((await inject(`/api/records/${id}`, { headers: asPerson })).body['version'])

  /** The globals every made-up start shares. `ask` answers the launcher's ask that waits while the office restarts. */
  async function theGlobals(f: ReturnType<typeof madeUpRound>, ask: Ask, chosen: Record<string, unknown>) {
    const events: string[] = []; const said: string[] = []; const heard: string[] = []
    let filed: Record<string, any> | null = null; let passed: string[] = []
    // WHAT THE CODE GAVE THIS START, or which of it refused the start and in what words, kept so a case reads the start's
    // words from the code that makes them and not from a copy of them.
    const gave: { standing?: manifest.StandingStages; refused?: { by: string; words: string } } = {}
    const refusedBy = (by: string) => (error: unknown): never => {
      gave.refused = { by, words: error instanceof Error ? error.message : String(error) }
      throw error
    }
    const record: { data: Record<string, any> } = { data: { extra: {} } }
    const globals: Record<string, any> = {
      ...delivery, ...manifest, ...backlog, ...standingStages, ...existsSync(delegationsFile) ? await import(delegationsFile) : {},
      readTheStandingStages: async (input: Parameters<typeof standingStages.readTheStandingStages>[0]) => {
        try { return (gave.standing = await standingStages.readTheStandingStages(input)) } catch (error) { return refusedBy('readTheStandingStages')(error) }
      },
      theBriefWithTheStandingStages: (input: Parameters<typeof delivery.theBriefWithTheStandingStages>[0]) => {
        try { return delivery.theBriefWithTheStandingStages(input) } catch (error) { return refusedBy('theBriefWithTheStandingStages')(error) }
      },
      Buffer, existsSync, statSync, readFileSync, resolve, join, FULL_PERMISSIONS, THE_PROGRAM_A_RUNTIME_RUNS, whyNotPlainPaths,
      chosen: { secret: [], image: [], ...chosen }, A_WORKERS_RUNTIME: 'claude-code', api: 'http://made-up-office.invalid',
      aWorkersWords: () => 'synthetic', theAddressARunCommitsAt: () => {}, theCommitAddress: () => {}, whoIsAsking: () => ({ agent: SUPERVISOR, session: null }),
      // THE COMPACTION WINDOW, which the real one reads from the office's settings, is made up: no Claude Code is started here.
      theClaudeCodeVariablesInASandbox: () => ({ variables: [], window: { tokens: '200000', from: 'a made-up setting' } }),
      aSandboxToStartIn: async () => ({ dir: f.dir, name: 'synthetic', instance: 'synthetic', workspace: 'default', helper: join(f.dir, 'made-up-helper.mjs') }),
      theAgentIsRegistered: async () => {}, theSandboxHasTheRuntimeLogin: () => {}, nothingOfItStillRuns: async () => {},
      // THE RUN BEFORE, with the title a round given no --title takes, as the real one reads it from the run's record.
      // It ran on the round's runtime, as a run a round continues does: the real theRoundsRunWasFiledHere refuses one
      // that names another runtime or none, and a round keeps the model only of a run on its own runtime.
      theRunARoundContinues: async () => ({ run: 'prior', data: { runtime: chosen['runtime'], workingDirectory: f.worktree, cutFrom: 'synthetic-base', model: 'openai/synthetic-model', territory: ['prior-territory'] }, title: 'A made-up run before the round', entry: {} }),
      aRunWithNoTitleARoundCanTakeWords, theAgentsOwnWorktree, whyARunMayNotWorkIn,
      theRoundsRunWasFiledHere: async () => {}, theNameClaudeTakes: (s: string) => s, theNameCodexTakes: (s: string) => s,
      theCodexThreadOf: () => null, theOpenCodeSessionOf: () => null, refreshMainBeforeRun: () => {}, theHelperTakesStdin: () => true,
      theBriefInside: (_dir: string, path: string) => path, aCommandsRuntime: () => null, prepareOpenCodeBeforeFiling: () => {},
      theBriefWithTheStartingWords: (_sb: unknown, _runtime: string, path: string) => path,
      theCodexCommand: () => ['codex', 'exec', '-'], theOpenCodeCommand: () => ['opencode', 'run'],
      theClaudeCodeCommand: ({ brief }: any) => ['claude', brief],
      theStartValues: async (command: string[]) => ({ command, env: {}, start: null }), theClaudeCodeEnvironment: () => ({ env: {}, from: {} }), theSecretsFor: () => ({ lines: [] }),
      theCallerNamed: (workspace: string, who: { agent: string }) => asAgent(who.agent, workspace),
      // THE CHECK BEFORE A START ON GO, the actual one, in an environment with the provider router off: it answers null,
      // and the start is as it was asked. The launcher hands it its sandboxes folder, a made-up one here.
      sandboxes: join(f.dir, 'made-up-sandboxes'),
      theStartWhenEveryGoSlotIsUsedUp: (given: Parameters<typeof routerHost.theStartWhenEveryGoSlotIsUsedUp>[0]) => routerHost.theStartWhenEveryGoSlotIsUsedUp({ ...given, env: {} }),
      askTheOfficeWhileItRestarts: (_api: string, path: string, options: any) => { heard.push(path); return ask(path, options) },
      askTheOffice: async (_api: string, path: string, options: any = {}) => {
        // THE ROUND'S RUN, made up: what the round saves on it, and the acknowledgement the check door would give.
        if (options.method === 'PATCH') { record.data = { ...record.data, ...options.body.dataPatch }; events.push('saved'); return { status: 200, body: { record } } }
        if (path.startsWith('/api/checks/')) { events.push('acknowledged'); return { status: 200, body: { chapters: manifest.savedChaptersLine(record.data['extra'].roundChapters) } } }
        return { status: 200, body: { record } }
      },
      anAgentsRunFiledHere: async (_sb: unknown, _who: unknown, args: Record<string, any>) => { filed = args; events.push('filed'); return { id: 'filed', words: ['--filed', 'filed'] } },
      startThroughTheHelper: async (_sb: unknown, _who: unknown, words: string[]) => { events.push('started'); passed = words; return {} },
      printTheStart: () => {}, sayWhatWasStarted: () => {}, writeTheUseLine: async () => {}, say: (s: string) => said.push(s),
      refuse: (s: string) => { throw new Error(s) }, usage: (s: string) => { throw new Error(s) },
    }
    for (const name of LAUNCHER_HELPERS) if (readFileSync(launcher, 'utf8').includes(`function ${name}(`)) globals[name] = actual(name, globals)
    writeFileSync(join(f.dir, 'made-up-helper.mjs'), '// Made-up helper: nothing reads it.\n')
    return { globals, events, said, heard, record, gave, filed: () => filed, passed: () => passed }
  }

  /** The real commandWorker, for one runtime, with a made-up worker brief. Answers what it filed and what it said. */
  async function aWorkerStarts(runtime: string, ask: Ask = theMadeUpOffice) {
    const f = madeUpRound()
    const brief = join(f.dir, 'briefs', 'worker.md'); writeFileSync(brief, A_WORKER_BRIEF)
    const run = await theGlobals(f, ask, { runtime, agent: WORKER, brief, model: runtime === 'codex' || runtime === 'opencode' ? 'openai/made-up-model' : 'claude-made-up-model' })
    let failed: string | null = null
    try { await actual('commandWorker', run.globals)() } catch (error) { failed = error instanceof Error ? error.message : String(error) }
    const filed = run.filed()
    return { f, brief, failed, filed, events: run.events, said: run.said.join('\n'), heard: run.heard, gave: run.gave, passed: run.passed(), delivered: filed === null ? null : readFileSync(String(filed['brief']), 'utf8') }
  }

  /**
   * THE ONE LINE A START SAYS, in the words the code makes of what the start read: the role, and this flow's count at this
   * revision among the flows it read. The cases share one office, so a later start also reads the flows the earlier cases
   * filed, each named on the same line.
   */
  function expectTheLineNames(said: string, standing: manifest.StandingStages | undefined, role: string, n: number, flow: string, revision: string) {
    expect(standing, said).toBeDefined()
    expect(standing!.role).toBe(role)
    const read = standing!.flows.find((one) => one.id === flow)
    expect(read?.version, said).toBe(revision)
    expect(read?.stages).toHaveLength(n)
    expect(said.split('\n')).toContain(manifest.standingStagesLine(standing!))
  }

  /** What every runtime's start must show: the given brief, ending with the worker's own brief, and how it reaches the program. */
  function expectTheStartCarries(start: Awaited<ReturnType<typeof aWorkerStarts>>, runtime: string, words: string[], flow: string, revision: string) {
    expect(start.failed).toBeNull()
    expect(start.events).toEqual(['filed', 'started'])
    expect(readFileSync(start.brief, 'utf8'), 'the brief itself names no tool for the office variables').not.toContain('office-variables.mjs')
    const delivered = start.delivered!
    for (const said of words) expect(delivered).toContain(said)
    expect(delivered).toContain(flow); expect(delivered).toContain(revision)
    expect(delivered).not.toContain('that is not standing')
    // THE BRIEF STILL ENDS WITH ITS OWN LAST STEP: the stages come before it, and are separated from it.
    expect(delivered.endsWith('\n\n---\n\n' + A_WORKER_BRIEF)).toBe(true)
    expect(String(start.filed!['brief']).startsWith(join(start.f.dir, 'out'))).toBe(true)
    if (runtime === 'dsh') expect(start.filed!['command']).toBeNull()
    else {
      // THE BRIEF GOES BY ITS PATH, as the program's standard input, and no word of the command holds it.
      const at = start.passed.indexOf('--stdin')
      expect(start.passed.slice(at, at + 2)).toEqual(['--stdin', start.filed!['brief']])
      expect(start.filed!['command'].filter((word: string) => word.includes(delivered))).toEqual([])
    }
    expectTheLineNames(start.said, start.gave.standing, 'worker', words.length, flow, revision)
  }

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, ...thePersonsKeyHeader() }
    await register(SUPERVISOR, asPerson, { workArea: ['work'], role: 'supervisor' })
    await register(WORKER, asAgent(SUPERVISOR), { workArea: ['work'], role: 'worker' })
  }, 60_000)
  afterAll(async () => {
    await app?.close(); t?.close()
  })

  it('1. the records door takes a stage marked standing, and refuses a mark that is not true or false', async () => {
    const source = aSource('case 1')
    const aFlowWith = (standing: unknown) => inject('/api/records', {
      method: 'POST', headers: asPerson,
      body: { kind: 'flow', title: `Made-up flow marked ${JSON.stringify(standing)}`, data: {
        declared_in: 'tools/test-kettle.mjs', runs: 'the office itself', trigger: 'A made-up trigger.', leaves_behind: 'a made-up served kettle',
        stages: [{ n: 1, does: 'Made-up stage one.', why: 'Made-up why.', sources: [source], standing }],
      } },
    })
    const taken = await aFlowWith(true)
    expect(taken.status, taken.raw).toBe(201)
    expect(taken.body['record'].data.stages[0].standing).toBe(true)
    const refused = await aFlowWith('yes')
    expect(refused.status, refused.raw).toBe(400)
    expect(refused.raw).toContain('standing')
  })

  it.each(['claude-code', 'codex', 'dsh', 'opencode'])('2. a %s worker whose brief omits the office-variables line still receives it', async (runtime) => {
    const words = `Made-up standing stage for ${runtime}: print the office variables only with tools/office-variables.mjs, never through a mask of your own.`
    const flow = aFlow(`Made-up flow of case 2, ${runtime}`, [{ does: words, standing: true }])
    const start = await aWorkerStarts(runtime)
    expectTheStartCarries(start, runtime, [words], flow, await revisionOf(flow))
    // EVERY READ THROUGH THE ASK THAT WAITS WHILE THE OFFICE RESTARTS: the worker's role, the flows for it, and each flow.
    expect(start.heard).toContain(`/api/participants/agent/${WORKER}`)
    expect(start.heard.some((path) => path.startsWith('/api/flows?role=worker'))).toBe(true)
    expect(start.heard).toContain(`/api/records/${flow}`)
  })

  it('3. an OpenCode worker started with exec gets them in its last word, and a last word that is not its brief is refused', async () => {
    const words = 'Made-up standing stage for exec: run git fetch origin once before the seal.'
    const flow = aFlow('Made-up flow of case 3', [{ does: words, standing: true }])
    const execs = async (lastWord: (brief: string) => string) => {
      const f = madeUpRound()
      const brief = join(f.dir, 'briefs', 'worker.md'); writeFileSync(brief, A_WORKER_BRIEF)
      const run = await theGlobals(f, theMadeUpOffice, {
        targets: ['synthetic'], agent: WORKER, runtime: 'opencode', brief, command: ['opencode', 'run', '--format', 'json', lastWord(readFileSync(brief, 'utf8'))],
      })
      let failed: string | null = null
      try { await actual('commandExec', run.globals)() } catch (error) { failed = error instanceof Error ? error.message : String(error) }
      return { ...run, failed, filed: run.filed(), passed: run.passed() }
    }
    const given = await execs((text) => text)
    expect(given.failed).toBeNull()
    const delivered = readFileSync(String(given.filed!['brief']), 'utf8')
    expect(delivered).toContain(words); expect(delivered).toContain(flow)
    expect(delivered.endsWith('\n\n---\n\n' + A_WORKER_BRIEF)).toBe(true)
    expect(given.filed!['command'].at(-1)).toBe(delivered)
    expect(given.passed.at(-1)).toBe(delivered)

    const other = await execs(() => 'Made-up words that are not the brief.')
    expect(other.gave.refused).toEqual({ by: 'theBriefWithTheStandingStages', words: other.failed })
    expect(other.failed ?? 'it started').toContain('last word')
    expect(other.events).toEqual([])
  })

  it('3. an OpenCode worker started with exec may name its brief file in a short prompt, and a short prompt naming another file is refused', async () => {
    const words = 'Made-up standing stage for exec by file: keep the made-up beds watered.'
    const flow = aFlow('Made-up flow of case 3, by file', [{ does: words, standing: true }])
    // THE SHORT PROMPT, in the words the requirement gives, written out here so a change of them turns this case red.
    const aShortPrompt = (file: string) => `Your brief for this round is the file ${file}. Read it whole before you do anything, and follow it.`
    const execs = async (named: (brief: string, dir: string) => string) => {
      const f = madeUpRound()
      const brief = join(f.dir, 'briefs', 'worker.md'); writeFileSync(brief, A_WORKER_BRIEF)
      const run = await theGlobals(f, theMadeUpOffice, {
        targets: ['synthetic'], agent: WORKER, runtime: 'opencode', brief, command: ['opencode', 'run', '--format', 'json', aShortPrompt(named(brief, f.dir))],
      })
      let failed: string | null = null
      try { await actual('commandExec', run.globals)() } catch (error) { failed = error instanceof Error ? error.message : String(error) }
      return { ...run, f, failed, filed: run.filed(), passed: run.passed() }
    }
    const given = await execs((brief) => brief)
    expect(given.failed).toBeNull()
    const delivered = String(given.filed!['brief'])
    expect(delivered.startsWith(join(given.f.dir, 'out'))).toBe(true)
    const text = readFileSync(delivered, 'utf8')
    expect(text).toContain(words); expect(text).toContain(flow)
    expect(text.endsWith('\n\n---\n\n' + A_WORKER_BRIEF)).toBe(true)
    expect(given.filed!['command'].at(-1)).toBe(aShortPrompt(delivered))
    expect(given.passed.at(-1)).toBe(aShortPrompt(delivered))

    const other = await execs((_brief, dir) => { const elsewhere = join(dir, 'briefs', 'another.md'); writeFileSync(elsewhere, A_WORKER_BRIEF); return elsewhere })
    expect(other.gave.refused).toEqual({ by: 'theBriefWithTheStandingStages', words: other.failed })
    expect(other.failed ?? 'it started').toContain('last word')
    expect(other.events).toEqual([])
  })

  it('4. a round names the flow and its revision in its saved selection, carries the stages after its brief, and is acknowledged', async () => {
    const words = 'Made-up standing stage for a round: keep the proofs of a carried test file.'
    const flow = aFlow('Made-up flow of case 4', [{ does: words, standing: true }])
    const f = madeUpRound()
    const run = await theGlobals(f, theMadeUpOffice, { runtime: 'claude-code', agent: SUPERVISOR, brief: f.brief })
    await actual('commandRound', run.globals)()
    expect(run.events).toEqual(['filed', 'saved', 'acknowledged', 'started'])
    const saved = manifest.readRoundChapters(run.record.data['extra'].roundChapters) as Record<string, any>
    expect(saved['standing']?.role).toBe('supervisor')
    expect(saved['standing'].flows).toContainEqual(expect.objectContaining({ id: flow, version: await revisionOf(flow), stages: [{ n: 2, does: words }] }))
    const delivered = readFileSync(String(run.filed()!['brief']), 'utf8')
    expect(delivered.startsWith(saved['brief'].text + '\n\n---\n\n' + saved['standing'].text + '\n\n---\n\n')).toBe(true)
    expect(saved['standing'].text).toContain(words)
    expect(saved['standing'].bytes).toBe(manifest.bytes(saved['standing'].text))
    expectTheLineNames(run.said.join('\n'), run.gave.standing, 'supervisor', 1, flow, await revisionOf(flow))

    // THE OFFICE'S OWN CHECK DOOR ACKNOWLEDGES THAT VERY SELECTION, saved on a made-up round's run as the launcher saves it.
    const round = t.api.createRecord({ kind: 'session', title: 'Made-up round with standing stages', workspaceId: 'default', actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: { state: 'running', servingAgent: WORKER } })
    const notice = await delivery.saveRoundChapters({ id: round.id, manifest: saved as manifest.RoundChapters, request: async (method, path, body) => {
      const r = await inject(path, { method, headers: asAgent(SUPERVISOR), body })
      return { status: r.status, body: r.body }
    } })
    expect(notice).toBeNull()
    const stored = manifest.savedRoundChapters(t.api.getRecord(round.id)!.data)!
    expect(manifest.deliveredRoundBrief(stored)).toBe(delivered)
  })

  it('5. a marked stage changed later: the next start is given the new words and names the new revision', async () => {
    const before = 'Made-up standing stage, first words: name the earlier run for a carried proof.'
    const after = 'Made-up standing stage, later words: name the earlier run and its report for a carried proof.'
    const flow = aFlow('Made-up flow of case 5', [{ does: before, standing: true }])
    const first = await aWorkerStarts('claude-code')
    expectTheStartCarries(first, 'claude-code', [before], flow, await revisionOf(flow))

    const record = t.api.getRecord(flow)!
    const stages = (record.data['stages'] as Record<string, unknown>[]).map((stage) => stage['n'] === 2 ? { ...stage, does: after } : stage)
    const changed = await inject(`/api/records/${flow}`, { method: 'PATCH', headers: asPerson, body: { dataPatch: {
      stages, step_changes: [{ at: '2026-10-30 12:00:00', what: 'Stage 2 says to name the report too.', why: 'Made-up why of the change.', cause: aSource('case 5 change') }],
    } } })
    expect(changed.status, changed.raw).toBe(200)
    const revision = await revisionOf(flow)
    expect(first.delivered).not.toContain(revision)
    const next = await aWorkerStarts('claude-code')
    expectTheStartCarries(next, 'claude-code', [after], flow, revision)
    expect(next.delivered).not.toContain(before)
  })

  it('6. an office that answers today\'s flow shape, with no stage marked, starts the worker with its brief unchanged and says so', async () => {
    // A STAND-IN OF TODAY'S OFFICE on a port of its own, asked through the launcher's own ask: the role, a page of
    // flows, and a flow whose stages hold no standing mark at all.
    const heard: string[] = []
    const standIn = createServer((req, res) => {
      const url = String(req.url); heard.push(url)
      const answer = url.startsWith('/api/participants/agent/') ? { participant: { id: 'made-up-id', handle: WORKER, role: 'worker', roleReadAs: 'worker' } }
        : url.startsWith('/api/flows?') ? { flows: [], matched: 0, returned: 0, left: 0, next: null, projects: ['default'], sort: 'recent', runsNamingNoFlow: 0, general: { flows: [{ id: 'made-up-flow', project: 'default', title: 'Made-up flow of today' }], matched: 1 }, replaced: { matched: 0, retired: 0, flows: null }, notClassified: 0 }
          : url === '/api/records/made-up-flow' ? { record: { id: 'made-up-flow', kind: 'flow', title: 'Made-up flow of today', data: { stages: [{ n: 1, does: 'Made-up stage of today.', evidence: 'a made-up record' }] } }, version: 'made-up-version' }
            : null
      res.writeHead(answer === null ? 404 : 200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(answer ?? { error: 'Made-up: no such door.' }))
    })
    await new Promise<void>((done) => standIn.listen(0, '127.0.0.1', done))
    try {
      const office = `http://127.0.0.1:${String((standIn.address() as AddressInfo).port)}`
      for (const runtime of ['claude-code', 'opencode']) {
        const start = await aWorkerStarts(runtime, (path, options) => askTheOfficeWhileItRestarts(office, path, options, { longestMs: 1_000 }))
        expect(start.failed).toBeNull()
        expect(start.events).toEqual(['filed', 'started'])
        expect(start.filed!['brief']).toBe(start.brief)
        expect(start.delivered).toBe(A_WORKER_BRIEF)
        const at = start.passed.indexOf('--stdin')
        expect(start.passed.slice(at, at + 2)).toEqual(['--stdin', start.brief])
        expect(start.gave.standing?.flows).toEqual([])
        expect(standingStages.theStandingStagesWereRead(start.gave.standing!), 'the office answered every read').toBe(true)
        expect(start.said.split('\n')).toContain(manifest.standingStagesLine(start.gave.standing!))
      }
      expect(heard).toContain('/api/records/made-up-flow')
    } finally {
      await new Promise((done) => standIn.close(done))
    }
  })

  it('7. a refused or missing answer starts the worker without them, its brief unchanged, and says why in one sentence', async () => {
    const answers: [string, (path: string) => Answer | null][] = [
      ['401', (path) => path.startsWith('/api/participants/') ? { status: 401, body: { error: 'Made-up: no key.' } } : null],
      ['403', (path) => path.startsWith('/api/flows?') ? { status: 403, body: { error: 'Made-up: not yours to read.' } } : null],
      ['no answer', (path) => path.startsWith('/api/records/') ? { status: null, why: 'made-up: the connection was still refused' } : null],
      ['a list it cannot read', (path) => path.startsWith('/api/flows?') ? { status: 200, body: { made: 'up' } } : null],
    ]
    aFlow('Made-up flow of case 7', [{ does: 'Made-up standing stage of case 7.', standing: true }])
    for (const [what, answer] of answers) {
      const start = await aWorkerStarts('claude-code', async (path, options) => answer(path) ?? theMadeUpOffice(path, options))
      expect(start.failed, what).toBeNull()
      expect(start.events, what).toEqual(['filed', 'started'])
      expect(start.delivered, what).toBe(A_WORKER_BRIEF)
      expect(standingStages.theStandingStagesWereRead(start.gave.standing!), what).toBe(false)
      expect(start.said.split('\n'), what).toContain(manifest.standingStagesLine(start.gave.standing!))
      expect(start.said.split('\n').filter((line) => line.includes('standing')), what).toHaveLength(1)
    }
  })

  it('8. a marked stage that cannot be read stops the start, and nothing is filed', async () => {
    const unreadable: [string, Record<string, unknown>][] = [
      ['a mark that is not true or false', { record: { id: 'made-up-flow', kind: 'flow', title: 'Made-up flow', data: { stages: [{ n: 1, does: 'Made-up.', standing: 'yes' }] } }, version: 'made-up-version' }],
      ['a marked stage with no words', { record: { id: 'made-up-flow', kind: 'flow', title: 'Made-up flow', data: { stages: [{ n: 1, does: ' ', standing: true }] } }, version: 'made-up-version' }],
      ['a marked stage of a flow with no revision', { record: { id: 'made-up-flow', kind: 'flow', title: 'Made-up flow', data: { stages: [{ n: 1, does: 'Made-up.', standing: true }] } } }],
    ]
    for (const [what, body] of unreadable) {
      const start = await aWorkerStarts('claude-code', async (path, options) => {
        if (path.startsWith('/api/flows?')) return { status: 200, body: { flows: [], next: null, general: { flows: [{ id: 'made-up-flow', project: 'default' }], matched: 1 } } }
        if (path === '/api/records/made-up-flow') return { status: 200, body }
        return theMadeUpOffice(path, options)
      })
      expect(start.gave.refused, what).toEqual({ by: 'readTheStandingStages', words: start.failed })
      expect(start.events, what).toEqual([])
    }
  })

  it('9. a saved selection whose standing stages are not the text their flows give is refused, and so is one that gives none and says nothing', () => {
    const f = madeUpRound()
    const saved = delivery.prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief }).manifest
    const flows = [{ id: 'made-up-flow', title: 'Made-up flow of case 9', version: 'made-up-version', stages: [{ n: 2, does: 'Made-up standing stage of case 9.' }] }]
    const text = 'Made-up words that are not the text the flows give.'
    const read = (standing: Record<string, unknown>) => {
      try { manifest.readRoundChapters({ ...saved, standing }); return 'it was read' } catch (error) { return error instanceof Error ? error.message : String(error) }
    }
    // THE TEXT ALONE DECIDES: the same selection is read with the text its flows give, and refused with any other.
    const given = manifest.standingStagesText('worker', flows)
    expect(read({ role: 'worker', flows, text: given, bytes: manifest.bytes(given) })).toBe('it was read')
    const notTheirText = read({ role: 'worker', flows, text, bytes: manifest.bytes(text) })
    expect(notTheirText).not.toBe('it was read')
    // ONE THAT GIVES NONE is read when it says why, and refused for the same reason when it says nothing.
    expect(read({ role: 'worker', flows: [], text: '', bytes: 0, says: 'Made-up: no flow was read.' })).toBe('it was read')
    expect(read({ role: 'worker', flows: [], text: '', bytes: 0 })).toBe(notTheirText)
  })
})
