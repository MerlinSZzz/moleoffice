// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CLOSED STABLE UPGRADE ON THE MADE-UP OFFICE OF tests/stable-upgrade-fixture.ts, AND A CRASH OF ITS PROGRAM.
 *
 * closed() gives the fixture's configuration a made-up verifier and the two limits on the closed time. crashTheUpgradeAt()
 * runs that upgrade in a program of its own and ends the program by SIGKILL right after the journal line of one boundary
 * is synced, as upgrade-stable.criteria.md, "The crash proof", says. THE_BOUNDARIES is that criterion's list.
 * aStartOfTheMadeUpOffice() is a restart by hand of the made-up office's serve-dev. theCrashIsResumed() is the rest of
 * that criterion's proof at one boundary, once the program has been ended there.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect } from 'vitest'
import { resumeStableUpgrade, upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { theResumeCommand, theUpgradeMarkPath } from '../src/config/the-upgrade-mark.mjs'
import { baselineIsBack, candidateTag, children, databaseModule, groups, remember, root, snapshot, write, type stableUpgradeFixture } from './stable-upgrade-fixture.ts'
import { commandUnderTheOwnerWatchingGate } from './the-owner-watching-gate.ts'

export type Fixture = Awaited<ReturnType<typeof stableUpgradeFixture>>
/** The two limits on the closed time. A test about one of them names its own; these are far longer than any step here. */
export const LIMITS = { abortDeadlineMs: 60_000, maxClosedMs: 120_000 }

/** The made-up verifier. `target` and `recovery` are lines it runs for that phase before it writes a passing result. */
function verifier(f: Fixture, target = '', recovery = '', limits: { abortDeadlineMs: number; maxClosedMs: number } = LIMITS) {
  const script = join(f.folder, 'verifier.mjs')
  write(script, `import{readFileSync,writeFileSync,appendFileSync,chmodSync}from'node:fs';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),Database=require(${JSON.stringify(databaseModule)});
const [requestPath,resultPath]=process.argv.slice(-2),r=JSON.parse(readFileSync(requestPath,'utf8'));
const check=await fetch('http://127.0.0.1:'+r.servicePort+'/api/fixture-write',{method:'POST'});
if(check.status!==503)throw Error('Ordinary write accepted during verification');
const db=new Database(r.database,{readonly:true,fileMustExist:true});
if(r.phase==='recovery'&&db.prepare("SELECT name FROM sqlite_master WHERE name='migrated'").get())throw Error('Recovery did not restore original schema');
db.close();
appendFileSync(${JSON.stringify(join(f.folder, 'verified-phases'))},r.phase+'\\n');
if(r.phase==='target'){${target}}else{${recovery}}
writeFileSync(resultPath,JSON.stringify({version:1,phase:r.phase,commit:r.commit,stateSha256:r.stateSha256,checks:Object.fromEntries(r.checks.map(name=>[name,true]))}),{mode:0o600});`)
  return { command: [realpathSync(process.execPath), script], timeoutMs: 4000, checks: ['synthetic-schema', 'synthetic-private-rows'], ...limits }
}
export function closed(f: Fixture, target = '', recovery = '', limits = LIMITS) { return { ...f.config, closedVerification: verifier(f, target, recovery, limits) } }
export function rows(path: string) { return readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line)) }
/** The index of the last entry that passes the test, or -1. */
const lastWhere = (entries: any[], test: (entry: any) => boolean) => entries.map(test).lastIndexOf(true)
/** No ordinary route of the made-up office answers: a write is refused with 503, or nothing listens. */
export async function unavailable(f: Fixture) {
  try { const r = await fetch(`http://127.0.0.1:${f.config.servicePort}/api/fixture-write`, { method: 'POST', signal: AbortSignal.timeout(1000) }); expect(r.status).toBe(503) }
  catch (error) { if (!(error instanceof TypeError) && !(error instanceof DOMException)) throw error }
}

/**
 * ONE BOUNDARY: the nth journal line with this step and phase, counted from the start of the journal of a run that
 * publishes or of a run whose target verifier rejects. A step taken once for each of several process groups carries the
 * group's number at its end; it is written here with `-G` instead, and its first group is the one tested.
 */
export type Boundary = { run: 'publishing' | 'rejecting'; step: string; phase: string; nth: number }
const each = (run: Boundary['run'], lines: string) => lines.trim().split('\n').map((line) => {
  const [step, phase, nth] = line.trim().split(' ')
  return { run, step: step!, phase: phase!, nth: nth === undefined ? 1 : Number(nth) }
})
/**
 * THE BOUNDARIES IN PARTS, one test file for each: tests/a-crashed-stable-upgrade-resumes-<part>.test.ts. Before the
 * closure the office is not closed at any of them. The publishing parts run from `closed-time started` to
 * `release-lock attempt` on a run that publishes. The rolling-back parts run from `recovery attempt` to `release-lock
 * attempt` on a run whose target verifier rejects. Up to `recovery attempt` that run journals the same lines as the run
 * that publishes, and those are crashed once, on that run.
 */
export const THE_PARTS: Record<string, Boundary[]> = {
  'before-it-closes': each('publishing', `
    lock attempt
    notice recorded
    candidate-migrate done
    notice-before filed
    policy-stop done`),
  'while-it-stops-and-saves': each('publishing', `
    closed-time started
    upgrade-mark written
    old-stop-G attempt
    old-stop-G done
    database-holder-check set-aside 2
    exclusive-lock-guard taken
    private-backup attempt
    database-snapshot ready
    private-backup done
    stable-fetch attempt
    stable-fetch done
    stable-checkout attempt
    stable-checkout done
    candidate-tag attempt
    candidate-tag done
    install-artifacts attempt
    install-artifacts done`),
  'while-it-migrates-and-checks': each('publishing', `
    closed-verification attempted
    migrate attempt
    migrate group-recorded
    migrate gate-attempt
    migrate done
    closed-verification committed-awaiting-verification
    stable-checkpoint attempt
    stable-checkpoint done
    stable-check attempt
    stable-check group-recorded
    stable-check gate-attempt
    stable-check done
    stable-check-health attempt
    stable-check-health done`),
  'while-it-verifies-the-target': each('publishing', `
    verify-target attempt
    verifier-target requested
    verifier-target attempt
    verifier-target group-recorded
    verifier-target gate-attempt
    verifier-target done
    closed-verification verified
    verify-target done
    stable-check-stop attempt
    stable-check-stop done`),
  'while-it-opens-the-target': each('publishing', `
    ordinary-start attempt
    ordinary-start group-recorded
    upgrade-mark cleared
    ordinary-start gate-attempt
    ordinary-start done
    ordinary-start-health attempt
    ordinary-server group-recorded
    ordinary-topology observed
    ordinary-start-health done
    published verified
    finish attempt
    final-journal attempt
    final-journal done
    close-lock-descriptor attempt
    close-lock-descriptor done
    release-lock attempt`),
  'while-it-rolls-back': each('rejecting', `
    recovery attempt
    recover-stop-G attempt
    recover-stop-G done
    recover-old-stop-G attempt
    recover-old-stop-G done
    database-holder-check set-aside 3
    exclusive-lock-guard taken 2
    recover-tag attempt
    recover-tag done
    recover-checkout attempt
    recover-checkout done
    recover-artifacts attempt
    recover-artifacts done
    recover-database attempt
    recover-database done`),
  'while-it-verifies-the-old-version': each('rejecting', `
    recover-check attempt
    recover-check group-recorded
    recover-check gate-attempt
    recover-check done
    recover-check-health attempt
    recover-check-health done
    verify-recovery attempt
    verifier-recovery requested
    verifier-recovery attempt
    verifier-recovery group-recorded
    verifier-recovery gate-attempt
    verifier-recovery done
    closed-verification recovered
    verify-recovery done
    recover-check-stop attempt
    recover-check-stop done`),
  'while-it-reopens-the-old-version': each('rejecting', `
    recover-start attempt
    recover-start group-recorded
    upgrade-mark cleared
    recover-start gate-attempt
    recover-start done
    recover-start-health attempt
    ordinary-server group-recorded
    ordinary-topology observed
    recover-start-health done
    finish attempt
    final-journal attempt
    final-journal done
    close-lock-descriptor attempt
    close-lock-descriptor done
    release-lock attempt`),
}
export const THE_BOUNDARIES: Boundary[] = Object.values(THE_PARTS).flat()
const BEFORE_THE_CLOSURE = THE_PARTS['before-it-closes']!
const THE_MIGRATION_DONE = THE_BOUNDARIES.findIndex((b) => b.step === 'migrate' && b.phase === 'done')
/**
 * HOW THE RESUME OF A CRASH AT `b` ENDS. Before the closure nothing changed, so "unchanged". On the run that publishes,
 * a crash before the migration is done rolls back, and one after it is verified again and published. The exception is
 * a crash right after `ordinary-start gate-attempt`: the gate was not yet told to start, so it ends with its controller,
 * nothing opened, and the resume rolls back. On the run that rolls back, the resume rolls back.
 */
export function theResumeEnds(b: Boundary): 'published' | 'restored' | 'unchanged' {
  if (BEFORE_THE_CLOSURE.includes(b)) return 'unchanged'
  if (b.run === 'rejecting' || (b.step === 'ordinary-start' && b.phase === 'gate-attempt')) return 'restored'
  return THE_BOUNDARIES.indexOf(b) >= THE_MIGRATION_DONE ? 'published' : 'restored'
}
export const theBoundaryIn = (b: Boundary) => `${b.step} ${b.phase}${b.nth === 1 ? '' : ` (${String(b.nth)})`} on the run that ${b.run === 'publishing' ? 'publishes' : 'rolls back'}`
/**
 * THE COMPLETENESS CHECK, for the journal of one whole run of the closed upgrade that publishes or that rolls back. Each
 * entry inside the closure, from `closed-time started` to `release-lock attempt`, must be a tested boundary. A step for
 * a later process group is covered by its first group. Up to `recovery attempt`, a run that rolls back must journal what
 * the run that publishes journals, because those boundaries are crashed only on that run: `publishing` is what
 * the run that publishes journalled inside the closure. Returns what this run journalled there, and what of it is untested.
 */
export function theUntestedEntries(entries: Array<{ step: string; phase: string }>, run: Boundary['run'], publishing: string[] = []) {
  const named = theBoundariesOf(entries)
  const from = named.indexOf('closed-time started 1'), to = named.indexOf('release-lock attempt 1')
  expect(from).toBeGreaterThan(0); expect(to).toBeGreaterThan(from)
  const inside = named.slice(from, to + 1)
  const rollback = run === 'rejecting' ? inside.indexOf('recovery attempt 1') : inside.length
  if (run === 'rejecting') { expect(rollback).toBeGreaterThan(0); expect(inside.slice(0, rollback)).toEqual(publishing.slice(0, rollback)) }
  const tested = (side: Boundary['run']) => new Set(THE_BOUNDARIES.filter((b) => b.run === side && !BEFORE_THE_CLOSURE.includes(b)).map((b) => `${b.step} ${b.phase} ${String(b.nth)}`))
  const isTested = (name: string, among: Set<string>) => among.has(name) || (/-G /.test(name) && among.has(name.replace(/ \d+$/, ' 1')))
  return { inside, untested: [...inside.slice(0, rollback).filter((name) => !isTested(name, tested('publishing'))), ...inside.slice(rollback).filter((name) => !isTested(name, tested('rejecting')))] }
}
/** A journal line's step and phase, with a group's number at the end of the step written `-G`. */
export const stepAndPhase = (entry: { step: string; phase: string }) => `${entry.step.replace(/-\d+$/, '-G')} ${entry.phase}`
/** Each journal line as a boundary: its step and phase, and which time it is that they come. */
export function theBoundariesOf(entries: Array<{ step: string; phase: string }>) {
  const seen = new Map<string, number>()
  return entries.map((entry) => {
    const key = stepAndPhase(entry), nth = (seen.get(key) ?? 0) + 1
    seen.set(key, nth)
    return `${key} ${String(nth)}`
  })
}
/** The configuration of a run that publishes, with a passing target verifier, or of one whose target verifier rejects. */
export const configFor = (f: Fixture, run: Boundary['run']) => closed(f, run === 'rejecting' ? 'process.exit(7);' : '')

/**
 * HOW A PROGRAM ENDED, AND ALL IT WROTE. This resolves at 'close', once every holder of the program's output has closed
 * it, and not at 'exit': output can still be on its way when the program has exited, and a failure read then can lose
 * the program's own last sentence. A process the program started that keeps that output open keeps this waiting. The
 * groups the upgrade starts write to files of their own, so none of them does.
 */
export function theEndOf(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null; said: string }> {
  let said = ''
  child.stderr!.on('data', (b) => { said += b }); child.stdout!.on('data', (b) => { said += b })
  return new Promise((ok) => child.once('close', (code, signal) => ok({ code, signal, said })))
}

/**
 * RUN THE CLOSED UPGRADE IN A PROGRAM OF ITS OWN AND END IT BY SIGKILL right after the journal line of `at` is synced.
 * The process groups it started go on running, as they would after the program's own crash; each one it recorded is
 * added to the fixture's groups, so the test ends it. Resolves once the program has ended, with what it wrote. A run
 * that publishes and starts a recovery first is ended at the recovery's line instead, and the call fails with the
 * recovery's reason: after a recovery that run journals some of the lines of a run that publishes, and a crash there
 * would be read as a wrong resume.
 */
export async function crashTheUpgradeAt(f: Fixture, config: object, at: Boundary) {
  const input = join(f.folder, 'crash-config.json'); write(input, JSON.stringify(config))
  const script = join(f.folder, 'crash-controller.mts'), reached = join(f.folder, 'crash-reached'), recorded = join(f.folder, 'crash-groups'), recovered = join(f.folder, 'crash-recovered')
  const wanted = `${at.step} ${at.phase}`
  write(script, `import{readFileSync,appendFileSync,writeFileSync}from'node:fs';
import{upgradeStable}from${JSON.stringify(join(root, 'tools/stable/stable-upgrade-transaction.mjs'))};
import{fakeReleasePolicyFixture}from${JSON.stringify(join(root, 'tests/stable-release-policy-fixture.ts'))};
const config=JSON.parse(readFileSync(${JSON.stringify(input)},'utf8'));
const policy=fakeReleasePolicyFixture({config,baseline:${JSON.stringify(f.baseline)},tree:${JSON.stringify(f.policy.authorization.tree)}});
const officeRequest=Object.assign(async(request,destination)=>{if(!destination)return policy.officeRequest(request);const r=await fetch(destination.api+request.path,{method:request.method,...(request.body?{headers:{'content-type':'application/json'},body:JSON.stringify(request.body)}:{})});return{status:r.status,body:await r.text(),cut:false,location:null}},{identity:policy.officeRequest.identity});
const seen=new Map();
const onJournal=e=>{
  if(e.pgid)appendFileSync(${JSON.stringify(recorded)},e.pgid+'\\n');
  if(${String(at.run === 'publishing')}&&e.step==='recovery'&&e.phase==='attempt'){writeFileSync(${JSON.stringify(recovered)},String(e.reason));process.kill(process.pid,'SIGKILL')}
  const key=e.step.replace(/-\\d+$/,'-G')+' '+e.phase,nth=(seen.get(key)??0)+1;seen.set(key,nth);
  if(key===${JSON.stringify(wanted)}&&nth===${String(at.nth)}){writeFileSync(${JSON.stringify(reached)},String(e.sequence));process.kill(process.pid,'SIGKILL')}
};
await upgradeStable(config,{officeRequest,verifyEvidence:async()=>({}),onJournal});`)
  const child = spawn(process.execPath, ['--import', 'tsx', script], { cwd: root, detached: true, env: { PATH: process.env.PATH, HOME: f.folder, LANG: 'C', TZ: f.config.serviceSettings.TZ }, stdio: ['ignore', 'pipe', 'pipe'] })
  groups.add(child.pid!); children.push(child)
  const ended = await theEndOf(child)
  if (existsSync(recorded)) for (const pid of readFileSync(recorded, 'utf8').trim().split('\n')) groups.add(Number(pid))
  if (existsSync(recovered)) throw new Error(`The upgrade started a recovery before the crash point, ${theBoundaryIn(at)}: ${readFileSync(recovered, 'utf8')}`)
  return { ...ended, reached: existsSync(reached) }
}

/**
 * A RESTART BY HAND OF THE MADE-UP OFFICE: its serve-dev, started in the stable checkout on the fixture's database and
 * port, as the fixture starts it. Resolves with how it ended and what it wrote on standard error.
 */
export async function aStartOfTheMadeUpOffice(f: Fixture) {
  const gated = commandUnderTheOwnerWatchingGate(['tools/serve-dev.mjs', '--built', '--prepared'])
  const child = spawn(gated.command, gated.args, { cwd: f.stable, detached: true, env: { PATH: process.env.PATH, HOME: f.config.serviceHome, LANG: 'C', MOLE_OFFICE_DEVELOPMENT_CHECKOUT: f.dev, MOLE_OFFICE_MESSAGE_WORKER: 'off', MOLE_OFFICE_DB: f.database, MOLE_OFFICE_PORT: String(f.config.servicePort), MOLE_OFFICE_START_MODE: 'ordinary' }, stdio: ['ignore', 'pipe', 'pipe'] })
  groups.add(child.pid!); children.push(child)
  let stderr = ''; child.stderr!.on('data', (b) => { stderr += b })
  const ended = new Promise<number | null>((ok) => child.once('exit', (code) => ok(code)))
  const code = await Promise.race([ended, delay(20_000).then(() => 'still running' as const)])
  return { code, stderr }
}

/**
 * THE REST OF THE CRASH PROOF AT ONE BOUNDARY, once crashTheUpgradeAt has ended the program there: the lock stays; while
 * the mark is there, only the old version answers until its processes are stopped, and nothing ordinary answers after
 * that; a restart is refused with the sentence; another upgrade refuses; the resume ends as theResumeEnds says and takes
 * the mark and lock away; "published" comes only through a verifier pass; the private rows are the generation that opened.
 */
export async function theCrashIsResumed(f: Fixture, b: Boundary, crash: Awaited<ReturnType<typeof crashTheUpgradeAt>>) {
  expect(crash.reached, crash.said).toBe(true)
  expect(crash.signal, crash.said).toBe('SIGKILL')
  const lock = join(f.stable, '.git/stable-upgrade.lock')
  expect(existsSync(lock)).toBe(true)
  const journalled = rows(lock)
  const written = lastWhere(journalled, (e) => e.step === 'upgrade-mark' && e.phase === 'written')
  const marked = written > lastWhere(journalled, (e) => e.step === 'upgrade-mark' && e.phase === 'cleared')
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(marked)
  if (marked) {
    if (journalled.some((e) => e.step === 'exclusive-lock-guard' && e.phase === 'taken')) await unavailable(f)
    else await onlyTheOldVersionAnswers(f)
    const restart = await aStartOfTheMadeUpOffice(f)
    expect(restart.code, restart.stderr).toBe(1)
    expect(restart.stderr).toContain(`the stable upgrade from ${f.baseline} to ${f.target} (tag ${candidateTag})`)
    expect(restart.stderr).toContain(`; ${theResumeCommand(f.stable, lock)} resumes it`)
  }
  const before = readFileSync(lock, 'utf8')
  await expect(upgradeStable(configFor(f, b.run), f.options)).rejects.toThrow()
  expect(readFileSync(lock, 'utf8')).toBe(before)
  const resumed = remember(await resumeStableUpgrade(lock, f.options))
  expect(resumed.state, JSON.stringify(resumed)).toBe(theResumeEnds(b))
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(false)
  expect(existsSync(lock)).toBe(false)
  const all = rows(resumed.paths.journal)
  all.forEach((e, at) => {
    if (e.phase !== 'gate-attempt' || !['ordinary-start', 'recover-start'].includes(e.step)) return
    const closure = lastWhere(all.slice(0, at), (x) => x.step === 'closed-time' && x.phase === 'started')
    const pass = e.step === 'ordinary-start' ? 'verified' : 'recovered'
    expect(all.slice(closure, at).some((x) => x.step === 'closed-verification' && x.phase === pass), `${e.step} gate-attempt without a verifier pass since the office closed`).toBe(true)
  })
  if (resumed.state === 'published') {
    expect(snapshot(f).migrated).toBeDefined()
    expect((await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/health`)).json()).world.head).toBe(f.target.slice(0, 7))
    expect((await fetch(`http://127.0.0.1:${f.config.servicePort}/api/fixture-write`, { method: 'POST' })).status).toBe(200)
  } else await baselineIsBack(f)
}
/** Before the old version's processes are stopped, what answers is the old version, or nothing. */
async function onlyTheOldVersionAnswers(f: Fixture) {
  let health: { world?: { head?: string } }
  try { health = await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/health`, { signal: AbortSignal.timeout(1000) })).json() }
  catch (error) { if (!(error instanceof TypeError) && !(error instanceof DOMException)) throw error; return }
  expect(health.world?.head).toBe(f.baseline.slice(0, 7))
}
