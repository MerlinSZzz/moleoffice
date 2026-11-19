// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The actual transaction, wholly made-up services and verifier programs. No identity transformation is supplied. */
import { expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import Database from 'better-sqlite3'
import { upgradeStable, validateUpgradeConfig, processIdentity } from '../tools/stable/stable-upgrade-transaction.mjs'
import { stableUpgradeFixture, baselineIsBack, remember, track, groups, children, snapshot, write, root } from './stable-upgrade-fixture.ts'
import { LIMITS, closed, rows, unavailable } from './a-closed-stable-upgrade.ts'
import { theResumeCommand, theUpgradeMarkPath } from '../src/config/the-upgrade-mark.mjs'

it('validates the explicit opt-in contract before any mutation and preserves an ordinary default', async () => {
  const f = await stableUpgradeFixture()
  const config = closed(f)
  expect(validateUpgradeConfig(config).config.closedVerification).toEqual(config.closedVerification)
  for (const value of [null, {}, { checks: ['x'] }, { ...config.closedVerification, command: [] }, { ...config.closedVerification, command: ['missing'] }, { ...config.closedVerification, command: [join(f.folder, 'absent')] }, { ...config.closedVerification, timeoutMs: 0 }, { ...config.closedVerification, timeoutMs: 1.5 }, { ...config.closedVerification, checks: [] }, { ...config.closedVerification, checks: ['x', 'x'] }, { ...config.closedVerification, checks: [''] }, { ...config.closedVerification, repair: true }]) {
    expect(() => validateUpgradeConfig({ ...f.config, closedVerification: value })).toThrow(/verification|verifier/i)
  }
  expect(existsSync(join(f.stable, '.git/stable-upgrade.lock'))).toBe(false)
  const ordinary = remember(await upgradeStable(f.config, f.options))
  expect(ordinary.state, JSON.stringify(ordinary)).toBe('published')
  expect(existsSync(join(f.folder, 'verified-phases'))).toBe(false)
})

it('refuses a closed verification without both limits on the closed time, with either out of range, or with the deadline not below the maximum', async () => {
  const f = await stableUpgradeFixture()
  const limited = closed(f).closedVerification
  const { abortDeadlineMs, maxClosedMs, ...without } = limited
  for (const value of [without, { ...without, abortDeadlineMs }, { ...without, maxClosedMs }, { ...limited, abortDeadlineMs: 0 }, { ...limited, abortDeadlineMs: 1.5 }, { ...limited, abortDeadlineMs: '60000' }, { ...limited, maxClosedMs: 86_400_001 }, { ...limited, abortDeadlineMs: maxClosedMs }, { ...limited, abortDeadlineMs: maxClosedMs + 1 }]) {
    expect(() => validateUpgradeConfig({ ...f.config, closedVerification: value }), JSON.stringify(value)).toThrow(/^Closed verification: .*(abortDeadlineMs|maxClosedMs)/)
  }
  for (const limits of [{ abortDeadlineMs: 1, maxClosedMs: 2 }, { abortDeadlineMs: 86_399_999, maxClosedMs: 86_400_000 }]) {
    expect(validateUpgradeConfig({ ...f.config, closedVerification: { ...limited, ...limits } }).config.closedVerification).toEqual({ ...limited, ...limits })
  }
  expect(existsSync(join(f.stable, '.git/stable-upgrade.lock'))).toBe(false)
})

it('names both limits and the resume command in the dry plan, and writes no mark', async () => {
  const f = await stableUpgradeFixture()
  const result = await upgradeStable(closed(f), { ...f.options, dry: true })
  expect(result.state, JSON.stringify(result)).toBe('dry')
  const plan = result.plan.join('\n')
  expect(plan).toContain(`If the target verifier has not passed ${String(LIMITS.abortDeadlineMs)} ms after that, the upgrade rolls back from the snapshot.`)
  expect(plan).toContain(`If the office is not open ${String(LIMITS.maxClosedMs)} ms after that, the rollback stops and the office stays closed.`)
  expect(plan).toContain(`${theResumeCommand(f.stable, join(f.stable, '.git/stable-upgrade.lock'))} resumes the upgrade`)
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(false)
  expect(existsSync(join(f.stable, '.git/stable-upgrade.lock'))).toBe(false)
}, 60_000)

it('rolls back from the snapshot and opens the verified old version when the abort deadline passes during a pause', async () => {
  const f = await stableUpgradeFixture()
  const limits = { abortDeadlineMs: 4_000, maxClosedMs: 60_000 }
  let closedAt = 0, paused = false
  const result = remember(await upgradeStable(closed(f, '', '', limits), { ...f.options,
    onJournal(e: any) { if (e.step === 'closed-time' && e.phase === 'started' && closedAt === 0) closedAt = Date.now() },
    async onStep(e: any) { track(e); if (e.step === 'stable-check' && e.phase === 'before') { paused = true; await delay(Math.max(0, closedAt + limits.abortDeadlineMs + 200 - Date.now())) } } }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(paused, 'the abort deadline passed before the stable check began, so it did not pass during the pause').toBe(true)
  expect(result.failure).toContain('the abort deadline of 4000 ms')
  expect(readFileSync(join(f.folder, 'verified-phases'), 'utf8')).toBe('recovery\n')
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(false)
  await baselineIsBack(f)
}, 120_000)

it('rolls back when the target verifier still runs at the abort deadline, though its own timeout is longer', async () => {
  const f = await stableUpgradeFixture()
  const config = closed(f, 'setInterval(()=>{},1000);await new Promise(()=>{});', '', { abortDeadlineMs: 4_000, maxClosedMs: 60_000 })
  config.closedVerification.timeoutMs = 120_000
  const started = Date.now()
  const result = remember(await upgradeStable(config, f.options))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(result.failure).toContain('the abort deadline of 4000 ms')
  expect(Date.now() - started).toBeLessThan(60_000)
  expect(readFileSync(join(f.folder, 'verified-phases'), 'utf8')).toBe('target\nrecovery\n')
  await baselineIsBack(f)
}, 120_000)

it('stops a rollback at the maximum closed time and keeps the office closed, with the lock, the mark and the resume command', async () => {
  const f = await stableUpgradeFixture()
  const config = closed(f, 'process.exit(7);', 'setInterval(()=>{},1000);await new Promise(()=>{});', { abortDeadlineMs: 4_000, maxClosedMs: 8_000 })
  config.closedVerification.timeoutMs = 120_000
  const result = remember(await upgradeStable(config, f.options))
  expect(result.state, JSON.stringify(result)).toBe('NOT RESTORED')
  expect(result.restoreFailure).toContain('the maximum closed time of 8000 ms')
  expect(result.resume).toBe(theResumeCommand(f.stable, result.paths.lock))
  expect(existsSync(result.paths.lock)).toBe(true)
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(true)
  expect(readFileSync(join(f.folder, 'verified-phases'), 'utf8')).toBe('target\nrecovery\n')
  await unavailable(f)
}, 120_000)

it('takes the snapshot first when the rollback begins before it, then restores the database from it and checks it', async () => {
  const f = await stableUpgradeFixture()
  const result = remember(await upgradeStable(closed(f), { ...f.options, onStep(e: any) {
    track(e)
    // The last point before the snapshot: every old group is stopped and the database guarded, and private-backup has
    // not begun. The sanitized backup that came first is no longer taken, so its before is gone.
    if (e.step === 'private-backup' && e.phase === 'before') throw Error('Synthetic failure before the snapshot')
  } }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  const journal = rows(result.paths.journal)
  const at = (step: string, phase: string) => journal.findIndex(r => r.step === step && r.phase === phase)
  expect(at('recover-snapshot', 'attempt')).toBeGreaterThan(0)
  expect(at('database-snapshot', 'ready')).toBeGreaterThan(at('recover-snapshot', 'attempt'))
  expect(at('recover-database', 'done')).toBeGreaterThan(at('recover-snapshot', 'done'))
  expect(readFileSync(join(f.folder, 'verified-phases'), 'utf8')).toBe('recovery\n')
  await baselineIsBack(f)
}, 60_000)

it('keeps ordinary admission closed, snapshot and lock intact, and the same holder alive until verification passes', async () => {
  const f = await stableUpgradeFixture()
  const holder = await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/fixture-holder`, { method: 'POST' })).json()
  groups.add(holder.pid)
  const birth = processIdentity(holder.pid).startTime
  const events: any[] = []
  let verifying = false
  const result = remember(await upgradeStable(closed(f, 'await new Promise(ok=>setTimeout(ok,100));'), { ...f.options, onStep: async (e: any) => {
    track(e); events.push(e)
    if (e.step === 'verify-target' && e.phase === 'before') {
      verifying = true
      expect(existsSync(e.paths.lock)).toBe(true); expect(existsSync(e.paths.privateDatabase)).toBe(true)
      await unavailable(f)
      expect(processIdentity(holder.pid).startTime).toBe(birth)
    }
    if (e.step === 'ordinary-start' && e.phase === 'before') {
      expect(verifying).toBe(true)
      expect(readFileSync(join(f.folder, 'verified-phases'), 'utf8')).toBe('target\n')
      expect(rows(e.paths.lock).some(r => r.step === 'closed-verification' && r.phase === 'verified')).toBe(true)
    }
  } }))
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(events.some(e => e.step === 'verify-target')).toBe(true)
  expect(processIdentity(holder.pid).startTime).toBe(birth)
  expect(existsSync(f.database + '.holder-signalled')).toBe(false)
  const phases = rows(result.paths.journal).filter(r => r.step === 'closed-verification').map(r => r.phase)
  expect(phases).toEqual(['attempted', 'committed-awaiting-verification', 'verified'])
  expect(existsSync(result.paths.lock)).toBe(false)
  expect((await fetch(`http://127.0.0.1:${f.config.servicePort}/api/fixture-write`, { method: 'POST' })).status).toBe(200)
})

for (const [name, fault] of [
  ['missing result', 'process.exit(0);'],
  ['malformed result', "writeFileSync(resultPath,'{',{mode:0o600});process.exit(0);"],
  ['incomplete checks', "r.checks.pop();"],
  ['unknown result field', "writeFileSync(resultPath,JSON.stringify({version:1,phase:r.phase,commit:r.commit,stateSha256:r.stateSha256,checks:Object.fromEntries(r.checks.map(n=>[n,true])),repair:true}),{mode:0o600});process.exit(0);"],
  ['rejected check', "writeFileSync(resultPath,JSON.stringify({version:1,phase:r.phase,commit:r.commit,stateSha256:r.stateSha256,checks:Object.fromEntries(r.checks.map(n=>[n,false]))}),{mode:0o600});process.exit(0);"],
  ['wrong generation', "r.commit='0'.repeat(40);"],
  ['wrong version', "writeFileSync(resultPath,JSON.stringify({version:2,phase:r.phase,commit:r.commit,stateSha256:r.stateSha256,checks:Object.fromEntries(r.checks.map(n=>[n,true]))}),{mode:0o600});process.exit(0);"],
  ['wrong phase', "r.phase='other';"],
  ['wrong frozen digest', "r.stateSha256='0'.repeat(64);"],
  ['truthy nonboolean checks', "writeFileSync(resultPath,JSON.stringify({version:1,phase:r.phase,commit:r.commit,stateSha256:r.stateSha256,checks:Object.fromEntries(r.checks.map(n=>[n,'true']))}),{mode:0o600});process.exit(0);"],
  ['extra check', "r.checks.push('undeclared');"],
  ['request mutation', "chmodSync(requestPath,0o600);writeFileSync(requestPath,'{}');"],
  ['artifact mutation disguised as success', "writeFileSync(r.repository+'/dist/web/index.html','synthetic-corruption');"],
  ['nonzero command', 'process.exit(7);'],
  ['timeout', 'await new Promise(()=>{});setInterval(()=>{},1000);'],
  ['database mutation disguised as success', "const writable=new Database(r.database);writable.exec(\"UPDATE held_keys SET key_hash='synthetic-corruption'\");writable.close();"],
] as const) it(`refuses ${name} and verifies exact snapshot recovery before ordinary admission resumes`, async () => {
  const f = await stableUpgradeFixture()
  const config = closed(f, fault)
  if (name === 'timeout') { config.closedVerification.timeoutMs = 250; write(join(f.folder, 'verifier.mjs'), readFileSync(join(f.folder, 'verifier.mjs'), 'utf8').replace('await new Promise(()=>{});setInterval(()=>{},1000);', 'setInterval(()=>{},1000);await new Promise(()=>{});')) }
  const result = remember(await upgradeStable(config, f.options))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(result.failure).toMatch(/verif|bound|frozen/i)
  await baselineIsBack(f)
  expect(snapshot(f).keys).toEqual([{ id: 'private', key_hash: 'not-a-real-credential' }])
  expect(rows(result.paths.journal).some(r => r.step === 'closed-verification' && r.phase === 'recovered')).toBe(true)
  expect(readFileSync(join(f.folder, 'verified-phases'), 'utf8')).toContain('recovery\n')
})

it('keeps admission and the original lock closed when restoration verification fails', async () => {
  const f = await stableUpgradeFixture()
  const result = remember(await upgradeStable(closed(f, 'process.exit(7);', 'process.exit(8);'), f.options))
  expect(result.state, JSON.stringify(result)).toBe('NOT RESTORED')
  expect(result.restoreFailure).toMatch(/verif/i)
  expect(existsSync(result.paths.lock)).toBe(true)
  expect(rows(result.paths.lock).some(r => r.step === 'recovery' && r.phase === 'failed')).toBe(true)
  await unavailable(f)
})

it('refuses a verifier that corrupts the private snapshot and never publishes a manufactured restoration', async () => {
  const f = await stableUpgradeFixture()
  const result = remember(await upgradeStable(closed(f, "const writable=new Database(r.snapshot);writable.exec(\"UPDATE held_keys SET key_hash='synthetic-corruption'\");writable.close();"), f.options))
  expect(result.state, JSON.stringify(result)).toBe('NOT RESTORED')
  expect(result.restoreFailure).toMatch(/snapshot/i)
  expect(existsSync(result.paths.lock)).toBe(true)
  await unavailable(f)
})

it('rolls back an interruption at the committed boundary without attempting ordinary target publication', async () => {
  const f = await stableUpgradeFixture()
  const observed: string[] = []
  const result = remember(await upgradeStable(closed(f), { ...f.options, onStep(e: any) {
    track(e); observed.push(e.step)
    if (e.step === 'verify-target' && e.phase === 'before') throw Error('Synthetic interruption before verification')
  } }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(observed).not.toContain('ordinary-start')
  await baselineIsBack(f)
})

it('leaves the original lock closed after the controller is killed before verification; a second invocation refuses', async () => {
  const f = await stableUpgradeFixture()
  const config = closed(f)
  const input = join(f.folder, 'crash-config.json'); write(input, JSON.stringify(config))
  const script = join(f.folder, 'crash-controller.mts'), reached = join(f.folder, 'crash-reached')
  write(script, `import{readFileSync,appendFileSync,writeFileSync}from'node:fs';
import{upgradeStable}from${JSON.stringify(join(root, 'tools/stable/stable-upgrade-transaction.mjs'))};
import{fakeReleasePolicyFixture}from${JSON.stringify(join(root, 'tests/stable-release-policy-fixture.ts'))};
const config=JSON.parse(readFileSync(${JSON.stringify(input)},'utf8'));
const policy=fakeReleasePolicyFixture({config,baseline:${JSON.stringify(f.baseline)},tree:${JSON.stringify(f.policy.authorization.tree)}});
const officeRequest=Object.assign(async(request,destination)=>{if(!destination)return policy.officeRequest(request);const r=await fetch(destination.api+request.path,{method:request.method,...(request.body?{headers:{'content-type':'application/json'},body:JSON.stringify(request.body)}:{})});return{status:r.status,body:await r.text(),cut:false,location:null}},{identity:policy.officeRequest.identity});
await upgradeStable(config,{officeRequest,verifyEvidence:async()=>({}),onStep:async e=>{if(e.pgid)appendFileSync(${JSON.stringify(join(f.folder, 'crash-groups'))},e.pgid+'\\n');if(e.step==='verify-target'&&e.phase==='before'){writeFileSync(${JSON.stringify(reached)},'closed');await new Promise(()=>{});}}});`)
  const child = spawn(process.execPath, ['--import', 'tsx', script], { cwd: root, detached: true, env: { PATH: process.env.PATH, HOME: f.folder, LANG: 'C' }, stdio: ['ignore', 'pipe', 'pipe'] })
  groups.add(child.pid!); children.push(child)
  let said = ''; child.stderr!.on('data', b => { said += b })
  for (let n = 0; n < 1500 && !existsSync(reached) && child.exitCode === null; n++) await delay(10)
  const recorded = join(f.folder, 'crash-groups')
  if (existsSync(recorded)) for (const pid of readFileSync(recorded, 'utf8').trim().split('\n')) groups.add(Number(pid))
  expect(existsSync(reached), said).toBe(true)
  await unavailable(f)
  process.kill(-child.pid!, 'SIGKILL')
  await new Promise<void>(ok => child.once('exit', () => ok()))
  const lock = join(f.stable, '.git/stable-upgrade.lock')
  expect(existsSync(lock)).toBe(true)
  expect(rows(lock).some(r => r.step === 'closed-verification' && r.phase === 'committed-awaiting-verification')).toBe(true)
  expect(rows(lock).some(r => r.step === 'ordinary-start')).toBe(false)
  // Local lock refusal must happen before now-dead original groups are inspected.
  await expect(upgradeStable(config, f.options)).rejects.toThrow(/already exists/)
  await unavailable(f)
}, 60_000)

for (const phase of ['target', 'recovery'] as const) it(`rechecks the verified ${phase} after its last before-start hook and before opening ordinary admission`, async () => {
  const f = await stableUpgradeFixture()
  const start = phase === 'target' ? 'ordinary-start' : 'recover-start'
  let injected = false
  const result = remember(await upgradeStable(closed(f, phase === 'recovery' ? 'process.exit(7);' : ''), { ...f.options, onStep(e: any) {
    track(e)
    if (e.step === start && e.phase === 'before') {
      const db = new Database(f.database)
      try { db.exec("UPDATE held_keys SET key_hash='synthetic-publication-gap'") } finally { db.close() }
      injected = true
    }
  } }))
  expect(injected).toBe(true)
  expect(result.state, JSON.stringify(result)).toBe(phase === 'target' ? 'restored' : 'NOT RESTORED')
  expect(rows(result.paths.journal).some(r => r.step === start && r.phase === 'gate-attempt')).toBe(false)
  if (phase === 'target') await baselineIsBack(f)
  else { expect(existsSync(result.paths.lock)).toBe(true); await unavailable(f) }
})

it('keeps the original snapshot pin and verifies recovery after a final descriptor-close failure', async () => {
  const f = await stableUpgradeFixture()
  let once = true
  const { closeSync } = await import('node:fs')
  const result = remember(await upgradeStable(closed(f), { ...f.options, closeFinalDescriptor(fd: number) {
    if (once) { once = false; throw Error('Synthetic final-close failure') }
    closeSync(fd)
  } }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  await baselineIsBack(f)
  expect(result.closedVerification.phase).toBe('recovery')
  expect(readFileSync(join(f.folder, 'verified-phases'), 'utf8')).toBe('target\nrecovery\n')
})

it('discloses an already verified target still available when final-close recovery meets a foreign lock', async () => {
  const f = await stableUpgradeFixture()
  let once = true
  const { closeSync } = await import('node:fs')
  const foreign = 'Synthetic later transaction owns this lock.'
  const result = remember(await upgradeStable(closed(f), { ...f.options, closeFinalDescriptor(fd: number) {
    closeSync(fd)
    if (once) { once = false; write(join(f.stable, '.git/stable-upgrade.lock'), foreign); throw Error('Synthetic close failure after verified publication') }
  } }))
  expect(result.state, JSON.stringify(result)).toBe('NOT RESTORED')
  expect(result.verifiedState).toBe('published')
  expect(result.restoreFailure).toContain('Another transaction owns')
  expect(result.remainingGroups.some((g: any) => g.port === f.config.servicePort)).toBe(true)
  expect(readFileSync(result.paths.lock, 'utf8')).toBe(foreign)
  expect(rows(result.paths.journal).some(r => r.step === 'closed-verification' && r.phase === 'verified')).toBe(true)
  expect(readFileSync(join(f.folder, 'verified-phases'), 'utf8')).toBe('target\n')
  expect((await fetch(`http://127.0.0.1:${f.config.servicePort}/api/fixture-write`, { method: 'POST' })).status).toBe(200)
})
