// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Durable mutation intent and recorded process groups for the bootstrap only. */
import { spawn } from 'node:child_process'
import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { localStamp } from '../../src/shared/time.ts'
import { bootstrapFail as fail, bootstrapProcessIdentity, bootstrapProcessProgram, descendantsOf, isRecordedDescendant, readListeners } from './stable-bootstrap-support.mjs'

function syncDir(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd) } finally { closeSync(fd) } }

export function createFsyncedJournal(paths, options = {}, reopen = false) {
  let lock = openSync(paths.lock, 'wx', 0o600)
  let lockIdentity = fstatSync(lock)
  const intent = { at: localStamp(new Date()), step: 'lock', phase: 'attempt', paths }
  writeSync(lock, JSON.stringify(intent) + '\n'); fsyncSync(lock); syncDir(dirname(paths.lock))
  let fd
  try { fd = openSync(paths.journal, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | (reopen ? 0 : constants.O_CREAT | constants.O_EXCL), 0o600) }
  catch (error) { closeSync(lock); throw error }
  const identity = fstatSync(fd)
  if (!identity.isFile() || identity.uid !== process.getuid() || (identity.mode & 0o777) !== 0o600 || identity.nlink !== 1) { closeSync(fd); closeSync(lock); fail('The transaction journal is not one private ordinary file.') }
  fsyncSync(fd); syncDir(dirname(paths.journal))
  let sequence = reopen ? readFileSync(paths.journal, 'utf8').trimEnd().split('\n').length : 0
  let closed = false, finalizing = false
  function requireLock() {
    const current = lstatSync(paths.lock)
    if (!current.isFile() || current.dev !== lockIdentity.dev || current.ino !== lockIdentity.ino) fail('A different transaction owns the exclusive lock; no service mutation is authorized.')
  }
  const journal = {
    identity,
    append(step, phase, detail = {}) {
      const row = { sequence: ++sequence, at: localStamp(new Date()), step, phase, ...detail }
      writeSync(fd, JSON.stringify(row) + '\n'); fsyncSync(fd)
      options.say?.(`${phase === 'attempt' ? 'Attempting' : phase === 'done' ? 'Completed' : phase}: ${step}.`)
      return row
    },
    async step(step, action, detail = {}) {
      requireLock()
      const row = journal.append(step, 'attempt', { paths, ...detail })
      await options.onStep?.({ ...row, phase: 'before' })
      requireLock()
      const result = await action()
      journal.append(step, 'done')
      await options.onStep?.({ ...row, phase: 'after' })
      return result
    },
    async close() {
      finalizing = true
      await journal.step('release-lock', () => { unlinkSync(paths.lock); syncDir(dirname(paths.lock)); closeSync(lock) })
      const row = journal.append('final-descriptor-close', 'attempt', { paths })
      await options.onStep?.({ ...row, phase: 'before' })
      closeSync(fd); closed = true
      await options.onStep?.({ ...row, phase: 'after' })
    },
    prepareRecovery() {
      if (!finalizing) { requireLock(); return }
      // Never retry an ambiguous descriptor number. Reopen the named journal,
      // verify its birth, and reacquire the exact exclusion before recovery.
      const replacement = openSync(paths.journal, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW)
      const actual = fstatSync(replacement)
      if (actual.dev !== identity.dev || actual.ino !== identity.ino) { closeSync(replacement); fail('The retained journal inode changed.') }
      if (existsSync(paths.lock)) {
        requireLock()
        lock = openSync(paths.lock, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW)
      } else {
        lock = openSync(paths.lock, 'wx', 0o600)
        lockIdentity = fstatSync(lock)
        writeSync(lock, JSON.stringify({ step: 'recover-lock', phase: 'attempt', paths, journalIdentity: { dev: identity.dev, ino: identity.ino } }) + '\n')
        fsyncSync(lock); syncDir(dirname(paths.lock))
      }
      fd = replacement; closed = false; finalizing = false
    },
    get closed() { return closed },
  }
  journal.append('lock', 'acquired', { paths, journalIdentity: { dev: identity.dev, ino: identity.ino } })
  return journal
}

const GATE = `
const {spawn}=require('node:child_process');
let started=false;
const timer=setTimeout(()=>process.exit(125),15000);
process.on('message',m=>{if(m!=='start'||started)return;started=true;clearTimeout(timer);
 const child=spawn(process.argv[1],JSON.parse(process.argv[2]),{stdio:'inherit',env:process.env});
 if(child.pid)process.send({child:child.pid});
 child.on('error',()=>process.exit(126));child.on('exit',(code,signal)=>process.exit(code??(signal?128:1)));});
process.on('disconnect',()=>{if(!started){clearTimeout(timer);process.exit(125)}});
`

/**
 * True when `gate` is a gate that startGatedBootstrapGroup started and `program` is what it started: the gate leads
 * its group, and the program is its child in that group, in the same folder, with the command and arguments it was given.
 * The gate's executable must be this Node and its child's executable must be the configured command.
 */
export function isTheGateOf(gate, program) {
  const [, flag, text, command, args, ...rest] = gate.argv
  const gateProgram = bootstrapProcessProgram(gate.pid), childProgram = bootstrapProcessProgram(program.pid)
  for (const [record, role, observed] of [[gate, 'gate', gateProgram], [program, 'gated program', childProgram]]) {
    if (observed.unreadable !== undefined) fail(`The program of the ${role} (process ${record.pid}) could not be read from /proc/${record.pid}/exe (${observed.unreadable}), so its gate identity cannot be verified.`)
  }
  const commandProgram = () => {
    try { return realpathSync(command) }
    catch (error) { fail(`The command of the gate (process ${gate.pid}), ${command}, could not be resolved (${error.code ?? error.message}), so its gate identity cannot be verified.`) }
  }
  return flag === '-e' && text === GATE && rest.length === 0 && gate.pgid === gate.pid && program.ppid === gate.pid && program.pgid === gate.pid &&
    program.cwd === gate.cwd && program.argv[0] === command && JSON.stringify(program.argv.slice(1)) === args &&
    gateProgram.program === realpathSync(process.execPath) && childProgram.program === commandProgram()
}

export function currentProcessRecord(pid) {
  const identity = bootstrapProcessIdentity(pid)
  const leader = bootstrapProcessIdentity(identity.pgid)
  return { pid, ppid: identity.ppid, pgid: identity.pgid, startTime: identity.startTime, groupLeader: { pid: identity.pgid, startTime: leader.startTime }, cwd: realpathSync(`/proc/${pid}/cwd`), argv: readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean) }
}

function liveGroup(pgid) {
  return readdirSync('/proc').filter(name => /^\d+$/.test(name)).flatMap(name => {
    try { const row = bootstrapProcessIdentity(Number(name)); return row.pgid === pgid && !['Z', 'X'].includes(row.state) ? [row] : [] }
    catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return []; throw error }
  })
}

export async function startGatedBootstrapGroup({ name, cwd, command, args, env, log, journal, onStep, owned }) {
  return journal.step(name, async () => {
    const output = openSync(log, 'ax', 0o600)
    let child, ended, exit = null, programPid = null
    try {
      child = spawn(process.execPath, ['-e', GATE, command, JSON.stringify(args)], { cwd, env, detached: true, stdio: ['ignore', output, output, 'ipc'] })
      // A failed spawn emits error asynchronously even when it has no PID.
      // Observe it before any metadata read or controlled refusal can throw.
      ended = new Promise(resolve => {
        child.once('error', error => { exit = { error: String(error.message) }; resolve(exit) })
        child.once('exit', (code, signal) => { exit = { code, signal }; resolve(exit) })
      })
    }
    finally { closeSync(output) }
    if (!child.pid) { const failed = await ended; fail(`A gated bootstrap process did not spawn: ${failed.error ?? 'no process identity was created'}.`) }
    const gate = currentProcessRecord(child.pid)
    const started = new Promise(resolve => child.on('message', message => {
      if (!message || !Number.isSafeInteger(message.child)) return
      programPid = message.child
      // This child is observed after creation, not falsely called pre-gated.
      try { journal.append(name, 'child-observed', { process: currentProcessRecord(programPid) }) }
      catch (error) { journal.append(name, 'child-observation-uncertain', { pid: programPid, reason: String(error.message) }) }
      resolve(programPid)
    }))
    const group = { name, gate, child, ended, started, get exit() { return exit }, get programPid() { return programPid } }
    owned.push(group)
    journal.append(name, 'group-recorded', { process: gate, log })
    await onStep?.({ step: name, phase: 'gated', process: gate })
    journal.append(name, 'gate-open-attempt', { pid: gate.pid, startTime: gate.startTime })
    await new Promise((resolve, reject) => child.send('start', error => error ? reject(error) : resolve()))
    return group
  }, { cwd, command, args, log })
}

export async function awaitBootstrapCommand(group, bound) {
  let timer
  try {
    const result = await Promise.race([group.ended, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('A bootstrap command exceeded its bound.')), bound) })])
    if (result.code !== 0 || result.error || liveGroup(group.gate.pgid).length) fail(`Command ${group.name} failed or left a live group; inspect its retained log.`)
  } finally { clearTimeout(timer) }
}

export async function stopBootstrapGroup(record, { journal, name, stopTimeoutMs, supervisor = null, allowSupervisor = false }) {
  return journal.step(name, async () => {
    const members = liveGroup(record.pgid)
    if (!members.length) return
    const actual = bootstrapProcessIdentity(record.pid), leader = bootstrapProcessIdentity(record.pgid)
    if (actual.startTime !== record.startTime || actual.pgid !== record.pgid || leader.startTime !== record.groupLeader.startTime || leader.pgid !== record.pgid) fail('Refusing to signal a reused or unknown process group.')
    if (supervisor && !(allowSupervisor && record.pid === supervisor.pid) && !isRecordedDescendant(record.pid, supervisor)) fail('Refusing to signal a non-descendant decoy.')
    // Validate again immediately before kill; no atomic kernel PID guarantee is claimed.
    if (bootstrapProcessIdentity(record.pid).startTime !== record.startTime || bootstrapProcessIdentity(record.pgid).startTime !== record.groupLeader.startTime) fail('Process identity changed immediately before signalling.')
    journal.append(name, 'signal-attempt', { process: record })
    process.kill(-record.pgid, 'SIGTERM')
    const deadline = Date.now() + stopTimeoutMs
    while (liveGroup(record.pgid).length && Date.now() < deadline) await delay(25)
    if (liveGroup(record.pgid).length) fail('The recorded process group did not end after SIGTERM; no broader signal was sent.')
  }, { process: record })
}

export function observeBootstrapTopology(runtime, gate, root, journal) {
  if (!runtime?.process?.pid || !runtime?.supervisor?.pid || typeof runtime.worker?.started !== 'boolean') fail('The runtime did not identify its supervisor, server and worker declaration.')
  const supervisor = currentProcessRecord(runtime.supervisor.pid)
  if (!isRecordedDescendant(supervisor.pid, gate) || supervisor.pgid !== gate.pgid || supervisor.cwd !== root || !supervisor.argv.some(word => word.endsWith('tools/serve-dev.mjs'))) fail('The observed supervisor is not the recorded gated descendant.')
  const server = currentProcessRecord(runtime.process.pid)
  if (!isRecordedDescendant(server.pid, supervisor) || server.cwd !== root) fail('The observed server is not a recorded supervisor descendant.')
  const worker = runtime.worker.started ? currentProcessRecord(runtime.worker.pid) : null
  if (worker && (!isRecordedDescendant(worker.pid, supervisor) || worker.cwd !== root || worker.pgid !== runtime.worker.pgid)) fail('The observed worker is not a recorded supervisor descendant.')
  const topology = { supervisor, server, worker }
  journal.append('ordinary-topology', 'observed', { topology })
  // Other descendants remain visible; they never become guessed stop targets.
  journal.append('ordinary-descendants', 'observed', { identities: descendantsOf(supervisor) })
  return topology
}

/** Discover only verified descendants; an identical process elsewhere is never a candidate. */
export function discoverBootstrapTopology(gate, root, journal) {
  const records = descendantsOf(gate).map(row => currentProcessRecord(row.pid))
  const supervisors = records.filter(row => row.cwd === root && row.argv.some(word => word === 'tools/serve-dev.mjs' || word === root + '/tools/serve-dev.mjs'))
  if (supervisors.length !== 1) fail('The recorded startup group has an unknown or ambiguous supervisor descendant.')
  const supervisor = supervisors[0]
  const servers = records.filter(row => row.cwd === root && row.ppid === supervisor.pid && row.argv.some(word => word === 'src/server/index.ts' || word === root + '/src/server/index.ts') && row.argv.includes(`--stop-with-pid=${supervisor.pid}`))
  if (servers.length !== 1) fail('The recorded supervisor has an unknown or ambiguous server descendant.')
  const server = servers[0]
  const workers = records.filter(row => row.pid === row.pgid && row.cwd === root && isRecordedDescendant(row.pid, server) && row.argv.some(word => word === 'src/worker/index.ts' || word === root + '/src/worker/index.ts') && row.argv.includes(`--stop-with-pid=${server.pid}`))
  if (workers.length > 1) fail('The recorded server has ambiguous worker descendants.')
  const topology = { supervisor, server, worker: workers[0] ?? null }
  journal.append('partial-start-topology', 'observed', { topology })
  return topology
}
