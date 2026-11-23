// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * Capture a paused stack before an unresponsive child is stopped, or on a hand request.
 * The inspector method was authorized in J4JKZx76YwuS and the fixed close call in EVXbsOmf3h6n.
 * Node 22's internal/process/report installs a JavaScript signal handler, so report-on-signal
 * cannot interrupt a blocked loop. SIGUSR1 reaches Node's inspector thread instead.
 * A hand request is refused in the stable checkout, which serves the live office, and it closes an inspector that
 * opens again after the report, because there the child goes on running.
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

/** The fixed cleanup call: the child's own inspector closes itself, and with it the connection that sent this. */
const THE_CLOSE_CALL = "process.getBuiltinModule('node:inspector').close()"

/** How long the watch after a hand report looks for an inspector that opens again. */
const THE_WATCH_MS = 5_000

/**
 * ASK ONE INSPECTOR THAT OPENED AFTER THE REPORT TO CLOSE, with the same fixed cleanup call and nothing else, and say
 * what came of it in one incomplete line that names its port. Up to 3 s: 1 s to connect, 1 s for the child to close the
 * connection, as it does for the first inspector, and 1 s for the TCP proof.
 * @param {string} url the address the child printed for it
 * @param {DiagnosticClock} clock
 * @returns {Promise<string>}
 */
async function closeAnInspectorThatOpenedAgain(url, clock) {
  /** @type {URL} */
  let address
  try { address = inspectorAddress(url) }
  catch (err) { return `A new inspector opened after the report, and it was not asked to close: ${err instanceof Error ? err.message : String(err)}` }
  /** @type {WebSocket | undefined} */
  let socket
  let asked = false
  try {
    socket = new WebSocket(address)
    await before(new Promise((done, fail) => {
      socket?.addEventListener('open', done, { once: true })
      socket?.addEventListener('error', () => fail(new Error('The inspector connection failed.')), { once: true })
    }), clock.now() + 1_000, clock)
    // As for the first inspector, the child closes this connection, not this side (see requestDiagnosticReport).
    const closedByTheChild = new Promise((done) => socket?.addEventListener('close', done, { once: true }))
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: THE_CLOSE_CALL } }))
    asked = true
    await before(closedByTheChild, clock.now() + 1_000, clock).catch(() => {})
  } catch {
    // The connection did not open within 1 s, so the call was not sent. The line below says so.
  } finally {
    socket?.close()
  }
  const closure = await portRefuses(address, clock.now() + 1_000, clock)
  const done = !asked ? 'could not be connected to within 1 s, so it was not asked to close'
    : closure === 'refused' ? 'was closed' : 'was asked to close'
  const port = closure === 'refused' ? 'the port now refuses connections'
    : closure === 'accepting' ? 'the port still accepts connections' : 'it could not be confirmed closed'
  return `A new inspector opened on port ${address.port} after the report and ${done}; ${port}.`
}

/**
 * THE WATCH AFTER A HAND REPORT. It reads the child's recorded inspector address every 25 ms for 5 s, as the first poll
 * does, and asks every inspector of this pid whose address is not one already closed to close. It compares addresses,
 * not ports: the inspector that opened again in the experiment of 22 November 2026 had the same port and a new id.
 * Each new inspector adds one incomplete line. It keeps watching after one is closed, until the 5 s are over.
 * @param {string} endpoint the file the child's inspector address is recorded in
 * @param {number} pid
 * @param {Set<string>} closed the addresses already closed; each new one is added
 * @param {string[]} incomplete
 * @param {DiagnosticClock} clock
 * @returns {Promise<number | null>} how many new inspectors opened, or null when the address file could not be read and
 *   the watch stopped, which its own incomplete line says
 */
async function closeEveryInspectorThatOpensAgain(endpoint, pid, closed, incomplete, clock) {
  const end = clock.now() + THE_WATCH_MS
  let opened = 0
  while (clock.now() < end) {
    /** @type {any} */
    let recorded = null
    try {
      recorded = JSON.parse(readFileSync(endpoint, 'utf8'))
    } catch (err) {
      if (!(err instanceof SyntaxError) && /** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') {
        incomplete.push(`The watch for an inspector that opens again after the report stopped, because ${endpoint} could not be read: ${err instanceof Error ? err.message : String(err)}. One may still open when the child's event loop next turns.`)
        return null
      }
    }
    if (recorded?.pid === pid && !closed.has(recorded.url)) {
      closed.add(recorded.url)
      opened += 1
      incomplete.push(await closeAnInspectorThatOpenedAgain(recorded.url, clock))
    }
    await clock.pause(Math.min(25, Math.max(0, end - clock.now())))
  }
  return opened
}

/** @typedef {{ functionName: string, file: string, line: number, column: number }} Frame */
/**
 * @param {number} pid The recorded child itself, never its group.
 * @param {string} root
 * @param {Date} [hangAt]
 * @param {DiagnosticClock} [clock] A test can advance the clock while retaining the shipped ten-second limit.
 * @param {{ childLivesOn?: boolean }} [options] childLivesOn is for a hand request, where the child goes on running
 *   after the report. Node queues two inspector starts on one SIGUSR1, and the second runs when the child's event loop
 *   next turns. If that is after the report closed the first inspector, a second one opens on a loopback port and stays
 *   open. With childLivesOn the report lets the loop turn before the close, watches for 5 s after it, and closes what
 *   opens. serve-dev stops its child right after the report and passes nothing.
 * @returns {Promise<{path: string, incomplete: string[]}>}
 */
export async function requestDiagnosticReport(pid, root, hangAt = new Date(), clock = REAL_DIAGNOSTIC_CLOCK, { childLivesOn = false } = {}) {
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
  /** Whether the loop-turn evaluation answered; null when it was not sent. @type {boolean | null} */
  let theLoopTurned = null
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
      // THE LOOP TURN, on a hand request only. The second inspector start that one SIGUSR1 queued runs when the child's
      // event loop next turns. Run while this inspector is still open, it opens nothing new. This evaluation waits for
      // two turns, at most 1 s and never later than 1.5 s before the limit. A child that does not answer is busy; the
      // watch below closes what opens after the close, and a timeout or error here is not an incomplete line by itself.
      if (childLivesOn) {
        theLoopTurned = await before(command('Runtime.evaluate', { expression: 'new Promise((done) => setImmediate(() => setImmediate(done)))', awaitPromise: true }),
          Math.min(clock.now() + 1_000, deadline - 1_500), clock).then(() => true, () => false)
      }
      // There are three fixed evaluations and no other: the report call, the loop turn above, which only lets the
      // child's event loop turn, and this cleanup call, which the watch below also sends to an inspector that opens again.
      // close() ends its own connection; the TCP refusal below, not a CDP reply, proves closure.
      // THE CHILD CLOSES THIS CONNECTION, NOT THIS SIDE. A close sent from here right after the call crossed the
      // inspector's own, left the child's connection half closed, and the child died by SIGSEGV on its inspector
      // thread as it exited (Node 22, WsHandler::OnCloseFrameWritten). This side closes only if the child has not
      // within the time left before the TCP proof.
      const closedByTheChild = new Promise((done) => socket?.addEventListener('close', done, { once: true }))
      socket.send(JSON.stringify({ id: ++nextId, method: 'Runtime.evaluate', params: { expression: THE_CLOSE_CALL } }))
      await before(closedByTheChild, deadline - 1_000, clock).catch(() => {})
    }
    socket?.close()
  }
  const closure = address ? await portRefuses(address, deadline, clock) : 'unverified'
  const inspectorClosed = closure === 'refused' ? true : closure === 'accepting' ? false : null
  if (address && closure !== 'refused') incomplete.push(closure === 'accepting'
    ? `The inspector port ${address.port} still accepts connections after the 10 s diagnostic limit.`
    : `The inspector port ${address.port} could not be confirmed closed within the 10 s diagnostic limit.`)
  if (childLivesOn) {
    // THE WATCH COMES AFTER THE 10 s LIMIT, which still bounds everything above it. It adds at most about 5 s, and each
    // inspector it closes up to 3 s more (1 s to connect, 1 s for the child to close the connection, 1 s for the TCP
    // proof). The endpoint file is removed after it, because the watch reads it.
    const opened = await closeEveryInspectorThatOpensAgain(endpoint, pid, new Set(address ? [address.href] : []), incomplete, clock)
    if (theLoopTurned === false && opened === 0) {
      incomplete.push(`The child's event loop did not turn while the inspector was open, and no second inspector opened during the ${THE_WATCH_MS / 1_000} s watch after the report; a second inspector may still open when the child's event loop next turns.`)
    }
  }
  rmSync(endpoint, { force: true })
  const stamp = localStampOf(hangAt).replace(' ', 'T').replaceAll(':', '-')
  const path = join(directory, `hang-${stamp}-${pid}-${randomUUID().slice(0, 8)}.report.json`)
  writeFileSync(path, JSON.stringify({ stack, report, pid, hangAt: localStampOf(hangAt), inspectorUrl: address?.href ?? null, inspectorClosed, incomplete }, null, 2), { flag: 'wx', mode: 0o600 })
  return { path, incomplete }
}

/**
 * THE ONE SENTENCE SAID WHEN A DIAGNOSTIC REPORT WOULD REACH THE LIVE OFFICE, naming the path that made it the live
 * office. Nothing is signalled before it is said.
 * @param {string} path the stable checkout, or a folder in or around it
 * @returns {string}
 */
function theLiveOfficeRefusal(path) {
  return `A diagnostic report on the live office is refused and nothing was signalled, because ${path} is the stable checkout or a folder in or around it, and an inspector opened in the live office can open again after the report and let any program on this machine run code in it.`
}

/** @param {{root?: string, lockPath?: string, say?: (line: string) => void}} [options] */
export async function officeDiagnosticReport(options = {}) {
  const root = resolve(options.root ?? REPO_ROOT)
  const lockPath = options.lockPath ?? settings().serviceLockPath
  const say = options.say ?? ((line) => process.stdout.write(`${line}\n`))
  // THE LIVE OFFICE IS NEVER ASKED. The stable checkout's own service lock is never read, and a lock read from another
  // checkout is refused when it names the stable checkout, before its process is read. An inspector opened in the live
  // office can open again after the report, and while it is open any program on this machine can run code in it. The
  // stable checkout is worked out once, for the sandbox launcher; its own words are about mounting a sandbox, so only
  // whether it answers is used. It is loaded here and not at the top, so tools/serve-dev.mjs, which imports this
  // module, loads nothing new.
  const { whyAPathIsTheStableCheckout } = await import('./sandbox-common.mjs')
  if (whyAPathIsTheStableCheckout(root) !== null) {
    say(theLiveOfficeRefusal(root))
    return 1
  }
  const recorded = readTheServiceLock(lockPath)
  if (recorded.state !== 'read') {
    say(recorded.state === 'absent' ? `No server child is recorded in ${lockPath}. Nothing was signalled.`
      : `The server child record in ${lockPath} could not be read: ${recorded.why}. Nothing was signalled.`)
    return 1
  }
  const { lock } = recorded
  if (typeof lock.checkout === 'string' && whyAPathIsTheStableCheckout(resolve(lock.checkout)) !== null) {
    say(theLiveOfficeRefusal(resolve(lock.checkout)))
    return 1
  }
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
    const result = await requestDiagnosticReport(lock.pid, root, undefined, undefined, { childLivesOn: true })
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
