// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Actual Office and serve-dev; the receipt alone is explicitly synthetic. */
import { afterEach, expect } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { chmodSync, closeSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import Database from 'better-sqlite3'
import { commandThatStopsWithItsOwner, freshDb, governsTheWholeProject } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { localStamp, theClockZone } from '../src/shared/time.ts'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { theStableCheckoutFolder } from '../src/config/sandbox-folder.mjs'
import { askTheOffice, type ARequest } from '../tools/office-request.mjs'
import { receiptFromArtifacts } from '../tools/periodic-main-suite.mjs'
import { requireIndependentGitObjects } from '../tools/independent-storage.mjs'
import { rehearsalPortRefusals } from '../tools/stable/stable-bootstrap-support.mjs'
import { PLUGINS_FOLDER, PLUGIN_MANIFEST_FILE, PLUGIN_ID } from '../src/shared/plugin-change.ts'
import { ACTUAL_OFFICE_SKIPPED, askedForTheActualOffice, theFoldersThisFileMakes } from './stable-bootstrap-test-folder.ts'

const root = resolve(import.meta.dirname, '..')
const toolNames = ['stable/bootstrap-stable.mjs', 'stable/stable-bootstrap-transaction.mjs', 'stable/stable-bootstrap-support.mjs', 'stable/stable-bootstrap-storage.mjs', 'stable/stable-bootstrap-processes.mjs', 'stable/stable-bootstrap-execution.mjs', 'stable/stable-bootstrap-transport.mjs', 'stable/stable-bootstrap-launcher.mjs', 'stable/stable-bootstrap-words.mjs', 'stable/stable-service-settings.mjs', 'independent-storage.mjs', 'stable/stable-upgrade-transaction.mjs', 'stable/electrons-binary.mjs', 'database-holders.mjs']
const owned: Array<{ child?: ChildProcess; pid: number; startTime: string; pgid: number; leader: string; order: number }> = []
const fixtures = theFoldersThisFileMakes()
const previousKey = process.env.MOLE_AGENT_KEY
// The candidate tag names this process's local day, and bootstrap-stable.mjs checks it against its own, so
// every child and the service read the day in this zone.
const fixtureTimeZone = theClockZone()

/** Each of the five files skips its one case unless this is true, and this module says why when it is not. */
export const ACTUAL_OFFICE_ASKED = askedForTheActualOffice()
if (!ACTUAL_OFFICE_ASKED) console.warn(ACTUAL_OFFICE_SKIPPED)

/**
 * THE ROUND'S OWN NAMED RUNS MAY KEEP A COPY OF EACH FIXTURE'S PROOF, AND NOTHING ELSE IS KEPT.
 * When this variable names a folder, the logs, the configurations, the timings and hashes the tests
 * write, the transaction journals and the source bundle are copied into it before the fixture is
 * removed, as rule bkC5OcNhinuy keeps them. The private credentials, the two checkouts, the
 * database and its images and the npm home are never copied.
 */
const PROOF_VARIABLE = 'STABLE_BOOTSTRAP_TEST_PROOF'

export function write(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
}
function birth(pid: number) {
  const text = readFileSync(`/proc/${pid}/stat`, 'utf8'), fields = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/)
  return { pid, ppid: Number(fields[1]), pgid: Number(fields[2]), startTime: fields[19]!, state: fields[0] }
}
export function identity(pid: number) {
  const value = birth(pid)
  return { pid, ppid: value.ppid, pgid: value.pgid, startTime: value.startTime, groupLeader: { pid: value.pgid, startTime: birth(value.pgid).startTime }, cwd: realpathSync(`/proc/${pid}/cwd`), argv: readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean) }
}
function retainGroup(pid: number, child?: ChildProcess, order = 0) {
  const value = birth(pid)
  if (!owned.some(row => row.pgid === value.pgid)) owned.push({ child, pid, startTime: value.startTime, pgid: value.pgid, leader: birth(value.pgid).startTime, order })
}
// The real server refuses to start under the runner without the suite's mark,
// so every environment built here keeps it (src/config/the-test-mark.mjs).
function env(home: string): NodeJS.ProcessEnv {
  if (!process.env[THE_TEST_MARK]) throw new Error('The runner did not give this worker the suite mark.')
  return { PATH: process.env.PATH, [THE_TEST_MARK]: process.env[THE_TEST_MARK], HOME: home, TMPDIR: home, LANG: 'C.UTF-8', TZ: fixtureTimeZone, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', npm_config_cache: join(home, 'npm'), npm_config_userconfig: join(home, 'npmrc'), npm_config_globalconfig: '/dev/null' }
}
function command(cwd: string, program: string, args: string[], environment = env(cwd), timeout = 60000) {
  const result = spawnSync(program, args, { cwd, env: environment, encoding: 'utf8', timeout, maxBuffer: 2 * 1024 * 1024 })
  write(join(theFixtureHolding(cwd), 'command-logs', `${randomBytes(6).toString('hex')}.log`), JSON.stringify({ cwd, program, args, status: result.status, stdout: result.stdout, stderr: result.stderr }))
  if (result.error || result.status !== 0) throw new Error(`Synthetic actual-office command failed (${program}): ${result.error?.message ?? result.stderr}`)
  return result.stdout.trim()
}
export const git = (cwd: string, ...args: string[]) => command(cwd, 'git', args)
/** The fixture folder a command runs in, so that its log is removed with the fixture. */
function theFixtureHolding(path: string) {
  const folder = fixtures.made().find(folder => path === folder || path.startsWith(folder + sep))
  if (folder === undefined) throw new Error(`${path} is in no fixture folder this file made, so its command log has nowhere to go.`)
  return folder
}
async function port(): Promise<number> {
  const server = createServer(); await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const chosen = (server.address() as { port: number }).port
  await new Promise<void>(done => server.close(() => done()))
  // The same two rules the rehearsal applies: nothing else listens on it now, and whoever ran the test did not name it.
  return rehearsalPortRefusals(chosen, { env: process.env }).length ? port() : chosen
}
async function executable(cwd: string, args: string[], environment: NodeJS.ProcessEnv, log: string, timeout = 900000) {
  const fd = openSync(log, 'ax', 0o600)
  const child = spawn(process.execPath, args, { cwd, env: environment, stdio: ['ignore', 'pipe', fd] })
  closeSync(fd)
  let stdout = ''; child.stdout!.on('data', chunk => { stdout += chunk })
  let clock: ReturnType<typeof setTimeout> | undefined, timedOut = false
  const exited = new Promise<{ code: number | null; stdout: string }>((done, reject) => {
    child.once('error', reject)
    child.once('exit', code => { if (clock) clearTimeout(clock); if (timedOut) reject(new Error('The owned fixture command exceeded its explicit timeout and has exited.')); else done({ code, stdout }) })
    clock = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, timeout)
  })
  const result = await exited
  write(log + '.stdout.json', result.stdout)
  return { ...result, result: result.stdout.trim().startsWith('{') ? JSON.parse(result.stdout) : null }
}

afterEach(async () => {
  // Every fixture this file made goes at the end of this hook, by the literal path written down
  // when it was made, whether the test passed, failed or threw and whether the checks here pass.
  const finished = fixtures.made()
  try {
    for (const folder of finished) {
      const recovery = join(folder, 'recovery')
      for (const name of readdirSync(recovery).filter(name => name.endsWith('.journal.jsonl'))) {
        for (const line of readFileSync(join(recovery, name), 'utf8').trim().split('\n').filter(Boolean)) {
          const row = JSON.parse(line)
          const identities = row.phase === 'group-recorded' ? [row.process] : row.topology ? [row.topology.supervisor, row.topology.server, row.topology.worker].filter(Boolean) : []
          for (const record of identities) {
            try { if (birth(record.pid).startTime === record.startTime && birth(record.pgid).startTime === record.groupLeader.startTime) retainGroup(record.pid, undefined, record === row.topology?.server ? 1 : record === row.topology?.worker ? 2 : 0) }
            catch (error: any) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error }
          }
        }
      }
    }
    // Stop recorded supervisors first; then verify their recorded detached groups.
    for (const row of owned.splice(0).sort((a, b) => a.order - b.order)) {
      try {
        const actual = birth(row.pid), leader = birth(row.pgid)
        if (actual.startTime !== row.startTime || leader.startTime !== row.leader || actual.pgid !== row.pgid) throw new Error('An owned fixture group identity changed; no guessed cleanup is authorized.')
        if (!['Z', 'X'].includes(actual.state!)) process.kill(-row.pgid, 'SIGTERM')
      } catch (error: any) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error }
      for (let n = 0; n < 500; n++) {
        try { if (['Z', 'X'].includes(birth(row.pid).state!)) break } catch (error: any) { if (['ENOENT', 'ESRCH'].includes(error.code)) break; throw error }
        if (n === 499) throw new Error(`An exact owned fixture group (${row.pgid}) did not stop; it is still running, and its fixture folder is removed anyway.`)
        await delay(20)
      }
    }
    for (const folder of finished) {
      const portsPath = join(folder, 'fixture-ports.json')
      if (existsSync(portsPath)) for (const port of JSON.parse(readFileSync(portsPath, 'utf8'))) {
        expect(command(folder, 'ss', ['-H', '-ltnp', `sport = :${port}`], env(folder))).toBe('')
      }
      const dev = join(folder, 'development'), stable = theStableCheckoutIn(folder), recovery = join(folder, 'recovery'), proof = join(folder, 'retained-proof')
      mkdirSync(proof, { mode: 0o700 })
      if (existsSync(join(dev, '.git'))) {
        git(dev, 'bundle', 'create', join(proof, 'source.bundle'), '--all')
        git(dev, 'bundle', 'verify', join(proof, 'source.bundle'))
        write(join(proof, 'source-git.json'), { head: git(dev, 'rev-parse', 'HEAD'), tree: git(dev, 'rev-parse', 'HEAD^{tree}'), status: git(dev, 'status', '--porcelain=v1', '--untracked-files=all'), worktrees: git(dev, 'worktree', 'list', '--porcelain') })
      }
      const collect = (path: string, relative = '') => {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
          const at = join(path, entry.name), name = join(relative, entry.name)
          if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'npm') collect(at, name)
          else if (entry.isFile() && (entry.name.endsWith('.log') || entry.name.endsWith('.jsonl') || entry.name === 'prepared-state.json')) { const target = join(proof, 'transaction', name); mkdirSync(dirname(target), { recursive: true, mode: 0o700 }); copyFileSync(at, target) }
        }
      }
      collect(recovery)
      const metadata = join(recovery, `stable-${localStamp(new Date()).slice(0, 10)}-synthetic`, 'prepared-state.json')
      if (existsSync(metadata)) {
        const state = JSON.parse(readFileSync(metadata, 'utf8'))
        const implementation = new URL('../tools/independent-storage.mjs', import.meta.url).href
        const { artifactIdentity } = await import(/* @vite-ignore */ implementation)
        const identities: any[] = []
        for (const [path, artifacts] of [[dev, state.originalArtifacts], [stable, state.artifacts], [join(state.paths.work, 'original-artifacts'), state.originalArtifacts]] as Array<[string, any]>) {
          for (const relative of artifacts.paths) identities.push({ root: path, path: relative, recorded: artifacts.identities[relative], observed: artifactIdentity(join(path, relative), path, artifacts.paths.map((name: string) => join(path, name))) })
        }
        expect(identities.every(row => row.recorded === row.observed)).toBe(true)
        write(join(proof, 'artifact-identities.json'), identities)
      }
    }
  } finally {
    try { for (const folder of finished) keepTheProof(folder) } finally {
      fixtures.removeEveryOne()
      if (previousKey === undefined) delete process.env.MOLE_AGENT_KEY; else process.env.MOLE_AGENT_KEY = previousKey
    }
  }
})

/** Says how much one fixture held before it goes, and copies its proof when PROOF_VARIABLE asks. */
function keepTheProof(folder: string) {
  const measured = spawnSync('du', ['-sb', folder], { encoding: 'utf8', timeout: 120000 })
  if (measured.error || measured.status !== 0) throw new Error(`du could not measure the fixture ${folder}, which is removed anyway: ${measured.error?.message ?? measured.stderr}`)
  const bytes = Number(measured.stdout.split('\t')[0])
  console.log(`The actual-office fixture ${folder} held ${bytes} bytes; it is removed now.`)
  const under = process.env[PROOF_VARIABLE]
  if (under === undefined) return
  const kept = join(under, basename(folder))
  mkdirSync(kept, { recursive: true, mode: 0o700 })
  for (const name of ['retained-proof', 'command-logs']) if (existsSync(join(folder, name))) cpSync(join(folder, name), join(kept, name), { recursive: true })
  for (const entry of readdirSync(folder, { withFileTypes: true })) if (entry.isFile() && entry.name !== 'fixture-credentials.json') copyFileSync(join(folder, entry.name), join(kept, entry.name))
  write(join(kept, 'FIXTURE-SIZE.json'), { folder, bytes, says: 'The fixture folder held this many bytes and was removed by its literal path after this copy.' })
}

/** One fixture's folder, with the three folders the after-hook reads, written down for removal. */
export function aBootstrapFixtureFolder() {
  const folder = fixtures.make('actual-office')
  for (const name of ['recovery', 'data', 'home']) mkdirSync(join(folder, name), { mode: 0o700 })
  mkdirSync(dirname(theStableCheckoutIn(folder)), { recursive: true, mode: 0o700 })
  return folder
}

/** The stable checkout's one folder under the fixture's made-up home, the home the stable office starts with. */
function theStableCheckoutIn(folder: string): string {
  return theStableCheckoutFolder(join(folder, 'home'))
}

export async function actualBootstrapOffice() {
  // A normal whole-suite checkout is already the assembled source. A pre-join
  // proof may explicitly name the root-approved assembled checkout instead.
  const source = process.env.STABLE_BOOTSTRAP_REHEARSAL_SOURCE ?? root
  const folder = aBootstrapFixtureFolder(), dev = join(folder, 'development'), stable = theStableCheckoutIn(folder), recovery = join(folder, 'recovery'), data = join(folder, 'data'), home = join(folder, 'home')
  git(folder, 'clone', '--no-local', '--no-hardlinks', '--single-branch', source, dev)
  requireIndependentGitObjects(join(dev, '.git'))
  expect(existsSync(join(dev, '.git/objects/info/alternates'))).toBe(false)
  git(dev, 'checkout', '-B', 'main'); git(dev, 'config', 'user.name', 'Synthetic bootstrap rehearsal'); git(dev, 'config', 'user.email', 'fixture@example.invalid')
  // Overlay only this worker's implementation. The launcher and backend come
  // from the exact root-approved assembled source; this never edits them.
  for (const name of toolNames) cpSync(join(root, 'tools', name), join(dev, 'tools', name))
  git(dev, 'add', 'tools'); git(dev, 'commit', '--allow-empty', '-m', 'Synthetic bootstrap transaction under test')
  const targetCommit = git(dev, 'rev-parse', 'HEAD'), targetTree = git(dev, 'rev-parse', 'HEAD^{tree}')
  command(dev, 'npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], env(home), 180000)
  const database = join(data, 'office.sqlite'), keys = join(data, 'keys.json')
  const t = await freshDb()
  const agent = t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Synthetic bootstrap secretary', data: { handle: 'bootstrap-fixture-secretary', runtime: 'codex', state: 'active' }, actor: t.api.HUMAN })
  const { agentForRecord } = await import('../src/server/lib/participants.ts')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const agentId = agentForRecord(agent.id)!.id
  t.client.sqlite.prepare("UPDATE agents SET role='secretary' WHERE id=?").run(agentId)
  const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic bootstrap rehearsal run', data: { state: 'running', runtime: 'mole-office', servingAgent: agentId }, actor: t.api.HUMAN })
  const person = randomBytes(32).toString('hex')
  write(join(dirname(t.file), 'keys.json'), { person, office: randomBytes(32).toString('hex'), providers: {} })
  const key = makeAnAgentKey(agentId, null)
  t.client.sqlite.prepare('UPDATE installation SET window_closed_at=?,window_closed_by_kind=?,window_closed_by_id=? WHERE only_row=1').run(localStamp(new Date(Date.now() - 3600000)), 'person', THE_TEST_OFFICES_OWNER.id)
  await t.client.sqlite.backup(database); copyFileSync(join(dirname(t.file), 'keys.json'), keys); chmodSync(database, 0o600); chmodSync(keys, 0o600); t.close()
  const servicePort = await port(), redirect = await port(), releaseCheckPort = await port()
  write(join(folder, 'fixture-ports.json'), [servicePort, redirect, releaseCheckPort])
  const serviceSettings = { TZ: fixtureTimeZone, MOLE_OFFICE_MESSAGE_WORKER: 'off', MOLE_OFFICE_TERMINAL_HOLDER: 'off', MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none', MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_API: `http://127.0.0.1:${servicePort}`, MOLE_OFFICE_WEB: `http://127.0.0.1:${redirect}`, MOLE_OFFICE_WEB_PORT: String(redirect) }
  // Stable reads this original settings file with MOLE_OFFICE_DEVELOPMENT_CHECKOUT.
  write(join(dev, '.env'), `MOLE_OFFICE_OWNER_ID=${THE_TEST_OFFICES_OWNER.id}\nMOLE_OFFICE_OWNER_NAME=${THE_TEST_OFFICES_OWNER.name}\nMOLE_OFFICE_PIXEL_OFFICE=off\nTMPDIR=${home}\n`)
  const serviceEnv = { ...env(home), ...serviceSettings, MOLE_OFFICE_DB: database, MOLE_OFFICE_PORT: String(servicePort), MOLE_OFFICE_START_MODE: 'ordinary', NODE_ENV: 'production' }
  for (const name of readdirSync(join(dev, PLUGINS_FOLDER)).filter(name => PLUGIN_ID.test(name) && existsSync(join(dev, PLUGINS_FOLDER, name, PLUGIN_MANIFEST_FILE)))) {
    command(dev, process.execPath, ['tools/build-a-plugin.mjs', name, '--json'], serviceEnv, 180000)
  }
  const fd = openSync(join(folder, 'original-serve-dev.log'), 'ax', 0o600)
  // The group dies with this worker even after a SIGKILL. exec keeps the pid the topology records.
  const watched = commandThatStopsWithItsOwner(process.execPath, ['tools/serve-dev.mjs', '--built'])
  const child = spawn(watched.command, watched.args, { cwd: dev, env: serviceEnv, detached: true, stdio: ['ignore', fd, fd] }); closeSync(fd)
  if (!child.pid) throw new Error('The actual development supervisor did not start.')
  retainGroup(child.pid, child)
  process.env.MOLE_AGENT_KEY = key
  const keepClear = process.env.MOLE_OFFICE_REHEARSAL_KEEP_CLEAR_PORTS
  const requestEnv = { ...env(home), MOLE_AGENT_KEY: key, MOLE_OFFICE_AGENT: 'bootstrap-fixture-secretary', MOLE_OFFICE_SESSION: run.id, MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_API: serviceSettings.MOLE_OFFICE_API, ...(keepClear === undefined ? {} : { MOLE_OFFICE_REHEARSAL_KEEP_CLEAR_PORTS: keepClear }) }
  const calls: ARequest[] = []
  const officeRequest = async (request: ARequest) => { calls.push(request); return askTheOffice(request, { env: requestEnv, fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) }) }
  const object = async (path: string) => { const reply = await officeRequest({ method: 'GET', path }); expect(reply.status, reply.body).toBe(200); return JSON.parse(reply.body) }
  let runtime: any
  for (let n = 0; n < 600; n++) {
    try { const reply = await officeRequest({ method: 'GET', path: '/api/runtime' }); if (reply.status === 200) { runtime = JSON.parse(reply.body); if (runtime.supervisor?.pid && runtime.process?.pid) break } } catch { /* this exact owned launch only */ }
    await delay(100)
  }
  if (!runtime?.supervisor?.pid) throw new Error('The actual development Office did not expose a supervised runtime; inspect original-serve-dev.log.')
  const topology = { supervisor: identity(runtime.supervisor.pid), server: identity(runtime.process.pid), worker: runtime.worker?.started ? identity(runtime.worker.pid) : null }
  retainGroup(topology.server.pid, undefined, 1)
  if (topology.worker) retainGroup(topology.worker.pid, undefined, 2)
  const evidence = await originalEvidence({ folder, dev, targetCommit, targetTree, officeRequest })
  const notices: any = {}
  for (const stage of ['before', 'after']) {
    const text = stage === 'before' ? 'The synthetic first handoff is about to start.' : 'The synthetic stable checkout is serving.'
    const reply = await officeRequest({ method: 'POST', path: '/api/records', body: { kind: 'note', title: `Synthetic approved ${stage} wording`, data: { body: text } } })
    expect(reply.status, reply.body).toBe(201)
    const id = JSON.parse(reply.body).record.id, original = await object(`/api/records/${id}/revisions/1`)
    notices[stage] = { text, approval: { id, seq: 1, contentHash: original.contentHash } }
  }
  const config = { version: 1, mode: 'rehearsal', developmentRepository: dev, stableCheckout: stable, database, targetCommit, targetTree, candidateTag: `stable-${localStamp(new Date()).slice(0, 10)}-synthetic`, recoveryRoot: recovery, serviceHome: home, serviceSettings, topology, listeners: [{ address: '127.0.0.1', port: servicePort, role: 'api' }, { address: '127.0.0.1', port: redirect, role: 'redirect' }], servicePort, releaseCheckPort, notices, noticeSendIds: { before: 'synthetic-first-before', after: 'synthetic-first-after' }, evidence, stopAuthority: null, health: { attempts: 120, intervalMs: 100, timeoutMs: 15000, stopTimeoutMs: 15000, commandTimeoutMs: 180000 } }
  write(join(folder, 'fixture-credentials.json'), { person, key, agentId, run: run.id })
  write(join(folder, 'fixture-identity.json'), { source, targetCommit, targetTree, database, keys, topology, syntheticReceipt: true })
  const cli = async (value: any, args: string[], name: string) => { const path = join(folder, `${name}.config.json`); write(path, value); return executable(dev, ['--import', 'tsx', 'tools/stable/bootstrap-stable.mjs', '--config', path, ...args], requestEnv, join(folder, `${name}.log`)) }
  return { folder, dev, stable, recovery, home, database, keys, agentId, config, runtime, object, officeRequest, requestEnv, calls, cli, serviceEnv }
}

async function originalEvidence(f: { folder: string; dev: string; targetCommit: string; targetTree: string; officeRequest: (request: ARequest) => Promise<any> }) {
  const attempt = join(f.folder, 'SYNTHETIC-NOT-A-CLOUD-RUN'); mkdirSync(attempt)
  const clone = join(attempt, 'clone'); git(attempt, 'clone', '--no-local', '--no-hardlinks', '--single-branch', '--depth=1', f.dev, clone); git(clone, 'checkout', '--detach', f.targetCommit)
  requireIndependentGitObjects(join(clone, '.git')); expect(existsSync(join(clone, '.git/objects/info/alternates'))).toBe(false)
  const paths = { log: join(attempt, 'suite.log'), report: join(attempt, 'report.json'), manifest: join(attempt, 'manifest.json'), reads: join(attempt, 'reads') }
  mkdirSync(paths.reads); write(join(paths.reads, 'SYNTHETIC.json'), { synthetic: true, says: 'No cloud or whole suite ran for this made-up evidence fixture.' })
  const name = 'tests/the-stable-upgrade-verifies-original-evidence.test.ts'
  write(paths.log, 'Synthetic receipt artifacts. No whole suite or cloud ran.\n'); write(paths.manifest, [{ file: join(clone, name) }])
  write(paths.report, { success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, numTotalTestSuites: 1, numPassedTestSuites: 1, numFailedTestSuites: 0, numPendingTestSuites: 0, testResults: [{ name: join(clone, name), status: 'passed', assertionResults: [{ fullName: 'Synthetic never-executed receipt assertion', status: 'passed' }] }] })
  const result = { code: 0, answer: { ran: true, code: 0, commit: f.targetCommit, phase: 'test', buildExitCode: 0, suiteExitCode: 0, wallSec: 1, workers: 1, files: 1, failed: [] }, output: join(attempt, 'door-output.log') }
  write(join(attempt, 'door-result.json'), result); write(result.output, `Synthetic method, not an executed suite.\n${JSON.stringify(result.answer)}\n`)
  const receipt = receiptFromArtifacts({ repository: f.dev, commit: f.targetCommit, tree: f.targetTree, clone, paths, result, startedAt: '2026-10-17 01:00:00', endedAt: '2026-10-17 01:00:01' })
  const reply = await f.officeRequest({ method: 'POST', path: '/api/records', body: { kind: 'whole_suite_receipt', title: 'Synthetic first-handoff fixture receipt; no cloud suite', data: receipt } }); expect(reply.status, reply.body).toBe(201)
  const recordId = JSON.parse(reply.body).record.id
  const original = await f.officeRequest({ method: 'GET', path: `/api/records/${recordId}/revisions/1` })
  return { recordId, seq: 1, contentHash: JSON.parse(original.body).contentHash }
}

export async function prepareAndAuthorize(f: Awaited<ReturnType<typeof actualBootstrapOffice>>) {
  const prepared = await f.cli(f.config, ['--prepare'], 'prepare')
  expect(prepared.code, readFileSync(join(f.folder, 'prepare.log'), 'utf8')).toBe(0); expect(prepared.result.state).toBe('PREPARED')
  expect(identity(f.config.topology.supervisor.pid)).toEqual(f.config.topology.supervisor)
  const event = await f.object(`/api/records/${prepared.result.prepared.event.id}/revisions/1`)
  expect(event.content.data.extra.stableBootstrapPrepared.stateSha256Base64).toBe(prepared.result.prepared.sha256Base64)
  // Wait for a later observed server second; no fixture backdating is used.
  while (localStamp(new Date()) <= event.at) await delay(50)
  const words = `Synthetic owner authorizes stopping serve-dev for first handoff ${f.config.candidateTag}.`
  // The record module prints a startup line on stdout, so the seed answers in its own file.
  const seed = join(f.folder, 'synthetic-owner-words.mjs'), answer = join(f.folder, 'synthetic-owner-words.json')
  write(seed, `import {writeFileSync} from 'node:fs';import {createRecord,HUMAN} from ${JSON.stringify(join(f.dev, 'src/server/lib/records.ts'))}; const r=createRecord({workspaceId:'default',kind:'message',title:'Synthetic owner stop words',data:{body:${JSON.stringify(words)},to:[{kind:'agent',id:'bootstrap-fixture-secretary'}]},actor:{...HUMAN,provedBy:'the-person-key'}});writeFileSync(${JSON.stringify(answer)},JSON.stringify({id:r.id,at:r.createdAt}),{flag:'wx',mode:0o600});(await import(${JSON.stringify(join(f.dev, 'src/server/db/client.ts'))})).sqlite.close();`)
  command(f.dev, process.execPath, ['--import', 'tsx', seed], f.serviceEnv)
  const owner = JSON.parse(readFileSync(answer, 'utf8'))
  const title = `Synthetic original owner stop decision ${f.config.candidateTag}`
  const scope = { version: 1, action: 'stop-serve-dev-for-first-handoff', candidateTag: f.config.candidateTag, tree: f.config.targetTree, from: { commit: f.config.targetCommit, repository: f.dev, database: f.database, port: f.config.servicePort }, to: { commit: f.config.targetCommit, repository: f.stable, database: f.database, port: f.config.servicePort } }
  const decision = await f.officeRequest({ method: 'POST', path: '/api/records', body: { kind: 'decision', title, data: { decided_by: THE_TEST_OFFICES_OWNER.id, authority: 'the owner said so', because: 'Explicit synthetic fixture stop words after original preparation.', ...governsTheWholeProject(), replaces: [], extra: { stableBootstrapStop: scope } }, warrant: { saidBy: THE_TEST_OFFICES_OWNER.id, words, where: `message:${owner.id}`, when: owner.at, for: [title] } } })
  expect(decision.status, decision.body).toBe(201)
  const id = JSON.parse(decision.body).record.id, original = await f.object(`/api/records/${id}/revisions/1`)
  return { ...f.config, prepared: prepared.result.prepared, stopAuthority: { kind: 'owner-decision', decision: { id, seq: 1, contentHash: original.contentHash } } }
}

/** A post-snapshot change names one labelled synthetic record whose title the fixture changes while every writer is stopped. */
export async function injected(f: Awaited<ReturnType<typeof actualBootstrapOffice>>, config: any, failAt: Array<{ step: string; phase: string }>, postSnapshot?: { recordId: string; title: string }) {
  const driver = join(f.folder, 'actual-transaction-driver.mjs'), input = join(f.folder, 'injected.config.json')
  write(input, config)
  const comparison = join(f.folder, 'image-content-comparison.json'), changed = join(f.folder, 'post-snapshot-change.json'), restored = join(f.folder, 'restored-image-comparison.json')
  const image = join(f.recovery, f.config.candidateTag, 'rollback.sqlite')
  // Compare every schema entry and row while all original writers are stopped.
  // Only digests and table names leave this private fixture process.
  const digest = `const digest=path=>{const db=new Database(path,{readonly:true,fileMustExist:true});try{db.defaultSafeIntegers();const schema=db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();const rows=schema.filter(r=>r.type==='table').map(r=>[r.name,db.prepare('SELECT * FROM "'+r.name.replaceAll('"','""')+'"').all().map(r=>JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v)).sort()]);return{hash:createHash('sha256').update(JSON.stringify([schema,rows],(_,v)=>typeof v==='bigint'?String(v):v)).digest('base64'),tables:rows.map(r=>r[0])}}finally{db.close()}};`
  const compareImage = `const source=digest(c.database),copy=digest(${JSON.stringify(image)});writeFileSync(${JSON.stringify(comparison)},JSON.stringify({equal:source.hash===copy.hash,source,copy}),{mode:0o600});if(source.hash!==copy.hash)throw Error('The full private SQLite contents differ');`
  // The change is made after the real checkpoint and before the injected fault,
  // so recovery must put the private image back over a database that differs.
  const changeTitle = `const db=new Database(c.database,{fileMustExist:true});let changes;try{changes=db.prepare('UPDATE records SET title=? WHERE id=?').run(change.title,change.recordId).changes}finally{db.close()}const source=digest(c.database),copy=digest(${JSON.stringify(image)});writeFileSync(${JSON.stringify(changed)},JSON.stringify({recordId:change.recordId,changes,differs:source.hash!==copy.hash,source,copy}),{mode:0o600});`
  const compareRestored = `const source=digest(c.database),copy=digest(${JSON.stringify(image)});writeFileSync(${JSON.stringify(restored)},JSON.stringify({equal:source.hash===copy.hash,source,copy}),{mode:0o600});`
  write(driver, `import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import Database from${JSON.stringify(join(f.dev, 'node_modules/better-sqlite3/lib/index.js'))};import{bootstrapStable}from${JSON.stringify(join(f.dev, 'tools/stable/stable-bootstrap-transaction.mjs'))};import{bootstrapOfficeRequest}from${JSON.stringify(join(f.dev, 'tools/stable/stable-bootstrap-transport.mjs'))};${digest}const c=JSON.parse(readFileSync(${JSON.stringify(input)},'utf8'));const faults=${JSON.stringify(failAt)};const change=${JSON.stringify(postSnapshot ?? null)};const result=await bootstrapStable(c,{phase:'handoff',officeRequest:bootstrapOfficeRequest(process.env,15000),onStep:row=>{if(row.step==='private-exact-rollback-image'&&row.phase==='after'){${compareImage}}if(change&&row.step==='checkpoint-real-database'&&row.phase==='after'){${changeTitle}}if(change&&row.step==='restore-private-exact-database'&&row.phase==='after'){${compareRestored}}const at=faults.findIndex(f=>f.step===row.step&&f.phase===row.phase);if(at>=0){faults.splice(at,1);throw Error('Synthetic injected '+row.step+' '+row.phase)}}});process.stdout.write(JSON.stringify(result));`)
  return executable(f.dev, ['--import', 'tsx', driver], f.requestEnv, join(f.folder, 'injected.log'))
}
export function rememberResult(result: any) {
  if (result?.service) for (const [role, row] of Object.entries(result.service) as Array<[string, any]>) if (row) retainGroup(row.pid, undefined, role === 'server' ? 1 : role === 'worker' ? 2 : 0)
  for (const row of result?.remainingGroups ?? []) { try { retainGroup(row.pid) } catch (error: any) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error } }
}
export function privateImage(f: Awaited<ReturnType<typeof actualBootstrapOffice>>, result: any) {
  const image = join(result.paths.work, 'rollback.sqlite'), sanitized = join(result.paths.work, 'sanitized.sqlite')
  expect(statSync(image).mode & 0o777).toBe(0o600)
  expect(createHash('sha256').update(readFileSync(image)).digest('hex')).toBe(result.snapshot.sha256)
  const full = new Database(image, { readonly: true }), publicCopy = new Database(sanitized, { readonly: true })
  try { expect((full.prepare('SELECT count(*) AS n FROM held_keys').get() as any).n).toBeGreaterThan(0); expect((publicCopy.prepare('SELECT count(*) AS n FROM held_keys').get() as any).n).toBe(0) } finally { full.close(); publicCopy.close() }
}

/** Snapshot declared roots completely; atime is omitted because reading changes it. */
function dryFiles(paths: string[]) {
  const rows: any[] = []
  const visit = (path: string) => {
    const s = lstatSync(path)
    const row: any = { path, dev: s.dev, ino: s.ino, mode: s.mode, uid: s.uid, gid: s.gid, nlink: s.nlink, size: s.size, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs }
    if (s.isSymbolicLink()) row.target = readlinkSync(path)
    else if (s.isDirectory()) row.names = readdirSync(path).sort()
    else if (s.isFile()) row.sha256Base64 = createHash('sha256').update(readFileSync(path)).digest('base64')
    else throw new Error('Unexpected special file in a dry fixture snapshot.')
    rows.push(row)
    if (s.isDirectory()) for (const name of row.names) visit(join(path, name))
  }
  for (const path of paths) visit(path)
  return rows
}
function dryDatabase(f: Awaited<ReturnType<typeof actualBootstrapOffice>>) {
  const db = new Database(f.database, { readonly: true, fileMustExist: true })
  try {
    db.defaultSafeIntegers()
    const serialize = (value: unknown) => JSON.stringify(value, (_, value) => typeof value === 'bigint' ? value.toString() : value)
    const schema = db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all() as Array<{ type: string; name: string }>
    const stable: any[] = [], bookkeeping: Record<string, any> = {}
    for (const { name } of schema.filter(row => row.type === 'table')) {
      const rows = db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all() as Record<string, any>[]
      if (name === 'api_calls' || name === 'hourly_calls') { bookkeeping[name] = rows.map(row => serialize(row)).sort(); continue }
      if (name === 'held_keys') for (const row of rows) if (row.whose_kind === 'agent' && row.whose_id === f.agentId) {
        bookkeeping[row.id] = row.last_used_at
        // Only the authenticated fixture caller's use stamp is an exception.
        row.last_used_at = '<the authenticated caller last-use stamp>'
      }
      stable.push([name, rows.map(row => serialize(row)).sort()])
    }
    return { stableSha256Base64: createHash('sha256').update(serialize([schema, stable])).digest('base64'), bookkeeping }
  } finally { db.close() }
}

export async function measureBootstrapDry(f: Awaited<ReturnType<typeof actualBootstrapOffice>>) {
  const config = join(f.folder, 'measured-dry.config.json'), trace = join(f.folder, 'measured-dry.trace.jsonl'), observer = join(f.folder, 'measured-dry-observer.mjs')
  write(config, f.config); write(trace, '')
  // Harness output is outside every measured root. This observes canonical
  // fetches and child commands, never headers, request bodies or environments.
  write(observer, `import{appendFileSync}from'node:fs';import cp from'node:child_process';import{syncBuiltinESMExports}from'node:module';const trace=${JSON.stringify(trace)};const save=r=>appendFileSync(trace,JSON.stringify(r)+'\\n');const fetch0=globalThis.fetch;globalThis.fetch=(url,init)=>{save({type:'request',method:init?.method??'GET',path:new URL(url).pathname});return fetch0(url,init)};for(const name of ['spawn','spawnSync','execFile','execFileSync']){const run=cp[name];cp[name]=function(program,args,...rest){save({type:'command',program,args:Array.isArray(args)?args:[]});return run.call(this,program,args,...rest)}}syncBuiltinESMExports();`)
  const listeners = () => f.config.listeners.map(row => command(f.folder, 'ss', ['-H', '-ltnp', `sport = :${row.port}`], env(f.home)))
  const metadata = () => { const s = statSync(f.database); return { dev: s.dev, ino: s.ino, mode: s.mode, uid: s.uid } }
  const before = { files: dryFiles([f.dev, f.home, f.recovery, f.keys]), topology: Object.values(f.config.topology).filter(Boolean).map(row => identity(row!.pid)), listeners: listeners(), database: dryDatabase(f), databaseIdentity: metadata() }
  // Use the documented plain-node CLI. Node/tsx cache locations inside this
  // private HOME/TMPDIR remain in the complete filesystem comparison.
  const dry = await executable(f.dev, ['--import', observer, 'tools/stable/bootstrap-stable.mjs', '--config', config, '--prepare', '--dry'], f.requestEnv, join(f.folder, 'measured-dry.log'))
  const after = { files: dryFiles([f.dev, f.home, f.recovery, f.keys]), topology: Object.values(f.config.topology).filter(Boolean).map(row => identity(row!.pid)), listeners: listeners(), database: dryDatabase(f), databaseIdentity: metadata() }
  const calls = readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  write(join(f.folder, 'measured-dry-proof.json'), { before, after, calls, limits: 'Compares bytes and recorded metadata in source (including index), home/temp/cache, recovery and key file; compares every SQLite row except caller last-use and API usage; observes canonical fetch and ordinary child-command APIs. Snapshot reads change atime. This is not a whole-machine syscall proof. Harness config, observer, trace, stdout and logs are outside measured roots.' })
  expect(dry.code, readFileSync(join(f.folder, 'measured-dry.log'), 'utf8')).toBe(0); expect(dry.result.state).toBe('dry')
  expect(dry.result.says).toContain('Bounded inspection commands (git, ss) may run.')
  expect(after.files).toEqual(before.files); expect(after.topology).toEqual(before.topology); expect(after.listeners).toEqual(before.listeners); expect(after.databaseIdentity).toEqual(before.databaseIdentity); expect(after.database.stableSha256Base64).toBe(before.database.stableSha256Base64)
  expect(calls.filter(row => row.type === 'request').every(row => row.method === 'GET' && row.path !== '/api/runtime' && row.path !== '/api/health')).toBe(true)
  expect(calls.filter(row => row.type === 'command').every(row => {
    if (row.program === 'ss') return true
    if (row.program !== 'git') return false
    const args = row.args.slice(row.args.indexOf('-C') + 2), command = args[0]
    if (['rev-parse', 'status', 'cat-file', 'ls-tree', 'ls-files', 'merge-base'].includes(command)) return true
    if (['tag', 'branch'].includes(command)) return args.includes('--list')
    // One name and no delete is the reading form; a second name or -d writes HEAD.
    if (command === 'symbolic-ref') return args.slice(1).filter((arg: string) => !arg.startsWith('-')).length === 1 && !args.includes('-d') && !args.includes('--delete')
    if (command === 'worktree') return args[1] === 'list'
    // A bare remote lists the names and get-url prints one; every other remote form, set-url among them, stays refused.
    if (command === 'remote') return args.length === 1 || args[1] === 'get-url'
    return command === 'config' && args.some((arg: string) => ['--get', '--get-all', '--get-regexp', '--name-only', '--list'].includes(arg))
  })).toBe(true)
  expect(existsSync(f.stable)).toBe(false)
  return dry
}

/** Drop only delivery observation after the real server accepted AFTER. */
export async function handoffWithLostAfter(f: Awaited<ReturnType<typeof actualBootstrapOffice>>, config: any) {
  const input = join(f.folder, 'lost-after.config.json'), observer = join(f.folder, 'lost-after-observer.mjs'), trace = join(f.folder, 'lost-after.trace.jsonl')
  write(input, config); write(trace, '')
  write(observer, `import{appendFileSync}from'node:fs';const trace=${JSON.stringify(trace)},sendId=${JSON.stringify(config.noticeSendIds.after)};const fetch0=globalThis.fetch;let committed=false;const save=r=>appendFileSync(trace,JSON.stringify(r)+'\\n');globalThis.fetch=async(url,init)=>{const u=new URL(url),method=init?.method??'GET';if(committed&&method==='GET'&&u.pathname==='/api/office/upgrades'&&u.searchParams.get('sendId')===sendId){save({method,path:u.pathname,stage:'after',sendId,dropped:'reconciliation'});throw Error('Synthetic lost AFTER reconciliation')}let after=false;if(method==='POST'&&u.pathname==='/api/office/upgrades/notice'){const request=JSON.parse(String(init?.body??'{}'));after=request.kind==='first-handoff'&&request.stage==='after'&&request.sendId===sendId}const response=await fetch0(url,init);if(after){save({method,path:u.pathname,stage:'after',sendId,status:response.status,dropped:'response'});if(response.status===200||response.status===201){committed=true;await response.body?.cancel();throw Error('Synthetic lost AFTER response after real commit')}}return response};`)
  return executable(f.dev, ['--import', observer, 'tools/stable/bootstrap-stable.mjs', '--config', input, '--prepared', config.prepared.path], f.requestEnv, join(f.folder, 'handoff.log'))
}

export async function retryBootstrapDelivery(f: Awaited<ReturnType<typeof actualBootstrapOffice>>, path: string) {
  return executable(f.dev, ['tools/stable/bootstrap-stable.mjs', '--retry-notice', path], f.requestEnv, join(f.folder, 'retry-delivery.log'))
}
