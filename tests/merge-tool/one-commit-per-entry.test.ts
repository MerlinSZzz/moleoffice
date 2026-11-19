// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real made-up git histories. Only the office and sandbox boundaries are stand-ins. */
import { LANDED_KEEP_PREFIX, REPLAY_KEEP_PREFIX, retainedLandings } from '../../src/shared/merge/landed-history.mjs'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { aTestAddress, aTestIdentity } from '../the-test-commit-address.mjs'
import { THE_INTEGRATION_A_TEST_GIVES } from '../the-integration-reads-a-test-gives.ts'

const b = vi.hoisted(() => ({ folder: '', state: {} as any, steps: [] as any[], answer: null as any, reads: [] as string[], lane: [] as any[] }))
vi.mock('../../tools/merge-tool/arguments.mjs', async () => ({
  theOwnerContentPatterns: async () => (await import('../the-owners-content-patterns.ts')).THE_PATTERNS,
  withThePairing: (env: Record<string, string | undefined>) => ({ ...env }),
  THE_OFFICE_CONFIGURATION: (await import('../../tools/merge-tool/config.mjs')).theOfficeConfiguration({ repository: fileURLToPath(new URL('../..', import.meta.url)), commitEmail: (await import('../the-test-commit-address.mjs')).THE_MERGE_TOOLS_TEST_ADDRESS }),
  get WORKDIR() { return join(b.folder, 'logs') }, THIS_CHECKOUT: fileURLToPath(new URL('../..', import.meta.url)),
  MIGRATIONS_FOLDER: 'drizzle/', ABSENT: 'absent', API: '', WORKSPACE: 'synthetic', PINNED_REF_PREFIX: 'refs/synthetic/', SCRIPT_TIMEOUT_MS: 30_000,
  GIT_IDENTITY: (await import('../the-test-commit-address.mjs')).aTestIdentity('Synthetic queue', 'fixture'),
  chosen: { entry: 'synthetic-entry', get sandboxes() { return join(b.folder, 'sandbox') } },
}))
vi.mock('../../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (s: string) => { throw Error(s) }, log: () => {}, stamp: () => '2026-10-01 00:00:00',
  readState: () => b.state, writeState: (p: any) => (b.state = { ...b.state, ...p }),
}))
vi.mock('../../tools/merge-tool/documents.mjs', () => ({ theRecordOfMain: () => ({ record: null }), theDocumentsOf: () => ({ none: 'Synthetic code' }), untilNoOtherLandingOf: async () => {}, generatedPathsOf: () => [], carryPastDocuments: async () => null, theRecordCarriedForward: () => {} }))
vi.mock('../../tools/merge-tool/office-keeper.mjs', () => ({
  theLane: async () => b.lane, sleep: async () => {}, ask: async (_m: string, path: string) => { b.reads.push(path); return b.answer },
  theSeal: async (e: any) => ({ git: { commit: e.changeset.commit, files: [] } }),
  theSandbox: async () => ({ name: 'synthetic', folder: join(b.folder, 'sandbox') }),
  step: async (name: string, facts: any, detail: any) => { b.steps.push({ name, facts, detail }); return { state: name === 'landing' ? 'landing' : name === 'landed' ? 'merged' : name, facts } },
  runInSandbox: async (_s: any, _l: string, cmd: string, args: string[], opts: any) => {
    const r = spawnSync(cmd, args, { cwd: opts.cwd, encoding: 'utf8' }); return { code: r.status, tail: r.stdout + r.stderr }
  },
  countAGateMet: async () => {}, conflictsAfterLanding: async () => [],
  waitForHealth: async () => ({ says: 'Synthetic health' }), theOfficesRuntime: async () => ({ repository: { path: join(b.folder, 'root') } }),
}))
vi.mock('../../tools/merge-tool/push.mjs', () => ({ pushLanded: async (_r: string, c: string) => ({ ok: true, commit: c, says: 'Synthetic push' }) }))
import { integrateGit } from '../../tools/merge-tool/integrate.mjs'
import { landGit as landGitFixture } from '../../tools/merge-tool/land.mjs'
import * as officeKeeper from '../../tools/merge-tool/office-keeper.mjs'
import { wholeSuiteFixRoundIsOn } from '../../src/config/whole-suite-red.mjs'
import { pluginPagesPosition } from '../../src/config/integration-guards.mjs'
const landGit = (entry: any) => landGitFixture(entry, {
  ask: officeKeeper.ask,
  countAGateMet: officeKeeper.countAGateMet,
  runInSandbox: officeKeeper.runInSandbox,
  step: officeKeeper.step,
  theOfficesRuntime: officeKeeper.theOfficesRuntime,
  theSandbox: officeKeeper.theSandbox,
  waitForHealth: officeKeeper.waitForHealth,
  conflictsAfterLanding: officeKeeper.conflictsAfterLanding,
  theLane: officeKeeper.theLane,
  sleep: officeKeeper.sleep,
  wholeSuiteFixRoundIsOn,
  pluginPagesPosition,
})
import { canItJoin } from '../../tools/merge-tool/early-conflicts.mjs'
import { aScratchCopy, rebaseWithTheJoins } from '../../tools/merge-tool/rebase-with-joins.mjs'
import { theCommitsReadWith } from '../../src/server/lib/before-the-seal-rules.ts'
import { prepareTakeBack } from '../../tools/merge-tool/take-back.mjs'
import { checkTheResolution } from '../../tools/merge-tool/check-a-resolution.mjs'
import { step } from '../../tools/merge-tool/office-keeper.mjs'
import { aBusFor } from '../../tools/merge-tool/pairs.mjs'
import { BUS_ENTRIES_BOUNDS } from '../../src/config/settings.mjs'
import { isTheQueuesOwnCode } from '../../tools/merge-tool/the-queues-own-code.mjs'
import { hashAt } from '../../tools/merge-tool/git.mjs'
import { screenTheCommits, theRefusalSaid } from '../../tools/merge-tool/commit-addresses.mjs'

/** The bus's reads as this fixture gives them: its two numbers made up, and the switch's made-up answer. */
const THE_BUS_READS_HERE = {
  mostEntries: { given: () => '8', fallback: () => 8 },
  leavesAfterSeconds: { given: () => '1800', fallback: () => 1800 },
  bounds: BUS_ENTRIES_BOUNDS,
  queueCodeRidesABus: () => ({ id: 'queue-code-rides-a-bus', setting: 'MOLE_OFFICE_QUEUE_CODE_RIDES_A_BUS', position: '0' }),
}

const git = (r: string, ...a: string[]) => execFileSync('git', ['-C', r, ...a], { encoding: 'utf8', env: { ...process.env, ...aTestIdentity('Synthetic fixture', 'fixture') }, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const probe = (r: string, a: string[]) => { const p = spawnSync('git', ['-C', r, ...a], { encoding: 'utf8' }); return { status: p.status, stdout: p.stdout, stderr: p.stderr } }
const write = (r: string, p: string, s: string) => { mkdirSync(dirname(join(r, p)), { recursive: true }); writeFileSync(join(r, p), s) }
const commit = (r: string, s: string) => { git(r, 'add', '-A'); git(r, 'commit', '-qm', s); return git(r, 'rev-parse', 'HEAD') }
beforeEach(() => { b.folder = mkdtempSync(join(tmpdir(), 'one-landing-')); mkdirSync(join(b.folder, 'logs')); b.state = {}; b.steps = []; b.reads = []; b.lane = [] })
afterEach(() => rmSync(b.folder, { recursive: true, force: true }))
function fixture() {
  const root = join(b.folder, 'root'); mkdirSync(root); git(root, 'init', '-qb', 'main')
  git(root, 'config', 'user.name', 'Synthetic fixture'); git(root, 'config', 'user.email', aTestAddress('fixture'))
  write(root, '.gitignore', 'node_modules\n')
  write(root, '.mole-office/protected.json', JSON.stringify({ protected: [], generated: [{ paths: ['design/AUDIT.md'], command: ['node', 'audit.cjs'], regenerateWhen: ['tests/**'] }] }))
  write(root, 'audit.cjs', "require('node:fs').writeFileSync('design/AUDIT.md', 'two tests\\n')\n")
  write(root, 'design/AUDIT.md', 'one test\n'); write(root, 'src/value.txt', 'base\n')
  const base = commit(root, 'Synthetic baseline'); git(root, 'switch', '-qc', 'feature')
  write(root, 'tests/new.test.ts', '/* synthetic criterion */\n')
  const criterion = commit(root, 'Criterion: synthetic behavior\n\nOLD: old wording\nNEW: new wording\nWHY: synthetic proof')
  write(root, 'src/value.txt', 'draft\n'); const draft = commit(root, 'Draft synthetic behavior')
  write(root, 'src/value.txt', 'finished\n'); const tip = commit(root, 'Implement synthetic behavior')
  git(root, 'switch', '-q', 'main')
  const entry = { id: 'synthetic-entry', run: 'synthetic-run', seal: { id: 'synthetic-seal', hash: 'a'.repeat(64) }, changeset: { adapter: 'git', root, base, commit: tip }, machine: { judged: {} } }
  // The existing record door's older answer: no new queue fields are supplied.
  b.answer = { status: 200, body: { record: { id: entry.run, kind: 'session', title: 'Finish the synthetic feature', data: { sealedTip: entry.seal.id } } } }
  return { root, base, criterion, draft, tip, entry }
}
async function integrated(f: ReturnType<typeof fixture>) { return integrateGit(f.entry, THE_INTEGRATION_A_TEST_GIVES) }

it('tests and lands one feature commit including regeneration, retains report hashes through pruning, and resumes once', async () => {
  const f = fixture(); const result = await integrated(f); expect(result.state).toBe('integrated')
  const s = b.state.integrated, clone = s.clone
  for (const tip of [s.Cfinal, s.replayed]) expect(() => git(f.root, 'cat-file', '-e', `${tip}^{commit}`), 'published integration objects must be available to bus copies').not.toThrow()
  expect(git(clone, 'rev-list', '--count', `${f.base}..${s.Cfinal}`)).toBe('1')
  expect(git(clone, 'rev-parse', `${s.Cfinal}^`)).toBe(f.base)
  expect(git(clone, 'show', `${s.Cfinal}:design/AUDIT.md`)).toBe('two tests')
  expect(git(clone, 'log', '-1', '--format=%s', s.Cfinal)).toBe(b.answer.body.record.title)
  const body = git(clone, 'log', '-1', '--format=%B', s.Cfinal)
  for (const value of [f.entry.run, f.entry.seal.id, f.entry.seal.hash, f.tip]) expect(body).toContain(value)
  expect(b.reads).toEqual(['/api/records/synthetic-run'])
  const original = theCommitsReadWith((...a) => git(f.root, ...a), f.base, f.tip, null)
  expect(original.commits.map(c => c.subject)).toEqual(['Criterion: synthetic behavior', 'Draft synthetic behavior', 'Implement synthetic behavior'])
  await landGit({ ...f.entry, state: 'testing' })
  expect(git(f.root, 'rev-parse', `${LANDED_KEEP_PREFIX}synthetic-entry`)).toBe(f.tip)
  expect(git(f.root, 'rev-parse', `${REPLAY_KEEP_PREFIX}synthetic-entry/${s.replayed}`)).toBe(s.replayed)
  expect(git(f.root, 'show', `${s.replayed}:design/AUDIT.md`)).toBe('two tests')
  expect(git(f.root, 'rev-parse', 'HEAD')).toBe(s.Cfinal)
  const landed = { ...b.state.landing }; await landGit({ ...f.entry, state: 'landing' })
  expect(b.state.landing.moved).toEqual(landed.moved); expect(git(f.root, 'rev-list', '--count', `${f.base}..HEAD`)).toBe('1')
  git(f.root, 'branch', '-D', 'feature'); git(f.root, 'reflog', 'expire', '--expire=now', '--all'); git(f.root, 'gc', '--prune=now')
  expect(git(f.root, 'show', `${f.draft}:src/value.txt`)).toBe('draft')
  expect(theCommitsReadWith((...a) => git(f.root, ...a), f.base, f.tip, null).commits).toEqual(original.commits)
  const inverse = prepareTakeBack({ repository: f.root, clone: join(b.folder, 'inverse'), problem: 'synthetic', entry: f.entry.id, commits: [s.Cfinal], title: 'Take back the feature', identity: aTestIdentity('Synthetic fixture', 'fixture') })
  expect(git(inverse.clone, 'show', 'HEAD:src/value.txt')).toBe('base')
  expect(git(inverse.clone, 'show', 'HEAD:design/AUDIT.md')).toBe('one test')
})

it.each([
  ['a cut run answer', { status: 200, body: { record: { id: 'synthetic-run', kind: 'session' } } }, 'title'],
  ['an unreadable run answer', { status: 503, body: { error: 'Synthetic unavailable' } }, 'synthetic-run'],
  ['another run', { status: 200, body: { record: { id: 'other-run', kind: 'session', title: 'Other', data: { sealedTip: 'synthetic-seal' } } } }, 'synthetic-run'],
  ['another seal', { status: 200, body: { record: { id: 'synthetic-run', kind: 'session', title: 'Feature', data: { sealedTip: 'other-seal' } } } }, 'synthetic-seal'],
  ['a multiline title', { status: 200, body: { record: { id: 'synthetic-run', kind: 'session', title: 'Feature\nRun: invented', data: { sealedTip: 'synthetic-seal' } } } }, 'title'],
  ['attribution in the supplied title', { status: 200, body: { record: { id: 'synthetic-run', kind: 'session', title: 'Co-Authored-By: Synthetic fixture', data: { sealedTip: 'synthetic-seal' } } } }, 'title'],
] as const)('refuses %s by name before changing main', async (_name, answer, why) => {
  const f = fixture(); b.answer = answer; await expect(integrated(f)).rejects.toThrow(why)
  expect(git(f.root, 'rev-parse', 'HEAD')).toBe(f.base); expect(b.steps).toEqual([])
})

it('replays a successor past a squashed predecessor in the probe, trial and integration; a later real conflict still stops', async () => {
  const f = fixture(); git(f.root, 'switch', '-qc', 'successor', f.tip)
  write(f.root, 'src/next.txt', 'next\n'); const next = commit(f.root, 'Synthetic successor')
  git(f.root, 'switch', '-q', 'main'); await integrated(f); await landGit({ ...f.entry, state: 'testing' })
  const main = git(f.root, 'rev-parse', 'HEAD')
  expect(canItJoin(f.root, main, next, probe)).toEqual({ joins: true })
  const clone = join(b.folder, 'trial'); const upstream = aScratchCopy(f.root, main, next, clone)
  expect(rebaseWithTheJoins(clone, { main, upstream, commit: next }).ok).toBe(true)
  expect(git(clone, 'log', '--format=%s', `${main}..HEAD`)).toBe('Synthetic successor')
  // A sealed base can be the predecessor's original tip, which is held by the keep ref.
  const successor = { ...f.entry, changeset: { ...f.entry.changeset, base: f.tip, commit: next } }
  expect((await integrateGit(successor, { ...THE_INTEGRATION_A_TEST_GIVES, landing: false })).state).toBe('integrated')
  write(f.root, 'src/next.txt', 'main disagrees\n'); const moved = commit(f.root, 'Synthetic conflict on main')
  expect(canItJoin(f.root, moved, next, probe)).toMatchObject({ joins: false, commit: next, files: ['src/next.txt'] })
  expect((await integrateGit(successor, { ...THE_INTEGRATION_A_TEST_GIVES, landing: false })).state).toBe('conflict')
})

it('refuses a keep ref that names another tip and leaves main where it was', async () => {
  const f = fixture(); await integrated(f); git(f.root, 'update-ref', `${LANDED_KEEP_PREFIX}synthetic-entry`, f.base)
  await expect(landGit({ ...f.entry, state: 'testing' })).rejects.toThrow(`${LANDED_KEEP_PREFIX}synthetic-entry`)
  expect(git(f.root, 'rev-parse', 'HEAD')).toBe(f.base)
})

it('a moved main does not land the tested commit, and the retained tip is still readable', async () => {
  const f = fixture(); await integrated(f); write(f.root, 'unrelated.txt', 'main\n'); const moved = commit(f.root, 'Synthetic main moved')
  await landGit({ ...f.entry, state: 'testing' }); expect(b.steps.at(-1).name).toBe('main-moved')
  expect(git(f.root, 'rev-parse', 'HEAD')).toBe(moved)
  const prior = b.state.integrated.replayed
  await integrated(f); const next = b.state.integrated
  await landGit({ ...f.entry, state: 'testing' })
  expect(git(f.root, 'rev-parse', 'HEAD^')).toBe(moved)
  expect(git(f.root, 'rev-list', '--count', `${moved}..HEAD`)).toBe('1')
  expect(git(f.root, 'rev-parse', `${REPLAY_KEEP_PREFIX}synthetic-entry/${prior}`)).toBe(prior)
  expect(git(f.root, 'rev-parse', `${REPLAY_KEEP_PREFIX}synthetic-entry/${next.replayed}`)).toBe(next.replayed)
})

it('the real clean-copy tool and resolution check replay only a successor after a squashed landing', async () => {
  const f = fixture(); git(f.root, 'switch', '-qc', 'next', f.tip)
  write(f.root, 'src/next.txt', 'successor\n'); const next = commit(f.root, 'Synthetic successor')
  git(f.root, 'update-ref', 'refs/mole-office/queue/synthetic-entry', next)
  git(f.root, 'switch', '-q', 'main'); git(f.root, 'update-ref', `${LANDED_KEEP_PREFIX}predecessor`, f.tip)
  const message = `Finish the predecessor\n\nMole-landing: 1\nEntry: predecessor\nRun: earlier-run\nSeal: earlier-seal\nSeal-hash: ${'a'.repeat(64)}\nBranch-tip: ${f.tip}\nReplayed-tip: ${f.tip}`
  const main = git(f.root, 'commit-tree', git(f.root, 'rev-parse', `${f.tip}^{tree}`), '-p', f.base, '-m', message)
  git(f.root, 'merge', '--ff-only', main)
  const into = join(b.folder, 'clean-copy')
  const tool = fileURLToPath(new URL('../../tools/merge-tool/resolve-a-conflict.mjs', import.meta.url))
  const copied = spawnSync(process.execPath, [tool, '--entry', f.entry.id, '--repository', f.root, '--ref', 'refs/mole-office/queue/synthetic-entry', '--commit', next, '--main-at', main, '--red', 'tests/new.test.ts', '--into', into], { encoding: 'utf8', env: { ...process.env, ...aTestIdentity('Synthetic fixture', 'fixture') } })
  expect(copied.status, copied.stderr + copied.stdout).toBe(0)
  expect(git(into, 'log', '--format=%s', `${main}..HEAD`)).toBe('Synthetic successor')
  write(into, 'src/fix.txt', 'fix\n'); const fixed = commit(into, 'Synthetic red fix')
  const resolution = { commit: fixed, mainAt: main, workingDirectory: into, files: ['src/fix.txt', 'src/next.txt'].map(path => ({ path, hash: hashAt(into, fixed, path), mode: '100644' })) }
  const checked = await checkTheResolution({ ...f.entry, changeset: { ...f.entry.changeset, commit: next }, machine: { resolving: { red: ['tests/new.test.ts'], files: [], mainAt: main }, resolution } }, { step })
  expect(checked.facts, JSON.stringify(checked.facts)).toMatchObject({ ok: true, commit: fixed, fixed: ['src/fix.txt'] })
})

it('the shared landed-history reader is queue code', () => {
  expect(isTheQueuesOwnCode('src/shared/merge/landed-history.mjs')).toBe(true)
})

it('a bus replays a successor past the lead entry\'s squash while preserving its judged content', async () => {
  const f = fixture(); git(f.root, 'switch', '-qc', 'rider', f.tip)
  write(f.root, 'src/next.txt', 'rider\n'); const next = commit(f.root, 'Synthetic rider')
  git(f.root, 'switch', '-q', 'main')
  const message = `Finish the lead feature\n\nMole-landing: 1\nEntry: lead-entry\nRun: lead-run\nSeal: lead-seal\nSeal-hash: ${'a'.repeat(64)}\nBranch-tip: ${f.tip}\nReplayed-tip: ${f.tip}`
  const squash = git(f.root, 'commit-tree', git(f.root, 'rev-parse', `${f.tip}^{tree}`), '-p', f.base, '-m', message)
  const rider = { ...f.entry, id: 'synthetic-rider', state: 'judged', changeset: { ...f.entry.changeset, base: f.base, commit: next }, machine: { judged: { 'src/next.txt': hashAt(f.root, next, 'src/next.txt') } } }
  b.lane = [rider]
  const bus = await aBusFor(f.entry, { clone: f.root, M: f.base, Cfinal: squash }, { folder: join(b.folder, 'bus') }, {
    theLane: officeKeeper.theLane,
    sleep: officeKeeper.sleep,
    countAGateMet: officeKeeper.countAGateMet,
    theOfficesRuntime: officeKeeper.theOfficesRuntime,
    runInSandbox: officeKeeper.runInSandbox,
    reads: THE_BUS_READS_HERE,
  })
  expect(bus.riders?.map((r: any) => r.b.id), JSON.stringify(bus)).toEqual([rider.id])
  expect(git(bus.clone!, 'show', `${bus.T}:src/value.txt`)).toBe('finished')
  expect(git(bus.clone!, 'show', `${bus.T}:src/next.txt`)).toBe('rider')
})

it('copied predecessor patches are skipped too, and an unreadable landing footer is named', () => {
  const f = fixture(); git(f.root, 'switch', '-qc', 'copied', f.base)
  git(f.root, '-c', 'user.name=Synthetic copy', 'cherry-pick', f.criterion, f.draft, f.tip)
  write(f.root, 'src/copied.txt', 'copy\n'); const copied = commit(f.root, 'Synthetic copied successor')
  git(f.root, 'switch', '-q', 'main')
  const message = `Finish a feature\n\nMole-landing: 1\nEntry: predecessor\nRun: earlier-run\nSeal: earlier-seal\nSeal-hash: ${'a'.repeat(64)}\nBranch-tip: ${f.tip}\nReplayed-tip: ${f.tip}`
  const main = git(f.root, 'commit-tree', git(f.root, 'rev-parse', `${f.tip}^{tree}`), '-p', f.base, '-m', message)
  expect(canItJoin(f.root, main, copied, probe)).toEqual({ joins: true })
  const clone = join(b.folder, 'copied-trial'), upstream = aScratchCopy(f.root, main, copied, clone)
  expect(rebaseWithTheJoins(clone, { main, upstream, commit: copied }).ok).toBe(true)
  expect(git(clone, 'log', '--format=%s', `${main}..HEAD`)).toBe('Synthetic copied successor')
  const cut = git(f.root, 'commit-tree', git(f.root, 'rev-parse', `${f.tip}^{tree}`), '-p', f.base, '-m', 'Synthetic cut footer\n\nMole-landing: 1\nEntry: predecessor')
  expect(canItJoin(f.root, cut, cut, probe)).toMatchObject({ joins: null, why: expect.stringContaining('Run') })
  const missing = git(f.root, 'commit-tree', git(f.root, 'rev-parse', `${f.tip}^{tree}`), '-p', f.base, '-m', message.replace(f.tip, '0'.repeat(40)))
  expect(canItJoin(f.root, missing, missing, probe)).toMatchObject({ joins: null, why: expect.stringContaining('0'.repeat(40)) })
})

it('refuses an older integration with no single-commit provenance before main moves', async () => {
  const f = fixture(); await integrateGit(f.entry, { ...THE_INTEGRATION_A_TEST_GIVES, landing: false })
  await expect(landGit({ ...f.entry, state: 'testing' })).rejects.toThrow('integrate again')
  expect(git(f.root, 'rev-parse', 'HEAD')).toBe(f.base)
  expect(b.steps.map(s => s.name)).toEqual(['integrated'])
})

it('refuses a replay substituted for the single tested landing commit', async () => {
  const f = fixture(); await integrated(f); b.state.integrated.Cfinal = b.state.integrated.replayed
  await expect(landGit({ ...f.entry, state: 'testing' })).rejects.toThrow('single commit')
  expect(git(f.root, 'rev-parse', 'HEAD')).toBe(f.base)
})

it('records the real replay and landing address-screen ranges separately', async () => {
  const f = fixture(); await integrated(f); const s = b.state.integrated
  const screens = JSON.parse(readFileSync(join(b.folder, 'logs/checks/commit-addresses.json'), 'utf8'))
  expect(screens).toMatchObject({ replay: { base: f.base, head: s.replayed }, landing: { base: f.base, head: s.Cfinal } })
  for (const screen of [screens.replay, screens.landing]) {
    expect(screen.read.commits).toBe(Number(git(s.clone, 'rev-list', '--count', `${screen.base}..${screen.head}`)))
  }
})

it('describes address refusals as published or retained history', () => {
  const f = fixture(), domain = aTestAddress('fixture').split('@')[1]!
  const screen = screenTheCommits({ repo: f.root, base: f.base, head: f.tip, domain })
  expect(screen.refused.length).toBeGreaterThan(0)
  expect(theRefusalSaid(screen)).toContain('publish or retain')
})

it.each(['Run: preserve the review history', 'Mole-landing: preserve report history'])('reads only footer provenance when the supplied title is %s', async title => {
  const f = fixture(); b.answer.body.record.title = title
  await integrated(f); const s = b.state.integrated
  expect(git(s.clone, 'log', '-1', '--format=%s', s.Cfinal)).toBe(title)
  expect(retainedLandings((args: string[]) => git(s.clone, ...args), s.Cfinal)).toMatchObject([{ entry: f.entry.id, run: f.entry.run, seal: f.entry.seal.id, tip: f.tip, replayed: s.replayed }])
  await landGit({ ...f.entry, state: 'testing' })
  expect(canItJoin(f.root, s.Cfinal, f.tip, probe)).toEqual({ joins: true })
})
