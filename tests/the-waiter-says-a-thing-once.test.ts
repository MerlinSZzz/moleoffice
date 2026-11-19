// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITER SAYS HOW IT HOLDS THE HANDLE ONCE PER START, AND AN OUTAGE IN ONE LINE.
 *
 * The office must be concise but traceable. Two kinds of line repeated in
 * every secretary's out file, and both are changed here as agreed with the agent who keeps the kit, in
 * message AxeM15k4gURu.
 *
 *   - The lines on how the handle is held (the project, the holding line, the paragraph on how a
 *     message wakes the session, the session's process) were printed by every run of the tool, so
 *     with every hand-over. The kit's waiter now passes --again on every run after a hand-over, and
 *     the tool leaves them out. --again without --kept-by-the-kit is refused before anything is held.
 *   - An outage was a line when the office went and a line when it came back. It is now one line,
 *     written when the office answers again, and it says what the office answered about the hold
 *     (condition 1): kept, or lapsed and taken again. A run that ends while the office is
 *     away says since when. In the kit's waiter, a run that ends "exiting: error" is written once per
 *     reason (condition 2), and one line says how long the errors lasted.
 *
 * WHAT IS PROVED HERE. The real tool runs against a fake office this file serves, so the outage can
 * be made to start and end at chosen moments. The real waiter.sh runs over a stub of the tool, which
 * records the arguments of every run and ends each run as the test says.
 *
 * MUTATIONS, EACH PROVED AFTER A CONTROL RUN (the round's report has the logs):
 *   - waiter.sh never sets --again: T1 goes red.
 *   - the tool prints the holding line whatever --again says: T2 goes red.
 *   - the tool says "still holds" on the lapsed path: T4 goes red.
 *   - waiter.sh writes every error line, not once per reason: T7 goes red.
 */

import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const TOOL = fileURLToPath(new URL('../for-agents/hold-the-handle.mjs', import.meta.url))
const WAITER = fileURLToPath(new URL('../for-agents/waiter.sh', import.meta.url))
const AGENT = 'once-hand'
// The real hold door returns HoldOnTheWire.agent (api/handles.ts); handles are addresses.
const HELD_AGENT = { kind: 'agent', id: randomBytes(9).toString('base64url') } as const
const SESSION = 'session-record-for-once'
const MESSAGE = 'message-record-for-once'
const HOLDING = 'Holding the handle'

const children: ChildProcess[] = []

afterAll(() => {
  for (const child of children) {
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is the outcome this wanted.
    }
  }
})

/** One JSON answer, with the content type the tool reads. */
function answer(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) })
  res.end(text)
}

interface FakeOffice {
  url: string
  /** From now on every request is cut off, which is "nothing answered". */
  goAway: (what?: 'everything' | 'the waiting door') => void
  /** From now on requests are answered; `lapsed` makes the next beat answer 409, as a hold that went quiet. */
  comeBack: (options?: { lapsed?: boolean }) => void
  /** From now on the waiting door hands the one message over. */
  sendTheMessage: () => void
  failedHeartbeats: () => number
  holds: () => number
  close: () => Promise<void>
}

/** A fake office with a beat of one second: it holds, beats, waits, and hands one message over when told. */
async function startAFakeOffice(): Promise<FakeOffice> {
  let away: 'nothing' | 'everything' | 'the waiting door' = 'nothing'
  let lapsed = false
  let messageReady = false
  let holds = 0
  // The tool stays quiet until recovery; a second failed beat proves it consumed the first failure.
  let failedBeats = 0
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://the-fake-office')
    const path = url.pathname
    const method = req.method ?? 'GET'
    if (away === 'everything' || (away === 'the waiting door' && path === `/api/handles/${AGENT}/waiting`)) {
      if (path === `/api/handles/${AGENT}/beat`) failedBeats += 1
      res.destroy()
      return
    }
    if (method === 'POST' && path === `/api/handles/${AGENT}/hold`) {
      holds += 1
      lapsed = false
      answer(res, 201, { hold: { agent: HELD_AGENT, handle: AGENT, session: SESSION, state: 'fresh' }, beatEvery: 1, lapsesAfter: 120 })
      return
    }
    if (method === 'POST' && path === `/api/handles/${AGENT}/beat`) {
      // A LAPSED HOLD STAYS LAPSED UNTIL IT IS HELD AGAIN, as in the office.
      if (lapsed) {
        answer(res, 409, { error: `Nobody holds "${AGENT}".` })
        return
      }
      answer(res, 200, { hold: { state: 'fresh' } })
      return
    }
    if (method === 'GET' && path === `/api/handles/${AGENT}/waiting`) {
      // A SHORT HOLD, so the loop asks again soon; the real door holds up to thirty seconds.
      setTimeout(() => answer(res, 200, { waiting: messageReady ? [{ messageId: MESSAGE, urgent: false }] : [] }), 150)
      return
    }
    if (method === 'POST' && path === `/api/handles/${AGENT}/took`) {
      answer(res, 200, { inProject: 'default' })
      return
    }
    if (method === 'POST' && path === `/api/messages/${MESSAGE}/mark`) {
      answer(res, 200, { mark: 'seen' })
      return
    }
    if (method === 'GET' && path === `/api/records/${SESSION}`) {
      answer(res, 200, { record: { id: SESSION, workspaceId: 'default', data: {} } })
      return
    }
    if (method === 'GET' && path === `/api/records/${MESSAGE}`) {
      answer(res, 200, {
        record: {
          id: MESSAGE,
          kind: 'message',
          workspaceId: 'default',
          title: 'after the outage',
          data: { body: 'THE-MESSAGE-AFTER-THE-OUTAGE', to: [{ kind: 'agent', id: AGENT }], sentBy: { kind: 'person', id: 'p' } },
        },
      })
      return
    }
    if (method === 'GET' && path === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end()
      return
    }
    answer(res, 404, { error: `the fake office does not answer ${method} ${path}` })
  })
  await new Promise<void>((go) => server.listen(0, '127.0.0.1', go))
  return {
    url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
    goAway: (what = 'everything') => {
      failedBeats = 0
      away = what
    },
    comeBack: (options = {}) => {
      lapsed = options.lapsed === true
      away = 'nothing'
    },
    sendTheMessage: () => {
      messageReady = true
    },
    failedHeartbeats: () => failedBeats,
    holds: () => holds,
    close: () =>
      new Promise<void>((go) => {
        server.closeAllConnections()
        server.close(() => go())
      }),
  }
}

/** Start the real tool against the fake office, with its own environment and never the launcher's. */
function startTheTool(office: FakeOffice, extraArgs: string[], holdStartupTail = false): { said: () => string; started: () => Promise<void>; releaseStartup: () => void; ended: Promise<number>; child: ChildProcess } {
  const marker = `\u001e${randomBytes(18).toString('hex')}\u001f`
  // The first waiting request follows all startup writes. Put its marker on the same pipe so
  // seeing it proves those bytes were consumed too, regardless of pipe fragmentation.
  const observeStartup = `
    const fetch = globalThis.fetch
    const write = process.stdout.write.bind(process.stdout)
    const tail = []
    let buffering = false
    let started = false
    // T6 holds the bytes after the holding line until the test releases them. This makes the
    // original partial-startup observation reproducible without a delay or a busy machine.
    if (${holdStartupTail}) process.stdout.write = (chunk, ...args) => {
      const text = String(chunk)
      if (!buffering && text.includes(${JSON.stringify(HOLDING)})) {
        buffering = true
        const end = text.indexOf('\\n') + 1
        write(text.slice(0, end))
        tail.push(text.slice(end))
        return true
      }
      if (buffering && !started) { tail.push(text); return true }
      return write(chunk, ...args)
    }
    globalThis.fetch = async (...args) => {
      if (!started && new URL(args[0]).pathname === ${JSON.stringify(`/api/handles/${AGENT}/waiting`)}) {
        if (${holdStartupTail}) {
          const release = new Promise(go => process.once('message', go))
          process.send('startup produced')
          await release
          for (const part of tail) write(part)
        }
        started = true
        write(${JSON.stringify(marker)})
      }
      return fetch(...args)
    }
  `
  const child = spawn(
    process.execPath,
    ['--import', `data:text/javascript,${encodeURIComponent(observeStartup)}`, TOOL, '--agent', AGENT, '--session', SESSION, '--api', office.url, '--workspace', 'default', ...extraArgs],
    {
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        MOLE_OFFICE_API: office.url,
        MOLE_OFFICE_WORKSPACE: 'default',
        MOLE_OFFICE_SESSION: SESSION,
        MOLE_OFFICE_AGENT: AGENT,
        MOLE_AGENT_KEY: 'a-test-key-for-the-fake-office',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  )
  children.push(child)
  const output = startupOutput(marker)
  const produced = new Promise<void>((go) => child.once('message', () => go()))
  let released = false
  const releaseStartup = () => {
    if (!holdStartupTail || released) return
    released = true
    void produced.then(() => { child.send('release startup') })
  }
  child.stdout?.on('data', (chunk) => output.append(String(chunk)))
  child.stderr?.on('data', (chunk) => output.append(String(chunk)))
  const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
  return { said: output.said, started: async () => { releaseStartup(); await output.started }, releaseStartup, ended, child }
}

function startupOutput(marker: string) {
  let printed = ''
  let markStarted!: () => void
  const started = new Promise<void>((go) => { markStarted = go })
  return {
    append: (chunk: string) => {
      printed += chunk
      if (printed.includes(marker)) markStarted()
    },
    said: () => printed.replace(marker, ''),
    started,
  }
}

async function until(what: () => boolean, within = 15_000): Promise<boolean> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (what()) return true
    await new Promise((go) => setTimeout(go, 100))
  }
  return false
}

/** The lines the tool used to print for an outage. None may come back. */
const OLD_OUTAGE_LINES = ['Mole Office is not answering on', 'Mole Office is answering again', 'has not answered the last three heartbeats']

/**
 * A stub in place of the tool for waiter.sh. It appends each run's arguments to `runs`, one line per
 * run, and ends each run with the next line of `endings`; past the end it ends "exiting: stopped".
 */
const STUB = `import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const counter = join(here, 'attempts')
const n = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
writeFileSync(counter, String(n + 1))
appendFileSync(join(here, 'runs'), process.argv.slice(2).join(' ') + '\\n')
const endings = readFileSync(join(here, 'endings'), 'utf8').split('\\n').filter((one) => one !== '')
process.stdout.write((n < endings.length ? endings[n] : 'exiting: stopped') + '\\n')
process.exit(0)
`

/** Run the real waiter.sh over the stub, with the endings given, and read what it wrote. */
async function runTheWaiter(endings: string[]): Promise<{ written: string; runs: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-waiter-once-'))
  mkdirSync(join(dir, 'for-agents'), { recursive: true })
  writeFileSync(join(dir, 'for-agents', 'hold-the-handle.mjs'), STUB)
  chmodSync(join(dir, 'for-agents', 'hold-the-handle.mjs'), 0o755)
  writeFileSync(join(dir, 'for-agents', 'endings'), endings.join('\n') + '\n')
  appendFileSync(join(dir, 'for-agents', 'runs'), '')
  const out = join(dir, 'waiter.out')
  const child = spawn('bash', [WAITER, 'keeper', 'the-session', 'default', out], {
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      MOLE_OFFICE_CHECKOUT: dir,
      MOLE_OFFICE_API: 'http://127.0.0.1:9',
      WAITER_ERROR_WAIT: '0.1',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  children.push(child)
  await new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
  return {
    written: readFileSync(out, 'utf8'),
    runs: readFileSync(join(dir, 'for-agents', 'runs'), 'utf8').split('\n').filter((one) => one !== ''),
  }
}

describe('the waiter says a thing once', () => {
  it('startup observation waits for the last startup byte, even when its marker is split', async () => {
    const marker = randomBytes(18).toString('hex')
    const output = startupOutput(marker)
    let started = false
    void output.started.then(() => { started = true })
    const beginning = `${HOLDING} in the fixture.\n`
    output.append(beginning)
    await Promise.resolve()
    expect(started).toBe(false)
    output.append('The fixture finished its process diagnostic.\n' + marker.slice(0, -1))
    await Promise.resolve()
    expect(started).toBe(false)
    output.append(marker.slice(-1))
    await output.started
    expect(started).toBe(true)
    expect(output.said()).toBe(beginning + 'The fixture finished its process diagnostic.\n')
  })

  it('T1: the kit passes --again on every run after the first hand-over, and not before', async () => {
    const { runs } = await runTheWaiter(['exiting: delivered A', 'exiting: delivered B', 'exiting: delivered C'])
    expect(runs).toHaveLength(4)
    expect(runs[0]).toContain('--kept-by-the-kit')
    expect(runs[0]).not.toContain('--again')
    for (const later of runs.slice(1)) expect(later).toContain('--kept-by-the-kit --again')
  }, 30_000)

  it('T2: with --again the tool leaves out the lines on how the handle is held; without it they are there', async () => {
    const office = await startAFakeOffice()
    try {
      const first = startTheTool(office, ['--kept-by-the-kit'])
      expect(await until(() => first.said().includes('Holding the handle'))).toBe(true)
      expect(first.said()).toContain('Project "default" taken from')
      first.child.kill('SIGTERM')
      await first.ended

      const again = startTheTool(office, ['--kept-by-the-kit', '--again'])
      office.sendTheMessage()
      expect(await again.ended).toBe(0)
      const said = again.said()
      expect(said).toContain('THE-MESSAGE-AFTER-THE-OUTAGE')
      expect(said).not.toContain('Holding the handle')
      expect(said).not.toContain('taken from')
      expect(said).not.toContain('second way in')
      expect(said).not.toContain("This session's own process is on record")
    } finally {
      await office.close()
    }
  }, 30_000)

  it('T3: --again without --kept-by-the-kit is refused in a sentence before anything is held', async () => {
    const office = await startAFakeOffice()
    try {
      const run = startTheTool(office, ['--again'])
      expect(await run.ended).toBe(2)
      expect(run.said()).toContain('--again is only for the kit')
      expect(run.said().trim().split('\n').at(-1)).toBe('exiting: error: --again was passed without --kept-by-the-kit')
      expect(office.holds()).toBe(0)
    } finally {
      await office.close()
    }
  }, 30_000)

  it('T4: an outage in which the hold lapsed is one line on return, and it says the hold lapsed and was taken again', async () => {
    const office = await startAFakeOffice()
    try {
      const run = startTheTool(office, ['--kept-by-the-kit'])
      expect(await until(() => run.said().includes('Holding the handle'))).toBe(true)
      office.goAway()
      expect(await until(() => office.failedHeartbeats() >= 2)).toBe(true)
      expect(office.failedHeartbeats()).toBeGreaterThanOrEqual(2)
      office.comeBack({ lapsed: true })
      expect(await until(() => run.said().includes('Mole Office was away'))).toBe(true)
      office.sendTheMessage()
      expect(await run.ended).toBe(0)
      const said = run.said()
      const lines = said.split('\n').filter((line) => line.startsWith('Mole Office was away'))
      expect(lines, said).toHaveLength(1)
      expect(lines[0]).toMatch(
        new RegExp(`^Mole Office was away \\d\\d:\\d\\d:\\d\\d–\\d\\d:\\d\\d:\\d\\d\\. The hold on "${AGENT}" lapsed while it was away, and this session has taken it again\\.`),
      )
      expect(said).not.toContain('still holds')
      for (const old of OLD_OUTAGE_LINES) expect(said).not.toContain(old)
      expect(said.indexOf('Mole Office was away')).toBeLessThan(said.indexOf('THE-MESSAGE-AFTER-THE-OUTAGE'))
    } finally {
      await office.close()
    }
  }, 40_000)

  it('T5: an outage in which the hold was kept is one line, written before the message it lets through', async () => {
    const office = await startAFakeOffice()
    try {
      const run = startTheTool(office, ['--kept-by-the-kit'])
      expect(await until(() => run.said().includes('Holding the handle'))).toBe(true)
      office.goAway()
      expect(await until(() => office.failedHeartbeats() >= 2)).toBe(true)
      expect(office.failedHeartbeats()).toBeGreaterThanOrEqual(2)
      // THE MESSAGE IS READY AS THE OFFICE COMES BACK, so the waiting door may answer before the
      // next heartbeat. The line must still come first.
      office.sendTheMessage()
      office.comeBack()
      expect(await run.ended).toBe(0)
      const said = run.said()
      const lines = said.split('\n').filter((line) => line.startsWith('Mole Office was away'))
      expect(lines, said).toHaveLength(1)
      expect(lines[0]).toMatch(new RegExp(`^Mole Office was away [0-9:]+–[0-9:]+\\. It answers that this session still holds "${AGENT}"`))
      for (const old of OLD_OUTAGE_LINES) expect(said).not.toContain(old)
      expect(said.indexOf('Mole Office was away')).toBeLessThan(said.indexOf('THE-MESSAGE-AFTER-THE-OUTAGE'))
    } finally {
      await office.close()
    }
  }, 40_000)

  it('T6: a run that ends while the office is away says since when, and nothing was said before that', async () => {
    const office = await startAFakeOffice()
    try {
      const run = startTheTool(office, ['--kept-by-the-kit'], true)
      await run.started()
      const before = run.said().length
      office.goAway()
      run.releaseStartup()
      expect(await until(() => office.failedHeartbeats() >= 2)).toBe(true)
      expect(office.failedHeartbeats()).toBeGreaterThanOrEqual(2)
      expect(run.said().length, run.said()).toBe(before)
      run.child.kill('SIGTERM')
      await run.ended
      const said = run.said()
      expect(said).toMatch(/Mole Office has not answered a heartbeat since \d\d:\d\d:\d\d\.\nexiting: stopped\n$/)
      for (const old of OLD_OUTAGE_LINES) expect(said).not.toContain(old)
    } finally {
      await office.close()
    }
  }, 40_000)

  it('T7: the kit writes each error reason once, and one line for how long the errors lasted', async () => {
    const { written } = await runTheWaiter([
      'exiting: delivered A',
      'exiting: error: Mole Office is not answering on http://127.0.0.1:9',
      'exiting: error: Mole Office is not answering on http://127.0.0.1:9',
      'exiting: error: Mole Office is not answering on http://127.0.0.1:9',
      'exiting: delivered B',
      'exiting: error: the project could not be worked out',
      'exiting: error: the project could not be worked out',
      'exiting: error: Mole Office is not answering on http://127.0.0.1:9',
      'exiting: delivered C',
    ])
    const errorLines = written.split('\n').filter((line) => line.startsWith('=== waiter: exiting: error'))
    expect(errorLines, written).toHaveLength(3)
    expect(errorLines[0]).toContain('not answering')
    expect(errorLines[1]).toContain('the project could not be worked out')
    expect(errorLines[2]).toContain('not answering')
    const ended = written.split('\n').filter((line) => /^=== waiter: (the office was away|runs ended in that error)/.test(line))
    expect(ended, written).toHaveLength(2)
    expect(ended[0]).toMatch(/^=== waiter: the office was away \d{4}-\d\d-\d\d \d\d:\d\d:\d\d–\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
    // THE LAST REASON OF THE SECOND STRETCH WAS "not answering", so that stretch is said as the office away.
    expect(ended[1]).toMatch(/^=== waiter: the office was away /)
    expect(written.indexOf(ended[0]!)).toBeLessThan(written.indexOf('exiting: delivered B'))
  }, 30_000)

  it('T8: errors of another reason end in a line that says the runs ended in that error', async () => {
    const { written } = await runTheWaiter([
      'exiting: error: the project could not be worked out',
      'exiting: error: the project could not be worked out',
      'exiting: delivered A',
    ])
    const ended = written.split('\n').filter((line) => line.startsWith('=== waiter: runs ended in that error from '))
    expect(ended, written).toHaveLength(1)
    expect(written.split('\n').filter((line) => line.startsWith('=== waiter: exiting: error'))).toHaveLength(1)
  }, 30_000)
})
