// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WITH THE PROVIDER ROUTER OFF, A SANDBOX IS WHAT IT WAS. WITH IT ON, THE SANDBOX GETS NO DEEPSEEK KEY.
 *
 * The setting MOLE_OFFICE_PROVIDER_ROUTER is off unless this machine says on. Off, whether it is absent or says off, `up`
 * mounts what it mounted before the router existed and makes no router folder, a command's env file holds the bytes it
 * held before, an isolated run gets the DeepSeek key as before, and nothing asks the office for a router credential.
 * On, `up` adds one read-only mount of the sandbox's router folder, which is of mode 0700; a command that names
 * --secret DEEPSEEK_API_KEY is refused; an isolated dsh run is refused before its container is made, because the router
 * must carry it and no router answers here; and a dsh run whose model comes from no Casting row is refused before docker
 * exec, because the router takes a run's models only from its Casting row. Since item 12 an OpenCode run on Go is
 * refused in the same way.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, and the setting is off in its
 * process. The launcher is the real tools/sandbox.mjs, run as its own process with the setting in its environment.
 * Docker and the devcontainer CLI are the stand-ins of tests/sandbox-stand-ins.ts, so nothing runs in a container. The
 * DeepSeek key is a made-up value, no router runs, and nothing is sent to any provider.
 *
 * THE ENV FILE'S BYTES are today's, written out here from what the launcher wrote before the router existed. The stand-in
 * docker keeps only their sha256.
 *
 * MUTATIONS, each alone and put back:
 *   1. up mounts the router folder whatever the setting says: the off case goes red on its mounts.
 *   2. theSecretsFor keeps the DeepSeek key line with the setting on: the on case goes red on the --secret refusal.
 *   3. startThroughTheHelper asks for no router lines with the setting on: the on case goes red on the dsh run's refusal.
 *   4. startThroughTheHelper asks for the router's lines for dsh runs only: the on case goes red on the OpenCode Go run.
 */
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { FAKE_DEVCONTAINER, FAKE_DF, FAKE_DOCKER, FAKE_DU, FAKE_FREE, startsOf, theFakeMachine } from './sandbox-stand-ins.ts'
import { linkSourceWithLocalRoundRules } from './round-chapters-fixture.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { theRouterIsDown } from '../tools/provider-router-host.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const STARTER = 'router-off-starter'
const WORKER = 'router-off-worker'
const MODEL = 'deepseek/deepseek-v4.1-flash'
/** A made-up OpenCode Go model, which no Casting row names. */
const GO_MODEL = 'opencode-go/made-up-go-model'
/** A made-up DeepSeek key. It is no real key and reaches no provider. */
const MADE_UP_KEY = 'not-a-real-key-made-up-for-the-router-off-test'
const THE_SETTING = 'MOLE_OFFICE_PROVIDER_ROUTER'
/** The effort a dsh run of MODEL is started with in this office, as the launcher wrote it before the router existed. */
const TODAYS_EFFORT_LINE = JSON.stringify({ effort: 'max', effortFrom: "the owner's rule", model: MODEL, askedModel: MODEL, unavailable: false, predatesEffort: false })

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type Ran = { status: number; out: string; err: string }
type Call = {
  tool: string
  argv: string[]
  envFile?: string | null
  envFileSha256?: string | null
  envNames?: string[]
}
type Mount = { Type: string; Source: string; Destination: string; RW: boolean }

let t: TestDb
let res: ResourcesLib
let app: FastifyInstance
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let main = ''
let template = ''
let dsh = ''
let starterKey = ''
let starterSession = ''

/** Every process group a test started, stopped at the end if its leader still works in the scratch. */
const groups = new Set<number>()

const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/** The tool as its own process, as the starter, with the router setting only as `setting` gives it. */
async function sandbox(args: string[], setting: string | undefined): Promise<Ran> {
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
    FAKE_DOCKER_DIR: fakes,
    MOLE_OFFICE_AGENT: STARTER,
    MOLE_OFFICE_SESSION: starterSession,
    MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
  }
  delete env['MOLE_AGENT_KEY']
  delete env[THE_SETTING]
  if (setting !== undefined) env[THE_SETTING] = setting
  // The launcher's own flags go before `--`: what follows it is the command.
  const end = args.includes('--') ? args.indexOf('--') : args.length
  const argv = [TOOL, ...args.slice(0, end), '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE, ...args.slice(end)]
  return new Promise((done) => {
    const child = spawn(process.execPath, argv, { env, detached: true })
    if (child.pid !== undefined) groups.add(child.pid)
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (c: Buffer) => out.push(c))
    child.stderr.on('data', (c: Buffer) => err.push(c))
    child.on('close', (code) => done({ status: code ?? 1, out: Buffer.concat(out).toString('utf8'), err: Buffer.concat(err).toString('utf8') }))
  })
}

async function ask(method: string, path: string, body?: unknown, actor: { type: string; id: string } = { type: 'agent', id: STARTER }, key?: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': actor.type,
      'x-mole-office-actor-id': actor.id,
      ...(key === undefined ? {} : { 'x-mole-office-key': key }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

function calls(): Call[] {
  return (JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8')) as { calls: Call[] }).calls
}

function mountsOf(name: string): Mount[] {
  return JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8')).containers[`mole-office-sandbox-${name}`].Mounts
}

/** The docker calls of one verb made since `from`. */
function dockerCalls(verb: string, from: number): Call[] {
  return calls().slice(from).filter((call) => call.tool === 'docker' && call.argv[0] === verb)
}

/** Whether a docker exec runs the sandbox's start helper, and not a git command that makes a worktree. */
function runsTheHelper(call: Call): boolean {
  return call.argv.some((word) => word.endsWith('/sandbox-start.mjs'))
}

/** The docker execs since `from` that run the sandbox's start helper. */
function helperExecs(from: number): Call[] {
  return dockerCalls('exec', from).filter(runsTheHelper)
}

/**
 * NOTHING BUT THE AGENT'S OWN WORKTREE RAN IN THE CONTAINER since `from`: an agent start given no --worktree makes it,
 * with git, before anything can refuse the start. Every docker exec that is not the helper's is that git command, and
 * it is given no env file, so no key reaches the container.
 */
function expectOnlyTheWorktreeMade(from: number, worktree: string): void {
  for (const call of dockerCalls('exec', from).filter((call) => !runsTheHelper(call))) {
    const words = call.argv.slice(call.argv.indexOf('git') + 1)
    expect(call.argv, 'a docker exec that is not git').toContain('git')
    expect(words[words.indexOf('worktree') + 1], `a git command that adds no worktree: ${words.join(' ')}`).toBe('add')
    expect(words).toContain(worktree)
    expect(call.envFile ?? null, 'an env file was given to git').toBeNull()
  }
}

/** The refusal's words: its line on stderr, and the details file it names. */
function theRefusalExplanation(ran: Ran): string {
  const files = [...ran.err.matchAll(/Details: ([^\n]+)/g)].map((match) => match[1]!)
  return ran.err + files.map((file) => readFileSync(file, 'utf8')).join('\n')
}

/** The mounts `up` gave a sandbox before the router existed, for the sandbox of this name. */
function todaysMounts(name: string): Mount[] {
  const mirror = git(join(sandboxes, name, 'repo'), 'config', '--get', 'remote.origin.url')
  return [
    { Type: 'bind', Source: join(sandboxes, name), Destination: join(sandboxes, name), RW: true },
    { Type: 'bind', Source: main, Destination: main, RW: false },
    { Type: 'tmpfs', Source: '', Destination: join(main, 'data'), RW: false },
    { Type: 'tmpfs', Source: '', Destination: join(main, 'node_modules', '.vite-temp'), RW: true },
    { Type: 'bind', Source: mirror, Destination: mirror, RW: false },
  ]
}

/** How many router credentials the office holds: none of these cases may ask for one. */
function theRouterCredentials(): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM run_tokens').get() as { n: number }).n
}

/** A run filed for an isolated command, as its starter files it. */
async function anIsolatedRun(): Promise<string> {
  const filed = await ask('POST', '/api/records', { kind: 'session', title: 'A synthetic isolated run', data: { state: 'running', servingAgent: WORKER } }, { type: 'agent', id: STARTER }, starterKey)
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return filed.body.record.id as string
}

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  // Short names, so the router's socket path in a sandbox's folder stays under the 108 bytes Linux allows.
  scratch = mkdtempSync(join(tmpdir(), 'mo-ro-'))
  sandboxes = join(scratch, 's')
  fakes = join(scratch, 'fakes')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))

  // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/, as the launcher tests make it.
  main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  linkSourceWithLocalRoundRules(REPO, main)
  writeFileSync(join(main, 'README.md'), 'a checkout for the router-off test\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's files, with a secrets file in this test's scratch that holds the made-up key.
  template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8')) as { secrets: { hostFile: string } }
  office.secrets.hostFile = join(scratch, 'sandbox-secrets.env')
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))
  writeFileSync(office.secrets.hostFile, `DEEPSEEK_API_KEY=${MADE_UP_KEY}\n`, { mode: 0o600 })

  // A DSH FOLDER of profiles only, as the launcher tests make it. No dsh runs: each command here is `true`.
  dsh = join(scratch, 'dsh')
  mkdirSync(join(dsh, 'home', 'profiles', 'office'), { recursive: true })
  writeFileSync(join(dsh, 'env'), `DEEPSEEK_API_KEY=${MADE_UP_KEY}\n`, { mode: 0o600 })
  writeFileSync(join(dsh, 'home', 'profiles', 'office', 'cordis.patch.yml'), `configPath: "${main}/tools/dsh-hooks/hooks.json"\npluginRoot: "${main}"\n`)
  writeFileSync(join(dsh, 'home', 'profiles', 'office', 'office-tool.mjs'), `import { officeToolPlugin } from "${main}/tools/dsh-hooks/office-tool.mjs"\n`)

  // THE STARTER AND THE WORKER. The starter's run is filed with its own key, as its session hook files it. The starter is
  // the office's secretary, which starts sandboxes on the live office. The launcher here holds no key. On a run's own
  // facts an agent's name with no key counts for the secretary, and not for the agent that started or filed the run
  // (`mayEndARun` in src/server/lib/records.ts).
  const made = await ask('POST', '/api/agents/started', { handle: STARTER, name: STARTER, role: 'secretary' }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  starterKey = String(made.body.whatToGiveIt?.key ?? '')
  expect(starterKey).not.toBe('')
  const mine = await ask('POST', '/api/records', { kind: 'session', title: 'the starter run', data: { state: 'running' } }, { type: 'agent', id: STARTER }, starterKey)
  expect(mine.status, JSON.stringify(mine.body)).toBe(201)
  starterSession = mine.body.record.id as string
  const worker = await ask('POST', '/api/agents/started', { handle: WORKER, name: WORKER, role: 'worker', workArea: ['src'] }, { type: 'agent', id: STARTER }, starterKey)
  expect(worker.status, JSON.stringify(worker.body)).toBe(201)
}, 120_000)

afterAll(async () => {
  for (const one of (sandboxes !== '' && existsSync(sandboxes) ? readdirSync(sandboxes) : [])) {
    for (const start of startsOf(join(sandboxes, one))) groups.add(start.hostPgid)
  }
  for (const group of groups) {
    if (group <= 1 || group === process.pid) continue
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

describe('the provider router setting, in a sandbox', () => {
  // OFF IS RUN WITH THE SETTING ABSENT ALONE. The launcher reads the setting only through theProviderRouterIsOn, which is
  // on only for the word on, so a setting that says off takes the same branch.
  for (const [name, setting] of [['quiet', undefined]] as const) {
    it(`off (${setting === undefined ? 'absent' : `${THE_SETTING}=off`}): the mounts, the env files and the office are as before`, async () => {
      const up = await sandbox(['up', template, '--name', name, '--from', main, '--dsh', dsh, '--json'], setting)
      expect(up.status, up.err).toBe(0)
      const folder = (JSON.parse(up.out.trim()) as { folder: string }).folder

      // NO NEW MOUNT AND NO NEW FOLDER.
      expect(mountsOf(name)).toEqual(todaysMounts(name))
      expect(existsSync(join(sandboxes, '.run', name, 'provider-router'))).toBe(false)
      expect(existsSync(join(sandboxes, '.run', '.provider-router'))).toBe(false)

      // A COMMAND THAT NAMES THE KEY: its env file is the one line it was before, byte for byte.
      let from = calls().length
      const own = await sandbox(['exec', name, '--wait', '--secret', 'DEEPSEEK_API_KEY', '--', 'true'], setting)
      expect(own.status, own.err).toBe(0)
      const [ownExec] = dockerCalls('exec', from)
      expect(ownExec?.envFileSha256).toBe(sha256(`DEEPSEEK_API_KEY=${MADE_UP_KEY}\n`))

      // A DSH RUN: the key and the run's effort, byte for byte, and no line for a router.
      from = calls().length
      const run = await sandbox(['exec', name, '--agent', WORKER, '--runtime', 'dsh', '--model', MODEL, '--json', '--', 'true'], setting)
      expect(run.status, run.err).toBe(0)
      groups.add((JSON.parse(run.out.trim()) as { hostPgid: number }).hostPgid)
      const [runExec] = helperExecs(from)
      expect(runExec?.envFileSha256).toBe(sha256(`DEEPSEEK_API_KEY=${MADE_UP_KEY}\nSANDBOX_START_EFFORT=${TODAYS_EFFORT_LINE}\n`))

      // AN ISOLATED RUN gets the key as before.
      from = calls().length
      const isolated = await sandbox(['exec', name, '--isolated', '--run', await anIsolatedRun(), '--runtime', 'dsh', '--cwd', folder, '--', 'true'], setting)
      expect(isolated.status, isolated.err).toBe(0)
      expect(dockerCalls('create', from)[0]?.envNames).toContain('DEEPSEEK_API_KEY')

      // NOTHING ASKED THE OFFICE FOR A ROUTER CREDENTIAL, and the router's own folder was never made.
      expect(theRouterCredentials()).toBe(0)
      expect(existsSync(join(sandboxes, '.run', '.provider-router'))).toBe(false)
    }, 120_000)
  }

  it('on: one more read-only mount of a 0700 folder, and no DeepSeek key goes into the sandbox', async () => {
    const name = 'routed'
    const up = await sandbox(['up', template, '--name', name, '--from', main, '--dsh', dsh, '--json'], 'on')
    expect(up.status, up.err).toBe(0)
    const folder = (JSON.parse(up.out.trim()) as { folder: string }).folder

    // THE ROUTER FOLDER, mounted read-only after today's mounts, and readable by its owner only.
    const routerFolder = join(sandboxes, '.run', name, 'provider-router')
    expect(mountsOf(name)).toEqual([...todaysMounts(name), { Type: 'bind', Source: routerFolder, Destination: '/run/mole-office-provider-router', RW: false }])
    expect(statSync(routerFolder).mode & 0o777).toBe(0o700)

    // A COMMAND THAT NAMES THE KEY is refused, before docker exec.
    let from = calls().length
    const own = await sandbox(['exec', name, '--wait', '--secret', 'DEEPSEEK_API_KEY', '--', 'true'], 'on')
    expect(own.status).toBe(2)
    const ownSaid = theRefusalExplanation(own)
    expect(ownSaid).toContain('DEEPSEEK_API_KEY')
    expect(ownSaid).toMatch(/provider router/)
    expect(dockerCalls('exec', from), 'docker exec was run').toHaveLength(0)

    // AN ISOLATED DSH RUN is refused before its container is made: the router must carry it, and no router answers here.
    from = calls().length
    const isolated = await sandbox(['exec', name, '--isolated', '--run', await anIsolatedRun(), '--runtime', 'dsh', '--cwd', folder, '--', 'true'], 'on')
    expect(isolated.status, isolated.err).toBe(2)
    expect(isolated.err).toContain(theRouterIsDown(sandboxes))
    expect(dockerCalls('create', from), 'the isolated run was created').toHaveLength(0)

    // A DSH RUN WHOSE MODEL COMES FROM NO CASTING ROW is refused before the helper runs, with nothing asked of the office.
    from = calls().length
    const run = await sandbox(['exec', name, '--agent', WORKER, '--runtime', 'dsh', '--model', MODEL, '--json', '--', 'true'], 'on')
    expect(run.status, run.err).toBe(2)
    const runSaid = theRefusalExplanation(run)
    expect(runSaid).toMatch(/provider router/)
    expect(runSaid).toMatch(/Casting row/)
    expect(runSaid).toContain('Nothing was started.')
    expect(helperExecs(from), 'the helper was run').toHaveLength(0)
    expectOnlyTheWorktreeMade(from, join(folder, 'worktrees', WORKER))

    // AN OPENCODE RUN ON GO WHOSE MODEL COMES FROM NO CASTING ROW is refused the same way: item 12 routes Go as well.
    from = calls().length
    const goRun = await sandbox(['exec', name, '--agent', WORKER, '--runtime', 'opencode', '--model', GO_MODEL, '--json', '--', 'true'], 'on')
    expect(goRun.status, goRun.err).toBe(2)
    const goSaid = theRefusalExplanation(goRun)
    expect(goSaid).toMatch(/provider router/)
    expect(goSaid).toMatch(/this opencode run/)
    expect(goSaid).toContain('Nothing was started.')
    expect(helperExecs(from), 'the helper was run').toHaveLength(0)
    expectOnlyTheWorktreeMade(from, join(folder, 'worktrees', WORKER))
    expect(theRouterCredentials()).toBe(0)
    for (const line of [own.out, own.err, run.out, run.err, isolated.out, isolated.err, goRun.out, goRun.err]) expect(line).not.toContain(MADE_UP_KEY)
  }, 120_000)
})
