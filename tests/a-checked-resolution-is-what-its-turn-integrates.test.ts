// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESOLUTION THE CHECK PASSED IS WHAT THE ENTRY'S TURN INTEGRATES, in tier 2 of the owner's decision , round B, part
 * 5, and answer 1 of XHY2fVFG3Qq8. Once the merge tool's check passed a resolution, it holds
 * that commit at `refs/mole-office/resolved/<entry>` in the lane's repository, and the entry is pinned again. Three
 * parts of the merge tool then read the resolution and not the entry's own commit, because what the entry's own commit
 * meets is no longer what its turn meets.
 *
 * WHAT THIS FILE PROVES:
 * 1. integrateGit replays the resolution from its ref, so an entry whose own commit stops on the conflict integrates the
 *    supervisor's resolution; the same entry without a checked resolution still stops on the conflict.
 * 2. integrateGit refuses, and rebases nothing, when the ref is not there or points at another commit than the one the
 *    office recorded. Each refusal is counted once on the gate the merge tool reads for it.
 * 3. The early-conflict probe after a landing does not probe an entry carrying a checked resolution, and still probes
 *    one that carries none.
 * 4. The bus passes over a rider carrying a checked resolution as tested alone, with its own sentence.
 *
 * The office and the sandbox are stubs, as in tests/the-merge-tool-joins-add-only-conflicts-tier-1.test.ts, whose stubs
 * this copies. The git trees are real, synthetic and temporary, and so is everything the entries hold.
 * MUTATION PROOFS: the commit message of the code records the runs.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aTestAddress } from './the-test-commit-address.mjs'

const boundary = vi.hoisted(() => ({ folder: '', logs: [] as string[], state: {} as Record<string, any>, lane: [] as Record<string, any>[], counted: [] as unknown[][] }))
vi.mock('../tools/merge-tool/arguments.mjs', async () => ({
  theOwnerContentPatterns: async () => (await import('./the-owners-content-patterns.ts')).THE_PATTERNS,
  withThePairing: (env: Record<string, string | undefined>) => ({ ...env }),
  get WORKDIR() { return join(boundary.folder, 'logs') },
  THIS_CHECKOUT: fileURLToPath(new URL('..', import.meta.url)),
  ABSENT: 'absent', API: '', WORKSPACE: 'synthetic', PINNED_REF_PREFIX: 'refs/synthetic/',
  SCRIPT_TIMEOUT_MS: 30_000, SUITE_TIMEOUT_MS: 30_000,
  GIT_IDENTITY: (await import('./the-test-commit-address.mjs')).aTestIdentity('Synthetic queue', 'fixture'),
  chosen: { entry: 'synthCheckedEntry', pinOnly: false, slotEvery: 1, get sandboxes() { return join(boundary.folder, 'sandboxes') } },
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => {
  class MergerFailure extends Error {}
  class ACloneNamesAProgram extends MergerFailure {}
  return {
    MergerFailure, ACloneNamesAProgram, fail: (words: string) => { throw new MergerFailure(words) }, log: (words: string) => boundary.logs.push(words),
    stamp: () => '2026-10-17 00:00:00', writeState: (patch: Record<string, any>) => { boundary.state = patch },
  }
})
vi.mock('../tools/merge-tool/documents.mjs', () => ({ theRecordOfMain: () => ({ record: null }), theDocumentsOf: () => ({ none: 'Synthetic code entry' }), generatedPathsOf: () => [] }))
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  theSeal: async (entry: any) => ({ git: { commit: entry.changeset.commit, files: [] } }),
  theSandbox: async () => { standIn('up', 'merge', '--name', 'synthetic-sandbox', '--from', boundary.folder); return { name: 'synthetic-sandbox', folder: join(boundary.folder, 'sandboxes', 'synthetic-sandbox') } },
  step: async (name: string, facts: Record<string, any>) => ({ step: name, facts }),
  keepTheReport: () => { throw Error('No report copying in these fixtures') },
  runInSandbox: async (_sandbox: any, label: string, command: string, args: string[], options: any) => {
    const result = standIn('exec', 'synthetic-sandbox', '--cwd', options.cwd, '--wait', '--plain-env', '--timeout', '30', '--', command, ...args)
    const outFile = join(boundary.folder, 'logs', label + '.log')
    writeFileSync(outFile, result.stdout + result.stderr)
    return { code: result.status, signal: result.signal, timedOut: false, outFile, tail: (result.stdout + result.stderr).split('\n').slice(-12).join('\n') }
  },
  theLane: async () => boundary.lane,
  sleep: async () => { throw Error('The bus in these fixtures never waits') },
  countAGateMet: async (...args: unknown[]) => { boundary.counted.push(args); return { counted: true } },
}))
function standIn(...args: string[]) {
  const cut = args.indexOf('--') < 0 ? args.length : args.indexOf('--')
  return spawnSync(process.execPath, [join(REPO, 'tests/stand-in-sandbox-tool.mjs'), ...args.slice(0, cut), '--sandboxes', join(boundary.folder, 'sandboxes'), ...args.slice(cut)], { encoding: 'utf8', timeout: 60_000 })
}
import { probeWaitingEntries } from '../tools/merge-tool/early-conflicts.mjs'
import { integrateGit as replayGitFixture } from '../tools/merge-tool/integrate.mjs'
// This fixture measures the replay before it becomes a landing commit.
import { THE_INTEGRATION_A_TEST_GIVES } from './the-integration-reads-a-test-gives.ts'
const integrateGit = (entry: any, options: any = {}) => replayGitFixture(entry, { ...THE_INTEGRATION_A_TEST_GIVES, ...options, landing: false })
import { aBusFor } from '../tools/merge-tool/pairs.mjs'
import * as officeKeeper from '../tools/merge-tool/office-keeper.mjs'
import { resolvedRefOf } from '../src/shared/merge-queue.ts'
import { BUS_ENTRIES_BOUNDS } from '../src/config/settings.mjs'
import { resolutionRefPosition } from '../src/config/integration-guards.mjs'

/** The bus's reads as this fixture gives them: its two numbers made up, and the queue switch it never reaches. */
const THE_BUS_READS_HERE = {
  mostEntries: { given: () => '8', fallback: () => 8 },
  leavesAfterSeconds: { given: () => '1800', fallback: () => 1800 },
  bounds: BUS_ENTRIES_BOUNDS,
  queueCodeRidesABus: () => { throw new Error('the queue switch is not reached in this file') },
}

/** The office runtime the bus is never asked for in this file. */
const aRuntimeThisFileNeverAsks = async () => { throw new Error('theOfficesRuntime is not reached in this file') }

const REPO = fileURLToPath(new URL('..', import.meta.url))
afterEach(() => {
  if (boundary.folder !== '') rmSync(boundary.folder, { recursive: true, force: true })
  boundary.folder = ''
  boundary.lane = []
  vi.unstubAllEnvs()
})

const ID = 'synthCheckedEntry'
const CODE = 'src/synthetic.ts'
const code = (said: string) => `// A synthetic code file.\nexport const FIRST = 1\n${said}export const LAST = 2\n`
/** The place resolved by keeping both sides, as the brief asks. */
const BOTH = "export const SAID = 'main'\nexport const SAID = 'the entry'\n"
const MESSAGE = 'Synthetic entry: its line'

/**
 * Main and the entry change one line of a code file each, so the entry's own commit stops on the conflict. The
 * supervisor's resolution stands on that main, keeps both lines, carries the entry's message, and the check left it at
 * the resolved ref, as tools/merge-tool/check-a-resolution.mjs does on a pass.
 */
function aResolvedEntry() {
  boundary.folder = mkdtempSync(join(tmpdir(), 'a-checked-resolution-'))
  mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []; boundary.state = {}
  const root = join(boundary.folder, 'repo')
  mkdirSync(root)
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (path: string, text: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
  const commit = (message: string) => { git('add', '-A'); git('commit', '-qm', message); return git('rev-parse', 'HEAD') }
  git('init', '-qb', 'main'); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', aTestAddress('fixture'))
  write('.mole-office/protected.json', JSON.stringify({ protected: [], generated: [] }))
  write('package.json', JSON.stringify({ private: true, scripts: { build: 'node build.cjs' } }))
  write('build.cjs', 'process.exit(0)\n')
  write(CODE, code(''))
  const base = commit('Synthetic base')
  git('switch', '-qc', 'entry'); write(CODE, code("export const SAID = 'the entry'\n")); const tip = commit(MESSAGE)
  git('switch', '-q', 'main'); write(CODE, code("export const SAID = 'main'\n")); const main = commit('Synthetic main: its line')
  git('switch', '-q', '--detach', main); write(CODE, code(BOTH)); const resolved = commit(MESSAGE)
  git('switch', '-q', 'main')
  git('update-ref', resolvedRefOf(ID), resolved)
  const entry = {
    id: ID,
    state: 'judged',
    changeset: { adapter: 'git', root, base, commit: tip },
    seal: { id: 'synthetic-seal' },
    machine: {
      judged: {},
      resolution: { commit: resolved, mainAt: main, files: [], checked: { at: '2026-10-17 00:00:00', ref: resolvedRefOf(ID), places: [] } },
    },
  }
  return { root, git, base, tip, main, resolved, entry }
}

describe("the entry's turn", () => {
  it('integrates the resolution its check passed, where its own commit stops on the conflict', async () => {
    const made = aResolvedEntry()
    boundary.counted = []
    const result = await integrateGit(made.entry)
    expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
    expect(readFileSync(join(boundary.state.integrated.clone, CODE), 'utf8')).toBe(code(BOTH))
    expect(boundary.logs).toContain(`replaying the resolution its check passed, commit ${made.resolved} (${resolvedRefOf(ID)}), and not the entry's own commit ${made.tip}`)
    expect(made.git('rev-parse', 'HEAD')).toBe(made.main)
    expect(boundary.counted, 'a ref at the recorded commit counts no gate').toEqual([])

    // THE SAME ENTRY WITH NO CHECKED RESOLUTION replays its own commit, which stops on the conflict.
    boundary.logs = []
    const own = await integrateGit({ ...made.entry, machine: { judged: {} } })
    expect(own.step).toBe('conflict')
    expect(own.facts.files).toEqual([CODE])
  }, 120_000)

  it('rebases nothing when the resolved ref is not there, or points at another commit', async () => {
    const made = aResolvedEntry()
    boundary.counted = []
    made.git('update-ref', '-d', resolvedRefOf(ID))
    await expect(integrateGit(made.entry)).rejects.toThrow(
      `The resolution of merge entry ${ID} that its check passed is commit ${made.resolved}, and ${resolvedRefOf(ID)} in ${made.root} is not there; nothing was rebased.`,
    )
    made.git('update-ref', resolvedRefOf(ID), made.main)
    await expect(integrateGit(made.entry)).rejects.toThrow(
      `The resolution of merge entry ${ID} that its check passed is commit ${made.resolved}, and ${resolvedRefOf(ID)} in ${made.root} points at ${made.main}; nothing was rebased.`,
    )
    expect(boundary.logs.some((line) => line.startsWith('replaying the resolution'))).toBe(false)
    // Each refusal is counted once on the gate the merge tool reads for it. The name is the gate's id in
    // src/config/gates.mjs; the level is read from the code.
    expect(boundary.counted.map(([gate]) => gate)).toEqual(['resolution-replayed-from-its-own-ref', 'resolution-replayed-from-its-own-ref'])
    expect(boundary.counted.map(([, level]) => level)).toEqual([resolutionRefPosition(), resolutionRefPosition()])
  }, 120_000)
})

describe('the early-conflict probe after a landing', () => {
  it('does not probe an entry carrying a checked resolution, and still probes one carrying none', async () => {
    const made = aResolvedEntry()
    const plain = { ...made.entry, id: 'synthPlainEntry', state: 'pinned', machine: { judged: {} } }
    const warned: any[] = []
    await probeWaitingEntries({
      root: made.root, main: made.main, entries: [{ ...made.entry, state: 'pinned' }, plain], remembered: [], remember: () => {}, log: (line: string) => boundary.logs.push(line),
      probe: (cwd: string, args: string[]) => { const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }); return { status: r.status, stdout: r.stdout, stderr: r.stderr } },
      notify: async (warning: any) => { warned.push(warning) },
      tryTheRebase: async () => { throw Error('A code file conflict is not tried early') },
    })
    expect(boundary.logs).toContain(`early conflict probe for ${ID}: not probed, because its turn integrates the resolution its check passed and not its own commit`)
    expect(warned.map((one) => one.entry)).toEqual(['synthPlainEntry'])
    expect(warned[0]).toMatchObject({ tip: made.tip, files: [CODE] })
  }, 120_000)
})

describe('the bus', () => {
  it('passes over a rider carrying a checked resolution, as tested alone', async () => {
    const made = aResolvedEntry()
    // THE LEAD HAS ITS RESULT ON MAIN; the rider is the entry whose resolution its check passed, judged behind it.
    boundary.lane = [{ ...made.entry, machine: { ...made.entry.machine, judged: { [CODE]: 'synthetic hash' } } }]
    const lead = { id: 'synthLeadEntry', changeset: { adapter: 'git', root: made.root } }
    const bus = await aBusFor(lead, { clone: made.root, M: made.base, Cfinal: made.main }, { folder: join(boundary.folder, 'bus') }, {
      theLane: officeKeeper.theLane,
      sleep: officeKeeper.sleep,
      countAGateMet: officeKeeper.countAGateMet,
      theOfficesRuntime: aRuntimeThisFileNeverAsks,
      runInSandbox: officeKeeper.runInSandbox,
      reads: THE_BUS_READS_HERE,
    })
    const why = `${ID} carries a resolution its supervisor made, which its own turn integrates, so it is tested alone`
    expect(bus).toEqual({ none: why })
    expect(boundary.logs.some((line) => line.startsWith(`the bus passes over merge entry ${ID}: ${why}.`))).toBe(true)
  }, 120_000)
})
