// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * Capture a paused stack before an unresponsive child is stopped, or on a hand request.
 * The inspector method was authorized in J4JKZx76YwuS and the fixed close call in EVXbsOmf3h6n.
 * Node 22's internal/process/report installs a JavaScript signal handler, so report-on-signal
 * cannot interrupt a blocked loop. SIGUSR1 reaches Node's inspector thread instead.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as wait } from 'node:timers/promises'
import { REPO_ROOT, THE_SERVER_ENTRY, settings } from '../src/config/settings.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'
import { readTheServiceLock, theProcessReading } from '../src/config/the-service-lock.mjs'
import { theProcessReader } from '../src/config/process-reader.mjs'

/** @param {string} root */
export const diagnosticReportDirectory = (root) => join(root, '.logs', 'reports')
/** @param {string} root @param {number} pid */
const endpointFile = (root, pid) => join(root, '.logs', `inspector-${pid}.json`)

/** Validate before opening either a WebSocket or a TCP probe. @param {string} said */
export function inspectorAddress(said) {
  const address = new URL(said)
  if (!['127.0.0.1', '[::1]'].includes(address.hostname) || address.protocol !== 'ws:' ||
      address.username !== '' || address.password !== '' || address.port === '') {
    throw new Error('The inspector address is not a literal loopback WebSocket address. Nothing was connected.')
  }
  return address
}

/** The supervisor alone reads its child's stderr; the hand tool reads this same observation.
 * @param {string} root @param {number} pid @param {string} line
 */
export function recordInspectorAddress(root, pid, line) {
  const matched = /Debugger listening on (ws:\/\/\S+)/.exec(line)
  if (matched) writeFileSync(endpointFile(root, pid), JSON.stringify({ pid, url: matched[1] }), { mode: 0o600 })
}

/** @typedef {{ now: () => number, pause: (ms: number) => Promise<unknown> }} DiagnosticClock */
/** The real clock remains the default for every diagnostic request. */
const REAL_DIAGNOSTIC_CLOCK = { now: () => Date.now(), pause: wait }

/** @template T @param {Promise<T>} promise @param {number} deadline @param {DiagnosticClock} [clock] @returns {Promise<T>} */
async function before(promise, deadline, clock = REAL_DIAGNOSTIC_CLOCK) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  try {
    return await Promise.race([promise, new Promise((_, fail) => {
      timer = setTimeout(() => fail(new Error('The inspector did not answer before the collection deadline (10 s total limit).')), Math.max(0, deadline - clock.now()))
    })])
  } finally { clearTimeout(timer) }
}

/** @param {URL} address @param {number} deadline @param {DiagnosticClock} [clock] */
async function portRefuses(address, deadline, clock = REAL_DIAGNOSTIC_CLOCK) {
  let last = 'unverified'
  while (clock.now() < deadline) {
    const refused = await new Promise((done) => {
      const probe = createConnection({ host: address.hostname.replace(/^\[|\]$/g, ''), port: Number(address.port) })
      probe.once('connect', () => { last = 'accepting'; probe.destroy(); done(false) })
      probe.once('error', (err) => { last = 'unverified'; done(/** @type {NodeJS.ErrnoException} */ (err).code === 'ECONNREFUSED') })
      probe.setTimeout(Math.max(1, Math.min(100, deadline - clock.now())), () => { probe.destroy(); done(false) })
    })
    if (refused) return 'refused'
    await clock.pause(Math.max(0, Math.min(25, deadline - clock.now())))
  }
  return last
}

/** Worker reports can retain these fields even when the child has exclusion flags.
 * @param {any} value
 */
function removePrivateReportFields(value) {
  if (value === null || typeof value !== 'object') return
  delete value.environmentVariables
  if (value.header !== null && typeof value.header === 'object') {
    delete value.header.networkInterfaces
    delete value.header.host
  }
  for (const child of Object.values(value)) removePrivateReportFields(child)
}

/** @typedef {{ functionName: string, file: string, line: number, column: number }} Frame */
/**
 * @param {number} pid The recorded child itself, never its group.
 * @param {string} root
 * @param {Date} [hangAt]
 * @param {DiagnosticClock} [clock] A test can advance the clock while retaining the shipped ten-second limit.
 * @returns {Promise<{path: string, incomplete: string[]}>}
 */
export async function requestDiagnosticReport(pid, root, hangAt = new Date(), clock = REAL_DIAGNOSTIC_CLOCK) {
  const deadline = clock.now() + 10_000
  // Reserve the final two seconds for resume, close, disconnect and the independent TCP proof.
  const collectionDeadline = deadline - 2_000
  const endpoint = endpointFile(root, pid)
  const directory = diagnosticReportDirectory(root)
  mkdirSync(directory, { recursive: true })
  rmSync(endpoint, { force: true })
  /** @type {Frame[]} */
  let stack = []
  /** @type {any} */
  let report = null
  /** @type {string[]} */
  const incomplete = []
  /** @type {URL | undefined} */
  let address
  /** @type {WebSocket | undefined} */
  let socket
  let nextId = 0
  let pauseRequested = false
  /** @type {Map<number, {done: (result: any) => void, fail: (err: Error) => void}>} */
  const pending = new Map()
  /** @param {string} method @param {object} [params] @returns {Promise<any>} */
  const command = (method, params = {}) => new Promise((done, fail) => {
    if (socket?.readyState !== WebSocket.OPEN) { fail(new Error('The inspector connection is not open.')); return }
    const id = ++nextId
    pending.set(id, { done, fail })
    socket.send(JSON.stringify({ id, method, params }))
  })
  try {
    process.kill(pid, 'SIGUSR1')
    while (clock.now() < collectionDeadline) {
      try {
        const recorded = JSON.parse(readFileSync(endpoint, 'utf8'))
        if (recorded.pid === pid) { address = inspectorAddress(recorded.url); break }
      } catch (err) {
        if (!(err instanceof SyntaxError) && /** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err
      }
      await clock.pause(Math.min(25, Math.max(0, collectionDeadline - clock.now())))
    }
    if (!address) throw new Error('The inspector did not answer before the collection deadline (10 s total limit).')
    socket = new WebSocket(address)
    const scripts = new Map()
    /** @type {(frames: any[]) => void} */
    let gotFrames = () => {}
    const paused = new Promise((done) => { gotFrames = done })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.method === 'Debugger.scriptParsed') scripts.set(message.params.scriptId, message.params.url)
      if (message.method === 'Debugger.paused') gotFrames(message.params.callFrames)
      const waiting = pending.get(message.id)
      if (waiting) {
        pending.delete(message.id)
        if (message.error) waiting.fail(new Error(message.error.message))
        else waiting.done(message.result)
      }
    })
    socket.addEventListener('close', () => {
      for (const waiting of pending.values()) waiting.fail(new Error('The inspector connection closed.'))
      pending.clear()
    })
    await before(new Promise((done, fail) => {
      socket?.addEventListener('open', done, { once: true })
      socket?.addEventListener('error', () => fail(new Error('The inspector connection failed.')), { once: true })
    }), collectionDeadline, clock)
    await before(command('Debugger.enable'), collectionDeadline, clock)
    pauseRequested = true
    await before(command('Debugger.pause'), collectionDeadline, clock)
    const frames = /** @type {any[]} */ (await before(paused, collectionDeadline, clock))
    // Store only frame locations. Scope objects and their contents are not diagnostic evidence.
    stack = frames.map((frame) => ({ functionName: frame.functionName,
      file: frame.url || scripts.get(frame.location.scriptId) || '',
      line: frame.location.lineNumber + 1, column: frame.location.columnNumber + 1 }))
    const evaluated = await before(command('Runtime.evaluate', { expression: 'JSON.stringify(process.report.getReport())', returnByValue: true }), collectionDeadline, clock)
    if (evaluated.exceptionDetails || typeof evaluated.result?.value !== 'string') throw new Error('The report call returned no JSON report.')
    report = JSON.parse(evaluated.result.value)
    removePrivateReportFields(report)
  } catch (err) {
    incomplete.push(err instanceof Error ? err.message : String(err))
  } finally {
    if (socket?.readyState === WebSocket.OPEN) {
      if (pauseRequested) {
        try { await before(command('Debugger.resume'), deadline - 500, clock) }
        catch (err) { incomplete.push(`The child could not be resumed: ${err instanceof Error ? err.message : String(err)}`) }
      }
      // This fixed cleanup call is the only evaluation besides the fixed report call.
      // close() ends its own connection; the TCP refusal below, not a CDP reply, proves closure.
      // THE CHILD CLOSES THIS CONNECTION, NOT THIS SIDE. A close sent from here right after the call crossed the
      // inspector's own, left the child's connection half closed, and the child died by SIGSEGV on its inspector
      // thread as it exited (Node 22, WsHandler::OnCloseFrameWritten). This side closes only if the child has not
      // within the time left before the TCP proof.
      const closedByTheChild = new Promise((done) => socket?.addEventListener('close', done, { once: true }))
      socket.send(JSON.stringify({ id: ++nextId, method: 'Runtime.evaluate', params: { expression: "process.getBuiltinModule('node:inspector').close()" } }))
      await before(closedByTheChild, deadline - 1_000, clock).catch(() => {})
    }
    socket?.close()
  }
  const closure = address ? await portRefuses(address, deadline, clock) : 'unverified'
  const inspectorClosed = closure === 'refused' ? true : closure === 'accepting' ? false : null
  if (address && closure !== 'refused') incomplete.push(closure === 'accepting'
    ? `The inspector port ${address.port} still accepts connections after the 10 s diagnostic limit.`
    : `The inspector port ${address.port} could not be confirmed closed within the 10 s diagnostic limit.`)
  rmSync(endpoint, { force: true })
  const stamp = localStampOf(hangAt).replace(' ', 'T').replaceAll(':', '-')
  const path = join(directory, `hang-${stamp}-${pid}-${randomUUID().slice(0, 8)}.report.json`)
  writeFileSync(path, JSON.stringify({ stack, report, pid, hangAt: localStampOf(hangAt), inspectorUrl: address?.href ?? null, inspectorClosed, incomplete }, null, 2), { flag: 'wx', mode: 0o600 })
  return { path, incomplete }
}

/** @param {{root?: string, lockPath?: string, say?: (line: string) => void}} [options] */
export async function officeDiagnosticReport(options = {}) {
  const root = resolve(options.root ?? REPO_ROOT)
  const lockPath = options.lockPath ?? settings().serviceLockPath
  const say = options.say ?? ((line) => process.stdout.write(`${line}\n`))
  const recorded = readTheServiceLock(lockPath)
  if (recorded.state !== 'read') {
    say(recorded.state === 'absent' ? `No server child is recorded in ${lockPath}. Nothing was signalled.`
      : `The server child record in ${lockPath} could not be read: ${recorded.why}. Nothing was signalled.`)
    return 1
  }
  const { lock } = recorded
  const processNow = theProcessReading(lock.pid)
  if (!processNow.here || processNow.startedAt === null || processNow.startedAt !== lock.processStartedAt) {
    say(`The service lock no longer identifies the recorded child, process ${lock.pid}. Nothing was signalled.`)
    return 1
  }
  const command = theProcessReader().commandLineOf(lock.pid) ?? ''
  if (typeof lock.checkout !== 'string' || resolve(lock.checkout) !== root ||
      !command.includes(` --import tsx ${THE_SERVER_ENTRY} --stop-with-pid=`) || !command.includes(' --inspect-port=0 ')) {
    say(`The recorded process ${lock.pid} is not a verified Mole Office server. Nothing was signalled.`)
    return 1
  }
  try {
    const result = await requestDiagnosticReport(lock.pid, root)
    say(result.path)
    const captured = JSON.parse(readFileSync(result.path, 'utf8'))
    const top = captured.stack[0]
    const frame = top ? `${top.functionName || '(anonymous)'} (${top.file || 'unknown file'}:${top.line}:${top.column})` : 'not recorded'
    const heap = captured.report?.javascriptHeap
    const handles = captured.report?.libuv
    const active = Array.isArray(handles) ? handles.filter((/** @type {{is_active: boolean}} */ h) => h.is_active).length : 'not recorded'
    say(`Main thread: ${frame}; heap used ${heap?.usedMemory ?? 'not recorded'} bytes, total ${heap?.totalMemory ?? 'not recorded'} bytes; active handles ${active}.`)
    for (const issue of result.incomplete) say(issue)
    return result.incomplete.length === 0 ? 0 : 1
  } catch (err) {
    say(`The diagnostic report could not be collected: ${err instanceof Error ? err.message : String(err)}. Nothing was stopped.`)
    return 1
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await officeDiagnosticReport()
}
