// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Ledger POSTs, including their JSON bodies, have the health call's deadline. A write that passes
 * it is tried again while the child goes on serving: a session is filed again, and a row is looked
 * for in the ledger before it is written again. The command ends only when it is told to stop. A
 * session already acknowledged stays available to that stop while resource registration is pending.
 *
 * Like a-failed-dev-start-stops-its-children.test.ts, this runs unchanged production in a disposable
 * checkout. The preload observes actual signals and group stops. The HTTP stand-in withholds
 * either headers or the end of a JSON body of the first POST to the chosen path, and never answers
 * that one; it answers the next one, and a read of the ledger finds no row, because the withheld
 * write never landed. Children watch this test worker, so parent death cannot hide a missing
 * ordinary stop. Cleanup reads only the recorded sessions/groups, and reaps them even when an
 * assertion fails. In the pending-stop case, the preload holds an already-aborted fetch rejection
 * until process exit: stop must find the session before the overall registration promise has
 * returned any result.
 */
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { theLogSaysTheStartupIsDone } from '../src/config/supervisor-startup-done.mjs'
import { theTimeLeftIn, type TheTimeLeft } from './how-long-a-test-may-take.ts'
import { A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS, aLineThatEndsWithItsOwner, commandThatWatchesItsOwnerFromInside } from './the-owner-watching-gate.ts'

const REPO = join(import.meta.dirname, '..')
interface Event {
  what: string
  pid?: number
  group?: number
  signal?: string
  method?: string
  path?: string
  within?: number | null
  body?: { data?: { detail?: string }; dataPatch?: { state?: string; detail?: string }; key?: string }
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

async function checkStuckWrite(path: string, bodyStarted: boolean, stopWhilePending: boolean, time: TheTimeLeft): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'dev-ledger-deadline-'))
  let leader: number | undefined
  let output = ''
  try {
    for (const part of ['src', 'tools']) cpSync(join(REPO, part), join(root, part), { recursive: true })
    symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
    writeFileSync(join(root, 'package.json'), '{"type":"module"}')
    writeFileSync(join(root, 'src/worker/index.ts'), '// A fixture worker entry.\n')
    const recordEvent = `const event = value => appendFileSync('events.jsonl', JSON.stringify(value) + '\\n');`
    writeFileSync(join(root, 'src/server/index.ts'), `
      import { createServer } from 'node:http'
      import { spawn } from 'node:child_process'
      import { appendFileSync } from 'node:fs'
      ${recordEvent}
      ${aLineThatEndsWithItsOwner()}
      event({ what: 'child', pid: process.pid })
      const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(`${aLineThatEndsWithItsOwner()}setInterval(() => {}, 1000)`)}], { stdio: 'ignore' })
      event({ what: 'descendant', pid: descendant.pid })
      let withheld = false
      const server = createServer(async (request, response) => {
        let raw = ''
        for await (const chunk of request) raw += chunk
        event({ what: 'request', method: request.method, path: request.url, body: raw ? JSON.parse(raw) : null })
        if (request.method === 'POST' && request.url === ${JSON.stringify(path)} && !withheld) {
          withheld = true
          if (${String(bodyStarted)}) {
            response.writeHead(200, { 'content-type': 'application/json', connection: 'close' })
            response.write('{')
          }
          return
        }
        const answer = request.url === '/api/records' ? { record: { id: 'fixture-session' } }
          : request.url === '/api/resources' ? { resource: { id: 'fixture-resource' } }
            : request.url.startsWith('/api/resources?') ? { resources: [] } : {}
        response.writeHead(200, { 'content-type': 'application/json', connection: 'close' })
        response.end(JSON.stringify(answer))
      })
      server.listen({ fd: Number(process.env.MOLE_OFFICE_LISTEN_FD) })
      process.on('SIGTERM', () => {
        event({ what: 'child-stopping' })
        server.closeAllConnections()
        server.close(() => process.exit(0))
      })
    `)
    writeFileSync(join(root, 'observe.mjs'), `
      import { appendFileSync } from 'node:fs'
      ${recordEvent}
      const deadlines = new WeakMap()
      const timeout = AbortSignal.timeout.bind(AbortSignal)
      AbortSignal.timeout = within => { const signal = timeout(within); deadlines.set(signal, within); return signal }
      const reallyFetch = globalThis.fetch
      globalThis.fetch = async (url, options) => {
        const path = new URL(String(url)).pathname
        event({ what: 'fetch', path, method: options?.method ?? 'GET', within: options?.signal ? deadlines.get(options.signal) ?? null : null })
        options?.signal?.addEventListener('abort', () => event({ what: 'aborted', path, method: options?.method ?? 'GET' }), { once: true })
        try {
          const answer = await reallyFetch(url, options)
          event({ what: 'headers', path, method: options?.method ?? 'GET' })
          const json = answer.json.bind(answer)
          answer.json = async () => { const body = await json(); event({ what: 'json', path, method: options?.method ?? 'GET' }); return body }
          return answer
        } catch (error) {
          event({ what: 'fetch-failed', path, method: options?.method ?? 'GET' })
          if (${String(stopWhilePending)} && path === '/api/resources' && options?.method === 'POST' && options.signal?.aborted) {
            event({ what: 'holding-aborted-write' })
            await new Promise(() => {})
          }
          throw error
        }
      }
      const kill = process.kill.bind(process)
      process.kill = (pid, signal) => {
        if (pid < 0) event({ what: 'group-stop', group: -pid, signal })
        return kill(pid, signal)
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
    await until(() => eventsIn(root).some(e => e.what === 'request' && e.path === path && e.method === 'POST'), time, 'the stuck POST')
    const initial = eventsIn(root)
    const health = initial.filter(e => e.what === 'fetch' && e.path === '/api/health').at(-1)
    const post = initial.find(e => e.what === 'fetch' && e.path === path && e.method === 'POST')
    expect(health?.within).toBeGreaterThan(0)
    expect(post?.within, 'The POST must carry the existing health deadline, through its body read.').toBe(health?.within)
    if (stopWhilePending) {
      expect(initial.some(e => e.what === 'json' && e.path === '/api/records')).toBe(true)
      expect(initial.some(e => e.what === 'json' && e.path === '/api/resources')).toBe(false)
    } else {
      await until(() => ended !== undefined || theLogSaysTheStartupIsDone(output, leader!, port), time, 'the end of startup')
      expect(ended, output).toBeUndefined()
      expect(eventsIn(root).some(e => e.what === 'child-stopping'), output).toBe(false)
    }
    command.kill('SIGTERM')
    await until(() => ended !== undefined, time, 'the ordinary command stop')
    const events = eventsIn(root)
    const child = events.find(e => e.what === 'child')?.pid
    expect(child, output).toBeGreaterThan(0)
    expect(events.find(e => e.what === 'descendant')?.pid, output).toBeGreaterThan(0)
    expect.soft(ended, output).toEqual({ code: 0, signal: null })
    const posts = events.filter(e => e.what === 'request' && e.path === path && e.method === 'POST')
    expect.soft(posts).toHaveLength(stopWhilePending ? 1 : 2)
    expect.soft(events.filter(e => e.what === 'aborted' && e.path === path && e.method === 'POST')).toHaveLength(1)
    expect.soft(events.filter(e => e.what === 'json' && e.path === path && e.method === 'POST')).toHaveLength(stopWhilePending ? 0 : 1)
    expect.soft(events.filter(e => e.what === 'headers' && e.path === path && e.method === 'POST')).toHaveLength((bodyStarted ? 1 : 0) + (stopWhilePending ? 0 : 1))
    if (!stopWhilePending) {
      const aborted = events.findIndex(e => e.what === 'aborted' && e.path === path && e.method === 'POST')
      expect.soft(events.indexOf(posts[1]!), JSON.stringify(events)).toBeGreaterThan(aborted)
      if (path === '/api/resources') {
        const read = events.findIndex(e => e.what === 'request' && e.method === 'GET' && e.path?.startsWith('/api/resources?') === true)
        expect.soft(read, JSON.stringify(events)).toBeGreaterThan(aborted)
        expect.soft(events.indexOf(posts[1]!), JSON.stringify(events)).toBeGreaterThan(read)
      } else {
        expect.soft(posts[1]?.body?.data?.detail).toContain(posts[0]?.body?.data?.detail)
        expect.soft(posts[1]?.body?.data?.detail).not.toBe(posts[0]?.body?.data?.detail)
      }
    }
    const stop = events.findIndex(e => e.what === 'group-stop' && e.group === child && e.signal === 'SIGTERM')
    expect.soft(stop, JSON.stringify(events)).toBeGreaterThan(-1)
    expect.soft(events.filter(e => e.what === 'group-stop' && e.group === child && e.signal === 'SIGTERM')).toHaveLength(1)
    expect.soft(events.findIndex(e => e.what === 'child-stopping')).toBeGreaterThan(stop)
    if (path === '/api/resources') {
      const patches = events.filter(e => e.what === 'request' && e.path === '/api/records/fixture-session' && e.method === 'PATCH')
      const finished = patches.find(e => e.body?.dataPatch?.state === 'finished')
      if (stopWhilePending) {
        expect.soft(finished?.body?.dataPatch?.detail).toMatch(/resource registration did not finish/i)
        expect.soft(finished?.body?.dataPatch?.detail).toMatch(/uncertain|unknown/i)
        expect.soft(events.some(e => e.what === 'holding-aborted-write')).toBe(true)
      } else {
        const written = patches.find(e => e.body?.dataPatch?.state !== 'finished')
        expect.soft(written?.body?.dataPatch?.detail).toBeTruthy()
        expect.soft(finished?.body?.dataPatch?.detail).toContain(written?.body?.dataPatch?.detail)
        expect.soft(events.indexOf(written!), JSON.stringify(events)).toBeGreaterThan(-1)
        expect.soft(events.indexOf(finished!), JSON.stringify(events)).toBeGreaterThan(events.indexOf(written!))
      }
      expect.soft(events.indexOf(finished!), JSON.stringify(events)).toBeGreaterThan(-1)
      expect.soft(stop).toBeGreaterThan(events.indexOf(finished!))
      const session = events.find(e => e.what === 'request' && e.path === '/api/records' && e.method === 'POST')
      expect.soft(session?.body?.data?.detail).toMatch(/resource registration.*(pending|not finished)/i)
    }
    const groups = [leader, child!]
    await until(() => groups.every(group => liveInRecordedGroup(group).length === 0), time, 'the recorded groups to end')
    console.info(JSON.stringify({ path, bodyStarted, stopWhilePending, ended, events, remaining: groups.flatMap(liveInRecordedGroup), output }))
  } finally {
    const groups = [...new Set([leader, ...eventsIn(root).filter(e => e.what === 'child').map(e => e.pid)].filter((pid): pid is number => pid !== undefined))]
    for (const group of groups) signalGroup(group)
    const end = Date.now() + A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS
    while (groups.some(group => liveInRecordedGroup(group).length > 0) && Date.now() < end) await delay(20)
    expect(groups.flatMap(liveInRecordedGroup), 'Cleanup must reap its own fixture groups even on red.').toEqual([])
    rmSync(root, { recursive: true, force: true })
  }
}

for (const path of ['/api/records', '/api/resources']) {
  for (const bodyStarted of [path === '/api/resources']) {
    it(`${path} that never finishes ${bodyStarted ? 'its JSON body' : 'answering'} is tried again while the child keeps serving`, async ({ task }) => {
      await checkStuckWrite(path, bodyStarted, false, theTimeLeftIn(task))
    }, 60_000)
  }
}

it('stop during the pending resource POST retains the acknowledged session and its uncertainty', async ({ task }) => {
  await checkStuckWrite('/api/resources', false, true, theTimeLeftIn(task))
})
