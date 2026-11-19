// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** One real bootstrap-to-upgrade chain with Git/npm/SQLite/groups and synthetic authority; path spellings are checked directly. */
import { afterEach, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { localStamp } from '../src/shared/time.ts'
import { versionOf, type RecordContent } from '../src/server/lib/version.ts'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { THE_HOLDER_ENTRY, THE_MIGRATIONS_FOLDER } from '../src/config/settings.mjs'
import { theStableCheckoutFolder } from '../src/config/sandbox-folder.mjs'
import { bootstrapProcessIdentity, rehearsalPortRefusals, theDatabaseOf } from '../tools/stable/stable-bootstrap-support.mjs'
import { currentProcessRecord, observeBootstrapTopology, startGatedBootstrapGroup } from '../tools/stable/stable-bootstrap-processes.mjs'
import { observeUpgradeTopology, upgradeServiceGroups } from '../tools/stable/stable-upgrade-processes.mjs'
import { upgradeStable, validateUpgradeConfig } from '../tools/stable/stable-upgrade-transaction.mjs'
import { aMadeUpNoticeContract, aMadeUpWordCounter } from './made-up-upgrade-words.ts'
import { receiptFromArtifacts } from '../tools/periodic-main-suite.mjs'
import { fakeReleasePolicyFixture } from './stable-release-policy-fixture.ts'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'
import { theFoldersThisFileMakes } from './stable-bootstrap-test-folder.ts'
import { aLineThatEndsWithItsOwner, aLineThatStopsAServerWithItsStarterOrOwner, aStandInOwner, endTheStandIns, theseGroupsEndAfterASigkillOf } from './the-owner-watching-gate.ts'

const root = resolve(import.meta.dirname, '..')
const folders = theFoldersThisFileMakes()
const groups = new Map<number, string>()
const standIns: ChildProcess[] = []
const quiet: any = { append() {}, async step(_: string, action: () => unknown) { return action() } }
const nativeSqlite = createRequire(import.meta.url).resolve('better-sqlite3')
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')
function details(result: any) {
  const logs = result.paths?.work && existsSync(result.paths.work) ? readdirSync(result.paths.work).filter(name => name.endsWith('.log')).map(name => `${name}: ${readFileSync(join(result.paths.work, name), 'utf8').slice(-4000)}`).join('\n') : ''
  return JSON.stringify(result) + '\n' + logs
}
function write(path: string, text: string, mode = 0o600) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text, { mode }) }
function run(cwd: string, program: string, args: string[]) {
  const reply = spawnSync(program, args, { cwd, encoding: 'utf8', timeout: 30000, env: { PATH: process.env.PATH, HOME: cwd, TMPDIR: cwd, LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', npm_config_cache: join(cwd, '.npm-cache'), npm_config_userconfig: '/dev/null', NODE_DISABLE_COMPILE_CACHE: '1' } })
  if (reply.error || reply.status !== 0) throw new Error(`${program}: ${reply.error?.message ?? reply.stderr}`)
  return reply.stdout.trim()
}
const git = (cwd: string, ...args: string[]) => run(cwd, 'git', args)
function track(event: any) {
  if (event.phase !== 'gated') return
  const pgid = event.process?.pgid ?? event.pgid
  if (pgid) {
    const birth = bootstrapProcessIdentity(pgid).startTime
    if (!birth) throw Error('The gated fixture group has no readable birth time.')
    groups.set(pgid, birth)
  }
}
async function port(): Promise<number> {
  const s = createServer()
  await new Promise<void>(ok => s.listen(0, '127.0.0.1', ok))
  const p = (s.address() as { port: number }).port
  await new Promise<void>(ok => s.close(() => ok()))
  return thePortsATestKeepsOff().includes(p) || rehearsalPortRefusals(p, { env: process.env }).length ? port() : p
}
async function object(port: number, path = '/api/runtime') {
  const reply = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(1000) })
  if (!reply.ok) throw new Error(`Synthetic service answered ${reply.status}`)
  return reply.json()
}
async function healthy(port: number) {
  let last: unknown
  for (let n = 0; n < 200; n++) { try { return await object(port) } catch (e) { last = e; await delay(20) } }
  throw last
}

afterEach(async () => {
  await endTheStandIns(standIns)
  for (const [pgid, birth] of [...groups].reverse()) {
    try {
      const current = bootstrapProcessIdentity(pgid)
      if (current.startTime !== birth || current.pgid !== pgid) throw new Error('Recorded fixture group changed identity.')
      process.kill(-pgid, 'SIGTERM')
    } catch (e: any) { if (e.code !== 'ENOENT' && e.code !== 'ESRCH') throw e }
  }
  for (const [pgid, birth] of groups) for (let n = 0; n < 100; n++) {
    try { const p = bootstrapProcessIdentity(pgid); if (p.startTime !== birth || p.state === 'Z' || p.state === 'X') break } catch { break }
    await delay(20)
  }
  groups.clear()
  folders.removeEveryOne()
})

// The upgrade fixture's supervisor shape: a guarded, detached server child. Add the bootstrap's redirect listener.
const supervisor = `import{spawn}from'node:child_process';import http from'node:http';import{theSupervisorsStartupIsDone}from${JSON.stringify(join(root, 'src/config/supervisor-startup-done.mjs'))};
if(!process.argv.includes('--built')||!process.argv.includes('--prepared'))throw Error('Expected built prepared fixture');
const child=spawn(process.execPath,['--import','tsx','src/server/index.ts','--stop-with-pid='+process.pid],{detached:true,stdio:'inherit',env:{...process.env,MOLE_OFFICE_RESTART_REASON:'fixture start'}});
const redirect=http.createServer((q,s)=>{s.statusCode=302;s.end()});redirect.listen(Number(process.env.MOLE_OFFICE_WEB_PORT),'127.0.0.1');
child.on('exit',code=>{redirect.close();process.exit(code??1)});process.on('SIGTERM',()=>{try{process.kill(-child.pid,'SIGTERM')}catch{}redirect.close()});
console.log(theSupervisorsStartupIsDone(process.pid,Number(process.env.MOLE_OFFICE_PORT)));`
/**
 * The made-up server. It stops on TERM, and once its supervisor or `owner` is gone (aLineThatStopsAServerWithItsStarterOrOwner).
 * POST /api/fixture-holder is the press for a terminal holder. It starts THE_HOLDER_ENTRY the way startATerminalHolder
 * does: howToStart('holder') with `--database`, in REPO_ROOT, detached in a group of its own. The real holder's socket
 * path would be too long under this fixture's home, so the entry is a made-up holder (holderSource), and
 * tests/the-upgrade-reads-a-worker-started-through-tsx.test.ts runs the real one through the real start.
 */
const serverSource = (owner: number) => `import http from'node:http';import{readFileSync}from'node:fs';import{execFileSync,spawn}from'node:child_process';import{createRequire}from'node:module';
import{loadEnvFileIntoProcess,ENV_FILE,whyThisCheckoutMayNotOpenTheDatabase,howToStart,REPO_ROOT,databasePathFrom}from'../config/settings.mjs';
loadEnvFileIntoProcess(ENV_FILE);const database=process.env.MOLE_OFFICE_DB,port=Number(process.env.MOLE_OFFICE_PORT),mode=process.env.MOLE_OFFICE_START_MODE??'ordinary';
const refusal=whyThisCheckoutMayNotOpenTheDatabase(database);if(refusal)throw Error(refusal);
const repository=process.cwd(),commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT&&(execFileSync('git',['symbolic-ref','HEAD'],{encoding:'utf8'}).trim()!=='refs/heads/stable'||!execFileSync('git',['tag','--points-at','HEAD'],{encoding:'utf8'}).trim().split('\\n').some(t=>/^stable-\\d{4}-\\d{2}-\\d{2}-/.test(t))))throw Error('Fixture stable tag missing');
const require=createRequire(import.meta.url),Database=require(${JSON.stringify(nativeSqlite)}),db=new Database(database,{readonly:mode==='release-check',fileMustExist:true});
const ready=readFileSync('version.txt','utf8')!=='candidate'||!!db.prepare("SELECT name FROM sqlite_master WHERE name='migrated'").get();
const identity={commit,repository,database,port,mode};
const app=http.createServer((q,s)=>{s.setHeader('content-type','application/json');
if(q.url==='/api/runtime')return s.end(JSON.stringify(mode==='release-check'?{ok:true,identity}:{repository:{path:repository,head:{full:commit}},database:{path:database},addresses:{api:'http://127.0.0.1:'+port},process:{pid:process.pid},supervisor:{pid:process.ppid},worker:{started:false},fixtureVariables:{MOLE_OFFICE_DEVELOPMENT_CHECKOUT:process.env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT,MOLE_OFFICE_DB:database,MOLE_OFFICE_PORT:process.env.MOLE_OFFICE_PORT,HOME:process.env.HOME}}));
if(q.url==='/api/health'){s.statusCode=ready?200:503;return s.end(JSON.stringify(mode==='release-check'?{ok:ready,identity}:{ok:ready,world:{repository,database,port,head:commit.slice(0,7)}}))}
if(q.method==='POST'&&q.url==='/api/fixture-holder'){const how=howToStart('holder'),child=spawn(how.command,[...how.args,'--database',databasePathFrom(process.env)],{cwd:REPO_ROOT,detached:true,stdio:'ignore'});child.unref();return s.end(JSON.stringify({pid:child.pid}))}
s.statusCode=503;s.end(JSON.stringify({code:'RELEASE_CHECK_ONLY'}));});app.listen(port,'127.0.0.1');
const stop=()=>app.close(()=>{db.close();process.exit(0)});process.on('SIGTERM',stop);${aLineThatStopsAServerWithItsStarterOrOwner('stop', owner)}`

/**
 * The made-up terminal holder. It opens no database. It starts one made-up terminal, detached in a group of its own, and
 * writes both pids into `marks`. A SIGTERM to either is written there too. Both end once `owner` is gone.
 */
const holderSource = (owner: number, marks: string) => `import{spawn}from'node:child_process';import{appendFileSync,mkdirSync,renameSync,writeFileSync}from'node:fs';import{join}from'node:path';
const marks=${JSON.stringify(marks)};mkdirSync(marks,{recursive:true});
process.on('SIGTERM',()=>{appendFileSync(join(marks,'signalled'),'holder ');process.exit(0)});
const terminal=spawn(process.execPath,['-e',${JSON.stringify(`${aLineThatEndsWithItsOwner(owner)}process.on('SIGTERM',()=>{require('node:fs').appendFileSync(${JSON.stringify(join(marks, 'signalled'))},'terminal ');process.exit(0)});setInterval(()=>{},1000)`)}],{detached:true,stdio:'ignore'});terminal.unref();
writeFileSync(join(marks,'started.tmp'),JSON.stringify({holder:process.pid,terminal:terminal.pid}));renameSync(join(marks,'started.tmp'),join(marks,'started.json'));
setInterval(()=>{},1000);${aLineThatEndsWithItsOwner(owner)}`

function makeController(folder: string) {
  const controller = join(folder, 'reviewed-controller'); mkdirSync(join(controller, 'tools/stable'), { recursive: true })
  // Unchanged tools. The tracked fixture controller reviews the same fixture launcher blob as development.
  for (const name of ['stable/stable-bootstrap-transaction.mjs', 'stable/stable-bootstrap-execution.mjs', 'stable/stable-bootstrap-launcher.mjs']) copyFileSync(join(root, 'tools', name), join(controller, 'tools', name))
  for (const name of ['database-holders.mjs', 'stable/stable-bootstrap-support.mjs', 'stable/stable-bootstrap-storage.mjs', 'stable/stable-bootstrap-processes.mjs', 'stable/stable-bootstrap-notices.mjs', 'stable/stable-bootstrap-words.mjs', 'stable/stable-upgrade-evidence.mjs', 'read-only-git-config.mjs', 'independent-storage.mjs', 'files-that-restart-the-server.mjs']) symlinkSync(join(root, 'tools', name), join(controller, 'tools', name))
  symlinkSync(join(root, 'src'), join(controller, 'src')); write(join(controller, 'tools/serve-dev.mjs'), supervisor)
  git(controller, 'init', '-b', 'main'); git(controller, 'config', 'user.name', 'Synthetic controller'); git(controller, 'config', 'user.email', 'fixture@example.invalid'); git(controller, 'add', '.'); git(controller, 'commit', '-m', 'Synthetic reviewed launcher')
  return controller
}
function seedSource(dev: string, owner: number) {
  copyBootstrapSettings(dev)
  write(join(dev, '.gitignore'), '.env\n.env.*\nnode_modules/\ndist/\n.npm-cache/\n')
  write(join(dev, 'tools/serve-dev.mjs'), supervisor); write(join(dev, 'src/server/index.ts'), serverSource(owner)); write(join(dev, THE_HOLDER_ENTRY), holderSource(owner, join(dirname(dev), 'holder-marks')))
  write(join(dev, 'version.txt'), 'baseline'); write(join(dev, 'tests/synthetic.test.ts'), '// Synthetic receipt input; never run as a suite.\n')
  write(join(dev, 'package/package.json'), '{"name":"chain-dependency","version":"1.0.0"}'); write(join(dev, 'package/index.js'), 'module.exports=1')
  run(dev, 'tar', ['-czf', 'dependency.tgz', 'package'])
  // Kept source folders are not artifacts and do not point outside this fixture.
  write(join(dev, 'loader/package.json'), '{"name":"tsx","version":"0.0.0","type":"module","exports":"./loader.mjs"}'); write(join(dev, 'loader/loader.mjs'), "process.env.TMPDIR=process.env.HOME; // Keep the fixture's cache beside its own home.\n")
  run(dev, 'tar', ['-czf', 'loader.tgz', 'loader'])
  write(join(dev, 'package.json'), JSON.stringify({ name: 'synthetic-second-handoff', version: '1.0.0', type: 'module', scripts: { typecheck: 'node typecheck.mjs', build: 'node build.mjs', 'db:migrate': 'node migrate.mjs' }, dependencies: { 'chain-dependency': 'file:dependency.tgz', tsx: 'file:loader.tgz' } }))
  write(join(dev, 'typecheck.mjs'), "import{mkdirSync,writeFileSync}from'node:fs';mkdirSync('dist',{recursive:true});writeFileSync('dist/checked','fixture');")
  write(join(dev, 'build.mjs'), "import{mkdirSync,writeFileSync,readFileSync}from'node:fs';mkdirSync('dist/web',{recursive:true});writeFileSync('dist/web/index.html',readFileSync('version.txt'));")
  write(join(dev, 'tools/build-the-page.mjs'), "import{execFileSync}from'node:child_process';import{writeFileSync}from'node:fs';export async function buildThePage(){await import('../build.mjs');writeFileSync('dist/web/build-stamp.json',JSON.stringify({builtAt:'2026-10-19 00:00:00',builtAtMs:1,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}));return{ok:true}}")
  write(join(dev, 'migrate.mjs'), "// No baseline migration.\n")
  // A forward upgrade counts the candidate's untranslated words and asks its notice contract (item 15 (d)).
  write(join(dev, 'tools/stable/untranslated-words.mjs'), aMadeUpWordCounter(dirname(dev))); write(join(dev, 'src/shared/stable-upgrade-notices.ts'), aMadeUpNoticeContract(dirname(dev)))
  run(dev, 'npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'])
}
function receipt(folder: string, dev: string, commit: string, add: (id: string, kind: RecordContent['kind'], data: any) => any, id: string) {
  const attempt = join(folder, id), clone = join(attempt, 'clone'); mkdirSync(attempt)
  git(attempt, 'clone', '--no-local', '--no-hardlinks', '--no-tags', '--', dev, clone); git(clone, 'checkout', '--detach', commit)
  const paths = { log: join(attempt, 'suite.log'), report: join(attempt, 'report.json'), manifest: join(attempt, 'manifest.json'), reads: join(attempt, 'reads') }
  mkdirSync(paths.reads); write(join(paths.reads, 'synthetic.json'), '{"synthetic":true}'); write(paths.log, 'Synthetic receipt, no cloud suite executed.\n')
  const name = join(clone, 'tests/synthetic.test.ts')
  write(paths.manifest, JSON.stringify([{ file: name }]))
  write(paths.report, JSON.stringify({ success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, numTotalTestSuites: 1, numPassedTestSuites: 1, numFailedTestSuites: 0, numPendingTestSuites: 0, testResults: [{ name, status: 'passed', assertionResults: [{ fullName: 'Synthetic not-executed cloud assertion', status: 'passed' }] }] }))
  const result = { code: 0, answer: { ran: true, code: 0, commit, phase: 'test', buildExitCode: 0, suiteExitCode: 0, wallSec: 1, workers: 1, files: 1, failed: [] }, output: join(attempt, 'door-output.log') }
  write(join(attempt, 'door-result.json'), JSON.stringify(result)); write(result.output, JSON.stringify(result.answer)+'\n')
  const data = receiptFromArtifacts({ repository: dev, commit, tree: git(dev, 'rev-parse', `${commit}^{tree}`), clone, paths, result, startedAt: '2026-10-19 00:00:00', endedAt: '2026-10-19 00:00:01' })
  const pin = add(id, 'whole_suite_receipt', data)
  return { recordId: pin.id, seq: 1, contentHash: pin.contentHash }
}
/** The offices of this fixture end once `owner` is gone: this test worker, or a stand-in for it. */
async function fixture(shape: 'absolute' | 'relative', owner = process.pid) {
  const folder = folders.make('second-handoff'), dev = join(folder, 'development'), home = join(folder, 'home'), data = join(folder, 'data'), recovery = join(folder, 'bootstrap-recovery'), upgradeRecovery = join(folder, 'upgrade-recovery'), remote = join(folder, 'made-up-origin.git')
  for (const path of [dev, home, data, recovery, upgradeRecovery, join(home, '.cache/mole-office')]) mkdirSync(path, { recursive: true, mode: 0o700 })
  const stable = theStableCheckoutFolder(home), database = join(data, 'example.db'), servicePort = await port(), redirect = await port(), checkPort = await port()
  git(folder, 'init', '--bare', remote); git(dev, 'init', '-b', 'main'); git(dev, 'config', 'user.name', 'Synthetic second handoff'); git(dev, 'config', 'user.email', 'fixture@example.invalid'); seedSource(dev, owner); git(dev, 'add', '.'); git(dev, 'commit', '-m', 'Synthetic bootstrap target'); git(dev, 'remote', 'add', 'origin', remote); git(dev, 'push', 'origin', 'main')
  const commit = git(dev, 'rev-parse', 'HEAD'), day = localStamp(new Date()).slice(0, 10), first = `stable-${day}-chain-first`, second = `stable-${day}-chain-second`
  const envFile = join(dev, '.env'), dbLine = shape === 'absolute' ? database : relative(dev, database)
  write(envFile, `# Synthetic ${shape} database path.\nMOLE_OFFICE_DB=${dbLine}\n`, 0o640)
  const db = new Database(database); db.exec("CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); INSERT INTO records VALUES('synthetic','baseline'); CREATE TABLE held_keys(id TEXT,key_hash TEXT);"); db.close(); write(join(data, 'keys.json'), '{"synthetic":"metadata only"}')
  run(dev, 'npm', ['ci', '--include=dev', '--no-audit', '--no-fund']); run(dev, 'npm', ['run', 'typecheck']); run(dev, process.execPath, ['--input-type=module', '--eval', "const{buildThePage}=await import('./tools/build-the-page.mjs');await buildThePage()"])
  const records = new Map<string, any>(), notices = new Map<string, any>()
  // The office's registry row, whose id the notice tools compare each notice's sender with.
  records.set('/api/participants/agent/mole-office', { participant: { id: 'mole-office', handle: 'mole-office', retired: false } })
  const add = (id: string, kind: RecordContent['kind'], data: any, title = 'Synthetic fixture record') => {
    const content = { kind, title, summary: null, data, deletedAt: null }, contentHash = versionOf(content)
    records.set(`/api/records/${id}`, { record: { id, origin: 'authored', ...content } })
    records.set(`/api/records/${id}/revisions/1`, { recordId: id, seq: 1, op: 'create', content, contentHash, who: { actorType: 'agent', actorId: 'fixture-writer', sessionId: 'fixture-run' }, provedBy: 'an-agent-key' })
    return { id, seq: 1, contentHash }
  }
  let policy: ReturnType<typeof fakeReleasePolicyFixture> | undefined
  const officeRequest = Object.assign(async (request: any, destination?: any) => {
    const answer = (body: any, status = 200) => ({ status, body: JSON.stringify(body), cut: false, location: null })
    if (request.path.startsWith('/api/office/bootstrap-stop-authority?')) {
      const q = JSON.parse(new URL('http://fixture'+request.path).searchParams.get('request')!)
      const caller = { agent: 'fixture-writer', run: 'fixture-run' }
      return answer({ ...q, state: q.expectedBefore ? 'reserved' : 'available', preparedAt: localStamp(new Date()), warrantWhen: localStamp(new Date()), reservation: q.expectedBefore ?? null, outcome: null, caller, initiator: q.expectedBefore ? caller : null })
    }
    if (request.method === 'POST' && request.path === '/api/records') {
      const pin = add('fixture-prepared', request.body.kind, request.body.data, request.body.title)
      return answer({ record: { id: pin.id, kind: request.body.kind, origin: 'authored', deletedAt: null } }, 201)
    }
    if (request.path === '/api/office/upgrades/notice') {
      const q = request.body, event = { version: q.kind === 'first-handoff' ? 2 : 1, project: 'fixture-project', date: localStamp(new Date()), request: q }
      const content: RecordContent = { kind: 'message', title: 'Synthetic notice', summary: null, data: { body: q.stage === 'before' ? (q.announcement.notices?.before.text ?? q.announcement.notice) : 'Synthetic outcome', sentBy: { kind: 'agent', id: 'mole-office' }, to: [{ kind: 'person', id: 'fixture-person' }], extra: { stableUpgradeNotice: event } }, deletedAt: null }
      const reply = { original: { id: 'fixture-'+q.sendId, seq: 1, contentHash: versionOf(content) }, content, event, replayed: false }
      notices.set(q.sendId, reply); return answer(reply, 201)
    }
    if (request.path.startsWith('/api/office/upgrades?') && request.path.includes('sendId=')) return answer({ notice: notices.get(new URL('http://fixture'+request.path).searchParams.get('sendId')!) ?? null })
    if (records.has(request.path)) return answer(records.get(request.path))
    if (!destination && policy) return policy.officeRequest(request)
    if (!destination) throw Error('Unknown synthetic request: '+request.path)
    const response = await fetch(destination.api+request.path, { signal: AbortSignal.timeout(1000) })
    return { status: response.status, body: await response.text(), cut: false, location: response.headers.get('location') }
  }, { identity: { agent: 'fixture-writer', session: 'fixture-run', project: 'fixture-project' } })
  const settings = { TZ: 'Etc/UTC', MOLE_OFFICE_MESSAGE_WORKER: 'off', MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none', MOLE_OFFICE_WORKSPACE: 'fixture-project', MOLE_OFFICE_API: `http://127.0.0.1:${servicePort}`, MOLE_OFFICE_WEB: `http://127.0.0.1:${redirect}`, MOLE_OFFICE_WEB_PORT: String(redirect) }
  const original = await startGatedBootstrapGroup({ name: 'fixture-original', cwd: dev, command: process.execPath, args: ['tools/serve-dev.mjs', '--built', '--prepared'], env: { PATH: process.env.PATH, HOME: home, ...settings, [THE_TEST_MARK]: process.env[THE_TEST_MARK], MOLE_OFFICE_DB: database, MOLE_OFFICE_PORT: String(servicePort), MOLE_OFFICE_START_MODE: 'ordinary' }, log: join(folder, 'original.log'), journal: quiet, owned: [], onStep: track })
  const runtime = await healthy(servicePort), topology = observeBootstrapTopology(runtime, original.gate, dev, quiet)
  for (const row of Object.values(topology).filter(Boolean) as any[]) groups.set(row.pgid, row.groupLeader.startTime)
  const evidence = receipt(folder, dev, commit, add, 'fixture-first-receipt'), pin = { id: 'fixture-words', seq: 1, contentHash: 'a'.repeat(16) }
  const config: any = { version: 1, mode: 'rehearsal', developmentRepository: dev, stableCheckout: stable, database, targetCommit: commit, targetTree: git(dev, 'rev-parse', 'HEAD^{tree}'), candidateTag: first, recoveryRoot: recovery, serviceHome: home, serviceSettings: settings, topology, servicePort, releaseCheckPort: checkPort, listeners: [{ address: '127.0.0.1', port: servicePort, role: 'api' }, { address: '127.0.0.1', port: redirect, role: 'redirect' }], evidence, notices: { before: { text: 'Synthetic first handoff.', approval: pin }, after: { text: 'Synthetic handoff completed.', approval: pin } }, noticeSendIds: { before: 'fixture-first-before', after: 'fixture-first-after' }, stopAuthority: null, health: { attempts: 100, intervalMs: 20, timeoutMs: 1000, stopTimeoutMs: 3000, commandTimeoutMs: 30000 } }
  const dirty = git(dev, 'status', '--porcelain=v1', '--untracked-files=all')
  if (dirty) throw Error('Synthetic source setup became dirty: '+dirty)
  const controller = makeController(folder)
  const { bootstrapStable } = await import(/* @vite-ignore */ pathToFileURL(join(controller, 'tools/stable/stable-bootstrap-transaction.mjs')).href)
  return { folder, dev, stable, database, home, envFile, config, first, second, upgradeRecovery, officeRequest, add, bootstrapStable, setPolicy: (p: ReturnType<typeof fakeReleasePolicyFixture>) => { policy = p } }
}

/**
 * Press the published office's holder button, as the person does, and wait for the made-up holder to name itself and its
 * terminal. Their groups are recorded at once, so the test stops them.
 */
async function aHolderPressedFor(f: Awaited<ReturnType<typeof fixture>>, running: any) {
  const reply = await fetch(`http://127.0.0.1:${running.fixtureVariables.MOLE_OFFICE_PORT}/api/fixture-holder`, { method: 'POST', signal: AbortSignal.timeout(5000) })
  expect(reply.status).toBe(200)
  const { pid } = await reply.json()
  const marks = join(f.folder, 'holder-marks'), named = join(marks, 'started.json')
  for (let n = 0; n < 500 && !existsSync(named); n++) await delay(20)
  const started = JSON.parse(readFileSync(named, 'utf8'))
  expect(started.holder).toBe(pid)
  const holder = currentProcessRecord(started.holder), terminal = currentProcessRecord(started.terminal)
  for (const row of [holder, terminal] as any[]) groups.set(row.pgid, row.groupLeader.startTime)
  expect(holder.ppid).toBe(running.process.pid); expect(holder.pgid).toBe(holder.pid)
  expect(terminal.ppid).toBe(holder.pid); expect(terminal.pgid).toBe(terminal.pid)
  return { holder, terminal, marks }
}
const startTimeNow = (pid: number) => { try { return bootstrapProcessIdentity(pid).startTime } catch { return null } }

/**
 * The whole chain, from a fixture with a relative development database line whose offices end once `owner` is gone.
 * With `holder`, the person presses for a terminal holder before the upgrade, and the upgrade must leave it running.
 */
async function aSecondHandoff(owner = process.pid, holder = false) {
  const f = await fixture('relative', owner)
  const prepared = await f.bootstrapStable(f.config, { phase: 'prepare', officeRequest: f.officeRequest, onStep: track })
  expect(prepared.state, details(prepared)).toBe('PREPARED')
  const handoff = await f.bootstrapStable({ ...f.config, prepared: prepared.prepared, stopAuthority: { kind: 'owner-decision', decision: { id: 'fixture-owner-stop', seq: 1, contentHash: 'b'.repeat(16) } } }, { phase: 'handoff', officeRequest: f.officeRequest, onStep: track })
  expect(handoff.state, details(handoff)).toBe('published')
  const journalRows = readFileSync(handoff.paths.journal, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  const guards = journalRows.filter(row => row.step === 'exclusive-lock-guard' && row.phase === 'taken')
  expect(guards, 'one guard after the stop and one inside the pairing').toHaveLength(2)
  const backup = journalRows.findIndex(row => row.step === 'verified-sanitized-backup' && row.phase === 'attempt')
  const pairing = journalRows.findIndex(row => row.step === 'pair-development-with-stable' && row.phase === 'attempt')
  expect(journalRows.indexOf(guards[0])).toBeLessThan(backup)
  expect(journalRows.indexOf(guards[1])).toBeGreaterThan(pairing)
  expect(guards.every(row => typeof row.before.sha256 === 'string' && typeof row.after.sha256 === 'string')).toBe(true)
  expect(journalRows.filter(row => row.step === 'database-holder-check' && row.phase === 'set-aside')).toHaveLength(2)
  for (const row of Object.values(handoff.service).filter(Boolean) as any[]) groups.set(row.pgid, row.groupLeader.startTime)
  expect(lstatSync(join(f.stable, '.git')).isDirectory()).toBe(true); expect(existsSync(join(f.stable, '.git/objects/info/alternates'))).toBe(false)
  expect(git(f.stable, 'symbolic-ref', 'HEAD')).toBe('refs/heads/stable'); expect(git(f.stable, 'rev-parse', `refs/tags/${f.first}^{commit}`)).toBe(f.config.targetCommit)
  expect(git(f.dev, 'tag', '--list', f.first)).toBe(''); expect(git(f.stable, 'remote', 'get-url', 'origin')).toBe(git(f.dev, 'remote', 'get-url', 'origin'))
  expect(existsSync(join(f.stable, '.env'))).toBe(false); expect(readFileSync(f.envFile, 'utf8')).toContain(`MOLE_OFFICE_STABLE_CHECKOUT=${f.stable}`)
  const pairedHash = hash(f.envFile), running = await object(f.config.servicePort)
  expect(running.fixtureVariables).toEqual({ MOLE_OFFICE_DEVELOPMENT_CHECKOUT: f.dev, MOLE_OFFICE_DB: f.database, MOLE_OFFICE_PORT: String(f.config.servicePort), HOME: f.home })
  expect(currentProcessRecord(running.supervisor.pid).argv).toContain('tools/serve-dev.mjs')
  const held = holder ? await aHolderPressedFor(f, running) : null
  const observed = observeUpgradeTopology(running, { pgid: handoff.service.supervisor.pgid, startTime: handoff.service.supervisor.groupLeader.startTime }, { ...f.config, stableCheckout: f.stable })
  const serviceGroups = upgradeServiceGroups(observed, f.config)
  if (held) expect(serviceGroups.map(group => group.pgid)).not.toContain(held.holder.pgid)
  write(join(f.dev, 'version.txt'), 'candidate')
  write(join(f.dev, 'migrate.mjs'), `import{createRequire}from'node:module';const Database=createRequire(import.meta.url)(${JSON.stringify(nativeSqlite)});const db=new Database(process.env.MOLE_OFFICE_DB,{fileMustExist:true});db.exec(${JSON.stringify("CREATE TABLE migrated(value TEXT); INSERT INTO migrated VALUES('synthetic migration')")});db.close();`)
  const migration = join(relative(root, THE_MIGRATIONS_FOLDER), '0001_second_handoff.sql')
  write(join(f.dev, migration), '-- The made-up migration of the second handoff.\n')
  git(f.dev, 'add', 'version.txt', 'migrate.mjs', migration); git(f.dev, 'commit', '-m', 'Synthetic migration for second handoff'); git(f.dev, 'push', 'origin', 'main')
  const target = git(f.dev, 'rev-parse', 'HEAD'), evidence = receipt(f.folder, f.dev, target, f.add, 'fixture-second-receipt')
  const config: any = { developmentRepository: f.dev, stableCheckout: f.stable, database: running.database.path, targetCommit: target, previousBaselineTag: f.first, candidateTag: f.second, evidence, serviceGroups, serviceHome: running.fixtureVariables.HOME, serviceSettings: f.config.serviceSettings, recoveryRoot: f.upgradeRecovery, servicePort: Number(running.fixtureVariables.MOLE_OFFICE_PORT), releaseCheckPort: f.config.releaseCheckPort, notice: 'Synthetic second handoff outside use.', noticeApproval: { id: 'fixture-policy', seq: 1, contentHash: 'c'.repeat(16) }, noticeSendIds: { before: 'fixture-second-before', after: 'fixture-second-after' }, health: f.config.health }
  const policy = fakeReleasePolicyFixture({ config, baseline: f.config.targetCommit, tree: git(f.dev, 'rev-parse', 'HEAD^{tree}') })
  const stamp = new Date(Math.floor(Date.now()/1000)*1000).toISOString()
  const source = policy.revise('fixture-bootstrap', 1, r => { r.content.data.extra.stableReleaseBaseline.establishedAt = stamp })
  policy.reviseAuthorization({ mode: 'outside-use', reason: 'Synthetic immediate fixture release outside use.', baselineSource: { kind: 'bootstrap', note: source } }); f.setPolicy(policy)
  // The actual upgrade must refuse shared storage even after a successful first handoff.
  const alternates = join(f.stable, '.git/objects/info/alternates')
  write(alternates, join(f.dev, '.git/objects') + '\n')
  try { expect(() => validateUpgradeConfig(config)).toThrow('Shared Git object alternates are refused.') }
  finally { unlinkSync(alternates) }
  const upgraded = await upgradeStable(config, { officeRequest: f.officeRequest, onStep: track })
  expect(upgraded.state, details(upgraded)).toBe('published')
  for (const row of upgraded.service.serviceGroups) groups.set(row.pgid, row.startTime)
  if (held) {
    for (const row of [held.holder, held.terminal]) expect(startTimeNow(row.pid), `process ${row.pid} still runs as it was started`).toBe(row.startTime)
    expect(existsSync(join(held.marks, 'signalled')), 'the holder and its terminal received no SIGTERM').toBe(false)
  }
  const final = await object(config.servicePort)
  expect(final.repository.head.full).toBe(target); expect(currentProcessRecord(final.supervisor.pid).argv).toContain('tools/serve-dev.mjs')
  expect(final.fixtureVariables).toEqual(running.fixtureVariables)
  expect(git(f.stable, 'symbolic-ref', 'HEAD')).toBe('refs/heads/stable'); expect(git(f.stable, 'rev-parse', `refs/tags/${f.second}^{commit}`)).toBe(target)
  const db = new Database(f.database, { readonly: true, fileMustExist: true })
  try {
    expect(db.prepare('SELECT value FROM migrated').all()).toEqual([{ value: 'synthetic migration' }])
    expect(db.prepare("SELECT value FROM records WHERE id='synthetic'").all()).toEqual([{ value: 'baseline' }])
  } finally { db.close() }
  expect(hash(f.envFile)).toBe(pairedHash)
  return { upgraded, held }
}

it('takes a second handoff with a relative development database line', async () => {
  await aSecondHandoff()
}, 180000)

it("leaves the office's terminal holder and its terminal running across the second handoff", async () => {
  await aSecondHandoff(process.pid, true)
}, 180000)

it('ends every group the second handoff started once the owner of the fixture is gone', async () => {
  const owner = aStandInOwner(standIns)
  const { upgraded, held } = await aSecondHandoff(owner, true)
  const started = upgraded.service.serviceGroups.map((group: any) => group.pgid)
  expect(started, 'the groups of the upgrade\'s gate and of the server').toHaveLength(2)
  await theseGroupsEndAfterASigkillOf(owner, [...started, held!.holder.pgid, held!.terminal.pgid])
}, 180000)

it.each(['absolute', 'relative'] as const)('reads a %s development database line without another handoff', shape => {
  const folder = folders.make('database-line'), development = join(folder, 'development'), database = join(folder, 'data', 'example.db')
  mkdirSync(development, { recursive: true }); mkdirSync(dirname(database), { recursive: true })
  const value = shape === 'absolute' ? database : relative(development, database)
  write(join(development, '.env'), `MOLE_OFFICE_DB=${value}\n`)
  expect(theDatabaseOf({ variables: {} }, development)).toBe(database)
  expect(theDatabaseOf({ variables: { MOLE_OFFICE_DB: database } }, development)).toBe(database)
})
