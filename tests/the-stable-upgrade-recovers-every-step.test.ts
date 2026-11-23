// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { stableUpgradeFixture as fixture, stableUpgradeFixtureOwnedByAStandIn as fixtureOwnedByAStandIn, THE_TARGETS_MIGRATION, root, fixtureTimeZone, databaseModule, baselineTag, out, groups, children, folders, standIns, run, git, write, port, remember, track, snapshot, baselineIsBack } from './stable-upgrade-fixture.ts'
import { afterEach, describe, expect, it } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { chmodSync, closeSync, cpSync, existsSync, fstatSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'
import Database from 'better-sqlite3'
import { apiApp, freshDb } from './helpers.ts'
import { requireIndependentArtifactHardLinks, requireIndependentArtifactTargets, requireIndependentGitObjects } from '../tools/independent-storage.mjs'
import { localStamp, theClockZone } from '../src/shared/time.ts'
import { receiptFromArtifacts } from '../tools/periodic-main-suite.mjs'
import { artifactIdentity, processIdentity, retryStableUpgradeNotice, upgradeStable, validateUpgradeConfig } from '../tools/stable/stable-upgrade-transaction.mjs'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'
import { theGateCountSpoolStep } from '../tools/stable/stable-gate-count-spool-step.mjs'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { aLineThatEndsWithItsOwner, aLineThatStopsAServerWithItsStarterOrOwner, aStandInOwner, commandThatWatchesItsOwnerFromInside, commandUnderTheOwnerWatchingGate, endTheStandIns, theseGroupsEndAfterASigkillOf } from './the-owner-watching-gate.ts'

async function filePolicy(config: any, request: (request: any) => Promise<any>) {
  const serving = { commit: git(config.stableCheckout, 'rev-parse', 'HEAD'), repository: config.stableCheckout, database: config.database, port: config.servicePort }
  const created = await request({ method: 'POST', path: '/api/records', body: { kind: 'note', title: 'Synthetic baseline operator attestation', data: { body: 'Made-up secretary baseline attestation for this throwaway transaction.', extra: { stableReleaseBaseline: { version: 1, kind: 'operator-attestation', reason: 'Synthetic first baseline.', baselineTag: config.previousBaselineTag, serving, establishedAt: new Date(Date.now() - 181 * 60_000).toISOString() } } } } })
  expect(created.status, created.body).toBe(201)
  const baselineId = JSON.parse(created.body).record.id
  const baseline = JSON.parse((await request({ method: 'GET', path: `/api/records/${baselineId}/revisions/1` })).body)
  expect(baseline.provedBy).toBe('an-agent-key')
  const authorization = { version: 1, timeZone: fixtureTimeZone, mode: 'spacing', reason: 'Synthetic baseline is at least three hours old.', candidateTag: config.candidateTag, baselineTag: config.previousBaselineTag, fromCommit: serving.commit, toCommit: config.targetCommit, tree: git(config.developmentRepository, 'rev-parse', `${config.targetCommit}^{tree}`), evidence: { id: config.evidence.recordId, seq: config.evidence.seq, contentHash: config.evidence.contentHash }, serving, validFrom: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 10 * 60_000).toISOString(), baselineSource: { kind: 'bootstrap', note: { id: baselineId, seq: 1, contentHash: baseline.contentHash } } }
  const made = await request({ method: 'POST', path: '/api/records', body: { kind: 'note', title: 'Synthetic original release policy and notice', data: { body: config.notice, extra: { stableReleaseAuthorization: authorization } } } })
  expect(made.status, made.body).toBe(201)
  const id = JSON.parse(made.body).record.id
  const revision = JSON.parse((await request({ method: 'GET', path: `/api/records/${id}/revisions/1` })).body)
  expect(revision.provedBy).toBe('an-agent-key')
  config.noticeApproval = { id, seq: 1, contentHash: revision.contentHash }
}
async function authenticatedCliDry(f: Awaited<ReturnType<typeof fixture>>) {
  const toolFolder = mkdtempSync(join(out, 'upgrade-cli-')); folders.push(toolFolder)
  mkdirSync(join(toolFolder, 'tools'))
  // Assemble the independently owned reader without adding its file to this worker's branch.
  // On the merged branch the default is the normal tools file.
  const reader = process.env.STABLE_UPGRADE_EVIDENCE_SOURCE ?? join(root, 'tools/stable/stable-upgrade-evidence.mjs')
  for (const file of readdirSync(join(root, 'tools'))) {
    if (file !== 'stable') symlinkSync(join(root, 'tools', file), join(toolFolder, 'tools', file))
  }
  // tools/stable/ is made here, not linked, so the copies below never land in the checkout.
  mkdirSync(join(toolFolder, 'tools/stable'))
  for (const file of readdirSync(join(root, 'tools/stable'))) {
    if (['upgrade-stable.mjs', 'stable-upgrade-transaction.mjs', 'stable-upgrade-evidence.mjs'].includes(file)) continue
    symlinkSync(join(root, 'tools/stable', file), join(toolFolder, 'tools/stable', file))
  }
  for (const file of ['upgrade-stable.mjs', 'stable-upgrade-transaction.mjs']) cpSync(join(root, 'tools/stable', file), join(toolFolder, 'tools/stable', file))
  cpSync(reader, join(toolFolder, 'tools/stable/stable-upgrade-evidence.mjs'))
  for (const file of ['src', 'node_modules', 'tsconfig.json']) symlinkSync(join(root, file), join(toolFolder, file))
  const attempt = join(f.folder, 'attempt-fixture'); mkdirSync(attempt)
  const clone = join(attempt, 'clone'); git(f.folder, 'clone', '--no-local', f.dev, clone); git(clone, 'checkout', '--detach', f.target)
  const paths = { log: join(attempt, 'suite.log'), report: join(attempt, 'report.json'), manifest: join(attempt, 'manifest.json'), reads: join(attempt, 'reads') }
  mkdirSync(paths.reads); write(join(paths.reads, 'synthetic.json'), '{}')
  write(paths.log, 'Made-up cloud fixture; no whole suite was run.\n')
  write(paths.manifest, JSON.stringify([{ file: join(clone, 'tests/synthetic.test.ts') }]))
  write(paths.report, JSON.stringify({ success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, numTotalTestSuites: 1, numPassedTestSuites: 1, numFailedTestSuites: 0, numPendingTestSuites: 0, testResults: [{ name: join(clone, 'tests/synthetic.test.ts'), status: 'passed', assertionResults: [{ fullName: 'Made-up assertion', status: 'passed' }] }] }))
  const result = { code: 0, answer: { ran: true, code: 0, commit: f.target, phase: 'test', buildExitCode: 0, suiteExitCode: 0, wallSec: 1, workers: 1, files: 1, failed: [] }, output: join(attempt, 'door-output.log') }
  write(join(attempt, 'door-result.json'), JSON.stringify(result)); write(result.output, JSON.stringify(result.answer) + '\n')
  const receipt = receiptFromArtifacts({ repository: f.dev, commit: f.target, tree: git(f.dev, 'rev-parse', 'HEAD^{tree}'), clone, paths, result, startedAt: '2026-10-14 01:00:00', endedAt: '2026-10-14 01:00:01' })
  const office = await freshDb()
  const server = await apiApp()
  const previousKey = process.env.MOLE_AGENT_KEY
  try {
    const agent = office.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Synthetic transaction reader', data: { handle: 'synthetic-transaction-reader', runtime: 'codex', state: 'active' }, actor: office.api.HUMAN })
    const { agentForRecord } = await import('../src/server/lib/participants.ts')
    const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
    office.client.sqlite.prepare("UPDATE agents SET role = 'secretary' WHERE id = ?").run(agentForRecord(agent.id)!.id)
    // THE RUN SERVES THE READER, so the reader's own key holds it and may name it (src/server/lib/the-run-a-key-holds.ts).
    const session = office.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic transaction run', data: { state: 'running', runtime: 'mole-office', servingAgentId: agentForRecord(agent.id)!.id }, actor: office.api.HUMAN })
    const env = { PATH: process.env.PATH, TZ: fixtureTimeZone, MOLE_OFFICE_AGENT: 'synthetic-transaction-reader', MOLE_OFFICE_SESSION: session.id, MOLE_OFFICE_WORKSPACE: 'default', MOLE_AGENT_KEY: makeAnAgentKey(agentForRecord(agent.id)!.id, null), MOLE_OFFICE_API: await server.app.listen({ host: '127.0.0.1', port: 0 }) }
    // Canonical headers use this tool process's own generated fixture key.
    process.env.MOLE_AGENT_KEY = env.MOLE_AGENT_KEY
    const { askTheOffice } = await import('../tools/office-request.mjs')
    const created = await askTheOffice({ method: 'POST', path: '/api/records', body: { kind: 'whole_suite_receipt', title: 'Made-up transaction receipt', data: receipt } }, { env })
    expect(created.status, created.body).toBe(201)
    const id = JSON.parse(created.body).record.id
    const revision = JSON.parse((await askTheOffice({ method: 'GET', path: `/api/records/${id}/revisions/1` }, { env })).body)
    const config = { ...f.config, evidence: { recordId: id, seq: 1, contentHash: revision.contentHash } }
    await filePolicy(config, (request: any) => askTheOffice(request, { env }))
    const configFile = join(f.folder, 'cli-config.json'); write(configFile, JSON.stringify(config))
    const before = artifactIdentity(f.folder)
    const child = spawn(process.execPath, [join(toolFolder, 'tools/stable/upgrade-stable.mjs'), '--config', configFile, '--dry'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', error = ''
    child.stdout.on('data', (b) => { output += b }); child.stderr.on('data', (b) => { error += b })
    const code = await new Promise<number | null>((r) => child.once('exit', r))
    expect(code, error).toBe(0); expect(output).toContain('"state": "dry"'); expect(error).toContain('Database recovery discards any writes'); expect(error).toContain('Clone the exact candidate')
    expect(artifactIdentity(f.folder)).toBe(before)
    expect(readdirSync(f.recovery)).toEqual([])
    const upgrade = spawn(process.execPath, [join(toolFolder, 'tools/stable/upgrade-stable.mjs'), '--config', configFile], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let upgraded = '', upgradeError = ''
    upgrade.stdout.on('data', (b) => { upgraded += b }); upgrade.stderr.on('data', (b) => { upgradeError += b })
    const upgradeCode = await new Promise<number | null>((r) => upgrade.once('exit', r))
    const outcome = JSON.parse(upgraded)
    remember(outcome)
    expect(upgradeCode, upgradeError + upgraded).toBe(0); expect(outcome.state).toBe('published'); expect(upgradeError).toContain('Attempting to install the locked candidate dependencies'); expect(upgradeError).toContain('Completed: verify the ordinary stable service')
    expect(readFileSync(join(f.stable, 'plugins/example/dist/main.html'), 'utf8')).toBe('candidate')
    expect(snapshot(f).records).toContainEqual({ id: 'migration', value: 'candidate' })
    expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.target)
  } finally {
    await server.app.close()
    if (process.env.STABLE_UPGRADE_KEEP_FIXTURES === 'yes') await office.client.sqlite.backup(join(f.folder, 'canonical-original-evidence.sqlite'))
    office.close()
    if (previousKey === undefined) delete process.env.MOLE_AGENT_KEY
    else process.env.MOLE_AGENT_KEY = previousKey
  }
}
it('accounts every retained artifact hard-link name without counting symbolic aliases or relaxing Git objects', () => {
  const folder = mkdtempSync(join(out, 'artifact-names-')); folders.push(folder)
  const checkout = join(folder, 'checkout'), dependencies = join(checkout, 'node_modules'), built = join(checkout, 'dist')
  mkdirSync(dependencies, { recursive: true }); mkdirSync(built)
  const original = join(dependencies, 'binary'), internal = join(dependencies, 'binary-copy'), crossRoot = join(built, 'binary-copy')
  write(original, 'Synthetic internal package binary'); linkSync(original, internal); linkSync(original, crossRoot)
  const roots = [dependencies, built]
  expect(() => requireIndependentArtifactTargets(checkout, ['node_modules', 'dist'])).not.toThrow()
  const identity = artifactIdentity(dependencies, checkout, roots)
  const copied = join(folder, 'copied'); cpSync(dependencies, copied, { recursive: true })
  expect(artifactIdentity(copied)).toBe(identity)
  expect(statSync(join(copied, 'binary')).nlink).toBe(1)
  const outside = join(folder, 'outside'); linkSync(original, outside)
  symlinkSync('binary', join(dependencies, 'alias'))
  expect(() => requireIndependentArtifactHardLinks(roots)).toThrow(/hard links/)
  expect(() => requireIndependentArtifactTargets(checkout, ['node_modules', 'dist'])).toThrow(/hard links/)
  rmSync(outside)
  expect(() => requireIndependentArtifactTargets(checkout, ['node_modules', 'dist'])).not.toThrow()
  const gitDir = join(folder, 'git'), objects = join(gitDir, 'objects'); mkdirSync(objects, { recursive: true })
  write(join(objects, 'one'), 'Synthetic Git object'); linkSync(join(objects, 'one'), join(objects, 'two'))
  expect(() => requireIndependentGitObjects(gitDir)).toThrow(/hard links/)
})

describe('the stable upgrade transaction, with real Git, SQLite, npm and HTTP fixtures', () => {
  it('refuses stable settings files and links before acquiring the lock', async () => {
    const f = await fixture()
    for (const linked of [false, true]) {
      const file = join(f.stable, '.env')
      if (linked) symlinkSync(join(f.dev, '.env'), file)
      else write(file, 'MOLE_OFFICE_WORKSPACE=wrong-file\n')
      await expect(upgradeStable(f.config, f.options)).rejects.toThrow(/stable.*\.env|\.env.*stable/i)
      expect(existsSync(join(f.stable, '.git/stable-upgrade.lock'))).toBe(false)
      expect(readdirSync(f.recovery)).toEqual([])
      rmSync(file)
    }
  }, 30_000)

  it('requires the development pairing line to name stable before acquiring the lock', async () => {
    const f = await fixture()
    const file = join(f.dev, '.env'), original = readFileSync(file, 'utf8')
    for (const pairing of ['', 'MOLE_OFFICE_STABLE_CHECKOUT='+f.dev+'\n']) {
      write(file, pairing+original.split('\n').filter(line => !line.startsWith('MOLE_OFFICE_STABLE_CHECKOUT=')).join('\n'))
      await expect(upgradeStable(f.config, f.options)).rejects.toThrow(/pair|MOLE_OFFICE_STABLE_CHECKOUT/)
      expect(existsSync(join(f.stable, '.git/stable-upgrade.lock'))).toBe(false)
      expect(readdirSync(f.recovery)).toEqual([])
    }
    write(file, original)
  }, 30_000)

  it('refuses a different development checkout in the serving environment', async () => {
    const f = await fixture(false, false, false, false, true)
    await expect(upgradeStable(f.config, f.options)).rejects.toThrow(/development checkout|MOLE_OFFICE_DEVELOPMENT_CHECKOUT/i)
    expect(readdirSync(f.recovery)).toEqual([])
  }, 30_000)

  it('accepts only the direct or gated serve-dev topology and refuses a foreign recorded group', async () => {
    for (const gated of [false, true]) {
      const f = await fixture(true, false, false, gated)
      expect(validateUpgradeConfig(f.config).config.serviceGroups).toHaveLength(3)
      const runtime = await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/runtime`)).json()
      expect(processIdentity(runtime.supervisor.pid).pgid).toBe(f.config.serviceGroups[0]!.pgid)
      expect(runtime.supervisor.pid === f.config.serviceGroups[0]!.pgid).toBe(!gated)
      if (gated) expect(processIdentity(runtime.supervisor.pid).ppid).toBe(f.config.serviceGroups[0]!.pgid)
      const foreignOwner = aStandInOwner(standIns)
      const foreign = spawn(process.execPath, ['-e', `${aLineThatEndsWithItsOwner(foreignOwner)}setInterval(()=>{},1000)`], { cwd: f.stable, detached: true, stdio: 'ignore', env: { PATH: process.env.PATH, MOLE_OFFICE_DB: f.database, MOLE_OFFICE_PORT: String(f.config.servicePort), MOLE_OFFICE_DEVELOPMENT_CHECKOUT: f.dev } })
      groups.add(foreign.pid!); children.push(foreign)
      const decoy = { ...f.config.serviceGroups[0], pgid: foreign.pid!, startTime: processIdentity(foreign.pid!).startTime }
      await expect(upgradeStable({ ...f.config, serviceGroups: [...f.config.serviceGroups, decoy] }, f.options)).rejects.toThrow(/topology|groups/)
      expect(readdirSync(f.recovery)).toEqual([])
      await theseGroupsEndAfterASigkillOf(foreignOwner, [foreign.pid!])
      const result = remember(await upgradeStable(f.config, { ...f.options, onStep: (event: any) => { track(event); if (event.step === 'notice' && event.phase === 'before') throw Error('Synthetic topology checkpoint') } }))
      expect(result.state, JSON.stringify(result)).toBe('unchanged')
    }
  }, 60_000)

  it('refuses an unrelated process that remains inside the server group', async () => {
    const f = await fixtureOwnedByAStandIn(false, false, false, false, false)
    const owner = f.owner
    const runtime = await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/runtime`)).json()
    expect((await fetch(`http://127.0.0.1:${f.config.servicePort}/api/fixture-group-orphan`, { method: 'POST' })).status).toBe(200)
    const ready = f.database+'.orphan-pid'
    for (let n = 0; n < 100 && !existsSync(ready); n++) await delay(10)
    const orphan = processIdentity(Number(readFileSync(ready, 'utf8')))
    expect(orphan.pgid).toBe(runtime.process.pid)
    let ancestor = orphan
    while (ancestor.ppid > 1 && ancestor.pid !== runtime.process.pid) ancestor = processIdentity(ancestor.ppid)
    expect(ancestor.pid).not.toBe(runtime.process.pid)
    await expect(upgradeStable(f.config, f.options)).rejects.toThrow(/outside.*topology|topology.*outside/)
    expect(existsSync(join(f.stable, '.git/stable-upgrade.lock'))).toBe(false)
    expect(readdirSync(f.recovery)).toEqual([])
    // No TERM reaches the orphan once serve-dev ignores it, so only the orphan's own watch can end it with its owner.
    write(join(f.stable, '.ignore-term'), 'This office ignores TERM until this case removes this file.')
    try { await theseGroupsEndAfterASigkillOf(owner, f.config.serviceGroups.map((group: any) => group.pgid)) } finally { rmSync(join(f.stable, '.ignore-term'), { force: true }) }
  }, 30_000)

  it('restores serve-dev at the baseline tag after publication fails', async () => {
    const f = await fixture(true, false, false, true)
    f.config.serviceGroups.reverse()
    const steps: string[] = []
    const result = remember(await upgradeStable(f.config, { ...f.options, onStep: (event: any) => {
      track(event)
      if (event.phase === 'before') steps.push(event.step)
      if (event.step === 'recover-start' && event.phase === 'before') expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.baseline)
      if (event.step === 'ordinary-start-health' && event.phase === 'after') throw Error('Synthetic failure after publication')
    } }))
    expect(result.state, JSON.stringify(result)).toBe('restored')
    // Recovery renamed a new file over the database, so the answer says how the gate-count spool is handed to its new world (wave 13q item 1h).
    expect(result.gateCountSpool).toEqual(theGateCountSpoolStep({ database: f.config.database, home: f.config.serviceHome, change: 'restored' }))
    expect(steps.indexOf('recover-tag')).toBeLessThan(steps.indexOf('recover-checkout'))
    expect(steps.indexOf('recover-checkout')).toBeLessThan(steps.indexOf('recover-start'))
    await baselineIsBack(f)
  }, 60_000)

  it('refuses the bootstrap-shaped linked worktree before an ordinary upgrade', async () => {
    const f = await fixture(), prepared = join(f.folder, 'prepared-stable')
    expect(() => validateUpgradeConfig(f.config)).not.toThrow()
    git(f.dev, 'worktree', 'add', '-b', 'stable', '--', prepared, f.config.previousBaselineTag)
    git(f.dev, 'worktree', 'lock', '--reason', 'synthetic bootstrap preparation', prepared)
    expect(git(prepared, 'branch', '--show-current')).toBe('stable')
    expect(git(f.dev, 'worktree', 'list', '--porcelain')).toContain('locked synthetic bootstrap preparation')
    expect(() => validateUpgradeConfig({ ...f.config, stableCheckout: prepared })).toThrow('Stable must have independent Git storage, not a shared worktree.')
    expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.baseline)
  }, 60_000)

  it('refuses invalid identities before mutation and keeps dry validation read-only', async () => {
    const f = await fixture()
    const monitor = join(f.folder, 'fsmonitor.sh'); const marker = join(f.folder, 'fsmonitor-ran')
    write(monitor, `#!/bin/sh\nprintf ran > '${marker}'\n`); chmodSync(monitor, 0o700)
    git(f.dev, 'config', 'core.fsmonitor', monitor); git(f.stable, 'config', 'core.fsmonitor', monitor)
    const before = artifactIdentity(f.folder)
    const dry = await upgradeStable(f.config, { ...f.options, dry: true })
    expect(dry.state).toBe('dry'); expect(dry.says).toContain("key's last-use time and the API usage counters")
    expect(dry.plan.join('\n')).toContain('Ordinary runtime and health were not checked')
    expect(f.requests.some((r) => ['/api/runtime', '/api/health'].includes(r.path))).toBe(false)
    const forbiddenOrdinaryRead = async (request: any, destination: any) => {
      if (destination || ['/api/runtime', '/api/health'].includes(request.path)) throw new Error('Synthetic ordinary read would write Git state')
      return f.options.officeRequest(request, destination)
    }
    Object.assign(forbiddenOrdinaryRead, { identity: f.policy.officeRequest.identity })
    await expect(upgradeStable(f.config, { ...f.options, officeRequest: forbiddenOrdinaryRead, dry: true })).resolves.toMatchObject({ state: 'dry' })
    expect.soft(artifactIdentity(f.folder)).toBe(before)
    expect.soft(existsSync(marker)).toBe(false)
    git(f.dev, 'config', '--unset', 'core.fsmonitor'); git(f.stable, 'config', '--unset', 'core.fsmonitor')
    const filter = join(f.folder, 'synthetic-clean-filter.mjs')
    const filterMarker = join(f.folder, 'clean-filter-ran')
    const attributes = join(f.folder, 'synthetic-attributes')
    write(filter, `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(filterMarker)},'Synthetic filter marker');process.stdin.pipe(process.stdout);`)
    write(attributes, 'version.txt filter=probe\n')
    const filterCommand = [process.execPath, filter].map((value) => "'" + value.replaceAll("'", "'\\''") + "'").join(' ')
    git(f.stable, 'config', 'core.attributesFile', attributes)
    git(f.stable, 'config', 'filter.probe.clean', filterCommand)
    const version = join(f.stable, 'version.txt'), time = statSync(version)
    utimesSync(version, time.atime, new Date(time.mtimeMs + 2000))
    const requestsBeforeFilter = f.requests.length
    await expect(upgradeStable(f.config, { ...f.options, dry: true })).rejects.toThrow(/configured clean\/process filter/)
    expect(existsSync(filterMarker)).toBe(false)
    expect(f.requests.length).toBe(requestsBeforeFilter)
    git(f.stable, 'config', '--unset', 'filter.probe.clean')
    git(f.stable, 'config', '--unset', 'core.attributesFile')
    git(f.dev, 'config', 'remote.origin.promisor', 'true')
    await expect(upgradeStable(f.config, { ...f.options, dry: true })).rejects.toThrow(/partial-clone lazy fetching/)
    expect(f.requests.length).toBe(requestsBeforeFilter)
    git(f.dev, 'config', '--unset', 'remote.origin.promisor')
    expect(f.requests.every((r) => r.method === 'GET')).toBe(true)
    for (const noticeApproval of [undefined, { id: 'synthetic-approval', seq: 0, contentHash: 'bbbbbbbbbbbbbbbb' }, { id: 'synthetic-approval', seq: 1, contentHash: 'local-evidence' }]) {
      await expect(upgradeStable({ ...f.config, noticeApproval }, f.options)).rejects.toThrow()
    }
    const malformed = [
      { ok: 'true' }, { ok: 1 }, { ok: undefined }, { body: 'null' }, { body: '[]' }, { body: 'broken JSON' },
      { cut: undefined }, { cut: true }, { cut: 'false' }, { location: undefined }, { location: '' }, { location: '/redirect' }, { status: 204 },
    ]
    for (const variant of malformed) {
      const officeRequest = async (request: any, destination: any) => {
        const response = await f.options.officeRequest(request, destination)
        if (!destination || request.path !== '/api/health') return response
        const { ok, ...transport } = variant
        return { ...response, ...transport, ...('ok' in variant ? { body: JSON.stringify({ ...JSON.parse(response.body), ok }) } : {}) }
      }
      Object.assign(officeRequest, { identity: f.policy.officeRequest.identity })
      await expect.soft(upgradeStable(f.config, { ...f.options, officeRequest }), JSON.stringify(variant)).rejects.toThrow()
    }
    for (const patch of [ { targetCommit: 'short' }, { candidateTag: 'stable-1999-01-01-old' }, { targetCommit: f.baseline }, { serviceHome: f.recovery }, { serviceSettings: { MOLE_OFFICE_MESSAGE_WORKER: 'on' } }, { database: join(f.stable, 'absent.sqlite') }, { servicePort: f.config.releaseCheckPort }, { previousBaselineTag: 'absent' },  { serviceGroups: [{ ...f.config.serviceGroups[0], startTime: '0' }] }, { recoveryRoot: f.stable } ]) {
      await expect(upgradeStable({ ...f.config, ...patch }, { ...f.options, dry: true })).rejects.toThrow()
    }
    const unrelated = git(f.dev, 'commit-tree', git(f.dev, 'rev-parse', 'HEAD^{tree}'), '-m', 'Synthetic unrelated older root')
    git(f.dev, 'update-ref', 'refs/heads/main', unrelated)
    expect.soft(() => validateUpgradeConfig({ ...f.config, targetCommit: unrelated })).toThrow(/Git merge-base/)
    git(f.dev, 'update-ref', 'refs/heads/main', f.target)
    write(join(f.dev, 'dirty.txt'), 'uncommitted'); expect(() => validateUpgradeConfig(f.config)).toThrow(/dirty/); rmSync(join(f.dev, 'dirty.txt'))
    const dependencyAlias = join(f.stable, 'node_modules/baseline-only.txt'), hiddenTarget = join(f.stable, '.artifact-link')
    const originalDependency = readFileSync(dependencyAlias), exclude = join(f.stable, '.git/info/exclude'), originalExclude = readFileSync(exclude)
    for (const target of ['external-chain', 'shared-inside', 'unretained-inside', 'retained']) {
      try {
        writeFileSync(exclude, Buffer.concat([originalExclude, Buffer.from('\n/.artifact-link\n')]))
        rmSync(dependencyAlias)
        if (target === 'retained') symlinkSync('upgrade-fixture-dependency/index.js', dependencyAlias)
        else {
          symlinkSync('../.artifact-link', dependencyAlias)
          if (target === 'external-chain') symlinkSync(join(f.dev, 'version.txt'), hiddenTarget)
          if (target === 'shared-inside') linkSync(join(f.dev, 'version.txt'), hiddenTarget)
          if (target === 'unretained-inside') write(hiddenTarget, 'Independent bytes, outside every retained artifact root.')
        }
        const requestsBefore = f.requests.length
        if (target === 'retained') expect((await upgradeStable(f.config, { ...f.options, dry: true })).state).toBe('dry')
        else {
          await expect.soft(upgradeStable(f.config, { ...f.options, dry: true }), target).rejects.toThrow(/outside|hard links/)
          expect.soft(f.requests.length, target + ' refused before evidence reads').toBe(requestsBefore)
        }
        expect(readdirSync(f.recovery)).toEqual([])
      } finally {
        rmSync(dependencyAlias, { force: true }); writeFileSync(dependencyAlias, originalDependency)
        rmSync(hiddenTarget, { force: true }); writeFileSync(exclude, originalExclude)
      }
    }
    const sharedClone = join(f.folder, 'shared-clone')
    git(f.folder, 'clone', '--local', f.stable, sharedClone)
    const pack = readdirSync(join(f.stable, '.git/objects/pack')).find((name) => name.endsWith('.pack'))!
    expect(statSync(join(f.stable, '.git/objects/pack', pack)).nlink).toBeGreaterThan(1)
    expect.soft(() => validateUpgradeConfig(f.config)).toThrow(/hard links/)
    rmSync(sharedClone, { recursive: true })
    const movedObjects = join(f.folder, 'moved-objects'), objectPath = join(f.stable, '.git/objects')
    renameSync(objectPath, movedObjects); symlinkSync(movedObjects, objectPath)
    expect.soft(() => validateUpgradeConfig(f.config)).toThrow(/ordinary directory|symbolic links/)
    rmSync(objectPath); renameSync(movedObjects, objectPath)
    for (const file of ['node_modules/baseline-only.txt', 'dist/web/index.html', 'plugins/example/dist/main.html']) {
      const shared = join(f.dev, file)
      mkdirSync(resolve(shared, '..'), { recursive: true }); linkSync(join(f.stable, file), shared)
      const requestsBefore = f.requests.length
      await expect.soft(upgradeStable(f.config, { ...f.options, dry: true })).rejects.toThrow(/hard links/)
      expect(f.requests.length).toBe(requestsBefore); expect(readdirSync(f.recovery)).toEqual([])
      rmSync(shared)
    }
    const unreadableReady = join(f.folder, 'unreadable-ready')
    const unreadable = spawn('python3', ['-c', `import ctypes,time,pathlib; assert ctypes.CDLL(None).prctl(4,0,0,0,0)==0; pathlib.Path(${JSON.stringify(unreadableReady)}).write_text('ready'); time.sleep(30)`], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH } })
    groups.add(unreadable.pid!); children.push(unreadable)
    try {
      for (let n = 0; n < 200 && !existsSync(unreadableReady); n++) await delay(10)
      expect(existsSync(unreadableReady)).toBe(true)
      // An unreadable process holding no lock is set aside under the secretary's rule, not a holder, so dry validation passes.
      expect(() => validateUpgradeConfig(f.config)).not.toThrow()
    } finally { process.kill(-unreadable.pid!, 'SIGTERM'); await new Promise<void>((r) => unreadable.once('exit', () => r())) }
    const extraHolder = new Database(f.database)
    try { expect(() => validateUpgradeConfig(f.config)).toThrow(/holder outside/) } finally { extraHolder.close() }
    chmodSync(f.recovery, 0o755); expect(() => validateUpgradeConfig(f.config)).toThrow(/0700/); chmodSync(f.recovery, 0o700)
    git(f.stable, 'tag', f.config.candidateTag); expect(() => validateUpgradeConfig(f.config)).toThrow(/already exists/); git(f.stable, 'tag', '-d', f.config.candidateTag)
    const configFile = join(f.folder, 'config.json'); write(configFile, JSON.stringify(f.config))
    const cli = spawnSync(process.execPath, [join(root, 'tools/stable/upgrade-stable.mjs'), '--config', configFile, '--dry'], { encoding: 'utf8', env: { PATH: process.env.PATH, TZ: fixtureTimeZone }, timeout: 10000 })
    expect(cli.status).toBe(1); expect(cli.stderr).toContain('This run does not say who it is')
    expect(readdirSync(f.recovery)).toEqual([])
    await authenticatedCliDry(f)
    const external = await fixture(false, true)
    const beforeExternal = artifactIdentity(external.folder)
    await expect(upgradeStable(external.config, { ...external.options, dry: true })).rejects.toThrow(/external setting or secret/)
    expect(artifactIdentity(external.folder)).toBe(beforeExternal)
  }, 60_000)

  it('requires pinned release policy before runtime and discloses authenticated dry policy reads without local effects', async () => {
    const f = await fixture()
    const before = artifactIdentity(f.folder)
    const pin = f.config.noticeApproval
    const path = `/api/records/${pin.id}/revisions/${pin.seq}`
    const unavailable = async (request: any, destination: any) => {
      if (!destination && request.path === path) return { status: 404, body: '{}', cut: false, location: null }
      return f.options.officeRequest(request, destination)
    }
    Object.assign(unavailable, { identity: f.policy.officeRequest.identity })
    for (const dry of [true, false]) await expect(upgradeStable(f.config, { ...f.options, officeRequest: unavailable, dry })).rejects.toThrow('Release policy refused:')
    expect(f.requests.some(r => r.api || ['/api/runtime', '/api/health'].includes(r.path))).toBe(false)
    expect(artifactIdentity(f.folder)).toBe(before)
    const dry = await upgradeStable(f.config, { ...f.options, dry: true })
    expect(dry).toMatchObject({ state: 'dry', policy: { mode: 'spacing', approval: pin, baselineSource: f.policy.authorization.baselineSource } })
    expect(dry.says).toContain("key's last-use time and the API usage counters")
    expect(f.requests.some(r => r.path === path)).toBe(true)
    const source = f.policy.authorization.baselineSource.note
    expect(f.requests.some(r => r.path === `/api/records/${source.id}/revisions/${source.seq}`)).toBe(true)
    expect(f.requests.every(r => r.method === 'GET' && !r.api)).toBe(true)
    expect(artifactIdentity(f.folder)).toBe(before)
    expect(readdirSync(f.recovery)).toEqual([])
    expect(existsSync(join(f.stable, '.git/stable-upgrade.lock'))).toBe(false)
  }, 60_000)

  it('rechecks release policy under the lock before BEFORE and before stopping writers', async () => {
    for (const failAt of [2, 3, 4]) {
      const f = await fixture()
      const path = `/api/records/${f.config.noticeApproval.id}/revisions/${f.config.noticeApproval.seq}`
      let checks = 0
      const officeRequest = async (request: any, destination: any) => {
        if (!destination && request.path === path && ++checks === failAt) return { status: 404, body: '{}', cut: false, location: null }
        return f.options.officeRequest(request, destination)
      }
      Object.assign(officeRequest, { identity: f.policy.officeRequest.identity })
      const steps: string[] = []
      const result = remember(await upgradeStable(f.config, { ...f.options, officeRequest, onStep: (event: any) => { track(event); if (event.phase === 'before') steps.push(event.step) } }))
      expect(result.state, JSON.stringify(result)).toBe('unchanged')
      expect(result.failure).toContain('Release policy refused:')
      expect(checks).toBe(failAt)
      expect(steps.some(step => step.startsWith('old-stop-'))).toBe(false)
      expect(steps.includes('notice-before')).toBe(failAt === 4)
      expect(steps.includes('prepare-directories')).toBe(failAt !== 2)
      await baselineIsBack(f)
      const journal = readFileSync(result.paths.journal, 'utf8').trim().split('\n').map(line => JSON.parse(line))
      const policies = journal.filter(entry => entry.step === 'policy' && entry.phase === 'checked')
      expect(policies).toHaveLength(failAt - 1)
      for (const entry of policies) expect(entry.policy).toMatchObject({ mode: 'spacing', approval: f.config.noticeApproval, baselineSource: f.policy.authorization.baselineSource })
      expect(statSync(result.paths.journal).mode & 0o777).toBe(0o600)
    }
  }, 120_000)

  it('restores the exact baseline immediately after late failure with missing or expired forward authorization', async () => {
    for (const fault of ['missing', 'expired']) {
      const f = await fixture()
      let now = Date.now(), failed = false, recoveryPolicyReads = 0, exactDatabaseImage = false
      const path = `/api/records/${f.config.noticeApproval.id}/revisions/${f.config.noticeApproval.seq}`
      const officeRequest = async (request: any, destination: any) => {
        if (!destination && failed && request.path === path) {
          recoveryPolicyReads++
        }
        return f.options.officeRequest(request, destination)
      }
      Object.assign(officeRequest, { identity: f.policy.officeRequest.identity })
      const result = remember(await upgradeStable(f.config, { ...f.options, officeRequest, now: () => now, onStep: (event: any) => {
        track(event)
        if (event.step === 'recover-database' && event.phase === 'after') {
          expect(readFileSync(f.database)).toEqual(readFileSync(event.paths.privateDatabase))
          exactDatabaseImage = true
        }
        if (event.step === 'migrate' && event.phase === 'after' && !failed) {
          expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.target)
          expect(snapshot(f).migrated).toBeDefined()
          failed = true
          if (fault === 'missing') f.policy.records.delete(path)
          else now = Date.parse(f.policy.authorization.validUntil) + 1
          throw new Error('Synthetic late failure after forward policy disappears or expires')
        }
      } }))
      expect(failed).toBe(true)
      expect(result.state, JSON.stringify(result)).toBe('restored')
      expect(result.failure).toBe('Synthetic late failure after forward policy disappears or expires')
      expect(recoveryPolicyReads).toBe(0)
      expect(exactDatabaseImage).toBe(true)
      await baselineIsBack(f)
      expect(git(f.stable, 'tag', '--list', f.config.candidateTag)).toBe('')
      expect(result.notices.state).toBe('filed')
    }
  }, 120_000)

  it('builds locked isolated artifacts, records gated groups, and publishes through both excluded-write checks', async () => {
    const f = await fixture(true)
    const localSettings = readFileSync(join(f.dev, '.env'), 'utf8')
    await expect(upgradeStable({ ...f.config, serviceGroups: [f.config.serviceGroups[0]] }, f.options)).rejects.toThrow()
    const events: any[] = []
    const result = remember(await upgradeStable(f.config, { ...f.options, onStep: async (event: any) => {
      track(event); events.push(event)
      if (event.phase === 'gated') {
        const log = readFileSync(join(f.stable, '.git/stable-upgrade.lock'), 'utf8')
        expect(log).toContain('"pgid":' + event.pgid); expect(readFileSync(event.log, 'utf8')).toBe('')
      }
      if (event.step === 'notice' && event.phase === 'after') await expect(upgradeStable(f.config, f.options)).rejects.toThrow(/already exists/)
      if (['candidate-check-health', 'stable-check-health'].includes(event.step) && event.phase === 'after') {
        const chosen = event.step.startsWith('candidate') ? f.config.releaseCheckPort : f.config.servicePort
        const response = await fetch(`http://127.0.0.1:${chosen}/api/fixture-write`, { method: 'POST' })
        expect(response.status).toBe(503)
        if (event.step === 'candidate-check-health') {
          expect(snapshot(f).migrated).toBeUndefined()
          expect((await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/health`)).json()).world.head).toBe(f.baseline.slice(0, 7))
          const privateDb = new Database(event.paths.candidateDatabase, { readonly: true })
          try { expect(privateDb.prepare('SELECT port FROM migrated').get()).toEqual({ port: f.config.releaseCheckPort }) } finally { privateDb.close() }
        }
      }
    } }))
    expect(result.state, JSON.stringify(result)).toBe('published')
    expect(git(f.stable, 'branch', '--show-current')).toBe('stable'); expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.target)
    expect(git(f.stable, 'rev-parse', f.config.candidateTag)).toBe(f.target)
    expect(readFileSync(join(f.stable, 'plugins/example/dist/main.html'), 'utf8')).toBe('candidate')
    expect(readFileSync(join(f.stable, 'dist/web/index.html'), 'utf8')).toBe('candidate')
    expect(existsSync(join(f.stable, 'node_modules/baseline-only.txt'))).toBe(false)
    expect(existsSync(join(f.stable, 'node_modules/upgrade-fixture-dependency/index.js'))).toBe(true)
    const ordinary = await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/runtime`)).json()
    expect(ordinary.fixtureDevelopment).toBe(f.dev); expect(ordinary.fixtureDatabase).toBe(f.database); expect(ordinary.fixturePort).toBe(String(f.config.servicePort))
    expect(readFileSync(`/proc/${ordinary.supervisor.pid}/cmdline`, 'utf8')).toContain('tools/serve-dev.mjs')
    expect(processIdentity(ordinary.process.pid).pgid).toBe(ordinary.process.pid)
    expect(processIdentity(ordinary.supervisor.pid).ppid).toBe(result.service.pgid)
    const gateArgs = readFileSync(`/proc/${result.service.pgid}/cmdline`, 'utf8').split('\0')
    expect(gateArgs).toContain('-e'); expect(gateArgs.some(word => word.includes('tools/serve-dev.mjs'))).toBe(true)
    expect(result.service.detachedGroups.map((g: any) => g.pgid)).toContain(ordinary.process.pid)
    expect(existsSync(join(f.stable, '.env'))).toBe(false)
    expect(ordinary.fixtureHome).toBe(f.config.serviceHome); expect(ordinary.fixtureWorker).toBe('off')
    expect(ordinary.fixtureWorkspace).toBe('from-development-file'); expect(ordinary.fixturePersistedSecret).toBe(true)
    expect(readFileSync(join(f.dev, '.env'), 'utf8')).toBe(localSettings)
    expect(snapshot(f).records).toEqual([{ id: 'authored', value: 'baseline' }, { id: 'migration', value: 'candidate' }])
    const steps = events.filter((e) => e.phase === 'before').map((e) => e.step)
    for (const [first, second] of [['install', 'electron-binary'], ['electron-binary', 'candidate-typecheck'], ['candidate-typecheck', 'web-build'], ['web-build', 'plugin-build-example'], ['plugin-build-example', 'candidate-migrate'], ['candidate-migrate', 'candidate-checkpoint'], ['candidate-checkpoint', 'candidate-check'], ['candidate-stop', 'delete-candidate-database'], ['delete-candidate-database', 'preserve-artifacts'], ['preserve-artifacts', 'notice-before'], ['notice-before', 'private-backup'], ['private-backup', 'stable-checkout'], ['candidate-tag', 'migrate'], ['stable-check-stop', 'ordinary-start']]) expect(steps.indexOf(first)).toBeLessThan(steps.indexOf(second))
    const privateBackup = new Database(result.paths.privateDatabase, { readonly: true })
    try {
      expect(privateBackup.prepare("SELECT name FROM sqlite_master WHERE name='migrated'").get()).toBeUndefined()
      expect(privateBackup.prepare('SELECT send_id FROM fixture_notices').all()).toEqual([{ send_id: f.config.noticeSendIds.before }])
    } finally { privateBackup.close() }
    const journal = readFileSync(result.paths.journal, 'utf8')
    expect(journal).toContain('Database restore point:'); expect(journal).toContain('Announcement follows candidate checks'); expect(result.notices.state).toBe('filed')
    const rows = journal.trim().split('\n').map(line => JSON.parse(line))
    let lastOldStop = -1
    rows.forEach((row, at) => { if (row.step.startsWith('old-stop-') && row.phase === 'done') lastOldStop = at })
    const guard = rows.findIndex(row => row.step === 'exclusive-lock-guard' && row.phase === 'taken')
    const backup = rows.findIndex(row => row.step === 'private-backup' && row.phase === 'attempt')
    expect(lastOldStop).toBeGreaterThan(-1); expect(guard).toBeGreaterThan(lastOldStop); expect(backup).toBeGreaterThan(guard)
    expect(rows[guard].before.sha256).toBeTypeOf('string'); expect(rows[guard].after.sha256).toBeTypeOf('string')
    expect(existsSync(result.paths.lock)).toBe(false)
    expect(git(f.dev, 'status', '--porcelain')).toBe('')
  }, 60_000)

  // AN EMERGENCY RELEASE (criteria: tools/stable/upgrade-stable.criteria.md, "The emergency path into the stable version").
  // It reads no receipt and skips nothing else. The switch and message refusals have their own tests; these cases are
  // about the configuration and the transaction.
  const aReceipt = { recordId: 'synthetic-receipt', seq: 1, contentHash: 'aaaaaaaaaaaaaaaa' }
  const noReceiptRead = (read: unknown[]) => async (input: unknown) => { read.push(input); throw new Error('An emergency release read a receipt.') }
  const noticesSent = (f: Awaited<ReturnType<typeof fixture>>) => f.requests.filter(r => r.method === 'POST' && r.path === '/api/office/upgrades/notice').map((r: any) => r.body)

  // The fixture's default target adds a migration, so each of these emergency configurations names a target of case 2,
  // which an emergency release may take now that it follows the case.
  it('refuses an emergency configuration that names a receipt or says anything but true', async () => {
    const f = await fixture()
    f.policy.emergency()
    expect(() => validateUpgradeConfig(f.config)).not.toThrow()
    expect(() => validateUpgradeConfig({ ...f.config, evidence: aReceipt })).toThrow('An emergency release names no receipt.')
    for (const value of [false, 'true', 1, null, {}]) expect(() => validateUpgradeConfig({ ...f.config, emergency: value }), JSON.stringify(value)).toThrow('The emergency field must be true or absent.')
    const ordinary: Record<string, unknown> = { ...f.config, evidence: aReceipt }
    delete ordinary.emergency
    expect(() => validateUpgradeConfig(ordinary)).not.toThrow()
  }, 60_000)

  // The criteria's part 7: an emergency release whose target changes a file under the migrations folder goes down case
  // 2, with the rehearsal copy, the one rollback copy and the migration, and publishes.
  it('runs an emergency release whose target adds a migration down case 2, reads no receipt, counts the use, and files AFTER as notice version 4', async () => {
    const f = await fixture()
    const { row, message } = f.policy.emergency()
    const read: unknown[] = []
    const dry = await upgradeStable(f.config, { ...f.options, verifyEvidence: noReceiptRead(read), dry: true })
    expect(dry).toMatchObject({ state: 'dry', policy: { mode: 'emergency', approval: f.config.noticeApproval }, releaseCase: { case: 2, files: [THE_TARGETS_MIGRATION] } })
    expect(f.policy.counting.sent).toEqual([])
    const events: any[] = []
    const started = Date.now()
    const result = remember(await upgradeStable(f.config, { ...f.options, verifyEvidence: noReceiptRead(read), onStep: (event: any) => { track(event); events.push(event) } }))
    const took = Date.now() - started
    expect(result.state, JSON.stringify(result)).toBe('published')
    expect(result.releaseCase).toMatchObject({ case: 2, files: [THE_TARGETS_MIGRATION] })
    expect(read).toEqual([])
    expect(f.requests.some(r => r.path.includes('synthetic-receipt'))).toBe(false)
    expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.target)
    expect(readFileSync(join(f.stable, 'dist/web/index.html'), 'utf8')).toBe('candidate')
    expect(snapshot(f).records).toEqual([{ id: 'authored', value: 'baseline' }, { id: 'migration', value: 'candidate' }])
    const steps = events.filter((e) => e.phase === 'before').map((e) => e.step)
    for (const [first, second] of [['candidate-migrate', 'candidate-checkpoint'], ['candidate-checkpoint', 'candidate-check'], ['candidate-check', 'candidate-check-health'], ['candidate-check-health', 'candidate-stop'], ['candidate-stop', 'delete-candidate-database'], ['delete-candidate-database', 'notice-before'], ['notice-before', 'private-backup'], ['private-backup', 'stable-checkout'], ['stable-checkout', 'migrate'], ['migrate', 'stable-check'], ['stable-check', 'stable-check-health'], ['stable-check-stop', 'ordinary-start'], ['ordinary-start', 'ordinary-start-health']]) {
      expect(steps, `${first} runs`).toContain(first); expect(steps.indexOf(first), `${first} before ${second}`).toBeLessThan(steps.indexOf(second))
    }
    const journal = readFileSync(result.paths.journal, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    const policies = journal.filter(entry => entry.step === 'policy' && entry.phase === 'checked')
    // The first check reads no receipt, so its checkpoint names where it ran, as the three later ones do.
    expect(policies.map(entry => entry.checkpoint)).toEqual(['before-lock', 'locked', 'before-notice', 'before-stop'])
    for (const entry of policies) expect(entry.policy).toMatchObject({ mode: 'emergency', approval: f.config.noticeApproval })
    const sent = noticesSent(f)
    expect(sent.map(n => [n.kind, n.stage])).toEqual([['emergency', 'before'], ['emergency', 'after']])
    expect(sent[0].announcement).not.toHaveProperty('evidence')
    expect(sent[0].announcement.emergency).toEqual({ throw: { change: row.lastChange.id, appendOrder: row.lastChange.appendOrder }, message })
    expect(sent[1].outcome.state).toBe('completed'); expect(sent[1].outcome.verification).not.toHaveProperty('evidence')
    expect(sent[1].outcome.verification.serving).toMatchObject({ commit: f.target, port: f.config.servicePort })
    const stored = new Database(f.database, { readonly: true })
    try { expect(stored.prepare('SELECT response FROM fixture_notices ORDER BY rowid').all().map((r: any) => JSON.parse(r.response).event.version)).toEqual([4, 4]) } finally { stored.close() }
    expect(result.notices.state).toBe('filed')
    // One count, after BEFORE was filed, and the result says the office took it.
    expect(f.policy.counting.sent).toEqual([{ position: '1' }])
    const at = (path: string) => f.requests.findIndex(r => r.method === 'POST' && r.path === path)
    expect(at('/api/office/gates/stable-emergency/met')).toBeGreaterThan(at('/api/office/upgrades/notice'))
    expect(JSON.stringify(result)).toContain('The office counted this use of the emergency switch.')
    // The timing the report gives against the 120 minutes the switch may stay at 1.
    console.log(`One emergency transaction in a scratch office took ${took} ms.`)
    expect(took).toBeLessThan(120 * 60_000)
  }, 120_000)

  it('brings back the previous version when an emergency release fails after the old service stops', async () => {
    for (const point of ['migrate', 'ordinary-start-health']) {
      const f = await fixture()
      f.policy.emergency()
      const read: unknown[] = []
      let fired = false
      const result = remember(await upgradeStable(f.config, { ...f.options, verifyEvidence: noReceiptRead(read), onStep: (event: any) => {
        track(event)
        if (!fired && event.step === point && event.phase === 'after') { fired = true; throw new Error(`Injected emergency ${point} after`) }
      } }))
      expect(fired, point).toBe(true)
      expect(result.state, `${point}: ${JSON.stringify(result)}`).toBe('restored')
      await baselineIsBack(f)
      expect(read).toEqual([])
      const sent = noticesSent(f)
      expect(sent.map(n => [n.kind, n.stage])).toEqual([['emergency', 'before'], ['emergency', 'after']])
      expect(sent[1].outcome).toEqual({ state: 'failed-restored', reason: 'Upgrade failed and the baseline was restored.' })
    }
  }, 120_000)

  it('retains accepted writes after a lost AFTER response and retries the immutable delivery only', async () => {
    const f = await fixture()
    const posted: string[] = []
    let closed = false, deliveryFault = 0
    const noticePath = join(f.recovery, `${f.config.candidateTag}.notices.jsonl`)
    const officeRequest = async (request: any, destination: any) => {
      if (request.method === 'POST') {
        const local = readFileSync(noticePath, 'utf8')
        expect(local).toContain(request.body.sendId)
        if (request.body.stage === 'after') {
          expect(closed).toBe(true)
          expect(existsSync(join(f.stable, '.git/stable-upgrade.lock'))).toBe(false)
          expect(local).toContain('after-attempt')
          posted.push(JSON.stringify(request.body))
          if (deliveryFault === 0) {
            deliveryFault++
            expect((await fetch(`http://127.0.0.1:${f.config.servicePort}/api/fixture-write`, { method: 'POST' })).status).toBe(200)
            throw new Error('Synthetic delivery failure before acceptance')
          }
        }
      }
      const response = await f.options.officeRequest(request, destination)
      if (request.body?.stage === 'after' && deliveryFault === 1) {
        deliveryFault++
        throw new Error('Synthetic lost AFTER response after acceptance')
      }
      return response
    }
    Object.assign(officeRequest, { identity: f.policy.officeRequest.identity })
    const options = { ...f.options, officeRequest, onStep: (event: any) => { track(event); if (event.step === 'close-final-descriptor' && event.phase === 'after') closed = true } }
    const result = remember(await upgradeStable(f.config, options))
    expect(result.state).toBe('published'); expect(result.notices.says).toBe('upgrade verified; notice not filed')
    expect(result).not.toHaveProperty('gateCountSpool')
    expect(result.notices.state).toBe('pending'); expect(snapshot(f).records).toContainEqual({ id: 'published-write', value: 'accepted' })
    const beforeRetry = snapshot(f)
    const acceptedWithoutReply = await retryStableUpgradeNotice(noticePath, { officeRequest })
    expect(acceptedWithoutReply.state).toBe('published'); expect(acceptedWithoutReply.notices.state).toBe('pending')
    const retried = await retryStableUpgradeNotice(noticePath, { officeRequest })
    expect(retried.state).toBe('published'); expect(retried.service).toEqual(result.service); expect(retried.notices.state).toBe('filed')
    expect(posted).toHaveLength(2); expect(posted[1]).toBe(posted[0]); expect(snapshot(f)).toEqual(beforeRetry)
    expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.target)
    const db = new Database(f.database, { readonly: true })
    try { expect(db.prepare('SELECT COUNT(*) AS n FROM fixture_notices').get()).toEqual({ n: 2 }) } finally { db.close() }
    expect(readFileSync(noticePath, 'utf8')).toContain('after-unconfirmed')
    expect(readFileSync(noticePath, 'utf8')).toContain('after-filed')
    expect(readFileSync(result.paths.journal, 'utf8')).not.toContain('"step":"recover-database"')
  }, 60_000)

  it('refuses a missing old notice interface before downtime with an explicit unconfirmed announcement', async () => {
    const f = await fixture()
    const steps: string[] = [], posts: string[] = []
    const result = remember(await upgradeStable(f.config, { ...f.options, onStep: (e: any) => { track(e); steps.push(e.step) }, officeRequest: Object.assign(async (request: any, destination: any) => {
      if (request.method === 'POST') { posts.push(request.body.stage); return { status: 404, cut: false, location: null, body: '{}' } }
      return f.options.officeRequest(request, destination)
    }, { identity: f.policy.officeRequest.identity }) }))
    expect(result.state).toBe('unchanged'); expect(result.notices.state).toBe('unconfirmed')
    expect(posts).toEqual(['before']); expect(steps.some(s => s.startsWith('old-stop-'))).toBe(false)
    expect(existsSync(result.paths.privateDatabase)).toBe(false)
    await baselineIsBack(f)
  }, 60_000)

  it('announces the stabilized final-close recovery and retains pending NOT RESTORED when its API is unavailable', async () => {
    for (const unavailable of [false, true]) {
      const f = await fixture()
      let closed = false, firstClose = true
      const after: any[] = []
      const result = remember(await upgradeStable(f.config, { ...f.options,
        onStep: (event: any) => {
          track(event)
          if (unavailable && event.step === 'recover-start' && event.phase === 'before') throw new Error('Synthetic unavailable restored service')
          if (event.step === 'close-final-descriptor' && event.phase === 'after') closed = true
        },
        closeFinalDescriptor: (fd: number) => { closeSync(fd); if (firstClose) { firstClose = false; throw new Error('Synthetic final close after real close') } },
        officeRequest: Object.assign(async (request: any, destination: any) => {
          if (destination && request.path.startsWith('/api/office/upgrades?')) {
            expect(closed).toBe(true)
            const ready = readFileSync(join(f.recovery, `${f.config.candidateTag}.notices.jsonl`), 'utf8').trim().split('\n').map(line => JSON.parse(line)).find(row => row.step === 'after-ready')
            after.push(JSON.parse(ready.payload))
          }
          return f.options.officeRequest(request, destination)
        }, { identity: f.policy.officeRequest.identity }),
      }))
      expect(result.state).toBe(unavailable ? 'NOT RESTORED' : 'restored')
      expect(after).toHaveLength(1); expect(after[0].outcome.state).toBe(unavailable ? 'not-restored' : 'failed-restored')
      expect(result.notices.state).toBe(unavailable ? 'pending' : 'filed')
      expect(after[0].outcome.reason).not.toContain(f.folder)
      const restoredDb = new Database(f.database, { readonly: true })
      try { expect(restoredDb.prepare('SELECT send_id FROM fixture_notices ORDER BY send_id').all()).toContainEqual({ send_id: f.config.noticeSendIds.before }) } finally { restoredDb.close() }
      if (!unavailable) await baselineIsBack(f)
    }
  }, 120_000)

  it('recovers failures before and after every mutation step, including accepted writes after publication', async () => {
    const steps = ['policy-lock', 'policy-before', 'policy-stop', 'prepare-directories', 'notice', 'candidate-database', 'clone', 'candidate-checkout', 'install', 'electron-binary', 'candidate-typecheck', 'web-build', 'plugin-build-example', 'candidate-migrate', 'candidate-checkpoint', 'candidate-check', 'candidate-check-health', 'candidate-stop', 'delete-candidate-database', 'preserve-artifacts', 'notice-before', 'old-stop', 'private-backup', 'stable-fetch', 'stable-checkout', 'candidate-tag', 'install-artifacts', 'migrate', 'stable-checkpoint', 'stable-check', 'stable-check-health', 'stable-check-stop', 'ordinary-start', 'ordinary-start-health', 'final-journal', 'close-lock-descriptor', 'release-lock']
    // The answer says how the gate-count spool is handed over exactly when the database file's world changed (wave 13q item 1h).
    const worlds = { changed: 0, kept: 0 }
    // A step's 'before' is reached already as the 'after' of the step that runs just before it, so most steps run at
    // 'after' alone. These ten keep 'before':
    //   policy-lock: no step runs before it.
    //   policy-before: a health read and the set-aside rows run between it and the step before.
    //   candidate-migrate: the untranslated-words and notice-contract commands run between.
    //   old-stop: downtime = true runs between.
    //   private-backup: the database guard runs between.
    //   migrate: databaseTouched = true runs between.
    //   ordinary-start: ordinaryStarted = true runs between.
    //   final-journal, close-lock-descriptor and release-lock: what runs before them was not checked.
    // A later change that adds code that changes the state before a step whose 'before' was dropped adds that step here.
    const keepsBefore = new Set(['policy-lock', 'policy-before', 'candidate-migrate', 'old-stop', 'private-backup', 'migrate', 'ordinary-start', 'final-journal', 'close-lock-descriptor', 'release-lock'])
    for (const point of steps) for (const phase of keepsBefore.has(point) ? ['before', 'after'] : ['after']) {
      const f = await fixture()
      const worldBefore = databaseIdentity(f.config.database).id
      let fired = false
      let migrationAfterObserved = false
      let candidateMigrationObserved = false
      let publicationWriteObserved = false
      const result = remember(await upgradeStable(f.config, { ...f.options, onStep: async (event: any) => {
        track(event)
        if (!fired && (event.step === point || point === 'old-stop' && event.step.startsWith('old-stop-')) && event.phase === phase) {
          fired = true
          if (point === 'migrate' && phase === 'after') migrationAfterObserved = snapshot(f).records.some((row: any) => row.id === 'migration' && row.value === 'candidate')
          if (point === 'candidate-migrate' && phase === 'after') {
            const copied = new Database(event.paths.candidateDatabase, { readonly: true })
            try { candidateMigrationObserved = Boolean(copied.prepare("SELECT name FROM sqlite_master WHERE name='migrated'").get()) && snapshot(f).migrated === undefined } finally { copied.close() }
          }
          if (point === 'ordinary-start-health' && phase === 'after') {
            const written = await fetch(`http://127.0.0.1:${f.config.servicePort}/api/fixture-write`, { method: 'POST' })
            publicationWriteObserved = written.ok && snapshot(f).records.some((row: any) => row.id === 'published-write' && row.value === 'accepted')
          }
          throw new Error(`Injected ${point} ${phase}`)
        }
      } }))
      expect(fired, `${point}/${phase}: ${JSON.stringify(result)}`).toBe(true)
      if (point === 'migrate' && phase === 'after') expect(migrationAfterObserved, 'The after-migrate boundary follows the actual database write.').toBe(true)
      if (point === 'candidate-migrate' && phase === 'after') expect(candidateMigrationObserved, 'The private migration completed while the actual database retained its baseline schema.').toBe(true)
      if (point === 'ordinary-start-health' && phase === 'after') expect(publicationWriteObserved, 'The ordinary service really accepted a write before recovery discarded it.').toBe(true)
      expect(['unchanged', 'restored'], `${point}/${phase}: ${JSON.stringify(result)}`).toContain(result.state)
      const changed = databaseIdentity(f.config.database).id !== worldBefore
      worlds[changed ? 'changed' : 'kept']++
      expect(result.gateCountSpool ?? null, `${point}/${phase}`).toEqual(changed ? theGateCountSpoolStep({ database: f.config.database, home: f.config.serviceHome, change: 'restored' }) : null)
      if (point === 'old-stop' || steps.indexOf(point) > steps.indexOf('old-stop')) {
        const rows = readFileSync(result.paths.journal, 'utf8').trim().split('\n').map(line => JSON.parse(line))
        const guard = rows.findIndex(row => row.step === 'exclusive-lock-guard' && row.phase === 'taken')
        expect(guard, `${point}/${phase}: no exclusive-lock-guard`).toBeGreaterThan(-1)
        const restore = rows.findIndex(row => row.step === 'recover-database' && row.phase === 'attempt')
        if (restore >= 0) expect(guard, `${point}/${phase}: the guard came after recover-database`).toBeLessThan(restore)
      }
      await baselineIsBack(f)
      if (point === 'ordinary-start-health' && phase === 'after') expect(result.databaseLoss).toContain('writes accepted after that point are discarded')
      // Close each fixture before the next; this matrix never leaves concurrent fixture offices.
      for (const pgid of [...groups]) { try { if (processIdentity(pgid).pgid === pgid) process.kill(-pgid, 'SIGTERM') } catch {} }
      await delay(35)
    }
    expect(worlds.changed, JSON.stringify(worlds)).toBeGreaterThan(0); expect(worlds.kept, JSON.stringify(worlds)).toBeGreaterThan(0)
  }, 360_000)

  it('keeps recovery paths and the lock when recovery fails, and never starts an unjournaled gate', async () => {
    const stubborn = await fixture(false, false, true)
    stubborn.config.health.stopTimeoutMs = 200
    try {
      const stuck = remember(await upgradeStable(stubborn.config, { ...stubborn.options, onStep: track }))
      expect(stuck.state).toBe('NOT RESTORED')
      const original = stubborn.config.serviceGroups[0]!
      const remaining = stuck.remainingGroups.find((group: any) => group.pgid === original.pgid)
      expect.soft(remaining, JSON.stringify(stuck)).toMatchObject(original)
      expect.soft(remaining?.liveMembers?.some((member: any) => member.pid === original.pgid && member.startTime === original.startTime) ?? false).toBe(true)
      expect((await (await fetch(`http://127.0.0.1:${stubborn.config.servicePort}/api/health`)).json()).world.head).toBe(stubborn.baseline.slice(0, 7))
      expect(snapshot(stubborn).migrated).toBeUndefined()
    } finally { rmSync(join(stubborn.stable, '.ignore-term'), { force: true }) }
    const f = await fixture()
    const result = remember(await upgradeStable(f.config, { ...f.options, onStep: (event: any) => {
      track(event)
      if (event.step === 'migrate' && event.phase === 'after') throw new Error('Injected migration failure')
      if (event.step === 'recover-database' && event.phase === 'before') throw new Error('Injected failed restore')
    } }))
    expect(result.state).toBe('NOT RESTORED'); expect(result.restoreFailure).toContain('Injected failed restore')
    expect(existsSync(result.paths.privateDatabase)).toBe(true); expect(existsSync(result.paths.lock)).toBe(true)
    expect(readFileSync(result.paths.lock, 'utf8')).toContain('NOT RESTORED')
    const f2 = await fixture()
    const gateFailure = remember(await upgradeStable(f2.config, { ...f2.options, onStep: (event: any) => { track(event); if (event.step === 'candidate-check' && event.phase === 'gated') throw new Error('Injected gate journal failure') } }))
    expect(gateFailure.state, JSON.stringify(gateFailure)).toBe('unchanged'); await baselineIsBack(f2)
    const f3 = await fixture()
    let detached = 0
    const childRecovery = remember(await upgradeStable(f3.config, { ...f3.options, onStep: (event: any) => {
      track(event)
      if (event.step === 'stable-check-stop' && event.phase === 'after') write(join(f3.stable, '.detach-child'), 'Start a synthetic detached DB holder.')
      if (event.step === 'ordinary-worker' && event.phase === 'recorded') detached = event.pgid
      if (event.step === 'ordinary-start-health' && event.phase === 'after') { rmSync(join(f3.stable, '.detach-child')); throw new Error('Fail after recording detached worker') }
    } }))
    expect(detached).toBeGreaterThan(1); expect(childRecovery.state, JSON.stringify(childRecovery)).toBe('restored')
    await baselineIsBack(f3)
    try { expect(processIdentity(detached).state).toBe('Z') } catch (error: any) { expect(error.code).toBe('ENOENT') }
    const f4 = await fixture()
    const holderOwner = aStandInOwner(standIns)
    let holder = 0
    const unknown = remember(await upgradeStable(f4.config, { ...f4.options, onStep: async (event: any) => {
      track(event)
      if (event.step !== 'ordinary-start-health' || event.phase !== 'after') return
      const ready = join(f4.folder, 'holder-ready')
      const child = spawn(process.execPath, ['-e', `${aLineThatEndsWithItsOwner(holderOwner)}const Database=require(${JSON.stringify(databaseModule)});const db=new Database(${JSON.stringify(f4.database)});require('node:fs').writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000);process.on('SIGTERM',()=>{db.close();process.exit(0)});`], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH } })
      groups.add(child.pid!); children.push(child); holder = child.pid!
      for (let n = 0; n < 200 && !existsSync(ready); n++) await delay(10)
      expect(existsSync(ready)).toBe(true)
      throw new Error('An unrecorded holder must prevent database overwrite')
    } }))
    expect(unknown.state).toBe('NOT RESTORED'); expect(unknown.restoreFailure).toContain('holder outside')
    expect(snapshot(f4).records).toContainEqual({ id: 'migration', value: 'candidate' })
    await theseGroupsEndAfterASigkillOf(holderOwner, [holder])
    const f5 = await fixture()
    const takenLock = remember(await upgradeStable(f5.config, { ...f5.options, onStep: (event: any) => {
      track(event)
      if (event.step === 'release-lock' && event.phase === 'after') {
        write(join(f5.stable, '.git/stable-upgrade.lock'), 'A synthetic subsequent transaction owns this lock.')
        throw new Error('Fail after releasing the lock to another owner')
      }
    } }))
    expect(takenLock.state).toBe('NOT RESTORED'); expect(takenLock.restoreFailure).toContain('Another transaction owns')
    expect(takenLock.remainingGroups.some((g: any) => g.port === f5.config.servicePort)).toBe(true)
    expect(readFileSync(takenLock.paths.journal, 'utf8')).toContain('NOT RESTORED')
    expect(readFileSync(takenLock.paths.lock, 'utf8')).toBe('A synthetic subsequent transaction owns this lock.')
    expect((await (await fetch(`http://127.0.0.1:${f5.config.servicePort}/api/health`)).json()).world.head).toBe(f5.target.slice(0, 7))
    for (const boundary of ['before', 'partial', 'after']) for (const foreign of [false, true]) {
      const closing = await fixture()
      let fired = false, closedFd = -1
      const closeFailure = remember(await upgradeStable(closing.config, { ...closing.options,
        closeFinalDescriptor: (fd: number) => {
          closeSync(fd); closedFd = fd
          if (!fired && boundary === 'partial') { fired = true; throw Object.assign(new Error('Injected EIO after descriptor closed'), { code: 'EIO' }) }
        },
        onStep: (event: any) => {
          track(event)
          if (!fired && foreign && event.step === 'close-final-descriptor' && event.phase === 'before') write(join(closing.stable, '.git/stable-upgrade.lock'), 'A later owner holds this lock during final close.')
          if (!fired && event.step === 'close-final-descriptor' && event.phase === boundary) { fired = true; throw new Error(`Injected final close ${boundary}`) }
        },
      }))
      expect(fired).toBe(true); expect(closeFailure.state, JSON.stringify(closeFailure)).toBe(foreign ? 'NOT RESTORED' : 'restored'); expect(closeFailure.verifiedState).toBe('published')
      if (closedFd !== -1) expect(() => fstatSync(closedFd)).toThrow(/EBADF/)
      expect(closeFailure.finalizationError).toContain('Injected')
      expect(readFileSync(closeFailure.paths.journal, 'utf8')).toContain('"step":"close-final-descriptor","phase":"attempt"')
      if (foreign) {
        expect(closeFailure.remainingGroups.some((g: any) => g.port === closing.config.servicePort)).toBe(true)
        expect(readFileSync(closeFailure.paths.lock, 'utf8')).toBe('A later owner holds this lock during final close.')
        expect((await (await fetch(`http://127.0.0.1:${closing.config.servicePort}/api/health`)).json()).world.head).toBe(closing.target.slice(0, 7))
      } else { expect(existsSync(closeFailure.paths.lock)).toBe(false); await baselineIsBack(closing) }
    }
    for (const damage of ['missing', 'replaced', 'symlink']) {
      const broken = await fixture()
      const journalPath = join(broken.recovery, broken.config.candidateTag + '.journal.jsonl')
      const refused = remember(await upgradeStable(broken.config, { ...broken.options, onStep: track, closeFinalDescriptor: (fd: number) => {
        closeSync(fd)
        renameSync(journalPath, journalPath + '.original')
        if (damage === 'replaced') write(journalPath, 'A different journal inode.')
        if (damage === 'symlink') symlinkSync(journalPath + '.original', journalPath)
        throw Object.assign(new Error('Injected close error with changed journal'), { code: 'EIO' })
      } }))
      expect(refused.state).toBe('NOT RESTORED'); expect(refused.verifiedState).toBe('published')
      expect(refused.cleanupFailures.join('\n')).toMatch(/ENOENT|original inode|ELOOP/)
      expect(refused.remainingGroups.some((g: any) => g.port === broken.config.servicePort)).toBe(true)
      expect(existsSync(refused.paths.lock)).toBe(false)
      expect((await (await fetch(`http://127.0.0.1:${broken.config.servicePort}/api/health`)).json()).world.head).toBe(broken.target.slice(0, 7))
    }
    for (const already of ['published', 'restored', 'unchanged']) {
      const prior = await fixture()
      let closeCalls = 0, restoreCalls = 0, written = false
      const kept = remember(await upgradeStable(prior.config, { ...prior.options,
        closeFinalDescriptor: (fd: number) => { closeSync(fd); closeCalls++; throw Object.assign(new Error('Injected repeated close EIO'), { code: 'EIO' }) },
        onStep: async (event: any) => {
          track(event)
          if (event.step === 'recover-database' && event.phase === 'before') restoreCalls++
          if (already === 'restored' && event.step === 'migrate' && event.phase === 'after') throw new Error('First restore the baseline')
          if (already === 'unchanged' && event.step === 'notice' && event.phase === 'before') throw new Error('Leave the baseline unchanged')
          if (!written && event.step === 'close-final-descriptor' && event.phase === 'before' && event.verifiedState !== 'published') {
            const reply = await fetch(`http://127.0.0.1:${prior.config.servicePort}/api/fixture-write`, { method: 'POST' })
            written = reply.ok
          }
        },
      }))
      expect(kept.state, JSON.stringify(kept)).toBe(already === 'unchanged' ? 'unchanged' : 'restored')
      expect(closeCalls).toBe(already === 'published' ? 2 : 1); expect(restoreCalls).toBe(already === 'unchanged' ? 0 : 1)
      expect(written).toBe(true); expect(snapshot(prior).records).toContainEqual({ id: 'published-write', value: 'accepted' })
      expect(git(prior.stable, 'rev-parse', 'HEAD')).toBe(prior.baseline)
      expect(kept.finalizationError).toContain('Injected repeated close EIO')
    }
  }, 120_000)
})

describe('the made-up offices and the processes this file starts, after their owner is killed', () => {
  it('ends a stand-in owner once its own owner is gone', async () => {
    const owner = aStandInOwner(standIns)
    await theseGroupsEndAfterASigkillOf(owner, [aStandInOwner(standIns, owner)])
  }, 30_000)

  it('ends every group of an office that ignores TERM once its owner is gone, in both shapes', async () => {
    for (const gated of [false, true]) {
      const f = await fixtureOwnedByAStandIn(true, false, true, gated, false)
      const owner = f.owner
      try { await theseGroupsEndAfterASigkillOf(owner, f.config.serviceGroups.map((group: any) => group.pgid)) } finally { rmSync(join(f.stable, '.ignore-term'), { force: true }) }
    }
  }, 60_000)

  it('ends the made-up server and its worker once the supervisor that started them is gone', async () => {
    const f = await fixture(true)
    const [supervisor, ...started] = f.config.serviceGroups.map((group: any) => group.pgid)
    await theseGroupsEndAfterASigkillOf(-supervisor, started)
  }, 30_000)

  it('ends every group a published upgrade started once the owner of the fixture is gone', async () => {
    const f = await fixtureOwnedByAStandIn(true, false, false, false, false)
    const owner = f.owner
    const result = remember(await upgradeStable(f.config, f.options))
    expect(result.state, JSON.stringify(result)).toBe('published')
    const started = [result.service.pgid, ...result.service.detachedGroups.map((group: any) => group.pgid)]
    expect(started, 'the groups of the upgrade\'s gate, the server and the worker').toHaveLength(3)
    await theseGroupsEndAfterASigkillOf(owner, started)
  }, 60_000)
})
