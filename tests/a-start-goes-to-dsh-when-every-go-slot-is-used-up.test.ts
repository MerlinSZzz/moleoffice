// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START ON OPENCODE GO GOES TO DSH WHEN EVERY GO SLOT IS USED UP. Item 25 of the key layer:
 * when all are used up, the run falls back to dsh.
 *
 * OLD: with every Go slot used up, a run on Go was started on Go, and the provider router refused each of its requests
 * with 429 and the earliest reset.
 * NEW: before such a run is filed, the launcher asks the router which Go slots are used up. When every one is, the run
 * is filed and started on dsh instead, with the dsh row in Casting that runs the same native model through DeepSeek.
 * One sentence says which slots were used up, the earliest reset, and that the run went to dsh; the launcher says it
 * when it starts the run, it is in the start's words, and it is on the run, at `extra.startedOnDshInPlaceOfGo`. A run
 * already going is not moved: the router still refuses its requests, as before. When dsh cannot be used, because the
 * router holds no DeepSeek slot, no dsh row runs the model, or the start has no brief for dsh, the run starts on Go as
 * before and is refused by the router as before, and the start says why it did not go to dsh. When the router answers
 * but its answer cannot be read, the run starts on Go as it was asked, and the start says so. When no router listens,
 * the launcher's own router check stops the start, nothing is started, and the check says so. The check itself never
 * refuses a start and never holds it. With a free Go slot, or with the setting off, nothing changes.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, with the setting on in its
 * process. The router is the shipped one, run in this process with a clock the cases set. The launcher is the real
 * tools/sandbox.mjs, run as its own process. Docker and the devcontainer CLI are the stand-ins of
 * tests/sandbox-stand-ins.ts, so nothing runs in a container. Go is a stand-in on 127.0.0.1 that answers every key with
 * Go's usage limit; DeepSeek is a stand-in that streams one made-up answer; dsh is a stand-in that sends one request
 * through the run's bridge and writes down what came back. Every key is made up, and nothing reaches a real provider.
 *
 * MUTATIONS, each alone and put back:
 *   1. the launcher does not ask the router before it files a run on Go: the end-to-end case goes red on the run's runtime.
 *   2. the launcher's check moves the run to dsh with no DeepSeek slot: the no-DeepSeek case goes red on `dsh`.
 *   3. the launcher's check asks for the dsh row in force, not the one that runs the same native model: the moved case
 *      goes red on `dsh`, because the worker's dsh row in force runs another model.
 *   4. the launcher's check promises the run starts on Go when no router listens: the no-router end-to-end case goes
 *      red on the check's words.
 *   5. the launcher's check refuses the start when the router's answer cannot be read: the unreadable end-to-end case
 *      goes red.
 */
import { spawn, execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { theRouterControlSocket } from '../src/config/provider-router.mjs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { clockStamp } from '../src/shared/time.ts'
import * as host from '../tools/provider-router-host.mjs'
import { openTheBridge } from '../tools/provider-router-bridge.mjs'
import { createProviderRouter } from '../tools/provider-router.mjs'
import { apiApp, freshDb, theOfficesKeyHeader, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { FAKE_DEVCONTAINER, FAKE_DF, FAKE_DOCKER, FAKE_DU, FAKE_FREE, startsOf, theFakeMachine } from './sandbox-stand-ins.ts'
import { linkSourceWithLocalRoundRules } from './round-chapters-fixture.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { aTestAddress } from './the-test-commit-address.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const STARTER = 'go-dsh-starter'
const WORKER = 'go-dsh-worker'
const NAME = 'dg'
const made = randomUUID().slice(0, 8)
/** The made-up native model that both rows run: on Go through opencode-go, on dsh through deepseek-official. */
const NATIVE = `made-up-model-${made}`
const GO_MODEL = `opencode-go/${NATIVE}`
const DSH_MODEL = `deepseek/${NATIVE}`
/** A made-up native model that only a Go row runs. */
const ALONE = `made-up-go-only-model-${made}`
const ALONE_MODEL = `opencode-go/${ALONE}`
const THE_SETTING = 'MOLE_OFFICE_PROVIDER_ROUTER'
const THE_CAP = 'MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP'
/** The made-up moment the router's clock starts at. */
const START = Date.UTC(2026, 9, 30, 12, 0, 0)
/** The reset Go names for each of its three made-up slots, in seconds: the second slot resets first. */
const RESETS = [7200, 1800, 3600]
/** A made-up key in the sandboxes' secrets file. It is no real key, and the router holds it, so no run gets it. */
const MADE_UP_SECRET = 'not-a-real-key-made-up-for-the-go-to-dsh-test'

const GO_SLOTS = RESETS.map((_, at) => ({
  id: `go-${String(at + 1)}`, provider: 'opencode-go', label: `Made-up Go ${String(at + 1)}`, key: `not-a-real-go-key-${String(at + 1)}-${randomBytes(4).toString('hex')}`,
}))
const DEEPSEEK_SLOT = { id: 'ds-1', provider: 'deepseek', label: 'Made-up DeepSeek', key: `not-a-real-deepseek-key-${randomBytes(4).toString('hex')}` }
const EVERY_KEY = [...GO_SLOTS, DEEPSEEK_SLOT].map((one) => one.key)
/** What the stand-in DeepSeek streams back. */
const STREAMED = [
  'data: {"id":"made-up","choices":[{"index":0,"delta":{"content":"A made-up answer."}}]}\n\n',
  'data: {"id":"made-up","choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"total_tokens":120}}\n\n',
  'data: [DONE]\n\n',
]
const GO_LIMIT = JSON.stringify({ type: 'error', error: { type: 'GoUsageLimitError', message: 'A made-up usage limit.' } })
const PRICED = { currency: 'USD', prices: { [NATIVE]: { input: 1000, cachedInput: 100, output: 2000 } } }

type Ran = { status: number; out: string; err: string }
type Call = { tool: string; argv: string[] }
type Said = { says: string; dsh: { runtime: string; model: string } | null } | null

let t: TestDb
let res: typeof import('../src/server/lib/resources.ts')
let app: FastifyInstance
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let main = ''
let template = ''
let dsh = ''
let brief = ''
let starterKey = ''
let starterSession = ''
let goRow = { id: 0, revision: '' }
let clock = START
let slotsNow = [...GO_SLOTS, DEEPSEEK_SLOT]
const before: Record<string, string | undefined> = {}
const logs: string[] = []
/** The provider and key of each request a stand-in provider was sent. */
const upstream: { provider: string; key: string }[] = []
let goServer: Server
let deepseekServer: Server
let router: ReturnType<typeof createProviderRouter>
let bridge: { baseUrl: string; close: () => Promise<void> }
const groups = new Set<number>()

const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()
const thePerson = { type: 'human', id: THE_PERSON }
const refuse = (sentence: string): never => { throw new Error(sentence) }

/** The tool as its own process, as the starter, with the router setting on; with the starter's key only when asked. */
async function sandbox(args: string[], withTheKey = false): Promise<Ran> {
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
    FAKE_DOCKER_DIR: fakes,
    MOLE_OFFICE_AGENT: STARTER,
    MOLE_OFFICE_SESSION: starterSession,
    MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
    [THE_SETTING]: 'on',
  }
  delete env['MOLE_AGENT_KEY']
  if (withTheKey) env['MOLE_AGENT_KEY'] = starterKey
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

async function ask(method: string, path: string, body?: unknown, actor: { type: string; id: string } = { type: 'agent', id: STARTER }, key: string | undefined = starterKey): Promise<{ status: number | null; body: any }> {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': actor.type,
      'x-mole-office-actor-id': actor.id,
      ...(actor.type === 'human' ? thePersonsKeyHeader() : key === undefined ? {} : { 'x-mole-office-key': key }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

function calls(): Call[] {
  return (JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8')) as { calls: Call[] }).calls
}

async function until(what: string, ok: () => boolean, ms = 60_000): Promise<void> {
  const by = Date.now() + ms
  while (!ok()) {
    if (Date.now() > by) throw new Error(`waited ${String(ms)} ms for ${what}`)
    await new Promise((done) => setTimeout(done, 100))
  }
}

/** Every Go slot used up, through the router's own way of learning it: one request of a Go run, which Go refuses on every slot. */
async function everyGoSlotUsedUp(): Promise<void> {
  clock = START
  const filed = await ask('POST', '/api/records', { kind: 'session', title: 'Synthetic: a Go run that uses up every Go slot', data: {
    runtime: 'opencode', model: GO_MODEL, servingAgent: WORKER, state: 'running',
  } })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  const issued = await ask('POST', '/api/provider-router/run-tokens', { run: filed.body.record.id, casting: goRow })
  expect(issued.status, JSON.stringify(issued.body)).toBe(201)
  const reply = await fetch(`${bridge.baseUrl}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${String(issued.body.token)}` },
    body: JSON.stringify({ model: NATIVE, stream: true, messages: [{ role: 'user', content: 'A made-up question.' }] }),
  })
  const text = await reply.text()
  expect(reply.status, text).toBe(429)
  expect((JSON.parse(text) as { error: { code: string } }).error.code).toBe('every-go-slot-used-up')
}

/** The launcher's check, asked as the launcher asks it, as the starter. */
function theCheck(given: { runtime?: string; model?: string; brief?: string; env?: NodeJS.ProcessEnv; sandboxes?: string }): Promise<Said> {
  return (host as unknown as { theStartWhenEveryGoSlotIsUsedUp: (given: unknown) => Promise<Said> }).theStartWhenEveryGoSlotIsUsedUp({
    sandboxes: given.sandboxes ?? sandboxes, agent: WORKER, runtime: given.runtime ?? 'opencode', model: given.model ?? GO_MODEL, brief: 'brief' in given ? given.brief : brief,
    ask: (path: string) => ask('GET', path), env: given.env ?? { [THE_SETTING]: 'on' },
  })
}

beforeAll(async () => {
  for (const name of [THE_SETTING, THE_CAP]) before[name] = process.env[name]
  process.env[THE_SETTING] = 'on'
  process.env[THE_CAP] = '0.15'
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  // Short names, so the router's sockets in a sandbox's folder stay under the 108 bytes Linux allows.
  scratch = mkdtempSync(join(tmpdir(), 'mo-gd-'))
  sandboxes = join(scratch, 's')
  fakes = join(scratch, 'fakes')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))
  // run-agent.sh only with this test's own dsh folder, and a stand-in dsh in place of the image's: it sends one request
  // through the run's bridge with the model its settings patch names, and writes down what came back, with no key.
  writeFileSync(join(fakes, 'bin', 'bash'), `#!/bin/sh\ncase "$1" in */run-agent.sh) case "$MOLE_OFFICE_DSH_DIR" in ${scratch}/*) ;; *) echo "test guard: run-agent.sh without this test's dsh folder" >&2; exit 97 ;; esac ;; esac\nexec /bin/bash "$@"\n`, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'dsh'), `#!/usr/bin/env node
const fs = require('fs')
const argv = process.argv.slice(2)
let model = null
argv.forEach((one, at) => { if (argv[at - 1] !== '--patch' || !one.endsWith('.json')) return; for (const part of JSON.parse(fs.readFileSync(one, 'utf8'))) if (part.id === 'agent-default-model') model = part.config.model })
const base = process.env.DEEPSEEK_BASE_URL ?? ''
const key = process.env.DEEPSEEK_API_KEY ?? ''
const sent = { model, baseUrlIsTheBridge: /^http:\\/\\/127\\.0\\.0\\.1:[0-9]+\\/deepseek$/.test(base), keyIsARunToken: /^mrt_[A-Za-z0-9_-]{43}$/.test(key), briefIsAFile: fs.existsSync(argv[argv.length - 1]) }
fetch(base + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: 'A made-up question.' }] }) })
  .then(async (r) => ({ status: r.status, text: await r.text() }), (why) => ({ status: null, text: String(why) }))
  .then((answer) => fs.writeFileSync(process.env.SANDBOX_DIR + '/out/stand-in-dsh.json', JSON.stringify({ ...sent, ...answer })))
`, { mode: 0o755 })
  // A STAND-IN opencode for the case where the start stays on Go: it does nothing, so the case reads the start's words
  // without a real provider or key.
  writeFileSync(join(fakes, 'bin', 'opencode'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })

  // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/, as the launcher tests make it.
  main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  linkSourceWithLocalRoundRules(REPO, main)
  writeFileSync(join(main, 'README.md'), 'a checkout for the go-to-dsh test\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's files, with a secrets file in this test's scratch that holds a made-up key.
  template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8')) as { secrets: { hostFile: string } }
  office.secrets.hostFile = join(scratch, 'sandbox-secrets.env')
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))
  writeFileSync(office.secrets.hostFile, `DEEPSEEK_API_KEY=${MADE_UP_SECRET}\nOPENCODE_API_KEY=${MADE_UP_SECRET}\n`, { mode: 0o600 })

  dsh = join(scratch, 'dsh')
  mkdirSync(join(dsh, 'home', 'profiles', 'office'), { recursive: true })
  writeFileSync(join(dsh, 'home', 'profiles', 'office', 'cordis.patch.yml'), `configPath: "${main}/tools/dsh-hooks/hooks.json"\npluginRoot: "${main}"\n`)
  writeFileSync(join(dsh, 'home', 'profiles', 'office', 'office-tool.mjs'), `import { officeToolPlugin } from "${main}/tools/dsh-hooks/office-tool.mjs"\n`)
  brief = join(scratch, 'the-brief.md')
  writeFileSync(brief, '# A made-up brief\nRead the files.\n')

  // THE STARTER AND THE WORKER, the price table, and the worker's three Casting rows. The starter is the secretary, as
  // the one agent that files a run from the host with its own key: the key the office needs to give the run its token.
  const madeStarter = await ask('POST', '/api/agents/started', { handle: STARTER, name: STARTER, role: 'secretary' }, thePerson)
  expect(madeStarter.status, JSON.stringify(madeStarter.body)).toBe(201)
  starterKey = String(madeStarter.body.whatToGiveIt?.key ?? '')
  expect(starterKey).not.toBe('')
  const mine = await ask('POST', '/api/records', { kind: 'session', title: 'the starter run', data: { state: 'running', servingAgent: STARTER } })
  expect(mine.status, JSON.stringify(mine.body)).toBe(201)
  starterSession = mine.body.record.id as string
  const worker = await ask('POST', '/api/agents/started', { handle: WORKER, name: WORKER, role: 'worker', workArea: ['src'] })
  expect(worker.status, JSON.stringify(worker.body)).toBe(201)
  const prices = await ask('POST', '/api/office/price-table', { table: PRICED }, thePerson)
  expect(prices.status, JSON.stringify(prices.body)).toBe(200)
  for (const [program, model, native, provider] of [['opencode', GO_MODEL, NATIVE, 'opencode-go'], ['dsh', DSH_MODEL, NATIVE, 'deepseek-official'], ['opencode', ALONE_MODEL, ALONE, 'opencode-go']]) {
    const row = await ask('POST', `/api/casting/${THE_WORKER}`, { program: { value: program }, model: { value: model }, effort: { value: 'high' }, native: { model: native, provider, variant: null } }, thePerson)
    expect(row.status, JSON.stringify(row.body)).toBe(201)
    if (model === GO_MODEL) {
      const read = await ask('GET', `/api/casting/rows/${String(row.body.casting.id)}/selection`, undefined, thePerson)
      goRow = { id: read.body.selection.casting.id, revision: read.body.selection.casting.revision }
    }
  }

  // THE STAND-IN PROVIDERS: Go refuses every key for its usage limit, with the slot's own reset; DeepSeek answers.
  const aProvider = (provider: string, answer: (key: string, res: import('node:http').ServerResponse) => void) => createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      const key = (req.headers.authorization ?? '').replace(/^Bearer /u, '')
      upstream.push({ provider, key })
      answer(key, res)
    })
  })
  goServer = aProvider('opencode-go', (key, res) => {
    const at = GO_SLOTS.findIndex((one) => one.key === key)
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': String(RESETS[at] ?? 60) }).end(GO_LIMIT)
  })
  deepseekServer = aProvider('deepseek', (_key, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    for (const chunk of STREAMED) res.write(chunk)
    res.end()
  })
  for (const server of [goServer, deepseekServer]) await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const at = (server: Server) => `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`

  // THE ROUTER, with the slots the cases set, and a socket of its own for the requests that use the Go slots up.
  router = createProviderRouter({
    sandboxes, slots: () => slotsNow, office: { api, key: theOfficesKeyHeader()['x-mole-office-key']! },
    upstreams: { 'opencode-go': at(goServer), deepseek: at(deepseekServer) }, log: (line: string) => logs.push(line), now: () => clock,
  })
  await router.start()
  host.aRouterFolderFor(join(sandboxes, '.run', 'u'))
  await router.open('u')
  const env: NodeJS.ProcessEnv = { OPENCODE_API_KEY: `mrt_${randomBytes(32).toString('base64url')}` }
  bridge = (await openTheBridge(JSON.stringify({ provider: 'opencode-go', socket: join(sandboxes, '.run', 'u', 'provider-router', 'router.sock') }), env, refuse))!
  // The bridge's own token is only a place holder: each request is sent with the token of the run it is for.
}, 240_000)

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
  await bridge?.close()
  await router?.close()
  for (const server of [goServer, deepseekServer]) await new Promise((done) => server?.close(done))
  res?.useOsProbe(res.LINUX_PROBE)
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
  for (const [name, value] of Object.entries(before)) if (value === undefined) delete process.env[name]; else process.env[name] = value
})

describe("the launcher's check before a run on Go is filed", () => {
  it('with a free Go slot, with the setting off, or for a run not on Go, says nothing and moves nothing', async () => {
    clock = START
    expect(await theCheck({})).toBeNull()
    await everyGoSlotUsedUp()
    expect(await theCheck({ env: {} })).toBeNull()
    expect(await theCheck({ env: { [THE_SETTING]: 'off' } })).toBeNull()
    expect(await theCheck({ runtime: 'dsh', model: DSH_MODEL })).toBeNull()
    // Past every reset, a slot is free again.
    clock = START + 7_200_000
    expect(await theCheck({})).toBeNull()
    clock = START
  })

  // MUTATION 3: the check asks for the dsh row in force, not the one that runs the same native model.
  it('with every Go slot used up, answers dsh with the row that runs the same model, in one sentence that names every slot and the earliest reset', async () => {
    await everyGoSlotUsedUp()
    const said = await theCheck({})
    expect(said?.dsh).toEqual({ runtime: 'dsh', model: DSH_MODEL })
    for (const one of GO_SLOTS) expect(said?.says).toContain(one.label)
    expect(said?.says).toContain(`the first to reset is Made-up Go 2 at ${clockStamp(() => new Date(START + 1_800_000)).instant}`)
    expect(said?.says).toMatch(/dsh/)
    expect(said?.says).toContain(DSH_MODEL)
    expect(said?.says.match(/[.;!?](\s|$)/gu)).toHaveLength(1)
    for (const key of EVERY_KEY) expect(said?.says).not.toContain(key)
  })

  // MUTATION 2: the check moves the run to dsh with no DeepSeek slot.
  it('with no DeepSeek slot, keeps the run on Go and says why it cannot go to dsh', async () => {
    await everyGoSlotUsedUp()
    slotsNow = [...GO_SLOTS]
    try {
      const said = await theCheck({})
      expect(said?.dsh).toBeNull()
      expect(said?.says).toContain('Made-up Go 2')
      expect(said?.says).toMatch(/no DeepSeek key slot/)
      expect(said?.says.match(/[.;!?](\s|$)/gu)).toHaveLength(1)
    } finally {
      slotsNow = [...GO_SLOTS, DEEPSEEK_SLOT]
    }
  })

  it('with no dsh row that runs the same native model, keeps the run on Go and says so', async () => {
    await everyGoSlotUsedUp()
    const said = await theCheck({ model: ALONE_MODEL })
    expect(said?.dsh).toBeNull()
    expect(said?.says).toContain(ALONE)
    expect(said?.says).toMatch(/no dsh row/)
  })

  it('with no brief, keeps the run on Go and says a dsh run starts from a brief', async () => {
    await everyGoSlotUsedUp()
    const said = await theCheck({ brief: undefined })
    expect(said?.dsh).toBeNull()
    expect(said?.says).toMatch(/brief/)
  })
})

describe('a start on Go while every Go slot is used up, end to end', () => {
  // MUTATION 1: the launcher does not ask the router before it files a run on Go.
  it("is filed and started on dsh, says so on the run and in the start's words, and its one request goes through the DeepSeek slot", async () => {
    const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--dsh', dsh, '--json'])
    expect(up.status, up.err).toBe(0)
    const folder = (JSON.parse(up.out.trim()) as { folder: string }).folder
    await everyGoSlotUsedUp()
    const from = upstream.length
    const fromCalls = calls().length
    const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'opencode', '--model', GO_MODEL, '--brief', brief, '--json', '--', 'opencode', 'run', '--format', 'json', 'A made-up brief.'], true)
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim().split('\n').pop()!) as { run: string; hostPgid: number; startWords?: string }
    groups.add(start.hostPgid)
    expect(calls().slice(fromCalls).filter((one) => one.tool === 'docker' && one.argv[0] === 'exec' && one.argv.some((word) => word.endsWith('/sandbox-start.mjs')))).toHaveLength(1)

    // THE ONE SENTENCE, said at the start and in the start's words.
    const record = await ask('GET', `/api/records/${start.run}`)
    expect(record.status, JSON.stringify(record.body)).toBe(200)
    const data = (record.body.record ?? record.body).data as { runtime: string; model: string; extra?: { startedOnDshInPlaceOfGo?: string } }
    expect(data.runtime).toBe('dsh')
    expect(data.model).toBe(DSH_MODEL)
    const sentence = data.extra?.startedOnDshInPlaceOfGo ?? ''
    expect(sentence).toContain(`the first to reset is Made-up Go 2 at ${clockStamp(() => new Date(START + 1_800_000)).instant}`)
    for (const one of GO_SLOTS) expect(sentence).toContain(one.label)
    expect(sentence).toContain(DSH_MODEL)
    expect(sentence.match(/[.;!?](\s|$)/gu)).toHaveLength(1)
    expect(ran.err).toContain(sentence)
    expect(start.startWords ?? '').toContain(sentence)

    // DSH RAN, through the bridge with a run token and the native model, and DeepSeek answered.
    const seen = join(folder, 'out', 'stand-in-dsh.json')
    await until('the stand-in dsh to write what came back', () => existsSync(seen)).catch((why) => {
      const read = (f: string): string => (existsSync(join(folder, 'logs', start.run, f)) ? readFileSync(join(folder, 'logs', start.run, f), 'utf8') : '(none)')
      throw new Error(`${String(why)}\n--- out:\n${read('out')}\n--- dsh.log:\n${read('dsh.log')}\n--- helper.log:\n${read('helper.log')}`)
    })
    const dshRan = JSON.parse(readFileSync(seen, 'utf8')) as { model: string | null; baseUrlIsTheBridge: boolean; keyIsARunToken: boolean; briefIsAFile: boolean; status: number | null; text: string }
    expect(dshRan, dshRan.text).toMatchObject({ model: NATIVE, baseUrlIsTheBridge: true, keyIsARunToken: true, briefIsAFile: true, status: 200 })
    expect(upstream.slice(from)).toEqual([{ provider: 'deepseek', key: DEEPSEEK_SLOT.key }])

    // THE LEDGER: the run's one receipt is the DeepSeek slot's, and no Go slot is named on it.
    const receipts = await ask('GET', `/api/provider-router/receipts?run=${start.run}`, undefined, thePerson)
    expect(receipts.status, JSON.stringify(receipts.body)).toBe(200)
    expect((receipts.body.receipts as { slot: string; status: number; model: string }[]).map((one) => [one.slot, one.status, one.model])).toEqual([['ds-1', 200, NATIVE]])

    // NO KEY in anything the launcher printed or the run wrote.
    const written = [ran.out, ran.err, readFileSync(seen, 'utf8'), ...['out', 'helper.log', 'dsh.log'].map((f) => (existsSync(join(folder, 'logs', start.run, f)) ? readFileSync(join(folder, 'logs', start.run, f), 'utf8') : ''))]
    for (const text of written) for (const key of [...EVERY_KEY, MADE_UP_SECRET]) expect(text).not.toContain(key)
  }, 240_000)

  // MUTATION 4: the check promises the run starts on Go when no router listens; the launcher's router check then refuses it.
  it('with no router listening, refuses the start, says the router does not answer and that nothing is started, and prints no run', async () => {
    await everyGoSlotUsedUp()
    const control = theRouterControlSocket(sandboxes)
    const aside = `${control}.no-router`
    renameSync(control, aside)
    try {
      const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'opencode', '--model', GO_MODEL, '--brief', brief, '--json', '--verbose', '--', 'opencode', 'run', '--format', 'json', 'A made-up brief.'], true)
      expect(ran.status, ran.err).toBe(2)
      expect(ran.err).toContain(control)
      expect(ran.err).toContain('could not be asked which OpenCode Go slots are used up, because no router listens there')
      expect(ran.err).toContain("the launcher's router check will stop this start and nothing will be started on OpenCode Go or on dsh")
      expect(ran.err).toContain(host.theRouterIsDown(sandboxes))
      // NO START LINE IS PRINTED, so no run was started. The launcher asks the router before it files a run the router
      // must carry, so the start is refused before any record is filed; a start is the line this case finds absent.
      expect(ran.out.trim()).toBe('')
    } finally {
      renameSync(aside, control)
    }
  }, 240_000)

  // MUTATION 5: the check refuses the start when the router's answer cannot be read.
  it('with an answer from the router that cannot be read, starts the run on Go and its start words say the slots could not be read', async () => {
    await everyGoSlotUsedUp()
    const control = theRouterControlSocket(sandboxes)
    const aside = `${control}.unreadable`
    renameSync(control, aside)
    const unreadable = createServer((_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end('not the slots'))
    await new Promise<void>((done) => unreadable.listen(control, done))
    try {
      const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'opencode', '--model', GO_MODEL, '--brief', brief, '--json', '--', 'opencode', 'run', '--format', 'json', 'A made-up brief.'], true)
      expect(ran.status, ran.err).toBe(0)
      const start = JSON.parse(ran.out.trim().split('\n').pop()!) as { run: string; hostPgid: number; startWords?: string }
      groups.add(start.hostPgid)
      const record = await ask('GET', `/api/records/${start.run}`)
      expect(record.status, JSON.stringify(record.body)).toBe(200)
      const data = (record.body.record ?? record.body).data as { runtime: string; model: string }
      expect(data.runtime).toBe('opencode')
      expect(data.model).toBe(GO_MODEL)
      const words = start.startWords ?? ''
      expect(words).toContain('could not be asked which OpenCode Go slots are used up, because its answer could not be read (it answered 200)')
      expect(words).toContain('so this run starts on OpenCode Go as it was asked')
      expect(ran.err).toContain('so this run starts on OpenCode Go as it was asked')
    } finally {
      await new Promise((done) => unreadable.close(done))
      renameSync(aside, control)
    }
  }, 240_000)
})
