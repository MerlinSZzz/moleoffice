// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STANDARD CHANGE IS RELEASED WITHOUT AN INSPECTOR, AND NOTHING ELSE IS. Wave 13r round F, the owner's design of four
 * kinds of standard change: one plugin, words or translations, tests, and documents. A standard change is approved in
 * advance, runs only its own checks and the related tests, needs no inspector, and still goes through the merge queue as
 * today.
 *
 * WHAT IS MEASURED, on a real git repository and a throwaway database; every path, record and check here is made up.
 * A worker's run is sealed through the real finish door, with or without a declared kind, and the inspector's check tool
 * asks POST /api/checks/:run/standard with what it read of the change and the checks it ran:
 *   · each of the four kinds is released when every changed file is of it, the release says which kind and why, and no
 *     message says an inspector checked it;
 *   · each kind goes the ordinary way when one file outside it is added;
 *   · a deleted test file, or a removed test case, is released as the kind it is inside;
 *   · a seal with no declaration goes the ordinary way;
 *   · each kind's switch at off sends that kind the ordinary way;
 *   · a check that did not run, or did not pass, keeps the release back;
 *   · a path the tool names as protected keeps it back;
 *   · only the inspector may ask;
 *   · the seal keeps the declaration, and refuses it where it cannot hold;
 *   · the merge queue judges a standard release at the pin, as it judges an inspector's, and the merge entry's rule
 *     H_RELEASE, which GET /api/kinds/merge_entry serves, says that it does.
 *
 * "The ordinary way" here is a 409 that names why, with nothing written on the run: the check tool then runs the
 * inspector's model as before.
 *
 * MUTATIONS, each after a green control, are in the commit message that meets this file.
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
import { ABSENT } from '../src/shared/merge-queue.ts'
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
const home = join(made, 'home')
const homeBefore = process.env['HOME']
const lane = join(made, 'lane')

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1' } }).trim()
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
  mkdirSync(home, { recursive: true })
  process.env['HOME'] = home
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
  if (homeBefore === undefined) delete process.env['HOME']
  else process.env['HOME'] = homeBefore
  rmSync(made, { recursive: true, force: true })
})

describe('the seal', () => {
  it('keeps a declared kind on a git seal, writes no key for none, and refuses a kind it cannot hold', async () => {
    const declared = await aSealedRun(aChange([INSIDE.documents]), { kind: 'git', standard: 'documents' })
    expect((t.api.getRecord(declared.seal)!.data['seal'] as { standard?: string }).standard).toBe('documents')
    const none = await aSealedRun(aChange([INSIDE.documents]))
    expect(Object.keys(t.api.getRecord(none.seal)!.data['seal'] as object)).not.toContain('standard')
    for (const [submission, saying] of [
      [{ kind: 'git', standard: 'docs' }, 'not one of the standard kinds one-plugin, words, tests, documents'],
      [{ kind: 'records', records: [checkSession], standard: 'documents' }, 'only a git seal'],
    ] as const) {
      const change = aChange([INSIDE.documents])
      const created = await app.inject({
        method: 'POST',
        url: '/api/records',
        headers: asAgent(WORKER),
        payload: { kind: 'session', title: 'A made-up run with a bad declaration', data: { state: 'running', servingAgent: WORKER, workingDirectory: change.at, cutFrom: 'main' } },
      })
      const run = (created.json() as { record: { id: string } }).record.id
      const finished = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent(WORKER), payload: { dataPatch: { state: 'finished', submission } } })
      expect(finished.statusCode, finished.body).toBe(409)
      expect(finished.body).toContain(saying)
      expect(t.api.getRecord(run)!.data['sealedTip']).toBeUndefined()
    }
  })
})

describe('the standard release door', () => {
  it('releases each of the four kinds with no inspector when every changed file is of it, and says which kind and why', async () => {
    for (const kind of STANDARD_KINDS) {
      const sealed = await aSealedRun(aChange([INSIDE[kind]]), { kind: 'git', standard: kind })
      const before = (t.client.sqlite.prepare('SELECT COALESCE(SUM(would_stop), 0) AS n FROM gate_counts WHERE gate = ?').get(THE_GATE_OF_A_STANDARD_KIND[kind]) as { n: number }).n
      const body = theToolsAsk(sealed, kind)
      const { code, said } = await ask(sealed.run, body)
      expect(code, `${kind}: ${JSON.stringify(said)}`).toBe(201)
      const released = theReleaseOf(sealed.run)!
      expect(released.how, kind).toBe('the standard-change rule')
      expect(released.standard, kind).toMatchObject({ kind, checks: body.checks.map((one) => ({ name: one.name, code: one.code })) })
      expect(released.standard!.why, kind).toContain({
        'one-plugin': 'The one changed file is inside plugins/made-up/ and its manifest is unchanged.',
        words: 'The one changed file is a word file in which only words changed.',
        tests: 'The one changed file is under tests/.',
        documents: 'The one changed file is a document.',
      }[kind])
      if (theChangedTestFiles(theChangedFilesOf(sealed)).length === 0) expect(released.standard!.why, kind).toContain('The changed-test selection is empty')
      // THE WORKER'S MESSAGE SAYS WHICH KIND, WHY IT MATCHED, AND THAT NO INSPECTOR READ IT.
      const toTheWorker = theBodyOf(released.check)
      expect(toTheWorker, kind).toContain(`You are released. Your run ${sealed.run} may end.`)
      expect(toTheWorker, kind).toContain(`a standard change of the kind ${kind}`)
      expect(toTheWorker, kind).toContain(released.standard!.why)
      expect(toTheWorker, kind).toContain('No inspector read it.')
      // THE STARTER IS NOT TOLD THAT AN INSPECTOR CHECKED IT.
      const toTheStarter = theBodyOf(released.report!)
      expect(toTheStarter, kind).toContain('Released as a standard change, with no inspector.')
      expect(toTheStarter, kind).not.toContain('Checked and released by')
      const after = (t.client.sqlite.prepare('SELECT COALESCE(SUM(would_stop), 0) AS n FROM gate_counts WHERE gate = ?').get(THE_GATE_OF_A_STANDARD_KIND[kind]) as { n: number }).n
      expect(after, `${kind}: the switch counts the declaration it met`).toBe(before + 1)
    }
  })

  it('sends each kind the ordinary way when one file outside it is added', async () => {
    for (const kind of STANDARD_KINDS) {
      const sealed = await aSealedRun(aChange([INSIDE[kind], OUTSIDE]), { kind: 'git', standard: kind })
      await goesTheOrdinaryWay(sealed.run, theToolsAsk(sealed, kind), kind === 'one-plugin' ? 'not every changed file is inside the folder of one plugin' : OUTSIDE)
    }
  })

  it('releases a deleted test file with no changed-tests check, and a change that removes a case with its changed-tests check', async () => {
    const deleted = await aSealedRun(aChange([], [INSIDE.tests]), { kind: 'git', standard: 'tests' })
    const deletedAsk = theToolsAsk(deleted, 'tests')
    expect(deletedAsk.checks).toEqual([])
    const deletedAnswer = await ask(deleted.run, deletedAsk)
    expect(deletedAnswer.code, JSON.stringify(deletedAnswer.said)).toBe(201)
    const releasedDeleted = theReleaseOf(deleted.run)!
    expect(releasedDeleted.standard!.checks).toEqual([])
    expect(releasedDeleted.standard!.why).toContain('The changed-test selection is empty')
    const removed = await aSealedRun(aChange([INSIDE.tests]), { kind: 'git', standard: 'tests' })
    const removedAsk = theToolsAsk(removed, 'tests', { removed: ['"two"'] })
    expect(removedAsk.checks).toEqual([{ name: 'changed-tests', argv: ['node', 'tools/run-named-tests.mjs', INSIDE.tests], code: 0, seconds: 1.5 }])
    const removedAnswer = await ask(removed.run, removedAsk)
    expect(removedAnswer.code, JSON.stringify(removedAnswer.said)).toBe(201)
    expect(theReleaseOf(removed.run)!.standard!.checks).toEqual([{ name: 'changed-tests', code: 0 }])
  })

  it('sends a seal with no declaration the ordinary way, and an ask for another kind than the one declared', async () => {
    const none = await aSealedRun(aChange([INSIDE.documents]))
    await goesTheOrdinaryWay(none.run, theToolsAsk(none, 'documents'), 'The seal declares no standard kind')
    const other = await aSealedRun(aChange([INSIDE.documents]), { kind: 'git', standard: 'documents' })
    await goesTheOrdinaryWay(other.run, theToolsAsk(other, 'tests'), 'declares documents')
  })

  it('sends each kind the ordinary way while its switch is off, and releases it again once the switch is back on', async () => {
    for (const kind of STANDARD_KINDS) {
      await setTheSwitch(kind, '0')
      const sealed = await aSealedRun(aChange([INSIDE[kind]]), { kind: 'git', standard: kind })
      await goesTheOrdinaryWay(sealed.run, theToolsAsk(sealed, kind), `The switch ${THE_GATE_OF_A_STANDARD_KIND[kind]} is off`)
      await setTheSwitch(kind, null)
      const { code, said } = await ask(sealed.run, theToolsAsk(sealed, kind))
      expect(code, `${kind}: ${JSON.stringify(said)}`).toBe(201)
    }
  })

  it('keeps the release back when a check of the kind did not run, did not pass or did not finish', async () => {
    const sealed = await aSealedRun(aChange([INSIDE['one-plugin']]), { kind: 'git', standard: 'one-plugin' })
    for (const [checks, saying] of [
      [[{ name: 'secret-scan', code: 0 }], 'check-a-plugin did not run'],
      [[{ name: 'check-a-plugin', code: 1 }, { name: 'secret-scan', code: 0 }], 'check-a-plugin exited 1'],
      [[{ name: 'check-a-plugin', code: 0 }, { name: 'secret-scan', code: null }], 'secret-scan did not run to an end'],
    ] as const) {
      await goesTheOrdinaryWay(sealed.run, theToolsAsk(sealed, 'one-plugin', { checks: [...checks] }), saying)
    }
    const tests = await aSealedRun(aChange([INSIDE.tests]), { kind: 'git', standard: 'tests' })
    await goesTheOrdinaryWay(tests.run, theToolsAsk(tests, 'tests', { checks: [] }), 'changed-tests did not run')
  })

  it('releases a helper-only tests change with the empty selection recorded and no test process', async () => {
    const sealed = await aSealedRun(aChange(['tests/made-up-helper.ts']), { kind: 'git', standard: 'tests' })
    const body = theToolsAsk(sealed, 'tests')
    expect(body.checks).toEqual([])
    const { code, said } = await ask(sealed.run, body)
    expect(code, JSON.stringify(said)).toBe(201)
    const released = theReleaseOf(sealed.run)!
    expect(released.standard!.checks).toEqual([])
    expect(released.standard!.why).toContain('The changed-test selection is empty')
    expect(released.standard!.why).toContain("queue's related run")
    const toTheWorker = theBodyOf(released.check)
    expect(toTheWorker).toContain('no test process ran')
    expect(toTheWorker).toContain('It ran no check of its own')
  })

  it('releases a documents-only change with the empty selection recorded', async () => {
    const sealed = await aSealedRun(aChange([INSIDE.documents]), { kind: 'git', standard: 'documents' })
    const body = theToolsAsk(sealed, 'documents')
    expect(body.checks).toEqual([])
    const { code, said } = await ask(sealed.run, body)
    expect(code, JSON.stringify(said)).toBe(201)
    const released = theReleaseOf(sealed.run)!
    expect(released.standard!.checks).toEqual([])
    expect(released.standard!.why).toContain('The changed-test selection is empty')
    expect(theBodyOf(released.check)).toContain('It ran no check of its own')
  })

  it('releases a tests change only when changed-tests names exactly the changed test file', async () => {
    const sealed = await aSealedRun(aChange([INSIDE.tests]), { kind: 'git', standard: 'tests' })
    const good = theToolsAsk(sealed, 'tests')
    expect(good.checks).toEqual([{ name: 'changed-tests', argv: ['node', 'tools/run-named-tests.mjs', INSIDE.tests], code: 0, seconds: 1.5 }])
    await goesTheOrdinaryWay(sealed.run, theToolsAsk(sealed, 'tests', {
      checks: [{ name: 'changed-tests', code: 0, argv: ['node', 'tools/run-named-tests.mjs', 'tests/made-up-other.test.ts'] }],
    }), 'tests/made-up-other.test.ts')
    await goesTheOrdinaryWay(sealed.run, theToolsAsk(sealed, 'tests', { checks: [] }), 'changed-tests did not run')
    const { code, said } = await ask(sealed.run, good)
    expect(code, JSON.stringify(said)).toBe(201)
  })

  it('refuses a changed-tests claim when the seal changes no runnable test file', async () => {
    const sealed = await aSealedRun(aChange([INSIDE.documents]), { kind: 'git', standard: 'documents' })
    await goesTheOrdinaryWay(sealed.run, theToolsAsk(sealed, 'documents', {
      checks: [{ name: 'changed-tests', code: 0, argv: ['node', 'tools/run-named-tests.mjs'] }],
    }), 'no runnable test file')
  })

  it('accepts an older tool\'s related-tests answer in words, only when it names the changed test', async () => {
    const sealed = await aSealedRun(aChange([INSIDE.tests]), { kind: 'git', standard: 'tests' })
    const oldShape = (argv: string[]) => theToolsAsk(sealed, 'tests', { checks: [{ name: 'related-tests', code: 0, argv }] })
    await goesTheOrdinaryWay(sealed.run, oldShape(['node', 'tools/run-named-tests.mjs', '--list', 'related', '--base', 'made-up-base']), 'related-tests')
    const { code, said } = await ask(sealed.run, oldShape(['node', 'tools/run-named-tests.mjs', '--list', 'related', '--base', 'made-up-base', INSIDE.tests]))
    expect(code, JSON.stringify(said)).toBe(201)
    const released = theReleaseOf(sealed.run)!
    expect(released.standard!.checks).toEqual([{ name: 'related-tests', code: 0 }])
    expect(released.standard!.why).toContain('older check tool')
  })

  it('refuses an arbitrary executable prefix even when the file names are right', async () => {
    const sealed = await aSealedRun(aChange([INSIDE.tests]), { kind: 'git', standard: 'tests' })
    await goesTheOrdinaryWay(sealed.run, theToolsAsk(sealed, 'tests', {
      checks: [{ name: 'changed-tests', code: 0, argv: ['echo', 'anything', INSIDE.tests] }],
    }), 'not the named runner')
    const old = await aSealedRun(aChange([INSIDE.tests]), { kind: 'git', standard: 'tests' })
    await goesTheOrdinaryWay(old.run, theToolsAsk(old, 'tests', {
      checks: [{ name: 'related-tests', code: 0, argv: ['echo', 'anything', '--list', 'related', '--base', 'made-up-base', INSIDE.tests] }],
    }), 'not the named runner')
  })

  it('refuses an older related answer when the selection is empty, even one that failed', async () => {
    const sealed = await aSealedRun(aChange(['tests/made-up-helper.ts']), { kind: 'git', standard: 'tests' })
    for (const code of [1, 0]) {
      await goesTheOrdinaryWay(sealed.run, theToolsAsk(sealed, 'tests', {
        checks: [{ name: 'related-tests', code, argv: ['node', 'tools/run-named-tests.mjs', '--list', 'related', '--base', 'made-up-base'] }],
      }), 'older related-tests answer')
    }
    const helper = await aSealedRun(aChange(['tests/made-up-helper.ts']), { kind: 'git', standard: 'tests' })
    const { code, said } = await ask(helper.run, theToolsAsk(helper, 'tests'))
    expect(code, JSON.stringify(said)).toBe(201)
  })

  it('keeps the release back when the tool names a changed path as protected, generated or the queue\'s own code', async () => {
    const sealed = await aSealedRun(aChange([INSIDE.documents]), { kind: 'git', standard: 'documents' })
    const neverStandard = [{ path: INSIDE.documents, why: 'it is protected by docs/ in .mole-office/protected.json' }]
    await goesTheOrdinaryWay(sealed.run, theToolsAsk(sealed, 'documents', { neverStandard }), `${INSIDE.documents} (it is protected by docs/`)
  })

  it('is asked only by the inspector', async () => {
    const sealed = await aSealedRun(aChange([INSIDE.documents]), { kind: 'git', standard: 'documents' })
    const before = JSON.stringify(t.api.getRecord(sealed.run)!.data)
    const { code, said } = await ask(sealed.run, theToolsAsk(sealed, 'documents'), THE_TEST_OFFICES_SECRETARY.handle)
    expect(code, JSON.stringify(said)).toBe(403)
    expect(JSON.stringify(t.api.getRecord(sealed.run)!.data)).toBe(before)
  })
})

describe('the merge queue', () => {
  it('judges a standard release at the pin, as it judges an inspector\'s', async () => {
    const sealed = await aSealedRun(aChange([INSIDE.documents]), { kind: 'git', standard: 'documents' })
    const { code, said } = await ask(sealed.run, theToolsAsk(sealed, 'documents'))
    expect(code, JSON.stringify(said)).toBe(201)
    const submitted = await app.inject({
      method: 'POST',
      url: '/api/merge-queue',
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { run: sealed.run, changeset: { adapter: 'git', repository: 'lane-standard', branch: sealed.branch } },
    })
    expect(submitted.statusCode, submitted.body).toBe(201)
    const entry = String((submitted.json() as { entry: { id: string } }).entry.id)
    const pinned = await app.inject({
      method: 'POST',
      url: `/api/merge-queue/${entry}/step`,
      headers: asAgent('mole-office/the-message-worker'),
      payload: { step: 'pinned', facts: { files: Object.fromEntries(sealed.files.map((one) => [one.path, one.hash ?? ABSENT])) } },
    })
    expect(pinned.statusCode, pinned.body).toBe(200)
    expect((pinned.json() as { entry: { state: string } }).entry.state, pinned.body).toBe('judged')
  })

  it('says so in the merge entry\'s rule H_RELEASE: an inspector\'s release or a standard change\'s judges an entry', async () => {
    const served = await app.inject({ method: 'GET', url: '/api/kinds/merge_entry' })
    expect(served.statusCode, served.body).toBe(200)
    const rule = (served.json().kind.rules as string[]).find((one) => one.startsWith('H_RELEASE:'))
    expect(rule, 'the merge entry has no rule that starts H_RELEASE:').toBeDefined()
    expect(rule).toContain("an inspector's release")
    expect(rule).toContain('a release by the standard-change rule')
    expect(rule).toContain("A starter's own release judges nothing")
  })
})
