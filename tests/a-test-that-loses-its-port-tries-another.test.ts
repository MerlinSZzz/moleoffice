// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST THAT LOSES ITS PORT BETWEEN CHOOSING IT AND BINDING IT TRIES ANOTHER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `VQLi291nASe1`. `reservePort` in tests/helpers.ts holds the socket until the moment
 * before the child is spawned, which makes the window a millisecond rather than five seconds — and
 * a millisecond is not nothing. On 4 September 2026, with three suites running on this machine at
 * once, two browser test files failed in one run: *MOLE_OFFICE_PORT is 44815 and something else is
 * already listening on 127.0.0.1:44815, so this server did not start.* Both files pass alone. A
 * green build went red for a reason that had nothing to do with the code, and it happened twice in
 * one evening.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * The retry is proved against a stand-in that really holds the first port: a listening socket, and
 * an attempt that really tries to bind. Nothing here is simulated except which port the attempt is
 * given, which is the one thing a test has to control to make the race happen on purpose.
 *
 * The refusal is proved too, and it is the half that matters more: a port the ENVIRONMENT named is
 * never retried. Choosing another number for a test whose subject is that number would run it
 * against something else and report a pass.
 */

import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer as createAnHttpServer } from 'node:http'
import { createServer, type Server } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import {
  ThePortWasTaken,
  aTestDatabaseFolder,
  anApiServerOfItsOwn,
  anotherServerAnswered,
  anotherViteAnswered,
  readyOrSayThePortWentElsewhere,
  retryWhenAPortWasTaken,
  saysThePortWasTaken,
  waitForItsOwnVite,
} from './helpers.ts'
import { removeThisTestFolder } from './a-test-folder.ts'
import { aPlace, askThePlacesOffice, startAServer, stopEverything } from './terminal-holder-stand.ts'
import { databasePathFrom, portFrom } from '../src/config/settings.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Everything this file started, closed after each test whatever happened. */
const listening: Server[] = []

// The scratch servers and the folders the terminal stand made for the last describe below.
afterAll(stopEverything, 60_000)

afterEach(async () => {
  while (listening.length > 0) {
    const one = listening.pop()
    if (one === undefined) continue
    await new Promise<void>((done) => { one.close(() => { done() }) })
  }
})

/** A socket that holds a port, the way another suite's server holds one. */
function standIn(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => {
      listening.push(server)
      resolve(server)
    })
  })
}

/** A port nothing holds this instant, which is exactly as much as anybody can know. */
function aFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => { reject(new Error('the probe socket reported no port')) })
        return
      }
      const { port } = address
      probe.close(() => { resolve(port) })
    })
  })
}

/** Try to take a port, and report a failure the way a started server reports one. */
async function takeIt(port: number, ours: boolean): Promise<number> {
  try {
    await new Promise<void>((done, fail) => {
      const server = createServer()
      server.on('error', fail)
      server.listen(port, '127.0.0.1', () => {
        listening.push(server)
        done()
      })
    })
    return port
  } catch (err) {
    const said = err instanceof Error ? err.message : String(err)
    if (saysThePortWasTaken(said, port)) throw new ThePortWasTaken(port, ours, said)
    throw err
  }
}

describe('a start that loses its port to something else', () => {
  it('tries another port, and gets there on the second attempt', async () => {
    const wanted = await aFreePort()
    // THE RACE, MADE TO HAPPEN. Something else took the number between this helper choosing it and
    // the attempt binding it.
    await standIn(wanted)

    let attempts = 0
    const bound = await retryWhenAPortWasTaken('a stand-in server', async () => {
      attempts += 1
      // The first attempt is handed the port that was taken; the rest choose again, which is what
      // a fresh reservation does.
      return takeIt(attempts === 1 ? wanted : await aFreePort(), true)
    })

    expect(attempts).toBe(2)
    expect(bound).not.toBe(wanted)
  })

  it('gives up after three attempts, and says that it retried and how many times', async () => {
    let attempts = 0
    const failed = await retryWhenAPortWasTaken('a stand-in server', async () => {
      attempts += 1
      // Every attempt loses, which is a machine busy enough that no number is safe.
      throw new ThePortWasTaken(40000 + attempts, true, `listen EADDRINUSE: address already in use 127.0.0.1:${String(40000 + attempts)}`)
    }).then(
      () => null,
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    )

    expect(attempts).toBe(3)
    expect(failed).toContain('retried 2 times')
    expect(failed).toContain('3 attempts in all')
    // The ports it lost, so a reader can see it was three different numbers and not one repeated.
    expect(failed).toContain('40001, 40002, 40003')
    // AND WHY IT IS NOT THE CODE'S FAULT, said in words rather than left to be worked out.
    expect(failed).toContain('busy machine')
    expect(failed).toContain('EADDRINUSE')
  })

  it('never retries a port the environment told the test to use, and says why', async () => {
    let attempts = 0
    const failed = await retryWhenAPortWasTaken('a stand-in server', async () => {
      attempts += 1
      throw new ThePortWasTaken(39017, false, 'listen EADDRINUSE: address already in use 127.0.0.1:39017')
    }).then(
      () => null,
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    )

    // ONCE. A test that was told which port to use is a test about that port.
    expect(attempts).toBe(1)
    expect(failed).toContain('39017')
    expect(failed).toContain('Nothing was retried')
    expect(failed).toContain('the environment named it')
  })

  it('throws anything that is not a taken port straight through, unretried', async () => {
    let attempts = 0
    const failed = await retryWhenAPortWasTaken('a stand-in server', async () => {
      attempts += 1
      throw new Error('the database could not be migrated')
    }).then(
      () => null,
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    )

    // Retrying a real fault three times turns one clear failure into three slow ones.
    expect(attempts).toBe(1)
    expect(failed).toBe('the database could not be migrated')
  })

  it('reads both spellings of the failure, because two programs fail this way', () => {
    // The API server's own refusal carries Node's word.
    expect(saysThePortWasTaken('listen EADDRINUSE: address already in use 127.0.0.1:44815', 44815)).toBe(true)
    // Vite, started with --strictPort, says it in its own words and exits.
    expect(saysThePortWasTaken('Vite exited before it answered: Port 39399 is already in use', 39399)).toBe(true)
    // And nothing else is read as a taken port.
    expect(saysThePortWasTaken('the API server never answered http://127.0.0.1:44815/api/health', 44815)).toBe(false)
  })
})

/**
 * SOMETHING ELSE ANSWERS ON THE PORT BEFORE THE TEST'S SERVER HAS BOUND IT (wave 13y round 58).
 *
 * In a whole run of the suite on 21 October 2026, the chat test's API wait was answered by something
 * that had taken the port in the gap, and the test failed later, on a reply with no record in it.
 * Here the stranger answers every path with a success and an empty JSON object, and a stand-in for
 * the test's server tries to bind the same port and fails as Node does. The wait must not take the
 * stranger's answer: it must end as a taken port, which is what `retryWhenAPortWasTaken` retries.
 */
describe('a start whose port something else answers on', () => {
  it("does not take the stranger's answer for the test's own server, and ends as a taken port", async () => {
    const port = await aFreePort()
    const stranger = createAnHttpServer((_asked, answer) => {
      answer.writeHead(200, { 'content-type': 'application/json' })
      answer.end('{}')
    })
    await new Promise<void>((done) => { stranger.listen(port, '127.0.0.1', () => { done() }) })
    listening.push(stranger)

    const child = spawn(process.execPath, ['-e', [
      "require('node:net').createServer()",
      ".on('error', (err) => { console.error(err.message); setTimeout(() => process.exit(1), 100) })",
      `.listen(${String(port)}, '127.0.0.1')`,
    ].join('')], { stdio: ['ignore', 'pipe', 'pipe'] })
    const service = { label: 'a stand-in for the API server', child, log: [] as string[], stopping: false, deathReported: false }
    child.stderr.on('data', (chunk) => { service.log.push(String(chunk)) })

    const ended = await readyOrSayThePortWentElsewhere(service, `http://127.0.0.1:${String(port)}/api/health`, port, true, (res) =>
      anotherServerAnswered(res, join(ROOT, 'the-test-server-s-own.db')),
    ).then(() => 'it took the answer', (err: unknown) => err)

    expect(ended).toBeInstanceOf(ThePortWasTaken)
  })
})

/**
 * A TEST FILE THAT STARTS ITS OWN API SERVER HAS THE SAME GAP, AND THE SAME RULE (wave 13y round 59).
 *
 * Four browser test files start their own API server and Vite rather than calling `liveApp`. A fifth,
 * tests/seven-surfaces.test.ts, did too until wave 13n round F moved it onto `liveApp`. Each
 * chose its ports with a probe that let go at once, and took any success on `/api/health` as its own
 * server. A scratch that put a stranger on one file's API port in that gap made the file's wait
 * return while its own server was still loading, and the file failed on the stranger's empty answer
 * to its first write. Run alone, without the stranger, the file passed.
 */
describe('a test file that starts its own API server', () => {
  it("does not take a stranger's answer on its first port, and starts again on another", async () => {
    const dir = aTestDatabaseFolder('its-own-api-server')
    const children: ChildProcess[] = []
    const asked: { port: number; database: string }[] = []
    let strangerAnswered = 0
    try {
      const stack = await anApiServerOfItsOwn('a stand-in API server', dir, (env) => {
        const port = portFrom(env, 'MOLE_OFFICE_PORT')
        const database = databasePathFrom(env)
        asked.push({ port, database })
        // THE FIRST ATTEMPT: something else has the port and answers every path with a success, and
        // the stand-in for the test's server then fails to bind it, as the API server does. It ends a
        // second later, so the wait is answered by the stranger before it ends.
        // THE SECOND ATTEMPT: the stand-in answers health with its own database, as the API server's
        // health answer does.
        const script = asked.length === 1
          ? [
              "const port = Number(process.argv[1])",
              "require('node:http').createServer((_asked, answer) => {",
              "  console.log('the stranger answered')",
              "  answer.writeHead(200, { 'content-type': 'application/json' })",
              "  answer.end('{}')",
              "}).listen(port, '127.0.0.1', () => {",
              "  require('node:net').createServer()",
              "    .on('error', (err) => { console.error(err.message); setTimeout(() => process.exit(1), 1000) })",
              "    .listen(port, '127.0.0.1')",
              "})",
            ].join('\n')
          : [
              "require('node:http').createServer((_asked, answer) => {",
              "  answer.writeHead(200, { 'content-type': 'application/json' })",
              "  answer.end(JSON.stringify({ path: process.argv[2] }))",
              "}).listen(Number(process.argv[1]), '127.0.0.1')",
            ].join('\n')
        const child = spawn(process.execPath, ['-e', script, String(port), database], { stdio: ['ignore', 'pipe', 'pipe'] })
        children.push(child)
        const service = { label: `stand-in ${String(asked.length)}`, child, log: [] as string[] }
        child.stdout.on('data', (chunk) => { strangerAnswered += String(chunk).split('the stranger answered').length - 1 })
        child.stderr.on('data', (chunk) => { service.log.push(String(chunk)) })
        return service
      })

      // The stranger was asked, and its answer was not taken.
      expect(strangerAnswered).toBeGreaterThan(0)
      expect(asked.length).toBe(2)
      const [first, second] = asked
      expect(stack.apiPort).toBe(second?.port)
      expect(stack.apiPort).not.toBe(first?.port)
      expect(databasePathFrom(stack.env)).toBe(second?.database)
      // Each attempt had its own folder inside the test's, so the second did not open the first's database.
      expect(dirname(second?.database ?? '')).not.toBe(dirname(first?.database ?? ''))
      expect(dirname(dirname(second?.database ?? ''))).toBe(dir)
    } finally {
      for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
      removeThisTestFolder(dir)
    }
  })
})

/**
 * THE TERMINAL TESTS' SCRATCH SERVER HAS THE SAME GAP, AND THE SAME RULE (wave 13y round 60).
 *
 * Eighteen test files start a scratch API server through `startAServer` in tests/terminal-holder-stand.ts.
 * It chose a port with a probe that let go at once, and took any success on `/api/health` as its own
 * server. In a whole run of the suite on 22 October 2026, tests/the-persons-typing-is-kept-with-no-press.test.ts
 * passed its first case and failed the other five on a connection that was closed or refused. A scratch
 * that put another office on the file's port made exactly that happen: the wait took the other office's
 * answer, the first case passed against it, and the rest failed once it stopped. Run alone, the file passed.
 */
describe("the terminal tests' scratch server", () => {
  it("does not take a stranger's answer on a port it was given, and fails in the server's own words", async () => {
    const port = await aFreePort()
    const stranger = createAnHttpServer((_asked, answer) => {
      answer.writeHead(200, { 'content-type': 'application/json' })
      answer.end('{}')
    })
    await new Promise<void>((done) => { stranger.listen(port, '127.0.0.1', () => { done() }) })
    listening.push(stranger)

    // A port the caller gives is never tried again on another number, so the start must end, and in
    // the words of the server that could not bind it.
    const ended = await startAServer(aPlace('stranger'), port).then(
      (server) => `it took the answer on ${server.api}`,
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    )

    expect(ended).not.toContain('it took the answer')
    expect(ended).toContain('EADDRINUSE')
    expect(ended).toContain(`127.0.0.1:${String(port)}`)
  }, 120_000)
})

/**
 * THE RESTART TEST'S WAITS TAKE AN ANSWER ONLY FROM THE PLACE'S OWN OFFICE (wave 13y round 61).
 *
 * tests/the-restart-press-brings-back-its-own-office.test.ts starts an office on a port from a probe that let go of
 * it at once. It then waits twice for a 200 from `/api/office/restart`: once while the office starts, and once while
 * it starts again after the press. Both waits took any 200. A scratch that put a stranger on the file's port made the
 * first wait take the stranger's answer on its first ask, in both modes, and the case went on to write to the
 * stranger. So each wait asks only when `/api/health` has named the place's database first.
 */
describe("the restart test's waits", () => {
  /** An HTTP stand-in on a port of its own, answering every question with what `answers` gives. */
  async function anHttpStandIn(answers: (path: string) => unknown): Promise<{ api: string; asked: string[] }> {
    const asked: string[] = []
    const server = createAnHttpServer((question, answer) => {
      asked.push(String(question.url))
      answer.writeHead(200, { 'content-type': 'application/json' })
      answer.end(JSON.stringify(answers(String(question.url))))
    })
    await new Promise<void>((done) => { server.listen(0, '127.0.0.1', () => { done() }) })
    listening.push(server)
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('the stand-in reported no port')
    return { api: `http://127.0.0.1:${String(address.port)}`, asked }
  }
  const theRestartAnswer = (api: string) => () => fetch(`${api}/api/office/restart`).then(async (res) => (await res.json()) as unknown)

  it("never asks a stranger on the port, and takes the answer of an office on the place's database", async () => {
    const place = aPlace('ask')
    const stranger = await anHttpStandIn(() => ({ instance: 'a stranger', mode: 'checkout' }))
    expect(await askThePlacesOffice(stranger.api, place, theRestartAnswer(stranger.api))).toBeNull()
    expect(stranger.asked).not.toContain('/api/office/restart')

    const office = await anHttpStandIn((path) => (path === '/api/health' ? { path: place.database } : { instance: "the place's office", mode: 'checkout' }))
    expect(await askThePlacesOffice(office.api, place, theRestartAnswer(office.api))).toEqual({ instance: "the place's office", mode: 'checkout' })
    expect(office.asked).toEqual(['/api/health', '/api/office/restart'])
  })
})

/**
 * THE VITE OF THOSE FIVE FILES HAS THE SAME GAP, AND THE SAME RULE (wave 13y round 61).
 *
 * `anApiServerOfItsOwn` lets the web port go when it returns. Each of the five files then starts Vite on that port, and
 * waited with a copy of its own that took any success on `/` as its Vite. A scratch that put a stranger on the web port
 * of tests/overlay-host.test.ts in that gap made the wait take the stranger's page on its first ask, before Vite had
 * ended on the taken port. Every case of the file then waited 60 seconds for a page that never ran.
 */
describe("the four browser test files' Vite", () => {
  /** The path at which Vite serves `virtual:mole-office-api`, the module that tells the page its API port. */
  const THE_API_MODULE = '/@id/__x00__virtual:mole-office-api'

  /** A child process that stands in for Vite: it serves the API module naming `apiPort`, and a page on any other path. */
  function aStandInVite(port: number, apiPort: number): { label: string; child: ChildProcess; log: string[] } {
    const child = spawn(process.execPath, ['-e', [
      "require('node:http').createServer((q, a) => a.end(",
      `q.url === '${THE_API_MODULE}' ? 'export const apiPortInDevelopment = ${String(apiPort)}\\n' : '<!doctype html>'))`,
      `.listen(${String(port)}, '127.0.0.1')`,
    ].join('')], { stdio: ['ignore', 'pipe', 'pipe'] })
    const service = { label: 'a stand-in for Vite', child, log: [] as string[] }
    child.stderr.on('data', (chunk) => { service.log.push(String(chunk)) })
    return service
  }
  const started: ChildProcess[] = []
  afterEach(() => { for (const child of started.splice(0)) child.kill() })

  it("does not take a stranger's page for the file's Vite, and fails in Vite's own words", async () => {
    const port = await aFreePort()
    const asked: string[] = []
    const stranger = createAnHttpServer((question, answer) => {
      asked.push(String(question.url))
      answer.writeHead(200, { 'content-type': 'text/html' })
      answer.end('<!doctype html><title>a stranger</title>')
    })
    await new Promise<void>((done) => { stranger.listen(port, '127.0.0.1', () => { done() }) })
    listening.push(stranger)

    // Vite is started with --strictPort, so on a taken port it ends, saying so in these words.
    const child = spawn(process.execPath, ['-e', [
      "require('node:net').createServer()",
      `.on('error', () => { console.error('error when starting dev server:\\nError: Port ${String(port)} is already in use'); setTimeout(() => process.exit(1), 100) })`,
      `.listen(${String(port)}, '127.0.0.1')`,
    ].join('')], { stdio: ['ignore', 'pipe', 'pipe'] })
    started.push(child)
    const vite = { label: 'a stand-in for Vite', child, log: [] as string[] }
    child.stderr.on('data', (chunk) => { vite.log.push(String(chunk)) })

    const ended = await waitForItsOwnVite(vite, port, 4242).then(
      () => 'it took the answer',
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    )

    expect(ended).not.toBe('it took the answer')
    expect(ended).toContain(`Port ${String(port)} is already in use`)
    expect(asked.length).toBeGreaterThan(0)
  })

  it("takes a Vite that names the file's own API port, and no Vite that names another", async () => {
    const port = await aFreePort()
    const vite = aStandInVite(port, 4242)
    started.push(vite.child)

    await waitForItsOwnVite(vite, port, 4242)

    const theModule = await fetch(`http://127.0.0.1:${String(port)}${THE_API_MODULE}`)
    expect(await anotherViteAnswered(theModule, 4243)).toContain('4242')
    expect(await anotherViteAnswered(await fetch(`http://127.0.0.1:${String(port)}/`), 4242)).not.toBeNull()
  })
})
