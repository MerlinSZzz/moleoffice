// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Real throwaway Git and office API; every cloud artifact here is explicitly made up.
 *
 * THE READ RECORD (package RP): a receipt's reads are read as the old folder or as the packed
 * `reads.tar.zst` beside it, and a receipt may name either form. A build-failed receipt keeps only its
 * log and has no reads artifact. MUTATIONS: `readsOnDisk` accepting only a directory: "reads a packed
 * read record ..." and "takes a receipt whose reads artifact names the packed file ..." red; no older
 * case. Requiring a reads artifact when the receipt has none: "reads a build-failed receipt ..." red;
 * no older case.
 *
 * A RECEIPT LONGER THAN THE DEFAULT REPLY: the request helper hands back 60,000 characters unless a read asks for more,
 * and a cut answer is refused. Every receipt-evidence read asks for the evidence module's own reply length, and the
 * producer's transport hands it on. A reply cut even at that length is still refused. Tested after the transport cases.
 *
 * THE FILES A RUN CARRIED OVER (point QV-1) are tested at the end, and their mutations are named above that describe.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { askTheOffice, THE_LONGEST_REPLY, type AnAnswer, type ARequest } from '../tools/office-request.mjs'
import { producerOfficeRequest, receiptFromArtifacts } from '../tools/periodic-main-suite.mjs'
import { CARRIED_OVER_REFUSALS, readOriginalReceipt, readReceiptEvidenceObject, verifyOriginalReceiptEvidence, verifyUpgradeEvidence } from '../tools/stable/stable-upgrade-evidence.mjs'
import type { WholeSuiteReceipt } from '../src/shared/whole-suite-receipt.ts'

let office: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let env: NodeJS.ProcessEnv
let root: string
let repository: string
let clone: string
let attempt: string
let commit: string
let tree: string
let calls: ARequest[]
let paths: { log: string; report: string; manifest: string; reads: string }
let result: { code: number; answer: Record<string, unknown>; output: string }
let fixtureNumber = 0
// Read by name, so this criterion compiles before the evidence module exports its reply length.
const evidenceModule = '../tools/stable/stable-upgrade-evidence.mjs'
let theLongestReceiptReply: number

function git(...args: string[]): string {
  const ran = spawnSync('git', args, { encoding: 'utf8', timeout: 15_000, env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })
  if (ran.status !== 0) throw new Error(`Made-up Git fixture failed: ${ran.stderr}`)
  return ran.stdout.trim()
}

const writeJson = (path: string, value: unknown): void => writeFileSync(path, JSON.stringify(value))
/** Fetch into the throwaway office in this process. Nothing is sent over a network. */
const throughTheMadeUpOffice: typeof fetch = async (url, options) => {
  const injected = await server.app.inject({ method: options?.method as 'GET' | 'POST' | 'PATCH', url: new URL(String(url)).pathname,
    headers: options?.headers as Record<string, string>, ...(options?.body === undefined ? {} : { payload: String(options.body) }) })
  return new Response(injected.body, { status: injected.statusCode, headers: injected.headers as Record<string, string> })
}
async function officeRequest(asked: ARequest): Promise<AnAnswer> {
  calls.push(asked)
  return askTheOffice(asked, { env, fetchImpl: throughTheMadeUpOffice })
}
/** The producer's own transport, into the same throwaway office. */
const producer = (asked: ARequest) => producerOfficeRequest(asked, env, throughTheMadeUpOffice)

beforeAll(async () => {
  office = await freshDb()
  server = await apiApp()
  const agent = office.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up evidence reader', data: { handle: 'fixture-evidence-reader', runtime: 'codex', state: 'active' }, actor: office.api.HUMAN })
  const participants = await import('../src/server/lib/participants.ts')
  const keys = await import('../src/server/lib/keys.ts')
  const agentId = participants.agentForRecord(agent.id)!.id
  const session = office.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up evidence reader run', data: { state: 'running', runtime: 'mole-office' }, actor: office.api.HUMAN })
  env = { MOLE_OFFICE_API: 'http://fixture-office.invalid', MOLE_OFFICE_AGENT: 'fixture-evidence-reader', MOLE_OFFICE_SESSION: session.id, MOLE_OFFICE_WORKSPACE: 'default', MOLE_AGENT_KEY: keys.makeAnAgentKey(agentId, null) }
  theLongestReceiptReply = (await import(evidenceModule)).THE_LONGEST_RECEIPT_REPLY as number
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'upgrade-evidence-fixture-'))
  repository = join(root, 'main')
  mkdirSync(join(repository, 'tests'), { recursive: true })
  for (const name of ['one', 'two']) writeFileSync(join(repository, 'tests', `${name}.test.ts`), '// Made-up source; no suite runs.\n')
  git('init', '-q', '-b', 'main', repository)
  git('-C', repository, 'add', '.')
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Made-up target')
  commit = git('-C', repository, 'rev-parse', 'HEAD')
  tree = git('-C', repository, 'rev-parse', 'HEAD^{tree}')
  attempt = join(root, 'attempt-fixture')
  mkdirSync(attempt)
  clone = join(attempt, 'clone')
  git('clone', '--no-local', '-q', repository, clone)
  git('-C', clone, 'checkout', '-q', '--detach', commit)
  paths = { log: join(attempt, 'suite.log'), report: join(attempt, 'report.json'), manifest: join(attempt, 'manifest.json'), reads: join(attempt, 'reads') }
  mkdirSync(paths.reads)
  writeFileSync(join(paths.reads, 'synthetic.json'), 'Made-up read record, not an observed suite.\n')
  calls = []
  artifacts('green')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))
afterAll(async () => { await server.app.close(); office.close() })

function artifacts(mode: 'green' | 'red' | 'partial'): WholeSuiteReceipt {
  const expected = ['tests/one.test.ts', 'tests/two.test.ts']
  const observed = mode === 'partial' ? expected.slice(0, 1) : expected
  const failed = mode === 'red' ? [expected[0]!] : []
  writeFileSync(paths.log, 'Made-up cloud output. No tests were executed.\n')
  writeJson(paths.manifest, expected.map((file) => ({ file: join(clone, file) })))
  writeJson(paths.report, { success: mode !== 'red', numTotalTests: observed.length, numPassedTests: observed.length - failed.length, numFailedTests: failed.length, numPendingTests: 0, numTodoTests: 0,
    numTotalTestSuites: observed.length, numPassedTestSuites: observed.length - failed.length, numFailedTestSuites: failed.length, numPendingTestSuites: 0,
    testResults: observed.map((file) => ({ name: join(clone, file), status: failed.includes(file) ? 'failed' : 'passed', assertionResults: [{ fullName: `Made-up assertion in ${file}`, status: failed.includes(file) ? 'failed' : 'passed' }] })) })
  result = { code: mode === 'red' ? 1 : 0, answer: { ran: true, code: mode === 'red' ? 1 : 0, commit, phase: 'test', buildExitCode: 0, suiteExitCode: mode === 'red' ? 1 : 0, wallSec: 1, workers: 1, files: observed.length, failed }, output: join(attempt, 'door-output.log') }
  saveResult()
  return receiptFromArtifacts({ repository, commit, tree, clone, paths, result, startedAt: '2026-10-13 10:00:00', endedAt: '2026-10-13 10:01:00' })
}

function saveResult(): void {
  writeJson(join(attempt, 'door-result.json'), result)
  writeFileSync(result.output, `Made-up method output.\n${JSON.stringify(result.answer)}\n`)
}

function artifactsWithSkippedCases(): WholeSuiteReceipt {
  const expected = ['tests/one.test.ts', 'tests/two.test.ts']
  writeFileSync(paths.log, 'Made-up cloud output. No tests were executed.\n')
  writeJson(paths.manifest, expected.map((file) => ({ file: join(clone, file) })))
  writeJson(paths.report, { success: true, numTotalTests: 3, numPassedTests: 1, numFailedTests: 0, numPendingTests: 2, numTodoTests: 0,
    numTotalTestSuites: 2, numPassedTestSuites: 2, numFailedTestSuites: 0, numPendingTestSuites: 0,
    testResults: [
      { name: join(clone, expected[0]!), status: 'passed', assertionResults: [{ fullName: 'Made-up assertion in tests/one.test.ts', status: 'passed' }] },
      { name: join(clone, expected[1]!), status: 'passed', assertionResults: [
        { fullName: 'Made-up skipped assertion b', status: 'skipped' },
        { fullName: 'Made-up skipped assertion a', status: 'skipped' },
      ] },
    ] })
  result = { code: 0, answer: { ran: true, code: 0, commit, phase: 'test', buildExitCode: 0, suiteExitCode: 0, wallSec: 1, workers: 1, files: 2, failed: [] }, output: join(attempt, 'door-output.log') }
  saveResult()
  return receiptFromArtifacts({ repository, commit, tree, clone, paths, result, startedAt: '2026-10-13 10:00:00', endedAt: '2026-10-13 10:01:00' })
}

async function filed(data: WholeSuiteReceipt = artifacts('green')) {
  // Each answer is asked only for the field read here, so a receipt longer than the default reply is filed too.
  const created = await officeRequest({ method: 'POST', path: '/api/records', body: { kind: 'whole_suite_receipt', title: `Made-up original suite receipt ${++fixtureNumber}`, data }, fields: ['record.id'] })
  expect(created.status, created.body).toBe(201)
  const recordId = JSON.parse(created.body).record.id as string
  const revision = JSON.parse((await officeRequest({ method: 'GET', path: `/api/records/${recordId}/revisions/1`, fields: ['contentHash'] })).body)
  return { repository, commit, evidence: { recordId, seq: 1, contentHash: revision.contentHash as string } }
}

type Input = Awaited<ReturnType<typeof filed>>
const verify = (input: Input) => verifyUpgradeEvidence(input, { officeRequest })
const facts = (data: WholeSuiteReceipt) => ({ ...data })
async function latest(input: Input, data: WholeSuiteReceipt): Promise<void> {
  const changed = await officeRequest({ method: 'PATCH', path: `/api/records/${input.evidence.recordId}`, body: { data } })
  expect(changed.status, changed.body).toBe(200)
}

function fileBytes(folder: string): Record<string, string> {
  const found: Record<string, string> = {}
  const walk = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name)
      if (entry.isDirectory()) walk(full)
      else found[relative(folder, full)] = createHash('sha256').update(readFileSync(full)).digest('base64')
    }
  }
  walk(folder)
  return found
}

it('returns only the pinned original facts after a latest edit and leaves Git, files and office records unchanged', async () => {
  const input = await filed()
  const originalData = JSON.parse((await officeRequest({ method: 'GET', path: `/api/records/${input.evidence.recordId}/revisions/1` })).body).content.data
  await latest(input, { ...originalData, endedAt: '2026-10-13 11:00:00' })
  // The target may be behind the development main tip.
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'Later main')
  const before = fileBytes(root)
  const rows = () => office.client.sqlite.prepare('SELECT id, data, updated_at FROM records ORDER BY id').all()
  const history = () => office.client.sqlite.prepare('SELECT * FROM revisions ORDER BY id').all()
  const beforeRows = rows(), beforeHistory = history()
  calls = []
  const accepted = await verify(input)
  expect(accepted.receipt).toEqual(originalData)
  expect(accepted.original).toMatchObject({ seq: 1, op: 'create', contentHash: input.evidence.contentHash })
  expect(accepted.result).toEqual(result)
  expect(accepted.artifacts).toEqual(originalData.artifacts)
  expect(calls).toEqual([{ method: 'GET', path: `/api/records/${input.evidence.recordId}/revisions/1`, longestReply: theLongestReceiptReply }, { method: 'GET', path: `/api/records/${input.evidence.recordId}`, longestReply: theLongestReceiptReply }])
  expect(fileBytes(root)).toEqual(before)
  expect(rows()).toEqual(beforeRows)
  expect(history()).toEqual(beforeHistory)
})

/** The keeper's own packing of an older attempt: tar -C <attempt> -cf - reads | zstd, then the folder goes. */
function packTheFolderBesideTheReceipt(): { archive: string; tarSha256: string } {
  const tar = spawnSync('tar', ['-C', attempt, '-cf', '-', 'reads'], { maxBuffer: 64 * 1024 * 1024 })
  expect(tar.status, String(tar.stderr)).toBe(0)
  const archive = join(attempt, 'reads.tar.zst')
  writeFileSync(archive, zstdCompressSync(tar.stdout))
  const tarSha256 = createHash('sha256').update(tar.stdout).digest('hex')
  rmSync(paths.reads, { recursive: true })
  return { archive, tarSha256 }
}

it('reads a packed read record beside the folder a receipt names, with the same artifact digest', async () => {
  const data = artifacts('green')
  const named = data.artifacts.find((artifact) => artifact.name === 'reads')!
  const input = await filed(data)
  const packed = packTheFolderBesideTheReceipt()
  const rebuilt = receiptFromArtifacts({ repository, commit, tree, clone, paths, result, startedAt: '2026-10-13 10:00:00', endedAt: '2026-10-13 10:01:00' })
  const fromArchive = rebuilt.artifacts.find((artifact) => artifact.name === 'reads')!
  expect(fromArchive).toMatchObject({ path: named.path, sha256Base64: named.sha256Base64 })
  expect(packed.tarSha256).toMatch(/^[a-f0-9]{64}$/u)
  const accepted = await verify(input)
  expect(accepted).toMatchObject({ complete: true, green: true, outcome: 'green' })
  expect(accepted.artifacts.find((artifact) => artifact.name === 'reads')).toMatchObject({ path: named.path, sha256Base64: named.sha256Base64 })
})

it('takes a receipt whose reads artifact names the packed file through the upgrade evidence step', async () => {
  artifacts('green')
  const packed = packTheFolderBesideTheReceipt()
  const data = receiptFromArtifacts({ repository, commit, tree, clone, paths: { ...paths, reads: packed.archive }, result, startedAt: '2026-10-13 10:00:00', endedAt: '2026-10-13 10:01:00' })
  const named = data.artifacts.find((artifact) => artifact.name === 'reads')!
  expect(named.path).toBe(packed.archive)
  const input = await filed(data)
  const accepted = await verify(input)
  expect(accepted).toMatchObject({ complete: true, green: true, outcome: 'green' })
  expect(accepted.artifacts.find((artifact) => artifact.name === 'reads')).toMatchObject({ path: packed.archive, sha256Base64: named.sha256Base64 })
})

it('uses the shared green predicate even when latest says green or original exits zero with incomplete coverage', async () => {
  const red = await filed(artifacts('red'))
  await latest(red, artifacts('green'))
  artifacts('red')
  await expect(verify(red)).rejects.toThrow('not green')
  const partial = await filed(artifacts('partial'))
  await expect(verify(partial)).rejects.toThrow('not green')
})

it('permits real transport masks only in ignored latest data and changes, preserving the original evidence', async () => {
  const input = await filed()
  const originalData = artifacts('green')
  await latest(input, { ...originalData, commit: 'c'.repeat(64) })
  const current = await officeRequest({ method: 'GET', path: `/api/records/${input.evidence.recordId}` })
  expect(current.body).toContain('<a key, not shown>')
  const accepted = await verify(input)
  expect(accepted.receipt).toEqual(originalData)
  expect(accepted.original).toMatchObject({ seq: 1, contentHash: input.evidence.contentHash, content: { data: { commit } } })
})

it('does not run a configured Git filesystem monitor during a read', async () => {
  const input = await filed()
  const hook = join(root, 'made-up-fsmonitor')
  const marker = join(root, 'monitor-was-run')
  writeFileSync(hook, `#!/bin/sh\nprintf 'Made-up monitor ran' > '${marker}'\nprintf 'fixture-token\\000'\n`)
  chmodSync(hook, 0o700)
  git('-C', clone, 'config', 'core.fsmonitor', hook)
  await verify(input)
  expect(existsSync(marker)).toBe(false)
})

it('requires independent clone Git storage instead of alternates, shared object hard links or a shared Git directory', async () => {
  const input = await filed()
  const alternates = join(clone, '.git', 'objects', 'info', 'alternates')
  writeFileSync(alternates, `${join(repository, '.git', 'objects')}\n`)
  await expect(verify(input)).rejects.toThrow('independent Git storage')
  rmSync(alternates)
  linkSync(join(clone, '.git', 'objects', 'pack', readdirSync(join(clone, '.git', 'objects', 'pack'))[0]!), join(root, 'shared-object'))
  await expect(verify(input)).rejects.toThrow('shared object hard links')
  rmSync(join(root, 'shared-object'))
  renameSync(join(clone, '.git'), join(attempt, 'own-git-kept'))
  writeFileSync(join(clone, '.git'), `gitdir: ${join(repository, '.git')}\n`)
  await expect(verify(input)).rejects.toThrow('regular directory')
})

it('rejects a non-original sequence, wrong pinned hash and malformed original revision identity', async () => {
  const input = await filed()
  await expect(verify({ ...input, evidence: { ...input.evidence, seq: 2 } })).rejects.toThrow('original sequence 1')
  await expect(verify({ ...input, evidence: { ...input.evidence, contentHash: '0'.repeat(16) } })).rejects.toThrow('pinned revision')
  for (const patch of [{ op: 'edit' }, { seq: 2 }, { recordId: 'other' }, { who: { actorType: 'human', actorId: 'fixture', sessionId: 'fixture' } }, { who: { actorType: 'agent', actorId: '', sessionId: null } }, { content: { kind: 'note', data: {}, deletedAt: null } }, { content: { kind: 'whole_suite_receipt', data: {}, deletedAt: '2026-10-13 10:00:00' } }]) {
    await expect(verifyUpgradeEvidence(input, { officeRequest: async (asked: ARequest) => {
      const reply = await officeRequest(asked)
      return { ...reply, body: JSON.stringify({ ...JSON.parse(reply.body), ...patch }) }
    } })).rejects.toThrow('pinned revision')
  }
})

it('requires authored current provenance and an undeleted receipt', async () => {
  const input = await filed()
  for (const patch of [{ origin: 'fixture' }, { origin: null }, { deletedAt: '2026-10-13 10:00:00' }, { kind: 'note' }, { id: 'other' }]) {
    await expect(verifyUpgradeEvidence(input, { officeRequest: async (asked: ARequest) => {
      const reply = await officeRequest(asked)
      if (asked.path.endsWith('/1')) return reply
      const value = JSON.parse(reply.body)
      return { ...reply, body: JSON.stringify({ ...value, record: { ...value.record, ...patch } }) }
    } })).rejects.toThrow('provenance')
  }
})

it('rejects missing status, non-200 status, redirects, cuts, masking and non-object JSON transport', async () => {
  const input = await filed()
  const good = await officeRequest({ method: 'GET', path: `/api/records/${input.evidence.recordId}/revisions/1` })
  for (const patch of [{ status: undefined }, { status: '200' }, { status: 201 }, { status: 302, location: 'http://elsewhere.invalid' }, { status: 403 }, { cut: undefined }, { cut: 'false' }, { cut: true }, { location: undefined }]) {
    await expect(verifyUpgradeEvidence(input, { officeRequest: async () => ({ ...good, ...patch }) })).rejects.toThrow('transport envelope')
  }
  for (const body of ['[]', 'null', '{', good.body.replace(commit, '<a key, not shown>')]) {
    await expect(verifyUpgradeEvidence(input, { officeRequest: async () => ({ ...good, body }) })).rejects.toThrow(/JSON|masked/)
  }
})

/**
 * A made-up whole run red in tests/one.test.ts, with so many made-up failed assertions that its receipt is longer than
 * the request helper hands back by default. Nothing here is an observed suite.
 */
function aLongRedReceipt(): WholeSuiteReceipt {
  artifacts('red')
  const failed = Array.from({ length: Math.ceil(THE_LONGEST_REPLY / 100) }, (_, n) => ({
    fullName: `Made-up failed assertion ${String(n + 1).padStart(4, '0')} in tests/one.test.ts, with a long name so that the receipt is long`, status: 'failed' }))
  writeJson(paths.report, { success: false, numTotalTests: failed.length + 1, numPassedTests: 1, numFailedTests: failed.length, numPendingTests: 0, numTodoTests: 0,
    numTotalTestSuites: 2, numPassedTestSuites: 1, numFailedTestSuites: 1, numPendingTestSuites: 0,
    testResults: [{ name: join(clone, 'tests/one.test.ts'), status: 'failed', assertionResults: failed },
      { name: join(clone, 'tests/two.test.ts'), status: 'passed', assertionResults: [{ fullName: 'Made-up assertion in tests/two.test.ts', status: 'passed' }] }] })
  return receiptFromArtifacts({ repository, commit, tree, clone, paths, result, startedAt: '2026-10-13 10:00:00', endedAt: '2026-10-13 10:01:00' })
}

it('reads a receipt longer than the default reply whole through the producer transport, and the producer check takes it', async () => {
  const data = aLongRedReceipt()
  const input = await filed(data)
  const path = `/api/records/${input.evidence.recordId}/revisions/1`
  expect((await officeRequest({ method: 'GET', path })).cut, 'the made-up receipt is longer than the request helper hands back by default').toBe(true)
  expect((await readReceiptEvidenceObject(producer, path)).content.data).toEqual(data)
  await expect(readOriginalReceipt(input.evidence.recordId, { officeRequest: producer })).resolves.toMatchObject({ evidence: input.evidence })
  await expect(verifyOriginalReceiptEvidence(input, { officeRequest: producer })).resolves.toMatchObject({ receipt: data, complete: true, green: false, outcome: 'red' })
  await expect(verifyUpgradeEvidence(input, { officeRequest: producer }), 'the upgrade evidence step reads it whole and refuses it only as red').rejects.toThrow('not green')
  expect(theLongestReceiptReply, 'the evidence module asks for more than the default reply').toBeGreaterThan(THE_LONGEST_REPLY)
})

it('still refuses a receipt answer that is cut at the longer reply', async () => {
  const input = await filed(aLongRedReceipt())
  const path = `/api/records/${input.evidence.recordId}/revisions/1`
  const longerThanItAsks: typeof fetch = async (url, options) => {
    const answered = await throughTheMadeUpOffice(url, options)
    // Spaces after the JSON leave it readable, so only the cut can refuse it.
    return new Response(`${await answered.text()}${' '.repeat(theLongestReceiptReply)}`, { status: answered.status })
  }
  const cut = (asked: ARequest & { longestReply?: number }) => producerOfficeRequest(asked, env, longerThanItAsks)
  expect((await cut({ method: 'GET', path, longestReply: theLongestReceiptReply })).cut).toBe(true)
  await expect(readReceiptEvidenceObject(cut, path)).rejects.toThrow('transport envelope')
  await expect(verifyOriginalReceiptEvidence(input, { officeRequest: cut })).rejects.toThrow('transport envelope')
})

it('requires exact repository, full target commit, actual tree and main ancestry', async () => {
  const data = artifacts('green')
  for (const changed of [{ ...data, repository: clone }, { ...data, commit: 'a'.repeat(40) }, { ...data, tree: 'b'.repeat(40) }]) {
    const input = await filed(changed)
    await expect(verify(input)).rejects.toThrow('differs from the requested target')
  }
  const input = await filed(data)
  await expect(verify({ ...input, commit: commit.slice(0, 12) })).rejects.toThrow('exact full commit')
  git('-C', repository, 'checkout', '-q', '--orphan', 'unrelated')
  git('-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Unrelated history')
  git('-C', repository, 'branch', '-f', 'main', 'HEAD')
  await expect(verify(input)).rejects.toThrow('merge-base --is-ancestor')
})

it('checks actual clone HEAD, tree, tracked changes and untracked files', async () => {
  const input = await filed()
  git('-C', repository, 'config', 'remote.origin.promisor', 'true')
  const beforePromisorReads = calls.length
  await expect(verify(input)).rejects.toThrow(/partial-clone lazy fetching/)
  expect(calls.length).toBe(beforePromisorReads)
  git('-C', repository, 'config', '--unset', 'remote.origin.promisor')
  const filter = join(root, 'synthetic-clean-filter.mjs')
  const marker = join(root, 'clean-filter-ran')
  const attributes = join(root, 'synthetic-attributes')
  writeFileSync(filter, `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'Synthetic filter marker');process.stdin.pipe(process.stdout);`)
  writeFileSync(attributes, 'tests/one.test.ts filter=probe\n')
  const command = [process.execPath, filter].map((value) => "'" + value.replaceAll("'", "'\\''") + "'").join(' ')
  git('-C', clone, 'config', 'core.attributesFile', attributes)
  git('-C', clone, 'config', 'filter.probe.clean', command)
  const source = join(clone, 'tests', 'one.test.ts'), time = statSync(source)
  utimesSync(source, time.atime, new Date(time.mtimeMs + 2000))
  await expect(verify(input)).rejects.toThrow(/configured clean\/process filter/)
  expect(existsSync(marker)).toBe(false)
  git('-C', clone, 'config', '--unset', 'filter.probe.clean')
  const callerHome = join(root, 'synthetic-caller-home')
  mkdirSync(callerHome)
  writeFileSync(join(callerHome, 'filters.conf'), `[filter "probe"]\n clean = ${JSON.stringify(command)}\n`)
  git('-C', clone, 'config', 'include.path', '~/filters.conf')
  const previousHome = process.env.HOME
  try {
    process.env.HOME = callerHome
    await expect(verify(input)).resolves.toMatchObject({ receipt: { commit } })
    expect(existsSync(marker)).toBe(false)
  } finally {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    git('-C', clone, 'config', '--unset', 'include.path')
  }
  git('-C', clone, 'config', '--unset', 'core.attributesFile')
  writeFileSync(join(clone, 'untracked'), 'Made-up dirty clone')
  await expect(verify(input)).rejects.toThrow('not clean')
  rmSync(join(clone, 'untracked'))
  writeFileSync(join(clone, 'tests', 'one.test.ts'), 'Changed tracked file')
  await expect(verify(input)).rejects.toThrow('not clean')
  git('-C', clone, 'add', '.')
  git('-C', clone, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Wrong clone commit and tree')
  await expect(verify(input)).rejects.toThrow('clone HEAD or tree')
})

it('compares every rebuilt fact and all artifact hashes, ignoring only allowed short-form metadata', async () => {
  const data = artifacts('green')
  const wrongCount = await filed({ ...data, coverage: { expectedCount: 3, observedCount: 3, missing: [], unexpected: [] } })
  await expect(verify(wrongCount)).rejects.toThrow('recomputed evidence')
  const wrongHash = await filed({ ...data, artifacts: data.artifacts.map((artifact) => ({ ...artifact, sha256Base64: 'A'.repeat(43) + '=' })) })
  await expect(verify(wrongHash)).rejects.toThrow('recomputed evidence')
  const input = await filed(data)
  writeFileSync(join(paths.reads, 'changed'), 'Extra read bytes')
  await expect(verify(input)).rejects.toThrow('recomputed evidence')
  rmSync(join(paths.reads, 'changed'))
  const labelled = await filed({ ...facts(data), shortForms: {} } as WholeSuiteReceipt)
  expect((await verify(labelled)).receipt).toEqual(data)
})

it('refuses inaccessible, displaced and symbolic-link original artifacts or method data', async () => {
  const data = artifacts('green')
  const elsewhere = join(root, 'elsewhere.log')
  writeFileSync(elsewhere, readFileSync(paths.log))
  const displaced = await filed({ ...data, artifacts: data.artifacts.map((artifact) => artifact.name === 'log' ? { ...artifact, path: elsewhere } : artifact) })
  await expect(verify(displaced)).rejects.toThrow('producer layout')
  const input = await filed(data)
  rmSync(paths.log)
  symlinkSync(elsewhere, paths.log)
  await expect(verify(input)).rejects.toThrow(/inaccessible|symbolic|regular/)
  rmSync(paths.log)
  writeFileSync(paths.log, readFileSync(elsewhere))
  rmSync(join(attempt, 'door-result.json'))
  await expect(verify(input)).rejects.toThrow('inaccessible')
})

it('requires original method workers, duration, completed phase and its kept final answer', async () => {
  const input = await filed()
  const good = structuredClone(result)
  for (const patch of [{ workers: 0 }, { workers: undefined }, { wallSec: -1 }, { wallSec: undefined }, { ran: false }, { phase: 'build' }, { commit: 'a'.repeat(40) }]) {
    result = { ...good, answer: { ...good.answer, ...patch } }
    saveResult()
    await expect(verify(input)).rejects.toThrow('original method')
  }
  result = good
  saveResult()
  writeFileSync(result.output, '{}\n')
  await expect(verify(input)).rejects.toThrow('kept final output')
})

it('reads a build-failed receipt that kept only its log, with no reads artifact', async () => {
  rmSync(paths.reads, { recursive: true, force: true })
  rmSync(paths.report, { force: true })
  rmSync(paths.manifest, { force: true })
  writeFileSync(paths.log, 'Made-up cloud output of a failed build. No tests were executed.\n')
  result = { code: 17, answer: { ran: true, code: 17, commit, phase: 'build', buildExitCode: 17, wallSec: 1, workers: 1, files: 0, failed: [] }, output: join(attempt, 'door-output.log') }
  saveResult()
  const data = receiptFromArtifacts({ repository, commit, tree, clone, paths, result, startedAt: '2026-10-13 10:00:00', endedAt: '2026-10-13 10:01:00' })
  expect(data.artifacts.map((artifact) => artifact.name)).toEqual(['log'])
  const input = await filed(data)
  expect(await verifyOriginalReceiptEvidence(input, { officeRequest })).toMatchObject({ complete: true, green: false, outcome: 'build-failed' })
})

it('rebuilds original build, suite, file and assertion evidence instead of accepting hashes alone', async () => {
  const input = await filed()
  result.answer.suiteExitCode = 1
  saveResult()
  await expect(verify(input)).rejects.toThrow('build preceded the suite')
  result.answer.suiteExitCode = 0
  result.answer.files = 99
  saveResult()
  await expect(verify(input)).rejects.toThrow('file coverage')
  result.answer.files = 2
  saveResult()
  const report = JSON.parse(readFileSync(paths.report, 'utf8'))
  report.numPassedTests = 3
  writeJson(paths.report, report)
  await expect(verify(input)).rejects.toThrow('contradictory test counts')
})

/**
 * Version 2: a made-up whole run red in the first of two made-up files, and a made-up run of that file alone on the
 * same box, in the producer's layout. Nothing here is an observed suite.
 */
function artifactsWithARunAlone(alone: 'green' | 'red'): WholeSuiteReceipt {
  artifacts('red')
  writeFileSync(paths.log, 'Made-up cloud output. No tests were executed.\n Test Files  1 failed | 1 passed (2)\n      Tests  1 failed | 1 passed (2)\n   Start at  10:00:00\n   Duration  1.00s\n')
  const folder = join(attempt, 'alone', '1')
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'run.log'), 'Made-up run alone of tests/one.test.ts. No tests were executed.\n')
  const status = alone === 'green' ? 'passed' : 'failed'
  writeJson(join(folder, 'report.json'), { testResults: [{ name: join(clone, 'tests/one.test.ts'), status, assertionResults: [{ fullName: 'Made-up assertion in tests/one.test.ts', status }] }] })
  result.answer.alone = [{ file: 'tests/one.test.ts', n: 1, code: alone === 'green' ? 0 : 1 }]
  saveResult()
  return receiptFromArtifacts({ repository, commit, tree, clone, paths: { ...paths, alone: join(attempt, 'alone') }, result, startedAt: '2026-10-13 10:00:00', endedAt: '2026-10-13 10:01:00', allowsVersion2: true })
}

it('rebuilds a worker-crash receipt with the crash field when stored, and the older receipt without that field', async () => {
  const at = artifactsWithARunAlone('green')
  const report = JSON.parse(readFileSync(paths.report, 'utf8'))
  report.numFailedTests = 0
  report.testResults[0].status = 'passed'
  report.testResults[0].assertionResults[0].status = 'pending'
  writeJson(paths.report, report)
  writeFileSync(paths.log, readFileSync(new URL('./fixtures/stable/worker-crash/suite.txt', import.meta.url), 'utf8'))
  result.answer.failed = []
  saveResult()
  const data = receiptFromArtifacts({ repository, commit, tree, clone, paths: { ...paths, alone: join(attempt, 'alone') }, result, startedAt: at.startedAt, endedAt: at.endedAt, allowsVersion2: true })
  expect(data).toMatchObject({ workerCrashes: [{ file: 'tests/one.test.ts', unfinishedTests: 1 }] })
  for (const keep of [true, false]) {
    const stored = { ...data }
    if (!keep) delete stored.workerCrashes
    const input = await filed(stored)
    expect(await verifyOriginalReceiptEvidence(input, { officeRequest })).toMatchObject({ receipt: stored, complete: true, green: false })
  }
})

it('verifies a receipt that names its skipped cases, and rebuilds an older receipt without that field', async () => {
  const data = artifactsWithSkippedCases()
  expect(data.skippedCases).toEqual({ count: 2, cases: [
    { file: 'tests/two.test.ts', name: 'Made-up skipped assertion a' },
    { file: 'tests/two.test.ts', name: 'Made-up skipped assertion b' },
  ] })
  const input = await filed(data)
  expect((await verify(input)).receipt).toEqual(data)
  const older = { ...artifacts('green') }
  delete older.skippedCases
  const oldInput = await filed(older as WholeSuiteReceipt)
  expect(await verifyOriginalReceiptEvidence(oldInput, { officeRequest })).toMatchObject({ receipt: older, complete: true, green: true })
})

it('takes a version 2 receipt whose file red beside others was green alone, and rebuilds that run alone from its own files', async () => {
  const data = artifactsWithARunAlone('green')
  expect(data).toMatchObject({ version: 2, failedFiles: ['tests/one.test.ts'], aloneRuns: [{ file: 'tests/one.test.ts', outcome: 'green', exitCode: 0 }], errorsOutsideTests: 0 })
  const input = await filed(data)
  expect((await verify(input)).receipt).toEqual(data)
  const report = join(attempt, 'alone', '1', 'report.json')
  const kept = readFileSync(report)
  writeJson(report, { testResults: [] })
  await expect(verify(input)).rejects.toThrow('recomputed evidence')
  writeFileSync(report, kept)
  const log = join(attempt, 'alone', '1', 'run.log')
  const elsewhere = join(root, 'elsewhere-alone.log')
  renameSync(log, elsewhere)
  symlinkSync(elsewhere, log)
  await expect(verify(input)).rejects.toThrow(/inaccessible|symbolic|regular/)
})

it('refuses a version 2 receipt whose file red beside others was red alone', async () => {
  const data = artifactsWithARunAlone('red')
  expect(data).toMatchObject({ version: 2, aloneRuns: [{ file: 'tests/one.test.ts', outcome: 'red', exitCode: 1 }] })
  await expect(verify(await filed(data))).rejects.toThrow('not green')
})

it('takes a version 2 receipt red alone when the authorization note pins a judgement of it that stands, and only then', async () => {
  const input = await filed(artifactsWithARunAlone('red'))
  const receipt = { id: input.evidence.recordId, seq: 1, contentHash: input.evidence.contentHash }
  // This office takes no agent key, so the judgement door would refuse its receipt. The judgement is written as the door
  // writes one, by the person with the person's key: a problem that keeps the file, and the note that names it.
  const thePerson = { type: 'human' as const, id: office.api.HUMAN.id, provedBy: 'the-person-key' as const }
  const problem = office.api.createRecord({ workspaceId: 'default', kind: 'problem', title: 'Made-up problem of a judged file', actor: thePerson, data: {
    state: 'open', whose_move: 'agent', seen_in: ['tests/one.test.ts'], found_by: 'A made-up judgement.', symptom: 'Made up: red when run alone.',
    extra: { judgedFile: { receipt, file: 'tests/one.test.ts', verdict: 'test-fault', line: 'fixture-evidence-reader' } },
  } })
  const judged = office.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Made-up judgement', actor: thePerson, data: { body: 'A made-up judgement.',
    extra: { receiptJudgement: { version: 1, receipt, verdicts: [{ file: 'tests/one.test.ts', verdict: 'test-fault', reason: 'A made-up reason.', problem: problem.id }] } } } })
  const judgement = { id: judged.id, seq: 1, contentHash: JSON.parse((await officeRequest({ method: 'GET', path: `/api/records/${judged.id}/revisions/1` })).body).contentHash as string }
  async function note(extra: object | null) {
    const made = office.api.createRecord({ workspaceId: 'default', kind: 'note', title: `Made-up authorization note ${++fixtureNumber}`, actor: office.api.HUMAN,
      data: { body: 'A made-up notice.', ...(extra === null ? {} : { extra }) } })
    const revision = JSON.parse((await officeRequest({ method: 'GET', path: `/api/records/${made.id}/revisions/1` })).body) as { contentHash: string }
    return { id: made.id, seq: 1, contentHash: revision.contentHash }
  }
  // The real request helper says which project it asks in, and the judgement is read in that project.
  const asked = Object.assign((request: ARequest) => officeRequest(request), { identity: { project: 'default', agent: 'fixture-evidence-reader', session: env.MOLE_OFFICE_SESSION! } })
  const pins = await note({ stableReleaseJudgement: judgement })
  await expect(verifyUpgradeEvidence({ ...input, noticeApproval: pins }, { officeRequest: asked })).resolves.toMatchObject({ judgement, green: false })
  await expect(verifyUpgradeEvidence(input, { officeRequest: asked })).rejects.toThrow('not green')
  await expect(verifyUpgradeEvidence({ ...input, noticeApproval: await note(null) }, { officeRequest: asked })).rejects.toThrow('not green')
  office.api.deleteRecord(judgement.id, office.api.HUMAN)
  // Read by name, so this criterion compiles before the judgement module is there.
  const judgementPath = '../src/shared/receipt-judgement.ts'
  const deleted = (await import(judgementPath)).JUDGEMENT_REFUSALS.deleted as string
  await expect(verifyUpgradeEvidence({ ...input, noticeApproval: pins }, { officeRequest: asked })).rejects.toThrow(deleted)
})

/**
 * THE FILES A RUN CARRIED OVER (point QV-1). The producer carries the red files the receipt before left not run alone
 * into the next run, and the door runs them alone first. The verifier rebuilds such a receipt with those files only once
 * the attempt's carried-over.json is pinned to that receipt's original revision, read again from the office. Every
 * receipt and run here is made up, in this test's own folders and throwaway office. MUTATIONS, each in
 * tools/stable/stable-upgrade-evidence.mjs unless named: dropping carriedOver from the rebuild turns "verifies a receipt
 * made after ..." red; trusting the file without the read again turns it red too, and "refuses carried-over evidence
 * that names another revision ..."; the carriedOverFirst check, "refuses a door answer that says it was given carried-over
 * files ..."; the form check, "refuses a carried-over.json that is not ..."; the regular-file check, its link part; the
 * check against the receipt being verified, the itself part of "another revision"; the files check, "refuses
 * carried-over files that differ ..."; theFilesLeftNotRunAlone in tools/periodic-main-suite.mjs counting another outcome,
 * "verifies a receipt made after ...".
 */
describe('a receipt whose run carried files over', () => {
  const one = 'tests/one.test.ts'
  const two = 'tests/two.test.ts'
  type AloneAnswer = { file: string; n: number; code: number } | { file: string; notRun: string }
  const carriedPath = () => join(attempt, 'carried-over.json')
  const twoLeftNotRun: AloneAnswer[] = [{ file: two, notRun: 'Made up: the time for runs alone ran out.' }]

  /**
   * A made-up whole run red in `red`, whose door ran the red files alone in the order of `alone`, each green alone when it
   * ran. The receipt is built by the producer's own receiptFromArtifacts with `carriedOver`, as the producer builds it.
   */
  function aRedRun(red: string[], alone: AloneAnswer[], { carriedOverFirst, carriedOver = [] }: { carriedOverFirst?: string[]; carriedOver?: string[] } = {}): WholeSuiteReceipt {
    const files = [one, two]
    const counts = `${red.length} failed | ${files.length - red.length} passed (${files.length})`
    writeFileSync(paths.log, `Made-up cloud output. No tests were executed.\n Test Files  ${counts}\n      Tests  ${counts}\n   Start at  10:00:00\n   Duration  1.00s\n`)
    writeJson(paths.manifest, files.map((file) => ({ file: join(clone, file) })))
    writeJson(paths.report, { success: false, numTotalTests: 2, numPassedTests: 2 - red.length, numFailedTests: red.length, numPendingTests: 0, numTodoTests: 0,
      numTotalTestSuites: 2, numPassedTestSuites: 2 - red.length, numFailedTestSuites: red.length, numPendingTestSuites: 0,
      testResults: files.map((file) => ({ name: join(clone, file), status: red.includes(file) ? 'failed' : 'passed', assertionResults: [{ fullName: `Made-up assertion in ${file}`, status: red.includes(file) ? 'failed' : 'passed' }] })) })
    rmSync(join(attempt, 'alone'), { recursive: true, force: true })
    for (const run of alone) {
      if (!('n' in run)) continue
      const folder = join(attempt, 'alone', String(run.n))
      mkdirSync(folder, { recursive: true })
      writeFileSync(join(folder, 'run.log'), `Made-up run alone of ${run.file}. No tests were executed.\n`)
      writeJson(join(folder, 'report.json'), { testResults: [{ name: join(clone, run.file), status: 'passed', assertionResults: [{ fullName: `Made-up assertion in ${run.file}`, status: 'passed' }] }] })
    }
    result = { code: 1, answer: { ran: true, code: 1, commit, phase: 'test', buildExitCode: 0, suiteExitCode: 1, wallSec: 1, workers: 1, files: 2, failed: [...red].sort(), alone, ...(carriedOverFirst === undefined ? {} : { carriedOverFirst }) }, output: join(attempt, 'door-output.log') }
    saveResult()
    // The cast is for tsc: the producer is JavaScript, and its default carriedOver = [] reads as an empty list of nothing.
    return receiptFromArtifacts({ repository, commit, tree, clone, paths: { ...paths, alone: join(attempt, 'alone') }, result, startedAt: '2026-10-13 10:00:00', endedAt: '2026-10-13 10:01:00', allowsVersion2: true, carriedOver: carriedOver as never[] })
  }

  /** The receipt before, which left tests/two.test.ts not run alone, and the receipt after it, whose door ran that file alone first. */
  async function aCarriedRun() {
    const before = await filed(aRedRun([two], twoLeftNotRun))
    const data = aRedRun([one, two], [{ file: two, n: 1, code: 0 }, { file: one, n: 2, code: 0 }], { carriedOverFirst: [two], carriedOver: [two] })
    const after = await filed(data)
    return { before, after, data }
  }

  const keep = (value: unknown): void => writeJson(carriedPath(), value)
  const verifies = (input: Input) => verifyOriginalReceiptEvidence(input, { officeRequest })
  async function refusedWith(input: Input, refusal: keyof typeof CARRIED_OVER_REFUSALS, why: string): Promise<void> {
    const sentence = CARRIED_OVER_REFUSALS[refusal]
    expect(sentence, `the verifier names its ${refusal} refusal`).toMatch(/\S/)
    await expect(verifies(input), why).rejects.toThrow(sentence)
  }
  const twoGets = (input: Input) => [{ method: 'GET', path: `/api/records/${input.evidence.recordId}/revisions/1`, longestReply: theLongestReceiptReply }, { method: 'GET', path: `/api/records/${input.evidence.recordId}`, longestReply: theLongestReceiptReply }]

  it('verifies a receipt made after a receipt with not-run files, rebuilt with those files in their order, read again from the office', async () => {
    const { before, after, data } = await aCarriedRun()
    expect(data, 'the door ran the carried-over file alone first, and the receipt keeps the runs in failedFiles order').toMatchObject({ version: 2, failedFiles: [one, two], aloneRuns: [{ file: one, outcome: 'green' }, { file: two, outcome: 'green' }] })
    keep({ from: before.evidence, files: [two] })
    calls = []
    await expect(verifies(after)).resolves.toMatchObject({ receipt: data, complete: true, green: true, outcome: 'green' })
    expect(calls, 'the receipt before is read again at its original revision').toEqual([...twoGets(after), { method: 'GET', path: `/api/records/${before.evidence.recordId}/revisions/1`, longestReply: theLongestReceiptReply }])
    await expect(verify(after), 'the upgrade evidence step takes it too').resolves.toMatchObject({ green: true })
  })

  it('refuses a door answer that says it was given carried-over files when the attempt keeps no evidence that names any', async () => {
    const { before, after } = await aCarriedRun()
    for (const kept of [undefined, { from: null, files: [] }, { from: { recordId: before.evidence.recordId }, files: [], unreadable: 'Made up: the receipt could not be read.' }, { from: before.evidence, files: [] }]) {
      rmSync(carriedPath(), { force: true })
      if (kept !== undefined) keep(kept)
      await refusedWith(after, 'unpinned', `the carried-over file first, with ${kept === undefined ? 'no carried-over.json' : JSON.stringify(kept)}`)
    }
    // The door answers carriedOverFirst only when it was given files, so an empty one with nothing carried is refused too.
    const sorted = await filed(aRedRun([one, two], [{ file: one, n: 1, code: 0 }, { file: two, n: 2, code: 0 }], { carriedOverFirst: [] }))
    rmSync(carriedPath(), { force: true })
    await refusedWith(sorted, 'unpinned', 'an empty carriedOverFirst with no carried-over.json')
    keep({ from: null, files: [] })
    await refusedWith(sorted, 'unpinned', 'an empty carriedOverFirst with no last receipt')
  })

  it('refuses carried-over evidence that names another revision, a receipt the office does not answer, or the receipt itself', async () => {
    const { before, after } = await aCarriedRun()
    const original = JSON.parse((await officeRequest({ method: 'GET', path: `/api/records/${before.evidence.recordId}/revisions/1` })).body).content.data
    await latest(before, { ...original, endedAt: '2026-10-13 11:00:00' })
    const edited = JSON.parse((await officeRequest({ method: 'GET', path: `/api/records/${before.evidence.recordId}/revisions/2` })).body).contentHash as string
    expect(edited).toMatch(/^[a-f0-9]{16}$/)
    expect(edited).not.toBe(before.evidence.contentHash)
    for (const from of [{ ...before.evidence, seq: 2, contentHash: edited }, { ...before.evidence, contentHash: edited }, { ...before.evidence, seq: 2 }, { ...before.evidence, recordId: 'aReceiptNobodyFiled' }]) {
      keep({ from, files: [two] })
      await refusedWith(after, 'notTheOriginal', `carried-over evidence from ${JSON.stringify(from)}`)
    }
    keep({ from: after.evidence, files: [two] })
    await refusedWith(after, 'itself', 'carried-over evidence that names the receipt being verified')
    keep({ from: before.evidence, files: [two] })
    await expect(verifies(after), 'the same file naming the original verifies').resolves.toMatchObject({ green: true })
  })

  it('refuses carried-over files that differ from the not-run files of the revision they name, in their order', async () => {
    const { before, after } = await aCarriedRun()
    for (const files of [[one], [two, one], [two, two]]) {
      keep({ from: before.evidence, files })
      await refusedWith(after, 'notItsFiles', `carried-over files ${files.join(', ')}`)
    }
    // A receipt before that left both files not run alone, in failedFiles order.
    const both = await filed(aRedRun([one, two], [{ file: one, notRun: 'Made up: the time ran out.' }, { file: two, notRun: 'Made up: the time ran out.' }]))
    const { after: later } = await aCarriedRun()
    keep({ from: both.evidence, files: [two, one] })
    await refusedWith(later, 'notItsFiles', 'the files the receipt before left, in another order')
  })

  it('refuses a carried-over.json that is not one of the three forms the producer writes, and one that is a link', async () => {
    const { before, after } = await aCarriedRun()
    const good = { from: before.evidence, files: [two] }
    for (const kept of [[], null, { from: null, files: [two] }, { from: before.evidence, files: two }, { from: { recordId: before.evidence.recordId }, files: [] }, { from: { recordId: before.evidence.recordId }, files: [], unreadable: '' },
      { ...good, extra: true }, { ...good, from: { ...before.evidence, seq: '1' } }, { ...good, from: { ...before.evidence, contentHash: 'not a hash' } }, { ...good, files: [''] }]) {
      keep(kept)
      await refusedWith(after, 'notAForm', `carried-over.json holding ${JSON.stringify(kept)}`)
    }
    writeFileSync(carriedPath(), 'Made up: not JSON.\n')
    await refusedWith(after, 'notAForm', 'a carried-over.json that is not JSON')
    const elsewhere = join(root, 'elsewhere-carried-over.json')
    writeJson(elsewhere, good)
    rmSync(carriedPath())
    symlinkSync(elsewhere, carriedPath())
    await expect(verifies(after), 'a link to the same bytes').rejects.toThrow()
    rmSync(carriedPath())
    writeFileSync(carriedPath(), readFileSync(elsewhere))
    await expect(verifies(after), 'the same bytes as a regular file').resolves.toMatchObject({ green: true })
  })

  it('verifies a receipt with nothing carried over exactly as before, with no file, no last receipt, an unreadable one, or one that left none', async () => {
    const left = await filed(artifacts('green'))
    const data = aRedRun([one, two], [{ file: one, n: 1, code: 0 }, { file: two, n: 2, code: 0 }])
    const input = await filed(data)
    for (const kept of [undefined, { from: null, files: [] }, { from: { recordId: 'aReceiptNobodyFiled' }, files: [], unreadable: 'Made up: the receipt could not be read.' }, { from: left.evidence, files: [] }]) {
      rmSync(carriedPath(), { force: true })
      if (kept !== undefined) keep(kept)
      calls = []
      await expect(verifies(input), `nothing carried, with ${kept === undefined ? 'no carried-over.json' : JSON.stringify(kept)}`).resolves.toMatchObject({ receipt: data, complete: true, green: true })
      expect(calls, 'no receipt before is read').toEqual(twoGets(input))
    }
  })
})

/**
 * A RECEIPT WITH TESTS MISSING READS INCOMPLETE IN THE VERIFIER. Case 6, and the verifier's half of case 7, of
 * tests/a-receipt-with-tests-missing-reads-incomplete-everywhere.test.ts. The verifier answers, for the receipt it
 * rebuilt, the outcome wholeSuiteReceiptOutcome gives; complete exactly when that outcome is not incomplete; and green by
 * wholeSuiteReceiptIsGreen. The guard's half is at the end of tests/main-suite-fix-records.test.ts. Both halves pin each
 * receipt to the same function and the same word, so the guard and the verifier agree on every receipt both can be given.
 * The verifier cannot be given three of cases 1 to 4 and 8. Case 2's failed build that carries suite evidence, with
 * whole coverage or not: the producer never writes one, and the parse refuses it. Case 4's suite that exited 0 with an
 * artifact missing: the producer's rebuilt receipt keeps every artifact, so the stored one differs from it and is refused.
 * Case 8's complete receipt with no suite exit: the producer always writes the suite exit after a build that exited 0.
 * Case 10 writes the verifier's answer as it was before the outcome moved into wholeSuiteReceiptOutcome, so a past
 * upgrade's kept outcome reads the same when it is checked again.
 */
describe('a receipt with tests missing reads incomplete in the verifier', () => {
  // Read by name, so this criterion compiles before the export is there.
  const outcomeModule = '../src/shared/whole-suite-receipt.ts'
  let wholeSuiteReceiptOutcome: (data: unknown) => string
  let wholeSuiteReceiptIsGreen: (data: unknown) => boolean
  beforeAll(async () => {
    ({ wholeSuiteReceiptOutcome, wholeSuiteReceiptIsGreen } = await import(outcomeModule) as { wholeSuiteReceiptOutcome: typeof wholeSuiteReceiptOutcome; wholeSuiteReceiptIsGreen: typeof wholeSuiteReceiptIsGreen })
  })

  /** A made-up whole run in which the build exited 0 and the suite exited 1, and the manifest's one test file was never seen. */
  function aSuiteWithItsTestMissing(): WholeSuiteReceipt {
    writeFileSync(paths.log, 'Made-up cloud output. No tests were executed.\n')
    writeJson(paths.manifest, [{ file: join(clone, 'tests/one.test.ts') }])
    writeJson(paths.report, { success: false, numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
      numTotalTestSuites: 0, numPassedTestSuites: 0, numFailedTestSuites: 0, numPendingTestSuites: 0, testResults: [] })
    result = { code: 1, answer: { ran: true, code: 1, commit, phase: 'test', buildExitCode: 0, suiteExitCode: 1, wallSec: 1, workers: 1, files: 0, failed: [] }, output: join(attempt, 'door-output.log') }
    saveResult()
    return receiptFromArtifacts({ repository, commit, tree, clone, paths, result, startedAt: '2026-10-13 10:00:00', endedAt: '2026-10-13 10:01:00' })
  }
  /** A made-up failed build as the producer writes it: only its log, and no suite files beside it. */
  function aFailedBuild(): WholeSuiteReceipt {
    for (const path of [paths.reads, paths.report, paths.manifest, join(attempt, 'alone')]) rmSync(path, { recursive: true, force: true })
    writeFileSync(paths.log, 'Made-up cloud output of a failed build. No tests were executed.\n')
    result = { code: 17, answer: { ran: true, code: 17, commit, phase: 'build', buildExitCode: 17, wallSec: 1, workers: 1, files: 0, failed: [] }, output: join(attempt, 'door-output.log') }
    saveResult()
    return receiptFromArtifacts({ repository, commit, tree, clone, paths, result, startedAt: '2026-10-13 10:00:00', endedAt: '2026-10-13 10:01:00' })
  }
  /** Files the receipt, verifies it while its files are on disk, and answers the verifier's outcome. */
  async function theVerifierReads(data: WholeSuiteReceipt, name: string): Promise<string> {
    const verified = await verifyOriginalReceiptEvidence(await filed(data), { officeRequest })
    expect(verified.receipt, name).toEqual(data)
    expect(verified.outcome, `${name}: the outcome wholeSuiteReceiptOutcome reads`).toBe(wholeSuiteReceiptOutcome(data))
    expect(verified.complete, `${name}: complete is every outcome but incomplete`).toBe(verified.outcome !== 'incomplete')
    expect(verified.green, `${name}: green is the one rule's green`).toBe(wholeSuiteReceiptIsGreen(data))
    return verified.outcome
  }

  it('6. reads a receipt whose build exited 0 and whose suite exited 1, with its one test file never seen, as incomplete', async () => {
    const data = aSuiteWithItsTestMissing()
    expect(data).toMatchObject({ buildExitCode: 0, suiteExitCode: 1, failedFiles: [], failedTests: [], coverage: { expectedCount: 1, observedCount: 0, missing: ['tests/one.test.ts'], unexpected: [] } })
    expect(await theVerifierReads(data, "the problem's case")).toBe('incomplete')
  })

  it('7. reads each receipt of cases 1 to 4 and 8 it can be given as wholeSuiteReceiptOutcome reads it', async () => {
    // Each receipt is verified before the next one's files are written over it.
    expect(await theVerifierReads(aSuiteWithItsTestMissing(), "1, the problem's case")).toBe('incomplete')
    expect(await theVerifierReads(artifacts('green'), '3, version 1 with no failures')).toBe('green')
    expect(await theVerifierReads(artifacts('red'), '3, version 1 with a failed file')).toBe('red')
    expect(await theVerifierReads(artifactsWithARunAlone('green'), '3, version 2 with every run alone green')).toBe('green')
    expect(await theVerifierReads(artifactsWithARunAlone('red'), '3, version 2 with a run alone not green')).toBe('red')
    // Last, because it takes the suite's files away.
    expect(await theVerifierReads(aFailedBuild(), '2, a failed build as the producer writes it, with only its log')).toBe('build-failed')
  })

  it('10. reads a receipt with partial coverage as not complete and incomplete, as it read before', async () => {
    // Green, red and build-failed are pinned the same way above, by value: "reads a packed read record ...", "reads a
    // receipt longer than the default reply ..." and "reads a build-failed receipt ...".
    const data = artifacts('partial')
    expect(data).toMatchObject({ buildExitCode: 0, suiteExitCode: 0, coverage: { expectedCount: 2, observedCount: 1, missing: ['tests/two.test.ts'], unexpected: [] } })
    expect(await verifyOriginalReceiptEvidence(await filed(data), { officeRequest })).toMatchObject({ receipt: data, complete: false, green: false, outcome: 'incomplete' })
  })
})
