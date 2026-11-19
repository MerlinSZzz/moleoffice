// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The two ordinary serve-dev layouts share the bootstrap's process observations. */
import { readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { THE_HOLDER_ENTRY } from '../../src/config/settings.mjs'
import { currentProcessRecord, discoverBootstrapTopology, observeBootstrapTopology } from './stable-bootstrap-processes.mjs'
import { bootstrapProcessIdentity, bootstrapProcessProgram, descendantsOf, isRecordedDescendant } from './stable-bootstrap-support.mjs'

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
  const foreignMember = readdirSync('/proc').filter(name => /^\d+$/.test(name)).some(name => {
    try { const row = bootstrapProcessIdentity(Number(name)); return owners.has(row.pgid) && !['Z', 'X'].includes(row.state) && !withinTopology(row) }
    catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return false; throw error }
  })
  // The holder and everything under it are accepted and never recorded, so the upgrade never signals them.
  const outside = descendantsOf(gate).filter(row => !withinTopology(row))
  const holders = outside.map(row => isTheTerminalHolder(row.pid, server, c)).filter(holder => holder !== null)
  const underAHolder = row => holders.some(holder => row.pid === holder.pid || isRecordedDescendant(row.pid, holder))
  if (foreignMember || outside.some(row => !underAHolder(row))) fail('The ordinary topology has a process outside its supervisor, server and worker.')
  return { gate, supervisor, server, worker, holders, records }
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
  let topology
  if (gate.pid !== supervisor.pid) topology = discoverBootstrapTopology(gate, c.stableCheckout, quietJournal)
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
  const observed = checkTopology(topology, gate, c)
  const expected = [gate.pgid, observed.server.pgid, ...(observed.worker ? [observed.worker.pgid] : [])]
  if (c.serviceGroups.length !== expected.length || c.serviceGroups.some(row => !expected.includes(row.pgid))) fail('Recorded groups must be exactly the ordinary serve-dev topology groups.')
  if (pids.some(pid => ![observed.supervisor.pid, observed.server.pid].includes(pid))) fail('An ordinary listener is outside the serve-dev topology.')
  return observed
}

/** An operator can retain this exact configuration for the next transaction. */
export function upgradeServiceGroups(topology, c) {
  return [...new Map(topology.records.map(record => [record.pgid, {
    pgid: record.pgid, startTime: record.groupLeader.startTime,
    cwd: c.stableCheckout, database: c.database, port: c.servicePort,
  }])).values()]
}
