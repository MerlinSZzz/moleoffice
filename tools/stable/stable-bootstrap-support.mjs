// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Local bootstrap checks. Importing this module opens no SQLite connection. */
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readdirSync, readSync, realpathSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { theDatabaseHolders } from '../database-holders.mjs'
import { STABLE_SERVICE_SETTINGS } from './stable-service-settings.mjs'
import { envFileValues, findEnvFile, portsToKeepClearFrom, readSetting } from '../../src/config/settings.mjs'

export const BOOTSTRAP_SERVICE_SETTINGS = STABLE_SERVICE_SETTINGS
const PROCESS_NAMES = new Set([...BOOTSTRAP_SERVICE_SETTINGS, 'MOLE_OFFICE_DB', 'MOLE_OFFICE_PORT', 'MOLE_OFFICE_START_MODE', 'HOME', 'NODE_ENV'])
export const bootstrapFail = message => { throw new Error(`Stable bootstrap refused: ${message}`) }
/** The configured evidence as the prepared note, the announcement and the outcome pin it. */
export function bootstrapEvidencePin(c) {
  return c.evidence.kind === 'owner-decision' ? { kind: 'owner-decision', decision: c.evidence.decision } : { id: c.evidence.recordId, seq: 1, contentHash: c.evidence.contentHash }
}
export const containsPath = (root, path) => path === root || path.startsWith(root + sep)
export const bootstrapGitEnvironment = () => ({ PATH: process.env.PATH, HOME: '/nonexistent', LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0' })

export function bootstrapGit(root, args) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', root, ...args], { env: bootstrapGitEnvironment(), encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024 })
  if (result.error || result.status !== 0) bootstrapFail(`Git ${args[0]} could not verify the configured repository.`)
  return result.stdout.trim()
}

export function canonicalExisting(path, label, directory = false) {
  try {
    if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) throw new Error()
    const stat = lstatSync(path)
    if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error()
    return stat
  } catch { bootstrapFail(`${label} must be an existing canonical absolute ordinary ${directory ? 'directory' : 'file'}.`) }
}

/** Linux process births are local observations; this reads no environment. */
export function bootstrapProcessIdentity(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)
  return { pid, ppid: Number(fields[1]), pgid: Number(fields[2]), startTime: fields[19], state: fields[0] }
}

/** Read the executable the kernel ran. A replaced binary has a target ending in (deleted), which realpath cannot resolve and is unreadable. */
export function bootstrapProcessProgram(pid) {
  try { return { program: realpathSync(`/proc/${pid}/exe`) } }
  catch (error) { return { unreadable: error.code ?? error.message } }
}

/** Discard unmatched values as bytes arrive; never materialize a whole environment. */
export function readNamedProcessVariables(pid, names) {
  if (!Array.isArray(names) || names.some(name => !PROCESS_NAMES.has(name))) bootstrapFail('Process variable names must belong to the nonsecret allowlist.')
  const wanted = new Set(names), values = {}, chunk = Buffer.alloc(4096)
  const fd = openSync(`/proc/${pid}/environ`, 'r')
  let name = '', readingName = true, selected = false, value = []
  try {
    for (;;) {
      const count = readSync(fd, chunk, 0, chunk.length, null)
      if (count === 0) break
      for (let i = 0; i < count; i++) {
        const byte = chunk[i]
        if (byte === 0) {
          if (selected) values[name] = Buffer.from(value).toString('utf8')
          name = ''; readingName = true; selected = false; value = []
        } else if (readingName) {
          if (byte === 61) { readingName = false; selected = wanted.has(name) }
          else if (name.length < 256) name += String.fromCharCode(byte)
          else bootstrapFail('An observed process variable name is too long.')
        } else if (selected) {
          if (value.length >= 16384) bootstrapFail('A named process setting is too long.')
          value.push(byte)
        }
      }
    }
    if (name !== '' || !readingName) bootstrapFail('The named process settings read was incomplete.')
    return values
  } finally { chunk.fill(0); value.fill(0); closeSync(fd) }
}

export function inspectNamedProcess(recorded, names = []) {
  const actual = bootstrapProcessIdentity(recorded.pid)
  const leader = bootstrapProcessIdentity(recorded.pgid)
  if (['Z', 'X'].includes(actual.state) || ['Z', 'X'].includes(leader.state) || actual.ppid !== recorded.ppid || actual.pgid !== recorded.pgid || actual.startTime !== recorded.startTime || leader.pgid !== recorded.pgid || leader.startTime !== recorded.groupLeader.startTime || recorded.groupLeader.pid !== recorded.pgid) bootstrapFail('A recorded process or group start identity changed; no signal is authorized.')
  if (realpathSync(`/proc/${recorded.pid}/cwd`) !== recorded.cwd) bootstrapFail('A recorded process cwd differs.')
  const argv = readFileSync(`/proc/${recorded.pid}/cmdline`, 'utf8').split('\0').filter(Boolean)
  if (!isDeepStrictEqual(argv, recorded.argv)) bootstrapFail('A recorded process argv differs.')
  return { ...actual, cwd: recorded.cwd, argv, variables: readNamedProcessVariables(recorded.pid, names) }
}

export function isRecordedDescendant(pid, ancestor) {
  const seen = new Set()
  for (let current = bootstrapProcessIdentity(pid); current.ppid > 1 && !seen.has(current.pid); current = bootstrapProcessIdentity(current.ppid)) {
    seen.add(current.pid)
    if (current.ppid === ancestor.pid) return bootstrapProcessIdentity(ancestor.pid).startTime === ancestor.startTime
  }
  return false
}

/** Every listener on each port now, read with ss, which changes nothing. A listener whose process ss cannot name has no pids. */
function listenersOn(ports) {
  return [...new Set(ports)].flatMap(port => {
    const result = spawnSync('ss', ['-H', '-ltnp', `sport = :${port}`], { encoding: 'utf8', timeout: 5000, env: bootstrapGitEnvironment() })
    if (result.error || result.status !== 0) bootstrapFail('The configured listeners could not be inspected.')
    return result.stdout.trim().split('\n').filter(Boolean).map(line => {
      const endpoint = line.trim().split(/\s+/)[3]
      const match = /^(?:\[([^\]]+)\]|(.+)):(\d+)$/.exec(endpoint ?? '')
      if (!match) bootstrapFail('A configured listener has unknown address or process ownership.')
      return { address: match[1] ?? match[2], port: Number(match[3]), pids: [...new Set([...line.matchAll(/pid=(\d+)/g)].map(m => Number(m[1])))] }
    })
  })
}

export function readListeners(ports) {
  const rows = listenersOn(ports)
  if (rows.some(row => !row.pids.length)) bootstrapFail('A configured listener has unknown address or process ownership.')
  return rows
}

/**
 * Why a first-handoff rehearsal may not use `port`: one sentence for each rule that refuses it, and none when it may.
 * Both rules read facts at this moment and nothing from the repository, so no office's ports are written into the product.
 * Rule (a): something on this machine already listens on the port, apart from `ownPids`, the throwaway office's own
 * recorded processes. A listener whose process this user cannot see is something else.
 * Rule (b): `env` names the port in MOLE_OFFICE_REHEARSAL_KEEP_CLEAR_PORTS.
 */
export function rehearsalPortRefusals(port, { ownPids = [], env }) {
  const refusals = []
  const others = listenersOn([port]).filter(row => !row.pids.length || row.pids.some(pid => !ownPids.includes(pid)))
  if (others.length) refusals.push(`rule (a) refused port ${port}: something on this machine already listens on it (${others.map(row => `${row.address}, ${row.pids.length ? `pid ${row.pids.join(' and pid ')}` : 'a process this user cannot see'}`).join('; ')})`)
  if (portsToKeepClearFrom(env).includes(port)) refusals.push(`rule (b) refused port ${port}: MOLE_OFFICE_REHEARSAL_KEEP_CLEAR_PORTS names it`)
  return refusals
}

export function verifyListeners(actual, expected, identities) {
  const key = row => `${row.address}:${row.port}`
  if (!isDeepStrictEqual([...new Set(actual.map(key))].sort(), [...new Set(expected.map(key))].sort())) bootstrapFail('The API/redirect listener addresses or ports differ from the recorded set.')
  if (actual.some(row => row.pids.some(pid => !identities.some(identity => identity.pid === pid)))) bootstrapFail('A listener belongs to an unrecorded process.')
}

/**
 * The database a recorded process opens: its own MOLE_OFFICE_DB, or, when it was started without one, the one the server
 * reads from the checkout's .env at start and hands to its worker, resolved against the checkout as canonicalDatabasePath
 * resolves it. The data-folder move starts the office this way, so the database comes from the .env the move wrote.
 * The real preparation also asks the running server which database it opened (verifyBootstrapServing).
 */
export function theDatabaseOf(observed, checkout) {
  if (observed.variables.MOLE_OFFICE_DB !== undefined) return observed.variables.MOLE_OFFICE_DB
  return resolve(checkout, String(readSetting('MOLE_OFFICE_DB', envFileValues(findEnvFile(checkout).path)).value))
}

export function verifyLocalTopology(c) {
  const identities = Object.values(c.topology).filter(Boolean)
  const supervisor = c.topology.supervisor
  for (const identity of identities) {
    if (identity.pid !== supervisor.pid && !isRecordedDescendant(identity.pid, supervisor)) bootstrapFail('A recorded server/worker is not a descendant of the recorded supervisor.')
    const observed = inspectNamedProcess(identity, ['MOLE_OFFICE_DB', 'MOLE_OFFICE_PORT', 'HOME', ...BOOTSTRAP_SERVICE_SETTINGS])
    if (theDatabaseOf(observed, c.developmentRepository) !== c.database || Number(observed.variables.MOLE_OFFICE_PORT) !== c.servicePort || observed.variables.HOME !== c.serviceHome) bootstrapFail('The recorded process database, port or home differs.')
    // Preserve every named original supervisor startup override. Children still
    // resolve settings from the one main .env through their ordinary loader.
    if (identity.pid === supervisor.pid) for (const name of BOOTSTRAP_SERVICE_SETTINGS) if (observed.variables[name] !== undefined && !Object.hasOwn(c.serviceSettings, name)) bootstrapFail(`An original supervisor override was omitted: ${name}.`)
    for (const [name, value] of Object.entries(c.serviceSettings)) if (observed.variables[name] !== value) bootstrapFail(`The named service setting ${name} differs from its process.`)
  }
  verifyListeners(readListeners(c.listeners.map(row => row.port)), c.listeners, identities)
  if (readListeners([c.releaseCheckPort]).length) bootstrapFail('The scratch release-check port is occupied.')
  return identities
}

export function descendantsOf(supervisor) {
  // Enumerate identities only; process contents are read only after ancestry is established.
  return readdirSync('/proc').filter(name => /^\d+$/.test(name)).flatMap(name => {
    try {
      const pid = Number(name), identity = bootstrapProcessIdentity(pid)
      if (['Z', 'X'].includes(identity.state) || !isRecordedDescendant(pid, supervisor)) return []
      return [identity]
    } catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return []; throw error }
  })
}

export function noDatabaseHolders(database) {
  const check = theDatabaseHolders(database)
  if (check.holders.length) bootstrapFail(`The database is held by ${check.holders.map(holder => `process ${holder.pid} (${holder.name})`).join(', ')}.`)
  if (check.unnamedLocks.length) bootstrapFail(`A lock on the database names no process found under /proc: ${check.unnamedLocks.join('; ')}.`)
  return check
}
