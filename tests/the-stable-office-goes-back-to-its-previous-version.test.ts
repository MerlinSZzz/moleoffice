// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The way back: the stable office returns from the version it serves to the version before its newest
 * completed upgrade, on the same database, port, home and settings, and the database is never rolled back.
 *
 * Every world here is made up under the temporary folder: Git repositories, a SQLite file, a small HTTP
 * server that stands in for the office, and an upgrade history from the release policy's own made-up
 * fixture. Nothing here reaches a real office.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'
import Database from 'better-sqlite3'
import { theClockZone } from '../src/shared/time.ts'
import { THE_STATEMENT_BREAKPOINT } from '../src/config/migration-look.mjs'
import { THE_STEPS } from '../src/server/db/migrate.ts'
import { THE_MIGRATIONS_PATH, THE_STEPS_FILE, theStepNames, theWayBackCheck, whatAStatementChanges } from '../tools/stable/the-way-back.mjs'
import { artifactIdentity, processIdentity, returnToThePreviousStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { fakeReleasePolicyFixture, historyPage } from './stable-release-policy-fixture.ts'
import { aLineThatStopsAServerWithItsStarterOrOwner, aStandInOwner, commandUnderTheOwnerWatchingGate, endTheStandIns, theseGroupsEndAfterASigkillOf } from './the-owner-watching-gate.ts'
import { aMadeUpElectronPackage } from './stable-upgrade-fixture.ts'

const root = resolve(import.meta.dirname, '..')
const zone = theClockZone()
const databaseModule = createRequire(import.meta.url).resolve('better-sqlite3')
const previousTag = 'stable-2026-10-20-previous'
const newerTag = 'stable-2026-10-22-newer'
const groups = new Set<number>()
const children: ChildProcess[] = []
const folders: string[] = []
const standIns: ChildProcess[] = []

function run(cwd: string, program: string, args: string[]) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', timeout: 60_000, env: { PATH: process.env.PATH, HOME: cwd, LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', npm_config_cache: join(cwd, '.npm-cache') } })
  if (result.status !== 0 || result.error) throw new Error(`${program} ${args.join(' ')}: ${result.error?.message ?? result.stderr}`)
  return result.stdout.trim()
}
function git(cwd: string, ...args: string[]) { return run(cwd, 'git', args) }
function write(path: string, contents: string) { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path, contents) }
function folder(prefix: string) { const made = mkdtempSync(join(tmpdir(), prefix)); folders.push(made); return made }
async function port(exclude: number[] = []): Promise<number> {
  const server = createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const chosen = (server.address() as { port: number }).port
  await new Promise<void>((r) => server.close(() => r()))
  return thePortsATestKeepsOff().includes(chosen) || exclude.includes(chosen) ? port(exclude) : chosen
}

/** A version's migrations as the real tree keeps them: a journal, one file per migration, statements split by the breakpoint. */
function writeMigrations(repo: string, migrations: Array<[tag: string, statements: string[]]>) {
  write(join(repo, THE_MIGRATIONS_PATH, 'meta/_journal.json'), JSON.stringify({ version: '7', dialect: 'sqlite', entries: migrations.map(([tag], idx) => ({ idx, version: '6', when: idx, tag, breakpoints: true })) }))
  for (const [tag, statements] of migrations) write(join(repo, THE_MIGRATIONS_PATH, `${tag}.sql`), statements.join(`\n${THE_STATEMENT_BREAKPOINT}\n`))
}
/** A version's in-place steps, in the shape of the real list. */
function writeSteps(repo: string, names: string[]) {
  write(join(repo, THE_STEPS_FILE), `// The in-place steps of this made-up version.\nexport const THE_STEPS = [\n${names.map((name) => `  {\n    name: '${name}',\n  },\n`).join('')}]\n`)
}
const FIRST: [string, string[]] = ['0000_records', ['CREATE TABLE `records` (`id` text PRIMARY KEY NOT NULL, `value` text);', 'CREATE TABLE `old_things` (`id` text);']]
const ADDS: [string, string[]] = ['0001_adds', ['CREATE TABLE `later_notes` (`id` text PRIMARY KEY NOT NULL, `body` text);', 'ALTER TABLE `records` ADD `label` text;', 'CREATE INDEX `records_label` ON `records` (`label`);']]
/**
 * The files the way back over ADDS reads its case from: the newer version added that migration and wrote it in the
 * migrations' journal, so both differ from the previous version's, and the way back is a release of case 2.
 */
const THE_FILES_ADDS_CHANGES = [join(THE_MIGRATIONS_PATH, `${ADDS[0]}.sql`), join(THE_MIGRATIONS_PATH, 'meta/_journal.json')]
const DROPS: [string, string[]] = ['0001_drops', ['DROP TABLE `old_things`;']]
// The three changes a reviewed list may allow, each alone in a migration.
const TRIGGERS: [string, string[]] = ['0001_record_words', [
  'CREATE TABLE `record_words` (`id` text PRIMARY KEY NOT NULL, `words` text);',
  "INSERT INTO `record_words` SELECT `id`, `value` FROM `records`;",
  'CREATE TRIGGER IF NOT EXISTS `record_words_on_insert` AFTER INSERT ON `records` BEGIN INSERT INTO `record_words` VALUES (new.`id`, new.`value`); END;',
]]
const DELETES: [string, string[]] = ['0001_deletes', ['DELETE FROM `records` WHERE `value` IS NULL;']]
const UNIQUE: [string, string[]] = ['0001_unique', ['CREATE UNIQUE INDEX `records_value_once` ON `records` (`value`);']]
/** What a reviewer writes about TRIGGERS, without the migration's name. The reviewer is made up. */
const REVIEW = {
  safeBecause: 'Its trigger writes only to record_words, which the same migration creates, and the previous version never reads that table. The trigger costs about 1 to 1.5 ms per write.',
  reviewedBy: 'A made-up reviewer',
  reviewedAt: '2026-10-24 00:36',
}

/** The made-up server. It stops on TERM, and once its supervisor or `owner` is gone (aLineThatStopsAServerWithItsStarterOrOwner). */
const serverSource = (owner: number) => `
import http from 'node:http';import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';
import {versionOf} from ${JSON.stringify(join(root, 'src/server/lib/version.ts'))};
const require=createRequire(import.meta.url);const Database=require(${JSON.stringify(databaseModule)});
const repository=process.cwd(),database=process.env.MOLE_OFFICE_DB,port=Number(process.env.MOLE_OFFICE_PORT),mode=process.env.MOLE_OFFICE_START_MODE??'ordinary';
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT&&(execFileSync('git',['symbolic-ref','HEAD'],{encoding:'utf8'}).trim()!=='refs/heads/stable'||!execFileSync('git',['tag','--points-at','HEAD'],{encoding:'utf8'}).trim().split('\\n').some(t=>/^stable-\\d{4}-\\d{2}-\\d{2}-/.test(t))))throw Error('The made-up stable office starts only on its dated stable tag');
const db=new Database(database,{readonly:mode==='release-check',fileMustExist:true});
const identity={commit,repository,database,port,mode};
const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');
 if(req.url==='/api/health')return res.end(JSON.stringify({ok:true,...(mode==='release-check'?{identity}:{world:{repository,database,port,head:commit.slice(0,7)}})}));
 if(req.url==='/api/runtime')return res.end(JSON.stringify(mode==='release-check'?{identity}:{repository:{path:repository,head:{full:commit}},database:{path:database},addresses:{api:'http://127.0.0.1:'+port},process:{pid:process.pid},supervisor:{pid:process.ppid},worker:{started:false,pid:null,pgid:null},fixtureHome:process.env.HOME,fixtureWorker:process.env.MOLE_OFFICE_MESSAGE_WORKER,fixtureZone:process.env.TZ,fixtureVersion:readFileSync('version.txt','utf8')}));
 if(mode==='release-check'){res.statusCode=503;return res.end(JSON.stringify({error:'This release check refuses ordinary routes and writes.'}))}
 if(req.method==='GET'&&req.url==='/api/participants/agent/mole-office')return res.end(JSON.stringify({participant:{id:'mole-office',handle:'mole-office',retired:false}}));
 if(req.method==='GET'&&req.url.startsWith('/api/office/upgrades?')){const saved=db.prepare('SELECT response FROM fixture_notices WHERE send_id=?').get(new URL(req.url,'http://fixture').searchParams.get('sendId'));return res.end(JSON.stringify({notice:saved?{...JSON.parse(saved.response),replayed:true}:null}))}
 if(req.method==='POST'&&req.url==='/api/office/upgrades/notice'){let body='';req.on('data',b=>body+=b);req.on('end',()=>{const request=JSON.parse(body);const old=db.prepare('SELECT payload,response FROM fixture_notices WHERE send_id=?').get(request.sendId);if(old){if(old.payload!==body){res.statusCode=409;return res.end('{}')}return res.end(JSON.stringify({...JSON.parse(old.response),replayed:true}))}const event={version:1,project:req.headers['x-mole-office-workspace']??'fixture-project',date:'2026-10-23 01:00:00',request};const content={kind:'message',title:'Synthetic notice',summary:null,data:{body:request.stage==='before'?request.announcement.notice:'Synthetic final notice',sentBy:{kind:'agent',id:'mole-office'},to:[{kind:'person',id:'fixture-owner'}],extra:{stableUpgradeNotice:event}},deletedAt:null};const reply={original:{id:'fixture-'+request.stage,seq:1,contentHash:versionOf(content)},content,event,replayed:false};db.prepare('INSERT INTO fixture_notices VALUES (?,?,?,?)').run(request.sendId,body,JSON.stringify(reply),commit);res.statusCode=201;res.end(JSON.stringify(reply))});return}
 res.statusCode=404;res.end('{}');});
server.listen(port,'127.0.0.1');const stop=()=>server.close(()=>{db.close();process.exit(0)});process.on('SIGTERM',stop);${aLineThatStopsAServerWithItsStarterOrOwner('stop', owner)}
`

/**
 * A stable office that completed an upgrade from `previous` to `newer`, which added `newerMigration`. It serves
 * `newer` with the message worker's merges-only setting, and the office's history records that upgrade.
 */
/**
 * With `newestWentInAsAnEmergency`, the completed upgrade from previous to newer went in as an emergency release. Every
 * office of the world ends once `owner` is gone: this test worker, or a stand-in for it.
 */
async function world(newerMigration: [string, string[]], newestWentInAsAnEmergency: { followUp: object; report: object } | null = null, owner = process.pid) {
  const base = folder('stable-way-back-')
  const remote = join(base, 'remote.git'), dev = join(base, 'development'), stable = join(base, 'stable'), recovery = join(base, 'recovery'), home = join(base, 'home'), database = join(base, 'office.sqlite')
  mkdirSync(dev); mkdirSync(home); mkdirSync(recovery, { mode: 0o700 })
  git(base, 'init', '--bare', remote); git(dev, 'init', '-b', 'main')
  git(dev, 'config', 'user.email', 'fixture@example.invalid'); git(dev, 'config', 'user.name', 'Synthetic way back fixture')
  write(join(dev, '.gitignore'), 'node_modules/\ndist/\n.npm-cache/\n.env\n')
  write(join(dev, 'src/server/index.ts'), serverSource(owner))
  write(join(dev, 'tools/serve-dev.mjs'), `import{spawn}from'node:child_process';import{theSupervisorsStartupIsDone}from${JSON.stringify(join(root, 'src/config/supervisor-startup-done.mjs'))};if(!process.argv.includes('--built')||!process.argv.includes('--prepared'))throw Error('Expected built prepared supervisor');const child=spawn(process.execPath,['src/server/index.ts','--stop-with-pid='+process.pid],{detached:true,stdio:'inherit',env:{...process.env,MOLE_OFFICE_RESTART_REASON:'fixture start'}});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>{try{process.kill(-child.pid,'SIGTERM')}catch{}});console.log(theSupervisorsStartupIsDone(process.pid,Number(process.env.MOLE_OFFICE_PORT)));`)
  // A locked no-op loader lets the release check's --import tsx use Node's native type stripping.
  write(join(dev, 'fixture-loader/package.json'), JSON.stringify({ name: 'tsx', version: '0.0.0', type: 'module', exports: './loader.mjs' }))
  write(join(dev, 'fixture-loader/loader.mjs'), '// The fixture entries contain only erasable types.\n')
  run(dev, 'tar', ['-czf', 'fixture-loader.tgz', 'fixture-loader']); rmSync(join(dev, 'fixture-loader'), { recursive: true })
  // The way back runs electron's install.js after npm ci, so the made-up office carries the made-up electron package.
  const electron = aMadeUpElectronPackage(dev)
  write(join(dev, 'package.json'), JSON.stringify({ name: 'synthetic-way-back-office', version: '1.0.0', type: 'module', scripts: { typecheck: 'node typecheck.mjs', 'db:migrate': 'node migrate.mjs' }, dependencies: { tsx: 'file:fixture-loader.tgz', ...electron } }))
  write(join(dev, 'typecheck.mjs'), `import{mkdirSync,writeFileSync}from'node:fs';mkdirSync('dist',{recursive:true});writeFileSync('dist/fixture-typechecked','checked');`)
  write(join(dev, 'tools/build-the-page.mjs'), `import{existsSync,mkdirSync,readFileSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';export async function buildThePage(){if(!existsSync('dist/fixture-typechecked'))return{ok:false,output:'Typecheck was skipped'};mkdirSync('dist/web',{recursive:true});writeFileSync('dist/web/index.html',readFileSync('version.txt'));writeFileSync('dist/web/build-stamp.json',JSON.stringify({builtAt:'2026-10-23 01:00:00',builtAtMs:1,newestSourceAt:null,newestSourceAtMs:null,newestSourceFile:null,newestSourceFiles:null,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}));return{ok:true}}`)
  // The way back never migrates, so this marker row in the office database must never appear.
  write(join(dev, 'migrate.mjs'), `import{createRequire}from'node:module';import{readFileSync}from'node:fs';const require=createRequire(import.meta.url);const Database=require(${JSON.stringify(databaseModule)});const db=new Database(process.env.MOLE_OFFICE_DB);db.prepare("INSERT INTO records (id, value) VALUES ('migration',?)").run(readFileSync('version.txt','utf8'));db.close();`)
  write(join(dev, 'plugins/example/plugin.json'), JSON.stringify({ id: 'example', pages: [{ slug: 'main' }] }))
  write(join(dev, 'tools/build-a-plugin.mjs'), `import{mkdirSync,readFileSync,writeFileSync}from'node:fs';mkdirSync('plugins/'+process.argv[2]+'/dist',{recursive:true});writeFileSync('plugins/'+process.argv[2]+'/dist/main.html',readFileSync('version.txt'));`)
  write(join(dev, 'version.txt'), 'previous')
  writeMigrations(dev, [FIRST]); writeSteps(dev, ['a-made-up-step'])
  run(dev, 'npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'])
  git(dev, 'add', '.'); git(dev, 'commit', '-m', 'Synthetic previous version'); const previous = git(dev, 'rev-parse', 'HEAD'); git(dev, 'tag', previousTag)
  write(join(dev, 'version.txt'), 'newer'); writeMigrations(dev, [FIRST, newerMigration])
  git(dev, 'add', '.'); git(dev, 'commit', '-m', 'Synthetic newer version'); const newer = git(dev, 'rev-parse', 'HEAD'); git(dev, 'tag', newerTag)
  git(dev, 'remote', 'add', 'origin', remote); git(dev, 'push', 'origin', 'main', '--tags')
  // Stable as the completed upgrade left it: branch stable at the newer tag, with the newer version built.
  git(base, 'clone', '--no-local', '--branch', 'main', remote, stable); git(stable, 'checkout', '-b', 'stable')
  run(stable, 'npm', ['ci', '--no-audit', '--no-fund']); run(stable, 'npm', ['run', 'typecheck'])
  run(stable, process.execPath, ['--input-type=module', '--eval', "const {buildThePage}=await import('./tools/build-the-page.mjs');if(!(await buildThePage()).ok)process.exitCode=1"])
  run(stable, process.execPath, ['tools/build-a-plugin.mjs', 'example'])
  // The database as the newer version left it, with a row written before the upgrade and one after it.
  const db = new Database(database)
  db.exec("CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT, label TEXT); CREATE TABLE later_notes(id TEXT PRIMARY KEY, body TEXT); CREATE INDEX records_label ON records(label); CREATE TABLE fixture_notices(send_id TEXT PRIMARY KEY, payload TEXT, response TEXT, served_by TEXT); INSERT INTO records VALUES ('authored','before the upgrade',NULL); INSERT INTO later_notes VALUES ('written','after the upgrade');")
  db.close(); chmodSync(database, 0o600)
  write(join(dev, '.env'), `MOLE_OFFICE_STABLE_CHECKOUT=${stable}\n`)
  const servicePort = await port(), releaseCheckPort = await port([servicePort])
  // The group dies with this worker, even after a SIGKILL (tests/the-owner-watching-gate.ts).
  const supervisor = commandUnderTheOwnerWatchingGate(['tools/serve-dev.mjs', '--built', '--prepared'], owner)
  const child = spawn(supervisor.command, supervisor.args, { cwd: stable, detached: true, stdio: 'ignore', env: { PATH: process.env.PATH, TZ: zone, HOME: home, MOLE_OFFICE_DEVELOPMENT_CHECKOUT: dev, MOLE_OFFICE_MESSAGE_WORKER: 'merges-only', MOLE_OFFICE_DB: database, MOLE_OFFICE_PORT: String(servicePort), MOLE_OFFICE_START_MODE: 'ordinary' } })
  if (!child.pid) throw new Error('The made-up stable office did not start.')
  groups.add(child.pid); children.push(child)
  let runtime: any = null
  for (let i = 0; i < 300 && !runtime; i++) {
    try { runtime = await (await fetch(`http://127.0.0.1:${servicePort}/api/runtime`)).json() } catch { await delay(20) }
  }
  if (!runtime) throw new Error('The made-up stable office did not answer.')
  const leader = { pgid: child.pid, startTime: processIdentity(child.pid).startTime, cwd: stable, database, port: servicePort }
  const server = processIdentity(runtime.process.pid); groups.add(server.pgid)
  const serviceGroups = [leader, { ...leader, pgid: server.pgid, startTime: server.startTime }]
  // The history: the made-up original BEFORE and AFTER of the completed upgrade from previous to newer.
  const evidence = { recordId: 'synthetic-previous-receipt', seq: 1, contentHash: 'aaaaaaaaaaaaaaaa' }
  const notice = 'Synthetic way back notice.'
  const policy = fakeReleasePolicyFixture({ config: { stableCheckout: stable, database, servicePort, previousBaselineTag: newerTag, candidateTag: previousTag, targetCommit: previous, evidence, notice }, baseline: newer, tree: git(dev, 'rev-parse', `${newer}^{tree}`) })
  const newest = policy.completedAfter('2026-10-22 09:00:00', 'Etc/UTC', { baselineTag: previousTag, fromCommit: previous }, newestWentInAsAnEmergency)
  const config = { developmentRepository: dev, stableCheckout: stable, evidence, serviceGroups, notice, noticeApproval: { id: 'synthetic-approval', seq: 1, contentHash: 'bbbbbbbbbbbbbbbb' }, noticeSendIds: { before: 'synthetic-back-before', after: 'synthetic-back-after' }, releaseCheckPort, health: { attempts: 120, intervalMs: 25, timeoutMs: 2000, stopTimeoutMs: 5000, commandTimeoutMs: 60_000 }, recoveryRoot: recovery }
  const requests: Array<{ method: string; path: string; api?: string }> = []
  const officeRequest = Object.assign(async (request: { method: string; path: string; body?: unknown }, destination?: { api: string }) => {
    requests.push({ method: request.method, path: request.path, api: destination?.api })
    if (request.method !== 'GET' && request.path !== '/api/office/upgrades/notice') throw new Error('The way back attempted an unrelated office write.')
    if (!destination) return policy.officeRequest(request)
    const response = await fetch(destination.api + request.path, { method: request.method, ...('body' in request ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(request.body) } : {}), signal: AbortSignal.timeout(2000), redirect: 'manual' })
    return { status: response.status, body: await response.text(), location: response.headers.get('location'), cut: false, added: null }
  }, { identity: policy.officeRequest.identity })
  // The receipt reader has its own real-office tests; this seam records which commit it was asked about.
  const receiptsAsked: string[] = []
  const verifyEvidence = async (asked: { commit: string }, { officeRequest: request }: any) => {
    receiptsAsked.push(asked.commit)
    await request({ method: 'GET', path: `/api/records/${evidence.recordId}/revisions/1` })
    return { receipt: { commit: asked.commit }, original: {}, result: {}, artifacts: [] }
  }
  const options = { officeRequest, verifyEvidence, onStep: (event: any) => { if (event.pgid) groups.add(event.pgid) } }
  const artifacts = () => ['node_modules', 'dist', 'plugins/example/dist'].map((p) => artifactIdentity(join(stable, p), stable))
  return { base, dev, stable, recovery, database, previous, newer, config, options, requests, receiptsAsked, runtime, artifacts, servicePort, policy, newest }
}
type World = Awaited<ReturnType<typeof world>>
function rows(f: World) {
  const db = new Database(f.database, { readonly: true })
  try {
    return {
      records: db.prepare('SELECT id, value FROM records ORDER BY id').all(),
      later: db.prepare('SELECT * FROM later_notes').all(),
      notices: db.prepare('SELECT send_id, served_by FROM fixture_notices ORDER BY rowid').all(),
    }
  } finally { db.close() }
}
function remember(result: any) {
  if (result.service) { groups.add(result.service.pgid); for (const g of result.service.detachedGroups ?? []) groups.add(g.pgid) }
  return result
}
const lock = (f: World) => join(f.stable, '.git/stable-upgrade.lock')

afterEach(async () => {
  vi.unstubAllGlobals()
  await endTheStandIns(standIns)
  for (const pgid of groups) {
    try { if (processIdentity(pgid).pgid === pgid) process.kill(-pgid, 'SIGTERM') } catch (e: any) { if (!['ENOENT', 'ESRCH'].includes(String(e.code))) throw e }
  }
  for (let n = 0; n < 250; n++) {
    const alive = [...groups].filter((pid) => { try { return !['Z', 'X'].includes(String(processIdentity(pid).state)) } catch { return false } })
    if (!alive.length) break
    if (n === 249) throw new Error(`The made-up groups did not end: ${alive.join(', ')}`)
    await delay(20)
  }
  for (const child of children) if (child.exitCode === null && child.signalCode === null) await new Promise<void>((r) => child.once('exit', () => r()))
  groups.clear(); children.length = 0
  for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true })
})

describe('the way back to the previous stable version, in a made-up world', () => {
  // Mutation: let the way back run the migration step, and the marker row lands in the office database.
  it('returns stable to the previous version on the same database, port, home and settings', async () => {
    const f = await world(ADDS)
    expect(f.runtime.fixtureWorker).toBe('merges-only')
    const kept = rows(f)
    const result = remember(await returnToThePreviousStable(f.config, f.options))
    expect(result.state, JSON.stringify(result)).toBe('published')
    expect(result.notices.state).toBe('filed')
    expect(result.releaseCase).toEqual({ case: 2, because: expect.any(String), files: THE_FILES_ADDS_CHANGES })
    expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.previous)
    expect(git(f.stable, 'branch', '--show-current')).toBe('stable')
    expect(git(f.stable, 'rev-parse', `${newerTag}^{commit}`)).toBe(f.newer)
    expect(readFileSync(join(f.stable, 'dist/web/index.html'), 'utf8')).toBe('previous')
    expect(readFileSync(join(f.stable, 'plugins/example/dist/main.html'), 'utf8')).toBe('previous')
    expect(f.receiptsAsked).toEqual([f.previous])
    const runtime = await (await fetch(`http://127.0.0.1:${f.servicePort}/api/runtime`)).json()
    expect(runtime.repository.head.full).toBe(f.previous)
    expect(runtime.fixtureVersion).toBe('previous')
    expect(runtime.database.path).toBe(f.runtime.database.path)
    expect(runtime.addresses.api).toBe(f.runtime.addresses.api)
    expect([runtime.fixtureHome, runtime.fixtureWorker, runtime.fixtureZone]).toEqual([f.runtime.fixtureHome, f.runtime.fixtureWorker, f.runtime.fixtureZone])
    const now = rows(f)
    expect(now.records).toEqual(kept.records)
    expect(now.later).toEqual(kept.later)
    expect(now.notices).toEqual([{ send_id: f.config.noticeSendIds.before, served_by: f.newer }, { send_id: f.config.noticeSendIds.after, served_by: f.previous }])
    const journal = readdirSync(f.recovery).find((name) => name.endsWith('.journal.jsonl'))!
    expect(journal.startsWith(`${newerTag}.back-`)).toBe(true)
    const entries = readFileSync(join(f.recovery, journal), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    const steps = entries.map((entry) => entry.step)
    expect(entries.filter((entry) => entry.step === 'release-case')).toEqual([expect.objectContaining({ phase: 'decided', ...result.releaseCase })])
    for (const left of ['candidate-migrate', 'private-backup', 'stable-fetch', 'candidate-tag', 'migrate', 'policy-lock', 'untranslated-words', 'notice-contract']) expect(steps).not.toContain(left)
    // The way back sends no untranslated-word count, and its result says so (upgrade-stable.criteria.md, item 15 (d)).
    expect(result.untranslatedWordsSays).toBe('The way back sends no untranslated-word count.')
    expect(result).not.toHaveProperty('untranslatedWords')
    const after = readFileSync(result.paths.noticeJournal, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).find((row) => row.step === 'after-ready')
    expect(JSON.parse(after.payload).outcome.state).toBe('completed')
    expect(JSON.parse(after.payload).outcome).not.toHaveProperty('untranslatedWords')
    // The newer version added a migration, so the way back reads case 2: it checks the previous version on a rehearsal
    // copy, and deletes that copy before its BEFORE notice. It takes no sanitized backup.
    for (const taken of ['candidate-database', 'candidate-check', 'delete-candidate-database', 'notice-before', 'stable-checkout', 'install-artifacts', 'stable-check', 'ordinary-start']) expect(steps).toContain(taken)
    expect(steps.lastIndexOf('delete-candidate-database')).toBeLessThan(steps.indexOf('notice-before'))
    expect(steps).not.toContain('sanitized-backup')
    expect(existsSync(lock(f))).toBe(false)
  }, 180_000)

  // Mutation: drop the transaction's refusal on the way back check, and the way back goes ahead.
  it('refuses a migration that does more than add, names it, and changes nothing', async () => {
    const f = await world(DROPS)
    const before = { head: git(f.stable, 'rev-parse', 'HEAD'), artifacts: f.artifacts(), rows: rows(f) }
    const refusal = await returnToThePreviousStable(f.config, f.options).then(() => null, (error: Error) => error.message)
    expect(refusal).toContain(`The migration ${DROPS[0]} does more than add`)
    expect(refusal).toContain('changed nothing')
    expect({ head: git(f.stable, 'rev-parse', 'HEAD'), artifacts: f.artifacts(), rows: rows(f) }).toEqual(before)
    expect(rows(f).notices).toEqual([])
    expect(readdirSync(f.recovery)).toEqual([])
    expect(existsSync(lock(f))).toBe(false)
    expect(f.requests.filter((request) => request.method !== 'GET')).toEqual([])
    expect((await (await fetch(`http://127.0.0.1:${f.servicePort}/api/runtime`)).json()).repository.head.full).toBe(f.newer)
  }, 120_000)

  // Mutation: give the dry way back the upgrade's plan, and the plan no longer names the way back.
  it('says in dry mode what it would do, and does none of it', async () => {
    const f = await world(ADDS)
    const before = { head: git(f.stable, 'rev-parse', 'HEAD'), artifacts: f.artifacts(), rows: rows(f) }
    const result = await returnToThePreviousStable(f.config, { ...f.options, dry: true })
    expect(result.state).toBe('dry')
    expect([result.baseline, result.target]).toEqual([f.newer, f.previous])
    expect(result.migrationsChecked).toEqual([ADDS[0]])
    expect(result.migrationsReviewed).toEqual([])
    expect(result.releaseCase).toEqual({ case: 2, because: expect.any(String), files: THE_FILES_ADDS_CHANGES })
    expect(result.plan.some((line: string) => line.includes(newerTag) && line.includes(previousTag))).toBe(true)
    expect(result.plan.some((line: string) => line.includes(ADDS[0]))).toBe(true)
    expect(result.untranslatedWordsSays).toBe('The way back sends no untranslated-word count.')
    expect(result.plan).toContain('The way back sends no untranslated-word count.')
    expect(result).not.toHaveProperty('untranslatedWords')
    expect({ head: git(f.stable, 'rev-parse', 'HEAD'), artifacts: f.artifacts(), rows: rows(f) }).toEqual(before)
    expect(readdirSync(f.recovery)).toEqual([])
    expect(existsSync(lock(f))).toBe(false)
    expect(f.requests.filter((request) => request.method !== 'GET')).toEqual([])
  }, 120_000)

  // Mutation: leave the configuration's reviewed list out of the way back, and the listed migration is refused.
  it('lets a migration through that the reviewed list names, and plans with its review', async () => {
    const f = await world(TRIGGERS)
    const before = { head: git(f.stable, 'rev-parse', 'HEAD'), artifacts: f.artifacts(), rows: rows(f) }
    const unlisted = await returnToThePreviousStable(f.config, { ...f.options, dry: true }).then(() => null, (error: Error) => error.message)
    expect(unlisted).toContain(`reviewedMigrations does not name ${TRIGGERS[0]}.sql`)
    const entry = { migration: `${TRIGGERS[0]}.sql`, ...REVIEW }
    const result = await returnToThePreviousStable({ ...f.config, reviewedMigrations: [entry, { migration: '0002_another.sql', ...REVIEW }] }, { ...f.options, dry: true })
    expect(result.state).toBe('dry')
    expect(result.migrationsChecked).toEqual([])
    expect(result.migrationsReviewed).toEqual([{ ...entry, changes: [expect.stringContaining('record_words_on_insert')] }])
    expect(result.plan.some((line: string) => [entry.migration, REVIEW.reviewedBy, REVIEW.reviewedAt, REVIEW.safeBecause].every((part) => line.includes(part)))).toBe(true)
    expect(result.plan.some((line: string) => line.includes('0002_another.sql'))).toBe(true)
    expect({ head: git(f.stable, 'rev-parse', 'HEAD'), artifacts: f.artifacts(), rows: rows(f) }).toEqual(before)
    expect(readdirSync(f.recovery)).toEqual([])
    expect(existsSync(lock(f))).toBe(false)
    expect(f.requests.filter((request) => request.method !== 'GET')).toEqual([])
  }, 120_000)
})

// OLD: every version the way back returns to had a green receipt for its exact commit.
// NEW: a version may have gone in as an emergency release, without one. The way back FROM an emergency release is
// unchanged: it needs the receipt of the version before, which exists. The way back TO one refuses until its follow-up
// receipt is filed and green. It then names that receipt as its evidence, reads it at the receipt's later commit, and its
// notice holds the one line that says the follow-up stands for the release.
// WHY: the way back exists to recover from a broken newer version. The emergency release ran as the stable office and a
// green receipt contains it, so refusing the way back to it would leave the office broken; without that receipt nothing
// says it ever passed.
describe('the way back and an emergency release', () => {
  const greenFollowUp = { id: 'synthetic-follow-up-receipt', seq: 1 as const, contentHash: 'cccccccccccccccc' }
  const standing = (f: World) => `The emergency release ${previousTag} has no receipt of its own. Its follow-up receipt ${greenFollowUp.id}, on later commit ${f.newer}, stands for it.`
  const waits = (state: string) => `The previous version ${previousTag} went in as an emergency release, and its follow-up receipt ${state}. The way back to it waits for a green follow-up receipt.`
  // The history row of the release that installed the previous version, as the office works it out on read.
  function previousWentInAsAnEmergency(f: World, followUp: object) {
    const row = { tag: previousTag, baselineTag: 'stable-2026-10-18-older', date: '2026-10-20 09:00:00', outcomeDate: '2026-10-20 09:20:00',
      notice: 'Synthetic emergency notice.', fromCommit: 'c'.repeat(40), toCommit: f.previous, tree: git(f.dev, 'rev-parse', `${f.previous}^{tree}`),
      outcome: 'completed', reason: null, before: { id: 'fixture-emergency-before', seq: 1, contentHash: 'dddddddddddddddd' },
      after: { id: 'fixture-emergency-after', seq: 1, contentHash: 'eeeeeeeeeeeeeeee' }, notices: { before: 'unchanged', after: 'unchanged' },
      kind: 'emergency', emergency: { throw: { change: 'fixture-older-throw', appendOrder: 50 },
        message: { id: 'fixture-older-emergency-message', seq: 1, contentHash: 'ffffffffffffffff' }, followUp, report: { state: 'filed', id: 'fixture-older-report' } } }
    f.policy.records.set('/api/office/upgrades?limit=25', historyPage([f.newest.historyRow, row]))
  }
  const unchanged = async (f: World, before: object) => {
    expect({ head: git(f.stable, 'rev-parse', 'HEAD'), artifacts: f.artifacts(), rows: rows(f) }).toEqual(before)
    expect(readdirSync(f.recovery)).toEqual([])
    expect(existsSync(lock(f))).toBe(false)
    expect(f.requests.filter((request) => request.method !== 'GET')).toEqual([])
    expect(f.receiptsAsked).toEqual([])
  }

  // Mutation: let the way back look for an emergency on the newest release instead of the previous one, and this refuses.
  it('goes back FROM an emergency release as from any other, with the receipt of the version before it', async () => {
    const f = await world(ADDS, { followUp: { state: 'missing' }, report: { state: 'missing' } })
    const result = remember(await returnToThePreviousStable(f.config, f.options))
    expect(result.state, JSON.stringify(result)).toBe('published')
    expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.previous)
    expect(f.receiptsAsked).toEqual([f.previous])
  }, 180_000)

  // Mutations: drop the follow-up check, accept a red follow-up, drop the line or the evidence check, or read the receipt
  // at the released commit; the matching refusal or receiptsAsked assertion goes red.
  it('goes back TO an emergency release only with its green follow-up receipt, named as evidence, and the line', async () => {
    const f = await world(ADDS)
    const before = { head: git(f.stable, 'rev-parse', 'HEAD'), artifacts: f.artifacts(), rows: rows(f) }
    const refusal = (config: object) => returnToThePreviousStable(config, f.options).then(() => null, (error: Error) => error.message)
    const evidence = { recordId: greenFollowUp.id, seq: 1, contentHash: greenFollowUp.contentHash }
    const ready = { ...f.config, evidence, notice: `Synthetic way back notice.\n\n${standing(f)}` }
    previousWentInAsAnEmergency(f, { state: 'missing' })
    expect(await refusal(ready)).toBe(waits('is missing'))
    previousWentInAsAnEmergency(f, { state: 'filed', receipt: { ...greenFollowUp, id: 'synthetic-red-follow-up' }, commit: f.newer, green: false })
    expect(await refusal(ready)).toBe(waits('failed'))
    previousWentInAsAnEmergency(f, { state: 'unknown', because: 'Synthetic: git exited 128.' })
    expect(await refusal(ready)).toBe(`${waits('could not be checked')} The office said: Synthetic: git exited 128.`)
    await unchanged(f, before)
    previousWentInAsAnEmergency(f, { state: 'filed', receipt: greenFollowUp, commit: f.newer, green: true })
    expect(await refusal({ ...ready, notice: 'Synthetic way back notice.' })).toBe(`The way back to the emergency release ${previousTag} needs this line in its notice: "${standing(f)}"`)
    expect(await refusal({ ...ready, evidence: f.config.evidence })).toBe(`The way back to the emergency release ${previousTag} names its follow-up receipt ${greenFollowUp.id}, seq 1, contentHash ${greenFollowUp.contentHash} as its evidence.`)
    await unchanged(f, before)
    const result = remember(await returnToThePreviousStable(ready, f.options))
    expect(result.state, JSON.stringify(result)).toBe('published')
    expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.previous)
    expect(f.receiptsAsked).toEqual([f.newer])
  }, 180_000)
})

describe('what the way back allows the newer version to have changed', () => {
  type Versions = { older?: Array<[string, string[]]>; reviewed?: unknown[]; later?: (repo: string) => void }
  /**
   * Commits of a small repository: the previous version with the migrations `older`, then the newer one
   * after `change`, then, when `later` is given, a third commit the check is not asked about.
   */
  function versions(change: (repo: string) => void, { older = [FIRST], reviewed = [], later }: Versions = {}) {
    const repo = join(folder('way-back-versions-'), 'repo')
    mkdirSync(repo); git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'fixture@example.invalid'); git(repo, 'config', 'user.name', 'Synthetic way back fixture')
    writeMigrations(repo, older); writeSteps(repo, ['a-made-up-step'])
    git(repo, 'add', '.'); git(repo, 'commit', '-m', 'previous'); const previous = git(repo, 'rev-parse', 'HEAD')
    change(repo)
    git(repo, 'add', '-A'); git(repo, 'commit', '--allow-empty', '-m', 'newer'); const newer = git(repo, 'rev-parse', 'HEAD')
    if (later) { later(repo); git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'later') }
    return theWayBackCheck((args: string[]) => git(repo, ...args), previous, newer, reviewed)
  }
  const adding = (migration: [string, string[]]) => (repo: string) => writeMigrations(repo, [FIRST, migration])

  // Mutation: let the last rule pass any statement it does not know, and the refused ones pass.
  it('lets only additions through, statement by statement', () => {
    const allowed = [
      'CREATE TABLE `a` (`id` text PRIMARY KEY NOT NULL)',
      'CREATE TABLE IF NOT EXISTS "b" (id text)',
      'CREATE INDEX `records_value` ON `records` (`value`);',
      'ALTER TABLE `records` ADD `label` text;',
      'ALTER TABLE records ADD COLUMN size integer DEFAULT 0',
      'SELECT 1;',
      '-- only a comment',
      'CREATE UNIQUE INDEX `a_id` ON `a` (`id`)',
      "INSERT OR IGNORE INTO `a` VALUES ('seed')",
    ]
    const refused = [
      'DROP TABLE `old_things`',
      'ALTER TABLE `records` DROP COLUMN `value`',
      'ALTER TABLE `records` RENAME TO `other`',
      'ALTER TABLE `records` RENAME COLUMN `value` TO `body`',
      "UPDATE `records` SET `value` = ''",
      'ALTER TABLE `records` ADD `code` text UNIQUE',
      "INSERT INTO `records` VALUES ('x', 'y')",
      'PRAGMA foreign_keys = OFF',
    ]
    // These a reviewed list may allow, and nothing else.
    const reviewable = [
      'DELETE FROM `records`',
      'CREATE UNIQUE INDEX `records_value` ON `records` (`value`)',
      'CREATE TRIGGER `t` AFTER INSERT ON `records` BEGIN SELECT 1; END',
      'CREATE TRIGGER IF NOT EXISTS `u` AFTER UPDATE OF `value`, `label` ON `records` BEGIN SELECT 1; END',
    ]
    const created = new Set<string>()
    for (const statement of allowed) expect(whatAStatementChanges(statement, created), statement).toBeNull()
    for (const statement of refused) expect(whatAStatementChanges(statement, created), statement).toEqual({ says: expect.any(String), reviewable: false })
    for (const statement of reviewable) expect(whatAStatementChanges(statement, created), statement).toEqual({ says: expect.stringContaining('records'), reviewable: true })
  })

  // Mutation: put back the refusal of every column that may not be empty, and these columns are refused.
  it('lets a column that may not be empty through when its constant default meets its check', () => {
    const allowed = [
      "ALTER TABLE `records` ADD `kind` text NOT NULL DEFAULT 'note'",
      'ALTER TABLE records ADD COLUMN size integer NOT NULL DEFAULT 0',
      'ALTER TABLE `records` ADD COLUMN `done` integer NOT NULL DEFAULT -1;',
      "ALTER TABLE `records` ADD COLUMN `kind` text NOT NULL DEFAULT 'note' CHECK (`kind` IN ('note', 'task'));",
      '-- What the column is for.\nALTER TABLE `records` ADD COLUMN `on` integer NOT NULL DEFAULT 1 CHECK (`on` IN (0, 1))',
    ]
    for (const statement of allowed) expect(whatAStatementChanges(statement, new Set(), FIRST[1]), statement).toBeNull()
    expect(versions(adding(['0001_kinds', [allowed[0]!, 'ALTER TABLE `records` ADD `size` integer NOT NULL DEFAULT 0;']]))).toEqual({ checked: ['0001_kinds'], reviewed: [], unused: [], refusal: null })
    // The table is made earlier in the same migration, so the probe has it only when it is given that statement too.
    expect(versions(adding(['0001_kinds', ['CREATE TABLE `kinds` (`id` text PRIMARY KEY NOT NULL);', 'ALTER TABLE `kinds` ADD `size` integer NOT NULL DEFAULT 0;']]))).toEqual({ checked: ['0001_kinds'], reviewed: [], unused: [], refusal: null })
  })

  // Mutation: let the checks read from the row pass, and a default that fails its check is let through.
  // Mutation: drop the rule that the text gives a default, and a generated column is let through.
  it('refuses a column that may not be empty when a row the previous version writes would be refused', () => {
    const refused = [
      "ALTER TABLE `records` ADD `kind` text NOT NULL DEFAULT 'other' CHECK (`kind` IN ('note', 'task'))",
      'ALTER TABLE `records` ADD `kind` text NOT NULL',
      'ALTER TABLE `records` ADD `kind` text NOT NULL DEFAULT NULL',
      'ALTER TABLE `records` ADD `made` text NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'ALTER TABLE `records` ADD `made` integer NOT NULL DEFAULT (1 + 1)',
      "ALTER TABLE `records` ADD `owner` text NOT NULL DEFAULT 'nobody' REFERENCES `people` (`id`)",
      "ALTER TABLE `records` ADD `kind` text NOT NULL DEFAULT 'note' CHECK (`kind` <> `value`)",
      // The column's type and collation decide these: the stored 1 equals '1', and 'a' equals 'A'.
      "ALTER TABLE `records` ADD `size` integer NOT NULL DEFAULT 1 CHECK (`size` <> '1')",
      "ALTER TABLE `records` ADD `kind` text NOT NULL DEFAULT 'a' COLLATE NOCASE CHECK (`kind` <> 'A')",
      'ALTER TABLE `records` ADD `one` integer GENERATED ALWAYS AS (1) VIRTUAL NOT NULL',
      'ALTER TABLE `records` ADD `one` integer AS (1) NOT NULL',
    ]
    for (const statement of refused) expect(whatAStatementChanges(statement, new Set(), FIRST[1]), statement).toEqual({ says: expect.stringContaining('may not be empty'), reviewable: false })
    expect(versions(adding(['0001_kinds', [refused[0]!]]), { reviewed: [{ migration: '0001_kinds.sql', ...REVIEW }] }).refusal).toContain('No reviewed list can allow that')
  })

  // Mutation: let an earlier statement's error pass, and the way back names no statement it could not run.
  it('stops, and names the statement, when SQLite cannot run a statement before the column', () => {
    const column = 'ALTER TABLE `records` ADD `size` integer NOT NULL DEFAULT 0'
    expect(() => whatAStatementChanges(column, new Set(), [...FIRST[1], 'CREATE TABLE `broken` ('])).toThrow('cannot be built in memory: SQLite refuses "CREATE TABLE broken ("')
    expect(() => versions(adding(['0001_kinds', ['CREATE TABLE `broken` (;', `${column};`]]))).toThrow('cannot be built in memory: SQLite refuses "CREATE TABLE broken ("')
  })

  // Mutation: drop the step comparison, and a new in-place step passes.
  it('reads both versions from Git and names the first change that does more than add', () => {
    expect(versions((repo) => writeMigrations(repo, [FIRST, ADDS]))).toEqual({ checked: [ADDS[0]], reviewed: [], unused: [], refusal: null })
    expect(versions(() => {})).toEqual({ checked: [], reviewed: [], unused: [], refusal: null })
    expect(versions((repo) => writeMigrations(repo, [FIRST, ADDS, DROPS])).refusal).toContain(`The migration ${DROPS[0]} does more than add`)
    expect(versions((repo) => writeMigrations(repo, [[FIRST[0], [...FIRST[1], 'CREATE INDEX `x` ON `records` (`id`);']]])).refusal).toContain(`The migration ${FIRST[0]} differs`)
    expect(versions((repo) => { writeMigrations(repo, [ADDS]); rmSync(join(repo, THE_MIGRATIONS_PATH, `${FIRST[0]}.sql`)) }).refusal).toContain(`no longer has the migration ${FIRST[0]}`)
    expect(versions((repo) => writeSteps(repo, ['a-made-up-step', 'a-newer-step'])).refusal).toContain('a-newer-step')
  })

  // Mutation: allow a migration without its entry, and these migrations pass.
  it('refuses a trigger, a DELETE and a new unique index on an older table when the reviewed list does not name the migration', () => {
    for (const migration of [TRIGGERS, DELETES, UNIQUE]) {
      const refusal = versions(adding(migration), { reviewed: [{ migration: '0002_another.sql', ...REVIEW }] }).refusal
      expect(refusal, migration[0]).toContain(`The migration ${migration[0]} does more than add`)
      expect(refusal, migration[0]).toContain(`reviewedMigrations does not name ${migration[0]}.sql`)
    }
  })

  // Mutation: never find the entry for a migration, and the listed migrations are refused.
  it('allows a trigger, a DELETE and a new unique index on an older table when the reviewed list names the migration', () => {
    for (const migration of [TRIGGERS, DELETES, UNIQUE]) {
      const entry = { migration: `${migration[0]}.sql`, ...REVIEW }
      expect(versions(adding(migration), { reviewed: [entry, { migration: '0002_another.sql', ...REVIEW }] }), migration[0]).toEqual({
        checked: [], reviewed: [{ ...entry, changes: [expect.any(String)] }], unused: ['0002_another.sql'], refusal: null,
      })
    }
  })

  // Mutation: let a reviewed list allow every change, and a dropped table passes when it is listed.
  it('refuses any other change that does more than add, even when the reviewed list names its migration', () => {
    const refusal = versions(adding(DROPS), { reviewed: [{ migration: `${DROPS[0]}.sql`, ...REVIEW }] }).refusal
    expect(refusal).toContain(`The migration ${DROPS[0]} does more than add`)
    expect(refusal).toContain('No reviewed list can allow that')
  })

  // Mutation: take every entry as complete, and an entry without a reason or a reviewer allows its migration.
  it('counts an entry without a reason, a reviewer or a time as missing', () => {
    const { safeBecause, reviewedBy, ...noReason } = { migration: `${TRIGGERS[0]}.sql`, ...REVIEW }
    const lacking: Array<[entry: object, says: string]> = [
      [noReason, 'safeBecause'],
      [{ ...noReason, safeBecause: '  ', reviewedBy }, 'safeBecause'],
      [{ ...noReason, safeBecause }, 'reviewedBy'],
      [{ ...noReason, safeBecause, reviewedBy: '' }, 'reviewedBy'],
      [{ ...noReason, safeBecause, reviewedBy, reviewedAt: undefined }, 'reviewedAt'],
      [{ ...noReason, safeBecause, reviewedBy, reviewedAt: '24 Oct 00:36' }, 'reviewedAt'],
    ]
    for (const [entry, says] of lacking) {
      const refusal = versions(adding(TRIGGERS), { reviewed: [entry] }).refusal
      expect(refusal, JSON.stringify(entry)).toContain('counts as missing')
      expect(refusal, JSON.stringify(entry)).toContain(says)
    }
  })

  // Mutation: read every migration of the newer version, and the trigger the previous version had is refused.
  // Mutation: read the newest commit instead of the newer version, and the later dropping migration is refused.
  it('reads only the migrations added between the two versions', () => {
    expect(versions((repo) => writeMigrations(repo, [FIRST, TRIGGERS, ADDS]), { older: [FIRST, TRIGGERS] })).toEqual({ checked: [ADDS[0]], reviewed: [], unused: [], refusal: null })
    expect(versions(adding(ADDS), { later: (repo) => writeMigrations(repo, [FIRST, ADDS, DROPS]) })).toEqual({ checked: [ADDS[0]], reviewed: [], unused: [], refusal: null })
  })

  // Mutation: change the indentation the step reader expects, and it no longer finds this checkout's steps.
  it("reads this checkout's own in-place steps the way the way back reads a version's", () => {
    expect(theStepNames(readFileSync(join(root, THE_STEPS_FILE), 'utf8'))).toEqual(THE_STEPS.map((step) => step.name))
  })
})

describe('the command line', () => {
  const ENV = { MOLE_OFFICE_API: 'http://fixture.invalid', MOLE_OFFICE_AGENT: 'fixture-agent', MOLE_OFFICE_SESSION: 'fixture-run', MOLE_OFFICE_WORKSPACE: 'default' }

  // Mutation: send --back to the upgrade instead, and neither refusal below is the way back's.
  it('sends --back to the way back, whose configuration names no database, port or version', async () => {
    const made = folder('way-back-cli-')
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL | Request) => { asked.push(new URL(String(url)).pathname); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) })
    const { main } = await import('../tools/stable/upgrade-stable.mjs')
    const file = join(made, 'config.json')
    writeFileSync(file, JSON.stringify({ database: join(made, 'office.sqlite'), health: { timeoutMs: 1000 }, evidence: { recordId: 'fixture-receipt' } }))
    const named = await main(['--back', '--config', file, '--dry'], ENV).then(() => null, (error: Error) => error.message)
    expect(named).toContain('may not name database')
    expect(asked).toEqual([])
    writeFileSync(file, JSON.stringify({ stableCheckout: made, serviceGroups: [], health: { timeoutMs: 1000 }, evidence: { recordId: 'fixture-receipt' } }))
    const reached = await main(['--back', '--config', file, '--dry'], ENV).then(() => null, (error: Error) => error.message)
    expect(reached).toContain('At least one recorded service group is required.')
    expect(asked).toEqual(['/api/records/fixture-receipt/revisions/1'])
    await expect(main(['--back', '--retry-notice', join(made, 'journal')], ENV)).rejects.toThrow('--retry-notice cannot be combined')
  })

  // Mutation: take the reviewed list without reading it, and a list the way back cannot read reaches the office.
  it('refuses a reviewed list it cannot read before any office call, and takes one it can', async () => {
    const made = folder('way-back-cli-')
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL | Request) => { asked.push(new URL(String(url)).pathname); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) })
    const { main } = await import('../tools/stable/upgrade-stable.mjs')
    const file = join(made, 'config.json')
    const config = { stableCheckout: made, serviceGroups: [], health: { timeoutMs: 1000 }, evidence: { recordId: 'fixture-receipt' } }
    const entry = { migration: `${TRIGGERS[0]}.sql`, ...REVIEW }
    const unreadable: Array<[list: unknown, says: string]> = [
      [entry, 'must be a list'],
      [[[entry]], 'must be an object'],
      [[{ ...entry, reviewer: 'someone' }], 'names reviewer'],
      [[{ ...entry, migration: TRIGGERS[0] }], 'name the file'],
      [[{ ...entry, migration: `../${TRIGGERS[0]}.sql` }], 'name the file'],
      [[entry, entry], 'twice'],
    ]
    for (const [list, says] of unreadable) {
      writeFileSync(file, JSON.stringify({ ...config, reviewedMigrations: list }))
      expect(await main(['--back', '--config', file, '--dry'], ENV).then(() => null, (error: Error) => error.message), JSON.stringify(list)).toContain(says)
    }
    expect(asked).toEqual([])
    // An entry without a reason or a reviewer is read here and counts as missing only where its migration needs it.
    writeFileSync(file, JSON.stringify({ ...config, reviewedMigrations: [entry, { migration: '0002_another.sql' }] }))
    expect(await main(['--back', '--config', file, '--dry'], ENV).then(() => null, (error: Error) => error.message)).toContain('At least one recorded service group is required.')
    expect(asked).toEqual(['/api/records/fixture-receipt/revisions/1'])
  })
})

describe('the made-up offices of the way back, after their owner is killed', () => {
  it('ends the made-up server once the supervisor that started it is gone', async () => {
    const f = await world(ADDS)
    const [supervisor, ...started] = f.config.serviceGroups.map((group: any) => group.pgid)
    await theseGroupsEndAfterASigkillOf(-supervisor, started)
  }, 60_000)

  it('ends every group the way back started once the owner of the world is gone', async () => {
    const owner = aStandInOwner(standIns)
    const f = await world(ADDS, null, owner)
    const result = remember(await returnToThePreviousStable(f.config, f.options))
    expect(result.state, JSON.stringify(result)).toBe('published')
    const started = [result.service.pgid, ...result.service.detachedGroups.map((group: any) => group.pgid)]
    expect(started, 'the groups of the way back\'s gate and of the server').toHaveLength(2)
    await theseGroupsEndAfterASigkillOf(owner, started)
  }, 180_000)
})
