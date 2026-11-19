// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, describe, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { THE_HOLDER_ENTRY } from '../src/config/settings.mjs'
import { theDatabaseHolders } from '../tools/database-holders.mjs'
import { bootstrapProcessIdentity, descendantsOf } from '../tools/stable/stable-bootstrap-support.mjs'
import { currentProcessRecord, isTheGateOf } from '../tools/stable/stable-bootstrap-processes.mjs'
import * as upgradeProcesses from '../tools/stable/stable-upgrade-processes.mjs'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'
import { aPlace, folders as places, groups as terminals, openThroughTheHolder, stopEverything, type Place } from './terminal-holder-stand.ts'

const root = resolve(import.meta.dirname, '..')
const thisNode = realpathSync(process.execPath)
const shell = realpathSync('/bin/sh')
type Group = { pgid: number; startTime: string }
const groups: Group[] = []
const folders: string[] = []
const children: Array<{ child: ChildProcess; ended: Promise<void> }> = []
const gateText = readFileSync(join(root, 'tools/stable/stable-bootstrap-processes.mjs'), 'utf8').match(/const GATE = `([\s\S]*?)`/)![1]!

function scratch() {
  const folder = mkdtempSync(join(tmpdir(), 'upgrade-tsx-'))
  folders.push(folder)
  return folder
}

async function until(check: () => boolean, reason: string) {
  const deadline = Date.now() + 10_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(reason)
    await delay(10)
  }
}

function liveMembers(pgid: number) {
  return readdirSync('/proc').filter(name => /^\d+$/.test(name)).flatMap(name => {
    try {
      const row = bootstrapProcessIdentity(Number(name))
      return row.pgid === pgid && !['Z', 'X'].includes(row.state!) ? [row] : []
    } catch (error: any) { if (['ENOENT', 'ESRCH'].includes(error.code)) return []; throw error }
  })
}

async function stopRecordedGroup(group: Group) {
  if (liveMembers(group.pgid).length) {
    const leader = bootstrapProcessIdentity(group.pgid)
    expect(leader.pgid).toBe(group.pgid)
    expect(leader.startTime).toBe(group.startTime)
    process.kill(-group.pgid, 'SIGTERM')
  }
  await until(() => liveMembers(group.pgid).length === 0, 'The recorded fixture group did not empty.')
}

function startUpgradeProgram(command: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  const child = spawn(command, args, { cwd, detached: true, stdio: 'ignore', env: { PATH: dirname(process.execPath) + ':' + process.env.PATH, HOME: cwd, TMPDIR: process.env.TMPDIR, ...extraEnv } })
  const ended = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('exit', () => resolve()) })
  children.push({ child, ended })
  if (!child.pid) throw new Error('The fixture process did not start.')
  const identity = bootstrapProcessIdentity(child.pid)
  groups.push({ pgid: identity.pgid, startTime: identity.startTime! })
  return { child, ended, pid: child.pid }
}

/**
 * A made-up office of supervisor, server and worker. With `place`, the server has the person's press for a terminal
 * holder: POST /holder calls the real startATerminalHolder, with this checkout's own howToStart('holder') and REPO_ROOT
 * unless the body names another `how` or `cwd`. The checkout carries a copy of the settings and a link to the real
 * holder's entry, so the real holder runs. POST /stranger starts another child of the server in a group of its own.
 */
async function startUpgradeOffice(argv0?: string, extraWorker = false, place?: Place) {
  const folder = scratch(), stable = join(folder, 'stable')
  for (const name of ['tools', 'src/server', 'src/worker']) mkdirSync(join(stable, name), { recursive: true })
  symlinkSync(join(root, 'node_modules'), join(stable, 'node_modules'))
  if (place) {
    copyBootstrapSettings(stable)
    mkdirSync(dirname(join(stable, THE_HOLDER_ENTRY)), { recursive: true })
    symlinkSync(join(root, THE_HOLDER_ENTRY), join(stable, THE_HOLDER_ENTRY))
  }
  const listener = createServer()
  await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = (listener.address() as { port: number }).port
  await new Promise<void>(resolve => listener.close(() => resolve()))
  if (thePortsATestKeepsOff().includes(port)) return startUpgradeOffice(argv0, extraWorker)
  const recordGroup = `const recordGroup=pid=>{const stat=readFileSync('/proc/'+pid+'/stat','utf8');const fields=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\\s+/);appendFileSync('groups.jsonl',JSON.stringify({pgid:Number(fields[2]),startTime:fields[19]})+'\\n')};`
  writeFileSync(join(stable, 'tools/serve-dev.mjs'), `
import {spawn} from 'node:child_process';import {readFileSync,appendFileSync} from 'node:fs';
${recordGroup}
const child=spawn(process.execPath,['--import','tsx','src/server/index.ts','--stop-with-pid='+process.pid],{detached:true,stdio:'inherit',env:process.env});
recordGroup(child.pid);child.on('exit',code=>process.exit(code??1));
`)
  writeFileSync(join(stable, 'src/server/index.ts'), `
import {spawn} from 'node:child_process';import {readFileSync,appendFileSync,writeFileSync} from 'node:fs';import {dirname,join} from 'node:path';import http from 'node:http';
${recordGroup}
const stopWith: string='--stop-with-pid='+process.pid;
const env={...process.env,PATH:dirname(process.execPath)+':'+process.env.PATH};
const child=process.env.FIXTURE_ARGV0
 ?spawn('bash',['-c','exec -a "$FIXTURE_ARGV0" "$0" "$@"','/bin/sh','-c','sleep 600; :','src/worker/index.ts',stopWith],{detached:true,stdio:'ignore',env})
 :spawn(join(process.cwd(),'node_modules/.bin/tsx'),['src/worker/index.ts',stopWith],{detached:true,stdio:'ignore',env});
recordGroup(child.pid);
const extra=process.env.FIXTURE_EXTRA_WORKER==='yes'?spawn(process.execPath,['-e','setInterval(()=>{},1000)','src/worker/index.ts',stopWith],{stdio:'ignore',env}):null;
const asked=req=>new Promise(done=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>done(body?JSON.parse(body):{}))});
const press=(req,res)=>asked(req).then(body=>Promise.all([import('../config/settings.mjs'),import(${JSON.stringify(pathToFileURL(join(root, 'src/config/the-terminal-holder.mjs')).href)})]).then(([settings,holder])=>holder.startATerminalHolder({databasePath:process.env.FIXTURE_DATABASE,how:body.how??settings.howToStart('holder'),cwd:body.cwd??settings.REPO_ROOT}))).then(started=>{if(started.pid)recordGroup(started.pid);res.end(JSON.stringify(started))},error=>{res.statusCode=500;res.end(String(error))});
const stranger=(res)=>{const one=spawn(process.execPath,['-e','const server='+process.pid+';setInterval(()=>{try{process.kill(server,0)}catch{process.exit(0)}},200)'],{detached:true,stdio:'ignore'});recordGroup(one.pid);one.unref();res.end(JSON.stringify({pid:one.pid}))};
const server=http.createServer((req,res)=>req.method==='POST'&&req.url==='/holder'?press(req,res):req.method==='POST'&&req.url==='/stranger'?stranger(res):res.end('fixture'));
server.listen(Number(process.env.FIXTURE_PORT),'127.0.0.1',()=>writeFileSync('ready.json',JSON.stringify({supervisorPid:process.ppid,serverPid:process.pid,workerPid:child.pid,extraWorkerPid:extra?.pid})));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
`)
  writeFileSync(join(stable, 'src/worker/index.ts'), `
import {writeFileSync} from 'node:fs';
const owner: number=Number(process.argv.find(word=>word.startsWith('--stop-with-pid='))?.split('=')[1]);
writeFileSync('worker-ready','ready');setInterval(()=>{try{process.kill(owner,0)}catch{process.exit(0)}},20);
`)
  const started = startUpgradeProgram(process.execPath, ['tools/serve-dev.mjs', '--built', '--prepared'], stable, { FIXTURE_PORT: String(port), ...(argv0 ? { FIXTURE_ARGV0: argv0 } : {}), ...(extraWorker ? { FIXTURE_EXTRA_WORKER: 'yes' } : {}), ...(place ? { ...place.env, FIXTURE_DATABASE: place.database } : {}) })
  await until(() => existsSync(join(stable, 'ready.json')), 'The fixture server did not become ready.')
  const ready = JSON.parse(readFileSync(join(stable, 'ready.json'), 'utf8'))
  await until(() => {
    if (!argv0) return existsSync(join(stable, 'worker-ready'))
    return readFileSync(`/proc/${ready.workerPid}/cmdline`, 'utf8').split('\0')[0] === argv0 && realpathSync(`/proc/${ready.workerPid}/exe`) === shell
  }, 'The fixture worker did not reach its entry.')
  const serviceGroups = [groups.find(row => row.pgid === started.pid)!, ...readFileSync(join(stable, 'groups.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))]
  const database = place?.database ?? join(folder, 'unused.sqlite')
  const c = { stableCheckout: realpathSync(stable), database, servicePort: port, serviceGroups: serviceGroups.map(row => ({ ...row, cwd: realpathSync(stable), database, port })) }
  const runtime = { supervisor: { pid: ready.supervisorPid }, process: { pid: ready.serverPid }, worker: { started: true, pid: ready.workerPid, pgid: ready.workerPid } }
  return { ...ready, c, runtime, group: c.serviceGroups[0] }
}

afterEach(async () => {
  // The spawners record children before readiness, so a failed start is cleaned up too.
  for (const folder of folders) {
    const ledger = join(folder, 'stable/groups.jsonl')
    if (existsSync(ledger)) for (const line of readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean)) {
      const group = JSON.parse(line)
      if (!groups.some(row => row.pgid === group.pgid && row.startTime === group.startTime)) groups.push(group)
    }
  }
  // A holder's group is recorded after the office's, so it is stopped first, and it ends its terminals.
  for (const group of groups.reverse()) await stopRecordedGroup(group)
  await Promise.all(children.map(row => row.ended))
  groups.length = 0; children.length = 0
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
  folders.length = 0
  await stopEverything()
  terminals.clear(); places.clear()
})

function readers(f: Awaited<ReturnType<typeof startUpgradeOffice>>) {
  return [() => upgradeProcesses.observeUpgradeTopology(f.runtime, f.group, f.c), () => upgradeProcesses.servingUpgradeTopology([f.serverPid], f.c)]
}

function requireNode(record: { pid: number }, role: string) {
  // Keep the base control collectable before this export exists.
  return Reflect.get(upgradeProcesses, 'requireThisNode')(record, role)
}

async function unreadableUpgradeProgram() {
  const folder = scratch(), ready = join(folder, 'ready')
  const started = startUpgradeProgram('python3', ['-c', `import ctypes,time,pathlib; assert ctypes.CDLL(None).prctl(4,0,0,0,0)==0; pathlib.Path(${JSON.stringify(ready)}).write_text('ready'); time.sleep(600)`], folder)
  await until(() => existsSync(ready), 'The private fixture process did not become ready.')
  let code: string
  try { realpathSync(`/proc/${started.pid}/exe`); throw new Error('The fixture executable is readable.') } catch (error: any) { if (!error.code) throw error; code = error.code }
  return { ...started, code }
}

function gateRecords(gatePid: number, programPid: number) {
  const gate = { ...currentProcessRecord(gatePid), argv: [process.execPath, '-e', gateText, process.execPath, JSON.stringify(['fixture'])] }
  const program = { ...currentProcessRecord(process.pid), pid: programPid, ppid: gate.pid, pgid: gate.pid, cwd: gate.cwd, argv: [process.execPath, 'fixture'] }
  return { gate, program }
}

describe('the executable of an ordinary upgrade worker', () => {
  it('accepts the worker started through the real tsx in both topology readers', async () => {
    const f = await startUpgradeOffice()
    expect(currentProcessRecord(f.workerPid).argv[0]).toBe('node')
    expect(descendantsOf(currentProcessRecord(f.workerPid)).map(row => currentProcessRecord(row.pid)).some(row => row.pgid === f.workerPid && row.argv.includes('src/worker/index.ts'))).toBe(true)
    for (const read of readers(f)) expect.soft(() => {
      const observed = read()
      expect(observed.worker.pid).toBe(f.workerPid)
      expect(upgradeProcesses.upgradeServiceGroups(observed, f.c)).toEqual(f.c.serviceGroups)
    }).not.toThrow()
  })

  it('refuses another program whose first argument says node', async () => {
    const f = await startUpgradeOffice('node')
    expect(currentProcessRecord(f.workerPid).argv[0]).toBe('node')
    for (const read of readers(f)) expect.soft(read).toThrow()
  })

  it('refuses a non-leader carrying the worker entry outside the worker group', async () => {
    const f = await startUpgradeOffice(undefined, true)
    const extra = currentProcessRecord(f.extraWorkerPid)
    expect(extra.ppid).toBe(f.serverPid)
    expect(extra.pgid).toBe(f.serverPid)
    expect(extra.pid).not.toBe(extra.pgid)
    expect(extra.pgid).not.toBe(f.workerPid)
    expect(extra.argv).toContain('src/worker/index.ts')
    expect(() => upgradeProcesses.servingUpgradeTopology([f.serverPid], f.c)).toThrow('The ordinary topology has more than one worker.')
  })

  it('names the shell executable when its first argument says node', async () => {
    const f = await startUpgradeOffice('node')
    for (const read of readers(f)) expect.soft(read).toThrow(`The worker (process ${f.workerPid}) runs ${shell}, not this Node (${thisNode}).`)
  })

  it("refuses another program whose first argument is this Node's full path", async () => {
    const f = await startUpgradeOffice(process.execPath)
    expect(currentProcessRecord(f.workerPid).argv[0]).toBe(process.execPath)
    for (const read of readers(f)) expect.soft(read).toThrow(`The worker (process ${f.workerPid}) runs ${shell}, not this Node (${thisNode}).`)
  })

  it('refuses a process whose executable is unreadable', async () => {
    const f = await unreadableUpgradeProgram()
    expect(() => requireNode({ pid: f.pid }, 'worker')).toThrow(`The program of the worker (process ${f.pid}) could not be read from /proc/${f.pid}/exe (${f.code}), so it is not shown to be this Node.`)
  })

  it('refuses the record of a process that has ended', async () => {
    const f = startUpgradeProgram(process.execPath, ['-e', 'setInterval(()=>{},1000)'], scratch())
    const record = currentProcessRecord(f.pid)
    await stopRecordedGroup(groups.at(-1)!)
    await f.ended
    expect(() => requireNode(record, 'worker')).toThrow(`The program of the worker (process ${f.pid}) could not be read from /proc/${f.pid}/exe (ENOENT), so it is not shown to be this Node.`)
  })
})

describe('the executables of a gate and its program', () => {
  it("refuses a gate whose child's executable differs from its command", () => {
    const gate = startUpgradeProgram(process.execPath, ['-e', 'setInterval(()=>{},1000)'], scratch())
    const program = startUpgradeProgram('/bin/sh', ['-c', 'sleep 600; :'], scratch())
    const nodeProgram = startUpgradeProgram(process.execPath, ['-e', 'setInterval(()=>{},1000)'], scratch())
    const valid = gateRecords(gate.pid, nodeProgram.pid)
    expect(isTheGateOf(valid.gate, valid.program)).toBe(true)
    const forged = gateRecords(gate.pid, program.pid)
    expect(isTheGateOf(forged.gate, forged.program)).toBe(false)
  })

  it('refuses a gate whose own executable differs from this Node', () => {
    const gate = startUpgradeProgram('/bin/sh', ['-c', 'sleep 600; :'], scratch())
    const program = startUpgradeProgram(process.execPath, ['-e', 'setInterval(()=>{},1000)'], scratch())
    const forged = gateRecords(gate.pid, program.pid)
    expect(isTheGateOf(forged.gate, forged.program)).toBe(false)
  })

  it('throws when a gate executable cannot be read', async () => {
    const gate = startUpgradeProgram(process.execPath, ['-e', 'setInterval(()=>{},1000)'], scratch())
    const hidden = await unreadableUpgradeProgram()
    for (const role of ['gate', 'gated program']) {
      const forged = role === 'gate' ? gateRecords(gate.pid, gate.pid) : gateRecords(gate.pid, hidden.pid)
      if (role === 'gate') {
        forged.gate.pid = hidden.pid; forged.gate.pgid = hidden.pid
        forged.program.ppid = hidden.pid; forged.program.pgid = hidden.pid
      }
      expect(() => isTheGateOf(forged.gate, forged.program)).toThrow(`Stable bootstrap refused: The program of the ${role} (process ${hidden.pid}) could not be read from /proc/${hidden.pid}/exe (${hidden.code}), so its gate identity cannot be verified.`)
    }
  })

  it('names an unresolved gate command in a bootstrap refusal', () => {
    const gate = startUpgradeProgram(process.execPath, ['-e', 'setInterval(()=>{},1000)'], scratch())
    const program = startUpgradeProgram(process.execPath, ['-e', 'setInterval(()=>{},1000)'], scratch())
    const command = join(scratch(), 'missing-node')
    const forged = gateRecords(gate.pid, program.pid)
    forged.gate.argv[3] = command; forged.program.argv[0] = command
    expect(() => isTheGateOf(forged.gate, forged.program)).toThrow(`Stable bootstrap refused: The command of the gate (process ${gate.pid}), ${command}, could not be resolved (ENOENT), so its gate identity cannot be verified.`)
  })
})

const OUTSIDE = 'The ordinary topology has a process outside its supervisor, server and worker.'

/** The made-up office's press for a terminal holder, as the person presses it. Answers the holder's process record. */
async function pressForAHolder(f: Awaited<ReturnType<typeof startUpgradeOffice>>, body: { how?: { command: string; args: string[] }; cwd?: string } = {}) {
  const answer = await fetch(`http://127.0.0.1:${f.c.servicePort}/holder`, { method: 'POST', body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, text).toBe(200)
  const started = JSON.parse(text)
  expect(started.outcome, text).toBe('started')
  return currentProcessRecord(started.pid)
}

describe("the office's terminal holder", () => {
  it('accepts the holder the press started, and its terminal, and records neither group', async () => {
    const place = aPlace('ut')
    writeFileSync(place.database, '')
    const f = await startUpgradeOffice(undefined, false, place)
    const holder = await pressForAHolder(f)
    expect(holder.ppid).toBe(f.serverPid)
    expect(holder.pgid).toBe(holder.pid)
    expect(holder.argv.slice(1)).toEqual([join(f.c.stableCheckout, THE_HOLDER_ENTRY), '--database', place.database])
    const terminal = await openThroughTheHolder(place)
    expect(descendantsOf(holder).map(row => row.pid)).toContain(terminal.pid)
    expect(bootstrapProcessIdentity(terminal.pid).pgid).not.toBe(holder.pgid)
    for (const read of readers(f)) expect.soft(() => {
      const observed = read()
      expect(observed.holders.map(row => row.pid)).toEqual([holder.pid])
      expect(upgradeProcesses.upgradeServiceGroups(observed, f.c)).toEqual(f.c.serviceGroups)
    }).not.toThrow()
    // The holder names the database but does not open it, so the database holder check has nothing to set aside.
    expect(theDatabaseHolders(place.database).holders).toEqual([])
  })

  it('refuses the holder when the configuration names another database', async () => {
    const place = aPlace('ud')
    const f = await startUpgradeOffice(undefined, false, place)
    await pressForAHolder(f)
    for (const read of readers({ ...f, c: { ...f.c, database: join(place.dir, 'another.db') } })) expect.soft(read).toThrow(OUTSIDE)
  })

  it("refuses a holder started from another checkout's entry", async () => {
    const place = aPlace('ue')
    const f = await startUpgradeOffice(undefined, false, place)
    const holder = await pressForAHolder(f, { how: { command: process.execPath, args: [join(root, THE_HOLDER_ENTRY)] } })
    expect(holder.ppid).toBe(f.serverPid)
    for (const read of readers(f)) expect.soft(read).toThrow(OUTSIDE)
  })

  it('refuses a holder with another working folder', async () => {
    const place = aPlace('uw')
    const f = await startUpgradeOffice(undefined, false, place)
    const holder = await pressForAHolder(f, { cwd: place.dir })
    expect(holder.cwd).toBe(realpathSync(place.dir))
    for (const read of readers(f)) expect.soft(read).toThrow(OUTSIDE)
  })

  it('still refuses an unknown child of the server in a group of its own while the holder runs', async () => {
    const place = aPlace('us')
    const f = await startUpgradeOffice(undefined, false, place)
    await pressForAHolder(f)
    const answer = await fetch(`http://127.0.0.1:${f.c.servicePort}/stranger`, { method: 'POST' })
    const stranger = currentProcessRecord((await answer.json()).pid)
    expect(stranger.ppid).toBe(f.serverPid)
    expect(stranger.pgid).toBe(stranger.pid)
    for (const read of readers(f)) expect.soft(read).toThrow(OUTSIDE)
  })
})
