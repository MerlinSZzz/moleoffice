// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INTEGRATION USES WHAT ITS CALLER GIVES.
 *
 * tools/merge-tool/integrate.mjs used to import the five gate readers from src/config/integration-guards.mjs,
 * settingNamed from src/config/settings.mjs and the six office functions from office-keeper.mjs, and read six settings
 * itself. It now takes the six reads and the six office functions from its caller, as tools/the-merger.mjs passes
 * arguments.mjs's THE_INTEGRATION_READS and office-keeper.mjs's own functions. It is off
 * tests/fixtures/merge-tool-modules-not-yet-moved.json.
 *
 * WHAT THIS FILE PROVES:
 * 1. pinGit and integrateGit refuse, as their first statement, with exactly their sentence from THE_INTEGRATION_NEEDS
 *    when given no second argument, {}, a value that is not a function, or the reads with one left out in turn. No
 *    office-keeper function is reached in any of them.
 * 2. pinGit counts a pinned commit that is not what its seal sealed at the position its caller gives, once, and refuses
 *    as the gates test expects.
 * 3. integrateGit's resolution check counts at the position its caller gives, once, and refuses as QI-20's first
 *    refusal does.
 * 6. The office-function refusals: pinGit, integrateGit and regenerateOnTop refuse with exactly
 *    THE_INTEGRATION_NEEDS_THE_OFFICE_FUNCTIONS when an office function they need is not a function, and call none of
 *    the functions given.
 * 7. pinGit takes theSeal, countAGateMet and step from its caller: the seal it is given is read, the step it is given
 *    reports the pin, and no office-keeper function is reached.
 * 8. integrateGit takes ask from its caller: the run it cannot read is refused with the caller's answer, before any
 *    seal is read, and no office-keeper function is reached.
 * 9. integrateGit runs a clean replay to its end on the office functions its caller gives, reaching the office only
 *    through them.
 *
 * THE MOCKS. arguments.mjs, log-and-state.mjs, documents.mjs and office-keeper.mjs are mocked as
 * tests/the-merge-tool-gates-are-counted-rows.test.ts mocks them. Every office-keeper function records that it was
 * reached, so case 1 can say none was. MOLE_OFFICE_DB is a file that is not there, inside this test's own temporary
 * folder, so no saved office choice is read. The git trees are real, made-up and temporary.
 *
 * THE CONTROL AND THE RUNS. Every run is `node tools/run-named-tests.mjs <files>`, and its log and vitest JSON are
 * kept outside the checkout under the log names below.
 * - controls at 0fd1ebc39, before any change: the 17 integrate tests green in three runs of 7, 7 and 3 files, 54, 78
 *   and 19 tests (control-17-a.log, control-17-b.log, control-17-c.log); this file, the bus test, the guard and four
 *   others green, 7 files and 78 tests (control-run4.log).
 * - after commit 1 (76cf13425): the 17 green with the same counts (c1-17-a.log, c1-17-b.log, c1-17-c.log); this file
 *   and the bus test green, 2 files and 13 tests (c1-new-and-bus-2.log).
 * - after commit 3, on its own final tree 2d42e02f3: this file red in cases 5 to 9 and green in 1 to 4, and the bus
 *   test red in cases 1 and 8 and green in 2 to 7; 7 failed and 10 passed, with 10 unhandled rejections from the bus
 *   test's case 1 (c3-final-red.log).
 * - after commit 4 (192c7873f): this file and the bus test green, 2 files and 17 tests (c4-pre-2.log); the seven files
 *   of the control run green, 7 files and 82 tests (c4-proof-a.log); the address, owner-content, commit-address, files
 *   adapter, landing and library-program files green, 7 files and 104 tests (c4-proof-b.log); the 17 green in three
 *   runs of 7, 7 and 3 files, 54, 78 and 19 tests (c4-17-a.log, c4-17-b.log, c4-17-c.log); tests/the-merger.test.ts
 *   green, 1 file and 44 tests (c4-proof-d.log).
 *
 * MUTATION PROOFS (chapter 5 rule 1), on 192c7873f's tree, each restored and the same files green after it:
 * - M1: pinGit's office check taken out: this file red in case 6 only, 8 passed; restore green 9 (m1-red.log,
 *   m1-restore.log).
 * - M2: integrateGit's office check taken out: case 6 only, 8 passed; restore green 9 (m2-red.log, m2-restore.log).
 * - M3: regenerateOnTop's check taken out: case 6 only, 8 passed; restore green 9 (m3-red.log, m3-restore.log).
 * - M4: integrate.mjs's office-keeper import put back: this file red in case 5 only, and the guard red in case 1
 *   naming integrate.mjs -> tools/merge-tool/office-keeper.mjs; restore green 13 (m4-red.log, m4-restore.log).
 * - M5: integrateGit's regenerateOnTop call passes { landingAt } only: case 9 red, round 9's six integrate cases red
 *   and round 20's round B red; restore green 21 (m5-red.log, m5-restore.log).
 * - M6: pairs.mjs's aBusFor regeneration call passes { landingAt } only: case 5 red, one-commit-per-entry's bus case
 *   red, and a-test-new-to-main's cases E, F and G red; restore green 37 (m6-red.log, m6-restore.log).
 * - M7: pairs.mjs's whatTheBusDecides regeneration call passes { landingAt: bus.landingAt } only: case 5 red and
 *   a-test-new-to-main's case G red; restore green 17 (m7-red.log, m7-restore.log).
 * - M8: testing.mjs's aBusFor call without runInSandbox: the bus test's case 8 red only; restore green 8 (m8-red.log,
 *   m8-restore.log).
 * - M9: aBusFor's check without runInSandbox: the bus test's case 1 red only; restore green 8 (m9-red.log,
 *   m9-restore.log).
 * - M10: the-merger.mjs's integrateGit call without ask: this file's case 5 red only; restore green 9 (m10-red.log,
 *   m10-restore.log).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { hashAt } from '../../tools/merge-tool/git.mjs'
import { THE_INTEGRATION_A_TEST_GIVES, THE_INTEGRATION_READS_A_TEST_GIVES } from '../the-integration-reads-a-test-gives.ts'

type Ran = { code: number | null; signal: string | null; timedOut: boolean; outFile: string; tail: string; error?: string }
const boundary = vi.hoisted(() => ({
  folder: '',
  logs: [] as string[],
  state: {} as Record<string, any>,
  steps: [] as { name: string; facts: any; detail: any }[],
  counted: [] as unknown[][],
  officeKeeper: [] as string[],
  sandboxRun: null as null | ((label: string) => Ran),
}))

vi.mock('../../tools/merge-tool/arguments.mjs', async () => ({
  theOwnerContentPatterns: async () => (await import('../the-owners-content-patterns.ts')).THE_PATTERNS,
  withThePairing: (env: Record<string, string | undefined>) => ({ ...env }),
  THE_OFFICE_CONFIGURATION: (await import('../../tools/merge-tool/config.mjs')).theOfficeConfiguration({ repository: fileURLToPath(new URL('../..', import.meta.url)), commitEmail: (await import('../the-test-commit-address.mjs')).THE_MERGE_TOOLS_TEST_ADDRESS }),
  get WORKDIR() { return join(boundary.folder, 'logs') },
  get LOG() { return join(boundary.folder, 'logs', 'the-merger.log') },
  get STATE_FILE() { return join(boundary.folder, 'logs', 'state.json') },
  get STEPS_FILE() { return join(boundary.folder, 'logs', 'steps.jsonl') },
  THIS_CHECKOUT: fileURLToPath(new URL('../..', import.meta.url)),
  ABSENT: 'absent', API: 'http://office.invalid', WORKSPACE: 'synthetic', PINNED_REF_PREFIX: 'refs/synthetic/',
  MIGRATIONS_FOLDER: 'drizzle/', SCRIPT_TIMEOUT_MS: 30_000, SUITE_TIMEOUT_MS: 30_000, RERUN_LIMITS: { timeoutMs: 30_000, idleTimeoutMs: 30_000 },
  MODAL_RUNNER: 'synthetic-modal-runner', THE_REAL_MODAL_RUNNER: 'synthetic-modal-runner',
  GIT_IDENTITY: (await import('../the-test-commit-address.mjs')).aTestIdentity('Synthetic queue', 'fixture'),
  chosen: { as: 'synthetic-merge-tool', session: null, entry: 'synthetic-entry', officeFor: 1, healthFor: 0, pinOnly: false, get sandboxes() { return join(boundary.folder, 'sandbox') } },
}))
vi.mock('../../tools/merge-tool/log-and-state.mjs', () => {
  class MergerFailure extends Error {}
  return {
    MergerFailure,
    ACloneNamesAProgram: class extends MergerFailure {},
    fail: (words: string) => { throw new MergerFailure(words) },
    log: (words: string) => { boundary.logs.push(words) },
    stamp: () => '2026-11-12 00:00:00',
    readState: () => boundary.state,
    readStateAt: () => ({}),
    writeState: (patch: Record<string, any>) => { boundary.state = { ...boundary.state, ...patch }; return boundary.state },
    writeStateAt: () => ({}),
  }
})
vi.mock('../../tools/merge-tool/documents.mjs', () => ({
  theRecordOfMain: () => ({ record: null }),
  theDocumentsOf: () => ({ none: 'Synthetic code entry' }),
}))
vi.mock('../../tools/merge-tool/office-keeper.mjs', async (importOriginal) => {
  const real = await importOriginal<Record<string, any>>()
  const reached = (name: string) => async (...args: unknown[]) => {
    boundary.officeKeeper.push(name)
    return real[name](...args)
  }
  return {
    ...real,
    ask: async (method: string, path: string) => {
      boundary.officeKeeper.push('ask')
      throw new Error(`Synthetic: the office is not asked in this file (${method} ${path}).`)
    },
    theSeal: async (entry: any) => { boundary.officeKeeper.push('theSeal'); return entry.machine.seal ?? { git: { files: [] } } },
    theSandbox: async () => { boundary.officeKeeper.push('theSandbox'); return { name: 'synthetic-sandbox', folder: join(boundary.folder, 'sandbox') } },
    step: async (name: string, facts: any, detail: any) => { boundary.officeKeeper.push('step'); boundary.steps.push({ name, facts, detail }); return { step: name, state: name === 'landed' ? 'merged' : name, facts } },
    theOfficesRuntime: reached('theOfficesRuntime'),
    waitForHealth: async () => { boundary.officeKeeper.push('waitForHealth'); return { ok: true, says: 'Synthetic: the office is healthy' } },
    conflictsAfterLanding: async () => { boundary.officeKeeper.push('conflictsAfterLanding'); return [] },
    countAGateMet: async (...args: unknown[]) => { boundary.officeKeeper.push('countAGateMet'); boundary.counted.push(args); return { counted: true } },
    runInSandbox: async (_sandbox: any, label: string, command: string, args: string[], options: any): Promise<Ran> => {
      boundary.officeKeeper.push('runInSandbox')
      if (boundary.sandboxRun !== null) return boundary.sandboxRun(label)
      const result = spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', timeout: options.timeoutMs })
      const outFile = join(boundary.folder, 'logs', `${label}.log`)
      writeFileSync(outFile, 'sandbox-start: started {"synthetic":true}\n' + result.stdout + result.stderr)
      return { code: result.status, signal: result.signal, timedOut: false, outFile, tail: (result.stdout + result.stderr).split('\n').slice(-12).join('\n'), ...(result.error ? { error: result.error.message } : {}) }
    },
  }
})

const madeFolders: string[] = []

function git(root: string, ...args: string[]) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
function write(root: string, path: string, text: string) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
function commit(root: string, message: string) { git(root, 'add', '-A'); git(root, 'commit', '-qm', message); return git(root, 'rev-parse', 'HEAD') }

/** A made-up main checkout with the files the integrate step reads, and one entry commit on a branch. */
function aRepository() {
  const root = join(boundary.folder, 'repo'); mkdirSync(root)
  git(root, 'init', '-qb', 'main'); git(root, 'config', 'user.name', 'Synthetic fixture'); git(root, 'config', 'user.email', 'fixture@a-made-up-domain.test')
  write(root, '.mole-office/protected.json', JSON.stringify({ protected: [], generated: [] }))
  write(root, 'package.json', JSON.stringify({ private: true, scripts: { build: 'node build.cjs' } }))
  write(root, 'build.cjs', 'process.exit(0)\n')
  write(root, 'src/shared.txt', 'original\n')
  const base = commit(root, 'Synthetic original main')
  git(root, 'switch', '-qc', 'entry'); write(root, 'src/own.txt', 'entry\n'); const tip = commit(root, 'Synthetic entry commit')
  git(root, 'switch', '-q', 'main')
  return { root, base, tip }
}
const anEntry = (root: string, base: string, tip: string, machine: Record<string, unknown> = {}) => ({ id: 'synthetic-entry', changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {}, ...machine } })

/** The message a refused call throws. */
async function theRefusal(run: Promise<unknown>): Promise<string> {
  try {
    await run
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('the integration accepted what it cannot use')
}

/** A sentence that is there and not empty, before a case asks an error to match it. */
function aNonEmptyString(said: unknown): string {
  expect(typeof said, 'the sentence is a string').toBe('string')
  expect((said as string).length, 'the sentence is not empty').toBeGreaterThan(0)
  return said as string
}

let realArguments: Record<string, any>
const aMadeFolder = (starts: string) => { const folder = mkdtempSync(join(tmpdir(), starts)); madeFolders.push(folder); return folder }

afterAll(() => { for (const folder of madeFolders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

beforeAll(async () => {
  // THE REAL ARGUMENTS MODULE READS THE COMMAND LINE WHEN IT LOADS, so it is loaded here with a made-up one, and
  // process.argv is put back at once. The workdir is this test's own folder under the system temporary folder.
  const workdir = aMadeFolder('integration-reads-arguments-')
  const savedArgv = process.argv
  process.argv = ['node', 'made-up-reader', '--entry', 'made-up-entry', '--session', 'made-up-run', '--api', 'http://127.0.0.1:0', '--workdir', workdir]
  try {
    realArguments = await vi.importActual('../../tools/merge-tool/arguments.mjs') as Record<string, any>
  } finally {
    process.argv = savedArgv
  }
})

describe('the integration takes its reads from its caller', () => {
  beforeEach(() => {
    boundary.folder = mkdtempSync(join(tmpdir(), 'integration-reads-'))
    mkdirSync(join(boundary.folder, 'logs'))
    boundary.logs = []; boundary.state = {}; boundary.steps = []; boundary.counted = []; boundary.officeKeeper = []; boundary.sandboxRun = null
    // No saved office choice is read: the database the settings would open is a file that is not there.
    vi.stubEnv('MOLE_OFFICE_DB', join(boundary.folder, 'no-database-here', 'mole-office.db'))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    rmSync(boundary.folder, { recursive: true, force: true })
  })

  it('1. pinGit and integrateGit refuse with exactly their sentence as their first statement, and reach no office-keeper function', async () => {
    // THE FILE LOADS BEFORE THE EXPORT EXISTS: the namespace is read here, and the sentence with Reflect.get.
    const integration = await import('../../tools/merge-tool/integrate.mjs')
    const sentences = Reflect.get(integration, 'THE_INTEGRATION_NEEDS') as Record<string, unknown> | undefined
    expect(sentences, 'the integration names what it needs in THE_INTEGRATION_NEEDS').toBeTypeOf('object')
    const need = {
      pinGit: aNonEmptyString(sentences?.['pinGit']),
      integrateGit: aNonEmptyString(sentences?.['integrateGit']),
    }
    const entry = { id: 'made-up-entry' }
    const refused: Array<['pinGit' | 'integrateGit', Promise<unknown>]> = [
      ['pinGit', integration.pinGit(entry)],
      ['pinGit', integration.pinGit(entry, {})],
      ['pinGit', integration.pinGit(entry, { pinnedCommitPosition: 'not a function' })],
      ['integrateGit', integration.integrateGit(entry)],
      ['integrateGit', integration.integrateGit(entry, { landing: false })],
    ]
    for (const leftOut of ['resolutionRefPosition', 'ownerContentPosition', 'placeholderAddressesPosition', 'integratedBuildPosition', 'commitAddressFallback']) {
      const theRest: Record<string, unknown> = { ...THE_INTEGRATION_READS_A_TEST_GIVES }
      delete theRest[leftOut]
      refused.push(['integrateGit', integration.integrateGit(entry, { ...theRest, landing: false })])
    }
    for (const [name, run] of refused) expect(await theRefusal(run), `the refusal ${name} gives`).toBe(need[name])
    expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
  })

  it('2. pinGit counts at the position its caller gives', async () => {
    const { root, base, tip } = aRepository()
    const sealed = anEntry(root, base, tip, { seal: { git: { commit: tip, files: [{ path: 'src/own.txt', hash: 'a'.repeat(64) }] } } })
    const pinnedCommitPosition = vi.fn(() => 'a-made-up-position')
    await expect(pinGitFor(sealed, { ...THE_INTEGRATION_A_TEST_GIVES, pinnedCommitPosition })).rejects.toThrow(`Commit ${tip} is not what seal synthetic-seal sealed`)
    expect(pinnedCommitPosition, 'the caller\'s pinned-commit reader was read once').toHaveBeenCalledTimes(1)
    expect(boundary.counted).toEqual([['pinned-commit-is-what-was-sealed', 'a-made-up-position']])
  })

  it('3. integrateGit\'s resolution check counts at the position its caller gives', async () => {
    const { root, base, tip } = aRepository()
    write(root, 'src/shared.txt', 'main moved\n'); const M = commit(root, 'Synthetic main moved')
    git(root, 'switch', '-qc', 'resolved'); write(root, 'src/own.txt', 'entry\n'); const resolution = commit(root, 'Synthetic resolution on main')
    git(root, 'switch', '-q', 'main')
    const entry = anEntry(root, base, tip, { resolution: { commit: resolution, checked: {} } })
    const resolutionRefPosition = vi.fn(() => 'a-made-up-position')
    await expect(integrateGitFor(entry, { ...THE_INTEGRATION_A_TEST_GIVES, resolutionRefPosition, landing: false })).rejects.toThrow(`is commit ${resolution}, and refs/mole-office/resolved/synthetic-entry in ${root} is not there`)
    expect(resolutionRefPosition, 'the caller\'s resolution-ref reader was read once').toHaveBeenCalledTimes(1)
    expect(boundary.counted).toEqual([['resolution-replayed-from-its-own-ref', 'a-made-up-position']])
  })


  it('6. the office-function refusals name what the integration needs', async () => {
    const integration = await import('../../tools/merge-tool/integrate.mjs')
    const sentence = aNonEmptyString(Reflect.get(integration, 'THE_INTEGRATION_NEEDS_THE_OFFICE_FUNCTIONS'))
    const standIns: Array<[string, any]> = []
    const aStandIn = (name: string) => {
      const standIn = vi.fn(async () => ({}))
      standIns.push([name, standIn])
      return standIn
    }
    const theOffice = {
      ask: aStandIn('ask'),
      countAGateMet: aStandIn('countAGateMet'),
      runInSandbox: aStandIn('runInSandbox'),
      step: aStandIn('step'),
      theSandbox: aStandIn('theSandbox'),
      theSeal: aStandIn('theSeal'),
    }
    const entry = { id: 'made-up-entry' }
    // EACH CALL IS MADE AND AWAITED BEFORE THE NEXT ONE IS MADE, so no refused promise is left to reject unhandled.
    const refused: Array<[string, () => Promise<unknown>]> = []
    for (const leftOut of ['theSeal', 'countAGateMet', 'step']) {
      const given: Record<string, any> = { ...THE_INTEGRATION_READS_A_TEST_GIVES, theSeal: theOffice.theSeal, countAGateMet: theOffice.countAGateMet, step: theOffice.step }
      delete given[leftOut]
      refused.push([`pinGit without ${leftOut}`, () => integration.pinGit(entry, given)])
    }
    for (const leftOut of ['ask', 'countAGateMet', 'runInSandbox', 'step', 'theSandbox', 'theSeal']) {
      const given: Record<string, any> = { ...THE_INTEGRATION_READS_A_TEST_GIVES, ...theOffice, landing: false }
      delete given[leftOut]
      refused.push([`integrateGit without ${leftOut}`, () => integration.integrateGit(entry, given)])
    }
    refused.push(['regenerateOnTop with no seventh argument', () => integration.regenerateOnTop(null, null, null, [], null, 'made-up-entry')])
    refused.push(['regenerateOnTop with {}', () => integration.regenerateOnTop(null, null, null, [], null, 'made-up-entry', {})])
    refused.push(['regenerateOnTop with { landingAt: null }', () => integration.regenerateOnTop(null, null, null, [], null, 'made-up-entry', { landingAt: null })])
    for (const [what, call] of refused) expect(await theRefusal(call()), `the refusal ${what} gives`).toBe(sentence)
    for (const [name, standIn] of standIns) expect(standIn, `${name} is not called`).not.toHaveBeenCalled()
    expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
  })

  it('7. pinGit uses the theSeal and step its caller gives', async () => {
    const { root, base, tip } = aRepository()
    const sealed = anEntry(root, base, tip, { seal: { git: { commit: tip, files: [{ path: 'src/own.txt', hash: hashAt(root, tip, 'src/own.txt') }] } } })
    const theSeal = vi.fn(async () => (sealed.machine as any).seal)
    const countAGateMet = vi.fn(async () => ({}))
    const step = vi.fn(async (name: string, facts: any, detail: any) => ({ step: name, state: name === 'landed' ? 'merged' : name, facts }))
    const answer = await pinGitFor(sealed, { ...THE_INTEGRATION_READS_A_TEST_GIVES, theSeal, countAGateMet, step })
    expect(answer).toMatchObject({ step: 'pinned', state: 'pinned' })
    expect(theSeal, "the caller's seal is read once with the entry").toHaveBeenCalledTimes(1)
    expect(theSeal).toHaveBeenCalledWith(sealed)
    expect(step, "the caller's step reports the pin once").toHaveBeenCalledTimes(1)
    expect(step.mock.calls[0]?.[0]).toBe('pinned')
    expect(countAGateMet, 'no gate is counted').not.toHaveBeenCalled()
    expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
  })

  it('8. integrateGit uses the ask its caller gives', async () => {
    const { root, base, tip } = aRepository()
    const run = 'a-made-up-run'
    const entry = { id: 'synthetic-entry', run, changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal', hash: 'a'.repeat(64) } }
    const ask = vi.fn(async () => ({ status: 404, body: { error: 'a made-up refusal' } }))
    const theSeal = vi.fn(async () => ({}))
    await expect(integrateGitFor(entry, { ...THE_INTEGRATION_A_TEST_GIVES, ask, theSeal, landing: true })).rejects.toThrow(`The run ${run} is unreadable (404): a made-up refusal. Nothing can land.`)
    expect(ask, "the caller's ask is made once").toHaveBeenCalledTimes(1)
    expect(ask).toHaveBeenCalledWith('GET', `/api/records/${run}`)
    expect(theSeal, 'no seal is read before the run is readable').not.toHaveBeenCalled()
    expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
  })

  it('9. integrateGit runs to its end on what its caller gives', async () => {
    const { root, base, tip } = aRepository()
    const entry = anEntry(root, base, tip)
    const theSealCalled: string[] = []
    const theSandboxCalled: string[] = []
    const stepCalled: string[] = []
    const runInSandboxCalled: string[] = []
    const askCalled: string[] = []
    const countAGateMetCalled: string[] = []
    const theSeal = vi.fn(async (given: any) => { theSealCalled.push('theSeal'); return given.machine.seal ?? { git: { files: [] } } })
    const theSandbox = vi.fn(async () => { theSandboxCalled.push('theSandbox'); return { name: 'synthetic-sandbox', folder: join(boundary.folder, 'sandbox') } })
    const step = vi.fn(async (name: string, facts: any, detail: any) => { stepCalled.push('step'); boundary.steps.push({ name, facts, detail }); return { step: name, state: name === 'landed' ? 'merged' : name, facts } })
    const runInSandbox = vi.fn(async (_sandbox: any, label: string, command: string, args: string[], options: any): Promise<Ran> => {
      runInSandboxCalled.push('runInSandbox')
      const result = spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', timeout: options.timeoutMs })
      const outFile = join(boundary.folder, 'logs', `${label}.log`)
      writeFileSync(outFile, 'sandbox-start: started {"synthetic":true}\n' + result.stdout + result.stderr)
      return { code: result.status, signal: result.signal, timedOut: false, outFile, tail: (result.stdout + result.stderr).split('\n').slice(-12).join('\n'), ...(result.error ? { error: result.error.message } : {}) }
    })
    const ask = vi.fn(async () => { askCalled.push('ask'); return { status: 500, body: { error: 'a made-up answer' } } })
    const countAGateMet = vi.fn(async () => { countAGateMetCalled.push('countAGateMet'); return { counted: true } })
    const answer = await integrateGitFor(entry, { ...THE_INTEGRATION_READS_A_TEST_GIVES, ask, countAGateMet, runInSandbox, step, theSandbox, theSeal, landing: false }) as any
    expect(answer.step, 'a clean replay reaches the integrated step').toBe('integrated')
    expect(theSealCalled.length, 'theSeal was called').toBeGreaterThan(0)
    expect(theSandboxCalled.length, 'theSandbox was called').toBeGreaterThan(0)
    expect(stepCalled.length, 'step was called').toBeGreaterThan(0)
    expect(runInSandboxCalled.length, 'runInSandbox was called').toBeGreaterThan(0)
    expect(boundary.officeKeeper, 'no office-keeper function was reached').toEqual([])
  })
})

/** pinGit as this file calls it, so the file compiles before and after it takes a second argument. */
async function pinGitFor(entry: any, given: any): Promise<unknown> {
  const integration = await import('../../tools/merge-tool/integrate.mjs')
  return integration.pinGit(entry, given)
}
/** integrateGit as this file calls it, so the file compiles before and after it takes the reads. */
async function integrateGitFor(entry: any, given: any): Promise<unknown> {
  const integration = await import('../../tools/merge-tool/integrate.mjs')
  return integration.integrateGit(entry, given)
}
