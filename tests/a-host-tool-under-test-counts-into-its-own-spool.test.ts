// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HOST TOOL A TEST STARTS COUNTS INTO THE SPOOL UNDER ITS OWN HOME, AND THE REAL SPOOL IS LEFT UNTOUCHED
 * (wave 13r round AC, item 10f).
 *
 * The spool is a folder beside the sandboxes, worked out from the home (src/config/sandbox-folder.mjs), and no setting
 * names it. So a tool a test starts writes the real spool unless its home is one the test made. serve-dev and the service
 * command matter most here: the tests that start them start them as children, and a line they wrote into the real spool
 * would be counted by the office that reads it as a gate met on this machine.
 *
 * Each case starts the tool as a child from a temporary copy of this checkout, with this test file's home
 * (tests/a-test-writes-into-no-home-but-its-own.ts), and makes it meet its gate once. It asks two things: the line is in
 * the spool under that home, and the real spools gained no line for the gate while it ran. The real spools are the one
 * under the home the test run started with and the one under the home the password file names, which a tool started
 * with no HOME would take (theRealSpools). They are only read here. Before each case the spool under the test's home
 * is emptied, by emptyATestsOwnSpool, which refuses to empty a real spool.
 *
 * MUTATIONS, each planted alone after a control run:
 *   - in src/config/sandbox-folder.mjs, work out SANDBOXES_FOLDER from userInfo().homedir in place of homedir(), so a
 *     tool takes the home the password file names and not the one it was given: both cases go red, because no line
 *     is in the spool under the test's home. Where the password file names a home that can be written, the line
 *     lands in a real spool, and the second question goes red as well;
 *   - the test itself: count the spool under the test's home among the real spools: both cases go red on the real
 *     spool, which shows that question can see a line.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer as anHttpServer, type Server } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { THE_GUARD_REFUSALS_BEGIN } from '../src/config/guard-refusal.mjs'
import { commandThatStopsWithItsOwner } from './helpers.ts'
import { aStampOf, emptyATestsOwnSpool, theLengthsIn, theLinesIn, theRealSpools, theSpoolUnder, theTextAddedTo } from './the-gate-count-spool-under-a-home.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const HOME = process.env.HOME ?? ''
/** The spool a tool writes when it has this test file's home. */
const SPOOL = theSpoolUnder(HOME)
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

function aFreePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') throw new Error('No port for the case.')
      probe.close(() => done(address.port))
    })
  })
}

/** This test's environment for a child, without any MOLE_ setting, test marker or key, and with this file's home. */
function aChildsEnvironment(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('MOLE_') || name.startsWith('VITEST') || name === 'NODE_ENV') continue
    env[name] = value
  }
  return {...env, HOME, ...extra}
}

/** How long each real spool's day files are now, so the case can read only what was added while it ran. */
function theRealSpoolsNow(): Map<string, Map<string, number>> {
  return new Map(theRealSpools().map((spool) => [spool, theLengthsIn(spool)]))
}

/** The lines added to a real spool since `before` that name this gate at a time from `from` on. */
function whatTheRealSpoolsGained(before: Map<string, Map<string, number>>, gate: string, from: string): string[] {
  const gained: string[] = []
  for (const [spool, lengths] of before) {
    for (const text of theTextAddedTo(spool, lengths)) {
      let read: unknown
      try {
        read = JSON.parse(text)
      } catch {
        continue
      }
      const line = read as {gate?: unknown; at?: unknown}
      if (line.gate === gate && typeof line.at === 'string' && line.at >= from) gained.push(`${spool}: ${text}`)
    }
  }
  return gained
}

const folders: string[] = []
const groups: number[] = []
const servers: Server[] = []
beforeEach(() => {
  emptyATestsOwnSpool(SPOOL)
})
afterEach(async () => {
  for (const group of groups.splice(0)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Already gone, as a case that ended well leaves it.
    }
  }
  for (const server of servers.splice(0)) await new Promise((done) => server.close(() => done(undefined)))
  for (const folder of folders.splice(0)) rmSync(folder, {recursive: true, force: true})
})

// Mutation: SANDBOXES_FOLDER from userInfo().homedir; or count SPOOL among the real spools.
it('serve-dev, refused at its start, counts its one line under the test\'s home and none in the real spool', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-a-guarded-serve-dev-'))
  folders.push(dir)
  for (const part of ['src', 'tools', 'for-agents', 'drizzle', 'package.json', 'tsconfig.json']) {
    cpSync(join(REPO, part), join(dir, part), {recursive: true})
  }
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))
  const database = join(dir, 'office.db')
  // A stand-in server that refuses in the start guard's own words, so serve-dev stops at its first start.
  writeFileSync(join(dir, 'src/server/index.ts'), `
    // A stand-in for a test of the gate-count spool, never an office server.
    process.stderr.write('Error: ' + ${JSON.stringify(`${THE_GUARD_REFUSALS_BEGIN}USE ${database}. It is not a Mole Office database.`)} + '\\n')
    process.exit(1)
  `)
  const env = aChildsEnvironment({
    MOLE_OFFICE_PORT: String(await aFreePort()),
    MOLE_OFFICE_DB: database,
    MOLE_OFFICE_MESSAGE_WORKER: 'merges-only',
    MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES: '0',
  })
  const before = theRealSpoolsNow()
  const from = aStampOf(new Date())
  const watched = commandThatStopsWithItsOwner(process.execPath, ['tools/serve-dev.mjs'])
  const supervisor: ChildProcess = spawn(watched.command, watched.args, {cwd: dir, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env})
  let said = ''
  supervisor.stdout?.on('data', (d) => (said += String(d)))
  supervisor.stderr?.on('data', (d) => (said += String(d)))
  if (supervisor.pid === undefined) throw new Error('serve-dev was not started.')
  groups.push(supervisor.pid)
  const end = Date.now() + 90_000
  while (theLinesIn(SPOOL).length === 0 && Date.now() < end && supervisor.exitCode === null) await sleep(100)
  // Long enough for a second line, if one were written.
  await sleep(1_000)
  const exited = new Promise((done) => (supervisor.exitCode !== null ? done(undefined) : supervisor.once('exit', done)))
  process.kill(-supervisor.pid, 'SIGTERM')
  await Promise.race([exited, sleep(20_000)])
  expect(theLinesIn(SPOOL).map(({gate, position, sandbox}) => ({gate, position, sandbox})), said).toEqual([
    {gate: 'a-start-refusal-stops-the-retries', position: 'remind', sandbox: null},
  ])
  expect(whatTheRealSpoolsGained(before, 'a-start-refusal-stops-the-retries', from)).toEqual([])
}, 150_000)

// Mutation: SANDBOXES_FOLDER from userInfo().homedir; or count SPOOL among the real spools.
it('the service command, finding a stand-in at its port, counts its one line under the test\'s home and none in the real spool', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-a-guarded-service-command-'))
  folders.push(root)
  const dev = join(root, 'development')
  mkdirSync(dev)
  for (const part of ['src', 'package.json', 'tsconfig.json']) cpSync(join(REPO, part), join(dev, part), {recursive: true})
  symlinkSync(join(REPO, 'node_modules'), join(dev, 'node_modules'))
  // A development checkout is a checkout: settings refuses a folder with no .git entry.
  const made = spawnSync('git', ['init', '--quiet', dev], {encoding: 'utf8'})
  if (made.status !== 0) throw new Error(`The development checkout could not be a git checkout: ${made.stderr}`)
  const port = await aFreePort()
  writeFileSync(join(dev, '.env'), `MOLE_OFFICE_PORT=${String(port)}\nMOLE_OFFICE_DB=${join(root, 'office.db')}\nMOLE_OFFICE_STABLE_CHECKOUT=${REPO}\n`)
  // A stand-in answer on the port, as serve-dev's own stand-in sends it.
  const standIn = anHttpServer((request, reply) => {
    request.resume()
    reply.writeHead(503, {'content-type': 'application/json; charset=utf-8', 'x-mole-office-stand-in': '424244', 'retry-after': '5', connection: 'close'})
    reply.end(JSON.stringify({error: 'The dev supervisor (process 424244) holds this port, and no Mole Office server is answering on it now. Ask again in a few seconds.'}))
  })
  servers.push(standIn)
  await new Promise((done) => standIn.listen(port, '127.0.0.1', () => done(undefined)))
  const before = theRealSpoolsNow()
  const from = aStampOf(new Date())
  const ran = await new Promise<{code: number | null; out: string}>((done) => {
    const child = spawn(process.execPath, [join(dev, 'src', 'config', 'the-service-command.mjs'), 'start'], {
      cwd: dev, env: aChildsEnvironment({}), stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (d) => (out += String(d)))
    child.stderr.on('data', (d) => (out += String(d)))
    child.on('close', (code) => done({code, out}))
  })
  expect(ran.code, ran.out).toBe(11)
  expect(theLinesIn(SPOOL).map(({gate, position, sandbox}) => ({gate, position, sandbox})), ran.out).toEqual([
    {gate: 'the-office-starts-once', position: 'block', sandbox: null},
  ])
  expect(whatTheRealSpoolsGained(before, 'the-office-starts-once', from)).toEqual([])
}, 120_000)
