// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real throwaway Git and Office; cloud artifacts are made up and no suite runs. */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { askTheOffice, type ARequest, type AnAnswer } from '../tools/office-request.mjs'
import { receiptFromArtifacts } from '../tools/periodic-main-suite.mjs'

// The criterion compiles before its implementation exists.
const modulePath = '../tools/main-suite-fix-round-evidence.mjs'
const implementation = () => import(modulePath)
let db: TestDb, server: Awaited<ReturnType<typeof apiApp>>, env: NodeJS.ProcessEnv
let root: string, repository: string, baseline: string, commit: string, tree: string
let serial = 0

function git(...args: string[]): string {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    encoding: 'utf8', timeout: 15_000,
    env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
  })
  if (result.status !== 0) throw new Error(`Made-up Git failed: ${result.stderr}`)
  return result.stdout.trim()
}
async function officeRequest(request: ARequest): Promise<AnAnswer> {
  return askTheOffice(request, { env, fetchImpl: async (url, options) => {
    const at = new URL(String(url))
    const response = await server.app.inject({ method: options?.method as 'GET' | 'POST' | 'PATCH', url: at.pathname + at.search,
      headers: options?.headers as Record<string, string>, ...(options?.body === undefined ? {} : { payload: String(options.body) }) })
    return new Response(response.body, { status: response.statusCode, headers: response.headers as Record<string, string> })
  } })
}
async function ask(request: ARequest): Promise<any> {
  const response = await officeRequest(request)
  expect(response.status, response.body).toBeLessThan(300)
  return JSON.parse(response.body)
}
beforeAll(async () => {
  db = await freshDb(); server = await apiApp()
  const agent = db.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up fix-round evidence reader',
    data: { handle: 'fixture-fix-round-reader', runtime: 'codex', state: 'active' }, actor: db.api.HUMAN })
  const participants = await import('../src/server/lib/participants.ts')
  const keys = await import('../src/server/lib/keys.ts')
  const session = db.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up fix-round reader run',
    data: { state: 'running', runtime: 'mole-office' }, actor: db.api.HUMAN })
  env = { MOLE_OFFICE_API: 'http://fixture-office.invalid', MOLE_OFFICE_AGENT: 'fixture-fix-round-reader',
    MOLE_OFFICE_SESSION: session.id, MOLE_OFFICE_WORKSPACE: 'default', MOLE_AGENT_KEY: keys.makeAnAgentKey(participants.agentForRecord(agent.id)!.id, null) }
})
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fix-round-evidence-'))
  repository = join(root, 'main')
  mkdirSync(join(repository, 'tests'), { recursive: true })
  writeFileSync(join(repository, 'tests', 'one.test.ts'), '// Made-up cloud source; never executed.\n')
  git('init', '-q', '-b', 'main', repository)
  git('-C', repository, 'add', '.')
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Made-up baseline')
  baseline = git('-C', repository, 'rev-parse', 'HEAD')
  writeFileSync(join(repository, 'change.txt'), 'Made-up causal change.\n')
  git('-C', repository, 'add', '.')
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Made-up causal entry')
  commit = git('-C', repository, 'rev-parse', 'HEAD'); tree = git('-C', repository, 'rev-parse', 'HEAD^{tree}')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
afterAll(async () => { await server.app.close(); db.close() })

async function receipt(mode: 'green' | 'red' | 'partial' | 'build', target = commit, endedAt = '2026-10-13 10:01:00') {
  const attempt = join(root, `attempt-${++serial}`), clone = join(attempt, 'clone')
  mkdirSync(attempt)
  git('clone', '--no-local', '-q', repository, clone); git('-C', clone, 'checkout', '-q', '--detach', target)
  const paths = { log: join(attempt, 'suite.log'), report: join(attempt, 'report.json'), manifest: join(attempt, 'manifest.json'), reads: join(attempt, 'reads') }
  writeFileSync(paths.log, 'Made-up cloud output; no suite ran.\n')
  const files = mode === 'partial' ? [] : ['tests/one.test.ts'], failed = mode === 'red' ? files : []
  writeFileSync(paths.manifest, JSON.stringify([{ file: join(clone, 'tests/one.test.ts') }]))
  writeFileSync(paths.report, JSON.stringify({ success: mode !== 'red', numTotalTests: files.length,
    numPassedTests: files.length - failed.length, numFailedTests: failed.length, numPendingTests: 0, numTodoTests: 0,
    numTotalTestSuites: files.length, numPassedTestSuites: files.length - failed.length, numFailedTestSuites: failed.length, numPendingTestSuites: 0,
    testResults: files.map(file => ({ name: join(clone, file), status: failed.includes(file) ? 'failed' : 'passed',
      assertionResults: [{ fullName: 'Made-up failing assertion', status: failed.includes(file) ? 'failed' : 'passed' }] })) }))
  mkdirSync(paths.reads); writeFileSync(join(paths.reads, 'synthetic.json'), 'Made-up read record.\n')
  const answer = mode === 'build'
    ? { ran: true, code: 7, commit: target, phase: 'build', buildExitCode: 7, wallSec: 1, workers: 1, files: 0, failed: [] }
    : { ran: true, code: failed.length ? 1 : 0, commit: target, phase: 'test', buildExitCode: 0, suiteExitCode: failed.length ? 1 : 0, wallSec: 1, workers: 1, files: files.length, failed }
  const result = { code: answer.code, answer, output: join(attempt, 'door-output.log') }
  writeFileSync(result.output, `${JSON.stringify(answer)}\n`); writeFileSync(join(attempt, 'door-result.json'), JSON.stringify(result))
  if (mode === 'build') { rmSync(paths.report); rmSync(paths.manifest); rmSync(paths.reads, { recursive: true }) }
  const data = receiptFromArtifacts({ repository, commit: target, tree: git('-C', repository, 'rev-parse', `${target}^{tree}`), clone, paths, result,
    startedAt: '2026-10-13 10:00:00', endedAt })
  const made = await ask({ method: 'POST', path: '/api/records', body: { kind: 'whole_suite_receipt', title: `Made-up fix-round receipt ${serial}`, data } })
  const original = await ask({ method: 'GET', path: `/api/records/${made.record.id}/revisions/1` })
  return { repository, commit: target, tree: data.tree, evidence: { recordId: made.record.id, seq: 1, contentHash: original.contentHash }, timeZone: 'Europe/London', paths }
}

it('admits only the exact original complete red main receipt and refuses green build partial or queue evidence', async () => {
  const { readFixRoundRed } = await implementation()
  const red = await receipt('red')
  expect(await readFixRoundRed(red, { officeRequest })).toMatchObject({ receipt: { commit, tree, failedFiles: ['tests/one.test.ts'] }, deadlineMs: Date.parse('2026-10-13T10:01:00Z') })
  for (const mode of ['green', 'build', 'partial'] as const) await expect(readFixRoundRed(await receipt(mode), { officeRequest })).rejects.toThrow('complete original red')
  await expect(readFixRoundRed({ ...red, tree: baseline }, { officeRequest })).rejects.toThrow('tree')
  await expect(readFixRoundRed({ ...red, evidence: { ...red.evidence, seq: 2 } }, { officeRequest })).rejects.toThrow('original sequence 1')
  await expect(readFixRoundRed({ ...red, evidence: { recordId: 'queue-green', seq: 1, contentHash: 'a'.repeat(16) } }, { officeRequest })).rejects.toThrow()
})

it('refuses unavailable or changed original artifact bytes even when latest receipt data claims red', async () => {
  const { readFixRoundRed } = await implementation()
  const red = await receipt('red')
  writeFileSync(red.paths.log, 'Changed made-up artifact bytes.\n')
  await expect(readFixRoundRed(red, { officeRequest })).rejects.toThrow('artifact hashes')
  const missing = await receipt('red')
  rmSync(missing.paths.report)
  await expect(readFixRoundRed(missing, { officeRequest })).rejects.toThrow('inaccessible')
})

it('keeps the original hour and reports unknown for missing skipped or repeated local end times', async () => {
  const { fixRoundDeadline } = await implementation()
  expect(fixRoundDeadline('2026-10-13 10:01:00', 'Europe/London')).toEqual({ endedAtMs: Date.parse('2026-10-13T09:01:00Z'), deadlineMs: Date.parse('2026-10-13T10:01:00Z') })
  for (const stamp of ['', '2026-10-25 01:30:00', '2026-03-29 01:30:00', '2026-02-30 10:00:00']) expect(fixRoundDeadline(stamp, 'Europe/London')).toBeNull()
  expect(fixRoundDeadline('2026-10-25T01:30:00+00:00', 'Europe/London')?.deadlineMs).toBe(Date.parse('2026-10-25T02:30:00Z'))
  expect(() => fixRoundDeadline('2026-10-13 10:01:00', '')).toThrow('time zone')
})

function landed(entry = 'entry-one', from = baseline, to = commit) {
  return { id: entry, state: 'merged', changeset: { adapter: 'git' }, integrated: { entry, mainBefore: from, mainAfter: to, rebasedTip: to, sealId: 'made-up-seal' } }
}
it('proves only-change from a complete actual landed interval and leaves multiple or mismatched bus causes unknown', async () => {
  const { findFixRoundCauses } = await implementation()
  const original = await receipt('red'), green = await receipt('green', baseline)
  expect(await findFixRoundCauses({ ...original, baseline: green, entries: [landed()] }, { officeRequest })).toMatchObject({ cause: [{ entry: 'entry-one', commits: [commit], how: 'only-change' }] })
  expect(await findFixRoundCauses({ ...original, baseline: green, entries: [] }, { officeRequest })).toMatchObject({ cause: [], unknown: expect.any(String) })
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'Made-up second entry')
  const later = git('-C', repository, 'rev-parse', 'HEAD'), red = await receipt('red', later)
  expect(await findFixRoundCauses({ ...red, baseline: green, entries: [landed(), landed('entry-two', commit, later)] }, { officeRequest })).toMatchObject({ cause: [], unknown: expect.any(String) })
  await expect(findFixRoundCauses({ ...original, baseline: original, entries: [landed()] }, { officeRequest })).rejects.toThrow('green baseline')
})

it('maps observed bus driver and rider indices only when their exact landed commits and original main suite match', async () => {
  const { findFixRoundCauses } = await implementation()
  const green = await receipt('green', baseline)
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'Made-up rider')
  const later = git('-C', repository, 'rev-parse', 'HEAD'), red = await receipt('red', later)
  const proof = { mainAt: baseline, suite: { commit: later, tree: red.tree },
    order: [{ entry: 'entry-one', commit, tree, commits: [commit] }, { entry: 'entry-two', commit: later, tree: red.tree, commits: [later] }],
    pairDecided: { still: ['tests/one.test.ts'], brokeBy: { 'tests/one.test.ts': 1 }, runsAlone: 2, without: null } }
  const entries = [{ ...landed(), machine: { tested: { busCause: proof } } }, landed('entry-two', commit, later)]
  expect(await findFixRoundCauses({ ...red, baseline: green, entries }, { officeRequest })).toMatchObject({ cause: [{ entry: 'entry-two', commits: [later], how: 'bisect' }], unknown: null })
  proof.pairDecided.brokeBy['tests/one.test.ts'] = 0
  expect(await findFixRoundCauses({ ...red, baseline: green, entries }, { officeRequest })).toMatchObject({ cause: [{ entry: 'entry-one', commits: [commit], how: 'bisect' }] })
  proof.suite.tree = git('-C', repository, 'rev-parse', `${baseline}^{tree}`)
  expect(await findFixRoundCauses({ ...red, baseline: green, entries }, { officeRequest })).toMatchObject({ cause: [], unknown: expect.any(String) })
})

it('prepares real revert commits only in an independent external clone without hooks or moving main', async () => {
  const { prepareFixRoundRevert } = await implementation()
  const clone = join(root, 'takeout'), marker = join(root, 'hook-ran')
  const hook = join(repository, '.git', 'hooks', 'post-checkout')
  writeFileSync(hook, `#!/bin/sh\nprintf changed > '${marker}'\n`, { mode: 0o700 })
  const result = prepareFixRoundRevert({ repository, clone, main: commit, cause: [{ entry: 'entry-one', commits: [commit], how: 'only-change' }], author: { name: 'Made-up secretary', email: 'fixture@example.invalid' } })
  expect(result).toMatchObject({ clone, base: commit, takesOut: ['entry-one'], commits: [expect.any(String)] })
  expect(git('-C', clone, 'rev-parse', 'HEAD^{tree}')).toBe(git('-C', repository, 'rev-parse', `${baseline}^{tree}`))
  expect(git('-C', repository, 'rev-parse', 'refs/heads/main')).toBe(commit)
  expect(existsSync(marker)).toBe(false)
  expect(readFileSync(join(repository, 'change.txt'), 'utf8')).toBe('Made-up causal change.\n')
  await expect(Promise.resolve().then(() => prepareFixRoundRevert({ repository, clone: repository, main: commit, cause: [{ entry: 'entry-one', commits: [commit], how: 'only-change' }], author: { name: 'Fixture', email: 'fixture@example.invalid' } }))).rejects.toThrow('separate')
})

it('retains a failed revert for supervised recovery and never calls a conflict returned', async () => {
  const { prepareFixRoundRevert } = await implementation()
  writeFileSync(join(repository, 'change.txt'), 'Later made-up conflicting content.\n')
  git('-C', repository, 'add', '.')
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Made-up later change')
  const main = git('-C', repository, 'rev-parse', 'HEAD'), clone = join(root, 'conflicting-takeout')
  expect(() => prepareFixRoundRevert({ repository, clone, main, cause: [{ entry: 'entry-one', commits: [commit], how: 'only-change' }], author: { name: 'Fixture', email: 'fixture@example.invalid' } })).toThrow('revert failed')
  expect(existsSync(join(clone, '.git', 'REVERT_HEAD'))).toBe(true)
  expect(git('-C', repository, 'rev-parse', 'refs/heads/main')).toBe(main)
})
