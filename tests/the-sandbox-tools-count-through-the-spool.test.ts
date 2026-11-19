// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TEN CHECKS OF THE SANDBOX TOOLS ARE COUNTED THROUGH THE GATE-COUNT SPOOL (wave 13n round Y, item 2l).
 *
 * Round H's table gave the sandbox tools 18 checks, and 13r gave each its gate row. The office counts one of them
 * itself. Ten of the other 17 are met only by the sandbox tool on the host, in tools/sandbox.mjs and
 * tools/sandbox-common.mjs, and each of those ten calls the one writer, spoolAGateMet in src/config/gate-count-spool.mjs,
 * under the sandbox it is about. A check counts where it finds what its row forbids, or where it reminds. It does not
 * count where something could not be read or asked, since then nobody knows whether the row was met. The other seven
 * wait on GATES_THE_SPOOL_WAITS_FOR, each with the reason its words end with.
 *
 * Most cases cut the one function out of the tool's source and run it with made-up readers, as
 * tests/sandbox-launcher.test.ts does. Two start the tool itself: a template whose raise has no reason, and the size
 * warning, against a stand-in office on the loopback. The tool is never pointed at a real office.
 *
 * WHERE THE SPOOL IS HERE. The writer works out the spool from the home. The setup file gives this test file a home of
 * its own, and a tool it starts inherits that home, so every line here lands under it. The first case asks that.
 *
 * MUTATIONS, each planted alone after a control run:
 *   - take a site's call out, or move it to a refusal its row does not count: that site's cases;
 *   - give a call another gate, position or sandbox, or call it twice: that site's counted case;
 *   - refresh main outside the refresh lock, or keep the lock after the refresh: the refresh cases;
 *   - leave the counting sentence out of a row's words, or keep a counted row waiting: the rows case;
 *   - give the world copy's row the old reason, or a site: the waiting case;
 *   - read the template's limits before its name in `up`: the spawned raise case;
 *   - let theContainerRowNamed say nothing of a ledger it could not read: the marking case;
 *   - count the size warning before the office has taken it: the size warning case.
 */
import { spawn } from 'node:child_process'
import { constants, closeSync, existsSync, fstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spoolAGateMet, THE_GATE_COUNT_SPOOL_FOLDER } from '../src/config/gate-count-spool.mjs'
import { GATES } from '../src/config/gates.mjs'
import { theCodexRolloutFor } from '../src/config/codex-log.mjs'
import { momentOfAnInstant } from '../src/shared/time.ts'
import { ID_LABEL, SANDBOX_DEFAULTS, SANDBOX_FOLDER_WARNING, THE_SHARED_OPENCODE_DATABASE, theOpenCodeDatabaseOf, theSandboxLimits } from '../tools/sandbox-common.mjs'
import { FAKE_DU } from './sandbox-stand-ins.ts'
import { aStampOf, emptyATestsOwnSpool, theLinesIn, theRealSpools, theSpoolUnder } from './the-gate-count-spool-under-a-home.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const SANDBOX = 'a-made-up-sandbox'
const AGENT = 'a-made-up-agent'

/** One function of the sandbox tool, cut out of its source and run with `globals` as all it can see. */
function cutOut(name: string, globals: Record<string, unknown>): (...args: any[]) => any {
  const source = readFileSync(TOOL, 'utf8')
  let start = source.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`The function ${name} was not found in ${TOOL}`)
  if (source.slice(start - 6, start) === 'async ') start -= 6
  const end = source.indexOf('\n}\n', start)
  if (end < 0) throw new Error(`The end of the function ${name} was not found in ${TOOL}`)
  return runInNewContext(`(${source.slice(start, end + 2)})`, globals, {filename: TOOL})
}
/** A one-line constant of the sandbox tool, from its source, so a change to it changes this test too. */
function launcherConstant(name: string): unknown {
  const line = readFileSync(TOOL, 'utf8').split('\n').find((one) => one.startsWith(`const ${name} = `))
  if (line === undefined) throw new Error(`The constant ${name} was not found in ${TOOL}`)
  return runInNewContext(`(${line.slice(line.indexOf(' = ') + 3)})`, {})
}
/** The tool's refusal, which here throws its sentence. */
const refuse = (sentence: string): never => { throw new Error(sentence) }

/** The one position the gate's row allows, which is the one its tool acts by. */
function theOnePositionOf(gate: string): string {
  const row = GATES.find((one) => one.id === gate)
  const allowed = row?.positions.kind === 'block-remind-off' ? row.positions.allowed : undefined
  expect(allowed, gate).toHaveLength(1)
  return allowed![0]!
}

/** Runs `act`, and says the spool holds nothing new after it, or exactly one line of `gate` under `sandbox`. */
async function theCountOf(act: () => unknown, counted: {gate: string; sandbox: string} | null): Promise<unknown> {
  emptyATestsOwnSpool(THE_GATE_COUNT_SPOOL_FOLDER)
  const before = aStampOf(new Date())
  let result: unknown
  try { result = await act() } finally {
    const after = aStampOf(new Date())
    const lines = theLinesIn(THE_GATE_COUNT_SPOOL_FOLDER)
    if (counted === null) expect(lines, 'nothing is counted').toEqual([])
    else {
      expect(lines, `${counted.gate} is counted once`).toHaveLength(1)
      expect(lines[0]).toEqual({gate: counted.gate, position: theOnePositionOf(counted.gate), at: lines[0]!.at, sandbox: counted.sandbox})
      expect(lines[0]!.at >= before && lines[0]!.at <= after, lines[0]!.at).toBe(true)
    }
  }
  return result
}
/** `act` is refused with words that match `words`, and is counted once, as `gate` under `sandbox`, or not at all. */
async function refusedAndCounted(words: RegExp, act: () => unknown, counted: {gate: string; sandbox: string} | null): Promise<void> {
  await theCountOf(async () => { await expect(Promise.resolve().then(act)).rejects.toThrow(words) }, counted)
}

let scratch = ''
beforeEach(() => {
  emptyATestsOwnSpool(THE_GATE_COUNT_SPOOL_FOLDER)
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-the-sandbox-tools-count-'))
})
afterEach(() => {
  rmSync(scratch, {recursive: true, force: true})
})

describe('the rows', () => {
  // The ground the rest stands on: no line written in this file, or by a tool it starts, can reach the real spool.
  it("are written under this test file's own home", () => {
    expect(THE_GATE_COUNT_SPOOL_FOLDER).toBe(theSpoolUnder(homedir()))
    expect(homedir()).toBe(process.env.HOME)
    for (const real of theRealSpools()) expect(THE_GATE_COUNT_SPOOL_FOLDER, real).not.toBe(real)
  })

})

describe('a raise without its reason, or not above the default', () => {
  const where = "a made-up template's sandbox.json"
  const above = `${Number(SANDBOX_DEFAULTS.memory.slice(0, -1)) * 2}g`
  const REASON = 'A made-up build that needs more memory than the default gives.'

  // Mutation: take the call out of either refusal, or give it null for the sandbox.
  it('is refused and counted once, under the sandbox it was to bring up', async () => {
    const counted = {gate: 'a-raise-has-a-reason-and-goes-up', sandbox: SANDBOX}
    await refusedAndCounted(/raises memory without its reason/, () => theSandboxLimits({memory: above, because: 'more'}, where, SANDBOX), counted)
    await refusedAndCounted(/raises memory without its reason/, () => theSandboxLimits({memory: above}, where, SANDBOX), counted)
    await refusedAndCounted(/which is not above the default/, () => theSandboxLimits({memory: SANDBOX_DEFAULTS.memory, because: REASON}, where, SANDBOX), counted)
  })

  // Mutation: count a raise refused for its form or its limit, or count a good raise.
  it('is not counted when the raise is refused for its form or its limit, or is sound', async () => {
    await refusedAndCounted(/which is not/, () => theSandboxLimits({memory: '48GB', because: REASON}, where, SANDBOX), null)
    await refusedAndCounted(/which a template may not raise/, () => theSandboxLimits({cpuShares: '512', because: REASON}, where, SANDBOX), null)
    await refusedAndCounted(/that is not an object/, () => theSandboxLimits([], where, SANDBOX), null)
    await refusedAndCounted(/that raises nothing/, () => theSandboxLimits({because: REASON}, where, SANDBOX), null)
    expect(await theCountOf(() => theSandboxLimits({memory: above, because: REASON}, where, SANDBOX), null)).toEqual({...SANDBOX_DEFAULTS, memory: above})
  })

  // Mutation: read the template's limits before the sandbox's name in `up`.
  it('is counted under its name when `up` refuses the template, and nothing is made', async () => {
    const template = join(scratch, 'a-made-up-template')
    mkdirSync(template)
    writeFileSync(join(template, 'devcontainer.json'), '{}\n')
    writeFileSync(join(template, 'sandbox.json'), `${JSON.stringify({template: 'a-made-up-template', raises: {memory: above, because: 'more'}})}\n`)
    const sandboxes = join(scratch, 'sandboxes')
    const ran = await theCountOf(() => theTool(['up', template, '--name', SANDBOX, '--sandboxes', sandboxes, '--api', 'http://127.0.0.1:9', '--workspace', 'default', '--as', AGENT, '--session', 'a-made-up-session']), {gate: 'a-raise-has-a-reason-and-goes-up', sandbox: SANDBOX})
    expect(ran).toMatchObject({status: 1})
    expect((ran as Ran).err).toContain('raises memory without its reason')
    expect(existsSync(join(sandboxes, SANDBOX))).toBe(false)
  })
})

interface Ran { status: number | null; out: string; err: string }
/** The sandbox tool, started as its own process with this test's home and no office of anyone's. */
function theTool(args: string[], env: NodeJS.ProcessEnv = {}): Promise<Ran> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [TOOL, ...args], {env: {...withoutInheritedEffort(), ...env}})
    let out = '', err = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('close', (status) => done({status, out, err}))
  })
}

describe('a reminder of other sandboxes that use the GPU', () => {
  const gpu = {DeviceRequests: [{Capabilities: [['gpu']]}]}
  const aContainer = (id: string, name: string, running = true, host: unknown = gpu) => ({Id: id, State: {Running: running}, Config: {Labels: {[ID_LABEL]: name}}, HostConfig: host})
  /** The reminder for SANDBOX, with docker's running containers as given, or a list docker could not give. */
  async function remind(containers: ReturnType<typeof aContainer>[] | 'unlisted'): Promise<string[]> {
    const said: string[] = []
    const read = cutOut('remindOfOtherGpuSandboxes', {
      api: 'http://127.0.0.1:9', ID_LABEL, asksForAGpu: cutOut('asksForAGpu', {}), spoolAGateMet,
      say: (line: string) => said.push(line), theCallerNamed: () => ({}), theOfficeSaid: () => 'a made-up answer',
      askTheOffice: async () => ({status: 200, body: {secondLevel: {line: []}}}),
      spawnSync: (program: string, argv: string[]) => {
        expect(program).toBe('docker')
        if (argv[0] === 'ps') return containers === 'unlisted' ? {status: 1, stderr: 'a made-up failure'} : {status: 0, stdout: containers.map((one) => one.Id).join('\n')}
        const container = containers === 'unlisted' ? undefined : containers.find((one) => one.Id === argv.at(-1))
        return {status: 0, stdout: JSON.stringify([container])}
      },
    })
    await read(SANDBOX, 'default', {agent: AGENT, session: 'a-made-up-session'})
    return said
  }

  // Mutation: take the call out, count once for each sandbox named, or count before the others are known.
  it('is counted once for a start that reminds, however many it names, under the sandbox that starts', async () => {
    const said = await theCountOf(() => remind([aContainer('c1', 'another-sandbox'), aContainer('c2', 'a-third-sandbox'), aContainer('c3', SANDBOX)]), {gate: 'other-gpu-sandboxes-reminder', sandbox: SANDBOX})
    expect((said as string[]).filter((line) => line.startsWith('GPU reminder:'))).toHaveLength(2)
  })

  // Mutation: count where docker could not list the sandboxes, or where nothing was said.
  it('is not counted when docker cannot list the sandboxes, or no other running sandbox asks for a GPU', async () => {
    expect(await theCountOf(() => remind('unlisted'), null)).toEqual([expect.stringContaining('GPU overlap could not be checked')])
    expect(await theCountOf(() => remind([aContainer('c3', SANDBOX)]), null)).toEqual([])
    expect(await theCountOf(() => remind([aContainer('c1', 'another-sandbox', true, {})]), null)).toEqual([])
    expect(await theCountOf(() => remind([aContainer('c1', 'another-sandbox', false)]), null)).toEqual([])
  })
})

describe("a refresh of main from the sandbox's own checkout", () => {
  const FROM = '/a-made-up/checkout'
  /**
   * A refresh of SANDBOX's main, with git's answers as given. The refresh runs under the refresh lock, so the lock is a
   * stand-in that counts how often it is taken and let go of, and the refresh is cut out beside the function that holds it.
   */
  function refresh(from: unknown, answers: {upstream?: number; address?: {address: string | null; isTheFolderItself: boolean}; fetched?: number}): string {
    const sb: Record<string, any> = {name: SANDBOX, dir: '/a-made-up/sandbox', instance: {from, container: {name: 'a-made-up-container'}}}
    const lock = {taken: 0, letGo: 0}
    const globals: Record<string, unknown> = {
      join, isAbsolute, spoolAGateMet, say: () => {},
      A_REFRESH_GIT_CALL_MS: launcherConstant('A_REFRESH_GIT_CALL_MS'),
      theRefreshLockOf: () => { lock.taken += 1; return () => { lock.letGo += 1 } },
      outsideTheCommitInLines: () => { throw new Error('No working tree is read here') },
      fastForwardInside: () => { throw new Error('Nothing is fast-forwarded here') },
      theAddressGitWouldFetch: () => answers.address ?? {address: FROM, isTheFolderItself: true},
      guardedGitRun: (_repo: string, args: string[]) => {
        if (args[0] === 'fetch') return {status: answers.fetched ?? 0, stderr: 'a made-up failure'}
        if (args[0] === 'rev-parse') return {status: answers.upstream ?? 0, stdout: 'a-made-up-commit\n'}
        throw new Error(`git ${args.join(' ')} is not asked here`)
      },
    }
    globals.theRefreshOfMain = cutOut('theRefreshOfMain', globals)
    cutOut('refreshMainBeforeRun', globals)(sb)
    expect(lock, 'the refresh lock is taken once and let go of once').toEqual({taken: 1, letGo: 1})
    return sb.mainRefreshReason
  }

  // Mutation: take either call out, or count it under another sandbox.
  it("is counted when the host's copy of the facts names no checkout, or the clone rewrites the checkout's address", async () => {
    const counted = {gate: 'main-refreshed-only-from-its-own-checkout', sandbox: SANDBOX}
    expect(await theCountOf(() => refresh(undefined, {}), counted)).toContain('names no checkout it was made from')
    expect(await theCountOf(() => refresh(FROM, {address: {address: '/elsewhere', isTheFolderItself: false}}), counted)).toContain('rewrites the address')
  })

  // Mutation: count a refresh left for a reason its row does not name, or a refresh that went on.
  it("is not counted when the checkout's main or the address cannot be read, the fetch fails, or main is already there", async () => {
    expect(await theCountOf(() => refresh(FROM, {upstream: 1}), null)).toContain('main could not be read')
    expect(await theCountOf(() => refresh(FROM, {address: {address: null, isTheFolderItself: false}}), null)).toContain('could not be read')
    expect(await theCountOf(() => refresh(FROM, {fetched: 1}), null)).toContain('the fetch of main')
    await theCountOf(() => refresh(FROM, {}), null)
  })
})

describe('a size warning', () => {
  let server: Server, api = '', refusing = false, messages = 0
  beforeEach(async () => {
    refusing = false
    messages = 0
    server = createServer(async (req, res) => {
      for await (const chunk of req) void chunk
      if (req.method !== 'POST' || req.url !== '/api/records') { res.writeHead(404).end(); return }
      if (refusing) { res.writeHead(503, {'content-type': 'application/json'}).end(JSON.stringify({error: 'a made-up refusal'})); return }
      messages += 1
      res.writeHead(201, {'content-type': 'application/json'}).end(JSON.stringify({record: {id: 'a-made-up-message'}}))
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await new Promise<void>((done) => server.close(() => done()))
  })

  // Mutation: take the call out, count before the office has taken the message, or count a folder already told.
  it('is counted once the office takes it, under the sandbox, and not when it refuses it or the folder was told', async () => {
    const sandboxes = join(scratch, 'sandboxes'), bin = join(scratch, 'bin'), folder = join(sandboxes, SANDBOX)
    mkdirSync(folder, {recursive: true})
    mkdirSync(bin)
    writeFileSync(join(folder, 'instance.json'), '{}')
    writeFileSync(join(bin, 'du'), FAKE_DU, {mode: 0o755})
    writeFileSync(join(scratch, 'state.json'), JSON.stringify({calls: [], sizes: {[folder]: SANDBOX_FOLDER_WARNING.bytes + 1}}))
    const sizes = () => theTool(['sizes', '--tell', '--sandboxes', sandboxes, '--api', api, '--workspace', 'default', '--as', 'a-made-up-watcher', '--session', 'a-made-up-session'],
      // The warning goes to the agents MOLE_OFFICE_SANDBOX_DISK_WATCHERS names; with none named nobody is told and nothing is counted.
      {MOLE_AGENT_KEY: 'a-made-up-key', MOLE_OFFICE_AGENT: 'a-made-up-watcher', MOLE_OFFICE_SANDBOX_DISK_WATCHERS: 'wren', FAKE_DOCKER_DIR: scratch, PATH: `${bin}:${process.env.PATH ?? ''}`})
    refusing = true
    const refused = await theCountOf(sizes, null) as Ran
    expect(refused.status, refused.err).not.toBe(0)
    expect(refused.err).toContain('a made-up refusal')
    refusing = false
    const told = await theCountOf(sizes, {gate: 'sandbox-folder-size-warning', sandbox: SANDBOX}) as Ran
    expect(told.status, told.err).toBe(0)
    expect(messages).toBe(1)
    const again = await theCountOf(sizes, null) as Ran
    expect(again.status, again.err).toBe(0)
    expect(messages).toBe(1)
  })
})

describe("the host's list of the runs it filed", () => {
  const anEntry = (run: string, more: Record<string, unknown> = {}) => ({run, agent: AGENT, runtime: 'codex', filedAt: '2026-10-17T10:00:00.000+00:00', started: '2026-10-17T10:00:01.000+00:00', neverStarted: null, containerSession: null, ...more})
  function theList(folder: string): unknown {
    return cutOut('theHostsList', {
      theHostsRunsFolder: () => folder, existsSync, readdirSync, readFileSync, join, momentOfAnInstant, spoolAGateMet,
      A_RUN_ID: launcherConstant('A_RUN_ID'), refuse,
    })({name: SANDBOX})
  }

  // Mutation: take the call out, or count it under another sandbox.
  it('is counted when it holds an entry the launcher could not have written', async () => {
    const counted = {gate: 'the-hosts-run-list-is-sound', sandbox: SANDBOX}
    const notJson = join(scratch, 'not-json'), aFolder = join(scratch, 'a-folder'), misnamed = join(scratch, 'misnamed')
    mkdirSync(notJson)
    writeFileSync(join(notJson, 'a-made-up-run.json'), 'not JSON')
    mkdirSync(join(aFolder, 'a-made-up-run.json'), {recursive: true})
    mkdirSync(misnamed)
    writeFileSync(join(misnamed, 'a-made-up-run.json'), JSON.stringify(anEntry('another-run')))
    await refusedAndCounted(/which is not JSON/, () => theList(notJson), counted)
    await refusedAndCounted(/which is not a file/, () => theList(aFolder), counted)
    await refusedAndCounted(/which does not name the run its file is named after/, () => theList(misnamed), counted)
  })

  // Mutation: count a list that is not there, or a sound one.
  it('is not counted when there is no list, or the list is sound', async () => {
    expect(await theCountOf(() => theList(join(scratch, 'none')), null)).toEqual([])
    const sound = join(scratch, 'sound')
    mkdirSync(sound)
    writeFileSync(join(sound, 'a-made-up-run.json'), JSON.stringify(anEntry('a-made-up-run')))
    expect(await theCountOf(() => theList(sound), null)).toEqual([anEntry('a-made-up-run')])
  })
})

describe("a round that would continue a run this agent did not start", () => {
  const anEntry = (run: string, more: Record<string, unknown> = {}) => ({run, agent: AGENT, runtime: 'codex', filedAt: '2026-10-17T10:00:00.000+00:00', started: '2026-10-17T10:00:01.000+00:00', neverStarted: null, containerSession: null, ...more})
  /** The run a round of AGENT on Codex continues, from `list`, with the record read answering `status`. */
  function theRun(list: unknown[], continues: string | undefined, status = 200): Promise<unknown> {
    return cutOut('theRunARoundContinues', {
      theHostsList: () => list, refuse, spoolAGateMet, api: 'http://127.0.0.1:9', officeHeaders: () => ({}),
      askTheOffice: async () => ({status, body: {record: {data: {servingAgent: AGENT}}}}),
      theOfficeSaid: (read: {status: number}) => `a made-up answer ${read.status}`,
      theHostsRunsFolder: () => '/a-made-up/runs', NOT_ON_THE_HOSTS_LIST: 'A made-up sentence.',
    })({name: SANDBOX, workspace: 'default'}, {agent: AGENT, session: 'a-made-up-session'}, AGENT, 'codex', continues)
  }

  // Mutation: take the call out of any of the four refusals, or count it under another sandbox.
  it("is refused and counted once, under the sandbox, by each of the host list's four refusals", async () => {
    const counted = {gate: 'a-round-continues-only-this-agents-run', sandbox: SANDBOX}
    await refusedAndCounted(/is a start of another-agent in sandbox/, () => theRun([anEntry('their-run', {agent: 'another-agent'})], 'their-run'), counted)
    await refusedAndCounted(/was filed in sandbox .* and never started/, () => theRun([anEntry('never-run', {neverStarted: 'a made-up reason'})], 'never-run'), counted)
    await refusedAndCounted(/has no run in sandbox/, () => theRun([anEntry('their-run', {agent: 'another-agent'})], undefined), counted)
    await refusedAndCounted(/does not say the helper started it/, () => theRun([anEntry('unstarted-run', {started: null})], undefined), counted)
  })

  // Mutation: count a record that could not be read, a run the round may continue, or a runtime the agent never ran
  // on, where a round starts a new conversation (tests/a-round-starts-fresh-on-another-runtime.test.ts).
  it('is not counted when the run\'s record cannot be read, the round may continue the run, or no run is on the runtime', async () => {
    await refusedAndCounted(/could not be read \(a made-up answer 503\)/, () => theRun([anEntry('a-made-up-run')], undefined, 503), null)
    await refusedAndCounted(/which --continues names, is not on the host's list/, () => theRun([], 'off-the-list', 503), null)
    expect(await theCountOf(() => theRun([anEntry('a-made-up-run')], undefined), null)).toMatchObject({run: 'a-made-up-run'})
    expect(await theCountOf(() => theRun([], 'off-the-list'), null)).toMatchObject({run: 'off-the-list', entry: null})
    expect(await theCountOf(() => theRun([anEntry('opencode-run', {runtime: 'opencode'})], undefined), null)).toBeNull()
  })
})

describe('a round whose run was filed for another agent, runtime or sandbox', () => {
  /** The checks of a round's run's record, with whyARunWasNotFiledHere answering `notHere`. */
  function theChecks(data: Record<string, unknown>, notHere: {why: string; unread: boolean} | null, entry: unknown = {containerSession: 'a-made-up-session'}): Promise<unknown> {
    return cutOut('theRoundsRunWasFiledHere', {refuse, spoolAGateMet, whyARunWasNotFiledHere: async () => notHere})(
      {name: SANDBOX, instance: {startedBy: {session: 'a-made-up-session'}}}, {agent: AGENT, session: 'a-made-up-session'}, AGENT, 'codex', 'a-made-up-run', data, entry)
  }
  const ITS = {servingAgent: AGENT, runtime: 'codex'}

  // Mutation: take the call out of any of the three refusals, or count it under another sandbox.
  it('is refused and counted once, under the sandbox', async () => {
    const counted = {gate: 'a-rounds-run-was-filed-here', sandbox: SANDBOX}
    await refusedAndCounted(/but its record says it serves "another-agent"/, () => theChecks({...ITS, servingAgent: 'another-agent'}, null), counted)
    await refusedAndCounted(/which --continues names, is not on the host's list of sandbox .* and its record says it serves "another-agent"/, () => theChecks({...ITS, servingAgent: 'another-agent'}, null, null), counted)
    await refusedAndCounted(/ran on runtime opencode, and this round requires runtime codex/, () => theChecks({...ITS, runtime: 'opencode'}, null), counted)
    await refusedAndCounted(/is on the host's list of sandbox .*, but its record says it was filed in another folder/, () => theChecks(ITS, {why: 'its record says it was filed in another folder', unread: false}), counted)
  })

  // Mutation: count a container row nobody could look for, or a run filed here.
  it('is not counted when the container row could not be looked for, or the run was filed here', async () => {
    await refusedAndCounted(/but that row could not be checked/, () => theChecks(ITS, {why: 'that row could not be checked', unread: true}), null)
    await theCountOf(() => theChecks(ITS, null), null)
  })

  // Mutation: let theContainerRowNamed not say it could not read, or say so of a row it read.
  it('says when the container row could not be looked for, and only then', async () => {
    const dir = realpathSync(scratch)
    const whyNot = (ledger: unknown[] | null, session: {status: number; resources?: unknown[]}, folder = dir) => {
      const theContainerRowNamed = cutOut('theContainerRowNamed', {
        api: 'http://127.0.0.1:9', theCallerNamed: () => ({}), theOfficeSaid: (read: {status: number}) => `a made-up answer ${read.status}`,
        theLedger: async () => (ledger === null ? {rows: null, why: 'a made-up failure'} : {rows: ledger}),
        askTheOffice: async () => ({status: session.status, body: {resources: session.resources}}),
      })
      return cutOut('whyARunWasNotFiledHere', {theContainerRowNamed, whyARunsFolderIsNotThisSandboxs: cutOut('whyARunsFolderIsNotThisSandboxs', {realpathSync})})(
        {dir, workspace: 'default', instance: {containerRow: 'the-current-row', container: {name: 'a-made-up-container'}}}, {agent: AGENT, session: 'a-made-up-session'},
        {sandbox: {folder, container: 'an-older-row'}}, 'a-made-up-session')
    }
    expect(await whyNot(null, {status: 200, resources: []})).toEqual({why: expect.stringContaining('could not be checked, because the ledger'), unread: true})
    expect(await whyNot([], {status: 503})).toEqual({why: expect.stringContaining('could not be checked, because the rows of session'), unread: true})
    expect(await whyNot([], {status: 200, resources: []})).toEqual({why: expect.stringContaining('is not a row of session'), unread: false})
    expect(await whyNot([], {status: 200, resources: []}, '/a-made-up/folder')).toEqual({why: expect.stringContaining('filed in the sandbox folder'), unread: false})
    expect(await whyNot([], {status: 200, resources: [{id: 'an-older-row', type: 'container', key: 'a-made-up-container', releasedAt: '2026-10-17 10:00:00'}]})).toBeNull()
  })
})

describe("a round reads only its run's own output", () => {
  const RUN = 'a-made-up-run'
  function theEventLines(dir: string): string[] {
    const lines: string[] = []
    cutOut('eachEventLineOf', {
      join, openSync, closeSync, readSync, realpathSync, fstatSync, statSync, fsConstants: constants, Buffer, refuse, spoolAGateMet,
      A_PIECE_OF_THE_OUTPUT: launcherConstant('A_PIECE_OF_THE_OUTPUT'), AN_EVENT_LINE_AT_MOST: launcherConstant('AN_EVENT_LINE_AT_MOST'),
    })({name: SANDBOX, dir}, RUN, (line: string) => { lines.push(line); return false })
    return lines
  }

  // Mutation: take the call out, or count it under another sandbox.
  it('is counted when the output is not a file in the run\'s folder by its real path', async () => {
    const dir = join(scratch, 'sandbox')
    mkdirSync(join(dir, 'logs', RUN), {recursive: true})
    writeFileSync(join(scratch, 'elsewhere'), '{"type":"thread.started"}\n')
    symlinkSync(join(scratch, 'elsewhere'), join(dir, 'logs', RUN, 'out'))
    await refusedAndCounted(/is not a file in .* by its real path/, () => theEventLines(dir), {gate: 'a-round-reads-only-its-runs-output', sandbox: SANDBOX})
  })

  // Mutation: count an output that could not be opened, or one that is the run's own.
  it('is not counted when the output cannot be opened, or is its own', async () => {
    const dir = join(scratch, 'sandbox')
    mkdirSync(join(dir, 'logs', RUN), {recursive: true})
    await refusedAndCounted(/could not be read/, () => theEventLines(dir), null)
    writeFileSync(join(dir, 'logs', RUN, 'out'), 'a made-up line\n{"type":"thread.started"}\n')
    expect(await theCountOf(() => theEventLines(dir), null)).toEqual(['{"type":"thread.started"}'])
  })
})

describe("a Codex round resumes only this sandbox's thread", () => {
  const THREAD = '01a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b'
  function theThread(dir: string, lines: string[]): unknown {
    return cutOut('theCodexThreadOf', {
      join, realpathSync, theCodexRolloutFor, spoolAGateMet, refuse, A_CODEX_THREAD_ID: launcherConstant('A_CODEX_THREAD_ID'),
      eachEventLineOf: (_sb: unknown, _run: string, each: (line: string) => boolean) => { for (const line of lines) if (each(line)) return },
    })({name: SANDBOX, dir}, 'a-made-up-run')
  }
  const started = (thread: string) => [JSON.stringify({type: 'thread.started', thread_id: thread})]

  // Mutation: take either call out, or count it under another sandbox.
  it("is counted when this sandbox's Codex home does not hold the thread, or is not its own folder", async () => {
    const counted = {gate: 'codex-resumes-only-this-sandboxs-thread', sandbox: SANDBOX}
    const dir = join(scratch, 'sandbox'), sessions = join(dir, 'home', '.codex', 'sessions')
    mkdirSync(join(dir, 'home', '.codex'), {recursive: true})
    await refusedAndCounted(/is not in this sandbox's own Codex home/, () => theThread(dir, started(THREAD)), counted)
    mkdirSync(join(scratch, 'elsewhere'))
    symlinkSync(join(scratch, 'elsewhere'), sessions)
    await refusedAndCounted(/is not that folder by its real path/, () => theThread(dir, started(THREAD)), counted)
    rmSync(sessions)
    mkdirSync(join(sessions, '2026', '10', '17'), {recursive: true})
    writeFileSync(join(sessions, '2026', '10', '17', 'rollout-2026-10-17T10-00-00-another-thread.jsonl'), '')
    await refusedAndCounted(/is not in this sandbox's own Codex home/, () => theThread(dir, started(THREAD)), counted)
  })

  // Mutation: count an output that names no thread, a thread of another shape, a home that cannot be read, or a held thread.
  it('is not counted when the output names no thread or one of another shape, the home cannot be read, or the thread is held', async () => {
    const dir = join(scratch, 'sandbox'), sessions = join(dir, 'home', '.codex', 'sessions')
    mkdirSync(join(dir, 'home', '.codex'), {recursive: true})
    await refusedAndCounted(/holds no thread.started event/, () => theThread(dir, ['{"type":"turn.completed"}']), null)
    await refusedAndCounted(/not the shape Codex gives a thread/, () => theThread(dir, started('--last')), null)
    symlinkSync(sessions, sessions)
    await refusedAndCounted(/could not be read/, () => theThread(dir, started(THREAD)), null)
    rmSync(sessions)
    mkdirSync(join(sessions, '2026', '10', '17'), {recursive: true})
    writeFileSync(join(sessions, '2026', '10', '17', `rollout-2026-10-17T10-00-00-${THREAD}.jsonl`), '')
    expect(await theCountOf(() => theThread(dir, started(THREAD)), null)).toBe(THREAD)
  })
})

describe("an OpenCode round resumes only this sandbox's session", () => {
  const SESSION = 'ses_aMadeUpSession'
  type Answer = {status: number; stdout: string}
  // The answers go to the databases in the order a round asks them, the agent's own file first; the last answers the rest.
  function theSession(answer: Answer | Answer[], lines = [JSON.stringify({type: 'step_start', sessionID: SESSION})]): unknown {
    const answers = [answer].flat()
    return cutOut('theOpenCodeSessionOf', {
      join, refuse, spoolAGateMet, theOpenCodeDatabaseOf, THE_SHARED_OPENCODE_DATABASE, THE_OPENCODE_SESSION_QUESTION: 'a made-up question',
      eachEventLineOf: (_sb: unknown, _run: string, each: (line: string) => boolean) => { for (const line of lines) if (each(line)) return },
      spawnSync: (program: string) => { expect(program).toBe('docker'); return answers.length > 1 ? answers.shift() : answers[0] },
    })({name: SANDBOX, dir: '/a-made-up/sandbox', instance: {container: {name: 'a-made-up-container'}}}, 'a-made-up-run', 'a-made-up-agent')
  }
  const said = (held: boolean | null) => ({status: 0, stdout: `${JSON.stringify({held, why: 'a made-up reason'})}\n`})

  // Mutation: take the call out, or count it under another sandbox.
  it('is counted when the database is asked and does not hold the session', async () => {
    await refusedAndCounted(/names an OpenCode session that is not in any OpenCode database a round of a-made-up-agent looks in/, () => theSession(said(false)), {gate: 'opencode-resumes-only-this-sandboxs-session', sandbox: SANDBOX})
  })

  // Mutation: count a database that could not be asked, an output that names no session, a held session, or a session
  // only the shared file holds.
  it('is not counted when the database cannot be asked, the output names no session, or the session is held', async () => {
    await refusedAndCounted(/could not be asked whether it holds the session/, () => theSession(said(null)), null)
    await refusedAndCounted(/could not be asked whether it holds the session/, () => theSession({status: 1, stdout: ''}), null)
    await refusedAndCounted(/must name one consistent native session identity/, () => theSession(said(false), []), null)
    expect(await theCountOf(() => theSession(said(true)), null)).toMatchObject({session: SESSION, database: 'opencode-agent-a-made-up-agent.db', says: null})
    expect(await theCountOf(() => theSession([said(false), said(true)]), null)).toMatchObject({session: SESSION, database: THE_SHARED_OPENCODE_DATABASE})
  })
})
