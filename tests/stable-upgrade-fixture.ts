// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Shared wholly synthetic Git/npm/SQLite/service fixture for the real upgrade transaction. */
import { afterAll, afterEach, expect } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { chmodSync, closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'
import Database from 'better-sqlite3'
import { localStamp, theClockZone } from '../src/shared/time.ts'
import { artifactIdentity, processIdentity } from '../tools/stable/stable-upgrade-transaction.mjs'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'
import { aMadeUpNoticeContract, aMadeUpWordCounter } from './made-up-upgrade-words.ts'
import { START_MODES, THE_HOLDER_ENTRY, THE_MIGRATIONS_FOLDER } from '../src/config/settings.mjs'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { aLineThatEndsWithItsOwner, aLineThatStopsAServerWithItsStarterOrOwner, aStandInOwner, commandThatWatchesItsOwnerFromInside, commandUnderTheOwnerWatchingGate, endTheStandIns } from './the-owner-watching-gate.ts'

const root = resolve(import.meta.dirname, '..')
const fixtureTimeZone = theClockZone()
const require = createRequire(import.meta.url)
const databaseModule = require.resolve('better-sqlite3')
const baselineTag = 'stable-2026-10-01-baseline'
const candidateTag = `stable-${localStamp(new Date()).slice(0, 10)}-fixture`
const out = process.env.STABLE_UPGRADE_TEST_OUTPUT ?? tmpdir()
const groups = new Set<number>()
const children: ChildProcess[] = []
const folders: string[] = []
const standIns: ChildProcess[] = []
/**
 * THE MIGRATIONS OF THE MADE-UP REPOSITORIES, in the folder the product reads them from. The baseline has one, so a
 * target can add, change or delete a migration. The target of case 2 adds the second, and the made-up server reads
 * it as pending until the migration has run (see serverSource). The target of case 1 leaves the folder as it is.
 */
const THE_BASELINES_MIGRATION = join(relative(root, THE_MIGRATIONS_FOLDER), '0000_synthetic_baseline.sql')
const THE_TARGETS_MIGRATION = join(relative(root, THE_MIGRATIONS_FOLDER), '0001_synthetic_candidate.sql')
/**
 * THE MADE-UP OFFICE'S HEALTH BOUNDS in the configuration, here so a test can work out from them how long a start may
 * take before the bounds give up on it.
 */
const THE_FIXTURE_HEALTH = { attempts: 80, intervalMs: 10, timeoutMs: 1000, stopTimeoutMs: 2000, commandTimeoutMs: 15000 }
/** The file in the fixture's folder where the made-up office writes one line for each start (see serverSource). */
const THE_STARTS = 'starts.jsonl'
/**
 * THE SLOW START: a target commit with this file holds the milliseconds its made-up office waits before it listens. It
 * waits with Atomics.wait, which sleeps and burns no processor. The release builds the office's command line and passes
 * it no NODE_OPTIONS, so a module preloaded with --import cannot be put in; the made-up office reads the file itself.
 */
const THE_SLOW_START = '.slow-start'
/**
 * THE MADE-UP SUPERVISOR'S STARTUP. The made-up serve-dev prints the line the real one prints once its startup is done,
 * and prints it at once. A target commit with this file changes that at every ordinary start of the target. With
 * 'held <ms>' the made-up serve-dev prints the line that long after its office first answers healthy. With 'ends <ms>'
 * it prints no line: that long after its office first answers, it stops the office and ends with 1, as a real serve-dev
 * does whose startup ends after its server answered.
 */
const THE_STARTUP = '.supervisor-startup'
type Startup = 'done' | { heldMs: number } | { endsAfterMs: number }

/** The product's settings, which copyBootstrapSettings copies into the made-up repositories at this path. */
const THE_SETTINGS = 'src/config/settings.mjs'
const THE_LIVE_MODE = 'release-check-live'
type LiveMode = 'taken' | 'refused'
/**
 * A TARGET WHOSE SETTINGS REFUSE release-check-live, as a version from before that mode does. The target's copy of the
 * product's START_MODES, the list readSetting checks and builds its refusal from, is declared without the mode, from the
 * product's own list. So the copy refuses the mode with the product's own sentence, which no longer names the mode, as a
 * version from before that mode did. The release reads only the opening of the refusal. The fixture fails, saying what
 * it looked for, when the copy has not exactly one line declaring the list or the product's list has no such mode, and
 * again when the edited settings still take the mode.
 */
function theTargetsSettingsRefuseTheLiveMode(dev: string) {
  const settings = join(dev, THE_SETTINGS), text = readFileSync(settings, 'utf8')
  const declaration = 'export const START_MODES ='
  const lines = text.split('\n').filter((line) => line.startsWith(declaration))
  if (lines.length !== 1) throw new Error(`The made-up target's settings were to refuse ${THE_LIVE_MODE}, and ${THE_SETTINGS} has ${String(lines.length)} lines, not one, that begin ${JSON.stringify(declaration)}.`)
  if (!START_MODES.includes(THE_LIVE_MODE)) throw new Error(`The made-up target's settings were to refuse ${THE_LIVE_MODE}, and the product's START_MODES holds ${START_MODES.join(', ')}, which does not include it.`)
  const kept = START_MODES.filter((mode) => mode !== THE_LIVE_MODE)
  write(settings, text.replace(lines[0]!, `${declaration} Object.freeze(${JSON.stringify(kept)})`))
  const asked = spawnSync(process.execPath, ['--input-type=module', '--eval', `import{readSetting}from'./${THE_SETTINGS}';readSetting('MOLE_OFFICE_START_MODE',{MOLE_OFFICE_START_MODE:'ordinary'});try{readSetting('MOLE_OFFICE_START_MODE',{MOLE_OFFICE_START_MODE:${JSON.stringify(THE_LIVE_MODE)}})}catch{process.exit(3)}`], { cwd: dev, encoding: 'utf8', timeout: 30_000, env: { PATH: process.env.PATH, HOME: dev, LANG: 'C' } })
  if (asked.status !== 3) throw new Error(`The made-up target's edited settings were asked for ${THE_LIVE_MODE} and did not refuse it alone: exit ${String(asked.status)}, ${asked.error?.message ?? asked.stderr}`)
}

function run(cwd: string, program: string, args: string[]) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', timeout: 30_000, env: { PATH: process.env.PATH, HOME: cwd, LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', npm_config_cache: join(cwd, '.npm-cache') } })
  if (result.status !== 0 || result.error) throw new Error(`${program} ${args.join(' ')}: ${result.error?.message ?? result.stderr}`)
  return result.stdout.trim()
}
function git(cwd: string, ...args: string[]) { return run(cwd, 'git', args) }
function write(path: string, contents: string) { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path, contents) }
function portIsFree(chosen: number): Promise<boolean> {
  return new Promise((done) => {
    const probe = createServer()
    probe.on('error', () => done(false))
    probe.listen(chosen, '127.0.0.1', () => probe.close(() => done(true)))
  })
}
/** The lowest port of the machine's ephemeral range, from which Linux picks a port for a listen on port 0. */
const THE_EPHEMERAL_RANGE_STARTS = Number(readFileSync('/proc/sys/net/ipv4/ip_local_port_range', 'utf8').trim().split(/\s+/)[0])
/**
 * The fixture's band, the lower half of the ports below the ephemeral range, and up to 200 of its ports in a random
 * order, never a port the live-office guard refuses. Linux hands a port of the ephemeral range to every other listen on
 * port 0 and every outgoing connection; a port below it is taken only by a program that names it.
 */
function theBand(exclude: number[]) {
  if (!Number.isInteger(THE_EPHEMERAL_RANGE_STARTS) || THE_EPHEMERAL_RANGE_STARTS <= 2048) throw new Error('The ephemeral range could not be read, so the fixture cannot pick a port below it.')
  const lowest = Math.floor(THE_EPHEMERAL_RANGE_STARTS / 2), highest = THE_EPHEMERAL_RANGE_STARTS - 1
  const guarded = new Set([...thePortsATestKeepsOff(), ...exclude])
  const ports = new Set<number>()
  for (let tries = 0; tries < 200; tries++) {
    const chosen = lowest + Math.floor(Math.random() * (highest + 1 - lowest))
    if (!guarded.has(chosen)) ports.add(chosen)
  }
  return { lowest, highest, ports: [...ports] }
}
/** A free port of the fixture's band. It is let go at once, so use it only where nothing must bind it later. */
async function port(exclude: number[] = []): Promise<number> {
  const band = theBand(exclude)
  for (const chosen of band.ports) if (await portIsFree(chosen)) return chosen
  throw new Error(`No free port was found below the ephemeral range, from ${String(band.lowest)} to ${String(band.highest)}.`)
}
/**
 * A program that binds the first port of its arguments it can on 127.0.0.1, prints it, and holds it until its standard
 * input ends; it prints "none" when it could bind none. It binds without SO_REUSEPORT, so every other bind of the port is
 * refused, and sets SO_REUSEPORT once it has bound, so a listen with reusePort is let in. It never listens, so `ss -ltn`
 * and the upgrade's own port checks do not see it.
 */
const THE_HOLDER = `import socket,sys
for port in map(int,sys.argv[1:]):
    s=socket.socket()
    try:
        s.bind(('127.0.0.1',port))
    except OSError:
        s.close()
        continue
    s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEPORT,1)
    print(port,flush=True)
    sys.stdin.read()
    sys.exit(0)
print('none',flush=True)
sys.exit(1)`
/**
 * A port of the fixture's band, held until the test ends. A port picked, checked and let go could be taken by another
 * program before the upgrade bound it, and the upgrade then refused with "Port <port> is still occupied", or checked
 * that program instead of its own new version. Here only a listen with reusePort, as the made-up office's, can take it.
 */
async function heldPort(exclude: number[] = []): Promise<number> {
  const band = theBand(exclude)
  const holder = spawn('python3', ['-c', THE_HOLDER, ...band.ports.map(String)], { detached: true, stdio: ['pipe', 'pipe', 'inherit'] })
  if (!holder.pid) throw new Error('The program that holds the fixture\'s port did not start.')
  groups.add(holder.pid); children.push(holder)
  const said = await new Promise<string>((done) => {
    let text = ''
    holder.stdout!.on('data', (chunk: Buffer) => { text += String(chunk); if (text.includes('\n')) done(text.split('\n')[0]!) })
    holder.once('close', (code, signal) => done(`an end with ${String(signal ?? code)} before it held a port`))
  })
  if (/^\d+$/.test(said)) return Number(said)
  throw new Error(`No port of the ${String(band.ports.length)} tried from ${String(band.lowest)} to ${String(band.highest)} could be held: the holder said ${said}.`)
}
/**
 * What a made-up office does when its listen is refused: it says so, naming the port held in the variable `port`, and
 * ends, so a test whose office could not listen says why instead of waiting for its health. It listens with reusePort,
 * the only listen a port the fixture holds lets in.
 */
const aRefusedListenEnds = (port: string) => `error=>{console.error('The made-up office could not listen on port '+${port}+': '+error.code+'.');process.exit(1)}`
/** The product's own mark reader: the made-up server and serve-dev refuse a marked database as the real ones do. */
const theUpgradeMark = join(root, 'src/config/the-upgrade-mark.mjs')
/** The product's line for a supervisor whose startup is done, which the made-up serve-dev prints (see THE_STARTUP). */
const theStartupLine = join(root, 'src/config/supervisor-startup-done.mjs')
/**
 * The product release check's header rule, which the made-up server's release check keeps as the real one does. It is
 * a module of its own: src/server/lib/release-check.ts loads the product's settings, which refuse the made-up
 * development checkout as one paired with another checkout than this one.
 */
const theReleaseCheck = join(root, 'src/server/lib/checkpointed-database.ts')
/**
 * The made-up server, for an office that ends with `owner`. aLineThatStopsAServerWithItsStarterOrOwner stops it once the
 * process named by its --stop-with-pid is gone, or once `owner` is gone, even when .ignore-term makes it ignore TERM.
 * With .wal-mode its ordinary start sets WAL mode, as src/server/db/client.ts does. Its release check refuses a database
 * with the product's requireCheckpointed, at its start and at each health read, as the real one does. Its live release
 * check (release-check-live) opens the database read-only as well, keeps no checkpoint rule, and names its own mode.
 * A checkout that holds the target's migration is unhealthy until the migration has made the `migrated` table.
 * Each start adds a line to `starts`: its mode, database and checkout, so a test can read what each start was given.
 * A checkout with a .slow-start file waits that many milliseconds before it listens (see THE_SLOW_START).
 */
const serverSource = (owner: number, starts: string) => `
import http from 'node:http';import {readFileSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';import {execFileSync,spawn} from 'node:child_process';import {createRequire} from 'node:module';import {dirname,join} from 'node:path';
import {versionOf} from ${JSON.stringify(join(root, 'src/server/lib/version.ts'))};
import {whyAnUpgradeKeepsTheOfficeClosed} from ${JSON.stringify(theUpgradeMark)};
const require=createRequire(import.meta.url);const Database=require(${JSON.stringify(databaseModule)});
import {loadEnvFileIntoProcess} from '../config/settings.mjs';
loadEnvFileIntoProcess((process.env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT??process.cwd())+'/.env');
const repository=process.cwd(),database=process.env.MOLE_OFFICE_DB,port=Number(process.env.MOLE_OFFICE_PORT),mode=process.env.MOLE_OFFICE_START_MODE??'ordinary';
appendFileSync(${JSON.stringify(starts)},JSON.stringify({mode,database,repository})+'\\n');
{const closed=whyAnUpgradeKeepsTheOfficeClosed(database,repository,process.env.MOLE_OFFICE_START_MODE);if(closed!==null){console.error(closed);process.exit(1)}}
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT&&(execFileSync('git',['symbolic-ref','HEAD'],{encoding:'utf8'}).trim()!=='refs/heads/stable'||!execFileSync('git',['tag','--points-at','HEAD'],{encoding:'utf8'}).trim().split('\\n').some(t=>/^stable-\\d{4}-\\d{2}-\\d{2}-/.test(t))))throw Error('Stable fixture must start on its dated stable tag');
const checking=mode==='release-check'||mode==='release-check-live';
const requireCheckpointed=mode==='release-check'?(await import(${JSON.stringify(theReleaseCheck)})).requireCheckpointed:null;
if(mode==='release-check'&&typeof requireCheckpointed!=='function'){console.error('src/server/lib/checkpointed-database.ts exports no requireCheckpointed, so the made-up release check cannot keep its header rule.');process.exit(1)}
if(requireCheckpointed){try{requireCheckpointed(database)}catch(error){console.error(error.message);process.exit(1)}}
const db=new Database(database,{readonly:checking,fileMustExist:true});
if(mode==='ordinary'&&existsSync('.wal-mode'))db.pragma('journal_mode = WAL');
const schemaReady=!existsSync(${JSON.stringify(THE_TARGETS_MIGRATION)})||Boolean(db.prepare("SELECT name FROM sqlite_master WHERE name='migrated'").get());
const identity={commit,repository,database,port,mode};
let worker={started:false,pid:null,pgid:null};
if(mode==='ordinary'&&existsSync('.detach-child')){const child=spawn(join(process.cwd(),'node_modules/.bin/tsx'),['src/worker/index.ts', '--stop-with-pid='+process.pid],{detached:true,stdio:'ignore',env:{...process.env,PATH:dirname(process.execPath)+':'+process.env.PATH}});worker={started:true,pid:child.pid,pgid:child.pid};}

const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');
 if(req.url==='/api/health'&&requireCheckpointed){try{requireCheckpointed(database)}catch(error){res.statusCode=503;return res.end(JSON.stringify({ok:false,code:'RELEASE_CHECK_CHANGED',error:error.message}))}}
 if(req.url==='/api/health'){if(!schemaReady)res.statusCode=503;return res.end(JSON.stringify({ok:schemaReady,diagnostic:schemaReady?'schema ready':'target schema missing',...(checking?{identity}:{world:{repository,database,port,head:commit.slice(0,7)}})}))}
 if(req.url==='/api/runtime')return res.end(JSON.stringify(checking?{identity}:{repository:{path:repository,head:{full:commit}},database:{path:database},addresses:{api:'http://127.0.0.1:'+port},process:{pid:process.pid},supervisor:{pid:process.ppid},worker,fixtureDevelopment:process.env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT,fixtureDatabase:process.env.MOLE_OFFICE_DB,fixturePort:process.env.MOLE_OFFICE_PORT,fixtureHome:process.env.HOME,fixtureWorker:process.env.MOLE_OFFICE_MESSAGE_WORKER,fixtureWorkspace:process.env.MOLE_OFFICE_WORKSPACE,fixturePersistedSecret:process.env.FIXTURE_SERVICE_SECRET==='synthetic-only'}));
 if(checking){res.statusCode=503;return res.end(JSON.stringify({error:'This release check refuses ordinary routes and writes.'}))}
 // The office's registry row, whose id the notice tools compare each notice's sender with.
 if(req.method==='GET'&&req.url==='/api/participants/agent/mole-office')return res.end(JSON.stringify({participant:{id:'mole-office',handle:'mole-office',retired:false}}))
 // A synthetic notice server isolates recovery failures. The separate notice tests use the authenticated product route.
 if(req.method==='GET'&&req.url.startsWith('/api/office/upgrades?')){const saved=db.prepare('SELECT response FROM fixture_notices WHERE send_id=?').get(new URL(req.url,'http://fixture').searchParams.get('sendId'));const notice=saved?{...JSON.parse(saved.response),replayed:true}:null;return res.end(JSON.stringify({notice}))}
 if(req.method==='POST'&&req.url==='/api/office/upgrades/notice'){let body='';req.on('data',b=>body+=b);req.on('end',()=>{const request=JSON.parse(body);const old=db.prepare('SELECT payload,response FROM fixture_notices WHERE send_id=?').get(request.sendId);if(old){if(old.payload!==body){res.statusCode=409;return res.end('{}')}const reply=JSON.parse(old.response);reply.replayed=true;return res.end(JSON.stringify(reply))}const emergency=request.kind==='emergency';const event={version:emergency?4:1,project:req.headers['x-mole-office-workspace']??'fixture-project',date:'2026-10-14 01:00:00',request};const line=emergency&&request.stage==='before'?'Emergency release: no complete test receipt was read for this version. Message '+request.announcement.emergency.message.id+' told the owner.\\n\\n':'';const content={kind:'message',title:'Synthetic notice',summary:null,data:{body:request.stage==='before'?line+request.announcement.notice:'Synthetic final notice',sentBy:{kind:'agent',id:'mole-office'},to:[{kind:'person',id:'fixture-owner'}],extra:{stableUpgradeNotice:event}},deletedAt:null};const reply={original:{id:'fixture-'+request.stage,seq:1,contentHash:versionOf(content)},content,event,replayed:false};db.prepare('INSERT INTO fixture_notices VALUES (?,?,?)').run(request.sendId,body,JSON.stringify(reply));res.statusCode=201;res.end(JSON.stringify(reply))});return}
 if(req.method==='POST'&&req.url==='/api/fixture-group-orphan'){const child=spawn(process.execPath,['fixture-orphan-parent.mjs'],{stdio:'ignore',env:process.env});child.on('exit',()=>res.end('{}'));return}
 if(req.method==='POST'&&req.url==='/api/fixture-holder'){const child=spawn(process.execPath,[join(repository,${JSON.stringify(THE_HOLDER_ENTRY)}),'--database',database],{cwd:repository,detached:true,stdio:'ignore',env:process.env});child.unref();return res.end(JSON.stringify({pid:child.pid}))}\n if(req.method==='POST'&&req.url==='/api/fixture-write'){db.prepare("INSERT INTO records VALUES ('published-write','accepted')").run();return res.end('{}')}
 res.statusCode=404;res.end('{}');});
if(existsSync(${JSON.stringify(THE_SLOW_START)}))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,Number(readFileSync(${JSON.stringify(THE_SLOW_START)},'utf8')));
server.once('error',${aRefusedListenEnds('port')});server.listen({port,host:'127.0.0.1',reusePort:true});
const stop=()=>{if(worker.started)try{process.kill(-worker.pgid,'SIGTERM')}catch{}server.close(()=>{db.close();process.exit(0)})};
process.on('SIGTERM',()=>{if(!existsSync('.ignore-term'))stop()});
${aLineThatStopsAServerWithItsStarterOrOwner('stop', owner)}
`
async function startOld(stable: string, database: string, chosen: number, home: string, externalSecret: boolean, development: string, gated: boolean, owner: number) {
  const args = ['tools/serve-dev.mjs', '--built', '--prepared']
  // Either shape the upgrade accepts, each with a watch that ends the office's group once its owner is gone.
  const launch = gated ? commandUnderTheOwnerWatchingGate(args, owner) : commandThatWatchesItsOwnerFromInside(args, owner)
  const child = spawn(launch.command, launch.args, { cwd: stable, env: { PATH: process.env.PATH, TZ: fixtureTimeZone, HOME: home, MOLE_OFFICE_DEVELOPMENT_CHECKOUT: development, MOLE_OFFICE_MESSAGE_WORKER: 'off', MOLE_OFFICE_DB: database, MOLE_OFFICE_PORT: String(chosen), MOLE_OFFICE_START_MODE: 'ordinary', ...(externalSecret ? { FIXTURE_EXTERNAL_SECRET: 'synthetic-unrecorded-secret' } : {}) }, detached: true, stdio: 'ignore' })
  if (!child.pid) throw new Error('Fixture service did not start.')
  groups.add(child.pid); children.push(child)
  for (let i = 0; i < 100; i++) {
    let answer: Response
    try { answer = await fetch(`http://127.0.0.1:${chosen}/api/health`) } catch { await delay(10); continue /* wait for this recorded child */ }
    if (answer.ok) {
      // ONLY ITS OWN ANSWER: another office on this port would leave the recorded group ended and the upgrade misled.
      const named = (await answer.json())?.world?.database
      if (named !== database) throw new Error(`Another office answered on port ${String(chosen)}: it names the database ${String(named)}, and the made-up office's is ${database}.`)
      return { pgid: child.pid, startTime: processIdentity(child.pid).startTime, cwd: stable, database, port: chosen }
    }
    await delay(10)
  }
  throw new Error('Fixture service did not become healthy.')
}
/**
 * The made-up office ends with this worker, unless the test asks for one that ends with a stand-in owner. With `walMode`
 * its database is in WAL mode, as the office's is. `releaseCase` 2 gives a target that adds a migration, and 1 a target
 * that changes no file under the migrations folder. A target's settings take release-check-live, unless `liveMode` is
 * 'refused' (see theTargetsSettingsRefuseTheLiveMode). With `slowStartMs` the target's made-up office waits that long
 * before it listens, at every start of the target (see THE_SLOW_START); the baseline's starts at once. With
 * `targetsMigration` the target commit brings a migrate.mjs of its own: the function is given the fixture's folder and
 * returns the script. Without it the target's migrate.mjs is the baseline's. With `startup` the target's made-up
 * serve-dev holds the line that says its startup is done, or ends its startup (see THE_STARTUP); the baseline's says
 * its startup is done at once.
 */
export async function stableUpgradeFixture(withOldWorker = false, externalSecret = false, ignoreTerm = false, gated = false, mismatchedDevelopment = false, walMode = false, releaseCase: 1 | 2 = 2, liveMode: LiveMode = 'taken', slowStartMs = 0, targetsMigration: ((folder: string) => string) | null = null, startup: Startup = 'done') {
  return aStableUpgradeFixture(withOldWorker, externalSecret, ignoreTerm, gated, mismatchedDevelopment, process.pid, walMode, releaseCase, liveMode, slowStartMs, targetsMigration, startup)
}
/**
 * The made-up office for a test that kills its owner: the owner is a stand-in this file starts, returned as `owner`. The
 * owner stays inside this file, so the dev-stack rule can follow it from the shared gate to the stand-in.
 */
export async function stableUpgradeFixtureOwnedByAStandIn(withOldWorker = false, externalSecret = false, ignoreTerm = false, gated = false, mismatchedDevelopment = false, releaseCase: 1 | 2 = 2) {
  const owner = aStandInOwner(standIns)
  return { ...(await aStableUpgradeFixture(withOldWorker, externalSecret, ignoreTerm, gated, mismatchedDevelopment, owner, false, releaseCase)), owner }
}
/**
 * THE NPM PART OF A MADE-UP WORLD, made once for each test file: the two locked tarballs, package.json, typecheck.mjs,
 * the lock npm writes for them, the node_modules a real `npm ci` installs from that lock, and the dist the typecheck
 * writes. None of it names a world's folder or owner, so every world copies these bytes instead of running npm three
 * times. The upgrade under test still runs its own npm ci and typecheck in the world.
 */
const THE_NPM_PART = ['dependency.tgz', 'fixture-loader.tgz', 'package.json', 'package-lock.json', 'typecheck.mjs']
const npmParts: string[] = []
let theNpmPartMade: string | null = null
function theNpmPart() {
  if (theNpmPartMade !== null) return theNpmPartMade
  const made = mkdtempSync(join(out, 'stable-npm-part-')); npmParts.push(made)
  // Real npm ci consumes a locked local tarball; no registry or stand-in npm is involved.
  write(join(made, 'package/package.json'), JSON.stringify({ name: 'upgrade-fixture-dependency', version: '1.0.0' }))
  write(join(made, 'package/index.js'), 'module.exports = "locked dependency bytes"\n')
  run(made, 'tar', ['-czf', 'dependency.tgz', 'package'])
  // A locked no-op loader lets the fake TypeScript entry use Node's native stripping.
  // No dependencies are linked outside this fixture's artifact boundary.
  write(join(made, 'fixture-loader/package.json'), JSON.stringify({ name: 'tsx', version: '0.0.0', type: 'module', exports: './loader.mjs', bin: { tsx: './cli.mjs' } }))
  write(join(made, 'fixture-loader/loader.mjs'), '// The fixture entries contain only erasable types.\n')
  write(join(made, 'fixture-loader/cli.mjs'), `#!/usr/bin/env node
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const child=spawn(process.execPath,['--import',fileURLToPath(new URL('./loader.mjs',import.meta.url)),...process.argv.slice(2)],{stdio:'inherit',env:process.env});
for(const signal of ['SIGTERM','SIGINT','SIGHUP'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>process.exit(126));child.on('exit',(code,signal)=>{if(signal){process.removeAllListeners(signal);process.kill(process.pid,signal)}else process.exit(code??1)});
`)
  run(made, 'tar', ['-czf', 'fixture-loader.tgz', 'fixture-loader'])
  write(join(made, 'package.json'), JSON.stringify({ name: 'synthetic-upgrade-office', version: '1.0.0', type: 'module', scripts: { typecheck: 'node typecheck.mjs', build: 'node build.mjs', start: 'node src/server/index.ts', 'db:migrate': 'node migrate.mjs' }, dependencies: { 'upgrade-fixture-dependency': 'file:dependency.tgz', tsx: 'file:fixture-loader.tgz' } }))
  write(join(made, 'typecheck.mjs'), `import{mkdirSync,writeFileSync}from'node:fs';mkdirSync('dist',{recursive:true});writeFileSync('dist/fixture-typechecked','checked');`)
  run(made, 'npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'])
  run(made, 'npm', ['ci', '--no-audit', '--no-fund']); run(made, 'npm', ['run', 'typecheck'])
  theNpmPartMade = made
  return made
}
async function aStableUpgradeFixture(withOldWorker: boolean, externalSecret: boolean, ignoreTerm: boolean, gated: boolean, mismatchedDevelopment: boolean, owner = process.pid, walMode = false, releaseCase: 1 | 2 = 2, liveMode: LiveMode = 'taken', slowStartMs = 0, targetsMigration: ((folder: string) => string) | null = null, startup: Startup = 'done') {
  const folder = mkdtempSync(join(out, 'stable-transaction-')); folders.push(folder)
  const remote = join(folder, 'remote.git'), dev = join(folder, 'development'), stable = join(folder, 'stable'), recovery = join(folder, 'recovery'), database = join(folder, 'office.sqlite')
  mkdirSync(dev); mkdirSync(recovery, { mode: 0o700 })
  copyBootstrapSettings(dev)
  const serviceHome = folder // A real service home may be an ancestor of its checkouts.
  git(folder, 'init', '--bare', remote); git(dev, 'init', '-b', 'main')
  git(dev, 'config', 'user.email', 'fixture@example.invalid'); git(dev, 'config', 'user.name', 'Synthetic upgrade fixture')
  write(join(dev, '.gitignore'), 'node_modules/\ndist/\n.npm-cache/\n.detach-child\n.ignore-term\n.wal-mode\n.env\n')
  write(join(dev, 'src/server/index.ts'), serverSource(owner, join(folder, THE_STARTS)))
  write(join(dev, THE_HOLDER_ENTRY), `import{appendFileSync}from'node:fs';setInterval(()=>{},1000);process.on('SIGTERM',()=>{appendFileSync(process.argv[process.argv.indexOf('--database')+1]+'.holder-signalled','synthetic holder signalled');process.exit(0)});${aLineThatEndsWithItsOwner(owner)}`)
  write(join(dev, 'src/worker/index.ts'), `import{createRequire}from'node:module';const require=createRequire(import.meta.url);const Database=require(${JSON.stringify(databaseModule)});const db=new Database(process.env.MOLE_OFFICE_DB);const owner=process.argv.find(arg=>arg.startsWith('--stop-with-pid='))?.split('=')[1];const stop=()=>{db.close();process.exit(0)};setInterval(()=>{try{process.kill(Number(owner),0)}catch{stop()}},50);process.on('SIGTERM',stop);`)
  write(join(dev, 'tools/serve-dev.mjs'), `import{spawn}from'node:child_process';import{existsSync,readFileSync}from'node:fs';import{whyAnUpgradeKeepsTheOfficeClosed}from${JSON.stringify(theUpgradeMark)};import{theSupervisorsStartupIsDone}from${JSON.stringify(theStartupLine)};{const closed=whyAnUpgradeKeepsTheOfficeClosed(process.env.MOLE_OFFICE_DB,process.cwd(),undefined);if(closed!==null){console.error(closed);process.exit(1)}}if(!process.argv.includes('--built')||!process.argv.includes('--prepared'))throw Error('Expected built prepared supervisor');const child=spawn(process.execPath,['src/server/index.ts','--stop-with-pid='+process.pid],{detached:true,stdio:'inherit',env:{...process.env,MOLE_OFFICE_RESTART_REASON:'fixture start'}});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>{if(!existsSync('.ignore-term')){try{process.kill(-child.pid,'SIGTERM')}catch{} }});const done=()=>console.log(theSupervisorsStartupIsDone(process.pid,Number(process.env.MOLE_OFFICE_PORT)));const[startup,ms]=existsSync(${JSON.stringify(THE_STARTUP)})?readFileSync(${JSON.stringify(THE_STARTUP)},'utf8').split(' '):['done','0'];if(startup==='done')done();else{const answered=async()=>{for(;;){try{if((await fetch('http://127.0.0.1:'+process.env.MOLE_OFFICE_PORT+'/api/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,10))}};answered().then(()=>setTimeout(startup==='held'?done:()=>{child.removeAllListeners('exit');child.once('exit',()=>process.exit(1));process.kill(-child.pid,'SIGTERM')},Number(ms)))}`)
  write(join(dev, 'fixture-orphan-parent.mjs'), `import{spawn}from'node:child_process';const child=spawn(process.execPath,['fixture-orphan.mjs'],{stdio:'ignore',env:process.env});child.unref();process.exit(0);`)
  write(join(dev, 'fixture-orphan.mjs'), `import{writeFileSync}from'node:fs';writeFileSync(process.env.MOLE_OFFICE_DB+'.orphan-pid',String(process.pid));setInterval(()=>{},1000);process.on('SIGTERM',()=>process.exit(0));${aLineThatEndsWithItsOwner(owner)}`)
  write(join(dev, 'tools/stable/untranslated-words.mjs'), aMadeUpWordCounter(folder))
  write(join(dev, 'src/shared/stable-upgrade-notices.ts'), aMadeUpNoticeContract(folder))
  write(join(dev, 'version.txt'), 'baseline')
  write(join(dev, THE_BASELINES_MIGRATION), '-- The made-up baseline migration. migrate.mjs makes the schema; this file is only read.\n')
  write(join(dev, 'tests/synthetic.test.ts'), '// Synthetic receipt input, never executed as a suite.\n')
  const npmPart = theNpmPart()
  for (const file of THE_NPM_PART) cpSync(join(npmPart, file), join(dev, file))
  write(join(dev, 'build.mjs'), `import{mkdirSync,readFileSync,writeFileSync}from'node:fs';mkdirSync('dist/web',{recursive:true});writeFileSync('dist/web/index.html',readFileSync('version.txt'));if(process.env.MOLE_AGENT_KEY||process.env.OPENAI_API_KEY)throw Error('Inherited caller secrets/settings');`)
  // This small fixture models the stamped builder; the authenticated fixture uses the product builder.
  write(join(dev, 'tools/build-the-page.mjs'), `import{existsSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';export async function buildThePage(){if(!existsSync('dist/fixture-typechecked'))return{ok:false,output:'Typecheck was skipped'};await import('../build.mjs');writeFileSync('dist/web/build-stamp.json',JSON.stringify({builtAt:'2026-10-14 01:00:00',builtAtMs:1,newestSourceAt:null,newestSourceAtMs:null,newestSourceFile:null,newestSourceFiles:null,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}));return{ok:true}}`)
  // Each migration writes down which database it was given and its arguments, so a test can read what the upgrade passed.
  write(join(dev, 'migrate.mjs'), `import{createRequire}from'node:module';import{appendFileSync}from'node:fs';import {versionOf} from ${JSON.stringify(join(root, 'src/server/lib/version.ts'))};
appendFileSync(${JSON.stringify(join(folder, 'migrate-arguments'))},JSON.stringify({database:process.env.MOLE_OFFICE_DB,args:process.argv.slice(2)})+'\\n');
const require=createRequire(import.meta.url);const Database=require(${JSON.stringify(databaseModule)});const db=new Database(process.env.MOLE_OFFICE_DB);db.exec("INSERT INTO records VALUES ('migration','candidate'); CREATE TABLE migrated(port INTEGER)");db.prepare('INSERT INTO migrated VALUES (?)').run(Number(process.env.MOLE_OFFICE_PORT));db.close();`)
  write(join(dev, 'plugins/example/plugin.json'), JSON.stringify({ id: 'example', pages: [{ slug: 'main' }] }))
  write(join(dev, 'tools/build-a-plugin.mjs'), `import{mkdirSync,readFileSync,writeFileSync}from'node:fs';mkdirSync('plugins/'+process.argv[2]+'/dist',{recursive:true});writeFileSync('plugins/'+process.argv[2]+'/dist/main.html',readFileSync('version.txt'));`)
  git(dev, 'add', '.'); git(dev, 'commit', '-m', 'Synthetic baseline'); const baseline = git(dev, 'rev-parse', 'HEAD')
  git(dev, 'tag', baselineTag); git(dev, 'remote', 'add', 'origin', remote); git(dev, 'push', 'origin', 'main', '--tags')
  git(folder, 'clone', '--no-local', '--branch', 'main', remote, stable); git(stable, 'checkout', '-b', 'stable')
  // What npm ci and the typecheck made in the npm part, from the same lock and tarballs as this checkout's.
  cpSync(join(npmPart, 'node_modules'), join(stable, 'node_modules'), { recursive: true, verbatimSymlinks: true }); cpSync(join(npmPart, 'dist'), join(stable, 'dist'), { recursive: true })
  run(stable, process.execPath, ['--input-type=module', '--eval', "const {buildThePage}=await import('./tools/build-the-page.mjs');if(!(await buildThePage()).ok)process.exitCode=1"]); run(stable, process.execPath, ['tools/build-a-plugin.mjs', 'example'])
  // The development checkout has its own loader, as a real one does: the dry run counts the untranslated words there.
  cpSync(join(stable, 'node_modules'), join(dev, 'node_modules'), { recursive: true, verbatimSymlinks: true })
  write(join(stable, 'node_modules/baseline-only.txt'), 'retain these exact dependency bytes')
  write(join(stable, 'dist/web/baseline-only.txt'), 'retain these exact web bytes')
  write(join(stable, 'plugins/example/dist/baseline-only.txt'), 'retain these exact plugin bytes')
  write(join(dev, 'version.txt'), 'candidate')
  if (releaseCase === 2) write(join(dev, THE_TARGETS_MIGRATION), '-- The made-up target migration. migrate.mjs makes the `migrated` table; this file is only read.\n')
  if (liveMode === 'refused') theTargetsSettingsRefuseTheLiveMode(dev)
  if (slowStartMs > 0) write(join(dev, THE_SLOW_START), String(slowStartMs))
  if (targetsMigration !== null) write(join(dev, 'migrate.mjs'), targetsMigration(folder))
  if (startup !== 'done') write(join(dev, THE_STARTUP), 'heldMs' in startup ? `held ${String(startup.heldMs)}` : `ends ${String(startup.endsAfterMs)}`)
  git(dev, 'add', 'version.txt', ...(releaseCase === 2 ? [THE_TARGETS_MIGRATION] : []), ...(liveMode === 'refused' ? [THE_SETTINGS] : []), ...(slowStartMs > 0 ? [THE_SLOW_START] : []), ...(targetsMigration !== null ? ['migrate.mjs'] : []), ...(startup !== 'done' ? [THE_STARTUP] : [])); git(dev, 'commit', '-m', 'Synthetic candidate'); git(dev, 'push', 'origin', 'main'); const target = git(dev, 'rev-parse', 'HEAD')
  const db = new Database(database)
  if (walMode) db.pragma('journal_mode = WAL')
  // One transaction: five commits, each synced on its own, took about 100 ms of every world.
  db.exec("BEGIN; CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); INSERT INTO records VALUES ('authored','baseline'); CREATE TABLE fixture_notices(send_id TEXT PRIMARY KEY, payload TEXT, response TEXT); CREATE TABLE held_keys(id TEXT, key_hash TEXT); INSERT INTO held_keys VALUES ('private','not-a-real-credential'); COMMIT;")
  db.close()
  const servicePort = await heldPort(), releaseCheckPort = await heldPort([servicePort])
  write(join(dev, '.env'), 'MOLE_OFFICE_STABLE_CHECKOUT='+stable+'\nMOLE_OFFICE_WORKSPACE=from-development-file\nMOLE_OFFICE_PIXEL_OFFICE=off\nFIXTURE_SERVICE_SECRET=synthetic-only\n')
  const serviceDevelopment = mismatchedDevelopment ? join(folder, 'other-development') : dev
  if (mismatchedDevelopment) {
    git(folder, 'clone', '--no-local', '--no-hardlinks', dev, serviceDevelopment)
    write(join(serviceDevelopment, '.env'), readFileSync(join(dev, '.env'), 'utf8'))
  }
  if (withOldWorker) write(join(stable, '.detach-child'), 'Synthetic old detached worker.')
  if (ignoreTerm) write(join(stable, '.ignore-term'), 'This owned baseline ignores TERM until cleanup removes this file.')
  if (walMode) write(join(stable, '.wal-mode'), 'This made-up office keeps its database in WAL mode, as the office does.')
  const group = await startOld(stable, database, servicePort, serviceHome, externalSecret, serviceDevelopment, gated, owner)
  // The health's attempts may be left out, so a test may delete them and leave the release its own start limit.
  const config = { serviceHome, serviceSettings: { MOLE_OFFICE_MESSAGE_WORKER: 'off', TZ: fixtureTimeZone }, developmentRepository: dev, stableCheckout: stable, database, targetCommit: target, evidence: { recordId: 'synthetic-receipt', seq: 1, contentHash: 'aaaaaaaaaaaaaaaa' }, previousBaselineTag: baselineTag, candidateTag, serviceGroups: [group], notice: 'Synthetic fixture upgrade notice.', noticeApproval: { id: 'synthetic-approval', seq: 1, contentHash: 'bbbbbbbbbbbbbbbb' }, noticeSendIds: { before: 'synthetic-before', after: 'synthetic-after' }, releaseCheckPort, servicePort, health: { ...THE_FIXTURE_HEALTH } as { attempts?: number, intervalMs: number, timeoutMs: number, stopTimeoutMs: number, commandTimeoutMs: number }, recoveryRoot: recovery }
  const oldRuntime = await (await fetch(`http://127.0.0.1:${servicePort}/api/runtime`)).json()
  for (const pid of [oldRuntime.process.pid, ...(withOldWorker ? [oldRuntime.worker.pid] : [])]) {
    const identity = processIdentity(pid); groups.add(identity.pgid)
    config.serviceGroups.push({ ...group, pgid: identity.pgid, startTime: identity.startTime })
  }
  // Labelled original policy evidence is shared with the policy reader's own fixtures.
  // A variable import keeps the criterion checkpoint compilable before that helper lands.
  const policyFixturePath = './stable-release-policy-fixture.ts'
  const { fakeReleasePolicyFixture } = await import(policyFixturePath)
  const policy = fakeReleasePolicyFixture({ config, baseline, tree: git(dev, 'rev-parse', 'HEAD^{tree}') })
  config.noticeApproval = policy.approval
  if (process.env.STABLE_UPGRADE_KEEP_FIXTURES === 'yes') write(join(folder, 'synthetic-policy-originals.json'), JSON.stringify([...policy.records], null, 2))
  const requests: Array<{ method: string; path: string; api?: string }> = []
  const officeRequest = async (request: { method: string; path: string }, destination?: { api: string }) => {
    requests.push({ ...request, api: destination?.api })
    if (request.method !== 'GET' && !['/api/office/upgrades/notice', '/api/office/gates/stable-emergency/met'].includes(request.path)) throw new Error('The transaction attempted an unrelated office write.')
    if (!destination) return policy.officeRequest(request)
    const response = await fetch(destination.api + request.path, { method: request.method, ...('body' in request ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(request.body) } : {}), signal: AbortSignal.timeout(1000), redirect: 'manual' })
    return { status: response.status, body: await response.text(), location: response.headers.get('location'), cut: false, added: null }
  }
  // Evidence semantics have their own real-office tests. This seam isolates transaction failures.
  const verifyEvidence = async (_: unknown, { officeRequest }: any) => { await officeRequest({ method: 'GET', path: '/api/records/synthetic-receipt/revisions/1' }); return { receipt: { commit: target }, original: {}, result: {}, artifacts: [] } }
  const originalArtifacts = ['node_modules', 'dist', 'plugins/example/dist'].map((p) => artifactIdentity(join(stable, p), stable))
  Object.assign(officeRequest, { identity: policy.officeRequest.identity })
  const options = { officeRequest, verifyEvidence, onStep: track }
  return { folder, dev, stable, recovery, database, baseline, target, config, requests, options, originalArtifacts, policy }
}
/** Each start of the made-up office so far, in order: its mode, database and checkout. */
function startsOf(f: { folder: string }): Array<{ mode: string, database: string, repository: string }> {
  const file = join(f.folder, THE_STARTS)
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []
}
/**
 * NOTHING A REFUSED RELEASE WOULD CHANGE HAS CHANGED: no lock, nothing in the recovery folder (no journal and no work
 * folder), stable HEAD and the database's rows as they were, no office write, and the old version answers on its port.
 * `before` is snapshot(f) from before the release was tried.
 */
async function nothingChanged(f: Awaited<ReturnType<typeof stableUpgradeFixture>>, before: ReturnType<typeof snapshot>) {
  expect(existsSync(join(f.stable, '.git/stable-upgrade.lock')), 'no lock').toBe(false)
  expect(readdirSync(f.recovery), 'no journal and no work folder').toEqual([])
  expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.baseline)
  expect(snapshot(f)).toEqual(before)
  expect(f.requests.filter((r) => r.method !== 'GET'), 'no office write').toEqual([])
  const health = await (await fetch(`http://127.0.0.1:${String(f.config.servicePort)}/api/health`)).json()
  expect(health.world.head).toBe(f.baseline.slice(0, 7))
}
/** The names the release gives its copies of the database. A file whose name begins with one is a copy, whatever it holds. */
const THE_COPY_NAMES = ['candidate.sqlite', 'restore.sqlite', 'sanitized.sqlite']
const SQLITE_HEADER = Buffer.from('SQLite format 3\0')
/**
 * THE COPIES OF THE DATABASE ON DISK NOW, by their paths under the fixture's folder, which holds the database, the
 * recovery root and the work folder: every file that begins with SQLite's header and is not the database, and every file
 * whose name begins with one of THE_COPY_NAMES. A copy's -wal, -shm and -journal files are counted with the copy, as
 * one. The database's own have another header and are not a copy. Git's folders are not read; the release makes no copy there. A file or folder that goes while it is read,
 * as a command's own files do, was no copy.
 */
function theDatabaseCopies(f: { folder: string, database: string }) {
  const found: string[] = []
  const gone = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
  const look = (folder: string) => {
    let entries
    try { entries = readdirSync(folder, { withFileTypes: true }) } catch (error) { if (gone(error)) return; throw error }
    for (const entry of entries) {
      const path = join(folder, entry.name)
      if (entry.isDirectory()) { if (!entry.name.endsWith('.git')) look(path); continue }
      if (!entry.isFile() || path === f.database) continue
      if (THE_COPY_NAMES.some((name) => entry.name.startsWith(name))) { found.push(relative(f.folder, path).replace(/-(wal|shm|journal)$/, '')); continue }
      const header = Buffer.alloc(SQLITE_HEADER.length)
      let fd
      try { fd = openSync(path, 'r') } catch (error) { if (gone(error)) continue; throw error }
      try { readSync(fd, header, 0, header.length, 0) } finally { closeSync(fd) }
      if (header.equals(SQLITE_HEADER)) found.push(relative(f.folder, path))
    }
  }
  look(f.folder)
  return [...new Set(found)].sort()
}
function remember(result: any) { if (result.service) { groups.add(result.service.pgid); for (const g of result.service.detachedGroups ?? []) groups.add(g.pgid) } return result }
function track(event: any) { if (event.pgid) groups.add(event.pgid) }
function snapshot(f: Awaited<ReturnType<typeof stableUpgradeFixture>>) {
  const db = new Database(f.database, { readonly: true })
  try { return { records: db.prepare('SELECT * FROM records ORDER BY id').all(), keys: db.prepare('SELECT * FROM held_keys').all(), migrated: db.prepare("SELECT name FROM sqlite_master WHERE name='migrated'").get() } } finally { db.close() }
}
async function baselineIsBack(f: Awaited<ReturnType<typeof stableUpgradeFixture>>) {
  expect(git(f.stable, 'rev-parse', 'HEAD')).toBe(f.baseline)
  expect(git(f.stable, 'branch', '--show-current')).toBe('stable')
  expect(['node_modules', 'dist', 'plugins/example/dist'].map((p) => artifactIdentity(join(f.stable, p), f.stable))).toEqual(f.originalArtifacts)
  expect(snapshot(f)).toEqual({ records: [{ id: 'authored', value: 'baseline' }], keys: [{ id: 'private', key_hash: 'not-a-real-credential' }], migrated: undefined })
  expect((await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/health`)).json()).world.head).toBe(f.baseline.slice(0, 7))
  expect(git(f.dev, 'status', '--porcelain')).toBe('')
  const runtime = await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/runtime`)).json()
  expect(runtime.fixtureDevelopment).toBe(f.dev)
  expect(processIdentity(runtime.process.pid).ppid).toBe(runtime.supervisor.pid)
  expect(processIdentity(runtime.process.pid).pgid).toBe(runtime.process.pid)
  expect(readFileSync(`/proc/${runtime.supervisor.pid}/cmdline`, 'utf8')).toContain('tools/serve-dev.mjs')
  expect(git(f.stable, 'rev-parse', baselineTag)).toBe(f.baseline)
  expect(runtime.fixtureHome).toBe(f.config.serviceHome); expect(runtime.fixtureWorker).toBe('off')
  expect(git(f.dev, 'rev-parse', 'main')).toBe(f.target)
}
afterEach(async () => {
  await endTheStandIns(standIns)
  for (const pgid of groups) {
    try { if (processIdentity(pgid).pgid === pgid) process.kill(-pgid, 'SIGTERM') } catch (e: any) { if (!['ENOENT', 'ESRCH'].includes(String(e.code))) throw e }
  }
  for (let n = 0; n < 200; n++) {
    const alive = [...groups].filter((pid) => { try { return !['Z', 'X'].includes(String(processIdentity(pid).state)) } catch { return false } })
    if (!alive.length) break
    if (n === 199) throw new Error(`Fixture groups did not end: ${alive.join(', ')}`)
    await delay(10)
  }
  for (const child of children) if (child.exitCode === null && child.signalCode === null) await new Promise<void>((r) => child.once('exit', () => r()))
  groups.clear(); children.length = 0
  for (const folder of folders) {
    const recovery = join(folder, 'recovery/' + candidateTag)
    if (existsSync(recovery)) for (const file of readdirSync(recovery).filter((s) => s.endsWith('.log'))) {
      const kept = join(out, 'transaction-command-logs', folder.split('/').at(-1)!)
      mkdirSync(kept, { recursive: true }); cpSync(join(recovery, file), join(kept, file))
    }
    if (process.env.STABLE_UPGRADE_KEEP_FIXTURES !== 'yes') rmSync(folder, { recursive: true, force: true })
  }
  folders.length = 0
})
afterAll(() => {
  if (process.env.STABLE_UPGRADE_KEEP_FIXTURES !== 'yes') for (const made of npmParts) rmSync(made, { recursive: true, force: true })
  npmParts.length = 0; theNpmPartMade = null
})


export { THE_BASELINES_MIGRATION, THE_TARGETS_MIGRATION, THE_FIXTURE_HEALTH, root, fixtureTimeZone, databaseModule, baselineTag, candidateTag, out, groups, children, folders, standIns, run, git, write, port, heldPort, aRefusedListenEnds, remember, track, snapshot, baselineIsBack, startsOf, nothingChanged, theDatabaseCopies }
