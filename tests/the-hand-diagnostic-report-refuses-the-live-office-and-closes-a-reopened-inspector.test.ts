// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HAND DIAGNOSTIC REPORT, ON A STAND-IN THIS FILE STARTS ITSELF.
 *
 * tools/office-diagnostic-report.mjs, run by hand, asks a running server for a report through its inspector, and the
 * server goes on running after it. Two things follow, and this file checks both on a real child.
 *
 * 1. IT REFUSES THE LIVE OFFICE. The stable checkout serves the person's own office. An inspector opened there can open
 *    again after the report, and while it is open any program on this machine can run code in the office. So the tool
 *    refuses that checkout before it reads the service lock, and signals nothing. The first case makes a home of its own
 *    and starts a stand-in in that home's stable checkout folder. The second runs the tool from another checkout whose
 *    lock names that folder, and expects the same refusal for that reason, before the recorded process is read. The
 *    person's office is never near either case.
 * 2. IT CLOSES AN INSPECTOR THAT OPENS AGAIN. Node 22 queues two inspector starts on one SIGUSR1. The first runs at once.
 *    The second runs when the child's event loop next turns. A child busy through the report turns its loop only after
 *    the report closed the first inspector, and then a second inspector opens, on the same port with a new address, and
 *    stays open. The tool watches for 5 s after the report, closes what opens, and says so in one incomplete line each.
 *
 * Every child here is a stand-in in a temporary folder, and nothing is pointed at the live office's port.
 * THE CHILD IS ASKED ONLY ONCE IT RUNS. SIGUSR1 ends a Node process that has not yet set up its handler for it, so each
 * case waits for the stand-in's first line (tests/the-diagnostic-collector-lets-the-child-close-the-inspector.test.ts).
 * Without the refusal the first case sees a signal; without the watch the last case finds a port still open.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createConnection, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { theStableCheckoutFolder } from '../src/config/sandbox-folder.mjs'
import { officeDiagnosticReport, recordInspectorAddress } from '../tools/office-diagnostic-report.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
/** The refusal the tool says for the stable checkout, up to its reason. */
const THE_REFUSAL = 'A diagnostic report on the live office is refused and nothing was signalled, because '

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

/** A free loopback port for the stand-in's service lock to record. The stand-in listens on nothing. */
function aFreePort(): Promise<number> {
  return new Promise<number>((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') { fail(new Error('No stand-in port.')); return }
      probe.close(() => done(address.port))
    })
  })
}

/** What a TCP connection to an inspector's port finds: refused, accepting, or why neither is known. */
function whatThePortSays(port: string): Promise<string> {
  return new Promise<string>((done) => {
    const probe = createConnection({ host: '127.0.0.1', port: Number(port) })
    probe.once('connect', () => { probe.destroy(); done('accepting') })
    probe.once('error', (err: NodeJS.ErrnoException) => done(err.code === 'ECONNREFUSED' ? 'refused' : `not known: ${err.code ?? err.message}`))
    probe.setTimeout(1_000, () => { probe.destroy(); done('not known: no answer within 1 s') })
  })
}

/** The port of an inspector address. Only the port is ever put in a failure message, never the address. */
const portOf = (url: string): string => new URL(url).port

/**
 * A STAND-IN SERVER IN `root`, started as serve-dev starts the real one: an ephemeral inspector port, both report
 * privacy flags, and `--import tsx src/server/index.ts --stop-with-pid=<this process>`. It takes a service lock that
 * names itself and `root` as its checkout, as a server does, so the hand tool's own checks of the child pass. It leaves
 * when this process is gone, and on TERM. In the mode busy it blocks its event loop right after its first line, until
 * the file `release` appears in `root`, and never longer than 60 s.
 * Every "Debugger listening" line it prints is recorded for the hand tool, as serve-dev records it, and kept in `urls`.
 */
async function aStandIn(root: string, mode: 'idle' | 'busy') {
  mkdirSync(join(root, 'src/server'), { recursive: true })
  mkdirSync(join(root, '.logs'), { recursive: true })
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  const lockPath = join(root, 'stand-in.db.service.json')
  const port = await aFreePort()
  writeFileSync(join(root, 'src/server/index.ts'), `
    // A hand diagnostic report test stand-in, never an office server.
    import { existsSync } from 'node:fs'
    import { takeTheServiceLock, theProcessReading } from ${JSON.stringify(join(REPO, 'src/config/the-service-lock.mjs'))}
    import { aWatchOnTheStarter } from ${JSON.stringify(join(REPO, 'src/config/session-process.mjs'))}
    const owner = process.argv.find((arg) => arg.startsWith('--stop-with-pid='))
    if (!owner) throw new Error('The stand-in was started without an owner.')
    const starter = aWatchOnTheStarter(Number(owner.slice('--stop-with-pid='.length)))
    // Not unref'd: it keeps an idle stand-in alive, and the little JavaScript it runs every 250 ms is where a pause lands.
    setInterval(() => { if (starter().state === 'gone') process.exit(0) }, 250)
    process.on('SIGTERM', () => process.exit(0))
    const locked = await takeTheServiceLock({ lockPath: ${JSON.stringify(lockPath)}, databasePath: ${JSON.stringify(join(root, 'stand-in.db'))},
      checkout: ${JSON.stringify(root)}, port: ${port}, pid: process.pid, readProcess: theProcessReading })
    if (!locked.taken) throw new Error(locked.said)
    process.stdout.write('running\\n')
    if (${JSON.stringify(mode)} === 'busy') {
      const end = Date.now() + 60_000
      while (!existsSync('release') && Date.now() < end) { /* busy until the test releases it, and bounded if the test is gone */ }
    }
  `)
  const child = spawn(process.execPath, ['--inspect-port=0', '--report-exclude-env', '--report-exclude-network', '--import', 'tsx', 'src/server/index.ts', `--stop-with-pid=${process.pid}`],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  const pid = child.pid
  if (pid === undefined) throw new Error('No stand-in process was made.')
  const ended = new Promise<string>((done) => child.once('exit', (code, signal) => done(signal ?? `exit ${String(code)}`)))
  /** Every inspector address the stand-in printed, in order. */
  const urls: string[] = []
  /** How many lines it printed on stderr that were not an inspector address, for a failure message. */
  let otherLines = 0
  let reading = true
  let partial = ''
  child.stderr.on('data', (chunk) => {
    if (!reading) return
    const lines = (partial + String(chunk)).split('\n')
    partial = lines.pop() ?? ''
    for (const line of lines) {
      recordInspectorAddress(root, pid, line)
      const url = /Debugger listening on (ws:\/\/\S+)/.exec(line)?.[1]
      if (url === undefined) otherLines += 1
      else urls.push(url)
    }
  })
  const running = new Promise<void>((done, fail) => {
    child.stdout.once('data', () => done())
    child.once('exit', (code, signal) => fail(new Error(`The stand-in ended (${signal ?? `exit ${String(code)}`}) before it said it runs, after ${otherLines} other lines on stderr.`)))
  })
  // Awaited by each case; this only keeps a stand-in that ends later from being an unhandled rejection.
  running.catch(() => {})
  return { child, pid, lockPath, urls, ended, running, stopReading: () => { reading = false } }
}
type StandIn = Awaited<ReturnType<typeof aStandIn>>

/**
 * STOP THE STAND-IN BY ITS OWN PID. The release goes first, because a stand-in still busy runs no TERM handler until its
 * loop turns. KILL is sent only if it is still there 5 s after TERM.
 */
async function stopTheStandIn(s: StandIn | undefined, root: string): Promise<void> {
  if (s === undefined) return
  writeFileSync(join(root, 'release'), 'The case is over.')
  if (s.child.exitCode === null && s.child.signalCode === null) {
    s.child.kill('SIGTERM')
    if (!await Promise.race([s.ended.then(() => true), sleep(5_000).then(() => false)])) {
      s.child.kill('SIGKILL')
      await Promise.race([s.ended, sleep(1_000)])
    }
  }
  s.stopReading()
}

async function until(check: () => Promise<boolean>, within: number, what: string): Promise<void> {
  const end = Date.now() + within
  while (Date.now() < end) {
    if (await check()) return
    await sleep(50)
  }
  throw new Error(`${what} did not happen within ${within} ms.`)
}

it('refuses the stable checkout before it reads the service lock, and signals nothing', async () => {
  // A HOME OF THIS CASE'S OWN, set before the stand-in starts, so the stable checkout the tool works out is a folder this
  // case made. The stand-in in it is idle and holds a service lock the tool would accept anywhere else.
  const home = mkdtempSync(join(tmpdir(), 'mole-office-hand-report-home-'))
  vi.stubEnv('HOME', home)
  const root = theStableCheckoutFolder(home)
  let s: StandIn | undefined
  try {
    s = await aStandIn(root, 'idle')
    await s.running
    const realKill = process.kill.bind(process)
    const sent = vi.spyOn(process, 'kill').mockImplementation(realKill)
    const lines: string[] = []
    const result = await officeDiagnosticReport({ root, lockPath: s.lockPath, say: (line: string) => lines.push(line) })
    expect(result).toBe(1)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.slice(0, THE_REFUSAL.length)).toBe(THE_REFUSAL)
    expect(lines[0]).toContain(`, because ${root} is the stable checkout`)
    expect(sent.mock.calls).toEqual([])
    // A signal opens an inspector within milliseconds, so a second is a wide margin for one that was not sent.
    await sleep(1_000)
    expect(s.urls.map(portOf)).toEqual([])
  } finally {
    await stopTheStandIn(s, root)
    rmSync(home, { recursive: true, force: true })
  }
}, 30_000)

// A RUN FROM ANOTHER CHECKOUT THAT READS THE LIVE SERVER'S LOCK IS REFUSED FOR THE TRUE REASON, BEFORE THE PROCESS IS
// READ. The stand-in's lock names the stable checkout, as the live server's does, and the tool's own root is elsewhere.
it('refuses a service lock that names the stable checkout before it reads the process, and signals nothing', async () => {
  const home = mkdtempSync(join(tmpdir(), 'mole-office-hand-report-lock-home-'))
  vi.stubEnv('HOME', home)
  const stableFolder = theStableCheckoutFolder(home)
  const root = mkdtempSync(join(tmpdir(), 'mole-office-hand-report-other-checkout-'))
  let s: StandIn | undefined
  try {
    s = await aStandIn(stableFolder, 'idle')
    await s.running
    const realKill = process.kill.bind(process)
    const sent = vi.spyOn(process, 'kill').mockImplementation(realKill)
    const lines: string[] = []
    const result = await officeDiagnosticReport({ root, lockPath: s.lockPath, say: (line: string) => lines.push(line) })
    expect(result).toBe(1)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.slice(0, THE_REFUSAL.length)).toBe(THE_REFUSAL)
    expect(lines[0]).toContain(`, because ${stableFolder} is the stable checkout`)
    expect(sent.mock.calls).toEqual([])
    // A signal opens an inspector within milliseconds, so a second is a wide margin for one that was not sent.
    await sleep(1_000)
    expect(s.urls.map(portOf)).toEqual([])
  } finally {
    await stopTheStandIn(s, stableFolder)
    rmSync(root, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
}, 30_000)

it('in another checkout, reports on an idle child, closes its inspector and finds none open again', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-hand-report-checkout-'))
  let s: StandIn | undefined
  try {
    s = await aStandIn(root, 'idle')
    await s.running
    const lines: string[] = []
    const result = await officeDiagnosticReport({ root, lockPath: s.lockPath, say: (line: string) => lines.push(line) })
    expect(result, lines.slice(1).join('\n')).toBe(0)
    expect(lines).toHaveLength(2)
    expect(existsSync(lines[0]!)).toBe(true)
    const report = JSON.parse(readFileSync(lines[0]!, 'utf8'))
    expect(report.pid).toBe(s.pid)
    expect(report.inspectorClosed).toBe(true)
    expect(await whatThePortSays(portOf(report.inspectorUrl))).toBe('refused')
  } finally {
    await stopTheStandIn(s, root)
    rmSync(root, { recursive: true, force: true })
  }
}, 30_000)

it('closes a second inspector that opens when a busy child next turns its event loop, and names its port', async () => {
  // "HELD BUSY ACROSS THE WHOLE REPORT" IS READ AS BUSY FROM BEFORE THE SIGNAL UNTIL THE TOOL'S OWN CLOSE, AND RELEASED
  // DURING THE WATCH. A child busy for ever never turns its loop, so it never opens a second inspector, and there would
  // be nothing to close. Released while the tool still watches, it opens one, as a live server that was busy does.
  const root = mkdtempSync(join(tmpdir(), 'mole-office-hand-report-busy-'))
  let s: StandIn | undefined
  try {
    s = await aStandIn(root, 'busy')
    await s.running
    const standIn = s
    const lines: string[] = []
    const asked = officeDiagnosticReport({ root, lockPath: s.lockPath, say: (line: string) => lines.push(line) })
    // Should this case fail before it awaits the tool, the tool's own end is not an unhandled rejection.
    asked.catch(() => {})
    // THE RELEASE COMES AFTER THE TOOL'S OWN TCP PROOF. The second inspector opens on the same port about 26 ms after the
    // release. Released before the tool saw the first port refuse, the tool could take the second inspector for the
    // first one still open. The tool probes every 25 ms, so 500 ms after this case sees the refusal, the tool has too.
    await until(async () => {
      const first = standIn.urls[0]
      return first !== undefined && await whatThePortSays(portOf(first)) === 'refused'
    }, 15_000, 'The first inspector closing')
    await sleep(500)
    writeFileSync(join(root, 'release'), 'The case releases the busy stand-in during the watch.')
    const result = await asked
    // Long after the watch: an inspector that opened and was left open would still accept a connection now.
    await sleep(10_000)
    expect(s.urls.length, `inspector ports: ${s.urls.map(portOf).join(', ')}`).toBeGreaterThanOrEqual(2)
    for (const url of s.urls) expect(await whatThePortSays(portOf(url)), `port ${portOf(url)}`).toBe('refused')
    expect(lines.slice(2)).toEqual([
      `A new inspector opened on port ${portOf(s.urls[1]!)} after the report and was closed; the port now refuses connections.`,
    ])
    expect(result).toBe(1)
  } finally {
    await stopTheStandIn(s, root)
    rmSync(root, { recursive: true, force: true })
  }
}, 60_000)
