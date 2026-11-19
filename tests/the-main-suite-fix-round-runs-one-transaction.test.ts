// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real Git, original artifact bytes and Office transactions. Cloud and already-landed queue observations
 * are explicitly synthetic fixture inputs; no model, worker, merger or cloud suite is started. */
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, theOfficesKeyHeader, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { clockStamp } from '../src/shared/time.ts'
import { receiptFromArtifacts } from '../tools/periodic-main-suite.mjs'
import type { ARequest, AnAnswer } from '../tools/office-request.mjs'

const modulePath = '../tools/main-suite-fix-round.mjs'
const implementation = () => import(modulePath)
let db: TestDb, server: Awaited<ReturnType<typeof apiApp>>
let root: string, options: any, env: NodeJS.ProcessEnv, now: number, baseline: string, redCommit: string, cause: string, sheriffId: string, causalLine: string, causalAuthor: string
let calls: ARequest[], intercept: ((request: ARequest, answer: AnAnswer) => AnAnswer) | null, raceToTesting: boolean
let serial = 0
let serverFailure = ''
let beforeOffice: ((request: ARequest) => void) | null
let retainFixtureInputs: boolean
let builtRoot: string, builtRepository: string, builtBaseline: string, builtRed: string
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex')
function git(directory: string, ...args: string[]) {
  const ran = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', directory, ...args], { encoding: 'utf8', timeout: 15_000,
    env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })
  if (ran.status !== 0) throw new Error(ran.stderr)
  return ran.stdout.trim()
}
/** Program transport against the throwaway app only; raw hashes never leave the test process. */
async function officeRequest(request: ARequest): Promise<AnAnswer> {
  calls.push(request)
  beforeOffice?.(request)
  if (raceToTesting && request.path.endsWith('/withdraw')) {
    const entry = request.path.split('/')[3]!
    putState(entry, 'testing'); raceToTesting = false
  }
  if (request.path.startsWith('/api/worker/')) throw new Error('The runner may not use a worker door.')
  const response = await server.app.inject({ method: request.method as 'GET' | 'POST' | 'PATCH', url: request.path,
    headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': env.MOLE_OFFICE_AGENT!,
      'x-mole-office-session': env.MOLE_OFFICE_SESSION!, 'x-mole-office-key': env.MOLE_AGENT_KEY! },
    ...(request.body === undefined ? {} : { payload: request.body as never }) })
  const answer = { status: response.statusCode, location: null, cut: false, body: response.body, added: null }
  if (response.statusCode === 500) throw new Error(`Synthetic Office fixture failed internally: ${serverFailure}`)
  return intercept === null ? answer : intercept(request, answer)
}
async function ask(request: ARequest) {
  const reply = await officeRequest(request)
  expect(reply.status, reply.body).toBeLessThan(300)
  return JSON.parse(reply.body)
}
/** WHETHER THE OFFICE STORED THE MESSAGE A REPLY ANSWERS: a 201, or a 409 whose body holds a string record id and a
 * routed list. A message to an agent nothing holds, as the sheriff here, is stored, routed and answered 409. */
function theOfficeStoredTheMessage(answer: AnAnswer): boolean {
  if (answer.status === 201) return true
  if (answer.status !== 409) return false
  let body: any
  try { body = JSON.parse(answer.body) } catch { return false }
  return typeof body?.record?.id === 'string' && Array.isArray(body.routed)
}
const raw = (id: string, data: any) => db.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
const data = (id: string) => db.api.getRecord(id)!.data as any
const putState = (id: string, state: string) => raw(id, { ...data(id), state, toolWanted: undefined,
  occupies: ['integrating', 'reinspecting', 'testing', 'landing'].includes(state) ? options.repository : undefined })
const problems = () => db.api.listRecords({ workspaceId: 'default', kind: 'problem' }).filter((one: any) => one.data.mainSuiteFix?.repository === options.repository)
const tick = async (extra: any = {}, io: any = {}) => (await implementation()).mainSuiteFixRoundTick({ ...options, ...extra }, { officeRequest, clock: () => now, ...io })
async function mintFixtureController(handle: string, agent: string) {
  // Only this synthetic fixture's issuer uses its generated office key. Runner calls use the returned OWN key.
  const minted = await server.app.inject({ method: 'POST', url: '/api/records', headers: { ...theOfficesKeyHeader(), 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' },
    payload: { kind: 'session', title: 'Synthetic continuing controller program', data: { state: 'running', runtime: 'mole-office', servingAgent: handle, servingAgentId: agent, startedByMoleOffice: true } } })
  expect(minted.statusCode, minted.body).toBe(201)
  const issuance = minted.json(); expect(typeof issuance.runKey.key === 'string').toBe(true)
  return { run: issuance.record, key: issuance.runKey.key as string }
}
async function existingCausalAuthor(handle: string, role = 'worker') {
  const line = db.api.createRecord({ kind: 'agent', title: 'Synthetic pre-existing causal line', workspaceId: 'default', actor: person,
    data: { handle: `${handle}-line`, role: 'supervisor', runtime: 'codex', state: 'active', startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } } })
  const participants = await import('../src/server/lib/participants.ts'), id = participants.agentForRecord(line.id)!.id
  db.api.createRecord({ kind: 'agent', title: 'Synthetic pre-existing causal author', workspaceId: 'default', actor: person,
    data: { handle, role, runtime: 'codex', state: 'active', workArea: ['work'], startedBy: { kind: 'agent', id } } })
  return { id, key: (await import('../src/server/lib/keys.ts')).makeAnAgentKey(id, null) }
}
async function causalEntry(handle: string, from: string, to: string, role = 'worker') {
  const line = await existingCausalAuthor(handle, role), run = await sealed(handle, from)
  // The synthetic original line submits its own child; the runner never receives this fixture key.
  const reply = await server.app.inject({ method: 'POST', url: '/api/merge-queue', headers: {
    'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': line.id, 'x-mole-office-key': line.key,
  }, payload: { run, changeset: { adapter: 'git', repository: options.repositoryId } } })
  expect(reply.statusCode, reply.body).toBe(201)
  const entry = reply.json().entry.id; landed(entry, from, to)
  return { entry, line: line.id, author: data(run).servingAgentId as string }
}

type SyntheticOutcome = 'red' | 'green' | 'build-failed' | 'incomplete'
function syntheticDoorResult(outcome: SyntheticOutcome, commit: string, clone: string, paths: { log: string; report: string; manifest: string; reads: string }, output: string, files = ['tests/one.test.ts']) {
  const failed = outcome === 'red', buildFailed = outcome === 'build-failed', observed = outcome === 'incomplete' ? [] : files, count = observed.length
  writeFileSync(paths.log, 'Synthetic cloud output. No suite was executed.\n')
  if (!buildFailed) {
    writeFileSync(paths.manifest, JSON.stringify(files.map(file => ({ file: join(clone, file) }))))
    writeFileSync(paths.report, JSON.stringify({ success: !failed, numTotalTests: count, numPassedTests: failed ? 0 : count, numFailedTests: failed ? count : 0, numPendingTests: 0, numTodoTests: 0,
      numTotalTestSuites: count, numPassedTestSuites: failed ? 0 : count, numFailedTestSuites: failed ? count : 0, numPendingTestSuites: 0,
      testResults: observed.map(file => ({ name: join(clone, file), status: failed ? 'failed' : 'passed', assertionResults: [{ fullName: `Synthetic original assertion ${file}`, status: failed ? 'failed' : 'passed' }] })) }))
    mkdirSync(paths.reads); writeFileSync(join(paths.reads, 'synthetic.json'), 'Synthetic read bytes.\n')
  }
  const code = outcome === 'green' || outcome === 'incomplete' ? 0 : 1
  const answer = buildFailed ? { ran: true, code, commit, phase: 'build', buildExitCode: 1, wallSec: 1, workers: 1 }
    : { ran: true, code, commit, phase: 'test', buildExitCode: 0, suiteExitCode: code, wallSec: 1, workers: 1, files: count, failed: failed ? files : [] }
  const result = { code, answer, output }
  writeFileSync(result.output, JSON.stringify(result.answer) + '\n')
  return result
}
async function original(outcome: 'red' | 'green', commit = redCommit, endedAt = '2026-10-15 09:20:00', files = ['tests/one.test.ts']) {
  const attempt = join(root, `attempt-${++serial}`), clone = join(attempt, 'clone')
  mkdirSync(attempt); git(root, 'clone', '--no-local', '-q', options.repository, clone); git(clone, 'checkout', '-q', '--detach', commit)
  const paths = { log: join(attempt, 'suite.log'), report: join(attempt, 'report.json'), manifest: join(attempt, 'manifest.json'), reads: join(attempt, 'reads') }
  const result = syntheticDoorResult(outcome, commit, clone, paths, join(attempt, 'door-output.log'), files)
  writeFileSync(join(attempt, 'door-result.json'), JSON.stringify(result))
  const receipt = receiptFromArtifacts({ repository: options.repository, commit, tree: git(options.repository, 'rev-parse', `${commit}^{tree}`), clone, paths, result, startedAt: '2026-10-15 09:00:00', endedAt })
  const made = await ask({ method: 'POST', path: '/api/records', body: { kind: 'whole_suite_receipt', title: `Synthetic original ${outcome} ${serial}`, data: receipt } })
  const revision = await ask({ method: 'GET', path: `/api/records/${made.record.id}/revisions/1` })
  return { evidence: { recordId: made.record.id, seq: 1, contentHash: revision.contentHash }, paths }
}
async function sealed(handle: string, base: string, worktree = options.repository) {
  const participants = await import('../src/server/lib/participants.ts')
  const run = db.api.createRecord({ kind: 'session', title: 'Synthetic code author fixture', workspaceId: 'default', actor: person,
    data: { state: 'running', servingAgent: handle, servingAgentId: participants.agentByHandle(handle)!.id, runtime: 'mole-office', workingDirectory: worktree, cutFrom: base, submission: { kind: 'git' } } })
  db.api.patchRecord(run.id, { dataPatch: { state: 'finished' } }, person)
  const sealId = data(run.id).sealedTip, seal = data(sealId).seal
  writeAVerdictAsItsDoorWould(db, run.id, { released: { by: { kind: 'agent', id: 'fixture-inspector' }, at: '2026-10-15 09:21:00', how: 'an inspector', check: 'synthetic-check',
    read: { sealId, sealHash: seal.hash, worktree, tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic already-checked fixture; no model ran.' } } })
  return run.id
}
function landed(entry: string, from: string, to: string) {
  const current = data(entry)
  raw(entry, { ...current, state: 'merged', toolWanted: null, integrated: { entry, mainBefore: from, mainAfter: to, rebasedTip: to, sealId: current.seal.id, carriedVerdict: { run: current.run }, at: '2026-10-15 09:30:00' } })
}
// THE REPOSITORY IS BUILT ONCE, because its two commits are the same in every case; each case works in its own copy.
beforeAll(() => {
  root = builtRoot = mkdtempSync(join(tmpdir(), 'fix-round-repository-'))
  const repository = builtRepository = join(builtRoot, 'repo'); mkdirSync(join(repository, 'tests'), { recursive: true }); mkdirSync(join(repository, 'work'))
  git(repository, 'init', '-q', '-b', 'main'); git(repository, 'config', 'user.name', 'Synthetic author'); git(repository, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(repository, 'tests/one.test.ts'), '// Synthetic suite source; never run.\n'); git(repository, 'add', '.'); git(repository, 'commit', '-qm', 'Synthetic original green')
  builtBaseline = git(repository, 'rev-parse', 'HEAD'); git(repository, 'switch', '-qc', 'causal')
  writeFileSync(join(repository, 'work/change.txt'), 'Synthetic causal change.\n'); git(repository, 'add', '.'); git(repository, 'commit', '-qm', 'Synthetic causal commit')
  builtRed = git(repository, 'rev-parse', 'HEAD'); git(repository, 'branch', '-f', 'main', builtRed)
})
afterAll(() => rmSync(builtRoot, { recursive: true, force: true }))
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'fix-round-transaction-')); calls = []; intercept = null; beforeOffice = null; raceToTesting = false; retainFixtureInputs = false
  db = await freshDb()
  writeFileSync(join(dirname(db.file), 'keys.json'), JSON.stringify({ person: randomBytes(32).toString('hex'), office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  server = await apiApp()
  serverFailure = ''
  server.app.addHook('onError', async (_request, _reply, error) => { serverFailure = error.message })
  const handle = `fixture-controller-${++serial}`
  const record = db.api.createRecord({ kind: 'agent', title: 'Synthetic secretary controller', workspaceId: 'default', actor: person,
    data: { handle, role: 'secretary', runtime: 'codex', state: 'active', startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } } })
  const participants = await import('../src/server/lib/participants.ts')
  const agent = participants.agentForRecord(record.id)!.id
  const runKeysOnly = await import('../src/server/lib/run-keys-only.ts')
  runKeysOnly.markAsSigningOnlyWithRunKeys(agent)
  const { run, key } = await mintFixtureController(handle, agent)
  env = { MOLE_OFFICE_AGENT: handle, MOLE_OFFICE_SESSION: run.id, MOLE_OFFICE_WORKSPACE: 'default', MOLE_AGENT_KEY: key,
    MOLE_OFFICE_API: 'http://fixture-office.invalid', MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND: '1', MOLE_OFFICE_MESSAGE_WORKER: 'on' }
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value!)
  const sheriff = `fixture-sheriff-${serial}`
  db.api.createRecord({ kind: 'agent', title: 'Synthetic pre-existing repair sheriff', workspaceId: 'default', actor: person,
    data: { handle: sheriff, role: 'supervisor', runtime: 'codex', state: 'active', workArea: ['work'], startedBy: { kind: 'agent', id: agent } } })
  sheriffId = participants.agentByHandle(sheriff)!.id
  const sandbox = join(root, `fixture-sandbox-${serial}`); mkdirSync(sandbox)
  const container = `fixture-container-${serial}`
  db.client.sqlite.prepare("INSERT INTO session_resources (id,workspace_id,session_record_id,type,key,detail,registered_at,registered_by) VALUES (?,'default','fixture-session','container',?,?,'2026-10-15 09:00:00','agent:fixture')")
    .run(container, `mole-office-sandbox-fixture-sandbox-${serial}`, `Sandbox fixture-sandbox-${serial}, from the template mole-office-dev; ${theWordsNamingTheFolder(sandbox)} Started by node tools/sandbox.mjs up.`)
  const previous = db.api.createRecord({ kind: 'session', title: 'Synthetic prior sheriff run', workspaceId: 'default', actor: person,
    data: { state: 'running', servingAgent: sheriff, servingAgentId: sheriffId, runtime: 'codex', model: 'openai/gpt-6.1-sol', sandbox: { folder: sandbox, container, template: 'mole-office-dev' } } })
  raw(previous.id, { ...previous.data, state: 'finished' })
  const repository = join(sandbox, 'repo'); cpSync(builtRepository, repository, { recursive: true }); baseline = builtBaseline; redCommit = builtRed
  const template = join(root, 'template.md'); writeFileSync(template, '# Synthetic concentrated repair\nRead the original evidence and retain old/new/reason criteria before test changes.\n')
  db.api.patchRecord(run.id, { dataPatch: { sandbox: { folder: sandbox, container, template: 'mole-office-dev' }, workingDirectory: repository } }, person)
  const authorBrief = join(sandbox, 'author-brief.md')
  writeFileSync(authorBrief, 'Synthetic no-model author: prepare the verified revert, seal it and await the ordinary check.\n', { mode: 0o600 })
  options = { controllerSandbox: { folder: sandbox, container }, authorBrief: { path: authorBrief, sha256: digest(readFileSync(authorBrief, 'utf8')) }, env, repository, workdir: join(sandbox, 'controller'), repositoryId: `fixture-repository-${serial}`, commit: redCommit, tree: git(repository, 'rev-parse', 'HEAD^{tree}'), timeZone: 'UTC',
    identity: { agent: handle, run: run.id, workspace: 'default' }, coordinator: agent, sheriff: { agent: sheriff, previousRun: previous.id, sandbox },
    briefTemplate: { path: template, sha256: digest(readFileSync(template, 'utf8')) }, briefPath: join(sandbox, 'repair.md'),
    author: { handle: `fixture-takeout-${serial}`, name: 'Synthetic automatic take-out author', workArea: ['work'] }, authorIdentity: { name: 'Synthetic automatic author', email: 'fixture@example.invalid' } }
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: options.repositoryId, root: repository, actor: person })
  const causal = await causalEntry(`fixture-author-${serial}`, baseline, redCommit)
  cause = causal.entry; causalLine = causal.line; causalAuthor = causal.author
  git(repository, 'switch', '-q', 'main')
  await original('green', baseline, '2026-10-15 09:00:00')
  options.evidence = (await original('red')).evidence
  now = Date.parse('2026-10-15T09:30:00Z'); calls = []
})
afterEach(async () => {
  await server.app.close(); db.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals()
  // This one correlation proof retains its exact original Git/artifact paths and public ledger inputs.
  if (!retainFixtureInputs) rmSync(root, { recursive: true, force: true })
})

it('returns dormant before Office dispatch or local mutation when the single central setting is off', async () => {
  expect(await tick({ env: {} })).toMatchObject({ status: 'dormant' })
  expect(calls).toEqual([]); expect(existsSync(options.workdir)).toBe(false)
  const cli = spawnSync(process.execPath, ['--import', 'tsx', resolve('tools/main-suite-fix-round.mjs')], { encoding: 'utf8', timeout: 15_000, env: { PATH: process.env.PATH, HOME: root } })
  expect(cli.status, cli.stderr).toBe(0); expect(JSON.parse(cli.stdout.trim())).toMatchObject({ status: 'dormant' })
})
it('refuses a configuration without its coordinator before any journal, lock or Office write, and names the field', async () => {
  // No other field names the notice recipient: a configuration that leaves coordinator out is refused, not read another way.
  await expect(tick({ coordinator: undefined })).rejects.toThrow(/\bcoordinator\b/)
  expect(calls.filter(one => one.method !== 'GET')).toEqual([])
  expect(existsSync(join(options.workdir, 'controller.lock'))).toBe(false)
  expect(existsSync(join(options.workdir, `receipt-${options.evidence.recordId}.json`))).toBe(false)
})
it('compares raw program digests internally with its own key and never follows a redirect or exposes a digest in an error', async () => {
  const { fixRoundProgramRequest } = await implementation()
  const expected = digest('Synthetic internal brief bytes')
  raw(options.identity.run, { ...data(options.identity.run), extra: { ...data(options.identity.run).extra, knownDigest: expected } })
  const fetchImpl = async (url: any, init: any) => {
    expect(init.redirect === 'manual').toBe(true)
    const at = new URL(String(url))
    const reply = await server.app.inject({ method: init.method, url: at.pathname + at.search, headers: init.headers, ...(init.body === undefined ? {} : { payload: init.body }) })
    return new Response(reply.body, { status: reply.statusCode })
  }
  const response = await fixRoundProgramRequest({ method: 'GET', path: `/api/records/${options.identity.run}` }, { env, fetchImpl })
  expect(JSON.parse(response.body).record.data.extra.knownDigest === expected).toBe(true)
  const redirect = await fixRoundProgramRequest({ method: 'GET', path: '/api/restore' }, { env, fetchImpl: async (_url: any, init: any) => {
    expect(init.redirect === 'manual').toBe(true)
    return new Response('', { status: 302, headers: { location: 'https://example.invalid/elsewhere' } })
  } })
  expect(redirect.status).toBe(302)
  let message = ''
  try { await fixRoundProgramRequest({ method: 'GET', path: '/api/restore' }, { env, fetchImpl: async () => { throw new Error(expected) } }) } catch (error) { message = String(error) }
  expect(message.includes(expected)).toBe(false); expect(message.includes('not shown')).toBe(true)
})
it('persists one original problem and one dispatch plan while distinguishing an accepted ask from an actual run', async () => {
  expect(await tick()).toMatchObject({ status: 'dispatch-waiting' })
  const problem = problems()[0]!, ns = problem.data.mainSuiteFix as any
  expect(problems()).toHaveLength(1); expect(ns.fixRound.run).toBeNull()
  expect(ns.cause).toEqual([{ entry: cause, commits: [redCommit], how: 'only-change' }])
  expect(ns.dispatch.state).toBe('asked'); expect(readFileSync(options.briefPath, 'utf8')).toContain(problem.id)
  expect(await tick()).toMatchObject({ status: 'dispatch-waiting', problem: problem.id })
  expect(calls.filter(one => one.method === 'POST' && one.path.endsWith('/next-round'))).toHaveLength(1)
})
it('reconciles a lost next-round response and refuses changed wanted correlation instead of replacing its brief', async () => {
  intercept = (request, answer) => { if ((request.body as any)?.kind === 'problem' && answer.status === 201) throw new Error('Synthetic lost problem response'); return answer }
  await expect(tick()).rejects.toThrow('lost problem response'); intercept = null
  beforeOffice = request => { if ((request.body as any)?.dataPatch?.mainSuiteFix?.dispatch?.state === 'planned') throw new Error('Synthetic interruption after final brief write') }
  await expect(tick()).rejects.toThrow('interruption after final brief write'); beforeOffice = null
  expect(existsSync(options.briefPath)).toBe(true)
  let dropped = false
  intercept = (request, answer) => { if (!dropped && request.path.endsWith('/next-round') && answer.status === 202) { dropped = true; throw new Error('Synthetic lost dispatch response') } return answer }
  await expect(tick()).rejects.toThrow('lost dispatch response')
  intercept = null
  expect(await tick()).toMatchObject({ status: 'dispatch-waiting' })
  expect(calls.filter(one => one.method === 'POST' && one.path.endsWith('/next-round'))).toHaveLength(1)
  expect(problems()).toHaveLength(1)
  const problem = problems()[0]!.id, held = await ask({ method: 'GET', path: `/api/records/${problem}` })
  const notices = structuredClone(held.record.data.mainSuiteFix.notices)
  const filed = await officeRequest({ method: 'POST', path: '/api/records', body: { kind: 'message', title: 'Synthetic unrelated message', data: {
    to: [{ kind: 'agent', id: options.coordinator }], sendId: `unrelated-${problem}`, body: 'Synthetic unrelated words, not an accepted phase notice.' } } })
  expect(theOfficeStoredTheMessage(filed), filed.body).toBe(true)
  const unrelated = JSON.parse(filed.body)
  await ask({ method: 'PATCH', path: `/api/records/${problem}`, body: { ifVersion: held.version, dataPatch: { mainSuiteFix: {
    notices: notices.map((one: any) => one.phase === 'start' ? { ...one, message: unrelated.record.id } : one),
  } } } })
  await expect(tick()).rejects.toThrow('original phase message')
  const changed = await ask({ method: 'GET', path: `/api/records/${problem}` })
  await ask({ method: 'PATCH', path: `/api/records/${problem}`, body: { ifVersion: changed.version, dataPatch: { mainSuiteFix: { notices } } } })
  const prior = data(options.sheriff.previousRun); prior.nextRound.brief.sha256 = '0'.repeat(64); raw(options.sheriff.previousRun, prior)
  await expect(tick()).rejects.toThrow('correlation')
  expect(calls.filter(one => one.method === 'POST' && one.path.endsWith('/next-round'))).toHaveLength(1)
})
it('records unknown causes or ambiguous original time and never automatically prepares a take-out', async () => {
  const current = data(cause); raw(cause, { ...current, integrated: { ...current.integrated, mainBefore: redCommit } })
  expect(await tick()).toMatchObject({ status: 'dispatch-waiting' })
  now += 7200_000
  expect(await tick()).toMatchObject({ status: 'supervised', says: expect.stringContaining('cause') })
  expect((problems()[0]!.data.mainSuiteFix as any).outcome).toBeUndefined()
  expect(calls.some(one => (one.body as any)?.takesOut)).toBe(false)
})
it('refuses a phase message filed by another real run of the same secretary despite identical retained words and recipients', async () => {
  beforeOffice = request => {
    if ((request.body as any)?.data?.sendId?.endsWith('-start-notice')) throw new Error('Synthetic interruption before start message transport')
  }
  await expect(tick()).rejects.toThrow('before start message transport'); beforeOffice = null
  const sendId = `fixround-${options.evidence.recordId}-start-notice`
  const journal = JSON.parse(readFileSync(join(options.workdir, `receipt-${options.evidence.recordId}.json`), 'utf8'))
  const plan = journal.actions.notices[sendId], foreign = await mintFixtureController(options.identity.agent, options.coordinator)
  const response = await server.app.inject({ method: 'POST', url: '/api/records', headers: {
    'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': options.identity.agent,
    'x-mole-office-session': foreign.run.id, 'x-mole-office-key': foreign.key,
  }, payload: { kind: 'message', title: 'Synthetic foreign-run phase copy', data: {
    sendId, aboutRun: options.identity.run, to: plan.to.map((id: string) => ({ kind: 'agent', id })), body: plan.body,
  } } })
  // Nothing holds the sheriff in this test office, so the office stores the message, routes it and answers 409.
  // The message is stored all the same.
  expect(response.statusCode, response.body).toBe(409)
  const original = await ask({ method: 'GET', path: `/api/records/${response.json().record.id}/revisions/1` })
  expect(original.who.sessionId).toBe(foreign.run.id)
  await expect(tick()).rejects.toThrow('original phase message')
  expect(calls.some(one => one.path.endsWith('/next-round'))).toBe(false)
  expect(problems()).toHaveLength(1)
})
it('refuses a cached valid problem that differs from the configured verified original receipt or source before any Office mutation', async () => {
  expect(await tick()).toMatchObject({ status: 'dispatch-waiting' })
  const problem = problems()[0]!.id, first = options.evidence
  const retained = JSON.parse(readFileSync(join(options.workdir, `receipt-${first.recordId}.json`), 'utf8'))
  const originalProblem = await ask({ method: 'GET', path: `/api/records/${problem}/revisions/1` })
  expect(originalProblem.content.data.mainSuiteFix.receipt).toEqual(first)
  git(options.repository, 'commit', '--allow-empty', '-qm', 'Synthetic second valid red for cached-correlation proof')
  const commit = git(options.repository, 'rev-parse', 'HEAD'), tree = git(options.repository, 'rev-parse', 'HEAD^{tree}')
  const second = (await original('red', commit)).evidence
  const { verifyOriginalReceiptEvidence } = await import('../tools/stable/stable-upgrade-evidence.mjs')
  expect(await verifyOriginalReceiptEvidence({ repository: options.repository, commit, evidence: second }, { officeRequest })).toMatchObject({ complete: true, outcome: 'red' })
  expect(problems()).toHaveLength(1)
  const workdir = join(root, 'corrupt-cached-controller'); mkdirSync(workdir)
  const extra = { evidence: second, commit, tree, workdir }
  const cachedJournal = { version: 1, problem, actions: {},
    correlation: { ...retained.correlation, evidence: second, commit, tree },
  }
  writeFileSync(join(workdir, `receipt-${second.recordId}.json`), JSON.stringify(cachedJournal))
  const receipts = await Promise.all([first, second].map(pin => ask({ method: 'GET', path: `/api/records/${pin.recordId}/revisions/1` })))
  writeFileSync(join(root, 'cached-correlation-inputs.json'), JSON.stringify({ synthetic: true, fullName: expect.getState().currentTestName,
    retainedRoot: root, repository: options.repository, originalProblem, receipts, cachedJournal,
    originalInput: { evidence: first, commit: options.commit, tree: options.tree, timeZone: options.timeZone },
    configuredInput: { evidence: second, commit, tree, timeZone: options.timeZone },
  }, null, 2))
  retainFixtureInputs = true
  calls = []
  let failure: unknown
  try { await tick(extra) } catch (error) { failure = error }
  expect(calls.filter(one => one.method !== 'GET')).toEqual([])
  expect(String(failure)).toContain('cached problem differs from the configured verified original receipt or source')
  expect(problems()).toHaveLength(1)
  expect(data(problem).mainSuiteFix.receipt).toEqual(first)
  expect(data(problem).mainSuiteFix.claim.run).toBe(options.identity.run)
})
it('keeps ambiguous original receipt time unknown and tells the sheriff without an automatic take-out', async () => {
  options.timeZone = 'America/New_York'
  options.evidence = (await original('red', redCommit, '2026-11-01 01:30:00')).evidence
  now = Date.parse('2026-11-01T12:00:00Z'); calls = []
  expect(await tick()).toMatchObject({ status: 'supervised', says: expect.stringContaining('ambiguous') })
  const ns = problems()[0]!.data.mainSuiteFix as any
  expect(ns.deadlineMs).toBeNull(); expect(ns.fixRound.deadline).toBeNull(); expect(ns.takeout).toBeUndefined()
  expect(calls.some(one => (one.body as any)?.takesOut)).toBe(false)
  expect(calls.filter(one => (one.body as any)?.data?.sendId?.includes('-start-'))).toHaveLength(1)
})
it('keeps interruption pending and refuses a different controller run rather than stealing the durable claim', async () => {
  await tick()
  const aborted = new AbortController(); aborted.abort()
  expect(await tick({ signal: aborted.signal })).toMatchObject({ status: 'interrupted' })
  intercept = (request, answer) => { if ((request.body as any)?.dataPatch?.mainSuiteFix?.claim) throw new Error('Synthetic guarded claim response lost'); return answer }
  await expect(tick()).rejects.toThrow('guarded claim response lost'); intercept = null
  const journal = JSON.parse(readFileSync(join(options.workdir, `receipt-${options.evidence.recordId}.json`), 'utf8'))
  expect(journal.lastFailure.at).toBe(clockStamp(() => new Date(now)).stamp)
  const before = calls.length
  await expect(tick({ identity: { ...options.identity, run: 'another-controller' } })).rejects.toThrow()
  expect(calls.slice(before).every(one => one.method === 'GET')).toBe(true)
  expect(problems()).toHaveLength(1)
})

async function startedRepair() {
  await tick()
  const clone = join(root, 'repair-author-clone')
  git(root, 'clone', '--no-local', '-q', options.repository, clone); git(clone, 'switch', '-qc', 'repair')
  git(clone, 'config', 'user.name', 'Synthetic repair'); git(clone, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(clone, 'work/repair.txt'), 'Synthetic repair; no suite executed.\n')
  git(clone, 'add', '.'); git(clone, 'commit', '-qm', 'Synthetic repair')
  const commit = git(clone, 'rev-parse', 'HEAD')
  const run = await sealed(options.sheriff.agent, redCommit, clone)
  expect(await ask({ method: 'GET', path: `/api/checks/${run}` })).toMatchObject({ run })
  git(options.repository, 'fetch', clone, 'repair:refs/heads/repair')
  const prior = data(options.sheriff.previousRun)
  raw(options.sheriff.previousRun, { ...prior, nextRound: { ...prior.nextRound, state: 'started', started: { run, at: '2026-10-15 09:31:00' } } })
  expect(await tick()).toMatchObject({ status: 'repair-waiting' })
  const ns = problems()[0]!.data.mainSuiteFix as any
  expect(ns.fixRound.run).toBe(run); expect(ns.repair.entry).toBeTruthy()
  return { run, entry: ns.repair.entry as string, commit }
}
function releaseTakeout() {
  const ns = problems()[0]!.data.mainSuiteFix as any, run = ns.takeout.run
  const sealId = data(run).sealedTip, seal = data(sealId).seal
  writeAVerdictAsItsDoorWould(db, run, { released: { by: { kind: 'agent', id: 'fixture-inspector' }, at: '2026-10-15 09:40:00', how: 'an inspector', check: 'synthetic-check',
    read: { sealId, sealHash: seal.hash, worktree: ns.takeout.clone, tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic released fixture; actual release door is covered by the author criterion.' } } })
}
it('withdraws every pre-test repair at its original deadline and preserves actual testing or landing after an atomic race', async () => {
  const repair = await startedRepair()
  const deadline = (problems()[0]!.data.mainSuiteFix as any).deadlineMs
  now = deadline
  for (const state of ['testing', 'landing']) {
    putState(repair.entry, state)
    expect(await tick()).toMatchObject({ status: 'repair-testing' })
  }
  for (const state of ['submitted', 'pinned', 'judged', 'integrating', 'reinspecting']) {
    putState(repair.entry, state)
    expect(await tick()).toMatchObject({ status: 'takeout-pending-check' })
    expect(data(repair.entry).state).toBe('withdrawn')
  }
  putState(repair.entry, 'submitted'); raceToTesting = true
  expect(await tick()).toMatchObject({ status: 'repair-testing' })
  expect(data(repair.entry).state).toBe('testing')
  expect((problems()[0]!.data.mainSuiteFix as any).deadlineMs).toBe(deadline)
  expect(calls.some(one => (one.body as any)?.takesOut)).toBe(false)
})
it('records fixed only for an actually landed repair and a later original exact-main green receipt', async () => {
  const repair = await startedRepair()
  raw(repair.entry, { ...data(repair.entry), state: 'testing', tested: { green: true } })
  expect(await tick()).toMatchObject({ status: 'repair-waiting' })
  expect((problems()[0]!.data.mainSuiteFix as any).outcome).toBeUndefined()
  git(options.repository, 'merge', '--ff-only', 'repair'); landed(repair.entry, redCommit, repair.commit)
  const green = await original('green', repair.commit, '2026-10-15 09:45:00')
  expect(await tick()).toMatchObject({ status: 'fixed' })
  const ns = problems()[0]!.data.mainSuiteFix as any
  expect(ns.outcome).toEqual({ fixed: repair.commit }); expect(ns.fixedReceipt).toEqual(green.evidence)
  expect(ns.verification).toMatchObject({ state: 'complete', outcome: 'green', receipt: green.evidence })
  const messages = calls.filter(one => (one.body as any)?.data?.sendId?.includes('-outcome-')).length
  expect(messages).toBe(1)
  expect(await tick()).toMatchObject({ status: 'fixed' })
  expect(calls.filter(one => (one.body as any)?.data?.sendId?.includes('-outcome-'))).toHaveLength(messages)
})
it('reconciles one ordinary checked take-out submission and reports returned only after actual landing and causal-line notices', async () => {
  const firstCommit = redCommit
  writeFileSync(join(options.repository, 'work/second.txt'), 'Synthetic second actual causal change.\n')
  writeFileSync(join(options.repository, 'tests/two.test.ts'), '// Synthetic second source, never run.\n')
  git(options.repository, 'add', '.'); git(options.repository, 'commit', '-qm', 'Synthetic second actual landed entry')
  redCommit = git(options.repository, 'rev-parse', 'HEAD')
  const second = await causalEntry(`fixture-second-author-${serial}`, firstCommit, redCommit, 'supervisor')
  options.commit = redCommit; options.tree = git(options.repository, 'rev-parse', 'HEAD^{tree}'); options.author.workArea = ['work', 'tests']
  const files = ['tests/one.test.ts', 'tests/two.test.ts']
  options.evidence = (await original('red', redCommit, '2026-10-15 09:20:00', files)).evidence
  const driver = data(cause)
  raw(cause, { ...driver, tested: { ...driver.tested, busCause: {
    mainAt: baseline, suite: { commit: redCommit, tree: options.tree },
    order: [{ entry: cause, commit: firstCommit, tree: git(options.repository, 'rev-parse', `${firstCommit}^{tree}`), commits: [firstCommit] },
      { entry: second.entry, commit: redCommit, tree: options.tree, commits: [redCommit] }],
    pairDecided: { still: files, brokeBy: { [files[0]!]: 0, [files[1]!]: 1 } },
  } } })
  await tick(); releaseTakeout(); now += 7200_000
  const submissionPlans: any[] = []
  beforeOffice = request => {
    if (request.path === '/api/merge-queue' && (request.body as any)?.takesOut) submissionPlans.push(JSON.parse(readFileSync(join(options.workdir, `receipt-${options.evidence.recordId}.json`), 'utf8')).actions.takeout)
  }
  let dropped = false
  intercept = (request, answer) => {
    if (!dropped && request.path === '/api/merge-queue' && (request.body as any)?.takesOut && answer.status === 201) { dropped = true; throw new Error('Synthetic lost take-out response') }
    return answer
  }
  await expect(tick()).rejects.toThrow('lost take-out response'); intercept = null
  expect(await tick()).toMatchObject({ status: 'takeout-waiting' })
  beforeOffice = null
  const ns = problems()[0]!.data.mainSuiteFix as any, entry = ns.takeout.entry
  expect(ns.cause).toEqual([{ entry: cause, commits: [firstCommit], how: 'bisect' }, { entry: second.entry, commits: [redCommit], how: 'bisect' }])
  expect(data(entry).takesOut).toEqual([cause, second.entry]); expect(data(entry).submittedBy.id).toBe(ns.claim.agent)
  const expectedTitle = `Take out merge entries ${cause}, ${second.entry}: the whole suite stayed red past the fix round's hour (receipt ${options.evidence.recordId})`
  const submitted = calls.find(one => one.path === '/api/merge-queue' && (one.body as any)?.takesOut)!
  const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': env.MOLE_OFFICE_AGENT!, 'x-mole-office-session': env.MOLE_OFFICE_SESSION!, 'x-mole-office-key': env.MOLE_AGENT_KEY! }
  const generic = await server.app.inject({ method: 'PATCH', url: `/api/records/${entry}`, headers, payload: { title: expectedTitle } })
  const queue = await server.app.inject({ method: 'POST', url: '/api/merge-queue', headers, payload: { ...(submitted.body as any), title: expectedTitle } })
  writeFileSync(join(root, 'title-interface-proof.json'), JSON.stringify({ synthetic: true, entry, receipt: options.evidence, expectedTitle,
    generic: { status: generic.statusCode, body: generic.body }, queue: { status: queue.statusCode, body: queue.body }, submissionPlans, observedTitle: db.api.getRecord(entry)!.title }, null, 2))
  retainFixtureInputs = true
  expect(generic.statusCode).toBe(403); expect(generic.body).toContain('Only the merge queue')
  expect(queue.statusCode).toBe(400)
  expect(db.api.getRecord(entry)!.title).toBe(expectedTitle)
  expect(submitted.body).not.toHaveProperty('title')
  expect((submitted.body as any).fixRound.reason).toBe('hour expired')
  expect(submissionPlans).toEqual([expect.objectContaining({ state: 'planned', reason: 'hour expired' })])
  expect(submissionPlans[0].submission).toEqual(submitted.body)
  // A synthetic concurrent stored title edit has no permitted generic write door; the retry must still leave it alone.
  db.client.sqlite.prepare('UPDATE records SET title = ? WHERE id = ?').run('Synthetic later authored title edit', entry)
  expect(await tick()).toMatchObject({ status: 'takeout-waiting' })
  expect(db.api.getRecord(entry)!.title).toBe('Synthetic later authored title edit')
  expect(calls.some(one => one.method === 'PATCH' && one.path === `/api/records/${entry}`)).toBe(false)
  raw(entry, { ...data(entry), state: 'bounced' })
  expect(await tick()).toMatchObject({ status: 'takeout-failed' })
  expect((problems()[0]!.data.mainSuiteFix as any).outcome).toBeUndefined()
  git(options.repository, 'fetch', ns.takeout.clone, ns.takeout.commit); git(options.repository, 'merge', '--ff-only', 'FETCH_HEAD')
  landed(entry, redCommit, ns.takeout.commit)
  const originalAuthorRun = data(cause).run, authorFacts = data(originalAuthorRun)
  raw(originalAuthorRun, { ...authorFacts, servingAgentId: undefined })
  expect(await tick()).toMatchObject({ status: 'supervised' })
  expect((problems()[0]!.data.mainSuiteFix as any).pending.phase).toBe('entry-notice-source')
  expect((problems()[0]!.data.mainSuiteFix as any).outcome).toBeUndefined()
  expect(calls.filter(one => (one.body as any)?.data?.sendId?.includes('-outcome-'))).toHaveLength(0)
  raw(originalAuthorRun, authorFacts)
  let noticeDropped = false
  intercept = (request, answer) => {
    if (!noticeDropped && (request.body as any)?.data?.sendId?.includes('-outcome-') && theOfficeStoredTheMessage(answer)) { noticeDropped = true; throw new Error('Synthetic landed-outcome response lost') }
    return answer
  }
  await expect(tick()).rejects.toThrow('landed-outcome response lost'); intercept = null
  expect((problems()[0]!.data.mainSuiteFix as any).outcome).toBeUndefined()
  expect(await tick()).toMatchObject({ status: 'returned' })
  expect((problems()[0]!.data.mainSuiteFix as any).outcome).toEqual({ returned: entry })
  expect(calls.filter(one => one.path === '/api/merge-queue' && (one.body as any)?.takesOut)).toHaveLength(1)
  const outcome = calls.filter(one => (one.body as any)?.data?.sendId?.includes('-outcome-'))
  expect(outcome).toHaveLength(1); expect((outcome[0]!.body as any).data.body).toContain(cause)
  expect((outcome[0]!.body as any).data.body).toContain(second.entry)
  const recipients = [options.coordinator, sheriffId, causalAuthor, causalLine, second.author, second.line]
  expect(new Set(recipients).size).toBe(6)
  expect((outcome[0]!.body as any).data.to).toEqual(expect.arrayContaining(recipients.map(id => ({ kind: 'agent', id }))))
})
it('computes take-out titles from validated closed reasons and preserves ordinary titles, original accepted fields and later edits', async () => {
  const ordinary = db.api.getRecord(cause)!, change = data(cause).changeset
  const ordinaryTitle = `Merge ${change.branch ?? 'a branch'} at ${change.commit.slice(0, 12)} into ${change.root}`
  expect(ordinary.title).toBe(ordinaryTitle)
  await tick(); releaseTakeout(); now += 7200_000
  let captured: any
  beforeOffice = request => { if (request.path === '/api/merge-queue' && (request.body as any)?.takesOut) { captured = request.body; throw new Error('Synthetic pre-submission inspection') } }
  await expect(tick()).rejects.toThrow('pre-submission inspection'); beforeOffice = null
  expect(captured).toBeDefined()
  const ns = problems()[0]!.data.mainSuiteFix as any, problem = problems()[0]!.id
  const good = { ...captured, fixRound: { ...captured.fixRound, reason: 'hour expired' } }
  const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': env.MOLE_OFFICE_AGENT!, 'x-mole-office-session': env.MOLE_OFFICE_SESSION!, 'x-mole-office-key': env.MOLE_AGENT_KEY! }
  const observations: any[] = []
  retainFixtureInputs = true
  const post = async (body: any) => {
    const answer = await server.app.inject({ method: 'POST', url: '/api/merge-queue', headers, payload: body })
    observations.push({ body, status: answer.statusCode, answer: answer.json() })
    writeFileSync(join(root, 'computed-title-api-proof.json'), JSON.stringify({ synthetic: true, captured, observations }, null, 2))
    return answer
  }
  const original = JSON.stringify(data(problem)), entries = db.api.listRecords({ workspaceId: 'default', kind: 'merge_entry' }).map(one => one.id)
  const rejected = async (body: any, status: number) => {
    const answer = await post(body); expect(answer.statusCode, answer.body).toBe(status)
    expect(JSON.stringify(data(problem))).toBe(original)
    expect(db.api.listRecords({ workspaceId: 'default', kind: 'merge_entry' }).map(one => one.id)).toEqual(entries)
  }
  let serverNow = now
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => serverNow)
  try {
    await rejected({ ...good, fixRound: { ...good.fixRound, reason: 'an unchecked caller story' } }, 400)
    await rejected({ ...good, title: 'Synthetic arbitrary authored title' }, 400)
    await rejected({ run: good.run, changeset: good.changeset, title: 'Synthetic ordinary authored title' }, 400)
    await rejected({ run: good.run, changeset: good.changeset, reason: 'hour expired' }, 400)
    await rejected({ ...good, takesOut: undefined, fixRound: { ...good.fixRound, kind: 'repair' } }, 400)
    await rejected({ ...good, fixRound: { problem, kind: 'takeout' } }, 400)
    await rejected({ ...good, fixRound: { ...good.fixRound, reason: 'repair not green' } }, 409)
    await rejected({ ...good, fixRound: { ...good.fixRound, reason: 'verification unavailable' } }, 409)
    serverNow = ns.deadlineMs - 1; await rejected(good, 409)
    serverNow = ns.deadlineMs
    const accepted = await post(good); expect(accepted.statusCode, accepted.body).toBe(201)
    const entry = accepted.json().entry.id
    expect(db.api.getRecord(entry)!.title).toBe(`Take out merge entry ${cause}: the whole suite stayed red past the fix round's hour (receipt ${options.evidence.recordId})`)
    expect(data(entry).fixRound).toEqual({ problem, kind: 'takeout', reason: 'hour expired' })
    expect(captured).not.toHaveProperty('title'); expect(captured.fixRound.reason).toBe('hour expired')
    const journalPath = join(options.workdir, `receipt-${options.evidence.recordId}.json`), saved = readFileSync(journalPath)
    const mismatched = JSON.parse(saved.toString()); mismatched.actions.takeout.reason = 'repair not green'
    if (mismatched.actions.takeout.submission?.fixRound) mismatched.actions.takeout.submission.fixRound.reason = 'repair not green'
    writeFileSync(journalPath, JSON.stringify(mismatched))
    await expect(tick()).rejects.toThrow('original accepted take-out differs from its retained reason')
    writeFileSync(journalPath, saved)
    expect(await tick()).toMatchObject({ status: 'takeout-waiting' })
    db.client.sqlite.prepare('UPDATE records SET title = ? WHERE id = ?').run('Synthetic later stored title edit', entry)
    expect(await tick()).toMatchObject({ status: 'takeout-waiting' })
    expect(db.api.getRecord(entry)!.title).toBe('Synthetic later stored title edit')
    expect(db.api.getRecord(cause)!.title).toBe(ordinaryTitle)
    expect(calls.filter(one => one.path === '/api/merge-queue' && (one.body as any)?.takesOut)).toHaveLength(1)
    expect(calls.some(one => one.method === 'PATCH' && one.path === `/api/records/${entry}`)).toBe(false)
  } finally { clock.mockRestore() }
})
it('treats unavailable original verification as a one-shot failure and never infers fixed from landed queue green', async () => {
  const repair = await startedRepair()
  git(options.repository, 'merge', '--ff-only', 'repair'); landed(repair.entry, redCommit, repair.commit)
  expect(await tick()).toMatchObject({ status: 'takeout-pending-check' })
  const ns = problems()[0]!.data.mainSuiteFix as any
  expect(ns.verification.state).toBe('unavailable'); expect(ns.outcome).toBeUndefined()
  expect(await tick()).toMatchObject({ status: 'takeout-pending-check' })
  expect((problems()[0]!.data.mainSuiteFix as any).verification.attempt).toBe(ns.verification.attempt)
  releaseTakeout()
  expect(await tick()).toMatchObject({ status: 'takeout-waiting' })
  expect(data(repair.entry).state).toBe('merged')
  expect(now).toBeLessThan(ns.deadlineMs)
  expect(db.api.getRecord(data(problems()[0]!.id).mainSuiteFix.takeout.entry)!.title).toBe(`Take out merge entry ${cause}: original repair verification was unavailable (receipt ${options.evidence.recordId})`)
  const submitted = calls.find(one => one.path === '/api/merge-queue' && (one.body as any)?.takesOut)!
  expect(submitted.body).not.toHaveProperty('title'); expect((submitted.body as any).fixRound.reason).toBe('verification unavailable')
})
it.each(['build-failed'] as const)('keeps original %s repair verification truthful in the computed take-out title', async outcome => {
  const repair = await startedRepair()
  git(options.repository, 'merge', '--ff-only', 'repair'); landed(repair.entry, redCommit, repair.commit)
  retainFixtureInputs = true
  const resources = await import('../src/server/lib/resources.ts')
  const processRow = { pid: 701, pgid: 701, ppid: 1, command: 'Synthetic partial-verification controller', startedAt: '2026-10-15 09:00:00' }
  resources.useOsProbe({ platform: 'fake', processById: pid => pid === 701 ? processRow : null,
    processesInGroup: group => group === 701 ? [processRow] : [], listeningPorts: () => [], gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }), locks: () => ({ files: [], unreadable: [] }), ownProcessGroup: () => 999,
    killProcessGroup: () => { throw new Error('No fixture process may be signalled.') }, stopContainer: () => { throw new Error('No fixture container exists.') } })
  try {
    const processResource = resources.registerResource({ workspaceId: 'default', sessionRecordId: options.identity.run, type: 'process', key: '701', detail: 'Synthetic partial-verification process group', actor: person }).id
    const workdir = join(root, 'partial-producer'); mkdirSync(workdir)
    const producer = { workdir, processResource }
    let cloudCalls = 0
    const runCloud = async ({ clone, commit, paths }: any) => { cloudCalls++; return syntheticDoorResult(outcome, commit, clone, paths, join(clone, '..', 'door-output.log')) }
    expect(await tick({ producer }, { runCloud })).toMatchObject({ status: 'takeout-pending-check' })
    const ns = problems()[0]!.data.mainSuiteFix as any, pin = ns.verification.receipt
    writeFileSync(join(root, 'partial-verification-state.json'), JSON.stringify({ synthetic: true, outcome, verification: ns.verification, pending: ns.pending }, null, 2))
    expect(ns.verification).toMatchObject({ state: 'complete', outcome, receipt: expect.objectContaining({ seq: 1 }) })
    const observed = await ask({ method: 'GET', path: `/api/records/${pin.recordId}/revisions/1` })
    writeFileSync(join(root, 'partial-verification-input.json'), JSON.stringify({ synthetic: true, outcome, pin, observed }, null, 2))
    expect(ns.pending.phase).toBe('verification-not-green')
    expect(ns.outcome).toBeUndefined(); expect(now).toBeLessThan(ns.deadlineMs); expect(cloudCalls).toBe(1)
    releaseTakeout()
    expect(await tick({ producer }, { runCloud })).toMatchObject({ status: 'takeout-waiting' })
    const actual = data(problems()[0]!.id).mainSuiteFix
    expect(actual.verification).toMatchObject({ state: 'complete', outcome, receipt: pin })
    expect(actual.outcome).toBeUndefined(); expect(cloudCalls).toBe(1)
    const title = db.api.getRecord(actual.takeout.entry)!.title
    expect(title).toBe(`Take out merge entry ${cause}: ${outcome === 'build-failed' ? "the repair's verification build failed" : "the repair's verification was incomplete"} (receipt ${options.evidence.recordId})`)
    expect(title).not.toContain('stayed red'); expect(title).not.toContain("past the fix round's hour")
    const submitted = calls.find(one => one.path === '/api/merge-queue' && (one.body as any)?.takesOut)!
    expect(submitted.body).not.toHaveProperty('title'); expect((submitted.body as any).fixRound.reason).toBe('repair not green')
  } finally { resources.useOsProbe(resources.LINUX_PROBE) }
})
it('rejects nongenuine red or unavailable original bytes before filing a problem or dispatch', async () => {
  const red = options.evidence
  options.evidence = (await original('green')).evidence; calls = []
  await expect(tick()).rejects.toThrow('red')
  expect(calls.every(one => one.method === 'GET')).toBe(true); expect(problems()).toHaveLength(0)
  options.evidence = red
  const revision = await ask({ method: 'GET', path: `/api/records/${red.recordId}/revisions/1` })
  rmSync(revision.content.data.artifacts[0].path); calls = []
  await expect(tick()).rejects.toThrow()
  expect(calls.every(one => one.method === 'GET')).toBe(true); expect(problems()).toHaveLength(0)
})
/** THIS CASE HAS A LIMIT OF ITS OWN, because it does the work of several: it starts a repair, lands it, runs the periodic
 * suite twice and the fix round three times, all through real git and the office in this process. Measured on this
 * machine's 20 cores with no load made for it, it took 18.5 s in this file at load 7 to 30 and 23.9 s at load 35 to 43,
 * and it ran past the file's 30 s in the merge queue. If its time grows with the load once the load passes the cores,
 * then at load 96, the highest recorded on this machine, it takes about 59 s. Every case in this file also takes longer
 * the later it runs (the first beforeEach after the cold one took 1 s and the last 3.5 s), and nobody has found why. */
const A_CASE_OF_SEVERAL_MAY_TAKE_MS = 90_000
it('runs one repair verification through the existing cloud producer and shared seat while leaving periodic cadence intact', async () => {
  const repair = await startedRepair()
  git(options.repository, 'merge', '--ff-only', 'repair'); landed(repair.entry, redCommit, repair.commit)
  const resources = await import('../src/server/lib/resources.ts')
  const processRow = { pid: 700, pgid: 700, ppid: 1, command: 'Synthetic verification controller', startedAt: '2026-10-15 09:00:00' }
  resources.useOsProbe({ platform: 'fake', processById: pid => pid === 700 ? processRow : null,
    processesInGroup: group => group === 700 ? [processRow] : [], listeningPorts: () => [], gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }), locks: () => ({ files: [], unreadable: [] }), ownProcessGroup: () => 999,
    killProcessGroup: () => { throw new Error('No fixture process may be signalled.') }, stopContainer: () => { throw new Error('No fixture container exists.') } })
  try {
    const processResource = resources.registerResource({ workspaceId: 'default', sessionRecordId: options.identity.run, type: 'process', key: '700', detail: 'Synthetic verification process group', actor: person }).id
    const workdir = join(root, 'shared-producer'); mkdirSync(workdir)
    writeFileSync(join(workdir, 'state.json'), JSON.stringify({ version: 1, pending: null, lastStartedAtMs: now - 1000 }))
    const producer = { workdir, processResource }
    const { runPeriodicSuiteOnce } = await import('../tools/periodic-main-suite.mjs')
    expect(await runPeriodicSuiteOnce({ ...options, ...producer }, { officeRequest, clock: () => now })).toMatchObject({ status: 'skipped' })
    let cloudCalls = 0
    const runCloud = async ({ clone, commit, paths }: any) => {
      cloudCalls++
      writeFileSync(paths.log, 'Synthetic cloud; no actual suite ran.\n')
      writeFileSync(paths.manifest, JSON.stringify([{ file: join(clone, 'tests/one.test.ts') }]))
      writeFileSync(paths.report, JSON.stringify({ success: false, numTotalTests: 1, numPassedTests: 0, numFailedTests: 1, numPendingTests: 0, numTodoTests: 0,
        numTotalTestSuites: 1, numPassedTestSuites: 0, numFailedTestSuites: 1, numPendingTestSuites: 0,
        testResults: [{ name: join(clone, 'tests/one.test.ts'), status: 'failed', assertionResults: [{ fullName: 'Synthetic red repair verification', status: 'failed' }] }] }))
      mkdirSync(paths.reads); writeFileSync(join(paths.reads, 'synthetic.json'), 'Synthetic read proof.\n')
      const answer = { ran: true, code: 1, commit, phase: 'test', buildExitCode: 0, suiteExitCode: 1, wallSec: 1, workers: 1, files: 1, failed: ['tests/one.test.ts'] }
      const output = join(clone, '..', 'door-output.log'); writeFileSync(output, JSON.stringify(answer) + '\n')
      return { code: 1, answer, output }
    }
    expect(await tick({ producer }, { runCloud })).toMatchObject({ status: 'takeout-pending-check' })
    const ns = problems()[0]!.data.mainSuiteFix as any
    expect(ns.verification).toMatchObject({ state: 'complete', outcome: 'red', targetCommit: repair.commit })
    expect(ns.pending.phase).toBe('verification-not-green')
    expect(ns.outcome).toBeUndefined(); expect(cloudCalls).toBe(1)
    expect(await tick({ producer }, { runCloud })).toMatchObject({ status: 'takeout-pending-check' }); expect(cloudCalls).toBe(1)
    releaseTakeout()
    expect(await tick({ producer }, { runCloud })).toMatchObject({ status: 'takeout-waiting' })
    expect(data(repair.entry).state).toBe('merged'); expect(cloudCalls).toBe(1)
    expect(now).toBeLessThan(ns.deadlineMs)
    expect(db.api.getRecord(data(problems()[0]!.id).mainSuiteFix.takeout.entry)!.title).toBe(`Take out merge entry ${cause}: the repair's verification stayed red (receipt ${options.evidence.recordId})`)
    const submitted = calls.find(one => one.path === '/api/merge-queue' && (one.body as any)?.takesOut)!
    expect(submitted.body).not.toHaveProperty('title'); expect((submitted.body as any).fixRound.reason).toBe('repair not green')
    expect((db.client.sqlite.prepare("SELECT count(*) AS n FROM session_resources WHERE type='slot' AND released_at IS NULL").get() as { n: number }).n).toBe(0)
    await expect(runPeriodicSuiteOnce({ ...options, ...producer, intervalSeconds: 1 }, { officeRequest, clock: () => now })).rejects.toThrow('two and three')
  } finally { resources.useOsProbe(resources.LINUX_PROBE) }
}, A_CASE_OF_SEVERAL_MAY_TAKE_MS)

it('stops on the persons actual state-changing resolution despite later agent prose and sends the coordinator one notice', async () => {
  for (const state of ['accepted', 'worked_around', 'fixed']) {
    const issuance = await mintFixtureController(options.identity.agent, options.coordinator)
    options.identity = { ...options.identity, run: issuance.run.id }
    env.MOLE_OFFICE_SESSION = issuance.run.id; env.MOLE_AGENT_KEY = issuance.key
    vi.stubEnv('MOLE_OFFICE_SESSION', issuance.run.id); vi.stubEnv('MOLE_AGENT_KEY', issuance.key)
    options.evidence = (await original('red')).evidence
    calls = []
    intercept = (request, answer) => {
      if ((request.body as any)?.kind === 'problem' && answer.status === 201) {
        const problem = JSON.parse(answer.body).record.id
        db.api.patchRecord(problem, { dataPatch: { state } }, person)
        db.api.patchRecord(problem, { dataPatch: { symptom: 'An unrelated later secretary prose edit.' } }, { type: 'agent', id: options.identity.agent })
      }
      return answer
    }
    const stopped = await tick(); intercept = null
    expect(stopped).toMatchObject({ status: 'person-stopped' })
    const ns = data(stopped.problem).mainSuiteFix
    expect(data(stopped.problem).state).toBe(state)
    expect(ns.pending).toMatchObject({ phase: 'person-stopped', says: expect.stringContaining('ACT') })
    expect(ns.pending.says).toContain('revision 2'); expect(ns.pending.says).toContain(THE_TEST_OFFICES_OWNER.id)
    expect(ns.repair).toBeUndefined(); expect(ns.takeout).toBeUndefined()
    expect(calls.some(one => one.path.endsWith('/next-round') || (one.body as any)?.takesOut)).toBe(false)
    expect(await tick()).toMatchObject({ status: 'person-stopped', problem: stopped.problem })
    const notices = calls.filter(one => (one.body as any)?.data?.sendId?.includes('-person-stopped-'))
    expect(notices).toHaveLength(1); expect((notices[0]!.body as any).data.to).toEqual([{ kind: 'agent', id: options.coordinator }])
  }
})
it('routes a real namespace refusal during person-stop bookkeeping through the same unattributed diagnostic', async () => {
  const ownRecord = db.api.listRecords({ workspaceId: 'default', kind: 'agent' }).find(one => one.data.handle === options.identity.agent)!
  let refused: AnAnswer | undefined, changedCard = false
  intercept = (request, answer) => {
    if ((request.body as any)?.kind === 'problem' && answer.status === 201) db.api.patchRecord(JSON.parse(answer.body).record.id, { dataPatch: { state: 'accepted' } }, person)
    if ((request.body as any)?.dataPatch?.mainSuiteFix?.pending?.phase === 'person-stopped') refused = answer
    return answer
  }
  beforeOffice = request => {
    if (!changedCard && (request.body as any)?.dataPatch?.mainSuiteFix?.pending?.phase === 'person-stopped') {
      changedCard = true
      db.api.patchRecord(ownRecord.id, { dataPatch: { role: 'worker' } }, person)
    }
  }
  vi.stubGlobal('fetch', async (url: any, init: any) => {
    const at = new URL(String(url)), headers = Object.fromEntries(new Headers(init.headers).entries())
    expect('x-mole-office-session' in headers).toBe(false)
    const response = await server.app.inject({ method: init.method, url: at.pathname + at.search, headers,
      ...(init.body === undefined ? {} : { payload: init.body }) })
    return new Response(response.body, { status: response.statusCode })
  })
  let result: any
  try { result = await tick() } catch (error) { result = { unexpected: String(error) } }
  expect(changedCard).toBe(true); expect(refused?.status).toBe(403)
  const problem = problems()[0]!
  expect(problem.data.state).toBe('accepted'); expect((problem.data.mainSuiteFix as any).pending).toBeUndefined()
  expect(result).toMatchObject({ status: 'authority-refused' })
  expect(calls.some(one => one.path.endsWith('/next-round') || (one.body as any)?.takesOut)).toBe(false)
  const journal = JSON.parse(readFileSync(join(options.workdir, `receipt-${options.evidence.recordId}.json`), 'utf8'))
  expect(journal.authorityRefusal.claimedRun).toBe(options.identity.run)
  const diagnostics = db.api.listRecords({ kind: 'message', workspaceId: 'message-centre' }).filter(one => (one.data as any).sendId?.startsWith('fixround-authority-'))
  expect(diagnostics).toHaveLength(1)
  const original = await ask({ method: 'GET', path: `/api/records/${diagnostics[0]!.id}/revisions/1` })
  expect(original.who.sessionId).toBeNull(); expect(original.content.data.aboutRun).toBeUndefined()
})

it('keeps the actual default five-message cap over one controller lifetime and refuses a second red during pending or completed outcome delivery', async () => {
  const worker = await import('../src/server/lib/worker.ts')
  expect(worker.howManyMessagesOneRunMayFile()).toBe(5)
  let dropped = false
  intercept = (request, answer) => {
    if (!dropped && (request.body as any)?.data?.sendId?.includes('-start-') && theOfficeStoredTheMessage(answer)) { dropped = true; throw new Error('Synthetic pending start delivery response') }
    return answer
  }
  await expect(tick()).rejects.toThrow('pending start delivery response'); intercept = null
  git(options.repository, 'commit', '--allow-empty', '-qm', 'Synthetic second original red tip')
  const commit = git(options.repository, 'rev-parse', 'HEAD'), second = (await original('red', commit)).evidence
  const other = { evidence: second, commit, tree: git(options.repository, 'rev-parse', 'HEAD^{tree}'), workdir: join(root, 'second-controller-directory'), briefPath: join(options.sheriff.sandbox, 'second-repair.md') }
  await expect(tick(other)).rejects.toThrow(/controller|reserved|original.*run/i)
  expect(problems()).toHaveLength(1)
  expect(await tick()).toMatchObject({ status: 'dispatch-waiting' }); releaseTakeout(); now += 7200_000
  expect(await tick()).toMatchObject({ status: 'takeout-waiting' })
  const ns = problems()[0]!.data.mainSuiteFix as any
  git(options.repository, 'fetch', ns.takeout.clone, ns.takeout.commit); git(options.repository, 'merge', '--ff-only', 'FETCH_HEAD')
  landed(ns.takeout.entry, commit, ns.takeout.commit)
  expect(await tick()).toMatchObject({ status: 'returned' })
  await expect(tick(other)).rejects.toThrow(/controller|reserved|original.*run/i)
  expect(problems()).toHaveLength(1)
  expect(worker.messagesThisRunHasFiled(options.identity.run, 'default')).toBeLessThanOrEqual(5)
  expect(calls.filter(one => (one.body as any)?.data?.sendId?.includes('-start-'))).toHaveLength(1)
  expect(calls.filter(one => (one.body as any)?.data?.sendId?.includes('-outcome-'))).toHaveLength(1)
})
it('reports an actual refused controller proof once without session attribution across retry or another work directory and never changes protected records', async () => {
  const actual = data(options.identity.run)
  const forged = db.api.createRecord({ kind: 'session', title: 'Synthetic public metadata copy, deliberately not a mint', workspaceId: 'default', actor: person,
    data: { state: 'running', runtime: 'mole-office', servingAgent: options.identity.agent, servingAgentId: options.coordinator, extra: { runKeyId: actual.extra.runKeyId } } })
  options.identity = { ...options.identity, run: forged.id }
  env.MOLE_OFFICE_SESSION = forged.id; vi.stubEnv('MOLE_OFFICE_SESSION', forged.id)
  let dropped = false, protectedRefusals = 0
  vi.stubGlobal('fetch', async (url: any, init: any) => {
    expect(init.redirect === 'manual').toBe(true)
    const at = new URL(String(url)), body = init.body === undefined ? undefined : JSON.parse(init.body)
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    const request = { method: init.method, path: at.pathname + at.search, ...(body === undefined ? {} : { body }) } as ARequest
    calls.push(request)
    const diagnostic = body?.kind === 'message' && body.data?.sendId?.startsWith('fixround-authority-')
    if (diagnostic) {
      expect('x-mole-office-session' in headers).toBe(false)
      expect(body.data.aboutRun).toBeUndefined(); expect(body.data.fromRun).toBeUndefined()
      expect(body.data.body).toContain('unattributed'); expect(body.data.body).toContain('authorityRefusal')
    }
    const reply = await server.app.inject({ method: init.method, url: at.pathname + at.search, headers, ...(init.body === undefined ? {} : { payload: init.body }) })
    if (body?.data?.mainSuiteFix && reply.statusCode === 403) protectedRefusals++
    if (diagnostic && !dropped && reply.statusCode === 201) { dropped = true; throw new Error('Synthetic diagnostic response lost') }
    return new Response(reply.body, { status: reply.statusCode })
  })
  const poll = (extra = {}) => implementation().then(module => module.mainSuiteFixRoundTick({ ...options, ...extra }, { clock: () => now }))
  expect(await poll()).toMatchObject({ status: 'authority-refused' })
  expect(await poll()).toMatchObject({ status: 'authority-refused' })
  const other = join(root, 'other-refused-workdir')
  expect(await poll({ workdir: other })).toMatchObject({ status: 'authority-refused' })
  const journal = JSON.parse(readFileSync(join(other, `receipt-${options.evidence.recordId}.json`), 'utf8'))
  expect(journal.authorityRefusal).toMatchObject({ claimedRun: forged.id, missingProof: expect.any(String), revisionRead: { recordId: forged.id, seq: 1 } })
  expect(journal.authorityRefusal.notification.journalEntry).toBe(`${join(options.workdir, `receipt-${options.evidence.recordId}.json`)}#authorityRefusal`)
  expect(protectedRefusals).toBeGreaterThanOrEqual(1); expect(problems()).toHaveLength(0)
  expect(calls.some(one => one.path.endsWith('/next-round') || (one.body as any)?.takesOut)).toBe(false)
  const messages = db.api.listRecords({ kind: 'message', workspaceId: 'message-centre' }).filter((one: any) => one.data.sendId?.startsWith('fixround-authority-'))
  expect(messages).toHaveLength(1)
  expect(messages[0]!.data.fromRun).toBeUndefined(); expect(messages[0]!.data.aboutRun).toBeUndefined()
  expect(messages[0]!.data.to).toEqual([{ kind: 'agent', id: options.coordinator }])
})
it('continues for explicit open and does not invent a persons act from an agents resolution', async () => {
  intercept = (request, answer) => {
    if ((request.body as any)?.kind === 'problem' && answer.status === 201) db.api.patchRecord(JSON.parse(answer.body).record.id, { dataPatch: { state: 'open' } }, person)
    return answer
  }
  expect(await tick()).toMatchObject({ status: 'dispatch-waiting' }); intercept = null
  const problem = problems()[0]!.id
  await ask({ method: 'PATCH', path: `/api/records/${problem}`, body: { dataPatch: { state: 'fixed', fix: 'Synthetic secretary claim, not a person act or main-suite outcome.' } } })
  expect(await tick()).toMatchObject({ status: 'dispatch-waiting' })
  expect(data(problem).mainSuiteFix.outcome).toBeUndefined()
  expect(calls.some(one => (one.body as any)?.data?.sendId?.includes('-person-stopped-'))).toBe(false)
})
it('rechecks the actual persons state-changing act before the next dispatch or take-out action', async () => {
  intercept = (request, answer) => {
    if ((request.body as any)?.dataPatch?.mainSuiteFix?.dispatch?.state === 'planned' && answer.status === 200) {
      const problem = request.path.split('/')[3]!
      db.api.patchRecord(problem, { dataPatch: { state: 'accepted' } }, person)
    }
    return answer
  }
  expect(await tick()).toMatchObject({ status: 'person-stopped' }); intercept = null
  expect(calls.some(one => one.path.endsWith('/next-round'))).toBe(false)
  // The person's explicit reopen is the existing ordinary act; no runner overwrites it.
  const problem = problems()[0]!.id
  db.api.patchRecord(problem, { dataPatch: { state: 'open' } }, person)
  expect(await tick()).toMatchObject({ status: 'dispatch-waiting' })
  expect(data(problem).mainSuiteFix.pending?.phase).not.toBe('person-stopped')
  expect(data(problem).state).toBe('open')
  releaseTakeout(); now += 7200_000
  intercept = (request, answer) => {
    if ((request.body as any)?.dataPatch?.mainSuiteFix?.takeout?.run && answer.status === 200) db.api.patchRecord(problem, { dataPatch: { state: 'worked_around' } }, person)
    return answer
  }
  expect(await tick()).toMatchObject({ status: 'person-stopped' }); intercept = null
  expect(data(problem).state).toBe('worked_around')
  expect(calls.some(one => (one.body as any)?.takesOut)).toBe(false)
  expect(calls.filter(one => (one.body as any)?.data?.sendId?.includes('-person-stopped-'))).toHaveLength(1)
  db.api.patchRecord(problem, { dataPatch: { state: 'open' } }, person)
  expect(await tick()).toMatchObject({ status: 'takeout-waiting' })
  const takeout = data(problem).mainSuiteFix.takeout
  git(options.repository, 'fetch', takeout.clone, takeout.commit); git(options.repository, 'merge', '--ff-only', 'FETCH_HEAD')
  landed(takeout.entry, redCommit, takeout.commit)
  expect(await tick()).toMatchObject({ status: 'returned' })
  const worker = await import('../src/server/lib/worker.ts')
  expect(worker.howManyMessagesOneRunMayFile()).toBe(5)
  expect(worker.messagesThisRunHasFiled(options.identity.run, 'default')).toBeLessThanOrEqual(5)
})

it('takes out through the real hand filing from a running controller in an Office-vouched sandbox', async () => {
  await tick(); now += 7200_000
  expect(await tick()).toMatchObject({ status: 'takeout-pending-check' })
  const ns = problems()[0]!.data.mainSuiteFix as any, child = data(ns.takeout.run)
  const { theSandboxTheOfficeVouchesFor } = await import('../src/server/lib/next-round.ts')
  expect(theSandboxTheOfficeVouchesFor(db.api.getRecord(options.identity.run)!)).toMatchObject(options.controllerSandbox)
  expect(data(options.identity.run).state).toBe('running')
  const filing = calls.find(one => one.path === '/api/records' && (one.body as any)?.kind === 'session')!.body as any
  expect(filing).toMatchObject({ askedBy: options.identity.run, brief: options.authorBrief.path, cutFrom: redCommit })
  expect(child).toMatchObject({ state: 'finished', parentAttachment: options.identity.run, workingDirectory: join(options.workdir, 'takeout-clone') })
  expect(git(join(options.controllerSandbox.folder, 'repo'), 'rev-parse', `${filing.cutFrom}^{commit}`)).toBe(redCommit)
  expect(data(options.identity.run).workerRuns[child.servingAgentId]).toMatchObject({ byHand: true, state: 'started', brief: { sha256: options.authorBrief.sha256 }, started: { run: ns.takeout.run, runKeyId: child.extra.runKeyId } })
  expect(calls.some(one => one.path.endsWith('/hand-run'))).toBe(false)
  expect(problems()).toHaveLength(1)
  expect(ns.deadlineMs).toBe(Date.parse('2026-10-15T10:20:00Z'))
  expect((await ask({ method: 'GET', path: `/api/checks/${ns.takeout.run}` })).submission.id).toBe(child.sealedTip)
  releaseTakeout()
  expect(await tick()).toMatchObject({ status: 'takeout-waiting' })
  const entry = data(problems()[0]!.id).mainSuiteFix.takeout.entry
  expect(data(entry).takesOut).toEqual([cause])
  // Keep public correlation evidence and the real Git/brief bytes, never a fixture credential.
  writeFileSync(join(root, 'hand-start-proof.json'), JSON.stringify({ syntheticContainerLedger: true, syntheticInspectorVerdict: true,
    fullName: expect.getState().currentTestName, configuration: { repository: options.repository, repositoryId: options.repositoryId,
      workdir: options.workdir, identity: options.identity, controllerSandbox: options.controllerSandbox, authorBrief: options.authorBrief },
    vouched: theSandboxTheOfficeVouchesFor(db.api.getRecord(options.identity.run)!), filing,
    original: await ask({ method: 'GET', path: `/api/records/${ns.takeout.run}/revisions/1` }),
    originalMint: await ask({ method: 'GET', path: `/api/records/${ns.takeout.run}/revisions/2` }),
    hand: data(options.identity.run).workerRuns[child.servingAgentId], child, entry: db.api.getRecord(entry),
    controllerState: data(options.identity.run).state, originalDeadlineMs: ns.deadlineMs,
  }, null, 2), { mode: 0o600 })
  retainFixtureInputs = true
})

it('refuses changed controller sandbox or author brief configuration on a retained runner transaction', async () => {
  await tick()
  for (const extra of [{ controllerSandbox: { ...options.controllerSandbox, container: 'different-container' } }, { authorBrief: { ...options.authorBrief, path: join(options.controllerSandbox.folder, 'different-brief.md') } }]) {
    calls = []
    await expect(tick(extra)).rejects.toThrow('retained journal correlation')
    expect(calls.filter(one => one.method !== 'GET')).toEqual([])
  }
  expect(problems()).toHaveLength(1)
})
