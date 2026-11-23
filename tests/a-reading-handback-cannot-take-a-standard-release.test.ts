// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A declared standard change goes through the inspector when its hand-back qualifies.
 * Every record, package, line and repository here is made up in a test office.
 * Mutations a reviewer could run: remove the qualifying-run refusal, or refuse the
 * nonqualifying control; each breaks a case.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { STANDARD_KINDS, THE_CHECKS_OF_A_STANDARD_KIND, THE_GATE_OF_A_STANDARD_KIND, aTestLikeFile, aWordFile, theChangedTestFiles, type AStandardChangesFile, type StandardKind } from '../src/shared/standard-change.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const WORKER = 'standard-worker'
const INSPECTOR = 'standard-inspector'
const AS_THE_PERSON = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AS_THE_OWNER = { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const asAgent = (id: string, session?: string): Record<string, string> => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const SETTINGS = STANDARD_KINDS.map((kind) => `MOLE_OFFICE_STANDARD_${kind.toUpperCase().replace('-', '_')}`)

// A FOLDER THIS FILE MAKES, AND A HOME INSIDE IT, so git reads no configuration of the machine's.
const made = mkdtempSync(join(tmpdir(), 'standard-change-door-'))
const lane = join(made, 'lane')

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: join(made, 'no-global-config'), GIT_CONFIG_NOSYSTEM: '1' } }).trim()
}

/** The main branch of the made-up project. */
const MAIN: Record<string, string> = {
  'docs/guide.md': '# A made-up guide\n\nIt says hello.\n',
  'tests/thing.test.ts': "import { it } from 'vitest'\nit('one', () => {})\nit('two', () => {})\n",
  'tests/made-up-helper.ts': 'export const madeUpHelper = 1\n',
  'plugins/made-up/plugin.json': '{ "id": "made-up" }\n',
  'plugins/made-up/src/a.ts': 'export const a = 1\n',
  'src/shared/words/en-made-up.ts': 'export const WORDS = {\n  "made.up": "Hello",\n}\n',
  'src/made-up.ts': 'export const madeUp = 1\n',
}
/** For each kind, the one file a change of that kind edits. */
const INSIDE: Record<StandardKind, string> = {
  'one-plugin': 'plugins/made-up/src/a.ts',
  words: 'src/shared/words/en-made-up.ts',
  tests: 'tests/thing.test.ts',
  documents: 'docs/guide.md',
}
const OUTSIDE = 'src/made-up.ts'

let runs = 0
/** A worktree of the lane on a new branch, with one commit that edits `edits` and deletes `deletes`. */
function aChange(edits: string[], deletes: string[] = []): { at: string; branch: string } {
  runs += 1
  const branch = `run-${String(runs)}`
  const at = join(made, branch)
  git(lane, 'worktree', 'add', '-q', '-b', branch, at, 'main')
  for (const path of edits) writeFileSync(join(at, path), path === INSIDE.tests ? `${MAIN[path]!}it('three', () => {})\n` : `${MAIN[path]!}// changed by ${branch}\n`)
  for (const path of deletes) git(at, 'rm', '-q', path)
  git(at, 'add', '.')
  git(at, 'commit', '-q', '-m', `The made-up change ${branch}`)
  return { at, branch }
}

interface ASealedRun { run: string; seal: string; hash: string; tip: string; at: string; branch: string; files: { path: string; hash: string | null }[] }

/** A worker's run on `change`, sealed through the real finish door with `submission`. */
async function aSealedRun(change: { at: string; branch: string }, submission: Record<string, unknown> = { kind: 'git' }): Promise<ASealedRun> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(WORKER),
    payload: { kind: 'session', title: `A made-up run on ${change.branch}`, data: { state: 'running', servingAgent: WORKER, workingDirectory: change.at, cutFrom: 'main' } },
  })
  expect(created.statusCode, created.body).toBe(201)
  const run = (created.json() as { record: { id: string } }).record.id
  const finished = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent(WORKER), payload: { dataPatch: { state: 'finished', submission } } })
  expect(finished.statusCode, finished.body).toBe(200)
  const seal = String(t.api.getRecord(run)!.data['sealedTip'])
  const sealed = t.api.getRecord(seal)!.data['seal'] as { hash: string; git: { commit: string; files: { path: string; hash: string | null }[] } }
  return { run, seal, hash: sealed.hash, tip: sealed.git.commit, files: sealed.git.files, ...change }
}

/** The seal's changed files as the standard-change rule reads them: a path is deleted when the seal names no blob for it. */
function theChangedFilesOf(sealed: ASealedRun): AStandardChangesFile[] {
  return sealed.files.map((one) => ({ path: one.path, deleted: one.hash === null }))
}

/** What the check tool would send for this run: what it read, what it read of the change, and the checks it ran. */
function theToolsAsk(
  sealed: ASealedRun,
  kind: StandardKind,
  change: Partial<{ removed: string[]; neverStandard: { path: string; why: string }[]; checks: { name: string; code: number | null; argv?: string[] }[] }> = {},
) {
  const changed = sealed.files.filter((one) => one.hash !== null).map((one) => one.path)
  const runnable = theChangedTestFiles(theChangedFilesOf(sealed))
  const named: { name: string; code: number | null; argv?: string[] }[] = THE_CHECKS_OF_A_STANDARD_KIND[kind].filter((name) => name !== 'changed-tests' || runnable.length > 0).map((name) => ({ name, code: 0 }))
  return {
    kind,
    read: { sealKind: 'git', sealId: sealed.seal, sealHash: sealed.hash, worktree: sealed.at, tip: sealed.tip, ofItsOwn: true, says: 'Made up: the check tool read the sealed tree.' },
    toolRead: {
      neverStandard: change.neverStandard ?? [],
      cases: changed.filter(aTestLikeFile).map((path) => ({ path, removed: change.removed ?? [] })),
      words: changed.filter(aWordFile).map((path) => ({ path, plain: true, why: 'Only words changed.' })),
    },
    checks: (change.checks ?? named).map((one) => ({
      name: one.name,
      argv: one.argv ?? (one.name === 'changed-tests' ? ['node', 'tools/run-named-tests.mjs', ...runnable] : ['node', `made-up-${one.name}.mjs`]),
      code: one.code,
      seconds: 1.5,
    })),
  }
}

let checkSession: string
async function ask(run: string, body: unknown, by = INSPECTOR): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/standard`, headers: asAgent(by, by === INSPECTOR ? checkSession : undefined), payload: body as Record<string, unknown> })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** The run's release as stored, or undefined. */
const theReleaseOf = (run: string) => t.api.getRecord(run)!.data['released'] as undefined | { how: string; check: string; report?: string; standard?: { kind: string; why: string; checks: { name: string; code: number }[] } }
const theBodyOf = (message: string): string => String((t.api.getRecord(message)!.data as { body?: unknown })['body'] ?? '')

/** A run declared as `kind`, changing `paths`, that the door must send the ordinary way, with nothing written on it. */
async function goesTheOrdinaryWay(run: string, body: unknown, saying: string | RegExp): Promise<void> {
  const before = JSON.stringify(t.api.getRecord(run)!.data)
  const { code, said } = await ask(run, body)
  expect(code, JSON.stringify(said)).toBe(409)
  expect(String(said['error'])).toMatch(/goes the ordinary way/)
  if (typeof saying === 'string') expect(String(said['error'])).toContain(saying)
  else expect(String(said['error'])).toMatch(saying)
  expect(JSON.stringify(t.api.getRecord(run)!.data), 'nothing is written on the run').toBe(before)
}

async function setTheSwitch(kind: StandardKind, value: '0' | '1' | null): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/office/settings',
    headers: AS_THE_OWNER,
    payload: { changes: [{ name: SETTINGS[STANDARD_KINDS.indexOf(kind)], value }], because: 'Measure the standard-change switch.' },
  })
  expect(reply.statusCode, reply.body).toBe(200)
}

beforeAll(async () => {
  for (const name of SETTINGS) vi.stubEnv(name, undefined)
  git(made, 'init', '-q', '-b', 'main', lane)
  git(lane, 'config', 'user.email', 'fixture@example.invalid')
  git(lane, 'config', 'user.name', 'Made-up standard-change fixture')
  for (const [path, text] of Object.entries(MAIN)) {
    mkdirSync(join(lane, path, '..'), { recursive: true })
    writeFileSync(join(lane, path), text)
  }
  git(lane, 'add', '.')
  git(lane, 'commit', '-q', '-m', 'Made-up baseline')
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'lane-standard', root: lane, actor: { type: 'human', id: THE_PERSON } })
  for (const [headers, payload] of [
    [AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }],
    [AS_THE_PERSON, { handle: INSPECTOR, name: 'Made-up inspector', role: 'inspector' }],
    [asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: WORKER, name: 'Made-up worker', role: 'worker', workArea: ['docs', 'tests', 'plugins', 'src'] }],
  ] as const) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
    expect(reply.statusCode, reply.body).toBe(201)
  }
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(INSPECTOR),
    payload: { kind: 'session', title: 'Made up: the check tool', data: { state: 'running', servingAgent: INSPECTOR, doing: 'Made up: checking' } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  checkSession = (filed.json() as { record: { id: string } }).record.id
})

afterAll(async () => {
  await app?.close()
  t?.close()
  vi.unstubAllEnvs()
  rmSync(made, { recursive: true, force: true })
})


async function configureLines(): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/office/settings', headers: AS_THE_OWNER,
    payload: { changes: [{ name: 'MOLE_OFFICE_LINES_THE_INSPECTOR_ANSWERS', value: 'line-a' }], because: 'Made-up line choice.' } })
  expect(reply.statusCode, reply.body).toBe(200)
}

function attachHandback(run: string, line: string): void {
  const actor = { type: 'human' as const, id: THE_PERSON }
  const point = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'backlog_item', title: 'A made-up point', origin: 'fixture', actor,
    data: { line, number: 'made-up', why: 'Made up.', doneWhen: 'Made up.', state: 'todo' } })
  const task = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'task', title: 'A made-up package', origin: 'fixture', actor, data: {} })
  const pkg = { bundleId: 'made-up-bundle', forTheOutside: 'Made up.', acceptance: 'Made up.',
    parent: { kind: 'decision', id: 'made-up-parent' }, lines: [line], pointIds: [point.id],
    by: { actorType: 'human', actorId: THE_PERSON }, at: '2090-01-01 12:00:00',
    handedBack: [{ by: { actorType: 'agent', actorId: 'made-up-worker' }, at: '2090-01-01 12:00:02', run,
      points: [{ pointId: point.id, outcome: 'done', words: 'Made up.' }] }] }
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.package', json(?)) WHERE id = ?").run(JSON.stringify(pkg), task.id)
}

it('refuses a standard release for an included hand-back and releases an excluded one', async () => {
  await configureLines()
  const included = await aSealedRun(aChange([INSIDE.documents]), { kind: 'git', standard: 'documents' })
  attachHandback(included.run, 'line-a')
  const refused = await ask(included.run, theToolsAsk(included, 'documents'))
  expect(refused.code, JSON.stringify(refused.said)).toBe(409)
  expect(theReleaseOf(included.run)).toBeUndefined()

  const excluded = await aSealedRun(aChange([INSIDE.documents]), { kind: 'git', standard: 'documents' })
  attachHandback(excluded.run, 'line-b')
  const released = await ask(excluded.run, theToolsAsk(excluded, 'documents'))
  expect(released.code, JSON.stringify(released.said)).toBe(201)
  expect(theReleaseOf(excluded.run)).toBeDefined()
}, 120_000)
