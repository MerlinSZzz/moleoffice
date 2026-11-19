// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A fixture supervisor runs the exact launcher argv and reads the fixture .env on each start.
 * It avoids real Office migrations, workers and records while exercising real process groups,
 * SQLite bytes, rename, the shared .env writer, health and recovery.
 */
import { afterEach, expect, it } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import Database from 'better-sqlite3'
import { askTheOffice, THE_LONGEST_REPLY } from '../tools/office-request.mjs'
import { bootstrapProcessIdentity } from '../tools/stable/stable-bootstrap-support.mjs'
import { linuxProcessReader } from '../src/config/process-reader.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import { localStamp } from '../src/shared/time.ts'
import { commandThatStopsWithItsOwner, freshDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theGateCountSpoolStep } from '../tools/stable/stable-gate-count-spool-step.mjs'

const implementation = new URL('../tools/stable/move-the-data-folder.mjs', import.meta.url).href
const processes = new Set<number>(), folders: string[] = []
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('base64')
/**
 * The paired stand-in serves from stable and opens development/data. It returns the runtime and
 * health fields the move reads. One process replaces the real supervisor and server, there is no
 * worker, and build, tag, freshness and world-header checks are outside this fixture. Authority and
 * notices use the real server library on a separate freshDb, with entirely made-up records.
 *
 * Proof: remove the separate layout check; all three cases lose their specific refusal. Move it
 * after canonicalFile instead; the stable checkout without .env fails with ENOENT.
 */
const pairedOfficeCode = `import fs from 'node:fs';import http from 'node:http';
const database=process.env.MOLE_OFFICE_DB,repository=process.cwd(),developmentCheckout=process.env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT;
const fd=fs.openSync(database,'r');
const server=http.createServer((req,res)=>{const port=server.address().port;res.setHeader('content-type','application/json');
res.end(JSON.stringify(req.url==='/api/runtime'?{developmentCheckout,port,process:{pid:process.pid},supervisor:{pid:process.pid},worker:{started:false},repository:{path:repository,workingDirectory:repository},database:{path:database},addresses:{api:'http://127.0.0.1:'+port}}:{ok:true,world:{database,repository,port}}));});
server.listen(Number(process.env.MOLE_OFFICE_PORT),'127.0.0.1',()=>{fs.writeFileSync('fixture.port.partial',String(server.address().port));fs.renameSync('fixture.port.partial','fixture.port')});
process.on('SIGTERM',()=>server.close(()=>{fs.closeSync(fd);process.exit(0)}));`

/** The port the paired stand-in listens on, as it wrote it into fixture.port in the folder it serves from. */
async function thePortTheStandInWrote(folder: string) {
  for (let n = 0; n < 200 && !existsSync(join(folder, 'fixture.port')); n++) await delay(15)
  return Number(readFileSync(join(folder, 'fixture.port'), 'utf8'))
}
/**
 * A FILE READ WHILE IT IS BEING WRITTEN. A reader starts once the file exists, and on a loaded machine that can be
 * between the writer's first byte and its last. This module, loaded before a writer, makes each of its file writes
 * write one character, wait 300 ms, then append the rest, and keeps what it was asked to write beside it. It appends
 * through the write it replaced: fs.appendFileSync calls fs.writeFileSync, which would be its own. A writer that
 * imports writeFileSync by name is given the slow one as well, by syncBuiltinESMExports.
 */
const slowWrites = `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const write=fs.writeFileSync;
fs.writeFileSync=(file,data,...rest)=>{const text=String(data);write(file+'.asked',text);write(file,text.slice(0,1),...rest);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,300);write(file,text.slice(1),{flag:'a'})};
syncBuiltinESMExports();`
/** Mutation: the stand-in writes fixture.port in place again → the port read is the first digit of the real one. */
it('reads the whole port the paired stand-in wrote, though its write is slow', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paired-port-file-')); folders.push(root)
  const stable = join(root, 'stable'), database = join(root, 'invented.db'), slow = join(root, 'slow-writes.mjs')
  mkdirSync(join(stable, 'tools'), { recursive: true }); mkdirSync(join(root, 'home'))
  writeFileSync(database, ''); writeFileSync(join(stable, 'tools', 'serve-dev.mjs'), pairedOfficeCode)
  writeFileSync(slow, slowWrites)
  const watched = commandThatStopsWithItsOwner(process.execPath, ['--import', pathToFileURL(slow).href, 'tools/serve-dev.mjs', '--built', '--prepared'])
  const child = spawn(watched.command, watched.args, { cwd: stable, env: { PATH: process.env.PATH, HOME: join(root, 'home'), NODE_ENV: 'production', MOLE_OFFICE_PORT: '0', MOLE_OFFICE_DB: database, MOLE_OFFICE_DEVELOPMENT_CHECKOUT: root }, detached: true, stdio: 'ignore' })
  processes.add(child.pid!)
  const port = await thePortTheStandInWrote(stable), asked = readdirSync(stable).filter((name) => name.endsWith('.asked'))
  expect(asked).toHaveLength(1)
  expect(port).toBe(Number(readFileSync(join(stable, asked[0]!), 'utf8')))
  expect((await fetch(`http://127.0.0.1:${String(port)}/api/runtime`).then((r) => r.json())).process.pid).toBe(child.pid)
})
/** Mutation: the made-up supervisor writes fixture-topology.json in place again → the read is its first character, which is not JSON. */
it('reads the whole topology the made-up supervisor wrote, though its write is slow', async () => {
  const root = mkdtempSync(join(tmpdir(), 'move-topology-file-')); folders.push(root)
  const checkout = join(root, 'checkout'), slow = join(root, 'slow-writes.mjs')
  mkdirSync(join(checkout, 'tools'), { recursive: true }); mkdirSync(join(checkout, 'data'))
  writeFileSync(join(checkout, 'data', 'invented.db'), ''); writeFileSync(join(checkout, '.env'), 'MOLE_OFFICE_DB=data/invented.db\n')
  writeFileSync(join(checkout, 'tools', 'serve-dev.mjs'), supervisorCode); writeFileSync(slow, slowWrites)
  const watched = commandThatStopsWithItsOwner(process.execPath, ['--import', pathToFileURL(slow).href, 'tools/serve-dev.mjs', '--built'])
  const child = spawn(watched.command, watched.args, { cwd: checkout, env: { PATH: process.env.PATH, MOLE_OFFICE_PORT: '0' }, detached: true, stdio: 'ignore' })
  processes.add(child.pid!)
  const topology = await theTopologyTheSupervisorWrote(checkout), asked = readdirSync(checkout).filter((name) => name.endsWith('.asked'))
  processes.add(topology.server); processes.add(topology.worker)
  expect(asked).toHaveLength(1)
  expect(topology).toEqual(JSON.parse(readFileSync(join(checkout, asked[0]!), 'utf8')))
})

for (const [scopeCheckout, stableEnv] of [['stable', true], ['development', true], ['stable', false]] as const) {
  it(`refuses paired development data before reserving or filing notices: ${scopeCheckout} scope, stable .env ${stableEnv ? 'present' : 'absent'}`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'paired-data-move-')); folders.push(root)
    const t = await freshDb()
    let leader: ReturnType<typeof bootstrapProcessIdentity> | undefined, child: ChildProcess | undefined
    try {
      const development = join(root, 'development'), stable = join(root, 'stable'), data = join(development, 'data')
      const repo = fileURLToPath(new URL('..', import.meta.url)), home = join(root, 'home')
      mkdirSync(join(stable, 'tools'), { recursive: true }); mkdirSync(join(data, 'agent-run-keys'), { recursive: true }); mkdirSync(home)
      for (const folder of [development, stable]) expect(spawnSync('git', ['init', '-q', folder]).status).toBe(0)
      cpSync(join(repo, 'tools'), join(development, 'tools'), { recursive: true })
      for (const entry of ['src', 'for-agents', 'node_modules']) symlinkSync(join(repo, entry), join(development, entry))
      const database = join(data, 'invented.db'), db = new Database(database)
      db.exec("CREATE TABLE invented(value TEXT); INSERT INTO invented VALUES ('fixture only')"); db.close()
      writeFileSync(join(data, 'keys.json'), '{"fixture":true}')
      writeFileSync(join(data, 'agent-run-keys', 'invented.key'), 'made-up key material')
      const envFile = join(development, '.env'), stableEnvFile = join(stable, '.env')
      writeFileSync(envFile, `MOLE_OFFICE_DB=${database}\nMOLE_OFFICE_STABLE_CHECKOUT=${stable}\n`)
      if (stableEnv) writeFileSync(stableEnvFile, `MOLE_OFFICE_DB=${database}\n`)
      writeFileSync(join(stable, 'tools', 'serve-dev.mjs'), pairedOfficeCode)
      const watched = commandThatStopsWithItsOwner(process.execPath, ['tools/serve-dev.mjs', '--built', '--prepared'])
      child = spawn(watched.command, watched.args, { cwd: stable, env: { PATH: process.env.PATH, HOME: home, NODE_ENV: 'production', MOLE_OFFICE_PORT: '0', MOLE_OFFICE_DB: database, MOLE_OFFICE_DEVELOPMENT_CHECKOUT: development }, detached: true, stdio: 'ignore' })
      leader = bootstrapProcessIdentity(child.pid!); processes.add(leader.pgid)
      const port = await thePortTheStandInWrote(stable)
      const { currentProcessRecord } = await import('../tools/stable/stable-bootstrap-processes.mjs')
      const group = currentProcessRecord(child.pid!)
      const born = linuxProcessReader().processAt(group.pid)
      if (!born.here || born.unreadable !== undefined) throw new Error('The made-up supervisor could not be read')
      const backup = join(root, 'backup.db'); writeFileSync(backup, readFileSync(database))
      const target = join(root, 'private-data')
      const scope = { version: 1, action: 'stop-to-move-the-data-folder', database, checkout: scopeCheckout === 'stable' ? stable : development, port, targetFolder: target, targetMode: '700', backup: { path: backup, sha256: hash(backup) } }
      const actor = (handle: string, role: string) => {
        t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up ' + handle, data: { handle, runtime: 'codex', state: 'active' }, actor: t.api.HUMAN })
        const { id } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle=?').get(handle) as { id: string }
        t.client.sqlite.prepare('UPDATE agents SET role=? WHERE id=?').run(role, id)
        const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up move run', data: { servingAgent: id, state: 'running' }, actor: t.api.HUMAN })
        return { type: 'agent' as const, id, provedBy: 'an-agent-key' as const, keyHolder: id, sessionId: run.id }
      }
      const writer = actor('paired-move-writer', 'worker'), secretary = actor('paired-move-secretary', 'secretary')
      const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
      readTheRoleCards({ guardActKeys: t.api.GOVERNANCE_GUARDS.flatMap(g => [g.actKey, g.personAct]) })
      const words = 'Made-up owner approves ' + JSON.stringify(scope), title = 'Made-up paired move approval'
      const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Made-up words', data: { body: words, to: [{ kind: 'agent', id: secretary.id }] }, actor: { ...t.api.HUMAN, provedBy: 'the-person-key' } })
      t.api.createRecord({ workspaceId: 'default', kind: 'decision', title, data: { decided_by: THE_TEST_OFFICES_OWNER.id, authority: 'the owner said so', authority_reference: message.id, because: words, extra: { stableBootstrapStop: scope } }, actor: { ...secretary, warrant: { saidBy: THE_TEST_OFFICES_OWNER.id, words, where: 'message:' + message.id, when: localStamp(new Date()), for: [title] } } })
      const server = await import('../src/server/lib/stable-bootstrap-authority.ts'), { moleOffice } = await import('../src/shared/participants.ts')
      const calls: string[] = []
      const reply = (status: number, body: unknown) => ({ status, cut: false, location: null, body: JSON.stringify(body) })
      const officeRequest: any = async (input: any) => {
        calls.push(input.method + ' ' + input.path.split('?', 1)[0])
        if (input.path.startsWith('/api/office/bootstrap-stop-authority')) return reply(input.method === 'POST' ? 201 : 200, input.method === 'GET'
          ? server.readDataFolderMoveAuthority('default', JSON.parse(new URL('http://fixture' + input.path).searchParams.get('request')!), writer)
          : server.reserveDataFolderMoveAuthority('default', input.body, writer))
        if (input.path === '/api/runtime') return reply(200, await fetch(`http://127.0.0.1:${port}/api/runtime`).then(r => r.json()))
        if (input.path === `/api/resources?pgid=${group.pgid}`) return reply(200, { resources: [{ type: 'process', key: String(group.pid), pgid: group.pgid, releasedAt: null, osStartedAt: localStamp(born.startedAt), detail: 'made-up paired supervisor' }] })
        if (input.path === '/api/participants/agent/mole-office') return reply(200, { participant: { id: moleOffice().id, handle: 'mole-office', retired: false } })
        if (input.path === '/api/office/upgrades/notice') {
          const receipt = server.fileDataFolderMoveNotice('default', input.body, writer, () => ({ repository: stable, database, port }))
          return reply(receipt.replayed ? 200 : 201, receipt)
        }
        if (input.path.startsWith('/api/office/upgrades?')) return reply(200, server.lookupDataFolderMoveNotice('default', new URL('http://fixture' + input.path).searchParams.get('sendId')!, writer) ?? { notice: null })
        throw new Error('Unexpected fixture call ' + input.path)
      }
      officeRequest.identity = { agent: writer.id, session: writer.sessionId, project: 'default' }
      const before = new Map([envFile, database, join(data, 'keys.json'), join(data, 'agent-run-keys', 'invented.key'), ...(stableEnv ? [stableEnvFile] : [])].map(file => [file, hash(file)]))
      const m = await import(/* @vite-ignore */ pathToFileURL(join(development, 'tools', 'stable/move-the-data-folder.mjs')).href)
      const cwd = process.cwd()
      let refused: any
      try {
        process.chdir(development)
        refused = await m.runDataFolderMove(target, { officeRequest, home, recoveryParent: root,
          beforeStop: () => { throw new Error('The paired fixture must never reach a stop') },
        }).then((result: unknown) => ({ unexpectedResult: result }), (error: unknown) => error)
      } finally { process.chdir(cwd) }
      expect(refused?.code, String(refused?.message)).toBe('moveDataNotInServingCheckout')
      expect(refused.message).toBe(`The office serves from ${stable}, and its database is in ${data}, which is not that checkout's data folder. That is how a paired office runs, and this move cannot run on a paired office. Nothing was reserved or stopped.`)
      expect(refused.facts).toEqual({ checkout: stable, source: data })
      expect(calls).toEqual(['GET /api/office/bootstrap-stop-authority', 'GET /api/runtime'])
      expect(t.client.sqlite.prepare("SELECT record_id FROM revisions WHERE seq=1 AND json_extract(data,'$.extra.dataFolderMoveReservation') IS NOT NULL").all()).toEqual([])
      expect(t.client.sqlite.prepare("SELECT record_id FROM revisions WHERE seq=1 AND json_extract(data,'$.extra.stableUpgradeNotice.version')=3").all()).toEqual([])
      for (const [file, digest] of before) expect(hash(file), file).toBe(digest)
      expect(existsSync(stableEnvFile)).toBe(stableEnv); expect(existsSync(target)).toBe(false)
      expect(readdirSync(root).some(name => name.startsWith('.data-folder-move-'))).toBe(false)
      expect(bootstrapProcessIdentity(group.pid).startTime).toBe(leader.startTime)
      const health = await fetch(`http://127.0.0.1:${port}/api/health`).then(r => r.json())
      expect(health).toEqual({ ok: true, world: { database, repository: stable, port } })
    } finally {
      if (leader) {
        try { if (bootstrapProcessIdentity(leader.pgid).startTime !== leader.startTime) throw new Error('The fixture group changed'); process.kill(-leader.pgid, 'SIGTERM') }
        catch (error: any) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error }
      }
      if (child) for (let n = 0; n < 200 && child.exitCode === null && child.signalCode === null; n++) await delay(10)
      t.close()
    }
  }, 60_000)
}
/**
 * A process's start as the office's ledger holds it: processById in src/server/lib/resources.ts writes the reader's
 * moment with localStamp, the local time to the second. The move reads the same moment as an ISO time in UTC.
 */
function theLedgersStamp(pid: number, laterBy = 0) {
  const at = linuxProcessReader().processAt(pid)
  if (!at.here || at.unreadable !== undefined) throw new Error(`process ${pid} could not be read`)
  return localStamp(new Date(at.startedAt.getTime() + laterBy))
}
const fixtureCode = `const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
fs.writeFileSync(path.join(process.cwd(),'..','fixture-office-'+process.pid+'.json'),JSON.stringify({pid:process.pid,pgid:process.pid,cmdlineSha256:crypto.createHash('sha256').update(fs.readFileSync('/proc/self/cmdline')).digest('hex')}));
const line=fs.readFileSync('.env','utf8').split(/\\r?\\n/).find(x=>x.startsWith('MOLE_OFFICE_DB='));
const database=path.resolve(line.slice('MOLE_OFFICE_DB='.length));
const fd=fs.openSync(database,'r');
const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,world:{database,repository:process.cwd(),port:server.address().port},process:{pid:process.pid},supervisor:{pid:Number(process.env.FIXTURE_SUPERVISOR_PID)},worker:{started:true,pid:Number(process.env.FIXTURE_WORKER_PID)},repository:{path:process.cwd()},database:{path:database},addresses:{api:'http://127.0.0.1:'+server.address().port}}))});
server.listen(Number(process.env.MOLE_OFFICE_PORT),'127.0.0.1');
process.on('SIGTERM',()=>server.close(()=>{fs.closeSync(fd);process.exit(0)}));`
const workerCode = `const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
fs.writeFileSync(path.join(process.cwd(),'..','fixture-office-'+process.pid+'.json'),JSON.stringify({pid:process.pid,pgid:process.pid,cmdlineSha256:crypto.createHash('sha256').update(fs.readFileSync('/proc/self/cmdline')).digest('hex')}));
setInterval(()=>{},1000)`
/** The made-up supervisor, as tools/serve-dev.mjs in a fixture checkout. It starts the worker and the server, and writes their pids. */
const supervisorCode = `import {spawn} from 'node:child_process';import {readFileSync,renameSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {join} from 'node:path';
writeFileSync(join(process.cwd(),'..','fixture-office-'+process.pid+'.json'),JSON.stringify({pid:process.pid,pgid:process.pid,cmdlineSha256:createHash('sha256').update(readFileSync('/proc/self/cmdline')).digest('hex')}));
const worker=spawn(process.execPath,['-e',${JSON.stringify(workerCode)}],{detached:true,stdio:'ignore'});
const server=spawn(process.execPath,['-e',${JSON.stringify(fixtureCode)}],{detached:true,stdio:'ignore',env:{...process.env,FIXTURE_SUPERVISOR_PID:String(process.pid),FIXTURE_WORKER_PID:String(worker.pid)}});
writeFileSync('fixture-topology.json.partial',JSON.stringify({server:server.pid,worker:worker.pid}));renameSync('fixture-topology.json.partial','fixture-topology.json');
setInterval(()=>{},1000);process.on('SIGTERM',()=>process.exit(0));`
/** The pids of the server and the worker, as the made-up supervisor wrote them into fixture-topology.json in its checkout. */
async function theTopologyTheSupervisorWrote(checkout: string): Promise<{ server: number; worker: number }> {
  for (let n = 0; n < 200 && !existsSync(join(checkout, 'fixture-topology.json')); n++) await delay(15)
  return JSON.parse(readFileSync(join(checkout, 'fixture-topology.json'), 'utf8'))
}
/**
 * `place` is the target's path inside the fixture root. `parent` is a script that starts the supervisor as its child
 * in its own group, given the command and the arguments the way the move's gate is given them.
 */
async function fixture(place: string[] = ['private-data'], parent?: string) {
  const root = mkdtempSync(join(tmpdir(), 'move-fixture-')); folders.push(root)
  const checkout = join(root, 'checkout'), data = join(checkout, 'data'), target = join(root, ...place)
  mkdirSync(join(checkout, 'tools'), { recursive: true }); mkdirSync(join(data, 'agent-run-keys'), { recursive: true }); mkdirSync(join(data, 'backups'))
  const git = spawnSync('git', ['init', '-q', checkout]); expect(git.status).toBe(0)
  const database = join(data, 'invented.db'), db = new Database(database)
  db.exec("CREATE TABLE invented (value TEXT); INSERT INTO invented VALUES ('made up for this fixture')"); db.close()
  writeFileSync(join(data, 'keys.json'), '{"madeUp":"fixture-only"}\n', { mode: 0o600 })
  writeFileSync(join(data, 'agent-run-keys', 'invented.key'), 'fixture-run-material\n', { mode: 0o600 })
  writeFileSync(join(data, 'backups', 'invented.txt'), 'made-up backup companion\n')
  writeFileSync(join(data, 'invented.db.service.log'), 'fixture log\n')
  const envFile = join(checkout, '.env'), envBytes = '# fixture comment\nMOLE_OFFICE_DB=data/invented.db\n\n# keep these bytes\n'
  writeFileSync(envFile, envBytes, { mode: 0o640 }); chmodSync(envFile, 0o640)
  writeFileSync(join(checkout, 'tools', 'serve-dev.mjs'), supervisorCode)
  const backup = join(root, 'database-only.db'), source = new Database(database, { readonly: true })
  try { await source.backup(backup) } finally { source.close() }
  const scope: any = { version: 1, action: 'stop-to-move-the-data-folder', database, port: 0, checkout, targetFolder: target, targetMode: '700', backup: { path: backup, sha256: hash(backup) } }
  // The group dies with this worker even after a SIGKILL. exec keeps the pid, and the record below is
  // read after the supervisor has written its topology, so it holds serve-dev's argv and not the shell's.
  const serveDev = ['tools/serve-dev.mjs', '--built']
  const watched = commandThatStopsWithItsOwner(process.execPath, parent === undefined ? serveDev : ['-e', parent, process.execPath, JSON.stringify(serveDev)])
  const child = spawn(watched.command, watched.args, { cwd: checkout, env: { PATH: process.env.PATH, MOLE_OFFICE_PORT: '0' }, detached: true, stdio: 'ignore' })
  expect(child.pid).toBeTruthy(); processes.add(child.pid!)
  const { currentProcessRecord } = await import('../tools/stable/stable-bootstrap-processes.mjs')
  const childPids = await theTopologyTheSupervisorWrote(checkout)
  const group = currentProcessRecord(child.pid!)
  processes.add(childPids.server); processes.add(childPids.worker)
  const { readListeners } = await import('../tools/stable/stable-bootstrap-support.mjs')
  // Ask the kernel for this recorded fixture's socket, never use an Office port.
  const { execFileSync } = await import('node:child_process')
  for (let n = 0; n < 200 && !scope.port; n++) {
    const output = execFileSync('ss', ['-H', '-ltnp'], { encoding: 'utf8' })
    const line = output.split('\n').find(x => x.includes('pid=' + childPids.server + ','))
    if (line) scope.port = Number(line.trim().split(/\s+/)[3]!.split(':').pop())
    if (!scope.port) await delay(15)
  }
  expect(scope.port).toBeGreaterThan(1024); expect(readListeners([scope.port])[0]!.pids).toContain(childPids.server)
  let reserved = false, consumed = false
  const pin = { id: 'fixture-decision', seq: 1, contentHash: 'a'.repeat(16) }
  // The made-up ledger, read the way GET /api/resources reads it: whole, or one process group with ?pgid=.
  // The supervisor's row as the office answers it: its own local stamp, and the detail as text.
  const ledger: any[] = [{ type: 'process', key: String(group.pid), pgid: group.pgid, releasedAt: null, osStartedAt: theLedgersStamp(group.pid), detail: 'the made-up office supervisor' }]
  const officeRequest: any = async (input: any) => {
    if (input.path.startsWith('/api/office/bootstrap-stop-authority')) {
      if (input.method === 'POST') { if (input.body.outcome) { expect(reserved).toBe(true); consumed = true } else { expect(reserved).toBe(false); reserved = true } }
      return { scope, decision: pin, state: consumed ? 'consumed' : reserved ? 'reserved' : 'available', reservation: reserved ? pin : null, caller: { agent: 'fixture-agent', run: 'fixture-run' }, initiator: reserved ? { agent: 'fixture-agent', run: 'fixture-run' } : null }
    }
    // The row as the office writes it: the group and the start it reads for the process the key names.
    if (input.path === '/api/resources' && input.method === 'POST') {
      const pid = Number(input.body.key)
      ledger.push({ type: 'process', key: input.body.key, pgid: bootstrapProcessIdentity(pid).pgid, releasedAt: null, osStartedAt: theLedgersStamp(pid), detail: input.body.detail })
      return { resource: { id: 'fixture-resource-' + input.body.key } }
    }
    if (input.path === '/api/resources') return { resources: ledger }
    const oneGroup = /^\/api\/resources\?pgid=(\d+)$/.exec(input.path)
    if (oneGroup && input.method === 'GET') return { resources: ledger.filter(row => row.pgid === Number(oneGroup[1])) }
    return (await fetch(`http://127.0.0.1:${scope.port}${input.path}`)).json()
  }
  // A new act for the same scope, as the owner makes one after a move has ended.
  const aNewAct = () => { reserved = false; consumed = false }
  return { root, checkout, data, target, database, scope, pin, aNewAct, group, envFile, envBytes, officeRequest, ledger,
    options: { officeRequest, home: join(root, 'home'), recoveryParent: root, onProcess: (p: any) => processes.add(p.pid), healthTimeoutMs: 5000, stopTimeoutMs: 3000 } }
}
/** The groups the made-up office scripts recorded in the fixture roots, each checked against /proc. */
function recordedOfficeGroups() {
  const groups = new Set<number>(), ownGroup = bootstrapProcessIdentity(process.pid).pgid
  for (const root of folders) {
    let entries: string[]
    try { entries = readdirSync(root) } catch (error: any) { if (error.code === 'ENOENT') continue; throw error }
    for (const name of entries) {
      if (!/^fixture-office-\d+\.json$/.test(name)) continue
      try {
        const record = JSON.parse(readFileSync(join(root, name), 'utf8'))
        if (!Number.isSafeInteger(record.pid) || !Number.isSafeInteger(record.pgid) || record.pgid === ownGroup) continue
        if (bootstrapProcessIdentity(record.pid).pgid !== record.pgid) continue
        const cmdline = readFileSync(`/proc/${record.pid}/cmdline`)
        if (createHash('sha256').update(cmdline).digest('hex') !== record.cmdlineSha256) continue
        groups.add(record.pgid)
      } catch (error: any) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error }
    }
  }
  return groups
}
afterEach(async () => {
  // A failed assertion can return before the move tool records the target office. Each made-up
  // office script wrote its own pid and group into its fixture root, so stop only those groups.
  // The test's own group is never signalled.
  for (const pgid of recordedOfficeGroups()) { try { process.kill(-pgid, 'SIGTERM') } catch (e: any) { if (e.code !== 'ESRCH') throw e } }
  const ownGroup = bootstrapProcessIdentity(process.pid).pgid, groups = new Set<number>()
  for (const pid of processes) { try { const pgid = bootstrapProcessIdentity(pid).pgid; if (pgid !== ownGroup) groups.add(pgid) } catch (error: any) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error } }
  for (const pgid of groups) { try { process.kill(-pgid, 'SIGTERM') } catch (e: any) { if (e.code !== 'ESRCH') throw e } }
  for (let n = 0; n < 200; n++) { if (![...processes].some(pid => { try { return !readFileSync(`/proc/${pid}/stat`, 'utf8').includes(') Z ') } catch { return false } })) break; await delay(10) }
  processes.clear()
  for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true })
})
it('moves the folder, writes the absolute database line, and verifies the running target', async () => {
  const f = await fixture(), beforeKeys = hash(join(f.data, 'keys.json')), beforeRun = hash(join(f.data, 'agent-run-keys', 'invented.key'))
  const m = await import(/* @vite-ignore */ implementation)
  const result = await m.moveTheDataFolder(f.target, f.options)
  expect(result.state, JSON.stringify(result)).toBe('moved')
  // The new path is a new world, so the move says how the gate-count spool is handed to it (wave 13q item 1h).
  expect(result.gateCountSpool).toEqual(theGateCountSpoolStep({ database: join(f.target, 'invented.db'), home: f.options.home, change: 'moved' }))
  expect(existsSync(join(f.target, 'invented.db'))).toBe(true)
  expect(readFileSync(f.envFile, 'utf8')).toContain(`MOLE_OFFICE_DB=${join(f.target, 'invented.db')}`)
  expect(result.env.before.withoutTheLine).toBe(result.env.after.withoutTheLine)
  expect(statSync(f.envFile).mode & 0o777).toBe(0o640)
  expect(hash(join(f.target, 'keys.json'))).toBe(beforeKeys); expect(hash(join(f.target, 'agent-run-keys', 'invented.key'))).toBe(beforeRun)
  expect(statSync(f.target).mode & 0o777).toBe(0o700); expect(readdirSync(f.data)).toEqual([])
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).world.database).toBe(join(f.target, 'invented.db'))
  const rows = readFileSync(join(result.recovery, 'journal.jsonl'), 'utf8').trim().split('\n').map(x => JSON.parse(x))
  const steps = rows.filter(x => x.phase === 'done').map(x => x.step)
  expect(steps.indexOf('write-env')).toBeLessThan(steps.indexOf('start-target'))
  const checked = rows.findIndex(x => x.step === 'check-no-holders' && x.phase === 'attempt')
  const guard = rows.findIndex(x => x.step === 'exclusive-lock-guard' && x.phase === 'taken')
  const hashed = rows.findIndex(x => x.step === 'hash-stopped-files' && x.phase === 'attempt')
  expect(checked).toBeGreaterThan(-1); expect(guard).toBeGreaterThan(checked); expect(hashed).toBeGreaterThan(guard)
  expect(rows[guard].before.sha256).toBe(rows[guard].after.sha256)
})
// The place: ~/.local/share/mole-office/.
// The made-up home stands in for the owner's. It is inside HOME and outside HOME/PROJECTS, which no case above
// moves to, and its parent .local/share exists before the move, as the tool requires of a target's parent.
it('moves the folder to the place the owner named, inside the home, with the recovery folder beside it', async () => {
  const f = await fixture(['home', '.local', 'share', 'mole-office'])
  mkdirSync(dirname(f.target), { recursive: true })
  const m = await import(/* @vite-ignore */ implementation)
  const result = await m.moveTheDataFolder(f.target, { ...f.options, recoveryParent: undefined })
  expect(result.state, JSON.stringify(result)).toBe('moved')
  expect(readFileSync(f.envFile, 'utf8')).toContain(`MOLE_OFFICE_DB=${join(f.target, 'invented.db')}`)
  expect(statSync(f.target).mode & 0o777).toBe(0o700); expect(readdirSync(f.data)).toEqual([])
  // With no recovery folder named, the journal goes beside the target, in .local/share.
  expect(dirname(result.recovery)).toBe(dirname(f.target)); expect(statSync(result.recovery).mode & 0o777).toBe(0o700)
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).world.database).toBe(join(f.target, 'invented.db'))
})
it('refuses the place as the owner wrote it, so the act and the command must name the absolute folder', async () => {
  const { requireMoveTarget } = await import('../tools/stable/data-folder-move-preflight.mjs')
  for (const spelled of ['~/.local/share/mole-office/', '/srv/example-user/.local/share/mole-office/']) {
    expect(() => requireMoveTarget(spelled), spelled).toThrow(expect.objectContaining({ code: 'moveTargetRequired' }))
  }
  expect(requireMoveTarget('/srv/example-user/.local/share/mole-office')).toBe('/srv/example-user/.local/share/mole-office')
})
for (const failure of ['compare-moved-files', 'write-env', 'health-target']) it(`restores the original folder and exact .env after failure at ${failure}`, async () => {
  const f = await fixture(), before = hash(f.envFile), keys = hash(join(f.data, 'keys.json'))
  const m = await import(/* @vite-ignore */ implementation)
  const result = await m.moveTheDataFolder(f.target, { ...f.options, onStep: ({ step, phase }: any) => { if (step === failure && phase === (failure === 'health-target' ? 'after' : 'before')) throw new Error('injected fixture failure') } })
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(result).not.toHaveProperty('gateCountSpool')
  expect(existsSync(f.database)).toBe(true); expect(existsSync(f.target)).toBe(false)
  expect(hash(f.envFile)).toBe(before); expect(readFileSync(f.envFile, 'utf8')).toBe(f.envBytes)
  expect(hash(join(f.data, 'keys.json'))).toBe(keys)
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).world.database).toBe(f.database)
  const rows = readFileSync(join(result.recovery, 'journal.jsonl'), 'utf8').trim().split('\n').map(x => JSON.parse(x))
  const restore = rows.findIndex(x => x.step === 'restore-data-folder' && x.phase === 'attempt')
  const guard = rows.findIndex((x, at) => at > restore && x.step === 'exclusive-lock-guard' && x.phase === 'taken')
  expect(guard, `no rollback guard after restore-data-folder at ${failure}`).toBeGreaterThan(restore)
  if (failure === 'write-env') {
    // No target office was started, so the rollback guard sees the bytes the manifest recorded.
    expect(rows[guard].before.sha256).toBe(rows[guard].after.sha256)
    expect(rows[guard].before.shm).toEqual(rows[guard].after.shm)
    expect(rows.some(x => x.step === 'compare-restored-files' && x.phase === 'done')).toBe(true)
  }
})
it('detects a changed existing run key after start and retains recovery evidence', async () => {
  const f = await fixture(), m = await import(/* @vite-ignore */ implementation)
  const result = await m.moveTheDataFolder(f.target, { ...f.options, onStep: ({ step, phase }: any) => {
    if (step === 'compare-started-keys' && phase === 'before') writeFileSync(join(f.target, 'agent-run-keys', 'invented.key'), 'changed fixture bytes')
  } })
  expect(result.state).toBe('not-restored'); expect(result.failure).toMatch(/hash|differ|changed/i)
  expect(result).not.toHaveProperty('gateCountSpool')
  expect(existsSync(result.recovery)).toBe(true)
})
for (const problem of ['nonempty-target', 'missing-env-line', 'two-env-lines']) it(`leaves the real fixture office running when refusing ${problem}`, async () => {
  const f = await fixture(), m = await import(/* @vite-ignore */ implementation)
  if (problem === 'nonempty-target') { mkdirSync(f.target); writeFileSync(join(f.target, 'keep.txt'), 'keep me') }
  if (problem === 'missing-env-line') writeFileSync(f.envFile, '# no database setting\n')
  if (problem === 'two-env-lines') writeFileSync(f.envFile, f.envBytes + 'MOLE_OFFICE_DB=data/other.db\n')
  const bytes = readFileSync(f.envFile), keys = hash(join(f.data, 'keys.json'))
  await expect(m.moveTheDataFolder(f.target, f.options)).rejects.toThrow()
  expect(existsSync(f.database)).toBe(true); expect(readFileSync(f.envFile)).toEqual(bytes)
  expect(hash(join(f.data, 'keys.json'))).toBe(keys)
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).ok).toBe(true)
  expect(readdirSync(f.root).some(x => x.startsWith('.data-folder-move-'))).toBe(false)
})
it('keeps a healthy completed move when resource registration is refused', async () => {
  const f = await fixture(), m = await import(/* @vite-ignore */ implementation)
  const result = await m.moveTheDataFolder(f.target, { ...f.options, officeRequest: async (input: any) => {
    if (input.path === '/api/resources' && input.method === 'POST') throw new Error('fixture registration refused')
    return f.officeRequest(input)
  } })
  expect(result.state).toBe('moved'); expect(result.registered).toBe(false); expect(result.exitCode).toBe(1)
  expect(result.unregistered[0].process.pgid).toBeGreaterThan(1); expect(result.unregistered[0].process.startTime).toMatch(/^\d+$/)
  expect(result.unregistered[0].journalEntry).toBeGreaterThan(0)
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).world.database).toBe(join(f.target, 'invented.db'))
  expect(existsSync(join(f.target, 'invented.db'))).toBe(true); expect(readdirSync(f.data)).toEqual([])
})
/**
 * The made-up office's answers as the request helper hands them to the command: the status and the body as
 * text, cut at THE_LONGEST_REPLY. `longer` makes one answer longer than that, so the helper cuts it.
 */
function throughTheRequestHelper(officeRequest: any, asked: string[] = [], longer: (input: any) => boolean = () => false) {
  return (request: any) => askTheOffice(request, {
    env: { MOLE_OFFICE_API: 'http://fixture.invalid', MOLE_OFFICE_AGENT: 'fixture-agent', MOLE_OFFICE_SESSION: 'fixture-run', MOLE_OFFICE_WORKSPACE: 'default' },
    fetchImpl: async (url: string | URL | Request, init?: RequestInit) => {
      const where = new URL(String(url)), input = { method: init?.method ?? 'GET', path: where.pathname + where.search, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined }
      asked.push(`${input.method} ${input.path}`)
      const answer = await officeRequest(input)
      return new Response(JSON.stringify(longer(input) ? { ...answer, padding: 'x'.repeat(THE_LONGEST_REPLY) } : answer), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
}
// The owner's office holds more ledger rows than the helper hands back whole, so the move once refused there.
// The made-up groups are above the kernel's largest pid (2^22), so no row here can name a real process.
it('finds the recorded group in a ledger longer than the request helper hands back', async () => {
  const f = await fixture(), m = await import(/* @vite-ignore */ implementation), asked: string[] = []
  for (let n = 0; n < 400; n++) f.ledger.push({ type: 'process', key: String(5_000_000 + n), pgid: 5_000_000 + n, releasedAt: null, osStartedAt: '2026-10-19 09:00:00', detail: 'a made-up process of another session '.repeat(4) })
  expect(JSON.stringify({ resources: f.ledger }).length).toBeGreaterThan(THE_LONGEST_REPLY)
  const prepared = await m.inspectDataFolderMove(f.target, { ...f.options, officeRequest: throughTheRequestHelper(f.officeRequest, asked) })
  expect(prepared.topology.supervisor.pid).toBe(f.group.pid)
  expect(prepared.topology.records.map((r: any) => r.pid)).toContain(f.group.pid)
  expect(asked).toContain(`GET /api/resources?pgid=${f.group.pgid}`)
  expect(asked).not.toContain('GET /api/resources')
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).world.database).toBe(f.database)
})
// The owner's office holds the supervisor's start as its local stamp, and the machine reads it as an ISO time. The
// two are the same moment written two ways, and the move once compared them as strings and never found the row.
it('finds the supervisor by the start the ledger holds, written differently from the machine\'s reading', async () => {
  const f = await fixture(), m = await import(/* @vite-ignore */ implementation)
  expect(f.ledger[0].osStartedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  const reading = theProcessAt(f.group.pid)
  expect(reading.here && reading.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  const prepared = await m.inspectDataFolderMove(f.target, f.options)
  expect(prepared.topology.supervisor.pid).toBe(f.group.pid)
  expect(prepared.topology.records[0].pid).toBe(f.group.pid)
})
// A pid that came round again is a different process with another start, so the move stops nothing for it.
it('refuses a row whose start is not the running process\'s, before any stop', async () => {
  const f = await fixture(), m = await import(/* @vite-ignore */ implementation), bytes = readFileSync(f.envFile)
  f.ledger[0].osStartedAt = theLedgersStamp(f.group.pid, 1000)
  const refused = await m.moveTheDataFolder(f.target, f.options).then(() => null, (error: any) => error)
  expect(refused?.code, String(refused?.message)).toBe('moveProcessRefused')
  expect(refused.moveStopped === undefined || refused.moveStopped === false).toBe(true)
  expect(existsSync(f.database)).toBe(true); expect(readFileSync(f.envFile)).toEqual(bytes)
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).world.database).toBe(f.database)
})
/** The move's hash and manifest readers consume every byte across their one-MiB boundaries. */
it('hashes move files across chunk boundaries and refuses a changed later chunk', async () => {
  const root = mkdtempSync(join(tmpdir(), 'move-hash-')); folders.push(root)
  const database = join(root, 'invented.db')
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 31, 0x52)
  bytes[1024 * 1024] = 0x31
  bytes[2 * 1024 * 1024] = 0x32
  writeFileSync(database, bytes)
  writeFileSync(join(root, 'keys.json'), '{"fixture":true}\n')
  const { hashFile, fileManifest, compareManifest } = await import('../tools/stable/data-folder-move-files.mjs')
  const { theFileHash } = await import('../tools/database-holders.mjs')
  expect(hashFile(database)).toBe(createHash('sha256').update(bytes).digest('base64'))
  expect(theFileHash(database)).toEqual({ sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length })
  const manifest = fileManifest(root, database)
  expect(() => compareManifest(root, manifest, database)).not.toThrow()
  bytes[2 * 1024 * 1024 + 3] = 0x33
  writeFileSync(database, bytes)
  expect(() => compareManifest(root, manifest, database)).toThrow(expect.objectContaining({ code: 'moveHashDiffers' }))
})
const cutAnswers: Array<[string, string, (input: any) => boolean]> = [
  ['the owner act', '/api/office/bootstrap-stop-authority', input => input.method === 'GET' && input.path.startsWith('/api/office/bootstrap-stop-authority?')],
  ['the runtime', '/api/runtime', input => input.path === '/api/runtime'],
  ['the ledger', '/api/resources', input => input.method === 'GET' && input.path.startsWith('/api/resources')],
  ['the reservation', '/api/office/bootstrap-stop-authority', input => input.method === 'POST' && input.path === '/api/office/bootstrap-stop-authority' && !input.body.outcome],
]
for (const [what, path, longer] of cutAnswers) it(`refuses a cut answer about ${what} with its own refusal, before any stop`, async () => {
  const f = await fixture(), m = await import(/* @vite-ignore */ implementation), bytes = readFileSync(f.envFile)
  const refused = await m.moveTheDataFolder(f.target, { ...f.options, officeRequest: throughTheRequestHelper(f.officeRequest, [], longer) }).then(() => null, (error: any) => error)
  expect(refused?.code, String(refused?.message)).toBe('moveOfficeAnswerCut')
  expect(refused.message).toBe(`The office's answer to ${path} was cut, so the move cannot read it whole.`)
  expect(refused.moveStopped === undefined || refused.moveStopped === false).toBe(true)
  expect(existsSync(f.database)).toBe(true); expect(readFileSync(f.envFile)).toEqual(bytes)
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).world.database).toBe(f.database)
})
it('keeps a healthy completed move and names the cut when the registration answer is cut', async () => {
  const f = await fixture(), m = await import(/* @vite-ignore */ implementation)
  const result = await m.moveTheDataFolder(f.target, { ...f.options, officeRequest: throughTheRequestHelper(f.officeRequest, [], input => input.method === 'POST' && input.path === '/api/resources') })
  expect(result.state, JSON.stringify(result)).toBe('moved'); expect(result.registered).toBe(false); expect(result.exitCode).toBe(1)
  expect(result.unregistered[0].reason).toBe("The office's answer to /api/resources was cut, so the move cannot read it whole.")
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).world.database).toBe(join(f.target, 'invented.db'))
})
// The owner's backups keep unchanged files as hard links to the previous backup's, inside data/backups/. On 20 October
// 2026 the move stopped the office, refused that folder's first linked file and restored it. Here three made-up backups
// link their files to each other: one file has three names, one has two, and one has a single name.
function linkedBackups(data: string) {
  const names = [1, 2, 3].map(n => `backups/mole-office-${n}.files/avatars`)
  for (const name of names) mkdirSync(join(data, name), { recursive: true })
  writeFileSync(join(data, names[0]!, 'in-three.png'), 'made-up picture kept by three backups\n')
  writeFileSync(join(data, names[1]!, 'in-two.png'), 'made-up picture kept by two backups\n')
  writeFileSync(join(data, names[2]!, 'in-one.png'), 'made-up picture kept by one backup\n')
  linkSync(join(data, names[0]!, 'in-three.png'), join(data, names[1]!, 'in-three.png'))
  linkSync(join(data, names[0]!, 'in-three.png'), join(data, names[2]!, 'in-three.png'))
  linkSync(join(data, names[1]!, 'in-two.png'), join(data, names[2]!, 'in-two.png'))
  return [names.map(name => name + '/in-three.png'), names.slice(1).map(name => name + '/in-two.png'), [names[2] + '/in-one.png']]
}
it('moves backups whose files are hard links to each other, and every link of each file stays inside', async () => {
  const f = await fixture(), m = await import(/* @vite-ignore */ implementation), groups = linkedBackups(f.data)
  const bytes = groups.map(group => hash(join(f.data, group[0]!)))
  // The preflight's walk counts what the move will carry, by lstat alone: 11 names, 8 files, 2 of them with 5 names.
  const sizes = new Map(readdirSync(f.data, { recursive: true, encoding: 'utf8' }).map(name => lstatSync(join(f.data, name))).filter(stat => stat.isFile()).map(stat => [stat.ino, stat.size]))
  const prepared = await m.inspectDataFolderMove(f.target, f.options)
  expect(prepared.files).toEqual({ names: 11, files: 8, linkedFiles: 2, linkedNames: 5, bytes: [...sizes.values()].reduce((sum, size) => sum + size, 0) })
  const result = await m.moveTheDataFolder(f.target, f.options)
  expect(result.state, JSON.stringify(result)).toBe('moved')
  groups.forEach((group, n) => {
    const inodes = new Set(group.map(name => lstatSync(join(f.target, name)).ino))
    expect(inodes.size, group.join(', ')).toBe(1)
    expect(lstatSync(join(f.target, group[0]!)).nlink, group.join(', ')).toBe(group.length)
    expect(hash(join(f.target, group[0]!))).toBe(bytes[n])
  })
  expect(readdirSync(f.data)).toEqual([])
  const rows = readFileSync(join(result.recovery, 'journal.jsonl'), 'utf8').trim().split('\n').map(x => JSON.parse(x))
  expect(rows.some(x => x.step === 'compare-moved-files' && x.phase === 'done')).toBe(true)
  const hashes = JSON.parse(readFileSync(join(result.recovery, 'hashes.json'), 'utf8'))
  for (const group of groups) for (const name of group) expect(hashes[name], name).toBe(hash(join(f.target, group[0]!)))
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).world.database).toBe(join(f.target, 'invented.db'))
})
it('refuses a file with a hard link outside the data folder with its own refusal, which names the file and its links', async () => {
  const root = mkdtempSync(join(tmpdir(), 'move-links-')); folders.push(root)
  const data = join(root, 'data'), database = join(data, 'invented.db')
  mkdirSync(data); writeFileSync(database, 'made-up database bytes\n'); writeFileSync(join(data, 'keys.json'), '{"madeUp":"fixture-only"}\n')
  linkedBackups(data)
  const { fileManifest } = await import('../tools/stable/data-folder-move-files.mjs')
  expect(Object.keys(fileManifest(data, database))).toHaveLength(8)
  const linked = join(data, 'backups', 'mole-office-2.files', 'avatars', 'in-two.png')
  linkSync(linked, join(root, 'a-name-outside.png'))
  expect(() => fileManifest(data, database)).toThrow(expect.objectContaining({ code: 'moveFileLinkedOutside',
    message: `The file ${linked} has 3 hard links, but the walk found only 2 of them in the data folder. A link outside the folder would be left behind, so the move refuses.` }))
})
// The move walked the data folder only after the stop, so the owner's office was stopped, refused at the first linked
// file and restored. The preflight walks it first, by lstat, and refuses while the office still runs.
it('refuses a file with a hard link outside the data folder in the preflight, before the reservation and the stop', async () => {
  const f = await fixture(), m = await import(/* @vite-ignore */ implementation), asked: string[] = [], bytes = readFileSync(f.envFile)
  linkedBackups(f.data)
  const linked = join(f.data, 'backups', 'mole-office-2.files', 'avatars', 'in-two.png')
  linkSync(linked, join(f.root, 'a-name-outside.png'))
  const officeRequest = (input: any) => { asked.push(`${input.method} ${input.path}`); return f.officeRequest(input) }
  const inspected = await m.inspectDataFolderMove(f.target, { ...f.options, officeRequest }).then(() => null, (error: any) => error)
  expect(inspected?.code, String(inspected?.message)).toBe('moveFileLinkedOutside')
  const refused = await m.moveTheDataFolder(f.target, { ...f.options, officeRequest }).then(() => null, (error: any) => error)
  expect(refused?.code, String(refused?.message)).toBe('moveFileLinkedOutside')
  expect(refused.message).toBe(`The file ${linked} has 3 hard links, but the walk found only 2 of them in the data folder. A link outside the folder would be left behind, so the move refuses.`)
  expect(refused.moveStopped === undefined || refused.moveStopped === false).toBe(true)
  expect(asked.filter(x => x.startsWith('POST '))).toEqual([])
  expect(existsSync(f.database)).toBe(true); expect(readFileSync(f.envFile)).toEqual(bytes)
  expect(readdirSync(f.root).some(x => x.startsWith('.data-folder-move-'))).toBe(false)
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).world.database).toBe(f.database)
})
/** The act's first revision, as GET /api/records/<id>/revisions/1 answers it. `change` makes it into another record. */
function firstRevision(f: any, change: (content: any) => void = () => {}) {
  const content = { kind: 'decision', title: 'Made-up move decision', summary: null, data: { extra: { stableBootstrapStop: structuredClone(f.scope) } }, deletedAt: null }
  change(content)
  return { recordId: f.pin.id, seq: 1, contentHash: f.pin.contentHash, content }
}
/**
 * The owner's office after a move was restored and a new act was made for the same folder: two acts name the folder,
 * so a lookup by the target is refused as ambiguous. A request that names one act is answered with the scope and the
 * pin it sent.
 */
function twoActsForTheFolder(f: any, revision: any, asked: any[]) {
  return async (input: any) => {
    asked.push(input)
    if (input.method === 'GET' && input.path === `/api/records/${f.pin.id}/revisions/1`) return revision
    if (input.method === 'GET' && input.path.startsWith('/api/office/bootstrap-stop-authority?')) {
      const request = JSON.parse(new URL(input.path, 'http://fixture.invalid').searchParams.get('request')!)
      if (!request.decision) return { status: 409, cut: false, location: null, body: JSON.stringify({ code: 'dataMoveActAmbiguous', error: 'Two made-up acts name this folder.' }) }
      return { ...(await f.officeRequest(input)), scope: request.scope, decision: request.decision }
    }
    return f.officeRequest(input)
  }
}
const authorityRead = (input: any) => JSON.parse(new URL(input.path, 'http://fixture.invalid').searchParams.get('request')!)
it('reads a named act from its first revision and asks for that act alone, when two acts name the folder', async () => {
  const f = await fixture(), m = await import(/* @vite-ignore */ implementation), asked: any[] = []
  const officeRequest = twoActsForTheFolder(f, firstRevision(f), asked)
  await expect(m.inspectDataFolderMove(f.target, { ...f.options, officeRequest })).rejects.toMatchObject({ code: 'dataMoveActAmbiguous' })
  const prepared = await m.inspectDataFolderMove(f.target, { ...f.options, officeRequest, act: f.pin.id })
  expect(prepared.authority.decision).toEqual(f.pin); expect(prepared.scope).toEqual(f.scope)
  asked.length = 0
  const result = await m.moveTheDataFolder(f.target, { ...f.options, officeRequest, act: f.pin.id })
  expect(result.state, JSON.stringify(result)).toBe('moved')
  const revision = asked.findIndex(x => x.path === `/api/records/${f.pin.id}/revisions/1`)
  const read = asked.findIndex(x => x.method === 'GET' && x.path.startsWith('/api/office/bootstrap-stop-authority?'))
  const reserve = asked.find(x => x.method === 'POST' && x.path === '/api/office/bootstrap-stop-authority' && !x.body.outcome)
  expect(revision).toBeGreaterThanOrEqual(0); expect(revision).toBeLessThan(read)
  expect(authorityRead(asked[read])).toEqual({ scope: f.scope, decision: f.pin, sendId: reserve.body.sendId })
  expect(reserve.body).toEqual({ scope: f.scope, decision: f.pin, sendId: expect.stringMatching(/^data-folder-move-/) })
})
it('refuses a named act that is not a move decision, or that names another folder, before any write', async () => {
  const f = await fixture(), m = await import(/* @vite-ignore */ implementation), asked: any[] = []
  const cases: Array<[string, any, string]> = [
    ['../' + f.pin.id, firstRevision(f), 'moveActNotADecision'],
    [f.pin.id, firstRevision(f, content => { content.kind = 'note' }), 'moveActNotADecision'],
    [f.pin.id, firstRevision(f, content => { delete content.data.extra }), 'moveActNotADecision'],
    [f.pin.id, firstRevision(f, content => { content.data.extra.stableBootstrapStop.targetFolder = join(f.root, 'elsewhere') }), 'moveScopeDiffers'],
  ]
  for (const [act, revision, code] of cases) {
    const before = asked.length
    const refused = await m.moveTheDataFolder(f.target, { ...f.options, officeRequest: twoActsForTheFolder(f, revision, asked), act }).then(() => null, (error: any) => error)
    expect(refused?.code, String(refused?.message)).toBe(code)
    if (act !== f.pin.id) expect(asked.length, 'a malformed act is not put into a path').toBe(before)
  }
  expect(asked.filter(x => x.method !== 'GET')).toEqual([])
  expect(existsSync(f.database)).toBe(true); expect(readdirSync(f.root).some(x => x.startsWith('.data-folder-move-'))).toBe(false)
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).world.database).toBe(f.database)
})
/** The supervisor's own row, as serve-dev writes it when it starts. */
async function theSupervisorsOwnRow(f: any) {
  const health = await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json()), supervisor = bootstrapProcessIdentity(health.supervisor.pid)
  f.ledger.push({ type: 'process', key: String(supervisor.pid), pgid: supervisor.pgid, releasedAt: null, osStartedAt: theLedgersStamp(supervisor.pid), detail: 'the made-up office supervisor' })
  return supervisor
}
// The move starts the office under its gate: the gate leads the group and starts the supervisor as its child. After a
// restore, and after a move, the group holds two live rows: the gate's, which the move registers, and the supervisor's
// own. The owner's office refused the next preflight on that shape on 20 October 2026.
it('moves an office that a restored move started under its gate', async () => {
  const f = await fixture(), m = await import(/* @vite-ignore */ implementation)
  const restored = await m.moveTheDataFolder(f.target, { ...f.options, onStep: ({ step, phase }: any) => { if (step === 'write-env' && phase === 'before') throw new Error('injected fixture failure') } })
  expect(restored.state, JSON.stringify(restored)).toBe('restored'); expect(restored.registered).toBe(true)
  const supervisor = await theSupervisorsOwnRow(f), gate = bootstrapProcessIdentity(supervisor.ppid)
  expect(gate.pgid).toBe(gate.pid); expect(supervisor.pgid).toBe(gate.pid)
  expect(f.ledger.filter(row => row.pgid === gate.pid).map(row => row.key).sort()).toEqual([String(gate.pid), String(supervisor.pid)].sort())
  f.aNewAct()
  const prepared = await m.inspectDataFolderMove(f.target, f.options)
  expect(prepared.topology.records.slice(0, 2).map((r: any) => r.pid)).toEqual([gate.pid, supervisor.pid])
  const moved = await m.moveTheDataFolder(f.target, f.options)
  expect(moved.state, JSON.stringify(moved)).toBe('moved')
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).world.database).toBe(join(f.target, 'invented.db'))
})
// The same shape, but the parent is not the move's gate: every other reading matches, and only the script differs.
it('refuses a group led by the supervisor\'s parent when that parent is not the move\'s gate', async () => {
  const stranger = "require('node:child_process').spawn(process.argv[1],JSON.parse(process.argv[2]),{stdio:'ignore'});setInterval(()=>{},1000)"
  const f = await fixture(['private-data'], stranger), m = await import(/* @vite-ignore */ implementation), bytes = readFileSync(f.envFile)
  const supervisor = await theSupervisorsOwnRow(f)
  expect(supervisor.ppid).toBe(f.group.pid); expect(supervisor.pgid).toBe(f.group.pid)
  const refused = await m.moveTheDataFolder(f.target, f.options).then(() => null, (error: any) => error)
  expect(refused?.code, String(refused?.message)).toBe('moveProcessRefused')
  expect(existsSync(f.database)).toBe(true); expect(readFileSync(f.envFile)).toEqual(bytes)
  expect((await fetch(`http://127.0.0.1:${f.scope.port}/api/health`).then(r => r.json())).world.database).toBe(f.database)
})
