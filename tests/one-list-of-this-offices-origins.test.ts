// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE LIST OF THIS OFFICE'S OWN ORIGINS, AND AN ORIGIN THAT IS NOT ONE OF THEM IS REFUSED (wave 13s, line 13s, SEC-2).
 *
 * A browser sends an Origin header to say where the page that made a request was served. The office answers a page on
 * one of its own origins with that origin and with leave to send its cookie. Until SEC-2 it took, beside the origins it
 * declares, a page on 127.0.0.1 or localhost with any port at all, and it still served a request from an origin it did
 * not take: only the browser hid the answer from the page. Now the names an Origin may have are the names the Host
 * check takes, one list for both, and a request whose Origin is not one of this office's is refused before any door.
 *
 * Items 5 and 6 of SEC-2's design say so. Item 6: one list of the office's own origins serves the Host check and the
 * own-origin list. Item 5: a request with no Origin is not a request from a foreign page and goes on as today, and an
 * Origin of null is never taken as missing. The starter's decision on the names keeps one door apart: a plugin page's
 * own files are answered to an Origin of null, because a plugin page runs in a sandboxed frame, whose origin is null.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. an Origin on each name the Host check takes, with the port the listener takes it with, is answered with that
 *      origin and leave to send a cookie, and an Origin on a name the Host check refuses is refused;
 *   2. the same holds for this machine's short tailnet name;
 *   3. the dev server's origin is taken while the office is not built for production, and refused when it is;
 *   4. a loopback name on a port that is no listener's is refused;
 *   5. an Origin of null on a write is refused in English and in Chinese, writes nothing, and writes one line in the
 *      server's log that names the kind of the Origin;
 *   6. a foreign Origin is refused on a read, a write and a preflight, writes nothing, and the log line never holds it;
 *   7. a request with no Origin is answered as before, a read and a write with a key alike;
 *   8. a plugin page's own files are answered to an Origin of null as before, to any origin and with no cookie, and
 *      another door refuses an Origin of null.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THIS FILE STANDS IN FOR THE NETWORK
 * ---------------------------------------------------------------------------------------
 *
 * As tests/a-request-that-names-another-host-is-refused.test.ts does. The three listeners are the product's own: the
 * app's own server on 127.0.0.1, the door for other machines on 127.0.0.2, and the second listener on 127.0.0.1. Every
 * request goes over a real socket, because the Host check and the stamp of who asked read the listener, and an injected
 * request is on none. The probe's list of this machine's own addresses names THE_NUMBER, and its read of this machine's
 * tailnet name answers from a status text written here, so this machine's own tailscale is never asked. Names are looked
 * up by THE_RESOLVER, never on the network. Every name and number is made up, in the ranges kept for documentation.
 *
 * A request that a case means to be taken names, as its Host, the same name and port as its Origin: that is what a
 * browser sends to the page's own origin. A request that a case means to be refused for its Origin names the listener's
 * own loopback Host, so that the Host check takes it and only the Origin is in question.
 *
 * The server's logger writes into THE_LOG, which is how cases 5 and 6 read the line a refusal writes. Case 6 writes a
 * world of kind home for this database while it runs, so that this database is the office and writes the office's line,
 * and removes it after.
 */

import { request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { settings } from '../src/config/settings.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import type { OsProbe } from '../src/server/lib/resources.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

/** The door for other machines is bound to a second loopback address, as the other tests of that door are. */
const THE_DOORS_ADDRESS = '127.0.0.2'
/** This machine's own number, as the probe names it here: an address from the range kept for documentation. */
const THE_NUMBER = '198.51.100.8'
/** The name the person chooses as the address for browsers. */
const THE_NAME = 'the-office.example'
/** A name in the shape a private network gives a machine. It stands for this machine, and nobody chose it. */
const A_PRIVATE_NETWORK_NAME = 'the-office.a-private-network.example'
/** The name the setting for other machines holds, in the cases that set it. */
const THE_SETTINGS_NAME = 'the-office-by-its-setting.example'
/** The setting for other machines, by its name in src/config/settings.mjs. */
const THE_SETTING = 'MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES'
/** This machine's own tailnet name, as the probe reads it here: a made-up name in a domain kept for documentation. */
const THE_TAILNET_NAME = 'this-machine.a-tailnet.example'
/** This machine's short tailnet name: the first label of the full one. */
const THE_SHORT_TAILNET_NAME = THE_TAILNET_NAME.split('.')[0]!
/** A page on another site. */
const A_FOREIGN_NAME = 'evil.example'
/** A number that is not this machine's, from the range kept for documentation. */
const A_FOREIGN_NUMBER = '203.0.113.9'

/** The status text tailscale writes, cut to what the read uses. Its DNSName ends with a dot, as tailscale writes it. */
function aStatusNaming(name: string): string {
  return JSON.stringify({ BackendState: 'Running', Self: { HostName: 'this-machine', DNSName: `${name}.` } })
}

/** What a name stands for here, in place of the network. */
async function THE_RESOLVER(name: string): Promise<readonly string[]> {
  if (name === THE_NAME || name === A_PRIVATE_NETWORK_NAME || name === THE_SETTINGS_NAME) return [THE_NUMBER]
  throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${name}`), { code: 'ENOTFOUND' })
}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Under an agent's name, as the Host check's test asks: where the page was is the question, not who asked. */
const A_CALLER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-synthetic-caller',
}

/** The refusal's code. */
const THE_CODE = 'originIsNotThisOffice'

/** A record a page might try to write. */
const A_RECORD = JSON.stringify({ kind: 'note', title: 'A note a page wrote', data: { body: 'Made up by a test.' } })

/** The plugin whose files case 8 reads: made up, written into this file's own plugins folder. */
const THE_PLUGIN = 'made-up-clock'

type Listener = 'the loopback listener' | 'the door for other machines' | 'the second listener'
const EVERY_LISTENER: readonly Listener[] = ['the loopback listener', 'the door for other machines', 'the second listener']

/** Every line the server's logger writes, whole, as pino writes it: one JSON object a line. */
class TheServersLog {
  readonly lines: string[] = []
  private waiting = ''

  write(chunk: string): void {
    this.waiting += chunk
    let end = this.waiting.indexOf('\n')
    while (end !== -1) {
      const line = this.waiting.slice(0, end)
      this.waiting = this.waiting.slice(end + 1)
      if (line.trim() !== '') this.lines.push(line)
      end = this.waiting.indexOf('\n')
    }
  }

  clear(): void {
    this.lines.length = 0
    this.waiting = ''
  }
}
const THE_LOG = new TheServersLog()

/** The words of a line pino wrote: its `msg`. */
function theWordsOf(line: string): string {
  const parsed = JSON.parse(line) as { msg?: unknown }
  return typeof parsed.msg === 'string' ? parsed.msg : ''
}

/** Give the log a moment to finish before its lines are read. */
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 20))

const plugins = aTestDatabaseFolder('origin-plugins')
const PLUGINS_BEFORE = process.env['MOLE_OFFICE_PLUGINS']

let t: TestDb | undefined
let app: FastifyInstance | undefined
let door: Server | undefined
let second: Server | undefined
let resources: typeof import('../src/server/lib/resources.ts') | undefined
let words: typeof import('../src/shared/i18n.ts') | undefined
let hostCheck: typeof import('../src/server/lib/a-host-that-is-not-this-office.ts') | undefined

function theApp(): FastifyInstance {
  if (app === undefined) throw new Error('the app was not started, so there is nothing to ask')
  return app
}

/** The origin check, imported when a case reads its log line. It is new with SEC-2. */
async function theOriginCheck(): Promise<typeof import('../src/server/lib/an-origin-that-is-not-this-office.ts')> {
  return import('../src/server/lib/an-origin-that-is-not-this-office.ts')
}

/** The address a listener's socket is bound to, which is where a request to it connects. */
function theAddressOf(listener: Listener): string {
  return listener === 'the door for other machines' ? THE_DOORS_ADDRESS : '127.0.0.1'
}

/** The port of a listener's socket: the port a request to it comes in on. */
function thePortOf(listener: Listener): number {
  const server = listener === 'the loopback listener' ? theApp().server : listener === 'the door for other machines' ? door : second
  if (server === undefined) throw new Error(`${listener} was not opened, so there is nothing to ask`)
  return (server.address() as AddressInfo).port
}

/** The Host a listener takes for itself: 127.0.0.1 with its own port. */
function itsOwnHost(listener: Listener): string {
  return `127.0.0.1:${String(thePortOf(listener))}`
}

/**
 * A port that no listener here has, and that the settings name neither as the API's nor as the dev server's, so no
 * rule of the office could take it.
 */
function aPortThatIsNobodys(): number {
  const taken = new Set([...EVERY_LISTENER.map(thePortOf), settings().apiPort, settings().webPort])
  let port = 20_000
  while (taken.has(port)) port += 1
  return port
}

/** Replace the read of this machine's tailnet name and the list of its own addresses; the rest is the real probe. */
function theMachineHas(addresses: readonly string[], status: string | null = null): void {
  if (resources === undefined) throw new Error('the operating system layer was not loaded')
  const layer = resources
  const probe = Object.create(layer.LINUX_PROBE) as OsProbe
  probe.ownAddresses = () => addresses
  probe.ownTailnetName = () => Promise.resolve(status === null ? null : layer.ownTailnetNameIn(status))
  layer.useOsProbe(probe)
}

/** One read of this machine's tailnet name, by the Host check's own read, through a probe that names THE_TAILNET_NAME. */
async function readTheTailnetName(): Promise<void> {
  if (hostCheck === undefined) throw new Error('the Host check was not loaded')
  theMachineHas([THE_NUMBER], aStatusNaming(THE_TAILNET_NAME))
  const said: string[] = []
  await hostCheck.readThisMachinesTailnetName((line) => said.push(line))
  expect(said, 'the read of the tailnet name said it failed').toEqual([])
}

async function choose(address: string | null): Promise<void> {
  const reply = await theApp().inject({ method: 'POST', url: '/api/office/address-for-browsers', headers: AS_THE_PERSON, payload: { address } })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
}

/** Run `run` while the setting for other machines names THE_SETTINGS_NAME, and put the setting back after. */
async function whileTheSettingNamesIt(run: () => Promise<void>): Promise<void> {
  const was = process.env[THE_SETTING]
  process.env[THE_SETTING] = THE_SETTINGS_NAME
  try {
    await run()
  } finally {
    if (was === undefined) delete process.env[THE_SETTING]
    else process.env[THE_SETTING] = was
  }
}

interface Answer {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
  json: Record<string, unknown> | undefined
}

/** One request through a listener over a real socket, with the Host and the Origin it names. */
function ask(input: {
  through: Listener
  host?: string
  origin?: string
  path?: string
  method?: 'GET' | 'HEAD' | 'POST' | 'OPTIONS'
  headers?: Record<string, string>
  body?: string
  port?: number
  /** Who the request names, A_CALLER unless the case says; a sandboxed frame names nobody. */
  caller?: Record<string, string>
}): Promise<Answer> {
  return new Promise((done, fail) => {
    const req = request(
      {
        host: theAddressOf(input.through),
        port: input.port ?? thePortOf(input.through),
        path: input.path ?? '/api/access',
        method: input.method ?? 'GET',
        headers: {
          ...(input.caller ?? A_CALLER),
          ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(input.origin === undefined ? {} : { origin: input.origin }),
          ...input.headers,
          host: input.host ?? itsOwnHost(input.through),
        },
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => { body += chunk })
        res.once('end', () => {
          done({ status: res.statusCode ?? 0, headers: res.headers, body, json: parsed(body) })
        })
      },
    )
    req.once('error', fail)
    req.end(input.body)
  })
}

function parsed(body: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(body)
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/** The answer is taken for this origin: the reply names it, with leave to send a cookie, and the door answered. */
function expectTaken(answer: Answer, origin: string, what: string): void {
  expect(answer.status, `${what}: ${answer.body.slice(0, 300)}`).toBe(200)
  expect(answer.json?.['code'], what).toBeUndefined()
  expect(answer.headers['access-control-allow-origin'], what).toBe(origin)
  expect(answer.headers['access-control-allow-credentials'], what).toBe('true')
}

/** The values the refusal carries, as an object of words, or none. */
function theValuesOf(answer: Answer): Record<string, string | number> {
  const values = answer.json?.['values']
  return values !== null && typeof values === 'object' ? values as Record<string, string | number> : {}
}

/** The refusal's English, read from the words file the page reads it from. */
function theEnglish(answer: Answer): string {
  if (words === undefined) throw new Error('the words were not loaded')
  return words.createI18n('en').t('server.originIsNotThisOffice', theValuesOf(answer))
}

/** The answer is the coded refusal of an Origin that is not this office's, in its English, with no CORS answer. */
function expectRefused(answer: Answer, what: string): void {
  expect(answer.status, `${what}: ${answer.body.slice(0, 300)}`).toBe(403)
  expect(answer.json?.['code'], what).toBe(THE_CODE)
  expect(answer.json?.['error'], what).toBe(theEnglish(answer))
  expect(answer.headers['access-control-allow-origin'], what).toBeUndefined()
  expect(answer.headers['access-control-allow-credentials'], what).toBeUndefined()
  expect(answer.headers['set-cookie'], what).toBeUndefined()
}

function count(table: 'records' | 'changes'): number {
  return (t?.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
}

function counted(): { records: number; changes: number } {
  return { records: count('records'), changes: count('changes') }
}

/** Every line a refusal of an Origin can write, so a case can find the one it wrote among the others. */
async function everyRefusalsLine(): Promise<Set<string>> {
  const check = await theOriginCheck()
  return new Set(check.EVERY_KIND_OF_ORIGIN.map((kind) => check.aRefusalsLogLine(kind)))
}

/** The refusal lines the log holds, by their words, after the requests a case made since it cleared the log. */
async function theRefusalLines(): Promise<string[]> {
  await settle()
  const lines = await everyRefusalsLine()
  return THE_LOG.lines.filter((line) => lines.has(theWordsOf(line)))
}

/** Put a made-up plugin with a page and a script into this file's plugins folder. */
function putThePlugin(): void {
  const dist = join(plugins, THE_PLUGIN, 'dist')
  mkdirSync(join(dist, 'assets'), { recursive: true })
  writeFileSync(join(plugins, THE_PLUGIN, 'plugin.json'), JSON.stringify({
    id: THE_PLUGIN,
    name: { en: 'Made-up clock' },
    version: '0.1.0',
    interface: 'office-read/1',
    pages: [{ slug: 'main', title: { en: 'Main' } }],
    reads: ['projects'],
    budget: { builtKilobytes: 20 },
  }))
  writeFileSync(join(dist, 'main.html'), '<!doctype html><title>Made-up clock</title><p>made-up clock page</p>')
  writeFileSync(join(dist, 'assets', 'app.js'), 'window.parent.postMessage({}, "*")')
}

beforeAll(async () => {
  process.env['MOLE_OFFICE_PLUGINS'] = plugins
  putThePlugin()
  t = await freshDb()
  resources = await import('../src/server/lib/resources.ts')
  words = await import('../src/shared/i18n.ts')
  hostCheck = await import('../src/server/lib/a-host-that-is-not-this-office.ts')
  const { useANameResolver } = await import('../src/server/lib/address-for-browsers.ts')
  useANameResolver(THE_RESOLVER)
  theMachineHas([THE_NUMBER])
  // THE APP AS tests/helpers.ts BUILDS IT, not for production, with the logger on and writing into THE_LOG.
  const { buildApp, serveTheAddressForOtherMachines, listenForOtherMachines } = await import('../src/server/index.ts')
  app = (await buildApp({
    production: false,
    webDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    webAppUrl: settings().webAddress,
    logLevel: 'info',
    logStream: THE_LOG,
  })).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = await serveTheAddressForOtherMachines(app, 0, THE_DOORS_ADDRESS)
  second = await listenForOtherMachines(app, 0, '127.0.0.1')
  const switched = await app.inject({ method: 'POST', url: `/api/plugins/${THE_PLUGIN}/switch`, headers: AS_THE_PERSON, payload: { on: true } })
  expect(switched.statusCode, switched.body.slice(0, 300)).toBe(200)
}, 120_000)

afterEach(async () => {
  if (resources !== undefined) theMachineHas([THE_NUMBER])
  if (app !== undefined) await choose(null)
})

afterAll(async () => {
  resources?.useOsProbe(resources.LINUX_PROBE)
  const { useANameResolver } = await import('../src/server/lib/address-for-browsers.ts')
  useANameResolver(null)
  for (const server of [door, second]) if (server !== undefined) await new Promise<void>((done) => server.close(() => done()))
  if (app !== undefined) await app.close()
  t?.close()
  if (PLUGINS_BEFORE === undefined) delete process.env['MOLE_OFFICE_PLUGINS']
  else process.env['MOLE_OFFICE_PLUGINS'] = PLUGINS_BEFORE
  rmSync(plugins, { recursive: true, force: true })
})

describe('the origins a page of this office may be on are the names the Host check takes', () => {
  it('1: answers an Origin on each name the Host check takes, with leave to send a cookie, and refuses one on a name it refuses', async () => {
    // Item 6 of SEC-2's design: one list serves the Host check and the own-origin list. So every name the Host check
    // already holds is held here, with the port its listener takes it with, and no name is held twice.
    await readTheTailnetName()
    await choose(THE_NAME)
    await whileTheSettingNamesIt(async () => {
      const port = (listener: Listener): string => String(thePortOf(listener))
      const taken: { through: Listener; host: string; origin: string }[] = []
      for (const listener of EVERY_LISTENER) {
        for (const name of ['127.0.0.1', 'localhost', '[::1]']) {
          taken.push({ through: listener, host: `${name}:${port(listener)}`, origin: `http://${name}:${port(listener)}` })
        }
      }
      // The door for other machines: the number it is bound to, this machine's number, the address for browsers in
      // force, the setting's host and this machine's tailnet name, each with the door's own port.
      for (const name of [THE_DOORS_ADDRESS, THE_NUMBER, THE_NAME, THE_SETTINGS_NAME, THE_TAILNET_NAME]) {
        const host = `${name}:${port('the door for other machines')}`
        taken.push({ through: 'the door for other machines', host, origin: `http://${host}` })
      }
      // The second listener: a proxy on this computer carries a page served over https to it, with no port.
      for (const name of [THE_NUMBER, THE_NAME, THE_SETTINGS_NAME, THE_TAILNET_NAME]) {
        taken.push({ through: 'the second listener', host: name, origin: `https://${name}` })
      }
      for (const one of taken) {
        expectTaken(await ask(one), one.origin, `Origin ${one.origin} on ${one.through}`)
      }

      // Names the Host check refuses on every listener: another site, a number that is not this machine's, a name
      // nobody chose, and a held name on a port that is no listener's.
      const nobodys = String(aPortThatIsNobodys())
      const doorsPort = port('the door for other machines')
      const refused: { through: Listener; origin: string }[] = [
        { through: 'the door for other machines', origin: `http://${A_FOREIGN_NAME}:${doorsPort}` },
        { through: 'the door for other machines', origin: `http://${A_FOREIGN_NUMBER}:${doorsPort}` },
        { through: 'the door for other machines', origin: `http://${A_PRIVATE_NETWORK_NAME}:${doorsPort}` },
        { through: 'the door for other machines', origin: `http://${THE_NAME}:${nobodys}` },
        { through: 'the door for other machines', origin: `http://${THE_TAILNET_NAME}:${nobodys}` },
        { through: 'the second listener', origin: `https://${A_FOREIGN_NAME}` },
        { through: 'the second listener', origin: `https://${A_PRIVATE_NETWORK_NAME}` },
        { through: 'the loopback listener', origin: `http://${A_FOREIGN_NAME}:${port('the loopback listener')}` },
      ]
      for (const one of refused) {
        expectRefused(await ask(one), `Origin ${one.origin} on ${one.through}`)
      }
    })
  })

  it('2: answers an Origin on this machine\'s short tailnet name, where the Host check takes it', async () => {
    // THE SHORT NAME IS THE FIRST LABEL OF THE FULL ONE, and the Host check takes it where it takes the full name: at
    // the door for other machines with the door's port, and at the second listener with no port. The Host check
    // learns the short name in a change that this branch's base does not hold yet. Until that change is joined here,
    // this case is red: the Host check refuses the short name before the Origin is read.
    await readTheTailnetName()
    const doorsHost = `${THE_SHORT_TAILNET_NAME}:${String(thePortOf('the door for other machines'))}`
    expectTaken(
      await ask({ through: 'the door for other machines', host: doorsHost, origin: `http://${doorsHost}` }),
      `http://${doorsHost}`,
      `Origin http://${doorsHost} on the door for other machines`,
    )
    expectTaken(
      await ask({ through: 'the second listener', host: THE_SHORT_TAILNET_NAME, origin: `https://${THE_SHORT_TAILNET_NAME}` }),
      `https://${THE_SHORT_TAILNET_NAME}`,
      `Origin https://${THE_SHORT_TAILNET_NAME} on the second listener`,
    )
  })

  it('3: takes the dev server\'s origin while the office is not built for production, and refuses it when it is', async () => {
    // Item 10 of the starter's decision that set out SEC-1 and SEC-2: under `npm run dev` the page is on the dev server's port and calls the API on its own, so
    // the dev server's origin is the office's own there. A built office serves its page itself, and no dev server is
    // there to be the page's origin.
    const devServer = [`http://127.0.0.1:${String(settings().webPort)}`, `http://localhost:${String(settings().webPort)}`]
    expect(settings().webPort, 'the dev server\'s port is a listener\'s here, so this case would prove nothing').not.toBe(
      thePortOf('the loopback listener'),
    )
    for (const origin of devServer) {
      expectTaken(await ask({ through: 'the loopback listener', origin }), origin, `Origin ${origin} while not built for production`)
    }

    // THE SAME OFFICE BUILT FOR PRODUCTION, with a built page in a folder of its own, as tests/server-wiring.test.ts
    // builds one.
    const webDir = mkdtempSync(join(tmpdir(), 'mole-office-origins-web-'))
    writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Mole Office</title>')
    const { buildApp } = await import('../src/server/index.ts')
    const built = (await buildApp({ production: true, webDir, webAppUrl: settings().webAddress, logLevel: false })).app
    try {
      await built.listen({ host: '127.0.0.1', port: 0 })
      const builtsPort = (built.server.address() as AddressInfo).port
      for (const origin of devServer) {
        const answer = await ask({ through: 'the loopback listener', port: builtsPort, host: `127.0.0.1:${String(builtsPort)}`, origin })
        expectRefused(answer, `Origin ${origin} on an office built for production`)
      }
      // CONTROL: the built office's own origin is taken.
      const own = `http://127.0.0.1:${String(builtsPort)}`
      expectTaken(
        await ask({ through: 'the loopback listener', port: builtsPort, host: `127.0.0.1:${String(builtsPort)}`, origin: own }),
        own,
        `Origin ${own} on an office built for production`,
      )
    } finally {
      await built.close()
      rmSync(webDir, { recursive: true, force: true })
    }
  })

  it('4: refuses a loopback name on a port that is no listener\'s', async () => {
    // Item 10 of the starter's decision that set out SEC-1 and SEC-2: a page on another port of this machine is another program's page, not this office's.
    const nobodys = String(aPortThatIsNobodys())
    for (const listener of EVERY_LISTENER) {
      for (const origin of [`http://127.0.0.1:${nobodys}`, `http://localhost:${nobodys}`, `http://[::1]:${nobodys}`]) {
        expectRefused(await ask({ through: listener, origin }), `Origin ${origin} on ${listener}`)
      }
    }
  })
})

describe('a request whose Origin is not this office\'s is refused before any door', () => {
  it('5: refuses a write with an Origin of null, in English and in Chinese, writes nothing, and logs the kind of the Origin', async () => {
    // Item 5 of SEC-2's design: an Origin of null is never taken as missing. A sandboxed frame and a page opened from a
    // file send it, and neither is a page of this office.
    if (words === undefined) throw new Error('the words were not loaded')
    const check = await theOriginCheck()
    const before = counted()
    THE_LOG.clear()
    const refused = await ask({ through: 'the loopback listener', origin: 'null', path: '/api/records', method: 'POST', body: A_RECORD })
    expectRefused(refused, 'a record written with Origin null')
    expect(counted(), 'a refused write wrote something').toEqual(before)
    expect((await theRefusalLines()).map(theWordsOf)).toEqual([check.aRefusalsLogLine('null')])

    const english = theEnglish(refused)
    const chinese = words.createI18n('zh').t('server.originIsNotThisOffice', theValuesOf(refused))
    expect(chinese, 'the Chinese is the English, so no Chinese word was written').not.toBe(english)
    expect(chinese).toMatch(/\p{Script=Han}/u)
  })

  it('6: refuses a foreign Origin on a read, a write and a preflight, writes nothing, and never logs the Origin', async () => {
    const check = await theOriginCheck()
    // THIS DATABASE IS THE OFFICE WHILE THIS CASE RUNS, by the one rule in src/server/lib/office.ts: it holds a world
    // of kind home for itself. A fresh test database holds none, so it is a world, and under a test runner a world
    // reads no list of the office's pages. A world refuses a foreign Origin with the line that says it could not read
    // that list, and case 1 of tests/a-visiting-page-carries-no-half.test.ts reads that line. This case reads the
    // office's.
    const office = await import('../src/server/lib/office.ts')
    const itself = (await import('../src/server/lib/world.ts')).theWorldThisDatabaseIs()
    if (itself === null) throw new Error('this database has no identity, so it cannot be the office')
    const home = office.registerWorldHere({
      name: 'A made-up office',
      kind: 'home',
      startedBy: null,
      checkout: null,
      head: null,
      databaseIdentity: itself,
      address: `http://${itsOwnHost('the loopback listener')}`,
      addressForOtherMachines: null,
      standing: 'canonical',
      parentWorld: null,
      installation: 'a-made-up-installation',
    })
    expect(office.theOfficeIsInThisDatabase(), 'the home row did not make this database the office').toBe(true)
    const foreign: { origin: string; kind: import('../src/server/lib/an-origin-that-is-not-this-office.ts').TheKindOfAnOrigin; part: string }[] = [
      { origin: `https://${A_FOREIGN_NAME}`, kind: 'name', part: A_FOREIGN_NAME },
      { origin: `http://${A_FOREIGN_NUMBER}:8080`, kind: 'number', part: A_FOREIGN_NUMBER },
    ]
    try {
      for (const one of foreign) {
        for (const listener of EVERY_LISTENER) {
          const before = counted()
          THE_LOG.clear()
          expectRefused(await ask({ through: listener, origin: one.origin }), `a read with Origin ${one.origin} on ${listener}`)
          expectRefused(
            await ask({ through: listener, origin: one.origin, path: '/api/records', method: 'POST', body: A_RECORD }),
            `a write with Origin ${one.origin} on ${listener}`,
          )
          expectRefused(
            await ask({
              through: listener,
              origin: one.origin,
              path: '/api/records',
              method: 'OPTIONS',
              headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
            }),
            `a preflight with Origin ${one.origin} on ${listener}`,
          )
          expect(counted(), `a refused write with Origin ${one.origin} on ${listener} wrote something`).toEqual(before)
          const lines = await theRefusalLines()
          expect(lines.map(theWordsOf), `Origin ${one.origin} on ${listener}`).toEqual([1, 2, 3].map(() => check.aRefusalsLogLine(one.kind)))
          for (const line of lines) expect(line, `Origin ${one.origin} on ${listener}`).not.toContain(one.part)
        }
      }
    } finally {
      // CASES 7 AND 8 RUN ON THE DATABASE AS beforeAll LEFT IT, so the home row goes again.
      t?.client.sqlite.prepare('DELETE FROM worlds WHERE id = ?').run(home.id)
    }
  })

  it('7: answers a request with no Origin as before, a read and a write with a key alike', async () => {
    // Item 5 of SEC-2's design: no Origin is not a foreign Origin. The desktop apps, agents with their keys and the
    // sandboxes send none, and they go on as today.
    THE_LOG.clear()
    for (const listener of EVERY_LISTENER) {
      const read = await ask({ through: listener })
      expect(read.status, `a read with no Origin on ${listener}: ${read.body.slice(0, 300)}`).toBe(200)
      expect(read.headers['access-control-allow-origin'], `a read with no Origin on ${listener}`).toBeUndefined()
    }
    const before = counted()
    const write = await ask({
      through: 'the loopback listener',
      path: '/api/records',
      method: 'POST',
      body: A_RECORD,
      headers: {
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
        [KEY_HEADER]: thePersonsKeyHeader()[KEY_HEADER]!,
      },
    })
    expect(write.status, `a keyed write with no Origin: ${write.body.slice(0, 300)}`).toBe(201)
    expect(counted().records, 'the keyed write with no Origin wrote no record').toBe(before.records + 1)
    expect(await theRefusalLines(), 'a request with no Origin wrote a refusal line').toEqual([])
  })
})

describe('a plugin page\'s own files are the one door that takes an Origin of null', () => {
  it('8: answers GET and HEAD of a plugin page\'s file to an Origin of null as before, to any origin and with no cookie, and another door refuses it', async () => {
    // This stands on item 5 of SEC-2's design, that an Origin of null is never taken as missing, and on the starter's
    // decision on the names, which keeps the plugin file door apart: a plugin page runs in a sandboxed frame, whose
    // origin is null, and its module scripts and fonts are fetched with that origin. The files are the plugin's own and
    // carry nothing of the office, so the door answers any origin and reads no cookie. Every other door refuses null.
    for (const method of ['GET', 'HEAD'] as const) {
      for (const file of ['main.html', 'assets/app.js']) {
        const what = `${method} of the plugin's ${file} with Origin null`
        // AS THE FRAME ASKS: with no header of its own, because a sandboxed frame sends none.
        const answer = await ask({ through: 'the loopback listener', origin: 'null', method, path: `/api/plugins/${THE_PLUGIN}/files/${file}`, caller: {} })
        expect(answer.status, `${what}: ${answer.body.slice(0, 300)}`).toBe(200)
        expect(answer.headers['access-control-allow-origin'], what).toBe('*')
        expect(answer.headers['access-control-allow-credentials'], what).toBeUndefined()
        expect(answer.headers['set-cookie'], what).toBeUndefined()
        if (method === 'GET' && file === 'main.html') expect(answer.body, what).toContain('made-up clock page')
      }
    }
    // Another door of the same plugins, the list of them, refuses the same Origin.
    expectRefused(await ask({ through: 'the loopback listener', origin: 'null', path: '/api/plugins' }), 'the list of plugins with Origin null')
  })
})
