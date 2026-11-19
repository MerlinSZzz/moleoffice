#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE GPU TOOL: the one way an agent runs a job on this machine's card. A resource is used only through its
 * tools; each tool checks the limit before a use and records the use and its cost after.
 *
 * node tools/gpu.mjs                     print where the card stands, for you
 * node tools/gpu.mjs run --gib N --minutes M --purpose "..." [--booking ID] [--env NAME=VALUE ...] -- command args...
 *
 * `run` checks before the use: it takes your booking whose time is now and holds N GiB, or books from now, and it
 * reads the card itself, so a job with no booking that fills the card is seen before the command starts. Then it
 * starts the command in its own process group, names that group as the booking's program, reads the card every
 * 5 seconds for the group's memory, and when the whole group has ended records the use with POST
 * /api/bookings/<id>/use: its start, its end, the peak and how the command ended.
 *
 * Exit: the command's own exit code once it ran (128 + the signal's number when a signal ended it).
 * Exit 75: nothing was started, and asking later can work: the booking starts later, the card has no room now, or
 *          the office could not be reached.
 * Exit 1: nothing was started, or the use could not be recorded, for a reason asking again does not change.
 *
 * THE JOB'S ENVIRONMENT is built from an allow-list, never inherited: the names in THE_JOBS_VARIABLES, the names
 * starting with THE_JOBS_PREFIXES (the CUDA and driver variables), and what the caller declares with --env NAME=VALUE.
 * Nothing else the caller carries reaches the job. A name that is the office's, or one of the keys a model never gets,
 * or that reads as a key, token, secret, password or credential, is left out even when the list allows it, and declaring
 * one stops the run. A value equal to a secret the caller carries stops the run too, whatever its name.
 *
 * Reads MOLE_OFFICE_WORKSPACE, MOLE_OFFICE_AGENT and MOLE_OFFICE_SESSION, and the key from the environment through
 * officeHeaders. The key is never printed, and the job's environment does not hold it. The key stays in the caller's
 * own environment: this tool does not keep it from the agent that runs the tool.
 */
import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { THE_GPU_TOOL_READS_EVERY_MS } from '../src/shared/bookings.ts'
import { localStamp, parseLocalStamp } from '../src/shared/time.ts'
import { readTheCard } from './gpu-watch.mjs'
import { askTheOffice, leftOut, officeHeaders, theOfficeSaid } from './sandbox-common.mjs'
import { whereIsTheApi } from './where-is-the-api.mjs'

/** @typedef {{ booking: string, holder: { kind: string, id: string }, state: string, startsAt: string, endsAt: string, gib: number, programSays?: string | null }} Line */

/**
 * THE BOOKING `run` USES: the caller's waiting booking whose time is now and that holds at least `gib`, the first in
 * the line. A booking whose program is already named is in use, so it is not taken. Null when there is none.
 * @param {readonly Line[]} line @param {string} me @param {number} gib @param {number} now
 * @returns {string | null}
 */
export function theBookingToUse(line, me, gib, now) {
  const found = line.find((l) => {
    const start = parseLocalStamp(l.startsAt)
    const end = parseLocalStamp(l.endsAt)
    return (
      l.holder.kind === 'agent' && l.holder.id === me && l.state === 'waiting' && l.gib >= gib &&
      start !== null && end !== null && start <= now && now < end
    )
  })
  return found === undefined ? null : found.booking
}

/**
 * THE CARD MEMORY ONE PROCESS GROUP HOLDS, in MiB, from one reading: the sum over its processes on the card.
 * @param {readonly { pgid: number | null, mib: number }[]} processes @param {number} pgid
 */
export function theGroupsMiB(processes, pgid) {
  return processes.filter((p) => p.pgid === pgid).reduce((sum, p) => sum + p.mib, 0)
}

/**
 * THE EXIT CODE THE TOOL PASSES ON, and how the command ended in words.
 * @param {number | null} code @param {NodeJS.Signals | null} signal
 */
export function howItEnded(code, signal) {
  if (signal !== null) return { exit: 128 + (constants.signals[signal] ?? 0), ended: `signal ${signal}` }
  return { exit: code ?? 1, ended: `exit ${String(code ?? 'unknown')}` }
}

/** THE NAMES A JOB GETS FROM ITS CALLER: what a program needs to find itself, its files, its language and its Python. */
export const THE_JOBS_VARIABLES = Object.freeze([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LANGUAGE', 'TZ', 'TMPDIR', 'TERM',
  'LD_LIBRARY_PATH', 'PYTHONPATH', 'VIRTUAL_ENV', 'CONDA_PREFIX', 'CONDA_DEFAULT_ENV',
])

/** THE PREFIXES A JOB GETS FROM ITS CALLER: the CUDA and driver variables, and the locale. */
export const THE_JOBS_PREFIXES = Object.freeze(['CUDA_', 'NVIDIA_', 'LC_'])

/**
 * WHETHER A NAME HOLDS A SECRET: the office's names and the keys a model never gets, by the list the sandbox shares,
 * and any name that reads as a key, token, secret, password or credential.
 * @param {string} name
 */
export function isASecretsName(name) {
  return leftOut(`${name}=`) || /KEY|TOKEN|SECRET|PASSW|CREDENTIAL/i.test(name)
}

/**
 * THE JOB'S ENVIRONMENT, from the caller's and the job's declared variables. Throws, naming the variable and never its
 * value, when a declared name is a secret's or a value is a secret the caller carries.
 * @param {Record<string, string | undefined>} callers @param {readonly [string, string][]} declared
 * @returns {Record<string, string>}
 */
export function theJobsEnvironment(callers, declared) {
  /** @type {Record<string, string>} */
  const env = {}
  for (const [name, value] of Object.entries(callers)) {
    if (value === undefined || isASecretsName(name)) continue
    if (THE_JOBS_VARIABLES.includes(name) || THE_JOBS_PREFIXES.some((p) => name.startsWith(p))) env[name] = value
  }
  for (const [name, value] of declared) {
    if (isASecretsName(name)) throw new Error(`--env ${name} names a key or a secret, and the job is not given one. Nothing was started.`)
    env[name] = value
  }
  const secrets = new Set(Object.entries(callers).filter(([name, value]) => value && isASecretsName(name)).map(([, value]) => value))
  for (const [name, value] of Object.entries(env)) {
    if (secrets.has(value)) throw new Error(`The job's ${name} holds the value of a key or secret you carry, and the job is not given one. Nothing was started.`)
  }
  return env
}

/**
 * START THE JOB in its own process group, with the environment theJobsEnvironment builds and nothing inherited.
 * @param {string} command @param {readonly string[]} args @param {Record<string, string | undefined>} callers
 * @param {readonly [string, string][]} declared @param {import('node:child_process').StdioOptions} [stdio]
 */
export function startTheJob(command, args, callers, declared, stdio = 'inherit') {
  return spawn(command, args, { detached: true, stdio, env: theJobsEnvironment(callers, declared) })
}

/** @param {string[]} args */
function theRunArguments(args) {
  const cut = args.indexOf('--')
  if (cut < 0 || cut === args.length - 1) throw new Error('Name the command after --, e.g. node tools/gpu.mjs run --gib 8 --minutes 60 --purpose "Train" -- python train.py')
  const flags = args.slice(0, cut)
  /** @param {string} name */
  const flag = (name) => {
    const at = flags.indexOf(`--${name}`)
    return at < 0 ? undefined : flags[at + 1]
  }
  const gib = Number(flag('gib'))
  const minutes = Number(flag('minutes'))
  const purpose = flag('purpose')?.trim() ?? ''
  if (!Number.isInteger(gib) || gib < 1) throw new Error('--gib is the card memory in whole GiB, 1 or more.')
  if (!Number.isInteger(minutes) || minutes < 1) throw new Error('--minutes is how long, in whole minutes.')
  if (purpose === '') throw new Error('--purpose says what the job is for.')
  /** @type {[string, string][]} */
  const declared = []
  flags.forEach((one, at) => {
    if (one !== '--env') return
    const pair = flags[at + 1] ?? ''
    const name = pair.includes('=') ? pair.slice(0, pair.indexOf('=')) : ''
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`--env takes NAME=VALUE, and "${name || pair}" is not a variable's name.`)
    declared.push([name, pair.slice(name.length + 1)])
  })
  return { gib, minutes, purpose, declared, booking: flag('booking'), command: /** @type {string} */ (args[cut + 1]), commandArgs: args.slice(cut + 2) }
}

/** @param {number} pgid */
function theGroupIsGone(pgid) {
  try {
    process.kill(-pgid, 0)
    return false
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code === 'ESRCH'
  }
}

/** @param {number} ms */
const pause = (ms) => new Promise((done) => setTimeout(done, ms))

/** @param {string[]} [args] @returns {Promise<number>} */
export async function main(args = process.argv.slice(2)) {
  const workspace = process.env['MOLE_OFFICE_WORKSPACE']
  const agent = process.env['MOLE_OFFICE_AGENT']
  const session = process.env['MOLE_OFFICE_SESSION']
  if (!workspace || !agent || !session) throw new Error('The GPU tool needs MOLE_OFFICE_WORKSPACE, MOLE_OFFICE_AGENT and MOLE_OFFICE_SESSION. Nothing was asked.')
  const api = whereIsTheApi(process.env['MOLE_OFFICE_API'])
  const headers = { ...officeHeaders({ workspace, agent, session, key: undefined }), 'x-mole-office-trace': 'gpu' }
  /** @param {string} path @param {string} [method] @param {unknown} [body] */
  const ask = (path, method = 'GET', body = undefined) => askTheOffice(api, path, { method, headers, ...(body === undefined ? {} : { body }) })
  /** @param {{ status: number | null }} reply */
  const notReached = (reply) => reply.status === null

  const view = await ask('/api/resources/gpu?secondLevel=show')
  if (view.status !== 200) {
    console.error(`Host GPU: the office did not answer where the card stands: ${theOfficeSaid(view)}. Nothing was started.`)
    return notReached(view) ? 75 : 1
  }
  if (args.length === 0) {
    console.log(view.body.says)
    return 0
  }
  if (args[0] !== 'run') throw new Error('Use no arguments, or run --gib N --minutes M --purpose "..." -- command.')
  const want = theRunArguments(args.slice(1))
  // BEFORE THE USE: the job's environment, so a declared secret stops the run before anything is booked.
  theJobsEnvironment(process.env, want.declared)

  // BEFORE THE USE: the booking.
  let booking = want.booking ?? theBookingToUse(view.body.secondLevel?.line ?? [], agent, want.gib, Date.now())
  let madeIt = false
  if (booking === null) {
    const made = await ask('/api/bookings', 'POST', { resource: 'gpu', gib: want.gib, minutes: want.minutes, purpose: want.purpose, start: 'now' })
    if (made.status !== 200 && made.status !== 201) {
      console.error(`Host GPU: the booking was refused: ${theOfficeSaid(made)}. Nothing was started.`)
      return notReached(made) ? 75 : 1
    }
    booking = /** @type {string} */ (made.body.booking.id)
    madeIt = true
    if (made.body.booking.start > Date.now() + 60_000) {
      console.log(`${made.body.says} Nothing was started. Run again then with --booking ${booking}.`)
      return 75
    }
  }
  const cancel = async () => {
    if (!madeIt) return ''
    const cancelled = await ask(`/api/bookings/${booking}/cancel`, 'POST')
    return cancelled.status === 200 ? ` The tool's booking ${booking} was cancelled.` : ` The tool's booking ${booking} could not be cancelled: ${theOfficeSaid(cancelled)}.`
  }

  // BEFORE THE USE: the card itself, so a job with no booking is seen.
  const before = readTheCard()
  if ('error' in before) {
    console.error(`Host GPU: the card could not be read (${before.error}), so the tool cannot check there is room. Nothing was started.${await cancel()}`)
    return 1
  }
  const freeMiB = before.totalMiB - before.usedMiB
  if (freeMiB < want.gib * 1024) {
    console.error(
      `Host GPU: the card has ${String(Math.floor(freeMiB / 1024))} GiB free now and this job needs ${String(want.gib)}. ` +
        `${String(before.processes.length)} ${before.processes.length === 1 ? 'process is' : 'processes are'} on it. Nothing was started.${await cancel()}`,
    )
    return 75
  }

  // THE USE.
  const startedAt = localStamp(new Date())
  const child = startTheJob(want.command, want.commandArgs, process.env, want.declared)
  const spawned = await new Promise((done) => {
    child.once('spawn', () => done(true))
    child.once('error', (error) => done(error))
  })
  if (spawned !== true || child.pid === undefined) {
    console.error(`Host GPU: ${want.command} could not be started: ${spawned instanceof Error ? spawned.message : 'no process id'}.${await cancel()}`)
    return 1
  }
  const pgid = child.pid
  const named = await ask(`/api/bookings/${booking}/program`, 'POST', { pid: pgid })
  if (named.status !== 200) {
    try { process.kill(-pgid, 'SIGTERM') } catch { /* the group is already gone */ }
    console.error(`Host GPU: the office would not name the command as booking ${booking}'s program: ${theOfficeSaid(named)}. Process group ${String(pgid)} was stopped.${await cancel()}`)
    return 1
  }
  console.error(`Host GPU: ${named.body.says}`)
  for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
    process.on(signal, () => { try { process.kill(-pgid, signal) } catch { /* the group is already gone */ } })
  }
  let peak = 0
  let read = 0
  let unread = 0
  let lastError = ''
  const reader = setInterval(() => {
    const r = readTheCard()
    if ('error' in r) { unread += 1; lastError = r.error; return }
    read += 1
    peak = Math.max(peak, theGroupsMiB(r.processes, pgid))
  }, THE_GPU_TOOL_READS_EVERY_MS)
  /** @type {[number | null, NodeJS.Signals | null]} */
  const [code, signal] = await new Promise((done) => child.once('exit', (c, s) => done([c, s])))
  while (!theGroupIsGone(pgid)) await pause(1_000)
  clearInterval(reader)

  // AFTER THE USE: record it.
  const { exit, ended } = howItEnded(code, signal)
  const seconds = THE_GPU_TOOL_READS_EVERY_MS / 1000
  const peakSays =
    read === 0
      ? unread === 0
        ? `The command ended before the first reading, ${String(seconds)} seconds after it started.`
        : `No reading of the card succeeded: ${lastError}`
      : `Read every ${String(seconds)} seconds: ${String(read)} ${read === 1 ? 'reading' : 'readings'}` +
        (unread === 0 ? '.' : `, and ${String(unread)} that could not read the card.`)
  const use = await ask(`/api/bookings/${booking}/use`, 'POST', {
    startedAt,
    endedAt: localStamp(new Date()),
    peakMiB: read === 0 ? null : peak,
    peakSays,
    ended,
  })
  if (use.status !== 200) {
    console.error(`Host GPU: the command ended with ${ended}, and its use could not be recorded: ${theOfficeSaid(use)}.`)
    return exit === 0 ? 1 : exit
  }
  console.error(`Host GPU: ${use.body.says}`)
  return exit
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main()
    .then((code) => { process.exitCode = code })
    .catch((error) => {
      console.error(`The GPU tool could not finish: ${String(error instanceof Error ? error.message : error).replace(/[\r\n]+/g, ' ')}`)
      process.exitCode = 1
    })
}
