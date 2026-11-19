// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LATER `up` RELEASES THE CONTAINER ROW AN ENDED SESSION LEFT, AND IS REFUSED IN EVERY OTHER CASE.
 *
 * `up` registers a container row before it starts the container. A session that crashed after starting the sandbox
 * leaves that row open with no container behind it, and every later `up` of the sandbox was refused until somebody
 * released the row by hand. The test runs the launcher as its own process, with a stand-in docker and devcontainer on
 * PATH and a stand-in office in this process on a port of its own, and reads what the launcher did to the row, to the
 * office and to docker.
 *
 * The four cases are the four facts the launcher has to tell apart:
 *   1. the ledger counts the holding session as over and docker knows no container of that name: the row is released,
 *      a new row is registered for the caller's session, and the container is started;
 *   2. the holding session still runs: refused, the row stays open, nothing is released or started;
 *   3. the holding session is over but docker knows the container: refused, nothing is released or started;
 *   4. the holding session is in a state a run is over in that the ledger does not count as over, and docker knows no
 *      container: refused, and no release is asked, because the ledger refuses it without force.
 *
 * The stand-in docker answers the launcher's first look for the container name as "no such container", before the
 * launcher reads the ledger, and answers its later look as the container case 3 is about. That is what puts case 3 at
 * the ledger's own decision instead of the earlier "already up" refusal, so the case measures the check this test is
 * for. The state words and the container prefix are read from the code, never written here.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { A_RUN_IS_OVER_IN, CONTAINER_PREFIX } from '../tools/sandbox-common.mjs'
import { THE_LEDGER_COUNTS_A_SESSION_OVER_IN } from '../src/config/the-ledgers-ended-states.mjs'
import { SESSION_STATES } from '../src/shared/types.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { FAKE_DEVCONTAINER, FAKE_DF, FAKE_DU, FAKE_FREE, aFakeNpm } from './sandbox-stand-ins.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
/** The session whose row is already open when the later `up` runs, and the caller that starts it. */
const HOLDING_SESSION = 'the-session-that-left-the-row'
const CALLER = { agent: 'a-later-agent', session: 'the-later-session' }
/** A state the ledger counts a session over in, one a run is over in that the ledger does not count, and one a run is
 * still going in, all read from the declarations. The first is taken from the middle of its list: the first word there
 * is one an ordinary sentence about an unfinished run holds. */
const ENDED_STATE = THE_LEDGER_COUNTS_A_SESSION_OVER_IN[1]!
const OVER_BUT_NOT_FOR_THE_LEDGER = A_RUN_IS_OVER_IN.find((state) => !(THE_LEDGER_COUNTS_A_SESSION_OVER_IN as readonly string[]).includes(state))!
const STILL_RUNNING_STATE = SESSION_STATES.find(
  (state) => !A_RUN_IS_OVER_IN.includes(state) && !(THE_LEDGER_COUNTS_A_SESSION_OVER_IN as readonly string[]).includes(state),
)!

interface Row {
  id: string
  type: 'container'
  key: string
  sessionRecordId: string
  releasedAt: string | null
  detail?: string
}

interface ARecord {
  id: string
  kind: 'session'
  data: { state: string }
}

interface ARelease {
  rowId: string
  body: { force?: boolean; note?: string; expect?: string }
}

interface Ran {
  status: number
  out: string
  err: string
}

let scratch = ''
let fakes = ''
let sandboxes = ''
let main = ''
let template = ''
let dsh = ''
let api = ''
let server: ReturnType<typeof createServer> | null = null
let rows: Row[] = []
let records = new Map<string, ARecord>()
let releases: ARelease[] = []
let rowCount = 0

/** The stand-in office's answer, written once so every door answers the same shape. */
function answer(response: import('node:http').ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function bodyOf(request: import('node:http').IncomingMessage): Promise<Record<string, any>> {
  const pieces: Buffer[] = []
  for await (const piece of request) pieces.push(Buffer.from(piece))
  const text = Buffer.concat(pieces).toString('utf8')
  return text === '' ? {} : JSON.parse(text)
}

/** The ledger row an ended session left open for `name`. */
function aRowLeftBy(session: string, name: string): Row {
  const row: Row = { id: `row-left-${name}`, type: 'container', key: `${CONTAINER_PREFIX}${name}`, sessionRecordId: session, releasedAt: null }
  rows.push(row)
  return row
}

/** The stand-in docker's state, as the container and its own callers see it. */
interface FakeState {
  containers: Record<string, { Id: string; Name: string; State: { Running: boolean }; Config: { Labels: Record<string, string> }; Mounts: unknown[] }>
  calls: { tool: string; argv: string[]; runArgs?: string[]; rowSeen?: boolean }[]
  bugs: Record<string, boolean>
  inspectPlan: Record<string, string[]>
}

function fakeState(): FakeState {
  return JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8')) as FakeState
}

function saveFakeState(state: FakeState): void {
  writeFileSync(join(fakes, 'state.json'), JSON.stringify(state))
}

/**
 * A STAND-IN DOCKER: it knows the containers the stand-in devcontainer made, answers "no such container" for the name
 * before a case's container is made, and can answer an arranged series for one name. Only `inspect` is asked of it:
 * with no package lockfile and an origin at the mirror, `up` runs nothing in the container after starting it.
 */
const STAND_IN_DOCKER = String.raw`#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const file = path.join(process.env.FAKE_DOCKER_DIR, 'state.json')
const state = JSON.parse(fs.readFileSync(file, 'utf8'))
const save = () => fs.writeFileSync(file, JSON.stringify(state))
const argv = process.argv.slice(2)
if (argv[0] !== 'inspect') { process.stderr.write('the stand-in docker does not know ' + argv[0] + '\n'); process.exit(2) }
const asked = argv[argv.length - 1]
state.calls.push({ tool: 'docker', argv })
const planned = state.inspectPlan && state.inspectPlan[asked]
if (Array.isArray(planned) && planned.length > 0) {
  const next = planned.shift()
  save()
  if (next !== 'present') { process.stderr.write('Error: No such container: ' + asked + '\n'); process.exit(1) }
  const there = state.containers[asked]
  if (there === undefined) { process.stderr.write('Error: No such container: ' + asked + '\n'); process.exit(1) }
  process.stdout.write(JSON.stringify([there]))
  process.exit(0)
}
const found = Object.values(state.containers).find((c) => c.Name === '/' + asked || c.Id === asked)
save()
if (found === undefined) { process.stderr.write('Error: No such container: ' + asked + '\n'); process.exit(1) }
process.stdout.write(JSON.stringify([found]))
`

function theToolsEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
    FAKE_DOCKER_DIR: fakes,
    MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
    MOLE_SANDBOX_MEMORY_TEST_ROOT: join(fakes, 'memory-files'),
  }
  for (const name of ['MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_API', 'MOLE_AGENT_KEY']) delete env[name]
  return env
}

/** `up` as its own process, against the stand-in office and the stand-ins on PATH. */
function up(name: string): Promise<Ran> {
  const args = [
    TOOL,
    'up', template,
    '--name', name,
    '--from', main,
    '--dsh', dsh,
    '--sandboxes', sandboxes,
    '--api', api,
    '--workspace', WORKSPACE,
    '--as', CALLER.agent,
    '--session', CALLER.session,
  ]
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { env: theToolsEnvironment() })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (piece: Buffer) => out.push(piece))
    child.stderr.on('data', (piece: Buffer) => err.push(piece))
    child.on('close', (code) => done({ status: code ?? 1, out: Buffer.concat(out).toString('utf8'), err: Buffer.concat(err).toString('utf8') }))
  })
}

function git(folder: string, ...args: string[]): void {
  execFileSync('git', ['-C', folder, ...args], { encoding: 'utf8' })
}

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-up-releases-a-row-'))
  fakes = join(scratch, 'fakes')
  sandboxes = join(scratch, 'sandboxes')
  mkdirSync(join(fakes, 'bin'), { recursive: true })

  server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://the-stand-in-office')
      if (request.method === 'GET' && url.pathname === '/api/resources') {
        return answer(response, 200, { resources: rows.filter((row) => row.releasedAt === null) })
      }
      if (request.method === 'POST' && url.pathname === '/api/resources') {
        const body = await bodyOf(request)
        const row: Row = { id: `row-registered-${++rowCount}`, type: 'container', key: String(body['key']), sessionRecordId: String(body['sessionRecordId']), releasedAt: null, detail: body['detail'] }
        rows.push(row)
        return answer(response, 201, { resource: row })
      }
      const release = /^\/api\/resources\/([^/]+)\/release$/.exec(url.pathname)
      if (request.method === 'POST' && release !== null) {
        const rowId = decodeURIComponent(release[1]!)
        const body = await bodyOf(request)
        releases.push({ rowId, body: body as ARelease['body'] })
        const row = rows.find((one) => one.id === rowId)
        if (row === undefined) return answer(response, 404, { error: `the stand-in office holds no row ${rowId}` })
        if (row.releasedAt !== null) return answer(response, 409, { error: `row ${rowId} was already released` })
        row.releasedAt = new Date().toISOString()
        return answer(response, 200, { resource: row })
      }
      const record = /^\/api\/records\/([^/]+)$/.exec(url.pathname)
      if (request.method === 'GET' && record !== null) {
        const id = decodeURIComponent(record[1]!)
        const held = records.get(id)
        if (held === undefined) return answer(response, 404, { error: `the stand-in office holds no record ${id}` })
        return answer(response, 200, { record: held })
      }
      return answer(response, 404, { error: `the stand-in office does not answer ${String(request.method)} ${url.pathname}` })
    })().catch((why: unknown) => answer(response, 500, { error: why instanceof Error ? why.message : String(why) }))
  })
  await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done))
  api = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`

  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), STAND_IN_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'npm'), aFakeNpm(fakes), { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {}, inspectPlan: {} }))

  // THE CHECKOUT A SANDBOX IS MADE FROM: a small git repository whose tools and src are this checkout's, with the two
  // paths the template covers by a tmpfs on disk, as they are on the host.
  main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', aTestAddress('fixture'))
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  symlinkSync(join(REPO, 'src'), join(main, 'src'))
  writeFileSync(join(main, 'README.md'), 'a checkout for the launcher test\n')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')

  // THE TEMPLATE: the real template's shape, with a network of its own so nothing reaches this machine, and no GPU.
  template = join(scratch, 'template')
  mkdirSync(template)
  writeFileSync(join(template, 'devcontainer.json'), JSON.stringify({
    name: 'up-releases-a-row',
    runArgs: ['--network=none'],
    init: false,
    overrideCommand: false,
    containerUser: '1000:1000',
    remoteUser: '1000:1000',
    updateRemoteUserUID: false,
    userEnvProbe: 'none',
    workspaceMount: 'type=bind,source=${localEnv:SANDBOX_DIR},target=${localEnv:SANDBOX_DIR}',
    workspaceFolder: '${localEnv:SANDBOX_DIR}',
    mounts: [
      'type=bind,source=${localEnv:SANDBOX_MAIN_CHECKOUT},target=${localEnv:SANDBOX_MAIN_CHECKOUT},readonly',
      'type=tmpfs,target=${localEnv:SANDBOX_MAIN_CHECKOUT}/data,readonly,tmpfs-size=65536',
      'type=tmpfs,target=${localEnv:SANDBOX_MAIN_CHECKOUT}/node_modules/.vite-temp,tmpfs-size=67108864,tmpfs-mode=1777',
    ],
    containerEnv: { HOME: '${localEnv:SANDBOX_DIR}/home' },
  }, null, 2))
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify({ template: 'up-releases-a-row' }, null, 2))

  dsh = join(scratch, 'dsh')
  mkdirSync(join(dsh, 'home', 'profiles'), { recursive: true })
}, 120_000)

afterAll(async () => {
  if (server !== null) await new Promise<void>((done) => server!.close(() => done()))
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe('up and an open container row of another session', () => {
  it('releases the row when the holding session is over and docker knows no container, then registers and starts', async () => {
    const name = 'left-by-an-ended-session'
    const container = `${CONTAINER_PREFIX}${name}`
    records.set(HOLDING_SESSION, { id: HOLDING_SESSION, kind: 'session', data: { state: ENDED_STATE } })
    const held = aRowLeftBy(HOLDING_SESSION, name)
    const rowsBefore = rows.length
    const releasesBefore = releases.length
    const startsBefore = fakeState().calls.filter((call) => call.tool === 'devcontainer').length

    const ran = await up(name)

    expect(ran.status, ran.err).toBe(0)
    // THE ROW WAS RELEASED, WITHOUT FORCE, IN A NOTE THAT NAMES THE SESSION.
    expect(releases.length).toBe(releasesBefore + 1)
    const release = releases[releasesBefore]!
    expect(release.rowId).toBe(held.id)
    expect(release.body.force).toBeUndefined()
    expect(release.body.note).toContain(HOLDING_SESSION)
    expect(release.body.note).toContain(ENDED_STATE)
    expect(held.releasedAt).not.toBeNull()
    // A NEW ROW IS REGISTERED FOR THE CALLER, AND IT IS NOT THE OLD ONE.
    const mine = rows.filter((row) => row.sessionRecordId === CALLER.session && row.key === container && row.releasedAt === null)
    expect(mine).toHaveLength(1)
    expect(rows.length).toBe(rowsBefore + 1)
    expect(mine[0]!.id).not.toBe(held.id)
    // AND THE CONTAINER IS STARTED, AFTER THE ROW WAS THERE.
    const starts = fakeState().calls.filter((call) => call.tool === 'devcontainer' && call.runArgs?.includes(`--name=${container}`) === true)
    expect(starts).toHaveLength(startsBefore + 1)
    expect(starts[startsBefore]!.rowSeen).toBe(true)
    expect(fakeState().containers[container]?.State.Running).toBe(true)
  })

  it('refuses and releases nothing when the holding session still runs', async () => {
    const name = 'second-sandbox'
    const container = `${CONTAINER_PREFIX}${name}`
    records.set(HOLDING_SESSION, { id: HOLDING_SESSION, kind: 'session', data: { state: STILL_RUNNING_STATE } })
    const held = aRowLeftBy(HOLDING_SESSION, name)
    const releasesBefore = releases.length
    const startsBefore = fakeState().calls.filter((call) => call.tool === 'devcontainer').length

    const ran = await up(name)

    expect(ran.status, ran.err).toBe(1)
    expect(ran.err).toContain(STILL_RUNNING_STATE)
    expect(held.releasedAt).toBeNull()
    expect(releases.length).toBe(releasesBefore)
    expect(fakeState().calls.filter((call) => call.tool === 'devcontainer').length).toBe(startsBefore)
    expect(rows.some((row) => row.sessionRecordId === CALLER.session && row.key === container)).toBe(false)
    expect(fakeState().containers[container]).toBeUndefined()
  })

  it('refuses and releases nothing when the holding session is over but docker knows the container', async () => {
    const name = 'third-sandbox'
    const container = `${CONTAINER_PREFIX}${name}`
    records.set(HOLDING_SESSION, { id: HOLDING_SESSION, kind: 'session', data: { state: ENDED_STATE } })
    const held = aRowLeftBy(HOLDING_SESSION, name)
    // THE FIRST LOOK, BEFORE THE LEDGER IS READ, FINDS NOTHING SO THE LEDGER'S OWN CHECK IS REACHED; THE SECOND LOOK,
    // WHICH THAT CHECK MAKES, FINDS THE CONTAINER THIS CASE IS ABOUT.
    const state = fakeState()
    state.containers[container] = { Id: 'a'.repeat(64), Name: `/${container}`, State: { Running: true }, Config: { Labels: {} }, Mounts: [] }
    state.inspectPlan[container] = ['missing', 'present']
    saveFakeState(state)
    const releasesBefore = releases.length
    const startsBefore = state.calls.filter((call) => call.tool === 'devcontainer').length

    const ran = await up(name)

    expect(ran.status, ran.err).toBe(1)
    // THE REFUSAL IS THE LEDGER'S, AND IT SAYS WHAT IT FOUND: the ended session and the container.
    expect(ran.err).toContain(HOLDING_SESSION)
    expect(ran.err).toContain(ENDED_STATE)
    expect(ran.err).toContain(container)
    expect(held.releasedAt).toBeNull()
    expect(releases.length).toBe(releasesBefore)
    expect(fakeState().calls.filter((call) => call.tool === 'devcontainer').length).toBe(startsBefore)
    expect(rows.some((row) => row.sessionRecordId === CALLER.session && row.key === container)).toBe(false)
  })

  it('refuses and asks no release when the holding session is over only in a word the ledger does not count', async () => {
    expect(OVER_BUT_NOT_FOR_THE_LEDGER).toBeDefined()
    const name = 'fourth-sandbox'
    const container = `${CONTAINER_PREFIX}${name}`
    records.set(HOLDING_SESSION, { id: HOLDING_SESSION, kind: 'session', data: { state: OVER_BUT_NOT_FOR_THE_LEDGER } })
    const held = aRowLeftBy(HOLDING_SESSION, name)
    const releasesBefore = releases.length
    const startsBefore = fakeState().calls.filter((call) => call.tool === 'devcontainer').length

    const ran = await up(name)

    expect(ran.status, ran.err).toBe(1)
    expect(ran.err).toContain(HOLDING_SESSION)
    expect(ran.err).toContain(OVER_BUT_NOT_FOR_THE_LEDGER)
    expect(held.releasedAt).toBeNull()
    expect(releases.length).toBe(releasesBefore)
    expect(fakeState().calls.filter((call) => call.tool === 'devcontainer').length).toBe(startsBefore)
    expect(rows.some((row) => row.sessionRecordId === CALLER.session && row.key === container)).toBe(false)
    expect(fakeState().containers[container]).toBeUndefined()
  })
})
