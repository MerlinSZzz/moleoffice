// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A restart asked for while the dev supervisor is writing itself into the ledger waits for that
 * write. The write goes through the server the supervisor started, so stopping that server in the
 * middle sent the rest of the write to the next server's port. There the stand-in answered 503
 * during the next server's migrations, the write failed, and startup ended with the supervisor's
 * own server stopped. A write the office refuses while a restart waits for it ends startup, and the
 * ordinary stop marks the session finished through that same server before stopping it, so the
 * restart then stops and starts nothing. The refusal is a 403: a 500 is no certain answer, and the
 * write is tried again after it.
 *
 * Like a-dev-supervisors-ledger-writes-have-a-deadline.test.ts, this runs unchanged production in a
 * disposable checkout, with the real stand-in. The fixture server holds the session POST and asks
 * for a restart while it holds it: by the press's message or by changing a watched file. It answers
 * the session POST when it is told to stop, or after HOLD_MS if nobody stops it. The second server
 * prints the migration lines every server prints, and holds them open until the ledger write's last
 * call has an answer, so a call that went to the port in between meets the stand-in. Nothing here
 * depends on load: HOLD_MS only bounds the wait on code that waits for the write.
 */
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { theTimeLeftIn, type TheTimeLeft } from './how-long-a-test-may-take.ts'
import { A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS, aLineThatEndsWithItsOwner, commandThatWatchesItsOwnerFromInside } from './the-owner-watching-gate.ts'

const REPO = join(import.meta.dirname, '..')
/** On the code before the fix the press's restart came 1 ms after the session POST, and a watched change's 251 ms (28 October 2026). */
const HOLD_MS = 3_000
interface Event {
  what: string
  pid?: number
  generation?: number
  method?: string
  path?: string
  status?: number
  state?: string
  at: number
}

function eventsIn(root: string): Event[] {
  const file = join(root, 'events.jsonl')
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Event) : []
}

function liveInRecordedGroup(group: number): number[] {
  // Detached fixture leaders start their own sessions. Select only that recorded session, then
  // the recorded process group; never enumerate /proc or ask ps for the whole machine.
  try {
    return execFileSync('ps', ['-s', String(group), '-o', 'pid=,pgid=,stat='], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).flatMap(line => {
      const [pid, pgid, state] = line.trim().split(/\s+/)
      return Number(pgid) === group && !/^[ZX]/.test(state!) ? [Number(pid)] : []
    })
  } catch (error) {
    if ((error as { status?: number }).status === 1) return []
    throw error
  }
}

function signalGroup(group: number): void {
  try { process.kill(-group, 'SIGKILL') } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

async function aFreePort(): Promise<number> {
  const probe = createServer()
  return await new Promise((done, fail) => {
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') throw new Error('The fixture has no port.')
      probe.close(() => done(address.port))
    })
  })
}

async function until(read: () => boolean, time: TheTimeLeft, what: string): Promise<void> {
  const end = Date.now() + time.forAWait(what)
  while (!read()) {
    if (Date.now() >= end) throw new Error(`Timed out waiting for ${what}.`)
    await delay(20)
  }
}

/** What the supervisor's writes through the port were answered, in order. The ledger's calls are its only writes. */
function answers(events: Event[]): string[] {
  return events.filter(e => (e.what === 'headers' || e.what === 'fetch-failed') && e.method !== 'GET').map(e => `${e.method!} ${e.path!} ${String(e.status ?? 'no answer')}`)
}

const ASKS = {
  'the restart press': `process.send({ officeControl: 'restart' })`,
  'a watched change': `appendFileSync('src/server/index.ts', '\\n// a change while the supervisor writes itself into the ledger\\n')`,
} as const

async function restartDuringTheLedgerWrite(ask: keyof typeof ASKS, theWriteFails: boolean, time: TheTimeLeft): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'dev-restart-during-ledger-'))
  let leader: number | undefined
  let output = ''
  try {
    for (const part of ['src', 'tools']) cpSync(join(REPO, part), join(root, part), { recursive: true })
    symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
    writeFileSync(join(root, 'package.json'), '{"type":"module"}')
    writeFileSync(join(root, 'src/worker/index.ts'), '// A fixture worker entry.\n')
    const recordEvent = `const event = value => appendFileSync('events.jsonl', JSON.stringify({ ...value, at: Date.now() }) + '\\n');`
    writeFileSync(join(root, 'src/server/index.ts'), `
      import { createServer } from 'node:http'
      import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
      import { THE_MIGRATIONS_BEGIN, THE_MIGRATIONS_END } from '../config/migration-markers.mjs'
      ${recordEvent}
      ${aLineThatEndsWithItsOwner()}
      const generation = existsSync('generation') ? Number(readFileSync('generation', 'utf8')) + 1 : 1
      writeFileSync('generation', String(generation))
      event({ what: 'child', pid: process.pid, generation })
      if (generation > 1) {
        const theLedgerWriteIsAnswered = () => readFileSync('events.jsonl', 'utf8').split('\\n').filter(Boolean)
          .map(line => JSON.parse(line)).some(e => (e.what === 'headers' || e.what === 'fetch-failed') && e.method === 'PATCH')
        console.log(THE_MIGRATIONS_BEGIN)
        const end = Date.now() + 10_000
        while (!theLedgerWriteIsAnswered() && Date.now() < end) await new Promise(done => setTimeout(done, 20))
        console.log(THE_MIGRATIONS_END)
      }
      let held = null
      const server = createServer(async (request, response) => {
        let raw = ''
        for await (const chunk of request) raw += chunk
        const state = request.method === 'PATCH' ? JSON.parse(raw).dataPatch?.state : undefined
        event({ what: 'request', generation, method: request.method, path: request.url, state })
        const answer = (body, status = 200) => {
          response.writeHead(status, { 'content-type': 'application/json', connection: 'close' })
          response.end(JSON.stringify(body))
        }
        if (generation === 1 && request.method === 'POST' && request.url === '/api/records') {
          held = () => { held = null; answer({ record: { id: 'fixture-session' } }) }
          setTimeout(() => held?.(), ${String(HOLD_MS)})
          ${ASKS[ask]}
          return
        }
        if (request.url === '/api/resources' && ${String(theWriteFails)}) answer({ error: 'A made-up refusal of the resource.' }, 403)
        else answer(request.url === '/api/resources' ? { resource: { id: 'fixture-resource' } } : { generation })
      })
      server.listen({ fd: Number(process.env.MOLE_OFFICE_LISTEN_FD) }, () => event({ what: 'listening', generation }))
      process.on('SIGTERM', () => {
        event({ what: 'child-stopping', generation })
        server.close(() => process.exit(0))
        held?.()
        server.closeIdleConnections()
      })
    `)
    writeFileSync(join(root, 'observe.mjs'), `
      import { appendFileSync } from 'node:fs'
      ${recordEvent}
      const reallyFetch = globalThis.fetch
      globalThis.fetch = async (url, options) => {
        const path = new URL(String(url)).pathname
        const method = options?.method ?? 'GET'
        if (path !== '/api/health') event({ what: 'fetch', path, method })
        try {
          const answer = await reallyFetch(url, options)
          if (path !== '/api/health') event({ what: 'headers', path, method, status: answer.status })
          return answer
        } catch (error) {
          if (path !== '/api/health') event({ what: 'fetch-failed', path, method })
          throw error
        }
      }
    `)
    const port = await aFreePort()
    const watched = commandThatWatchesItsOwnerFromInside(['--import', './observe.mjs', 'tools/serve-dev.mjs'])
    const command = spawn(watched.command, watched.args, {
      cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, HOME: root, MOLE_OFFICE_PORT: String(port), MOLE_OFFICE_DB: join(root, 'fixture.db'),
        MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES: '0' },
    })
    leader = command.pid
    if (leader === undefined) throw new Error('The fixture command did not start.')
    command.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
    command.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
    let ended: { code: number | null; signal: NodeJS.Signals | null } | undefined
    command.once('exit', (code, signal) => { ended = { code, signal } })
    await until(() => ended !== undefined || eventsIn(root).some(e => e.what === 'listening' && e.generation === 2), time, 'the second server or the end of the command')
    const events = eventsIn(root)
    const stopped = events.findIndex(e => e.what === 'child-stopping' && e.generation === 1)
    if (theWriteFails) {
      await until(() => ended !== undefined, time, 'the end of the command')
      expect(ended, output).toEqual({ code: 1, signal: null })
      const after = eventsIn(root)
      expect(answers(after), JSON.stringify(after)).toEqual(expect.arrayContaining(['POST /api/records 200', 'POST /api/resources 403']))
      const finished = after.findIndex(e => e.what === 'request' && e.method === 'PATCH' && e.state === 'finished' && e.generation === 1)
      expect(finished, JSON.stringify(after)).toBeGreaterThan(-1)
      expect(after.findIndex(e => e.what === 'child-stopping' && e.generation === 1), JSON.stringify(after)).toBeGreaterThan(finished)
      expect(after.filter(e => e.what === 'child').map(e => e.generation), JSON.stringify(after)).toEqual([1])
      return
    }
    expect(ended, `${output}\n${JSON.stringify(events)}`).toBeUndefined()
    expect(answers(events), JSON.stringify(events)).toEqual(['POST /api/records 200', 'POST /api/resources 200', 'PATCH /api/records/fixture-session 200'])
    const calls = events.filter(e => e.what === 'request' && e.path !== '/api/health')
    expect(calls.map(e => `${String(e.generation)} ${e.method!} ${e.path!}`), JSON.stringify(events)).toEqual(expect.arrayContaining([
      '1 POST /api/records', '1 POST /api/resources', '1 PATCH /api/records/fixture-session',
    ]))
    const patched = events.findIndex(e => e.what === 'request' && e.method === 'PATCH' && e.generation === 1)
    expect(stopped, JSON.stringify(events)).toBeGreaterThan(patched)
    // The migrations' stand-in may still take one read while it stops, and answers it 503.
    let second: unknown = null
    const asked = Date.now() + time.forAWait('the second server to answer')
    while (second === null && Date.now() < asked) {
      const reply = await fetch(`http://127.0.0.1:${String(port)}/api/health`, { signal: AbortSignal.timeout(5_000) })
      if (reply.status === 200) second = await reply.json()
      else await reply.text()
    }
    expect(second, output).toEqual({ generation: 2 })
    command.kill('SIGTERM')
    await until(() => ended !== undefined, time, 'the ordinary command stop')
    expect(ended, output).toEqual({ code: 0, signal: null })
    const groups = [leader, ...eventsIn(root).filter(e => e.what === 'child').map(e => e.pid!)]
    await until(() => groups.every(group => liveInRecordedGroup(group).length === 0), time, 'the recorded groups to end')
  } finally {
    const groups = [...new Set([leader, ...eventsIn(root).filter(e => e.what === 'child').map(e => e.pid)].filter((pid): pid is number => pid !== undefined))]
    for (const group of groups) signalGroup(group)
    const end = Date.now() + A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS
    while (groups.some(group => liveInRecordedGroup(group).length > 0) && Date.now() < end) await delay(20)
    expect(groups.flatMap(liveInRecordedGroup), 'Cleanup must reap its own fixture groups even on red.').toEqual([])
    rmSync(root, { recursive: true, force: true })
  }
}

for (const ask of Object.keys(ASKS) as (keyof typeof ASKS)[]) {
  it(`${ask} during the ledger write waits for the write, and the next server answers`, async ({ task }) => {
    await restartDuringTheLedgerWrite(ask, false, theTimeLeftIn(task))
  })
}

it('the restart press during a ledger write the office refuses leaves the server to the ordinary stop', async ({ task }) => {
  await restartDuringTheLedgerWrite('the restart press', true, theTimeLeftIn(task))
})
