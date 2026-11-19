// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CLOSED UPGRADE RUNS SEVERAL VERIFIERS (tools/stable/upgrade-stable.criteria.md, "A staged re-mint map and several
 * closed verifiers (items 28 and 31)", (b)). `closedVerification` may name `verifiers` in place of `command`. In each
 * phase the entries that name it run one after another, each on a request of its own with `checks` cut to its names,
 * within one budget. An entry may ask for a new empty folder, `{folder}`, and may name a prepare command that runs just
 * before it. The office publishes only when every check of every verifier is true.
 *
 * The verifiers here are made up. "remint" answers two checks in both phases. "export" answers the other two in the
 * target phase only, after its prepare, and exits 2 in the recovery phase as tools/verify-the-export.mjs does. Each
 * writes down what it was given in the file `runs` of the fixture's folder. No office, checkout or database of anybody's
 * is read.
 *
 * Mutations, one at a time after a control run, then restored:
 * - a name in two verifiers is let through: the first case is red;
 * - every verifier is given the configured checks, not its own: the second case is red;
 * - a false check of a verifier is not read: the third case is red (it publishes);
 * - an entry runs in a phase it does not name: the third case is red (the export exits 2 in recovery);
 * - a verifier whose prepare failed is run all the same: the sixth case is red;
 * - every entry is given the same folder in both phases: the third case is red;
 * - each verifier is given the whole of timeoutMs: the seventh case is red (it publishes).
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { upgradeStable, validateUpgradeConfig } from '../tools/stable/stable-upgrade-transaction.mjs'
import { theUpgradeMarkPath } from '../src/config/the-upgrade-mark.mjs'
import { baselineIsBack, remember, stableUpgradeFixture, write } from './stable-upgrade-fixture.ts'
import { LIMITS, rows, type Fixture } from './a-closed-stable-upgrade.ts'

const NODE = realpathSync(process.execPath)
const REMINT = ['remint-rows', 'remint-keys'], EXPORT = ['export-mirror', 'export-pages']
const CHECKS = [...REMINT, ...EXPORT]
const THE_REQUEST = ['version', 'phase', 'commit', 'repository', 'database', 'snapshot', 'servicePort', 'checks', 'stateSha256']

/**
 * A MADE-UP VERIFIER. It writes down its run, then runs its lines for the phase, then writes a passing result for each
 * check of its request. A line may end it, or change `checks` first. Given `--folder <path>`, it writes down what that
 * folder held and leaves a file there.
 */
function aVerifier(f: Fixture, name: string, target = '', recovery = '') {
  const script = join(f.folder, `verifier-${name}.mjs`)
  write(script, `import{appendFileSync,existsSync,readFileSync,readdirSync,statSync,writeFileSync}from'node:fs';
const args=process.argv.slice(2),[requestPath,resultPath]=args.slice(-2),r=JSON.parse(readFileSync(requestPath,'utf8'));
const at=args.indexOf('--folder'),folder=at<0?null:args[at+1];
appendFileSync(${JSON.stringify(join(f.folder, 'runs'))},JSON.stringify({name:${JSON.stringify(name)},phase:r.phase,request:requestPath,result:resultPath,resultThere:existsSync(resultPath),requestMode:statSync(requestPath).mode&0o777,requestKeys:Object.keys(r),checks:r.checks,commit:r.commit,stateSha256:r.stateSha256,folder,found:folder&&readdirSync(folder),folderMode:folder&&statSync(folder).mode&0o777})+'\\n');
if(folder)writeFileSync(folder+'/left-by-the-verifier','made up');
const checks=Object.fromEntries(r.checks.map(name=>[name,true]));
if(r.phase==='target'){${target}}else{${recovery}}
writeFileSync(resultPath,JSON.stringify({version:1,phase:r.phase,commit:r.commit,stateSha256:r.stateSha256,checks}),{mode:0o600});`)
  return [NODE, script, '--folder', '{folder}']
}
/** A MADE-UP PREPARE. It writes down its run and what its folder held, runs its lines, and leaves a file in the folder. */
function aPrepare(f: Fixture, name: string, lines = '') {
  const script = join(f.folder, `prepare-${name}.mjs`)
  write(script, `import{appendFileSync,readdirSync,statSync,writeFileSync}from'node:fs';
const folder=process.argv[2];
appendFileSync(${JSON.stringify(join(f.folder, 'runs'))},JSON.stringify({name:${JSON.stringify(`prepare-${name}`)},folder,found:readdirSync(folder),folderMode:statSync(folder).mode&0o777})+'\\n');
${lines}
writeFileSync(folder+'/prepared','made up');`)
  return [NODE, script, '{folder}']
}

type Lines = { target?: string; recovery?: string }
/**
 * The configuration with the two made-up verifiers, "remint" first unless `exportFirst`. The export's recovery lines are
 * an exit 2 with nothing written, unless the case names its own.
 */
function severalVerifiers(f: Fixture, { remint = {}, exporting = {}, prepare = '', exportFirst = false, timeoutMs = 4000 }: { remint?: Lines; exporting?: Lines; prepare?: string; exportFirst?: boolean; timeoutMs?: number } = {}) {
  const remintEntry = { command: aVerifier(f, 'remint', remint.target, remint.recovery), checks: REMINT, phases: ['target', 'recovery'] }
  const exportEntry = { command: aVerifier(f, 'export', exporting.target, exporting.recovery ?? 'process.exit(2);'), checks: EXPORT, phases: ['target'], prepare: aPrepare(f, 'export', prepare) }
  return { ...f.config, closedVerification: { verifiers: exportFirst ? [exportEntry, remintEntry] : [remintEntry, exportEntry], timeoutMs, checks: CHECKS, ...LIMITS } }
}
/** Each run the made-up verifiers and prepares wrote down, in order. */
const theRuns = (f: Fixture) => existsSync(join(f.folder, 'runs')) ? rows(join(f.folder, 'runs')) : []
const whoRan = (f: Fixture) => theRuns(f).map((r) => r.phase ? `${r.name} ${r.phase}` : r.name)

it('refuses at validation a name in two verifiers, a union that differs from checks, command and verifiers together, and each other shape it cannot run', async () => {
  const f = await stableUpgradeFixture()
  const config = severalVerifiers(f)
  const v = config.closedVerification
  expect(validateUpgradeConfig(config).config.closedVerification).toEqual(v)
  const [remint, exporting] = v.verifiers as [any, any]
  const faults: Array<[string, unknown, RegExp]> = [
    ['command and verifiers together', { ...v, command: remint.command }, /exactly one of command and verifiers/],
    ['neither command nor verifiers', { timeoutMs: v.timeoutMs, checks: v.checks, ...LIMITS }, /exactly one of command and verifiers/],
    ['an empty list', { ...v, verifiers: [] }, /verifiers must be a nonempty list/],
    ['a list that is not one', { ...v, verifiers: remint }, /verifiers must be a nonempty list/],
    ['an entry with a field it does not take', { ...v, verifiers: [{ ...remint, limitMs: 1000 }, exporting] }, /verifiers\[0\] must hold command, checks and phases, and may hold prepare/],
    ['an entry with no phases', { ...v, verifiers: [remint, { command: exporting.command, checks: EXPORT }] }, /verifiers\[1\] must hold command, checks and phases, and may hold prepare/],
    ['an entry whose command is not a canonical absolute executable', { ...v, verifiers: [{ ...remint, command: ['node', ...remint.command.slice(1)] }, exporting] }, /verifiers\[0\]\.command must start with a canonical absolute executable file/],
    ['a prepare that is not a canonical absolute executable', { ...v, verifiers: [remint, { ...exporting, prepare: ['node', '{folder}'] }] }, /verifiers\[1\]\.prepare must start with a canonical absolute executable file/],
    ['an entry with no checks', { ...v, verifiers: [{ ...remint, checks: [] }, exporting] }, /verifiers\[0\]\.checks must name a nonempty unique list of nonblank checks/],
    ['an entry that names a check twice', { ...v, verifiers: [{ ...remint, checks: ['remint-rows', 'remint-rows', 'remint-keys'] }, exporting] }, /verifiers\[0\]\.checks must name a nonempty unique list of nonblank checks/],
    ['an entry with no phase', { ...v, verifiers: [{ ...remint, phases: [] }, exporting] }, /verifiers\[0\]\.phases must name target, recovery or both, each once/],
    ['an entry with a phase that does not exist', { ...v, verifiers: [{ ...remint, phases: ['target', 'both'] }, exporting] }, /verifiers\[0\]\.phases must name target, recovery or both, each once/],
    ['an entry that names a phase twice', { ...v, verifiers: [{ ...remint, phases: ['target', 'target'] }, exporting] }, /verifiers\[0\]\.phases must name target, recovery or both, each once/],
    ['a name in two verifiers', { ...v, verifiers: [{ ...remint, checks: [...REMINT, 'export-mirror'] }, exporting] }, /the check "export-mirror" is in two verifiers/],
    ['a union with a check that checks does not name', { ...v, verifiers: [{ ...remint, checks: [...REMINT, 'remint-extra'] }, exporting] }, /the verifiers answer "remint-extra", which checks does not name/],
    ['a union without a check that checks names', { ...v, checks: [...CHECKS, 'nobody-answers'] }, /no verifier that runs in the target phase answers "nobody-answers"/],
    ['an entry that runs only in the recovery phase', { ...v, verifiers: [{ ...remint, phases: ['recovery'] }, exporting] }, /no verifier that runs in the target phase answers "remint-rows", "remint-keys"/],
    ['no entry that runs in the recovery phase', { ...v, verifiers: [{ ...remint, phases: ['target'] }, exporting] }, /no verifier runs in the recovery phase/],
    ['{folder} inside a longer word', { ...v, verifiers: [{ ...remint, command: [...remint.command.slice(0, 2), '--folder={folder}'] }, exporting] }, /verifiers\[0\]\.command holds "--folder=\{folder\}"; \{folder\} must be a word of its own/],
  ]
  for (const [name, value, refusal] of faults) expect(() => validateUpgradeConfig({ ...f.config, closedVerification: value }), name).toThrow(refusal)
  for (const [name, entry] of [
    ['a command', { ...remint, command: [NODE, join(f.stable, 'tools/serve-dev.mjs'), '{folder}'] }],
    ['a prepare', { ...remint, prepare: [NODE, 'tools/serve-dev.mjs'] }],
  ] as const) expect(() => validateUpgradeConfig({ ...f.config, closedVerification: { ...v, verifiers: [entry, exporting] } }), name).toThrow(/names a path inside the stable checkout/)
  const dry = await upgradeStable(config, { ...f.options, dry: true })
  expect(dry.state, JSON.stringify(dry)).toBe('dry')
  // One line gives the list its one budget, and one line says what each entry answers, when, and with what.
  expect(dry.plan.filter((line: string) => line.includes(`within ${String(v.timeoutMs)} ms`))).toEqual([expect.stringContaining(`${String(v.verifiers.length)} configured verifiers`)])
  const about = (checks: string[]) => dry.plan.filter((line: string) => checks.every((name) => line.includes(name)))
  expect(about(REMINT)).toEqual([expect.stringMatching(/^Verifier 1 .*target and recovery.*folder/)])
  expect(about(REMINT)[0]).not.toContain('prepare')
  expect(about(EXPORT)).toEqual([expect.stringMatching(/^Verifier 2 .*target phase.*folder.*prepare/)])
  expect(theRuns(f)).toEqual([])
  expect(existsSync(join(f.stable, '.git/stable-upgrade.lock'))).toBe(false)
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(false)
}, 120_000)

it('publishes when every check of every verifier is true, each on a new request cut to its own checks', async () => {
  const f = await stableUpgradeFixture()
  const result = remember(await upgradeStable(severalVerifiers(f), f.options))
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(whoRan(f)).toEqual(['remint target', 'prepare-export', 'export target'])
  const [remint, prepare, exporting] = theRuns(f)
  for (const [run, checks] of [[remint, REMINT], [exporting, EXPORT]] as const) {
    expect(run.requestKeys).toEqual(THE_REQUEST)
    expect(run.checks).toEqual(checks)
    expect(run.commit).toBe(f.target)
    expect(run.requestMode).toBe(0o400)
    expect(run.resultThere).toBe(false)
    expect(run.folder.startsWith(`${result.paths.work}/`)).toBe(true)
    expect(run.folderMode).toBe(0o700)
  }
  expect(new Set([remint.request, exporting.request, remint.result, exporting.result]).size).toBe(4)
  expect(exporting.stateSha256).toBe(remint.stateSha256)
  // The remint's folder was new and empty. The export's was new and empty for its prepare, and then held what it left.
  expect(remint.found).toEqual([])
  expect(prepare.found).toEqual([])
  expect(prepare.folderMode).toBe(0o700)
  expect(exporting.folder).toBe(prepare.folder)
  expect(exporting.found).toEqual(['prepared'])
  expect(remint.folder).not.toBe(exporting.folder)
  const passed = { phase: 'target', commit: f.target, stateSha256: remint.stateSha256, checks: CHECKS, verifiers: [
    { checks: REMINT, request: remint.request, result: remint.result, folder: remint.folder },
    { checks: EXPORT, request: exporting.request, result: exporting.result, folder: exporting.folder },
  ] }
  expect(result.closedVerification).toEqual(passed)
  const verified = rows(result.paths.journal).filter((e) => e.step === 'closed-verification' && e.phase === 'verified')
  expect(verified.map(({ commit, stateSha256, checks, verifiers }) => ({ phase: 'target', commit, stateSha256, checks, verifiers }))).toEqual([passed])
}, 120_000)

it('rolls back when one verifier answers false, and an export-like verifier that exits 2 in recovery is not run there', async () => {
  const f = await stableUpgradeFixture()
  const result = remember(await upgradeStable(severalVerifiers(f, { exportFirst: true, remint: { target: "checks['remint-keys']=false;" } }), f.options))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(result.failure).toContain('every configured check must be boolean true')
  expect(whoRan(f)).toEqual(['prepare-export', 'export target', 'remint target', 'remint recovery'])
  const [, , target, recovery] = theRuns(f)
  expect(recovery.checks).toEqual(REMINT)
  expect(recovery.commit).toBe(f.baseline)
  // A new empty folder for each run: the one of the recovery phase is not the one the target phase left a file in.
  expect(target.found).toEqual([])
  expect(recovery.found).toEqual([])
  expect(recovery.folder).not.toBe(target.folder)
  expect(recovery.folderMode).toBe(0o700)
  expect(result.closedVerification).toEqual({ phase: 'recovery', commit: f.baseline, stateSha256: recovery.stateSha256, checks: REMINT, verifiers: [{ checks: REMINT, request: recovery.request, result: recovery.result, folder: recovery.folder }] })
  await baselineIsBack(f)
}, 120_000)

it('rolls back when one verifier exits 2 and writes nothing', async () => {
  const f = await stableUpgradeFixture()
  const result = remember(await upgradeStable(severalVerifiers(f, { exporting: { target: 'process.exit(2);' } }), f.options))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(result.failure).toContain('verifier-target-2 failed (2)')
  expect(whoRan(f)).toEqual(['remint target', 'prepare-export', 'export target', 'remint recovery'])
  expect(existsSync(theRuns(f)[2].result)).toBe(false)
  await baselineIsBack(f)
}, 120_000)

it('rolls back when one verifier writes a check that is not its own', async () => {
  const f = await stableUpgradeFixture()
  const result = remember(await upgradeStable(severalVerifiers(f, { exporting: { target: "checks['remint-rows']=true;" } }), f.options))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(result.failure).toContain('result checks must hold exactly export-mirror, export-pages')
  expect(whoRan(f)).toEqual(['remint target', 'prepare-export', 'export target', 'remint recovery'])
  expect(Object.keys(JSON.parse(readFileSync(theRuns(f)[2].result, 'utf8')).checks)).toEqual([...EXPORT, 'remint-rows'])
  await baselineIsBack(f)
}, 120_000)

it('does not run a verifier whose prepare exits 1, and rolls back', async () => {
  const f = await stableUpgradeFixture()
  const result = remember(await upgradeStable(severalVerifiers(f, { prepare: 'process.exit(1);' }), f.options))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(result.failure).toContain('prepare-target-2 failed (1)')
  expect(whoRan(f)).toEqual(['remint target', 'prepare-export', 'remint recovery'])
  await baselineIsBack(f)
}, 120_000)

it('gives the whole list one budget: two verifiers that each fit timeoutMs, but not together, roll back', async () => {
  const f = await stableUpgradeFixture()
  const waits = 'await new Promise((ok)=>setTimeout(ok,3000));'
  const result = remember(await upgradeStable(severalVerifiers(f, { remint: { target: waits }, exporting: { target: waits }, timeoutMs: 5000 }), f.options))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(result.failure).toContain('verifier-target-2')
  expect(whoRan(f)).toEqual(['remint target', 'prepare-export', 'export target', 'remint recovery'])
  expect(existsSync(theRuns(f)[2].result)).toBe(false)
  await baselineIsBack(f)
}, 180_000)
