// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A command start that throws after handing over stop exits 1, finishes its ledger session while
 * its API still answers, and leaves no children. Signal shutdown already had that stop; the
 * exception path must call the same one.
 *
 * The real command and serveDev run unchanged in a disposable checkout. A preload makes stdout
 * throw once, after the resource POST's ordinary, old-shaped answer has been read. That is after
 * hand-over and session registration, inside the awaited start. No stop wrapper replaces either
 * the command or its catch. Removing the catch's awaited stop must make this file red.
 *
 * The HTTP child and its descendant watch this test worker, never the supervisor: a parent-death
 * watch cannot conceal a missing ordinary stop. Their recorded groups are reaped even on red.
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { theTimeLeftIn } from './how-long-a-test-may-take.ts'
import {
  A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS,
  aLineThatEndsWithItsOwner,
  commandThatWatchesItsOwnerFromInside,
  liveMembersOf,
} from './the-owner-watching-gate.ts'

const REPO = join(import.meta.dirname, '..')
const FAILURE = 'Fixture: the startup output could not be written.'

interface Event {
  what: string
  pid?: number
  group?: number
  signal?: string
  method?: string
  path?: string
  body?: { dataPatch?: { state?: string }; key?: string }
}

function eventsIn(root: string): Event[] {
  const file = join(root, 'events.jsonl')
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Event) : []
}

function signalGroup(group: number, signal: NodeJS.Signals): void {
  try { process.kill(-group, signal) } catch (error) {
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

it('a startup exception after hand-over finishes the session before stopping the child group and exits 1', async ({ task }) => {
  const time = theTimeLeftIn(task)
  const root = mkdtempSync(join(tmpdir(), 'failed-dev-start-'))
  let leader: number | undefined
  let output = ''
  try {
    for (const part of ['src', 'tools']) cpSync(join(REPO, part), join(root, part), { recursive: true })
    symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
    writeFileSync(join(root, 'package.json'), '{"type":"module"}')
    // The worker entry participates in the supervisor's import walk, but this child starts only
    // the descendant below, so both processes belong to the one group serveDev recorded.
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
      const server = createServer(async (request, response) => {
        let raw = ''
        for await (const chunk of request) raw += chunk
        event({ what: 'request', method: request.method, path: request.url, body: raw ? JSON.parse(raw) : null })
        // These are the established ledger response shapes, without any new fields.
        const answer = request.url === '/api/records' ? { record: { id: 'fixture-session' } }
          : request.url === '/api/resources' ? { resource: { id: 'fixture-resource' } } : {}
        response.writeHead(200, { 'content-type': 'application/json', connection: 'close' })
        response.end(JSON.stringify(answer))
      })
      server.listen({ fd: Number(process.env.MOLE_OFFICE_LISTEN_FD) })
      process.on('SIGTERM', () => {
        event({ what: 'child-stopping' })
        server.close(() => process.exit(0))
      })
    `)
    writeFileSync(join(root, 'fail-start.mjs'), `
      import { appendFileSync } from 'node:fs'
      ${recordEvent}
      const fetchReally = globalThis.fetch
      let registered = false
      globalThis.fetch = async (...args) => {
        const answer = await fetchReally(...args)
        if (new URL(String(args[0])).pathname === '/api/resources' && args[1]?.method === 'POST' && answer.ok) {
          const read = answer.json.bind(answer)
          answer.json = async () => { const body = await read(); registered = true; return body }
        }
        return answer
      }
      const write = process.stdout.write.bind(process.stdout)
      process.stdout.write = (...args) => {
        if (registered) {
          registered = false
          event({ what: 'startup-throw' })
          throw new Error(${JSON.stringify(FAILURE)})
        }
        return write(...args)
      }
      const kill = process.kill.bind(process)
      process.kill = (pid, signal) => {
        if (pid < 0) event({ what: 'group-stop', group: -pid, signal })
        return kill(pid, signal)
      }
    `)
    const port = await aFreePort()
    const watched = commandThatWatchesItsOwnerFromInside(['--import', './fail-start.mjs', 'tools/serve-dev.mjs'])
    // An allowlist keeps the disposable command away from the real office and caller credentials.
    const command = spawn(watched.command, watched.args, {
      cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH, HOME: root,
        MOLE_OFFICE_PORT: String(port), MOLE_OFFICE_DB: join(root, 'fixture.db'),
        MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES: '0',
      },
    })
    leader = command.pid
    if (leader === undefined) throw new Error('The fixture command did not start.')
    command.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
    command.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
    const ended = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done, fail) => {
      const bound = setTimeout(() => fail(new Error(`The command did not exit:\n${output}`)), time.forAWait('the command to exit'))
      command.once('error', error => { clearTimeout(bound); fail(error) })
      command.once('exit', (code, signal) => { clearTimeout(bound); done({ code, signal }) })
    })
    const events = eventsIn(root)
    const child = events.find(event => event.what === 'child')?.pid
    const descendant = events.find(event => event.what === 'descendant')?.pid
    expect(child, output).toBeGreaterThan(0)
    expect(descendant, output).toBeGreaterThan(0)
    expect.soft(ended, output).toEqual({ code: 1, signal: null })
    expect.soft(output).toContain(FAILURE)
    expect.soft(events.filter(event => event.what === 'startup-throw')).toHaveLength(1)
    const registration = events.find(event => event.path === '/api/resources' && event.method === 'POST')
    expect.soft(registration?.body?.key).toBe(String(leader))
    const patch = events.findIndex(event => event.path === '/api/records/fixture-session' && event.method === 'PATCH' && event.body?.dataPatch?.state === 'finished')
    const stop = events.findIndex(event => event.what === 'group-stop' && event.group === child && event.signal === 'SIGTERM')
    const teardown = events.findIndex(event => event.what === 'child-stopping')
    expect.soft(patch, JSON.stringify(events)).toBeGreaterThan(-1)
    expect.soft(stop, 'Ordinary stop must signal its recorded child group.').toBeGreaterThan(patch)
    expect.soft(teardown, 'The child API must answer the finished PATCH before teardown.').toBeGreaterThan(stop)
    const groups = [leader, child!]
    const until = Date.now() + Math.min(A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS, time.forAWait('the child group to end'))
    while (groups.some(group => liveMembersOf(group).length > 0) && Date.now() < until) await delay(20)
    const remaining = groups.flatMap(liveMembersOf)
    console.info(JSON.stringify({ ended, events, remaining }))
    expect.soft(remaining, 'The supervisor and every child in its recorded group must be gone.').toEqual([])
  } finally {
    const groups = [...new Set([leader, ...eventsIn(root).filter(event => event.what === 'child').map(event => event.pid)].filter((pid): pid is number => pid !== undefined))]
    for (const group of groups) signalGroup(group, 'SIGKILL')
    const until = Date.now() + A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS
    while (groups.some(group => liveMembersOf(group).length > 0) && Date.now() < until) await delay(20)
    expect(groups.flatMap(liveMembersOf), 'Fixture cleanup must reap its own groups even on red.').toEqual([])
    rmSync(root, { recursive: true, force: true })
  }
})
