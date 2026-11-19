// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every repository, entry, seal, sandbox, office, key and value in this test is made up.
 * Real temporary git trees and real cleanup watchers. The office, the sandbox and the push are explicit stubs.
 *
 * THE MERGE TOOL COUNTS ITS SIX GUARDS WHERE EACH REFUSES (wave 13r round Z2). The rows and who may move them are in
 * tests/the-merge-tool-gate-rows-move-only-as-decided.test.ts. Here, each guard is met for real:
 *   - a pinned commit that is not what its seal sealed: pinGit counts pinned-commit-is-what-was-sealed, then refuses;
 *   - a resolution whose ref is gone or points elsewhere: integrateGit counts resolution-replayed-from-its-own-ref;
 *   - a clone that is gone, at another commit, or outside the sandbox: testGit counts tested-clone-is-the-integrated-result;
 *   - a plugin page whose build in the sandbox gave no result or no answer: at block the landing counts
 *     plugin-pages-built-before-landing and stops with main where it was; at remind, the default, main moves, the landed
 *     step says which page was not built and why, and the landing counts remind once;
 *   - an office not healthy after main moved: at block waitForHealth counts office-healthy-after-landing and stops; at
 *     remind it counts remind, and the landing goes on and says why;
 *   - a withdrawn or superseded entry: the cleanup watcher counts withdrawn-entry-tool-stops once, after its cleanup.
 * A value a row does not allow stops the tool by name and counts nothing. A guard that does not refuse counts nothing.
 *
 * WHAT GOES RED. Control run first. Take out any one count, count at a refusal of another guard, ignore the position,
 * stop the landing at remind, or count a cancelled entry or a tool that finished, and a case here turns red.
 */
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aTestAddress } from './the-test-commit-address.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'

type Ran = { code: number | null; signal: string | null; timedOut: boolean; outFile: string; tail: string; error?: string }
const boundary = vi.hoisted(() => ({
  folder: '',
  logs: [] as string[],
  state: {} as Record<string, any>,
  steps: [] as { name: string; facts: any; detail: any }[],
  counted: [] as unknown[][],
  // How a run in the made-up sandbox ends. Unset, the command runs as it is, in the clone, as the build step does.
  sandboxRun: null as null | ((label: string) => Ran),
  health: 'stubbed' as 'stubbed' | 'real',
  realWaitForHealth: null as null | ((root: string, commit: string) => Promise<any>),
}))
const A_MADE_UP_OFFICE_KEY = 'made-up-office-key'
const PAST_THE_GUARDS = 'Synthetic: the tested step went past its three guards'
vi.mock('../tools/merge-tool/arguments.mjs', async () => ({
  theOwnerContentPatterns: async () => (await import('./the-owners-content-patterns.ts')).THE_PATTERNS,
  withThePairing: (env: Record<string, string | undefined>) => ({ ...env }),
  THE_OFFICE_CONFIGURATION: (await import('../tools/merge-tool/config.mjs')).theOfficeConfiguration({ repository: fileURLToPath(new URL('..', import.meta.url)), commitEmail: (await import('./the-test-commit-address.mjs')).THE_MERGE_TOOLS_TEST_ADDRESS }),
  get WORKDIR() { return join(boundary.folder, 'logs') },
  get LOG() { return join(boundary.folder, 'logs', 'the-merger.log') },
  get STATE_FILE() { return join(boundary.folder, 'logs', 'state.json') },
  get STEPS_FILE() { return join(boundary.folder, 'logs', 'steps.jsonl') },
  THIS_CHECKOUT: fileURLToPath(new URL('..', import.meta.url)),
  ABSENT: 'absent', API: 'http://office.invalid', WORKSPACE: 'synthetic', PINNED_REF_PREFIX: 'refs/synthetic/',
  MIGRATIONS_FOLDER: 'drizzle/', SCRIPT_TIMEOUT_MS: 30_000, SUITE_TIMEOUT_MS: 30_000, RERUN_LIMITS: { timeoutMs: 30_000, idleTimeoutMs: 30_000 },
  MODAL_RUNNER: 'synthetic-modal-runner', THE_REAL_MODAL_RUNNER: 'synthetic-modal-runner',
  GIT_IDENTITY: (await import('./the-test-commit-address.mjs')).aTestIdentity('Synthetic queue', 'fixture'),
  chosen: { as: 'synthetic-merge-tool', session: null, entry: 'synthetic-entry', officeFor: 1, healthFor: 0, pinOnly: false, get sandboxes() { return join(boundary.folder, 'sandbox') } },
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => {
  class MergerFailure extends Error {}
  return {
    MergerFailure,
    ACloneNamesAProgram: class extends MergerFailure {},
    fail: (words: string) => { throw new MergerFailure(words) },
    log: (words: string) => { boundary.logs.push(words) },
    stamp: () => '2026-10-25 00:00:00',
    readState: () => boundary.state,
    readStateAt: () => ({}),
    writeState: (patch: Record<string, any>) => { boundary.state = { ...boundary.state, ...patch }; return boundary.state },
    writeStateAt: () => ({}),
  }
})
vi.mock('../src/config/office-key.mjs', () => ({ theOfficeKey: () => ({ key: 'made-up-office-key' }) }))
vi.mock('../tools/merge-tool/cleanup.mjs', () => ({ startCleanup: () => { throw Error('No cleanup watcher in these fixtures') }, keepForCleanup: () => {}, finishCleanup: async () => {} }))
vi.mock('../tools/merge-tool/push.mjs', () => ({ pushLanded: async () => ({ ok: true, says: 'Synthetic: nothing was pushed.' }) }))
vi.mock('../tools/merge-tool/documents.mjs', () => ({
  theRecordOfMain: () => ({ record: null }), theDocumentsOf: () => ({ none: 'Synthetic code entry' }),
  carryPastDocuments: async () => null, theRecordCarriedForward: () => {}, untilNoOtherLandingOf: async () => {},
}))
vi.mock('../tools/merge-tool/pairs.mjs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  aResultToBorrow: async () => { throw Error(PAST_THE_GUARDS) },
  aBusFor: async () => { throw Error(PAST_THE_GUARDS) },
}))
vi.mock('../tools/merge-tool/office-keeper.mjs', async (importOriginal) => {
  const real = await importOriginal<Record<string, any>>()
  boundary.realWaitForHealth = real['waitForHealth']
  return {
    ...real,
    theSeal: async (entry: any) => entry.machine.seal ?? { git: { files: [] } },
    theSandbox: async () => ({ name: 'synthetic-sandbox', folder: join(boundary.folder, 'sandbox') }),
    step: async (name: string, facts: any, detail: any) => { boundary.steps.push({ name, facts, detail }); return { step: name, state: name === 'landed' ? 'merged' : name, facts } },
    theOfficesRuntime: async () => ({ repository: { path: join(boundary.folder, 'repo') } }),
    waitForHealth: async (root: string, commit: string) => boundary.health === 'real' ? boundary.realWaitForHealth!(root, commit) : { ok: true, says: 'Synthetic: the office is healthy' },
    conflictsAfterLanding: async () => [],
    countAGateMet: async (...args: unknown[]) => { boundary.counted.push(args); return { counted: true } },
    runInSandbox: async (_sandbox: any, label: string, command: string, args: string[], options: any): Promise<Ran> => {
      if (boundary.sandboxRun !== null) return boundary.sandboxRun(label)
      // The boundary is stubbed, not the build: the fixture's own npm script runs in its clone.
      const result = spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', timeout: options.timeoutMs })
      const outFile = join(boundary.folder, 'logs', `${label}.log`)
      writeFileSync(outFile, 'sandbox-start: started {"synthetic":true}\n' + result.stdout + result.stderr)
      return { code: result.status, signal: result.signal, timedOut: false, outFile, tail: (result.stdout + result.stderr).split('\n').slice(-12).join('\n'), ...(result.error ? { error: result.error.message } : {}) }
    },
  }
})
import { integrateGit as replayGitFixture, pinGit } from '../tools/merge-tool/integrate.mjs'
// This fixture measures the replay before it becomes a landing commit.
import { THE_INTEGRATION_A_TEST_GIVES } from './the-integration-reads-a-test-gives.ts'
const integrateGit = (entry: any, options: any = {}) => replayGitFixture(entry, { ...THE_INTEGRATION_A_TEST_GIVES, ...options, landing: false })
import { testGit } from '../tools/merge-tool/testing.mjs'
import * as officeKeeper from '../tools/merge-tool/office-keeper.mjs'
import { wholeSuiteFixRoundIsOn } from '../src/config/whole-suite-red.mjs'
import { pluginPagesPosition } from '../src/config/integration-guards.mjs'
import { landGit as landGitFixture } from '../tools/merge-tool/land.mjs'
const notReached = (name: string) => () => { throw new Error(`Synthetic: ${name} is not reached in this file`) }
const landGit = (entry: any) => landGitFixture(entry, {
  replayOnly: true,
  ask: officeKeeper.ask,
  countAGateMet: officeKeeper.countAGateMet,
  runInSandbox: officeKeeper.runInSandbox,
  step: officeKeeper.step,
  theOfficesRuntime: officeKeeper.theOfficesRuntime,
  theSandbox: officeKeeper.theSandbox,
  waitForHealth: officeKeeper.waitForHealth,
  conflictsAfterLanding: officeKeeper.conflictsAfterLanding,
  theLane: notReached('theLane'),
  sleep: notReached('sleep'),
  wholeSuiteFixRoundIsOn,
  pluginPagesPosition,
})

const PINNED = ['pinned-commit-is-what-was-sealed', 'MOLE_OFFICE_GATE_PINNED_COMMIT_IS_WHAT_WAS_SEALED'] as const
const RESOLUTION = ['resolution-replayed-from-its-own-ref', 'MOLE_OFFICE_GATE_RESOLUTION_REPLAYED_FROM_ITS_OWN_REF'] as const
const TESTED_CLONE = ['tested-clone-is-the-integrated-result', 'MOLE_OFFICE_GATE_TESTED_CLONE_IS_THE_INTEGRATED_RESULT'] as const
const PLUGIN_PAGES = ['plugin-pages-built-before-landing', 'MOLE_OFFICE_GATE_PLUGIN_PAGES_BUILT_BEFORE_LANDING'] as const
const HEALTHY = ['office-healthy-after-landing', 'MOLE_OFFICE_GATE_OFFICE_HEALTHY_AFTER_LANDING'] as const
const WITHDRAWN = 'withdrawn-entry-tool-stops'

function git(root: string, ...args: string[]) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
function write(root: string, path: string, text: string) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
function commit(root: string, message: string) { git(root, 'add', '-A'); git(root, 'commit', '-qm', message); return git(root, 'rev-parse', 'HEAD') }
const countsOf = (id: string) => boundary.counted.filter(([gate]) => gate === id)

/** A made-up main checkout with the files the integrate step reads, and one entry commit on a branch. */
function aRepository() {
  const root = join(boundary.folder, 'repo'); mkdirSync(root)
  git(root, 'init', '-qb', 'main'); git(root, 'config', 'user.name', 'Synthetic fixture'); git(root, 'config', 'user.email', aTestAddress('fixture'))
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

/** A made-up landing: main at M, and Cfinal changing the named plugins, held in a clone inside the entry's sandbox. */
function aLanding(plugins: string[]) {
  const root = join(boundary.folder, 'repo'); mkdirSync(root)
  git(root, 'init', '-qb', 'main'); git(root, 'config', 'user.name', 'Synthetic fixture'); git(root, 'config', 'user.email', aTestAddress('fixture'))
  write(root, 'value.txt', 'base\n'); const M = commit(root, 'Synthetic main')
  for (const id of plugins) {
    write(root, `plugins/${id}/plugin.json`, JSON.stringify({ id, title: 'A made-up plugin' }))
    write(root, `plugins/${id}/index.html`, '<p>A made-up page</p>\n')
  }
  write(root, 'tools/build-a-plugin.mjs', '// Synthetic: the sandbox run is stubbed, so this never runs.\n')
  write(root, 'value.txt', 'landed\n')
  const Cfinal = commit(root, 'Synthetic landing')
  git(root, 'checkout', '-q', '--detach', M)
  const clone = join(boundary.folder, 'sandbox', 'work', 'clone')
  mkdirSync(dirname(clone), { recursive: true }); git(boundary.folder, 'clone', '-q', root, clone); git(clone, 'checkout', '-q', '--detach', Cfinal)
  boundary.state = { integrated: { M, Cfinal, clone } }
  return { root, M, Cfinal, entry: { state: 'landing', changeset: { root } } }
}
/** A run in the made-up sandbox that the launcher never started, as when the sandbox is not running. */
const noResult = (label: string): Ran => {
  const outFile = join(boundary.folder, 'logs', `${label}.log`)
  writeFileSync(outFile, 'sandbox: The sandbox synthetic-sandbox is not running (made up).\n')
  return { code: 1, signal: null, timedOut: false, outFile, tail: 'sandbox: The sandbox synthetic-sandbox is not running (made up).' }
}
/** A run that started and ended with exit 0, and printed no line of its answer. */
const noAnswer = (label: string): Ran => {
  const outFile = join(boundary.folder, 'logs', `${label}.log`)
  writeFileSync(outFile, 'sandbox-start: started {"synthetic":true}\nSynthetic build output\n')
  return { code: 0, signal: null, timedOut: false, outFile, tail: 'Synthetic build output' }
}
/** A run that started and said, as its answer, that the page was not built: a failed build, which is no refusal. */
const notBuilt = (label: string): Ran => {
  const outFile = join(boundary.folder, 'logs', `${label}.log`)
  const id = label.replace(/^plugin-page-/, '')
  writeFileSync(outFile, `sandbox-start: started {"synthetic":true}\n${JSON.stringify({ plugin: id, built: false, says: 'Synthetic: the build failed' })}\n`)
  return { code: 1, signal: null, timedOut: false, outFile, tail: '' }
}

/** The office the real waitForHealth asks: its health answers `health`, and the gate count door answers 200. */
const theOfficeAsked: { url: string; method: string; body: any; key: string | null }[] = []
function aStubbedOffice(health: { status: number; body: unknown }, runtime: unknown = null) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>
    theOfficeAsked.push({ url: String(url), method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : null, key: headers[KEY_HEADER] ?? null })
    const path = new URL(String(url)).pathname
    const reply = path === '/api/health' ? health : path === '/api/runtime' ? { status: runtime === null ? 404 : 200, body: runtime ?? { error: 'Synthetic' } } : path.startsWith('/api/office/gates/') ? { status: 200, body: { gate: 'synthetic' } } : { status: 404, body: { error: 'Synthetic: no such door' } }
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } })
  }))
}
const countsSent = () => theOfficeAsked.filter(one => one.method === 'POST' && one.url.includes('/api/office/gates/'))

describe('the merge tool\'s guards, met in its steps', () => {
  beforeEach(() => {
    boundary.folder = mkdtempSync(join(tmpdir(), 'merge-tool-gates-'))
    mkdirSync(join(boundary.folder, 'logs'))
    boundary.logs = []; boundary.state = {}; boundary.steps = []; boundary.counted = []; boundary.sandboxRun = null; boundary.health = 'stubbed'
    theOfficeAsked.length = 0
    // No saved office choice is read: the database the settings would open is a file that is not there.
    vi.stubEnv('MOLE_OFFICE_DB', join(boundary.folder, 'no-database-here', 'mole-office.db'))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    rmSync(boundary.folder, { recursive: true, force: true })
  })

  // QI-02. Mutation: take out the count, or count at the base refusal too, and this turns red.
  it('counts a pinned commit that is not what its seal sealed, at block, and not a base that is no ancestor', async () => {
    const { root, base, tip } = aRepository()
    const sealed = (hash: string) => anEntry(root, base, tip, { seal: { git: { commit: tip, files: [{ path: 'src/own.txt', hash }] } } })
    await expect(pinGit(sealed('a'.repeat(64)), THE_INTEGRATION_A_TEST_GIVES)).rejects.toThrow(`Commit ${tip} is not what seal synthetic-seal sealed`)
    expect(boundary.counted).toEqual([[PINNED[0], 'block']])
    expect(spawnSync('git', ['-C', root, 'rev-parse', '--verify', '-q', 'refs/synthetic/synthetic-entry']).status).not.toBe(0)
    boundary.counted = []
    const notAnAncestor = { ...sealed('a'.repeat(64)), changeset: { root, base: tip, commit: base } }
    await expect(pinGit({ ...notAnAncestor, machine: { judged: {}, seal: { git: { commit: base, files: [] } } } }, THE_INTEGRATION_A_TEST_GIVES)).rejects.toThrow('is not an ancestor of the sealed commit')
    expect(boundary.counted).toEqual([])
  })

  // Mutation: read no position where the guard refuses, and this turns red.
  it('stops on a pinned-commit position its row does not allow, and counts nothing', async () => {
    const { root, base, tip } = aRepository()
    vi.stubEnv(PINNED[1], 'remind')
    await expect(pinGit(anEntry(root, base, tip, { seal: { git: { commit: tip, files: [{ path: 'src/own.txt', hash: 'a'.repeat(64) }] } } }), THE_INTEGRATION_A_TEST_GIVES)).rejects.toThrow(new RegExp(`${PINNED[1]} is "remind"`))
    expect(boundary.counted).toEqual([])
  })

  // QI-20. Mutation: take out the count, count a resolution whose ref holds, or read no position, and this turns red.
  it('counts a resolution whose ref is gone or points at another commit, and replays one whose ref holds without a count', async () => {
    const { root, base, tip } = aRepository()
    write(root, 'src/shared.txt', 'main moved\n'); const M = commit(root, 'Synthetic main moved')
    git(root, 'switch', '-qc', 'resolved'); write(root, 'src/own.txt', 'entry\n'); const resolution = commit(root, 'Synthetic resolution on main')
    git(root, 'switch', '-q', 'main')
    const entry = anEntry(root, base, tip, { resolution: { commit: resolution, checked: {} } })
    await expect(integrateGit(entry)).rejects.toThrow(`is commit ${resolution}, and refs/mole-office/resolved/synthetic-entry in ${root} is not there`)
    expect(boundary.counted).toEqual([[RESOLUTION[0], 'block']])
    boundary.counted = []
    git(root, 'update-ref', 'refs/mole-office/resolved/synthetic-entry', M)
    await expect(integrateGit(entry)).rejects.toThrow(`points at ${M}`)
    expect(boundary.counted).toEqual([[RESOLUTION[0], 'block']])
    boundary.counted = []
    vi.stubEnv(RESOLUTION[1], 'off')
    await expect(integrateGit(entry)).rejects.toThrow(new RegExp(`${RESOLUTION[1]} is "off"`))
    expect(boundary.counted).toEqual([])
    vi.stubEnv(RESOLUTION[1], 'block')
    git(root, 'update-ref', 'refs/mole-office/resolved/synthetic-entry', resolution)
    const integrated = await integrateGit(entry)
    expect(integrated.step, JSON.stringify(integrated.facts)).toBe('integrated')
    expect(boundary.logs.join('\n')).toContain(`replaying the resolution its check passed, commit ${resolution}`)
    expect(countsOf(RESOLUTION[0])).toEqual([])
  }, 90_000)

  // QT-02. Mutation: take out any one of the three counts, count a clone that passes, or read no position, and this turns red.
  it('counts each of the tested step\'s three clone refusals at block, and not a clone that passes them', async () => {
    const { root, base, tip } = aRepository()
    const entry = anEntry(root, base, tip)
    await expect(testGit(entry)).rejects.toThrow('Nothing integrated is on disk for entry synthetic-entry')
    expect(boundary.counted).toEqual([[TESTED_CLONE[0], 'block']])
    const clone = join(boundary.folder, 'sandbox', 'work', 'clone')
    mkdirSync(dirname(clone), { recursive: true }); git(boundary.folder, 'clone', '-q', root, clone); git(clone, 'checkout', '-q', '--detach', base)
    boundary.state = { integrated: { M: base, Cfinal: tip, clone } }; boundary.counted = []
    await expect(testGit(entry)).rejects.toThrow(`The clone ${clone} is at ${base}, not at the integrated result ${tip}`)
    expect(boundary.counted).toEqual([[TESTED_CLONE[0], 'block']])
    const elsewhere = join(boundary.folder, 'elsewhere', 'clone')
    mkdirSync(dirname(elsewhere), { recursive: true }); git(boundary.folder, 'clone', '-q', root, elsewhere); git(elsewhere, 'checkout', '-q', '--detach', tip)
    boundary.state = { integrated: { M: base, Cfinal: tip, clone: elsewhere } }; boundary.counted = []
    await expect(testGit(entry)).rejects.toThrow(`The clone ${elsewhere} is not inside the entry's sandbox folder`)
    expect(boundary.counted).toEqual([[TESTED_CLONE[0], 'block']])
    vi.stubEnv(TESTED_CLONE[1], 'remind'); boundary.counted = []
    await expect(testGit(entry)).rejects.toThrow(new RegExp(`${TESTED_CLONE[1]} is "remind"`))
    expect(boundary.counted).toEqual([])
    // The whole-suite fix round stays at its default, off, so the step goes on to borrow a pair's result, which is stubbed.
    vi.stubEnv(TESTED_CLONE[1], 'block'); vi.stubEnv('MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND', '0')
    git(clone, 'checkout', '-q', '--detach', tip)
    boundary.state = { integrated: { M: base, Cfinal: tip, clone } }; boundary.counted = []
    await expect(testGit(entry)).rejects.toThrow(PAST_THE_GUARDS)
    expect(countsOf(TESTED_CLONE[0])).toEqual([])
  }, 60_000)

  // QL-10 at block. Mutation: take out the count, or let the page through at block, and this turns red.
  it('stops a landing at block when a plugin page gave no result or no answer, with main where it was, and counts block', async () => {
    for (const run of [noResult, noAnswer]) {
      rmSync(join(boundary.folder, 'repo'), { recursive: true, force: true }); rmSync(join(boundary.folder, 'sandbox'), { recursive: true, force: true })
      const { root, M, entry } = aLanding(['made-up-plugin'])
      vi.stubEnv(PLUGIN_PAGES[1], 'block'); boundary.sandboxRun = run; boundary.counted = []; boundary.steps = []
      await expect(landGit(entry)).rejects.toThrow(run === noResult ? 'node tools/build-a-plugin.mjs made-up-plugin gave no result in sandbox synthetic-sandbox' : 'could not say whether it built the page')
      expect(boundary.counted).toEqual([[PLUGIN_PAGES[0], 'block']])
      expect(git(root, 'rev-parse', 'HEAD')).toBe(M)
      expect(boundary.state.landing.pluginPages).toBeUndefined()
      expect(boundary.steps).toEqual([])
    }
  }, 60_000)

  // QL-10 at remind, the default. Mutation: stop the landing, leave the reason out, count once per page, or count a
  // failed build, and this turns red.
  it('lands at remind when plugin pages gave no result, says which and why, and counts remind once for the landing', async () => {
    const { root, Cfinal, entry } = aLanding(['made-up-plugin', 'other-made-up-plugin'])
    boundary.sandboxRun = (label) => label.endsWith('other-made-up-plugin') ? noAnswer(label) : noResult(label)
    const landed = await landGit(entry)
    expect(landed.step).toBe('landed')
    expect(git(root, 'rev-parse', 'HEAD')).toBe(Cfinal)
    const says = String(boundary.steps.find(one => one.name === 'landed')!.facts.says)
    expect(says).toContain('the page of the plugin made-up-plugin was NOT built')
    expect(says).toContain('node tools/build-a-plugin.mjs made-up-plugin gave no result in sandbox synthetic-sandbox')
    expect(says).toContain('the page of the plugin other-made-up-plugin was NOT built')
    expect(says).toContain('node tools/build-a-plugin.mjs other-made-up-plugin could not say whether it built the page')
    expect(says).toContain(`${PLUGIN_PAGES[0]} is at remind`)
    expect(boundary.counted).toEqual([[PLUGIN_PAGES[0], 'remind']])
  }, 60_000)

  it('counts nothing for a plugin page whose build failed and said so, which was never this guard\'s to stop', async () => {
    const { root, Cfinal, entry } = aLanding(['made-up-plugin'])
    vi.stubEnv(PLUGIN_PAGES[1], 'block'); boundary.sandboxRun = notBuilt
    await landGit(entry)
    expect(git(root, 'rev-parse', 'HEAD')).toBe(Cfinal)
    expect(String(boundary.steps.find(one => one.name === 'landed')!.facts.says)).toContain('Synthetic: the build failed')
    expect(boundary.counted).toEqual([])
  }, 60_000)

  it('stops on a plugin-page position its row does not allow, with main where it was, and counts nothing', async () => {
    const { root, M, entry } = aLanding(['made-up-plugin'])
    vi.stubEnv(PLUGIN_PAGES[1], 'off'); boundary.sandboxRun = noResult
    await expect(landGit(entry)).rejects.toThrow(new RegExp(`${PLUGIN_PAGES[1]} is "off"`))
    expect(git(root, 'rev-parse', 'HEAD')).toBe(M)
    expect(boundary.counted).toEqual([])
  }, 60_000)

  // QL-11 at block. Mutation: take out the count, or return at block, and this turns red.
  it('stops at block when the office is not healthy after main moved, and sends one count at block with the office key', async () => {
    const { root } = aRepository()
    vi.stubEnv(HEALTHY[1], 'block')
    aStubbedOffice({ status: 503, body: { ok: false } })
    await expect(boundary.realWaitForHealth!(root, 'a'.repeat(40))).rejects.toThrow('was not healthy within 0 seconds after main moved: health answered 503')
    expect(countsSent()).toEqual([{ url: `http://office.invalid/api/office/gates/${HEALTHY[0]}/met`, method: 'POST', body: { position: 'block' }, key: A_MADE_UP_OFFICE_KEY }])
  })

  // QL-11 at remind, the default. Mutation: fail at remind, leave the reason out, or count at block, and this turns red.
  it('goes on at remind when the office is not healthy, says why, and sends one count at remind', async () => {
    const { root } = aRepository()
    aStubbedOffice({ status: 503, body: { ok: false } })
    const health = await boundary.realWaitForHealth!(root, 'a'.repeat(40))
    expect(health.ok).toBe(false)
    expect(health.says).toContain('was not healthy within 0 seconds after main moved: health answered 503')
    expect(health.says).toContain(`${HEALTHY[0]} is at remind`)
    expect(countsSent()).toEqual([{ url: `http://office.invalid/api/office/gates/${HEALTHY[0]}/met`, method: 'POST', body: { position: 'remind' }, key: A_MADE_UP_OFFICE_KEY }])
  })

  it('lands at remind when the office is not healthy after main moved, and the landed step says why', async () => {
    const { root, Cfinal, entry } = aLanding([])
    boundary.health = 'real'
    aStubbedOffice({ status: 503, body: { ok: false } })
    const landed = await landGit(entry)
    expect(landed.step).toBe('landed')
    expect(git(root, 'rev-parse', 'HEAD')).toBe(Cfinal)
    const says = String(boundary.steps.find(one => one.name === 'landed')!.facts.says)
    expect(says).toContain('was not healthy within 0 seconds after main moved')
    expect(says).toContain(`${HEALTHY[0]} is at remind`)
    expect(countsSent().map(one => one.body)).toEqual([{ position: 'remind' }])
  }, 60_000)

  it('counts nothing when the office is healthy, and stops on a health position its row does not allow', async () => {
    const { root } = aRepository()
    aStubbedOffice({ status: 200, body: { ok: true } }, { repository: { path: join(boundary.folder, 'another-checkout') } })
    expect((await boundary.realWaitForHealth!(root, 'a'.repeat(40))).ok).toBe(true)
    expect(countsSent()).toEqual([])
    vi.unstubAllGlobals(); theOfficeAsked.length = 0
    aStubbedOffice({ status: 503, body: { ok: false } })
    vi.stubEnv(HEALTHY[1], 'off')
    await expect(boundary.realWaitForHealth!(root, 'a'.repeat(40))).rejects.toThrow(new RegExp(`${HEALTHY[1]} is "off"`))
    expect(countsSent()).toEqual([])
  })
})

// ============================================================================ QO-10, in a real cleanup watcher

const CLEANUP = join(import.meta.dirname, '..', 'tools', 'merge-tool', 'cleanup.mjs')
const OWN = theProcessAt(process.pid)
const THIS_FILES_GROUP = OWN.here ? OWN.pgid : null

type Asked = { method: string; url: string; body: any; ownerHadEnded: boolean }
type Answers = { state: string; readStatus?: number; countStatus?: number }
/**
 * A MADE-UP OFFICE ON A FREE PORT OF THIS MACHINE, which writes down every request and whether the tool's group had
 * ended when it came. It answers the entry's state with `readStatus`, and the gate count with `countStatus`.
 */
async function aMadeUpOffice(answers: Answers, ownerHadEnded: () => boolean) {
  const asked: Asked[] = []
  const server = createServer((req: IncomingMessage, res) => {
    let text = ''
    req.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')))
    req.on('end', () => {
      asked.push({ method: req.method ?? '', url: req.url ?? '', body: text === '' ? null : JSON.parse(text), ownerHadEnded: ownerHadEnded() })
      const read = answers.readStatus ?? 200
      const count = answers.countStatus ?? 200
      const [status, body] = req.method === 'GET' && req.url === '/api/merge-queue/synthetic-entry' ? (read === 200 ? [200, { entry: { id: 'synthetic-entry', state: answers.state } }] : [read, { error: 'Synthetic: the entry was not given' }])
        : req.method === 'POST' && req.url === `/api/office/gates/${WITHDRAWN}/met` ? (count === 200 ? [200, { gate: WITHDRAWN, position: 'block' }] : [count, { error: 'Synthetic: the count was refused' }])
        : [404, { error: 'Synthetic: no such door' }]
      res.writeHead(status as number, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    })
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  return { api: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, asked, close: () => new Promise<void>((ok) => server.close(() => ok())) }
}

/**
 * A REAL CLEANUP WATCHER with the tool's own group, a sleeping process this case started in a group of its own. It is
 * told about no sandbox and no seat. Its settings name a database file under the case's own folder that is not there,
 * so the only key file it could read cannot exist, and it sends no key.
 */
function aWatcher(folder: string, api: string) {
  const owner = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' })
  if (owner.pid === undefined) throw new Error('sleep did not start')
  const at = theProcessAt(owner.pid)
  if (!at.here || at.startedAt === null || at.pgid !== owner.pid || owner.pid <= 1 || owner.pid === THIS_FILES_GROUP) throw new Error(`the group of ${String(owner.pid)} could not be read: ${JSON.stringify(at)}`)
  const ownerEnded = new Promise<string | null>((ok) => owner.once('exit', (_code, signal) => ok(signal)))
  const log = join(folder, 'cleanup.log')
  const watcher = spawn(process.execPath, [CLEANUP, '--watch'], { detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env, MOLE_OFFICE_DB: join(folder, 'no-database-here', 'mole-office.db') } })
  let said = ''
  watcher.stdout?.on('data', (chunk: Buffer) => (said += chunk.toString('utf8')))
  watcher.stderr?.on('data', (chunk: Buffer) => (said += chunk.toString('utf8')))
  const ended = new Promise<{ code: number | null; said: string }>((ok) => watcher.once('exit', (code) => ok({ code, said })))
  const tell = (message: object) => new Promise<void>((ok, fail) => watcher.send(message, (err) => (err === null ? ok() : fail(err))))
  void tell({ type: 'configure', config: { ownerGroup: owner.pid, ownerGroupStartedAt: at.startedAt, api, entry: 'synthetic-entry', log, headers: {}, launcher: '', identity: [], environment: {} } })
  const stopAll = () => { for (const one of [owner, watcher] as ChildProcess[]) if (one.exitCode === null && one.signalCode === null) one.kill('SIGKILL') }
  return { watcher, tell, ended, ownerEnded, log, stopAll }
}

/** One watcher, its office and its folder, all its own, so the cases run side by side. Everything is stopped at the end. */
async function aCase(answers: Answers, run: (watcher: ReturnType<typeof aWatcher>) => Promise<void>) {
  const folder = mkdtempSync(join(tmpdir(), 'merge-tool-gates-cleanup-'))
  const owner = { ended: false }
  const office = await aMadeUpOffice(answers, () => owner.ended)
  const watcher = aWatcher(folder, office.api)
  void watcher.ownerEnded.then(() => { owner.ended = true })
  try {
    await run(watcher)
    const ended = await watcher.ended
    const ownerSignal = await Promise.race([watcher.ownerEnded, new Promise((ok) => setTimeout(() => ok('still running'), 2000))])
    return { ended, asked: office.asked, log: existsSync(watcher.log) ? readFileSync(watcher.log, 'utf8') : '', ownerSignal }
  } finally {
    watcher.stopAll()
    await office.close()
    rmSync(folder, { recursive: true, force: true })
  }
}
const theCounts = (asked: Asked[]) => asked.filter(one => one.method === 'POST').map(({ method, url, body }) => ({ method, url, body }))
const ONE_COUNT = [{ method: 'POST', url: `/api/office/gates/${WITHDRAWN}/met`, body: { position: 'block' } }]

describe('a withdrawn entry\'s tool stops, counted by the real cleanup watcher', () => {
  // Mutation: take out the count, or count before the cleanup, and this turns red.
  for (const state of ['withdrawn', 'superseded']) {
    it.concurrent(`counts once, after its cleanup, when its look finds the entry ${state}`, async ({ expect }) => {
      const seen = await aCase({ state }, async () => {})
      expect(seen.ended, seen.ended.said).toMatchObject({ code: 0 })
      expect(seen.ownerSignal).toBe('SIGTERM')
      expect(seen.log).toContain(`merge cleanup: entry synthetic-entry is ${state};`)
      expect(theCounts(seen.asked)).toEqual(ONE_COUNT)
      expect(seen.asked.at(-1)).toMatchObject({ method: 'POST', ownerHadEnded: true })
    }, 90_000)
  }

  // Mutation: count every state the watcher stops for, and this turns red.
  it.concurrent('counts nothing when its look finds the entry cancelled, though it still stops the tool', async ({ expect }) => {
    const seen = await aCase({ state: 'cancelled' }, async () => {})
    expect(seen.ended, seen.ended.said).toMatchObject({ code: 0 })
    expect(seen.ownerSignal).toBe('SIGTERM')
    expect(seen.log).toContain('merge cleanup: entry synthetic-entry is cancelled;')
    expect(theCounts(seen.asked)).toEqual([])
  }, 90_000)

  // Mutation: let a refused count change the exit or stop the cleanup, or say nothing of it, and this turns red.
  it.concurrent('cleans up and exits 0 when the office refuses the count, and writes the refusal in its log', async ({ expect }) => {
    const seen = await aCase({ state: 'withdrawn', countStatus: 500 }, async () => {})
    expect(seen.ended, seen.ended.said).toMatchObject({ code: 0 })
    expect(seen.ownerSignal).toBe('SIGTERM')
    expect(seen.log).toContain('merge cleanup: entry synthetic-entry is withdrawn;')
    expect(theCounts(seen.asked)).toEqual(ONE_COUNT)
    const refusal = seen.log.split('\n').find(line => line.includes(WITHDRAWN))
    expect(refusal, seen.log).toContain('500')
  }, 90_000)

  // Mutation: read nothing when the tool's channel closes, or read before the cleanup, and this turns red.
  it.concurrent('reads the entry once after its cleanup when the tool\'s process ends, and counts a withdrawn entry once', async ({ expect }) => {
    const seen = await aCase({ state: 'withdrawn' }, async (one) => { one.watcher.disconnect() })
    expect(seen.ended, seen.ended.said).toMatchObject({ code: 0 })
    expect(seen.ownerSignal).toBe('SIGTERM')
    expect(seen.log).toContain('merge cleanup: merge tool process ended;')
    expect(seen.asked.map(one => [one.method, one.ownerHadEnded])).toEqual([['GET', true], ['POST', true]])
    expect(theCounts(seen.asked)).toEqual(ONE_COUNT)
  }, 90_000)

  it.concurrent('counts nothing when the tool\'s process ends while its entry is still being tested', async ({ expect }) => {
    const seen = await aCase({ state: 'testing' }, async (one) => { one.watcher.disconnect() })
    expect(seen.ended, seen.ended.said).toMatchObject({ code: 0 })
    expect(seen.ownerSignal).toBe('SIGTERM')
    expect(seen.asked.map(one => one.method)).toEqual(['GET'])
  }, 90_000)

  // Mutation: count when the entry could not be read, or let the failed read change the exit, and this turns red.
  it.concurrent('counts nothing and exits 0 when the entry cannot be read after the tool\'s process ends, and says so', async ({ expect }) => {
    const seen = await aCase({ state: 'withdrawn', readStatus: 500 }, async (one) => { one.watcher.disconnect() })
    expect(seen.ended, seen.ended.said).toMatchObject({ code: 0 })
    expect(seen.ownerSignal).toBe('SIGTERM')
    expect(seen.asked.map(one => one.method)).toEqual(['GET'])
    const unread = seen.log.split('\n').find(line => line.includes('/api/merge-queue/synthetic-entry'))
    expect(unread, seen.log).toContain('500')
  }, 90_000)

  // Mutation: read or count when the tool finished by itself, and this turns red.
  it.concurrent('asks the office nothing and counts nothing when the tool finishes by itself', async ({ expect }) => {
    const seen = await aCase({ state: 'withdrawn' }, async (one) => { await one.tell({ type: 'finish' }) })
    expect(seen.ended, seen.ended.said).toMatchObject({ code: 0 })
    expect(seen.log).toContain('merge cleanup: merge tool ended;')
    expect(seen.ownerSignal).toBe('still running')
    expect(seen.asked).toEqual([])
  }, 90_000)
})
