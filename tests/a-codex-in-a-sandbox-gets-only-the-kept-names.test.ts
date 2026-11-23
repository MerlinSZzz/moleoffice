// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A CODEX IN A SANDBOX GETS ONLY THE NAMES THE LIST KEEPS.
 *
 * Inside a sandbox, four starts share one path: a worker, a round, exec --agent, and a start from inside a sandbox all
 * run their command through the sandbox helper, tools/sandbox-start.mjs. The helper puts tools/sandbox-codex first on
 * the command's PATH. The codex there is a shell script that runs tools/codex-in-a-sandbox.mjs. That program keeps only
 * the names theEnvironmentACodexGets keeps, puts the switch that turns Codex's shell snapshot off right after the program
 * name, and becomes the first other codex on PATH with the caller's arguments unchanged.
 *
 * Cases 1 to 3 run that codex in a made-up sandbox folder. Case 4 runs it through the real helper, once for a start for
 * an agent and once with --plain-env: that is the path the four starts share, so they have this one test. Case 5 is the
 * isolated exec, which starts no helper: there the launcher narrows the env file on the host before docker create.
 * Cases 6 and 7 ask whereIsThisTool, through which the office's lookups decide whether Codex is installed: the
 * sandbox's codex, first on PATH, is not an installed Codex unless a real codex stands after it.
 *
 * WHAT IS REAL AND WHAT IS NOT. The sandbox's codex, its program, the helper and the launcher are real. Every codex they
 * find is a stand-in that writes the NAMES of its environment, its own path and its arguments to a file, never a value.
 * In cases 1 to 3, PATH holds no folder of this machine, so no codex of this machine can be found. In cases 4 and 5 the
 * stand-in comes before every folder of this machine. Docker and the devcontainer CLI are the stand-ins of
 * tests/sandbox-stand-ins.ts, and the office is the real server on a fresh test database. In cases 6 and 7 both codex
 * files are this test's own: a copy of the sandbox's codex and the stand-in. Every planted value is made up.
 *
 * Each case fails at main: there is no tools/sandbox-codex, the helper puts nothing on PATH, and the isolated env file is
 * not narrowed, so each stand-in is given the planted names and no snapshot switch. In cases 6 and 7 there is no sandbox
 * codex to copy. With the sandbox codex but before whereIsThisTool knows it, case 6 calls the copy alone an installed
 * Codex. Case 7 holds the answer that must stay when a real codex stands after the copy.
 *
 * Not covered: a shell a person opens in the sandbox with a bare docker exec. It gets the container's own PATH, which
 * does not hold tools/sandbox-codex.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { FAKE_DEVCONTAINER, FAKE_DF, FAKE_DOCKER, FAKE_DU, FAKE_FREE, startsOf, theFakeMachine, theFakeState, withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { CODEX_SHELL_SNAPSHOT_OFF } from '../src/config/run-permissions.mjs'
import { whereIsThisTool } from '../src/config/runtimes.mjs'
import { theSystemFor } from '../src/config/systems/the-system.mjs'
import { theEnvironmentACodexGets } from '../src/config/the-environment-a-codex-gets.mjs'
import { THE_FACTS_VARIABLE, theFactsAStartIsGiven } from '../tools/sandbox-common.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
/** The folder the sandbox helper puts first on a command's PATH. */
const THE_SANDBOX_CODEX = join(REPO, 'tools', 'sandbox-codex')
const linux = theSystemFor('linux')
/** The two planted names. Both values are made up. */
const PLANTED = { CLAUDE_CODE_MESSAGING_TOKEN: 'planted-not-a-token', A_MADE_UP_SERVICE_API_KEY: 'planted-not-a-key' }
const PROMPT = 'A made-up prompt.'

/** What a stand-in codex wrote: the names of its environment, its own path and its arguments. */
type Seen = { program: string; names: string[]; args: string[] }

/**
 * A STAND-IN CODEX in folder/bin. It writes the names of its environment, never a value, with its own path and its
 * arguments, to folder/seen.json.
 */
function aStandInCodex(folder: string): { bin: string; program: string; seen: string } {
  const bin = join(folder, 'bin')
  mkdirSync(bin, { recursive: true })
  const program = join(bin, 'codex')
  const seen = join(folder, 'seen.json')
  const what = 'JSON.stringify({ program: process.argv[1], names: Object.keys(process.env).sort(), args: process.argv.slice(2) })'
  writeFileSync(program, `#!${process.execPath}\nprocess.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(seen)}, ${what})\n`)
  chmodSync(program, 0o755)
  return { bin, program, seen }
}

function whatItSaw(seen: string): Seen {
  return JSON.parse(readFileSync(seen, 'utf8')) as Seen
}

/** The names among `names` that the list does not keep on Linux. For a Codex the office starts, there are none. */
function theNamesOffTheList(names: readonly string[]): string[] {
  const kept = theEnvironmentACodexGets(Object.fromEntries(names.map((name) => [name, 'a-made-up-value'])), linux)
  return names.filter((name) => !Object.hasOwn(kept, name))
}

describe.skipIf(process.platform === 'win32')('the codex the sandbox helper puts first on PATH', () => {
  let scratch = ''
  /** A folder that holds only `node`, so the sandbox's codex can start node and no codex of this machine is found. */
  let nodeAlone = ''
  /** The environment a command in a sandbox might hold: the names a Codex needs, and the two planted ones. */
  let given: Record<string, string> = {}

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'mo-codex-in-a-sandbox-'))
    nodeAlone = join(scratch, 'node-alone')
    mkdirSync(nodeAlone)
    symlinkSync(process.execPath, join(nodeAlone, 'node'))
    mkdirSync(join(scratch, 'home', '.codex'), { recursive: true })
    given = {
      ...PLANTED,
      HOME: join(scratch, 'home'),
      CODEX_HOME: join(scratch, 'home', '.codex'),
      MOLE_OFFICE_API: 'http://127.0.0.1:9',
      LC_ALL: 'C',
      SANDBOX_RUN_KEY: 'a-made-up-run-key',
    }
  })
  afterAll(() => { if (scratch !== '') rmSync(scratch, { recursive: true, force: true }) })

  /** `codex` as a command in the sandbox runs it, with PATH made of `path` alone. */
  function codexOn(path: string[], args: string[]) {
    return spawnSync('codex', args, { env: { ...given, PATH: path.join(':') }, cwd: scratch, encoding: 'utf8', timeout: 20_000 })
  }

  it('1: keeps only the listed names, gives the switch, and runs the next codex on PATH with its arguments unchanged', () => {
    const standIn = aStandInCodex(join(scratch, 'case-1'))
    const ran = codexOn([THE_SANDBOX_CODEX, standIn.bin, nodeAlone], ['exec', '--json', PROMPT])
    expect(ran.status, ran.stderr).toBe(0)
    const seen = whatItSaw(standIn.seen)
    expect(realpathSync(seen.program)).toBe(realpathSync(standIn.program))
    // EXACTLY THESE: the planted names, SANDBOX_RUN_KEY and the shell's own names are gone.
    expect(seen.names).toEqual(['CODEX_HOME', 'HOME', 'LC_ALL', 'MOLE_OFFICE_API', 'PATH'])
    // THE SWITCH FIRST, then the caller's arguments as they came, with nothing before them.
    expect(seen.args).toEqual([...CODEX_SHELL_SNAPSHOT_OFF, 'exec', '--json', PROMPT])
    expect(ran.stdout + ran.stderr).not.toContain('planted-not-a')
  })

  it('2: with no other codex on PATH, says so in one sentence, exits 127 and starts nothing', () => {
    // A CODEX THAT IS NOT EXECUTABLE is no codex to run. The only other folder holds node.
    const standIn = aStandInCodex(join(scratch, 'case-2'))
    chmodSync(standIn.program, 0o644)
    const ran = codexOn([THE_SANDBOX_CODEX, standIn.bin, nodeAlone], ['exec', PROMPT])
    expect(ran.status, ran.stderr).toBe(127)
    expect(ran.stdout).toBe('')
    const said = ran.stderr.trim()
    expect(said).not.toContain('\n')
    expect(said.endsWith('.'), said).toBe(true)
    // IT PRINTS NO VALUE: no planted value, and no folder of PATH.
    expect(said).not.toContain('planted-not-a')
    expect(said).not.toContain(scratch)
    expect(existsSync(standIn.seen)).toBe(false)
  })

  it('3: a second copy of the sandbox codex on PATH is passed over, so the switch is given once', () => {
    // TWO MADE-UP CHECKOUTS, each with its own copy of the sandbox's codex and its program, and the office's src.
    const copies = ['checkout-a', 'checkout-b'].map((name) => {
      const tools = join(scratch, name, 'tools')
      mkdirSync(join(tools, 'sandbox-codex'), { recursive: true })
      copyFileSync(join(THE_SANDBOX_CODEX, 'codex'), join(tools, 'sandbox-codex', 'codex'))
      chmodSync(join(tools, 'sandbox-codex', 'codex'), 0o755)
      copyFileSync(join(REPO, 'tools', 'codex-in-a-sandbox.mjs'), join(tools, 'codex-in-a-sandbox.mjs'))
      symlinkSync(join(REPO, 'src'), join(scratch, name, 'src'))
      return join(tools, 'sandbox-codex')
    })
    const standIn = aStandInCodex(join(scratch, 'case-3'))
    const ran = codexOn([...copies, standIn.bin, nodeAlone], ['exec', PROMPT])
    expect(ran.status, ran.stderr).toBe(0)
    const seen = whatItSaw(standIn.seen)
    expect(realpathSync(seen.program)).toBe(realpathSync(standIn.program))
    expect(seen.args).toEqual([...CODEX_SHELL_SNAPSHOT_OFF, 'exec', PROMPT])
    for (const name of Object.keys(PLANTED)) expect(seen.names).not.toContain(name)
  })
})

describe.skipIf(process.platform === 'win32')('a Codex started through the sandbox helper', () => {
  const OFFICE = {
    MOLE_OFFICE_AGENT: 'a-made-up-worker', MOLE_OFFICE_SESSION: 'a-made-up-session',
    MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_API: 'http://127.0.0.1:1',
  }
  // THE SANDBOX'S FACTS, as the launcher on the host gives them to the helper.
  const facts = { instance: 'synthetic', template: 'synthetic', containerRow: 'synthetic-container' }
  let instance = ''

  beforeAll(() => {
    instance = mkdtempSync(join(tmpdir(), 'mo-codex-helper-'))
    writeFileSync(join(instance, 'instance.json'), JSON.stringify(facts))
    mkdirSync(join(instance, 'home', '.codex'), { recursive: true })
  })
  afterAll(() => { if (instance !== '') rmSync(instance, { recursive: true, force: true }) })

  // A START FOR AN AGENT gets the office's names for its commands, and its own process row from the gate. A plain start
  // gets none of the launcher's names. Both get the names their caller gave that the list keeps.
  it.each([
    ['for-an-agent', [], ['PATH', 'HOME', 'CODEX_HOME', 'SANDBOX_DIR', THE_FACTS_VARIABLE, 'MOLE_OFFICE_API', 'MOLE_OFFICE_API_ROOT',
      'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT', 'GIT_AUTHOR_NAME', 'GIT_COMMITTER_EMAIL', 'SANDBOX_PROCESS_ROW']],
    ['plain', ['--plain-env'], ['PATH', 'HOME', 'CODEX_HOME']],
  ] as const)('4 (%s): the helper puts the sandbox codex first, so its Codex gets only listed names and the switch', async (label, flags, needed) => {
    const handshake = join(instance, label)
    mkdirSync(handshake)
    writeFileSync(join(handshake, 'row.json'), JSON.stringify({ id: 'a-made-up-row' }))
    const standIn = aStandInCodex(join(instance, `stand-in-${label}`))
    const before = existsSync(join(instance, 'logs')) ? readdirSync(join(instance, 'logs')) : []
    const env = withAPrivateTmpToSweep({
      ...withoutInheritedEffort(),
      ...OFFICE,
      ...PLANTED,
      [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(facts),
      MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
      HOME: join(instance, 'home'),
      CODEX_HOME: join(instance, 'home', '.codex'),
      PATH: `${standIn.bin}:${process.env['PATH'] ?? ''}`,
    }, instance)
    const child = spawn(process.execPath, [
      join(REPO, 'tools', 'sandbox-start.mjs'), '--instance', instance, '--cwd', instance, '--as', OFFICE.MOLE_OFFICE_AGENT,
      '--session', OFFICE.MOLE_OFFICE_SESSION, '--workspace', OFFICE.MOLE_OFFICE_WORKSPACE, '--api', OFFICE.MOLE_OFFICE_API,
      '--handshake', handshake, '--wait', '--timeout', '5', ...flags, '--', 'codex', 'exec', PROMPT,
    ], { env })
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => { out += String(c) })
    child.stderr.on('data', (c) => { err += String(c) })
    const code = await new Promise<number | null>((resolve) => child.on('close', resolve))
    expect(code, err).toBe(0)
    expect(out + err).not.toContain('planted-not-a')

    const seen = whatItSaw(standIn.seen)
    expect(realpathSync(seen.program)).toBe(realpathSync(standIn.program))
    for (const name of Object.keys(PLANTED)) expect(seen.names).not.toContain(name)
    expect(seen.names).toEqual(expect.arrayContaining([...needed]))
    expect(theNamesOffTheList(seen.names)).toEqual([])

    // THE COMMAND THE HELPER RAN, as its start.json holds it: the stand-in got the switch and then those words.
    const folder = readdirSync(join(instance, 'logs')).find((name) => !before.includes(name))!
    const record = JSON.parse(readFileSync(join(instance, 'logs', folder, 'start.json'), 'utf8')) as { command: string[] }
    expect(record.command[0]).toBe('codex')
    expect(seen.args).toEqual([...CODEX_SHELL_SNAPSHOT_OFF, ...record.command.slice(1)])
  })
})

describe.skipIf(process.platform === 'win32')('an isolated Codex run', () => {
  const WORKSPACE = 'default'
  const STARTER = 'codex-env-starter'
  const NAME = 'codex-env'
  /** The launcher's setting for the provider router. It is left out: with it on, an isolated Codex run is refused. */
  const THE_ROUTER_SETTING = 'MOLE_OFFICE_PROVIDER_ROUTER'
  type ResourcesLib = typeof import('../src/server/lib/resources.ts')

  let t: TestDb
  let res: ResourcesLib
  let app: FastifyInstance
  let api = ''
  let scratch = ''
  let sandboxes = ''
  let fakes = ''
  let dir = ''
  let starterKey = ''
  let starterSession = ''
  /** Every process group a case started, stopped at the end if its leader still works in the scratch. */
  const groups = new Set<number>()

  const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()

  /** The launcher as its own process, as the starter, with the starter's key. */
  function sandbox(args: string[]): Promise<{ status: number; out: string; err: string }> {
    const env: NodeJS.ProcessEnv = {
      ...withoutInheritedEffort(),
      PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
      FAKE_DOCKER_DIR: fakes,
      MOLE_OFFICE_AGENT: STARTER,
      MOLE_OFFICE_SESSION: starterSession,
      MOLE_AGENT_KEY: starterKey,
    }
    delete env[THE_ROUTER_SETTING]
    const cut = args.indexOf('--')
    const before = cut === -1 ? args : args.slice(0, cut)
    const after = cut === -1 ? [] : args.slice(cut)
    return new Promise((done) => {
      const child = spawn(process.execPath, [join(REPO, 'tools', 'sandbox.mjs'), ...before, '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE, ...after], { env, detached: true, cwd: scratch })
      if (child.pid !== undefined) groups.add(child.pid)
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => { out += String(c) })
      child.stderr.on('data', (c) => { err += String(c) })
      child.on('close', (code) => done({ status: code ?? 1, out, err }))
    })
  }

  async function ask(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
    const r = await fetch(`${api}${path}`, {
      method,
      headers: {
        ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
        'x-mole-office-workspace': WORKSPACE,
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': STARTER,
        ...(starterSession === '' ? {} : { 'x-mole-office-session': starterSession }),
        ...(starterKey === '' ? {} : { 'x-mole-office-key': starterKey }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }

  beforeAll(async () => {
    t = await freshDb()
    res = await import('../src/server/lib/resources.ts')
    app = (await apiApp()).app
    await app.listen({ host: '127.0.0.1', port: 0 })
    api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
    res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

    scratch = mkdtempSync(join(tmpdir(), 'mo-codex-isolated-'))
    sandboxes = join(scratch, 'sandboxes')
    fakes = join(scratch, 'fakes')
    mkdirSync(join(fakes, 'bin'), { recursive: true })
    writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
    writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))
    // CODEX'S SIGN-IN BY KEY, under both names the template's secrets give codex. An isolated run's home holds no Codex
    // login, so a key is its only sign-in. Both keys are made up.
    const secrets = join(scratch, 'sandbox-secrets.env')
    writeFileSync(secrets, 'OPENAI_API_KEY=a-made-up-openai-key\nCODEX_API_KEY=a-made-up-codex-key\n', { mode: 0o600 })

    // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/.
    const main = join(scratch, 'main')
    mkdirSync(main)
    git(main, 'init', '-q', '-b', 'main')
    git(main, 'config', 'user.email', 'a-test@example.invalid')
    git(main, 'config', 'user.name', 'A test')
    git(main, 'config', 'commit.gpgsign', 'false')
    symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
    symlinkSync(join(REPO, 'src'), join(main, 'src'))
    writeFileSync(join(main, 'README.md'), 'a checkout for the isolated Codex test\n')
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'the checkout')
    mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
    mkdirSync(join(main, 'data'))

    // THE TEMPLATE: the real one's files, with the two planted names in the sandbox's own environment, and the secrets
    // file in this test's scratch.
    const template = join(scratch, 'template')
    mkdirSync(template)
    const real = join(REPO, 'sandboxes', 'mole-office-dev')
    const devcontainer = JSON.parse(readFileSync(join(real, 'devcontainer.json'), 'utf8'))
    devcontainer.containerEnv = { ...(devcontainer.containerEnv ?? {}), ...PLANTED }
    writeFileSync(join(template, 'devcontainer.json'), JSON.stringify(devcontainer, null, 2))
    const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8'))
    office.secrets.hostFile = secrets
    writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))

    // THE STARTER, started by the person and handed its own key.
    const made = await fetch(`${api}/api/agents/started`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
      body: JSON.stringify({ handle: STARTER, name: STARTER, role: 'supervisor' }),
    })
    const madeBody = (await made.json()) as { whatToGiveIt?: { key?: string } }
    expect(made.status).toBe(201)
    starterKey = String(madeBody.whatToGiveIt?.key ?? '')
    const mine = await ask('POST', '/api/records', { kind: 'session', title: 'the starter run', data: { state: 'running' } })
    expect(mine.status, JSON.stringify(mine.body)).toBe(201)
    starterSession = String(mine.body.record.id)

    const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--no-dsh', '--json'])
    expect(up.status, up.err).toBe(0)
    dir = (JSON.parse(up.out.trim()) as { folder: string }).folder
    mkdirSync(join(dir, 'worktrees', 'a-codex-run'), { recursive: true })
  }, 180_000)

  afterAll(async () => {
    // ONLY THE GROUPS THIS FILE STARTED: the group of each launcher it ran, and each group a start.json in the instance
    // names, and only while its leader still works in this test's scratch.
    if (dir !== '') for (const start of startsOf(dir)) groups.add(start.hostPgid)
    for (const group of groups) {
      try {
        if (!readlinkSync(`/proc/${group}/cwd`).startsWith(scratch)) continue
        process.kill(-group, 'SIGKILL')
      } catch {
        // gone
      }
    }
    res?.useOsProbe(res.LINUX_PROBE)
    await app?.close()
    t?.close()
    if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
  })

  it('5: the env file of an isolated Codex run holds only listed names, and the planted ones are not among them', async () => {
    const made = await ask('POST', '/api/records', { kind: 'session', title: 'A made-up isolated Codex run', data: { state: 'running' } })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const run = String(made.body.record.id)
    const standIn = aStandInCodex(join(scratch, 'isolated-codex'))
    const before = (theFakeState(fakes).calls as unknown[]).length
    const ran = await sandbox(['exec', NAME, '--isolated', '--runtime', 'codex', '--run', run, '--cwd', join(dir, 'worktrees', 'a-codex-run'), '--', standIn.program, 'exec', PROMPT])
    expect(ran.status, ran.err).toBe(0)
    expect(ran.out + ran.err).not.toContain('planted-not-a')

    // WHAT DOCKER CREATE WAS GIVEN: the names of the env file, which is the whole of what the office hands the container.
    const creates = (theFakeState(fakes).calls as { tool: string; argv: string[]; envNames?: string[] }[])
      .slice(before).filter((call) => call.tool === 'docker' && call.argv[0] === 'create')
    expect(creates, 'no container was made').toHaveLength(1)
    const names = creates[0]!.envNames ?? []
    for (const name of Object.keys(PLANTED)) expect(names).not.toContain(name)
    expect(names).toEqual(expect.arrayContaining(['HOME', 'SANDBOX_DIR', 'OPENAI_API_KEY', 'CODEX_API_KEY']))
    expect(theNamesOffTheList(names)).toEqual([])

    // AND THE COMMAND RAN WITHOUT THEM. The stand-in docker runs it on this machine, where the suite's read recorder may
    // add its own names, so only the planted ones are looked for here.
    const seen = whatItSaw(standIn.seen)
    expect(realpathSync(seen.program)).toBe(realpathSync(standIn.program))
    for (const name of Object.keys(PLANTED)) expect(seen.names).not.toContain(name)
  }, 120_000)
})

describe.skipIf(process.platform === 'win32')('whereIsThisTool and the sandbox codex', () => {
  let scratch = ''
  beforeAll(() => { scratch = mkdtempSync(join(tmpdir(), 'mo-where-is-codex-')) })
  afterAll(() => { if (scratch !== '') rmSync(scratch, { recursive: true, force: true }) })

  /** A copy of the sandbox's own codex in folder/sandbox-codex, as a second checkout would hold it. */
  function aCopyOfTheSandboxCodex(folder: string): string {
    const copy = join(folder, 'sandbox-codex')
    mkdirSync(copy, { recursive: true })
    copyFileSync(join(THE_SANDBOX_CODEX, 'codex'), join(copy, 'codex'))
    chmodSync(join(copy, 'codex'), 0o755)
    return copy
  }

  it('6: the sandbox codex alone on PATH is no installed Codex', () => {
    const copy = aCopyOfTheSandboxCodex(join(scratch, 'case-6'))
    const nothingElse = join(scratch, 'case-6', 'nothing-else')
    mkdirSync(nothingElse)
    expect(whereIsThisTool('codex', { PATH: [copy, nothingElse].join(':') })).toBeNull()
  })

  it('7: with a real codex after it, the sandbox codex is the one found, so a start by that path still goes through it', () => {
    const copy = aCopyOfTheSandboxCodex(join(scratch, 'case-7'))
    const standIn = aStandInCodex(join(scratch, 'case-7'))
    expect(whereIsThisTool('codex', { PATH: [copy, standIn.bin].join(':') })).toBe(join(copy, 'codex'))
  })
})
