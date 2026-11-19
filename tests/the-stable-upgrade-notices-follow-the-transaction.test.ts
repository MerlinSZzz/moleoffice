// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import Database from 'better-sqlite3'
import { freshDb } from './helpers.ts'
import { aLineThatStopsAServerWithItsStarterOrOwner, aStandInOwner, commandUnderTheOwnerWatchingGate, endTheStandIns, theseGroupsEndAfterASigkillOf } from './the-owner-watching-gate.ts'
import { localStamp, theClockZone } from '../src/shared/time.ts'
import { receiptFromArtifacts } from '../tools/periodic-main-suite.mjs'
import { processIdentity } from '../tools/stable/stable-upgrade-transaction.mjs'
import { askTheOffice } from '../tools/office-request.mjs'
import { readTheOfficesId, verifyNoticeReply } from '../tools/stable/stable-upgrade-notices.mjs'
import { aMadeUpWordCounter } from './made-up-upgrade-words.ts'
import { aRefusedListenEnds, heldPort } from './stable-upgrade-fixture.ts'
import { THE_MIGRATIONS_FOLDER } from '../src/config/settings.mjs'

const root = resolve(import.meta.dirname, '..')
const fixtureTimeZone = theClockZone()
const out = process.env.STABLE_UPGRADE_TEST_OUTPUT ?? tmpdir()
const folders: string[] = [], groups = new Set<number>(), children: ChildProcess[] = [], standIns: ChildProcess[] = []
const write = (path: string, value: string) => { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path, value) }
function run(cwd: string, program: string, args: string[]) {
  const r = spawnSync(program, args, { cwd, encoding: 'utf8', timeout: 30000, env: { PATH: process.env.PATH, HOME: cwd, LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', npm_config_cache: join(cwd, '.npm-cache') } })
  if (r.status !== 0 || r.error) throw new Error(`${program}: ${r.error?.message ?? r.stderr}`)
  return r.stdout.trim()
}
// This fixture's own git stores and packs the copied 120 MB of source without compression or delta search, which took
// about 4 s of each fixture's 5.7 s of git. The objects and their ids are the same, and no case reads how git stores them.
// The upgrade's own git calls are given none of this.
const PLAINLY = ['-c', 'core.compression=0', '-c', 'pack.window=0']
const git = (cwd: string, ...args: string[]) => run(cwd, 'git', [...PLAINLY, ...args])
async function cli(args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [join(root, 'tools/stable/upgrade-stable.mjs'), ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = '', error = ''
  child.stdout.on('data', b => { output += b }); child.stderr.on('data', b => { error += b })
  const code = await new Promise<number | null>((done, reject) => { child.once('error', reject); child.once('exit', done) })
  return { code, output, error }
}
function remember(result: any) { if (result.service) { groups.add(result.service.pgid); for (const g of result.service.detachedGroups ?? []) groups.add(g.pgid) } }

afterEach(async () => {
  delete process.env.MOLE_AGENT_KEY
  await endTheStandIns(standIns)
  for (const pgid of groups) { try { if (processIdentity(pgid).pgid === pgid) process.kill(-pgid, 'SIGTERM') } catch (e: any) { if (!['ENOENT', 'ESRCH'].includes(e.code)) throw e } }
  for (let n = 0; n < 300; n++) {
    const alive = [...groups].filter(p => { try { return !['Z', 'X'].includes(String(processIdentity(p).state)) } catch { return false } })
    if (!alive.length) break
    if (n === 299) throw new Error('An owned notice fixture group did not stop.')
    await delay(10)
  }
  for (const child of children) if (child.exitCode === null && child.signalCode === null) await new Promise<void>(r => child.once('exit', () => r()))
  groups.clear(); children.length = 0
  for (const folder of folders) {
    const logs = join(out, 'authenticated-command-logs', folder.split('/').at(-1)!)
    for (const name of ['baseline.log', 'cli-dry.log', 'cli-upgrade.log', 'cli-retry.log']) if (existsSync(join(folder, name))) { mkdirSync(logs, { recursive: true }); cpSync(join(folder, name), join(logs, name)) }
    if (process.env.STABLE_UPGRADE_KEEP_FIXTURES !== 'yes') rmSync(folder, { recursive: true, force: true })
  }
  folders.length = 0
})

/** How long the fixture waits for its service to answer, unless the service ends first. */
const SERVICE_START_LIMIT_MS = 60_000

/** The office this makes ends once `owner` is gone: this test worker, or a stand-in for it. */
async function authenticatedFixture(owner = process.pid) {
  const folder = mkdtempSync(join(out, 'authenticated-notice-')); folders.push(folder)
  const dev = join(folder, 'development'), stable = join(folder, 'stable'), recovery = join(folder, 'recovery'), database = join(folder, 'office.sqlite'), remote = join(folder, 'remote.git')
  mkdirSync(dev); mkdirSync(recovery, { mode: 0o700 })
  // The product routes and stores run from independent copied source. Their test-only loader
  // resolves dependencies from this fixture parent; the transaction's artifact bytes are separate.
  symlinkSync(join(root, 'node_modules'), join(folder, 'node_modules'))
  cpSync(join(root, 'src'), join(dev, 'src'), { recursive: true }); cpSync(join(root, 'public'), join(dev, 'public'), { recursive: true }); cpSync(join(root, 'tools'), join(dev, 'tools'), { recursive: true }); cpSync(join(root, 'tsconfig.json'), join(dev, 'tsconfig.json'))
  git(folder, 'init', '--bare', remote); git(dev, 'init', '-b', 'main'); git(dev, 'config', 'user.name', 'Synthetic notice fixture'); git(dev, 'config', 'user.email', 'fixture@example.invalid')
  write(join(dev, '.gitignore'), 'node_modules/\ndist/\n.npm-cache/\n.env\n')
  write(join(dev, 'version.txt'), 'baseline')
  write(join(dev, 'tests/synthetic.test.ts'), '// Made-up receipt coverage; never a real cloud suite.\n')
  write(join(dev, 'package/package.json'), JSON.stringify({ name: 'notice-fixture-dependency', version: '1.0.0', bin: { vite: 'vite.cjs', tsc: 'tsc.cjs' } })); write(join(dev, 'package/index.js'), 'module.exports="fixture"')
  // Synthetic compiler binaries keep this auth/transaction test small. The actual product
  // builder and stamp writer run below; real TypeScript/Vite have a separate checkout proof.
  write(join(dev, 'package/vite.cjs'), "#!/usr/bin/env node\nconst{mkdirSync,writeFileSync}=require('node:fs');const at=process.argv.indexOf('--outDir');if(at<0)process.exit(1);const dir=process.argv[at+1];mkdirSync(dir,{recursive:true});writeFileSync(dir+'/index.html','synthetic compiled page');")
  write(join(dev, 'package/tsc.cjs'), "#!/usr/bin/env node\nif(!process.argv.includes('--noEmit'))process.exit(1);")
  run(dev, 'tar', ['-czf', 'dependency.tgz', 'package']); rmSync(join(dev, 'package'), { recursive: true })
  write(join(dev, 'package.json'), JSON.stringify({ name: 'synthetic-notice-service', version: '1.0.0', type: 'module', dependencies: { 'notice-fixture-dependency': 'file:dependency.tgz' }, scripts: { typecheck: 'tsc --noEmit', build: 'node build.mjs', start: 'node --import tsx src/server/index.ts', 'db:migrate': 'node migrate.mjs' } }))
  write(join(dev, 'build.mjs'), `import{mkdirSync,writeFileSync,readFileSync}from'node:fs';mkdirSync('dist/web',{recursive:true});writeFileSync('dist/web/index.html',readFileSync('version.txt'));`)
  write(join(dev, 'migrate.mjs'), `import{createRequire}from'node:module';const require=createRequire(import.meta.url);const Database=require('better-sqlite3');const db=new Database(process.env.MOLE_OFFICE_DB);db.exec("CREATE TABLE upgraded_fixture(value TEXT);INSERT INTO upgraded_fixture VALUES ('target')");db.close();`)
  write(join(dev, 'tools/serve-dev.mjs'), `import{spawn}from'node:child_process';import{theSupervisorsStartupIsDone}from${JSON.stringify(join(root, 'src/config/supervisor-startup-done.mjs'))};const child=spawn(process.execPath,['--import','tsx','src/server/index.ts','--stop-with-pid='+process.pid],{detached:true,stdio:'inherit',env:process.env});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>{try{process.kill(-child.pid,'SIGTERM')}catch{}});console.log(theSupervisorsStartupIsDone(process.pid,Number(process.env.MOLE_OFFICE_PORT)));`)
  write(join(dev, 'src/server/index.ts'), "import '../../server.mjs'\n")
  // The word counter is made up, so the count is the one the test writes. The notice contract and door are the copied real ones.
  write(join(dev, 'tools/stable/untranslated-words.mjs'), aMadeUpWordCounter(folder))
  write(join(dev, 'server.mjs'), `import{register}from'tsx/esm/api';register({tsconfig:process.cwd()+'/tsconfig.json'});const {default:Fastify}=await import('fastify');const{execFileSync}=await import('node:child_process');const{default:Database}=await import('better-sqlite3');const{existsSync,unlinkSync}=await import('node:fs');const{dirname}=await import('node:path');
const repository=process.cwd(),database=process.env.MOLE_OFFICE_DB,port=Number(process.env.MOLE_OFFICE_PORT),mode=process.env.MOLE_OFFICE_START_MODE??'ordinary',commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();const app=Fastify({logger:false});app.setErrorHandler((e,q,r)=>r.code(e.status??e.statusCode??500).send({error:e.message}));
let db;if(mode==='release-check'){db=new Database(database,{readonly:true,fileMustExist:true});app.all('/api/*',(q,r)=>r.code(503).send({error:'Release check refuses ordinary operations'}))}else{db=(await import('./src/server/db/client.ts')).sqlite;const{GOVERNANCE_GUARDS}=await import('./src/server/lib/records.ts');(await import('./src/server/lib/roles.ts')).readTheRoleCards({guardActKeys:GOVERNANCE_GUARDS.flatMap(g=>[g.actKey,g.personAct])});await app.register(async a=>{await(await import('./src/server/api/records.ts')).recordRoutes(a);await(await import('./src/server/api/participants.ts')).participantRoutes(a);await(await import('./src/server/api/roles.ts')).roleRoutes(a);await(await import('./src/server/api/stable-upgrade-notices.ts')).stableUpgradeNoticeRoutes(a,{webDir:repository+'/dist/web'});await(await import('./src/server/api/runtime-settings.ts')).runtimeSettingsRoutes(a);},{prefix:'/api'})}
app.addHook('onSend',(q,r,payload,done)=>{if(mode==='ordinary'&&q.body?.stage==='after'&&existsSync(dirname(database)+'/lose-after')){unlinkSync(dirname(database)+'/lose-after');db.exec("INSERT INTO fixture_writes VALUES ('accepted after publication')");q.raw.socket.destroy()}done(null,payload)});const identity={commit,repository,database,port,mode};app.get('/api/health',()=>({ok:true,...(mode==='release-check'?{identity}:{world:{repository,database,port,head:commit.slice(0,7)}})}));app.get('/api/runtime',()=>mode==='release-check'?{identity}:{repository:{path:repository,head:{full:commit}},database:{path:database},addresses:{api:'http://127.0.0.1:'+port},process:{pid:process.pid},supervisor:{pid:process.ppid},worker:{started:false,pid:null,pgid:null}});
if(mode==='ordinary')app.post('/api/fixture-write',()=>{db.exec("INSERT INTO fixture_writes VALUES ('accepted after publication')");return{ok:true}});await app.listen({host:'127.0.0.1',port,reusePort:true}).catch(${aRefusedListenEnds('port')});const stop=()=>app.close().then(()=>{db.close();process.exit(0)});process.on('SIGTERM',stop);${aLineThatStopsAServerWithItsStarterOrOwner('stop', owner)}`)
  run(dev, 'npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'])
  git(dev, 'add', '.'); git(dev, 'commit', '-m', 'Synthetic baseline with actual notice routes'); const baseline = git(dev, 'rev-parse', 'HEAD')
  git(dev, 'tag', 'stable-2026-10-01-baseline'); git(dev, 'remote', 'add', 'origin', remote); git(dev, 'push', 'origin', 'main', '--tags')
  git(folder, 'clone', '--no-local', remote, stable); git(stable, 'checkout', '-b', 'stable', baseline)
  run(stable, 'npm', ['ci', '--no-audit', '--no-fund']); run(stable, 'npm', ['run', 'typecheck']); run(stable, process.execPath, ['--input-type=module', '--eval', "const {buildThePage}=await import('./tools/build-the-page.mjs');if(!(await buildThePage()).ok)process.exitCode=1"])
  // The target adds a migration, so the release goes down case 2, with the rehearsal copy, the one rollback copy that a
  // test here reads, and the migration. migrate.mjs makes the schema, and this file is only read.
  write(join(dev, relative(root, THE_MIGRATIONS_FOLDER), '0001_synthetic_target.sql'), '-- The made-up target migration.\n')
  write(join(dev, 'version.txt'), 'candidate'); git(dev, 'add', '.'); git(dev, 'commit', '-m', 'Synthetic target'); const target = git(dev, 'rev-parse', 'HEAD')
  const office = await freshDb()
  const agent = office.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up notice secretary', data: { handle: 'notice-secretary-fixture', runtime: 'codex', state: 'active' }, actor: office.api.HUMAN })
  const { agentForRecord } = await import('../src/server/lib/participants.ts')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const agentId = agentForRecord(agent.id)!.id
  // Fixture role setup only; every note, receipt and notice write below uses an authenticated agent key.
  office.client.sqlite.prepare("UPDATE agents SET role = 'secretary' WHERE id = ?").run(agentId)
  const session = office.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up notice run', data: { state: 'running', runtime: 'mole-office', servingAgent: agentId }, actor: office.api.HUMAN })
  const key = makeAnAgentKey(agentId, null)
  // Canonical officeHeaders reads only the tool process's own key, not its env option.
  process.env.MOLE_AGENT_KEY = key
  office.client.sqlite.exec('CREATE TABLE fixture_writes(value TEXT)')
  await office.client.sqlite.backup(database); office.close()
  const servicePort = await heldPort(), releaseCheckPort = await heldPort([servicePort])
  write(join(dev, '.env'), 'MOLE_OFFICE_STABLE_CHECKOUT='+stable+'\n')
  // The group dies with this worker, even after a SIGKILL (tests/the-owner-watching-gate.ts).
  const gated = commandUnderTheOwnerWatchingGate(['tools/serve-dev.mjs', '--built', '--prepared'], owner)
  const child = spawn(gated.command, gated.args, { cwd: stable, env: { PATH: process.env.PATH, TZ: fixtureTimeZone, HOME: folder, MOLE_OFFICE_DEVELOPMENT_CHECKOUT: dev, MOLE_OFFICE_DB: database, MOLE_OFFICE_PORT: String(servicePort), MOLE_OFFICE_MESSAGE_WORKER: 'off' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  if (!child.pid) throw new Error('The actual notice service did not start.')
  groups.add(child.pid); children.push(child)
  let output = ''; child.stdout?.on('data', b => { output += b }); child.stderr?.on('data', b => { output += b; write(join(folder, 'baseline.log'), output) })
  // THE SERVICE IS WAITED FOR UNTIL IT ANSWERS OR ENDS, up to a minute. It loads the office's routes from copied source
  // through tsx before it listens. In a whole run of the suite on 21 October 2026 it had not answered within the old wait
  // of about six seconds and had printed nothing, and the file passed alone (wave 13y round 58).
  const startedAt = Date.now(), running = () => child.exitCode === null && child.signalCode === null
  let up = false
  while (!up && running() && Date.now() - startedAt < SERVICE_START_LIMIT_MS) {
    try { up = (await fetch(`http://127.0.0.1:${servicePort}/api/health`)).ok } catch { /* this owned group only */ }
    if (!up) await delay(20)
  }
  if (!up) {
    const state = running() ? 'it was still running' : `it had ended with exit code ${String(child.exitCode)} and signal ${String(child.signalCode)}`
    throw new Error(`Actual notice service failed: it did not answer on port ${String(servicePort)} within ${String(Date.now() - startedAt)} ms, and ${state}. Its output: ${output}`)
  }
  const env = { PATH: process.env.PATH, TZ: fixtureTimeZone, MOLE_OFFICE_API: `http://127.0.0.1:${servicePort}`, MOLE_OFFICE_AGENT: 'notice-secretary-fixture', MOLE_OFFICE_SESSION: session.id, MOLE_OFFICE_WORKSPACE: 'default', MOLE_AGENT_KEY: key }
  const request = (r: any) => askTheOffice(r, { env, fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(5000) }) })
  const participant = await request({ method: 'GET', path: `/api/participants/agent/${agentId}` })
  write(join(folder, 'participant-response.json'), JSON.stringify(participant))
  expect(participant.status, participant.body).toBe(200)
  expect(JSON.parse(participant.body).participant).toMatchObject({ id: agentId, role: 'secretary', retired: false })
  const note = await request({ method: 'POST', path: '/api/records', body: { kind: 'note', title: 'Made-up checked upgrade notice', data: { body: 'Synthetic upgrade notice approved by the fixture secretary.' } } })
  expect(note.status, note.body).toBe(201)
  const approvalId = JSON.parse(note.body).record.id
  const approval = JSON.parse((await request({ method: 'GET', path: `/api/records/${approvalId}/revisions/1` })).body)
  const runtime = await (await fetch(`http://127.0.0.1:${servicePort}/api/runtime`)).json(); groups.add(runtime.process.pid)
  return { serverPid: runtime.process.pid, folder, dev, stable, recovery, database, baseline, target, servicePort, releaseCheckPort, env, child, request, noticeApproval: { id: approvalId, seq: 1, contentHash: approval.contentHash } }
}

async function originalEvidence(f: Awaited<ReturnType<typeof authenticatedFixture>>) {
  const attempt = join(f.folder, 'made-up-evidence'); mkdirSync(attempt)
  // A local clone clears the -c settings for the side it reads, so that side is given them itself.
  const clone = join(attempt, 'clone'); git(f.folder, 'clone', '--no-local', '--upload-pack', ['git', ...PLAINLY, 'upload-pack'].join(' '), f.dev, clone); git(clone, 'checkout', '--detach', f.target)
  const paths = { log: join(attempt, 'suite.log'), report: join(attempt, 'report.json'), manifest: join(attempt, 'manifest.json'), reads: join(attempt, 'reads') }
  mkdirSync(paths.reads); write(join(paths.reads, 'fixture.json'), '{}')
  write(paths.log, 'Made-up receipt fixture; no cloud suite ran.\n')
  write(paths.manifest, JSON.stringify([{ file: join(clone, 'tests/synthetic.test.ts') }]))
  write(paths.report, JSON.stringify({ success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, numTotalTestSuites: 1, numPassedTestSuites: 1, numFailedTestSuites: 0, numPendingTestSuites: 0, testResults: [{ name: join(clone, 'tests/synthetic.test.ts'), status: 'passed', assertionResults: [{ fullName: 'Made-up assertion', status: 'passed' }] }] }))
  const result = { code: 0, answer: { ran: true, code: 0, commit: f.target, phase: 'test', buildExitCode: 0, suiteExitCode: 0, wallSec: 1, workers: 1, files: 1, failed: [] }, output: join(attempt, 'door-output.log') }
  write(join(attempt, 'door-result.json'), JSON.stringify(result)); write(result.output, JSON.stringify(result.answer) + '\n')
  const receipt = receiptFromArtifacts({ repository: f.dev, commit: f.target, tree: git(f.dev, 'rev-parse', 'HEAD^{tree}'), clone, paths, result, startedAt: '2026-10-14 01:00:00', endedAt: '2026-10-14 01:00:01' })
  const created = await f.request({ method: 'POST', path: '/api/records', body: { kind: 'whole_suite_receipt', title: 'Made-up notice integration receipt', data: receipt } })
  expect(created.status, created.body).toBe(201)
  const id = JSON.parse(created.body).record.id
  const revision = JSON.parse((await f.request({ method: 'GET', path: `/api/records/${id}/revisions/1` })).body)
  const observed = new Database(f.database, { readonly: true })
  try {
    expect(observed.prepare('SELECT r.workspace_id, r.actor_type, r.actor_id, r.session_id, r.proved_by, a.origin FROM revisions r JOIN records a ON a.id=r.record_id WHERE r.record_id=? AND r.seq=1').get(id)).toMatchObject({ workspace_id: 'default', actor_type: 'agent', session_id: f.env.MOLE_OFFICE_SESSION, proved_by: 'an-agent-key', origin: 'authored' })
  } finally { observed.close() }
  return { recordId: id, seq: 1, contentHash: revision.contentHash }
}

/**
 * The upgrade's configuration for the office `f` serves. `name` ends its candidate tag, and `sends` begins the send id of each notice.
 * Each start the upgrade makes has 120 health reads, 250 ms apart, so about 30 s, to answer healthy. The target's ordinary start
 * loads the office's routes from copied source through tsx before it listens. Alone it answers after about 1.4 s. In a whole
 * run of the suite on 16 November 2026 it had not answered within the old 100 reads 25 ms apart, about 2.5 s, and the upgrade
 * recovered instead of publishing. 30 s is half the fixture's own wait for the same server, so a case whose start never answers
 * still ends inside its limit with the upgrade's own words.
 */
async function theUpgradeConfig(f: Awaited<ReturnType<typeof authenticatedFixture>>, name: string, sends: string) {
  return { developmentRepository: f.dev, stableCheckout: f.stable, database: f.database, serviceHome: f.folder, serviceSettings: { MOLE_OFFICE_MESSAGE_WORKER: 'off', TZ: fixtureTimeZone }, targetCommit: f.target, previousBaselineTag: 'stable-2026-10-01-baseline', candidateTag: `stable-${localStamp(new Date()).slice(0, 10)}-${name}`, evidence: await originalEvidence(f), noticeApproval: f.noticeApproval, noticeSendIds: { before: `${sends}-before`, after: `${sends}-after` }, notice: 'Synthetic upgrade notice approved by the fixture secretary.', serviceGroups: [f.child.pid!, f.serverPid].map(pgid => ({ pgid, startTime: processIdentity(pgid).startTime, cwd: f.stable, database: f.database, port: f.servicePort })), recoveryRoot: f.recovery, servicePort: f.servicePort, releaseCheckPort: f.releaseCheckPort, health: { attempts: 120, intervalMs: 250, timeoutMs: 5000, stopTimeoutMs: 5000, commandTimeoutMs: 30000 } }
}

async function filePolicy(f: Awaited<ReturnType<typeof authenticatedFixture>>, config: any, mode = 'spacing', baselineAgeMinutes = 181) {
  const serving = { commit: f.baseline, repository: f.stable, database: f.database, port: f.servicePort }
  const baseline = await f.request({ method: 'POST', path: '/api/records', body: { kind: 'note', title: 'Made-up baseline operator attestation', data: { body: 'Synthetic first baseline, attested by the fixture secretary.', extra: { stableReleaseBaseline: { version: 1, kind: 'operator-attestation', reason: 'Synthetic baseline setup.', baselineTag: config.previousBaselineTag, serving, establishedAt: new Date(Date.now() - baselineAgeMinutes * 60_000).toISOString() } } } } })
  expect(baseline.status, baseline.body).toBe(201)
  const id = JSON.parse(baseline.body).record.id
  const revision = JSON.parse((await f.request({ method: 'GET', path: `/api/records/${id}/revisions/1` })).body)
  expect(revision.provedBy).toBe('an-agent-key')
  const authorization = { version: 1, timeZone: fixtureTimeZone, mode, reason: 'Synthetic secretary authorization for the exact throwaway release.', candidateTag: config.candidateTag, baselineTag: config.previousBaselineTag, fromCommit: f.baseline, toCommit: f.target, tree: git(f.dev, 'rev-parse', `${f.target}^{tree}`), evidence: { id: config.evidence.recordId, seq: config.evidence.seq, contentHash: config.evidence.contentHash }, serving, validFrom: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 10 * 60_000).toISOString(), baselineSource: { kind: 'bootstrap', note: { id, seq: 1, contentHash: revision.contentHash } } }
  const changed = await f.request({ method: 'PATCH', path: `/api/records/${f.noticeApproval.id}`, body: { dataPatch: { extra: { stableReleaseAuthorization: authorization } } } })
  expect(changed.status, changed.body).toBe(200)
  const seq = JSON.parse(changed.body).newSeq
  const pinned = JSON.parse((await f.request({ method: 'GET', path: `/api/records/${f.noticeApproval.id}/revisions/${seq}` })).body)
  expect(pinned.provedBy).toBe('an-agent-key')
  config.noticeApproval = { id: f.noticeApproval.id, seq, contentHash: pinned.contentHash }
  return authorization
}

it('runs the actual CLI through authenticated original notices, private backup, publication and delivery-only retry', async () => {
  const f = await authenticatedFixture()
  const config = await theUpgradeConfig(f, 'actual-notices', 'actual')
  const verifier = join(f.folder, 'closed-verifier.mjs')
  write(verifier, `import{readFileSync,writeFileSync}from'node:fs';const[input,output]=process.argv.slice(-2),r=JSON.parse(readFileSync(input,'utf8'));const reply=await fetch('http://127.0.0.1:'+r.servicePort+'/api/fixture-write',{method:'POST'});if(reply.status!==503)throw Error('Ordinary admission opened before verification');writeFileSync(output,JSON.stringify({version:1,phase:r.phase,commit:r.commit,stateSha256:r.stateSha256,checks:Object.fromEntries(r.checks.map(name=>[name,true]))}),{mode:0o600});`)
  Object.assign(config, { closedVerification: { command: [process.execPath, verifier], timeoutMs: 5000, checks: ['synthetic-admission'], abortDeadlineMs: 60_000, maxClosedMs: 120_000 } })
  await filePolicy(f, config)
  const configFile = join(f.folder, 'config.json'); write(configFile, JSON.stringify(config))
  write(join(f.folder, 'untranslated-count'), '3')
  const dry = await cli(['--config', configFile, '--dry'], f.env); write(join(f.folder, 'cli-dry.log'), dry.error + dry.output)
  expect(dry.code, dry.error).toBe(0); expect(dry.output).toContain('"state": "dry"')
  expect(JSON.parse(dry.output.slice(dry.output.indexOf('{'))).untranslatedWords).toEqual({ count: 3, checkout: f.dev, commit: f.target, isTarget: true })
  expect(dry.error).toContain(`3 words are not yet translated into Chinese in ${f.dev} at ${f.target}. That is the target commit.`)
  expect(existsSync(join(f.recovery, `${config.candidateTag}.notices.jsonl`))).toBe(false)
  expect(JSON.parse((await f.request({ method: 'GET', path: '/api/office/upgrades?limit=1' })).body).entries).toEqual([])
  const wrongEvidenceFile = join(f.folder, 'wrong-evidence.json')
  write(wrongEvidenceFile, JSON.stringify({ ...config, evidence: { ...config.evidence, contentHash: '0000000000000000' } }))
  const refusedEvidence = await cli(['--config', wrongEvidenceFile], f.env)
  expect(refusedEvidence.code).toBe(1); expect(refusedEvidence.error).toContain('not the original undeleted whole-suite receipt')
  expect(refusedEvidence.error).toContain('No upgrade announcement was attempted'); expect(refusedEvidence.error).toContain('Local refusal retained')
  expect(JSON.parse((await f.request({ method: 'GET', path: '/api/office/upgrades?limit=1' })).body).entries).toEqual([])
  // Drop only the accepted AFTER response. The actual route still commits its original event.
  write(join(f.folder, 'lose-after'), 'Synthetic response-loss fault')
  const actual = await cli(['--config', configFile], f.env); write(join(f.folder, 'cli-upgrade.log'), actual.error + actual.output)
  const result = JSON.parse(actual.output); remember(result)
  expect(result.state, actual.error + actual.output).toBe('published')
  expect(result.closedVerification.phase).toBe('target')
  expect(result.closedVerification.checks).toEqual((config as any).closedVerification.checks)
  expect(actual.code).toBe(1); expect(result.notices.says).toBe('upgrade verified; notice not filed')
  expect(result.notices.state).toBe('pending'); expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.target)
  const privateDb = new Database(result.paths.privateDatabase, { readonly: true })
  try { expect(privateDb.prepare("SELECT COUNT(*) AS n FROM revisions WHERE seq=1 AND json_extract(data,'$.extra.stableUpgradeNotice.request.stage')='before'").get()).toEqual({ n: 1 }) } finally { privateDb.close() }
  const held = new Database(f.database, { readonly: true })
  try { expect(held.prepare('SELECT * FROM fixture_writes').all()).toEqual([{ value: 'accepted after publication' }]) } finally { held.close() }
  const retried = await cli(['--retry-notice', result.paths.noticeJournal], f.env); write(join(f.folder, 'cli-retry.log'), retried.error + retried.output)
  expect(retried.code, retried.error + retried.output).toBe(0)
  const restoredDelivery = JSON.parse(retried.output)
  expect(restoredDelivery.state).toBe('published'); expect(restoredDelivery.service).toEqual(result.service); expect(restoredDelivery.notices.state).toBe('filed')
  const history = JSON.parse((await f.request({ method: 'GET', path: '/api/office/upgrades?limit=1' })).body)
  expect(history.entries).toHaveLength(1); expect(history.entries[0].outcome).toBe('completed')
  const after = JSON.parse((await f.request({ method: 'GET', path: '/api/office/upgrades?sendId=actual-after&limit=1' })).body).notice
  const request = after.event.request
  // A count above zero is in the AFTER outcome and in the text the notice door writes (upgrade-stable.criteria.md, item 15 (d)).
  expect(result.untranslatedWords).toBe(3); expect(request.outcome.untranslatedWords).toBe(3)
  expect(after.content.data.body.startsWith('Upgrade completed and verified. 3 words are not yet translated into Chinese, so the Chinese pages show them in English.\n\n')).toBe(true)
  const office = await readTheOfficesId(f.request)
  expect(verifyNoticeReply({ status: 200, cut: false, location: null, body: JSON.stringify(after) }, request, 'default', office).original).toEqual(after.original)
  for (const alter of [
    (v: any) => { v.content.data.body += ' forged' },
    (v: any) => { v.original.contentHash = '0000000000000000' },
    (v: any) => { v.event.request.sendId = 'different-send' },
  ]) {
    const changed = structuredClone(after); alter(changed)
    expect(() => verifyNoticeReply({ status: 200, cut: false, location: null, body: JSON.stringify(changed) }, request, 'default', office)).toThrow()
  }
  for (const extra of [{ cut: true }, { location: 'http://elsewhere.invalid' }, { status: 500 }]) expect(() => verifyNoticeReply({ status: 200, cut: false, location: null, body: JSON.stringify(after), ...extra }, request, 'default', office)).toThrow()
  const finalDb = new Database(f.database, { readonly: true })
  try {
    expect(finalDb.prepare('SELECT * FROM fixture_writes').all()).toEqual([{ value: 'accepted after publication' }])
    expect(finalDb.prepare("SELECT COUNT(*) AS n FROM revisions WHERE seq=1 AND json_extract(data,'$.extra.stableUpgradeNotice.request.stage')='after'").get()).toEqual({ n: 1 })
  } finally { finalDb.close() }
}, 180_000)

// THE SAME OFFICE THEN SHOWS ITS SERVER ENDS WITH ITS SUPERVISOR. Every run above is dry or refused, so the made-up office
// is still the one the fixture started, as a fresh fixture's is; this saves building a second one, about 7 s.
it('runs mandatory policy refusals and aged bootstrap outside-use and urgent acceptance through the actual CLI, and ends the made-up server once the supervisor that started it is gone', async () => {
  const f = await authenticatedFixture()
  const config = await theUpgradeConfig(f, 'policy-cli', 'policy')
  const configFile = join(f.folder, 'policy-config.json')
  write(configFile, JSON.stringify(config))
  for (const args of [[], ['--dry']]) {
    const result = await cli(['--config', configFile, ...args], f.env)
    write(join(f.folder, args.length ? 'policy-missing-dry.log' : 'policy-missing-real.log'), result.error + result.output)
    expect(result.code).toBe(1); expect(result.error).toContain('Release policy refused:')
  }
  await filePolicy(f, config, 'spacing', 1)
  write(configFile, JSON.stringify(config))
  // OLD: 180 was the release check's own constant. NEW: it is the office's gate row, which this office serves at its
  // default, and a dry run's transport refuses the count of the refusal in its own words.
  // WHY: the owner made the 180 a setting (21 October 2026), and round E's way 1 has the release tool count its refusals.
  // Mutation: let the dry transport send the count, and the sentence below is not there.
  const tooSoon = await cli(['--config', configFile, '--dry'], f.env)
  expect(tooSoon.code).toBe(1); expect(tooSoon.error).toContain('The baseline has not completed 180 minutes.')
  expect(tooSoon.error).toContain('The office did not count this refusal: Upgrade notice: A dry run sends no write, so it files no notice and counts no refusal.')
  for (const [mode, age] of [['spacing', 181], ['outside-use', 1], ['urgent-fix', 1]] as const) {
    const authorization = await filePolicy(f, config, mode, age)
    write(configFile, JSON.stringify(config))
    const accepted = await cli(['--config', configFile, '--dry'], f.env)
    write(join(f.folder, `policy-${mode}-dry.log`), accepted.error + accepted.output)
    expect(accepted.code, accepted.error + accepted.output).toBe(0)
    expect(accepted.output).toContain(`"mode": "${mode}"`)
    expect(accepted.output).toContain(authorization.baselineSource.note.id)
    expect(accepted.output).toContain("key's last-use time and the API usage counters")
    expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.baseline)
    expect(existsSync(join(f.stable, '.git/stable-upgrade.lock'))).toBe(false)
    expect(existsSync(join(f.recovery, `${config.candidateTag}.notices.jsonl`))).toBe(false)
  }
  expect(JSON.parse((await f.request({ method: 'GET', path: '/api/office/upgrades?limit=1' })).body).entries).toEqual([])
  await theseGroupsEndAfterASigkillOf(-f.child.pid!, [f.serverPid])
}, 180_000)

it('keeps real unannounced preflight refusals locally and makes no file for dry or an unsafe destination', async () => {
  const folder = mkdtempSync(join(out, 'notice-refusal-')); folders.push(folder)
  const recovery = join(folder, 'recovery'), developmentRepository = join(folder, 'development'), stableCheckout = join(folder, 'stable')
  mkdirSync(recovery, { mode: 0o700 }); mkdirSync(developmentRepository); mkdirSync(stableCheckout)
  const config = join(folder, 'invalid.json')
  write(config, JSON.stringify({ recoveryRoot: recovery, developmentRepository, stableCheckout }))
  const env = { PATH: process.env.PATH }
  const refused = await cli(['--config', config], env)
  expect(refused.code).toBe(1); expect(refused.error).toContain('No upgrade announcement was attempted'); expect(refused.error).toContain('Local refusal retained')
  const files = (await import('node:fs')).readdirSync(recovery)
  expect(files).toHaveLength(1); expect(readFileSync(join(recovery, files[0]!), 'utf8')).toContain('"state":"refused"')
  const dry = await cli(['--config', config, '--dry'], env)
  expect(dry.code).toBe(1); expect((await import('node:fs')).readdirSync(recovery)).toEqual(files)
  write(config, '{unreadable')
  const broken = await cli(['--config', config], env)
  expect(broken.code).toBe(1); expect(broken.error).toContain('refusal journal unavailable')
  write(config, JSON.stringify({ recoveryRoot: developmentRepository, developmentRepository, stableCheckout }))
  const unsafe = await cli(['--config', config], env)
  expect(unsafe.code).toBe(1); expect(unsafe.error).toContain('refusal journal unavailable')
  expect((await import('node:fs')).readdirSync(developmentRepository)).toEqual([])
})

it('ends every group the CLI\'s upgrade started once the owner of the fixture is gone', async () => {
  const owner = aStandInOwner(standIns)
  const f = await authenticatedFixture(owner)
  const config = await theUpgradeConfig(f, 'owner-ends', 'owner')
  await filePolicy(f, config)
  const configFile = join(f.folder, 'owner-config.json'); write(configFile, JSON.stringify(config))
  const upgraded = await cli(['--config', configFile], f.env); write(join(f.folder, 'cli-upgrade.log'), upgraded.error + upgraded.output)
  const result = JSON.parse(upgraded.output); remember(result)
  expect(result.state, upgraded.error + upgraded.output).toBe('published')
  const started = [result.service.pgid, ...result.service.detachedGroups.map((group: any) => group.pgid)]
  expect(started, 'the groups of the upgrade\'s gate and of the server').toHaveLength(2)
  await theseGroupsEndAfterASigkillOf(owner, started)
}, 180_000)
