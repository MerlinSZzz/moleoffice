// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LEDGER'S ANSWER TO "DOES A LIVE WORLD HOLD THIS?" IS ASKED AND JUDGED IN ONE PLACE.
 *
 * Two cleanups ask GET /api/resources/holding before they act: `npm run db:reset` before it deletes
 * a database, and `node tools/isolated-mole-office.mjs stop` before it frees a world's two ports and
 * deletes its copy. Each read the answer its own way until round 55, and only one of them checked
 * that the answer was about the thing it asked about. Now both go through tools/what-holds-it.mjs,
 * and that module alone decides what the ledger's answer is.
 *
 * WHAT IS PROVED:
 *   2. db:reset refuses an answer about another database, even with the word that passes a refused
 *      connection;
 *   3. a world's stop stops nothing and deletes nothing when the answer is about another database,
 *      or about other ports.
 *
 * The office is a stand-in of this file's own on a loopback port. The reset's database is an empty
 * file in a folder of this file's own. The world's two process groups are `sleep` groups this file
 * starts and stops by the group ids it recorded.
 *
 * MUTATIONS, in the commit message.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createServer as createProbe, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, expect, it } from 'vitest'
import { aGroupIsHere } from './a-group-is-here.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const work = aTestDatabaseFolder('one-ledger-reader')
const servers: Server[] = []
const groups: ChildProcess[] = []
const places: string[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
  // STOPPED BY THE GROUP IDS THIS FILE RECORDED, whether or not the tool stopped them.
  for (const child of groups.splice(0)) {
    try { process.kill(-(child.pid as number), 'SIGKILL') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }
  for (const place of places.splice(0)) rmSync(place, { recursive: true, force: true })
})

afterAll(() => rmSync(work, { recursive: true, force: true }))

/**
 * A stand-in office. Each answer is the ledger's shape, said back about `about` with the question's
 * own parts filled in where `about` leaves them out, and holding nothing.
 */
async function aStandInLedger(about: (asked: { ports: number[]; database: string | null }) => { ports: number[]; database: string | null }): Promise<string> {
  const server = createServer((req, reply) => {
    req.resume()
    const query = new URL(req.url ?? '/', 'http://stand-in').searchParams
    const asked = { ports: (query.get('ports') ?? '').split(',').filter((one) => one !== '').map(Number), database: query.get('database') }
    reply.writeHead(200, { 'content-type': 'application/json' })
    reply.end(JSON.stringify({ askedAbout: about(asked), holders: [], openButGone: [], says: 'No live ledger row holds them.' }))
  })
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

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

function run(command: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; out: string }> {
  return new Promise((done, bad) => {
    const child = spawn(command[0] as string, command.slice(1), { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (bytes) => { out += String(bytes) })
    child.stderr.on('data', (bytes) => { out += String(bytes) })
    child.on('error', bad)
    child.on('close', (code) => done({ code, out }))
  })
}

/** db:reset against an empty file, asking `api`, with the word that passes a refused connection. */
function resetWithTheWord(file: string, api: string): Promise<{ code: number | null; out: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_DB: file, MOLE_OFFICE_API: api, MOLE_OFFICE_RESET_WITHOUT_THE_LEDGER: '1' }
  delete env['MOLE_OFFICE_PORT']
  delete env['MOLE_AGENT_KEY']
  return run(['npx', 'tsx', 'scripts/reset.ts'], env)
}

/** A world on disk whose two groups are this file's sleep groups, and the stop of it, asking `api`. */
async function stopAWorld(api: string): Promise<{ code: number | null; out: string; apiPgid: number; webPgid: number; place: string }> {
  const name = `t-one-reader-${Math.random().toString(36).slice(2, 8)}`
  const place = join(REPO, '.logs', 'isolated', name)
  places.push(place)
  const where = { name, apiPort: await freePort(), webPort: await freePort(), apiPgid: aGroup(), webPgid: aGroup(),
    db: join(place, 'copy.db'), startedAt: '2026-10-15 09:00:00' }
  mkdirSync(place, { recursive: true })
  writeFileSync(join(place, 'where.json'), JSON.stringify(where))
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_WORKSPACE: 'default' }
  delete env['MOLE_OFFICE_DB']
  const out = await run([process.execPath, join(REPO, 'tools/isolated-mole-office.mjs'), 'stop', name], env)
  return { ...out, apiPgid: where.apiPgid, webPgid: where.webPgid, place }
}

it('db:reset refuses an answer about another database, even with the word', async () => {
  const file = join(work, 'asked-about.db')
  writeFileSync(file, '')
  const api = await aStandInLedger((asked) => ({ ...asked, database: join(work, 'another.db') }))

  const { code, out } = await resetWithTheWord(file, api)

  expect(code, out).toBe(1)
  expect(out).toContain('REFUSING')
  expect(out).toContain(`the office at ${api} answered with something that is not the ledger's answer about this file`)
  expect(out).not.toContain('the ledger was not asked')
  expect([existsSync(file), statSync(file).size]).toEqual([true, 0])
}, 120_000)

it.each([
  ['another database', (asked: { ports: number[]; database: string | null }) => ({ ...asked, database: '/synthetic/another/copy.db' })],
  ['other ports', (asked: { ports: number[]; database: string | null }) => ({ ...asked, ports: asked.ports.map((port) => port + 1) })],
])('a world\'s stop stops nothing and deletes nothing when the answer is about %s', async (_, about) => {
  const api = await aStandInLedger(about)

  const { code, out, apiPgid, webPgid, place } = await stopAWorld(api)

  expect(code, out).toBe(1)
  expect(out).toContain('was not stopped and nothing was deleted')
  expect(out).toContain(`the office at ${api} did not answer whether a live world holds port`)
  expect(out).toContain('It replied 200:')
  expect([aGroupIsHere(apiPgid), aGroupIsHere(webPgid), existsSync(join(place, 'where.json'))]).toEqual([true, true, true])
}, 30_000)
