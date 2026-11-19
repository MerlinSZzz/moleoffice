#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * One GPU reading per run; the caller's timer runs this every 30 seconds.
 * node tools/gpu-watch.mjs             hand one reading to the office
 * node tools/gpu-watch.mjs --once --print   print it without sending or saving
 * Reads nvidia-smi, docker inspect and /proc. Commands use argument lists and
 * a 10-second limit. Reads the caller's agent identity and key from the environment.
 * Writes only POST /api/resources/gpu/reading and its quiet-output state at
 * $XDG_CACHE_HOME/mole-office/gpu-watch.json (otherwise $HOME/.cache/mole-office/gpu-watch.json),
 * replaced whole each run with mode 0600. It starts and stops no job or container.
 * Prints changed process sets, failures when their kind, sentence or status changes,
 * and recovery once; repeated successful readings and unchanged failures are silent.
 * Exit 0: the office took the reading, or print mode completed.
 * Exit 75: the office could not be reached; the next tick can try again.
 * Exit 1: another failure. A card read failure is handed in as an error reading.
 * MOLE_GPU_WATCH_TEST_ROOT replaces / only while carriesTheTestMark is true.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { carriesTheTestMark } from '../src/config/the-test-mark.mjs'
import { localStamp } from '../src/shared/time.ts'
import { ID_LABEL, officeHeaders, theAgentKey, theCgroupPath } from './sandbox-common.mjs'
import { readSetting, settingValue } from '../src/config/settings.mjs'
import { whereIsTheApi } from './where-is-the-api.mjs'

/** @typedef {import('zod').output<typeof import('../src/server/lib/bookings.ts').A_GPU_READING>} Reading */
/** @typedef {{kind: 'sandbox', name: string} | {kind: 'host', unit: string} | {kind: 'unknown', why: string}} Who */
/** @typedef {{set: string | null, state: string, failure?: string | number}} State */

/** Only the suite can replace the filesystem root.
 * @param {Record<string, string | undefined>} [env]
 */
export function theProcRoot(env = process.env) {
  return carriesTheTestMark(env) ? (env['MOLE_GPU_WATCH_TEST_ROOT'] ?? '/') : '/'
}

/** A command's name can contain spaces and closing parentheses.
 * @param {string} stat
 * @returns {number | null}
 */
export function thePgid(stat) {
  const close = stat.lastIndexOf(')')
  if (close < 0) return null
  const field = stat.slice(close + 1).trim().split(/\s+/)[2]
  return field !== undefined && /^\d+$/.test(field) && Number.isSafeInteger(Number(field)) && Number(field) > 0 ? Number(field) : null
}

/** The command clock; an explicit environment lets the suite assert its shipped limit.
 * @param {Record<string, string | undefined>} [env]
 */
export function gpuCommandMilliseconds(env) {
  const value = env === undefined ? settingValue('MOLE_OFFICE_TEST_GPU_COMMAND_LIMIT_MS') : readSetting('MOLE_OFFICE_TEST_GPU_COMMAND_LIMIT_MS', env).value
  return Number(value ?? 10_000)
}

/** @param {string} command @param {string[]} args */
function commandOutput(command, args) {
  const ran = spawnSync(command, args, { encoding: 'utf8', timeout: gpuCommandMilliseconds(), maxBuffer: 1024 * 1024, shell: false })
  if (ran.error) {
    const code = /** @type {NodeJS.ErrnoException} */ (ran.error).code
    throw new Error(code === 'ENOENT' ? `${command} is missing.` : code === 'ETIMEDOUT' ? `${command} did not finish within 10 seconds.` : `${command} could not be read.`)
  }
  if (ran.status !== 0) throw new Error(`${command} failed${ran.status === null ? '' : ` with exit ${ran.status}`}.`)
  return ran.stdout
}

/** @param {string} text @param {boolean} total */
function rows(text, total) {
  const lines = text.trim() === '' ? [] : text.trim().split(/\r?\n/)
  if (total && lines.length !== 1) throw new Error(lines.length > 1 ? 'nvidia-smi listed more than one GPU.' : 'nvidia-smi listed no GPU.')
  return lines.map(line => {
    const parts = line.split(',').map(one => one.trim())
    if (parts.length !== 2 || parts.some(one => !/^\d+$/.test(one) || !Number.isSafeInteger(Number(one))) || Number(parts[0]) <= 0) throw new Error('nvidia-smi printed a reading that is not two valid numbers.')
    return /** @type {[number, number]} */ (parts.map(Number))
  })
}

/** @param {number} pid @param {string} root */
function processIdentity(pid, root) {
  let pgid = null
  /** @type {Who} */
  let who
  try {
    pgid = thePgid(readFileSync(join(root, 'proc', String(pid), 'stat'), 'utf8'))
    const path = theCgroupPath(readFileSync(join(root, 'proc', String(pid), 'cgroup'), 'utf8'))
    if (path === null) throw new Error(`Process ${pid} has no usable cgroup v2 path.`)
    const container = /(?:^|\/)docker-([a-fA-F0-9]{64})\.scope$/.exec(path)
    if (container) {
      const inspected = JSON.parse(commandOutput('docker', ['inspect', /** @type {string} */ (container[1])]))
      if (!Array.isArray(inspected) || inspected.length !== 1 || !inspected[0]?.Config || typeof inspected[0]?.Name !== 'string') throw new Error(`The container for process ${pid} could not be identified.`)
      const name = inspected[0].Config.Labels?.[ID_LABEL]
      if (typeof name === 'string' && name.trim() !== '') who = { kind: 'sandbox', name: name.trim() }
      else who = { kind: 'unknown', why: `a container that is not a sandbox: ${inspected[0].Name.replace(/^\//, '')}` }
    } else {
      const unit = basename(path)
      if (!unit) throw new Error(`Process ${pid} has no named host unit.`)
      who = { kind: 'host', unit }
    }
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code
    who = { kind: 'unknown', why: code === 'ENOENT' ? `The files for process ${pid} were not there when read.` : code ? `The files for process ${pid} could not be read.` : `Process ${pid} could not be identified from its files and container inspection.` }
  }
  return { pgid, who }
}

/** @returns {Reading} */
export function readTheCard() {
  const readAt = localStamp(new Date())
  try {
    const totals = rows(commandOutput('nvidia-smi', ['--query-gpu=memory.total,memory.used', '--format=csv,noheader,nounits']), true)
    const apps = rows(commandOutput('nvidia-smi', ['--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits']), false)
    const [totalMiB, usedMiB] = /** @type {[number, number]} */ (totals[0])
    const root = theProcRoot()
    if (!isAbsolute(root)) throw new Error('The test filesystem root must be absolute.')
    const processes = apps.map(([pid, mib]) => ({ pid, mib, ...processIdentity(pid, root) }))
    return { readAt, totalMiB, usedMiB, processes }
  } catch (error) {
    return { readAt, error: error instanceof Error ? error.message : 'The GPU could not be read.' }
  }
}

/** @param {Reading} reading */
function cardSet(reading) {
  return 'error' in reading ? null : JSON.stringify(reading.processes.map(({ pid, who }) => ({ pid, who })).sort((a, b) => a.pid - b.pid))
}

/** @param {string[]} [args] */
export async function main(args = process.argv.slice(2)) {
  if (args.length !== 0 && !(args.length === 2 && args.includes('--once') && args.includes('--print'))) throw new Error('Use no arguments, or --once --print.')
  const reading = readTheCard()
  if (args.includes('--print')) { console.log(JSON.stringify(reading)); return 0 }
  const workspace = process.env['MOLE_OFFICE_WORKSPACE']
  const agent = process.env['MOLE_OFFICE_AGENT']
  const session = process.env['MOLE_OFFICE_SESSION']
  if (!workspace || !agent || !session || !theAgentKey()) throw new Error('The watcher needs its agent, project, session and key environment.')
  const cache = process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache')
  if (!isAbsolute(cache)) throw new Error('The cache folder must be absolute.')
  const target = join(cache, 'mole-office', 'gpu-watch.json')
  /** @type {State} */
  let before = { set: null, state: 'new' }
  try {
    before = JSON.parse(readFileSync(target, 'utf8'))
    if (!before || (before.set !== null && typeof before.set !== 'string') || typeof before.state !== 'string' || (before.failure !== undefined && typeof before.failure !== 'string' && typeof before.failure !== 'number')) throw new Error('The watcher state file has an invalid shape.')
  } catch (error) { if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error }
  const api = whereIsTheApi(process.env['MOLE_OFFICE_API'])
  const headers = { ...officeHeaders({ workspace, agent, session, key: undefined }), 'x-mole-office-trace': 'gpu-watch' }
  let state = 'taken'
  /** @type {string | number | undefined} */
  let failure
  let code = 0
  let line = ''
  let response
  try {
    response = await fetch(`${api}/api/resources/gpu/reading`, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000), headers, body: JSON.stringify(reading) })
    // Read the response under the same deadline; no second request is made.
    await response.text()
  } catch {
    state = 'down'; code = 75; line = 'The office could not be reached; the next tick will try again.'
  }
  if (state !== 'down' && response && !response.ok) {
    failure = response.status
    state = 'refused'; code = 1; line = `The office refused the GPU reading (HTTP ${response.status}).`
  } else if (state === 'taken') {
    if ('error' in reading) { state = 'card-error'; failure = reading.error; line = `${before.state === 'down' || before.state === 'refused' ? 'The office is taking GPU readings again. ' : ''}The GPU could not be read: ${reading.error}` }
    else if (before.state === 'down' || before.state === 'refused') line = 'The office is taking GPU readings again.'
    else if (before.state === 'card-error') line = 'The GPU can be read again.'
    else if (cardSet(reading) !== before.set) line = `The processes on the GPU changed: ${cardSet(reading)}.`
  }
  if (state !== 'taken' && state === before.state && failure === before.failure) line = ''
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
  writeFileSync(`${target}.new`, JSON.stringify({ set: cardSet(reading), state, failure }), { mode: 0o600 })
  chmodSync(`${target}.new`, 0o600)
  renameSync(`${target}.new`, target)
  if (line) console.log(line)
  return code
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(code => { process.exitCode = code }).catch(error => { console.error(`The GPU watcher could not finish: ${String(error instanceof Error ? error.message : error).replace(/[\r\n]+/g, ' ')}`); process.exitCode = 1 })
}
