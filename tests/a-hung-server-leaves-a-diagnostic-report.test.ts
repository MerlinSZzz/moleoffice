// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Every child here is a stand-in in a temporary checkout. No real office is started or signalled.
 * The method changed in J4JKZx76YwuS after the busy-loop signal control failed.
 * EVXbsOmf3h6n allows only the report evaluation and the fixed inspector-close evaluation. A hand request adds
 * one more fixed evaluation between them, which only lets the child's event loop turn.
 * Mutations: remove --inspect-port=0; skip pause; wait without a deadline; capture on every stop;
 * signal the group; signal despite an absent lock; bypass identity/start checks; print wrong
 * totals; skip inspector.close; accept a non-loopback inspector address.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createConnection, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { theProcessReading } from '../src/config/the-service-lock.mjs'
import { diagnosticReportDirectory, officeDiagnosticReport } from '../tools/office-diagnostic-report.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
type State = { pid: number; args: string[] }

async function until(check: () => boolean, within = 15_000): Promise<void> {
  const end = Date.now() + within
  while (Date.now() < end) {
    if (check()) return
    await sleep(25)
  }
  throw new Error(`The stand-in did not reach the expected state within ${within} ms.`)
}

/** A process's state letter from Linux's /proc (R, S, T, Z…), 'gone' if it has none, or null with no /proc. */
function theStateOf(pid: number): string | null {
  if (!existsSync('/proc/self/stat')) return null
  try {
    const stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(') ') + 2)[0] ?? null
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'gone' : `not read: ${String(err)}`
  }
}

async function fixture(mode: 'block' | 'no-report' | 'healthy' | 'leaves-with-3') {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-diagnostic-stand-in-'))
  const port = await new Promise<number>((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') throw new Error('No stand-in port.')
      probe.close(() => done(address.port))
    })
  })
  mkdirSync(join(root, 'src/server'), { recursive: true })
  mkdirSync(join(root, 'src/worker'), { recursive: true })
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  const entry = join(root, 'src/server/index.ts')
  const lockPath = join(root, 'stand-in.db.service.json')
  writeFileSync(entry, `
    // A diagnostic-report test stand-in, never an office server.
    import { createServer } from 'node:http'
    import { existsSync, writeFileSync } from 'node:fs'
    import { takeTheServiceLock, theProcessReading } from ${JSON.stringify(join(REPO, 'src/config/the-service-lock.mjs'))}
    import { aWatchOnTheStarter } from ${JSON.stringify(join(REPO, 'src/config/session-process.mjs'))}
    import { THE_MIGRATIONS_BEGIN } from ${JSON.stringify(join(REPO, 'src/config/migration-markers.mjs'))}
    const owner = process.argv.find((arg) => arg.startsWith('--stop-with-pid='))
    if (!owner) throw new Error('The stand-in was started without an owner.')
    const starter = aWatchOnTheStarter(Number(owner.slice('--stop-with-pid='.length)))
    setInterval(() => { if (starter().state === 'gone') process.exit(0) }, 250).unref()
    const mode = ${JSON.stringify(mode)}
    const locked = await takeTheServiceLock({ lockPath: ${JSON.stringify(lockPath)}, databasePath: ${JSON.stringify(join(root, 'stand-in.db'))},
      checkout: ${JSON.stringify(root)}, port: ${port}, pid: process.pid, readProcess: theProcessReading })
    if (!locked.taken) throw new Error(locked.said)
    // A SLOW WRITE OF THE STATE FILE, AS A LOADED MACHINE CAN GIVE. writeFileSync empties a file
    // before it writes it, and a read between the two finds the file empty. A stand-in that replaces
    // an earlier one writes the file empty, pauses, and then writes it whole, so that gap comes in
    // case 4 on every machine.
    const state = JSON.stringify({pid: process.pid, args: [...process.execArgv, ...process.argv.slice(1)]})
    if (existsSync('state.json')) { writeFileSync('state.json', ''); await new Promise((done) => setTimeout(done, 500)) }
    writeFileSync('state.json', state)
    // HOW THE STAND-IN ENDED, in files case 2's failure message reads: term-seen when its TERM
    // handler runs, exit-seen with its exit code when it exits, and loop-ran (below) when its event
    // loop runs after it blocked. A stand-in that wrote none of them ran no JavaScript as it ended.
    // In the mode leaves-with-3 its TERM handler leaves with exit code 3, so the last case's stop
    // line has a code of its own to say.
    process.on('SIGTERM', () => { writeFileSync('term-seen', String(Date.now())); process.exit(mode === 'leaves-with-3' ? 3 : 0) })
    process.on('exit', (code) => writeFileSync('exit-seen', code + ' ' + Date.now()))
    function blockTheMainThread() {
      writeFileSync('blocked', 'This stand-in blocks its event loop for the test.')
      setTimeout(() => writeFileSync('loop-ran', String(Date.now())), 0)
      // THE STOP IS TIMED FROM HERE. The line a server prints as its migrations begin arms serve-dev's
      // bound on them, which case 2 sets to one second. A server past it is stopped as a hung one is:
      // the report, then TERM, then KILL.
      process.stdout.write(THE_MIGRATIONS_BEGIN + '\\n')
      const end = Date.now() + 60_000
      while (Date.now() < end) { /* bounded even if the test runner disappears */ }
      process.exit(2)
    }
    // A LATE START, AS A LOADED MACHINE CAN GIVE. A stand-in that listens later than serve-dev
    // waits for an answer is stopped while it is still starting, before it blocks. It leaves on
    // TERM, and no KILL is sent. Starting late on purpose makes that the same on every machine.
    if (mode === 'block') await new Promise((done) => setTimeout(done, 4_000))
    createServer((_req, res) => {
      writeFileSync('health-seen', 'The stand-in received a health request.')
      if (mode === 'healthy') res.end(JSON.stringify({pid: process.pid}))
    }).listen({fd: 3}, () => {
      writeFileSync('listening', 'stand-in')
      if (mode === 'block') blockTheMainThread()
    })
  `)
  writeFileSync(join(root, 'src/worker/index.ts'), '// test stand-in worker entry\n')
  return { root, entry, lockPath, port }
}

async function supervise(f: Awaited<ReturnType<typeof fixture>>, answerWithin = '1', diagnosticClock?: { now: () => number; pause: (ms: number) => Promise<unknown> }) {
  vi.stubEnv('MOLE_OFFICE_PORT', String(f.port))
  vi.stubEnv('MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES', '0')
  vi.stubEnv('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', answerWithin)
  vi.resetModules()
  // Keep the existing five-second child wait; no forty-second real-server drain is needed here.
  vi.doMock('../src/config/settings.mjs', async (original) => ({
    ...(await original<typeof import('../src/config/settings.mjs')>()), SHUTDOWN_LIMIT_MS: 0,
  }))
  const { serveDev } = await import('../tools/serve-dev.mjs')
  vi.doUnmock('../src/config/settings.mjs')
  const lines: string[] = []
  const owner = await serveDev({ root: f.root, writeItDown: false, say: (line) => lines.push(line), diagnosticClock })
  await until(() => existsSync(join(f.root, 'listening')))
  const state = JSON.parse(readFileSync(join(f.root, 'state.json'), 'utf8')) as State
  return { owner, lines, state }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.doUnmock('../src/config/settings.mjs') })

it('starts the recorded child with an ephemeral inspector port and both report privacy flags, and keeps its other arguments', async () => {
  const f = await fixture('healthy')
  let s: Awaited<ReturnType<typeof supervise>> | undefined
  try {
    s = await supervise(f)
    expect(s.state.args).toEqual([
      '--inspect-port=0',
      '--report-exclude-env', '--report-exclude-network',
      '--import', 'tsx', join(f.root, 'src/server/index.ts'), `--stop-with-pid=${process.pid}`,
    ])
  } finally { await s?.owner.stop(); rmSync(f.root, { recursive: true, force: true }) }
})

it('gets a report from a blocked main thread before the existing TERM and KILL sequence', async () => {
  const began = Date.now()
  let listened: number | null = null
  const f = await fixture('block')
  let s: Awaited<ReturnType<typeof supervise>> | undefined
  const sent: { pid: number; signal: string | number | undefined; at: number; state: string | null }[] = []
  const realKill = process.kill.bind(process)
  vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    // The stand-in's state just before each signal, so a failure says whether it was there to get it.
    sent.push({ pid, signal, at: Date.now(), state: signal === 0 ? null : theStateOf(Math.abs(pid)) })
    return realKill(pid, signal)
  })
  try {
    // THE STOP IS TIMED FROM THE HANG, NOT FROM THE START. With an answer limit of one second, a
    // stand-in that was slow to start was stopped before it blocked. Here the answer limit is its
    // default of sixty seconds and the migrations limit one second, so serve-dev stops the stand-in one
    // second after it blocks, through the same report, TERM and KILL. Both limits stop a server through
    // the one call in stopAServerThatDoesNotAnswer, and case 3 has the answer limit's own stop.
    vi.stubEnv('MOLE_OFFICE_MIGRATIONS_HAVE_TO_FINISH_WITHIN', '1')
    s = await supervise(f, '60')
    listened = Date.now()
    const pid = s.state.pid
    // THE WAIT ENDS WHEN THE STAND-IN DOES. In a whole run at six workers in round 61, the stand-in
    // was ended by SIGSEGV before serve-dev's KILL, and this wait then ran its 20 s for a KILL that
    // could not come. Now the case stops waiting once serve-dev says the stand-in has exited. If no
    // KILL was sent, it fails at once with serve-dev's line, which names the code or signal that ended it.
    const lines = s.lines
    const ended = `[dev] the server in group ${String(pid)} has exited`
    const killed = (): boolean => sent.some((one) => one.pid === -pid && one.signal === 'SIGKILL')
    await until(() => killed() || lines.some((line) => line.startsWith(ended)), 20_000)
    if (!killed()) throw new Error(`The stand-in ended before serve-dev sent KILL. serve-dev said: ${lines.filter((line) => line.startsWith(ended)).join(' ')}`)
    const sequence = sent.filter((one) => Math.abs(one.pid) === pid && one.signal !== 0)
    expect(sequence.map(({ pid, signal }) => [pid, signal])).toEqual([[pid, 'SIGUSR1'], [-pid, 'SIGTERM'], [-pid, 'SIGKILL']])
    const reports = readdirSync(diagnosticReportDirectory(f.root)).filter((name) => name.startsWith('hang-'))
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatch(/^hang-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d.*\.report\.json$/)
    const path = join(diagnosticReportDirectory(f.root), reports[0]!)
    const report = JSON.parse(readFileSync(path, 'utf8'))
    expect(report.pid).toBe(pid)
    expect(report.stack[0].functionName).toBe('blockTheMainThread')
    expect(report.stack[0].file).toContain('src/server/index.ts')
    expect(report.stack[0].line).toBeGreaterThan(0)
    expect(report.inspectorClosed).toBe(true)
    expect(s.lines.some((line) => line.includes(path))).toBe(true)
    const hang = sequence[0]!.at
    // The filename's wall-clock second is the hang's, rather than the end of the drain.
    const local = new Date(hang)
    const stamp = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}T${String(local.getHours()).padStart(2, '0')}-${String(local.getMinutes()).padStart(2, '0')}-${String(local.getSeconds()).padStart(2, '0')}`
    expect(reports[0]).toContain(stamp)
    expect(existsSync(join(f.root, 'blocked'))).toBe(true)
    // THE STOP SAYS HOW THE SERVER ENDED, once it has. This one was killed, so it has no exit code,
    // and the signal that ended it is KILL.
    await until(() => lines.some((line) => line.startsWith(ended)), 5_000)
    expect(lines.filter((line) => line.startsWith(ended))).toEqual([`${ended}, with no exit code and signal SIGKILL.`])
  } catch (err) {
    // HOW FAR THE STOP GOT, said when this case fails. On a loaded machine it once failed with no
    // KILL in its wait, and nothing said which signals had been sent or whether the stand-in was
    // still running. It is said before the stop in `finally`, which can outlast the case's time
    // limit, and then the error vitest shows is that limit's. Each signal carries the stand-in's
    // state just before it, and standInWrote says which of its files it wrote as it ended.
    const child = s?.state.pid
    let running: boolean | null = null
    if (child !== undefined) { try { running = realKill(child, 0) } catch { running = false } }
    const wrote = (name: string): string | null => existsSync(join(f.root, name)) ? readFileSync(join(f.root, name), 'utf8') : null
    const exit = wrote('exit-seen')?.split(' ')
    const said = `How far serve-dev's stop got, with times in ms after the case began: ${JSON.stringify({
      signals: sent.filter((one) => one.signal !== 0).map((one) => [one.pid, one.signal, one.at - began, one.state]),
      listened: listened === null ? null : listened - began, standInRunning: running,
      standInWrote: { termHandlerRan: wrote('term-seen') === null ? null : Number(wrote('term-seen')) - began,
        loopRanAfterItBlocked: wrote('loop-ran') === null ? null : Number(wrote('loop-ran')) - began,
        exited: exit === undefined ? null : { code: Number(exit[0]), at: Number(exit[1]) - began } },
      serveDevSaid: s?.lines ?? [] })}`
    console.log(said)
    if (err instanceof Error) err.message = `${err.message} ${said}`
    throw err
  } finally { await s?.owner.stop(); rmSync(f.root, { recursive: true, force: true }) }
}, 30_000)

it('bounds an inspector that never answers to ten seconds, logs that fact, and still stops the child', async () => {
  const f = await fixture('no-report')
  let advanced = 0
  const clock = { now: () => Date.now() + advanced, pause: async (ms: number) => { advanced += ms } }
  let s: Awaited<ReturnType<typeof supervise>> | undefined
  const signals: { pid: number; signal: string | number | undefined; at: number }[] = []
  const realKill = process.kill.bind(process)
  vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    signals.push({ pid, signal, at: clock.now() })
    // Fixture fault: suppress only this stand-in's inspector-start signal, never a real server's.
    if (pid === s?.state.pid && signal === 'SIGUSR1') {
      writeFileSync(join(f.root, 'signal-seen'), 'The harness suppressed inspector startup.')
      return true
    }
    // Fixture fault: hold back only this stand-in's TERM as well, so the answer limit's stop has to
    // end in KILL. Case 2's stand-in is stopped by the migrations limit, so this is the answer limit's KILL.
    if (s !== undefined && pid === -s.state.pid && signal === 'SIGTERM') return true
    return realKill(pid, signal)
  })
  try {
    s = await supervise(f, '1', clock)
    const pid = s.state.pid
    // Signal stamps use the same controlled clock as the diagnostic deadline.
    await until(() => signals.some((one) => one.pid === -pid && one.signal === 'SIGTERM'), 13_000)
    const usr = signals.find((one) => one.pid === pid && one.signal === 'SIGUSR1')!
    const term = signals.find((one) => one.pid === -pid && one.signal === 'SIGTERM')!
    expect(term.at - usr.at).toBeGreaterThanOrEqual(7_500)
    expect(term.at - usr.at).toBeLessThan(10_500)
    expect(s.lines.join('\n')).toContain('10 s')
    expect(s.lines.join('\n')).toContain('inspector')
    expect(existsSync(join(f.root, 'signal-seen'))).toBe(true)
    await until(() => signals.some((one) => one.pid === -pid && one.signal === 'SIGKILL'), 8_000)
    const sequence = signals.filter((one) => Math.abs(one.pid) === pid && one.signal !== 0)
    expect(sequence.map(({ pid, signal }) => [pid, signal])).toEqual([[pid, 'SIGUSR1'], [-pid, 'SIGTERM'], [-pid, 'SIGKILL']])
    await until(() => { try { realKill(pid, 0); return false } catch { return true } })
  } finally { await s?.owner.stop(); rmSync(f.root, { recursive: true, force: true }) }
}, 30_000)

it('restarts for a changed file without sending SIGUSR1', async () => {
  const f = await fixture('healthy')
  let s: Awaited<ReturnType<typeof supervise>> | undefined
  const realKill = process.kill.bind(process)
  const sent = vi.spyOn(process, 'kill').mockImplementation(realKill)
  try {
    s = await supervise(f)
    await until(() => existsSync(join(f.root, 'health-seen')))
    const pid = s.state.pid
    // THE RESTART IS SEEN BY THE LISTENING FILE, NOT BY READING state.json. A new stand-in writes
    // "listening" only after state.json is whole, so the case reads that file once, and whole. The
    // wait keeps its limit, so a stand-in that never comes back still fails the case.
    rmSync(join(f.root, 'listening'))
    appendFileSync(f.entry, '\n// file-change restart of the stand-in\n')
    await until(() => existsSync(join(f.root, 'listening')))
    expect((JSON.parse(readFileSync(join(f.root, 'state.json'), 'utf8')) as State).pid).not.toBe(pid)
    expect(sent.mock.calls.filter(([, signal]) => signal === 'SIGUSR1')).toEqual([])
    expect(sent.mock.calls).toContainEqual([-pid, 'SIGTERM'])
    expect(readdirSync(diagnosticReportDirectory(f.root))).toEqual([])
  } finally { await s?.owner.stop(); rmSync(f.root, { recursive: true, force: true }) }
}, 20_000)

it('the hand tool signals only the child recorded in the service lock, never kills, and prints the report summary', async () => {
  const f = await fixture('healthy')
  let s: Awaited<ReturnType<typeof supervise>> | undefined
  try {
    s = await supervise(f)
    const pid = s.state.pid
    // An old, labelled fixture report must not be mistaken for this request's report.
    const old = join(diagnosticReportDirectory(f.root), 'report.fixture-old.json')
    writeFileSync(old, JSON.stringify({ fixture: true, header: { processId: pid } }))
    const realKill = process.kill.bind(process)
    const sent = vi.spyOn(process, 'kill').mockImplementation(realKill)
    const protocol: { method: string; params?: { expression?: string } }[] = []
    const realSend = WebSocket.prototype.send
    vi.spyOn(WebSocket.prototype, 'send').mockImplementation(function (this: WebSocket, data) {
      protocol.push(JSON.parse(String(data)))
      return realSend.call(this, data)
    })
    const lines: string[] = []
    const result = await officeDiagnosticReport({ root: f.root, lockPath: f.lockPath, say: (line: string) => lines.push(line) })
    expect(result).toBe(0)
    expect(sent.mock.calls).toEqual([[pid, 'SIGUSR1']])
    expect(protocol.map((one) => one.method)).toEqual([
      'Debugger.enable', 'Debugger.pause', 'Runtime.evaluate', 'Debugger.resume', 'Runtime.evaluate', 'Runtime.evaluate',
    ])
    expect(protocol.filter((one) => one.method === 'Runtime.evaluate').map((one) => one.params?.expression)).toEqual([
      'JSON.stringify(process.report.getReport())', 'new Promise((done) => setImmediate(() => setImmediate(done)))',
      "process.getBuiltinModule('node:inspector').close()",
    ])
    expect(lines).toHaveLength(2)
    expect(lines[0]).not.toBe(old)
    const report = JSON.parse(readFileSync(lines[0]!, 'utf8'))
    expect(report.pid).toBe(pid)
    expect(report.report.header.processId).toBe(pid)
    const top = report.stack[0]
    const frame = top ? `${top.functionName || '(anonymous)'} (${top.file || 'unknown file'}:${top.line}:${top.column})` : 'not recorded'
    expect(lines[1]).toBe(`Main thread: ${frame}; heap used ${report.report.javascriptHeap.usedMemory} bytes, total ${report.report.javascriptHeap.totalMemory} bytes; active handles ${report.report.libuv.filter((handle: { is_active: boolean }) => handle.is_active).length}.`)
    // Check the listener itself while the child is still alive, not merely a closed CDP session.
    expect(theProcessReading(pid).here).toBe(true)
    const address = new URL(report.inspectorUrl)
    const refused = await new Promise<boolean>((done) => {
      const probe = createConnection({ host: address.hostname.replace(/^\[|\]$/g, ''), port: Number(address.port) })
      probe.once('connect', () => { probe.destroy(); done(false) })
      probe.once('error', (err: NodeJS.ErrnoException) => done(err.code === 'ECONNREFUSED'))
      probe.setTimeout(1000, () => { probe.destroy(); done(false) })
    })
    expect(refused).toBe(true)
    expect(existsSync(old)).toBe(true)
  } finally { await s?.owner.stop(); rmSync(f.root, { recursive: true, force: true }) }
}, 30_000)

it('the hand tool refuses an absent child record and signals nothing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-diagnostic-absent-'))
  const sent = vi.spyOn(process, 'kill').mockReturnValue(true)
  try {
    const lines: string[] = []
    expect(await officeDiagnosticReport({ root, lockPath: join(root, 'absent.json'), say: (line: string) => lines.push(line) })).toBe(1)
    expect(lines.join('\n')).toContain('No server child is recorded')
    expect(sent.mock.calls).toEqual([])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('the hand tool refuses another program in a recorded child slot', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-diagnostic-refused-'))
  const lockPath = join(root, 'fixture-lock.json')
  const own = theProcessReading(process.pid)
  if (!own.here) throw new Error('The test process cannot be read.')
  // This is a synthetic lock in a scratch folder, naming only this test process.
  writeFileSync(lockPath, JSON.stringify({ token: 'test fixture', checkout: root, pid: process.pid,
    pgid: process.pid, port: 12345, processStartedAt: own.startedAt }))
  const sent = vi.spyOn(process, 'kill').mockReturnValue(true)
  try {
    const lines: string[] = []
    expect(await officeDiagnosticReport({ root, lockPath, say: (line: string) => lines.push(line) })).toBe(1)
    expect(lines.join('\n')).toMatch(/not a verified Mole Office server|no longer identifies the recorded child/)
    expect(sent.mock.calls).toEqual([])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('the hand tool refuses a reused pid even when the command line is a server', async () => {
  const f = await fixture('healthy')
  let s: Awaited<ReturnType<typeof supervise>> | undefined
  let restoreSignal = () => {}
  try {
    s = await supervise(f)
    const lock = JSON.parse(readFileSync(f.lockPath, 'utf8'))
    writeFileSync(f.lockPath, JSON.stringify({ ...lock, processStartedAt: 'a different start' }))
    const sent = vi.spyOn(process, 'kill').mockReturnValue(true)
    restoreSignal = () => sent.mockRestore()
    const lines: string[] = []
    expect(await officeDiagnosticReport({ root: f.root, lockPath: f.lockPath, say: (line: string) => lines.push(line) })).toBe(1)
    expect(lines.join('\n')).toContain('no longer identifies the recorded child')
    expect(sent.mock.calls).toEqual([])
  } finally { restoreSignal(); await s?.owner.stop(); rmSync(f.root, { recursive: true, force: true }) }
}, 20_000)

it('says the exit code of a server that did not answer and left on TERM with a code of its own', async () => {
  const f = await fixture('leaves-with-3')
  let s: Awaited<ReturnType<typeof supervise>> | undefined
  try {
    // The stand-in never answers, so the answer limit of one second stops it: the report, then
    // TERM. Its TERM handler runs and leaves with exit code 3, so no KILL is needed and no signal
    // ended it. Case 2 has the other form of the line, for a server KILL ended.
    s = await supervise(f)
    const pid = s.state.pid
    const lines = s.lines
    // The group is the one in state.json, which the stand-in writes once its TERM handler is in
    // place. serve-dev starts it again after the stop, and the next one's line names its own group.
    const ended = `[dev] the server in group ${String(pid)} has exited`
    await until(() => lines.some((line) => line.startsWith(ended)), 20_000)
    expect(lines.filter((line) => line.startsWith(ended))).toEqual([`${ended}, with exit code 3 and no signal.`])
  } finally { await s?.owner.stop(); rmSync(f.root, { recursive: true, force: true }) }
}, 30_000)
