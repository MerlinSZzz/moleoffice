// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The two ordinary serve-dev layouts share the bootstrap's process observations. */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { THE_HOLDER_ENTRY } from '../../src/config/settings.mjs'
import { currentProcessRecord, discoverBootstrapTopology, observeBootstrapTopology } from './stable-bootstrap-processes.mjs'
import { bootstrapGitEnvironment, bootstrapProcessIdentity, bootstrapProcessProgram, descendantsOf, isRecordedDescendant } from './stable-bootstrap-support.mjs'

const fail = message => { throw new Error(message) }
const quietJournal = { append() {} }
const entryIs = (record, root, entry) => record.argv.includes(entry) || record.argv.includes(join(root, entry))
export function requireThisNode(record, role) {
  const observed = bootstrapProcessProgram(record.pid)
  if (observed.unreadable !== undefined) fail(`The program of the ${role} (process ${record.pid}) could not be read from /proc/${record.pid}/exe (${observed.unreadable}), so it is not shown to be this Node.`)
  const thisNode = realpathSync(process.execPath)
  if (observed.program !== thisNode) fail(`The ${role} (process ${record.pid}) runs ${observed.program}, not this Node (${thisNode}).`)
}

/**
 * The office's terminal holder: a child of the server, in a group of its own, that the person's press started
 * (startATerminalHolder in src/config/the-terminal-holder.mjs). It holds the person's terminals, so the upgrade leaves
 * it running while it stops the server, and stopping it is the person's own act. It is known by its whole command
 * line, its program, its group, its parent and its checkout. Its row in the office's process ledger is in the
 * database, which this check does not open, so the row is not read. A process that ended since it was listed is not
 * the holder.
 */
function isTheTerminalHolder(pid, server, c) {
  let record
  try { record = currentProcessRecord(pid) }
  catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return null; throw error }
  const command = [join(c.stableCheckout, THE_HOLDER_ENTRY), '--database', c.database]
  const known = record.pid === record.pgid && record.ppid === server.pid && record.cwd === c.stableCheckout
    && record.argv.length === command.length + 1 && command.every((word, at) => record.argv[at + 1] === word)
    && bootstrapProcessProgram(record.pid).program === realpathSync(process.execPath)
  return known ? record : null
}

function checkTopology(topology, gate, c) {
  const { supervisor, server, worker } = topology
  requireThisNode(supervisor, 'serve-dev supervisor')
  requireThisNode(server, 'server')
  if (worker) requireThisNode(worker, 'worker')
  if (!entryIs(supervisor, c.stableCheckout, 'tools/serve-dev.mjs') || !supervisor.argv.includes('--built') || !supervisor.argv.includes('--prepared') || supervisor.pgid !== gate.pgid) fail('The ordinary topology needs the recorded built and prepared serve-dev group.')
  if (supervisor.pid !== gate.pid) requireThisNode(gate, 'gate')
  if (supervisor.pid !== gate.pid && (supervisor.ppid !== gate.pid || gate.argv[1] !== '-e' || !gate.argv.some(word => word.includes('tools/serve-dev.mjs')))) fail('The ordinary serve-dev supervisor must be the recorded gate’s direct child.')
  if (server.pid !== server.pgid || server.pgid === supervisor.pgid || server.ppid !== supervisor.pid || !entryIs(server, c.stableCheckout, 'src/server/index.ts') || !server.argv.includes(`--stop-with-pid=${supervisor.pid}`)) fail('The ordinary server must be serve-dev’s direct child in its own guarded group.')
  if (worker && (worker.pid !== worker.pgid || [gate.pgid, server.pgid].includes(worker.pgid) || !isRecordedDescendant(worker.pid, server) || !entryIs(worker, c.stableCheckout, 'src/worker/index.ts') || !worker.argv.includes(`--stop-with-pid=${server.pid}`))) fail('The ordinary worker must be the server’s guarded descendant in its own group.')
  const records = [...new Map([gate, supervisor, server, worker].filter(Boolean).map(row => [row.pid, row])).values()]
  if (records.some(row => row.cwd !== c.stableCheckout)) fail('An ordinary topology process has another checkout.')
  const expected = new Set(records.map(row => row.pid))
  const owners = new Map([supervisor, server, worker].filter(Boolean).map(row => [row.pgid, row]))
  const withinTopology = row => expected.has(row.pid) || owners.has(row.pgid) && isRecordedDescendant(row.pid, owners.get(row.pgid))
  const foreignMembers = readdirSync('/proc').filter(name => /^\d+$/.test(name)).flatMap(name => {
    try { const row = bootstrapProcessIdentity(Number(name)); return owners.has(row.pgid) && !['Z', 'X'].includes(row.state) && !withinTopology(row) ? [row] : [] }
    catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return []; throw error }
  })
  // The holder and everything under it are accepted and never recorded, so the upgrade never signals them.
  const outside = descendantsOf(gate).filter(row => !withinTopology(row))
  const holders = outside.map(row => isTheTerminalHolder(row.pid, server, c)).filter(holder => holder !== null)
  const underAHolder = row => holders.some(holder => row.pid === holder.pid || isRecordedDescendant(row.pid, holder))
  const strangers = [...new Map([...foreignMembers, ...outside.filter(row => !underAHolder(row))].map(row => [row.pid, row])).values()]
  if (strangers.length) fail(`The ordinary topology has a process outside its supervisor, server and worker. ${strangers.length === 1 ? 'The process outside them is' : 'The processes outside them are'} ${strangers.map(row => aProcessByItsName(row.pid)).join(', ')}.`)
  return { gate, supervisor, server, worker, holders, records }
}

/**
 * A process as a sentence names it: its pid and its program's name as the kernel keeps it in /proc/<pid>/comm. Never
 * its command line, which can carry a path or a key.
 */
export function aProcessByItsName(pid) {
  try { return `process ${pid} (${readFileSync(`/proc/${pid}/comm`, 'utf8').trim()})` }
  catch (error) { return `process ${pid} (${['ENOENT', 'ESRCH'].includes(error.code) ? 'it ended before its name was read' : `its name could not be read: ${error.code ?? error.message}`})` }
}

/**
 * The ordinary start's processes under its gate, found from /proc and checked by checkTopology. When the gate is
 * serve-dev itself, the server is serve-dev's one child with the server's entry, and the worker is the one process
 * under it that leads its own group with the worker's entry. Otherwise serve-dev is found under the gate
 * (discoverBootstrapTopology). `supervisor` is the serve-dev a listener named. The way back has none and passes null:
 * its gate is always the upgrade's own, which starts serve-dev as its child.
 */
export function theOrdinaryTopologyUnder(gate, c, supervisor) {
  let topology
  if (supervisor === null || gate.pid !== supervisor.pid) topology = discoverBootstrapTopology(gate, c.stableCheckout, quietJournal)
  else {
    const descendants = descendantsOf(supervisor).map(row => currentProcessRecord(row.pid))
    const servers = descendants.filter(row => row.ppid === supervisor.pid && entryIs(row, c.stableCheckout, 'src/server/index.ts'))
    if (servers.length !== 1) fail('The ordinary topology has no single server child.')
    // tsx runs the entry in a child Node in the same group; that child carries the entry too.
    const workers = descendants.filter(row => row.pid === row.pgid && entryIs(row, c.stableCheckout, 'src/worker/index.ts'))
    if (workers.length > 1) fail('The ordinary topology has more than one worker.')
    if (descendants.some(row => entryIs(row, c.stableCheckout, 'src/worker/index.ts') && row.pgid !== workers[0]?.pgid)) fail(workers.length === 0 ? 'The ordinary worker must be the server’s guarded descendant in its own group.' : 'The ordinary topology has more than one worker.')
    topology = { supervisor, server: servers[0], worker: workers[0] ?? null }
  }
  return checkTopology(topology, gate, c)
}

export function observeUpgradeTopology(runtime, group, c, journal = quietJournal) {
  if (!runtime?.process?.pid || !runtime?.supervisor?.pid || typeof runtime.worker?.started !== 'boolean') fail('The ordinary runtime must identify its supervisor, server and worker declaration.')
  const gate = currentProcessRecord(group.pgid)
  if (gate.startTime !== group.startTime || gate.pid !== gate.pgid) fail('The ordinary topology gate identity changed.')
  const topology = runtime.supervisor.pid === gate.pid
    ? { supervisor: gate, server: currentProcessRecord(runtime.process.pid), worker: runtime.worker.started ? currentProcessRecord(runtime.worker.pid) : null }
    : observeBootstrapTopology(runtime, gate, c.stableCheckout, journal)
  if (topology.worker && topology.worker.pgid !== runtime.worker.pgid) fail('The runtime worker group differs from its observed identity.')
  return checkTopology(topology, gate, c)
}

/** Dry validation starts from owned listeners, never a process-name search. */
export function servingUpgradeTopology(pids, c) {
  const records = pids.map(pid => currentProcessRecord(pid))
  const supervisors = new Map(records.map(record => {
    const supervisor = entryIs(record, c.stableCheckout, 'tools/serve-dev.mjs') ? record : currentProcessRecord(record.ppid)
    return [supervisor.pid, supervisor]
  }))
  if (supervisors.size !== 1) fail('The ordinary listeners have different supervisors.')
  const supervisor = [...supervisors.values()][0]
  const group = c.serviceGroups.find(row => row.pgid === supervisor.pgid)
  if (!group) fail('The ordinary topology has no recorded supervisor group.')
  const gate = currentProcessRecord(group.pgid)
  const observed = theOrdinaryTopologyUnder(gate, c, supervisor)
  const expected = [gate.pgid, observed.server.pgid, ...(observed.worker ? [observed.worker.pgid] : [])]
  if (c.serviceGroups.length !== expected.length || c.serviceGroups.some(row => !expected.includes(row.pgid))) fail('Recorded groups must be exactly the ordinary serve-dev topology groups.')
  if (pids.some(pid => ![observed.supervisor.pid, observed.server.pid].includes(pid))) fail('An ordinary listener is outside the serve-dev topology.')
  return observed
}

/**
 * THE CLOCK TICKS IN WHICH /proc GIVES A PROCESS'S START TIME. The rate is read once, with getconf CLK_TCK, and never
 * assumed: without it no start time can be set beside a time read from /proc/uptime.
 */
let theTickRate = null
export function theClockTicksASecond() {
  if (theTickRate !== null) return theTickRate
  const read = spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8', timeout: 5_000, env: bootstrapGitEnvironment() })
  const said = read.error || read.status !== 0 ? null : read.stdout.trim()
  if (said === null || !/^[1-9]\d{0,5}$/.test(said)) fail(`The clock's ticks a second could not be read with getconf CLK_TCK (${theRateRefusal(read)}), so no process's start time can be set beside the gate's end.`)
  theTickRate = Number(said)
  return theTickRate
}
function theRateRefusal(read) {
  if (read.error) return read.error.message
  if (read.status !== 0) return read.stderr.trim().slice(0, 200) || `it ended with ${read.status ?? read.signal}`
  return `it printed ${JSON.stringify(read.stdout.trim().slice(0, 20))}`
}

/** The seconds since boot, in hundredths, as /proc/uptime gives them. The kernel rounds them down. */
export function theUptimeInHundredths() {
  const text = readFileSync('/proc/uptime', 'utf8')
  const seconds = /^(\d+)\.(\d{2}) /.exec(text)
  if (seconds === null) fail(`/proc/uptime does not begin with the seconds since boot in hundredths (${JSON.stringify(text.slice(0, 32))}).`)
  return Number(seconds[1]) * 100 + Number(seconds[2])
}

/**
 * The last clock tick that may have begun by a reading of /proc/uptime, `hundredths`. The reading is rounded down, so
 * the time was before the next hundredth. At 100 ticks a second, which is what Linux gives, this is the hundredths
 * themselves.
 */
export function theTicksBy(hundredths) {
  return Math.floor(((hundredths + 1) * theClockTicksASecond() - 1) / 100)
}

/** Now, as the last clock tick since boot that may have begun: the unit of each process's start time in /proc. */
export function theTicksSinceBoot() {
  return theTicksBy(theUptimeInHundredths())
}

/** The programs an ordinary start may leave in its gate's group: its server, its worker and serve-dev's stand-in. */
const THE_STARTS_OWN_ENTRIES = ['src/server/index.ts', 'src/worker/index.ts', 'tools/serve-dev-stand-in.mjs']

/**
 * Why a live member of an ended gate's group is not the start's own, as a phrase that names it, or null when it is. It
 * is the start's own when it runs as this user, it started within the gate's life, and it is the start's server, its
 * worker or serve-dev's stand-in, known as servingUpgradeTopology knows them: by its entry, its checkout and its
 * program, which is this Node. `gate` holds the gate's start and end, in clock ticks since boot. A member that has
 * ended since its group was listed is no longer in the group, and is null too.
 */
export function whyNotTheStartsOwn(pid, gate, c) {
  let record, uids
  try {
    // Not currentProcessRecord, which reads the group's leader: here the leader is the gate, and the gate has ended.
    record = { ...bootstrapProcessIdentity(pid), cwd: realpathSync(`/proc/${pid}/cwd`), argv: readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean) }
    uids = /^Uid:\s+(.+)$/m.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1].trim().split(/\s+/).map(Number) ?? []
  } catch (error) {
    if (['ENOENT', 'ESRCH'].includes(error.code)) return null
    return `${aProcessByItsName(pid)}, which could not be read (${error.code ?? error.message})`
  }
  if (uids.length === 0 || uids.some(uid => uid !== process.getuid())) return `${aProcessByItsName(pid)}, which does not run as this user`
  const started = Number(record.startTime)
  if (started < gate.startTicks) return `${aProcessByItsName(pid)}, which started before the gate started`
  // The gate's end is an inclusive bound: a member that started in the tick in which the gate ended counts as the
  // start's own. A tick is 10 ms at 100 a second, and a member started in it is almost surely the start's own work. Do
  // not make this a strict "before".
  if (started > gate.endTicks) return `${aProcessByItsName(pid)}, which started after the gate ended`
  const known = THE_STARTS_OWN_ENTRIES.some(entry => entryIs(record, c.stableCheckout, entry)) && record.cwd === c.stableCheckout
    && bootstrapProcessProgram(pid).program === realpathSync(process.execPath)
  return known ? null : `${aProcessByItsName(pid)}, which is not the start's server, its worker or serve-dev's stand-in`
}

/** An operator can retain this exact configuration for the next transaction. */
export function upgradeServiceGroups(topology, c) {
  return [...new Map(topology.records.map(record => [record.pgid, {
    pgid: record.pgid, startTime: record.groupLeader.startTime,
    cwd: c.stableCheckout, database: c.database, port: c.servicePort,
  }])).values()]
}
