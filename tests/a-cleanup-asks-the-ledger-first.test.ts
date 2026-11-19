// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CLEANUP ASKS THE LEDGER FIRST. "A cleanup that would remove a database or free a
 * port first asks the ledger whether a live world holds it and refuses if so; one read, a check and not a
 * hold". Scope agreed by the secretary in TCiJ91pIvvam (wave 13s, round 40).
 *
 * WHAT IS PROVED:
 *   1. GET /api/resources/holding refuses a query that names nothing, a port that is not a number and a
 *      database path that is not absolute;
 *   2. it names a live row that holds a port (a port row, or a world serving on it) and a live row whose
 *      world names the database by its path or by its identity, in any project;
 *   3. a row whose process has gone holds nothing and is named in `openButGone`; a row the machine cannot
 *      answer about is a holder; a released row is not read;
 *   4. `node tools/isolated-mole-office.mjs stop` asks the office before it stops anything, stops nothing
 *      and deletes nothing when a live world holds what it would free, when the office answers with
 *      anything but the ledger's answer, and when the office cannot be reached; it asks the office the
 *      world was written down in; and it stops the world when nothing holds them.
 *
 * Every row, process and port in 1-3 is synthetic, read through a synthetic probe. In 4 the tool is the real
 * one, the office is a stand-in on a loopback port this file opens, and the two process groups are `sleep`
 * groups this file starts and stops by the group ids it recorded.
 *
 * MUTATIONS, in the commit message.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createServer as createProbe, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { OsPort, OsProbe, OsProcess } from '../src/server/lib/resources.ts'
import type { World } from '../src/shared/runtime.ts'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { aGroupIsHere } from './a-group-is-here.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools/isolated-mole-office.mjs')
const HUMAN = { type: 'human', id: THE_PERSON } as const
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const STARTED = '2026-10-12 09:00:00'

let t: TestDb
let app: FastifyInstance
let res: typeof import('../src/server/lib/resources.ts')
let processes: Map<number, OsProcess>
let listening: OsPort[]
const scratch = mkdtempSync(join(tmpdir(), 'mole-office-cleanup-asks-'))

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  t.client.sqlite
    .prepare("INSERT INTO workspaces (id, title, created_at, updated_at) VALUES ('elsewhere', 'Elsewhere', ?, ?)")
    .run(STARTED, STARTED)
  app = (await apiApp()).app
  await app.ready()
})
afterAll(async () => {
  await app?.close()
  t?.close()
  rmSync(scratch, { recursive: true, force: true })
})

beforeEach(() => {
  processes = new Map()
  listening = []
  const probe: OsProbe = {
    platform: 'synthetic',
    processById: (pid) => processes.get(pid) ?? null,
    processesInGroup: (pgid) => [...processes.values()].filter((one) => one.pgid === pgid),
    processTable: () => ({ ok: true, processes: [...processes.values()].map((p) => ({ pid: p.pid, command: p.command, cwd: null })) }),
    pidNamespaceOf: (pid) => (processes.has(pid) ? { namespace: 'host', nspid: [pid] } : null),
    containerFirstProcess: () => ({ ok: false, reason: 'no containers in this test' }),
    containers: () => ({ available: true, containers: [] }),
    listeningPorts: () => listening,
    gpu: () => ({ available: true, processes: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999999,
    killProcessGroup: () => { throw new Error('a read must never signal') },
    stopContainer: () => { throw new Error('a read must never stop a container') },
  }
  res.useOsProbe(probe)
})
afterEach(() => {
  res.useOsProbe(res.LINUX_PROBE)
  t.client.sqlite.prepare('DELETE FROM session_resources').run()
})

function aRun(workspaceId = 'default'): string {
  return t.api.createRecord({ workspaceId, kind: 'session', title: 'Synthetic cleanup run',
    data: { state: 'running', servingAgent: 'cleanup-worker' }, actor: HUMAN }).id
}
function aProcess(pid: number, command: string): void {
  processes.set(pid, { pid, pgid: pid, ppid: 1, command, startedAt: STARTED })
}
function aWorld(over: Partial<World>): World {
  return { repository: '/synthetic/checkout', database: null, databaseIdentity: null, port: null, head: null,
    standing: { kind: 'scratch', because: ['a synthetic world'] }, readAt: STARTED, saidBy: 'this test', ...over }
}
/** A process row, with a world when one is given, for a synthetic process that is running. */
function aWorldRow(pid: number, world: World | undefined, workspaceId = 'default'): string {
  aProcess(pid, 'node src/server/index.ts')
  return res.registerResource({ workspaceId, sessionRecordId: aRun(workspaceId), type: 'process', key: String(pid),
    ...(world === undefined ? {} : { world }), actor: HUMAN }).id
}
async function holding(query: string): Promise<{ status: number; body: Record<string, unknown> & { holders: { resourceId: string; holds: string[]; workspaceId: string }[]; openButGone: { resourceId: string }[]; says: string } }> {
  const reply = await app.inject({ method: 'GET', url: `/api/resources/holding?${query}`, headers })
  return { status: reply.statusCode, body: reply.json() }
}

describe('GET /api/resources/holding', () => {
  it.each([
    ['', 'Name what the cleanup would free or remove'],
    ['ports=5173,abc', 'ports is port numbers separated by commas'],
    ['database=data/mole-office.db', 'database is the absolute path of a database file'],
  ])('refuses the query "%s" and says what it needs', async (query, said) => {
    const reply = await app.inject({ method: 'GET', url: `/api/resources/holding${query === '' ? '' : `?${query}`}`, headers })
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.body).toContain(said)
  })

  it('names a live port row that holds the port', async () => {
    aProcess(61, 'node vite --strictPort')
    listening = [{ port: 40001, address: '127.0.0.1', protocol: 'tcp', pid: 61 }]
    const id = res.registerResource({ workspaceId: 'default', sessionRecordId: aRun(), type: 'port', key: '40001', actor: HUMAN }).id
    const { status, body } = await holding('ports=40001,40002')
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.holders.map((one) => [one.resourceId, one.holds])).toEqual([[id, ['port 40001']]])
    expect(body.says).toContain(`Ledger row ${id} (port 40001) of the run Synthetic cleanup run in project default holds port 40001.`)
  })

  it('names a live row whose world serves on the port, in another project', async () => {
    const id = aWorldRow(71, aWorld({ port: 40011 }), 'elsewhere')
    const { body } = await holding('ports=40011')
    expect(body.holders.map((one) => [one.resourceId, one.workspaceId, one.holds])).toEqual([[id, 'elsewhere', ['port 40011']]])
  })

  it('names a live row whose world names the database by its path', async () => {
    const id = aWorldRow(72, aWorld({ database: '/synthetic/other/mole-office.db' }))
    const { body } = await holding(`database=${encodeURIComponent('/synthetic/other/mole-office.db')}`)
    expect(body.holders.map((one) => [one.resourceId, one.holds])).toEqual([[id, ['the database /synthetic/other/mole-office.db']]])
  })

  it('names a live row whose world carries only the database identity, as one read off a header does', async () => {
    const file = join(scratch, 'identity.db')
    writeFileSync(file, 'a synthetic database file')
    const identity = databaseIdentity(file).id
    expect(identity).toMatch(/^[0-9a-f]{16}$/)
    const id = aWorldRow(73, aWorld({ databaseIdentity: identity }))
    const { body } = await holding(`database=${encodeURIComponent(file)}`)
    expect(body.holders.map((one) => one.resourceId)).toEqual([id])
  })

  it('names a row whose process has gone in openButGone, as holding nothing', async () => {
    const id = aWorldRow(74, aWorld({ port: 40021 }))
    processes.delete(74)
    const { body } = await holding('ports=40021')
    expect(body.holders).toEqual([])
    expect(body.openButGone.map((one) => one.resourceId)).toEqual([id])
    expect(body.says).toBe('No live ledger row holds port 40021. 1 open row names one of them, but the process each is about has gone.')
  })

  it('counts a row the machine cannot answer about as a holder', async () => {
    listening = [{ port: 40031, address: '127.0.0.1', protocol: 'tcp', pid: null }]
    const id = res.registerResource({ workspaceId: 'default', sessionRecordId: aRun(), type: 'port', key: '40031', actor: HUMAN }).id
    const { body } = await holding('ports=40031')
    expect(body.holders.map((one) => one.resourceId)).toEqual([id])
    expect(body.says).toContain('The machine could not say whether it is still there: Port 40031 is held')
  })

  it('does not read a released row', async () => {
    const id = aWorldRow(75, aWorld({ port: 40041 }))
    t.client.sqlite.prepare("UPDATE session_resources SET released_at = ?, released_by = 'this test' WHERE id = ?").run(STARTED, id)
    const { body } = await holding('ports=40041')
    expect([body.holders, body.openButGone]).toEqual([[], []])
  })

})

// ------------------------------------------------------------------------------------------------- the tool

/** A stand-in office: it answers the holding door as `mode` says, and records every address asked. */
let office: Server
let officeApi: string
let mode: 'nothing' | 'holds' | 'no-such-door'
let asked: string[]
let groups: ChildProcess[]
let name: string
let place: string

function freePort(): Promise<number> {
  return new Promise((ok, bad) => {
    const probe = createProbe()
    probe.on('error', bad)
    probe.listen(0, '127.0.0.1', () => {
      const port = (probe.address() as AddressInfo).port
      probe.close(() => ok(port))
    })
  })
}
function aGroup(): number {
  const child = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' })
  groups.push(child)
  return child.pid as number
}
async function aWorldOnDisk(extra: Record<string, unknown> = {}): Promise<{ apiPgid: number; webPgid: number }> {
  const where = { name, apiPort: await freePort(), webPort: await freePort(), apiPgid: aGroup(), webPgid: aGroup(),
    db: join(place, 'copy.db'), startedAt: STARTED, ...extra }
  mkdirSync(place, { recursive: true })
  writeFileSync(join(place, 'where.json'), JSON.stringify(where))
  return { apiPgid: where.apiPgid, webPgid: where.webPgid }
}
function stop(api = officeApi): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((done, bad) => {
    const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_WORKSPACE: 'default' }
    delete env['MOLE_OFFICE_DB']
    const child = spawn(process.execPath, [TOOL, 'stop', name], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (bytes) => { stdout += String(bytes) })
    child.stderr.on('data', (bytes) => { stderr += String(bytes) })
    child.on('error', bad)
    child.on('close', (status) => done({ status, stdout, stderr }))
  })
}

describe('tools/isolated-mole-office.mjs stop asks the ledger before it stops a world', () => {
  beforeAll(async () => {
    office = createServer((req, reply) => {
      req.resume()
      asked.push(req.url ?? '')
      reply.setHeader('content-type', 'application/json')
      // THE QUESTION IS SAID BACK, as the real door says it back: an answer about other ports or another
      // database is not the ledger's answer about this world.
      const query = new URL(req.url ?? '/', 'http://stand-in').searchParams
      const askedAbout = { ports: (query.get('ports') ?? '').split(',').filter((one) => one !== '').map(Number), database: query.get('database') }
      if (mode === 'no-such-door' || req.url?.startsWith('/api/resources/holding?') !== true) {
        reply.statusCode = 404
        reply.end(JSON.stringify({ error: 'Route GET:' + String(req.url) + ' not found' }))
      } else if (mode === 'holds') {
        reply.end(JSON.stringify({ askedAbout, holders: [{ resourceId: 'synthetic-holder' }], openButGone: [],
          says: 'Ledger row synthetic-holder (process 4242) of the run Synthetic other run in project default holds port 1.' }))
      } else {
        reply.end(JSON.stringify({ askedAbout, holders: [], openButGone: [], says: 'No live ledger row holds them.' }))
      }
    })
    await new Promise<void>((ok) => office.listen(0, '127.0.0.1', ok))
    officeApi = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
  })
  afterAll(async () => { await new Promise<void>((ok) => office.close(() => ok())) })
  beforeEach(() => {
    asked = []
    groups = []
    name = `t-ledger-${Math.random().toString(36).slice(2, 8)}`
    place = join(REPO, '.logs', 'isolated', name)
  })
  afterEach(() => {
    // STOPPED BY THE GROUP IDS THIS FILE RECORDED, whether or not the tool stopped them.
    for (const child of groups) {
      try { process.kill(-(child.pid as number), 'SIGKILL') } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
    rmSync(place, { recursive: true, force: true })
  })

  it('stops nothing and deletes nothing when a live world holds what it would free', async () => {
    mode = 'holds'
    const { apiPgid, webPgid } = await aWorldOnDisk()
    const out = await stop()
    expect(out.status, out.stdout + out.stderr).toBe(1)
    expect(out.stderr).toContain(`"${name}" was not stopped and nothing was deleted: the ledger says a live world holds what stopping it would free. Ledger row synthetic-holder`)
    expect([aGroupIsHere(apiPgid), aGroupIsHere(webPgid), existsSync(join(place, 'where.json'))]).toEqual([true, true, true])
    expect(asked).toHaveLength(1)
    const query = new URL(asked[0] as string, officeApi).searchParams
    expect(query.get('database')).toBe(join(place, 'copy.db'))
    expect(query.get('ports')?.split(',')).toHaveLength(2)
  }, 30_000)

  it('asks the office the world was written down in, not the one in the environment', async () => {
    mode = 'holds'
    await aWorldOnDisk({ registeredWith: officeApi })
    const out = await stop(`http://127.0.0.1:${String(await freePort())}`)
    expect(out.status, out.stdout + out.stderr).toBe(1)
    expect(out.stderr).toContain('the ledger says a live world holds what stopping it would free')
    expect(asked).toHaveLength(1)
  }, 30_000)

  it('stops nothing when the office does not give the ledger\'s answer', async () => {
    mode = 'no-such-door'
    const { apiPgid } = await aWorldOnDisk()
    const out = await stop()
    expect(out.status, out.stdout + out.stderr).toBe(1)
    expect(out.stderr).toContain(`the office at ${officeApi} did not answer whether a live world holds port`)
    expect(out.stderr).toContain('It replied 404: Route GET:/api/resources/holding?')
    expect([aGroupIsHere(apiPgid), existsSync(place)]).toEqual([true, true])
  }, 30_000)

  it('stops nothing when the office cannot be reached', async () => {
    mode = 'nothing'
    const nobody = `http://127.0.0.1:${String(await freePort())}`
    const { apiPgid } = await aWorldOnDisk()
    const out = await stop(nobody)
    expect(out.status, out.stdout + out.stderr).toBe(1)
    expect(out.stderr).toContain(`the office at ${nobody} could not be asked whether a live world holds port`)
    expect([aGroupIsHere(apiPgid), existsSync(place)]).toEqual([true, true])
  }, 30_000)

  it('stops the world and deletes its place when nothing holds what it would free', async () => {
    mode = 'nothing'
    const { apiPgid, webPgid } = await aWorldOnDisk()
    const out = await stop()
    expect(out.status, out.stdout + out.stderr).toBe(0)
    expect(out.stdout).toContain(`"${name}" is stopped, both ports came back, and its copy is deleted.`)
    expect([aGroupIsHere(apiPgid), aGroupIsHere(webPgid), existsSync(place)]).toEqual([false, false, false])
    expect(asked).toHaveLength(1)
  }, 30_000)
})
