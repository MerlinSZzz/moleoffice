// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A separate process cleans up even when the merge tool is killed. No entry state is changed here. */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { theProcessAt } from '../../src/config/session-process.mjs'
import { theOfficeKey } from '../../src/config/office-key.mjs'
import { localStamp } from '../../src/shared/time.ts'
import { KEY_HEADER } from '../../src/config/key-header.mjs'

/** The sentence startCleanup throws when its caller does not hand it the environment the watcher is to run in. */
export const START_CLEANUP_NEEDS_THE_WATCHERS_ENVIRONMENT = 'The cleanup watcher was not started: startCleanup needs the environment the watcher runs in as its second argument, and its caller did not give it one.'

let watcher = null
let ended = null
export function startCleanup(config, environment) {
  if (typeof environment !== 'object' || environment === null) throw new Error(START_CLEANUP_NEEDS_THE_WATCHERS_ENVIRONMENT)
  // The caller hands the environment the watcher runs in.
  watcher = spawn(process.execPath, [fileURLToPath(import.meta.url), '--watch'], { env: environment, detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  ended = new Promise((resolve) => watcher.once('exit', resolve))
  watcher.send({ type: 'configure', config })
  return watcher.pid
}
export function keepForCleanup(change) { if (watcher?.connected) watcher.send(change) }

/**
 * HOW LONG ONE ANSWER OF THE OFFICE MAY TAKE WHILE A SUITE RUNS, before it counts as none. The cleanup's asks and the
 * tool's health watch (office-keeper.mjs) both read it. The cleanup gave an answer 5 seconds until wave 13u round 185.
 * During one entry's suite the health watch saw 14 of 289 answers take over 10 seconds, the slowest
 * 19.4. So the cleanup could not read a withdrawn entry while a suite ran, and its log said "entry state could not be
 * read during testing" each time.
 */
export const AN_OFFICE_ANSWER_DURING_A_SUITE_MS = 30_000

/**
 * THE PROCESS GROUPS THE CLEANUP NEVER SIGNALS, whatever was recorded. On 15 October 2026 a line sandbox ended with
 * exit 0 while a worker ran a test of the merge tool that drove this cleanup. A group signal from inside that reached
 * the container's keep-alive is the likely cause, though it was not proven. `process.kill(-pid)` turns group 1 into
 * kill(-1), which is every process this user may signal, and 0 into the caller's own group. Group 1 is the first
 * process of the computer or of the container, and the cleanup's own group holds the cleanup. A cleanup that cannot
 * read its own group signals none. Says why a group is refused, or null when it may be signalled.
 * @param {unknown} pgid
 * @param {number | null} ownGroup
 * @returns {string | null}
 */
export function whyAGroupIsNeverSignalled(pgid, ownGroup) {
  if (typeof pgid !== 'number' || !Number.isSafeInteger(pgid) || pgid < 1) return `${String(pgid)} is not a process group id`
  if (pgid === 1) return 'group 1 is the first process of the computer or of the container'
  if (ownGroup === null) return 'the cleanup could not read its own process group'
  if (pgid === ownGroup) return `group ${pgid} is the cleanup's own`
  return null
}
export async function finishCleanup() {
  if (watcher?.connected) watcher.send({ type: 'finish' })
  if (ended !== null) await ended
}

if (process.argv[2] === '--watch') {
  let config, sandbox = null, seat = null, timer, stopping = false
  const groups = new Map()
  const say = (text) => appendFileSync(config.log, `${localStamp(new Date())} ${text}\n`)
  const ask = async (method, path, body) => {
    const key = theOfficeKey().key
    const reply = await fetch(config.api + path, { method, headers: { ...config.headers, ...(key === null ? {} : { [KEY_HEADER]: key }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(AN_OFFICE_ANSWER_DURING_A_SUITE_MS) })
    if (!reply.ok) throw new Error(`${method} ${path}: ${reply.status} ${await reply.text()}`)
    return reply.json()
  }
  // THE WITHDRAWN-ENTRY-TOOL-STOPS GATE, block only, counted once per tool run after its cleanup, when the entry is
  // withdrawn or superseded. A count the office does not take is said in the log and changes nothing else.
  const countAGateMet = async (id, position) => {
    try { await ask('POST', `/api/office/gates/${encodeURIComponent(id)}/met`, { position }) }
    catch (err) { say(`gate ${id} was not counted: ${err.message}`) }
  }
  // The tool's channel closed, so the entry's state is read once, after the cleanup.
  const READ_THE_ENTRY = Symbol('read the entry after the cleanup')
  const stop = async (why, entryState = null) => {
    if (stopping) return
    stopping = true
    clearInterval(timer)
    if (why !== 'merge tool ended') groups.set(config.ownerGroup, config.ownerGroupStartedAt)
    let groupsStopped = true
    const own = theProcessAt(process.pid)
    const toSignal = new Map()
    for (const [pid, startedAt] of groups) {
      const never = whyAGroupIsNeverSignalled(pid, own.here ? own.pgid : null)
      if (never === null) toSignal.set(pid, startedAt)
      else { groupsStopped = false; say(`recorded process group ${pid} was not signalled: ${never}`) }
    }
    for (const [pid, startedAt] of toSignal) {
      const now = theProcessAt(pid)
      if (startedAt === null || (now.here && now.startedAt === null)) { groupsStopped = false; say(`could not confirm the identity of recorded process group ${pid}`); continue }
      if (!now.here || now.startedAt !== startedAt) continue
      try { process.kill(-pid, 'SIGTERM') } catch (err) { if (err.code !== 'ESRCH') { groupsStopped = false; say(`could not stop recorded process group ${pid}: ${err.message}`) } }
    }
    if (toSignal.size > 0) await new Promise((resolve) => setTimeout(resolve, 1000))
    for (const [pid, startedAt] of toSignal) {
      const now = theProcessAt(pid)
      if (startedAt === null || (now.here && now.startedAt === null)) { groupsStopped = false; say(`could not confirm the identity of recorded process group ${pid}`); continue }
      if (now.here && now.startedAt !== startedAt) continue
      try { process.kill(-pid, 'SIGKILL') } catch (err) { if (err.code !== 'ESRCH') { groupsStopped = false; say(`could not force-stop recorded process group ${pid}: ${err.message}`) } }
    }
    let down = sandbox === null
    if (sandbox !== null) {
      const result = spawnSync(process.execPath, [config.launcher, 'down', sandbox, '--force', ...config.identity], { env: config.environment, detached: true, timeout: 15000, killSignal: 'SIGKILL', encoding: 'utf8' })
      down = result.status === 0
      if (!down) say(`sandbox ${sandbox} cleanup failed: ${result.error?.message ?? result.stderr ?? result.stdout}`)
    }
    let released = seat === null
    if (seat !== null) {
      try { await ask('POST', `/api/slots/${encodeURIComponent(seat)}/release`, { note: why }); released = true }
      catch (err) { say(`seat ${seat} release failed: ${err.message}; its dedicated holder group ends now`) }
    }
    say(`merge cleanup: ${why}; ${groups.size === 0 ? 'no process groups recorded' : `recorded process groups ${groupsStopped ? 'stopped' : 'not confirmed stopped'}`}; ${sandbox === null ? 'no sandbox recorded' : `sandbox ${down ? 'stopped' : 'not confirmed stopped'}`}; ${seat === null ? 'no seat recorded' : `seat ${released ? 'returned' : 'release not confirmed'}`}`)
    let state = entryState
    if (state === READ_THE_ENTRY) {
      try { state = (await ask('GET', `/api/merge-queue/${encodeURIComponent(config.entry)}`)).entry?.state ?? null }
      catch (err) { state = null; say(`entry state could not be read after the cleanup, so no gate was counted: ${err.message}`) }
    }
    if (state === 'withdrawn' || state === 'superseded') await countAGateMet('withdrawn-entry-tool-stops', 'block')
    process.exit(groupsStopped && down && released ? 0 : 1)
  }
  let reading = false
  const check = async () => {
    if (reading || stopping) return
    reading = true
    try {
      const answer = await ask('GET', `/api/merge-queue/${encodeURIComponent(config.entry)}`)
      if (['withdrawn', 'cancelled', 'superseded'].includes(answer.entry?.state)) {
        await stop(`entry ${config.entry} is ${answer.entry.state}`, answer.entry.state)
      }
    } catch (err) { if (!stopping) say(`entry state could not be read during testing: ${err.message}`) }
    finally { reading = false }
  }
  process.on('message', (message) => {
    if (message.type === 'configure') { config = message.config; timer = setInterval(check, 15000) }
    else if (message.type === 'sandbox') sandbox = message.name
    else if (message.type === 'sandbox-down') sandbox = null
    else if (message.type === 'seat') seat = message.id
    else if (message.type === 'seat-returned') seat = null
    else if (message.type === 'group') groups.set(message.pid, message.startedAt)
    else if (message.type === 'group-ended') groups.delete(message.pid)
    else if (message.type === 'finish') void stop('merge tool ended')
  })
  process.on('disconnect', () => { if (config) void stop('merge tool process ended', READ_THE_ENTRY) })
}
