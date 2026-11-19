// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `npm run db:reset` ASKS THE LEDGER BEFORE IT DELETES A DATABASE.
 *
 * Its own guard counts the work in the file, and that guard is passed by a word or by a file with no
 * authored rows. Neither says whether a running server has the file open. So before it deletes a
 * file, the command asks the office whether a live world holds it, the way a world's stop asks
 * before it frees a port or a database.
 *
 * Only one failure to ask has a way on. A refused connection means nothing listens at the address,
 * which is how a server is left before its own database is reset, and a second word passes that. A
 * timeout never does: an office that hangs still holds its database and does not answer.
 *
 * The office here is a stand-in of this test's own, and every database is an empty file in a
 * folder of this test's own. The ledger rows the stand-in names are made up for the test.
 */

import { spawn } from 'node:child_process'
import { existsSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, expect, it } from 'vitest'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const work = aTestDatabaseFolder('reset-ledger')
const servers: Server[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
})

afterAll(() => rmSync(work, { recursive: true, force: true }))

/** An empty file: the count of work finds nothing in it, so only the ledger stands in the way. */
function anEmptyDatabase(name: string): string {
  const file = join(work, name)
  writeFileSync(file, '')
  return file
}

/** A stand-in office. `answer` is called for each request; null means it never answers. */
async function aStandInOffice(answer: (database: string | null) => unknown | null): Promise<string> {
  const server = createServer((req, reply) => {
    req.resume()
    const database = new URL(req.url ?? '/', 'http://stand-in').searchParams.get('database')
    const body = answer(database)
    if (body === null) return
    reply.writeHead(200, { 'content-type': 'application/json' })
    reply.end(JSON.stringify(body))
  })
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

/** An address where nothing listens: a port that was taken a moment ago and given back. */
async function anAddressNobodyListensAt(): Promise<string> {
  const closed = createServer()
  await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done))
  const address = `http://127.0.0.1:${String((closed.address() as AddressInfo).port)}`
  await new Promise<void>((done) => closed.close(() => done()))
  return address
}

function reset(file: string, api: string, env: Record<string, string> = {}): Promise<{ code: number | null; out: string }> {
  const settings: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_DB: file, MOLE_OFFICE_API: api, ...env }
  for (const key of ['MOLE_OFFICE_PORT', 'MOLE_AGENT_KEY', 'MOLE_OFFICE_RESET_WITHOUT_THE_LEDGER']) {
    if (!(key in env)) delete settings[key]
  }
  return new Promise((done, bad) => {
    const child = spawn('npx', ['tsx', 'scripts/reset.ts'], { cwd: REPO, env: settings, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (bytes) => { out += String(bytes) })
    child.stderr.on('data', (bytes) => { out += String(bytes) })
    child.on('error', bad)
    child.on('close', (code) => done({ code, out }))
  })
}

/** The file is still the empty one the test made, so nothing was deleted or seeded. */
function untouched(file: string): void {
  expect(existsSync(file)).toBe(true)
  expect(statSync(file).size).toBe(0)
}

it('refuses when the ledger says a live world holds the file, and names the row', async () => {
  const file = anEmptyDatabase('held-by-a-world.db')
  const says = `Ledger row test-row (process 4242) of the run Test world in project test-project holds the database ${file}. Process 4242 is still running.`
  const api = await aStandInOffice((database) => ({
    askedAbout: { ports: [], database },
    holders: [{ resourceId: 'test-row', workspaceId: 'test-project', sessionRecordId: 'test-run', sessionTitle: 'Test world',
      type: 'process', key: '4242', holds: [`the database ${String(database)}`], liveness: { state: 'alive', detail: 'Process 4242 is still running.' } }],
    openButGone: [],
    says,
  }))

  const { code, out } = await reset(file, api, { MOLE_OFFICE_RESET_WITHOUT_THE_LEDGER: '1' })

  expect(code, out).toBe(1)
  expect(out).toContain('REFUSING')
  expect(out).toContain(says)
  expect(out).toContain(api)
  untouched(file)
}, 120_000)

it('refuses when nothing listens at the address and no word says to go on', async () => {
  const file = anEmptyDatabase('nobody-listens.db')
  const api = await anAddressNobodyListensAt()

  const { code, out } = await reset(file, api)

  expect(code, out).toBe(1)
  expect(out).toContain('REFUSING')
  expect(out).toContain(api)
  expect(out).toContain('refused')
  // The one way on is named, so the refusal can be acted on.
  expect(out).toContain('MOLE_OFFICE_RESET_WITHOUT_THE_LEDGER=1')
  untouched(file)
}, 120_000)

it('goes on when nothing listens at the address and the word says so, and says the ledger was not asked', async () => {
  const file = anEmptyDatabase('nobody-listens-and-the-word.db')
  const api = await anAddressNobodyListensAt()

  const { code, out } = await reset(file, api, { MOLE_OFFICE_RESET_WITHOUT_THE_LEDGER: '1' })

  expect(code, out).toBe(0)
  expect(out).not.toContain('REFUSING')
  expect(out).toContain('the ledger was not asked')
  expect(out).toContain(api)
  expect(out).toContain(`reset: removed ${file}`)
  expect(statSync(file).size).toBeGreaterThan(0)
}, 300_000)

it('refuses when the office does not answer in time, even with the word', async () => {
  const file = anEmptyDatabase('the-office-hangs.db')
  const api = await aStandInOffice(() => null)

  const { code, out } = await reset(file, api, { MOLE_OFFICE_RESET_WITHOUT_THE_LEDGER: '1' })

  expect(code, out).toBe(1)
  expect(out).toContain('REFUSING')
  expect(out).toContain(api)
  expect(out).toContain('no answer within 10 s')
  expect(out).not.toContain('the ledger was not asked')
  untouched(file)
}, 120_000)
